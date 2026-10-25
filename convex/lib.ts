import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type Ctx = QueryCtx | MutationCtx;

export const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
export const USERNAME_REGEX = /^[a-z0-9._]{3,20}$/;

export async function requireUser(ctx: Ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("You must be signed in.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("You must be signed in.");
  return user;
}

/** Resolve a user document into the public profile the app renders. */
export async function profileOf(ctx: Ctx, user: Doc<"users">) {
  return {
    id: user._id as string,
    email: user.email,
    displayName: user.displayName ?? user.name ?? "",
    username: user.username ?? "",
    bio: user.bio ?? "",
    pronouns: user.pronouns ?? "",
    avatarColor: user.avatarColor ?? "black",
    avatarUrl: user.avatarId
      ? ((await ctx.storage.getUrl(user.avatarId)) ?? undefined)
      : user.image,
    bannerUrl: user.bannerId
      ? ((await ctx.storage.getUrl(user.bannerId)) ?? undefined)
      : undefined,
    onboardingComplete: user.onboardingComplete ?? false,
    usernameChangedAt: user.usernameChangedAt,
    statusPreference: user.statusPreference ?? "online",
    customStatus: user.customStatus ?? "",
  };
}

export function pairKey(a: Id<"users">, b: Id<"users">) {
  return [a, b].sort().join("|");
}

/** Are these two users accepted friends? */
export async function areFriends(
  ctx: Ctx,
  a: Id<"users">,
  b: Id<"users">,
): Promise<boolean> {
  const forward = await ctx.db
    .query("friendRequests")
    .withIndex("by_from_to", (q) => q.eq("fromId", a).eq("toId", b))
    .collect();
  const backward = await ctx.db
    .query("friendRequests")
    .withIndex("by_from_to", (q) => q.eq("fromId", b).eq("toId", a))
    .collect();
  return [...forward, ...backward].some((r) => r.status === "accepted");
}

export async function hasBlocked(
  ctx: Ctx,
  blockerId: Id<"users">,
  blockedId: Id<"users">,
): Promise<boolean> {
  return !!(await ctx.db
    .query("userBlocks")
    .withIndex("by_blocker_blocked", (q) =>
      q.eq("blockerId", blockerId).eq("blockedId", blockedId),
    )
    .unique());
}

export async function scheduleMessagePush(
  ctx: MutationCtx,
  sender: Doc<"users">,
  receiverId: Id<"users">,
  body: string,
) {
  const receiver = await ctx.db.get(receiverId);
  if (
    !receiver ||
    receiver.statusPreference === "dnd" ||
    (await hasBlocked(ctx, receiverId, sender._id))
  ) {
    return;
  }

  await ctx.scheduler.runAfter(0, internal.pushActions.sendMessageNotification, {
    receiverId,
    senderId: sender._id,
    senderName: sender.displayName ?? sender.name ?? "Someone",
    body,
  });
}

/** All friend user-ids for `userId` (accepted in either direction). */
export async function friendIds(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Id<"users">[]> {
  const sent = await ctx.db
    .query("friendRequests")
    .withIndex("by_from_status", (q) =>
      q.eq("fromId", userId).eq("status", "accepted"),
    )
    .collect();
  const received = await ctx.db
    .query("friendRequests")
    .withIndex("by_to_status", (q) =>
      q.eq("toId", userId).eq("status", "accepted"),
    )
    .collect();
  return [
    ...sent.map((r) => r.toId),
    ...received.map((r) => r.fromId),
  ];
}
