import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { areFriends, pairKey, profileOf, requireUser, scheduleGroupMentionPush, scheduleMessagePush, type Ctx } from "./lib";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
const UNSEND_WINDOW_MS = 60 * 60 * 1000;

async function requireMembership(
  ctx: Ctx,
  groupId: Id<"groups">,
  userId: Id<"users">,
) {
  const membership = await ctx.db
    .query("groupMembers")
    .withIndex("by_group_user", (q) => q.eq("groupId", groupId).eq("userId", userId))
    .unique();
  if (!membership) throw new Error("You are not a member of this group.");
  return membership;
}

async function requireGroupModerator(
  ctx: Ctx,
  groupId: Id<"groups">,
  userId: Id<"users">,
) {
  const membership = await requireMembership(ctx, groupId, userId);
  if (membership.role === "member") throw new Error("Only the group owner or a moderator can do that.");
  return membership;
}

async function withGroupMessageDetails(
  ctx: QueryCtx,
  m: Doc<"groupMessages">,
  currentUserId: Id<"users">,
) {
  const [sender, reply, forwarder] = await Promise.all([
    ctx.db.get(m.senderId),
    m.replyToId ? ctx.db.get(m.replyToId) : null,
    m.forwardedFromId ? ctx.db.get(m.forwardedFromId) : null,
  ]);
  const senderProfile = sender ? await profileOf(ctx, sender) : null;
  const replySender = reply ? await ctx.db.get(reply.senderId) : null;
  const mediaKey =
    m.stickerKey ??
    (m.attachmentId
      ? `upload:${m.attachmentId}`
      : m.attachmentUrl
        ? `klipy:${m.attachmentUrl}`
        : m.stickerStorageId
          ? `upload:${m.stickerStorageId}`
          : m.stickerUrl
            ? `klipy:${m.stickerUrl}`
            : undefined);
  const favorite = mediaKey
    ? await ctx.db
        .query("stickerLibrary")
        .withIndex("by_user_media", (q) => q.eq("userId", currentUserId).eq("mediaKey", mediaKey))
        .unique()
    : null;
  const attachmentUrl = m.unsentAt
    ? undefined
    : m.attachmentUrl ??
      (m.attachmentId ? ((await ctx.storage.getUrl(m.attachmentId)) ?? undefined) : undefined);
  const stickerUrl = m.unsentAt
    ? undefined
    : m.stickerStorageId
      ? ((await ctx.storage.getUrl(m.stickerStorageId)) ?? undefined)
      : m.stickerUrl;
  return {
    id: m._id as string,
    senderId: m.senderId as string,
    senderName: sender?.displayName ?? sender?.name ?? "",
    senderUsername: sender?.username ?? "",
    senderAvatarUrl: senderProfile?.avatarUrl,
    senderAvatarColor: sender?.avatarColor ?? "black",
    body: m.unsentAt ? "" : m.body,
    attachmentUrl,
    attachmentName: m.unsentAt ? undefined : m.attachmentName,
    attachmentType: m.unsentAt ? undefined : m.attachmentType,
    stickerUrl,
    stickerName: m.unsentAt ? undefined : m.stickerName,
    stickerKey: m.stickerKey ?? (favorite ? mediaKey : undefined),
    isStickerFavorite: favorite?.isFavorite ?? false,
    forwardedFromName: forwarder?.displayName ?? forwarder?.name ?? m.forwardedFromName,
    replyTo: reply && replySender
      ? {
          id: reply._id as string,
          senderId: reply.senderId as string,
          senderName: replySender.displayName ?? replySender.name ?? "",
          body: reply.hiddenFor?.includes(currentUserId)
            ? "Message unavailable"
            : reply.unsentAt
              ? "This message was unsent"
              : reply.body || reply.stickerName || reply.attachmentName || "Sticker",
        }
      : undefined,
    createdAt: m._creationTime,
    editedAt: m.editedAt,
    unsentAt: m.unsentAt,
    mentionsEveryone: m.mentionsEveryone ?? false,
    mentionedUserIds: m.mentionedUserIds?.map((id) => id as string) ?? [],
    reactions: m.reactions?.map((reaction) => ({
      userId: reaction.userId as string,
      emoji: reaction.emoji,
    })),
  };
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .collect();
    return Promise.all(
      memberships.map(async (membership) => {
        const group = await ctx.db.get(membership.groupId);
        if (!group) return null;
        const members = await ctx.db
          .query("groupMembers")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .collect();
        const lastMessage = await ctx.db
          .query("groupMessages")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .order("desc")
          .first();
        const lastSender = lastMessage ? await ctx.db.get(lastMessage.senderId) : null;
        const previewBody = lastMessage?.hiddenFor?.includes(me._id) || lastMessage?.unsentAt
          ? lastMessage?.unsentAt
            ? "This message was unsent"
            : ""
          : lastMessage?.body || (lastMessage?.attachmentUrl || lastMessage?.attachmentId || lastMessage?.stickerUrl ? "📎 Attachment" : "");
        const lastMentionedMe = Boolean(
          lastMessage &&
            !lastMessage.unsentAt &&
            !lastMessage.hiddenFor?.includes(me._id) &&
            lastMessage.senderId !== me._id &&
            (lastMessage.mentionsEveryone || lastMessage.mentionedUserIds?.includes(me._id)),
        );
        return {
          id: group._id as string,
          name: group.name,
          avatarUrl: group.avatarId
            ? ((await ctx.storage.getUrl(group.avatarId)) ?? undefined)
            : undefined,
          ownerId: group.ownerId as string,
          role: membership.role,
          memberCount: members.length,
          lastMessage: previewBody ?? "",
          lastMessageAt: lastMessage?._creationTime ?? group._creationTime,
          lastSenderId: lastMessage ? (lastMessage.senderId as string) : undefined,
          lastSenderName: lastSender?.displayName ?? lastSender?.name ?? undefined,
          lastMentionedMe,
        };
      }),
    ).then((groups) => groups.filter((group) => group !== null).sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt,
    ));
  },
});

