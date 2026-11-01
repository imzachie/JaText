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
import {
  CALL_DEVICE_SESSION_ID,
  GROUP_CALL_INVITE_PREFIX,
  GROUP_CALL_SIGNAL_PREFIX,
  acquireSwitchedCameraTrack,
  playCallRingChime,
  playSynthesizedSoundboard,
  preloadSoundboardAudio,
  type CallMode,
  type CallCaptionLine,
  type FloatingCallReaction,
  type SoundboardEffectId,
} from "./calling";
import { startIncomingCallRingtone, stopIncomingCallRingtone } from "./alerts";
import { updateCallHistoryStatus, upsertCallHistoryEntry } from "./callHistory";
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
import { hasInFlightTursoMutation } from "./tursoClient";
import type { GroupMessage, GroupSummary, JaUser } from "./types";

const GROUP_RING_TIMEOUT_MS = 60_000;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export interface GroupCallInvitePayload {
  v: 1;
  callId: string;
  groupId: string;
  groupName: string;
  mode: CallMode;
  hostId: string;
  hostName: string;
  state: "active" | "ended";
  durationSec?: number;
  ts: number;
}

interface GroupSignalEnvelope {
  callId: string;
  groupId: string;
  fromId: string;
  fromName: string;
  fromUsername: string;
  fromAvatarUrl?: string;
  fromAvatarColor: string;
  toId: string; // "*" for broadcast join/leave/ended, or specific peer userId
  type: "join" | "offer" | "answer" | "leave" | "ended" | "claim-ring" | "decline-ring";
  deviceSessionId?: string;
  joinSeq: number;
  durationSec?: number;
  sdp?: RTCSessionDescriptionInit;
  cameraOff?: boolean;
  screenSharing?: boolean;
  ts: number;
}

type GroupDataChannelPacket =
  | {
      type: "peer-state";
      muted: boolean;
      cameraOff: boolean;
      screenSharing: boolean;
      speaking: boolean;
    }
  | { type: "reaction"; emoji: string; id: string }
  | { type: "soundboard"; effectId: SoundboardEffectId }
  | { type: "caption"; text: string }
  | { type: "renegotiate-offer"; sdp: RTCSessionDescriptionInit }
  | { type: "renegotiate-answer"; sdp: RTCSessionDescriptionInit }
  | { type: "leave" };

export interface GroupCallParticipant {
  user: JaUser;
  stream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  screenSharing: boolean;
  speaking: boolean;
  connectionState: string;
}

export interface ActiveGroupCallSession {
  callId: string;
  group: GroupSummary;
  mode: CallMode;
  phase: "incoming" | "joining" | "connected" | "dismissed";
  hostId: string;
  hostName: string;
  startedAt: number | null;
  inviteMessageId?: string;
}

export interface GroupCallContextValue {
  groupSession: ActiveGroupCallSession | null;
  localStream: MediaStream | null;
  participants: GroupCallParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  isSpeakerphone: boolean;
  studioAudioEnabled: boolean;
  captionsEnabled: boolean;
  minimized: boolean;
  layoutMode: "grid" | "spotlight";
  facingMode: "user" | "environment";
  meSpeaking: boolean;
  reactions: FloatingCallReaction[];
  captions: CallCaptionLine[];
  callError: string | null;
  canScreenShare: boolean;
  declinedGroupCallIds: ReadonlySet<string>;
  mobileSharePickerOpen: boolean;
  sharedMediaVideoElement: HTMLVideoElement | null;
  startGroupCall: (group: GroupSummary, mode: CallMode) => Promise<void>;
  joinGroupCall: (invite: GroupCallInvitePayload, withVideo?: boolean, inviteMsgId?: string) => Promise<void>;
  acceptIncomingGroupCall: (withVideo: boolean) => Promise<void>;
  declineIncomingGroupCall: () => void;
  retryDismissedGroupCall: () => Promise<void>;
  closeDismissedGroupCall: () => void;
  leaveGroupCall: () => Promise<void>;
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
  setMinimized: (minimized: boolean) => void;
  setLayoutMode: (layout: "grid" | "spotlight") => void;
  dismissCallError: () => void;
}

export function parseGroupCallInvite(body?: string | null): GroupCallInvitePayload | null {
  if (!body || !body.startsWith(GROUP_CALL_INVITE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(GROUP_CALL_INVITE_PREFIX.length)) as Partial<GroupCallInvitePayload>;
    if (
      parsed.v !== 1 ||
      typeof parsed.callId !== "string" ||
      typeof parsed.groupId !== "string" ||
      (parsed.mode !== "voice" && parsed.mode !== "video") ||
      (parsed.state !== "active" && parsed.state !== "ended")
    ) {
      return null;
    }
    return {
      v: 1,
      callId: parsed.callId,
      groupId: parsed.groupId,
      groupName: parsed.groupName ?? "Group",
      mode: parsed.mode,
      hostId: parsed.hostId ?? "",
      hostName: parsed.hostName ?? "Someone",
      state: parsed.state,
      durationSec: parsed.durationSec,
      ts: parsed.ts ?? Date.now(),
    };
  } catch {
    return null;
  }
}

export function serializeGroupCallInvite(payload: GroupCallInvitePayload): string {
  return `${GROUP_CALL_INVITE_PREFIX}${JSON.stringify(payload)}`;
}

const GROUP_CALL_HEARTBEAT_STALE_MS = 52_000;

export function resolveGroupCallLiveState(
  invite: GroupCallInvitePayload,
  rawGroupMessages: GroupMessage[],
  activeSessionCallId: string | null,
  inviteCreatedAt?: number,
): { isEnded: boolean; durationSec?: number } {
  if (invite.state === "ended") {
    return { isEnded: true, durationSec: invite.durationSec };
  }
  if (activeSessionCallId === invite.callId) {
    return { isEnded: false };
  }

  let latestActivityTs = Math.max(invite.ts || 0, inviteCreatedAt || 0);
  let explicitEnded = false;
  let endedDuration = invite.durationSec;
  const participantStatus = new Map<string, { state: "joined" | "left"; ts: number }>();

  for (const msg of rawGroupMessages) {
    if (!msg.body.startsWith(GROUP_CALL_SIGNAL_PREFIX)) continue;
    try {
      const parsed = JSON.parse(
        msg.body.slice(GROUP_CALL_SIGNAL_PREFIX.length),
      ) as Partial<GroupSignalEnvelope>;
      if (parsed.callId !== invite.callId || !parsed.fromId || !parsed.type) continue;
      const sigTs = Math.max(parsed.ts ?? 0, msg.createdAt ?? 0, msg.editedAt ?? 0);
      if (sigTs > latestActivityTs) {
        latestActivityTs = sigTs;
      }
      if (parsed.type === "ended") {
        explicitEnded = true;
        if (parsed.durationSec && parsed.durationSec > 0) {
          endedDuration = parsed.durationSec;
        }
      } else if (parsed.type === "join") {
        const prev = participantStatus.get(parsed.fromId);
        if (!prev || sigTs >= prev.ts) {
          participantStatus.set(parsed.fromId, { state: "joined", ts: sigTs });
        }
      } else if (parsed.type === "leave") {
        const prev = participantStatus.get(parsed.fromId);
        if (!prev || sigTs >= prev.ts) {
          participantStatus.set(parsed.fromId, { state: "left", ts: sigTs });
        }
      }
    } catch {
      // Ignore malformed signal header
    }
  }

  if (explicitEnded) {
    return { isEnded: true, durationSec: endedDuration };
  }

  if (participantStatus.size > 0) {
    let activeCount = 0;
    let maxLeaveTs = 0;
    for (const entry of participantStatus.values()) {
      if (entry.state === "joined") activeCount += 1;
      else if (entry.ts > maxLeaveTs) maxLeaveTs = entry.ts;
    }
    if (activeCount === 0) {
      const startRef = inviteCreatedAt || invite.ts || maxLeaveTs;
      const computedSec =
        maxLeaveTs > startRef ? Math.max(1, Math.round((maxLeaveTs - startRef) / 1000)) : undefined;
      return { isEnded: true, durationSec: endedDuration ?? computedSec };
    }
  }

  if (latestActivityTs > 0 && Date.now() - latestActivityTs > GROUP_CALL_HEARTBEAT_STALE_MS) {
    return { isEnded: true, durationSec: endedDuration };
  }

  return { isEnded: false };
}

