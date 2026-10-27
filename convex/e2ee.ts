import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib";

/** Publish or update the signed E2EE public identity bundle for the current user. */
export const publishIdentity = mutation({
  args: {
    keyId: v.string(),
    dhPubB64: v.string(),
    sigPubB64: v.string(),
    selfSigB64: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const existing = await ctx.db
      .query("e2eeUserKeys")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        keyId: args.keyId,
        dhPubB64: args.dhPubB64,
        sigPubB64: args.sigPubB64,
        selfSigB64: args.selfSigB64,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("e2eeUserKeys", {
        userId: me._id,
        keyId: args.keyId,
        dhPubB64: args.dhPubB64,
        sigPubB64: args.sigPubB64,
        selfSigB64: args.selfSigB64,
        updatedAt: now,
      });
    }
  },
});

/** Fetch signed E2EE public identity bundles for a list of users. */
export const getUserIdentities = query({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    await requireUser(ctx);
    const unique = [...new Set(userIds)];
    const rows = await Promise.all(
      unique.map((uid) =>
        ctx.db
          .query("e2eeUserKeys")
          .withIndex("by_user", (q) => q.eq("userId", uid))
          .unique(),
      ),
    );
    return rows
      .filter((r) => r !== null)
      .map((r) => ({
        userId: r.userId as string,
        keyId: r.keyId,
        dhPubB64: r.dhPubB64,
        sigPubB64: r.sigPubB64,
        selfSigB64: r.selfSigB64,
        ts: r.updatedAt,
      }));
  },
});

/** Save the client-encrypted (PBKDF2 + AES-256-GCM) private key vault for multi-device sync. */
export const saveVault = mutation({
  args: {
    keyId: v.string(),
    sealedJson: v.string(),
  },
  handler: async (ctx, { keyId, sealedJson }) => {
    const me = await requireUser(ctx);
    const existing = await ctx.db
      .query("e2eeKeyBackups")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { keyId, sealedJson, updatedAt: now });
    } else {
      await ctx.db.insert("e2eeKeyBackups", {
        userId: me._id,
        keyId,
        sealedJson,
        updatedAt: now,
      });
    }
  },
});

/** Fetch the current user's client-encrypted key vault (if configured). */
export const getMyVault = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const existing = await ctx.db
      .query("e2eeKeyBackups")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .unique();
    if (!existing) return null;
    return {
      keyId: existing.keyId,
      sealedJson: existing.sealedJson,
      updatedAt: existing.updatedAt,
    };
  },
});
