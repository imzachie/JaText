import { memo, useState } from "react";
import { colorById } from "../lib/colors";
import { normalizeAvatarSrc, resolveFallbackAvatarBlobUrl } from "../lib/imageUtils";
import type { ActivityStatus, JaUser } from "../lib/types";

/**
 * The JaText avatar: a circle pfp where the user's chosen avatar color
 * becomes the outline ring AND the background behind the picture.
 * Includes mobile-safe referrer handling, automatic blob MIME recovery,
 * and clean initial-letter fallback so broken images never print raw alt text.
 */
export const Avatar = memo(function Avatar({
  user,
  size = 44,
  onClick,
  ringWidth = 3,
  status,
}: {
  user: Pick<JaUser, "displayName" | "username" | "avatarColor" | "avatarUrl">;
  size?: number;
  onClick?: (e: React.MouseEvent) => void;
  ringWidth?: number;
  status?: ActivityStatus;
}) {
  const color = colorById(user.avatarColor);
  const name = user.displayName || user.username || "?";
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  const normalizedUrl = normalizeAvatarSrc(user.avatarUrl);

  const [recovery, setRecovery] = useState<{
    sourceUrl: string;
    blobUrl: string | null;
    failed: boolean;
  } | null>(null);

  const currentRecovery =
    normalizedUrl && recovery?.sourceUrl === normalizedUrl ? recovery : null;
  const activeImgSrc = currentRecovery?.failed
    ? undefined
    : (currentRecovery?.blobUrl ?? normalizedUrl);

  function handleImgError() {
    if (!normalizedUrl) return;
    if (currentRecovery?.blobUrl) {
      setRecovery({ sourceUrl: normalizedUrl, blobUrl: null, failed: true });
      return;
    }
    void resolveFallbackAvatarBlobUrl(normalizedUrl).then((recovered) => {
      if (recovered) {
        setRecovery({ sourceUrl: normalizedUrl, blobUrl: recovered, failed: false });
      } else {
        setRecovery({ sourceUrl: normalizedUrl, blobUrl: null, failed: true });
      }
    });
  }

  return (
    <span className="avatar-wrap" style={{ width: size, height: size }}>
      <button
        type="button"
        className="avatar"
        onClick={onClick}
        aria-label={onClick ? `View @${user.username || name}'s profile` : name}
        title={onClick ? `View @${user.username}'s profile` : undefined}
        style={{
          width: size,
          height: size,
          background: color.gradient,
          boxShadow: `0 0 0 ${ringWidth}px ${color.hex}`,
          cursor: onClick ? "pointer" : "default",
          fontSize: size * 0.42,
        }}
      >
        {activeImgSrc ? (
          <img
            src={activeImgSrc}
            alt=""
            referrerPolicy="no-referrer"
            decoding="async"
            loading="lazy"
            onError={handleImgError}
          />
        ) : (
          <span>{initial}</span>
        )}
      </button>
      {status && <span className={`activity-dot status-${status}`} title={status} />}
    </span>
  );
});
