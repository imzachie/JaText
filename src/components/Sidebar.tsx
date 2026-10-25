import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useJaText } from "../lib/store";
import type { JaUser } from "../lib/types";
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
    return filtered.sort(
      (a, b) =>
        (previewByFriend.get(b.id)?.createdAt ?? 0) -
        (previewByFriend.get(a.id)?.createdAt ?? 0),
    );
  }, [friends, previewByFriend, search]);

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
      setAddMsg({ ok: false, text: err instanceof Error ? err.message : "Could not send request." });
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div className="brand">
          <div className="logo-badge small">J</div>
          <span>JaText</span>
        </div>
        <button className="icon-btn" onClick={onOpenSettings} title="Settings" aria-label="Settings">
          ⚙️
        </button>
      </header>

      <div className="greeting">
        <Avatar user={me} size={52} onClick={() => onOpenProfile(me)} />
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
          <div className="friend-list">
            {sortedFriends.length === 0 && (
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
                >
                  <Avatar
                    user={friend}
                    size={48}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenProfile(friend);
                    }}
                  />
                  <div className="friend-row-text">
                    <div className="friend-row-top">
                      <strong>{friend.displayName}</strong>
                      {preview && <span className="muted small">{fmtTime(preview.createdAt)}</span>}
                    </div>
                    <span className="muted small friend-preview">
                      {preview
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

          {store.mode === "demo" && (
            <div className="hint-box">
              🧪 <strong>Demo tip:</strong> try adding <code>@maya</code>,{" "}
              <code>@kai.codes</code> or <code>@Nova</code> — they accept after a
              couple of seconds and will text you back. You can also create a
              second real account (sign out, sign up) and add each other.
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

      <footer className="sidebar-footer muted small">
        {store.mode === "convex" ? "⚡ Powered by Convex" : "🧪 Demo mode — connect Convex to go live"}
      </footer>
    </aside>
  );
}