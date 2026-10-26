import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  type UIEvent,
} from "react";
import { playMessageSound } from "../lib/alerts";
import { ContextMenu } from "./ContextMenu";
import { Avatar } from "./Avatar";
import { StickerPicker } from "./StickerPicker";
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";
import type { FriendActivity, GroupMember, GroupMessage, JaUser } from "../lib/types";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const UNSEND_WINDOW_MS = 60 * 60 * 1000;
const PENDING_MESSAGE_MATCH_WINDOW_MS = 30_000;
const EMPTY_GROUP_MESSAGES: GroupMessage[] = [];

type GroupAvatarEditState =
  | { kind: "keep" }
  | { kind: "new"; file: File; preview: string }
  | { kind: "removed" };

interface MessageMenuState {
  x: number;
  y: number;
  message: GroupMessage;
  canUnsend: boolean;
  canEdit: boolean;
}

type MentionCandidate =
  | {
      kind: "everyone";
      handle: "everyone";
      displayName: string;
      subtitle: string;
    }
  | {
      kind: "member";
      handle: string;
      member: GroupMember;
    };

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtDay(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function isImageAttachment(attachmentType?: string, attachmentName?: string, attachmentUrl?: string) {
  if (attachmentType?.startsWith("image/")) return true;
  const target = `${attachmentName ?? ""} ${attachmentUrl ?? ""}`;
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$|\s)/i.test(target);
}

function detectMentionQuery(text: string, cursor: number): { start: number; query: string } | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, safeCursor);
  const match = /(^|[\s(])@([a-z0-9._]{0,20})$/i.exec(before);
  if (!match) return null;
  return {
    start: match.index + match[1].length,
    query: match[2],
  };
}

