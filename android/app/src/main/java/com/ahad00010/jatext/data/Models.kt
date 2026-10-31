package com.ahad00010.jatext.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

const val OFFICIAL_COMMUNITY_ID = "jatext-official-community"
const val OWNER_EMAIL = "aidilzafri2013@gmail.com"
const val OWNER_USERNAME = "imzachie"

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
    val ang: Int = 45,
    val int: Int = 60,
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
)

@Serializable
data class FriendActivity(
    val userId: String = "",
    val status: String = "offline",
    val customStatus: String = "",
    val isTyping: Boolean = false,
)

@Serializable
data class FriendRequest(
    val id: String = "",
    val from: JaUser = JaUser(),
    val to: JaUser = JaUser(),
    val status: String = "pending",
    val createdAt: Long = 0L,
)

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
)

@Serializable
data class ForwardedMessageContext(
    val v: Int = 1,
    val sourceKind: String = "dm",
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
    val isStickerFavorite: Boolean? = false,
    val deliveryStatus: String? = "sent",
    val editedAt: Long? = null,
    val createdAt: Long = 0L,
    val replyTo: ReplySummary? = null,
    val forwardedFrom: String? = null,
    val forwardedContext: ForwardedMessageContext? = null,
    val unsentAt: Long? = null,
    val reactions: List<MessageReaction> = emptyList(),
    val e2ee: MessageE2EEProof? = null,
    val encryptedAttachmentJson: String? = null,
)

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
)

@Serializable
data class GroupSummary(
    val id: String = "",
    val name: String = "",
    val avatarUrl: String? = null,
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
)

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
    val role: String = "member",
    val muted: Boolean = false,
)

@Serializable
data class GroupDetails(
    val id: String = "",
    val name: String = "",
    val avatarUrl: String? = null,
    val ownerId: String = "",
    val role: String = "member",
    val members: List<GroupMember> = emptyList(),
)

@Serializable
data class GroupMessage(
    val id: String = "",
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
    val hasRemoteE2EEVault: Boolean = false,
    val remoteVaultKeyId: String? = null,
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
data class SyncResponse(
    val serverTime: Long = 0L,
    val me: JaUser? = null,
    val social: SyncSocialPayload? = null,
    val changedDmMessages: List<ChatMessage>? = null,
    val changedGroupMessages: List<GroupMessage>? = null,
    val changedCommunityMessages: List<CommunityMessage>? = null,
    val groups: List<GroupSummary>? = null,
    val groupTypingUsers: List<ChatTypingUser> = emptyList(),
    val communityTypingUsers: List<ChatTypingUser> = emptyList(),
    val refreshedToken: String? = null,
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
    val title: String? = null,
    val description: String? = null,
    val image: String? = null,
    val siteName: String? = null,
    val domain: String? = null,
)

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
)

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
