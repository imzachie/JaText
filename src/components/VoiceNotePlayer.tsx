import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Volume2, VolumeX } from "./CallIcons";
import { FileTextIcon, MicVoiceIcon, PauseIcon, PlayIcon } from "./UiIcons";
import {
  VOICE_TRANSCRIPT_EVENT,
  decodeVoiceNoteMime,
  formatAudioDuration,
  getCachedVoiceTranscript,
  getDefaultWaveform,
  resolveVoiceNoteTranscript,
  type VoiceTranscriptEventDetail,
} from "../lib/voiceNotes";

const PLAYBACK_RATES = [1, 1.5, 2, 0.75] as const;

export function VoiceNotePlayer({
  messageId,
  audioUrl,
  attachmentType,
  mine = false,
  showTranscript,
  onToggleTranscript,
  onOpenContextAt,
}: {
  messageId: string;
  audioUrl: string;
  attachmentType?: string;
  mine?: boolean;
  showTranscript: boolean;
  onToggleTranscript?: (show: boolean) => void;
  onOpenContextAt?: (clientX: number, clientY: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const touchOriginRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);
  const runningRequestKeyRef = useRef<string | null>(null);

  const meta = useMemo(() => decodeVoiceNoteMime(attachmentType), [attachmentType]);
  const bars = meta?.waveform ?? getDefaultWaveform();

  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(meta?.durationSec ?? 0);
  const [rateIndex, setRateIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const [transcriptState, setTranscriptState] = useState<{
    loading: boolean;
    percent: number;
    partialText: string | null;
    text: string | null;
    error: string | null;
  }>(() => {
    const initial = meta?.transcript ?? getCachedVoiceTranscript(messageId) ?? null;
    return { loading: false, percent: initial ? 100 : 0, partialText: null, text: initial, error: null };
  });

  useEffect(() => {
    if (meta?.durationSec && durationSec === 0) {
      setDurationSec(meta.durationSec);
    }
  }, [durationSec, meta?.durationSec]);

  // Subscribe to global live transcript events so live progress & finished text ALWAYS update immediately
  useEffect(() => {
    const handleTranscriptEvent = (raw: Event) => {
      const detail = (raw as CustomEvent<VoiceTranscriptEventDetail>).detail;
      if (!detail || detail.messageId !== messageId) return;
      if (detail.status === "progress") {
        setTranscriptState((prev) =>
          prev.text
            ? prev
            : {
                loading: true,
                percent: detail.percent ?? prev.percent,
                partialText: detail.partialText ?? prev.partialText,
                text: null,
                error: null,
              },
        );
      } else if (detail.status === "done" && detail.text) {
        runningRequestKeyRef.current = null;
        setTranscriptState({
          loading: false,
          percent: 100,
          partialText: null,
          text: detail.text,
          error: null,
        });
      } else if (detail.status === "error") {
        runningRequestKeyRef.current = null;
        setTranscriptState((prev) =>
          prev.text
            ? prev
            : {
                loading: false,
                percent: 0,
                partialText: null,
                text: null,
                error: detail.error ?? "Couldn't transcribe this voice note right now.",
              },
        );
      }
    };

    window.addEventListener(VOICE_TRANSCRIPT_EVENT, handleTranscriptEvent);
    return () => window.removeEventListener(VOICE_TRANSCRIPT_EVENT, handleTranscriptEvent);
  }, [messageId]);

  // Trigger transcription cleanly WITHOUT putting transcriptState.loading in deps (which previously cancelled itself!)
  useEffect(() => {
    if (!showTranscript) return;

    const cachedNow = meta?.transcript ?? getCachedVoiceTranscript(messageId);
    if (cachedNow) {
      setTranscriptState({
        loading: false,
        percent: 100,
        partialText: null,
        text: cachedNow,
        error: null,
      });
      return;
    }

    const reqKey = `${messageId}:${audioUrl}:${retryNonce}`;
    if (runningRequestKeyRef.current === reqKey) return;
    runningRequestKeyRef.current = reqKey;

    let mounted = true;
    setTranscriptState({
      loading: true,
      percent: 2,
      partialText: null,
      text: null,
      error: null,
    });

    void resolveVoiceNoteTranscript(messageId, audioUrl, meta?.transcript, (pct, partial) => {
      if (!mounted) return;
      setTranscriptState((prev) =>
        prev.text
          ? prev
          : {
              loading: true,
              percent: pct,
              partialText: partial ?? prev.partialText,
              text: null,
              error: null,
            },
      );
    })
      .then((text) => {
        if (!mounted) return;
        runningRequestKeyRef.current = null;
        setTranscriptState({
          loading: false,
          percent: 100,
          partialText: null,
          text,
          error: null,
        });
      })
      .catch(() => {
        if (!mounted) return;
        runningRequestKeyRef.current = null;
        setTranscriptState({
          loading: false,
          percent: 0,
          partialText: null,
          text: null,
          error: "Couldn't transcribe this voice note right now.",
        });
      });

    return () => {
      mounted = false;
    };
  }, [audioUrl, messageId, meta?.transcript, retryNonce, showTranscript]);

  useEffect(
    () => () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    },
    [],
  );

  function togglePlay(event: MouseEvent) {
    event.stopPropagation();
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.playbackRate = PLAYBACK_RATES[rateIndex];
      audio.muted = muted;
      audio.volume = volume;
      void audio.play().catch(() => setPlaying(false));
    }
  }

  function cycleRate(event: MouseEvent) {
    event.stopPropagation();
    const nextIdx = (rateIndex + 1) % PLAYBACK_RATES.length;
    setRateIndex(nextIdx);
    if (audioRef.current) {
      audioRef.current.playbackRate = PLAYBACK_RATES[nextIdx];
    }
  }

  function toggleMuteAudio(event: MouseEvent) {
    event.stopPropagation();
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  }

  function handleVolumeChange(nextVal: number) {
    const clamped = Math.max(0, Math.min(1, nextVal));
    setVolume(clamped);
    const shouldMute = clamped === 0;
    setMuted(shouldMute);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      audioRef.current.muted = shouldMute;
    }
  }

  function seekOnWaveform(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : durationSec;
    if (total > 0) {
      audio.currentTime = ratio * total;
      setCurrentSec(ratio * total);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!onOpenContextAt || event.pointerType !== "touch") return;
    touchOriginRef.current = { x: event.clientX, y: event.clientY };
    longPressTriggeredRef.current = false;
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
    const clientX = event.clientX;
    const clientY = event.clientY;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressTriggeredRef.current = true;
      onOpenContextAt(clientX, clientY);
    }, 450);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || !touchOriginRef.current || longPressTimerRef.current === null) {
      return;
    }
    const dist = Math.hypot(
      event.clientX - touchOriginRef.current.x,
      event.clientY - touchOriginRef.current.y,
    );
    if (dist > 10) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  const effectiveDuration = durationSec > 0 ? durationSec : meta?.durationSec ?? 0;
  const progress =
    effectiveDuration > 0 ? Math.max(0, Math.min(1, currentSec / effectiveDuration)) : 0;

  return (
    <div
      className={`voice-note-card ${mine ? "mine" : "theirs"}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearLongPressTimer}
      onPointerCancel={clearLongPressTimer}
      onMouseLeave={() => setShowVolumeSlider(false)}
    >
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentSec(0);
        }}
        onTimeUpdate={(event) => setCurrentSec(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const dur = event.currentTarget.duration;
          if (Number.isFinite(dur) && dur > 0) {
            setDurationSec(dur);
          }
        }}
      />

      <div className="voice-note-main">
        <button
          type="button"
          className="voice-note-play-btn"
          aria-label={playing ? "Pause voice note" : "Play voice note"}
          onClick={togglePlay}
        >
          {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        </button>

        <div className="voice-note-body">
          <div
            className="voice-note-waveform"
            role="slider"
            tabIndex={0}
            aria-label="Voice note progress"
            aria-valuemin={0}
            aria-valuemax={Math.round(effectiveDuration)}
            aria-valuenow={Math.round(currentSec)}
            onClick={seekOnWaveform}
          >
            {bars.map((height, idx) => {
              const barRatio = (idx + 0.5) / bars.length;
              const filled = barRatio <= progress;
              return (
                <span
                  key={idx}
                  className={`voice-wave-bar ${filled ? "filled" : ""}`}
                  style={{ height: `${Math.max(18, height)}%` }}
                />
              );
            })}
          </div>

          <div className="voice-note-footer">
            <span className="voice-note-duration">
              <MicVoiceIcon size={12} />{" "}
              {playing || currentSec > 0
                ? `${formatAudioDuration(currentSec)} / ${formatAudioDuration(effectiveDuration)}`
                : formatAudioDuration(effectiveDuration)}
            </span>

            <div className="voice-note-controls" onClick={(e) => e.stopPropagation()}>
              <div
                className="voice-volume-wrap"
                onMouseEnter={() => setShowVolumeSlider(true)}
              >
                <button
                  type="button"
                  className={`voice-vol-btn ${muted || volume === 0 ? "muted" : ""}`}
                  onClick={toggleMuteAudio}
                  aria-label={muted || volume === 0 ? "Unmute audio" : "Mute audio"}
                  title={muted || volume === 0 ? "Unmute audio" : "Mute audio"}
                >
                  {muted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>
                {showVolumeSlider && (
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    aria-label="Audio volume"
                    className="voice-vol-slider"
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  />
                )}
              </div>

              <button
                type="button"
                className="voice-rate-pill"
                onClick={cycleRate}
                title="Change playback speed"
              >
                {PLAYBACK_RATES[rateIndex]}×
              </button>
            </div>
          </div>
        </div>
      </div>

      {showTranscript && (
        <div className="voice-transcript-box" role="region" aria-label="Voice note transcription">
          <div className="voice-transcript-header">
            <span>
              <FileTextIcon size={13} /> Transcription
              {transcriptState.loading && transcriptState.percent > 0
                ? ` · ${transcriptState.percent}%`
                : ""}
            </span>
            {onToggleTranscript && (
              <button
                type="button"
                className="voice-transcript-hide"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleTranscript(false);
                }}
              >
                Hide transcribe
              </button>
            )}
          </div>
          {transcriptState.loading ? (
            <div className="voice-transcript-progress-wrap">
              <p className="voice-transcript-loading">
                {transcriptState.partialText
                  ? `${transcriptState.partialText} …`
                  : "Transcribing in background…"}
              </p>
              <div className="voice-transcript-progress-bar">
                <div
                  className="voice-transcript-progress-fill"
                  style={{ width: `${Math.max(6, transcriptState.percent)}%` }}
                />
              </div>
            </div>
          ) : transcriptState.error ? (
            <div className="voice-transcript-error-row">
              <p className="voice-transcript-error">{transcriptState.error}</p>
              <button
                type="button"
                className="voice-transcript-hide"
                onClick={(event) => {
                  event.stopPropagation();
                  runningRequestKeyRef.current = null;
                  setRetryNonce((n) => n + 1);
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="voice-transcript-text">
              {transcriptState.text || "No clear speech detected in this voice note."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
