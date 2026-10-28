import { useState } from "react";
import { AnimatedModal } from "./AnimatedModal";
import { useE2EESnapshot, type MessageE2EEProof } from "../lib/e2ee/keystore";
import { useJaText } from "../lib/store";
import {
  CheckIcon,
  CopyIcon,
  LockClosedIcon,
  SmartphoneShareIcon,
  UnlockIcon,
} from "./UiIcons";

export function LockIcon({
  size = 15,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function MessageEncryptionModal({
  proof,
  onClose,
}: {
  proof: MessageE2EEProof;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopyCiphertext() {
    try {
      await navigator.clipboard.writeText(proof.rawWireBody);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  }

  return (
    <AnimatedModal
      onClose={onClose}
      cardClassName="modal-card wide e2ee-proof-modal"
      closeLabel="Close encryption details"
    >
      {(requestClose) => (
        <div className="e2ee-modal-body">
          <div className="e2ee-modal-header">
            <div className={`e2ee-badge-large ${proof.encrypted ? "active" : "plain"}`}>
              <LockIcon size={20} />
            </div>
            <div>
              <h2>
                {proof.encrypted ? "End-to-End Encrypted Message" : "Legacy Unencrypted Message"}
              </h2>
              <p className="muted small">
                {proof.encrypted
                  ? "Encrypted on the sender's device before leaving for Convex."
                  : "Sent before E2EE keys were active for this conversation."}
              </p>
            </div>
          </div>

          <div className="e2ee-meta-grid">
            <div className="e2ee-meta-row">
              <span className="muted small">Cipher suite</span>
              <code>{proof.algorithm}</code>
            </div>
            {proof.encrypted && (
              <>
                <div className="e2ee-meta-row">
                  <span className="muted small">Sender signature</span>
                  <span className={proof.signatureVerified ? "e2ee-status-ok" : "muted small"}>
                    {proof.signatureVerified ? (
                      <>
                        <CheckIcon size={12} /> Verified (ECDSA P-256)
                      </>
                    ) : (
                      "Signed (awaiting peer key match)"
                    )}
                  </span>
                </div>
                {proof.senderKeyId && (
                  <div className="e2ee-meta-row">
                    <span className="muted small">Sender key ID</span>
                    <code>{proof.senderKeyId}</code>
                  </div>
                )}
                {proof.receiverKeyId && (
                  <div className="e2ee-meta-row">
                    <span className="muted small">Recipient key ID</span>
                    <code>{proof.receiverKeyId}</code>
                  </div>
                )}
                {proof.groupEpoch !== undefined && (
                  <div className="e2ee-meta-row">
                    <span className="muted small">Group key epoch</span>
                    <code>Epoch #{proof.groupEpoch}</code>
                  </div>
                )}
                {proof.ephemeralPublicKey && (
                  <div className="e2ee-meta-row">
                    <span className="muted small">Ephemeral ECDH P-256 key</span>
                    <code className="e2ee-truncate">{proof.ephemeralPublicKey}</code>
                  </div>
                )}
                {proof.iv && (
                  <div className="e2ee-meta-row">
                    <span className="muted small">AES-256-GCM 96-bit IV</span>
                    <code>{proof.iv}</code>
                  </div>
                )}
                {proof.attachmentEncrypted && (
                  <div className="e2ee-meta-row">
                    <span className="muted small">Media / file attachment</span>
                    <span className="e2ee-status-ok">
                      <CheckIcon size={12} /> AES-256-GCM + SHA-256 encrypted blob
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="e2ee-wire-section">
            <div className="e2ee-wire-top">
              <span className="muted small">Raw wire payload stored on Convex DB</span>
              <button type="button" className="mini-btn" onClick={() => void handleCopyCiphertext()}>
                {copied ? (
                  <>
                    <CheckIcon size={12} /> Copied
                  </>
                ) : (
                  <>
                    <CopyIcon size={12} /> Copy raw payload
                  </>
                )}
              </button>
            </div>
            <pre className="e2ee-wire-box">
              {proof.rawWireBody.replace(/[\u200B]+/g, "")}
            </pre>
          </div>

          <div className="e2ee-modal-footer">
            <button type="button" className="primary-btn" onClick={requestClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </AnimatedModal>
  );
}

export function E2EEKeyVaultModal({ onClose }: { onClose: () => void }) {
  const store = useJaText();
  const snap = useE2EESnapshot();
  const [tab, setTab] = useState<"backup" | "restore" | "devices">(
    store.hasRemoteE2EEVault && store.remoteVaultKeyId && store.remoteVaultKeyId !== snap.myKeyId
      ? "restore"
      : "backup",
  );
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [restoreMode, setRestoreMode] = useState<"pin" | "recovery">("pin");
  const [restoreSecret, setRestoreSecret] = useState("");
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState<string | null>(null);
  const [copiedRecovery, setCopiedRecovery] = useState(false);
  const [copiedMyKey, setCopiedMyKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const vaultMismatch = Boolean(
    store.hasRemoteE2EEVault &&
      store.remoteVaultKeyId &&
      snap.myKeyId &&
      store.remoteVaultKeyId !== snap.myKeyId,
  );

  async function handleSaveBackup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!store.saveE2EEVaultBackup) {
      setError("Key backup requires the live JaText backend.");
      return;
    }
    if (pin.trim().length < 6) {
      setError("Choose a backup PIN or passphrase with at least 6 characters.");
      return;
    }
    if (pin !== confirmPin) {
      setError("Backup PIN entries do not match.");
      return;
    }
    setBusy(true);
    try {
      const { recoveryKey } = await store.saveE2EEVaultBackup(pin);
      setGeneratedRecoveryKey(recoveryKey);
      setPin("");
      setConfirmPin("");
      setSuccess("Encrypted key backup saved! Save your 24-character Recovery Key below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save E2EE backup.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreBackup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!store.restoreE2EEVaultBackup) {
      setError("Vault restore requires the live JaText backend.");
      return;
    }
    if (!restoreSecret.trim()) {
      setError(
        restoreMode === "pin"
          ? "Enter your E2EE backup PIN / passphrase."
          : "Enter your 24-character Recovery Key.",
      );
      return;
    }
    setBusy(true);
    try {
      await store.restoreE2EEVaultBackup(restoreSecret.trim(), restoreMode);
      setRestoreSecret("");
      setSuccess("✓ E2EE identity & group keys unlocked on this device!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock E2EE backup.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartLiveSync() {
    if (!store.requestLiveDeviceSync) return;
    setError(null);
    setBusy(true);
    try {
      await store.requestLiveDeviceSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request live device sync.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatedModal
      onClose={onClose}
      cardClassName="modal-card wide e2ee-vault-modal"
      closeLabel="Close E2EE key manager"
    >
      {(requestClose) => (
        <div className="e2ee-modal-body">
          <div className="e2ee-modal-header">
            <div className="e2ee-badge-large active">
              <LockIcon size={20} />
            </div>
            <div>
              <h2>End-to-End Encryption Keys</h2>
              <p className="muted small">
                Zero-knowledge P-256 keys live only on your devices. Convex never sees your PIN or
                private keys.
              </p>
            </div>
          </div>

          {snap.myFingerprint && (
            <div className="e2ee-own-key-box">
              <div className="e2ee-wire-top">
                <span className="muted small">
                  This device key · ID <code>{snap.myKeyId}</code>{" "}
                  {snap.backedUp ? (
                    <span className="e2ee-status-ok">
                      · <CheckIcon size={12} /> Backed up
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => {
                    if (!snap.myDhPubB64) return;
                    void navigator.clipboard.writeText(
                      `JaText E2EE Key (${snap.myKeyId})\nFingerprint: ${snap.myFingerprint}\nECDH-P256: ${snap.myDhPubB64}`,
                    );
                    setCopiedMyKey(true);
                    window.setTimeout(() => setCopiedMyKey(false), 1800);
                  }}
                >
                  {copiedMyKey ? (
                    <>
                      <CheckIcon size={12} /> Copied
                    </>
                  ) : (
                    <>
                      <CopyIcon size={12} /> Copy key
                    </>
                  )}
                </button>
              </div>
              <code className="e2ee-fingerprint-code">{snap.myFingerprint}</code>
            </div>
          )}

          {vaultMismatch && (
            <div className="hint-box">
              <strong>Encrypted backup found from another device</strong> (`{store.remoteVaultKeyId}`).
              Unlock it below with your PIN, Recovery Key, or 1-tap Live Device Sync so all your
              devices share the same E2EE key.
            </div>
          )}

          <div className="legal-modal-tabs">
            <button
              type="button"
              className={`legal-tab-btn ${tab === "backup" ? "active" : ""}`}
              onClick={() => {
                setError(null);
                setTab("backup");
              }}
            >
              <LockClosedIcon size={14} /> Backup PIN
            </button>
            <button
              type="button"
              className={`legal-tab-btn ${tab === "restore" ? "active" : ""}`}
              onClick={() => {
                setError(null);
                setTab("restore");
              }}
            >
              <UnlockIcon size={14} /> Unlock Key
            </button>
            <button
              type="button"
              className={`legal-tab-btn ${tab === "devices" ? "active" : ""}`}
              onClick={() => {
                setError(null);
                setTab("devices");
              }}
            >
              <SmartphoneShareIcon size={14} /> Sync Device
              {(store.pendingDeviceSyncRequests?.length ?? 0) > 0
                ? ` (${store.pendingDeviceSyncRequests!.length})`
                : ""}
            </button>
          </div>

          {error && <div className="error-box">{error}</div>}
          {success && <div className="success-box">{success}</div>}

          {tab === "backup" && (
            <form className="e2ee-vault-form" onSubmit={(e) => void handleSaveBackup(e)}>
              <p className="muted small">
                Encrypts your private identity &amp; group keys locally using{" "}
                <code>PBKDF2-SHA-512</code> (600,000 iterations) + <code>AES-256-GCM</code> so you
                can sign in on Desktop + Android without losing encrypted chats.
              </p>
              <label>
                E2EE Backup PIN or Passphrase (6+ characters)
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Create a strong PIN or passphrase…"
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirm PIN or Passphrase
                <input
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="Re-enter to confirm…"
                  autoComplete="new-password"
                />
              </label>
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? "Encrypting vault…" : snap.backedUp ? "Update encrypted backup" : "Save encrypted backup"}
              </button>

              {generatedRecoveryKey && (
                <div className="e2ee-recovery-card">
                  <div className="e2ee-wire-top">
                    <strong>24-Character Recovery Key</strong>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        void navigator.clipboard.writeText(generatedRecoveryKey);
                        setCopiedRecovery(true);
                        window.setTimeout(() => setCopiedRecovery(false), 1800);
                      }}
                    >
                      {copiedRecovery ? (
                        <>
                          <CheckIcon size={12} /> Copied
                        </>
                      ) : (
                        <>
                          <CopyIcon size={12} /> Copy recovery key
                        </>
                      )}
                    </button>
                  </div>
                  <code className="e2ee-recovery-code">{generatedRecoveryKey}</code>
                  <span className="muted small">
                    Keep this somewhere safe. Neither JaText nor Convex can recover your encrypted
                    messages without your PIN or this Recovery Key.
                  </span>
                </div>
              )}
            </form>
          )}

          {tab === "restore" && (
            <form className="e2ee-vault-form" onSubmit={(e) => void handleRestoreBackup(e)}>
              <div className="e2ee-mode-switch">
                <button
                  type="button"
                  className={`mini-btn ${restoreMode === "pin" ? "active-pill" : ""}`}
                  onClick={() => setRestoreMode("pin")}
                >
                  Use Backup PIN
                </button>
                <button
                  type="button"
                  className={`mini-btn ${restoreMode === "recovery" ? "active-pill" : ""}`}
                  onClick={() => setRestoreMode("recovery")}
                >
                  Use 24-Char Recovery Key
                </button>
              </div>
              <label>
                {restoreMode === "pin" ? "Backup PIN / Passphrase" : "24-Character Recovery Key"}
                <input
                  type={restoreMode === "pin" ? "password" : "text"}
                  value={restoreSecret}
                  onChange={(e) => setRestoreSecret(e.target.value)}
                  placeholder={
                    restoreMode === "pin"
                      ? "Enter your E2EE backup PIN…"
                      : "XXXXXX-XXXXXX-XXXXXX-XXXXXX"
                  }
                />
              </label>
              <button
                type="submit"
                className="primary-btn"
                disabled={busy || !store.hasRemoteE2EEVault}
              >
                {busy
                  ? "Decrypting vault…"
                  : store.hasRemoteE2EEVault
                    ? "Unlock E2EE Keys on This Device"
                    : "No remote backup saved yet"}
              </button>
            </form>
          )}

          {tab === "devices" && (
            <div className="e2ee-vault-form">
              {(store.pendingDeviceSyncRequests?.length ?? 0) > 0 && (
                <div className="e2ee-sync-requests">
                  <strong>Approve incoming device sync</strong>
                  {store.pendingDeviceSyncRequests!.map((req) => (
                    <div key={req.deviceId} className="e2ee-sync-req-row">
                      <div>
                        <div>
                          <strong>{req.deviceLabel}</strong>
                        </div>
                        <span className="muted small">
                          Security code: <code>{req.sasCode}</code>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="primary-btn small-btn"
                        disabled={busy}
                        onClick={async () => {
                          if (!store.approveDeviceSyncRequest) return;
                          setBusy(true);
                          setError(null);
                          try {
                            await store.approveDeviceSyncRequest(req);
                            setSuccess(`Synced E2EE keys to ${req.deviceLabel}!`);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Could not approve sync.");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Approve
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="muted small">
                Already signed in on another phone or computer? Request a 1-tap ECDH encrypted key
                transfer from your other open device:
              </p>
              {store.activeDeviceSyncCode ? (
                <div className="e2ee-recovery-card">
                  <strong>Waiting for approval on your other device…</strong>
                  <span className="muted small">
                    Open Settings → End-to-End Encryption → Sync Device on your other device and
                    confirm this code matches:
                  </span>
                  <code className="e2ee-recovery-code">{store.activeDeviceSyncCode}</code>
                </div>
              ) : (
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={busy}
                  onClick={() => void handleStartLiveSync()}
                >
                  Request 1-Tap Sync From My Other Device
                </button>
              )}
            </div>
          )}

          <div className="e2ee-modal-footer">
            <button type="button" className="ghost-btn" onClick={requestClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </AnimatedModal>
  );
}
