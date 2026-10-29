import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { startIncomingCallRingtone, stopIncomingCallRingtone } from "./alerts";
import { updateCallHistoryStatus, upsertCallHistoryEntry } from "./callHistory";
import { parseWallpaperSignal, stripBubbleStyleFromText } from "./chatCustomization";
import { JaTextNative, configureNativeCallAudio, ensureNativeMediaPermissions } from "./nativeBridge";
import {
  createScreenAudioMixer,
  isWebDisplayMediaSupported,
  startMobileRearPresentationShare,
  startMobileVideoFileShare,
  startNativeAndroidScreenShare,
  startWebDisplayScreenShare,
  type ActiveScreenShareSession,
  type ScreenAudioMixer,
} from "./screenShareMedia";
import { useJaText } from "./store";
import type { ChatMessage, JaUser } from "./types";

export const CALL_INVITE_PREFIX = "__JATEXT_CALL__:";
export const CALL_SIGNAL_PREFIX = "__JATEXT_CALL_SIG__:";
export const GROUP_CALL_INVITE_PREFIX = "__JATEXT_CALL_GRP__:";
export const GROUP_CALL_SIGNAL_PREFIX = "__JATEXT_CALL_SIG__:GRP:";
const CALL_RING_TIMEOUT_MS = 60_000;
export const CALL_DEVICE_SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export async function acquireSwitchedCameraTrack(
  oldTrack: MediaStreamTrack | null,
  nextFacing: "user" | "environment",
): Promise<MediaStreamTrack> {
  const prevSettings = oldTrack?.getSettings?.();
  const prevDeviceId = prevSettings?.deviceId;

  // CRITICAL on Android WebView / Camera2 HAL: release active hardware camera FIRST!
  if (oldTrack) {
    try {
      oldTrack.stop();
    } catch {
      // Ignore.
    }
    if (Capacitor.isNativePlatform()) {
      await new Promise((resolve) => window.setTimeout(resolve, 90));
    }
  }

  const attempts: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { exact: nextFacing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
  ];

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
    if (cams.length > 1) {
      const hintRegex =
        nextFacing === "environment" ? /back|rear|environment|0/i : /front|user|selfie|1/i;
      const otherCams = prevDeviceId
        ? cams.filter((d) => d.deviceId !== prevDeviceId)
        : cams;
      const preferred = otherCams.find((d) => hintRegex.test(d.label)) ?? otherCams[0];
      if (preferred?.deviceId) {
        attempts.push({
          video: {
            deviceId: { exact: preferred.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      }
    }
  } catch {
    // Ignore enumerateDevices failure and continue with facingMode fallback.
  }

  attempts.push(
    {
      video: {
        facingMode: nextFacing,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    { video: true },
  );

  let lastErr: unknown = null;
  for (const constraint of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraint);
      const track = stream.getVideoTracks()[0];
      if (track) return track;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("Could not switch cameras on this device.");
}

export type CallMode = "voice" | "video";
export type CallInviteState = "ringing" | "connected" | "ended" | "missed" | "declined";

export interface CallInvitePayload {
  v: 1;
  callId: string;
  mode: CallMode;
  state: CallInviteState;
  durationSec?: number;
  ts: number;
}

interface SignalEnvelope {
  callId: string;
  type:
    | "claim"
    | "offer"
    | "answer"
    | "decline"
    | "hangup"
    | "renegotiate-offer"
    | "renegotiate-answer";
  deviceSessionId?: string;
  mode?: CallMode;
  sdp?: RTCSessionDescriptionInit;
  cameraOff?: boolean;
  ts: number;
}

type DataChannelMessage =
  | {
      type: "peer-state";
      muted: boolean;
      cameraOff: boolean;
      screenSharing: boolean;
      speaking: boolean;
    }
  | { type: "reaction"; emoji: string; id: string }
  | { type: "caption"; text: string; isFinal: boolean }
  | { type: "soundboard"; effectId: SoundboardEffectId }
  | { type: "renegotiate-offer"; sdp: RTCSessionDescriptionInit }
  | { type: "renegotiate-answer"; sdp: RTCSessionDescriptionInit }
  | { type: "hangup" };

export type SoundboardEffectId = "bruh" | "tada" | "rimshot" | "chime" | "laser" | "cheer";

export interface FloatingCallReaction {
  id: string;
  emoji: string;
  fromMe: boolean;
  leftPct: number;
}

export interface CallCaptionLine {
  speakerName: string;
  text: string;
  updatedAt: number;
}

export interface CallConnectionStats {
  rttMs: number | null;
  bitrateKbps: number | null;
  resolution: string | null;
  routeType: string;
  connectionState: string;
}

export type ActiveCallPhase =
  | "outgoing"
  | "incoming"
  | "connecting"
  | "connected"
  | "dismissed"
  | "ended";

export interface ActiveCallSession {
  callId: string;
  peer: JaUser;
  mode: CallMode;
  phase: ActiveCallPhase;
  isCaller: boolean;
  startedAt: number | null;
  inviteMessageId?: string;
}

export interface CallContextValue {
  session: ActiveCallSession | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  isSpeakerphone: boolean;
  studioAudioEnabled: boolean;
  captionsEnabled: boolean;
  minimized: boolean;
  layoutMode: "spotlight" | "grid";
  facingMode: "user" | "environment";
  meSpeaking: boolean;
  peerMuted: boolean;
  peerCameraOff: boolean;
  peerScreenSharing: boolean;
  peerSpeaking: boolean;
  reactions: FloatingCallReaction[];
  captions: CallCaptionLine[];
  stats: CallConnectionStats;
  callError: string | null;
  canScreenShare: boolean;
  mobileSharePickerOpen: boolean;
  sharedMediaVideoElement: HTMLVideoElement | null;
  startCall: (peer: JaUser, mode: CallMode) => Promise<void>;
  acceptIncomingCall: (withVideo: boolean) => Promise<void>;
  declineIncomingCall: () => Promise<void>;
  retryDismissedCall: () => Promise<void>;
  closeDismissedCall: () => void;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  flipCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  startMobileVideoShare: (file: File) => Promise<void>;
  startMobileCameraShare: () => Promise<void>;
  closeMobileSharePicker: () => void;
  toggleSpeakerphone: () => Promise<void>;
  toggleStudioAudio: () => void;
  toggleCaptions: () => void;
  sendCallReaction: (emoji: string) => void;
  playSoundboard: (effectId: SoundboardEffectId) => void;
  reconnectIce: () => Promise<void>;
  setMinimized: (minimized: boolean) => void;
  setLayoutMode: (mode: "spotlight" | "grid") => void;
  dismissCallError: () => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
  iceCandidatePoolSize: 6,
};

export function isHiddenCallSignal(body?: string | null): boolean {
  return Boolean(
    body?.startsWith(CALL_SIGNAL_PREFIX) || body?.startsWith(GROUP_CALL_SIGNAL_PREFIX),
  );
}

export function parseCallInvite(body?: string | null): CallInvitePayload | null {
  if (!body || !body.startsWith(CALL_INVITE_PREFIX)) return null;
  try {
    const raw = body.slice(CALL_INVITE_PREFIX.length);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Partial<CallInvitePayload>;
    if (!rec.callId || (rec.mode !== "voice" && rec.mode !== "video") || !rec.state) {
      return null;
    }
    return {
      v: 1,
      callId: rec.callId,
      mode: rec.mode,
      state: rec.state,
      durationSec: typeof rec.durationSec === "number" ? rec.durationSec : undefined,
      ts: typeof rec.ts === "number" ? rec.ts : 0,
    };
  } catch {
    return null;
  }
}

export function serializeCallInvite(payload: CallInvitePayload): string {
  return `${CALL_INVITE_PREFIX}${JSON.stringify(payload)}`;
}

export function formatCallDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function stripMarkdownForPreview(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => {
      const inner = block.replace(/^```[a-z0-9_+-]*\n?/i, "").replace(/```$/, "").trim();
      return inner ? inner.split("\n")[0] : "Code snippet";
    })
    .replace(/\|\|([\s\S]+?)\|\|/g, "▒▒▒")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^-#\s+/gm, "")
    .replace(/^>{1,3}\s?/gm, "")
    .replace(/(\*\*\*|___)(.+?)\1/g, "$2")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/==(.+?)==/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatPreviewMessageText(body: string): string {
  if (body.includes("__JATEXT_E2EE_V1__:")) {
    const labelPart = body
      .replace(/__JATEXT_E2EE_V1__:[\s\S]*$/m, "")
      .replace(/[\u200B\u200C\u2063]/g, "")
      .trim();
    return labelPart || "New message";
  }
  const clean = stripBubbleStyleFromText(body).replace(/[\u200B\u200C\u2063]/g, "");
  if (isHiddenCallSignal(clean)) return "";
  if (clean.startsWith(GROUP_CALL_INVITE_PREFIX)) {
    try {
      const parsed = JSON.parse(clean.slice(GROUP_CALL_INVITE_PREFIX.length)) as {
        mode?: string;
        state?: string;
        durationSec?: number;
        ts?: number;
      };
      const label = parsed.mode === "video" ? "Group video call" : "Group voice call";
      const ageMs = parsed.ts && parsed.ts > 0 ? Date.now() - parsed.ts : 0;
      if (parsed.state === "active" && ageMs < 55_000) {
        return `${label} · Join call`;
      }
      if (parsed.durationSec && parsed.durationSec > 0) {
        return `GC VC Ended · ${formatCallDuration(parsed.durationSec)}`;
      }
      return "GC VC Ended";
    } catch {
      return "Group call";
    }
  }
  const wp = parseWallpaperSignal(clean);
  if (wp) {
    return wp.kind === "none" ? "Reset the chat wallpaper" : "Changed the chat wallpaper";
  }
  const invite = parseCallInvite(clean);
  if (invite) {
    const kind = invite.mode === "video" ? "Video call" : "Voice call";
    const ageMs = invite.ts > 0 ? Date.now() - invite.ts : 0;
    if (invite.state === "ringing") {
      return ageMs > 60_000 ? `Missed ${kind.toLowerCase()}` : `${kind} · Ringing…`;
    }
    if (invite.state === "connected") {
      return ageMs > 4 * 60 * 60 * 1000 ? `${kind} ended` : `${kind} · In call`;
    }
    if (invite.state === "missed") return `Missed ${kind.toLowerCase()}`;
    if (invite.state === "declined") return `Declined ${kind.toLowerCase()}`;
    if (invite.durationSec && invite.durationSec > 0) {
      return `${kind} · ${formatCallDuration(invite.durationSec)}`;
    }
    return `${kind} ended`;
  }
  return stripMarkdownForPreview(clean);
}

function waitForIceGathering(pc: RTCPeerConnection, maxWaitMs = 2000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let srflxTimer: number | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(hardTimer);
      if (srflxTimer !== null) window.clearTimeout(srflxTimer);
      pc.removeEventListener("icegatheringstatechange", onStateChange);
      pc.removeEventListener("icecandidate", onCandidate);
      resolve();
    };
    const onStateChange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    const onCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (!event.candidate) {
        finish();
        return;
      }
      if (
        (event.candidate.candidate.includes(" typ srflx ") ||
          event.candidate.candidate.includes(" typ relay ")) &&
        srflxTimer === null
      ) {
        srflxTimer = window.setTimeout(finish, 240);
      }
    };
    const hardTimer = window.setTimeout(finish, maxWaitMs);
    pc.addEventListener("icegatheringstatechange", onStateChange);
    pc.addEventListener("icecandidate", onCandidate);
  });
}

let sharedCallAudioCtx: AudioContext | null = null;
function getCallAudioCtx(): AudioContext | null {
  if (typeof window.AudioContext === "undefined") return null;
  sharedCallAudioCtx ??= new window.AudioContext();
  if (sharedCallAudioCtx.state === "suspended") {
    void sharedCallAudioCtx.resume().catch(() => undefined);
  }
  return sharedCallAudioCtx;
}

const SOUNDBOARD_FILE_MAP: Record<SoundboardEffectId, string> = {
  bruh: "/sounds/bruh.mp3",
  tada: "/sounds/bruh.mp3",
  rimshot: "/sounds/rimshot.mp3",
  chime: "/sounds/chime.mp3",
  laser: "/sounds/laser.mp3",
  cheer: "/sounds/cheer.mp3",
};

const decodedSoundboardBuffers = new Map<string, AudioBuffer>();
const loadingSoundboardPromises = new Map<string, Promise<AudioBuffer | null>>();

function loadSoundboardBuffer(url: string): Promise<AudioBuffer | null> {
  const cached = decodedSoundboardBuffers.get(url);
  if (cached) return Promise.resolve(cached);
  const inflight = loadingSoundboardPromises.get(url);
  if (inflight) return inflight;

  const ctx = getCallAudioCtx();
  if (!ctx) return Promise.resolve(null);

  const task = fetch(url)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error("Audio fetch failed"))))
    .then((bytes) => ctx.decodeAudioData(bytes.slice(0)))
    .then((buffer) => {
      decodedSoundboardBuffers.set(url, buffer);
      return buffer;
    })
    .catch(() => null)
    .finally(() => {
      loadingSoundboardPromises.delete(url);
    });

  loadingSoundboardPromises.set(url, task);
  return task;
}

