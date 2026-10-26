export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand === "heic" || brand === "heix" || brand === "mif1") return "image/heic";
  }
  return null;
}

export async function ensureValidFileMime(file: File): Promise<File> {
  if (file.type && file.type !== "application/octet-stream") {
    return file;
  }
  try {
    const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const detected = sniffImageMime(head);
    if (detected) {
      return new File([file], file.name || "image", {
        type: detected,
        lastModified: file.lastModified,
      });
    }
  } catch {
    // Ignore read failure
  }
  return file;
}

/**
 * Normalizes uploaded profile avatars and banners into fast, universally
 * decodable JPEG/PNG images (preserving animated GIFs) so mobile WebViews
 * never choke on AVIF/HEIC/untyped blobs or multi-megabyte raw camera photos.
 */
export async function normalizeImageFileForUpload(
  inputFile: File,
  maxDimension = 512,
): Promise<File> {
  const file = await ensureValidFileMime(inputFile);
  if (file.type === "image/gif") {
    return file;
  }

  try {
    let width = 0;
    let height = 0;
    let drawSource: CanvasImageSource | null = null;
    let closeBitmap: (() => void) | null = null;

    if (typeof createImageBitmap === "function") {
      try {
        const bmp = await createImageBitmap(file);
        width = bmp.width;
        height = bmp.height;
        drawSource = bmp;
        closeBitmap = () => bmp.close();
      } catch {
        drawSource = null;
      }
    }

    if (!drawSource) {
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.decoding = "async";
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("Image decode failed"));
          el.src = objectUrl;
        });
        width = img.naturalWidth || img.width;
        height = img.naturalHeight || img.height;
        drawSource = img;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    if (!drawSource || width <= 0 || height <= 0) {
      closeBitmap?.();
      return file;
    }

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      closeBitmap?.();
      return file;
    }
    ctx.drawImage(drawSource, 0, 0, targetW, targetH);
    closeBitmap?.();

    const keepPng = file.type === "image/png" || file.type === "image/webp";
    const outMime = keepPng ? "image/png" : "image/jpeg";
    const outExt = keepPng ? "png" : "jpg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outMime, keepPng ? undefined : 0.88),
    );
    if (!blob) return file;

    const stem = (file.name || "avatar").replace(/\.[^.]+$/, "");
    return new File([blob], `${stem}.${outExt}`, {
      type: outMime,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

const avatarBlobCache = new Map<string, Promise<string | null>>();

export function normalizeAvatarSrc(rawUrl?: string | null): string | undefined {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("http://") && !trimmed.startsWith("http://localhost") && !trimmed.startsWith("http://127.")) {
    return `https://${trimmed.slice("http://".length)}`;
  }
  return trimmed;
}

export function resolveFallbackAvatarBlobUrl(src: string): Promise<string | null> {
  const existing = avatarBlobCache.get(src);
  if (existing) return existing;

  const task = (async () => {
    try {
      const response = await fetch(src, {
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) return null;
      const bytes = new Uint8Array(buffer.slice(0, 32));
      const mime =
        sniffImageMime(bytes) ||
        response.headers.get("content-type")?.split(";")[0].trim() ||
        "image/jpeg";
      if (!mime.startsWith("image/")) return null;
      const blob = new Blob([buffer], { type: mime });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  })();

  avatarBlobCache.set(src, task);
  return task;
}
