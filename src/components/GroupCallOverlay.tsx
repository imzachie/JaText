import { useEffect, useRef, useState, type TouchEvent } from "react";
import { Capacitor } from "@capacitor/core";
import {
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
  Smile,
  Sparkles,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from "./CallIcons";
import { formatCallDuration, type SoundboardEffectId } from "../lib/calling";
import { useGroupCall } from "../lib/groupCalling";
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

function GroupStreamVideo({
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
    if (el.srcObject !== stream) el.srcObject = stream;
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

export function GroupCallOverlay() {
  const { me } = useJaText();
  const {
    groupSession,
    localStream,
    participants,
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
    reactions,
    captions,
    callError,
    canScreenShare,
    mobileSharePickerOpen,
    sharedMediaVideoElement,
    acceptIncomingGroupCall,
    declineIncomingGroupCall,
    retryDismissedGroupCall,
    closeDismissedGroupCall,
    leaveGroupCall,
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
    setMinimized,
    setLayoutMode,
    dismissCallError,
  } = useGroupCall();

  const [elapsedSec, setElapsedSec] = useState(0);
  const [openDrawer, setOpenDrawer] = useState<"none" | "reactions" | "soundboard">("none");
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [fullscreenPeerId, setFullscreenPeerId] = useState<string | null>(null); // "local" or participant.user.id
  const [fsClosing, setFsClosing] = useState(false);
  const [fsHudVisible, setFsHudVisible] = useState(true);
  const [fsZoom, setFsZoom] = useState(1);
  const [fsPan, setFsPan] = useState({ x: 0, y: 0 });
  const fsRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<
    | { mode: "pinch"; startDist: number; startZoom: number }
    | { mode: "pan"; startX: number; startY: number; baseX: number; baseY: number }
    | null
  >(null);
  const [pipOffset, setPipOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  useEffect(() => {
    if (!groupSession?.startedAt) {
      setElapsedSec(0);
      return;
    }
    const tick = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - (groupSession.startedAt ?? Date.now())) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [groupSession?.startedAt]);

  if (!groupSession && !callError) return null;

  if (!groupSession && callError) {
    return (
      <div className="call-error-banner" role="alert">
        <span>{callError}</span>
        <button type="button" className="icon-btn" onClick={dismissCallError} aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    );
  }

  if (!groupSession) return null;

  const isNative = Capacitor.isNativePlatform();
  const hasLocalVideo =
    (!isCameraOff || isScreenSharing) &&
    Boolean(localStream && localStream.getVideoTracks().length > 0);

  if (groupSession.phase === "dismissed") {
    return (
      <div className="call-incoming-backdrop">
        <div className="call-incoming-sheet call-dismissed-sheet">
          <div className="call-incoming-badge call-dismissed-badge">
            <PhoneOff size={14} /> Call dismissed
          </div>
          <div className="call-incoming-avatar-pulse call-dismissed-avatar">
            {groupSession.group.avatarUrl ? (
              <img
                src={groupSession.group.avatarUrl}
                alt=""
                style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  background: "rgba(155, 108, 255, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <UsersIcon size={38} />
              </div>
            )}
          </div>
          <h2 className="call-incoming-name">{groupSession.group.name}</h2>
          <p className="call-incoming-sub muted">
            Group call went unanswered for 1 minute
          </p>
          <div className="call-dismissed-actions">
            <button
              type="button"
              className="ghost-btn call-dismissed-btn"
              onClick={closeDismissedGroupCall}
            >
              Close
            </button>
            <button
              type="button"
              className="primary-btn call-dismissed-btn"
              onClick={() => void retryDismissedGroupCall()}
            >
              {groupSession.mode === "video" ? <Video size={16} /> : <Phone size={16} />}
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (groupSession.phase === "incoming") {
    return (
      <div className="call-incoming-backdrop">
        <div className="call-incoming-sheet">
          <div className="call-incoming-badge">
            {groupSession.mode === "video" ? (
              <>
                <Video size={14} /> Incoming Group Video Call
              </>
            ) : (
              <>
                <Phone size={14} /> Incoming Group Voice Call
              </>
            )}
          </div>
          <div className="call-incoming-avatar-pulse">
            {groupSession.group.avatarUrl ? (
              <img
                src={groupSession.group.avatarUrl}
                alt=""
                style={{ width: 92, height: 92, borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: "50%",
                  background: "rgba(155, 108, 255, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 42,
                }}
              >
                <UsersIcon size={40} />
              </div>
            )}
          </div>
          <h2 className="call-incoming-name">{groupSession.group.name}</h2>
          <p className="call-incoming-handle">Started by {groupSession.hostName}</p>

          <div className="call-incoming-actions">
            <button
              type="button"
              className="call-round-btn decline"
              onClick={declineIncomingGroupCall}
            >
              <PhoneOff size={24} />
              <span>Ignore</span>
            </button>
            <button
              type="button"
              className="call-round-btn accept-voice"
              onClick={() => void acceptIncomingGroupCall(false)}
            >
              <Phone size={24} />
              <span>Join Voice</span>
            </button>
            {groupSession.mode === "video" && (
              <button
                type="button"
                className="call-round-btn accept-video"
                onClick={() => void acceptIncomingGroupCall(true)}
              >
                <Video size={24} />
                <span>Join Video</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const totalPeopleCount = 1 + participants.length;

  if (minimized) {
    return (
      <div
        className="call-pip-card"
        style={{ transform: `translate(${pipOffset.x}px, ${pipOffset.y}px)` }}
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
          const d = dragStartRef.current;
          if (!d) return;
          setPipOffset({ x: d.baseX + (e.clientX - d.startX), y: d.baseY + (e.clientY - d.startY) });
        }}
        onPointerUp={() => {
          dragStartRef.current = null;
        }}
      >
        <div className="call-pip-avatar">
          {groupSession.group.avatarUrl ? (
            <img
              src={groupSession.group.avatarUrl}
              alt=""
              style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <UsersIcon size={22} />
            </span>
          )}
        </div>
        <div className="call-pip-meta">
          <div className="call-pip-name">{groupSession.group.name}</div>
          <div className="call-pip-timer">
            {totalPeopleCount} in call · {formatCallDuration(elapsedSec)}
          </div>
        </div>
        <div className="call-pip-btns">
          <button
            type="button"
            className={`call-pip-icon ${isMuted ? "off" : ""}`}
            onClick={toggleMute}
          >
            {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
          <button type="button" className="call-pip-icon" onClick={() => setMinimized(false)}>
            <Maximize2 size={15} />
          </button>
          <button
            type="button"
            className="call-pip-icon hangup"
            onClick={() => void leaveGroupCall()}
          >
            <PhoneOff size={15} />
          </button>
        </div>
      </div>
    );
  }

  const fsParticipant =
    fullscreenPeerId && fullscreenPeerId !== "local"
      ? participants.find((p) => p.user.id === fullscreenPeerId) ?? null
      : null;
  const fsStream =
    fullscreenPeerId === "local"
      ? hasLocalVideo
        ? localStream
        : null
      : fsParticipant && (!fsParticipant.cameraOff || fsParticipant.screenSharing)
        ? fsParticipant.stream
        : null;
  const fsTitle =
    fullscreenPeerId === "local"
      ? isScreenSharing
        ? "Your Shared Screen"
        : "You"
      : fsParticipant
        ? fsParticipant.screenSharing
          ? `${fsParticipant.user.displayName}'s Screen`
          : fsParticipant.user.displayName
        : "";

  const handleFsTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchRef.current = {
        mode: "pinch",
        startDist: Math.max(1, Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)),
        startZoom: fsZoom,
      };
    } else if (e.touches.length === 1 && fsZoom > 1) {
      pinchRef.current = {
        mode: "pan",
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        baseX: fsPan.x,
        baseY: fsPan.y,
      };
    }
  };

  const handleFsTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const g = pinchRef.current;
    if (!g) return;
    if (e.touches.length >= 2 && g.mode === "pinch") {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const next = Math.min(4, Math.max(1, (g.startZoom * dist) / g.startDist));
      setFsZoom(next);
      if (next <= 1.02) setFsPan({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && g.mode === "pan" && fsZoom > 1) {
      e.preventDefault();
      setFsPan({
        x: g.baseX + (e.touches[0].clientX - g.startX),
        y: g.baseY + (e.touches[0].clientY - g.startY),
      });
    }
  };

  return (
    <div className="call-studio-overlay group-call-overlay">
      {fullscreenPeerId && fsStream && (
        <div
          ref={fsRef}
          className={`call-screenshare-fullscreen ${fsClosing ? "is-closing" : ""}`}
          onTouchStart={handleFsTouchStart}
          onTouchMove={handleFsTouchMove}
          onTouchEnd={() => {
            pinchRef.current = null;
          }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            setFsHudVisible((v) => !v);
          }}
        >
          <div
            className="call-screenshare-fs-canvas"
            style={{ transform: `translate(${fsPan.x}px, ${fsPan.y}px) scale(${fsZoom})` }}
          >
            <GroupStreamVideo stream={fsStream} muted className="call-screenshare-fs-video" />
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
                >
                  {fsZoom === 1 ? "1×" : `${fsZoom.toFixed(1)}×`}
                </button>
                {!isNative && typeof document !== "undefined" && (
                  <button
                    type="button"
                    className="call-fs-pill-btn"
                    onClick={() => {
                      if (document.fullscreenElement) {
                        void document.exitFullscreen().catch(() => undefined);
                      } else {
                        void fsRef.current?.requestFullscreen?.().catch(() => undefined);
                      }
                    }}
                  >
                    <Maximize2 size={14} />
                  </button>
                )}
                <button
                  type="button"
                  className="call-fs-pill-btn close"
                  onClick={() => {
                    if (fsClosing) return;
                    if (typeof document !== "undefined" && document.fullscreenElement) {
                      void document.exitFullscreen().catch(() => undefined);
                    }
                    setFsClosing(true);
                    window.setTimeout(() => {
                      setFullscreenPeerId(null);
                      setFsClosing(false);
                      setFsZoom(1);
                      setFsPan({ x: 0, y: 0 });
                    }, 180);
                  }}
                >
                  <X size={15} />
                  <span>Close</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <header className="call-studio-topbar">
        <div className="call-studio-peer">
          <span className="call-live-dot live" />
          <div>
            <div className="call-studio-title">
              {groupSession.group.name}
              <span className="call-tag-chip">{totalPeopleCount} in call</span>
              {studioAudioEnabled && <span className="call-tag-chip accent">HD Voice</span>}
            </div>
            <div className="call-studio-sub">
              <span>{formatCallDuration(elapsedSec)}</span>
              {participants.length === 0 && (
                <span>· Waiting for group members to join…</span>
              )}
            </div>
          </div>
        </div>
        <div className="call-studio-top-actions">
          <button
            type="button"
            className={`call-top-btn ${layoutMode === "grid" ? "active" : ""}`}
            onClick={() => setLayoutMode(layoutMode === "grid" ? "spotlight" : "grid")}
            title="Switch layout"
          >
            <LayoutGrid size={17} />
          </button>
          <button
            type="button"
            className="call-top-btn"
            onClick={() => setMinimized(true)}
            title="Minimize group call"
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

      {/* Multi-Party Mesh Grid Stage */}
      <div
        className={`call-stage group-mesh-stage count-${Math.min(6, totalPeopleCount)}`}
        onClick={() => {
          if (openDrawer !== "none" && !drawerClosing) {
            setDrawerClosing(true);
            window.setTimeout(() => {
              setOpenDrawer("none");
              setDrawerClosing(false);
            }, 160);
          }
        }}
      >
        {/* Self Tile */}
        {me && (
          <div
            className={`call-tile ${meSpeaking ? "speaking-ring" : ""} ${
              hasLocalVideo ? "clickable-video-tile" : ""
            }`}
            onClick={() => {
              if (hasLocalVideo) {
                setFsZoom(1);
                setFsPan({ x: 0, y: 0 });
                setFullscreenPeerId("local");
              }
            }}
          >
            {hasLocalVideo ? (
              <GroupStreamVideo
                stream={localStream}
                muted
                mirrored={!isScreenSharing && facingMode === "user"}
                className={`call-tile-video ${isScreenSharing ? "screenshare-contain" : ""}`}
              />
            ) : (
              <div className="call-avatar-stage">
                <div className={`call-avatar-halo ${meSpeaking ? "active" : ""}`}>
                  <Avatar user={me} size={84} ringWidth={3.5} />
                </div>
                <div className="call-stage-name">You</div>
                <div className="call-stage-state">
                  {isMuted ? (
                    <>
                      <MicOff size={13} /> Muted
                    </>
                  ) : meSpeaking ? (
                    "Speaking…"
                  ) : (
                    "Connected"
                  )}
                </div>
              </div>
            )}
            <div className="call-tile-badge">
              <span>{isScreenSharing ? "Your screen" : `${me.displayName} (You)`}</span>
              {isMuted && <MicOff size={13} />}
            </div>
            {hasLocalVideo && (
              <button
                type="button"
                className="call-tile-expand-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setFsZoom(1);
                  setFsPan({ x: 0, y: 0 });
                  setFullscreenPeerId("local");
                }}
              >
                <Maximize2 size={14} />
                <span>{isScreenSharing ? "Full Screen" : "Expand"}</span>
              </button>
            )}
          </div>
        )}

        {/* Remote Participant Tiles */}
        {participants.map((p) => {
          const hasPeerVid =
            (!p.cameraOff || p.screenSharing) &&
            Boolean(p.stream && p.stream.getVideoTracks().length > 0);
          return (
            <div
              key={p.user.id}
              className={`call-tile ${p.speaking ? "speaking-ring" : ""} ${
                hasPeerVid ? "clickable-video-tile" : ""
              }`}
              onClick={() => {
                if (hasPeerVid) {
                  setFsZoom(1);
                  setFsPan({ x: 0, y: 0 });
                  setFullscreenPeerId(p.user.id);
                }
              }}
            >
              {hasPeerVid ? (
                <GroupStreamVideo
                  stream={p.stream}
                  muted
                  className={`call-tile-video ${p.screenSharing ? "screenshare-contain" : ""}`}
                />
              ) : (
                <div className="call-avatar-stage">
                  <div className={`call-avatar-halo ${p.speaking ? "active" : ""}`}>
                    <Avatar user={p.user} size={84} ringWidth={3.5} />
                  </div>
                  <div className="call-stage-name">{p.user.displayName}</div>
                  <div className="call-stage-state">
                    {p.muted ? (
                      <>
                        <MicOff size={13} /> Muted
                      </>
                    ) : p.speaking ? (
                      "Speaking…"
                    ) : (
                      `@${p.user.username}`
                    )}
                  </div>
                </div>
              )}
              <div className="call-tile-badge">
                <span>
                  {p.screenSharing ? `${p.user.displayName}'s screen` : p.user.displayName}
                </span>
                {p.muted && <MicOff size={13} />}
              </div>
              {hasPeerVid && (
                <button
                  type="button"
                  className="call-tile-expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFsZoom(1);
                    setFsPan({ x: 0, y: 0 });
                    setFullscreenPeerId(p.user.id);
                  }}
                >
                  <Maximize2 size={14} />
                  <span>{p.screenSharing ? "Full Screen" : "Expand"}</span>
                </button>
              )}
            </div>
          );
        })}

        {/* Floating Reactions */}
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

        {(captionsEnabled || captions.length > 0) && (
          <div className="call-captions-box">
            {captions.length === 0 ? (
              <span className="call-caption-placeholder">Live captions on — start speaking…</span>
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

      <div className="call-secondary-bar">
        <button
          type="button"
          className={`call-chip-btn ${studioAudioEnabled ? "active" : ""}`}
          onClick={toggleStudioAudio}
        >
          <Sparkles size={14} />
          <span>HD Voice</span>
        </button>
        <button
          type="button"
          className={`call-chip-btn ${captionsEnabled ? "active" : ""}`}
          onClick={toggleCaptions}
        >
          <Captions size={14} />
          <span>Captions</span>
        </button>
        <button
          type="button"
          className={`call-chip-btn ${openDrawer === "reactions" ? "active" : ""}`}
          onClick={() => setOpenDrawer(openDrawer === "reactions" ? "none" : "reactions")}
        >
          <Smile size={14} />
          <span>React</span>
        </button>
        <button
          type="button"
          className={`call-chip-btn ${openDrawer === "soundboard" ? "active" : ""}`}
          onClick={() => setOpenDrawer(openDrawer === "soundboard" ? "none" : "soundboard")}
        >
          <Music2 size={14} />
          <span>Sounds</span>
        </button>
        {!isCameraOff && !isScreenSharing && (
          <button type="button" className="call-chip-btn" onClick={() => void flipCamera()}>
            <SwitchCamera size={14} />
            <span>Flip</span>
          </button>
        )}
        {canScreenShare && (
          <button
            type="button"
            className={`call-chip-btn ${isScreenSharing ? "active" : ""}`}
            onClick={() => void toggleScreenShare()}
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

      <footer className="call-primary-dock">
        <button
          type="button"
          className={`call-dock-btn ${isMuted ? "off" : ""}`}
          onClick={toggleMute}
        >
          {isMuted ? <MicOff size={21} /> : <Mic size={21} />}
          <span>{isMuted ? "Unmute" : "Mute"}</span>
        </button>
        <button
          type="button"
          className={`call-dock-btn ${!isCameraOff ? "active" : ""}`}
          onClick={() => void toggleCamera()}
        >
          {isCameraOff ? <VideoOff size={21} /> : <Video size={21} />}
          <span>{isCameraOff ? "Cam Off" : "Camera"}</span>
        </button>
        {isNative ? (
          <button
            type="button"
            className={`call-dock-btn ${isSpeakerphone ? "active" : ""}`}
            onClick={() => void toggleSpeakerphone()}
          >
            <Volume2 size={21} />
            <span>{isSpeakerphone ? "Speaker" : "Earpiece"}</span>
          </button>
        ) : (
          <button
            type="button"
            className={`call-dock-btn ${isDeafened ? "off" : ""}`}
            onClick={toggleDeafen}
          >
            {isDeafened ? <VolumeX size={21} /> : <Volume2 size={21} />}
            <span>{isDeafened ? "Deafened" : "Audio"}</span>
          </button>
        )}
        <button
          type="button"
          className="call-dock-btn end-call"
          onClick={() => void leaveGroupCall()}
        >
          <PhoneOff size={22} />
          <span>Leave</span>
        </button>
      </footer>
    </div>
  );
}
