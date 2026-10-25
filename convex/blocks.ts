import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { areFriends, requireUser } from "./lib";

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("userBlocks")
      .withIndex("by_blocker_blocked", (q) => q.eq("blockerId", me._id))
      .collect();
    return rows.map((row) => row.blockedId as string);
  },
});

export const set = mutation({
  args: { userId: v.id("users"), blocked: v.boolean() },
  handler: async (ctx, { userId, blocked }) => {
    const me = await requireUser(ctx);
    if (userId === me._id) throw new Error("You can't block yourself.");
    if (!(await areFriends(ctx, me._id, userId)))
      throw new Error("You can only block someone in your friends list.");

    const existing = await ctx.db
      .query("userBlocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", me._id).eq("blockedId", userId),
      )
      .unique();
    if (blocked && !existing) {
      await ctx.db.insert("userBlocks", { blockerId: me._id, blockedId: userId });
    } else if (!blocked && existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
