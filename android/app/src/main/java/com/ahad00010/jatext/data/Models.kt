package com.ahad00010.jatext.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

const val OFFICIAL_COMMUNITY_ID = "jatext-official-community"
const val OWNER_EMAIL = "aidilzafri2013@gmail.com"
const val OWNER_USERNAME = "imzachie"
const val UNSEND_WINDOW_MS: Long = 60L * 60L * 1000L

typealias SyncedCustomTheme = SyncedCustomGradient
typealias LinkPreviewData = LinkPreviewInfo

@Serializable
data class UserSocialLink(
    val platform: String = "",
    val handle: String = "",
    val url: String = "",
)

@Serializable
data class UserWebsiteLink(
    val title: String = "",
    val url: String = "",
)

@Serializable
data class SyncedCustomGradient(
    val a: String = "d",
    val cols: List<String> = listOf("#efb4aa", "#b6e0d3", "#a5c4f3"),
    val ang: Double = 45.0,
    val int: Double = 60.0,
)

@Serializable
data class SyncedThemePayload(
    val k: String = "d",
    val d: String? = null,
    val p: String? = null,
    val c: SyncedCustomGradient? = null,
    val u: Long? = null,
)

@Serializable
data class JaUser(
    val id: String = "",
    val email: String? = null,
    val displayName: String = "",
    val username: String = "",
    val bio: String = "",
    val pronouns: String = "",
    val avatarColor: String = "black",
    val avatarUrl: String? = null,
    val bannerUrl: String? = null,
    val onboardingComplete: Boolean = false,
    val usernameChangedAt: Long? = null,
    val statusPreference: String? = "online",
    val customStatus: String? = "",
    val socials: List<UserSocialLink>? = null,
    val website: UserWebsiteLink? = null,
    val syncedTheme: SyncedThemePayload? = null,
    val totpEnabled: Boolean = false,
    val lastSeenAt: Long? = null,
    @SerialName("isOwner")
    val serverIsOwner: Boolean = false,
) {
    val isOwner: Boolean
        get() = serverIsOwner ||
            email?.equals(OWNER_EMAIL, ignoreCase = true) == true ||
            username.trim().removePrefix("@").equals(OWNER_USERNAME, ignoreCase = true)

    val needsProfileSetup: Boolean
        get() = !onboardingComplete || username.isBlank()
}

@Serializable
data class FriendActivity(
    val userId: String = "",
    val status: String = "offline",
    val customStatus: String = "",
    val isTyping: Boolean = false,
    @SerialName("online")
    val rawOnline: Boolean? = null,
    @SerialName("statusPreference")
    val rawStatusPreference: String? = null,
    val lastSeenAt: Long? = null,
) {
    val online: Boolean
        get() = rawOnline ?: (status != "offline")
    val statusPreference: String
        get() = rawStatusPreference?.ifBlank { null } ?: status.ifBlank { "online" }
    val typingToMe: Boolean
        get() = isTyping
}

@Serializable
data class OwnerPlatformStats(
    val totalUsers: Int = 0,
    val onlineUsers: Int = 0,
    val suspendedUsers: Int = 0,
    val totalMessages: Int = 0,
    val totalGroups: Int = 0,
    val totalCommunityPosts: Int = 0,
    val linkedDevices: Int = 0,
)

@Serializable
data class OwnerManagedUser(
    val id: String = "",
    val email: String = "",
    val username: String = "",
    val displayName: String = "",
    val avatarColor: String = "black",
    val avatarUrl: String? = null,
    val bannerUrl: String? = null,
    val bio: String = "",
    val customStatus: String = "",
    val isSuspended: Boolean = false,
    val suspendedReason: String = "",
    val totpEnabled: Boolean = false,
    val isOwner: Boolean = false,
    val online: Boolean = false,
    val passkeyCount: Int = 0,
    val linkedDeviceCount: Int = 0,
    val createdAt: Long = 0L,
)

@Serializable
data class OwnerOverviewResult(
    val ok: Boolean = true,
    val message: String? = null,
    val stats: OwnerPlatformStats? = null,
    val users: List<OwnerManagedUser> = emptyList(),
    val user: OwnerManagedUser? = null,
    val deletedUserId: String? = null,
)

