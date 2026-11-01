import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LegalModal, type LegalTab } from "./LegalModal";
import { KeyIcon, LockClosedIcon } from "./UiIcons";
import { buildQrSvgPath } from "../lib/qrCodeSvg";
import { useI18n } from "../lib/i18n";
import { isWebAuthnSupported } from "../lib/securityClient";
import { useJaText } from "../lib/store";
import {
  decryptAndHydrateLinkedWebSession,
  pollWebQrPairingSession,
  startWebQrPairingSession,
  type WebQrSessionHandle,
} from "../lib/deviceLinking";

type LinkScreenPhase = "loading_qr" | "waiting_scan" | "syncing" | "error";

const QR_ROTATION_INTERVAL_MS = 120_000; // 2 minutes privacy rotation

export function LoginPage() {
  const store = useJaText();
  const { t } = useI18n();
  const [phase, setPhase] = useState<LinkScreenPhase>("loading_qr");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [qrHandle, setQrHandle] = useState<WebQrSessionHandle | null>(null);
  const [rotateAt, setRotateAt] = useState<number>(() => Date.now() + QR_ROTATION_INTERVAL_MS);
  const [secondsLeft, setSecondsLeft] = useState<number>(120);
  const [isRefreshingQr, setIsRefreshingQr] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number>(12);
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);

  const activeHandleRef = useRef<WebQrSessionHandle | null>(null);
  const hydratingRef = useRef(false);
  const rotatingRef = useRef(false);
  const mountedRef = useRef(true);

  const createFreshQr = useCallback(async (manual = false) => {
    if (hydratingRef.current || rotatingRef.current) return;
    rotatingRef.current = true;
    setErrorMsg(null);
    if (manual) {
      setIsRefreshingQr(true);
    } else if (!activeHandleRef.current) {
      setPhase("loading_qr");
    }
    try {
      const prevId = activeHandleRef.current?.pairingId;
      const next = await startWebQrPairingSession(prevId);
      if (!mountedRef.current || hydratingRef.current) return;
      activeHandleRef.current = next;
      setQrHandle(next);
      const nextRotate = Math.min(next.expiresAt, Date.now() + QR_ROTATION_INTERVAL_MS);
      setRotateAt(nextRotate);
      setSecondsLeft(Math.max(1, Math.ceil((nextRotate - Date.now()) / 1000)));
      setPhase("waiting_scan");
    } catch (err) {
      if (!mountedRef.current || hydratingRef.current) return;
      setErrorMsg(
        err instanceof Error ? err.message : "Could not generate QR code. Check your connection.",
      );
      setPhase("error");
    } finally {
      rotatingRef.current = false;
      if (mountedRef.current) {
        setIsRefreshingQr(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void createFreshQr(false);
    return () => {
      mountedRef.current = false;
    };
  }, [createFreshQr]);

  // 1-second privacy countdown + automatic 2-minute QR rotation while waiting for scan
  useEffect(() => {
    if (phase !== "waiting_scan" || !qrHandle) return;
    const id = window.setInterval(() => {
      if (!mountedRef.current || hydratingRef.current) return;
      const remSec = Math.max(0, Math.ceil((rotateAt - Date.now()) / 1000));
      setSecondsLeft(remSec);
      if (remSec <= 0) {
        void createFreshQr(false);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [createFreshQr, phase, qrHandle, rotateAt]);

  // Poll QR pairing session every 950ms while idle
  useEffect(() => {
    if (!qrHandle || phase === "error") return;
    let cancelled = false;
    let timerId: number | null = null;

    const tick = async () => {
      if (cancelled || !mountedRef.current) return;
      const current = activeHandleRef.current;
      if (!current) return;

      try {
        const res = await pollWebQrPairingSession(current);
        if (cancelled || !mountedRef.current) return;

        if (res.status === "expired") {
          if (!hydratingRef.current) {
            await createFreshQr(false);
          }
          return;
        }

        if (res.status === "syncing") {
          setPhase("syncing");
          setSyncProgress((prev) => (prev < 24 ? Math.min(24, prev + 3) : prev));
        } else if (res.status === "approved" && res.token && res.sealedBundleJson) {
          if (!hydratingRef.current) {
            hydratingRef.current = true;
            setPhase("syncing");
            try {
              await decryptAndHydrateLinkedWebSession(
                current,
                res.token,
                res.sealedBundleJson,
                (pct) => {
                  if (mountedRef.current) {
                    setSyncProgress((prev) => Math.max(prev, pct));
                  }
                },
              );
            } catch (syncErr) {
              hydratingRef.current = false;
              if (mountedRef.current) {
                setErrorMsg(
                  syncErr instanceof Error
                    ? syncErr.message
                    : "Sync interrupted. Please scan a fresh QR code.",
                );
                setSyncProgress(12);
                await createFreshQr(false);
              }
            }
            return;
          }
        }
      } catch {
        // Ignore transient network hiccup during poll
      }

      if (!cancelled && mountedRef.current && !hydratingRef.current) {
        timerId = window.setTimeout(() => void tick(), 950);
      }
    };

    timerId = window.setTimeout(() => void tick(), 950);
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [createFreshQr, phase, qrHandle]);

  // Warn before accidental tab close while actively syncing messages & attachments
  useEffect(() => {
    if (phase !== "syncing") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [phase]);

  const qrVector = useMemo(() => {
    if (!qrHandle?.qrPayload) return null;
    try {
      return buildQrSvgPath(qrHandle.qrPayload, 3);
    } catch {
      return null;
    }
  }, [qrHandle?.qrPayload]);

  const formattedCountdown = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }, [secondsLeft]);

  if (phase === "syncing") {
    return (
      <div className="login-screen qr-link-screen">
        <div className="login-card qr-sync-card">
          <div className="qr-sync-logo-wrap">
            <img
              className="qr-sync-logo"
              src="/jatext-logo-icon.png"
              alt="JaText"
            />
          </div>

          <div className="qr-e2ee-pill">
            <LockClosedIcon size={14} />
            <span>End-to-End Encrypted</span>
          </div>

          <h2 className="qr-sync-heading">
            Syncing your messages and attachments....
          </h2>
          <p className="qr-sync-subtext">
            Do not close this tab while its syncing.
          </p>

          <div
            className="qr-sync-progress-track"
            role="progressbar"
            aria-valuenow={syncProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="qr-sync-progress-fill"
              style={{ width: `${Math.max(10, Math.min(100, syncProgress))}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen qr-link-screen">
      <div className="login-card qr-link-card">
        <div className="qr-link-grid">
          <div className="qr-link-instructions">
            <div className="qr-brand-row">
              <img
                className="qr-brand-logo"
                src="/jatext-logo-icon.png"
                alt="JaText"
              />
              <span className="qr-brand-name">JaText</span>
            </div>

            <h1 className="qr-link-title">Link your phone in order to use it.</h1>

            <ol className="qr-steps-list">
              <li>
                <span className="qr-step-num">1</span>
                <span>
                  Open <strong>JaText</strong> on your phone
                </span>
              </li>
              <li>
                <span className="qr-step-num">2</span>
                <span>
                  Go to <strong>Settings</strong> and open <strong>Devices</strong> (3rd tab)
                </span>
              </li>
              <li>
                <span className="qr-step-num">3</span>
                <span>
                  Tap <strong>Scan with QR code</strong> and point your phone at this screen
                </span>
              </li>
            </ol>

            <p className="qr-download-note">
              <em>
                Don&apos;t have JaText on your phone yet?{" "}
                <a href="/downloads/JaText-release.apk" download>
                  Download the Android app
                </a>
              </em>
            </p>
          </div>

          <div className="qr-code-column">
            <div className="qr-code-box">
              {phase === "waiting_scan" && qrVector ? (
                <svg
                  className="qr-code-svg"
                  viewBox={`0 0 ${qrVector.viewBoxSize} ${qrVector.viewBoxSize}`}
                  shapeRendering="crispEdges"
                  role="img"
                  aria-label="JaText device linking QR code"
                >
                  <rect
                    x="0"
                    y="0"
                    width={qrVector.viewBoxSize}
                    height={qrVector.viewBoxSize}
                    fill="#ffffff"
                  />
                  <path d={qrVector.pathData} fill="#0b0b10" />
                </svg>
              ) : phase === "error" ? (
                <div className="qr-code-placeholder">
                  <p className="qr-error-text">{errorMsg || "QR code unavailable"}</p>
                  <button
                    type="button"
                    className="primary-btn qr-reload-btn"
                    onClick={() => void createFreshQr(true)}
                  >
                    <span>Reload QR code</span>
                  </button>
                </div>
              ) : (
                <div className="qr-code-placeholder">
                  <div className="qr-spinner" />
                  <span className="muted small">Generating secure QR code...</span>
                </div>
              )}
            </div>

            <div className="qr-refresh-row">
              <span className="qr-refresh-timer">
                {phase === "waiting_scan"
                  ? `Rotates in ${formattedCountdown}`
                  : "Rotating QR..."}
              </span>
              <button
                type="button"
                className="qr-refresh-btn"
                disabled={isRefreshingQr || phase === "loading_qr"}
                onClick={() => void createFreshQr(true)}
                title="Generate a brand-new QR code now"
              >
                <svg
                  className={`qr-refresh-icon${isRefreshingQr ? " spinning" : ""}`}
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <polyline points="21 3 21 9 15 9" />
                </svg>
                <span>Refresh QR</span>
              </button>
              {isWebAuthnSupported() && store.signInWithPasskey && (
                <button
                  type="button"
                  className="qr-refresh-btn"
                  disabled={passkeyBusy}
                  onClick={() => {
                    if (!store.signInWithPasskey) return;
                    setPasskeyBusy(true);
                    setErrorMsg(null);
                    void store
                      .signInWithPasskey()
                      .catch((err) => {
                        setErrorMsg(
                          err instanceof Error ? err.message : "Passkey sign-in failed.",
                        );
                      })
                      .finally(() => setPasskeyBusy(false));
                  }}
                  title="Sign in with a registered Passkey"
                >
                  <KeyIcon size={13} />
                  <span>{passkeyBusy ? "Verifying…" : t("sign_in_passkey")}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="qr-link-footer">
          <div className="qr-footer-e2ee">
            <LockClosedIcon size={13} />
            <span>Your personal messages and attachments are end-to-end encrypted</span>
          </div>
          <div className="qr-footer-legal">
            <button
              type="button"
              className="inline-link-btn"
              onClick={() => setLegalTab("terms")}
            >
              Terms of Service
            </button>
            {" · "}
            <button
              type="button"
              className="inline-link-btn"
              onClick={() => setLegalTab("privacy")}
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </div>

      {legalTab && (
        <LegalModal
          initialTab={legalTab}
          onClose={() => setLegalTab(null)}
        />
      )}
    </div>
  );
}
