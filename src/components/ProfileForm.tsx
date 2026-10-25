import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AVATAR_COLORS, colorById } from "../lib/colors";
import { useJaText } from "../lib/store";
import { USERNAME_REGEX, usernameLockInfo, type JaUser } from "../lib/types";
import { Avatar } from "./Avatar";

type ImageState =
  | { kind: "keep" }
  | { kind: "new"; file: File; preview: string }
  | { kind: "removed" };

/**
 * Shared by first-time onboarding ("Welcome to JaText!") and Settings.
 * Everything here can be changed at any time in Settings — except the
 * username, which can only be changed once every 14 days.
 */
export function ProfileForm({
  initial,
  submitLabel,
  onDone,
}: {
  initial: JaUser;
  submitLabel: string;
  onDone?: () => void;
}) {
  const store = useJaText();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [pronouns, setPronouns] = useState(initial.pronouns);
  const [avatarColor, setAvatarColor] = useState(initial.avatarColor || "yellow");
  const [avatar, setAvatar] = useState<ImageState>({ kind: "keep" });
  const [banner, setBanner] = useState<ImageState>({ kind: "keep" });
  const [nameStatus, setNameStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pfpInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const lock = usernameLockInfo(initial);
  const usernameLocked = lock.locked && username.trim().toLowerCase() !== initial.username;
  const color = colorById(avatarColor);

  const avatarPreview =
    avatar.kind === "new" ? avatar.preview : avatar.kind === "removed" ? undefined : initial.avatarUrl;
  const bannerPreview =
    banner.kind === "new" ? banner.preview : banner.kind === "removed" ? undefined : initial.bannerUrl;

  const previewUser: JaUser = useMemo(
    () => ({
      ...initial,
      displayName: displayName || "Your name",
      username: username || "username",
      bio,
      pronouns,
      avatarColor,
      avatarUrl: avatarPreview,
      bannerUrl: bannerPreview,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayName, username, bio, pronouns, avatarColor, avatarPreview, bannerPreview],
  );

  // live username availability check
  useEffect(() => {
    const name = username.trim().toLowerCase();
    if (!name) return setNameStatus(null);
    if (name === initial.username) return setNameStatus({ ok: true, text: "This is your current username" });
    if (!USERNAME_REGEX.test(name))
      return setNameStatus({ ok: false, text: "3–20 characters: lowercase letters, numbers, . or _" });
    setNameStatus({ ok: true, text: "Checking…" });
    const t = setTimeout(async () => {
      try {
        const res = await store.checkUsername(name);
        setNameStatus({
          ok: res.available,
          text: res.available ? `@${name} is available ✨` : res.message ?? "Already taken",
        });
      } catch {
        setNameStatus(null);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  function pickImage(file: File | undefined, set: (s: ImageState) => void) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    set({ kind: "new", file, preview: URL.createObjectURL(file) });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (usernameLocked) {
      setError(
        `Usernames can only be changed once every 14 days. You can change yours again in ${lock.daysLeft} day${lock.daysLeft === 1 ? "" : "s"}.`,
      );
      return;
    }
    setBusy(true);
    try {
      await store.saveProfile({
        displayName,
        username,
        bio,
        pronouns,
        avatarColor,
        avatarFile: avatar.kind === "new" ? avatar.file : avatar.kind === "removed" ? null : undefined,
        bannerFile: banner.kind === "new" ? banner.file : banner.kind === "removed" ? null : undefined,
      });
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    displayName.trim().length > 0 &&
    USERNAME_REGEX.test(username.trim().toLowerCase()) &&
    !usernameLocked &&
    (nameStatus?.ok ?? false) &&
    !busy;

  return (
    <form className="profile-form" onSubmit={onSubmit}>
      {/* ---------- live profile preview / uploads ---------- */}
      <div className="pf-preview">
        <div
          className="pf-banner"
          style={
            bannerPreview
              ? { backgroundImage: `url(${bannerPreview})` }
              : { background: color.gradient }
          }
          onClick={() => bannerInput.current?.click()}
          title="Click to set your banner"
        >
          <span className="pf-banner-hint">🖼️ {bannerPreview ? "Change banner" : "Add a banner"}</span>
          {bannerPreview && (
            <button
              type="button"
              className="mini-btn pf-remove-banner"
              onClick={(e) => {
                e.stopPropagation();
                setBanner({ kind: "removed" });
              }}
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={bannerInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pickImage(e.target.files?.[0], setBanner)}
        />

        <div className="pf-avatar-zone">
          <div
            className="pf-avatar-click"
            onClick={() => pfpInput.current?.click()}
            title="Click to set your profile picture"
          >
            <Avatar user={previewUser} size={96} ringWidth={4} />
            <span className="pf-avatar-edit">✏️</span>
          </div>
          <input
            ref={pfpInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => pickImage(e.target.files?.[0], setAvatar)}
          />
          <div className="pf-preview-names">
            <strong>{previewUser.displayName}</strong>
            <span className="muted">
              @{previewUser.username}
              {pronouns ? ` · ${pronouns}` : ""}
            </span>
            {bio && <span className="pf-preview-bio">{bio}</span>}
            <span className="muted small">
              This is how your profile looks when someone clicks your pfp 👆
            </span>
          </div>
          {avatarPreview && (
            <button type="button" className="mini-btn" onClick={() => setAvatar({ kind: "removed" })}>
              Remove photo
            </button>
          )}
        </div>
      </div>

      {/* ---------- fields ---------- */}
      <label>
        Display name
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Riva"
          maxLength={40}
          required
        />
      </label>

      <label>
        Username
        <div className="username-input">
          <span>@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="pick something cool"
            maxLength={20}
            required
          />
        </div>
        {nameStatus && (
          <span className={nameStatus.ok ? "hint-ok" : "hint-bad"}>{nameStatus.text}</span>
        )}
        {initial.username && lock.locked ? (
          <span className="hint-bad">
            🔒 Username locked — next change in {lock.daysLeft} day{lock.daysLeft === 1 ? "" : "s"}
            {lock.nextChangeAt
              ? ` (${new Date(lock.nextChangeAt).toLocaleDateString()})`
              : ""}
          </span>
        ) : (
          <span className="muted small">
            Choose wisely — usernames can only be changed once every 14 days.
          </span>
        )}
      </label>

      <label>
        Pronouns
        <input
          value={pronouns}
          onChange={(e) => setPronouns(e.target.value)}
          placeholder="e.g. she/her, he/him, they/them"
          maxLength={30}
        />
      </label>

      <label>
        Bio
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell people a little about you…"
          maxLength={160}
          rows={3}
        />
        <span className="muted small">{bio.length}/160</span>
      </label>

      <fieldset className="color-fieldset">
        <legend>Avatar color</legend>
        <p className="muted small">
          Your avatar color becomes the <strong>outline</strong> and{" "}
          <strong>background</strong> of your profile picture when someone views
          your profile. Pick yellow and your pfp glows yellow 💛
        </p>
        <div className="color-grid">
          {AVATAR_COLORS.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`color-choice ${avatarColor === c.id ? "selected" : ""}`}
              onClick={() => setAvatarColor(c.id)}
            >
              <span className="color-swatch" style={{ background: c.gradient, boxShadow: `0 0 0 3px ${c.hex}` }} />
              <span className="color-name">{c.name}</span>
              {c.note && <span className="color-note">{c.note}</span>}
            </button>
          ))}
        </div>
      </fieldset>

      {error && <div className="error-box">{error}</div>}

      <button className="primary-btn big" type="submit" disabled={!canSubmit}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
