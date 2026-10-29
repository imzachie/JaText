import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  areFriends,
  friendIds,
  hasBlocked,
  initialDmDeliveryStatus,
  isValidReactionEmoji,
  pairKey,
  requireUser,
  scheduleCallCancelPush,
  scheduleMessagePush,
} from "./lib";

const UNSEND_WINDOW_MS = 60 * 60 * 1000;

/**
 * Texting + attachments, all via Convex:
 * - generateUploadUrl: client uploads the file straight to Convex storage
 * - send: inserts the message (friends only!)
 * - list / previews: reactive queries, so new texts appear instantly
 */

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

/** Publish or clear a short-lived typing indicator to an accepted friend. */
export const setTyping = mutation({
  args: { receiverId: v.id("users"), isTyping: v.boolean() },
  handler: async (ctx, { receiverId, isTyping }) => {
    const me = await requireUser(ctx);
    if (!(await areFriends(ctx, me._id, receiverId)))
      throw new Error("You can only type to accepted friends.");
    if (
      (await hasBlocked(ctx, me._id, receiverId)) ||
      (await hasBlocked(ctx, receiverId, me._id))
    ) {
      return;
    }

    const presence = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .unique();
    if (!presence) {
      const now = Date.now();
      await ctx.db.insert("presence", {
        userId: me._id,
        lastSeenAt: now,
        lastActiveAt: now,
        ...(isTyping ? { typingToId: receiverId, typingAt: now } : {}),
      });
    } else {
      await ctx.db.patch(presence._id, {
        typingToId: isTyping ? receiverId : undefined,
        typingAt: isTyping ? Date.now() : undefined,
      });
    }
  },
});

async function withMessageDetails(
  ctx: QueryCtx,
  m: Doc<"messages">,
  currentUserId: Id<"users">,
): Promise<{
  id: string;
  senderId: string;
  receiverId: string;
  body: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  stickerKey?: string;
  isStickerFavorite?: boolean;
  createdAt: number;
  replyTo?: { id: string; senderId: string; body: string };
  forwardedFrom?: string;
  unsentAt?: number;
  editedAt?: number;
  reactions?: { userId: string; emoji: string }[];
  deliveryStatus?: "delivered" | "sent" | "read";
}> {
  const [reply, forwarder] = await Promise.all([
    m.replyToId ? ctx.db.get(m.replyToId) : null,
    m.forwardedFromId ? ctx.db.get(m.forwardedFromId) : null,
  ]);
  const mediaKey =
    m.stickerKey ??
    (m.attachmentId
      ? `upload:${m.attachmentId}`
      : m.attachmentUrl
        ? `klipy:${m.attachmentUrl}`
        : undefined);
  const favorite = mediaKey
    ? await ctx.db
        .query("stickerLibrary")
        .withIndex("by_user_media", (q) =>
          q.eq("userId", currentUserId).eq("mediaKey", mediaKey),
        )
        .unique()
    : null;
  return {
    id: m._id as string,
    senderId: m.senderId as string,
    receiverId: m.receiverId as string,
    body: m.unsentAt ? "" : m.body,
    attachmentUrl: m.unsentAt
      ? undefined
      : m.attachmentUrl ??
        (m.attachmentId
          ? ((await ctx.storage.getUrl(m.attachmentId)) ?? undefined)
          : undefined),
    attachmentName: m.unsentAt ? undefined : m.attachmentName,
    attachmentType: m.unsentAt ? undefined : m.attachmentType,
    stickerKey:
      m.stickerKey ?? (favorite ? mediaKey : undefined),
    isStickerFavorite: favorite?.isFavorite ?? false,
    deliveryStatus: m.deliveryStatus,
    editedAt: m.editedAt,
    createdAt: m._creationTime,
    replyTo: reply
      ? {
          id: reply._id as string,
          senderId: reply.senderId as string,
          body: reply.hiddenFor?.includes(currentUserId)
            ? "Message unavailable"
            : reply.unsentAt
              ? "This message was unsent"
              : reply.body,
        }
      : undefined,
    forwardedFrom: forwarder?.displayName ?? forwarder?.name ?? undefined,
    unsentAt: m.unsentAt,
    reactions: m.reactions?.map((reaction) => ({
      userId: reaction.userId as string,
      emoji: reaction.emoji,
    })),
  };
}

