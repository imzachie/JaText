import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type RefObject } from "react";
import { useJaText } from "../lib/store";
import type { PollVoter } from "../lib/types";
import { playMessageSound } from "../lib/alerts";
import {
  isSoftKeyboardCurrentlyOpen,
  useChatAutoScrollAndKeyboard,
} from "../lib/useChatAutoScrollAndKeyboard";
import {
  copyImageUrlToClipboard,
  extractClipboardFile,
  useChatImagePaste,
} from "../lib/clipboard";
import { syncComposerTextareaHeight } from "../lib/composerUtils";
import { getSavedOutgoingBubbleStyle } from "../lib/chatCustomization";
import { clearDraft, getDraft, setDraft as saveStoredDraft } from "../lib/drafts";
import { decodeVoiceNoteMime, isVoiceNoteOrAudio, saveCachedVoiceTranscript } from "../lib/voiceNotes";
import { friendlyError } from "../lib/errors";
import { AnimatedModal } from "./AnimatedModal";
import { IosEmojiGlyph, IosEmojiText } from "./IosEmoji";
import { AnimatedMediaImg, Avatar } from "./Avatar";
import { BubbleStyleModal } from "./BubbleStyleModal";
import { DecoratedMessageBubble } from "./BubbleStyleArtwork";
import { ChatAttachmentImage } from "./ChatAttachmentImage";
import { ChatVideoPlayer } from "./ChatVideoPlayer";
import { ComposerPlusMenu } from "./ComposerPlusMenu";
import { ForwardedMessageCard } from "./ForwardedMessageCard";
import { SpoilerFrame } from "./SpoilerFrame";
import { MessageLinkEmbeds } from "./LinkEmbeds";
import { MessageMarkdown } from "./MessageMarkdown";
import { ReactionEmojiPicker } from "./ReactionEmojiPicker";
import { SwipeToReply } from "./SwipeToReply";
import { StickerPicker } from "./StickerPicker";
import { ContextMenu } from "./ContextMenu";
import { isChatActivelyVisibleToUser } from "../lib/nativeBridge";
import { OFFICIAL_COMMUNITY_ID, type CommunityMessage, type JaUser, type StickerMedia } from "../lib/types";
import {
  clearPendingMessageJump,
  getPendingMessageJump,
  subscribeMessageJumps,
} from "../lib/forwardedContext";
import {
  ArrowLeftIcon,
  BubblePaletteIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  EditIcon,
  FileTextIcon,
  ForwardIcon,
  ImageIcon,
  LinkIcon,
  MicVoiceIcon,
  PaperclipIcon,
  PlusIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  SmilePlusIcon,
  StarIcon,
  TrashIcon,
  UndoIcon,
  UsersIcon,
} from "./UiIcons";
import { VoiceNotePlayer } from "./VoiceNotePlayer";
import { DeleteForMeToast, type DeletedForMeUndoState } from "./DeleteForMeToast";
import {
  restoreSnapTargetVisibilityById,
  triggerMessageThanosSnapById,
  useUnsendThanosWatcher,
} from "../lib/thanosSnapEffect";
import { VoiceNoteRecorder } from "./VoiceNoteRecorder";

const UNSEND_WINDOW_MS = 60 * 60 * 1000;
const PENDING_MESSAGE_MATCH_WINDOW_MS = 30_000;
const PENDING_NEAR_MATCH_WINDOW_MS = 30_000;

interface MessageMenuState {
  x: number;
  y: number;
  message: CommunityMessage;
  canUnsend: boolean;
  canEdit: boolean;
}

function PollOption({
  message,
  option,
  index,
  count,
  totalVotes,
  percentage,
  showResults,
  onVote,
}: {
  message: CommunityMessage;
  option: string;
  index: number;
  count: number;
  totalVotes: number;
  percentage: number;
  showResults: boolean;
  onVote: (pollId: string, optionIndex: number) => void;
}) {
  const [animatedPercent, setAnimatedPercent] = useState(0);
  useEffect(() => {
    if (!showResults) return;
    const frame = window.requestAnimationFrame(() => setAnimatedPercent(percentage));
    return () => window.cancelAnimationFrame(frame);
  }, [showResults, percentage]);

  return (
    <button
      type="button"
      className={`community-poll-option ${message.myVote === index ? "selected" : ""} ${showResults ? "show-results" : ""}`}
      disabled={!!message.pollEndedAt}
      onClick={() => onVote(message.id, index)}
    >
      {showResults && (
        <span
          className="community-poll-option-fill"
          aria-hidden="true"
          style={{ width: `${showResults ? animatedPercent : 0}%` }}
        />
      )}
      <span className="community-poll-option-label">{option}</span>
      {showResults && (
        <span className="community-poll-option-result">
          {percentage}% · {count} vote{count === 1 ? "" : "s"}
        </span>
      )}
      {!showResults && totalVotes > 0 && (
        <span className="community-poll-option-result muted">{count} vote{count === 1 ? "" : "s"}</span>
      )}
    </button>
  );
}