@Serializable
data class FriendRequest(
    val id: String = "",
    val from: JaUser = JaUser(),
    val to: JaUser = JaUser(),
    val status: String = "pending",
    val createdAt: Long = 0L,
) {
    val requestId: String
        get() = id
    val user: JaUser
        get() = from
    val sender: JaUser
        get() = from
    val recipient: JaUser
        get() = to

    fun peerFor(myUserId: String?): JaUser {
        if (!myUserId.isNullOrBlank()) {
            if (from.id == myUserId && to.id.isNotBlank()) return to
            if (to.id == myUserId && from.id.isNotBlank()) return from
        }
        return if (to.id.isNotBlank() && from.id.isBlank()) to else from
    }
}

@Serializable
data class MessageReaction(
    val userId: String = "",
    val emoji: String = "",
)

@Serializable
data class ReplySummary(
    val id: String = "",
    val senderId: String = "",
    val senderName: String? = null,
    val body: String = "",
    val attachmentName: String? = null,
    val attachmentType: String? = null,
)

@Serializable
data class ForwardedMessageContext(
    val v: Int = 1,
    val sourceKind: String = "dm",
    val sourceLabel: String = "",
    val originalMessageId: String = "",
    val originalCreatedAt: Long = 0L,
    val originalSenderId: String = "",
    val originalSenderName: String = "",
    val originalSenderUsername: String? = null,
    val originalSenderAvatarUrl: String? = null,
    val originalSenderAvatarColor: String? = null,
    val dmUserIds: List<String>? = null,
    val groupId: String? = null,
    val groupName: String? = null,
    val channelId: String? = null,
    val channelName: String? = null,
    val channelVerified: Boolean = false,
)

@Serializable
data class MessageE2EEProof(
    val encrypted: Boolean = true,
    val algorithm: String = "ECDH-P256 + HKDF-SHA256 + AES-256-GCM",
    val senderKeyId: String = "",
    val receiverKeyId: String? = null,
    val epoch: Int? = null,
    val signatureVerified: Boolean = false,
    val ciphertextPreview: String = "",
)

@Serializable
data class ChatMessage(
    val id: String = "",
    val renderKey: String? = null,
    val senderId: String = "",
    val receiverId: String = "",
    val body: String = "",
    val rawWireBody: String? = null,
    val bubbleStyle: String? = null,
    val attachmentUrl: String? = null,
    val attachmentName: String? = null,
    val attachmentType: String? = null,
    val stickerKey: String? = null,
    val explicitStickerUrl: String? = null,
    val isStickerFavorite: Boolean? = false,
    val deliveryStatus: String? = "sent",
    val readAt: Long? = null,
    val editedAt: Long? = null,
    val createdAt: Long = 0L,
    val replyTo: ReplySummary? = null,
    val forwardedFrom: String? = null,
    val forwardedContext: ForwardedMessageContext? = null,
    val unsentAt: Long? = null,
    val reactions: List<MessageReaction> = emptyList(),
    val e2ee: MessageE2EEProof? = null,
    val encryptedAttachmentJson: String? = null,
) {
    val encryptedAttachment: EncryptedBlobDescriptor?
        get() = encryptedAttachmentJson?.let {
            try {
                JaTextJson.decodeFromString<EncryptedBlobDescriptor>(it)
            } catch (_: Throwable) {
                null
            }
        }

    /**
     * Note: server/tursoBackend.js sets `stickerKey = "klipy:${attachment_url}"` on ALL DM/Group
     * attachments (photos, videos, voice notes) for star/favourite indexing!
     * Only treat a message as a Sticker when `explicitStickerUrl` is set (from E2EE `payload.stk`)
     * or `attachmentType` explicitly says `"sticker"`.
     */
    val encryptedSticker: EncryptedStickerDescriptor?
        get() {
            val trueStickerUrl = explicitStickerUrl?.takeIf { it.isNotBlank() }
                ?: attachmentUrl?.takeIf {
                    it.isNotBlank() &&
                        encryptedAttachmentJson.isNullOrBlank() &&
                        (attachmentType?.equals("sticker", ignoreCase = true) == true ||
                            stickerKey?.startsWith("upload:") == true)
                }
            return if (!trueStickerUrl.isNullOrBlank()) {
                EncryptedStickerDescriptor(
                    url = trueStickerUrl,
                    n = attachmentName ?: "Sticker",
                    key = stickerKey.orEmpty(),
                )
            } else {
                null
            }
        }
}

@Serializable
data class ChatPreview(
    val friendId: String = "",
    val body: String = "",
    val createdAt: Long = 0L,
    val senderId: String = "",
    val isArchived: Boolean = false,
    val isMuted: Boolean = false,
    val unreadCount: Int = 0,
)