function waitForIceGathering(pc: RTCPeerConnection, maxWaitMs = 2200): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let srflxTimer: number | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (srflxTimer !== null) window.clearTimeout(srflxTimer);
      window.clearTimeout(hardTimer);
      pc.removeEventListener("icegatheringstatechange", onStateChange);
      pc.removeEventListener("icecandidate", onCandidate);
      resolve();
    };
    const onStateChange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    const onCandidate = (ev: RTCPeerConnectionIceEvent) => {
      if (!ev.candidate) {
        finish();
        return;
      }
      if (
        (ev.candidate.candidate.includes(" typ srflx ") ||
          ev.candidate.candidate.includes(" typ relay ")) &&
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

function createStudioVoiceProcessor(rawMicTrack: MediaStreamTrack): {
  ctx: AudioContext;
  processedTrack: MediaStreamTrack;
} | null {
  if (typeof window.AudioContext === "undefined") return null;
  try {
    const ctx = new window.AudioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([rawMicTrack]));
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 85;
    const presence = ctx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 3100;
    presence.Q.value = 0.9;
    presence.gain.value = 3.2;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    const dest = ctx.createMediaStreamDestination();
    source.connect(highpass);
    highpass.connect(presence);
    presence.connect(compressor);
    compressor.connect(dest);
    const processedTrack = dest.stream.getAudioTracks()[0];
    if (!processedTrack) {
      void ctx.close();
      return null;
    }
    return { ctx, processedTrack };
  } catch {
    return null;
  }
}

interface PeerMeshEntry {
  user: JaUser;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  audioSender: RTCRtpSender | null;
  videoSender: RTCRtpSender | null;
  remoteStream: MediaStream;
  audioEl: HTMLAudioElement;
  joinSeq: number;
  muted: boolean;
  cameraOff: boolean;
  screenSharing: boolean;
  speaking: boolean;
}

const GroupCallContext = createContext<GroupCallContextValue | null>(null);

export function useGroupCall(): GroupCallContextValue {
  const ctx = useContext(GroupCallContext);
  if (!ctx) throw new Error("useGroupCall must be used inside <GroupCallProvider>");
  return ctx;
}

export function GroupCallProvider({ children }: { children: ReactNode }) {
  const store = useJaText();
  const { me, groups, activeGroupId, groupMessages, soundsEnabled } = store;

  const [groupSession, setGroupSession] = useState<ActiveGroupCallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<GroupCallParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeakerphone, setIsSpeakerphone] = useState(true);
  const [studioAudioEnabled, setStudioAudioEnabled] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"grid" | "spotlight">("grid");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [meSpeaking, setMeSpeaking] = useState(false);
  const [reactions, setReactions] = useState<FloatingCallReaction[]>([]);
  const [captions, setCaptions] = useState<CallCaptionLine[]>([]);
  const [callError, setCallError] = useState<string | null>(null);
  const [declinedGroupCallIds, setDeclinedGroupCallIds] = useState<Set<string>>(() => new Set());
  const [mobileSharePickerOpen, setMobileSharePickerOpen] = useState(false);
  const [sharedMediaVideoElement, setSharedMediaVideoElement] = useState<HTMLVideoElement | null>(
    null,
  );

  const sessionRef = useRef<ActiveGroupCallSession | null>(null);
  const peersRef = useRef(new Map<string, PeerMeshEntry>());
  const rawMicTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const studioGraphRef = useRef<{ ctx: AudioContext; processedTrack: MediaStreamTrack } | null>(null);
  const activeScreenShareRef = useRef<ActiveScreenShareSession | null>(null);
  const screenAudioMixerRef = useRef<ScreenAudioMixer | null>(null);
  const myJoinSeqRef = useRef<number>(0);
  const myJoinSignalIdRef = useRef<string | null>(null);
  const checkedGroupRingAtRef = useRef(new Map<string, number>());
  const handledInviteCallIdsRef = useRef(new Set<string>());
  const processedSignalIdsRef = useRef(new Set<string>());
  const ringIntervalRef = useRef<number | null>(null);
  const ringTimeoutRef = useRef<number | null>(null);
  const nativeCaptionListenerRef = useRef<PluginListenerHandle | null>(null);
  const isDeafenedRef = useRef(false);
  const stateRef = useRef({
    isMuted: false,
    isCameraOff: true,
    isScreenSharing: false,
    meSpeaking: false,
  });

  useEffect(() => {
    sessionRef.current = groupSession;
    if (groupSession) preloadSoundboardAudio();
  }, [groupSession]);

  useEffect(() => {
    isDeafenedRef.current = isDeafened;
    for (const peer of peersRef.current.values()) {
      peer.audioEl.muted = isDeafened;
    }
  }, [isDeafened]);

  useEffect(() => {
    stateRef.current = { isMuted, isCameraOff, isScreenSharing, meSpeaking };
  }, [isMuted, isCameraOff, isScreenSharing, meSpeaking]);

  const syncParticipantsState = useCallback(() => {
    const list: GroupCallParticipant[] = [];
    for (const p of peersRef.current.values()) {
      list.push({
        user: p.user,
        stream: p.remoteStream.getTracks().length > 0 ? new MediaStream(p.remoteStream.getTracks()) : null,
        muted: p.muted,
        cameraOff: p.cameraOff,
        screenSharing: p.screenSharing,
        speaking: p.speaking,
        connectionState: p.pc.connectionState,
      });
    }
    setParticipants(list);
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

  const stopNativeScreenShareInternal = useCallback((notifyService: boolean) => {
    if (activeScreenShareRef.current) {
      activeScreenShareRef.current.stop(notifyService);
      activeScreenShareRef.current = null;
    } else if (notifyService && Capacitor.isNativePlatform()) {
      void JaTextNative.stopScreenCapture().catch(() => undefined);
    }
    if (screenAudioMixerRef.current) {
      screenAudioMixerRef.current.dispose();
      screenAudioMixerRef.current = null;
    }
    setSharedMediaVideoElement(null);
    setMobileSharePickerOpen(false);
  }, []);

  const stopCaptionCapture = useCallback(() => {
    if (nativeCaptionListenerRef.current) {
      void nativeCaptionListenerRef.current.remove();
      nativeCaptionListenerRef.current = null;
      void JaTextNative.stopSpeechCapture().catch(() => undefined);
    }
  }, []);

  const removePeerEntry = useCallback(
    (peerId: string) => {
      const entry = peersRef.current.get(peerId);
      if (!entry) return;
      peersRef.current.delete(peerId);
      try {
        entry.dc?.close();
      } catch {
        // Ignore.
      }
      try {
        entry.pc.ontrack = null;
        entry.pc.onconnectionstatechange = null;
        entry.pc.close();
      } catch {
        // Ignore.
      }
      entry.audioEl.srcObject = null;
      syncParticipantsState();
    },
    [syncParticipantsState],
  );

  const cleanupAllGroupCallResources = useCallback(() => {
    stopRingingTimers();
    stopCaptionCapture();
    stopNativeScreenShareInternal(true);
    void configureNativeCallAudio(false, false);

    for (const peerId of Array.from(peersRef.current.keys())) {
      removePeerEntry(peerId);
    }
    peersRef.current.clear();

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

    setLocalStream(null);
    setParticipants([]);
    setIsMuted(false);
    setIsDeafened(false);
    setIsCameraOff(true);
    setIsScreenSharing(false);
    setStudioAudioEnabled(false);
    setCaptionsEnabled(false);
    setMinimized(false);
    setMeSpeaking(false);
    setReactions([]);
    setCaptions([]);
  }, [removePeerEntry, stopCaptionCapture, stopNativeScreenShareInternal, stopRingingTimers]);

  const refreshLocalPreviewStream = useCallback(() => {
    const tracks: MediaStreamTrack[] = [];
    if (rawMicTrackRef.current) tracks.push(rawMicTrackRef.current);
    const activeVideo = screenTrackRef.current ?? cameraTrackRef.current;
    if (activeVideo && activeVideo.readyState === "live") {
      tracks.push(activeVideo);
    }
    setLocalStream(tracks.length > 0 ? new MediaStream(tracks) : null);
  }, []);

  const broadcastMeshData = useCallback((packet: GroupDataChannelPacket) => {
    const raw = JSON.stringify(packet);
    for (const entry of peersRef.current.values()) {
      if (entry.dc?.readyState === "open") {
        try {
          entry.dc.send(raw);
        } catch {
          // Ignore closed channel.
        }
      }
    }
  }, []);

  const broadcastMyState = useCallback(
    (override?: Partial<typeof stateRef.current>) => {
      const s = { ...stateRef.current, ...override };
      broadcastMeshData({
        type: "peer-state",
        muted: s.isMuted,
        cameraOff: s.isCameraOff,
        screenSharing: s.isScreenSharing,
        speaking: s.meSpeaking,
      });
    },
    [broadcastMeshData],
  );

  const spawnReaction = useCallback((emoji: string, fromMe: boolean, customId?: string) => {
    const id = customId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const leftPct = 14 + Math.random() * 72;
    setReactions((prev) => [...prev.slice(-14), { id, emoji, leftPct, fromMe }]);
    window.setTimeout(() => {
      setReactions((prev) => prev.filter((item) => item.id !== id));
    }, 2600);
  }, []);

  const sendGroupSignal = useCallback(
    async (groupId: string, env: GroupSignalEnvelope) => {
      const stamped: GroupSignalEnvelope = {
        ...env,
        deviceSessionId: env.deviceSessionId ?? CALL_DEVICE_SESSION_ID,
      };
      const header = `${GROUP_CALL_SIGNAL_PREFIX}${JSON.stringify({
        callId: stamped.callId,
        groupId: stamped.groupId,
        fromId: stamped.fromId,
        fromName: stamped.fromName,
        fromUsername: stamped.fromUsername,
        fromAvatarUrl: stamped.fromAvatarUrl,
        fromAvatarColor: stamped.fromAvatarColor,
        toId: stamped.toId,
        type: stamped.type,
        deviceSessionId: stamped.deviceSessionId,
        joinSeq: stamped.joinSeq,
        durationSec: stamped.durationSec,
        cameraOff: stamped.cameraOff,
        screenSharing: stamped.screenSharing,
        ts: stamped.ts,
      })}`;
      if (stamped.sdp) {
        const blobFile = new File([JSON.stringify(stamped)], `gcall-${stamped.type}.json`, {
          type: "application/x-jatext-gcall+json",
        });
        await store.sendGroupMessage(groupId, header, blobFile);
      } else {
        await store.sendGroupMessage(groupId, header);
      }
    },
    [store],
  );

  const readGroupSignalEnvelope = useCallback(async (msg: GroupMessage): Promise<GroupSignalEnvelope | null> => {
    if (msg.e2ee?.encrypted && !msg.e2ee.decrypted) return null;
    if (!msg.body.startsWith(GROUP_CALL_SIGNAL_PREFIX)) return null;
    if (msg.attachmentName && !msg.attachmentUrl) return null;
    if (msg.attachmentUrl) {
      try {
        const res = await fetch(msg.attachmentUrl);
        if (res.ok) {
          return (await res.json()) as GroupSignalEnvelope;
        }
      } catch {
        if (msg.attachmentName) return null;
      }
    }
    try {
      const parsed = JSON.parse(msg.body.slice(GROUP_CALL_SIGNAL_PREFIX.length)) as GroupSignalEnvelope;
      if ((parsed.type === "offer" || parsed.type === "answer") && !parsed.sdp) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const wirePeerDataChannel = useCallback(
    (entry: PeerMeshEntry, dc: RTCDataChannel) => {
      entry.dc = dc;
      dc.onopen = () => {
        const s = stateRef.current;
        try {
          dc.send(
            JSON.stringify({
              type: "peer-state",
              muted: s.isMuted,
              cameraOff: s.isCameraOff,
              screenSharing: s.isScreenSharing,
              speaking: s.meSpeaking,
            } satisfies GroupDataChannelPacket),
          );
        } catch {
          // Ignore.
        }
      };
      dc.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        try {
          const msg = JSON.parse(ev.data) as GroupDataChannelPacket;
          if (msg.type === "peer-state") {
            entry.muted = msg.muted;
            entry.cameraOff = msg.cameraOff;
            entry.screenSharing = msg.screenSharing;
            entry.speaking = msg.speaking;
            syncParticipantsState();
          } else if (msg.type === "reaction") {
            spawnReaction(msg.emoji, false, msg.id);
          } else if (msg.type === "soundboard") {
            if (!isDeafenedRef.current) {
              playSynthesizedSoundboard(msg.effectId);
            }
          } else if (msg.type === "caption") {
            if (msg.text.trim()) {
              setCaptions((prev) => {
                const rest = prev.filter((c) => c.speakerName !== entry.user.displayName);
                return [
                  ...rest.slice(-3),
                  {
                    speakerName: entry.user.displayName,
                    text: msg.text.trim(),
                    updatedAt: Date.now(),
                  },
                ];
              });
            }
          } else if (msg.type === "renegotiate-offer") {
            void (async () => {
              try {
                if (entry.pc.signalingState !== "stable") return;
                await entry.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                const answer = await entry.pc.createAnswer();
                await entry.pc.setLocalDescription(answer);
                if (dc.readyState === "open") {
                  dc.send(
                    JSON.stringify({
                      type: "renegotiate-answer",
                      sdp: entry.pc.localDescription?.toJSON() ?? answer,
                    } satisfies GroupDataChannelPacket),
                  );
                }
              } catch {
                // Ignore renegotiation collision.
              }
            })();
          } else if (msg.type === "renegotiate-answer") {
            void (async () => {
              try {
                if (entry.pc.signalingState === "have-local-offer") {
                  await entry.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                }
              } catch {
                // Ignore.
              }
            })();
          } else if (msg.type === "leave") {
            removePeerEntry(entry.user.id);
          }
        } catch {
          // Ignore malformed packet.
        }
      };
    },
    [removePeerEntry, spawnReaction, syncParticipantsState],
  );

  const createMeshPeer = useCallback(
    (peerUser: JaUser, joinSeq: number, isOfferer: boolean): PeerMeshEntry => {
      removePeerEntry(peerUser.id);

      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 4,
      });
      const remoteStream = new MediaStream();
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioEl.setAttribute("playsinline", "true");
      audioEl.muted = isDeafenedRef.current;

      const entry: PeerMeshEntry = {
        user: peerUser,
        pc,
        dc: null,
        audioSender: null,
        videoSender: null,
        remoteStream,
        audioEl,
        joinSeq,
        muted: false,
        cameraOff: true,
        screenSharing: false,
        speaking: false,
      };

      if (isOfferer) {
        const dc = pc.createDataChannel("jatext-gcall-meta", { ordered: true });
        wirePeerDataChannel(entry, dc);
      } else {
        pc.ondatachannel = (ev) => {
          wirePeerDataChannel(entry, ev.channel);
        };
      }

      pc.ontrack = (ev) => {
        const track = ev.track;
        const existingSameKind = entry.remoteStream
          .getTracks()
          .filter((t) => t.kind === track.kind && t.id !== track.id);
        for (const stale of existingSameKind) {
          entry.remoteStream.removeTrack(stale);
        }
        if (!entry.remoteStream.getTracks().some((t) => t.id === track.id)) {
          entry.remoteStream.addTrack(track);
        }
        if (track.kind === "audio") {
          entry.audioEl.srcObject = new MediaStream([track]);
          void entry.audioEl.play().catch(() => undefined);
        } else {
          track.onunmute = () => {
            syncParticipantsState();
          };
        }
        syncParticipantsState();
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setGroupSession((cur) =>
            cur
              ? {
                  ...cur,
                  phase: "connected",
                  startedAt: cur.startedAt ?? Date.now(),
                }
              : null,
          );
        } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          if (peersRef.current.get(peerUser.id)?.pc === pc) {
            removePeerEntry(peerUser.id);
          }
        }
        syncParticipantsState();
      };

      peersRef.current.set(peerUser.id, entry);
      syncParticipantsState();
      return entry;
    },
    [removePeerEntry, syncParticipantsState, wirePeerDataChannel],
  );

  // Detect local speaking level while in a group call
  useEffect(() => {
    if (!groupSession || !localStream || isMuted) {
      setMeSpeaking(false);
      return;
    }
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack || typeof window.AudioContext === "undefined") return;

    let ctx: AudioContext | null = null;
    let intervalId: number | null = null;
    try {
      ctx = new window.AudioContext();
      const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastSpeak = false;
      intervalId = window.setInterval(() => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const speakingNow = sum / data.length > 16;
        if (speakingNow !== lastSpeak) {
          lastSpeak = speakingNow;
          setMeSpeaking(speakingNow);
          broadcastMyState({ meSpeaking: speakingNow });
        }
      }, 220);
    } catch {
      // Ignore analyser failure.
    }
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      if (ctx) void ctx.close().catch(() => undefined);
    };
  }, [broadcastMyState, groupSession, isMuted, localStream]);

  // Watch group previews (and fresh group messages when lastMessage was a signal) for incoming group calls!
  useEffect(() => {
    if (!me || groupSession) return;
    let cancelled = false;
    const now = Date.now();

    const triggerIncomingGroupRing = (grp: GroupSummary, invite: GroupCallInvitePayload) => {
      if (cancelled || sessionRef.current) return;
      if (handledInviteCallIdsRef.current.has(invite.callId)) return;
      handledInviteCallIdsRef.current.add(invite.callId);

      setGroupSession({
        callId: invite.callId,
        group: grp,
        mode: invite.mode,
        phase: "incoming",
        hostId: invite.hostId,
        hostName: invite.hostName,
        startedAt: null,
      });
      setMinimized(false);
      upsertCallHistoryEntry({
        callId: invite.callId,
        kind: "group",
        peerId: grp.id,
        peerDisplayName: grp.name,
        peerUsername: `${grp.memberCount} members`,
        peerAvatarUrl: grp.avatarUrl,
        peerAvatarColor: "purple",
        groupId: grp.id,
        groupName: grp.name,
        groupAvatarUrl: grp.avatarUrl,
        direction: "incoming",
        mode: invite.mode,
        state: "ringing",
        timestamp: invite.ts || now,
      });

      if (!grp.isSilenced && !grp.isArchived && me.statusPreference !== "dnd") {
        if (Capacitor.isNativePlatform()) {
          void JaTextNative.triggerIncomingCallWake({
            groupId: grp.id,
            callerTitle: `${invite.hostName} · ${grp.name}`,
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
          cleanupAllGroupCallResources();
          setMinimized(false);
          setGroupSession({ ...cur, phase: "dismissed" });
        }
      }, GROUP_RING_TIMEOUT_MS);
    };

    for (const grp of groups) {
      if (grp.lastSenderId === me.id) continue;
      if (now - grp.lastMessageAt > GROUP_RING_TIMEOUT_MS) continue;
      const invite = grp.lastMessage ? parseGroupCallInvite(grp.lastMessage) : null;
      if (invite && invite.state === "active") {
        triggerIncomingGroupRing(grp, invite);
        break;
      }
      // If a join signal briefly overwrote grp.lastMessage on Convex, check recent group messages once!
      const prevCheckedAt = checkedGroupRingAtRef.current.get(grp.id) ?? 0;
      if (!grp.lastMessage && grp.lastMessageAt > prevCheckedAt) {
        checkedGroupRingAtRef.current.set(grp.id, grp.lastMessageAt);
        void store
          .fetchGroupMessages(grp.id)
          .then((rows) => {
            if (cancelled || sessionRef.current) return;
            for (let i = rows.length - 1; i >= Math.max(0, rows.length - 10); i -= 1) {
              const row = rows[i];
              if (row.senderId === me.id || row.unsentAt) continue;
              if (Date.now() - row.createdAt > GROUP_RING_TIMEOUT_MS) continue;
              const rowInvite = parseGroupCallInvite(row.body);
              if (rowInvite && rowInvite.state === "active") {
                const liveState = resolveGroupCallLiveState(rowInvite, rows, null, row.createdAt);
                if (!liveState.isEnded) {
                  triggerIncomingGroupRing(grp, rowInvite);
                }
                break;
              }
            }
          })
          .catch(() => undefined);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [cleanupAllGroupCallResources, groupSession, groups, me, soundsEnabled, store]);

  // If we hosted an earlier group call, left first, and the last remaining member later ended it,
  // automatically persist state="ended" onto our invite message row!
  useEffect(() => {
    if (!me || !activeGroupId || groupMessages.length === 0) return;
    for (let i = groupMessages.length - 1; i >= Math.max(0, groupMessages.length - 40); i -= 1) {
      const msg = groupMessages[i];
      if (msg.senderId !== me.id || msg.unsentAt) continue;
      const invite = parseGroupCallInvite(msg.body);
      if (!invite || invite.state !== "active") continue;
      if (groupSession?.callId === invite.callId) continue;

      const resolved = resolveGroupCallLiveState(invite, groupMessages, null, msg.createdAt);
      if (resolved.isEnded) {
        void store
          .editGroupMessage(
            msg.id,
            serializeGroupCallInvite({
              ...invite,
              state: "ended",
              durationSec: resolved.durationSec ?? invite.durationSec,
              ts: Date.now(),
            }),
          )
          .catch(() => undefined);
      }
    }
  }, [activeGroupId, groupMessages, groupSession?.callId, me, store]);

  // While ringing on an incoming group call, watch for:
  // 1) Multi-device dominance: our OWN account interacting (answering/joining or declining) on another device!
  // 2) Call ending before we answer!
  useEffect(() => {
    if (!groupSession || groupSession.phase !== "incoming" || !me) return;
    let cancelled = false;

    const checkIncomingSignals = async (rows: GroupMessage[]) => {
      if (cancelled) return;
      for (const msg of rows) {
        const invite = parseGroupCallInvite(msg.body);
        if (invite && invite.callId === groupSession.callId && invite.state === "ended") {
          handledInviteCallIdsRef.current.add(groupSession.callId);
          cleanupAllGroupCallResources();
          setGroupSession(null);
          return;
        }
        if (!msg.body.startsWith(GROUP_CALL_SIGNAL_PREFIX)) continue;
        let env: GroupSignalEnvelope | null = null;
        try {
          const parsedHeader = JSON.parse(
            msg.body.slice(GROUP_CALL_SIGNAL_PREFIX.length),
          ) as GroupSignalEnvelope;
          if (parsedHeader && parsedHeader.callId && parsedHeader.type) {
            env = parsedHeader;
          }
        } catch {
          env = null;
        }
        if (!env) {
          env = await readGroupSignalEnvelope(msg);
        }
        if (!env || env.callId !== groupSession.callId) continue;

        if (env.type === "ended") {
          handledInviteCallIdsRef.current.add(groupSession.callId);
          cleanupAllGroupCallResources();
          setGroupSession(null);
          return;
        }

        // Another device logged into our same account already interacted (joined or declined)!
        if (
          msg.senderId === me.id &&
          env.deviceSessionId &&
          env.deviceSessionId !== CALL_DEVICE_SESSION_ID &&
          (env.type === "join" || env.type === "claim-ring" || env.type === "decline-ring")
        ) {
          handledInviteCallIdsRef.current.add(groupSession.callId);
          updateCallHistoryStatus(groupSession.callId, {
            state: env.type === "decline-ring" ? "declined" : "connected",
          });
          cleanupAllGroupCallResources();
          setGroupSession(null);
          return;
        }
      }
    };

    if (activeGroupId === groupSession.group.id && groupMessages.length > 0) {
      void checkIncomingSignals(groupMessages);
    }
    let incomingPollInFlight = false;
    const runIncomingPoll = () => {
      if (incomingPollInFlight || hasInFlightTursoMutation()) return;
      incomingPollInFlight = true;
      void store
        .fetchGroupMessages(groupSession.group.id, { callPollOnly: true, limit: 28 })
        .then((rows) => checkIncomingSignals(rows))
        .catch(() => undefined)
        .finally(() => {
          incomingPollInFlight = false;
        });
    };
    const poll = window.setInterval(runIncomingPoll, 750);
    runIncomingPoll();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [
    activeGroupId,
    cleanupAllGroupCallResources,
    groupMessages,
    groupSession,
    me,
    readGroupSignalEnvelope,
    store,
  ]);

  // 15-second heartbeat while actively connected in a group call (edits our own single join signal row)
  useEffect(() => {
    if (
      !groupSession ||
      groupSession.phase === "incoming" ||
      groupSession.phase === "dismissed" ||
      !me
    ) {
      return;
    }
    const heartbeat = window.setInterval(() => {
      const cur = sessionRef.current;
      const sigId = myJoinSignalIdRef.current;
      if (!cur || cur.phase === "incoming" || cur.phase === "dismissed") return;
      const header = `${GROUP_CALL_SIGNAL_PREFIX}${JSON.stringify({
        callId: cur.callId,
        groupId: cur.group.id,
        fromId: me.id,
        fromName: me.displayName,
        fromUsername: me.username,
        fromAvatarUrl: me.avatarUrl,
        fromAvatarColor: me.avatarColor,
        toId: "*",
        type: "join",
        deviceSessionId: CALL_DEVICE_SESSION_ID,
        joinSeq: myJoinSeqRef.current,
        cameraOff: stateRef.current.isCameraOff,
        screenSharing: stateRef.current.isScreenSharing,
        ts: Date.now(),
      })}`;
      if (sigId) {
        void store.editGroupMessage(sigId, header).catch(() => undefined);
      }
    }, 15_000);
    return () => window.clearInterval(heartbeat);
  }, [groupSession, me, store]);

  // Process mesh signaling packets while in a group call (joining or connected)
  useEffect(() => {
    if (
      !groupSession ||
      groupSession.phase === "incoming" ||
      groupSession.phase === "dismissed" ||
      !me
    ) {
      return;
    }
    let cancelled = false;
    const fallbackTimers = new Map<string, number>();

    const sendOfferToPeer = async (
      peerUser: JaUser,
      peerJoinSeq: number,
      peerCameraOff: boolean,
      peerScreenSharing: boolean,
    ) => {
      if (cancelled || !sessionRef.current || sessionRef.current.callId !== groupSession.callId) {
        return;
      }
      try {
        const entry = createMeshPeer(peerUser, peerJoinSeq, true);
        entry.cameraOff = peerCameraOff;
        entry.screenSharing = peerScreenSharing;

        const activeAudio =
          screenAudioMixerRef.current?.outputTrack ??
          studioGraphRef.current?.processedTrack ??
          rawMicTrackRef.current;
        const activeVideo = screenTrackRef.current ?? cameraTrackRef.current;
        const outbound = new MediaStream();
        if (activeAudio) outbound.addTrack(activeAudio);
        if (activeVideo) outbound.addTrack(activeVideo);

        const audioTx = entry.pc.addTransceiver(activeAudio ?? "audio", {
          direction: "sendrecv",
          streams: [outbound],
        });
        const videoTx = entry.pc.addTransceiver(activeVideo ?? "video", {
          direction: "sendrecv",
          streams: [outbound],
        });
        entry.audioSender = audioTx.sender;
        entry.videoSender = videoTx.sender;

        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        await waitForIceGathering(entry.pc, 2200);

        // Make sure another incoming offer didn't replace this peer entry while gathering ICE
        if (peersRef.current.get(peerUser.id)?.pc !== entry.pc) {
          return;
        }

        await sendGroupSignal(groupSession.group.id, {
          callId: groupSession.callId,
          groupId: groupSession.group.id,
          fromId: me.id,
          fromName: me.displayName,
          fromUsername: me.username,
          fromAvatarUrl: me.avatarUrl,
          fromAvatarColor: me.avatarColor,
          toId: peerUser.id,
          type: "offer",
          joinSeq: myJoinSeqRef.current,
          sdp: entry.pc.localDescription?.toJSON() ?? offer,
          cameraOff: stateRef.current.isCameraOff,
          screenSharing: stateRef.current.isScreenSharing,
          ts: Date.now(),
        });
      } catch {
        // Ignore transient peer setup error.
      }
    };

    const inspectGroupMessages = async (rows: GroupMessage[]) => {
      if (cancelled) return;

      // Build latest join/leave status per member so stale pre-leave "join" rows never trigger ghost offers!
      const latestMemberState = new Map<string, { state: "joined" | "left"; ts: number; joinSeq: number }>();
      for (const m of rows) {
        if (!m.body.startsWith(GROUP_CALL_SIGNAL_PREFIX)) continue;
        try {
          const parsed = JSON.parse(m.body.slice(GROUP_CALL_SIGNAL_PREFIX.length)) as Partial<GroupSignalEnvelope>;
          if (parsed.callId !== groupSession.callId || !parsed.fromId || !parsed.type) continue;
          const sigTs = Math.max(parsed.ts ?? 0, m.editedAt ?? 0, m.createdAt ?? 0);
          if (parsed.type === "join") {
            const prev = latestMemberState.get(parsed.fromId);
            if (!prev || sigTs >= prev.ts) {
              latestMemberState.set(parsed.fromId, {
                state: "joined",
                ts: sigTs,
                joinSeq: parsed.joinSeq ?? sigTs,
              });
            }
          } else if (parsed.type === "leave" || parsed.type === "ended") {
            const prev = latestMemberState.get(parsed.fromId);
            if (!prev || sigTs >= prev.ts) {
              latestMemberState.set(parsed.fromId, {
                state: "left",
                ts: sigTs,
                joinSeq: parsed.joinSeq ?? sigTs,
              });
            }
          }
        } catch {
          // Ignore malformed signal header.
        }
      }

      for (const msg of rows) {
        if (msg.senderId === me.id) continue;
        if (!msg.body.startsWith(GROUP_CALL_SIGNAL_PREFIX)) continue;

        // Allow edited heartbeat "join" messages to be re-inspected when editedAt changes so dropped peers auto-heal!
        const sigKey = msg.editedAt ? `${msg.id}:${msg.editedAt}` : msg.id;
        if (processedSignalIdsRef.current.has(sigKey)) continue;

        const env = await readGroupSignalEnvelope(msg);
        if (!env || env.callId !== groupSession.callId) continue;
        if (env.toId !== "*" && env.toId !== me.id) continue;
        if (env.type === "claim-ring") continue;
        if (env.type === "decline-ring") {
          processedSignalIdsRef.current.add(sigKey);
          // In a 2-person group, if the only other member declined while nobody else joined, end the call cleanly!
          if (
            groupSession.hostId === me.id &&
            (groupSession.group.memberCount ?? 2) <= 2 &&
            peersRef.current.size === 0
          ) {
            handledInviteCallIdsRef.current.add(groupSession.callId);
            myJoinSignalIdRef.current = null;
            updateCallHistoryStatus(groupSession.callId, { state: "declined" });
            if (soundsEnabled) playCallRingChime("ended");
            const inviteMsgId =
              groupSession.inviteMessageId ??
              [...rows]
                .reverse()
                .find((r) => parseGroupCallInvite(r.body)?.callId === groupSession.callId)?.id;
            cleanupAllGroupCallResources();
            sessionRef.current = null;
            setGroupSession(null);
            if (inviteMsgId) {
              void store
                .editGroupMessage(
                  inviteMsgId,
                  serializeGroupCallInvite({
                    v: 1,
                    callId: groupSession.callId,
                    groupId: groupSession.group.id,
                    groupName: groupSession.group.name,
                    mode: groupSession.mode,
                    hostId: groupSession.hostId,
                    hostName: groupSession.hostName,
                    state: "ended",
                    ts: Date.now(),
                  }),
                )
                .catch(() => undefined);
            }
            void sendGroupSignal(groupSession.group.id, {
              callId: groupSession.callId,
              groupId: groupSession.group.id,
              fromId: me.id,
              fromName: me.displayName,
              fromUsername: me.username,
              fromAvatarUrl: me.avatarUrl,
              fromAvatarColor: me.avatarColor,
              toId: "*",
              type: "ended",
              joinSeq: Date.now(),
              ts: Date.now(),
            }).catch(() => undefined);
            return;
          }
          continue;
        }

        processedSignalIdsRef.current.add(sigKey);

        const peerUser: JaUser = {
          id: env.fromId,
          displayName: env.fromName || msg.senderName || "Member",
          username: env.fromUsername || msg.senderUsername || "member",
          bio: "",
          pronouns: "",
          avatarColor: env.fromAvatarColor || msg.senderAvatarColor || "purple",
          avatarUrl: env.fromAvatarUrl ?? msg.senderAvatarUrl,
          onboardingComplete: true,
        };

        if (env.type === "leave") {
          const curStatus = latestMemberState.get(peerUser.id);
          if (!curStatus || curStatus.state === "left") {
            const ft = fallbackTimers.get(peerUser.id);
            if (ft !== undefined) {
              window.clearTimeout(ft);
              fallbackTimers.delete(peerUser.id);
            }
            removePeerEntry(peerUser.id);
          }
          continue;
        }

        if (env.type === "ended") {
          // Only tear down a peer if nobody else is still joined; never drop our own live call!
          const curStatus = latestMemberState.get(peerUser.id);
          if (!curStatus || curStatus.state === "left") {
            removePeerEntry(peerUser.id);
          }
          continue;
        }

        if (env.type === "join") {
          const curStatus = latestMemberState.get(peerUser.id);
          const effectiveTs = Math.max(env.ts || 0, msg.editedAt || 0, msg.createdAt || 0);
          // Skip if this member subsequently left or if their heartbeat is stale (>52s)
          if (curStatus && (curStatus.state === "left" || env.joinSeq < curStatus.joinSeq)) {
            continue;
          }
          if (Date.now() - effectiveTs > GROUP_CALL_HEARTBEAT_STALE_MS) {
            continue;
          }

          const existing = peersRef.current.get(peerUser.id);
          const existingHealthy =
            existing &&
            existing.joinSeq === env.joinSeq &&
            existing.pc.connectionState !== "failed" &&
            existing.pc.connectionState !== "closed";
          if (existingHealthy) {
            existing.cameraOff = env.cameraOff !== false;
            existing.screenSharing = Boolean(env.screenSharing);
            syncParticipantsState();
            continue;
          }

          // Strict total order: ONLY the newer joiner initiates the offer immediately, preventing WebRTC glare!
          const mySeq = myJoinSeqRef.current;
          const amDesignatedOfferer =
            mySeq > env.joinSeq || (mySeq === env.joinSeq && me.id > peerUser.id);

          if (amDesignatedOfferer) {
            const ft = fallbackTimers.get(peerUser.id);
            if (ft !== undefined) {
              window.clearTimeout(ft);
              fallbackTimers.delete(peerUser.id);
            }
            await sendOfferToPeer(
              peerUser,
              env.joinSeq,
              env.cameraOff !== false,
              Boolean(env.screenSharing),
            );
          } else if (!fallbackTimers.has(peerUser.id)) {
            // Safety fallback: if the newer joiner hasn't sent an offer within 4.2s, initiate from our side!
            const timerId = window.setTimeout(() => {
              fallbackTimers.delete(peerUser.id);
              const curPeer = peersRef.current.get(peerUser.id);
              if (
                !curPeer ||
                curPeer.pc.connectionState === "failed" ||
                curPeer.pc.connectionState === "closed"
              ) {
                void sendOfferToPeer(
                  peerUser,
                  env.joinSeq,
                  env.cameraOff !== false,
                  Boolean(env.screenSharing),
                );
              }
            }, 4200);
            fallbackTimers.set(peerUser.id, timerId);
          }
          continue;
        }

        if (env.type === "offer" && env.sdp) {
          const ft = fallbackTimers.get(peerUser.id);
          if (ft !== undefined) {
            window.clearTimeout(ft);
            fallbackTimers.delete(peerUser.id);
          }

          // Polite/impolite glare resolution in case both sides ever offered simultaneously:
          const existing = peersRef.current.get(peerUser.id);
          const amPolite = me.id < peerUser.id;
          if (existing && existing.pc.signalingState === "have-local-offer" && !amPolite) {
            // Impolite peer keeps its outgoing offer and ignores the colliding offer!
            continue;
          }

          try {
            const entry = createMeshPeer(peerUser, env.joinSeq, false);
            entry.cameraOff = env.cameraOff !== false;
            entry.screenSharing = Boolean(env.screenSharing);

            await entry.pc.setRemoteDescription(env.sdp);
            const activeAudio =
              screenAudioMixerRef.current?.outputTrack ??
              studioGraphRef.current?.processedTrack ??
              rawMicTrackRef.current;
            const activeVideo = screenTrackRef.current ?? cameraTrackRef.current;

            const outbound = new MediaStream();
            if (activeAudio) outbound.addTrack(activeAudio);
            if (activeVideo) outbound.addTrack(activeVideo);

            for (const tx of entry.pc.getTransceivers()) {
              const kind = tx.receiver.track?.kind;
              if (kind === "audio") {
                entry.audioSender = tx.sender;
                if (activeAudio) await tx.sender.replaceTrack(activeAudio);
                tx.direction = "sendrecv";
              } else if (kind === "video") {
                entry.videoSender = tx.sender;
                if (activeVideo) await tx.sender.replaceTrack(activeVideo);
                tx.direction = "sendrecv";
              }
            }
            if (!entry.audioSender && activeAudio) {
              entry.audioSender = entry.pc.addTrack(activeAudio, outbound);
            }
            if (!entry.videoSender && activeVideo) {
              entry.videoSender = entry.pc.addTrack(activeVideo, outbound);
            }

            const answer = await entry.pc.createAnswer();
            await entry.pc.setLocalDescription(answer);
            await waitForIceGathering(entry.pc, 2000);

            if (peersRef.current.get(peerUser.id)?.pc !== entry.pc) {
              continue;
            }

            await sendGroupSignal(groupSession.group.id, {
              callId: groupSession.callId,
              groupId: groupSession.group.id,
              fromId: me.id,
              fromName: me.displayName,
              fromUsername: me.username,
              fromAvatarUrl: me.avatarUrl,
              fromAvatarColor: me.avatarColor,
              toId: peerUser.id,
              type: "answer",
              joinSeq: myJoinSeqRef.current,
              sdp: entry.pc.localDescription?.toJSON() ?? answer,
              cameraOff: stateRef.current.isCameraOff,
              screenSharing: stateRef.current.isScreenSharing,
              ts: Date.now(),
            });
            syncParticipantsState();
          } catch {
            // Ignore duplicate offer.
          }
          continue;
        }

        if (env.type === "answer" && env.sdp) {
          const entry = peersRef.current.get(peerUser.id);
          if (entry && entry.pc.signalingState === "have-local-offer") {
            entry.cameraOff = env.cameraOff !== false;
            entry.screenSharing = Boolean(env.screenSharing);
            await entry.pc.setRemoteDescription(env.sdp).catch(() => undefined);
            syncParticipantsState();
          }
        }
      }
    };

    if (activeGroupId === groupSession.group.id && groupMessages.length > 0) {
      void inspectGroupMessages(groupMessages);
    }

    let meshPollInFlight = false;
    const runMeshPoll = () => {
      if (meshPollInFlight || hasInFlightTursoMutation()) return;
      meshPollInFlight = true;
      void store
        .fetchGroupMessages(groupSession.group.id, { callPollOnly: true, limit: 28 })
        .then((rows) => inspectGroupMessages(rows))
        .catch(() => undefined)
        .finally(() => {
          meshPollInFlight = false;
        });
    };

    const pollId = window.setInterval(runMeshPoll, 1400);

    runMeshPoll();

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      for (const t of fallbackTimers.values()) {
        window.clearTimeout(t);
      }
      fallbackTimers.clear();
    };
  }, [
    activeGroupId,
    createMeshPeer,
    groupMessages,
    groupSession,
    me,
    readGroupSignalEnvelope,
    removePeerEntry,
    sendGroupSignal,
    store,
    syncParticipantsState,
  ]);

  const acquireLocalMediaForGroupCall = useCallback(
    async (withVideo: boolean, groupTitle?: string) => {
      const permitted = await ensureNativeMediaPermissions(withVideo);
    if (!permitted) {
      throw new Error("Allow microphone and camera permissions to join the group call.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Calling requires microphone access.");
    }
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
    setFacingMode("user");
    const defaultSpeaker = withVideo || !Capacitor.isNativePlatform();
    setIsSpeakerphone(defaultSpeaker);
    void configureNativeCallAudio(true, defaultSpeaker, {
      video: Boolean(camTrack),
      title: groupTitle || "Group Call",
    });
    refreshLocalPreviewStream();
    return { micTrack, camTrack };
  }, [refreshLocalPreviewStream]);

  const startGroupCall = useCallback(
    async (group: GroupSummary, mode: CallMode) => {
      if (!me) return;
      if (sessionRef.current && sessionRef.current.phase !== "dismissed") {
        setMinimized(false);
        return;
      }
      if (sessionRef.current?.phase === "dismissed") {
        cleanupAllGroupCallResources();
        sessionRef.current = null;
        setGroupSession(null);
      }
      setCallError(null);
      try {
        const { camTrack } = await acquireLocalMediaForGroupCall(mode === "video", group.name);
        const actualMode: CallMode = mode === "video" && camTrack ? "video" : mode === "video" ? "voice" : "voice";
        const callId = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const joinSeq = Date.now();
        myJoinSeqRef.current = joinSeq;
        handledInviteCallIdsRef.current.add(callId);

        const invitePayload: GroupCallInvitePayload = {
          v: 1,
          callId,
          groupId: group.id,
          groupName: group.name,
          mode: actualMode,
          hostId: me.id,
          hostName: me.displayName,
          state: "active",
          ts: joinSeq,
        };

        setGroupSession({
          callId,
          group,
          mode: actualMode,
          phase: "connected",
          hostId: me.id,
          hostName: me.displayName,
          startedAt: Date.now(),
        });
        setMinimized(false);

        upsertCallHistoryEntry({
          callId,
          kind: "group",
          peerId: group.id,
          peerDisplayName: group.name,
          peerUsername: `${group.memberCount} members`,
          peerAvatarUrl: group.avatarUrl,
          peerAvatarColor: "purple",
          groupId: group.id,
          groupName: group.name,
          groupAvatarUrl: group.avatarUrl,
          direction: "outgoing",
          mode: actualMode,
          state: "connected",
          timestamp: joinSeq,
        });

        // Send initial join signal FIRST, then send the visible Call Invite message SECOND
        // so grp.lastMessage on Convex stays the Call Invite (ensuring every member rings & gets notified!)
        await sendGroupSignal(group.id, {
          callId,
          groupId: group.id,
          fromId: me.id,
          fromName: me.displayName,
          fromUsername: me.username,
          fromAvatarUrl: me.avatarUrl,
          fromAvatarColor: me.avatarColor,
          toId: "*",
          type: "join",
          joinSeq,
          cameraOff: !camTrack,
          screenSharing: false,
          ts: Date.now(),
        });

        await store.sendGroupMessage(group.id, serializeGroupCallInvite(invitePayload));
        const recent = await store.fetchGroupMessages(group.id).catch(() => []);
        const createdInvite = [...recent]
          .reverse()
          .find((m) => parseGroupCallInvite(m.body)?.callId === callId);
        const createdJoinSig = [...recent]
          .reverse()
          .find(
            (m) =>
              m.senderId === me.id &&
              m.body.startsWith(GROUP_CALL_SIGNAL_PREFIX) &&
              m.body.includes(callId),
          );
        myJoinSignalIdRef.current = createdJoinSig?.id ?? null;
        if (createdInvite) {
          setGroupSession((cur) =>
            cur && cur.callId === callId ? { ...cur, inviteMessageId: createdInvite.id } : cur,
          );
        }

        if (soundsEnabled) playCallRingChime("connected");
      } catch (err) {
        cleanupAllGroupCallResources();
        setGroupSession(null);
        setCallError(
          err instanceof Error && err.message
            ? err.message
            : "Could not start the group call.",
        );
      }
    },
    [
      acquireLocalMediaForGroupCall,
      cleanupAllGroupCallResources,
      me,
      sendGroupSignal,
      soundsEnabled,
      store,
    ],
  );

  const joinGroupCall = useCallback(
    async (invite: GroupCallInvitePayload, withVideo?: boolean, inviteMsgId?: string) => {
      if (!me) return;
      stopRingingTimers();
      setCallError(null);
      const groupObj: GroupSummary =
        groups.find((g) => g.id === invite.groupId) ?? {
          id: invite.groupId,
          name: invite.groupName,
          ownerId: invite.hostId,
          role: "member",
          memberCount: 2,
          lastMessage: "",
          lastMessageAt: Date.now(),
        };

      const wantVideo = withVideo ?? invite.mode === "video";
      try {
        const { camTrack } = await acquireLocalMediaForGroupCall(wantVideo, groupObj.name);
        const joinSeq = Date.now();
        myJoinSeqRef.current = joinSeq;
        handledInviteCallIdsRef.current.add(invite.callId);

        setGroupSession({
          callId: invite.callId,
          group: groupObj,
          mode: invite.mode,
          phase: "connected",
          hostId: invite.hostId,
          hostName: invite.hostName,
          startedAt: Date.now(),
          inviteMessageId: inviteMsgId,
        });
        setMinimized(false);
        updateCallHistoryStatus(invite.callId, { state: "connected" });

        await sendGroupSignal(groupObj.id, {
          callId: invite.callId,
          groupId: groupObj.id,
          fromId: me.id,
          fromName: me.displayName,
          fromUsername: me.username,
          fromAvatarUrl: me.avatarUrl,
          fromAvatarColor: me.avatarColor,
          toId: "*",
          type: "join",
          joinSeq,
          cameraOff: !camTrack,
          screenSharing: false,
          ts: Date.now(),
        });

        const recent = await store.fetchGroupMessages(groupObj.id).catch(() => []);
        const createdJoinSig = [...recent]
          .reverse()
          .find(
            (m) =>
              m.senderId === me.id &&
              m.body.startsWith(GROUP_CALL_SIGNAL_PREFIX) &&
              m.body.includes(invite.callId),
          );
        myJoinSignalIdRef.current = createdJoinSig?.id ?? null;

        if (soundsEnabled) playCallRingChime("connected");
      } catch (err) {
        cleanupAllGroupCallResources();
        setGroupSession(null);
        setCallError(
          err instanceof Error && err.message ? err.message : "Could not join group call.",
        );
      }
    },
    [
      acquireLocalMediaForGroupCall,
      cleanupAllGroupCallResources,
      groups,
      me,
      sendGroupSignal,
      soundsEnabled,
      stopRingingTimers,
      store,
    ],
  );

  const acceptIncomingGroupCall = useCallback(
    async (withVideo: boolean) => {
      const cur = sessionRef.current;
      if (!cur || cur.phase !== "incoming") return;
      if (me) {
        // Immediately notify sibling devices logged into our account so they stop ringing right away!
        void sendGroupSignal(cur.group.id, {
          callId: cur.callId,
          groupId: cur.group.id,
          fromId: me.id,
          fromName: me.displayName,
          fromUsername: me.username,
          fromAvatarUrl: me.avatarUrl,
          fromAvatarColor: me.avatarColor,
          toId: me.id,
          type: "claim-ring",
          deviceSessionId: CALL_DEVICE_SESSION_ID,
          joinSeq: Date.now(),
          ts: Date.now(),
        }).catch(() => undefined);
      }
      await joinGroupCall(
        {
          v: 1,
          callId: cur.callId,
          groupId: cur.group.id,
          groupName: cur.group.name,
          mode: cur.mode,
          hostId: cur.hostId,
          hostName: cur.hostName,
          state: "active",
          ts: Date.now(),
        },
        withVideo,
      );
    },
    [joinGroupCall, me, sendGroupSignal],
  );

  const declineIncomingGroupCall = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) {
      cleanupAllGroupCallResources();
      return;
    }
    handledInviteCallIdsRef.current.add(cur.callId);
    setDeclinedGroupCallIds((prev) => {
      const next = new Set(prev);
      next.add(cur.callId);
      return next;
    });
    updateCallHistoryStatus(cur.callId, { state: "declined" });
    cleanupAllGroupCallResources();
    sessionRef.current = null;
    setGroupSession(null);
    if (me) {
      // Broadcast decline-ring to "*" so both our sibling devices AND the host know we declined!
      void sendGroupSignal(cur.group.id, {
        callId: cur.callId,
        groupId: cur.group.id,
        fromId: me.id,
        fromName: me.displayName,
        fromUsername: me.username,
        fromAvatarUrl: me.avatarUrl,
        fromAvatarColor: me.avatarColor,
        toId: "*",
        type: "decline-ring",
        deviceSessionId: CALL_DEVICE_SESSION_ID,
        joinSeq: Date.now(),
        ts: Date.now(),
      }).catch(() => undefined);
    }
  }, [cleanupAllGroupCallResources, me, sendGroupSignal]);

  const leaveGroupCall = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur || !me) return;
    handledInviteCallIdsRef.current.add(cur.callId);
    myJoinSignalIdRef.current = null;
    broadcastMeshData({ type: "leave" });
    if (soundsEnabled) playCallRingChime("ended");

    const remainingPeers = peersRef.current.size;
    const durationSec = cur.startedAt
      ? Math.max(1, Math.round((Date.now() - cur.startedAt) / 1000))
      : 0;
    updateCallHistoryStatus(cur.callId, {
      state: "ended",
      durationSec: durationSec > 0 ? durationSec : undefined,
    });

    cleanupAllGroupCallResources();
    setGroupSession(null);

    await sendGroupSignal(cur.group.id, {
      callId: cur.callId,
      groupId: cur.group.id,
      fromId: me.id,
      fromName: me.displayName,
      fromUsername: me.username,
      fromAvatarUrl: me.avatarUrl,
      fromAvatarColor: me.avatarColor,
      toId: "*",
      type: "leave",
      joinSeq: myJoinSeqRef.current,
      ts: Date.now(),
    }).catch(() => undefined);

    if (remainingPeers === 0) {
      // Double-check live group signals so we NEVER mark the call "ended" if another member is still joined!
      const latestRows = await store.fetchGroupMessages(cur.group.id).catch(() => []);
      const otherMemberStatus = new Map<string, { state: "joined" | "left"; ts: number }>();
      for (const m of latestRows) {
        if (!m.body.startsWith(GROUP_CALL_SIGNAL_PREFIX)) continue;
        try {
          const parsed = JSON.parse(m.body.slice(GROUP_CALL_SIGNAL_PREFIX.length)) as Partial<GroupSignalEnvelope>;
          if (parsed.callId !== cur.callId || !parsed.fromId || parsed.fromId === me.id) continue;
          const sigTs = Math.max(parsed.ts ?? 0, m.editedAt ?? 0, m.createdAt ?? 0);
          if (parsed.type === "join") {
            const prev = otherMemberStatus.get(parsed.fromId);
            if (!prev || sigTs >= prev.ts) otherMemberStatus.set(parsed.fromId, { state: "joined", ts: sigTs });
          } else if (parsed.type === "leave" || parsed.type === "ended") {
            const prev = otherMemberStatus.get(parsed.fromId);
            if (!prev || sigTs >= prev.ts) otherMemberStatus.set(parsed.fromId, { state: "left", ts: sigTs });
          }
        } catch {
          // Ignore malformed signal.
        }
      }
      let anyOtherStillJoined = false;
      const nowTs = Date.now();
      for (const st of otherMemberStatus.values()) {
        if (st.state === "joined" && nowTs - st.ts < GROUP_CALL_HEARTBEAT_STALE_MS) {
          anyOtherStillJoined = true;
          break;
        }
      }

      if (!anyOtherStillJoined) {
        // Broadcast persistent "ended" marker so EVERY client immediately shows "GC VC Ended"
        // and hides the active banner, even when the last person leaving wasn't the original host!
        await sendGroupSignal(cur.group.id, {
          callId: cur.callId,
          groupId: cur.group.id,
          fromId: me.id,
          fromName: me.displayName,
          fromUsername: me.username,
          fromAvatarUrl: me.avatarUrl,
          fromAvatarColor: me.avatarColor,
          toId: "*",
          type: "ended",
          joinSeq: myJoinSeqRef.current,
          durationSec: durationSec > 0 ? durationSec : undefined,
          ts: Date.now(),
        }).catch(() => undefined);

        if (cur.hostId === me.id) {
          let targetInviteMsgId = cur.inviteMessageId;
          if (!targetInviteMsgId) {
            const found = [...latestRows]
              .reverse()
              .find((m) => parseGroupCallInvite(m.body)?.callId === cur.callId);
            targetInviteMsgId = found?.id;
          }
          if (targetInviteMsgId) {
            await store
              .editGroupMessage(
                targetInviteMsgId,
                serializeGroupCallInvite({
                  v: 1,
                  callId: cur.callId,
                  groupId: cur.group.id,
                  groupName: cur.group.name,
                  mode: cur.mode,
                  hostId: cur.hostId,
                  hostName: cur.hostName,
                  state: "ended",
                  durationSec: durationSec > 0 ? durationSec : undefined,
                  ts: Date.now(),
                }),
              )
              .catch(() => undefined);
          }
        }
      }
    }
  }, [broadcastMeshData, cleanupAllGroupCallResources, me, sendGroupSignal, soundsEnabled, store]);

  const replaceMeshVideoTrack = useCallback(async (track: MediaStreamTrack | null) => {
    for (const entry of peersRef.current.values()) {
      if (entry.videoSender) {
        await entry.videoSender.replaceTrack(track).catch(() => undefined);
      }
    }
  }, []);

  const replaceMeshAudioTrack = useCallback(async (track: MediaStreamTrack | null) => {
    for (const entry of peersRef.current.values()) {
      if (entry.audioSender) {
        await entry.audioSender.replaceTrack(track).catch(() => undefined);
      }
    }
  }, []);

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
      await replaceMeshVideoTrack(null);
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
      await replaceMeshVideoTrack(newTrack);
      setIsCameraOff(false);
      refreshLocalPreviewStream();
      broadcastMyState({ isCameraOff: false });
    } catch {
      setCallError("Could not start your camera.");
    }
  }, [
    broadcastMyState,
    facingMode,
    isCameraOff,
    isScreenSharing,
    refreshLocalPreviewStream,
    replaceMeshVideoTrack,
  ]);

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
      await replaceMeshVideoTrack(newTrack);
      refreshLocalPreviewStream();
      broadcastMyState({ isCameraOff: false });
    } catch {
      try {
        const fallback = await acquireSwitchedCameraTrack(null, prevFacing);
        cameraTrackRef.current = fallback;
        await replaceMeshVideoTrack(fallback);
        refreshLocalPreviewStream();
      } catch {
        setIsCameraOff(true);
        refreshLocalPreviewStream();
      }
      setCallError("Could not switch cameras on this device.");
    }
  }, [
    broadcastMyState,
    facingMode,
    isCameraOff,
    isScreenSharing,
    refreshLocalPreviewStream,
    replaceMeshVideoTrack,
  ]);

  const renegotiateMeshVideoIfNeeded = useCallback(async () => {
    for (const entry of peersRef.current.values()) {
      try {
        if (entry.pc.signalingState !== "stable" || entry.dc?.readyState !== "open") continue;
        const vTx = entry.pc
          .getTransceivers()
          .find((t) => t.sender === entry.videoSender || t.receiver?.track?.kind === "video");
        if (vTx && vTx.direction !== "sendrecv") {
          vTx.direction = "sendrecv";
        }
        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        entry.dc.send(
          JSON.stringify({
            type: "renegotiate-offer",
            sdp: entry.pc.localDescription?.toJSON() ?? offer,
          } satisfies GroupDataChannelPacket),
        );
      } catch {
        // Ignore transient mesh renegotiation error.
      }
    }
  }, []);

  const restoreGroupVoiceOnlyAudio = useCallback(async () => {
    if (screenAudioMixerRef.current) {
      screenAudioMixerRef.current.dispose();
      screenAudioMixerRef.current = null;
    }
    const voiceTrack = studioGraphRef.current?.processedTrack ?? rawMicTrackRef.current;
    await replaceMeshAudioTrack(voiceTrack ?? null);
  }, [replaceMeshAudioTrack]);

  const finishStoppingGroupScreenShare = useCallback(
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
      await restoreGroupVoiceOnlyAudio();
      const fallbackCam = cameraTrackRef.current;
      await replaceMeshVideoTrack(fallbackCam ?? null);
      setIsScreenSharing(false);
      setIsCameraOff(!fallbackCam);
      refreshLocalPreviewStream();
      broadcastMyState({ isScreenSharing: false, isCameraOff: !fallbackCam });
    },
    [
      broadcastMyState,
      refreshLocalPreviewStream,
      replaceMeshVideoTrack,
      restoreGroupVoiceOnlyAudio,
      stopNativeScreenShareInternal,
    ],
  );

  const activateGroupScreenShare = useCallback(
    async (shareSession: ActiveScreenShareSession, mixer: ScreenAudioMixer | null) => {
      activeScreenShareRef.current = shareSession;
      screenTrackRef.current = shareSession.videoTrack;
      setSharedMediaVideoElement(shareSession.sharedVideoElement ?? null);

      if (mixer) {
        screenAudioMixerRef.current = mixer;
        await replaceMeshAudioTrack(mixer.outputTrack);
      }

      const hadPriorVideo = Array.from(peersRef.current.values()).every((e) =>
        Boolean(e.videoSender?.track),
      );
      await replaceMeshVideoTrack(shareSession.videoTrack);
      setIsScreenSharing(true);
      setIsCameraOff(false);
      refreshLocalPreviewStream();
      broadcastMyState({ isScreenSharing: true, isCameraOff: false });

      if (!hadPriorVideo) {
        await renegotiateMeshVideoIfNeeded();
      }
    },
    [
      broadcastMyState,
      refreshLocalPreviewStream,
      renegotiateMeshVideoIfNeeded,
      replaceMeshAudioTrack,
      replaceMeshVideoTrack,
    ],
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
            void finishStoppingGroupScreenShare(false);
          },
        });
        await activateGroupScreenShare(shareSession, mixer);
      } catch (err) {
        mixer?.dispose();
        setCallError(
          err instanceof Error && err.message
            ? err.message
            : "Could not share the selected video.",
        );
      }
    },
    [activateGroupScreenShare, finishStoppingGroupScreenShare],
  );

  const startMobileCameraShare = useCallback(async () => {
    setMobileSharePickerOpen(false);
    setCallError(null);
    try {
      const shareSession = await startMobileRearPresentationShare({
        onSystemStopped: () => {
          void finishStoppingGroupScreenShare(false);
        },
      });
      await activateGroupScreenShare(shareSession, null);
    } catch (err) {
      setCallError(
        err instanceof Error && err.message
          ? err.message
          : "Could not start presentation camera.",
      );
    }
  }, [activateGroupScreenShare, finishStoppingGroupScreenShare]);

  const closeMobileSharePicker = useCallback(() => {
    setMobileSharePickerOpen(false);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await finishStoppingGroupScreenShare(true);
      return;
    }

    setCallError(null);
    const voiceTrack = studioGraphRef.current?.processedTrack ?? rawMicTrackRef.current;

    if (Capacitor.isNativePlatform()) {
      const mixer = createScreenAudioMixer(voiceTrack, stateRef.current.isMuted);
      try {
        const shareSession = await startNativeAndroidScreenShare({
          mixer,
          onSystemStopped: () => {
            void finishStoppingGroupScreenShare(false);
          },
        });
        if (!shareSession) {
          mixer?.dispose();
          return;
        }
        await activateGroupScreenShare(shareSession, mixer);
      } catch {
        mixer?.dispose();
        stopNativeScreenShareInternal(true);
        setCallError("Could not start mobile screen sharing.");
      }
      return;
    }

    if (isWebDisplayMediaSupported()) {
      const mixer = createScreenAudioMixer(voiceTrack, stateRef.current.isMuted);
      try {
        const shareSession = await startWebDisplayScreenShare({
          mixer,
          onSystemStopped: () => {
            void finishStoppingGroupScreenShare(false);
          },
        });
        await activateGroupScreenShare(shareSession, mixer);
        return;
      } catch (err) {
        mixer?.dispose();
        const errName = err instanceof DOMException ? err.name : "";
        if (errName === "NotAllowedError" || errName === "AbortError") {
          return;
        }
      }
    }

    setMobileSharePickerOpen(true);
  }, [
    activateGroupScreenShare,
    finishStoppingGroupScreenShare,
    isScreenSharing,
    stopNativeScreenShareInternal,
  ]);

  const toggleSpeakerphone = useCallback(async () => {
    const next = !isSpeakerphone;
    setIsSpeakerphone(next);
    await configureNativeCallAudio(true, next, {
      video: !isCameraOff,
      title: sessionRef.current?.group.name || "Group Call",
    });
  }, [isCameraOff, isSpeakerphone]);

  const toggleStudioAudio = useCallback(() => {
    const rawMic = rawMicTrackRef.current;
    if (!rawMic) return;
    if (studioAudioEnabled) {
      if (studioGraphRef.current) {
        studioGraphRef.current.processedTrack.stop();
        void studioGraphRef.current.ctx.close().catch(() => undefined);
        studioGraphRef.current = null;
      }
      if (screenAudioMixerRef.current) {
        screenAudioMixerRef.current.setMicTrack(rawMic, isMuted);
      } else {
        void replaceMeshAudioTrack(rawMic);
      }
      setStudioAudioEnabled(false);
      return;
    }
    const graph = createStudioVoiceProcessor(rawMic);
    if (!graph) return;
    graph.processedTrack.enabled = !isMuted;
    studioGraphRef.current = graph;
    if (screenAudioMixerRef.current) {
      screenAudioMixerRef.current.setMicTrack(graph.processedTrack, isMuted);
    } else {
      void replaceMeshAudioTrack(graph.processedTrack);
    }
    setStudioAudioEnabled(true);
  }, [isMuted, replaceMeshAudioTrack, studioAudioEnabled]);

  const toggleCaptions = useCallback(() => {
    if (captionsEnabled) {
      stopCaptionCapture();
      setCaptionsEnabled(false);
      return;
    }
    setCaptionsEnabled(true);
    if (Capacitor.isNativePlatform()) {
      void (async () => {
        try {
          nativeCaptionListenerRef.current = await JaTextNative.addListener(
            "speechTranscript",
            (ev) => {
              const latest = ev.text.trim().slice(-140);
              if (!latest || !me) return;
              setCaptions((prev) => {
                const rest = prev.filter((c) => c.speakerName !== "You");
                return [...rest.slice(-3), { speakerName: "You", text: latest, updatedAt: Date.now() }];
              });
              broadcastMeshData({ type: "caption", text: latest });
            },
          );
          await JaTextNative.startSpeechCapture();
        } catch {
          // Ignore.
        }
      })();
    }
  }, [broadcastMeshData, captionsEnabled, me, stopCaptionCapture]);

  const sendCallReaction = useCallback(
    (emoji: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      spawnReaction(emoji, true, id);
      broadcastMeshData({ type: "reaction", emoji, id });
    },
    [broadcastMeshData, spawnReaction],
  );

  const playSoundboard = useCallback(
    (effectId: SoundboardEffectId) => {
      if (!isDeafenedRef.current) {
        playSynthesizedSoundboard(effectId);
      }
      broadcastMeshData({ type: "soundboard", effectId });
    },
    [broadcastMeshData],
  );

  // Keep group call alive across app switches / backgrounding & restore evicted camera/audio
  useEffect(() => {
    if (!groupSession || groupSession.phase === "incoming") return;

    const resumeGroupMedia = async (becameVisible: boolean) => {
      try {
        if (studioGraphRef.current?.ctx.state === "suspended") {
          void studioGraphRef.current.ctx.resume().catch(() => undefined);
        }
        if (!isDeafened) {
          for (const entry of peersRef.current.values()) {
            void entry.audioEl.play().catch(() => undefined);
          }
        }
      } catch {
        // Ignore audio resume errors.
      }

      if (!becameVisible) return;

      void configureNativeCallAudio(true, isSpeakerphone, {
        video: !isCameraOff,
        title: groupSession.group.name,
      });

      if (
        !isCameraOff &&
        !isScreenSharing &&
        (!cameraTrackRef.current || cameraTrackRef.current.readyState === "ended")
      ) {
        try {
          const restored = await acquireSwitchedCameraTrack(cameraTrackRef.current, facingMode);
          cameraTrackRef.current = restored;
          await replaceMeshVideoTrack(restored);
          refreshLocalPreviewStream();
        } catch {
          // Keep group voice active if camera stays unavailable.
        }
      }
    };

    const onVisibility = () => {
      void resumeGroupMedia(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisibility);

    let appStateHandle: PluginListenerHandle | null = null;
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        void resumeGroupMedia(isActive);
      }).then((h) => {
        appStateHandle = h;
      });
    }

    const keepAliveTimer = window.setInterval(() => {
      void resumeGroupMedia(false);
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
    groupSession,
    isCameraOff,
    isDeafened,
    isScreenSharing,
    isSpeakerphone,
    refreshLocalPreviewStream,
    replaceMeshVideoTrack,
  ]);

  const canScreenShare = true;

  const closeDismissedGroupCall = useCallback(() => {
    cleanupAllGroupCallResources();
    sessionRef.current = null;
    setGroupSession(null);
  }, [cleanupAllGroupCallResources]);

  const retryDismissedGroupCall = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    const { group, mode } = cur;
    cleanupAllGroupCallResources();
    sessionRef.current = null;
    setGroupSession(null);
    await startGroupCall(group, mode);
  }, [cleanupAllGroupCallResources, startGroupCall]);

  const value = useMemo<GroupCallContextValue>(
    () => ({
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
      declinedGroupCallIds,
      mobileSharePickerOpen,
      sharedMediaVideoElement,
      startGroupCall,
      joinGroupCall,
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
      dismissCallError: () => setCallError(null),
    }),
    [
      acceptIncomingGroupCall,
      callError,
      canScreenShare,
      captions,
      captionsEnabled,
      closeDismissedGroupCall,
      closeMobileSharePicker,
      declineIncomingGroupCall,
      declinedGroupCallIds,
      facingMode,
      flipCamera,
      groupSession,
      isCameraOff,
      isDeafened,
      isMuted,
      isScreenSharing,
      isSpeakerphone,
      joinGroupCall,
      layoutMode,
      leaveGroupCall,
      localStream,
      meSpeaking,
      minimized,
      mobileSharePickerOpen,
      participants,
      playSoundboard,
      reactions,
      retryDismissedGroupCall,
      sendCallReaction,
      sharedMediaVideoElement,
      startGroupCall,
      startMobileCameraShare,
      startMobileVideoShare,
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

  return <GroupCallContext.Provider value={value}>{children}</GroupCallContext.Provider>;
}
