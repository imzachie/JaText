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
import { updateCallHistoryStatus, upsertCallHistoryEntry } from "./callHistory";
import { JaTextNative, configureNativeCallAudio, ensureNativeMediaPermissions } from "./nativeBridge";
import { useJaText } from "./store";
import type { GroupMessage, GroupSummary, JaUser } from "./types";

const GROUP_RING_TIMEOUT_MS = 45_000;

const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun.cloudflare.com:3478",
    ],
  },
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
  toId: string; // "*" for broadcast join/leave, or specific peer userId
  type: "join" | "offer" | "answer" | "leave";
  joinSeq: number;
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
  phase: "incoming" | "joining" | "connected";
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
  startGroupCall: (group: GroupSummary, mode: CallMode) => Promise<void>;
  joinGroupCall: (invite: GroupCallInvitePayload, withVideo?: boolean, inviteMsgId?: string) => Promise<void>;
  acceptIncomingGroupCall: (withVideo: boolean) => Promise<void>;
  declineIncomingGroupCall: () => void;
  leaveGroupCall: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  flipCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
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

function waitForIceGathering(pc: RTCPeerConnection, maxWaitMs = 850): Promise<void> {
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
      if (ev.candidate.candidate.includes(" typ srflx ") && srflxTimer === null) {
        srflxTimer = window.setTimeout(finish, 180);
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

  const sessionRef = useRef<ActiveGroupCallSession | null>(null);
  const peersRef = useRef(new Map<string, PeerMeshEntry>());
  const rawMicTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const studioGraphRef = useRef<{ ctx: AudioContext; processedTrack: MediaStreamTrack } | null>(null);
  const myJoinSeqRef = useRef<number>(0);
  const handledInviteCallIdsRef = useRef(new Set<string>());
  const processedSignalIdsRef = useRef(new Set<string>());
  const ringIntervalRef = useRef<number | null>(null);
  const ringTimeoutRef = useRef<number | null>(null);
  const nativeScreenFrameRef = useRef<PluginListenerHandle | null>(null);
  const nativeScreenStopRef = useRef<PluginListenerHandle | null>(null);
  const nativeScreenKeepAliveRef = useRef<number | null>(null);
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
    if (nativeScreenKeepAliveRef.current !== null) {
      window.clearInterval(nativeScreenKeepAliveRef.current);
      nativeScreenKeepAliveRef.current = null;
    }
    if (nativeScreenFrameRef.current) {
      void nativeScreenFrameRef.current.remove();
      nativeScreenFrameRef.current = null;
    }
    if (nativeScreenStopRef.current) {
      void nativeScreenStopRef.current.remove();
      nativeScreenStopRef.current = null;
    }
    if (notifyService && Capacitor.isNativePlatform()) {
      void JaTextNative.stopScreenCapture().catch(() => undefined);
    }
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
      const header = `${GROUP_CALL_SIGNAL_PREFIX}${JSON.stringify({
        callId: env.callId,
        groupId: env.groupId,
        fromId: env.fromId,
        fromName: env.fromName,
        fromUsername: env.fromUsername,
        fromAvatarUrl: env.fromAvatarUrl,
        fromAvatarColor: env.fromAvatarColor,
        toId: env.toId,
        type: env.type,
        joinSeq: env.joinSeq,
        cameraOff: env.cameraOff,
        screenSharing: env.screenSharing,
        ts: env.ts,
      })}`;
      if (env.sdp) {
        const blobFile = new File([JSON.stringify(env)], `gcall-${env.type}.json`, {
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
    if (!msg.body.startsWith(GROUP_CALL_SIGNAL_PREFIX)) return null;
    if (msg.attachmentUrl) {
      try {
        const res = await fetch(msg.attachmentUrl);
        if (res.ok) {
          return (await res.json()) as GroupSignalEnvelope;
        }
      } catch {
        // Fall through to inline JSON parse.
      }
    }
    try {
      return JSON.parse(msg.body.slice(GROUP_CALL_SIGNAL_PREFIX.length)) as GroupSignalEnvelope;
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

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const remoteStream = new MediaStream();
      const audioEl = new Audio();
      audioEl.autoplay = true;
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

  // Watch group previews for incoming group calls!
  useEffect(() => {
    if (!me || groupSession) return;
    const now = Date.now();
    for (const grp of groups) {
      if (!grp.lastMessage || grp.lastSenderId === me.id) continue;
      if (now - grp.lastMessageAt > GROUP_RING_TIMEOUT_MS) continue;
      const invite = parseGroupCallInvite(grp.lastMessage);
      if (!invite || invite.state !== "active") continue;
      if (handledInviteCallIdsRef.current.has(invite.callId)) continue;

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

      if (soundsEnabled && me.statusPreference !== "dnd") {
        playCallRingChime("incoming");
        ringIntervalRef.current = window.setInterval(() => {
          playCallRingChime("incoming");
        }, 2600);
      }

      ringTimeoutRef.current = window.setTimeout(() => {
        const cur = sessionRef.current;
        if (cur && cur.callId === invite.callId && cur.phase === "incoming") {
          updateCallHistoryStatus(invite.callId, { state: "missed" });
          cleanupAllGroupCallResources();
          setGroupSession(null);
        }
      }, GROUP_RING_TIMEOUT_MS);
      break;
    }
  }, [cleanupAllGroupCallResources, groupSession, groups, me, soundsEnabled]);

  // Process mesh signaling packets while in a group call (joining or connected)
  useEffect(() => {
    if (!groupSession || groupSession.phase === "incoming" || !me) return;
    let cancelled = false;

    const inspectGroupMessages = async (rows: GroupMessage[]) => {
      if (cancelled) return;
      for (const msg of rows) {
        if (msg.senderId === me.id) continue;
        if (!msg.body.startsWith(GROUP_CALL_SIGNAL_PREFIX)) continue;
        if (processedSignalIdsRef.current.has(msg.id)) continue;

        const env = await readGroupSignalEnvelope(msg);
        if (!env || env.callId !== groupSession.callId) continue;
        if (env.toId !== "*" && env.toId !== me.id) continue;

        processedSignalIdsRef.current.add(msg.id);
        void store.deleteGroupMessageForMe(msg.id).catch(() => undefined);

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
          removePeerEntry(peerUser.id);
          continue;
        }

        if (env.type === "join") {
          const existing = peersRef.current.get(peerUser.id);
          const shouldOffer =
            !existing ||
            (env.joinSeq > existing.joinSeq &&
              (existing.pc.connectionState === "connected" ||
                me.id < peerUser.id ||
                myJoinSeqRef.current < env.joinSeq));
          if (!shouldOffer) continue;

          try {
            const entry = createMeshPeer(peerUser, env.joinSeq, true);
            entry.cameraOff = env.cameraOff !== false;
            entry.screenSharing = Boolean(env.screenSharing);

            const activeAudio = studioGraphRef.current?.processedTrack ?? rawMicTrackRef.current;
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
            await waitForIceGathering(entry.pc, 850);

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
          continue;
        }

        if (env.type === "offer" && env.sdp) {
          try {
            const entry = createMeshPeer(peerUser, env.joinSeq, false);
            entry.cameraOff = env.cameraOff !== false;
            entry.screenSharing = Boolean(env.screenSharing);

            await entry.pc.setRemoteDescription(env.sdp);
            const activeAudio = studioGraphRef.current?.processedTrack ?? rawMicTrackRef.current;
            const activeVideo = screenTrackRef.current ?? cameraTrackRef.current;

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

            const answer = await entry.pc.createAnswer();
            await entry.pc.setLocalDescription(answer);
            await waitForIceGathering(entry.pc, 800);

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

    const pollId = window.setInterval(() => {
      void store
        .fetchGroupMessages(groupSession.group.id)
        .then((rows) => inspectGroupMessages(rows))
        .catch(() => undefined);
    }, 1400);

    void store
      .fetchGroupMessages(groupSession.group.id)
      .then((rows) => inspectGroupMessages(rows))
      .catch(() => undefined);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
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
      if (sessionRef.current) {
        setMinimized(false);
        return;
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

        await store.sendGroupMessage(group.id, serializeGroupCallInvite(invitePayload));
        const recent = await store.fetchGroupMessages(group.id).catch(() => []);
        const createdInvite = [...recent]
          .reverse()
          .find((m) => parseGroupCallInvite(m.body)?.callId === callId);
        if (createdInvite) {
          setGroupSession((cur) =>
            cur && cur.callId === callId ? { ...cur, inviteMessageId: createdInvite.id } : cur,
          );
        }

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
    ],
  );

  const acceptIncomingGroupCall = useCallback(
    async (withVideo: boolean) => {
      const cur = sessionRef.current;
      if (!cur || cur.phase !== "incoming") return;
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
    [joinGroupCall],
  );

  const declineIncomingGroupCall = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    handledInviteCallIdsRef.current.add(cur.callId);
    updateCallHistoryStatus(cur.callId, { state: "declined" });
    cleanupAllGroupCallResources();
    setGroupSession(null);
  }, [cleanupAllGroupCallResources]);

  const leaveGroupCall = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur || !me) return;
    handledInviteCallIdsRef.current.add(cur.callId);
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

    if (cur.hostId === me.id && cur.inviteMessageId && remainingPeers === 0) {
      await store
        .editGroupMessage(
          cur.inviteMessageId,
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

    window.setTimeout(() => {
      void store
        .fetchGroupMessages(cur.group.id)
        .then((rows) => {
          for (const m of rows) {
            if (
              m.senderId === me.id &&
              m.body.startsWith(GROUP_CALL_SIGNAL_PREFIX) &&
              m.body.includes(cur.callId)
            ) {
              void store.deleteGroupMessageForMe(m.id).catch(() => undefined);
            }
          }
        })
        .catch(() => undefined);
    }, 6000);
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

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopNativeScreenShareInternal(true);
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      const fallbackCam = cameraTrackRef.current;
      await replaceMeshVideoTrack(fallbackCam ?? null);
      setIsScreenSharing(false);
      setIsCameraOff(!fallbackCam);
      refreshLocalPreviewStream();
      broadcastMyState({ isScreenSharing: false, isCameraOff: !fallbackCam });
      return;
    }

    if (Capacitor.isNativePlatform()) {
      try {
        setCallError(null);
        const startRes = await JaTextNative.startScreenCapture();
        if (!startRes.started) return;
        const width = Math.max(240, startRes.width ?? 540);
        const height = Math.max(240, startRes.height ?? 960);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx2d = canvas.getContext("2d", { alpha: false });
        if (!ctx2d) {
          await JaTextNative.stopScreenCapture().catch(() => undefined);
          return;
        }
        ctx2d.fillStyle = "#0b0b10";
        ctx2d.fillRect(0, 0, width, height);

        const captureCanvas = canvas as HTMLCanvasElement & {
          captureStream?: (fps?: number) => MediaStream;
        };
        if (typeof captureCanvas.captureStream !== "function") {
          await JaTextNative.stopScreenCapture().catch(() => undefined);
          return;
        }
        const stream = captureCanvas.captureStream(15);
        const screenTrack = stream.getVideoTracks()[0] as
          | (MediaStreamTrack & { requestFrame?: () => void })
          | undefined;
        if (!screenTrack) {
          await JaTextNative.stopScreenCapture().catch(() => undefined);
          return;
        }

        const decodeImg = new Image();
        let decoding = false;
        let lastDrawnAt = performance.now();

        nativeScreenFrameRef.current = await JaTextNative.addListener("screenCaptureFrame", (ev) => {
          if (!ev.frame || decoding) return;
          decoding = true;
          decodeImg.onload = () => {
            decoding = false;
            if (ev.width && ev.height && (canvas.width !== ev.width || canvas.height !== ev.height)) {
              canvas.width = ev.width;
              canvas.height = ev.height;
            }
            ctx2d.drawImage(decodeImg, 0, 0, canvas.width, canvas.height);
            lastDrawnAt = performance.now();
            screenTrack.requestFrame?.();
          };
          decodeImg.onerror = () => {
            decoding = false;
          };
          decodeImg.src = `data:image/jpeg;base64,${ev.frame}`;
        });

        nativeScreenKeepAliveRef.current = window.setInterval(() => {
          if (performance.now() - lastDrawnAt > 260 && decodeImg.complete && decodeImg.naturalWidth > 0) {
            ctx2d.drawImage(decodeImg, 0, 0, canvas.width, canvas.height);
            screenTrack.requestFrame?.();
          }
        }, 280);

        nativeScreenStopRef.current = await JaTextNative.addListener("screenCaptureStopped", () => {
          stopNativeScreenShareInternal(false);
          if (screenTrackRef.current) {
            screenTrackRef.current.stop();
            screenTrackRef.current = null;
          }
          const fallbackCam = cameraTrackRef.current;
          void replaceMeshVideoTrack(fallbackCam ?? null);
          setIsScreenSharing(false);
          setIsCameraOff(!fallbackCam);
          refreshLocalPreviewStream();
          broadcastMyState({ isScreenSharing: false, isCameraOff: !fallbackCam });
        });

        screenTrackRef.current = screenTrack;
        await replaceMeshVideoTrack(screenTrack);
        setIsScreenSharing(true);
        setIsCameraOff(false);
        refreshLocalPreviewStream();
        broadcastMyState({ isScreenSharing: true, isCameraOff: false });
      } catch {
        stopNativeScreenShareInternal(true);
        setCallError("Could not start mobile screen sharing.");
      }
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCallError("Screen sharing isn't supported in this browser.");
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;
      screenTrackRef.current = screenTrack;
      screenTrack.onended = () => {
        screenTrackRef.current = null;
        const fallbackCam = cameraTrackRef.current;
        void replaceMeshVideoTrack(fallbackCam ?? null);
        setIsScreenSharing(false);
        setIsCameraOff(!fallbackCam);
        refreshLocalPreviewStream();
        broadcastMyState({ isScreenSharing: false, isCameraOff: !fallbackCam });
      };
      await replaceMeshVideoTrack(screenTrack);
      setIsScreenSharing(true);
      setIsCameraOff(false);
      refreshLocalPreviewStream();
      broadcastMyState({ isScreenSharing: true, isCameraOff: false });
    } catch {
      // User cancelled picker.
    }
  }, [
    broadcastMyState,
    isScreenSharing,
    refreshLocalPreviewStream,
    replaceMeshVideoTrack,
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
      void replaceMeshAudioTrack(rawMic);
      setStudioAudioEnabled(false);
      return;
    }
    const graph = createStudioVoiceProcessor(rawMic);
    if (!graph) return;
    graph.processedTrack.enabled = !isMuted;
    studioGraphRef.current = graph;
    void replaceMeshAudioTrack(graph.processedTrack);
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

  const canScreenShare =
    Capacitor.isNativePlatform() ||
    (typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia));

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
      startGroupCall,
      joinGroupCall,
      acceptIncomingGroupCall,
      declineIncomingGroupCall,
      leaveGroupCall,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      flipCamera,
      toggleScreenShare,
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
      declineIncomingGroupCall,
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
      participants,
      playSoundboard,
      reactions,
      sendCallReaction,
      startGroupCall,
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
