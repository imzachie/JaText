import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { useJaText } from "../lib/store";
import { playMessageSound } from "../lib/alerts";
import { copyImageUrlToClipboard } from "../lib/clipboard";
import { getSavedOutgoingBubbleStyle } from "../lib/chatCustomization";
import { decodeVoiceNoteMime, isVoiceNoteOrAudio, saveCachedVoiceTranscript } from "../lib/voiceNotes";
import { friendlyError } from "../lib/errors";
import { Avatar } from "./Avatar";
import { BubbleStyleModal } from "./BubbleStyleModal";
import { DecoratedMessageBubble } from "./BubbleStyleArtwork";
import { StickerPicker } from "./StickerPicker";
import { ContextMenu } from "./ContextMenu";
import { VoiceNotePlayer } from "./VoiceNotePlayer";
import { VoiceNoteRecorder } from "./VoiceNoteRecorder";
import type { CommunityMessage, JaUser } from "../lib/types";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const UNSEND_WINDOW_MS = 60 * 60 * 1000;
const PENDING_MESSAGE_MATCH_WINDOW_MS = 30_000;

interface MessageMenuState {
  x: number;
  y: number;
  message: CommunityMessage;
  canUnsend: boolean;
  canEdit: boolean;
}

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

function CommunityTypingStatus() {
  const typingUsers = useQuery(api.community.typingUsers, {});
  if (!typingUsers?.length) return null;
  const names = typingUsers.map((user) => user.displayName || user.username);
  return (
    <div className="chat-typing-status" role="status">
      {names.length === 1
        ? `${names[0]} is typing…`
        : `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""} are typing…`}
    </div>
  );
}

function getCommunityPendingMessages(pending: CommunityMessage[], real: CommunityMessage[]) {
  const pendingCopy = [...pending];
  const matchedIds = new Set<string>();
  const confirmed = real.map((message) => {
    const idx = pendingCopy.findIndex(
      (p) =>
        p.senderId === message.senderId &&
        message.createdAt >= p.createdAt - 1000 &&
        message.createdAt <= p.createdAt + PENDING_MESSAGE_MATCH_WINDOW_MS &&
        (message.unsentAt ||
          Boolean(message.editedAt) ||
          (message.body === p.body && message.attachmentName === p.attachmentName)),
    );
    if (idx === -1) return message;
    const [pm] = pendingCopy.splice(idx, 1);
    matchedIds.add(pm.id);
    return { ...message, renderKey: pm.id };
  });
  return { messages: [...confirmed, ...pendingCopy].sort((a, b) => a.createdAt - b.createdAt), matchedIds };
}

