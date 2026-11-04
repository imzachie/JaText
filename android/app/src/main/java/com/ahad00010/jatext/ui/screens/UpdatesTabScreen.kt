package com.ahad00010.jatext.ui.screens

import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import com.ahad00010.jatext.data.ContactStatusStack
import com.ahad00010.jatext.data.StatusPrivacyDefaultState
import com.ahad00010.jatext.data.TursoApiClient
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.state.SessionUiState
import com.ahad00010.jatext.ui.components.FullscreenOverlaySlot
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.components.jaBouncyClick
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import com.ahad00010.jatext.ui.theme.SfProRoundedFontFamily
import com.ahad00010.jatext.ui.theme.SfProTextFontFamily
import kotlin.math.abs
import kotlinx.coroutines.delay

private const val STORY_SEGMENT_DURATION_MS = 5_000L

private val STATUS_BG_COLORS = listOf(
    "#0f766e",
    "#7c3aed",
    "#1d4ed8",
    "#be185d",
    "#b45309",
    "#111827",
    "#047857",
    "#9333ea",
)

private data class BuiltinStatusTrack(
    val id: String,
    val title: String,
    val durationMs: Int,
)

/**
 * The Status music library. The placeholder tones are gone: this is a real
 * track served by the same origin as the API, and uploading your own clip is
 * always available as the other option.
 */
private val BUILTIN_STATUS_TRACKS = listOf(
    BuiltinStatusTrack("none", "No Music", 0),
    BuiltinStatusTrack("melly_mike", "Melly Mike - Young Black & Rich", 24_960),
)

@Composable
private fun StoryMetricRow(views: Int, likes: Int) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        StoryMetric(
            icon = com.ahad00010.jatext.R.drawable.ic_jt_views,
            label = "$views views",
        )
        Spacer(Modifier.width(18.dp))
        StoryMetric(
            icon = com.ahad00010.jatext.R.drawable.ic_jt_likes,
            label = "$likes likes",
        )
    }
}

@Composable
private fun StoryMetric(icon: Int, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            painter = androidx.compose.ui.res.painterResource(id = icon),
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(15.dp),
        )
        Spacer(Modifier.width(5.dp))
        Text(
            text = label,
            color = Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

private val QUICK_STORY_REACTIONS = listOf("❤️", "🔥", "😂", "😮", "😢", "👏")

/**
 * The reaction is still sent as the emoji it has always been, so stored
 * messages and older clients are unaffected. This only decides what the
 * button looks like, which keeps the row consistent with the rest of the
 * vector icons instead of depending on the emoji font.
 */
private fun storyReactionIcon(emoji: String): Int? = when (emoji) {
    "❤️" -> com.ahad00010.jatext.R.drawable.ic_jt_likes
    "🔥" -> com.ahad00010.jatext.R.drawable.ic_jt_flame
    "😂" -> com.ahad00010.jatext.R.drawable.ic_jt_laugh
    "😮" -> com.ahad00010.jatext.R.drawable.ic_jt_wow
    "😢" -> com.ahad00010.jatext.R.drawable.ic_jt_sad
    "👏" -> com.ahad00010.jatext.R.drawable.ic_jt_clap
    else -> null
}

private fun formatRelativeStatusTime(ts: Long): String {
    if (ts <= 0L) return "Just now"
    val diffSec = ((System.currentTimeMillis() - ts) / 1000L).coerceAtLeast(0L)
    if (diffSec < 45L) return "Just now"
    val diffMin = diffSec / 60L
    if (diffMin < 60L) return "${diffMin}m ago"
    val diffHr = diffMin / 60L
    if (diffHr < 24L) return "${diffHr}h ago"
    return "Yesterday"
}

private fun parseHexBgColor(hex: String): Color {
    return try {
        Color(android.graphics.Color.parseColor(hex))
    } catch (_: Throwable) {
        Color(0xFF0F766E)
    }
}

/**
 * Segmented Status Ring Avatar:
 * Programmatically splits 360 degrees into N equal arcs separated by micro-gaps.
 * Unread segments render bright teal-green (#14D990); read segments render muted gray (#8E8E93).
 */
@Composable
fun SegmentedStatusRingAvatar(
    avatarUrl: String?,
    displayName: String,
    avatarColor: String,
    avatarSize: Dp = 50.dp,
    segmentViewedFlags: List<Boolean>,
    showAddBadge: Boolean = false,
    badgeBorderColor: Color = Color(0xFF10131C),
    onClick: () -> Unit = {},
) {
    val outerSize = avatarSize + 10.dp
    val unreadColor = Color(0xFF14D990)
    val readColor = Color(0xFF8E8E93)

    Box(
        modifier = Modifier
            .size(outerSize)
            .jaBouncyClick(pressedScale = 0.93f) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        if (segmentViewedFlags.isNotEmpty()) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val strokePx = 2.8.dp.toPx()
                val count = segmentViewedFlags.size
                if (count == 1) {
                    drawArc(
                        color = if (segmentViewedFlags[0]) readColor else unreadColor,
                        startAngle = -90f,
                        sweepAngle = 360f,
                        useCenter = false,
                        style = Stroke(width = strokePx, cap = StrokeCap.Round),
                    )
                } else {
                    val gapDeg = when {
                        count <= 4 -> 9f
                        count <= 8 -> 6.5f
                        else -> 4.5f
                    }
                    val sweep = ((360f - count * gapDeg) / count).coerceAtLeast(4f)
                    for (i in 0 until count) {
                        val start = -90f + i * (sweep + gapDeg) + gapDeg / 2f
                        drawArc(
                            color = if (segmentViewedFlags[i]) readColor else unreadColor,
                            startAngle = start,
                            sweepAngle = sweep,
                            useCenter = false,
                            style = Stroke(width = strokePx, cap = StrokeCap.Round),
                        )
                    }
                }
            }
        }

        JaAvatar(
            avatarUrl = avatarUrl,
            displayName = displayName,
            avatarColor = avatarColor,
            size = avatarSize,
            ringWidth = 0.dp,
        )

        if (showAddBadge) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(21.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF0EA5E9))
                    .border(2.5.dp, badgeBorderColor, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Add,
                    contentDescription = "Add to My Status",
                    tint = Color.White,
                    modifier = Modifier.size(13.dp),
                )
            }
        }
    }
}

