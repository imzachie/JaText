import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";
import { Avatar } from "./Avatar";
import type { CommunityMessage } from "../lib/types";

function PollOption({
  message,
  option,
  index,
  count,
  totalVotes,
  percentage,
  showResults,
  onVote,
}: {
  message: CommunityMessage;
  option: string;
  index: number;
  count: number;
  totalVotes: number;
  percentage: number;
  showResults: boolean;
  onVote: (pollId: string, optionIndex: number) => void;
}) {
  const [animatedPercent, setAnimatedPercent] = useState(0);
  useEffect(() => {
    if (!showResults) return;
    const frame = window.requestAnimationFrame(() => setAnimatedPercent(percentage));
    return () => window.cancelAnimationFrame(frame);
  }, [showResults, percentage]);

  return (
    <button
      type="button"
      className={`community-poll-option ${message.myVote === index ? "selected" : ""} ${showResults ? "show-results" : ""}`}
      disabled={!!message.pollEndedAt}
      onClick={() => onVote(message.id, index)}
    >
      {showResults && (
        <span
          className="community-poll-option-fill"
          aria-hidden="true"
          style={{ width: `${showResults ? animatedPercent : 0}%` }}
        />
      )}
      <span className="community-poll-option-label">{option}</span>
      {showResults && (
        <span className="community-poll-option-result">
          {percentage}% · {count} vote{count === 1 ? "" : "s"}
        </span>
      )}
      {!showResults && totalVotes > 0 && (
        <span className="community-poll-option-result muted">{count} vote{count === 1 ? "" : "s"}</span>
      )}
    </button>
  );
}