export function CommunityChatView({
  onOpenProfile,
  onBack,
}: {
  onOpenProfile?: (user: JaUser) => void;
  onBack: () => void;
}) {
  const store = useJaText();
  const setCommunityTyping = store.setCommunityTyping;
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [recordingVoiceNote, setRecordingVoiceNote] = useState(false);
  const [shownTranscriptIds, setShownTranscriptIds] = useState<Record<string, boolean>>({});
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [showPoll, setShowPoll] = useState(false);
  const [showModerators, setShowModerators] = useState(false);
  const [selectedModerators, setSelectedModerators] = useState<string[]>([]);
  const [directorySearchOpen, setDirectorySearchOpen] = useState(false);
  const [directorySearch, setDirectorySearch] = useState("");
  const [editingMessage, setEditingMessage] = useState<{ id: string; body: string } | null>(null);
  const [voterPollId, setVoterPollId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnsendWarning, setShowUnsendWarning] = useState(false);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [messageMenuClosing, setMessageMenuClosing] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [bubbleStyleOpen, setBubbleStyleOpen] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);

  function cancelPostTouchHold() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }

  function startPostTouchHold(
    event: React.TouchEvent<HTMLElement>,
    message: CommunityMessage,
  ) {
    if (message.id.startsWith("pending-") || event.touches.length !== 1) return;
    const touch = event.touches[0];
    longPressOriginRef.current = { x: touch.clientX, y: touch.clientY };
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    const { clientX, clientY } = touch;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      openMessageMenuAt(clientX, clientY, message);
    }, 450);
  }

  function movePostTouchHold(event: React.TouchEvent<HTMLElement>) {
    if (!longPressOriginRef.current || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (
      Math.hypot(
        touch.clientX - longPressOriginRef.current.x,
        touch.clientY - longPressOriginRef.current.y,
      ) > 12
    ) {
      cancelPostTouchHold();
    }
  }
  const [forwardMessage, setForwardMessage] = useState<CommunityMessage | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardClosing, setForwardClosing] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<CommunityMessage[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageClosing, setImageClosing] = useState(false);

  const messagesElement = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const directorySearchInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | null>(null);
  const typingRef = useRef(false);
  const wasPinnedRef = useRef(true);
  const lastMessageId = store.communityMessages.at(-1)?.id;
  const voterPoll = store.communityMessages.find((message) => message.id === voterPollId);
  const pendingAttachmentUrlsRef = useRef(new Map<string, string>());
  const lastPendingAtRef = useRef(0);
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
  const setCommunityTypingRef = useRef(setCommunityTyping);

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

  const pendingMerged = getCommunityPendingMessages(pendingMessages, store.communityMessages);
  const displayedMessages = pendingMerged.messages;
  const matchedPendingIds = pendingMerged.matchedIds;

  useEffect(() => {
    setCommunityTypingRef.current = setCommunityTyping;
  }, [setCommunityTyping]);

  const hasScrolledOnOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (!store.communityMessagesReady) return;
    const element = messagesElement.current;
    if (!element) return;
    if (!hasScrolledOnOpenRef.current) {
      hasScrolledOnOpenRef.current = true;
      element.scrollTop = element.scrollHeight;
      window.requestAnimationFrame(() => {
        if (messagesElement.current) {
          messagesElement.current.scrollTop = messagesElement.current.scrollHeight;
        }
      });
      return;
    }
    if (wasPinnedRef.current) element.scrollTop = element.scrollHeight;
  }, [store.communityMessagesReady, lastMessageId, displayedMessages.length]);

  useEffect(() => {
    for (const id of matchedPendingIds) {
      const url = pendingAttachmentUrlsRef.current.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        pendingAttachmentUrlsRef.current.delete(id);
      }
    }
  }, [matchedPendingIds]);

  useEffect(() => () => {
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    if (typingRef.current) {
      void setCommunityTypingRef.current(false).catch((cause: unknown) => {
        console.error("Could not clear community typing status.", cause);
      });
    }
    for (const url of pendingAttachmentUrlsRef.current.values()) URL.revokeObjectURL(url);
    pendingAttachmentUrlsRef.current.clear();
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

  useEffect(() => {
    if (!imagePreview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeImagePreview();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeImagePreview, imagePreview]);
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
      setForwardMessage(null);
      setForwardClosing(false);
      forwardCloseTimerRef.current = null;
    }, 160);
  }
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

  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 120);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > 120 ? "auto" : "hidden";
  }, [draft]);

  function openForwardDialog(message: CommunityMessage) {
    if (forwardCloseTimerRef.current !== null) {
      window.clearTimeout(forwardCloseTimerRef.current);
      forwardCloseTimerRef.current = null;
    }
    setForwardSearch("");
    setForwardClosing(false);
    setForwardMessage(message);
    closeMessageMenu();
  }

  async function sendText(event?: FormEvent) {
    event?.preventDefault();
    const keepFocus = document.activeElement === composerRef.current;
    if (editingMessage) {
      const editedBody = draft.trim();
      if (!editedBody) return;
      setError(null);
      try {
        await store.editCommunityMessage(editingMessage.id, editedBody);
        setEditingMessage(null);
        setDraft("");
        setFile(null);
        if (keepFocus) composerRef.current?.focus({ preventScroll: true });
      } catch (cause) {
        setError(friendlyError(cause, "Could not edit the announcement."));
      }
      return;
    }
    if (!draft.trim() && !file) return;
    const sentBody = draft.trim();
    const sentFile = file;
    const sentReply = replyTo;
    const sentAt = Math.max(Date.now(), lastPendingAtRef.current + 1);
    lastPendingAtRef.current = sentAt;
    const pendingId = `pending-${sentAt}`;
    const attachmentUrl = sentFile ? URL.createObjectURL(sentFile) : undefined;
    if (attachmentUrl) pendingAttachmentUrlsRef.current.set(pendingId, attachmentUrl);
    wasPinnedRef.current = true;
    setPendingMessages((cur) => [
      ...cur.slice(-299),
      {
        id: pendingId,
        senderId: store.me?.id ?? "",
        senderName: store.me?.displayName ?? "",
        senderUsername: store.me?.username ?? "",
        senderAvatarUrl: store.me?.avatarUrl,
        senderAvatarColor: store.me?.avatarColor ?? "black",
        body: sentBody,
        bubbleStyle: getSavedOutgoingBubbleStyle(),
        type: "text" as const,
        pollOptions: [],
        votes: [],
        createdAt: sentAt,
        canModerate: true,
        isOwner: false,
        attachmentUrl,
        attachmentName: sentFile?.name,
        attachmentType: sentFile?.type,
      },
    ]);
    window.requestAnimationFrame(() => {
      if (messagesElement.current) {
        messagesElement.current.scrollTop = messagesElement.current.scrollHeight;
      }
    });
    setDraft("");
    setFile(null);
    setReplyTo(null);
    setError(null);
    if (keepFocus) composerRef.current?.focus({ preventScroll: true });
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    typingRef.current = false;
    void setCommunityTyping(false).catch(() => undefined);
    try {
      await store.sendCommunityText(sentBody, sentFile ?? undefined, sentReply?.id, undefined);
      if (store.soundsEnabled) playMessageSound("sent");
      window.setTimeout(() => {
        const url = pendingAttachmentUrlsRef.current.get(pendingId);
        if (url) {
          URL.revokeObjectURL(url);
          pendingAttachmentUrlsRef.current.delete(pendingId);
        }
        setPendingMessages((cur) => cur.filter((m) => m.id !== pendingId));
      }, 1500);
    } catch (cause) {
      const url = pendingAttachmentUrlsRef.current.get(pendingId);
      if (url) {
        URL.revokeObjectURL(url);
        pendingAttachmentUrlsRef.current.delete(pendingId);
      }
      setPendingMessages((cur) => cur.filter((m) => m.id !== pendingId));
      setDraft((cur) => (cur.trim() ? cur : sentBody));
      if (sentFile) setFile((cur) => cur ?? sentFile);
      setError(friendlyError(cause, "Could not post to the community."));
    }
  }

  function updateDraft(value: string) {
    if (editingMessage) {
      setDraft(value);
      return;
    }
    setDraft(value);
    const typing = !!value.trim();
    if (typing !== typingRef.current) {
      typingRef.current = typing;
      void setCommunityTyping(typing).catch((cause: unknown) => {
        setError(friendlyError(cause, "Couldn't update typing status."));
      });
    }
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
    if (typing) {
      typingTimer.current = window.setTimeout(() => {
        typingRef.current = false;
        void setCommunityTyping(false).catch((cause: unknown) => {
          setError(friendlyError(cause, "Couldn't update typing status."));
        });
      }, 2500);
    }
  }

  async function sendSticker(sticker: Parameters<typeof store.sendCommunitySticker>[0]) {
    try {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current);
      typingRef.current = false;
      await setCommunityTyping(false);
      await store.sendCommunitySticker(sticker, replyTo?.id);
      setReplyTo(null);
    } catch (cause) {
      setError(friendlyError(cause, "Could not send the sticker."));
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
      setDraft("");
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

  const openMessageMenuAt = useCallback(
    (x: number, y: number, message: CommunityMessage) => {
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
          message.type === "text" &&
          !!message.body.trim(),
      });
      setReactionPickerOpen(false);
    },
    [store.me?.id],
  );

  const openMessageMenu = useCallback(
    (event: MouseEvent, message: CommunityMessage) => {
      event.preventDefault();
      event.stopPropagation();
      openMessageMenuAt(event.clientX, event.clientY, message);
    },
    [openMessageMenuAt],
  );

  async function sendCommunityVoiceNote(voiceFile: File) {
    setRecordingVoiceNote(false);
    const sentReply = replyTo;
    const sentAt = Math.max(Date.now(), lastPendingAtRef.current + 1);
    lastPendingAtRef.current = sentAt;
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
    setPendingMessages((cur) => [
      ...cur.slice(-299),
      {
        id: pendingId,
        senderId: store.me?.id ?? "",
        senderName: store.me?.displayName ?? "",
        senderUsername: store.me?.username ?? "",
        senderAvatarUrl: store.me?.avatarUrl,
        senderAvatarColor: store.me?.avatarColor ?? "black",
        body: "",
        type: "text" as const,
        pollOptions: [],
        votes: [],
        createdAt: sentAt,
        canModerate: true,
        isOwner: false,
        attachmentUrl,
        attachmentName: voiceFile.name,
        attachmentType: voiceFile.type,
      },
    ]);
    setReplyTo(null);
    setError(null);
    try {
      await store.sendCommunityText("", voiceFile, sentReply?.id, undefined);
      if (store.soundsEnabled) playMessageSound("sent");
    } catch (cause) {
      const url = pendingAttachmentUrlsRef.current.get(pendingId);
      if (url) {
        URL.revokeObjectURL(url);
        pendingAttachmentUrlsRef.current.delete(pendingId);
      }
      setPendingMessages((cur) => cur.filter((m) => m.id !== pendingId));
      setError(friendlyError(cause, "Could not post voice note."));
    }
  }
  function replyToMessage(message: CommunityMessage) {
    setReplyTo(message);
    closeMessageMenu();
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }
  function startEditingMessage(message: CommunityMessage) {
    setPendingMessages([]);
    setEditingMessage({ id: message.id, body: message.body });
    setReplyTo(null);
    setFile(null);
    setDraft(message.body);
    closeMessageMenu();
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }
  async function copyMessage(message: CommunityMessage) {
    try {
      await navigator.clipboard.writeText(message.unsentAt ? "This message was unsent" : message.body || message.attachmentName || message.stickerName || "");
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't copy the message."));
    }
  }
  async function copyImageAddress(message: CommunityMessage) {
    const url = message.attachmentUrl ?? message.stickerUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't copy the image address."));
    }
  }
  async function copyImage(message: CommunityMessage) {
    const url = message.attachmentUrl ?? message.stickerUrl;
    if (!url) return;
    try {
      await copyImageUrlToClipboard(url);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't copy the image."));
    }
  }
  async function deleteForMe(message: CommunityMessage) {
    try {
      await store.deleteCommunityMessageForMe(message.id);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't delete the message."));
    }
  }
  async function unsend(message: CommunityMessage) {
    try {
      const shouldShowWarning = await store.unsendCommunityMessage(message.id);
      if (shouldShowWarning) setShowUnsendWarning(true);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't unsend the message."));
    }
  }
  const reactToMessage = useCallback(
    async (message: CommunityMessage, emoji: string) => {
      try {
        await store.toggleCommunityReaction(message.id, emoji);
        closeMessageMenu();
        setReactionPickerOpen(false);
      } catch (err) {
        setError(friendlyError(err, "Couldn't add the reaction."));
      }
    },
    [closeMessageMenu, store],
  );
  async function favoriteSticker(message: CommunityMessage) {
    try {
      await store.favoriteCommunityStickerFromMessage(message.id);
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't update your sticker favourites."));
    }
  }
  async function forwardToFriend(receiverId: string) {
    if (!forwardMessage) return;
    try {
      await store.forwardCommunityMessage(forwardMessage.id, { userId: receiverId });
      closeForwardDialog();
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't forward the message."));
    }
  }
  async function forwardToGroup(targetGroupId: string) {
    if (!forwardMessage) return;
    try {
      await store.forwardCommunityMessage(forwardMessage.id, { groupId: targetGroupId });
      closeForwardDialog();
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't forward the message."));
    }
  }
  async function forwardToCommunity() {
    if (!forwardMessage) return;
    try {
      await store.forwardCommunityMessage(forwardMessage.id, { community: true });
      closeForwardDialog();
      closeMessageMenu();
    } catch (err) {
      setError(friendlyError(err, "Couldn't forward the message."));
    }
  }

  return (
    <section className="chat community-chat">
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={onBack} aria-label="Back">←</button>
        <img className="community-mark" src="/jatext-logo-icon.png" alt="" />
        <div className="chat-title community-title">
          <strong>JaText Community</strong>
          <span className="community-title-badges">
            <span className="verified-badge" title="Verified JaText account">✓</span>
            <span className="official-badge">Official</span>
          </span>
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

      {showUnsendWarning && (
        <div className="unsend-warning-banner" role="status">
          <span>You unsent a message. In the meantime, they may have already seen it, screenshotted it, or reported it.</span>
          <button type="button" className="unsend-warning-dismiss" aria-label="Dismiss unsend notice" onClick={() => setShowUnsendWarning(false)}>×</button>
        </div>
      )}

      <div
        className="messages community-messages"
        ref={messagesElement}
        onScroll={(event) => {
          const element = event.currentTarget;
          wasPinnedRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
      >
        {displayedMessages.length === 0 && (
          <div className="empty-box center">
            <strong>Welcome to the JaText Community</strong>
            <span className="muted">Official updates and polls will appear here.</span>
          </div>
        )}
        {displayedMessages.map((message) => {
          const counts = message.pollOptions.map(
            (_, index) => message.votes.filter((vote) => vote.optionIndex === index).length,
          );
          const totalVotes = counts.reduce((total, count) => total + count, 0);
          const canManagePost =
            store.communityPermissions.canModerate &&
            (store.communityPermissions.isOwner || message.senderId === store.me?.id);
          const showResults = !!message.pollEndedAt || message.myVote !== undefined;
          const isAudioNote = isVoiceNoteOrAudio(message.attachmentType, message.attachmentName);
          const isImage =
            !isAudioNote &&
            (Boolean(message.attachmentType?.startsWith("image/")) ||
              /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$|\s)/i.test(
                `${message.attachmentName ?? ""} ${message.attachmentUrl ?? ""}`,
              ));
          const isVideo =
            !isAudioNote &&
            (message.attachmentType?.startsWith("video/") ||
              /\.(mp4|m4v|mov|webm|ogg)$/i.test(message.attachmentName ?? ""));
          return (
            <article
              className="community-post"
              key={message.renderKey ?? message.id}
              id={`community-message-${message.id}`}
              onContextMenu={(e) => openMessageMenu(e, message)}
              onTouchStart={(e) => startPostTouchHold(e, message)}
              onTouchMove={movePostTouchHold}
              onTouchEnd={cancelPostTouchHold}
              onTouchCancel={cancelPostTouchHold}
            >
              <div className="community-post-header">
                <Avatar
                  user={{
                    displayName: message.senderName || "JaText",
                    username: message.senderUsername,
                    avatarColor: message.senderAvatarColor,
                    avatarUrl: message.senderAvatarUrl,
                  }}
                  size={32}
                  onClick={
                    onOpenProfile
                      ? () =>
                          onOpenProfile({
                            id: message.senderId,
                            displayName: message.senderName || "JaText",
                            username: message.senderUsername || "jatext",
                            bio: "",
                            pronouns: "",
                            avatarColor: message.senderAvatarColor || "black",
                            avatarUrl: message.senderAvatarUrl,
                            onboardingComplete: true,
                          })
                      : undefined
                  }
                />
                <strong>{message.senderName || "JaText"}</strong>
                <span className="verified-badge" title="Verified">✓</span>
                <span className="official-badge">Official</span>
                <time className="muted small">{new Date(message.createdAt).toLocaleString()}</time>
                {message.editedAt && <span className="muted small">Edited</span>}
                {message.unsentAt && <span className="muted small">Unsent</span>}
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
                <>
                  {message.forwardedFromName && (
                    <span className="message-meta forwarded-label">↗ Forwarded from {message.forwardedFromName}</span>
                  )}
                  {message.replyTo && (
                    <button
                      type="button"
                      className="reply-quote community-reply-quote"
                      onClick={() => document.getElementById(`community-message-${message.replyTo?.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                    >
                      <strong>{message.replyTo.senderName}</strong>
                      <span>{message.replyTo.body}</span>
                    </button>
                  )}
                  {message.unsentAt ? (
                    <p className="community-post-body" style={{ fontStyle: "italic", color: "var(--muted)" }}>This message was unsent</p>
                  ) : (
                    <>
                      {message.attachmentUrl &&
                        (isAudioNote ? (
                          <VoiceNotePlayer
                            messageId={message.id}
                            audioUrl={message.attachmentUrl}
                            attachmentType={message.attachmentType}
                            mine={message.senderId === store.me?.id}
                            showTranscript={Boolean(shownTranscriptIds[message.id])}
                            onToggleTranscript={(show) =>
                              setShownTranscriptIds((prev) => ({ ...prev, [message.id]: show }))
                            }
                            onOpenContextAt={
                              message.id.startsWith("pending-")
                                ? undefined
                                : (x, y) => openMessageMenuAt(x, y, message)
                            }
                          />
                        ) : isImage ? (
                          <button type="button" className="image-message-button" onClick={() => openImagePreview(message.attachmentUrl!)} aria-label="Open image viewer">
                            <img className="msg-image" src={message.attachmentUrl} alt={message.attachmentName ?? "attachment"} />
                          </button>
                        ) : isVideo ? (
                          <div className="video-attachment">
                            <video className="msg-video" controls playsInline preload="metadata" src={message.attachmentUrl}>
                              Your browser does not support video playback.
                            </video>
                          </div>
                        ) : (
                          <a className="file-chip" href={message.attachmentUrl} download={message.attachmentName ?? "file"} target="_blank" rel="noreferrer">
                            📎 {message.attachmentName ?? "Attachment"}
                          </a>
                        ))}
                      {message.stickerUrl && (
                        <button
                          type="button"
                          className="image-message-button sticker-message-button"
                          onClick={() => openImagePreview(message.stickerUrl!)}
                          aria-label="Open sticker viewer"
                        >
                          <img
                            className="group-message-sticker"
                            src={message.stickerUrl}
                            alt={message.stickerName ?? "Sticker"}
                            style={{ maxWidth: 220, maxHeight: 220 }}
                          />
                        </button>
                      )}
                      {message.body &&
                        (message.bubbleStyle && message.bubbleStyle !== "default" ? (
                          <DecoratedMessageBubble
                            styleId={message.bubbleStyle}
                            mine={message.senderId === store.me?.id}
                            className="community-styled-bubble"
                          >
                            <p className="community-post-body">{message.body}</p>
                          </DecoratedMessageBubble>
                        ) : (
                          <p className="community-post-body">{message.body}</p>
                        ))}
                    </>
                  )}
                  {!!message.reactions?.length && (
                    <div className="message-reactions" style={{ marginTop: 8 }}>
                      {Array.from(new Set(message.reactions.map((r) => r.emoji))).map((emoji) => {
                        const users = message.reactions?.filter((r) => r.emoji === emoji) ?? [];
                        const mineReacted = users.some((r) => r.userId === store.me?.id);
                        return (
                          <button type="button" key={emoji} className={`reaction-chip ${mineReacted ? "selected" : ""}`} onClick={() => void reactToMessage(message, emoji)}>
                            {emoji} <span>{users.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              {message.type !== "poll" && !message.unsentAt && editingMessage?.id !== message.id && (
                <div className="community-post-actions">
                  {store.communityPermissions.canModerate && (
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        setReplyTo(message);
                        window.setTimeout(() => composerRef.current?.focus(), 0);
                      }}
                    >
                      Reply
                    </button>
                  )}
                  <button type="button" className="mini-btn" onClick={() => openForwardDialog(message)}>
                    Forward
                  </button>
                </div>
              )}
              {(canManagePost || message.type === "poll") && !message.unsentAt && (
                <div className="community-post-actions">
                  {message.type === "text" && editingMessage?.id !== message.id && canManagePost && (
                    <button type="button" className="ghost-btn" onClick={() => setEditingMessage({ id: message.id, body: message.body })}>Edit announcement</button>
                  )}
                  {message.type === "poll" && (
                    <button type="button" className="ghost-btn" onClick={() => setVoterPollId(message.id)}>View who voted</button>
                  )}
                  {canManagePost && (
                    <button type="button" className="ghost-btn destructive-menu-item" onClick={() => void deleteAnnouncement(message.id)}>Delete</button>
                  )}
                </div>
              )}
              {message.type === "poll" && !message.unsentAt && (
                <div className="community-poll">
                  {message.pollOptions.map((option, index) => {
                    const percentage = totalVotes ? Math.round((counts[index] / totalVotes) * 100) : 0;
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
                    {message.pollEndedAt ? " · Poll ended" : message.myVote !== undefined ? " · Your vote is counted" : " · Select an option to vote"}
                  </div>
                  {store.communityPermissions.isOwner && !message.pollEndedAt && (
                    <button className="ghost-btn" type="button" onClick={() => void endPoll(message.id)}>End poll</button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {error && <div className="error-box community-error" role="alert">{error}</div>}
      {store.mode === "convex" && <CommunityTypingStatus />}

      {file && (
        <div className="attach-preview">📎 {file.name} <button className="mini-btn" onClick={() => setFile(null)}>✕ Remove</button></div>
      )}
      {replyTo && !editingMessage && (
        <div className="reply-composer-preview">
          <div>
            <strong>Replying to {replyTo.senderName}</strong>
            <span>{replyTo.body || replyTo.attachmentName || replyTo.stickerName || "Attachment"}</span>
          </div>
          <button type="button" className="mini-btn" onClick={() => setReplyTo(null)}>×</button>
        </div>
      )}
      {editingMessage && (
        <div className="reply-composer-preview">
          <div><strong>Editing your message</strong><span>{editingMessage.body}</span></div>
          <button type="button" className="mini-btn" onClick={() => { setEditingMessage(null); setDraft(""); }}>×</button>
        </div>
      )}

      {store.communityPermissions.canModerate ? (
        <>
          {showPoll && (
            <form className="community-poll-form" onSubmit={(event) => void sendPoll(event)}>
              <input value={pollQuestion} maxLength={300} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Ask a poll question" aria-label="Poll question" />
              {pollOptions.map((option, index) => (
                <div className="community-poll-edit-option" key={index}>
                  <input value={option} maxLength={120} onChange={(event) => setPollOptions((current) => current.map((value, optionIndex) => (optionIndex === index ? event.target.value : value)))} placeholder={`Option ${index + 1}`} aria-label={`Poll option ${index + 1}`} />
                  {pollOptions.length > 1 && <button type="button" className="mini-btn" onClick={() => setPollOptions((current) => current.filter((_, i) => i !== index))} aria-label={`Remove option ${index + 1}`}>×</button>}
                </div>
              ))}
              <div className="community-poll-form-actions">
                {pollOptions.length < 6 && <button type="button" className="ghost-btn" onClick={() => setPollOptions((current) => [...current, ""])}>Add option</button>}
                <button type="submit" className="primary-btn" disabled={busy}>Post poll</button>
                <button type="button" className="ghost-btn" onClick={() => setShowPoll(false)}>Cancel</button>
              </div>
            </form>
          )}
          {recordingVoiceNote ? (
            <div className="composer community-composer voice-composer-active">
              <VoiceNoteRecorder
                onCancel={() => setRecordingVoiceNote(false)}
                onSendVoiceNote={(voiceFile) => sendCommunityVoiceNote(voiceFile)}
                onError={(msg) => setError(msg)}
              />
            </div>
          ) : (
            <form className="composer community-composer" onSubmit={(event) => void sendText(event)}>
              <input
                ref={fileInput}
                type="file"
                hidden
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  e.currentTarget.value = "";
                }}
              />
              <button type="button" className="icon-btn attach-btn" disabled={!!editingMessage} onClick={() => fileInput.current?.click()} title="Attach a photo or file">📎</button>
              <StickerPicker friendId="" disabled={!!editingMessage} onSelect={sendSticker} />
              <button
                type="button"
                className="icon-btn voice-note-btn"
                title="Record voice note"
                aria-label="Record voice note"
                disabled={!!editingMessage}
                onClick={() => setRecordingVoiceNote(true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
                </svg>
              </button>
              <button
                type="button"
                className={`icon-btn poll-toggle-btn ${showPoll ? "active" : ""}`}
                title="Create poll"
                aria-label="Create poll"
                aria-expanded={showPoll}
                disabled={!!editingMessage}
                onClick={() => setShowPoll((open) => !open)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 20V11M12 20V4M19 20v-7" />
                </svg>
              </button>
              <textarea
                ref={composerRef}
                value={draft}
                maxLength={4000}
                onChange={(event) => updateDraft(event.target.value)}
                rows={1}
                placeholder={editingMessage ? "Edit message…" : "Message…"}
                aria-label="Community message"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendText();
                  }
                }}
              />
              <button
                type="submit"
                className="send-btn"
                disabled={editingMessage ? !draft.trim() : !draft.trim() && !file}
                onPointerDown={(event) => event.preventDefault()}
                onMouseDown={(event) => event.preventDefault()}
              >
                {editingMessage ? "✓" : "➤"}
              </button>
            </form>
          )}
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
                <input ref={directorySearchInput} className="search-input community-directory-search" value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} placeholder="Search people…" aria-label="Search registered people" autoFocus />
              )}
              <button type="button" className="icon-btn community-directory-search-toggle" aria-label={directorySearchOpen ? "Close people search" : "Search registered people"} title={directorySearchOpen ? "Close search" : "Search people"} onClick={() => { setDirectorySearchOpen((open) => !open); if (directorySearchOpen) setDirectorySearch(""); else window.setTimeout(() => directorySearchInput.current?.focus(), 0); }}>
                {directorySearchOpen ? "×" : (<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>)}
              </button>
            </div>
            <div className="community-directory">
              {filteredDirectory.map(({ person, index }) => (
                <label className="community-directory-person" key={person.id}>
                  <input type="checkbox" checked={selectedModerators.includes(person.id)} disabled={person.username === "imzachie"} onChange={(event) => setSelectedModerators((current) => event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id))} />
                  <Avatar user={{ displayName: person.displayName, username: person.username, avatarColor: person.avatarColor, avatarUrl: person.avatarUrl }} size={34} />
                  <span>{index + 1}. <strong>{person.displayName}</strong> @{person.username}</span>
                  <time className="muted small">{new Date(person.createdAt).toLocaleDateString()}</time>
                </label>
              ))}
              {filteredDirectory.length === 0 && <p className="muted">{store.communityDirectory.length === 0 ? "No registered usernames were found." : "No accounts match your search."}</p>}
            </div>
            <button className="primary-btn" disabled={busy} onClick={() => void saveModerators()}>Save moderators</button>
          </section>
        </div>
      )}
      {voterPoll && store.mode === "convex" && <CommunityVoterDialog poll={voterPoll} onClose={() => setVoterPollId(null)} />}

      {messageMenu && (
        <ContextMenu x={messageMenu.x} y={messageMenu.y} label="Message actions" className={`message-context-menu ${messageMenuClosing ? "closing" : ""}`} onClose={closeMessageMenu}>
          <button type="button" role="menuitem" onClick={() => replyToMessage(messageMenu.message)}><span>↩️</span> Reply</button>
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
                <span>💬</span> Bubble style
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
                <span>📝</span>{" "}
                {shownTranscriptIds[messageMenu.message.id]
                  ? "Hide transcription"
                  : "Show transcription"}
              </button>
            )}
          {!messageMenu.message.unsentAt && (
            <>
              {messageMenu.canEdit && <button type="button" role="menuitem" onClick={() => startEditingMessage(messageMenu.message)}><span>✏️</span> Edit message</button>}
              <button type="button" role="menuitem" onClick={() => openForwardDialog(messageMenu.message)}><span>↗️</span> Forward</button>
              <button type="button" role="menuitem" onClick={() => setReactionPickerOpen((open) => !open)} aria-expanded={reactionPickerOpen}><span>✨</span> Reaction</button>
              {reactionPickerOpen && (
                <div className="context-reactions" aria-label="Choose reaction">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button type="button" key={emoji} aria-label={`React with ${emoji}`} onClick={() => void reactToMessage(messageMenu.message, emoji)}>{emoji}</button>
                  ))}
                </div>
              )}
            </>
          )}
          <button type="button" role="menuitem" onClick={() => void copyMessage(messageMenu.message)}><span>📋</span> Copy text</button>
          <button type="button" role="menuitem" onClick={() => void deleteForMe(messageMenu.message)}><span>🗑️</span> Delete for me</button>
          {(messageMenu.message.stickerKey || messageMenu.message.attachmentType?.startsWith("image/") || messageMenu.message.stickerUrl || messageMenu.message.attachmentUrl) && (
            <button type="button" role="menuitem" onClick={() => void favoriteSticker(messageMenu.message)}>
              <span>{messageMenu.message.isStickerFavorite ? "☆" : "⭐"}</span>
              {messageMenu.message.attachmentType?.startsWith("image/") && !messageMenu.message.stickerKey ? "Make this image a sticker..." : messageMenu.message.isStickerFavorite ? "Remove from favourites" : "Add to favourites"}
            </button>
          )}
          {(messageMenu.message.attachmentType?.startsWith("image/") || messageMenu.message.stickerUrl) && (
            <>
              <button type="button" role="menuitem" onClick={() => void copyImage(messageMenu.message)}><span>🖼️</span> Copy image</button>
              <button type="button" role="menuitem" onClick={() => void copyImageAddress(messageMenu.message)}><span>🔗</span> Copy image address</button>
            </>
          )}
          {messageMenu.canUnsend && (
            <button type="button" role="menuitem" className="destructive-menu-item" onClick={() => void unsend(messageMenu.message)}><span>↩️</span> Unsend</button>
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
              <button type="button" className="icon-btn" aria-label="Close forward dialog" onClick={closeForwardDialog}>✕</button>
            </header>
            {(store.friends.length + store.groups.length > 4) && (
              <input
                className="forward-search-input"
                value={forwardSearch}
                onChange={(event) => setForwardSearch(event.target.value)}
                placeholder="Search friends or groups…"
                aria-label="Search friends or groups"
              />
            )}
            <div className="forward-friends">
              {store.communityPermissions.canModerate &&
                (!forwardSearch.trim() || "jatext community official".includes(forwardSearch.trim().toLowerCase())) && (
                  <button type="button" className="forward-friend" onClick={() => void forwardToCommunity()}>
                    <img className="community-mark" src="/jatext-logo-icon.png" alt="" style={{ width: 38, height: 38 }} />
                    <span>JaText Community</span>
                    <span className="muted">Official</span>
                  </button>
                )}
              {store.friends
                .filter((target) => {
                  const q = forwardSearch.trim().toLowerCase();
                  return !q || target.displayName.toLowerCase().includes(q) || target.username.toLowerCase().includes(q);
                })
                .map((target) => (
                  <button type="button" key={target.id} className="forward-friend" onClick={() => void forwardToFriend(target.id)}>
                    <Avatar user={target} size={38} />
                    <span>{target.displayName}</span>
                    <span className="muted">@{target.username}</span>
                  </button>
                ))}
              {store.groups
                .filter((target) => {
                  const q = forwardSearch.trim().toLowerCase();
                  return !q || target.name.toLowerCase().includes(q);
                })
                .map((target) => (
                  <button type="button" key={target.id} className="forward-friend" onClick={() => void forwardToGroup(target.id)}>
                    {target.avatarUrl ? (
                      <img className="group-avatar" src={target.avatarUrl} alt="" style={{ width: 38, height: 38 }} />
                    ) : (
                      <span className="group-avatar group-avatar-fallback" style={{ width: 38, height: 38, fontSize: 18 }}>👥</span>
                    )}
                    <span>{target.name}</span>
                    <span className="muted">{target.memberCount} members</span>
                  </button>
                ))}
              {store.friends.length === 0 && store.groups.length === 0 && !store.communityPermissions.canModerate && (
                <p className="muted center">You do not have anyone to forward to yet.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {bubbleStyleOpen && (
        <BubbleStyleModal onClose={() => setBubbleStyleOpen(false)} />
      )}
      {imagePreview && (
        <div className={`media-lightbox ${imageClosing ? "closing" : ""}`} role="dialog" aria-modal="true" aria-label="Image viewer" onClick={closeImagePreview}>
          <button type="button" className="media-lightbox-close" aria-label="Close image viewer" onClick={closeImagePreview}>×</button>
          <img ref={imageElementRef} src={imagePreview} alt="Full-size attachment" style={{ transform: "translate3d(0, 0, 0) scale(1)" }} onClick={(event) => event.stopPropagation()} onTouchStart={startImageGesture} onTouchMove={moveImageGesture} onTouchEnd={endImageGesture} onTouchCancel={endImageGesture} onWheel={(event) => { event.preventDefault(); const { scale, x, y } = imageTransformRef.current; applyImageTransform(Math.min(4, Math.max(1, scale + (event.deltaY < 0 ? 0.2 : -0.2))), x, y); }} />
          <span className="media-lightbox-hint">Pinch to zoom · Drag to move · Click outside or press Esc to close</span>
        </div>
      )}
    </section>
  );
}