/** Send a text (optionally with an uploaded attachment) to a friend. */
export const send = mutation({
  args: {
    receiverId: v.id("users"),
    body: v.string(),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
    attachmentType: v.optional(v.string()),
    replyToId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!(await areFriends(ctx, me._id, args.receiverId)))
      throw new Error("You can only message people who accepted your friend request.");
    if (await hasBlocked(ctx, me._id, args.receiverId))
      throw new Error("You blocked this person. Unblock them to message.");
    if (!args.body.trim() && !args.attachmentId)
      throw new Error("Message is empty.");

    if (args.replyToId) {
      const parent = await ctx.db.get(args.replyToId);
      if (
        !parent ||
        parent.pairKey !== pairKey(me._id, args.receiverId) ||
        parent.hiddenFor?.includes(me._id)
      ) {
        throw new Error("The message you are replying to is unavailable.");
      }
    }

    const trimmedBody = args.body.trim();
    const isSilentSignal = trimmedBody.startsWith("__JATEXT_CALL_SIG__:");
    const initialStatus = isSilentSignal
      ? "delivered"
      : await initialDmDeliveryStatus(ctx, me._id, args.receiverId);

    const insertedId = await ctx.db.insert("messages", {
      senderId: me._id,
      receiverId: args.receiverId,
      pairKey: pairKey(me._id, args.receiverId),
      body: trimmedBody,
      attachmentId: args.attachmentId,
      attachmentName: args.attachmentName,
      attachmentType: args.attachmentType,
      replyToId: args.replyToId,
      deliveryStatus: initialStatus,
    });

    if (!isSilentSignal) {
      const pushBody =
        trimmedBody ||
        (args.attachmentType?.startsWith("audio/")
          ? "Sent a voice note"
          : args.attachmentName
            ? `Sent ${args.attachmentName}`
            : "Sent you an attachment");
      await scheduleMessagePush(ctx, me, args.receiverId, pushBody, insertedId);
    } else if (
      trimmedBody.includes("(__JATEXT_CALL_CANCEL__)") ||
      trimmedBody.includes('"type":"hangup"') ||
      trimmedBody.includes('"type":"decline"')
    ) {
      await scheduleCallCancelPush(ctx, me._id, args.receiverId);
      await scheduleCallCancelPush(ctx, me._id, me._id);
    } else if (
      trimmedBody.includes("(__JATEXT_CALL_CLAIM__)") ||
      trimmedBody.includes('"type":"claim"') ||
      trimmedBody.includes('"type":"answer"')
    ) {
      await scheduleCallCancelPush(ctx, me._id, me._id);
    }
  },
});

/** Forward a visible message to another accepted friend. */
export const forward = mutation({
  args: {
    messageId: v.id("messages"),
    receiverId: v.id("users"),
  },
  handler: async (ctx, { messageId, receiverId }) => {
    const me = await requireUser(ctx);
    const source = await ctx.db.get(messageId);
    if (
      !source ||
      (source.senderId !== me._id && source.receiverId !== me._id) ||
      source.hiddenFor?.includes(me._id) ||
      source.unsentAt
    ) {
      throw new Error("This message can no longer be forwarded.");
    }
    if (!(await areFriends(ctx, me._id, receiverId)))
      throw new Error("You can only forward messages to accepted friends.");
    if (await hasBlocked(ctx, me._id, receiverId))
      throw new Error("You blocked this person. Unblock them to forward messages.");

    const initialStatus = await initialDmDeliveryStatus(ctx, me._id, receiverId);
    const insertedId = await ctx.db.insert("messages", {
      senderId: me._id,
      receiverId,
      pairKey: pairKey(me._id, receiverId),
      body: source.body,
      attachmentId: source.attachmentId,
      attachmentUrl: source.attachmentUrl,
      attachmentName: source.attachmentName,
      attachmentType: source.attachmentType,
      stickerKey: source.stickerKey,
      forwardedFromId: source.senderId,
      deliveryStatus: initialStatus,
    });
    await scheduleMessagePush(
      ctx,
      me,
      receiverId,
      source.body || "Forwarded you a message",
      insertedId,
    );
  },
});

