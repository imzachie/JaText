import { useEffect, useState } from "react";

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

export function sniffMediaMime(bytes: Uint8Array): string | null {
  const img = sniffImageMime(bytes);
  if (img) return img;

  // RIFF containers (WAV / AVI)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    if (bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
      return "audio/wav";
    }
    if (bytes[8] === 0x41 && bytes[9] === 0x56 && bytes[10] === 0x49 && bytes[11] === 0x20) {
      return "video/x-msvideo";
    }
  }
  // ISO BMFF (MP4 / MOV / M4A / 3GP): .... 'ftyp'
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "M4A " || brand === "M4B " || brand === "F4A ") return "audio/mp4";
    if (brand === "qt  ") return "video/quicktime";
    return "video/mp4";
  }
  // WebM / Matroska EBML: 1A 45 DF A3
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  // OGG / Opus: 'OggS'
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return "audio/ogg";
  }
  // FLAC: 'fLaC'
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    return "audio/flac";
  }
  // MP3 / AAC ADTS: 'ID3' or MPEG frame sync
  if (
    (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes.length >= 2 &&
      bytes[0] === 0xff &&
      (bytes[1] & 0xe0) === 0xe0 &&
      (bytes[1] & 0x06) !== 0)
  ) {
    return "audio/mpeg";
  }
  return null;
}

function guessMimeFromFilename(name?: string): string | null {
  if (!name) return null;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/webm",
    "3gp": "video/3gpp",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    opus: "audio/ogg",
    flac: "audio/flac",
  };
  return map[ext] ?? null;
}

/**
 * Losslessly ensures any GIF87a/GIF89a binary has a NETSCAPE2.0 (or ANIMEXTS1.0)
 * Application Extension with loop count = 0 (infinite loop) so animated PFPs,
 * Group PFPs, Profile Banners, and Chat Wallpapers never freeze after playing once.
 */
export function ensureInfiniteLoopGifBytes(bytes: Uint8Array): Uint8Array {
  if (
    bytes.length < 14 ||
    bytes[0] !== 0x47 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x38
  ) {
    return bytes;
  }

  const packed = bytes[10];
  const hasGct = (packed & 0x80) !== 0;
  const gctSize = hasGct ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
  const insertOffset = 13 + gctSize;
  if (insertOffset > bytes.length) return bytes;

  for (let i = insertOffset; i + 18 < bytes.length; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xff && bytes[i + 2] === 0x0b) {
      let id = "";
      for (let k = 0; k < 11; k++) {
        id += String.fromCharCode(bytes[i + 3 + k]);
      }
      if (
        (id === "NETSCAPE2.0" || id === "ANIMEXTS1.0") &&
        bytes[i + 14] === 0x03 &&
        bytes[i + 15] === 0x01
      ) {
        if (bytes[i + 16] === 0x00 && bytes[i + 17] === 0x00) {
          return bytes;
        }
        const patched = new Uint8Array(bytes);
        patched[4] = 0x39; // '9'
        patched[5] = 0x61; // 'a'
        patched[i + 16] = 0x00;
        patched[i + 17] = 0x00;
        return patched;
      }
    }
  }

  const netscapeExt = new Uint8Array([
    0x21, 0xff, 0x0b,
    0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
    0x03, 0x01, 0x00, 0x00, 0x00,
  ]);
  const out = new Uint8Array(bytes.length + netscapeExt.length);
  out.set(bytes.subarray(0, insertOffset), 0);
  out[4] = 0x39; // '9'
  out[5] = 0x61; // 'a'
  out.set(netscapeExt, insertOffset);
  out.set(bytes.subarray(insertOffset), insertOffset + netscapeExt.length);
  return out;
}

export async function isAnimatedOrGifFile(file: File): Promise<boolean> {
  if (file.type === "image/gif" || /\.gif$/i.test(file.name || "")) {
    return true;
  }
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    return sniffImageMime(head) === "image/gif";
  } catch {
    return false;
  }
}

export async function ensureInfiniteLoopGifFile(file: File): Promise<File> {
  try {
    const raw = new Uint8Array(await file.arrayBuffer());
    if (sniffImageMime(raw) !== "image/gif") return file;
    const patched = ensureInfiniteLoopGifBytes(raw);
    const stem = (file.name || "animated").replace(/\.[^.]+$/, "");
    const safeBytes = new Uint8Array(patched.byteLength);
    safeBytes.set(patched);
    return new File([safeBytes], `${stem}.gif`, {
      type: "image/gif",
      lastModified: file.lastModified || Date.now(),
    });
  } catch {
    return file;
  }
}

