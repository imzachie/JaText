import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ChatVideoPlayerProps {
  src: string;
  name?: string;
}

const SPEED_STEPS = [0.5, 1, 1.25, 1.5, 2] as const;

function formatVideoClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const padSecs = secs < 10 ? `0${secs}` : `${secs}`;
  if (hrs > 0) {
    const padMins = mins < 10 ? `0${mins}` : `${mins}`;
    return `${hrs}:${padMins}:${padSecs}`;
  }
  return `${mins}:${padSecs}`;
}

export function ChatVideoPlayer({ src, name }: ChatVideoPlayerProps) {
  const inlineVideoRef = useRef<HTMLVideoElement | null>(null);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);
  const inlineTrackRef = useRef<HTMLDivElement | null>(null);
  const modalTrackRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubFraction, setScrubFraction] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const activeVideo = useCallback((): HTMLVideoElement | null => {
    return fullscreenOpen ? modalVideoRef.current : inlineVideoRef.current;
  }, [fullscreenOpen]);

  const scheduleAutoHide = useCallback((playingNow: boolean, scrubbingNow: boolean) => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (playingNow && !scrubbingNow) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 3200);
    }
  }, []);

  useEffect(() => {
    scheduleAutoHide(isPlaying, isScrubbing);
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [isPlaying, isScrubbing, scheduleAutoHide]);

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    scheduleAutoHide(isPlaying, isScrubbing);
  }, [isPlaying, isScrubbing, scheduleAutoHide]);

  const syncSettingsToVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el) return;
      el.muted = isMuted;
      el.playbackRate = speed;
    },
    [isMuted, speed],
  );

  useEffect(() => {
    syncSettingsToVideo(inlineVideoRef.current);
    syncSettingsToVideo(modalVideoRef.current);
  }, [syncSettingsToVideo]);

  const togglePlay = useCallback(() => {
    const vid = activeVideo();
    if (!vid) return;
    bumpControls();
    if (vid.paused || vid.ended) {
      if (vid.ended || (vid.duration > 0 && vid.currentTime >= vid.duration - 0.15)) {
        vid.currentTime = 0;
        setCurrentTime(0);
      }
      vid.muted = isMuted;
      vid.playbackRate = speed;
      void vid.play().catch(() => undefined);
    } else {
      vid.pause();
    }
  }, [activeVideo, bumpControls, isMuted, speed]);

  const seekBySeconds = useCallback(
    (delta: number) => {
      const vid = activeVideo();
      if (!vid) return;
      bumpControls();
      const maxDur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : duration;
      const next = Math.max(0, Math.min(maxDur || 0, vid.currentTime + delta));
      vid.currentTime = next;
      setCurrentTime(next);
    },
    [activeVideo, bumpControls, duration],
  );

  const cycleSpeed = useCallback(() => {
    bumpControls();
    setSpeed((prev) => {
      const idx = SPEED_STEPS.indexOf(prev as (typeof SPEED_STEPS)[number]);
      return SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
    });
  }, [bumpControls]);

  const toggleMute = useCallback(() => {
    bumpControls();
    setIsMuted((prev) => !prev);
  }, [bumpControls]);

  const openFullscreen = useCallback(() => {
    const inlineVid = inlineVideoRef.current;
    const savedPos = inlineVid ? inlineVid.currentTime : currentTime;
    const wasPlaying = inlineVid ? !inlineVid.paused : isPlaying;
    if (inlineVid && !inlineVid.paused) {
      inlineVid.pause();
    }
    setCurrentTime(savedPos);
    setFullscreenOpen(true);
    setControlsVisible(true);
    window.requestAnimationFrame(() => {
      const mVid = modalVideoRef.current;
      if (mVid) {
        mVid.muted = isMuted;
        mVid.playbackRate = speed;
        if (savedPos > 0) {
          try {
            mVid.currentTime = savedPos;
          } catch {
            // Applied in onLoadedMetadata if not yet ready
          }
        }
        if (wasPlaying) {
          void mVid.play().catch(() => undefined);
        }
      }
    });
  }, [currentTime, isMuted, isPlaying, speed]);

  const closeFullscreen = useCallback(() => {
    const mVid = modalVideoRef.current;
    const savedPos = mVid ? mVid.currentTime : currentTime;
    if (mVid && !mVid.paused) {
      mVid.pause();
    }
    setIsPlaying(false);
    setCurrentTime(savedPos);
    setFullscreenOpen(false);
    setControlsVisible(true);
    if (inlineVideoRef.current && Number.isFinite(savedPos)) {
      try {
        inlineVideoRef.current.currentTime = savedPos;
      } catch {
        // Ignore
      }
    }
  }, [currentTime]);

  useEffect(() => {
    if (!fullscreenOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeFullscreen();
      if (ev.key === " ") {
        ev.preventDefault();
        togglePlay();
      }
      if (ev.key === "ArrowLeft") seekBySeconds(-5);
      if (ev.key === "ArrowRight") seekBySeconds(5);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeFullscreen, fullscreenOpen, seekBySeconds, togglePlay]);

  const computeFraction = (trackEl: HTMLDivElement | null, clientX: number): number => {
    if (!trackEl) return 0;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const applyFractionSeek = useCallback(
    (frac: number) => {
      const vid = activeVideo();
      const maxDur =
        vid && Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : duration;
      if (maxDur > 0) {
        const target = frac * maxDur;
        if (vid) {
          vid.currentTime = target;
        }
        setCurrentTime(target);
      }
    },
    [activeVideo, duration],
  );

  const effectiveFraction = isScrubbing
    ? scrubFraction
    : duration > 0
      ? Math.max(0, Math.min(1, currentTime / duration))
      : 0;
  const displayedTime = isScrubbing && duration > 0 ? scrubFraction * duration : currentTime;
  const showOverlay = controlsVisible || !isPlaying || isScrubbing;

  const renderScrubber = (isModal: boolean) => {
    const refObj = isModal ? modalTrackRef : inlineTrackRef;
    return (
      <div
        ref={refObj}
        className={`ja-video-scrub-hit${isScrubbing ? " is-scrubbing" : ""}`}
        role="slider"
        aria-label="Seek video"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(displayedTime)}
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          const frac = computeFraction(refObj.current, e.clientX);
          setIsScrubbing(true);
          setScrubFraction(frac);
          setControlsVisible(true);
        }}
        onPointerMove={(e) => {
          if (!isScrubbing) return;
          e.stopPropagation();
          const frac = computeFraction(refObj.current, e.clientX);
          setScrubFraction(frac);
        }}
        onPointerUp={(e) => {
          if (!isScrubbing) return;
          e.stopPropagation();
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // Ignore
          }
          const frac = computeFraction(refObj.current, e.clientX);
          applyFractionSeek(frac);
          setIsScrubbing(false);
          bumpControls();
        }}
        onPointerCancel={() => {
          if (!isScrubbing) return;
          applyFractionSeek(scrubFraction);
          setIsScrubbing(false);
        }}
      >
        <div className="ja-video-scrub-track">
          <div
            className="ja-video-scrub-fill"
            style={{ width: `${(effectiveFraction * 100).toFixed(2)}%` }}
          />
          <div
            className="ja-video-scrub-thumb"
            style={{ left: `${(effectiveFraction * 100).toFixed(2)}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        className="video-attachment ja-video-player"
        onClick={() => {
          if (controlsVisible && isPlaying) {
            setControlsVisible(false);
          } else {
            bumpControls();
          }
        }}
      >
        <video
          ref={inlineVideoRef}
          className="msg-video ja-video-el"
          playsInline
          preload="metadata"
          src={src}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDuration(d);
            syncSettingsToVideo(e.currentTarget);
          }}
          onTimeUpdate={(e) => {
            if (!fullscreenOpen && !isScrubbing) {
              setCurrentTime(e.currentTarget.currentTime);
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0 && d !== duration) setDuration(d);
            }
          }}
          onPlay={() => {
            if (!fullscreenOpen) setIsPlaying(true);
          }}
          onPause={() => {
            if (!fullscreenOpen) setIsPlaying(false);
          }}
          onEnded={() => {
            if (!fullscreenOpen) {
              setIsPlaying(false);
              setControlsVisible(true);
            }
          }}
        />

        <div className={`ja-video-overlay${showOverlay ? " is-visible" : ""}`}>
          <div className="ja-video-top-row" onClick={(e) => e.stopPropagation()}>
            <span />
            <div className="ja-video-pill-group">
              <button
                type="button"
                className="ja-video-pill-btn"
                onClick={cycleSpeed}
                aria-label="Playback speed"
              >
                {speed}x
              </button>
              <button
                type="button"
                className="ja-video-icon-btn"
                onClick={toggleMute}
                aria-label={isMuted ? "Unmute video" : "Mute video"}
              >
                {isMuted ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="ja-video-icon-btn"
                onClick={openFullscreen}
                aria-label="Fullscreen video"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            </div>
          </div>

          <button
            type="button"
            className="ja-video-center-play"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            aria-label={isPlaying ? "Pause video" : "Play video"}
          >
            {isPlaying ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1.2" />
                <rect x="14" y="4" width="4" height="16" rx="1.2" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 4 20 12 6 20 6 4" />
              </svg>
            )}
          </button>

          <div className="ja-video-bottom-bar" onClick={(e) => e.stopPropagation()}>
            {renderScrubber(false)}
            <div className="ja-video-bottom-meta">
              <button
                type="button"
                className="ja-video-mini-play"
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="6 4 20 12 6 20 6 4" />
                  </svg>
                )}
              </button>
              <span className="ja-video-clock">
                {formatVideoClock(displayedTime)} / {formatVideoClock(duration)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {fullscreenOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="ja-video-fullscreen-backdrop"
            onClick={() => {
              if (controlsVisible && isPlaying) {
                setControlsVisible(false);
              } else {
                bumpControls();
              }
            }}
          >
            <video
              ref={modalVideoRef}
              className="ja-video-fullscreen-el"
              playsInline
              autoPlay
              src={src}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setDuration(d);
                syncSettingsToVideo(e.currentTarget);
                if (currentTime > 0 && Math.abs(e.currentTarget.currentTime - currentTime) > 0.35) {
                  try {
                    e.currentTarget.currentTime = currentTime;
                  } catch {
                    // Ignore
                  }
                }
              }}
              onTimeUpdate={(e) => {
                if (!isScrubbing) {
                  setCurrentTime(e.currentTarget.currentTime);
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d) && d > 0 && d !== duration) setDuration(d);
                }
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                setControlsVisible(true);
              }}
            />

            <div className={`ja-video-overlay is-fullscreen${showOverlay ? " is-visible" : ""}`}>
              <div className="ja-video-top-row" onClick={(e) => e.stopPropagation()}>
                {name ? <span className="ja-video-title-pill">{name}</span> : <span />}
                <div className="ja-video-pill-group">
                  <button
                    type="button"
                    className="ja-video-pill-btn"
                    onClick={cycleSpeed}
                    aria-label="Playback speed"
                  >
                    {speed}x
                  </button>
                  <button
                    type="button"
                    className="ja-video-icon-btn"
                    onClick={toggleMute}
                    aria-label={isMuted ? "Unmute video" : "Mute video"}
                  >
                    {isMuted ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <line x1="23" y1="9" x2="17" y2="15" />
                        <line x1="17" y1="9" x2="23" y2="15" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    className="ja-video-icon-btn"
                    onClick={closeFullscreen}
                    aria-label="Close fullscreen video"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="ja-video-center-transport" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="ja-video-skip-btn"
                  onClick={() => seekBySeconds(-10)}
                  aria-label="Rewind 10 seconds"
                >
                  -10s
                </button>
                <button
                  type="button"
                  className="ja-video-center-play is-lg"
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pause video" : "Play video"}
                >
                  {isPlaying ? (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1.2" />
                      <rect x="14" y="4" width="4" height="16" rx="1.2" />
                    </svg>
                  ) : (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="6 4 20 12 6 20 6 4" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="ja-video-skip-btn"
                  onClick={() => seekBySeconds(10)}
                  aria-label="Forward 10 seconds"
                >
                  +10s
                </button>
              </div>

              <div className="ja-video-bottom-bar" onClick={(e) => e.stopPropagation()}>
                {renderScrubber(true)}
                <div className="ja-video-bottom-meta">
                  <div className="ja-video-bottom-left">
                    <button
                      type="button"
                      className="ja-video-mini-play"
                      onClick={togglePlay}
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="4" width="4" height="16" rx="1" />
                          <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="6 4 20 12 6 20 6 4" />
                        </svg>
                      )}
                    </button>
                    <span className="ja-video-clock">
                      {formatVideoClock(displayedTime)} / {formatVideoClock(duration)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="ja-video-mini-play"
                    onClick={closeFullscreen}
                    aria-label="Exit fullscreen"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 14 10 14 10 20" />
                      <polyline points="20 10 14 10 14 4" />
                      <line x1="14" y1="10" x2="21" y2="3" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
