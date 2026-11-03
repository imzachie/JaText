import { OFFICIAL_COMMUNITY_ID, type GroupSummary, type JaUser } from "./types";

export const FORWARD_METADATA_PREFIX = "__JATEXT_FWD_V1__:";

export interface ForwardedMessageContext {
  v: 1;
  sourceKind: "dm" | "group" | "community" | "channel";
  originalMessageId: string;
  originalCreatedAt: number;
  originalSenderId: string;
  originalSenderName: string;
  originalSenderUsername?: string;
  originalSenderAvatarUrl?: string;
  originalSenderAvatarColor?: string;
  /** For DMs: the 2 participant userIds who have access to that 1:1 conversation */
  dmUserIds?: [string, string];
  /** For Groups: groupId + display name */
  groupId?: string;
  groupName?: string;
  /** For Broadcast Channels: immutable attribution reference back to parent channel */
  channelId?: string;
  channelName?: string;
  channelVerified?: boolean;
}

function encodeUtf8Base64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeUtf8Base64Url(b64url: string): string | null {
  try {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

export function encodeForwardedBody(
  plainBody: string,
  context: ForwardedMessageContext,
): string {
  const cleanBody = stripForwardedMetadataFromText(plainBody);
  const encoded = encodeUtf8Base64Url(JSON.stringify(context));
  return cleanBody
    ? `${FORWARD_METADATA_PREFIX}${encoded}\n${cleanBody}`
    : `${FORWARD_METADATA_PREFIX}${encoded}`;
}

export function extractForwardedContext(body?: string | null): {
  context: ForwardedMessageContext | null;
  strippedBody: string;
} {
  if (!body) return { context: null, strippedBody: "" };
  const match = body.match(/__JATEXT_FWD_V1__:([A-Za-z0-9_-]+)\n?/);
  if (!match) {
    // Also clean legacy "Forwarded:\n" prefix if any old message used it
    if (body.startsWith("Forwarded:\n")) {
      return { context: null, strippedBody: body.slice("Forwarded:\n".length) };
    }
    return { context: null, strippedBody: body };
  }
  const strippedBody = body.replace(/__JATEXT_FWD_V1__:[A-Za-z0-9_-]+\n?/, "");
  const jsonText = decodeUtf8Base64Url(match[1]);
  if (!jsonText) return { context: null, strippedBody };
  try {
    const parsed = JSON.parse(jsonText) as Partial<ForwardedMessageContext>;
    if (
      parsed &&
      (parsed.sourceKind === "dm" ||
        parsed.sourceKind === "group" ||
        parsed.sourceKind === "community" ||
        parsed.sourceKind === "channel") &&
      typeof parsed.originalMessageId === "string" &&
      typeof parsed.originalCreatedAt === "number" &&
      typeof parsed.originalSenderName === "string"
    ) {
      return {
        context: {
          v: 1,
          sourceKind: parsed.sourceKind,
          originalMessageId: parsed.originalMessageId,
          originalCreatedAt: parsed.originalCreatedAt,
          originalSenderId: typeof parsed.originalSenderId === "string" ? parsed.originalSenderId : "",
          originalSenderName: parsed.originalSenderName,
          originalSenderUsername: parsed.originalSenderUsername,
          originalSenderAvatarUrl: parsed.originalSenderAvatarUrl,
          originalSenderAvatarColor: parsed.originalSenderAvatarColor,
          dmUserIds:
            Array.isArray(parsed.dmUserIds) &&
            parsed.dmUserIds.length === 2 &&
            typeof parsed.dmUserIds[0] === "string" &&
            typeof parsed.dmUserIds[1] === "string"
              ? [parsed.dmUserIds[0], parsed.dmUserIds[1]]
              : undefined,
          groupId: typeof parsed.groupId === "string" ? parsed.groupId : undefined,
          groupName: typeof parsed.groupName === "string" ? parsed.groupName : undefined,
          channelId: typeof parsed.channelId === "string" ? parsed.channelId : undefined,
          channelName: typeof parsed.channelName === "string" ? parsed.channelName : undefined,
          channelVerified: Boolean(parsed.channelVerified),
        },
        strippedBody,
      };
    }
  } catch {
    // ignore malformed metadata
  }
  return { context: null, strippedBody };
}

export function stripForwardedMetadataFromText(body?: string | null): string {
  if (!body) return "";
  return body
    .replace(/__JATEXT_FWD_V1__:[A-Za-z0-9_-]+\n?/g, "")
    .replace(/^Forwarded:\n/, "");
}

export function canAccessForwardedContext(
  context: ForwardedMessageContext | null | undefined,
  meId: string | undefined,
  friends: JaUser[],
  groups: GroupSummary[],
): boolean {
  if (!context || !context.originalMessageId || !meId) return false;
  if (context.sourceKind === "channel") {
    return Boolean(context.channelId);
  }
  if (context.sourceKind === "community") {
    return true;
  }
  if (context.sourceKind === "group") {
    if (!context.groupId) return false;
    return groups.some((g) => g.id === context.groupId);
  }
  if (context.sourceKind === "dm") {
    if (!context.dmUserIds || !context.dmUserIds.includes(meId)) {
      return false;
    }
    const peerId = context.dmUserIds[0] === meId ? context.dmUserIds[1] : context.dmUserIds[0];
    return Boolean(peerId && friends.some((f) => f.id === peerId));
  }
  return false;
}

export function formatForwardedTimestamp(createdAt: number): string {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return "";
  const d = new Date(createdAt);
  const datePart = d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart}`;
}

/* ------------------------------------------------------------------ */
/* Cross-View Jump Coordinator (DM / Group / Official Community)      */
/* ------------------------------------------------------------------ */

export interface PendingMessageJump {
  targetKind: "dm" | "group" | "community";
  targetChatId: string; // peer userId for DM, groupId for group, OFFICIAL_COMMUNITY_ID for community
  messageId: string;
  requestedAt: number;
}

let currentPendingJump: PendingMessageJump | null = null;
const jumpListeners = new Set<(jump: PendingMessageJump | null) => void>();

export function requestJumpToForwardedMessage(
  context: ForwardedMessageContext,
  meId: string,
  navigate: {
    setActiveChatId: (id: string | null) => void;
    setActiveGroupId: (id: string | null) => void;
  },
): boolean {
  if (context.sourceKind === "channel" && context.channelId) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("jatext:open-channel", {
          detail: { channelId: context.channelId, postId: context.originalMessageId },
        }),
      );
    }
    return true;
  }
  if (context.sourceKind === "community") {
    currentPendingJump = {
      targetKind: "community",
      targetChatId: OFFICIAL_COMMUNITY_ID,
      messageId: context.originalMessageId,
      requestedAt: Date.now(),
    };
    navigate.setActiveGroupId(null);
    navigate.setActiveChatId(OFFICIAL_COMMUNITY_ID);
  } else if (context.sourceKind === "group" && context.groupId) {
    currentPendingJump = {
      targetKind: "group",
      targetChatId: context.groupId,
      messageId: context.originalMessageId,
      requestedAt: Date.now(),
    };
    navigate.setActiveChatId(null);
    navigate.setActiveGroupId(context.groupId);
  } else if (context.sourceKind === "dm" && context.dmUserIds?.includes(meId)) {
    const peerId =
      context.dmUserIds[0] === meId ? context.dmUserIds[1] : context.dmUserIds[0];
    if (!peerId) return false;
    currentPendingJump = {
      targetKind: "dm",
      targetChatId: peerId,
      messageId: context.originalMessageId,
      requestedAt: Date.now(),
    };
    navigate.setActiveGroupId(null);
    navigate.setActiveChatId(peerId);
  } else {
    return false;
  }

  for (const listener of jumpListeners) {
    listener(currentPendingJump);
  }
  return true;
}

export function getPendingMessageJump(
  targetKind: PendingMessageJump["targetKind"],
  targetChatId: string,
): PendingMessageJump | null {
  if (!currentPendingJump) return null;
  if (Date.now() - currentPendingJump.requestedAt > 12_000) {
    currentPendingJump = null;
    return null;
  }
  if (
    currentPendingJump.targetKind === targetKind &&
    currentPendingJump.targetChatId === targetChatId
  ) {
    return currentPendingJump;
  }
  return null;
}

export function clearPendingMessageJump(messageId?: string): void {
  if (!currentPendingJump) return;
  if (!messageId || currentPendingJump.messageId === messageId) {
    currentPendingJump = null;
    for (const listener of jumpListeners) {
      listener(null);
    }
  }
}

export function subscribeMessageJumps(
  listener: (jump: PendingMessageJump | null) => void,
): () => void {
  jumpListeners.add(listener);
  return () => {
    jumpListeners.delete(listener);
  };
}
