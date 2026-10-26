import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query, mutation } from "./_generated/server";
import type { Ctx } from "./lib";
import { isJaTextOwner, profileOf, requireUser } from "./lib";

async function communityRole(ctx: Ctx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) return { isOwner: false, canModerate: false, moderatorIds: [] as string[] };
  const isOwner = isJaTextOwner(user);
  const moderators = await ctx.db.query("communityModerators").collect();
  const moderator = await ctx.db
    .query("communityModerators")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();
  return {
    isOwner,
    canModerate: isOwner || !!moderator,
    moderatorIds: moderators.map((entry) => entry.userId as string),
  };
}

export const permissions = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    return communityRole(ctx, me._id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const messages = await ctx.db.query("communityMessages").order("desc").take(200);
    const role = await communityRole(ctx, me._id);
    return Promise.all(
      messages.reverse().map(async (message) => {
        const sender = await ctx.db.get(message.senderId);
        const senderProfile = sender ? await profileOf(ctx, sender) : null;
        const votes =
          message.type === "poll"
            ? await ctx.db
                .query("communityPollVotes")
                .withIndex("by_poll", (q) => q.eq("pollId", message._id))
                .collect()
            : [];
        const myVote = votes.find((vote) => vote.userId === me._id);
        return {
          id: message._id as string,
          senderId: message.senderId as string,
          senderName: sender?.displayName ?? sender?.name ?? "JaText",
          senderUsername: sender?.username ?? "",
          senderAvatarUrl: senderProfile?.avatarUrl,
          senderAvatarColor: senderProfile?.avatarColor ?? "black",
          body: message.body,
          type: message.type,
          pollOptions: message.pollOptions ?? [],
          pollEndedAt: message.pollEndedAt,
          votes: votes.map((vote) => ({
            userId: vote.userId as string,
            optionIndex: vote.optionIndex,
          })),
          myVote: myVote?.optionIndex,
          createdAt: message._creationTime,
          editedAt: message.editedAt,
          canModerate: role.canModerate,
          isOwner: role.isOwner,
        };
      }),
    );
  },
});

export const setModerators = mutation({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    const me = await requireUser(ctx);
    if (!isJaTextOwner(me)) throw new Error("Only the JaText owner can elect community moderators.");
    const selected = new Set(userIds);
    selected.delete(me._id);
    const existing = await ctx.db.query("communityModerators").collect();
    await Promise.all(
      existing
        .filter((moderator) => !selected.has(moderator.userId))
        .map((moderator) => ctx.db.delete(moderator._id)),
    );
    const existingIds = new Set(existing.map((moderator) => moderator.userId));
    await Promise.all(
      [...selected]
        .filter((userId) => !existingIds.has(userId))
        .map(async (userId) => {
          const user = await ctx.db.get(userId);
          if (!user?.username) throw new Error("Moderators must have completed their JaText profile.");
          await ctx.db.insert("communityModerators", { userId, electedBy: me._id });
        }),
    );
  },
});

export const sendText = mutation({
  args: { body: v.string() },
  handler: async (ctx, { body }) => {
    const me = await requireUser(ctx);
    const { canModerate } = await communityRole(ctx, me._id);
    if (!canModerate) throw new Error("Only JaText community moderators can post.");
    const text = body.trim();
    if (!text) throw new Error("Community messages cannot be empty.");
    await ctx.db.insert("communityMessages", {
      senderId: me._id,
      body: text.slice(0, 4000),
      type: "text",
    });
  },
});

export const createPoll = mutation({
  args: { question: v.string(), options: v.array(v.string()) },
  handler: async (ctx, { question, options }) => {
    const me = await requireUser(ctx);
    const { canModerate } = await communityRole(ctx, me._id);
    if (!canModerate) throw new Error("Only JaText community moderators can create polls.");
    const cleanQuestion = question.trim();
    const cleanOptions = options.map((option) => option.trim());
    if (!cleanQuestion) throw new Error("Poll question is required.");
    if (cleanOptions.length < 1 || cleanOptions.length > 6 || cleanOptions.some((option) => !option)) {
      throw new Error("Polls need between 1 and 6 non-empty options.");
    }
    await ctx.db.insert("communityMessages", {
      senderId: me._id,
      body: cleanQuestion.slice(0, 300),
      type: "poll",
      pollOptions: cleanOptions.map((option) => option.slice(0, 120)),
    });
  },
});

export const editMessage = mutation({
  args: { messageId: v.id("communityMessages"), body: v.string() },
  handler: async (ctx, { messageId, body }) => {
    const me = await requireUser(ctx);
    const role = await communityRole(ctx, me._id);
    if (!role.canModerate) throw new Error("Only JaText community moderators can edit announcements.");
    const message = await ctx.db.get(messageId);
    if (!message || message.type !== "text") throw new Error("Announcement not found.");
    if (!role.isOwner && message.senderId !== me._id)
      throw new Error("You can only edit your own announcements.");
    const text = body.trim();
    if (!text) throw new Error("Announcements cannot be empty.");
    await ctx.db.patch(messageId, { body: text.slice(0, 4000), editedAt: Date.now() });
  },
});

export const deleteMessage = mutation({
  args: { messageId: v.id("communityMessages") },
  handler: async (ctx, { messageId }) => {
    const me = await requireUser(ctx);
    const role = await communityRole(ctx, me._id);
    if (!role.canModerate) throw new Error("Only JaText community moderators can delete announcements.");
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("Announcement not found.");
    if (!role.isOwner && message.senderId !== me._id)
      throw new Error("You can only delete your own announcements.");
    const votes = await ctx.db
      .query("communityPollVotes")
      .withIndex("by_poll", (q) => q.eq("pollId", messageId))
      .collect();
    await Promise.all([
      ...votes.map((vote) => ctx.db.delete(vote._id)),
      ctx.db.delete(messageId),
    ]);
  },
});

export const vote = mutation({
  args: { pollId: v.id("communityMessages"), optionIndex: v.number() },
  handler: async (ctx, { pollId, optionIndex }) => {
    const me = await requireUser(ctx);
    const poll = await ctx.db.get(pollId);
    if (!poll || poll.type !== "poll" || !poll.pollOptions) throw new Error("Poll not found.");
    if (poll.pollEndedAt) throw new Error("This poll has ended.");
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.pollOptions.length) {
      throw new Error("Choose a valid poll option.");
    }
    const existing = await ctx.db
      .query("communityPollVotes")
      .withIndex("by_poll_user", (q) => q.eq("pollId", pollId).eq("userId", me._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { optionIndex });
    } else {
      await ctx.db.insert("communityPollVotes", { pollId, userId: me._id, optionIndex });
    }
  },
});

export const endPoll = mutation({
  args: { pollId: v.id("communityMessages") },
  handler: async (ctx, { pollId }) => {
    const me = await requireUser(ctx);
    if (!isJaTextOwner(me)) throw new Error("Only the JaText owner can end community polls.");
    const poll = await ctx.db.get(pollId);
    if (!poll || poll.type !== "poll") throw new Error("Poll not found.");
    if (!poll.pollEndedAt) await ctx.db.patch(pollId, { pollEndedAt: Date.now() });
  },
});
