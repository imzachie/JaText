import { useEffect } from "react";
import { IosArrowLeftIcon, IosShieldAlertIcon } from "./IosVectorIcons";
import { navigateToLanding } from "../lib/webRoute";

export function IosUnauthorized404() {
  useEffect(() => {
    const prev = document.title;
    document.title = "404 Error | JaText";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background:
          "radial-gradient(circle at 50% 0%, #1d1633 0%, #0b0b10 58%, #07070b 100%)",
        color: "#f4f4f8",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif',
      }}
    >
      <main
        style={{
          width: "100%",
          maxWidth: 440,
          padding: "36px 28px",
          borderRadius: 28,
          background: "rgba(255, 255, 255, 0.055)",
          border: "1px solid rgba(255, 255, 255, 0.14)",
          boxShadow:
            "0 28px 64px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderRadius: 999,
            background: "rgba(239, 68, 68, 0.14)",
            border: "1px solid rgba(248, 113, 113, 0.34)",
            color: "#fca5a5",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          <IosShieldAlertIcon size={14} />
          <span>Restricted Route</span>
        </div>

        <h1
          style={{
            fontSize: 38,
            lineHeight: 1.1,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "#ffffff",
            marginBottom: 12,
          }}
        >
          404 Error
        </h1>

        <p
          style={{
            fontSize: 15.5,
            lineHeight: 1.55,
            color: "rgba(244, 244, 248, 0.78)",
            marginBottom: 26,
          }}
        >
          You have no authorization to access this page.
        </p>

        <button
          type="button"
          onClick={() => navigateToLanding()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "13px 20px",
            borderRadius: 16,
            background: "rgba(255, 255, 255, 0.1)",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            color: "#ffffff",
            fontSize: 14.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <IosArrowLeftIcon size={16} />
          <span>Back to JaText Home</span>
        </button>
      </main>
    </div>
  );
}
