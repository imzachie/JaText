import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { AnimatedModal } from "./AnimatedModal";
import { Phone, Video } from "./CallIcons";
import { ContextMenu } from "./ContextMenu";
import {
  switchToAccountSlot,
  useMultiAccountState,
  type SavedAccountEntry,
} from "../lib/accountManager";
import {
  formatCallDuration,
  formatPreviewMessageText,
  parseCallInvite,
  useCall,
} from "../lib/calling";
import { useCallHistoryEntries, type CallHistoryEntry } from "../lib/callHistory";
import { useDraftsMap } from "../lib/drafts";
import { useGroupCall } from "../lib/groupCalling";
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";
import { OFFICIAL_COMMUNITY_ID, type JaUser } from "../lib/types";
import { Avatar } from "./Avatar";
import {
  ArchiveIcon,
  ArrowDownLeftIcon,
  ArrowLeftIcon,
  ArrowUpRightIcon,
  BanIcon,
  BellIcon,
  BellOffIcon,
  CheckIcon,
  ChevronUpDownIcon,
  ClockIcon,
  FlaskIcon,
  MessageCircleIcon,
  PlusIcon,
  SettingsIcon,
  SwitchAccountIcon,
  TrashIcon,
  UnlockIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
} from "./UiIcons";

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

function savedEntryToAvatarUser(entry: SavedAccountEntry): JaUser {
  return {
    id: entry.userId,
    displayName: entry.displayName || entry.username || "Account",
    username: entry.username || "user",
    bio: "",
    pronouns: "",
    avatarColor: entry.avatarColor,
    avatarUrl: entry.avatarUrl,
    onboardingComplete: true,
  };
}