export const get = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await requireUser(ctx);
    const membership = await requireMembership(ctx, groupId, me._id);
    const group = await ctx.db.get(groupId);
    if (!group) throw new Error("Group not found.");
    const members = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();
    const people = await Promise.all(
      members.map(async (member) => {
        const user = await ctx.db.get(member.userId);
        return user
          ? {
              ...(await profileOf(ctx, user)),
              role: member.role,
              muted: member.muted,
            }
          : null;
      }),
    );
    return {
      id: group._id as string,
      name: group.name,
      avatarUrl: group.avatarId
        ? ((await ctx.storage.getUrl(group.avatarId)) ?? undefined)
        : undefined,
      ownerId: group.ownerId as string,
      role: membership.role,
      members: people.filter((person) => person !== null),
    };
  },
});

export const listMessages = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await requireUser(ctx);
    await requireMembership(ctx, groupId, me._id);
    const messages = await ctx.db
      .query("groupMessages")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .order("asc")
      .collect();
    const visible = messages.filter((m) => !m.hiddenFor?.includes(me._id));
    return Promise.all(visible.map((message) => withGroupMessageDetails(ctx, message, me._id)));
  },
});

export const create = mutation({
  args: { name: v.string(), memberIds: v.array(v.id("users")) },
  handler: async (ctx, { name, memberIds }) => {
    const me = await requireUser(ctx);
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Give your group a name.");
    if (memberIds.length < 1 || memberIds.length > 99) {
      throw new Error("Choose between 1 and 99 friends to add.");
    }
    const uniqueMembers = [...new Set(memberIds)].filter((id) => id !== me._id);
    for (const userId of uniqueMembers) {
      if (!(await areFriends(ctx, me._id, userId))) {
        throw new Error("Group chats can only include your accepted friends.");
      }
    }
    const groupId = await ctx.db.insert("groups", {
      name: cleanName.slice(0, 60),
      ownerId: me._id,
    });
    await Promise.all(
      [me._id, ...uniqueMembers].map((userId) =>
        ctx.db.insert("groupMembers", {
          groupId,
          userId,
          role: userId === me._id ? "owner" : "member",
          muted: false,
        }),
      ),
    );
    return groupId;
  },
});

