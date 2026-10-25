import { colorById } from "../lib/colors";
import type { JaUser } from "../lib/types";

/**
 * The JaText avatar: a circle pfp where the user's chosen avatar color
 * becomes the outline ring AND the background behind the picture.
 * e.g. Yellow -> yellow outline + yellow-tinted background.
 */
export function Avatar({
  user,
  size = 44,
  onClick,
  ringWidth = 3,
}: {
  user: Pick<JaUser, "displayName" | "username" | "avatarColor" | "avatarUrl">;
  size?: number;
  onClick?: (e: React.MouseEvent) => void;
  ringWidth?: number;
}) {
  const color = colorById(user.avatarColor);
  const name = user.displayName || user.username || "?";
  return (
    <button
      type="button"
      className="avatar"
      onClick={onClick}
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
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={name} />
      ) : (
        <span>{name.slice(0, 1).toUpperCase()}</span>
      )}
    </button>
  );
}