export async function ensureValidFileMime(file: File): Promise<File> {
  try {
    const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const magicMime = sniffMediaMime(head);
    if (magicMime === "image/gif") {
      return ensureInfiniteLoopGifFile(file);
    }
    if (file.type && file.type !== "application/octet-stream") {
      if (magicMime && magicMime.startsWith("image/") && file.type !== magicMime) {
        const stem = (file.name || "attachment").replace(/\.[^.]+$/, "");
        const ext = magicMime === "image/png" ? "png" : magicMime === "image/webp" ? "webp" : "jpg";
        return new File([file], `${stem}.${ext}`, {
          type: magicMime,
          lastModified: file.lastModified || Date.now(),
        });
      }
      return file;
    }
    const detected = magicMime ?? guessMimeFromFilename(file.name);
    if (detected) {
      const defaultExt: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "video/webm": ".webm",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
        "audio/wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac",
      };
      const baseName = file.name || "attachment";
      const safeName = baseName.includes(".") ? baseName : `${baseName}${defaultExt[detected] ?? ""}`;
      return new File([file], safeName, {
        type: detected,
        lastModified: file.lastModified || Date.now(),
      });
    }
  } catch {
    // Ignore read failure
  }
  return file;
}

/**
 * Normalizes uploaded profile avatars and banners into fast, universally
 * decodable JPEG/PNG images while strictly preserving animated GIFs (patched
 * for continuous infinite looping) so GIF PFPs, Group PFPs, and Profile Banners
 * never lose frames.
 */
