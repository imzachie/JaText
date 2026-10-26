import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query, mutation } from "./_generated/server";
import type { Ctx } from "./lib";
import { areFriends, isJaTextOwner, pairKey, profileOf, requireUser, scheduleMessagePush } from "./lib";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
const UNSEND_WINDOW_MS = 60 * 60 * 1000;

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
    const filtered = messages.filter((m) => !m.hiddenFor?.includes(me._id));
    return Promise.all(
      filtered.reverse().map(async (message) => {
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
        const reply = message.replyToId ? await ctx.db.get(message.replyToId) : null;
        const replySender = reply ? await ctx.db.get(reply.senderId) : null;
        const forwardedSender = message.forwardedFromId ? await ctx.db.get(message.forwardedFromId) : null;
        const mediaKey =
          message.stickerKey ??
          (message.attachmentId
            ? `upload:${message.attachmentId}`
            : message.attachmentUrl
              ? `klipy:${message.attachmentUrl}`
              : message.stickerStorageId
                ? `upload:${message.stickerStorageId}`
                : undefined);
        const favorite = mediaKey
          ? await ctx.db
              .query("stickerLibrary")
              .withIndex("by_user_media", (q) => q.eq("userId", me._id).eq("mediaKey", mediaKey))
              .unique()
          : null;
        return {
          id: message._id as string,
          senderId: message.senderId as string,
          senderName: sender?.displayName ?? sender?.name ?? "JaText",
          senderUsername: sender?.username ?? "",
          senderAvatarUrl: senderProfile?.avatarUrl,
          senderAvatarColor: senderProfile?.avatarColor ?? "black",
          body: message.unsentAt ? "" : message.body,
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
          unsentAt: message.unsentAt,
          forwardedFromName: forwardedSender?.displayName ?? forwardedSender?.name ?? message.forwardedFromName,
          attachmentUrl: message.unsentAt
            ? undefined
            : message.attachmentUrl ?? (message.attachmentId ? ((await ctx.storage.getUrl(message.attachmentId)) ?? undefined) : undefined),
          attachmentName: message.unsentAt ? undefined : message.attachmentName,
          attachmentType: message.unsentAt ? undefined : message.attachmentType,
          stickerUrl: message.unsentAt
            ? undefined
            : message.stickerStorageId
              ? ((await ctx.storage.getUrl(message.stickerStorageId)) ?? undefined)
              : message.stickerUrl,
          stickerName: message.unsentAt ? undefined : message.stickerName,
          stickerKey: message.stickerKey ?? (favorite ? mediaKey : undefined),
          isStickerFavorite: favorite?.isFavorite ?? false,
          reactions: message.reactions?.map((r) => ({ userId: r.userId as string, emoji: r.emoji })),
          replyTo: reply && replySender
            ? {
                id: reply._id as string,
                senderId: reply.senderId as string,
                senderName: replySender.displayName ?? replySender.name ?? "",
                body: reply.hiddenFor?.includes(me._id)
                  ? "Message unavailable"
                  : reply.unsentAt
                    ? "This message was unsent"
                    : reply.body || reply.stickerName || reply.attachmentName || "Sticker",
              }
            : undefined,
          canModerate: role.canModerate,
          isOwner: role.isOwner,
        };
      }),
    );
  },
});

