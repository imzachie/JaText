import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { areFriends, profileOf, requireUser, type Ctx } from "./lib";

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
        return {
          id: group._id as string,
          name: group.name,
          avatarUrl: group.avatarId
            ? ((await ctx.storage.getUrl(group.avatarId)) ?? undefined)
            : undefined,
          ownerId: group.ownerId as string,
          role: membership.role,
          memberCount: members.length,
          lastMessage: lastMessage?.body ?? "",
          lastMessageAt: lastMessage?._creationTime ?? group._creationTime,
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
    return Promise.all(
      messages.map(async (message) => {
        const sender = await ctx.db.get(message.senderId);
        return {
          id: message._id as string,
          senderId: message.senderId as string,
          senderName: sender?.displayName ?? sender?.name ?? "",
          senderUsername: sender?.username ?? "",
          body: message.body,
          createdAt: message._creationTime,
        };
      }),
    );
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
  args: { groupId: v.id("groups"), body: v.string() },
  handler: async (ctx, { groupId, body }) => {
    const me = await requireUser(ctx);
    const membership = await requireMembership(ctx, groupId, me._id);
    if (membership.muted) throw new Error("You are muted in this group.");
    const text = body.trim();
    if (!text) throw new Error("Message is empty.");
    await ctx.db.insert("groupMessages", {
      groupId,
      senderId: me._id,
      body: text.slice(0, 4000),
    });
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
