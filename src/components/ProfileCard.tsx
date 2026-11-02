import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
import { unpackAvatarColorWithMeta } from "../lib/profileMetaEnvelope";
import { togglePeerVerified, useE2EESnapshot } from "../lib/e2ee/keystore";
import { normalizeAvatarSrc } from "../lib/imageUtils";
import { useJaText } from "../lib/store";
import type { ActivityStatus, JaUser } from "../lib/types";
import { AnimatedMediaImg, Avatar } from "./Avatar";
import { LockIcon } from "./E2EEModals";
import { MessageMarkdown } from "./MessageMarkdown";
import {
  ExternalArrowIcon,
  SocialBrandIcon,
  WebsiteGlobeIcon,
  getSocialPlatformMeta,
  isHandleOnlyDiscord,
} from "./SocialIcons";
import {
  BanIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  ImageIcon,
  MessageCircleIcon,
  ShieldCheckIcon,
  UnlockIcon,
  UserMinusIcon,
} from "./UiIcons";
import { WallpaperModal, type WallpaperChoice } from "./WallpaperModal";

function isSafeExternalProfileUrl(raw?: string): boolean {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatShortHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
}

function LiveUserProfileHydrator({
  userId,
  fallback,
  children,
}: {
  userId: string;
  fallback: JaUser;
  children: (resolved: JaUser) => React.ReactNode;
}) {
  const { getUserById } = useJaText();
  const [fetched, setFetched] = useState<JaUser | null>(null);
  useEffect(() => {
    let cancelled = false;
    const canQuery = Boolean(userId && !userId.startsWith("pending-") && userId.length >= 8);
    if (!canQuery || !getUserById) return;
    void getUserById(userId)
      .then((u) => {
        if (!cancelled && u) setFetched(u);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getUserById, userId]);
  const raw = fetched ?? fallback;
  const unpacked = unpackAvatarColorWithMeta(raw.avatarColor, raw.socials, raw.website);
  const resolved: JaUser = {
    ...raw,
    avatarColor: unpacked.avatarColor,
    socials: unpacked.socials,
    website: unpacked.website,
  };
  return <>{children(resolved)}</>;
}

/**
 * The card shown when you click someone's pfp or the 3-dots header menu.
 * Their avatar color drives the outline around the entire profile card,
 * the horizontal banner divider, and the outline ring around the pfp.
 */
export function ProfileCard({
  user,
  status,
  wallpaperUrl,
  liveCustomStatus,
}: {
  user: JaUser;
  status?: ActivityStatus;
  wallpaperUrl?: string | null;
  liveCustomStatus?: string;
}) {
  const unpacked = unpackAvatarColorWithMeta(user.avatarColor, user.socials, user.website);
  const color = colorById(unpacked.avatarColor);
  const bannerSrc = normalizeAvatarSrc(user.bannerUrl);
  const effectiveCustomStatus = (liveCustomStatus ?? user.customStatus ?? "").trim();
  const effectiveWallpaper = wallpaperUrl?.trim() ? wallpaperUrl.trim() : null;
  const [copiedDiscordIdx, setCopiedDiscordIdx] = useState<number | null>(null);
  const socials = unpacked.socials ?? [];
  const website =
    unpacked.website && isSafeExternalProfileUrl(unpacked.website.url)
      ? unpacked.website
      : undefined;

  return (
    <div
      className={`profile-card ${effectiveWallpaper ? "has-chat-wallpaper" : ""}`}
      style={{ "--profile-outline": color.hex } as CSSProperties}
    >
      {effectiveWallpaper && (
        <div className="profile-card-wallpaper-ambient" aria-hidden="true">
          <AnimatedMediaImg src={effectiveWallpaper} className="profile-banner-img" />
        </div>
      )}
      <div
        className="profile-banner"
        style={!bannerSrc && !effectiveWallpaper ? { background: color.gradient } : undefined}
      >
        {(bannerSrc || effectiveWallpaper) && (
          <AnimatedMediaImg
            src={bannerSrc || effectiveWallpaper}
            className="profile-banner-img"
          />
        )}
      </div>
      <div className="profile-body">
        <div className="profile-avatar-wrap profile-avatar-with-status">
          <Avatar user={user} size={86} ringWidth={3.5} status={status} />
          {effectiveCustomStatus ? (
            <div
              className="profile-pfp-status-bubble"
              role="status"
              aria-label={`Custom status: ${effectiveCustomStatus}`}
              title={effectiveCustomStatus}
            >
              <span className="profile-pfp-status-tail-sm" aria-hidden="true" />
              <span className="profile-pfp-status-tail-lg" aria-hidden="true" />
              <span className="profile-pfp-status-text">{effectiveCustomStatus}</span>
            </div>
          ) : null}
        </div>
        <div className="profile-names">
          <div className="profile-display">{user.displayName || "Unnamed"}</div>
          <div className="profile-username">
            @{user.username}
            {user.pronouns ? <span className="profile-pronouns"> · {user.pronouns}</span> : null}
          </div>
        </div>
        {user.bio ? (
          <div className="profile-bio">
            <MessageMarkdown text={user.bio} />
          </div>
        ) : null}

        {(socials.length > 0 || website) && (
          <div className="profile-links-section">
            {socials.length > 0 && (
              <div className="profile-socials-block">
                <span className="profile-links-label">Socials</span>
                <div className="profile-socials-grid">
                  {socials.map((soc, idx) => {
                    const meta = getSocialPlatformMeta(soc.platform);
                    const handleOnlyDiscord = isHandleOnlyDiscord(soc);
                    const validUrl = !handleOnlyDiscord && isSafeExternalProfileUrl(soc.url);

                    if (validUrl) {
                      return (
                        <a
                          key={`${soc.platform}-${idx}`}
                          href={soc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="profile-social-pill"
                          style={{ "--social-accent": meta.accent } as CSSProperties}
                          title={`Open ${meta.label}: ${soc.handle}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="profile-social-pill-icon" style={{ color: meta.accent }}>
                            <SocialBrandIcon platform={soc.platform} size={14} />
                          </span>
                          <span className="profile-social-pill-text">
                            <strong>{meta.label}</strong>
                            <span>{soc.handle}</span>
                          </span>
                          <ExternalArrowIcon size={12} />
                        </a>
                      );
                    }

                    return (
                      <button
                        key={`${soc.platform}-${idx}`}
                        type="button"
                        className="profile-social-pill"
                        style={{ "--social-accent": meta.accent } as CSSProperties}
                        title={`Copy ${meta.label} username: ${soc.handle}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void navigator.clipboard?.writeText(soc.handle).then(() => {
                            setCopiedDiscordIdx(idx);
                            window.setTimeout(() => setCopiedDiscordIdx(null), 1800);
                          });
                        }}
                      >
                        <span className="profile-social-pill-icon" style={{ color: meta.accent }}>
                          <SocialBrandIcon platform={soc.platform} size={14} />
                        </span>
                        <span className="profile-social-pill-text">
                          <strong>{meta.label}</strong>
                          <span>
                            {copiedDiscordIdx === idx ? "Copied username!" : soc.handle}
                          </span>
                        </span>
                        <CopyIcon size={12} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {website && (
              <div className="profile-website-block">
                <span className="profile-links-label">Website</span>
                <a
                  href={website.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="profile-website-card"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="profile-website-icon">
                    <WebsiteGlobeIcon size={16} />
                  </span>
                  <span className="profile-website-info">
                    <strong>{website.title}</strong>
                    <span>{formatShortHostname(website.url)}</span>
                  </span>
                  <ExternalArrowIcon size={13} />
                </a>
              </div>
            )}
          </div>
        )}

        <div className="profile-color-row">
          <span className="color-dot" style={{ background: color.hex }} />
          Avatar color: <strong>{color.name}</strong>
          {color.note ? <span className="muted"> · {color.note}</span> : null}
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
  const e2ee = useE2EESnapshot();
  const isMobileWallpaper = useIsMobileWallpaperSupported();
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showRawKey, setShowRawKey] = useState(false);
  const [copiedE2ee, setCopiedE2ee] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const peerKey = me && me.id !== user.id ? e2ee.peerKeys[user.id] : undefined;
  const isVerifiedPeer = Boolean(peerKey && peerKey.verifiedKeyId === peerKey.bundle.keyId);
  const safetyBlocks = peerKey?.safetyNumber ? peerKey.safetyNumber.split(" ") : [];

  async function handleVerifySecurityCode() {
    if (!peerKey || verifyBusy) return;
    setVerifyBusy(true);
    try {
      if (store.verifyFriendSecurityCode) {
        await store.verifyFriendSecurityCode(user.id, !isVerifiedPeer);
      } else {
        await togglePeerVerified(user.id);
      }
    } finally {
      setVerifyBusy(false);
    }
  }

  function animateClose() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 185);
  }

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
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onClick={animateClose}
    >
      <div
        className={`modal-card profile-modal-card ${closing ? "is-closing" : ""}`}
        style={{ "--profile-outline": color.hex } as CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close animated-x-btn"
          onClick={animateClose}
          aria-label="Close profile"
        >
          <CloseIcon size={17} />
        </button>
        <div className="profile-modal-scroll">
          {store.mode !== "demo" ? (
            <LiveUserProfileHydrator
              userId={user.id}
              fallback={
                me?.id === user.id
                  ? me
                  : friends.find((f) => f.id === user.id) ?? user
              }
            >
              {(resolvedUser) => (
                <ProfileCard
                  user={resolvedUser}
                  status={
                    status ??
                    store.friendActivities.find((a) => a.userId === user.id)?.status
                  }
                  wallpaperUrl={currentDmWallpaperUrl}
                  liveCustomStatus={
                    me?.id === user.id
                      ? me.customStatus
                      : store.friendActivities.find((a) => a.userId === user.id)?.customStatus
                  }
                />
              )}
            </LiveUserProfileHydrator>
          ) : (
            <ProfileCard
              user={
                me?.id === user.id
                  ? me
                  : friends.find((f) => f.id === user.id) ?? user
              }
              status={
                status ??
                store.friendActivities.find((a) => a.userId === user.id)?.status
              }
              wallpaperUrl={currentDmWallpaperUrl}
              liveCustomStatus={
                me?.id === user.id
                  ? me.customStatus
                  : store.friendActivities.find((a) => a.userId === user.id)?.customStatus
              }
            />
          )}

          <section className="profile-e2ee-section" aria-label="End-to-End Encryption">
            <div className="profile-e2ee-header">
              <span className="profile-e2ee-title">
                <LockIcon size={14} />
                <strong>Encryption</strong>
              </span>
              {!isNotMe ? (
                <span className="e2ee-pill active">
                  {e2ee.ready ? "Encrypted · Synced" : "Initializing…"}
                </span>
              ) : peerKey ? (
                <span className={`e2ee-pill ${isVerifiedPeer ? "verified" : "active"}`}>
                  {isVerifiedPeer ? (
                    <>
                      <CheckIcon size={12} /> Encrypted &amp; Verified
                    </>
                  ) : (
                    "Encrypted"
                  )}
                </span>
              ) : (
                <span className="e2ee-pill pending">Setting up…</span>
              )}
            </div>

            {!isNotMe ? (
              e2ee.myFingerprint ? (
                <>
                  <p className="muted small" style={{ margin: "2px 0 4px" }}>
                    Your end-to-end encryption keys sync automatically across your logged-in devices.
                  </p>
                  <div className="profile-e2ee-compact-key">
                    <span className="profile-e2ee-sub">
                      ID <code>{e2ee.myKeyId}</code>
                    </span>
                    <code className="e2ee-fingerprint-code compact">{e2ee.myFingerprint}</code>
                  </div>
                  {showRawKey && e2ee.myDhPubB64 && (
                    <div className="profile-e2ee-raw">
                      <span className="muted small">ECDH P-256 Public Key:</span>
                      <code>{e2ee.myDhPubB64}</code>
                      {e2ee.mySigPubB64 && (
                        <>
                          <span className="muted small">ECDSA P-256 Signing Key:</span>
                          <code>{e2ee.mySigPubB64}</code>
                        </>
                      )}
                    </div>
                  )}
                  <div className="profile-e2ee-btn-row">
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `JaText E2EE Key (@${user.username} · ${e2ee.myKeyId})\nFingerprint: ${e2ee.myFingerprint}\nECDH-P256: ${e2ee.myDhPubB64 ?? ""}\nECDSA-P256: ${e2ee.mySigPubB64 ?? ""}`,
                        );
                        setCopiedE2ee(true);
                        window.setTimeout(() => setCopiedE2ee(false), 1800);
                      }}
                    >
                      {copiedE2ee ? (
                        <>
                          <CheckIcon size={12} /> Copied
                        </>
                      ) : (
                        <>
                          <CopyIcon size={12} /> Copy key
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => setShowRawKey((v) => !v)}
                    >
                      {showRawKey ? "Hide details" : "Details"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted small">Setting up your encryption key…</p>
              )
            ) : peerKey ? (
              <>
                <p className="muted small" style={{ margin: "2px 0 6px" }}>
                  {isVerifiedPeer
                    ? `Messages and calls in this chat are end-to-end encrypted and verified with @${user.username}.`
                    : `Messages and calls are end-to-end encrypted. Tap below to verify your security code with @${user.username}.`}
                </p>

                {showRawKey && safetyBlocks.length > 0 && (
                  <div className="profile-e2ee-details-drawer">
                    <div className="profile-safety-wrap">
                      <span className="muted small">60-Digit Security Code</span>
                      <div className="profile-safety-grid">
                        {safetyBlocks.map((block, idx) => (
                          <span key={idx}>{block}</span>
                        ))}
                      </div>
                    </div>
                    <div className="profile-e2ee-compact-key" style={{ marginTop: 6 }}>
                      <span className="profile-e2ee-sub">
                        Key ID <code>{peerKey.bundle.keyId}</code>
                      </span>
                      <code className="e2ee-fingerprint-code compact">{peerKey.fingerprint}</code>
                    </div>
                  </div>
                )}

                <div className="profile-e2ee-btn-row">
                  <button
                    type="button"
                    className={`mini-btn ${isVerifiedPeer ? "verified-btn" : "verify-primary-btn"}`}
                    disabled={verifyBusy}
                    onClick={() => void handleVerifySecurityCode()}
                  >
                    {verifyBusy ? (
                      "Verifying…"
                    ) : isVerifiedPeer ? (
                      <>
                        <CheckIcon size={13} /> Encrypted &amp; Verified
                      </>
                    ) : (
                      <>
                        <ShieldCheckIcon size={13} /> Verify security code
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => setShowRawKey((v) => !v)}
                  >
                    {showRawKey ? "Hide code" : "View code"}
                  </button>
                  {showRawKey && (
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `JaText Security Code (@${user.username})\n${peerKey.safetyNumber}\nFingerprint: ${peerKey.fingerprint}`,
                        );
                        setCopiedE2ee(true);
                        window.setTimeout(() => setCopiedE2ee(false), 1800);
                      }}
                    >
                      {copiedE2ee ? (
                        <>
                          <CheckIcon size={12} /> Copied
                        </>
                      ) : (
                        <>
                          <CopyIcon size={12} /> Copy
                        </>
                      )}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="muted small profile-e2ee-wait">
                Messages and calls are end-to-end encrypted once @{user.username} comes online.
              </p>
            )}
          </section>

          {!isNotMe && me && (
            <div className="profile-call-actions">
              <button
                type="button"
                className="primary-btn profile-action-row"
                onClick={() => {
                  setActiveChatId(me.id);
                  animateClose();
                }}
              >
                <MessageCircleIcon size={16} />
                <span>Message yourself</span>
              </button>
            </div>
          )}

          {isNotMe && (
            <div className="profile-call-actions">
              {isFriend && (
                <>
                  <button
                    type="button"
                    className="ghost-btn profile-action-row"
                    onClick={() => {
                      setActiveChatId(user.id);
                      animateClose();
                    }}
                  >
                    <MessageCircleIcon size={16} />
                    <span>Message</span>
                  </button>
                  <button
                    type="button"
                    className="ghost-btn profile-action-row"
                    onClick={() => {
                      animateClose();
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
                      animateClose();
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
                      <ImageIcon size={16} />
                      <span>Chat wallpaper</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost-btn danger profile-action-row"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Unfriend ${user.displayName} (@${user.username})? You will need to send a friend request again to chat.`,
                        )
                      ) {
                        void store.removeFriend(user.id);
                        animateClose();
                      }
                    }}
                  >
                    <UserMinusIcon size={16} />
                    <span>Unfriend</span>
                  </button>
                </>
              )}
              <button
                type="button"
                className="ghost-btn danger profile-action-row"
                disabled={blockBusy}
                onClick={() => void handleToggleBlock()}
              >
                {isBlocked ? <UnlockIcon size={16} /> : <BanIcon size={16} />}
                <span>{isBlocked ? "Unblock" : "Block"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
