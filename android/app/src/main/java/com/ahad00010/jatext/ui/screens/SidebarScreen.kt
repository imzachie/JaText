package com.ahad00010.jatext.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.CallMade
import androidx.compose.material.icons.rounded.CallReceived
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.ExitToApp
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.NotificationsOff
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.Unarchive
import androidx.compose.material.icons.rounded.UnfoldMore
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import com.ahad00010.jatext.R
import com.ahad00010.jatext.data.CallHistoryEntry
import com.ahad00010.jatext.data.ChatPreview
import com.ahad00010.jatext.data.GroupSummary
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.OFFICIAL_COMMUNITY_ID
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.state.SessionUiState
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.components.JaGroupAvatar
import com.ahad00010.jatext.ui.components.JaOfficialBadge
import com.ahad00010.jatext.ui.components.JaTabItem
import com.ahad00010.jatext.ui.components.JaVerifiedBadge
import com.ahad00010.jatext.ui.components.JaWebDangerButton
import com.ahad00010.jatext.ui.components.JaWebGhostButton
import com.ahad00010.jatext.ui.components.JaWebIconButton
import com.ahad00010.jatext.ui.components.JaWebInput
import com.ahad00010.jatext.ui.components.JaWebPrimaryButton
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.navigation.IosAddNavIcon
import com.kyant.backdrop.navigation.IosCallsNavIcon
import com.kyant.backdrop.navigation.IosChatsNavIcon
import com.kyant.backdrop.navigation.IosSettingsGearIcon
import com.kyant.backdrop.navigation.LiquidBottomTab
import com.kyant.backdrop.navigation.LiquidBottomTabs
import com.kyant.backdrop.navigation.LocalLiquidBottomTabContentColor
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

private val BOTTOM_NAV_TAB_IDS = listOf("chats", "calls", "add", "settings")

private sealed interface SidebarHoldTarget {
    data object Community : SidebarHoldTarget
    data class Dm(val friend: JaUser, val preview: ChatPreview?) : SidebarHoldTarget
    data class Group(val group: GroupSummary) : SidebarHoldTarget
}

private fun currentDayPartLabel(): String {
    val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    return when {
        h in 5..11 -> "morning"
        h in 12..16 -> "afternoon"
        h in 17..21 -> "evening"
        else -> "night"
    }
}

/**
 * Main screen with iOS 26 Liquid Glass bottom navigation bar (`Chats`, `Calls`, `Add`, `Settings`)
 * powered by Kyant0/AndroidLiquidGlass (`com.kyant.backdrop`).
 */