@Composable
fun UpdatesTabScreen(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    bottomBarClearance: Dp,
    openComposerNonce: Int = 0,
    modifier: Modifier = Modifier,
) {
    val palette = LocalJaTextPalette.current
    val me = state.me ?: return
    val bundle = state.updatesBundle

    var searchQuery by remember { mutableStateOf("") }
    var showComposer by remember { mutableStateOf(false) }
    var composerInitialTextMode by remember { mutableStateOf(false) }
    var showPrivacyModal by remember { mutableStateOf(false) }

    var viewerStacks by remember { mutableStateOf<List<ContactStatusStack>?>(null) }
    var viewerInitialIndex by remember { mutableIntStateOf(0) }

    var handledComposerNonce by remember { mutableIntStateOf(openComposerNonce) }
    LaunchedEffect(openComposerNonce) {
        if (openComposerNonce > handledComposerNonce) {
            handledComposerNonce = openComposerNonce
            composerInitialTextMode = false
            showComposer = true
        }
    }

    LaunchedEffect(Unit) {
        vm.refreshUpdatesBundle(silent = false)
        while (true) {
            delay(12_000L)
            vm.refreshUpdatesBundle(silent = true)
        }
    }

    val mySegments = bundle.myStatus.segments
    val myOwnStack = remember(me, mySegments) {
        if (mySegments.isEmpty()) {
            null
        } else {
            ContactStatusStack(
                userId = me.id,
                displayName = me.displayName,
                username = me.username,
                avatarColor = me.avatarColor,
                avatarUrl = me.avatarUrl,
                segments = mySegments,
                unreadCount = 0,
                allViewed = true,
                latestAt = mySegments.lastOrNull()?.createdAt ?: System.currentTimeMillis(),
            )
        }
    }

    val filteredContactStacks = remember(bundle.contactStacks, searchQuery) {
        val q = searchQuery.trim().lowercase()
        if (q.isEmpty()) bundle.contactStacks
        else bundle.contactStacks.filter {
            it.displayName.lowercase().contains(q) || it.username.lowercase().contains(q)
        }
    }
    val recentStacks = remember(filteredContactStacks) { filteredContactStacks.filter { !it.allViewed } }
    val viewedStacks = remember(filteredContactStacks) { filteredContactStacks.filter { it.allViewed } }

    fun openContactStory(userId: String) {
        val ordered = recentStacks + viewedStacks
        val idx = ordered.indexOfFirst { it.userId == userId }
        if (idx >= 0) {
            viewerStacks = ordered
            viewerInitialIndex = idx
        }
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        /* Search Bar matching Chats & Communities */
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(palette.bgTertiary)
                .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                .padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Rounded.Search,
                contentDescription = null,
                tint = palette.textSecondary,
                modifier = Modifier.size(18.dp),
            )
            Box(modifier = Modifier.weight(1f)) {
                if (searchQuery.isEmpty()) {
                    Text(
                        text = "Search status updates",
                        color = palette.textSecondary,
                        fontSize = 14.sp,
                        fontFamily = SfProTextFontFamily,
                    )
                }
                BasicTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    singleLine = true,
                    cursorBrush = SolidColor(if (palette.isDark) Color.White else Color(0xFF111318)),
                    textStyle = TextStyle(
                        color = palette.textPrimary,
                        fontSize = 14.5.sp,
                        fontFamily = SfProTextFontFamily,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (searchQuery.isNotEmpty()) {
                Icon(
                    imageVector = Icons.Rounded.Close,
                    contentDescription = "Clear search",
                    tint = palette.textSecondary,
                    modifier = Modifier
                        .size(18.dp)
                        .clickable { searchQuery = "" },
                )
            }
        }

        /* Quick Action Pills: Photo Status + Text Status + Privacy */
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0x2614D990))
                    .border(1.dp, Color(0xFF14D990), RoundedCornerShape(999.dp))
                    .jaBouncyClick {
                        composerInitialTextMode = false
                        showComposer = true
                    }
                    .padding(horizontal = 13.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.CameraAlt,
                    contentDescription = null,
                    tint = Color(0xFF14D990),
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = "Photo Status",
                    color = palette.textPrimary,
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.Bold,
                )
            }

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(palette.bgTertiary)
                    .border(1.dp, palette.border, RoundedCornerShape(999.dp))
                    .jaBouncyClick {
                        composerInitialTextMode = true
                        showComposer = true
                    }
                    .padding(horizontal = 13.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = "Aa",
                    color = palette.accent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    text = "Text Status",
                    color = palette.textPrimary,
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.Bold,
                )
            }

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(palette.bgTertiary)
                    .border(1.dp, palette.border, RoundedCornerShape(999.dp))
                    .jaBouncyClick { showPrivacyModal = true }
                    .padding(horizontal = 12.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Lock,
                    contentDescription = null,
                    tint = palette.textSecondary,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = "Privacy",
                    color = palette.textPrimary,
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        /* Status List */
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentPadding = PaddingValues(bottom = bottomBarClearance + 24.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item(key = "my_status_card") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(palette.bgTertiary)
                        .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .jaBouncyClick(pressedScale = 0.98f) {
                                if (myOwnStack != null) {
                                    viewerStacks = listOf(myOwnStack)
                                    viewerInitialIndex = 0
                                } else {
                                    composerInitialTextMode = false
                                    showComposer = true
                                }
                            },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        SegmentedStatusRingAvatar(
                            avatarUrl = me.avatarUrl,
                            displayName = me.displayName,
                            avatarColor = me.avatarColor,
                            avatarSize = 50.dp,
                            segmentViewedFlags = mySegments.map { false },
                            showAddBadge = mySegments.isEmpty(),
                            badgeBorderColor = palette.bgTertiary,
                            onClick = {
                                if (myOwnStack != null) {
                                    viewerStacks = listOf(myOwnStack)
                                    viewerInitialIndex = 0
                                } else {
                                    composerInitialTextMode = false
                                    showComposer = true
                                }
                            },
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "My Status",
                                color = palette.textPrimary,
                                fontSize = 15.5.sp,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = if (mySegments.isNotEmpty()) {
                                    "${mySegments.size} active ${if (mySegments.size == 1) "post" else "posts"} · ${formatRelativeStatusTime(bundle.myStatus.latestAt)}"
                                } else {
                                    "Tap to add a photo or text status"
                                },
                                color = palette.textSecondary,
                                fontSize = 13.sp,
                            )
                        }
                    }

                    Box(
                        modifier = Modifier
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(Color(0x2614D990))
                            .border(1.dp, Color(0xFF14D990), CircleShape)
                            .jaBouncyClick {
                                composerInitialTextMode = false
                                showComposer = true
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Add,
                            contentDescription = "Add new status",
                            tint = Color(0xFF14D990),
                            modifier = Modifier.size(19.dp),
                        )
                    }
                }
            }

            if (recentStacks.isNotEmpty()) {
                item(key = "status_recent_hdr") {
                    Text(
                        text = "RECENT UPDATES",
                        color = palette.textSecondary,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 4.dp, top = 8.dp, bottom = 2.dp),
                    )
                }
                items(recentStacks, key = { "rec_${it.userId}" }) { st ->
                    VerticalStatusRow(
                        stack = st,
                        badgeBorderColor = palette.bgSecondary,
                        onClick = { openContactStory(st.userId) },
                    )
                }
            }

            if (viewedStacks.isNotEmpty()) {
                item(key = "status_viewed_hdr") {
                    Text(
                        text = "VIEWED UPDATES",
                        color = palette.textSecondary,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 4.dp, top = 8.dp, bottom = 2.dp),
                    )
                }
                items(viewedStacks, key = { "vwd_${it.userId}" }) { st ->
                    VerticalStatusRow(
                        stack = st,
                        badgeBorderColor = palette.bgSecondary,
                        onClick = { openContactStory(st.userId) },
                    )
                }
            }

            if (!state.updatesLoading && recentStacks.isEmpty() && viewedStacks.isEmpty()) {
                item(key = "status_empty_note") {
                    Text(
                        text = "Status updates from your contacts disappear automatically after 24 hours.",
                        color = palette.textSecondary,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 22.dp),
                    )
                }
            }
        }
    }

    if (showComposer) {
        StatusComposerDialog(
            state = state,
            vm = vm,
            initialTextMode = composerInitialTextMode,
            privacyDefault = bundle.privacyDefault,
            onDismiss = { showComposer = false },
        )
    }

    if (showPrivacyModal) {
        StatusPrivacyDefaultDialog(
            state = state,
            vm = vm,
            current = bundle.privacyDefault,
            onDismiss = { showPrivacyModal = false },
        )
    }

    viewerStacks?.let { stacksToView ->
        FullScreenStoryViewerOverlay(
            stacks = stacksToView,
            initialStackIndex = viewerInitialIndex,
            meId = me.id,
            vm = vm,
            onClose = {
                viewerStacks = null
                vm.refreshUpdatesBundle(silent = true)
            },
        )
    }
}

