import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { playMessageSound } from "../lib/alerts";
import { ContextMenu } from "./ContextMenu";
import { Avatar } from "./Avatar";
import { StickerPicker } from "./StickerPicker";
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";
import type { GroupMessage } from "../lib/types";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const UNSEND_WINDOW_MS = 60 * 60 * 1000;
const PENDING_MESSAGE_MATCH_WINDOW_MS = 30_000;
// EMPTY_MESSAGES removed

interface MessageMenuState {
  x: number;
  y: number;
  message: GroupMessage;
  canUnsend: boolean;
  canEdit: boolean;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtDay(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function getConversationMessages(
  pendingMessages: GroupMessage[],
  activeMessages: GroupMessage[],
  _groupId: string,
) {
  // For groups, pending messages are already scoped to this group via receiverId === groupId trick?
  // Instead we filter pending where renderKey or id pending and groupId matches.
  // We'll store groupId in pending's forwardedFromName workaround, but simpler: just filter all pending that belong to this group
  // We use a custom property: pending.groupId via closure? Instead we store groupId in pending's id prefix.
  // Simpler: pendingMessages are only for current group (we clear on group change), so just merge all.
  const conversationPendingMessages = pendingMessages;
  const matchedPendingIds = new Set<string>();
  const confirmedMessages = activeMessages.map((message) => {
    const pendingIndex = conversationPendingMessages.findIndex(
      (pendingMessage) =>
        pendingMessage.senderId === message.senderId &&
        // group messages have no receiverId, so just compare body/attachment and time window
        message.createdAt >= pendingMessage.createdAt - 1_000 &&
        message.createdAt <= pendingMessage.createdAt + PENDING_MESSAGE_MATCH_WINDOW_MS &&
        (message.unsentAt ||
          (message.body === pendingMessage.body &&
            message.attachmentName === pendingMessage.attachmentName)),
    );
    if (pendingIndex === -1) return message;
    const [pendingMessage] = conversationPendingMessages.splice(pendingIndex, 1);
    matchedPendingIds.add(pendingMessage.id);
    return { ...message, renderKey: pendingMessage.id };
  });
  return {
    messages: [...confirmedMessages, ...conversationPendingMessages].sort((a, b) => a.createdAt - b.createdAt),
    matchedPendingIds,
  };
}

const GroupChatHistory = memo(function GroupChatHistory({
  messages,
  me,
  messagesRef,
  initialScrollAllowedRef,
  onOpenImage,
  onOpenMessageMenu,
  onReactToMessage,
}: {
  messages: GroupMessage[];
  me: { id: string };
  messagesRef: { current: HTMLDivElement | null };
  initialScrollAllowedRef: { current: boolean };
  onOpenImage: (url: string) => void;
  onOpenMessageMenu: (event: MouseEvent, message: GroupMessage) => void;
  onReactToMessage: (message: GroupMessage, emoji: string) => void;
}) {
  return (
    <div
      className="messages group-messages"
      ref={messagesRef}
      onWheel={() => {
        initialScrollAllowedRef.current = false;
      }}
      onTouchStart={() => {
        initialScrollAllowedRef.current = false;
      }}
    >
      {messages.length === 0 && (
        <div className="empty-box center">
          <strong>This is the beginning of the group.</strong>
          <span className="muted">Say hello to the group!</span>
        </div>
      )}
      {messages.map((message, index) => {
        const day = fmtDay(message.createdAt);
        const showDay = index === 0 || fmtDay(messages[index - 1].createdAt) !== day;
        const mine = message.senderId === me.id;
        const isImage = message.attachmentType?.startsWith("image/");
        const isVideo =
          message.attachmentType?.startsWith("video/") ||
          /\.(mp4|m4v|mov|webm|ogg)$/i.test(message.attachmentName ?? "");
        return (
          <div key={message.renderKey ?? message.id}>
            {showDay && <div className="day-divider">{day}</div>}
            <div
              className={`group-message-row ${mine ? "mine" : ""}`}
              id={`group-message-${message.id}`}
            >
              <Avatar
                user={{
                  displayName: message.senderName,
                  username: message.senderUsername,
                  avatarColor: message.senderAvatarColor,
                  avatarUrl: message.senderAvatarUrl,
                }}
                size={34}
              />
              <article className="group-message-content">
                <div className="group-message-meta">
                  <strong>{message.senderName}</strong>
                  <span className="muted small">@{message.senderUsername}</span>
                  <time className="muted small">{fmtTime(message.createdAt)}</time>
                </div>
                {message.forwardedFromName && (
                  <span className="message-meta forwarded-label">↗ Forwarded from {message.forwardedFromName}</span>
                )}
                <div
                  className={`group-message-bubble ${message.unsentAt ? "unsent" : ""}`}
                  onContextMenu={
                    message.id.startsWith("pending-")
                      ? undefined
                      : (event) => onOpenMessageMenu(event, message)
                  }
                >
                  {message.replyTo && (
                    <button
                      type="button"
                      className="reply-quote"
                      onClick={() =>
                        document
                          .getElementById(`group-message-${message.replyTo?.id}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                    >
                      <strong>{message.replyTo.senderName}</strong>
                      <span>{message.replyTo.body}</span>
                    </button>
                  )}
                  {message.unsentAt ? (
                    <p className="unsent-copy">This message was unsent</p>
                  ) : (
                    <>
                      {message.attachmentUrl &&
                        (isImage ? (
                          <button
                            type="button"
                            className="image-message-button"
                            onClick={() => onOpenImage(message.attachmentUrl!)}
                            aria-label="Open image viewer"
                          >
                            <img
                              className="msg-image"
                              src={message.attachmentUrl}
                              alt={message.attachmentName ?? "attachment"}
                              onLoad={() => {
                                if (initialScrollAllowedRef.current) {
                                  const container = messagesRef.current;
                                  if (container) container.scrollTop = container.scrollHeight;
                                }
                              }}
                            />
                          </button>
                        ) : isVideo ? (
                          <div className="video-attachment">
                            <video className="msg-video" controls playsInline preload="metadata" src={message.attachmentUrl}>
                              Your browser does not support video playback.
                            </video>
                            <label className="video-speed-control">
                              <span>Speed</span>
                              <select
                                defaultValue="1"
                                aria-label="Video playback speed"
                                onChange={(event) => {
                                  const video = event.currentTarget.closest(".video-attachment")?.querySelector("video");
                                  if (video) video.playbackRate = Number(event.target.value);
                                }}
                              >
                                <option value="0.5">0.5×</option>
                                <option value="0.75">0.75×</option>
                                <option value="1">1×</option>
                                <option value="1.25">1.25×</option>
                                <option value="1.5">1.5×</option>
                                <option value="2">2×</option>
                              </select>
                            </label>
                          </div>
                        ) : (
                          <a className="file-chip" href={message.attachmentUrl} download={message.attachmentName ?? "file"} target="_blank" rel="noreferrer">
                            📎 {message.attachmentName ?? "Attachment"}
                          </a>
                        ))}
                      {message.stickerUrl && <img className="group-message-sticker" src={message.stickerUrl} alt={message.stickerName ?? "Sticker"} />}
                      {message.body && <p>{message.body}</p>}
                    </>
                  )}
                </div>
                {!!message.reactions?.length && (
                  <div className="message-reactions">
                    {Array.from(new Set(message.reactions.map((r) => r.emoji))).map((emoji) => {
                      const users = message.reactions?.filter((r) => r.emoji === emoji) ?? [];
                      const mineReacted = users.some((r) => r.userId === me.id);
                      return (
                        <button
                          type="button"
                          key={emoji}
                          className={`reaction-chip ${mineReacted ? "selected" : ""}`}
                          onClick={() => onReactToMessage(message, emoji)}
                        >
                          {emoji} <span>{users.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <span className="msg-time">
                  {fmtTime(message.createdAt)}
                  {message.editedAt ? " · Edited" : ""}
                </span>
              </article>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export function GroupChatView({ onBack }: { onBack: () => void }) {
  const store = useJaText();
  const groupId = store.activeGroupId;
  const setGroupTyping = store.setGroupTyping;
  const summary = store.groups.find((group) => group.id === groupId);
  const group = store.groupDetails?.id === groupId ? store.groupDetails : null;

  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<GroupMessage | null>(null);
  const [forwardedMessage, setForwardedMessage] = useState<GroupMessage | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [showManage, setShowManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnsendWarning, setShowUnsendWarning] = useState(false);

  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [messageMenuClosing, setMessageMenuClosing] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [forwardMessage, setForwardMessageState] = useState<GroupMessage | null>(null);
  const [forwardClosing, setForwardClosing] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<GroupMessage[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageClosing, setImageClosing] = useState(false);
  const [chatClosing, setChatClosing] = useState(false);

  const messagesElement = useRef<HTMLDivElement>(null);
  const initialScrollAllowedRef = useRef(true);
  const hasScrolledOnOpenRef = useRef(false);
  const scrollTargetGroupRef = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);
  const imageTransformRef = useRef({ scale: 1, x: 0, y: 0 });
  const imageGestureRef = useRef<
    | { mode: "pinch"; distance: number; scale: number; x: number; y: number; centerX: number; centerY: number }
    | { mode: "pan"; touchX: number; touchY: number; x: number; y: number }
    | null
  >(null);
  const imageCloseTimerRef = useRef<number | null>(null);
  const messageMenuCloseTimerRef = useRef<number | null>(null);
  const forwardCloseTimerRef = useRef<number | null>(null);
  const chatCloseTimerRef = useRef<number | null>(null);
  const typingTimer = useRef<number | null>(null);
  const typingRef = useRef(false);
  const pendingAttachmentUrlsRef = useRef(new Map<string, string>());
  const lastPendingMessageAtRef = useRef(0);
  const setGroupTypingRef = useRef(setGroupTyping);
  const lastTypingUpdate = useRef(0);

  const typingNames = store.groupTypingUsers.map((user) => user.displayName || user.username);
  const lastMessageId = store.groupMessages.at(-1)?.id;
  const conversationReady = !!groupId && store.groupDetails !== null; // simple check; real store has groupMessages ready
  const isMuted = group?.members.find((m) => m.id === store.me?.id)?.muted ?? false;
  const scrollToBottom = useCallback(() => {
    const container = messagesElement.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, []);

  const openImagePreview = useCallback((url: string) => {
    if (imageCloseTimerRef.current !== null) {
      window.clearTimeout(imageCloseTimerRef.current);
      imageCloseTimerRef.current = null;
    }
    imageTransformRef.current = { scale: 1, x: 0, y: 0 };
    imageGestureRef.current = null;
    setImageClosing(false);
    setImagePreview(url);
  }, []);
  const closeImagePreview = useCallback(() => {
    if (imageCloseTimerRef.current !== null) window.clearTimeout(imageCloseTimerRef.current);
    setImageClosing(true);
    imageCloseTimerRef.current = window.setTimeout(() => {
      setImagePreview(null);
      setImageClosing(false);
      imageCloseTimerRef.current = null;
    }, 160);
  }, []);
  const closeMessageMenu = useCallback(() => {
    if (messageMenuCloseTimerRef.current !== null) return;
    setMessageMenuClosing(true);
    messageMenuCloseTimerRef.current = window.setTimeout(() => {
      setMessageMenu(null);
      setMessageMenuClosing(false);
      messageMenuCloseTimerRef.current = null;
    }, 140);
  }, []);
  function closeForwardDialog() {
    if (!forwardMessage || forwardClosing) return;
    setForwardClosing(true);
    forwardCloseTimerRef.current = window.setTimeout(() => {
      setForwardMessageState(null);
      setForwardClosing(false);
      forwardCloseTimerRef.current = null;
    }, 160);
  }
  function closeChat() {
    if (chatCloseTimerRef.current !== null) return;
    setChatClosing(true);
    chatCloseTimerRef.current = window.setTimeout(() => {
      onBack();
      chatCloseTimerRef.current = null;
    }, 160);
  }

  useEffect(() => {
    setGroupTypingRef.current = setGroupTyping;
  }, [setGroupTyping]);

  useLayoutEffect(() => {
    if (scrollTargetGroupRef.current !== groupId) {
      scrollTargetGroupRef.current = groupId ?? null;
      hasScrolledOnOpenRef.current = false;
      initialScrollAllowedRef.current = true;
    }
    if (!conversationReady || hasScrolledOnOpenRef.current) return;
    hasScrolledOnOpenRef.current = true;
    window.requestAnimationFrame(() => {
      if (initialScrollAllowedRef.current) scrollToBottom();
    });
  }, [conversationReady, groupId, scrollToBottom]);

  useEffect(() => {
    const element = messagesElement.current;
    if (element && initialScrollAllowedRef.current) {
      // also pin on new lastMessage
    }
    if (element && wasPinnedRef.current) element.scrollTop = element.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId]);

  const wasPinnedRef = useRef(true);
  useEffect(() => {
    if (!imagePreview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeImagePreview();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeImagePreview, imagePreview]);

  useEffect(
    () => () => {
      if (imageCloseTimerRef.current !== null) window.clearTimeout(imageCloseTimerRef.current);
      if (messageMenuCloseTimerRef.current !== null) window.clearTimeout(messageMenuCloseTimerRef.current);
      if (forwardCloseTimerRef.current !== null) window.clearTimeout(forwardCloseTimerRef.current);
      if (chatCloseTimerRef.current !== null) window.clearTimeout(chatCloseTimerRef.current);
      for (const url of pendingAttachmentUrlsRef.current.values()) URL.revokeObjectURL(url);
      pendingAttachmentUrlsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    // clear pending when group changes?
    setPendingMessages([]);
    return () => {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      if (typingRef.current && groupId) {
        void setGroupTypingRef.current(groupId, false).catch((cause: unknown) => {
          console.error("Could not clear group typing status.", cause);
        });
      }
    };
  }, [groupId]);

  function applyImageTransform(scale: number, x: number, y: number) {
    const image = imageElementRef.current;
    if (!image) return;
    const viewport = image.parentElement;
    const maxX = Math.max(0, (image.offsetWidth * scale - (viewport?.clientWidth ?? 0)) / 2);
    const maxY = Math.max(0, (image.offsetHeight * scale - (viewport?.clientHeight ?? 0)) / 2);
    const boundedX = Math.max(-maxX, Math.min(maxX, x));
    const boundedY = Math.max(-maxY, Math.min(maxY, y));
    imageTransformRef.current = { scale, x: boundedX, y: boundedY };
    image.style.transform = `translate3d(${boundedX}px, ${boundedY}px, 0) scale(${scale})`;
  }
  function startImageGesture(event: React.TouchEvent<HTMLImageElement>) {
    const transform = imageTransformRef.current;
    if (event.touches.length >= 2) {
      const [first, second] = Array.from(event.touches);
      imageGestureRef.current = {
        mode: "pinch",
        distance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
        scale: transform.scale,
        x: transform.x,
        y: transform.y,
        centerX: (first.clientX + second.clientX) / 2,
        centerY: (first.clientY + second.clientY) / 2,
      };
    } else if (transform.scale > 1) {
      const touch = event.touches[0];
      imageGestureRef.current = { mode: "pan", touchX: touch.clientX, touchY: touch.clientY, x: transform.x, y: transform.y };
    } else imageGestureRef.current = null;
  }
  function moveImageGesture(event: React.TouchEvent<HTMLImageElement>) {
    const gesture = imageGestureRef.current;
    const image = event.currentTarget;
    if (event.touches.length >= 2) {
      event.preventDefault();
      const [first, second] = Array.from(event.touches);
      const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      const centerX = (first.clientX + second.clientX) / 2;
      const centerY = (first.clientY + second.clientY) / 2;
      const base =
        gesture?.mode === "pinch"
          ? gesture
          : { mode: "pinch" as const, distance, scale: imageTransformRef.current.scale, x: imageTransformRef.current.x, y: imageTransformRef.current.y, centerX, centerY };
      if (gesture?.mode !== "pinch") imageGestureRef.current = base;
      const scale = Math.min(4, Math.max(1, (base.scale * distance) / Math.max(base.distance, 1)));
      const ratio = scale / base.scale;
      const bounds = image.parentElement?.getBoundingClientRect();
      const imageCenterX = (bounds?.left ?? 0) + (bounds?.width ?? window.innerWidth) / 2 + base.x;
      const imageCenterY = (bounds?.top ?? 0) + (bounds?.height ?? window.innerHeight) / 2 + base.y;
      const x = base.x + centerX - base.centerX + (base.centerX - imageCenterX) * (1 - ratio);
      const y = base.y + centerY - base.centerY + (base.centerY - imageCenterY) * (1 - ratio);
      applyImageTransform(scale, x, y);
      return;
    }
    if (gesture?.mode === "pan" && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      applyImageTransform(imageTransformRef.current.scale, gesture.x + touch.clientX - gesture.touchX, gesture.y + touch.clientY - gesture.touchY);
    }
  }
  function endImageGesture(event: React.TouchEvent<HTMLImageElement>) {
    if (event.touches.length === 1 && imageTransformRef.current.scale > 1) {
      const touch = event.touches[0];
      imageGestureRef.current = { mode: "pan", touchX: touch.clientX, touchY: touch.clientY, x: imageTransformRef.current.x, y: imageTransformRef.current.y };
      return;
    }
    imageGestureRef.current = null;
  }

  const displayed = getConversationMessages(pendingMessages, store.groupMessages, groupId ?? "");
  const displayedMessages = displayed.messages;
  const matchedPendingIds = displayed.matchedPendingIds;

  useEffect(() => {
    for (const id of matchedPendingIds) {
      const url = pendingAttachmentUrlsRef.current.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        pendingAttachmentUrlsRef.current.delete(id);
      }
    }
  }, [matchedPendingIds]);

  function publishTyping(isTyping: boolean) {
    if (!groupId) return;
    void setGroupTyping(groupId, isTyping).catch((err: unknown) => {
      setError(friendlyError(err, "Couldn't update your typing status."));
    });
  }
  function onDraftChange(value: string) {
    setDraft(value);
    if (!groupId) return;
    if (!value.trim()) {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      typingRef.current = false;
      publishTyping(false);
      return;
    }
    const now = Date.now();
    if (!typingRef.current || now - lastTypingUpdate.current >= 2000) {
      typingRef.current = true;
      lastTypingUpdate.current = now;
      publishTyping(true);
    }
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      typingRef.current = false;
      publishTyping(false);
    }, 2500);
  }

  async function onSend(e?: FormEvent) {
    e?.preventDefault();
    if (!groupId) return;
    if (editingMessage) {
      const editedBody = draft.trim();
      if (!editedBody) return;
      setError(null);
      try {
        await store.editGroupMessage(editingMessage.id, editedBody);
        setEditingMessage(null);
        setDraft("");
      } catch (err) {
        setError(friendlyError(err, "Couldn't edit the message."));
      }
      return;
    }
    if ((!draft.trim() && !file) || busy) return;
    const sentBody = draft.trim();
    const sentFile = file;
    const sentReply = replyTo;
    const sentForwarded = forwardedMessage;
    const sentAt = Math.max(Date.now(), lastPendingMessageAtRef.current + 1);
    lastPendingMessageAtRef.current = sentAt;
    const pendingId = `pending-${sentAt}`;
    const attachmentUrl = sentFile ? URL.createObjectURL(sentFile) : sentForwarded?.attachmentUrl ?? forwardedMessage?.stickerUrl;
    if (attachmentUrl && sentFile) pendingAttachmentUrlsRef.current.set(pendingId, attachmentUrl);
    setPendingMessages((current) => [
      ...current.slice(-299),
      {
        id: pendingId,
        senderId: store.me?.id ?? "",
        senderName: store.me?.displayName ?? "",
        senderUsername: store.me?.username ?? "",
        senderAvatarUrl: store.me?.avatarUrl,
        senderAvatarColor: store.me?.avatarColor ?? "black",
        body: sentBody || sentForwarded?.body || "",
        attachmentUrl,
        attachmentName: sentFile?.name ?? sentForwarded?.attachmentName,
        attachmentType: sentFile?.type ?? sentForwarded?.attachmentType,
        stickerUrl: sentForwarded?.stickerUrl,
        stickerName: sentForwarded?.stickerName,
        createdAt: sentAt,
      } as GroupMessage,
    ]);
    window.requestAnimationFrame(scrollToBottom);
    setDraft("");
    setFile(null);
    setReplyTo(null);
    setForwardedMessage(null);
    setError(null);
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    typingRef.current = false;
    void setGroupTyping(groupId, false).catch((err: unknown) => setError(friendlyError(err, "Couldn't update typing status.")));
    try {
      if (sentForwarded) {
        await store.forwardGroupMessage(sentForwarded.id, { groupId });
        // also if text override? For simplicity, if forwarded and has extra text, send that too
        if (sentBody) await store.sendGroupMessage(groupId, sentBody, sentFile ?? undefined, sentReply?.id);
      } else {
        await store.sendGroupMessage(groupId, sentBody, sentFile ?? undefined, sentReply?.id);
      }
      if (store.soundsEnabled) playMessageSound("sent");
    } catch (err) {
      const url = pendingAttachmentUrlsRef.current.get(pendingId);
      if (url) {
        URL.revokeObjectURL(url);
        pendingAttachmentUrlsRef.current.delete(pendingId);
      }
      setPendingMessages((cur) => cur.filter((m) => m.id !== pendingId));
      setDraft((c) => (c.trim() ? c : sentBody));
      if (sentFile) setFile((c) => c ?? sentFile);
      setError(friendlyError(err, "Couldn't send the group message."));
    }
  }

  const openMessageMenu = useCallback(
    (event: MouseEvent, message: GroupMessage) => {
      event.preventDefault();
      event.stopPropagation();
      if (messageMenuCloseTimerRef.current !== null) {
        window.clearTimeout(messageMenuCloseTimerRef.current);
        messageMenuCloseTimerRef.current = null;
      }
      setMessageMenuClosing(false);
      const eventTime = event.timeStamp > 1_000_000_000_000 ? event.timeStamp : performance.timeOrigin + event.timeStamp;
      setMessageMenu({
        x: event.clientX,
        y: event.clientY,
        message,
        canUnsend: message.senderId === store.me?.id && !message.unsentAt && eventTime - message.createdAt < UNSEND_WINDOW_MS,
        canEdit: message.senderId === store.me?.id && !message.unsentAt && !!message.body.trim(),
      });
      setReactionPickerOpen(false);
    },
    [store.me?.id],
  );

  function replyToMessage(message: GroupMessage) {
    setReplyTo(message);
    setForwardedMessage(null);
    closeMessageMenu();
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }
  async function copyMessage(message: GroupMessage) {
    try {
      await navigator.clipboard.writeText(
        message.unsentAt ? "This message was unsent" : message.body || message.attachmentName || message.stickerName || message.attachmentUrl || "",
      );
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't copy the message."));
    }
  }
  async function copyImageAddress(message: GroupMessage) {
    const url = message.attachmentUrl ?? message.stickerUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't copy the image address."));
    }
  }
  async function copyImage(message: GroupMessage) {
    const url = message.attachmentUrl ?? message.stickerUrl;
    if (!url) return;
    try {
      if (!navigator.clipboard.write || typeof ClipboardItem === "undefined") throw new Error("Copying images isn't supported by this browser.");
      const response = await fetch(url);
      if (!response.ok) throw new Error("Couldn't load the image.");
      const image = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [image.type]: image })]);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't copy the image."));
    }
  }
  async function deleteForMe(message: GroupMessage) {
    try {
      await store.deleteGroupMessageForMe(message.id);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't delete the message."));
    }
  }
  async function unsend(message: GroupMessage) {
    try {
      const shouldShowWarning = await store.unsendGroupMessage(message.id);
      if (shouldShowWarning) setShowUnsendWarning(true);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't unsend the message."));
    }
  }
  function startEditingMessage(message: GroupMessage) {
    setEditingMessage(message);
    setReplyTo(null);
    setFile(null);
    setDraft(message.body);
    closeMessageMenu();
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }
  function cancelEditingMessage() {
    setEditingMessage(null);
    setDraft("");
  }
  const reactToMessage = useCallback(
    async (message: GroupMessage, emoji: string) => {
      try {
        await store.toggleGroupReaction(message.id, emoji);
        closeMessageMenu();
        setReactionPickerOpen(false);
      } catch (err) {
        setError(friendlyError(err, "Couldn't add the reaction."));
      }
    },
    [store],
  );
  async function favoriteSticker(message: GroupMessage) {
    try {
      await store.favoriteGroupStickerFromMessage(message.id);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't update your sticker favourites."));
    }
  }
  async function forwardToFriend(receiverId: string) {
    if (!forwardMessage) return;
    try {
      await store.forwardGroupMessage(forwardMessage.id, { userId: receiverId });
      closeForwardDialog();
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't forward the message."));
    }
  }
  async function forwardToGroup(targetGroupId: string) {
    if (!forwardMessage) return;
    try {
      await store.forwardGroupMessage(forwardMessage.id, { groupId: targetGroupId });
      closeForwardDialog();
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't forward the message."));
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
    <section className={`chat group-chat ${chatClosing ? "closing" : ""}`}>
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={closeChat} aria-label="Back">
          ←
        </button>
        {group?.avatarUrl ? (
          <img className="group-avatar" src={group.avatarUrl} alt="" />
        ) : (
          <div className="group-avatar group-avatar-fallback" aria-hidden="true">
            👥
          </div>
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
        >
          Manage
        </button>
      </header>

      {showUnsendWarning && (
        <div className="unsend-warning-banner" role="status">
          <span>You unsent a message. In the meantime, they may have already seen it, screenshotted it, or reported it.</span>
          <button type="button" className="unsend-warning-dismiss" aria-label="Dismiss unsend notice" onClick={() => setShowUnsendWarning(false)}>
            ×
          </button>
        </div>
      )}

      <div
        className="messages group-messages"
        ref={messagesElement as any}
        onScroll={(event) => {
          const element = event.currentTarget;
          wasPinnedRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
      >
        <GroupChatHistory
          messages={displayedMessages}
          me={{ id: store.me?.id ?? "" }}
          messagesRef={messagesElement as any}
          initialScrollAllowedRef={initialScrollAllowedRef}
          onOpenImage={openImagePreview}
          onOpenMessageMenu={openMessageMenu}
          onReactToMessage={reactToMessage}
        />
      </div>

      {error && (
        <div className="error-box community-error" role="alert">
          {error}
        </div>
      )}
      {typingNames.length > 0 && <div className="chat-typing-status" role="status">{typingNames.length === 1 ? `${typingNames[0]} is typing…` : `${typingNames.slice(0, 2).join(", ")}${typingNames.length > 2 ? ` and ${typingNames.length - 2} more` : ""} are typing…`}</div>}

      {editingMessage && (
        <div className="reply-composer-preview">
          <div>
            <strong>Editing your message</strong>
            <span>{editingMessage.body}</span>
          </div>
          <button type="button" className="mini-btn" onClick={cancelEditingMessage}>
            ✕
          </button>
        </div>
      )}
      {file && (
        <div className="attach-preview">
          📎 {file.name}
          <button className="mini-btn" onClick={() => setFile(null)}>
            ✕ Remove
          </button>
        </div>
      )}
      {(replyTo || forwardedMessage) && !editingMessage && (
        <div className="reply-composer-preview">
          <div>
            <strong>{replyTo ? `Replying to ${replyTo.senderName}` : `Forwarding from ${forwardedMessage?.senderName}`}</strong>
            <span>{replyTo?.body ?? draft}</span>
          </div>
          <button
            type="button"
            className="mini-btn"
            onClick={() => {
              setReplyTo(null);
              setForwardedMessage(null);
              if (forwardedMessage) setDraft("");
            }}
          >
            ×
          </button>
        </div>
      )}

      {isMuted ? (
        <div className="community-readonly">You are muted in this group.</div>
      ) : (
        <form className="composer group-composer" onSubmit={(event) => void onSend(event)}>
          <input ref={fileInput} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button
            type="button"
            className="icon-btn attach-btn"
            title="Attach a photo or file"
            disabled={!!editingMessage}
            onClick={() => fileInput.current?.click()}
          >
            📎
          </button>
          <StickerPicker friendId="" disabled={busy} onSelect={async (sticker) => {
            if (!groupId) return;
            try {
              if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
              typingRef.current = false;
              await setGroupTyping(groupId, false);
              await store.sendGroupSticker(groupId, sticker, replyTo?.id);
              setReplyTo(null);
            } catch (cause) {
              setError(friendlyError(cause, "Could not send the sticker."));
            }
          }} />
          <button type="button" className="icon-btn voice-note-placeholder" title="Voice notes coming soon" aria-label="Voice notes coming soon" disabled>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
            </svg>
          </button>
          <textarea
            ref={composerRef}
            value={draft}
            maxLength={4000}
            onChange={(event) => (editingMessage ? setDraft(event.target.value) : onDraftChange(event.target.value))}
            rows={1}
            placeholder="Message the group…"
            aria-label="Group message"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" className="send-btn" disabled={busy || (!editingMessage && !draft.trim() && !file)}>
            {editingMessage ? "✓" : "➤"}
          </button>
        </form>
      )}

      {messageMenu && (
        <ContextMenu
          x={messageMenu.x}
          y={messageMenu.y}
          label="Message actions"
          className={`message-context-menu ${messageMenuClosing ? "closing" : ""}`}
          onClose={closeMessageMenu}
        >
          <button type="button" role="menuitem" onClick={() => replyToMessage(messageMenu.message)}>
            <span>↩️</span> Reply
          </button>
          {!messageMenu.message.unsentAt && (
            <>
              {messageMenu.canEdit && (
                <button type="button" role="menuitem" onClick={() => startEditingMessage(messageMenu.message)}>
                  <span>✏️</span> Edit message
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (forwardCloseTimerRef.current !== null) {
                    window.clearTimeout(forwardCloseTimerRef.current);
                    forwardCloseTimerRef.current = null;
                  }
                  setForwardClosing(false);
                  setForwardMessageState(messageMenu.message);
                  closeMessageMenu();
                }}
              >
                <span>↗️</span> Forward
              </button>
              <button type="button" role="menuitem" onClick={() => setReactionPickerOpen((open) => !open)} aria-expanded={reactionPickerOpen}>
                <span>✨</span> Reaction
              </button>
              {reactionPickerOpen && (
                <div className="context-reactions" aria-label="Choose reaction">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button type="button" key={emoji} aria-label={`React with ${emoji}`} onClick={() => void reactToMessage(messageMenu.message, emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <button type="button" role="menuitem" onClick={() => void copyMessage(messageMenu.message)}>
            <span>📋</span> Copy text
          </button>
          <button type="button" role="menuitem" onClick={() => void deleteForMe(messageMenu.message)}>
            <span>🗑️</span> Delete for me
          </button>
          {(messageMenu.message.stickerKey || messageMenu.message.attachmentType?.startsWith("image/") || messageMenu.message.stickerUrl) && (
            <button type="button" role="menuitem" onClick={() => void favoriteSticker(messageMenu.message)}>
              <span>{messageMenu.message.isStickerFavorite ? "☆" : "⭐"}</span>
              {messageMenu.message.attachmentType?.startsWith("image/") && !messageMenu.message.stickerKey ? "Make this image a sticker..." : messageMenu.message.isStickerFavorite ? "Remove from favourites" : "Add to favourites"}
            </button>
          )}
          {(messageMenu.message.attachmentType?.startsWith("image/") || messageMenu.message.stickerUrl) && (
            <>
              <button type="button" role="menuitem" onClick={() => void copyImage(messageMenu.message)}>
                <span>🖼️</span> Copy image
              </button>
              <button type="button" role="menuitem" onClick={() => void copyImageAddress(messageMenu.message)}>
                <span>🔗</span> Copy image address
              </button>
            </>
          )}
          {messageMenu.canUnsend && (
            <button type="button" role="menuitem" className="destructive-menu-item" onClick={() => void unsend(messageMenu.message)}>
              <span>↩️</span> Unsend
            </button>
          )}
        </ContextMenu>
      )}

      {forwardMessage && (
        <div className={`forward-backdrop ${forwardClosing ? "closing" : ""}`} onClick={closeForwardDialog}>
          <section className="forward-dialog" aria-label="Forward message" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h3>Forward message</h3>
                <p>Choose a friend or group to send this to.</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close forward dialog" onClick={closeForwardDialog}>
                ✕
              </button>
            </header>
            <div className="forward-friends">
              {store.friends.map((target) => (
                <button type="button" key={target.id} className="forward-friend" onClick={() => void forwardToFriend(target.id)}>
                  <Avatar user={target} size={38} />
                  <span>{target.displayName}</span>
                  <span className="muted">@{target.username}</span>
                </button>
              ))}
              {store.groups
                .filter((g) => g.id !== groupId)
                .map((target) => (
                  <button type="button" key={target.id} className="forward-friend" onClick={() => void forwardToGroup(target.id)}>
                    {target.avatarUrl ? <img className="group-avatar" src={target.avatarUrl} alt="" style={{ width: 38, height: 38 }} /> : <span style={{ width: 38, textAlign: "center" }}>👥</span>}
                    <span>{target.name}</span>
                    <span className="muted">{target.memberCount} members</span>
                  </button>
                ))}
              {store.friends.length === 0 && store.groups.length <= 1 && <p className="muted center">You do not have anyone to forward to yet.</p>}
            </div>
          </section>
        </div>
      )}
      {imagePreview && (
        <div className={`media-lightbox ${imageClosing ? "closing" : ""}`} role="dialog" aria-modal="true" aria-label="Image viewer" onClick={closeImagePreview}>
          <button type="button" className="media-lightbox-close" aria-label="Close image viewer" onClick={closeImagePreview}>
            ×
          </button>
          <img
            ref={imageElementRef}
            src={imagePreview}
            alt="Full-size attachment"
            style={{ transform: "translate3d(0, 0, 0) scale(1)" }}
            onClick={(event) => event.stopPropagation()}
            onTouchStart={startImageGesture}
            onTouchMove={moveImageGesture}
            onTouchEnd={endImageGesture}
            onTouchCancel={endImageGesture}
            onWheel={(event) => {
              event.preventDefault();
              const { scale, x, y } = imageTransformRef.current;
              applyImageTransform(Math.min(4, Math.max(1, scale + (event.deltaY < 0 ? 0.2 : -0.2))), x, y);
            }}
          />
          <span className="media-lightbox-hint">Pinch to zoom · Drag to move · Click outside or press Esc to close</span>
        </div>
      )}

      {showManage && group && (
        <div className="modal-backdrop" onClick={() => setShowManage(false)}>
          <section className="modal-card group-manage-dialog" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowManage(false)} aria-label="Close">
              ×
            </button>
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
                  <input value={renameDraft} maxLength={60} onChange={(event) => setRenameDraft(event.target.value)} aria-label="Group name" />
                  <button type="submit" className="ghost-btn" disabled={busy}>
                    Rename
                  </button>
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
                const canManageMember = canManage && member.role !== "owner" && !(member.role === "moderator" && group.role !== "owner");
                return (
                  <div className="group-manage-member" key={member.id}>
                    <div>
                      <strong>{member.displayName}</strong>
                      <span className="muted small">
                        @{member.username} · {member.role}
                        {member.muted ? " · muted" : ""}
                      </span>
                    </div>
                    {group.role === "owner" && member.role !== "owner" && (
                      <button
                        type="button"
                        className="mini-btn"
                        disabled={busy}
                        onClick={() => void runAction(() => store.setGroupMemberRole(group.id, member.id, member.role === "moderator" ? "member" : "moderator"))}
                      >
                        {member.role === "moderator" ? "Remove mod" : "Make mod"}
                      </button>
                    )}
                    {canManageMember && !isSelf && (
                      <>
                        <button type="button" className="mini-btn" disabled={busy} onClick={() => void runAction(() => store.setGroupMuted(group.id, member.id, !member.muted))}>
                          {member.muted ? "Unmute" : "Mute"}
                        </button>
                        <button type="button" className="mini-btn destructive-menu-item" disabled={busy} onClick={() => void runAction(() => store.removeGroupMember(group.id, member.id))}>
                          Remove
                        </button>
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
                >
                  Delete group
                </button>
              ) : (
                <button type="button" className="danger-btn" disabled={busy} onClick={() => void runAction(() => store.leaveGroup(group.id), () => { setShowManage(false); store.setActiveGroupId(null); })}>
                  Leave group
                </button>
              )}
              <button type="button" className="ghost-btn" onClick={() => setShowManage(false)}>
                Done
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
