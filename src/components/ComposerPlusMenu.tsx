import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useJaText } from "../lib/store";
import { OFFICIAL_COMMUNITY_ID } from "../lib/types";
import type { ScheduledMessage, ScheduledTargetKind } from "../lib/types";

export interface ComposerPlusMenuProps {
  targetKind: ScheduledTargetKind;
  targetId: string;
  targetLabel: string;
  disabled?: boolean;
  currentDraft?: string;
  replyToId?: string;
  onConsumeDraft?: () => void;
  onUploadAttachment: () => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalDateInputValue(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toLocalTimeInputValue(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function combineLocalDateAndTime(dateVal: string, timeVal: string): number {
  const [y, m, day] = dateVal.split("-").map((v) => Number(v));
  const [hh, mm] = timeVal.split(":").map((v) => Number(v));
  if (!y || !m || !day || !Number.isFinite(hh) || !Number.isFinite(mm)) {
    return NaN;
  }
  return new Date(y, m - 1, day, hh, mm, 0, 0).getTime();
}

function defaultFutureTimestamp(now = Date.now()): number {
  const base = now + 30 * 60_000;
  const rounded = Math.ceil(base / (5 * 60_000)) * (5 * 60_000);
  return rounded;
}

function formatRelativeCountdown(targetTs: number, nowTs: number): string {
  const diffMs = targetTs - nowTs;
  if (diffMs <= 0) return "Sending now";
  const totalSec = Math.ceil(diffMs / 1000);
  if (totalSec < 60) return `in ${totalSec}s`;
  const totalMin = Math.round(diffMs / 60_000);
  if (totalMin < 60) return `in ${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 24) {
    return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `in ${days}d ${remHours}h` : `in ${days}d`;
}

function formatScheduledDateTime(ts: number, nowTs = Date.now()): string {
  if (!Number.isFinite(ts)) return "";
  const target = new Date(ts);
  const now = new Date(nowTs);
  const sameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const isTomorrow =
    target.getFullYear() === tomorrow.getFullYear() &&
    target.getMonth() === tomorrow.getMonth() &&
    target.getDate() === tomorrow.getDate();

  const timePart = target.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `Today at ${timePart}`;
  if (isTomorrow) return `Tomorrow at ${timePart}`;
  const datePart = target.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(target.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
  return `${datePart} at ${timePart}`;
}

interface QuickPreset {
  id: string;
  label: string;
  computeTs: (now: number) => number;
}

const QUICK_PRESETS: QuickPreset[] = [
  {
    id: "15m",
    label: "In 15 min",
    computeTs: (now) => Math.ceil((now + 15 * 60_000) / 60_000) * 60_000,
  },
  {
    id: "1h",
    label: "In 1 hour",
    computeTs: (now) => Math.ceil((now + 60 * 60_000) / 60_000) * 60_000,
  },
  {
    id: "tonight",
    label: "9:00 PM",
    computeTs: (now) => {
      const d = new Date(now);
      const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21, 0, 0, 0);
      if (candidate.getTime() <= now + 5 * 60_000) {
        candidate.setDate(candidate.getDate() + 1);
      }
      return candidate.getTime();
    },
  },
  {
    id: "tomorrow_am",
    label: "Tomorrow 9 AM",
    computeTs: (now) => {
      const d = new Date(now);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9, 0, 0, 0).getTime();
    },
  },
  {
    id: "24h",
    label: "In 24 hours",
    computeTs: (now) => Math.ceil((now + 24 * 3600_000) / 60_000) * 60_000,
  },
];

export function ComposerPlusMenu({
  targetKind,
  targetId,
  targetLabel,
  disabled = false,
  currentDraft = "",
  replyToId,
  onConsumeDraft,
  onUploadAttachment,
}: ComposerPlusMenuProps) {
  const {
    scheduledMessages = [],
    scheduleMessage,
    refreshScheduledMessages,
    deleteScheduledMessage,
    friends,
    groups,
  } = useJaText();

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const msgInputRef = useRef<HTMLTextAreaElement | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [anchorPos, setAnchorPos] = useState<{ left: number; bottom: number }>({
    left: 16,
    bottom: 72,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<"compose" | "list">("compose");
  const [scopeFilter, setScopeFilter] = useState<"chat" | "all">("chat");

  const [bodyText, setBodyText] = useState("");
  const [dateVal, setDateVal] = useState(() => toLocalDateInputValue(defaultFutureTimestamp()));
  const [timeVal, setTimeVal] = useState(() => toLocalTimeInputValue(defaultFutureTimestamp()));
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [justScheduledId, setJustScheduledId] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Record<string, boolean>>({});
  const [nowTick, setNowTick] = useState(() => Date.now());

  const normalizedTargetId =
    targetKind === "community" ? OFFICIAL_COMMUNITY_ID : targetId;

  const resolvedTargetLabel = useMemo(() => {
    if (targetKind === "group" && (!targetLabel || targetLabel === "Group chat")) {
      const grp = groups.find((g) => g.id === normalizedTargetId);
      if (grp?.name) return grp.name;
    }
    return targetLabel;
  }, [groups, normalizedTargetId, targetKind, targetLabel]);

  const chatScheduled = useMemo(
    () =>
      scheduledMessages.filter(
        (m) =>
          m.targetKind === targetKind &&
          (targetKind === "community" || m.targetId === normalizedTargetId),
      ),
    [normalizedTargetId, scheduledMessages, targetKind],
  );

  const visibleScheduled = scopeFilter === "all" ? scheduledMessages : chatScheduled;

  const resolveItemTargetName = useCallback(
    (item: ScheduledMessage): string => {
      if (item.targetKind === "community") return "Official Community";
      if (item.targetKind === "group") {
        const g = groups.find((grp) => grp.id === item.targetId);
        return g ? g.name : "Group chat";
      }
      const f = friends.find((u) => u.id === item.targetId);
      return f ? `@${f.username}` : "Direct chat";
    },
    [friends, groups],
  );

  const updateAnchorPosition = useCallback(() => {
    const el = btnRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const maxLeft = Math.max(12, window.innerWidth - 268);
    setAnchorPos({
      left: Math.max(10, Math.min(rect.left, maxLeft)),
      bottom: Math.max(12, window.innerHeight - rect.top + 10),
    });
  }, []);

  const closeMenuAnimated = useCallback(() => {
    if (!menuOpen || menuClosing) return;
    setMenuClosing(true);
    window.setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 155);
  }, [menuClosing, menuOpen]);

  const toggleMenu = useCallback(() => {
    if (disabled) return;
    if (menuOpen) {
      closeMenuAnimated();
      return;
    }
    updateAnchorPosition();
    setMenuClosing(false);
    setMenuOpen(true);
  }, [closeMenuAnimated, disabled, menuOpen, updateAnchorPosition]);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    updateAnchorPosition();
    const onResize = () => updateAnchorPosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [menuOpen, updateAnchorPosition]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (btnRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      closeMenuAnimated();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenuAnimated();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMenuAnimated, menuOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, [modalOpen]);

  const openScheduleModal = useCallback(
    (initialTab: "compose" | "list" = "compose") => {
      closeMenuAnimated();
      const seedTs = defaultFutureTimestamp();
      setDateVal(toLocalDateInputValue(seedTs));
      setTimeVal(toLocalTimeInputValue(seedTs));
      setSelectedPreset(null);
      setErrorMsg(null);
      setScopeFilter("chat");
      setActiveTab(initialTab);
      if (currentDraft.trim()) {
        setBodyText(currentDraft);
      }
      setNowTick(Date.now());
      setModalClosing(false);
      setModalOpen(true);
      void refreshScheduledMessages?.().catch(() => undefined);
      if (initialTab === "compose") {
        window.setTimeout(() => {
          msgInputRef.current?.focus({ preventScroll: true });
        }, 90);
      }
    },
    [closeMenuAnimated, currentDraft, refreshScheduledMessages],
  );

  const closeModalAnimated = useCallback(() => {
    if (!modalOpen || modalClosing) return;
    setModalClosing(true);
    window.setTimeout(() => {
      setModalOpen(false);
      setModalClosing(false);
      setErrorMsg(null);
    }, 210);
  }, [modalClosing, modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModalAnimated();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeModalAnimated, modalOpen]);

  const applyPreset = (preset: QuickPreset) => {
    const ts = preset.computeTs(Date.now());
    setDateVal(toLocalDateInputValue(ts));
    setTimeVal(toLocalTimeInputValue(ts));
    setSelectedPreset(preset.id);
    setErrorMsg(null);
    setNowTick(Date.now());
  };

  const chosenTimestamp = useMemo(
    () => combineLocalDateAndTime(dateVal, timeVal),
    [dateVal, timeVal],
  );

  const isFutureValid = Number.isFinite(chosenTimestamp) && chosenTimestamp > nowTick + 3_000;

  const handleScheduleSubmit = async () => {
    if (!scheduleMessage || submitting) return;
    const trimmed = bodyText.trim();
    if (!trimmed) {
      setErrorMsg("Type a message to schedule.");
      msgInputRef.current?.focus();
      return;
    }
    const ts = combineLocalDateAndTime(dateVal, timeVal);
    if (!Number.isFinite(ts) || ts <= Date.now() + 2500) {
      setErrorMsg("Pick a time in the future.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const hadMatchingComposerDraft =
        Boolean(currentDraft.trim()) && currentDraft.trim() === trimmed;
      const created = await scheduleMessage(
        targetKind,
        normalizedTargetId,
        trimmed,
        ts,
        replyToId,
      );
      if (hadMatchingComposerDraft) {
        onConsumeDraft?.();
      }
      setBodyText("");
      setJustScheduledId(created.id);
      setActiveTab("list");
      window.setTimeout(() => {
        setJustScheduledId((prev) => (prev === created.id ? null : prev));
      }, 2400);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not schedule message.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveItem = async (id: string) => {
    if (!deleteScheduledMessage || removingIds[id]) return;
    setRemovingIds((prev) => ({ ...prev, [id]: true }));
    window.setTimeout(() => {
      void deleteScheduledMessage(id)
        .catch(() => undefined)
        .finally(() => {
          setRemovingIds((prev) => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
          });
        });
    }, 250);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`icon-btn attach-btn composer-plus-btn ${menuOpen && !menuClosing ? "is-open" : ""}`}
        title="More actions"
        aria-label="More actions"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={toggleMenu}
      >
        <span className="composer-plus-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.35"
              strokeLinecap="round"
            />
          </svg>
        </span>
        {chatScheduled.length > 0 && (
          <span
            className="composer-plus-sched-dot"
            title={`${chatScheduled.length} scheduled`}
          >
            {chatScheduled.length > 9 ? "9+" : chatScheduled.length}
          </span>
        )}
      </button>

      {menuOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            aria-label="Composer actions"
            className={`composer-plus-popover ${menuClosing ? "is-closing" : "is-entering"}`}
            style={{
              left: `${anchorPos.left}px`,
              bottom: `${anchorPos.bottom}px`,
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="composer-plus-item item-upload"
              onClick={() => {
                closeMenuAnimated();
                onUploadAttachment();
              }}
            >
              <span className="composer-plus-item-icon upload-tint" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                  <path
                    d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 16.5v1.75A1.75 1.75 0 0 0 5.75 20h12.5A1.75 1.75 0 0 0 20 18.25V16.5"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="composer-plus-item-copy">
                <strong>Upload attachment</strong>
                <small>Photos, videos, or files</small>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              className="composer-plus-item item-schedule"
              onClick={() => openScheduleModal("compose")}
            >
              <span className="composer-plus-item-icon schedule-tint" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                  <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2.05" />
                  <path
                    d="M12 7.5v4.8l3.2 2"
                    stroke="currentColor"
                    strokeWidth="2.05"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="composer-plus-item-copy">
                <strong>Schedule message</strong>
                <small>
                  {chatScheduled.length > 0
                    ? `${chatScheduled.length} queued · View or add`
                    : "Choose a future send time"}
                </small>
              </span>
              {chatScheduled.length > 0 && (
                <span className="composer-plus-count-pill">{chatScheduled.length}</span>
              )}
            </button>

            {chatScheduled.length > 0 && (
              <button
                type="button"
                role="menuitem"
                className="composer-plus-item item-scheduled-list"
                onClick={() => openScheduleModal("list")}
              >
                <span className="composer-plus-item-icon list-tint" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
                    <path
                      d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
                      stroke="currentColor"
                      strokeWidth="2.15"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="composer-plus-item-copy">
                  <strong>Scheduled message</strong>
                  <small>Manage {chatScheduled.length} pending</small>
                </span>
              </button>
            )}
          </div>,
          document.body,
        )}

      {modalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`sched-modal-backdrop ${modalClosing ? "is-closing" : "is-entering"}`}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeModalAnimated();
            }}
          >
            <div
              className={`sched-modal-card ${modalClosing ? "is-closing" : "is-entering"}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="sched-modal-title"
            >
              <div className="sched-modal-sheet-grabber" aria-hidden="true" />
              <div className="sched-modal-header">
                <div className="sched-modal-title-wrap">
                  <span className="sched-modal-hero-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2.1" />
                      <path
                        d="M12 7.5v4.8l3.2 2"
                        stroke="currentColor"
                        strokeWidth="2.1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <div>
                    <h3 id="sched-modal-title">Schedule message</h3>
                    <p className="sched-modal-subtitle">Sending to {resolvedTargetLabel}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="sched-modal-close-btn"
                  aria-label="Close schedule message dialog"
                  onClick={closeModalAnimated}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="sched-segmented-tabs" role="tablist">
                <div
                  className={`sched-segmented-glider ${activeTab === "list" ? "at-list" : "at-compose"}`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "compose"}
                  className={`sched-seg-btn ${activeTab === "compose" ? "active" : ""}`}
                  onClick={() => setActiveTab("compose")}
                >
                  New schedule
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "list"}
                  className={`sched-seg-btn ${activeTab === "list" ? "active" : ""}`}
                  onClick={() => setActiveTab("list")}
                >
                  <span>Scheduled message</span>
                  <span className="sched-seg-badge">{chatScheduled.length}</span>
                </button>
              </div>

              <div className="sched-modal-body">
                {activeTab === "compose" ? (
                  <div className="sched-pane sched-pane-compose" key="compose-pane">
                    <label className="sched-field-label" htmlFor="sched-message-textarea">
                      Message
                    </label>
                    <textarea
                      id="sched-message-textarea"
                      ref={msgInputRef}
                      className="sched-textarea"
                      rows={3}
                      maxLength={4000}
                      placeholder={`Write your message for ${resolvedTargetLabel}…`}
                      value={bodyText}
                      onChange={(e) => {
                        setBodyText(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                          e.preventDefault();
                          void handleScheduleSubmit();
                        }
                      }}
                    />

                    <div className="sched-presets-section">
                      <span className="sched-field-label">Quick time</span>
                      <div className="sched-preset-chips">
                        {QUICK_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={`sched-preset-chip ${selectedPreset === preset.id ? "selected" : ""}`}
                            onClick={() => applyPreset(preset)}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="sched-datetime-grid">
                      <label className="sched-dt-field">
                        <span>Date</span>
                        <input
                          type="date"
                          min={toLocalDateInputValue(nowTick)}
                          value={dateVal}
                          onChange={(e) => {
                            setDateVal(e.target.value);
                            setSelectedPreset(null);
                            if (errorMsg) setErrorMsg(null);
                          }}
                        />
                      </label>
                      <label className="sched-dt-field">
                        <span>Time</span>
                        <input
                          type="time"
                          value={timeVal}
                          onChange={(e) => {
                            setTimeVal(e.target.value);
                            setSelectedPreset(null);
                            if (errorMsg) setErrorMsg(null);
                          }}
                        />
                      </label>
                    </div>

                    <div
                      className={`sched-live-preview-pill ${isFutureValid ? "valid" : "invalid"}`}
                    >
                      <span className="sched-live-dot" aria-hidden="true" />
                      <span>
                        {isFutureValid
                          ? `Sends ${formatScheduledDateTime(chosenTimestamp, nowTick)} · ${formatRelativeCountdown(chosenTimestamp, nowTick)}`
                          : "Select a time in the future"}
                      </span>
                    </div>

                    {errorMsg && <div className="sched-error-banner">{errorMsg}</div>}

                    <div className="sched-compose-actions">
                      <button
                        type="button"
                        className="sched-secondary-btn"
                        onClick={closeModalAnimated}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="sched-primary-btn"
                        disabled={submitting || !bodyText.trim() || !isFutureValid}
                        onClick={() => void handleScheduleSubmit()}
                      >
                        {submitting ? "Scheduling…" : "Schedule message"}
                      </button>
                    </div>

                    {chatScheduled.length > 0 && (
                      <div className="sched-inline-mini-list">
                        <div className="sched-inline-mini-head">
                          <span>Scheduled message ({chatScheduled.length})</span>
                          <button
                            type="button"
                            className="sched-inline-view-all"
                            onClick={() => setActiveTab("list")}
                          >
                            Manage all
                          </button>
                        </div>
                        {chatScheduled.slice(0, 2).map((item) => (
                          <div
                            key={item.id}
                            className={`sched-item-card compact ${removingIds[item.id] ? "is-removing" : ""}`}
                          >
                            <div className="sched-item-main">
                              <div className="sched-item-time-row">
                                <span className="sched-item-when">
                                  {formatScheduledDateTime(item.scheduledAt, nowTick)}
                                </span>
                                <span className="sched-item-eta">
                                  {formatRelativeCountdown(item.scheduledAt, nowTick)}
                                </span>
                              </div>
                              <p className="sched-item-body">{item.body}</p>
                            </div>
                            <button
                              type="button"
                              className="sched-remove-btn"
                              aria-label="Remove scheduled message"
                              onClick={() => void handleRemoveItem(item.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="sched-pane sched-pane-list" key="list-pane">
                    {scheduledMessages.length > chatScheduled.length && (
                      <div className="sched-scope-row">
                        <button
                          type="button"
                          className={`sched-scope-pill ${scopeFilter === "chat" ? "active" : ""}`}
                          onClick={() => setScopeFilter("chat")}
                        >
                          This chat ({chatScheduled.length})
                        </button>
                        <button
                          type="button"
                          className={`sched-scope-pill ${scopeFilter === "all" ? "active" : ""}`}
                          onClick={() => setScopeFilter("all")}
                        >
                          All chats ({scheduledMessages.length})
                        </button>
                      </div>
                    )}

                    {visibleScheduled.length === 0 ? (
                      <div className="sched-empty-state">
                        <div className="sched-empty-orb" aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
                            <circle
                              cx="12"
                              cy="12"
                              r="8.5"
                              stroke="currentColor"
                              strokeWidth="1.9"
                            />
                            <path
                              d="M12 7.5v4.8l3.2 2"
                              stroke="currentColor"
                              strokeWidth="1.9"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                        <strong>No scheduled messages</strong>
                        <p>
                          Messages you schedule appear here until their send time arrives.
                        </p>
                        <button
                          type="button"
                          className="sched-primary-btn"
                          onClick={() => setActiveTab("compose")}
                        >
                          Schedule a message
                        </button>
                      </div>
                    ) : (
                      <div className="sched-items-stack">
                        {visibleScheduled.map((item, idx) => (
                          <div
                            key={item.id}
                            style={{ animationDelay: `${Math.min(idx * 35, 180)}ms` }}
                            className={`sched-item-card ${removingIds[item.id] ? "is-removing" : ""} ${justScheduledId === item.id ? "just-created" : ""}`}
                          >
                            <div className="sched-item-main">
                              <div className="sched-item-time-row">
                                {scopeFilter === "all" && (
                                  <span className="sched-item-target-chip">
                                    {resolveItemTargetName(item)}
                                  </span>
                                )}
                                <span className="sched-item-when">
                                  {formatScheduledDateTime(item.scheduledAt, nowTick)}
                                </span>
                                <span className="sched-item-eta">
                                  {formatRelativeCountdown(item.scheduledAt, nowTick)}
                                </span>
                              </div>
                              <p className="sched-item-body">{item.body}</p>
                            </div>
                            <button
                              type="button"
                              className="sched-remove-btn"
                              aria-label="Remove scheduled message"
                              onClick={() => void handleRemoveItem(item.id)}
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                                <path
                                  d="M6 7h12M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7m-6.5 0 .7 11a1.5 1.5 0 0 0 1.5 1.4h3.6a1.5 1.5 0 0 0 1.5-1.4L16.5 7"
                                  stroke="currentColor"
                                  strokeWidth="1.9"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              <span>Remove</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