/** Add/remove the current user's one reaction on a message. */
export const toggleReaction = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, { messageId, emoji }) => {
    const me = await requireUser(ctx);
    const cleanEmoji = emoji.trim();
    if (!isValidReactionEmoji(cleanEmoji))
      throw new Error("That reaction is not available.");
    const message = await ctx.db.get(messageId);
    if (
      !message ||
      (message.senderId !== me._id && message.receiverId !== me._id) ||
      message.hiddenFor?.includes(me._id) ||
      message.unsentAt
    ) {
      throw new Error("This message cannot be reacted to.");
    }

    const reactions = message.reactions ?? [];
    const hasSameEmoji = reactions.some(
      (reaction) => reaction.userId === me._id && reaction.emoji === cleanEmoji,
    );
    const updated = hasSameEmoji
      ? reactions.filter(
          (reaction) => !(reaction.userId === me._id && reaction.emoji === cleanEmoji),
        )
      : [...reactions, { userId: me._id, emoji: cleanEmoji }];
    await ctx.db.patch(messageId, { reactions: updated });
  },
});

/** Hide a message only for the current participant. */
export const deleteForMe = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const me = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (
      !message ||
      (message.senderId !== me._id && message.receiverId !== me._id)
    ) {
      throw new Error("Message not found.");
    }
    if (!message.hiddenFor?.includes(me._id)) {
      await ctx.db.patch(messageId, {
        hiddenFor: [...(message.hiddenFor ?? []), me._id],
      });
    }
  },
});

/** Retract an owned message only within one hour of sending. */
export const unsend = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const me = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message || message.senderId !== me._id)
      throw new Error("You can only unsend your own messages.");
    if (message.unsentAt) throw new Error("This message was already unsent.");
    if (Date.now() - message._creationTime >= UNSEND_WINDOW_MS)
      throw new Error("Messages can only be unsent within one hour.");

    const now = Date.now();
    const showWarning =
      me.unsendWarningShownAt === undefined ||
      now - me.unsendWarningShownAt >= 3 * 60 * 60 * 1000;
    if (showWarning) {
      await ctx.db.patch(me._id, { unsendWarningShownAt: now });
    }
    await ctx.db.patch(messageId, {
      body: "",
      attachmentId: undefined,
      attachmentName: undefined,
      attachmentType: undefined,
      attachmentUrl: undefined,
      stickerKey: undefined,
      reactions: [],
      unsentAt: now,
    });
    return showWarning;
  },
});

/** Edit the text of a message owned by the current user. */
export const edit = mutation({
  args: { messageId: v.id("messages"), body: v.string() },
  handler: async (ctx, { messageId, body }) => {
    const me = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message || message.senderId !== me._id)
      throw new Error("You can only edit your own messages.");
    if (message.unsentAt || message.hiddenFor?.includes(me._id))
      throw new Error("This message is no longer available to edit.");
    const text = body.trim();
    if (!text && !message.attachmentId && !message.attachmentUrl && !message.stickerKey)
      throw new Error("Message cannot be empty.");
    if (text.length > 4000) throw new Error("Messages can be up to 4,000 characters.");
    await ctx.db.patch(messageId, { body: text, editedAt: Date.now() });
    if (
      text.includes("(__JATEXT_CALL_DM_ENDED__)") ||
      (text.startsWith("__JATEXT_CALL__:") &&
        (text.includes('"state":"missed"') ||
          text.includes('"state":"ended"') ||
          text.includes('"state":"declined"')))
    ) {
      await scheduleCallCancelPush(ctx, me._id, message.receiverId);
    }
  },
});

