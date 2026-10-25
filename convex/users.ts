import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { FOURTEEN_DAYS, USERNAME_REGEX, profileOf, requireUser } from "./lib";

/** The signed-in user's full profile (or null when signed out). */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return profileOf(ctx, user);
  },
});

/** Check a username's format + availability (used live while typing). */
export const checkUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    username = username.trim().toLowerCase();
    if (!USERNAME_REGEX.test(username)) {
      return {
        available: false,
        message: "3–20 characters: lowercase letters, numbers, . or _",
      };
    }
    const meId = await getAuthUserId(ctx);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (existing && existing._id !== meId) {
      return { available: false, message: `@${username} is already taken` };
    }
    return { available: true };
  },
});

/** Public profile of any user (profile card when clicking a pfp). */
export const byId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireUser(ctx);
    const user = await ctx.db.get(userId);
    return user ? profileOf(ctx, user) : null;
  },
});

/**
 * Save the profile — used by BOTH first-time onboarding ("Welcome to
 * JaText!") and Settings. Everything can change any time EXCEPT the
 * username, which is limited to one change every 14 days.
 *
 * avatarId / bannerId: undefined = keep, null = remove, id = new upload.
 */
export const saveProfile = mutation({
  args: {
    displayName: v.string(),
    username: v.string(),
    bio: v.string(),
    pronouns: v.string(),
    avatarColor: v.string(),
    avatarId: v.optional(v.union(v.id("_storage"), v.null())),
    bannerId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const username = args.username.trim().toLowerCase();
    const displayName = args.displayName.trim();

    if (!displayName) throw new Error("Display name is required.");
    if (!USERNAME_REGEX.test(username))
      throw new Error(
        "Username must be 3–20 characters: lowercase letters, numbers, . or _",
      );

    const taken = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (taken && taken._id !== me._id)
      throw new Error(`@${username} is already taken.`);

    const changingUsername = !!me.username && me.username !== username;
    if (
      changingUsername &&
      me.usernameChangedAt &&
      Date.now() - me.usernameChangedAt < FOURTEEN_DAYS
    ) {
      const daysLeft = Math.max(
        1,
        Math.ceil((me.usernameChangedAt + FOURTEEN_DAYS - Date.now()) / 86400000),
      );
      throw new Error(
        `You can only change your username once every 14 days. Try again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
      );
    }

    await ctx.db.patch(me._id, {
      displayName,
      username,
      bio: args.bio.trim().slice(0, 160),
      pronouns: args.pronouns.trim().slice(0, 30),
      avatarColor: args.avatarColor,
      onboardingComplete: true,
      ...(me.username !== username
        ? { usernameChangedAt: Date.now() }
        : {}),
      ...(args.avatarId !== undefined
        ? { avatarId: args.avatarId ?? undefined }
        : {}),
      ...(args.bannerId !== undefined
        ? { bannerId: args.bannerId ?? undefined }
        : {}),
    });
  },
});

/** Save the user's persistent activity preference and optional custom status. */
export const setActivity = mutation({
  args: {
    status: v.union(v.literal("online"), v.literal("dnd"), v.literal("offline")),
    customStatus: v.string(),
  },
  handler: async (ctx, { status, customStatus }) => {
    const me = await requireUser(ctx);
    await ctx.db.patch(me._id, {
      statusPreference: status,
      customStatus: customStatus.trim().slice(0, 60),
    });
  },
});

/** Refresh ephemeral presence; only active interactions refresh lastActiveAt. */
export const heartbeat = mutation({
  args: { active: v.boolean() },
  handler: async (ctx, { active }) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .unique();

    if (presence) {
      await ctx.db.patch(presence._id, {
        lastSeenAt: now,
        ...(active ? { lastActiveAt: now } : {}),
      });
    } else {
      await ctx.db.insert("presence", {
        userId: me._id,
        lastSeenAt: now,
        lastActiveAt: now,
      });
    }
    await ctx.scheduler.runAfter(90_001, internal.users.expirePresence, {
      userId: me._id,
      expectedLastSeenAt: now,
    });
  },
});

/** Expire disconnected sessions only if no newer heartbeat has arrived. */
export const expirePresence = internalMutation({
  args: {
    userId: v.id("users"),
    expectedLastSeenAt: v.number(),
  },
  handler: async (ctx, { userId, expectedLastSeenAt }) => {
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!presence || presence.lastSeenAt !== expectedLastSeenAt) return;
    await ctx.db.patch(presence._id, {
      lastSeenAt: 0,
      typingToId: undefined,
      typingAt: undefined,
    });
  },
});

/** Mark the current session disconnected immediately on an explicit sign-out. */
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .unique();
    if (presence) {
      await ctx.db.patch(presence._id, {
        lastSeenAt: 0,
        typingToId: undefined,
        typingAt: undefined,
      });
    }
  },
});