export function Sidebar({
  onOpenProfile,
  onOpenSettings,
  onOpenAccountSwitcher,
}: {
  onOpenProfile: (user: JaUser) => void;
  onOpenSettings: () => void;
  onOpenAccountSwitcher: () => void;
}) {
  const store = useJaText();
  const { session, startCall, endCall } = useCall();
  const { groupSession, startGroupCall, leaveGroupCall } = useGroupCall();
  const { activeSlotId, accounts } = useMultiAccountState();
  const draftsMap = useDraftsMap();
  const storedCallHistory = useCallHistoryEntries();
  const { me, friends, incoming, outgoing, previews, activeChatId, setActiveChatId } = store;
  const [tab, setTab] = useState<"chats" | "calls" | "add">("chats");
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

  const friendById = useMemo(
    () => new Map(friends.map((f) => [f.id, f])),
    [friends],
  );

  // Combine persisted call history + any DM preview call invites not yet in storage
  const combinedCalls = useMemo<CallHistoryEntry[]>(() => {
    if (!me) return [];
    const byCallId = new Map<string, CallHistoryEntry>();
    for (const item of storedCallHistory) {
      const liveFriend = item.kind === "dm" ? friendById.get(item.peerId) : undefined;
      byCallId.set(item.callId, {
        ...item,
        ...(liveFriend
          ? {
              peerDisplayName: liveFriend.displayName,
              peerUsername: liveFriend.username,
              peerAvatarUrl: liveFriend.avatarUrl,
              peerAvatarColor: liveFriend.avatarColor,
            }
          : {}),
      });
    }

    for (const preview of previews) {
      const invite = parseCallInvite(preview.body);
      if (!invite || byCallId.has(invite.callId)) continue;
      const friend = friendById.get(preview.friendId);
      if (!friend) continue;
      byCallId.set(invite.callId, {
        callId: invite.callId,
        kind: "dm",
        peerId: friend.id,
        peerDisplayName: friend.displayName,
        peerUsername: friend.username,
        peerAvatarUrl: friend.avatarUrl,
        peerAvatarColor: friend.avatarColor,
        direction: preview.senderId === me.id ? "outgoing" : "incoming",
        mode: invite.mode,
        state: invite.state,
        durationSec: invite.durationSec,
        timestamp: preview.createdAt || invite.ts,
      });
    }

    return Array.from(byCallId.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [friendById, me, previews, storedCallHistory]);

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
      setAddMsg({
        ok: true,
        text: `Friend request sent to @${username}! They'll need to accept before you can chat.`,
      });
      setAddName("");
    } catch (err) {
      setAddMsg({
        ok: false,
        text: friendlyError(err, "Could not send the friend request. Please try again."),
      });
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
    action: "archive" | "unarchive" | "mute" | "unmute" | "delete" | "block" | "unblock" | "unfriend",
  ) {
    if (!chatMenu) return;
    const { friend } = chatMenu;
    try {
      if (action === "unfriend") {
        if (
          !window.confirm(
            `Unfriend ${friend.displayName} (@${friend.username})? You will need to send a friend request again to chat.`,
          )
        ) {
          setChatMenu(null);
          return;
        }
        await store.removeFriend(friend.id);
        setChatMenu(null);
        return;
      }
      if (action === "archive" || action === "unarchive") {
        await store.setConversationArchived(friend.id, action === "archive");
      } else if (action === "mute" || action === "unmute") {
        await store.setConversationMuted(friend.id, action === "mute");
      } else if (action === "block" || action === "unblock") {
        if (
          action === "block" &&
          !window.confirm(
            `Block ${friend.displayName}? They can still send messages, but their messages won't appear to you and will stay marked Delivered.`,
          )
        ) {
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

  const communityDraft = draftsMap["community"];
  const otherSavedAccounts = accounts
    .filter((a) => a.slotId !== activeSlotId && a.userId !== me.id)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);

  async function handleDirectQuickSwitch(targetSlotId: string) {
    if (session) await endCall().catch(() => undefined);
    if (groupSession) await leaveGroupCall().catch(() => undefined);
    void switchToAccountSlot(
      targetSlotId,
      import.meta.env.VITE_CONVEX_URL as string | undefined,
    );
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div className="brand">
          <img className="logo-icon" src="/jatext-logo-icon.png" alt="" />
          <span>JaText</span>
        </div>
        <div className="sidebar-header-actions">
          <button
            type="button"
            className="icon-btn account-switch-header-btn"
            onClick={onOpenAccountSwitcher}
            title="Switch or add account"
            aria-label="Switch or add account"
          >
            <SwitchAccountIcon size={17} />
            {accounts.length > 1 && (
              <span className="account-count-badge" aria-hidden="true">
                {accounts.length}
              </span>
            )}
          </button>
          <button className="icon-btn" onClick={onOpenSettings} title="Settings" aria-label="Settings">
            <SettingsIcon size={18} />
          </button>
        </div>
      </header>

      <div className="greeting">
        <Avatar
          user={me}
          size={52}
          status={
            me.statusPreference === "offline"
              ? "offline"
              : me.statusPreference === "dnd"
                ? "dnd"
                : "online"
          }
          onClick={() => onOpenProfile(me)}
        />
        <div className="greeting-text">
          <span className="greeting-title">
            Good {dayPart(now)}, {me.displayName}!
          </span>
          <button
            type="button"
            className="greeting-account-btn"
            onClick={onOpenAccountSwitcher}
            title="Switch or add account"
          >
            <span className="greeting-username">@{me.username}</span>
            <ChevronUpDownIcon size={13} />
          </button>
        </div>
        {otherSavedAccounts.length > 0 && (
          <div className="greeting-quick-accounts">
            {otherSavedAccounts.slice(0, 2).map((acct) => (
              <button
                key={acct.slotId}
                type="button"
                className="quick-account-avatar-btn"
                title={`Switch directly to ${acct.displayName || `@${acct.username}`}`}
                aria-label={`Switch directly to ${acct.displayName || acct.username}`}
                onClick={() => void handleDirectQuickSwitch(acct.slotId)}
              >
                <Avatar user={savedEntryToAvatarUser(acct)} size={30} />
              </button>
            ))}
            {otherSavedAccounts.length > 2 && (
              <button
                type="button"
                className="quick-account-more-btn"
                title="All saved accounts"
                aria-label="All saved accounts"
                onClick={onOpenAccountSwitcher}
              >
                +{otherSavedAccounts.length - 2}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="tabs sidebar-tabs">
        <button className={tab === "chats" ? "active" : ""} onClick={() => setTab("chats")}>
          <MessageCircleIcon size={15} />
          <span>Chats</span>
        </button>
        <button className={tab === "calls" ? "active" : ""} onClick={() => setTab("calls")}>
          <Phone size={15} />
          <span>Calls</span>
        </button>
        <button className={tab === "add" ? "active" : ""} onClick={() => setTab("add")}>
          <PlusIcon size={15} />
          <span>Add</span>
          {incoming.length > 0 && <span className="badge">{incoming.length}</span>}
        </button>
      </div>

      {tab === "chats" && (
        <div className="sidebar-tab-pane" key="pane-chats">
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
            {showArchived ? (
              <>
                <ArrowLeftIcon size={14} /> Chats
              </>
            ) : (
              <>
                <ArchiveIcon size={14} /> Archived{archivedCount ? ` (${archivedCount})` : ""}
              </>
            )}
          </button>
          {chatActionError && (
            <div className="error-box sidebar-error" role="alert">
              {chatActionError}
            </div>
          )}
          <div className="friend-list">
            {!showArchived && (
              <div
                className={`friend-row official-community-row ${activeChatId === OFFICIAL_COMMUNITY_ID ? "active" : ""}`}
                onClick={() => setActiveChatId(OFFICIAL_COMMUNITY_ID)}
              >
                <img className="community-mark" src="/jatext-logo-icon.png" alt="" />
                <div className="friend-row-text">
                  <div className="friend-row-top">
                    <strong>JaText Community</strong>
                    <span className="friend-row-badges">
                      <span className="verified-badge" title="Verified">
                        <CheckIcon size={11} strokeWidth={3} />
                      </span>
                      <span className="official-badge">Official</span>
                    </span>
                  </div>
                  <span className="muted small friend-preview">
                    {communityDraft ? (
                      <>
                        <span className="draft-pill">Draft:</span> {communityDraft}
                      </>
                    ) : (
                      "Official JaText announcements"
                    )}
                  </span>
                </div>
              </div>
            )}
            {!showArchived &&
              store.groups
                .filter(
                  (group) =>
                    !search.trim() || group.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((group) => {
                  const groupDraft = draftsMap[`group:${group.id}`];
                  return (
                    <div
                      className={`friend-row group-list-row ${store.activeGroupId === group.id ? "active" : ""}`}
                      key={group.id}
                      onClick={() => store.setActiveGroupId(group.id)}
                    >
                      {group.avatarUrl ? (
                        <img
                          className="group-avatar sidebar-group-avatar"
                          src={group.avatarUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          decoding="async"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="group-avatar sidebar-group-avatar group-avatar-fallback"
                          aria-hidden="true"
                        >
                          <UsersIcon size={20} />
                        </div>
                      )}
                      <div className="friend-row-text">
                        <div className="friend-row-top">
                          <strong>{group.name}</strong>
                          <span className="friend-row-badges">
                            {group.lastMentionedMe && store.activeGroupId !== group.id && (
                              <span className="badge mention-badge" title="You were mentioned">
                                @
                              </span>
                            )}
                            {group.lastMessageAt ? (
                              <span className="muted small">{fmtTime(group.lastMessageAt)}</span>
                            ) : null}
                          </span>
                        </div>
                        <span className="muted small friend-preview">
                          {groupDraft ? (
                            <>
                              <span className="draft-pill">Draft:</span> {groupDraft}
                            </>
                          ) : group.lastMessage ? (
                            `${group.lastSenderId === me.id ? "You: " : group.lastSenderName ? `${group.lastSenderName}: ` : ""}${formatPreviewMessageText(group.lastMessage)}`
                          ) : (
                            `${group.memberCount} members`
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
            {sortedFriends.length === 0 && friends.length > 0 && (
              <div className="empty-box">
                <p>{showArchived ? "No archived chats." : "No chats match your search."}</p>
              </div>
            )}
            {friends.length === 0 && (
              <div className="empty-box">
                <p>
                  <UserPlusIcon size={18} style={{ color: "var(--accent)" }} /> No friends yet
                </p>
                <p className="muted small">
                  Head to <strong>Add</strong> and add someone by their username. Once they accept,
                  you can start texting!
                </p>
                <button className="primary-btn" onClick={() => setTab("add")}>
                  Add a friend
                </button>
              </div>
            )}
            {sortedFriends.map((friend) => {
              const preview = previewByFriend.get(friend.id);
              const dmDraft = draftsMap[`dm:${friend.id}`];
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
                    status={
                      store.friendActivities.find((activity) => activity.userId === friend.id)
                        ?.status
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenProfile(friend);
                    }}
                  />
                  <div className="friend-row-text">
                    <div className="friend-row-top">
                      <strong>{friend.displayName}</strong>
                      <span className="friend-row-badges">
                        {preview?.isArchived && (
                          <span title="Archived">
                            <ArchiveIcon size={13} />
                          </span>
                        )}
                        {preview?.isMuted && (
                          <span title="Muted">
                            <BellOffIcon size={13} />
                          </span>
                        )}
                        {preview?.createdAt ? (
                          <span className="muted small">{fmtTime(preview.createdAt)}</span>
                        ) : null}
                      </span>
                    </div>
                    <span className="muted small friend-preview">
                      {dmDraft ? (
                        <>
                          <span className="draft-pill">Draft:</span> {dmDraft}
                        </>
                      ) : preview?.createdAt ? (
                        `${preview.senderId === me.id ? "You: " : ""}${formatPreviewMessageText(preview.body)}`
                      ) : (
                        `@${friend.username} — say hi!`
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "calls" && (
        <div className="sidebar-tab-pane calls-tab-pane" key="pane-calls">
          {combinedCalls.length === 0 ? (
            <div className="empty-box">
              <p>
                <Phone size={18} /> No calls yet
              </p>
              <p className="muted small">
                Start a voice or video call with a friend or group — your incoming and outgoing call
                history will show right here.
              </p>
            </div>
          ) : (
            <div className="calls-history-list">
              {combinedCalls.map((entry) => {
                const liveFriend = entry.kind === "dm" ? friendById.get(entry.peerId) : undefined;
                const liveGroup =
                  entry.kind === "group"
                    ? store.groups.find((g) => g.id === (entry.groupId ?? entry.peerId))
                    : undefined;
                const callPeerUser: JaUser = liveFriend ?? {
                  id: entry.peerId,
                  displayName: entry.peerDisplayName,
                  username: entry.peerUsername,
                  bio: "",
                  pronouns: "",
                  avatarColor: entry.peerAvatarColor || "purple",
                  avatarUrl: entry.peerAvatarUrl,
                  onboardingComplete: true,
                };
                const isMissed = entry.state === "missed" || entry.state === "declined";
                const dirLabel = entry.direction === "outgoing" ? "Outgoing" : "Incoming";
                const isLiveNow =
                  session?.callId === entry.callId || groupSession?.callId === entry.callId;
                const stateLabel =
                  entry.state === "missed"
                    ? "Missed"
                    : entry.state === "declined"
                      ? "Declined"
                      : isLiveNow
                        ? "In call"
                        : entry.durationSec
                          ? formatCallDuration(entry.durationSec)
                          : entry.kind === "group"
                            ? "GC VC Ended"
                            : "Ended";

                return (
                  <div
                    key={entry.callId}
                    className="call-history-row"
                    onClick={() => {
                      if (entry.kind === "group" && liveGroup) {
                        store.setActiveGroupId(liveGroup.id);
                      } else if (liveFriend) {
                        setActiveChatId(liveFriend.id);
                      }
                    }}
                  >
                    {entry.kind === "group" ? (
                      liveGroup?.avatarUrl || entry.groupAvatarUrl ? (
                        <img
                          className="group-avatar sidebar-group-avatar"
                          src={liveGroup?.avatarUrl ?? entry.groupAvatarUrl}
                          alt=""
                        />
                      ) : (
                        <div className="group-avatar sidebar-group-avatar group-avatar-fallback">
                          <UsersIcon size={20} />
                        </div>
                      )
                    ) : (
                      <Avatar
                        user={callPeerUser}
                        size={46}
                        status={
                          store.friendActivities.find((a) => a.userId === callPeerUser.id)?.status
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenProfile(callPeerUser);
                        }}
                      />
                    )}

                    <div className="call-history-info">
                      <div className="call-history-name-line">
                        <strong>{entry.peerDisplayName}</strong>
                        <span className="muted small call-history-time">{fmtTime(entry.timestamp)}</span>
                      </div>
                      <div className="call-history-handle">
                        {entry.kind === "group" ? "Group call" : `@${entry.peerUsername}`}
                      </div>
                      <div className={`call-history-sub ${isMissed ? "missed" : ""}`}>
                        <span className={`call-dir-badge ${isMissed ? "missed" : entry.direction}`}>
                          {entry.direction === "outgoing" ? (
                            <ArrowUpRightIcon size={12} />
                          ) : (
                            <ArrowDownLeftIcon size={12} />
                          )}{" "}
                          {dirLabel}
                        </span>
                        <span className="call-history-state-copy">
                          · {entry.mode === "video" ? "Video" : "Voice"} · {stateLabel}
                        </span>
                      </div>
                    </div>

                    <div className="call-history-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="icon-btn call-back-btn"
                        title={`Voice call ${entry.peerDisplayName}`}
                        aria-label={`Voice call ${entry.peerDisplayName}`}
                        onClick={() => {
                          if (entry.kind === "group" && liveGroup) {
                            void startGroupCall(liveGroup, "voice");
                          } else if (liveFriend) {
                            void startCall(liveFriend, "voice");
                          }
                        }}
                      >
                        <Phone size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn call-back-btn video"
                        title={`Video call ${entry.peerDisplayName}`}
                        aria-label={`Video call ${entry.peerDisplayName}`}
                        onClick={() => {
                          if (entry.kind === "group" && liveGroup) {
                            void startGroupCall(liveGroup, "video");
                          } else if (liveFriend) {
                            void startCall(liveFriend, "video");
                          }
                        }}
                      >
                        <Video size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "add" && (
        <div className="add-panel sidebar-tab-pane" key="pane-add">
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
          {addMsg && <div className={addMsg.ok ? "success-box" : "error-box"}>{addMsg.text}</div>}

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
              >
                Add group chat…
              </button>
            </div>
            {store.groups.length === 0 ? (
              <p className="muted small">
                Create a group with people you&apos;re already friends with.
              </p>
            ) : (
              store.groups.map((group) => (
                <button
                  type="button"
                  className="group-add-row"
                  key={group.id}
                  onClick={() => store.setActiveGroupId(group.id)}
                >
                  <span>
                    {group.avatarUrl ? (
                      <img
                        className="group-avatar sidebar-group-avatar"
                        src={group.avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        decoding="async"
                        loading="lazy"
                      />
                    ) : (
                      <UsersIcon size={18} />
                    )}
                  </span>
                  <span>
                    <strong>{group.name}</strong>
                    <small className="muted">{group.memberCount} members</small>
                  </span>
                </button>
              ))
            )}
          </section>

          {store.mode === "demo" && (
            <div className="hint-box">
              <FlaskIcon size={14} /> <strong>Demo tip:</strong> try adding <code>@maya</code>,{" "}
              <code>@kai.codes</code> or <code>@Nova</code> — they accept after a couple of seconds
              and will text you back.
            </div>
          )}

          {showGroupDialog && (
            <AnimatedModal
              onClose={() => setShowGroupDialog(false)}
              cardClassName="modal-card create-group-dialog"
              closeLabel="Close"
            >
              {(requestClose) => (
                <>
                  <h2>Create group chat</h2>
                  <p className="muted small">
                    You can add people you&apos;re already friends with.
                  </p>
                  <label>
                    Group name
                    <input
                      value={groupName}
                      maxLength={60}
                      onChange={(event) => setGroupName(event.target.value)}
                    />
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
                        <Avatar user={friend} size={32} />
                        <span>
                          <strong>{friend.displayName}</strong>{" "}
                          <span className="muted small">@{friend.username}</span>
                        </span>
                      </label>
                    ))}
                    {friends.length === 0 && (
                      <p className="muted small">
                        Add and accept a friend before creating a group.
                      </p>
                    )}
                  </div>
                  {groupError && (
                    <div className="error-box" role="alert">
                      {groupError}
                    </div>
                  )}
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={groupBusy || !groupName.trim() || groupMemberIds.length === 0}
                    onClick={() => {
                      setGroupBusy(true);
                      setGroupError(null);
                      void store
                        .createGroup(groupName, groupMemberIds)
                        .then((id) => {
                          requestClose();
                          store.setActiveGroupId(id);
                        })
                        .catch((error: unknown) => {
                          setGroupError(friendlyError(error, "Could not create the group."));
                        })
                        .finally(() => setGroupBusy(false));
                    }}
                  >
                    {groupBusy ? "Creating…" : "Create group"}
                  </button>
                </>
              )}
            </AnimatedModal>
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
                  <span className="pending-chip">
                    <ClockIcon size={13} /> Pending
                  </span>
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
          <FlaskIcon size={13} /> Demo mode — connect Convex to go live
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
            <span>
              <ArchiveIcon size={15} />
            </span>
            {previewByFriend.get(chatMenu.friend.id)?.isArchived ? "Unarchive" : "Archive chat"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              void updateChat(previewByFriend.get(chatMenu.friend.id)?.isMuted ? "unmute" : "mute")
            }
          >
            <span>
              {previewByFriend.get(chatMenu.friend.id)?.isMuted ? (
                <BellIcon size={15} />
              ) : (
                <BellOffIcon size={15} />
              )}
            </span>
            {previewByFriend.get(chatMenu.friend.id)?.isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="destructive-menu-item"
            onClick={() => void updateChat("unfriend")}
          >
            <span>
              <UserMinusIcon size={15} />
            </span>{" "}
            Unfriend
          </button>
          <button
            type="button"
            role="menuitem"
            className={
              store.blockedUserIds.includes(chatMenu.friend.id) ? "" : "destructive-menu-item"
            }
            onClick={() =>
              void updateChat(
                store.blockedUserIds.includes(chatMenu.friend.id) ? "unblock" : "block",
              )
            }
          >
            <span>
              {store.blockedUserIds.includes(chatMenu.friend.id) ? (
                <UnlockIcon size={15} />
              ) : (
                <BanIcon size={15} />
              )}
            </span>
            {store.blockedUserIds.includes(chatMenu.friend.id) ? "Unblock" : "Block"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="destructive-menu-item"
            onClick={() => void updateChat("delete")}
          >
            <span>
              <TrashIcon size={15} />
            </span>{" "}
            Delete chat
          </button>
        </ContextMenu>
      )}
    </aside>
  );
}