@Serializable
data class StickerMedia(
    val key: String = "",
    val url: String = "",
    val previewUrl: String? = null,
    val name: String = "Sticker",
    val mediaType: String = "sticker",
    val source: String = "upload",
    val storageId: String? = null,
    val isFavorite: Boolean = false,
    val useCount: Int = 0,
    val lastUsedAt: Long? = null,
    val updatedAt: Long = 0L,
)

@Serializable
data class PollVoteEntry(
    val userId: String = "",
    val optionIndex: Int = 0,
)

@Serializable
data class PollVoter(
    val userId: String = "",
    val optionIndex: Int = 0,
    val displayName: String = "",
    val username: String = "",
    val avatarColor: String = "black",
    val avatarUrl: String? = null,
)

@Serializable
data class CommunityPermissions(
    val isOwner: Boolean = false,
    val canModerate: Boolean = false,
    val moderatorIds: List<String> = emptyList(),
) {
    val canPost: Boolean
        get() = isOwner || canModerate
    val canCreatePolls: Boolean
        get() = isOwner || canModerate
    val canManagePolls: Boolean
        get() = isOwner || canModerate
}

data class CommunityPoll(
    val id: String,
    val options: List<String>,
    val counts: List<Int>,
    val totalVotes: Int,
    val myVote: Int?,
    val endedAt: Long?,
)

@Serializable
data class CommunityUser(
    val id: String = "",
    val username: String = "",
    val displayName: String = "",
    val avatarColor: String = "black",
    val avatarUrl: String? = null,
    val createdAt: Long = 0L,
)

@Serializable
data class CommunityMessage(
    val id: String = "",
    val renderKey: String? = null,
    val senderId: String = "",
    val senderName: String = "",
    val senderUsername: String = "",
    val senderAvatarUrl: String? = null,
    val senderAvatarColor: String = "black",
    val body: String = "",
    val bubbleStyle: String? = null,
    val type: String = "text",
    val pollOptions: List<String> = emptyList(),
    val pollEndedAt: Long? = null,
    val votes: List<PollVoteEntry> = emptyList(),
    val myVote: Int? = null,
    val createdAt: Long = 0L,
    val editedAt: Long? = null,
    val unsentAt: Long? = null,
    val attachmentUrl: String? = null,
    val attachmentName: String? = null,
    val attachmentType: String? = null,
    val stickerUrl: String? = null,
    val stickerName: String? = null,
    val stickerKey: String? = null,
    val isStickerFavorite: Boolean = false,
    val forwardedFromName: String? = null,
    val forwardedContext: ForwardedMessageContext? = null,
    val replyTo: ReplySummary? = null,
    val reactions: List<MessageReaction> = emptyList(),
    val canModerate: Boolean = false,
    val isOwner: Boolean = false,
    val deleted: Boolean = false,
) {
    val senderIsOwner: Boolean
        get() = isOwner

    val poll: CommunityPoll?
        get() = if (type == "poll" && pollOptions.isNotEmpty()) {
            val counts = List(pollOptions.size) { idx -> votes.count { it.optionIndex == idx } }
            CommunityPoll(
                id = id,
                options = pollOptions,
                counts = counts,
                totalVotes = votes.size,
                myVote = myVote,
                endedAt = pollEndedAt,
            )
        } else {
            null
        }
}

@Serializable
data class GroupReadReceipt(
    val userId: String = "",
    val lastReadAt: Long = 0L,
    val displayName: String = "",
    val username: String = "",
    val avatarColor: String = "black",
    val avatarUrl: String? = null,
)

@Serializable
data class ExploreCommunitySummary(
    val id: String = "",
    val name: String = "",
    val description: String = "",
    val avatarUrl: String? = null,
    val avatarColor: String = "purple",
    val ownerId: String = "",
    val memberCount: Int = 1,
    val isJoined: Boolean = false,
    val role: String? = null,
    val createdAt: Long = 0L,
    val updatedAt: Long = 0L,
)

@Serializable
data class GroupSummary(
    val id: String = "",
    val name: String = "",
    val avatarUrl: String? = null,
    val avatarColor: String = "purple",
    val description: String = "",
    val isCommunity: Boolean = false,
    val communityKeySeed: String? = null,
    val ownerId: String = "",
    val role: String = "member",
    val memberCount: Int = 0,
    val lastMessage: String = "",
    val lastMessageAt: Long = 0L,
    val lastSenderId: String? = null,
    val lastSenderName: String? = null,
    val lastMentionedMe: Boolean = false,
    val isSilenced: Boolean = false,
    val isArchived: Boolean = false,
    val unreadCount: Int = 0,
) {
    val myRole: String
        get() = role
}

