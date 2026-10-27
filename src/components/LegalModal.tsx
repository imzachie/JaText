import { useState } from "react";
import { AnimatedModal } from "./AnimatedModal";

export type LegalTab = "terms" | "privacy";

export function LegalModal({
  initialTab = "terms",
  onClose,
}: {
  initialTab?: LegalTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<LegalTab>(initialTab);

  return (
    <AnimatedModal
      onClose={onClose}
      cardClassName="modal-card wide legal-modal-card"
      closeLabel="Close legal document"
    >
      {(requestClose) => (
        <div className="legal-modal-inner">
          <div className="legal-modal-tabs">
            <button
              type="button"
              className={`legal-tab-btn ${tab === "terms" ? "active" : ""}`}
              onClick={() => setTab("terms")}
            >
              📜 Terms of Service
            </button>
            <button
              type="button"
              className={`legal-tab-btn ${tab === "privacy" ? "active" : ""}`}
              onClick={() => setTab("privacy")}
            >
              🔒 Privacy Policy
            </button>
          </div>

          {tab === "terms" ? (
            <article className="legal-doc-content">
              <h2>Terms of Service</h2>
              <p className="muted small">
                For <strong className="accent-text">JaText</strong> · Effective date: 25 October 2026
              </p>
              <p>
                These terms govern your use of JaText, a small independent messaging app. By
                creating an account or using JaText, you agree to these terms and to our{" "}
                <button
                  type="button"
                  className="inline-link-btn"
                  onClick={() => setTab("privacy")}
                >
                  Privacy Policy
                </button>
                .
              </p>

              <h3>1. Your account</h3>
              <ul>
                <li>
                  You must provide accurate information when registering and keep your sign-in
                  credentials secure.
                </li>
                <li>You are responsible for all activity that occurs under your account.</li>
                <li>
                  You must be at least 13 years old, or the minimum age required to hold an account
                  in your country.
                </li>
                <li>
                  Your username can be changed at most once every 14 days, as shown in the app.
                </li>
              </ul>

              <h3>2. Acceptable use</h3>
              <p>When using JaText, you agree not to:</p>
              <ul>
                <li>Harass, threaten, exploit, or harm other users.</li>
                <li>Send spam, scams, malware, or other harmful content.</li>
                <li>Upload content that is illegal, or that you do not have the right to share.</li>
                <li>Impersonate another person in a misleading way.</li>
                <li>
                  Attempt to break, overload, reverse-engineer, or gain unauthorised access to the
                  service or other users&apos; accounts.
                </li>
                <li>Use the service for any unlawful purpose.</li>
              </ul>

              <h3>3. Your content</h3>
              <p>
                You keep ownership of the profile information, messages, and files you submit
                (&ldquo;your content&rdquo;). You give JaText permission to store, transmit, and
                display your content only as needed to operate the service (for example, showing
                your profile to other users and delivering your messages to the people you send them
                to). You are responsible for your content.
              </p>

              <h3>4. Availability</h3>
              <p>
                JaText is a small independent project provided &ldquo;as is&rdquo; and &ldquo;as
                available,&rdquo; without warranties of any kind. The service may change, break,
                lose data, or be discontinued at any time. Do not rely on JaText as your only copy
                of important information.
              </p>

              <h3>5. Suspension and termination</h3>
              <p>
                We may suspend or remove accounts that violate these terms. You may stop using
                JaText at any time and may request deletion of your account using the contact method
                described in the{" "}
                <button
                  type="button"
                  className="inline-link-btn"
                  onClick={() => setTab("privacy")}
                >
                  Privacy Policy
                </button>
                .
              </p>

              <h3>6. Liability</h3>
              <p>
                To the maximum extent allowed by law, JaText and its developer are not liable for
                any indirect, incidental, or consequential damages arising from your use of the
                service.
              </p>

              <h3>7. Changes to these terms</h3>
              <p>
                If these terms change, the updated version will be posted with a new effective date.
                Continuing to use JaText after a change means you accept the updated terms.
              </p>

              <h3>8. Contact</h3>
              <p>
                Questions about these terms can be sent to the developer at the user support email
                shown on the Google sign-in consent screen for JaText.
              </p>
            </article>
          ) : (
            <article className="legal-doc-content">
              <h2>Privacy Policy</h2>
              <p className="muted small">
                For <strong className="accent-text">JaText</strong> · Effective date: 25 October 2026
              </p>
              <p>
                JaText is a small, independent messaging app that lets people create an account,
                build a profile, add friends, and exchange messages and attachments. This policy
                explains what information JaText collects, why, and what happens to it.
              </p>

              <h3>1. Information we collect</h3>
              <ul>
                <li>
                  <strong>Account information.</strong> When you register with an email address and
                  password, we store your email address and authentication credentials handled by
                  Convex Auth; your password is not visible to other users.
                </li>
                <li>
                  <strong>Google sign-in information.</strong> If you choose &ldquo;Continue with
                  Google,&rdquo; Google shares your name, email address, and profile picture with us
                  so we can create and sign you into your JaText account. We do not receive your
                  Google password or access Gmail, Drive, or contacts.
                </li>
                <li>
                  <strong>Profile information.</strong> Display name, username, biography, pronouns,
                  profile picture, banner image, and avatar colour you choose to set.
                </li>
                <li>
                  <strong>Messages and attachments.</strong> The text messages you send and any
                  files you attach are stored so they can be delivered to the participants in that
                  conversation.
                </li>
                <li>
                  <strong>Technical information.</strong> Hosting and backend providers may record
                  standard technical data (such as IP address and request logs) to run and secure
                  the service.
                </li>
              </ul>

              <h3>2. How we use your information</h3>
              <ul>
                <li>To create and operate your account and let you sign in.</li>
                <li>To display your profile to other users of JaText.</li>
                <li>To deliver your messages and attachments to your friends.</li>
                <li>To keep the service running, secure, and free of abuse.</li>
              </ul>
              <p>
                We do not sell your personal information, use your messages for advertising, or show
                third-party ads.
              </p>

              <h3>3. Google user data</h3>
              <p>
                JaText&apos;s use and transfer of information received from Google APIs adheres to
                the Google API Services User Data Policy, including the Limited Use requirements.
              </p>

              <h3>4. Service providers</h3>
              <ul>
                <li>
                  <strong>Convex</strong> — hosts database, authentication, and file storage.
                </li>
                <li>
                  <strong>Vercel</strong> — hosts the JaText website.
                </li>
                <li>
                  <strong>Google</strong> — provides optional sign-in if you choose it.
                </li>
              </ul>

              <h3>5. Data retention and deletion</h3>
              <p>
                Your account data, profile, and messages are kept for as long as your account exists
                so the service can function. Contact us via the support email shown on the Google
                sign-in consent screen to request account deletion.
              </p>

              <h3>6. Children</h3>
              <p>
                JaText is not directed at children under 13 (or the minimum age required in your
                country).
              </p>

              <h3>7. Contact</h3>
              <p>
                For privacy questions or deletion requests, contact the developer at the user
                support email shown on the Google sign-in consent screen for JaText.
              </p>
            </article>
          )}

          <div className="legal-modal-footer">
            <button type="button" className="primary-btn" onClick={requestClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </AnimatedModal>
  );
}
