import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { ContextMenu } from "./ContextMenu";
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";
import { OFFICIAL_COMMUNITY_ID, type JaUser } from "../lib/types";
import { Avatar } from "./Avatar";

function fmtTime(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** "morning" | "afternoon" | "evening" | "night" based on local time. */
function dayPart(date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

export function Sidebar({
  onOpenProfile,
  onOpenSettings,
}: {
  onOpenProfile: (user: JaUser) => void;
  onOpenSettings: () => void;
}) {
  const store = useJaText();
  const { me, friends, incoming, outgoing, previews, activeChatId, setActiveChatId } = store;
  const [tab, setTab] = useState<"chats" | "add">("chats");
  const [search, setSearch] = useState("");
  const [addName, setAddName] = useState("");
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [chatMenu, setChatMenu] = useState<{
    x: number;
    y: number;
    friend: JaUser;
  } | null>(null);
  const [chatActionError, setChatActionError] = useState<string | null>(null);

  // greeting under the logo — re-check every minute so it flips
  // from "Good afternoon" to "Good evening" etc. on its own
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const previewByFriend = useMemo(
    () => new Map(previews.map((p) => [p.friendId, p])),
    [previews],
  );

  const sortedFriends = useMemo(() => {
    const filtered = friends.filter(
      (f) =>
        f.displayName.toLowerCase().includes(search.toLowerCase()) ||
        f.username.toLowerCase().includes(search.toLowerCase()),
    );
    return filtered
      .filter((friend) => (previewByFriend.get(friend.id)?.isArchived ?? false) === showArchived)
      .sort(
      (a, b) =>
        (previewByFriend.get(b.id)?.createdAt ?? 0) -
        (previewByFriend.get(a.id)?.createdAt ?? 0),
      );
  }, [friends, previewByFriend, search, showArchived]);
  const archivedCount = friends.filter(
    (friend) => previewByFriend.get(friend.id)?.isArchived,
  ).length;

  if (!me) return null;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const username = addName.trim().replace(/^@/, "");
    if (!username) return;
    setAddBusy(true);
    setAddMsg(null);
    try {
      await store.sendFriendRequest(username);
      setAddMsg({ ok: true, text: `Friend request sent to @${username}! They'll need to accept before you can chat.` });
      setAddName("");
    } catch (err) {
      setAddMsg({ ok: false, text: friendlyError(err, "Could not send the friend request. Please try again.") });
    } finally {
      setAddBusy(false);
    }
  }

  function openChatMenu(event: MouseEvent, friend: JaUser) {
    event.preventDefault();
    event.stopPropagation();
    setChatActionError(null);
    setChatMenu({ x: event.clientX, y: event.clientY, friend });
  }

  async function updateChat(
    action: "archive" | "unarchive" | "mute" | "unmute" | "delete" | "block" | "unblock",
  ) {
    if (!chatMenu) return;
    const { friend } = chatMenu;
    try {
      if (action === "archive" || action === "unarchive") {
        await store.setConversationArchived(friend.id, action === "archive");
      } else if (action === "mute" || action === "unmute") {
        await store.setConversationMuted(friend.id, action === "mute");
      } else if (action === "block" || action === "unblock") {
        if (action === "block" && !window.confirm(
          `Block ${friend.displayName}? They can still send messages, but their messages won't appear to you and will stay marked Delivered.`,
        )) {
          setChatMenu(null);
          return;
        }
        await store.setUserBlocked(friend.id, action === "block");
      } else {
        if (
          !window.confirm(
            `Delete your chat history with ${friend.displayName}? This won't delete their copy.`,
          )
        ) {
          setChatMenu(null);
          return;
        }
        await store.deleteConversationForMe(friend.id);
      }
      setChatMenu(null);
      if (action === "delete" && activeChatId === friend.id) setActiveChatId(null);
    } catch (error) {
      setChatMenu(null);
      setChatActionError(friendlyError(error, "Couldn't update this chat. Please try again."));
    }
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div className="brand">
          <img className="logo-icon" src="/jatext-logo-icon.png" alt="" />
          <span>JaText</span>
        </div>
        <button className="icon-btn" onClick={onOpenSettings} title="Settings" aria-label="Settings">
          ⚙️
        </button>
      </header>

      <div className="greeting">
        <Avatar
          user={me}
          size={52}
          status={me.statusPreference === "offline" ? "offline" : me.statusPreference === "dnd" ? "dnd" : "online"}
          onClick={() => onOpenProfile(me)}
        />
        <div className="greeting-text">
          <span className="greeting-title">
            Good {dayPart(now)}, {me.displayName}!
          </span>
          <span className="muted">@{me.username}</span>
        </div>
      </div>

      <div className="tabs sidebar-tabs">
        <button className={tab === "chats" ? "active" : ""} onClick={() => setTab("chats")}>
          💬 Chats
        </button>
        <button className={tab === "add" ? "active" : ""} onClick={() => setTab("add")}>
          ➕ Add friends
          {incoming.length > 0 && <span className="badge">{incoming.length}</span>}
        </button>
      </div>

      {tab === "chats" && (
        <>
          <input
            className="search-input"
            placeholder="Search friends…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className={`archive-toggle ${showArchived ? "active" : ""}`}
            onClick={() => setShowArchived((current) => !current)}
          >
            {showArchived ? "← Chats" : `📦 Archived${archivedCount ? ` (${archivedCount})` : ""}`}
          </button>
          {chatActionError && (
            <div className="error-box sidebar-error" role="alert">{chatActionError}</div>
          )}
          <div className="friend-list">
            {!showArchived && (
              <div
                className={`friend-row official-community-row ${activeChatId === OFFICIAL_COMMUNITY_ID ? "active" : ""}`}
                onClick={() => setActiveChatId(OFFICIAL_COMMUNITY_ID)}
              >
                <div className="community-mark" aria-hidden="true">J</div>
                <div className="friend-row-text">
                  <div className="friend-row-top">
                    <strong>JaText Community</strong>
                    <span className="friend-row-badges">
                      <span className="verified-badge" title="Verified">✓</span>
                      <span className="official-badge">Official</span>
                    </span>
                  </div>
                  <span className="muted small friend-preview">Official JaText announcements</span>
                </div>
              </div>
            )}
            {!showArchived && store.groups.map((group) => (
              <div
                className={`friend-row group-list-row ${store.activeGroupId === group.id ? "active" : ""}`}
                key={group.id}
                onClick={() => store.setActiveGroupId(group.id)}
              >
                {group.avatarUrl ? (
                  <img className="group-avatar sidebar-group-avatar" src={group.avatarUrl} alt="" />
                ) : (
                  <div className="group-avatar sidebar-group-avatar group-avatar-fallback" aria-hidden="true">👥</div>
                )}
                <div className="friend-row-text">
                  <div className="friend-row-top"><strong>{group.name}</strong></div>
                  <span className="muted small friend-preview">
                    {group.lastMessage || `${group.memberCount} members`}
                  </span>
                </div>
              </div>
            ))}
            {sortedFriends.length === 0 && friends.length > 0 && (
              <div className="empty-box">
                <p>{showArchived ? "No archived chats." : "No chats match your search."}</p>
              </div>
            )}
            {friends.length === 0 && (
              <div className="empty-box">
                <p>No friends yet 🥲</p>
                <p className="muted small">
                  Head to <strong>Add friends</strong> and add someone by their
                  username. Once they accept, you can start texting!
                </p>
                <button className="primary-btn" onClick={() => setTab("add")}>
                  Add a friend
                </button>
              </div>
            )}
            {sortedFriends.map((friend) => {
              const preview = previewByFriend.get(friend.id);
              return (
                <div
                  key={friend.id}
                  className={`friend-row ${activeChatId === friend.id ? "active" : ""}`}
                  onClick={() => setActiveChatId(friend.id)}
                  onContextMenu={(event) => openChatMenu(event, friend)}
                >
                  <Avatar
                    user={friend}
                    size={48}
                    status={store.friendActivities.find((activity) => activity.userId === friend.id)?.status}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenProfile(friend);
                    }}
                  />
                  <div className="friend-row-text">
                    <div className="friend-row-top">
                      <strong>{friend.displayName}</strong>
                      <span className="friend-row-badges">
                        {preview?.isArchived && <span title="Archived">📦</span>}
                        {preview?.isMuted && <span title="Muted">🔕</span>}
                        {preview?.createdAt ? (
                          <span className="muted small">{fmtTime(preview.createdAt)}</span>
                        ) : null}
                      </span>
                    </div>
                    <span className="muted small friend-preview">
                      {preview?.createdAt
                        ? `${preview.senderId === me.id ? "You: " : ""}${preview.body}`
                        : `@${friend.username} — say hi! 👋`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "add" && (
        <div className="add-panel">
          <h3>Add by username</h3>
          <form onSubmit={onAdd} className="add-form">
            <div className="username-input">
              <span>@</span>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value.toLowerCase())}
                placeholder="their-username"
              />
            </div>
            <button className="primary-btn" type="submit" disabled={addBusy || !addName.trim()}>
              {addBusy ? "Sending…" : "Send friend request"}
            </button>
          </form>
          {addMsg && (
            <div className={addMsg.ok ? "success-box" : "error-box"}>{addMsg.text}</div>
          )}

          <section className="groups-add-section">
            <div className="groups-section-heading">
              <h3>Groups</h3>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setGroupName("");
                  setGroupMemberIds([]);
                  setGroupError(null);
                  setShowGroupDialog(true);
                }}
              >Add group chat…</button>
            </div>
            {store.groups.length === 0 ? (
              <p className="muted small">Create a group with people you’re already friends with.</p>
            ) : store.groups.map((group) => (
              <button
                type="button"
                className="group-add-row"
                key={group.id}
                onClick={() => store.setActiveGroupId(group.id)}
              >
                <span>{group.avatarUrl ? <img className="group-avatar sidebar-group-avatar" src={group.avatarUrl} alt="" /> : "👥"}</span>
                <span><strong>{group.name}</strong><small className="muted">{group.memberCount} members</small></span>
              </button>
            ))}
          </section>

          {store.mode === "demo" && (
            <div className="hint-box">
              🧪 <strong>Demo tip:</strong> try adding <code>@maya</code>,{" "}
              <code>@kai.codes</code> or <code>@Nova</code> — they accept after a
              couple of seconds and will text you back. You can also create a
              second real account (sign out, sign up) and add each other.
            </div>
          )}
          {showGroupDialog && (
            <div className="modal-backdrop" onClick={() => setShowGroupDialog(false)}>
              <section className="modal-card create-group-dialog" onClick={(event) => event.stopPropagation()}>
                <button className="modal-close" onClick={() => setShowGroupDialog(false)} aria-label="Close">×</button>
                <h2>Create group chat</h2>
                <p className="muted small">You can add people you’re already friends with.</p>
                <label>
                  Group name
                  <input value={groupName} maxLength={60} onChange={(event) => setGroupName(event.target.value)} />
                </label>
                <div className="create-group-members">
                  {friends.map((friend) => (
                    <label className="community-directory-person" key={friend.id}>
                      <input
                        type="checkbox"
                        checked={groupMemberIds.includes(friend.id)}
                        onChange={(event) =>
                          setGroupMemberIds((current) =>
                            event.target.checked
                              ? [...current, friend.id]
                              : current.filter((id) => id !== friend.id),
                          )
                        }
                      />
                      <span><strong>{friend.displayName}</strong> @{friend.username}</span>
                    </label>
                  ))}
                  {friends.length === 0 && <p className="muted small">Add and accept a friend before creating a group.</p>}
                </div>
                {groupError && <div className="error-box" role="alert">{groupError}</div>}
                <button
                  type="button"
                  className="primary-btn"
                  disabled={groupBusy || !groupName.trim() || groupMemberIds.length === 0}
                  onClick={() => {
                    setGroupBusy(true);
                    setGroupError(null);
                    void store.createGroup(groupName, groupMemberIds).then((id) => {
                      setShowGroupDialog(false);
                      store.setActiveGroupId(id);
                    }).catch((error: unknown) => {
                      setGroupError(friendlyError(error, "Could not create the group."));
                    }).finally(() => setGroupBusy(false));
                  }}
                >{groupBusy ? "Creating…" : "Create group"}</button>
              </section>
            </div>
          )}

          {incoming.length > 0 && (
            <>
              <h3>Incoming requests</h3>
              {incoming.map((req) => (
                <div key={req.id} className="request-row">
                  <Avatar user={req.from} size={44} onClick={() => onOpenProfile(req.from)} />
                  <div className="request-text">
                    <strong>{req.from.displayName}</strong>
                    <span className="muted small">@{req.from.username} wants to be friends</span>
                  </div>
                  <button
                    className="accept-btn"
                    onClick={() => void store.respondRequest(req.id, true)}
                  >
                    Accept
                  </button>
                  <button
                    className="ghost-btn"
                    onClick={() => void store.respondRequest(req.id, false)}
                  >
                    Decline
                  </button>
                </div>
              ))}
            </>
          )}

          {outgoing.length > 0 && (
            <>
              <h3>Sent requests</h3>
              {outgoing.map((req) => (
                <div key={req.id} className="request-row">
                  <Avatar user={req.to} size={44} onClick={() => onOpenProfile(req.to)} />
                  <div className="request-text">
                    <strong>{req.to.displayName}</strong>
                    <span className="muted small">@{req.to.username}</span>
                  </div>
                  <span className="pending-chip">⏳ Pending</span>
                </div>
              ))}
            </>
          )}

          {incoming.length === 0 && outgoing.length === 0 && (
            <p className="muted small center">No pending requests right now.</p>
          )}
        </div>
      )}

      {store.mode === "demo" && (
        <footer className="sidebar-footer muted small">
          🧪 Demo mode — connect Convex to go live
        </footer>
      )}
      {chatMenu && (
        <ContextMenu
          x={chatMenu.x}
          y={chatMenu.y}
          label={`Actions for ${chatMenu.friend.displayName}`}
          className="message-context-menu conversation-context-menu"
          onClose={() => setChatMenu(null)}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              void updateChat(
                previewByFriend.get(chatMenu.friend.id)?.isArchived ? "unarchive" : "archive",
              )
            }
          >
            <span>📦</span>
            {previewByFriend.get(chatMenu.friend.id)?.isArchived ? "Unarchive" : "Archive chat"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              void updateChat(previewByFriend.get(chatMenu.friend.id)?.isMuted ? "unmute" : "mute")
            }
          >
            <span>{previewByFriend.get(chatMenu.friend.id)?.isMuted ? "🔔" : "🔕"}</span>
            {previewByFriend.get(chatMenu.friend.id)?.isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={store.blockedUserIds.includes(chatMenu.friend.id) ? "" : "destructive-menu-item"}
            onClick={() =>
              void updateChat(
                store.blockedUserIds.includes(chatMenu.friend.id) ? "unblock" : "block",
              )
            }
          >
            <span>{store.blockedUserIds.includes(chatMenu.friend.id) ? "🔓" : "🚫"}</span>
            {store.blockedUserIds.includes(chatMenu.friend.id) ? "Unblock" : "Block"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="destructive-menu-item"
            onClick={() => void updateChat("delete")}
          >
            <span>🗑️</span> Delete chat
          </button>
        </ContextMenu>
      )}
    </aside>
  );
}