@Serializable
data class GroupMember(
    val id: String = "",
    val email: String? = null,
    val displayName: String = "",
    val username: String = "",
    val bio: String = "",
    val pronouns: String = "",
    val avatarColor: String = "black",
    val avatarUrl: String? = null,
    val bannerUrl: String? = null,
    val statusPreference: String? = "online",
    val customStatus: String? = "",
    val socials: List<UserSocialLink>? = null,
    val website: UserWebsiteLink? = null,
    val lastSeenAt: Long? = null,
    val role: String = "member",
    val muted: Boolean = false,
) {
    fun toJaUser(): JaUser = JaUser(
        id = id,
        email = email,
        displayName = displayName,
        username = username,
        bio = bio,
        pronouns = pronouns,
        avatarColor = avatarColor,
        avatarUrl = avatarUrl,
        bannerUrl = bannerUrl,
        onboardingComplete = true,
        statusPreference = statusPreference,
        customStatus = customStatus,
        socials = socials,
        website = website,
        lastSeenAt = lastSeenAt,
    )
}

@Serializable
data class GroupDetails(
    val id: String = "",
    val name: String = "",
    val avatarUrl: String? = null,
    val avatarColor: String = "purple",
    val description: String = "",
    val isCommunity: Boolean = false,
    val communityKeySeed: String? = null,
    val ownerId: String = "",
    val role: String = "member",
    val members: List<GroupMember> = emptyList(),
    val readReceipts: List<GroupReadReceipt> = emptyList(),
) {
    val myRole: String
        get() = role
}

@Serializable
data class GroupMessage(
    val id: String = "",
    val groupId: String? = null,
    val renderKey: String? = null,
    val senderId: String = "",
    val senderName: String = "",
    val senderUsername: String = "",
    val senderAvatarUrl: String? = null,
    val senderAvatarColor: String = "black",
    val body: String = "",
    val rawWireBody: String? = null,
    val bubbleStyle: String? = null,
    val attachmentUrl: String? = null,
    val attachmentName: String? = null,
    val attachmentType: String? = null,
    val stickerUrl: String? = null,
    val stickerName: String? = null,
    val stickerKey: String? = null,
    val explicitStickerUrl: String? = null,
    val isStickerFavorite: Boolean = false,
    val forwardedFromName: String? = null,
    val forwardedContext: ForwardedMessageContext? = null,
    val replyTo: ReplySummary? = null,
    val createdAt: Long = 0L,
    val editedAt: Long? = null,
    val unsentAt: Long? = null,
    val mentionsEveryone: Boolean = false,
    val mentionedUserIds: List<String> = emptyList(),
    val reactions: List<MessageReaction> = emptyList(),
    val e2ee: MessageE2EEProof? = null,
    val encryptedAttachmentJson: String? = null,
) {
    val encryptedAttachment: EncryptedBlobDescriptor?
        get() = encryptedAttachmentJson?.let {
            try {
                JaTextJson.decodeFromString<EncryptedBlobDescriptor>(it)
            } catch (_: Throwable) {
                null
            }
        }

    val encryptedSticker: EncryptedStickerDescriptor?
        get() {
            val trueStickerUrl = (explicitStickerUrl ?: stickerUrl)?.takeIf { it.isNotBlank() }
                ?: attachmentUrl?.takeIf {
                    it.isNotBlank() &&
                        encryptedAttachmentJson.isNullOrBlank() &&
                        (attachmentType?.equals("sticker", ignoreCase = true) == true ||
                            stickerKey?.startsWith("upload:") == true)
                }
            return if (!trueStickerUrl.isNullOrBlank()) {
                EncryptedStickerDescriptor(
                    url = trueStickerUrl,
                    n = stickerName ?: attachmentName ?: "Sticker",
                    key = stickerKey.orEmpty(),
                )
            } else {
                null
            }
        }
}

@Serializable
data class GroupSeenReader(
    val id: String = "",
    val displayName: String = "",
    val username: String = "",
    val avatarColor: String = "black",
    val avatarUrl: String? = null,
    val seenAt: Long = 0L,
)

@Serializable
data class ChatTypingUser(
    val id: String = "",
    val displayName: String = "",
    val username: String = "",
)

