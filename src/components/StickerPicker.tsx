import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { friendlyError } from "../lib/errors";
import { useJaText } from "../lib/store";
import type { StickerMedia } from "../lib/types";
import { CloseIcon, ImageIcon, PlusIcon, StarIcon } from "./UiIcons";

type PickerTab = "favorites" | "recent" | "klipy" | "upload";

const tabs: { id: PickerTab; label: string }[] = [
  { id: "favorites", label: "Favourites" },
  { id: "recent", label: "Top used" },
  { id: "klipy", label: "Klipy GIFs" },
  { id: "upload", label: "Upload your own!" },
];

export function StickerPicker({
  friendId,
  disabled = false,
  onSelect,
  onSent,
}: {
  friendId: string;
  disabled?: boolean;
  onSelect?: (sticker: StickerMedia) => Promise<void>;
  onSent?: () => void;
}) {
  const store = useJaText();
  const searchKlipy = store.searchKlipy;
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [tab, setTab] = useState<PickerTab>("favorites");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<StickerMedia[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [savedUpload, setSavedUpload] = useState<StickerMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [klipyNotice, setKlipyNotice] = useState<string | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const closePicker = useCallback(() => {
    if (!open || closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimerRef.current = null;
    }, 160);
  }, [closing, open]);

  const openPicker = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setClosing(false);
    setOpen(true);
    setError(null);
    setSearching(tab === "klipy");
  }, [tab]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !anchorRef.current?.contains(event.target) &&
        !panelRef.current?.contains(event.target)
      ) {
        closePicker();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [closePicker, open]);

  useEffect(() => {
    if (!open || tab !== "klipy") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchKlipy(search)
        .then((res) => {
          if (cancelled) return;
          setResults(Array.isArray(res?.results) ? res.results : []);
          setKlipyNotice(res?.error && !res.results.length ? res.error : null);
        })
        .catch((cause: unknown) => {
          if (!cancelled)
            setError(friendlyError(cause, "Couldn't load Klipy GIFs. Please try again."));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, search.trim() ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search, searchKlipy, tab]);

  async function send(sticker: StickerMedia) {
    setSendingKey(sticker.key);
    setError(null);
    try {
      if (onSelect) await onSelect(sticker);
      else await store.sendSticker(friendId, sticker);
      onSent?.();
      closePicker();
    } catch (cause) {
      setError(friendlyError(cause, "Couldn't send this sticker. Please try again."));
    } finally {
      setSendingKey(null);
    }
  }

  async function toggleFavorite(sticker: StickerMedia, isFavorite: boolean) {
    setError(null);
    try {
      await store.setStickerFavorite(sticker, !isFavorite);
    } catch (cause) {
      setError(friendlyError(cause, "Couldn't update your favourites."));
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setError(null);
    setSavedUpload(null);
    if (!file) {
      setUploadFile(null);
      return;
    }
    if (
      !file.type.startsWith("image/") &&
      !/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name)
    ) {
      setError("Choose an image, GIF, or sticker file.");
      setUploadFile(null);
      return;
    }
    const maxSize = store.mode === "demo" ? 1024 * 1024 : 4 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(
        store.mode === "demo"
          ? "Demo uploads must be 1 MB or smaller."
          : "Images and GIFs must be 4 MB or smaller.",
      );
      setUploadFile(null);
      return;
    }
    setUploadFile(file);
  }

  async function saveUpload(sendNow: boolean) {
    if (!uploadFile) return;
    setError(null);
    setSearching(true);
    try {
      const saved = savedUpload ?? (await store.saveSticker(uploadFile));
      setSavedUpload(saved);
      if (sendNow) {
        if (onSelect) await onSelect(saved);
        else await store.sendSticker(friendId, saved);
        onSent?.();
        closePicker();
      }
    } catch (cause) {
      setError(friendlyError(cause, "Couldn't upload this image. Please try again."));
    } finally {
      setSearching(false);
    }
  }

  const visibleItems =
    tab === "favorites"
      ? store.stickerFavorites
      : tab === "recent"
        ? store.recentStickers
        : results;

  return (
    <div className="sticker-picker-anchor" ref={anchorRef}>
      <button
        type="button"
        className={`icon-btn sticker-trigger ${open ? "active" : ""}`}
        title="GIFs and stickers"
        aria-label="Open GIF and sticker picker"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (open) closePicker();
          else openPicker();
        }}
      >
        GIF
      </button>
      {open && (
        <section
          ref={panelRef}
          className={`sticker-picker ${closing ? "closing" : ""}`}
          aria-label="GIF and sticker picker"
        >
          <header className="sticker-picker-header">
            <strong>GIFs &amp; stickers</strong>
            <button
              type="button"
              className="mini-btn"
              aria-label="Close sticker picker"
              onClick={closePicker}
            >
              <CloseIcon size={14} />
            </button>
          </header>
          <nav className="sticker-tabs" aria-label="Sticker collections">
            {tabs.map((item) => (
              <button
                type="button"
                key={item.id}
                className={tab === item.id ? "active" : ""}
                onClick={() => {
                  setTab(item.id);
                  setError(null);
                  setSearching(item.id === "klipy");
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {tab === "klipy" && (
            <input
              className="sticker-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setResults([]);
                setSearching(true);
                setError(null);
                setKlipyNotice(null);
              }}
              placeholder="Search Klipy GIFs..."
              aria-label="Search Klipy GIFs"
            />
          )}

          {tab === "upload" ? (
            <div className="sticker-upload">
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={onFileChange}
              />
              {uploadFile ? (
                <>
                  {savedUpload ? (
                    <img
                      className="sticker-upload-preview"
                      src={savedUpload.url}
                      alt="Selected sticker preview"
                    />
                  ) : (
                    <div className="sticker-upload-placeholder" aria-hidden="true">
                      <ImageIcon size={28} />
                    </div>
                  )}
                  <strong>{uploadFile.name}</strong>
                  <div className="sticker-upload-actions">
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={searching || savedUpload !== null}
                      onClick={() => void saveUpload(false)}
                    >
                      {savedUpload ? "Saved to favourites" : "Save to favourites"}
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={searching}
                      onClick={() => void saveUpload(true)}
                    >
                      {searching ? "Uploading..." : "Send & save"}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="sticker-upload-select"
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <span aria-hidden="true">
                    <PlusIcon size={22} />
                  </span>
                  <strong>Choose an image or GIF</strong>
                  <small>
                    JPG, PNG, GIF, WebP and more · up to{" "}
                    {store.mode === "demo" ? "1 MB" : "4 MB"}
                  </small>
                </button>
              )}
              {uploadFile && (
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => {
                    setUploadFile(null);
                    setSavedUpload(null);
                  }}
                >
                  Choose a different file
                </button>
              )}
            </div>
          ) : (
            <>
              {tab === "klipy" && (
                <p className="klipy-attribution">GIFs by KLIPY</p>
              )}
              {searching && <p className="sticker-empty">Loading...</p>}
              {!searching && !error && !!klipyNotice && tab === "klipy" && (
                <p className="sticker-empty">{klipyNotice}</p>
              )}
              {!searching && !error && !(klipyNotice && tab === "klipy") && visibleItems.length === 0 && (
                <p className="sticker-empty">
                  {tab === "klipy"
                    ? search.trim()
                      ? `No GIFs found for "${search.trim()}". Try another search.`
                      : "No trending GIFs are available."
                    : tab === "favorites"
                      ? "Your favourites will show up here."
                      : "Stickers and GIFs you send will show up here."}
                </p>
              )}
              {!!visibleItems.length && (
                <div className="sticker-grid">
                  {visibleItems.map((sticker) => {
                    const isFavorite =
                      sticker.isFavorite ||
                      store.stickerFavorites.some((item) => item.key === sticker.key);
                    return (
                      <div className="sticker-tile" key={sticker.key}>
                        <button
                          type="button"
                          className="sticker-send"
                          title={`Send ${sticker.name}`}
                          disabled={sendingKey === sticker.key}
                          onClick={() => void send(sticker)}
                        >
                          <img
                            src={sticker.previewUrl ?? sticker.url}
                            alt={sticker.name}
                            loading="lazy"
                          />
                        </button>
                        <button
                          type="button"
                          className={`sticker-favorite ${isFavorite ? "selected" : ""}`}
                          aria-label={
                            isFavorite
                              ? `Remove ${sticker.name} from favourites`
                              : `Add ${sticker.name} to favourites`
                          }
                          title={isFavorite ? "Remove from favourites" : "Add to favourites"}
                          onClick={() => void toggleFavorite(sticker, isFavorite)}
                        >
                          <StarIcon size={13} filled={isFavorite} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {error && <p className="sticker-error" role="alert">{error}</p>}
          <footer className="sticker-picker-footer">GIFs by KLIPY</footer>
        </section>
      )}
    </div>
  );
}
