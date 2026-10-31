import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LegalModal, type LegalTab } from "./LegalModal";
import { LockClosedIcon } from "./UiIcons";
import { buildQrSvgPath } from "../lib/qrCodeSvg";
import {
  decryptAndHydrateLinkedWebSession,
  pollWebQrPairingSession,
  startWebQrPairingSession,
  type WebQrSessionHandle,
} from "../lib/deviceLinking";

type LinkScreenPhase = "loading_qr" | "waiting_scan" | "syncing" | "error";

export function LoginPage() {
  const [phase, setPhase] = useState<LinkScreenPhase>("loading_qr");
  const [qrHandle, setQrHandle] = useState<WebQrSessionHandle | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number>(12);
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);

  const activeHandleRef = useRef<WebQrSessionHandle | null>(null);
  const hydratingRef = useRef(false);
  const mountedRef = useRef(true);

  const createFreshQr = useCallback(async () => {
    if (hydratingRef.current) return;
    setErrorMsg(null);
    if (!activeHandleRef.current) {
      setPhase("loading_qr");
    }
    try {
      const next = await startWebQrPairingSession();
      if (!mountedRef.current || hydratingRef.current) return;
      activeHandleRef.current = next;
      setQrHandle(next);
      setPhase("waiting_scan");
    } catch (err) {
      if (!mountedRef.current || hydratingRef.current) return;
      setErrorMsg(
        err instanceof Error ? err.message : "Could not generate QR code. Check your connection.",
      );
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void createFreshQr();
    return () => {
      mountedRef.current = false;
    };
  }, [createFreshQr]);

  // Poll QR pairing session every 800ms and auto-rotate before expiry while idle
  useEffect(() => {
    if (!qrHandle || phase === "error") return;
    let cancelled = false;
    let timerId: number | null = null;

    const tick = async () => {
      if (cancelled || !mountedRef.current) return;
      const current = activeHandleRef.current;
      if (!current) return;

      // Auto-rotate QR 15s before 2-minute TTL if still waiting for scan
      if (!hydratingRef.current && phase === "waiting_scan" && Date.now() > current.expiresAt - 15_000) {
        await createFreshQr();
        return;
      }

      try {
        const res = await pollWebQrPairingSession(current);
        if (cancelled || !mountedRef.current) return;

        if (res.status === "expired") {
          if (!hydratingRef.current) {
            await createFreshQr();
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
                await createFreshQr();
              }
            }
            return;
          }
        }
      } catch {
        // Ignore transient network hiccup during poll
      }

      if (!cancelled && mountedRef.current && !hydratingRef.current) {
        timerId = window.setTimeout(() => void tick(), 800);
      }
    };

    timerId = window.setTimeout(() => void tick(), 800);
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
                    onClick={() => void createFreshQr()}
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
