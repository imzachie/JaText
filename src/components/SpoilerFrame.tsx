import { useState, type ReactNode } from "react";
import { IosEyeOffIcon } from "./IosVectorIcons";

/**
 * Hides an attachment behind a blur until the reader chooses to see it.
 *
 * The media is rendered underneath from the start, blurred rather than
 * replaced, so revealing it is instant and the bubble keeps its real size.
 * Once revealed the children are handed back untouched, which keeps the
 * image viewer and the video controls working exactly as they normally do.
 */
export function SpoilerFrame({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  if (!active || revealed) return <>{children}</>;
  return (
    <div
      className="spoiler-frame"
      role="button"
      tabIndex={0}
      aria-label="Reveal spoiler"
      onClick={() => setRevealed(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setRevealed(true);
        }
      }}
    >
      <div className="spoiler-frame-media" aria-hidden="true">
        {children}
      </div>
      <div className="spoiler-frame-veil">
        <IosEyeOffIcon size={16} />
        <span>Spoiler</span>
        <span className="spoiler-frame-hint">Tap to reveal</span>
      </div>
    </div>
  );
}

/** The pill in the composer that marks a staged file as a spoiler. */
export function SpoilerToggle({
  active,
  onToggle,
  name,
}: {
  active: boolean;
  onToggle: () => void;
  name: string;
}) {
  return (
    <button
      type="button"
      className={`spoiler-toggle ${active ? "is-on" : ""}`}
      aria-pressed={active}
      aria-label={active ? `${name} is marked as a spoiler` : `Mark ${name} as a spoiler`}
      onClick={onToggle}
    >
      <IosEyeOffIcon size={12} />
      <span>Spoiler</span>
    </button>
  );
}
