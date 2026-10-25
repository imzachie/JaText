import {
  memo,
  useCallback,
  useEffect,
  useMemo,
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
        return (
          <div key={message.id}>
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
                  onContextMenu={(event) => onOpenMessageMenu(event, message)}
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
                          <a href={message.attachmentUrl} target="_blank" rel="noreferrer">
                            <img
                              className="msg-image"
                              src={message.attachmentUrl}
                              alt={message.attachmentName ?? "attachment"}
                            />
                          </a>
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnsendWarning, setShowUnsendWarning] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const pinnedToBottomRef = useRef(true);
  const previousChatIdRef = useRef(friend.id);
  const typingTimer = useRef<number | null>(null);
  const typingActive = useRef(false);
  const lastTypingUpdate = useRef(0);
  const setTypingRef = useRef(setTyping);
  const friendActivity = friendActivities.find((activity) => activity.userId === friend.id);
  const isFriendBlocked = store.blockedUserIds.includes(friend.id);
  const lastMessageId = activeMessages.at(-1)?.id;
  const incomingMessageCount = useMemo(
    () => activeMessages.filter((message) => message.senderId === friend.id).length,
    [activeMessages, friend.id],
  );
  const friendStatusLabel =
    friendActivity?.status === "dnd"
      ? "Do Not Disturb"
      : friendActivity?.status ?? "offline";

  useEffect(() => {
    setTypingRef.current = setTyping;
  }, [setTyping]);

  useEffect(() => {
    if (previousChatIdRef.current !== friend.id) {
      previousChatIdRef.current = friend.id;
      pinnedToBottomRef.current = true;
    }
    if (!pinnedToBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const container = messagesRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [lastMessageId, friend.id]);

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
    if ((!draft.trim() && !file) || sending) return;
    setSending(true);
    setError(null);
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    typingActive.current = false;
    void setTyping(friend.id, false).catch((err: unknown) => {
      setError(friendlyError(err, "Couldn't update your typing status."));
    });
    try {
      await sendMessage(friend.id, draft, file ?? undefined, replyTo?.id);
      if (soundsEnabled) playMessageSound("sent");
      setDraft("");
      setFile(null);
      setReplyTo(null);
    } catch (err) {
      setError(friendlyError(err, "Couldn't send the message. Please try again."));
    } finally {
      setSending(false);
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
    setMessageMenu(null);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(
        message.unsentAt
          ? "This message was unsent"
          : message.body || message.attachmentName || message.attachmentUrl || "",
      );
      setMessageMenu(null);
    } catch (copyError) {
      setError(friendlyError(copyError, "Couldn't copy the message."));
    }
  }

  async function deleteForMe(message: ChatMessage) {
    try {
      await store.deleteMessageForMe(message.id);
      setMessageMenu(null);
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't delete the message. Please try again."));
    }
  }

  async function unsend(message: ChatMessage) {
    try {
      const shouldShowWarning = await store.unsendMessage(message.id);
      if (shouldShowWarning) setShowUnsendWarning(true);
      setMessageMenu(null);
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't unsend the message. Please try again."));
    }
  }

  const reactToMessage = useCallback(async (message: ChatMessage, emoji: string) => {
    try {
      await toggleMessageReaction(message.id, emoji);
      setMessageMenu(null);
      setReactionPickerOpen(false);
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't add the reaction. Please try again."));
    }
  }, [toggleMessageReaction]);

  if (!me) return null;

  async function favoriteSticker(message: ChatMessage) {
    try {
      await store.favoriteStickerFromMessage(message.id);
      setMessageMenu(null);
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't update your sticker favourites."));
    }
  }

  async function forwardToFriend(receiverId: string) {
    if (!forwardMessage) return;
    try {
      await store.forwardMessage(forwardMessage.id, receiverId);
      setForwardMessage(null);
      setMessageMenu(null);
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't forward the message. Please try again."));
    }
  }

  return (
    <section className="chat">
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={onBack} aria-label="Back">
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
        messages={activeMessages}
        friend={friend}
        me={me}
        isTyping={friendActivity?.isTyping ?? false}
        status={friendActivity?.status ?? "offline"}
        messagesRef={messagesRef}
        pinnedToBottomRef={pinnedToBottomRef}
        onOpenProfile={onOpenProfile}
        onOpenMessageMenu={openMessageMenu}
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
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={
            isFriendBlocked
              ? `Unblock @${friend.username} to message`
              : `Message @${friend.username}…`
          }
          disabled={isFriendBlocked}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
        />
        <button className="send-btn" type="submit" disabled={isFriendBlocked || sending || (!draft.trim() && !file)}>
          {sending ? "…" : "➤"}
        </button>
      </form>

      {messageMenu && (
        <ContextMenu
          x={messageMenu.x}
          y={messageMenu.y}
          label="Message actions"
          className="message-context-menu"
          onClose={() => setMessageMenu(null)}
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
                  setForwardMessage(messageMenu.message);
                  setMessageMenu(null);
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
              {messageMenu.message.isStickerFavorite
                ? "Remove from favourites"
                : "Add to favourites"}
            </button>
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
        <div className="forward-backdrop" onClick={() => setForwardMessage(null)}>
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
                onClick={() => setForwardMessage(null)}
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
    </section>
  );
}
