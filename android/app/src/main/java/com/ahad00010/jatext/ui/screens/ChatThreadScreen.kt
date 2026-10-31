package com.ahad00010.jatext.ui.screens

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
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
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Poll
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.Undo
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material.icons.rounded.Videocam
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
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
import com.ahad00010.jatext.data.OFFICIAL_COMMUNITY_ID
import com.ahad00010.jatext.data.PollVoter
import com.ahad00010.jatext.data.ReplySummary
import com.ahad00010.jatext.data.StickerMedia
import com.ahad00010.jatext.data.TursoApiClient
import com.ahad00010.jatext.data.UNSEND_WINDOW_MS
import com.ahad00010.jatext.media.VoiceNoteRecorderController
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.state.SessionUiState
import com.ahad00010.jatext.ui.components.ALL_BUBBLE_STYLE_SPECS
import com.ahad00010.jatext.ui.components.BubblePreviewThumbUi
import com.ahad00010.jatext.ui.components.CallMessageCardUi
import com.ahad00010.jatext.ui.components.CommunityPollCardUi
import com.ahad00010.jatext.ui.components.ForwardedContextCardUi
import com.ahad00010.jatext.ui.components.GroupCallMessageCardUi
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
import com.ahad00010.jatext.ui.components.WEB_WALLPAPER_PRESETS
import com.ahad00010.jatext.ui.components.jaBouncyClick
import com.ahad00010.jatext.ui.components.parseDmCallInvitePayload
import com.ahad00010.jatext.ui.components.parseGroupCallInvitePayload
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import java.text.SimpleDateFormat
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
)