@Composable
private fun VerticalStatusRow(
    stack: ContactStatusStack,
    badgeBorderColor: Color,
    onClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .jaBouncyClick(pressedScale = 0.98f) { onClick() }
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SegmentedStatusRingAvatar(
            avatarUrl = stack.avatarUrl,
            displayName = stack.displayName,
            avatarColor = stack.avatarColor,
            avatarSize = 50.dp,
            segmentViewedFlags = stack.segments.map { it.viewed },
            showAddBadge = false,
            badgeBorderColor = badgeBorderColor,
            onClick = onClick,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stack.displayName,
                color = palette.textPrimary,
                fontSize = 15.5.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = buildString {
                    if (stack.unreadCount > 0) append("${stack.unreadCount} new · ")
                    append(formatRelativeStatusTime(stack.latestAt))
                },
                color = palette.textSecondary,
                fontSize = 13.sp,
            )
        }
    }
}

/* ==========================================================================
   Full-Screen Story Viewer Overlay
   ========================================================================== */

@Composable
fun FullScreenStoryViewerOverlay(
    stacks: List<ContactStatusStack>,
    initialStackIndex: Int,
    meId: String,
    vm: JaTextSessionViewModel,
    onClose: () -> Unit,
) {
    val localStacks = remember(stacks) { mutableStateListOf<ContactStatusStack>().apply { addAll(stacks) } }
    var stackIdx by remember { mutableIntStateOf(initialStackIndex.coerceIn(0, (stacks.size - 1).coerceAtLeast(0))) }
    var segIdx by remember {
        val st = stacks.getOrNull(initialStackIndex)
        val firstUnread = st?.segments?.indexOfFirst { !it.viewed } ?: -1
        mutableIntStateOf(if (firstUnread >= 0) firstUnread else 0)
    }

    var elapsedMs by remember { mutableLongStateOf(0L) }
    var isHoldPaused by remember { mutableStateOf(false) }
    var replyOpen by remember { mutableStateOf(false) }
    var replyText by remember { mutableStateOf("") }
    var dragOffsetY by remember { mutableFloatStateOf(0f) }

    val currentStack = localStacks.getOrNull(stackIdx)
    val currentSeg = currentStack?.segments?.getOrNull(segIdx)
    val isOwnStory = currentStack?.userId == meId
    val effectivePaused = isHoldPaused || replyOpen

    LaunchedEffect(stackIdx, segIdx) {
        val seg = localStacks.getOrNull(stackIdx)?.segments?.getOrNull(segIdx) ?: return@LaunchedEffect
        if (!isOwnStory && !seg.viewed) {
            val st = localStacks[stackIdx]
            val updatedSegs = st.segments.mapIndexed { idx, s -> if (idx == segIdx) s.copy(viewed = true) else s }
            localStacks[stackIdx] = st.copy(
                segments = updatedSegs,
                allViewed = updatedSegs.all { it.viewed },
                unreadCount = updatedSegs.count { !it.viewed },
            )
            vm.markStatusesViewed(listOf(seg.id))
        }
    }

    fun goNext() {
        val st = localStacks.getOrNull(stackIdx) ?: run {
            onClose()
            return
        }
        if (segIdx + 1 < st.segments.size) {
            segIdx += 1
            elapsedMs = 0L
            return
        }
        if (stackIdx + 1 < localStacks.size) {
            val nextIdx = stackIdx + 1
            val nextSt = localStacks[nextIdx]
            val unread = nextSt.segments.indexOfFirst { !it.viewed }
            stackIdx = nextIdx
            segIdx = if (unread >= 0) unread else 0
            elapsedMs = 0L
            return
        }
        onClose()
    }

    fun goPrev() {
        if (segIdx > 0) {
            segIdx -= 1
            elapsedMs = 0L
            return
        }
        if (stackIdx > 0) {
            val prevIdx = stackIdx - 1
            stackIdx = prevIdx
            segIdx = (localStacks[prevIdx].segments.size - 1).coerceAtLeast(0)
            elapsedMs = 0L
        } else {
            elapsedMs = 0L
        }
    }

    LaunchedEffect(stackIdx, segIdx, effectivePaused) {
        var prevTick = SystemClock.uptimeMillis()
        while (true) {
            delay(16L)
            val now = SystemClock.uptimeMillis()
            val dt = (now - prevTick).coerceIn(0L, 80L)
            prevTick = now
            if (!effectivePaused) {
                elapsedMs += dt
                if (elapsedMs >= STORY_SEGMENT_DURATION_MS) {
                    goNext()
                    break
                }
            }
        }
    }

    DisposableEffect(currentSeg?.id, currentSeg?.audioUrl) {
        var player: MediaPlayer? = null
        val audioUrl = currentSeg?.audioUrl.orEmpty()
        if (audioUrl.startsWith("builtin:")) {
            // Legacy placeholder tone from before the real music library. There
            // is nothing to play for those old posts any more.
        } else if (audioUrl.isNotBlank()) {
            runCatching {
                val resolved = TursoApiClient.resolveAbsoluteMediaUrl(audioUrl)
                player = MediaPlayer().apply {
                    setDataSource(resolved)
                    setOnPreparedListener { mp -> runCatching { mp.start() } }
                    prepareAsync()
                }
            }
        }
        onDispose {
            runCatching { player?.stop() }
            runCatching { player?.release() }
            Unit
        }
    }

    if (currentStack == null || currentSeg == null) return

    FullscreenOverlaySlot(
        id = "updates-story-viewer",
        onBack = {
            if (replyOpen) replyOpen = false else onClose()
        },
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xF504060B))
                .graphicsLayer {
                    translationY = dragOffsetY.coerceAtLeast(0f)
                    val s = (1f - (dragOffsetY.coerceAtLeast(0f) / 1600f)).coerceIn(0.88f, 1f)
                    scaleX = s
                    scaleY = s
                },
        ) {
            /* Main Gesture & Visual Stage */
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        if (currentSeg?.mediaType == "image") Color(0xFF05070B)
                        else parseHexBgColor(currentSeg?.bgColor ?: "#0f766e"),
                    )
                    .pointerInput(stackIdx, segIdx, replyOpen) {
                        if (replyOpen) return@pointerInput
                        awaitEachGesture {
                            val down = awaitFirstDown(requireUnconsumed = false)
                            val startPos = down.position
                            var wasHold = false
                            var curPos = startPos

                            val firstStep = withTimeoutOrNull(185L) {
                                var p = startPos
                                while (true) {
                                    val ev = awaitPointerEvent()
                                    val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                                    p = ch.position
                                    if (!ch.pressed) return@withTimeoutOrNull p to false
                                    if ((p - startPos).getDistance() > 26f) return@withTimeoutOrNull p to true
                                }
                                p to false
                            }

                            if (firstStep == null) {
                                wasHold = true
                                isHoldPaused = true
                                while (true) {
                                    val ev = awaitPointerEvent()
                                    val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                                    if (!ch.pressed) break
                                }
                                isHoldPaused = false
                                dragOffsetY = 0f
                            } else {
                                curPos = firstStep.first
                                var stillDown = firstStep.second
                                while (stillDown) {
                                    val ev = awaitPointerEvent()
                                    val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                                    curPos = ch.position
                                    val dy = curPos.y - startPos.y
                                    val dx = curPos.x - startPos.x
                                    if (dy > 0f && abs(dy) > abs(dx)) {
                                        dragOffsetY = dy.coerceAtMost(320f)
                                    }
                                    if (!ch.pressed) stillDown = false
                                }
                                val dx = curPos.x - startPos.x
                                val dy = curPos.y - startPos.y
                                dragOffsetY = 0f

                                if (!wasHold) {
                                    when {
                                        dy > 140f && abs(dy) > abs(dx) -> onClose()
                                        dy < -120f && abs(dy) > abs(dx) && !isOwnStory -> {
                                            replyOpen = true
                                        }
                                        abs(dx) > 120f && abs(dx) > abs(dy) -> {
                                            if (dx < 0f && stackIdx + 1 < localStacks.size) {
                                                stackIdx += 1
                                                segIdx = 0
                                                elapsedMs = 0L
                                            } else if (dx > 0f && stackIdx > 0) {
                                                stackIdx -= 1
                                                segIdx = 0
                                                elapsedMs = 0L
                                            }
                                        }
                                        else -> {
                                            val widthPx = size.width.coerceAtLeast(1)
                                            if (curPos.x <= widthPx * 0.30f) {
                                                goPrev()
                                            } else {
                                                goNext()
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                if (currentSeg != null) {
                    if (currentSeg.mediaUrl.isNotBlank()) {
                        AsyncImage(
                            model = TursoApiClient.resolveAbsoluteMediaUrl(currentSeg.mediaUrl),
                            contentDescription = currentSeg.caption,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize(),
                        )
                        if (currentSeg.caption.isNotBlank() && !isHoldPaused) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomCenter)
                                    .padding(start = 18.dp, end = 18.dp, bottom = 98.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(Color(0x9E000000))
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                            ) {
                                Text(
                                    text = currentSeg.caption,
                                    color = Color.White,
                                    fontSize = 15.sp,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                    } else if (currentSeg.caption.isNotBlank()) {
                        Text(
                            text = currentSeg.caption,
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = SfProRoundedFontFamily,
                            textAlign = TextAlign.Center,
                            lineHeight = 32.sp,
                            modifier = Modifier.padding(horizontal = 28.dp),
                        )
                    } else {
                        // An audio status with no caption used to fall back to
                        // an emoji note. The track name next to the real icon
                        // matches the rest of the viewer.
                        Row(
                            modifier = Modifier.padding(horizontal = 28.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                painter = androidx.compose.ui.res.painterResource(
                                    id = com.ahad00010.jatext.R.drawable.ic_jt_music_note,
                                ),
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(24.dp),
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                text = currentSeg.audioTitle.ifBlank { "Audio Status" },
                                color = Color.White,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.ExtraBold,
                                fontFamily = SfProRoundedFontFamily,
                                textAlign = TextAlign.Center,
                                lineHeight = 32.sp,
                            )
                        }
                    }
                }
            }

            /* Top Segmented Progress Bar + Author Chrome */
            AnimatedVisibility(
                visible = !isHoldPaused,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                listOf(Color(0xB8000000), Color.Transparent),
                            ),
                        )
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        val segs = currentStack?.segments.orEmpty()
                        segs.forEachIndexed { idx, _ ->
                            val frac = when {
                                idx < segIdx -> 1f
                                idx > segIdx -> 0f
                                else -> (elapsedMs.toFloat() / STORY_SEGMENT_DURATION_MS.toFloat()).coerceIn(0f, 1f)
                            }
                            StoryProgressBarCell(
                                progress = frac,
                                color = Color.White,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (currentStack != null) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.weight(1f),
                            ) {
                                JaAvatar(
                                    avatarUrl = currentStack.avatarUrl,
                                    displayName = currentStack.displayName,
                                    avatarColor = currentStack.avatarColor,
                                    size = 36.dp,
                                    ringWidth = 0.dp,
                                )
                                Column {
                                    Text(
                                        text = if (isOwnStory) "My Status" else currentStack.displayName,
                                        color = Color.White,
                                        fontSize = 14.5.sp,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(
                                        text = buildString {
                                            append(formatRelativeStatusTime(currentSeg?.createdAt ?: 0L))
                                            if (!currentSeg?.audioTitle.isNullOrBlank()) {
                                                append(" · \u266A ${currentSeg?.audioTitle}")
                                            }
                                        },
                                        color = Color.White.copy(alpha = 0.78f),
                                        fontSize = 11.5.sp,
                                    )
                                }
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (isOwnStory && currentSeg != null) {
                                Icon(
                                    imageVector = Icons.Rounded.Delete,
                                    contentDescription = "Delete status",
                                    tint = Color(0xFFFCA5A5),
                                    modifier = Modifier
                                        .size(34.dp)
                                        .clip(CircleShape)
                                        .background(Color(0x55000000))
                                        .clickable {
                                            vm.deleteStatusSegment(currentSeg.id)
                                            onClose()
                                        }
                                        .padding(7.dp),
                                )
                            }
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = "Close",
                                tint = Color.White,
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(Color(0x55000000))
                                    .clickable { onClose() }
                                    .padding(7.dp),
                            )
                        }
                    }
                }
            }

            /* Bottom Reply / Quick Reactions / Interactive Heart Like */
            AnimatedVisibility(
                visible = !isHoldPaused,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .imePadding(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (isOwnStory) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            StoryMetricRow(
                                views = currentSeg?.viewCount ?: 0,
                                likes = currentSeg?.likeCount ?: 0,
                            )
                        }
                    } else if (replyOpen && currentStack != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceEvenly,
                        ) {
                            QUICK_STORY_REACTIONS.forEach { emoji ->
                                Box(
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .background(Color(0x33FFFFFF))
                                        .clickable {
                                            vm.sendStoryDirectReply(
                                                targetUserId = currentStack.userId,
                                                storyCaption = currentSeg?.caption.orEmpty(),
                                                replyBody = emoji,
                                            )
                                            replyOpen = false
                                        }
                                        .padding(8.dp),
                                ) {
                                    val icon = storyReactionIcon(emoji)
                                    if (icon != null) {
                                        Icon(
                                            painter = androidx.compose.ui.res.painterResource(id = icon),
                                            contentDescription = emoji,
                                            tint = Color.White,
                                            modifier = Modifier.size(22.dp),
                                        )
                                    } else {
                                        Text(text = emoji, fontSize = 20.sp)
                                    }
                                }
                            }
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(Color(0x99000000))
                                    .border(1.dp, Color(0x55FFFFFF), RoundedCornerShape(999.dp))
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                            ) {
                                if (replyText.isEmpty()) {
                                    Text(
                                        text = "Reply to ${currentStack.displayName}...",
                                        color = Color.White.copy(alpha = 0.65f),
                                        fontSize = 14.sp,
                                    )
                                }
                                BasicTextField(
                                    value = replyText,
                                    onValueChange = { replyText = it },
                                    singleLine = true,
                                    cursorBrush = SolidColor(Color.White),
                                    textStyle = TextStyle(color = Color.White, fontSize = 14.5.sp),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .size(42.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFF14D990))
                                    .clickable {
                                        if (replyText.isNotBlank()) {
                                            vm.sendStoryDirectReply(
                                                targetUserId = currentStack.userId,
                                                storyCaption = currentSeg?.caption.orEmpty(),
                                                replyBody = replyText,
                                            )
                                            replyText = ""
                                            replyOpen = false
                                        }
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Rounded.Send,
                                    contentDescription = "Send reply",
                                    tint = Color(0xFF042F2E),
                                    modifier = Modifier.size(19.dp),
                                )
                            }
                        }
                    } else if (currentStack != null && currentSeg != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(Color(0x29FFFFFF))
                                    .border(1.dp, Color(0x45FFFFFF), RoundedCornerShape(999.dp))
                                    .clickable { replyOpen = true }
                                    .padding(horizontal = 16.dp, vertical = 11.dp),
                            ) {
                                Text(
                                    text = "Reply to ${currentStack.displayName.substringBefore(' ')}...",
                                    color = Color.White.copy(alpha = 0.9f),
                                    fontSize = 14.sp,
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(CircleShape)
                                    .background(Color(0x29FFFFFF))
                                    .border(
                                        1.dp,
                                        if (currentSeg.liked) Color(0xFFEF4444) else Color(0x45FFFFFF),
                                        CircleShape,
                                    )
                                    .jaBouncyClick {
                                        val nextLiked = !currentSeg.liked
                                        localStacks[stackIdx] = currentStack.copy(
                                            segments = currentStack.segments.mapIndexed { j, sg ->
                                                if (j == segIdx) sg.copy(liked = nextLiked) else sg
                                            },
                                        )
                                        vm.toggleStatusSegmentLike(currentSeg.id)
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = if (currentSeg.liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                                    contentDescription = "Like status",
                                    tint = if (currentSeg.liked) Color(0xFFEF4444) else Color.White,
                                    modifier = Modifier.size(22.dp),
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
private fun StoryProgressBarCell(
    progress: Float,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .height(3.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(Color.White.copy(alpha = 0.30f)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(progress.coerceIn(0f, 1f))
                .background(color),
        )
    }
}

/* ==========================================================================
   Status Composer Dialog (Photo / Camera Roll with Live Image Preview + Text + <=30s Audio + Privacy)
   ========================================================================== */

@Composable
private fun StatusComposerDialog(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    initialTextMode: Boolean,
    privacyDefault: StatusPrivacyDefaultState,
    onDismiss: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    var textOnlyMode by remember { mutableStateOf(initialTextMode) }
    var caption by remember { mutableStateOf("") }
    var bgHex by remember { mutableStateOf(STATUS_BG_COLORS.first()) }
    var pickedImageUri by remember { mutableStateOf<Uri?>(null) }
    var pickedAudioUri by remember { mutableStateOf<Uri?>(null) }
    var selectedTrack by remember { mutableStateOf(BUILTIN_STATUS_TRACKS.first()) }

    var privacyType by remember { mutableStateOf(privacyDefault.privacyType.ifBlank { "MY_CONTACTS" }) }
    val excludedIds = remember { mutableStateListOf<String>().apply { addAll(privacyDefault.excludedIds) } }
    val includedIds = remember { mutableStateListOf<String>().apply { addAll(privacyDefault.includedIds) } }
    var groupId by remember { mutableStateOf(privacyDefault.groupId) }
    val mentionedIds = remember { mutableStateListOf<String>() }

    var submitting by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    val imageLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            pickedImageUri = uri
            textOnlyMode = false
            errorMsg = null
        }
    }
    val audioLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            pickedAudioUri = uri
            selectedTrack = BUILTIN_STATUS_TRACKS.first()
            errorMsg = null
        }
    }

    val regularGroups = remember(state.groups) { state.groups.filter { !it.isCommunity } }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(22.dp),
            color = palette.bgSecondary,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 660.dp),
        ) {
            Column(
                modifier = Modifier
                    .padding(16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "New Status Update",
                        color = palette.textPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "Close",
                        tint = palette.textSecondary,
                        modifier = Modifier.clickable { onDismiss() },
                    )
                }

                /* Clean 2-Tab Mode Toggle: Photo / Camera Roll vs Text Status */
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (!textOnlyMode) Color(0x2814D990) else palette.bgTertiary)
                            .border(1.dp, if (!textOnlyMode) Color(0xFF14D990) else palette.border, RoundedCornerShape(10.dp))
                            .clickable { textOnlyMode = false }
                            .padding(vertical = 9.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "Photo / Camera Roll",
                            color = palette.textPrimary,
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (textOnlyMode) Color(0x2814D990) else palette.bgTertiary)
                            .border(1.dp, if (textOnlyMode) Color(0xFF14D990) else palette.border, RoundedCornerShape(10.dp))
                            .clickable {
                                textOnlyMode = true
                                pickedImageUri = null
                            }
                            .padding(vertical = 9.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "Text Status",
                            color = palette.textPrimary,
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }

                if (!textOnlyMode) {
                    if (pickedImageUri != null) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(210.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color(0xFF070A10))
                                .border(1.dp, palette.border, RoundedCornerShape(16.dp)),
                        ) {
                            AsyncImage(
                                model = pickedImageUri,
                                contentDescription = "Selected photo",
                                contentScale = ContentScale.Fit,
                                modifier = Modifier.fillMaxSize(),
                            )
                            Row(
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .padding(8.dp),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(Color(0xCC060912))
                                        .border(1.dp, Color(0x45FFFFFF), RoundedCornerShape(999.dp))
                                        .clickable { imageLauncher.launch("image/*") }
                                        .padding(horizontal = 10.dp, vertical = 5.dp),
                                ) {
                                    Text("Change", color = Color.White, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                                }
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(Color(0xCC060912))
                                        .border(1.dp, Color(0x45FFFFFF), RoundedCornerShape(999.dp))
                                        .clickable { pickedImageUri = null }
                                        .padding(horizontal = 10.dp, vertical = 5.dp),
                                ) {
                                    Text("Remove", color = Color(0xFFFCA5A5), fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    } else {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(palette.bgTertiary)
                                .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                                .clickable { imageLauncher.launch("image/*") }
                                .padding(vertical = 22.dp, horizontal = 14.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.CameraAlt,
                                contentDescription = null,
                                tint = Color(0xFF14D990),
                                modifier = Modifier.size(26.dp),
                            )
                            Text(
                                text = "Choose Photo from Camera Roll",
                                color = palette.textPrimary,
                                fontSize = 13.5.sp,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = "Disappears automatically after 24 hours",
                                color = palette.textSecondary,
                                fontSize = 11.5.sp,
                            )
                        }
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(palette.bgTertiary)
                            .border(1.dp, palette.border, RoundedCornerShape(12.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                    ) {
                        if (caption.isEmpty()) {
                            Text(
                                text = "Add a caption (optional)...",
                                color = palette.textSecondary,
                                fontSize = 14.sp,
                            )
                        }
                        BasicTextField(
                            value = caption,
                            onValueChange = { if (it.length <= 700) caption = it },
                            cursorBrush = SolidColor(if (palette.isDark) Color.White else Color(0xFF111318)),
                            textStyle = TextStyle(
                                color = palette.textPrimary,
                                fontSize = 14.5.sp,
                                fontFamily = SfProTextFontFamily,
                            ),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(parseHexBgColor(bgHex))
                            .padding(16.dp),
                    ) {
                        if (caption.isEmpty()) {
                            Text(
                                text = "Type what is on your mind...",
                                color = Color.White.copy(alpha = 0.72f),
                                fontSize = 16.sp,
                            )
                        }
                        BasicTextField(
                            value = caption,
                            onValueChange = { if (it.length <= 700) caption = it },
                            cursorBrush = SolidColor(Color.White),
                            textStyle = TextStyle(
                                color = Color.White,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = SfProTextFontFamily,
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 84.dp),
                        )
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        STATUS_BG_COLORS.forEach { hex ->
                            Box(
                                modifier = Modifier
                                    .size(26.dp)
                                    .clip(CircleShape)
                                    .background(parseHexBgColor(hex))
                                    .border(2.dp, if (bgHex == hex) Color.White else Color.Transparent, CircleShape)
                                    .clickable { bgHex = hex },
                            )
                        }
                    }
                }

                /* Optional Audio / Music (strictly <= 30s) */
                Text(
                    text = "Music / Audio (optional, max 30s)",
                    color = palette.textSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                ) {
                    BUILTIN_STATUS_TRACKS.forEach { tr ->
                        val active = pickedAudioUri == null && selectedTrack.id == tr.id
                        SmallChoiceChip(
                            label = tr.title,
                            selected = active,
                            onClick = {
                                pickedAudioUri = null
                                selectedTrack = tr
                            },
                        )
                    }
                    SmallChoiceChip(
                        label = if (pickedAudioUri != null) "Uploaded clip" else "Upload Audio",
                        selected = pickedAudioUri != null,
                        onClick = { audioLauncher.launch("audio/*") },
                    )
                }

                /* Optional @mentions */
                if (state.friends.isNotEmpty()) {
                    Text(
                        text = "Mention friends (optional)",
                        color = palette.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                    ) {
                        state.friends.forEach { fr ->
                            val active = mentionedIds.contains(fr.id)
                            SmallChoiceChip(
                                label = "@${fr.username}",
                                selected = active,
                                onClick = {
                                    if (active) mentionedIds.remove(fr.id) else mentionedIds.add(fr.id)
                                },
                            )
                        }
                    }
                }

                /* Who can see this status */
                Text(
                    text = "Who can see this status",
                    color = palette.textSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                ) {
                    listOf(
                        "MY_CONTACTS" to "My Contacts",
                        "CONTACTS_EXCEPT" to "Contacts Except",
                        "ONLY_SHARE_WITH" to "Only Share With",
                        "GROUP_EXCLUSIVE" to "Group Exclusive",
                    ).forEach { (id, label) ->
                        SmallChoiceChip(
                            label = label,
                            selected = privacyType == id,
                            onClick = { privacyType = id },
                        )
                    }
                }

                if (privacyType == "CONTACTS_EXCEPT" && state.friends.isNotEmpty()) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                    ) {
                        state.friends.forEach { fr ->
                            val ex = excludedIds.contains(fr.id)
                            SmallChoiceChip(
                                label = "Hide: ${fr.displayName}",
                                selected = ex,
                                onClick = { if (ex) excludedIds.remove(fr.id) else excludedIds.add(fr.id) },
                            )
                        }
                    }
                }

                if (privacyType == "ONLY_SHARE_WITH" && state.friends.isNotEmpty()) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                    ) {
                        state.friends.forEach { fr ->
                            val inc = includedIds.contains(fr.id)
                            SmallChoiceChip(
                                label = fr.displayName,
                                selected = inc,
                                onClick = { if (inc) includedIds.remove(fr.id) else includedIds.add(fr.id) },
                            )
                        }
                    }
                }

                if (privacyType == "GROUP_EXCLUSIVE" && regularGroups.isNotEmpty()) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                    ) {
                        regularGroups.forEach { grp ->
                            SmallChoiceChip(
                                label = grp.name,
                                selected = groupId == grp.id,
                                onClick = { groupId = grp.id },
                            )
                        }
                    }
                }

                errorMsg?.let {
                    Text(it, color = Color(0xFFEF4444), fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .clickable { onDismiss() }
                            .padding(horizontal = 14.dp, vertical = 9.dp),
                    ) {
                        Text("Cancel", color = palette.textSecondary, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFF14D990))
                            .clickable(enabled = !submitting) {
                                val effectiveImage = if (textOnlyMode) null else pickedImageUri
                                if (!textOnlyMode && effectiveImage == null && caption.isBlank()) {
                                    errorMsg = "Choose a photo from Camera Roll or switch to Text Status."
                                    return@clickable
                                }
                                if (textOnlyMode && caption.isBlank() && pickedAudioUri == null && selectedTrack.id == "none") {
                                    errorMsg = "Write a status message first."
                                    return@clickable
                                }
                                if (privacyType == "GROUP_EXCLUSIVE" && groupId.isBlank()) {
                                    errorMsg = "Select a group for Group Exclusive status."
                                    return@clickable
                                }
                                submitting = true
                                errorMsg = null
                                vm.publishStatusPost(
                                    imageUri = effectiveImage,
                                    audioUri = pickedAudioUri,
                                    builtinAudioId = selectedTrack.id,
                                    builtinAudioTitle = selectedTrack.title,
                                    builtinAudioDurationMs = selectedTrack.durationMs,
                                    caption = caption,
                                    bgColor = bgHex,
                                    privacyType = privacyType,
                                    excludedIds = excludedIds.toList(),
                                    includedIds = includedIds.toList(),
                                    groupId = groupId.ifBlank { null },
                                    mentionedIds = mentionedIds.toList(),
                                    onSuccess = {
                                        submitting = false
                                        onDismiss()
                                    },
                                    onError = { err ->
                                        submitting = false
                                        errorMsg = err
                                    },
                                )
                            }
                            .padding(horizontal = 18.dp, vertical = 9.dp),
                    ) {
                        Text(
                            text = if (submitting) "Posting..." else "Post Status",
                            color = Color(0xFF042F2E),
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusPrivacyDefaultDialog(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    current: StatusPrivacyDefaultState,
    onDismiss: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    var privacyType by remember { mutableStateOf(current.privacyType.ifBlank { "MY_CONTACTS" }) }
    val excludedIds = remember { mutableStateListOf<String>().apply { addAll(current.excludedIds) } }
    val includedIds = remember { mutableStateListOf<String>().apply { addAll(current.includedIds) } }
    var groupId by remember { mutableStateOf(current.groupId) }
    val regularGroups = remember(state.groups) { state.groups.filter { !it.isCommunity } }

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(22.dp), color = palette.bgSecondary) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "Default Status Privacy",
                    color = palette.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "Changes apply to future status posts. Active status posts keep the privacy chosen when they were posted.",
                    color = palette.textSecondary,
                    fontSize = 12.5.sp,
                )

                listOf(
                    "MY_CONTACTS" to "My Contacts",
                    "CONTACTS_EXCEPT" to "My Contacts Except...",
                    "ONLY_SHARE_WITH" to "Only Share With...",
                    "GROUP_EXCLUSIVE" to "Group Exclusive",
                ).forEach { (id, label) ->
                    SmallChoiceChip(
                        label = label,
                        selected = privacyType == id,
                        onClick = { privacyType = id },
                    )
                }

                if (privacyType == "CONTACTS_EXCEPT" && state.friends.isNotEmpty()) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                    ) {
                        state.friends.forEach { fr ->
                            val ex = excludedIds.contains(fr.id)
                            SmallChoiceChip(
                                label = "Hide: ${fr.displayName}",
                                selected = ex,
                                onClick = { if (ex) excludedIds.remove(fr.id) else excludedIds.add(fr.id) },
                            )
                        }
                    }
                }

                if (privacyType == "ONLY_SHARE_WITH" && state.friends.isNotEmpty()) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                    ) {
                        state.friends.forEach { fr ->
                            val inc = includedIds.contains(fr.id)
                            SmallChoiceChip(
                                label = fr.displayName,
                                selected = inc,
                                onClick = { if (inc) includedIds.remove(fr.id) else includedIds.add(fr.id) },
                            )
                        }
                    }
                }

                if (privacyType == "GROUP_EXCLUSIVE" && regularGroups.isNotEmpty()) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                    ) {
                        regularGroups.forEach { g ->
                            SmallChoiceChip(
                                label = g.name,
                                selected = groupId == g.id,
                                onClick = { groupId = g.id },
                            )
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFF14D990))
                            .clickable {
                                vm.saveStatusDefaultPrivacy(
                                    privacyType = privacyType,
                                    excludedIds = excludedIds.toList(),
                                    includedIds = includedIds.toList(),
                                    groupId = groupId.ifBlank { null },
                                    onSaved = onDismiss,
                                )
                            }
                            .padding(horizontal = 18.dp, vertical = 9.dp),
                    ) {
                        Text("Save Default", color = Color(0xFF042F2E), fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun SmallChoiceChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (selected) Color(0x2B14D990) else palette.bgTertiary)
            .border(1.dp, if (selected) Color(0xFF14D990) else palette.border, RoundedCornerShape(999.dp))
            .clickable { onClick() }
            .padding(horizontal = 11.dp, vertical = 6.dp),
    ) {
        Text(
            text = label,
            color = palette.textPrimary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
