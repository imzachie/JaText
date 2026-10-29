import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type Ctx = QueryCtx | MutationCtx;

export const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
export const USERNAME_REGEX = /^[a-z0-9._]{3,20}$/;
export const OWNER_EMAIL = "aidilzafri2013@gmail.com";

export function isValidReactionEmoji(raw: string): boolean {
  const clean = raw.trim();
  if (!clean || clean.length > 32) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3|[\u2600-\u27BF]/u.test(
    clean,
  );
}

export function isJaTextOwner(user: Doc<"users">) {
  return (
    user.email?.trim().toLowerCase() === OWNER_EMAIL &&
    user.username?.trim().toLowerCase() === "imzachie"
  );
}

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

export async function initialDmDeliveryStatus(
  ctx: Ctx,
  senderId: Id<"users">,
  receiverId: Id<"users">,
): Promise<"sent" | "delivered"> {
  const receiver = await ctx.db.get(receiverId);
  if (
    !receiver ||
    receiver.statusPreference === "dnd" ||
    (await hasBlocked(ctx, receiverId, senderId))
  ) {
    return "delivered";
  }
  const phoneDevice = await ctx.db
    .query("pushDevices")
    .withIndex("by_user", (q) => q.eq("userId", receiverId))
    .first();
  // "sent" means sending/sent to the recipient's registered phone with a notification;
  // "delivered" is reserved for desktop-only recipients (no phone registered) or unreachable phones.
  return phoneDevice ? "sent" : "delivered";
}

export async function scheduleMessagePush(
  ctx: MutationCtx,
  sender: Doc<"users">,
  receiverId: Id<"users">,
  body: string,
  messageId?: Id<"messages">,
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
    ...(messageId ? { messageId } : {}),
  });
}

export async function scheduleGroupMentionPush(
  ctx: MutationCtx,
  sender: Doc<"users">,
  groupId: Id<"groups">,
  groupName: string,
  receiverId: Id<"users">,
  body: string,
  mentionsEveryone: boolean,
) {
  const receiver = await ctx.db.get(receiverId);
  if (
    !receiver ||
    receiver.statusPreference === "dnd" ||
    (await hasBlocked(ctx, receiverId, sender._id))
  ) {
    return;
  }

  const senderName = sender.displayName ?? sender.name ?? "Someone";
  await ctx.scheduler.runAfter(0, internal.pushActions.sendMessageNotification, {
    receiverId,
    senderId: sender._id,
    senderName,
    title: mentionsEveryone
      ? `${senderName} mentioned @everyone in ${groupName}`
      : `${senderName} mentioned you in ${groupName}`,
    groupId,
    body,
  });
}

export async function scheduleGroupCallPush(
  ctx: MutationCtx,
  sender: Doc<"users">,
  groupId: Id<"groups">,
  groupName: string,
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

  const senderName = sender.displayName ?? sender.name ?? "Someone";
  await ctx.scheduler.runAfter(0, internal.pushActions.sendMessageNotification, {
    receiverId,
    senderId: sender._id,
    senderName,
    title: `${senderName} started a call in ${groupName}`,
    groupId,
    body,
  });
}

export async function scheduleAnnouncementPush(
  ctx: MutationCtx,
  sender: Doc<"users">,
  body: string,
) {
  await ctx.scheduler.runAfter(0, internal.pushActions.sendAnnouncementNotification, {
    senderId: sender._id,
    senderName: sender.displayName ?? sender.name ?? "JaText",
    body,
  });
}

export async function scheduleCallCancelPush(
  ctx: MutationCtx,
  senderId: Id<"users">,
  receiverId: Id<"users">,
) {
  await ctx.scheduler.runAfter(0, internal.pushActions.sendMessageNotification, {
    receiverId,
    senderId,
    senderName: "JaText",
    body: "__JATEXT_CALL_CANCEL__",
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
