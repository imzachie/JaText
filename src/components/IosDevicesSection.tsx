import { useCallback, useEffect, useRef, useState } from "react";
import {
  IosCameraIcon,
  IosCheckCircleIcon,
  IosCloseIcon,
  IosLaptopIcon,
  IosLoaderIcon,
  IosQrCodeIcon,
  IosRefreshIcon,
  IosShieldCheckIcon,
  IosTrashIcon,
} from "./IosVectorIcons";
import {
  QR_LINK_PREFIX,
  approveQrPairingFromPrimaryMobile,
  disconnectLinkedWebDevice,
  listLinkedWebDevices,
  type LinkedWebDeviceInfo,
} from "../lib/deviceLinking";
import { useJaText } from "../lib/store";

type JsQrFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" },
) => { data: string } | null;

let jsQrPromise: Promise<JsQrFn | null> | null = null;

function loadJsQr(): Promise<JsQrFn | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const w = window as unknown as { jsQR?: JsQrFn };
  if (typeof w.jsQR === "function") return Promise.resolve(w.jsQR);
  if (jsQrPromise) return jsQrPromise;

  jsQrPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "/vendor/jsQR.min.js";
    script.async = true;
    script.onload = () => {
      resolve(typeof w.jsQR === "function" ? w.jsQR : null);
    };
    script.onerror = () => {
      jsQrPromise = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return jsQrPromise;
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return "Active just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `Active ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Active ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `Active ${days}d ago`;
}