/** Save per-user conversation actions without changing the other participant's chat. */
export const updateConversation = mutation({
  args: {
    friendId: v.id("users"),
    archived: v.optional(v.boolean()),
    muted: v.optional(v.boolean()),
    deleteHistory: v.optional(v.boolean()),
  },
  handler: async (ctx, { friendId, archived, muted, deleteHistory }) => {
    const me = await requireUser(ctx);
    if (!(await areFriends(ctx, me._id, friendId)))
      throw new Error("This conversation is unavailable.");

    const existing = await ctx.db
      .query("conversationSettings")
      .withIndex("by_user_friend", (q) =>
        q.eq("userId", me._id).eq("friendId", friendId),
      )
      .unique();
    const settings = {
      isArchived: archived ?? existing?.isArchived ?? false,
      isMuted: muted ?? existing?.isMuted ?? false,
      ...(deleteHistory
        ? { deletedAt: Date.now() }
        : existing?.deletedAt !== undefined
          ? { deletedAt: existing.deletedAt }
          : {}),
    };

    if (existing) await ctx.db.patch(existing._id, settings);
    else await ctx.db.insert("conversationSettings", { userId: me._id, friendId, ...settings });
  },
});

export const markRead = mutation({
  args: { otherId: v.id("users") },
  handler: async (ctx, { otherId }) => {
    const me = await requireUser(ctx);
    if (
      !(await areFriends(ctx, me._id, otherId)) ||
      (await hasBlocked(ctx, me._id, otherId))
    ) {
      return;
    }

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_pair", (q) =>
        q.eq("pairKey", pairKey(me._id, otherId)),
      )
      .order("desc")
      .take(300);
    await Promise.all(
      rows
        .filter(
          (message) =>
            message.senderId === otherId &&
            message.receiverId === me._id &&
            message.deliveryStatus !== "read" &&
            !message.hiddenFor?.includes(me._id) &&
            !message.unsentAt,
        )
        .map((message) =>
          ctx.db.patch(message._id, { deliveryStatus: "read" }),
        ),
    );
  },
});

/** The conversation with one friend, oldest → newest (last 300 messages). */
export const list = query({
  args: { otherId: v.id("users") },
  handler: async (ctx, { otherId }) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_pair", (q) => q.eq("pairKey", pairKey(me._id, otherId)))
      .order("desc")
      .take(300);
    const settings = await ctx.db
      .query("conversationSettings")
      .withIndex("by_user_friend", (q) =>
        q.eq("userId", me._id).eq("friendId", otherId),
      )
      .unique();
    const hasBlockedOther = await hasBlocked(ctx, me._id, otherId);
    rows.reverse();
    return Promise.all(
      rows
        .filter(
          (message) =>
            !message.hiddenFor?.includes(me._id) &&
            !(hasBlockedOther && message.senderId === otherId) &&
            (settings?.deletedAt === undefined ||
              message._creationTime > settings.deletedAt),
        )
        .map((message) => withMessageDetails(ctx, message, me._id)),
    );
  },
});

/** Last message per friend, for the sidebar chat list. */
export const previews = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const ids = await friendIds(ctx, me._id);
    const out = await Promise.all(
      ids.map(async (friendId) => {
        const [recent, settings] = await Promise.all([
          ctx.db
            .query("messages")
            .withIndex("by_pair", (q) =>
              q.eq("pairKey", pairKey(me._id, friendId)),
            )
            .order("desc")
            .take(300),
          ctx.db
            .query("conversationSettings")
            .withIndex("by_user_friend", (q) =>
              q.eq("userId", me._id).eq("friendId", friendId),
            )
            .unique(),
        ]);
        const hasBlockedFriend = await hasBlocked(ctx, me._id, friendId);
        const last = recent.find(
          (message) =>
            !message.hiddenFor?.includes(me._id) &&
            !message.body.startsWith("__JATEXT_CALL_SIG__:") &&
            !(hasBlockedFriend && message.senderId === friendId) &&
            (settings?.deletedAt === undefined ||
              message._creationTime > settings.deletedAt),
        );
        return {
          friendId: friendId as string,
          body: last
            ? last.unsentAt
              ? "This message was unsent"
              : last.body || "📎 Attachment"
            : "",
          createdAt: last?._creationTime ?? 0,
          senderId: (last?.senderId ?? me._id) as string,
          isArchived: settings?.isArchived ?? false,
          isMuted: settings?.isMuted ?? false,
        };
      }),
    );
    return out;
  },
});