function CommunityVoterDialog({
  poll,
  onClose,
}: {
  poll: CommunityMessage;
  onClose: () => void;
}) {
  const store = useJaText();
  const [voterQuery, setVoterQuery] = useState<PollVoter[] | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    if (!store.getCommunityPollVoters) {
      setVoterQuery([]);
      return;
    }
    void store
      .getCommunityPollVoters(poll.id)
      .then((list) => {
        if (!cancelled) setVoterQuery(list);
      })
      .catch(() => {
        if (!cancelled) setVoterQuery([]);
      });
    return () => {
      cancelled = true;
    };
  }, [poll.id, store]);
  const voters = voterQuery ?? [];
  return (
    <AnimatedModal
      onClose={onClose}
      cardClassName="modal-card community-voters-dialog"
      closeLabel="Close voter list"
    >
      {() => (
        <>
          <h2>Who voted</h2>
          <p className="muted small">{poll.body}</p>
          <div className="community-voter-options">
            {poll.pollOptions.map((option, optionIndex) => {
              const optionVoters = voters.filter((vote) => vote.optionIndex === optionIndex);
              return (
                <section className="community-voter-option" key={`${poll.id}-voters-${optionIndex}`}>
                  <h3>
                    Option {optionIndex + 1}: {option}{" "}
                    <span className="muted">({optionVoters.length})</span>
                  </h3>
                  {voterQuery === undefined ? (
                    <p className="muted small">Loading voters…</p>
                  ) : optionVoters.length > 0 ? (
                    <div className="community-voter-list">
                      {optionVoters.map((voter) => (
                        <div className="community-voter" key={voter.userId}>
                          <Avatar
                            user={{
                              displayName: voter.displayName,
                              username: voter.username,
                              avatarColor: voter.avatarColor,
                              avatarUrl: voter.avatarUrl,
                            }}
                            size={36}
                          />
                          <span>
                            <strong>{voter.displayName || voter.username}</strong>
                            <small className="muted">@{voter.username}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">No votes yet.</p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </AnimatedModal>
  );
}

function CommunityTypingStatus() {
  const { communityTypingUsers: typingUsers } = useJaText();
  if (!typingUsers?.length) return null;
  const names = typingUsers.map((user) => user.displayName || user.username);
  return (
    <div className="chat-typing-status" role="status">
      {names.length === 1
        ? `${names[0]} is typing…`
        : `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""} are typing…`}
    </div>
  );
}

function getCommunityPendingMessages(
  pending: CommunityMessage[],
  real: CommunityMessage[],
  myUserId?: string,
) {
  const pendingCopy = [...pending];
  const matchedIds = new Set<string>();
  const confirmed = real.map((message) => {
    let idx = pendingCopy.findIndex(
      (p) =>
        p.senderId === message.senderId &&
        message.createdAt >= p.createdAt - 60_000 &&
        message.createdAt <= p.createdAt + PENDING_MESSAGE_MATCH_WINDOW_MS &&
        (message.unsentAt ||
          Boolean(message.editedAt) ||
          (message.body === p.body && message.attachmentName === p.attachmentName)),
    );
    // Same fallback as the group view: our own message may come back with a
    // body that differs from what we rendered, and then the bubble we already
    // saw would sit next to the delivered one.
    if (idx === -1 && myUserId && message.senderId === myUserId) {
      idx = pendingCopy.findIndex(
        (p) =>
          p.senderId === message.senderId &&
          Math.abs(message.createdAt - p.createdAt) <= PENDING_NEAR_MATCH_WINDOW_MS,
      );
    }
    if (idx === -1) return message;
    const [pm] = pendingCopy.splice(idx, 1);
    matchedIds.add(pm.id);
    return { ...message, renderKey: pm.id };
  });
  return { messages: [...confirmed, ...pendingCopy].sort((a, b) => a.createdAt - b.createdAt), matchedIds };
}

const CommunityChatComposer = memo(function CommunityChatComposer({
  initialDraft,
  hasFile,
  isEditing,
  showPoll,
  composerRef,
  fileInputRef,
  onSelectFile,
  onSelectSticker,
  onStartVoiceNote,
  onTogglePoll,
  onMobileActivate,
  onTypingSignal,
  onSubmitDraft,
}: {
  initialDraft: string;
  hasFile: boolean;
  isEditing: boolean;
  showPoll: boolean;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onSelectFile: (file: File | null) => void;
  onSelectSticker: (sticker: StickerMedia) => Promise<void>;
  onStartVoiceNote: () => void;
  onTogglePoll: () => void;
  onMobileActivate: () => void;
  onTypingSignal: (hasText: boolean) => void;
  onSubmitDraft: (body: string) => void;
}) {
  const draftKey = "community";
  const startText = isEditing ? initialDraft : initialDraft || getDraft(draftKey);
  const [draft, setDraft] = useState(startText);
  const prevLenRef = useRef(startText.length);

  useLayoutEffect(() => {
    const seed = isEditing ? initialDraft : initialDraft || getDraft(draftKey);
    syncComposerTextareaHeight(composerRef.current, 0, seed);
    prevLenRef.current = seed.length;
  }, [composerRef, draftKey, initialDraft, isEditing]);

  function handleChange(next: string) {
    const prevLen = prevLenRef.current;
    prevLenRef.current = next.length;
    setDraft(next);
    if (!isEditing) saveStoredDraft(draftKey, next);
    syncComposerTextareaHeight(composerRef.current, prevLen, next);
    if (!isEditing) {
      onTypingSignal(Boolean(next.trim()));
    }
  }

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = draft.trim();
    if (isEditing ? !trimmed : !trimmed && !hasFile) return;
    const keepFocus =
      document.activeElement === composerRef.current && isSoftKeyboardCurrentlyOpen();
    prevLenRef.current = 0;
    setDraft("");
    if (!isEditing) clearDraft(draftKey);
    syncComposerTextareaHeight(composerRef.current, trimmed.length, "");
    onSubmitDraft(trimmed);
    if (keepFocus) {
      composerRef.current?.focus({ preventScroll: true });
    }
  }

  return (
    <form className="composer community-composer" onSubmit={handleSubmit}>
      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={(e) => {
          onSelectFile(e.target.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />
      <ComposerPlusMenu
        targetKind="community"
        targetId="community"
        targetLabel="Official Community"
        disabled={isEditing}
        currentDraft={draft}
        onConsumeDraft={() => handleChange("")}
        onUploadAttachment={() => fileInputRef.current?.click()}
      />
      <StickerPicker friendId="" disabled={isEditing} onSelect={onSelectSticker} />
      <button
        type="button"
        className="icon-btn voice-note-btn"
        title="Record voice note"
        aria-label="Record voice note"
        disabled={isEditing}
        onClick={onStartVoiceNote}
      >
        <MicVoiceIcon size={18} />
      </button>
      <button
        type="button"
        className={`icon-btn poll-toggle-btn ${showPoll ? "active" : ""}`}
        title="Create poll"
        aria-label="Create poll"
        aria-expanded={showPoll}
        disabled={isEditing}
        onClick={onTogglePoll}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 20V11M12 20V4M19 20v-7" />
        </svg>
      </button>
      <textarea
        ref={composerRef}
        value={draft}
        maxLength={4000}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={onMobileActivate}
        onClick={onMobileActivate}
        rows={1}
        placeholder={isEditing ? "Edit message…" : "Message…"}
        aria-label="Community message"
        onPaste={(event) => {
          if (isEditing) return;
          const pasted = extractClipboardFile(event.clipboardData);
          if (pasted) {
            event.preventDefault();
            onSelectFile(pasted);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSubmit();
          }
        }}
      />
      <button
        type="submit"
        className="send-btn"
        disabled={isEditing ? !draft.trim() : !draft.trim() && !hasFile}
        onPointerDown={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
        aria-label={isEditing ? "Save edit" : "Send message"}
      >
        {isEditing ? <CheckIcon size={19} strokeWidth={2.6} /> : <SendIcon size={18} />}
      </button>
    </form>
  );
});

export function CommunityChatView({
  onOpenProfile,
  onBack,
}: {
  onOpenProfile?: (user: JaUser) => void;
  onBack: () => void;
}) {
  const store = useJaText();
  const setCommunityTyping = store.setCommunityTyping;
  const toggleCommunityReaction = store.toggleCommunityReaction;
  const [composerSeed, setComposerSeed] = useState({ nonce: 0, text: "" });
  const [file, setFile] = useState<File | null>(null);
  const [recordingVoiceNote, setRecordingVoiceNote] = useState(false);
  const [shownTranscriptIds, setShownTranscriptIds] = useState<Record<string, boolean>>({});
  const [deletedUndoState, setDeletedUndoState] = useState<DeletedForMeUndoState | null>(null);
  const [locallyHiddenIds, setLocallyHiddenIds] = useState<Record<string, true>>({});
  const deletedSnapshotRef = useRef<Map<string, CommunityMessage>>(new Map());
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [showPoll, setShowPoll] = useState(false);
  const [showModerators, setShowModerators] = useState(false);
  const [selectedModerators, setSelectedModerators] = useState<string[]>([]);
  const [directorySearchOpen, setDirectorySearchOpen] = useState(false);
  const [directorySearch, setDirectorySearch] = useState("");
  const [editingMessage, setEditingMessage] = useState<{ id: string; body: string } | null>(null);
  const [voterPollId, setVoterPollId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnsendWarning, setShowUnsendWarning] = useState(false);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [messageMenuClosing, setMessageMenuClosing] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<{
    x: number;
    y: number;
    message: CommunityMessage;
  } | null>(null);
  const [bubbleStyleOpen, setBubbleStyleOpen] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const communityPrependAnchorRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const fetchingOlderCommunityRef = useRef(false);

  function cancelPostTouchHold() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }

  function startPostPointerHold(
    event: React.PointerEvent<HTMLElement>,
    message: CommunityMessage,
  ) {
    if (event.pointerType !== "touch" || message.id.startsWith("pending-")) return;
    longPressOriginRef.current = { x: event.clientX, y: event.clientY };
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    const { clientX, clientY } = event;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      openMessageMenuAt(clientX, clientY, message);
    }, 450);
  }

  function movePostPointerHold(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType !== "touch" || !longPressOriginRef.current) return;
    if (
      Math.hypot(
        event.clientX - longPressOriginRef.current.x,
        event.clientY - longPressOriginRef.current.y,
      ) > 12
    ) {
      cancelPostTouchHold();
    }
  }
  const [forwardMessage, setForwardMessage] = useState<CommunityMessage | null>(null);
  const [bulkForwardIds, setBulkForwardIds] = useState<string[] | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardClosing, setForwardClosing] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<CommunityMessage[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageClosing, setImageClosing] = useState(false);

  const messagesElement = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const directorySearchInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | null>(null);
  const typingRef = useRef(false);
  const wasPinnedRef = useRef(true);
  const voterPoll = store.communityMessages.find((message) => message.id === voterPollId);
  const pendingAttachmentUrlsRef = useRef(new Map<string, string>());
  const lastPendingAtRef = useRef(0);
  const imageElementRef = useRef<HTMLImageElement>(null);
  const imageTransformRef = useRef({ scale: 1, x: 0, y: 0 });
  const imageGestureRef = useRef<
    | { mode: "pinch"; distance: number; scale: number; x: number; y: number; centerX: number; centerY: number }
    | { mode: "pan"; touchX: number; touchY: number; x: number; y: number }
    | null
  >(null);
  const imageCloseTimerRef = useRef<number | null>(null);
  const messageMenuCloseTimerRef = useRef<number | null>(null);
  const forwardCloseTimerRef = useRef<number | null>(null);
  const setCommunityTypingRef = useRef(setCommunityTyping);

  const filteredDirectory = store.communityDirectory
    .map((person, index) => ({ person, index }))
    .filter(({ person }) => {
      const search = directorySearch.trim().toLowerCase();
      return (
        !search ||
        person.displayName.toLowerCase().includes(search) ||
        person.username.toLowerCase().includes(search)
      );
    });

  const pendingMerged = getCommunityPendingMessages(
    pendingMessages,
    store.communityMessages,
    store.me?.id,
  );
  const visiblePendingMerged = useMemo(
    () =>
      pendingMerged.messages.filter(
        (m) => !locallyHiddenIds[m.id] && !(m.renderKey && locallyHiddenIds[m.renderKey]),
      ),
    [locallyHiddenIds, pendingMerged.messages],
  );
  const displayedMessages = useUnsendThanosWatcher(
    visiblePendingMerged,
    OFFICIAL_COMMUNITY_ID,
  );
  const matchedPendingIds = pendingMerged.matchedIds;

  useLayoutEffect(() => {
    const anchor = communityPrependAnchorRef.current;
    const el = messagesElement.current;
    if (anchor && el) {
      communityPrependAnchorRef.current = null;
      const delta = el.scrollHeight - anchor.prevHeight;
      if (delta > 0) {
        el.scrollTop = anchor.prevTop + delta;
      }
    }
  }, [displayedMessages.length, messagesElement]);

  const communityScrollSettleRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (communityScrollSettleRef.current !== null) {
        window.clearTimeout(communityScrollSettleRef.current);
      }
    },
    [],
  );

  const triggerFetchOlderCommunity = useCallback(() => {
    const el = messagesElement.current;
    if (
      !el ||
      !store.hasMoreOlderCommunityMessages ||
      !store.loadOlderCommunityMessages ||
      store.loadingOlderCommunityMessages ||
      fetchingOlderCommunityRef.current
    ) {
      return;
    }
    fetchingOlderCommunityRef.current = true;
    communityPrependAnchorRef.current = {
      prevHeight: el.scrollHeight,
      prevTop: el.scrollTop,
    };
    void store
      .loadOlderCommunityMessages()
      .then((added) => {
        if (!added) {
          communityPrependAnchorRef.current = null;
        }
      })
      .finally(() => {
        fetchingOlderCommunityRef.current = false;
      });
  }, [
    messagesElement,
    store.hasMoreOlderCommunityMessages,
    store.loadOlderCommunityMessages,
    store.loadingOlderCommunityMessages,
  ]);

  useEffect(() => {
    setCommunityTypingRef.current = setCommunityTyping;
  }, [setCommunityTyping]);

  const tailCommunityMsg = displayedMessages.at(-1);
  const { handleMobileComposerActivate } = useChatAutoScrollAndKeyboard({
    conversationKey: "community:official",
    messagesReady: store.communityMessagesReady,
    messageCount: displayedMessages.length,
    tailMessageKey: tailCommunityMsg
      ? `${tailCommunityMsg.id}:${tailCommunityMsg.createdAt}`
      : "",
    tailSenderId: tailCommunityMsg?.senderId,
    myUserId: store.me?.id,
    messagesRef: messagesElement,
    composerRef,
    onPinnedChange: (pinned) => {
      wasPinnedRef.current = pinned;
    },
  });

  useEffect(() => {
    for (const id of matchedPendingIds) {
      const url = pendingAttachmentUrlsRef.current.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        pendingAttachmentUrlsRef.current.delete(id);
      }
    }
  }, [matchedPendingIds]);

  useEffect(() => () => {
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    if (typingRef.current) {
      void setCommunityTypingRef.current(false).catch((cause: unknown) => {
        console.error("Could not clear community typing status.", cause);
      });
    }
    for (const url of pendingAttachmentUrlsRef.current.values()) URL.revokeObjectURL(url);
    pendingAttachmentUrlsRef.current.clear();
  }, []);

  const openImagePreview = useCallback((url: string) => {
    if (imageCloseTimerRef.current !== null) {
      window.clearTimeout(imageCloseTimerRef.current);
      imageCloseTimerRef.current = null;
    }
    if (typeof document !== "undefined") {
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === "function") active.blur();
    }
    imageTransformRef.current = { scale: 1, x: 0, y: 0 };
    imageGestureRef.current = null;
    setImageClosing(false);
    setImagePreview(url);
  }, []);
  const closeImagePreview = useCallback(() => {
    if (imageCloseTimerRef.current !== null) window.clearTimeout(imageCloseTimerRef.current);
    setImageClosing(true);
    imageCloseTimerRef.current = window.setTimeout(() => {
      setImagePreview(null);
      setImageClosing(false);
      imageCloseTimerRef.current = null;
    }, 200);
  }, []);

  useEffect(() => {
    if (!imagePreview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeImagePreview();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeImagePreview, imagePreview]);
  const closeMessageMenu = useCallback(() => {
    if (messageMenuCloseTimerRef.current !== null) return;
    setMessageMenuClosing(true);
    messageMenuCloseTimerRef.current = window.setTimeout(() => {
      setMessageMenu(null);
      setMessageMenuClosing(false);
      messageMenuCloseTimerRef.current = null;
    }, 140);
  }, []);
  function closeForwardDialog() {
    if (!forwardMessage || forwardClosing) return;
    setForwardClosing(true);
    forwardCloseTimerRef.current = window.setTimeout(() => {
      setForwardMessage(null);
      setForwardClosing(false);
      forwardCloseTimerRef.current = null;
    }, 160);
  }
  function applyImageTransform(scale: number, x: number, y: number) {
    const image = imageElementRef.current;
    if (!image) return;
    const viewport = image.parentElement;
    const maxX = Math.max(0, (image.offsetWidth * scale - (viewport?.clientWidth ?? 0)) / 2);
    const maxY = Math.max(0, (image.offsetHeight * scale - (viewport?.clientHeight ?? 0)) / 2);
    const boundedX = Math.max(-maxX, Math.min(maxX, x));
    const boundedY = Math.max(-maxY, Math.min(maxY, y));
    imageTransformRef.current = { scale, x: boundedX, y: boundedY };
    image.style.transform = `translate3d(${boundedX}px, ${boundedY}px, 0) scale(${scale})`;
  }
  function startImageGesture(event: React.TouchEvent<HTMLImageElement>) {
    const transform = imageTransformRef.current;
    if (event.touches.length >= 2) {
      const [first, second] = Array.from(event.touches);
      imageGestureRef.current = {
        mode: "pinch",
        distance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
        scale: transform.scale,
        x: transform.x,
        y: transform.y,
        centerX: (first.clientX + second.clientX) / 2,
        centerY: (first.clientY + second.clientY) / 2,
      };
    } else if (transform.scale > 1) {
      const touch = event.touches[0];
      imageGestureRef.current = { mode: "pan", touchX: touch.clientX, touchY: touch.clientY, x: transform.x, y: transform.y };
    } else imageGestureRef.current = null;
  }
  function moveImageGesture(event: React.TouchEvent<HTMLImageElement>) {
    const gesture = imageGestureRef.current;
    const image = event.currentTarget;
    if (event.touches.length >= 2) {
      event.preventDefault();
      const [first, second] = Array.from(event.touches);
      const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      const centerX = (first.clientX + second.clientX) / 2;
      const centerY = (first.clientY + second.clientY) / 2;
      const base =
        gesture?.mode === "pinch"
          ? gesture
          : { mode: "pinch" as const, distance, scale: imageTransformRef.current.scale, x: imageTransformRef.current.x, y: imageTransformRef.current.y, centerX, centerY };
      if (gesture?.mode !== "pinch") imageGestureRef.current = base;
      const scale = Math.min(4, Math.max(1, (base.scale * distance) / Math.max(base.distance, 1)));
      const ratio = scale / base.scale;
      const bounds = image.parentElement?.getBoundingClientRect();
      const imageCenterX = (bounds?.left ?? 0) + (bounds?.width ?? window.innerWidth) / 2 + base.x;
      const imageCenterY = (bounds?.top ?? 0) + (bounds?.height ?? window.innerHeight) / 2 + base.y;
      const x = base.x + centerX - base.centerX + (base.centerX - imageCenterX) * (1 - ratio);
      const y = base.y + centerY - base.centerY + (base.centerY - imageCenterY) * (1 - ratio);
      applyImageTransform(scale, x, y);
      return;
    }
    if (gesture?.mode === "pan" && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      applyImageTransform(imageTransformRef.current.scale, gesture.x + touch.clientX - gesture.touchX, gesture.y + touch.clientY - gesture.touchY);
    }
  }
  function endImageGesture(event: React.TouchEvent<HTMLImageElement>) {
    if (event.touches.length === 1 && imageTransformRef.current.scale > 1) {
      const touch = event.touches[0];
      imageGestureRef.current = { mode: "pan", touchX: touch.clientX, touchY: touch.clientY, x: imageTransformRef.current.x, y: imageTransformRef.current.y };
      return;
    }
    imageGestureRef.current = null;
  }

  function openForwardDialog(message: CommunityMessage) {
    if (forwardCloseTimerRef.current !== null) {
      window.clearTimeout(forwardCloseTimerRef.current);
      forwardCloseTimerRef.current = null;
    }
    setForwardSearch("");
    setForwardClosing(false);
    setForwardMessage(message);
    closeMessageMenu();
  }

  const focusedEditIdRef = useRef<string | null>(null);
  const inlineEditRefCallback = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (!el || !editingMessage) return;
      if (focusedEditIdRef.current === editingMessage.id) return;
      focusedEditIdRef.current = editingMessage.id;
      window.requestAnimationFrame(() => {
        el.focus({ preventScroll: true });
        const end = el.value.length;
        el.setSelectionRange(end, end);
        el.scrollTop = el.scrollHeight;
      });
    },
    [editingMessage],
  );
  useEffect(() => {
    if (!editingMessage) {
      focusedEditIdRef.current = null;
    }
  }, [editingMessage]);

  const handlePastedCommunityFile = useCallback((pasted: File) => {
    setFile(pasted);
    window.setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 0);
  }, []);

  useChatImagePaste(
    handlePastedCommunityFile,
    Boolean(store.communityPermissions.canModerate) && !editingMessage && !recordingVoiceNote,
  );

  async function handleSubmitCommunityDraft(submittedBody: string) {
    if (editingMessage) {
      if (!submittedBody) return;
      const targetId = editingMessage.id;
      setError(null);
      setEditingMessage(null);
      setFile(null);
      setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
      try {
        await store.editCommunityMessage(targetId, submittedBody);
      } catch (cause) {
        setError(friendlyError(cause, "Could not edit the announcement."));
      }
      return;
    }
    if (!submittedBody && !file) return;
    const sentBody = submittedBody;
    const sentFile = file;
    const sentReply = replyTo;
    const sentAt = Math.max(Date.now(), lastPendingAtRef.current + 1);
    lastPendingAtRef.current = sentAt;
    const pendingId = `pending-${sentAt}`;
    const attachmentUrl = sentFile ? URL.createObjectURL(sentFile) : undefined;
    if (attachmentUrl) pendingAttachmentUrlsRef.current.set(pendingId, attachmentUrl);
    wasPinnedRef.current = true;
    setPendingMessages((cur) => [
      ...cur.slice(-299),
      {
        id: pendingId,
        senderId: store.me?.id ?? "",
        senderName: store.me?.displayName ?? "",
        senderUsername: store.me?.username ?? "",
        senderAvatarUrl: store.me?.avatarUrl,
        senderAvatarColor: store.me?.avatarColor ?? "black",
        body: sentBody,
        bubbleStyle: getSavedOutgoingBubbleStyle(),
        type: "text" as const,
        pollOptions: [],
        votes: [],
        createdAt: sentAt,
        canModerate: true,
        isOwner: false,
        attachmentUrl,
        attachmentName: sentFile?.name,
        attachmentType: sentFile?.type,
      },
    ]);
    window.requestAnimationFrame(() => {
      if (messagesElement.current) {
        messagesElement.current.scrollTop = messagesElement.current.scrollHeight;
      }
    });
    setFile(null);
    setReplyTo(null);
    setError(null);
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    typingRef.current = false;
    void setCommunityTyping(false).catch(() => undefined);
    try {
      await store.sendCommunityText(sentBody, sentFile ?? undefined, sentReply?.id, undefined);
      if (store.soundsEnabled) playMessageSound("sent");
      window.setTimeout(() => {
        const url = pendingAttachmentUrlsRef.current.get(pendingId);
        if (url) {
          URL.revokeObjectURL(url);
          pendingAttachmentUrlsRef.current.delete(pendingId);
        }
        setPendingMessages((cur) => cur.filter((m) => m.id !== pendingId));
      }, 1500);
    } catch (cause) {
      const url = pendingAttachmentUrlsRef.current.get(pendingId);
      if (url) {
        URL.revokeObjectURL(url);
        pendingAttachmentUrlsRef.current.delete(pendingId);
      }
      setPendingMessages((cur) => cur.filter((m) => m.id !== pendingId));
      if (sentBody) {
        setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: sentBody }));
      }
      if (sentFile) setFile((cur) => cur ?? sentFile);
      setError(friendlyError(cause, "Could not post to the community."));
    }
  }

  const handleCommunityTypingSignal = useCallback(
    (typing: boolean) => {
      if (typing !== typingRef.current) {
        typingRef.current = typing;
        window.setTimeout(() => {
          void setCommunityTyping(typing).catch((cause: unknown) => {
            setError(friendlyError(cause, "Couldn't update typing status."));
          });
        }, 0);
      }
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      if (typing) {
        typingTimer.current = window.setTimeout(() => {
          typingRef.current = false;
          void setCommunityTyping(false).catch((cause: unknown) => {
            setError(friendlyError(cause, "Couldn't update typing status."));
          });
        }, 3500);
      }
    },
    [setCommunityTyping],
  );

  async function sendSticker(sticker: Parameters<typeof store.sendCommunitySticker>[0]) {
    try {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      typingRef.current = false;
      await setCommunityTyping(false);
      await store.sendCommunitySticker(sticker, replyTo?.id);
      setReplyTo(null);
    } catch (cause) {
      setError(friendlyError(cause, "Could not send the sticker."));
    }
  }

  async function sendPoll(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.createCommunityPoll(pollQuestion, pollOptions);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setShowPoll(false);
    } catch (cause) {
      setError(friendlyError(cause, "Could not create the poll."));
    } finally {
      setBusy(false);
    }
  }

  async function saveModerators() {
    setBusy(true);
    setError(null);
    try {
      await store.setCommunityModerators(selectedModerators);
      setShowModerators(false);
    } catch (cause) {
      setError(friendlyError(cause, "Could not update community moderators."));
    } finally {
      setBusy(false);
    }
  }

  async function vote(pollId: string, optionIndex: number) {
    try {
      await store.voteCommunityPoll(pollId, optionIndex);
    } catch (cause) {
      setError(friendlyError(cause, "Could not submit your vote."));
    }
  }

  async function endPoll(pollId: string) {
    try {
      await store.endCommunityPoll(pollId);
    } catch (cause) {
      setError(friendlyError(cause, "Could not end the poll."));
    }
  }

  async function saveAnnouncement(event: FormEvent) {
    event.preventDefault();
    if (!editingMessage || busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.editCommunityMessage(editingMessage.id, editingMessage.body);
      setEditingMessage(null);
      setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
    } catch (cause) {
      setError(friendlyError(cause, "Could not edit the announcement."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAnnouncement(messageId: string) {
    closeMessageMenu();
    const sweepDone = new Promise<void>((resolve) => {
      const started = triggerMessageThanosSnapById(messageId, undefined, () => resolve());
      if (!started) resolve();
    });
    setError(null);
    try {
      const delReq = store.deleteCommunityMessage(messageId);
      await Promise.all([sweepDone, delReq]);
    } catch (cause) {
      restoreSnapTargetVisibilityById(messageId);
      setError(friendlyError(cause, "Could not delete the announcement."));
    }
  }

  const openMessageMenuAt = useCallback(
    (x: number, y: number, message: CommunityMessage) => {
      if (messageMenuCloseTimerRef.current !== null) {
        window.clearTimeout(messageMenuCloseTimerRef.current);
        messageMenuCloseTimerRef.current = null;
      }
      setMessageMenuClosing(false);
      const now = Date.now();
      setMessageMenu({
        x,
        y,
        message,
        canUnsend:
          message.senderId === store.me?.id &&
          !message.unsentAt &&
          now - message.createdAt < UNSEND_WINDOW_MS,
        canEdit:
          message.senderId === store.me?.id &&
          !message.unsentAt &&
          message.type === "text" &&
          !!message.body.trim(),
      });
    },
    [store.me?.id],
  );

  const openMessageMenu = useCallback(
    (event: MouseEvent, message: CommunityMessage) => {
      event.preventDefault();
      event.stopPropagation();
      openMessageMenuAt(event.clientX, event.clientY, message);
    },
    [openMessageMenuAt],
  );

  async function sendCommunityVoiceNote(voiceFile: File) {
    setRecordingVoiceNote(false);
    const sentReply = replyTo;
    const sentAt = Math.max(Date.now(), lastPendingAtRef.current + 1);
    lastPendingAtRef.current = sentAt;
    const pendingId = `pending-${sentAt}`;
    const cleanAudioBlob = new Blob([voiceFile], {
      type: voiceFile.type.split(";")[0] || "audio/webm",
    });
    const attachmentUrl = URL.createObjectURL(cleanAudioBlob);
    pendingAttachmentUrlsRef.current.set(pendingId, attachmentUrl);
    const meta = decodeVoiceNoteMime(voiceFile.type);
    if (meta?.transcript) {
      saveCachedVoiceTranscript(pendingId, meta.transcript);
    }
    wasPinnedRef.current = true;
    setPendingMessages((cur) => [
      ...cur.slice(-299),
      {
        id: pendingId,
        senderId: store.me?.id ?? "",
        senderName: store.me?.displayName ?? "",
        senderUsername: store.me?.username ?? "",
        senderAvatarUrl: store.me?.avatarUrl,
        senderAvatarColor: store.me?.avatarColor ?? "black",
        body: "",
        type: "text" as const,
        pollOptions: [],
        votes: [],
        createdAt: sentAt,
        canModerate: true,
        isOwner: false,
        attachmentUrl,
        attachmentName: voiceFile.name,
        attachmentType: voiceFile.type,
      },
    ]);
    setReplyTo(null);
    setError(null);
    try {
      await store.sendCommunityText("", voiceFile, sentReply?.id, undefined);
      if (store.soundsEnabled) playMessageSound("sent");
    } catch (cause) {
      const url = pendingAttachmentUrlsRef.current.get(pendingId);
      if (url) {
        URL.revokeObjectURL(url);
        pendingAttachmentUrlsRef.current.delete(pendingId);
      }
      setPendingMessages((cur) => cur.filter((m) => m.id !== pendingId));
      setError(friendlyError(cause, "Could not post voice note."));
    }
  }
  function replyToMessage(message: CommunityMessage) {
    setReplyTo(message);
    closeMessageMenu();
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }
  function startEditingMessage(message: CommunityMessage) {
    setPendingMessages([]);
    setEditingMessage({ id: message.id, body: message.body });
    setReplyTo(null);
    setFile(null);
    setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
    closeMessageMenu();
  }
  const toggleSelectedId = useCallback((messageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectedMessages = useMemo(
    () =>
      displayedMessages
        .filter((message) => selectedIds.has(message.id) && !message.id.startsWith("pending-"))
        .sort((a, b) => a.createdAt - b.createdAt),
    [displayedMessages, selectedIds],
  );

  async function copySelectedMessages() {
    const text = selectedMessages
      .map((message) =>
        message.unsentAt
          ? "This message was unsent"
          : message.body || message.attachmentUrl || "",
      )
      .filter(Boolean)
      .join("\n");
    exitSelectionMode();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      setError(friendlyError(err, "Couldn't copy the posts."));
    }
  }

  async function deleteSelectedForMe() {
    const targets = selectedMessages;
    exitSelectionMode();
    for (const message of targets) {
      setLocallyHiddenIds((prev) => ({
        ...prev,
        [message.id]: true,
        ...(message.renderKey ? { [message.renderKey]: true } : {}),
      }));
      try {
        await store.deleteCommunityMessageForMe(message.id);
      } catch (err) {
        setError(friendlyError(err, "Couldn't delete one of the posts."));
      }
    }
  }

  function forwardSelectedMessages() {
    const targets = selectedMessages;
    if (targets.length === 0) return;
    setBulkForwardIds(targets.map((message) => message.id));
    setForwardMessage(targets[0]);
    exitSelectionMode();
  }

  async function copyMessage(message: CommunityMessage) {
    try {
      await navigator.clipboard.writeText(message.unsentAt ? "This message was unsent" : message.body || message.attachmentName || message.stickerName || "");
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't copy the message."));
    }
  }
  async function copyImageAddress(message: CommunityMessage) {
    const url = message.attachmentUrl ?? message.stickerUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't copy the image address."));
    }
  }
  async function copyImage(message: CommunityMessage) {
    const url = message.attachmentUrl ?? message.stickerUrl;
    if (!url) return;
    try {
      await copyImageUrlToClipboard(url);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't copy the image."));
    }
  }
  async function deleteForMe(message: CommunityMessage) {
    closeMessageMenu();
    deletedSnapshotRef.current.set(message.id, message);
    setLocallyHiddenIds((prev) => ({
      ...prev,
      [message.id]: true,
      ...(message.renderKey ? { [message.renderKey]: true } : {}),
    }));
    setPendingMessages((cur) =>
      cur.filter(
        (m) =>
          m.id !== message.id &&
          m.id !== message.renderKey &&
          !(
            m.senderId === message.senderId &&
            m.body === message.body &&
            Math.abs(m.createdAt - message.createdAt) < 60_000
          ),
      ),
    );
    setDeletedUndoState({
      messageId: message.id,
      nonce: Date.now(),
      expiresAt: Date.now() + 5_000,
    });
    try {
      await store.deleteCommunityMessageForMe(message.id);
    } catch (err) {
      setLocallyHiddenIds((prev) => {
        const next = { ...prev };
        delete next[message.id];
        if (message.renderKey) delete next[message.renderKey];
        return next;
      });
      setDeletedUndoState(null);
      setError(friendlyError(err, "Couldn't delete the message."));
    }
  }
  async function undoDeleteForMe(messageId: string) {
    const snap = deletedSnapshotRef.current.get(messageId);
    deletedSnapshotRef.current.delete(messageId);
    setLocallyHiddenIds((prev) => {
      const next = { ...prev };
      delete next[messageId];
      if (snap?.renderKey) delete next[snap.renderKey];
      return next;
    });
    setDeletedUndoState(null);
    if (!snap || !store.restoreCommunityMessageForMe) return;
    try {
      await store.restoreCommunityMessageForMe(snap);
    } catch (err) {
      setError(friendlyError(err, "Couldn't restore the message."));
    }
  }
  async function unsend(message: CommunityMessage) {
    closeMessageMenu();
    const sweepDone = new Promise<void>((resolve) => {
      const started = triggerMessageThanosSnapById(message.id, undefined, () => resolve());
      if (!started) resolve();
    });
    try {
      const unsendReq = store.unsendCommunityMessage(message.id);
      const [, shouldShowWarning] = await Promise.all([sweepDone, unsendReq]);
      if (shouldShowWarning) setShowUnsendWarning(true);
    } catch (err) {
      restoreSnapTargetVisibilityById(message.id);
      setError(friendlyError(err, "Couldn't unsend the message."));
    }
  }
  const reactToMessage = useCallback(
    async (message: CommunityMessage, emoji: string) => {
      try {
        await toggleCommunityReaction(message.id, emoji);
        closeMessageMenu();
        setReactionTarget(null);
      } catch (err) {
        setError(friendlyError(err, "Couldn't add the reaction."));
      }
    },
    [closeMessageMenu, toggleCommunityReaction],
  );
  async function favoriteSticker(message: CommunityMessage) {
    try {
      await store.favoriteCommunityStickerFromMessage(message.id);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't update your sticker favourites."));
    }
  }
  async function forwardToFriend(receiverId: string) {
    if (!forwardMessage) return;
    const forwardIds = bulkForwardIds ?? [forwardMessage.id];
    try {
      for (const id of forwardIds) {
        await store.forwardCommunityMessage(id, { userId: receiverId });
      }
      setBulkForwardIds(null);
      closeForwardDialog();
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't forward the message."));
    }
  }
  async function forwardToGroup(targetGroupId: string) {
    if (!forwardMessage) return;
    try {
      for (const id of bulkForwardIds ?? [forwardMessage.id]) {
        await store.forwardCommunityMessage(id, { groupId: targetGroupId });
      }
      setBulkForwardIds(null);
      closeForwardDialog();
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't forward the message."));
    }
  }
  async function forwardToCommunity() {
    if (!forwardMessage) return;
    try {
      await store.forwardCommunityMessage(forwardMessage.id, { community: true });
      closeForwardDialog();
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't forward the message."));
    }
  }

  const [highlightedCommunityJumpId, setHighlightedCommunityJumpId] = useState<string | null>(
    null,
  );

  const {
    communityMessagesReady,
    communityUnreadCount,
    markCommunityRead,
    me: communityMe,
  } = store;

  // Mark community announcements read when actively viewing Official Community
  useEffect(() => {
    if (!communityMe?.id || !communityMessagesReady || communityUnreadCount === 0) {
      return;
    }
    let cancelled = false;
    const maybeMarkRead = async () => {
      if (cancelled) return;
      const activelyViewing = await isChatActivelyVisibleToUser();
      if (cancelled || !activelyViewing) return;
      await markCommunityRead().catch(() => undefined);
    };
    void maybeMarkRead();
    const onVis = () => void maybeMarkRead();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [
    communityMe?.id,
    communityMessagesReady,
    communityUnreadCount,
    markCommunityRead,
  ]);

  // Jump-to-original message inside Official Community
  useEffect(() => {
    const attemptJump = () => {
      const pending = getPendingMessageJump("community", OFFICIAL_COMMUNITY_ID);
      if (!pending || displayedMessages.length === 0) return;
      const exists = displayedMessages.some((m) => m.id === pending.messageId);
      if (!exists) return;
      clearPendingMessageJump(pending.messageId);
      wasPinnedRef.current = false;
      window.requestAnimationFrame(() => {
        const el = document.getElementById(`community-message-${pending.messageId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlightedCommunityJumpId(pending.messageId);
          window.setTimeout(() => {
            setHighlightedCommunityJumpId((cur) =>
              cur === pending.messageId ? null : cur,
            );
          }, 2400);
        }
      });
    };
    attemptJump();
    return subscribeMessageJumps(() => {
      attemptJump();
    });
  }, [displayedMessages]);

  return (
    <section className="chat community-chat">
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={19} />
        </button>
        <img className="community-mark" src="/jatext-logo-icon.png" alt="" />
        <div className="chat-title community-title">
          <strong>JaText Community</strong>
          <span className="community-title-badges">
            <span className="verified-badge" title="Verified JaText account">
              <CheckIcon size={11} strokeWidth={3} />
            </span>
            <span className="official-badge">Official</span>
          </span>
        </div>
        {store.communityPermissions.isOwner && (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setSelectedModerators(store.communityPermissions.moderatorIds);
              setShowModerators(true);
            }}
          >
            Elect People …
          </button>
        )}
      </header>

      {showUnsendWarning && (
        <div className="unsend-warning-banner" role="status">
          <span>You unsent a message. In the meantime, they may have already seen it, screenshotted it, or reported it.</span>
          <button type="button" className="unsend-warning-dismiss" aria-label="Dismiss unsend notice" onClick={() => setShowUnsendWarning(false)}>
            <CloseIcon size={15} />
          </button>
        </div>
      )}

      {selectionMode && (
        <div className="bulk-select-bar" role="toolbar" aria-label="Selected posts">
          <span className="bulk-select-count">{selectedIds.size} selected</span>
          <button
            type="button"
            className="bulk-select-action"
            disabled={selectedIds.size === 0}
            onClick={() => void copySelectedMessages()}
          >
            <CopyIcon size={14} /> Copy
          </button>
          <button
            type="button"
            className="bulk-select-action"
            disabled={selectedIds.size === 0}
            onClick={forwardSelectedMessages}
          >
            <ForwardIcon size={14} /> Forward
          </button>
          <button
            type="button"
            className="bulk-select-action danger"
            disabled={selectedIds.size === 0}
            onClick={() => void deleteSelectedForMe()}
          >
            <TrashIcon size={14} /> Delete
          </button>
          <button type="button" className="bulk-select-close" onClick={exitSelectionMode}>
            <CloseIcon size={15} />
          </button>
        </div>
      )}

      <div
        className="messages community-messages"
        ref={messagesElement}
        onScroll={() => {
          if (!store.hasMoreOlderCommunityMessages) return;
          if (communityScrollSettleRef.current !== null) {
            window.clearTimeout(communityScrollSettleRef.current);
          }
          communityScrollSettleRef.current = window.setTimeout(() => {
            communityScrollSettleRef.current = null;
            const element = messagesElement.current;
            if (element && element.scrollTop < 120 && store.hasMoreOlderCommunityMessages) {
              triggerFetchOlderCommunity();
            }
          }, 140);
        }}
      >
        {Boolean(store.hasMoreOlderCommunityMessages) && displayedMessages.length > 0 && (
          <div className="older-messages-bar">
            <button
              type="button"
              className="older-messages-btn"
              disabled={Boolean(store.loadingOlderCommunityMessages)}
              onClick={triggerFetchOlderCommunity}
            >
              {store.loadingOlderCommunityMessages
                ? "Loading older announcements…"
                : "Load older announcements"}
            </button>
          </div>
        )}
        {displayedMessages.length === 0 && (
          <div className="empty-box center">
            <strong>Welcome to the JaText Community</strong>
            <span className="muted">Official updates and polls will appear here.</span>
          </div>
        )}
        {displayedMessages.map((message) => {
          const counts = message.pollOptions.map(
            (_, index) => message.votes.filter((vote) => vote.optionIndex === index).length,
          );
          const totalVotes = counts.reduce((total, count) => total + count, 0);
          const canManagePost =
            store.communityPermissions.canModerate &&
            (store.communityPermissions.isOwner || message.senderId === store.me?.id);
          const showResults = !!message.pollEndedAt || message.myVote !== undefined;
          const isAudioNote = isVoiceNoteOrAudio(message.attachmentType, message.attachmentName);
          const isImage =
            !isAudioNote &&
            (Boolean(message.attachmentType?.startsWith("image/")) ||
              /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$|\s)/i.test(
                `${message.attachmentName ?? ""} ${message.attachmentUrl ?? ""}`,
              ));
          const isVideo =
            !isAudioNote &&
            (message.attachmentType?.startsWith("video/") ||
              /\.(mp4|m4v|mov|webm|ogg)$/i.test(message.attachmentName ?? ""));
          // A confirmed message that inherited its pending twin's render key is the
          // same bubble reconciled, so it must not play the send animation twice.
          const replacedPending = String(message.renderKey ?? "").startsWith("pending-");
          const isJustArrived =
            message.id.startsWith("pending-") ||
            (!replacedPending && Date.now() - message.createdAt < 2_500);
          return (
            <SwipeToReply
              key={message.renderKey ?? message.id}
              disabled={
                Boolean(message.unsentAt) ||
                message.id.startsWith("pending-") ||
                !store.communityPermissions.canModerate
              }
              onReply={() => {
                setEditingMessage(null);
                setReplyTo(message);
                window.setTimeout(() => composerRef.current?.focus(), 40);
              }}
            >
              <article
                className={`community-post ${
                  message.senderId === store.me?.id ? "mine" : "theirs"
                } ${
                  isJustArrived ? "msg-just-arrived" : ""
                } ${
                  highlightedCommunityJumpId === message.id ? "jump-highlight-pulse" : ""
                } ${
                  selectionMode ? "is-selectable" : ""
                } ${
                  selectionMode && selectedIds.has(message.id) ? "is-selected" : ""
                }`}
                id={`community-message-${message.id}`}
                onClick={
                  selectionMode && !message.id.startsWith("pending-")
                    ? () => toggleSelectedId(message.id)
                    : undefined
                }
                onContextMenu={(e) => openMessageMenu(e, message)}
                onPointerDown={(e) => startPostPointerHold(e, message)}
                onPointerMove={movePostPointerHold}
                onPointerUp={cancelPostTouchHold}
                onPointerCancel={cancelPostTouchHold}
              >
              {selectionMode && (
                <button
                  type="button"
                  className={`msg-select-box${
                    selectedIds.has(message.id) ? " is-selected" : ""
                  }`}
                  aria-label={selectedIds.has(message.id) ? "Deselect post" : "Select post"}
                  aria-pressed={selectedIds.has(message.id)}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleSelectedId(message.id);
                  }}
                >
                  {selectedIds.has(message.id) ? <CheckIcon size={13} /> : null}
                </button>
              )}
              <div className="community-post-header">
                <Avatar
                  user={{
                    displayName: message.senderName || "JaText",
                    username: message.senderUsername,
                    avatarColor: message.senderAvatarColor,
                    avatarUrl: message.senderAvatarUrl,
                  }}
                  size={32}
                  onClick={
                    onOpenProfile
                      ? () =>
                          onOpenProfile({
                            id: message.senderId,
                            displayName: message.senderName || "JaText",
                            username: message.senderUsername || "jatext",
                            bio: "",
                            pronouns: "",
                            avatarColor: message.senderAvatarColor || "black",
                            avatarUrl: message.senderAvatarUrl,
                            onboardingComplete: true,
                          })
                      : undefined
                  }
                />
                <strong><IosEmojiText text={message.senderName || "JaText"} /></strong>
                <span className="verified-badge" title="Verified">
                  <CheckIcon size={11} strokeWidth={3} />
                </span>
                <span className="official-badge">Official</span>
                <time className="muted small">{new Date(message.createdAt).toLocaleString()}</time>
                {message.editedAt && <span className="muted small">Edited</span>}
                {message.unsentAt && <span className="muted small">Unsent</span>}
              </div>
              {editingMessage?.id === message.id ? (
                <form className="community-announcement-edit" onSubmit={(event) => void saveAnnouncement(event)}>
                  <textarea
                    ref={inlineEditRefCallback}
                    value={editingMessage.body}
                    maxLength={4000}
                    onChange={(event) =>
                      setEditingMessage((current) =>
                        current ? { ...current, body: event.target.value } : current,
                      )
                    }
                    aria-label="Edit announcement"
                  />
                  <div>
                    <button className="primary-btn" type="submit" disabled={busy || !editingMessage.body.trim()}>
                      Save
                    </button>
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => {
                        setEditingMessage(null);
                        setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {!message.unsentAt &&
                    (message.forwardedContext || message.forwardedFromName) && (
                      <ForwardedMessageCard
                        context={message.forwardedContext}
                        legacySenderName={message.forwardedFromName}
                        fallbackTimestamp={message.createdAt}
                      />
                    )}
                  {message.replyTo && (
                    <button
                      type="button"
                      className="reply-quote community-reply-quote"
                      onClick={() => document.getElementById(`community-message-${message.replyTo?.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                    >
                      <strong>{message.replyTo.senderName}</strong>
                      <span>{message.replyTo.body}</span>
                    </button>
                  )}
                  {message.unsentAt ? (
                    <p className="community-post-body" style={{ fontStyle: "italic", color: "var(--muted)" }}>This message was unsent</p>
                  ) : (
                    <>
                      {message.attachmentUrl &&
                        (isAudioNote ? (
                          <VoiceNotePlayer
                            messageId={message.id}
                            audioUrl={message.attachmentUrl}
                            attachmentType={message.attachmentType}
                            mine={message.senderId === store.me?.id}
                            showTranscript={Boolean(shownTranscriptIds[message.id])}
                            onToggleTranscript={(show) =>
                              setShownTranscriptIds((prev) => ({ ...prev, [message.id]: show }))
                            }
                            onOpenContextAt={
                              message.id.startsWith("pending-")
                                ? undefined
                                : (x, y) => openMessageMenuAt(x, y, message)
                            }
                          />
                        ) : isImage ? (
                          <SpoilerFrame
                            active={Boolean(message.isSpoiler)}
                            spoilerKey={message.id}
                          >
                            <button type="button" className="image-message-button" onClick={() => openImagePreview(message.attachmentUrl!)} aria-label="Open image viewer">
                              <ChatAttachmentImage className="msg-image" src={message.attachmentUrl} alt={message.attachmentName ?? "attachment"} maxWidth={420} maxHeight={420} />
                            </button>
                          </SpoilerFrame>
                        ) : isVideo ? (
                          <SpoilerFrame
                            active={Boolean(message.isSpoiler)}
                            spoilerKey={message.id}
                          >
                            <ChatVideoPlayer
                              src={message.attachmentUrl}
                              name={message.attachmentName}
                            />
                          </SpoilerFrame>
                        ) : (
                          <a className="file-chip" href={message.attachmentUrl} download={message.attachmentName ?? "file"} target="_blank" rel="noreferrer">
                            <PaperclipIcon size={14} /> {message.attachmentName ?? "Attachment"}
                          </a>
                        ))}
                      {message.stickerUrl && (
                        <button
                          type="button"
                          className="image-message-button sticker-message-button"
                          onClick={() => openImagePreview(message.stickerUrl!)}
                          aria-label="Open sticker viewer"
                        >
                          <ChatAttachmentImage
                            className="group-message-sticker"
                            src={message.stickerUrl}
                            alt={message.stickerName ?? "Sticker"}
                            maxWidth={220}
                            maxHeight={220}
                          />
                        </button>
                      )}
                      {message.body &&
                        (message.bubbleStyle && message.bubbleStyle !== "default" ? (
                          <DecoratedMessageBubble
                            styleId={message.bubbleStyle}
                            mine={message.senderId === store.me?.id}
                            className="community-styled-bubble"
                          >
                            <MessageMarkdown
                              text={message.body}
                              mine={message.senderId === store.me?.id}
                              className="community-post-body"
                            />
                            <MessageLinkEmbeds text={message.body} />
                          </DecoratedMessageBubble>
                        ) : (
                          <>
                            <MessageMarkdown
                              text={message.body}
                              mine={message.senderId === store.me?.id}
                              className="community-post-body"
                            />
                            <MessageLinkEmbeds text={message.body} />
                          </>
                        ))}
                    </>
                  )}
                  {!!message.reactions?.length && (
                    <div className="message-reactions" style={{ marginTop: 8 }}>
                      {Array.from(new Set(message.reactions.map((r) => r.emoji))).map((emoji) => {
                        const users = message.reactions?.filter((r) => r.emoji === emoji) ?? [];
                        const mineReacted = users.some((r) => r.userId === store.me?.id);
                        return (
                          <button type="button" key={emoji} className={`reaction-chip ${mineReacted ? "selected" : ""}`} onClick={() => void reactToMessage(message, emoji)}>
                            <IosEmojiGlyph emoji={emoji} size={16} /> <span>{users.length}</span>
                          </button>
                        );
                      })}
                      {!message.unsentAt && (
                        <button
                          type="button"
                          className="reaction-chip reaction-add-chip"
                          onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            setReactionTarget({
                              x: rect.left + rect.width / 2,
                              y: rect.top,
                              message,
                            });
                          }}
                          title="Add another reaction"
                          aria-label="Add another reaction"
                        >
                          <PlusIcon size={13} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              {message.type !== "poll" && !message.unsentAt && editingMessage?.id !== message.id && (
                <div className="community-post-actions">
                  {store.communityPermissions.canModerate && (
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        setReplyTo(message);
                        window.setTimeout(() => composerRef.current?.focus(), 0);
                      }}
                    >
                      Reply
                    </button>
                  )}
                  <button type="button" className="mini-btn" onClick={() => openForwardDialog(message)}>
                    Forward
                  </button>
                </div>
              )}
              {(canManagePost || message.type === "poll") && !message.unsentAt && (
                <div className="community-post-actions">
                  {message.type === "text" && editingMessage?.id !== message.id && canManagePost && (
                    <button type="button" className="ghost-btn" onClick={() => setEditingMessage({ id: message.id, body: message.body })}>Edit announcement</button>
                  )}
                  {message.type === "poll" && (
                    <button type="button" className="ghost-btn" onClick={() => setVoterPollId(message.id)}>View who voted</button>
                  )}
                  {canManagePost && (
                    <button type="button" className="ghost-btn destructive-menu-item" onClick={() => void deleteAnnouncement(message.id)}>Delete</button>
                  )}
                </div>
              )}
              {message.type === "poll" && !message.unsentAt && (
                <div className="community-poll">
                  {message.pollOptions.map((option, index) => {
                    const percentage = totalVotes ? Math.round((counts[index] / totalVotes) * 100) : 0;
                    return (
                      <PollOption
                        key={`${message.id}-${index}`}
                        message={message}
                        option={option}
                        index={index}
                        count={counts[index]}
                        totalVotes={totalVotes}
                        percentage={percentage}
                        showResults={showResults}
                        onVote={(pollId, optionIndex) => void vote(pollId, optionIndex)}
                      />
                    );
                  })}
                  <div className="muted small">
                    {totalVotes} vote{totalVotes === 1 ? "" : "s"}
                    {message.pollEndedAt ? " · Poll ended" : message.myVote !== undefined ? " · Your vote is counted" : " · Select an option to vote"}
                  </div>
                  {store.communityPermissions.isOwner && !message.pollEndedAt && (
                    <button className="ghost-btn" type="button" onClick={() => void endPoll(message.id)}>End poll</button>
                  )}
                </div>
              )}
              </article>
            </SwipeToReply>
          );
        })}
      </div>

      {error && <div className="error-box community-error" role="alert">{error}</div>}
      {store.mode !== "demo" && <CommunityTypingStatus />}

      {file && (
        <div className="attach-preview">
          <span>
            <PaperclipIcon size={14} /> {file.name}
          </span>
          <button className="mini-btn" onClick={() => setFile(null)}>
            <CloseIcon size={12} /> Remove
          </button>
        </div>
      )}
      {replyTo && !editingMessage && (
        <div className="reply-composer-preview">
          <div>
            <strong>Replying to {replyTo.senderName}</strong>
            <span>{replyTo.body || replyTo.attachmentName || replyTo.stickerName || "Attachment"}</span>
          </div>
          <button type="button" className="mini-btn" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>
            <CloseIcon size={13} />
          </button>
        </div>
      )}
      {editingMessage && (
        <div className="reply-composer-preview">
          <div><strong>Editing your message</strong><span>{editingMessage.body}</span></div>
          <button type="button" className="mini-btn" aria-label="Cancel editing" onClick={() => { setEditingMessage(null); setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" })); }}>
            <CloseIcon size={13} />
          </button>
        </div>
      )}

      {store.communityPermissions.canModerate ? (
        <>
          {showPoll && (
            <form className="community-poll-form" onSubmit={(event) => void sendPoll(event)}>
              <input value={pollQuestion} maxLength={300} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Ask a poll question" aria-label="Poll question" />
              {pollOptions.map((option, index) => (
                <div className="community-poll-edit-option" key={index}>
                  <input value={option} maxLength={120} onChange={(event) => setPollOptions((current) => current.map((value, optionIndex) => (optionIndex === index ? event.target.value : value)))} placeholder={`Option ${index + 1}`} aria-label={`Poll option ${index + 1}`} />
                  {pollOptions.length > 1 && <button type="button" className="mini-btn" onClick={() => setPollOptions((current) => current.filter((_, i) => i !== index))} aria-label={`Remove option ${index + 1}`}><CloseIcon size={12} /></button>}
                </div>
              ))}
              <div className="community-poll-form-actions">
                {pollOptions.length < 6 && <button type="button" className="ghost-btn" onClick={() => setPollOptions((current) => [...current, ""])}>Add option</button>}
                <button type="submit" className="primary-btn" disabled={busy}>Post poll</button>
                <button type="button" className="ghost-btn" onClick={() => setShowPoll(false)}>Cancel</button>
              </div>
            </form>
          )}
          {recordingVoiceNote ? (
            <div className="composer community-composer voice-composer-active">
              <VoiceNoteRecorder
                onCancel={() => setRecordingVoiceNote(false)}
                onSendVoiceNote={(voiceFile) => sendCommunityVoiceNote(voiceFile)}
                onError={(msg) => setError(msg)}
              />
            </div>
          ) : (
            <CommunityChatComposer
              key={`composer:${composerSeed.nonce}`}
              initialDraft={composerSeed.text}
              hasFile={Boolean(file)}
              isEditing={false}
              showPoll={showPoll}
              composerRef={composerRef}
              fileInputRef={fileInput}
              onSelectFile={setFile}
              onSelectSticker={sendSticker}
              onStartVoiceNote={() => setRecordingVoiceNote(true)}
              onTogglePoll={() => setShowPoll((open) => !open)}
              onMobileActivate={handleMobileComposerActivate}
              onTypingSignal={handleCommunityTypingSignal}
              onSubmitDraft={(body) => void handleSubmitCommunityDraft(body)}
            />
          )}
        </>
      ) : (
        <div className="community-readonly">Only JaText community moderators can post here.</div>
      )}

      {showModerators && (
        <AnimatedModal
          onClose={() => setShowModerators(false)}
          cardClassName="modal-card community-moderator-dialog"
        >
          {() => (
            <>
              <h2>Elect People …</h2>
              <p className="muted small">Accounts are shown from oldest to newest. Selected people can post messages and polls.</p>
              <div className="community-directory-search-row">
                {directorySearchOpen && (
                  <input ref={directorySearchInput} className="search-input community-directory-search" value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} placeholder="Search people…" aria-label="Search registered people" autoFocus />
                )}
                <button type="button" className="icon-btn community-directory-search-toggle" aria-label={directorySearchOpen ? "Close people search" : "Search registered people"} title={directorySearchOpen ? "Close search" : "Search people"} onClick={() => { setDirectorySearchOpen((open) => !open); if (directorySearchOpen) setDirectorySearch(""); else window.setTimeout(() => directorySearchInput.current?.focus(), 0); }}>
                  {directorySearchOpen ? <CloseIcon size={16} /> : <SearchIcon size={17} />}
                </button>
              </div>
              <div className="community-directory">
                {filteredDirectory.map(({ person, index }) => (
                  <label className="community-directory-person" key={person.id}>
                    <input type="checkbox" checked={selectedModerators.includes(person.id)} disabled={person.username === "imzachie"} onChange={(event) => setSelectedModerators((current) => event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id))} />
                    <Avatar user={{ displayName: person.displayName, username: person.username, avatarColor: person.avatarColor, avatarUrl: person.avatarUrl }} size={34} />
                    <span>{index + 1}. <strong>{person.displayName}</strong> @{person.username}</span>
                    <time className="muted small">{new Date(person.createdAt).toLocaleDateString()}</time>
                  </label>
                ))}
                {filteredDirectory.length === 0 && <p className="muted">{store.communityDirectory.length === 0 ? "No registered usernames were found." : "No accounts match your search."}</p>}
              </div>
              <button className="primary-btn" disabled={busy} onClick={() => void saveModerators()}>Save moderators</button>
            </>
          )}
        </AnimatedModal>
      )}
      {voterPoll && store.mode !== "demo" && <CommunityVoterDialog poll={voterPoll} onClose={() => setVoterPollId(null)} />}

      {messageMenu && (
        <ContextMenu x={messageMenu.x} y={messageMenu.y} label="Message actions" className={`message-context-menu ${messageMenuClosing ? "closing" : ""}`} onClose={closeMessageMenu}>
          <button type="button" role="menuitem" onClick={() => replyToMessage(messageMenu.message)}><span><ReplyIcon size={15} /></span> Reply</button>
          {!messageMenu.message.id.startsWith("pending-") && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setSelectionMode(true);
                setSelectedIds(new Set([messageMenu.message.id]));
                closeMessageMenu();
              }}
            >
              <span><CheckIcon size={15} /></span> Select
            </button>
          )}
          {!messageMenu.message.unsentAt &&
            messageMenu.message.senderId === store.me?.id && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMessageMenu();
                  setBubbleStyleOpen(true);
                }}
              >
                <span><BubblePaletteIcon size={15} /></span> Bubble style
              </button>
            )}
          {!messageMenu.message.unsentAt &&
            isVoiceNoteOrAudio(
              messageMenu.message.attachmentType,
              messageMenu.message.attachmentName,
            ) && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const id = messageMenu.message.id;
                  setShownTranscriptIds((prev) => ({ ...prev, [id]: !prev[id] }));
                  closeMessageMenu();
                }}
              >
                <span><FileTextIcon size={15} /></span>{" "}
                {shownTranscriptIds[messageMenu.message.id]
                  ? "Hide transcribe"
                  : "Transcribe"}
              </button>
            )}
          {!messageMenu.message.unsentAt && (
            <>
              {messageMenu.canEdit && <button type="button" role="menuitem" onClick={() => startEditingMessage(messageMenu.message)}><span><EditIcon size={15} /></span> Edit message</button>}
              <button type="button" role="menuitem" onClick={() => openForwardDialog(messageMenu.message)}><span><ForwardIcon size={15} /></span> Forward</button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const target = messageMenu;
                  closeMessageMenu();
                  setReactionTarget({
                    x: target.x,
                    y: target.y,
                    message: target.message,
                  });
                }}
              >
                <span><SmilePlusIcon size={15} /></span> Reaction
              </button>
            </>
          )}
          <button type="button" role="menuitem" onClick={() => void copyMessage(messageMenu.message)}><span><CopyIcon size={15} /></span> Copy text</button>
          <button type="button" role="menuitem" onClick={() => void deleteForMe(messageMenu.message)}><span><TrashIcon size={15} /></span> Delete for me</button>
          {(messageMenu.message.stickerKey || messageMenu.message.attachmentType?.startsWith("image/") || messageMenu.message.stickerUrl || messageMenu.message.attachmentUrl) && (
            <button type="button" role="menuitem" onClick={() => void favoriteSticker(messageMenu.message)}>
              <span><StarIcon size={15} filled={!messageMenu.message.isStickerFavorite} /></span>
              {messageMenu.message.attachmentType?.startsWith("image/") && !messageMenu.message.stickerKey ? "Make this image a sticker..." : messageMenu.message.isStickerFavorite ? "Remove from favourites" : "Add to favourites"}
            </button>
          )}
          {(messageMenu.message.attachmentType?.startsWith("image/") || messageMenu.message.stickerUrl) && (
            <>
              <button type="button" role="menuitem" onClick={() => void copyImage(messageMenu.message)}><span><ImageIcon size={15} /></span> Copy image</button>
              <button type="button" role="menuitem" onClick={() => void copyImageAddress(messageMenu.message)}><span><LinkIcon size={15} /></span> Copy image address</button>
            </>
          )}
          {messageMenu.canUnsend && !store.communityPermissions.isOwner && (
            <button type="button" role="menuitem" className="destructive-menu-item" onClick={() => void unsend(messageMenu.message)}><span><UndoIcon size={15} /></span> Unsend</button>
          )}
          {(store.communityPermissions.isOwner || store.communityPermissions.canModerate) && (
            <button
              type="button"
              role="menuitem"
              className="destructive-menu-item"
              onClick={() => void deleteAnnouncement(messageMenu.message.id)}
            >
              <span><TrashIcon size={15} /></span> Delete announcement
            </button>
          )}
        </ContextMenu>
      )}

      {forwardMessage && (
        <div className={`forward-backdrop ${forwardClosing ? "closing" : ""}`} onClick={closeForwardDialog}>
          <section className="forward-dialog" aria-label="Forward message" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h3>Forward message</h3>
                <p>Choose a friend or group to send this to.</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close forward dialog" onClick={closeForwardDialog}><CloseIcon size={17} /></button>
            </header>
            {(store.friends.length + store.groups.length > 4) && (
              <input
                className="forward-search-input"
                value={forwardSearch}
                onChange={(event) => setForwardSearch(event.target.value)}
                placeholder="Search friends or groups…"
                aria-label="Search friends or groups"
              />
            )}
            <div className="forward-friends">
              {store.communityPermissions.canModerate &&
                (!forwardSearch.trim() || "jatext community official".includes(forwardSearch.trim().toLowerCase())) && (
                  <button type="button" className="forward-friend" onClick={() => void forwardToCommunity()}>
                    <img className="community-mark" src="/jatext-logo-icon.png" alt="" style={{ width: 38, height: 38 }} />
                    <span>JaText Community</span>
                    <span className="muted">Official</span>
                  </button>
                )}
              {store.friends
                .filter((target) => {
                  const q = forwardSearch.trim().toLowerCase();
                  return !q || target.displayName.toLowerCase().includes(q) || target.username.toLowerCase().includes(q);
                })
                .map((target) => (
                  <button type="button" key={target.id} className="forward-friend" onClick={() => void forwardToFriend(target.id)}>
                    <Avatar user={target} size={38} />
                    <span>{target.displayName}</span>
                    <span className="muted">@{target.username}</span>
                  </button>
                ))}
              {store.groups
                .filter((target) => {
                  const q = forwardSearch.trim().toLowerCase();
                  return !q || target.name.toLowerCase().includes(q);
                })
                .map((target) => (
                  <button type="button" key={target.id} className="forward-friend" onClick={() => void forwardToGroup(target.id)}>
                    {target.avatarUrl ? (
                      <AnimatedMediaImg className="group-avatar" src={target.avatarUrl} style={{ width: 38, height: 38 }} />
                    ) : (
                      <span className="group-avatar group-avatar-fallback" style={{ width: 38, height: 38 }}><UsersIcon size={19} /></span>
                    )}
                    <span>{target.name}</span>
                    <span className="muted">{target.memberCount} members</span>
                  </button>
                ))}
              {store.friends.length === 0 && store.groups.length === 0 && !store.communityPermissions.canModerate && (
                <p className="muted center">You do not have anyone to forward to yet.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {reactionTarget && (
        <ReactionEmojiPicker
          x={reactionTarget.x}
          y={reactionTarget.y}
          selectedEmojis={(
            store.communityMessages.find((m) => m.id === reactionTarget.message.id)?.reactions ??
            reactionTarget.message.reactions ??
            []
          )
            .filter((r) => r.userId === store.me?.id)
            .map((r) => r.emoji)}
          onSelect={(emoji) => void reactToMessage(reactionTarget.message, emoji)}
          onClose={() => setReactionTarget(null)}
        />
      )}
      {bubbleStyleOpen && (
        <BubbleStyleModal onClose={() => setBubbleStyleOpen(false)} />
      )}
      {imagePreview && (
        <div className={`media-lightbox ${imageClosing ? "closing" : ""}`} role="dialog" aria-modal="true" aria-label="Image viewer" onClick={closeImagePreview}>
          <button type="button" className="media-lightbox-close" aria-label="Close image viewer" onClick={closeImagePreview}><CloseIcon size={20} /></button>
          <div className="media-lightbox-stage">
            <img ref={imageElementRef} src={imagePreview} alt="Full-size attachment" style={{ transform: "translate3d(0, 0, 0) scale(1)" }} onClick={(event) => event.stopPropagation()} onTouchStart={startImageGesture} onTouchMove={moveImageGesture} onTouchEnd={endImageGesture} onTouchCancel={endImageGesture} onWheel={(event) => { event.preventDefault(); const { scale, x, y } = imageTransformRef.current; applyImageTransform(Math.min(4, Math.max(1, scale + (event.deltaY < 0 ? 0.2 : -0.2))), x, y); }} />
          </div>
          <span className="media-lightbox-hint">Pinch to zoom · Drag to move · Click outside or press Esc to close</span>
        </div>
      )}
      <DeleteForMeToast
        state={deletedUndoState}
        onUndo={(id) => void undoDeleteForMe(id)}
        onExpire={(nonce) =>
          setDeletedUndoState((cur) => (cur?.nonce === nonce ? null : cur))
        }
      />
    </section>
  );
}
