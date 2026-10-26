import { useEffect, useRef, useState, type FormEvent } from "react";
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";

export function GroupChatView({ onBack }: { onBack: () => void }) {
  const store = useJaText();
  const groupId = store.activeGroupId;
  const summary = store.groups.find((group) => group.id === groupId);
  const group = store.groupDetails?.id === groupId ? store.groupDetails : null;
  const [draft, setDraft] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [showManage, setShowManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesElement = useRef<HTMLDivElement>(null);
  const wasPinnedRef = useRef(true);
  const lastMessageId = store.groupMessages.at(-1)?.id;

  useEffect(() => {
    const element = messagesElement.current;
    if (element && wasPinnedRef.current) element.scrollTop = element.scrollHeight;
  }, [lastMessageId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!groupId || !draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.sendGroupMessage(groupId, draft);
      setDraft("");
    } catch (cause) {
      setError(friendlyError(cause, "Could not send the group message."));
    } finally {
      setBusy(false);
    }
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
          <article className={`group-message ${message.senderId === store.me?.id ? "mine" : ""}`} key={message.id}>
            <div className="group-message-meta">
              <strong>{message.senderName}</strong>
              <span className="muted small">@{message.senderUsername}</span>
              <time className="muted small">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
            </div>
            <p>{message.body}</p>
          </article>
        ))}
      </div>

      {error && <div className="error-box community-error" role="alert">{error}</div>}
      {group?.members.find((member) => member.id === store.me?.id)?.muted ? (
        <div className="community-readonly">You are muted in this group.</div>
      ) : (
        <form className="composer group-composer" onSubmit={(event) => void send(event)}>
          <textarea
            value={draft}
            maxLength={4000}
            onChange={(event) => setDraft(event.target.value)}
            rows={1}
            placeholder="Message the group…"
            aria-label="Group message"
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