function renderBodyWithMentions(
  body: string,
  memberByUsername: Map<string, GroupMember>,
  myUsername: string,
  mine: boolean,
  onOpenProfile: (user: JaUser) => void,
): ReactNode {
  const parts = body.split(/(@everyone|@[a-z0-9._]{3,20})\b/gi);
  if (parts.length === 1) return body;

  return parts.map((part, index) => {
    if (!part.startsWith("@")) return <Fragment key={index}>{part}</Fragment>;
    const handle = part.slice(1).toLowerCase();
    if (handle === "everyone") {
      return (
        <span
          key={index}
          className={`mention-pill mention-everyone ${mine ? "in-mine" : "mention-me"}`}
        >
          {part}
        </span>
      );
    }
    const member = memberByUsername.get(handle);
    const isMe = Boolean(myUsername && handle === myUsername.toLowerCase());
    if (!member && !isMe) return <Fragment key={index}>{part}</Fragment>;
    return (
      <button
        key={index}
        type="button"
        className={`mention-pill ${isMe && !mine ? "mention-me" : ""} ${mine ? "in-mine" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          if (member) onOpenProfile(member);
        }}
      >
        {part}
      </button>
    );
  });
}

function getConversationMessages(
  pendingMessages: GroupMessage[],
  activeMessages: GroupMessage[],
) {
  const conversationPendingMessages = [...pendingMessages];
  const matchedPendingIds = new Set<string>();
  const confirmedMessages = activeMessages.map((message) => {
    const pendingIndex = conversationPendingMessages.findIndex(
      (pendingMessage) =>
        pendingMessage.senderId === message.senderId &&
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
    messages: [...confirmedMessages, ...conversationPendingMessages].sort(
      (a, b) => a.createdAt - b.createdAt,
    ),
    matchedPendingIds,
  };
}

const GroupChatHistory = memo(function GroupChatHistory({
  messages,
  messagesReady,
  me,
  members,
  messagesRef,
  initialScrollAllowedRef,
  wasPinnedRef,
  onScroll,
  onOpenProfile,
  onOpenImage,
  onOpenMessageMenu,
  onReactToMessage,
}: {
  messages: GroupMessage[];
  messagesReady: boolean;
  me: { id: string; username: string };
  members: GroupMember[];
  messagesRef: { current: HTMLDivElement | null };
  initialScrollAllowedRef: { current: boolean };
  wasPinnedRef: { current: boolean };
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  onOpenProfile: (user: JaUser) => void;
  onOpenImage: (url: string) => void;
  onOpenMessageMenu: (event: MouseEvent, message: GroupMessage) => void;
  onReactToMessage: (message: GroupMessage, emoji: string) => void;
}) {
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );
  const memberByUsername = useMemo(
    () => new Map(members.map((member) => [member.username.toLowerCase(), member])),
    [members],
  );

  const handleMediaLoad = () => {
    if (initialScrollAllowedRef.current || wasPinnedRef.current) {
      const container = messagesRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    }
  };

  return (
    <div
      className="messages group-messages"
      ref={messagesRef}
      onScroll={onScroll}
      onWheel={() => {
        initialScrollAllowedRef.current = false;
      }}
      onTouchStart={() => {
        initialScrollAllowedRef.current = false;
      }}
    >
      {messagesReady && messages.length === 0 && (
        <div className="empty-box center">
          <strong>This is the beginning of the group 🎉</strong>
          <span className="muted small">
            Say hello, share photos or stickers, or type <code>@everyone</code> to notify the group!
          </span>
        </div>
      )}
      {messages.map((message, index) => {
        const day = fmtDay(message.createdAt);
        const showDay = index === 0 || fmtDay(messages[index - 1].createdAt) !== day;
        const mine = message.senderId === me.id;
        const isImage = isImageAttachment(
          message.attachmentType,
          message.attachmentName,
          message.attachmentUrl,
        );
        const isVideo =
          message.attachmentType?.startsWith("video/") ||
          /\.(mp4|m4v|mov|webm|ogg)$/i.test(message.attachmentName ?? "");
        const senderMember = memberById.get(message.senderId);
        const senderUser: JaUser = senderMember ?? {
          id: message.senderId,
          displayName: message.senderName || "Member",
          username: message.senderUsername || "member",
          bio: "",
          pronouns: "",
          avatarColor: message.senderAvatarColor || "black",
          avatarUrl: message.senderAvatarUrl,
          onboardingComplete: true,
        };
        const mentionedMe =
          !mine &&
          !message.unsentAt &&
          Boolean(
            message.mentionsEveryone ||
              message.mentionedUserIds?.includes(me.id) ||
              (me.username &&
                new RegExp(`(?:^|[\\s(])@(?:everyone|${me.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "i").test(
                  message.body,
                )),
          );

        return (
          <Fragment key={message.renderKey ?? message.id}>
            {showDay && <div className="day-divider">{day}</div>}
            <div
              className={`msg-row group-msg-row ${mine ? "mine" : "theirs"}`}
              id={`group-message-${message.id}`}
            >
              <div className={`msg-col group-msg-col ${mine ? "mine" : "theirs"}`}>
                {!mine && (
                  <div className="group-sender-meta">
                    <button
                      type="button"
                      className="group-sender-btn"
                      onClick={() => onOpenProfile(senderUser)}
                    >
                      <strong>{message.senderName || senderUser.displayName}</strong>
                      {message.senderUsername && (
                        <span className="muted">@{message.senderUsername}</span>
                      )}
                    </button>
                  </div>
                )}
                {message.forwardedFromName && (
                  <span className={`message-meta forwarded-label ${!mine ? "group-indented" : ""}`}>
                    ↗ Forwarded from {message.forwardedFromName}
                  </span>
                )}
                <div className={`group-bubble-line ${mine ? "mine" : "theirs"}`}>
                  {!mine && (
                    <Avatar
                      user={senderUser}
                      size={34}
                      ringWidth={2}
                      onClick={() => onOpenProfile(senderUser)}
                    />
                  )}
                  <div
                    className={`bubble ${mine ? "mine" : "theirs"} ${message.unsentAt ? "unsent" : ""} ${mentionedMe ? "bubble-mentioned" : ""}`}
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
                        <strong>
                          {message.replyTo.senderId === me.id ? "You" : message.replyTo.senderName}
                        </strong>
                        <span>{message.replyTo.body || "📎 Attachment"}</span>
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
                                onLoad={handleMediaLoad}
                              />
                            </button>
                          ) : isVideo ? (
                            <div className="video-attachment">
                              <video
                                className="msg-video"
                                controls
                                playsInline
                                preload="metadata"
                                src={message.attachmentUrl}
                              >
                                Your browser does not support video playback.
                              </video>
                              <label className="video-speed-control">
                                <span>Speed</span>
                                <select
                                  defaultValue="1"
                                  aria-label="Video playback speed"
                                  onChange={(event) => {
                                    const video = event.currentTarget
                                      .closest(".video-attachment")
                                      ?.querySelector("video");
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
                            <a
                              className="file-chip"
                              href={message.attachmentUrl}
                              download={message.attachmentName ?? "file"}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              📎 {message.attachmentName ?? "Attachment"}
                            </a>
                          ))}
                        {message.stickerUrl && (
                          <button
                            type="button"
                            className="image-message-button sticker-message-button"
                            onClick={() => onOpenImage(message.stickerUrl!)}
                            aria-label="Open sticker viewer"
                          >
                            <img
                              className="group-message-sticker"
                              src={message.stickerUrl}
                              alt={message.stickerName ?? "Sticker"}
                              onLoad={handleMediaLoad}
                            />
                          </button>
                        )}
                        {message.body && (
                          <p>
                            {renderBodyWithMentions(
                              message.body,
                              memberByUsername,
                              me.username,
                              mine,
                              onOpenProfile,
                            )}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className={`group-message-sub ${mine ? "mine" : "theirs"}`}>
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
                </div>
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
});

export function GroupChatView({
  onOpenProfile,
  onBack,
}: {
  onOpenProfile: (user: JaUser) => void;
  onBack: () => void;
}) {
  const store = useJaText();
  const groupId = store.activeGroupId;
  const setGroupTyping = store.setGroupTyping;
  const summary = store.groups.find((entry) => entry.id === groupId);
  const group = store.groupDetails?.id === groupId ? store.groupDetails : null;

  const [draft, setDraft] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissedAt, setMentionDismissedAt] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<GroupMessage | null>(null);
  const [forwardedMessage, setForwardedMessage] = useState<GroupMessage | null>(null);

  // Advanced Group Settings modal state
  const [showManage, setShowManage] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [groupAvatarState, setGroupAvatarState] = useState<GroupAvatarEditState>({ kind: "keep" });
  const [manageSaved, setManageSaved] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addMemberIds, setAddMemberIds] = useState<string[]>([]);

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

  const messagesRef = useRef<HTMLDivElement>(null);
  const initialScrollAllowedRef = useRef(true);
  const hasScrolledOnOpenRef = useRef(false);
  const wasPinnedRef = useRef(true);
  const scrollTargetGroupRef = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const groupPfpInput = useRef<HTMLInputElement>(null);
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
  const conversationMessages = groupId ? store.groupMessages : EMPTY_GROUP_MESSAGES;
  const conversationReady = Boolean(groupId) && store.groupMessagesReady;
  const isMuted = group?.members.find((member) => member.id === store.me?.id)?.muted ?? false;

  const { messages: displayedMessages, matchedPendingIds } = useMemo(
    () => getConversationMessages(pendingMessages, conversationMessages),
    [conversationMessages, pendingMessages],
  );
  const lastDisplayedKey = displayedMessages.at(-1)?.id ?? "";
  const lastDisplayedSenderId = displayedMessages.at(-1)?.senderId ?? "";

  const activityByUserId = useMemo(() => {
    const map = new Map<string, FriendActivity>();
    for (const activity of store.friendActivities) map.set(activity.userId, activity);
    return map;
  }, [store.friendActivities]);

  // Mention autocomplete computation
  const activeMentionMatch = useMemo(() => {
    const match = detectMentionQuery(draft, cursorPos);
    if (!match) return null;
    if (mentionDismissedAt !== null && mentionDismissedAt === match.start) return null;
    return match;
  }, [cursorPos, draft, mentionDismissedAt]);

  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    if (!activeMentionMatch) return [];
    const q = activeMentionMatch.query.toLowerCase();
    const list: MentionCandidate[] = [];
    if ("everyone".includes(q)) {
      const count = group?.members.length ?? summary?.memberCount ?? 0;
      list.push({
        kind: "everyone",
        handle: "everyone",
        displayName: "@everyone",
        subtitle: count > 0 ? `Notify all ${count} members in this group` : "Notify everyone in this group",
      });
    }
    const members = group?.members ?? [];
    const matchingMembers = members
      .filter(
        (member) =>
          member.id !== store.me?.id &&
          Boolean(member.username) &&
          (member.username.toLowerCase().includes(q) ||
            member.displayName.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const aStarts =
          a.username.toLowerCase().startsWith(q) || a.displayName.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts =
          b.username.toLowerCase().startsWith(q) || b.displayName.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.displayName.localeCompare(b.displayName);
      });
    for (const member of matchingMembers.slice(0, 8)) {
      list.push({ kind: "member", handle: member.username, member });
    }
    return list;
  }, [activeMentionMatch, group?.members, store.me?.id, summary?.memberCount]);

  const safeMentionIndex =
    mentionCandidates.length > 0 ? Math.min(mentionIndex, mentionCandidates.length - 1) : 0;

  const applyMention = useCallback(
    (handle: string) => {
      if (!activeMentionMatch) return;
      const before = draft.slice(0, activeMentionMatch.start);
      const after = draft.slice(cursorPos);
      const needsLeadingSpace = false;
      const insertion = `${needsLeadingSpace ? " " : ""}@${handle} `;
      const nextDraft = `${before}${insertion}${after.replace(/^\s+/, "")}`;
      const nextCursor = before.length + insertion.length;
      setDraft(nextDraft);
      setCursorPos(nextCursor);
      setMentionIndex(0);
      setMentionDismissedAt(null);
      window.requestAnimationFrame(() => {
        const el = composerRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(nextCursor, nextCursor);
        }
      });
    },
    [activeMentionMatch, cursorPos, draft],
  );

  const scrollToBottom = useCallback(() => {
    const container = messagesRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  const handleMessagesScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    wasPinnedRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 96;
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

  function openManageModal() {
    if (groupAvatarState.kind === "new") URL.revokeObjectURL(groupAvatarState.preview);
    setRenameDraft(group?.name ?? summary?.name ?? "");
    setGroupAvatarState({ kind: "keep" });
    setManageSaved(false);
    setManageError(null);
    setMemberSearch("");
    setShowAddMembers(false);
    setAddMemberIds([]);
    setShowManage(true);
  }

  function closeManageModal() {
    if (groupAvatarState.kind === "new") URL.revokeObjectURL(groupAvatarState.preview);
    setGroupAvatarState({ kind: "keep" });
    setShowManage(false);
  }

  useEffect(() => {
    setGroupTypingRef.current = setGroupTyping;
  }, [setGroupTyping]);

  // Initial scroll to bottom as soon as groupMessages finish loading
  useLayoutEffect(() => {
    if (scrollTargetGroupRef.current !== groupId) {
      scrollTargetGroupRef.current = groupId ?? null;
      hasScrolledOnOpenRef.current = false;
      initialScrollAllowedRef.current = true;
      wasPinnedRef.current = true;
    }
    if (!conversationReady || hasScrolledOnOpenRef.current) return;
    hasScrolledOnOpenRef.current = true;
    scrollToBottom();
    window.requestAnimationFrame(() => {
      if (initialScrollAllowedRef.current) scrollToBottom();
    });
  }, [conversationReady, groupId, scrollToBottom]);

  // Keep pinned to bottom when new messages arrive or when you send a message
  useLayoutEffect(() => {
    if (!conversationReady || !lastDisplayedKey) return;
    if (
      initialScrollAllowedRef.current ||
      wasPinnedRef.current ||
      lastDisplayedSenderId === store.me?.id
    ) {
      scrollToBottom();
    }
  }, [
    conversationReady,
    displayedMessages.length,
    lastDisplayedKey,
    lastDisplayedSenderId,
    scrollToBottom,
    store.me?.id,
  ]);

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

  useEffect(
    () => () => {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      if (typingRef.current && groupId) {
        void setGroupTypingRef.current(groupId, false).catch((cause: unknown) => {
          console.error("Could not clear group typing status.", cause);
        });
      }
    },
    [groupId],
  );

  useEffect(() => {
    for (const id of matchedPendingIds) {
      const url = pendingAttachmentUrlsRef.current.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        pendingAttachmentUrlsRef.current.delete(id);
      }
    }
  }, [matchedPendingIds]);

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
      imageGestureRef.current = {
        mode: "pan",
        touchX: touch.clientX,
        touchY: touch.clientY,
        x: transform.x,
        y: transform.y,
      };
    } else {
      imageGestureRef.current = null;
    }
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
          : {
              mode: "pinch" as const,
              distance,
              scale: imageTransformRef.current.scale,
              x: imageTransformRef.current.x,
              y: imageTransformRef.current.y,
              centerX,
              centerY,
            };
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
      applyImageTransform(
        imageTransformRef.current.scale,
        gesture.x + touch.clientX - gesture.touchX,
        gesture.y + touch.clientY - gesture.touchY,
      );
    }
  }

  function endImageGesture(event: React.TouchEvent<HTMLImageElement>) {
    if (event.touches.length === 1 && imageTransformRef.current.scale > 1) {
      const touch = event.touches[0];
      imageGestureRef.current = {
        mode: "pan",
        touchX: touch.clientX,
        touchY: touch.clientY,
        x: imageTransformRef.current.x,
        y: imageTransformRef.current.y,
      };
      return;
    }
    imageGestureRef.current = null;
  }

  function publishTyping(isTyping: boolean) {
    if (!groupId) return;
    void setGroupTyping(groupId, isTyping).catch((err: unknown) => {
      setError(friendlyError(err, "Couldn't update your typing status."));
    });
  }

  function onDraftChange(value: string, selectionStart?: number | null) {
    setDraft(value);
    setCursorPos(selectionStart ?? value.length);
    setMentionIndex(0);
    setMentionDismissedAt(null);
    if (editingMessage || !groupId) return;
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

  function onComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (editingMessage) return;
    const items = Array.from(event.clipboardData?.items ?? []);
    const fileItem = items.find((item) => item.kind === "file");
    if (!fileItem) return;
    const pasted = fileItem.getAsFile();
    if (pasted) {
      event.preventDefault();
      setFile(pasted);
    }
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
    if ((!draft.trim() && !file && !forwardedMessage) || busy) return;
    const sentBody = draft.trim();
    const sentFile = file;
    const sentReply = replyTo;
    const sentForwarded = forwardedMessage;
    const sentAt = Math.max(Date.now(), lastPendingMessageAtRef.current + 1);
    lastPendingMessageAtRef.current = sentAt;
    const pendingId = `pending-${sentAt}`;
    const attachmentUrl = sentFile
      ? URL.createObjectURL(sentFile)
      : sentForwarded?.attachmentUrl ?? sentForwarded?.stickerUrl;
    if (attachmentUrl && sentFile) pendingAttachmentUrlsRef.current.set(pendingId, attachmentUrl);
    wasPinnedRef.current = true;
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
    setCursorPos(0);
    setFile(null);
    setReplyTo(null);
    setForwardedMessage(null);
    setError(null);
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    typingRef.current = false;
    void setGroupTyping(groupId, false).catch((err: unknown) =>
      setError(friendlyError(err, "Couldn't update typing status.")),
    );
    try {
      if (sentForwarded) {
        await store.forwardGroupMessage(sentForwarded.id, { groupId });
        if (sentBody || sentFile) {
          await store.sendGroupMessage(groupId, sentBody, sentFile ?? undefined, sentReply?.id);
        }
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
      const eventTime =
        event.timeStamp > 1_000_000_000_000
          ? event.timeStamp
          : performance.timeOrigin + event.timeStamp;
      setMessageMenu({
        x: event.clientX,
        y: event.clientY,
        message,
        canUnsend:
          message.senderId === store.me?.id &&
          !message.unsentAt &&
          eventTime - message.createdAt < UNSEND_WINDOW_MS,
        canEdit: message.senderId === store.me?.id && !message.unsentAt,
      });
      setReactionPickerOpen(false);
    },
    [store.me?.id],
  );

  function replyToMessage(message: GroupMessage) {
    setEditingMessage(null);
    setForwardedMessage(null);
    setReplyTo(message);
    closeMessageMenu();
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  async function copyMessage(message: GroupMessage) {
    const text = message.unsentAt
      ? "This message was unsent"
      : message.body || message.attachmentUrl || message.stickerUrl || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
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
      if (!navigator.clipboard.write || typeof ClipboardItem === "undefined") {
        throw new Error("Copying images isn't supported by this browser.");
      }
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
    setCursorPos(message.body.length);
    closeMessageMenu();
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function cancelEditingMessage() {
    setEditingMessage(null);
    setDraft("");
    setCursorPos(0);
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
    [closeMessageMenu, store],
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

  async function runManageAction(action: () => Promise<void>, success?: () => void) {
    setBusy(true);
    setManageError(null);
    setManageSaved(false);
    try {
      await action();
      success?.();
    } catch (cause) {
      setManageError(friendlyError(cause, "Could not update this group."));
    } finally {
      setBusy(false);
    }
  }

  function pickGroupPicture(picked: File | undefined) {
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      setManageError("Please choose an image file for the group picture.");
      return;
    }
    if (groupAvatarState.kind === "new") URL.revokeObjectURL(groupAvatarState.preview);
    setManageError(null);
    setManageSaved(false);
    setGroupAvatarState({
      kind: "new",
      file: picked,
      preview: URL.createObjectURL(picked),
    });
  }

  async function saveGroupChanges(event: FormEvent) {
    event.preventDefault();
    if (!group) return;
    const trimmedName = renameDraft.trim();
    if (!trimmedName) {
      setManageError("Group name cannot be empty.");
      return;
    }
    await runManageAction(
      async () => {
        if (trimmedName !== group.name) {
          await store.renameGroup(group.id, trimmedName);
        }
        if (groupAvatarState.kind === "new") {
          await store.setGroupAvatar(group.id, groupAvatarState.file);
        } else if (groupAvatarState.kind === "removed") {
          await store.setGroupAvatar(group.id, null);
        }
      },
      () => {
        if (groupAvatarState.kind === "new") URL.revokeObjectURL(groupAvatarState.preview);
        setGroupAvatarState({ kind: "keep" });
        setManageSaved(true);
      },
    );
  }

  if (!groupId) return null;

  const canManageGroup = group?.role === "owner" || group?.role === "moderator";
  const groupAvatarPreview =
    groupAvatarState.kind === "new"
      ? groupAvatarState.preview
      : groupAvatarState.kind === "removed"
        ? undefined
        : group?.avatarUrl;
  const hasGroupProfileChanges = Boolean(
    group &&
      (renameDraft.trim() !== group.name || groupAvatarState.kind !== "keep"),
  );

  const sortedGroupMembers = group
    ? [...group.members]
        .filter((member) => {
          if (!memberSearch.trim()) return true;
          const q = memberSearch.toLowerCase();
          return (
            member.displayName.toLowerCase().includes(q) ||
            member.username.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          const rank = { owner: 0, moderator: 1, member: 2 };
          if (rank[a.role] !== rank[b.role]) return rank[a.role] - rank[b.role];
          return a.displayName.localeCompare(b.displayName);
        })
    : [];

  const invitableFriends = group
    ? store.friends.filter((friend) => !group.members.some((m) => m.id === friend.id))
    : [];

  return (
    <section className={`chat group-chat ${chatClosing ? "closing" : ""}`}>
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={closeChat} aria-label="Back">
          ←
        </button>
        <button
          type="button"
          className="group-header-avatar-btn"
          onClick={openManageModal}
          aria-label="Open group settings"
        >
          {(group?.avatarUrl ?? summary?.avatarUrl) ? (
            <img
              className="group-avatar"
              src={group?.avatarUrl ?? summary?.avatarUrl}
              alt=""
            />
          ) : (
            <div className="group-avatar group-avatar-fallback" aria-hidden="true">
              👥
            </div>
          )}
        </button>
        <button type="button" className="chat-title" onClick={openManageModal}>
          <strong>{group?.name ?? summary?.name ?? "Group chat"}</strong>
          <span className="muted small">
            {group?.members.length ?? summary?.memberCount ?? 0} members · Tap for group settings
          </span>
        </button>
        <button type="button" className="ghost-btn" onClick={openManageModal}>
          Manage
        </button>
      </header>

      {showUnsendWarning && (
        <div className="unsend-warning-banner" role="status">
          <span>
            You unsent a message. In the meantime, they may have already seen it,
            screenshotted it, or reported it.
          </span>
          <button
            type="button"
            className="unsend-warning-dismiss"
            aria-label="Dismiss unsend notice"
            onClick={() => setShowUnsendWarning(false)}
          >
            ×
          </button>
        </div>
      )}

      <GroupChatHistory
        messages={displayedMessages}
        messagesReady={conversationReady}
        me={{ id: store.me?.id ?? "", username: store.me?.username ?? "" }}
        members={group?.members ?? []}
        messagesRef={messagesRef}
        initialScrollAllowedRef={initialScrollAllowedRef}
        wasPinnedRef={wasPinnedRef}
        onScroll={handleMessagesScroll}
        onOpenProfile={onOpenProfile}
        onOpenImage={openImagePreview}
        onOpenMessageMenu={openMessageMenu}
        onReactToMessage={reactToMessage}
      />

      {error && (
        <div className="error-box chat-error" role="alert">
          {error}
        </div>
      )}
      {typingNames.length > 0 && (
        <div className="chat-typing-status" role="status">
          {typingNames.length === 1
            ? `${typingNames[0]} is typing…`
            : `${typingNames.slice(0, 2).join(", ")}${
                typingNames.length > 2 ? ` and ${typingNames.length - 2} more` : ""
              } are typing…`}
        </div>
      )}

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
          <span>📎 {file.name}</span>
          <button type="button" className="mini-btn" onClick={() => setFile(null)}>
            ✕ Remove
          </button>
        </div>
      )}
      {(replyTo || forwardedMessage) && !editingMessage && (
        <div className="reply-composer-preview">
          <div>
            <strong>
              {replyTo
                ? `Replying to ${replyTo.senderId === store.me?.id ? "yourself" : replyTo.senderName}`
                : `Forwarding from ${forwardedMessage?.senderName}`}
            </strong>
            <span>
              {replyTo
                ? replyTo.unsentAt
                  ? "This message was unsent"
                  : replyTo.body || replyTo.attachmentName || replyTo.stickerName || "Attachment"
                : draft}
            </span>
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
            ✕
          </button>
        </div>
      )}

      {isMuted ? (
        <div className="community-readonly">You are muted in this group.</div>
      ) : (
        <div className="composer-wrap">
          {mentionCandidates.length > 0 && (
            <div className="mention-autocomplete" role="listbox" aria-label="Mention someone">
              <div className="mention-autocomplete-header">
                Members matching <strong>@{activeMentionMatch?.query ?? ""}</strong>
              </div>
              {mentionCandidates.map((candidate, idx) => {
                const isActive = idx === safeMentionIndex;
                if (candidate.kind === "everyone") {
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      key="mention-everyone"
                      className={`mention-option ${isActive ? "active" : ""}`}
                      onMouseEnter={() => setMentionIndex(idx)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applyMention("everyone");
                      }}
                    >
                      <span className="mention-everyone-avatar" aria-hidden="true">
                        @
                      </span>
                      <span className="mention-option-text">
                        <strong>@everyone</strong>
                        <small className="muted">{candidate.subtitle}</small>
                      </span>
                      <span className="mention-role-tag everyone">Ping all</span>
                    </button>
                  );
                }
                const { member } = candidate;
                const activity = activityByUserId.get(member.id);
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    key={`mention-${member.id}`}
                    className={`mention-option ${isActive ? "active" : ""}`}
                    onMouseEnter={() => setMentionIndex(idx)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applyMention(member.username);
                    }}
                  >
                    <Avatar user={member} size={30} status={activity?.status} />
                    <span className="mention-option-text">
                      <strong>{member.displayName}</strong>
                      <small className="muted">@{member.username}</small>
                    </span>
                    {member.role !== "member" && (
                      <span className={`mention-role-tag ${member.role}`}>
                        {member.role === "owner" ? "Owner" : "Mod"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <form className="composer" onSubmit={(event) => void onSend(event)}>
            <input
              ref={fileInput}
              type="file"
              hidden
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected);
                event.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              className="icon-btn attach-btn"
              title="Attach a photo or file"
              aria-label="Attach a photo or file"
              disabled={!!editingMessage}
              onClick={() => fileInput.current?.click()}
            >
              📎
            </button>
            <StickerPicker
              friendId=""
              disabled={busy || !!editingMessage}
              onSelect={async (sticker) => {
                if (!groupId) return;
                try {
                  if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
                  typingRef.current = false;
                  await setGroupTyping(groupId, false);
                  wasPinnedRef.current = true;
                  await store.sendGroupSticker(groupId, sticker, replyTo?.id);
                  setReplyTo(null);
                  if (store.soundsEnabled) playMessageSound("sent");
                } catch (cause) {
                  setError(friendlyError(cause, "Could not send the sticker."));
                }
              }}
            />
            <button
              type="button"
              className="icon-btn voice-note-placeholder"
              title="Voice notes coming soon"
              aria-label="Voice notes coming soon"
              disabled
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
              </svg>
            </button>
            <textarea
              ref={composerRef}
              value={draft}
              maxLength={4000}
              onChange={(event) =>
                onDraftChange(event.target.value, event.currentTarget.selectionStart)
              }
              onClick={(event) => setCursorPos(event.currentTarget.selectionStart ?? 0)}
              onKeyUp={(event) => {
                if (
                  event.key !== "ArrowDown" &&
                  event.key !== "ArrowUp" &&
                  event.key !== "Enter" &&
                  event.key !== "Escape"
                ) {
                  setCursorPos(event.currentTarget.selectionStart ?? 0);
                }
              }}
              onPaste={onComposerPaste}
              rows={1}
              placeholder="Message the group… (type @ to mention)"
              aria-label="Group message"
              onKeyDown={(event) => {
                if (mentionCandidates.length > 0) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setMentionIndex(
                      (prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length,
                    );
                    return;
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    event.preventDefault();
                    const picked = mentionCandidates[safeMentionIndex];
                    if (picked) applyMention(picked.handle);
                    return;
                  }
                  if (event.key === "Escape" && activeMentionMatch) {
                    event.preventDefault();
                    setMentionDismissedAt(activeMentionMatch.start);
                    return;
                  }
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button
              type="submit"
              className="send-btn"
              disabled={busy || (!editingMessage && !draft.trim() && !file && !forwardedMessage)}
              aria-label={editingMessage ? "Save edit" : "Send message"}
            >
              {editingMessage ? "✓" : "➤"}
            </button>
          </form>
        </div>
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
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => startEditingMessage(messageMenu.message)}
                >
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
              <button
                type="button"
                role="menuitem"
                onClick={() => setReactionPickerOpen((open) => !open)}
                aria-expanded={reactionPickerOpen}
              >
                <span>✨</span> Reaction
              </button>
              {reactionPickerOpen && (
                <div className="context-reactions" aria-label="Choose reaction">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      aria-label={`React with ${emoji}`}
                      onClick={() => void reactToMessage(messageMenu.message, emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void copyMessage(messageMenu.message)}
          >
            <span>📋</span> Copy text
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void deleteForMe(messageMenu.message)}
          >
            <span>🗑️</span> Delete for me
          </button>
          {(messageMenu.message.stickerKey ||
            isImageAttachment(
              messageMenu.message.attachmentType,
              messageMenu.message.attachmentName,
              messageMenu.message.attachmentUrl,
            ) ||
            messageMenu.message.stickerUrl) && (
            <button
              type="button"
              role="menuitem"
              onClick={() => void favoriteSticker(messageMenu.message)}
            >
              <span>{messageMenu.message.isStickerFavorite ? "☆" : "⭐"}</span>
              {isImageAttachment(
                messageMenu.message.attachmentType,
                messageMenu.message.attachmentName,
                messageMenu.message.attachmentUrl,
              ) &&
              !messageMenu.message.stickerKey &&
              !messageMenu.message.stickerUrl
                ? "Make this image a sticker..."
                : messageMenu.message.isStickerFavorite
                  ? "Remove from favourites"
                  : "Add to favourites"}
            </button>
          )}
          {(isImageAttachment(
            messageMenu.message.attachmentType,
            messageMenu.message.attachmentName,
            messageMenu.message.attachmentUrl,
          ) ||
            messageMenu.message.stickerUrl) && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => void copyImage(messageMenu.message)}
              >
                <span>🖼️</span> Copy image
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void copyImageAddress(messageMenu.message)}
              >
                <span>🔗</span> Copy image address
              </button>
            </>
          )}
          {messageMenu.canUnsend && (
            <button
              type="button"
              role="menuitem"
              className="destructive-menu-item"
              onClick={() => void unsend(messageMenu.message)}
            >
              <span>↩️</span> Unsend
            </button>
          )}
        </ContextMenu>
      )}

      {forwardMessage && (
        <div
          className={`forward-backdrop ${forwardClosing ? "closing" : ""}`}
          onClick={closeForwardDialog}
        >
          <section
            className="forward-dialog"
            aria-label="Forward message"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h3>Forward message</h3>
                <p>Choose a friend or group to send this to.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close forward dialog"
                onClick={closeForwardDialog}
              >
                ✕
              </button>
            </header>
            <div className="forward-friends">
              {store.friends.map((target) => (
                <button
                  type="button"
                  key={target.id}
                  className="forward-friend"
                  onClick={() => void forwardToFriend(target.id)}
                >
                  <Avatar user={target} size={38} />
                  <span>{target.displayName}</span>
                  <span className="muted">@{target.username}</span>
                </button>
              ))}
              {store.groups
                .filter((g) => g.id !== groupId)
                .map((target) => (
                  <button
                    type="button"
                    key={target.id}
                    className="forward-friend"
                    onClick={() => void forwardToGroup(target.id)}
                  >
                    {target.avatarUrl ? (
                      <img
                        className="group-avatar"
                        src={target.avatarUrl}
                        alt=""
                        style={{ width: 38, height: 38 }}
                      />
                    ) : (
                      <span className="group-avatar group-avatar-fallback" style={{ width: 38, height: 38, fontSize: 18 }}>
                        👥
                      </span>
                    )}
                    <span>{target.name}</span>
                    <span className="muted">{target.memberCount} members</span>
                  </button>
                ))}
              {store.friends.length === 0 && store.groups.length <= 1 && (
                <p className="muted center">You do not have anyone to forward to yet.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {imagePreview && (
        <div
          className={`media-lightbox ${imageClosing ? "closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
          onClick={closeImagePreview}
        >
          <button
            type="button"
            className="media-lightbox-close"
            aria-label="Close image viewer"
            onClick={closeImagePreview}
          >
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
              applyImageTransform(
                Math.min(4, Math.max(1, scale + (event.deltaY < 0 ? 0.2 : -0.2))),
                x,
                y,
              );
            }}
          />
          <span className="media-lightbox-hint">
            Pinch to zoom · Drag to move · Click outside or press Esc to close
          </span>
        </div>
      )}

      {showManage && group && (
        <div className="modal-backdrop" onClick={closeManageModal}>
          <section
            className="modal-card wide group-manage-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="modal-close" onClick={closeManageModal} aria-label="Close">
              ×
            </button>
            <h2>Group settings</h2>

            {canManageGroup ? (
              <form className="group-profile-card" onSubmit={(event) => void saveGroupChanges(event)}>
                <div className="group-pfp-hero">
                  <button
                    type="button"
                    className="group-pfp-circle-btn"
                    onClick={() => groupPfpInput.current?.click()}
                    title="Click to change group picture"
                  >
                    {groupAvatarPreview ? (
                      <img className="group-pfp-circle-img" src={groupAvatarPreview} alt={group.name} />
                    ) : (
                      <span className="group-pfp-circle-fallback" aria-hidden="true">
                        {(renameDraft.trim() || group.name).slice(0, 2).toUpperCase() || "👥"}
                      </span>
                    )}
                    <span className="pf-avatar-edit" aria-hidden="true">
                      ✏️
                    </span>
                  </button>
                  <input
                    ref={groupPfpInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      pickGroupPicture(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                  <div className="group-pfp-hero-info">
                    <strong>{renameDraft.trim() || group.name}</strong>
                    <span className="muted small">
                      {group.members.length} member{group.members.length === 1 ? "" : "s"} · Click the circle to upload a group photo
                    </span>
                    <div className="group-pfp-hero-actions">
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={() => groupPfpInput.current?.click()}
                      >
                        📷 Choose photo
                      </button>
                      {groupAvatarPreview && (
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => {
                            if (groupAvatarState.kind === "new") {
                              URL.revokeObjectURL(groupAvatarState.preview);
                            }
                            setManageSaved(false);
                            setGroupAvatarState({ kind: "removed" });
                          }}
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <label className="group-name-field">
                  Group name
                  <input
                    value={renameDraft}
                    maxLength={60}
                    onChange={(event) => {
                      setRenameDraft(event.target.value);
                      setManageSaved(false);
                    }}
                    placeholder="Enter group name…"
                    aria-label="Group name"
                  />
                </label>

                <div className="group-save-row">
                  {manageSaved ? (
                    <span className="hint-ok">✓ Changes saved!</span>
                  ) : (
                    <span className="muted small">
                      {hasGroupProfileChanges ? "Unsaved changes" : "Group profile is up to date"}
                    </span>
                  )}
                  <button
                    type="submit"
                    className="primary-btn group-save-btn"
                    disabled={busy || !hasGroupProfileChanges || !renameDraft.trim()}
                  >
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="group-profile-card readonly">
                <div className="group-pfp-hero">
                  <button
                    type="button"
                    className="group-pfp-circle-btn readonly"
                    onClick={() => {
                      if (group.avatarUrl) {
                        closeManageModal();
                        openImagePreview(group.avatarUrl);
                      }
                    }}
                    title={group.avatarUrl ? "View group photo" : group.name}
                  >
                    {group.avatarUrl ? (
                      <img className="group-pfp-circle-img" src={group.avatarUrl} alt={group.name} />
                    ) : (
                      <span className="group-pfp-circle-fallback" aria-hidden="true">
                        {group.name.slice(0, 2).toUpperCase() || "👥"}
                      </span>
                    )}
                  </button>
                  <div className="group-pfp-hero-info">
                    <strong>{group.name}</strong>
                    <span className="muted small">
                      {group.members.length} member{group.members.length === 1 ? "" : "s"} · You are a member
                    </span>
                  </div>
                </div>
              </div>
            )}

            {manageError && (
              <div className="error-box" role="alert">
                {manageError}
              </div>
            )}

            <div className="group-members-header">
              <h3>Members ({group.members.length})</h3>
              {canManageGroup && invitableFriends.length > 0 && (
                <button
                  type="button"
                  className="mini-btn group-invite-toggle"
                  onClick={() => setShowAddMembers((open) => !open)}
                >
                  {showAddMembers ? "Close invite" : "➕ Add friends"}
                </button>
              )}
            </div>

            {showAddMembers && canManageGroup && (
              <div className="group-invite-box">
                <span className="muted small">Invite accepted friends to join this group:</span>
                <div className="group-invite-list">
                  {invitableFriends.map((friend) => (
                    <label className="community-directory-person" key={friend.id}>
                      <input
                        type="checkbox"
                        checked={addMemberIds.includes(friend.id)}
                        onChange={(event) =>
                          setAddMemberIds((current) =>
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
                </div>
                <button
                  type="button"
                  className="primary-btn"
                  disabled={busy || addMemberIds.length === 0}
                  onClick={() =>
                    void runManageAction(
                      () => store.addGroupMembers(group.id, addMemberIds),
                      () => {
                        setAddMemberIds([]);
                        setShowAddMembers(false);
                      },
                    )
                  }
                >
                  Add {addMemberIds.length > 0 ? `${addMemberIds.length} ` : ""}to group
                </button>
              </div>
            )}

            {group.members.length > 5 && (
              <input
                className="group-member-search"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Search members…"
                aria-label="Search group members"
              />
            )}

            <div className="group-manage-members">
              {sortedGroupMembers.map((member) => {
                const isSelf = member.id === store.me?.id;
                const canManageMember =
                  canManageGroup &&
                  member.role !== "owner" &&
                  !(member.role === "moderator" && group.role !== "owner");
                const activity = activityByUserId.get(member.id);
                const status = isSelf
                  ? store.me?.statusPreference === "offline"
                    ? "offline"
                    : store.me?.statusPreference === "dnd"
                      ? "dnd"
                      : "online"
                  : activity?.status;

                return (
                  <div className="group-manage-member" key={member.id}>
                    <Avatar
                      user={member}
                      size={42}
                      status={status}
                      onClick={() => {
                        closeManageModal();
                        onOpenProfile(member);
                      }}
                    />
                    <button
                      type="button"
                      className="group-member-identity"
                      onClick={() => {
                        closeManageModal();
                        onOpenProfile(member);
                      }}
                    >
                      <span className="group-member-top">
                        <strong>{member.displayName}</strong>
                        {isSelf && <span className="role-pill you">You</span>}
                        {member.role === "owner" && (
                          <span className="role-pill owner">👑 Owner</span>
                        )}
                        {member.role === "moderator" && (
                          <span className="role-pill moderator">🛡️ Moderator</span>
                        )}
                        {member.muted && <span className="role-pill muted-pill">🔇 Muted</span>}
                      </span>
                      <span className="muted small">
                        @{member.username}
                        {member.bio ? ` · ${member.bio}` : ""}
                      </span>
                    </button>
                    <div className="group-member-actions">
                      {group.role === "owner" && member.role !== "owner" && (
                        <button
                          type="button"
                          className="mini-btn"
                          disabled={busy}
                          onClick={() =>
                            void runManageAction(() =>
                              store.setGroupMemberRole(
                                group.id,
                                member.id,
                                member.role === "moderator" ? "member" : "moderator",
                              ),
                            )
                          }
                        >
                          {member.role === "moderator" ? "Remove mod" : "Make mod"}
                        </button>
                      )}
                      {canManageMember && !isSelf && (
                        <>
                          <button
                            type="button"
                            className="mini-btn"
                            disabled={busy}
                            onClick={() =>
                              void runManageAction(() =>
                                store.setGroupMuted(group.id, member.id, !member.muted),
                              )
                            }
                          >
                            {member.muted ? "Unmute" : "Mute"}
                          </button>
                          <button
                            type="button"
                            className="mini-btn destructive-menu-item"
                            disabled={busy}
                            onClick={() =>
                              void runManageAction(() =>
                                store.removeGroupMember(group.id, member.id),
                              )
                            }
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
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
                      void runManageAction(
                        () => store.deleteGroup(group.id),
                        () => {
                          closeManageModal();
                          store.setActiveGroupId(null);
                        },
                      );
                    }
                  }}
                >
                  Delete group
                </button>
              ) : (
                <button
                  type="button"
                  className="danger-btn"
                  disabled={busy}
                  onClick={() =>
                    void runManageAction(
                      () => store.leaveGroup(group.id),
                      () => {
                        closeManageModal();
                        store.setActiveGroupId(null);
                      },
                    )
                  }
                >
                  Leave group
                </button>
              )}
              <button type="button" className="ghost-btn" onClick={closeManageModal}>
                Done
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
