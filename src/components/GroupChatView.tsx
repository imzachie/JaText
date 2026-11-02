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
  type RefObject,
  type UIEvent,
} from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { playMessageSound } from "../lib/alerts";
import { ComposerPlusMenu, ViewOnceRingIcon } from "./ComposerPlusMenu";
import { ViewOnceMessageBubble } from "./ViewOnceViewerModal";
import {
  buildEncryptedViewOnceBody,
  isViewOnceBody,
  parseViewOnceEnvelope,
} from "../lib/viewOnce";
import {
  isMessagePinned,
  togglePinnedMessage,
  usePinnedMessages,
} from "../lib/chatOrganization";
import { CONVERSATION_MARKED_READ_EVENT } from "../lib/convexStore";
import { getUserChatPrefs } from "../lib/userChatPrefs";
import { isChatActivelyVisibleToUser } from "../lib/nativeBridge";
import {
  isSoftKeyboardCurrentlyOpen,
  useChatAutoScrollAndKeyboard,
} from "../lib/useChatAutoScrollAndKeyboard";
import { upsertCallHistoryEntry } from "../lib/callHistory";
import { formatCallDuration, formatPreviewMessageText, isHiddenCallSignal } from "../lib/calling";
import {
  copyImageUrlToClipboard,
  extractClipboardFile,
  useChatImagePaste,
} from "../lib/clipboard";
import {
  computeGroupSeenMap,
  serializeGroupSeenSignal,
  type GroupSeenReader,
} from "../lib/groupSeenSignals";
import { syncComposerTextareaHeight } from "../lib/composerUtils";
import { clearDraft, getDraft, setDraft as saveStoredDraft } from "../lib/drafts";
import { useE2EESnapshot } from "../lib/e2ee/keystore";
import { LockIcon, MessageEncryptionModal } from "./E2EEModals";
import {
  parseGroupCallInvite,
  resolveGroupCallLiveState,
  useGroupCall,
} from "../lib/groupCalling";
import { Phone, Video } from "./CallIcons";
import {
  getCachedWallpaper,
  getSavedOutgoingBubbleStyle,
  parseWallpaperSignal,
  saveCachedWallpaper,
  serializeWallpaperSignal,
  useIsMobileWallpaperSupported,
} from "../lib/chatCustomization";
import { decodeVoiceNoteMime, isVoiceNoteOrAudio, saveCachedVoiceTranscript } from "../lib/voiceNotes";
import { BubbleStyleModal } from "./BubbleStyleModal";
import { DecoratedMessageBubble } from "./BubbleStyleArtwork";
import { ChatAttachmentImage } from "./ChatAttachmentImage";
import { ChatVideoPlayer } from "./ChatVideoPlayer";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  BellIcon,
  BellOffIcon,
  BubblePaletteIcon,
  CameraIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  CopyIcon,
  CrownIcon,
  EditIcon,
  FileTextIcon,
  ForwardIcon,
  ImageIcon,
  LinkIcon,
  LockClosedIcon,
  MicVoiceIcon,
  MoreVerticalIcon,
  PaperclipIcon,
  PinIcon,
  PlusIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SmilePlusIcon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
  UndoIcon,
  UsersIcon,
} from "./UiIcons";
import { WallpaperModal, type WallpaperChoice } from "./WallpaperModal";
import { ContextMenu } from "./ContextMenu";
import {
  DeleteGroupConfirmModal,
  RemoveGroupChatModal,
} from "./DeleteGroupConfirmModal";
import { ForwardedMessageCard } from "./ForwardedMessageCard";
import { MessageLinkEmbeds } from "./LinkEmbeds";
import { MessageMarkdown } from "./MessageMarkdown";
import { ReactionEmojiPicker } from "./ReactionEmojiPicker";
import { SwipeToReply } from "./SwipeToReply";
import { AnimatedMediaImg, Avatar } from "./Avatar";
import {
  ensureInfiniteLoopGifFile,
  ensureValidFileMime,
  isAnimatedOrGifFile,
} from "../lib/imageUtils";
import { StickerPicker } from "./StickerPicker";
import {
  clearPendingMessageJump,
  getPendingMessageJump,
  subscribeMessageJumps,
} from "../lib/forwardedContext";
import { VoiceNotePlayer } from "./VoiceNotePlayer";
import { DeleteForMeToast, type DeletedForMeUndoState } from "./DeleteForMeToast";
import {
  restoreSnapTargetVisibilityById,
  triggerMessageThanosSnapById,
  useUnsendThanosWatcher,
} from "../lib/thanosSnapEffect";
import { VoiceNoteRecorder } from "./VoiceNoteRecorder";
import { useJaText } from "../lib/store";
import { friendlyError } from "../lib/errors";
import type { FriendActivity, GroupMember, GroupMessage, JaUser, StickerMedia } from "../lib/types";

const UNSEND_WINDOW_MS = 60 * 60 * 1000;
const PENDING_MESSAGE_MATCH_WINDOW_MS = 30_000;
const EMPTY_GROUP_MESSAGES: GroupMessage[] = [];
const EMPTY_GROUP_MEMBERS: GroupMember[] = [];

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

