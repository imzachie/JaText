import { useState } from "react";
import { IosArrowRightIcon, IosBookOpenIcon, IosCompassIcon } from "./IosVectorIcons";
import { detectIosBrowserLabel } from "../lib/iosDetection";
import { navigateToIosChats } from "../lib/webRoute";

interface IosWelcomeGateProps {
  onDismissForReading: () => void;
}

export function IosWelcomeGate({ onDismissForReading }: IosWelcomeGateProps) {
  const [closing, setClosing] = useState(false);
  const browserLabel = detectIosBrowserLabel();

  const handleReadFirst = () => {
    setClosing(true);
    window.setTimeout(() => {
      onDismissForReading();
    }, 220);
  };

  const handleGoToWebsite = () => {
    navigateToIosChats();
  };

  return (
    <div
      className={`jt-ios-gate-backdrop ${closing ? "is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="jt-ios-gate-title"
    >
      <div className="jt-ios-gate-orb jt-ios-gate-orb-a" aria-hidden="true" />
      <div className="jt-ios-gate-orb jt-ios-gate-orb-b" aria-hidden="true" />

      <div className={`jt-ios-gate-card ${closing ? "is-closing" : ""}`}>
        <div className="jt-ios-gate-specular" aria-hidden="true" />

        <div className="jt-ios-gate-top">
          <div className="jt-ios-gate-logo-ring">
            <img src="/jatext-logo-icon.png" alt="JaText" width={46} height={46} />
          </div>
          <span className="jt-ios-gate-browser-pill">
            <IosCompassIcon size={13} strokeWidth={2.3} />
            <span>{browserLabel}</span>
          </span>
        </div>

        <h2 id="jt-ios-gate-title" className="jt-ios-gate-title">
          On iOS?
        </h2>

        <p className="jt-ios-gate-lead">
          Don&apos;t worry. You can access the chat instantly without any further installation.
        </p>

        <div className="jt-ios-gate-note">
          <p>
            The reason we&apos;re doing this cause iOS apps to be put on the app store is expensive
            and we don&apos;t have the money and resources to do it.
          </p>
        </div>

        <div className="jt-ios-gate-actions">
          <button
            type="button"
            className="jt-ios-gate-btn-primary"
            onClick={handleGoToWebsite}
          >
            <span>Go to the website (/ios/chats)</span>
            <IosArrowRightIcon size={17} strokeWidth={2.4} />
          </button>

          <button
            type="button"
            className="jt-ios-gate-btn-secondary"
            onClick={handleReadFirst}
          >
            <IosBookOpenIcon size={16} strokeWidth={2.1} />
            <span>Later, i want to read it first.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
