import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  EMOJI_CATEGORIES,
  getEmojisByCategory,
  getRecentReactions,
  recordRecentReaction,
  searchEmojis,
  type EmojiCategoryId,
} from "../lib/emojis";
import { Smile } from "./CallIcons";
import {
  ClockIcon,
  CloseIcon,
  CompassIcon,
  CupFoodIcon,
  FlagIcon,
  HandWaveIcon,
  HeartOutlineIcon,
  LightbulbIcon,
  PawIcon,
  SearchIcon,
  TrophyIcon,
} from "./UiIcons";

function renderCategoryTabIcon(categoryId: EmojiCategoryId) {
  switch (categoryId) {
    case "recent":
      return <ClockIcon size={17} />;
    case "smileys":
      return <Smile size={17} />;
    case "people":
      return <HandWaveIcon size={17} />;
    case "animals":
      return <PawIcon size={17} />;
    case "food":
      return <CupFoodIcon size={17} />;
    case "activities":
      return <TrophyIcon size={17} />;
    case "travel":
      return <CompassIcon size={17} />;
    case "objects":
      return <LightbulbIcon size={17} />;
    case "symbols":
      return <HeartOutlineIcon size={17} />;
    case "flags":
      return <FlagIcon size={17} />;
  }
}

interface ReactionEmojiPickerProps {
  x?: number;
  y?: number;
  currentEmoji?: string;
  selectedEmojis?: string[];
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export const ReactionEmojiPicker = memo(function ReactionEmojiPicker({
  x,
  y,
  currentEmoji,
  selectedEmojis,
  onSelect,
  onClose,
}: ReactionEmojiPickerProps) {
  const selectedSet = useMemo(() => {
    const s = new Set<string>(selectedEmojis ?? []);
    if (currentEmoji) s.add(currentEmoji);
    return s;
  }, [currentEmoji, selectedEmojis]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<EmojiCategoryId>("smileys");
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const animateAndClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      onClose();
    }, 175);
  };
  const canAnchor =
    typeof window !== "undefined" &&
    window.innerWidth > 680 &&
    x !== undefined &&
    y !== undefined;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(() => {
    if (!canAnchor) return null;
    const width = 356;
    const height = 420;
    return {
      left: Math.max(10, Math.min(x - width / 2, window.innerWidth - width - 10)),
      top: Math.max(10, Math.min(y - 24, window.innerHeight - height - 10)),
    };
  });

  const recentList = useMemo(() => getRecentReactions(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") animateAndClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useLayoutEffect(() => {
    if (!canAnchor || x === undefined || y === undefined) return;
    const panel = panelRef.current;
    if (!panel) return;
    const width = panel.offsetWidth || 356;
    const height = panel.offsetHeight || 420;
    const left = Math.max(10, Math.min(x - width / 2, window.innerWidth - width - 10));
    const top = Math.max(10, Math.min(y - 24, window.innerHeight - height - 10));
    setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
  }, [canAnchor, x, y]);

  const trimmedQuery = query.trim();

  const displayedEmojis = useMemo(() => {
    if (trimmedQuery) {
      return searchEmojis(trimmedQuery).slice(0, 240).map((entry) => entry.emoji);
    }
    if (category === "recent") {
      return recentList;
    }
    return getEmojisByCategory(category).map((entry) => entry.emoji);
  }, [category, recentList, trimmedQuery]);

  const activeCategoryLabel = useMemo(() => {
    if (trimmedQuery) {
      return `Search results (${displayedEmojis.length})`;
    }
    return EMOJI_CATEGORIES.find((cat) => cat.id === category)?.label ?? "Emojis";
  }, [category, displayedEmojis.length, trimmedQuery]);

  function handlePick(emoji: string) {
    recordRecentReaction(emoji);
    onSelect(emoji);
  }

  return createPortal(
    <div
      className={`emoji-picker-backdrop ${closing ? "is-closing" : ""}`}
      onClick={animateAndClose}
      onContextMenu={(event) => event.preventDefault()}
    >
      <section
        ref={panelRef}
        className={`emoji-picker-menu ${pos ? "anchored" : "sheet"} ${closing ? "is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Choose a reaction emoji"
        style={pos ? { left: pos.left, top: pos.top } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="emoji-picker-top">
          <div className="emoji-picker-search-wrap">
            <span className="emoji-picker-search-icon" aria-hidden="true">
              <SearchIcon size={15} />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              className="emoji-picker-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (gridRef.current) gridRef.current.scrollTop = 0;
              }}
              placeholder="Search emojis…"
              aria-label="Search emojis"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                className="emoji-picker-clear"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
              >
                <CloseIcon size={13} />
              </button>
            )}
          </div>
          <button
            type="button"
            className="emoji-picker-close animated-x-btn"
            onClick={animateAndClose}
            aria-label="Close emoji picker"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="emoji-picker-categories" role="tablist" aria-label="Emoji categories">
          {EMOJI_CATEGORIES.map((cat) => {
            const isSelected = !trimmedQuery && category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-label={cat.label}
                title={cat.label}
                className={`emoji-cat-tab ${isSelected ? "active" : ""}`}
                onClick={() => {
                  setQuery("");
                  setCategory(cat.id);
                  if (gridRef.current) gridRef.current.scrollTop = 0;
                }}
              >
                {renderCategoryTabIcon(cat.id)}
              </button>
            );
          })}
        </div>

        <div className="emoji-picker-section-title">{activeCategoryLabel}</div>

        <div ref={gridRef} className="emoji-picker-grid">
          {displayedEmojis.length === 0 ? (
            <div className="emoji-picker-empty">
              No emojis found for “{trimmedQuery}”
            </div>
          ) : (
            displayedEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`emoji-cell ${selectedSet.has(emoji) ? "selected" : ""}`}
                onClick={() => handlePick(emoji)}
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
});
