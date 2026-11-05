package com.ahad00010.jatext.ui.screens

import android.Manifest
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Forward
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AddReaction
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.EmojiEmotions
import androidx.compose.material.icons.rounded.FileUpload
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.HowToReg
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Poll
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.Undo
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.Wallpaper
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.IntSize
import androidx.core.content.FileProvider
import com.ahad00010.jatext.crypto.JaTextCryptoEngine
import com.ahad00010.jatext.data.GroupSummary
import com.ahad00010.jatext.ui.components.isMessageAudioVoiceNote
import com.ahad00010.jatext.ui.components.isMessageImageAttachment
import com.ahad00010.jatext.ui.effects.LocalThanosSnapHost
import com.ahad00010.jatext.ui.effects.thanosSnapTarget
import com.ahad00010.jatext.ui.icons.WebUiIconKind
import com.ahad00010.jatext.ui.icons.WebUiSvgIcon
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.ahad00010.jatext.R
import com.ahad00010.jatext.data.CommunityPoll
import com.ahad00010.jatext.data.CommunityUser
import com.ahad00010.jatext.data.EncryptedBlobDescriptor
import com.ahad00010.jatext.data.ForwardedMessageContext
import com.ahad00010.jatext.data.GroupSeenReader
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.MessageReaction
import com.ahad00010.jatext.data.StatusReplyParser
import com.ahad00010.jatext.data.OFFICIAL_COMMUNITY_ID
import com.ahad00010.jatext.data.PollVoter
import com.ahad00010.jatext.data.ReplySummary
import com.ahad00010.jatext.data.ScheduledMessageItem
import com.ahad00010.jatext.data.StickerMedia
import com.ahad00010.jatext.data.TursoApiClient
import com.ahad00010.jatext.data.UNSEND_WINDOW_MS
import com.ahad00010.jatext.data.ViewOnceCodec
import com.ahad00010.jatext.media.VoiceNoteRecorderController
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.state.SessionUiState
import com.ahad00010.jatext.ui.components.ALL_BUBBLE_STYLE_SPECS
import com.ahad00010.jatext.ui.components.BubblePreviewThumbUi
import com.ahad00010.jatext.ui.components.CallMessageCardUi
import com.ahad00010.jatext.ui.components.StatusReplyCardUi
import com.ahad00010.jatext.ui.components.CommunityPollCardUi
import com.ahad00010.jatext.ui.components.ForwardedContextCardUi
import com.ahad00010.jatext.ui.components.FullscreenOverlaySlot
import com.ahad00010.jatext.ui.components.GroupCallMessageCardUi
import com.ahad00010.jatext.ui.components.buildPreviewAnnotatedWithSpoilers
import com.ahad00010.jatext.ui.components.GroupSeenAvatarsRowUi
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.components.JaGroupAvatar
import com.ahad00010.jatext.ui.components.JaOfficialBadge
import com.ahad00010.jatext.ui.components.JaTabItem
import com.ahad00010.jatext.ui.components.JaVerifiedBadge
import com.ahad00010.jatext.ui.components.JaWebGhostButton
import com.ahad00010.jatext.ui.components.JaWebIconButton
import com.ahad00010.jatext.ui.components.JaWebInput
import com.ahad00010.jatext.ui.components.JaWebPrimaryButton
import com.ahad00010.jatext.ui.components.JaWebTabs
import com.ahad00010.jatext.ui.components.MessageMediaAttachmentView
import com.ahad00010.jatext.ui.components.MessageReactionPillsRow
import com.ahad00010.jatext.ui.components.ReplyQuoteBannerUi
import com.ahad00010.jatext.ui.components.ResolvedBubbleColors
import com.ahad00010.jatext.ui.components.RichMarkdownText
import com.ahad00010.jatext.ui.components.RichTextWithLinksAndMentions
import com.ahad00010.jatext.ui.components.StyledMessageBubbleContainer
import com.ahad00010.jatext.ui.components.ViewOnceCircleBadge
import com.ahad00010.jatext.ui.components.ViewOnceMessageBubbleUi
import com.ahad00010.jatext.ui.components.WEB_WALLPAPER_PRESETS
import com.ahad00010.jatext.ui.components.jaBouncyClick
import com.ahad00010.jatext.ui.components.parseDmCallInvitePayload
import com.ahad00010.jatext.ui.components.parseGroupCallInvitePayload
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val ALL_REACTION_EMOJIS = listOf(
    "❤️", "😂", "🔥", "👍", "😮", "😢", "🎉", "💯",
    "🙏", "😍", "🥰", "😭", "🤣", "✨", "💀", "🫡",
    "👏", "🙌", "🤔", "👀", "🥳", "😎", "🤝", "💜",
    "💙", "💚", "🧡", "🤍", "🖤", "💔", "⚡", "🌟",
    "🚀", "🎵", "🎮", "☕", "🍕", "🏆", "✅", "❌",
    "😤", "😡", "🤯", "😴", "🤗", "😇", "🤩", "🫠",
    "🩷", "🩵", "🩶", "🥹", "🫶", "🫰", "🫩", "🫨",
    "🫪", "🪾", "🫆", "🫟", "🐦‍🔥", "🍋‍🟩", "🍄‍🟫", "⛓️‍💥",
)

