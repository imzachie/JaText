import { useEffect, useRef } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { JaTextNative } from "./nativeBridge";

async function blobToPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, bitmap.width);
      canvas.height = Math.max(1, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        throw new Error("Could not prepare image canvas.");
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (png) => (png ? resolve(png) : reject(new Error("Couldn't convert image to PNG."))),
          "image/png",
        );
      });
    } catch {
      // Fall through to HTMLImageElement decoder below.
    }
  }

  return await new Promise<Blob>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, img.naturalWidth || img.width);
      canvas.height = Math.max(1, img.naturalHeight || img.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not prepare image canvas."));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (png) => (png ? resolve(png) : reject(new Error("Couldn't convert image to PNG."))),
        "image/png",
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't decode image for clipboard."));
    };
    img.src = objectUrl;
  });
}

async function fetchAsPngBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Couldn't load the image.");
  const rawBlob = await response.blob();
  return blobToPngBlob(rawBlob);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Couldn't encode image."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Copies any image URL (JPEG, WebP, GIF, AVIF, PNG) to the system clipboard by
 * transcoding non-PNG formats to `image/png` (required by Chromium/WebKit Clipboard API),
 * with native Android `ClipboardManager` + `FileProvider` support in the APK.
 */
export async function copyImageUrlToClipboard(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const pngBlob = await fetchAsPngBlob(url);
    try {
      const base64 = await blobToBase64(pngBlob);
      await JaTextNative.copyImageBase64({ base64 });
      return;
    } catch {
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
        return;
      }
      throw new Error("Couldn't copy the image.");
    }
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Copying images isn't supported by this browser.");
  }

  const pngPromise = fetchAsPngBlob(url);
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngPromise })]);
  } catch (err) {
    if (err instanceof TypeError) {
      const pngBlob = await pngPromise;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      return;
    }
    throw err;
  }
}

function normalizePastedFile(rawFile: File): File {
  const mime = rawFile.type || "image/png";
  const ext =
    mime === "image/jpeg" || mime === "image/jpg"
      ? "jpg"
      : mime === "image/gif"
        ? "gif"
        : mime === "image/webp"
          ? "webp"
          : mime.startsWith("image/")
            ? "png"
            : "";
  const needsFreshName =
    !rawFile.name ||
    rawFile.name === "image.png" ||
    rawFile.name === "image.jpg" ||
    rawFile.name === "blob";
  if (!needsFreshName) {
    return rawFile;
  }
  const generatedName = ext ? `pasted-${Date.now()}.${ext}` : `pasted-${Date.now()}`;
  return new File([rawFile], generatedName, {
    type: mime,
    lastModified: Date.now(),
  });
}

export function extractClipboardFile(
  clipboardData: DataTransfer | null | undefined,
): File | null {
  if (!clipboardData) return null;

  const items = Array.from(clipboardData.items ?? []);
  const imageItem = items.find(
    (item) => item.kind === "file" && item.type.startsWith("image/"),
  );
  if (imageItem) {
    const f = imageItem.getAsFile();
    if (f) return normalizePastedFile(f);
  }

  const anyFileItem = items.find((item) => item.kind === "file");
  if (anyFileItem) {
    const f = anyFileItem.getAsFile();
    if (f) return normalizePastedFile(f);
  }

  const files = Array.from(clipboardData.files ?? []);
  const imageFile = files.find((f) => f.type.startsWith("image/")) ?? files[0];
  return imageFile ? normalizePastedFile(imageFile) : null;
}

export function base64ToFile(
  base64: string,
  mimeType: string,
  fileName: string,
): File {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName || `pasted-${Date.now()}.png`, {
    type: mimeType || "image/png",
    lastModified: Date.now(),
  });
}

/**
 * Listens for both:
 * 1) Android Gboard / native keyboard rich-content image commits (via JaTextWebView -> JaTextNative)
 * 2) Global PC / Mobile Web paste events when viewing the active chat (even if the composer textarea
 *    wasn't explicitly focused before pressing Ctrl+V / Cmd+V).
 */
export function useChatImagePaste(
  onPasteFile: (file: File) => void,
  enabled = true,
): void {
  const callbackRef = useRef(onPasteFile);
  useEffect(() => {
    callbackRef.current = onPasteFile;
  }, [onPasteFile]);

  useEffect(() => {
    if (!enabled) return;
    let nativeHandle: PluginListenerHandle | null = null;
    let cancelled = false;

    if (Capacitor.isNativePlatform()) {
      void JaTextNative.addListener("richContentPaste", (ev) => {
        if (cancelled || !ev?.base64) return;
        try {
          const file = base64ToFile(ev.base64, ev.mimeType, ev.fileName);
          callbackRef.current(file);
        } catch {
          // Ignore malformed clipboard payload
        }
      })
        .then((handle) => {
          if (cancelled) {
            void handle.remove();
          } else {
            nativeHandle = handle;
          }
        })
        .catch(() => undefined);
    }

    const handleWindowPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      const file = extractClipboardFile(event.clipboardData);
      if (!file) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA") &&
        target.closest(".modal-card, .sidebar")
      ) {
        return;
      }
      event.preventDefault();
      callbackRef.current(file);
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => {
      cancelled = true;
      window.removeEventListener("paste", handleWindowPaste);
      if (nativeHandle) {
        void nativeHandle.remove();
      }
    };
  }, [enabled]);
}