export const voters = query({
  args: { pollId: v.id("communityMessages") },
  handler: async (ctx, { pollId }) => {
    await requireUser(ctx);
    const poll = await ctx.db.get(pollId);
    if (!poll || poll.type !== "poll") throw new Error("Poll not found.");
    const votes = await ctx.db
      .query("communityPollVotes")
      .withIndex("by_poll", (q) => q.eq("pollId", pollId))
      .collect();
    const voters = await Promise.all(
      votes.map(async (vote) => {
        const user = await ctx.db.get(vote.userId);
        if (!user) return null;
        const profile = await profileOf(ctx, user);
        return {
          userId: vote.userId as string,
          optionIndex: vote.optionIndex,
          username: profile.username,
          displayName: profile.displayName,
          avatarColor: profile.avatarColor,
          avatarUrl: profile.avatarUrl,
        };
      }),
    );
    return voters.filter((voter) => voter !== null);
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
  args: {
    body: v.string(),
    replyToId: v.optional(v.id("communityMessages")),
    forwardedFromId: v.optional(v.id("communityMessages")),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
    attachmentType: v.optional(v.string()),
  },
  handler: async (ctx, { body, replyToId, forwardedFromId, attachmentId, attachmentName, attachmentType }) => {
    const me = await requireUser(ctx);
    const { canModerate } = await communityRole(ctx, me._id);
    if (!canModerate) throw new Error("Only JaText community moderators can post.");
    const text = body.trim();
    if (!text && !attachmentId) throw new Error("Community messages cannot be empty.");
    if (replyToId) {
      const parent = await ctx.db.get(replyToId);
      if (!parent || parent.hiddenFor?.includes(me._id) || parent.unsentAt) throw new Error("The announcement you are replying to is unavailable.");
    }
    const forwardedMessage = forwardedFromId ? await ctx.db.get(forwardedFromId) : null;
    if (forwardedFromId && (!forwardedMessage || forwardedMessage.hiddenFor?.includes(me._id) || forwardedMessage.unsentAt))
      throw new Error("The forwarded announcement is unavailable.");
    const forwardedSender = forwardedMessage ? await ctx.db.get(forwardedMessage.senderId) : null;
    await ctx.db.insert("communityMessages", {
      senderId: me._id,
      body: text.slice(0, 4000),
      type: "text",
      replyToId,
      forwardedFromName: forwardedSender?.displayName ?? forwardedSender?.name,
      forwardedFromId: forwardedSender?._id as Id<"users"> | undefined,
      attachmentId,
      attachmentName,
      attachmentType,
    });
  },
});

export const sendSticker = mutation({
  args: {
    stickerUrl: v.optional(v.string()),
    stickerStorageId: v.optional(v.id("_storage")),
    stickerName: v.string(),
    replyToId: v.optional(v.id("communityMessages")),
    stickerKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const { canModerate } = await communityRole(ctx, me._id);
    if (!canModerate) throw new Error("Only JaText community moderators can post.");
    if (!args.stickerUrl && !args.stickerStorageId) throw new Error("Sticker is unavailable.");
    if (args.replyToId && !(await ctx.db.get(args.replyToId)))
      throw new Error("The announcement you are replying to is unavailable.");
    await ctx.db.insert("communityMessages", {
      senderId: me._id,
      body: "",
      type: "sticker",
      stickerUrl: args.stickerUrl,
      stickerStorageId: args.stickerStorageId,
      stickerName: args.stickerName.slice(0, 120),
      stickerKey: args.stickerKey,
      replyToId: args.replyToId,
    });
  },
});

export const forward = mutation({
  args: {
    messageId: v.id("communityMessages"),
    targetGroupId: v.optional(v.id("groups")),
    targetUserId: v.optional(v.id("users")),
    targetCommunity: v.optional(v.boolean()),
  },
  handler: async (ctx, { messageId, targetGroupId, targetUserId, targetCommunity }) => {
    const me = await requireUser(ctx);
    const source = await ctx.db.get(messageId);
    if (!source || source.hiddenFor?.includes(me._id) || source.unsentAt) throw new Error("This message can no longer be forwarded.");
    const sender = await ctx.db.get(source.senderId);
    if (targetGroupId) {
      const membership = await ctx.db.query("groupMembers").withIndex("by_group_user", (q) => q.eq("groupId", targetGroupId).eq("userId", me._id)).unique();
      if (!membership) throw new Error("You are not a member of that group.");
      if (membership.muted) throw new Error("You are muted in that group.");
      await ctx.db.insert("groupMessages", {
        groupId: targetGroupId,
        senderId: me._id,
        body: source.body,
        attachmentId: source.attachmentId,
        attachmentName: source.attachmentName,
        attachmentType: source.attachmentType,
        attachmentUrl: source.attachmentUrl,
        stickerUrl: source.stickerUrl,
        stickerStorageId: source.stickerStorageId,
        stickerName: source.stickerName,
        stickerKey: source.stickerKey,
        forwardedFromId: source.senderId,
        forwardedFromName: sender?.displayName ?? sender?.name,
      });
    } else if (targetUserId) {
      if (!(await areFriends(ctx, me._id, targetUserId))) throw new Error("You can only forward messages to accepted friends.");
      const pair = pairKey(me._id, targetUserId);
      await ctx.db.insert("messages", {
        senderId: me._id,
        receiverId: targetUserId,
        pairKey: pair,
        body: source.body,
        attachmentId: source.attachmentId,
        attachmentName: source.attachmentName,
        attachmentType: source.attachmentType,
        attachmentUrl: source.attachmentUrl ?? source.stickerUrl,
        stickerKey: source.stickerKey,
        forwardedFromId: source.senderId,
        deliveryStatus: "delivered",
      });
      const meDoc = await ctx.db.get(me._id);
      if (meDoc) await scheduleMessagePush(ctx, meDoc, targetUserId, source.body || "Forwarded you a message");
    } else if (targetCommunity) {
      const { canModerate } = await communityRole(ctx, me._id);
      if (!canModerate) throw new Error("Only JaText community moderators can post.");
      await ctx.db.insert("communityMessages", {
        senderId: me._id,
        body: source.body,
        type: source.type === "poll" ? "text" : source.type,
        pollOptions: source.pollOptions,
        stickerUrl: source.stickerUrl,
        stickerStorageId: source.stickerStorageId,
        stickerName: source.stickerName,
        stickerKey: source.stickerKey,
        attachmentId: source.attachmentId,
        attachmentName: source.attachmentName,
        attachmentType: source.attachmentType,
        attachmentUrl: source.attachmentUrl,
        forwardedFromName: sender?.displayName ?? sender?.name,
        forwardedFromId: source.senderId,
      });
    } else {
      throw new Error("Choose where to forward this message.");
    }
  },
});

export const toggleReaction = mutation({
  args: { messageId: v.id("communityMessages"), emoji: v.string() },
  handler: async (ctx, { messageId, emoji }) => {
    await requireUser(ctx);
    if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) throw new Error("That reaction is not available.");
    const message = await ctx.db.get(messageId);
    if (!message || message.hiddenFor?.includes((await requireUser(ctx))._id) || message.unsentAt) throw new Error("This message cannot be reacted to.");
    const me = await requireUser(ctx);
    const reactions = message.reactions ?? [];
    const existing = reactions.find((reaction) => reaction.userId === me._id);
    const updated =
      existing?.emoji === emoji
        ? reactions.filter((reaction) => reaction.userId !== me._id)
        : [...reactions.filter((reaction) => reaction.userId !== me._id), { userId: me._id, emoji }];
    await ctx.db.patch(messageId, { reactions: updated });
  },
});

