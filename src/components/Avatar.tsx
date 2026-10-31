import { memo, useState, type CSSProperties } from "react";
import { colorById } from "../lib/colors";
import {
  normalizeAvatarSrc,
  resolveFallbackAvatarBlobUrl,
  useAnimatedMediaSrc,
} from "../lib/imageUtils";
import type { ActivityStatus, JaUser } from "../lib/types";

/**
 * Reusable image element for Group PFPs, Profile Banners, and Chat Wallpapers
 * that preserves animated looping GIFs (including > 4 MB chunked /api/media GIFs
 * and NETSCAPE2.0 infinite loop patching) with automatic blob fallback recovery.
 */
export const AnimatedMediaImg = memo(function AnimatedMediaImg({
  src,
  alt = "",
  className,
  style,
  loading,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  loading?: "lazy" | "eager";
}) {
  const normalizedUrl = normalizeAvatarSrc(src);
  const animatedSrc = useAnimatedMediaSrc(normalizedUrl);
  const [fallbackBlob, setFallbackBlob] = useState<{
    sourceUrl: string;
    blobUrl: string | null;
    failed: boolean;
  } | null>(null);

  const currentFallback =
    normalizedUrl && fallbackBlob?.sourceUrl === normalizedUrl ? fallbackBlob : null;
  const activeSrc = currentFallback?.failed
    ? undefined
    : (currentFallback?.blobUrl ?? animatedSrc);

  if (!activeSrc) return null;

  return (
    <img
      src={activeSrc}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={() => {
        if (!normalizedUrl) return;
        if (currentFallback?.blobUrl) {
          setFallbackBlob({ sourceUrl: normalizedUrl, blobUrl: null, failed: true });
          return;
        }
        void resolveFallbackAvatarBlobUrl(normalizedUrl).then((recovered) => {
          if (recovered) {
            setFallbackBlob({ sourceUrl: normalizedUrl, blobUrl: recovered, failed: false });
          } else {
            setFallbackBlob({ sourceUrl: normalizedUrl, blobUrl: null, failed: true });
          }
        });
      }}
    />
  );
});

/**
 * The JaText avatar: a circle pfp where the user's chosen avatar color
 * becomes the outline ring AND the background behind the picture.
 * Includes mobile-safe referrer handling, animated GIF infinite-loop support,
 * automatic blob MIME recovery, and clean initial-letter fallback.
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
  const animatedUrl = useAnimatedMediaSrc(normalizedUrl);

  const [recovery, setRecovery] = useState<{
    sourceUrl: string;
    blobUrl: string | null;
    failed: boolean;
  } | null>(null);

  const currentRecovery =
    normalizedUrl && recovery?.sourceUrl === normalizedUrl ? recovery : null;
  const activeImgSrc = currentRecovery?.failed
    ? undefined
    : (currentRecovery?.blobUrl ?? animatedUrl);

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
