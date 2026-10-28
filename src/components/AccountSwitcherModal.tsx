import { useMemo } from "react";
import {
  beginAddAnotherAccount,
  removeSavedAccountSlot,
  switchToAccountSlot,
  useMultiAccountState,
  type SavedAccountEntry,
} from "../lib/accountManager";
import { useCall } from "../lib/calling";
import { useGroupCall } from "../lib/groupCalling";
import { useJaText } from "../lib/store";
import type { JaUser } from "../lib/types";
import { AnimatedModal } from "./AnimatedModal";
import { Avatar } from "./Avatar";
import {
  CheckCircleIcon,
  LogOutIcon,
  SwitchAccountIcon,
  TrashIcon,
  UserPlusIcon,
} from "./UiIcons";

function entryToAvatarUser(entry: SavedAccountEntry): JaUser {
  return {
    id: entry.userId,
    displayName: entry.displayName || entry.username || "JaText User",
    username: entry.username || "user",
    bio: "",
    pronouns: "",
    avatarColor: entry.avatarColor,
    avatarUrl: entry.avatarUrl,
    statusPreference: entry.statusPreference,
    onboardingComplete: true,
  };
}

export function AccountSwitcherModal({ onClose }: { onClose: () => void }) {
  const { me, signOut } = useJaText();
  const { session: callSession, endCall } = useCall();
  const { groupSession: groupCallSession, leaveGroupCall } = useGroupCall();
  const { activeSlotId, accounts } = useMultiAccountState();
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

  const sortedAccounts = useMemo(() => {
    const list = [...accounts];
    if (me && !list.some((a) => a.userId === me.id)) {
      list.unshift({
        slotId: activeSlotId,
        userId: me.id,
        username: me.username,
        displayName: me.displayName,
        email: me.email,
        avatarUrl: me.avatarUrl,
        avatarColor: me.avatarColor,
        statusPreference: me.statusPreference,
        lastUsedAt: Number.MAX_SAFE_INTEGER,
      });
    }
    return list.sort((a, b) => {
      const aActive = a.slotId === activeSlotId || a.userId === me?.id ? 1 : 0;
      const bActive = b.slotId === activeSlotId || b.userId === me?.id ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return b.lastUsedAt - a.lastUsedAt;
    });
  }, [accounts, activeSlotId, me]);

  async function stopAnyActiveCall() {
    if (callSession) {
      await endCall().catch(() => undefined);
    }
    if (groupCallSession) {
      await leaveGroupCall().catch(() => undefined);
    }
  }

  return (
    <AnimatedModal
      onClose={onClose}
      cardClassName="modal-card account-switcher-card"
      closeLabel="Close account switcher"
    >
      {(requestClose) => (
        <div className="account-switcher-body">
          <div className="account-switcher-header">
            <span className="account-switcher-icon" aria-hidden="true">
              <SwitchAccountIcon size={20} />
            </span>
            <div>
              <h2>Switch accounts</h2>
              <p className="muted small">
                Tap any saved account to switch instantly without signing out.
              </p>
            </div>
          </div>

          <div className="account-switcher-list" role="listbox" aria-label="Saved accounts">
            {sortedAccounts.map((acct) => {
              const isCurrent = acct.slotId === activeSlotId || acct.userId === me?.id;
              const liveUser = isCurrent && me ? me : entryToAvatarUser(acct);
              const statusDot =
                liveUser.statusPreference === "offline"
                  ? "offline"
                  : liveUser.statusPreference === "dnd"
                    ? "dnd"
                    : isCurrent
                      ? "online"
                      : undefined;

              return (
                <div
                  key={acct.slotId}
                  className={`account-switcher-row ${isCurrent ? "active" : ""}`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    className="account-switcher-select-btn"
                    onClick={async () => {
                      if (isCurrent) {
                        requestClose();
                        return;
                      }
                      await stopAnyActiveCall();
                      requestClose();
                      window.setTimeout(() => {
                        void switchToAccountSlot(acct.slotId, convexUrl);
                      }, 90);
                    }}
                  >
                    <Avatar user={liveUser} size={44} status={statusDot} />
                    <div className="account-switcher-meta">
                      <div className="account-switcher-name-row">
                        <strong>{liveUser.displayName || "JaText User"}</strong>
                        {isCurrent && <span className="account-active-pill">Active</span>}
                      </div>
                      <span className="muted small account-switcher-sub">
                        {liveUser.username ? `@${liveUser.username}` : "Completing setup"}
                        {acct.email ? ` · ${acct.email}` : ""}
                      </span>
                    </div>
                    {isCurrent ? (
                      <span className="account-switcher-check" aria-hidden="true">
                        <CheckCircleIcon size={18} />
                      </span>
                    ) : (
                      <span className="account-switcher-switch-hint">Switch</span>
                    )}
                  </button>

                  {!isCurrent && (
                    <button
                      type="button"
                      className="icon-btn account-switcher-remove-btn"
                      title={`Remove @${acct.username || acct.displayName} from this device`}
                      aria-label={`Remove ${acct.displayName || acct.username} from this device`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void removeSavedAccountSlot(acct.slotId, convexUrl);
                      }}
                    >
                      <TrashIcon size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="account-switcher-actions">
            <button
              type="button"
              className="primary-btn account-switcher-add-btn"
              onClick={async () => {
                await stopAnyActiveCall();
                requestClose();
                window.setTimeout(() => {
                  beginAddAnotherAccount();
                }, 90);
              }}
            >
              <UserPlusIcon size={16} />
              <span>Add another account</span>
            </button>

            {me && (
              <button
                type="button"
                className="ghost-btn account-switcher-signout-btn"
                onClick={async () => {
                  await stopAnyActiveCall();
                  requestClose();
                  void signOut();
                }}
              >
                <LogOutIcon size={15} />
                <span>
                  {sortedAccounts.length > 1
                    ? `Sign out of @${me.username || me.displayName}`
                    : "Sign out"}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </AnimatedModal>
  );
}
