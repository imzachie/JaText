import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Avatar } from "./Avatar";
import { IosEmojiText } from "./IosEmoji";
import {
  IosCloseIcon,
  IosEyeIcon,
  IosHeartIcon,
  IosMusicNoteIcon,
  IosTrashIcon,
  ReactionGlyph,
} from "./IosVectorIcons";
import { useJaText } from "../lib/store";
import {
  resolveTursoMediaUrl,
  tursoRpc,
  uploadMediaToTurso,
} from "../lib/tursoClient";

export type StatusPrivacyType =
  | "MY_CONTACTS"
  | "CONTACTS_EXCEPT"
  | "ONLY_SHARE_WITH"
  | "GROUP_EXCLUSIVE";

export interface StatusSegmentItem {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: "text" | "image" | "audio";
  caption: string;
  bgColor: string;
  audioUrl: string;
  audioTitle: string;
  audioDurationMs: number;
  privacyType: StatusPrivacyType;
  groupId?: string | null;
  mentionedUserIds: string[];
  viewed: boolean;
  liked: boolean;
  viewCount: number;
  likeCount: number;
  createdAt: number;
  expiresAt: number;
}

export interface ContactStatusStack {
  userId: string;
  displayName: string;
  username: string;
  avatarColor: string;
  avatarUrl?: string | null;
  segments: StatusSegmentItem[];
  unreadCount: number;
  allViewed: boolean;
  latestAt: number;
}

interface PrivacyDefaultsState {
  privacyType: StatusPrivacyType;
  excludedIds: string[];
  includedIds: string[];
  groupId: string;
}

interface UpdatesBundlePayload {
  myStatus: {
    userId: string;
    displayName: string;
    username: string;
    avatarColor: string;
    avatarUrl?: string | null;
    segments: StatusSegmentItem[];
    latestAt: number;
  };
  contactStacks: ContactStatusStack[];
  groupExclusiveStacks: Record<string, ContactStatusStack[]>;
  privacyDefault: PrivacyDefaultsState;
}

interface CreateStatusResponse {
  ok: boolean;
  id: string;
  createdAt: number;
  expiresAt: number;
  segment?: StatusSegmentItem;
}

const STORY_SEGMENT_DURATION_MS = 5000;
const MAX_AUDIO_DURATION_MS = 30000;

const STATUS_BG_SWATCHES = [
  "#0f766e",
  "#7c3aed",
  "#1d4ed8",
  "#be185d",
  "#b45309",
  "#111827",
  "#047857",
  "#9333ea",
];

/**
 * The Status music library. Placeholder tones are gone: every entry is a real
 * audio file served from /sounds, and uploading your own clip is always there
 * as the third option.
 */
const BUILTIN_TRACKS = [
  { id: "none", title: "No Music", url: "", durationMs: 0 },
  {
    id: "melly_mike",
    title: "Melly Mike - Young Black & Rich",
    url: "/sounds/melly-mike-young-black-and-rich.mp3?v=1",
    durationMs: 24960,
  },
];

const QUICK_STORY_REACTIONS = ["❤️", "🔥", "😂", "😮", "😢", "👏"];

function formatStatusRelativeTime(ts: number): string {
  if (!ts) return "Just now";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return "Yesterday";
}

function measureAudioDurationMs(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const done = (ms: number) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    audio.onloadedmetadata = () => {
      const sec = Number.isFinite(audio.duration) ? audio.duration : 10;
      done(Math.round(sec * 1000));
    };
    audio.onerror = () => done(10000);
    audio.src = url;
  });
}

