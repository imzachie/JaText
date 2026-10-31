package com.ahad00010.jatext.state

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ahad00010.jatext.BuildConfig
import com.ahad00010.jatext.JaTextSoundManager
import com.ahad00010.jatext.NativeRuntimeBridge
import com.ahad00010.jatext.auth.GoogleNativeSignIn
import com.ahad00010.jatext.auth.GoogleSignInCancelledException
import com.ahad00010.jatext.crypto.JaTextCryptoEngine
import com.ahad00010.jatext.data.AccountSlot
import com.ahad00010.jatext.data.ApkVersionManifest
import com.ahad00010.jatext.data.BootstrapResponse
import com.ahad00010.jatext.data.CallHistoryEntry
import com.ahad00010.jatext.data.ChatMessage
import com.ahad00010.jatext.data.ChatPreview
import com.ahad00010.jatext.data.ChatTypingUser
import com.ahad00010.jatext.data.CommunityMessage
import com.ahad00010.jatext.data.CommunityPermissions
import com.ahad00010.jatext.data.CommunityUser
import com.ahad00010.jatext.data.E2EEPlainPayload
import com.ahad00010.jatext.data.EncryptedStickerDescriptor
import com.ahad00010.jatext.data.ForwardedMessageContext
import com.ahad00010.jatext.data.FriendActivity
import com.ahad00010.jatext.data.FriendRequest
import com.ahad00010.jatext.data.GroupDetails
import com.ahad00010.jatext.data.GroupMessage
import com.ahad00010.jatext.data.GroupSummary
import com.ahad00010.jatext.data.JaTextJson
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.LocalCacheStore
import com.ahad00010.jatext.data.MessageReaction
import com.ahad00010.jatext.data.OFFICIAL_COMMUNITY_ID
import com.ahad00010.jatext.data.PollVoter
import com.ahad00010.jatext.data.ReplySummary
import com.ahad00010.jatext.data.StickerMedia
import com.ahad00010.jatext.data.SyncResponse
import com.ahad00010.jatext.data.SyncedThemePayload
import com.ahad00010.jatext.data.TursoApiClient
import com.ahad00010.jatext.data.TursoApiException
import com.ahad00010.jatext.data.UserSocialLink
import com.ahad00010.jatext.data.UserWebsiteLink
import com.ahad00010.jatext.ui.theme.JaTextThemeConfig
import com.ahad00010.jatext.ui.theme.JaTextThemeManager
import com.ahad00010.jatext.webrtc.NativeCallEngine
import com.google.firebase.messaging.FirebaseMessaging
import java.io.File
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
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
    val groupHasMore: Boolean = false,
    val groupLoadingOlder: Boolean = false,
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
    val callHistory: List<CallHistoryEntry> = emptyList(),
    val outgoingBubbleStyle: String = "default",
    val notificationsEnabled: Boolean = true,
    val soundsEnabled: Boolean = true,
    val myKeyId: String = "",
    val myKeyFingerprint: String = "",
    val themeConfig: JaTextThemeConfig = JaTextThemeConfig(),
    val availableUpdate: ApkVersionManifest? = null,
    val updateDownloading: Boolean = false,
    val updateProgress: Float = 0f,
    val showPostUpdateWelcome: Boolean = false,
    val highlightedMessageId: String? = null,
    val toastMessage: String? = null,
)

