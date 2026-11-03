package com.ahad00010.jatext.ui.screens

import android.media.AudioManager
import android.media.MediaPlayer
import android.media.ToneGenerator
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Forward
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.draw.alpha
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
import com.ahad00010.jatext.data.BroadcastChannelSummary
import com.ahad00010.jatext.data.ChannelBroadcastPost
import com.ahad00010.jatext.data.ContactStatusStack
import com.ahad00010.jatext.data.ForwardedMessageContext
import com.ahad00010.jatext.data.StatusPrivacyDefaultState
import com.ahad00010.jatext.data.TursoApiClient
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.state.SessionUiState
import com.ahad00010.jatext.ui.components.FullscreenOverlaySlot
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.components.jaBouncyClick
import com.ahad00010.jatext.ui.theme.AVATAR_COLOR_SPECS
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import com.ahad00010.jatext.ui.theme.SfProDisplayFontFamily
import com.ahad00010.jatext.ui.theme.SfProRoundedFontFamily
import com.ahad00010.jatext.ui.theme.SfProTextFontFamily
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
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

private val BUILTIN_STATUS_TRACKS = listOf(
    BuiltinStatusTrack("none", "No music", 0),
    BuiltinStatusTrack("synth-sunrise", "Sunrise Drift · 18s", 18_000),
    BuiltinStatusTrack("synth-lofi", "Midnight Lo-Fi Loop · 25s", 25_000),
    BuiltinStatusTrack("synth-pulse", "Neon Pulse Beat · 30s", 30_000),
)

private data class SponsoredStoryInterstitial(
    val sponsor: String,
    val headline: String,
    val body: String,
    val cta: String,
    val colors: List<Color>,
)

private val SPONSORED_INTERSTITIALS = listOf(
    SponsoredStoryInterstitial(
        sponsor = "JaText Studio",
        headline = "Crystal-Clear 30s Status Audio",
        body = "Share rich 30-second audio stories and E2EE voice notes across every linked device.",
        cta = "Continue Watching",
        colors = listOf(Color(0xFF0F172A), Color(0xFF1E1B4B), Color(0xFF0F766E)),
    ),
    SponsoredStoryInterstitial(
        sponsor = "JaText Channels VIP",
        headline = "Launch Your Broadcast Channel",
        body = "Reach unlimited followers with strict subscriber identity isolation and automatic 30-day pruning.",
        cta = "Explore Channels",
        colors = listOf(Color(0xFF111827), Color(0xFF3B0764), Color(0xFFBE185D)),
    ),
)

private val QUICK_STORY_REACTIONS = listOf("❤️", "🔥", "😂", "😮", "😢", "👏", "💯", "🎉")
private val CHANNEL_POST_REACTIONS = listOf("❤️", "🔥", "👍", "🎉", "😮", "🚀")

private fun parseHexBgColor(hex: String, fallback: Color = Color(0xFF0F766E)): Color {
    val clean = hex.trim().removePrefix("#")
    return runCatching {
        when (clean.length) {
            6 -> Color(("FF$clean").toLong(16))
            8 -> Color(clean.toLong(16))
            else -> fallback
        }
    }.getOrDefault(fallback)
}

private fun formatRelativeStatusTime(ts: Long): String {
    if (ts <= 0L) return "Just now"
    val diffSec = ((System.currentTimeMillis() - ts) / 1000L).coerceAtLeast(0L)
    if (diffSec < 45L) return "Just now"
    val diffMin = diffSec / 60L
    if (diffMin < 60L) return if (diffMin == 1L) "1 minute ago" else "$diffMin minutes ago"
    val calNow = Calendar.getInstance()
    val calTs = Calendar.getInstance().apply { timeInMillis = ts }
    val timeFmt = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(ts))
    return if (
        calNow.get(Calendar.YEAR) == calTs.get(Calendar.YEAR) &&
        calNow.get(Calendar.DAY_OF_YEAR) == calTs.get(Calendar.DAY_OF_YEAR)
    ) {
        "Today, $timeFmt"
    } else {
        "Yesterday, $timeFmt"
    }
}

private fun formatChannelTime(ts: Long): String {
    if (ts <= 0L) return ""
    val calNow = Calendar.getInstance()
    val calTs = Calendar.getInstance().apply { timeInMillis = ts }
    if (
        calNow.get(Calendar.YEAR) == calTs.get(Calendar.YEAR) &&
        calNow.get(Calendar.DAY_OF_YEAR) == calTs.get(Calendar.DAY_OF_YEAR)
    ) {
        return SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(ts))
    }
    val calYest = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -1) }
    if (
        calYest.get(Calendar.YEAR) == calTs.get(Calendar.YEAR) &&
        calYest.get(Calendar.DAY_OF_YEAR) == calTs.get(Calendar.DAY_OF_YEAR)
    ) {
        return "Yesterday"
    }
    return SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(ts))
}

private fun formatFollowersLabel(count: Int): String = when {
    count >= 1_000_000 -> String.format(Locale.US, "%.1fM followers", count / 1_000_000.0).replace(".0M", "M")
    count >= 1_000 -> String.format(Locale.US, "%.1fK followers", count / 1_000.0).replace(".0K", "K")
    count == 1 -> "1 follower"
    else -> "$count followers"
}

/**
 * Segmented Status Ring Avatar:
 * Programmatically splits 360 deg into N equal arc segments separated by micro-gaps.
 * Unread segments render bright high-contrast teal-green (#14D990);
 * read segments render muted gray (#8E8E93).
 */