private data class UnifiedThreadItem(
    val id: String,
    val renderKey: String = id,
    val senderId: String,
    val senderName: String,
    val senderUsername: String,
    val senderAvatarUrl: String?,
    val senderAvatarColor: String?,
    val body: String,
    val bubbleStyle: String?,
    val attachmentUrl: String?,
    val attachmentName: String?,
    val attachmentType: String?,
    val isSpoiler: Boolean = false,
    val encryptedAttachment: EncryptedBlobDescriptor?,
    val stickerUrl: String?,
    val poll: CommunityPoll?,
    val deliveryStatus: String?,
    val readAt: Long?,
    val editedAt: Long?,
    val unsentAt: Long?,
    val createdAt: Long,
    val replyTo: ReplySummary?,
    val reactions: List<MessageReaction>,
    val forwardedContext: ForwardedMessageContext?,
    /** Non-null when this message is a reply to a Status post (empty = no caption). */
    val statusReplyQuote: String? = null,
)

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ChatThreadScreen(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    onOpenPeerProfile: (JaUser) -> Unit,
    onOpenSecurityCode: (JaUser) -> Unit,
    onOpenGroupMembers: () -> Unit,
) {
    val context = LocalContext.current
    val palette = LocalJaTextPalette.current
    val scope = rememberCoroutineScope()
    val me = state.me ?: return
    val callUiState by vm.callEngine.uiState.collectAsState()

    val isCommunity = state.activeChatId == OFFICIAL_COMMUNITY_ID
    val activeFriend = remember(state.activeChatId, state.friends, me) {
        if (!isCommunity && state.activeChatId != null) {
            if (state.activeChatId == me.id) me
            else state.friends.firstOrNull { it.id == state.activeChatId }
        } else {
            null
        }
    }
    val isSelfChat = activeFriend?.id == me.id
    val activeGroup = remember(state.activeGroupId, state.groups) {
        if (state.activeGroupId != null) state.groups.firstOrNull { it.id == state.activeGroupId } else null
    }
    val activeGroupIsCommunity = activeGroup?.isCommunity == true ||
        state.groupDetails?.takeIf { it.id == state.activeGroupId }?.isCommunity == true
    val grpWordLower = if (activeGroupIsCommunity) "community" else "group"
    val grpWordCap = if (activeGroupIsCommunity) "Community" else "Group"
    val friendActivity = remember(activeFriend?.id, state.friendActivities) {
        activeFriend?.let { f -> state.friendActivities.firstOrNull { it.userId == f.id } }
    }

    BackHandler {
        vm.closeActiveChat()
    }

    val unifiedItems: List<UnifiedThreadItem> = remember(
        state.activeChatId,
        state.activeGroupId,
        state.dmMessages,
        state.groupMessages,
        state.communityMessages,
        activeFriend,
    ) {
        when {
            isCommunity -> state.communityMessages.map { m ->
                val statusReply = StatusReplyParser.parse(m.body)
                UnifiedThreadItem(
                    id = m.id,
                    renderKey = m.renderKey?.takeIf { it.isNotBlank() } ?: m.id,
                    senderId = m.senderId,
                    senderName = m.senderName,
                    senderUsername = m.senderUsername,
                    senderAvatarUrl = m.senderAvatarUrl,
                    senderAvatarColor = m.senderAvatarColor,
                    body = statusReply.body,
                    statusReplyQuote = statusReply.quote,
                    bubbleStyle = m.bubbleStyle,
                    attachmentUrl = m.attachmentUrl,
                    attachmentName = m.attachmentName,
                    attachmentType = m.attachmentType,
                    isSpoiler = m.isSpoiler,
                    encryptedAttachment = null,
                    stickerUrl = m.stickerUrl?.takeIf { it.isNotBlank() }?.let { TursoApiClient.resolveAbsoluteMediaUrl(it) },
                    poll = m.poll,
                    deliveryStatus = null,
                    readAt = null,
                    editedAt = m.editedAt,
                    unsentAt = m.unsentAt,
                    createdAt = m.createdAt,
                    replyTo = m.replyTo,
                    reactions = m.reactions,
                    forwardedContext = m.forwardedContext,
                )
            }
            state.activeGroupId != null -> state.groupMessages.map { m ->
                val statusReply = StatusReplyParser.parse(m.body)
                UnifiedThreadItem(
                    id = m.id,
                    renderKey = m.renderKey?.takeIf { it.isNotBlank() } ?: m.id,
                    senderId = m.senderId,
                    senderName = m.senderName,
                    senderUsername = m.senderUsername,
                    senderAvatarUrl = m.senderAvatarUrl,
                    senderAvatarColor = m.senderAvatarColor,
                    body = statusReply.body,
                    statusReplyQuote = statusReply.quote,
                    bubbleStyle = m.bubbleStyle,
                    attachmentUrl = m.attachmentUrl,
                    attachmentName = m.attachmentName,
                    attachmentType = m.attachmentType,
                    isSpoiler = m.isSpoiler,
                    encryptedAttachment = m.encryptedAttachment,
                    stickerUrl = m.explicitStickerUrl?.takeIf { it.isNotBlank() }?.let { TursoApiClient.resolveAbsoluteMediaUrl(it) },
                    poll = null,
                    deliveryStatus = null,
                    readAt = null,
                    editedAt = m.editedAt,
                    unsentAt = m.unsentAt,
                    createdAt = m.createdAt,
                    replyTo = m.replyTo,
                    reactions = m.reactions,
                    forwardedContext = m.forwardedContext,
                )
            }
            else -> state.dmMessages.map { m ->
                val mine = m.senderId == me.id
                val statusReply = StatusReplyParser.parse(m.body)
                UnifiedThreadItem(
                    id = m.id,
                    renderKey = m.renderKey?.takeIf { it.isNotBlank() } ?: m.id,
                    senderId = m.senderId,
                    senderName = if (mine) me.displayName else (activeFriend?.displayName ?: "Contact"),
                    senderUsername = if (mine) me.username else (activeFriend?.username ?: ""),
                    senderAvatarUrl = if (mine) me.avatarUrl else activeFriend?.avatarUrl,
                    senderAvatarColor = if (mine) me.avatarColor else activeFriend?.avatarColor,
                    body = statusReply.body,
                    statusReplyQuote = statusReply.quote,
                    bubbleStyle = m.bubbleStyle,
                    attachmentUrl = m.attachmentUrl,
                    attachmentName = m.attachmentName,
                    attachmentType = m.attachmentType,
                    isSpoiler = m.isSpoiler,
                    encryptedAttachment = m.encryptedAttachment,
                    stickerUrl = m.explicitStickerUrl?.takeIf { it.isNotBlank() }?.let { TursoApiClient.resolveAbsoluteMediaUrl(it) },
                    poll = null,
                    deliveryStatus = if (state.activeChatId == me.id) "read" else m.deliveryStatus,
                    readAt = m.readAt,
                    editedAt = m.editedAt,
                    unsentAt = m.unsentAt,
                    createdAt = m.createdAt,
                    replyTo = m.replyTo,
                    reactions = m.reactions,
                    forwardedContext = m.forwardedContext,
                )
            }
        }
    }

    val thanosSnapHost = LocalThanosSnapHost.current
    val threadScopeKey = state.activeGroupId?.let { "grp:$it" } ?: (state.activeChatId ?: "")
    val prevLiveItemsById = remember(threadScopeKey) { HashMap<String, UnifiedThreadItem>() }
    val heldSnappingItems = remember(threadScopeKey) { mutableStateMapOf<String, UnifiedThreadItem>() }
    val pendingPeerSnapQueue = remember(threadScopeKey) { HashMap<String, UnifiedThreadItem>() }

    val effectiveItems = unifiedItems.map { item ->
        if (item.unsentAt == null) {
            prevLiveItemsById[item.id] = item
            item
        } else {
            val held = heldSnappingItems[item.id]
            if (held != null) {
                held
            } else {
                val prevLive = prevLiveItemsById.remove(item.id)
                if (prevLive != null && thanosSnapHost != null && !thanosSnapHost.hasRecentlySnapped(item.id)) {
                    pendingPeerSnapQueue[item.id] = prevLive
                    prevLive
                } else {
                    item
                }
            }
        }
    }

    LaunchedEffect(unifiedItems) {
        if (pendingPeerSnapQueue.isNotEmpty() && thanosSnapHost != null) {
            val entries = pendingPeerSnapQueue.toMap()
            pendingPeerSnapQueue.clear()
            for ((msgId, liveItem) in entries) {
                heldSnappingItems[msgId] = liveItem
                scope.launch {
                    withFrameNanos { }
                    thanosSnapHost.snapMessageThen(msgId) {
                        heldSnappingItems.remove(msgId)
                    }
                }
            }
        }
    }

    val reversedItems = remember(effectiveItems) { effectiveItems.asReversed() }
    val listState = rememberLazyListState()
    val newestMessageId = reversedItems.firstOrNull()?.id

    LaunchedEffect(newestMessageId) {
        if (newestMessageId != null && listState.firstVisibleItemIndex <= 2) {
            listState.animateScrollToItem(0)
        }
    }

    // Thread key for Drafts & Client-Side Pinned Messages
    val activeThreadDraftKey = when {
        isCommunity -> "community"
        activeGroup != null -> "group:${activeGroup.id}"
        activeFriend != null -> "dm:${activeFriend.id}"
        else -> ""
    }

    // Composer & Modal states
    var draftText by remember(activeThreadDraftKey) {
        mutableStateOf(state.drafts[activeThreadDraftKey].orEmpty())
    }
    var replyingTo by remember(activeThreadDraftKey) { mutableStateOf<ReplySummary?>(null) }
    var editingTarget by remember(activeThreadDraftKey) { mutableStateOf<UnifiedThreadItem?>(null) }
    val pendingAttachmentUris = remember(activeThreadDraftKey) { mutableStateListOf<Uri>() }
    // Which staged files should arrive blurred. Keyed by the uri itself, so
    // removing one file never shifts another file's choice.
    val spoilerAttachmentUris = remember(activeThreadDraftKey) { mutableStateListOf<Uri>() }
    var viewOnceMode by remember(activeThreadDraftKey) { mutableStateOf(false) }
    var showInChatSearch by remember(activeThreadDraftKey) { mutableStateOf(false) }
    var inChatSearchQuery by remember(activeThreadDraftKey) { mutableStateOf("") }
    var inChatSearchCursor by remember(activeThreadDraftKey) { mutableIntStateOf(0) }
    var activePinnedCursor by remember(activeThreadDraftKey) { mutableIntStateOf(0) }
    var contextMenuMessage by remember { mutableStateOf<UnifiedThreadItem?>(null) }
    var emojiPickerTargetMessageId by remember { mutableStateOf<String?>(null) }
    var forwardingItem by remember { mutableStateOf<UnifiedThreadItem?>(null) }
    var fullscreenImageModel by remember { mutableStateOf<Any?>(null) }
    var showGroupExclusiveStories by remember { mutableStateOf(false) }
    val groupExclusiveStacks = remember(activeGroup?.id, state.updatesBundle.groupExclusiveStacks) {
        activeGroup?.id?.let { gid -> state.updatesBundle.groupExclusiveStacks[gid] }.orEmpty()
    }
    LaunchedEffect(activeGroup?.id) {
        if (activeGroup != null) {
            vm.refreshUpdatesBundle(silent = true)
        }
    }
    val shownTranscriptIds = remember { mutableStateMapOf<String, Boolean>() }
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val dismissKeyboardForCall: () -> Unit = {
        focusManager.clearFocus(force = true)
        keyboardController?.hide()
    }
    var showOverflowMenu by remember { mutableStateOf(false) }
    var showStickerSheet by remember { mutableStateOf(false) }
    var showBubbleStyleModal by remember { mutableStateOf(false) }
    var showWallpaperModal by remember { mutableStateOf(false) }
    var showCreatePollModal by remember { mutableStateOf(false) }
    var pollVotersTarget by remember { mutableStateOf<CommunityPoll?>(null) }
    var showModeratorsModal by remember { mutableStateOf(false) }
    var confirmUnfriendTarget by remember { mutableStateOf<JaUser?>(null) }
    var confirmDeleteGroupTarget by remember { mutableStateOf<GroupSummary?>(null) }
    var showComposerPlusMenu by remember { mutableStateOf(false) }
    var showScheduleSheet by remember { mutableStateOf(false) }
    var scheduleInitialTab by remember { mutableStateOf("compose") }

    BackHandler(enabled = showComposerPlusMenu) {
        showComposerPlusMenu = false
    }

    val activeSchedTargetKind = when {
        isCommunity -> "community"
        activeGroup != null -> "group"
        else -> "dm"
    }
    val activeSchedTargetId = when {
        isCommunity -> OFFICIAL_COMMUNITY_ID
        activeGroup != null -> activeGroup.id
        else -> activeFriend?.id.orEmpty()
    }
    val activeSchedTargetLabel = when {
        isCommunity -> "Official Community"
        activeGroup != null -> activeGroup.name
        activeFriend != null -> "@${activeFriend.username}"
        else -> "Chat"
    }
    val chatScheduledItems = remember(state.scheduledMessages, activeSchedTargetKind, activeSchedTargetId) {
        state.scheduledMessages.filter { item ->
            item.targetKind == activeSchedTargetKind &&
                (activeSchedTargetKind == "community" || item.targetId == activeSchedTargetId)
        }
    }

    val anyThreadOverlayOpen =
        contextMenuMessage != null ||
            emojiPickerTargetMessageId != null ||
            forwardingItem != null ||
            fullscreenImageModel != null ||
            showOverflowMenu ||
            showStickerSheet ||
            showBubbleStyleModal ||
            showWallpaperModal ||
            showCreatePollModal ||
            showScheduleSheet ||
            pollVotersTarget != null ||
            showModeratorsModal ||
            confirmUnfriendTarget != null ||
            confirmDeleteGroupTarget != null

    LaunchedEffect(anyThreadOverlayOpen) {
        if (anyThreadOverlayOpen) {
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
        }
    }

    // Voice Note Recorder
    val recorder = remember { VoiceNoteRecorderController(context) }
    var isRecordingVoice by remember { mutableStateOf(false) }
    var voiceElapsedMs by remember { mutableLongStateOf(0L) }
    var voiceAmp by remember { mutableFloatStateOf(0.15f) }

    DisposableEffect(Unit) {
        onDispose { recorder.stopAndDiscard() }
    }

    LaunchedEffect(isRecordingVoice) {
        while (isRecordingVoice) {
            voiceElapsedMs = recorder.elapsedMillis()
            voiceAmp = recorder.pollNormalizedAmplitude()
            delay(80L)
        }
    }

    val micPermLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            recorder.startRecording()
            isRecordingVoice = true
        } else {
            vm.showToast("Microphone permission is needed for voice notes")
        }
    }

    val attachmentLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        if (uris.isNotEmpty()) {
            uris.forEach { u ->
                if (!pendingAttachmentUris.contains(u)) pendingAttachmentUris.add(u)
            }
        }
    }

    val wallpaperScopeKey = when {
        state.activeGroupId != null -> "grp:${state.activeGroupId}"
        !isCommunity && state.activeChatId != null -> "dm:${state.activeChatId}"
        else -> "global"
    }
    val activeWallpaperUrl = remember(
        wallpaperScopeKey,
        state.wallpaperNonce,
        state.dmMessages.size,
        state.groupMessages.size,
    ) {
        if (isCommunity) null else vm.cache.getWallpaperUrl(wallpaperScopeKey)?.takeIf { it.isNotBlank() }
    }
    val resolvedWallpaperUrl = remember(activeWallpaperUrl) {
        activeWallpaperUrl?.let { raw ->
            when {
                raw.startsWith("preset:") -> {
                    val pid = raw.removePrefix("preset:")
                    WEB_WALLPAPER_PRESETS.firstOrNull { it.id == pid }?.url
                }
                raw.startsWith("file:") || raw.startsWith("content:") -> raw
                else -> TursoApiClient.resolveAbsoluteMediaUrl(raw)
            }
        }
    }
    val hasWallpaper = !resolvedWallpaperUrl.isNullOrBlank()

    val knownGroupIds = remember(state.groups) { state.groups.map { it.id }.toSet() }
    val knownFriendIds = remember(state.friends) { state.friends.map { it.id }.toSet() }

    /* ==================== Full-Bleed Root Box so Wallpaper Affects Header Contact Card + Thread + Composer! ==================== */
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bgPrimary)
    ) {
        if (hasWallpaper && resolvedWallpaperUrl != null) {
            AsyncImage(
                model = resolvedWallpaperUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            // Subtle dark scrim matching `.chat.has-wallpaper::before` in `src/index.css`
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color(0x8808090F),
                                Color(0x5208090F),
                                Color(0x8C08090F),
                            )
                        )
                    )
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
        ) {
            /* ==================== Contact / Group / Community Header Card (Seamless Edge-to-Edge Status Bar!) ==================== */
            val headerCardBg = if (hasWallpaper) Color(0x9C11131C) else palette.bgSecondary
            val headerCardBorder = if (hasWallpaper) Color(0x36FFFFFF) else palette.border
            val headerTitleColor = if (hasWallpaper) Color(0xFFF8FAFC) else palette.textPrimary
            val headerSubColor = if (hasWallpaper) Color(0xFFD6DAE6) else palette.textSecondary
            val headerIconBg = if (hasWallpaper) Color(0x47000000) else palette.bgTertiary
            val headerIconBorder = if (hasWallpaper) Color(0x33FFFFFF) else palette.border

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(
                        if (hasWallpaper) {
                            Modifier
                                .statusBarsPadding()
                                .padding(horizontal = 8.dp, vertical = 5.dp)
                                .clip(RoundedCornerShape(18.dp))
                                .background(headerCardBg)
                                .border(1.dp, headerCardBorder, RoundedCornerShape(18.dp))
                                .padding(horizontal = 9.dp, vertical = 7.dp)
                        } else {
                            Modifier
                                .background(headerCardBg)
                                .statusBarsPadding()
                                .padding(horizontal = 10.dp, vertical = 8.dp)
                        }
                    ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                JaWebIconButton(
                    icon = Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = "Back",
                    size = 32.dp,
                    iconSize = 16.dp,
                    containerColor = headerIconBg,
                    borderColor = headerIconBorder,
                    iconTint = headerTitleColor,
                    onClick = { vm.closeActiveChat() },
                )
                Spacer(Modifier.width(7.dp))

                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .clickable {
                            when {
                                activeFriend != null -> onOpenPeerProfile(activeFriend)
                                activeGroup != null -> onOpenGroupMembers()
                            }
                        }
                        .padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    when {
                        isCommunity -> {
                            Image(
                                painter = painterResource(id = R.drawable.jatext_logo_icon),
                                contentDescription = "JaText Community",
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape),
                            )
                        }
                        activeGroup != null -> {
                            JaGroupAvatar(
                                avatarUrl = activeGroup.avatarUrl,
                                name = activeGroup.name,
                                size = 36.dp,
                                ringWidth = if (activeGroup.isCommunity || !activeGroup.avatarColor.isNullOrBlank()) 2.5.dp else 2.dp,
                                avatarColor = activeGroup.avatarColor,
                            )
                        }
                        activeFriend != null -> {
                            val peerPresence = when {
                                isSelfChat -> "online"
                                friendActivity?.online == true -> {
                                    when (friendActivity.statusPreference) {
                                        "dnd" -> "dnd"
                                        "away", "idle" -> "away"
                                        "offline" -> "offline"
                                        else -> "online"
                                    }
                                }
                                else -> friendActivity?.status ?: "offline"
                            }
                            JaAvatar(
                                avatarUrl = activeFriend.avatarUrl,
                                displayName = activeFriend.displayName.ifBlank { activeFriend.username },
                                avatarColor = activeFriend.avatarColor,
                                size = 36.dp,
                                ringWidth = 2.dp,
                                presenceStatus = peerPresence,
                                statusBorderColor = if (hasWallpaper) Color(0xFF141620) else palette.bgSecondary,
                            )
                        }
                    }
                    Spacer(Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = when {
                                    isCommunity -> "JaText Community"
                                    activeGroup != null -> activeGroup.name
                                    activeFriend != null -> {
                                        val base = activeFriend.displayName.ifBlank { activeFriend.username }
                                        if (isSelfChat) "$base (You)" else base
                                    }
                                    else -> "Chat"
                                },
                                color = headerTitleColor,
                                fontSize = 15.5.sp,
                                fontWeight = FontWeight.ExtraBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f, fill = false),
                            )
                            if (isCommunity) {
                                Spacer(Modifier.width(5.dp))
                                JaVerifiedBadge(size = 15.dp)
                                Spacer(Modifier.width(4.dp))
                                JaOfficialBadge()
                            }
                        }
                        val statusDotColor = when {
                            activeFriend == null -> null
                            isSelfChat -> Color(0xFF22C55E)
                            friendActivity?.online == true -> when (friendActivity.statusPreference) {
                                "dnd" -> Color(0xFFEF4444)
                                "away", "idle" -> Color(0xFFF59E0B)
                                else -> Color(0xFF22C55E)
                            }
                            else -> Color(0xFF626272)
                        }
                        val isDmPeerTyping = !isSelfChat && (
                            friendActivity?.typingToMe == true ||
                                (activeFriend != null && state.dmTypingUserIds.contains(activeFriend.id))
                            )
                        val activeGroupTypers = if (activeGroup != null) {
                            state.typingByGroup[activeGroup.id]?.takeIf { it.isNotEmpty() } ?: state.groupTypingUsers
                        } else {
                            emptyList()
                        }
                        val subtitle = when {
                            isCommunity -> {
                                if (state.communityTypingUsers.isNotEmpty()) {
                                    formatTypingUsersLabel(state.communityTypingUsers)
                                } else {
                                    "Official JaText announcements"
                                }
                            }
                            activeGroup != null -> {
                                if (activeGroupTypers.isNotEmpty()) {
                                    formatTypingUsersLabel(activeGroupTypers)
                                } else {
                                    "${state.groupDetails?.members?.size ?: activeGroup.memberCount} members · Encrypted"
                                }
                            }
                            isSelfChat -> "Message yourself"
                            isDmPeerTyping -> "typing…"
                            friendActivity?.online == true -> {
                                when (friendActivity.statusPreference) {
                                    "dnd" -> "Do Not Disturb"
                                    "away", "idle" -> "Idle"
                                    else -> "Online"
                                }
                            }
                            activeFriend != null -> formatLastSeenPresenceLabel(friendActivity?.lastSeenAt)
                            else -> "End-to-End Encrypted"
                        }
                        var subtitleFontSizeSp by remember(subtitle) { mutableFloatStateOf(11.5f) }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (statusDotColor != null && !subtitle.contains("typing")) {
                                Box(
                                    modifier = Modifier
                                        .size(6.5.dp)
                                        .clip(CircleShape)
                                        .background(statusDotColor)
                                )
                                Spacer(Modifier.width(5.dp))
                            }
                            Text(
                                text = subtitle,
                                color = if (subtitle.contains("typing")) palette.accent else headerSubColor,
                                fontSize = subtitleFontSizeSp.sp,
                                lineHeight = (subtitleFontSizeSp + 2.5f).sp,
                                maxLines = 2,
                                softWrap = true,
                                overflow = TextOverflow.Clip,
                                onTextLayout = { layoutResult ->
                                    if (layoutResult.lineCount > 1 && subtitleFontSizeSp > 10f) {
                                        subtitleFontSizeSp = (subtitleFontSizeSp - 0.5f).coerceAtLeast(10f)
                                    }
                                },
                            )
                        }
                    }
                }

                if (!isCommunity && !isSelfChat) {
                    Spacer(Modifier.width(5.dp))
                    JaWebIconButton(
                        icon = Icons.Rounded.Call,
                        contentDescription = "Voice Call",
                        size = 32.dp,
                        iconSize = 15.5.dp,
                        containerColor = headerIconBg,
                        borderColor = headerIconBorder,
                        iconTint = headerTitleColor,
                        onClick = {
                            dismissKeyboardForCall()
                            if (activeFriend != null) vm.callEngine.startDmCall(me, activeFriend, "voice")
                            else if (activeGroup != null) vm.callEngine.startGroupCall(me, activeGroup, "voice")
                        },
                    )
                    Spacer(Modifier.width(5.dp))
                    JaWebIconButton(
                        icon = Icons.Rounded.Videocam,
                        contentDescription = "Video Call",
                        size = 32.dp,
                        iconSize = 15.5.dp,
                        containerColor = headerIconBg,
                        borderColor = headerIconBorder,
                        iconTint = headerTitleColor,
                        onClick = {
                            dismissKeyboardForCall()
                            if (activeFriend != null) vm.callEngine.startDmCall(me, activeFriend, "video")
                            else if (activeGroup != null) vm.callEngine.startGroupCall(me, activeGroup, "video")
                        },
                    )
                } else if (isCommunity && state.communityPermissions.isOwner) {
                    Spacer(Modifier.width(5.dp))
                    JaWebIconButton(
                        icon = Icons.Rounded.HowToReg,
                        contentDescription = "Elect moderators",
                        size = 32.dp,
                        iconSize = 16.dp,
                        containerColor = headerIconBg,
                        borderColor = headerIconBorder,
                        iconTint = headerTitleColor,
                        onClick = { showModeratorsModal = true },
                    )
                }

                if (groupExclusiveStacks.isNotEmpty()) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color(0x2814D990))
                            .border(1.dp, Color(0xFF14D990), RoundedCornerShape(999.dp))
                            .jaBouncyClick { showGroupExclusiveStories = true }
                            .padding(horizontal = 8.dp, vertical = 5.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "Status (${groupExclusiveStacks.size})",
                            color = headerTitleColor,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Spacer(Modifier.width(5.dp))
                }
                Spacer(Modifier.width(5.dp))
                Box {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .jaBouncyClick(pressedScale = 0.88f) { showOverflowMenu = true }
                            .clip(CircleShape)
                            .background(headerIconBg)
                            .border(1.dp, headerIconBorder, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        WebUiSvgIcon(
                            kind = WebUiIconKind.MoreVertical,
                            tint = if (showInChatSearch) palette.accent else headerTitleColor,
                            size = 16.dp,
                        )
                    }
                    val activePreview = activeFriend?.let { fr ->
                        state.previews.firstOrNull { it.friendId == fr.id }
                    }
                    val isFriendBlocked = activeFriend != null && state.blockedUserIds.contains(activeFriend.id)
                    DropdownMenu(
                        expanded = showOverflowMenu,
                        onDismissRequest = { showOverflowMenu = false },
                        containerColor = palette.bgSecondary,
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(1.dp, palette.border),
                        modifier = Modifier.widthIn(min = 232.dp),
                    ) {
                        ChatOverflowSvgItem(
                            icon = WebUiIconKind.Search,
                            label = if (showInChatSearch) "Close search" else com.ahad00010.jatext.data.jt("chat.searchInChat"),
                            iconTint = if (showInChatSearch) palette.accent else palette.textSecondary,
                            onClick = {
                                showOverflowMenu = false
                                showInChatSearch = !showInChatSearch
                                if (!showInChatSearch) inChatSearchQuery = ""
                            },
                        )
                        if (activeFriend != null) {
                            ChatOverflowSvgItem(
                                icon = WebUiIconKind.User,
                                label = "View profile",
                                iconTint = palette.textSecondary,
                                onClick = {
                                    showOverflowMenu = false
                                    onOpenPeerProfile(activeFriend)
                                },
                            )
                            ChatOverflowSvgItem(
                                icon = WebUiIconKind.ShieldCheck,
                                label = "Verify security code",
                                iconTint = palette.accent,
                                onClick = {
                                    showOverflowMenu = false
                                    onOpenSecurityCode(activeFriend)
                                },
                            )
                        }
                        if (activeGroup != null) {
                            ChatOverflowSvgItem(
                                icon = WebUiIconKind.Settings,
                                label = "$grpWordCap settings & members",
                                iconTint = palette.textSecondary,
                                onClick = {
                                    showOverflowMenu = false
                                    onOpenGroupMembers()
                                },
                            )
                        }
                        ChatOverflowSvgItem(
                            icon = WebUiIconKind.BubblePalette,
                            label = "Bubble style",
                            iconTint = palette.accent,
                            onClick = {
                                showOverflowMenu = false
                                showBubbleStyleModal = true
                            },
                        )
                        if (!isCommunity) {
                            ChatOverflowSvgItem(
                                icon = WebUiIconKind.Image,
                                label = if (activeGroup != null) "$grpWordCap wallpaper" else "Chat wallpaper",
                                iconTint = palette.accent,
                                onClick = {
                                    showOverflowMenu = false
                                    showWallpaperModal = true
                                },
                            )
                        }
                        if (activeFriend != null) {
                            val isMuted = activePreview?.isMuted == true
                            val isArchived = activePreview?.isArchived == true
                            if (!isSelfChat) {
                                ChatOverflowSvgItem(
                                    icon = if (isMuted) WebUiIconKind.Bell else WebUiIconKind.BellOff,
                                    label = if (isMuted) "Unmute chat" else "Mute chat",
                                    iconTint = palette.textSecondary,
                                    onClick = {
                                        showOverflowMenu = false
                                        vm.setDmConversationPrefs(activeFriend.id, muted = !isMuted)
                                    },
                                )
                            }
                            ChatOverflowSvgItem(
                                icon = WebUiIconKind.Archive,
                                label = if (isArchived) "Unarchive chat" else "Archive chat",
                                iconTint = palette.textSecondary,
                                onClick = {
                                    showOverflowMenu = false
                                    vm.setDmConversationPrefs(activeFriend.id, archived = !isArchived)
                                },
                            )
                            HorizontalDivider(
                                color = palette.border,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            )
                            ChatOverflowSvgItem(
                                icon = WebUiIconKind.Trash,
                                label = "Remove chat",
                                textTint = palette.danger,
                                iconTint = palette.danger,
                                onClick = {
                                    showOverflowMenu = false
                                    vm.setDmConversationPrefs(activeFriend.id, removeChatHistory = true)
                                },
                            )
                            if (!isSelfChat) {
                                ChatOverflowSvgItem(
                                    icon = WebUiIconKind.UserMinus,
                                    label = "Unfriend",
                                    textTint = palette.danger,
                                    iconTint = palette.danger,
                                    onClick = {
                                        showOverflowMenu = false
                                        confirmUnfriendTarget = activeFriend
                                    },
                                )
                                ChatOverflowSvgItem(
                                    icon = if (isFriendBlocked) WebUiIconKind.Unlock else WebUiIconKind.Ban,
                                    label = if (isFriendBlocked) "Unblock" else "Block",
                                    textTint = if (isFriendBlocked) palette.textPrimary else palette.danger,
                                    iconTint = if (isFriendBlocked) palette.success else palette.danger,
                                    onClick = {
                                        showOverflowMenu = false
                                        vm.setBlockedUser(activeFriend.id, !isFriendBlocked)
                                    },
                                )
                            }
                        }
                        if (activeGroup != null) {
                            ChatOverflowSvgItem(
                                icon = if (activeGroup.isSilenced) WebUiIconKind.Bell else WebUiIconKind.BellOff,
                                label = if (activeGroup.isSilenced) "Unsilence $grpWordLower" else "Silence $grpWordLower",
                                iconTint = palette.textSecondary,
                                onClick = {
                                    showOverflowMenu = false
                                    vm.setGroupPrefs(activeGroup.id, silenced = !activeGroup.isSilenced)
                                },
                            )
                            ChatOverflowSvgItem(
                                icon = WebUiIconKind.Archive,
                                label = if (activeGroup.isArchived) "Unarchive $grpWordLower" else "Archive $grpWordLower",
                                iconTint = palette.textSecondary,
                                onClick = {
                                    showOverflowMenu = false
                                    vm.setGroupPrefs(activeGroup.id, archived = !activeGroup.isArchived)
                                },
                            )
                            HorizontalDivider(
                                color = palette.border,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            )
                            ChatOverflowSvgItem(
                                icon = WebUiIconKind.Trash,
                                label = "Remove chat",
                                textTint = palette.danger,
                                iconTint = palette.danger,
                                onClick = {
                                    showOverflowMenu = false
                                    vm.removeGroupChatWithoutLeaving(activeGroup.id)
                                },
                            )
                            if (activeGroup.myRole == "owner") {
                                ChatOverflowSvgItem(
                                    icon = WebUiIconKind.Trash,
                                    label = "Delete $grpWordLower",
                                    textTint = palette.danger,
                                    iconTint = palette.danger,
                                    onClick = {
                                        showOverflowMenu = false
                                        confirmDeleteGroupTarget = activeGroup
                                    },
                                )
                            }
                        }
                        if (isCommunity) {
                            ChatOverflowSvgItem(
                                icon = if (state.communityMuted) WebUiIconKind.Bell else WebUiIconKind.BellOff,
                                label = if (state.communityMuted) "Unmute" else "Mute",
                                iconTint = palette.textSecondary,
                                onClick = {
                                    showOverflowMenu = false
                                    vm.setCommunityMuted(!state.communityMuted)
                                },
                            )
                            if (state.communityPermissions.isOwner) {
                                ChatOverflowSvgItem(
                                    icon = WebUiIconKind.Settings,
                                    label = "Elect moderators",
                                    iconTint = palette.accent,
                                    onClick = {
                                        showOverflowMenu = false
                                        showModeratorsModal = true
                                    },
                                )
                            }
                        }
                    }
                }
            }

            if (!hasWallpaper) {
                HorizontalDivider(color = palette.border)
            }

            /* ==================== In-Chat Search Bar & Match Jump ==================== */
            val searchMatchIds = remember(inChatSearchQuery, reversedItems) {
                val q = inChatSearchQuery.trim().lowercase()
                if (q.isEmpty()) emptyList()
                else reversedItems
                    .filter { msg ->
                        msg.unsentAt == null &&
                            !ViewOnceCodec.isViewOnceBody(msg.body) &&
                            msg.body.lowercase().contains(q)
                    }
                    .map { it.id }
            }
            AnimatedVisibility(visible = showInChatSearch) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (hasWallpaper) Color(0xCC11131C) else palette.bgSecondary)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    JaWebInput(
                        value = inChatSearchQuery,
                        onValueChange = {
                            inChatSearchQuery = it
                            inChatSearchCursor = 0
                            val firstId = reversedItems.firstOrNull { m ->
                                it.trim().isNotEmpty() &&
                                    m.unsentAt == null &&
                                    !ViewOnceCodec.isViewOnceBody(m.body) &&
                                    m.body.lowercase().contains(it.trim().lowercase())
                            }?.id
                            if (firstId != null) {
                                val idx = reversedItems.indexOfFirst { m -> m.id == firstId }
                                if (idx >= 0) scope.launch { listState.animateScrollToItem(idx) }
                            }
                        },
                        placeholder = com.ahad00010.jatext.data.jt("chat.searchInChat"),
                        leadingIcon = Icons.Rounded.Search,
                        modifier = Modifier.weight(1f),
                    )
                    if (inChatSearchQuery.isNotBlank()) {
                        val safeCur = if (searchMatchIds.isEmpty()) 0 else inChatSearchCursor.coerceIn(0, searchMatchIds.lastIndex)
                        Text(
                            text = if (searchMatchIds.isEmpty()) "0/0" else "${safeCur + 1}/${searchMatchIds.size}",
                            color = palette.textSecondary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        JaWebIconButton(
                            icon = Icons.Rounded.KeyboardArrowUp,
                            contentDescription = "Older match",
                            size = 32.dp,
                            iconSize = 18.dp,
                            onClick = {
                                if (searchMatchIds.isNotEmpty()) {
                                    val next = (safeCur + 1) % searchMatchIds.size
                                    inChatSearchCursor = next
                                    val idx = reversedItems.indexOfFirst { it.id == searchMatchIds[next] }
                                    if (idx >= 0) scope.launch { listState.animateScrollToItem(idx) }
                                }
                            },
                        )
                        JaWebIconButton(
                            icon = Icons.Rounded.KeyboardArrowDown,
                            contentDescription = "Newer match",
                            size = 32.dp,
                            iconSize = 18.dp,
                            onClick = {
                                if (searchMatchIds.isNotEmpty()) {
                                    val prev = (safeCur - 1 + searchMatchIds.size) % searchMatchIds.size
                                    inChatSearchCursor = prev
                                    val idx = reversedItems.indexOfFirst { it.id == searchMatchIds[prev] }
                                    if (idx >= 0) scope.launch { listState.animateScrollToItem(idx) }
                                }
                            },
                        )
                    }
                    JaWebIconButton(
                        icon = Icons.Rounded.Close,
                        contentDescription = "Close search",
                        size = 32.dp,
                        iconSize = 16.dp,
                        onClick = {
                            showInChatSearch = false
                            inChatSearchQuery = ""
                        },
                    )
                }
            }

            /* ==================== Client-Side Pinned Messages Banner ==================== */
            val threadPinnedList = state.pinnedMessagesByThread[activeThreadDraftKey].orEmpty()
            if (threadPinnedList.isNotEmpty()) {
                val safePinIdx = activePinnedCursor.coerceIn(0, threadPinnedList.lastIndex)
                val activePin = threadPinnedList[safePinIdx]
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (hasWallpaper) Color(0xC411131C) else palette.bgSecondary)
                        .clickable {
                            val idx = reversedItems.indexOfFirst { it.id == activePin.id }
                            if (idx >= 0) scope.launch { listState.animateScrollToItem(idx) }
                            if (threadPinnedList.size > 1) {
                                activePinnedCursor = (safePinIdx + 1) % threadPinnedList.size
                            }
                        }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.PushPin,
                        contentDescription = "Pinned message",
                        tint = palette.accent,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (threadPinnedList.size > 1) {
                                "${com.ahad00010.jatext.data.jt("chat.pinned")} (${safePinIdx + 1}/${threadPinnedList.size}) · ${activePin.senderName}"
                            } else {
                                "${com.ahad00010.jatext.data.jt("chat.pinned")} · ${activePin.senderName}"
                            },
                            color = palette.accent,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                        )
                        val pinnedAnnotated = remember(activePin.preview, palette.isDark, hasWallpaper) {
                            buildPreviewAnnotatedWithSpoilers(activePin.preview, isDark = hasWallpaper || palette.isDark)
                        }
                        Text(
                            text = pinnedAnnotated,
                            color = if (hasWallpaper) Color.White else palette.textPrimary,
                            fontSize = 12.5.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    IconButton(
                        onClick = {
                            vm.togglePinMessageInThread(
                                threadKey = activeThreadDraftKey,
                                messageId = activePin.id,
                                senderName = activePin.senderName,
                                preview = activePin.preview,
                            )
                        },
                        modifier = Modifier.size(28.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = "Unpin",
                            tint = palette.textSecondary,
                            modifier = Modifier.size(15.dp),
                        )
                    }
                }
                HorizontalDivider(color = if (hasWallpaper) Color(0x28FFFFFF) else palette.border)
            }

            /* ==================== Message Thread ==================== */
            val animatedSendKeys = remember(threadScopeKey) { HashSet<String>() }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                LazyColumn(
                    state = listState,
                    reverseLayout = true,
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(if (isCommunity) 10.dp else 6.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(
                        items = reversedItems,
                        key = { it.renderKey.ifBlank { it.id } },
                    ) { msg ->
                        val stableKey = msg.renderKey.ifBlank { msg.id }
                        val isMineMsg = msg.senderId == me.id
                        val shouldAnimateEntrance = remember(stableKey) {
                            val freshOutgoing = isMineMsg && (
                                stableKey.startsWith("opt-") ||
                                    msg.id.startsWith("opt-") ||
                                    kotlin.math.abs(System.currentTimeMillis() - msg.createdAt) < 2200L
                                )
                            if (freshOutgoing && animatedSendKeys.add(stableKey)) true else false
                        }
                        val sendProgress = remember(stableKey) {
                            Animatable(if (shouldAnimateEntrance) 0f else 1f)
                        }
                        LaunchedEffect(stableKey, shouldAnimateEntrance) {
                            if (shouldAnimateEntrance && sendProgress.value < 1f) {
                                sendProgress.animateTo(
                                    targetValue = 1f,
                                    animationSpec = spring(
                                        dampingRatio = 0.72f,
                                        stiffness = 460f,
                                    ),
                                )
                            }
                        }
                        val rowEntranceMod = if (sendProgress.value < 0.999f) {
                            Modifier.graphicsLayer {
                                val p = sendProgress.value.coerceIn(0f, 1.08f)
                                alpha = (0.15f + 0.85f * p).coerceIn(0f, 1f)
                                val sc = 0.88f + 0.12f * p
                                scaleX = sc
                                scaleY = sc
                                translationY = (1f - p) * 20.dp.toPx()
                                translationX = (1f - p) * 8.dp.toPx()
                                transformOrigin = TransformOrigin(0.95f, 1f)
                            }
                        } else {
                            Modifier
                        }
                        Box(modifier = rowEntranceMod) {
                        if (isCommunity) {
                            CommunityAnnouncementPostCard(
                                msg = msg,
                                myUserId = me.id,
                                canReply = state.communityPermissions.canPost,
                                canManagePolls = state.communityPermissions.canManagePolls,
                                knownGroupIds = knownGroupIds,
                                knownFriendIds = knownFriendIds,
                                onOpenAuthorProfile = {
                                    onOpenPeerProfile(
                                        JaUser(
                                            id = msg.senderId,
                                            displayName = msg.senderName.ifBlank { "JaText" },
                                            username = msg.senderUsername.ifBlank { "jatext" },
                                            avatarColor = msg.senderAvatarColor ?: "black",
                                            avatarUrl = msg.senderAvatarUrl,
                                            onboardingComplete = true,
                                        )
                                    )
                                },
                                onSwipeReply = {
                                    if (state.communityPermissions.canPost && msg.unsentAt == null) {
                                        replyingTo = ReplySummary(
                                            id = msg.id,
                                            senderId = msg.senderId,
                                            senderName = msg.senderName,
                                            body = ViewOnceCodec.sanitizePreview(msg.body).ifBlank { "Attachment" },
                                        )
                                    }
                                },
                                onLongPress = {
                                    if (msg.unsentAt == null) contextMenuMessage = msg
                                },
                                onToggleReaction = { emoji -> vm.toggleReaction(msg.id, emoji) },
                                onOpenEmojiPicker = { emojiPickerTargetMessageId = msg.id },
                                onJumpToReply = { replyId ->
                                    val idx = reversedItems.indexOfFirst { it.id == replyId }
                                    if (idx >= 0) scope.launch { listState.animateScrollToItem(idx) }
                                },
                                onJumpToForwarded = { fwd -> vm.jumpToForwardedSource(fwd) },
                                onVotePoll = { optIdx -> msg.poll?.let { vm.voteCommunityPoll(it.id, optIdx) } },
                                onEndPoll = { msg.poll?.let { vm.endCommunityPoll(it.id) } },
                                onViewPollVoters = { msg.poll?.let { pollVotersTarget = it } },
                                onOpenFullscreenImage = { model -> fullscreenImageModel = model },
                                showTranscript = shownTranscriptIds[msg.id] == true,
                                onHideTranscript = { shownTranscriptIds[msg.id] = false },
                                highlightQuery = if (showInChatSearch) inChatSearchQuery else "",
                            )
                        } else {
                            val isMine = msg.senderId == me.id
                            val wpEvent = remember(msg.body, msg.attachmentUrl, msg.unsentAt) {
                                if (msg.unsentAt != null) null
                                else JaTextCryptoEngine.parseWallpaperSignal(msg.body, msg.attachmentUrl)
                            }
                            if (wpEvent != null) {
                                val actorLabel = if (isMine) {
                                    "You"
                                } else {
                                    wpEvent.actorName?.takeIf { it.isNotBlank() }
                                        ?: msg.senderName.ifBlank { "Someone" }
                                }
                                val actionLabel = if (wpEvent.kind == "none") {
                                    "cleared the chat wallpaper"
                                } else {
                                    "changed the chat wallpaper"
                                }
                                WallpaperEventPillRow(
                                    label = "$actorLabel $actionLabel",
                                    hasWallpaper = hasWallpaper,
                                )
                            } else {
                                val seenReaders = if (activeGroup != null) {
                                    state.groupSeenByMessageId[msg.id].orEmpty()
                                } else {
                                    emptyList()
                                }
                                SwipeableMessageRow(
                                    msg = msg,
                                    isMine = isMine,
                                    isGroupThread = activeGroup != null,
                                    hasWallpaper = hasWallpaper,
                                    showSenderHeader = !isMine && activeGroup != null,
                                    myUserId = me.id,
                                    activeCallId = callUiState.callId.takeIf { callUiState.active },
                                    seenReaders = seenReaders,
                                    knownGroupIds = knownGroupIds,
                                    knownFriendIds = knownFriendIds,
                                    onSwipeReply = {
                                        if (msg.unsentAt == null) {
                                            replyingTo = ReplySummary(
                                                id = msg.id,
                                                senderId = msg.senderId,
                                                senderName = msg.senderName,
                                                body = ViewOnceCodec.sanitizePreview(msg.body).ifBlank { "Attachment" },
                                            )
                                        }
                                    },
                                    onLongPress = {
                                        if (msg.unsentAt == null) contextMenuMessage = msg
                                    },
                                    onToggleReaction = { emoji -> vm.toggleReaction(msg.id, emoji) },
                                    onOpenEmojiPicker = { emojiPickerTargetMessageId = msg.id },
                                    onJumpToReply = { replyId ->
                                        val idx = reversedItems.indexOfFirst { it.id == replyId }
                                        if (idx >= 0) scope.launch { listState.animateScrollToItem(idx) }
                                    },
                                    onJumpToForwarded = { fwd -> vm.jumpToForwardedSource(fwd) },
                                    onOpenFullscreenImage = { model -> fullscreenImageModel = model },
                                    onClickSenderOrReader = { user ->
                                        val hydrated = state.groupDetails?.members
                                            ?.firstOrNull { it.id == user.id }
                                            ?.toJaUser()
                                            ?: state.friends.firstOrNull { it.id == user.id }
                                            ?: (if (state.me?.id == user.id) state.me else null)
                                            ?: user
                                        onOpenPeerProfile(hydrated)
                                    },
                                    onCallAction = { mode ->
                                        dismissKeyboardForCall()
                                        if (callUiState.active) {
                                            vm.callEngine.setMinimized(false)
                                        } else if (activeFriend != null) {
                                            vm.callEngine.startDmCall(me, activeFriend, mode)
                                        } else if (activeGroup != null) {
                                            vm.callEngine.startGroupCall(me, activeGroup, mode)
                                        }
                                    },
                                    isViewOnceOpened = state.openedViewOnceIds.contains(msg.id),
                                    onBurnViewOnce = { burnedId -> vm.markViewOnceMessageOpened(burnedId) },
                                    showTranscript = shownTranscriptIds[msg.id] == true,
                                    onHideTranscript = { shownTranscriptIds[msg.id] = false },
                                    highlightQuery = if (showInChatSearch) inChatSearchQuery else "",
                                )
                            }
                        }
                        }
                    }

                    /* ---- Contact Name Intro Card at Top of 1:1 DM (Affected by Active Chat Wallpaper!) ---- */
                    if (!isCommunity && activeFriend != null && !state.dmHasMore) {
                        item(key = "dm-contact-intro-card") {
                            ContactThreadIntroCard(
                                friend = activeFriend,
                                resolvedWallpaperUrl = resolvedWallpaperUrl,
                                onOpenProfile = { onOpenPeerProfile(activeFriend) },
                            )
                        }
                    }

                    if ((state.activeChatId != null && !isCommunity && state.dmHasMore) ||
                        (state.activeGroupId != null && state.groupHasMore) ||
                        (isCommunity && state.communityHasMore)
                    ) {
                        item(key = "load-older-trigger") {
                            LaunchedEffect(Unit) {
                                vm.loadOlderMessagesForActiveThread()
                            }
                        }
                    }
                }
            }

            /* ==================== Reply / Edit / Bulk Attachments Banner ==================== */
            AnimatedVisibility(
                visible = replyingTo != null || editingTarget != null || pendingAttachmentUris.isNotEmpty(),
                enter = expandVertically(animationSpec = spring(stiffness = Spring.StiffnessMediumLow)) + fadeIn(),
                exit = shrinkVertically(animationSpec = spring(stiffness = Spring.StiffnessMedium)) + fadeOut(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (hasWallpaper) Color(0xBA11131C) else palette.bgSecondary)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (replyingTo != null || editingTarget != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = if (editingTarget != null) Icons.Rounded.Edit else Icons.AutoMirrored.Rounded.Reply,
                                contentDescription = null,
                                tint = palette.accent,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = if (editingTarget != null) "Editing message" else "Replying to ${replyingTo?.senderName}",
                                    color = palette.accent,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                val bannerAnnotated = remember(editingTarget?.body, replyingTo?.body, palette.isDark, hasWallpaper) {
                                    val rawBanner = editingTarget?.body
                                        ?: ViewOnceCodec.sanitizePreview(replyingTo?.body)
                                    if (editingTarget != null) {
                                        androidx.compose.ui.text.AnnotatedString(rawBanner)
                                    } else {
                                        buildPreviewAnnotatedWithSpoilers(rawBanner, isDark = hasWallpaper || palette.isDark)
                                    }
                                }
                                Text(
                                    text = bannerAnnotated,
                                    color = if (hasWallpaper) Color(0xFFE2E8F0) else palette.textSecondary,
                                    fontSize = 12.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            IconButton(
                                onClick = {
                                    replyingTo = null
                                    if (editingTarget != null) {
                                        editingTarget = null
                                        draftText = state.drafts[activeThreadDraftKey].orEmpty()
                                    }
                                },
                                modifier = Modifier.size(28.dp),
                            ) {
                                Icon(
                                    Icons.Rounded.Close,
                                    contentDescription = "Cancel",
                                    tint = if (hasWallpaper) Color.White else palette.textSecondary,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                    }

                    if (pendingAttachmentUris.isNotEmpty()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(androidx.compose.foundation.rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            pendingAttachmentUris.forEach { uri ->
                                val shortLabel = remember(uri) {
                                    uri.lastPathSegment?.substringAfterLast('/')?.take(22) ?: "Attachment"
                                }
                                Row(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(palette.bgTertiary)
                                        .border(1.dp, palette.border, RoundedCornerShape(10.dp))
                                        .padding(horizontal = 10.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Text(
                                        text = shortLabel,
                                        color = palette.textPrimary,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                    )
                                    val isSpoiler = spoilerAttachmentUris.contains(uri)
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(999.dp))
                                            .background(
                                                if (isSpoiler) palette.accent
                                                else palette.accentSoft,
                                            )
                                            .clickable {
                                                if (isSpoiler) spoilerAttachmentUris.remove(uri)
                                                else spoilerAttachmentUris.add(uri)
                                            }
                                            .padding(horizontal = 8.dp, vertical = 3.dp),
                                    ) {
                                        Text(
                                            text = "Spoiler",
                                            color = if (isSpoiler) palette.onAccent else palette.accent,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                    Icon(
                                        imageVector = Icons.Rounded.Close,
                                        contentDescription = "Remove file",
                                        tint = palette.textSecondary,
                                        modifier = Modifier
                                            .size(14.dp)
                                            .clickable { pendingAttachmentUris.remove(uri) },
                                    )
                                }
                            }
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(palette.accentSoft)
                                    .clickable { attachmentLauncher.launch("*/*") }
                                    .padding(horizontal = 10.dp, vertical = 6.dp),
                            ) {
                                Text(
                                    text = "+ Add more",
                                    color = palette.accent,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                }
            }

            /* ==================== @ Mention Autocomplete Menu (Groups AND 1:1 DMs!) ==================== */
            val mentionMatch = remember(draftText, isCommunity) {
                if (isCommunity) null
                else Regex("""(?:^|\s)@([A-Za-z0-9_.-]{0,24})$""").find(draftText)
            }
            val mentionCandidates = remember(mentionMatch?.value, activeGroup?.id, state.groupDetails?.members, activeFriend?.id) {
                val m = mentionMatch ?: return@remember emptyList<Triple<String, String, String?>>()
                val q = m.groupValues[1].lowercase()
                val raw = mutableListOf<Triple<String, String, String?>>()
                raw.add(Triple("everyone", "Notify everyone in this chat", null))
                if (activeGroup != null) {
                    state.groupDetails?.members.orEmpty()
                        .filter { it.id != me.id }
                        .forEach { member ->
                            raw.add(Triple(member.username, member.displayName.ifBlank { member.username }, member.avatarUrl))
                        }
                } else if (activeFriend != null) {
                    raw.add(
                        Triple(
                            activeFriend.username,
                            activeFriend.displayName.ifBlank { activeFriend.username },
                            activeFriend.avatarUrl,
                        )
                    )
                }
                raw.filter { (uname, dname, _) ->
                    q.isEmpty() || uname.lowercase().contains(q) || dname.lowercase().contains(q)
                }.take(6)
            }
            if (mentionCandidates.isNotEmpty() && mentionMatch != null) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (hasWallpaper) Color(0xEB12141E) else palette.surface)
                        .border(1.dp, palette.border)
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    mentionCandidates.forEach { (uname, subtitle, avatarUrl) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .clickable {
                                    val prefixLen = draftText.lastIndexOf('@')
                                    if (prefixLen >= 0) {
                                        val updated = draftText.substring(0, prefixLen) + "@$uname "
                                        draftText = updated
                                        if (editingTarget == null) {
                                            vm.updateChatDraft(activeThreadDraftKey, updated)
                                        }
                                    }
                                }
                                .padding(horizontal = 10.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            if (uname == "everyone") {
                                Box(
                                    modifier = Modifier
                                        .size(28.dp)
                                        .clip(CircleShape)
                                        .background(palette.accentSoft),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text("@", color = palette.accent, fontWeight = FontWeight.Black, fontSize = 14.sp)
                                }
                            } else {
                                JaAvatar(
                                    avatarUrl = avatarUrl,
                                    displayName = subtitle,
                                    avatarColor = "purple",
                                    size = 28.dp,
                                    ringWidth = 1.5.dp,
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text("@$uname", color = palette.textPrimary, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                                Text(subtitle, color = palette.textSecondary, fontSize = 11.5.sp, maxLines = 1)
                            }
                        }
                    }
                }
            }

            HorizontalDivider(color = if (hasWallpaper) Color(0x2EFFFFFF) else palette.border)

            /* ==================== Community Read-Only Footer OR Zero-Gap Native Composer ==================== */
            if (isCommunity && !state.communityPermissions.canPost) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(palette.bgSecondary)
                        .navigationBarsPadding()
                        .imePadding()
                        .padding(horizontal = 16.dp, vertical = 15.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "Only JaText community moderators can post here.",
                        color = palette.textSecondary,
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Center,
                    )
                }
            } else if (isRecordingVoice) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (hasWallpaper) Color(0xBA11131C) else palette.bgSecondary)
                        .navigationBarsPadding()
                        .imePadding()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(palette.danger)
                    )
                    Spacer(Modifier.width(10.dp))
                    val sec = (voiceElapsedMs / 1000L).toInt()
                    Text(
                        text = "Recording %d:%02d".format(sec / 60, sec % 60),
                        color = if (hasWallpaper) Color.White else palette.textPrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(
                        onClick = {
                            recorder.stopAndDiscard()
                            isRecordingVoice = false
                        }
                    ) {
                        Text("Cancel", color = palette.danger, fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(Modifier.width(6.dp))
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .jaBouncyClick(pressedScale = 0.90f) {
                                val file = recorder.stopRecording()
                                isRecordingVoice = false
                                if (file != null) {
                                    if (viewOnceMode && !isCommunity) {
                                        val stagedPhoto = pendingAttachmentUris.firstOrNull { u ->
                                            val mime = context.contentResolver.getType(u)?.lowercase().orEmpty()
                                            mime.startsWith("image/")
                                        }
                                        val cap = draftText
                                        draftText = ""
                                        vm.updateChatDraft(activeThreadDraftKey, "")
                                        pendingAttachmentUris.clear()
                                        viewOnceMode = false
                                        vm.sendViewOnceMessage(
                                            text = cap,
                                            photoUri = stagedPhoto,
                                            localVoiceFile = file,
                                            replyTo = replyingTo,
                                        )
                                    } else {
                                        vm.sendChatMessage(text = "", replyTo = replyingTo, localVoiceFile = file)
                                    }
                                    replyingTo = null
                                }
                            }
                            .clip(CircleShape)
                            .background(palette.accent),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.AutoMirrored.Rounded.Send,
                            contentDescription = "Send voice note",
                            tint = Color.White,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            } else {
                val composerBarBg = if (hasWallpaper) Color(0xB310121B) else palette.bgSecondary
                val composerPillBg = if (hasWallpaper) Color(0x78000000) else palette.bgTertiary
                val composerPillBorder = if (hasWallpaper) Color(0x36FFFFFF) else palette.border
                val composerTextCol = if (hasWallpaper) Color(0xFFF8FAFC) else palette.textPrimary
                val composerHintCol = if (hasWallpaper) Color(0xB8E2E8F0) else palette.textTertiary
                val plusRotation by animateFloatAsState(
                    targetValue = if (showComposerPlusMenu) 45f else 0f,
                    animationSpec = spring(
                        dampingRatio = 0.62f,
                        stiffness = 540f,
                    ),
                    label = "composerPlusRotation",
                )

                AnimatedVisibility(
                    visible = showComposerPlusMenu && editingTarget == null,
                    enter = expandVertically(
                        expandFrom = Alignment.Bottom,
                        animationSpec = spring(dampingRatio = 0.78f, stiffness = 540f),
                    ) + scaleIn(
                        initialScale = 0.86f,
                        transformOrigin = TransformOrigin(0.06f, 1f),
                        animationSpec = spring(dampingRatio = 0.76f, stiffness = 520f),
                    ) + fadeIn(animationSpec = tween(150)),
                    exit = shrinkVertically(
                        shrinkTowards = Alignment.Bottom,
                        animationSpec = tween(160),
                    ) + scaleOut(
                        targetScale = 0.90f,
                        transformOrigin = TransformOrigin(0.06f, 1f),
                        animationSpec = tween(150),
                    ) + fadeOut(animationSpec = tween(140)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(composerBarBg)
                            .padding(start = 10.dp, end = 10.dp, top = 6.dp, bottom = 2.dp),
                    ) {
                        Column(
                            modifier = Modifier
                                .widthIn(max = 285.dp)
                                .clip(RoundedCornerShape(20.dp))
                                .background(palette.surface)
                                .border(1.dp, palette.borderStrong, RoundedCornerShape(20.dp))
                                .padding(7.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            ComposerPlusMenuRow(
                                icon = Icons.Rounded.FileUpload,
                                iconTint = Color(0xFF60B4FF),
                                iconBg = Color(0x2B3897F0),
                                title = com.ahad00010.jatext.data.jt("plus.upload"),
                                subtitle = "Select one or multiple files of any type",
                                onClick = {
                                    showComposerPlusMenu = false
                                    attachmentLauncher.launch("*/*")
                                },
                            )
                            if (!isCommunity) {
                                ComposerPlusMenuRow(
                                    icon = Icons.Rounded.Visibility,
                                    iconTint = Color(0xFF34D399),
                                    iconBg = Color(0x2B10B981),
                                    title = com.ahad00010.jatext.data.jt("plus.viewOnce"),
                                    subtitle = if (viewOnceMode) "Active · Tap to turn off" else "Disappears forever after viewing",
                                    onClick = {
                                        showComposerPlusMenu = false
                                        focusManager.clearFocus(force = true)
                                        keyboardController?.hide()
                                        viewOnceMode = !viewOnceMode
                                    },
                                )
                            }
                            ComposerPlusMenuRow(
                                icon = Icons.Rounded.Schedule,
                                iconTint = palette.accent,
                                iconBg = palette.accent.copy(alpha = 0.18f),
                                title = com.ahad00010.jatext.data.jt("plus.schedule"),
                                subtitle = if (chatScheduledItems.isNotEmpty()) {
                                    "${chatScheduledItems.size} queued · View or add"
                                } else {
                                    "Choose a future send time"
                                },
                                badgeCount = chatScheduledItems.size,
                                onClick = {
                                    showComposerPlusMenu = false
                                    scheduleInitialTab = "compose"
                                    vm.refreshScheduledMessages()
                                    showScheduleSheet = true
                                },
                            )
                        }
                    }
                }

                val liveTypingBarLabel = when {
                    isCommunity && state.communityTypingUsers.isNotEmpty() ->
                        formatTypingUsersLabel(state.communityTypingUsers)
                    activeGroup != null -> {
                        val grpTypers = state.typingByGroup[activeGroup.id]?.takeIf { it.isNotEmpty() } ?: state.groupTypingUsers
                        if (grpTypers.isNotEmpty()) formatTypingUsersLabel(grpTypers) else null
                    }
                    activeFriend != null && (friendActivity?.typingToMe == true || state.dmTypingUserIds.contains(activeFriend.id)) ->
                        "${activeFriend.displayName.ifBlank { activeFriend.username }} is typing…"
                    else -> null
                }
                AnimatedVisibility(
                    visible = liveTypingBarLabel != null,
                    enter = fadeIn(tween(140)) + expandVertically(tween(160)),
                    exit = fadeOut(tween(120)) + shrinkVertically(tween(140)),
                ) {
                    LiveTypingIndicatorRow(
                        label = liveTypingBarLabel.orEmpty(),
                        containerColor = composerBarBg,
                    )
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(composerBarBg)
                        .navigationBarsPadding()
                        .imePadding()
                        .padding(horizontal = 10.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(modifier = Modifier.size(40.dp)) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .jaBouncyClick(pressedScale = 0.90f) {
                                    if (editingTarget == null) {
                                        showComposerPlusMenu = !showComposerPlusMenu
                                    }
                                }
                                .clip(RoundedCornerShape(14.dp))
                                .background(
                                    if (showComposerPlusMenu) {
                                        palette.accent.copy(alpha = 0.22f)
                                    } else {
                                        composerPillBg
                                    }
                                )
                                .border(
                                    width = 1.dp,
                                    color = if (showComposerPlusMenu) palette.accent else composerPillBorder,
                                    shape = RoundedCornerShape(14.dp),
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Add,
                                contentDescription = "More actions",
                                tint = if (showComposerPlusMenu) palette.accent else composerTextCol,
                                modifier = Modifier
                                    .size(20.dp)
                                    .graphicsLayer {
                                        rotationZ = plusRotation
                                    },
                            )
                        }
                        if (chatScheduledItems.isNotEmpty()) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .offset(x = 4.dp, y = (-4).dp)
                                    .height(17.dp)
                                    .widthIn(min = 17.dp)
                                    .clip(CircleShape)
                                    .background(palette.accent)
                                    .border(1.5.dp, palette.bgSecondary, CircleShape)
                                    .padding(horizontal = 4.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = if (chatScheduledItems.size > 9) "9+" else chatScheduledItems.size.toString(),
                                    color = Color.White,
                                    fontSize = 9.5.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontFamily = com.ahad00010.jatext.ui.theme.SfProRoundedFontFamily,
                                )
                            }
                        }
                    }
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .jaBouncyClick(pressedScale = 0.92f) {
                                showComposerPlusMenu = false
                                showStickerSheet = true
                            }
                            .clip(RoundedCornerShape(14.dp))
                            .background(composerPillBg)
                            .border(1.dp, composerPillBorder, RoundedCornerShape(14.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "GIF",
                            color = composerTextCol,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black,
                            fontFamily = com.ahad00010.jatext.ui.theme.SfProRoundedFontFamily,
                        )
                    }
                    if (isCommunity && state.communityPermissions.canCreatePolls) {
                        JaWebIconButton(
                            icon = Icons.Rounded.Poll,
                            contentDescription = "Create Poll",
                            size = 40.dp,
                            iconSize = 18.dp,
                            containerColor = composerPillBg,
                            borderColor = composerPillBorder,
                            iconTint = composerTextCol,
                            onClick = { showCreatePollModal = true },
                        )
                    }

                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 42.dp, max = 130.dp)
                            .clip(RoundedCornerShape(20.dp))
                            .background(composerPillBg)
                            .border(
                                width = 1.dp,
                                color = if (viewOnceMode) palette.accent else composerPillBorder,
                                shape = RoundedCornerShape(20.dp),
                            )
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        BasicTextField(
                            value = draftText,
                            onValueChange = {
                                if (showComposerPlusMenu) showComposerPlusMenu = false
                                draftText = it
                                if (editingTarget == null) {
                                    vm.updateChatDraft(activeThreadDraftKey, it)
                                }
                            },
                            cursorBrush = SolidColor(
                                if (hasWallpaper || palette.isDark) Color.White else Color(0xFF111318),
                            ),
                            textStyle = TextStyle(
                                color = composerTextCol,
                                fontSize = 15.sp,
                                fontFamily = com.ahad00010.jatext.ui.theme.SfProTextFontFamily,
                            ),
                            maxLines = 5,
                            modifier = Modifier.weight(1f),
                            decorationBox = { inner ->
                                if (draftText.isEmpty()) {
                                    Text(
                                        text = when {
                                            isCommunity -> "Post an announcement…"
                                            viewOnceMode -> "View once message…"
                                            else -> com.ahad00010.jatext.data.jt("chat.typeMessage")
                                        },
                                        color = composerHintCol,
                                        fontSize = 14.5.sp,
                                    )
                                }
                                inner()
                            }
                        )
                        AnimatedVisibility(
                            visible = viewOnceMode && !isCommunity,
                            enter = scaleIn(
                                initialScale = 0.65f,
                                animationSpec = spring(dampingRatio = 0.72f, stiffness = 520f),
                            ) + fadeIn(tween(150)),
                            exit = scaleOut(
                                targetScale = 0.65f,
                                animationSpec = tween(140),
                            ) + fadeOut(tween(140)),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Spacer(Modifier.width(8.dp))
                                ViewOnceCircleBadge(
                                    burned = false,
                                    tint = palette.accent,
                                    modifier = Modifier.clickable { viewOnceMode = false },
                                )
                            }
                        }
                    }

                    val editingHasAttachment = editingTarget?.attachmentUrl?.isNotBlank() == true ||
                        editingTarget?.encryptedAttachment != null ||
                        editingTarget?.stickerUrl?.isNotBlank() == true
                    val canSendText = draftText.isNotBlank() ||
                        pendingAttachmentUris.isNotEmpty() ||
                        (editingTarget != null && editingHasAttachment)
                    if (canSendText) {
                        Box(
                            modifier = Modifier
                                .size(42.dp)
                                .jaBouncyClick(pressedScale = 0.90f) {
                                    val textToSend = draftText
                                    draftText = ""
                                    vm.clearActiveTypingSignal()
                                    val editTarget = editingTarget
                                    if (editTarget != null) {
                                        editingTarget = null
                                        vm.editMessage(editTarget.id, textToSend)
                                    } else {
                                        vm.updateChatDraft(activeThreadDraftKey, "")
                                        val stagedList = pendingAttachmentUris.toList()
                                        val spoilerSnapshot = spoilerAttachmentUris.toSet()
                                        val rep = replyingTo
                                        pendingAttachmentUris.clear()
                                        spoilerAttachmentUris.clear()
                                        replyingTo = null
                                        if (viewOnceMode && !isCommunity) {
                                            viewOnceMode = false
                                            val photoUri = stagedList.firstOrNull { u ->
                                                val m = context.contentResolver.getType(u)?.lowercase().orEmpty()
                                                !m.startsWith("audio/")
                                            }
                                            val audioUri = stagedList.firstOrNull { u ->
                                                val m = context.contentResolver.getType(u)?.lowercase().orEmpty()
                                                m.startsWith("audio/")
                                            }
                                            vm.sendViewOnceMessage(
                                                text = textToSend,
                                                photoUri = photoUri,
                                                audioUri = audioUri,
                                                replyTo = rep,
                                            )
                                        } else if (stagedList.size > 1) {
                                            vm.sendBulkAttachments(
                                                uris = stagedList,
                                                caption = textToSend,
                                                replyTo = rep,
                                                spoilerUris = spoilerSnapshot,
                                            )
                                        } else {
                                            vm.sendChatMessage(
                                                text = textToSend,
                                                replyTo = rep,
                                                attachmentUri = stagedList.firstOrNull(),
                                                isSpoiler = stagedList.firstOrNull()?.let { it in spoilerSnapshot } == true,
                                            )
                                        }
                                    }
                                }
                                .clip(CircleShape)
                                .background(palette.accent),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.Send,
                                contentDescription = "Send",
                                tint = palette.onAccent,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    } else {
                        Box(
                            modifier = Modifier
                                .size(42.dp)
                                .jaBouncyClick(pressedScale = 0.90f) {
                                    val hasMic = ContextCompat.checkSelfPermission(
                                        context,
                                        Manifest.permission.RECORD_AUDIO
                                    ) == PackageManager.PERMISSION_GRANTED
                                    if (hasMic) {
                                        recorder.startRecording()
                                        isRecordingVoice = true
                                    } else {
                                        micPermLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                    }
                                }
                                .clip(CircleShape)
                                .background(composerPillBg)
                                .border(1.dp, composerPillBorder, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Mic,
                                contentDescription = "Record Voice Note",
                                tint = composerTextCol,
                                modifier = Modifier.size(21.dp),
                            )
                        }
                    }
                }
            }
        }
    }

    if (showGroupExclusiveStories && groupExclusiveStacks.isNotEmpty()) {
        FullScreenStoryViewerOverlay(
            stacks = groupExclusiveStacks,
            initialStackIndex = 0,
            meId = me.id,
            vm = vm,
            onClose = {
                showGroupExclusiveStories = false
                vm.refreshUpdatesBundle(silent = true)
            },
        )
    }

    /* ==================== Message Hold Context Sheet (Nav-Bar-Safe + Multi-Reaction + More Emojis) ==================== */
    contextMenuMessage?.let { msg ->
        val isMine = msg.senderId == me.id
        val withinUnsendWindow = (System.currentTimeMillis() - msg.createdAt) <= UNSEND_WINDOW_MS
        val canModerateCommunity = isCommunity && state.communityPermissions.canModerate
        val topUsedQuick = remember(state.emojiUsageCounts) {
            val ranked = state.emojiUsageCounts.entries
                .sortedByDescending { it.value }
                .map { it.key }
            val defaults = listOf("❤️", "😂", "🔥", "👍", "😮", "😢", "🎉")
            (ranked + defaults).distinct().take(7)
        }

        ModalBottomSheet(
            onDismissRequest = { contextMenuMessage = null },
            containerColor = palette.surface,
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 10.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(palette.bgSecondary)
                        .border(1.dp, palette.border, RoundedCornerShape(18.dp))
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    topUsedQuick.forEach { emoji ->
                        val active = msg.reactions.any { it.userId == me.id && it.emoji == emoji }
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .jaBouncyClick(pressedScale = 0.86f) {
                                    vm.toggleReaction(msg.id, emoji)
                                }
                                .clip(CircleShape)
                                .background(if (active) palette.accentSoft else Color.Transparent),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = emoji,
                                fontSize = 20.sp,
                                fontFamily = com.ahad00010.jatext.ui.theme.IosEmojiOnlyFontFamily,
                            )
                        }
                    }
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .jaBouncyClick(pressedScale = 0.88f) {
                                val targetId = msg.id
                                contextMenuMessage = null
                                emojiPickerTargetMessageId = targetId
                            }
                            .clip(CircleShape)
                            .background(palette.bgTertiary)
                            .border(1.dp, palette.border, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        WebUiSvgIcon(
                            kind = WebUiIconKind.SmilePlus,
                            tint = palette.textPrimary,
                            size = 18.dp,
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                val isVoiceNoteMsg = isMessageAudioVoiceNote(
                    attachmentUrl = msg.attachmentUrl,
                    attachmentName = msg.attachmentName,
                    attachmentType = msg.attachmentType,
                    encryptedAttachment = msg.encryptedAttachment,
                )
                val isImageOrStickerMsg = !msg.stickerUrl.isNullOrBlank() || isMessageImageAttachment(
                    attachmentUrl = msg.attachmentUrl,
                    attachmentName = msg.attachmentName,
                    attachmentType = msg.attachmentType,
                    encryptedAttachment = msg.encryptedAttachment,
                )

                if (isVoiceNoteMsg) {
                    val alreadyShown = shownTranscriptIds[msg.id] == true
                    MessageSheetAction(
                        icon = WebUiIconKind.Transcript,
                        label = if (alreadyShown) "Hide transcribe" else "Transcribe",
                        tint = palette.accent,
                    ) {
                        shownTranscriptIds[msg.id] = !alreadyShown
                        contextMenuMessage = null
                    }
                }

                if (isImageOrStickerMsg) {
                    val mediaRawUrl = msg.stickerUrl ?: msg.attachmentUrl.orEmpty()
                    val encDesc = if (msg.stickerUrl.isNullOrBlank()) msg.encryptedAttachment else null
                    MessageSheetAction(WebUiIconKind.Copy, "Copy image") {
                        contextMenuMessage = null
                        scope.launch {
                            val ok = copyImageMessageToClipboard(context, mediaRawUrl, encDesc)
                            vm.showToast(if (ok) "Image copied to clipboard" else "Could not copy image")
                        }
                    }
                    MessageSheetAction(WebUiIconKind.Link, "Copy image address") {
                        val absUrl = TursoApiClient.resolveAbsoluteMediaUrl(mediaRawUrl)
                        val cb = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                        cb?.setPrimaryClip(ClipData.newPlainText("JaText image URL", absUrl))
                        vm.showToast("Image address copied")
                        contextMenuMessage = null
                    }
                    MessageSheetAction(WebUiIconKind.Star, "Save to Favourites", tint = palette.accent) {
                        contextMenuMessage = null
                        vm.saveImageMediaToFavorites(
                            rawUrl = mediaRawUrl,
                            encryptedAttachment = encDesc,
                            fallbackName = msg.attachmentName ?: "Saved media",
                        )
                    }
                }

                val isViewOnceMsg = ViewOnceCodec.isViewOnceBody(msg.body)
                if (!isCommunity || state.communityPermissions.canPost) {
                    MessageSheetAction(WebUiIconKind.Reply, "Reply") {
                        replyingTo = ReplySummary(
                            id = msg.id,
                            senderId = msg.senderId,
                            senderName = msg.senderName,
                            body = ViewOnceCodec.sanitizePreview(msg.body).ifBlank { "Attachment" },
                        )
                        contextMenuMessage = null
                    }
                }
                if (!isViewOnceMsg) {
                    MessageSheetAction(WebUiIconKind.Forward, "Forward") {
                        forwardingItem = msg
                        contextMenuMessage = null
                    }
                }
                if (activeThreadDraftKey.isNotEmpty() && !isViewOnceMsg) {
                    val alreadyPinned = state.pinnedMessagesByThread[activeThreadDraftKey]
                        .orEmpty()
                        .any { it.id == msg.id }
                    MessageSheetAction(
                        icon = WebUiIconKind.Star,
                        label = if (alreadyPinned) com.ahad00010.jatext.data.jt("chat.unpinMessage") else com.ahad00010.jatext.data.jt("chat.pinMessage"),
                        tint = palette.accent,
                    ) {
                        vm.togglePinMessageInThread(
                            threadKey = activeThreadDraftKey,
                            messageId = msg.id,
                            senderName = msg.senderName.ifBlank { if (isMine) "You" else "Message" },
                            preview = ViewOnceCodec.sanitizePreview(msg.body).ifBlank { msg.attachmentName ?: "Attachment" },
                        )
                        contextMenuMessage = null
                    }
                }
                if (msg.body.isNotBlank() && !isViewOnceMsg) {
                    MessageSheetAction(WebUiIconKind.Copy, "Copy text") {
                        val cb = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                        cb?.setPrimaryClip(ClipData.newPlainText("JaText message", msg.body))
                        vm.showToast("Copied to clipboard")
                        contextMenuMessage = null
                    }
                }
                if (isMine && msg.body.isNotBlank() && !isViewOnceMsg) {
                    MessageSheetAction(WebUiIconKind.Edit, "Edit message") {
                        editingTarget = msg
                        draftText = msg.body
                        contextMenuMessage = null
                    }
                }
                if (isCommunity && (state.communityPermissions.isOwner || state.communityPermissions.canModerate)) {
                    MessageSheetAction(WebUiIconKind.Trash, "Delete announcement", tint = palette.danger) {
                        val targetId = msg.id
                        contextMenuMessage = null
                        scope.launch {
                            delay(90L)
                            if (thanosSnapHost != null) {
                                thanosSnapHost.snapMessageThen(targetId) {
                                    vm.deleteCommunityAnnouncement(targetId)
                                }
                            } else {
                                vm.deleteCommunityAnnouncement(targetId)
                            }
                        }
                    }
                } else if ((isMine && withinUnsendWindow) || canModerateCommunity) {
                    MessageSheetAction(WebUiIconKind.Undo, "Unsend for everyone", tint = palette.danger) {
                        val targetId = msg.id
                        contextMenuMessage = null
                        scope.launch {
                            delay(90L)
                            if (thanosSnapHost != null) {
                                thanosSnapHost.snapMessageThen(targetId) {
                                    vm.unsendMessage(targetId)
                                }
                            } else {
                                vm.unsendMessage(targetId)
                            }
                        }
                    }
                }
                MessageSheetAction(WebUiIconKind.Trash, "Delete for me", tint = palette.danger) {
                    vm.deleteMessageForMe(msg.id)
                    contextMenuMessage = null
                }
                Spacer(Modifier.height(12.dp))
            }
        }
    }

    /* ==================== Full Emoji Reaction Picker Sheet (`Most used` + `All emojis` Tabs) ==================== */
    emojiPickerTargetMessageId?.let { targetMsgId ->
        var emojiTab by remember { mutableStateOf(if (state.emojiUsageCounts.isNotEmpty()) "most_used" else "all") }
        val mostUsedList = remember(state.emojiUsageCounts) {
            val ranked = state.emojiUsageCounts.entries
                .sortedByDescending { it.value }
                .map { it.key }
            (ranked + ALL_REACTION_EMOJIS.take(16)).distinct()
        }

        ModalBottomSheet(
            onDismissRequest = { emojiPickerTargetMessageId = null },
            containerColor = palette.surface,
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "React with emoji",
                    color = palette.textPrimary,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                JaWebTabs(
                    tabs = listOf(
                        JaTabItem("most_used", "Most used", icon = Icons.Rounded.History),
                        JaTabItem("all", "All emojis", icon = Icons.Rounded.EmojiEmotions),
                    ),
                    selectedId = emojiTab,
                    onSelect = { emojiTab = it },
                )
                val emojisToShow = if (emojiTab == "most_used") mostUsedList else ALL_REACTION_EMOJIS
                LazyVerticalGrid(
                    columns = GridCells.Fixed(7),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.height(270.dp),
                ) {
                    items(emojisToShow, key = { it }) { emoji ->
                        Box(
                            modifier = Modifier
                                .aspectRatio(1f)
                                .jaBouncyClick(pressedScale = 0.86f) {
                                    vm.toggleReaction(targetMsgId, emoji)
                                    emojiPickerTargetMessageId = null
                                }
                                .clip(RoundedCornerShape(12.dp))
                                .background(palette.bgSecondary)
                                .border(1.dp, palette.border, RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = emoji,
                                fontSize = 22.sp,
                                fontFamily = com.ahad00010.jatext.ui.theme.IosEmojiOnlyFontFamily,
                            )
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
            }
        }
    }

    /* ==================== Forward Target Picker Modal ==================== */
    forwardingItem?.let { item ->
        ModalBottomSheet(
            onDismissRequest = { forwardingItem = null },
            containerColor = palette.surface,
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        ) {
            val sourceContext = remember(item) {
                ForwardedMessageContext(
                    v = 1,
                    sourceKind = when {
                        isCommunity -> "community"
                        activeGroup != null -> "group"
                        else -> "dm"
                    },
                    sourceLabel = when {
                        isCommunity -> "JaText Community"
                        activeGroup != null -> activeGroup.name
                        else -> "Direct Message"
                    },
                    originalMessageId = item.id,
                    originalSenderId = item.senderId,
                    originalSenderName = item.senderName,
                    originalSenderUsername = item.senderUsername,
                    originalCreatedAt = item.createdAt,
                    groupId = activeGroup?.id,
                    dmUserIds = if (activeFriend != null) listOf(me.id, activeFriend.id) else null,
                )
            }
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp, vertical = 10.dp)
            ) {
                Text("Forward message to…", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Spacer(Modifier.height(10.dp))
                LazyColumn(modifier = Modifier.heightIn(max = 360.dp)) {
                    if (state.communityPermissions.canPost) {
                        item {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .clickable {
                                        vm.forwardMessageWithContext(
                                            item.body,
                                            sourceContext,
                                            attachmentUrl = item.attachmentUrl,
                                            attachmentName = item.attachmentName,
                                            attachmentType = item.attachmentType,
                                            targetCommunity = true,
                                        )
                                        forwardingItem = null
                                    }
                                    .padding(vertical = 10.dp, horizontal = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Image(
                                    painter = painterResource(id = R.drawable.jatext_logo_icon),
                                    contentDescription = null,
                                    modifier = Modifier
                                        .size(38.dp)
                                        .clip(CircleShape),
                                )
                                Spacer(Modifier.width(12.dp))
                                Text("JaText Community", color = palette.textPrimary, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                    items(state.groups, key = { "fwd-grp:${it.id}" }) { grp ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .clickable {
                                    vm.forwardMessageWithContext(
                                        item.body,
                                        sourceContext,
                                        attachmentUrl = item.attachmentUrl,
                                        attachmentName = item.attachmentName,
                                        attachmentType = item.attachmentType,
                                        targetGroupId = grp.id,
                                    )
                                    forwardingItem = null
                                }
                                .padding(vertical = 10.dp, horizontal = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            JaGroupAvatar(avatarUrl = grp.avatarUrl, name = grp.name, size = 38.dp)
                            Spacer(Modifier.width(12.dp))
                            Text(grp.name, color = palette.textPrimary, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    items(state.friends, key = { "fwd-fr:${it.id}" }) { fr ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .clickable {
                                    vm.forwardMessageWithContext(
                                        item.body,
                                        sourceContext,
                                        attachmentUrl = item.attachmentUrl,
                                        attachmentName = item.attachmentName,
                                        attachmentType = item.attachmentType,
                                        targetFriendId = fr.id,
                                    )
                                    forwardingItem = null
                                }
                                .padding(vertical = 10.dp, horizontal = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            JaAvatar(fr.avatarUrl, fr.displayName.ifBlank { fr.username }, fr.avatarColor, size = 38.dp)
                            Spacer(Modifier.width(12.dp))
                            Text(fr.displayName.ifBlank { fr.username }, color = palette.textPrimary, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }

    confirmUnfriendTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { confirmUnfriendTarget = null },
            containerColor = palette.bgSecondary,
            title = {
                Text(
                    text = "Unfriend ${target.displayName.ifBlank { target.username }}?",
                    color = palette.textPrimary,
                    fontWeight = FontWeight.Bold,
                )
            },
            text = {
                Text(
                    text = "You will need to send a new friend request to chat again.",
                    color = palette.textSecondary,
                    fontSize = 14.sp,
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        vm.removeFriend(target.id)
                        confirmUnfriendTarget = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.danger),
                ) {
                    Text("Unfriend", color = Color.White, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmUnfriendTarget = null }) {
                    Text("Cancel", color = palette.textSecondary)
                }
            },
        )
    }

    confirmDeleteGroupTarget?.let { grp ->
        var typedName by remember(grp.id) { mutableStateOf("") }
        val exactMatch = typedName.trim() == grp.name.trim()
        val delWordLower = if (grp.isCommunity) "community" else "group"
        AlertDialog(
            onDismissRequest = { confirmDeleteGroupTarget = null },
            containerColor = palette.bgSecondary,
            title = {
                Text(
                    text = "Delete $delWordLower permanently?",
                    color = palette.textPrimary,
                    fontWeight = FontWeight.Bold,
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "This permanently deletes \"${grp.name}\" and all messages for every member. Type the exact $delWordLower name below to confirm:",
                        color = palette.textSecondary,
                        fontSize = 13.5.sp,
                    )
                    OutlinedTextField(
                        value = typedName,
                        onValueChange = { typedName = it },
                        placeholder = { Text(grp.name, color = palette.textTertiary) },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            cursorColor = if (palette.isDark) Color.White else Color.Black,
                            focusedTextColor = palette.textPrimary,
                            unfocusedTextColor = palette.textPrimary,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        vm.deleteGroupPermanentlyAsOwner(grp.id)
                        confirmDeleteGroupTarget = null
                    },
                    enabled = exactMatch,
                    colors = ButtonDefaults.buttonColors(containerColor = palette.danger),
                ) {
                    Text("Delete $delWordLower", color = Color.White, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDeleteGroupTarget = null }) {
                    Text("Cancel", color = palette.textSecondary)
                }
            },
        )
    }

    /* ==================== 1:1 Sticker & Klipy GIF Sheet (`Klipy` | `Favourites` | `Top used` | `Upload`) ==================== */
    if (showStickerSheet) {
        var stickerTab by remember { mutableStateOf("klipy") } // "klipy" | "favorites" | "recent"
        var klipyQuery by remember { mutableStateOf("") }
        var klipyResults by remember { mutableStateOf<List<StickerMedia>>(emptyList()) }
        val favoriteKeys = remember(state.stickerFavorites) {
            state.stickerFavorites.map { it.key.ifBlank { it.url } }.toSet()
        }
        val customStickerPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri != null) vm.uploadCustomSticker(uri, "Custom Sticker")
        }

        LaunchedEffect(klipyQuery, stickerTab) {
            if (stickerTab == "klipy") {
                delay(240L)
                klipyResults = vm.searchKlipyStickers(klipyQuery)
            }
        }

        ModalBottomSheet(
            onDismissRequest = { showStickerSheet = false },
            containerColor = palette.surface,
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Stickers & GIFs",
                        color = palette.textPrimary,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Row(
                        modifier = Modifier
                            .jaBouncyClick(pressedScale = 0.94f) { customStickerPicker.launch("image/*") }
                            .clip(RoundedCornerShape(12.dp))
                            .background(palette.accent)
                            .padding(horizontal = 12.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.FileUpload,
                            contentDescription = null,
                            tint = palette.accentDark,
                            modifier = Modifier.size(15.dp),
                        )
                        Spacer(Modifier.width(5.dp))
                        Text(
                            text = "Upload",
                            color = palette.accentDark,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                }

                JaWebTabs(
                    tabs = listOf(
                        JaTabItem("klipy", "Klipy GIFs"),
                        JaTabItem("favorites", "Favourites", badgeCount = state.stickerFavorites.size),
                        JaTabItem("recent", "Top used"),
                    ),
                    selectedId = stickerTab,
                    onSelect = { stickerTab = it },
                )

                if (stickerTab == "klipy") {
                    JaWebInput(
                        value = klipyQuery,
                        onValueChange = { klipyQuery = it },
                        placeholder = "Search Klipy stickers & GIFs…",
                        leadingIcon = Icons.Rounded.Search,
                    )
                }

                val shownStickers = when (stickerTab) {
                    "favorites" -> state.stickerFavorites
                    "recent" -> state.recentStickers.sortedByDescending { it.useCount }
                    else -> klipyResults
                }

                if (shownStickers.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(220.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = when (stickerTab) {
                                "favorites" -> "No favourite stickers yet. Tap the star on any GIF or sticker to save it here!"
                                "recent" -> "Your most used stickers & GIFs will appear here."
                                else -> "Loading stickers & GIFs…"
                            },
                            color = palette.textSecondary,
                            fontSize = 13.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 24.dp),
                        )
                    }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(3),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.height(310.dp),
                    ) {
                        items(shownStickers, key = { "${stickerTab}:${it.key}:${it.url}" }) { stk ->
                            val isFav = stk.isFavorite || favoriteKeys.contains(stk.key.ifBlank { stk.url })
                            Box(
                                modifier = Modifier
                                    .aspectRatio(1f)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(palette.bgSecondary)
                                    .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                    .clickable {
                                        vm.sendSticker(stk)
                                        showStickerSheet = false
                                    }
                            ) {
                                AsyncImage(
                                    model = TursoApiClient.resolveAbsoluteMediaUrl(stk.previewUrl ?: stk.url),
                                    contentDescription = stk.name,
                                    contentScale = ContentScale.Fit,
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(6.dp),
                                )
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .padding(4.dp)
                                        .size(26.dp)
                                        .jaBouncyClick(pressedScale = 0.85f) {
                                            vm.toggleStickerFavorite(stk)
                                        }
                                        .clip(CircleShape)
                                        .background(Color(0x990C0D14)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        imageVector = if (isFav) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                                        contentDescription = if (isFav) "Remove favourite" else "Add favourite",
                                        tint = if (isFav) Color(0xFFFBBF24) else Color.White,
                                        modifier = Modifier.size(15.dp),
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(6.dp))
            }
        }
    }

     /* ==================== 1:1 Web Bubble Style Modal (`BubbleStyleModal.tsx` - All 24 Mascot Artworks!) ==================== */
    if (showBubbleStyleModal) {
        var draftStyleId by remember(state.outgoingBubbleStyle) { mutableStateOf(state.outgoingBubbleStyle) }
        Dialog(
            onDismissRequest = { showBubbleStyleModal = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth(0.94f)
                    .widthIn(max = 500.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(palette.bgSecondary)
                    .border(1.dp, palette.border, RoundedCornerShape(24.dp))
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Bubble chat style",
                            color = palette.textPrimary,
                            fontSize = 19.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        Text(
                            text = "Pick a mascot or illustrated style for your outgoing messages.",
                            color = palette.textSecondary,
                            fontSize = 12.5.sp,
                        )
                    }
                    JaWebIconButton(
                        icon = Icons.Rounded.Close,
                        contentDescription = "Close",
                        size = 34.dp,
                        iconSize = 16.dp,
                        onClick = { showBubbleStyleModal = false },
                    )
                }

                // Live Preview Bubble Box
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(palette.bgPrimary)
                        .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    contentAlignment = Alignment.CenterEnd,
                ) {
                    StyledMessageBubbleContainer(
                        styleId = draftStyleId,
                        isMine = true,
                        palette = palette,
                    ) { ink ->
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "Hey! Check out my bubble style.",
                                color = ink.textColor,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                            )
                            Text(
                                text = "10:42 PM · Read",
                                color = ink.subTextColor,
                                fontSize = 10.sp,
                            )
                        }
                    }
                }

                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(330.dp),
                ) {
                    items(ALL_BUBBLE_STYLE_SPECS, key = { it.id }) { spec ->
                        val active = draftStyleId == spec.id
                        Column(
                            modifier = Modifier
                                .jaBouncyClick(pressedScale = 0.95f) { draftStyleId = spec.id }
                                .clip(RoundedCornerShape(14.dp))
                                .background(if (active) palette.accentSoft else palette.bgTertiary)
                                .border(
                                    width = if (active) 2.dp else 1.dp,
                                    color = if (active) palette.accent else palette.border,
                                    shape = RoundedCornerShape(14.dp),
                                )
                                .padding(7.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Box(modifier = Modifier.fillMaxWidth()) {
                                BubblePreviewThumbUi(
                                    styleId = spec.id,
                                    palette = palette,
                                )
                                if (spec.limited) {
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.TopEnd)
                                            .padding(4.dp)
                                            .clip(RoundedCornerShape(999.dp))
                                            .background(Color(0xFFDC2626))
                                            .padding(horizontal = 6.dp, vertical = 1.5.dp)
                                    ) {
                                        Text(
                                            text = "Limited",
                                            color = Color.White,
                                            fontSize = 8.5.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                        )
                                    }
                                }
                            }
                            Spacer(Modifier.height(5.dp))
                            Text(
                                text = spec.label,
                                color = palette.textPrimary,
                                fontSize = 11.5.sp,
                                fontWeight = if (active) FontWeight.ExtraBold else FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    JaWebGhostButton(
                        text = "Cancel",
                        onClick = { showBubbleStyleModal = false },
                    )
                    Spacer(Modifier.width(8.dp))
                    JaWebPrimaryButton(
                        text = "Save style",
                        onClick = {
                            vm.setOutgoingBubbleStyle(draftStyleId)
                            showBubbleStyleModal = false
                        },
                    )
                }
            }
        }
    }

     /* ==================== 1:1 Web Chat Wallpaper Modal (`WallpaperModal.tsx` - Real Presets + Photo Upload!) ==================== */
    if (showWallpaperModal && !isCommunity) {
        val customWpLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri != null) {
                vm.setWallpaperForCurrentScope(kind = "custom", url = null, customImageUri = uri)
                showWallpaperModal = false
            }
        }
        Dialog(
            onDismissRequest = { showWallpaperModal = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth(0.94f)
                    .widthIn(max = 500.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(palette.bgSecondary)
                    .border(1.dp, palette.border, RoundedCornerShape(24.dp))
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Chat wallpaper",
                            color = palette.textPrimary,
                            fontSize = 19.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        Text(
                            text = "Shared with everyone in this conversation and tints the contact card.",
                            color = palette.textSecondary,
                            fontSize = 12.5.sp,
                        )
                    }
                    JaWebIconButton(
                        icon = Icons.Rounded.Close,
                        contentDescription = "Close",
                        size = 34.dp,
                        iconSize = 16.dp,
                        onClick = { showWallpaperModal = false },
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    JaWebPrimaryButton(
                        text = "Upload photo",
                        leadingIcon = Icons.Rounded.Image,
                        modifier = Modifier.weight(1f),
                        onClick = { customWpLauncher.launch("image/*") },
                    )
                    if (hasWallpaper) {
                        JaWebGhostButton(
                            text = "Reset",
                            onClick = {
                                vm.setWallpaperForCurrentScope("none", null)
                                showWallpaperModal = false
                            },
                        )
                    }
                }

                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(310.dp),
                ) {
                    items(WEB_WALLPAPER_PRESETS, key = { it.id }) { wp ->
                        val isCurrent = resolvedWallpaperUrl == wp.url || activeWallpaperUrl == "preset:${wp.id}"
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(108.dp)
                                .jaBouncyClick(pressedScale = 0.96f) {
                                    vm.setWallpaperForCurrentScope("preset", wp.url, presetId = wp.id)
                                    showWallpaperModal = false
                                }
                                .clip(RoundedCornerShape(16.dp))
                                .border(
                                    width = if (isCurrent) 2.5.dp else 1.dp,
                                    color = if (isCurrent) palette.accent else palette.border,
                                    shape = RoundedCornerShape(16.dp),
                                )
                        ) {
                            AsyncImage(
                                model = wp.url,
                                contentDescription = wp.label,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(
                                        Brush.verticalGradient(
                                            colors = listOf(Color.Transparent, Color(0xB8090A10))
                                        )
                                    )
                            )
                            Row(
                                modifier = Modifier
                                    .align(Alignment.BottomStart)
                                    .fillMaxWidth()
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = wp.label,
                                    color = Color.White,
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f),
                                )
                                if (isCurrent) {
                                    Box(
                                        modifier = Modifier
                                            .size(20.dp)
                                            .clip(CircleShape)
                                            .background(palette.accent),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.Check,
                                            contentDescription = "Active",
                                            tint = palette.accentDark,
                                            modifier = Modifier.size(13.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /* ==================== Community Create Poll Modal ==================== */
    if (showCreatePollModal) {
        var question by remember { mutableStateOf("") }
        val options = remember { mutableStateListOf("", "") }
        AlertDialog(
            onDismissRequest = { showCreatePollModal = false },
            containerColor = palette.surface,
            shape = RoundedCornerShape(24.dp),
            title = { Text("Create Community Poll", color = palette.textPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    OutlinedTextField(
                        value = question,
                        onValueChange = { question = it },
                        label = { Text("Poll Question") },
                        shape = RoundedCornerShape(14.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            cursorColor = if (palette.isDark) Color.White else Color.Black,
                            focusedTextColor = palette.textPrimary,
                            unfocusedTextColor = palette.textPrimary,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    options.forEachIndexed { idx, value ->
                        OutlinedTextField(
                            value = value,
                            onValueChange = { options[idx] = it },
                            label = { Text("Option ${idx + 1}") },
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                cursorColor = if (palette.isDark) Color.White else Color.Black,
                                focusedTextColor = palette.textPrimary,
                                focusedBorderColor = palette.accent,
                                unfocusedTextColor = palette.textPrimary,
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 3.dp),
                        )
                    }
                    if (options.size < 6) {
                        TextButton(onClick = { options.add("") }) {
                            Text("+ Add option", color = palette.accent)
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        vm.createCommunityPoll(question, options.toList())
                        showCreatePollModal = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                ) {
                    Text("Post Poll", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreatePollModal = false }) {
                    Text("Cancel", color = palette.textSecondary)
                }
            }
        )
    }

    /* ==================== Community Poll Voters Modal ==================== */
    pollVotersTarget?.let { poll ->
        var voters by remember(poll.id) { mutableStateOf<List<PollVoter>>(emptyList()) }
        var loadingVoters by remember(poll.id) { mutableStateOf(true) }
        LaunchedEffect(poll.id) {
            loadingVoters = true
            voters = vm.fetchPollVoters(poll.id)
            loadingVoters = false
        }
        Dialog(onDismissRequest = { pollVotersTarget = null }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(22.dp))
                    .background(palette.bgSecondary)
                    .border(1.dp, palette.border, RoundedCornerShape(22.dp))
                    .padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Poll Votes (${poll.totalVotes})", color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
                    JaWebIconButton(
                        icon = Icons.Rounded.Close,
                        contentDescription = "Close",
                        size = 32.dp,
                        iconSize = 16.dp,
                        onClick = { pollVotersTarget = null },
                    )
                }
                if (loadingVoters) {
                    Text("Loading voters…", color = palette.textSecondary, fontSize = 13.sp)
                } else if (voters.isEmpty()) {
                    Text("No votes recorded yet.", color = palette.textSecondary, fontSize = 13.sp)
                } else {
                    LazyColumn(modifier = Modifier.heightIn(max = 300.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(voters, key = { "${it.userId}:${it.optionIndex}" }) { v ->
                            val optLabel = poll.options.getOrElse(v.optionIndex) { "Option ${v.optionIndex + 1}" }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(palette.bgTertiary)
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                JaAvatar(v.avatarUrl, v.displayName.ifBlank { v.username }, v.avatarColor, size = 32.dp)
                                Spacer(Modifier.width(10.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(v.displayName.ifBlank { v.username }, color = palette.textPrimary, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                                    Text("@${v.username}", color = palette.textSecondary, fontSize = 11.5.sp)
                                }
                                Text(optLabel, color = palette.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }

    /* ==================== Community Elect Moderators Modal (Owner Only) ==================== */
    if (isCommunity && showModeratorsModal && state.communityPermissions.isOwner) {
        val directory: List<CommunityUser> = state.communityDirectory
        var search by remember { mutableStateOf("") }
        val selectedModIds = remember(state.communityPermissions.moderatorIds) {
            mutableStateListOf<String>().apply {
                addAll(state.communityPermissions.moderatorIds)
            }
        }
        Dialog(onDismissRequest = { showModeratorsModal = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(24.dp))
                    .background(palette.bgSecondary)
                    .border(1.dp, palette.border, RoundedCornerShape(24.dp))
                    .padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("Elect Moderators", color = palette.textPrimary, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                Text(
                    "Selected people can post announcements and polls in JaText Community.",
                    color = palette.textSecondary,
                    fontSize = 12.5.sp,
                )
                JaWebInput(value = search, onValueChange = { search = it }, placeholder = "Search accounts…", leadingIcon = Icons.Rounded.Search)
                val filtered = directory.filter {
                    search.isBlank() || it.displayName.contains(search, true) || it.username.contains(search, true)
                }
                LazyColumn(modifier = Modifier.heightIn(max = 280.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(filtered, key = { it.id }) { entry ->
                        val isEntryOwner = entry.id == me.id && state.communityPermissions.isOwner
                        val checked = selectedModIds.contains(entry.id)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(palette.bgTertiary)
                                .clickable(enabled = !isEntryOwner) {
                                    if (checked) selectedModIds.remove(entry.id) else selectedModIds.add(entry.id)
                                }
                                .padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            JaAvatar(entry.avatarUrl, entry.displayName.ifBlank { entry.username }, entry.avatarColor, size = 34.dp)
                            Spacer(Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(entry.displayName.ifBlank { entry.username }, color = palette.textPrimary, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                                Text("@${entry.username}", color = palette.textSecondary, fontSize = 11.5.sp)
                            }
                            if (isEntryOwner) {
                                JaOfficialBadge("Owner")
                            } else {
                                Checkbox(
                                    checked = checked,
                                    onCheckedChange = {
                                        if (it) selectedModIds.add(entry.id) else selectedModIds.remove(entry.id)
                                    },
                                    colors = CheckboxDefaults.colors(checkedColor = palette.accent),
                                )
                            }
                        }
                    }
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    JaWebGhostButton(text = "Cancel", onClick = { showModeratorsModal = false })
                    Spacer(Modifier.width(8.dp))
                    JaWebPrimaryButton(
                        text = "Save",
                        onClick = {
                            vm.setCommunityModerators(selectedModIds.toList())
                            showModeratorsModal = false
                        },
                    )
                }
            }
        }
    }

    /* ==================== Scheduled Message Composer & List Sheet (v3.8.7) ==================== */
    if (showScheduleSheet && activeSchedTargetId.isNotBlank()) {
        ScheduleMessageBottomSheet(
            vm = vm,
            state = state,
            targetKind = activeSchedTargetKind,
            targetId = activeSchedTargetId,
            targetLabel = activeSchedTargetLabel,
            initialTab = scheduleInitialTab,
            initialDraft = draftText,
            replyToId = replyingTo?.id,
            chatScheduledItems = chatScheduledItems,
            onConsumeComposerDraft = {
                draftText = ""
                replyingTo = null
            },
            onDismiss = { showScheduleSheet = false },
        )
    }

    /* ==================== Fullscreen Image Lightbox ==================== */
    fullscreenImageModel?.let { model ->
        ZoomableFullscreenImageDialog(
            model = model,
            onDismiss = { fullscreenImageModel = null },
        )
    }
}

@Composable
private fun ComposerPlusMenuRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconTint: Color,
    iconBg: Color,
    title: String,
    subtitle: String,
    badgeCount: Int = 0,
    onClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .jaBouncyClick(pressedScale = 0.96f, onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(iconBg)
                .border(1.dp, iconTint.copy(alpha = 0.32f), RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(19.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = palette.textPrimary,
                fontSize = 13.8.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = subtitle,
                color = palette.textSecondary,
                fontSize = 11.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (badgeCount > 0) {
            Box(
                modifier = Modifier
                    .height(22.dp)
                    .widthIn(min = 22.dp)
                    .clip(CircleShape)
                    .background(palette.accent.copy(alpha = 0.22f))
                    .padding(horizontal = 7.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = badgeCount.toString(),
                    color = palette.textPrimary,
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
        }
    }
}

private fun defaultFutureScheduledAt(nowMs: Long = System.currentTimeMillis()): Long {
    val base = nowMs + 30L * 60_000L
    val fiveMin = 5L * 60_000L
    return ((base + fiveMin - 1L) / fiveMin) * fiveMin
}

private fun formatAndroidScheduledWhen(ts: Long, nowMs: Long = System.currentTimeMillis()): String {
    val targetCal = Calendar.getInstance().apply { timeInMillis = ts }
    val nowCal = Calendar.getInstance().apply { timeInMillis = nowMs }
    val tomorrowCal = (nowCal.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, 1) }

    val timeFmt = SimpleDateFormat("h:mm a", Locale.getDefault())
    val timePart = timeFmt.format(Date(ts))

    val sameDay = targetCal.get(Calendar.YEAR) == nowCal.get(Calendar.YEAR) &&
        targetCal.get(Calendar.DAY_OF_YEAR) == nowCal.get(Calendar.DAY_OF_YEAR)
    val isTomorrow = targetCal.get(Calendar.YEAR) == tomorrowCal.get(Calendar.YEAR) &&
        targetCal.get(Calendar.DAY_OF_YEAR) == tomorrowCal.get(Calendar.DAY_OF_YEAR)

    return when {
        sameDay -> "Today at $timePart"
        isTomorrow -> "Tomorrow at $timePart"
        targetCal.get(Calendar.YEAR) == nowCal.get(Calendar.YEAR) -> {
            val dayFmt = SimpleDateFormat("EEE, MMM d", Locale.getDefault())
            "${dayFmt.format(Date(ts))} at $timePart"
        }
        else -> {
            val fullFmt = SimpleDateFormat("MMM d, yyyy", Locale.getDefault())
            "${fullFmt.format(Date(ts))} at $timePart"
        }
    }
}

private fun formatAndroidRelativeEta(targetTs: Long, nowMs: Long = System.currentTimeMillis()): String {
    val diff = targetTs - nowMs
    if (diff <= 0L) return "Sending now"
    val sec = (diff + 999L) / 1000L
    if (sec < 60L) return "in ${sec}s"
    val mins = ((diff + 30_000L) / 60_000L).coerceAtLeast(1L)
    if (mins < 60L) return "in ${mins}m"
    val hours = mins / 60L
    val remMins = mins % 60L
    if (hours < 24L) {
        return if (remMins > 0L) "in ${hours}h ${remMins}m" else "in ${hours}h"
    }
    val days = hours / 24L
    val remHours = hours % 24L
    return if (remHours > 0L) "in ${days}d ${remHours}h" else "in ${days}d"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScheduleMessageBottomSheet(
    vm: JaTextSessionViewModel,
    state: SessionUiState,
    targetKind: String,
    targetId: String,
    targetLabel: String,
    initialTab: String,
    initialDraft: String,
    replyToId: String?,
    chatScheduledItems: List<ScheduledMessageItem>,
    onConsumeComposerDraft: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val palette = LocalJaTextPalette.current
    val scope = rememberCoroutineScope()

    var activeTab by remember(initialTab) { mutableStateOf(initialTab) }
    var scopeFilter by remember { mutableStateOf("chat") }
    var messageBody by remember { mutableStateOf(initialDraft) }
    var scheduledAtMs by remember { mutableLongStateOf(defaultFutureScheduledAt()) }
    var selectedPresetId by remember { mutableStateOf<String?>(null) }
    var errorBanner by remember { mutableStateOf<String?>(null) }
    var isSubmitting by remember { mutableStateOf(false) }
    var nowTick by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val removingIds = remember { mutableStateMapOf<String, Boolean>() }

    LaunchedEffect(Unit) {
        while (true) {
            delay(10_000L)
            nowTick = System.currentTimeMillis()
        }
    }

    val isFutureValid = scheduledAtMs > nowTick + 3_000L
    val visibleItems = if (scopeFilter == "all") state.scheduledMessages else chatScheduledItems

    fun removeWithAnimation(itemId: String) {
        if (removingIds[itemId] == true) return
        removingIds[itemId] = true
        scope.launch {
            delay(250L)
            vm.deleteScheduledMessage(itemId)
            removingIds.remove(itemId)
        }
    }

    fun resolveTargetChip(item: ScheduledMessageItem): String {
        return when (item.targetKind) {
            "community" -> "Official Community"
            "group" -> {
                val grp = state.groups.firstOrNull { it.id == item.targetId }
                grp?.name ?: if (grp?.isCommunity == true) "Community" else "Group chat"
            }
            else -> state.friends.firstOrNull { it.id == item.targetId }?.let { "@${it.username}" } ?: "Direct chat"
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
        shape = RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp)
                .padding(bottom = 22.dp),
            verticalArrangement = Arrangement.spacedBy(13.dp),
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(11.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(13.dp))
                            .background(palette.accent.copy(alpha = 0.18f))
                            .border(1.dp, palette.accent.copy(alpha = 0.4f), RoundedCornerShape(13.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Schedule,
                            contentDescription = null,
                            tint = palette.accent,
                            modifier = Modifier.size(21.dp),
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Schedule message",
                            color = palette.textPrimary,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        Text(
                            text = "Sending to $targetLabel",
                            color = palette.textSecondary,
                            fontSize = 12.2.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "Close",
                        tint = palette.textSecondary,
                    )
                }
            }

            // Segmented Tabs ("New schedule" | "Scheduled message")
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(palette.bgTertiary)
                    .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                val composeSelected = activeTab == "compose"
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(
                            if (composeSelected) palette.accent.copy(alpha = 0.24f) else Color.Transparent
                        )
                        .border(
                            width = 1.dp,
                            color = if (composeSelected) palette.accent.copy(alpha = 0.55f) else Color.Transparent,
                            shape = RoundedCornerShape(10.dp),
                        )
                        .jaBouncyClick(pressedScale = 0.96f) { activeTab = "compose" }
                        .padding(vertical = 9.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "New schedule",
                        color = if (composeSelected) palette.textPrimary else palette.textSecondary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }

                val listSelected = activeTab == "list"
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(
                            if (listSelected) palette.accent.copy(alpha = 0.24f) else Color.Transparent
                        )
                        .border(
                            width = 1.dp,
                            color = if (listSelected) palette.accent.copy(alpha = 0.55f) else Color.Transparent,
                            shape = RoundedCornerShape(10.dp),
                        )
                        .jaBouncyClick(pressedScale = 0.96f) { activeTab = "list" }
                        .padding(vertical = 9.dp, horizontal = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = "Scheduled message",
                        color = if (listSelected) palette.textPrimary else palette.textSecondary,
                        fontSize = 12.8.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                    )
                    Spacer(Modifier.width(5.dp))
                    Box(
                        modifier = Modifier
                            .height(18.dp)
                            .widthIn(min = 18.dp)
                            .clip(CircleShape)
                            .background(palette.surface)
                            .padding(horizontal = 5.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = chatScheduledItems.size.toString(),
                            color = palette.textPrimary,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                }
            }

            AnimatedContent(
                targetState = activeTab,
                transitionSpec = {
                    (fadeIn(tween(200)) + scaleIn(initialScale = 0.97f, animationSpec = tween(200)))
                        .togetherWith(fadeOut(tween(150)))
                },
                label = "scheduleSheetTabTransition",
            ) { tab ->
                if (tab == "compose") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            text = "MESSAGE",
                            color = palette.textSecondary,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        OutlinedTextField(
                            value = messageBody,
                            onValueChange = {
                                messageBody = it
                                if (errorBanner != null) errorBanner = null
                            },
                            placeholder = {
                                Text(
                                    text = "Write your message for $targetLabel…",
                                    color = palette.textTertiary,
                                    fontSize = 14.sp,
                                )
                            },
                            minLines = 3,
                            maxLines = 6,
                            shape = RoundedCornerShape(15.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                cursorColor = if (palette.isDark) Color.White else Color.Black,
                                focusedTextColor = palette.textPrimary,
                                unfocusedTextColor = palette.textPrimary,
                            ),
                            modifier = Modifier.fillMaxWidth(),
                        )

                        Text(
                            text = "QUICK TIME",
                            color = palette.textSecondary,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            val presets = listOf(
                                Triple("15m", "In 15 min") { now: Long ->
                                    ((now + 15L * 60_000L + 59_999L) / 60_000L) * 60_000L
                                },
                                Triple("1h", "In 1 hour") { now: Long ->
                                    ((now + 60L * 60_000L + 59_999L) / 60_000L) * 60_000L
                                },
                                Triple("9pm", "9:00 PM") { now: Long ->
                                    val c = Calendar.getInstance().apply {
                                        timeInMillis = now
                                        set(Calendar.HOUR_OF_DAY, 21)
                                        set(Calendar.MINUTE, 0)
                                        set(Calendar.SECOND, 0)
                                        set(Calendar.MILLISECOND, 0)
                                    }
                                    if (c.timeInMillis <= now + 5L * 60_000L) {
                                        c.add(Calendar.DAY_OF_YEAR, 1)
                                    }
                                    c.timeInMillis
                                },
                                Triple("tom9", "Tomorrow 9 AM") { now: Long ->
                                    Calendar.getInstance().apply {
                                        timeInMillis = now
                                        add(Calendar.DAY_OF_YEAR, 1)
                                        set(Calendar.HOUR_OF_DAY, 9)
                                        set(Calendar.MINUTE, 0)
                                        set(Calendar.SECOND, 0)
                                        set(Calendar.MILLISECOND, 0)
                                    }.timeInMillis
                                },
                                Triple("24h", "In 24 hours") { now: Long ->
                                    ((now + 24L * 3_600_000L + 59_999L) / 60_000L) * 60_000L
                                },
                            )
                            presets.forEach { (id, label, calc) ->
                                val isSel = selectedPresetId == id
                                Box(
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .background(
                                            if (isSel) palette.accent.copy(alpha = 0.24f) else palette.bgTertiary
                                        )
                                        .border(
                                            width = 1.dp,
                                            color = if (isSel) palette.accent else palette.border,
                                            shape = CircleShape,
                                        )
                                        .jaBouncyClick(pressedScale = 0.93f) {
                                            val now = System.currentTimeMillis()
                                            scheduledAtMs = calc(now)
                                            nowTick = now
                                            selectedPresetId = id
                                            errorBanner = null
                                        }
                                        .padding(horizontal = 13.dp, vertical = 7.dp),
                                ) {
                                    Text(
                                        text = label,
                                        color = if (isSel) palette.textPrimary else palette.textSecondary,
                                        fontSize = 12.5.sp,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                        }

                        // Native Date & Time Picker buttons
                        val dateFmt = remember { SimpleDateFormat("EEE, MMM d, yyyy", Locale.getDefault()) }
                        val timeFmt = remember { SimpleDateFormat("h:mm a", Locale.getDefault()) }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(palette.bgTertiary)
                                    .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                    .jaBouncyClick(pressedScale = 0.96f) {
                                        val cal = Calendar.getInstance().apply { timeInMillis = scheduledAtMs }
                                        DatePickerDialog(
                                            context,
                                            { _, year, month, dayOfMonth ->
                                                val updated = Calendar.getInstance().apply {
                                                    timeInMillis = scheduledAtMs
                                                    set(Calendar.YEAR, year)
                                                    set(Calendar.MONTH, month)
                                                    set(Calendar.DAY_OF_MONTH, dayOfMonth)
                                                    set(Calendar.SECOND, 0)
                                                    set(Calendar.MILLISECOND, 0)
                                                }
                                                scheduledAtMs = updated.timeInMillis
                                                selectedPresetId = null
                                                nowTick = System.currentTimeMillis()
                                                errorBanner = null
                                            },
                                            cal.get(Calendar.YEAR),
                                            cal.get(Calendar.MONTH),
                                            cal.get(Calendar.DAY_OF_MONTH),
                                        ).apply {
                                            datePicker.minDate = System.currentTimeMillis() - 60_000L
                                        }.show()
                                    }
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                            ) {
                                Text("Date", color = palette.textSecondary, fontSize = 11.2.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = dateFmt.format(Date(scheduledAtMs)),
                                    color = palette.textPrimary,
                                    fontSize = 13.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }

                            Column(
                                modifier = Modifier
                                    .weight(0.85f)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(palette.bgTertiary)
                                    .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                    .jaBouncyClick(pressedScale = 0.96f) {
                                        val cal = Calendar.getInstance().apply { timeInMillis = scheduledAtMs }
                                        TimePickerDialog(
                                            context,
                                            { _, hourOfDay, minute ->
                                                val updated = Calendar.getInstance().apply {
                                                    timeInMillis = scheduledAtMs
                                                    set(Calendar.HOUR_OF_DAY, hourOfDay)
                                                    set(Calendar.MINUTE, minute)
                                                    set(Calendar.SECOND, 0)
                                                    set(Calendar.MILLISECOND, 0)
                                                }
                                                scheduledAtMs = updated.timeInMillis
                                                selectedPresetId = null
                                                nowTick = System.currentTimeMillis()
                                                errorBanner = null
                                            },
                                            cal.get(Calendar.HOUR_OF_DAY),
                                            cal.get(Calendar.MINUTE),
                                            false,
                                        ).show()
                                    }
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                            ) {
                                Text("Time", color = palette.textSecondary, fontSize = 11.2.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = timeFmt.format(Date(scheduledAtMs)),
                                    color = palette.textPrimary,
                                    fontSize = 13.5.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }

                        // Live Send Preview Pill
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(13.dp))
                                .background(
                                    if (isFutureValid) palette.accent.copy(alpha = 0.13f) else palette.danger.copy(alpha = 0.13f)
                                )
                                .border(
                                    width = 1.dp,
                                    color = if (isFutureValid) palette.accent.copy(alpha = 0.35f) else palette.danger.copy(alpha = 0.4f),
                                    shape = RoundedCornerShape(13.dp),
                                )
                                .padding(horizontal = 12.dp, vertical = 9.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(if (isFutureValid) Color(0xFF22C55E) else palette.danger),
                            )
                            Text(
                                text = if (isFutureValid) {
                                    "Sends ${formatAndroidScheduledWhen(scheduledAtMs, nowTick)} · ${formatAndroidRelativeEta(scheduledAtMs, nowTick)}"
                                } else {
                                    "Select a time in the future"
                                },
                                color = if (isFutureValid) palette.textPrimary else palette.danger,
                                fontSize = 12.6.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }

                        errorBanner?.let { err ->
                            Text(
                                text = err,
                                color = palette.danger,
                                fontSize = 12.8.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                        ) {
                            JaWebGhostButton(text = "Cancel", onClick = onDismiss)
                            Spacer(Modifier.width(8.dp))
                            Button(
                                onClick = {
                                    val trimmed = messageBody.trim()
                                    if (trimmed.isEmpty()) {
                                        errorBanner = "Type a message to schedule."
                                        return@Button
                                    }
                                    if (scheduledAtMs <= System.currentTimeMillis() + 2_500L) {
                                        errorBanner = "Pick a time in the future."
                                        return@Button
                                    }
                                    isSubmitting = true
                                    errorBanner = null
                                    val matchesComposerDraft =
                                        initialDraft.trim().isNotEmpty() && initialDraft.trim() == trimmed
                                    vm.scheduleChatMessage(
                                        targetKind = targetKind,
                                        targetId = targetId,
                                        text = trimmed,
                                        scheduledAt = scheduledAtMs,
                                        replyToId = replyToId,
                                        onScheduled = {
                                            isSubmitting = false
                                            if (matchesComposerDraft) {
                                                onConsumeComposerDraft()
                                            }
                                            messageBody = ""
                                            activeTab = "list"
                                        },
                                        onError = { msg ->
                                            isSubmitting = false
                                            errorBanner = msg
                                        },
                                    )
                                },
                                enabled = !isSubmitting && messageBody.isNotBlank() && isFutureValid,
                                shape = RoundedCornerShape(13.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                            ) {
                                Text(
                                    text = if (isSubmitting) "Scheduling…" else "Schedule message",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }

                        if (chatScheduledItems.isNotEmpty()) {
                            HorizontalDivider(color = palette.border)
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "Scheduled message (${chatScheduledItems.size})",
                                    color = palette.textSecondary,
                                    fontSize = 12.2.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = "Manage all",
                                    color = palette.accent,
                                    fontSize = 12.2.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.clickable { activeTab = "list" },
                                )
                            }
                            chatScheduledItems.take(2).forEach { item ->
                                ScheduledMessageRowCard(
                                    item = item,
                                    nowTick = nowTick,
                                    targetChip = null,
                                    isRemoving = removingIds[item.id] == true,
                                    onRemove = { removeWithAnimation(item.id) },
                                )
                            }
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (state.scheduledMessages.size > chatScheduledItems.size) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf(
                                    "chat" to "This chat (${chatScheduledItems.size})",
                                    "all" to "All chats (${state.scheduledMessages.size})",
                                ).forEach { (key, label) ->
                                    val sel = scopeFilter == key
                                    Box(
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .background(
                                                if (sel) palette.accent.copy(alpha = 0.22f) else palette.bgTertiary
                                            )
                                            .border(
                                                width = 1.dp,
                                                color = if (sel) palette.accent else palette.border,
                                                shape = CircleShape,
                                            )
                                            .clickable { scopeFilter = key }
                                            .padding(horizontal = 12.dp, vertical = 6.dp),
                                    ) {
                                        Text(
                                            text = label,
                                            color = if (sel) palette.textPrimary else palette.textSecondary,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }
                            }
                        }

                        if (visibleItems.isEmpty()) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 26.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(54.dp)
                                        .clip(RoundedCornerShape(18.dp))
                                        .background(palette.accent.copy(alpha = 0.16f))
                                        .border(1.dp, palette.accent.copy(alpha = 0.34f), RoundedCornerShape(18.dp)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Schedule,
                                        contentDescription = null,
                                        tint = palette.accent,
                                        modifier = Modifier.size(26.dp),
                                    )
                                }
                                Text(
                                    text = "No scheduled messages",
                                    color = palette.textPrimary,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                )
                                Text(
                                    text = "Messages you schedule appear here until their send time arrives.",
                                    color = palette.textSecondary,
                                    fontSize = 12.8.sp,
                                    textAlign = TextAlign.Center,
                                    modifier = Modifier.padding(horizontal = 20.dp),
                                )
                                Spacer(Modifier.height(4.dp))
                                Button(
                                    onClick = { activeTab = "compose" },
                                    shape = RoundedCornerShape(13.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                                ) {
                                    Text("Schedule a message", color = Color.White, fontWeight = FontWeight.Bold)
                                }
                            }
                        } else {
                            visibleItems.forEach { item ->
                                ScheduledMessageRowCard(
                                    item = item,
                                    nowTick = nowTick,
                                    targetChip = if (scopeFilter == "all") resolveTargetChip(item) else null,
                                    isRemoving = removingIds[item.id] == true,
                                    onRemove = { removeWithAnimation(item.id) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ScheduledMessageRowCard(
    item: ScheduledMessageItem,
    nowTick: Long,
    targetChip: String?,
    isRemoving: Boolean,
    onRemove: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    AnimatedVisibility(
        visible = !isRemoving,
        enter = expandVertically() + fadeIn(),
        exit = slideOutHorizontally(
            targetOffsetX = { fullWidth -> fullWidth / 2 },
            animationSpec = tween(230),
        ) + shrinkVertically(animationSpec = tween(230)) + fadeOut(animationSpec = tween(200)),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(palette.bgTertiary)
                .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                .padding(horizontal = 13.dp, vertical = 11.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (!targetChip.isNullOrBlank()) {
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(palette.surface)
                                .padding(horizontal = 7.dp, vertical = 2.dp),
                        ) {
                            Text(
                                text = targetChip,
                                color = palette.textPrimary,
                                fontSize = 10.5.sp,
                                fontWeight = FontWeight.ExtraBold,
                            )
                        }
                    }
                    Text(
                        text = formatAndroidScheduledWhen(item.scheduledAt, nowTick),
                        color = palette.accent,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(palette.accent.copy(alpha = 0.15f))
                            .padding(horizontal = 7.dp, vertical = 2.dp),
                    ) {
                        Text(
                            text = formatAndroidRelativeEta(item.scheduledAt, nowTick),
                            color = palette.textSecondary,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
                Text(
                    text = item.body,
                    color = palette.textPrimary,
                    fontSize = 13.6.sp,
                    maxLines = 4,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(palette.danger.copy(alpha = 0.13f))
                    .border(1.dp, palette.danger.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                    .jaBouncyClick(pressedScale = 0.92f, onClick = onRemove)
                    .padding(horizontal = 9.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.DeleteOutline,
                    contentDescription = "Remove scheduled message",
                    tint = palette.danger,
                    modifier = Modifier.size(15.dp),
                )
                Text(
                    text = "Remove",
                    color = palette.danger,
                    fontSize = 11.8.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun ZoomableFullscreenImageDialog(
    model: Any,
    onDismiss: () -> Unit,
) {
    var scale by remember(model) { mutableFloatStateOf(1f) }
    var offsetX by remember(model) { mutableFloatStateOf(0f) }
    var offsetY by remember(model) { mutableFloatStateOf(0f) }
    var containerSize by remember { mutableStateOf(IntSize.Zero) }

    fun clampOffsets(targetScale: Float, rawX: Float, rawY: Float): Pair<Float, Float> {
        if (targetScale <= 1.01f) return 0f to 0f
        val maxX = ((containerSize.width * (targetScale - 1f)) / 2f).coerceAtLeast(0f)
        val maxY = ((containerSize.height * (targetScale - 1f)) / 2f).coerceAtLeast(0f)
        return rawX.coerceIn(-maxX, maxX) to rawY.coerceIn(-maxY, maxY)
    }

    FullscreenOverlaySlot(
        id = "zoomable_fullscreen_image",
        secureScreen = false,
        backgroundColor = Color(0xFF05070B),
        onBack = onDismiss,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF05070B))
                .onSizeChanged { containerSize = it }
                .pointerInput(model) {
                    detectTapGestures(
                        onDoubleTap = { tapOffset ->
                            if (scale > 1.08f) {
                                scale = 1f
                                offsetX = 0f
                                offsetY = 0f
                            } else {
                                val nextScale = 2.6f
                                val cx = containerSize.width / 2f
                                val cy = containerSize.height / 2f
                                val dx = (cx - tapOffset.x) * (nextScale - 1f)
                                val dy = (cy - tapOffset.y) * (nextScale - 1f)
                                val (clampedX, clampedY) = clampOffsets(nextScale, dx, dy)
                                scale = nextScale
                                offsetX = clampedX
                                offsetY = clampedY
                            }
                        },
                        onTap = {
                            if (scale <= 1.04f) onDismiss()
                        },
                    )
                }
                .pointerInput(model) {
                    awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false)
                        do {
                            val event = awaitPointerEvent()
                            val pointerCount = event.changes.count { it.pressed }
                            if (pointerCount >= 2 || scale > 1.02f) {
                                val zoomChange = event.calculateZoom()
                                val panChange = event.calculatePan()
                                val nextScale = (scale * zoomChange).coerceIn(1f, 5f)
                                val (nx, ny) = clampOffsets(
                                    nextScale,
                                    offsetX + panChange.x,
                                    offsetY + panChange.y,
                                )
                                if (zoomChange != 1f || nextScale > 1.02f) {
                                    scale = nextScale
                                    offsetX = nx
                                    offsetY = ny
                                    event.changes.forEach { ch ->
                                        if (ch.position != ch.previousPosition) {
                                            ch.consume()
                                        }
                                    }
                                }
                            }
                        } while (event.changes.any { it.pressed })
                        if (scale < 1.02f) {
                            scale = 1f
                            offsetX = 0f
                            offsetY = 0f
                        }
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            AsyncImage(
                model = model,
                contentDescription = "Fullscreen media",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        translationX = offsetX
                        translationY = offsetY
                    },
            )
            if (scale > 1.06f) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .padding(bottom = 22.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color(0x88000000))
                        .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(999.dp))
                        .clickable {
                            scale = 1f
                            offsetX = 0f
                            offsetY = 0f
                        }
                        .padding(horizontal = 14.dp, vertical = 7.dp)
                ) {
                    Text(
                        text = "${String.format(java.util.Locale.US, "%.1fx", scale)} · Reset zoom",
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .statusBarsPadding()
                    .padding(14.dp)
                    .clip(CircleShape)
                    .background(Color(0x66000000)),
            ) {
                Icon(Icons.Rounded.Close, contentDescription = "Close", tint = Color.White)
            }
        }
    }
}

private suspend fun copyImageMessageToClipboard(
    context: Context,
    rawUrl: String,
    encryptedAttachment: EncryptedBlobDescriptor?,
): Boolean = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
    try {
        val absUrl = TursoApiClient.resolveAbsoluteMediaUrl(rawUrl)
        val srcFile: java.io.File? = if (rawUrl.startsWith("file://")) {
            Uri.parse(rawUrl).path?.let { java.io.File(it) }
        } else {
            JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(context, absUrl, encryptedAttachment)
        }
        if (srcFile == null || !srcFile.exists() || srcFile.length() <= 0L) {
            return@withContext false
        }
        val ext = srcFile.extension.lowercase().takeIf { it in setOf("png", "jpg", "jpeg", "gif", "webp") } ?: "png"
        val shareCopy = java.io.File(context.cacheDir, "jatext_clip_${System.currentTimeMillis()}.$ext")
        srcFile.copyTo(shareCopy, overwrite = true)
        val contentUri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            shareCopy,
        )
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
            val cb = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            if (cb == null) {
                false
            } else {
                val clip = ClipData.newUri(context.contentResolver, "JaText Image", contentUri)
                cb.setPrimaryClip(clip)
                true
            }
        }
    } catch (_: Throwable) {
        false
    }
}

/* ==================== Contact Thread Intro Card (Wallpaper-Affected Contact Name Card!) ==================== */

@Composable
private fun ContactThreadIntroCard(
    friend: JaUser,
    resolvedWallpaperUrl: String?,
    onOpenProfile: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val hasWp = !resolvedWallpaperUrl.isNullOrBlank()
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 360.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp))
                .background(if (hasWp) Color(0x9E10121C) else palette.bgSecondary)
                .border(
                    width = 1.dp,
                    color = if (hasWp) Color(0x38FFFFFF) else palette.border,
                    shape = RoundedCornerShape(22.dp),
                )
                .clickable { onOpenProfile() }
        ) {
            if (hasWp && resolvedWallpaperUrl != null) {
                AsyncImage(
                    model = resolvedWallpaperUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    alpha = 0.28f,
                    modifier = Modifier.matchParentSize(),
                )
            }
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                JaAvatar(
                    avatarUrl = friend.avatarUrl,
                    displayName = friend.displayName.ifBlank { friend.username },
                    avatarColor = friend.avatarColor,
                    size = 64.dp,
                    ringWidth = 3.dp,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = friend.displayName.ifBlank { friend.username },
                    color = if (hasWp) Color.White else palette.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "@${friend.username}",
                    color = if (hasWp) Color(0xFFD6DAE6) else palette.textSecondary,
                    fontSize = 13.sp,
                )
                if (friend.bio.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    RichMarkdownText(
                        text = friend.bio,
                        textColor = if (hasWp) Color(0xFFF1F5F9) else palette.textPrimary,
                        subTextColor = if (hasWp) Color(0xFFCBD5E1) else palette.textSecondary,
                        isLightSurface = !hasWp && !palette.isDark,
                        accentColor = palette.accent,
                        showLinkEmbeds = false,
                        fontSizeSp = 13f,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (hasWp) Color(0x40000000) else palette.bgTertiary)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Lock,
                        contentDescription = null,
                        tint = palette.accent,
                        modifier = Modifier.size(12.dp),
                    )
                    Spacer(Modifier.width(5.dp))
                    Text(
                        text = "End-to-End Encrypted",
                        color = if (hasWp) Color(0xFFE2E8F0) else palette.textSecondary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

/* ==================== 1:1 JaText Community Announcement Post Card (`CommunityChatView.tsx` `.community-post`) ==================== */

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun CommunityAnnouncementPostCard(
    msg: UnifiedThreadItem,
    myUserId: String,
    canReply: Boolean,
    canManagePolls: Boolean,
    knownGroupIds: Set<String>,
    knownFriendIds: Set<String>,
    onOpenAuthorProfile: () -> Unit,
    onSwipeReply: () -> Unit,
    onLongPress: () -> Unit,
    onToggleReaction: (String) -> Unit,
    onOpenEmojiPicker: () -> Unit,
    onJumpToReply: (String) -> Unit,
    onJumpToForwarded: (ForwardedMessageContext) -> Unit,
    onVotePoll: (Int) -> Unit,
    onEndPoll: () -> Unit,
    onViewPollVoters: () -> Unit,
    onOpenFullscreenImage: (Any) -> Unit,
    showTranscript: Boolean = false,
    onHideTranscript: (() -> Unit)? = null,
    highlightQuery: String = "",
) {
    val palette = LocalJaTextPalette.current
    val thanosHost = LocalThanosSnapHost.current
    val scope = rememberCoroutineScope()
    val offsetX = remember { Animatable(0f) }
    var triggeredSwipe by remember { mutableStateOf(false) }

    val cardInk = ResolvedBubbleColors(
        textColor = palette.textPrimary,
        subTextColor = palette.textSecondary,
        isLightSurface = !palette.isDark,
        voiceNoteInkColor = if (!palette.isDark) Color(0xFF16161D) else palette.textPrimary,
    )
    val timestampLabel = remember(msg.createdAt) {
        SimpleDateFormat("MMM d, h:mm a", Locale.getDefault()).format(Date(msg.createdAt))
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (canReply) {
                    Modifier.pointerInput(msg.id) {
                        detectHorizontalDragGestures(
                            onDragEnd = {
                                if (triggeredSwipe) onSwipeReply()
                                triggeredSwipe = false
                                scope.launch { offsetX.animateTo(0f) }
                            },
                            onDragCancel = {
                                triggeredSwipe = false
                                scope.launch { offsetX.animateTo(0f) }
                            },
                            onHorizontalDrag = { change, dragAmount ->
                                val next = (offsetX.value + dragAmount).coerceIn(0f, 170f)
                                if (next > 0f) change.consume()
                                if (next >= 120f && !triggeredSwipe) triggeredSwipe = true
                                scope.launch { offsetX.snapTo(next) }
                            }
                        )
                    }
                } else {
                    Modifier
                }
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(offsetX.value.roundToInt(), 0) }
                .thanosSnapTarget(msg.id, thanosHost)
                .clip(RoundedCornerShape(18.dp))
                .background(palette.bgSecondary)
                .border(1.dp, palette.border, RoundedCornerShape(18.dp))
                .combinedClickable(
                    onClick = {},
                    onLongClick = onLongPress,
                )
                .padding(horizontal = 15.dp, vertical = 13.dp),
        ) {
            // `.community-post-header`
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                JaAvatar(
                    avatarUrl = msg.senderAvatarUrl,
                    displayName = msg.senderName.ifBlank { "JaText" },
                    avatarColor = msg.senderAvatarColor,
                    size = 34.dp,
                    ringWidth = 2.dp,
                    modifier = Modifier.clickable { onOpenAuthorProfile() },
                )
                Spacer(Modifier.width(9.dp))
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = msg.senderName.ifBlank { "JaText" },
                        color = palette.textPrimary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    Spacer(Modifier.width(5.dp))
                    JaVerifiedBadge(size = 15.dp)
                    Spacer(Modifier.width(5.dp))
                    JaOfficialBadge()
                }
                Spacer(Modifier.width(6.dp))
                Text(
                    text = if (msg.editedAt != null) "$timestampLabel · Edited" else timestampLabel,
                    color = palette.textSecondary,
                    fontSize = 11.sp,
                    maxLines = 1,
                )
            }

            Spacer(Modifier.height(10.dp))

            if (msg.unsentAt != null) {
                Text(
                    text = "This message was unsent",
                    color = palette.textSecondary,
                    fontSize = 13.5.sp,
                    fontStyle = FontStyle.Italic,
                )
            } else {
                msg.forwardedContext?.let { fwd ->
                    ForwardedContextCardUi(
                        contextCard = fwd,
                        myUserId = myUserId,
                        knownGroupIds = knownGroupIds,
                        knownFriendIds = knownFriendIds,
                        ink = cardInk,
                        onJumpToOriginal = onJumpToForwarded,
                    )
                }
                msg.statusReplyQuote?.let { quote ->
                    StatusReplyCardUi(quote = quote, ink = cardInk)
                }
                msg.replyTo?.let { rep ->
                    ReplyQuoteBannerUi(
                        reply = rep,
                        ink = cardInk,
                        onJump = onJumpToReply,
                    )
                }
                if (!msg.attachmentUrl.isNullOrBlank()) {
                    MessageMediaAttachmentView(
                        attachmentUrl = msg.attachmentUrl,
                        attachmentName = msg.attachmentName,
                        attachmentType = msg.attachmentType,
                        encryptedAttachment = null,
                        ink = cardInk,
                        onOpenImageFullscreen = onOpenFullscreenImage,
                        showTranscript = showTranscript,
                        onHideTranscript = onHideTranscript,
                        onLongPressMessage = onLongPress,
                    )
                }
                if (!msg.stickerUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = msg.stickerUrl,
                        contentDescription = "Sticker",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .size(164.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .combinedClickable(
                                onClick = { onOpenFullscreenImage(msg.stickerUrl) },
                                onLongClick = onLongPress,
                            ),
                    )
                }
                if (msg.poll != null) {
                    CommunityPollCardUi(
                        question = msg.body,
                        poll = msg.poll,
                        canManage = canManagePolls,
                        ink = cardInk,
                        onVote = onVotePoll,
                        onEndPoll = onEndPoll,
                        onViewVoters = onViewPollVoters,
                    )
                } else if (msg.body.isNotBlank()) {
                    if (!msg.bubbleStyle.isNullOrBlank() && msg.bubbleStyle != "default") {
                        StyledMessageBubbleContainer(
                            styleId = msg.bubbleStyle,
                            isMine = msg.senderId == myUserId,
                            palette = palette,
                        ) { styledInk ->
                            RichTextWithLinksAndMentions(
                                text = msg.body,
                                ink = styledInk,
                                palette = palette,
                                highlightQuery = highlightQuery,
                                onLongPressMessage = onLongPress,
                            )
                        }
                    } else {
                        RichTextWithLinksAndMentions(
                            text = msg.body,
                            ink = cardInk,
                            palette = palette,
                            highlightQuery = highlightQuery,
                            onLongPressMessage = onLongPress,
                        )
                    }
                }
            }

            if (msg.unsentAt == null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(modifier = Modifier.weight(1f)) {
                        MessageReactionPillsRow(
                            reactions = msg.reactions,
                            myUserId = myUserId,
                            palette = palette,
                            alignEnd = false,
                            onToggleEmoji = onToggleReaction,
                            onOpenPicker = onOpenEmojiPicker,
                        )
                    }
                    if (msg.reactions.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .jaBouncyClick(pressedScale = 0.88f, onClick = onOpenEmojiPicker)
                                .clip(CircleShape)
                                .background(palette.bgTertiary)
                                .border(1.dp, palette.border, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.AddReaction,
                                contentDescription = "Add reaction",
                                tint = palette.textSecondary,
                                modifier = Modifier.size(15.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

/* ==================== 1:1 DM & Group Message Row (Swipe-to-Reply + Call Cards + Text Read Receipts + Group Seen Avatars!) ==================== */

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SwipeableMessageRow(
    msg: UnifiedThreadItem,
    isMine: Boolean,
    isGroupThread: Boolean,
    hasWallpaper: Boolean,
    showSenderHeader: Boolean,
    myUserId: String,
    activeCallId: String?,
    seenReaders: List<GroupSeenReader>,
    knownGroupIds: Set<String>,
    knownFriendIds: Set<String>,
    onSwipeReply: () -> Unit,
    onLongPress: () -> Unit,
    onToggleReaction: (String) -> Unit,
    onOpenEmojiPicker: () -> Unit,
    onJumpToReply: (String) -> Unit,
    onJumpToForwarded: (ForwardedMessageContext) -> Unit,
    onOpenFullscreenImage: (Any) -> Unit,
    onClickSenderOrReader: (JaUser) -> Unit,
    onCallAction: (String) -> Unit,
    isViewOnceOpened: Boolean = false,
    onBurnViewOnce: (String) -> Unit = {},
    showTranscript: Boolean = false,
    onHideTranscript: (() -> Unit)? = null,
    highlightQuery: String = "",
) {
    val palette = LocalJaTextPalette.current
    val thanosHost = LocalThanosSnapHost.current
    val scope = rememberCoroutineScope()
    val offsetX = remember { Animatable(0f) }
    var triggeredSwipe by remember { mutableStateOf(false) }

    val dmCallInvite = remember(msg.body, isGroupThread) {
        if (!isGroupThread) parseDmCallInvitePayload(msg.body) else null
    }
    val groupCallInvite = remember(msg.body, isGroupThread) {
        if (isGroupThread) parseGroupCallInvitePayload(msg.body) else null
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .pointerInput(msg.id) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        if (triggeredSwipe) onSwipeReply()
                        triggeredSwipe = false
                        scope.launch { offsetX.animateTo(0f) }
                    },
                    onDragCancel = {
                        triggeredSwipe = false
                        scope.launch { offsetX.animateTo(0f) }
                    },
                    onHorizontalDrag = { change, dragAmount ->
                        val next = (offsetX.value + dragAmount).coerceIn(0f, 190f)
                        if (next > 0f) change.consume()
                        if (next >= 130f && !triggeredSwipe) triggeredSwipe = true
                        scope.launch { offsetX.snapTo(next) }
                    }
                )
            }
    ) {
        if (offsetX.value > 18f) {
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.Reply,
                contentDescription = "Reply",
                tint = palette.accent,
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .padding(start = 8.dp)
                    .size(22.dp),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(offsetX.value.roundToInt(), 0) },
            horizontalArrangement = if (isMine) Arrangement.End else Arrangement.Start,
            verticalAlignment = Alignment.Bottom,
        ) {
            if (!isMine && showSenderHeader) {
                JaAvatar(
                    avatarUrl = msg.senderAvatarUrl,
                    displayName = msg.senderName,
                    avatarColor = msg.senderAvatarColor,
                    size = 30.dp,
                    ringWidth = 2.dp,
                    modifier = Modifier.clickable {
                        onClickSenderOrReader(
                            JaUser(
                                id = msg.senderId,
                                displayName = msg.senderName,
                                username = msg.senderUsername,
                                avatarColor = msg.senderAvatarColor.orEmpty().ifBlank { "violet" },
                                avatarUrl = msg.senderAvatarUrl,
                                onboardingComplete = true,
                            )
                        )
                    }
                )
                Spacer(Modifier.width(8.dp))
            }

            Column(
                horizontalAlignment = if (isMine) Alignment.End else Alignment.Start,
                modifier = Modifier.widthIn(max = 312.dp),
            ) {
                if (showSenderHeader) {
                    Text(
                        text = msg.senderName,
                        color = if (hasWallpaper) Color(0xFFE2E8F0) else palette.textSecondary,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 4.dp, bottom = 2.dp),
                    )
                }

                when {
                    msg.unsentAt != null -> {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(16.dp))
                                .background(if (hasWallpaper) Color(0x660E1018) else Color.Transparent)
                                .border(1.dp, if (hasWallpaper) Color(0x38FFFFFF) else palette.border, RoundedCornerShape(16.dp))
                                .padding(horizontal = 12.dp, vertical = 7.dp)
                        ) {
                            Text(
                                text = "This message was unsent",
                                color = if (hasWallpaper) Color(0xFFCBD5E1) else palette.textTertiary,
                                fontSize = 13.sp,
                                fontStyle = FontStyle.Italic,
                            )
                        }
                    }

                    dmCallInvite != null -> {
                        CallMessageCardUi(
                            invite = dmCallInvite,
                            isMine = isMine,
                            isLiveThisCall = activeCallId != null && activeCallId == dmCallInvite.callId,
                            palette = palette,
                            onActionClick = { onCallAction(dmCallInvite.mode) },
                        )
                    }

                    groupCallInvite != null -> {
                        GroupCallMessageCardUi(
                            invite = groupCallInvite,
                            isLiveThisCall = activeCallId != null && activeCallId == groupCallInvite.callId,
                            palette = palette,
                            onJoinOrCall = { onCallAction(groupCallInvite.mode) },
                        )
                    }

                    !msg.stickerUrl.isNullOrBlank() -> {
                        Column(
                            horizontalAlignment = if (isMine) Alignment.End else Alignment.Start,
                            modifier = Modifier.thanosSnapTarget(msg.id, thanosHost),
                        ) {
                            AsyncImage(
                                model = msg.stickerUrl,
                                contentDescription = "Sticker",
                                contentScale = ContentScale.Fit,
                                modifier = Modifier
                                    .size(156.dp)
                                    .clip(RoundedCornerShape(16.dp))
                                    .combinedClickable(
                                        onClick = { onOpenFullscreenImage(msg.stickerUrl) },
                                        onLongClick = onLongPress,
                                    ),
                            )
                            Spacer(Modifier.height(2.dp))
                            MessageMetaTimestampAndReceiptRow(
                                createdAt = msg.createdAt,
                                editedAt = msg.editedAt,
                                isMine = isMine,
                                isGroupThread = isGroupThread,
                                deliveryStatus = msg.deliveryStatus,
                                readAt = msg.readAt,
                                subTextColor = if (hasWallpaper) Color(0xFFE2E8F0) else palette.textSecondary,
                                readAccentColor = palette.accent,
                            )
                        }
                    }

                    else -> {
                        Column(
                            horizontalAlignment = if (isMine) Alignment.End else Alignment.Start,
                            modifier = Modifier.thanosSnapTarget(msg.id, thanosHost),
                        ) {
                            StyledMessageBubbleContainer(
                                styleId = msg.bubbleStyle,
                                isMine = isMine,
                                palette = palette,
                                modifier = Modifier
                                    .combinedClickable(
                                        onClick = {},
                                        onLongClick = onLongPress,
                                    )
                            ) { ink ->
                                Column {
                                    msg.forwardedContext?.let { fwd ->
                                        ForwardedContextCardUi(
                                            contextCard = fwd,
                                            myUserId = myUserId,
                                            knownGroupIds = knownGroupIds,
                                            knownFriendIds = knownFriendIds,
                                            ink = ink,
                                            onJumpToOriginal = onJumpToForwarded,
                                        )
                                    }
                                    msg.statusReplyQuote?.let { quote ->
                                        StatusReplyCardUi(quote = quote, ink = ink)
                                    }
                                    msg.replyTo?.let { rep ->
                                        ReplyQuoteBannerUi(
                                            reply = rep,
                                            ink = ink,
                                            onJump = onJumpToReply,
                                        )
                                    }
                                    val isVoMsg = ViewOnceCodec.isViewOnceBody(msg.body)
                                    if (isVoMsg) {
                                        ViewOnceMessageBubbleUi(
                                            messageId = msg.id,
                                            rawBody = msg.body,
                                            fallbackUrl = msg.attachmentUrl,
                                            fallbackName = msg.attachmentName,
                                            fallbackMime = msg.attachmentType,
                                            fallbackAtt = msg.encryptedAttachment,
                                            isOpened = isViewOnceOpened,
                                            ink = ink,
                                            onBurnOpened = onBurnViewOnce,
                                            onLongPressMessage = onLongPress,
                                        )
                                    } else {
                                        if (!msg.attachmentUrl.isNullOrBlank()) {
                                            MessageMediaAttachmentView(
                                                attachmentUrl = msg.attachmentUrl,
                                                attachmentName = msg.attachmentName,
                                                attachmentType = msg.attachmentType,
                                                encryptedAttachment = msg.encryptedAttachment,
                                                isSpoiler = msg.isSpoiler,
                                                spoilerKey = msg.id,
                                                ink = ink,
                                                onOpenImageFullscreen = onOpenFullscreenImage,
                                                showTranscript = showTranscript,
                                                onHideTranscript = onHideTranscript,
                                                onLongPressMessage = onLongPress,
                                            )
                                        }
                                        if (msg.body.isNotBlank()) {
                                            RichTextWithLinksAndMentions(
                                                text = msg.body,
                                                ink = ink,
                                                palette = palette,
                                                highlightQuery = highlightQuery,
                                                onLongPressMessage = onLongPress,
                                            )
                                        }
                                    }

                                    Spacer(Modifier.height(3.dp))
                                    Box(modifier = Modifier.align(Alignment.End)) {
                                        MessageMetaTimestampAndReceiptRow(
                                            createdAt = msg.createdAt,
                                            editedAt = msg.editedAt,
                                            isMine = isMine,
                                            isGroupThread = isGroupThread,
                                            deliveryStatus = msg.deliveryStatus,
                                            readAt = msg.readAt,
                                            subTextColor = ink.subTextColor,
                                            readAccentColor = if (ink.isLightSurface) Color(0xFF0284C7) else Color(0xFF7DD3FC),
                                        )
                                    }
                                }
                            }

                            MessageReactionPillsRow(
                                reactions = msg.reactions,
                                myUserId = myUserId,
                                palette = palette,
                                alignEnd = isMine,
                                onToggleEmoji = onToggleReaction,
                                onOpenPicker = onOpenEmojiPicker,
                            )
                        }
                    }
                }

                if (msg.unsentAt == null && !msg.stickerUrl.isNullOrBlank()) {
                    MessageReactionPillsRow(
                        reactions = msg.reactions,
                        myUserId = myUserId,
                        palette = palette,
                        alignEnd = isMine,
                        onToggleEmoji = onToggleReaction,
                        onOpenPicker = onOpenEmojiPicker,
                    )
                }

                if (isGroupThread && seenReaders.isNotEmpty()) {
                    GroupSeenAvatarsRowUi(
                        seenReaders = seenReaders,
                        alignEnd = isMine,
                        hasWallpaper = hasWallpaper,
                        palette = palette,
                        onClickReader = onClickSenderOrReader,
                    )
                }
            }
        }
    }
}

/**
 * 1:1 Web Read Receipt text (`Sent` / `Delivered` / `Read`) - ZERO double ticks!
 */
@Composable
private fun MessageMetaTimestampAndReceiptRow(
    createdAt: Long,
    editedAt: Long?,
    isMine: Boolean,
    isGroupThread: Boolean,
    deliveryStatus: String?,
    readAt: Long?,
    subTextColor: Color,
    readAccentColor: Color,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.End,
    ) {
        if (editedAt != null) {
            Text(
                text = "Edited · ",
                color = subTextColor,
                fontSize = 10.sp,
            )
        }
        Text(
            text = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(createdAt)),
            color = subTextColor,
            fontSize = 10.sp,
        )
        if (isMine && !isGroupThread) {
            val isRead = readAt != null || deliveryStatus == "read"
            val receiptText = when {
                isRead -> "Read"
                deliveryStatus == "delivered" -> "Delivered"
                deliveryStatus == "sending" -> "Sending"
                else -> "Sent"
            }
            Text(
                text = " · $receiptText",
                color = if (isRead) readAccentColor else subTextColor,
                fontSize = 10.sp,
                fontWeight = if (isRead) FontWeight.Bold else FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun ChatOverflowSvgItem(
    icon: WebUiIconKind,
    label: String,
    textTint: Color? = null,
    iconTint: Color? = null,
    onClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val resolvedText = textTint ?: palette.textPrimary
    val resolvedIcon = iconTint ?: resolvedText
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp, vertical = 2.dp)
            .clip(RoundedCornerShape(11.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WebUiSvgIcon(
            kind = icon,
            tint = resolvedIcon,
            size = 17.dp,
            strokeWidth = 1.9f,
        )
        Spacer(Modifier.width(11.dp))
        Text(
            text = label,
            color = resolvedText,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun WallpaperEventPillRow(
    label: String,
    hasWallpaper: Boolean,
) {
    val palette = LocalJaTextPalette.current
    val pillBg = if (hasWallpaper) Color(0x8C10121B) else palette.bgSecondary
    val pillBorder = if (hasWallpaper) Color(0x30FFFFFF) else palette.border
    val pillText = if (hasWallpaper) Color(0xFFE5E7EB) else palette.textSecondary
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(pillBg)
                .border(1.dp, pillBorder, CircleShape)
                .padding(horizontal = 13.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WebUiSvgIcon(
                kind = WebUiIconKind.Image,
                tint = palette.accent,
                size = 13.5.dp,
                strokeWidth = 1.9f,
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = label,
                color = pillText,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun MessageSheetAction(
    icon: WebUiIconKind,
    label: String,
    tint: Color? = null,
    onClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val c = tint ?: palette.textPrimary
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WebUiSvgIcon(kind = icon, tint = c, size = 19.dp, strokeWidth = 1.9f)
        Spacer(Modifier.width(14.dp))
        Text(label, color = c, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}

internal fun formatTypingUsersLabel(users: List<com.ahad00010.jatext.data.ChatTypingUser>): String {
    if (users.isEmpty()) return ""
    val names = users.map { it.displayName.ifBlank { it.username }.ifBlank { "Someone" } }
    return when {
        names.size == 1 -> "${names[0]} is typing…"
        names.size == 2 -> "${names[0]} and ${names[1]} are typing…"
        else -> "${names[0]}, ${names[1]} and ${names.size - 2} more are typing…"
    }
}

@Composable
private fun LiveTypingIndicatorRow(
    label: String,
    containerColor: Color,
) {
    val palette = LocalJaTextPalette.current
    val infinite = rememberInfiniteTransition(label = "typingDots")
    val dot1 by infinite.animateFloat(
        initialValue = 0.30f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 520),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "dot1",
    )
    val dot2 by infinite.animateFloat(
        initialValue = 0.55f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 520, delayMillis = 150),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "dot2",
    )
    val dot3 by infinite.animateFloat(
        initialValue = 0.35f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 520, delayMillis = 300),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "dot3",
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(containerColor)
            .padding(horizontal = 16.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(3.5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            listOf(dot1, dot2, dot3).forEach { alphaVal ->
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(palette.accent.copy(alpha = alphaVal.coerceIn(0.25f, 1f)))
                )
            }
        }
        Text(
            text = label,
            color = palette.accent,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = com.ahad00010.jatext.ui.theme.SfProTextFontFamily,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

internal fun formatLastSeenPresenceLabel(lastSeenAt: Long?): String {
    if (lastSeenAt == null || lastSeenAt <= 0L) return "Offline"
    val diffMs = (System.currentTimeMillis() - lastSeenAt).coerceAtLeast(0L)
    if (diffMs < 60_000L) return "Last seen just now"
    if (diffMs < 3_600_000L) {
        val mins = (diffMs / 60_000L).coerceAtLeast(1L)
        return "Last seen ${mins}m ago"
    }
    val nowCal = java.util.Calendar.getInstance()
    val seenCal = java.util.Calendar.getInstance().apply { timeInMillis = lastSeenAt }
    val timeFmt = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(lastSeenAt))
    if (nowCal.get(java.util.Calendar.YEAR) == seenCal.get(java.util.Calendar.YEAR) &&
        nowCal.get(java.util.Calendar.DAY_OF_YEAR) == seenCal.get(java.util.Calendar.DAY_OF_YEAR)
    ) {
        return "Last seen today at $timeFmt"
    }
    val yestCal = java.util.Calendar.getInstance().apply { add(java.util.Calendar.DAY_OF_YEAR, -1) }
    if (yestCal.get(java.util.Calendar.YEAR) == seenCal.get(java.util.Calendar.YEAR) &&
        yestCal.get(java.util.Calendar.DAY_OF_YEAR) == seenCal.get(java.util.Calendar.DAY_OF_YEAR)
    ) {
        return "Last seen yesterday at $timeFmt"
    }
    val dateFmt = SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(lastSeenAt))
    return "Last seen $dateFmt"
}