export function SegmentedStatusAvatar({
  user,
  size = 52,
  segments,
  showAddBadge = false,
  onClick,
}: {
  user: {
    displayName: string;
    username: string;
    avatarColor: string;
    avatarUrl?: string;
  };
  size?: number;
  segments: Array<{ viewed: boolean }>;
  showAddBadge?: boolean;
  onClick?: () => void;
}) {
  const outerSize = size + 10;
  const strokeWidth = 2.6;
  const radius = (outerSize - strokeWidth) / 2;
  const cx = outerSize / 2;
  const cy = outerSize / 2;
  const count = segments.length;

  const arcPaths = useMemo(() => {
    if (count <= 1) return [];
    const gapDeg = count <= 4 ? 8 : count <= 8 ? 6 : 4;
    const sweepDeg = Math.max(4, (360 - count * gapDeg) / count);
    const items: Array<{ d: string; viewed: boolean }> = [];
    for (let i = 0; i < count; i++) {
      const startDeg = -90 + i * (sweepDeg + gapDeg) + gapDeg / 2;
      const endDeg = startDeg + sweepDeg;
      const startRad = (startDeg * Math.PI) / 180;
      const endRad = (endDeg * Math.PI) / 180;
      const x1 = cx + radius * Math.cos(startRad);
      const y1 = cy + radius * Math.sin(startRad);
      const x2 = cx + radius * Math.cos(endRad);
      const y2 = cy + radius * Math.sin(endRad);
      const largeArc = sweepDeg > 180 ? 1 : 0;
      items.push({
        d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
        viewed: Boolean(segments[i]?.viewed),
      });
    }
    return items;
  }, [count, cx, cy, radius, segments]);

  return (
    <div
      className="jt-status-ring-wrap"
      style={{ width: outerSize, height: outerSize }}
      onClick={onClick}
    >
      {count > 0 && (
        <svg
          width={outerSize}
          height={outerSize}
          viewBox={`0 0 ${outerSize} ${outerSize}`}
          className="jt-status-ring-svg"
          aria-hidden="true"
        >
          {count === 1 ? (
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={segments[0]?.viewed ? "#8e8e93" : "#14d990"}
              strokeWidth={strokeWidth}
            />
          ) : (
            arcPaths.map((seg, idx) => (
              <path
                key={idx}
                d={seg.d}
                fill="none"
                stroke={seg.viewed ? "#8e8e93" : "#14d990"}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            ))
          )}
        </svg>
      )}
      <div className="jt-status-ring-avatar-inner">
        <Avatar user={user} size={size} />
      </div>
      {showAddBadge && (
        <span className="jt-status-my-plus-badge" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5v14M5 12h14"
              stroke="#ffffff"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
    </div>
  );
}

let cachedGroupExclusiveByGroup: Record<string, ContactStatusStack[]> = {};
const groupStatusListeners = new Set<() => void>();

export function getCachedGroupExclusiveStatuses(groupId: string): ContactStatusStack[] {
  return cachedGroupExclusiveByGroup[groupId] ?? [];
}

export function subscribeGroupExclusiveStatuses(fn: () => void): () => void {
  groupStatusListeners.add(fn);
  return () => {
    groupStatusListeners.delete(fn);
  };
}

export async function refreshUpdatesBundleGlobal(): Promise<UpdatesBundlePayload | null> {
  try {
    const bundle = await tursoRpc<UpdatesBundlePayload>("getUpdatesBundle", {});
    cachedGroupExclusiveByGroup = bundle.groupExclusiveStacks ?? {};
    for (const fn of groupStatusListeners) fn();
    return bundle;
  } catch {
    return null;
  }
}

export function UpdatesTabView({
  isIosChats = false,
  openComposerNonce = 0,
}: {
  isIosChats?: boolean;
  openComposerNonce?: number;
}) {
  const store = useJaText();
  const [bundle, setBundle] = useState<UpdatesBundlePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitialMode, setComposerInitialMode] = useState<"photo" | "text">("photo");
  const [privacySheetOpen, setPrivacySheetOpen] = useState(false);

  const [viewerStacks, setViewerStacks] = useState<ContactStatusStack[] | null>(null);
  const [viewerInitialIdx, setViewerInitialIdx] = useState(0);

  const prevNonceRef = useRef(openComposerNonce);
  useEffect(() => {
    if (openComposerNonce > prevNonceRef.current) {
      setComposerInitialMode("photo");
      setComposerOpen(true);
    }
    prevNonceRef.current = openComposerNonce;
  }, [openComposerNonce]);

  const loadBundle = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next = await tursoRpc<UpdatesBundlePayload>("getUpdatesBundle", {});
      setBundle(next);
      setLoadError(null);
      cachedGroupExclusiveByGroup = next.groupExclusiveStacks ?? {};
      for (const fn of groupStatusListeners) fn();
    } catch (err) {
      if (!silent) {
        setLoadError(err instanceof Error ? err.message : "Could not load updates.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBundle(false);
    const id = window.setInterval(() => {
      void loadBundle(true);
    }, 12000);
    return () => window.clearInterval(id);
  }, [loadBundle]);

  const me = store.me;
  const mySegments = bundle?.myStatus?.segments ?? [];
  const myStack: ContactStatusStack | null = useMemo(() => {
    if (!me || mySegments.length === 0) return null;
    return {
      userId: me.id,
      displayName: me.displayName,
      username: me.username,
      avatarColor: me.avatarColor,
      avatarUrl: me.avatarUrl,
      segments: mySegments,
      unreadCount: 0,
      allViewed: true,
      latestAt: mySegments[mySegments.length - 1]?.createdAt ?? Date.now(),
    };
  }, [me, mySegments]);

  const filteredContactStacks = useMemo(() => {
    const list = bundle?.contactStacks ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q),
    );
  }, [bundle?.contactStacks, searchQuery]);

  const recentStacks = useMemo(
    () => filteredContactStacks.filter((c) => !c.allViewed),
    [filteredContactStacks],
  );
  const viewedStacks = useMemo(
    () => filteredContactStacks.filter((c) => c.allViewed),
    [filteredContactStacks],
  );

  const openContactStory = (targetUserId: string) => {
    const ordered = [...recentStacks, ...viewedStacks];
    const idx = ordered.findIndex((c) => c.userId === targetUserId);
    if (idx >= 0) {
      setViewerStacks(ordered);
      setViewerInitialIdx(idx);
    }
  };

  const handleCreatedSegment = useCallback(
    (seg: StatusSegmentItem) => {
      setBundle((prev) => {
        const baseMe = prev?.myStatus ?? {
          userId: me?.id ?? seg.userId,
          displayName: me?.displayName ?? "Me",
          username: me?.username ?? "me",
          avatarColor: me?.avatarColor ?? "purple",
          avatarUrl: me?.avatarUrl ?? null,
          segments: [],
          latestAt: 0,
        };
        const exists = baseMe.segments.some((s) => s.id === seg.id);
        const nextSegs = exists ? baseMe.segments : [...baseMe.segments, seg];
        return {
          myStatus: {
            ...baseMe,
            segments: nextSegs,
            latestAt: seg.createdAt,
          },
          contactStacks: prev?.contactStacks ?? [],
          groupExclusiveStacks: prev?.groupExclusiveStacks ?? {},
          privacyDefault: prev?.privacyDefault ?? {
            privacyType: "MY_CONTACTS",
            excludedIds: [],
            includedIds: [],
            groupId: "",
          },
        };
      });
      void loadBundle(true);
    },
    [loadBundle, me],
  );

  if (!me) return null;

  return (
    <div className="jt-updates-root">
      <div className={isIosChats ? "ios-always-search-shell" : "desktop-always-search-shell"}>
        <span className="always-search-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.1" />
            <path d="M20 20l-3.8-3.8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="text"
          className="search-input always-search-input"
          placeholder="Search status updates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            className="always-search-clear-btn"
            aria-label="Clear search"
            onClick={() => setSearchQuery("")}
          >
            ×
          </button>
        )}
      </div>

      {/* Quick Actions Strip */}
      <div className="jt-updates-quick-bar">
        <button
          type="button"
          className="jt-updates-action-chip primary"
          onClick={() => {
            setComposerInitialMode("photo");
            setComposerOpen(true);
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.3-1.8A1.5 1.5 0 0 1 11 3.5h2a1.5 1.5 0 0 1 1.2.7L15.5 6h2A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-9Z"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span>Photo Status</span>
        </button>
        <button
          type="button"
          className="jt-updates-action-chip"
          onClick={() => {
            setComposerInitialMode("text");
            setComposerOpen(true);
          }}
        >
          <span style={{ fontWeight: 800 }}>Aa</span>
          <span>Text Status</span>
        </button>
        <button
          type="button"
          className="jt-updates-action-chip"
          onClick={() => setPrivacySheetOpen(true)}
          title="Status privacy"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span>Privacy</span>
        </button>
      </div>

      <div className="jt-updates-scroll">
        {loadError && (
          <div className="jt-updates-error-banner">
            <span>{loadError}</span>
            <button type="button" onClick={() => void loadBundle(false)}>
              Retry
            </button>
          </div>
        )}

        <div className="jt-updates-section">
          <div className="jt-updates-section-hdr">
            <h2>Status</h2>
          </div>

          {/* My Status Row */}
          <div className="jt-status-my-row-card">
            <button
              type="button"
              className="jt-status-row-main"
              onClick={() => {
                if (myStack) {
                  setViewerStacks([myStack]);
                  setViewerInitialIdx(0);
                } else {
                  setComposerInitialMode("photo");
                  setComposerOpen(true);
                }
              }}
            >
              <SegmentedStatusAvatar
                user={{
                  displayName: me.displayName,
                  username: me.username,
                  avatarColor: me.avatarColor,
                  avatarUrl: me.avatarUrl,
                }}
                size={50}
                segments={mySegments.map(() => ({ viewed: false }))}
                showAddBadge={mySegments.length === 0}
              />
              <div className="jt-status-row-copy">
                <strong>My Status</strong>
                <span>
                  {mySegments.length > 0
                    ? `${mySegments.length} active ${mySegments.length === 1 ? "post" : "posts"} · ${formatStatusRelativeTime(bundle?.myStatus?.latestAt ?? 0)}`
                    : "Tap to add a photo or text status"}
                </span>
              </div>
            </button>
            <button
              type="button"
              className="jt-status-add-more-btn"
              title="Add new status post"
              aria-label="Add new status post"
              onClick={() => {
                setComposerInitialMode("photo");
                setComposerOpen(true);
              }}
            >
              +
            </button>
          </div>

          {loading && !bundle && (
            <div className="jt-updates-empty-note">Loading status updates...</div>
          )}

          {recentStacks.length > 0 && (
            <>
              <div className="jt-status-sublabel">Recent updates</div>
              {recentStacks.map((st) => (
                <button
                  key={st.userId}
                  type="button"
                  className="jt-status-row"
                  onClick={() => openContactStory(st.userId)}
                >
                  <SegmentedStatusAvatar
                    user={{
                      displayName: st.displayName,
                      username: st.username,
                      avatarColor: st.avatarColor,
                      avatarUrl: st.avatarUrl ?? undefined,
                    }}
                    size={50}
                    segments={st.segments}
                  />
                  <div className="jt-status-row-copy">
                    <strong>
                      <IosEmojiText text={st.displayName} />
                    </strong>
                    <span>
                      {st.unreadCount > 0 ? `${st.unreadCount} new · ` : ""}
                      {formatStatusRelativeTime(st.latestAt)}
                    </span>
                  </div>
                </button>
              ))}
            </>
          )}

          {viewedStacks.length > 0 && (
            <>
              <div className="jt-status-sublabel">Viewed updates</div>
              {viewedStacks.map((st) => (
                <button
                  key={st.userId}
                  type="button"
                  className="jt-status-row"
                  onClick={() => openContactStory(st.userId)}
                >
                  <SegmentedStatusAvatar
                    user={{
                      displayName: st.displayName,
                      username: st.username,
                      avatarColor: st.avatarColor,
                      avatarUrl: st.avatarUrl ?? undefined,
                    }}
                    size={50}
                    segments={st.segments}
                  />
                  <div className="jt-status-row-copy">
                    <strong>
                      <IosEmojiText text={st.displayName} />
                    </strong>
                    <span>{formatStatusRelativeTime(st.latestAt)}</span>
                  </div>
                </button>
              ))}
            </>
          )}

          {!loading && recentStacks.length === 0 && viewedStacks.length === 0 && (
            <div className="jt-updates-empty-note">
              Status updates from your contacts disappear automatically after 24 hours.
            </div>
          )}
        </div>
      </div>

      {composerOpen && (
        <StatusComposerModal
          initialMode={composerInitialMode}
          privacyDefault={
            bundle?.privacyDefault ?? {
              privacyType: "MY_CONTACTS",
              excludedIds: [],
              includedIds: [],
              groupId: "",
            }
          }
          onClose={() => setComposerOpen(false)}
          onCreated={handleCreatedSegment}
        />
      )}

      {privacySheetOpen && (
        <StatusPrivacyDefaultModal
          current={
            bundle?.privacyDefault ?? {
              privacyType: "MY_CONTACTS",
              excludedIds: [],
              includedIds: [],
              groupId: "",
            }
          }
          onClose={() => setPrivacySheetOpen(false)}
          onSaved={() => {
            setPrivacySheetOpen(false);
            void loadBundle(true);
          }}
        />
      )}

      {viewerStacks && (
        <FullScreenStoryViewerModal
          stacks={viewerStacks}
          initialStackIndex={viewerInitialIdx}
          meId={me.id}
          onClose={() => {
            setViewerStacks(null);
            void loadBundle(true);
          }}
          onStatusMutated={() => void loadBundle(true)}
        />
      )}
    </div>
  );
}

