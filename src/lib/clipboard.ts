import { Capacitor } from "@capacitor/core";
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
      // Fall back to WebView Clipboard API if native bridge fails.
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
    // Older browsers only accept a resolved Blob in ClipboardItem rather than Promise<Blob>.
    if (err instanceof TypeError) {
      const pngBlob = await pngPromise;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      return;
    }
    throw err;
  }
}
