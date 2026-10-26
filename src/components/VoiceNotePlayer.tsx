import { useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import {
  decodeVoiceNoteMime,
  formatAudioDuration,
  getCachedVoiceTranscript,
  getDefaultWaveform,
  resolveVoiceNoteTranscript,
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

  const meta = useMemo(() => decodeVoiceNoteMime(attachmentType), [attachmentType]);
  const bars = meta?.waveform ?? getDefaultWaveform();

  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(meta?.durationSec ?? 0);
  const [rateIndex, setRateIndex] = useState(0);
  const [transcriptState, setTranscriptState] = useState<{
    loading: boolean;
    text: string | null;
    error: string | null;
  }>(() => {
    const initial = meta?.transcript ?? getCachedVoiceTranscript(messageId) ?? null;
    return { loading: false, text: initial, error: null };
  });

  useEffect(() => {
    if (meta?.durationSec && durationSec === 0) {
      setDurationSec(meta.durationSec);
    }
  }, [durationSec, meta?.durationSec]);

  useEffect(() => {
    if (!showTranscript) return;
    if (transcriptState.text || transcriptState.loading) return;

    let cancelled = false;
    setTranscriptState({ loading: true, text: null, error: null });
    void resolveVoiceNoteTranscript(messageId, audioUrl, meta?.transcript)
      .then((text) => {
        if (!cancelled) {
          setTranscriptState({ loading: false, text, error: null });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTranscriptState({
            loading: false,
            text: null,
            error: "Couldn't transcribe this voice note right now.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [audioUrl, messageId, meta?.transcript, showTranscript, transcriptState.loading, transcriptState.text]);

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

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (!onOpenContextAt || event.touches.length !== 1) return;
    const touch = event.touches[0];
    touchOriginRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTriggeredRef.current = false;
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
    const clientX = touch.clientX;
    const clientY = touch.clientY;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressTriggeredRef.current = true;
      onOpenContextAt(clientX, clientY);
    }, 450);
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (!touchOriginRef.current || longPressTimerRef.current === null) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dist = Math.hypot(
      touch.clientX - touchOriginRef.current.x,
      touch.clientY - touchOriginRef.current.y,
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={clearLongPressTimer}
      onTouchCancel={clearLongPressTimer}
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
          {playing ? "⏸" : "▶"}
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
              🎤 {playing || currentSec > 0
                ? `${formatAudioDuration(currentSec)} / ${formatAudioDuration(effectiveDuration)}`
                : formatAudioDuration(effectiveDuration)}
            </span>
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

      {showTranscript && (
        <div className="voice-transcript-box" role="region" aria-label="Voice note transcription">
          <div className="voice-transcript-header">
            <span>📝 Transcription</span>
            {onToggleTranscript && (
              <button
                type="button"
                className="voice-transcript-hide"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleTranscript(false);
                }}
              >
                Hide
              </button>
            )}
          </div>
          {transcriptState.loading ? (
            <p className="voice-transcript-loading">Transcribing voice note…</p>
          ) : transcriptState.error ? (
            <p className="voice-transcript-error">{transcriptState.error}</p>
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
