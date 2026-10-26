import { Phone, Video } from "./CallIcons";
import { useCall } from "../lib/calling";
import { colorById } from "../lib/colors";
import { useJaText } from "../lib/store";
import type { ActivityStatus, JaUser } from "../lib/types";
import { Avatar } from "./Avatar";

/**
 * The card shown when you click someone's pfp.
 * Their avatar color drives the outline around the pfp and the
 * background color behind it.
 */
export function ProfileCard({
  user,
  status,
}: {
  user: JaUser;
  status?: ActivityStatus;
}) {
  const color = colorById(user.avatarColor);
  return (
    <div className="profile-card">
      <div
        className="profile-banner"
        style={
          user.bannerUrl
            ? { backgroundImage: `url(${user.bannerUrl})` }
            : { background: color.gradient }
        }
      />
      <div className="profile-body">
        <div
          className="profile-avatar-wrap"
          style={{ background: color.soft, boxShadow: `0 0 0 4px var(--panel)` }}
        >
          <Avatar user={user} size={84} ringWidth={4} status={status} />
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
  const { me, friends, setActiveChatId } = useJaText();
  const { startCall } = useCall();
  const isFriend = Boolean(me && me.id !== user.id && friends.some((f) => f.id === user.id));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close profile">
          ✕
        </button>
        <ProfileCard user={user} status={status} />
        {isFriend && (
          <div className="profile-call-actions">
            <button
              type="button"
              className="ghost-btn profile-action-pill"
              onClick={() => {
                setActiveChatId(user.id);
                onClose();
              }}
            >
              💬 Message
            </button>
            <button
              type="button"
              className="ghost-btn profile-action-pill"
              onClick={() => {
                onClose();
                void startCall(user, "voice");
              }}
            >
              <Phone size={15} /> Voice call
            </button>
            <button
              type="button"
              className="primary-btn profile-action-pill"
              onClick={() => {
                onClose();
                void startCall(user, "video");
              }}
            >
              <Video size={15} /> Video call
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