@Serializable
data class BootstrapResponse(
    val serverTime: Long = 0L,
    val me: JaUser = JaUser(),
    val friends: List<JaUser> = emptyList(),
    val incoming: List<FriendRequest> = emptyList(),
    val outgoing: List<FriendRequest> = emptyList(),
    val blockedUserIds: List<String> = emptyList(),
    val previews: List<ChatPreview> = emptyList(),
    val friendActivities: List<FriendActivity> = emptyList(),
    val stickerFavorites: List<StickerMedia> = emptyList(),
    val recentStickers: List<StickerMedia> = emptyList(),
    val communityPermissions: CommunityPermissions = CommunityPermissions(),
    val communityDirectory: List<CommunityUser> = emptyList(),
    val communityMuted: Boolean = false,
    val communityMessages: List<CommunityMessage> = emptyList(),
    val communityHasMore: Boolean = false,
    val groups: List<GroupSummary> = emptyList(),
    val exploreCommunities: List<ExploreCommunitySummary> = emptyList(),
    val hasRemoteE2EEVault: Boolean = false,
    val remoteVaultKeyId: String? = null,
    val openedViewOnceIds: List<String> = emptyList(),
    val soundboards: List<SoundboardClip> = emptyList(),
    val chatOrganization: ChatOrganizationSpec = ChatOrganizationSpec(),
    val refreshedToken: String? = null,
)

@Serializable
data class SyncSocialPayload(
    val friends: List<JaUser> = emptyList(),
    val incoming: List<FriendRequest> = emptyList(),
    val outgoing: List<FriendRequest> = emptyList(),
    val blockedUserIds: List<String> = emptyList(),
    val previews: List<ChatPreview> = emptyList(),
    val friendActivities: List<FriendActivity> = emptyList(),
)

@Serializable
data class SyncStickersPayload(
    val stickerFavorites: List<StickerMedia> = emptyList(),
    val recentStickers: List<StickerMedia> = emptyList(),
)

@Serializable
data class SyncResponse(
    val serverTime: Long = 0L,
    val me: JaUser? = null,
    val social: SyncSocialPayload? = null,
    val stickers: SyncStickersPayload? = null,
    val changedDmMessages: List<ChatMessage>? = null,
    val callDmMessages: List<ChatMessage>? = null,
    val changedGroupMessages: List<GroupMessage>? = null,
    val callGroupMessages: List<GroupMessage>? = null,
    val changedCommunityMessages: List<CommunityMessage>? = null,
    val groups: List<GroupSummary>? = null,
    val exploreCommunities: List<ExploreCommunitySummary>? = null,
    val groupReadReceipts: List<GroupReadReceipt>? = null,
    val dmTypingUserIds: List<String> = emptyList(),
    val typingByGroup: Map<String, List<ChatTypingUser>> = emptyMap(),
    val groupTypingUsers: List<ChatTypingUser> = emptyList(),
    val communityTypingUsers: List<ChatTypingUser> = emptyList(),
    val refreshedToken: String? = null,
)

@Serializable
data class E2EEVaultGroupEpoch(
    val groupId: String = "",
    val epoch: Int = 1,
    val secretB64: String = "",
    val createdAt: Long = 0L,
)

@Serializable
data class E2EEVaultContents(
    val v: Int = 1,
    val userId: String = "",
    val primaryIdentity: StoredIdentityRecord = StoredIdentityRecord(),
    val previousIdentities: List<StoredIdentityRecord> = emptyList(),
    val groupEpochs: List<E2EEVaultGroupEpoch> = emptyList(),
    val exportedAt: Long = 0L,
)

@Serializable
data class SealedAutoSyncKeyring(
    val v: Int = 1,
    val userId: String = "",
    val keyIds: List<String> = emptyList(),
    val iv: String = "",
    val ct: String = "",
    val updatedAt: Long = 0L,
)

@Serializable
data class SealedVaultWrap(
    val salt: String = "",
    val iterations: Int = 600_000,
    val iv: String = "",
    val ct: String = "",
)

@Serializable
data class SealedE2EEVault(
    val v: Int = 1,
    val userId: String = "",
    val keyId: String = "",
    val pinWrap: SealedVaultWrap = SealedVaultWrap(),
    val recoveryWrap: SealedVaultWrap = SealedVaultWrap(),
    val vaultIv: String = "",
    val vaultCt: String = "",
    val updatedAt: Long = 0L,
)

@Serializable
data class AccountSlot(
    val slotId: String,
    val userId: String = "",
    val email: String = "",
    val displayName: String = "",
    val username: String = "",
    val avatarColor: String = "black",
    val avatarUrl: String? = null,
    val token: String = "",
    val lastActiveAt: Long = 0L,
)

