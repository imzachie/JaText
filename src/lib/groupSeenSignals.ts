import type { GroupMember, GroupMessage } from "./types";

export const GROUP_SEEN_SIGNAL_PREFIX = "__JATEXT_CALL_SIG__:SEEN:";

export interface GroupSeenSignalPayload {
  v: 1;
  messageId: string;
  seenUpToTs: number;
  ts: number;
}

export function isGroupSeenSignal(body?: string | null): boolean {
  return Boolean(body && body.startsWith(GROUP_SEEN_SIGNAL_PREFIX));
}

export function parseGroupSeenSignal(body?: string | null): GroupSeenSignalPayload | null {
  if (!body || !body.startsWith(GROUP_SEEN_SIGNAL_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      body.slice(GROUP_SEEN_SIGNAL_PREFIX.length),
    ) as Partial<GroupSeenSignalPayload>;
    if (
      parsed.v !== 1 ||
      typeof parsed.messageId !== "string" ||
      typeof parsed.seenUpToTs !== "number"
    ) {
      return null;
    }
    return {
      v: 1,
      messageId: parsed.messageId,
      seenUpToTs: parsed.seenUpToTs,
      ts: typeof parsed.ts === "number" ? parsed.ts : parsed.seenUpToTs,
    };
  } catch {
    return null;
  }
}

export function serializeGroupSeenSignal(payload: GroupSeenSignalPayload): string {
  return `${GROUP_SEEN_SIGNAL_PREFIX}${JSON.stringify(payload)}`;
}

export interface GroupSeenReader {
  id: string;
  displayName: string;
  username: string;
  avatarColor: string;
  avatarUrl?: string;
}

/**
 * Computes:
 * 1) `myCursorRow`: the current user's existing in-place-editable seen-signal row (if any) and highest `seenUpToTs`
 * 2) `seenByMessageId`: map of `visibleMessageId -> GroupSeenReader[]` showing mini PFP indicators underneath messages
 */
export function computeGroupSeenMap(
  rawGroupMessages: GroupMessage[],
  visibleMessages: GroupMessage[],
  members: GroupMember[],
  myUserId: string | undefined,
): {
  myCursorMessageId: string | null;
  mySeenUpToTs: number;
  seenByMessageId: Map<string, GroupSeenReader[]>;
} {
  let myCursorMessageId: string | null = null;
  let myCursorLatestEditTs = -1;
  let mySeenUpToTs = 0;

  const memberSeenTs = new Map<string, number>();
  const memberInfoFallback = new Map<string, GroupSeenReader>();

  for (const m of members) {
    memberInfoFallback.set(m.id, {
      id: m.id,
      displayName: m.displayName,
      username: m.username,
      avatarColor: m.avatarColor,
      avatarUrl: m.avatarUrl,
    });
  }

  for (const msg of rawGroupMessages) {
    if (!memberInfoFallback.has(msg.senderId)) {
      memberInfoFallback.set(msg.senderId, {
        id: msg.senderId,
        displayName: msg.senderName,
        username: msg.senderUsername,
        avatarColor: msg.senderAvatarColor,
        avatarUrl: msg.senderAvatarUrl,
      });
    }

    const seenSig = parseGroupSeenSignal(msg.body);
    if (seenSig) {
      const prev = memberSeenTs.get(msg.senderId) ?? 0;
      if (seenSig.seenUpToTs > prev) {
        memberSeenTs.set(msg.senderId, seenSig.seenUpToTs);
      }
      if (myUserId && msg.senderId === myUserId) {
        const stamp = Math.max(msg.editedAt ?? 0, msg.createdAt ?? 0, seenSig.ts ?? 0);
        if (stamp >= myCursorLatestEditTs) {
          myCursorLatestEditTs = stamp;
          myCursorMessageId = msg.id;
        }
        if (seenSig.seenUpToTs > mySeenUpToTs) {
          mySeenUpToTs = seenSig.seenUpToTs;
        }
      }
      continue;
    }

    // Any normal visible message sent by a member implicitly proves they have seen up to msg.createdAt
    if (!msg.body.startsWith("__JATEXT_CALL_SIG__:")) {
      const prev = memberSeenTs.get(msg.senderId) ?? 0;
      if (msg.createdAt > prev) {
        memberSeenTs.set(msg.senderId, msg.createdAt);
      }
    }
  }

  const seenByMessageId = new Map<string, GroupSeenReader[]>();
  if (visibleMessages.length === 0) {
    return { myCursorMessageId, mySeenUpToTs, seenByMessageId };
  }

  for (const [readerId, seenTs] of memberSeenTs.entries()) {
    if (!readerId || readerId === myUserId || seenTs <= 0) continue;
    const reader = memberInfoFallback.get(readerId);
    if (!reader) continue;

    // Attach this member's mini PFP to the latest visible message (not authored by themselves)
    // that they have seen up to!
    let targetMsgId: string | null = null;
    for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
      const vm = visibleMessages[i];
      if (vm.unsentAt) continue;
      if (vm.createdAt <= seenTs && vm.senderId !== readerId) {
        targetMsgId = vm.id;
        break;
      }
    }

    if (targetMsgId) {
      const list = seenByMessageId.get(targetMsgId) ?? [];
      list.push(reader);
      seenByMessageId.set(targetMsgId, list);
    }
  }

  return { myCursorMessageId, mySeenUpToTs, seenByMessageId };
}