function StatusComposerModal({
  initialMode,
  privacyDefault,
  onClose,
  onCreated,
}: {
  initialMode: "photo" | "text";
  privacyDefault: PrivacyDefaultsState;
  onClose: () => void;
  onCreated: (seg: StatusSegmentItem) => void;
}) {
  const store = useJaText();
  const [mode, setMode] = useState<"photo" | "text">(initialMode);
  const [caption, setCaption] = useState("");
  const [bgColor, setBgColor] = useState(STATUS_BG_SWATCHES[0]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [selectedBuiltinTrack, setSelectedBuiltinTrack] = useState("none");
  const [privacyType, setPrivacyType] = useState<StatusPrivacyType>(
    privacyDefault.privacyType || "MY_CONTACTS",
  );
  const [excludedIds, setExcludedIds] = useState<string[]>(privacyDefault.excludedIds ?? []);
  const [includedIds, setIncludedIds] = useState<string[]>(privacyDefault.includedIds ?? []);
  const [groupId, setGroupId] = useState<string>(privacyDefault.groupId ?? "");
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const regularGroups = useMemo(
    () => store.groups.filter((g) => !g.isCommunity),
    [store.groups],
  );

  const handleImagePick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(f);
    setImagePreviewUrl(URL.createObjectURL(f));
    setMode("photo");
    setError(null);
  };

  const handleAudioPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const dur = await measureAudioDurationMs(f);
    if (dur > MAX_AUDIO_DURATION_MS) {
      setError("Audio clips on Status must be 30 seconds or shorter.");
      e.target.value = "";
      return;
    }
    setError(null);
    setAudioFile(f);
    setAudioDurationMs(Math.min(MAX_AUDIO_DURATION_MS, Math.max(1000, dur)));
    setSelectedBuiltinTrack("none");
  };

  const handlePublish = async () => {
    setError(null);
    if (mode === "photo" && !imageFile && !caption.trim()) {
      setError("Choose a photo from your device or switch to Text Status.");
      return;
    }
    if (mode === "text" && !caption.trim() && !audioFile && selectedBuiltinTrack === "none") {
      setError("Type a status message first.");
      return;
    }
    if (privacyType === "GROUP_EXCLUSIVE" && !groupId) {
      setError("Select which group can view this Group Exclusive status.");
      return;
    }

    setSubmitting(true);
    try {
      let mediaUrl = "";
      let mediaType: "text" | "image" | "audio" = "text";
      if (imageFile) {
        mediaUrl = await uploadMediaToTurso(imageFile);
        mediaType = "image";
      }

      let audioUrl = "";
      let audioTitle = "";
      let finalAudioDur = 0;
      if (audioFile) {
        audioUrl = await uploadMediaToTurso(audioFile);
        audioTitle = audioFile.name.replace(/\.[^.]+$/, "").slice(0, 60);
        finalAudioDur = audioDurationMs;
        if (!mediaUrl) mediaType = "audio";
      } else if (selectedBuiltinTrack !== "none") {
        const track = BUILTIN_TRACKS.find((t) => t.id === selectedBuiltinTrack);
        if (track?.url) {
          audioUrl = track.url;
          audioTitle = track.title;
          finalAudioDur = track.durationMs;
        }
      }

      const res = await tursoRpc<CreateStatusResponse>("createStatusPost", {
        mediaUrl,
        mediaType,
        caption: caption.trim(),
        bgColor,
        audioUrl,
        audioTitle,
        audioDurationMs: finalAudioDur,
        privacyType,
        excludedUserIds: privacyType === "CONTACTS_EXCEPT" ? excludedIds : [],
        includedUserIds: privacyType === "ONLY_SHARE_WITH" ? includedIds : [],
        groupId: privacyType === "GROUP_EXCLUSIVE" ? groupId : null,
        mentionedUserIds: mentionedIds,
      });

      const now = Date.now();
      const createdSeg: StatusSegmentItem = res.segment ?? {
        id: res.id || `local_${now}`,
        userId: store.me?.id ?? "",
        mediaUrl,
        mediaType,
        caption: caption.trim(),
        bgColor,
        audioUrl,
        audioTitle,
        audioDurationMs: finalAudioDur,
        privacyType,
        groupId: privacyType === "GROUP_EXCLUSIVE" ? groupId : null,
        mentionedUserIds: mentionedIds,
        viewed: true,
        liked: false,
        viewCount: 0,
        likeCount: 0,
        createdAt: res.createdAt || now,
        expiresAt: res.expiresAt || now + 24 * 60 * 60 * 1000,
      };

      onCreated(createdSeg);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish status.");
    } finally {
      setSubmitting(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="jt-upd-modal-backdrop" onClick={onClose}>
      <div className="jt-upd-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="jt-upd-modal-hdr">
          <h3>New Status Update</h3>
          <button type="button" className="jt-upd-close-x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="jt-upd-source-tabs">
          <button
            type="button"
            className={mode === "photo" ? "is-active" : ""}
            onClick={() => setMode("photo")}
          >
            Photo / Camera Roll
          </button>
          <button
            type="button"
            className={mode === "text" ? "is-active" : ""}
            onClick={() => {
              setMode("text");
              if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
              setImageFile(null);
              setImagePreviewUrl(null);
            }}
          >
            Text Status
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImagePick}
        />

        {mode === "photo" ? (
          <div className="jt-upd-photo-picker-stage">
            {imagePreviewUrl ? (
              <div className="jt-upd-photo-preview-box">
                <img src={imagePreviewUrl} alt="Selected status preview" />
                <div className="jt-upd-photo-preview-actions">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change photo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(imagePreviewUrl);
                      setImageFile(null);
                      setImagePreviewUrl(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="jt-upd-file-pick-box"
                onClick={() => fileInputRef.current?.click()}
              >
                <strong>Choose Photo from Camera Roll</strong>
                <span>PNG, JPG, WebP · Disappears after 24 hours</span>
              </button>
            )}
            <input
              type="text"
              className="jt-upd-caption-line-input"
              placeholder="Add a caption (optional)..."
              value={caption}
              maxLength={700}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div
              className="jt-upd-composer-preview"
              style={{ background: bgColor }}
            >
              <textarea
                placeholder="Type what is on your mind..."
                value={caption}
                maxLength={700}
                onChange={(e) => setCaption(e.target.value)}
              />
            </div>
            <div className="jt-upd-swatch-row">
              {STATUS_BG_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={`jt-upd-swatch ${bgColor === hex ? "is-active" : ""}`}
                  style={{ background: hex }}
                  onClick={() => setBgColor(hex)}
                  aria-label={`Background ${hex}`}
                />
              ))}
            </div>
          </>
        )}

        <div className="jt-upd-field-group">
          <label>Music / Audio (optional, max 30s)</label>
          <div className="jt-upd-track-pills">
            {BUILTIN_TRACKS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={
                  !audioFile && selectedBuiltinTrack === t.id ? "is-active" : ""
                }
                onClick={() => {
                  setAudioFile(null);
                  setSelectedBuiltinTrack(t.id);
                }}
              >
                {t.title}
              </button>
            ))}
            <label className="jt-upd-audio-upload-pill">
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => void handleAudioPick(e)}
                style={{ display: "none" }}
              />
              <span className="jt-upd-audio-upload-label">
                {audioFile ? <IosMusicNoteIcon size={14} /> : null}
                {audioFile
                  ? audioFile.name.slice(0, 18) + ` (${Math.round(audioDurationMs / 1000)}s)`
                  : "Upload Audio"}
              </span>
            </label>
          </div>
        </div>

        {store.friends.length > 0 && (
          <div className="jt-upd-field-group">
            <label>Mention friends (optional)</label>
            <div className="jt-upd-mention-chips">
              {store.friends.map((fr) => {
                const active = mentionedIds.includes(fr.id);
                return (
                  <button
                    key={fr.id}
                    type="button"
                    className={active ? "is-active" : ""}
                    onClick={() =>
                      setMentionedIds((prev) =>
                        prev.includes(fr.id)
                          ? prev.filter((x) => x !== fr.id)
                          : [...prev, fr.id],
                      )
                    }
                  >
                    @{fr.username}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="jt-upd-field-group">
          <label>Who can see this status</label>
          <select
            value={privacyType}
            onChange={(e) => setPrivacyType(e.target.value as StatusPrivacyType)}
            className="jt-upd-select"
          >
            <option value="MY_CONTACTS">My Contacts</option>
            <option value="CONTACTS_EXCEPT">My Contacts Except...</option>
            <option value="ONLY_SHARE_WITH">Only Share With...</option>
            <option value="GROUP_EXCLUSIVE">Group Exclusive</option>
          </select>

          {privacyType === "CONTACTS_EXCEPT" && store.friends.length > 0 && (
            <div className="jt-upd-mention-chips">
              {store.friends.map((fr) => {
                const excluded = excludedIds.includes(fr.id);
                return (
                  <button
                    key={fr.id}
                    type="button"
                    className={excluded ? "is-danger" : ""}
                    onClick={() =>
                      setExcludedIds((prev) =>
                        prev.includes(fr.id)
                          ? prev.filter((x) => x !== fr.id)
                          : [...prev, fr.id],
                      )
                    }
                  >
                    Hide from {fr.displayName}
                  </button>
                );
              })}
            </div>
          )}

          {privacyType === "ONLY_SHARE_WITH" && store.friends.length > 0 && (
            <div className="jt-upd-mention-chips">
              {store.friends.map((fr) => {
                const inc = includedIds.includes(fr.id);
                return (
                  <button
                    key={fr.id}
                    type="button"
                    className={inc ? "is-active" : ""}
                    onClick={() =>
                      setIncludedIds((prev) =>
                        prev.includes(fr.id)
                          ? prev.filter((x) => x !== fr.id)
                          : [...prev, fr.id],
                      )
                    }
                  >
                    {fr.displayName}
                  </button>
                );
              })}
            </div>
          )}

          {privacyType === "GROUP_EXCLUSIVE" && (
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="jt-upd-select"
            >
              <option value="">Select group...</option>
              {regularGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <div className="jt-upd-error">{error}</div>}

        <div className="jt-upd-modal-footer">
          <button type="button" className="jt-upd-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="jt-upd-btn-primary"
            disabled={submitting}
            onClick={() => void handlePublish()}
          >
            {submitting ? "Posting..." : "Post Status"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatusPrivacyDefaultModal({
  current,
  onClose,
  onSaved,
}: {
  current: PrivacyDefaultsState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const store = useJaText();
  const [privacyType, setPrivacyType] = useState<StatusPrivacyType>(
    current.privacyType || "MY_CONTACTS",
  );
  const [excludedIds, setExcludedIds] = useState<string[]>(current.excludedIds ?? []);
  const [includedIds, setIncludedIds] = useState<string[]>(current.includedIds ?? []);
  const [groupId, setGroupId] = useState<string>(current.groupId ?? "");
  const [saving, setSaving] = useState(false);

  const regularGroups = store.groups.filter((g) => !g.isCommunity);

  const save = async () => {
    setSaving(true);
    try {
      await tursoRpc("saveStatusPrivacyDefault", {
        privacyType,
        excludedIds,
        includedIds,
        groupId,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="jt-upd-modal-backdrop" onClick={onClose}>
      <div className="jt-upd-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="jt-upd-modal-hdr">
          <h3>Default Status Privacy</h3>
          <button type="button" className="jt-upd-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="jt-upd-modal-sub">
          Changes apply to future status posts. Active status posts keep the privacy chosen when they were posted.
        </p>

        <div className="jt-upd-field-group">
          <select
            value={privacyType}
            onChange={(e) => setPrivacyType(e.target.value as StatusPrivacyType)}
            className="jt-upd-select"
          >
            <option value="MY_CONTACTS">My Contacts</option>
            <option value="CONTACTS_EXCEPT">My Contacts Except...</option>
            <option value="ONLY_SHARE_WITH">Only Share With...</option>
            <option value="GROUP_EXCLUSIVE">Group Exclusive</option>
          </select>

          {privacyType === "CONTACTS_EXCEPT" && store.friends.length > 0 && (
            <div className="jt-upd-mention-chips">
              {store.friends.map((fr) => {
                const ex = excludedIds.includes(fr.id);
                return (
                  <button
                    key={fr.id}
                    type="button"
                    className={ex ? "is-danger" : ""}
                    onClick={() =>
                      setExcludedIds((prev) =>
                        prev.includes(fr.id)
                          ? prev.filter((x) => x !== fr.id)
                          : [...prev, fr.id],
                      )
                    }
                  >
                    Hide: {fr.displayName}
                  </button>
                );
              })}
            </div>
          )}

          {privacyType === "ONLY_SHARE_WITH" && store.friends.length > 0 && (
            <div className="jt-upd-mention-chips">
              {store.friends.map((fr) => {
                const inc = includedIds.includes(fr.id);
                return (
                  <button
                    key={fr.id}
                    type="button"
                    className={inc ? "is-active" : ""}
                    onClick={() =>
                      setIncludedIds((prev) =>
                        prev.includes(fr.id)
                          ? prev.filter((x) => x !== fr.id)
                          : [...prev, fr.id],
                      )
                    }
                  >
                    {fr.displayName}
                  </button>
                );
              })}
            </div>
          )}

          {privacyType === "GROUP_EXCLUSIVE" && (
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="jt-upd-select"
            >
              <option value="">Select group...</option>
              {regularGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="jt-upd-modal-footer">
          <button type="button" className="jt-upd-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="jt-upd-btn-primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving..." : "Save Default"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function FullScreenStoryViewerModal({
  stacks: initialStacks,
  initialStackIndex,
  meId,
  onClose,
  onStatusMutated,
}: {
  stacks: ContactStatusStack[];
  initialStackIndex: number;
  meId: string;
  onClose: () => void;
  onStatusMutated: () => void;
}) {
  const store = useJaText();
  const [stacks, setStacks] = useState<ContactStatusStack[]>(initialStacks);
  const [stackIdx, setStackIdx] = useState(initialStackIndex);
  const [segIdx, setSegIdx] = useState(() => {
    const first = initialStacks[initialStackIndex];
    if (!first) return 0;
    const unread = first.segments.findIndex((s) => !s.viewed);
    return unread >= 0 ? unread : 0;
  });

  const [elapsedMs, setElapsedMs] = useState(0);
  const [isHoldPaused, setIsHoldPaused] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySentBanner, setReplySentBanner] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isClosing, setIsClosing] = useState(false);

  const lastTickRef = useRef<number>(performance.now());
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    downAt: number;
    holdTimer: number | null;
    wasHold: boolean;
  } | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const currentStack = stacks[stackIdx];
  const currentSeg = currentStack?.segments[segIdx];
  const isOwnStory = currentStack?.userId === meId;
  const effectivePaused = isHoldPaused || replyOpen || isClosing;
  /**
   * True for the moment between "story is on screen" and "audio actually started".
   * The progress bar waits for it so the music never begins half a story late.
   */
  const [audioStarting, setAudioStarting] = useState(false);
  const audioStartTimerRef = useRef<number | null>(null);
  const progressPaused = effectivePaused || audioStarting;

  const triggerSmoothDismiss = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
    }, 220);
  }, [isClosing, onClose]);

  useEffect(() => {
    if (!currentSeg || isOwnStory) return;
    if (!currentSeg.viewed) {
      setStacks((prev) =>
        prev.map((st, idx) => {
          if (idx !== stackIdx) return st;
          const nextSegs = st.segments.map((sg, j) =>
            j === segIdx ? { ...sg, viewed: true } : sg,
          );
          return {
            ...st,
            segments: nextSegs,
            allViewed: nextSegs.every((x) => x.viewed),
            unreadCount: nextSegs.filter((x) => !x.viewed).length,
          };
        }),
      );
      void tursoRpc("markStatusViewed", { statusIds: [currentSeg.id] }).then(() =>
        onStatusMutated(),
      );
    }
  }, [currentSeg, isOwnStory, onStatusMutated, segIdx, stackIdx]);

  const advanceNext = useCallback(() => {
    if (!currentStack) {
      triggerSmoothDismiss();
      return;
    }
    if (segIdx + 1 < currentStack.segments.length) {
      setSegIdx(segIdx + 1);
      setElapsedMs(0);
      return;
    }
    if (stackIdx + 1 < stacks.length) {
      const nextIndex = stackIdx + 1;
      const nextStack = stacks[nextIndex];
      const firstUnread = nextStack.segments.findIndex((s) => !s.viewed);
      setStackIdx(nextIndex);
      setSegIdx(firstUnread >= 0 ? firstUnread : 0);
      setElapsedMs(0);
      return;
    }
    triggerSmoothDismiss();
  }, [currentStack, segIdx, stackIdx, stacks, triggerSmoothDismiss]);

  const goPrevious = useCallback(() => {
    if (segIdx > 0) {
      setSegIdx(segIdx - 1);
      setElapsedMs(0);
      return;
    }
    if (stackIdx > 0) {
      const prevIdx = stackIdx - 1;
      const prevStack = stacks[prevIdx];
      setStackIdx(prevIdx);
      setSegIdx(Math.max(0, prevStack.segments.length - 1));
      setElapsedMs(0);
    } else {
      setElapsedMs(0);
    }
  }, [segIdx, stackIdx, stacks]);

  useEffect(() => {
    lastTickRef.current = performance.now();
    let rafId = 0;
    const step = (now: number) => {
      const dt = Math.min(100, Math.max(0, now - lastTickRef.current));
      lastTickRef.current = now;
      if (!progressPaused) {
        setElapsedMs((prev) => {
          const next = prev + dt;
          if (next >= STORY_SEGMENT_DURATION_MS) {
            window.setTimeout(() => advanceNext(), 0);
            return STORY_SEGMENT_DURATION_MS;
          }
          return next;
        });
      }
      rafId = window.requestAnimationFrame(step);
    };
    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [advanceNext, progressPaused]);

  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    if (!currentSeg?.audioUrl) return;

    if (currentSeg.audioUrl.startsWith("builtin:")) {
      // Legacy placeholder tone from before the real music library existed.
      // There is no oscillator to play any more, those old posts are silent.
      return;
    }

    const audio = new Audio(resolveTursoMediaUrl(currentSeg.audioUrl));
    audio.volume = 0.7;
    // "auto" is the default for new Audio(), but being explicit keeps the clip
    // buffering from the moment the story opens instead of after play() is called.
    audio.preload = "auto";
    audioElRef.current = audio;

    setAudioStarting(true);
    const markAudioReady = () => {
      setAudioStarting(false);
      if (audioStartTimerRef.current !== null) {
        window.clearTimeout(audioStartTimerRef.current);
        audioStartTimerRef.current = null;
      }
    };
    // Safety net: never hold the story hostage to a slow or blocked stream.
    audioStartTimerRef.current = window.setTimeout(markAudioReady, 1500);
    audio.addEventListener("playing", markAudioReady);
    audio.addEventListener("error", markAudioReady);
    void audio.play().catch(() => markAudioReady());

    const capTimer = window.setTimeout(() => {
      audio.pause();
    }, MAX_AUDIO_DURATION_MS);
    return () => {
      window.clearTimeout(capTimer);
      if (audioStartTimerRef.current !== null) {
        window.clearTimeout(audioStartTimerRef.current);
        audioStartTimerRef.current = null;
      }
      audio.removeEventListener("playing", markAudioReady);
      audio.removeEventListener("error", markAudioReady);
      setAudioStarting(false);
      audio.pause();
    };
  }, [currentSeg?.audioUrl, currentSeg?.id]);

  useEffect(() => {
    const a = audioElRef.current;
    if (!a) return;
    if (effectivePaused) a.pause();
    else void a.play().catch(() => undefined);
  }, [effectivePaused]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (replyOpen) return;
    const holdTimer = window.setTimeout(() => {
      if (gestureRef.current) {
        gestureRef.current.wasHold = true;
        setIsHoldPaused(true);
      }
    }, 185);
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      downAt: performance.now(),
      holdTimer,
      wasHold: false,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dy = e.clientY - g.startY;
    const dx = e.clientX - g.startX;
    if (Math.abs(dy) > 14 || Math.abs(dx) > 14) {
      if (g.holdTimer !== null) {
        window.clearTimeout(g.holdTimer);
        g.holdTimer = null;
      }
    }
    if (dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      setDragOffsetY(Math.min(240, dy));
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    if (g.holdTimer !== null) window.clearTimeout(g.holdTimer);

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    setDragOffsetY(0);

    if (g.wasHold) {
      setIsHoldPaused(false);
      return;
    }

    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
      triggerSmoothDismiss();
      return;
    }

    if (dy < -75 && Math.abs(dy) > Math.abs(dx) && !isOwnStory) {
      setReplyOpen(true);
      return;
    }

    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && stackIdx + 1 < stacks.length) {
        setStackIdx(stackIdx + 1);
        setSegIdx(0);
        setElapsedMs(0);
      } else if (dx > 0 && stackIdx > 0) {
        setStackIdx(stackIdx - 1);
        setSegIdx(0);
        setElapsedMs(0);
      }
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    if (relX <= 0.3) {
      goPrevious();
    } else {
      advanceNext();
    }
  };

  const handleToggleHeart = async () => {
    if (!currentSeg || isOwnStory) return;
    const nextLiked = !currentSeg.liked;
    setStacks((prev) =>
      prev.map((st, idx) =>
        idx !== stackIdx
          ? st
          : {
              ...st,
              segments: st.segments.map((sg, j) =>
                j === segIdx ? { ...sg, liked: nextLiked } : sg,
              ),
            },
      ),
    );
    await tursoRpc("toggleStatusLike", { statusId: currentSeg.id, liked: nextLiked });
    onStatusMutated();
  };

  const sendDirectStoryReply = async (textToSend: string) => {
    if (!currentStack || !currentSeg || !textToSend.trim()) return;
    const prefix = currentSeg.caption
      ? `[Replied to Status: "${currentSeg.caption.slice(0, 48)}"]\n`
      : "[Replied to your Status]\n";
    await store.sendMessage(currentStack.userId, `${prefix}${textToSend.trim()}`);
    setReplyText("");
    setReplyOpen(false);
    setReplySentBanner("Sent reply");
    window.setTimeout(() => setReplySentBanner(null), 1600);
  };

  const handleDeleteOwnSegment = async () => {
    if (!currentSeg || !isOwnStory) return;
    await tursoRpc("deleteStatusPost", { statusId: currentSeg.id });
    onStatusMutated();
    if (currentStack.segments.length <= 1) {
      triggerSmoothDismiss();
    } else {
      setStacks((prev) =>
        prev.map((st, idx) =>
          idx !== stackIdx
            ? st
            : {
                ...st,
                segments: st.segments.filter((s) => s.id !== currentSeg.id),
              },
        ),
      );
      setSegIdx((prev) => Math.max(0, prev - 1));
      setElapsedMs(0);
    }
  };

  if (typeof document === "undefined" || !currentStack || !currentSeg) {
    return null;
  }

  const mentionedMe = Boolean(currentSeg.mentionedUserIds?.includes(meId));

  return createPortal(
    <div
      className={`jt-story-viewer-overlay ${isClosing ? "is-closing" : ""}`}
      style={{
        opacity: dragOffsetY > 0 ? Math.max(0.35, 1 - dragOffsetY / 340) : undefined,
      }}
    >
      <div
        className="jt-story-viewer-frame"
        style={{
          transform:
            dragOffsetY > 0
              ? `translate3d(0, ${dragOffsetY}px, 0) scale(${Math.max(0.9, 1 - dragOffsetY / 1400)})`
              : undefined,
        }}
      >
        <div className={`jt-story-chrome-top ${isHoldPaused ? "is-hidden" : ""}`}>
          <div className="jt-story-progress-row">
            {currentStack.segments.map((seg, idx) => {
              const pct =
                idx < segIdx
                  ? 100
                  : idx > segIdx
                    ? 0
                    : Math.min(100, (elapsedMs / STORY_SEGMENT_DURATION_MS) * 100);
              return (
                <div key={seg.id} className="jt-story-progress-track">
                  <div className="jt-story-progress-fill" style={{ width: `${pct}%` }} />
                </div>
              );
            })}
          </div>

          <div className="jt-story-author-bar">
            <div className="jt-story-author-left">
              <Avatar
                user={{
                  displayName: currentStack.displayName,
                  username: currentStack.username,
                  avatarColor: currentStack.avatarColor,
                  avatarUrl: currentStack.avatarUrl ?? undefined,
                }}
                size={36}
              />
              <div>
                <strong>
                  {isOwnStory ? "My Status" : <IosEmojiText text={currentStack.displayName} />}
                </strong>
                <span>
                  {formatStatusRelativeTime(currentSeg.createdAt)}
                  {currentSeg.audioTitle ? (
                    <>
                      {" · "}
                      <IosMusicNoteIcon size={13} /> {currentSeg.audioTitle}
                    </>
                  ) : (
                    ""
                  )}
                </span>
              </div>
            </div>

            <div className="jt-story-top-actions">
              {isOwnStory && (
                <button
                  type="button"
                  className="jt-story-icon-btn danger"
                  title="Delete this status"
                  onClick={() => void handleDeleteOwnSegment()}
                >
                  <IosTrashIcon size={17} />
                </button>
              )}
              <button
                type="button"
                className="jt-story-icon-btn"
                aria-label="Close story viewer"
                onClick={triggerSmoothDismiss}
              >
                <IosCloseIcon size={18} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        </div>

        <div
          className="jt-story-stage"
          style={{
            background:
              currentSeg.mediaType === "image"
                ? "#05070b"
                : currentSeg.bgColor || "#0f766e",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {currentSeg.mediaUrl ? (
            <>
              <img
                src={resolveTursoMediaUrl(currentSeg.mediaUrl)}
                alt=""
                className="jt-story-media-img"
                draggable={false}
              />
              {currentSeg.caption && !isHoldPaused && (
                <div className="jt-story-image-caption">
                  <IosEmojiText text={currentSeg.caption} />
                </div>
              )}
            </>
          ) : (
            <div className="jt-story-text-canvas">
              <p>
                <IosEmojiText text={currentSeg.caption || "Audio Status"} />
              </p>
            </div>
          )}

          {mentionedMe && !isHoldPaused && (
            <div className="jt-story-mention-pill">Mentioned you</div>
          )}
          {replySentBanner && (
            <div className="jt-story-sent-toast">{replySentBanner}</div>
          )}
        </div>

        <div className={`jt-story-chrome-bottom ${isHoldPaused ? "is-hidden" : ""}`}>
          {isOwnStory ? (
            <div className="jt-story-own-metrics">
              <span className="jt-story-metric">
                <IosEyeIcon size={15} />
                {currentSeg.viewCount} views
              </span>
              <span className="jt-story-metric">
                <IosHeartIcon size={15} />
                {currentSeg.likeCount} likes
              </span>
            </div>
          ) : replyOpen ? (
            <div className="jt-story-reply-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="jt-story-quick-emojis">
                {QUICK_STORY_REACTIONS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => void sendDirectStoryReply(em)}
                  >
                    <ReactionGlyph emoji={em} size={22} />
                  </button>
                ))}
              </div>
              <div className="jt-story-reply-input-row">
                <input
                  type="text"
                  autoFocus
                  placeholder={`Reply to ${currentStack.displayName}...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void sendDirectStoryReply(replyText);
                    if (e.key === "Escape") setReplyOpen(false);
                  }}
                />
                <button
                  type="button"
                  disabled={!replyText.trim()}
                  onClick={() => void sendDirectStoryReply(replyText)}
                >
                  Send
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setReplyOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="jt-story-bottom-bar">
              <button
                type="button"
                className="jt-story-reply-pill"
                onClick={() => setReplyOpen(true)}
              >
                Reply to {currentStack.displayName.split(" ")[0]}...
              </button>
              <button
                type="button"
                className={`jt-story-heart-btn ${currentSeg.liked ? "is-liked" : ""}`}
                aria-label={currentSeg.liked ? "Unlike status" : "Like status"}
                onClick={() => void handleToggleHeart()}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill={currentSeg.liked ? "#ef4444" : "none"}>
                  <path
                    d="M12 20.5s-7-4.4-9.2-8.7C1.1 8.4 3.2 4.5 7 4.5c2.1 0 3.7 1.1 5 2.8 1.3-1.7 2.9-2.8 5-2.8 3.8 0 5.9 3.9 4.2 7.3-2.2 4.3-9.2 8.7-9.2 8.7Z"
                    stroke={currentSeg.liked ? "#ef4444" : "#ffffff"}
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
