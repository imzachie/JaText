import { useEffect, useRef, useState, type FormEvent } from "react";
import { playMessageSound } from "../lib/alerts";
import { useJaText } from "../lib/store";
import type { JaUser } from "../lib/types";
import { Avatar } from "./Avatar";

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
  const { me, activeMessages, friendActivities, sendMessage, setTyping, soundsEnabled } =
    useJaText();
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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
  }, [activeMessages.length, friend.id]);

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
      setError(err instanceof Error ? err.message : "Could not update typing status.");
    });
    try {
      await sendMessage(friend.id, draft, file ?? undefined);
      if (soundsEnabled) playMessageSound("sent");
      setDraft("");
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message failed to send.");
    } finally {
      setSending(false);
    }
  }

  function publishTyping(isTyping: boolean) {
    void setTyping(friend.id, isTyping).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not update typing status.");
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
              <div className={`msg-row ${mine ? "mine" : "theirs"}`}>
                {!mine && (
                  <Avatar user={friend} size={30} ringWidth={2} onClick={() => onOpenProfile(friend)} />
                )}
                <div className="msg-col">
                  <div className={`bubble ${mine ? "mine" : "theirs"}`}>
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
                  </div>
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
    </section>
  );
}
