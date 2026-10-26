import { useEffect, useRef, useState, type FormEvent } from "react";
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";
import { Avatar } from "./Avatar";
import { StickerPicker } from "./StickerPicker";
import type { GroupMessage } from "../lib/types";

function typingLabel(names: string[]) {
  if (names.length === 1) return `${names[0]} is typing…`;
  const first = names.slice(0, 2).join(", ");
  const more = names.length > 2 ? ` and ${names.length - 2} more` : "";
  return `${first}${more} are typing…`;
}

export function GroupChatView({ onBack }: { onBack: () => void }) {
  const store = useJaText();
  const groupId = store.activeGroupId;
  const setGroupTyping = store.setGroupTyping;
  const summary = store.groups.find((group) => group.id === groupId);
  const group = store.groupDetails?.id === groupId ? store.groupDetails : null;
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [forwardedMessage, setForwardedMessage] = useState<GroupMessage | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [showManage, setShowManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesElement = useRef<HTMLDivElement>(null);
  const wasPinnedRef = useRef(true);
  const typingTimer = useRef<number | null>(null);
  const typingRef = useRef(false);
  const typingNames = store.groupTypingUsers.map((user) => user.displayName || user.username);
  const lastMessageId = store.groupMessages.at(-1)?.id;

  useEffect(() => {
    const element = messagesElement.current;
    if (element && wasPinnedRef.current) element.scrollTop = element.scrollHeight;
  }, [lastMessageId]);

  useEffect(() => {
    if (!groupId) return;
    return () => {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      if (typingRef.current) {
        void setGroupTyping(groupId, false).catch((cause: unknown) => {
          console.error("Could not clear group typing status.", cause);
        });
      }
    };
  }, [groupId, setGroupTyping]);

  function updateDraft(value: string) {
    setDraft(value);
    if (!groupId) return;
    const typing = !!value.trim();
    if (typing !== typingRef.current) {
      typingRef.current = typing;
      void setGroupTyping(groupId, typing).catch((cause: unknown) => {
        setError(friendlyError(cause, "Couldn't update typing status."));
      });
    }
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    if (typing) {
      typingTimer.current = window.setTimeout(() => {
        typingRef.current = false;
        void setGroupTyping(groupId, false).catch((cause: unknown) => {
          setError(friendlyError(cause, "Couldn't update typing status."));
        });
      }, 2500);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!groupId || !draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      await store.sendGroupMessage(groupId, draft, replyTo?.id, forwardedMessage?.id);
      setDraft("");
      setReplyTo(null);
      setForwardedMessage(null);
      typingRef.current = false;
      await store.setGroupTyping(groupId, false);
    } catch (cause) {
      setError(friendlyError(cause, "Could not send the group message."));
    } finally {
      setBusy(false);
    }
  }

  async function sendSticker(sticker: Parameters<typeof store.sendGroupSticker>[1]) {
    if (!groupId) return;
    try {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      typingRef.current = false;
      await setGroupTyping(groupId, false);
      await store.sendGroupSticker(groupId, sticker, replyTo?.id);
      setReplyTo(null);
    } catch (cause) {
      setError(friendlyError(cause, "Could not send the sticker."));
    }
  }

  function replyToMessage(message: GroupMessage) {
    setReplyTo(message);
    setForwardedMessage(null);
  }

  function forwardMessage(message: GroupMessage) {
    setForwardedMessage(message);
    setReplyTo(null);
    setDraft(message.body || (message.stickerUrl ? "Sticker" : ""));
  }

  async function runAction(action: () => Promise<void>, success?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      success?.();
    } catch (cause) {
      setError(friendlyError(cause, "Could not update this group."));
    } finally {
      setBusy(false);
    }
  }

  if (!groupId) return null;
  return (
    <section className="chat group-chat">
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={onBack} aria-label="Back">←</button>
        {group?.avatarUrl ? (
          <img className="group-avatar" src={group.avatarUrl} alt="" />
        ) : (
          <div className="group-avatar group-avatar-fallback" aria-hidden="true">👥</div>
        )}
        <button
          type="button"
          className="chat-title"
          onClick={() => {
            setRenameDraft(group?.name ?? summary?.name ?? "");
            setError(null);
            setShowManage(true);
          }}
        >
          <strong>{group?.name ?? summary?.name ?? "Group chat"}</strong>
          <span className="muted small">{group?.members.length ?? summary?.memberCount ?? 0} members · Tap for group settings</span>
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            setRenameDraft(group?.name ?? summary?.name ?? "");
            setShowManage(true);
          }}
        >Manage</button>
      </header>

      <div
        className="messages group-messages"
        ref={messagesElement}
        onScroll={(event) => {
          const element = event.currentTarget;
          wasPinnedRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
      >
        {store.groupMessages.length === 0 && (
          <div className="empty-box center">
            <strong>This is the beginning of {group?.name ?? summary?.name ?? "your group"}.</strong>
            <span className="muted">Say hello to the group!</span>
          </div>
        )}
        {store.groupMessages.map((message) => (
          <div
            className={`group-message-row ${message.senderId === store.me?.id ? "mine" : ""}`}
            id={`group-message-${message.id}`}
            key={message.id}
          >
            <Avatar
              user={{
                displayName: message.senderName,
                username: message.senderUsername,
                avatarColor: message.senderAvatarColor,
                avatarUrl: message.senderAvatarUrl,
              }}
              size={34}
            />
            <article className="group-message-content">
              <div className="group-message-meta">
                <strong>{message.senderName}</strong>
                <span className="muted small">@{message.senderUsername}</span>
                <time className="muted small">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
              </div>
              {message.forwardedFromName && (
                <span className="message-meta forwarded-label">↗ Forwarded from {message.forwardedFromName}</span>
              )}
              <div className="group-message-bubble">
                {message.replyTo && (
                  <button
                    type="button"
                    className="reply-quote"
                    onClick={() => document.getElementById(`group-message-${message.replyTo?.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  >
                    <strong>{message.replyTo.senderName}</strong>
                    <span>{message.replyTo.body}</span>
                  </button>
                )}
                {message.stickerUrl && <img className="group-message-sticker" src={message.stickerUrl} alt={message.stickerName ?? "Sticker"} />}
                {message.body && <p>{message.body}</p>}
              </div>
              <div className="group-message-actions">
                <button type="button" className="mini-btn" onClick={() => replyToMessage(message)}>Reply</button>
                <button type="button" className="mini-btn" onClick={() => forwardMessage(message)}>Forward</button>
              </div>
            </article>
          </div>
        ))}
      </div>

      {error && <div className="error-box community-error" role="alert">{error}</div>}
      {typingNames.length > 0 && (
        <div className="chat-typing-status" role="status">{typingLabel(typingNames)}</div>
      )}
      {group?.members.find((member) => member.id === store.me?.id)?.muted ? (
        <div className="community-readonly">You are muted in this group.</div>
      ) : (
        <form className="composer group-composer" onSubmit={(event) => void send(event)}>
          {(replyTo || forwardedMessage) && (
            <div className="reply-composer-preview">
              <div>
                <strong>{replyTo ? `Replying to ${replyTo.senderName}` : `Forwarding from ${forwardedMessage?.senderName}`}</strong>
                <span>{replyTo?.body ?? draft}</span>
              </div>
              <button type="button" className="mini-btn" onClick={() => {
                setReplyTo(null);
                setForwardedMessage(null);
                if (forwardedMessage) setDraft("");
              }}>×</button>
            </div>
          )}
          <StickerPicker
            friendId=""
            disabled={busy}
            onSelect={sendSticker}
          />
          <button type="button" className="icon-btn voice-note-placeholder" title="Voice notes coming soon" aria-label="Voice notes coming soon" disabled>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
            </svg>
          </button>
          <textarea
            value={draft}
            maxLength={4000}
            onChange={(event) => updateDraft(event.target.value)}
            rows={1}
            placeholder="Message the group…"
            aria-label="Group message"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" className="send-btn" disabled={busy || !draft.trim()}>➤</button>
        </form>
      )}

      {showManage && group && (
        <div className="modal-backdrop" onClick={() => setShowManage(false)}>
          <section className="modal-card group-manage-dialog" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowManage(false)} aria-label="Close">×</button>
            <h2>Group settings</h2>
            <p className="muted small">{group.members.length} members</p>
            {(group.role === "owner" || group.role === "moderator") && (
              <>
                <form
                  className="group-rename-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runAction(() => store.renameGroup(group.id, renameDraft));
                  }}
                >
                  <input
                    value={renameDraft}
                    maxLength={60}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    aria-label="Group name"
                  />
                  <button type="submit" className="ghost-btn" disabled={busy}>Rename</button>
                </form>
                <label className="group-avatar-picker">
                  Change group picture
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void runAction(() => store.setGroupAvatar(group.id, file));
                        event.target.value = "";
                      }
                    }}
                  />
                </label>
              </>
            )}
            <div className="group-manage-members">
              {group.members.map((member) => {
                const isSelf = member.id === store.me?.id;
                const canManage = group.role === "owner" || group.role === "moderator";
                const canManageMember = canManage && member.role !== "owner" &&
                  !(member.role === "moderator" && group.role !== "owner");
                return (
                  <div className="group-manage-member" key={member.id}>
                    <div>
                      <strong>{member.displayName}</strong>
                      <span className="muted small">@{member.username} · {member.role}{member.muted ? " · muted" : ""}</span>
                    </div>
                    {group.role === "owner" && member.role !== "owner" && (
                      <button
                        type="button"
                        className="mini-btn"
                        disabled={busy}
                        onClick={() => void runAction(() =>
                          store.setGroupMemberRole(
                            group.id,
                            member.id,
                            member.role === "moderator" ? "member" : "moderator",
                          ),
                        )}
                      >{member.role === "moderator" ? "Remove mod" : "Make mod"}</button>
                    )}
                    {canManageMember && !isSelf && (
                      <>
                        <button
                          type="button"
                          className="mini-btn"
                          disabled={busy}
                          onClick={() => void runAction(() => store.setGroupMuted(group.id, member.id, !member.muted))}
                        >{member.muted ? "Unmute" : "Mute"}</button>
                        <button
                          type="button"
                          className="mini-btn destructive-menu-item"
                          disabled={busy}
                          onClick={() => void runAction(() => store.removeGroupMember(group.id, member.id))}
                        >Remove</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="group-manage-footer">
              {group.role === "owner" ? (
                <button
                  type="button"
                  className="danger-btn"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Delete this group and its messages for everyone?")) {
                      void runAction(() => store.deleteGroup(group.id), () => {
                        setShowManage(false);
                        store.setActiveGroupId(null);
                      });
                    }
                  }}
                >Delete group</button>
              ) : (
                <button
                  type="button"
                  className="danger-btn"
                  disabled={busy}
                  onClick={() => void runAction(() => store.leaveGroup(group.id), () => {
                    setShowManage(false);
                    store.setActiveGroupId(null);
                  })}
                >Leave group</button>
              )}
              <button type="button" className="ghost-btn" onClick={() => setShowManage(false)}>Done</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
