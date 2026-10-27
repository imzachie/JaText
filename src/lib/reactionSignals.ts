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
  /** Full list of active reaction emojis by this user on targetId (supports 2+ reactions per user!) */
  emojis?: string[];
  op: ReactionSignalOp;
  ts: number;
}

export interface IndexedReactionSignal {
  rowId: string;
  targetId: string;
  senderId: string;
  emoji: string;
  emojis?: string[];
  op: ReactionSignalOp;
  ts: number;
}

export interface LocalUserReactionState {
  userId: string;
  emojis: string[];
}

function dedupeEmojis(list: unknown): string[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== "string") continue;
    const clean = item.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 24) break;
  }
  return out;
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
    const emojis = dedupeEmojis(rec.emojis);
    const single = typeof rec.emoji === "string" ? rec.emoji.trim() : "";
    return {
      kind: "reaction",
      targetId: rec.targetId,
      emoji: single || (emojis && emojis[0] ? emojis[0] : ""),
      ...(emojis ? { emojis } : {}),
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
  /** Keyed by `${targetId}:${userId}` -> native emojis stored directly on message.reactions */
  nativeReactionsByTargetUser: Map<string, string[]>;
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
  optimistic?: Record<string, LocalUserReactionState>,
  extraLocalByTarget?: Record<string, LocalUserReactionState>,
): ReactionFoldResult<T> {
  const signalsByTargetUser = new Map<string, IndexedReactionSignal>();
  const signalsByTarget = new Map<string, IndexedReactionSignal[]>();
  const nativeReactionsByTargetUser = new Map<string, string[]>();
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
          emojis: sig.emojis,
          op: sig.op,
          ts: effectiveTs,
        });
      }
      continue;
    }
    realRows.push(row);
    if (row.reactions) {
      for (const r of row.reactions) {
        const key = `${row.id}:${r.userId}`;
        const list = nativeReactionsByTargetUser.get(key);
        if (list) {
          if (!list.includes(r.emoji)) list.push(r.emoji);
        } else {
          nativeReactionsByTargetUser.set(key, [r.emoji]);
        }
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

    const byUser = new Map<string, string[]>();
    for (const r of row.reactions ?? []) {
      const list = byUser.get(r.userId);
      if (list) {
        if (!list.includes(r.emoji)) list.push(r.emoji);
      } else {
        byUser.set(r.userId, [r.emoji]);
      }
    }

    if (targetSignals) {
      targetSignals.sort((a, b) => a.ts - b.ts);
      for (const sig of targetSignals) {
        if (sig.op === "set") {
          if (sig.emojis) {
            byUser.set(sig.senderId, [...sig.emojis]);
          } else if (sig.emoji) {
            byUser.set(sig.senderId, [sig.emoji]);
          } else {
            byUser.delete(sig.senderId);
          }
        } else if (sig.op === "clear") {
          byUser.delete(sig.senderId);
        }
        // op === "native" leaves whatever is in `row.reactions` intact
      }
    }

    if (extra) {
      if (extra.emojis.length > 0) byUser.set(extra.userId, [...extra.emojis]);
      else byUser.delete(extra.userId);
    }

    if (opt) {
      if (opt.emojis.length > 0) byUser.set(opt.userId, [...opt.emojis]);
      else byUser.delete(opt.userId);
    }

    const reactions: { userId: string; emoji: string }[] = [];
    for (const [userId, emojis] of byUser.entries()) {
      const seen = new Set<string>();
      for (const em of emojis) {
        if (!em || seen.has(em)) continue;
        seen.add(em);
        reactions.push({ userId, emoji: em });
      }
    }

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
  const list = sig.emojis && sig.emojis.length > 0 ? sig.emojis : sig.emoji ? [sig.emoji] : [];
  if (sig.op === "set" && list.length > 0) {
    return { isSignal: true, text: `Reacted ${list.join(" ")} to a message` };
  }
  return { isSignal: true, text: fallbackPreview || "Updated a reaction" };
}

const LOCAL_COMMUNITY_REACTIONS_KEY = "jatext:community_custom_reactions:v1";

export function loadLocalCommunityReactions(): Record<string, LocalUserReactionState> {
  try {
    const raw = localStorage.getItem(LOCAL_COMMUNITY_REACTIONS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, LocalUserReactionState> = {};
    for (const [msgId, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (!val || typeof val !== "object") continue;
      const rec = val as { userId?: unknown; emoji?: unknown; emojis?: unknown };
      if (typeof rec.userId !== "string") continue;
      const arr =
        dedupeEmojis(rec.emojis) ??
        (typeof rec.emoji === "string" && rec.emoji.trim() ? [rec.emoji.trim()] : []);
      if (arr.length > 0) {
        out[msgId] = { userId: rec.userId, emojis: arr };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLocalCommunityReaction(
  messageId: string,
  userId: string,
  emojis: string[] | null,
): Record<string, LocalUserReactionState> {
  const next = { ...loadLocalCommunityReactions() };
  const clean = dedupeEmojis(emojis ?? []) ?? [];
  if (clean.length > 0) {
    next[messageId] = { userId, emojis: clean };
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