export const send = mutation({
  args: {
    groupId: v.id("groups"),
    body: v.string(),
    replyToId: v.optional(v.id("groupMessages")),
    forwardedFromId: v.optional(v.id("groupMessages")),
    stickerUrl: v.optional(v.string()),
    stickerStorageId: v.optional(v.id("_storage")),
    stickerName: v.optional(v.string()),
    stickerKey: v.optional(v.string()),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
    attachmentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const membership = await requireMembership(ctx, args.groupId, me._id);
    if (membership.muted) throw new Error("You are muted in this group.");
    const text = args.body.trim();
    if (!text && !args.stickerUrl && !args.stickerStorageId && !args.attachmentId && !args.forwardedFromId)
      throw new Error("Message is empty.");
    if (args.replyToId) {
      const replied = await ctx.db.get(args.replyToId);
      if (!replied || replied.groupId !== args.groupId)
        throw new Error("The message you are replying to is unavailable.");
      if (replied.hiddenFor?.includes(me._id) || replied.unsentAt)
        throw new Error("The message you are replying to is unavailable.");
    }
    let forwardedFromName: string | undefined;
    let forwardedFromId: Id<"users"> | undefined;
    const forwardedMessage = args.forwardedFromId ? await ctx.db.get(args.forwardedFromId) : null;
    if (args.forwardedFromId) {
      if (!forwardedMessage || forwardedMessage.groupId !== args.groupId)
        throw new Error("The forwarded message is unavailable.");
      if (forwardedMessage.hiddenFor?.includes(me._id) || forwardedMessage.unsentAt)
        throw new Error("This message can no longer be forwarded.");
      const forwardedSender = await ctx.db.get(forwardedMessage.senderId);
      forwardedFromName = forwardedSender?.displayName ?? forwardedSender?.name;
      forwardedFromId = forwardedMessage.senderId;
    }
    const finalBody = (text || forwardedMessage?.body || "").slice(0, 4000);
    const mentionsEveryone = /(?:^|[\s(])@everyone\b/i.test(finalBody);
    const rawHandles = new Set<string>();
    const mentionRegex = /(?:^|[\s(])@([a-z0-9._]{3,20})\b/gi;
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(finalBody)) !== null) {
      const handle = match[1].toLowerCase();
      if (handle !== "everyone") rawHandles.add(handle);
    }

    let mentionedUserIds: Id<"users">[] = [];
    if (mentionsEveryone || rawHandles.size > 0) {
      const groupMembers = await ctx.db
        .query("groupMembers")
        .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
        .collect();
      if (mentionsEveryone) {
        mentionedUserIds = groupMembers
          .map((member) => member.userId)
          .filter((userId) => userId !== me._id);
      } else {
        const memberDocs = await Promise.all(
          groupMembers
            .filter((member) => member.userId !== me._id)
            .map((member) => ctx.db.get(member.userId)),
        );
        mentionedUserIds = memberDocs
          .filter(
            (user): user is Doc<"users"> =>
              user !== null && !!user.username && rawHandles.has(user.username.toLowerCase()),
          )
          .map((user) => user._id);
      }
    }

    await ctx.db.insert("groupMessages", {
      groupId: args.groupId,
      senderId: me._id,
      body: finalBody,
      replyToId: args.replyToId,
      forwardedFromName,
      forwardedFromId,
      stickerUrl: args.stickerUrl ?? forwardedMessage?.stickerUrl,
      stickerStorageId: args.stickerStorageId ?? forwardedMessage?.stickerStorageId,
      stickerName: args.stickerName?.slice(0, 120) ?? forwardedMessage?.stickerName,
      stickerKey: args.stickerKey ?? forwardedMessage?.stickerKey,
      attachmentId: args.attachmentId ?? forwardedMessage?.attachmentId,
      attachmentName: args.attachmentName ?? forwardedMessage?.attachmentName,
      attachmentType: args.attachmentType ?? forwardedMessage?.attachmentType,
      ...(mentionsEveryone ? { mentionsEveryone: true } : {}),
      ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
    });

    if (mentionedUserIds.length > 0) {
      const group = await ctx.db.get(args.groupId);
      const groupName = group?.name ?? "Group chat";
      const pushBody = finalBody || "Mentioned you in an attachment";
      await Promise.all(
        mentionedUserIds.map((targetUserId) =>
          scheduleGroupMentionPush(
            ctx,
            me,
            args.groupId,
            groupName,
            targetUserId,
            pushBody,
            mentionsEveryone,
          ),
        ),
      );
    }
  },
});

export const addMembers = mutation({
  args: { groupId: v.id("groups"), memberIds: v.array(v.id("users")) },
  handler: async (ctx, { groupId, memberIds }) => {
    const me = await requireUser(ctx);
    await requireGroupModerator(ctx, groupId, me._id);
    const uniqueIds = [...new Set(memberIds)].filter((id) => id !== me._id);
    if (uniqueIds.length === 0) return;
    const existing = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();
    if (existing.length + uniqueIds.length > 100) {
      throw new Error("Groups can have up to 100 members.");
    }
    const existingSet = new Set(existing.map((member) => member.userId));
    for (const userId of uniqueIds) {
      if (existingSet.has(userId)) continue;
      if (!(await areFriends(ctx, me._id, userId))) {
        throw new Error("You can only add your accepted friends to a group.");
      }
      await ctx.db.insert("groupMembers", {
        groupId,
        userId,
        role: "member",
        muted: false,
      });
    }
  },
});

