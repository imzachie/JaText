import { useRef, useState } from "react";
import { WALLPAPER_PRESETS } from "../lib/chatCustomization";

async function optimizeWallpaperFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  // Keep GIFs untouched; compress large JPEGs/PNGs/HEIC-decoded bitmaps for fast sync.
  if (file.type === "image/gif" && file.size <= 7 * 1024 * 1024) {
    return file;
  }

  return new Promise<File>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 1600;
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim && file.size <= 1.8 * 1024 * 1024) {
        resolve(file);
        return;
      }
      const scale = Math.min(maxDim / width, maxDim / height, 1);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(
            new File([blob], "chat-wallpaper.jpg", {
              type: "image/jpeg",
              lastModified: Date.now(),
            }),
          );
        },
        "image/jpeg",
        0.86,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

export interface WallpaperChoice {
  kind: "preset" | "custom" | "none";
  presetId?: string;
  url?: string;
  file?: File;
}

export function WallpaperModal({
  currentWallpaperUrl,
  isGroup,
  onApply,
  onClose,
}: {
  currentWallpaperUrl: string | null;
  isGroup?: boolean;
  onApply: (choice: WallpaperChoice) => Promise<void>;
  onClose: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function animateClose() {
    if (busy || closing) return;
    setClosing(true);
    window.setTimeout(onClose, 185);
  }
  const [customPreview, setCustomPreview] = useState<{ file: File; previewUrl: string } | null>(
    null,
  );
  const [selectedPresetUrl, setSelectedPresetUrl] = useState<string | null>(currentWallpaperUrl);
  const [selectedKind, setSelectedKind] = useState<"preset" | "custom" | "none">(() => {
    if (!currentWallpaperUrl) return "none";
    const isPreset = WALLPAPER_PRESETS.some((p) => p.url === currentWallpaperUrl);
    return isPreset ? "preset" : "custom";
  });

  async function handleCustomFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const optimized = await optimizeWallpaperFile(file);
      if (customPreview) URL.revokeObjectURL(customPreview.previewUrl);
      const previewUrl = URL.createObjectURL(optimized);
      setCustomPreview({ file: optimized, previewUrl });
      setSelectedKind("custom");
      setSelectedPresetUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load image.");
    }
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      if (selectedKind === "none") {
        await onApply({ kind: "none" });
      } else if (selectedKind === "custom") {
        if (customPreview) {
          await onApply({ kind: "custom", file: customPreview.file });
        } else if (currentWallpaperUrl) {
          onClose();
          return;
        }
      } else if (selectedKind === "preset" && selectedPresetUrl) {
        const preset = WALLPAPER_PRESETS.find((p) => p.url === selectedPresetUrl);
        await onApply({
          kind: "preset",
          presetId: preset?.id,
          url: selectedPresetUrl,
        });
      }
      if (customPreview) URL.revokeObjectURL(customPreview.previewUrl);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update chat wallpaper.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`modal-backdrop wallpaper-backdrop ${closing ? "is-closing" : ""}`}
      onClick={animateClose}
      role="dialog"
      aria-modal="true"
      aria-label="Chat wallpaper"
    >
      <div className={`wallpaper-sheet ${closing ? "is-closing" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="bubble-style-handle-wrap" onClick={animateClose}>
          <span className="bubble-style-handle" />
        </div>

        <div className="wallpaper-sheet-header">
          <div>
            <h3 className="bubble-style-title">Chat wallpaper</h3>
            <p className="bubble-style-subtitle">
              {isGroup
                ? "Shared mobile wallpaper for everyone in this group."
                : "Shared mobile wallpaper — both of you will see this background."}
            </p>
          </div>
          {currentWallpaperUrl || selectedKind !== "none" ? (
            <button
              type="button"
              className="ghost-btn small"
              disabled={busy}
              onClick={() => {
                setSelectedKind("none");
                setSelectedPresetUrl(null);
              }}
            >
              Reset
            </button>
          ) : null}
        </div>

        {error ? <div className="form-error">{error}</div> : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void handleCustomFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div className="wallpaper-grid">
          {/* Option 7 / Custom photo uploader tile */}
          <button
            type="button"
            className={`wallpaper-tile wallpaper-custom-tile ${
              selectedKind === "custom" ? "selected" : ""
            }`}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {customPreview?.previewUrl ||
            (selectedKind === "custom" &&
              currentWallpaperUrl &&
              !WALLPAPER_PRESETS.some((p) => p.url === currentWallpaperUrl)) ? (
              <img
                src={customPreview?.previewUrl ?? currentWallpaperUrl ?? ""}
                alt="Custom wallpaper"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <div className="wallpaper-custom-overlay">
              <span className="wallpaper-custom-plus">🖼️</span>
              <span className="wallpaper-custom-title">Custom image</span>
              <span className="wallpaper-custom-sub">Choose photo</span>
            </div>
            {selectedKind === "custom" ? <span className="wallpaper-check">✓</span> : null}
          </button>

          {/* Options 1–6: Exact 6 Preset Wallpapers */}
          {WALLPAPER_PRESETS.map((preset, index) => {
            const isSelected = selectedKind === "preset" && selectedPresetUrl === preset.url;
            return (
              <button
                key={preset.id}
                type="button"
                className={`wallpaper-tile ${isSelected ? "selected" : ""}`}
                disabled={busy}
                onClick={() => {
                  setSelectedKind("preset");
                  setSelectedPresetUrl(preset.url);
                }}
              >
                <img
                  src={preset.url}
                  alt={`Wallpaper ${index + 1}`}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
                <div className="wallpaper-mini-bubbles" aria-hidden="true">
                  <span className="wp-mini-them" />
                  <span className="wp-mini-me" />
                </div>
                {isSelected ? <span className="wallpaper-check">✓</span> : null}
              </button>
            );
          })}
        </div>

        <div className="bubble-style-footer">
          <button
            type="button"
            className="bubble-style-cancel-btn"
            disabled={busy}
            onClick={animateClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="bubble-style-save-btn"
            disabled={busy}
            onClick={() => void handleConfirm()}
          >
            {busy ? "Applying…" : "Set wallpaper"}
          </button>
        </div>
      </div>
    </div>
  );
}