class JaTextSessionViewModel(app: Application) :
    AndroidViewModel(app),
    NativeRuntimeBridge.SyncWakeListener,
    NativeRuntimeBridge.FcmTokenListener {

    private val appCtx = app.applicationContext
    val cache = LocalCacheStore(appCtx)

    private val _state = MutableStateFlow(
        SessionUiState(
            slotId = cache.getActiveSlotId(),
            accounts = cache.getAccounts(),
            notificationsEnabled = cache.isNotificationsEnabled(),
            soundsEnabled = cache.isSoundsEnabled(),
        )
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

    init {
        JaTextSoundManager.ensureActiveMessageChannel(appCtx)
        NativeRuntimeBridge.addSyncWakeListener(this)
        NativeRuntimeBridge.addFcmTokenListener(this)
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

    private fun bootstrapActiveSlot(targetSlotId: String = cache.getActiveSlotId()) {
        syncLoopJob?.cancel()
        sinceTs = 0L
        val token = cache.getTokenForSlot(targetSlotId)
        val cachedBoot = cache.loadBootstrapCache(targetSlotId)

        if (token.isNullOrBlank()) {
            _state.update {
                it.copy(
                    loading = false,
                    isAuthenticated = false,
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
                    slotId = targetSlotId,
                    accounts = cache.getAccounts(),
                    outgoingBubbleStyle = cache.getOutgoingBubbleStyle(targetSlotId),
                    callHistory = cache.getCallHistory(targetSlotId),
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
                cache.upsertSlotSession(targetSlotId, boot.refreshedToken ?: token, boot.me)
                applyBootstrapState(targetSlotId, boot.refreshedToken ?: token, boot, fromCache = false)
                cache.saveBootstrapCache(targetSlotId, boot)
                ensureE2EEPublishedAndSynced(boot.me, boot.friends, boot.refreshedToken ?: token)
                registerFcmDeviceTokenIfAvailable(boot.refreshedToken ?: token)
                startDeltaSyncLoop()
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

        _state.update { prev ->
            prev.copy(
                loading = false,
                isAuthenticated = true,
                slotId = slotId,
                addingAccountReturnSlotId = null,
                accounts = cache.getAccounts(),
                me = boot.me,
                friends = boot.friends,
                incoming = boot.incoming,
                outgoing = boot.outgoing,
                blockedUserIds = boot.blockedUserIds,
                previews = boot.previews,
                friendActivities = boot.friendActivities,
                groups = boot.groups,
                communityPermissions = boot.communityPermissions,
                communityDirectory = boot.communityDirectory,
                communityMuted = boot.communityMuted,
                communityMessages = hydrateCommunityList(boot.communityMessages),
                communityHasMore = boot.communityHasMore,
                stickerFavorites = boot.stickerFavorites,
                recentStickers = boot.recentStickers,
                outgoingBubbleStyle = cache.getOutgoingBubbleStyle(slotId),
                callHistory = cache.getCallHistory(slotId),
                myKeyId = myIdent?.keyId.orEmpty(),
                myKeyFingerprint = fp,
            )
        }
        syncPushSuppressionState()
        viewModelScope.launch {
            decryptSidebarPreviewsAsync(boot.me.id, boot.previews, boot.groups, token)
        }
    }

    private suspend fun decryptSidebarPreviewsAsync(
        myId: String,
        rawPreviews: List<ChatPreview>,
        rawGroups: List<GroupSummary>,
        token: String,
    ) {
        if (myId.isBlank()) return
        val hydratedPreviews = rawPreviews.map { p ->
            val text = JaTextCryptoEngine.decryptPreviewText(
                context = appCtx,
                myUserId = myId,
                peerOrGroupId = p.friendId,
                senderId = p.senderId,
                rawPreview = p.body,
                isGroup = false,
                token = token
            )
            p.copy(body = text)
        }
        val hydratedGroups = rawGroups.map { g ->
            val text = JaTextCryptoEngine.decryptPreviewText(
                context = appCtx,
                myUserId = myId,
                peerOrGroupId = g.id,
                senderId = g.lastSenderId.orEmpty(),
                rawPreview = g.lastMessage,
                isGroup = true,
                token = token
            )
            g.copy(lastMessage = text)
        }
        _state.update { it.copy(previews = hydratedPreviews, groups = hydratedGroups) }
    }

    private suspend fun ensureE2EEPublishedAndSynced(me: JaUser, friends: List<JaUser>, token: String) {
        if (me.id.isBlank()) return
        val identity = JaTextCryptoEngine.ensureOrCreatePrimaryIdentity(appCtx, me.id)
        try {
            TursoApiClient.rpcRaw(
                op = "publishE2EEIdentity",
                args = mapOf(
                    "keyId" to identity.keyId,
                    "dhPubB64" to identity.dhPubB64,
                    "sigPubB64" to identity.sigPubB64,
                    "selfSigB64" to identity.selfSigB64,
                ),
                token = token
            )
        } catch (_: Throwable) {
        }
        val peerIds = (friends.map { it.id } + me.id).distinct()
        JaTextCryptoEngine.ensurePeerBundles(peerIds, token)
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

            val sync = TursoApiClient.rpc<SyncResponse>(
                op = "sync",
                args = mapOf(
                    "sinceTs" to sinceTs,
                    "activeFriendId" to activeFriend,
                    "activeGroupId" to st.activeGroupId,
                    "includeCommunity" to (st.activeChatId == OFFICIAL_COMMUNITY_ID),
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

            // Inspect incoming call signals & pre-decrypt active DM/Group deltas before state update!
            val hydratedDmDelta = if (!sync.changedDmMessages.isNullOrEmpty()) {
                for (raw in sync.changedDmMessages) {
                    inspectRawDmForCallSignal(myUser, raw, token)
                }
                if (_state.value.activeChatId == activeFriend && activeFriend != null) {
                    JaTextCryptoEngine.hydrateDmMessages(appCtx, myUser.id, sync.changedDmMessages, token)
                } else {
                    emptyList()
                }
            } else {
                emptyList()
            }

            val hydratedGrpDelta = if (!sync.changedGroupMessages.isNullOrEmpty() && st.activeGroupId != null) {
                val grpSummary = (_state.value.groups).firstOrNull { it.id == st.activeGroupId }
                if (grpSummary != null) {
                    for (raw in sync.changedGroupMessages) {
                        inspectRawGroupForCallSignal(myUser, grpSummary, raw)
                    }
                }
                JaTextCryptoEngine.hydrateGroupMessages(appCtx, myUser.id, st.activeGroupId, sync.changedGroupMessages)
            } else {
                emptyList()
            }

            val hydratedPreviews = sync.social?.previews?.map { p ->
                val text = JaTextCryptoEngine.decryptPreviewText(
                    appCtx, myUser.id, p.friendId, p.senderId, p.body, false, token
                )
                // If user already has this chat open, unread count is 0 and mark read!
                val effectiveUnread = if (_state.value.activeChatId == p.friendId) 0 else p.unreadCount
                p.copy(body = text, unreadCount = effectiveUnread)
            }

            val hydratedGroups = sync.groups?.map { g ->
                val text = JaTextCryptoEngine.decryptPreviewText(
                    appCtx, myUser.id, g.id, g.lastSenderId.orEmpty(), g.lastMessage, true, token
                )
                val effectiveUnread = if (_state.value.activeGroupId == g.id) 0 else g.unreadCount
                g.copy(lastMessage = text, unreadCount = effectiveUnread)
            }

            _state.update { prev ->
                val nextDms = if (hydratedDmDelta.isNotEmpty() && prev.activeChatId == activeFriend) {
                    mergeDmMessages(prev.dmMessages, hydratedDmDelta)
                } else {
                    prev.dmMessages
                }
                val nextGrps = if (hydratedGrpDelta.isNotEmpty() && prev.activeGroupId == st.activeGroupId) {
                    mergeGroupMessages(prev.groupMessages, hydratedGrpDelta)
                } else {
                    prev.groupMessages
                }
                val nextComm = if (!sync.changedCommunityMessages.isNullOrEmpty()) {
                    mergeCommunityMessages(prev.communityMessages, hydrateCommunityList(sync.changedCommunityMessages))
                } else {
                    prev.communityMessages
                }

                prev.copy(
                    me = sync.me ?: prev.me,
                    friends = sync.social?.friends ?: prev.friends,
                    incoming = sync.social?.incoming ?: prev.incoming,
                    outgoing = sync.social?.outgoing ?: prev.outgoing,
                    blockedUserIds = sync.social?.blockedUserIds ?: prev.blockedUserIds,
                    previews = hydratedPreviews ?: prev.previews,
                    friendActivities = sync.social?.friendActivities ?: prev.friendActivities,
                    groups = hydratedGroups ?: prev.groups,
                    dmMessages = nextDms,
                    groupMessages = nextGrps,
                    communityMessages = nextComm,
                    groupTypingUsers = sync.groupTypingUsers,
                    communityTypingUsers = sync.communityTypingUsers,
                )
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

    private suspend fun inspectRawDmForCallSignal(me: JaUser, msg: ChatMessage, token: String) {
        val peerId = if (msg.senderId == me.id) msg.receiverId else msg.senderId
        val peer = _state.value.friends.firstOrNull { it.id == peerId } ?: JaUser(id = peerId, displayName = "Contact")
        val raw = msg.rawWireBody ?: msg.body
        val plain = if (JaTextCryptoEngine.isEncryptedWireBody(raw)) {
            JaTextCryptoEngine.decryptDmWire(appCtx, me.id, msg.id, msg.senderId, msg.receiverId, raw, token)?.payload?.b
        } else {
            raw
        } ?: return
        callEngine.inspectDmWireSignal(me, peer, msg.senderId, msg.createdAt, plain)
    }

    private suspend fun inspectRawGroupForCallSignal(me: JaUser, group: GroupSummary, msg: GroupMessage) {
        val raw = msg.rawWireBody ?: msg.body
        val plain = if (JaTextCryptoEngine.isEncryptedWireBody(raw)) {
            JaTextCryptoEngine.decryptGroupWire(group.id, msg.id, msg.senderId, raw)?.payload?.b
        } else {
            raw
        } ?: return
        callEngine.inspectGroupWireSignal(me, group, msg.createdAt, plain)
    }

    /* ==================== Auth & In-App Google Sign-In ==================== */

    suspend fun signInEmail(email: String, password: String) {
        val slot = _state.value.slotId
        val root = TursoApiClient.rpcRaw(
            op = "signInEmail",
            args = mapOf("email" to email.trim().lowercase(), "password" to password),
        ).jsonObject
        val token = root["token"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Server did not return an auth token.")
        val me = JaTextJson.decodeFromJsonElement(JaUser.serializer(), root["me"]!!)
        cache.upsertSlotSession(slot, token, me)
        bootstrapActiveSlot(cache.getActiveSlotId())
    }

    suspend fun signUpEmail(email: String, password: String) {
        val slot = _state.value.slotId
        val root = TursoApiClient.rpcRaw(
            op = "signUpEmail",
            args = mapOf("email" to email.trim().lowercase(), "password" to password),
        ).jsonObject
        val token = root["token"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Server did not return an auth token.")
        val me = JaTextJson.decodeFromJsonElement(JaUser.serializer(), root["me"]!!)
        cache.upsertSlotSession(slot, token, me)
        bootstrapActiveSlot(cache.getActiveSlotId())
    }

    /**
     * Pure in-app Google Sign-In (zero Chrome redirect):
     * 1. Tries Android Credential Manager bottom sheet first.
     * 2. If Credential Manager returns null on older Play Services, calls launchFallbackIntent
     *    with Google Play Services Auth sign-in dialog Intent (also 100% in-app).
     */
    suspend fun signInWithGoogleInApp(
        activity: Activity,
        launchFallbackIntent: (Intent) -> Unit,
    ) {
        val serverClientId = GoogleNativeSignIn.resolveServerWebClientId(appCtx)
        val idToken = GoogleNativeSignIn.requestInAppIdTokenViaCredentialManager(activity, serverClientId)
        if (!idToken.isNullOrBlank()) {
            completeGoogleIdTokenSignIn(idToken)
            return
        }
        val fallbackIntent = GoogleNativeSignIn.buildPlayServicesSignInIntent(activity, serverClientId)
        launchFallbackIntent(fallbackIntent)
    }

    suspend fun handleGooglePlayServicesFallbackResult(data: Intent?) {
        val idToken = GoogleNativeSignIn.extractIdTokenFromPlayServicesResult(data)
        completeGoogleIdTokenSignIn(idToken)
    }

    private suspend fun completeGoogleIdTokenSignIn(idToken: String) {
        val slot = _state.value.slotId
        val (token, me) = TursoApiClient.signInWithGoogleIdToken(idToken)
        cache.upsertSlotSession(slot, token, me)
        bootstrapActiveSlot(cache.getActiveSlotId())
    }

    fun switchToAccountSlot(slotId: String) {
        cache.setActiveSlotId(slotId)
        _state.update {
            it.copy(
                activeChatId = null,
                activeGroupId = null,
                addingAccountReturnSlotId = null,
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

    fun openDmChat(friendId: String, highlightMessageId: String? = null) {
        val slot = _state.value.slotId
        val cached = cache.loadDmMessagesCache(slot, friendId).orEmpty()
        _state.update { prev ->
            prev.copy(
                activeChatId = friendId,
                activeGroupId = null,
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
                cache.saveDmMessagesCache(slot, friendId, hydrated)
                if (_state.value.activeChatId == friendId) {
                    _state.update { it.copy(dmMessages = hydrated, dmHasMore = hasMore) }
                }
            } catch (_: Throwable) {
            }
        }
    }

    fun openGroupChat(groupId: String, highlightMessageId: String? = null) {
        val slot = _state.value.slotId
        val cachedMsgs = cache.loadGroupMessagesCache(slot, groupId).orEmpty()
        val cachedDet = cache.loadGroupDetailsCache(slot, groupId)
        _state.update { prev ->
            prev.copy(
                activeGroupId = groupId,
                activeChatId = null,
                groupDetails = cachedDet,
                groupMessages = cachedMsgs,
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
                val hasMore = msgRoot["hasMore"]?.jsonPrimitive?.booleanOrNull == true
                if (details != null) {
                    JaTextCryptoEngine.ensurePeerBundles(details.members.map { it.id }, token)
                    cache.saveGroupDetailsCache(slot, groupId, details)
                }
                val hydrated = JaTextCryptoEngine.hydrateGroupMessages(appCtx, myId, groupId, rawMsgs)
                cache.saveGroupMessagesCache(slot, groupId, hydrated)
                if (_state.value.activeGroupId == groupId) {
                    _state.update {
                        it.copy(
                            groupDetails = details ?: it.groupDetails,
                            groupMessages = hydrated,
                            groupHasMore = hasMore,
                        )
                    }
                }
            } catch (_: Throwable) {
            }
        }
    }

    fun openCommunityChat(highlightMessageId: String? = null) {
        _state.update {
            it.copy(
                activeChatId = OFFICIAL_COMMUNITY_ID,
                activeGroupId = null,
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
        _state.update {
            it.copy(
                activeChatId = null,
                activeGroupId = null,
                highlightedMessageId = null,
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
    ) {
        val st = _state.value
        val me = st.me ?: return
        val token = currentAuthToken() ?: return
        val bubble = st.outgoingBubbleStyle
        val cleanText = text.trim()
        if (cleanText.isEmpty() && attachmentUri == null && localVoiceFile == null) return

        // Optimistic instant bubble (zero "Decrypting message" flash!)
        val tempId = "opt-${UUID.randomUUID()}"
        val now = System.currentTimeMillis()

        if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
            val receiverId = st.activeChatId
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
                deliveryStatus = "sent",
                createdAt = now,
                replyTo = replyTo,
            )
            _state.update { it.copy(dmMessages = it.dmMessages + optMsg) }

            viewModelScope.launch {
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

                    val root = TursoApiClient.rpcRaw("sendMessage", args, token).jsonObject
                    val serverMsg = root["message"]?.let {
                        JaTextJson.decodeFromJsonElement(ChatMessage.serializer(), it)
                    }
                    if (serverMsg != null) {
                        val hydrated = JaTextCryptoEngine.hydrateDmMessages(appCtx, me.id, listOf(serverMsg), token)
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
                createdAt = now,
                replyTo = replyTo,
            )
            _state.update { it.copy(groupMessages = it.groupMessages + optMsg) }

            viewModelScope.launch {
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

                    val root = TursoApiClient.rpcRaw("sendGroupMessage", args, token).jsonObject
                    val serverMsg = root["message"]?.let {
                        JaTextJson.decodeFromJsonElement(GroupMessage.serializer(), it)
                    }
                    if (serverMsg != null) {
                        val hydrated = JaTextCryptoEngine.hydrateGroupMessages(appCtx, me.id, groupId, listOf(serverMsg))
                        _state.update { cur ->
                            val withoutOpt = cur.groupMessages.filterNot { m -> m.id == tempId }
                            cur.copy(groupMessages = mergeGroupMessages(withoutOpt, hydrated))
                        }
                    }
                    triggerImmediateSync(true)
                } catch (e: Throwable) {
                    _state.update { cur -> cur.copy(groupMessages = cur.groupMessages.filterNot { m -> m.id == tempId }) }
                    showToast(e.message ?: "Failed to send group message")
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
                createdAt = now,
                replyTo = replyTo,
            )
            _state.update { it.copy(communityMessages = it.communityMessages + optMsg) }

            viewModelScope.launch {
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

                    val root = TursoApiClient.rpcRaw("sendCommunityMessage", args, token).jsonObject
                    val serverMsg = root["message"]?.let {
                        JaTextJson.decodeFromJsonElement(CommunityMessage.serializer(), it)
                    }
                    if (serverMsg != null) {
                        _state.update { cur ->
                            val withoutOpt = cur.communityMessages.filterNot { m -> m.id == tempId }
                            cur.copy(communityMessages = mergeCommunityMessages(withoutOpt, hydrateCommunityList(listOf(serverMsg))))
                        }
                    }
                    triggerImmediateSync(true)
                } catch (e: Throwable) {
                    _state.update { cur -> cur.copy(communityMessages = cur.communityMessages.filterNot { m -> m.id == tempId }) }
                    showToast(e.message ?: "Failed to send community message")
                }
            }
        }
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
                }
                _state.update { it.copy(stickerFavorites = favs ?: it.stickerFavorites) }
                showToast("Custom sticker saved!")
            } catch (e: Throwable) {
                showToast(e.message ?: "Failed to upload sticker")
            }
        }
    }

    /* ==================== Message Actions: Reactions (2+ per user!), Edit, Unsend, Forward, Polls ==================== */

    fun toggleReaction(messageId: String, emoji: String) {
        val st = _state.value
        val meId = st.me?.id ?: return
        val token = currentAuthToken() ?: return

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
        if (clean.isEmpty()) return

        viewModelScope.launch {
            try {
                if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
                    val payload = E2EEPlainPayload(
                        v = 1,
                        b = JaTextCryptoEngine.attachBubbleStyleToOutgoing(clean, bubble),
                        bs = bubble.takeIf { it != "default" }
                    )
                    val wire = JaTextCryptoEngine.encryptDmMessage(appCtx, me.id, st.activeChatId, payload, token)
                        ?: JaTextCryptoEngine.attachBubbleStyleToOutgoing(clean, bubble)
                    TursoApiClient.rpcRaw("editMessage", mapOf("messageId" to messageId, "body" to wire), token)
                    _state.update { cur ->
                        cur.copy(
                            dmMessages = cur.dmMessages.map { m ->
                                if (m.id == messageId) m.copy(body = clean, editedAt = System.currentTimeMillis()) else m
                            }
                        )
                    }
                } else if (st.activeGroupId != null) {
                    val memberIds = st.groupDetails?.members?.map { it.id }.orEmpty()
                    val payload = E2EEPlainPayload(
                        v = 1,
                        b = JaTextCryptoEngine.attachBubbleStyleToOutgoing(clean, bubble),
                        bs = bubble.takeIf { it != "default" }
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

    fun unsendMessage(messageId: String) {
        val st = _state.value
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
                    TursoApiClient.rpcRaw("unsendMessage", mapOf("messageId" to messageId), token)
                    _state.update { cur ->
                        cur.copy(
                            dmMessages = cur.dmMessages.map { m ->
                                if (m.id == messageId) m.copy(body = "", unsentAt = System.currentTimeMillis(), reactions = emptyList()) else m
                            }
                        )
                    }
                } else if (st.activeGroupId != null) {
                    TursoApiClient.rpcRaw("mutateGroupMessage", mapOf("messageId" to messageId, "action" to "unsend"), token)
                    _state.update { cur ->
                        cur.copy(
                            groupMessages = cur.groupMessages.map { m ->
                                if (m.id == messageId) m.copy(body = "", unsentAt = System.currentTimeMillis(), reactions = emptyList()) else m
                            }
                        )
                    }
                } else if (st.activeChatId == OFFICIAL_COMMUNITY_ID) {
                    TursoApiClient.rpcRaw("mutateCommunityMessage", mapOf("messageId" to messageId, "action" to "unsend"), token)
                    _state.update { cur ->
                        cur.copy(
                            communityMessages = cur.communityMessages.map { m ->
                                if (m.id == messageId) m.copy(body = "", unsentAt = System.currentTimeMillis(), reactions = emptyList()) else m
                            }
                        )
                    }
                }
            } catch (e: Throwable) {
                showToast(e.message ?: "Unsend window (60 min) has expired")
            }
        }
    }

    fun deleteMessageForMe(messageId: String) {
        val st = _state.value
        val token = currentAuthToken() ?: return
        viewModelScope.launch {
            try {
                if (st.activeChatId != null && st.activeChatId != OFFICIAL_COMMUNITY_ID) {
                    TursoApiClient.rpcRaw("deleteMessageForMe", mapOf("messageId" to messageId), token)
                    _state.update { cur -> cur.copy(dmMessages = cur.dmMessages.filterNot { it.id == messageId }) }
                } else if (st.activeGroupId != null) {
                    TursoApiClient.rpcRaw("mutateGroupMessage", mapOf("messageId" to messageId, "action" to "hideForMe"), token)
                    _state.update { cur -> cur.copy(groupMessages = cur.groupMessages.filterNot { it.id == messageId }) }
                } else if (st.activeChatId == OFFICIAL_COMMUNITY_ID) {
                    TursoApiClient.rpcRaw("mutateCommunityMessage", mapOf("messageId" to messageId, "action" to "hideForMe"), token)
                    _state.update { cur -> cur.copy(communityMessages = cur.communityMessages.filterNot { it.id == messageId }) }
                }
            } catch (_: Throwable) {
            }
        }
    }

    fun forwardMessageWithContext(
        plainBody: String,
        contextCard: ForwardedMessageContext,
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
                            mapOf(
                                "receiverId" to targetFriendId,
                                "body" to wire,
                                "forwardedFromId" to contextCard.originalSenderId,
                            ),
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
                            mapOf(
                                "groupId" to targetGroupId,
                                "body" to wire,
                                "forwardedFromId" to contextCard.originalSenderId,
                                "forwardedFromName" to contextCard.originalSenderName,
                            ),
                            token
                        )
                    }
                    targetCommunity -> {
                        TursoApiClient.rpcRaw(
                            "sendCommunityMessage",
                            mapOf(
                                "type" to "text",
                                "body" to encodedBody,
                                "forwardedFromId" to contextCard.originalSenderId,
                                "forwardedFromName" to contextCard.originalSenderName,
                            ),
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

    fun addGroupMembers(groupId: String, memberIds: List<String>) {
        val token = currentAuthToken() ?: return
        if (memberIds.isEmpty()) return
        viewModelScope.launch {
            try {
                TursoApiClient.rpcRaw(
                    "manageGroup",
                    mapOf("groupId" to groupId, "subOp" to "addMembers", "memberIds" to memberIds),
                    token
                )
                openGroupChat(groupId)
            } catch (e: Throwable) {
                showToast(e.message ?: "Failed to add members")
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

    private fun checkApkUpdate() {
        viewModelScope.launch {
            val manifest = TursoApiClient.fetchLatestApkManifest() ?: return@launch
            if (manifest.versionCode > BuildConfig.VERSION_CODE) {
                _state.update { it.copy(availableUpdate = manifest) }
            }
        }
    }

    fun dismissUpdatePrompt() {
        _state.update { it.copy(availableUpdate = null) }
    }

    fun downloadAndInstallApkUpdate(activity: Activity) {
        val manifest = _state.value.availableUpdate ?: return
        if (_state.value.updateDownloading) return
        _state.update { it.copy(updateDownloading = true, updateProgress = 0.02f) }
        viewModelScope.launch {
            try {
                val outFile = File(appCtx.cacheDir, "updates/JaText-update.apk")
                TursoApiClient.downloadApkFile(manifest.downloadUrl, outFile) { p ->
                    _state.update { it.copy(updateProgress = p) }
                }
                _state.update { it.copy(updateDownloading = false, availableUpdate = null) }
                val apkUri = FileProvider.getUriForFile(
                    appCtx,
                    "${appCtx.packageName}.fileprovider",
                    outFile
                )
                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(apkUri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(installIntent)
            } catch (e: Throwable) {
                _state.update { it.copy(updateDownloading = false) }
                showToast(e.message ?: "Update download failed")
            }
        }
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
        val wire = JaTextCryptoEngine.encryptDmMessage(appCtx, me.id, receiverId, payload, token, silentSignal = silent)
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
        return list.map { m ->
            if (m.unsentAt != null) {
                m.copy(body = "")
            } else {
                val (clean, bubble) = JaTextCryptoEngine.extractMessageBubbleStyle(m.body, m.attachmentType)
                val (fwd, stripped) = JaTextCryptoEngine.extractForwardedContext(clean)
                m.copy(
                    body = stripped,
                    bubbleStyle = m.bubbleStyle ?: bubble,
                    forwardedContext = fwd ?: m.forwardedContext,
                )
            }
        }
    }

    private fun mergeDmMessages(existing: List<ChatMessage>, incoming: List<ChatMessage>): List<ChatMessage> {
        val map = LinkedHashMap<String, ChatMessage>()
        for (m in existing) map[m.id] = m
        for (m in incoming) {
            // Deduplicate any optimistic bubble from me within 60s skew window
            if (!m.id.startsWith("opt-")) {
                val optKey = map.entries.firstOrNull { (k, v) ->
                    k.startsWith("opt-") &&
                        v.senderId == m.senderId &&
                        v.body == m.body &&
                        kotlin.math.abs(v.createdAt - m.createdAt) < 60_000L
                }?.key
                if (optKey != null) map.remove(optKey)
            }
            map[m.id] = m
        }
        return map.values.sortedBy { it.createdAt }
    }

    private fun mergeGroupMessages(existing: List<GroupMessage>, incoming: List<GroupMessage>): List<GroupMessage> {
        val map = LinkedHashMap<String, GroupMessage>()
        for (m in existing) map[m.id] = m
        for (m in incoming) {
            if (!m.id.startsWith("opt-")) {
                val optKey = map.entries.firstOrNull { (k, v) ->
                    k.startsWith("opt-") &&
                        v.senderId == m.senderId &&
                        v.body == m.body &&
                        kotlin.math.abs(v.createdAt - m.createdAt) < 60_000L
                }?.key
                if (optKey != null) map.remove(optKey)
            }
            map[m.id] = m
        }
        return map.values.sortedBy { it.createdAt }
    }

    private fun mergeCommunityMessages(existing: List<CommunityMessage>, incoming: List<CommunityMessage>): List<CommunityMessage> {
        val map = LinkedHashMap<String, CommunityMessage>()
        for (m in existing) map[m.id] = m
        for (m in incoming) {
            if (!m.id.startsWith("opt-")) {
                val optKey = map.entries.firstOrNull { (k, v) ->
                    k.startsWith("opt-") &&
                        v.senderId == m.senderId &&
                        v.body == m.body &&
                        kotlin.math.abs(v.createdAt - m.createdAt) < 60_000L
                }?.key
                if (optKey != null) map.remove(optKey)
            }
            map[m.id] = m
        }
        return map.values.sortedBy { it.createdAt }
    }

    private data class AttachmentInputData(
        val bytes: ByteArray,
        val fileName: String,
        val mimeType: String,
        val localFile: File?,
    )

    private suspend fun readAttachmentBytes(uri: Uri?, voiceFile: File?): AttachmentInputData? =
        withContext(Dispatchers.IO) {
            if (voiceFile != null && voiceFile.exists()) {
                return@withContext AttachmentInputData(
                    bytes = voiceFile.readBytes(),
                    fileName = voiceFile.name,
                    mimeType = "audio/mp4",
                    localFile = voiceFile,
                )
            }
            if (uri == null) return@withContext null
            val mime = resolveMime(uri)
            val name = resolveDisplayName(uri)
            val bytes = appCtx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@withContext null
            val cacheDir = File(appCtx.cacheDir, "outgoing_media").apply { mkdirs() }
            val cached = File(cacheDir, "out_${System.currentTimeMillis()}_$name").also { it.writeBytes(bytes) }
            AttachmentInputData(bytes, name, mime, cached)
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
}