private data class UnifiedThreadItem(
    val id: String,
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
    val activeFriend = remember(state.activeChatId, state.friends) {
        if (!isCommunity && state.activeChatId != null) {
            state.friends.firstOrNull { it.id == state.activeChatId }
        } else {
            null
        }
    }
    val activeGroup = remember(state.activeGroupId, state.groups) {
        if (state.activeGroupId != null) state.groups.firstOrNull { it.id == state.activeGroupId } else null
    }
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
                UnifiedThreadItem(
                    id = m.id,
                    senderId = m.senderId,
                    senderName = m.senderName,
                    senderUsername = m.senderUsername,
                    senderAvatarUrl = m.senderAvatarUrl,
                    senderAvatarColor = m.senderAvatarColor,
                    body = m.body,
                    bubbleStyle = m.bubbleStyle,
                    attachmentUrl = m.attachmentUrl,
                    attachmentName = m.attachmentName,
                    attachmentType = m.attachmentType,
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
                UnifiedThreadItem(
                    id = m.id,
                    senderId = m.senderId,
                    senderName = m.senderName,
                    senderUsername = m.senderUsername,
                    senderAvatarUrl = m.senderAvatarUrl,
                    senderAvatarColor = m.senderAvatarColor,
                    body = m.body,
                    bubbleStyle = m.bubbleStyle,
                    attachmentUrl = m.attachmentUrl,
                    attachmentName = m.attachmentName,
                    attachmentType = m.attachmentType,
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
                UnifiedThreadItem(
                    id = m.id,
                    senderId = m.senderId,
                    senderName = if (mine) me.displayName else (activeFriend?.displayName ?: "Contact"),
                    senderUsername = if (mine) me.username else (activeFriend?.username ?: ""),
                    senderAvatarUrl = if (mine) me.avatarUrl else activeFriend?.avatarUrl,
                    senderAvatarColor = if (mine) me.avatarColor else activeFriend?.avatarColor,
                    body = m.body,
                    bubbleStyle = m.bubbleStyle,
                    attachmentUrl = m.attachmentUrl,
                    attachmentName = m.attachmentName,
                    attachmentType = m.attachmentType,
                    encryptedAttachment = m.encryptedAttachment,
                    stickerUrl = m.explicitStickerUrl?.takeIf { it.isNotBlank() }?.let { TursoApiClient.resolveAbsoluteMediaUrl(it) },
                    poll = null,
                    deliveryStatus = m.deliveryStatus,
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

    val reversedItems = remember(unifiedItems) { unifiedItems.asReversed() }
    val listState = rememberLazyListState()
    val newestMessageId = reversedItems.firstOrNull()?.id

    LaunchedEffect(newestMessageId) {
        if (newestMessageId != null && listState.firstVisibleItemIndex <= 2) {
            listState.animateScrollToItem(0)
        }
    }

    // Composer & Modal states
    var draftText by remember { mutableStateOf("") }
    var replyingTo by remember { mutableStateOf<ReplySummary?>(null) }
    var editingTarget by remember { mutableStateOf<UnifiedThreadItem?>(null) }
    var pendingAttachmentUri by remember { mutableStateOf<Uri?>(null) }
    var contextMenuMessage by remember { mutableStateOf<UnifiedThreadItem?>(null) }
    var emojiPickerTargetMessageId by remember { mutableStateOf<String?>(null) }
    var forwardingItem by remember { mutableStateOf<UnifiedThreadItem?>(null) }
    var fullscreenImageModel by remember { mutableStateOf<Any?>(null) }
    var showOverflowMenu by remember { mutableStateOf(false) }
    var showStickerSheet by remember { mutableStateOf(false) }
    var showBubbleStyleModal by remember { mutableStateOf(false) }
    var showWallpaperModal by remember { mutableStateOf(false) }
    var showCreatePollModal by remember { mutableStateOf(false) }
    var pollVotersTarget by remember { mutableStateOf<CommunityPoll?>(null) }
    var showModeratorsModal by remember { mutableStateOf(false) }

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

    val attachmentLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) pendingAttachmentUri = uri
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
            if (raw.startsWith("preset:")) {
                val pid = raw.removePrefix("preset:")
                WEB_WALLPAPER_PRESETS.firstOrNull { it.id == pid }?.url
            } else {
                TursoApiClient.resolveAbsoluteMediaUrl(raw)
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
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
        ) {
            /* ==================== Contact / Group / Community Header Card (Frosted when Wallpaper is Active!) ==================== */
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
                                .padding(horizontal = 10.dp, vertical = 6.dp)
                                .clip(RoundedCornerShape(20.dp))
                                .background(headerCardBg)
                                .border(1.dp, headerCardBorder, RoundedCornerShape(20.dp))
                                .padding(horizontal = 10.dp, vertical = 9.dp)
                        } else {
                            Modifier
                                .background(headerCardBg)
                                .padding(horizontal = 12.dp, vertical = 10.dp)
                        }
                    ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                JaWebIconButton(
                    icon = Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = "Back",
                    size = 38.dp,
                    iconSize = 18.dp,
                    containerColor = headerIconBg,
                    borderColor = headerIconBorder,
                    iconTint = headerTitleColor,
                    onClick = { vm.closeActiveChat() },
                )
                Spacer(Modifier.width(10.dp))

                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(14.dp))
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
                                    .size(40.dp)
                                    .clip(CircleShape),
                            )
                        }
                        activeGroup != null -> {
                            JaGroupAvatar(
                                avatarUrl = activeGroup.avatarUrl,
                                name = activeGroup.name,
                                size = 40.dp,
                                ringWidth = 2.5.dp,
                            )
                        }
                        activeFriend != null -> {
                            val peerPresence = when {
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
                                size = 40.dp,
                                ringWidth = 2.5.dp,
                                presenceStatus = peerPresence,
                                statusBorderColor = if (hasWallpaper) Color(0xFF141620) else palette.bgSecondary,
                            )
                        }
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = when {
                                    isCommunity -> "JaText Community"
                                    activeGroup != null -> activeGroup.name
                                    activeFriend != null -> activeFriend.displayName.ifBlank { activeFriend.username }
                                    else -> "Chat"
                                },
                                color = headerTitleColor,
                                fontSize = 16.5.sp,
                                fontWeight = FontWeight.ExtraBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f, fill = false),
                            )
                            if (isCommunity) {
                                Spacer(Modifier.width(6.dp))
                                JaVerifiedBadge(size = 16.dp)
                                Spacer(Modifier.width(5.dp))
                                JaOfficialBadge()
                            }
                        }
                        val statusDotColor = when {
                            activeFriend == null -> null
                            friendActivity?.online == true -> when (friendActivity.statusPreference) {
                                "dnd" -> Color(0xFFEF4444)
                                "away", "idle" -> Color(0xFFF59E0B)
                                else -> Color(0xFF22C55E)
                            }
                            else -> Color(0xFF626272)
                        }
                        val subtitle = when {
                            isCommunity -> {
                                if (state.communityTypingUsers.isNotEmpty()) {
                                    "${state.communityTypingUsers.first().displayName} is typing…"
                                } else {
                                    "Official JaText announcements"
                                }
                            }
                            activeGroup != null -> {
                                if (state.groupTypingUsers.isNotEmpty()) {
                                    "${state.groupTypingUsers.first().displayName} is typing…"
                                } else {
                                    "${state.groupDetails?.members?.size ?: activeGroup.memberCount} members · End-to-End Encrypted"
                                }
                            }
                            friendActivity?.typingToMe == true -> "typing…"
                            friendActivity?.online == true -> {
                                val statusLabel = when (friendActivity.statusPreference) {
                                    "dnd" -> "Do Not Disturb"
                                    "away", "idle" -> "Away"
                                    else -> "Online"
                                }
                                friendActivity.customStatus.ifBlank { "$statusLabel · @${activeFriend?.username.orEmpty()}" }
                            }
                            activeFriend != null -> "Offline · @${activeFriend.username}"
                            else -> "End-to-End Encrypted"
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (statusDotColor != null && !subtitle.contains("typing")) {
                                Box(
                                    modifier = Modifier
                                        .size(7.dp)
                                        .clip(CircleShape)
                                        .background(statusDotColor)
                                )
                                Spacer(Modifier.width(5.dp))
                            }
                            Text(
                                text = subtitle,
                                color = if (subtitle.contains("typing")) palette.accent else headerSubColor,
                                fontSize = 12.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }

                if (!isCommunity) {
                    Spacer(Modifier.width(6.dp))
                    JaWebIconButton(
                        icon = Icons.Rounded.Call,
                        contentDescription = "Voice Call",
                        size = 38.dp,
                        iconSize = 17.dp,
                        containerColor = headerIconBg,
                        borderColor = headerIconBorder,
                        iconTint = headerTitleColor,
                        onClick = {
                            if (activeFriend != null) vm.callEngine.startDmCall(me, activeFriend, "voice")
                            else if (activeGroup != null) vm.callEngine.startGroupCall(me, activeGroup, "voice")
                        },
                    )
                    Spacer(Modifier.width(6.dp))
                    JaWebIconButton(
                        icon = Icons.Rounded.Videocam,
                        contentDescription = "Video Call",
                        size = 38.dp,
                        iconSize = 17.dp,
                        containerColor = headerIconBg,
                        borderColor = headerIconBorder,
                        iconTint = headerTitleColor,
                        onClick = {
                            if (activeFriend != null) vm.callEngine.startDmCall(me, activeFriend, "video")
                            else if (activeGroup != null) vm.callEngine.startGroupCall(me, activeGroup, "video")
                        },
                    )
                } else if (state.communityPermissions.isOwner) {
                    Spacer(Modifier.width(6.dp))
                    JaWebIconButton(
                        icon = Icons.Rounded.HowToReg,
                        contentDescription = "Elect moderators",
                        size = 38.dp,
                        iconSize = 18.dp,
                        containerColor = headerIconBg,
                        borderColor = headerIconBorder,
                        iconTint = headerTitleColor,
                        onClick = { showModeratorsModal = true },
                    )
                }

                Spacer(Modifier.width(6.dp))
                Box {
                    JaWebIconButton(
                        icon = Icons.Rounded.MoreVert,
                        contentDescription = "More options",
                        size = 38.dp,
                        iconSize = 18.dp,
                        containerColor = headerIconBg,
                        borderColor = headerIconBorder,
                        iconTint = headerTitleColor,
                        onClick = { showOverflowMenu = true },
                    )
                    DropdownMenu(
                        expanded = showOverflowMenu,
                        onDismissRequest = { showOverflowMenu = false },
                        modifier = Modifier.background(palette.bgSecondary),
                    ) {
                        if (activeFriend != null) {
                            DropdownMenuItem(
                                text = { Text("View profile", color = palette.textPrimary) },
                                leadingIcon = { Icon(Icons.Rounded.Person, null, tint = palette.textSecondary) },
                                onClick = {
                                    showOverflowMenu = false
                                    onOpenPeerProfile(activeFriend)
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Verify security code", color = palette.textPrimary) },
                                leadingIcon = { Icon(Icons.Rounded.VerifiedUser, null, tint = palette.accent) },
                                onClick = {
                                    showOverflowMenu = false
                                    onOpenSecurityCode(activeFriend)
                                }
                            )
                        }
                        if (activeGroup != null) {
                            DropdownMenuItem(
                                text = { Text("Group members & info", color = palette.textPrimary) },
                                leadingIcon = { Icon(Icons.Rounded.Groups, null, tint = palette.textSecondary) },
                                onClick = {
                                    showOverflowMenu = false
                                    onOpenGroupMembers()
                                }
                            )
                        }
                        DropdownMenuItem(
                            text = { Text("Bubble style", color = palette.textPrimary) },
                            leadingIcon = { Icon(Icons.Rounded.Palette, null, tint = palette.accent) },
                            onClick = {
                                showOverflowMenu = false
                                showBubbleStyleModal = true
                            }
                        )
                        if (!isCommunity) {
                            DropdownMenuItem(
                                text = { Text("Chat wallpaper", color = palette.textPrimary) },
                                leadingIcon = { Icon(Icons.Rounded.Wallpaper, null, tint = palette.accent) },
                                onClick = {
                                    showOverflowMenu = false
                                    showWallpaperModal = true
                                }
                            )
                        }
                        if (isCommunity && state.communityPermissions.isOwner) {
                            DropdownMenuItem(
                                text = { Text("Elect moderators", color = palette.textPrimary) },
                                leadingIcon = { Icon(Icons.Rounded.HowToReg, null, tint = palette.accent) },
                                onClick = {
                                    showOverflowMenu = false
                                    showModeratorsModal = true
                                }
                            )
                        }
                    }
                }
            }

            if (!hasWallpaper) {
                HorizontalDivider(color = palette.border)
            }

            /* ==================== Message Thread ==================== */
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
                        key = { it.id },
                    ) { msg ->
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
                                            body = msg.body.ifBlank { "Attachment" },
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
                            )
                        } else {
                            val isMine = msg.senderId == me.id
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
                                            body = msg.body.ifBlank { "Attachment" },
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
                                onClickSenderOrReader = { user -> onOpenPeerProfile(user) },
                                onCallAction = { mode ->
                                    if (callUiState.active) {
                                        vm.callEngine.setMinimized(false)
                                    } else if (activeFriend != null) {
                                        vm.callEngine.startDmCall(me, activeFriend, mode)
                                    } else if (activeGroup != null) {
                                        vm.callEngine.startGroupCall(me, activeGroup, mode)
                                    }
                                },
                            )
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

            /* ==================== Reply / Edit / Attachment Banner ==================== */
            AnimatedVisibility(
                visible = replyingTo != null || editingTarget != null || pendingAttachmentUri != null,
                enter = expandVertically(animationSpec = spring(stiffness = Spring.StiffnessMediumLow)) + fadeIn(),
                exit = shrinkVertically(animationSpec = spring(stiffness = Spring.StiffnessMedium)) + fadeOut(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(if (hasWallpaper) Color(0xBA11131C) else palette.bgSecondary)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
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
                            text = when {
                                editingTarget != null -> "Editing message"
                                replyingTo != null -> "Replying to ${replyingTo?.senderName}"
                                else -> "Attachment ready to send"
                            },
                            color = palette.accent,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = editingTarget?.body ?: replyingTo?.body ?: pendingAttachmentUri?.lastPathSegment.orEmpty(),
                            color = if (hasWallpaper) Color(0xFFE2E8F0) else palette.textSecondary,
                            fontSize = 12.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    IconButton(
                        onClick = {
                            replyingTo = null
                            editingTarget = null
                            pendingAttachmentUri = null
                        },
                        modifier = Modifier.size(28.dp),
                    ) {
                        Icon(
                            Icons.Rounded.Close,
                            contentDescription = "Cancel",
                            tint = if (hasWallpaper) Color.White else palette.textSecondary,
                            modifier = Modifier.size(16.dp)
                        )
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
                                    vm.sendChatMessage(text = "", replyTo = replyingTo, localVoiceFile = file)
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

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(composerBarBg)
                        .padding(horizontal = 10.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    JaWebIconButton(
                        icon = Icons.Rounded.Add,
                        contentDescription = "Attach file",
                        size = 40.dp,
                        iconSize = 18.dp,
                        containerColor = composerPillBg,
                        borderColor = composerPillBorder,
                        iconTint = composerTextCol,
                        onClick = { attachmentLauncher.launch("*/*") },
                    )
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .jaBouncyClick(pressedScale = 0.92f) { showStickerSheet = true }
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

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 42.dp, max = 130.dp)
                            .clip(RoundedCornerShape(20.dp))
                            .background(composerPillBg)
                            .border(1.dp, composerPillBorder, RoundedCornerShape(20.dp))
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        BasicTextField(
                            value = draftText,
                            onValueChange = { draftText = it },
                            textStyle = TextStyle(
                                color = composerTextCol,
                                fontSize = 15.sp,
                            ),
                            maxLines = 5,
                            modifier = Modifier.fillMaxWidth(),
                            decorationBox = { inner ->
                                if (draftText.isEmpty()) {
                                    Text(
                                        text = if (isCommunity) "Post an announcement…" else "Message…",
                                        color = composerHintCol,
                                        fontSize = 14.5.sp,
                                    )
                                }
                                inner()
                            }
                        )
                    }

                    val canSendText = draftText.isNotBlank() || pendingAttachmentUri != null
                    if (canSendText) {
                        Box(
                            modifier = Modifier
                                .size(42.dp)
                                .jaBouncyClick(pressedScale = 0.90f) {
                                    val textToSend = draftText
                                    draftText = ""
                                    val editTarget = editingTarget
                                    if (editTarget != null) {
                                        editingTarget = null
                                        vm.editMessage(editTarget.id, textToSend)
                                    } else {
                                        val att = pendingAttachmentUri
                                        val rep = replyingTo
                                        pendingAttachmentUri = null
                                        replyingTo = null
                                        vm.sendChatMessage(text = textToSend, replyTo = rep, attachmentUri = att)
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
                            Text(text = emoji, fontSize = 20.sp)
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
                        Icon(
                            imageVector = Icons.Rounded.AddReaction,
                            contentDescription = "All emojis",
                            tint = palette.textPrimary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                if (!isCommunity || state.communityPermissions.canPost) {
                    MessageSheetAction(Icons.AutoMirrored.Rounded.Reply, "Reply") {
                        replyingTo = ReplySummary(
                            id = msg.id,
                            senderId = msg.senderId,
                            senderName = msg.senderName,
                            body = msg.body.ifBlank { "Attachment" },
                        )
                        contextMenuMessage = null
                    }
                }
                MessageSheetAction(Icons.AutoMirrored.Rounded.Forward, "Forward") {
                    forwardingItem = msg
                    contextMenuMessage = null
                }
                if (msg.body.isNotBlank()) {
                    MessageSheetAction(Icons.Rounded.ContentCopy, "Copy text") {
                        val cb = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                        cb?.setPrimaryClip(ClipData.newPlainText("JaText message", msg.body))
                        vm.showToast("Copied to clipboard")
                        contextMenuMessage = null
                    }
                }
                if (isMine && msg.body.isNotBlank()) {
                    MessageSheetAction(Icons.Rounded.Edit, "Edit message") {
                        editingTarget = msg
                        draftText = msg.body
                        contextMenuMessage = null
                    }
                }
                if ((isMine && withinUnsendWindow) || canModerateCommunity) {
                    MessageSheetAction(Icons.Rounded.Undo, "Unsend for everyone", tint = palette.danger) {
                        vm.unsendMessage(msg.id)
                        contextMenuMessage = null
                    }
                }
                if (!isCommunity) {
                    MessageSheetAction(Icons.Rounded.DeleteOutline, "Delete for me", tint = palette.danger) {
                        vm.deleteMessageForMe(msg.id)
                        contextMenuMessage = null
                    }
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
                            Text(text = emoji, fontSize = 22.sp)
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
                                        vm.forwardMessageWithContext(item.body, sourceContext, targetCommunity = true)
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
                                    vm.forwardMessageWithContext(item.body, sourceContext, targetGroupId = grp.id)
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
                                    vm.forwardMessageWithContext(item.body, sourceContext, targetFriendId = fr.id)
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

    /* ==================== 1:1 Web Bubble Style Modal (`BubbleStyleModal.tsx` — All 24 Mascot Artworks!) ==================== */
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

    /* ==================== 1:1 Web Chat Wallpaper Modal (`WallpaperModal.tsx` — Real Presets + Photo Upload!) ==================== */
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
    if (showModeratorsModal && state.communityPermissions.isOwner) {
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

    /* ==================== Fullscreen Image Lightbox ==================== */
    fullscreenImageModel?.let { model ->
        Dialog(
            onDismissRequest = { fullscreenImageModel = null },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xF0000000))
                    .clickable { fullscreenImageModel = null },
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = model,
                    contentDescription = "Fullscreen media",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
                IconButton(
                    onClick = { fullscreenImageModel = null },
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
) {
    val palette = LocalJaTextPalette.current
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
                            .clickable { onOpenFullscreenImage(msg.stickerUrl) },
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
                                onLongPressMessage = onLongPress,
                            )
                        }
                    } else {
                        RichTextWithLinksAndMentions(
                            text = msg.body,
                            ink = cardInk,
                            palette = palette,
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
) {
    val palette = LocalJaTextPalette.current
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
                                avatarColor = msg.senderAvatarColor,
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
                                text = "Message unsent",
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
                        Column(horizontalAlignment = if (isMine) Alignment.End else Alignment.Start) {
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
                        StyledMessageBubbleContainer(
                            styleId = msg.bubbleStyle,
                            isMine = isMine,
                            palette = palette,
                            modifier = Modifier.combinedClickable(
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
                                msg.replyTo?.let { rep ->
                                    ReplyQuoteBannerUi(
                                        reply = rep,
                                        ink = ink,
                                        onJump = onJumpToReply,
                                    )
                                }
                                if (!msg.attachmentUrl.isNullOrBlank()) {
                                    MessageMediaAttachmentView(
                                        attachmentUrl = msg.attachmentUrl,
                                        attachmentName = msg.attachmentName,
                                        attachmentType = msg.attachmentType,
                                        encryptedAttachment = msg.encryptedAttachment,
                                        ink = ink,
                                        onOpenImageFullscreen = onOpenFullscreenImage,
                                    )
                                }
                                if (msg.body.isNotBlank()) {
                                    RichTextWithLinksAndMentions(
                                        text = msg.body,
                                        ink = ink,
                                        palette = palette,
                                        onLongPressMessage = onLongPress,
                                    )
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
 * 1:1 Web Read Receipt text (`Sent` / `Delivered` / `Read`) — ZERO double ticks!
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
private fun MessageSheetAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
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
        Icon(icon, contentDescription = null, tint = c, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(14.dp))
        Text(label, color = c, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}
