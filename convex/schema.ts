import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * JaText database (visible in your Convex dashboard).
 * - users: Convex Auth fields + JaText profile (username, banner, avatar color…)
 * - friendRequests: pending / accepted / declined
 * - messages: DMs between accepted friends, with optional file attachments
 */
export default defineSchema({
  ...authTables,
  users: defineTable({
    // Convex Auth fields
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // JaText profile
    displayName: v.optional(v.string()),
    username: v.optional(v.string()),
    bio: v.optional(v.string()),
    pronouns: v.optional(v.string()),
    /** avatar color id, see src/lib/colors.ts ("black" = Default (Black)) */
    avatarColor: v.optional(v.string()),
    /** profile picture in Convex file storage */
    avatarId: v.optional(v.id("_storage")),
    /** banner in Convex file storage */
    bannerId: v.optional(v.id("_storage")),
    onboardingComplete: v.optional(v.boolean()),
    /** epoch ms — usernames can only change once every 14 days */
    usernameChangedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("by_username", ["username"]),

  friendRequests: defineTable({
    fromId: v.id("users"),
    toId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
    ),
  })
    .index("by_to_status", ["toId", "status"])
    .index("by_from_status", ["fromId", "status"])
    .index("by_from_to", ["fromId", "toId"]),

  messages: defineTable({
    senderId: v.id("users"),
    receiverId: v.id("users"),
    /** "<smallerId>|<largerId>" — one index lookup per conversation */
    pairKey: v.string(),
    body: v.string(),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
    attachmentType: v.optional(v.string()),
  }).index("by_pair", ["pairKey"]),
});
