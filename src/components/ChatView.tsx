import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Phone, Video } from "./CallIcons";
import { IosEmojiGlyph, IosEmojiText } from "./IosEmoji";
import { ComposerPlusMenu, ViewOnceRingIcon } from "./ComposerPlusMenu";
import { ViewOnceMessageBubble } from "./ViewOnceViewerModal";
import {
  buildEncryptedViewOnceBody,
  isViewOnceBody,
  parseViewOnceEnvelope,
} from "../lib/viewOnce";
import {
  isMessagePinned,
  togglePinnedMessage,
  usePinnedMessages,
} from "../lib/chatOrganization";
import { playMessageSound } from "../lib/alerts";
import { CONVERSATION_MARKED_READ_EVENT } from "../lib/convexStore";
import { getUserChatPrefs } from "../lib/userChatPrefs";
import { isChatActivelyVisibleToUser } from "../lib/nativeBridge";
import {
  isSoftKeyboardCurrentlyOpen,
  useChatAutoScrollAndKeyboard,
} from "../lib/useChatAutoScrollAndKeyboard";
import {
  formatPreviewMessageText,
  isHiddenCallSignal,
  parseCallInvite,
  useCall,
} from "../lib/calling";
import { parseStatusReply } from "../lib/statusReply";
import { IosReplyIcon } from "./IosVectorIcons";
import {
  copyImageUrlToClipboard,
  extractClipboardFile,
  useChatImagePaste,
} from "../lib/clipboard";
import { syncComposerTextareaHeight } from "../lib/composerUtils";
import {
  getCachedWallpaper,
  getSavedOutgoingBubbleStyle,
  parseWallpaperSignal,
  saveCachedWallpaper,
  serializeWallpaperSignal,
  useIsMobileWallpaperSupported,
} from "../lib/chatCustomization";
import { clearDraft, getDraft, setDraft as saveStoredDraft } from "../lib/drafts";
import { useE2EESnapshot } from "../lib/e2ee/keystore";
import { MessageEncryptionModal } from "./E2EEModals";
import { isVoiceNoteOrAudio, saveCachedVoiceTranscript, decodeVoiceNoteMime } from "../lib/voiceNotes";
import { BubbleStyleModal } from "./BubbleStyleModal";
import { DecoratedMessageBubble } from "./BubbleStyleArtwork";
import { ChatAttachmentImage } from "./ChatAttachmentImage";
import { ChatVideoPlayer } from "./ChatVideoPlayer";
import { CallMessageCard } from "./CallMessageCard";
import { ContextMenu } from "./ContextMenu";
import { ForwardedMessageCard } from "./ForwardedMessageCard";
import { SpoilerFrame, SpoilerToggle } from "./SpoilerFrame";
import { MessageLinkEmbeds } from "./LinkEmbeds";
import { MessageMarkdown } from "./MessageMarkdown";
import { ReactionEmojiPicker } from "./ReactionEmojiPicker";
import { SwipeToReply } from "./SwipeToReply";
import { WallpaperModal, type WallpaperChoice } from "./WallpaperModal";
import { StickerPicker } from "./StickerPicker";
import {
  clearPendingMessageJump,
  getPendingMessageJump,
  subscribeMessageJumps,
} from "../lib/forwardedContext";
import {
  ArrowLeftIcon,
  BanIcon,
  BellIcon,
  BellOffIcon,
  BubblePaletteIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  CopyIcon,
  EditIcon,
  FileTextIcon,
  ForwardIcon,
  ImageIcon,
  LinkIcon,
  LockClosedIcon,
  MicVoiceIcon,
  MoreVerticalIcon,
  PaperclipIcon,
  PinIcon,
  PlusIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  ShieldCheckIcon,
  SmilePlusIcon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
  UndoIcon,
  UnlockIcon,
  UserIcon,
  UserMinusIcon,
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
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";
import type { ChatMessage, JaUser } from "../lib/types";
import { AnimatedMediaImg, Avatar } from "./Avatar";

const UNSEND_WINDOW_MS = 60 * 60 * 1000;
const PENDING_MESSAGE_MATCH_WINDOW_MS = 30_000;
// Ten files per send. Each one is read, encrypted and uploaded, so a bigger
// batch only queues up work the phone cannot keep in memory.
const MAX_STAGED_FILES = 10;
/** Tolerance used only to reconcile our own optimistic bubbles with their server copy. */
const PENDING_NEAR_MATCH_WINDOW_MS = 4_000;
// The bubble is normally dropped the moment the delivered copy replaces it.
// This is only the backstop for a send whose echo never arrives. It used to
// be 1.5s, which was shorter than a slow round trip, so the bubble vanished
// and the delivered copy animated in a second time.
const PENDING_FALLBACK_DROP_MS = 20_000;
const EMPTY_MESSAGES: ChatMessage[] = [];

function detectDmMentionQuery(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, safeCursor);
  const atIndex = before.lastIndexOf("@");
  if (atIndex === -1) return null;
  if (atIndex > 0 && !/[\s([{]/.test(before[atIndex - 1])) return null;
  const query = before.slice(atIndex + 1);
  if (/[\s@[\]()]/.test(query) || query.length > 32) return null;
  return { start: atIndex, query };
}

interface MessageMenuState {
  x: number;
  y: number;
  message: ChatMessage;
  canUnsend: boolean;
  canEdit: boolean;
}

const CHAT_TIME_FMT = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
const CHAT_DAY_FMT = new Intl.DateTimeFormat([], {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const chatTimeCache = new Map<number, string>();

function fmtTime(ts: number) {
  const minuteBucket = Math.floor(ts / 60_000);
  let cached = chatTimeCache.get(minuteBucket);
  if (!cached) {
    cached = CHAT_TIME_FMT.format(new Date(ts));
    if (chatTimeCache.size > 600) chatTimeCache.clear();
    chatTimeCache.set(minuteBucket, cached);
  }
  return cached;
}
function fmtDay(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return "Today";
  }
  return CHAT_DAY_FMT.format(d);
}

function getConversationMessages(
  pendingMessages: ChatMessage[],
  activeMessages: ChatMessage[],
  friendId: string,
  myUserId?: string,
) {
  const conversationPendingMessages = pendingMessages.filter(
    (message) => message.receiverId === friendId,
  );
  const matchedPendingIds = new Set<string>();
  const now = Date.now();
  const confirmedMessages: ChatMessage[] = [];

  for (const message of activeMessages) {
    const isUndecryptedEcho = Boolean(message.e2ee && !message.e2ee.decrypted);
    const candidates: number[] = [];
    conversationPendingMessages.forEach((pendingMessage, index) => {
      if (
        pendingMessage.senderId !== message.senderId ||
        pendingMessage.receiverId !== message.receiverId ||
        message.createdAt < pendingMessage.createdAt - 60_000 ||
        message.createdAt > pendingMessage.createdAt + PENDING_MESSAGE_MATCH_WINDOW_MS
      ) {
        return;
      }
      const exact =
        message.unsentAt ||
        Boolean(message.editedAt) ||
        isUndecryptedEcho ||
        (message.body === pendingMessage.body &&
          message.attachmentName === pendingMessage.attachmentName);
      if (exact) {
        candidates.unshift(index);
        return;
      }
      // Fallback for our own messages whose stored body legitimately differs from
      // what we optimistically rendered (E2EE ciphertext round trips, server side
      // normalisation). Without this the pending bubble survives next to the real
      // one and the send animation visibly plays twice.
      if (
        myUserId &&
        message.senderId === myUserId &&
        Math.abs(message.createdAt - pendingMessage.createdAt) <= PENDING_NEAR_MATCH_WINDOW_MS
      ) {
        candidates.push(index);
      }
    });
    const pendingIndex = candidates.length ? candidates[0] : -1;
    if (pendingIndex === -1) {
      // Never flash a transient "Decrypting message…" placeholder for our own freshly-sent message
      if (
        isUndecryptedEcho &&
        myUserId &&
        message.senderId === myUserId &&
        now - message.createdAt < 30_000
      ) {
        continue;
      }
      confirmedMessages.push(message);
      continue;
    }

    const [pendingMessage] = conversationPendingMessages.splice(pendingIndex, 1);
    matchedPendingIds.add(pendingMessage.id);
    confirmedMessages.push(
      isUndecryptedEcho
        ? {
            ...message,
            body: pendingMessage.body,
            bubbleStyle: pendingMessage.bubbleStyle ?? message.bubbleStyle,
            attachmentUrl: pendingMessage.attachmentUrl ?? message.attachmentUrl,
            attachmentName: pendingMessage.attachmentName ?? message.attachmentName,
            attachmentType: pendingMessage.attachmentType ?? message.attachmentType,
            renderKey: pendingMessage.id,
          }
        : { ...message, renderKey: pendingMessage.id },
    );
  }

  return {
    messages: [...confirmedMessages, ...conversationPendingMessages].sort(
      (a, b) => a.createdAt - b.createdAt,
    ),
    matchedPendingIds,
  };
}

const ChatHistory = memo(function ChatHistory({
  messages,
  friend,
  me,
  messagesRef,
  initialScrollAllowedRef,
  messagesReady,
  hasMoreOlder = false,
  loadingOlder = false,
  onLoadOlder,
  shownTranscriptIds,
  onToggleTranscript,
  onOpenProfile,
  onOpenMessageMenu,
  onOpenMessageMenuAt,
  onOpenImage,
  activeSearchMatchId,
  highlightQuery,
  onReactToMessage,
  onOpenReactionPicker,
  onSwipeReply,
}: {
  messages: ChatMessage[];
  friend: JaUser;
  me: JaUser;
  messagesRef: { current: HTMLDivElement | null };
  initialScrollAllowedRef: { current: boolean };
  messagesReady: boolean;
  hasMoreOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => Promise<number>;
  shownTranscriptIds: Record<string, boolean>;
  onToggleTranscript: (messageId: string, show: boolean) => void;
  onOpenProfile: (user: JaUser) => void;
  onOpenMessageMenu: (event: MouseEvent, message: ChatMessage) => void;
  onOpenMessageMenuAt: (x: number, y: number, message: ChatMessage) => void;
  onOpenImage: (url: string) => void;
  activeSearchMatchId?: string | null;
  highlightQuery?: string;
  onReactToMessage: (message: ChatMessage, emoji: string) => void;
  onOpenReactionPicker: (x: number, y: number, message: ChatMessage) => void;
  onSwipeReply: (message: ChatMessage) => void;
}) {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const fetchingOlderRef = useRef(false);

  function cancelBubbleTouchHold() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }

  function startBubblePointerHold(
    event: React.PointerEvent<HTMLDivElement>,
    message: ChatMessage,
  ) {
    if (event.pointerType !== "touch" || message.id.startsWith("pending-")) return;
    longPressOriginRef.current = { x: event.clientX, y: event.clientY };
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    const { clientX, clientY } = event;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      onOpenMessageMenuAt(clientX, clientY, message);
    }, 450);
  }

  function moveBubblePointerHold(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || !longPressOriginRef.current) return;
    const dist = Math.hypot(
      event.clientX - longPressOriginRef.current.x,
      event.clientY - longPressOriginRef.current.y,
    );
    if (dist > 12) cancelBubbleTouchHold();
  }

  const [visibleCount, setVisibleCount] = useState(120);
  const scrollSettleTimerRef = useRef<number | null>(null);
  const handleOpenFriendProfile = useCallback(
    () => onOpenProfile(friend),
    [friend, onOpenProfile],
  );
  const [highlightedJumpId, setHighlightedJumpId] = useState<string | null>(null);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const capturedUnreadForFriendRef = useRef<string | null>(null);
  const initialDmUnreadCutoffRef = useRef<{ friendId: string | null; cutoff: number }>({
    friendId: null,
    cutoff: 0,
  });
  if (initialDmUnreadCutoffRef.current.friendId !== friend.id) {
    const dmPrefs = getUserChatPrefs(me.id).dms[friend.id];
    initialDmUnreadCutoffRef.current = {
      friendId: friend.id,
      cutoff: dmPrefs?.lastReadAt ?? 0,
    };
  }
  const prependAnchorRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const prevFriendIdRef = useRef(friend.id);
  if (prevFriendIdRef.current !== friend.id) {
    prevFriendIdRef.current = friend.id;
    prependAnchorRef.current = null;
    capturedUnreadForFriendRef.current = null;
    if (visibleCount !== 120) {
      setVisibleCount(120);
    }
    if (firstUnreadMessageId !== null) {
      setFirstUnreadMessageId(null);
    }
  }

  const myLatestSentDmTs = useMemo(() => {
    let maxTs = 0;
    for (const m of messages) {
      if (m.senderId === me.id && m.createdAt > maxTs) {
        maxTs = m.createdAt;
      }
    }
    return maxTs;
  }, [me.id, messages]);

  useEffect(() => {
    if (!messagesReady || capturedUnreadForFriendRef.current === friend.id) return;
    capturedUnreadForFriendRef.current = friend.id;
    const effectiveCutoff = Math.max(initialDmUnreadCutoffRef.current.cutoff, myLatestSentDmTs);
    const firstUnread = messages.find(
      (m) =>
        m.senderId === friend.id &&
        m.receiverId === me.id &&
        !m.unsentAt &&
        m.deliveryStatus !== "read" &&
        m.createdAt > effectiveCutoff &&
        !isHiddenCallSignal(m.body),
    );
    setFirstUnreadMessageId(firstUnread?.id ?? null);
  }, [friend.id, me.id, messages, messagesReady, myLatestSentDmTs]);

  const prevMySentDmTsRef = useRef(0);
  useEffect(() => {
    if (prevMySentDmTsRef.current > 0 && myLatestSentDmTs > prevMySentDmTsRef.current) {
      setFirstUnreadMessageId(null);
    }
    prevMySentDmTsRef.current = myLatestSentDmTs;
  }, [myLatestSentDmTs]);

  useEffect(() => {
    if (!firstUnreadMessageId) return;
    let timer: number | null = null;
    let cancelled = false;
    void isChatActivelyVisibleToUser().then((visible) => {
      if (cancelled || !visible) return;
      timer = window.setTimeout(() => {
        setFirstUnreadMessageId(null);
      }, 4500);
    });
    const onMarkedDone = (e: Event) => {
      const detail = (e as CustomEvent<{ friendId?: string }>).detail;
      if (detail?.friendId === friend.id) {
        setFirstUnreadMessageId(null);
      }
    };
    window.addEventListener(CONVERSATION_MARKED_READ_EVENT, onMarkedDone);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener(CONVERSATION_MARKED_READ_EVENT, onMarkedDone);
    };
  }, [firstUnreadMessageId, friend.id]);

  useEffect(() => {
    const attemptJump = () => {
      const pending = getPendingMessageJump("dm", friend.id);
      if (!pending || messages.length === 0) return;
      const idx = messages.findIndex((m) => m.id === pending.messageId);
      if (idx === -1) return;
      const neededCount = messages.length - idx + 8;
      if (neededCount > visibleCount) {
        setVisibleCount(Math.min(messages.length, neededCount));
        return;
      }
      clearPendingMessageJump(pending.messageId);
      initialScrollAllowedRef.current = false;
      window.requestAnimationFrame(() => {
        const el = document.getElementById(`message-${pending.messageId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlightedJumpId(pending.messageId);
          window.setTimeout(() => {
            setHighlightedJumpId((cur) => (cur === pending.messageId ? null : cur));
          }, 2400);
        }
      });
    };
    attemptJump();
    return subscribeMessageJumps(() => {
      attemptJump();
    });
  }, [friend.id, initialScrollAllowedRef, messages, visibleCount]);

  const windowedMessages = useMemo(
    () =>
      messages.length > visibleCount
        ? messages.slice(messages.length - visibleCount)
        : messages,
    [messages, visibleCount],
  );

  useEffect(() => {
    if (!activeSearchMatchId) return;
    const idx = messages.findIndex((m) => m.id === activeSearchMatchId);
    if (idx >= 0) {
      const needed = messages.length - idx + 8;
      if (needed > visibleCount) {
        setVisibleCount(Math.min(messages.length, needed));
        return;
      }
    }
    window.requestAnimationFrame(() => {
      document
        .getElementById(`message-${activeSearchMatchId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [activeSearchMatchId, messages, visibleCount]);

  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    const el = messagesRef.current;
    if (anchor && el) {
      prependAnchorRef.current = null;
      const delta = el.scrollHeight - anchor.prevHeight;
      if (delta > 0) {
        el.scrollTop = anchor.prevTop + delta;
      }
    }
  }, [windowedMessages.length, messagesRef]);

  const canRevealMoreLocal = visibleCount < messages.length;
  const canLoadOlderAny = canRevealMoreLocal || hasMoreOlder;

  const triggerRevealOrFetchOlder = () => {
    const el = messagesRef.current;
    if (!el || prependAnchorRef.current) return;
    if (visibleCount < messages.length) {
      prependAnchorRef.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop };
      setVisibleCount((cur) => Math.min(messages.length, cur + 60));
      return;
    }
    if (hasMoreOlder && onLoadOlder && !loadingOlder && !fetchingOlderRef.current) {
      fetchingOlderRef.current = true;
      void onLoadOlder()
        .then((added) => {
          if (added > 0 && messagesRef.current) {
            prependAnchorRef.current = {
              prevHeight: messagesRef.current.scrollHeight,
              prevTop: messagesRef.current.scrollTop,
            };
            setVisibleCount((cur) => cur + Math.min(80, added));
          }
        })
        .finally(() => {
          fetchingOlderRef.current = false;
        });
    }
  };

  useEffect(
    () => () => {
      if (scrollSettleTimerRef.current !== null) {
        window.clearTimeout(scrollSettleTimerRef.current);
      }
    },
    [],
  );

  const handleMessagesScroll = () => {
    if (!canLoadOlderAny) return;
    if (scrollSettleTimerRef.current !== null) {
      window.clearTimeout(scrollSettleTimerRef.current);
    }
    scrollSettleTimerRef.current = window.setTimeout(() => {
      scrollSettleTimerRef.current = null;
      const el = messagesRef.current;
      if (el && el.scrollTop < 120) {
        triggerRevealOrFetchOlder();
      }
    }, 140);
  };

  return (
    <div
      className="messages"
      ref={messagesRef}
      onScroll={handleMessagesScroll}
      onWheel={() => {
        initialScrollAllowedRef.current = false;
      }}
      onPointerDown={() => {
        initialScrollAllowedRef.current = false;
      }}
    >
      {canLoadOlderAny && windowedMessages.length > 0 && (
        <div className="older-messages-bar">
          <button
            type="button"
            className="older-messages-btn"
            disabled={loadingOlder}
            onClick={triggerRevealOrFetchOlder}
          >
            {loadingOlder ? "Loading older messages…" : "Load older messages"}
          </button>
        </div>
      )}
      {!messagesReady && windowedMessages.length === 0 && (
        <div className="empty-box center">
          <div className="spinner" style={{ width: 28, height: 28 }} />
          <p className="muted small">Loading messages…</p>
        </div>
      )}
      {messagesReady && windowedMessages.length === 0 && (
        <div className="empty-box center">
          <Avatar user={friend} size={72} onClick={() => onOpenProfile(friend)} />
          <p>
            You&apos;re now friends with <strong>{friend.displayName}</strong>{" "}
            <SparklesIcon size={16} style={{ color: "var(--accent)" }} />
          </p>
          <p className="muted small">Send the first message below. Photos &amp; files work too!</p>
        </div>
      )}
      {windowedMessages.map((message, index) => {
        const day = fmtDay(message.createdAt);
        const showDay =
          index === 0 || fmtDay(windowedMessages[index - 1].createdAt) !== day;
        const mine = message.senderId === me.id;
        const wpSignal = !message.unsentAt
          ? parseWallpaperSignal(message.body, message.attachmentUrl)
          : null;
        if (wpSignal) {
          const actor = mine ? "You" : friend.displayName;
          return (
            <div key={message.renderKey ?? message.id}>
              {showDay && <div className="day-divider">{day}</div>}
              <div className="wallpaper-event-pill" id={`message-${message.id}`}>
                <ImageIcon size={13} /> {actor}{" "}
                {wpSignal.kind === "none"
                  ? "reset the chat wallpaper"
                  : "changed the chat wallpaper"}
              </div>
            </div>
          );
        }
        const statusReply = parseStatusReply(message.body);
        const callInvite = parseCallInvite(message.body);
        const viewOnceEnv = !callInvite
          ? parseViewOnceEnvelope(message.body, {
              url: message.attachmentUrl,
              name: message.attachmentName,
              type: message.attachmentType,
            })
          : null;
        const isViewOnce = Boolean(viewOnceEnv);
        const mentionedMe =
          !mine &&
          !message.unsentAt &&
          !isViewOnce &&
          Boolean(
            me.username &&
              new RegExp(
                `(?:^|[\\s(])@(?:everyone|${me.username.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")})\\b`,
                "i",
              ).test(message.body),
          );
        const isAudioNote =
          !callInvite && !isViewOnce && isVoiceNoteOrAudio(message.attachmentType, message.attachmentName);
        const isImage = !callInvite && !isViewOnce && message.attachmentType?.startsWith("image/");
        const isVideo =
          !callInvite &&
          !isViewOnce &&
          !isAudioNote &&
          (message.attachmentType?.startsWith("video/") ||
            /\.(mp4|m4v|mov|webm|ogg)$/i.test(message.attachmentName ?? ""));
          // A confirmed message that already inherited its pending twin's render key
          // must not animate again: it is the same bubble, just reconciled.
          const replacedPending = String(message.renderKey ?? "").startsWith("pending-");
          const isJustArrived =
            message.id.startsWith("pending-") ||
            (!replacedPending && Date.now() - message.createdAt < 2_500);
          return (
          <div key={message.renderKey ?? message.id}>
            {showDay && <div className="day-divider">{day}</div>}
            {firstUnreadMessageId === message.id && (
              <div className="unread-messages-divider" role="separator">
                <span>Unread messages</span>
              </div>
            )}
            <div
              className={`msg-row ${mine ? "mine" : "theirs"} ${
                isJustArrived ? "msg-just-arrived" : ""
              } ${
                highlightedJumpId === message.id || activeSearchMatchId === message.id
                  ? "jump-highlight-pulse"
                  : ""
              }`}
              id={`message-${message.id}`}
            >
              {!mine && (
                <Avatar user={friend} size={30} ringWidth={2} onClick={handleOpenFriendProfile} />
              )}
              <div className="msg-col">
                <SwipeToReply
                  disabled={Boolean(message.unsentAt) || message.id.startsWith("pending-")}
                  onReply={() => onSwipeReply(message)}
                >
                  <DecoratedMessageBubble
                    key={message.unsentAt ? "unsent" : "live"}
                    styleId={callInvite ? "default" : (message.bubbleStyle ?? "default")}
                    mine={mine}
                    unsent={Boolean(message.unsentAt)}
                    className={`${mine ? "mine" : "theirs"} ${mentionedMe ? "bubble-mentioned" : ""}`}
                    onContextMenu={
                      message.id.startsWith("pending-")
                        ? undefined
                        : (event) => onOpenMessageMenu(event, message)
                    }
                    onPointerDown={(event) => startBubblePointerHold(event, message)}
                    onPointerMove={moveBubblePointerHold}
                    onPointerUp={cancelBubbleTouchHold}
                    onPointerCancel={cancelBubbleTouchHold}
                  >
                  {!message.unsentAt &&
                    (message.forwardedContext || message.forwardedFrom) && (
                      <ForwardedMessageCard
                        context={message.forwardedContext}
                        legacySenderName={message.forwardedFrom}
                        fallbackTimestamp={message.createdAt}
                      />
                    )}
                  {message.replyTo && (
                    <button
                      type="button"
                      className="reply-quote"
                      onClick={() =>
                        document
                          .getElementById(`message-${message.replyTo?.id}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                    >
                      <strong>
                        {message.replyTo.senderId === me.id ? "You" : friend.displayName}
                      </strong>
                      <span>
                        {formatPreviewMessageText(message.replyTo.body) || (
                          <>
                            <PaperclipIcon size={12} /> Attachment
                          </>
                        )}
                      </span>
                    </button>
                  )}
                  {message.unsentAt ? (
                    <p className="unsent-copy">This message was unsent</p>
                  ) : callInvite ? (
                    <CallMessageCard invite={callInvite} isMine={mine} peer={friend} />
                  ) : viewOnceEnv ? (
                    <ViewOnceMessageBubble
                      messageId={message.id}
                      senderName={mine ? "You" : friend.displayName}
                      envelope={viewOnceEnv}
                      mine={mine}
                    />
                  ) : (
                    <>
                      {message.attachmentUrl &&
                        (isAudioNote ? (
                          <VoiceNotePlayer
                            messageId={message.id}
                            audioUrl={message.attachmentUrl}
                            attachmentType={message.attachmentType}
                            mine={mine}
                            showTranscript={Boolean(shownTranscriptIds[message.id])}
                            onToggleTranscript={(show) => onToggleTranscript(message.id, show)}
                            onOpenContextAt={
                              message.id.startsWith("pending-")
                                ? undefined
                                : (x, y) => onOpenMessageMenuAt(x, y, message)
                            }
                          />
                        ) : isImage ? (
                          <SpoilerFrame active={Boolean(message.isSpoiler)} spoilerKey={message.id}>
                            <button
                              type="button"
                              className="image-message-button"
                              onClick={() => onOpenImage(message.attachmentUrl!)}
                              aria-label="Open image viewer"
                            >
                              <ChatAttachmentImage
                                className="msg-image"
                                src={message.attachmentUrl}
                                alt={message.attachmentName ?? "attachment"}
                                maxWidth={420}
                                maxHeight={420}
                                onLoad={() => {
                                  if (initialScrollAllowedRef.current) {
                                    const container = messagesRef.current;
                                    if (container) container.scrollTop = container.scrollHeight;
                                  }
                                }}
                              />
                            </button>
                          </SpoilerFrame>
                        ) : isVideo ? (
                          <SpoilerFrame active={Boolean(message.isSpoiler)} spoilerKey={message.id}>
                            <ChatVideoPlayer
                              src={message.attachmentUrl}
                              name={message.attachmentName}
                            />
                          </SpoilerFrame>
                        ) : (
                          <a
                            className="file-chip"
                            href={message.attachmentUrl}
                            download={message.attachmentName ?? "file"}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <PaperclipIcon size={14} /> {message.attachmentName ?? "Attachment"}
                          </a>
                        ))}
                      {statusReply.quote !== null && (
                        <div className={`status-reply-chip ${mine ? "mine" : ""}`}>
                          <span className="status-reply-chip-icon" aria-hidden="true">
                            <IosReplyIcon size={13} />
                          </span>
                          <span className="status-reply-chip-text">
                            <strong>Replying to Status</strong>
                            {statusReply.quote ? <span>{statusReply.quote}</span> : null}
                          </span>
                        </div>
                      )}
                      {message.body && (
                        <>
                          <MessageMarkdown
                            text={statusReply.body || message.body}
                            mine={mine}
                            highlightQuery={highlightQuery}
                          />
                          <MessageLinkEmbeds text={statusReply.body || message.body} />
                        </>
                      )}
                    </>
                  )}
                  </DecoratedMessageBubble>
                </SwipeToReply>
                {!!message.reactions?.length && (
                  <div className="message-reactions">
                    {Array.from(new Set(message.reactions.map((reaction) => reaction.emoji))).map(
                      (emoji) => {
                        const users = message.reactions?.filter((reaction) => reaction.emoji === emoji) ?? [];
                        const mineReacted = users.some((reaction) => reaction.userId === me.id);
                        return (
                          <button
                            type="button"
                            key={emoji}
                            className={`reaction-chip ${mineReacted ? "selected" : ""}`}
                            onClick={() => onReactToMessage(message, emoji)}
                            aria-label={`${emoji} reaction, ${users.length} people`}
                          >
                            <IosEmojiGlyph emoji={emoji} size={16} /> <span>{users.length}</span>
                          </button>
                        );
                      },
                    )}
                    {!message.unsentAt && (
                      <button
                        type="button"
                        className="reaction-chip reaction-add-chip"
                        onClick={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          onOpenReactionPicker(
                            rect.left + rect.width / 2,
                            rect.top,
                            message,
                          );
                        }}
                        title="Add another reaction"
                        aria-label="Add another reaction"
                      >
                        <PlusIcon size={13} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                )}
                <span className="msg-time">
                  {fmtTime(message.createdAt)}
                  {!callInvite && message.editedAt ? " · Edited" : ""}
                </span>
                {mine && !message.unsentAt && (friend.id === me.id || message.deliveryStatus) && (
                  <span className="message-delivery-status">
                    {friend.id === me.id
                      ? "Read"
                      : message.deliveryStatus === "delivered"
                        ? "Delivered"
                        : message.deliveryStatus === "sent"
                          ? "Sent"
                          : "Read"}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

const DirectChatComposer = memo(function DirectChatComposer({
  friend,
  friendStatus,
  initialDraft,
  hasFile,
  viewOnceActive,
  onToggleViewOnce,
  isFriendBlocked,
  isEditing,
  composerRef,
  fileInputRef,
  onAddFiles,
  onStartVoiceNote,
  onMobileActivate,
  onStickerSent,
  onTypingSignal,
  onSubmitDraft,
}: {
  friend: JaUser;
  friendStatus?: "online" | "away" | "dnd" | "offline";
  initialDraft: string;
  hasFile: boolean;
  viewOnceActive: boolean;
  onToggleViewOnce: () => void;
  isFriendBlocked: boolean;
  isEditing: boolean;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAddFiles: (files: File[]) => void;
  onStartVoiceNote: () => void;
  onMobileActivate: () => void;
  onStickerSent: () => void;
  onTypingSignal: (hasText: boolean) => void;
  onSubmitDraft: (body: string) => void;
}) {
  const friendId = friend.id;
  const friendUsername = friend.username;
  const draftKey = `dm:${friendId}`;
  const startText = isEditing ? initialDraft : initialDraft || getDraft(draftKey);
  const [draft, setDraft] = useState(startText);
  const [cursorPos, setCursorPos] = useState(startText.length);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissedAt, setMentionDismissedAt] = useState<number | null>(null);
  const prevLenRef = useRef(startText.length);

  useLayoutEffect(() => {
    const seed = isEditing ? initialDraft : initialDraft || getDraft(draftKey);
    syncComposerTextareaHeight(composerRef.current, 0, seed);
    prevLenRef.current = seed.length;
  }, [composerRef, draftKey, initialDraft, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const el = composerRef.current;
    if (!el) return;
    const raf = window.requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      const end = el.value.length;
      el.setSelectionRange(end, end);
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [composerRef, isEditing]);

  const activeMentionMatch = useMemo(() => {
    const match = detectDmMentionQuery(draft, cursorPos);
    if (!match) return null;
    if (mentionDismissedAt !== null && mentionDismissedAt === match.start) return null;
    return match;
  }, [cursorPos, draft, mentionDismissedAt]);

  const mentionCandidates = useMemo(() => {
    if (!activeMentionMatch) return [];
    const q = activeMentionMatch.query.toLowerCase();
    const list: Array<
      | { kind: "everyone"; handle: string; subtitle: string }
      | { kind: "peer"; handle: string; user: JaUser }
    > = [];
    if ("everyone".includes(q)) {
      list.push({
        kind: "everyone",
        handle: "everyone",
        subtitle: "Notify everyone in this chat",
      });
    }
    if (
      friend.username.toLowerCase().includes(q) ||
      friend.displayName.toLowerCase().includes(q)
    ) {
      list.push({
        kind: "peer",
        handle: friend.username,
        user: friend,
      });
    }
    return list;
  }, [activeMentionMatch, friend]);

  const safeMentionIndex =
    mentionCandidates.length > 0 ? Math.min(mentionIndex, mentionCandidates.length - 1) : 0;

  function applyMention(handle: string) {
    if (!activeMentionMatch) return;
    const before = draft.slice(0, activeMentionMatch.start);
    const after = draft.slice(cursorPos);
    const insertion = `@${handle} `;
    const nextDraft = `${before}${insertion}${after.replace(/^\s+/, "")}`;
    const nextCursor = before.length + insertion.length;
    const prevLen = prevLenRef.current;
    prevLenRef.current = nextDraft.length;
    setDraft(nextDraft);
    if (!isEditing) saveStoredDraft(draftKey, nextDraft);
    setCursorPos(nextCursor);
    setMentionIndex(0);
    setMentionDismissedAt(null);
    syncComposerTextareaHeight(composerRef.current, prevLen, nextDraft);
    window.requestAnimationFrame(() => {
      const el = composerRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
    });
  }

  function handleChange(next: string, selectionStart?: number | null) {
    const prevLen = prevLenRef.current;
    prevLenRef.current = next.length;
    setDraft(next);
    if (!isEditing) {
      saveStoredDraft(draftKey, next);
    }
    if (next.includes("@") || activeMentionMatch !== null) {
      setCursorPos(selectionStart ?? next.length);
      setMentionIndex(0);
      setMentionDismissedAt(null);
    }
    syncComposerTextareaHeight(composerRef.current, prevLen, next);
    if (!isEditing) {
      onTypingSignal(Boolean(next.trim()));
    }
  }

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (isFriendBlocked) return;
    const trimmed = draft.trim();
    if (isEditing ? !trimmed : !trimmed && !hasFile) return;
    const keepFocus =
      document.activeElement === composerRef.current && isSoftKeyboardCurrentlyOpen();
    prevLenRef.current = 0;
    setDraft("");
    setCursorPos(0);
    setMentionIndex(0);
    setMentionDismissedAt(null);
    if (!isEditing) {
      clearDraft(draftKey);
    }
    syncComposerTextareaHeight(composerRef.current, trimmed.length, "");
    onSubmitDraft(trimmed);
    if (keepFocus) {
      composerRef.current?.focus({ preventScroll: true });
    }
  }

  return (
    <div className="composer-wrap">
      {mentionCandidates.length > 0 && (
        <div className="mention-autocomplete" role="listbox" aria-label="Mention someone">
          <div className="mention-autocomplete-header">
            Mention matching <strong>@{activeMentionMatch?.query ?? ""}</strong>
          </div>
          {mentionCandidates.map((candidate, idx) => {
            const isActive = idx === safeMentionIndex;
            if (candidate.kind === "everyone") {
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  key="dm-mention-everyone"
                  className={`mention-option ${isActive ? "active" : ""}`}
                  onMouseEnter={() => setMentionIndex(idx)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyMention("everyone");
                  }}
                >
                  <span className="mention-everyone-avatar" aria-hidden="true">
                    @
                  </span>
                  <span className="mention-option-text">
                    <strong>@everyone</strong>
                    <small className="muted">{candidate.subtitle}</small>
                  </span>
                  <span className="mention-role-tag everyone">Ping all</span>
                </button>
              );
            }
            return (
              <button
                type="button"
                role="option"
                aria-selected={isActive}
                key={`dm-mention-${candidate.user.id}`}
                className={`mention-option ${isActive ? "active" : ""}`}
                onMouseEnter={() => setMentionIndex(idx)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  applyMention(candidate.user.username);
                }}
              >
                <Avatar user={candidate.user} size={30} status={friendStatus} />
                <span className="mention-option-text">
                  <strong>{candidate.user.displayName}</strong>
                  <small className="muted">@{candidate.user.username}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <form className="composer" onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length > 0) onAddFiles(picked);
            e.currentTarget.value = "";
          }}
        />
        <ComposerPlusMenu
          targetKind="dm"
          targetId={friendId}
          targetLabel={`@${friendUsername}`}
          disabled={isFriendBlocked || isEditing}
          currentDraft={draft}
          onConsumeDraft={() => handleChange("", 0)}
          onUploadAttachment={() => fileInputRef.current?.click()}
          viewOnceActive={viewOnceActive}
          onToggleViewOnce={onToggleViewOnce}
        />
        <StickerPicker
          friendId={friendId}
          disabled={isFriendBlocked || isEditing}
          onSent={onStickerSent}
        />
        <button
          type="button"
          className="icon-btn voice-note-btn"
          title="Record voice note"
          aria-label="Record voice note"
          disabled={isFriendBlocked || isEditing}
          onClick={onStartVoiceNote}
        >
          <MicVoiceIcon size={18} />
        </button>
        <div className={`composer-input-shell ${viewOnceActive && !isEditing ? "has-viewonce" : ""}`}>
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => handleChange(e.target.value, e.currentTarget.selectionStart)}
            onFocus={onMobileActivate}
            onClick={(e) => {
              onMobileActivate();
              if (draft.includes("@")) {
                setCursorPos(e.currentTarget.selectionStart ?? 0);
              }
            }}
            onKeyUp={(e) => {
              if (
                draft.includes("@") &&
                e.key !== "ArrowDown" &&
                e.key !== "ArrowUp" &&
                e.key !== "Enter" &&
                e.key !== "Escape"
              ) {
                setCursorPos(e.currentTarget.selectionStart ?? 0);
              }
            }}
            placeholder={
              isFriendBlocked
                ? "Unblock to message"
                : isEditing
                  ? "Edit message…"
                  : viewOnceActive
                    ? "View once message…"
                    : "Message…"
            }
            aria-label={`Message @${friendUsername}`}
            disabled={isFriendBlocked}
            rows={1}
            onPaste={(e) => {
              if (isFriendBlocked || isEditing) return;
              const pasted = extractClipboardFile(e.clipboardData);
              if (pasted) {
                e.preventDefault();
                onAddFiles([pasted]);
              }
            }}
            onKeyDown={(e) => {
              if (mentionCandidates.length > 0 && activeMentionMatch) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((cur) => (cur + 1) % mentionCandidates.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex(
                    (cur) => (cur - 1 + mentionCandidates.length) % mentionCandidates.length,
                  );
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  const chosen = mentionCandidates[safeMentionIndex];
                  if (chosen) applyMention(chosen.handle);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMentionDismissedAt(activeMentionMatch.start);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          {viewOnceActive && !isEditing && (
            <button
              type="button"
              className="composer-viewonce-badge"
              title="View once enabled (click to turn off)"
              aria-label="Disable view once"
              onClick={onToggleViewOnce}
            >
              <ViewOnceRingIcon size={17} />
            </button>
          )}
        </div>
        <button
          className="send-btn"
          type="submit"
          disabled={
            isFriendBlocked ||
            (isEditing ? !draft.trim() : !draft.trim() && !hasFile)
          }
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          aria-label={isEditing ? "Save edit" : "Send message"}
        >
          {isEditing ? <CheckIcon size={19} strokeWidth={2.6} /> : <SendIcon size={18} />}
        </button>
      </form>
    </div>
  );
});

export function ChatView({
  friend,
  onOpenProfile,
  onBack,
}: {
  friend: JaUser;
  onOpenProfile: (user: JaUser) => void;
  onBack: () => void;
}) {
  const store = useJaText();
  const { startCall } = useCall();
  const {
    me,
    activeMessages,
    activeMessagesReady,
    friendActivities,
    sendMessage,
    editMessage,
    markMessagesRead,
    setTyping,
    soundsEnabled,
    toggleMessageReaction,
  } = store;
  const [composerSeed, setComposerSeed] = useState({ nonce: 0, text: "" });
  const [files, setFiles] = useState<File[]>([]);
  // Which staged files should arrive blurred. Keyed by the File itself, so
  // removing a file from the tray never shifts another file's choice.
  const [spoilerFiles, setSpoilerFiles] = useState<Set<File>>(new Set());
  const [viewOnceActive, setViewOnceActive] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  const pinnedMessages = usePinnedMessages(`dm:${friend.id}`);
  const [recordingVoiceNote, setRecordingVoiceNote] = useState(false);
  const [shownTranscriptIds, setShownTranscriptIds] = useState<Record<string, boolean>>({});
  const [deletedUndoState, setDeletedUndoState] = useState<DeletedForMeUndoState | null>(null);
  const [locallyHiddenIds, setLocallyHiddenIds] = useState<Record<string, true>>({});
  const deletedSnapshotRef = useRef<Map<string, ChatMessage>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [showUnsendWarning, setShowUnsendWarning] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [messageMenuClosing, setMessageMenuClosing] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<{
    x: number;
    y: number;
    message: ChatMessage;
  } | null>(null);
  const [bubbleStyleOpen, setBubbleStyleOpen] = useState(false);
  const [wallpaperModalOpen, setWallpaperModalOpen] = useState(false);
  const [headerMoreMenu, setHeaderMoreMenu] = useState<{
    x: number;
    y: number;
    closing?: boolean;
  } | null>(null);
  const [inspectingMessage, setInspectingMessage] = useState<ChatMessage | null>(null);
  const e2ee = useE2EESnapshot();
  const peerE2EE = e2ee.peerKeys[friend.id];
  const isMobileWallpaper = useIsMobileWallpaperSupported();
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);
  const [forwardClosing, setForwardClosing] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);
  const imageTransformRef = useRef({ scale: 1, x: 0, y: 0 });
  const [imageClosing, setImageClosing] = useState(false);
  const [chatClosing, setChatClosing] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const initialScrollAllowedRef = useRef(true);
  const hasScrolledOnOpenRef = useRef(false);
  const scrollTargetChatRef = useRef<string | null>(null);
  const imageGestureRef = useRef<
    | { mode: "pinch"; distance: number; scale: number; x: number; y: number; centerX: number; centerY: number }
    | { mode: "pan"; touchX: number; touchY: number; x: number; y: number }
    | null
  >(null);
  const lastPendingMessageAtRef = useRef(0);
  const typingTimer = useRef<number | null>(null);
  const pendingAttachmentUrlsRef = useRef(new Map<string, string>());
  const imageCloseTimerRef = useRef<number | null>(null);
  const messageMenuCloseTimerRef = useRef<number | null>(null);
  const forwardCloseTimerRef = useRef<number | null>(null);
  const chatCloseTimerRef = useRef<number | null>(null);
  const typingActive = useRef(false);
  const lastTypingUpdate = useRef(0);
  const setTypingRef = useRef(setTyping);
  const friendActivity = friendActivities.find((activity) => activity.userId === friend.id);
  const isFriendBlocked = store.blockedUserIds.includes(friend.id);
  const conversationMessages = useMemo(
    () =>
      (store.activeChatId === friend.id ? activeMessages : EMPTY_MESSAGES).filter(
        (m) => !isHiddenCallSignal(m.body),
      ),
    [activeMessages, friend.id, store.activeChatId],
  );
  const unreadIncomingSignature = useMemo(() => {
    const unread = conversationMessages.filter(
      (message) => message.senderId === friend.id && message.deliveryStatus !== "read",
    );
    if (unread.length === 0) return "";
    return `${unread.length}:${unread.at(-1)?.id ?? ""}`;
  }, [conversationMessages, friend.id]);
  const { messages: rawDisplayedMessages, matchedPendingIds } = useMemo(
    () => getConversationMessages(pendingMessages, conversationMessages, friend.id, me?.id),
    [conversationMessages, friend.id, me?.id, pendingMessages],
  );
  const visibleRawDisplayedMessages = useMemo(
    () =>
      rawDisplayedMessages.filter(
        (m) => !locallyHiddenIds[m.id] && !(m.renderKey && locallyHiddenIds[m.renderKey]),
      ),
    [locallyHiddenIds, rawDisplayedMessages],
  );
  const displayedMessages = useUnsendThanosWatcher(visibleRawDisplayedMessages, `dm:${friend.id}`);
  const searchMatchIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!searchOpen || !q) return [];
    return displayedMessages
      .filter(
        (m) =>
          !m.unsentAt &&
          !isViewOnceBody(m.body) &&
          (formatPreviewMessageText(m.body).toLowerCase().includes(q) ||
            (m.attachmentName ?? "").toLowerCase().includes(q)),
      )
      .map((m) => m.id);
  }, [displayedMessages, searchOpen, searchQuery]);
  const safeSearchMatchIdx =
    searchMatchIds.length > 0 ? Math.min(searchMatchIdx, searchMatchIds.length - 1) : 0;
  const activeSearchMatchId =
    searchMatchIds.length > 0 ? searchMatchIds[safeSearchMatchIdx] : null;
  const activeWallpaperUrl = useMemo(() => {
    for (let i = displayedMessages.length - 1; i >= 0; i--) {
      const msg = displayedMessages[i];
      if (msg.unsentAt) continue;
      const wp = parseWallpaperSignal(msg.body, msg.attachmentUrl);
      if (wp) return wp.url;
    }
    return getCachedWallpaper(`dm:${friend.id}`) ?? null;
  }, [displayedMessages, friend.id]);

  useEffect(() => {
    for (let i = displayedMessages.length - 1; i >= 0; i--) {
      const msg = displayedMessages[i];
      if (msg.unsentAt) continue;
      const wp = parseWallpaperSignal(msg.body, msg.attachmentUrl);
      if (wp) {
        saveCachedWallpaper(`dm:${friend.id}`, wp.url);
        break;
      }
    }
  }, [displayedMessages, friend.id]);

  const showMobileWallpaper = isMobileWallpaper && Boolean(activeWallpaperUrl);
  const lastDisplayedMsg = displayedMessages.at(-1);
  const {
    pinToBottomBurst,
    handleMobileComposerActivate,
  } = useChatAutoScrollAndKeyboard({
    conversationKey: `dm:${friend.id}`,
    messagesReady: activeMessagesReady && store.activeChatId === friend.id,
    messageCount: displayedMessages.length,
    tailMessageKey: lastDisplayedMsg ? `${lastDisplayedMsg.id}:${lastDisplayedMsg.createdAt}` : "",
    tailSenderId: lastDisplayedMsg?.senderId,
    myUserId: me?.id,
    messagesRef,
    composerRef,
  });
  const scrollToBottom = useCallback(() => {
    pinToBottomBurst();
  }, [pinToBottomBurst]);
  const isSelfChat = Boolean(me && friend.id === me.id);
  const friendStatusLabel = useMemo(() => {
    if (isSelfChat) return "Message yourself";
    const st = String(friendActivity?.status ?? "");
    if (st === "online") return "Online";
    if (st === "idle" || st === "away") return "Idle";
    if (st === "dnd") return "Do Not Disturb";
    const lastSeen = friendActivity?.lastSeenAt;
    if (typeof lastSeen === "number" && lastSeen > 0) {
      const diffMs = Math.max(0, Date.now() - lastSeen);
      if (diffMs < 60_000) return "Last seen just now";
      if (diffMs < 3_600_000) return `Last seen ${Math.max(1, Math.floor(diffMs / 60_000))}m ago`;
      const d = new Date(lastSeen);
      const now = new Date();
      const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (d.toDateString() === now.toDateString()) {
        return `Last seen today at ${timeStr}`;
      }
      const yest = new Date(now);
      yest.setDate(now.getDate() - 1);
      if (d.toDateString() === yest.toDateString()) {
        return `Last seen yesterday at ${timeStr}`;
      }
      return `Last seen ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
    }
    return "Offline";
  }, [friendActivity?.lastSeenAt, friendActivity?.status, isSelfChat]);
  const conversationReady =
    activeMessagesReady && store.activeChatId === friend.id;

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

  function closeChat() {
    if (chatCloseTimerRef.current !== null) return;
    setChatClosing(true);
    chatCloseTimerRef.current = window.setTimeout(() => {
      onBack();
      chatCloseTimerRef.current = null;
    }, 160);
  }

  useEffect(() => {
    setTypingRef.current = setTyping;
  }, [setTyping]);

  useLayoutEffect(() => {
    if (scrollTargetChatRef.current !== friend.id) {
      scrollTargetChatRef.current = friend.id;
      hasScrolledOnOpenRef.current = false;
      initialScrollAllowedRef.current = true;
    }
    if (!conversationReady || hasScrolledOnOpenRef.current) return;

    hasScrolledOnOpenRef.current = true;
    window.requestAnimationFrame(() => {
      if (initialScrollAllowedRef.current) scrollToBottom();
    });
  }, [conversationReady, friend.id, scrollToBottom]);

  function applyImageTransform(scale: number, x: number, y: number) {
    const image = imageElementRef.current;
    if (!image) return;
    const viewport = image.parentElement;
    const maxX = Math.max(0, ((image.offsetWidth * scale) - (viewport?.clientWidth ?? 0)) / 2);
    const maxY = Math.max(0, ((image.offsetHeight * scale) - (viewport?.clientHeight ?? 0)) / 2);
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
      imageGestureRef.current = {
        mode: "pan",
        touchX: touch.clientX,
        touchY: touch.clientY,
        x: transform.x,
        y: transform.y,
      };
    } else {
      imageGestureRef.current = null;
    }
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
      const base = gesture?.mode === "pinch"
        ? gesture
        : {
            mode: "pinch" as const,
            distance,
            scale: imageTransformRef.current.scale,
            x: imageTransformRef.current.x,
            y: imageTransformRef.current.y,
            centerX,
            centerY,
          };
      if (gesture?.mode !== "pinch") imageGestureRef.current = base;
      const scale = Math.min(4, Math.max(1, base.scale * distance / Math.max(base.distance, 1)));
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
      applyImageTransform(
        imageTransformRef.current.scale,
        gesture.x + touch.clientX - gesture.touchX,
        gesture.y + touch.clientY - gesture.touchY,
      );
    }
  }

  function endImageGesture(event: React.TouchEvent<HTMLImageElement>) {
    if (event.touches.length === 1 && imageTransformRef.current.scale > 1) {
      const touch = event.touches[0];
      imageGestureRef.current = {
        mode: "pan",
        touchX: touch.clientX,
        touchY: touch.clientY,
        x: imageTransformRef.current.x,
        y: imageTransformRef.current.y,
      };
      return;
    }
    imageGestureRef.current = null;
  }

  const removePendingMessage = useCallback((id: string) => {
    const attachmentUrl = pendingAttachmentUrlsRef.current.get(id);
    if (attachmentUrl) {
      URL.revokeObjectURL(attachmentUrl);
      pendingAttachmentUrlsRef.current.delete(id);
    }
    setPendingMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  useEffect(
    () => () => {
      for (const attachmentUrl of pendingAttachmentUrlsRef.current.values()) {
        URL.revokeObjectURL(attachmentUrl);
      }
      pendingAttachmentUrlsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    for (const id of matchedPendingIds) {
      const attachmentUrl = pendingAttachmentUrlsRef.current.get(id);
      if (attachmentUrl) {
        URL.revokeObjectURL(attachmentUrl);
        pendingAttachmentUrlsRef.current.delete(id);
      }
    }
  }, [matchedPendingIds]);

  useEffect(() => {
    if (!imagePreview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeImagePreview();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeImagePreview, imagePreview]);

  useEffect(
    () => () => {
      if (imageCloseTimerRef.current !== null) window.clearTimeout(imageCloseTimerRef.current);
      if (messageMenuCloseTimerRef.current !== null)
        window.clearTimeout(messageMenuCloseTimerRef.current);
      if (forwardCloseTimerRef.current !== null)
        window.clearTimeout(forwardCloseTimerRef.current);
      if (chatCloseTimerRef.current !== null)
        window.clearTimeout(chatCloseTimerRef.current);
    },
    [],
  );

  const serverPreviewUnread = useMemo(
    () => store.previews.find((p) => p.friendId === friend.id)?.unreadCount ?? 0,
    [friend.id, store.previews],
  );
  useEffect(() => {
    if (chatClosing || !me?.id || store.activeChatId !== friend.id) {
      return;
    }
    const dmPrefs = getUserChatPrefs(me.id).dms[friend.id];
    const hasLocalUnread = (dmPrefs?.unreadTimestamps.length ?? 0) > 0;
    if (!unreadIncomingSignature && !hasLocalUnread && serverPreviewUnread <= 0) {
      return;
    }
    let cancelled = false;
    const maybeMarkRead = async () => {
      if (cancelled || chatClosing || store.activeChatId !== friend.id) return;
      const activelyViewing = await isChatActivelyVisibleToUser();
      if (!cancelled && activelyViewing) {
        if (!store.activeMessagesReady && !hasLocalUnread && serverPreviewUnread <= 0) return;
        void markMessagesRead(friend.id).catch((cause: unknown) => {
          setError(friendlyError(cause, "Couldn't update read status."));
        });
      }
    };
    void maybeMarkRead();

    const onVisibilityOrFocus = () => {
      void maybeMarkRead();
    };
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("focus", onVisibilityOrFocus);
    const nativeSub = Capacitor.isNativePlatform()
      ? CapacitorApp.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            window.setTimeout(() => void maybeMarkRead(), 150);
          }
        })
      : null;

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener("focus", onVisibilityOrFocus);
      if (nativeSub) {
        void nativeSub.then((h) => h.remove());
      }
    };
  }, [chatClosing, friend.id, markMessagesRead, me?.id, serverPreviewUnread, store.activeChatId, store.activeMessagesReady, unreadIncomingSignature]);

  useEffect(
    () => () => {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      if (typingActive.current) {
        void setTypingRef.current(friend.id, false).catch((error: unknown) => {
          console.error("Could not clear typing status.", error);
        });
      }
    },
    [friend.id],
  );

  const handleToggleTranscript = useCallback((id: string, show: boolean) => {
    setShownTranscriptIds((prev) => ({ ...prev, [id]: show }));
  }, []);

  const handleStartVoiceNote = useCallback(() => {
    setRecordingVoiceNote(true);
  }, []);

  const publishTyping = useCallback(
    (isTyping: boolean) => {
      window.setTimeout(() => {
        void setTypingRef.current(friend.id, isTyping).catch((err: unknown) => {
          setError(friendlyError(err, "Couldn't update your typing status."));
        });
      }, 0);
    },
    [friend.id],
  );

  const handleTypingSignal = useCallback(
    (hasText: boolean) => {
      if (!hasText) {
        if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
        if (typingActive.current) {
          typingActive.current = false;
          publishTyping(false);
        }
        return;
      }

      const now = Date.now();
      if (!typingActive.current || now - lastTypingUpdate.current >= 3_000) {
        typingActive.current = true;
        lastTypingUpdate.current = now;
        publishTyping(true);
      }
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => {
        typingActive.current = false;
        publishTyping(false);
      }, 3_500);
    },
    [publishTyping],
  );

  const handleAddFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX_STAGED_FILES));
  }, []);

  const handlePastedChatFile = useCallback((pasted: File) => {
    setFiles((prev) => [...prev, pasted].slice(0, MAX_STAGED_FILES));
    window.setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 0);
  }, []);

  useChatImagePaste(
    handlePastedChatFile,
    !isFriendBlocked && !editingMessage && !recordingVoiceNote,
  );

  const handleSubmitDraft = useCallback(
    async (submittedBody: string) => {
      if (editingMessage) {
        const hasAttachmentOnEdited = Boolean(
          editingMessage.attachmentUrl || editingMessage.encryptedAtt || editingMessage.stickerKey,
        );
        if ((!submittedBody && !hasAttachmentOnEdited) || isFriendBlocked) return;
        const targetId = editingMessage.id;
        setError(null);
        setEditingMessage(null);
        setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
        try {
          await editMessage(targetId, submittedBody);
        } catch (err) {
          setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: submittedBody }));
          setError(friendlyError(err, "Couldn't edit the message. Please try again."));
        }
        return;
      }
      if ((!submittedBody && files.length === 0) || isFriendBlocked) return;
      const sentBody = submittedBody;
      const queuedFiles = files;
      const sentReply = replyTo;

      if (viewOnceActive) {
        const photoFile = queuedFiles.find((f) => f.type.startsWith("image/")) ?? null;
        const audioFile =
          queuedFiles.find((f) => isVoiceNoteOrAudio(f.type, f.name)) ?? null;
        if (!sentBody && !photoFile && !audioFile) {
          setError("View once supports text, photos, and audio attachments.");
          return;
        }
        setFiles([]);
        setViewOnceActive(false);
        setReplyTo(null);
        setError(null);
        if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
        if (typingActive.current) {
          typingActive.current = false;
          publishTyping(false);
        }
        try {
          const voBody = await buildEncryptedViewOnceBody({
            text: sentBody,
            photoFile,
            audioFile,
          });
          await sendMessage(friend.id, voBody, undefined, sentReply?.id);
          if (soundsEnabled) playMessageSound("sent");
          window.requestAnimationFrame(scrollToBottom);
        } catch (err) {
          if (sentBody) {
            setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: sentBody }));
          }
          if (queuedFiles.length > 0) setFiles(queuedFiles);
          setViewOnceActive(true);
          setError(friendlyError(err, "Couldn't send the view once message."));
        }
        return;
      }

      setFiles([]);
      setReplyTo(null);
      setError(null);
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      if (typingActive.current) {
        typingActive.current = false;
        publishTyping(false);
      }

      const batches: Array<{
        body: string;
        file: File | null;
        replyId?: string;
        spoiler: boolean;
      }> =
        queuedFiles.length === 0
          ? [{ body: sentBody, file: null, replyId: sentReply?.id, spoiler: false }]
          : queuedFiles.map((f, idx) => ({
              body: idx === 0 ? sentBody : "",
              file: f,
              replyId: idx === 0 ? sentReply?.id : undefined,
              spoiler: spoilerFiles.has(f),
            }));

      const createdPendingIds: string[] = [];
      for (const item of batches) {
        const sentAt = Math.max(Date.now(), lastPendingMessageAtRef.current + 1);
        lastPendingMessageAtRef.current = sentAt;
        const pendingId = `pending-${sentAt}`;
        createdPendingIds.push(pendingId);
        const attachmentUrl = item.file ? URL.createObjectURL(item.file) : undefined;
        if (attachmentUrl) pendingAttachmentUrlsRef.current.set(pendingId, attachmentUrl);
        setPendingMessages((current) => [
          ...current.slice(-299),
          {
            id: pendingId,
            senderId: me?.id ?? "",
            receiverId: friend.id,
            body: item.body,
            bubbleStyle: getSavedOutgoingBubbleStyle(),
            attachmentUrl,
            attachmentName: item.file?.name,
            attachmentType: item.file?.type,
            isSpoiler: item.spoiler,
            createdAt: sentAt,
            deliveryStatus: "delivered",
          },
        ]);
      }
      window.requestAnimationFrame(scrollToBottom);

      try {
        for (let i = 0; i < batches.length; i++) {
          const item = batches[i];
          const pendingId = createdPendingIds[i];
          await sendMessage(
            friend.id,
            item.body,
            item.file ?? undefined,
            item.replyId,
            item.spoiler,
          );
          window.setTimeout(() => removePendingMessage(pendingId), PENDING_FALLBACK_DROP_MS);
        }
        if (soundsEnabled) playMessageSound("sent");
        setSpoilerFiles(new Set());
      } catch (err) {
        for (const pid of createdPendingIds) removePendingMessage(pid);
        if (sentBody) {
          setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: sentBody }));
        }
        if (queuedFiles.length > 0) setFiles((cur) => (cur.length > 0 ? cur : queuedFiles));
        setError(friendlyError(err, "Couldn't send the message. Please try again."));
      }
    },
    [
      editMessage,
      editingMessage,
      files,
      friend.id,
      isFriendBlocked,
      me?.id,
      publishTyping,
      removePendingMessage,
      replyTo,
      scrollToBottom,
      sendMessage,
      soundsEnabled,
      spoilerFiles,
      viewOnceActive,
    ],
  );

  const openMessageMenuAt = useCallback(
    (x: number, y: number, message: ChatMessage) => {
      if (messageMenuCloseTimerRef.current !== null) {
        window.clearTimeout(messageMenuCloseTimerRef.current);
        messageMenuCloseTimerRef.current = null;
      }
      setMessageMenuClosing(false);
      const now = Date.now();
      const isCallCard = Boolean(parseCallInvite(message.body));
      setMessageMenu({
        x,
        y,
        message,
        canUnsend:
          message.senderId === me?.id &&
          !message.unsentAt &&
          !isCallCard &&
          now - message.createdAt < UNSEND_WINDOW_MS,
        canEdit:
          message.senderId === me?.id &&
          !message.unsentAt &&
          !isCallCard &&
          !!message.body.trim(),
      });
    },
    [me?.id],
  );

  const openMessageMenu = useCallback(
    (event: MouseEvent, message: ChatMessage) => {
      event.preventDefault();
      event.stopPropagation();
      openMessageMenuAt(event.clientX, event.clientY, message);
    },
    [openMessageMenuAt],
  );

  async function sendVoiceNoteFile(voiceFile: File) {
    if (isFriendBlocked) return;
    setRecordingVoiceNote(false);
    const sentReply = replyTo;
    if (viewOnceActive) {
      const draftKey = `dm:${friend.id}`;
      const draftCaption = getDraft(draftKey).trim();
      const stagedPhoto = files.find((f) => f.type.startsWith("image/")) ?? null;
      setViewOnceActive(false);
      setFiles([]);
      if (draftCaption) {
        clearDraft(draftKey);
        setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
      }
      setReplyTo(null);
      setError(null);
      try {
        const voBody = await buildEncryptedViewOnceBody({
          text: draftCaption,
          photoFile: stagedPhoto,
          audioFile: voiceFile,
        });
        await sendMessage(friend.id, voBody, undefined, sentReply?.id);
        if (soundsEnabled) playMessageSound("sent");
        window.requestAnimationFrame(scrollToBottom);
      } catch (err) {
        setViewOnceActive(true);
        setError(friendlyError(err, "Couldn't send the view once voice note."));
      }
      return;
    }
    const sentAt = Math.max(Date.now(), lastPendingMessageAtRef.current + 1);
    lastPendingMessageAtRef.current = sentAt;
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
    setPendingMessages((current) => [
      ...current.slice(-299),
      {
        id: pendingId,
        senderId: me?.id ?? "",
        receiverId: friend.id,
        body: "",
        bubbleStyle: getSavedOutgoingBubbleStyle(),
        attachmentUrl,
        attachmentName: voiceFile.name,
        attachmentType: voiceFile.type,
        createdAt: sentAt,
        deliveryStatus: "delivered",
      },
    ]);
    window.requestAnimationFrame(scrollToBottom);
    setReplyTo(null);
    setError(null);
    try {
      await sendMessage(friend.id, "", voiceFile, sentReply?.id);
      if (soundsEnabled) playMessageSound("sent");
      window.setTimeout(() => removePendingMessage(pendingId), PENDING_FALLBACK_DROP_MS);
    } catch (err) {
      removePendingMessage(pendingId);
      setError(friendlyError(err, "Couldn't send the voice note. Please try again."));
    }
  }

  function replyToMessage(message: ChatMessage) {
    setReplyTo(message);
    closeMessageMenu();
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(
        message.unsentAt
          ? "This message was unsent"
          : formatPreviewMessageText(message.body) ||
              message.attachmentName ||
              message.attachmentUrl ||
              "",
      );
      closeMessageMenu();
    } catch (copyError) {
      setError(friendlyError(copyError, "Couldn't copy the message."));
    }
  }

  async function copyImageAddress(message: ChatMessage) {
    if (!message.attachmentUrl) return;
    try {
      await navigator.clipboard.writeText(message.attachmentUrl);
      closeMessageMenu();
    } catch (copyError) {
      setError(friendlyError(copyError, "Couldn't copy the image address."));
    }
  }

  async function copyImage(message: ChatMessage) {
    if (!message.attachmentUrl) return;
    try {
      await copyImageUrlToClipboard(message.attachmentUrl);
      closeMessageMenu();
    } catch (copyError) {
      setError(friendlyError(copyError, "Couldn't copy the image."));
    }
  }

  async function deleteForMe(message: ChatMessage) {
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
      await store.deleteMessageForMe(message.id);
    } catch (actionError) {
      setLocallyHiddenIds((prev) => {
        const next = { ...prev };
        delete next[message.id];
        if (message.renderKey) delete next[message.renderKey];
        return next;
      });
      setDeletedUndoState(null);
      setError(friendlyError(actionError, "Couldn't delete the message. Please try again."));
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
    if (!snap || !store.restoreMessageForMe) return;
    try {
      await store.restoreMessageForMe(snap);
    } catch (err) {
      setError(friendlyError(err, "Couldn't restore the message."));
    }
  }

  async function unsend(message: ChatMessage) {
    closeMessageMenu();
    const sweepDone = new Promise<void>((resolve) => {
      const started = triggerMessageThanosSnapById(message.id, undefined, () => resolve());
      if (!started) resolve();
    });
    try {
      const unsendReq = store.unsendMessage(message.id);
      const [, shouldShowWarning] = await Promise.all([sweepDone, unsendReq]);
      if (shouldShowWarning) setShowUnsendWarning(true);
    } catch (actionError) {
      restoreSnapTargetVisibilityById(message.id);
      setError(friendlyError(actionError, "Couldn't unsend the message. Please try again."));
    }
  }

  function startEditingMessage(message: ChatMessage) {
    setPendingMessages((current) =>
      current.filter((m) => m.receiverId !== friend.id),
    );
    setEditingMessage(message);
    setReplyTo(null);
    setFiles([]);
    setViewOnceActive(false);
    setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
    closeMessageMenu();
  }

  function cancelEditingMessage() {
    setEditingMessage(null);
    setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
  }

  const reactToMessage = useCallback(async (message: ChatMessage, emoji: string) => {
    try {
      await toggleMessageReaction(message.id, emoji);
      closeMessageMenu();
      setReactionTarget(null);
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't add the reaction. Please try again."));
    }
  }, [closeMessageMenu, toggleMessageReaction]);

  const handleOpenReactionPicker = useCallback(
    (x: number, y: number, message: ChatMessage) => {
      setReactionTarget({ x, y, message });
    },
    [],
  );

  const handleSwipeReply = useCallback((msg: ChatMessage) => {
    setEditingMessage(null);
    setReplyTo(msg);
    window.setTimeout(() => composerRef.current?.focus(), 40);
  }, []);

  if (!me) return null;

  async function favoriteSticker(message: ChatMessage) {
    try {
      await store.favoriteStickerFromMessage(message.id);
      closeMessageMenu();
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't update your sticker favourites."));
    }
  }

  async function forwardToFriend(receiverId: string) {
    if (!forwardMessage) return;
    try {
      if (store.forwardDmToTarget) {
        await store.forwardDmToTarget(forwardMessage.id, { userId: receiverId });
      } else {
        await store.forwardMessage(forwardMessage.id, receiverId);
      }
      closeForwardDialog();
      closeMessageMenu();
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't forward the message. Please try again."));
    }
  }

  async function forwardToGroup(groupId: string) {
    if (!forwardMessage || !store.forwardDmToTarget) return;
    try {
      await store.forwardDmToTarget(forwardMessage.id, { groupId });
      closeForwardDialog();
      closeMessageMenu();
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't forward the message to that group."));
    }
  }

  return (
    <section
      className={`chat ${chatClosing ? "closing" : ""} ${
        showMobileWallpaper ? "has-wallpaper" : ""
      }`}
    >
      {showMobileWallpaper && activeWallpaperUrl ? (
        <div className="chat-wallpaper-layer" aria-hidden="true">
          <AnimatedMediaImg src={activeWallpaperUrl} />
        </div>
      ) : null}
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={closeChat} aria-label="Back">
          <ArrowLeftIcon size={19} />
        </button>
        <Avatar
          user={friend}
          size={44}
          status={isSelfChat ? "online" : (friendActivity?.status ?? "offline")}
          onClick={() => onOpenProfile(friend)}
        />
        <button className="chat-title" onClick={() => onOpenProfile(friend)}>
          <strong>
            <IosEmojiText text={isSelfChat ? `${friend.displayName} (You)` : friend.displayName} />
          </strong>
          <span className="muted small chat-presence">
            <span className="chat-presence-desktop-extra">@{friend.username} · </span>
            <IosEmojiText text={friendStatusLabel} />
            {!isSelfChat && peerE2EE ? (
              peerE2EE.verifiedKeyId === peerE2EE.bundle.keyId ? (
                <span className="chat-presence-desktop-extra">
                  {" · "}
                  <ShieldCheckIcon size={12} /> Encrypted &amp; Verified
                </span>
              ) : (
                <span className="chat-presence-desktop-extra">
                  {" · "}
                  <LockClosedIcon size={12} /> Encrypted
                </span>
              )
            ) : null}
          </span>
        </button>
        <div className="chat-header-actions" aria-label="Chat actions">
          <button
            type="button"
            className={`icon-btn chat-header-search-btn ${searchOpen ? "menu-open" : ""}`}
            title="Search in chat"
            aria-label="Search in chat"
            onClick={() => {
              setSearchOpen((open) => {
                if (open) {
                  setSearchQuery("");
                  setSearchMatchIdx(0);
                }
                return !open;
              });
            }}
          >
            <SearchIcon size={18} />
          </button>
          {!isSelfChat && (
            <>
              <button
                type="button"
                className="icon-btn chat-call-btn"
                title={`Voice call ${friend.displayName}`}
                aria-label={`Voice call ${friend.displayName}`}
                disabled={isFriendBlocked}
                onClick={() => void startCall(friend, "voice")}
              >
                <Phone size={18} />
              </button>
              <button
                type="button"
                className="icon-btn chat-call-btn"
                title={`Video call ${friend.displayName}`}
                aria-label={`Video call ${friend.displayName}`}
                disabled={isFriendBlocked}
                onClick={() => void startCall(friend, "video")}
              >
                <Video size={18} />
              </button>
            </>
          )}
          <button
            type="button"
            className={`icon-btn chat-more-btn ${headerMoreMenu ? "menu-open" : ""}`}
            title="More options"
            aria-label="More options"
            aria-expanded={Boolean(headerMoreMenu)}
            onClick={(event) => {
              if (headerMoreMenu) {
                setHeaderMoreMenu((cur) => (cur ? { ...cur, closing: true } : null));
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              setHeaderMoreMenu({ x: rect.right - 220, y: rect.bottom + 8 });
            }}
          >
            <MoreVerticalIcon size={18} />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="chat-search-bar" role="search">
          <SearchIcon size={16} />
          <input
            type="search"
            value={searchQuery}
            autoFocus
            placeholder={`Search in chat with ${friend.displayName}…`}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchMatchIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchMatchIds.length > 0) {
                e.preventDefault();
                setSearchMatchIdx((cur) =>
                  e.shiftKey
                    ? (cur - 1 + searchMatchIds.length) % searchMatchIds.length
                    : (cur + 1) % searchMatchIds.length,
                );
              } else if (e.key === "Escape") {
                setSearchOpen(false);
                setSearchQuery("");
              }
            }}
          />
          {searchQuery.trim() && (
            <span className="chat-search-counter">
              {searchMatchIds.length === 0
                ? "0 matches"
                : `${safeSearchMatchIdx + 1} / ${searchMatchIds.length}`}
            </span>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous match"
            disabled={searchMatchIds.length === 0}
            onClick={() =>
              setSearchMatchIdx(
                (cur) => (cur - 1 + searchMatchIds.length) % searchMatchIds.length,
              )
            }
          >
            <ChevronUpIcon size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next match"
            disabled={searchMatchIds.length === 0}
            onClick={() =>
              setSearchMatchIdx((cur) => (cur + 1) % searchMatchIds.length)
            }
          >
            <ChevronDownIcon size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close search"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      {pinnedMessages.length > 0 && (
        <div className="chat-pinned-banner" role="region" aria-label="Pinned message">
          <PinIcon size={15} filled />
          <button
            type="button"
            className="chat-pinned-banner-jump"
            onClick={() => {
              const latestPin = pinnedMessages[0];
              if (!latestPin) return;
              document
                .getElementById(`message-${latestPin.messageId}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            <strong>
              Pinned message
              {pinnedMessages.length > 1 ? ` (${pinnedMessages.length})` : ""}
            </strong>
            <span>{pinnedMessages[0].previewText}</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Unpin message"
            aria-label="Unpin message"
            onClick={() => {
              const latestPin = pinnedMessages[0];
              if (!latestPin) return;
              togglePinnedMessage({
                conversationKey: `dm:${friend.id}`,
                messageId: latestPin.messageId,
                senderName: latestPin.senderName,
                previewText: latestPin.previewText,
              });
            }}
          >
            <CloseIcon size={15} />
          </button>
        </div>
      )}

      {showUnsendWarning && (
        <div className="unsend-warning-banner" role="status">
          <span>
            You unsent a message. In the meantime, they may have already seen it,
            screenshotted it, or reported it.
          </span>
          <button
            type="button"
            className="unsend-warning-dismiss"
            aria-label="Dismiss unsend notice"
            onClick={() => setShowUnsendWarning(false)}
          >
            <CloseIcon size={15} />
          </button>
        </div>
      )}

      {isFriendBlocked && (
        <div className="blocked-chat-notice" role="status">
          You blocked @{friend.username}. Unblock them from the chat list to send messages.
        </div>
      )}

      <ChatHistory
        messages={displayedMessages}
        friend={friend}
        me={me}
        messagesRef={messagesRef}
        initialScrollAllowedRef={initialScrollAllowedRef}
        messagesReady={conversationReady}
        hasMoreOlder={Boolean(store.hasMoreOlderMessages)}
        loadingOlder={Boolean(store.loadingOlderMessages)}
        onLoadOlder={store.loadOlderMessages}
        shownTranscriptIds={shownTranscriptIds}
        onToggleTranscript={handleToggleTranscript}
        onOpenProfile={onOpenProfile}
        onOpenMessageMenu={openMessageMenu}
        onOpenMessageMenuAt={openMessageMenuAt}
        onOpenImage={openImagePreview}
        activeSearchMatchId={activeSearchMatchId}
        highlightQuery={searchOpen ? searchQuery : undefined}
        onReactToMessage={reactToMessage}
        onOpenReactionPicker={handleOpenReactionPicker}
        onSwipeReply={handleSwipeReply}
      />

      {error && <div className="error-box chat-error">{error}</div>}
      {friendActivity?.isTyping && (
        <div className="chat-typing-status" role="status">
          {friend.displayName || friend.username} is typing…
        </div>
      )}

      {files.length > 0 && (
        <div className="attach-preview-list">
          {files.map((item, idx) => (
            <span className="attach-preview-chip" key={`${item.name}-${item.size}-${idx}`}>
              <PaperclipIcon size={13} />
              <span className="attach-preview-chip-name">{item.name}</span>
              <SpoilerToggle
                active={spoilerFiles.has(item)}
                onToggle={() =>
                  setSpoilerFiles((current) => {
                    const next = new Set(current);
                    if (next.has(item)) next.delete(item);
                    else next.add(item);
                    return next;
                  })
                }
                name={item.name}
              />
              <button
                type="button"
                className="attach-preview-chip-remove"
                aria-label={`Remove ${item.name}`}
                onClick={() =>
                  setFiles((cur) => cur.filter((_, fileIdx) => fileIdx !== idx))
                }
              >
                <CloseIcon size={12} />
              </button>
            </span>
          ))}
          {files.length > 1 && (
            <button type="button" className="mini-btn" onClick={() => setFiles([])}>
              Clear all ({files.length})
            </button>
          )}
        </div>
      )}

      {replyTo && (
        <div className="reply-composer-preview">
          <div>
            <strong>Replying to {replyTo.senderId === me.id ? "yourself" : friend.displayName}</strong>
            <span>
              {replyTo.unsentAt
                ? "This message was unsent"
                : isViewOnceBody(replyTo.body)
                  ? "View once"
                  : formatPreviewMessageText(replyTo.body) || replyTo.attachmentName || "Attachment"}
            </span>
          </div>
          <button type="button" className="mini-btn" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>
            <CloseIcon size={13} />
          </button>
        </div>
      )}
      {editingMessage && (
        <div className="reply-composer-preview">
          <div>
            <strong>Editing your message</strong>
            <span>{editingMessage.body}</span>
          </div>
          <button type="button" className="mini-btn" aria-label="Cancel editing" onClick={cancelEditingMessage}>
            <CloseIcon size={13} />
          </button>
        </div>
      )}

      {recordingVoiceNote ? (
        <div className="composer voice-composer-active">
          <VoiceNoteRecorder
            onCancel={() => setRecordingVoiceNote(false)}
            onSendVoiceNote={(voiceFile) => sendVoiceNoteFile(voiceFile)}
            onError={(msg) => setError(msg)}
          />
        </div>
      ) : (
        <DirectChatComposer
          key={`${friend.id}:${editingMessage?.id ?? "new"}:${composerSeed.nonce}`}
          friend={friend}
          friendStatus={friendActivity?.status}
          initialDraft={editingMessage ? editingMessage.body : composerSeed.text}
          hasFile={files.length > 0}
          viewOnceActive={viewOnceActive}
          onToggleViewOnce={() => {
            if (typeof window !== "undefined" && window.innerWidth <= 820) {
              const active = document.activeElement as HTMLElement | null;
              if (active && typeof active.blur === "function") active.blur();
            }
            setViewOnceActive((v) => !v);
          }}
          isFriendBlocked={isFriendBlocked}
          isEditing={Boolean(editingMessage)}
          composerRef={composerRef}
          fileInputRef={fileInput}
          onAddFiles={handleAddFiles}
          onStartVoiceNote={handleStartVoiceNote}
          onMobileActivate={handleMobileComposerActivate}
          onStickerSent={scrollToBottom}
          onTypingSignal={handleTypingSignal}
          onSubmitDraft={(body) => void handleSubmitDraft(body)}
        />
      )}

      {messageMenu && (
        <ContextMenu
          x={messageMenu.x}
          y={messageMenu.y}
          label="Message actions"
          className={`message-context-menu ${messageMenuClosing ? "closing" : ""}`}
          onClose={closeMessageMenu}
        >
          <button type="button" role="menuitem" onClick={() => replyToMessage(messageMenu.message)}>
            <span>
              <ReplyIcon size={15} />
            </span>{" "}
            Reply
          </button>
          {!messageMenu.message.unsentAt && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const msg = messageMenu.message;
                togglePinnedMessage({
                  conversationKey: `dm:${friend.id}`,
                  messageId: msg.id,
                  senderName: msg.senderId === me.id ? "You" : friend.displayName,
                  previewText:
                    formatPreviewMessageText(msg.body) ||
                    msg.attachmentName ||
                    "Attachment",
                });
                closeMessageMenu();
              }}
            >
              <span>
                <PinIcon
                  size={15}
                  filled={isMessagePinned(`dm:${friend.id}`, messageMenu.message.id)}
                />
              </span>{" "}
              {isMessagePinned(`dm:${friend.id}`, messageMenu.message.id)
                ? "Unpin message"
                : "Pin message"}
            </button>
          )}
          {!messageMenu.message.unsentAt &&
            messageMenu.message.senderId === me.id && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMessageMenu();
                  setBubbleStyleOpen(true);
                }}
              >
                <span>
                  <BubblePaletteIcon size={15} />
                </span>{" "}
                Bubble style
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
                <span>
                  <FileTextIcon size={15} />
                </span>{" "}
                {shownTranscriptIds[messageMenu.message.id]
                  ? "Hide transcribe"
                  : "Transcribe"}
              </button>
            )}
          {!messageMenu.message.unsentAt && (
            <>
              {messageMenu.canEdit && !isViewOnceBody(messageMenu.message.body) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => startEditingMessage(messageMenu.message)}
                >
                  <span>
                    <EditIcon size={15} />
                  </span>{" "}
                  Edit message
                </button>
              )}
              {!isViewOnceBody(messageMenu.message.body) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (forwardCloseTimerRef.current !== null) {
                      window.clearTimeout(forwardCloseTimerRef.current);
                      forwardCloseTimerRef.current = null;
                    }
                    setForwardClosing(false);
                    setForwardMessage(messageMenu.message);
                    closeMessageMenu();
                  }}
                >
                  <span>
                    <ForwardIcon size={15} />
                  </span>{" "}
                  Forward
                </button>
              )}
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
                <span>
                  <SmilePlusIcon size={15} />
                </span>{" "}
                Reaction
              </button>
            </>
          )}
          {!isViewOnceBody(messageMenu.message.body) && (
            <button type="button" role="menuitem" onClick={() => void copyMessage(messageMenu.message)}>
              <span>
                <CopyIcon size={15} />
              </span>{" "}
              Copy text
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => void deleteForMe(messageMenu.message)}>
            <span>
              <TrashIcon size={15} />
            </span>{" "}
            Delete for me
          </button>
          {(messageMenu.message.stickerKey ||
            messageMenu.message.attachmentType?.startsWith("image/")) && (
            <button
              type="button"
              role="menuitem"
              onClick={() => void favoriteSticker(messageMenu.message)}
            >
              <span>
                <StarIcon size={15} filled={!messageMenu.message.isStickerFavorite} />
              </span>
              {messageMenu.message.attachmentType?.startsWith("image/") &&
              !messageMenu.message.stickerKey
                ? "Make this image a sticker..."
                : messageMenu.message.isStickerFavorite
                  ? "Remove from favourites"
                  : "Add to favourites"}
            </button>
          )}
          {messageMenu.message.attachmentType?.startsWith("image/") && (
            <>
              <button type="button" role="menuitem" onClick={() => void copyImage(messageMenu.message)}>
                <span>
                  <ImageIcon size={15} />
                </span>{" "}
                Copy image
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void copyImageAddress(messageMenu.message)}
              >
                <span>
                  <LinkIcon size={15} />
                </span>{" "}
                Copy image address
              </button>
            </>
          )}
          {messageMenu.canUnsend && (
            <button
              type="button"
              role="menuitem"
              className="destructive-menu-item"
              onClick={() => void unsend(messageMenu.message)}
            >
              <span>
                <UndoIcon size={15} />
              </span>{" "}
              Unsend
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setInspectingMessage(messageMenu.message);
              closeMessageMenu();
            }}
          >
            <span>
              <LockClosedIcon size={15} />
            </span>{" "}
            Encryption details
          </button>
        </ContextMenu>
      )}

      {forwardMessage && (
        <div
          className={`forward-backdrop ${forwardClosing ? "closing" : ""}`}
          onClick={closeForwardDialog}
        >
          <section
            className="forward-dialog"
            aria-label="Forward message"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h3>Forward message</h3>
                <p>Choose a friend or group to send this to.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close forward dialog"
                onClick={closeForwardDialog}
              >
                <CloseIcon size={17} />
              </button>
            </header>
            <div className="forward-friends">
              {store.forwardDmToTarget &&
                store.groups.map((grp) => (
                  <button
                    type="button"
                    key={`grp-${grp.id}`}
                    className="forward-friend"
                    onClick={() => void forwardToGroup(grp.id)}
                  >
                    {grp.avatarUrl ? (
                      <AnimatedMediaImg
                        src={grp.avatarUrl}
                        className="group-avatar"
                        style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        className="group-avatar group-avatar-fallback"
                        style={{ width: 38, height: 38 }}
                      >
                        <UsersIcon size={18} />
                      </div>
                    )}
                    <span>{grp.name}</span>
                    <span className="muted">Group · {grp.memberCount} members</span>
                  </button>
                ))}
              {store.friends.map((target) => (
                <button
                  type="button"
                  key={target.id}
                  className="forward-friend"
                  onClick={() => void forwardToFriend(target.id)}
                >
                  <Avatar user={target} size={38} />
                  <span>{target.displayName}</span>
                  <span className="muted">@{target.username}</span>
                </button>
              ))}
              {store.friends.length === 0 && store.groups.length === 0 && (
                <p className="muted center">You do not have any chats to forward to yet.</p>
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
            displayedMessages.find((m) => m.id === reactionTarget.message.id)?.reactions ??
            reactionTarget.message.reactions ??
            []
          )
            .filter((r) => r.userId === me.id)
            .map((r) => r.emoji)}
          onSelect={(emoji) => void reactToMessage(reactionTarget.message, emoji)}
          onClose={() => setReactionTarget(null)}
        />
      )}
      {bubbleStyleOpen && (
        <BubbleStyleModal onClose={() => setBubbleStyleOpen(false)} />
      )}
      {wallpaperModalOpen && (
        <WallpaperModal
          currentWallpaperUrl={activeWallpaperUrl}
          onApply={async (choice: WallpaperChoice) => {
            const scopeKey = `dm:${friend.id}`;
            if (choice.kind === "none") {
              await store.sendMessage(
                friend.id,
                serializeWallpaperSignal({ v: 1, kind: "none", actorName: me.displayName }),
              );
              saveCachedWallpaper(scopeKey, null);
            } else if (choice.kind === "preset" && choice.url) {
              await store.sendMessage(
                friend.id,
                serializeWallpaperSignal({
                  v: 1,
                  kind: "preset",
                  presetId: choice.presetId,
                  url: choice.url,
                  actorName: me.displayName,
                }),
              );
              saveCachedWallpaper(scopeKey, choice.url);
            } else if (choice.kind === "custom" && choice.file) {
              await store.sendMessage(
                friend.id,
                serializeWallpaperSignal({ v: 1, kind: "custom", actorName: me.displayName }),
                choice.file,
              );
            }
          }}
          onClose={() => setWallpaperModalOpen(false)}
        />
      )}
      {headerMoreMenu && (
        <ContextMenu
          x={headerMoreMenu.x}
          y={headerMoreMenu.y}
          variant="dropdown"
          externalClosing={Boolean(headerMoreMenu.closing)}
          label={`Options for ${friend.displayName}`}
          className="message-context-menu conversation-context-menu"
          onClose={() => setHeaderMoreMenu(null)}
        >
          {({ closeWithAnimation }) => (
            <>
              <button
                type="button"
                role="menuitem"
                className="mobile-only-menu-item"
                onClick={() =>
                  closeWithAnimation(() => {
                    setSearchOpen((open) => {
                      if (open) {
                        setSearchQuery("");
                        setSearchMatchIdx(0);
                      }
                      return !open;
                    });
                  })
                }
              >
                <span>
                  <SearchIcon size={15} />
                </span>{" "}
                {searchOpen ? "Close search" : "Search in chat"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => closeWithAnimation(() => onOpenProfile(friend))}
              >
                <span>
                  <UserIcon size={15} />
                </span>{" "}
                View profile
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => closeWithAnimation(() => setBubbleStyleOpen(true))}
              >
                <span>
                  <BubblePaletteIcon size={15} />
                </span>{" "}
                Bubble style
              </button>
              {isMobileWallpaper && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => closeWithAnimation(() => setWallpaperModalOpen(true))}
                >
                  <span>
                    <ImageIcon size={15} />
                  </span>{" "}
                  Chat wallpaper
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const curMuted =
                    store.previews.find((p) => p.friendId === friend.id)?.isMuted ?? false;
                  closeWithAnimation(() => {
                    void store.setConversationMuted(friend.id, !curMuted);
                  });
                }}
              >
                <span>
                  {store.previews.find((p) => p.friendId === friend.id)?.isMuted ? (
                    <BellIcon size={15} />
                  ) : (
                    <BellOffIcon size={15} />
                  )}
                </span>
                {store.previews.find((p) => p.friendId === friend.id)?.isMuted
                  ? "Unmute chat"
                  : "Mute chat"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="destructive-menu-item"
                onClick={() =>
                  closeWithAnimation(() => {
                    if (
                      window.confirm(
                        `Unfriend ${friend.displayName} (@${friend.username})? You will need to send a friend request again to chat.`,
                      )
                    ) {
                      void store.removeFriend(friend.id);
                    }
                  })
                }
              >
                <span>
                  <UserMinusIcon size={15} />
                </span>{" "}
                Unfriend
              </button>
              <button
                type="button"
                role="menuitem"
                className={isFriendBlocked ? "" : "destructive-menu-item"}
                onClick={() =>
                  closeWithAnimation(() => {
                    void store.setUserBlocked(friend.id, !isFriendBlocked);
                  })
                }
              >
                <span>{isFriendBlocked ? <UnlockIcon size={15} /> : <BanIcon size={15} />}</span>
                {isFriendBlocked ? "Unblock" : "Block"}
              </button>
            </>
          )}
        </ContextMenu>
      )}
      {imagePreview && (
        <div
          className={`media-lightbox ${imageClosing ? "closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
          onClick={closeImagePreview}
        >
          <button
            type="button"
            className="media-lightbox-close"
            aria-label="Close image viewer"
            onClick={closeImagePreview}
          >
            <CloseIcon size={20} />
          </button>
          <div className="media-lightbox-stage">
            <img
              ref={imageElementRef}
              src={imagePreview}
              alt="Full-size attachment"
              style={{ transform: "translate3d(0, 0, 0) scale(1)" }}
              onClick={(event) => event.stopPropagation()}
              onTouchStart={startImageGesture}
              onTouchMove={moveImageGesture}
              onTouchEnd={endImageGesture}
              onTouchCancel={endImageGesture}
              onWheel={(event) => {
                event.preventDefault();
                const { scale, x, y } = imageTransformRef.current;
                applyImageTransform(
                  Math.min(4, Math.max(1, scale + (event.deltaY < 0 ? 0.2 : -0.2))),
                  x,
                  y,
                );
              }}
            />
          </div>
          <span className="media-lightbox-hint">
            Pinch to zoom · Drag to move · Click outside or press Esc to close
          </span>
        </div>
      )}
      {inspectingMessage && (
        <MessageEncryptionModal
          proof={
            inspectingMessage.e2ee ?? {
              encrypted: false,
              decrypted: true,
              signatureVerified: false,
              algorithm: "Legacy Plaintext (sent before v2.5 E2EE)",
              channel: "plain",
              rawWireBody: inspectingMessage.body,
            }
          }
          onClose={() => setInspectingMessage(null)}
        />
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
