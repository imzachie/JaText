import { useCallback, useEffect, useState } from "react";
import type { JaUser } from "../lib/types";
import { tursoRpc } from "../lib/tursoClient";
import { Avatar } from "./Avatar";
import {
  CheckCircleIcon,
  EditIcon,
  SearchIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "./UiIcons";

const OWNER_EMAIL = "aidilzafri2013@gmail.com";
const OWNER_USERNAME = "imzachie";

export function isAuthorizedJaTextOwner(user?: JaUser | null): boolean {
  if (!user) return false;
  if (user.isOwner === true) return true;
  const email = (user.email ?? "").trim().toLowerCase();
  const username = (user.username ?? "").trim().replace(/^@+/, "").toLowerCase();
  return email === OWNER_EMAIL || username === OWNER_USERNAME;
}

interface OwnerPlatformStats {
  totalUsers: number;
  onlineUsers: number;
  suspendedUsers: number;
  totalMessages: number;
  totalGroups: number;
  totalCommunityPosts: number;
  linkedDevices: number;
}

interface OwnerManagedUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarColor: JaUser["avatarColor"];
  avatarUrl?: string;
  bannerUrl?: string;
  bio: string;
  customStatus: string;
  isSuspended: boolean;
  totpEnabled: boolean;
  isOwner: boolean;
  createdAt: number;
}

interface OwnerOverviewResponse {
  stats?: OwnerPlatformStats;
  users?: OwnerManagedUser[];
  ok?: boolean;
  user?: OwnerManagedUser;
  deletedUserId?: string;
}

