import { useEffect, useRef, useState, type FormEvent } from "react";
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";

export function CommunityChatView({ onBack }: { onBack: () => void }) {
  const store = useJaText();
  const [draft, setDraft] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [showPoll, setShowPoll] = useState(false);
  const [showModerators, setShowModerators] = useState(false);
  const [selectedModerators, setSelectedModerators] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesElement = useRef<HTMLDivElement>(null);
  const wasPinnedRef = useRef(true);
  const lastMessageId = store.communityMessages.at(-1)?.id;

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

  return (
    <section className="chat community-chat">
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={onBack} aria-label="Back">←</button>
        <div className="community-mark" aria-hidden="true">J</div>
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
          return (
            <article className="community-post" key={message.id}>
              <div className="community-post-header">
                <strong>{message.senderName || "JaText"}</strong>
                <span className="verified-badge" title="Verified">✓</span>
                <span className="official-badge">Official</span>
                <time className="muted small">{new Date(message.createdAt).toLocaleString()}</time>
              </div>
              <p className="community-post-body">{message.body}</p>
              {message.type === "poll" && (
                <div className="community-poll">
                  {message.pollOptions.map((option, index) => {
                    const percentage = totalVotes
                      ? Math.round((counts[index] / totalVotes) * 100)
                      : 0;
                    return (
                      <button
                        type="button"
                        key={`${message.id}-${index}`}
                        className={`community-poll-option ${message.myVote === index ? "selected" : ""}`}
                        disabled={!!message.pollEndedAt}
                        onClick={() => void vote(message.id, index)}
                      >
                        <span>{option}</span>
                        {message.pollEndedAt && (
                          <span>{percentage}% · {counts[index]} vote{counts[index] === 1 ? "" : "s"}</span>
                        )}
                      </button>
                    );
                  })}
                  <div className="muted small">
                    {totalVotes} vote{totalVotes === 1 ? "" : "s"}
                    {message.pollEndedAt ? " · Poll ended" : " · Select an option to vote"}
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
            <div className="community-directory">
              {store.communityDirectory.map((person, index) => (
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
                  <span>{index + 1}. <strong>{person.displayName}</strong> @{person.username}</span>
                  <time className="muted small">{new Date(person.createdAt).toLocaleDateString()}</time>
                </label>
              ))}
              {store.communityDirectory.length === 0 && (
                <p className="muted">No registered usernames were found.</p>
              )}
            </div>
            <button className="primary-btn" disabled={busy} onClick={() => void saveModerators()}>
              Save moderators
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