@Serializable
data class CallHistoryEntry(
    val id: String,
    val peerId: String? = null,
    val groupId: String? = null,
    val title: String,
    val subtitle: String = "",
    val avatarUrl: String? = null,
    val avatarColor: String = "black",
    val mode: String = "voice",
    val direction: String = "outgoing",
    val status: String = "ended",
    val durationSec: Int = 0,
    val timestamp: Long = 0L,
)

@Serializable
data class LinkPreviewInfo(
    val url: String = "",
    val hasEmbed: Boolean = true,
    val title: String? = null,
    val description: String? = null,
    val imageUrl: String? = null,
    val image: String? = null,
    val siteName: String? = null,
    val themeColor: String? = null,
    val domain: String? = null,
) {
    val effectiveImageUrl: String?
        get() = (imageUrl ?: image)?.trim()?.takeIf { it.isNotEmpty() }
}

@Serializable
data class ApkVersionManifest(
    val versionName: String = "",
    val versionCode: Int = 0,
    val downloadUrl: String = "https://jatext.vercel.app/downloads/JaText-release.apk",
    val commitSha: String? = null,
    val publishedAt: String? = null,
)

@Serializable
data class PublicIdentityBundle(
    val userId: String = "",
    val keyId: String = "",
    val dhPubB64: String = "",
    val sigPubB64: String = "",
    val selfSigB64: String = "",
    val ts: Long = 0L,
    val updatedAt: Long? = null,
)

@Serializable
data class StoredIdentityRecord(
    val userId: String = "",
    val keyId: String = "",
    val dhPubB64: String = "",
    val dhPrivPkcs8B64: String = "",
    val sigPubB64: String = "",
    val sigPrivPkcs8B64: String = "",
    val selfSigB64: String = "",
    val createdAt: Long = 0L,
)

@Serializable
data class EncryptedBlobDescriptor(
    val k: String = "",
    val iv: String = "",
    val n: String = "",
    val t: String = "application/octet-stream",
    val sz: Int = 0,
    val h: String = "",
) {
    val mt: String
        get() = t
}

@Serializable
data class EncryptedStickerDescriptor(
    val url: String? = null,
    val storageId: String? = null,
    val att: EncryptedBlobDescriptor? = null,
    val n: String = "Sticker",
    val key: String = "",
    val mt: String = "sticker",
)

@Serializable
data class E2EEPlainPayload(
    val v: Int = 1,
    val b: String = "",
    val bs: String? = null,
    val att: EncryptedBlobDescriptor? = null,
    val msgBlob: EncryptedBlobDescriptor? = null,
    val stk: EncryptedStickerDescriptor? = null,
)

@Serializable
data class OverflowDescriptor(
    val sid: String = "",
    val h: String = "",
)

@Serializable
data class DMEncryptedEnvelope(
    val v: Int = 1,
    val c: String = "dm",
    val sk: String = "",
    val rk: String = "",
    val epk: String = "",
    val wr: String = "",
    val ws: String = "",
    val sdh: String? = null,
    val wra: Map<String, String>? = null,
    val iv: String = "",
    val ct: String? = null,
    val ovf: OverflowDescriptor? = null,
    val sig: String = "",
)

@Serializable
data class GroupEncryptedEnvelope(
    val v: Int = 1,
    val c: String = "grp",
    val ep: Int = 1,
    val sk: String = "",
    val s: String = "",
    val iv: String = "",
    val ct: String? = null,
    val ovf: OverflowDescriptor? = null,
    val sig: String = "",
)

@Serializable
data class GroupEpochWrapEntry(
    val kid: String = "",
    val iv: String = "",
    val ct: String = "",
)

@Serializable
data class GroupKeySignalPacket(
    val kind: String = "e2ee_gk",
    val v: Int = 1,
    val gid: String = "",
    val ep: Int = 1,
    val skid: String = "",
    val epk: String = "",
    val wraps: Map<String, GroupEpochWrapEntry> = emptyMap(),
    val kwraps: Map<String, GroupEpochWrapEntry>? = null,
    val sig: String = "",
    val ts: Long = 0L,
)

@Serializable
data class CallInvitePayload(
    val v: Int = 1,
    val callId: String = "",
    val mode: String = "voice",
    val state: String = "ringing",
    val durationSec: Int? = null,
    val ts: Long = 0L,
)

@Serializable
data class GroupCallInvitePayload(
    val v: Int = 1,
    val callId: String = "",
    val groupId: String = "",
    val groupName: String = "",
    val mode: String = "voice",
    val hostId: String = "",
    val hostName: String = "",
    val state: String = "active",
    val durationSec: Int? = null,
    val ts: Long = 0L,
)

