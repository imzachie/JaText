import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { requireUser } from "./lib";

export const registerDevice = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("pushDevices")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { userId: user._id, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("pushDevices", {
        userId: user._id,
        token,
        updatedAt: Date.now(),
      });
    }
  },
});

export const unregisterDevice = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await requireUser(ctx);
    const device = await ctx.db
      .query("pushDevices")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (device?.userId === user._id) await ctx.db.delete(device._id);
  },
});

export const listUserDevices = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    (await ctx.db
      .query("pushDevices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(100))
      .map(({ _id, token }) => ({ id: _id, token })),
});

export const deleteInvalidDevice = internalMutation({
  args: { deviceId: v.id("pushDevices") },
  handler: async (ctx, { deviceId }) => {
    await ctx.db.delete(deviceId);
  },
});
