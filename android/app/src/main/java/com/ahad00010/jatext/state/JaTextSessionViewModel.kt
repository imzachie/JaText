package com.ahad00010.jatext.state

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.PowerManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ahad00010.jatext.BuildConfig
import com.ahad00010.jatext.JaTextE2EEDecryptor
import com.ahad00010.jatext.JaTextSoundManager
import com.ahad00010.jatext.MainActivity
import com.ahad00010.jatext.NativeRuntimeBridge
import com.ahad00010.jatext.auth.GoogleNativeSignIn
import com.ahad00010.jatext.auth.GoogleSignInCancelledException
import com.ahad00010.jatext.auth.PasskeyCancelledException
import com.ahad00010.jatext.auth.PasskeyManagerHelper
import com.ahad00010.jatext.crypto.JaTextCryptoEngine
import com.ahad00010.jatext.data.AccountSlot
import com.ahad00010.jatext.data.ApkVersionManifest
import com.ahad00010.jatext.data.BeginTotpSetupResponse
import com.ahad00010.jatext.data.BlockedUsersResponse
import com.ahad00010.jatext.data.BootstrapResponse
import com.ahad00010.jatext.data.CallHistoryEntry
import com.ahad00010.jatext.data.ChatFolderSpec
import com.ahad00010.jatext.data.ChatMessage
import com.ahad00010.jatext.data.ChatOrganizationResponse
import com.ahad00010.jatext.data.ChatOrganizationSpec
import com.ahad00010.jatext.data.ChatPreview
import com.ahad00010.jatext.data.ChatTypingUser
import com.ahad00010.jatext.data.ClaimDeviceLinkResponse
import com.ahad00010.jatext.data.ClientPinnedMessage
import com.ahad00010.jatext.data.CommunityMessage
import com.ahad00010.jatext.data.CommunityPermissions
import com.ahad00010.jatext.data.CommunityUser
import com.ahad00010.jatext.data.ConfirmTotpSetupResponse
import com.ahad00010.jatext.data.CreateSoundboardResponse
import com.ahad00010.jatext.data.CreateStatusPostResponse
import com.ahad00010.jatext.data.DeviceLinkStatusResponse
import com.ahad00010.jatext.data.E2EEPlainPayload
import com.ahad00010.jatext.data.EncryptedBlobDescriptor
import com.ahad00010.jatext.data.EncryptedStickerDescriptor
import com.ahad00010.jatext.data.ExploreCommunitySummary
import com.ahad00010.jatext.data.ForwardedMessageContext
import com.ahad00010.jatext.data.FriendActivity
import com.ahad00010.jatext.data.FriendRequest
import com.ahad00010.jatext.data.GroupDetails
import com.ahad00010.jatext.data.GroupMessage
import com.ahad00010.jatext.data.GroupReadReceipt
import com.ahad00010.jatext.data.GroupSeenReader
import com.ahad00010.jatext.data.GroupSummary
import com.ahad00010.jatext.data.JaTextJson
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.LinkedWebDevice
import com.ahad00010.jatext.data.ListLinkedDevicesResponse
import com.ahad00010.jatext.data.ListScheduledMessagesResponse
import com.ahad00010.jatext.data.ListSoundboardsResponse
import com.ahad00010.jatext.data.LocalCacheStore
import com.ahad00010.jatext.data.MessageReaction
import com.ahad00010.jatext.data.OFFICIAL_COMMUNITY_ID
import com.ahad00010.jatext.data.OwnerOverviewResult
import com.ahad00010.jatext.data.PollVoter
import com.ahad00010.jatext.data.ReplySummary
import com.ahad00010.jatext.data.ScheduleMessageResponse
import com.ahad00010.jatext.data.ScheduledMessageItem
import com.ahad00010.jatext.data.SecuritySettingsResponse
import com.ahad00010.jatext.data.SoundboardClip
import com.ahad00010.jatext.data.StatusSegmentItem
import com.ahad00010.jatext.data.StickerMedia
import com.ahad00010.jatext.data.SyncResponse
import com.ahad00010.jatext.data.SyncedThemePayload
import com.ahad00010.jatext.data.TursoApiClient
import com.ahad00010.jatext.data.TursoApiException
import com.ahad00010.jatext.data.TwoFactorRequiredException
import com.ahad00010.jatext.data.UpdatesBundlePayload
import com.ahad00010.jatext.data.UserSocialLink
import com.ahad00010.jatext.data.UserWebsiteLink
import com.ahad00010.jatext.data.ViewOnceCodec
import com.ahad00010.jatext.data.ViewOnceEnvelopePayload
import com.ahad00010.jatext.data.ViewOnceMediaPayload
import com.ahad00010.jatext.ui.theme.JaTextThemeConfig
import com.ahad00010.jatext.ui.theme.JaTextThemeManager
import com.ahad00010.jatext.webrtc.NativeCallEngine
import com.google.firebase.messaging.FirebaseMessaging
import java.io.File
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
/**
 * The one real track in the Status music library. It lives here because both
 * the composer that stores it and the viewer that plays it need the same
 * value, and older posts referenced it as builtin:melly_mike instead.
 */
const val MELLY_MIKE_URL = "/sounds/melly-mike-young-black-and-rich.mp3"

/**
 * Largest attachment the app will read. Sending keeps the file and its
 * encrypted copy in memory at once, and the budget Android hands an app is
 * around 256 MB, so anything past this used to take the whole app down with
 * an out of memory error instead of sending.
 */
private const val MAX_ATTACHMENT_BYTES = 48 * 1024 * 1024

/**
 * How many files one send may carry. Reading, encrypting and uploading them
 * all at once is what crashed the app, so the batch is both capped here and
 * sent one file at a time.
 */
private const val MAX_BULK_ATTACHMENTS = 10

data class DeletedForMeUndoBanner(
    val messageId: String,
    val nonce: Long,
    val expiresAt: Long,
)

data class SessionUiState(
    val loading: Boolean = true,
    val isAuthenticated: Boolean = false,
    val slotId: String = "slot-1",
    val addingAccountReturnSlotId: String? = null,
    val accounts: List<AccountSlot> = emptyList(),
    val me: JaUser? = null,
    val friends: List<JaUser> = emptyList(),
    val incoming: List<FriendRequest> = emptyList(),
    val outgoing: List<FriendRequest> = emptyList(),
    val blockedUserIds: List<String> = emptyList(),
    val previews: List<ChatPreview> = emptyList(),
    val friendActivities: List<FriendActivity> = emptyList(),
    val groups: List<GroupSummary> = emptyList(),
    val activeChatId: String? = null, // friendId or OFFICIAL_COMMUNITY_ID
    val activeGroupId: String? = null,
    val dmMessages: List<ChatMessage> = emptyList(),
    val dmHasMore: Boolean = false,
    val dmLoadingOlder: Boolean = false,
    val groupDetails: GroupDetails? = null,
    val groupMessages: List<GroupMessage> = emptyList(),
    val groupSeenByMessageId: Map<String, List<GroupSeenReader>> = emptyMap(),
    val groupHasMore: Boolean = false,
    val groupLoadingOlder: Boolean = false,
    val dmTypingUserIds: List<String> = emptyList(),
    val typingByGroup: Map<String, List<ChatTypingUser>> = emptyMap(),
    val groupTypingUsers: List<ChatTypingUser> = emptyList(),
    val communityMessages: List<CommunityMessage> = emptyList(),
    val communityHasMore: Boolean = false,
    val communityLoadingOlder: Boolean = false,
    val communityTypingUsers: List<ChatTypingUser> = emptyList(),
    val communityPermissions: CommunityPermissions = CommunityPermissions(),
    val communityDirectory: List<CommunityUser> = emptyList(),
    val communityMuted: Boolean = false,
    val communityUnreadCount: Int = 0,
    val stickerFavorites: List<StickerMedia> = emptyList(),
    val recentStickers: List<StickerMedia> = emptyList(),
    val emojiUsageCounts: Map<String, Int> = emptyMap(),
    val wallpaperNonce: Int = 0,
    val callHistory: List<CallHistoryEntry> = emptyList(),
    val outgoingBubbleStyle: String = "default",
    val notificationsEnabled: Boolean = true,
    val soundsEnabled: Boolean = true,
    val myKeyId: String = "",
    val myKeyFingerprint: String = "",
    val hasRemoteE2EEVault: Boolean = false,
    val isSyncingKeysAndMessages: Boolean = false,
    val lastKeySyncAt: Long = 0L,
    val themeConfig: JaTextThemeConfig = JaTextThemeConfig(),
    val availableUpdate: ApkVersionManifest? = null,
    val updateDownloading: Boolean = false,
    val updateProgress: Float = 0f,
    val showPostUpdateWelcome: Boolean = false,
    val highlightedMessageId: String? = null,
    val toastMessage: String? = null,
    val deletedForMeUndo: DeletedForMeUndoBanner? = null,
    val googleSignInInFlight: Boolean = false,
    val authError: String? = null,
    val linkedDevices: List<LinkedWebDevice> = emptyList(),
    val maxLinkedDevices: Int = 5,
    val deviceLinkPhase: String = "idle",
    val deviceLinkBrowserName: String = "",
    val deviceLinkError: String? = null,
    val disconnectingDeviceId: String? = null,
    val scheduledMessages: List<ScheduledMessageItem> = emptyList(),
    val languageCode: String = "en",
    val drafts: Map<String, String> = emptyMap(),
    val openedViewOnceIds: Set<String> = emptySet(),
    val chatOrganization: ChatOrganizationSpec = ChatOrganizationSpec(),
    val pinnedMessagesByThread: Map<String, List<ClientPinnedMessage>> = emptyMap(),
    val soundboards: List<SoundboardClip> = emptyList(),
    val pendingTwoFactorChallengeToken: String? = null,
    val pendingTwoFactorEmail: String = "",
    /** Held while the emailed code is still outstanding: no session, nothing to show. */
    val pendingEmailVerifyChallengeToken: String? = null,
    val pendingEmailVerifyMasked: String = "",
    val pendingEmailVerifyWaitSec: Int = 0,
    val securitySettings: SecuritySettingsResponse = SecuritySettingsResponse(),
    val blockedUsersList: List<JaUser> = emptyList(),
    val exploreCommunities: List<ExploreCommunitySummary> = emptyList(),
    val joiningCommunityId: String? = null,
    val sidebarTab: String = "chats",
    val exploreCommunitiesOpen: Boolean = false,
    val navPushEpoch: Int = 0,
    val updatesBundle: UpdatesBundlePayload = UpdatesBundlePayload(),
    val updatesLoading: Boolean = false,
)