export function preloadSoundboardAudio(): void {
  const uniqueUrls = new Set(Object.values(SOUNDBOARD_FILE_MAP));
  for (const url of uniqueUrls) {
    void loadSoundboardBuffer(url);
  }
}

export function playSynthesizedSoundboard(effectId: SoundboardEffectId): void {
  const url = SOUNDBOARD_FILE_MAP[effectId] ?? SOUNDBOARD_FILE_MAP.bruh;
  const ctx = getCallAudioCtx();
  const cached = decodedSoundboardBuffers.get(url);

  if (ctx && cached) {
    try {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = cached;
      gain.gain.value = 0.92;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
      return;
    } catch {
      // Fall through to HTMLAudioElement playback.
    }
  }

  // Trigger async decode for next play, and play immediately via HTMLAudioElement right now
  void loadSoundboardBuffer(url);
  try {
    const audio = new Audio(url);
    audio.volume = 0.92;
    void audio.play().catch(() => undefined);
  } catch {
    // Ignore audio playback errors.
  }
}

export function playCallRingChime(kind: "incoming" | "outgoing" | "connected" | "ended"): void {
  const ctx = getCallAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (kind === "incoming") {
    const pattern = [
      { f: 659.25, t: 0, d: 0.16 },
      { f: 783.99, t: 0.18, d: 0.16 },
      { f: 1046.5, t: 0.36, d: 0.28 },
    ];
    for (const step of pattern) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(step.f, now + step.t);
      gain.gain.setValueAtTime(0.001, now + step.t);
      gain.gain.exponentialRampToValueAtTime(0.14, now + step.t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + step.t + step.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + step.t);
      osc.stop(now + step.t + step.d + 0.02);
    }
  } else if (kind === "outgoing") {
    for (const freq of [440, 480]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.055, now + 0.04);
      gain.gain.setValueAtTime(0.055, now + 0.75);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.88);
    }
  } else if (kind === "connected") {
    [587.33, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.1, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.2);
    });
  } else {
    [523.25, 392].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.1, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.2);
    });
  }
}

