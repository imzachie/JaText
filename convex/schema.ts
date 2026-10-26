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
    /** epoch ms — last time an unsend-awareness banner was shown */
    unsendWarningShownAt: v.optional(v.number()),
    statusPreference: v.optional(
      v.union(v.literal("online"), v.literal("dnd"), v.literal("offline")),
    ),
    customStatus: v.optional(v.string()),
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
    attachmentUrl: v.optional(v.string()),
    stickerKey: v.optional(v.string()),
    deliveryStatus: v.optional(
      v.union(v.literal("delivered"), v.literal("sent"), v.literal("read")),
    ),
    editedAt: v.optional(v.number()),
    replyToId: v.optional(v.id("messages")),
    forwardedFromId: v.optional(v.id("users")),
    unsentAt: v.optional(v.number()),
    hiddenFor: v.optional(v.array(v.id("users"))),
    reactions: v.optional(
      v.array(
        v.object({
          userId: v.id("users"),
          emoji: v.string(),
        }),
      ),
    ),
  }).index("by_pair", ["pairKey"]),

  conversationSettings: defineTable({
    userId: v.id("users"),
    friendId: v.id("users"),
    isArchived: v.boolean(),
    isMuted: v.boolean(),
    deletedAt: v.optional(v.number()),
  }).index("by_user_friend", ["userId", "friendId"]),

  userBlocks: defineTable({
    blockerId: v.id("users"),
    blockedId: v.id("users"),
  })
    .index("by_blocker_blocked", ["blockerId", "blockedId"])
    .index("by_blocked_blocker", ["blockedId", "blockerId"]),

  stickerLibrary: defineTable({
    userId: v.id("users"),
    mediaKey: v.string(),
    url: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    name: v.string(),
    mediaType: v.union(
      v.literal("gif"),
      v.literal("sticker"),
      v.literal("image"),
    ),
    source: v.union(v.literal("klipy"), v.literal("upload")),
    isFavorite: v.boolean(),
    useCount: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user_media", ["userId", "mediaKey"])
    .index("by_user_favorite", ["userId", "isFavorite"])
    .index("by_user_recent", ["userId", "lastUsedAt"]),

  presence: defineTable({
    userId: v.id("users"),
    lastSeenAt: v.number(),
    lastActiveAt: v.number(),
    typingToId: v.optional(v.id("users")),
    typingAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  pushDevices: defineTable({
    userId: v.id("users"),
    token: v.string(),
    updatedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  communityModerators: defineTable({
    userId: v.id("users"),
    electedBy: v.id("users"),
  }).index("by_user", ["userId"]),

  communityMessages: defineTable({
    senderId: v.id("users"),
    body: v.string(),
    type: v.union(v.literal("text"), v.literal("poll"), v.literal("sticker")),
    pollOptions: v.optional(v.array(v.string())),
    pollEndedAt: v.optional(v.number()),
    editedAt: v.optional(v.number()),
    stickerUrl: v.optional(v.string()),
    stickerStorageId: v.optional(v.id("_storage")),
    stickerName: v.optional(v.string()),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
    attachmentType: v.optional(v.string()),
    attachmentUrl: v.optional(v.string()),
    stickerKey: v.optional(v.string()),
    replyToId: v.optional(v.id("communityMessages")),
    forwardedFromName: v.optional(v.string()),
    forwardedFromId: v.optional(v.id("users")),
    unsentAt: v.optional(v.number()),
    hiddenFor: v.optional(v.array(v.id("users"))),
    reactions: v.optional(
      v.array(
        v.object({
          userId: v.id("users"),
          emoji: v.string(),
        }),
      ),
    ),
  }),

  communityPollVotes: defineTable({
    pollId: v.id("communityMessages"),
    userId: v.id("users"),
    optionIndex: v.number(),
  })
    .index("by_poll", ["pollId"])
    .index("by_poll_user", ["pollId", "userId"]),

  groups: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
    avatarId: v.optional(v.id("_storage")),
  }).index("by_owner", ["ownerId"]),

  groupMembers: defineTable({
    groupId: v.id("groups"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("moderator"), v.literal("member")),
    muted: v.boolean(),
  })
    .index("by_group", ["groupId"])
    .index("by_group_user", ["groupId", "userId"])
    .index("by_user", ["userId"]),

  groupMessages: defineTable({
    groupId: v.id("groups"),
    senderId: v.id("users"),
    body: v.string(),
    replyToId: v.optional(v.id("groupMessages")),
    forwardedFromName: v.optional(v.string()),
    forwardedFromId: v.optional(v.id("users")),
    stickerUrl: v.optional(v.string()),
    stickerStorageId: v.optional(v.id("_storage")),
    stickerName: v.optional(v.string()),
    stickerKey: v.optional(v.string()),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
    attachmentType: v.optional(v.string()),
    attachmentUrl: v.optional(v.string()),
    unsentAt: v.optional(v.number()),
    editedAt: v.optional(v.number()),
    hiddenFor: v.optional(v.array(v.id("users"))),
    reactions: v.optional(
      v.array(
        v.object({
          userId: v.id("users"),
          emoji: v.string(),
        }),
      ),
    ),
  }).index("by_group", ["groupId"]),

  chatTyping: defineTable({
    channelId: v.string(),
    userId: v.id("users"),
    typingAt: v.number(),
  })
    .index("by_channel", ["channelId"])
    .index("by_channel_user", ["channelId", "userId"]),
});
