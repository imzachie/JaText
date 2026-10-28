import { useState, type FormEvent } from "react";
import { useJaText } from "../lib/store";
import { LegalModal, type LegalTab } from "./LegalModal";
import { FlaskIcon, MessageCircleIcon, PaletteIcon, UsersIcon } from "./UiIcons";

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-4.8C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 4.8C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  );
}

export function LoginPage() {
  const store = useJaText();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDemoGoogle, setShowDemoGoogle] = useState(false);
  const [gName, setGName] = useState("Alex Google");
  const [gEmail, setGEmail] = useState("Alex@example.com");
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onEmailSubmit(e: FormEvent) {
    e.preventDefault();
    void run(() =>
      tab === "signin"
        ? store.signInEmail(email, password)
        : store.signUpEmail(email, password),
    );
  }

  function onGoogle() {
    if (store.mode === "demo") {
      setShowDemoGoogle(true);
      return;
    }
    void run(() => store.signInGoogle());
  }

  return (
    <div className="login-page">
      <section className="login-hero">
        <img
          className="logo-full"
          src="/jatext-logo-full.png"
          alt="JaText — JAMusic Coding and Research Corp"
        />
        <p className="hero-tagline">
          Text your people. Add friends by username, make your profile yours,
          and chat in real time.
        </p>
        <ul className="hero-points">
          <li>
            <MessageCircleIcon size={16} style={{ color: "var(--accent)" }} /> Real-time chats &amp; attachments
          </li>
          <li>
            <PaletteIcon size={16} style={{ color: "var(--accent)" }} /> Profile picture, banner &amp; your own avatar color
          </li>
          <li>
            <UsersIcon size={16} style={{ color: "var(--accent)" }} /> Friend requests — you only chat with people you accept
          </li>
        </ul>
      </section>

      <section className="login-card">
        <h2>{tab === "signin" ? "Welcome back" : "Create your account"}</h2>

        <button className="google-btn" onClick={onGoogle} disabled={busy}>
          <GoogleIcon /> Continue with Google
        </button>

        {showDemoGoogle && (
          <div className="demo-google-box">
            <p className="muted small">
              <FlaskIcon size={14} /> Demo mode: this simulates a Google account. Connect Convex +
              Google OAuth (see README) for the real Google sign-in popup.
            </p>
            <label>
              Name
              <input value={gName} onChange={(e) => setGName(e.target.value)} />
            </label>
            <label>
              Google email
              <input value={gEmail} onChange={(e) => setGEmail(e.target.value)} />
            </label>
            <button
              className="primary-btn"
              disabled={busy}
              onClick={() => void run(() => store.signInGoogle({ name: gName, email: gEmail }))}
            >
              Continue as {gName || "Guest"}
            </button>
          </div>
        )}

        <div className="divider"><span>or</span></div>

        <div className="tabs">
          <button className={tab === "signin" ? "active" : ""} onClick={() => setTab("signin")}>
            Sign in
          </button>
          <button className={tab === "signup" ? "active" : ""} onClick={() => setTab("signup")}>
            Sign up
          </button>
        </div>

        <form onSubmit={onEmailSubmit} className="login-form">
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? "Please wait…" : tab === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {store.mode === "demo" ? (
          <p className="muted small center">
            Running in <strong>demo mode</strong> (no Convex URL set yet) — your data
            lives in this browser. Add <code>VITE_CONVEX_URL</code> to go live on Convex.
          </p>
        ) : null}

        <div className="login-legal-footer">
          <span className="muted small">By continuing, you agree to JaText&apos;s</span>
          <div className="legal-inline-btns">
            <button type="button" className="inline-link-btn" onClick={() => setLegalTab("terms")}>
              Terms of Service
            </button>
            <span className="muted small">·</span>
            <button type="button" className="inline-link-btn" onClick={() => setLegalTab("privacy")}>
              Privacy Policy
            </button>
          </div>
        </div>
      </section>
      {legalTab && <LegalModal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
    </div>
  );
}
