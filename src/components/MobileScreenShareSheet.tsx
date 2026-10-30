import { useEffect, useRef, useState } from "react";
import { MonitorUp, Video, Volume2, X } from "./CallIcons";
import { AnimatedModal } from "./AnimatedModal";
import { formatAudioDuration } from "../lib/voiceNotes";
import { FilmIcon, PauseIcon, PlayIcon, SmartphoneShareIcon } from "./UiIcons";

const APK_DOWNLOAD_URL = "https://jatext.vercel.app/downloads/JaText-release.apk";

export function MobileScreenShareSheet({
  open,
  onClose,
  onSelectVideoFile,
  onSelectLiveCameraPresentation,
}: {
  open: boolean;
  onClose: () => void;
  onSelectVideoFile: (file: File) => void;
  onSelectLiveCameraPresentation: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <AnimatedModal
      onClose={onClose}
      backdropClassName="modal-backdrop mobile-share-sheet-backdrop"
      cardClassName="modal-card mobile-share-sheet-card"
      showCloseButton={false}
    >
      {(requestClose) => (
        <div className="mobile-share-sheet-body">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                requestClose();
                onSelectVideoFile(file);
              }
            }}
          />

          <div className="mobile-share-sheet-header">
            <div className="mobile-share-sheet-title-wrap">
              <span className="mobile-share-sheet-badge">
                <MonitorUp size={18} />
              </span>
              <div>
                <h3>Share on Mobile View</h3>
                <p className="muted small">
                  Stream video + audio right inside your mobile browser, or use the JaText Android
                  app for full phone screen &amp; app audio capture.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="icon-btn animated-x-btn"
              aria-label="Close share options"
              onClick={requestClose}
            >
              <X size={18} />
            </button>
          </div>

          <div className="mobile-share-options">
            <button
              type="button"
              className="mobile-share-option-btn primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="mobile-share-opt-icon">
                <FilmIcon size={20} />
              </span>
              <span className="mobile-share-opt-copy">
                <strong>Share Video or Screen Recording (with Audio)</strong>
                <small>
                  Watch any clip, movie, or phone recording together in HD with full synced audio
                </small>
              </span>
            </button>

            <button
              type="button"
              className="mobile-share-option-btn"
              onClick={() => {
                requestClose();
                onSelectLiveCameraPresentation();
              }}
            >
              <span className="mobile-share-opt-icon camera">
                <Video size={20} />
              </span>
              <span className="mobile-share-opt-copy">
                <strong>Share Live Presentation View</strong>
                <small>Stream your rear view onto the full Screen Share stage</small>
              </span>
            </button>

            <a
              className="mobile-share-option-btn apk"
              href={APK_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="mobile-share-opt-icon apk">
                <SmartphoneShareIcon size={20} />
              </span>
              <span className="mobile-share-opt-copy">
                <strong>Full Live Phone Screen + System Audio (Android APK)</strong>
                <small>
                  Mobile browsers block capturing other apps. Install the JaText Android app for
                  full live screen + media audio sharing
                </small>
              </span>
            </a>
          </div>
        </div>
      )}
    </AnimatedModal>
  );
}

export function SharedMediaPlaybackBar({
  videoEl,
  onStop,
}: {
  videoEl: HTMLVideoElement | null;
  onStop: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!videoEl) return;
    const sync = () => {
      setPaused(videoEl.paused);
      setCurrentTime(videoEl.currentTime || 0);
      setDuration(Number.isFinite(videoEl.duration) ? videoEl.duration : 0);
    };
    sync();
    videoEl.addEventListener("timeupdate", sync);
    videoEl.addEventListener("play", sync);
    videoEl.addEventListener("pause", sync);
    videoEl.addEventListener("loadedmetadata", sync);
    return () => {
      videoEl.removeEventListener("timeupdate", sync);
      videoEl.removeEventListener("play", sync);
      videoEl.removeEventListener("pause", sync);
      videoEl.removeEventListener("loadedmetadata", sync);
    };
  }, [videoEl]);

  if (!videoEl) return null;

  return (
    <div className="shared-media-playback-bar" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="icon-btn shared-media-btn"
        aria-label={paused ? "Resume shared video" : "Pause shared video"}
        onClick={() => {
          if (videoEl.paused) {
            void videoEl.play().catch(() => undefined);
          } else {
            videoEl.pause();
          }
        }}
      >
        {paused ? <PlayIcon size={15} /> : <PauseIcon size={15} />}
      </button>
      <span className="shared-media-time">
        <Volume2 size={14} /> {formatAudioDuration(currentTime)} / {formatAudioDuration(duration)}
      </span>
      <input
        type="range"
        min={0}
        max={Math.max(1, duration)}
        step={0.5}
        value={Math.min(currentTime, Math.max(1, duration))}
        aria-label="Seek shared video"
        className="shared-media-Seek"
        onChange={(e) => {
          const t = Number(e.target.value);
          videoEl.currentTime = t;
          setCurrentTime(t);
        }}
      />
      <button type="button" className="mini-btn danger shared-media-stop" onClick={onStop}>
        Stop
      </button>
    </div>
  );
}