class JaTextSessionViewModel(app: Application) :
    AndroidViewModel(app),
    NativeRuntimeBridge.SyncWakeListener,
    NativeRuntimeBridge.FcmTokenListener {

    private val appCtx = app.applicationContext
    val cache = LocalCacheStore(appCtx)
    private var rawStickerItemsCache: List<StickerMedia> = emptyList()

    private val _state = MutableStateFlow(
        run {
            val initSlot = cache.getActiveSlotId()
            val savedLang = cache.getLanguageCode()
            com.ahad00010.jatext.data.JaTextI18n.setLanguage(appCtx, savedLang)
            SessionUiState(
                slotId = initSlot,
                accounts = cache.getAccounts(),
                notificationsEnabled = cache.isNotificationsEnabled(),
                soundsEnabled = cache.isSoundsEnabled(),
                emojiUsageCounts = cache.getEmojiUsageCounts(initSlot),
                languageCode = savedLang,
                drafts = cache.getDrafts(initSlot),
                openedViewOnceIds = cache.getOpenedViewOnceIds(initSlot),
                chatOrganization = normalizeChatOrganization(cache.getChatOrganization(initSlot)),
                pinnedMessagesByThread = cache.getPinnedMessagesMap(initSlot),
                soundboards = cache.getSoundboards(initSlot),
            )
        }
    )
    val state: StateFlow<SessionUiState> = _state.asStateFlow()

    val callEngine = NativeCallEngine(
        appContext = appCtx,
        sendDmWireSignal = { receiverId, plainBody, silent ->
            sendInternalDmSignal(receiverId, plainBody, silent)
        },
        sendGroupWireSignal = { groupId, plainBody, silent ->
            sendInternalGroupSignal(groupId, plainBody, silent)
        },
        recordCallHistory = { peer, grp, mode, dir, status, dur ->
            val entry = CallHistoryEntry(
                id = "${peer?.id ?: grp?.id ?: "call"}-${System.currentTimeMillis() / 5000}",
                peerId = peer?.id,
                groupId = grp?.id,
                title = peer?.displayName?.ifBlank { peer.username } ?: grp?.name ?: "JaText Call",
                subtitle = if (grp != null) "Group call" else "@${peer?.username.orEmpty()}",
                avatarUrl = peer?.avatarUrl ?: grp?.avatarUrl,
                avatarColor = peer?.avatarColor ?: "purple",
                mode = mode,
                direction = dir,
                status = status,
                durationSec = dur,
                timestamp = System.currentTimeMillis(),
            )
            cache.upsertCallHistory(_state.value.slotId, entry)
            _state.update { it.copy(callHistory = cache.getCallHistory(it.slotId)) }
        },
        requestRecentCallSignals = { peerId, groupId ->
            fetchRecentCallSignalsNow(peerId, groupId)
        }
    )

    private var sinceTs: Long = 0L
    private var lastActivityBurstAt: Long = 0L
    private var lastPresenceBeatAt: Long = 0L
    private var syncLoopJob: Job? = null
    @Volatile
    private var syncInFlight = false
    @Volatile
    private var pendingWake = false

    private var mobileOAuthPollJob: Job? = null
    private var activeMobileOAuthSessionId: String? = null
    private var mobileOAuthLaunchedAtMs: Long = 0L
    private var lastCompletedAuthToken: String? = null

    private val groupCursorRowByGroupId = java.util.concurrent.ConcurrentHashMap<String, String>()
    private val groupSeenPublishedTsByGroupId = java.util.concurrent.ConcurrentHashMap<String, Long>()

    private val locallyUnsentAtById = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val locallyHardDeletedCommIds = java.util.Collections.newSetFromMap(java.util.concurrent.ConcurrentHashMap<String, Boolean>())
    private val lastNotifiedDmTsByFriend = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val lastNotifiedGroupTsById = java.util.concurrent.ConcurrentHashMap<String, Long>()
    @Volatile
    private var deltaNotifBaselineReady = false

    private val locallyDeletedIds: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()
    private var deletedDmSnapshot: ChatMessage? = null
    private var deletedGroupSnapshot: GroupMessage? = null
    private var deletedCommunitySnapshot: CommunityMessage? = null
    private var deletedUndoThreadKind: String = ""
    private var deleteUndoJob: Job? = null

    private var lastUpdateCheckAtMs: Long = 0L
    private var pendingReadyApkFile: File? = null
    private var apkDownloadJob: kotlinx.coroutines.Job? = null
    private var scheduledFlushJob: Job? = null
    private var typingIdleJob: Job? = null
    private var activeTypingThreadKey: String? = null
    private var lastTypingSentAtMs: Long = 0L
    @Volatile
    var cachedOwnerOverview: OwnerOverviewResult? = null

    init {
        JaTextSoundManager.ensureActiveMessageChannel(appCtx)
        NativeRuntimeBridge.addSyncWakeListener(this)
        NativeRuntimeBridge.addFcmTokenListener(this)
        JaTextCryptoEngine.onKeyringSelfHealed = { healedUserId ->
            val curMe = _state.value.me
            val tok = currentAuthToken()
            if (curMe != null && curMe.id == healedUserId && !tok.isNullOrBlank()) {
                viewModelScope.launch {
                    rehydrateActiveThreadAfterKeySync(healedUserId, tok)
                }
            }
        }
        JaTextCryptoEngine.onLocalKeyringMutated = { mutatedUserId ->
            val curMe = _state.value.me
            val tok = currentAuthToken()
            if (curMe != null && curMe.id == mutatedUserId && !tok.isNullOrBlank()) {
                viewModelScope.launch {
                    JaTextCryptoEngine.syncAccountKeyringWithServer(
                        context = appCtx,
                        userId = mutatedUserId,
                        stickerItems = rawStickerItemsCache,
                        token = tok,
                        forcePush = true,
                    )
                }
            }
        }
        loadThemeForScope("global")
        bootstrapActiveSlot()
        checkApkUpdate()
        checkPostUpdateWelcome()
    }

    override fun onCleared() {
        NativeRuntimeBridge.removeSyncWakeListener(this)
        NativeRuntimeBridge.removeFcmTokenListener(this)
        super.onCleared()
    }

    override fun onSyncWake() {
        triggerImmediateSync(burst = true)
    }

    override fun onNewFcmToken(token: String) {
        val authToken = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("registerPushDevice", mapOf("token" to token), authToken)
            } catch (_: Throwable) {
            }
        }
    }

    fun showToast(msg: String?) {
        _state.update { it.copy(toastMessage = msg) }
        if (msg != null) {
            viewModelScope.launch {
                delay(2800L)
                _state.update { if (it.toastMessage == msg) it.copy(toastMessage = null) else it }
            }
        }
    }

    private fun currentAuthToken(): String? = cache.getTokenForSlot(_state.value.slotId)

    /* ==================== Startup, Offline Cache & Bootstrap ==================== */

    private fun bootstrapActiveSlot(
        targetSlotId: String = cache.getActiveSlotId(),
        initialUser: JaUser? = null,
    ) {
        syncLoopJob?.cancel()
        sinceTs = 0L
        val token = cache.getTokenForSlot(targetSlotId)
        val cachedBoot = cache.loadBootstrapCache(targetSlotId)

        if (token.isNullOrBlank()) {
            _state.update {
                it.copy(
                    loading = false,
                    isAuthenticated = false,
                    googleSignInInFlight = false,
                    slotId = targetSlotId,
                    accounts = cache.getAccounts(),
                    me = null,
                )
            }
            return
        }

        // Instant 0ms boot from SQLite local cache if available!
        if (cachedBoot != null && cachedBoot.me.id.isNotBlank()) {
            applyBootstrapState(targetSlotId, token, cachedBoot, fromCache = true)
        } else {
            _state.update {
                it.copy(
                    loading = true,
                    isAuthenticated = true,
                    googleSignInInFlight = false,
                    authError = null,
                    slotId = targetSlotId,
                    accounts = cache.getAccounts(),
                    me = initialUser ?: it.me,
                    outgoingBubbleStyle = cache.getOutgoingBubbleStyle(targetSlotId),
                    callHistory = cache.getCallHistory(targetSlotId),
                    emojiUsageCounts = cache.getEmojiUsageCounts(targetSlotId),
                )
            }
        }

        viewModelScope.launch {
            try {
                val boot = TursoApiClient.rpc<BootstrapResponse>(
                    op = "bootstrap",
                    token = token,
                    onRefreshedToken = { refreshed ->
                        cache.upsertSlotSession(targetSlotId, refreshed, _state.value.me)
                    }
                )
                val activeTok = boot.refreshedToken ?: token
                cache.upsertSlotSession(targetSlotId, activeTok, boot.me)
                if (boot.me.id.isNotBlank() && !JaTextCryptoEngine.hasLocalIdentity(appCtx, boot.me.id)) {
                    val combinedStickers = (boot.stickerFavorites + boot.recentStickers)
                        .distinctBy { "${it.key}|${it.url}" }
                    rawStickerItemsCache = combinedStickers
                    JaTextCryptoEngine.loadGroupEpochMap(appCtx, boot.me.id)
                    val peerIds = (boot.friends.map { it.id } + boot.me.id).distinct()
                    runCatching { JaTextCryptoEngine.refreshPeerBundles(peerIds, activeTok) }
                    runCatching {
                        JaTextCryptoEngine.syncAccountKeyringWithServer(
                            context = appCtx,
                            userId = boot.me.id,
                            stickerItems = combinedStickers,
                            token = activeTok,
                            forcePush = false,
                        )
                    }
                }
                applyBootstrapState(targetSlotId, activeTok, boot, fromCache = false)
                ensureE2EEPublishedAndSynced(boot.me, boot.friends, activeTok)
                refreshScheduledMessages()
                refreshUpdatesBundle(silent = true)
                registerFcmDeviceTokenIfAvailable(activeTok)
                startDeltaSyncLoop()
                val isOwner = boot.me.username.equals("imzachie", ignoreCase = true) ||
                    boot.me.email.equals("aidilzafri2013@gmail.com", ignoreCase = true)
                if (isOwner) {
                    viewModelScope.launch(Dispatchers.Default) {
                        delay(900L)
                        runCatching {
                            ownerAdminAction(mapOf("subOp" to "overview"))
                        }
                    }
                }
            } catch (e: TursoApiException) {
                if (e.statusCode == 401) {
                    cache.removeSlotSession(targetSlotId)
                    _state.update {
                        it.copy(
                            loading = false,
                            isAuthenticated = false,
                            accounts = cache.getAccounts(),
                            me = null,
                        )
                    }
                } else {
                    _state.update { it.copy(loading = false) }
                    startDeltaSyncLoop()
                }
            } catch (_: Throwable) {
                _state.update { it.copy(loading = false) }
                startDeltaSyncLoop()
            }
        }
    }

    private fun applyBootstrapState(
        slotId: String,
        token: String,
        boot: BootstrapResponse,
        fromCache: Boolean,
    ) {
        if (!fromCache) {
            sinceTs = if (boot.serverTime > 0L) boot.serverTime else System.currentTimeMillis()
            lastPresenceBeatAt = System.currentTimeMillis()
        }
        val myId = boot.me.id
        JaTextCryptoEngine.loadGroupEpochMap(appCtx, myId)
        val myIdent = if (myId.isNotBlank()) {
            JaTextCryptoEngine.ensureOrCreatePrimaryIdentity(appCtx, myId)
        } else {
            null
        }
        val fp = if (myIdent != null) {
            JaTextCryptoEngine.computeKeyFingerprint(myIdent.dhPubB64, myIdent.sigPubB64)
        } else {
            ""
        }

        loadThemeForScope(myId.ifBlank { "global" }, boot.me.syncedTheme)

        val combinedRawStickers = (boot.stickerFavorites + boot.recentStickers).distinctBy { "${it.key}|${it.url}" }
        rawStickerItemsCache = combinedRawStickers
        val syncedBubble = extractSyncedBubbleStyle(combinedRawStickers)
        if (syncedBubble != null) {
            cache.setOutgoingBubbleStyle(slotId, syncedBubble)
        }
        val cleanFavorites = boot.stickerFavorites.filterNot { JaTextCryptoEngine.isInternalSyncSticker(it) }
        val cleanRecents = boot.recentStickers.filterNot { JaTextCryptoEngine.isInternalSyncSticker(it) }

        val mergedOpenedVo = cache.getOpenedViewOnceIds(slotId) + boot.openedViewOnceIds
        cache.saveOpenedViewOnceIds(slotId, mergedOpenedVo)
        val effectiveOrg = if (
            boot.chatOrganization.pinnedIds.isNotEmpty() ||
            boot.chatOrganization.folders.isNotEmpty() ||
            boot.chatOrganization.customOrder.size > 1
        ) {
            normalizeChatOrganization(boot.chatOrganization).also { cache.saveChatOrganization(slotId, it) }
        } else {
            normalizeChatOrganization(cache.getChatOrganization(slotId))
        }
        val effectiveSoundboards = if (boot.soundboards.isNotEmpty() || !fromCache) {
            boot.soundboards.also { cache.saveSoundboards(slotId, it) }
        } else {
            cache.getSoundboards(slotId)
        }

        val existingPreviewByFriend = _state.value.previews.associateBy { it.friendId }
        val initialPreviews = boot.previews.map { p ->
            val fastDec = if (myId.isNotBlank()) {
                JaTextCryptoEngine.decryptPreviewTextLocalFast(
                    context = appCtx,
                    myUserId = myId,
                    peerOrGroupId = p.friendId,
                    senderId = p.senderId,
                    rawPreview = p.body,
                    isGroup = false,
                )
            } else null
            val resolvedText = when {
                fastDec != null -> if (ViewOnceCodec.isViewOnceBody(fastDec)) "View once" else fastDec
                else -> {
                    val existing = existingPreviewByFriend[p.friendId]
                    if (
                        existing != null &&
                        existing.createdAt == p.createdAt &&
                        existing.body.isNotBlank() &&
                        !JaTextCryptoEngine.isRawWireOrCorruptedPreview(existing.body)
                    ) {
                        existing.body
                    } else {
                        val cachedLatest = cache.loadDmMessagesCache(slotId, p.friendId)
                            ?.lastOrNull {
                                it.unsentAt == null &&
                                    it.createdAt == p.createdAt &&
                                    !JaTextCryptoEngine.isRawWireOrCorruptedPreview(it.body)
                            }
                        if (cachedLatest != null) {
                            when {
                                ViewOnceCodec.isViewOnceBody(cachedLatest.body) -> "View once"
                                cachedLatest.attachmentType == "sticker" || cachedLatest.stickerKey != null -> "Sent a sticker"
                                cachedLatest.attachmentType?.startsWith("audio/") == true -> "Voice message"
                                cachedLatest.attachmentType?.startsWith("image/") == true -> "Photo"
                                cachedLatest.attachmentType?.startsWith("video/") == true -> "Video"
                                else -> JaTextCryptoEngine.formatPreviewPlainText(cachedLatest.body)
                            }
                        } else {
                            ""
                        }
                    }
                }
            }
            p.copy(body = resolvedText)
        }.sortedByDescending { it.createdAt }

        val existingGroupById = _state.value.groups.associateBy { it.id }
        val initialGroups = boot.groups.map { g ->
            val fastDec = if (myId.isNotBlank()) {
                JaTextCryptoEngine.decryptPreviewTextLocalFast(
                    context = appCtx,
                    myUserId = myId,
                    peerOrGroupId = g.id,
                    senderId = g.lastSenderId.orEmpty(),
                    rawPreview = g.lastMessage,
                    isGroup = true,
                )
            } else null
            val resolvedText = when {
                fastDec != null -> if (ViewOnceCodec.isViewOnceBody(fastDec)) "View once" else fastDec
                else -> {
                    val existing = existingGroupById[g.id]
                    if (
                        existing != null &&
                        existing.lastMessageAt == g.lastMessageAt &&
                        existing.lastMessage.isNotBlank() &&
                        !JaTextCryptoEngine.isRawWireOrCorruptedPreview(existing.lastMessage)
                    ) {
                        existing.lastMessage
                    } else {
                        val cachedLatest = cache.loadGroupMessagesCache(slotId, g.id)
                            ?.lastOrNull {
                                it.unsentAt == null &&
                                    it.createdAt == g.lastMessageAt &&
                                    !JaTextCryptoEngine.isRawWireOrCorruptedPreview(it.body)
                            }
                        if (cachedLatest != null) {
                            when {
                                ViewOnceCodec.isViewOnceBody(cachedLatest.body) -> "View once"
                                cachedLatest.attachmentType == "sticker" || cachedLatest.stickerKey != null -> "Sent a sticker"
                                cachedLatest.attachmentType?.startsWith("audio/") == true -> "Voice message"
                                cachedLatest.attachmentType?.startsWith("image/") == true -> "Photo"
                                cachedLatest.attachmentType?.startsWith("video/") == true -> "Video"
                                else -> JaTextCryptoEngine.formatPreviewPlainText(cachedLatest.body)
                            }
                        } else {
                            ""
                        }
                    }
                }
            }
            g.copy(lastMessage = resolvedText)
        }.sortedByDescending { it.lastMessageAt }

        if (!fromCache) {
            cache.saveBootstrapCache(
                slotId,
                boot.copy(previews = initialPreviews, groups = initialGroups),
            )
        }

        _state.update { prev ->
            prev.copy(
                loading = false,
                isAuthenticated = true,
                slotId = slotId,
                addingAccountReturnSlotId = null,
                pendingTwoFactorChallengeToken = null,
                pendingTwoFactorEmail = "",
                pendingEmailVerifyChallengeToken = null,
                pendingEmailVerifyMasked = "",
                pendingEmailVerifyWaitSec = 0,
                accounts = cache.getAccounts(),
                me = boot.me,
                friends = boot.friends,
                incoming = boot.incoming,
                outgoing = boot.outgoing,
                blockedUserIds = boot.blockedUserIds,
                previews = initialPreviews,
                friendActivities = boot.friendActivities,
                emojiUsageCounts = cache.getEmojiUsageCounts(slotId),
                drafts = cache.getDrafts(slotId),
                openedViewOnceIds = mergedOpenedVo,
                chatOrganization = effectiveOrg,
                pinnedMessagesByThread = cache.getPinnedMessagesMap(slotId),
                soundboards = effectiveSoundboards,
                groups = initialGroups,
                exploreCommunities = boot.exploreCommunities,
                communityPermissions = boot.communityPermissions,
                communityDirectory = boot.communityDirectory,
                communityMuted = boot.communityMuted,
                communityMessages = hydrateCommunityList(boot.communityMessages),
                communityHasMore = boot.communityHasMore,
                stickerFavorites = cleanFavorites,
                recentStickers = cleanRecents,
                outgoingBubbleStyle = syncedBubble ?: cache.getOutgoingBubbleStyle(slotId),
                callHistory = cache.getCallHistory(slotId),
                myKeyId = myIdent?.keyId.orEmpty(),
                myKeyFingerprint = fp,
                hasRemoteE2EEVault = boot.hasRemoteE2EEVault || combinedRawStickers.any {
                    it.name.trim() == JaTextCryptoEngine.E2EE_VAULT_STICKER_NAME
                },
            )
        }
        syncPushSuppressionState()
        val needsAsyncDecryption = !fromCache ||
            boot.previews.any { JaTextCryptoEngine.isRawWireOrCorruptedPreview(it.body) } ||
            boot.groups.any { JaTextCryptoEngine.isRawWireOrCorruptedPreview(it.lastMessage) }
        if (needsAsyncDecryption) {
            viewModelScope.launch {
                decryptSidebarPreviewsAsync(slotId, boot, token)
            }
        }
    }

    private suspend fun decryptSidebarPreviewsAsync(
        slotId: String,
        boot: BootstrapResponse,
        token: String,
    ) {
        val myId = boot.me.id
        val rawPreviews = boot.previews
        val rawGroups = boot.groups
        if (myId.isBlank()) return
        val hydratedPreviews = rawPreviews.map { p ->
            val rawDec = JaTextCryptoEngine.decryptPreviewText(
                context = appCtx,
                myUserId = myId,
                peerOrGroupId = p.friendId,
                senderId = p.senderId,
                rawPreview = p.body,
                isGroup = false,
                token = token
            )
            val text = if (ViewOnceCodec.isViewOnceBody(rawDec)) "View once" else rawDec
            p.copy(body = text)
        }.sortedByDescending { it.createdAt }
        val hydratedGroups = rawGroups.map { g ->
            if (!g.communityKeySeed.isNullOrBlank()) {
                JaTextCryptoEngine.registerCommunitySeedEpoch(appCtx, myId, g.id, g.communityKeySeed)
            }
            val rawDec = JaTextCryptoEngine.decryptPreviewText(
                context = appCtx,
                myUserId = myId,
                peerOrGroupId = g.id,
                senderId = g.lastSenderId.orEmpty(),
                rawPreview = g.lastMessage,
                isGroup = true,
                token = token
            )
            val text = if (ViewOnceCodec.isViewOnceBody(rawDec)) "View once" else rawDec
            g.copy(lastMessage = text)
        }.sortedByDescending { it.lastMessageAt }
        JaTextCryptoEngine.savePeerBundlesToDisk(appCtx)
        lastNotifiedDmTsByFriend.clear()
        for (p in hydratedPreviews) {
            lastNotifiedDmTsByFriend[p.friendId] = p.createdAt
        }
        lastNotifiedGroupTsById.clear()
        for (g in hydratedGroups) {
            lastNotifiedGroupTsById[g.id] = g.lastMessageAt
        }
        deltaNotifBaselineReady = true
        if (_state.value.slotId == slotId && _state.value.me?.id == myId) {
            _state.update { it.copy(previews = hydratedPreviews, groups = hydratedGroups) }
        }
        cache.saveBootstrapCache(
            slotId,
            boot.copy(previews = hydratedPreviews, groups = hydratedGroups),
        )

        // If the app opened during an active/ringing incoming call (<60s old), immediately inspect recent signals!
        val nowMs = System.currentTimeMillis()
        for (p in rawPreviews) {
            if (p.senderId != myId && nowMs - p.createdAt in 0L..60_000L) {
                if (
                    p.body.contains("(__JATEXT_CALL_DM_RINGING__") ||
                    (p.body.startsWith(JaTextCryptoEngine.CALL_INVITE_PREFIX) && p.body.contains("\"state\":\"ringing\""))
                ) {
                    fetchRecentCallSignalsNow(p.friendId, null)
                }
            }
        }
        for (g in rawGroups) {
            if (g.lastSenderId != myId && nowMs - g.lastMessageAt in 0L..60_000L) {
                if (
                    g.lastMessage.contains("(__JATEXT_CALL_GRP_ACTIVE__") ||
                    (g.lastMessage.startsWith(JaTextCryptoEngine.GROUP_CALL_INVITE_PREFIX) && g.lastMessage.contains("\"state\":\"active\""))
                ) {
                    fetchRecentCallSignalsNow(null, g.id)
                }
            }
        }
    }

    private fun extractSyncedBubbleStyle(items: List<StickerMedia>): String? {
        val entry = items
            .filter { it.name.trim().startsWith(JaTextCryptoEngine.E2EE_BUBBLE_PREF_PREFIX) }
            .maxByOrNull { it.lastUsedAt ?: 0L } ?: return null
        val styleId = entry.name.trim().removePrefix(JaTextCryptoEngine.E2EE_BUBBLE_PREF_PREFIX).trim()
        return styleId.takeIf { JaTextCryptoEngine.BUBBLE_STYLE_IDS.contains(it) }
    }

    private fun syncWallpaperFromDmMessages(friendId: String, msgs: List<ChatMessage>) {
        if (friendId.isBlank() || friendId == OFFICIAL_COMMUNITY_ID || msgs.isEmpty()) return
        for (i in msgs.indices.reversed()) {
            val m = msgs[i]
            if (m.unsentAt != null) continue
            val parsed = JaTextCryptoEngine.parseWallpaperSignal(m.body, m.attachmentUrl) ?: continue
            val scopeKey = "dm:$friendId"
            val encAtt = m.encryptedAttachment
            val cipherUrl = m.attachmentUrl
            if (parsed.kind == "custom" && encAtt != null && !cipherUrl.isNullOrBlank()) {
                viewModelScope.launch(Dispatchers.IO) {
                    val decFile = JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(appCtx, cipherUrl, encAtt)
                    if (decFile != null) {
                        val fileUri = decFile.toURI().toString()
                        if (cache.getWallpaperUrl(scopeKey) != fileUri) {
                            cache.setWallpaperUrl(scopeKey, fileUri)
                            _state.update { it.copy(wallpaperNonce = it.wallpaperNonce + 1) }
                        }
                    }
                }
                return
            }
            val current = cache.getWallpaperUrl(scopeKey)
            if (current != parsed.url) {
                cache.setWallpaperUrl(scopeKey, parsed.url)
                _state.update { it.copy(wallpaperNonce = it.wallpaperNonce + 1) }
            }
            return
        }
    }

    private fun syncWallpaperFromGroupMessages(groupId: String, msgs: List<GroupMessage>) {
        if (groupId.isBlank() || msgs.isEmpty()) return
        for (i in msgs.indices.reversed()) {
            val m = msgs[i]
            if (m.unsentAt != null) continue
            val parsed = JaTextCryptoEngine.parseWallpaperSignal(m.body, m.attachmentUrl) ?: continue
            val scopeKey = "grp:$groupId"
            val encAtt = m.encryptedAttachment
            val cipherUrl = m.attachmentUrl
            if (parsed.kind == "custom" && encAtt != null && !cipherUrl.isNullOrBlank()) {
                viewModelScope.launch(Dispatchers.IO) {
                    val decFile = JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(appCtx, cipherUrl, encAtt)
                    if (decFile != null) {
                        val fileUri = decFile.toURI().toString()
                        if (cache.getWallpaperUrl(scopeKey) != fileUri) {
                            cache.setWallpaperUrl(scopeKey, fileUri)
                            _state.update { it.copy(wallpaperNonce = it.wallpaperNonce + 1) }
                        }
                    }
                }
                return
            }
            val current = cache.getWallpaperUrl(scopeKey)
            if (current != parsed.url) {
                cache.setWallpaperUrl(scopeKey, parsed.url)
                _state.update { it.copy(wallpaperNonce = it.wallpaperNonce + 1) }
            }
            return
        }
    }

    private suspend fun rehydrateActiveThreadAfterKeySync(myId: String, token: String) {
        val st = _state.value
        val activeFriend = st.activeChatId?.takeIf { it != OFFICIAL_COMMUNITY_ID }
        val activeGrp = st.activeGroupId
        if (activeFriend != null) {
            try {
                val root = TursoApiClient.rpcRaw("listMessages", mapOf("otherId" to activeFriend), token).jsonObject
                val rawList = root["messages"]?.let {
                    JaTextJson.decodeFromJsonElement(
                        kotlinx.serialization.builtins.ListSerializer(ChatMessage.serializer()),
                        it
                    )
                }.orEmpty()
                val hasMore = root["hasMore"]?.jsonPrimitive?.booleanOrNull == true
                val hydrated = JaTextCryptoEngine.hydrateDmMessages(appCtx, myId, rawList, token)
                syncWallpaperFromDmMessages(activeFriend, hydrated)
                cache.saveDmMessagesCache(st.slotId, activeFriend, hydrated)
                if (_state.value.activeChatId == activeFriend) {
                    _state.update { it.copy(dmMessages = hydrated, dmHasMore = hasMore) }
                }
            } catch (_: Throwable) {
            }
        } else if (activeGrp != null) {
            try {
                val msgRoot = TursoApiClient.rpcRaw("listGroupMessages", mapOf("groupId" to activeGrp), token).jsonObject
                val rawMsgs = msgRoot["messages"]?.let {
                    JaTextJson.decodeFromJsonElement(
                        kotlinx.serialization.builtins.ListSerializer(GroupMessage.serializer()),
                        it
                    )
                }.orEmpty()
                val readReceipts = msgRoot["readReceipts"]?.let {
                    runCatching {
                        JaTextJson.decodeFromJsonElement(
                            kotlinx.serialization.builtins.ListSerializer(GroupReadReceipt.serializer()),
                            it
                        )
                    }.getOrNull()
                } ?: _state.value.groupDetails?.readReceipts.orEmpty()
                val seedCandidate = _state.value.groupDetails?.communityKeySeed
                    ?: _state.value.groups.firstOrNull { it.id == activeGrp }?.communityKeySeed
                if (!seedCandidate.isNullOrBlank()) {
                    JaTextCryptoEngine.registerCommunitySeedEpoch(appCtx, myId, activeGrp, seedCandidate)
                }
                val hasMore = msgRoot["hasMore"]?.jsonPrimitive?.booleanOrNull == true
                val members = _state.value.groupDetails?.members.orEmpty()
                val outcome = JaTextCryptoEngine.hydrateGroupMessagesWithSeen(appCtx, myId, activeGrp, rawMsgs, members, token, readReceipts)
                syncWallpaperFromGroupMessages(activeGrp, outcome.messages)
                cache.saveGroupMessagesCache(st.slotId, activeGrp, outcome.messages)
                if (_state.value.activeGroupId == activeGrp) {
                    _state.update {
                        it.copy(
                            groupMessages = outcome.messages,
                            groupSeenByMessageId = outcome.seenByMessageId,
                            groupHasMore = hasMore,
                        )
                    }
                }
            } catch (_: Throwable) {
            }
        }
    }

    private suspend fun reconcileMultiDeviceKeyringAndRehydrate(
        me: JaUser,
        rawStickers: List<StickerMedia>,
        token: String,
        forcePush: Boolean = false,
        forceRehydrate: Boolean = false,
    ) {
        if (me.id.isBlank() || token.isBlank()) return
        val outcome = JaTextCryptoEngine.syncAccountKeyringWithServer(
            context = appCtx,
            userId = me.id,
            stickerItems = rawStickers,
            token = token,
            forcePush = forcePush,
        ) ?: return
        val fp = JaTextCryptoEngine.computeKeyFingerprint(
            outcome.primaryIdentity.dhPubB64,
            outcome.primaryIdentity.sigPubB64
        )
        _state.update {
            it.copy(
                myKeyId = outcome.primaryIdentity.keyId,
                myKeyFingerprint = fp,
                lastKeySyncAt = System.currentTimeMillis(),
            )
        }
        JaTextCryptoEngine.syncStateToNativePushDecryptor(
            context = appCtx,
            userId = me.id,
            token = token,
            notificationsEnabled = _state.value.notificationsEnabled,
            isDnd = me.statusPreference == "dnd",
        )
        if (outcome.changedLocal || forceRehydrate) {
            rehydrateActiveThreadAfterKeySync(me.id, token)
            try {
                val boot = TursoApiClient.rpc<BootstrapResponse>(op = "bootstrap", token = token)
                decryptSidebarPreviewsAsync(_state.value.slotId, boot, token)
            } catch (_: Throwable) {
            }
        }
    }

    private suspend fun ensureE2EEPublishedAndSynced(me: JaUser, friends: List<JaUser>, token: String) {
        if (me.id.isBlank()) return
        val identity = JaTextCryptoEngine.ensureOrCreatePrimaryIdentity(appCtx, me.id)
        JaTextCryptoEngine.ensurePrimaryIdentityPublished(identity, token)
        val peerIds = (friends.map { it.id } + me.id).distinct()
        JaTextCryptoEngine.refreshPeerBundles(peerIds, token)
        reconcileMultiDeviceKeyringAndRehydrate(me, rawStickerItemsCache, token)
        JaTextCryptoEngine.syncStateToNativePushDecryptor(
            context = appCtx,
            userId = me.id,
            token = token,
            notificationsEnabled = _state.value.notificationsEnabled,
            isDnd = me.statusPreference == "dnd",
        )
    }

    private fun registerFcmDeviceTokenIfAvailable(authToken: String) {
        viewModelScope.launch {
            val fcmToken = NativeRuntimeBridge.latestFcmToken ?: try {
                FirebaseMessaging.getInstance().token.await()
            } catch (_: Throwable) {
                null
            }
            if (!fcmToken.isNullOrBlank()) {
                NativeRuntimeBridge.latestFcmToken = fcmToken
                try {
                    TursoApiClient.rpcRaw("registerPushDevice", mapOf("token" to fcmToken), authToken)
                } catch (_: Throwable) {
                }
            }
        }
    }

    private fun syncPushSuppressionState() {
        val st = _state.value
        val suppressedDms = st.previews.filter { it.isMuted || it.isArchived }.map { it.friendId }
        val suppressedGrps = st.groups.filter { it.isSilenced || it.isArchived }.map { it.id }
        cache.syncSuppressedPushTargets(st.communityMuted, suppressedDms, suppressedGrps)
    }

    /* ==================== Adaptive Delta Sync Loop ==================== */

    fun triggerImmediateSync(burst: Boolean = true) {
        if (burst) lastActivityBurstAt = System.currentTimeMillis()
        if (syncInFlight) {
            pendingWake = true
            return
        }
        viewModelScope.launch {
            runDeltaSyncOnce()
        }
    }

    private fun startDeltaSyncLoop() {
        syncLoopJob?.cancel()
        syncLoopJob = viewModelScope.launch {
            while (true) {
                val now = System.currentTimeMillis()
                val delayMs = when {
                    callEngine.uiState.value.active -> 420L
                    now - lastActivityBurstAt < 10_000L -> 500L
                    _state.value.activeChatId != null || _state.value.activeGroupId != null -> 950L
                    else -> 1800L
                }
                delay(delayMs)
                runDeltaSyncOnce()
            }
        }
    }

    private suspend fun runDeltaSyncOnce() {
        val st = _state.value
        if (!st.isAuthenticated || sinceTs <= 0L) return
        val token = currentAuthToken() ?: return
        if (syncInFlight) {
            pendingWake = true
            return
        }
        syncInFlight = true
        try {
            val now = System.currentTimeMillis()
            val shouldBeat = now - lastPresenceBeatAt >= 25_000L
            if (shouldBeat) lastPresenceBeatAt = now
            val activeFriend = st.activeChatId?.takeIf { it != OFFICIAL_COMMUNITY_ID }
            val callUi = callEngine.uiState.value
            val syncFriend = activeFriend ?: callUi.peer?.id?.takeIf { callUi.active && !callUi.isGroup }
            val syncGroup = st.activeGroupId ?: callUi.group?.id?.takeIf { callUi.active && callUi.isGroup }

            val sync = TursoApiClient.rpc<SyncResponse>(
                op = "sync",
                args = mapOf(
                    "sinceTs" to sinceTs,
                    "activeFriendId" to syncFriend,
                    "activeGroupId" to syncGroup,
                    "includeCommunity" to true,
                    "touchPresence" to shouldBeat,
                    "includePresence" to shouldBeat,
                ),
                token = token,
                onRefreshedToken = { refreshed ->
                    cache.upsertSlotSession(st.slotId, refreshed, st.me)
                }
            )
            if (_state.value.slotId != st.slotId) return
            sinceTs = if (sync.serverTime > 0L) sync.serverTime else System.currentTimeMillis()

            val myUser = sync.me ?: _state.value.me ?: return
            if (sync.me?.syncedTheme != null && _state.value.themeConfig.syncAcrossDevices) {
                val remoteU = sync.me.syncedTheme.u ?: 0L
                if (remoteU > _state.value.themeConfig.updatedAt) {
                    applyRemoteSyncedTheme(myUser.id, sync.me.syncedTheme)
                }
            }

            if (sync.stickers != null) {
                val combinedStickers = (sync.stickers.stickerFavorites + sync.stickers.recentStickers)
                    .distinctBy { "${it.key}|${it.url}" }
                rawStickerItemsCache = combinedStickers
                val cleanFavs = sync.stickers.stickerFavorites.filterNot { JaTextCryptoEngine.isInternalSyncSticker(it) }
                val cleanRecs = sync.stickers.recentStickers.filterNot { JaTextCryptoEngine.isInternalSyncSticker(it) }
                val remoteBubble = extractSyncedBubbleStyle(combinedStickers)
                if (remoteBubble != null && remoteBubble != _state.value.outgoingBubbleStyle) {
                    cache.setOutgoingBubbleStyle(_state.value.slotId, remoteBubble)
                }
                _state.update { cur ->
                    cur.copy(
                        stickerFavorites = cleanFavs,
                        recentStickers = cleanRecs,
                        outgoingBubbleStyle = remoteBubble ?: cur.outgoingBubbleStyle,
                        hasRemoteE2EEVault = cur.hasRemoteE2EEVault || combinedStickers.any {
                            it.name.trim() == JaTextCryptoEngine.E2EE_VAULT_STICKER_NAME
                        },
                    )
                }
                reconcileMultiDeviceKeyringAndRehydrate(myUser, combinedStickers, token)
            }

            // Inspect incoming call signals (global + active thread) & pre-decrypt active DM/Group deltas!
            val seenCallDmIds = HashSet<String>()
            for (raw in sync.callDmMessages.orEmpty()) {
                if (seenCallDmIds.add(raw.id)) {
                    inspectRawDmForCallSignal(myUser, raw, token)
                }
            }
            val hydratedDmDelta = if (!sync.changedDmMessages.isNullOrEmpty()) {
                for (raw in sync.changedDmMessages) {
                    if (seenCallDmIds.add(raw.id)) {
                        inspectRawDmForCallSignal(myUser, raw, token)
                    }
                }
                if (_state.value.activeChatId == syncFriend && syncFriend != null && activeFriend == syncFriend) {
                    JaTextCryptoEngine.hydrateDmMessages(appCtx, myUser.id, sync.changedDmMessages, token)
                } else {
                    emptyList()
                }
            } else {
                emptyList()
            }

            val allKnownGroups = sync.groups ?: _state.value.groups
            val seenCallGrpIds = HashSet<String>()
            for (raw in sync.callGroupMessages.orEmpty()) {
                if (seenCallGrpIds.add(raw.id)) {
                    val gid = raw.groupId ?: syncGroup
                    val grpSummary = allKnownGroups.firstOrNull { it.id == gid }
                        ?: gid?.let { GroupSummary(id = it, name = "Group") }
                    if (grpSummary != null) {
                        inspectRawGroupForCallSignal(myUser, grpSummary, raw)
                    }
                }
            }

            var deltaGroupSeen: Map<String, List<GroupSeenReader>>? = null
            val hydratedGrpDelta = if (!sync.changedGroupMessages.isNullOrEmpty() && syncGroup != null) {
                val grpSummary = allKnownGroups.firstOrNull { it.id == syncGroup }
                if (grpSummary != null) {
                    for (raw in sync.changedGroupMessages) {
                        if (seenCallGrpIds.add(raw.id)) {
                            inspectRawGroupForCallSignal(myUser, grpSummary, raw)
                        }
                    }
                }
                if (st.activeGroupId == syncGroup) {
                    val members = _state.value.groupDetails?.members.orEmpty()
                    val outcome = JaTextCryptoEngine.hydrateGroupMessagesWithSeen(
                        appCtx,
                        myUser.id,
                        syncGroup,
                        sync.changedGroupMessages,
                        members,
                        token,
                        sync.groupReadReceipts ?: _state.value.groupDetails?.readReceipts.orEmpty(),
                    )
                    if (!outcome.myCursorMessageId.isNullOrBlank()) {
                        groupCursorRowByGroupId[syncGroup] = outcome.myCursorMessageId
                    }
                    if (outcome.seenByMessageId.isNotEmpty()) {
                        deltaGroupSeen = outcome.seenByMessageId
                    }
                    outcome.messages
                } else {
                    emptyList()
                }
            } else {
                emptyList()
            }

            val activeOpenChatId = _state.value.activeChatId
            val activeOpenGroupId = _state.value.activeGroupId
            val isDndNow = myUser.statusPreference == "dnd"
            val friendsLookup = (sync.social?.friends ?: _state.value.friends).associateBy { it.id }
            var markReadOpenFriendId: String? = null

            val hydratedPreviews = sync.social?.previews?.map { p ->
                val rawDec = JaTextCryptoEngine.decryptPreviewText(
                    appCtx, myUser.id, p.friendId, p.senderId, p.body, false, token
                )
                val text = if (ViewOnceCodec.isViewOnceBody(rawDec)) "View once" else rawDec
                val isSelf = p.friendId == myUser.id
                val isOpen = activeOpenChatId == p.friendId
                if (isOpen && !isSelf && (p.unreadCount > 0 || hydratedDmDelta.any { it.senderId == p.friendId && it.deliveryStatus != "read" })) {
                    markReadOpenFriendId = p.friendId
                }
                val prevNotifTs = lastNotifiedDmTsByFriend[p.friendId] ?: 0L
                if (p.createdAt > prevNotifTs) {
                    lastNotifiedDmTsByFriend[p.friendId] = p.createdAt
                    if (
                        deltaNotifBaselineReady &&
                        !isSelf &&
                        !isOpen &&
                        !isDndNow &&
                        !p.isMuted &&
                        !p.isArchived &&
                        p.senderId != myUser.id &&
                        !JaTextCryptoEngine.isSilentControlPayload(rawDec) &&
                        text.isNotBlank() &&
                        text != "No messages yet"
                    ) {
                        val senderUser = friendsLookup[p.friendId]
                        val senderTitle = senderUser?.displayName?.ifBlank { senderUser.username }
                            ?: "New message"
                        val extras = Bundle().apply {
                            putString("type", "dm_message")
                            putString("senderId", p.friendId)
                            putString("chatId", p.friendId)
                        }
                        JaTextE2EEDecryptor.postSystemMessageNotification(
                            appCtx,
                            "dm-${p.friendId}-${p.createdAt}",
                            senderTitle,
                            text,
                            extras,
                            true,
                        )
                    }
                }
                val effectiveUnread = if (isSelf || isOpen) 0 else p.unreadCount
                p.copy(body = text, unreadCount = effectiveUnread)
            }?.sortedByDescending { it.createdAt }

            if (markReadOpenFriendId == null && activeOpenChatId != null && activeOpenChatId != OFFICIAL_COMMUNITY_ID && activeOpenChatId != myUser.id) {
                if (hydratedDmDelta.any { it.senderId == activeOpenChatId && it.deliveryStatus != "read" }) {
                    markReadOpenFriendId = activeOpenChatId
                }
            }
            if (markReadOpenFriendId != null) {
                val fid = markReadOpenFriendId
                viewModelScope.launch {
                    runCatching {
                        TursoApiClient.rpcRaw("markMessagesRead", mapOf("friendId" to fid), token)
                    }
                }
            }

            val hydratedGroups = sync.groups?.map { g ->
                if (!g.communityKeySeed.isNullOrBlank()) {
                    JaTextCryptoEngine.registerCommunitySeedEpoch(appCtx, myUser.id, g.id, g.communityKeySeed)
                }
                val rawDec = JaTextCryptoEngine.decryptPreviewText(
                    appCtx, myUser.id, g.id, g.lastSenderId.orEmpty(), g.lastMessage, true, token
                )
                val text = if (ViewOnceCodec.isViewOnceBody(rawDec)) "View once" else rawDec
                val isOpen = activeOpenGroupId == g.id
                val prevNotifTs = lastNotifiedGroupTsById[g.id] ?: 0L
                if (g.lastMessageAt > prevNotifTs) {
                    lastNotifiedGroupTsById[g.id] = g.lastMessageAt
                    if (
                        deltaNotifBaselineReady &&
                        !isOpen &&
                        !isDndNow &&
                        !(g.isSilenced && !g.lastMentionedMe) &&
                        !g.isArchived &&
                        !g.lastSenderId.isNullOrBlank() &&
                        g.lastSenderId != myUser.id &&
                        !JaTextCryptoEngine.isSilentControlPayload(rawDec) &&
                        text.isNotBlank() &&
                        text != "No messages yet"
                    ) {
                        val senderPrefix = g.lastSenderName?.takeIf { it.isNotBlank() }?.let { "$it: " }.orEmpty()
                        val extras = Bundle().apply {
                            putString("type", "group_message")
                            putString("groupId", g.id)
                        }
                        JaTextE2EEDecryptor.postSystemMessageNotification(
                            appCtx,
                            "grp-${g.id}-${g.lastMessageAt}",
                            g.name.ifBlank { "Group" },
                            "$senderPrefix$text",
                            extras,
                            true,
                        )
                    }
                }
                val effectiveUnread = if (isOpen) 0 else g.unreadCount
                g.copy(lastMessage = text, unreadCount = effectiveUnread)
            }?.sortedByDescending { it.lastMessageAt }

            val nowSyncMs = System.currentTimeMillis()
            _state.update { prev ->
                val rawDms = if (hydratedDmDelta.isNotEmpty() && prev.activeChatId == activeFriend) {
                    mergeDmMessages(
                        prev.dmMessages.filterNot { locallyDeletedIds.contains(it.id) },
                        hydratedDmDelta.filterNot { locallyDeletedIds.contains(it.id) },
                    )
                } else {
                    prev.dmMessages
                }
                val nextDms = rawDms.map { m ->
                    val localUnsent = locallyUnsentAtById[m.id]
                    if (localUnsent != null && nowSyncMs - localUnsent < 25_000L && m.unsentAt == null) {
                        m.copy(
                            body = "",
                            attachmentUrl = null,
                            attachmentName = null,
                            attachmentType = null,
                            encryptedAttachmentJson = null,
                            unsentAt = localUnsent,
                            reactions = emptyList(),
                        )
                    } else m
                }
                val rawGrps = if (hydratedGrpDelta.isNotEmpty() && prev.activeGroupId == st.activeGroupId) {
                    mergeGroupMessages(
                        prev.groupMessages.filterNot { locallyDeletedIds.contains(it.id) },
                        hydratedGrpDelta.filterNot { locallyDeletedIds.contains(it.id) },
                    )
                } else {
                    prev.groupMessages
                }
                val nextGrps = rawGrps.map { m ->
                    val localUnsent = locallyUnsentAtById[m.id]
                    if (localUnsent != null && nowSyncMs - localUnsent < 25_000L && m.unsentAt == null) {
                        m.copy(
                            body = "",
                            attachmentUrl = null,
                            attachmentName = null,
                            attachmentType = null,
                            encryptedAttachmentJson = null,
                            unsentAt = localUnsent,
                            reactions = emptyList(),
                        )
                    } else m
                }
                val rawComm = if (!sync.changedCommunityMessages.isNullOrEmpty()) {
                    val hardDeletedIds = sync.changedCommunityMessages
                        .filter { it.deleted || it.type == "deleted" }
                        .map { it.id }
                        .toSet()
                    mergeCommunityMessages(
                        prev.communityMessages.filterNot {
                            locallyDeletedIds.contains(it.id) ||
                                locallyHardDeletedCommIds.contains(it.id) ||
                                hardDeletedIds.contains(it.id)
                        },
                        hydrateCommunityList(sync.changedCommunityMessages).filterNot { locallyDeletedIds.contains(it.id) },
                    )
                } else {
                    prev.communityMessages.filterNot { locallyHardDeletedCommIds.contains(it.id) }
                }
                val nextComm = rawComm.map { m ->
                    val localUnsent = locallyUnsentAtById[m.id]
                    if (localUnsent != null && nowSyncMs - localUnsent < 25_000L && m.unsentAt == null) {
                        m.copy(
                            body = "",
                            attachmentUrl = null,
                            attachmentName = null,
                            attachmentType = null,
                            unsentAt = localUnsent,
                            reactions = emptyList(),
                        )
                    } else m
                }

                val dmTypingSet = sync.dmTypingUserIds.toSet()
                val baseActivities = sync.social?.friendActivities ?: prev.friendActivities
                val nextActivities = baseActivities.map { act ->
                    val liveTyping = dmTypingSet.contains(act.userId)
                    if (act.isTyping != liveTyping) act.copy(isTyping = liveTyping) else act
                }
                val activeGrpTyping = if (syncGroup != null) {
                    sync.typingByGroup[syncGroup] ?: sync.groupTypingUsers
                } else {
                    sync.groupTypingUsers
                }

                val nextGroupDetails = if (
                    syncGroup != null &&
                    prev.groupDetails?.id == syncGroup &&
                    sync.groupReadReceipts != null
                ) {
                    prev.groupDetails.copy(readReceipts = sync.groupReadReceipts)
                } else {
                    prev.groupDetails
                }
                val recomputedSeen = if (syncGroup != null && prev.activeGroupId == syncGroup) {
                    JaTextCryptoEngine.recomputeGroupSeenMap(
                        groupId = syncGroup,
                        myUserId = myUser.id,
                        visibleMessages = nextGrps,
                        members = nextGroupDetails?.members.orEmpty(),
                        readReceipts = sync.groupReadReceipts ?: nextGroupDetails?.readReceipts.orEmpty(),
                    )
                } else {
                    deltaGroupSeen ?: prev.groupSeenByMessageId
                }

                prev.copy(
                    me = sync.me ?: prev.me,
                    friends = sync.social?.friends ?: prev.friends,
                    incoming = sync.social?.incoming ?: prev.incoming,
                    outgoing = sync.social?.outgoing ?: prev.outgoing,
                    blockedUserIds = sync.social?.blockedUserIds ?: prev.blockedUserIds,
                    previews = hydratedPreviews ?: prev.previews,
                    friendActivities = nextActivities,
                    groups = hydratedGroups ?: prev.groups,
                    exploreCommunities = sync.exploreCommunities ?: prev.exploreCommunities,
                    groupDetails = nextGroupDetails,
                    dmMessages = nextDms,
                    groupMessages = nextGrps,
                    groupSeenByMessageId = recomputedSeen,
                    communityMessages = nextComm,
                    dmTypingUserIds = sync.dmTypingUserIds,
                    typingByGroup = sync.typingByGroup,
                    groupTypingUsers = activeGrpTyping,
                    communityTypingUsers = sync.communityTypingUsers,
                )
            }
            if (hydratedPreviews != null || hydratedGroups != null || sync.exploreCommunities != null) {
                JaTextCryptoEngine.savePeerBundlesToDisk(appCtx)
                cache.loadBootstrapCache(st.slotId)?.let { cached ->
                    cache.saveBootstrapCache(
                        st.slotId,
                        cached.copy(
                            previews = _state.value.previews,
                            groups = _state.value.groups,
                            exploreCommunities = _state.value.exploreCommunities,
                        ),
                    )
                }
            }
            if (hydratedDmDelta.isNotEmpty() && activeFriend != null && _state.value.activeChatId == activeFriend) {
                syncWallpaperFromDmMessages(activeFriend, _state.value.dmMessages)
                cache.saveDmMessagesCache(st.slotId, activeFriend, _state.value.dmMessages)
            }
            if (st.activeGroupId != null && _state.value.activeGroupId == st.activeGroupId) {
                val activeGid = st.activeGroupId
                if (hydratedGrpDelta.isNotEmpty()) {
                    syncWallpaperFromGroupMessages(activeGid, _state.value.groupMessages)
                    cache.saveGroupMessagesCache(st.slotId, activeGid, _state.value.groupMessages)
                }
                val latestIncomingVisible = _state.value.groupMessages.lastOrNull {
                    it.unsentAt == null && !it.id.startsWith("opt-") && it.senderId != myUser.id
                }
                val alreadyPub = groupSeenPublishedTsByGroupId[activeGid] ?: 0L
                if (latestIncomingVisible != null && latestIncomingVisible.createdAt > alreadyPub) {
                    viewModelScope.launch {
                        runCatching {
                            TursoApiClient.rpcRaw(
                                "manageGroup",
                                mapOf("groupId" to activeGid, "subOp" to "setUserPrefs", "markRead" to true),
                                token
                            )
                        }
                    }
                    publishGroupSeenCursorAsync(
                        groupId = activeGid,
                        latestMsgId = latestIncomingVisible.id,
                        latestMsgTs = latestIncomingVisible.createdAt,
                        memberIds = _state.value.groupDetails?.members?.map { it.id }.orEmpty(),
                        existingCursorMsgId = groupCursorRowByGroupId[activeGid],
                    )
                }
            }
            syncPushSuppressionState()
        } catch (_: Throwable) {
        } finally {
            syncInFlight = false
            if (pendingWake) {
                pendingWake = false
                viewModelScope.launch {
                    delay(20L)
                    runDeltaSyncOnce()
                }
            }
        }
    }

    private fun fetchRecentCallSignalsNow(peerId: String?, groupId: String?) {
        viewModelScope.launch(Dispatchers.IO) {
            val me = _state.value.me ?: return@launch
            val token = currentAuthToken() ?: return@launch
            val cutoff = System.currentTimeMillis() - 90_000L
            try {
                if (!peerId.isNullOrBlank()) {
                    val root = TursoApiClient.rpcRaw(
                        op = "listMessages",
                        args = mapOf("otherId" to peerId, "limit" to 25),
                        token = token,
                    ).jsonObject
                    val rows = root["messages"]?.let {
                        JaTextJson.decodeFromJsonElement(
                            kotlinx.serialization.builtins.ListSerializer(ChatMessage.serializer()),
                            it,
                        )
                    }.orEmpty()
                    for (row in rows.sortedBy { it.createdAt }) {
                        if (row.createdAt >= cutoff) {
                            inspectRawDmForCallSignal(me, row, token)
                        }
                    }
                }
                if (!groupId.isNullOrBlank()) {
                    val grp = _state.value.groups.firstOrNull { it.id == groupId }
                        ?: GroupSummary(id = groupId, name = "Group")
                    val root = TursoApiClient.rpcRaw(
                        op = "listGroupMessages",
                        args = mapOf("groupId" to groupId, "limit" to 25),
                        token = token,
                    ).jsonObject
                    val rows = root["messages"]?.let {
                        JaTextJson.decodeFromJsonElement(
                            kotlinx.serialization.builtins.ListSerializer(GroupMessage.serializer()),
                            it,
                        )
                    }.orEmpty()
                    for (row in rows.sortedBy { it.createdAt }) {
                        if (row.createdAt >= cutoff) {
                            inspectRawGroupForCallSignal(me, grp, row)
                        }
                    }
                }
            } catch (_: Throwable) {
            }
        }
    }

    private suspend fun inspectRawDmForCallSignal(me: JaUser, msg: ChatMessage, token: String) {
        if (System.currentTimeMillis() - msg.createdAt > 95_000L) return
        val peerId = if (msg.senderId == me.id) msg.receiverId else msg.senderId
        val peer = _state.value.friends.firstOrNull { it.id == peerId } ?: JaUser(id = peerId, displayName = "Contact")
        val raw = msg.rawWireBody ?: msg.body
        val dec = if (JaTextCryptoEngine.isEncryptedWireBody(raw)) {
            JaTextCryptoEngine.decryptDmWire(appCtx, me.id, msg.id, msg.senderId, msg.receiverId, raw, token)
        } else {
            null
        }
        val plain = when {
            dec != null -> {
                val p = dec.payload
                if (p.b.isBlank() && p.msgBlob != null && !msg.attachmentUrl.isNullOrBlank()) {
                    JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(appCtx, msg.attachmentUrl, p.msgBlob)
                        ?.readText(Charsets.UTF_8)
                } else {
                    p.b
                }
            }
            !JaTextCryptoEngine.isEncryptedWireBody(raw) -> raw
            else -> null
        } ?: return

        callEngine.inspectDmWireSignal(me, peer, msg.senderId, msg.createdAt, plain)

        // Web/Desktop attaches SDP offer/answer/renegotiate envelopes in encrypted call-offer.json / call-signal.json!
        val attUrl = msg.attachmentUrl
        val attDesc = dec?.payload?.att
        val isCallRelated =
            plain.startsWith(NativeCallEngine.CALL_INVITE_PREFIX) ||
                (plain.startsWith(NativeCallEngine.CALL_SIGNAL_PREFIX) &&
                    !plain.startsWith(NativeCallEngine.GROUP_CALL_SIGNAL_PREFIX)) ||
                attDesc?.t?.contains("jatext-call") == true ||
                attDesc?.n?.startsWith("call-") == true ||
                msg.attachmentType?.contains("jatext-call") == true
        if (!attUrl.isNullOrBlank() && isCallRelated) {
            val attFile = JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(appCtx, attUrl, attDesc)
            val attJson = attFile?.takeIf { it.exists() }?.readText(Charsets.UTF_8)?.trim()
            if (
                !attJson.isNullOrBlank() &&
                attJson.startsWith("{") &&
                attJson.contains("\"callId\"") &&
                attJson.contains("\"type\"")
            ) {
                callEngine.inspectDmWireSignal(
                    me = me,
                    peer = peer,
                    senderId = msg.senderId,
                    createdAt = msg.createdAt,
                    plainBody = "${NativeCallEngine.CALL_SIGNAL_PREFIX}$attJson",
                )
            }
        }
    }

    private suspend fun inspectRawGroupForCallSignal(me: JaUser, group: GroupSummary, msg: GroupMessage) {
        if (System.currentTimeMillis() - msg.createdAt > 95_000L) return
        val raw = msg.rawWireBody ?: msg.body
        val dec = if (JaTextCryptoEngine.isEncryptedWireBody(raw)) {
            JaTextCryptoEngine.decryptGroupWire(group.id, msg.id, msg.senderId, raw)
        } else {
            null
        }
        val plain = when {
            dec != null -> {
                val p = dec.payload
                if (p.b.isBlank() && p.msgBlob != null && !msg.attachmentUrl.isNullOrBlank()) {
                    JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(appCtx, msg.attachmentUrl, p.msgBlob)
                        ?.readText(Charsets.UTF_8)
                } else {
                    p.b
                }
            }
            !JaTextCryptoEngine.isEncryptedWireBody(raw) -> raw
            else -> null
        } ?: return

        callEngine.inspectGroupWireSignal(me, group, msg.createdAt, plain)

        val attUrl = msg.attachmentUrl
        val attDesc = dec?.payload?.att
        val isGroupCallSig =
            plain.startsWith(NativeCallEngine.GROUP_CALL_SIGNAL_PREFIX) ||
                attDesc?.t?.contains("jatext-gcall") == true ||
                attDesc?.n?.startsWith("gcall-") == true ||
                msg.attachmentType?.contains("jatext-gcall") == true
        if (!attUrl.isNullOrBlank() && isGroupCallSig) {
            val attFile = JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(appCtx, attUrl, attDesc)
            val attJson = attFile?.takeIf { it.exists() }?.readText(Charsets.UTF_8)?.trim()
            if (
                !attJson.isNullOrBlank() &&
                attJson.startsWith("{") &&
                attJson.contains("\"callId\"") &&
                attJson.contains("\"type\"")
            ) {
                callEngine.inspectGroupWireSignal(
                    me = me,
                    group = group,
                    createdAt = msg.createdAt,
                    plainBody = "${NativeCallEngine.GROUP_CALL_SIGNAL_PREFIX}$attJson",
                )
            }
        }
    }

    /* ==================== Auth & In-App Google Sign-In ==================== */

    suspend fun signInEmail(email: String, password: String) {
        val slot = _state.value.slotId
        val cleanEmail = email.trim().lowercase()
        val root = TursoApiClient.rpcRaw(
            op = "signInEmail",
            args = mapOf("email" to cleanEmail, "password" to password),
        ).jsonObject
        val requiresEmailVerify = root["requiresEmailVerification"]?.jsonPrimitive?.booleanOrNull == true
        val emailChallenge = root["challengeToken"]?.jsonPrimitive?.contentOrNull
        if (requiresEmailVerify && !emailChallenge.isNullOrBlank()) {
            promptEmailVerification(
                emailChallenge,
                root["maskedEmail"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                root["retryAfterSec"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 0,
            )
            return
        }
        val requiresTwoFactor = root["requiresTwoFactor"]?.jsonPrimitive?.booleanOrNull == true
        val challengeToken = root["challengeToken"]?.jsonPrimitive?.contentOrNull
        if (requiresTwoFactor && !challengeToken.isNullOrBlank()) {
            promptTwoFactorChallenge(challengeToken, cleanEmail)
            return
        }
        val token = root["token"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Server did not return an auth token.")
        val me = JaTextJson.decodeFromJsonElement(JaUser.serializer(), root["me"]!!)
        val effectiveSlot = cache.upsertSlotSession(slot, token, me)
        bootstrapActiveSlot(effectiveSlot, initialUser = me)
    }

    fun promptTwoFactorChallenge(challengeToken: String, email: String = "") {
        mobileOAuthPollJob?.cancel()
        activeMobileOAuthSessionId = null
        _state.update {
            it.copy(
                googleSignInInFlight = false,
                authError = null,
                pendingTwoFactorChallengeToken = challengeToken.trim(),
                pendingTwoFactorEmail = email.trim(),
            )
        }
    }

    fun cancelTwoFactorChallenge() {
        _state.update {
            it.copy(
                pendingTwoFactorChallengeToken = null,
                pendingTwoFactorEmail = "",
                authError = null,
            )
        }
    }

    suspend fun verifyTwoFactorLogin(code: String) {
        val challengeToken = _state.value.pendingTwoFactorChallengeToken
            ?: throw IllegalStateException("2FA session expired. Please sign in again.")
        val slot = _state.value.slotId
        val root = TursoApiClient.rpcRaw(
            op = "verifyTwoFactorLogin",
            args = mapOf(
                "challengeToken" to challengeToken.trim(),
                "code" to code.trim(),
            ),
        ).jsonObject
        val token = root["token"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Invalid authentication code.")
        val me = JaTextJson.decodeFromJsonElement(JaUser.serializer(), root["me"]!!)
        _state.update {
            it.copy(
                pendingTwoFactorChallengeToken = null,
                pendingTwoFactorEmail = "",
                authError = null,
            )
        }
        val effectiveSlot = cache.upsertSlotSession(slot, token, me)
        bootstrapActiveSlot(effectiveSlot, initialUser = me)
    }

    /**
     * Holds an account whose emailed code has not been entered yet: no token, so the app
     * stays on this screen instead of opening onto an account nobody can reach. The
     * exchange token lives in this state and never in the session store, so force-closing
     * the app costs nothing: signing in again mints a fresh code, and the server is the
     * one that says how long the wait between two of them has to be.
     */
    fun promptEmailVerification(challengeToken: String, maskedEmail: String = "", retryAfterSec: Int = 0) {
        mobileOAuthPollJob?.cancel()
        activeMobileOAuthSessionId = null
        _state.update {
            it.copy(
                googleSignInInFlight = false,
                authError = null,
                pendingTwoFactorChallengeToken = null,
                pendingTwoFactorEmail = "",
                pendingEmailVerifyChallengeToken = challengeToken.trim(),
                pendingEmailVerifyMasked = maskedEmail.trim(),
                pendingEmailVerifyWaitSec = retryAfterSec.coerceAtLeast(0),
            )
        }
    }

    fun cancelEmailVerification() {
        _state.update {
            it.copy(
                pendingEmailVerifyChallengeToken = null,
                pendingEmailVerifyMasked = "",
                pendingEmailVerifyWaitSec = 0,
                authError = null,
            )
        }
    }

    /** The server decides how long the next request has to wait and says so in the reply. */
    suspend fun resendEmailVerificationCode() {
        val challengeToken = _state.value.pendingEmailVerifyChallengeToken
            ?: throw IllegalStateException("Please sign in again.")
        val root = TursoApiClient.rpcRaw(
            op = "sendEmailVerification",
            args = mapOf("challengeToken" to challengeToken.trim()),
        ).jsonObject
        _state.update {
            it.copy(
                authError = null,
                pendingEmailVerifyWaitSec =
                    (root["retryAfterSec"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 0).coerceAtLeast(0),
            )
        }
    }

    suspend fun verifyEmailCode(code: String) {
        val challengeToken = _state.value.pendingEmailVerifyChallengeToken
            ?: throw IllegalStateException("Please sign in again.")
        val slot = _state.value.slotId
        val clean = code.filter { it.isDigit() }
        if (clean.length != 6) {
            throw IllegalStateException("Enter the 6-digit code from the email.")
        }
        val root = TursoApiClient.rpcRaw(
            op = "verifyEmailCode",
            args = mapOf("challengeToken" to challengeToken.trim(), "code" to clean),
        ).jsonObject
        val token = root["token"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("That code did not work.")
        val me = JaTextJson.decodeFromJsonElement(JaUser.serializer(), root["me"]!!)
        _state.update {
            it.copy(
                pendingEmailVerifyChallengeToken = null,
                pendingEmailVerifyMasked = "",
                pendingEmailVerifyWaitSec = 0,
                authError = null,
            )
        }
        val effectiveSlot = cache.upsertSlotSession(slot, token, me)
        bootstrapActiveSlot(effectiveSlot, initialUser = me)
    }

    fun startPasskeySignIn(activity: Activity, emailHint: String? = null) {
        _state.update { it.copy(authError = null) }
        viewModelScope.launch {
            try {
                val (token, me) = PasskeyManagerHelper.signInWithPasskey(activity, emailHint)
                val slot = _state.value.slotId
                val effectiveSlot = cache.upsertSlotSession(slot, token, me)
                bootstrapActiveSlot(effectiveSlot, initialUser = me)
            } catch (_: PasskeyCancelledException) {
            } catch (e: Throwable) {
                _state.update {
                    it.copy(authError = e.message ?: "Passkey sign-in failed.")
                }
            }
        }
    }

    suspend fun signUpEmail(email: String, password: String) {
        val slot = _state.value.slotId
        val root = TursoApiClient.rpcRaw(
            op = "signUpEmail",
            args = mapOf("email" to email.trim().lowercase(), "password" to password),
        ).jsonObject
        // The account was made, but it is not handed over yet: onboarding, chats and
        // settings all wait behind the code that is on its way to that inbox.
        val requiresEmailVerify = root["requiresEmailVerification"]?.jsonPrimitive?.booleanOrNull == true
        val emailChallenge = root["challengeToken"]?.jsonPrimitive?.contentOrNull
        if (requiresEmailVerify && !emailChallenge.isNullOrBlank()) {
            promptEmailVerification(
                emailChallenge,
                root["maskedEmail"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                root["retryAfterSec"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 0,
            )
            return
        }
        val token = root["token"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Server did not return an auth token.")
        val me = JaTextJson.decodeFromJsonElement(JaUser.serializer(), root["me"]!!)
        val effectiveSlot = cache.upsertSlotSession(slot, token, me)
        bootstrapActiveSlot(effectiveSlot, initialUser = me)
    }

    fun clearAuthError() {
        _state.update { it.copy(authError = null) }
    }

    fun reportExternalAuthError(message: String?) {
        mobileOAuthPollJob?.cancel()
        activeMobileOAuthSessionId = null
        _state.update {
            it.copy(
                googleSignInInFlight = false,
                authError = message?.takeIf { m -> m.isNotBlank() } ?: "Google Sign-In could not complete.",
            )
        }
    }

    /**
     * Completes sign-in immediately when a Turso JWT token arrives via either:
     * - Channel A: com.ahad00010.jatext://auth?tursoToken=... deep-link intent, or
     * - Channel B: Turso mobileSession background polling.
     */
    fun completeDirectTursoTokenSignIn(token: String, initialMe: JaUser? = null) {
        val cleanToken = token.trim()
        if (cleanToken.isBlank()) return
        if (lastCompletedAuthToken == cleanToken && _state.value.isAuthenticated) return
        lastCompletedAuthToken = cleanToken
        mobileOAuthPollJob?.cancel()
        activeMobileOAuthSessionId = null
        val slot = _state.value.slotId
        val effectiveSlot = cache.upsertSlotSession(slot, cleanToken, initialMe)
        bootstrapActiveSlot(effectiveSlot, initialUser = initialMe)
    }

    /**
     * Hybrid In-App Google Sign-In:
     * 1. Uses Android Credential Manager directly if an Android OAuth 2.0 Client ID is configured.
     * 2. Otherwise (or if Play Services reports [28444] missing SHA-1), immediately opens an
     *    82%-height rounded In-App Partial Custom Tab sheet right over MainActivity backed by
     *    BOTH com.ahad00010.jatext://auth deep-link return AND Turso mobileSession polling.
     */
    fun startGoogleSignIn(activity: Activity) {
        if (_state.value.googleSignInInFlight) return
        mobileOAuthPollJob?.cancel()
        _state.update { it.copy(googleSignInInFlight = true, authError = null) }

        viewModelScope.launch {
            try {
                val serverCfg = TursoApiClient.fetchGoogleOAuthServerConfig()
                if (serverCfg == null || serverCfg.clientId.isBlank()) {
                    _state.update {
                        it.copy(
                            googleSignInInFlight = false,
                            authError = "Google Sign-In is not configured on the server yet.",
                        )
                    }
                    return@launch
                }

                val credentialIdToken = GoogleNativeSignIn.tryCredentialManagerIfConfigured(
                    activity = activity,
                    serverConfig = serverCfg,
                )
                if (!credentialIdToken.isNullOrBlank()) {
                    completeGoogleIdTokenSignIn(credentialIdToken)
                    return@launch
                }

                // Launch 1-tap In-App Partial Bottom-Sheet OAuth Tab + dual-channel return!
                val mobileSessionId = GoogleNativeSignIn.generateMobileSessionId()
                activeMobileOAuthSessionId = mobileSessionId
                mobileOAuthLaunchedAtMs = System.currentTimeMillis()
                startMobileOAuthPolling(mobileSessionId)
                GoogleNativeSignIn.launchInAppGoogleOAuthSheet(activity, mobileSessionId)
            } catch (_: GoogleSignInCancelledException) {
                _state.update { it.copy(googleSignInInFlight = false, authError = null) }
            } catch (twoFactor: TwoFactorRequiredException) {
                promptTwoFactorChallenge(twoFactor.challengeToken, twoFactor.email)
            } catch (e: Throwable) {
                _state.update {
                    it.copy(
                        googleSignInInFlight = false,
                        authError = e.message ?: "Google Sign-In failed.",
                    )
                }
            }
        }
    }

    private fun startMobileOAuthPolling(mobileSessionId: String) {
        mobileOAuthPollJob?.cancel()
        mobileOAuthPollJob = viewModelScope.launch {
            val deadline = System.currentTimeMillis() + 180_000L
            while (System.currentTimeMillis() < deadline && activeMobileOAuthSessionId == mobileSessionId) {
                delay(750L)
                val poll = TursoApiClient.pollGoogleMobileSession(mobileSessionId)
                when (poll.status) {
                    "complete" -> {
                        val tok = poll.token
                        if (!tok.isNullOrBlank()) {
                            completeDirectTursoTokenSignIn(tok, poll.me)
                            MainActivity.bringToFrontAfterAuth()
                            return@launch
                        }
                    }
                    "two_factor_required" -> {
                        val ch = poll.challengeToken
                        if (!ch.isNullOrBlank()) {
                            promptTwoFactorChallenge(ch)
                            MainActivity.bringToFrontAfterAuth()
                            return@launch
                        }
                    }
                    "error" -> {
                        reportExternalAuthError(poll.error)
                        MainActivity.bringToFrontAfterAuth()
                        return@launch
                    }
                    "expired" -> {
                        _state.update { it.copy(googleSignInInFlight = false) }
                        activeMobileOAuthSessionId = null
                        return@launch
                    }
                }
            }
            if (activeMobileOAuthSessionId == mobileSessionId) {
                activeMobileOAuthSessionId = null
                _state.update { it.copy(googleSignInInFlight = false) }
            }
        }
    }

    fun onActivityResumed() {
        checkApkUpdate(manual = false)
        // If user just granted "Install unknown apps" and we already downloaded the APK, auto-launch installer
        val readyFile = pendingReadyApkFile
        val act = MainActivity.peekActiveActivity()
        if (readyFile != null && readyFile.exists() && act != null) {
            if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O ||
                act.packageManager.canRequestPackageInstalls()
            ) {
                pendingReadyApkFile = null
                launchApkInstallerIntent(act, readyFile)
            }
        }

        val sessId = activeMobileOAuthSessionId ?: return
        val elapsed = System.currentTimeMillis() - mobileOAuthLaunchedAtMs
        if (elapsed < 1200L) return
        viewModelScope.launch {
            // Check immediately upon returning from the In-App Auth Sheet, plus one grace check
            for (attempt in 0..2) {
                if (activeMobileOAuthSessionId != sessId || _state.value.isAuthenticated) return@launch
                val poll = TursoApiClient.pollGoogleMobileSession(sessId)
                if (poll.status == "complete" && !poll.token.isNullOrBlank()) {
                    completeDirectTursoTokenSignIn(poll.token, poll.me)
                    return@launch
                }
                if (poll.status == "error") {
                    reportExternalAuthError(poll.error)
                    return@launch
                }
                delay(650L)
            }
            // User swiped down / closed the sheet without picking an account
            if (activeMobileOAuthSessionId == sessId && !_state.value.isAuthenticated) {
                mobileOAuthPollJob?.cancel()
                activeMobileOAuthSessionId = null
                _state.update { it.copy(googleSignInInFlight = false) }
            }
        }
    }

    private suspend fun completeGoogleIdTokenSignIn(idToken: String) {
        val slot = _state.value.slotId
        val (token, me) = TursoApiClient.signInWithGoogleIdToken(idToken)
        lastCompletedAuthToken = token
        val effectiveSlot = cache.upsertSlotSession(slot, token, me)
        bootstrapActiveSlot(effectiveSlot, initialUser = me)
    }

    fun switchToAccountSlot(slotId: String) {
        cache.setActiveSlotId(slotId)
        _state.update {
            it.copy(
                activeChatId = null,
                activeGroupId = null,
                addingAccountReturnSlotId = null,
                linkedDevices = emptyList(),
                deviceLinkPhase = "idle",
                deviceLinkBrowserName = "",
                deviceLinkError = null,
                disconnectingDeviceId = null,
            )
        }
        bootstrapActiveSlot(slotId)
    }

    fun startAddAnotherAccount() {
        val prevSlot = _state.value.slotId
        val newSlot = cache.createNextEmptySlotId()
        syncLoopJob?.cancel()
        cache.setActiveSlotId(newSlot)
        _state.update {
            it.copy(
                loading = false,
                isAuthenticated = false,
                slotId = newSlot,
                addingAccountReturnSlotId = prevSlot,
                me = null,
                activeChatId = null,
                activeGroupId = null,
            )
        }
    }

    fun cancelAddAnotherAccount() {
        val returnSlot = _state.value.addingAccountReturnSlotId ?: cache.getAccounts().firstOrNull()?.slotId ?: "slot-1"
        switchToAccountSlot(returnSlot)
    }

    fun signOutCurrentAccount() {
        val curSlot = _state.value.slotId
        val authToken = currentAuthToken()
        val fcm = NativeRuntimeBridge.latestFcmToken
        if (!authToken.isNullOrBlank() && !fcm.isNullOrBlank()) {
            viewModelScope.launch {
                try {
                    TursoApiClient.rpcRaw("unregisterPushDevice", mapOf("token" to fcm), authToken)
                } catch (_: Throwable) {
                }
            }
        }
        cache.removeSlotSession(curSlot)
        val nextSlot = cache.getActiveSlotId()
        bootstrapActiveSlot(nextSlot)
    }

    /* ==================== Navigation & Opening Threads (Never Marks Read Until Opened!) ==================== */

    fun setSidebarTab(tab: String) {
        _state.update { prev ->
            prev.copy(
                sidebarTab = tab,
                exploreCommunitiesOpen = if (tab != "communities") false else prev.exploreCommunitiesOpen,
            )
        }
    }

    fun openExploreCommunities() {
        _state.update { prev ->
            prev.copy(
                sidebarTab = "communities",
                exploreCommunitiesOpen = true,
                navPushEpoch = prev.navPushEpoch + 1,
            )
        }
        refreshExploreCommunities()
    }

    fun closeExploreCommunities() {
        _state.update { prev ->
            prev.copy(
                sidebarTab = "communities",
                exploreCommunitiesOpen = false,
            )
        }
    }

    fun openDmChat(friendId: String, highlightMessageId: String? = null) {
        clearActiveTypingSignal()
        val slot = _state.value.slotId
        val cached = cache.loadDmMessagesCache(slot, friendId)
            .orEmpty()
            .filterNot { JaTextCryptoEngine.isRawWireOrCorruptedPreview(it.body) }
        _state.update { prev ->
            prev.copy(
                activeChatId = friendId,
                activeGroupId = null,
                exploreCommunitiesOpen = false,
                navPushEpoch = prev.navPushEpoch + 1,
                dmMessages = cached,
                dmHasMore = false,
                highlightedMessageId = highlightMessageId,
                previews = prev.previews.map { p ->
                    if (p.friendId == friendId) p.copy(unreadCount = 0) else p
                },
            )
        }
        val token = currentAuthToken() ?: return
        val myId = _state.value.me?.id ?: return
        viewModelScope.launch {
            try {
                // Mark as read NOW because recipient explicitly opened the chat!
                launch {
                    try {
                        TursoApiClient.rpcRaw("markMessagesRead", mapOf("friendId" to friendId), token)
                    } catch (_: Throwable) {
                    }
                }
                val root = TursoApiClient.rpcRaw("listMessages", mapOf("otherId" to friendId), token).jsonObject
                val rawList = root["messages"]?.let {
                    JaTextJson.decodeFromJsonElement(
                        kotlinx.serialization.builtins.ListSerializer(ChatMessage.serializer()),
                        it
                    )
                }.orEmpty()
                val hasMore = root["hasMore"]?.jsonPrimitive?.booleanOrNull == true
                val hydrated = JaTextCryptoEngine.hydrateDmMessages(appCtx, myId, rawList, token)
                syncWallpaperFromDmMessages(friendId, hydrated)
                cache.saveDmMessagesCache(slot, friendId, hydrated)
                if (_state.value.activeChatId == friendId) {
                    _state.update { it.copy(dmMessages = hydrated, dmHasMore = hasMore) }
                }
            } catch (_: Throwable) {
            }
        }
    }

    private fun publishGroupSeenCursorAsync(
        groupId: String,
        latestMsgId: String,
        latestMsgTs: Long,
        memberIds: List<String>,
        existingCursorMsgId: String?,
    ) {
        val me = _state.value.me ?: return
        val token = currentAuthToken() ?: return
        if (latestMsgId.isBlank() || latestMsgTs <= 0L) return
        val alreadyTs = groupSeenPublishedTsByGroupId[groupId] ?: 0L
        if (latestMsgTs <= alreadyTs) return
        groupSeenPublishedTsByGroupId[groupId] = latestMsgTs
        if (!existingCursorMsgId.isNullOrBlank()) {
            groupCursorRowByGroupId[groupId] = existingCursorMsgId
        }
        viewModelScope.launch {
            try {
                val plainSig = JaTextCryptoEngine.serializeGroupSeenSignal(latestMsgId, latestMsgTs)
                val payload = E2EEPlainPayload(v = 1, b = plainSig)
                val wire = try {
                    JaTextCryptoEngine.encryptGroupMessage(appCtx, me.id, groupId, memberIds, payload, token, silentSignal = true)
                } catch (_: Throwable) {
                    plainSig
                }
                val cursorMsgId = groupCursorRowByGroupId[groupId]
                if (!cursorMsgId.isNullOrBlank()) {
                    try {
                        TursoApiClient.rpcRaw(
                            "mutateGroupMessage",
                            mapOf("messageId" to cursorMsgId, "action" to "edit", "body" to wire),
                            token
                        )
                        return@launch
                    } catch (_: Throwable) {
                        groupCursorRowByGroupId.remove(groupId)
                    }
                }
                val root = TursoApiClient.rpcRaw(
                    "sendGroupMessage",
                    mapOf("groupId" to groupId, "body" to wire),
                    token
                ).jsonObject
                val newId = root["message"]?.jsonObject?.get("id")?.jsonPrimitive?.contentOrNull
                if (!newId.isNullOrBlank()) {
                    groupCursorRowByGroupId[groupId] = newId
                }
            } catch (_: Throwable) {
            }
        }
    }

    fun openGroupChat(groupId: String, highlightMessageId: String? = null) {
        clearActiveTypingSignal()
        val slot = _state.value.slotId
        val cachedMsgs = cache.loadGroupMessagesCache(slot, groupId)
            .orEmpty()
            .filterNot { JaTextCryptoEngine.isRawWireOrCorruptedPreview(it.body) }
        val cachedDet = cache.loadGroupDetailsCache(slot, groupId)
        _state.update { prev ->
            val groupSummary = prev.groups.firstOrNull { it.id == groupId }
            val synthesizedDetails = cachedDet ?: groupSummary?.let { gs ->
                GroupDetails(
                    id = gs.id,
                    name = gs.name,
                    avatarUrl = gs.avatarUrl,
                    avatarColor = gs.avatarColor,
                    isCommunity = gs.isCommunity,
                    description = gs.description,
                    communityKeySeed = gs.communityKeySeed,
                    ownerId = gs.ownerId,
                    role = gs.role,
                )
            }
            prev.copy(
                activeGroupId = groupId,
                activeChatId = null,
                exploreCommunitiesOpen = false,
                navPushEpoch = prev.navPushEpoch + 1,
                sidebarTab = if (gsIsCommunity(groupSummary, cachedDet)) "communities" else prev.sidebarTab,
                groupDetails = synthesizedDetails,
                groupMessages = cachedMsgs,
                groupSeenByMessageId = emptyMap(),
                groupHasMore = false,
                highlightedMessageId = highlightMessageId,
                groups = prev.groups.map { g ->
                    if (g.id == groupId) g.copy(unreadCount = 0) else g
                },
            )
        }
        val token = currentAuthToken() ?: return
        val myId = _state.value.me?.id ?: return
        viewModelScope.launch {
            try {
                launch {
                    try {
                        TursoApiClient.rpcRaw(
                            "manageGroup",
                            mapOf("groupId" to groupId, "subOp" to "setUserPrefs", "markRead" to true),
                            token
                        )
                    } catch (_: Throwable) {
                    }
                }
                val detRoot = TursoApiClient.rpcRaw("getGroupDetails", mapOf("groupId" to groupId), token).jsonObject
                val details = detRoot["details"]?.let {
                    if (it is kotlinx.serialization.json.JsonNull) null
                    else JaTextJson.decodeFromJsonElement(GroupDetails.serializer(), it)
                }
                val msgRoot = TursoApiClient.rpcRaw("listGroupMessages", mapOf("groupId" to groupId), token).jsonObject
                val rawMsgs = msgRoot["messages"]?.let {
                    JaTextJson.decodeFromJsonElement(
                        kotlinx.serialization.builtins.ListSerializer(GroupMessage.serializer()),
                        it
                    )
                }.orEmpty()
                val readReceipts = msgRoot["readReceipts"]?.let {
                    runCatching {
                        JaTextJson.decodeFromJsonElement(
                            kotlinx.serialization.builtins.ListSerializer(GroupReadReceipt.serializer()),
                            it
                        )
                    }.getOrNull()
                } ?: details?.readReceipts.orEmpty()
                val hasMore = msgRoot["hasMore"]?.jsonPrimitive?.booleanOrNull == true
                val seedCandidate = details?.communityKeySeed
                    ?: _state.value.groups.firstOrNull { it.id == groupId }?.communityKeySeed
                if (!seedCandidate.isNullOrBlank()) {
                    JaTextCryptoEngine.registerCommunitySeedEpoch(appCtx, myId, groupId, seedCandidate)
                }
                val enrichedDetails = details?.copy(readReceipts = readReceipts)
                if (enrichedDetails != null) {
                    JaTextCryptoEngine.ensurePeerBundles(enrichedDetails.members.map { it.id }, token)
                    cache.saveGroupDetailsCache(slot, groupId, enrichedDetails)
                }
                val effectiveMembers = enrichedDetails?.members ?: cachedDet?.members.orEmpty()
                val outcome = JaTextCryptoEngine.hydrateGroupMessagesWithSeen(
                    appCtx,
                    myId,
                    groupId,
                    rawMsgs,
                    effectiveMembers,
                    token,
                    readReceipts,
                )
                if (!outcome.myCursorMessageId.isNullOrBlank()) {
                    groupCursorRowByGroupId[groupId] = outcome.myCursorMessageId
                }
                syncWallpaperFromGroupMessages(groupId, outcome.messages)
                cache.saveGroupMessagesCache(slot, groupId, outcome.messages)
                if (_state.value.activeGroupId == groupId) {
                    _state.update {
                        it.copy(
                            groupDetails = enrichedDetails ?: it.groupDetails,
                            groupMessages = outcome.messages,
                            groupSeenByMessageId = outcome.seenByMessageId,
                            groupHasMore = hasMore,
                        )
                    }
                    val latestVisible = outcome.messages.lastOrNull {
                        it.unsentAt == null && !it.id.startsWith("opt-") && it.senderId != myId
                    }
                    if (latestVisible != null && latestVisible.createdAt > outcome.mySeenUpToTs) {
                        publishGroupSeenCursorAsync(
                            groupId = groupId,
                            latestMsgId = latestVisible.id,
                            latestMsgTs = latestVisible.createdAt,
                            memberIds = effectiveMembers.map { it.id },
                            existingCursorMsgId = outcome.myCursorMessageId,
                        )
                    }
                }
            } catch (_: Throwable) {
            }
        }
    }

    private fun gsIsCommunity(gs: GroupSummary?, det: GroupDetails?): Boolean =
        det?.isCommunity == true || gs?.isCommunity == true

    fun openCommunityChat(highlightMessageId: String? = null) {
        clearActiveTypingSignal()
        _state.update {
            it.copy(
                activeChatId = OFFICIAL_COMMUNITY_ID,
                activeGroupId = null,
                exploreCommunitiesOpen = false,
                navPushEpoch = it.navPushEpoch + 1,
                communityUnreadCount = 0,
                highlightedMessageId = highlightMessageId,
            )
        }
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("setCommunityPrefs", mapOf("markRead" to true), token)
            } catch (_: Throwable) {
            }
        }
    }

    fun closeActiveChat() {
        clearActiveTypingSignal()
        _state.update { prev ->
            val wasCommunityGroup = prev.activeGroupId != null && (
                prev.groupDetails?.isCommunity == true ||
                    prev.groups.any { g -> g.id == prev.activeGroupId && g.isCommunity }
                )
            prev.copy(
                activeChatId = null,
                activeGroupId = null,
                highlightedMessageId = null,
                sidebarTab = if (wasCommunityGroup) "communities" else prev.sidebarTab,
            )
        }
    }

    fun loadOlderMessagesForActiveThread() {
        val st = _state.value
        val token = currentAuthToken() ?: return
        val myId = st.me?.id ?: return

        if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
            if (st.dmLoadingOlder || !st.dmHasMore) return
            val friendId = st.activeChatId
            val oldest = st.dmMessages.minOfOrNull { it.createdAt } ?: return
            _state.update { it.copy(dmLoadingOlder = true) }
            viewModelScope.launch {
                try {
                    val root = TursoApiClient.rpcRaw(
                        "listMessages",
                        mapOf("otherId" to friendId, "beforeTs" to oldest, "limit" to 120),
                        token
                    ).jsonObject
                    val rawOlder = root["messages"]?.let {
                        JaTextJson.decodeFromJsonElement(
                            kotlinx.serialization.builtins.ListSerializer(ChatMessage.serializer()),
                            it
                        )
                    }.orEmpty()
                    val hasMore = root["hasMore"]?.jsonPrimitive?.booleanOrNull == true
                    val hydrated = JaTextCryptoEngine.hydrateDmMessages(appCtx, myId, rawOlder, token)
                    _state.update { cur ->
                        cur.copy(
                            dmMessages = mergeDmMessages(hydrated, cur.dmMessages),
                            dmHasMore = hasMore,
                            dmLoadingOlder = false,
                        )
                    }
                } catch (_: Throwable) {
                    _state.update { it.copy(dmLoadingOlder = false) }
                }
            }
        } else if (st.activeGroupId != null) {
            if (st.groupLoadingOlder || !st.groupHasMore) return
            val gid = st.activeGroupId
            val oldest = st.groupMessages.minOfOrNull { it.createdAt } ?: return
            _state.update { it.copy(groupLoadingOlder = true) }
            viewModelScope.launch {
                try {
                    val root = TursoApiClient.rpcRaw(
                        "listGroupMessages",
                        mapOf("groupId" to gid, "beforeTs" to oldest, "limit" to 120),
                        token
                    ).jsonObject
                    val rawOlder = root["messages"]?.let {
                        JaTextJson.decodeFromJsonElement(
                            kotlinx.serialization.builtins.ListSerializer(GroupMessage.serializer()),
                            it
                        )
                    }.orEmpty()
                    val hasMore = root["hasMore"]?.jsonPrimitive?.booleanOrNull == true
                    val hydrated = JaTextCryptoEngine.hydrateGroupMessages(appCtx, myId, gid, rawOlder)
                    _state.update { cur ->
                        cur.copy(
                            groupMessages = mergeGroupMessages(hydrated, cur.groupMessages),
                            groupHasMore = hasMore,
                            groupLoadingOlder = false,
                        )
                    }
                } catch (_: Throwable) {
                    _state.update { it.copy(groupLoadingOlder = false) }
                }
            }
        } else if (st.activeChatId == OFFICIAL_COMMUNITY_ID) {
            if (st.communityLoadingOlder || !st.communityHasMore) return
            val oldest = st.communityMessages.minOfOrNull { it.createdAt } ?: return
            _state.update { it.copy(communityLoadingOlder = true) }
            viewModelScope.launch {
                try {
                    val root = TursoApiClient.rpcRaw(
                        "listCommunityMessages",
                        mapOf("beforeTs" to oldest, "limit" to 120),
                        token
                    ).jsonObject
                    val rawOlder = root["messages"]?.let {
                        JaTextJson.decodeFromJsonElement(
                            kotlinx.serialization.builtins.ListSerializer(CommunityMessage.serializer()),
                            it
                        )
                    }.orEmpty()
                    val hasMore = root["hasMore"]?.jsonPrimitive?.booleanOrNull == true
                    _state.update { cur ->
                        cur.copy(
                            communityMessages = mergeCommunityMessages(hydrateCommunityList(rawOlder), cur.communityMessages),
                            communityHasMore = hasMore,
                            communityLoadingOlder = false,
                        )
                    }
                } catch (_: Throwable) {
                    _state.update { it.copy(communityLoadingOlder = false) }
                }
            }
        }
    }

    /* ==================== Sending Messages, Attachments, Voice Notes & Stickers ==================== */

    fun sendChatMessage(
        text: String,
        replyTo: ReplySummary? = null,
        attachmentUri: Uri? = null,
        localVoiceFile: File? = null,
        isSpoiler: Boolean = false,
    ): Job? {
        val st = _state.value
        val me = st.me ?: return null
        val token = currentAuthToken() ?: return null
        val bubble = st.outgoingBubbleStyle
        val cleanText = text.trim()
        if (cleanText.isEmpty() && attachmentUri == null && localVoiceFile == null) return null

        // Optimistic instant bubble (zero "Decrypting message" flash!)
        val tempId = "opt-${UUID.randomUUID()}"
        val now = System.currentTimeMillis()
        val safeReplyTo = replyTo?.copy(body = ViewOnceCodec.sanitizePreview(replyTo.body))

        if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
            val receiverId = st.activeChatId
            val isSelf = receiverId == me.id
            val optMsg = ChatMessage(
                id = tempId,
                renderKey = tempId,
                senderId = me.id,
                receiverId = receiverId,
                body = cleanText,
                bubbleStyle = bubble,
                attachmentUrl = localVoiceFile?.let { Uri.fromFile(it).toString() } ?: attachmentUri?.toString(),
                attachmentName = localVoiceFile?.name ?: attachmentUri?.let { resolveDisplayName(it) },
                attachmentType = if (localVoiceFile != null) "audio/mp4" else attachmentUri?.let { resolveMime(it) },
                isSpoiler = isSpoiler,
                deliveryStatus = if (isSelf) "read" else "sent",
                createdAt = now,
                replyTo = safeReplyTo,
            )
            val previewSnippet = if (cleanText.isNotBlank()) {
                JaTextCryptoEngine.formatPreviewPlainText(cleanText)
            } else if (localVoiceFile != null) {
                "Voice message"
            } else {
                "Attachment"
            }
            lastNotifiedDmTsByFriend[receiverId] = now
            _state.update { cur ->
                val existingPreview = cur.previews.firstOrNull { it.friendId == receiverId }
                val updatedPreview = (existingPreview ?: ChatPreview(friendId = receiverId)).copy(
                    friendId = receiverId,
                    body = previewSnippet,
                    createdAt = now,
                    senderId = me.id,
                    unreadCount = 0,
                )
                val nextPreviews = (listOf(updatedPreview) + cur.previews.filterNot { it.friendId == receiverId })
                    .sortedByDescending { it.createdAt }
                cur.copy(
                    dmMessages = cur.dmMessages + optMsg,
                    previews = nextPreviews,
                )
            }

            return viewModelScope.launch {
                try {
                    var uploadedUrl: String? = null
                    var attDesc = null as com.ahad00010.jatext.data.EncryptedBlobDescriptor?
                    var plainFileName: String? = null
                    var plainMime: String? = null

                    val rawBytesAndMeta = readAttachmentBytes(attachmentUri, localVoiceFile)
                    if (rawBytesAndMeta != null) {
                        val (plainBytes, fName, fMime, cachedFile) = rawBytesAndMeta
                        plainFileName = fName
                        plainMime = fMime
                        val (ctBytes, desc) = JaTextCryptoEngine.encryptAttachmentBytes(plainBytes, fName, fMime)
                        if (cachedFile != null) {
                            JaTextCryptoEngine.seedOutgoingDecryptedMedia(desc.h, cachedFile)
                        }
                        uploadedUrl = TursoApiClient.uploadMediaBytes(
                            ctBytes,
                            "e2ee-blob.bin",
                            "application/octet-stream",
                            token
                        )
                        attDesc = desc
                    }

                    val payload = E2EEPlainPayload(
                        v = 1,
                        b = JaTextCryptoEngine.attachBubbleStyleToOutgoing(cleanText, bubble),
                        bs = bubble.takeIf { it != "default" },
                        att = attDesc,
                    )
                    val wire = JaTextCryptoEngine.encryptDmMessage(appCtx, me.id, receiverId, payload, token)
                    val finalBody = wire ?: JaTextCryptoEngine.attachBubbleStyleToOutgoing(cleanText, bubble)
                    val finalAttUrl = if (wire != null) uploadedUrl else rawBytesAndMeta?.let { (b, n, m, _) ->
                        TursoApiClient.uploadMediaBytes(b, n, m, token)
                    }

                    val args = mutableMapOf<String, Any?>(
                        "receiverId" to receiverId,
                        "body" to finalBody,
                    )
                    if (!finalAttUrl.isNullOrBlank()) {
                        args["attachmentUrl"] = finalAttUrl
                        args["attachmentName"] = if (wire != null) "encrypted.bin" else plainFileName
                        args["attachmentType"] = if (wire != null) "application/octet-stream" else plainMime
                    }
                    if (replyTo != null) args["replyToId"] = replyTo.id
                    if (isSpoiler) args["isSpoiler"] = true

                    val root = TursoApiClient.rpcRaw("sendMessage", args, token).jsonObject
                    val serverMsg = root["message"]?.let {
                        JaTextJson.decodeFromJsonElement(ChatMessage.serializer(), it)
                    }
                    if (serverMsg != null) {
                        // Keeping the optimistic key means the row is the same
                        // row, so the bubble does not animate a second time
                        // when the delivered copy replaces it.
                        val hydrated = JaTextCryptoEngine.hydrateDmMessages(appCtx, me.id, listOf(serverMsg), token)
                            .map { m -> if (m.id == serverMsg.id) m.copy(renderKey = tempId) else m }
                        _state.update { cur ->
                            val withoutOpt = cur.dmMessages.filterNot { m -> m.id == tempId }
                            cur.copy(dmMessages = mergeDmMessages(withoutOpt, hydrated))
                        }
                    }
                    triggerImmediateSync(true)
                } catch (e: Throwable) {
                    _state.update { cur -> cur.copy(dmMessages = cur.dmMessages.filterNot { m -> m.id == tempId }) }
                    showToast(e.message ?: "Failed to send message")
                }
            }
        } else if (st.activeGroupId != null) {
            val groupId = st.activeGroupId
            val optMsg = GroupMessage(
                id = tempId,
                renderKey = tempId,
                senderId = me.id,
                senderName = me.displayName,
                senderUsername = me.username,
                senderAvatarUrl = me.avatarUrl,
                senderAvatarColor = me.avatarColor,
                body = cleanText,
                bubbleStyle = bubble,
                attachmentUrl = localVoiceFile?.let { Uri.fromFile(it).toString() } ?: attachmentUri?.toString(),
                attachmentName = localVoiceFile?.name ?: attachmentUri?.let { resolveDisplayName(it) },
                attachmentType = if (localVoiceFile != null) "audio/mp4" else attachmentUri?.let { resolveMime(it) },
                isSpoiler = isSpoiler,
                createdAt = now,
                replyTo = safeReplyTo,
            )
            val grpSnippet = if (cleanText.isNotBlank()) {
                JaTextCryptoEngine.formatPreviewPlainText(cleanText)
            } else if (localVoiceFile != null) {
                "Voice message"
            } else {
                "Attachment"
            }
            lastNotifiedGroupTsById[groupId] = now
            _state.update { cur ->
                val nextGroups = cur.groups.map { g ->
                    if (g.id == groupId) {
                        g.copy(
                            lastMessage = grpSnippet,
                            lastMessageAt = now,
                            lastSenderId = me.id,
                            lastSenderName = me.displayName.ifBlank { me.username },
                            unreadCount = 0,
                        )
                    } else g
                }.sortedByDescending { it.lastMessageAt }
                cur.copy(
                    groupMessages = cur.groupMessages + optMsg,
                    groups = nextGroups,
                )
            }

            return viewModelScope.launch {
                try {
                    val memberIds = _state.value.groupDetails?.members?.map { it.id }.orEmpty()
                    var uploadedUrl: String? = null
                    var attDesc = null as com.ahad00010.jatext.data.EncryptedBlobDescriptor?
                    val rawBytesAndMeta = readAttachmentBytes(attachmentUri, localVoiceFile)
                    if (rawBytesAndMeta != null) {
                        val (plainBytes, fName, fMime, cachedFile) = rawBytesAndMeta
                        val (ctBytes, desc) = JaTextCryptoEngine.encryptAttachmentBytes(plainBytes, fName, fMime)
                        if (cachedFile != null) JaTextCryptoEngine.seedOutgoingDecryptedMedia(desc.h, cachedFile)
                        uploadedUrl = TursoApiClient.uploadMediaBytes(ctBytes, "e2ee-grp.bin", "application/octet-stream", token)
                        attDesc = desc
                    }

                    val payload = E2EEPlainPayload(
                        v = 1,
                        b = JaTextCryptoEngine.attachBubbleStyleToOutgoing(cleanText, bubble),
                        bs = bubble.takeIf { it != "default" },
                        att = attDesc,
                    )
                    val wire = JaTextCryptoEngine.encryptGroupMessage(appCtx, me.id, groupId, memberIds, payload, token)
                    val args = mutableMapOf<String, Any?>(
                        "groupId" to groupId,
                        "body" to wire,
                    )
                    if (!uploadedUrl.isNullOrBlank()) {
                        args["attachmentUrl"] = uploadedUrl
                        args["attachmentName"] = "encrypted.bin"
                        args["attachmentType"] = "application/octet-stream"
                    }
                    if (replyTo != null) args["replyToId"] = replyTo.id
                    if (isSpoiler) args["isSpoiler"] = true

                    val root = TursoApiClient.rpcRaw("sendGroupMessage", args, token).jsonObject
                    val serverMsg = root["message"]?.let {
                        JaTextJson.decodeFromJsonElement(GroupMessage.serializer(), it)
                    }
                    if (serverMsg != null) {
                        val hydrated = JaTextCryptoEngine.hydrateGroupMessages(appCtx, me.id, groupId, listOf(serverMsg))
                            .map { m -> if (m.id == serverMsg.id) m.copy(renderKey = tempId) else m }
                        _state.update { cur ->
                            val withoutOpt = cur.groupMessages.filterNot { m -> m.id == tempId }
                            cur.copy(groupMessages = mergeGroupMessages(withoutOpt, hydrated))
                        }
                    }
                    triggerImmediateSync(true)
                } catch (e: Throwable) {
                    _state.update { cur -> cur.copy(groupMessages = cur.groupMessages.filterNot { m -> m.id == tempId }) }
                    showToast(e.message ?: "Failed to send message")
                }
            }
        } else if (st.activeChatId == OFFICIAL_COMMUNITY_ID) {
            val optMsg = CommunityMessage(
                id = tempId,
                renderKey = tempId,
                senderId = me.id,
                senderName = me.displayName,
                senderUsername = me.username,
                senderAvatarUrl = me.avatarUrl,
                senderAvatarColor = me.avatarColor,
                body = cleanText,
                bubbleStyle = bubble,
                type = "text",
                isSpoiler = isSpoiler,
                createdAt = now,
                replyTo = replyTo,
            )
            _state.update { it.copy(communityMessages = it.communityMessages + optMsg) }

            return viewModelScope.launch {
                try {
                    val rawBytesAndMeta = readAttachmentBytes(attachmentUri, localVoiceFile)
                    var uploadedUrl: String? = null
                    var fName: String? = null
                    var fMime: String? = null
                    if (rawBytesAndMeta != null) {
                        val (plainBytes, name, mime, _) = rawBytesAndMeta
                        fName = name
                        fMime = if (bubble != "default") "$mime;jbs=$bubble" else mime
                        uploadedUrl = TursoApiClient.uploadMediaBytes(plainBytes, name, mime, token)
                    }
                    val args = mutableMapOf<String, Any?>(
                        "type" to "text",
                        "body" to JaTextCryptoEngine.attachBubbleStyleToOutgoing(cleanText, bubble),
                    )
                    if (!uploadedUrl.isNullOrBlank()) {
                        args["attachmentUrl"] = uploadedUrl
                        args["attachmentName"] = fName
                        args["attachmentType"] = fMime
                    }
                    if (replyTo != null) args["replyToId"] = replyTo.id
                    if (isSpoiler) args["isSpoiler"] = true

                    val root = TursoApiClient.rpcRaw("sendCommunityMessage", args, token).jsonObject
                    val serverMsg = root["message"]?.let {
                        JaTextJson.decodeFromJsonElement(CommunityMessage.serializer(), it)
                    }
                    if (serverMsg != null) {
                        val hydrated = hydrateCommunityList(listOf(serverMsg))
                            .map { m -> if (m.id == serverMsg.id) m.copy(renderKey = tempId) else m }
                        _state.update { cur ->
                            val withoutOpt = cur.communityMessages.filterNot { m -> m.id == tempId }
                            cur.copy(communityMessages = mergeCommunityMessages(withoutOpt, hydrated))
                        }
                    }
                    triggerImmediateSync(true)
                } catch (e: Throwable) {
                    _state.update { cur -> cur.copy(communityMessages = cur.communityMessages.filterNot { m -> m.id == tempId }) }
                    showToast(e.message ?: "Failed to send community message")
                }
            }
        }
        return null
    }

    fun sendSticker(sticker: StickerMedia) {
        val st = _state.value
        val me = st.me ?: return
        val token = currentAuthToken() ?: return
        val bubble = st.outgoingBubbleStyle

        viewModelScope.launch {
            try {
                // Record recent sticker usage
                launch {
                    try {
                        val libRoot = TursoApiClient.rpcRaw(
                            "upsertSticker",
                            mapOf(
                                "sticker" to mapOf(
                                    "key" to sticker.key,
                                    "url" to sticker.url,
                                    "previewUrl" to sticker.previewUrl,
                                    "name" to sticker.name,
                                    "mediaType" to sticker.mediaType,
                                    "source" to sticker.source,
                                ),
                                "incrementUse" to true,
                            ),
                            token
                        ).jsonObject
                        val favs = libRoot["stickerFavorites"]?.let {
                            JaTextJson.decodeFromJsonElement(
                                kotlinx.serialization.builtins.ListSerializer(StickerMedia.serializer()),
                                it
                            )
                        }
                        val recs = libRoot["recentStickers"]?.let {
                            JaTextJson.decodeFromJsonElement(
                                kotlinx.serialization.builtins.ListSerializer(StickerMedia.serializer()),
                                it
                            )
                        }
                        _state.update { cur ->
                            cur.copy(
                                stickerFavorites = favs ?: cur.stickerFavorites,
                                recentStickers = recs ?: cur.recentStickers,
                            )
                        }
                    } catch (_: Throwable) {
                    }
                }

                if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
                    val payload = E2EEPlainPayload(
                        v = 1,
                        b = "",
                        bs = bubble.takeIf { it != "default" },
                        stk = EncryptedStickerDescriptor(
                            url = sticker.url,
                            n = sticker.name,
                            key = sticker.key,
                            mt = sticker.mediaType,
                        )
                    )
                    val wire = JaTextCryptoEngine.encryptDmMessage(appCtx, me.id, st.activeChatId, payload, token)
                    val args = if (wire != null) {
                        mapOf("receiverId" to st.activeChatId, "body" to wire)
                    } else {
                        mapOf(
                            "receiverId" to st.activeChatId,
                            "body" to "",
                            "attachmentUrl" to sticker.url,
                            "attachmentName" to sticker.name,
                            "attachmentType" to if (sticker.mediaType == "gif") "image/gif" else "image/png",
                            "stickerKey" to sticker.key,
                        )
                    }
                    TursoApiClient.rpcRaw("sendMessage", args, token)
                } else if (st.activeGroupId != null) {
                    val memberIds = st.groupDetails?.members?.map { it.id }.orEmpty()
                    val payload = E2EEPlainPayload(
                        v = 1,
                        b = "",
                        bs = bubble.takeIf { it != "default" },
                        stk = EncryptedStickerDescriptor(
                            url = sticker.url,
                            n = sticker.name,
                            key = sticker.key,
                            mt = sticker.mediaType,
                        )
                    )
                    val wire = JaTextCryptoEngine.encryptGroupMessage(appCtx, me.id, st.activeGroupId, memberIds, payload, token)
                    TursoApiClient.rpcRaw("sendGroupMessage", mapOf("groupId" to st.activeGroupId, "body" to wire), token)
                } else if (st.activeChatId == OFFICIAL_COMMUNITY_ID) {
                    TursoApiClient.rpcRaw(
                        "sendCommunityMessage",
                        mapOf(
                            "type" to "sticker",
                            "body" to "",
                            "stickerUrl" to sticker.url,
                            "stickerName" to sticker.name,
                            "stickerKey" to sticker.key,
                        ),
                        token
                    )
                }
                triggerImmediateSync(true)
            } catch (e: Throwable) {
                showToast(e.message ?: "Failed to send sticker")
            }
        }
    }

    suspend fun searchKlipyStickers(query: String): List<StickerMedia> {
        val token = currentAuthToken() ?: return emptyList()
        return try {
            val root = TursoApiClient.rpcRaw("searchKlipy", mapOf("query" to query), token).jsonObject
            root["results"]?.let {
                JaTextJson.decodeFromJsonElement(
                    kotlinx.serialization.builtins.ListSerializer(StickerMedia.serializer()),
                    it
                )
            }.orEmpty()
        } catch (_: Throwable) {
            emptyList()
        }
    }

    fun uploadCustomSticker(uri: Uri, name: String) {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                val (bytes, fName, fMime, _) = readAttachmentBytes(uri, null) ?: return@launch
                val url = TursoApiClient.uploadMediaBytes(bytes, name.ifBlank { fName }, fMime, token)
                val item = mapOf(
                    "key" to "upload:$url",
                    "url" to url,
                    "storageId" to url,
                    "name" to name.ifBlank { "Sticker" },
                    "mediaType" to if (fMime.contains("gif")) "gif" else "sticker",
                    "source" to "upload",
                )
                val libRoot = TursoApiClient.rpcRaw(
                    "upsertSticker",
                    mapOf("sticker" to item, "isFavorite" to true),
                    token
                ).jsonObject
                val favs = libRoot["stickerFavorites"]?.let {
                    JaTextJson.decodeFromJsonElement(
                        kotlinx.serialization.builtins.ListSerializer(StickerMedia.serializer()),
                        it
                    )
                }?.filterNot { JaTextCryptoEngine.isInternalSyncSticker(it) }
                _state.update { it.copy(stickerFavorites = favs ?: it.stickerFavorites) }
                showToast("Custom sticker saved!")
            } catch (e: Throwable) {
                showToast(e.message ?: "Failed to upload sticker")
            }
        }
    }

    /* ==================== Message Actions: Reactions (2+ per user!), Edit, Unsend, Forward, Polls ==================== */

    fun toggleStickerFavorite(
        sticker: StickerMedia,
        favorite: Boolean = _state.value.stickerFavorites.none {
            (sticker.key.isNotBlank() && it.key == sticker.key) || it.url == TursoApiClient.resolveAbsoluteMediaUrl(sticker.url)
        },
    ) {
        val token = currentAuthToken() ?: return
        val resolvedUrl = TursoApiClient.resolveAbsoluteMediaUrl(sticker.url)
        val key = sticker.key.ifBlank { "klipy:$resolvedUrl" }
        _state.update { cur ->
            val updatedFavs = if (favorite) {
                val entry = sticker.copy(key = key, url = resolvedUrl, isFavorite = true)
                listOf(entry) + cur.stickerFavorites.filterNot { it.key == key || it.url == resolvedUrl }
            } else {
                cur.stickerFavorites.filterNot { it.key == key || it.url == resolvedUrl }
            }
            cur.copy(
                stickerFavorites = updatedFavs,
                recentStickers = cur.recentStickers.map {
                    if (it.key == key || it.url == resolvedUrl) it.copy(isFavorite = favorite) else it
                }
            )
        }
        viewModelScope.launch {
            try {
                val libRoot = TursoApiClient.rpcRaw(
                    "upsertSticker",
                    mapOf(
                        "sticker" to mapOf(
                            "key" to key,
                            "url" to resolvedUrl,
                            "previewUrl" to (sticker.previewUrl ?: resolvedUrl),
                            "name" to sticker.name.ifBlank { "Sticker" },
                            "mediaType" to sticker.mediaType.ifBlank { "sticker" },
                            "source" to sticker.source.ifBlank { "klipy" },
                        ),
                        "isFavorite" to favorite,
                    ),
                    token
                ).jsonObject
                val favs = libRoot["stickerFavorites"]?.let {
                    JaTextJson.decodeFromJsonElement(
                        kotlinx.serialization.builtins.ListSerializer(StickerMedia.serializer()),
                        it
                    )
                }?.filterNot { JaTextCryptoEngine.isInternalSyncSticker(it) }
                val recs = libRoot["recentStickers"]?.let {
                    JaTextJson.decodeFromJsonElement(
                        kotlinx.serialization.builtins.ListSerializer(StickerMedia.serializer()),
                        it
                    )
                }?.filterNot { JaTextCryptoEngine.isInternalSyncSticker(it) }
                _state.update { cur ->
                    cur.copy(
                        stickerFavorites = favs ?: cur.stickerFavorites,
                        recentStickers = recs ?: cur.recentStickers,
                    )
                }
                showToast(if (favorite) "Saved to Favourites!" else "Removed from Favourites")
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not update favourite stickers")
            }
        }
    }

    fun recordReactionEmojiUsed(emoji: String) {
        val updated = cache.incrementEmojiUsage(_state.value.slotId, emoji)
        _state.update { it.copy(emojiUsageCounts = updated) }
    }

    fun toggleReaction(messageId: String, emoji: String) {
        val st = _state.value
        val meId = st.me?.id ?: return
        val token = currentAuthToken() ?: return

        val alreadyMine = when {
            st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID ->
                st.dmMessages.firstOrNull { it.id == messageId }?.reactions?.any { it.userId == meId && it.emoji == emoji } == true
            st.activeGroupId != null ->
                st.groupMessages.firstOrNull { it.id == messageId }?.reactions?.any { it.userId == meId && it.emoji == emoji } == true
            st.activeChatId == OFFICIAL_COMMUNITY_ID ->
                st.communityMessages.firstOrNull { it.id == messageId }?.reactions?.any { it.userId == meId && it.emoji == emoji } == true
            else -> false
        }
        if (!alreadyMine) {
            recordReactionEmojiUsed(emoji)
        }

        fun applyLocalToggle(list: List<MessageReaction>): List<MessageReaction> {
            val exists = list.any { it.userId == meId && it.emoji == emoji }
            return if (exists) {
                list.filterNot { it.userId == meId && it.emoji == emoji }
            } else {
                list + MessageReaction(userId = meId, emoji = emoji)
            }
        }

        if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
            _state.update { cur ->
                cur.copy(
                    dmMessages = cur.dmMessages.map { m ->
                        if (m.id == messageId) m.copy(reactions = applyLocalToggle(m.reactions)) else m
                    }
                )
            }
            viewModelScope.launch {
                try {
                    TursoApiClient.rpcRaw("toggleMessageReaction", mapOf("messageId" to messageId, "emoji" to emoji), token)
                } catch (_: Throwable) {
                }
            }
        } else if (st.activeGroupId != null) {
            _state.update { cur ->
                cur.copy(
                    groupMessages = cur.groupMessages.map { m ->
                        if (m.id == messageId) m.copy(reactions = applyLocalToggle(m.reactions)) else m
                    }
                )
            }
            viewModelScope.launch {
                try {
                    TursoApiClient.rpcRaw(
                        "mutateGroupMessage",
                        mapOf("messageId" to messageId, "action" to "react", "emoji" to emoji),
                        token
                    )
                } catch (_: Throwable) {
                }
            }
        } else if (st.activeChatId == OFFICIAL_COMMUNITY_ID) {
            _state.update { cur ->
                cur.copy(
                    communityMessages = cur.communityMessages.map { m ->
                        if (m.id == messageId) m.copy(reactions = applyLocalToggle(m.reactions)) else m
                    }
                )
            }
            viewModelScope.launch {
                try {
                    TursoApiClient.rpcRaw(
                        "mutateCommunityMessage",
                        mapOf("messageId" to messageId, "action" to "react", "emoji" to emoji),
                        token
                    )
                } catch (_: Throwable) {
                }
            }
        }
    }

    fun editMessage(messageId: String, newPlainText: String) {
        val st = _state.value
        val me = st.me ?: return
        val token = currentAuthToken() ?: return
        val bubble = st.outgoingBubbleStyle
        val clean = newPlainText.trim()

        viewModelScope.launch {
            try {
                if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
                    val existingDm = st.dmMessages.firstOrNull { it.id == messageId }
                    val hasExistingAtt = !existingDm?.attachmentUrl.isNullOrBlank() ||
                        existingDm?.encryptedAttachment != null ||
                        existingDm?.encryptedSticker != null
                    if (clean.isEmpty() && !hasExistingAtt) return@launch
                    val effectiveBubble = existingDm?.bubbleStyle?.takeIf { it.isNotBlank() } ?: bubble
                    val payload = E2EEPlainPayload(
                        v = 1,
                        b = JaTextCryptoEngine.attachBubbleStyleToOutgoing(clean, effectiveBubble),
                        bs = effectiveBubble.takeIf { it != "default" },
                        att = existingDm?.encryptedAttachment,
                        stk = existingDm?.encryptedSticker,
                    )
                    val wire = JaTextCryptoEngine.encryptDmMessage(appCtx, me.id, st.activeChatId, payload, token)
                        ?: JaTextCryptoEngine.attachBubbleStyleToOutgoing(clean, effectiveBubble)
                    TursoApiClient.rpcRaw("editMessage", mapOf("messageId" to messageId, "body" to wire), token)
                    _state.update { cur ->
                        cur.copy(
                            dmMessages = cur.dmMessages.map { m ->
                                if (m.id == messageId) m.copy(body = clean, editedAt = System.currentTimeMillis()) else m
                            }
                        )
                    }
                } else if (st.activeGroupId != null) {
                    val existingGrp = st.groupMessages.firstOrNull { it.id == messageId }
                    val hasExistingAtt = !existingGrp?.attachmentUrl.isNullOrBlank() ||
                        existingGrp?.encryptedAttachment != null ||
                        existingGrp?.encryptedSticker != null
                    if (clean.isEmpty() && !hasExistingAtt) return@launch
                    val effectiveBubble = existingGrp?.bubbleStyle?.takeIf { it.isNotBlank() } ?: bubble
                    val memberIds = st.groupDetails?.members?.map { it.id }.orEmpty()
                    val payload = E2EEPlainPayload(
                        v = 1,
                        b = JaTextCryptoEngine.attachBubbleStyleToOutgoing(clean, effectiveBubble),
                        bs = effectiveBubble.takeIf { it != "default" },
                        att = existingGrp?.encryptedAttachment,
                        stk = existingGrp?.encryptedSticker,
                    )
                    val wire = JaTextCryptoEngine.encryptGroupMessage(appCtx, me.id, st.activeGroupId, memberIds, payload, token)
                    TursoApiClient.rpcRaw(
                        "mutateGroupMessage",
                        mapOf("messageId" to messageId, "action" to "edit", "body" to wire),
                        token
                    )
                    _state.update { cur ->
                        cur.copy(
                            groupMessages = cur.groupMessages.map { m ->
                                if (m.id == messageId) m.copy(body = clean, editedAt = System.currentTimeMillis()) else m
                            }
                        )
                    }
                } else if (st.activeChatId == OFFICIAL_COMMUNITY_ID) {
                    if (clean.isEmpty()) return@launch
                    TursoApiClient.rpcRaw(
                        "mutateCommunityMessage",
                        mapOf(
                            "messageId" to messageId,
                            "action" to "edit",
                            "body" to JaTextCryptoEngine.attachBubbleStyleToOutgoing(clean, bubble)
                        ),
                        token
                    )
                    _state.update { cur ->
                        cur.copy(
                            communityMessages = cur.communityMessages.map { m ->
                                if (m.id == messageId) m.copy(body = clean, editedAt = System.currentTimeMillis()) else m
                            }
                        )
                    }
                }
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not edit message")
            }
        }
    }

    fun deleteCommunityAnnouncement(messageId: String) {
        val token = currentAuthToken() ?: return
        val prevList = _state.value.communityMessages
        locallyHardDeletedCommIds.add(messageId)
        _state.update { cur ->
            cur.copy(communityMessages = cur.communityMessages.filterNot { it.id == messageId })
        }
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw(
                    "mutateCommunityMessage",
                    mapOf("messageId" to messageId, "action" to "delete"),
                    token
                )
                triggerImmediateSync(true)
            } catch (e: Throwable) {
                locallyHardDeletedCommIds.remove(messageId)
                _state.update { cur -> cur.copy(communityMessages = prevList) }
                showToast(e.message ?: "Could not delete announcement")
            }
        }
    }

    fun unsendMessage(messageId: String) {
        val st = _state.value
        val token = currentAuthToken() ?: return
        val nowUnsent = System.currentTimeMillis()
        locallyUnsentAtById[messageId] = nowUnsent

        var prevDm: ChatMessage? = null
        var prevGroup: GroupMessage? = null
        var prevComm: CommunityMessage? = null

        // Optimistically update UI state IMMEDIATELY so the bubble never flashes back after Thanos Snap!
        if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
            prevDm = st.dmMessages.firstOrNull { it.id == messageId }
            _state.update { cur ->
                cur.copy(
                    dmMessages = cur.dmMessages.map { m ->
                        if (m.id == messageId) {
                            m.copy(
                                body = "",
                                attachmentUrl = null,
                                attachmentName = null,
                                attachmentType = null,
                                encryptedAttachmentJson = null,
                                unsentAt = nowUnsent,
                                reactions = emptyList(),
                            )
                        } else m
                    }
                )
            }
        } else if (st.activeGroupId != null) {
            prevGroup = st.groupMessages.firstOrNull { it.id == messageId }
            _state.update { cur ->
                cur.copy(
                    groupMessages = cur.groupMessages.map { m ->
                        if (m.id == messageId) {
                            m.copy(
                                body = "",
                                attachmentUrl = null,
                                attachmentName = null,
                                attachmentType = null,
                                encryptedAttachmentJson = null,
                                unsentAt = nowUnsent,
                                reactions = emptyList(),
                            )
                        } else m
                    }
                )
            }
        } else if (st.activeChatId == OFFICIAL_COMMUNITY_ID) {
            prevComm = st.communityMessages.firstOrNull { it.id == messageId }
            _state.update { cur ->
                cur.copy(
                    communityMessages = cur.communityMessages.map { m ->
                        if (m.id == messageId) {
                            m.copy(
                                body = "",
                                attachmentUrl = null,
                                attachmentName = null,
                                attachmentType = null,
                                unsentAt = nowUnsent,
                                reactions = emptyList(),
                            )
                        } else m
                    }
                )
            }
        }

        viewModelScope.launch {
            try {
                if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
                    TursoApiClient.rpcRaw("unsendMessage", mapOf("messageId" to messageId), token)
                } else if (st.activeGroupId != null) {
                    TursoApiClient.rpcRaw("mutateGroupMessage", mapOf("messageId" to messageId, "action" to "unsend"), token)
                } else if (st.activeChatId == OFFICIAL_COMMUNITY_ID) {
                    TursoApiClient.rpcRaw("mutateCommunityMessage", mapOf("messageId" to messageId, "action" to "unsend"), token)
                }
            } catch (e: Throwable) {
                locallyUnsentAtById.remove(messageId)
                // Restore snapshot on RPC failure (e.g., 60-minute window expired)
                _state.update { cur ->
                    cur.copy(
                        dmMessages = if (prevDm != null) cur.dmMessages.map { if (it.id == messageId) prevDm else it } else cur.dmMessages,
                        groupMessages = if (prevGroup != null) cur.groupMessages.map { if (it.id == messageId) prevGroup else it } else cur.groupMessages,
                        communityMessages = if (prevComm != null) cur.communityMessages.map { if (it.id == messageId) prevComm else it } else cur.communityMessages,
                    )
                }
                showToast(e.message ?: "Unsend window (60 min) has expired")
            }
        }
    }

    fun deleteMessageForMe(messageId: String) {
        val st = _state.value
        val token = currentAuthToken() ?: return
        val nonce = System.currentTimeMillis()
        val expiresAt = nonce + 5_000L

        locallyDeletedIds.add(messageId)
        deleteUndoJob?.cancel()
        deletedDmSnapshot = null
        deletedGroupSnapshot = null
        deletedCommunitySnapshot = null
        deletedUndoThreadKind = ""

        if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
            val activeFriendId = st.activeChatId
            deletedDmSnapshot = st.dmMessages.firstOrNull { it.id == messageId }
            deletedUndoThreadKind = "dm"
            val updated = st.dmMessages.filterNot { it.id == messageId }
            _state.update { cur ->
                cur.copy(
                    dmMessages = cur.dmMessages.filterNot { it.id == messageId },
                    deletedForMeUndo = DeletedForMeUndoBanner(messageId, nonce, expiresAt),
                )
            }
            cache.saveDmMessagesCache(st.slotId, activeFriendId, updated)
        } else if (st.activeGroupId != null) {
            val activeGrpId = st.activeGroupId
            deletedGroupSnapshot = st.groupMessages.firstOrNull { it.id == messageId }
            deletedUndoThreadKind = "group"
            val updated = st.groupMessages.filterNot { it.id == messageId }
            _state.update { cur ->
                cur.copy(
                    groupMessages = cur.groupMessages.filterNot { it.id == messageId },
                    deletedForMeUndo = DeletedForMeUndoBanner(messageId, nonce, expiresAt),
                )
            }
            cache.saveGroupMessagesCache(st.slotId, activeGrpId, updated)
        } else if (st.activeChatId == OFFICIAL_COMMUNITY_ID) {
            deletedCommunitySnapshot = st.communityMessages.firstOrNull { it.id == messageId }
            deletedUndoThreadKind = "community"
            _state.update { cur ->
                cur.copy(
                    communityMessages = cur.communityMessages.filterNot { it.id == messageId },
                    deletedForMeUndo = DeletedForMeUndoBanner(messageId, nonce, expiresAt),
                )
            }
        }

        deleteUndoJob = viewModelScope.launch {
            delay(5_000L)
            _state.update { cur ->
                if (cur.deletedForMeUndo?.nonce == nonce) cur.copy(deletedForMeUndo = null) else cur
            }
        }

        val kind = deletedUndoThreadKind
        viewModelScope.launch {
            try {
                when (kind) {
                    "dm" -> TursoApiClient.rpcRaw("deleteMessageForMe", mapOf("messageId" to messageId), token)
                    "group" -> TursoApiClient.rpcRaw("mutateGroupMessage", mapOf("messageId" to messageId, "action" to "hideForMe"), token)
                    "community" -> TursoApiClient.rpcRaw("mutateCommunityMessage", mapOf("messageId" to messageId, "action" to "hideForMe"), token)
                }
            } catch (_: Throwable) {
            }
        }
    }

    fun undoDeleteMessageForMe() {
        val token = currentAuthToken() ?: return
        val banner = _state.value.deletedForMeUndo ?: return
        locallyDeletedIds.remove(banner.messageId)
        deleteUndoJob?.cancel()
        val kind = deletedUndoThreadKind
        val dmSnap = deletedDmSnapshot
        val grpSnap = deletedGroupSnapshot
        val commSnap = deletedCommunitySnapshot
        deletedDmSnapshot = null
        deletedGroupSnapshot = null
        deletedCommunitySnapshot = null
        deletedUndoThreadKind = ""

        _state.update { cur ->
            when (kind) {
                "dm" -> {
                    val restored = if (dmSnap != null) (cur.dmMessages.filterNot { it.id == dmSnap.id } + dmSnap).sortedBy { it.createdAt } else cur.dmMessages
                    if (cur.activeChatId != null && cur.activeChatId != OFFICIAL_COMMUNITY_ID) {
                        cache.saveDmMessagesCache(cur.slotId, cur.activeChatId, restored)
                    }
                    cur.copy(
                        dmMessages = restored,
                        deletedForMeUndo = null,
                    )
                }
                "group" -> {
                    val restored = if (grpSnap != null) (cur.groupMessages.filterNot { it.id == grpSnap.id } + grpSnap).sortedBy { it.createdAt } else cur.groupMessages
                    if (cur.activeGroupId != null) {
                        cache.saveGroupMessagesCache(cur.slotId, cur.activeGroupId, restored)
                    }
                    cur.copy(
                        groupMessages = restored,
                        deletedForMeUndo = null,
                    )
                }
                "community" -> cur.copy(
                    communityMessages = if (commSnap != null) (cur.communityMessages.filterNot { it.id == commSnap.id } + commSnap).sortedBy { it.createdAt } else cur.communityMessages,
                    deletedForMeUndo = null,
                )
                else -> cur.copy(deletedForMeUndo = null)
            }
        }

        viewModelScope.launch {
            try {
                when (kind) {
                    "dm" -> TursoApiClient.rpcRaw("restoreMessageForMe", mapOf("messageId" to banner.messageId), token)
                    "group" -> TursoApiClient.rpcRaw("mutateGroupMessage", mapOf("messageId" to banner.messageId, "action" to "unhideForMe"), token)
                    "community" -> TursoApiClient.rpcRaw("mutateCommunityMessage", mapOf("messageId" to banner.messageId, "action" to "unhideForMe"), token)
                }
            } catch (_: Throwable) {
            }
        }
    }

    fun forwardMessageWithContext(
        plainBody: String,
        contextCard: ForwardedMessageContext,
        attachmentUrl: String? = null,
        attachmentName: String? = null,
        attachmentType: String? = null,
        targetFriendId: String? = null,
        targetGroupId: String? = null,
        targetCommunity: Boolean = false,
    ) {
        val me = _state.value.me ?: return
        val token = currentAuthToken() ?: return
        val encodedBody = JaTextCryptoEngine.encodeForwardedBody(plainBody, contextCard)

        viewModelScope.launch {
            try {
                when {
                    !targetFriendId.isNullOrBlank() -> {
                        val payload = E2EEPlainPayload(v = 1, b = encodedBody)
                        val wire = JaTextCryptoEngine.encryptDmMessage(appCtx, me.id, targetFriendId, payload, token) ?: encodedBody
                        TursoApiClient.rpcRaw(
                            "sendMessage",
                            buildMap {
                                put("receiverId", targetFriendId)
                                put("body", wire)
                                put("forwardedFromId", contextCard.originalSenderId)
                                // The file is already stored, forward the same
                                // bytes rather than only the text around them.
                                if (!attachmentUrl.isNullOrBlank()) {
                                    put("attachmentUrl", attachmentUrl)
                                    put("attachmentName", attachmentName ?: "forwarded")
                                    put("attachmentType", attachmentType ?: "application/octet-stream")
                                }
                            },
                            token
                        )
                    }
                    !targetGroupId.isNullOrBlank() -> {
                        val detRoot = TursoApiClient.rpcRaw("getGroupDetails", mapOf("groupId" to targetGroupId), token).jsonObject
                        val det = detRoot["details"]?.let {
                            if (it is kotlinx.serialization.json.JsonNull) null
                            else JaTextJson.decodeFromJsonElement(GroupDetails.serializer(), it)
                        }
                        val memberIds = det?.members?.map { it.id }.orEmpty()
                        val payload = E2EEPlainPayload(v = 1, b = encodedBody)
                        val wire = JaTextCryptoEngine.encryptGroupMessage(appCtx, me.id, targetGroupId, memberIds, payload, token)
                        TursoApiClient.rpcRaw(
                            "sendGroupMessage",
                            buildMap {
                                put("groupId", targetGroupId)
                                put("body", wire)
                                put("forwardedFromId", contextCard.originalSenderId)
                                put("forwardedFromName", contextCard.originalSenderName)
                                if (!attachmentUrl.isNullOrBlank()) {
                                    put("attachmentUrl", attachmentUrl)
                                    put("attachmentName", attachmentName ?: "forwarded")
                                    put("attachmentType", attachmentType ?: "application/octet-stream")
                                }
                            },
                            token
                        )
                    }
                    targetCommunity -> {
                        TursoApiClient.rpcRaw(
                            "sendCommunityMessage",
                            buildMap {
                                put("type", "text")
                                put("body", encodedBody)
                                put("forwardedFromId", contextCard.originalSenderId)
                                put("forwardedFromName", contextCard.originalSenderName)
                                if (!attachmentUrl.isNullOrBlank()) {
                                    put("attachmentUrl", attachmentUrl)
                                    put("attachmentName", attachmentName ?: "forwarded")
                                    put("attachmentType", attachmentType ?: "application/octet-stream")
                                }
                            },
                            token
                        )
                    }
                }
                triggerImmediateSync(true)
                showToast("Message forwarded!")
            } catch (e: Throwable) {
                showToast(e.message ?: "Failed to forward message")
            }
        }
    }

    fun jumpToForwardedSource(ctx: ForwardedMessageContext) {
        val st = _state.value
        val meId = st.me?.id ?: return
        when (ctx.sourceKind) {
            "community" -> openCommunityChat(highlightMessageId = ctx.originalMessageId)
            "group" -> {
                val gid = ctx.groupId ?: return
                if (st.groups.any { it.id == gid }) {
                    openGroupChat(gid, highlightMessageId = ctx.originalMessageId)
                }
            }
            "dm" -> {
                val ids = ctx.dmUserIds ?: return
                if (!ids.contains(meId)) return
                val peerId = ids.firstOrNull { it != meId } ?: return
                if (st.friends.any { it.id == peerId }) {
                    openDmChat(peerId, highlightMessageId = ctx.originalMessageId)
                }
            }
        }
    }

    fun createCommunityPoll(question: String, options: List<String>) {
        val token = currentAuthToken() ?: return
        val cleanOpts = options.map { it.trim() }.filter { it.isNotEmpty() }
        if (question.isBlank() || cleanOpts.size < 2) return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw(
                    "sendCommunityMessage",
                    mapOf("type" to "poll", "body" to question.trim(), "pollOptions" to cleanOpts),
                    token
                )
                triggerImmediateSync(true)
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not create poll")
            }
        }
    }

    fun voteCommunityPoll(pollId: String, optionIndex: Int) {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("voteCommunityPoll", mapOf("pollId" to pollId, "optionIndex" to optionIndex), token)
                triggerImmediateSync(true)
            } catch (_: Throwable) {
            }
        }
    }

    fun endCommunityPoll(pollId: String) {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("endCommunityPoll", mapOf("pollId" to pollId), token)
                triggerImmediateSync(true)
            } catch (_: Throwable) {
            }
        }
    }

    suspend fun fetchPollVoters(pollId: String): List<PollVoter> {
        val token = currentAuthToken() ?: return emptyList()
        return try {
            val root = TursoApiClient.rpcRaw("getCommunityPollVoters", mapOf("pollId" to pollId), token).jsonObject
            root["voters"]?.let {
                JaTextJson.decodeFromJsonElement(
                    kotlinx.serialization.builtins.ListSerializer(PollVoter.serializer()),
                    it
                )
            }.orEmpty()
        } catch (_: Throwable) {
            emptyList()
        }
    }

    /* ==================== Context Menus: Mark as Done, Mute, Archive, Remove Chat, Owner Delete Group ==================== */

    fun markDmAsDone(friendId: String) {
        _state.update { prev ->
            prev.copy(
                previews = prev.previews.map { if (it.friendId == friendId) it.copy(unreadCount = 0) else it }
            )
        }
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("markMessagesRead", mapOf("friendId" to friendId), token)
            } catch (_: Throwable) {
            }
        }
    }

    fun markGroupAsDone(groupId: String) {
        _state.update { prev ->
            prev.copy(
                groups = prev.groups.map { if (it.id == groupId) it.copy(unreadCount = 0) else it }
            )
        }
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw(
                    "manageGroup",
                    mapOf("groupId" to groupId, "subOp" to "setUserPrefs", "markRead" to true),
                    token
                )
            } catch (_: Throwable) {
            }
        }
    }

    fun setDmConversationPrefs(friendId: String, muted: Boolean? = null, archived: Boolean? = null, removeChatHistory: Boolean = false) {
        val token = currentAuthToken() ?: return
        _state.update { prev ->
            prev.copy(
                previews = if (removeChatHistory) {
                    prev.previews.filterNot { it.friendId == friendId }
                } else {
                    prev.previews.map { p ->
                        if (p.friendId == friendId) {
                            p.copy(
                                isMuted = muted ?: p.isMuted,
                                isArchived = archived ?: p.isArchived,
                            )
                        } else {
                            p
                        }
                    }
                },
                dmMessages = if (removeChatHistory && prev.activeChatId == friendId) emptyList() else prev.dmMessages,
            )
        }
        syncPushSuppressionState()
        viewModelScope.launch {
            try {
                val args = mutableMapOf<String, Any?>("friendId" to friendId)
                if (muted != null) args["isMuted"] = muted
                if (archived != null) args["isArchived"] = archived
                if (removeChatHistory) args["deleteHistory"] = true
                TursoApiClient.rpcRaw("setConversationPrefs", args, token)
            } catch (_: Throwable) {
            }
        }
    }

    fun setGroupPrefs(groupId: String, silenced: Boolean? = null, archived: Boolean? = null) {
        val token = currentAuthToken() ?: return
        _state.update { prev ->
            prev.copy(
                groups = prev.groups.map { g ->
                    if (g.id == groupId) {
                        g.copy(
                            isSilenced = silenced ?: g.isSilenced,
                            isArchived = archived ?: g.isArchived,
                        )
                    } else {
                        g
                    }
                }
            )
        }
        syncPushSuppressionState()
        viewModelScope.launch {
            try {
                val args = mutableMapOf<String, Any?>("groupId" to groupId, "subOp" to "setUserPrefs")
                if (silenced != null) args["isSilenced"] = silenced
                if (archived != null) args["isArchived"] = archived
                TursoApiClient.rpcRaw("manageGroup", args, token)
            } catch (_: Throwable) {
            }
        }
    }

    /** Clears group chat history for this user WITHOUT leaving the group! */
    fun removeGroupChatWithoutLeaving(groupId: String) {
        val token = currentAuthToken() ?: return
        _state.update { prev ->
            prev.copy(
                groupMessages = if (prev.activeGroupId == groupId) emptyList() else prev.groupMessages,
                groups = prev.groups.map { g -> if (g.id == groupId) g.copy(lastMessage = "", unreadCount = 0) else g }
            )
        }
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("manageGroup", mapOf("groupId" to groupId, "subOp" to "clearHistoryForMe"), token)
                showToast("Chat history cleared")
            } catch (_: Throwable) {
            }
        }
    }

    fun leaveGroup(groupId: String) {
        val token = currentAuthToken() ?: return
        _state.update { prev ->
            prev.copy(
                groups = prev.groups.filterNot { it.id == groupId },
                activeGroupId = if (prev.activeGroupId == groupId) null else prev.activeGroupId,
            )
        }
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("manageGroup", mapOf("groupId" to groupId, "subOp" to "leave"), token)
            } catch (_: Throwable) {
            }
        }
    }

    /** Owner-only permanent group deletion for everyone! */
    fun deleteGroupPermanentlyAsOwner(groupId: String) {
        val token = currentAuthToken() ?: return
        _state.update { prev ->
            prev.copy(
                groups = prev.groups.filterNot { it.id == groupId },
                activeGroupId = if (prev.activeGroupId == groupId) null else prev.activeGroupId,
            )
        }
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("manageGroup", mapOf("groupId" to groupId, "subOp" to "deleteGroup"), token)
                showToast("Group deleted permanently")
            } catch (e: Throwable) {
                showToast(e.message ?: "Only the group owner can delete this group")
            }
        }
    }

    fun setCommunityMuted(muted: Boolean) {
        val token = currentAuthToken() ?: return
        _state.update { it.copy(communityMuted = muted) }
        syncPushSuppressionState()
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("setCommunityPrefs", mapOf("isMuted" to muted), token)
            } catch (_: Throwable) {
            }
        }
    }

    /* ==================== Friends, Groups Management, Profile & Synced Themes ==================== */

    fun sendFriendRequest(username: String) {
        val token = currentAuthToken() ?: return
        val clean = username.trim().removePrefix("@").lowercase()
        if (clean.isEmpty()) return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("sendFriendRequest", mapOf("username" to clean), token)
                lastPresenceBeatAt = 0L
                triggerImmediateSync(true)
                showToast("Friend request sent to @$clean!")
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not send friend request")
            }
        }
    }

    fun respondFriendRequest(requestId: String, accept: Boolean) {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("respondFriendRequest", mapOf("requestId" to requestId, "accept" to accept), token)
                lastPresenceBeatAt = 0L
                triggerImmediateSync(true)
            } catch (e: Throwable) {
                showToast(e.message ?: "Failed to respond to request")
            }
        }
    }

    fun removeFriend(friendId: String) {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("removeFriend", mapOf("friendId" to friendId), token)
                lastPresenceBeatAt = 0L
                triggerImmediateSync(true)
            } catch (_: Throwable) {
            }
        }
    }

    fun setBlockedUser(userId: String, blocked: Boolean) {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("setUserBlocked", mapOf("friendId" to userId, "blocked" to blocked), token)
                triggerImmediateSync(true)
            } catch (_: Throwable) {
            }
        }
    }

    fun createNewGroup(name: String, memberIds: List<String>) {
        val token = currentAuthToken() ?: return
        if (name.isBlank()) return
        viewModelScope.launch {
            try {
                val root = TursoApiClient.rpcRaw(
                    "createGroup",
                    mapOf("name" to name.trim(), "memberIds" to memberIds),
                    token
                ).jsonObject
                val gid = root["groupId"]?.jsonPrimitive?.contentOrNull
                triggerImmediateSync(true)
                if (!gid.isNullOrBlank()) {
                    delay(200L)
                    openGroupChat(gid)
                }
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not create group")
            }
        }
    }

    fun createNewCommunity(
        name: String,
        description: String = "",
        avatarColor: String = "purple",
        avatarUri: Uri? = null,
    ) {
        val token = currentAuthToken() ?: return
        val myId = _state.value.me?.id.orEmpty()
        if (name.isBlank()) return
        viewModelScope.launch {
            try {
                var uploadedAvatarUrl: String? = null
                if (avatarUri != null) {
                    val (b, n, m, _) = readAttachmentBytes(avatarUri, null)
                        ?: throw IllegalStateException("Could not read community photo")
                    uploadedAvatarUrl = TursoApiClient.uploadMediaBytes(b, n, m, token)
                }
                val root = TursoApiClient.rpcRaw(
                    "createCommunity",
                    mapOf(
                        "name" to name.trim(),
                        "description" to description.trim(),
                        "avatarColor" to avatarColor.ifBlank { "purple" },
                        "avatarUrl" to uploadedAvatarUrl,
                    ),
                    token
                ).jsonObject
                val cid = root["groupId"]?.jsonPrimitive?.contentOrNull
                val seed = root["communityKeySeed"]?.jsonPrimitive?.contentOrNull
                if (!cid.isNullOrBlank() && !seed.isNullOrBlank()) {
                    JaTextCryptoEngine.registerCommunitySeedEpoch(appCtx, myId, cid, seed)
                }
                refreshExploreCommunities()
                triggerImmediateSync(true)
                if (!cid.isNullOrBlank()) {
                    delay(180L)
                    openGroupChat(cid)
                }
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not create community")
            }
        }
    }

    fun joinCommunity(communityId: String) {
        val token = currentAuthToken() ?: return
        val myId = _state.value.me?.id.orEmpty()
        if (communityId.isBlank()) return
        _state.update { it.copy(joiningCommunityId = communityId) }
        viewModelScope.launch {
            try {
                val root = TursoApiClient.rpcRaw(
                    "joinCommunity",
                    mapOf("communityId" to communityId),
                    token
                ).jsonObject
                val cid = root["groupId"]?.jsonPrimitive?.contentOrNull ?: communityId
                val seed = root["communityKeySeed"]?.jsonPrimitive?.contentOrNull
                if (!seed.isNullOrBlank()) {
                    JaTextCryptoEngine.registerCommunitySeedEpoch(appCtx, myId, cid, seed)
                }
                _state.update { cur ->
                    cur.copy(
                        joiningCommunityId = null,
                        exploreCommunities = cur.exploreCommunities.map { c ->
                            if (c.id == communityId) {
                                c.copy(
                                    isJoined = true,
                                    role = c.role ?: "member",
                                    memberCount = if (c.isJoined) c.memberCount else c.memberCount + 1,
                                )
                            } else c
                        },
                    )
                }
                triggerImmediateSync(true)
                delay(150L)
                openGroupChat(cid)
            } catch (e: Throwable) {
                _state.update { it.copy(joiningCommunityId = null) }
                showToast(e.message ?: "Could not join community")
            }
        }
    }

    fun refreshExploreCommunities() {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                val root = TursoApiClient.rpcRaw("exploreCommunities", emptyMap(), token).jsonObject
                val list = root["communities"]?.let {
                    JaTextJson.decodeFromJsonElement(
                        kotlinx.serialization.builtins.ListSerializer(ExploreCommunitySummary.serializer()),
                        it
                    )
                }.orEmpty()
                _state.update { it.copy(exploreCommunities = list) }
            } catch (_: Throwable) {
            }
        }
    }

    fun updateGroupAvatarColor(groupId: String, avatarColor: String) {
        val token = currentAuthToken() ?: return
        if (groupId.isBlank() || avatarColor.isBlank()) return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw(
                    "manageGroup",
                    mapOf("groupId" to groupId, "subOp" to "setAvatarColor", "avatarColor" to avatarColor),
                    token
                )
                _state.update { cur ->
                    cur.copy(
                        groupDetails = if (cur.groupDetails?.id == groupId) cur.groupDetails.copy(avatarColor = avatarColor) else cur.groupDetails,
                        groups = cur.groups.map { if (it.id == groupId) it.copy(avatarColor = avatarColor) else it },
                        exploreCommunities = cur.exploreCommunities.map { if (it.id == groupId) it.copy(avatarColor = avatarColor) else it },
                    )
                }
            } catch (_: Throwable) {
            }
        }
    }

    fun updateGroupDescription(groupId: String, description: String) {
        val token = currentAuthToken() ?: return
        if (groupId.isBlank()) return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw(
                    "manageGroup",
                    mapOf("groupId" to groupId, "subOp" to "setDescription", "description" to description.trim()),
                    token
                )
                _state.update { cur ->
                    cur.copy(
                        groupDetails = if (cur.groupDetails?.id == groupId) cur.groupDetails.copy(description = description.trim()) else cur.groupDetails,
                        groups = cur.groups.map { if (it.id == groupId) it.copy(description = description.trim()) else it },
                        exploreCommunities = cur.exploreCommunities.map { if (it.id == groupId) it.copy(description = description.trim()) else it },
                    )
                }
            } catch (_: Throwable) {
            }
        }
    }

    suspend fun fetchUserProfileById(userId: String): JaUser? {
        val token = currentAuthToken() ?: return null
        if (userId.isBlank() || userId.startsWith("pending-")) return null
        return try {
            val root = TursoApiClient.rpcRaw("getUserById", mapOf("userId" to userId), token).jsonObject
            val userElem = root["user"] ?: return null
            if (userElem is kotlinx.serialization.json.JsonNull) null
            else JaTextJson.decodeFromJsonElement(JaUser.serializer(), userElem)
        } catch (_: Throwable) {
            null
        }
    }

    fun renameGroup(groupId: String, newName: String) {
        val token = currentAuthToken() ?: return
        if (newName.isBlank()) return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw(
                    "manageGroup",
                    mapOf("groupId" to groupId, "subOp" to "rename", "name" to newName.trim()),
                    token
                )
                _state.update { cur ->
                    cur.copy(
                        groupDetails = cur.groupDetails?.copy(name = newName.trim()),
                        groups = cur.groups.map { if (it.id == groupId) it.copy(name = newName.trim()) else it },
                    )
                }
            } catch (_: Throwable) {
            }
        }
    }

    fun updateGroupProfile(
        groupId: String,
        newName: String? = null,
        newAvatarUri: Uri? = null,
        removeAvatar: Boolean = false,
        newAvatarColor: String? = null,
    ) {
        val token = currentAuthToken() ?: return
        val cleanName = newName?.trim()?.takeIf { it.isNotEmpty() }
        val cleanColor = newAvatarColor?.trim()?.takeIf { it.isNotEmpty() }
        if (cleanName == null && newAvatarUri == null && !removeAvatar && cleanColor == null) return
        val isComm = _state.value.groupDetails?.takeIf { it.id == groupId }?.isCommunity
            ?: _state.value.groups.firstOrNull { it.id == groupId }?.isCommunity
            ?: false
        val entityCap = if (isComm) "Community" else "Group"
        val entityLow = if (isComm) "community" else "group"
        viewModelScope.launch {
            try {
                var finalAvatarUrl: String? = _state.value.groupDetails?.avatarUrl
                    ?: _state.value.groups.firstOrNull { it.id == groupId }?.avatarUrl
                var avatarChanged = false

                if (removeAvatar) {
                    finalAvatarUrl = null
                    avatarChanged = true
                } else if (newAvatarUri != null) {
                    val (b, n, m, _) = readAttachmentBytes(newAvatarUri, null)
                        ?: throw IllegalStateException("Could not read $entityLow photo")
                    finalAvatarUrl = TursoApiClient.uploadMediaBytes(b, n, m, token)
                    avatarChanged = true
                }

                if (cleanName != null) {
                    TursoApiClient.rpcRaw(
                        "manageGroup",
                        mapOf("groupId" to groupId, "subOp" to "rename", "name" to cleanName),
                        token
                    )
                }
                if (avatarChanged) {
                    TursoApiClient.rpcRaw(
                        "manageGroup",
                        mapOf("groupId" to groupId, "subOp" to "setAvatar", "avatarUrl" to finalAvatarUrl),
                        token
                    )
                }
                if (cleanColor != null) {
                    TursoApiClient.rpcRaw(
                        "manageGroup",
                        mapOf("groupId" to groupId, "subOp" to "setAvatarColor", "avatarColor" to cleanColor),
                        token
                    )
                }
                _state.update { cur ->
                    val nextDetails = cur.groupDetails?.let {
                        if (it.id == groupId) {
                            it.copy(
                                name = cleanName ?: it.name,
                                avatarUrl = finalAvatarUrl,
                                avatarColor = cleanColor ?: it.avatarColor,
                            )
                        } else it
                    }
                    if (nextDetails != null) {
                        cache.saveGroupDetailsCache(cur.slotId, groupId, nextDetails)
                    }
                    cur.copy(
                        groupDetails = nextDetails,
                        groups = cur.groups.map {
                            if (it.id == groupId) {
                                it.copy(
                                    name = cleanName ?: it.name,
                                    avatarUrl = finalAvatarUrl,
                                    avatarColor = cleanColor ?: it.avatarColor,
                                )
                            } else it
                        },
                    )
                }
                showToast("$entityCap profile saved!")
            } catch (e: Throwable) {
                showToast(e.message ?: "Failed to update $entityLow profile")
            }
        }
    }

    fun setCommunityModerators(userIds: List<String>) {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("setCommunityModerators", mapOf("userIds" to userIds), token)
                _state.update { cur ->
                    cur.copy(
                        communityPermissions = cur.communityPermissions.copy(moderatorIds = userIds)
                    )
                }
                showToast("Community moderators saved!")
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not save moderators")
            }
        }
    }

    fun addGroupMembers(groupId: String, memberIds: List<String>) {
        val token = currentAuthToken() ?: return
        val me = _state.value.me ?: return
        if (memberIds.isEmpty()) return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw(
                    "manageGroup",
                    mapOf("groupId" to groupId, "subOp" to "addMembers", "memberIds" to memberIds),
                    token
                )
                val detRoot = TursoApiClient.rpcRaw("getGroupDetails", mapOf("groupId" to groupId), token).jsonObject
                val updatedDetails = detRoot["details"]?.let {
                    if (it is kotlinx.serialization.json.JsonNull) null
                    else JaTextJson.decodeFromJsonElement(GroupDetails.serializer(), it)
                }
                if (updatedDetails != null) {
                    cache.saveGroupDetailsCache(_state.value.slotId, groupId, updatedDetails)
                    _state.update { cur ->
                        cur.copy(
                            groupDetails = if (cur.activeGroupId == groupId) updatedDetails else cur.groupDetails,
                            groups = cur.groups.map { g ->
                                if (g.id == groupId) g.copy(memberCount = updatedDetails.members.size) else g
                            },
                        )
                    }
                    try {
                        JaTextCryptoEngine.ensureOrDistributeGroupEpoch(
                            context = appCtx,
                            myUserId = me.id,
                            groupId = groupId,
                            memberUserIds = updatedDetails.members.map { it.id },
                            token = token,
                            forceRedistribute = true,
                        )
                    } catch (_: Throwable) {
                    }
                }
                showToast("Added ${memberIds.size} member${if (memberIds.size == 1) "" else "s"}!")
            } catch (e: Throwable) {
                showToast(e.message ?: "Failed to add members")
            }
        }
    }

    fun setGroupMemberMuted(groupId: String, userId: String, muted: Boolean) {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw(
                    "manageGroup",
                    mapOf("groupId" to groupId, "subOp" to "setMuted", "userId" to userId, "muted" to muted),
                    token
                )
                _state.update { cur ->
                    val nextDet = cur.groupDetails?.let { det ->
                        if (det.id == groupId) {
                            det.copy(members = det.members.map { m -> if (m.id == userId) m.copy(muted = muted) else m })
                        } else det
                    }
                    if (nextDet != null) cache.saveGroupDetailsCache(cur.slotId, groupId, nextDet)
                    cur.copy(groupDetails = nextDet)
                }
                showToast(if (muted) "Member muted" else "Member unmuted")
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not update mute state")
            }
        }
    }

    fun setGroupMemberRole(groupId: String, userId: String, role: String) {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw(
                    "manageGroup",
                    mapOf("groupId" to groupId, "subOp" to "setRole", "userId" to userId, "role" to role),
                    token
                )
                _state.update { cur ->
                    val nextDet = cur.groupDetails?.let { det ->
                        if (det.id == groupId) {
                            det.copy(members = det.members.map { m -> if (m.id == userId) m.copy(role = role) else m })
                        } else det
                    }
                    if (nextDet != null) cache.saveGroupDetailsCache(cur.slotId, groupId, nextDet)
                    cur.copy(groupDetails = nextDet)
                }
                showToast(if (role == "moderator") "Promoted to moderator" else "Removed moderator role")
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not update role")
            }
        }
    }

    fun removeGroupMemberAsOwner(groupId: String, userId: String) {
        val token = currentAuthToken() ?: return
        val me = _state.value.me ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw(
                    "manageGroup",
                    mapOf("groupId" to groupId, "subOp" to "removeMember", "userId" to userId),
                    token
                )
                var remainingMemberIds: List<String> = emptyList()
                _state.update { cur ->
                    val nextDet = cur.groupDetails?.let { det ->
                        if (det.id == groupId) {
                            val rem = det.members.filterNot { it.id == userId }
                            remainingMemberIds = rem.map { it.id }
                            det.copy(members = rem)
                        } else det
                    }
                    if (nextDet != null) cache.saveGroupDetailsCache(cur.slotId, groupId, nextDet)
                    cur.copy(
                        groupDetails = nextDet,
                        groups = cur.groups.map { g ->
                            if (g.id == groupId && nextDet != null) g.copy(memberCount = nextDet.members.size) else g
                        },
                    )
                }
                if (remainingMemberIds.isNotEmpty()) {
                    try {
                        JaTextCryptoEngine.ensureOrDistributeGroupEpoch(
                            context = appCtx,
                            myUserId = me.id,
                            groupId = groupId,
                            memberUserIds = remainingMemberIds,
                            token = token,
                            rotateEpoch = true,
                        )
                    } catch (_: Throwable) {
                    }
                }
                showToast("Removed from group")
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not remove member")
            }
        }
    }

    fun saveImageMediaToFavorites(
        rawUrl: String,
        encryptedAttachment: EncryptedBlobDescriptor? = null,
        fallbackName: String = "Saved media",
    ) {
        val token = currentAuthToken() ?: return
        if (encryptedAttachment == null) {
            val resolved = TursoApiClient.resolveAbsoluteMediaUrl(rawUrl)
            val isGif = resolved.lowercase().contains(".gif")
            toggleStickerFavorite(
                StickerMedia(
                    key = "fav:$resolved",
                    url = resolved,
                    previewUrl = resolved,
                    name = fallbackName,
                    mediaType = if (isGif) "gif" else "sticker",
                    source = "custom",
                    isFavorite = true,
                ),
                favorite = true,
            )
            showToast("Saved to Favourites!")
            return
        }
        viewModelScope.launch {
            try {
                val absUrl = TursoApiClient.resolveAbsoluteMediaUrl(rawUrl)
                val decFile = JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(appCtx, absUrl, encryptedAttachment)
                    ?: throw IllegalStateException("Could not read image")
                val bytes = withContext(Dispatchers.IO) { decFile.readBytes() }
                val mime = encryptedAttachment.mt.ifBlank { "image/png" }
                val cleanName = encryptedAttachment.n.ifBlank { fallbackName }
                val uploadedUrl = TursoApiClient.uploadMediaBytes(bytes, cleanName, mime, token)
                val isGif = mime.contains("gif", ignoreCase = true) || cleanName.endsWith(".gif", ignoreCase = true)
                toggleStickerFavorite(
                    StickerMedia(
                        key = "fav:$uploadedUrl",
                        url = uploadedUrl,
                        previewUrl = uploadedUrl,
                        name = cleanName,
                        mediaType = if (isGif) "gif" else "sticker",
                        source = "custom",
                        isFavorite = true,
                    ),
                    favorite = true,
                )
                showToast("Saved to Favourites!")
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not save to Favourites")
            }
        }
    }

    suspend fun checkUsernameAvailability(username: String): Pair<Boolean, String?> {
        val token = currentAuthToken() ?: return false to "Not signed in"
        return try {
            val root = TursoApiClient.rpcRaw("checkUsername", mapOf("username" to username.trim().lowercase()), token).jsonObject
            val avail = root["available"]?.jsonPrimitive?.booleanOrNull == true
            val msg = root["message"]?.jsonPrimitive?.contentOrNull
            avail to msg
        } catch (e: Throwable) {
            false to e.message
        }
    }

    suspend fun saveProfile(
        displayName: String,
        username: String,
        bio: String,
        pronouns: String,
        avatarColor: String,
        avatarUri: Uri? = null,
        bannerUri: Uri? = null,
        removeAvatar: Boolean = false,
        removeBanner: Boolean = false,
        socials: List<UserSocialLink>? = null,
        website: UserWebsiteLink? = null,
        syncedTheme: SyncedThemePayload? = null,
    ) {
        val me = _state.value.me ?: return
        val token = currentAuthToken() ?: return
        var finalAvatarUrl: String? = me.avatarUrl
        var finalBannerUrl: String? = me.bannerUrl

        if (removeAvatar) {
            finalAvatarUrl = null
        } else if (avatarUri != null) {
            val (b, n, m, _) = readAttachmentBytes(avatarUri, null) ?: throw IllegalStateException("Could not read avatar")
            finalAvatarUrl = TursoApiClient.uploadMediaBytes(b, n, m, token)
        }

        if (removeBanner) {
            finalBannerUrl = null
        } else if (bannerUri != null) {
            val (b, n, m, _) = readAttachmentBytes(bannerUri, null) ?: throw IllegalStateException("Could not read banner")
            finalBannerUrl = TursoApiClient.uploadMediaBytes(b, n, m, token)
        }

        val args = mutableMapOf<String, Any?>(
            "displayName" to displayName.trim(),
            "username" to username.trim().lowercase(),
            "bio" to bio.trim(),
            "pronouns" to pronouns.trim(),
            "avatarColor" to avatarColor,
            "avatarUrl" to finalAvatarUrl,
            "bannerUrl" to finalBannerUrl,
            "socials" to (socials ?: me.socials ?: emptyList()).map {
                mapOf("platform" to it.platform, "handle" to it.handle, "url" to it.url)
            },
            "website" to (website ?: me.website)?.let {
                if (it.url.isBlank()) null else mapOf("title" to it.title, "url" to it.url)
            },
        )
        val effSynced = syncedTheme ?: me.syncedTheme
        if (effSynced != null) {
            args["syncedTheme"] = buildMap<String, Any?> {
                put("k", effSynced.k)
                if (effSynced.d != null) put("d", effSynced.d)
                if (effSynced.p != null) put("p", effSynced.p)
                if (effSynced.c != null) {
                    put(
                        "c",
                        mapOf(
                            "a" to effSynced.c.a,
                            "cols" to effSynced.c.cols,
                            "ang" to effSynced.c.ang,
                            "int" to effSynced.c.int,
                        )
                    )
                }
                put("u", effSynced.u ?: System.currentTimeMillis())
            }
        }

        val root = TursoApiClient.rpcRaw("saveProfile", args, token).jsonObject
        val updatedMe = root["me"]?.let { JaTextJson.decodeFromJsonElement(JaUser.serializer(), it) }
        if (updatedMe != null) {
            cache.upsertSlotSession(_state.value.slotId, token, updatedMe)
            _state.update { it.copy(me = updatedMe, accounts = cache.getAccounts()) }
        }
    }

    fun setPresenceStatus(status: String, customStatus: String) {
        val token = currentAuthToken() ?: return
        _state.update { cur ->
            cur.copy(me = cur.me?.copy(statusPreference = status, customStatus = customStatus))
        }
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw("setActivity", mapOf("status" to status, "customStatus" to customStatus), token)
                _state.value.me?.let { me ->
                    JaTextCryptoEngine.syncStateToNativePushDecryptor(
                        appCtx,
                        me.id,
                        token,
                        _state.value.notificationsEnabled,
                        status == "dnd"
                    )
                }
            } catch (_: Throwable) {
            }
        }
    }

    /* ==================== Theme & Outgoing Bubble Style + Cross-Device Sync ==================== */

    private fun loadThemeForScope(scopeKey: String, remoteSynced: SyncedThemePayload? = null) {
        val raw = cache.getThemeJson(scopeKey)
        var cfg = if (!raw.isNullOrBlank()) {
            try {
                JaTextJson.decodeFromString<JaTextThemeConfig>(raw)
            } catch (_: Throwable) {
                JaTextThemeConfig()
            }
        } else {
            JaTextThemeConfig()
        }
        if (remoteSynced != null && cfg.syncAcrossDevices && (remoteSynced.u ?: 0L) >= cfg.updatedAt) {
            cfg = JaTextThemeManager.applyRemotePayload(cfg, remoteSynced)
            cache.setThemeJson(scopeKey, JaTextJson.encodeToString(cfg))
        }
        _state.update { it.copy(themeConfig = cfg) }
    }

    private fun applyRemoteSyncedTheme(userId: String, remote: SyncedThemePayload) {
        val next = JaTextThemeManager.applyRemotePayload(_state.value.themeConfig, remote)
        cache.setThemeJson(userId, JaTextJson.encodeToString(next))
        _state.update { it.copy(themeConfig = next) }
    }

    fun updateThemeConfig(next: JaTextThemeConfig, pushRemoteIfSynced: Boolean = true) {
        val stamped = next.copy(updatedAt = System.currentTimeMillis())
        val scopeKey = _state.value.me?.id?.ifBlank { "global" } ?: "global"
        cache.setThemeJson(scopeKey, JaTextJson.encodeToString(stamped))
        _state.update { it.copy(themeConfig = stamped) }

        if (pushRemoteIfSynced && stamped.syncAcrossDevices && _state.value.me != null) {
            val me = _state.value.me!!
            val payload = JaTextThemeManager.toSyncedPayload(stamped)
            viewModelScope.launch {
                try {
                    saveProfile(
                        displayName = me.displayName,
                        username = me.username,
                        bio = me.bio,
                        pronouns = me.pronouns,
                        avatarColor = me.avatarColor,
                        syncedTheme = payload,
                    )
                } catch (_: Throwable) {
                }
            }
        }
    }

    fun setOutgoingBubbleStyle(styleId: String) {
        cache.setOutgoingBubbleStyle(_state.value.slotId, styleId)
        _state.update { it.copy(outgoingBubbleStyle = styleId) }
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw(
                    op = "upsertSticker",
                    args = mapOf(
                        "sticker" to mapOf(
                            "key" to "pref:bubble:v1",
                            "url" to "${BuildConfig.API_ORIGIN.trimEnd('/')}/favicon.ico",
                            "name" to "${JaTextCryptoEngine.E2EE_BUBBLE_PREF_PREFIX}$styleId",
                            "mediaType" to "sticker",
                            "source" to "upload",
                        ),
                        "isFavorite" to false,
                    ),
                    token = token,
                )
            } catch (_: Throwable) {
            }
        }
    }

    fun syncMessagesAndKeysNow() {
        val me = _state.value.me ?: return
        val token = currentAuthToken() ?: return
        if (_state.value.isSyncingKeysAndMessages) return
        _state.update { it.copy(isSyncingKeysAndMessages = true) }
        viewModelScope.launch {
            try {
                JaTextCryptoEngine.clearDecryptedCaches()
                val boot = TursoApiClient.rpc<BootstrapResponse>(
                    op = "bootstrap",
                    token = token,
                    onRefreshedToken = { refreshed ->
                        cache.upsertSlotSession(_state.value.slotId, refreshed, me)
                    }
                )
                val effectiveToken = boot.refreshedToken ?: token
                val combinedStickers = (boot.stickerFavorites + boot.recentStickers)
                    .distinctBy { "${it.key}|${it.url}" }
                rawStickerItemsCache = combinedStickers
                val peerIds = (boot.friends.map { it.id } + boot.me.id).distinct()
                JaTextCryptoEngine.refreshPeerBundles(peerIds, effectiveToken)
                reconcileMultiDeviceKeyringAndRehydrate(
                    me = boot.me,
                    rawStickers = combinedStickers,
                    token = effectiveToken,
                    forcePush = true,
                    forceRehydrate = true,
                )
                applyBootstrapState(_state.value.slotId, effectiveToken, boot, fromCache = false)
                rehydrateActiveThreadAfterKeySync(boot.me.id, effectiveToken)
                showToast("Synced messages & encryption keys!")
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not sync messages & keys")
            } finally {
                _state.update {
                    it.copy(
                        isSyncingKeysAndMessages = false,
                        lastKeySyncAt = System.currentTimeMillis(),
                    )
                }
            }
        }
    }

    fun restoreE2EEVault(secretInput: String, useRecoveryKey: Boolean, onSuccess: () -> Unit = {}) {
        val me = _state.value.me ?: return
        val token = currentAuthToken() ?: return
        if (secretInput.trim().isEmpty()) {
            showToast(if (useRecoveryKey) "Enter your 24-character Recovery Key" else "Enter your E2EE Vault PIN")
            return
        }
        _state.update { it.copy(isSyncingKeysAndMessages = true) }
        viewModelScope.launch {
            try {
                val restoredPrimary = JaTextCryptoEngine.restoreVaultFromServer(
                    context = appCtx,
                    userId = me.id,
                    secretInput = secretInput.trim(),
                    useRecoveryKey = useRecoveryKey,
                    stickerItems = rawStickerItemsCache,
                    token = token,
                )
                val fp = JaTextCryptoEngine.computeKeyFingerprint(
                    restoredPrimary.dhPubB64,
                    restoredPrimary.sigPubB64
                )
                _state.update {
                    it.copy(
                        myKeyId = restoredPrimary.keyId,
                        myKeyFingerprint = fp,
                        lastKeySyncAt = System.currentTimeMillis(),
                    )
                }
                rehydrateActiveThreadAfterKeySync(me.id, token)
                val boot = TursoApiClient.rpc<BootstrapResponse>(op = "bootstrap", token = token)
                decryptSidebarPreviewsAsync(_state.value.slotId, boot, token)
                showToast("E2EE Vault unlocked & messages synced!")
                onSuccess()
            } catch (e: Throwable) {
                showToast(e.message ?: "Failed to unlock E2EE Vault")
            } finally {
                _state.update { it.copy(isSyncingKeysAndMessages = false) }
            }
        }
    }

    fun setWallpaperForCurrentScope(kind: String, url: String?, presetId: String? = null, customImageUri: Uri? = null) {
        val st = _state.value
        val me = st.me ?: return
        val token = currentAuthToken() ?: return
        val scopeKey = when {
            st.activeGroupId != null -> "grp:${st.activeGroupId}"
            st.activeChatId != null -> "dm:${st.activeChatId}"
            else -> return
        }
        viewModelScope.launch {
            try {
                var resolvedUrl = url
                if (kind == "custom" && customImageUri != null) {
                    val (b, n, m, _) = readAttachmentBytes(customImageUri, null) ?: return@launch
                    resolvedUrl = TursoApiClient.uploadMediaBytes(b, n, m, token)
                }
                cache.setWallpaperUrl(scopeKey, if (kind == "none") null else resolvedUrl)
                _state.update { it.copy(wallpaperNonce = it.wallpaperNonce + 1) }
                val sigText = JaTextCryptoEngine.serializeWallpaperSignal(
                    kind = kind,
                    url = resolvedUrl,
                    presetId = presetId,
                    actorName = me.displayName.ifBlank { me.username }
                )
                if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
                    sendInternalDmSignal(st.activeChatId, sigText, silent = false)
                } else if (st.activeGroupId != null) {
                    sendInternalGroupSignal(st.activeGroupId, sigText, silent = false)
                }
                triggerImmediateSync(burst = true)
                showToast(if (kind == "none") "Wallpaper cleared" else "Chat wallpaper updated!")
            } catch (_: Throwable) {
            }
        }
    }

    suspend fun computePeerSecurityCode(peerId: String): Pair<String, String>? {
        val me = _state.value.me ?: return null
        val token = currentAuthToken() ?: return null
        val myIdent = JaTextCryptoEngine.ensureOrCreatePrimaryIdentity(appCtx, me.id)
        val peerBundles = JaTextCryptoEngine.ensurePeerBundles(listOf(peerId), token)[peerId].orEmpty()
        val peerPrimary = peerBundles.firstOrNull() ?: return null
        val code = JaTextCryptoEngine.computeSafetyNumber(
            me.id, myIdent.dhPubB64, myIdent.sigPubB64,
            peerId, peerPrimary.dhPubB64, peerPrimary.sigPubB64,
        )
        val peerFp = JaTextCryptoEngine.computeKeyFingerprint(peerPrimary.dhPubB64, peerPrimary.sigPubB64)
        return code to peerFp
    }

    /* ==================== Native OTA APK Update Check & Installer ==================== */

    fun checkApkUpdate(manual: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!manual && now - lastUpdateCheckAtMs < 15_000L) return
        lastUpdateCheckAtMs = now
        viewModelScope.launch {
            val manifest = TursoApiClient.fetchLatestApkManifest()
            if (manifest == null) {
                if (manual) showToast("Could not reach update server")
                return@launch
            }
            // A web-only change rebuilds the APK without bumping versionCode, so
            // comparing version codes alone silently hides those updates. When the
            // codes match, fall back to the commit each build was cut from.
            val remoteSha = manifest.commitSha?.trim().orEmpty()
            val localSha = BuildConfig.BUILD_COMMIT.trim()
            val isSameCodeRebuild =
                manifest.versionCode == BuildConfig.VERSION_CODE &&
                    remoteSha.isNotEmpty() &&
                    localSha.isNotEmpty() &&
                    localSha != "unknown" &&
                    !remoteSha.equals(localSha, ignoreCase = true)
            if (manifest.versionCode > BuildConfig.VERSION_CODE || isSameCodeRebuild) {
                _state.update { it.copy(availableUpdate = manifest) }
                resumePendingApkDownloadIfAny()
            } else if (manual) {
                showToast("You are on the latest JaText v${BuildConfig.VERSION_NAME} (Build ${BuildConfig.VERSION_CODE})")
            }
        }
    }

    fun dismissUpdatePrompt() {
        _state.update { it.copy(availableUpdate = null) }
    }

    private fun launchApkInstallerIntent(activity: Activity, apkFile: File) {
        val apkUri = FileProvider.getUriForFile(
            appCtx,
            "${appCtx.packageName}.fileprovider",
            apkFile
        )
        val installIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(installIntent)
    }

    fun downloadAndInstallApkUpdate(activity: Activity) {
        val manifest = _state.value.availableUpdate ?: return
        if (_state.value.updateDownloading) return
        // A previous attempt may have finished downloading before the screen
        // locked. Installing what is already there beats downloading again.
        val readyFile = pendingReadyApkFile
        if (readyFile != null && readyFile.exists() && readyFile.length() > 0L) {
            launchApkInstallFlow(activity, readyFile)
            return
        }
        startApkDownload(manifest, activity, autoResume = false)
    }

    /**
     * Picks an interrupted update back up on its own. Only ever resumes a
     * download the user had already started, it never starts a new one.
     */
    fun resumePendingApkDownloadIfAny() {
        val pending = cache.getPendingApkDownload() ?: return
        val manifest = _state.value.availableUpdate ?: return
        if (!manifest.downloadUrl.equals(pending.first, ignoreCase = true)) return
        if (_state.value.updateDownloading) return
        val readyFile = pendingReadyApkFile
        if (readyFile != null && readyFile.exists() && readyFile.length() > 0L) return
        startApkDownload(manifest, null, autoResume = true)
    }

    private fun startApkDownload(
        manifest: ApkVersionManifest,
        activity: Activity?,
        autoResume: Boolean,
    ) {
        _state.update { it.copy(updateDownloading = true, updateProgress = 0.02f) }
        cache.setPendingApkDownload(manifest.downloadUrl, manifest.versionCode)
        apkDownloadJob?.cancel()
        apkDownloadJob = viewModelScope.launch {
            // Without these the system parks the CPU and lets Wi-Fi doze as
            // soon as the screen turns off, which is what used to stall the
            // download until the user unlocked the phone again.
            val wakeLock = runCatching {
                val pm = appCtx.getSystemService(Context.POWER_SERVICE) as? PowerManager
                pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "JaText:ApkUpdate")?.also {
                    it.acquire(20 * 60 * 1000L)
                }
            }.getOrNull()
            val wifiLock = runCatching {
                val wm = appCtx.applicationContext.getSystemService(Context.WIFI_SERVICE) as? android.net.wifi.WifiManager
                wm?.createWifiLock(android.net.wifi.WifiManager.WIFI_MODE_FULL_HIGH_PERF, "JaText:ApkUpdate")
                    ?.also { it.acquire() }
            }.getOrNull()
            try {
                val outFile = File(appCtx.cacheDir, "updates/JaText-update.apk")
                var failure: Throwable? = null
                for (attempt in 0 until 4) {
                    try {
                        TursoApiClient.downloadApkFile(manifest.downloadUrl, outFile) { p ->
                            _state.update { it.copy(updateProgress = p, updateDownloading = true) }
                        }
                        failure = null
                        break
                    } catch (e: Throwable) {
                        if (!isActive) return@launch
                        failure = e
                        // Anything already written is kept, so the retry only
                        // fetches the missing tail instead of the whole file.
                        if (attempt < 3) delay(1_500L * (attempt + 1))
                    }
                }
                if (failure != null) {
                    _state.update { it.copy(updateDownloading = false) }
                    if (!autoResume) showToast(failure.message ?: "Update download failed")
                    return@launch
                }
                cache.clearPendingApkDownload()
                _state.update { it.copy(updateDownloading = false, updateProgress = 1f) }
                val target = activity
                if (target == null) {
                    // No screen to install from, hold the file for the next
                    // time the user taps update.
                    pendingReadyApkFile = outFile
                    return@launch
                }
                launchApkInstallFlow(target, outFile)
            } finally {
                runCatching { wifiLock?.release() }
                runCatching { wakeLock?.release() }
            }
        }
    }

    private fun launchApkInstallFlow(activity: Activity, apkFile: File) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()
        ) {
            pendingReadyApkFile = apkFile
            showToast("Allow 'Install unknown apps' for JaText to finish updating")
            val permIntent = Intent(
                android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${activity.packageName}")
            )
            activity.startActivity(permIntent)
            return
        }
        pendingReadyApkFile = null
        cache.clearPendingApkDownload()
        _state.update { it.copy(updateDownloading = false, availableUpdate = null) }
        launchApkInstallerIntent(activity, apkFile)
    }

    private fun checkPostUpdateWelcome() {
        val prev = cache.getLastSeenVersionCode()
        val cur = BuildConfig.VERSION_CODE
        if (prev in 1 until cur) {
            _state.update { it.copy(showPostUpdateWelcome = true) }
        }
        cache.setLastSeenVersionCode(cur)
    }

    fun dismissPostUpdateWelcome() {
        _state.update { it.copy(showPostUpdateWelcome = false) }
    }

    /* ==================== Internal Signal Helpers & List Merging ==================== */

    private suspend fun sendInternalDmSignal(receiverId: String, plainBody: String, silent: Boolean) {
        val me = _state.value.me ?: return
        val token = currentAuthToken() ?: return
        val payload = E2EEPlainPayload(v = 1, b = plainBody)
        val wire = try {
            JaTextCryptoEngine.encryptDmMessage(appCtx, me.id, receiverId, payload, token, silentSignal = silent)
        } catch (_: Throwable) {
            null
        }
        val bodyToSend = wire ?: if (silent) "${JaTextCryptoEngine.E2EE_SIGNAL_PREFIX}$plainBody" else plainBody
        try {
            TursoApiClient.rpcRaw("sendMessage", mapOf("receiverId" to receiverId, "body" to bodyToSend), token)
        } catch (_: Throwable) {
        }
    }

    private suspend fun sendInternalGroupSignal(groupId: String, plainBody: String, silent: Boolean) {
        val me = _state.value.me ?: return
        val token = currentAuthToken() ?: return
        val memberIds = _state.value.groupDetails?.members?.map { it.id }.orEmpty()
        val payload = E2EEPlainPayload(v = 1, b = plainBody)
        val wire = try {
            JaTextCryptoEngine.encryptGroupMessage(appCtx, me.id, groupId, memberIds, payload, token, silentSignal = silent)
        } catch (_: Throwable) {
            if (silent) "${JaTextCryptoEngine.E2EE_SIGNAL_PREFIX}$plainBody" else plainBody
        }
        try {
            TursoApiClient.rpcRaw("sendGroupMessage", mapOf("groupId" to groupId, "body" to wire), token)
        } catch (_: Throwable) {
        }
    }

    private fun hydrateCommunityList(list: List<CommunityMessage>): List<CommunityMessage> {
        return list
            .filterNot { it.deleted || it.type == "deleted" || locallyHardDeletedCommIds.contains(it.id) }
            .map { m ->
                if (m.unsentAt != null) {
                    m.copy(body = "")
                } else {
                    val (clean, bubble) = JaTextCryptoEngine.extractMessageBubbleStyle(m.body, m.attachmentType)
                    val (fwd, stripped) = JaTextCryptoEngine.extractForwardedContext(clean)
                    val absAtt = m.attachmentUrl?.takeIf { it.isNotBlank() }?.let {
                        TursoApiClient.resolveAbsoluteMediaUrl(it)
                    }
                    val absSticker = m.stickerUrl?.takeIf { it.isNotBlank() }?.let {
                        TursoApiClient.resolveAbsoluteMediaUrl(it)
                    }
                    val cleanReply = m.replyTo?.let { r ->
                        val (rClean, _) = JaTextCryptoEngine.extractMessageBubbleStyle(r.body, null)
                        val (_, rNoFwd) = JaTextCryptoEngine.extractForwardedContext(rClean)
                        val safeBody = ViewOnceCodec.sanitizePreview(rNoFwd.trim())
                        r.copy(body = safeBody.ifBlank { r.attachmentName ?: "Announcement" })
                    }
                    m.copy(
                        body = stripped,
                        attachmentUrl = absAtt,
                        stickerUrl = absSticker,
                        bubbleStyle = m.bubbleStyle ?: bubble,
                        forwardedContext = fwd ?: m.forwardedContext,
                        replyTo = cleanReply,
                    )
                }
            }
    }

    private fun mergeDmMessages(existing: List<ChatMessage>, incoming: List<ChatMessage>): List<ChatMessage> {
        val map = LinkedHashMap<String, ChatMessage>()
        for (m in existing) map[m.id] = m
        for (m in incoming) {
            var inheritedKey: String? = m.renderKey?.takeIf { it.isNotBlank() }
            // Deduplicate any optimistic bubble from me within 60s skew window
            if (!m.id.startsWith("opt-")) {
                val optEntry = map.entries.firstOrNull { (k, v) ->
                    k.startsWith("opt-") &&
                        v.senderId == m.senderId &&
                        v.body == m.body &&
                        kotlin.math.abs(v.createdAt - m.createdAt) < 60_000L
                }
                if (optEntry != null) {
                    if (inheritedKey == null) inheritedKey = optEntry.value.renderKey?.takeIf { it.isNotBlank() } ?: optEntry.key
                    map.remove(optEntry.key)
                }
            }
            val prev = map[m.id]
            if (inheritedKey == null) inheritedKey = prev?.renderKey?.takeIf { it.isNotBlank() }
            val mergedStatus = if (prev != null && m.deliveryStatus != null && prev.deliveryStatus != null) {
                val rankPrev = when (prev.deliveryStatus) {
                    "read" -> 3
                    "delivered" -> 2
                    else -> 1
                }
                val rankNext = when (m.deliveryStatus) {
                    "read" -> 3
                    "delivered" -> 2
                    else -> 1
                }
                if (rankPrev > rankNext) prev.deliveryStatus else m.deliveryStatus
            } else {
                m.deliveryStatus ?: prev?.deliveryStatus
            }
            map[m.id] = m.copy(
                deliveryStatus = mergedStatus,
                renderKey = inheritedKey ?: m.renderKey,
            )
        }
        return map.values.sortedBy { it.createdAt }
    }

    private fun mergeGroupMessages(existing: List<GroupMessage>, incoming: List<GroupMessage>): List<GroupMessage> {
        val map = LinkedHashMap<String, GroupMessage>()
        for (m in existing) map[m.id] = m
        for (m in incoming) {
            var inheritedKey: String? = m.renderKey?.takeIf { it.isNotBlank() }
            if (!m.id.startsWith("opt-")) {
                val optEntry = map.entries.firstOrNull { (k, v) ->
                    k.startsWith("opt-") &&
                        v.senderId == m.senderId &&
                        v.body == m.body &&
                        kotlin.math.abs(v.createdAt - m.createdAt) < 60_000L
                }
                if (optEntry != null) {
                    if (inheritedKey == null) inheritedKey = optEntry.value.renderKey?.takeIf { it.isNotBlank() } ?: optEntry.key
                    map.remove(optEntry.key)
                }
            }
            val prev = map[m.id]
            if (inheritedKey == null) inheritedKey = prev?.renderKey?.takeIf { it.isNotBlank() }
            map[m.id] = if (inheritedKey != null) m.copy(renderKey = inheritedKey) else m
        }
        return map.values.sortedBy { it.createdAt }
    }

    private fun mergeCommunityMessages(existing: List<CommunityMessage>, incoming: List<CommunityMessage>): List<CommunityMessage> {
        val map = LinkedHashMap<String, CommunityMessage>()
        for (m in existing) map[m.id] = m
        for (m in incoming) {
            var inheritedKey: String? = m.renderKey?.takeIf { it.isNotBlank() }
            if (!m.id.startsWith("opt-")) {
                val optEntry = map.entries.firstOrNull { (k, v) ->
                    k.startsWith("opt-") &&
                        v.senderId == m.senderId &&
                        v.body == m.body &&
                        kotlin.math.abs(v.createdAt - m.createdAt) < 60_000L
                }
                if (optEntry != null) {
                    if (inheritedKey == null) inheritedKey = optEntry.value.renderKey?.takeIf { it.isNotBlank() } ?: optEntry.key
                    map.remove(optEntry.key)
                }
            }
            val prev = map[m.id]
            if (inheritedKey == null) inheritedKey = prev?.renderKey?.takeIf { it.isNotBlank() }
            map[m.id] = if (inheritedKey != null) m.copy(renderKey = inheritedKey) else m
        }
        return map.values.sortedBy { it.createdAt }
    }

    private data class AttachmentInputData(
        val bytes: ByteArray,
        val fileName: String,
        val mimeType: String,
        val localFile: File?,
    )

    private fun queryUriSize(uri: Uri): Long {
        return try {
            appCtx.contentResolver.query(uri, null, null, null, null)?.use { c ->
                val idx = c.getColumnIndex(OpenableColumns.SIZE)
                if (idx >= 0 && c.moveToFirst()) c.getLong(idx) else -1L
            } ?: -1L
        } catch (_: Throwable) {
            -1L
        }
    }

    /**
     * Reads a file without the doubling that readBytes() does. A 48 MB video
     * read with readBytes() briefly needs room for the half grown buffer and
     * the full one, which is how a single large attachment was taking the
     * whole app down before it ever reached the upload.
     */
    private fun readUriIntoArray(uri: Uri, size: Long): ByteArray {
        val out = ByteArray(size.toInt())
        appCtx.contentResolver.openInputStream(uri)?.use { input ->
            var offset = 0
            while (offset < out.size) {
                val read = input.read(out, offset, out.size - offset)
                if (read < 0) break
                offset += read
            }
        }
        return out
    }

    private suspend fun readAttachmentBytes(uri: Uri?, voiceFile: File?): AttachmentInputData? =
        withContext(Dispatchers.IO) {
            if (voiceFile != null && voiceFile.exists()) {
                if (voiceFile.length() > MAX_ATTACHMENT_BYTES) throw tooLargeToSend(voiceFile.length())
                return@withContext AttachmentInputData(
                    bytes = voiceFile.readBytes(),
                    fileName = voiceFile.name,
                    mimeType = "audio/mp4",
                    localFile = voiceFile,
                )
            }
            if (uri == null) return@withContext null
            val declaredSize = queryUriSize(uri)
            if (declaredSize > MAX_ATTACHMENT_BYTES) throw tooLargeToSend(declaredSize)
            val rawBytes = if (declaredSize > 0) {
                readUriIntoArray(uri, declaredSize)
            } else {
                appCtx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@withContext null
            }
            if (rawBytes.size > MAX_ATTACHMENT_BYTES) throw tooLargeToSend(rawBytes.size.toLong())
            val isGif = JaTextCryptoEngine.isGifBytes(rawBytes)
            val bytes = if (isGif) JaTextCryptoEngine.ensureInfiniteLoopGifBytes(rawBytes) else rawBytes
            val mime = if (isGif) "image/gif" else resolveMime(uri)
            val rawName = resolveDisplayName(uri)
            val name = if (isGif && !rawName.lowercase().endsWith(".gif")) {
                "${rawName.substringBeforeLast('.', rawName)}.gif"
            } else {
                rawName
            }
            val cacheDir = File(appCtx.cacheDir, "outgoing_media").apply { mkdirs() }
            val cached = File(cacheDir, "out_${System.currentTimeMillis()}_$name").also { it.writeBytes(bytes) }
            AttachmentInputData(bytes, name, mime, cached)
        }

    /**
     * A file this size cannot survive being read and encrypted inside the
     * budget Android gives an app, so say so plainly instead of crashing.
     */
    private fun tooLargeToSend(sizeBytes: Long): IllegalStateException {
        val mb = (sizeBytes / (1024.0 * 1024.0))
        val shown = if (mb >= 10) Math.round(mb).toString() else String.format("%.1f", mb)
        return IllegalStateException(
            "This file is ${shown} MB. Attachments must be under ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.",
        )
    }

    private fun resolveMime(uri: Uri): String =
        appCtx.contentResolver.getType(uri) ?: "application/octet-stream"

    private fun resolveDisplayName(uri: Uri): String {
        return try {
            appCtx.contentResolver.query(uri, null, null, null, null)?.use { c ->
                val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && c.moveToFirst()) c.getString(idx) else null
            } ?: "attachment"
        } catch (_: Throwable) {
            "attachment"
        }
    }

    /* ==================== QR Linked Web Devices (Max 5 Connected Devices) ==================== */

    fun clearDeviceLinkFeedback() {
        _state.update {
            it.copy(
                deviceLinkPhase = "idle",
                deviceLinkBrowserName = "",
                deviceLinkError = null,
            )
        }
    }

    fun refreshLinkedDevices() {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                val res = TursoApiClient.rpc<ListLinkedDevicesResponse>(
                    op = "listLinkedDevices",
                    args = emptyMap(),
                    token = token,
                )
                _state.update {
                    it.copy(
                        linkedDevices = res.devices,
                        maxLinkedDevices = res.maxDevices,
                    )
                }
            } catch (_: Throwable) {
            }
        }
    }

    fun disconnectLinkedDevice(deviceId: String) {
        val token = currentAuthToken() ?: return
        if (deviceId.isBlank()) return
        _state.update { it.copy(disconnectingDeviceId = deviceId) }
        viewModelScope.launch {
            try {
                val res = TursoApiClient.rpc<ListLinkedDevicesResponse>(
                    op = "disconnectLinkedDevice",
                    args = mapOf("deviceId" to deviceId),
                    token = token,
                )
                _state.update {
                    it.copy(
                        linkedDevices = res.devices,
                        maxLinkedDevices = res.maxDevices,
                        disconnectingDeviceId = null,
                    )
                }
                showToast("Device disconnected")
            } catch (e: Throwable) {
                _state.update { it.copy(disconnectingDeviceId = null) }
                showToast(e.message ?: "Failed to disconnect device")
            }
        }
    }

    fun handleScannedDeviceQrCode(rawQr: String) {
        val token = currentAuthToken() ?: return
        val me = _state.value.me ?: return
        val curState = _state.value
        if (curState.deviceLinkPhase == "syncing") return

        if (curState.linkedDevices.size >= curState.maxLinkedDevices) {
            _state.update {
                it.copy(
                    deviceLinkPhase = "error",
                    deviceLinkError = "Maximum of ${curState.maxLinkedDevices} devices connected. Disconnect at least one device first.",
                )
            }
            return
        }

        val parts = rawQr.trim().split("|")
        if (parts.size < 4 || parts[0] != "JATEXT_LINK_V1") {
            _state.update {
                it.copy(
                    deviceLinkPhase = "error",
                    deviceLinkError = "Unrecognized QR code. Open ${BuildConfig.API_ORIGIN.trimEnd('/')}/chats on your computer and scan the JaText QR code.",
                )
            }
            return
        }

        val pairingId = parts[1].trim()
        val linkSecret = parts[2].trim()
        val qrWebDhPub = parts[3].trim()

        _state.update {
            it.copy(
                deviceLinkPhase = "syncing",
                deviceLinkBrowserName = "Web",
                deviceLinkError = null,
            )
        }

        viewModelScope.launch {
            try {
                val claimed = TursoApiClient.rpc<ClaimDeviceLinkResponse>(
                    op = "claimDeviceLinkSession",
                    args = mapOf(
                        "pairingId" to pairingId,
                        "linkSecret" to linkSecret,
                    ),
                    token = token,
                )
                val resolvedBrowser = claimed.browserName.ifBlank { "Chrome" }
                _state.update {
                    it.copy(
                        deviceLinkPhase = "syncing",
                        deviceLinkBrowserName = resolvedBrowser,
                        deviceLinkError = null,
                    )
                }

                val targetDhPub = claimed.webDhPubB64.ifBlank { qrWebDhPub }
                val sealedBundleJson = withContext(Dispatchers.Default) {
                    JaTextCryptoEngine.sealDeviceLinkBundle(
                        context = appCtx,
                        userId = me.id,
                        pairingId = pairingId,
                        linkSecret = linkSecret,
                        webDhPubB64 = targetDhPub,
                        outgoingBubbleStyle = _state.value.outgoingBubbleStyle,
                        wallpapers = cache.getAllWallpapers(),
                    )
                }

                TursoApiClient.rpcRaw(
                    op = "approveDeviceLinkSession",
                    args = mapOf(
                        "pairingId" to pairingId,
                        "linkSecret" to linkSecret,
                        "sealedBundleJson" to sealedBundleJson,
                    ),
                    token = token,
                )

                // Refresh device list immediately and wait for Web to confirm message/attachment sync completion
                refreshLinkedDevices()

                val pollDeadline = System.currentTimeMillis() + 25_000L
                var completed = false
                while (System.currentTimeMillis() < pollDeadline) {
                    delay(550L)
                    val st = runCatching {
                        TursoApiClient.rpc<DeviceLinkStatusResponse>(
                            op = "getDeviceLinkStatus",
                            args = mapOf("pairingId" to pairingId),
                            token = token,
                        )
                    }.getOrNull()
                    if (st != null && st.status == "completed") {
                        completed = true
                        break
                    }
                }

                refreshLinkedDevices()
                _state.update {
                    it.copy(
                        deviceLinkPhase = "success",
                        deviceLinkBrowserName = resolvedBrowser,
                        deviceLinkError = null,
                    )
                }
                if (completed) {
                    showToast("Successfully linked the device!")
                }
            } catch (e: Throwable) {
                refreshLinkedDevices()
                _state.update {
                    it.copy(
                        deviceLinkPhase = "error",
                        deviceLinkError = e.message ?: "Failed to link device. Please try scanning again.",
                    )
                }
            }
        }
    }

    /* ==================== Scheduled Messages (v3.8.7) ==================== */

    private suspend fun hydrateScheduledItems(
        meId: String,
        rawItems: List<ScheduledMessageItem>,
        token: String,
    ): List<ScheduledMessageItem> {
        if (rawItems.isEmpty()) return emptyList()
        return rawItems.map { item ->
            val rawBody = item.body
            if (rawBody.isBlank()) return@map item
            val plainBody = when (item.targetKind) {
                "dm" -> {
                    if (rawBody.startsWith("__JATEXT_E2EE_")) {
                        val syn = ChatMessage(
                            id = "sched-${item.id}",
                            senderId = item.senderId.ifBlank { meId },
                            receiverId = item.targetId,
                            body = rawBody,
                            createdAt = item.createdAt,
                        )
                        val hydrated = runCatching {
                            JaTextCryptoEngine.hydrateDmMessages(appCtx, meId, listOf(syn), token)
                        }.getOrNull()?.firstOrNull()
                        hydrated?.body?.let { JaTextCryptoEngine.stripBubbleStyleFromText(it) }
                            ?: "Encrypted scheduled message"
                    } else {
                        JaTextCryptoEngine.stripBubbleStyleFromText(rawBody)
                    }
                }
                "group" -> {
                    if (rawBody.startsWith("__JATEXT_E2EE_")) {
                        val syn = GroupMessage(
                            id = "sched-${item.id}",
                            senderId = item.senderId.ifBlank { meId },
                            body = rawBody,
                            createdAt = item.createdAt,
                        )
                        val hydrated = runCatching {
                            JaTextCryptoEngine.hydrateGroupMessages(appCtx, meId, item.targetId, listOf(syn))
                        }.getOrNull()?.firstOrNull()
                        hydrated?.body?.let { JaTextCryptoEngine.stripBubbleStyleFromText(it) }
                            ?: "Encrypted scheduled message"
                    } else {
                        JaTextCryptoEngine.stripBubbleStyleFromText(rawBody)
                    }
                }
                else -> JaTextCryptoEngine.stripBubbleStyleFromText(rawBody)
            }
            item.copy(body = plainBody)
        }
    }

    private fun rearmScheduledFlushTimer(items: List<ScheduledMessageItem>) {
        scheduledFlushJob?.cancel()
        scheduledFlushJob = null
        if (items.isEmpty()) return
        val earliest = items.minOfOrNull { it.scheduledAt } ?: return
        scheduledFlushJob = viewModelScope.launch {
            while (true) {
                val now = System.currentTimeMillis()
                val remaining = earliest - now
                if (remaining <= 0L) break
                delay(remaining.coerceIn(150L, 45_000L))
            }
            val token = currentAuthToken() ?: return@launch
            runCatching {
                TursoApiClient.rpcRaw("flushScheduledMessages", emptyMap(), token)
            }
            refreshScheduledMessages()
            triggerImmediateSync(true)
        }
    }

    fun refreshScheduledMessages() {
        val me = _state.value.me ?: return
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                val resp = TursoApiClient.rpc<ListScheduledMessagesResponse>(
                    op = "listScheduledMessages",
                    token = token,
                )
                val hydrated = hydrateScheduledItems(me.id, resp.resolvedItems, token)
                    .sortedBy { it.scheduledAt }
                _state.update { it.copy(scheduledMessages = hydrated) }
                rearmScheduledFlushTimer(hydrated)
            } catch (_: Throwable) {
                // Keep existing scheduled state on transient network failure
            }
        }
    }

    fun scheduleChatMessage(
        targetKind: String,
        targetId: String,
        text: String,
        scheduledAt: Long,
        replyToId: String? = null,
        onScheduled: ((ScheduledMessageItem) -> Unit)? = null,
        onError: ((String) -> Unit)? = null,
    ) {
        val st = _state.value
        val me = st.me ?: return
        val token = currentAuthToken() ?: return
        val cleanText = text.trim()
        if (cleanText.isEmpty()) {
            onError?.invoke("Type a message to schedule.")
            return
        }
        if (scheduledAt <= System.currentTimeMillis() + 2_500L) {
            onError?.invoke("Pick a time in the future.")
            return
        }
        val bubble = st.outgoingBubbleStyle

        viewModelScope.launch {
            try {
                val wireBody = when (targetKind) {
                    "dm" -> {
                        val payload = E2EEPlainPayload(
                            v = 1,
                            b = JaTextCryptoEngine.attachBubbleStyleToOutgoing(cleanText, bubble),
                            bs = bubble.takeIf { it != "default" },
                        )
                        val enc = JaTextCryptoEngine.encryptDmMessage(appCtx, me.id, targetId, payload, token)
                        enc ?: JaTextCryptoEngine.attachBubbleStyleToOutgoing(cleanText, bubble)
                    }
                    "group" -> {
                        val memberIds = _state.value.groupDetails
                            ?.takeIf { _state.value.activeGroupId == targetId }
                            ?.members
                            ?.map { it.id }
                            .orEmpty()
                        val effectiveMembers = if (memberIds.isNotEmpty()) {
                            memberIds
                        } else {
                            runCatching {
                                TursoApiClient.rpc<GroupDetails>(
                                    op = "getGroupDetails",
                                    args = mapOf("groupId" to targetId),
                                    token = token,
                                ).members.map { it.id }
                            }.getOrDefault(emptyList())
                        }
                        val payload = E2EEPlainPayload(
                            v = 1,
                            b = JaTextCryptoEngine.attachBubbleStyleToOutgoing(cleanText, bubble),
                            bs = bubble.takeIf { it != "default" },
                        )
                        JaTextCryptoEngine.encryptGroupMessage(appCtx, me.id, targetId, effectiveMembers, payload, token)
                    }
                    else -> JaTextCryptoEngine.attachBubbleStyleToOutgoing(cleanText, bubble)
                }

                val args = mutableMapOf<String, Any?>(
                    "targetKind" to targetKind,
                    "targetId" to targetId,
                    "body" to wireBody,
                    "scheduledAt" to scheduledAt,
                )
                if (!replyToId.isNullOrBlank()) {
                    args["replyToId"] = replyToId
                }

                val resp = TursoApiClient.rpc<ScheduleMessageResponse>(
                    op = "scheduleMessage",
                    args = args,
                    token = token,
                )
                val uiItem = resp.resolvedItem.copy(body = cleanText)
                val updated = (_state.value.scheduledMessages.filterNot { it.id == uiItem.id } + uiItem)
                    .sortedBy { it.scheduledAt }
                _state.update { it.copy(scheduledMessages = updated) }
                rearmScheduledFlushTimer(updated)
                onScheduled?.invoke(uiItem)
            } catch (e: Throwable) {
                val msg = e.message ?: "Failed to schedule message."
                onError?.invoke(msg)
                showToast(msg)
            }
        }
    }

    fun deleteScheduledMessage(scheduledId: String) {
        val token = currentAuthToken() ?: return
        val updated = _state.value.scheduledMessages.filterNot { it.id == scheduledId }
        _state.update { it.copy(scheduledMessages = updated) }
        rearmScheduledFlushTimer(updated)
        viewModelScope.launch {
            runCatching {
                TursoApiClient.rpcRaw(
                    op = "deleteScheduledMessage",
                    args = mapOf("scheduledId" to scheduledId),
                    token = token,
                )
            }.onFailure {
                refreshScheduledMessages()
            }
        }
    }

    /* ==================== v3.9.0 Language, Drafts, View Once, Bulk Send, Pins, Folders, Soundboards & Security ==================== */

    fun setAppLanguage(code: String) {
        val clean = code.trim().ifBlank { "en" }
        cache.setLanguageCode(clean)
        com.ahad00010.jatext.data.JaTextI18n.setLanguage(appCtx, clean)
        _state.update { it.copy(languageCode = clean) }
    }

    private fun dispatchTypingRpc(threadKey: String, isTyping: Boolean) {
        val token = currentAuthToken() ?: return
        viewModelScope.launch(Dispatchers.IO) {
            try {
                when {
                    threadKey.startsWith("dm:") -> {
                        val peerId = threadKey.removePrefix("dm:").trim()
                        if (peerId.isNotEmpty()) {
                            TursoApiClient.rpcRaw(
                                "setTyping",
                                mapOf("receiverId" to peerId, "isTyping" to isTyping),
                                token,
                            )
                        }
                    }
                    threadKey.startsWith("group:") -> {
                        val grpId = threadKey.removePrefix("group:").trim()
                        if (grpId.isNotEmpty()) {
                            TursoApiClient.rpcRaw(
                                "setChannelTyping",
                                mapOf("channelId" to "group:$grpId", "isTyping" to isTyping),
                                token,
                            )
                        }
                    }
                    threadKey == "community" -> {
                        TursoApiClient.rpcRaw(
                            "setChannelTyping",
                            mapOf("channelId" to "community", "isTyping" to isTyping),
                            token,
                        )
                    }
                }
            } catch (_: Throwable) {
            }
        }
    }

    fun clearActiveTypingSignal() {
        typingIdleJob?.cancel()
        typingIdleJob = null
        val prevKey = activeTypingThreadKey
        activeTypingThreadKey = null
        lastTypingSentAtMs = 0L
        if (!prevKey.isNullOrBlank()) {
            dispatchTypingRpc(prevKey, false)
        }
    }

    fun notifyThreadTyping(threadKey: String, isTyping: Boolean) {
        if (threadKey.isBlank()) return
        val prevKey = activeTypingThreadKey
        if (prevKey != null && prevKey != threadKey) {
            dispatchTypingRpc(prevKey, false)
            activeTypingThreadKey = null
            lastTypingSentAtMs = 0L
        }
        if (!isTyping) {
            typingIdleJob?.cancel()
            typingIdleJob = null
            if (activeTypingThreadKey == threadKey) {
                activeTypingThreadKey = null
                lastTypingSentAtMs = 0L
                dispatchTypingRpc(threadKey, false)
            }
            return
        }
        val now = System.currentTimeMillis()
        if (activeTypingThreadKey != threadKey || now - lastTypingSentAtMs >= 2_700L) {
            activeTypingThreadKey = threadKey
            lastTypingSentAtMs = now
            dispatchTypingRpc(threadKey, true)
        }
        typingIdleJob?.cancel()
        typingIdleJob = viewModelScope.launch {
            delay(4_500L)
            if (activeTypingThreadKey == threadKey) {
                activeTypingThreadKey = null
                lastTypingSentAtMs = 0L
                dispatchTypingRpc(threadKey, false)
            }
        }
    }

    fun updateChatDraft(threadKey: String, text: String) {
        val slot = _state.value.slotId
        val next = _state.value.drafts.toMutableMap()
        if (text.isBlank()) {
            next.remove(threadKey)
        } else {
            next[threadKey] = text
        }
        cache.saveDrafts(slot, next)
        _state.update { it.copy(drafts = next) }
        notifyThreadTyping(threadKey, text.isNotBlank())
    }

    fun markViewOnceMessageOpened(messageId: String) {
        val cleanId = messageId.trim()
        if (cleanId.isEmpty() || cleanId.startsWith("opt-")) return
        val slot = _state.value.slotId
        val updated = _state.value.openedViewOnceIds + cleanId
        cache.saveOpenedViewOnceIds(slot, updated)
        _state.update { it.copy(openedViewOnceIds = updated) }
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            runCatching {
                TursoApiClient.rpcRaw(
                    op = "markViewOnceOpened",
                    args = mapOf("messageId" to cleanId),
                    token = token,
                )
            }
        }
    }

    fun sendBulkAttachments(
        uris: List<Uri>,
        caption: String = "",
        replyTo: ReplySummary? = null,
        spoilerUris: Set<Uri> = emptySet(),
    ) {
        if (uris.isEmpty()) return
        // Every file used to be read, encrypted and uploaded at the same
        // time, so a batch of photos or videos tried to hold all of them in
        // memory at once and took the app down. They go one after another
        // now, and the batch is capped so one tap cannot queue a hundred.
        val batch = uris.take(MAX_BULK_ATTACHMENTS)
        if (uris.size > batch.size) {
            showToast("Sending the first ${batch.size} of ${uris.size} files")
        }
        viewModelScope.launch {
            batch.forEachIndexed { idx, uri ->
                sendChatMessage(
                    text = if (idx == 0) caption else "",
                    replyTo = if (idx == 0) replyTo else null,
                    attachmentUri = uri,
                    isSpoiler = uri in spoilerUris,
                )?.join()
            }
        }
    }

    fun sendViewOnceMessage(
        text: String,
        photoUri: Uri? = null,
        audioUri: Uri? = null,
        localVoiceFile: File? = null,
        replyTo: ReplySummary? = null,
    ) {
        val st = _state.value
        val me = st.me ?: return
        val token = currentAuthToken() ?: return
        val cleanText = text.trim()
        if (cleanText.isEmpty() && photoUri == null && audioUri == null && localVoiceFile == null) return

        val isCommunity = st.activeChatId == OFFICIAL_COMMUNITY_ID
        if (isCommunity) {
            showToast("View once is available in end-to-end encrypted DMs and Groups.")
            return
        }

        val tempId = "opt-${UUID.randomUUID()}"
        val now = System.currentTimeMillis()
        val placeholderEnvelope = ViewOnceCodec.encode(
            ViewOnceEnvelopePayload(
                v = 1,
                text = cleanText.takeIf { it.isNotEmpty() },
            )
        )

        val safeReplyTo = replyTo?.copy(body = ViewOnceCodec.sanitizePreview(replyTo.body))
        if (st.activeChatId != null) {
            val receiverId = st.activeChatId
            val isSelf = receiverId == me.id
            val optMsg = ChatMessage(
                id = tempId,
                renderKey = tempId,
                senderId = me.id,
                receiverId = receiverId,
                body = placeholderEnvelope,
                deliveryStatus = if (isSelf) "read" else "sent",
                createdAt = now,
                replyTo = safeReplyTo,
            )
            lastNotifiedDmTsByFriend[receiverId] = now
            _state.update { cur ->
                val existingPreview = cur.previews.firstOrNull { it.friendId == receiverId }
                val updatedPreview = (existingPreview ?: ChatPreview(friendId = receiverId)).copy(
                    friendId = receiverId,
                    body = "View once",
                    createdAt = now,
                    senderId = me.id,
                    unreadCount = 0,
                )
                val nextPreviews = (listOf(updatedPreview) + cur.previews.filterNot { it.friendId == receiverId })
                    .sortedByDescending { it.createdAt }
                cur.copy(dmMessages = cur.dmMessages + optMsg, previews = nextPreviews)
            }

            viewModelScope.launch {
                try {
                    var photoMedia: ViewOnceMediaPayload? = null
                    if (photoUri != null) {
                        val readPhoto = readAttachmentBytes(photoUri, null)
                        if (readPhoto != null) {
                            val (plainBytes, fName, fMime, cachedFile) = readPhoto
                            val (ctBytes, desc) = JaTextCryptoEngine.encryptAttachmentBytes(plainBytes, fName, fMime)
                            if (cachedFile != null) JaTextCryptoEngine.seedOutgoingDecryptedMedia(desc.h, cachedFile)
                            val upUrl = TursoApiClient.uploadMediaBytes(ctBytes, "e2ee-vo-img.bin", "application/octet-stream", token)
                            photoMedia = ViewOnceMediaPayload(url = upUrl, name = fName, mime = fMime, att = desc)
                        }
                    }

                    var audioMedia: ViewOnceMediaPayload? = null
                    if (localVoiceFile != null || audioUri != null) {
                        val readAudio = readAttachmentBytes(audioUri, localVoiceFile)
                        if (readAudio != null) {
                            val (plainBytes, fName, fMime, cachedFile) = readAudio
                            val (ctBytes, desc) = JaTextCryptoEngine.encryptAttachmentBytes(plainBytes, fName, fMime)
                            if (cachedFile != null) JaTextCryptoEngine.seedOutgoingDecryptedMedia(desc.h, cachedFile)
                            val upUrl = TursoApiClient.uploadMediaBytes(ctBytes, "e2ee-vo-aud.bin", "application/octet-stream", token)
                            audioMedia = ViewOnceMediaPayload(url = upUrl, name = fName, mime = fMime, att = desc)
                        }
                    }

                    val voBody = ViewOnceCodec.encode(
                        ViewOnceEnvelopePayload(
                            v = 1,
                            text = cleanText.takeIf { it.isNotEmpty() },
                            photo = photoMedia,
                            audio = audioMedia,
                        )
                    )
                    val payload = E2EEPlainPayload(v = 1, b = voBody)
                    val wire = JaTextCryptoEngine.encryptDmMessage(appCtx, me.id, receiverId, payload, token)
                        ?: throw IllegalStateException("Could not encrypt view-once message.")
                    val args = mutableMapOf<String, Any?>(
                        "receiverId" to receiverId,
                        "body" to wire,
                    )
                    if (replyTo != null) args["replyToId"] = replyTo.id

                    val root = TursoApiClient.rpcRaw("sendMessage", args, token).jsonObject
                    val serverMsg = root["message"]?.let {
                        JaTextJson.decodeFromJsonElement(ChatMessage.serializer(), it)
                    }
                    if (serverMsg != null) {
                        val hydrated = JaTextCryptoEngine.hydrateDmMessages(appCtx, me.id, listOf(serverMsg), token)
                            .map { m -> if (m.id == serverMsg.id) m.copy(renderKey = tempId) else m }
                        _state.update { cur ->
                            val withoutOpt = cur.dmMessages.filterNot { m -> m.id == tempId }
                            cur.copy(dmMessages = mergeDmMessages(withoutOpt, hydrated))
                        }
                    }
                    triggerImmediateSync(true)
                } catch (e: Throwable) {
                    _state.update { cur -> cur.copy(dmMessages = cur.dmMessages.filterNot { m -> m.id == tempId }) }
                    showToast(e.message ?: "Failed to send view-once message")
                }
            }
        } else if (st.activeGroupId != null) {
            val groupId = st.activeGroupId
            val optMsg = GroupMessage(
                id = tempId,
                renderKey = tempId,
                senderId = me.id,
                senderName = me.displayName,
                senderUsername = me.username,
                senderAvatarUrl = me.avatarUrl,
                senderAvatarColor = me.avatarColor,
                body = placeholderEnvelope,
                createdAt = now,
                replyTo = safeReplyTo,
            )
            lastNotifiedGroupTsById[groupId] = now
            _state.update { cur ->
                val nextGroups = cur.groups.map { g ->
                    if (g.id == groupId) {
                        g.copy(
                            lastMessage = "View once",
                            lastMessageAt = now,
                            lastSenderId = me.id,
                            lastSenderName = me.displayName.ifBlank { me.username },
                            unreadCount = 0,
                        )
                    } else g
                }.sortedByDescending { it.lastMessageAt }
                cur.copy(groupMessages = cur.groupMessages + optMsg, groups = nextGroups)
            }

            viewModelScope.launch {
                try {
                    val memberIds = _state.value.groupDetails?.members?.map { it.id }.orEmpty()
                    var photoMedia: ViewOnceMediaPayload? = null
                    if (photoUri != null) {
                        val readPhoto = readAttachmentBytes(photoUri, null)
                        if (readPhoto != null) {
                            val (plainBytes, fName, fMime, cachedFile) = readPhoto
                            val (ctBytes, desc) = JaTextCryptoEngine.encryptAttachmentBytes(plainBytes, fName, fMime)
                            if (cachedFile != null) JaTextCryptoEngine.seedOutgoingDecryptedMedia(desc.h, cachedFile)
                            val upUrl = TursoApiClient.uploadMediaBytes(ctBytes, "e2ee-vo-img.bin", "application/octet-stream", token)
                            photoMedia = ViewOnceMediaPayload(url = upUrl, name = fName, mime = fMime, att = desc)
                        }
                    }

                    var audioMedia: ViewOnceMediaPayload? = null
                    if (localVoiceFile != null || audioUri != null) {
                        val readAudio = readAttachmentBytes(audioUri, localVoiceFile)
                        if (readAudio != null) {
                            val (plainBytes, fName, fMime, cachedFile) = readAudio
                            val (ctBytes, desc) = JaTextCryptoEngine.encryptAttachmentBytes(plainBytes, fName, fMime)
                            if (cachedFile != null) JaTextCryptoEngine.seedOutgoingDecryptedMedia(desc.h, cachedFile)
                            val upUrl = TursoApiClient.uploadMediaBytes(ctBytes, "e2ee-vo-aud.bin", "application/octet-stream", token)
                            audioMedia = ViewOnceMediaPayload(url = upUrl, name = fName, mime = fMime, att = desc)
                        }
                    }

                    val voBody = ViewOnceCodec.encode(
                        ViewOnceEnvelopePayload(
                            v = 1,
                            text = cleanText.takeIf { it.isNotEmpty() },
                            photo = photoMedia,
                            audio = audioMedia,
                        )
                    )
                    val payload = E2EEPlainPayload(v = 1, b = voBody)
                    val wire = JaTextCryptoEngine.encryptGroupMessage(appCtx, me.id, groupId, memberIds, payload, token)
                    val args = mutableMapOf<String, Any?>(
                        "groupId" to groupId,
                        "body" to wire,
                    )
                    if (replyTo != null) args["replyToId"] = replyTo.id

                    val root = TursoApiClient.rpcRaw("sendGroupMessage", args, token).jsonObject
                    val serverMsg = root["message"]?.let {
                        JaTextJson.decodeFromJsonElement(GroupMessage.serializer(), it)
                    }
                    if (serverMsg != null) {
                        val hydrated = JaTextCryptoEngine.hydrateGroupMessages(appCtx, me.id, groupId, listOf(serverMsg))
                            .map { m -> if (m.id == serverMsg.id) m.copy(renderKey = tempId) else m }
                        _state.update { cur ->
                            val withoutOpt = cur.groupMessages.filterNot { m -> m.id == tempId }
                            cur.copy(groupMessages = mergeGroupMessages(withoutOpt, hydrated))
                        }
                    }
                    triggerImmediateSync(true)
                } catch (e: Throwable) {
                    _state.update { cur -> cur.copy(groupMessages = cur.groupMessages.filterNot { m -> m.id == tempId }) }
                    showToast(e.message ?: "Failed to send view-once message")
                }
            }
        }
    }

    private fun normalizeChatOrganization(spec: ChatOrganizationSpec): ChatOrganizationSpec {
        val cleanPinned = spec.pinnedIds
            .map { it.trim() }
            .filter { it.isNotEmpty() && it != OFFICIAL_COMMUNITY_ID }
            .distinct()
        val cleanOrder = listOf(OFFICIAL_COMMUNITY_ID) + spec.customOrder
            .map { it.trim() }
            .filter { it.isNotEmpty() && it != OFFICIAL_COMMUNITY_ID }
            .distinct()
        val cleanFolders = spec.folders.mapNotNull { f ->
            val name = f.name.trim().take(32)
            if (name.isEmpty()) null else f.copy(
                id = f.id.ifBlank { "fld-${UUID.randomUUID()}" },
                name = name,
                threadIds = f.threadIds.map { it.trim() }.filter { it.isNotEmpty() }.distinct(),
            )
        }
        return ChatOrganizationSpec(
            pinnedIds = cleanPinned,
            customOrder = cleanOrder,
            folders = cleanFolders,
        )
    }

    private fun persistAndSyncChatOrganization(next: ChatOrganizationSpec) {
        val normalized = normalizeChatOrganization(next)
        val slot = _state.value.slotId
        cache.saveChatOrganization(slot, normalized)
        _state.update { it.copy(chatOrganization = normalized) }
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            runCatching {
                val payload = mapOf(
                    "pinnedIds" to normalized.pinnedIds,
                    "customOrder" to normalized.customOrder,
                    "folders" to normalized.folders.map { f ->
                        mapOf(
                            "id" to f.id,
                            "name" to f.name,
                            "threadIds" to f.threadIds,
                        )
                    },
                )
                TursoApiClient.rpcRaw(
                    op = "saveChatOrganization",
                    args = mapOf("chatOrganization" to payload),
                    token = token,
                )
            }
        }
    }

    fun togglePinThread(threadKey: String) {
        if (threadKey == OFFICIAL_COMMUNITY_ID || threadKey.isBlank()) return
        val cur = _state.value.chatOrganization
        val nextPinned = if (cur.pinnedIds.contains(threadKey)) {
            cur.pinnedIds.filterNot { it == threadKey }
        } else {
            listOf(threadKey) + cur.pinnedIds
        }
        persistAndSyncChatOrganization(cur.copy(pinnedIds = nextPinned))
    }

    fun moveThreadInOrder(visibleOrderedKeys: List<String>, threadKey: String, delta: Int) {
        if (threadKey == OFFICIAL_COMMUNITY_ID || delta == 0) return
        val nonCommunity = visibleOrderedKeys.filterNot { it == OFFICIAL_COMMUNITY_ID }.toMutableList()
        val idx = nonCommunity.indexOf(threadKey)
        if (idx < 0) return
        val target = (idx + delta).coerceIn(0, nonCommunity.lastIndex)
        if (target == idx) return
        nonCommunity.removeAt(idx)
        nonCommunity.add(target, threadKey)
        val cur = _state.value.chatOrganization
        val remaining = cur.customOrder.filterNot { it == OFFICIAL_COMMUNITY_ID || nonCommunity.contains(it) }
        persistAndSyncChatOrganization(
            cur.copy(customOrder = listOf(OFFICIAL_COMMUNITY_ID) + nonCommunity + remaining)
        )
    }

    fun saveChatFolder(folderId: String?, name: String, threadIds: List<String>) {
        val cleanName = name.trim().take(32)
        if (cleanName.isEmpty()) return
        val cur = _state.value.chatOrganization
        val id = folderId?.takeIf { it.isNotBlank() } ?: "fld-${UUID.randomUUID()}"
        val spec = ChatFolderSpec(id = id, name = cleanName, threadIds = threadIds.distinct())
        val exists = cur.folders.any { it.id == id }
        val nextFolders = if (exists) {
            cur.folders.map { if (it.id == id) spec else it }
        } else {
            cur.folders + spec
        }
        persistAndSyncChatOrganization(cur.copy(folders = nextFolders))
    }

    fun deleteChatFolder(folderId: String) {
        val cur = _state.value.chatOrganization
        persistAndSyncChatOrganization(cur.copy(folders = cur.folders.filterNot { it.id == folderId }))
    }

    fun togglePinMessageInThread(
        threadKey: String,
        messageId: String,
        senderName: String,
        preview: String,
    ) {
        if (threadKey.isBlank() || messageId.isBlank()) return
        val slot = _state.value.slotId
        val fullMap = _state.value.pinnedMessagesByThread.toMutableMap()
        val currentList = fullMap[threadKey].orEmpty()
        val exists = currentList.any { it.id == messageId }
        val nextList = if (exists) {
            currentList.filterNot { it.id == messageId }
        } else {
            listOf(
                ClientPinnedMessage(
                    id = messageId,
                    senderName = senderName,
                    preview = preview.ifBlank { "Attachment" }.take(140),
                    pinnedAt = System.currentTimeMillis(),
                )
            ) + currentList
        }
        if (nextList.isEmpty()) {
            fullMap.remove(threadKey)
        } else {
            fullMap[threadKey] = nextList.take(25)
        }
        cache.savePinnedMessagesMap(slot, fullMap)
        _state.update { it.copy(pinnedMessagesByThread = fullMap) }
    }

    fun refreshSoundboards() {
        val token = currentAuthToken() ?: return
        val slot = _state.value.slotId
        viewModelScope.launch {
            runCatching {
                val resp = TursoApiClient.rpc<ListSoundboardsResponse>("listMySoundboards", emptyMap(), token)
                cache.saveSoundboards(slot, resp.soundboards)
                _state.update { it.copy(soundboards = resp.soundboards) }
            }
        }
    }

    fun createCustomSoundboardFromUri(
        name: String,
        audioUri: Uri,
        onDone: () -> Unit = {},
        onError: (String) -> Unit = {},
    ) {
        val token = currentAuthToken() ?: return
        val slot = _state.value.slotId
        val cleanName = name.trim().take(40)
        if (cleanName.isEmpty()) {
            onError("Enter a name for your soundboard clip.")
            return
        }
        viewModelScope.launch {
            try {
                val readMeta = withContext(Dispatchers.IO) { readAttachmentBytes(audioUri, null) }
                    ?: throw IllegalStateException("Unable to read selected audio file.")
                val (bytes, fName, fMime, _) = readMeta
                if (bytes.size > 10 * 1024 * 1024) {
                    throw IllegalStateException("Audio file must be 10 MB or smaller.")
                }
                val durationMs = withContext(Dispatchers.IO) {
                    val retriever = android.media.MediaMetadataRetriever()
                    try {
                        retriever.setDataSource(appCtx, audioUri)
                        retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)
                            ?.toIntOrNull() ?: 0
                    } finally {
                        runCatching { retriever.release() }
                    }
                }
                if (durationMs <= 0) {
                    throw IllegalStateException("Could not determine audio duration.")
                }
                if (durationMs > 10_350) {
                    throw IllegalStateException("Soundboard clips must be 10 seconds or shorter.")
                }
                val uploadedUrl = TursoApiClient.uploadMediaBytes(
                    bytes = bytes,
                    fileName = fName.ifBlank { "soundboard.mp3" },
                    mimeType = fMime.ifBlank { "audio/mpeg" },
                    token = token,
                )
                val resp = TursoApiClient.rpc<CreateSoundboardResponse>(
                    op = "createSoundboardClip",
                    args = mapOf(
                        "name" to cleanName,
                        "audioUrl" to uploadedUrl,
                        "durationMs" to durationMs.coerceAtMost(10_000),
                        "byteSize" to bytes.size,
                    ),
                    token = token,
                )
                val next = listOf(resp.clip) + _state.value.soundboards.filterNot { it.id == resp.clip.id }
                cache.saveSoundboards(slot, next)
                _state.update { it.copy(soundboards = next) }
                onDone()
            } catch (e: Throwable) {
                val msg = e.message ?: "Failed to create soundboard clip."
                onError(msg)
                showToast(msg)
            }
        }
    }

    fun deleteCustomSoundboard(clipId: String) {
        val token = currentAuthToken() ?: return
        val slot = _state.value.slotId
        val next = _state.value.soundboards.filterNot { it.id == clipId }
        cache.saveSoundboards(slot, next)
        _state.update { it.copy(soundboards = next) }
        viewModelScope.launch {
            runCatching {
                TursoApiClient.rpcRaw("deleteSoundboardClip", mapOf("clipId" to clipId), token)
            }.onFailure {
                refreshSoundboards()
            }
        }
    }

    fun refreshBlockedUsersList() {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            runCatching {
                val resp = TursoApiClient.rpc<BlockedUsersResponse>("getBlockedUsers", emptyMap(), token)
                _state.update { it.copy(blockedUsersList = resp.users) }
            }
        }
    }

    fun unblockUserFromSettings(userId: String) {
        _state.update { cur ->
            cur.copy(
                blockedUserIds = cur.blockedUserIds.filterNot { id -> id == userId },
                blockedUsersList = cur.blockedUsersList.filterNot { u -> u.id == userId },
            )
        }
        setBlockedUser(userId, false)
    }

    fun refreshSecuritySettings() {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            runCatching {
                val resp = TursoApiClient.rpc<SecuritySettingsResponse>("getSecuritySettings", emptyMap(), token)
                _state.update { it.copy(securitySettings = resp) }
            }
        }
    }

    suspend fun beginTotpSetup(): BeginTotpSetupResponse {
        val token = currentAuthToken() ?: throw IllegalStateException("Not authenticated.")
        return TursoApiClient.rpc("beginTotpSetup", emptyMap(), token)
    }

    suspend fun confirmTotpSetup(code: String): ConfirmTotpSetupResponse {
        val token = currentAuthToken() ?: throw IllegalStateException("Not authenticated.")
        val resp = TursoApiClient.rpc<ConfirmTotpSetupResponse>(
            op = "confirmTotpSetup",
            args = mapOf("code" to code.trim()),
            token = token,
        )
        refreshSecuritySettings()
        return resp
    }

    suspend fun disableTotp(code: String) {
        val token = currentAuthToken() ?: throw IllegalStateException("Not authenticated.")
        TursoApiClient.rpcRaw("disableTotp", mapOf("code" to code.trim()), token)
        refreshSecuritySettings()
    }

    fun registerPasskey(
        activity: Activity,
        label: String = "Android Passkey",
        onDone: () -> Unit = {},
        onError: (String) -> Unit = {},
    ) {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                PasskeyManagerHelper.registerPasskey(activity, token, label)
                refreshSecuritySettings()
                showToast("Passkey added")
                onDone()
            } catch (_: PasskeyCancelledException) {
            } catch (e: Throwable) {
                val msg = e.message ?: "Could not register passkey."
                onError(msg)
                showToast(msg)
            }
        }
    }

    fun deletePasskey(credentialId: String) {
        val token = currentAuthToken() ?: return
        _state.update { cur ->
            cur.copy(
                securitySettings = cur.securitySettings.copy(
                    passkeys = cur.securitySettings.passkeys.filterNot { it.credentialId == credentialId }
                )
            )
        }
        viewModelScope.launch {
            runCatching {
                TursoApiClient.rpcRaw("deletePasskey", mapOf("credentialId" to credentialId), token)
            }.onFailure {
                refreshSecuritySettings()
            }
        }
    }

    suspend fun ownerAdminAction(args: Map<String, Any?>): OwnerOverviewResult =
        kotlinx.coroutines.withContext(Dispatchers.Default) {
            val token = currentAuthToken() ?: throw IllegalStateException("Not signed in.")
            val res = TursoApiClient.rpc<OwnerOverviewResult>(
                op = "ownerAdminAction",
                args = args,
                token = token,
            )
            val op = (args["subOp"] ?: args["subAction"] ?: "overview").toString().trim()
            val q = (args["query"] ?: "").toString().trim()
            if ((op == "overview" || op == "searchUsers") && q.isEmpty() && res.stats != null) {
                cachedOwnerOverview = res
            }
            res
        }

    /* ======================================================================
       Updates Tab: 24-Hour Status Stories, Per-Post Privacy & Story Likes
       ====================================================================== */

    fun refreshUpdatesBundle(silent: Boolean = false) {
        val token = currentAuthToken() ?: return
        if (!silent) {
            _state.update { it.copy(updatesLoading = true) }
        }
        viewModelScope.launch {
            try {
                val bundle = TursoApiClient.rpc<UpdatesBundlePayload>(
                    op = "getUpdatesBundle",
                    args = emptyMap(),
                    token = token,
                )
                _state.update {
                    it.copy(
                        updatesBundle = bundle,
                        updatesLoading = false,
                    )
                }
            } catch (_: Throwable) {
                if (!silent) {
                    _state.update { it.copy(updatesLoading = false) }
                }
            }
        }
    }

    fun publishStatusPost(
        imageUri: android.net.Uri?,
        audioUri: android.net.Uri?,
        builtinAudioId: String,
        builtinAudioTitle: String,
        builtinAudioDurationMs: Int,
        /** Where the clip starts inside the track, for songs over 30 seconds. */
        audioStartMs: Int = 0,
        caption: String,
        bgColor: String,
        privacyType: String,
        excludedIds: List<String>,
        includedIds: List<String>,
        groupId: String?,
        mentionedIds: List<String>,
        onSuccess: () -> Unit,
        onError: (String) -> Unit,
    ) {
        val token = currentAuthToken() ?: run {
            onError("Not signed in.")
            return
        }
        viewModelScope.launch {
            try {
                var uploadedMediaUrl = ""
                var resolvedMediaType = "text"
                if (imageUri != null) {
                    val imgMeta = withContext(Dispatchers.IO) { readAttachmentBytes(imageUri, null) }
                        ?: throw IllegalStateException("Could not read selected image.")
                    uploadedMediaUrl = TursoApiClient.uploadMediaBytes(
                        bytes = imgMeta.bytes,
                        fileName = imgMeta.fileName.ifBlank { "status.jpg" },
                        mimeType = imgMeta.mimeType.ifBlank { "image/jpeg" },
                        token = token,
                    )
                    resolvedMediaType = "image"
                }

                var uploadedAudioUrl = ""
                var resolvedAudioTitle = ""
                var resolvedAudioDur = 0
                if (audioUri != null) {
                    val durMs = withContext(Dispatchers.IO) {
                        val retriever = android.media.MediaMetadataRetriever()
                        try {
                            retriever.setDataSource(appCtx, audioUri)
                            retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)
                                ?.toIntOrNull() ?: 15_000
                        } finally {
                            runCatching { retriever.release() }
                        }
                    }
                    if (durMs > 30_000) {
                        throw IllegalStateException("Status audio clips must be 30 seconds or shorter.")
                    }
                    val audMeta = withContext(Dispatchers.IO) { readAttachmentBytes(audioUri, null) }
                        ?: throw IllegalStateException("Could not read selected audio clip.")
                    uploadedAudioUrl = TursoApiClient.uploadMediaBytes(
                        bytes = audMeta.bytes,
                        fileName = audMeta.fileName.ifBlank { "status-audio.mp3" },
                        mimeType = audMeta.mimeType.ifBlank { "audio/mpeg" },
                        token = token,
                    )
                    resolvedAudioTitle = audMeta.fileName.substringBeforeLast('.').take(60)
                    resolvedAudioDur = durMs.coerceIn(1_000, 30_000)
                    if (uploadedMediaUrl.isBlank()) {
                        resolvedMediaType = "audio"
                    }
                } else if (builtinAudioId.isNotBlank() && builtinAudioId != "none") {
                    // A song from the Status music library. The whole track is
                    // stored, only the 30 second window the poster chose plays.
                    val song = com.ahad00010.jatext.data.StatusSongs.find(builtinAudioId)
                    if (song != null) {
                        uploadedAudioUrl = song.audioUrl
                        resolvedAudioTitle = "${song.title} \u00b7 ${song.artist}".take(80)
                        resolvedAudioDur = com.ahad00010.jatext.data.StatusSongs
                            .playWindow(audioStartMs, song.durationMs)
                            .second
                    }
                }

                val res = TursoApiClient.rpc<CreateStatusPostResponse>(
                    op = "createStatusPost",
                    args = mapOf(
                        "mediaUrl" to uploadedMediaUrl,
                        "mediaType" to resolvedMediaType,
                        "caption" to caption.trim(),
                        "bgColor" to bgColor,
                        "audioUrl" to uploadedAudioUrl,
                        "audioTitle" to resolvedAudioTitle,
                        "audioDurationMs" to resolvedAudioDur,
                        "audioStartMs" to audioStartMs.coerceAtLeast(0),
                        "privacyType" to privacyType,
                        "excludedUserIds" to if (privacyType == "CONTACTS_EXCEPT") excludedIds else emptyList<String>(),
                        "includedUserIds" to if (privacyType == "ONLY_SHARE_WITH") includedIds else emptyList<String>(),
                        "groupId" to if (privacyType == "GROUP_EXCLUSIVE") groupId else null,
                        "mentionedUserIds" to mentionedIds,
                    ),
                    token = token,
                )

                val now = System.currentTimeMillis()
                val me = _state.value.me
                val createdSeg = res.segment ?: StatusSegmentItem(
                    id = res.id.ifBlank { "local_$now" },
                    userId = me?.id.orEmpty(),
                    mediaUrl = uploadedMediaUrl,
                    mediaType = resolvedMediaType,
                    caption = caption.trim(),
                    bgColor = bgColor,
                    audioUrl = uploadedAudioUrl,
                    audioTitle = resolvedAudioTitle,
                    audioDurationMs = resolvedAudioDur,
                    audioStartMs = audioStartMs.coerceAtLeast(0),
                    privacyType = privacyType,
                    groupId = if (privacyType == "GROUP_EXCLUSIVE") groupId else null,
                    mentionedUserIds = mentionedIds,
                    viewed = true,
                    liked = false,
                    viewCount = 0,
                    likeCount = 0,
                    createdAt = if (res.createdAt > 0L) res.createdAt else now,
                    expiresAt = if (res.expiresAt > 0L) res.expiresAt else (now + 24L * 3600L * 1000L),
                )

                _state.update { cur ->
                    val b = cur.updatesBundle
                    val curSegs = b.myStatus.segments
                    val nextSegs = if (curSegs.any { it.id == createdSeg.id }) curSegs else curSegs + createdSeg
                    val nextMyStatus = b.myStatus.copy(
                        userId = me?.id ?: b.myStatus.userId,
                        displayName = me?.displayName ?: b.myStatus.displayName,
                        username = me?.username ?: b.myStatus.username,
                        avatarColor = me?.avatarColor ?: b.myStatus.avatarColor,
                        avatarUrl = me?.avatarUrl ?: b.myStatus.avatarUrl,
                        segments = nextSegs,
                        latestAt = createdSeg.createdAt,
                    )
                    cur.copy(updatesBundle = b.copy(myStatus = nextMyStatus))
                }

                showToast("Status posted!")
                refreshUpdatesBundle(silent = true)
                onSuccess()
            } catch (e: Throwable) {
                onError(e.message ?: "Could not publish status.")
            }
        }
    }

    fun deleteStatusSegment(statusId: String) {
        val token = currentAuthToken() ?: return
        _state.update { cur ->
            val b = cur.updatesBundle
            val nextSegs = b.myStatus.segments.filterNot { it.id == statusId }
            cur.copy(
                updatesBundle = b.copy(
                    myStatus = b.myStatus.copy(
                        segments = nextSegs,
                        latestAt = nextSegs.lastOrNull()?.createdAt ?: 0L,
                    ),
                ),
            )
        }
        viewModelScope.launch {
            runCatching {
                TursoApiClient.rpcRaw("deleteStatusPost", mapOf("statusId" to statusId), token)
                refreshUpdatesBundle(silent = true)
            }
        }
    }

    fun markStatusesViewed(statusIds: List<String>) {
        if (statusIds.isEmpty()) return
        val token = currentAuthToken() ?: return
        val idSet = statusIds.toSet()
        _state.update { cur ->
            val b = cur.updatesBundle
            val nextContacts = b.contactStacks.map { st ->
                val nextSegs = st.segments.map { seg ->
                    if (idSet.contains(seg.id)) seg.copy(viewed = true) else seg
                }
                st.copy(
                    segments = nextSegs,
                    allViewed = nextSegs.all { it.viewed },
                    unreadCount = nextSegs.count { !it.viewed },
                )
            }
            cur.copy(updatesBundle = b.copy(contactStacks = nextContacts))
        }
        viewModelScope.launch {
            runCatching {
                TursoApiClient.rpcRaw("markStatusViewed", mapOf("statusIds" to statusIds), token)
            }
        }
    }

    fun toggleStatusSegmentLike(statusId: String) {
        val token = currentAuthToken() ?: return
        _state.update { cur ->
            val b = cur.updatesBundle
            val nextContacts = b.contactStacks.map { st ->
                st.copy(
                    segments = st.segments.map { seg ->
                        if (seg.id == statusId) seg.copy(liked = !seg.liked) else seg
                    },
                )
            }
            cur.copy(updatesBundle = b.copy(contactStacks = nextContacts))
        }
        viewModelScope.launch {
            runCatching {
                TursoApiClient.rpcRaw("toggleStatusLike", mapOf("statusId" to statusId), token)
            }
        }
    }

    fun saveStatusDefaultPrivacy(
        privacyType: String,
        excludedIds: List<String>,
        includedIds: List<String>,
        groupId: String?,
        onSaved: () -> Unit,
    ) {
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            runCatching {
                TursoApiClient.rpcRaw(
                    "saveStatusPrivacyDefault",
                    mapOf(
                        "privacyType" to privacyType,
                        "excludedIds" to excludedIds,
                        "includedIds" to includedIds,
                        "groupId" to groupId,
                    ),
                    token,
                )
                refreshUpdatesBundle(silent = true)
            }
            onSaved()
        }
    }

    fun sendStoryDirectReply(targetUserId: String, storyCaption: String, replyBody: String) {
        val me = _state.value.me ?: return
        val token = currentAuthToken() ?: return
        val clean = replyBody.trim()
        if (clean.isEmpty()) return
        val formatted = if (storyCaption.isNotBlank()) {
            "[Status reply: \"${storyCaption.take(48)}\"] $clean"
        } else {
            "[Status reply] $clean"
        }
        viewModelScope.launch {
            runCatching {
                val payload = E2EEPlainPayload(v = 1, b = formatted)
                val wire = JaTextCryptoEngine.encryptDmMessage(appCtx, me.id, targetUserId, payload, token) ?: formatted
                TursoApiClient.rpcRaw(
                    "sendMessage",
                    mapOf("receiverId" to targetUserId, "body" to wire),
                    token,
                )
                showToast("Sent reply")
            }
        }
    }
}