export const deleteForMe = mutation({
  args: { messageId: v.id("communityMessages") },
  handler: async (ctx, { messageId }) => {
    const me = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("Message not found.");
    if (!message.hiddenFor?.includes(me._id)) {
      await ctx.db.patch(messageId, { hiddenFor: [...(message.hiddenFor ?? []), me._id] });
    }
  },
});

export const unsend = mutation({
  args: { messageId: v.id("communityMessages") },
  handler: async (ctx, { messageId }) => {
    const me = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message || message.senderId !== me._id) throw new Error("You can only unsend your own messages.");
    if (message.unsentAt) throw new Error("This message was already unsent.");
    if (Date.now() - message._creationTime >= UNSEND_WINDOW_MS) throw new Error("Messages can only be unsent within one hour.");
    const now = Date.now();
    const showWarning = me.unsendWarningShownAt === undefined || now - me.unsendWarningShownAt >= 3 * 60 * 60 * 1000;
    if (showWarning) await ctx.db.patch(me._id, { unsendWarningShownAt: now });
    await ctx.db.patch(messageId, {
      body: "",
      attachmentId: undefined,
      attachmentName: undefined,
      attachmentType: undefined,
      attachmentUrl: undefined,
      stickerUrl: undefined,
      stickerStorageId: undefined,
      stickerName: undefined,
      stickerKey: undefined,
      reactions: [],
      unsentAt: now,
    });
    return showWarning;
  },
});

export const setTyping = mutation({
  args: { isTyping: v.boolean() },
  handler: async (ctx, { isTyping }) => {
    const me = await requireUser(ctx);
    const { canModerate } = await communityRole(ctx, me._id);
    if (!canModerate) return;
    const existing = await ctx.db
      .query("chatTyping")
      .withIndex("by_channel_user", (q) => q.eq("channelId", "community").eq("userId", me._id))
      .unique();
    if (!isTyping) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    if (existing) await ctx.db.patch(existing._id, { typingAt: Date.now() });
    else await ctx.db.insert("chatTyping", {
      channelId: "community",
      userId: me._id,
      typingAt: Date.now(),
    });
  },
});

export const typingUsers = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const entries = await ctx.db
      .query("chatTyping")
      .withIndex("by_channel", (q) => q.eq("channelId", "community"))
      .collect();
    const now = Date.now();
    const users = await Promise.all(
      entries
        .filter((entry) => entry.userId !== me._id && now - entry.typingAt < 5_000)
        .map(async (entry) => {
          const user = await ctx.db.get(entry.userId);
          return user ? {
            id: user._id as string,
            displayName: user.displayName ?? user.name ?? "",
            username: user.username ?? "",
          } : null;
        }),
    );
    return users.filter((user) => user !== null);
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
    if (!message || (message.type !== "text" && message.type !== "poll")) throw new Error("Announcement not found.");
    if (message.unsentAt || message.hiddenFor?.includes(me._id)) throw new Error("This message is no longer available to edit.");
    if (!role.isOwner && message.senderId !== me._id)
      throw new Error("You can only edit your own announcements.");
    const text = body.trim();
    if (!text) throw new Error("Announcements cannot be empty.");
    if (text.length > 4000) throw new Error("Messages can be up to 4,000 characters.");
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