export const forward = mutation({
  args: {
    messageId: v.id("groupMessages"),
    targetGroupId: v.optional(v.id("groups")),
    targetUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { messageId, targetGroupId, targetUserId }) => {
    const me = await requireUser(ctx);
    const source = await ctx.db.get(messageId);
    if (!source || source.hiddenFor?.includes(me._id) || source.unsentAt)
      throw new Error("This message can no longer be forwarded.");
    // verify source membership
    await requireMembership(ctx, source.groupId, me._id);
    if (targetGroupId) {
      const membership = await requireMembership(ctx, targetGroupId, me._id);
      if (membership.muted) throw new Error("You are muted in that group.");
      // resolve forwarded sender
      const sender = await ctx.db.get(source.senderId);
      await ctx.db.insert("groupMessages", {
        groupId: targetGroupId,
        senderId: me._id,
        body: source.body,
        attachmentId: source.attachmentId,
        attachmentName: source.attachmentName,
        attachmentType: source.attachmentType,
        stickerUrl: source.stickerUrl,
        stickerStorageId: source.stickerStorageId,
        stickerName: source.stickerName,
        stickerKey: source.stickerKey,
        forwardedFromId: source.senderId,
        forwardedFromName: sender?.displayName ?? sender?.name,
      });
    } else if (targetUserId) {
      if (!(await areFriends(ctx, me._id, targetUserId)))
        throw new Error("You can only forward messages to accepted friends.");
      const pair = pairKey(me._id, targetUserId);
      await ctx.db.insert("messages", {
        senderId: me._id,
        receiverId: targetUserId,
        pairKey: pair,
        body: source.body,
        attachmentId: source.attachmentId ?? source.stickerStorageId,
        attachmentName: source.attachmentName ?? source.stickerName,
        attachmentType:
          source.attachmentType ??
          (source.stickerStorageId || source.stickerUrl ? "image/*" : undefined),
        attachmentUrl: source.attachmentUrl ?? source.stickerUrl,
        stickerKey: source.stickerKey,
        forwardedFromId: source.senderId,
        deliveryStatus: "delivered",
      });
      const meDoc = await ctx.db.get(me._id);
      if (meDoc && targetUserId) {
        await scheduleMessagePush(ctx, meDoc, targetUserId, source.body || "Forwarded you a message");
      }
    } else {
      throw new Error("Choose where to forward this message.");
    }
  },
});

export const toggleReaction = mutation({
  args: { messageId: v.id("groupMessages"), emoji: v.string() },
  handler: async (ctx, { messageId, emoji }) => {
    const me = await requireUser(ctx);
    if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) throw new Error("That reaction is not available.");
    const message = await ctx.db.get(messageId);
    if (!message || message.hiddenFor?.includes(me._id) || message.unsentAt)
      throw new Error("This message cannot be reacted to.");
    await requireMembership(ctx, message.groupId, me._id);
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
  args: { messageId: v.id("groupMessages") },
  handler: async (ctx, { messageId }) => {
    const me = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("Message not found.");
    await requireMembership(ctx, message.groupId, me._id);
    if (!message.hiddenFor?.includes(me._id)) {
      await ctx.db.patch(messageId, { hiddenFor: [...(message.hiddenFor ?? []), me._id] });
    }
  },
});

