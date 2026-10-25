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
} from "react";
import { playMessageSound } from "../lib/alerts";
import { ContextMenu } from "./ContextMenu";
import { StickerPicker } from "./StickerPicker";
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";
import type { ActivityStatus, ChatMessage, JaUser } from "../lib/types";
import { Avatar } from "./Avatar";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const UNSEND_WINDOW_MS = 60 * 60 * 1000;
const PENDING_MESSAGE_MATCH_WINDOW_MS = 30_000;
const EMPTY_MESSAGES: ChatMessage[] = [];

interface MessageMenuState {
  x: number;
  y: number;
  message: ChatMessage;
  canUnsend: boolean;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtDay(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
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
        message.body === pendingMessage.body &&
        message.attachmentName === pendingMessage.attachmentName,
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
  isTyping,
  status,
  messagesRef,
  pinnedToBottomRef,
  onOpenProfile,
  onOpenMessageMenu,
  onOpenImage,
  onReactToMessage,
}: {
  messages: ChatMessage[];
  friend: JaUser;
  me: JaUser;
  isTyping: boolean;
  status: ActivityStatus;
  messagesRef: { current: HTMLDivElement | null };
  pinnedToBottomRef: { current: boolean };
  onOpenProfile: (user: JaUser) => void;
  onOpenMessageMenu: (event: MouseEvent, message: ChatMessage) => void;
  onOpenImage: (url: string) => void;
  onReactToMessage: (message: ChatMessage, emoji: string) => void;
}) {
  return (
    <div
      className="messages"
      ref={messagesRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        pinnedToBottomRef.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      }}
    >
      {messages.length === 0 && (
        <div className="empty-box center">
          <Avatar user={friend} size={72} onClick={() => onOpenProfile(friend)} />
          <p>
            You're now friends with <strong>{friend.displayName}</strong> 🎉
          </p>
          <p className="muted small">Send the first message below — photos &amp; files work too!</p>
        </div>
      )}
      {messages.map((message, index) => {
        const day = fmtDay(message.createdAt);
        const showDay =
          index === 0 || fmtDay(messages[index - 1].createdAt) !== day;
        const mine = message.senderId === me.id;
        const isImage = message.attachmentType?.startsWith("image/");
        const isVideo =
          message.attachmentType?.startsWith("video/") ||
          /\.(mp4|m4v|mov|webm|ogg)$/i.test(message.attachmentName ?? "");
        return (
          <div key={message.renderKey ?? message.id}>
            {showDay && <div className="day-divider">{day}</div>}
            <div
              className={`msg-row ${mine ? "mine" : "theirs"}`}
              id={`message-${message.id}`}
            >
              {!mine && (
                <Avatar user={friend} size={30} ringWidth={2} onClick={() => onOpenProfile(friend)} />
              )}
              <div className="msg-col">
                {message.forwardedFrom && (
                  <span className="message-meta forwarded-label">
                    ↗ Forwarded from {message.forwardedFrom}
                  </span>
                )}
                <div
                  className={`bubble ${mine ? "mine" : "theirs"} ${message.unsentAt ? "unsent" : ""}`}
                  onContextMenu={
                    message.id.startsWith("pending-")
                      ? undefined
                      : (event) => onOpenMessageMenu(event, message)
                  }
                >
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
                      <span>{message.replyTo.body || "📎 Attachment"}</span>
                    </button>
                  )}
                  {message.unsentAt ? (
                    <p className="unsent-copy">This message was unsent</p>
                  ) : (
                    <>
                      {message.attachmentUrl &&
                        (isImage ? (
                          <button
                            type="button"
                            className="image-message-button"
                            onClick={() => onOpenImage(message.attachmentUrl!)}
                            aria-label="Open image viewer"
                          >
                            <img
                              className="msg-image"
                              src={message.attachmentUrl}
                              alt={message.attachmentName ?? "attachment"}
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
                            📎 {message.attachmentName ?? "Attachment"}
                          </a>
                        ))}
                      {message.body && <p>{message.body}</p>}
                    </>
                  )}
                </div>
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
                  </div>
                )}
                <span className="msg-time">{fmtTime(message.createdAt)}</span>
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
      {isTyping && (
        <div className="msg-row theirs typing-row" aria-label={`${friend.displayName} is typing`}>
          <Avatar user={friend} size={30} ringWidth={2} status={status} />
          <div className="typing-bubble" aria-hidden="true">
            <span>.</span><span>.</span><span>.</span>
          </div>
        </div>
      )}
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
  const {
    me,
    activeMessages,
    friendActivities,
    sendMessage,
    markMessagesRead,
    setTyping,
    soundsEnabled,
    toggleMessageReaction,
  } = store;
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUnsendWarning, setShowUnsendWarning] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [messageMenuClosing, setMessageMenuClosing] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);
  const [forwardClosing, setForwardClosing] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [imageClosing, setImageClosing] = useState(false);
  const [chatClosing, setChatClosing] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const pinnedToBottomRef = useRef(true);
  const forceScrollToBottomRef = useRef(false);
  const previousChatIdRef = useRef(friend.id);
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
  const conversationMessages =
    store.activeChatId === friend.id ? activeMessages : EMPTY_MESSAGES;
  const incomingMessageCount = useMemo(
    () => conversationMessages.filter((message) => message.senderId === friend.id).length,
    [conversationMessages, friend.id],
  );
  const { messages: displayedMessages, matchedPendingIds } = useMemo(
    () => getConversationMessages(pendingMessages, conversationMessages, friend.id),
    [conversationMessages, friend.id, pendingMessages],
  );
  const lastMessage = displayedMessages.at(-1);
  const lastMessageKey = lastMessage?.renderKey ?? lastMessage?.id;
  const scrollToBottom = useCallback(() => {
    const container = messagesRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
    }
  }, []);
  const friendStatusLabel =
    friendActivity?.status === "dnd"
      ? "Do Not Disturb"
      : friendActivity?.status ?? "offline";

  const openImagePreview = useCallback((url: string) => {
    if (imageCloseTimerRef.current !== null) {
      window.clearTimeout(imageCloseTimerRef.current);
      imageCloseTimerRef.current = null;
    }
    setImageScale(1);
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
    if (previousChatIdRef.current !== friend.id) {
      previousChatIdRef.current = friend.id;
      pinnedToBottomRef.current = true;
    }
    if (!pinnedToBottomRef.current && !forceScrollToBottomRef.current) return;
    forceScrollToBottomRef.current = false;
    scrollToBottom();
  }, [lastMessageKey, friend.id, scrollToBottom]);

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
    if (incomingMessageCount === 0) return;
    void markMessagesRead(friend.id).catch((cause: unknown) => {
      setError(friendlyError(cause, "Couldn't update read status."));
    });
  }, [friend.id, incomingMessageCount, markMessagesRead]);

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

  async function onSend(e?: FormEvent) {
    e?.preventDefault();
    if ((!draft.trim() && !file) || isFriendBlocked) return;
    const sentBody = draft.trim();
    const sentFile = file;
    const sentReply = replyTo;
    const sentAt = Math.max(Date.now(), lastPendingMessageAtRef.current + 1);
    lastPendingMessageAtRef.current = sentAt;
    pinnedToBottomRef.current = true;
    forceScrollToBottomRef.current = true;
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
        attachmentUrl,
        attachmentName: sentFile?.name,
        attachmentType: sentFile?.type,
        createdAt: sentAt,
        deliveryStatus: "delivered",
      },
    ]);
    setDraft("");
    setFile(null);
    setReplyTo(null);
    setError(null);
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    typingActive.current = false;
    void setTyping(friend.id, false).catch((err: unknown) => {
      setError(friendlyError(err, "Couldn't update your typing status."));
    });
    try {
      await sendMessage(friend.id, sentBody, sentFile ?? undefined, sentReply?.id);
      if (soundsEnabled) playMessageSound("sent");
    } catch (err) {
      removePendingMessage(pendingId);
      setDraft((current) => current.trim() ? current : sentBody);
      if (sentFile) setFile((current) => current ?? sentFile);
      setError(friendlyError(err, "Couldn't send the message. Please try again."));
    }
  }

  function publishTyping(isTyping: boolean) {
    void setTyping(friend.id, isTyping).catch((err: unknown) => {
      setError(friendlyError(err, "Couldn't update your typing status."));
    });
  }

  function onDraftChange(value: string) {
    setDraft(value);
    if (!value.trim()) {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      typingActive.current = false;
      publishTyping(false);
      return;
    }

    const now = Date.now();
    if (!typingActive.current || now - lastTypingUpdate.current >= 2_000) {
      typingActive.current = true;
      lastTypingUpdate.current = now;
      publishTyping(true);
    }
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      typingActive.current = false;
      publishTyping(false);
    }, 2_500);
  }

  const openMessageMenu = useCallback((event: MouseEvent, message: ChatMessage) => {
    event.preventDefault();
    event.stopPropagation();
    if (messageMenuCloseTimerRef.current !== null) {
      window.clearTimeout(messageMenuCloseTimerRef.current);
      messageMenuCloseTimerRef.current = null;
    }
    setMessageMenuClosing(false);
    const eventTime =
      event.timeStamp > 1_000_000_000_000
        ? event.timeStamp
        : performance.timeOrigin + event.timeStamp;
    setMessageMenu({
      x: event.clientX,
      y: event.clientY,
      message,
      canUnsend:
        message.senderId === me?.id &&
        !message.unsentAt &&
        eventTime - message.createdAt < UNSEND_WINDOW_MS,
    });
    setReactionPickerOpen(false);
  }, [me?.id]);

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
          : message.body || message.attachmentName || message.attachmentUrl || "",
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
      if (!navigator.clipboard.write || typeof ClipboardItem === "undefined") {
        throw new Error("Copying images isn't supported by this browser.");
      }
      const response = await fetch(message.attachmentUrl);
      if (!response.ok) throw new Error("Couldn't load the image.");
      const image = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [image.type]: image })]);
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

  const reactToMessage = useCallback(async (message: ChatMessage, emoji: string) => {
    try {
      await toggleMessageReaction(message.id, emoji);
      closeMessageMenu();
      setReactionPickerOpen(false);
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
      await store.forwardMessage(forwardMessage.id, receiverId);
      closeForwardDialog();
      closeMessageMenu();
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't forward the message. Please try again."));
    }
  }

  return (
    <section className={`chat ${chatClosing ? "closing" : ""}`}>
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={closeChat} aria-label="Back">
          ←
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
          </span>
        </button>
        <div className="chat-header-actions" aria-label="Chat actions">
          <button
            type="button"
            className="icon-btn chat-action-placeholder"
            title="Voice call coming soon"
            aria-label="Voice call coming soon"
            disabled
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn chat-action-placeholder"
            title="Video call coming soon"
            aria-label="Video call coming soon"
            disabled
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="6" width="13" height="12" rx="2" />
              <path d="m16 10 5-3v10l-5-3" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn chat-action-placeholder"
            title="More chat options coming soon"
            aria-label="More chat options coming soon"
            disabled
          >
            ⋮
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
            ×
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
        isTyping={friendActivity?.isTyping ?? false}
        status={friendActivity?.status ?? "offline"}
        messagesRef={messagesRef}
        pinnedToBottomRef={pinnedToBottomRef}
        onOpenProfile={onOpenProfile}
        onOpenMessageMenu={openMessageMenu}
        onOpenImage={openImagePreview}
        onReactToMessage={reactToMessage}
      />

      {error && <div className="error-box chat-error">{error}</div>}

      {file && (
        <div className="attach-preview">
          📎 {file.name}
          <button className="mini-btn" onClick={() => setFile(null)}>
            ✕ Remove
          </button>
        </div>
      )}

      {replyTo && (
        <div className="reply-composer-preview">
          <div>
            <strong>Replying to {replyTo.senderId === me.id ? "yourself" : friend.displayName}</strong>
            <span>{replyTo.unsentAt ? "This message was unsent" : replyTo.body || replyTo.attachmentName || "Attachment"}</span>
          </div>
          <button type="button" className="mini-btn" onClick={() => setReplyTo(null)}>
            ✕
          </button>
        </div>
      )}

      <form className="composer" onSubmit={onSend}>
        <input
          ref={fileInput}
          type="file"
          hidden
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="icon-btn attach-btn"
          title="Attach a photo or file"
          disabled={isFriendBlocked}
          onClick={() => fileInput.current?.click()}
        >
          📎
        </button>
        <StickerPicker friendId={friend.id} disabled={isFriendBlocked} />
        <button
          type="button"
          className="icon-btn voice-note-placeholder"
          title="Voice notes coming soon"
          aria-label="Voice notes coming soon"
          disabled
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
          </svg>
        </button>
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={isFriendBlocked ? "Unblock to message" : "Message…"}
          aria-label={`Message @${friend.username}`}
          disabled={isFriendBlocked}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
        />
        <button
          className="send-btn"
          type="submit"
          disabled={isFriendBlocked || (!draft.trim() && !file)}
          onPointerDown={(event) => event.preventDefault()}
        >
          ➤
        </button>
      </form>

      {messageMenu && (
        <ContextMenu
          x={messageMenu.x}
          y={messageMenu.y}
          label="Message actions"
          className={`message-context-menu ${messageMenuClosing ? "closing" : ""}`}
          onClose={closeMessageMenu}
        >
          <button type="button" role="menuitem" onClick={() => replyToMessage(messageMenu.message)}>
            <span>↩️</span> Reply
          </button>
          {!messageMenu.message.unsentAt && (
            <>
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
                <span>↗️</span> Forward
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setReactionPickerOpen((open) => !open)}
                aria-expanded={reactionPickerOpen}
              >
                <span>✨</span> Reaction
              </button>
              {reactionPickerOpen && (
                <div className="context-reactions" aria-label="Choose reaction">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      aria-label={`React with ${emoji}`}
                      onClick={() => void reactToMessage(messageMenu.message, emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <button type="button" role="menuitem" onClick={() => void copyMessage(messageMenu.message)}>
            <span>📋</span> Copy text
          </button>
          <button type="button" role="menuitem" onClick={() => void deleteForMe(messageMenu.message)}>
            <span>🗑️</span> Delete for me
          </button>
          {(messageMenu.message.stickerKey ||
            messageMenu.message.attachmentType?.startsWith("image/")) && (
            <button
              type="button"
              role="menuitem"
              onClick={() => void favoriteSticker(messageMenu.message)}
            >
              <span>{messageMenu.message.isStickerFavorite ? "☆" : "⭐"}</span>
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
                <span>🖼️</span> Copy image
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void copyImageAddress(messageMenu.message)}
              >
                <span>🔗</span> Copy image address
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
              <span>↩️</span> Unsend
            </button>
          )}
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
                <p>Choose a friend to send this to.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close forward dialog"
                onClick={closeForwardDialog}
              >
                ✕
              </button>
            </header>
            <div className="forward-friends">
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
              {store.friends.length === 0 && (
                <p className="muted center">You do not have any friends to forward to yet.</p>
              )}
            </div>
          </section>
        </div>
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
            ×
          </button>
          <img
            src={imagePreview}
            alt="Full-size attachment"
            style={{ transform: `scale(${imageScale})` }}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => {
              event.preventDefault();
              setImageScale((scale) =>
                Math.min(4, Math.max(0.5, scale + (event.deltaY < 0 ? 0.15 : -0.15))),
              );
            }}
          />
          <span className="media-lightbox-hint">
            Scroll to zoom · Click outside or press Esc to close
          </span>
        </div>
      )}
    </section>
  );
}
