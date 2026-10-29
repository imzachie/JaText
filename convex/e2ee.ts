import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib";

/**
 * Publish or update a signed E2EE public identity bundle for the current user.
 * Supports multiple concurrent devices per account (up to 6 active device keys)
 * so outgoing DMs (`wra`) and group epochs (`kwraps`) always wrap for every device!
 */
export const publishIdentity = mutation({
  args: {
    keyId: v.string(),
    dhPubB64: v.string(),
    sigPubB64: v.string(),
    selfSigB64: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const existingRows = await ctx.db
      .query("e2eeUserKeys")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .collect();
    const now = Date.now();
    const matching = existingRows.find((row) => row.keyId === args.keyId);
    if (matching) {
      await ctx.db.patch(matching._id, {
        dhPubB64: args.dhPubB64,
        sigPubB64: args.sigPubB64,
        selfSigB64: args.selfSigB64,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("e2eeUserKeys", {
      userId: me._id,
      keyId: args.keyId,
      dhPubB64: args.dhPubB64,
      sigPubB64: args.sigPubB64,
      selfSigB64: args.selfSigB64,
      updatedAt: now,
    });

    if (existingRows.length >= 6) {
      const sortedOldest = [...existingRows].sort((a, b) => a.updatedAt - b.updatedAt);
      const toRemove = sortedOldest.slice(0, existingRows.length - 5);
      await Promise.all(toRemove.map((row) => ctx.db.delete(row._id)));
    }
  },
});

/** Fetch all signed E2EE public identity bundles across every device for a list of users. */
export const getUserIdentities = query({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    await requireUser(ctx);
    const unique = [...new Set(userIds)];
    const perUserRows = await Promise.all(
      unique.map((uid) =>
        ctx.db
          .query("e2eeUserKeys")
          .withIndex("by_user", (q) => q.eq("userId", uid))
          .collect(),
      ),
    );
    return perUserRows
      .flatMap((rows) => [...rows].sort((a, b) => a.updatedAt - b.updatedAt))
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