@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SidebarScreen(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    onOpenSettings: () -> Unit,
    onOpenProfile: (JaUser) -> Unit = {},
    onInstallUpdate: () -> Unit = {},
) {
    val palette = LocalJaTextPalette.current
    val me = state.me

    var activeTab by remember { mutableStateOf("chats") } // "chats" | "calls" | "add" | "settings"
    var settingsSubOverlayOpen by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var showArchived by remember { mutableStateOf(false) }
    var addUsername by remember { mutableStateOf("") }
    var showAccountSwitcher by remember { mutableStateOf(false) }
    var showCreateGroupDialog by remember { mutableStateOf(false) }
    var holdTarget by remember { mutableStateOf<SidebarHoldTarget?>(null) }

    BackHandler(enabled = activeTab != "chats" && !settingsSubOverlayOpen) {
        activeTab = "chats"
    }

    // 2-step Owner Group Deletion confirmation state
    var ownerDeleteTarget by remember { mutableStateOf<GroupSummary?>(null) }
    var ownerDeleteStep by remember { mutableIntStateOf(1) }
    var ownerDeleteTypedName by remember { mutableStateOf("") }

    val previewByFriend = remember(state.previews) { state.previews.associateBy { it.friendId } }
    val activityByFriend = remember(state.friendActivities) { state.friendActivities.associateBy { it.userId } }
    val typingDmSenders = remember(state.dmMessages, state.friendActivities) { emptySet<String>() }

    val archivedCount = remember(state.friends, state.previews, state.groups) {
        val dmArch = state.friends.count { previewByFriend[it.id]?.isArchived == true }
        val grpArch = state.groups.count { it.isArchived }
        dmArch + grpArch
    }

    val totalUnreadCount = remember(
        state.friends,
        state.previews,
        state.groups,
        state.communityUnreadCount,
        state.communityMuted,
        state.activeChatId,
        state.activeGroupId,
    ) {
        var total = 0
        if (!state.communityMuted && state.activeChatId != OFFICIAL_COMMUNITY_ID) {
            total += state.communityUnreadCount
        }
        for (grp in state.groups) {
            if (!grp.isArchived && !grp.isSilenced && state.activeGroupId != grp.id) {
                total += grp.unreadCount
            }
        }
        for (f in state.friends) {
            val prev = previewByFriend[f.id]
            if (prev != null && !prev.isArchived && !prev.isMuted && state.activeChatId != f.id) {
                total += prev.unreadCount
            }
        }
        total
    }

    val otherSavedAccounts = remember(state.accounts, state.slotId, me?.id) {
        state.accounts.filter { it.slotId != state.slotId && it.userId != me?.id }
    }

    val visibleGroups = remember(state.groups, showArchived, searchQuery) {
        val q = searchQuery.trim().lowercase()
        state.groups.filter { grp ->
            grp.isArchived == showArchived && (q.isEmpty() || grp.name.lowercase().contains(q))
        }
    }

    val sortedFriends = remember(state.friends, previewByFriend, showArchived, searchQuery) {
        val q = searchQuery.trim().lowercase()
        state.friends
            .filter { f ->
                val isArch = previewByFriend[f.id]?.isArchived == true
                isArch == showArchived && (
                    q.isEmpty() ||
                        f.displayName.lowercase().contains(q) ||
                        f.username.lowercase().contains(q)
                    )
            }
            .sortedByDescending { f -> previewByFriend[f.id]?.createdAt ?: 0L }
    }

    val contentBackdrop = rememberLayerBackdrop()
    val isImeVisible = WindowInsets.isImeVisible
    val systemNavBottomPadding = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val bottomBarListClearance = systemNavBottomPadding + 132.dp

    Box(
        modifier = Modifier.fillMaxSize()
    ) {
        /* ==================== Layer 1: Full-Screen Backdrop Content ==================== */
        Box(
            modifier = Modifier
                .fillMaxSize()
                .layerBackdrop(contentBackdrop)
                .then(
                    if (palette.rootGradientBrush != null) {
                        Modifier.background(palette.rootGradientBrush)
                    } else {
                        Modifier.background(palette.bgSecondary)
                    }
                )
        ) {
            AnimatedContent(
                targetState = activeTab,
                transitionSpec = {
                    fadeIn(animationSpec = tween(180)) togetherWith fadeOut(animationSpec = tween(130))
                },
                modifier = Modifier.fillMaxSize(),
                label = "sidebarTabPane",
            ) { currentTab ->
                if (currentTab == "settings") {
                    SettingsModalScreen(
                        state = state,
                        vm = vm,
                        onClose = { activeTab = "chats" },
                        embeddedInBottomBar = true,
                        onOpenAccountSwitcher = { showAccountSwitcher = true },
                        onFullScreenOverlayChange = { settingsSubOverlayOpen = it },
                    )
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .statusBarsPadding()
                            .padding(horizontal = 16.dp)
                            .padding(top = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        /* ==================== 1. `.sidebar-header` (`[logo] JaText` + SwitchAccount; Settings moved to bottom bar) ==================== */
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Image(
                                    painter = painterResource(id = R.drawable.jatext_logo_icon),
                                    contentDescription = "JaText",
                                    modifier = Modifier.size(36.dp),
                                )
                                Text(
                                    text = "JaText",
                                    color = palette.textPrimary,
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.Black,
                                )
                            }
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                JaWebIconButton(
                                    icon = Icons.Rounded.SwapHoriz,
                                    contentDescription = "Switch or add account",
                                    badgeCount = if (state.accounts.size > 1) state.accounts.size else 0,
                                    onClick = { showAccountSwitcher = true },
                                )
                            }
                        }

                        /* ==================== 2. `.greeting` Card ("Good morning/afternoon/evening, <Name>!") ==================== */
                        if (me != null) {
                            val myStatus = when (me.statusPreference) {
                                "offline" -> "offline"
                                "dnd" -> "dnd"
                                "away", "idle" -> "away"
                                else -> "online"
                            }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(palette.bgTertiary)
                                    .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                JaAvatar(
                                    avatarUrl = me.avatarUrl,
                                    displayName = me.displayName.ifBlank { me.username },
                                    avatarColor = me.avatarColor,
                                    size = 50.dp,
                                    ringWidth = 3.dp,
                                    presenceStatus = myStatus,
                                    statusBorderColor = palette.bgTertiary,
                                    modifier = Modifier.clickable { onOpenProfile(me) },
                                )
                                Spacer(Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            text = "Good ${currentDayPartLabel()}, ${me.displayName.ifBlank { me.username }}!",
                                            color = palette.textPrimary,
                                            fontSize = 15.5.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f, fill = false),
                                        )
                                    }
                                    Spacer(Modifier.height(2.dp))
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable { showAccountSwitcher = true }
                                            .padding(vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            text = "@${me.username}",
                                            color = palette.textSecondary,
                                            fontSize = 13.sp,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        Spacer(Modifier.width(2.dp))
                                        Icon(
                                            imageVector = Icons.Rounded.UnfoldMore,
                                            contentDescription = "Switch account",
                                            tint = palette.textSecondary,
                                            modifier = Modifier.size(14.dp),
                                        )
                                    }
                                }
                                if (otherSavedAccounts.isNotEmpty()) {
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        otherSavedAccounts.take(2).forEach { acct ->
                                            JaAvatar(
                                                avatarUrl = acct.avatarUrl,
                                                displayName = acct.displayName.ifBlank { acct.username },
                                                avatarColor = acct.avatarColor,
                                                size = 30.dp,
                                                ringWidth = 2.dp,
                                                modifier = Modifier.clickable { vm.switchToAccountSlot(acct.slotId) },
                                            )
                                        }
                                        if (otherSavedAccounts.size > 2) {
                                            Box(
                                                modifier = Modifier
                                                    .size(30.dp)
                                                    .clip(CircleShape)
                                                    .background(palette.bgSecondary)
                                                    .border(1.dp, palette.border, CircleShape)
                                                    .clickable { showAccountSwitcher = true },
                                                contentAlignment = Alignment.Center,
                                            ) {
                                                Text(
                                                    text = "+${otherSavedAccounts.size - 2}",
                                                    color = palette.textPrimary,
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold,
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        when (currentTab) {
            "chats" -> {
                JaWebInput(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = "Search friends…",
                    leadingIcon = Icons.Rounded.Search,
                    trailingContent = if (searchQuery.isNotEmpty()) {
                        {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = "Clear",
                                tint = palette.textSecondary,
                                modifier = Modifier
                                    .size(17.dp)
                                    .clickable { searchQuery = "" },
                            )
                        }
                    } else {
                        null
                    },
                )

                // `.archive-toggle`
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (showArchived) palette.bgTertiary else Color.Transparent)
                        .border(
                            width = 1.dp,
                            color = if (showArchived) palette.border else Color.Transparent,
                            shape = RoundedCornerShape(10.dp),
                        )
                        .clickable { showArchived = !showArchived }
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = if (showArchived) Icons.AutoMirrored.Rounded.ArrowBack else Icons.Rounded.Archive,
                        contentDescription = null,
                        tint = if (showArchived) palette.textPrimary else palette.textSecondary,
                        modifier = Modifier.size(15.dp),
                    )
                    Spacer(Modifier.width(7.dp))
                    Text(
                        text = if (showArchived) {
                            "Chats"
                        } else if (archivedCount > 0) {
                            "Archived ($archivedCount)"
                        } else {
                            "Archived"
                        },
                        color = if (showArchived) palette.textPrimary else palette.textSecondary,
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    contentPadding = PaddingValues(bottom = bottomBarListClearance),
                ) {
                    /* ---- Official JaText Community Row (`.official-community-row`) ---- */
                    if (!showArchived) {
                        item(key = "official-community") {
                            val commUnread = if (state.activeChatId == OFFICIAL_COMMUNITY_ID) 0 else state.communityUnreadCount
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(
                                        if (state.activeChatId == OFFICIAL_COMMUNITY_ID) palette.bgTertiary
                                        else Color.Transparent
                                    )
                                    .border(
                                        width = 1.dp,
                                        color = Color(0x384ADE80),
                                        shape = RoundedCornerShape(16.dp),
                                    )
                                    .combinedClickable(
                                        onClick = { vm.openCommunityChat() },
                                        onLongClick = { holdTarget = SidebarHoldTarget.Community },
                                    )
                                    .padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Image(
                                    painter = painterResource(id = R.drawable.jatext_logo_icon),
                                    contentDescription = "JaText Community",
                                    modifier = Modifier
                                        .size(48.dp)
                                        .clip(CircleShape),
                                )
                                Spacer(Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            text = "JaText Community",
                                            color = palette.textPrimary,
                                            fontSize = 15.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f),
                                        )
                                        Row(
                                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            if (state.communityMuted) {
                                                Icon(
                                                    imageVector = Icons.Rounded.NotificationsOff,
                                                    contentDescription = "Muted",
                                                    tint = palette.textSecondary,
                                                    modifier = Modifier.size(14.dp),
                                                )
                                            }
                                            if (commUnread > 0) {
                                                UnreadCountPill(
                                                    count = commUnread,
                                                    muted = state.communityMuted,
                                                )
                                            }
                                            JaVerifiedBadge(size = 17.dp)
                                            JaOfficialBadge()
                                        }
                                    }
                                    Spacer(Modifier.height(2.dp))
                                    Text(
                                        text = "Official JaText announcements",
                                        color = palette.textSecondary,
                                        fontSize = 13.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }

                    /* ---- Group Rows (`.group-list-row`) ---- */
                    items(visibleGroups, key = { "grp:${it.id}" }) { grp ->
                        GroupSidebarRow(
                            group = grp,
                            myUserId = me?.id.orEmpty(),
                            isSelected = state.activeGroupId == grp.id,
                            onClick = { vm.openGroupChat(grp.id) },
                            onLongClick = { holdTarget = SidebarHoldTarget.Group(grp) },
                        )
                    }

                    /* ---- Empty State (`.empty-box`) ---- */
                    if (sortedFriends.isEmpty() && visibleGroups.isEmpty()) {
                        item(key = "empty-chats") {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 8.dp)
                                    .clip(RoundedCornerShape(16.dp))
                                    .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                                    .padding(20.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                if (state.friends.isEmpty() && state.groups.isEmpty() && !showArchived) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            imageVector = Icons.Rounded.PersonAdd,
                                            contentDescription = null,
                                            tint = palette.accent,
                                            modifier = Modifier.size(18.dp),
                                        )
                                        Spacer(Modifier.width(6.dp))
                                        Text(
                                            text = "No friends yet",
                                            color = palette.textPrimary,
                                            fontSize = 15.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                    Text(
                                        text = "Head to Add and add someone by their username. Once they accept, you can start texting!",
                                        color = palette.textSecondary,
                                        fontSize = 13.sp,
                                        textAlign = TextAlign.Center,
                                    )
                                    JaWebPrimaryButton(
                                        text = "Add a friend",
                                        onClick = { activeTab = "add" },
                                    )
                                } else {
                                    Text(
                                        text = if (showArchived) "No archived chats." else "No chats match your search.",
                                        color = palette.textSecondary,
                                        fontSize = 14.sp,
                                    )
                                }
                            }
                        }
                    }

                    /* ---- 1:1 Friend Rows (`.friend-row`) ---- */
                    items(sortedFriends, key = { "dm:${it.id}" }) { friend ->
                        val prev = previewByFriend[friend.id]
                        val act = activityByFriend[friend.id]
                        DmSidebarRow(
                            friend = friend,
                            preview = prev,
                            myUserId = me?.id.orEmpty(),
                            isSelected = state.activeChatId == friend.id,
                            presenceStatus = act?.status ?: "offline",
                            typingToMe = typingDmSenders.contains(friend.id),
                            onClick = { vm.openDmChat(friend.id) },
                            onAvatarClick = { onOpenProfile(friend) },
                            onLongClick = { holdTarget = SidebarHoldTarget.Dm(friend, prev) },
                        )
                    }
                }
            }

            "calls" -> {
                if (state.callHistory.isEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                            .padding(22.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Rounded.Call,
                                contentDescription = null,
                                tint = palette.accent,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = "No calls yet",
                                color = palette.textPrimary,
                                fontSize = 15.5.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                        Text(
                            text = "Start a voice or video call with a friend or group. Your incoming and outgoing call history will show right here.",
                            color = palette.textSecondary,
                            fontSize = 13.sp,
                            textAlign = TextAlign.Center,
                        )
                    }
                    Spacer(Modifier.weight(1f))
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        contentPadding = PaddingValues(bottom = bottomBarListClearance),
                    ) {
                        items(state.callHistory, key = { "call:${it.id}" }) { entry ->
                            val friendPeer = entry.peerId?.let { pid -> state.friends.firstOrNull { it.id == pid } }
                            val groupTarget = entry.groupId?.let { gid -> state.groups.firstOrNull { it.id == gid } }
                            val handleText = when {
                                entry.groupId != null -> "Group call"
                                friendPeer != null -> "@${friendPeer.username}"
                                else -> "Direct call"
                            }
                            CallHistoryRowUi(
                                entry = entry,
                                handleText = handleText,
                                presenceStatus = friendPeer?.let { activityByFriend[it.id]?.status },
                                onRowClick = {
                                    if (groupTarget != null) vm.openGroupChat(groupTarget.id)
                                    else if (friendPeer != null) vm.openDmChat(friendPeer.id)
                                },
                                onVoiceCall = {
                                    if (me == null) return@CallHistoryRowUi
                                    if (groupTarget != null) vm.callEngine.startGroupCall(me, groupTarget, "voice")
                                    else if (friendPeer != null) vm.callEngine.startDmCall(me, friendPeer, "voice")
                                },
                                onVideoCall = {
                                    if (me == null) return@CallHistoryRowUi
                                    if (groupTarget != null) vm.callEngine.startGroupCall(me, groupTarget, "video")
                                    else if (friendPeer != null) vm.callEngine.startDmCall(me, friendPeer, "video")
                                },
                            )
                        }
                    }
                }
            }

            "add" -> {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(bottom = bottomBarListClearance),
                ) {
                    /* ---- Add by username ---- */
                    item(key = "add-by-username") {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(
                                text = "Add by username",
                                color = palette.textPrimary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.ExtraBold,
                            )
                            JaWebInput(
                                value = addUsername,
                                onValueChange = { addUsername = it.lowercase().removePrefix("@") },
                                leadingPrefix = "@",
                                placeholder = "their-username",
                            )
                            JaWebPrimaryButton(
                                text = "Send friend request",
                                enabled = addUsername.trim().isNotEmpty(),
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    val clean = addUsername.trim().removePrefix("@")
                                    if (clean.isNotEmpty()) {
                                        vm.sendFriendRequest(clean)
                                        addUsername = ""
                                    }
                                },
                            )
                        }
                    }

                    /* ---- `.groups-add-section` ---- */
                    item(key = "groups-add-section") {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(palette.bgTertiary)
                                .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                                .padding(13.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "Groups",
                                    color = palette.textPrimary,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                )
                                JaWebGhostButton(
                                    text = "New group",
                                    leadingIcon = Icons.Rounded.Add,
                                    onClick = { showCreateGroupDialog = true },
                                )
                            }
                            Text(
                                text = "Create an encrypted group chat with up to 50 friends.",
                                color = palette.textSecondary,
                                fontSize = 13.sp,
                            )
                        }
                    }

                    /* ---- Incoming Friend Requests ---- */
                    item(key = "incoming-header") {
                        Text(
                            text = "Incoming requests (${state.incoming.size})",
                            color = palette.textPrimary,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                    if (state.incoming.isEmpty()) {
                        item(key = "incoming-empty") {
                            Text(
                                text = "No incoming friend requests right now.",
                                color = palette.textSecondary,
                                fontSize = 13.sp,
                            )
                        }
                    } else {
                        items(state.incoming, key = { "in:${it.requestId}" }) { req ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(palette.bgTertiary)
                                    .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                                    .padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                JaAvatar(
                                    avatarUrl = req.user.avatarUrl,
                                    displayName = req.user.displayName.ifBlank { req.user.username },
                                    avatarColor = req.user.avatarColor,
                                    size = 42.dp,
                                    ringWidth = 2.5.dp,
                                )
                                Spacer(Modifier.width(10.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = req.user.displayName.ifBlank { req.user.username },
                                        color = palette.textPrimary,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.5.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        text = "@${req.user.username}",
                                        color = palette.textSecondary,
                                        fontSize = 12.5.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                // `.accept-btn`
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(palette.success)
                                        .clickable { vm.respondFriendRequest(req.requestId, true) }
                                        .padding(horizontal = 13.dp, vertical = 8.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        text = "Accept",
                                        color = Color(0xFF06280F),
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                    )
                                }
                                Spacer(Modifier.width(6.dp))
                                JaWebGhostButton(
                                    text = "Decline",
                                    onClick = { vm.respondFriendRequest(req.requestId, false) },
                                )
                            }
                        }
                    }

                    /* ---- Outgoing Sent Requests ---- */
                    if (state.outgoing.isNotEmpty()) {
                        item(key = "outgoing-header") {
                            Text(
                                text = "Sent requests (${state.outgoing.size})",
                                color = palette.textPrimary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.ExtraBold,
                            )
                        }
                        items(state.outgoing, key = { "out:${it.requestId}" }) { req ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(palette.bgTertiary)
                                    .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                                    .padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                JaAvatar(
                                    avatarUrl = req.user.avatarUrl,
                                    displayName = req.user.displayName.ifBlank { req.user.username },
                                    avatarColor = req.user.avatarColor,
                                    size = 40.dp,
                                    ringWidth = 2.5.dp,
                                )
                                Spacer(Modifier.width(10.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = req.user.displayName.ifBlank { req.user.username },
                                        color = palette.textPrimary,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                    )
                                    Text(
                                        text = "@${req.user.username}",
                                        color = palette.textSecondary,
                                        fontSize = 12.sp,
                                    )
                                }
                                Text(
                                    text = "Pending",
                                    color = palette.textSecondary,
                                    fontSize = 13.sp,
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

            // Soft bottom fade scrim inside contentBackdrop so scrolled avatars never bleed into the Liquid Glass tabs
            if (!isImeVisible && !settingsSubOverlayOpen) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .height(systemNavBottomPadding + 92.dp)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color.Transparent,
                                    palette.bgSecondary.copy(alpha = 0.72f),
                                    palette.bgSecondary.copy(alpha = 0.94f),
                                )
                            )
                        )
                )
            }
        }

        /* ==================== Layer 2: Floating iOS 26 Liquid Glass Bottom Navigation Bar ==================== */
        AnimatedVisibility(
            visible = !isImeVisible && !settingsSubOverlayOpen,
            enter = fadeIn(tween(180)) + slideInVertically(tween(220)) { it / 2 },
            exit = fadeOut(tween(140)) + slideOutVertically(tween(180)) { it / 2 },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            val selectedNavIndex = BOTTOM_NAV_TAB_IDS.indexOf(activeTab).coerceAtLeast(0)
            LiquidBottomTabs(
                selectedTabIndex = { selectedNavIndex },
                onTabSelected = { idx ->
                    val nextTab = BOTTOM_NAV_TAB_IDS.getOrElse(idx) { "chats" }
                    if (activeTab != nextTab) {
                        activeTab = nextTab
                    }
                },
                backdrop = contentBackdrop,
                tabsCount = BOTTOM_NAV_TAB_IDS.size,
                modifier = Modifier.fillMaxWidth(),
                isLightTheme = !palette.isDark,
                accentColor = palette.accent,
                inactiveColor = palette.textPrimary.copy(alpha = 0.82f),
            ) {
                /* 1. Chats */
                LiquidBottomTab(onClick = { activeTab = "chats" }) {
                    val tabTint = LocalLiquidBottomTabContentColor.current
                    Box(contentAlignment = Alignment.Center) {
                        IosChatsNavIcon(tint = tabTint, size = 23.dp)
                        if (totalUnreadCount > 0) {
                            LiquidTabBadgePill(
                                count = totalUnreadCount,
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .offset(x = 9.dp, y = (-4).dp),
                            )
                        }
                    }
                    Text(
                        text = "Chats",
                        color = tabTint,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                    )
                }

                /* 2. Calls */
                LiquidBottomTab(onClick = { activeTab = "calls" }) {
                    val tabTint = LocalLiquidBottomTabContentColor.current
                    IosCallsNavIcon(tint = tabTint, size = 23.dp)
                    Text(
                        text = "Calls",
                        color = tabTint,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                    )
                }

                /* 3. Add */
                LiquidBottomTab(onClick = { activeTab = "add" }) {
                    val tabTint = LocalLiquidBottomTabContentColor.current
                    Box(contentAlignment = Alignment.Center) {
                        IosAddNavIcon(tint = tabTint, size = 23.dp)
                        if (state.incoming.isNotEmpty()) {
                            LiquidTabBadgePill(
                                count = state.incoming.size,
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .offset(x = 9.dp, y = (-4).dp),
                            )
                        }
                    }
                    Text(
                        text = "Add",
                        color = tabTint,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                    )
                }

                /* 4. Settings (Authentic iOS SF-Symbol `gear` icon) */
                LiquidBottomTab(onClick = { activeTab = "settings" }) {
                    val tabTint = LocalLiquidBottomTabContentColor.current
                    IosSettingsGearIcon(tint = tabTint, size = 23.dp)
                    Text(
                        text = "Settings",
                        color = tabTint,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                    )
                }
            }
        }
    }

    /* ==================== Hold / Long-Press Context Sheet (Nav-Bar-Safe!) ==================== */
    holdTarget?.let { target ->
        ModalBottomSheet(
            onDismissRequest = { holdTarget = null },
            containerColor = palette.bgSecondary,
            contentColor = palette.textPrimary,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 8.dp)
            ) {
                when (target) {
                    is SidebarHoldTarget.Community -> {
                        // Constraint: Holding JaText Community ONLY shows Mute / Unmute!
                        Text(
                            text = "JaText Community",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp,
                            modifier = Modifier.padding(bottom = 10.dp),
                        )
                        ContextActionItem(
                            icon = if (state.communityMuted) Icons.Rounded.VolumeUp else Icons.Rounded.NotificationsOff,
                            label = if (state.communityMuted) "Unmute" else "Mute",
                            onClick = {
                                vm.setCommunityMuted(!state.communityMuted)
                                holdTarget = null
                            }
                        )
                    }
                    is SidebarHoldTarget.Dm -> {
                        val isMuted = target.preview?.isMuted == true
                        val isArchived = target.preview?.isArchived == true
                        Text(
                            text = target.friend.displayName.ifBlank { target.friend.username },
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp,
                            modifier = Modifier.padding(bottom = 10.dp),
                        )
                        ContextActionItem(
                            icon = Icons.Rounded.CheckCircle,
                            label = "Mark as done",
                            onClick = {
                                vm.markDmAsDone(target.friend.id)
                                holdTarget = null
                            }
                        )
                        ContextActionItem(
                            icon = if (isMuted) Icons.Rounded.VolumeUp else Icons.Rounded.NotificationsOff,
                            label = if (isMuted) "Unmute" else "Mute",
                            onClick = {
                                vm.setDmConversationPrefs(target.friend.id, muted = !isMuted)
                                holdTarget = null
                            }
                        )
                        ContextActionItem(
                            icon = if (isArchived) Icons.Rounded.Unarchive else Icons.Rounded.Archive,
                            label = if (isArchived) "Unarchive" else "Archive",
                            onClick = {
                                vm.setDmConversationPrefs(target.friend.id, archived = !isArchived)
                                holdTarget = null
                            }
                        )
                        ContextActionItem(
                            icon = Icons.Rounded.DeleteSweep,
                            label = "Delete chat history",
                            tint = palette.danger,
                            onClick = {
                                vm.setDmConversationPrefs(target.friend.id, removeChatHistory = true)
                                holdTarget = null
                            }
                        )
                    }
                    is SidebarHoldTarget.Group -> {
                        val grp = target.group
                        val isOwner = grp.myRole == "owner" || grp.ownerId == me?.id
                        Text(
                            text = grp.name,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp,
                            modifier = Modifier.padding(bottom = 10.dp),
                        )
                        ContextActionItem(
                            icon = Icons.Rounded.CheckCircle,
                            label = "Mark as done",
                            onClick = {
                                vm.markGroupAsDone(grp.id)
                                holdTarget = null
                            }
                        )
                        ContextActionItem(
                            icon = if (grp.isSilenced) Icons.Rounded.VolumeUp else Icons.Rounded.NotificationsOff,
                            label = if (grp.isSilenced) "Unmute" else "Mute",
                            onClick = {
                                vm.setGroupPrefs(grp.id, silenced = !grp.isSilenced)
                                holdTarget = null
                            }
                        )
                        ContextActionItem(
                            icon = if (grp.isArchived) Icons.Rounded.Unarchive else Icons.Rounded.Archive,
                            label = if (grp.isArchived) "Unarchive" else "Archive",
                            onClick = {
                                vm.setGroupPrefs(grp.id, archived = !grp.isArchived)
                                holdTarget = null
                            }
                        )
                        ContextActionItem(
                            icon = Icons.Rounded.DeleteSweep,
                            label = "Remove chat",
                            onClick = {
                                vm.removeGroupChatWithoutLeaving(grp.id)
                                holdTarget = null
                            }
                        )
                        if (!isOwner) {
                            ContextActionItem(
                                icon = Icons.Rounded.ExitToApp,
                                label = "Leave group",
                                tint = palette.danger,
                                onClick = {
                                    vm.leaveGroup(grp.id)
                                    holdTarget = null
                                }
                            )
                        } else {
                            // ONLY the group owner gets "Delete group" (2-step + exact group name!)
                            ContextActionItem(
                                icon = Icons.Rounded.DeleteForever,
                                label = "Delete group",
                                tint = palette.danger,
                                onClick = {
                                    holdTarget = null
                                    ownerDeleteTarget = grp
                                    ownerDeleteStep = 1
                                    ownerDeleteTypedName = ""
                                }
                            )
                        }
                    }
                }
                Spacer(Modifier.height(14.dp))
            }
        }
    }

    /* ==================== Owner-Only 2-Step Exact-Name Group Deletion Modal ==================== */
    ownerDeleteTarget?.let { grp ->
        Dialog(onDismissRequest = { ownerDeleteTarget = null }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(22.dp))
                    .background(palette.bgSecondary)
                    .border(1.dp, palette.border, RoundedCornerShape(22.dp))
                    .padding(22.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(
                    text = if (ownerDeleteStep == 1) "Delete \"${grp.name}\"?" else "Confirm exact group name",
                    color = palette.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                if (ownerDeleteStep == 1) {
                    Text(
                        text = "This permanently deletes \"${grp.name}\" and all messages for every member. This action cannot be undone.",
                        color = palette.textSecondary,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                    )
                } else {
                    Text(
                        text = "Type \"${grp.name}\" below to permanently delete this group for everyone:",
                        color = palette.textSecondary,
                        fontSize = 13.5.sp,
                    )
                    JaWebInput(
                        value = ownerDeleteTypedName,
                        onValueChange = { ownerDeleteTypedName = it },
                        placeholder = grp.name,
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    JaWebGhostButton(
                        text = "Cancel",
                        onClick = { ownerDeleteTarget = null },
                    )
                    Spacer(Modifier.width(8.dp))
                    if (ownerDeleteStep == 1) {
                        JaWebDangerButton(
                            text = "Continue",
                            onClick = { ownerDeleteStep = 2 },
                        )
                    } else {
                        JaWebDangerButton(
                            text = "Delete permanently",
                            enabled = ownerDeleteTypedName.trim() == grp.name.trim(),
                            onClick = {
                                vm.deleteGroupPermanentlyAsOwner(grp.id)
                                ownerDeleteTarget = null
                            },
                        )
                    }
                }
            }
        }
    }

    /* ==================== Multi-Account Switcher Modal (`AccountSwitcherModal.tsx`) ==================== */
    if (showAccountSwitcher) {
        ModalBottomSheet(
            onDismissRequest = { showAccountSwitcher = false },
            containerColor = palette.bgSecondary,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = "Switch or add account",
                    color = palette.textPrimary,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 18.sp,
                )
                state.accounts.forEach { slot ->
                    val active = slot.slotId == state.slotId
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(if (active) palette.accentSoft else palette.bgTertiary)
                            .border(
                                1.dp,
                                if (active) palette.accent else palette.border,
                                RoundedCornerShape(16.dp),
                            )
                            .clickable {
                                showAccountSwitcher = false
                                if (!active) vm.switchToAccountSlot(slot.slotId)
                            }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        JaAvatar(
                            avatarUrl = slot.avatarUrl,
                            displayName = slot.displayName.ifBlank { slot.username },
                            avatarColor = slot.avatarColor,
                            size = 42.dp,
                            ringWidth = 2.5.dp,
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = slot.displayName.ifBlank { slot.username },
                                color = palette.textPrimary,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                            )
                            Text(
                                text = "@${slot.username}",
                                color = palette.textSecondary,
                                fontSize = 12.5.sp,
                            )
                        }
                        if (active) {
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(palette.accent)
                                    .padding(horizontal = 10.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Check,
                                    contentDescription = null,
                                    tint = palette.accentDark,
                                    modifier = Modifier.size(13.dp),
                                )
                                Spacer(Modifier.width(3.dp))
                                Text(
                                    text = "Active",
                                    color = palette.accentDark,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 11.5.sp,
                                )
                            }
                        }
                    }
                }
                JaWebPrimaryButton(
                    text = "Add another account",
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        showAccountSwitcher = false
                        vm.startAddAnotherAccount()
                    },
                )
                JaWebDangerButton(
                    text = "Sign out of @${me?.username.orEmpty()}",
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        showAccountSwitcher = false
                        vm.signOutCurrentAccount()
                    },
                )
                Spacer(Modifier.height(8.dp))
            }
        }
    }

    /* ==================== Create Group Dialog (`.create-group-dialog`) ==================== */
    if (showCreateGroupDialog) {
        var groupName by remember { mutableStateOf("") }
        val selectedIds = remember { mutableStateListOf<String>() }
        Dialog(onDismissRequest = { showCreateGroupDialog = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(22.dp))
                    .background(palette.bgSecondary)
                    .border(1.dp, palette.border, RoundedCornerShape(22.dp))
                    .padding(22.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "New group chat",
                        color = palette.textPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    JaWebIconButton(
                        icon = Icons.Rounded.Close,
                        contentDescription = "Close",
                        size = 34.dp,
                        iconSize = 16.dp,
                        onClick = { showCreateGroupDialog = false },
                    )
                }
                JaWebInput(
                    value = groupName,
                    onValueChange = { groupName = it },
                    label = "Group name",
                    placeholder = "Weekend squad…",
                )
                Text(
                    text = "Add friends (${selectedIds.size} selected)",
                    color = palette.textSecondary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 220.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(state.friends, key = { it.id }) { f ->
                        val checked = selectedIds.contains(f.id)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(11.dp))
                                .background(palette.bgTertiary)
                                .clickable {
                                    if (checked) selectedIds.remove(f.id) else selectedIds.add(f.id)
                                }
                                .padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            JaAvatar(
                                avatarUrl = f.avatarUrl,
                                displayName = f.displayName.ifBlank { f.username },
                                avatarColor = f.avatarColor,
                                size = 32.dp,
                                ringWidth = 2.dp,
                            )
                            Spacer(Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = f.displayName.ifBlank { f.username },
                                    color = palette.textPrimary,
                                    fontSize = 13.5.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = "@${f.username}",
                                    color = palette.textSecondary,
                                    fontSize = 11.5.sp,
                                )
                            }
                            Checkbox(
                                checked = checked,
                                onCheckedChange = {
                                    if (it) selectedIds.add(f.id) else selectedIds.remove(f.id)
                                },
                                colors = CheckboxDefaults.colors(
                                    checkedColor = palette.accent,
                                    checkmarkColor = palette.accentDark,
                                ),
                            )
                        }
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    JaWebGhostButton(
                        text = "Cancel",
                        onClick = { showCreateGroupDialog = false },
                    )
                    Spacer(Modifier.width(8.dp))
                    JaWebPrimaryButton(
                        text = "Create group",
                        enabled = groupName.trim().isNotEmpty(),
                        onClick = {
                            vm.createNewGroup(groupName.trim(), selectedIds.toList())
                            showCreateGroupDialog = false
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun UnreadCountPill(
    count: Int,
    muted: Boolean,
) {
    val palette = LocalJaTextPalette.current
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (muted) palette.borderStrong else palette.accent)
            .padding(horizontal = 7.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = if (count > 99) "99+" else count.toString(),
            color = if (muted) palette.textPrimary else palette.accentDark,
            fontSize = 11.sp,
            fontWeight = FontWeight.Black,
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DmSidebarRow(
    friend: JaUser,
    preview: ChatPreview?,
    myUserId: String,
    isSelected: Boolean,
    presenceStatus: String,
    typingToMe: Boolean,
    onClick: () -> Unit,
    onAvatarClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val unread = if (isSelected) 0 else (preview?.unreadCount ?: 0)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(if (isSelected) palette.bgTertiary else Color.Transparent)
            .then(
                if (isSelected) Modifier.border(1.dp, palette.border, RoundedCornerShape(16.dp))
                else Modifier
            )
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        JaAvatar(
            avatarUrl = friend.avatarUrl,
            displayName = friend.displayName.ifBlank { friend.username },
            avatarColor = friend.avatarColor,
            size = 44.dp,
            ringWidth = 3.dp,
            presenceStatus = presenceStatus,
            statusBorderColor = if (isSelected) palette.bgTertiary else palette.bgSecondary,
            modifier = Modifier.clickable { onAvatarClick() },
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = friend.displayName.ifBlank { friend.username },
                    color = palette.textPrimary,
                    fontSize = 15.sp,
                    fontWeight = if (unread > 0) FontWeight.ExtraBold else FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (preview?.isMuted == true) {
                        Icon(
                            imageVector = Icons.Rounded.NotificationsOff,
                            contentDescription = "Muted",
                            tint = palette.textSecondary,
                            modifier = Modifier.size(13.dp),
                        )
                    }
                    if (unread > 0) {
                        UnreadCountPill(count = unread, muted = preview?.isMuted == true)
                    }
                    preview?.createdAt?.takeIf { it > 0L }?.let {
                        Text(
                            text = formatShortTime(it),
                            color = palette.textSecondary,
                            fontSize = 12.sp,
                        )
                    }
                }
            }
            Spacer(Modifier.height(2.dp))
            val previewCopy = when {
                typingToMe -> "typing…"
                preview != null && preview.body.isNotBlank() -> {
                    val prefix = if (preview.senderId == myUserId) "You: " else ""
                    "$prefix${preview.body}"
                }
                else -> "@${friend.username}"
            }
            Text(
                text = previewCopy,
                color = when {
                    typingToMe -> palette.accent
                    unread > 0 -> palette.textPrimary
                    else -> palette.textSecondary
                },
                fontSize = 13.sp,
                fontWeight = if (unread > 0 || typingToMe) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun GroupSidebarRow(
    group: GroupSummary,
    myUserId: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val unread = if (isSelected) 0 else group.unreadCount
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(if (isSelected) palette.bgTertiary else Color.Transparent)
            .then(
                if (isSelected) Modifier.border(1.dp, palette.border, RoundedCornerShape(16.dp))
                else Modifier
            )
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        JaGroupAvatar(
            avatarUrl = group.avatarUrl,
            name = group.name,
            size = 46.dp,
            ringWidth = 2.5.dp,
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = group.name,
                    color = palette.textPrimary,
                    fontSize = 15.sp,
                    fontWeight = if (unread > 0) FontWeight.ExtraBold else FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (group.isSilenced) {
                        Icon(
                            imageVector = Icons.Rounded.NotificationsOff,
                            contentDescription = "Silenced",
                            tint = palette.textSecondary,
                            modifier = Modifier.size(13.dp),
                        )
                    }
                    if (group.lastMentionedMe && !isSelected) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(palette.accent)
                                .padding(horizontal = 6.dp, vertical = 1.dp),
                        ) {
                            Text(
                                text = "@",
                                color = palette.accentDark,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                            )
                        }
                    }
                    if (unread > 0) {
                        UnreadCountPill(count = unread, muted = group.isSilenced || group.isArchived)
                    }
                    group.lastMessageAt.takeIf { it > 0L }?.let {
                        Text(
                            text = formatShortTime(it),
                            color = palette.textSecondary,
                            fontSize = 12.sp,
                        )
                    }
                }
            }
            Spacer(Modifier.height(2.dp))
            val subText = if (group.lastMessage.isNotBlank()) {
                val prefix = when {
                    group.lastSenderId == myUserId -> "You: "
                    !group.lastSenderName.isNullOrBlank() -> "${group.lastSenderName}: "
                    else -> ""
                }
                "$prefix${group.lastMessage}"
            } else {
                "${group.memberCount} members"
            }
            Text(
                text = subText,
                color = if (unread > 0) palette.textPrimary else palette.textSecondary,
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun CallHistoryRowUi(
    entry: CallHistoryEntry,
    handleText: String,
    presenceStatus: String?,
    onRowClick: () -> Unit,
    onVoiceCall: () -> Unit,
    onVideoCall: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val isMissed = entry.status == "missed" || entry.status == "declined"
    val stateCopy = when {
        entry.status == "missed" -> "Missed"
        entry.status == "declined" -> "Declined"
        entry.durationSec > 0 -> {
            val m = entry.durationSec / 60
            val s = entry.durationSec % 60
            "%d:%02d".format(m, s)
        }
        entry.groupId != null -> "GC VC Ended"
        else -> "Ended"
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(palette.bgTertiary)
            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
            .clickable { onRowClick() }
            .padding(11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        JaAvatar(
            avatarUrl = entry.avatarUrl,
            displayName = entry.title,
            avatarColor = entry.avatarColor,
            size = 44.dp,
            ringWidth = 2.5.dp,
            presenceStatus = presenceStatus,
            statusBorderColor = palette.bgTertiary,
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = entry.title,
                    color = palette.textPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = formatShortTime(entry.timestamp),
                    color = palette.textSecondary,
                    fontSize = 12.sp,
                )
            }
            Text(
                text = handleText,
                color = palette.textSecondary,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (entry.direction == "outgoing") Icons.Rounded.CallMade else Icons.Rounded.CallReceived,
                    contentDescription = null,
                    tint = if (isMissed) palette.danger else palette.success,
                    modifier = Modifier.size(13.dp),
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = "${if (entry.direction == "outgoing") "Outgoing" else "Incoming"} · ${if (entry.mode == "video") "Video" else "Voice"} · $stateCopy",
                    color = if (isMissed) palette.danger else palette.textSecondary,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            JaWebIconButton(
                icon = Icons.Rounded.Call,
                contentDescription = "Voice Call",
                size = 36.dp,
                iconSize = 16.dp,
                onClick = onVoiceCall,
            )
            JaWebIconButton(
                icon = Icons.Rounded.Videocam,
                contentDescription = "Video Call",
                size = 36.dp,
                iconSize = 16.dp,
                onClick = onVideoCall,
            )
        }
    }
}

@Composable
private fun ContextActionItem(
    icon: ImageVector,
    label: String,
    tint: Color? = null,
    onClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val resolvedTint = tint ?: palette.textPrimary
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = resolvedTint, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(13.dp))
        Text(text = label, color = resolvedTint, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

private fun formatShortTime(ts: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - ts
    return if (diff < 24 * 60 * 60 * 1000L) {
        SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(ts))
    } else {
        SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(ts))
    }
}

@Composable
private fun LiquidTabBadgePill(
    count: Int,
    modifier: Modifier = Modifier,
) {
    val label = if (count > 99) "99+" else count.toString()
    Box(
        modifier = modifier
            .defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
            .clip(CircleShape)
            .background(Color(0xFFFF3B30))
            .padding(horizontal = 4.dp, vertical = 1.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 9.5.sp,
            fontWeight = FontWeight.ExtraBold,
            lineHeight = 10.sp,
            maxLines = 1,
        )
    }
}