export function IosDevicesSection({
  autoStartScanner = false,
  onAutoStartConsumed,
}: {
  autoStartScanner?: boolean;
  onAutoStartConsumed?: () => void;
} = {}) {
  const { me } = useJaText();
  const [devices, setDevices] = useState<LinkedWebDeviceInfo[]>([]);
  const [maxDevices, setMaxDevices] = useState(5);
  const [loading, setLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(autoStartScanner);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manualPayload, setManualPayload] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const handledScanRef = useRef(false);

  const refreshDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLinkedWebDevices();
      setDevices(res.devices);
      setMaxDevices(res.maxDevices);
    } catch (err) {
      setBannerMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Could not load linked devices.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    if (autoStartScanner) {
      setScannerOpen(true);
      onAutoStartConsumed?.();
    }
  }, [autoStartScanner, onAutoStartConsumed]);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current !== null) {
      window.clearInterval(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleDetectedQrPayload = useCallback(
    async (payload: string) => {
      if (!me?.id || handledScanRef.current) return;
      const clean = payload.trim();
      if (!clean.startsWith(`${QR_LINK_PREFIX}|`)) return;
      handledScanRef.current = true;
      setPairingBusy(true);
      setBannerMsg(null);
      stopCamera();

      try {
        const res = await approveQrPairingFromPrimaryMobile(clean, me.id);
        const label = res.osName
          ? `${res.browserName} (${res.osName})`
          : res.browserName;
        setBannerMsg({
          kind: "ok",
          text: `Linked ${label}! Your encrypted chats and keys are now synced.`,
        });
        setScannerOpen(false);
        setManualPayload("");
        await refreshDevices();
      } catch (err) {
        handledScanRef.current = false;
        setBannerMsg({
          kind: "err",
          text:
            err instanceof Error
              ? err.message
              : "Failed to link desktop browser. Refresh the QR code and try again.",
        });
      } finally {
        setPairingBusy(false);
      }
    },
    [me?.id, refreshDevices, stopCamera],
  );

  useEffect(() => {
    if (!scannerOpen) {
      stopCamera();
      return;
    }

    let cancelled = false;
    handledScanRef.current = false;
    setCameraError("");

    const startScanner = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "Camera access is unavailable in this browser context. Allow Camera permission or paste the link code manually below.",
        );
        return;
      }

      const [jsQR, streamResult] = await Promise.all([
        loadJsQr(),
        navigator.mediaDevices
          .getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          })
          .catch((err: unknown) => err),
      ]);

      if (cancelled) {
        if (streamResult instanceof MediaStream) {
          streamResult.getTracks().forEach((t) => t.stop());
        }
        return;
      }

      if (!(streamResult instanceof MediaStream)) {
        setCameraError(
          "Camera permission was denied or unavailable. Please allow Camera access in iOS Settings or use manual code entry below.",
        );
        return;
      }

      streamRef.current = streamResult;
      const video = videoRef.current;
      if (video) {
        video.srcObject = streamResult;
        video.setAttribute("playsinline", "true");
        await video.play().catch(() => undefined);
      }

      type NativeDetector = {
        detect: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<Array<{ rawValue?: string }>>;
      };
      let barcodeDetector: NativeDetector | null = null;
      const BD = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => NativeDetector;
        }
      ).BarcodeDetector;
      if (typeof BD === "function") {
        try {
          barcodeDetector = new BD({ formats: ["qr_code"] });
        } catch {
          barcodeDetector = null;
        }
      }

      scanLoopRef.current = window.setInterval(async () => {
        if (cancelled || handledScanRef.current) return;
        const vid = videoRef.current;
        if (!vid || vid.readyState < 2 || vid.videoWidth === 0) return;

        if (barcodeDetector) {
          try {
            const codes = await barcodeDetector.detect(vid);
            for (const c of codes) {
              if (c.rawValue && c.rawValue.includes(QR_LINK_PREFIX)) {
                void handleDetectedQrPayload(c.rawValue);
                return;
              }
            }
          } catch {
            // fall through to jsQR canvas decode
          }
        }

        if (jsQR) {
          let canvas = canvasRef.current;
          if (!canvas) {
            canvas = document.createElement("canvas");
            canvasRef.current = canvas;
          }
          const targetW = Math.min(640, vid.videoWidth);
          const scale = targetW / vid.videoWidth;
          const targetH = Math.max(1, Math.round(vid.videoHeight * scale));
          if (canvas.width !== targetW) canvas.width = targetW;
          if (canvas.height !== targetH) canvas.height = targetH;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(vid, 0, 0, targetW, targetH);
          const img = ctx.getImageData(0, 0, targetW, targetH);
          const decoded = jsQR(img.data, targetW, targetH, {
            inversionAttempts: "attemptBoth",
          });
          if (decoded?.data && decoded.data.includes(QR_LINK_PREFIX)) {
            void handleDetectedQrPayload(decoded.data);
          }
        }
      }, 150);
    };

    void startScanner();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [handleDetectedQrPayload, scannerOpen, stopCamera]);

  const handleDisconnect = async (deviceId: string) => {
    setDisconnectingId(deviceId);
    setBannerMsg(null);
    try {
      await disconnectLinkedWebDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
      setBannerMsg({ kind: "ok", text: "Disconnected linked web session." });
    } catch (err) {
      setBannerMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Failed to disconnect device.",
      });
    } finally {
      setDisconnectingId(null);
    }
  };

  const atCap = devices.length >= maxDevices;

  return (
    <div className="settings-section-stack jt-ios-devices-wrap">
      <div className="jt-ios-devices-hero">
        <div className="jt-ios-devices-hero-icon">
          <IosQrCodeIcon size={26} />
        </div>
        <div className="jt-ios-devices-hero-copy">
          <h4>Link JaText Desktop Web</h4>
          <p>
            Open <strong>jatext.vercel.app/chats</strong> on your computer and scan the QR code to
            sync your end-to-end encrypted messages, keys, and themes.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary jt-ios-scan-qr-btn"
          disabled={atCap || pairingBusy}
          onClick={() => {
            setBannerMsg(null);
            setScannerOpen(true);
          }}
        >
          <IosCameraIcon size={17} />
          <span>{atCap ? `Max ${maxDevices} devices linked` : "Scan with QR code"}</span>
        </button>
      </div>

      {bannerMsg && (
        <div
          className={`jt-ios-devices-alert ${bannerMsg.kind === "ok" ? "is-ok" : "is-err"}`}
          role="status"
        >
          {bannerMsg.kind === "ok" && <IosCheckCircleIcon size={16} />}
          <span>{bannerMsg.text}</span>
        </div>
      )}

      <div className="jt-ios-devices-list-card">
        <div className="jt-ios-devices-list-head">
          <div>
            <strong>
              Linked Web Sessions ({devices.length} / {maxDevices})
            </strong>
            <span>Disconnect any browser session instantaneously at any time.</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => void refreshDevices()}
            aria-label="Refresh linked devices"
            title="Refresh"
          >
            <IosRefreshIcon size={15} className={loading ? "jt-spin-icon" : undefined} />
          </button>
        </div>

        {loading ? (
          <div className="jt-ios-devices-empty">
            <IosLoaderIcon size={18} className="jt-spin-icon" />
            <span>Loading linked sessions...</span>
          </div>
        ) : devices.length === 0 ? (
          <div className="jt-ios-devices-empty">
            <IosLaptopIcon size={22} />
            <span>No desktop browsers linked yet.</span>
          </div>
        ) : (
          <div className="jt-ios-devices-rows">
            {devices.map((dev) => (
              <div key={dev.id} className="jt-ios-device-row">
                <div className="jt-ios-device-icon">
                  <IosLaptopIcon size={18} />
                </div>
                <div className="jt-ios-device-meta">
                  <strong>{dev.deviceLabel || `${dev.browserName} (${dev.osName})`}</strong>
                  <span>{formatRelativeTime(dev.lastActiveAt || dev.linkedAt)}</span>
                </div>
                <button
                  type="button"
                  className="jt-ios-device-disconnect"
                  disabled={disconnectingId === dev.id}
                  onClick={() => void handleDisconnect(dev.id)}
                >
                  <IosTrashIcon size={14} />
                  <span>{disconnectingId === dev.id ? "..." : "Disconnect"}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="jt-ios-devices-security-foot">
        <IosShieldCheckIcon size={15} />
        <span>
          Your private keys are sealed on your iPhone/iPad with ephemeral ECDH P-256 + AES-256-GCM
          before syncing to your computer.
        </span>
      </div>

      {scannerOpen && (
        <div
          className="jt-ios-sheet-backdrop"
          onClick={() => {
            if (!pairingBusy) setScannerOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Scan JaText Web QR Code"
        >
          <div
            className="jt-ios-qr-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="jt-ios-qr-modal-head">
              <div>
                <h3>Scan Web QR Code</h3>
                <span>Point your camera at jatext.vercel.app/chats on your computer</span>
              </div>
              <button
                type="button"
                className="jt-ios-sheet-close"
                disabled={pairingBusy}
                onClick={() => setScannerOpen(false)}
                aria-label="Close scanner"
              >
                <IosCloseIcon size={18} />
              </button>
            </div>

            <div className="jt-ios-qr-viewport">
              <video ref={videoRef} muted playsInline autoPlay />
              <div className="jt-ios-qr-reticle" aria-hidden="true">
                <span className="c tl" />
                <span className="c tr" />
                <span className="c bl" />
                <span className="c br" />
                <div className="jt-ios-qr-laser" />
              </div>
              {pairingBusy && (
                <div className="jt-ios-qr-syncing">
                  <IosLoaderIcon size={26} className="jt-spin-icon" />
                  <strong>Syncing encrypted keys &amp; chats...</strong>
                </div>
              )}
            </div>

            {cameraError && (
              <div className="jt-ios-devices-alert is-err" style={{ marginTop: 12 }}>
                <span>{cameraError}</span>
              </div>
            )}

            <div className="jt-ios-qr-manual-toggle">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowManualInput((v) => !v)}
              >
                {showManualInput ? "Hide manual code input" : "Having camera trouble? Paste QR code text"}
              </button>
            </div>

            {showManualInput && (
              <div className="jt-ios-qr-manual-box">
                <input
                  type="text"
                  placeholder="JATEXT_LINK_V1|..."
                  value={manualPayload}
                  onChange={(e) => setManualPayload(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-primary"
                  disabled={pairingBusy || !manualPayload.trim()}
                  onClick={() => {
                    handledScanRef.current = false;
                    void handleDetectedQrPayload(manualPayload);
                  }}
                >
                  Link
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