export function OwnerSettingsPanel({ currentUser }: { currentUser: JaUser }) {
  const [query, setQuery] = useState("");
  const [stats, setStats] = useState<OwnerPlatformStats | null>(null);
  const [users, setUsers] = useState<OwnerManagedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [usernameDraft, setUsernameDraft] = useState("");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [broadcastDraft, setBroadcastDraft] = useState("");

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  const loadDirectory = useCallback(
    async (searchText: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await tursoRpc<OwnerOverviewResponse>("ownerAdminAction", {
          subOp: searchText.trim() ? "searchUsers" : "overview",
          query: searchText.trim(),
        });
        if (res.stats) setStats(res.stats);
        if (Array.isArray(res.users)) {
          setUsers(res.users);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load Owner console.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadDirectory("");
  }, [loadDirectory]);

  useEffect(() => {
    if (!selectedUser) {
      setUsernameDraft("");
      setDisplayNameDraft("");
      setDeleteConfirmText("");
      return;
    }
    setUsernameDraft(selectedUser.username);
    setDisplayNameDraft(selectedUser.displayName);
    setDeleteConfirmText("");
  }, [selectedUser]);

  if (!isAuthorizedJaTextOwner(currentUser)) {
    return (
      <div className="error-box">
        Owner authorization required. This panel is restricted to @imzachie.
      </div>
    );
  }

  async function runAction(
    key: string,
    payload: Record<string, unknown>,
    successMsg: string,
  ) {
    setActionBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await tursoRpc<OwnerOverviewResponse>("ownerAdminAction", payload);
      if (res.user) {
        const updated = res.user;
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      }
      if (res.deletedUserId) {
        setUsers((prev) => prev.filter((u) => u.id !== res.deletedUserId));
        setSelectedUserId(null);
      }
      setNotice(successMsg);
      void loadDirectory(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Owner action failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function postAnnouncement() {
    const body = broadcastDraft.trim();
    if (!body) return;
    setActionBusy("broadcast");
    setError(null);
    setNotice(null);
    try {
      await tursoRpc("ownerAdminAction", {
        subOp: "broadcastCommunity",
        body,
      });
      setBroadcastDraft("");
      setNotice("Published announcement to JaText Community.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish announcement.");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="owner-admin-root">
      <div className="owner-danger-banner">
        <div className="owner-danger-banner-title">
          <ShieldCheckIcon size={17} />
          <strong>Verified Owner Console (@{currentUser.username})</strong>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Dangerous administrative actions execute immediately on the live Turso database across
          all mobile and desktop sessions.
        </p>
      </div>

      {error && <div className="error-box">{error}</div>}
      {notice && (
        <div className="success-box">
          <CheckCircleIcon size={15} /> {notice}
        </div>
      )}

      {stats && (
        <div className="owner-stats-grid">
          <div className="owner-stat-card">
            <span>Accounts</span>
            <strong>{stats.totalUsers}</strong>
          </div>
          <div className="owner-stat-card">
            <span>Online now</span>
            <strong>{stats.onlineUsers}</strong>
          </div>
          <div className="owner-stat-card">
            <span>Suspended</span>
            <strong>{stats.suspendedUsers}</strong>
          </div>
          <div className="owner-stat-card">
            <span>DM Messages</span>
            <strong>{stats.totalMessages}</strong>
          </div>
          <div className="owner-stat-card">
            <span>Groups</span>
            <strong>{stats.totalGroups}</strong>
          </div>
          <div className="owner-stat-card">
            <span>Linked Web</span>
            <strong>{stats.linkedDevices}</strong>
          </div>
        </div>
      )}

      <div className="owner-section-card">
        <div className="owner-section-head">
          <h4>Quick Community Broadcast</h4>
        </div>
        <div className="owner-inline-row">
          <input
            type="text"
            className="search-input"
            placeholder="Write an official JaText Community announcement..."
            value={broadcastDraft}
            onChange={(e) => setBroadcastDraft(e.target.value)}
          />
          <button
            type="button"
            className="primary-btn"
            disabled={!broadcastDraft.trim() || actionBusy !== null}
            onClick={() => void postAnnouncement()}
          >
            {actionBusy === "broadcast" ? "Posting..." : "Post"}
          </button>
        </div>
      </div>

      <div className="owner-section-card">
        <div className="owner-section-head">
          <h4>Account Directory &amp; Enforcement</h4>
          <button
            type="button"
            className="mini-btn"
            disabled={loading}
            onClick={() => void loadDirectory(query)}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <form
          className="owner-inline-row"
          onSubmit={(e) => {
            e.preventDefault();
            void loadDirectory(query);
          }}
        >
          <div className="ios-always-search-shell" style={{ flex: 1, margin: 0 }}>
            <span className="always-search-icon" aria-hidden="true">
              <SearchIcon size={15} />
            </span>
            <input
              type="search"
              className="search-input always-search-input"
              placeholder="Search by @username, email, display name, or user ID..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button type="submit" className="ghost-btn" disabled={loading}>
            Search
          </button>
        </form>

        <div className="owner-user-list">
          {users.map((u) => {
            const active = u.id === selectedUserId;
            return (
              <button
                type="button"
                key={u.id}
                className={`owner-user-row ${active ? "active" : ""} ${
                  u.isSuspended ? "suspended" : ""
                }`}
                onClick={() => setSelectedUserId(active ? null : u.id)}
              >
                <Avatar
                  user={{
                    username: u.username,
                    displayName: u.displayName || u.username,
                    avatarColor: u.avatarColor,
                    avatarUrl: u.avatarUrl,
                  }}
                  size={38}
                />
                <div className="owner-user-row-meta">
                  <div className="owner-user-row-top">
                    <strong>{u.displayName || u.username}</strong>
                    {u.isOwner && <span className="owner-pill owner">OWNER</span>}
                    {u.isSuspended && <span className="owner-pill danger">SUSPENDED</span>}
                    {u.totpEnabled && <span className="owner-pill">2FA</span>}
                  </div>
                  <span className="muted small">
                    @{u.username} {u.email ? `· ${u.email}` : ""}
                  </span>
                </div>
              </button>
            );
          })}
          {!loading && users.length === 0 && (
            <p className="muted small" style={{ margin: "8px 0 0" }}>
              No matching accounts found.
            </p>
          )}
        </div>
      </div>

      {selectedUser && (
        <div className="owner-section-card owner-target-card">
          <div className="owner-section-head">
            <div>
              <h4>
                Managing @{selectedUser.username}{" "}
                {selectedUser.isSuspended ? "(Suspended)" : ""}
              </h4>
              <span className="muted small">
                ID: <code>{selectedUser.id}</code>
                {selectedUser.email ? ` · ${selectedUser.email}` : ""}
              </span>
            </div>
          </div>

          <div className="owner-control-group">
            <label className="small muted">Force-change username (bypasses 14-day cooldown)</label>
            <div className="owner-inline-row">
              <input
                type="text"
                className="search-input"
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(e.target.value)}
                placeholder="new_username"
              />
              <button
                type="button"
                className="primary-btn"
                disabled={
                  actionBusy !== null ||
                  !usernameDraft.trim() ||
                  usernameDraft.trim().replace(/^@+/, "").toLowerCase() ===
                    selectedUser.username.toLowerCase()
                }
                onClick={() =>
                  void runAction(
                    "username",
                    {
                      subOp: "forceChangeUsername",
                      targetUserId: selectedUser.id,
                      newUsername: usernameDraft.trim(),
                    },
                    `Changed username to @${usernameDraft.trim().replace(/^@+/, "").toLowerCase()}.`,
                  )
                }
              >
                <EditIcon size={14} /> Change Username
              </button>
            </div>
          </div>

          <div className="owner-control-group">
            <label className="small muted">Force-update display name</label>
            <div className="owner-inline-row">
              <input
                type="text"
                className="search-input"
                value={displayNameDraft}
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                placeholder="Display name"
              />
              <button
                type="button"
                className="ghost-btn"
                disabled={actionBusy !== null}
                onClick={() =>
                  void runAction(
                    "displayName",
                    {
                      subOp: "forceUpdateProfile",
                      targetUserId: selectedUser.id,
                      displayName: displayNameDraft.trim(),
                    },
                    `Updated display name for @${selectedUser.username}.`,
                  )
                }
              >
                Save Name
              </button>
            </div>
          </div>

          <div className="owner-actions-grid">
            <button
              type="button"
              className="ghost-btn"
              disabled={actionBusy !== null}
              onClick={() =>
                void runAction(
                  "clearProfile",
                  {
                    subOp: "forceUpdateProfile",
                    targetUserId: selectedUser.id,
                    displayName: selectedUser.displayName,
                    clearBio: true,
                    clearAvatar: true,
                    clearBanner: true,
                    clearStatus: true,
                  },
                  `Cleared avatar, banner, bio & custom status for @${selectedUser.username}.`,
                )
              }
            >
              Wipe Avatar, Banner &amp; Bio
            </button>

            <button
              type="button"
              className="ghost-btn"
              disabled={actionBusy !== null}
              onClick={() =>
                void runAction(
                  "revokeSessions",
                  {
                    subOp: "revokeSessions",
                    targetUserId: selectedUser.id,
                  },
                  `Revoked all active sessions & linked devices for @${selectedUser.username}.`,
                )
              }
            >
              Force Sign-Out All Devices
            </button>

            <button
              type="button"
              className="ghost-btn"
              disabled={actionBusy !== null}
              onClick={() =>
                void runAction(
                  "resetSecurity",
                  {
                    subOp: "resetSecurity",
                    targetUserId: selectedUser.id,
                  },
                  `Reset 2FA & Passkeys for @${selectedUser.username}.`,
                )
              }
            >
              Reset 2FA &amp; Passkeys
            </button>

            {!selectedUser.isOwner && (
              <button
                type="button"
                className={selectedUser.isSuspended ? "primary-btn" : "danger-btn"}
                disabled={actionBusy !== null}
                onClick={() =>
                  void runAction(
                    "suspend",
                    {
                      subOp: "setSuspended",
                      targetUserId: selectedUser.id,
                      suspended: !selectedUser.isSuspended,
                    },
                    selectedUser.isSuspended
                      ? `Unsuspended @${selectedUser.username}.`
                      : `Suspended @${selectedUser.username} and revoked sessions.`,
                  )
                }
              >
                {selectedUser.isSuspended ? "Unsuspend Account" : "Suspend / Ban Account"}
              </button>
            )}

            <button
              type="button"
              className="danger-btn"
              disabled={actionBusy !== null}
              onClick={() => {
                if (
                  window.confirm(
                    `Permanently wipe ALL DM, Group, and Community messages sent by @${selectedUser.username}?`,
                  )
                ) {
                  void runAction(
                    "purgeMessages",
                    {
                      subOp: "purgeMessages",
                      targetUserId: selectedUser.id,
                    },
                    `Wiped all messages sent by @${selectedUser.username}.`,
                  );
                }
              }}
            >
              Wipe All User Messages
            </button>
          </div>

          {!selectedUser.isOwner && (
            <div className="owner-delete-zone">
              <strong>Permanently Delete Account</strong>
              <p className="muted small" style={{ margin: "4px 0 8px" }}>
                Type <code>{selectedUser.username}</code> below to permanently delete this account,
                its messages, friendships, passkeys, and linked sessions.
              </p>
              <div className="owner-inline-row">
                <input
                  type="text"
                  className="search-input"
                  placeholder={`Type ${selectedUser.username} to confirm`}
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                />
                <button
                  type="button"
                  className="danger-btn"
                  disabled={
                    actionBusy !== null ||
                    deleteConfirmText.trim().replace(/^@+/, "").toLowerCase() !==
                      selectedUser.username.toLowerCase()
                  }
                  onClick={() =>
                    void runAction(
                      "deleteAccount",
                      {
                        subOp: "deleteAccount",
                        targetUserId: selectedUser.id,
                      },
                      `Permanently deleted account @${selectedUser.username}.`,
                    )
                  }
                >
                  <TrashIcon size={14} /> Delete Account
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
