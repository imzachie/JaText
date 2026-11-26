import { useEffect, useState, type FormEvent } from "react";
import {
  IosArrowLeftIcon,
  IosEyeIcon,
  IosEyeOffIcon,
  IosLockIcon,
  IosMailIcon,
  IosShieldCheckIcon,
} from "./IosVectorIcons";
import { cancelAddAnotherAccount, useMultiAccountState } from "../lib/accountManager";
import { useI18n } from "../lib/i18n";
import { detectIosBrowserLabel } from "../lib/iosDetection";
import { isWebAuthnSupported } from "../lib/securityClient";
import { useJaText } from "../lib/store";
import {
  PUBLIC_TURSO_API_ORIGIN,
  TwoFactorRequiredError,
  consumePendingOAuthError,
  getPendingTwoFactorChallenge,
  setPendingTwoFactorChallenge,
  subscribePendingTwoFactorChallenge,
} from "../lib/tursoClient";
import { KeyIcon } from "./UiIcons";

export function IosMobileLoginPage() {
  const store = useJaText();
  const { t } = useI18n();
  const { returnToSlotId, accounts } = useMultiAccountState();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(() =>
    getPendingTwoFactorChallenge(),
  );
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [error, setError] = useState<string>(() => consumePendingOAuthError() ?? "");

  useEffect(() => {
    return subscribePendingTwoFactorChallenge(() => {
      setTwoFactorToken(getPendingTwoFactorChallenge());
    });
  }, []);

  const returnAccount = returnToSlotId
    ? accounts.find((a) => a.slotId === returnToSlotId)
    : undefined;

  const browserLabel = detectIosBrowserLabel();

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        await store.signUpEmail(cleanEmail, password);
      } else {
        await store.signInEmail(cleanEmail, password);
      }
    } catch (err) {
      if (err instanceof TwoFactorRequiredError) {
        setPendingTwoFactorChallenge(err.challengeToken);
        setTwoFactorToken(err.challengeToken);
        setTwoFactorCode("");
        setError("");
      } else {
        setError(
          err instanceof Error
            ? err.message
            : mode === "signup"
              ? "Could not create account."
              : "Invalid email or password.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePasskeySignIn = async () => {
    if (busy || passkeyBusy || !store.signInWithPasskey) return;
    setError("");
    setPasskeyBusy(true);
    try {
      await store.signInWithPasskey(email.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey sign-in failed.");
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleTwoFactorVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!twoFactorToken || !store.completeTwoFactorLogin || busy) return;
    const clean = twoFactorCode.trim();
    if (clean.length < 6) {
      setError("Please enter your 6-digit authentication code.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await store.completeTwoFactorLogin(twoFactorToken, clean);
      setPendingTwoFactorChallenge(null);
      setTwoFactorToken(null);
      setTwoFactorCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid authentication code.");
    } finally {
      setBusy(false);
    }
  };

  if (twoFactorToken) {
    return (
      <div className="jt-ios-login-screen">
        <div className="jt-ios-login-orb jt-ios-login-orb-1" aria-hidden="true" />
        <div className="jt-ios-login-orb jt-ios-login-orb-2" aria-hidden="true" />
        <div className="jt-ios-login-scroll">
          <div className="jt-ios-login-card">
            <button
              type="button"
              className="jt-ios-login-back-slot"
              onClick={() => {
                setPendingTwoFactorChallenge(null);
                setTwoFactorToken(null);
                setTwoFactorCode("");
                setError("");
              }}
            >
              <IosArrowLeftIcon size={15} />
              <span>Back to Sign In</span>
            </button>

            <div className="jt-ios-login-header">
              <div className="jt-ios-login-logo-shell">
                <img src="/jatext-logo-icon.png" alt="JaText" width={62} height={62} />
              </div>
              <span className="jt-ios-login-badge">{t("two_factor_title")}</span>
              <h1>{t("two_factor_title")}</h1>
              <p>{t("enter_auth_code")}</p>
            </div>

            {error && (
              <div className="jt-ios-login-error" role="alert">
                {error}
              </div>
            )}

            <form className="jt-ios-login-form" onSubmit={handleTwoFactorVerify}>
              <label className="jt-ios-input-group">
                <span className="jt-ios-input-label">{t("enter_auth_code")}</span>
                <div className="jt-ios-input-wrap">
                  <IosLockIcon size={16} className="jt-ios-input-icon" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={12}
                    placeholder="123456"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </label>

              <button type="submit" className="jt-ios-submit-btn" disabled={busy}>
                {busy ? "Verifying..." : "Verify & Continue"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jt-ios-login-screen">
      <div className="jt-ios-login-orb jt-ios-login-orb-1" aria-hidden="true" />
      <div className="jt-ios-login-orb jt-ios-login-orb-2" aria-hidden="true" />

      <div className="jt-ios-login-scroll">
        <div className="jt-ios-login-card">
          {returnAccount && (
            <button
              type="button"
              className="jt-ios-login-back-slot"
              onClick={() => void cancelAddAnotherAccount(PUBLIC_TURSO_API_ORIGIN)}
            >
              <IosArrowLeftIcon size={15} />
              <span>Back to @{returnAccount.username}</span>
            </button>
          )}

          <div className="jt-ios-login-header">
            <div className="jt-ios-login-logo-shell">
              <img src="/jatext-logo-icon.png" alt="JaText" width={62} height={62} />
            </div>
            <span className="jt-ios-login-badge">{browserLabel}</span>
            <h1>Welcome to JaText</h1>
            <p>
              {returnAccount
                ? "Sign in to add another account to your iOS switcher."
                : "Sign in to your end-to-end encrypted chats, calls, and themes."}
            </p>
          </div>

          {isWebAuthnSupported() && store.signInWithPasskey && (
            <button
              type="button"
              className="jt-ios-google-btn"
              style={{ marginTop: 8 }}
              disabled={busy || passkeyBusy}
              onClick={() => void handlePasskeySignIn()}
            >
              <KeyIcon size={17} />
              <span>{passkeyBusy ? "Checking Passkey..." : t("sign_in_passkey")}</span>
            </button>
          )}

          <div className="jt-ios-login-divider">
            <span>or continue with email</span>
          </div>

          <div className="jt-ios-login-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              className={mode === "signin" ? "active" : ""}
              onClick={() => {
                setMode("signin");
                setError("");
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? "active" : ""}
              onClick={() => {
                setMode("signup");
                setError("");
              }}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="jt-ios-login-error" role="alert">
              {error}
            </div>
          )}

          <form className="jt-ios-login-form" onSubmit={handleEmailSubmit}>
            <label className="jt-ios-input-group">
              <span className="jt-ios-input-label">Email address</span>
              <div className="jt-ios-input-wrap">
                <IosMailIcon size={16} className="jt-ios-input-icon" />
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </label>

            <label className="jt-ios-input-group">
              <span className="jt-ios-input-label">Password</span>
              <div className="jt-ios-input-wrap">
                <IosLockIcon size={16} className="jt-ios-input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={mode === "signup" ? "At least 6 characters" : "Enter your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="jt-ios-eye-btn"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <IosEyeOffIcon size={16} /> : <IosEyeIcon size={16} />}
                </button>
              </div>
            </label>

            {mode === "signup" && (
              <label className="jt-ios-input-group">
                <span className="jt-ios-input-label">Confirm password</span>
                <div className="jt-ios-input-wrap">
                  <IosLockIcon size={16} className="jt-ios-input-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </label>
            )}

            <button
              type="submit"
              className="jt-ios-submit-btn"
              disabled={busy}
            >
              {busy
                ? mode === "signup"
                  ? "Creating account..."
                  : "Signing in..."
                : mode === "signup"
                  ? "Create JaText Account"
                  : "Sign In"}
            </button>
          </form>

          <div className="jt-ios-login-footer">
            <div className="jt-ios-e2ee-note">
              <IosShieldCheckIcon size={14} />
              <span>Zero-knowledge ECDH P-256 + AES-256-GCM encrypted</span>
            </div>
            <div className="jt-ios-legal-links">
              <a href="/terms.html" target="_blank" rel="noreferrer">
                Terms of Service
              </a>
              <span>·</span>
              <a href="/privacy.html" target="_blank" rel="noreferrer">
                Privacy Policy
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
