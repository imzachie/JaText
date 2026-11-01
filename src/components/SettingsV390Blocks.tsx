import { useEffect, useMemo, useRef, useState } from "react";
import { friendlyError } from "../lib/errors";
import { APP_LANGUAGES, useI18n } from "../lib/i18n";
import { buildQrSvgPath } from "../lib/qrCodeSvg";
import {
  MAX_SOUNDBOARD_BYTES,
  MAX_SOUNDBOARD_DURATION_MS,
  beginTotpSetupRpc,
  confirmTotpSetupRpc,
  createCustomSoundboard,
  disableTotpRpc,
  fetchBlockedUsersList,
  fetchSecuritySettings,
  isWebAuthnSupported,
  playAudioUrlPreview,
  refreshCustomSoundboards,
  registerPasskeyInBrowser,
  removeCustomSoundboard,
  removePasskeyRpc,
  useCustomSoundboards,
  type SecuritySettingsState,
} from "../lib/securityClient";
import { useJaText } from "../lib/store";
import type { JaUser } from "../lib/types";
import { Avatar } from "./Avatar";
import {
  BanIcon,
  CheckIcon,
  CopyIcon,
  KeyIcon,
  PlayIcon,
  PlusIcon,
  ShieldCheckIcon,
  SoundWaveIcon,
  TrashIcon,
  UnlockIcon,
} from "./UiIcons";

/* ==================== 1. PROFILE -> BLOCKED USERS ==================== */

