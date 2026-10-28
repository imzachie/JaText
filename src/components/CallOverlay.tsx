import { useEffect, useRef, useState, type TouchEvent } from "react";
import { Capacitor } from "@capacitor/core";
import {
  Activity,
  Captions,
  LayoutGrid,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  Music2,
  Phone,
  PhoneOff,
  RefreshCw,
  Smile,
  Sparkles,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from "./CallIcons";
import {
  formatCallDuration,
  useCall,
  type SoundboardEffectId,
} from "../lib/calling";
import { useJaText } from "../lib/store";
import { Avatar } from "./Avatar";
import { MobileScreenShareSheet, SharedMediaPlaybackBar } from "./MobileScreenShareSheet";
import { DrumIcon, RocketIcon, SoundWaveIcon, SparklesIcon, UsersIcon } from "./UiIcons";

const CALL_REACTIONS = ["❤️", "😂", "🔥", "👏", "🎉", "👍"];
const SOUNDBOARD_ITEMS: Array<{ id: SoundboardEffectId; label: string }> = [
  { id: "bruh", label: "Bruh" },
  { id: "rimshot", label: "Rimshot" },
  { id: "chime", label: "Sparkle" },
  { id: "laser", label: "Laser" },
  { id: "cheer", label: "Applause" },
];

function renderSoundboardIcon(id: SoundboardEffectId) {
  switch (id) {
    case "bruh":
      return <SoundWaveIcon size={15} />;
    case "rimshot":
      return <DrumIcon size={15} />;
    case "chime":
      return <SparklesIcon size={15} />;
    case "laser":
      return <RocketIcon size={15} />;
    case "cheer":
      return <UsersIcon size={15} />;
  }
}

function StreamVideo({
  stream,
  muted,
  mirrored,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (!stream) return;
    const ensurePlay = () => {
      void el.play().catch(() => undefined);
    };
    ensurePlay();
    const vTracks = stream.getVideoTracks();
    for (const vt of vTracks) {
      vt.addEventListener("unmute", ensurePlay);
    }
    stream.addEventListener("addtrack", ensurePlay);
    return () => {
      for (const vt of vTracks) {
        vt.removeEventListener("unmute", ensurePlay);
      }
      stream.removeEventListener("addtrack", ensurePlay);
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`${className ?? ""} ${mirrored ? "mirrored" : ""}`}
    />
  );
}

export function CallOverlay() {
  const { me } = useJaText();
  const {
    session,
    localStream,
    remoteStream,
    isMuted,
    isDeafened,
    isCameraOff,
    isScreenSharing,
    isSpeakerphone,
    studioAudioEnabled,
    captionsEnabled,
    minimized,
    layoutMode,
    facingMode,
    meSpeaking,
    peerMuted,
    peerCameraOff,
    peerScreenSharing,
    peerSpeaking,
    reactions,
    captions,
    stats,
    callError,
    canScreenShare,
    mobileSharePickerOpen,
    sharedMediaVideoElement,
    acceptIncomingCall,
    declineIncomingCall,
    endCall,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    flipCamera,
    toggleScreenShare,
    startMobileVideoShare,
    startMobileCameraShare,
    closeMobileSharePicker,
    toggleSpeakerphone,
    toggleStudioAudio,
    toggleCaptions,
    sendCallReaction,
    playSoundboard,
    reconnectIce,
    setMinimized,
    setLayoutMode,
    dismissCallError,
  } = useCall();

  const [elapsedSec, setElapsedSec] = useState(0);
  const [openDrawer, setOpenDrawer] = useState<"none" | "reactions" | "soundboard" | "stats">(
    "none",
  );
  const [fullscreenTarget, setFullscreenTarget] = useState<"remote" | "local" | null>(null);
  const [fsClosing, setFsClosing] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [fsHudVisible, setFsHudVisible] = useState(true);
  const [fsZoom, setFsZoom] = useState(1);
  const [fsPan, setFsPan] = useState({ x: 0, y: 0 });
  const fullscreenStageRef = useRef<HTMLDivElement | null>(null);
  const pinchGestureRef = useRef<
    | { mode: "pinch"; startDist: number; startZoom: number }
    | { mode: "pan"; startX: number; startY: number; baseX: number; baseY: number }
    | null
  >(null);

  const [pipOffset, setPipOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  useEffect(() => {
    if (!session?.startedAt) {
      setElapsedSec(0);
      return;
    }
    const update = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - (session.startedAt ?? Date.now())) / 1000)));
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [session?.startedAt]);

  useEffect(() => {
    if (!session) {
      setOpenDrawer("none");
      setPipOffset({ x: 0, y: 0 });
      setFullscreenTarget(null);
    }
  }, [session]);

  // Close fullscreen viewer automatically if that screen share stops
  const activeFullscreenTarget =
    fullscreenTarget === "remote" && (peerScreenSharing || (!peerCameraOff && Boolean(remoteStream)))
      ? "remote"
      : fullscreenTarget === "local" && (isScreenSharing || (!isCameraOff && Boolean(localStream)))
        ? "local"
        : null;

  useEffect(() => {
    if (!activeFullscreenTarget) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setFullscreenTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeFullscreenTarget]);

  const openFullScreenView = (target: "remote" | "local") => {
    setFsZoom(1);
    setFsPan({ x: 0, y: 0 });
    setFsHudVisible(true);
    setFsClosing(false);
    setFullscreenTarget(target);
  };

  const closeFullScreenView = () => {
    if (fsClosing) return;
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    setFsClosing(true);
    window.setTimeout(() => {
      setFullscreenTarget(null);
      setFsClosing(false);
      setFsZoom(1);
      setFsPan({ x: 0, y: 0 });
    }, 180);
  };

  const closeOpenDrawer = () => {
    if (openDrawer === "none" || drawerClosing) return;
    setDrawerClosing(true);
    window.setTimeout(() => {
      setOpenDrawer("none");
      setDrawerClosing(false);
    }, 160);
  };

  const toggleBrowserTrueFullscreen = () => {
    const el = fullscreenStageRef.current;
    if (!el || Capacitor.isNativePlatform()) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (typeof el.requestFullscreen === "function") {
      void el.requestFullscreen().catch(() => undefined);
    }
  };

  const handleFsTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      pinchGestureRef.current = {
        mode: "pinch",
        startDist: Math.max(dist, 1),
        startZoom: fsZoom,
      };
    } else if (e.touches.length === 1 && fsZoom > 1) {
      pinchGestureRef.current = {
        mode: "pan",
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        baseX: fsPan.x,
        baseY: fsPan.y,
      };
    }
  };

  const handleFsTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const g = pinchGestureRef.current;
    if (!g) return;
    if (e.touches.length >= 2 && g.mode === "pinch") {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const nextZoom = Math.min(4, Math.max(1, (g.startZoom * dist) / g.startDist));
      setFsZoom(nextZoom);
      if (nextZoom <= 1.02) setFsPan({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && g.mode === "pan" && fsZoom > 1) {
      e.preventDefault();
      setFsPan({
        x: g.baseX + (e.touches[0].clientX - g.startX),
        y: g.baseY + (e.touches[0].clientY - g.startY),
      });
    }
  };

  const handleFsTouchEnd = () => {
    pinchGestureRef.current = null;
  };

  if (!session && !callError) return null;

  if (!session && callError) {
    return (
      <div className="call-error-banner" role="alert">
        <span>{callError}</span>
        <button type="button" className="icon-btn" onClick={dismissCallError} aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    );
  }

  if (!session) return null;

  const hasRemoteVideo =
    (!peerCameraOff || peerScreenSharing) &&
    Boolean(remoteStream && remoteStream.getVideoTracks().length > 0);
  const hasLocalVideo =
    (!isCameraOff || isScreenSharing) &&
    Boolean(localStream && localStream.getVideoTracks().length > 0);
  const isNative = Capacitor.isNativePlatform();

  // Incoming Call Modal
  if (session.phase === "incoming") {
    return (
      <div className="call-incoming-backdrop">
        <div className="call-incoming-sheet">
          <div className="call-incoming-badge">
            {session.mode === "video" ? (
              <>
                <Video size={14} /> Incoming Video Call
              </>
            ) : (
              <>
                <Phone size={14} /> Incoming Voice Call
              </>
            )}
          </div>
          <div className="call-incoming-avatar-pulse">
            <Avatar user={session.peer} size={92} ringWidth={4} />
          </div>
          <h2 className="call-incoming-name">{session.peer.displayName}</h2>
          <p className="call-incoming-handle">@{session.peer.username}</p>

          <div className="call-incoming-actions">
            <button
              type="button"
              className="call-round-btn decline"
              onClick={() => void declineIncomingCall()}
              title="Decline call"
            >
              <PhoneOff size={24} />
              <span>Decline</span>
            </button>

            <button
              type="button"
              className="call-round-btn accept-voice"
              onClick={() => void acceptIncomingCall(false)}
              title="Answer with voice"
            >
              <Phone size={24} />
              <span>{session.mode === "video" ? "Voice Only" : "Accept"}</span>
            </button>

            {session.mode === "video" && (
              <button
                type="button"
                className="call-round-btn accept-video"
                onClick={() => void acceptIncomingCall(true)}
                title="Answer with video"
              >
                <Video size={24} />
                <span>Video</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Minimized Draggable Floating PiP Window
  if (minimized) {
    return (
      <div
        className={`call-pip-card ${peerSpeaking ? "speaking" : ""}`}
        style={{
          transform: `translate(${pipOffset.x}px, ${pipOffset.y}px)`,
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragStartRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            baseX: pipOffset.x,
            baseY: pipOffset.y,
          };
        }}
        onPointerMove={(e) => {
          const drag = dragStartRef.current;
          if (!drag) return;
          setPipOffset({
            x: drag.baseX + (e.clientX - drag.startX),
            y: drag.baseY + (e.clientY - drag.startY),
          });
        }}
        onPointerUp={() => {
          dragStartRef.current = null;
        }}
      >
        {hasRemoteVideo ? (
          <StreamVideo
            stream={remoteStream}
            muted
            className={`call-pip-video ${peerScreenSharing ? "screenshare-contain" : ""}`}
          />
        ) : (
          <div className="call-pip-avatar">
            <Avatar user={session.peer} size={46} ringWidth={3} />
          </div>
        )}
        <div className="call-pip-meta">
          <div className="call-pip-name">{session.peer.displayName}</div>
          <div className="call-pip-timer">
            {session.phase === "connected" ? formatCallDuration(elapsedSec) : "Connecting…"}
          </div>
        </div>
        <div className="call-pip-btns">
          <button
            type="button"
            className={`call-pip-icon ${isMuted ? "off" : ""}`}
            onClick={toggleMute}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
          <button
            type="button"
            className="call-pip-icon"
            onClick={() => setMinimized(false)}
            title="Expand call"
          >
            <Maximize2 size={15} />
          </button>
          <button
            type="button"
            className="call-pip-icon hangup"
            onClick={() => void endCall()}
            title="End call"
          >
            <PhoneOff size={15} />
          </button>
        </div>
      </div>
    );
  }

  const statusText =
    session.phase === "outgoing"
      ? "Ringing…"
      : session.phase === "connecting"
        ? "Connecting secure P2P…"
        : formatCallDuration(elapsedSec);

  const fsStream = activeFullscreenTarget === "local" ? localStream : remoteStream;
  const fsTitle =
    activeFullscreenTarget === "local"
      ? "Your Shared Screen"
      : peerScreenSharing
        ? `${session.peer.displayName}'s Screen`
        : session.peer.displayName;

  return (
    <div className="call-studio-overlay">
      {/* Fullscreen Screen-Share / Video Viewer (Mobile & Desktop) */}
      {activeFullscreenTarget && fsStream && (
        <div
          ref={fullscreenStageRef}
          className={`call-screenshare-fullscreen ${fsClosing ? "is-closing" : ""}`}
          onTouchStart={handleFsTouchStart}
          onTouchMove={handleFsTouchMove}
          onTouchEnd={handleFsTouchEnd}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            setFsHudVisible((v) => !v);
          }}
        >
          <div
            className="call-screenshare-fs-canvas"
            style={{
              transform: `translate(${fsPan.x}px, ${fsPan.y}px) scale(${fsZoom})`,
            }}
          >
            <StreamVideo
              stream={fsStream}
              muted
              className="call-screenshare-fs-video"
            />
          </div>

          {fsHudVisible && (
            <div className="call-screenshare-fs-topbar">
              <div className="call-screenshare-fs-title">
                <span className="call-live-dot live" />
                <strong>{fsTitle}</strong>
              </div>
              <div className="call-screenshare-fs-controls">
                <button
                  type="button"
                  className="call-fs-pill-btn"
                  onClick={() => {
                    const next = fsZoom >= 2 ? 1 : fsZoom >= 1.5 ? 2 : 1.5;
                    setFsZoom(next);
                    if (next === 1) setFsPan({ x: 0, y: 0 });
                  }}
                  title="Cycle zoom level"
                >
                  {fsZoom === 1 ? "1×" : `${fsZoom.toFixed(1)}×`}
                </button>
                {!isNative && typeof document !== "undefined" && (
                  <button
                    type="button"
                    className="call-fs-pill-btn"
                    onClick={toggleBrowserTrueFullscreen}
                    title="Toggle monitor fullscreen"
                  >
                    <Maximize2 size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className="call-fs-pill-btn close"
                  onClick={closeFullScreenView}
                  title="Exit full view"
                >
                  <X size={15} />
                  <span>Close</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top Bar */}
      <header className="call-studio-topbar">
        <div className="call-studio-peer">
          <span className={`call-live-dot ${session.phase === "connected" ? "live" : "pulse"}`} />
          <div>
            <div className="call-studio-title">
              {session.peer.displayName}
              {peerScreenSharing && <span className="call-tag-chip">Screen</span>}
              {studioAudioEnabled && <span className="call-tag-chip accent">HD Voice</span>}
            </div>
            <div className="call-studio-sub">
              <span>{statusText}</span>
              {stats.rttMs !== null && session.phase === "connected" && (
                <span className="call-rtt-pill">{stats.rttMs} ms</span>
              )}
            </div>
          </div>
        </div>

        <div className="call-studio-top-actions">
          {(hasRemoteVideo || hasLocalVideo) && (
            <button
              type="button"
              className={`call-top-btn ${layoutMode === "grid" ? "active" : ""}`}
              onClick={() => setLayoutMode(layoutMode === "spotlight" ? "grid" : "spotlight")}
              title={layoutMode === "spotlight" ? "Switch to side-by-side grid" : "Switch to spotlight"}
            >
              <LayoutGrid size={17} />
            </button>
          )}
          <button
            type="button"
            className={`call-top-btn ${openDrawer === "stats" ? "active" : ""}`}
            onClick={() => setOpenDrawer(openDrawer === "stats" ? "none" : "stats")}
            title="Connection quality & stats"
          >
            <Activity size={17} />
          </button>
          <button
            type="button"
            className="call-top-btn"
            onClick={() => setMinimized(true)}
            title="Minimize call to browse chats"
          >
            <Minimize2 size={17} />
          </button>
        </div>
      </header>

      {callError && (
        <div className="call-inline-alert">
          <span>{callError}</span>
          <button type="button" onClick={dismissCallError}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Connection Diagnostics Popover */}
      {openDrawer === "stats" && (
        <div className="call-stats-popover">
          <div className="call-stats-head">
            <strong>WebRTC Diagnostics</strong>
            <button
              type="button"
              className="call-mini-action"
              onClick={() => void reconnectIce()}
              title="Refresh ICE route"
            >
              <RefreshCw size={12} /> Re-sync
            </button>
          </div>
          <div className="call-stats-grid">
            <div>
              <span>State</span>
              <strong>{stats.connectionState}</strong>
            </div>
            <div>
              <span>Route</span>
              <strong>{stats.routeType}</strong>
            </div>
            <div>
              <span>Latency</span>
              <strong>{stats.rttMs !== null ? `${stats.rttMs} ms` : "—"}</strong>
            </div>
            <div>
              <span>Bitrate</span>
              <strong>{stats.bitrateKbps !== null ? `${stats.bitrateKbps} kbps` : "—"}</strong>
            </div>
            {stats.resolution && (
              <div>
                <span>Video</span>
                <strong>{stats.resolution}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stage Area */}
      <div
        className={`call-stage ${layoutMode === "grid" ? "grid-mode" : "spotlight-mode"}`}
        onClick={() => {
          if (openDrawer !== "none") closeOpenDrawer();
        }}
      >
        {/* Remote Tile */}
        <div
          className={`call-tile remote-tile ${peerSpeaking ? "speaking-ring" : ""} ${
            hasRemoteVideo ? "clickable-video-tile" : ""
          }`}
          onClick={() => {
            if (hasRemoteVideo) openFullScreenView("remote");
          }}
        >
          {hasRemoteVideo ? (
            <StreamVideo
              stream={remoteStream}
              muted
              className={`call-tile-video ${peerScreenSharing ? "screenshare-contain" : ""}`}
            />
          ) : (
            <div className="call-avatar-stage">
              <div className={`call-avatar-halo ${peerSpeaking ? "active" : ""}`}>
                <Avatar user={session.peer} size={112} ringWidth={4} />
              </div>
              <div className="call-stage-name">{session.peer.displayName}</div>
              <div className="call-stage-state">
                {session.phase !== "connected" ? (
                  statusText
                ) : peerMuted ? (
                  <>
                    <MicOff size={13} /> Microphone muted
                  </>
                ) : peerSpeaking ? (
                  "Speaking…"
                ) : (
                  "Connected"
                )}
              </div>
            </div>
          )}

          {hasRemoteVideo && (
            <>
              <div className="call-tile-badge">
                <span>
                  {peerScreenSharing ? `${session.peer.displayName}'s screen` : session.peer.displayName}
                </span>
                {peerMuted && <MicOff size={13} />}
              </div>
              <button
                type="button"
                className="call-tile-expand-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  openFullScreenView("remote");
                }}
                title="View full screen"
              >
                <Maximize2 size={14} />
                <span>{peerScreenSharing ? "Full Screen" : "Expand"}</span>
              </button>
            </>
          )}
        </div>

        {/* Local Tile (PiP in spotlight mode, second tile in grid mode) */}
        {(hasLocalVideo || layoutMode === "grid") && me && (
          <div
            className={`call-tile local-tile ${
              layoutMode === "spotlight" ? "pip-corner" : ""
            } ${meSpeaking ? "speaking-ring" : ""} ${hasLocalVideo ? "clickable-video-tile" : ""}`}
            onClick={() => {
              if (hasLocalVideo) openFullScreenView("local");
            }}
          >
            {hasLocalVideo ? (
              <StreamVideo
                stream={localStream}
                muted
                mirrored={!isScreenSharing && facingMode === "user"}
                className={`call-tile-video ${isScreenSharing ? "screenshare-contain" : ""}`}
              />
            ) : (
              <div className="call-avatar-stage compact">
                <Avatar user={me} size={68} ringWidth={3} />
                <div className="call-stage-name">You</div>
              </div>
            )}
            <div className="call-tile-badge">
              <span>{isScreenSharing ? "Your screen" : "You"}</span>
              {isMuted && <MicOff size={12} />}
            </div>
            {hasLocalVideo && isScreenSharing && (
              <button
                type="button"
                className="call-tile-expand-btn compact"
                onClick={(e) => {
                  e.stopPropagation();
                  openFullScreenView("local");
                }}
                title="View your shared screen full"
              >
                <Maximize2 size={12} />
              </button>
            )}
          </div>
        )}

        {/* Floating Reactions Layer */}
        <div className="call-reactions-layer" aria-hidden="true">
          {reactions.map((r) => (
            <span
              key={r.id}
              className="call-floating-emoji"
              style={{ left: `${r.leftPct}%` }}
            >
              {r.emoji}
            </span>
          ))}
        </div>

        {/* Live Closed Captions Overlay */}
        {(captionsEnabled || captions.length > 0) && (
          <div className="call-captions-box">
            {captions.length === 0 ? (
              <span className="call-caption-placeholder">
                Live captions on — start speaking…
              </span>
            ) : (
              captions.slice(-2).map((line) => (
                <div key={line.speakerName} className="call-caption-line">
                  <strong>{line.speakerName}:</strong> {line.text}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Expandable Reactions or Soundboard Tray */}
      {openDrawer === "reactions" && (
        <div className={`call-Floating-tray ${drawerClosing ? "is-closing" : ""}`}>
          {CALL_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="call-emoji-pill"
              onClick={() => sendCallReaction(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {openDrawer === "soundboard" && (
        <div className={`call-Floating-tray soundboard ${drawerClosing ? "is-closing" : ""}`}>
          {SOUNDBOARD_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="call-sound-pill"
              onClick={() => playSoundboard(item.id)}
            >
              {renderSoundboardIcon(item.id)}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Secondary Feature Strip */}
      <div className="call-secondary-bar">
        <button
          type="button"
          className={`call-chip-btn ${studioAudioEnabled ? "active" : ""}`}
          onClick={toggleStudioAudio}
          title="Crisp Voice EQ & compressor"
        >
          <Sparkles size={14} />
          <span>HD Voice</span>
        </button>

        <button
          type="button"
          className={`call-chip-btn ${captionsEnabled ? "active" : ""}`}
          onClick={toggleCaptions}
          title="Toggle live closed captions"
        >
          <Captions size={14} />
          <span>Captions</span>
        </button>

        <button
          type="button"
          className={`call-chip-btn ${openDrawer === "reactions" ? "active" : ""}`}
          onClick={() => setOpenDrawer(openDrawer === "reactions" ? "none" : "reactions")}
          title="Send floating reaction"
        >
          <Smile size={14} />
          <span>React</span>
        </button>

        <button
          type="button"
          className={`call-chip-btn ${openDrawer === "soundboard" ? "active" : ""}`}
          onClick={() => setOpenDrawer(openDrawer === "soundboard" ? "none" : "soundboard")}
          title="Play shared soundboard effect"
        >
          <Music2 size={14} />
          <span>Sounds</span>
        </button>

        {!isCameraOff && !isScreenSharing && (
          <button
            type="button"
            className="call-chip-btn"
            onClick={() => void flipCamera()}
            title="Switch front/back camera"
          >
            <SwitchCamera size={14} />
            <span>Flip</span>
          </button>
        )}

        {canScreenShare && (
          <button
            type="button"
            className={`call-chip-btn ${isScreenSharing ? "active" : ""}`}
            onClick={() => void toggleScreenShare()}
            title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
          >
            <MonitorUp size={14} />
            <span>{isScreenSharing ? "Stop Share" : "Share Screen"}</span>
          </button>
        )}
      </div>

      {isScreenSharing && sharedMediaVideoElement && (
        <SharedMediaPlaybackBar
          videoEl={sharedMediaVideoElement}
          onStop={() => void toggleScreenShare()}
        />
      )}

      <MobileScreenShareSheet
        open={mobileSharePickerOpen}
        onClose={closeMobileSharePicker}
        onSelectVideoFile={(file) => void startMobileVideoShare(file)}
        onSelectLiveCameraPresentation={() => void startMobileCameraShare()}
      />

      {/* Primary Call Control Dock */}
      <footer className="call-primary-dock">
        <button
          type="button"
          className={`call-dock-btn ${isMuted ? "off" : ""}`}
          onClick={toggleMute}
          title={isMuted ? "Unmute microphone" : "Mute microphone"}
        >
          {isMuted ? <MicOff size={21} /> : <Mic size={21} />}
          <span>{isMuted ? "Unmute" : "Mute"}</span>
        </button>

        <button
          type="button"
          className={`call-dock-btn ${!isCameraOff ? "active" : ""}`}
          onClick={() => void toggleCamera()}
          title={isCameraOff ? "Turn camera on" : "Turn camera off"}
        >
          {isCameraOff ? <VideoOff size={21} /> : <Video size={21} />}
          <span>{isCameraOff ? "Cam Off" : "Camera"}</span>
        </button>

        {isNative ? (
          <button
            type="button"
            className={`call-dock-btn ${isSpeakerphone ? "active" : ""}`}
            onClick={() => void toggleSpeakerphone()}
            title={isSpeakerphone ? "Switch to earpiece" : "Switch to speakerphone"}
          >
            <Volume2 size={21} />
            <span>{isSpeakerphone ? "Speaker" : "Earpiece"}</span>
          </button>
        ) : (
          <button
            type="button"
            className={`call-dock-btn ${isDeafened ? "off" : ""}`}
            onClick={toggleDeafen}
            title={isDeafened ? "Undeafen call audio" : "Mute incoming call audio"}
          >
            {isDeafened ? <VolumeX size={21} /> : <Volume2 size={21} />}
            <span>{isDeafened ? "Deafened" : "Audio"}</span>
          </button>
        )}

        <button
          type="button"
          className="call-dock-btn end-call"
          onClick={() => void endCall()}
          title="End call"
        >
          <PhoneOff size={22} />
          <span>End</span>
        </button>
      </footer>
    </div>
  );
}
