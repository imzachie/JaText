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
import androidx.compose.animation.core.Animatable
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
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Forward
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Done
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.EmojiEmotions
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Poll
import androidx.compose.material.icons.rounded.Undo
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import com.ahad00010.jatext.data.EncryptedBlobDescriptor
import com.ahad00010.jatext.data.ForwardedMessageContext
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.MessageReaction
import com.ahad00010.jatext.data.OFFICIAL_COMMUNITY_ID
import com.ahad00010.jatext.data.ReplySummary
import com.ahad00010.jatext.data.StickerMedia
import com.ahad00010.jatext.data.UNSEND_WINDOW_MS
import com.ahad00010.jatext.media.VoiceNoteRecorderController
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.state.SessionUiState
import com.ahad00010.jatext.ui.components.ALL_BUBBLE_STYLE_SPECS
import com.ahad00010.jatext.ui.components.CHAT_WALLPAPER_PRESETS
import com.ahad00010.jatext.ui.components.CommunityPollCardUi
import com.ahad00010.jatext.ui.components.ForwardedContextCardUi
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.components.JaOfficialBadge
import com.ahad00010.jatext.ui.components.JaVerifiedBadge
import com.ahad00010.jatext.ui.components.JaWebIconButton
import com.ahad00010.jatext.ui.components.MessageMediaAttachmentView
import com.ahad00010.jatext.ui.components.MessageReactionPillsRow
import com.ahad00010.jatext.ui.components.ReplyQuoteBannerUi
import com.ahad00010.jatext.ui.components.RichTextWithLinksAndMentions
import com.ahad00010.jatext.ui.components.StyledMessageBubbleContainer
import com.ahad00010.jatext.ui.icons.OwnerCrownVectorBadge
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private data class UnifiedThreadItem(
    val id: String,
    val senderId: String,
    val senderName: String,
    val senderUsername: String,
    val senderAvatarUrl: String?,
    val senderAvatarColor: String?,
    val senderIsOwner: Boolean,
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
                    senderIsOwner = m.senderIsOwner,
                    body = m.body,
                    bubbleStyle = m.bubbleStyle,
                    attachmentUrl = m.attachmentUrl,
                    attachmentName = m.attachmentName,
                    attachmentType = m.attachmentType,
                    encryptedAttachment = null,
                    stickerUrl = m.stickerUrl,
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
                    senderIsOwner = false,
                    body = m.body,
                    bubbleStyle = m.bubbleStyle,
                    attachmentUrl = m.attachmentUrl,
                    attachmentName = m.attachmentName,
                    attachmentType = m.attachmentType,
                    encryptedAttachment = m.encryptedAttachment,
                    stickerUrl = m.encryptedSticker?.url,
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
                    senderIsOwner = if (mine) me.isOwner else (activeFriend?.isOwner == true),
                    body = m.body,
                    bubbleStyle = m.bubbleStyle,
                    attachmentUrl = m.attachmentUrl,
                    attachmentName = m.attachmentName,
                    attachmentType = m.attachmentType,
                    encryptedAttachment = m.encryptedAttachment,
                    stickerUrl = m.encryptedSticker?.url,
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

    // reverseLayout = true means index 0 is the newest message at the bottom -> instant 120Hz scroll + auto-follow!
    val reversedItems = remember(unifiedItems) { unifiedItems.asReversed() }
    val listState = rememberLazyListState()
    val newestMessageId = reversedItems.firstOrNull()?.id

    LaunchedEffect(newestMessageId) {
        if (newestMessageId != null && listState.firstVisibleItemIndex <= 2) {
            listState.animateScrollToItem(0)
        }
    }

    // Composer & Sheet states
    var draftText by remember { mutableStateOf("") }
    var replyingTo by remember { mutableStateOf<ReplySummary?>(null) }
    var editingTarget by remember { mutableStateOf<UnifiedThreadItem?>(null) }
    var pendingAttachmentUri by remember { mutableStateOf<Uri?>(null) }
    var contextMenuMessage by remember { mutableStateOf<UnifiedThreadItem?>(null) }
    var forwardingItem by remember { mutableStateOf<UnifiedThreadItem?>(null) }
    var fullscreenImageModel by remember { mutableStateOf<Any?>(null) }
    var showOverflowMenu by remember { mutableStateOf(false) }
    var showStickerSheet by remember { mutableStateOf(false) }
    var showStyleAndWallpaperSheet by remember { mutableStateOf(false) }
    var showCreatePollModal by remember { mutableStateOf(false) }

    // Voice Note Recorder state
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
        state.activeChatId != null -> "dm:${state.activeChatId}"
        else -> "global"
    }
    val customWallpaperUrl = remember(wallpaperScopeKey, state.dmMessages.size, state.groupMessages.size) {
        vm.cache.getWallpaperUrl(wallpaperScopeKey)
    }
    val presetWallpaper = CHAT_WALLPAPER_PRESETS.firstOrNull { "preset:${it.id}" == customWallpaperUrl }

    val knownGroupIds = remember(state.groups) { state.groups.map { it.id }.toSet() }
    val knownFriendIds = remember(state.friends) { state.friends.map { it.id }.toSet() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bgPrimary)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding() // Zero black gap between Android keyboard and message composer!
    ) {
        /* ==================== Thread Header (`.chat-header` 1:1) ==================== */
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(palette.bgSecondary)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            JaWebIconButton(
                icon = Icons.AutoMirrored.Rounded.ArrowBack,
                contentDescription = "Back",
                size = 38.dp,
                iconSize = 18.dp,
                onClick = { vm.closeActiveChat() },
            )
            Spacer(Modifier.width(10.dp))

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
                            contentDescription = "Community",
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape),
                        )
                    }
                    activeGroup != null -> {
                        if (!activeGroup.avatarUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = activeGroup.avatarUrl,
                                contentDescription = activeGroup.name,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(CircleShape),
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(CircleShape)
                                    .background(palette.bgTertiary)
                                    .border(1.dp, palette.border, CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Rounded.Groups, contentDescription = null, tint = palette.textPrimary)
                            }
                        }
                    }
                    activeFriend != null -> {
                        JaAvatar(
                            avatarUrl = activeFriend.avatarUrl,
                            displayName = activeFriend.displayName.ifBlank { activeFriend.username },
                            avatarColor = activeFriend.avatarColor,
                            size = 38.dp,
                            ringWidth = 2.5.dp,
                            presenceStatus = if (friendActivity?.online == true) friendActivity.statusPreference else "offline",
                            statusBorderColor = palette.bgSecondary,
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
                            color = palette.textPrimary,
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
                        } else if (activeFriend?.isOwner == true) {
                            Spacer(Modifier.width(4.dp))
                            OwnerCrownVectorBadge(size = 13.dp)
                        }
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
                            friendActivity.customStatus.ifBlank { "Online · @${activeFriend?.username.orEmpty()}" }
                        }
                        activeFriend != null -> "@${activeFriend.username} · End-to-End Encrypted"
                        else -> "End-to-End Encrypted"
                    }
                    Text(
                        text = subtitle,
                        color = if (subtitle.contains("typing")) palette.accent else palette.textSecondary,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            if (!isCommunity) {
                Spacer(Modifier.width(6.dp))
                JaWebIconButton(
                    icon = Icons.Rounded.Call,
                    contentDescription = "Voice Call",
                    size = 38.dp,
                    iconSize = 17.dp,
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
                    onClick = {
                        if (activeFriend != null) vm.callEngine.startDmCall(me, activeFriend, "video")
                        else if (activeGroup != null) vm.callEngine.startGroupCall(me, activeGroup, "video")
                    },
                )
            }

            Spacer(Modifier.width(6.dp))
            Box {
                JaWebIconButton(
                    icon = Icons.Rounded.MoreVert,
                    contentDescription = "More options",
                    size = 38.dp,
                    iconSize = 18.dp,
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
                        text = { Text("Bubble style & wallpaper", color = palette.textPrimary) },
                        leadingIcon = { Icon(Icons.Rounded.Palette, null, tint = palette.accent) },
                        onClick = {
                            showOverflowMenu = false
                            showStyleAndWallpaperSheet = true
                        }
                    )
                }
            }
        }

        HorizontalDivider(color = palette.border)

        /* ==================== Message List with Optional Wallpaper ==================== */
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .then(
                    if (presetWallpaper != null && presetWallpaper.colors.size >= 2) {
                        Modifier.background(Brush.verticalGradient(presetWallpaper.colors))
                    } else {
                        Modifier
                    }
                )
        ) {
            if (!customWallpaperUrl.isNullOrBlank() && !customWallpaperUrl.startsWith("preset:")) {
                AsyncImage(
                    model = customWallpaperUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    alpha = 0.34f,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            LazyColumn(
                state = listState,
                reverseLayout = true,
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(
                    items = reversedItems,
                    key = { it.id },
                ) { msg ->
                    val isMine = msg.senderId == me.id
                    SwipeableMessageRow(
                        msg = msg,
                        isMine = isMine,
                        showSenderHeader = !isMine && (isCommunity || activeGroup != null),
                        myUserId = me.id,
                        knownGroupIds = knownGroupIds,
                        knownFriendIds = knownFriendIds,
                        canManagePolls = isCommunity && state.communityPermissions.canManagePolls,
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
                        onJumpToReply = { replyId ->
                            val idx = reversedItems.indexOfFirst { it.id == replyId }
                            if (idx >= 0) {
                                scope.launch { listState.animateScrollToItem(idx) }
                            }
                        },
                        onJumpToForwarded = { fwd -> vm.jumpToForwardedSource(fwd) },
                        onVotePoll = { optIdx -> msg.poll?.let { vm.voteCommunityPoll(it.id, optIdx) } },
                        onEndPoll = { msg.poll?.let { vm.endCommunityPoll(it.id) } },
                        onOpenFullscreenImage = { model -> fullscreenImageModel = model },
                    )
                }

                if ((state.activeChatId != null && state.dmHasMore) ||
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
        if (replyingTo != null || editingTarget != null || pendingAttachmentUri != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(palette.bgSecondary)
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
                        color = palette.textSecondary,
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
                    Icon(Icons.Rounded.Close, contentDescription = "Cancel", tint = palette.textSecondary, modifier = Modifier.size(16.dp))
                }
            }
        }

        HorizontalDivider(color = palette.border)

        /* ==================== Zero-Gap Native Composer ==================== */
        if (isRecordingVoice) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(palette.bgSecondary)
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
                    color = palette.textPrimary,
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
                        .clip(CircleShape)
                        .background(palette.accent)
                        .clickable {
                            val file = recorder.stopRecording()
                            isRecordingVoice = false
                            if (file != null) {
                                vm.sendChatMessage(text = "", replyTo = replyingTo, localVoiceFile = file)
                                replyingTo = null
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = "Send voice note", tint = Color.White, modifier = Modifier.size(20.dp))
                }
            }
        } else {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(palette.bgSecondary)
                    .padding(horizontal = 10.dp, vertical = 9.dp),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                JaWebIconButton(
                    icon = Icons.Rounded.Add,
                    contentDescription = "Attach file",
                    size = 40.dp,
                    iconSize = 18.dp,
                    onClick = { attachmentLauncher.launch("*/*") },
                )
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(palette.bgTertiary)
                        .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                        .clickable { showStickerSheet = true },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "GIF",
                        color = palette.textPrimary,
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
                        onClick = { showCreatePollModal = true },
                    )
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 42.dp, max = 130.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(palette.bgTertiary)
                        .border(1.dp, palette.border, RoundedCornerShape(20.dp))
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    androidx.compose.foundation.text.BasicTextField(
                        value = draftText,
                        onValueChange = { draftText = it },
                        textStyle = TextStyle(
                            color = palette.textPrimary,
                            fontSize = 15.sp,
                        ),
                        maxLines = 5,
                        modifier = Modifier.fillMaxWidth(),
                        decorationBox = { inner ->
                            if (draftText.isEmpty()) {
                                Text(
                                    text = "Message…",
                                    color = palette.textTertiary,
                                    fontSize = 14.5.sp,
                                )
                            }
                            inner()
                        }
                    )
                }

                Spacer(Modifier.width(6.dp))

                val canSendText = draftText.isNotBlank() || pendingAttachmentUri != null
                if (canSendText) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(CircleShape)
                            .background(palette.accent)
                            .clickable {
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
                            },
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
                            .clip(CircleShape)
                            .background(palette.bgTertiary)
                            .clickable {
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
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Mic,
                            contentDescription = "Record Voice Note",
                            tint = palette.textPrimary,
                            modifier = Modifier.size(21.dp),
                        )
                    }
                }
            }
        }
    }

    /* ==================== Message Hold Context Sheet (Nav-Bar-Safe + 2+ Multi-Reactions!) ==================== */
    contextMenuMessage?.let { msg ->
        val isMine = msg.senderId == me.id
        val withinUnsendWindow = (System.currentTimeMillis() - msg.createdAt) <= UNSEND_WINDOW_MS
        val quickEmojis = listOf("❤️", "😂", "🔥", "👍", "😮", "😢", "🎉", "💯")

        ModalBottomSheet(
            onDismissRequest = { contextMenuMessage = null },
            containerColor = palette.surface,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 10.dp)
            ) {
                // Multi-reaction row: tap multiple emojis to add 2+ reactions per message!
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(palette.bgSecondary)
                        .padding(horizontal = 10.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    quickEmojis.forEach { emoji ->
                        val active = msg.reactions.any { it.userId == me.id && it.emoji == emoji }
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(if (active) palette.accentSoft else Color.Transparent)
                                .clickable {
                                    vm.toggleReaction(msg.id, emoji)
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(text = emoji, fontSize = 20.sp)
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                MessageSheetAction(Icons.AutoMirrored.Rounded.Reply, "Reply") {
                    replyingTo = ReplySummary(
                        id = msg.id,
                        senderId = msg.senderId,
                        senderName = msg.senderName,
                        body = msg.body.ifBlank { "Attachment" },
                    )
                    contextMenuMessage = null
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
                if (isMine && withinUnsendWindow) {
                    MessageSheetAction(Icons.Rounded.Undo, "Unsend for everyone", tint = palette.danger) {
                        vm.unsendMessage(msg.id)
                        contextMenuMessage = null
                    }
                }
                MessageSheetAction(Icons.Rounded.DeleteOutline, "Delete for me", tint = palette.danger) {
                    vm.deleteMessageForMe(msg.id)
                    contextMenuMessage = null
                }
                Spacer(Modifier.height(12.dp))
            }
        }
    }

    /* ==================== Forward Target Picker Modal ==================== */
    forwardingItem?.let { item ->
        ModalBottomSheet(
            onDismissRequest = { forwardingItem = null },
            containerColor = palette.surface,
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
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    vm.forwardMessageWithContext(item.body, sourceContext, targetCommunity = true)
                                    forwardingItem = null
                                }
                                .padding(vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Image(
                                painter = painterResource(id = R.drawable.jatext_logo_icon),
                                contentDescription = null,
                                modifier = Modifier.size(38.dp).clip(RoundedCornerShape(10.dp)),
                            )
                            Spacer(Modifier.width(12.dp))
                            Text("JaText Community", color = palette.textPrimary, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    items(state.groups, key = { "fwd-grp:${it.id}" }) { grp ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    vm.forwardMessageWithContext(item.body, sourceContext, targetGroupId = grp.id)
                                    forwardingItem = null
                                }
                                .padding(vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Rounded.Groups, null, tint = palette.accent, modifier = Modifier.size(36.dp))
                            Spacer(Modifier.width(12.dp))
                            Text(grp.name, color = palette.textPrimary, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    items(state.friends, key = { "fwd-fr:${it.id}" }) { fr ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    vm.forwardMessageWithContext(item.body, sourceContext, targetFriendId = fr.id)
                                    forwardingItem = null
                                }
                                .padding(vertical = 10.dp),
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

    /* ==================== Stickers & Klipy GIF Sheet ==================== */
    if (showStickerSheet) {
        var klipyQuery by remember { mutableStateOf("") }
        var klipyResults by remember { mutableStateOf<List<StickerMedia>>(emptyList()) }
        val customStickerPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri != null) vm.uploadCustomSticker(uri, "Custom Sticker")
        }

        LaunchedEffect(klipyQuery) {
            delay(260L)
            klipyResults = vm.searchKlipyStickers(klipyQuery)
        }

        ModalBottomSheet(
            onDismissRequest = { showStickerSheet = false },
            containerColor = palette.surface,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    OutlinedTextField(
                        value = klipyQuery,
                        onValueChange = { klipyQuery = it },
                        placeholder = { Text("Search Klipy stickers & GIFs…") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = { customStickerPicker.launch("image/*") },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                    ) {
                        Text("+ Upload", color = Color.White, fontSize = 12.sp)
                    }
                }
                Spacer(Modifier.height(10.dp))
                val shown = (state.stickerFavorites + state.recentStickers + klipyResults).distinctBy { it.url }
                LazyVerticalGrid(
                    columns = GridCells.Fixed(4),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.height(300.dp),
                ) {
                    items(shown, key = { it.key + it.url }) { stk ->
                        AsyncImage(
                            model = stk.previewUrl ?: stk.url,
                            contentDescription = stk.name,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .size(76.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(palette.bgSecondary)
                                .clickable {
                                    vm.sendSticker(stk)
                                    showStickerSheet = false
                                }
                                .padding(4.dp),
                        )
                    }
                }
            }
        }
    }

    /* ==================== Custom Bubble Styles (All 24!) & Wallpaper Sheet ==================== */
    if (showStyleAndWallpaperSheet) {
        val customWpLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri != null) {
                vm.setWallpaperForCurrentScope(kind = "custom", url = null, customImageUri = uri)
                showStyleAndWallpaperSheet = false
            }
        }
        ModalBottomSheet(
            onDismissRequest = { showStyleAndWallpaperSheet = false },
            containerColor = palette.surface,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 10.dp)
            ) {
                Text(
                    text = "Custom Bubble Styles (syncs across 1:1, Groups & Community)",
                    color = palette.textPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                )
                Spacer(Modifier.height(10.dp))
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.height(220.dp),
                ) {
                    items(ALL_BUBBLE_STYLE_SPECS, key = { it.id }) { spec ->
                        val selected = state.outgoingBubbleStyle == spec.id
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .then(
                                    if (spec.bgColors.size >= 2) {
                                        Modifier.background(Brush.linearGradient(spec.bgColors))
                                    } else {
                                        Modifier.background(palette.accent)
                                    }
                                )
                                .border(
                                    width = if (selected) 2.5.dp else 1.dp,
                                    color = if (selected) palette.textPrimary else palette.border,
                                    shape = RoundedCornerShape(12.dp),
                                )
                                .clickable { vm.setOutgoingBubbleStyle(spec.id) }
                                .padding(vertical = 12.dp, horizontal = 8.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = spec.label,
                                color = spec.textColor,
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                            )
                        }
                    }
                }

                if (!isCommunity) {
                    Spacer(Modifier.height(14.dp))
                    Text("Shared Chat Wallpaper", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Spacer(Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        CHAT_WALLPAPER_PRESETS.forEach { wp ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .then(
                                        if (wp.colors.size >= 2) Modifier.background(Brush.linearGradient(wp.colors))
                                        else Modifier.background(palette.bgSecondary)
                                    )
                                    .border(1.dp, palette.border, RoundedCornerShape(10.dp))
                                    .clickable {
                                        if (wp.id == "none") {
                                            vm.setWallpaperForCurrentScope("none", null)
                                        } else {
                                            vm.setWallpaperForCurrentScope("preset", "preset:${wp.id}", presetId = wp.id)
                                        }
                                        showStyleAndWallpaperSheet = false
                                    }
                                    .padding(horizontal = 12.dp, vertical = 8.dp)
                            ) {
                                Text(wp.label, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(palette.accentSoft)
                                .border(1.dp, palette.accent, RoundedCornerShape(10.dp))
                                .clickable { customWpLauncher.launch("image/*") }
                                .padding(horizontal = 12.dp, vertical = 8.dp)
                        ) {
                            Text("+ Custom Photo", color = palette.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Spacer(Modifier.height(14.dp))
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
            title = { Text("Create Community Poll", color = palette.textPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    OutlinedTextField(
                        value = question,
                        onValueChange = { question = it },
                        label = { Text("Poll Question") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    options.forEachIndexed { idx, value ->
                        OutlinedTextField(
                            value = value,
                            onValueChange = { options[idx] = it },
                            label = { Text("Option ${idx + 1}") },
                            singleLine = true,
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

/**
 * Individual message row supporting smooth left-to-right swipe-to-reply on mobile!
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SwipeableMessageRow(
    msg: UnifiedThreadItem,
    isMine: Boolean,
    showSenderHeader: Boolean,
    myUserId: String,
    knownGroupIds: Set<String>,
    knownFriendIds: Set<String>,
    canManagePolls: Boolean,
    onSwipeReply: () -> Unit,
    onLongPress: () -> Unit,
    onToggleReaction: (String) -> Unit,
    onJumpToReply: (String) -> Unit,
    onJumpToForwarded: (ForwardedMessageContext) -> Unit,
    onVotePoll: (Int) -> Unit,
    onEndPoll: () -> Unit,
    onOpenFullscreenImage: (Any) -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val scope = rememberCoroutineScope()
    val offsetX = remember { Animatable(0f) }
    var triggeredSwipe by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .pointerInput(msg.id) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        if (triggeredSwipe) {
                            onSwipeReply()
                        }
                        triggeredSwipe = false
                        scope.launch { offsetX.animateTo(0f) }
                    },
                    onDragCancel = {
                        triggeredSwipe = false
                        scope.launch { offsetX.animateTo(0f) }
                    },
                    onHorizontalDrag = { change, dragAmount ->
                        // Left-to-right swipe-to-reply!
                        val next = (offsetX.value + dragAmount).coerceIn(0f, 190f)
                        if (next > 0f) change.consume()
                        if (next >= 135f && !triggeredSwipe) {
                            triggeredSwipe = true
                        }
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
                )
                Spacer(Modifier.width(8.dp))
            }

            Column(
                horizontalAlignment = if (isMine) Alignment.End else Alignment.Start,
                modifier = Modifier.widthIn(max = 310.dp),
            ) {
                if (showSenderHeader) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(start = 4.dp, bottom = 2.dp),
                    ) {
                        Text(
                            text = msg.senderName,
                            color = palette.textSecondary,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        if (msg.senderIsOwner) {
                            Spacer(Modifier.width(4.dp))
                            OwnerCrownVectorBadge(size = 12.dp)
                        }
                    }
                }

                if (msg.unsentAt != null) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(16.dp))
                            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                            .padding(horizontal = 12.dp, vertical = 7.dp)
                    ) {
                        Text(
                            text = "Message unsent",
                            color = palette.textTertiary,
                            fontSize = 13.sp,
                            fontStyle = FontStyle.Italic,
                        )
                    }
                } else if (!msg.stickerUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = msg.stickerUrl,
                        contentDescription = "Sticker",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .size(148.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .combinedClickable(
                                onClick = { onOpenFullscreenImage(msg.stickerUrl) },
                                onLongClick = onLongPress,
                            ),
                    )
                } else {
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
                            if (msg.poll != null) {
                                CommunityPollCardUi(
                                    question = msg.body,
                                    poll = msg.poll,
                                    canManage = canManagePolls,
                                    ink = ink,
                                    onVote = onVotePoll,
                                    onEndPoll = onEndPoll,
                                )
                            } else if (msg.body.isNotBlank()) {
                                RichTextWithLinksAndMentions(
                                    text = msg.body,
                                    ink = ink,
                                    palette = palette,
                                    onLongPressMessage = onLongPress,
                                )
                            }

                            Spacer(Modifier.height(3.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.End,
                                modifier = Modifier.align(Alignment.End),
                            ) {
                                if (msg.editedAt != null) {
                                    Text(
                                        text = "edited • ",
                                        color = ink.subTextColor,
                                        fontSize = 10.sp,
                                    )
                                }
                                Text(
                                    text = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(msg.createdAt)),
                                    color = ink.subTextColor,
                                    fontSize = 10.sp,
                                )
                                if (isMine && msg.deliveryStatus != null) {
                                    Spacer(Modifier.width(4.dp))
                                    val isRead = msg.readAt != null || msg.deliveryStatus == "read"
                                    Icon(
                                        imageVector = if (isRead || msg.deliveryStatus == "delivered") {
                                            Icons.Rounded.DoneAll
                                        } else {
                                            Icons.Rounded.Done
                                        },
                                        contentDescription = if (isRead) "Read" else "Sent",
                                        tint = if (isRead) Color(0xFF38BDF8) else ink.subTextColor,
                                        modifier = Modifier.size(13.dp),
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
                )
            }
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
            .clip(RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = c, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(14.dp))
        Text(label, color = c, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}
