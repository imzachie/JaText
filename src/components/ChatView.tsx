import { useEffect, useRef, useState, type FormEvent } from "react";
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
  const { me, activeMessages, sendMessage } = useJaText();
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages.length, friend.id]);

  if (!me) return null;

  async function onSend(e?: FormEvent) {
    e?.preventDefault();
    if ((!draft.trim() && !file) || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(friend.id, draft, file ?? undefined);
      setDraft("");
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message failed to send.");
    } finally {
      setSending(false);
    }
  }

  let lastDay = "";

  return (
    <section className="chat">
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={onBack} aria-label="Back">
          ←
        </button>
        <Avatar user={friend} size={44} onClick={() => onOpenProfile(friend)} />
        <button className="chat-title" onClick={() => onOpenProfile(friend)}>
          <strong>{friend.displayName}</strong>
          <span className="muted small">@{friend.username} · tap to view profile</span>
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
          onChange={(e) => setDraft(e.target.value)}
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
