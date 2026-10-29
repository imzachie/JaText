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

export const listAllAnnouncementDevices = internalQuery({
  args: { excludeUserId: v.id("users") },
  handler: async (ctx, { excludeUserId }) => {
    const allDevices = await ctx.db.query("pushDevices").take(2500);
    const seenTokens = new Set<string>();
    const dndCache = new Map<string, boolean>();
    const eligible: Array<{ id: typeof allDevices[number]["_id"]; token: string }> = [];

    for (const dev of allDevices) {
      if (dev.userId === excludeUserId) continue;
      if (seenTokens.has(dev.token)) continue;
      const uidKey = dev.userId as string;
      let isDnd = dndCache.get(uidKey);
      if (isDnd === undefined) {
        const u = await ctx.db.get(dev.userId);
        isDnd = !u || u.statusPreference === "dnd";
        dndCache.set(uidKey, isDnd);
      }
      if (isDnd) continue;
      seenTokens.add(dev.token);
      eligible.push({ id: dev._id, token: dev.token });
    }
    return eligible;
  },
});

export const updateMessagePushDeliveryStatus = internalMutation({
  args: {
    messageId: v.id("messages"),
    pushSucceeded: v.boolean(),
  },
  handler: async (ctx, { messageId, pushSucceeded }) => {
    const msg = await ctx.db.get(messageId);
    if (!msg || msg.deliveryStatus === "read") return;
    const nextStatus = pushSucceeded ? "sent" : "delivered";
    if (msg.deliveryStatus !== nextStatus) {
      await ctx.db.patch(messageId, { deliveryStatus: nextStatus });
    }
  },
});

export const deleteInvalidDevice = internalMutation({
  args: { deviceId: v.id("pushDevices") },
  handler: async (ctx, { deviceId }) => {
    await ctx.db.delete(deviceId);
  },
});