const GROUP_TIME_FMT = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
const GROUP_DAY_FMT = new Intl.DateTimeFormat([], {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const groupTimeCache = new Map<number, string>();

function fmtTime(ts: number) {
  const minuteBucket = Math.floor(ts / 60_000);
  let cached = groupTimeCache.get(minuteBucket);
  if (!cached) {
    cached = GROUP_TIME_FMT.format(new Date(ts));
    if (groupTimeCache.size > 600) groupTimeCache.clear();
    groupTimeCache.set(minuteBucket, cached);
  }
  return cached;
}

function fmtDay(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return "Today";
  }
  return GROUP_DAY_FMT.format(d);
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

function getConversationMessages(
  pendingMessages: GroupMessage[],
  activeMessages: GroupMessage[],
  myUserId?: string,
) {
  const conversationPendingMessages = [...pendingMessages];
  const matchedPendingIds = new Set<string>();
  const now = Date.now();
  const confirmedMessages: GroupMessage[] = [];

  for (const message of activeMessages) {
    const isUndecryptedEcho = Boolean(message.e2ee && !message.e2ee.decrypted);
    const pendingIndex = conversationPendingMessages.findIndex(
      (pendingMessage) =>
        pendingMessage.senderId === message.senderId &&
        message.createdAt >= pendingMessage.createdAt - 60_000 &&
        message.createdAt <= pendingMessage.createdAt + PENDING_MESSAGE_MATCH_WINDOW_MS &&
        (message.unsentAt ||
          Boolean(message.editedAt) ||
          isUndecryptedEcho ||
          (message.body === pendingMessage.body &&
            message.attachmentName === pendingMessage.attachmentName)),
    );
    if (pendingIndex === -1) {
      if (
        isUndecryptedEcho &&
        myUserId &&
        message.senderId === myUserId &&
        now - message.createdAt < 30_000
      ) {
        continue;
      }
      confirmedMessages.push(message);
      continue;
    }
    const [pendingMessage] = conversationPendingMessages.splice(pendingIndex, 1);
    matchedPendingIds.add(pendingMessage.id);
    confirmedMessages.push(
      isUndecryptedEcho
        ? {
            ...message,
            body: pendingMessage.body,
            bubbleStyle: pendingMessage.bubbleStyle ?? message.bubbleStyle,
            attachmentUrl: pendingMessage.attachmentUrl ?? message.attachmentUrl,
            attachmentName: pendingMessage.attachmentName ?? message.attachmentName,
            attachmentType: pendingMessage.attachmentType ?? message.attachmentType,
            stickerUrl: pendingMessage.stickerUrl ?? message.stickerUrl,
            stickerName: pendingMessage.stickerName ?? message.stickerName,
            renderKey: pendingMessage.id,
          }
        : { ...message, renderKey: pendingMessage.id },
    );
  }

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
  hasMoreOlder = false,
  loadingOlder = false,
  onLoadOlder,
  me,
  members,
  messagesRef,
  initialScrollAllowedRef,
  wasPinnedRef,
  shownTranscriptIds,
  onToggleTranscript,
  onScroll,
  onOpenProfile,
  onOpenImage,
  activeSearchMatchId,
  highlightQuery,
  onOpenMessageMenu,
  onOpenMessageMenuAt,
  onReactToMessage,
  onOpenReactionPicker,
  onSwipeReply,
  onJoinGroupCall,
  activeCallId,
  groupCallStatesById,
  seenByMessageId,
  groupId,
  firstUnreadMessageId,
}: {
  messages: GroupMessage[];
  messagesReady: boolean;
  hasMoreOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => Promise<number>;
  me: { id: string; username: string };
  members: GroupMember[];
  messagesRef: { current: HTMLDivElement | null };
  initialScrollAllowedRef: { current: boolean };
  wasPinnedRef: { current: boolean };
  shownTranscriptIds: Record<string, boolean>;
  onToggleTranscript: (messageId: string, show: boolean) => void;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  onOpenProfile: (user: JaUser) => void;
  onOpenImage: (url: string) => void;
  activeSearchMatchId?: string | null;
  highlightQuery?: string;
  onOpenMessageMenu: (event: MouseEvent, message: GroupMessage) => void;
  onOpenMessageMenuAt: (x: number, y: number, message: GroupMessage) => void;
  onReactToMessage: (message: GroupMessage, emoji: string) => void;
  onOpenReactionPicker: (x: number, y: number, message: GroupMessage) => void;
  onSwipeReply: (message: GroupMessage) => void;
  onJoinGroupCall: (invite: NonNullable<ReturnType<typeof parseGroupCallInvite>>, messageId: string) => void;
  activeCallId: string | null;
  groupCallStatesById: Record<string, { isEnded: boolean; durationSec?: number }>;
  seenByMessageId: Map<string, GroupSeenReader[]>;
  groupId: string;
  firstUnreadMessageId: string | null;
}) {
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );
  const memberByUsername = useMemo(
    () => new Map(members.map((member) => [member.username.toLowerCase(), member])),
    [members],
  );
  const mentionContext = useMemo(
    () => ({
      memberByUsername,
      myUsername: me.username,
      onOpenProfile,
    }),
    [memberByUsername, me.username, onOpenProfile],
  );
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const fetchingOlderRef = useRef(false);

  function cancelBubbleTouchHold() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }

  function startBubblePointerHold(
    event: React.PointerEvent<HTMLDivElement>,
    message: GroupMessage,
  ) {
    if (event.pointerType !== "touch" || message.id.startsWith("pending-")) return;
    longPressOriginRef.current = { x: event.clientX, y: event.clientY };
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    const { clientX, clientY } = event;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      onOpenMessageMenuAt(clientX, clientY, message);
    }, 450);
  }

  function moveBubblePointerHold(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || !longPressOriginRef.current) return;
    const dist = Math.hypot(
      event.clientX - longPressOriginRef.current.x,
      event.clientY - longPressOriginRef.current.y,
    );
    if (dist > 12) cancelBubbleTouchHold();
  }

  const handleMediaLoad = () => {
    if (initialScrollAllowedRef.current || wasPinnedRef.current) {
      const container = messagesRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    }
  };

  const [visibleCount, setVisibleCount] = useState(120);
  const scrollSettleTimerRef = useRef<number | null>(null);
  const [highlightedJumpId, setHighlightedJumpId] = useState<string | null>(null);
  const prependAnchorRef = useRef<{ prevHeight: number; prevTop: number } | null>(null);
  const firstMsgKey = messages[0]?.id ?? "";
  const windowedMessages = useMemo(
    () =>
      messages.length > visibleCount
        ? messages.slice(messages.length - visibleCount)
        : messages,
    [messages, visibleCount],
  );
  void firstMsgKey;

  useEffect(() => {
    if (!groupId) return;
    const attemptJump = () => {
      const pending = getPendingMessageJump("group", groupId);
      if (!pending || messages.length === 0) return;
      const idx = messages.findIndex((m) => m.id === pending.messageId);
      if (idx === -1) return;
      const neededCount = messages.length - idx + 8;
      if (neededCount > visibleCount) {
        setVisibleCount(Math.min(messages.length, neededCount));
        return;
      }
      clearPendingMessageJump(pending.messageId);
      initialScrollAllowedRef.current = false;
      window.requestAnimationFrame(() => {
        const el = document.getElementById(`group-message-${pending.messageId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlightedJumpId(pending.messageId);
          window.setTimeout(() => {
            setHighlightedJumpId((cur) => (cur === pending.messageId ? null : cur));
          }, 2400);
        }
      });
    };
    attemptJump();
    return subscribeMessageJumps(() => {
      attemptJump();
    });
  }, [groupId, initialScrollAllowedRef, messages, visibleCount]);

  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    const el = messagesRef.current;
    if (anchor && el) {
      prependAnchorRef.current = null;
      const delta = el.scrollHeight - anchor.prevHeight;
      if (delta > 0) {
        el.scrollTop = anchor.prevTop + delta;
      }
    }
  }, [windowedMessages.length, messagesRef]);

  useEffect(() => {
    if (!activeSearchMatchId) return;
    const idx = messages.findIndex((m) => m.id === activeSearchMatchId);
    if (idx >= 0) {
      const needed = messages.length - idx + 8;
      if (needed > visibleCount) {
        setVisibleCount(Math.min(messages.length, needed));
        return;
      }
    }
    window.requestAnimationFrame(() => {
      document
        .getElementById(`group-message-${activeSearchMatchId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [activeSearchMatchId, messages, visibleCount]);

  const canRevealMoreLocal = visibleCount < messages.length;
  const canLoadOlderAny = canRevealMoreLocal || hasMoreOlder;

  const triggerRevealOrFetchOlder = () => {
    const el = messagesRef.current;
    if (!el || prependAnchorRef.current) return;
    if (visibleCount < messages.length) {
      prependAnchorRef.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop };
      setVisibleCount((cur) => Math.min(messages.length, cur + 60));
      return;
    }
    if (hasMoreOlder && onLoadOlder && !loadingOlder && !fetchingOlderRef.current) {
      fetchingOlderRef.current = true;
      void onLoadOlder()
        .then((added) => {
          if (added > 0 && messagesRef.current) {
            prependAnchorRef.current = {
              prevHeight: messagesRef.current.scrollHeight,
              prevTop: messagesRef.current.scrollTop,
            };
            setVisibleCount((cur) => cur + Math.min(80, added));
          }
        })
        .finally(() => {
          fetchingOlderRef.current = false;
        });
    }
  };

  useEffect(
    () => () => {
      if (scrollSettleTimerRef.current !== null) {
        window.clearTimeout(scrollSettleTimerRef.current);
      }
    },
    [],
  );

  const handleGroupScroll = (event: React.UIEvent<HTMLDivElement>) => {
    onScroll(event);
    if (!canLoadOlderAny) return;
    if (scrollSettleTimerRef.current !== null) {
      window.clearTimeout(scrollSettleTimerRef.current);
    }
    scrollSettleTimerRef.current = window.setTimeout(() => {
      scrollSettleTimerRef.current = null;
      const el = messagesRef.current;
      if (el && el.scrollTop < 120) {
        triggerRevealOrFetchOlder();
      }
    }, 140);
  };

  return (
    <div
      className="messages group-messages"
      ref={messagesRef}
      onScroll={handleGroupScroll}
      onWheel={() => {
        initialScrollAllowedRef.current = false;
      }}
      onPointerDown={() => {
        initialScrollAllowedRef.current = false;
      }}
    >
      {canLoadOlderAny && windowedMessages.length > 0 && (
        <div className="older-messages-bar">
          <button
            type="button"
            className="older-messages-btn"
            disabled={loadingOlder}
            onClick={triggerRevealOrFetchOlder}
          >
            {loadingOlder ? "Loading older messages…" : "Load older messages"}
          </button>
        </div>
      )}
      {!messagesReady && windowedMessages.length === 0 && (
        <div className="empty-box center">
          <div className="spinner" style={{ width: 28, height: 28 }} />
          <span className="muted small">Loading group messages…</span>
        </div>
      )}
      {messagesReady && windowedMessages.length === 0 && (
        <div className="empty-box center">
          <strong>
            This is the beginning of the group{" "}
            <SparklesIcon size={16} style={{ color: "var(--accent)" }} />
          </strong>
          <span className="muted small">
            Say hello, share photos or stickers, or mention a member with <code>@username</code>!
          </span>
        </div>
      )}
      {windowedMessages.map((message, index) => {
        const day = fmtDay(message.createdAt);
        const showDay = index === 0 || fmtDay(windowedMessages[index - 1].createdAt) !== day;
        const mine = message.senderId === me.id;
        const wpSignal = !message.unsentAt
          ? parseWallpaperSignal(message.body, message.attachmentUrl)
          : null;
        if (wpSignal) {
          const actor = mine
            ? "You"
            : message.senderName || wpSignal.actorName || "A moderator";
          return (
            <Fragment key={message.renderKey ?? message.id}>
              {showDay && <div className="day-divider">{day}</div>}
              <div className="wallpaper-event-pill" id={`group-message-${message.id}`}>
                <ImageIcon size={13} /> {actor}{" "}
                {wpSignal.kind === "none"
                  ? "reset the group wallpaper"
                  : "changed the group wallpaper"}
              </div>
            </Fragment>
          );
        }
        const groupCallInvite = !message.unsentAt ? parseGroupCallInvite(message.body) : null;
        const viewOnceEnv =
          !message.unsentAt && !groupCallInvite
            ? parseViewOnceEnvelope(message.body, {
                url: message.attachmentUrl,
                name: message.attachmentName,
                type: message.attachmentType,
              })
            : null;
        const isViewOnce = Boolean(viewOnceEnv);
        const isAudioNote =
          !isViewOnce && isVoiceNoteOrAudio(message.attachmentType, message.attachmentName);
        const isImage =
          !isViewOnce &&
          !isAudioNote &&
          isImageAttachment(
            message.attachmentType,
            message.attachmentName,
            message.attachmentUrl,
          );
        const isVideo =
          !isViewOnce &&
          !isAudioNote &&
          (message.attachmentType?.startsWith("video/") ||
            /\.(mp4|m4v|mov|webm|ogg)$/i.test(message.attachmentName ?? ""));
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

        const isJustArrived =
          message.id.startsWith("pending-") ||
          Date.now() - message.createdAt < 2_500;

        return (
          <Fragment key={message.renderKey ?? message.id}>
            {showDay && <div className="day-divider">{day}</div>}
            {firstUnreadMessageId === message.id && (
              <div className="unread-messages-divider" role="separator">
                <span>Unread messages</span>
              </div>
            )}
            <div
              className={`msg-row group-msg-row ${mine ? "mine" : "theirs"} ${
                isJustArrived ? "msg-just-arrived" : ""
              } ${
                highlightedJumpId === message.id || activeSearchMatchId === message.id
                  ? "jump-highlight-pulse"
                  : ""
              }`}
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
                <div className={`group-bubble-line ${mine ? "mine" : "theirs"}`}>
                  {!mine && (
                    <Avatar
                      user={senderUser}
                      size={34}
                      ringWidth={2}
                      onClick={() => onOpenProfile(senderUser)}
                    />
                  )}
                  <SwipeToReply
                    disabled={Boolean(message.unsentAt) || message.id.startsWith("pending-")}
                    onReply={() => onSwipeReply(message)}
                  >
                    <DecoratedMessageBubble
                      key={message.unsentAt ? "unsent" : "live"}
                      styleId={groupCallInvite ? "default" : (message.bubbleStyle ?? "default")}
                      mine={mine}
                      unsent={Boolean(message.unsentAt)}
                      className={`${mine ? "mine" : "theirs"} ${mentionedMe ? "bubble-mentioned" : ""}`}
                      onContextMenu={
                        message.id.startsWith("pending-")
                          ? undefined
                          : (event) => onOpenMessageMenu(event, message)
                      }
                      onPointerDown={(event) => startBubblePointerHold(event, message)}
                      onPointerMove={moveBubblePointerHold}
                      onPointerUp={cancelBubbleTouchHold}
                      onPointerCancel={cancelBubbleTouchHold}
                    >
                      {!message.unsentAt &&
                        (message.forwardedContext || message.forwardedFromName) && (
                          <ForwardedMessageCard
                            context={message.forwardedContext}
                            legacySenderName={message.forwardedFromName}
                            fallbackTimestamp={message.createdAt}
                          />
                        )}
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
                          <span>
                            {formatPreviewMessageText(message.replyTo.body) || (
                              <>
                                <PaperclipIcon size={12} /> Attachment
                              </>
                            )}
                          </span>
                        </button>
                      )}
                      {message.unsentAt ? (
                        <p className="unsent-copy">This message was unsent</p>
                      ) : groupCallInvite ? (
                        (() => {
                          const resolvedState = groupCallStatesById[groupCallInvite.callId];
                          const isCallEnded =
                            groupCallInvite.state === "ended" || Boolean(resolvedState?.isEnded);
                          const finalDurationSec =
                            resolvedState?.durationSec ?? groupCallInvite.durationSec;
                          const isUserInCall = !isCallEnded && activeCallId === groupCallInvite.callId;
                          const isVideoCall = groupCallInvite.mode === "video";

                          return (
                            <div
                              className={`call-msg-card group-call-msg-card ${
                                isCallEnded ? "ended" : "live"
                              }`}
                            >
                              <div className={`call-msg-icon ${isCallEnded ? "ended" : "live"}`}>
                                {isVideoCall ? <Video size={18} /> : <Phone size={18} />}
                              </div>
                              <div className="call-msg-info">
                                <div className="call-msg-title">
                                  {isCallEnded
                                    ? "GC VC Ended"
                                    : isVideoCall
                                      ? "Group Video Call"
                                      : "Group Voice Call"}
                                </div>
                                <div className="call-msg-sub">
                                  {isCallEnded
                                    ? `${
                                        finalDurationSec
                                          ? `${formatCallDuration(finalDurationSec)} · `
                                          : ""
                                      }Started by ${groupCallInvite.hostName}`
                                    : isUserInCall
                                      ? "Live · You're in this call"
                                      : `Live · ${groupCallInvite.hostName} started a call`}
                                </div>
                              </div>
                              {!isCallEnded && !isUserInCall && (
                                <button
                                  type="button"
                                  className="call-msg-action-btn group-join-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onJoinGroupCall(groupCallInvite, message.id);
                                  }}
                                >
                                  {isVideoCall ? <Video size={13} /> : <Phone size={13} />}
                                  <span>Join</span>
                                </button>
                              )}
                            </div>
                          );
                        })()
                      ) : viewOnceEnv ? (
                        <ViewOnceMessageBubble
                          messageId={message.id}
                          senderName={
                            mine ? "You" : message.senderName || senderUser.displayName
                          }
                          envelope={viewOnceEnv}
                          mine={mine}
                        />
                      ) : (
                      <>
                        {message.attachmentUrl &&
                          (isAudioNote ? (
                            <VoiceNotePlayer
                              messageId={message.id}
                              audioUrl={message.attachmentUrl}
                              attachmentType={message.attachmentType}
                              mine={mine}
                              showTranscript={Boolean(shownTranscriptIds[message.id])}
                              onToggleTranscript={(show) => onToggleTranscript(message.id, show)}
                              onOpenContextAt={
                                message.id.startsWith("pending-")
                                  ? undefined
                                  : (x, y) => onOpenMessageMenuAt(x, y, message)
                              }
                            />
                          ) : isImage ? (
                            <button
                              type="button"
                              className="image-message-button"
                              onClick={() => onOpenImage(message.attachmentUrl!)}
                              aria-label="Open image viewer"
                            >
                              <ChatAttachmentImage
                                className="msg-image"
                                src={message.attachmentUrl}
                                alt={message.attachmentName ?? "attachment"}
                                maxWidth={420}
                                maxHeight={420}
                                onLoad={handleMediaLoad}
                              />
                            </button>
                          ) : isVideo ? (
                            <ChatVideoPlayer
                              src={message.attachmentUrl}
                              name={message.attachmentName}
                            />
                          ) : (
                            <a
                              className="file-chip"
                              href={message.attachmentUrl}
                              download={message.attachmentName ?? "file"}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <PaperclipIcon size={14} /> {message.attachmentName ?? "Attachment"}
                            </a>
                          ))}
                        {message.stickerUrl && (
                          <button
                            type="button"
                            className="image-message-button sticker-message-button"
                            onClick={() => onOpenImage(message.stickerUrl!)}
                            aria-label="Open sticker viewer"
                          >
                            <ChatAttachmentImage
                              className="group-message-sticker"
                              src={message.stickerUrl}
                              alt={message.stickerName ?? "Sticker"}
                              maxWidth={220}
                              maxHeight={220}
                              onLoad={handleMediaLoad}
                            />
                          </button>
                        )}
                        {message.body && (
                          <>
                            <MessageMarkdown
                              text={message.body}
                              mine={mine}
                              mentionContext={mentionContext}
                              highlightQuery={highlightQuery}
                            />
                            <MessageLinkEmbeds text={message.body} />
                          </>
                        )}
                      </>
                    )}
                    </DecoratedMessageBubble>
                  </SwipeToReply>
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
                      {!message.unsentAt && (
                        <button
                          type="button"
                          className="reaction-chip reaction-add-chip"
                          onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            onOpenReactionPicker(
                              rect.left + rect.width / 2,
                              rect.top,
                              message,
                            );
                          }}
                          title="Add another reaction"
                          aria-label="Add another reaction"
                        >
                          <PlusIcon size={13} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  )}
                  <span className="msg-time">
                    {fmtTime(message.createdAt)}
                    {!groupCallInvite && message.editedAt ? " · Edited" : ""}
                  </span>
                  {(() => {
                    const seenReaders = seenByMessageId.get(message.id);
                    if (!seenReaders || seenReaders.length === 0) return null;
                    const namesLabel = `Seen by ${seenReaders.map((r) => r.displayName).join(", ")}`;
                    return (
                      <div
                        className="group-seen-row"
                        title={namesLabel}
                        aria-label={namesLabel}
                      >
                        <div className="group-seen-avatars">
                          {seenReaders.slice(0, 6).map((reader) => (
                            <span
                              key={reader.id}
                              className="group-seen-avatar-wrap"
                              onClick={() =>
                                onOpenProfile({
                                  id: reader.id,
                                  displayName: reader.displayName,
                                  username: reader.username,
                                  bio: "",
                                  pronouns: "",
                                  avatarColor: reader.avatarColor,
                                  avatarUrl: reader.avatarUrl,
                                  onboardingComplete: true,
                                })
                              }
                            >
                              <Avatar user={reader} size={16} ringWidth={1} />
                            </span>
                          ))}
                        </div>
                        {seenReaders.length > 6 && (
                          <span className="group-seen-overflow">
                            +{seenReaders.length - 6}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
});

const GroupChatComposer = memo(function GroupChatComposer({
  groupId,
  initialDraft,
  members,
  summaryMemberCount,
  myId,
  canMentionEveryone,
  activityByUserId,
  hasFile,
  viewOnceActive,
  onToggleViewOnce,
  hasForwardedMessage,
  isEditing,
  busy,
  recordingVoiceNote,
  composerRef,
  fileInputRef,
  onAddFiles,
  onSelectSticker,
  onStartVoiceNote,
  onCancelVoiceNote,
  onSendVoiceNote,
  onVoiceError,
  onMobileActivate,
  onTypingSignal,
  onSubmitDraft,
}: {
  groupId: string;
  initialDraft: string;
  members: GroupMember[];
  summaryMemberCount: number;
  myId: string;
  canMentionEveryone: boolean;
  activityByUserId: Map<string, FriendActivity>;
  hasFile: boolean;
  viewOnceActive: boolean;
  onToggleViewOnce: () => void;
  hasForwardedMessage: boolean;
  isEditing: boolean;
  busy: boolean;
  recordingVoiceNote: boolean;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAddFiles: (files: File[]) => void;
  onSelectSticker: (sticker: StickerMedia) => Promise<void>;
  onStartVoiceNote: () => void;
  onCancelVoiceNote: () => void;
  onSendVoiceNote: (file: File) => void;
  onVoiceError: (message: string) => void;
  onMobileActivate: () => void;
  onTypingSignal: (hasText: boolean) => void;
  onSubmitDraft: (body: string) => void;
}) {
  const draftKey = `group:${groupId}`;
  const startText = isEditing ? initialDraft : initialDraft || getDraft(draftKey);
  const [draft, setDraft] = useState(startText);
  const [cursorPos, setCursorPos] = useState(startText.length);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissedAt, setMentionDismissedAt] = useState<number | null>(null);
  const prevLenRef = useRef(startText.length);

  useLayoutEffect(() => {
    const seed = isEditing ? initialDraft : initialDraft || getDraft(draftKey);
    syncComposerTextareaHeight(composerRef.current, 0, seed);
    prevLenRef.current = seed.length;
  }, [composerRef, draftKey, initialDraft, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const el = composerRef.current;
    if (!el) return;
    const raf = window.requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      const end = el.value.length;
      el.setSelectionRange(end, end);
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [composerRef, isEditing]);

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
    if (canMentionEveryone && "everyone".includes(q)) {
      const count = members.length || summaryMemberCount;
      list.push({
        kind: "everyone",
        handle: "everyone",
        displayName: "@everyone",
        subtitle: count > 0 ? `Notify all ${count} members in this group` : "Notify everyone in this group",
      });
    }
    const matchingMembers = members
      .filter(
        (member) =>
          member.id !== myId &&
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
  }, [activeMentionMatch, canMentionEveryone, members, myId, summaryMemberCount]);

  const safeMentionIndex =
    mentionCandidates.length > 0 ? Math.min(mentionIndex, mentionCandidates.length - 1) : 0;

  function applyMention(handle: string) {
    if (!activeMentionMatch) return;
    const before = draft.slice(0, activeMentionMatch.start);
    const after = draft.slice(cursorPos);
    const insertion = `@${handle} `;
    const nextDraft = `${before}${insertion}${after.replace(/^\s+/, "")}`;
    const nextCursor = before.length + insertion.length;
    const prevLen = prevLenRef.current;
    prevLenRef.current = nextDraft.length;
    setDraft(nextDraft);
    if (!isEditing) saveStoredDraft(draftKey, nextDraft);
    setCursorPos(nextCursor);
    setMentionIndex(0);
    setMentionDismissedAt(null);
    syncComposerTextareaHeight(composerRef.current, prevLen, nextDraft);
    window.requestAnimationFrame(() => {
      const el = composerRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
    });
  }

  function handleDraftChange(value: string, selectionStart?: number | null) {
    const prevLen = prevLenRef.current;
    prevLenRef.current = value.length;
    setDraft(value);
    if (!isEditing) saveStoredDraft(draftKey, value);
    // Only update cursor/mention state when '@' is present so normal typing does 1 state update!
    if (value.includes("@") || activeMentionMatch !== null) {
      setCursorPos(selectionStart ?? value.length);
      setMentionIndex(0);
      setMentionDismissedAt(null);
    }
    syncComposerTextareaHeight(composerRef.current, prevLen, value);
    if (!isEditing) {
      onTypingSignal(Boolean(value.trim()));
    }
  }

  function onComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (isEditing) return;
    const pasted = extractClipboardFile(event.clipboardData);
    if (pasted) {
      event.preventDefault();
      onAddFiles([pasted]);
    }
  }

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = draft.trim();
    if (isEditing ? !trimmed : !trimmed && !hasFile && !hasForwardedMessage) return;
    const keepFocus =
      document.activeElement === composerRef.current && isSoftKeyboardCurrentlyOpen();
    prevLenRef.current = 0;
    setDraft("");
    if (!isEditing) clearDraft(draftKey);
    setCursorPos(0);
    setMentionIndex(0);
    setMentionDismissedAt(null);
    syncComposerTextareaHeight(composerRef.current, trimmed.length, "");
    onSubmitDraft(trimmed);
    if (keepFocus) {
      composerRef.current?.focus({ preventScroll: true });
    }
  }

  return (
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

      {recordingVoiceNote ? (
        <div className="composer voice-composer-active">
          <VoiceNoteRecorder
            onCancel={onCancelVoiceNote}
            onSendVoiceNote={onSendVoiceNote}
            onError={onVoiceError}
          />
        </div>
      ) : (
        <form className="composer" onSubmit={handleSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []);
              if (picked.length > 0) onAddFiles(picked);
              event.currentTarget.value = "";
            }}
          />
          <ComposerPlusMenu
            targetKind="group"
            targetId={groupId}
            targetLabel="Group chat"
            disabled={busy || isEditing}
            currentDraft={draft}
            onConsumeDraft={() => handleDraftChange("", 0)}
            onUploadAttachment={() => fileInputRef.current?.click()}
            viewOnceActive={viewOnceActive}
            onToggleViewOnce={onToggleViewOnce}
          />
          <StickerPicker
            friendId=""
            disabled={busy || isEditing}
            onSelect={onSelectSticker}
          />
          <button
            type="button"
            className="icon-btn voice-note-btn"
            title="Record voice note"
            aria-label="Record voice note"
            disabled={busy || isEditing}
            onClick={onStartVoiceNote}
          >
            <MicVoiceIcon size={18} />
          </button>
          <div className={`composer-input-shell ${viewOnceActive && !isEditing ? "has-viewonce" : ""}`}>
            <textarea
              ref={composerRef}
              value={draft}
              maxLength={4000}
              onChange={(event) =>
                handleDraftChange(event.target.value, event.currentTarget.selectionStart)
              }
              onFocus={onMobileActivate}
              onClick={(event) => {
                onMobileActivate();
                if (draft.includes("@")) {
                  setCursorPos(event.currentTarget.selectionStart ?? 0);
                }
              }}
              onKeyUp={(event) => {
                if (
                  draft.includes("@") &&
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
              placeholder={
                isEditing
                  ? "Edit message…"
                  : viewOnceActive
                    ? "View once message…"
                    : "Message…"
              }
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
                  handleSubmit();
                }
              }}
            />
            {viewOnceActive && !isEditing && (
              <button
                type="button"
                className="composer-viewonce-badge"
                title="View once enabled (click to turn off)"
                aria-label="Disable view once"
                onClick={onToggleViewOnce}
              >
                <ViewOnceRingIcon size={17} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="send-btn"
            disabled={isEditing ? !draft.trim() : !draft.trim() && !hasFile && !hasForwardedMessage}
            onPointerDown={(event) => event.preventDefault()}
            onMouseDown={(event) => event.preventDefault()}
            aria-label={isEditing ? "Save edit" : "Send message"}
          >
            {isEditing ? <CheckIcon size={19} strokeWidth={2.6} /> : <SendIcon size={18} />}
          </button>
        </form>
      )}
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
  const toggleGroupReaction = store.toggleGroupReaction;
  const sendGroupSticker = store.sendGroupSticker;
  const soundsEnabled = store.soundsEnabled;
  const groupCall = useGroupCall();
  const summary = store.groups.find((entry) => entry.id === groupId);
  const group = store.groupDetails?.id === groupId ? store.groupDetails : null;

  const [composerSeed, setComposerSeed] = useState({ nonce: 0, text: "" });
  const [bubbleStyleOpen, setBubbleStyleOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [headerMoreMenu, setHeaderMoreMenu] = useState<{
    x: number;
    y: number;
    closing?: boolean;
  } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmRemoveChatOpen, setConfirmRemoveChatOpen] = useState(false);
  const [firstUnreadGroupMsgId, setFirstUnreadGroupMsgId] = useState<string | null>(null);
  const capturedUnreadForGroupRef = useRef<string | null>(null);
  const isMobileWallpaper = useIsMobileWallpaperSupported();
  const [files, setFiles] = useState<File[]>([]);
  const [viewOnceActive, setViewOnceActive] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  const pinnedMessages = usePinnedMessages(`group:${groupId ?? ""}`);
  const [recordingVoiceNote, setRecordingVoiceNote] = useState(false);
  const [shownTranscriptIds, setShownTranscriptIds] = useState<Record<string, boolean>>({});
  const [deletedUndoState, setDeletedUndoState] = useState<DeletedForMeUndoState | null>(null);
  const [locallyHiddenIds, setLocallyHiddenIds] = useState<Record<string, true>>({});
  const deletedSnapshotRef = useRef<Map<string, GroupMessage>>(new Map());
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<GroupMessage | null>(null);
  const [forwardedMessage, setForwardedMessage] = useState<GroupMessage | null>(null);

  // Advanced Group Settings modal state
  const [showManage, setShowManage] = useState(false);
  const [manageClosing, setManageClosing] = useState(false);
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
  const [reactionTarget, setReactionTarget] = useState<{
    x: number;
    y: number;
    message: GroupMessage;
  } | null>(null);
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
  const rawGroupMessages = useMemo(
    () => (groupId ? store.groupMessages : EMPTY_GROUP_MESSAGES),
    [groupId, store.groupMessages],
  );
  const conversationMessages = useMemo(
    () => rawGroupMessages.filter((m) => !isHiddenCallSignal(m.body)),
    [rawGroupMessages],
  );

  const [callStateTick, setCallStateTick] = useState(0);
  const [inspectingMessage, setInspectingMessage] = useState<GroupMessage | null>(null);
  const [copiedGroupKey, setCopiedGroupKey] = useState(false);
  const e2ee = useE2EESnapshot();
  const groupEpochsMap = groupId ? e2ee.groupEpochs[groupId] : undefined;
  const latestGroupEpoch = useMemo(() => {
    if (!groupEpochsMap) return undefined;
    const nums = Object.keys(groupEpochsMap)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return undefined;
    return groupEpochsMap[Math.max(...nums)];
  }, [groupEpochsMap]);
  useEffect(() => {
    const hasPotentialActiveInvite = conversationMessages.some((m) => {
      if (m.unsentAt) return false;
      const inv = parseGroupCallInvite(m.body);
      return Boolean(inv && inv.state !== "ended");
    });
    if (!hasPotentialActiveInvite) return;
    const timer = window.setInterval(() => {
      setCallStateTick((t) => t + 1);
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [conversationMessages]);

  const activeGroupCallId =
    groupCall.groupSession && groupCall.groupSession.phase !== "incoming"
      ? groupCall.groupSession.callId
      : null;

  const groupCallStatesById = useMemo(() => {
    void callStateTick;
    const out: Record<string, { isEnded: boolean; durationSec?: number }> = {};
    for (const msg of conversationMessages) {
      if (msg.unsentAt) continue;
      const inv = parseGroupCallInvite(msg.body);
      if (!inv) continue;
      out[inv.callId] = resolveGroupCallLiveState(
        inv,
        rawGroupMessages,
        activeGroupCallId,
        msg.createdAt,
      );
    }
    return out;
  }, [activeGroupCallId, callStateTick, conversationMessages, rawGroupMessages]);

  const groupSeenData = useMemo(
    () =>
      computeGroupSeenMap(
        rawGroupMessages,
        conversationMessages,
        group?.members ?? EMPTY_GROUP_MEMBERS,
        store.me?.id,
      ),
    [conversationMessages, group?.members, rawGroupMessages, store.me?.id],
  );

  const seenSyncInFlightRef = useRef(false);
  const lastPublishedSeenTsRef = useRef<Record<string, number>>({});
  const initialUnreadCutoffRef = useRef<{ groupId: string | null; cutoff: number }>({
    groupId: null,
    cutoff: Number.POSITIVE_INFINITY,
  });

  // Snapshot the pre-open unread cutoff synchronously when switching into a group
  if (initialUnreadCutoffRef.current.groupId !== groupId) {
    capturedUnreadForGroupRef.current = null;
    let cutoff = Number.POSITIVE_INFINITY;
    if (groupId && store.me?.id) {
      const prefs = getUserChatPrefs(store.me.id).groups[groupId];
      if (prefs && prefs.unreadTimestamps.length > 0) {
        cutoff = Math.max(prefs.lastReadAt, prefs.clearedAt ?? 0);
      }
    }
    initialUnreadCutoffRef.current = { groupId, cutoff };
  }

  // Reset divider state when switching groups
  useEffect(() => {
    setFirstUnreadGroupMsgId(null);
  }, [groupId]);

  const myLatestSentGroupTs = useMemo(() => {
    if (!store.me?.id) return 0;
    let maxTs = 0;
    for (const m of conversationMessages) {
      if (m.senderId === store.me.id && m.createdAt > maxTs) {
        maxTs = m.createdAt;
      }
    }
    return maxTs;
  }, [conversationMessages, store.me?.id]);

  // Capture initial first-unread boundary when opening group chat (strictly after my own latest reply)
  useEffect(() => {
    if (!groupId || !store.groupMessagesReady || capturedUnreadForGroupRef.current === groupId) {
      return;
    }
    capturedUnreadForGroupRef.current = groupId;
    const baseCutoff = initialUnreadCutoffRef.current.cutoff;
    if (!Number.isFinite(baseCutoff) || conversationMessages.length === 0) {
      setFirstUnreadGroupMsgId(null);
      return;
    }
    const effectiveCutoff = Math.max(baseCutoff, myLatestSentGroupTs);
    const firstUnread = conversationMessages.find(
      (m) =>
        m.senderId !== store.me?.id &&
        !m.unsentAt &&
        !isHiddenCallSignal(m.body) &&
        m.createdAt > effectiveCutoff,
    );
    setFirstUnreadGroupMsgId(firstUnread?.id ?? null);
  }, [
    conversationMessages,
    groupId,
    myLatestSentGroupTs,
    store.groupMessagesReady,
    store.me?.id,
  ]);

  // Clear UNREAD MESSAGES divider immediately on sending a message, "Mark as done", or after active reading
  const prevMySentGroupTsRef = useRef(0);
  useEffect(() => {
    if (pendingMessages.length > 0) {
      setFirstUnreadGroupMsgId(null);
    }
  }, [pendingMessages.length]);

  useEffect(() => {
    if (
      prevMySentGroupTsRef.current > 0 &&
      myLatestSentGroupTs > prevMySentGroupTsRef.current
    ) {
      setFirstUnreadGroupMsgId(null);
    }
    prevMySentGroupTsRef.current = myLatestSentGroupTs;
  }, [myLatestSentGroupTs]);

  useEffect(() => {
    if (!firstUnreadGroupMsgId || !groupId) return;
    let timer: number | null = null;
    let cancelled = false;
    void isChatActivelyVisibleToUser().then((visible) => {
      if (cancelled || !visible) return;
      timer = window.setTimeout(() => {
        setFirstUnreadGroupMsgId(null);
      }, 4500);
    });
    const onMarkedDone = (e: Event) => {
      const detail = (e as CustomEvent<{ groupId?: string }>).detail;
      if (detail?.groupId === groupId) {
        setFirstUnreadGroupMsgId(null);
      }
    };
    window.addEventListener(CONVERSATION_MARKED_READ_EVENT, onMarkedDone);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener(CONVERSATION_MARKED_READ_EVENT, onMarkedDone);
    };
  }, [firstUnreadGroupMsgId, groupId]);

  const {
    activeGroupId,
    editGroupMessage,
    markGroupRead,
    me: currentGroupMe,
    sendGroupMessage,
  } = store;

  // Publish / update our single in-place seen cursor row & mark local unread cleared when actively viewing
  useEffect(() => {
    if (!groupId || !currentGroupMe?.id || activeGroupId !== groupId) {
      return;
    }
    let cancelled = false;

    const maybePublishSeen = async () => {
      if (cancelled || activeGroupId !== groupId) return;
      const activelyViewing = await isChatActivelyVisibleToUser();
      if (cancelled || !activelyViewing) return;

      void markGroupRead(groupId).catch(() => undefined);

      if (seenSyncInFlightRef.current || conversationMessages.length === 0) return;

      let latestVisible: GroupMessage | null = null;
      for (let i = conversationMessages.length - 1; i >= 0; i -= 1) {
        if (!conversationMessages[i].unsentAt) {
          latestVisible = conversationMessages[i];
          break;
        }
      }
      if (!latestVisible || latestVisible.senderId === currentGroupMe.id) return;

      const prevPublished = lastPublishedSeenTsRef.current[groupId] ?? 0;
      const effectiveKnownSeen = Math.max(groupSeenData.mySeenUpToTs, prevPublished);
      if (latestVisible.createdAt <= effectiveKnownSeen) return;

      seenSyncInFlightRef.current = true;
      lastPublishedSeenTsRef.current[groupId] = latestVisible.createdAt;
      const payload = serializeGroupSeenSignal({
        v: 1,
        messageId: latestVisible.id,
        seenUpToTs: latestVisible.createdAt,
        ts: Date.now(),
      });

      const op = groupSeenData.myCursorMessageId
        ? editGroupMessage(groupSeenData.myCursorMessageId, payload)
        : sendGroupMessage(groupId, payload);

      void op
        .catch(() => {
          lastPublishedSeenTsRef.current[groupId] = groupSeenData.mySeenUpToTs;
        })
        .finally(() => {
          seenSyncInFlightRef.current = false;
        });
    };

    void maybePublishSeen();
    const onVisOrFocus = () => {
      void maybePublishSeen();
    };
    document.addEventListener("visibilitychange", onVisOrFocus);
    window.addEventListener("focus", onVisOrFocus);
    const nativeSub = Capacitor.isNativePlatform()
      ? CapacitorApp.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            window.setTimeout(() => void maybePublishSeen(), 150);
          }
        })
      : null;
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisOrFocus);
      window.removeEventListener("focus", onVisOrFocus);
      if (nativeSub) {
        void nativeSub.then((h) => h.remove());
      }
    };
  }, [
    activeGroupId,
    conversationMessages,
    currentGroupMe?.id,
    editGroupMessage,
    groupId,
    groupSeenData.myCursorMessageId,
    groupSeenData.mySeenUpToTs,
    markGroupRead,
    sendGroupMessage,
  ]);

  // Hydrate group call history entries cleanly into Calls tab (normalized to ended when nobody is in the call)
  useEffect(() => {
    if (!groupId || !store.me || conversationMessages.length === 0) return;
    const grpName = group?.name ?? summary?.name ?? "Group chat";
    const grpAvatar = group?.avatarUrl ?? summary?.avatarUrl;
    const memberCount = group?.members.length ?? summary?.memberCount ?? 2;
    for (const msg of conversationMessages) {
      if (msg.unsentAt) continue;
      const inv = parseGroupCallInvite(msg.body);
      if (!inv) continue;
      const stateInfo = groupCallStatesById[inv.callId];
      const isEnded = inv.state === "ended" || Boolean(stateInfo?.isEnded);
      upsertCallHistoryEntry({
        callId: inv.callId,
        kind: "group",
        peerId: groupId,
        peerDisplayName: grpName,
        peerUsername: `${memberCount} members`,
        peerAvatarUrl: grpAvatar,
        peerAvatarColor: "purple",
        groupId,
        groupName: grpName,
        groupAvatarUrl: grpAvatar,
        direction: msg.senderId === store.me.id ? "outgoing" : "incoming",
        mode: inv.mode,
        state: isEnded ? "ended" : "connected",
        durationSec: stateInfo?.durationSec ?? inv.durationSec,
        timestamp: msg.createdAt || inv.ts || Date.now(),
      });
    }
  }, [
    conversationMessages,
    group?.avatarUrl,
    group?.members.length,
    group?.name,
    groupCallStatesById,
    groupId,
    store.me,
    summary?.avatarUrl,
    summary?.memberCount,
    summary?.name,
  ]);

  const activeGroupCallMessage = useMemo(() => {
    const memberCount = group?.members.length ?? summary?.memberCount ?? 2;
    for (let i = conversationMessages.length - 1; i >= 0; i -= 1) {
      const msg = conversationMessages[i];
      if (msg.unsentAt) continue;
      const invite = parseGroupCallInvite(msg.body);
      if (!invite) continue;
      const resolved = groupCallStatesById[invite.callId];
      const declinedHere =
        groupCall.declinedGroupCallIds.has(invite.callId) && memberCount <= 2;
      if (!resolved?.isEnded && invite.state !== "ended" && !declinedHere) {
        return { invite, messageId: msg.id };
      }
    }
    return null;
  }, [
    conversationMessages,
    group?.members.length,
    groupCall.declinedGroupCallIds,
    groupCallStatesById,
    summary?.memberCount,
  ]);
  const conversationReady = Boolean(groupId) && store.groupMessagesReady;
  const isMuted = group?.members.find((member) => member.id === store.me?.id)?.muted ?? false;

  const { messages: rawDisplayedMessages, matchedPendingIds } = useMemo(
    () => getConversationMessages(pendingMessages, conversationMessages, store.me?.id),
    [conversationMessages, pendingMessages, store.me?.id],
  );
  const visibleRawDisplayedMessages = useMemo(
    () =>
      rawDisplayedMessages.filter(
        (m) => !locallyHiddenIds[m.id] && !(m.renderKey && locallyHiddenIds[m.renderKey]),
      ),
    [locallyHiddenIds, rawDisplayedMessages],
  );
  const displayedMessages = useUnsendThanosWatcher(
    visibleRawDisplayedMessages,
    `group:${groupId ?? ""}`,
  );
  const searchMatchIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!searchOpen || !q) return [];
    return displayedMessages
      .filter(
        (m) =>
          !m.unsentAt &&
          !isViewOnceBody(m.body) &&
          (formatPreviewMessageText(m.body).toLowerCase().includes(q) ||
            (m.attachmentName ?? "").toLowerCase().includes(q)),
      )
      .map((m) => m.id);
  }, [displayedMessages, searchOpen, searchQuery]);
  const safeSearchMatchIdx =
    searchMatchIds.length > 0 ? Math.min(searchMatchIdx, searchMatchIds.length - 1) : 0;
  const activeSearchMatchId =
    searchMatchIds.length > 0 ? searchMatchIds[safeSearchMatchIdx] : null;
  const lastDisplayedKey = displayedMessages.at(-1)?.id ?? "";
  const lastDisplayedSenderId = displayedMessages.at(-1)?.senderId ?? "";

  const activityByUserId = useMemo(() => {
    const map = new Map<string, FriendActivity>();
    for (const activity of store.friendActivities) map.set(activity.userId, activity);
    return map;
  }, [store.friendActivities]);

  const meSummary = useMemo(
    () => ({ id: store.me?.id ?? "", username: store.me?.username ?? "" }),
    [store.me?.id, store.me?.username],
  );

  const handleToggleTranscript = useCallback((id: string, show: boolean) => {
    setShownTranscriptIds((prev) => ({ ...prev, [id]: show }));
  }, []);

  const handleStartVoiceNote = useCallback(() => {
    setRecordingVoiceNote(true);
  }, []);

  const handleCancelVoiceNote = useCallback(() => {
    setRecordingVoiceNote(false);
  }, []);

  const {
    pinToBottomBurst,
    handleMobileComposerActivate,
  } = useChatAutoScrollAndKeyboard({
    conversationKey: `group:${groupId ?? ""}`,
    messagesReady: conversationReady,
    messageCount: displayedMessages.length,
    tailMessageKey: lastDisplayedKey,
    tailSenderId: lastDisplayedSenderId,
    myUserId: store.me?.id,
    messagesRef,
    composerRef,
    onPinnedChange: (pinned) => {
      wasPinnedRef.current = pinned;
    },
  });

  const scrollToBottom = useCallback(() => {
    pinToBottomBurst();
  }, [pinToBottomBurst]);

  const handleMessagesScroll = useCallback((_event: UIEvent<HTMLDivElement>) => {
    // `useChatAutoScrollAndKeyboard` already updates `wasPinnedRef` via a single rAF-coalesced listener.
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
    setManageClosing(false);
    setShowManage(true);
  }

  function closeManageModal() {
    if (manageClosing) return;
    setManageClosing(true);
    window.setTimeout(() => {
      if (groupAvatarState.kind === "new") URL.revokeObjectURL(groupAvatarState.preview);
      setGroupAvatarState({ kind: "keep" });
      setShowManage(false);
      setManageClosing(false);
    }, 185);
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

  const prevDisplayedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    prevDisplayedKeyRef.current = null;
  }, [groupId]);

  // Keep pinned to bottom when new messages arrive or when you send a message
  useLayoutEffect(() => {
    if (!conversationReady || !lastDisplayedKey) return;
    const isNewTailMessage = prevDisplayedKeyRef.current !== lastDisplayedKey;
    prevDisplayedKeyRef.current = lastDisplayedKey;
    if (
      initialScrollAllowedRef.current ||
      wasPinnedRef.current ||
      (isNewTailMessage && lastDisplayedSenderId === store.me?.id)
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

  const publishTyping = useCallback(
    (isTyping: boolean) => {
      if (!groupId) return;
      window.setTimeout(() => {
        void setGroupTypingRef.current(groupId, isTyping).catch((err: unknown) => {
          setError(friendlyError(err, "Couldn't update your typing status."));
        });
      }, 0);
    },
    [groupId],
  );

  const handleTypingSignal = useCallback(
    (hasText: boolean) => {
      if (!groupId) return;
      if (!hasText) {
        if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
        if (typingRef.current) {
          typingRef.current = false;
          publishTyping(false);
        }
        return;
      }
      const now = Date.now();
      if (!typingRef.current || now - lastTypingUpdate.current >= 3000) {
        typingRef.current = true;
        lastTypingUpdate.current = now;
        publishTyping(true);
      }
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => {
        typingRef.current = false;
        publishTyping(false);
      }, 3500);
    },
    [groupId, publishTyping],
  );

  const handleSelectSticker = useCallback(
    async (sticker: StickerMedia) => {
      if (!groupId) return;
      try {
        if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
        typingRef.current = false;
        await setGroupTypingRef.current(groupId, false);
        wasPinnedRef.current = true;
        await sendGroupSticker(groupId, sticker, replyTo?.id);
        setReplyTo(null);
        if (soundsEnabled) playMessageSound("sent");
      } catch (cause) {
        setError(friendlyError(cause, "Could not send the sticker."));
      }
    },
    [groupId, replyTo, sendGroupSticker, soundsEnabled],
  );

  const handleAddFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;
    setFiles((prev) => [...prev, ...incoming].slice(0, 20));
  }, []);

  const handlePastedGroupFile = useCallback((pasted: File) => {
    setFiles((prev) => [...prev, pasted].slice(0, 20));
    window.setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 0);
  }, []);

  useChatImagePaste(
    handlePastedGroupFile,
    Boolean(groupId) && !editingMessage && !recordingVoiceNote,
  );

  async function handleSubmitDraft(submittedBody: string) {
    if (!groupId) return;
    const myGroupRole = group?.role ?? summary?.role ?? "member";
    const iCanMentionEveryone = myGroupRole === "owner" || myGroupRole === "moderator";
    if (/(?:^|[\s(])@everyone\b/i.test(submittedBody) && !iCanMentionEveryone) {
      setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: submittedBody }));
      setError("Only the group owner or moderators can mention @everyone.");
      return;
    }
    if (editingMessage) {
      if (!submittedBody) return;
      const targetId = editingMessage.id;
      setError(null);
      setEditingMessage(null);
      setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
      try {
        await store.editGroupMessage(targetId, submittedBody);
      } catch (err) {
        setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: submittedBody }));
        setError(friendlyError(err, "Couldn't edit the message."));
      }
      return;
    }
    if (!submittedBody && files.length === 0 && !forwardedMessage) return;
    const sentBody = submittedBody;
    const queuedFiles = files;
    const sentReply = replyTo;
    const sentForwarded = forwardedMessage;

    if (viewOnceActive) {
      const photoFile = queuedFiles.find((f) => f.type.startsWith("image/")) ?? null;
      const audioFile =
        queuedFiles.find((f) => isVoiceNoteOrAudio(f.type, f.name)) ?? null;
      if (!sentBody && !photoFile && !audioFile) {
        setError("View once supports text, photos, and audio attachments.");
        return;
      }
      setFiles([]);
      setViewOnceActive(false);
      setReplyTo(null);
      setForwardedMessage(null);
      setError(null);
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      if (typingRef.current) {
        typingRef.current = false;
        publishTyping(false);
      }
      try {
        const voBody = await buildEncryptedViewOnceBody({
          text: sentBody,
          photoFile,
          audioFile,
        });
        await store.sendGroupMessage(groupId, voBody, undefined, sentReply?.id);
        if (store.soundsEnabled) playMessageSound("sent");
        window.requestAnimationFrame(scrollToBottom);
      } catch (err) {
        if (sentBody) {
          setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: sentBody }));
        }
        if (queuedFiles.length > 0) setFiles(queuedFiles);
        setViewOnceActive(true);
        setError(friendlyError(err, "Couldn't send the view once message."));
      }
      return;
    }

    setFiles([]);
    setReplyTo(null);
    setForwardedMessage(null);
    setError(null);
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    if (typingRef.current) {
      typingRef.current = false;
      publishTyping(false);
    }

    const batches: Array<{ body: string; file: File | null; replyId?: string }> =
      queuedFiles.length === 0
        ? [{ body: sentBody, file: null, replyId: sentReply?.id }]
        : queuedFiles.map((f, idx) => ({
            body: idx === 0 ? sentBody : "",
            file: f,
            replyId: idx === 0 ? sentReply?.id : undefined,
          }));

    const createdPendingIds: string[] = [];
    wasPinnedRef.current = true;
    for (const item of batches) {
      const sentAt = Math.max(Date.now(), lastPendingMessageAtRef.current + 1);
      lastPendingMessageAtRef.current = sentAt;
      const pendingId = `pending-${sentAt}`;
      createdPendingIds.push(pendingId);
      const attachmentUrl = item.file
        ? URL.createObjectURL(item.file)
        : sentForwarded?.attachmentUrl ?? sentForwarded?.stickerUrl;
      if (attachmentUrl && item.file) {
        pendingAttachmentUrlsRef.current.set(pendingId, attachmentUrl);
      }
      setPendingMessages((current) => [
        ...current.slice(-299),
        {
          id: pendingId,
          senderId: store.me?.id ?? "",
          senderName: store.me?.displayName ?? "",
          senderUsername: store.me?.username ?? "",
          senderAvatarUrl: store.me?.avatarUrl,
          senderAvatarColor: store.me?.avatarColor ?? "black",
          body: item.body || sentForwarded?.body || "",
          bubbleStyle: getSavedOutgoingBubbleStyle(),
          attachmentUrl,
          attachmentName: item.file?.name ?? sentForwarded?.attachmentName,
          attachmentType: item.file?.type ?? sentForwarded?.attachmentType,
          stickerUrl: sentForwarded?.stickerUrl,
          stickerName: sentForwarded?.stickerName,
          createdAt: sentAt,
        } as GroupMessage,
      ]);
    }
    window.requestAnimationFrame(scrollToBottom);

    try {
      if (sentForwarded) {
        await store.forwardGroupMessage(sentForwarded.id, { groupId });
      }
      for (let i = 0; i < batches.length; i++) {
        const item = batches[i];
        const pendingId = createdPendingIds[i];
        if (!sentForwarded || item.body || item.file) {
          await store.sendGroupMessage(
            groupId,
            item.body,
            item.file ?? undefined,
            item.replyId,
          );
        }
        window.setTimeout(() => {
          const url = pendingAttachmentUrlsRef.current.get(pendingId);
          if (url) {
            URL.revokeObjectURL(url);
            pendingAttachmentUrlsRef.current.delete(pendingId);
          }
          setPendingMessages((cur) => cur.filter((m) => m.id !== pendingId));
        }, 1500);
      }
      if (store.soundsEnabled) playMessageSound("sent");
    } catch (err) {
      for (const pendingId of createdPendingIds) {
        const url = pendingAttachmentUrlsRef.current.get(pendingId);
        if (url) {
          URL.revokeObjectURL(url);
          pendingAttachmentUrlsRef.current.delete(pendingId);
        }
      }
      setPendingMessages((cur) => cur.filter((m) => !createdPendingIds.includes(m.id)));
      if (sentBody) {
        setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: sentBody }));
      }
      if (queuedFiles.length > 0) setFiles((c) => (c.length > 0 ? c : queuedFiles));
      setError(friendlyError(err, "Couldn't send the group message."));
    }
  }

  const openMessageMenuAt = useCallback(
    (x: number, y: number, message: GroupMessage) => {
      if (messageMenuCloseTimerRef.current !== null) {
        window.clearTimeout(messageMenuCloseTimerRef.current);
        messageMenuCloseTimerRef.current = null;
      }
      setMessageMenuClosing(false);
      const now = Date.now();
      setMessageMenu({
        x,
        y,
        message,
        canUnsend:
          message.senderId === store.me?.id &&
          !message.unsentAt &&
          now - message.createdAt < UNSEND_WINDOW_MS,
        canEdit:
          message.senderId === store.me?.id &&
          !message.unsentAt &&
          Boolean(message.body.trim()),
      });
    },
    [store.me?.id],
  );

  const openMessageMenu = useCallback(
    (event: MouseEvent, message: GroupMessage) => {
      event.preventDefault();
      event.stopPropagation();
      openMessageMenuAt(event.clientX, event.clientY, message);
    },
    [openMessageMenuAt],
  );

  async function sendGroupVoiceNote(voiceFile: File) {
    if (!groupId || isMuted) return;
    setRecordingVoiceNote(false);
    const sentReply = replyTo;
    if (viewOnceActive) {
      const draftKey = `group:${groupId}`;
      const draftCaption = getDraft(draftKey).trim();
      const stagedPhoto = files.find((f) => f.type.startsWith("image/")) ?? null;
      setViewOnceActive(false);
      setFiles([]);
      if (draftCaption) {
        clearDraft(draftKey);
        setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
      }
      setReplyTo(null);
      setError(null);
      try {
        const voBody = await buildEncryptedViewOnceBody({
          text: draftCaption,
          photoFile: stagedPhoto,
          audioFile: voiceFile,
        });
        await store.sendGroupMessage(groupId, voBody, undefined, sentReply?.id);
        if (store.soundsEnabled) playMessageSound("sent");
        window.requestAnimationFrame(scrollToBottom);
      } catch (err) {
        setViewOnceActive(true);
        setError(friendlyError(err, "Couldn't send the view once voice note."));
      }
      return;
    }
    const sentAt = Math.max(Date.now(), lastPendingMessageAtRef.current + 1);
    lastPendingMessageAtRef.current = sentAt;
    const pendingId = `pending-${sentAt}`;
    const cleanAudioBlob = new Blob([voiceFile], {
      type: voiceFile.type.split(";")[0] || "audio/webm",
    });
    const attachmentUrl = URL.createObjectURL(cleanAudioBlob);
    pendingAttachmentUrlsRef.current.set(pendingId, attachmentUrl);
    const meta = decodeVoiceNoteMime(voiceFile.type);
    if (meta?.transcript) {
      saveCachedVoiceTranscript(pendingId, meta.transcript);
    }
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
        body: "",
        bubbleStyle: getSavedOutgoingBubbleStyle(),
        attachmentUrl,
        attachmentName: voiceFile.name,
        attachmentType: voiceFile.type,
        createdAt: sentAt,
      } as GroupMessage,
    ]);
    window.requestAnimationFrame(scrollToBottom);
    setReplyTo(null);
    setError(null);
    try {
      await store.sendGroupMessage(groupId, "", voiceFile, sentReply?.id);
      if (store.soundsEnabled) playMessageSound("sent");
      window.setTimeout(() => {
        const url = pendingAttachmentUrlsRef.current.get(pendingId);
        if (url) {
          URL.revokeObjectURL(url);
          pendingAttachmentUrlsRef.current.delete(pendingId);
        }
        setPendingMessages((cur) => cur.filter((m) => m.id !== pendingId));
      }, 1500);
    } catch (err) {
      const url = pendingAttachmentUrlsRef.current.get(pendingId);
      if (url) {
        URL.revokeObjectURL(url);
        pendingAttachmentUrlsRef.current.delete(pendingId);
      }
      setPendingMessages((cur) => cur.filter((m) => m.id !== pendingId));
      setError(friendlyError(err, "Couldn't send the voice note."));
    }
  }

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
      await copyImageUrlToClipboard(url);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't copy the image."));
    }
  }

  async function deleteForMe(message: GroupMessage) {
    closeMessageMenu();
    deletedSnapshotRef.current.set(message.id, message);
    setLocallyHiddenIds((prev) => ({
      ...prev,
      [message.id]: true,
      ...(message.renderKey ? { [message.renderKey]: true } : {}),
    }));
    setPendingMessages((cur) =>
      cur.filter(
        (m) =>
          m.id !== message.id &&
          m.id !== message.renderKey &&
          !(
            m.senderId === message.senderId &&
            m.body === message.body &&
            Math.abs(m.createdAt - message.createdAt) < 60_000
          ),
      ),
    );
    setDeletedUndoState({
      messageId: message.id,
      nonce: Date.now(),
      expiresAt: Date.now() + 5_000,
    });
    try {
      await store.deleteGroupMessageForMe(message.id);
    } catch (err) {
      setLocallyHiddenIds((prev) => {
        const next = { ...prev };
        delete next[message.id];
        if (message.renderKey) delete next[message.renderKey];
        return next;
      });
      setDeletedUndoState(null);
      setError(friendlyError(err, "Couldn't delete the message."));
    }
  }

  async function undoDeleteForMe(messageId: string) {
    const snap = deletedSnapshotRef.current.get(messageId);
    deletedSnapshotRef.current.delete(messageId);
    setLocallyHiddenIds((prev) => {
      const next = { ...prev };
      delete next[messageId];
      if (snap?.renderKey) delete next[snap.renderKey];
      return next;
    });
    setDeletedUndoState(null);
    if (!snap || !store.restoreGroupMessageForMe) return;
    try {
      await store.restoreGroupMessageForMe(snap);
    } catch (err) {
      setError(friendlyError(err, "Couldn't restore the message."));
    }
  }

  async function unsend(message: GroupMessage) {
    closeMessageMenu();
    const sweepDone = new Promise<void>((resolve) => {
      const started = triggerMessageThanosSnapById(message.id, undefined, () => resolve());
      if (!started) resolve();
    });
    try {
      const unsendReq = store.unsendGroupMessage(message.id);
      const [, shouldShowWarning] = await Promise.all([sweepDone, unsendReq]);
      if (shouldShowWarning) setShowUnsendWarning(true);
    } catch (err) {
      restoreSnapTargetVisibilityById(message.id);
      setError(friendlyError(err, "Couldn't unsend the message."));
    }
  }

  function startEditingMessage(message: GroupMessage) {
    setPendingMessages([]);
    setEditingMessage(message);
    setReplyTo(null);
    setFiles([]);
    setViewOnceActive(false);
    setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
    closeMessageMenu();
  }

  function cancelEditingMessage() {
    setEditingMessage(null);
    setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
  }

  const reactToMessage = useCallback(
    async (message: GroupMessage, emoji: string) => {
      try {
        await toggleGroupReaction(message.id, emoji);
        closeMessageMenu();
        setReactionTarget(null);
      } catch (err) {
        setError(friendlyError(err, "Couldn't add the reaction."));
      }
    },
    [closeMessageMenu, toggleGroupReaction],
  );

  const handleOpenReactionPicker = useCallback(
    (x: number, y: number, message: GroupMessage) => {
      setReactionTarget({ x, y, message });
    },
    [],
  );

  const handleSwipeReply = useCallback((msg: GroupMessage) => {
    setEditingMessage(null);
    setForwardedMessage(null);
    setReplyTo(msg);
    window.setTimeout(() => composerRef.current?.focus(), 40);
  }, []);

  const joinGroupCallFn = groupCall.joinGroupCall;
  const handleJoinGroupCall = useCallback(
    (invite: NonNullable<ReturnType<typeof parseGroupCallInvite>>, messageId: string) => {
      void joinGroupCallFn(invite, invite.mode === "video", messageId);
    },
    [joinGroupCallFn],
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

  async function pickGroupPicture(rawPicked: File | undefined) {
    if (!rawPicked) return;
    const isGif = await isAnimatedOrGifFile(rawPicked);
    const picked = isGif
      ? await ensureInfiniteLoopGifFile(rawPicked)
      : await ensureValidFileMime(rawPicked);
    if (!picked.type.startsWith("image/")) {
      setManageError("Please choose an image or GIF file for the group picture.");
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

  const isPrivilegedWallpaperSender = (senderId: string): boolean => {
    if (group) {
      if (senderId === group.ownerId) return true;
      const m = group.members.find((item) => item.id === senderId);
      if (m) return m.role === "owner" || m.role === "moderator";
    }
    if (summary && senderId === summary.ownerId) return true;
    // Before full group details finish hydrating, allow cached/known signals.
    return !group;
  };

  let resolvedGroupWallpaperUrl: string | null | undefined = undefined;
  for (let i = displayedMessages.length - 1; i >= 0; i--) {
    const msg = displayedMessages[i];
    if (msg.unsentAt) continue;
    const wp = parseWallpaperSignal(msg.body, msg.attachmentUrl);
    if (wp && isPrivilegedWallpaperSender(msg.senderId)) {
      resolvedGroupWallpaperUrl = wp.url;
      break;
    }
  }
  const activeWallpaperUrl =
    resolvedGroupWallpaperUrl !== undefined
      ? resolvedGroupWallpaperUrl
      : (getCachedWallpaper(`group:${groupId}`) ?? null);

  if (resolvedGroupWallpaperUrl !== undefined) {
    saveCachedWallpaper(`group:${groupId}`, resolvedGroupWallpaperUrl);
  }

  const showMobileWallpaper = isMobileWallpaper && Boolean(activeWallpaperUrl);

  async function handleApplyGroupWallpaper(choice: WallpaperChoice) {
    if (!groupId || !canManageGroup) {
      throw new Error("Only the group owner or a moderator can change the group wallpaper.");
    }
    const scopeKey = `group:${groupId}`;
    if (choice.kind === "none") {
      await store.sendGroupMessage(
        groupId,
        serializeWallpaperSignal({
          v: 1,
          kind: "none",
          actorName: store.me?.displayName,
        }),
      );
      saveCachedWallpaper(scopeKey, null);
    } else if (choice.kind === "preset" && choice.url) {
      await store.sendGroupMessage(
        groupId,
        serializeWallpaperSignal({
          v: 1,
          kind: "preset",
          presetId: choice.presetId,
          url: choice.url,
          actorName: store.me?.displayName,
        }),
      );
      saveCachedWallpaper(scopeKey, choice.url);
    } else if (choice.kind === "custom" && choice.file) {
      await store.sendGroupMessage(
        groupId,
        serializeWallpaperSignal({
          v: 1,
          kind: "custom",
          actorName: store.me?.displayName,
        }),
        choice.file,
      );
    }
  }

  return (
    <section
      className={`chat group-chat ${chatClosing ? "closing" : ""} ${
        showMobileWallpaper ? "has-wallpaper" : ""
      }`}
    >
      {showMobileWallpaper && activeWallpaperUrl ? (
        <div className="chat-wallpaper-layer" aria-hidden="true">
          <AnimatedMediaImg src={activeWallpaperUrl} />
        </div>
      ) : null}
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={closeChat} aria-label="Back">
          <ArrowLeftIcon size={19} />
        </button>
        <button
          type="button"
          className="group-header-avatar-btn"
          onClick={openManageModal}
          aria-label="Open group settings"
        >
          {(group?.avatarUrl ?? summary?.avatarUrl) ? (
            <AnimatedMediaImg
              className="group-avatar"
              src={group?.avatarUrl ?? summary?.avatarUrl}
            />
          ) : (
            <div className="group-avatar group-avatar-fallback" aria-hidden="true">
              <UsersIcon size={22} />
            </div>
          )}
        </button>
        <button type="button" className="chat-title" onClick={openManageModal}>
          <strong>{group?.name ?? summary?.name ?? "Group chat"}</strong>
          <span className="muted small">
            {group?.members.length ?? summary?.memberCount ?? 0} members
            {latestGroupEpoch ? (
              <>
                {" · "}
                <LockClosedIcon size={12} /> Encrypted (Epoch #{latestGroupEpoch.epoch})
              </>
            ) : null}
            {" · Tap for group settings"}
          </span>
        </button>
        <div className="chat-header-actions">
          <button
            type="button"
            className={`icon-btn ${searchOpen ? "menu-open" : ""}`}
            title="Search in group"
            aria-label="Search in group"
            onClick={() => {
              setSearchOpen((open) => {
                if (open) {
                  setSearchQuery("");
                  setSearchMatchIdx(0);
                }
                return !open;
              });
            }}
          >
            <SearchIcon size={18} />
          </button>
          <button
            type="button"
            className="icon-btn call-header-btn"
            title="Start group voice call"
            aria-label="Start group voice call"
            disabled={Boolean(groupCall.groupSession)}
            onClick={() => {
              if (!groupId) return;
              const groupSummary =
                summary ?? {
                  id: groupId,
                  name: group?.name ?? "Group chat",
                  avatarUrl: group?.avatarUrl,
                  ownerId: group?.ownerId ?? store.me?.id ?? "",
                  role: "member" as const,
                  memberCount: group?.members.length ?? 2,
                  lastMessage: "",
                  lastMessageAt: Date.now(),
                };
              void groupCall.startGroupCall(groupSummary, "voice");
            }}
          >
            <Phone size={18} />
          </button>
          <button
            type="button"
            className="icon-btn call-header-btn"
            title="Start group video call"
            aria-label="Start group video call"
            disabled={Boolean(groupCall.groupSession)}
            onClick={() => {
              if (!groupId) return;
              const groupSummary =
                summary ?? {
                  id: groupId,
                  name: group?.name ?? "Group chat",
                  avatarUrl: group?.avatarUrl,
                  ownerId: group?.ownerId ?? store.me?.id ?? "",
                  role: "member" as const,
                  memberCount: group?.members.length ?? 2,
                  lastMessage: "",
                  lastMessageAt: Date.now(),
                };
              void groupCall.startGroupCall(groupSummary, "video");
            }}
          >
            <Video size={18} />
          </button>
          <button type="button" className="ghost-btn" onClick={openManageModal}>
            Manage
          </button>
          <button
            type="button"
            className={`icon-btn chat-more-btn ${headerMoreMenu ? "menu-open" : ""}`}
            title="Group options"
            aria-label="Group options"
            aria-expanded={Boolean(headerMoreMenu)}
            onClick={(event) => {
              if (headerMoreMenu) {
                setHeaderMoreMenu((cur) => (cur ? { ...cur, closing: true } : null));
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              setHeaderMoreMenu({ x: rect.right - 220, y: rect.bottom + 8 });
            }}
          >
            <MoreVerticalIcon size={18} />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="chat-search-bar" role="search">
          <SearchIcon size={16} />
          <input
            type="search"
            value={searchQuery}
            autoFocus
            placeholder={`Search in ${group?.name ?? summary?.name ?? "group"}…`}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchMatchIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchMatchIds.length > 0) {
                e.preventDefault();
                setSearchMatchIdx((cur) =>
                  e.shiftKey
                    ? (cur - 1 + searchMatchIds.length) % searchMatchIds.length
                    : (cur + 1) % searchMatchIds.length,
                );
              } else if (e.key === "Escape") {
                setSearchOpen(false);
                setSearchQuery("");
              }
            }}
          />
          {searchQuery.trim() && (
            <span className="chat-search-counter">
              {searchMatchIds.length === 0
                ? "0 matches"
                : `${safeSearchMatchIdx + 1} / ${searchMatchIds.length}`}
            </span>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous match"
            disabled={searchMatchIds.length === 0}
            onClick={() =>
              setSearchMatchIdx(
                (cur) => (cur - 1 + searchMatchIds.length) % searchMatchIds.length,
              )
            }
          >
            <ChevronUpIcon size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next match"
            disabled={searchMatchIds.length === 0}
            onClick={() =>
              setSearchMatchIdx((cur) => (cur + 1) % searchMatchIds.length)
            }
          >
            <ChevronDownIcon size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close search"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      {pinnedMessages.length > 0 && (
        <div className="chat-pinned-banner" role="region" aria-label="Pinned message">
          <PinIcon size={15} filled />
          <button
            type="button"
            className="chat-pinned-banner-jump"
            onClick={() => {
              const latestPin = pinnedMessages[0];
              if (!latestPin) return;
              document
                .getElementById(`group-message-${latestPin.messageId}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            <strong>
              Pinned message
              {pinnedMessages.length > 1 ? ` (${pinnedMessages.length})` : ""}
            </strong>
            <span>{pinnedMessages[0].previewText}</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Unpin message"
            aria-label="Unpin message"
            onClick={() => {
              const latestPin = pinnedMessages[0];
              if (!latestPin || !groupId) return;
              togglePinnedMessage({
                conversationKey: `group:${groupId}`,
                messageId: latestPin.messageId,
                senderName: latestPin.senderName,
                previewText: latestPin.previewText,
              });
            }}
          >
            <CloseIcon size={15} />
          </button>
        </div>
      )}

      {activeGroupCallMessage &&
        groupCall.groupSession?.callId !== activeGroupCallMessage.invite.callId && (
          <div className="group-call-active-banner" role="region" aria-label="Active group call">
            <div className="group-call-active-banner-info">
              <span className="group-call-live-dot" aria-hidden="true" />
              <strong>
                {activeGroupCallMessage.invite.mode === "video"
                  ? "Group Video Call"
                  : "Group Voice Call"}{" "}
                in progress
              </strong>
              <span className="muted small">
                Started by {activeGroupCallMessage.invite.hostName}
              </span>
            </div>
            <button
              type="button"
              className="primary-btn small-btn"
              onClick={() =>
                void groupCall.joinGroupCall(
                  activeGroupCallMessage.invite,
                  activeGroupCallMessage.invite.mode === "video",
                  activeGroupCallMessage.messageId,
                )
              }
            >
              Join Call
            </button>
          </div>
        )}

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
            <CloseIcon size={15} />
          </button>
        </div>
      )}

      <GroupChatHistory
        key={groupId ?? "group"}
        messages={displayedMessages}
        messagesReady={conversationReady}
        hasMoreOlder={Boolean(store.hasMoreOlderGroupMessages)}
        loadingOlder={Boolean(store.loadingOlderGroupMessages)}
        onLoadOlder={store.loadOlderGroupMessages}
        me={meSummary}
        members={group?.members ?? EMPTY_GROUP_MEMBERS}
        messagesRef={messagesRef}
        initialScrollAllowedRef={initialScrollAllowedRef}
        wasPinnedRef={wasPinnedRef}
        shownTranscriptIds={shownTranscriptIds}
        onToggleTranscript={handleToggleTranscript}
        onScroll={handleMessagesScroll}
        onOpenProfile={onOpenProfile}
        onOpenImage={openImagePreview}
        activeSearchMatchId={activeSearchMatchId}
        highlightQuery={searchOpen ? searchQuery : undefined}
        onOpenMessageMenu={openMessageMenu}
        onOpenMessageMenuAt={openMessageMenuAt}
        onReactToMessage={reactToMessage}
        onOpenReactionPicker={handleOpenReactionPicker}
        onSwipeReply={handleSwipeReply}
        onJoinGroupCall={handleJoinGroupCall}
        activeCallId={activeGroupCallId}
        groupCallStatesById={groupCallStatesById}
        seenByMessageId={groupSeenData.seenByMessageId}
        groupId={groupId ?? ""}
        firstUnreadMessageId={firstUnreadGroupMsgId}
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
          <button type="button" className="mini-btn" aria-label="Cancel editing" onClick={cancelEditingMessage}>
            <CloseIcon size={13} />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <div className="attach-preview-list">
          {files.map((item, idx) => (
            <span className="attach-preview-chip" key={`${item.name}-${item.size}-${idx}`}>
              <PaperclipIcon size={13} />
              <span className="attach-preview-chip-name">{item.name}</span>
              <button
                type="button"
                className="attach-preview-chip-remove"
                aria-label={`Remove ${item.name}`}
                onClick={() =>
                  setFiles((cur) => cur.filter((_, fileIdx) => fileIdx !== idx))
                }
              >
                <CloseIcon size={12} />
              </button>
            </span>
          ))}
          {files.length > 1 && (
            <button type="button" className="mini-btn" onClick={() => setFiles([])}>
              Clear all ({files.length})
            </button>
          )}
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
                  : isViewOnceBody(replyTo.body)
                    ? "View once"
                    : formatPreviewMessageText(replyTo.body) ||
                      replyTo.attachmentName ||
                      replyTo.stickerName ||
                      "Attachment"
                : forwardedMessage?.body
                  ? formatPreviewMessageText(forwardedMessage.body)
                  : forwardedMessage?.attachmentName || "Forwarded message"}
            </span>
          </div>
          <button
            type="button"
            className="mini-btn"
            aria-label="Dismiss preview"
            onClick={() => {
              setReplyTo(null);
              setForwardedMessage(null);
              if (forwardedMessage) {
                setComposerSeed((prev) => ({ nonce: prev.nonce + 1, text: "" }));
              }
            }}
          >
            <CloseIcon size={13} />
          </button>
        </div>
      )}

      {isMuted ? (
        <div className="community-readonly">You are muted in this group.</div>
      ) : (
        <GroupChatComposer
          key={`${groupId}:${editingMessage?.id ?? "new"}:${composerSeed.nonce}`}
          groupId={groupId ?? "unknown"}
          initialDraft={editingMessage ? editingMessage.body : composerSeed.text}
          members={group?.members ?? EMPTY_GROUP_MEMBERS}
          summaryMemberCount={summary?.memberCount ?? 0}
          myId={store.me?.id ?? ""}
          canMentionEveryone={
            (group?.role ?? summary?.role) === "owner" ||
            (group?.role ?? summary?.role) === "moderator"
          }
          activityByUserId={activityByUserId}
          hasFile={files.length > 0}
          viewOnceActive={viewOnceActive}
          onToggleViewOnce={() => setViewOnceActive((v) => !v)}
          hasForwardedMessage={Boolean(forwardedMessage)}
          isEditing={Boolean(editingMessage)}
          busy={busy}
          recordingVoiceNote={recordingVoiceNote}
          composerRef={composerRef}
          fileInputRef={fileInput}
          onAddFiles={handleAddFiles}
          onSelectSticker={handleSelectSticker}
          onStartVoiceNote={handleStartVoiceNote}
          onCancelVoiceNote={handleCancelVoiceNote}
          onSendVoiceNote={(voiceFile) => void sendGroupVoiceNote(voiceFile)}
          onVoiceError={setError}
          onMobileActivate={handleMobileComposerActivate}
          onTypingSignal={handleTypingSignal}
          onSubmitDraft={(body) => void handleSubmitDraft(body)}
        />
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
            <span>
              <ReplyIcon size={15} />
            </span>{" "}
            Reply
          </button>
          {!messageMenu.message.unsentAt && groupId && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const msg = messageMenu.message;
                togglePinnedMessage({
                  conversationKey: `group:${groupId}`,
                  messageId: msg.id,
                  senderName:
                    msg.senderId === store.me?.id ? "You" : msg.senderName || "Member",
                  previewText:
                    formatPreviewMessageText(msg.body) ||
                    msg.attachmentName ||
                    msg.stickerName ||
                    "Attachment",
                });
                closeMessageMenu();
              }}
            >
              <span>
                <PinIcon
                  size={15}
                  filled={isMessagePinned(`group:${groupId}`, messageMenu.message.id)}
                />
              </span>{" "}
              {isMessagePinned(`group:${groupId}`, messageMenu.message.id)
                ? "Unpin message"
                : "Pin message"}
            </button>
          )}
          {!messageMenu.message.unsentAt &&
            messageMenu.message.senderId === store.me?.id && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMessageMenu();
                  setBubbleStyleOpen(true);
                }}
              >
                <span>
                  <BubblePaletteIcon size={15} />
                </span>{" "}
                Bubble style
              </button>
            )}
          {!messageMenu.message.unsentAt &&
            isVoiceNoteOrAudio(
              messageMenu.message.attachmentType,
              messageMenu.message.attachmentName,
            ) && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const id = messageMenu.message.id;
                  setShownTranscriptIds((prev) => ({ ...prev, [id]: !prev[id] }));
                  closeMessageMenu();
                }}
              >
                <span>
                  <FileTextIcon size={15} />
                </span>{" "}
                {shownTranscriptIds[messageMenu.message.id]
                  ? "Hide transcribe"
                  : "Transcribe"}
              </button>
            )}
          {!messageMenu.message.unsentAt && (
            <>
              {messageMenu.canEdit && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => startEditingMessage(messageMenu.message)}
                >
                  <span>
                    <EditIcon size={15} />
                  </span>{" "}
                  Edit message
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
                <span>
                  <ForwardIcon size={15} />
                </span>{" "}
                Forward
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const target = messageMenu;
                  closeMessageMenu();
                  setReactionTarget({
                    x: target.x,
                    y: target.y,
                    message: target.message,
                  });
                }}
              >
                <span>
                  <SmilePlusIcon size={15} />
                </span>{" "}
                Reaction
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void copyMessage(messageMenu.message)}
          >
            <span>
              <CopyIcon size={15} />
            </span>{" "}
            Copy text
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void deleteForMe(messageMenu.message)}
          >
            <span>
              <TrashIcon size={15} />
            </span>{" "}
            Delete for me
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
              <span>
                <StarIcon size={15} filled={!messageMenu.message.isStickerFavorite} />
              </span>
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
                <span>
                  <ImageIcon size={15} />
                </span>{" "}
                Copy image
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void copyImageAddress(messageMenu.message)}
              >
                <span>
                  <LinkIcon size={15} />
                </span>{" "}
                Copy image address
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
              <span>
                <UndoIcon size={15} />
              </span>{" "}
              Unsend
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setInspectingMessage(messageMenu.message);
              closeMessageMenu();
            }}
          >
            <span>
              <LockClosedIcon size={15} />
            </span>{" "}
            Encryption details
          </button>
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
                <CloseIcon size={17} />
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
                      <AnimatedMediaImg
                        className="group-avatar"
                        src={target.avatarUrl}
                        style={{ width: 38, height: 38 }}
                      />
                    ) : (
                      <span className="group-avatar group-avatar-fallback" style={{ width: 38, height: 38 }}>
                        <UsersIcon size={19} />
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

      {reactionTarget && (
        <ReactionEmojiPicker
          x={reactionTarget.x}
          y={reactionTarget.y}
          selectedEmojis={(
            displayedMessages.find((m) => m.id === reactionTarget.message.id)?.reactions ??
            reactionTarget.message.reactions ??
            []
          )
            .filter((r) => r.userId === store.me?.id)
            .map((r) => r.emoji)}
          onSelect={(emoji) => void reactToMessage(reactionTarget.message, emoji)}
          onClose={() => setReactionTarget(null)}
        />
      )}
      {bubbleStyleOpen && (
        <BubbleStyleModal onClose={() => setBubbleStyleOpen(false)} />
      )}
      {wallpaperOpen && canManageGroup && (
        <WallpaperModal
          isGroup
          currentWallpaperUrl={activeWallpaperUrl}
          onApply={handleApplyGroupWallpaper}
          onClose={() => setWallpaperOpen(false)}
        />
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
            <CloseIcon size={20} />
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
        <div
          className={`modal-backdrop ${manageClosing ? "is-closing" : ""}`}
          onClick={closeManageModal}
        >
          <section
            className={`modal-card wide group-manage-dialog ${manageClosing ? "is-closing" : ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close animated-x-btn"
              onClick={closeManageModal}
              aria-label="Close"
            >
              <CloseIcon size={17} />
            </button>
            <h2>Group settings</h2>

            <div className="profile-e2ee-section group-e2ee-card">
              <div className="profile-e2ee-header">
                <span className="profile-e2ee-title">
                  <LockIcon size={15} />
                  <strong>Group End-to-End Encryption</strong>
                </span>
                <span className={`e2ee-pill ${latestGroupEpoch ? "active" : "pending"}`}>
                  {latestGroupEpoch
                    ? `Epoch #${latestGroupEpoch.epoch} · AES-256-GCM`
                    : "Provisioning…"}
                </span>
              </div>
              {latestGroupEpoch ? (
                <>
                  <div className="profile-e2ee-sub">
                    Group Key SHA-256 Fingerprint (rotates automatically when members are removed):
                  </div>
                  <code className="e2ee-fingerprint-code">
                    {latestGroupEpoch.fingerprint}
                  </code>
                  <div className="profile-e2ee-btn-row">
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `JaText Group E2EE (${group.name})\nEpoch: #${latestGroupEpoch.epoch}\nFingerprint: ${latestGroupEpoch.fingerprint}`,
                        );
                        setCopiedGroupKey(true);
                        window.setTimeout(() => setCopiedGroupKey(false), 1800);
                      }}
                    >
                      {copiedGroupKey ? (
                        <>
                          <CheckIcon size={12} /> Copied
                        </>
                      ) : (
                        <>
                          <CopyIcon size={12} /> Copy group E2EE key
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted small profile-e2ee-wait">
                  A shared AES-256-GCM group epoch key is generated and wrapped via ECDH P-256 for
                  each member automatically when you send a message.
                </p>
              )}
            </div>

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
                      <AnimatedMediaImg
                        className="group-pfp-circle-img"
                        src={groupAvatarPreview}
                        alt={group.name}
                      />
                    ) : (
                      <span className="group-pfp-circle-fallback" aria-hidden="true">
                        {(renameDraft.trim() || group.name).slice(0, 2).toUpperCase() || (
                          <UsersIcon size={24} />
                        )}
                      </span>
                    )}
                    <span className="pf-avatar-edit" aria-hidden="true">
                      <EditIcon size={14} />
                    </span>
                  </button>
                  <input
                    ref={groupPfpInput}
                    type="file"
                    accept="image/*,.gif"
                    hidden
                    onChange={(event) => {
                      void pickGroupPicture(event.target.files?.[0]);
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
                        <CameraIcon size={13} /> Choose photo
                      </button>
                      {isMobileWallpaper && (
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => {
                            closeManageModal();
                            setWallpaperOpen(true);
                          }}
                        >
                          <ImageIcon size={13} /> Chat wallpaper
                        </button>
                      )}
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
                    <span className="hint-ok">
                      <CheckIcon size={13} /> Changes saved!
                    </span>
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
                      <AnimatedMediaImg
                        className="group-pfp-circle-img"
                        src={group.avatarUrl}
                      />
                    ) : (
                      <span className="group-pfp-circle-fallback" aria-hidden="true">
                        {group.name.slice(0, 2).toUpperCase() || <UsersIcon size={24} />}
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
                  {showAddMembers ? (
                    "Close invite"
                  ) : (
                    <>
                      <PlusIcon size={13} /> Add friends
                    </>
                  )}
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
                          <span className="role-pill owner">
                            <CrownIcon size={12} /> Owner
                          </span>
                        )}
                        {member.role === "moderator" && (
                          <span className="role-pill moderator">
                            <ShieldCheckIcon size={12} /> Moderator
                          </span>
                        )}
                        {member.muted && (
                          <span className="role-pill muted-pill">
                            <BellOffIcon size={12} /> Muted
                          </span>
                        )}
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
                  onClick={() => setConfirmDeleteOpen(true)}
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
      {headerMoreMenu && groupId && (
        <ContextMenu
          x={headerMoreMenu.x}
          y={headerMoreMenu.y}
          variant="dropdown"
          externalClosing={Boolean(headerMoreMenu.closing)}
          label={`Options for ${group?.name ?? summary?.name ?? "Group"}`}
          className="message-context-menu conversation-context-menu"
          onClose={() => setHeaderMoreMenu(null)}
        >
          {({ closeWithAnimation }) => (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => closeWithAnimation(() => openManageModal())}
              >
                <span>
                  <SettingsIcon size={15} />
                </span>{" "}
                Group settings
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => closeWithAnimation(() => setBubbleStyleOpen(true))}
              >
                <span>
                  <BubblePaletteIcon size={15} />
                </span>{" "}
                Bubble style
              </button>
              {isMobileWallpaper && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => closeWithAnimation(() => setWallpaperOpen(true))}
                >
                  <span>
                    <ImageIcon size={15} />
                  </span>{" "}
                  Group wallpaper
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const curSilenced = Boolean(summary?.isSilenced);
                  closeWithAnimation(() => {
                    void store.setGroupSilenced(groupId, !curSilenced);
                  });
                }}
              >
                <span>
                  {summary?.isSilenced ? <BellIcon size={15} /> : <BellOffIcon size={15} />}
                </span>{" "}
                {summary?.isSilenced ? "Unsilence group" : "Silence group"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const curArchived = Boolean(summary?.isArchived);
                  closeWithAnimation(() => {
                    void store.setGroupArchived(groupId, !curArchived);
                  });
                }}
              >
                <span>
                  <ArchiveIcon size={15} />
                </span>{" "}
                {summary?.isArchived ? "Unarchive group" : "Archive group"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="destructive-menu-item"
                onClick={() => closeWithAnimation(() => setConfirmRemoveChatOpen(true))}
              >
                <span>
                  <TrashIcon size={15} />
                </span>{" "}
                Remove chat
              </button>
              {(group?.role ?? summary?.role) === "owner" && (
                <button
                  type="button"
                  role="menuitem"
                  className="destructive-menu-item"
                  onClick={() => closeWithAnimation(() => setConfirmDeleteOpen(true))}
                >
                  <span>
                    <TrashIcon size={15} />
                  </span>{" "}
                  Delete group
                </button>
              )}
            </>
          )}
        </ContextMenu>
      )}
      {confirmRemoveChatOpen && groupId && (
        <RemoveGroupChatModal
          group={{
            id: groupId,
            name: group?.name ?? summary?.name ?? "Group chat",
          }}
          onCancel={() => setConfirmRemoveChatOpen(false)}
          onConfirmRemoveChat={async () => {
            await store.clearGroupChatForMe(groupId);
          }}
        />
      )}
      {confirmDeleteOpen && groupId && (group?.role ?? summary?.role) === "owner" && (
        <DeleteGroupConfirmModal
          group={{
            id: groupId,
            name: group?.name ?? summary?.name ?? "Group chat",
            role: "owner",
          }}
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirmDelete={async () => {
            await store.deleteGroup(groupId);
            closeManageModal();
            store.setActiveGroupId(null);
          }}
        />
      )}
      {inspectingMessage && (
        <MessageEncryptionModal
          proof={
            inspectingMessage.e2ee ?? {
              encrypted: false,
              decrypted: true,
              signatureVerified: false,
              algorithm: "Legacy Plaintext Group Message (sent before v2.5 E2EE)",
              channel: "plain",
              rawWireBody: inspectingMessage.body,
            }
          }
          onClose={() => setInspectingMessage(null)}
        />
      )}
      <DeleteForMeToast
        state={deletedUndoState}
        onUndo={(id) => void undoDeleteForMe(id)}
        onExpire={(nonce) =>
          setDeletedUndoState((cur) => (cur?.nonce === nonce ? null : cur))
        }
      />
    </section>
  );
}
