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
import { playMessageSound } from "../lib/alerts";
import { isChatActivelyVisibleToUser } from "../lib/nativeBridge";
import { useChatAutoScrollAndKeyboard } from "../lib/useChatAutoScrollAndKeyboard";
import {
  formatPreviewMessageText,
  isHiddenCallSignal,
  parseCallInvite,
  useCall,
} from "../lib/calling";
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
import { CallMessageCard } from "./CallMessageCard";
import { ContextMenu } from "./ContextMenu";
import { ForwardedMessageCard } from "./ForwardedMessageCard";
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
  PlusIcon,
  ReplyIcon,
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
import { VoiceNoteRecorder } from "./VoiceNoteRecorder";
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";
import type { ChatMessage, JaUser } from "../lib/types";
import { Avatar } from "./Avatar";

const UNSEND_WINDOW_MS = 60 * 60 * 1000;
const PENDING_MESSAGE_MATCH_WINDOW_MS = 30_000;
const EMPTY_MESSAGES: ChatMessage[] = [];

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
) {
  const conversationPendingMessages = pendingMessages.filter(
    (message) => message.receiverId === friendId,
  );
  const matchedPendingIds = new Set<string>();
  const confirmedMessages = activeMessages.map((message) => {
    const pendingIndex = conversationPendingMessages.findIndex(
      (pendingMessage) =>
        pendingMessage.senderId === message.senderId &&
        pendingMessage.receiverId === message.receiverId &&
        message.createdAt >= pendingMessage.createdAt - 1_000 &&
        message.createdAt <= pendingMessage.createdAt + PENDING_MESSAGE_MATCH_WINDOW_MS &&
        (message.unsentAt ||
          Boolean(message.editedAt) ||
          (message.body === pendingMessage.body &&
            message.attachmentName === pendingMessage.attachmentName)),
    );
    if (pendingIndex === -1) return message;

    const [pendingMessage] = conversationPendingMessages.splice(pendingIndex, 1);
    matchedPendingIds.add(pendingMessage.id);
    return { ...message, renderKey: pendingMessage.id };
  });
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
  shownTranscriptIds,
  onToggleTranscript,
  onOpenProfile,
  onOpenMessageMenu,
  onOpenMessageMenuAt,
  onOpenImage,
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
  shownTranscriptIds: Record<string, boolean>;
  onToggleTranscript: (messageId: string, show: boolean) => void;
  onOpenProfile: (user: JaUser) => void;
  onOpenMessageMenu: (event: MouseEvent, message: ChatMessage) => void;
  onOpenMessageMenuAt: (x: number, y: number, message: ChatMessage) => void;
  onOpenImage: (url: string) => void;
  onReactToMessage: (message: ChatMessage, emoji: string) => void;
  onOpenReactionPicker: (x: number, y: number, message: ChatMessage) => void;
  onSwipeReply: (message: ChatMessage) => void;
}) {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);

  function cancelBubbleTouchHold() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }

  function startBubbleTouchHold(
    event: React.TouchEvent<HTMLDivElement>,
    message: ChatMessage,
  ) {
    if (message.id.startsWith("pending-")) return;
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    longPressOriginRef.current = { x: touch.clientX, y: touch.clientY };
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    const { clientX, clientY } = touch;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      onOpenMessageMenuAt(clientX, clientY, message);
    }, 450);
  }

  function moveBubbleTouchHold(event: React.TouchEvent<HTMLDivElement>) {
    if (!longPressOriginRef.current || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dist = Math.hypot(
      touch.clientX - longPressOriginRef.current.x,
      touch.clientY - longPressOriginRef.current.y,
    );
    if (dist > 12) cancelBubbleTouchHold();
  }

  const [visibleCount, setVisibleCount] = useState(50);
  const [highlightedJumpId, setHighlightedJumpId] = useState<string | null>(null);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const capturedUnreadForFriendRef = useRef<string | null>(null);
  const prependAnchorRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const prevFriendIdRef = useRef(friend.id);
  if (prevFriendIdRef.current !== friend.id) {
    prevFriendIdRef.current = friend.id;
    prependAnchorRef.current = null;
    capturedUnreadForFriendRef.current = null;
    if (visibleCount !== 50) {
      setVisibleCount(50);
    }
    if (firstUnreadMessageId !== null) {
      setFirstUnreadMessageId(null);
    }
  }

  useEffect(() => {
    if (!messagesReady || capturedUnreadForFriendRef.current === friend.id) return;
    capturedUnreadForFriendRef.current = friend.id;
    const firstUnread = messages.find(
      (m) =>
        m.senderId === friend.id &&
        m.receiverId === me.id &&
        !m.unsentAt &&
        m.deliveryStatus !== "read" &&
        !isHiddenCallSignal(m.body),
    );
    setFirstUnreadMessageId(firstUnread?.id ?? null);
  }, [friend.id, me.id, messages, messagesReady]);

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

  const handleMessagesScroll = () => {
    const el = messagesRef.current;
    if (!el) return;
    if (el.scrollTop < 260 && visibleCount < messages.length && !prependAnchorRef.current) {
      prependAnchorRef.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop };
      setVisibleCount((cur) => Math.min(messages.length, cur + 60));
    }
  };

  return (
    <div
      className="messages"
      ref={messagesRef}
      onScroll={handleMessagesScroll}
      onWheel={() => {
        initialScrollAllowedRef.current = false;
      }}
      onTouchStart={() => {
        initialScrollAllowedRef.current = false;
      }}
    >
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
          <p className="muted small">Send the first message below — photos &amp; files work too!</p>
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
        const callInvite = parseCallInvite(message.body);
        const isAudioNote =
          !callInvite && isVoiceNoteOrAudio(message.attachmentType, message.attachmentName);
        const isImage = !callInvite && message.attachmentType?.startsWith("image/");
        const isVideo =
          !callInvite &&
          !isAudioNote &&
          (message.attachmentType?.startsWith("video/") ||
            /\.(mp4|m4v|mov|webm|ogg)$/i.test(message.attachmentName ?? ""));
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
                highlightedJumpId === message.id ? "jump-highlight-pulse" : ""
              }`}
              id={`message-${message.id}`}
            >
              {!mine && (
                <Avatar user={friend} size={30} ringWidth={2} onClick={() => onOpenProfile(friend)} />
              )}
              <div className="msg-col">
                <SwipeToReply
                  disabled={Boolean(message.unsentAt) || message.id.startsWith("pending-")}
                  onReply={() => onSwipeReply(message)}
                >
                  <DecoratedMessageBubble
                    styleId={callInvite ? "default" : (message.bubbleStyle ?? "default")}
                    mine={mine}
                    unsent={Boolean(message.unsentAt)}
                    className={mine ? "mine" : "theirs"}
                    onContextMenu={
                      message.id.startsWith("pending-")
                        ? undefined
                        : (event) => onOpenMessageMenu(event, message)
                    }
                    onTouchStart={(event) => startBubbleTouchHold(event, message)}
                    onTouchMove={moveBubbleTouchHold}
                    onTouchEnd={cancelBubbleTouchHold}
                    onTouchCancel={cancelBubbleTouchHold}
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
                        ) : isVideo ? (
                          <div className="video-attachment">
                            <video
                              className="msg-video"
                              controls
                              playsInline
                              preload="metadata"
                              src={message.attachmentUrl}
                            >
                              Your browser does not support video playback.
                            </video>
                            <label className="video-speed-control">
                              <span>Speed</span>
                              <select
                                defaultValue="1"
                                aria-label="Video playback speed"
                                onChange={(event) => {
                                  const video = event.currentTarget
                                    .closest(".video-attachment")
                                    ?.querySelector("video");
                                  if (video) video.playbackRate = Number(event.target.value);
                                }}
                              >
                                <option value="0.5">0.5×</option>
                                <option value="0.75">0.75×</option>
                                <option value="1">1×</option>
                                <option value="1.25">1.25×</option>
                                <option value="1.5">1.5×</option>
                                <option value="2">2×</option>
                              </select>
                            </label>
                          </div>
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
                      {message.body && (
                        <>
                          <MessageMarkdown text={message.body} mine={mine} />
                          <MessageLinkEmbeds text={message.body} />
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
                            {emoji} <span>{users.length}</span>
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
                {mine && !message.unsentAt && message.deliveryStatus && (
                  <span className="message-delivery-status">
                    {message.deliveryStatus === "delivered"
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
  friendId,
  friendUsername,
  initialDraft,
  hasFile,
  isFriendBlocked,
  isEditing,
  composerRef,
  fileInputRef,
  onSelectFile,
  onStartVoiceNote,
  onMobileActivate,
  onStickerSent,
  onTypingSignal,
  onSubmitDraft,
}: {
  friendId: string;
  friendUsername: string;
  initialDraft: string;
  hasFile: boolean;
  isFriendBlocked: boolean;
  isEditing: boolean;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onSelectFile: (file: File | null) => void;
  onStartVoiceNote: () => void;
  onMobileActivate: () => void;
  onStickerSent: () => void;
  onTypingSignal: (hasText: boolean) => void;
  onSubmitDraft: (body: string) => void;
}) {
  const draftKey = `dm:${friendId}`;
  const [draft, setDraft] = useState(() => (isEditing ? initialDraft : initialDraft || getDraft(draftKey)));
  const prevLenRef = useRef(draft.length);

  useLayoutEffect(() => {
    const startText = isEditing ? initialDraft : initialDraft || getDraft(draftKey);
    syncComposerTextareaHeight(composerRef.current, 0, startText);
    prevLenRef.current = startText.length;
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

  function handleChange(next: string) {
    const prevLen = prevLenRef.current;
    prevLenRef.current = next.length;
    setDraft(next);
    if (!isEditing) {
      saveStoredDraft(draftKey, next);
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
    const keepFocus = document.activeElement === composerRef.current;
    prevLenRef.current = 0;
    setDraft("");
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
    <form className="composer" onSubmit={handleSubmit}>
      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={(e) => {
          onSelectFile(e.target.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        className="icon-btn attach-btn"
        title="Attach a photo or file"
        aria-label="Attach a photo or file"
        disabled={isFriendBlocked || isEditing}
        onClick={() => fileInputRef.current?.click()}
      >
        <PaperclipIcon size={18} />
      </button>
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
      <textarea
        ref={composerRef}
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={onMobileActivate}
        onClick={onMobileActivate}
        placeholder={
          isFriendBlocked
            ? "Unblock to message"
            : isEditing
              ? "Edit message…"
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
            onSelectFile(pasted);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
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
  const [file, setFile] = useState<File | null>(null);
  const [recordingVoiceNote, setRecordingVoiceNote] = useState(false);
  const [shownTranscriptIds, setShownTranscriptIds] = useState<Record<string, boolean>>({});
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
  const { messages: displayedMessages, matchedPendingIds } = useMemo(
    () => getConversationMessages(pendingMessages, conversationMessages, friend.id),
    [conversationMessages, friend.id, pendingMessages],
  );
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
  const friendStatusLabel =
    friendActivity?.status === "dnd"
      ? "Do Not Disturb"
      : friendActivity?.status ?? "offline";
  const conversationReady =
    activeMessagesReady && store.activeChatId === friend.id;

  const openImagePreview = useCallback((url: string) => {
    if (imageCloseTimerRef.current !== null) {
      window.clearTimeout(imageCloseTimerRef.current);
      imageCloseTimerRef.current = null;
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
    }, 160);
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

  useEffect(() => {
    if (!unreadIncomingSignature || !store.activeMessagesReady || chatClosing || store.activeChatId !== friend.id) {
      return;
    }
    let cancelled = false;
    const maybeMarkRead = async () => {
      if (cancelled || chatClosing || store.activeChatId !== friend.id) return;
      const activelyViewing = await isChatActivelyVisibleToUser();
      if (!cancelled && activelyViewing) {
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
  }, [chatClosing, friend.id, markMessagesRead, store.activeChatId, store.activeMessagesReady, unreadIncomingSignature]);

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

  const handlePastedChatFile = useCallback((pasted: File) => {
    setFile(pasted);
    window.setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 0);
  }, []);

  useChatImagePaste(
    handlePastedChatFile,
    !isFriendBlocked && !editingMessage && !recordingVoiceNote,
  );

  const handleSubmitDraft = useCallback(
    async (submittedBody: string) => {
      if (editingMessage) {
        if (!submittedBody || isFriendBlocked) return;
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
      if ((!submittedBody && !file) || isFriendBlocked) return;
      const sentBody = submittedBody;
      const sentFile = file;
      const sentReply = replyTo;
      const sentAt = Math.max(Date.now(), lastPendingMessageAtRef.current + 1);
      lastPendingMessageAtRef.current = sentAt;
      const pendingId = `pending-${sentAt}`;
      const attachmentUrl = sentFile ? URL.createObjectURL(sentFile) : undefined;
      if (attachmentUrl) pendingAttachmentUrlsRef.current.set(pendingId, attachmentUrl);
      setPendingMessages((current) => [
        ...current.slice(-299),
        {
          id: pendingId,
          senderId: me?.id ?? "",
          receiverId: friend.id,
          body: sentBody,
          bubbleStyle: getSavedOutgoingBubbleStyle(),
          attachmentUrl,
          attachmentName: sentFile?.name,
          attachmentType: sentFile?.type,
          createdAt: sentAt,
          deliveryStatus: "sent",
        },
      ]);
      window.requestAnimationFrame(scrollToBottom);
      setFile(null);
      setReplyTo(null);
      setError(null);
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      if (typingActive.current) {
        typingActive.current = false;
        publishTyping(false);
      }
      try {
        await sendMessage(friend.id, sentBody, sentFile ?? undefined, sentReply?.id);
        if (soundsEnabled) playMessageSound("sent");
        window.setTimeout(() => removePendingMessage(pendingId), 1500);
      } catch (err) {
        removePendingMessage(pendingId);
        if (sentBody) {
          setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: sentBody }));
        }
        if (sentFile) setFile((current) => current ?? sentFile);
        setError(friendlyError(err, "Couldn't send the message. Please try again."));
      }
    },
    [
      editMessage,
      editingMessage,
      file,
      friend.id,
      isFriendBlocked,
      me?.id,
      publishTyping,
      removePendingMessage,
      replyTo,
      scrollToBottom,
      sendMessage,
      soundsEnabled,
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
      window.setTimeout(() => removePendingMessage(pendingId), 1500);
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
    try {
      await store.deleteMessageForMe(message.id);
      closeMessageMenu();
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't delete the message. Please try again."));
    }
  }

  async function unsend(message: ChatMessage) {
    try {
      const shouldShowWarning = await store.unsendMessage(message.id);
      if (shouldShowWarning) setShowUnsendWarning(true);
      closeMessageMenu();
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't unsend the message. Please try again."));
    }
  }

  function startEditingMessage(message: ChatMessage) {
    setPendingMessages((current) =>
      current.filter((m) => m.receiverId !== friend.id),
    );
    setEditingMessage(message);
    setReplyTo(null);
    setFile(null);
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
          <img
            src={activeWallpaperUrl}
            alt=""
            referrerPolicy="no-referrer"
          />
        </div>
      ) : null}
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={closeChat} aria-label="Back">
          <ArrowLeftIcon size={19} />
        </button>
        <Avatar
          user={friend}
          size={44}
          status={friendActivity?.status ?? "offline"}
          onClick={() => onOpenProfile(friend)}
        />
        <button className="chat-title" onClick={() => onOpenProfile(friend)}>
          <strong>{friend.displayName}</strong>
          <span className="muted small chat-presence">
            @{friend.username} · {friendStatusLabel}
            {friendActivity?.customStatus ? ` · ${friendActivity.customStatus}` : ""}
            {peerE2EE ? (
              peerE2EE.verifiedKeyId === peerE2EE.bundle.keyId ? (
                <>
                  {" · "}
                  <ShieldCheckIcon size={12} /> Encrypted &amp; Verified
                </>
              ) : (
                <>
                  {" · "}
                  <LockClosedIcon size={12} /> Encrypted
                </>
              )
            ) : null}
          </span>
        </button>
        <div className="chat-header-actions" aria-label="Chat actions">
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
        shownTranscriptIds={shownTranscriptIds}
        onToggleTranscript={handleToggleTranscript}
        onOpenProfile={onOpenProfile}
        onOpenMessageMenu={openMessageMenu}
        onOpenMessageMenuAt={openMessageMenuAt}
        onOpenImage={openImagePreview}
        onReactToMessage={reactToMessage}
        onOpenReactionPicker={(x, y, message) => setReactionTarget({ x, y, message })}
        onSwipeReply={(msg) => {
          setEditingMessage(null);
          setReplyTo(msg);
          window.setTimeout(() => composerRef.current?.focus(), 40);
        }}
      />

      {error && <div className="error-box chat-error">{error}</div>}
      {friendActivity?.isTyping && (
        <div className="chat-typing-status" role="status">
          {friend.displayName || friend.username} is typing…
        </div>
      )}

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

      {replyTo && (
        <div className="reply-composer-preview">
          <div>
            <strong>Replying to {replyTo.senderId === me.id ? "yourself" : friend.displayName}</strong>
            <span>{replyTo.unsentAt ? "This message was unsent" : replyTo.body || replyTo.attachmentName || "Attachment"}</span>
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
          friendId={friend.id}
          friendUsername={friend.username}
          initialDraft={editingMessage ? editingMessage.body : composerSeed.text}
          hasFile={Boolean(file)}
          isFriendBlocked={isFriendBlocked}
          isEditing={Boolean(editingMessage)}
          composerRef={composerRef}
          fileInputRef={fileInput}
          onSelectFile={setFile}
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
                  ? "Hide transcription"
                  : "Show transcription"}
              </button>
            )}
          {!messageMenu.message.unsentAt && (
            <>
              {messageMenu.canEdit && (
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
          <button type="button" role="menuitem" onClick={() => void copyMessage(messageMenu.message)}>
            <span>
              <CopyIcon size={15} />
            </span>{" "}
            Copy text
          </button>
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
                      <img
                        src={grp.avatarUrl}
                        alt=""
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
    </section>
  );
}
