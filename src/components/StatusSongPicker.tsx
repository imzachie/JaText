import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MAX_STATUS_AUDIO_MS,
  STATUS_SONGS,
  formatClock,
  maxStartMs,
  playWindow,
  type StatusSong,
} from "../lib/statusSongs";
import { PauseIcon, PlayIcon } from "./UiIcons";
import { IosCloseIcon } from "./IosVectorIcons";

/**
 * One preview player at a time, shared by whichever row asked for it, so
 * tapping a second song stops the first instead of layering two tracks.
 */
function usePreviewPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.src = "";
    }
    audioRef.current = null;
  }, []);

  const play = useCallback(
    (audioUrl: string, startMs: number, lengthMs: number) => {
      stop();
      const el = new Audio(audioUrl);
      el.volume = 0.85;
      el.preload = "auto";
      audioRef.current = el;
      const begin = () => {
        try {
          el.currentTime = Math.max(0, startMs / 1000);
        } catch {
          // Some browsers refuse a seek before metadata lands, onLoaded covers it.
        }
        void el.play().catch(() => undefined);
      };
      if (el.readyState >= 1) begin();
      else el.addEventListener("loadedmetadata", begin, { once: true });
      // Stop exactly where the Status clip would stop.
      el.addEventListener("timeupdate", () => {
        if (el.currentTime >= (startMs + lengthMs) / 1000) {
          el.pause();
        }
      });
      return el;
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { play, stop, audioRef };
}

/* ------------------------------------------------------------------ */
/* The songs list                                                      */
/* ------------------------------------------------------------------ */

interface SongPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onPick: (song: StatusSong) => void;
}

export function SongPickerSheet({ open, onClose, onPick }: SongPickerSheetProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { play, stop } = usePreviewPlayer();

  useEffect(() => {
    if (!open) {
      stop();
      setPlayingId(null);
    }
  }, [open, stop]);

  if (!open) return null;

  const handleRow = (song: StatusSong) => {
    if (playingId === song.id) {
      stop();
      setPlayingId(null);
      return;
    }
    play(song.audioUrl, song.previewStartMs, MAX_STATUS_AUDIO_MS);
    setPlayingId(song.id);
  };

  return createPortal(
    <div className="jt-sheet-backdrop" onClick={onClose}>
      <div
        className="jt-sheet jt-song-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Songs"
      >
        <div className="jt-sheet-head">
          <div>
            <h3>Songs</h3>
            <p>Tap a song to hear it, then pick the part you want.</p>
          </div>
          <button type="button" className="jt-sheet-close" onClick={onClose} aria-label="Close">
            <IosCloseIcon size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="jt-song-list">
          {STATUS_SONGS.map((song, index) => {
            const isPlaying = playingId === song.id;
            return (
              <div key={song.id} className={`jt-song-row ${isPlaying ? "is-playing" : ""}`}>
                <button
                  type="button"
                  className="jt-song-row-main"
                  onClick={() => handleRow(song)}
                >
                  <span className="jt-song-index">
                    {isPlaying ? <PauseIcon size={13} /> : index + 1}
                  </span>
                  <span className="jt-song-cover-wrap">
                    <img src={song.coverUrl} alt="" draggable={false} />
                    {isPlaying ? (
                      <span className="jt-song-cover-veil">
                        <PauseIcon size={16} />
                      </span>
                    ) : null}
                  </span>
                  <span className="jt-song-copy">
                    <strong>{song.title}</strong>
                    <span>{song.artist}</span>
                  </span>
                  <span className="jt-song-duration">{formatClock(song.durationMs)}</span>
                </button>
                <button
                  type="button"
                  className="jt-song-use-btn"
                  onClick={() => {
                    stop();
                    setPlayingId(null);
                    onPick(song);
                  }}
                >
                  Use
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* The "where should it start" trimmer                                  */
/* ------------------------------------------------------------------ */

interface SongTrimSheetProps {
  open: boolean;
  title: string;
  artist?: string;
  coverUrl?: string | null;
  audioUrl: string;
  durationMs: number;
  initialStartMs: number;
  onCancel: () => void;
  onConfirm: (startMs: number, lengthMs: number) => void;
}

export function SongTrimSheet({
  open,
  title,
  artist,
  coverUrl,
  audioUrl,
  durationMs,
  initialStartMs,
  onCancel,
  onConfirm,
}: SongTrimSheetProps) {
  const limit = maxStartMs(durationMs);
  const [startMs, setStartMs] = useState(() =>
    Math.min(Math.max(0, initialStartMs), Math.max(0, limit)),
  );
  const [previewing, setPreviewing] = useState(false);
  const { play, stop } = usePreviewPlayer();

  useEffect(() => {
    if (open) setStartMs(Math.min(Math.max(0, initialStartMs), Math.max(0, limit)));
  }, [open, initialStartMs, limit]);

  useEffect(() => {
    if (!open) {
      stop();
      setPreviewing(false);
    }
  }, [open, stop]);

  if (!open) return null;

  const window_ = playWindow(startMs, durationMs);
  const leftPct = durationMs > 0 ? (window_.startMs / durationMs) * 100 : 0;
  const widthPct = durationMs > 0 ? (window_.lengthMs / durationMs) * 100 : 0;

  const togglePreview = () => {
    if (previewing) {
      stop();
      setPreviewing(false);
      return;
    }
    const el = play(audioUrl, window_.startMs, window_.lengthMs);
    el.addEventListener("ended", () => setPreviewing(false), { once: true });
    el.addEventListener("pause", () => setPreviewing(false), { once: true });
    setPreviewing(true);
  };

  return createPortal(
    <div className="jt-sheet-backdrop" onClick={onCancel}>
      <div
        className="jt-sheet jt-trim-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Pick the part to use"
      >
        <div className="jt-sheet-head">
          <div>
            <h3>Choose the part</h3>
            <p>Status plays {formatClock(window_.lengthMs)} starting wherever you put it.</p>
          </div>
          <button type="button" className="jt-sheet-close" onClick={onCancel} aria-label="Close">
            <IosCloseIcon size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="jt-trim-now">
          {coverUrl ? (
            <img className="jt-trim-cover" src={coverUrl} alt="" draggable={false} />
          ) : (
            <div className="jt-trim-cover jt-trim-cover-empty" />
          )}
          <div className="jt-trim-now-copy">
            <strong>{title}</strong>
            {artist ? <span>{artist}</span> : null}
          </div>
          <button
            type="button"
            className={`jt-trim-preview-btn ${previewing ? "is-playing" : ""}`}
            onClick={togglePreview}
          >
            {previewing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
            <span>{previewing ? "Stop" : "Preview"}</span>
          </button>
        </div>

        <div className="jt-trim-timeline">
          <div className="jt-trim-bar">
            <div
              className="jt-trim-window"
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            />
          </div>
          {limit > 0 ? (
            <input
              type="range"
              min={0}
              max={limit}
              step={100}
              value={window_.startMs}
              onChange={(e) => {
                stop();
                setPreviewing(false);
                setStartMs(Number(e.target.value));
              }}
              aria-label="Where the clip starts"
            />
          ) : (
            <p className="jt-trim-note">
              This clip is {formatClock(durationMs)}, so the whole thing fits.
            </p>
          )}
          <div className="jt-trim-readout">
            <span>Starts at {formatClock(window_.startMs)}</span>
            <span>
              Plays {formatClock(window_.startMs)} – {formatClock(window_.startMs + window_.lengthMs)}
            </span>
          </div>
        </div>

        <div className="jt-sheet-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              stop();
              onConfirm(window_.startMs, window_.lengthMs);
            }}
          >
            Use this part
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