@Composable
fun SegmentedStatusRingAvatar(
    avatarUrl: String?,
    displayName: String,
    avatarColor: String,
    avatarSize: Dp = 52.dp,
    segmentsViewed: List<Boolean>,
    showMyStatusAddBadge: Boolean = false,
) {
    val palette = LocalJaTextPalette.current
    val outerSize = avatarSize + 10.dp
    val unreadTeal = Color(0xFF14D990)
    val readGray = Color(0xFF8E8E93)

    Box(
        modifier = Modifier.size(outerSize),
        contentAlignment = Alignment.Center,
    ) {
        if (segmentsViewed.isNotEmpty()) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val strokePx = 2.6.dp.toPx()
                val count = segmentsViewed.size
                if (count == 1) {
                    drawArc(
                        color = if (segmentsViewed[0]) readGray else unreadTeal,
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
                    val sweepDeg = ((360f - count * gapDeg) / count).coerceAtLeast(4f)
                    for (i in 0 until count) {
                        val startDeg = -90f + i * (sweepDeg + gapDeg) + gapDeg / 2f
                        drawArc(
                            color = if (segmentsViewed[i]) readGray else unreadTeal,
                            startAngle = startDeg,
                            sweepAngle = sweepDeg,
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

        if (showMyStatusAddBadge) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(21.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF007AFF))
                    .border(2.dp, palette.bgSecondary, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Add,
                    contentDescription = "Add status",
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
) {
    val palette = LocalJaTextPalette.current
    val bundle = state.updatesBundle
    val me = state.me

    var searchOpen by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var plusMenuExpanded by remember { mutableStateOf(false) }
    var directorySort by remember { mutableStateOf("Most Active") }

    var showComposer by remember { mutableStateOf(false) }
    var composerInitialTextMode by remember { mutableStateOf(false) }
    var showPrivacyModal by remember { mutableStateOf(false) }
    var showCreateChannelModal by remember { mutableStateOf(false) }
    var vipPreviewChannel by remember { mutableStateOf<BroadcastChannelSummary?>(null) }
    var activeChannelReader by remember { mutableStateOf<BroadcastChannelSummary?>(null) }

    var storyViewerStacks by remember { mutableStateOf<List<ContactStatusStack>?>(null) }
    var storyViewerStartIndex by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        vm.refreshUpdatesBundle(silent = false)
        while (true) {
            delay(12_000L)
            vm.refreshUpdatesBundle(silent = true)
        }
    }

    LaunchedEffect(state.requestedChannelJumpNonce, bundle.followedChannels, bundle.directoryChannels) {
        val jumpId = state.requestedChannelJumpId
        if (!jumpId.isNullOrBlank()) {
            val found = bundle.followedChannels.firstOrNull { it.id == jumpId }
                ?: bundle.directoryChannels.firstOrNull { it.id == jumpId }
            if (found != null) {
                activeChannelReader = found
            }
        }
    }

    val myStack = remember(bundle.myStatus, me) {
        ContactStatusStack(
            userId = bundle.myStatus.userId.ifBlank { me?.id.orEmpty() },
            displayName = bundle.myStatus.displayName.ifBlank { me?.displayName.orEmpty() },
            username = bundle.myStatus.username.ifBlank { me?.username.orEmpty() },
            avatarColor = bundle.myStatus.avatarColor.ifBlank { me?.avatarColor ?: "purple" },
            avatarUrl = bundle.myStatus.avatarUrl ?: me?.avatarUrl,
            segments = bundle.myStatus.segments,
            unreadCount = 0,
            allViewed = true,
            latestAt = bundle.myStatus.latestAt,
        )
    }

    val q = searchQuery.trim().lowercase(Locale.ROOT)
    val filteredContacts = remember(bundle.contactStacks, q) {
        if (q.isEmpty()) bundle.contactStacks
        else bundle.contactStacks.filter {
            it.displayName.lowercase(Locale.ROOT).contains(q) ||
                it.username.lowercase(Locale.ROOT).contains(q)
        }
    }
    val recentStacks = remember(filteredContacts) { filteredContacts.filter { !it.allViewed } }
    val viewedStacks = remember(filteredContacts) { filteredContacts.filter { it.allViewed } }

    val followedChannels = remember(bundle.followedChannels, q) {
        if (q.isEmpty()) bundle.followedChannels
        else bundle.followedChannels.filter {
            it.name.lowercase(Locale.ROOT).contains(q) ||
                it.description.lowercase(Locale.ROOT).contains(q) ||
                it.latestSnippet.lowercase(Locale.ROOT).contains(q)
        }
    }

    val isCompactCarouselLayout = bundle.followedChannelsCount >= 1

    val sortedDirectoryChannels = remember(bundle.directoryChannels, directorySort, q) {
        val base = if (q.isEmpty()) bundle.directoryChannels else bundle.directoryChannels.filter {
            it.name.lowercase(Locale.ROOT).contains(q) ||
                it.description.lowercase(Locale.ROOT).contains(q)
        }
        when (directorySort) {
            "Popular" -> base.sortedByDescending { it.followerCount }
            "New" -> base.sortedByDescending { it.createdAt }
            else -> base.sortedWith(
                compareByDescending<BroadcastChannelSummary> { if (it.category == "Most Active") 1 else 0 }
                    .thenByDescending { it.latestPostAt },
            )
        }
    }

    val openContactStories: (String) -> Unit = { targetUserId ->
        if (targetUserId == myStack.userId) {
            if (myStack.segments.isEmpty()) {
                composerInitialTextMode = false
                showComposer = true
            } else {
                storyViewerStacks = listOf(myStack)
                storyViewerStartIndex = 0
            }
        } else {
            val ordered = recentStacks + viewedStacks
            val idx = ordered.indexOfFirst { it.userId == targetUserId }
            if (idx >= 0) {
                storyViewerStacks = ordered
                storyViewerStartIndex = idx
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
    ) {
        /* ==================== Fixed WhatsApp iOS "Updates" Header ==================== */
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Updates",
                color = if (palette.isDark) Color.White else Color.Black,
                fontSize = 31.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = SfProDisplayFontFamily,
                letterSpacing = (-0.4).sp,
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // 1. Search (magnifying glass)
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(if (searchOpen) Color(0x2814D990) else palette.bgTertiary)
                        .border(1.dp, if (searchOpen) Color(0xFF14D990) else palette.border, CircleShape)
                        .jaBouncyClick {
                            if (searchOpen) searchQuery = ""
                            searchOpen = !searchOpen
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Search,
                        contentDescription = "Search updates",
                        tint = palette.textPrimary,
                        modifier = Modifier.size(19.dp),
                    )
                }

                // 2. Camera
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(palette.bgTertiary)
                        .border(1.dp, palette.border, CircleShape)
                        .jaBouncyClick {
                            composerInitialTextMode = false
                            showComposer = true
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.CameraAlt,
                        contentDescription = "Camera status",
                        tint = palette.textPrimary,
                        modifier = Modifier.size(18.dp),
                    )
                }

                // 3. Plus (+)
                Box {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(palette.bgTertiary)
                            .border(1.dp, palette.border, CircleShape)
                            .jaBouncyClick { plusMenuExpanded = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Add,
                            contentDescription = "Create status or channel",
                            tint = palette.textPrimary,
                            modifier = Modifier.size(20.dp),
                        )
                    }

                    DropdownMenu(
                        expanded = plusMenuExpanded,
                        onDismissRequest = { plusMenuExpanded = false },
                        containerColor = palette.bgSecondary,
                    ) {
                        DropdownMenuItem(
                            text = { Text("Add photo or audio status", color = palette.textPrimary) },
                            onClick = {
                                plusMenuExpanded = false
                                composerInitialTextMode = false
                                showComposer = true
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Text status", color = palette.textPrimary) },
                            onClick = {
                                plusMenuExpanded = false
                                composerInitialTextMode = true
                                showComposer = true
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Status privacy", color = palette.textPrimary) },
                            onClick = {
                                plusMenuExpanded = false
                                showPrivacyModal = true
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Create channel", color = palette.textPrimary) },
                            onClick = {
                                plusMenuExpanded = false
                                showCreateChannelModal = true
                            },
                        )
                    }
                }
            }
        }

        AnimatedVisibility(visible = searchOpen) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(palette.bgTertiary)
                    .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                    .padding(horizontal = 12.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Search,
                    contentDescription = null,
                    tint = palette.textSecondary,
                    modifier = Modifier.size(17.dp),
                )
                Spacer(Modifier.width(8.dp))
                Box(modifier = Modifier.weight(1f)) {
                    if (searchQuery.isEmpty()) {
                        Text(
                            text = "Search status and channels...",
                            color = palette.textSecondary,
                            fontSize = 14.sp,
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
                        contentDescription = "Clear",
                        tint = palette.textSecondary,
                        modifier = Modifier
                            .size(18.dp)
                            .clickable { searchQuery = "" },
                    )
                }
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = 16.dp,
                end = 16.dp,
                top = 8.dp,
                bottom = bottomBarClearance + 20.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            /* ==================== STATUS SECTION ==================== */
            item(key = "status_hdr") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Status",
                        color = palette.textPrimary,
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = SfProDisplayFontFamily,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        SmallPillButton("Privacy") { showPrivacyModal = true }
                        SmallPillButton("Aa") {
                            composerInitialTextMode = true
                            showComposer = true
                        }
                    }
                }
            }

            if (isCompactCarouselLayout) {
                /* Condition B (followedChannelsCount >= 1): Horizontal Status Carousel */
                item(key = "status_carousel") {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        contentPadding = PaddingValues(vertical = 4.dp),
                    ) {
                        item(key = "my_carousel") {
                            Column(
                                modifier = Modifier
                                    .width(72.dp)
                                    .jaBouncyClick { openContactStories(myStack.userId) },
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                SegmentedStatusRingAvatar(
                                    avatarUrl = myStack.avatarUrl,
                                    displayName = myStack.displayName.ifBlank { "Me" },
                                    avatarColor = myStack.avatarColor,
                                    avatarSize = 54.dp,
                                    segmentsViewed = myStack.segments.map { false },
                                    showMyStatusAddBadge = myStack.segments.isEmpty(),
                                )
                                Spacer(Modifier.height(5.dp))
                                Text(
                                    text = "My Status",
                                    color = palette.textPrimary,
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }

                        items(
                            items = recentStacks + viewedStacks,
                            key = { "car_${it.userId}" },
                        ) { stack ->
                            val firstName = stack.displayName.trim().substringBefore(' ').ifBlank { stack.username }
                            Column(
                                modifier = Modifier
                                    .width(72.dp)
                                    .jaBouncyClick { openContactStories(stack.userId) },
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                SegmentedStatusRingAvatar(
                                    avatarUrl = stack.avatarUrl,
                                    displayName = stack.displayName,
                                    avatarColor = stack.avatarColor,
                                    avatarSize = 54.dp,
                                    segmentsViewed = stack.segments.map { it.viewed },
                                )
                                Spacer(Modifier.height(5.dp))
                                Text(
                                    text = firstName,
                                    color = palette.textPrimary,
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            } else {
                /* Condition A (followedChannelsCount === 0): Vertical Status List */
                item(key = "my_vertical_row") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(palette.bgTertiary)
                            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                            .jaBouncyClick { openContactStories(myStack.userId) }
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        SegmentedStatusRingAvatar(
                            avatarUrl = myStack.avatarUrl,
                            displayName = myStack.displayName.ifBlank { "Me" },
                            avatarColor = myStack.avatarColor,
                            avatarSize = 50.dp,
                            segmentsViewed = myStack.segments.map { false },
                            showMyStatusAddBadge = myStack.segments.isEmpty(),
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "My Status",
                                color = palette.textPrimary,
                                fontSize = 15.5.sp,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = if (myStack.segments.isNotEmpty()) {
                                    "${myStack.segments.size} active · ${formatRelativeStatusTime(myStack.latestAt)}"
                                } else {
                                    "Tap to add status update"
                                },
                                color = palette.textSecondary,
                                fontSize = 12.5.sp,
                            )
                        }
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(palette.bgSecondary)
                                .border(1.dp, palette.border, CircleShape)
                                .clickable {
                                    composerInitialTextMode = false
                                    showComposer = true
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Add,
                                contentDescription = "Add status",
                                tint = palette.textPrimary,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }

                if (recentStacks.isNotEmpty()) {
                    item(key = "recent_lbl") {
                        Text(
                            text = "RECENT UPDATES",
                            color = palette.textSecondary,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 4.dp, start = 4.dp),
                        )
                    }
                    items(items = recentStacks, key = { "rec_${it.userId}" }) { stack ->
                        VerticalStatusContactRow(
                            stack = stack,
                            onClick = { openContactStories(stack.userId) },
                        )
                    }
                }

                if (viewedStacks.isNotEmpty()) {
                    item(key = "viewed_lbl") {
                        Text(
                            text = "VIEWED UPDATES",
                            color = palette.textSecondary,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 4.dp, start = 4.dp),
                        )
                    }
                    items(items = viewedStacks, key = { "vwd_${it.userId}" }) { stack ->
                        VerticalStatusContactRow(
                            stack = stack,
                            onClick = { openContactStories(stack.userId) },
                        )
                    }
                }
            }

            /* ==================== CHANNELS SECTION ==================== */
            item(key = "channels_hdr") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Channels",
                        color = palette.textPrimary,
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = SfProDisplayFontFamily,
                    )
                    SmallPillButton("+ Create") { showCreateChannelModal = true }
                }
            }

            if (followedChannels.isNotEmpty()) {
                items(items = followedChannels, key = { "fol_${it.id}" }) { ch ->
                    FollowedChannelFeedCard(
                        channel = ch,
                        onClick = { activeChannelReader = ch },
                    )
                }
            } else {
                item(key = "channels_intro") {
                    Text(
                        text = "Stay updated on topics that matter. Your profile, email, username, and identity remain strictly hidden from channel admins and subscribers.",
                        color = palette.textSecondary,
                        fontSize = 13.sp,
                        lineHeight = 18.sp,
                    )
                }
            }

            /* ==================== FIND CHANNELS DIRECTORY ==================== */
            item(key = "find_channels_hdr") {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "Find channels",
                        color = palette.textPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                    ) {
                        listOf("Most Active", "Popular", "New").forEach { cat ->
                            val selected = directorySort == cat
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(if (selected) Color(0x2814D990) else palette.bgTertiary)
                                    .border(
                                        1.dp,
                                        if (selected) Color(0xFF14D990) else palette.border,
                                        RoundedCornerShape(999.dp),
                                    )
                                    .clickable { directorySort = cat }
                                    .padding(horizontal = 13.dp, vertical = 6.dp),
                            ) {
                                Text(
                                    text = cat,
                                    color = if (selected) palette.textPrimary else palette.textSecondary,
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                }
            }

            items(items = sortedDirectoryChannels, key = { "dir_${it.id}" }) { ch ->
                DirectoryChannelRow(
                    channel = ch,
                    onOpen = { activeChannelReader = ch },
                    onToggleFollow = {
                        if (!ch.followed && ch.isPremium) {
                            vipPreviewChannel = ch
                        } else {
                            vm.toggleFollowBroadcastChannel(ch.id)
                        }
                    },
                )
            }
        }
    }

    /* ==================== OVERLAYS & MODALS ==================== */
    storyViewerStacks?.let { stacks ->
        FullScreenStoryViewerOverlay(
            stacks = stacks,
            initialStackIndex = storyViewerStartIndex,
            meId = me?.id.orEmpty(),
            vm = vm,
            onClose = {
                storyViewerStacks = null
                vm.refreshUpdatesBundle(silent = true)
            },
        )
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
            initial = bundle.privacyDefault,
            onDismiss = { showPrivacyModal = false },
        )
    }

    if (showCreateChannelModal) {
        CreateBroadcastChannelDialog(
            vm = vm,
            onDismiss = { showCreateChannelModal = false },
            onCreated = { created ->
                showCreateChannelModal = false
                activeChannelReader = created
            },
        )
    }

    vipPreviewChannel?.let { vip ->
        VipChannelSubscriptionDialog(
            channel = vip,
            onDismiss = { vipPreviewChannel = null },
            onUnlock = {
                val id = vip.id
                vipPreviewChannel = null
                vm.toggleFollowBroadcastChannel(id)
            },
        )
    }

    activeChannelReader?.let { ch ->
        ChannelBroadcastReaderOverlay(
            channel = ch,
            state = state,
            vm = vm,
            onClose = {
                activeChannelReader = null
                vm.refreshUpdatesBundle(silent = true)
            },
            onToggleFollow = {
                if (!ch.followed && ch.isPremium) {
                    vipPreviewChannel = ch
                } else {
                    vm.toggleFollowBroadcastChannel(ch.id)
                    activeChannelReader = ch.copy(followed = !ch.followed)
                }
            },
        )
    }
}

@Composable
private fun SmallPillButton(label: String, onClick: () -> Unit) {
    val palette = LocalJaTextPalette.current
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(palette.bgTertiary)
            .border(1.dp, palette.border, RoundedCornerShape(999.dp))
            .jaBouncyClick(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 5.dp),
    ) {
        Text(
            text = label,
            color = palette.textPrimary,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun VerticalStatusContactRow(
    stack: ContactStatusStack,
    onClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(palette.bgTertiary)
            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
            .jaBouncyClick(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SegmentedStatusRingAvatar(
            avatarUrl = stack.avatarUrl,
            displayName = stack.displayName,
            avatarColor = stack.avatarColor,
            avatarSize = 48.dp,
            segmentsViewed = stack.segments.map { it.viewed },
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stack.displayName,
                color = palette.textPrimary,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = formatRelativeStatusTime(stack.latestAt),
                color = palette.textSecondary,
                fontSize = 12.5.sp,
            )
        }
    }
}

@Composable
private fun FollowedChannelFeedCard(
    channel: BroadcastChannelSummary,
    onClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(palette.bgTertiary)
            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
            .jaBouncyClick(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        JaAvatar(
            avatarUrl = channel.avatarUrl,
            displayName = channel.name,
            avatarColor = channel.avatarColor,
            size = 46.dp,
            ringWidth = 0.dp,
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = channel.name,
                        color = palette.textPrimary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (channel.verified) {
                        Icon(
                            imageVector = Icons.Rounded.Verified,
                            contentDescription = "Verified",
                            tint = Color(0xFF10B981),
                            modifier = Modifier.size(15.dp),
                        )
                    }
                    if (channel.isPremium) {
                        Text(
                            text = "VIP",
                            color = Color.White,
                            fontSize = 9.5.sp,
                            fontWeight = FontWeight.ExtraBold,
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(Color(0xFFD97706))
                                .padding(horizontal = 6.dp, vertical = 1.dp),
                        )
                    }
                }
                Text(
                    text = formatChannelTime(channel.latestPostAt),
                    color = palette.textSecondary,
                    fontSize = 11.5.sp,
                )
            }
            Spacer(Modifier.height(3.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = channel.latestSnippet.ifBlank { channel.description },
                    color = palette.textSecondary,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (channel.unreadCount > 0) {
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color(0xFF25D366))
                            .padding(horizontal = 7.dp, vertical = 2.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = if (channel.unreadCount > 99) "99+" else channel.unreadCount.toString(),
                            color = Color(0xFF052E16),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = SfProRoundedFontFamily,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DirectoryChannelRow(
    channel: BroadcastChannelSummary,
    onOpen: () -> Unit,
    onToggleFollow: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(15.dp))
            .background(palette.bgTertiary)
            .border(1.dp, palette.border, RoundedCornerShape(15.dp))
            .clickable(onClick = onOpen)
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        JaAvatar(
            avatarUrl = channel.avatarUrl,
            displayName = channel.name,
            avatarColor = channel.avatarColor,
            size = 44.dp,
            ringWidth = 0.dp,
        )
        Spacer(Modifier.width(11.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = channel.name,
                    color = palette.textPrimary,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (channel.verified) {
                    Icon(
                        imageVector = Icons.Rounded.Verified,
                        contentDescription = "Verified",
                        tint = Color(0xFF10B981),
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
            Text(
                text = buildString {
                    append(formatFollowersLabel(channel.followerCount))
                    if (channel.isPremium && channel.monthlyPriceLabel.isNotBlank()) {
                        append(" · ")
                        append(channel.monthlyPriceLabel)
                    }
                },
                color = palette.textSecondary,
                fontSize = 12.sp,
            )
        }
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(if (channel.followed) Color(0xFF14D990) else Color(0x2414D990))
                .border(1.dp, Color(0xFF14D990), CircleShape)
                .jaBouncyClick(onClick = onToggleFollow),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (channel.followed) Icons.Rounded.Check else Icons.Rounded.Add,
                contentDescription = if (channel.followed) "Following" else "Follow",
                tint = if (channel.followed) Color(0xFF042F2E) else Color(0xFF14D990),
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/* ==========================================================================
   Full-Screen Story Viewer State Machine (Android Compose)
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
        val target = stacks.getOrNull(initialStackIndex)
        val firstUnread = target?.segments?.indexOfFirst { !it.viewed } ?: -1
        mutableIntStateOf(if (firstUnread >= 0) firstUnread else 0)
    }

    var elapsedMs by remember { mutableLongStateOf(0L) }
    var isHoldPaused by remember { mutableStateOf(false) }
    var replyOpen by remember { mutableStateOf(false) }
    var replyText by remember { mutableStateOf("") }
    var dragOffsetY by remember { mutableFloatStateOf(0f) }
    var contactSwitchCount by remember { mutableIntStateOf(0) }
    var sponsoredAdIdx by remember { mutableStateOf<Int?>(null) }
    var pendingNextStack by remember { mutableStateOf<Int?>(null) }

    val currentStack = localStacks.getOrNull(stackIdx)
    val currentSeg = currentStack?.segments?.getOrNull(segIdx)
    val isOwnStory = currentStack?.userId == meId
    val isPaused = isHoldPaused || replyOpen

    // Mark segment viewed & mark full stack viewed on final segment
    LaunchedEffect(stackIdx, segIdx, sponsoredAdIdx) {
        if (sponsoredAdIdx == null && currentStack != null && currentSeg != null && !isOwnStory) {
            val idsToMark = if (segIdx == currentStack.segments.lastIndex) {
                currentStack.segments.map { it.id }
            } else {
                listOf(currentSeg.id)
            }
            vm.markStatusesViewed(idsToMark)
            val updatedSegs = currentStack.segments.mapIndexed { i, s ->
                if (i == segIdx || segIdx == currentStack.segments.lastIndex) s.copy(viewed = true) else s
            }
            localStacks[stackIdx] = currentStack.copy(
                segments = updatedSegs,
                allViewed = updatedSegs.all { it.viewed },
            )
        }
    }

    val advanceStack: (Int) -> Unit = { targetIdx ->
        if (targetIdx >= localStacks.size) {
            onClose()
        } else {
            val nextSwitch = contactSwitchCount + 1
            contactSwitchCount = nextSwitch
            if (nextSwitch > 0 && nextSwitch % 3 == 0) {
                pendingNextStack = targetIdx
                sponsoredAdIdx = (nextSwitch / 3 - 1) % SPONSORED_INTERSTITIALS.size
                elapsedMs = 0L
            } else {
                stackIdx = targetIdx
                val unread = localStacks[targetIdx].segments.indexOfFirst { !it.viewed }
                segIdx = if (unread >= 0) unread else 0
                elapsedMs = 0L
            }
        }
    }

    val goNext: () -> Unit = {
        if (sponsoredAdIdx != null) {
            val dest = pendingNextStack ?: (stackIdx + 1)
            sponsoredAdIdx = null
            pendingNextStack = null
            if (dest >= localStacks.size) {
                onClose()
            } else {
                stackIdx = dest
                segIdx = 0
                elapsedMs = 0L
            }
        } else if (currentStack != null) {
            if (segIdx + 1 < currentStack.segments.size) {
                segIdx += 1
                elapsedMs = 0L
            } else {
                advanceStack(stackIdx + 1)
            }
        }
    }

    val goPrev: () -> Unit = {
        if (sponsoredAdIdx != null) {
            sponsoredAdIdx = null
            pendingNextStack = null
            elapsedMs = 0L
        } else if (elapsedMs > 1_200L) {
            elapsedMs = 0L
        } else if (segIdx > 0) {
            segIdx -= 1
            elapsedMs = 0L
        } else if (stackIdx > 0) {
            stackIdx -= 1
            segIdx = (localStacks[stackIdx].segments.size - 1).coerceAtLeast(0)
            elapsedMs = 0L
        } else {
            elapsedMs = 0L
        }
    }

    // Millisecond-accurate 5,000ms timer that pauses/resumes at exact paused millisecond
    LaunchedEffect(stackIdx, segIdx, sponsoredAdIdx, isPaused) {
        if (isPaused) return@LaunchedEffect
        var lastTick = SystemClock.uptimeMillis()
        while (elapsedMs < STORY_SEGMENT_DURATION_MS) {
            delay(16L)
            val now = SystemClock.uptimeMillis()
            val dt = (now - lastTick).coerceIn(0L, 80L)
            lastTick = now
            elapsedMs += dt
        }
        goNext()
    }

    // Optional <=30s audio clip playback
    DisposableEffect(currentSeg?.id, currentSeg?.audioUrl, isPaused, sponsoredAdIdx) {
        var player: MediaPlayer? = null
        var tone: ToneGenerator? = null
        val rawAudio = currentSeg?.audioUrl.orEmpty()
        if (!isPaused && sponsoredAdIdx == null && rawAudio.isNotBlank()) {
            if (rawAudio.startsWith("builtin:")) {
                runCatching {
                    tone = ToneGenerator(AudioManager.STREAM_MUSIC, 35)
                    tone?.startTone(ToneGenerator.TONE_PROP_BEEP, 180)
                }
            } else {
                runCatching {
                    val resolved = TursoApiClient.resolveAbsoluteMediaUrl(rawAudio)
                    player = MediaPlayer().apply {
                        setDataSource(resolved)
                        setOnPreparedListener { it.start() }
                        prepareAsync()
                    }
                }
            }
        }
        onDispose {
            runCatching { player?.stop() }
            runCatching { player?.release() }
            runCatching { tone?.release() }
        }
    }

    val adCard = sponsoredAdIdx?.let { SPONSORED_INTERSTITIALS[it] }

    FullscreenOverlaySlot(
        id = "updates_story_viewer",
        secureScreen = false,
        backgroundColor = Color(0xF504060C),
        onBack = {
            if (replyOpen) replyOpen = false else onClose()
        },
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    translationY = dragOffsetY
                    val scale = (1f - dragOffsetY / 1600f).coerceIn(0.88f, 1f)
                    scaleX = scale
                    scaleY = scale
                    alpha = (1f - dragOffsetY / 450f).coerceIn(0.35f, 1f)
                },
        ) {
            // Story canvas + Gesture Detector (Left 30%, Right 30%, Long-press hold, Swipe down/up)
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        brush = if (adCard != null) {
                            Brush.linearGradient(adCard.colors)
                        } else {
                            val col = parseHexBgColor(currentSeg?.bgColor ?: "#0f766e")
                            Brush.verticalGradient(listOf(col, col.copy(alpha = 0.85f)))
                        },
                    )
                    .pointerInput(stackIdx, segIdx, sponsoredAdIdx, replyOpen) {
                        awaitEachGesture {
                            val down = awaitFirstDown(requireUnconsumed = false)
                            val startX = down.position.x
                            val startY = down.position.y
                            val downTime = SystemClock.uptimeMillis()
                            var maxDy = 0f
                            var maxDx = 0f
                            var holdActivated = false
                            var lastY = startY

                            while (true) {
                                val event = withTimeoutOrNull(185L) { awaitPointerEvent() }
                                if (event == null) {
                                    if (!replyOpen && abs(maxDy) < 18f && abs(maxDx) < 18f) {
                                        holdActivated = true
                                        isHoldPaused = true
                                    }
                                    val nextEvent = awaitPointerEvent()
                                    if (nextEvent.changes.none { it.pressed }) {
                                        break
                                    }
                                    val pos = nextEvent.changes.first().position
                                    lastY = pos.y
                                    maxDy = pos.y - startY
                                    maxDx = pos.x - startX
                                } else {
                                    if (event.changes.none { it.pressed }) {
                                        break
                                    }
                                    val pos = event.changes.first().position
                                    lastY = pos.y
                                    maxDy = pos.y - startY
                                    maxDx = pos.x - startX
                                    if (!holdActivated && maxDy > 14f && abs(maxDy) > abs(maxDx)) {
                                        dragOffsetY = maxDy.coerceAtMost(320f)
                                    }
                                }
                            }

                            val totalDy = lastY - startY
                            val pressDuration = SystemClock.uptimeMillis() - downTime
                            if (holdActivated || pressDuration >= 240L && abs(totalDy) < 24f) {
                                isHoldPaused = false
                                dragOffsetY = 0f
                            } else if (totalDy > 95f && abs(totalDy) > abs(maxDx)) {
                                dragOffsetY = 0f
                                onClose()
                            } else if (totalDy < -75f && abs(totalDy) > abs(maxDx) && !isOwnStory && adCard == null) {
                                dragOffsetY = 0f
                                replyOpen = true
                            } else {
                                dragOffsetY = 0f
                                if (replyOpen) {
                                    replyOpen = false
                                } else {
                                    val ratio = startX / size.width.coerceAtLeast(1).toFloat()
                                    if (ratio <= 0.30f) goPrev() else goNext()
                                }
                            }
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                if (adCard != null) {
                    Column(
                        modifier = Modifier.padding(horizontal = 28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = "SPONSORED",
                            color = Color(0xFFFDE68A),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        Text(
                            text = adCard.headline,
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = SfProDisplayFontFamily,
                            textAlign = TextAlign.Center,
                        )
                        Text(
                            text = adCard.body,
                            color = Color.White.copy(alpha = 0.86f),
                            fontSize = 14.5.sp,
                            textAlign = TextAlign.Center,
                        )
                    }
                } else if (currentSeg?.mediaType == "image" && currentSeg.mediaUrl.isNotBlank()) {
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
                                .padding(start = 18.dp, end = 18.dp, bottom = 94.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .background(Color(0x99000000))
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
                } else {
                    Text(
                        text = currentSeg?.caption?.ifBlank { "🎵 Audio status" }.orEmpty(),
                        color = Color.White,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .padding(horizontal = 28.dp)
                            .alpha(if (isHoldPaused) 0f else 1f),
                    )
                }
            }

            /* Top Segmented Progress Header (hidden during long-press hold) */
            AnimatedVisibility(
                visible = !isHoldPaused,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier.align(Alignment.TopCenter),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        if (adCard != null) {
                            val pct = (elapsedMs.toFloat() / STORY_SEGMENT_DURATION_MS.toFloat()).coerceIn(0f, 1f)
                            StoryProgressBarCell(progress = pct, color = Color(0xFFFBBF24), modifier = Modifier.weight(1f))
                        } else {
                            currentStack?.segments?.forEachIndexed { idx, _ ->
                                val pct = when {
                                    idx < segIdx -> 1f
                                    idx > segIdx -> 0f
                                    else -> (elapsedMs.toFloat() / STORY_SEGMENT_DURATION_MS.toFloat()).coerceIn(0f, 1f)
                                }
                                StoryProgressBarCell(progress = pct, color = Color.White, modifier = Modifier.weight(1f))
                            }
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (adCard != null) {
                            Text(
                                text = "Sponsored · ${adCard.sponsor}",
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        } else if (currentStack != null) {
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
                                            if (currentSeg?.mediaSource == "instagram") append(" · Instagram")
                                            if (currentSeg?.mediaSource == "facebook") append(" · Facebook")
                                            if (!currentSeg?.audioTitle.isNullOrBlank()) append(" · 🎵 ${currentSeg?.audioTitle}")
                                        },
                                        color = Color.White.copy(alpha = 0.78f),
                                        fontSize = 11.5.sp,
                                    )
                                }
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (adCard != null) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(Color(0x55000000))
                                        .clickable { goNext() }
                                        .padding(horizontal = 12.dp, vertical = 6.dp),
                                ) {
                                    Text("Skip", color = Color.White, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            if (isOwnStory && adCard == null && currentSeg != null) {
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
            if (adCard == null) {
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
                                Text(
                                    text = "👁 ${currentSeg?.viewCount ?: 0} views   ·   ❤️ ${currentSeg?.likeCount ?: 0} likes",
                                    color = Color.White,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
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
                                        Text(text = emoji, fontSize = 20.sp)
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
   Status Composer Dialog (Camera Roll + Instagram + Facebook + <=30s Audio + Privacy)
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
    var mediaSource by remember { mutableStateOf("camera_roll") }
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
        if (uri != null) pickedImageUri = uri
    }
    val audioLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            pickedAudioUri = uri
            selectedTrack = BUILTIN_STATUS_TRACKS.first()
        }
    }

    val regularGroups = remember(state.groups) { state.groups.filter { !it.isCommunity } }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(22.dp),
            color = palette.bgSecondary,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 640.dp),
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
                    Text("Create Status", color = palette.textPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "Close",
                        tint = palette.textSecondary,
                        modifier = Modifier.clickable { onDismiss() },
                    )
                }

                // Media Picker Sourcing: Camera Roll / Instagram / Facebook / Text
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(
                        "camera_roll" to "Camera Roll",
                        "instagram" to "Instagram",
                        "facebook" to "Facebook",
                    ).forEach { (id, label) ->
                        val active = !textOnlyMode && mediaSource == id
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (active) Color(0x2814D990) else palette.bgTertiary)
                                .border(1.dp, if (active) Color(0xFF14D990) else palette.border, RoundedCornerShape(10.dp))
                                .clickable {
                                    textOnlyMode = false
                                    mediaSource = id
                                }
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(label, color = palette.textPrimary, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                if (!textOnlyMode) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(palette.bgTertiary)
                            .border(1.dp, palette.border, RoundedCornerShape(12.dp))
                            .clickable { imageLauncher.launch("image/*") }
                            .padding(12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = when {
                                pickedImageUri != null -> "Photo selected · Tap to change"
                                mediaSource == "instagram" -> "Import photo from Instagram / Gallery"
                                mediaSource == "facebook" -> "Import photo from Facebook / Gallery"
                                else -> "Choose photo from Camera Roll"
                            },
                            color = palette.textPrimary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                // Story Preview & Caption Input
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(parseHexBgColor(bgHex))
                        .padding(14.dp),
                ) {
                    if (caption.isEmpty()) {
                        Text("Write a status update or caption...", color = Color.White.copy(alpha = 0.7f), fontSize = 15.sp)
                    }
                    BasicTextField(
                        value = caption,
                        onValueChange = { if (it.length <= 700) caption = it },
                        cursorBrush = SolidColor(Color.White),
                        textStyle = TextStyle(color = Color.White, fontSize = 15.5.sp, fontFamily = SfProTextFontFamily),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 68.dp),
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    STATUS_BG_COLORS.forEach { hex ->
                        Box(
                            modifier = Modifier
                                .size(24.dp)
                                .clip(CircleShape)
                                .background(parseHexBgColor(hex))
                                .border(2.dp, if (bgHex == hex) Color.White else Color.Transparent, CircleShape)
                                .clickable { bgHex = hex },
                        )
                    }
                }

                // Audio / Music (strictly <= 30s)
                Text("Audio / Music (max 30s)", color = palette.textSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
                        label = if (pickedAudioUri != null) "🎵 Uploaded clip" else "Upload <=30s audio",
                        selected = pickedAudioUri != null,
                        onClick = { audioLauncher.launch("audio/*") },
                    )
                }

                // Private @mentions
                if (state.friends.isNotEmpty()) {
                    Text("Private @mentions", color = palette.textSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
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

                // Immutable Per-Post Audience Privacy
                Text("Audience (immutable once posted)", color = palette.textSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
                            .background(Color(0xFF14D990))
                            .clickable(enabled = !submitting) {
                                if (caption.isBlank() && pickedImageUri == null && pickedAudioUri == null && selectedTrack.id == "none") {
                                    errorMsg = "Add text, a photo, or an audio clip first."
                                    return@clickable
                                }
                                if (privacyType == "GROUP_EXCLUSIVE" && groupId.isBlank()) {
                                    errorMsg = "Select a group for Group Exclusive status."
                                    return@clickable
                                }
                                submitting = true
                                errorMsg = null
                                vm.publishStatusPost(
                                    imageUri = pickedImageUri,
                                    audioUri = pickedAudioUri,
                                    builtinAudioId = selectedTrack.id,
                                    builtinAudioTitle = selectedTrack.title,
                                    builtinAudioDurationMs = selectedTrack.durationMs,
                                    caption = caption,
                                    bgColor = bgHex,
                                    mediaSource = mediaSource,
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
                            .padding(horizontal = 18.dp, vertical = 10.dp),
                    ) {
                        Text(
                            text = if (submitting) "Posting..." else "Post Status",
                            color = Color(0xFF042F2E),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                        )
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
            .background(if (selected) Color(0x2814D990) else palette.bgTertiary)
            .border(1.dp, if (selected) Color(0xFF14D990) else palette.border, RoundedCornerShape(999.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 6.dp),
    ) {
        Text(label, color = palette.textPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun StatusPrivacyDefaultDialog(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    initial: StatusPrivacyDefaultState,
    onDismiss: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    var privacyType by remember { mutableStateOf(initial.privacyType.ifBlank { "MY_CONTACTS" }) }
    val excludedIds = remember { mutableStateListOf<String>().apply { addAll(initial.excludedIds) } }
    val includedIds = remember { mutableStateListOf<String>().apply { addAll(initial.includedIds) } }
    var groupId by remember { mutableStateOf(initial.groupId) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(22.dp), color = palette.bgSecondary) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("Status Privacy", color = palette.textPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text(
                    text = "Changes to default privacy apply only to future statuses and never alter statuses already posted.",
                    color = palette.textSecondary,
                    fontSize = 12.5.sp,
                )
                listOf(
                    "MY_CONTACTS" to "My contacts",
                    "CONTACTS_EXCEPT" to "My contacts except...",
                    "ONLY_SHARE_WITH" to "Only share with...",
                    "GROUP_EXCLUSIVE" to "Group exclusive",
                ).forEach { (id, title) ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(palette.bgTertiary)
                            .border(1.dp, if (privacyType == id) Color(0xFF14D990) else palette.border, RoundedCornerShape(12.dp))
                            .clickable { privacyType = id }
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(title, color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        if (privacyType == id) {
                            Icon(Icons.Rounded.Check, contentDescription = null, tint = Color(0xFF14D990))
                        }
                    }
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
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
                        Text("Done", color = Color(0xFF042F2E), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun CreateBroadcastChannelDialog(
    vm: JaTextSessionViewModel,
    onDismiss: () -> Unit,
    onCreated: (BroadcastChannelSummary) -> Unit,
) {
    val palette = LocalJaTextPalette.current
    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var avatarColor by remember { mutableStateOf(AVATAR_COLOR_SPECS.getOrNull(3)?.id ?: "purple") }
    var isPremium by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(22.dp), color = palette.bgSecondary) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("Create Channel", color = palette.textPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text(
                    text = "Follower emails, usernames, photos, and IDs remain strictly private. Broadcasts auto-prune after 30 days.",
                    color = palette.textSecondary,
                    fontSize = 12.5.sp,
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(palette.bgTertiary)
                        .border(1.dp, palette.border, RoundedCornerShape(12.dp))
                        .padding(12.dp),
                ) {
                    if (name.isEmpty()) Text("Channel name", color = palette.textSecondary, fontSize = 14.sp)
                    BasicTextField(
                        value = name,
                        onValueChange = { name = it },
                        singleLine = true,
                        cursorBrush = SolidColor(if (palette.isDark) Color.White else Color(0xFF111318)),
                        textStyle = TextStyle(color = palette.textPrimary, fontSize = 14.5.sp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(palette.bgTertiary)
                        .border(1.dp, palette.border, RoundedCornerShape(12.dp))
                        .padding(12.dp),
                ) {
                    if (description.isEmpty()) Text("Channel description", color = palette.textSecondary, fontSize = 14.sp)
                    BasicTextField(
                        value = description,
                        onValueChange = { description = it },
                        cursorBrush = SolidColor(if (palette.isDark) Color.White else Color(0xFF111318)),
                        textStyle = TextStyle(color = palette.textPrimary, fontSize = 14.sp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                SmallChoiceChip(
                    label = if (isPremium) "VIP Subscription Hook ($2.99/mo) · ON" else "Enable VIP Subscription Hook",
                    selected = isPremium,
                    onClick = { isPremium = !isPremium },
                )
                errorMsg?.let { Text(it, color = Color(0xFFEF4444), fontSize = 12.5.sp) }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFF14D990))
                            .clickable {
                                vm.createNewBroadcastChannel(
                                    name = name,
                                    description = description,
                                    avatarColor = avatarColor,
                                    isPremium = isPremium,
                                    monthlyPriceLabel = "$2.99/mo",
                                    onCreated = onCreated,
                                    onError = { errorMsg = it },
                                )
                            }
                            .padding(horizontal = 18.dp, vertical = 9.dp),
                    ) {
                        Text("Create", color = Color(0xFF042F2E), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun VipChannelSubscriptionDialog(
    channel: BroadcastChannelSummary,
    onDismiss: () -> Unit,
    onUnlock: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(22.dp), color = palette.bgSecondary) {
            Column(
                modifier = Modifier.padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                JaAvatar(
                    avatarUrl = channel.avatarUrl,
                    displayName = channel.name,
                    avatarColor = channel.avatarColor,
                    size = 56.dp,
                    ringWidth = 0.dp,
                )
                Text(channel.name, color = palette.textPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text(
                    text = "${channel.monthlyPriceLabel.ifBlank { "$2.99/mo" }} · VIP Channel Preview",
                    color = Color(0xFFFBBF24),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = channel.description,
                    color = palette.textSecondary,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF14D990))
                        .clickable { onUnlock() }
                        .padding(vertical = 11.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Activate Free Preview & Follow", color = Color(0xFF042F2E), fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

/* ==========================================================================
   Channel Broadcast Reader & Forward Attribution Binding
   ========================================================================== */

@Composable
private fun ChannelBroadcastReaderOverlay(
    channel: BroadcastChannelSummary,
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    onClose: () -> Unit,
    onToggleFollow: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    var posts by remember { mutableStateOf<List<ChannelBroadcastPost>>(emptyList()) }
    var draft by remember { mutableStateOf("") }
    var forwardingPost by remember { mutableStateOf<ChannelBroadcastPost?>(null) }

    val reload: () -> Unit = {
        vm.loadBroadcastChannelPosts(channel.id) { res ->
            posts = res.posts
        }
    }

    LaunchedEffect(channel.id) {
        reload()
    }

    FullscreenOverlaySlot(
        id = "channel_reader_${channel.id}",
        secureScreen = false,
        backgroundColor = palette.bgPrimary,
        onBack = onClose,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(palette.bgSecondary)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = "Back",
                    tint = palette.textPrimary,
                    modifier = Modifier
                        .size(28.dp)
                        .clickable { onClose() },
                )
                JaAvatar(
                    avatarUrl = channel.avatarUrl,
                    displayName = channel.name,
                    avatarColor = channel.avatarColor,
                    size = 38.dp,
                    ringWidth = 0.dp,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(channel.name, color = palette.textPrimary, fontSize = 15.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                        if (channel.verified) {
                            Icon(Icons.Rounded.Verified, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(14.dp))
                        }
                    }
                    Text(
                        text = "${formatFollowersLabel(channel.followerCount)} · Private identity",
                        color = palette.textSecondary,
                        fontSize = 11.5.sp,
                    )
                }
                SmallPillButton(if (channel.followed) "Following" else "Follow") {
                    onToggleFollow()
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0x1A14D990))
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(Icons.Rounded.Lock, contentDescription = null, tint = Color(0xFF14D990), modifier = Modifier.size(14.dp))
                Text(
                    text = "Strict Identity Isolation: Your email, username, photo, and ID are hidden from admins and subscribers. Posts prune after 30 days.",
                    color = palette.textSecondary,
                    fontSize = 11.sp,
                    lineHeight = 15.sp,
                )
            }

            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(items = posts, key = { it.id }) { post ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(palette.bgTertiary)
                            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                            .padding(13.dp),
                        verticalArrangement = Arrangement.spacedBy(9.dp),
                    ) {
                        Text(post.body, color = palette.textPrimary, fontSize = 14.5.sp, lineHeight = 20.sp)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                CHANNEL_POST_REACTIONS.forEach { em ->
                                    val cnt = post.reactions.firstOrNull { it.emoji == em }?.count ?: 0
                                    val mine = post.myEmoji == em
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(999.dp))
                                            .background(if (mine) Color(0x2814D990) else palette.bgSecondary)
                                            .border(1.dp, if (mine) Color(0xFF14D990) else palette.border, RoundedCornerShape(999.dp))
                                            .clickable { vm.reactToChannelBroadcast(post.id, em) { reload() } }
                                            .padding(horizontal = 7.dp, vertical = 3.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(em, fontSize = 12.sp)
                                        if (cnt > 0) {
                                            Spacer(Modifier.width(3.dp))
                                            Text(cnt.toString(), color = palette.textSecondary, fontSize = 11.sp)
                                        }
                                    }
                                }
                            }
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Rounded.Forward,
                                    contentDescription = "Forward channel broadcast",
                                    tint = palette.accent,
                                    modifier = Modifier
                                        .size(20.dp)
                                        .clickable { forwardingPost = post },
                                )
                                Text(formatChannelTime(post.createdAt), color = palette.textSecondary, fontSize = 11.sp)
                            }
                        }
                    }
                }
            }

            if (channel.isOwner) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(palette.bgSecondary)
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(999.dp))
                            .background(palette.bgTertiary)
                            .border(1.dp, palette.border, RoundedCornerShape(999.dp))
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    ) {
                        if (draft.isEmpty()) {
                            Text("Broadcast an update...", color = palette.textSecondary, fontSize = 14.sp)
                        }
                        BasicTextField(
                            value = draft,
                            onValueChange = { draft = it },
                            singleLine = true,
                            cursorBrush = SolidColor(if (palette.isDark) Color.White else Color(0xFF111318)),
                            textStyle = TextStyle(color = palette.textPrimary, fontSize = 14.5.sp),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color(0xFF14D990))
                            .clickable {
                                if (draft.isNotBlank()) {
                                    val text = draft
                                    draft = ""
                                    vm.publishChannelBroadcast(channel.id, text) { reload() }
                                }
                            }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                    ) {
                        Text("Broadcast", color = Color(0xFF042F2E), fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                    }
                }
            }
        }

        // Forward with Immutable Channel Attribution Picker
        forwardingPost?.let { post ->
            Dialog(onDismissRequest = { forwardingPost = null }) {
                Surface(shape = RoundedCornerShape(20.dp), color = palette.bgSecondary) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = "Forward with \"${channel.name}\" attribution",
                            color = palette.textPrimary,
                            fontSize = 15.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        val attributionCtx = ForwardedMessageContext(
                            v = 1,
                            sourceKind = "channel",
                            sourceLabel = if (channel.verified) "Channel · ${channel.name} ✓" else "Channel · ${channel.name}",
                            originalMessageId = post.id,
                            originalCreatedAt = post.createdAt,
                            originalSenderId = channel.id,
                            originalSenderName = channel.name,
                            originalSenderUsername = channel.handle,
                            originalSenderAvatarColor = channel.avatarColor,
                            originalSenderAvatarUrl = channel.avatarUrl,
                            channelId = channel.id,
                            channelName = channel.name,
                            channelVerified = channel.verified,
                        )
                        state.friends.take(6).forEach { fr ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(palette.bgTertiary)
                                    .clickable {
                                        forwardingPost = null
                                        vm.forwardMessageWithContext(
                                            plainBody = post.body,
                                            contextCard = attributionCtx,
                                            targetFriendId = fr.id,
                                        )
                                    }
                                    .padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                JaAvatar(fr.avatarUrl, fr.displayName, fr.avatarColor, 30.dp, 0.dp)
                                Text(fr.displayName, color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        state.groups.take(4).forEach { grp ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(palette.bgTertiary)
                                    .clickable {
                                        forwardingPost = null
                                        vm.forwardMessageWithContext(
                                            plainBody = post.body,
                                            contextCard = attributionCtx,
                                            targetGroupId = grp.id,
                                        )
                                    }
                                    .padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("👥 ${grp.name}", color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }
        }
    }
}
