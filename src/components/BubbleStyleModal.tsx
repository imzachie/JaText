import { useState } from "react";
import {
  BUBBLE_STYLES,
  type BubbleStyleId,
  useOutgoingBubbleStyle,
} from "../lib/chatCustomization";
import { BubblePreviewThumb } from "./BubbleStyleArtwork";

export function BubbleStyleModal({ onClose }: { onClose: () => void }) {
  const [savedStyle, saveStyle] = useOutgoingBubbleStyle();
  const [selected, setSelected] = useState<BubbleStyleId>(savedStyle);

  function handleSave() {
    saveStyle(selected);
    onClose();
  }

  return (
    <div
      className="modal-backdrop bubble-style-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bubble style"
    >
      <div
        className="bubble-style-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bubble-style-handle-wrap" onClick={onClose}>
          <span className="bubble-style-handle" />
        </div>

        <div className="bubble-style-header">
          <h3 className="bubble-style-title">Suggested</h3>
          <p className="bubble-style-subtitle">
            The bubble applies to all chats. It only affects messages you send after saving.
          </p>
        </div>

        <div className="bubble-style-grid" role="listbox" aria-label="Suggested bubble styles">
          {BUBBLE_STYLES.map((item) => {
            const isSelected = selected === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`bubble-style-tile ${isSelected ? "selected" : ""}`}
                onClick={() => setSelected(item.id)}
              >
                <BubblePreviewThumb styleId={item.id} />
                <span className="bubble-style-label">{item.label}</span>
                {item.limited ? (
                  <span className="bubble-style-limited">Limited</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="bubble-style-footer">
          <button
            type="button"
            className="bubble-style-cancel-btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="bubble-style-save-btn"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
