import { useMemo, useState, type CSSProperties } from "react";
import { Phone, Video } from "./CallIcons";
import { useCall } from "../lib/calling";
import {
  getCachedWallpaper,
  parseWallpaperSignal,
  saveCachedWallpaper,
  serializeWallpaperSignal,
  useIsMobileWallpaperSupported,
} from "../lib/chatCustomization";
import { colorById } from "../lib/colors";
import { normalizeAvatarSrc } from "../lib/imageUtils";
import { useJaText } from "../lib/store";
import type { ActivityStatus, JaUser } from "../lib/types";
import { Avatar } from "./Avatar";
import { WallpaperModal, type WallpaperChoice } from "./WallpaperModal";

/**
 * The card shown when you click someone's pfp or the 3-dots header menu.
 * Their avatar color drives the outline around the entire profile card,
 * the horizontal banner divider, and the outline ring around the pfp.
 */
export function ProfileCard({
  user,
  status,
}: {
  user: JaUser;
  status?: ActivityStatus;
}) {
  const color = colorById(user.avatarColor);
  const bannerSrc = normalizeAvatarSrc(user.bannerUrl);
  return (
    <div
      className="profile-card"
      style={{ "--profile-outline": color.hex } as CSSProperties}
    >
      <div
        className="profile-banner"
        style={
          bannerSrc
            ? { backgroundImage: `url(${bannerSrc})` }
            : { background: color.gradient }
        }
      />
      <div className="profile-body">
        <div className="profile-avatar-wrap">
          <Avatar user={user} size={86} ringWidth={3.5} status={status} />
        </div>
        <div className="profile-names">
          <div className="profile-display">{user.displayName || "Unnamed"}</div>
          <div className="profile-username">
            @{user.username}
            {user.pronouns ? <span className="profile-pronouns"> · {user.pronouns}</span> : null}
          </div>
        </div>
        {user.bio ? <p className="profile-bio">{user.bio}</p> : null}
        <div className="profile-color-row">
          <span className="color-dot" style={{ background: color.hex }} />
          Avatar color: <strong>{color.name}</strong>
          {color.note ? <span className="muted"> — {color.note}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function ProfileModal({
  user,
  status,
  onClose,
}: {
  user: JaUser;
  status?: ActivityStatus;
  onClose: () => void;
}) {
  const store = useJaText();
  const { me, friends, activeChatId, activeMessages, blockedUserIds, setActiveChatId } = store;
  const { startCall } = useCall();
  const isMobileWallpaper = useIsMobileWallpaperSupported();
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  const color = colorById(user.avatarColor);
  const isNotMe = Boolean(me && me.id !== user.id);
  const isFriend = Boolean(isNotMe && friends.some((f) => f.id === user.id));
  const isBlocked = Boolean(isNotMe && blockedUserIds.includes(user.id));

  const currentDmWallpaperUrl = useMemo(() => {
    if (activeChatId === user.id) {
      for (let i = activeMessages.length - 1; i >= 0; i--) {
        const msg = activeMessages[i];
        if (msg.unsentAt) continue;
        const wp = parseWallpaperSignal(msg.body, msg.attachmentUrl);
        if (wp) return wp.url;
      }
    }
    return getCachedWallpaper(`dm:${user.id}`) ?? null;
  }, [activeChatId, activeMessages, user.id]);

  async function handleApplyDmWallpaper(choice: WallpaperChoice) {
    const scopeKey = `dm:${user.id}`;
    if (choice.kind === "none") {
      await store.sendMessage(
        user.id,
        serializeWallpaperSignal({
          v: 1,
          kind: "none",
          actorName: me?.displayName,
        }),
      );
      saveCachedWallpaper(scopeKey, null);
    } else if (choice.kind === "preset" && choice.url) {
      await store.sendMessage(
        user.id,
        serializeWallpaperSignal({
          v: 1,
          kind: "preset",
          presetId: choice.presetId,
          url: choice.url,
          actorName: me?.displayName,
        }),
      );
      saveCachedWallpaper(scopeKey, choice.url);
    } else if (choice.kind === "custom" && choice.file) {
      await store.sendMessage(
        user.id,
        serializeWallpaperSignal({
          v: 1,
          kind: "custom",
          actorName: me?.displayName,
        }),
        choice.file,
      );
    }
    setActiveChatId(user.id);
  }

  async function handleToggleBlock() {
    if (!isNotMe || blockBusy) return;
    setBlockBusy(true);
    try {
      await store.setUserBlocked(user.id, !isBlocked);
    } finally {
      setBlockBusy(false);
    }
  }

  if (wallpaperOpen) {
    return (
      <WallpaperModal
        currentWallpaperUrl={currentDmWallpaperUrl}
        onApply={handleApplyDmWallpaper}
        onClose={() => {
          setWallpaperOpen(false);
          onClose();
        }}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card profile-modal-card"
        style={{ "--profile-outline": color.hex } as CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close profile">
          ✕
        </button>
        <ProfileCard user={user} status={status} />
        {isNotMe && (
          <div className="profile-call-actions">
            {isFriend && (
              <>
                <button
                  type="button"
                  className="ghost-btn profile-action-row"
                  onClick={() => {
                    setActiveChatId(user.id);
                    onClose();
                  }}
                >
                  <span>💬</span>
                  <span>Message</span>
                </button>
                <button
                  type="button"
                  className="ghost-btn profile-action-row"
                  onClick={() => {
                    onClose();
                    void startCall(user, "voice");
                  }}
                >
                  <Phone size={16} />
                  <span>Voice call</span>
                </button>
                <button
                  type="button"
                  className="primary-btn profile-action-row"
                  onClick={() => {
                    onClose();
                    void startCall(user, "video");
                  }}
                >
                  <Video size={16} />
                  <span>Video call</span>
                </button>
                {isMobileWallpaper && !isBlocked && (
                  <button
                    type="button"
                    className="ghost-btn profile-action-row"
                    onClick={() => setWallpaperOpen(true)}
                  >
                    <span>🖼️</span>
                    <span>Chat wallpaper</span>
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className="ghost-btn danger profile-action-row"
              disabled={blockBusy}
              onClick={() => void handleToggleBlock()}
            >
              <span>{isBlocked ? "✓" : "🚫"}</span>
              <span>{isBlocked ? "Unblock" : "Block"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
