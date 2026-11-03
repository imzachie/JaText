import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { decryptRemoteAttachmentToObjectUrl, getCachedDecryptedMediaUrl } from "../lib/e2ee/keystore";
import { useI18n } from "../lib/i18n";
import { resolveTursoMediaUrl } from "../lib/tursoClient";
import {
  markViewOnceMessageBurned,
  useOpenedViewOnceIds,
  type ViewOnceEnvelope,
  type ViewOnceMediaItem,
} from "../lib/viewOnce";
import { ViewOnceRingIcon } from "./ComposerPlusMenu";
import { VoiceNotePlayer } from "./VoiceNotePlayer";

function useResolvedViewOnceMedia(item?: ViewOnceMediaItem): {
  url: string | null;
  loading: boolean;
} {
  const [url, setUrl] = useState<string | null>(() => {
    if (!item) return null;
    const raw = resolveTursoMediaUrl(item.url) || item.url;
    if (!item.att) return raw;
    return getCachedDecryptedMediaUrl(raw, item.att) ?? null;
  });
  const [loading, setLoading] = useState<boolean>(() => Boolean(item && !url));

  useEffect(() => {
    if (!item) {
      setUrl(null);
      setLoading(false);
      return;
    }
    const raw = resolveTursoMediaUrl(item.url) || item.url;
    if (!item.att) {
      setUrl(raw);
      setLoading(false);
      return;
    }
    const cached = getCachedDecryptedMediaUrl(raw, item.att);
    if (cached) {
      setUrl(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    decryptRemoteAttachmentToObjectUrl(raw, item.att)
      .then((resolved) => {
        if (!cancelled) {
          setUrl(resolved);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  return { url, loading };
}

export function ViewOnceMessageBubble({
  messageId,
  senderName,
  envelope,
  mine,
}: {
  messageId: string;
  senderName: string;
  envelope: ViewOnceEnvelope;
  mine: boolean;
}) {
  const { t } = useI18n();
  const openedIds = useOpenedViewOnceIds();
  const isBurned = openedIds.has(messageId);
  const [viewerOpen, setViewerOpen] = useState(false);

  const handleCloseAndBurn = useCallback(() => {
    setViewerOpen(false);
    void markViewOnceMessageBurned(messageId);
  }, [messageId]);

  if (isBurned && !viewerOpen) {
    return (
      <div className={`jt-vo-bubble jt-vo-burned ${mine ? "is-mine" : "is-peer"}`}>
        <span className="jt-vo-icon burned" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
            <circle
              cx="12"
              cy="12"
              r="8.5"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeDasharray="3.2 3.2"
              opacity="0.7"
            />
          </svg>
        </span>
        <span className="jt-vo-burned-copy">
          {t("view_once_burned")}{" "}
          <a
            href="/view-once-privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="jt-vo-learn-link"
            onClick={(e) => e.stopPropagation()}
          >
            {t("learn_more")}
          </a>
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`jt-vo-bubble jt-vo-unopened ${mine ? "is-mine" : "is-peer"}`}
        onClick={(e) => {
          e.stopPropagation();
          if (typeof document !== "undefined") {
            const active = document.activeElement as HTMLElement | null;
            if (active && typeof active.blur === "function") {
              active.blur();
            }
          }
          setViewerOpen(true);
        }}
      >
        <span className="jt-vo-icon active">
          <ViewOnceRingIcon size={18} />
        </span>
        <span className="jt-vo-click-label">{t("click_to_view")}</span>
      </button>

      {viewerOpen && (
        <ViewOnceFullscreenViewer
          senderName={senderName}
          envelope={envelope}
          onClose={handleCloseAndBurn}
        />
      )}
    </>
  );
}

function ViewOnceFullscreenViewer({
  senderName,
  envelope,
  onClose,
}: {
  senderName: string;
  envelope: ViewOnceEnvelope;
  onClose: () => void;
}) {
  const photoState = useResolvedViewOnceMedia(envelope.photo);
  const audioState = useResolvedViewOnceMedia(envelope.audio);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const requestAnimatedClose = useCallback(() => {
    if (closeTimerRef.current !== null) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, 210);
  }, [onClose]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === "function") {
        active.blur();
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestAnimatedClose();
      }
    };
    const onPopState = () => {
      requestAnimatedClose();
    };
    window.history.pushState({ jatextViewOnce: true }, "");
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPopState);
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPopState);
    };
  }, [requestAnimatedClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`jt-vo-fullscreen-overlay ${isClosing ? "is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="View once message"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="jt-vo-fs-header">
        <button
          type="button"
          className="jt-vo-fs-nav-btn"
          onClick={requestAnimatedClose}
          aria-label="Back and close view once message"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="jt-vo-fs-meta">
          <span className="jt-vo-fs-pill">
            <ViewOnceRingIcon size={15} />
            <span>View once · {senderName}</span>
          </span>
          <small>Closing this screen permanently locks this message</small>
        </div>

        <button
          type="button"
          className="jt-vo-fs-nav-btn"
          onClick={requestAnimatedClose}
          aria-label="Close view once message"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <div className="jt-vo-fs-stage">
        {envelope.photo && (
          <div className="jt-vo-fs-photo-shell">
            {photoState.loading ? (
              <div className="jt-vo-fs-loading">Decrypting view-once photo…</div>
            ) : photoState.url ? (
              <img
                src={photoState.url}
                alt="View once"
                className="jt-vo-fs-photo"
                draggable={false}
              />
            ) : (
              <div className="jt-vo-fs-loading">Photo unavailable</div>
            )}
          </div>
        )}

        {envelope.audio && (
          <div className="jt-vo-fs-audio-card">
            {audioState.loading ? (
              <div className="jt-vo-fs-loading">Decrypting view-once audio…</div>
            ) : audioState.url ? (
              <VoiceNotePlayer
                messageId="view-once-audio"
                audioUrl={audioState.url}
                attachmentType={envelope.audio.mime}
                mine={false}
                showTranscript={false}
              />
            ) : (
              <div className="jt-vo-fs-loading">Audio unavailable</div>
            )}
          </div>
        )}

        {envelope.text && (
          <div className={`jt-vo-fs-text-card ${!envelope.photo && !envelope.audio ? "text-only" : ""}`}>
            <p>{envelope.text}</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
