import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { playMessageSound } from "../lib/alerts";
import { ContextMenu } from "./ContextMenu";
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";
import type { ChatMessage, JaUser } from "../lib/types";
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
    setTyping,
    soundsEnabled,
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<number | null>(null);
  const typingActive = useRef(false);
  const lastTypingUpdate = useRef(0);
  const setTypingRef = useRef(setTyping);
  const friendActivity = friendActivities.find((activity) => activity.userId === friend.id);
  const friendStatusLabel =
    friendActivity?.status === "dnd"
      ? "Do Not Disturb"
      : friendActivity?.status ?? "offline";

  useEffect(() => {
    setTypingRef.current = setTyping;
  }, [setTyping]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages.length, friend.id, friendActivity?.isTyping]);

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

  if (!me) return null;

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

  function openMessageMenu(event: MouseEvent, message: ChatMessage) {
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
  }

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

  async function reactToMessage(message: ChatMessage, emoji: string) {
    try {
      await store.toggleMessageReaction(message.id, emoji);
      setMessageMenu(null);
      setReactionPickerOpen(false);
    } catch (actionError) {
      setError(friendlyError(actionError, "Couldn't add the reaction. Please try again."));
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

  let lastDay = "";

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

      <div className="messages">
        {activeMessages.length === 0 && (
          <div className="empty-box center">
            <Avatar user={friend} size={72} onClick={() => onOpenProfile(friend)} />
            <p>
              You're now friends with <strong>{friend.displayName}</strong> 🎉
            </p>
            <p className="muted small">Send the first message below — photos &amp; files work too!</p>
          </div>
        )}

        {activeMessages.map((m) => {
          const day = fmtDay(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = m.senderId === me.id;
          const isImage = m.attachmentType?.startsWith("image/");
          return (
            <div key={m.id}>
              {showDay && <div className="day-divider">{day}</div>}
              <div
                className={`msg-row ${mine ? "mine" : "theirs"}`}
                id={`message-${m.id}`}
              >
                {!mine && (
                  <Avatar user={friend} size={30} ringWidth={2} onClick={() => onOpenProfile(friend)} />
                )}
                <div className="msg-col">
                  {m.forwardedFrom && (
                    <span className="message-meta forwarded-label">
                      ↗ Forwarded from {m.forwardedFrom}
                    </span>
                  )}
                  <div
                    className={`bubble ${mine ? "mine" : "theirs"} ${m.unsentAt ? "unsent" : ""}`}
                    onContextMenu={(event) => openMessageMenu(event, m)}
                  >
                    {m.replyTo && (
                      <button
                        type="button"
                        className="reply-quote"
                        onClick={() =>
                          document
                            .getElementById(`message-${m.replyTo?.id}`)
                            ?.scrollIntoView({ behavior: "smooth", block: "center" })
                        }
                      >
                        <strong>
                          {m.replyTo.senderId === me.id ? "You" : friend.displayName}
                        </strong>
                        <span>{m.replyTo.body || "📎 Attachment"}</span>
                      </button>
                    )}
                    {m.unsentAt ? (
                      <p className="unsent-copy">This message was unsent</p>
                    ) : (
                      <>
                    {m.attachmentUrl &&
                      (isImage ? (
                        <a href={m.attachmentUrl} target="_blank" rel="noreferrer">
                          <img className="msg-image" src={m.attachmentUrl} alt={m.attachmentName ?? "attachment"} />
                        </a>
                      ) : (
                        <a
                          className="file-chip"
                          href={m.attachmentUrl}
                          download={m.attachmentName ?? "file"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          📎 {m.attachmentName ?? "Attachment"}
                        </a>
                      ))}
                    {m.body && <p>{m.body}</p>}
                      </>
                    )}
                  </div>
                  {!!m.reactions?.length && (
                    <div className="message-reactions">
                      {Array.from(new Set(m.reactions.map((reaction) => reaction.emoji))).map(
                        (emoji) => {
                          const users = m.reactions?.filter((reaction) => reaction.emoji === emoji) ?? [];
                          const mineReacted = users.some((reaction) => reaction.userId === me.id);
                          return (
                            <button
                              type="button"
                              key={emoji}
                              className={`reaction-chip ${mineReacted ? "selected" : ""}`}
                              onClick={() => void reactToMessage(m, emoji)}
                              aria-label={`${emoji} reaction, ${users.length} people`}
                            >
                              {emoji} <span>{users.length}</span>
                            </button>
                          );
                        },
                      )}
                    </div>
                  )}
                  <span className="msg-time">{fmtTime(m.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
        {friendActivity?.isTyping && (
          <div className="msg-row theirs typing-row" aria-label={`${friend.displayName} is typing`}>
            <Avatar user={friend} size={30} ringWidth={2} status={friendActivity.status} />
            <div className="typing-bubble" aria-hidden="true">
              <span>.</span><span>.</span><span>.</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

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
          onClick={() => fileInput.current?.click()}
        >
          📎
        </button>
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={`Message @${friend.username}…`}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
        />
        <button className="send-btn" type="submit" disabled={sending || (!draft.trim() && !file)}>
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
