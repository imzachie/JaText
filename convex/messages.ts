import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { areFriends, friendIds, pairKey, requireUser } from "./lib";

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

async function withAttachmentUrl(ctx: QueryCtx, m: Doc<"messages">) {
  return {
    id: m._id as string,
    senderId: m.senderId as string,
    receiverId: m.receiverId as string,
    body: m.body,
    attachmentUrl: m.attachmentId
      ? ((await ctx.storage.getUrl(m.attachmentId)) ?? undefined)
      : undefined,
    attachmentName: m.attachmentName,
    attachmentType: m.attachmentType,
    createdAt: m._creationTime,
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
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!(await areFriends(ctx, me._id, args.receiverId)))
      throw new Error("You can only message people who accepted your friend request.");
    if (!args.body.trim() && !args.attachmentId)
      throw new Error("Message is empty.");

    await ctx.db.insert("messages", {
      senderId: me._id,
      receiverId: args.receiverId,
      pairKey: pairKey(me._id, args.receiverId),
      body: args.body.trim(),
      attachmentId: args.attachmentId,
      attachmentName: args.attachmentName,
      attachmentType: args.attachmentType,
    });
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
    rows.reverse();
    return Promise.all(rows.map((m) => withAttachmentUrl(ctx, m)));
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
        const [last] = await ctx.db
          .query("messages")
          .withIndex("by_pair", (q) =>
            q.eq("pairKey", pairKey(me._id, friendId)),
          )
          .order("desc")
          .take(1);
        if (!last) return null;
        return {
          friendId: friendId as string,
          body: last.body || "📎 Attachment",
          createdAt: last._creationTime,
          senderId: last.senderId as string,
        };
      }),
    );
    return out.filter((p) => p !== null);
  },
});
