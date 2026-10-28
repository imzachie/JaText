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
import { togglePeerVerified, useE2EESnapshot } from "../lib/e2ee/keystore";
import { normalizeAvatarSrc } from "../lib/imageUtils";
import { useJaText } from "../lib/store";
import type { ActivityStatus, JaUser } from "../lib/types";
import { Avatar } from "./Avatar";
import { LockIcon } from "./E2EEModals";
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
          <ProfileCard user={user} status={status} />

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