interface WebSpeechInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used inside <CallProvider>");
  return ctx;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const store = useJaText();
  const { me, friends, previews, activeChatId, activeMessages, soundsEnabled } = store;

  const [session, setSession] = useState<ActiveCallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeakerphone, setIsSpeakerphone] = useState(true);
  const [studioAudioEnabled, setStudioAudioEnabled] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"spotlight" | "grid">("spotlight");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [meSpeaking, setMeSpeaking] = useState(false);
  const [peerMuted, setPeerMuted] = useState(false);
  const [peerCameraOff, setPeerCameraOff] = useState(true);
  const [peerScreenSharing, setPeerScreenSharing] = useState(false);
  const [peerSpeaking, setPeerSpeaking] = useState(false);
  const [reactions, setReactions] = useState<FloatingCallReaction[]>([]);
  const [captions, setCaptions] = useState<CallCaptionLine[]>([]);
  const [callError, setCallError] = useState<string | null>(null);
  const [mobileSharePickerOpen, setMobileSharePickerOpen] = useState(false);
  const [sharedMediaVideoElement, setSharedMediaVideoElement] = useState<HTMLVideoElement | null>(
    null,
  );
  const [stats, setStats] = useState<CallConnectionStats>({
    rttMs: null,
    bitrateKbps: null,
    resolution: null,
    routeType: "P2P",
    connectionState: "new",
  });

  const sessionRef = useRef<ActiveCallSession | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const rawMicTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const studioGraphRef = useRef<{
    ctx: AudioContext;
    processedTrack: MediaStreamTrack;
  } | null>(null);
  const handledCallIdsRef = useRef(new Set<string>());
  const processedSignalIdsRef = useRef(new Set<string>());
  const myInteractionTsRef = useRef<number | null>(null);
  const dominantPeerDeviceRef = useRef<string | null>(null);
  const ringIntervalRef = useRef<number | null>(null);
  const ringTimeoutRef = useRef<number | null>(null);
  const prevBytesRef = useRef<{ bytes: number; ts: number } | null>(null);
  const captionSpeechRef = useRef<WebSpeechInstance | null>(null);
  const nativeCaptionListenerRef = useRef<PluginListenerHandle | null>(null);
  const activeScreenShareRef = useRef<ActiveScreenShareSession | null>(null);
  const screenAudioMixerRef = useRef<ScreenAudioMixer | null>(null);
  const remoteAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const isDeafenedRef = useRef(false);
  const stateRef = useRef({
    isMuted: false,
    isCameraOff: true,
    isScreenSharing: false,
    meSpeaking: false,
  });

  useEffect(() => {
    sessionRef.current = session;
    if (session) {
      preloadSoundboardAudio();
    }
  }, [session]);

  useEffect(() => {
    isDeafenedRef.current = isDeafened;
  }, [isDeafened]);

  useEffect(() => {
    stateRef.current = { isMuted, isCameraOff, isScreenSharing, meSpeaking };
  }, [isCameraOff, isMuted, isScreenSharing, meSpeaking]);

  // Keep a persistent hidden <audio> element playing remote audio even when minimized or switching layouts
  useEffect(() => {
    let audio = remoteAudioElementRef.current;
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      remoteAudioElementRef.current = audio;
    }
    audio.muted = isDeafened;
    if (remoteStream) {
      if (audio.srcObject !== remoteStream) {
        audio.srcObject = remoteStream;
      }
      void audio.play().catch(() => undefined);
    } else {
      audio.srcObject = null;
    }
  }, [isDeafened, remoteStream]);

  const sendDataChannelPacket = useCallback((packet: DataChannelMessage) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") {
      try {
        dc.send(JSON.stringify(packet));
      } catch {
        // Ignore transient buffer errors.
      }
    }
  }, []);

  const broadcastMyState = useCallback(
    (overrides?: Partial<typeof stateRef.current>) => {
      const merged = { ...stateRef.current, ...overrides };
      sendDataChannelPacket({
        type: "peer-state",
        muted: merged.isMuted,
        cameraOff: merged.isCameraOff,
        screenSharing: merged.isScreenSharing,
        speaking: merged.meSpeaking,
      });
    },
    [sendDataChannelPacket],
  );

  const spawnReaction = useCallback((emoji: string, fromMe: boolean, customId?: string) => {
    const id = customId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const leftPct = 18 + Math.round(Math.random() * 64);
    setReactions((prev) => [...prev.slice(-14), { id, emoji, fromMe, leftPct }]);
    window.setTimeout(() => {
      setReactions((prev) => prev.filter((item) => item.id !== id));
    }, 2800);
  }, []);

  const stopRingingTimers = useCallback(() => {
    stopIncomingCallRingtone();
    if (Capacitor.isNativePlatform()) {
      void JaTextNative.cancelIncomingCallWake().catch(() => undefined);
    }
    if (ringIntervalRef.current !== null) {
      window.clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    if (ringTimeoutRef.current !== null) {
      window.clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  const stopCaptionCapture = useCallback(() => {
    if (captionSpeechRef.current) {
      try {
        captionSpeechRef.current.onend = null;
        captionSpeechRef.current.stop();
      } catch {
        // Ignore.
      }
      captionSpeechRef.current = null;
    }
    if (nativeCaptionListenerRef.current) {
      void nativeCaptionListenerRef.current.remove();
      nativeCaptionListenerRef.current = null;
    }
    if (Capacitor.isNativePlatform()) {
      void JaTextNative.stopSpeechCapture().catch(() => undefined);
    }
  }, []);

  const stopNativeScreenShareInternal = useCallback((notifyNativeService: boolean) => {
    if (activeScreenShareRef.current) {
      activeScreenShareRef.current.stop(notifyNativeService);
      activeScreenShareRef.current = null;
    } else if (notifyNativeService && Capacitor.isNativePlatform()) {
      void JaTextNative.stopScreenCapture().catch(() => undefined);
    }
    if (screenAudioMixerRef.current) {
      screenAudioMixerRef.current.dispose();
      screenAudioMixerRef.current = null;
    }
    setSharedMediaVideoElement(null);
    setMobileSharePickerOpen(false);
  }, []);

  const cleanupCallResources = useCallback(() => {
    stopRingingTimers();
    stopCaptionCapture();
    stopNativeScreenShareInternal(true);
    void configureNativeCallAudio(false, false);

    if (dcRef.current) {
      try {
        dcRef.current.close();
      } catch {
        // Ignore.
      }
      dcRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // Ignore.
      }
      pcRef.current = null;
    }
    audioSenderRef.current = null;
    videoSenderRef.current = null;

    if (rawMicTrackRef.current) {
      rawMicTrackRef.current.stop();
      rawMicTrackRef.current = null;
    }
    if (cameraTrackRef.current) {
      cameraTrackRef.current.stop();
      cameraTrackRef.current = null;
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (studioGraphRef.current) {
      studioGraphRef.current.processedTrack.stop();
      void studioGraphRef.current.ctx.close().catch(() => undefined);
      studioGraphRef.current = null;
    }
    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.srcObject = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsDeafened(false);
    setIsCameraOff(true);
    setIsScreenSharing(false);
    setStudioAudioEnabled(false);
    setCaptionsEnabled(false);
    setMinimized(false);
    setMeSpeaking(false);
    setPeerMuted(false);
    setPeerCameraOff(true);
    setPeerScreenSharing(false);
    setPeerSpeaking(false);
    setReactions([]);
    setCaptions([]);
    prevBytesRef.current = null;
    myInteractionTsRef.current = null;
    dominantPeerDeviceRef.current = null;
  }, [stopCaptionCapture, stopNativeScreenShareInternal, stopRingingTimers]);

  const sendSignalPacket = useCallback(
    async (receiverId: string, packet: SignalEnvelope) => {
      const stamped: SignalEnvelope = {
        ...packet,
        deviceSessionId: packet.deviceSessionId ?? CALL_DEVICE_SESSION_ID,
      };
      const header = `${CALL_SIGNAL_PREFIX}${JSON.stringify({
        callId: stamped.callId,
        type: stamped.type,
        deviceSessionId: stamped.deviceSessionId,
        cameraOff: stamped.cameraOff,
        ts: stamped.ts,
      })}`;
      if (stamped.sdp) {
        const file = new File([JSON.stringify(stamped)], "call-signal.json", {
          type: "application/x-jatext-call+json",
        });
        await store.sendMessage(receiverId, header, file);
      } else {
        await store.sendMessage(receiverId, header);
      }
    },
    [store],
  );

  const readSignalEnvelope = useCallback(async (msg: ChatMessage): Promise<SignalEnvelope | null> => {
    if (msg.e2ee?.encrypted && !msg.e2ee.decrypted) {
      return null;
    }
    // If this signal carries an attachment (SDP offer/answer/ICE batch), wait until its decrypted blob URL is ready!
    if (msg.attachmentName && !msg.attachmentUrl) {
      return null;
    }
    if (msg.attachmentUrl) {
      try {
        const res = await fetch(msg.attachmentUrl);
        if (res.ok) {
          const json = (await res.json()) as SignalEnvelope;
          if (json && json.callId && json.type) return json;
        }
      } catch {
        if (msg.attachmentName) return null;
      }
    }
    if (msg.body.startsWith(CALL_SIGNAL_PREFIX)) {
      try {
        const parsed = JSON.parse(msg.body.slice(CALL_SIGNAL_PREFIX.length)) as SignalEnvelope;
        if (
          (parsed.type === "answer" ||
            parsed.type === "renegotiate-offer" ||
            parsed.type === "renegotiate-answer") &&
          !parsed.sdp
        ) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  const refreshLocalPreviewStream = useCallback(() => {
    const tracks: MediaStreamTrack[] = [];
    if (rawMicTrackRef.current) tracks.push(rawMicTrackRef.current);
    const activeVideo = screenTrackRef.current ?? cameraTrackRef.current;
    if (activeVideo && activeVideo.readyState === "live") {
      tracks.push(activeVideo);
    }
    setLocalStream(tracks.length > 0 ? new MediaStream(tracks) : null);
  }, []);

  const wireDataChannel = useCallback(
    (dc: RTCDataChannel, peerName: string) => {
      dcRef.current = dc;
      dc.onopen = () => {
        broadcastMyState();
      };
      dc.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          const msg = JSON.parse(event.data) as DataChannelMessage;
          if (msg.type === "peer-state") {
            setPeerMuted(msg.muted);
            setPeerCameraOff(msg.cameraOff);
            setPeerScreenSharing(msg.screenSharing);
            setPeerSpeaking(msg.speaking);
            if (!msg.cameraOff || msg.screenSharing) {
              setRemoteStream((prev) => (prev ? new MediaStream(prev.getTracks()) : prev));
            }
          } else if (msg.type === "reaction") {
            spawnReaction(msg.emoji, false, msg.id);
          } else if (msg.type === "soundboard") {
            if (!isDeafenedRef.current) {
              playSynthesizedSoundboard(msg.effectId);
            }
          } else if (msg.type === "caption") {
            if (msg.text.trim()) {
              setCaptions((prev) => {
                const rest = prev.filter((c) => c.speakerName !== peerName);
                return [
                  ...rest.slice(-2),
                  { speakerName: peerName, text: msg.text.trim(), updatedAt: Date.now() },
                ];
              });
            }
          } else if (msg.type === "renegotiate-offer") {
            const pc = pcRef.current;
            if (!pc) return;
            void (async () => {
              try {
                await pc.setRemoteDescription(msg.sdp);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                if (pc.localDescription) {
                  sendDataChannelPacket({
                    type: "renegotiate-answer",
                    sdp: pc.localDescription.toJSON(),
                  });
                }
              } catch {
                // Ignore renegotiation glare.
              }
            })();
          } else if (msg.type === "renegotiate-answer") {
            const pc = pcRef.current;
            if (pc && pc.signalingState === "have-local-offer") {
              void pc.setRemoteDescription(msg.sdp).catch(() => undefined);
            }
          } else if (msg.type === "hangup") {
            const current = sessionRef.current;
            if (current) {
              handledCallIdsRef.current.add(current.callId);
              const durationSec = current.startedAt
                ? Math.max(1, Math.round((Date.now() - current.startedAt) / 1000))
                : 0;
              const wasConnected = current.phase === "connected" || current.startedAt !== null;
              updateCallHistoryStatus(current.callId, {
                state: wasConnected ? "ended" : "missed",
                durationSec: wasConnected ? durationSec : undefined,
              });
              if (current.isCaller && current.inviteMessageId) {
                void store
                  .editMessage(
                    current.inviteMessageId,
                    serializeCallInvite({
                      v: 1,
                      callId: current.callId,
                      mode: current.mode,
                      state: wasConnected ? "ended" : "missed",
                      durationSec: wasConnected ? durationSec : undefined,
                      ts: Date.now(),
                    }),
                  )
                  .catch(() => undefined);
              }
              if (soundsEnabled) playCallRingChime("ended");
              cleanupCallResources();
              setSession(null);
            }
          }
        } catch {
          // Ignore malformed data channel frame.
        }
      };
    },
    [broadcastMyState, cleanupCallResources, sendDataChannelPacket, soundsEnabled, spawnReaction],
  );

  const createConfiguredPeerConnection = useCallback(
    (peer: JaUser, isCaller: boolean) => {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;

      const inboundStream = new MediaStream();
      setRemoteStream(inboundStream);

      pc.ontrack = (event) => {
        if (event.track) {
          const existing = inboundStream.getTracks().find((t) => t.id === event.track.id);
          if (!existing) {
            inboundStream.addTrack(event.track);
            setRemoteStream(new MediaStream(inboundStream.getTracks()));
          }
          event.track.onunmute = () => {
            setRemoteStream(new MediaStream(inboundStream.getTracks()));
          };
        }
      };

      if (isCaller) {
        const dc = pc.createDataChannel("jatext-call", { ordered: true });
        wireDataChannel(dc, peer.displayName);
      } else {
        pc.ondatachannel = (event) => {
          wireDataChannel(event.channel, peer.displayName);
        };
      }

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setStats((prev) => ({ ...prev, connectionState: state }));
        if (state === "connected") {
          stopRingingTimers();
          if (soundsEnabled) playCallRingChime("connected");
          setSession((cur) =>
            cur
              ? {
                  ...cur,
                  phase: "connected",
                  startedAt: cur.startedAt ?? Date.now(),
                }
              : null,
          );
          broadcastMyState();
        } else if (state === "failed" && isCaller && pc.signalingState === "stable") {
          void (async () => {
            try {
              const restartOffer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(restartOffer);
              const sdp = pc.localDescription?.toJSON() ?? restartOffer;
              if (dcRef.current?.readyState === "open") {
                sendDataChannelPacket({
                  type: "renegotiate-offer",
                  sdp,
                });
              } else if (sessionRef.current) {
                await sendSignalPacket(peer.id, {
                  callId: sessionRef.current.callId,
                  type: "renegotiate-offer",
                  sdp,
                  ts: Date.now(),
                });
              }
            } catch {
              // Ignore.
            }
          })();
        }
      };

      return pc;
    },
    [
      broadcastMyState,
      sendDataChannelPacket,
      sendSignalPacket,
      soundsEnabled,
      stopRingingTimers,
      wireDataChannel,
    ],
  );

  // Detect local speaking level while in a call
  useEffect(() => {
    if (!session || session.phase !== "connected" || !localStream || isMuted) {
      setMeSpeaking(false);
      return;
    }
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    let rafId: number | null = null;
    let audioCtx: AudioContext | null = null;
    let lastSpoke = false;
    try {
      audioCtx = new window.AudioContext();
      const src = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      let lastSentAt = 0;

      const poll = () => {
        analyser.getByteFrequencyData(buf);
        let total = 0;
        for (let i = 0; i < 24; i++) total += buf[i] ?? 0;
        const speaking = total / 24 > 24;
        if (speaking !== lastSpoke) {
          lastSpoke = speaking;
          setMeSpeaking(speaking);
          const now = performance.now();
          if (now - lastSentAt > 220) {
            lastSentAt = now;
            broadcastMyState({ meSpeaking: speaking });
          }
        }
        rafId = window.requestAnimationFrame(poll);
      };
      rafId = window.requestAnimationFrame(poll);
    } catch {
      // Non-critical.
    }

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (audioCtx) void audioCtx.close().catch(() => undefined);
    };
  }, [broadcastMyState, isMuted, localStream, session]);

  // Poll WebRTC connection stats every 2 seconds while connected
  useEffect(() => {
    if (!session || session.phase !== "connected") return;
    const interval = window.setInterval(() => {
      const pc = pcRef.current;
      if (!pc) return;
      void pc
        .getStats()
        .then((report) => {
          let rttMs: number | null = null;
          let bytesTransferred = 0;
          let routeType = "P2P";
          let resolution: string | null = null;
          let activeLocalCandidateId: string | null = null;

          report.forEach((stat: Record<string, unknown>) => {
            if (stat.type === "candidate-pair" && stat.state === "succeeded" && stat.nominated) {
              if (typeof stat.currentRoundTripTime === "number") {
                rttMs = Math.round(stat.currentRoundTripTime * 1000);
              }
              if (typeof stat.localCandidateId === "string") {
                activeLocalCandidateId = stat.localCandidateId;
              }
            }
            if (stat.type === "inbound-rtp" || stat.type === "outbound-rtp") {
              if (typeof stat.bytesReceived === "number") bytesTransferred += stat.bytesReceived;
              if (typeof stat.bytesSent === "number") bytesTransferred += stat.bytesSent;
              if (
                stat.type === "inbound-rtp" &&
                stat.kind === "video" &&
                typeof stat.frameWidth === "number" &&
                typeof stat.frameHeight === "number"
              ) {
                resolution = `${stat.frameWidth}×${stat.frameHeight}`;
              }
            }
          });

          if (activeLocalCandidateId) {
            const localCand = report.get(activeLocalCandidateId) as Record<string, unknown> | undefined;
            if (localCand && typeof localCand.candidateType === "string") {
              routeType =
                localCand.candidateType === "host"
                  ? "Direct LAN"
                  : localCand.candidateType === "srflx" || localCand.candidateType === "prflx"
                    ? "STUN NAT"
                    : localCand.candidateType.toUpperCase();
            }
          }

          const now = Date.now();
          let bitrateKbps: number | null = null;
          if (prevBytesRef.current && now > prevBytesRef.current.ts) {
            const deltaBytes = Math.max(0, bytesTransferred - prevBytesRef.current.bytes);
            const deltaSec = (now - prevBytesRef.current.ts) / 1000;
            bitrateKbps = Math.round((deltaBytes * 8) / 1000 / deltaSec);
          }
          prevBytesRef.current = { bytes: bytesTransferred, ts: now };

          setStats({
            rttMs,
            bitrateKbps,
            resolution,
            routeType,
            connectionState: pc.connectionState,
          });
        })
        .catch(() => undefined);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [session]);

  const startCall = useCallback(
    async (peer: JaUser, mode: CallMode) => {
      if (!me) return;
      if (sessionRef.current && sessionRef.current.phase !== "dismissed") {
        setMinimized(false);
        return;
      }
      if (sessionRef.current?.phase === "dismissed") {
        cleanupCallResources();
        sessionRef.current = null;
        setSession(null);
      }
      setCallError(null);

      const permitted = await ensureNativeMediaPermissions(mode === "video");
      if (!permitted) {
        setCallError("Allow microphone and camera permissions to start a call.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCallError("Voice and video calling requires microphone access in a secure browser or app.");
        return;
      }

      let media: MediaStream;
      let actualMode: CallMode = mode;
      try {
        media = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          ...(mode === "video"
            ? {
                video: {
                  facingMode: "user",
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                },
              }
            : {}),
        });
      } catch (err) {
        if (mode === "video") {
          try {
            media = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
            actualMode = "voice";
          } catch {
            setCallError("Could not access your microphone. Check permissions and try again.");
            return;
          }
        } else {
          setCallError(
            err instanceof Error && err.name === "NotAllowedError"
              ? "Microphone permission was denied."
              : "Could not access your microphone.",
          );
          return;
        }
      }

      const callId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      handledCallIdsRef.current.add(callId);

      const micTrack = media.getAudioTracks()[0] ?? null;
      const camTrack = media.getVideoTracks()[0] ?? null;
      rawMicTrackRef.current = micTrack;
      cameraTrackRef.current = camTrack;
      setIsMuted(false);
      setIsCameraOff(!camTrack);
      setPeerCameraOff(true);
      setFacingMode("user");
      const defaultSpeaker = actualMode === "video" || !Capacitor.isNativePlatform();
      setIsSpeakerphone(defaultSpeaker);
      void configureNativeCallAudio(true, defaultSpeaker, {
        video: Boolean(camTrack),
        title: peer.displayName,
      });
      refreshLocalPreviewStream();

      const newSession: ActiveCallSession = {
        callId,
        peer,
        mode: actualMode,
        phase: "outgoing",
        isCaller: true,
        startedAt: null,
      };
      setSession(newSession);
      setMinimized(false);
      upsertCallHistoryEntry({
        callId,
        kind: "dm",
        peerId: peer.id,
        peerDisplayName: peer.displayName,
        peerUsername: peer.username,
        peerAvatarUrl: peer.avatarUrl,
        peerAvatarColor: peer.avatarColor,
        direction: "outgoing",
        mode: actualMode,
        state: "ringing",
        timestamp: Date.now(),
      });

      const pc = createConfiguredPeerConnection(peer, true);
      const outbound = new MediaStream();
      if (micTrack) outbound.addTrack(micTrack);
      if (camTrack) outbound.addTrack(camTrack);

      const audioTransceiver = pc.addTransceiver(micTrack ?? "audio", {
        direction: "sendrecv",
        streams: [outbound],
      });
      const videoTransceiver = pc.addTransceiver(camTrack ?? "video", {
        direction: "sendrecv",
        streams: [outbound],
      });
      audioSenderRef.current = audioTransceiver.sender;
      videoSenderRef.current = videoTransceiver.sender;

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGathering(pc, 950);

        const finalOffer = pc.localDescription?.toJSON() ?? offer;
        const invitePayload: CallInvitePayload = {
          v: 1,
          callId,
          mode: actualMode,
          state: "ringing",
          ts: Date.now(),
        };
        const offerEnvelope: SignalEnvelope = {
          callId,
          type: "offer",
          mode: actualMode,
          sdp: finalOffer,
          cameraOff: !camTrack,
          ts: Date.now(),
        };
        const signalFile = new File([JSON.stringify(offerEnvelope)], "call-offer.json", {
          type: "application/x-jatext-call+json",
        });

        await store.sendMessage(peer.id, serializeCallInvite(invitePayload), signalFile);

        // Locate the created invite message ID so we can update its final duration when ended
        const recent = await store.fetchMessagesWithUser(peer.id).catch(() => []);
        const createdInvite = [...recent]
          .reverse()
          .find((m) => parseCallInvite(m.body)?.callId === callId);
        if (createdInvite) {
          setSession((cur) =>
            cur && cur.callId === callId ? { ...cur, inviteMessageId: createdInvite.id } : cur,
          );
        }

        if (soundsEnabled) {
          playCallRingChime("outgoing");
          ringIntervalRef.current = window.setInterval(() => {
            playCallRingChime("outgoing");
          }, 3000);
        }

        ringTimeoutRef.current = window.setTimeout(() => {
          const cur = sessionRef.current;
          if (cur && cur.callId === callId && cur.phase === "outgoing") {
            const msgId = cur.inviteMessageId;
            if (msgId) {
              void store
                .editMessage(
                  msgId,
                  serializeCallInvite({
                    v: 1,
                    callId,
                    mode: cur.mode,
                    state: "missed",
                    ts: Date.now(),
                  }),
                )
                .catch(() => undefined);
            }
            updateCallHistoryStatus(callId, { state: "missed" });
            void sendSignalPacket(peer.id, {
              callId,
              type: "hangup",
              ts: Date.now(),
            }).catch(() => undefined);
            cleanupCallResources();
            setMinimized(false);
            setSession({ ...cur, phase: "dismissed" });
          }
        }, CALL_RING_TIMEOUT_MS);
      } catch {
        cleanupCallResources();
        setSession(null);
        setCallError("Could not start the call. Please check your connection and try again.");
      }
    },
    [
      cleanupCallResources,
      createConfiguredPeerConnection,
      me,
      refreshLocalPreviewStream,
      sendSignalPacket,
      soundsEnabled,
      store,
    ],
  );

  // Watch previews & activeMessages globally for incoming call invites!
  useEffect(() => {
    if (!me || session) return;
    const now = Date.now();

    for (const preview of previews) {
      if (preview.senderId === me.id) continue;
      if (now - preview.createdAt > CALL_RING_TIMEOUT_MS) continue;
      const invite = parseCallInvite(preview.body);
      if (!invite || invite.state !== "ringing") continue;
      if (handledCallIdsRef.current.has(invite.callId)) continue;

      const caller = friends.find((f) => f.id === preview.friendId);
      if (!caller) continue;

      handledCallIdsRef.current.add(invite.callId);
      setSession({
        callId: invite.callId,
        peer: caller,
        mode: invite.mode,
        phase: "incoming",
        isCaller: false,
        startedAt: null,
      });
      setMinimized(false);
      upsertCallHistoryEntry({
        callId: invite.callId,
        kind: "dm",
        peerId: caller.id,
        peerDisplayName: caller.displayName,
        peerUsername: caller.username,
        peerAvatarUrl: caller.avatarUrl,
        peerAvatarColor: caller.avatarColor,
        direction: "incoming",
        mode: invite.mode,
        state: "ringing",
        timestamp: invite.ts || Date.now(),
      });

      if (!preview.isMuted && me.statusPreference !== "dnd") {
        if (Capacitor.isNativePlatform()) {
          void JaTextNative.triggerIncomingCallWake({
            senderId: caller.id,
            callerTitle: caller.displayName,
            isVideo: invite.mode === "video",
          }).catch(() => undefined);
        }
        if (soundsEnabled) {
          startIncomingCallRingtone();
        }
      }

      ringTimeoutRef.current = window.setTimeout(() => {
        const cur = sessionRef.current;
        if (cur && cur.callId === invite.callId && cur.phase === "incoming") {
          updateCallHistoryStatus(invite.callId, { state: "missed" });
          cleanupCallResources();
          setMinimized(false);
          setSession({ ...cur, phase: "dismissed" });
        }
      }, CALL_RING_TIMEOUT_MS);
      break;
    }
  }, [cleanupCallResources, friends, me, previews, session, soundsEnabled]);

  // Process signaling packets while a call is active (outgoing, incoming, connecting, connected)
  useEffect(() => {
    if (!session || session.phase === "dismissed" || !me) return;
    let cancelled = false;

    const inspectMessages = async (messages: ChatMessage[]) => {
      if (cancelled) return;
      for (const msg of messages) {
        // Multi-device dominance: inspect signals emitted by ANOTHER device logged into our same account!
        if (msg.senderId === me.id) {
          if (!isHiddenCallSignal(msg.body) || processedSignalIdsRef.current.has(msg.id)) {
            continue;
          }
          const ownEnv = await readSignalEnvelope(msg);
          if (!ownEnv || ownEnv.callId !== session.callId) continue;
          processedSignalIdsRef.current.add(msg.id);

          if (ownEnv.deviceSessionId && ownEnv.deviceSessionId !== CALL_DEVICE_SESSION_ID) {
            if (
              ownEnv.type === "claim" ||
              ownEnv.type === "answer" ||
              ownEnv.type === "decline" ||
              ownEnv.type === "hangup"
            ) {
              const myTs = myInteractionTsRef.current;
              const otherDominates =
                session.phase === "incoming" ||
                (session.phase === "outgoing" && ownEnv.type === "hangup") ||
                myTs === null ||
                ownEnv.ts < myTs ||
                (ownEnv.ts === myTs && ownEnv.deviceSessionId < CALL_DEVICE_SESSION_ID);

              if (otherDominates) {
                handledCallIdsRef.current.add(session.callId);
                updateCallHistoryStatus(session.callId, {
                  state: ownEnv.type === "decline" ? "declined" : "connected",
                });
                cleanupCallResources();
                setSession(null);
                return;
              }
            }
          }
          continue;
        }

        // Check if caller updated the invite card to missed/ended/connected while we were ringing
        const invite = parseCallInvite(msg.body);
        if (invite && invite.callId === session.callId) {
          if (invite.state === "missed" || invite.state === "ended" || invite.state === "declined") {
            cleanupCallResources();
            if (session.phase === "incoming" || session.phase === "outgoing") {
              setMinimized(false);
              setSession((cur) => (cur ? { ...cur, phase: "dismissed" } : null));
            } else {
              setSession(null);
            }
            return;
          }
          if (invite.state === "connected" && session.phase === "incoming") {
            // Another device on our account already answered and connected this call!
            handledCallIdsRef.current.add(session.callId);
            cleanupCallResources();
            setSession(null);
            return;
          }
        }

        if (!isHiddenCallSignal(msg.body) || processedSignalIdsRef.current.has(msg.id)) {
          continue;
        }
        const env = await readSignalEnvelope(msg);
        if (!env || env.callId !== session.callId) continue;

        processedSignalIdsRef.current.add(msg.id);
        // Defer deleting signal for 45s so any sibling devices logged into our account also see it!
        window.setTimeout(() => {
          void store.deleteMessageForMe(msg.id).catch(() => undefined);
        }, 45_000);

        if (env.type === "claim" && session.isCaller) {
          if (!dominantPeerDeviceRef.current && env.deviceSessionId) {
            dominantPeerDeviceRef.current = env.deviceSessionId;
          }
          continue;
        }

        if (env.type === "decline" || env.type === "hangup") {
          // Ignore non-dominant secondary device decline if another device already claimed/answered!
          if (
            env.type === "decline" &&
            dominantPeerDeviceRef.current &&
            env.deviceSessionId &&
            env.deviceSessionId !== dominantPeerDeviceRef.current
          ) {
            continue;
          }
          if (
            env.type === "hangup" &&
            session.phase === "connected" &&
            dominantPeerDeviceRef.current &&
            env.deviceSessionId &&
            env.deviceSessionId !== dominantPeerDeviceRef.current
          ) {
            continue;
          }
          const durationSec = session.startedAt
            ? Math.max(1, Math.round((Date.now() - session.startedAt) / 1000))
            : 0;
          const wasConnected = session.phase === "connected" || session.startedAt !== null;
          const finalState: CallInviteState =
            env.type === "decline" ? "declined" : wasConnected ? "ended" : "missed";
          updateCallHistoryStatus(session.callId, {
            state: finalState,
            durationSec: finalState === "ended" ? durationSec : undefined,
          });
          if (session.isCaller && session.inviteMessageId) {
            void store
              .editMessage(
                session.inviteMessageId,
                serializeCallInvite({
                  v: 1,
                  callId: session.callId,
                  mode: session.mode,
                  state: finalState,
                  durationSec: finalState === "ended" ? durationSec : undefined,
                  ts: Date.now(),
                }),
              )
              .catch(() => undefined);
          }
          if (soundsEnabled) playCallRingChime("ended");
          cleanupCallResources();
          if (!wasConnected) {
            setMinimized(false);
            setSession((cur) => (cur ? { ...cur, phase: "dismissed" } : null));
          } else {
            setSession(null);
          }
          return;
        }

        if (env.type === "answer" && session.isCaller && env.sdp) {
          if (
            dominantPeerDeviceRef.current &&
            env.deviceSessionId &&
            env.deviceSessionId !== dominantPeerDeviceRef.current
          ) {
            continue;
          }
          if (env.deviceSessionId) {
            dominantPeerDeviceRef.current = env.deviceSessionId;
          }
          const pc = pcRef.current;
          if (pc && pc.signalingState === "have-local-offer") {
            stopRingingTimers();
            setPeerCameraOff(env.cameraOff !== false);
            setSession((cur) => (cur ? { ...cur, phase: "connecting" } : null));
            try {
              await pc.setRemoteDescription(env.sdp);
              if (session.inviteMessageId) {
                void store
                  .editMessage(
                    session.inviteMessageId,
                    serializeCallInvite({
                      v: 1,
                      callId: session.callId,
                      mode: session.mode,
                      state: "connected",
                      ts: Date.now(),
                    }),
                  )
                  .catch(() => undefined);
              }
            } catch {
              // Ignore duplicate answer.
            }
          }
          continue;
        }

        if (env.type === "renegotiate-offer" && env.sdp) {
          const pc = pcRef.current;
          if (pc) {
            try {
              await pc.setRemoteDescription(env.sdp);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await waitForIceGathering(pc, 750);
              const finalSdp = pc.localDescription?.toJSON() ?? answer;
              if (dcRef.current?.readyState === "open") {
                sendDataChannelPacket({ type: "renegotiate-answer", sdp: finalSdp });
              } else {
                await sendSignalPacket(session.peer.id, {
                  callId: session.callId,
                  type: "renegotiate-answer",
                  sdp: finalSdp,
                  ts: Date.now(),
                });
              }
            } catch {
              // Ignore renegotiation glare.
            }
          }
          continue;
        }

        if (env.type === "renegotiate-answer" && env.sdp) {
          const pc = pcRef.current;
          if (pc && pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(env.sdp).catch(() => undefined);
          }
        }
      }
    };

    if (activeChatId === session.peer.id && activeMessages.length > 0) {
      void inspectMessages(activeMessages);
    }

    const pollInterval = window.setInterval(() => {
      void store
        .fetchMessagesWithUser(session.peer.id)
        .then((rows) => inspectMessages(rows))
        .catch(() => undefined);
    }, session.phase === "connected" ? 2800 : 900);

    // Run one immediate check as well
    void store
      .fetchMessagesWithUser(session.peer.id)
      .then((rows) => inspectMessages(rows))
      .catch(() => undefined);

    return () => {
      cancelled = true;
      window.clearInterval(pollInterval);
    };
  }, [
    activeChatId,
    activeMessages,
    cleanupCallResources,
    me,
    readSignalEnvelope,
    sendDataChannelPacket,
    sendSignalPacket,
    session,
    soundsEnabled,
    stopRingingTimers,
    store,
  ]);

  const acceptIncomingCall = useCallback(
    async (withVideo: boolean) => {
      const cur = sessionRef.current;
      if (!cur || cur.phase !== "incoming") return;
      const claimTs = Date.now();
      myInteractionTsRef.current = claimTs;
      stopRingingTimers();
      setCallError(null);
      setSession({ ...cur, phase: "connecting" });

      // Broadcast immediate multi-device dominance claim so any other device logged into our
      // account stops ringing right away (before getUserMedia + ICE finishes)!
      void sendSignalPacket(cur.peer.id, {
        callId: cur.callId,
        type: "claim",
        deviceSessionId: CALL_DEVICE_SESSION_ID,
        ts: claimTs,
      }).catch(() => undefined);

      const permitted = await ensureNativeMediaPermissions(withVideo);
      if (!permitted) {
        setCallError("Microphone permission is required to answer the call.");
        cleanupCallResources();
        setSession(null);
        return;
      }

      try {
        let inviteMsg: ChatMessage | undefined;
        for (let attempt = 0; attempt < 5; attempt++) {
          const rows = await store.fetchMessagesWithUser(cur.peer.id);
          inviteMsg = [...rows]
            .reverse()
            .find((m) => parseCallInvite(m.body)?.callId === cur.callId);
          if (inviteMsg?.attachmentUrl) break;
          await new Promise((r) => window.setTimeout(r, 250));
        }
        if (!inviteMsg || !inviteMsg.attachmentUrl) {
          throw new Error("Call offer is no longer available.");
        }
        const offerRes = await fetch(inviteMsg.attachmentUrl);
        if (!offerRes.ok) throw new Error("Could not read call offer.");
        const offerEnv = (await offerRes.json()) as SignalEnvelope;
        if (!offerEnv.sdp) throw new Error("Invalid call offer.");

        let media: MediaStream;
        try {
          media = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            ...(withVideo
              ? {
                  video: {
                    facingMode: "user",
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                  },
                }
              : {}),
          });
        } catch {
          media = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        }

        const micTrack = media.getAudioTracks()[0] ?? null;
        const camTrack = media.getVideoTracks()[0] ?? null;
        rawMicTrackRef.current = micTrack;
        cameraTrackRef.current = camTrack;
        setIsMuted(false);
        setIsCameraOff(!camTrack);
        setPeerCameraOff(offerEnv.cameraOff !== false);
        setFacingMode("user");
        const defaultSpeaker = withVideo || cur.mode === "video" || !Capacitor.isNativePlatform();
        setIsSpeakerphone(defaultSpeaker);
        void configureNativeCallAudio(true, defaultSpeaker, {
          video: Boolean(camTrack),
          title: cur.peer.displayName,
        });
        refreshLocalPreviewStream();

        const pc = createConfiguredPeerConnection(cur.peer, false);
        await pc.setRemoteDescription(offerEnv.sdp);

        const outbound = new MediaStream();
        if (micTrack) outbound.addTrack(micTrack);
        if (camTrack) outbound.addTrack(camTrack);

        for (const transceiver of pc.getTransceivers()) {
          const kind = transceiver.receiver.track?.kind;
          if (kind === "audio") {
            audioSenderRef.current = transceiver.sender;
            if (micTrack) await transceiver.sender.replaceTrack(micTrack);
            transceiver.direction = "sendrecv";
          } else if (kind === "video") {
            videoSenderRef.current = transceiver.sender;
            if (camTrack) await transceiver.sender.replaceTrack(camTrack);
            transceiver.direction = "sendrecv";
          }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGathering(pc, 850);

        const finalAnswer = pc.localDescription?.toJSON() ?? answer;
        await sendSignalPacket(cur.peer.id, {
          callId: cur.callId,
          type: "answer",
          sdp: finalAnswer,
          cameraOff: !camTrack,
          ts: Date.now(),
        });

        updateCallHistoryStatus(cur.callId, { state: "connected" });

        // Defer cleanup 45s so sibling devices logged into our account observe the answer signal first
        window.setTimeout(() => {
          void store
            .fetchMessagesWithUser(cur.peer.id)
            .then((latest) => {
              for (const m of latest) {
                if (m.senderId === me?.id && isHiddenCallSignal(m.body) && m.body.includes(cur.callId)) {
                  void store.deleteMessageForMe(m.id).catch(() => undefined);
                }
              }
            })
            .catch(() => undefined);
        }, 45_000);
      } catch {
        cleanupCallResources();
        setSession(null);
        setCallError("Could not connect the call. Please try calling back.");
      }
    },
    [
      cleanupCallResources,
      createConfiguredPeerConnection,
      me?.id,
      refreshLocalPreviewStream,
      sendSignalPacket,
      stopRingingTimers,
      store,
    ],
  );

  const declineIncomingCall = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    const declineTs = Date.now();
    myInteractionTsRef.current = declineTs;
    handledCallIdsRef.current.add(cur.callId);
    updateCallHistoryStatus(cur.callId, { state: "declined" });
    cleanupCallResources();
    setSession(null);
    try {
      await sendSignalPacket(cur.peer.id, {
        callId: cur.callId,
        type: "decline",
        deviceSessionId: CALL_DEVICE_SESSION_ID,
        ts: declineTs,
      });
      window.setTimeout(() => {
        void store
          .fetchMessagesWithUser(cur.peer.id)
          .then((latest) => {
            for (const m of latest) {
              if (m.senderId === me?.id && isHiddenCallSignal(m.body) && m.body.includes(cur.callId)) {
                void store.deleteMessageForMe(m.id).catch(() => undefined);
              }
            }
          })
          .catch(() => undefined);
      }, 45_000);
    } catch {
      // Ignore signal cleanup error.
    }
  }, [cleanupCallResources, me?.id, sendSignalPacket, store]);

  const endCall = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    handledCallIdsRef.current.add(cur.callId);
    sendDataChannelPacket({ type: "hangup" });
    if (soundsEnabled) playCallRingChime("ended");

    const durationSec = cur.startedAt ? Math.max(1, Math.round((Date.now() - cur.startedAt) / 1000)) : 0;
    const peerId = cur.peer.id;
    const inviteMsgId = cur.inviteMessageId;
    const wasCaller = cur.isCaller;
    const wasConnected = cur.phase === "connected" || cur.startedAt !== null;
    updateCallHistoryStatus(cur.callId, {
      state: wasConnected ? "ended" : "missed",
      durationSec: wasConnected ? durationSec : undefined,
    });

    cleanupCallResources();
    setSession(null);

    if (wasCaller && inviteMsgId) {
      await store
        .editMessage(
          inviteMsgId,
          serializeCallInvite({
            v: 1,
            callId: cur.callId,
            mode: cur.mode,
            state: wasConnected ? "ended" : "missed",
            durationSec: wasConnected ? durationSec : undefined,
            ts: Date.now(),
          }),
        )
        .catch(() => undefined);
    }

    await sendSignalPacket(peerId, {
      callId: cur.callId,
      type: "hangup",
      ts: Date.now(),
    }).catch(() => undefined);

    window.setTimeout(() => {
      void store
        .fetchMessagesWithUser(peerId)
        .then((latest) => {
          for (const m of latest) {
            if (m.senderId === me?.id && isHiddenCallSignal(m.body) && m.body.includes(cur.callId)) {
              void store.deleteMessageForMe(m.id).catch(() => undefined);
            }
          }
        })
        .catch(() => undefined);
    }, 6000);
  }, [cleanupCallResources, me?.id, sendDataChannelPacket, sendSignalPacket, soundsEnabled, store]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    if (rawMicTrackRef.current) rawMicTrackRef.current.enabled = !next;
    if (studioGraphRef.current) studioGraphRef.current.processedTrack.enabled = !next;
    screenAudioMixerRef.current?.setMicMuted(next);
    broadcastMyState({ isMuted: next });
  }, [broadcastMyState, isMuted]);

  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (isScreenSharing) return;
    if (!isCameraOff) {
      if (cameraTrackRef.current) {
        cameraTrackRef.current.stop();
        cameraTrackRef.current = null;
      }
      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(null).catch(() => undefined);
      }
      setIsCameraOff(true);
      refreshLocalPreviewStream();
      broadcastMyState({ isCameraOff: true });
      return;
    }

    const granted = await ensureNativeMediaPermissions(true);
    if (!granted) {
      setCallError("Camera permission is needed to turn on video.");
      return;
    }
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      const newTrack = camStream.getVideoTracks()[0];
      if (!newTrack) return;
      cameraTrackRef.current = newTrack;
      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(newTrack);
      }
      setIsCameraOff(false);
      refreshLocalPreviewStream();
      broadcastMyState({ isCameraOff: false });
    } catch {
      setCallError("Could not start your camera.");
    }
  }, [broadcastMyState, facingMode, isCameraOff, isScreenSharing, refreshLocalPreviewStream]);

  const flipCamera = useCallback(async () => {
    const prevFacing = facingMode;
    const nextFacing = prevFacing === "user" ? "environment" : "user";
    if (isCameraOff || isScreenSharing) {
      setFacingMode(nextFacing);
      return;
    }
    setCallError(null);
    const oldTrack = cameraTrackRef.current;
    cameraTrackRef.current = null;

    try {
      const newTrack = await acquireSwitchedCameraTrack(oldTrack, nextFacing);
      cameraTrackRef.current = newTrack;
      setFacingMode(nextFacing);
      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(newTrack);
      }
      refreshLocalPreviewStream();
      broadcastMyState({ isCameraOff: false });
    } catch {
      // Recover previous camera so user doesn't lose video
      try {
        const fallback = await acquireSwitchedCameraTrack(null, prevFacing);
        cameraTrackRef.current = fallback;
        if (videoSenderRef.current) {
          await videoSenderRef.current.replaceTrack(fallback);
        }
        refreshLocalPreviewStream();
      } catch {
        setIsCameraOff(true);
        refreshLocalPreviewStream();
      }
      setCallError("Could not switch cameras on this device.");
    }
  }, [broadcastMyState, facingMode, isCameraOff, isScreenSharing, refreshLocalPreviewStream]);

  const restoreVoiceOnlyAudioSender = useCallback(async () => {
    if (screenAudioMixerRef.current) {
      screenAudioMixerRef.current.dispose();
      screenAudioMixerRef.current = null;
    }
    const voiceTrack = studioGraphRef.current?.processedTrack ?? rawMicTrackRef.current;
    if (audioSenderRef.current && voiceTrack) {
      await audioSenderRef.current.replaceTrack(voiceTrack).catch(() => undefined);
    }
  }, []);

  const triggerVideoRenegotiationIfNeeded = useCallback(async () => {
    const pc = pcRef.current;
    const cur = sessionRef.current;
    if (!pc || !cur || pc.signalingState !== "stable") return;
    try {
      const videoTransceiver = pc
        .getTransceivers()
        .find((t) => t.sender === videoSenderRef.current || t.receiver?.track?.kind === "video");
      if (videoTransceiver && videoTransceiver.direction !== "sendrecv") {
        videoTransceiver.direction = "sendrecv";
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdp = pc.localDescription?.toJSON() ?? offer;
      if (dcRef.current?.readyState === "open") {
        sendDataChannelPacket({ type: "renegotiate-offer", sdp });
      } else {
        await sendSignalPacket(cur.peer.id, {
          callId: cur.callId,
          type: "renegotiate-offer",
          sdp,
          ts: Date.now(),
        });
      }
    } catch {
      // Ignore if simultaneous negotiation is in progress.
    }
  }, [sendDataChannelPacket, sendSignalPacket]);

  const finishStoppingScreenShare = useCallback(
    async (notifyNative: boolean) => {
      stopNativeScreenShareInternal(notifyNative);
      if (screenTrackRef.current) {
        try {
          screenTrackRef.current.stop();
        } catch {
          // ignore
        }
        screenTrackRef.current = null;
      }
      await restoreVoiceOnlyAudioSender();
      const fallbackCam = cameraTrackRef.current;
      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(fallbackCam ?? null).catch(() => undefined);
      }
      setIsScreenSharing(false);
      setIsCameraOff(!fallbackCam);
      refreshLocalPreviewStream();
      broadcastMyState({ isScreenSharing: false, isCameraOff: !fallbackCam });
    },
    [
      broadcastMyState,
      refreshLocalPreviewStream,
      restoreVoiceOnlyAudioSender,
      stopNativeScreenShareInternal,
    ],
  );

  const activateScreenShareSession = useCallback(
    async (shareSession: ActiveScreenShareSession, mixer: ScreenAudioMixer | null) => {
      activeScreenShareRef.current = shareSession;
      screenTrackRef.current = shareSession.videoTrack;
      setSharedMediaVideoElement(shareSession.sharedVideoElement ?? null);

      if (mixer && audioSenderRef.current) {
        screenAudioMixerRef.current = mixer;
        await audioSenderRef.current.replaceTrack(mixer.outputTrack).catch(() => undefined);
      } else if (mixer) {
        mixer.dispose();
      }

      const hadPriorVideo = Boolean(videoSenderRef.current?.track);
      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(shareSession.videoTrack);
      }

      setIsScreenSharing(true);
      setIsCameraOff(false);
      refreshLocalPreviewStream();
      broadcastMyState({ isScreenSharing: true, isCameraOff: false });

      if (!hadPriorVideo) {
        await triggerVideoRenegotiationIfNeeded();
      }
    },
    [broadcastMyState, refreshLocalPreviewStream, triggerVideoRenegotiationIfNeeded],
  );

  const startMobileVideoShare = useCallback(
    async (file: File) => {
      setMobileSharePickerOpen(false);
      setCallError(null);
      const voiceTrack = studioGraphRef.current?.processedTrack ?? rawMicTrackRef.current;
      const mixer = createScreenAudioMixer(voiceTrack, stateRef.current.isMuted);
      try {
        const shareSession = await startMobileVideoFileShare(file, {
          mixer,
          onSystemStopped: () => {
            void finishStoppingScreenShare(false);
          },
        });
        await activateScreenShareSession(shareSession, mixer);
      } catch (err) {
        mixer?.dispose();
        setCallError(
          err instanceof Error && err.message
            ? err.message
            : "Could not share the selected video.",
        );
      }
    },
    [activateScreenShareSession, finishStoppingScreenShare],
  );

  const startMobileCameraShare = useCallback(async () => {
    setMobileSharePickerOpen(false);
    setCallError(null);
    try {
      const shareSession = await startMobileRearPresentationShare({
        onSystemStopped: () => {
          void finishStoppingScreenShare(false);
        },
      });
      await activateScreenShareSession(shareSession, null);
    } catch (err) {
      setCallError(
        err instanceof Error && err.message
          ? err.message
          : "Could not start presentation camera.",
      );
    }
  }, [activateScreenShareSession, finishStoppingScreenShare]);

  const closeMobileSharePicker = useCallback(() => {
    setMobileSharePickerOpen(false);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await finishStoppingScreenShare(true);
      return;
    }

    setCallError(null);
    const voiceTrack = studioGraphRef.current?.processedTrack ?? rawMicTrackRef.current;

    // 1. Native Android APK: full OS MediaProjection screen + internal media audio capture
    if (Capacitor.isNativePlatform()) {
      const mixer = createScreenAudioMixer(voiceTrack, stateRef.current.isMuted);
      try {
        const shareSession = await startNativeAndroidScreenShare({
          mixer,
          onSystemStopped: () => {
            void finishStoppingScreenShare(false);
          },
        });
        if (!shareSession) {
          mixer?.dispose();
          return;
        }
        await activateScreenShareSession(shareSession, mixer);
      } catch (err) {
        mixer?.dispose();
        stopNativeScreenShareInternal(true);
        setCallError(
          err instanceof Error && err.message
            ? err.message
            : "Could not start mobile screen sharing.",
        );
      }
      return;
    }

    // 2. Desktop / Tablet Web supporting getDisplayMedia (WITH system/tab audio!)
    if (isWebDisplayMediaSupported()) {
      const mixer = createScreenAudioMixer(voiceTrack, stateRef.current.isMuted);
      try {
        const shareSession = await startWebDisplayScreenShare({
          mixer,
          onSystemStopped: () => {
            void finishStoppingScreenShare(false);
          },
        });
        await activateScreenShareSession(shareSession, mixer);
        return;
      } catch (err) {
        mixer?.dispose();
        const errName = err instanceof DOMException ? err.name : "";
        // If user cancelled the desktop screen picker, simply return
        if (errName === "NotAllowedError" || errName === "AbortError") {
          return;
        }
        // If mobile browser exposed getDisplayMedia stub that threw NotSupportedError/InvalidStateError,
        // fall through to the Mobile View Share Sheet!
      }
    }

    // 3. Mobile Browser View (Chrome Android / iOS Safari): open Mobile Share Sheet (Video+Audio / Live View / APK)
    setMobileSharePickerOpen(true);
  }, [
    activateScreenShareSession,
    finishStoppingScreenShare,
    isScreenSharing,
    stopNativeScreenShareInternal,
  ]);

  const toggleSpeakerphone = useCallback(async () => {
    const next = !isSpeakerphone;
    setIsSpeakerphone(next);
    await configureNativeCallAudio(true, next, {
      video: !isCameraOff,
      title: sessionRef.current?.peer.displayName,
    });
  }, [isCameraOff, isSpeakerphone]);

  const toggleStudioAudio = useCallback(() => {
    const rawMic = rawMicTrackRef.current;
    const sender = audioSenderRef.current;
    if (!rawMic || !sender) return;

    if (studioAudioEnabled) {
      if (screenAudioMixerRef.current) {
        screenAudioMixerRef.current.setMicTrack(rawMic, isMuted);
      } else {
        void sender.replaceTrack(rawMic).catch(() => undefined);
      }
      if (studioGraphRef.current) {
        studioGraphRef.current.processedTrack.stop();
        void studioGraphRef.current.ctx.close().catch(() => undefined);
        studioGraphRef.current = null;
      }
      setStudioAudioEnabled(false);
      return;
    }

    try {
      const ctx = new window.AudioContext();
      const source = ctx.createMediaStreamSource(new MediaStream([rawMic]));
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 90;
      const presenceBoost = ctx.createBiquadFilter();
      presenceBoost.type = "peaking";
      presenceBoost.frequency.value = 3200;
      presenceBoost.gain.value = 3.2;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      const dest = ctx.createMediaStreamDestination();

      source.connect(highpass);
      highpass.connect(presenceBoost);
      presenceBoost.connect(compressor);
      compressor.connect(dest);

      const processedTrack = dest.stream.getAudioTracks()[0];
      if (processedTrack) {
        processedTrack.enabled = !isMuted;
        studioGraphRef.current = { ctx, processedTrack };
        if (screenAudioMixerRef.current) {
          screenAudioMixerRef.current.setMicTrack(processedTrack, isMuted);
        } else {
          void sender.replaceTrack(processedTrack).catch(() => undefined);
        }
        setStudioAudioEnabled(true);
      }
    } catch {
      setCallError("Studio voice processing isn't available on this device.");
    }
  }, [isMuted, studioAudioEnabled]);

  const toggleCaptions = useCallback(() => {
    if (captionsEnabled) {
      stopCaptionCapture();
      setCaptionsEnabled(false);
      return;
    }

    setCaptionsEnabled(true);
    const myName = me?.displayName || "You";
    const win = window as unknown as {
      SpeechRecognition?: new () => WebSpeechInstance;
      webkitSpeechRecognition?: new () => WebSpeechInstance;
    };
    const SpeechCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition;

    if (SpeechCtor) {
      try {
        const rec = new SpeechCtor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = navigator.language || "en-US";
        rec.onresult = (ev) => {
          const latest = ev.results[ev.results.length - 1];
          const text = latest?.[0]?.transcript?.trim() ?? "";
          if (!text) return;
          setCaptions((prev) => {
            const rest = prev.filter((c) => c.speakerName !== myName);
            return [...rest.slice(-2), { speakerName: myName, text, updatedAt: Date.now() }];
          });
          sendDataChannelPacket({ type: "caption", text, isFinal: Boolean(latest?.isFinal) });
        };
        rec.onerror = () => undefined;
        rec.onend = () => {
          if (captionSpeechRef.current === rec) {
            try {
              rec.start();
            } catch {
              // Ignore.
            }
          }
        };
        rec.start();
        captionSpeechRef.current = rec;
      } catch {
        // Fallback silently if busy.
      }
    } else if (Capacitor.isNativePlatform()) {
      void JaTextNative.addListener("speechTranscript", (ev) => {
        if (!ev.text?.trim()) return;
        setCaptions((prev) => {
          const rest = prev.filter((c) => c.speakerName !== myName);
          return [...rest.slice(-2), { speakerName: myName, text: ev.text.trim(), updatedAt: Date.now() }];
        });
        sendDataChannelPacket({ type: "caption", text: ev.text.trim(), isFinal: ev.isFinal });
      }).then((handle) => {
        nativeCaptionListenerRef.current = handle;
        return JaTextNative.startSpeechCapture();
      }).catch(() => undefined);
    }
  }, [captionsEnabled, me?.displayName, sendDataChannelPacket, stopCaptionCapture]);

  const sendCallReaction = useCallback(
    (emoji: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      spawnReaction(emoji, true, id);
      sendDataChannelPacket({ type: "reaction", emoji, id });
    },
    [sendDataChannelPacket, spawnReaction],
  );

  const playSoundboard = useCallback(
    (effectId: SoundboardEffectId) => {
      playSynthesizedSoundboard(effectId);
      sendDataChannelPacket({ type: "soundboard", effectId });
    },
    [sendDataChannelPacket],
  );

  const reconnectIce = useCallback(async () => {
    const pc = pcRef.current;
    const cur = sessionRef.current;
    if (!pc || !cur) return;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc, 750);
      const sdp = pc.localDescription?.toJSON() ?? offer;
      if (dcRef.current?.readyState === "open") {
        sendDataChannelPacket({
          type: "renegotiate-offer",
          sdp,
        });
      } else {
        await sendSignalPacket(cur.peer.id, {
          callId: cur.callId,
          type: "renegotiate-offer",
          sdp,
          ts: Date.now(),
        });
        window.setTimeout(() => {
          void store
            .fetchMessagesWithUser(cur.peer.id)
            .then((latest) => {
              for (const m of latest) {
                if (
                  m.senderId === me?.id &&
                  isHiddenCallSignal(m.body) &&
                  m.body.includes(cur.callId)
                ) {
                  void store.deleteMessageForMe(m.id).catch(() => undefined);
                }
              }
            })
            .catch(() => undefined);
        }, 8000);
      }
    } catch {
      // Ignore if renegotiation already active.
    }
  }, [me?.id, sendDataChannelPacket, sendSignalPacket, store]);

  // Keep call alive across app switches / backgrounding & self-heal evicted audio/camera/ICE
  useEffect(() => {
    if (!session || session.phase === "incoming") return;

    const resumeMediaAndConnection = async (becameVisible: boolean) => {
      try {
        const ctx = getCallAudioCtx();
        if (ctx && ctx.state === "suspended") {
          void ctx.resume().catch(() => undefined);
        }
        if (studioGraphRef.current?.ctx.state === "suspended") {
          void studioGraphRef.current.ctx.resume().catch(() => undefined);
        }
        if (remoteAudioElementRef.current && !isDeafened) {
          void remoteAudioElementRef.current.play().catch(() => undefined);
        }
      } catch {
        // Ignore audio resume errors.
      }

      if (!becameVisible) return;

      void configureNativeCallAudio(true, isSpeakerphone, {
        video: !isCameraOff,
        title: session.peer.displayName,
      });

      // If Android CameraService evicted the camera hardware while user was in another app, restore it!
      if (
        !isCameraOff &&
        !isScreenSharing &&
        (!cameraTrackRef.current || cameraTrackRef.current.readyState === "ended")
      ) {
        try {
          const restored = await acquireSwitchedCameraTrack(cameraTrackRef.current, facingMode);
          cameraTrackRef.current = restored;
          if (videoSenderRef.current) {
            await videoSenderRef.current.replaceTrack(restored);
          }
          refreshLocalPreviewStream();
        } catch {
          // Leave voice call running cleanly even if camera is busy.
        }
      }

      const pc = pcRef.current;
      if (
        pc &&
        session.phase === "connected" &&
        (pc.connectionState === "failed" ||
          pc.iceConnectionState === "failed" ||
          pc.iceConnectionState === "disconnected")
      ) {
        void reconnectIce();
      }
    };

    const onVisibility = () => {
      void resumeMediaAndConnection(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisibility);

    let appStateHandle: PluginListenerHandle | null = null;
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        void resumeMediaAndConnection(isActive);
      }).then((h) => {
        appStateHandle = h;
      });
    }

    const keepAliveTimer = window.setInterval(() => {
      void resumeMediaAndConnection(false);
    }, 3000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(keepAliveTimer);
      if (appStateHandle) {
        void appStateHandle.remove();
      }
    };
  }, [
    facingMode,
    isCameraOff,
    isDeafened,
    isScreenSharing,
    isSpeakerphone,
    reconnectIce,
    refreshLocalPreviewStream,
    session,
  ]);

  // Hydrate call history from existing call cards in opened DM conversations
  useEffect(() => {
    if (!me || !activeChatId || activeMessages.length === 0) return;
    const friend = friends.find((f) => f.id === activeChatId);
    if (!friend) return;
    for (const msg of activeMessages) {
      if (msg.unsentAt) continue;
      const invite = parseCallInvite(msg.body);
      if (!invite) continue;
      const isLive = session?.callId === invite.callId;
      const normalizedState: CallInviteState = isLive
        ? invite.state
        : invite.state === "connected"
          ? "ended"
          : invite.state === "ringing"
            ? "missed"
            : invite.state;
      upsertCallHistoryEntry({
        callId: invite.callId,
        kind: "dm",
        peerId: friend.id,
        peerDisplayName: friend.displayName,
        peerUsername: friend.username,
        peerAvatarUrl: friend.avatarUrl,
        peerAvatarColor: friend.avatarColor,
        direction: msg.senderId === me.id ? "outgoing" : "incoming",
        mode: invite.mode,
        state: normalizedState,
        durationSec: invite.durationSec,
        timestamp: msg.createdAt || invite.ts || Date.now(),
      });
    }
  }, [activeChatId, activeMessages, friends, me, session?.callId]);

  const canScreenShare = true;

  const closeDismissedCall = useCallback(() => {
    cleanupCallResources();
    sessionRef.current = null;
    setSession(null);
  }, [cleanupCallResources]);

  const retryDismissedCall = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    const { peer, mode } = cur;
    cleanupCallResources();
    sessionRef.current = null;
    setSession(null);
    await startCall(peer, mode);
  }, [cleanupCallResources, startCall]);

  const contextValue = useMemo<CallContextValue>(
    () => ({
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
      startCall,
      acceptIncomingCall,
      declineIncomingCall,
      retryDismissedCall,
      closeDismissedCall,
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
      dismissCallError: () => setCallError(null),
    }),
    [
      acceptIncomingCall,
      callError,
      canScreenShare,
      captions,
      captionsEnabled,
      closeDismissedCall,
      closeMobileSharePicker,
      declineIncomingCall,
      endCall,
      facingMode,
      flipCamera,
      isCameraOff,
      isDeafened,
      isMuted,
      isScreenSharing,
      isSpeakerphone,
      layoutMode,
      localStream,
      meSpeaking,
      minimized,
      mobileSharePickerOpen,
      peerCameraOff,
      peerMuted,
      peerScreenSharing,
      peerSpeaking,
      playSoundboard,
      reactions,
      reconnectIce,
      remoteStream,
      retryDismissedCall,
      sendCallReaction,
      session,
      sharedMediaVideoElement,
      startCall,
      startMobileCameraShare,
      startMobileVideoShare,
      stats,
      studioAudioEnabled,
      toggleCamera,
      toggleCaptions,
      toggleDeafen,
      toggleMute,
      toggleScreenShare,
      toggleSpeakerphone,
      toggleStudioAudio,
    ],
  );

  return <CallContext.Provider value={contextValue}>{children}</CallContext.Provider>;
}