export const unsend = mutation({
  args: { messageId: v.id("groupMessages") },
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

export const edit = mutation({
  args: { messageId: v.id("groupMessages"), body: v.string() },
  handler: async (ctx, { messageId, body }) => {
    const me = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message || message.senderId !== me._id) throw new Error("You can only edit your own messages.");
    if (message.unsentAt || message.hiddenFor?.includes(me._id)) throw new Error("This message is no longer available to edit.");
    const text = body.trim();
    if (!text && !message.attachmentId && !message.stickerStorageId && !message.stickerUrl) throw new Error("Message cannot be empty.");
    if (text.length > 4000) throw new Error("Messages can be up to 4,000 characters.");
    await requireMembership(ctx, message.groupId, me._id);
    await ctx.db.patch(messageId, { body: text, editedAt: Date.now() });
  },
});

export const setTyping = mutation({
  args: { groupId: v.id("groups"), isTyping: v.boolean() },
  handler: async (ctx, { groupId, isTyping }) => {
    const me = await requireUser(ctx);
    await requireMembership(ctx, groupId, me._id);
    const existing = await ctx.db
      .query("chatTyping")
      .withIndex("by_channel_user", (q) => q.eq("channelId", `group:${groupId}`).eq("userId", me._id))
      .unique();
    if (!isTyping) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    if (existing) await ctx.db.patch(existing._id, { typingAt: Date.now() });
    else await ctx.db.insert("chatTyping", {
      channelId: `group:${groupId}`,
      userId: me._id,
      typingAt: Date.now(),
    });
  },
});

export const typingUsers = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await requireUser(ctx);
    await requireMembership(ctx, groupId, me._id);
    const entries = await ctx.db
      .query("chatTyping")
      .withIndex("by_channel", (q) => q.eq("channelId", `group:${groupId}`))
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

export const rename = mutation({
  args: { groupId: v.id("groups"), name: v.string() },
  handler: async (ctx, { groupId, name }) => {
    const me = await requireUser(ctx);
    await requireGroupModerator(ctx, groupId, me._id);
    const cleanName = name.trim();
    if (!cleanName) throw new Error("Group name cannot be empty.");
    await ctx.db.patch(groupId, { name: cleanName.slice(0, 60) });
  },
});

export const setAvatar = mutation({
  args: {
    groupId: v.id("groups"),
    avatarId: v.union(v.id("_storage"), v.null()),
  },
  handler: async (ctx, { groupId, avatarId }) => {
    const me = await requireUser(ctx);
    await requireGroupModerator(ctx, groupId, me._id);
    await ctx.db.patch(groupId, { avatarId: avatarId ?? undefined });
  },
});

export const setMemberRole = mutation({
  args: {
    groupId: v.id("groups"),
    userId: v.id("users"),
    role: v.union(v.literal("moderator"), v.literal("member")),
  },
  handler: async (ctx, { groupId, userId, role }) => {
    const me = await requireUser(ctx);
    const group = await ctx.db.get(groupId);
    if (!group || group.ownerId !== me._id) throw new Error("Only the group owner can appoint moderators.");
    const member = await requireMembership(ctx, groupId, userId);
    if (member.role === "owner") throw new Error("The group owner role cannot be changed.");
    await ctx.db.patch(member._id, { role });
  },
});

export const setMuted = mutation({
  args: { groupId: v.id("groups"), userId: v.id("users"), muted: v.boolean() },
  handler: async (ctx, { groupId, userId, muted }) => {
    const me = await requireUser(ctx);
    const actor = await requireGroupModerator(ctx, groupId, me._id);
    const target = await requireMembership(ctx, groupId, userId);
    if (target.role === "owner" || (target.role === "moderator" && actor.role !== "owner")) {
      throw new Error("You cannot mute this group member.");
    }
    await ctx.db.patch(target._id, { muted });
  },
});

export const removeMember = mutation({
  args: { groupId: v.id("groups"), userId: v.id("users") },
  handler: async (ctx, { groupId, userId }) => {
    const me = await requireUser(ctx);
    const actor = await requireGroupModerator(ctx, groupId, me._id);
    const target = await requireMembership(ctx, groupId, userId);
    if (target.role === "owner" || (target.role === "moderator" && actor.role !== "owner")) {
      throw new Error("You cannot remove this group member.");
    }
    await ctx.db.delete(target._id);
  },
});

export const leave = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await requireUser(ctx);
    const membership = await requireMembership(ctx, groupId, me._id);
    if (membership.role === "owner") throw new Error("Transfer ownership or delete the group before leaving.");
    await ctx.db.delete(membership._id);
  },
});

export const deleteGroup = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await requireUser(ctx);
    const group = await ctx.db.get(groupId);
    if (!group || group.ownerId !== me._id) throw new Error("Only the group owner can delete this group.");
    const [members, messages] = await Promise.all([
      ctx.db.query("groupMembers").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect(),
      ctx.db.query("groupMessages").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect(),
    ]);
    await Promise.all([
      ...members.map((member) => ctx.db.delete(member._id)),
      ...messages.map((message) => ctx.db.delete(message._id)),
      ctx.db.delete(groupId),
    ]);
  },
});