export async function normalizeImageFileForUpload(
  inputFile: File,
  maxDimension = 512,
): Promise<File> {
  if (await isAnimatedOrGifFile(inputFile)) {
    return ensureInfiniteLoopGifFile(inputFile);
  }
  const file = await ensureValidFileMime(inputFile);
  if (file.type === "image/gif") {
    return ensureInfiniteLoopGifFile(file);
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
const animatedUpgradePromiseCache = new Map<string, Promise<string | null>>();
const animatedUpgradeSyncCache = new Map<string, string | null>();
const MEDIA_RANGE_SLICE_BYTES = Math.floor(3.8 * 1024 * 1024);
const MAX_REASSEMBLED_IMAGE_BYTES = 32 * 1024 * 1024;

export function normalizeAvatarSrc(rawUrl?: string | null): string | undefined {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("http://") && !trimmed.startsWith("http://localhost") && !trimmed.startsWith("http://127.")) {
    return `https://${trimmed.slice("http://".length)}`;
  }
  return trimmed;
}

async function fetchCompleteImagePayload(
  src: string,
): Promise<{ bytes: Uint8Array; mime: string; wasPartial: boolean } | null> {
  try {
    const isSameOriginApi =
      src.startsWith("/") ||
      (typeof window !== "undefined" && src.startsWith(window.location.origin));
    const response = await fetch(src, {
      mode: isSameOriginApi ? "same-origin" : "cors",
      credentials: isSameOriginApi ? "same-origin" : "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) return null;

    const firstBuf = new Uint8Array(await response.arrayBuffer());
    if (firstBuf.byteLength === 0) return null;

    let fullBytes = firstBuf;
    let wasPartial = false;

    if (response.status === 206) {
      const contentRange = response.headers.get("content-range") || "";
      const match = /^bytes\s+(\d+)-(\d+)\/(\d+)/i.exec(contentRange.trim());
      if (match) {
        const firstEnd = Number(match[2]);
        const totalSize = Number(match[3]);
        if (
          Number.isFinite(totalSize) &&
          totalSize > firstEnd + 1 &&
          totalSize <= MAX_REASSEMBLED_IMAGE_BYTES
        ) {
          wasPartial = true;
          const assembled = new Uint8Array(totalSize);
          assembled.set(firstBuf.subarray(0, Math.min(firstBuf.byteLength, totalSize)), 0);
          let cursor = firstEnd + 1;
          while (cursor < totalSize) {
            const reqEnd = Math.min(totalSize - 1, cursor + MEDIA_RANGE_SLICE_BYTES - 1);
            const sliceRes = await fetch(src, {
              headers: { Range: `bytes=${cursor}-${reqEnd}` },
              mode: isSameOriginApi ? "same-origin" : "cors",
              credentials: isSameOriginApi ? "same-origin" : "omit",
              referrerPolicy: "no-referrer",
            });
            if (!sliceRes.ok) break;
            const sliceBytes = new Uint8Array(await sliceRes.arrayBuffer());
            if (sliceBytes.byteLength === 0) break;
            const copyLen = Math.min(sliceBytes.byteLength, totalSize - cursor);
            assembled.set(sliceBytes.subarray(0, copyLen), cursor);
            cursor += copyLen;
          }
          if (cursor >= totalSize) {
            fullBytes = assembled;
          }
        }
      }
    }

    const mime =
      sniffImageMime(fullBytes.subarray(0, 32)) ||
      response.headers.get("content-type")?.split(";")[0].trim() ||
      "image/jpeg";
    if (!mime.startsWith("image/")) return null;

    const normalizedBytes =
      mime === "image/gif" ? ensureInfiniteLoopGifBytes(fullBytes) : fullBytes;
    return { bytes: normalizedBytes, mime, wasPartial };
  } catch {
    return null;
  }
}

function toSafeBlobUrl(bytes: Uint8Array, mime: string): string {
  const safeCopy = new Uint8Array(bytes.byteLength);
  safeCopy.set(bytes);
  return URL.createObjectURL(new Blob([safeCopy], { type: mime }));
}

export function resolveFallbackAvatarBlobUrl(src: string): Promise<string | null> {
  const existing = avatarBlobCache.get(src);
  if (existing) return existing;

  const task = (async () => {
    const payload = await fetchCompleteImagePayload(src);
    if (!payload) return null;
    const blobUrl = toSafeBlobUrl(payload.bytes, payload.mime);
    animatedUpgradeSyncCache.set(src, blobUrl);
    return blobUrl;
  })();

  avatarBlobCache.set(src, task);
  return task;
}

function resolveAnimatedMediaUpgrade(src: string): Promise<string | null> {
  const existing = animatedUpgradePromiseCache.get(src);
  if (existing) return existing;

  const task = (async () => {
    const payload = await fetchCompleteImagePayload(src);
    if (!payload) {
      animatedUpgradeSyncCache.set(src, null);
      return null;
    }
    if (payload.mime === "image/gif" || payload.wasPartial) {
      const blobUrl = toSafeBlobUrl(payload.bytes, payload.mime);
      animatedUpgradeSyncCache.set(src, blobUrl);
      return blobUrl;
    }
    animatedUpgradeSyncCache.set(src, null);
    return null;
  })();

  animatedUpgradePromiseCache.set(src, task);
  return task;
}

/**
 * Resolves any PFP, Group PFP, Profile Banner, or Chat Wallpaper URL so that:
 *  - Animated GIFs of ANY size (including > 4 MB chunked /api/media blobs) are
 *    reassembled completely and patched with NETSCAPE2.0 infinite loop = 0.
 *  - Static PNG/JPEG assets render immediately without extra blob allocations.
 */
export function useAnimatedMediaSrc(rawUrl?: string | null): string | undefined {
  const normalized = normalizeAvatarSrc(rawUrl);
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(() => {
    if (!normalized) return undefined;
    if (animatedUpgradeSyncCache.has(normalized)) {
      return animatedUpgradeSyncCache.get(normalized) || normalized;
    }
    return normalized;
  });

  useEffect(() => {
    if (!normalized) {
      setResolvedSrc(undefined);
      return;
    }
    if (
      normalized.startsWith("blob:") ||
      normalized.startsWith("data:") ||
      /^\/preset-wallpaper-\d+\./i.test(normalized)
    ) {
      setResolvedSrc(normalized);
      return;
    }
    if (animatedUpgradeSyncCache.has(normalized)) {
      setResolvedSrc(animatedUpgradeSyncCache.get(normalized) || normalized);
      return;
    }

    setResolvedSrc(normalized);
    let cancelled = false;
    void resolveAnimatedMediaUpgrade(normalized).then((upgradedBlobUrl) => {
      if (cancelled) return;
      if (upgradedBlobUrl) {
        setResolvedSrc(upgradedBlobUrl);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [normalized]);

  return resolvedSrc ?? normalized;
}