@Serializable
data class SdpPayload(
    val type: String = "offer",
    val sdp: String = "",
)

@Serializable
data class CallSignalEnvelope(
    val callId: String = "",
    val type: String = "",
    val deviceSessionId: String? = null,
    val mode: String? = null,
    val sdp: SdpPayload? = null,
    val cameraOff: Boolean? = null,
    val ts: Long = 0L,
)

@Serializable
data class GroupSignalEnvelope(
    val callId: String = "",
    val groupId: String = "",
    val fromId: String = "",
    val fromName: String = "",
    val fromUsername: String = "",
    val fromAvatarUrl: String? = null,
    val fromAvatarColor: String = "black",
    val toId: String = "*",
    val type: String = "",
    val deviceSessionId: String? = null,
    val joinSeq: Long = 0L,
    val durationSec: Int? = null,
    val sdp: SdpPayload? = null,
    val cameraOff: Boolean? = null,
    val screenSharing: Boolean? = null,
    val ts: Long = 0L,
)

@Serializable
data class LinkedWebDevice(
    val id: String = "",
    val browserName: String = "Chrome",
    val osName: String = "",
    val deviceLabel: String = "Chrome JaText",
    val createdAt: Long = 0L,
    val lastActiveAt: Long = 0L,
)

@Serializable
data class ListLinkedDevicesResponse(
    val devices: List<LinkedWebDevice> = emptyList(),
    val maxDevices: Int = 5,
)

@Serializable
data class ClaimDeviceLinkResponse(
    val pairingId: String = "",
    val browserName: String = "Chrome",
    val osName: String = "",
    val webDhPubB64: String = "",
)

@Serializable
data class DeviceLinkStatusResponse(
    val status: String = "syncing",
    val browserName: String = "Chrome",
    val osName: String = "",
    val linkedDeviceId: String? = null,
)

@Serializable
data class PlainDeviceLinkBundle(
    val v: Int = 1,
    val userId: String = "",
    val vault: E2EEVaultContents,
    val outgoingBubbleStyle: String = "default",
    val wallpapers: Map<String, String> = emptyMap(),
)

@Serializable
data class SealedDeviceLinkBundle(
    val v: Int = 1,
    val userId: String = "",
    val epk: String = "",
    val iv: String = "",
    val ct: String = "",
)

@Serializable
data class ScheduledMessageItem(
    val id: String = "",
    val senderId: String = "",
    val targetKind: String = "dm",
    val targetId: String = "",
    val body: String = "",
    val attachmentUrl: String? = null,
    val attachmentName: String? = null,
    val attachmentType: String? = null,
    val replyToId: String? = null,
    val scheduledAt: Long = 0L,
    val createdAt: Long = 0L,
)

@Serializable
data class ListScheduledMessagesResponse(
    val scheduled: List<ScheduledMessageItem> = emptyList(),
    val items: List<ScheduledMessageItem> = emptyList(),
) {
    val resolvedItems: List<ScheduledMessageItem>
        get() = scheduled.ifEmpty { items }
}

@Serializable
data class ScheduleMessageResponse(
    val scheduled: ScheduledMessageItem? = null,
    val item: ScheduledMessageItem = ScheduledMessageItem(),
) {
    val resolvedItem: ScheduledMessageItem
        get() = scheduled ?: item
}

@Serializable
data class SoundboardClip(
    val id: String = "",
    val name: String = "",
    val audioUrl: String = "",
    val durationMs: Int = 0,
    val byteSize: Int = 0,
    val createdAt: Long = 0L,
)

@Serializable
data class ListSoundboardsResponse(
    val soundboards: List<SoundboardClip> = emptyList(),
)

@Serializable
data class CreateSoundboardResponse(
    val clip: SoundboardClip = SoundboardClip(),
)

@Serializable
data class ChatFolderSpec(
    val id: String = "",
    val name: String = "",
    val threadIds: List<String> = emptyList(),
)

@Serializable
data class ChatOrganizationSpec(
    val pinnedIds: List<String> = emptyList(),
    val customOrder: List<String> = listOf("__jatext_community__"),
    val folders: List<ChatFolderSpec> = emptyList(),
)

@Serializable
data class ChatOrganizationResponse(
    val ok: Boolean = true,
    val chatOrganization: ChatOrganizationSpec = ChatOrganizationSpec(),
)

@Serializable
data class PasskeySummary(
    val credentialId: String = "",
    val label: String = "Passkey",
    val createdAt: Long = 0L,
    val lastUsedAt: Long? = null,
)

