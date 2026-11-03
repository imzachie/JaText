import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Avatar } from "./Avatar";
import { IosEmojiText } from "./IosEmoji";
import { AVATAR_COLORS } from "../lib/colors";
import { encodeForwardedBody } from "../lib/forwardedContext";
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
  mediaSource: "camera_roll" | "instagram" | "facebook";
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
  avatarUrl?: string;
  segments: StatusSegmentItem[];
  unreadCount: number;
  allViewed: boolean;
  latestAt: number;
}

export interface BroadcastChannelSummary {
  id: string;
  name: string;
  handle: string;
  description: string;
  avatarColor: string;
  avatarUrl?: string;
  verified: boolean;
  category: string;
  isPremium: boolean;
  monthlyPriceLabel: string;
  followerCount: number;
  postCount: number;
  latestSnippet: string;
  latestMediaType: string;
  latestPostAt: number;
  createdAt: number;
  followed: boolean;
  unreadCount: number;
  isOwner: boolean;
}

export interface ChannelBroadcastPost {
  id: string;
  channelId: string;
  body: string;
  mediaUrl: string;
  mediaType: string;
  reactions: Array<{ emoji: string; count: number }>;
  myEmoji: string;
  createdAt: number;
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
    avatarUrl?: string;
    segments: StatusSegmentItem[];
    latestAt: number;
  };
  contactStacks: ContactStatusStack[];
  groupExclusiveStacks: Record<string, ContactStatusStack[]>;
  privacyDefault: PrivacyDefaultsState;
  followedChannels: BroadcastChannelSummary[];
  followedChannelsCount: number;
  directoryChannels: BroadcastChannelSummary[];
}

const STORY_SEGMENT_DURATION_MS = 5000;
const MAX_AUDIO_DURATION_MS = 30000;

const STORY_BG_SWATCHES = [
  "#0f766e",
  "#7c3aed",
  "#1d4ed8",
  "#be185d",
  "#b45309",
  "#111827",
  "#047857",
  "#9333ea",
];

const CURATED_SOCIAL_MEDIA_CARDS: Record<
  "instagram" | "facebook",
  Array<{ id: string; title: string; subtitle: string; gradient: string; caption: string }>
> = {
  instagram: [
    {
      id: "ig-reel-1",
      title: "Golden Hour Story",
      subtitle: "Instagram Stories · Import",
      gradient: "linear-gradient(135deg, #f58529 0%, #dd2a7b 52%, #8134af 100%)",
      caption: "Golden hour moments shared from Instagram ✨",
    },
    {
      id: "ig-reel-2",
      title: "Late Night Vibes",
      subtitle: "Instagram Close Friends · Import",
      gradient: "linear-gradient(135deg, #1f1c2c 0%, #928dab 100%)",
      caption: "Late night studio session 🎧",
    },
  ],
  facebook: [
    {
      id: "fb-story-1",
      title: "Weekend Recap",
      subtitle: "Facebook Stories · Import",
      gradient: "linear-gradient(135deg, #0866ff 0%, #00c6ff 100%)",
      caption: "Weekend highlights with the crew 🌟",
    },
    {
      id: "fb-story-2",
      title: "Travel Snapshot",
      subtitle: "Facebook Memories · Import",
      gradient: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)",
      caption: "Throwback coastal drive 🌊",
    },
  ],
};

const BUILTIN_AUDIO_TRACKS = [
  { id: "none", title: "No music", durationMs: 0 },
  { id: "synth-sunrise", title: "Sunrise Drift · 18s", durationMs: 18000 },
  { id: "synth-lofi", title: "Midnight Lo-Fi Loop · 25s", durationMs: 25000 },
  { id: "synth-pulse", title: "Neon Pulse Beat · 30s", durationMs: 30000 },
];

const QUICK_STORY_EMOJIS = ["❤️", "🔥", "😂", "😮", "😢", "👏", "💯", "🎉"];
const CHANNEL_REACTION_EMOJIS = ["❤️", "🔥", "👍", "🎉", "😮", "🚀"];

const SPONSORED_INTERSTITIALS = [
  {
    id: "ad-jatext-pro-audio",
    sponsor: "JaText Studio",
    headline: "Crystal-Clear Spatial Voice Notes",
    body: "Share 30-second high-definition status clips and lossless group broadcasts across every linked device.",
    cta: "Explore Audio Tools",
    gradient: "linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0f766e 100%)",
  },
  {
    id: "ad-creator-channels",
    sponsor: "JaText Channels VIP",
    headline: "Launch Your Verified Broadcast Channel",
    body: "Reach unlimited followers with zero identity exposure and 30-day automatic feed housekeeping.",
    cta: "Learn About Channels",
    gradient: "linear-gradient(145deg, #111827 0%, #3b0764 55%, #be185d 100%)",
  },
];

function formatRelativeStatusTime(ts: number): string {
  if (!ts) return "Just now";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return sameDay ? `Today, ${timeStr}` : `Yesterday, ${timeStr}`;
  }
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatChannelTimestamp(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatFollowerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M followers`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K followers`;
  return `${count} follower${count === 1 ? "" : "s"}`;
}

function VerifiedBadgeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="jt-upd-verified-icon"
      aria-label="Verified channel"
    >
      <circle cx="12" cy="12" r="10" fill="#10b981" />
      <path
        d="M8.2 12.3l2.4 2.4 5.3-5.4"
        stroke="#ffffff"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Segmented Status Ring Avatar:
 * Splits 360 deg into N equal SVG arcs separated by crisp micro-gaps.
 * Unread segments render bright high-contrast teal-green (#25D366 / #14B8A6);
 * read segments render muted gray (#8E8E93).
 */
export function SegmentedStatusAvatar({
  user,
  size = 54,
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
  requestedChannelJump,
}: {
  requestedChannelJump?: { channelId: string; nonce: number } | null;
}) {
  const store = useJaText();
  const [bundle, setBundle] = useState<UpdatesBundlePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [directoryCategory, setDirectoryCategory] = useState<
    "Most Active" | "Popular" | "New"
  >("Most Active");

  // Modals / Drawers
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitialMode, setComposerInitialMode] = useState<"camera" | "text">("camera");
  const [privacySheetOpen, setPrivacySheetOpen] = useState(false);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState<BroadcastChannelSummary | null>(null);
  const [vipPreviewChannel, setVipPreviewChannel] = useState<BroadcastChannelSummary | null>(null);

  // Story Viewer state
  const [viewerStacks, setViewerStacks] = useState<ContactStatusStack[] | null>(null);
  const [viewerStackIndex, setViewerStackIndex] = useState(0);

  const loadBundle = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await refreshUpdatesBundleGlobal();
    if (data) {
      setBundle(data);
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    void loadBundle(false);
    const interval = window.setInterval(() => {
      void loadBundle(true);
    }, 12_000);
    return () => window.clearInterval(interval);
  }, [loadBundle]);

  useEffect(() => {
    if (!requestedChannelJump?.channelId || !bundle) return;
    const found =
      bundle.followedChannels.find((c) => c.id === requestedChannelJump.channelId) ??
      bundle.directoryChannels.find((c) => c.id === requestedChannelJump.channelId);
    if (found) {
      setActiveChannel(found);
    }
  }, [bundle, requestedChannelJump]);

  const myStack: ContactStatusStack | null = useMemo(() => {
    if (!bundle?.myStatus) {
      if (!store.me) return null;
      return {
        userId: store.me.id,
        displayName: store.me.displayName,
        username: store.me.username,
        avatarColor: store.me.avatarColor,
        avatarUrl: store.me.avatarUrl,
        segments: [],
        unreadCount: 0,
        allViewed: true,
        latestAt: 0,
      };
    }
    const segs = bundle.myStatus.segments ?? [];
    return {
      userId: bundle.myStatus.userId,
      displayName: bundle.myStatus.displayName,
      username: bundle.myStatus.username,
      avatarColor: bundle.myStatus.avatarColor,
      avatarUrl: bundle.myStatus.avatarUrl,
      segments: segs,
      unreadCount: 0,
      allViewed: true,
      latestAt: bundle.myStatus.latestAt,
    };
  }, [bundle?.myStatus, store.me]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredContactStacks = useMemo(() => {
    const list = bundle?.contactStacks ?? [];
    if (!normalizedQuery) return list;
    return list.filter(
      (s) =>
        s.displayName.toLowerCase().includes(normalizedQuery) ||
        s.username.toLowerCase().includes(normalizedQuery),
    );
  }, [bundle?.contactStacks, normalizedQuery]);

  const recentStacks = useMemo(
    () => filteredContactStacks.filter((s) => !s.allViewed),
    [filteredContactStacks],
  );
  const viewedStacks = useMemo(
    () => filteredContactStacks.filter((s) => s.allViewed),
    [filteredContactStacks],
  );

  const followedChannels = useMemo(() => {
    const list = bundle?.followedChannels ?? [];
    if (!normalizedQuery) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(normalizedQuery) ||
        c.description.toLowerCase().includes(normalizedQuery) ||
        c.latestSnippet.toLowerCase().includes(normalizedQuery),
    );
  }, [bundle?.followedChannels, normalizedQuery]);

  // Dynamic Layout Mutation driven directly by followedChannelsCount
  const followedChannelsCount = bundle?.followedChannelsCount ?? 0;
  const isCompactCarouselLayout = followedChannelsCount >= 1;

  const sortedDirectoryChannels = useMemo(() => {
    const raw = (bundle?.directoryChannels ?? []).filter((c) => {
      if (!normalizedQuery) return true;
      return (
        c.name.toLowerCase().includes(normalizedQuery) ||
        c.description.toLowerCase().includes(normalizedQuery)
      );
    });
    const copy = [...raw];
    if (directoryCategory === "Popular") {
      copy.sort((a, b) => b.followerCount - a.followerCount);
    } else if (directoryCategory === "New") {
      copy.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      copy.sort((a, b) => {
        const aBoost = a.category === "Most Active" ? 1 : 0;
        const bBoost = b.category === "Most Active" ? 1 : 0;
        if (aBoost !== bBoost) return bBoost - aBoost;
        return b.latestPostAt - a.latestPostAt;
      });
    }
    return copy;
  }, [bundle?.directoryChannels, directoryCategory, normalizedQuery]);

  const openStoryForContact = (targetUserId: string) => {
    if (myStack && targetUserId === myStack.userId) {
      if (myStack.segments.length === 0) {
        setComposerInitialMode("camera");
        setComposerOpen(true);
        return;
      }
      setViewerStacks([myStack]);
      setViewerStackIndex(0);
      return;
    }
    const ordered = [...recentStacks, ...viewedStacks];
    const idx = ordered.findIndex((s) => s.userId === targetUserId);
    if (idx >= 0) {
      setViewerStacks(ordered);
      setViewerStackIndex(idx);
    }
  };

  const handleToggleFollowChannel = async (channel: BroadcastChannelSummary) => {
    if (!channel.followed && channel.isPremium) {
      setVipPreviewChannel(channel);
      return;
    }
    await executeFollowToggle(channel.id);
  };

  const executeFollowToggle = async (channelId: string) => {
    // Optimistic update so layout mutation responds instantaneously
    setBundle((prev) => {
      if (!prev) return prev;
      const inFollowed = prev.followedChannels.find((c) => c.id === channelId);
      if (inFollowed) {
        const nextFollowed = prev.followedChannels.filter((c) => c.id !== channelId);
        const nextDir = prev.directoryChannels.map((c) =>
          c.id === channelId
            ? { ...c, followed: false, followerCount: Math.max(0, c.followerCount - 1) }
            : c,
        );
        return {
          ...prev,
          followedChannels: nextFollowed,
          followedChannelsCount: nextFollowed.length,
          directoryChannels: nextDir,
        };
      }
      const dirTarget = prev.directoryChannels.find((c) => c.id === channelId);
      if (!dirTarget) return prev;
      const promoted: BroadcastChannelSummary = {
        ...dirTarget,
        followed: true,
        followerCount: dirTarget.followerCount + 1,
        unreadCount: 0,
      };
      const nextFollowed = [promoted, ...prev.followedChannels];
      return {
        ...prev,
        followedChannels: nextFollowed,
        followedChannelsCount: nextFollowed.length,
        directoryChannels: prev.directoryChannels.map((c) =>
          c.id === channelId ? promoted : c,
        ),
      };
    });
    try {
      await tursoRpc("toggleFollowChannel", { channelId });
      await loadBundle(true);
    } catch {
      await loadBundle(true);
    }
  };

  return (
    <div className="jt-updates-root">
      {/* Fixed iOS Header: Bold "Updates" title on left + Search, Camera, Plus on right */}
      <header className="jt-updates-header">
        <h1 className="jt-updates-title">Updates</h1>
        <div className="jt-updates-header-actions">
          <button
            type="button"
            className={`jt-updates-hdr-btn ${searchOpen ? "is-active" : ""}`}
            aria-label="Search updates and channels"
            title="Search"
            onClick={() => {
              setSearchOpen((v) => {
                if (v) setSearchQuery("");
                return !v;
              });
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.1" />
              <path
                d="M16.4 16.4L20.5 20.5"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <button
            type="button"
            className="jt-updates-hdr-btn"
            aria-label="Camera status"
            title="Camera status"
            onClick={() => {
              setComposerInitialMode("camera");
              setComposerOpen(true);
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.3-1.8A1.5 1.5 0 0 1 10.6 3.5h2.8a1.5 1.5 0 0 1 1.2.7L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
                stroke="currentColor"
                strokeWidth="1.95"
              />
              <circle cx="12" cy="12.5" r="3.3" stroke="currentColor" strokeWidth="1.95" />
            </svg>
          </button>

          <div className="jt-updates-plus-anchor">
            <button
              type="button"
              className={`jt-updates-hdr-btn ${plusMenuOpen ? "is-active" : ""}`}
              aria-label="Create status or channel"
              title="More options"
              onClick={() => setPlusMenuOpen((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            {plusMenuOpen && (
              <>
                <div
                  className="jt-updates-menu-scrim"
                  onClick={() => setPlusMenuOpen(false)}
                />
                <div className="jt-updates-plus-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      setComposerInitialMode("camera");
                      setComposerOpen(true);
                    }}
                  >
                    <span>Add photo or audio status</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      setComposerInitialMode("text");
                      setComposerOpen(true);
                    }}
                  >
                    <span>Text status</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      setPrivacySheetOpen(true);
                    }}
                  >
                    <span>Status privacy</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      setCreateChannelOpen(true);
                    }}
                  >
                    <span>Create channel</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="jt-updates-search-bar">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search status updates and channels..."
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              className="jt-updates-search-clear"
              onClick={() => setSearchQuery("")}
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="jt-updates-scroll">
        {/* STATUS SECTION */}
        <section className="jt-updates-section">
          <div className="jt-updates-section-hdr">
            <h2>Status</h2>
            <div className="jt-updates-section-hdr-btns">
              <button
                type="button"
                className="jt-updates-pill-action"
                onClick={() => setPrivacySheetOpen(true)}
              >
                Privacy
              </button>
              <button
                type="button"
                className="jt-updates-pill-action"
                onClick={() => {
                  setComposerInitialMode("text");
                  setComposerOpen(true);
                }}
                title="Write text status"
              >
                Aa
              </button>
            </div>
          </div>

          {isCompactCarouselLayout ? (
            /* Condition B (followedChannelsCount >= 1): Horizontal Carousel Row */
            <div className="jt-status-carousel" role="list" aria-label="Status updates carousel">
              {myStack && (
                <button
                  type="button"
                  className="jt-status-carousel-item"
                  onClick={() => openStoryForContact(myStack.userId)}
                >
                  <SegmentedStatusAvatar
                    user={myStack}
                    size={54}
                    segments={myStack.segments.map(() => ({ viewed: false }))}
                    showAddBadge={myStack.segments.length === 0}
                  />
                  <span className="jt-status-carousel-name">My Status</span>
                </button>
              )}

              {[...recentStacks, ...viewedStacks].map((stack) => {
                const firstName = stack.displayName.trim().split(/\s+/)[0] || stack.displayName;
                return (
                  <button
                    key={stack.userId}
                    type="button"
                    className="jt-status-carousel-item"
                    onClick={() => openStoryForContact(stack.userId)}
                  >
                    <SegmentedStatusAvatar
                      user={stack}
                      size={54}
                      segments={stack.segments.map((s) => ({ viewed: s.viewed }))}
                    />
                    <span className="jt-status-carousel-name">
                      <IosEmojiText text={firstName} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Condition A (followedChannelsCount === 0): Vertical Status List */
            <div className="jt-status-vertical-list">
              {myStack && (
                <div className="jt-status-row my-status-row">
                  <button
                    type="button"
                    className="jt-status-row-main"
                    onClick={() => openStoryForContact(myStack.userId)}
                  >
                    <SegmentedStatusAvatar
                      user={myStack}
                      size={52}
                      segments={myStack.segments.map(() => ({ viewed: false }))}
                      showAddBadge={myStack.segments.length === 0}
                    />
                    <div className="jt-status-row-meta">
                      <strong>My Status</strong>
                      <span>
                        {myStack.segments.length > 0
                          ? `${myStack.segments.length} active · ${formatRelativeStatusTime(myStack.latestAt)}`
                          : "Tap to add status update"}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="jt-status-row-quick-add"
                    aria-label="Add new status"
                    onClick={() => {
                      setComposerInitialMode("camera");
                      setComposerOpen(true);
                    }}
                  >
                    +
                  </button>
                </div>
              )}

              {recentStacks.length > 0 && (
                <div className="jt-status-subgroup">
                  <div className="jt-status-subgroup-label">Recent updates</div>
                  {recentStacks.map((stack) => (
                    <button
                      key={stack.userId}
                      type="button"
                      className="jt-status-row"
                      onClick={() => openStoryForContact(stack.userId)}
                    >
                      <SegmentedStatusAvatar
                        user={stack}
                        size={50}
                        segments={stack.segments.map((s) => ({ viewed: s.viewed }))}
                      />
                      <div className="jt-status-row-meta">
                        <strong>
                          <IosEmojiText text={stack.displayName} />
                        </strong>
                        <span>{formatRelativeStatusTime(stack.latestAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {viewedStacks.length > 0 && (
                <div className="jt-status-subgroup">
                  <div className="jt-status-subgroup-label">Viewed updates</div>
                  {viewedStacks.map((stack) => (
                    <button
                      key={stack.userId}
                      type="button"
                      className="jt-status-row"
                      onClick={() => openStoryForContact(stack.userId)}
                    >
                      <SegmentedStatusAvatar
                        user={stack}
                        size={50}
                        segments={stack.segments.map((s) => ({ viewed: s.viewed }))}
                      />
                      <div className="jt-status-row-meta">
                        <strong>
                          <IosEmojiText text={stack.displayName} />
                        </strong>
                        <span>{formatRelativeStatusTime(stack.latestAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!loading && recentStacks.length === 0 && viewedStacks.length === 0 && (
                <div className="jt-status-empty-note">
                  No recent contact status updates in the last 24 hours. Share a photo, text, or 30s audio note above, or follow a channel below to switch to compact view.
                </div>
              )}
            </div>
          )}
        </section>

        {/* CHANNELS SECTION */}
        <section className="jt-updates-section jt-channels-section">
          <div className="jt-updates-section-hdr">
            <h2>Channels</h2>
            <button
              type="button"
              className="jt-updates-pill-action"
              onClick={() => setCreateChannelOpen(true)}
            >
              + Create
            </button>
          </div>

          {followedChannels.length > 0 ? (
            <div className="jt-followed-channels-feed">
              {followedChannels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  className="jt-channel-card"
                  onClick={() => {
                    setActiveChannel(ch);
                    setBundle((prev) =>
                      prev
                        ? {
                            ...prev,
                            followedChannels: prev.followedChannels.map((item) =>
                              item.id === ch.id ? { ...item, unreadCount: 0 } : item,
                            ),
                          }
                        : prev,
                    );
                  }}
                >
                  <Avatar
                    user={{
                      displayName: ch.name,
                      username: ch.handle,
                      avatarColor: ch.avatarColor,
                      avatarUrl: ch.avatarUrl,
                    }}
                    size={48}
                  />
                  <div className="jt-channel-card-body">
                    <div className="jt-channel-card-top">
                      <span className="jt-channel-card-name">
                        <IosEmojiText text={ch.name} />
                        {ch.verified && <VerifiedBadgeIcon size={15} />}
                        {ch.isPremium && <span className="jt-channel-vip-tag">VIP</span>}
                      </span>
                      <time className="jt-channel-card-time">
                        {formatChannelTimestamp(ch.latestPostAt)}
                      </time>
                    </div>
                    <div className="jt-channel-card-bottom">
                      <span className="jt-channel-card-snippet">
                        {ch.latestMediaType === "image" ? "📷 " : ""}
                        <IosEmojiText text={ch.latestSnippet || ch.description} />
                      </span>
                      {ch.unreadCount > 0 && (
                        <span className="jt-channel-unread-badge">
                          {ch.unreadCount > 99 ? "99+" : ch.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="jt-channels-intro-copy">
              Stay updated on topics that matter. Your profile, phone, email, and identity remain strictly private from channel admins and subscribers.
            </p>
          )}

          {/* FIND CHANNELS DIRECTORY */}
          <div className="jt-find-channels-block">
            <div className="jt-find-channels-hdr">
              <h3>Find channels</h3>
              <div className="jt-find-channels-pills" role="tablist">
                {(["Most Active", "Popular", "New"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={directoryCategory === cat}
                    className={`jt-dir-cat-pill ${directoryCategory === cat ? "is-active" : ""}`}
                    onClick={() => setDirectoryCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="jt-directory-list">
              {sortedDirectoryChannels.map((ch) => (
                <div key={ch.id} className="jt-directory-row">
                  <button
                    type="button"
                    className="jt-directory-row-info"
                    onClick={() => setActiveChannel(ch)}
                  >
                    <Avatar
                      user={{
                        displayName: ch.name,
                        username: ch.handle,
                        avatarColor: ch.avatarColor,
                        avatarUrl: ch.avatarUrl,
                      }}
                      size={44}
                    />
                    <div className="jt-directory-row-meta">
                      <span className="jt-directory-row-title">
                        <IosEmojiText text={ch.name} />
                        {ch.verified && <VerifiedBadgeIcon size={14} />}
                      </span>
                      <span className="jt-directory-row-sub">
                        {formatFollowerCount(ch.followerCount)}
                        {ch.isPremium && ch.monthlyPriceLabel
                          ? ` · ${ch.monthlyPriceLabel}`
                          : ""}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`jt-directory-follow-circle ${ch.followed ? "is-followed" : ""}`}
                    aria-label={ch.followed ? `Unfollow ${ch.name}` : `Follow ${ch.name}`}
                    title={ch.followed ? "Following" : "Follow channel"}
                    onClick={() => void handleToggleFollowChannel(ch)}
                  >
                    {ch.followed ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 12.5l4.5 4.5L19 7.5"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 5v14M5 12h14"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* FULL-SCREEN STORY VIEWER */}
      {viewerStacks && (
        <FullScreenStoryViewerModal
          stacks={viewerStacks}
          initialStackIndex={viewerStackIndex}
          meId={store.me?.id ?? ""}
          onClose={() => {
            setViewerStacks(null);
            void loadBundle(true);
          }}
          onStatusMutated={() => void loadBundle(true)}
        />
      )}

      {/* STATUS CREATION COMPOSER */}
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
          onCreated={() => {
            setComposerOpen(false);
            void loadBundle(true);
          }}
        />
      )}

      {/* STATUS DEFAULT PRIVACY MODAL */}
      {privacySheetOpen && (
        <StatusPrivacyDefaultModal
          initialPrivacy={
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

      {/* CREATE BROADCAST CHANNEL MODAL */}
      {createChannelOpen && (
        <CreateChannelModal
          onClose={() => setCreateChannelOpen(false)}
          onCreated={(ch) => {
            setCreateChannelOpen(false);
            void loadBundle(true);
            setActiveChannel(ch);
          }}
        />
      )}

      {/* PREMIUM / VIP MONETIZATION HOOK MODAL */}
      {vipPreviewChannel && (
        <VipChannelHookModal
          channel={vipPreviewChannel}
          onClose={() => setVipPreviewChannel(null)}
          onUnlockAndFollow={async () => {
            const targetId = vipPreviewChannel.id;
            setVipPreviewChannel(null);
            await executeFollowToggle(targetId);
          }}
        />
      )}

      {/* CHANNEL BROADCAST READER OVERLAY */}
      {activeChannel && (
        <ChannelBroadcastReaderModal
          channel={activeChannel}
          onClose={() => {
            setActiveChannel(null);
            void loadBundle(true);
          }}
          onToggleFollow={async () => {
            await handleToggleFollowChannel(activeChannel);
            setActiveChannel((prev) =>
              prev ? { ...prev, followed: !prev.followed } : null,
            );
          }}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   Full-Screen Story Viewer State Machine
   - 5,000ms per segment auto-advance with exact millisecond pause/resume
   - Right 30% tap next / Left 30% tap previous / Long-press pause + hide UI
   - Swipe down slide+fade dismiss / Swipe up DM Reply + quick reactions
   - Interactive Heart like button + private @mention badge + Sponsored Ad interstitial
   ========================================================================== */

export function FullScreenStoryViewerModal({
  stacks,
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
  const [localStacks, setLocalStacks] = useState<ContactStatusStack[]>(stacks);
  const [stackIdx, setStackIdx] = useState(initialStackIndex);
  const [segIdx, setSegIdx] = useState(() => {
    const target = stacks[initialStackIndex];
    if (!target) return 0;
    const firstUnread = target.segments.findIndex((s) => !s.viewed);
    return firstUnread >= 0 ? firstUnread : 0;
  });

  const [elapsedMs, setElapsedMs] = useState(0);
  const [isHoldPaused, setIsHoldPaused] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyToast, setReplyToast] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [contactSwitchCounter, setContactSwitchCounter] = useState(0);
  const [sponsoredAdIndex, setSponsoredAdIndex] = useState<number | null>(null);
  const [pendingNextStackIdx, setPendingNextStackIdx] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthCtxRef = useRef<AudioContext | null>(null);
  const pointerStartRef = useRef<{
    x: number;
    y: number;
    at: number;
    holdTimer: number | null;
    held: boolean;
  } | null>(null);

  const currentStack = localStacks[stackIdx];
  const currentSeg = currentStack?.segments[segIdx];
  const isOwnStory = currentStack?.userId === meId;
  const effectivePaused = isHoldPaused || replyOpen || isClosing;

  const requestCloseAnimated = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
    }, 220);
  }, [isClosing, onClose]);

  const markSegmentRead = useCallback(
    (sIdx: number, gIdx: number) => {
      const st = localStacks[sIdx];
      const sg = st?.segments[gIdx];
      if (!st || !sg || st.userId === meId || sg.viewed) return;
      setLocalStacks((prev) =>
        prev.map((item, idx) => {
          if (idx !== sIdx) return item;
          const nextSegs = item.segments.map((seg, j) =>
            j === gIdx ? { ...seg, viewed: true } : seg,
          );
          return {
            ...item,
            segments: nextSegs,
            allViewed: nextSegs.every((x) => x.viewed),
          };
        }),
      );
      void tursoRpc("markStatusViewed", { statusIds: [sg.id] }).then(() => {
        onStatusMutated();
      });
    },
    [localStacks, meId, onStatusMutated],
  );

  // Mark active segment viewed; when reaching final segment of stack, mark all segments read
  useEffect(() => {
    if (sponsoredAdIndex !== null || !currentStack || !currentSeg) return;
    markSegmentRead(stackIdx, segIdx);
    if (segIdx === currentStack.segments.length - 1 && currentStack.userId !== meId) {
      const allIds = currentStack.segments.map((s) => s.id);
      void tursoRpc("markStatusViewed", { statusIds: allIds });
    }
  }, [currentSeg, currentStack, markSegmentRead, meId, segIdx, sponsoredAdIndex, stackIdx]);

  const advanceToStack = useCallback(
    (nextStack: number) => {
      if (nextStack >= localStacks.length) {
        requestCloseAnimated();
        return;
      }
      const nextCount = contactSwitchCounter + 1;
      setContactSwitchCounter(nextCount);
      // Every 3rd horizontal contact switch injects a Sponsored Ad Interstitial
      if (nextCount > 0 && nextCount % 3 === 0) {
        setPendingNextStackIdx(nextStack);
        setSponsoredAdIndex((nextCount / 3 - 1) % SPONSORED_INTERSTITIALS.length);
        setElapsedMs(0);
        return;
      }
      setStackIdx(nextStack);
      const firstUnread = localStacks[nextStack]?.segments.findIndex((s) => !s.viewed) ?? 0;
      setSegIdx(firstUnread >= 0 ? firstUnread : 0);
      setElapsedMs(0);
    },
    [contactSwitchCounter, localStacks, requestCloseAnimated],
  );

  const goNext = useCallback(() => {
    if (sponsoredAdIndex !== null) {
      const target = pendingNextStackIdx ?? stackIdx + 1;
      setSponsoredAdIndex(null);
      setPendingNextStackIdx(null);
      if (target >= localStacks.length) {
        requestCloseAnimated();
      } else {
        setStackIdx(target);
        setSegIdx(0);
        setElapsedMs(0);
      }
      return;
    }
    if (!currentStack) return;
    if (segIdx + 1 < currentStack.segments.length) {
      setSegIdx((i) => i + 1);
      setElapsedMs(0);
    } else {
      advanceToStack(stackIdx + 1);
    }
  }, [
    advanceToStack,
    currentStack,
    localStacks.length,
    pendingNextStackIdx,
    requestCloseAnimated,
    segIdx,
    sponsoredAdIndex,
    stackIdx,
  ]);

  const goPrev = useCallback(() => {
    if (sponsoredAdIndex !== null) {
      setSponsoredAdIndex(null);
      setPendingNextStackIdx(null);
      setElapsedMs(0);
      return;
    }
    if (elapsedMs > 1200) {
      setElapsedMs(0);
      return;
    }
    if (segIdx > 0) {
      setSegIdx((i) => i - 1);
      setElapsedMs(0);
    } else if (stackIdx > 0) {
      const prevIdx = stackIdx - 1;
      setStackIdx(prevIdx);
      setSegIdx(Math.max(0, (localStacks[prevIdx]?.segments.length ?? 1) - 1));
      setElapsedMs(0);
    } else {
      setElapsedMs(0);
    }
  }, [elapsedMs, localStacks, segIdx, sponsoredAdIndex, stackIdx]);

  // Millisecond-accurate 5,000ms timer that pauses/resumes at exact paused millisecond
  useEffect(() => {
    if (effectivePaused) return;
    let lastTs = performance.now();
    let rafId = 0;
    const tick = (now: number) => {
      const delta = Math.min(100, Math.max(0, now - lastTs));
      lastTs = now;
      setElapsedMs((prev) => {
        const next = prev + delta;
        if (next >= STORY_SEGMENT_DURATION_MS) {
          window.setTimeout(goNext, 0);
          return STORY_SEGMENT_DURATION_MS;
        }
        return next;
      });
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [effectivePaused, goNext, segIdx, sponsoredAdIndex, stackIdx]);

  // Optional 30s-capped audio playback sync
  useEffect(() => {
    if (audioRef.current) {
      if (effectivePaused) {
        audioRef.current.pause();
      } else {
        void audioRef.current.play().catch(() => undefined);
      }
    }
  }, [effectivePaused, currentSeg?.id]);

  // Ambient WebAudio chime for built-in synth tracks
  useEffect(() => {
    if (
      !currentSeg?.audioUrl?.startsWith("builtin:") ||
      effectivePaused ||
      sponsoredAdIndex !== null
    ) {
      if (synthCtxRef.current) {
        void synthCtxRef.current.close().catch(() => undefined);
        synthCtxRef.current = null;
      }
      return;
    }
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      synthCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = currentSeg.audioUrl.includes("pulse")
        ? 329.63
        : currentSeg.audioUrl.includes("lofi")
          ? 261.63
          : 293.66;
      gain.gain.value = 0.025;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      return () => {
        try {
          osc.stop();
          void ctx.close();
        } catch {
          // ignore cleanup
        }
        synthCtxRef.current = null;
      };
    } catch {
      return;
    }
  }, [currentSeg?.audioUrl, currentSeg?.id, effectivePaused, sponsoredAdIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (replyOpen) setReplyOpen(false);
        else requestCloseAnimated();
      } else if (e.key === "ArrowRight" && !replyOpen) {
        goNext();
      } else if (e.key === "ArrowLeft" && !replyOpen) {
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, replyOpen, requestCloseAnimated]);

  const handleStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (replyOpen) return;
    const holdTimer = window.setTimeout(() => {
      if (pointerStartRef.current) {
        pointerStartRef.current.held = true;
        setIsHoldPaused(true);
      }
    }, 185);
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      at: performance.now(),
      holdTimer,
      held: false,
    };
  };

  const handleStagePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start || replyOpen) return;
    const dy = e.clientY - start.y;
    const dx = e.clientX - start.x;
    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
      if (start.holdTimer !== null) {
        window.clearTimeout(start.holdTimer);
        start.holdTimer = null;
      }
      if (dy > 0) {
        setDragOffsetY(Math.min(260, dy));
      }
    }
  };

  const handleStagePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;
    if (start.holdTimer !== null) {
      window.clearTimeout(start.holdTimer);
    }
    const dy = e.clientY - start.y;
    const dx = e.clientX - start.x;

    if (start.held) {
      setIsHoldPaused(false);
      setDragOffsetY(0);
      return;
    }

    // Swipe down -> slide-down + fade dismiss
    if (dy > 85 && Math.abs(dy) > Math.abs(dx)) {
      requestCloseAnimated();
      return;
    }
    setDragOffsetY(0);

    // Swipe up -> open DM Reply + quick reactions
    if (dy < -70 && Math.abs(dy) > Math.abs(dx) && !isOwnStory && sponsoredAdIndex === null) {
      setReplyOpen(true);
      return;
    }

    if (replyOpen) {
      setReplyOpen(false);
      return;
    }

    // Left 30% tap = previous segment; Right 70% (incl. Right 30%) = next segment
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
    if (ratio <= 0.3) {
      goPrev();
    } else {
      goNext();
    }
  };

  const handleToggleLike = async () => {
    if (!currentSeg || !currentStack || isOwnStory) return;
    const targetId = currentSeg.id;
    setLocalStacks((prev) =>
      prev.map((st, idx) =>
        idx !== stackIdx
          ? st
          : {
              ...st,
              segments: st.segments.map((sg, j) =>
                j === segIdx ? { ...sg, liked: !sg.liked } : sg,
              ),
            },
      ),
    );
    try {
      await tursoRpc("toggleStatusLike", { statusId: targetId });
      onStatusMutated();
    } catch {
      // ignore transient error
    }
  };

  const handleSendStoryReply = async (textOverride?: string) => {
    if (!currentStack || !currentSeg || isOwnStory) return;
    const msg = (textOverride ?? replyText).trim();
    if (!msg) return;
    const prefix = currentSeg.caption
      ? `[Status reply: "${currentSeg.caption.slice(0, 48)}"] ${msg}`
      : `[Status reply] ${msg}`;
    setReplyText("");
    setReplyOpen(false);
    setReplyToast("Sent reply");
    window.setTimeout(() => setReplyToast(null), 1800);
    try {
      await store.sendMessage(currentStack.userId, prefix);
    } catch {
      // ignore if not friends yet
    }
  };

  const handleDeleteOwnSegment = async () => {
    if (!currentSeg || !isOwnStory) return;
    try {
      await tursoRpc("deleteStatusPost", { statusId: currentSeg.id });
      onStatusMutated();
      if (currentStack.segments.length <= 1) {
        requestCloseAnimated();
      } else {
        setLocalStacks((prev) =>
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
    } catch {
      // ignore
    }
  };

  if (typeof document === "undefined" || (!currentStack && sponsoredAdIndex === null)) {
    return null;
  }

  const adCard =
    sponsoredAdIndex !== null ? SPONSORED_INTERSTITIALS[sponsoredAdIndex] : null;
  const mentionedMe = Boolean(currentSeg?.mentionedUserIds?.includes(meId));

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
        {/* Top Segmented Progress Bar + Author Header (hidden on long-press hold) */}
        <div className={`jt-story-chrome-top ${isHoldPaused ? "is-hidden" : ""}`}>
          <div className="jt-story-progress-row">
            {adCard ? (
              <div className="jt-story-progress-track">
                <div
                  className="jt-story-progress-fill sponsored"
                  style={{
                    width: `${Math.min(100, (elapsedMs / STORY_SEGMENT_DURATION_MS) * 100)}%`,
                  }}
                />
              </div>
            ) : (
              currentStack.segments.map((seg, idx) => {
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
              })
            )}
          </div>

          <div className="jt-story-author-bar">
            {adCard ? (
              <div className="jt-story-author-info">
                <span className="jt-story-sponsored-pill">Sponsored</span>
                <strong>{adCard.sponsor}</strong>
              </div>
            ) : (
              <div className="jt-story-author-info">
                <Avatar user={currentStack} size={36} />
                <div className="jt-story-author-text">
                  <strong>
                    <IosEmojiText
                      text={isOwnStory ? "My Status" : currentStack.displayName}
                    />
                  </strong>
                  <span>
                    {formatRelativeStatusTime(currentSeg?.createdAt ?? 0)}
                    {currentSeg?.mediaSource === "instagram"
                      ? " · via Instagram"
                      : currentSeg?.mediaSource === "facebook"
                        ? " · via Facebook"
                        : ""}
                    {currentSeg?.audioTitle ? ` · 🎵 ${currentSeg.audioTitle}` : ""}
                  </span>
                </div>
              </div>
            )}

            <div className="jt-story-top-actions">
              {adCard && (
                <button
                  type="button"
                  className="jt-story-skip-ad-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                >
                  Skip
                </button>
              )}
              {isOwnStory && !adCard && (
                <button
                  type="button"
                  className="jt-story-icon-btn danger"
                  aria-label="Delete status segment"
                  title="Delete this status"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteOwnSegment();
                  }}
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                className="jt-story-icon-btn"
                aria-label="Close story viewer"
                onClick={(e) => {
                  e.stopPropagation();
                  requestCloseAnimated();
                }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Story Stage */}
        <div
          className="jt-story-stage"
          style={{
            background: adCard
              ? adCard.gradient
              : currentSeg?.bgColor || "#0f172a",
          }}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onPointerCancel={() => {
            setIsHoldPaused(false);
            setDragOffsetY(0);
          }}
        >
          {adCard ? (
            <div className="jt-story-ad-card">
              <span className="jt-story-ad-kicker">SPONSORED UPDATE</span>
              <h3>{adCard.headline}</h3>
              <p>{adCard.body}</p>
              <button
                type="button"
                className="jt-story-ad-cta"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
              >
                {adCard.cta}
              </button>
            </div>
          ) : currentSeg?.mediaType === "image" && currentSeg.mediaUrl ? (
            <>
              <img
                src={resolveTursoMediaUrl(currentSeg.mediaUrl)}
                alt={currentSeg.caption || "Status"}
                className="jt-story-media-img"
                draggable={false}
              />
              {currentSeg.caption && !isHoldPaused && (
                <div className="jt-story-caption-bar">
                  <IosEmojiText text={currentSeg.caption} />
                </div>
              )}
            </>
          ) : (
            <div className={`jt-story-text-canvas ${isHoldPaused ? "is-clean" : ""}`}>
              <p>
                <IosEmojiText text={currentSeg?.caption || "🎵 Audio status"} />
              </p>
            </div>
          )}

          {currentSeg?.audioUrl &&
            !currentSeg.audioUrl.startsWith("builtin:") &&
            !adCard && (
              <audio
                ref={audioRef}
                src={resolveTursoMediaUrl(currentSeg.audioUrl)}
                autoPlay
                playsInline
              />
            )}

          {mentionedMe && !isHoldPaused && !adCard && (
            <div className="jt-story-mentioned-pill">
              Privately mentioned you
            </div>
          )}
        </div>

        {/* Bottom Engagement / Reply Bar */}
        {!adCard && (
          <div className={`jt-story-chrome-bottom ${isHoldPaused ? "is-hidden" : ""}`}>
            {isOwnStory ? (
              <div className="jt-story-own-stats">
                <span>👁 {currentSeg?.viewCount ?? 0} views</span>
                <span>❤️ {currentSeg?.likeCount ?? 0} likes</span>
                <span className="jt-story-privacy-badge">{currentSeg?.privacyType}</span>
              </div>
            ) : replyOpen ? (
              <div
                className="jt-story-reply-sheet"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="jt-story-quick-emojis">
                  {QUICK_STORY_EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => void handleSendStoryReply(em)}
                    >
                      <IosEmojiText text={em} />
                    </button>
                  ))}
                </div>
                <form
                  className="jt-story-reply-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSendStoryReply();
                  }}
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply to ${currentStack.displayName}...`}
                    autoFocus
                  />
                  <button type="submit">Send</button>
                </form>
              </div>
            ) : (
              <div className="jt-story-bottom-bar">
                <button
                  type="button"
                  className="jt-story-reply-trigger"
                  onClick={() => setReplyOpen(true)}
                >
                  <span>Reply to {currentStack.displayName.split(" ")[0]}...</span>
                </button>
                <button
                  type="button"
                  className={`jt-story-heart-btn ${currentSeg?.liked ? "is-liked" : ""}`}
                  aria-label={currentSeg?.liked ? "Unlike status" : "Like status"}
                  onClick={() => void handleToggleLike()}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill={currentSeg?.liked ? "#ef4444" : "none"}>
                    <path
                      d="M12 20.4s-7-4.35-9.2-8.7C1.1 8.3 3.2 4.5 6.9 4.5c2.1 0 3.7 1.1 5.1 2.8 1.4-1.7 3-2.8 5.1-2.8 3.7 0 5.8 3.8 4.1 7.2-2.2 4.35-9.2 8.7-9.2 8.7Z"
                      stroke={currentSeg?.liked ? "#ef4444" : "#ffffff"}
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )}
            {replyToast && <div className="jt-story-reply-toast">{replyToast}</div>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ==========================================================================
   Status Creation Composer Modal
   - Media Picker Sourcing: Camera Roll + Instagram + Facebook tabs
   - Optional Audio/Music clip strictly capped at 30,000ms (30s)
   - Private @mentions selector
   - Immutable creation-time privacy selector (MY_CONTACTS, CONTACTS_EXCEPT,
     ONLY_SHARE_WITH, GROUP_EXCLUSIVE)
   ========================================================================== */

function StatusComposerModal({
  initialMode,
  privacyDefault,
  onClose,
  onCreated,
}: {
  initialMode: "camera" | "text";
  privacyDefault: PrivacyDefaultsState;
  onClose: () => void;
  onCreated: () => void;
}) {
  const store = useJaText();
  const [mode, setMode] = useState<"camera" | "text">(initialMode);
  const [mediaSource, setMediaSource] = useState<"camera_roll" | "instagram" | "facebook">(
    "camera_roll",
  );
  const [caption, setCaption] = useState("");
  const [bgColor, setBgColor] = useState(STORY_BG_SWATCHES[0]);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");
  const [selectedBuiltinAudio, setSelectedBuiltinAudio] = useState(BUILTIN_AUDIO_TRACKS[0].id);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [privacyType, setPrivacyType] = useState<StatusPrivacyType>(
    privacyDefault.privacyType || "MY_CONTACTS",
  );
  const [excludedIds, setExcludedIds] = useState<string[]>(privacyDefault.excludedIds ?? []);
  const [includedIds, setIncludedIds] = useState<string[]>(privacyDefault.includedIds ?? []);
  const [groupId, setGroupId] = useState<string>(privacyDefault.groupId ?? "");
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  const regularGroups = useMemo(
    () => store.groups.filter((g) => !g.isCommunity),
    [store.groups],
  );

  const handlePickImage = (file: File | null) => {
    if (!file) return;
    setSelectedImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreviewUrl(url);
  };

  const handlePickAudio = (file: File | null) => {
    setAudioError(null);
    if (!file) return;
    const tempUrl = URL.createObjectURL(file);
    const probe = document.createElement("audio");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const durMs = Math.round((probe.duration || 0) * 1000);
      URL.revokeObjectURL(tempUrl);
      if (durMs > MAX_AUDIO_DURATION_MS) {
        setAudioError("Audio clips on Status are strictly capped at 30 seconds.");
        setAudioFile(null);
        setAudioDurationMs(0);
        return;
      }
      setAudioFile(file);
      setAudioDurationMs(Math.max(1000, durMs || 15000));
      setSelectedBuiltinAudio("none");
    };
    probe.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      setAudioFile(file);
      setAudioDurationMs(15000);
      setSelectedBuiltinAudio("none");
    };
    probe.src = tempUrl;
  };

  const handlePublish = async () => {
    setError(null);
    if (!caption.trim() && !selectedImageFile && !audioFile && selectedBuiltinAudio === "none") {
      setError("Write a status or pick a photo or audio clip first.");
      return;
    }
    if (privacyType === "GROUP_EXCLUSIVE" && !groupId) {
      setError("Choose a group for Group Exclusive status.");
      return;
    }

    setSubmitting(true);
    try {
      let uploadedMediaUrl = "";
      let resolvedMediaType: "text" | "image" | "audio" = "text";
      if (selectedImageFile) {
        uploadedMediaUrl = await uploadMediaToTurso(selectedImageFile);
        resolvedMediaType = "image";
      }

      let uploadedAudioUrl = "";
      let resolvedAudioTitle = "";
      let resolvedAudioDuration = 0;

      if (audioFile) {
        uploadedAudioUrl = await uploadMediaToTurso(audioFile);
        resolvedAudioTitle = audioFile.name.replace(/\.[^.]+$/, "").slice(0, 60);
        resolvedAudioDuration = Math.min(MAX_AUDIO_DURATION_MS, audioDurationMs || 15000);
        if (!uploadedMediaUrl) resolvedMediaType = "audio";
      } else if (selectedBuiltinAudio !== "none") {
        const track = BUILTIN_AUDIO_TRACKS.find((t) => t.id === selectedBuiltinAudio);
        if (track) {
          uploadedAudioUrl = `builtin:${track.id}`;
          resolvedAudioTitle = track.title;
          resolvedAudioDuration = Math.min(MAX_AUDIO_DURATION_MS, track.durationMs);
        }
      }

      await tursoRpc("createStatusPost", {
        mediaUrl: uploadedMediaUrl,
        mediaType: resolvedMediaType,
        caption: caption.trim(),
        bgColor,
        audioUrl: uploadedAudioUrl,
        audioTitle: resolvedAudioTitle,
        audioDurationMs: resolvedAudioDuration,
        mediaSource,
        privacyType,
        excludedUserIds: privacyType === "CONTACTS_EXCEPT" ? excludedIds : [],
        includedUserIds: privacyType === "ONLY_SHARE_WITH" ? includedIds : [],
        groupId: privacyType === "GROUP_EXCLUSIVE" ? groupId : null,
        mentionedUserIds: mentionedIds,
      });
      onCreated();
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
        <header className="jt-upd-modal-hdr">
          <h3>Create Status</h3>
          <button type="button" className="jt-upd-close-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="jt-upd-mode-tabs">
          <button
            type="button"
            className={mode === "camera" ? "is-active" : ""}
            onClick={() => setMode("camera")}
          >
            Media Picker
          </button>
          <button
            type="button"
            className={mode === "text" ? "is-active" : ""}
            onClick={() => {
              setMode("text");
              setSelectedImageFile(null);
              setImagePreviewUrl("");
            }}
          >
            Text Card
          </button>
        </div>

        {mode === "camera" && (
          <div className="jt-upd-source-block">
            <div className="jt-upd-source-tabs" role="tablist">
              {(
                [
                  { id: "camera_roll", label: "Camera Roll" },
                  { id: "instagram", label: "Instagram" },
                  { id: "facebook", label: "Facebook" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={mediaSource === tab.id}
                  className={mediaSource === tab.id ? "is-active" : ""}
                  onClick={() => setMediaSource(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {mediaSource === "camera_roll" ? (
              <div className="jt-upd-upload-box">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handlePickImage(e.target.files?.[0] ?? null)}
                />
                {imagePreviewUrl ? (
                  <div className="jt-upd-img-preview">
                    <img src={imagePreviewUrl} alt="Preview" />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedImageFile(null);
                        setImagePreviewUrl("");
                      }}
                    >
                      Remove photo
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="jt-upd-pick-btn"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    Choose photo from Camera Roll
                  </button>
                )}
              </div>
            ) : (
              <div className="jt-upd-social-import-grid">
                {CURATED_SOCIAL_MEDIA_CARDS[mediaSource].map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className="jt-upd-social-card"
                    style={{ background: card.gradient }}
                    onClick={() => {
                      setCaption(card.caption);
                      setSelectedImageFile(null);
                      setImagePreviewUrl("");
                    }}
                  >
                    <strong>{card.title}</strong>
                    <small>{card.subtitle}</small>
                  </button>
                ))}
                <button
                  type="button"
                  className="jt-upd-pick-btn secondary"
                  onClick={() => imageInputRef.current?.click()}
                >
                  Import saved {mediaSource === "instagram" ? "Instagram" : "Facebook"} photo
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handlePickImage(e.target.files?.[0] ?? null)}
                />
              </div>
            )}
          </div>
        )}

        <div
          className="jt-upd-composer-preview"
          style={{ background: bgColor }}
        >
          {imagePreviewUrl ? (
            <img src={imagePreviewUrl} alt="Selected status" />
          ) : null}
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write a status update or caption..."
            maxLength={700}
            rows={3}
          />
        </div>

        <div className="jt-upd-swatch-row">
          {STORY_BG_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              className={`jt-upd-swatch ${bgColor === hex ? "is-selected" : ""}`}
              style={{ background: hex }}
              onClick={() => setBgColor(hex)}
              aria-label={`Background color ${hex}`}
            />
          ))}
        </div>

        {/* Audio / Music Attachment (strictly <= 30s) */}
        <div className="jt-upd-field-group">
          <label>Audio / Music (max 30s)</label>
          <div className="jt-upd-audio-row">
            <select
              value={selectedBuiltinAudio}
              onChange={(e) => {
                setSelectedBuiltinAudio(e.target.value);
                if (e.target.value !== "none") {
                  setAudioFile(null);
                  setAudioDurationMs(0);
                }
              }}
            >
              {BUILTIN_AUDIO_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="jt-upd-mini-btn"
              onClick={() => audioInputRef.current?.click()}
            >
              {audioFile ? `🎵 ${audioFile.name.slice(0, 16)}` : "Upload <=30s clip"}
            </button>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => handlePickAudio(e.target.files?.[0] ?? null)}
            />
          </div>
          {audioError && <p className="jt-upd-err">{audioError}</p>}
        </div>

        {/* Private @mentions */}
        {store.friends.length > 0 && (
          <div className="jt-upd-field-group">
            <label>Private @mentions (notifies privately)</label>
            <div className="jt-upd-chip-wrap">
              {store.friends.map((fr) => {
                const active = mentionedIds.includes(fr.id);
                return (
                  <button
                    key={fr.id}
                    type="button"
                    className={`jt-upd-chip ${active ? "is-active" : ""}`}
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

        {/* Immutable Per-Post Audience Privacy */}
        <div className="jt-upd-field-group">
          <label>Audience for this status (immutable once posted)</label>
          <select
            value={privacyType}
            onChange={(e) => setPrivacyType(e.target.value as StatusPrivacyType)}
          >
            <option value="MY_CONTACTS">My Contacts</option>
            <option value="CONTACTS_EXCEPT">My Contacts Except...</option>
            <option value="ONLY_SHARE_WITH">Only Share With...</option>
            <option value="GROUP_EXCLUSIVE">Group Exclusive</option>
          </select>

          {privacyType === "CONTACTS_EXCEPT" && store.friends.length > 0 && (
            <div className="jt-upd-chip-wrap">
              {store.friends.map((fr) => {
                const blocked = excludedIds.includes(fr.id);
                return (
                  <button
                    key={fr.id}
                    type="button"
                    className={`jt-upd-chip danger ${blocked ? "is-active" : ""}`}
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
            <div className="jt-upd-chip-wrap">
              {store.friends.map((fr) => {
                const allowed = includedIds.includes(fr.id);
                return (
                  <button
                    key={fr.id}
                    type="button"
                    className={`jt-upd-chip ${allowed ? "is-active" : ""}`}
                    onClick={() =>
                      setIncludedIds((prev) =>
                        prev.includes(fr.id)
                          ? prev.filter((x) => x !== fr.id)
                          : [...prev, fr.id],
                      )
                    }
                  >
                    Share: {fr.displayName}
                  </button>
                );
              })}
            </div>
          )}

          {privacyType === "GROUP_EXCLUSIVE" && (
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
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

        {error && <p className="jt-upd-err">{error}</p>}

        <footer className="jt-upd-modal-ftr">
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
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/* ==========================================================================
   Status Default Privacy Modal (strictly applies only to future statuses)
   ========================================================================== */

function StatusPrivacyDefaultModal({
  initialPrivacy,
  onClose,
  onSaved,
}: {
  initialPrivacy: PrivacyDefaultsState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const store = useJaText();
  const [privacyType, setPrivacyType] = useState<StatusPrivacyType>(
    initialPrivacy.privacyType || "MY_CONTACTS",
  );
  const [excludedIds, setExcludedIds] = useState<string[]>(initialPrivacy.excludedIds ?? []);
  const [includedIds, setIncludedIds] = useState<string[]>(initialPrivacy.includedIds ?? []);
  const [groupId, setGroupId] = useState<string>(initialPrivacy.groupId ?? "");
  const [saving, setSaving] = useState(false);

  const regularGroups = useMemo(
    () => store.groups.filter((g) => !g.isCommunity),
    [store.groups],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await tursoRpc("saveStatusPrivacyDefault", {
        privacyType,
        excludedUserIds: excludedIds,
        includedUserIds: includedIds,
        groupId: groupId || null,
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
        <header className="jt-upd-modal-hdr">
          <h3>Status Privacy</h3>
          <button type="button" className="jt-upd-close-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <p className="jt-upd-note">
          Changes to your privacy settings will not affect status updates that you have already sent.
        </p>

        <div className="jt-upd-radio-list">
          {(
            [
              { id: "MY_CONTACTS", title: "My contacts", sub: "Share with all your contacts" },
              {
                id: "CONTACTS_EXCEPT",
                title: "My contacts except...",
                sub: "Exclude specific contacts",
              },
              {
                id: "ONLY_SHARE_WITH",
                title: "Only share with...",
                sub: "Only share with selected contacts",
              },
              {
                id: "GROUP_EXCLUSIVE",
                title: "Group exclusive",
                sub: "Route status directly into a group context",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`jt-upd-radio-item ${privacyType === opt.id ? "is-selected" : ""}`}
              onClick={() => setPrivacyType(opt.id)}
            >
              <div>
                <strong>{opt.title}</strong>
                <span>{opt.sub}</span>
              </div>
              <span className="jt-upd-radio-dot" />
            </button>
          ))}
        </div>

        {privacyType === "CONTACTS_EXCEPT" && store.friends.length > 0 && (
          <div className="jt-upd-chip-wrap">
            {store.friends.map((fr) => (
              <button
                key={fr.id}
                type="button"
                className={`jt-upd-chip danger ${excludedIds.includes(fr.id) ? "is-active" : ""}`}
                onClick={() =>
                  setExcludedIds((prev) =>
                    prev.includes(fr.id)
                      ? prev.filter((x) => x !== fr.id)
                      : [...prev, fr.id],
                  )
                }
              >
                {fr.displayName}
              </button>
            ))}
          </div>
        )}

        {privacyType === "ONLY_SHARE_WITH" && store.friends.length > 0 && (
          <div className="jt-upd-chip-wrap">
            {store.friends.map((fr) => (
              <button
                key={fr.id}
                type="button"
                className={`jt-upd-chip ${includedIds.includes(fr.id) ? "is-active" : ""}`}
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
            ))}
          </div>
        )}

        {privacyType === "GROUP_EXCLUSIVE" && (
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Choose group...</option>
            {regularGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}

        <footer className="jt-upd-modal-ftr">
          <button type="button" className="jt-upd-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="jt-upd-btn-primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving..." : "Done"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/* ==========================================================================
   Create Broadcast Channel Modal
   ========================================================================== */

function CreateChannelModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (channel: BroadcastChannelSummary) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_COLORS[2]?.id ?? "purple");
  const [isPremium, setIsPremium] = useState(false);
  const [priceLabel, setPriceLabel] = useState("$2.99/mo");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleCreate = async () => {
    if (name.trim().length < 2) {
      setErr("Channel name must be at least 2 characters.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await tursoRpc<{ id: string; handle: string }>("createBroadcastChannel", {
        name: name.trim(),
        description: description.trim(),
        avatarColor,
        category: "New",
        isPremium,
        monthlyPriceLabel: isPremium ? priceLabel : "",
      });
      onCreated({
        id: res.id,
        name: name.trim(),
        handle: res.handle,
        description: description.trim(),
        avatarColor,
        verified: false,
        category: "New",
        isPremium,
        monthlyPriceLabel: isPremium ? priceLabel : "",
        followerCount: 1,
        postCount: 1,
        latestSnippet: description.trim() || `Welcome to ${name.trim()}!`,
        latestMediaType: "text",
        latestPostAt: Date.now(),
        createdAt: Date.now(),
        followed: true,
        unreadCount: 0,
        isOwner: true,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create channel.");
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="jt-upd-modal-backdrop" onClick={onClose}>
      <div className="jt-upd-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="jt-upd-modal-hdr">
          <h3>Create Channel</h3>
          <button type="button" className="jt-upd-close-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <p className="jt-upd-note">
          Anyone on JaText can discover your channel. Follower identities are strictly isolated and broadcasts older than 30 days are automatically pruned.
        </p>

        <div className="jt-upd-field-group">
          <label>Channel Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tech Frontier Daily"
            maxLength={80}
          />
        </div>

        <div className="jt-upd-field-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what followers can expect..."
            rows={2}
            maxLength={300}
          />
        </div>

        <div className="jt-upd-field-group">
          <label className="jt-upd-checkbox-row">
            <input
              type="checkbox"
              checked={isPremium}
              onChange={(e) => setIsPremium(e.target.checked)}
            />
            <span>Enable VIP Paid Subscription Hook</span>
          </label>
          {isPremium && (
            <input
              type="text"
              value={priceLabel}
              onChange={(e) => setPriceLabel(e.target.value)}
              placeholder="$2.99/mo"
              maxLength={24}
            />
          )}
        </div>

        <div className="jt-upd-swatch-row">
          {AVATAR_COLORS.slice(0, 8).map((col) => (
            <button
              key={col.id}
              type="button"
              className={`jt-upd-swatch ${avatarColor === col.id ? "is-selected" : ""}`}
              style={{ background: col.hex }}
              onClick={() => setAvatarColor(col.id)}
              title={col.name}
            />
          ))}
        </div>

        {err && <p className="jt-upd-err">{err}</p>}

        <footer className="jt-upd-modal-ftr">
          <button type="button" className="jt-upd-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="jt-upd-btn-primary"
            disabled={busy}
            onClick={() => void handleCreate()}
          >
            {busy ? "Creating..." : "Create Channel"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/* ==========================================================================
   VIP Monetization Subscription Hook Modal
   ========================================================================== */

function VipChannelHookModal({
  channel,
  onClose,
  onUnlockAndFollow,
}: {
  channel: BroadcastChannelSummary;
  onClose: () => void;
  onUnlockAndFollow: () => Promise<void>;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="jt-upd-modal-backdrop" onClick={onClose}>
      <div className="jt-upd-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="jt-upd-modal-hdr">
          <h3>VIP Channel Subscription</h3>
          <button type="button" className="jt-upd-close-btn" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="jt-vip-hook-hero">
          <Avatar
            user={{
              displayName: channel.name,
              username: channel.handle,
              avatarColor: channel.avatarColor,
              avatarUrl: channel.avatarUrl,
            }}
            size={58}
          />
          <strong>
            <IosEmojiText text={channel.name} /> {channel.verified && <VerifiedBadgeIcon />}
          </strong>
          <span className="jt-vip-price-pill">
            {channel.monthlyPriceLabel || "$2.99/mo"} · Early Access Preview
          </span>
          <p>{channel.description}</p>
        </div>
        <footer className="jt-upd-modal-ftr">
          <button type="button" className="jt-upd-btn-ghost" onClick={onClose}>
            Not now
          </button>
          <button
            type="button"
            className="jt-upd-btn-primary"
            onClick={() => void onUnlockAndFollow()}
          >
            Activate Free Preview & Follow
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/* ==========================================================================
   Channel Broadcast Reader & Forward Attribution Binding
   ========================================================================== */

function ChannelBroadcastReaderModal({
  channel,
  onClose,
  onToggleFollow,
}: {
  channel: BroadcastChannelSummary;
  onClose: () => void;
  onToggleFollow: () => Promise<void>;
}) {
  const store = useJaText();
  const [posts, setPosts] = useState<ChannelBroadcastPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [forwardPost, setForwardPost] = useState<ChannelBroadcastPost | null>(null);
  const [forwardToast, setForwardToast] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      const res = await tursoRpc<{
        channel: BroadcastChannelSummary;
        posts: ChannelBroadcastPost[];
      }>("getChannelPosts", { channelId: channel.id });
      setPosts(res.posts ?? []);
    } finally {
      setLoading(false);
    }
  }, [channel.id]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const handleReact = async (postId: string, emoji: string) => {
    await tursoRpc("reactChannelPost", { postId, emoji });
    await loadPosts();
  };

  const handleAdminPost = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await tursoRpc("postChannelBroadcast", {
        channelId: channel.id,
        body: draft.trim(),
      });
      setDraft("");
      await loadPosts();
    } finally {
      setPosting(false);
    }
  };

  const handleForwardToTarget = async (
    targetKind: "dm" | "group",
    targetId: string,
    targetLabel: string,
  ) => {
    if (!forwardPost) return;
    const attributedBody = encodeForwardedBody(forwardPost.body, {
      v: 1,
      sourceKind: "channel",
      originalMessageId: forwardPost.id,
      originalCreatedAt: forwardPost.createdAt,
      originalSenderId: channel.id,
      originalSenderName: channel.name,
      originalSenderUsername: channel.handle,
      originalSenderAvatarColor: channel.avatarColor,
      originalSenderAvatarUrl: channel.avatarUrl,
      channelId: channel.id,
      channelName: channel.name,
      channelVerified: channel.verified,
    });
    setForwardPost(null);
    if (targetKind === "dm") {
      await store.sendMessage(targetId, attributedBody);
    } else {
      await store.sendGroupMessage(targetId, attributedBody);
    }
    setForwardToast(`Forwarded to ${targetLabel} with channel attribution`);
    window.setTimeout(() => setForwardToast(null), 2200);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="jt-upd-modal-backdrop" onClick={onClose}>
      <div className="jt-channel-reader-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="jt-channel-reader-hdr">
          <button type="button" className="jt-upd-close-btn" onClick={onClose}>
            ←
          </button>
          <Avatar
            user={{
              displayName: channel.name,
              username: channel.handle,
              avatarColor: channel.avatarColor,
              avatarUrl: channel.avatarUrl,
            }}
            size={40}
          />
          <div className="jt-channel-reader-title">
            <strong>
              <IosEmojiText text={channel.name} />
              {channel.verified && <VerifiedBadgeIcon size={14} />}
            </strong>
            <span>{formatFollowerCount(channel.followerCount)} · Anonymous subscribers</span>
          </div>
          <button
            type="button"
            className={`jt-upd-mini-btn ${channel.followed ? "followed" : ""}`}
            onClick={() => void onToggleFollow()}
          >
            {channel.followed ? "Following" : "Follow"}
          </button>
        </header>

        <div className="jt-channel-privacy-banner">
          🔒 Strict Identity Isolation active · Admins and subscribers cannot see your name, username, email, or profile photo. Posts auto-expire after 30 days.
        </div>

        <div className="jt-channel-posts-list">
          {loading ? (
            <div className="jt-status-empty-note">Loading broadcasts...</div>
          ) : posts.length === 0 ? (
            <div className="jt-status-empty-note">No broadcasts in the last 30 days.</div>
          ) : (
            posts.map((post) => (
              <article key={post.id} className="jt-channel-post-bubble">
                <p>
                  <IosEmojiText text={post.body} />
                </p>
                <div className="jt-channel-post-meta">
                  <div className="jt-channel-reactions-bar">
                    {CHANNEL_REACTION_EMOJIS.map((em) => {
                      const entry = post.reactions.find((r) => r.emoji === em);
                      const mine = post.myEmoji === em;
                      return (
                        <button
                          key={em}
                          type="button"
                          className={`jt-channel-react-chip ${mine ? "is-mine" : ""}`}
                          onClick={() => void handleReact(post.id, em)}
                        >
                          <IosEmojiText text={em} />
                          {entry && entry.count > 0 ? <span>{entry.count}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                  <div className="jt-channel-post-right">
                    <button
                      type="button"
                      className="jt-channel-forward-btn"
                      onClick={() => setForwardPost(post)}
                    >
                      Forward ↪
                    </button>
                    <time>{formatChannelTimestamp(post.createdAt)}</time>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        {channel.isOwner && (
          <form
            className="jt-channel-admin-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void handleAdminPost();
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Broadcast an update to your followers..."
            />
            <button type="submit" disabled={posting}>
              {posting ? "..." : "Broadcast"}
            </button>
          </form>
        )}

        {forwardPost && (
          <div className="jt-channel-forward-picker">
            <div className="jt-channel-forward-hdr">
              <strong>Forward with "{channel.name}" attribution</strong>
              <button type="button" onClick={() => setForwardPost(null)}>
                Cancel
              </button>
            </div>
            <div className="jt-channel-forward-targets">
              {store.friends.map((fr) => (
                <button
                  key={fr.id}
                  type="button"
                  onClick={() => void handleForwardToTarget("dm", fr.id, fr.displayName)}
                >
                  <Avatar user={fr} size={28} />
                  <span>{fr.displayName}</span>
                </button>
              ))}
              {store.groups.map((grp) => (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => void handleForwardToTarget("group", grp.id, grp.name)}
                >
                  <span>👥 {grp.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {forwardToast && <div className="jt-story-reply-toast">{forwardToast}</div>}
      </div>
    </div>,
    document.body,
  );
}
