import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { AVATAR_COLORS, colorById } from "../lib/colors";
import {
  ensureInfiniteLoopGifFile,
  ensureValidFileMime,
  isAnimatedOrGifFile,
} from "../lib/imageUtils";
import { useJaText } from "../lib/store";
import {
  USERNAME_REGEX,
  usernameLockInfo,
  type JaUser,
  type UserSocialLink,
} from "../lib/types";
import { AnimatedMediaImg, Avatar } from "./Avatar";
import { MessageMarkdown } from "./MessageMarkdown";
import {
  SOCIAL_PLATFORMS,
  SocialBrandIcon,
  WebsiteGlobeIcon,
  getSocialPlatformMeta,
} from "./SocialIcons";
import { CloseIcon, EditIcon, ImageIcon, LockClosedIcon, PlusIcon } from "./UiIcons";

type ImageState =
  | { kind: "keep" }
  | { kind: "new"; file: File; preview: string }
  | { kind: "removed" };

/**
 * Shared by first-time onboarding ("Welcome to JaText!") and Settings.
 * Everything here can be changed at any time in Settings, except the
 * username, which can only be changed once every 14 days.
 */
export function ProfileForm({
  initial,
  submitLabel,
  sectionMode = "full",
  onDone,
}: {
  initial: JaUser;
  submitLabel: ReactNode;
  sectionMode?: "full" | "profile" | "socials";
  onDone?: () => void;
}) {
  const store = useJaText();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [pronouns, setPronouns] = useState(initial.pronouns);
  const [avatarColor, setAvatarColor] = useState(initial.avatarColor || "yellow");
  const [socials, setSocials] = useState<UserSocialLink[]>(initial.socials ?? []);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("discord");
  const [customPlatformName, setCustomPlatformName] = useState<string>("");
  const [socialInput, setSocialInput] = useState<string>("");
  const [websiteTitle, setWebsiteTitle] = useState<string>(initial.website?.title ?? "");
  const [websiteUrl, setWebsiteUrl] = useState<string>(initial.website?.url ?? "");
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

  const previewWebsite = useMemo(() => {
    const cleanUrl = websiteUrl.trim();
    const cleanTitle = websiteTitle.trim();
    if (!cleanUrl && !cleanTitle) return undefined;
    const normalizedUrl = cleanUrl
      ? /^[a-z][a-z0-9+.-]*:/i.test(cleanUrl)
        ? cleanUrl
        : `https://${cleanUrl}`
      : "";
    return {
      title: cleanTitle || cleanUrl || "Website",
      url: normalizedUrl,
    };
  }, [websiteTitle, websiteUrl]);

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
      socials,
      website: previewWebsite,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      displayName,
      username,
      bio,
      pronouns,
      avatarColor,
      avatarPreview,
      bannerPreview,
      socials,
      previewWebsite,
    ],
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
          text: res.available ? `@${name} is available` : res.message ?? "Already taken",
        });
      } catch {
        setNameStatus(null);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  async function pickImage(rawFile: File | undefined, set: (s: ImageState) => void) {
    if (!rawFile) return;
    const isGif = await isAnimatedOrGifFile(rawFile);
    const file = isGif
      ? await ensureInfiniteLoopGifFile(rawFile)
      : await ensureValidFileMime(rawFile);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image or GIF file.");
      return;
    }
    set({ kind: "new", file, preview: URL.createObjectURL(file) });
  }

  function handleAddSocial() {
    setError(null);
    const raw = socialInput.trim();
    if (!raw) return;
    const spec =
      SOCIAL_PLATFORMS.find((p) => p.id === selectedPlatform) ?? SOCIAL_PLATFORMS[0];
    const platformKey =
      spec.id === "other"
        ? (customPlatformName.trim() || "Social").slice(0, 32)
        : spec.id;
    const built = spec.buildUrl(raw);
    try {
      const parsed = new URL(built.url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError("Social URL must start with http:// or https://");
        return;
      }
    } catch {
      setError("Please enter a valid handle or profile URL.");
      return;
    }
    setSocials((prev) => {
      const filtered = prev.filter(
        (item) => item.platform.toLowerCase() !== platformKey.toLowerCase(),
      );
      return [
        ...filtered,
        {
          platform: platformKey,
          handle: built.handle.slice(0, 100),
          url: built.url.slice(0, 300),
        },
      ].slice(0, 16);
    });
    setSocialInput("");
    if (spec.id === "other") setCustomPlatformName("");
  }

  function handleRemoveSocial(index: number) {
    setSocials((prev) => prev.filter((_, i) => i !== index));
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

    // If user typed a social in the input box and hit Save directly without clicking Connect, include it!
    let finalSocials = socials;
    if (socialInput.trim()) {
      const spec =
        SOCIAL_PLATFORMS.find((p) => p.id === selectedPlatform) ?? SOCIAL_PLATFORMS[0];
      const platformKey =
        spec.id === "other"
          ? (customPlatformName.trim() || "Social").slice(0, 32)
          : spec.id;
      const built = spec.buildUrl(socialInput.trim());
      try {
        const parsed = new URL(built.url);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          finalSocials = [
            ...socials.filter(
              (item) => item.platform.toLowerCase() !== platformKey.toLowerCase(),
            ),
            {
              platform: platformKey,
              handle: built.handle.slice(0, 100),
              url: built.url.slice(0, 300),
            },
          ].slice(0, 16);
        }
      } catch {
        setError("Enter a valid social account handle or URL.");
        return;
      }
    }

    let finalWebsite: { title: string; url: string } | null = null;
    if (websiteUrl.trim() || websiteTitle.trim()) {
      if (!websiteUrl.trim()) {
        setError("Enter a URL for your website (for example, https://example.com).");
        return;
      }
      const candidateUrl = /^[a-z][a-z0-9+.-]*:/i.test(websiteUrl.trim())
        ? websiteUrl.trim()
        : `https://${websiteUrl.trim()}`;
      try {
        const parsed = new URL(candidateUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          setError("Website URL must start with http:// or https://");
          return;
        }
        const hostFallback = parsed.hostname.replace(/^www\./, "") || "Website";
        finalWebsite = {
          title: (websiteTitle.trim() || hostFallback).slice(0, 60),
          url: parsed.toString().slice(0, 300),
        };
      } catch {
        setError("Enter a valid website URL (for example, https://example.com).");
        return;
      }
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
        socials: finalSocials,
        website: finalWebsite,
      });
      setSocialInput("");
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
      {/* ---------- live profile preview / uploads (Profile & Onboarding only) ---------- */}
      {sectionMode !== "socials" && (
        <>
          <div
            className="pf-preview"
            style={{ "--profile-outline": color.hex } as CSSProperties}
          >
            <div
              className="pf-banner"
              style={!bannerPreview ? { background: color.gradient } : undefined}
              onClick={() => bannerInput.current?.click()}
              title="Click to set your banner"
            >
              {bannerPreview && (
                <AnimatedMediaImg src={bannerPreview} className="profile-banner-img" />
              )}
              <span className="pf-banner-hint">
                <ImageIcon size={14} /> {bannerPreview ? "Change banner" : "Add a banner"}
              </span>
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
              accept="image/*,.gif"
              hidden
              onChange={(e) => {
                void pickImage(e.target.files?.[0], setBanner);
                e.target.value = "";
              }}
            />

            <div className="pf-avatar-zone">
              <div
                className="pf-avatar-click"
                onClick={() => pfpInput.current?.click()}
                title="Click to set your profile picture"
              >
                <Avatar user={previewUser} size={96} ringWidth={4} />
                <span className="pf-avatar-edit">
                  <EditIcon size={14} />
                </span>
              </div>
              <input
                ref={pfpInput}
                type="file"
                accept="image/*,.gif"
                hidden
                onChange={(e) => {
                  void pickImage(e.target.files?.[0], setAvatar);
                  e.target.value = "";
                }}
              />
              <div className="pf-preview-names">
                <strong>{previewUser.displayName}</strong>
                <span className="muted">
                  @{previewUser.username}
                  {pronouns ? ` · ${pronouns}` : ""}
                </span>
                {bio && <MessageMarkdown text={bio} className="pf-preview-bio" />}
                <span className="muted small">
                  This is how your profile looks when someone clicks your profile picture
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
                <LockClosedIcon size={13} /> Username locked · next change in {lock.daysLeft} day
                {lock.daysLeft === 1 ? "" : "s"}
                {lock.nextChangeAt
                  ? ` (${new Date(lock.nextChangeAt).toLocaleDateString()})`
                  : ""}
              </span>
            ) : (
              <span className="muted small">
                Choose wisely: usernames can only be changed once every 14 days.
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
              Your avatar color outlines your <strong>profile card</strong>,{" "}
              <strong>banner</strong>, and <strong>profile picture</strong> when
              someone views your profile. Pick blue or yellow and your whole card
              gets that outline.
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
        </>
      )}

      {sectionMode !== "profile" && (
        <>
          <fieldset className="color-fieldset socials-fieldset">
            <legend>Socials</legend>
            <p className="muted small">
              Connect your Discord, YouTube, X, and other social accounts. Anyone viewing your profile picture can click your connected socials.
            </p>

            {socials.length > 0 && (
              <div className="connected-socials-list">
                {socials.map((soc, idx) => {
                  const meta = getSocialPlatformMeta(soc.platform);
                  return (
                    <div
                      key={`${soc.platform}-${idx}`}
                      className="connected-social-item"
                      style={{ "--social-accent": meta.accent } as CSSProperties}
                    >
                      <span className="connected-social-icon" style={{ color: meta.accent }}>
                        <SocialBrandIcon platform={soc.platform} size={16} />
                      </span>
                      <div className="connected-social-info">
                        <strong>{meta.label}</strong>
                        <span>{soc.handle}</span>
                      </div>
                      <button
                        type="button"
                        className="icon-btn connected-social-remove"
                        aria-label={`Remove ${meta.label}`}
                        title="Disconnect"
                        onClick={() => handleRemoveSocial(idx)}
                      >
                        <CloseIcon size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="social-platform-chips" role="group" aria-label="Choose social platform">
              {SOCIAL_PLATFORMS.map((plat) => {
                const active = selectedPlatform === plat.id;
                return (
                  <button
                    type="button"
                    key={plat.id}
                    className={`social-platform-chip ${active ? "active" : ""}`}
                    style={{ "--social-accent": plat.accent } as CSSProperties}
                    onClick={() => setSelectedPlatform(plat.id)}
                  >
                    <span style={{ color: plat.accent, display: "inline-flex" }}>
                      <SocialBrandIcon platform={plat.id} size={14} />
                    </span>
                    <span>{plat.label}</span>
                  </button>
                );
              })}
            </div>

            {selectedPlatform === "other" && (
              <input
                type="text"
                value={customPlatformName}
                onChange={(e) => setCustomPlatformName(e.target.value)}
                placeholder="Platform name (e.g. SoundCloud, Behance, Threads)"
                maxLength={32}
              />
            )}

            <div className="social-connect-row">
              <input
                type="text"
                value={socialInput}
                onChange={(e) => setSocialInput(e.target.value)}
                placeholder={
                  SOCIAL_PLATFORMS.find((p) => p.id === selectedPlatform)?.placeholder ??
                  "Username or profile URL"
                }
                maxLength={260}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSocial();
                  }
                }}
              />
              <button
                type="button"
                className="ghost-btn social-connect-btn"
                disabled={!socialInput.trim()}
                onClick={handleAddSocial}
              >
                <PlusIcon size={15} />
                <span>Connect</span>
              </button>
            </div>
          </fieldset>

          <fieldset className="color-fieldset website-fieldset">
            <legend>Website</legend>
            <p className="muted small">
              Add a website title and URL. It appears right underneath your socials on your profile card.
            </p>
            <div className="website-inputs-grid">
              <label className="website-field-label">
                <span>Title</span>
                <input
                  type="text"
                  value={websiteTitle}
                  onChange={(e) => setWebsiteTitle(e.target.value)}
                  placeholder="e.g. Portfolio, My Channel, Blog"
                  maxLength={60}
                />
              </label>
              <label className="website-field-label">
                <span>URL</span>
                <div className="website-url-input-wrap">
                  <WebsiteGlobeIcon size={15} />
                  <input
                    type="text"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://example.com"
                    maxLength={300}
                  />
                </div>
              </label>
            </div>
            {(websiteTitle || websiteUrl) && (
              <button
                type="button"
                className="mini-btn"
                style={{ justifySelf: "start" }}
                onClick={() => {
                  setWebsiteTitle("");
                  setWebsiteUrl("");
                }}
              >
                Clear website
              </button>
            )}
          </fieldset>
        </>
      )}

      {error && <div className="error-box">{error}</div>}

      <button className="primary-btn big" type="submit" disabled={!canSubmit}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
