import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { friendIds, hasBlocked, profileOf, requireUser } from "./lib";

/** Send a friend request by username. They must accept before you can chat. */
export const sendRequest = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const me = await requireUser(ctx);
    username = username.trim().toLowerCase().replace(/^@/, "");

    const target = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!target) throw new Error(`No JaText user with username @${username}.`);
    if (target._id === me._id) throw new Error("You can't add yourself 😅");
    if (
      (await hasBlocked(ctx, me._id, target._id)) ||
      (await hasBlocked(ctx, target._id, me._id))
    ) {
      throw new Error("This friend request can't be sent.");
    }

    const forward = await ctx.db
      .query("friendRequests")
      .withIndex("by_from_to", (q) => q.eq("fromId", me._id).eq("toId", target._id))
      .collect();
    const backward = await ctx.db
      .query("friendRequests")
      .withIndex("by_from_to", (q) => q.eq("fromId", target._id).eq("toId", me._id))
      .collect();
    const all = [...forward, ...backward];

    if (all.some((r) => r.status === "accepted"))
      throw new Error(`You're already friends with @${username}.`);
    if (all.some((r) => r.status === "pending" && r.fromId === me._id))
      throw new Error(`Friend request to @${username} is already pending.`);
    if (all.some((r) => r.status === "pending" && r.fromId === target._id))
      throw new Error(`@${username} already sent YOU a request. Check your requests!`);

    await ctx.db.insert("friendRequests", {
      fromId: me._id,
      toId: target._id,
      status: "pending",
    });
  },
});

/** Accept or decline an incoming friend request. */
export const respond = mutation({
  args: { requestId: v.id("friendRequests"), accept: v.boolean() },
  handler: async (ctx, { requestId, accept }) => {
    const me = await requireUser(ctx);
    const request = await ctx.db.get(requestId);
    if (!request || request.toId !== me._id)
      throw new Error("Friend request not found.");
    await ctx.db.patch(requestId, {
      status: accept ? "accepted" : "declined",
    });
  },
});

/** Pending requests other people sent me. */
export const listIncoming = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("friendRequests")
      .withIndex("by_to_status", (q) =>
        q.eq("toId", me._id).eq("status", "pending"),
      )
      .collect();
    return Promise.all(
      rows.map(async (r) => {
        const from = await ctx.db.get(r.fromId);
        return {
          id: r._id as string,
          from: await profileOf(ctx, from!),
          to: await profileOf(ctx, me),
          status: r.status,
          createdAt: r._creationTime,
        };
      }),
    );
  },
});

/** Pending requests I sent. */
export const listOutgoing = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("friendRequests")
      .withIndex("by_from_status", (q) =>
        q.eq("fromId", me._id).eq("status", "pending"),
      )
      .collect();
    return Promise.all(
      rows.map(async (r) => {
        const to = await ctx.db.get(r.toId);
        return {
          id: r._id as string,
          from: await profileOf(ctx, me),
          to: await profileOf(ctx, to!),
          status: r.status,
          createdAt: r._creationTime,
        };
      }),
    );
  },
});

/** Everyone I'm friends with (accepted) — these are the people I can chat with. */
export const listFriends = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const ids = await friendIds(ctx, me._id);
    const profiles = await Promise.all(
      ids.map(async (id) => {
        const user = await ctx.db.get(id);
        return user ? profileOf(ctx, user) : null;
      }),
    );
    return profiles.filter((p) => p !== null);
  },
});

/** Online/activity state for accepted friends, with typing scoped to me. */
export const activity = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const ids = await friendIds(ctx, me._id);
    const now = Date.now();

    return Promise.all(
      ids.map(async (userId) => {
        const [user, presence, blockedByMe, blockedMe] = await Promise.all([
          ctx.db.get(userId),
          ctx.db
            .query("presence")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .unique(),
          hasBlocked(ctx, me._id, userId),
          hasBlocked(ctx, userId, me._id),
        ]);
        if (!user) return null;

        const connected = !!presence && now - presence.lastSeenAt <= 90_000;
        const preference = user.statusPreference ?? "online";
        const status =
          preference === "offline" || !connected
            ? "offline"
            : preference === "dnd"
              ? "dnd"
              : now - presence.lastActiveAt >= 5 * 60_000
                ? "away"
                : "online";

        return {
          userId: userId as string,
          status,
          customStatus: user.customStatus ?? "",
          isTyping:
            !blockedByMe &&
            !blockedMe &&
            presence?.typingToId === me._id &&
            !!presence.typingAt &&
            now - presence.typingAt <= 5_000,
        };
      }),
    ).then((rows) => rows.filter((row) => row !== null));
  },
});

/** Unfriend an accepted friend so neither side stays in the other's friends list. */
export const remove = mutation({
  args: { friendId: v.id("users") },
  handler: async (ctx, { friendId }) => {
    const me = await requireUser(ctx);
    const forward = await ctx.db
      .query("friendRequests")
      .withIndex("by_from_to", (q) => q.eq("fromId", me._id).eq("toId", friendId))
      .collect();
    const backward = await ctx.db
      .query("friendRequests")
      .withIndex("by_from_to", (q) => q.eq("fromId", friendId).eq("toId", me._id))
      .collect();
    for (const row of [...forward, ...backward]) {
      await ctx.db.delete(row._id);
    }
  },
});
