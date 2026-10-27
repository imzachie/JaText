export const REACTION_SIGNAL_PREFIX = "__JATEXT_CALL_SIG__:";

export const LEGACY_SERVER_REACTION_EMOJIS = new Set([
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
]);

export type ReactionSignalOp = "set" | "clear" | "native";

export interface ReactionSignalPayload {
  kind: "reaction";
  targetId: string;
  emoji: string;
  op: ReactionSignalOp;
  ts: number;
}

export interface IndexedReactionSignal {
  rowId: string;
  targetId: string;
  senderId: string;
  emoji: string;
  op: ReactionSignalOp;
  ts: number;
}

export function serializeReactionSignal(payload: ReactionSignalPayload): string {
  return `${REACTION_SIGNAL_PREFIX}${JSON.stringify(payload)}`;
}

export function parseReactionSignal(body?: string | null): ReactionSignalPayload | null {
  if (!body || !body.startsWith(REACTION_SIGNAL_PREFIX)) return null;
  try {
    const raw = body.slice(REACTION_SIGNAL_PREFIX.length);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Partial<ReactionSignalPayload>;
    if (
      rec.kind !== "reaction" ||
      typeof rec.targetId !== "string" ||
      !rec.targetId ||
      (rec.op !== "set" && rec.op !== "clear" && rec.op !== "native")
    ) {
      return null;
    }
    return {
      kind: "reaction",
      targetId: rec.targetId,
      emoji: typeof rec.emoji === "string" ? rec.emoji.trim() : "",
      op: rec.op,
      ts: typeof rec.ts === "number" ? rec.ts : 0,
    };
  } catch {
    return null;
  }
}

export function isReactionSignalBody(body?: string | null): boolean {
  return parseReactionSignal(body) !== null;
}

export interface ReactionFoldResult<T> {
  messages: T[];
  /** Keyed by `${targetId}:${senderId}` -> latest signal row */
  signalsByTargetUser: Map<string, IndexedReactionSignal>;
  /** Keyed by `${targetId}:${userId}` -> native emoji stored directly on message.reactions */
  nativeReactionsByTargetUser: Map<string, string>;
}

export function foldReactionSignals<
  T extends {
    id: string;
    senderId: string;
    body: string;
    createdAt: number;
    editedAt?: number;
    reactions?: { userId: string; emoji: string }[];
  },
>(
  rows: T[],
  optimistic?: Record<string, { userId: string; emoji: string | null }>,
  extraLocalByTarget?: Record<string, { userId: string; emoji: string }>,
): ReactionFoldResult<T> {
  const signalsByTargetUser = new Map<string, IndexedReactionSignal>();
  const signalsByTarget = new Map<string, IndexedReactionSignal[]>();
  const nativeReactionsByTargetUser = new Map<string, string>();
  const realRows: T[] = [];

  for (const row of rows) {
    const sig = parseReactionSignal(row.body);
    if (sig) {
      const effectiveTs = Math.max(sig.ts || 0, row.editedAt ?? 0, row.createdAt || 0);
      const key = `${sig.targetId}:${row.senderId}`;
      const prev = signalsByTargetUser.get(key);
      if (!prev || effectiveTs >= prev.ts) {
        signalsByTargetUser.set(key, {
          rowId: row.id,
          targetId: sig.targetId,
          senderId: row.senderId,
          emoji: sig.emoji,
          op: sig.op,
          ts: effectiveTs,
        });
      }
      continue;
    }
    realRows.push(row);
    if (row.reactions) {
      for (const r of row.reactions) {
        nativeReactionsByTargetUser.set(`${row.id}:${r.userId}`, r.emoji);
      }
    }
  }

  for (const entry of signalsByTargetUser.values()) {
    const list = signalsByTarget.get(entry.targetId);
    if (list) list.push(entry);
    else signalsByTarget.set(entry.targetId, [entry]);
  }

  const messages = realRows.map((row) => {
    const targetSignals = signalsByTarget.get(row.id);
    const opt = optimistic?.[row.id];
    const extra = extraLocalByTarget?.[row.id];
    if (!targetSignals && !opt && !extra) return row;

    const merged = new Map<string, string>();
    for (const r of row.reactions ?? []) {
      merged.set(r.userId, r.emoji);
    }

    if (targetSignals) {
      targetSignals.sort((a, b) => a.ts - b.ts);
      for (const sig of targetSignals) {
        if (sig.op === "set" && sig.emoji) {
          merged.set(sig.senderId, sig.emoji);
        } else if (sig.op === "clear") {
          merged.delete(sig.senderId);
        }
        // op === "native" leaves whatever is in `row.reactions` intact
      }
    }

    if (extra) {
      if (extra.emoji) merged.set(extra.userId, extra.emoji);
      else merged.delete(extra.userId);
    }

    if (opt) {
      if (opt.emoji) merged.set(opt.userId, opt.emoji);
      else merged.delete(opt.userId);
    }

    const reactions = Array.from(merged.entries()).map(([userId, emoji]) => ({
      userId,
      emoji,
    }));
    return {
      ...row,
      reactions,
    };
  });

  return { messages, signalsByTargetUser, nativeReactionsByTargetUser };
}

export function formatGroupReactionPreview(
  body: string,
  fallbackPreview?: string,
): { isSignal: boolean; text: string } {
  const sig = parseReactionSignal(body);
  if (!sig) return { isSignal: false, text: body };
  if (sig.op === "set" && sig.emoji) {
    return { isSignal: true, text: `Reacted ${sig.emoji} to a message` };
  }
  return { isSignal: true, text: fallbackPreview || "Updated a reaction" };
}

const LOCAL_COMMUNITY_REACTIONS_KEY = "jatext:community_custom_reactions:v1";

export function loadLocalCommunityReactions(): Record<string, { userId: string; emoji: string }> {
  try {
    const raw = localStorage.getItem(LOCAL_COMMUNITY_REACTIONS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, { userId: string; emoji: string }>;
  } catch {
    return {};
  }
}

export function saveLocalCommunityReaction(
  messageId: string,
  userId: string,
  emoji: string | null,
): Record<string, { userId: string; emoji: string }> {
  const next = { ...loadLocalCommunityReactions() };
  if (emoji) {
    next[messageId] = { userId, emoji };
  } else {
    delete next[messageId];
  }
  try {
    localStorage.setItem(LOCAL_COMMUNITY_REACTIONS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}