export function BlockedUsersSettingsBlock() {
  const store = useJaText();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<Array<JaUser & { blockedAt?: number }>>([]);

  async function loadBlockedList() {
    setLoading(true);
    setError(null);
    try {
      const serverUsers = await fetchBlockedUsersList();
      if (serverUsers.length > 0) {
        setBlockedUsers(serverUsers);
      } else {
        // Fallback for demo mode
        const fallback = store.friends.filter((f) => store.blockedUserIds.includes(f.id));
        setBlockedUsers(fallback);
      }
    } catch (err) {
      const fallback = store.friends.filter((f) => store.blockedUserIds.includes(f.id));
      if (fallback.length > 0) {
        setBlockedUsers(fallback);
      } else {
        setError(friendlyError(err, "Could not load blocked users."));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleUnblock(userId: string) {
    try {
      await store.setUserBlocked(userId, false);
      setBlockedUsers((cur) => cur.filter((u) => u.id !== userId));
    } catch (err) {
      setError(friendlyError(err, "Could not unblock user."));
    }
  }

  return (
    <div className="settings-inline-legal-card" style={{ marginTop: 18 }}>
      <h4 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px" }}>
        <BanIcon size={16} />
        <span>{t("blocked_users")}</span>
      </h4>
      <p className="muted small" style={{ margin: "0 0 10px" }}>
        Manage accounts you have blocked from messaging or calling you.
      </p>
      <button
        type="button"
        className="ghost-btn"
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          if (next) void loadBlockedList();
        }}
      >
        {t("see_blocked_users")}
      </button>

      {expanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {loading && <p className="muted small">Loading blocked users…</p>}
          {error && <div className="error-box">{error}</div>}
          {!loading && !error && blockedUsers.length === 0 && (
            <p className="muted small">{t("no_blocked_users")}</p>
          )}
          {blockedUsers.map((user) => (
            <div key={user.id} className="blocked-user-row">
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Avatar user={user} size={36} />
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <strong style={{ fontSize: 13.5 }}>{user.displayName}</strong>
                  <span className="muted small">@{user.username}</span>
                </div>
              </div>
              <button
                type="button"
                className="mini-btn"
                onClick={() => void handleUnblock(user.id)}
              >
                <UnlockIcon size={13} /> {t("unblock")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================== 2. APPEARANCE -> LANGUAGES ==================== */

export function LanguagesSettingsBlock() {
  const { language, setLanguage, t } = useI18n();

  return (
    <div className="appearance-colour-card" style={{ marginTop: 14 }}>
      <div className="appearance-colour-head">
        <div>
          <strong>{t("languages")}</strong>
          <p className="muted small">
            Choose your preferred display language across JaText.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
          gap: 8,
          marginTop: 10,
        }}
        role="radiogroup"
        aria-label={t("languages")}
      >
        {APP_LANGUAGES.map((opt) => {
          const active = language === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              role="radio"
              aria-checked={active}
              className="soundboard-row"
              style={{
                cursor: "pointer",
                textAlign: "left",
                borderColor: active ? "var(--accent)" : undefined,
                background: active
                  ? "color-mix(in srgb, var(--accent) 16%, var(--panel-2))"
                  : undefined,
              }}
              onClick={() => setLanguage(opt.code)}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 18 }} aria-hidden="true">
                  {opt.flag}
                </span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <strong style={{ fontSize: 13 }}>{opt.nativeName}</strong>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {opt.englishName}
                  </span>
                </span>
              </span>
              {active && <CheckIcon size={15} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ==================== 3. ALERTS & AUDIO -> SOUNDBOARDS ==================== */

export function SoundboardsSettingsBlock() {
  const { t } = useI18n();
  const clips = useCustomSoundboards();
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshCustomSoundboards().catch(() => undefined);
  }, []);

  async function handlePickAudioFile(file: File | null) {
    if (!file) return;
    setError(null);
    setNotice(null);
    const clipName =
      nameDraft.trim() || file.name.replace(/\.[^.]+$/, "").slice(0, 32) || "Custom Sound";
    if (file.size > MAX_SOUNDBOARD_BYTES) {
      setError("Audio file must be 10 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      await createCustomSoundboard(clipName, file);
      setNameDraft("");
      setNotice(`Added "${clipName}" to your call soundboard!`);
      window.setTimeout(() => setNotice(null), 2600);
    } catch (err) {
      setError(
        friendlyError(
          err,
          `Could not add soundboard clip (max 10 MB and ${MAX_SOUNDBOARD_DURATION_MS / 1000}s).`,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteClip(clipId: string) {
    setError(null);
    try {
      await removeCustomSoundboard(clipId);
    } catch (err) {
      setError(friendlyError(err, "Could not delete soundboard clip."));
    }
  }

  return (
    <div className="settings-inline-legal-card" style={{ marginTop: 16 }}>
      <h4 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px" }}>
        <SoundWaveIcon size={16} />
        <span>{t("soundboards")}</span>
      </h4>
      <p className="muted small" style={{ margin: "0 0 12px" }}>
        Add custom named audio clips to trigger in voice &amp; video calls. Maximum file size:{" "}
        <strong>10 MB</strong> · Maximum duration: <strong>10 seconds</strong>.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input
          value={nameDraft}
          maxLength={40}
          placeholder="Sound name (e.g. Airhorn, Victory)"
          style={{ flex: "1 1 200px" }}
          onChange={(e) => setNameDraft(e.target.value)}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
          style={{ display: "none" }}
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            e.currentTarget.value = "";
            void handlePickAudioFile(picked);
          }}
        />
        <button
          type="button"
          className="primary-btn"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <PlusIcon size={14} /> {busy ? "Uploading…" : t("add_soundboard")}
        </button>
      </div>

      {error && (
        <div className="error-box" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="success-box" style={{ marginTop: 10 }}>
          {notice}
        </div>
      )}

      {clips.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {clips.map((clip) => (
            <div key={clip.id} className="soundboard-row">
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <strong style={{ fontSize: 13.5 }}>{clip.name}</strong>
                <span className="muted small">
                  {(clip.durationMs / 1000).toFixed(1)}s ·{" "}
                  {(clip.byteSize / 1024).toFixed(0)} KB
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => playAudioUrlPreview(clip.audioUrl)}
                >
                  <PlayIcon size={12} /> Play
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => void handleDeleteClip(clip.id)}
                  aria-label={`Delete ${clip.name}`}
                >
                  <TrashIcon size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================== 4. PRIVACY -> 2FA & PASSKEYS ==================== */

export function PrivacyTwoFactorAndPasskeysBlock() {
  const { t } = useI18n();
  const [secState, setSecState] = useState<SecuritySettingsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // TOTP Setup flow
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableMode, setDisableMode] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Passkey flow
  const [passkeyLabel, setPasskeyLabel] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchSecuritySettings()
      .then((res) => {
        if (active) setSecState(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const qrSvg = useMemo(() => {
    if (!setupData?.otpauthUrl) return null;
    try {
      return buildQrSvgPath(setupData.otpauthUrl, 3);
    } catch {
      return null;
    }
  }, [setupData?.otpauthUrl]);

  async function handleStart2FASetup() {
    setError(null);
    setBackupCodes(null);
    setTotpBusy(true);
    try {
      const started = await beginTotpSetupRpc();
      setSetupData(started);
      setTotpCode("");
    } catch (err) {
      setError(friendlyError(err, "Could not start 2FA setup."));
    } finally {
      setTotpBusy(false);
    }
  }

  async function handleConfirm2FASetup() {
    if (!totpCode.trim()) return;
    setError(null);
    setTotpBusy(true);
    try {
      const res = await confirmTotpSetupRpc(totpCode);
      setSetupData(null);
      setTotpCode("");
      setBackupCodes(res.backupCodes);
      setSecState((prev) => ({
        totpEnabled: true,
        backupCodesRemaining: res.backupCodes.length,
        passkeys: prev?.passkeys ?? [],
      }));
    } catch (err) {
      setError(friendlyError(err, "Invalid authentication code. Check your authenticator app."));
    } finally {
      setTotpBusy(false);
    }
  }

  async function handleDisable2FA() {
    if (!disableCode.trim()) return;
    setError(null);
    setTotpBusy(true);
    try {
      await disableTotpRpc(disableCode);
      setDisableMode(false);
      setDisableCode("");
      setBackupCodes(null);
      setSecState((prev) => ({
        totpEnabled: false,
        backupCodesRemaining: 0,
        passkeys: prev?.passkeys ?? [],
      }));
    } catch (err) {
      setError(friendlyError(err, "Could not disable 2FA. Check your code."));
    } finally {
      setTotpBusy(false);
    }
  }

  async function handleAddPasskey() {
    setError(null);
    setPasskeyBusy(true);
    try {
      const created = await registerPasskeyInBrowser(passkeyLabel);
      setPasskeyLabel("");
      setSecState((prev) => ({
        totpEnabled: prev?.totpEnabled ?? false,
        backupCodesRemaining: prev?.backupCodesRemaining ?? 0,
        passkeys: [created, ...(prev?.passkeys ?? [])],
      }));
    } catch (err) {
      setError(friendlyError(err, "Passkey registration could not be completed."));
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function handleDeletePasskey(credentialId: string) {
    setError(null);
    try {
      await removePasskeyRpc(credentialId);
      setSecState((prev) =>
        prev
          ? {
              ...prev,
              passkeys: prev.passkeys.filter((p) => p.credentialId !== credentialId),
            }
          : prev,
      );
    } catch (err) {
      setError(friendlyError(err, "Could not remove passkey."));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
      {error && <div className="error-box">{error}</div>}

      {/* === 2FA CARD === */}
      <div className="settings-inline-legal-card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <h4 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
            <ShieldCheckIcon size={16} />
            <span>{t("two_factor_title")}</span>
          </h4>
          {secState?.totpEnabled && <span className="e2ee-pill active">Enabled</span>}
        </div>
        <p className="muted small" style={{ margin: "0 0 12px" }}>
          Protect your JaText account with a time-based 6-digit code from Google Authenticator,
          Authy, 1Password, or Apple Passwords when signing in with Google or Email.
        </p>

        {loading ? (
          <p className="muted small">Checking 2FA status…</p>
        ) : !secState?.totpEnabled && !setupData ? (
          <button
            type="button"
            className="primary-btn"
            disabled={totpBusy}
            onClick={() => void handleStart2FASetup()}
          >
            {totpBusy ? "Preparing…" : t("setup_2fa")}
          </button>
        ) : null}

        {setupData && (
          <div className="security-qr-card">
            <strong style={{ fontSize: 14 }}>
              Scan this QR code in your Authenticator app
            </strong>
            {qrSvg && (
              <div className="security-qr-svg">
                <svg
                  viewBox={`0 0 ${qrSvg.viewBoxSize} ${qrSvg.viewBoxSize}`}
                  shapeRendering="crispEdges"
                >
                  <rect width={qrSvg.viewBoxSize} height={qrSvg.viewBoxSize} fill="#ffffff" />
                  <path d={qrSvg.pathData} fill="#0f172a" />
                </svg>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <code className="e2ee-fingerprint-code" style={{ fontSize: 12 }}>
                {setupData.secret}
              </code>
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  void navigator.clipboard.writeText(setupData.secret);
                  setCopiedSecret(true);
                  window.setTimeout(() => setCopiedSecret(false), 1800);
                }}
              >
                {copiedSecret ? <CheckIcon size={12} /> : <CopyIcon size={12} />}{" "}
                {copiedSecret ? "Copied" : "Copy key"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 340 }}>
              <input
                value={totpCode}
                inputMode="numeric"
                maxLength={8}
                placeholder="6-digit code"
                onChange={(e) => setTotpCode(e.target.value)}
              />
              <button
                type="button"
                className="primary-btn"
                disabled={totpBusy || totpCode.trim().length < 6}
                onClick={() => void handleConfirm2FASetup()}
              >
                {totpBusy ? "Verifying…" : "Enable"}
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setSetupData(null)}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        {backupCodes && backupCodes.length > 0 && (
          <div className="security-qr-card" style={{ alignItems: "stretch" }}>
            <strong>Save your recovery backup codes</strong>
            <p className="muted small" style={{ margin: 0 }}>
              Each backup code can be used once if you ever lose access to your authenticator app.
            </p>
            <div className="security-backup-grid">
              {backupCodes.map((code) => (
                <div key={code} className="security-backup-code">
                  {code}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mini-btn"
              style={{ alignSelf: "flex-start" }}
              onClick={() => void navigator.clipboard.writeText(backupCodes.join("\n"))}
            >
              <CopyIcon size={12} /> Copy backup codes
            </button>
          </div>
        )}

        {secState?.totpEnabled && !disableMode && (
          <button
            type="button"
            className="ghost-btn"
            style={{ color: "#f87171" }}
            onClick={() => setDisableMode(true)}
          >
            Disable 2FA
          </button>
        )}

        {secState?.totpEnabled && disableMode && (
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <input
              value={disableCode}
              placeholder={t("enter_auth_code")}
              style={{ flex: "1 1 180px" }}
              onChange={(e) => setDisableCode(e.target.value)}
            />
            <button
              type="button"
              className="danger-btn"
              disabled={totpBusy || disableCode.trim().length < 6}
              onClick={() => void handleDisable2FA()}
            >
              {totpBusy ? "Disabling…" : "Confirm disable"}
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setDisableMode(false);
                setDisableCode("");
              }}
            >
              {t("cancel")}
            </button>
          </div>
        )}
      </div>

      {/* === PASSKEYS CARD === */}
      <div className="settings-inline-legal-card">
        <h4 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px" }}>
          <KeyIcon size={16} />
          <span>{t("passkeys")}</span>
        </h4>
        <p className="muted small" style={{ margin: "0 0 12px" }}>
          Sign in instantly with Face ID, Touch ID, Windows Hello, or your device screen lock
          using phishing-resistant WebAuthn Passkeys.
        </p>

        {isWebAuthnSupported() ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <input
              value={passkeyLabel}
              maxLength={40}
              placeholder="Passkey label (optional, e.g. MacBook / iPhone)"
              style={{ flex: "1 1 200px" }}
              onChange={(e) => setPasskeyLabel(e.target.value)}
            />
            <button
              type="button"
              className="primary-btn"
              disabled={passkeyBusy}
              onClick={() => void handleAddPasskey()}
            >
              <PlusIcon size={14} /> {passkeyBusy ? "Creating…" : t("add_passkey")}
            </button>
          </div>
        ) : (
          <p className="muted small">Passkeys are not supported in this browser environment.</p>
        )}

        {(secState?.passkeys?.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {secState!.passkeys.map((pk) => (
              <div key={pk.credentialId} className="passkey-row">
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <strong style={{ fontSize: 13.5 }}>{pk.label}</strong>
                  <span className="muted small">
                    Added {new Date(pk.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => void handleDeletePasskey(pk.credentialId)}
                >
                  <TrashIcon size={12} /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