@Serializable
data class SecuritySettingsResponse(
    val totpEnabled: Boolean = false,
    val backupCodesRemaining: Int = 0,
    val passkeys: List<PasskeySummary> = emptyList(),
)

@Serializable
data class BeginTotpSetupResponse(
    val secret: String = "",
    val otpauthUrl: String = "",
)

@Serializable
data class ConfirmTotpSetupResponse(
    val ok: Boolean = false,
    val totpEnabled: Boolean = false,
    val backupCodes: List<String> = emptyList(),
)

@Serializable
data class BlockedUsersResponse(
    val users: List<JaUser> = emptyList(),
)

@Serializable
data class ClientPinnedMessage(
    val id: String = "",
    val senderName: String = "",
    val preview: String = "",
    val pinnedAt: Long = 0L,
)

@Serializable
data class StatusSegmentItem(
    val id: String = "",
    val userId: String = "",
    val mediaUrl: String = "",
    val mediaType: String = "text",
    val caption: String = "",
    val bgColor: String = "#0f766e",
    val audioUrl: String = "",
    val audioTitle: String = "",
    val audioDurationMs: Int = 0,
    val mediaSource: String = "camera_roll",
    val privacyType: String = "MY_CONTACTS",
    val groupId: String? = null,
    val mentionedUserIds: List<String> = emptyList(),
    val viewed: Boolean = false,
    val liked: Boolean = false,
    val viewCount: Int = 0,
    val likeCount: Int = 0,
    val createdAt: Long = 0L,
    val expiresAt: Long = 0L,
)

@Serializable
data class MyStatusPayload(
    val userId: String = "",
    val displayName: String = "",
    val username: String = "",
    val avatarColor: String = "purple",
    val avatarUrl: String? = null,
    val segments: List<StatusSegmentItem> = emptyList(),
    val latestAt: Long = 0L,
)

@Serializable
data class ContactStatusStack(
    val userId: String = "",
    val displayName: String = "",
    val username: String = "",
    val avatarColor: String = "purple",
    val avatarUrl: String? = null,
    val segments: List<StatusSegmentItem> = emptyList(),
    val unreadCount: Int = 0,
    val allViewed: Boolean = true,
    val latestAt: Long = 0L,
)

@Serializable
data class StatusPrivacyDefaultState(
    val privacyType: String = "MY_CONTACTS",
    val excludedIds: List<String> = emptyList(),
    val includedIds: List<String> = emptyList(),
    val groupId: String = "",
)

@Serializable
data class BroadcastChannelSummary(
    val id: String = "",
    val name: String = "",
    val handle: String = "",
    val description: String = "",
    val avatarColor: String = "purple",
    val avatarUrl: String? = null,
    val verified: Boolean = false,
    val category: String = "Most Active",
    val isPremium: Boolean = false,
    val monthlyPriceLabel: String = "",
    val followerCount: Int = 0,
    val postCount: Int = 0,
    val latestSnippet: String = "",
    val latestMediaType: String = "text",
    val latestPostAt: Long = 0L,
    val createdAt: Long = 0L,
    val followed: Boolean = false,
    val unreadCount: Int = 0,
    val isOwner: Boolean = false,
)

@Serializable
data class ChannelReactionSummary(
    val emoji: String = "",
    val count: Int = 0,
)

@Serializable
data class ChannelBroadcastPost(
    val id: String = "",
    val channelId: String = "",
    val body: String = "",
    val mediaUrl: String = "",
    val mediaType: String = "text",
    val reactions: List<ChannelReactionSummary> = emptyList(),
    val myEmoji: String = "",
    val createdAt: Long = 0L,
)

@Serializable
data class UpdatesBundlePayload(
    val myStatus: MyStatusPayload = MyStatusPayload(),
    val contactStacks: List<ContactStatusStack> = emptyList(),
    val groupExclusiveStacks: Map<String, List<ContactStatusStack>> = emptyMap(),
    val privacyDefault: StatusPrivacyDefaultState = StatusPrivacyDefaultState(),
    val followedChannels: List<BroadcastChannelSummary> = emptyList(),
    val followedChannelsCount: Int = 0,
    val directoryChannels: List<BroadcastChannelSummary> = emptyList(),
)

@Serializable
data class ChannelPostsPayload(
    val channel: BroadcastChannelSummary = BroadcastChannelSummary(),
    val posts: List<ChannelBroadcastPost> = emptyList(),
)

@Serializable
data class CreateChannelResponse(
    val id: String = "",
    val handle: String = "",
)