function CommunityVoterDialog({
  poll,
  onClose,
}: {
  poll: CommunityMessage;
  onClose: () => void;
}) {
  const voterQuery = useQuery(api.community.voters, {
    pollId: poll.id as Id<"communityMessages">,
  });
  const voters = voterQuery ?? [];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal-card community-voters-dialog"
        aria-label={`Voters for ${poll.body}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close voter list">×</button>
        <h2>Who voted</h2>
        <p className="muted small">{poll.body}</p>
        <div className="community-voter-options">
          {poll.pollOptions.map((option, optionIndex) => {
            const optionVoters = voters.filter((vote) => vote.optionIndex === optionIndex);
            return (
              <section className="community-voter-option" key={`${poll.id}-voters-${optionIndex}`}>
                <h3>Option {optionIndex + 1}: {option} <span className="muted">({optionVoters.length})</span></h3>
                {voterQuery === undefined ? (
                  <p className="muted small">Loading voters…</p>
                ) : optionVoters.length > 0 ? (
                  <div className="community-voter-list">
                    {optionVoters.map((voter) => (
                      <div className="community-voter" key={voter.userId}>
                        <Avatar
                          user={{
                            displayName: voter.displayName,
                            username: voter.username,
                            avatarColor: voter.avatarColor,
                            avatarUrl: voter.avatarUrl,
                          }}
                          size={36}
                        />
                        <span>
                          <strong>{voter.displayName || voter.username}</strong>
                          <small className="muted">@{voter.username}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">No votes yet.</p>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function CommunityChatView({ onBack }: { onBack: () => void }) {
  const store = useJaText();
  const [draft, setDraft] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [showPoll, setShowPoll] = useState(false);
  const [showModerators, setShowModerators] = useState(false);
  const [selectedModerators, setSelectedModerators] = useState<string[]>([]);
  const [directorySearchOpen, setDirectorySearchOpen] = useState(false);
  const [directorySearch, setDirectorySearch] = useState("");
  const [editingMessage, setEditingMessage] = useState<{ id: string; body: string } | null>(null);
  const [voterPollId, setVoterPollId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesElement = useRef<HTMLDivElement>(null);
  const directorySearchInput = useRef<HTMLInputElement>(null);
  const wasPinnedRef = useRef(true);
  const lastMessageId = store.communityMessages.at(-1)?.id;
  const voterPoll = store.communityMessages.find((message) => message.id === voterPollId);
  const filteredDirectory = store.communityDirectory
    .map((person, index) => ({ person, index }))
    .filter(({ person }) => {
      const search = directorySearch.trim().toLowerCase();
      return (
        !search ||
        person.displayName.toLowerCase().includes(search) ||
        person.username.toLowerCase().includes(search)
      );
    });

  useEffect(() => {
    const element = messagesElement.current;
    if (element && wasPinnedRef.current) element.scrollTop = element.scrollHeight;
  }, [lastMessageId]);

  async function sendText(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.sendCommunityText(draft);
      setDraft("");
    } catch (cause) {
      setError(friendlyError(cause, "Could not post to the community."));
    } finally {
      setBusy(false);
    }
  }

  async function sendPoll(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.createCommunityPoll(pollQuestion, pollOptions);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setShowPoll(false);
    } catch (cause) {
      setError(friendlyError(cause, "Could not create the poll."));
    } finally {
      setBusy(false);
    }
  }

  async function saveModerators() {
    setBusy(true);
    setError(null);
    try {
      await store.setCommunityModerators(selectedModerators);
      setShowModerators(false);
    } catch (cause) {
      setError(friendlyError(cause, "Could not update community moderators."));
    } finally {
      setBusy(false);
    }
  }

  async function vote(pollId: string, optionIndex: number) {
    try {
      await store.voteCommunityPoll(pollId, optionIndex);
    } catch (cause) {
      setError(friendlyError(cause, "Could not submit your vote."));
    }
  }

  async function endPoll(pollId: string) {
    try {
      await store.endCommunityPoll(pollId);
    } catch (cause) {
      setError(friendlyError(cause, "Could not end the poll."));
    }
  }

  async function saveAnnouncement(event: FormEvent) {
    event.preventDefault();
    if (!editingMessage || busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.editCommunityMessage(editingMessage.id, editingMessage.body);
      setEditingMessage(null);
    } catch (cause) {
      setError(friendlyError(cause, "Could not edit the announcement."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAnnouncement(messageId: string) {
    if (!window.confirm("Delete this community announcement?")) return;
    setError(null);
    try {
      await store.deleteCommunityMessage(messageId);
    } catch (cause) {
      setError(friendlyError(cause, "Could not delete the announcement."));
    }
  }

  return (
    <section className="chat community-chat">
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={onBack} aria-label="Back">←</button>
        <img className="community-mark" src="/jatext-logo-icon.png" alt="" />
        <div className="chat-title community-title">
          <strong>
            JaText Community <span className="verified-badge" title="Verified JaText account">✓</span>
          </strong>
          <span className="official-badge">Official</span>
        </div>
        {store.communityPermissions.isOwner && (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setSelectedModerators(store.communityPermissions.moderatorIds);
              setShowModerators(true);
            }}
          >
            Elect People …
          </button>
        )}
      </header>

      <div
        className="messages community-messages"
        ref={messagesElement}
        onScroll={(event) => {
          const element = event.currentTarget;
          wasPinnedRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
      >
        {store.communityMessages.length === 0 && (
          <div className="empty-box center">
            <strong>Welcome to the JaText Community</strong>
            <span className="muted">Official updates and polls will appear here.</span>
          </div>
        )}
        {store.communityMessages.map((message) => {
          const counts = message.pollOptions.map(
            (_, index) => message.votes.filter((vote) => vote.optionIndex === index).length,
          );
          const totalVotes = counts.reduce((total, count) => total + count, 0);
          const canManagePost =
            store.communityPermissions.canModerate &&
            (store.communityPermissions.isOwner || message.senderId === store.me?.id);
          const showResults = !!message.pollEndedAt || message.myVote !== undefined;
          return (
            <article className="community-post" key={message.id}>
              <div className="community-post-header">
                <Avatar
                  user={{
                    displayName: message.senderName || "JaText",
                    username: message.senderUsername,
                    avatarColor: message.senderAvatarColor,
                    avatarUrl: message.senderAvatarUrl,
                  }}
                  size={32}
                />
                <strong>{message.senderName || "JaText"}</strong>
                <span className="verified-badge" title="Verified">✓</span>
                <span className="official-badge">Official</span>
                <time className="muted small">{new Date(message.createdAt).toLocaleString()}</time>
                {message.editedAt && <span className="muted small">Edited</span>}
              </div>
              {editingMessage?.id === message.id ? (
                <form className="community-announcement-edit" onSubmit={(event) => void saveAnnouncement(event)}>
                  <textarea
                    value={editingMessage.body}
                    maxLength={4000}
                    onChange={(event) =>
                      setEditingMessage((current) =>
                        current ? { ...current, body: event.target.value } : current,
                      )
                    }
                    aria-label="Edit announcement"
                    autoFocus
                  />
                  <div>
                    <button className="primary-btn" type="submit" disabled={busy || !editingMessage.body.trim()}>
                      Save
                    </button>
                    <button className="ghost-btn" type="button" onClick={() => setEditingMessage(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <p className="community-post-body">{message.body}</p>
              )}
              {(canManagePost || message.type === "poll") && (
                <div className="community-post-actions">
                  {message.type === "text" && editingMessage?.id !== message.id && (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setEditingMessage({ id: message.id, body: message.body })}
                    >
                      Edit announcement
                    </button>
                  )}
                  {message.type === "poll" && (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setVoterPollId(message.id)}
                    >View who voted</button>
                  )}
                  {canManagePost && (
                    <button
                      type="button"
                      className="ghost-btn destructive-menu-item"
                      onClick={() => void deleteAnnouncement(message.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
              {message.type === "poll" && (
                <div className="community-poll">
                  {message.pollOptions.map((option, index) => {
                    const percentage = totalVotes
                      ? Math.round((counts[index] / totalVotes) * 100)
                      : 0;
                    return (
                      <PollOption
                        key={`${message.id}-${index}`}
                        message={message}
                        option={option}
                        index={index}
                        count={counts[index]}
                        totalVotes={totalVotes}
                        percentage={percentage}
                        showResults={showResults}
                        onVote={(pollId, optionIndex) => void vote(pollId, optionIndex)}
                      />
                    );
                  })}
                  <div className="muted small">
                    {totalVotes} vote{totalVotes === 1 ? "" : "s"}
                    {message.pollEndedAt
                      ? " · Poll ended"
                      : message.myVote !== undefined
                        ? " · Your vote is counted"
                        : " · Select an option to vote"}
                  </div>
                  {store.communityPermissions.isOwner && !message.pollEndedAt && (
                    <button className="ghost-btn" type="button" onClick={() => void endPoll(message.id)}>
                      End poll
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {error && <div className="error-box community-error" role="alert">{error}</div>}
      {store.communityPermissions.canModerate ? (
        <>
          {showPoll && (
            <form className="community-poll-form" onSubmit={(event) => void sendPoll(event)}>
              <input
                value={pollQuestion}
                maxLength={300}
                onChange={(event) => setPollQuestion(event.target.value)}
                placeholder="Ask a poll question"
                aria-label="Poll question"
              />
              {pollOptions.map((option, index) => (
                <div className="community-poll-edit-option" key={index}>
                  <input
                    value={option}
                    maxLength={120}
                    onChange={(event) =>
                      setPollOptions((current) =>
                        current.map((value, optionIndex) =>
                          optionIndex === index ? event.target.value : value,
                        ),
                      )
                    }
                    placeholder={`Option ${index + 1}`}
                    aria-label={`Poll option ${index + 1}`}
                  />
                  {pollOptions.length > 1 && (
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => setPollOptions((current) => current.filter((_, i) => i !== index))}
                      aria-label={`Remove option ${index + 1}`}
                    >×</button>
                  )}
                </div>
              ))}
              <div className="community-poll-form-actions">
                {pollOptions.length < 6 && (
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => setPollOptions((current) => [...current, ""])}
                  >Add option</button>
                )}
                <button type="submit" className="primary-btn" disabled={busy}>Post poll</button>
                <button type="button" className="ghost-btn" onClick={() => setShowPoll(false)}>Cancel</button>
              </div>
            </form>
          )}
          <form className="composer community-composer" onSubmit={(event) => void sendText(event)}>
            <textarea
              value={draft}
              maxLength={4000}
              onChange={(event) => setDraft(event.target.value)}
              rows={1}
              placeholder="Post an official community message…"
              aria-label="Community message"
            />
            <button type="button" className="ghost-btn" onClick={() => setShowPoll((open) => !open)}>
              Create poll
            </button>
            <button type="submit" className="send-btn" disabled={busy || !draft.trim()}>➤</button>
          </form>
        </>
      ) : (
        <div className="community-readonly">Only JaText community moderators can post here.</div>
      )}

      {showModerators && (
        <div className="modal-backdrop" onClick={() => setShowModerators(false)}>
          <section className="modal-card community-moderator-dialog" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModerators(false)} aria-label="Close">×</button>
            <h2>Elect People …</h2>
            <p className="muted small">Accounts are shown from oldest to newest. Selected people can post messages and polls.</p>
            <div className="community-directory-search-row">
              {directorySearchOpen && (
                <input
                  ref={directorySearchInput}
                  className="search-input community-directory-search"
                  value={directorySearch}
                  onChange={(event) => setDirectorySearch(event.target.value)}
                  placeholder="Search people…"
                  aria-label="Search registered people"
                  autoFocus
                />
              )}
              <button
                type="button"
                className="icon-btn community-directory-search-toggle"
                aria-label={directorySearchOpen ? "Close people search" : "Search registered people"}
                title={directorySearchOpen ? "Close search" : "Search people"}
                onClick={() => {
                  setDirectorySearchOpen((open) => !open);
                  if (directorySearchOpen) setDirectorySearch("");
                  else window.setTimeout(() => directorySearchInput.current?.focus(), 0);
                }}
              >
                {directorySearchOpen ? "×" : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="10.8" cy="10.8" r="6.8" />
                    <path d="m16 16 5 5" />
                  </svg>
                )}
              </button>
            </div>
            <div className="community-directory">
              {filteredDirectory.map(({ person, index }) => (
                <label className="community-directory-person" key={person.id}>
                  <input
                    type="checkbox"
                    checked={selectedModerators.includes(person.id)}
                    disabled={person.username === "imzachie"}
                    onChange={(event) =>
                      setSelectedModerators((current) =>
                        event.target.checked
                          ? [...current, person.id]
                          : current.filter((id) => id !== person.id),
                      )
                    }
                  />
                  <Avatar
                    user={{
                      displayName: person.displayName,
                      username: person.username,
                      avatarColor: person.avatarColor,
                      avatarUrl: person.avatarUrl,
                    }}
                    size={34}
                  />
                  <span>{index + 1}. <strong>{person.displayName}</strong> @{person.username}</span>
                  <time className="muted small">{new Date(person.createdAt).toLocaleDateString()}</time>
                </label>
              ))}
              {filteredDirectory.length === 0 && (
                <p className="muted">
                  {store.communityDirectory.length === 0
                    ? "No registered usernames were found."
                    : "No accounts match your search."}
                </p>
              )}
            </div>
            <button className="primary-btn" disabled={busy} onClick={() => void saveModerators()}>
              Save moderators
            </button>
          </section>
        </div>
      )}
      {voterPoll && store.mode === "convex" && (
        <CommunityVoterDialog poll={voterPoll} onClose={() => setVoterPollId(null)} />
      )}
    </section>
  );
}
