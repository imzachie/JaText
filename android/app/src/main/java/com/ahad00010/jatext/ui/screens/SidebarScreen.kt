package com.ahad00010.jatext.ui.screens

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.CallMade
import androidx.compose.material.icons.rounded.CallReceived
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.ExitToApp
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.NotificationsOff
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.PushPin
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import com.ahad00010.jatext.R
import com.ahad00010.jatext.crypto.JaTextCryptoEngine
import com.ahad00010.jatext.data.CallHistoryEntry
import com.ahad00010.jatext.data.ChatPreview
import com.ahad00010.jatext.data.ExploreCommunitySummary
import com.ahad00010.jatext.data.GroupSummary
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.OFFICIAL_COMMUNITY_ID
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.ui.components.buildPreviewAnnotatedWithSpoilers
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
import com.ahad00010.jatext.ui.theme.JaTextThemeManager
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.navigation.IosCallsNavIcon
import com.kyant.backdrop.navigation.IosChatsNavIcon
import com.kyant.backdrop.navigation.IosGroupsNavIcon
import com.kyant.backdrop.navigation.IosUpdatesNavIcon
import com.kyant.backdrop.navigation.LiquidBottomTab
import com.kyant.backdrop.navigation.LiquidBottomTabs
import com.kyant.backdrop.navigation.LocalLiquidBottomTabContentColor
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val BOTTOM_NAV_TAB_IDS = listOf("updates", "calls", "communities", "chats", "you")

private sealed interface SidebarHoldTarget {
    data object Community : SidebarHoldTarget
    data class Dm(val friend: JaUser, val preview: ChatPreview?) : SidebarHoldTarget
    data class Group(val group: GroupSummary) : SidebarHoldTarget
}

/**
 * Main screen with 5-tab Liquid Glass bottom navigation bar (`Updates`, `Calls`, `Communities`, `Chats`, `You`),
 * defaulting to the 4th tab (`Chats`) on launch.
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
    val focusManager = LocalFocusManager.current
    val searchFocusRequester = remember { FocusRequester() }

    // Persisted in JaTextSessionViewModel so backing out of a Community stays on "communities"
    val activeTab = state.sidebarTab.ifBlank { "chats" } // "updates" | "calls" | "communities" | "chats" | "you"
    var showAddFriendsView by remember { mutableStateOf(false) }
    var settingsSubOverlayOpen by remember { mutableStateOf(false) }
    var isSearchOpen by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var showArchivedDms by remember { mutableStateOf(false) }
    var showArchivedGroups by remember { mutableStateOf(false) }
    var addUsername by remember { mutableStateOf("") }
    var showAccountSwitcher by remember { mutableStateOf(false) }
    var showCreateGroupDialog by remember { mutableStateOf(false) }
    var openStatusComposerNonce by remember { mutableIntStateOf(0) }
    var showCreateCommunityDialog by remember { mutableStateOf(false) }
    var activeFolderId by remember { mutableStateOf("all") }
    var editingFolderSpec by remember { mutableStateOf<com.ahad00010.jatext.data.ChatFolderSpec?>(null) }
    var showFolderEditorDialog by remember { mutableStateOf(false) }
    var holdTarget by remember { mutableStateOf<SidebarHoldTarget?>(null) }

    LaunchedEffect(activeTab) {
        if (activeTab == "communities") {
            vm.refreshExploreCommunities()
        }
    }

    BackHandler(enabled = (searchQuery.isNotEmpty() || showAddFriendsView || activeTab != "chats") && !settingsSubOverlayOpen) {
        when {
            searchQuery.isNotEmpty() -> {
                searchQuery = ""
                focusManager.clearFocus()
            }
            showAddFriendsView -> {
                showAddFriendsView = false
            }
            else -> {
                vm.setSidebarTab("chats")
            }
        }
    }

    // 2-step Owner Group Deletion confirmation state
    var ownerDeleteTarget by remember { mutableStateOf<GroupSummary?>(null) }
    var ownerDeleteStep by remember { mutableIntStateOf(1) }
    var ownerDeleteTypedName by remember { mutableStateOf("") }

    val previewByFriend = remember(state.previews) { state.previews.associateBy { it.friendId } }
    val activityByFriend = remember(state.friendActivities) { state.friendActivities.associateBy { it.userId } }
    val typingDmSenders = remember(state.dmTypingUserIds, state.friendActivities) {
        buildSet {
            addAll(state.dmTypingUserIds)
            state.friendActivities.forEach { if (it.isTyping) add(it.userId) }
        }
    }

    val manualGroups = remember(state.groups) {
        state.groups.filter { it.id.isNotBlank() && !it.isCommunity }.distinctBy { it.id }
    }
    val joinedCommunities = remember(state.groups) {
        state.groups.filter { it.id.isNotBlank() && it.isCommunity }.distinctBy { it.id }
    }

    val dmArchivedCount = remember(state.friends, state.previews, manualGroups) {
        state.friends.count { previewByFriend[it.id]?.isArchived == true } +
            manualGroups.count { it.isArchived }
    }
    val groupArchivedCount = remember(joinedCommunities) {
        joinedCommunities.count { it.isArchived }
    }

    val totalDmUnreadCount = remember(state.friends, state.previews, manualGroups, state.activeChatId, state.activeGroupId) {
        var total = 0
        for (f in state.friends) {
            val prev = previewByFriend[f.id]
            if (prev != null && !prev.isArchived && !prev.isMuted && state.activeChatId != f.id) {
                total += prev.unreadCount
            }
        }
        for (grp in manualGroups) {
            if (!grp.isArchived && !grp.isSilenced && state.activeGroupId != grp.id) {
                total += grp.unreadCount
            }
        }
        total
    }

    val totalGroupUnreadCount = remember(
        joinedCommunities,
        state.communityUnreadCount,
        state.communityMuted,
        state.activeChatId,
        state.activeGroupId,
    ) {
        var total = 0
        if (!state.communityMuted && state.activeChatId != OFFICIAL_COMMUNITY_ID) {
            total += state.communityUnreadCount
        }
        for (grp in joinedCommunities) {
            if (!grp.isArchived && !grp.isSilenced && state.activeGroupId != grp.id) {
                total += grp.unreadCount
            }
        }
        total
    }

    val activeFolder = remember(state.chatOrganization.folders, activeFolderId) {
        state.chatOrganization.folders.firstOrNull { it.id == activeFolderId }
    }

    val visibleCommunities = remember(joinedCommunities, showArchivedGroups, searchQuery) {
        val q = searchQuery.trim().lowercase()
        joinedCommunities
            .filter { grp ->
                grp.isArchived == showArchivedGroups &&
                    (q.isEmpty() || grp.name.lowercase().contains(q) || grp.description.lowercase().contains(q))
            }
    }

    val visibleExploreCommunities = remember(state.exploreCommunities, searchQuery) {
        val q = searchQuery.trim().lowercase()
        state.exploreCommunities.filter { comm ->
            comm.id.isNotBlank() &&
                (q.isEmpty() || comm.name.lowercase().contains(q) || comm.description.lowercase().contains(q))
        }
    }

    val visibleManualGroupsInChats = remember(manualGroups, showArchivedDms, searchQuery, activeFolder) {
        val q = searchQuery.trim().lowercase()
        manualGroups.filter { grp ->
            val inFolder = activeFolder == null || activeFolder.threadIds.contains("group:${grp.id}")
            inFolder && grp.isArchived == showArchivedDms && (q.isEmpty() || grp.name.lowercase().contains(q))
        }
    }

    val sortedFriends = remember(me, state.friends, previewByFriend, showArchivedDms, searchQuery, activeFolder) {
        val q = searchQuery.trim().lowercase()
        val candidates = if (me != null && me.id.isNotBlank()) {
            listOf(me) + state.friends.filter { it.id.isNotBlank() && it.id != me.id }
        } else {
            state.friends.filter { it.id.isNotBlank() }
        }
        candidates
            .distinctBy { it.id }
            .filter { f ->
                val isSelf = me != null && f.id == me.id
                val inFolder = activeFolder == null || activeFolder.threadIds.contains("dm:${f.id}")
                val isArch = previewByFriend[f.id]?.isArchived == true
                inFolder && isArch == showArchivedDms && (
                    q.isEmpty() ||
                        f.displayName.lowercase().contains(q) ||
                        f.username.lowercase().contains(q) ||
                        (isSelf && "message yourself (you) note to self".contains(q))
                    )
            }
            .sortedByDescending { f -> previewByFriend[f.id]?.createdAt ?: 0L }
    }

    val orderedDmKeys = remember(sortedFriends, visibleManualGroupsInChats, previewByFriend, state.chatOrganization) {
        val pinnedSet = state.chatOrganization.pinnedIds.toSet()
        val orderIdx = state.chatOrganization.customOrder.withIndex().associate { it.value to it.index }
        val dmEntries = sortedFriends.map { "dm:${it.id}" to (previewByFriend[it.id]?.createdAt ?: 0L) }
        val grpEntries = visibleManualGroupsInChats.map { "group:${it.id}" to it.lastMessageAt }
        (dmEntries + grpEntries)
            .sortedWith(
                compareByDescending<Pair<String, Long>> { pinnedSet.contains(it.first) }
                    .thenBy { if (pinnedSet.contains(it.first)) (orderIdx[it.first] ?: Int.MAX_VALUE) else Int.MAX_VALUE }
                    .thenByDescending { it.second }
            )
            .map { it.first }
    }

    val orderedGroupKeys = remember(visibleCommunities, state.chatOrganization) {
        val pinnedSet = state.chatOrganization.pinnedIds.toSet()
        val orderIdx = state.chatOrganization.customOrder.withIndex().associate { it.value to it.index }
        visibleCommunities
            .map { "group:${it.id}" to it.lastMessageAt }
            .sortedWith(
                compareByDescending<Pair<String, Long>> { pinnedSet.contains(it.first) }
                    .thenBy { if (pinnedSet.contains(it.first)) (orderIdx[it.first] ?: Int.MAX_VALUE) else Int.MAX_VALUE }
                    .thenByDescending { it.second }
            )
            .map { it.first }
    }

    val groupById = remember(state.groups) { state.groups.associateBy { it.id } }
    val friendById = remember(sortedFriends) { sortedFriends.associateBy { it.id } }

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
                targetState = if (showAddFriendsView && activeTab != "you") "add" else activeTab,
                transitionSpec = {
                    fadeIn(animationSpec = tween(180)) togetherWith fadeOut(animationSpec = tween(130))
                },
                modifier = Modifier.fillMaxSize(),
                label = "sidebarTabPane",
            ) { currentTab ->
                if (currentTab == "you") {
                    SettingsModalScreen(
                        state = state,
                        vm = vm,
                        onClose = { vm.setSidebarTab("chats") },
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
                        /* ==================== 1. `.sidebar-header` (`[logo] JaText` + Search / NewGroup / AddFriend / SwitchAccount) ==================== */
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                if (currentTab == "add") {
                                    JaWebIconButton(
                                        icon = Icons.AutoMirrored.Rounded.ArrowBack,
                                        contentDescription = "Back",
                                        onClick = { showAddFriendsView = false },
                                    )
                                } else {
                                    Image(
                                        painter = painterResource(id = R.drawable.jatext_logo_icon),
                                        contentDescription = "JaText",
                                        modifier = Modifier.size(36.dp),
                                    )
                                }
                                Text(
                                    text = "JaText",
                                    color = palette.textPrimary,
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.Black,
                                    fontFamily = com.ahad00010.jatext.ui.theme.SfProDisplayFontFamily,
                                )
                            }
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                if (currentTab == "chats") {
                                    JaWebIconButton(
                                        icon = Icons.Rounded.Add,
                                        contentDescription = "New group",
                                        onClick = { showCreateGroupDialog = true },
                                    )
                                } else if (currentTab == "updates") {
                                    JaWebIconButton(
                                        icon = Icons.Rounded.Add,
                                        contentDescription = "Add status",
                                        onClick = { openStatusComposerNonce++ },
                                    )
                                } else if (currentTab == "communities") {
                                    JaWebIconButton(
                                        icon = Icons.Rounded.Add,
                                        contentDescription = "Add Communities",
                                        onClick = { showCreateCommunityDialog = true },
                                    )
                                }
                                JaWebIconButton(
                                    icon = Icons.Rounded.PersonAdd,
                                    contentDescription = "Add friends",
                                    badgeCount = state.incoming.size,
                                    onClick = {
                                        searchQuery = ""
                                        showAddFriendsView = !showAddFriendsView
                                    },
                                )
                                JaWebIconButton(
                                    icon = Icons.Rounded.SwapHoriz,
                                    contentDescription = "Switch or add account",
                                    badgeCount = if (state.accounts.size > 1) state.accounts.size else 0,
                                    onClick = { showAccountSwitcher = true },
                                )
                            }
                        }

                        /* ==================== 2. Large SF Pro Bold Title ==================== */
                        Text(
                            text = when (currentTab) {
                                "updates" -> "Updates"
                                "calls" -> com.ahad00010.jatext.data.jt("nav.calls")
                                "communities" -> "Communities"
                                "add" -> "Add Friends"
                                else -> com.ahad00010.jatext.data.jt("nav.chats")
                            },
                            color = if (palette.isDark) Color.White else Color.Black,
                            fontSize = 32.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = com.ahad00010.jatext.ui.theme.SfProDisplayFontFamily,
                            letterSpacing = (-0.4).sp,
                            modifier = Modifier.padding(top = 2.dp),
                        )

                        when (currentTab) {
            "updates" -> {
                UpdatesTabScreen(
                    state = state,
                    vm = vm,
                    bottomBarClearance = bottomBarListClearance,
                    openComposerNonce = openStatusComposerNonce,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            }

            "communities" -> {
                SidebarAlwaysSearchBar(
                    query = searchQuery,
                    onQueryChange = { searchQuery = it },
                    placeholder = "Search communities",
                    onClear = {
                        searchQuery = ""
                        focusManager.clearFocus()
                    },
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    JaWebPrimaryButton(
                        text = "Add Communities",
                        leadingIcon = Icons.Rounded.Add,
                        onClick = { showCreateCommunityDialog = true },
                    )
                    if (groupArchivedCount > 0 || showArchivedGroups) {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (showArchivedGroups) palette.bgTertiary else Color.Transparent)
                                .border(
                                    width = 1.dp,
                                    color = if (showArchivedGroups) palette.border else Color.Transparent,
                                    shape = RoundedCornerShape(10.dp),
                                )
                                .clickable { showArchivedGroups = !showArchivedGroups }
                                .padding(horizontal = 10.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = if (showArchivedGroups) Icons.AutoMirrored.Rounded.ArrowBack else Icons.Rounded.Archive,
                                contentDescription = null,
                                tint = if (showArchivedGroups) palette.textPrimary else palette.textSecondary,
                                modifier = Modifier.size(15.dp),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = if (showArchivedGroups) {
                                    "Communities"
                                } else {
                                    "Archived ($groupArchivedCount)"
                                },
                                color = if (showArchivedGroups) palette.textPrimary else palette.textSecondary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    contentPadding = PaddingValues(bottom = bottomBarListClearance),
                ) {
                    if (!showArchivedGroups) {
                        item(key = "your-communities-header") {
                            Text(
                                text = "YOUR COMMUNITIES",
                                color = palette.textSecondary,
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 0.6.sp,
                                modifier = Modifier.padding(top = 4.dp, bottom = 2.dp),
                            )
                        }
                    }

                    /* ---- Official JaText Community Row ---- */
                    if (!showArchivedGroups) {
                        item(key = "official-community") {
                            val commUnread = if (state.activeChatId == OFFICIAL_COMMUNITY_ID) 0 else state.communityUnreadCount
                            val commTypingText = state.communityTypingUsers
                                .takeIf { it.isNotEmpty() }
                                ?.let { formatTypingUsersLabel(it) }
                            val commDraft = state.drafts["community"]?.trim().orEmpty()
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
                                    val commPreviewAnnotated = remember(commTypingText, commDraft, palette.isDark) {
                                        val rawCommSub = when {
                                            !commTypingText.isNullOrBlank() -> commTypingText
                                            commDraft.isNotEmpty() -> "${com.ahad00010.jatext.data.jt("sidebar.draft")}: $commDraft"
                                            else -> "Official JaText announcements"
                                        }
                                        buildPreviewAnnotatedWithSpoilers(rawCommSub, isDark = palette.isDark)
                                    }
                                    Text(
                                        text = commPreviewAnnotated,
                                        color = if (!commTypingText.isNullOrBlank() || commDraft.isNotEmpty()) palette.accent else palette.textSecondary,
                                        fontSize = 13.sp,
                                        fontWeight = if (!commTypingText.isNullOrBlank() || commDraft.isNotEmpty()) FontWeight.SemiBold else FontWeight.Normal,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }

                    items(orderedGroupKeys, key = { it }) { threadKey ->
                        val gid = threadKey.removePrefix("group:")
                        val grp = groupById[gid]
                        if (grp != null) {
                            val isPinned = state.chatOrganization.pinnedIds.contains(threadKey)
                            val grpTypingText = state.typingByGroup[grp.id]
                                ?.takeIf { it.isNotEmpty() }
                                ?.let { formatTypingUsersLabel(it) }
                            GroupSidebarRow(
                                group = grp,
                                myUserId = me?.id.orEmpty(),
                                isSelected = state.activeGroupId == grp.id,
                                isPinned = isPinned,
                                draftText = state.drafts["group:${grp.id}"],
                                typingLabel = grpTypingText,
                                onClick = { vm.openGroupChat(grp.id) },
                                onLongClick = { holdTarget = SidebarHoldTarget.Group(grp) },
                            )
                        }
                    }

                    if (!showArchivedGroups) {
                        item(key = "explore-communities-cta-card") {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 12.dp)
                                    .clip(RoundedCornerShape(18.dp))
                                    .background(palette.bgTertiary)
                                    .border(1.dp, palette.border, RoundedCornerShape(18.dp))
                                    .padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    Text(
                                        text = "Explore Communities",
                                        color = palette.textPrimary,
                                        fontSize = 17.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                    )
                                    Text(
                                        text = "Join and find communities to hang out with.",
                                        color = palette.textSecondary,
                                        fontSize = 13.sp,
                                    )
                                }
                                JaWebPrimaryButton(
                                    text = "Find communities now!",
                                    modifier = Modifier.fillMaxWidth(),
                                    onClick = { vm.openExploreCommunities() },
                                )
                            }
                        }
                    } else if (orderedGroupKeys.isEmpty()) {
                        item(key = "empty-archived-communities") {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 12.dp)
                                    .clip(RoundedCornerShape(16.dp))
                                    .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                                    .padding(20.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = "No archived communities.",
                                    color = palette.textSecondary,
                                    fontSize = 14.sp,
                                )
                            }
                        }
                    }
                }
            }

            "chats" -> {
                SidebarAlwaysSearchBar(
                    query = searchQuery,
                    onQueryChange = { searchQuery = it },
                    placeholder = com.ahad00010.jatext.data.jt("sidebar.search"),
                    onClear = {
                        searchQuery = ""
                        focusManager.clearFocus()
                    },
                )

                // Folder Filter Pills ("All", user folders, "+ Folder") for P2P DMs
                if (!showArchivedDms) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val allSelected = activeFolder == null
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(if (allSelected) palette.accent else palette.bgTertiary)
                                .border(1.dp, if (allSelected) palette.accent else palette.border, RoundedCornerShape(999.dp))
                                .clickable { activeFolderId = "all" }
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                        ) {
                            Text(
                                text = com.ahad00010.jatext.data.jt("sidebar.folders.all"),
                                color = if (allSelected) palette.onAccent else palette.textPrimary,
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                        state.chatOrganization.folders.forEach { folder ->
                            val selected = activeFolder?.id == folder.id
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(if (selected) palette.accent else palette.bgTertiary)
                                    .border(1.dp, if (selected) palette.accent else palette.border, RoundedCornerShape(999.dp))
                                    .combinedClickable(
                                        onClick = {
                                            if (selected) {
                                                editingFolderSpec = folder
                                                showFolderEditorDialog = true
                                            } else {
                                                activeFolderId = folder.id
                                            }
                                        },
                                        onLongClick = {
                                            editingFolderSpec = folder
                                            showFolderEditorDialog = true
                                        },
                                    )
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Folder,
                                    contentDescription = null,
                                    tint = if (selected) palette.onAccent else palette.accent,
                                    modifier = Modifier.size(13.5.dp),
                                )
                                Text(
                                    text = folder.name,
                                    color = if (selected) palette.onAccent else palette.textPrimary,
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                if (selected) {
                                    Icon(
                                        imageVector = Icons.Rounded.Edit,
                                        contentDescription = "Edit folder",
                                        tint = palette.onAccent,
                                        modifier = Modifier.size(12.dp),
                                    )
                                }
                            }
                        }
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(palette.bgTertiary)
                                .border(1.dp, palette.border, RoundedCornerShape(999.dp))
                                .clickable {
                                    editingFolderSpec = null
                                    showFolderEditorDialog = true
                                }
                                .padding(horizontal = 11.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.CreateNewFolder,
                                contentDescription = "New folder",
                                tint = palette.accent,
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                text = com.ahad00010.jatext.data.jt("sidebar.folders.new"),
                                color = palette.textSecondary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }

                // `.archive-toggle` (P2P DMs only)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (showArchivedDms) palette.bgTertiary else Color.Transparent)
                        .border(
                            width = 1.dp,
                            color = if (showArchivedDms) palette.border else Color.Transparent,
                            shape = RoundedCornerShape(10.dp),
                        )
                        .clickable { showArchivedDms = !showArchivedDms }
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = if (showArchivedDms) Icons.AutoMirrored.Rounded.ArrowBack else Icons.Rounded.Archive,
                        contentDescription = null,
                        tint = if (showArchivedDms) palette.textPrimary else palette.textSecondary,
                        modifier = Modifier.size(15.dp),
                    )
                    Spacer(Modifier.width(7.dp))
                    Text(
                        text = if (showArchivedDms) {
                            "Chats"
                        } else if (dmArchivedCount > 0) {
                            "Archived ($dmArchivedCount)"
                        } else {
                            "Archived"
                        },
                        color = if (showArchivedDms) palette.textPrimary else palette.textSecondary,
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
                    /* ---- P2P 1:1 Direct Message Rows + Manual Encrypted Groups ---- */
                    items(orderedDmKeys, key = { it }) { threadKey ->
                        val isPinned = state.chatOrganization.pinnedIds.contains(threadKey)
                        if (threadKey.startsWith("group:")) {
                            val gid = threadKey.removePrefix("group:")
                            val grp = groupById[gid]
                            if (grp != null) {
                                val grpTypingText = state.typingByGroup[grp.id]
                                    ?.takeIf { it.isNotEmpty() }
                                    ?.let { formatTypingUsersLabel(it) }
                                GroupSidebarRow(
                                    group = grp,
                                    myUserId = me?.id.orEmpty(),
                                    isSelected = state.activeGroupId == grp.id,
                                    isPinned = isPinned,
                                    draftText = state.drafts["group:${grp.id}"],
                                    typingLabel = grpTypingText,
                                    onClick = { vm.openGroupChat(grp.id) },
                                    onLongClick = { holdTarget = SidebarHoldTarget.Group(grp) },
                                )
                            }
                        } else {
                            val fid = threadKey.removePrefix("dm:")
                            val friend = friendById[fid]
                            if (friend != null) {
                                val isSelf = me != null && friend.id == me.id
                                val prev = previewByFriend[friend.id]
                                val act = activityByFriend[friend.id]
                                DmSidebarRow(
                                    friend = friend,
                                    preview = prev,
                                    myUserId = me?.id.orEmpty(),
                                    isSelf = isSelf,
                                    isSelected = state.activeChatId == friend.id,
                                    isPinned = isPinned,
                                    draftText = state.drafts["dm:${friend.id}"],
                                    presenceStatus = if (isSelf) "online" else (act?.status ?: "offline"),
                                    typingToMe = !isSelf && typingDmSenders.contains(friend.id),
                                    onClick = { vm.openDmChat(friend.id) },
                                    onAvatarClick = { onOpenProfile(friend) },
                                    onLongClick = {
                                        if (!isSelf) {
                                            holdTarget = SidebarHoldTarget.Dm(friend, prev)
                                        }
                                    },
                                )
                            }
                        }
                    }

                    /* ---- Empty State (`.empty-box`) ---- */
                    if (orderedDmKeys.isEmpty()) {
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
                                if (state.friends.isEmpty() && !showArchivedDms) {
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
                                        text = "Add someone by their username. Once they accept, you can start texting!",
                                        color = palette.textSecondary,
                                        fontSize = 13.sp,
                                        textAlign = TextAlign.Center,
                                    )
                                    JaWebPrimaryButton(
                                        text = "Add a friend",
                                        onClick = { showAddFriendsView = true },
                                    )
                                } else {
                                    Text(
                                        text = if (showArchivedDms) "No archived chats." else "No chats match your search.",
                                        color = palette.textSecondary,
                                        fontSize = 14.sp,
                                    )
                                }
                            }
                        }
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
                            val sender = req.from.takeIf { it.id.isNotBlank() && it.id != me?.id }
                                ?: req.peerFor(me?.id)
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
                                    avatarUrl = sender.avatarUrl,
                                    displayName = sender.displayName.ifBlank { sender.username },
                                    avatarColor = sender.avatarColor,
                                    size = 42.dp,
                                    ringWidth = 2.5.dp,
                                    modifier = Modifier.clickable { onOpenProfile(sender) },
                                )
                                Spacer(Modifier.width(10.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = sender.displayName.ifBlank { sender.username },
                                        color = palette.textPrimary,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.5.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        text = "@${sender.username}",
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

                    /* ---- Outgoing Sent Requests (Fixed: shows `req.to`, NOT `req.from`!) ---- */
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
                            val recipient = req.to.takeIf { it.id.isNotBlank() && it.id != me?.id }
                                ?: req.peerFor(me?.id)
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
                                    avatarUrl = recipient.avatarUrl,
                                    displayName = recipient.displayName.ifBlank { recipient.username },
                                    avatarColor = recipient.avatarColor,
                                    size = 40.dp,
                                    ringWidth = 2.5.dp,
                                    modifier = Modifier.clickable { onOpenProfile(recipient) },
                                )
                                Spacer(Modifier.width(10.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = recipient.displayName.ifBlank { recipient.username },
                                        color = palette.textPrimary,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                    )
                                    Text(
                                        text = "@${recipient.username}",
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

        /* ==================== Layer 2: Floating 5-Tab Liquid Glass Bottom Navigation Bar (1:1 image (1).png) ==================== */
        AnimatedVisibility(
            visible = !isImeVisible && !settingsSubOverlayOpen,
            enter = fadeIn(tween(180)) + slideInVertically(tween(220)) { it / 2 },
            exit = fadeOut(tween(140)) + slideOutVertically(tween(180)) { it / 2 },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            val selectedNavIndex = BOTTOM_NAV_TAB_IDS.indexOf(activeTab).let { if (it >= 0) it else 3 }
            val activeNavTint = if (palette.isDark) Color.White else Color(0xFF1C1C1E)
            val inactiveNavTint = if (palette.isDark) Color(0xFFE5E5EA).copy(alpha = 0.86f) else Color(0xFF2C2C2E).copy(alpha = 0.88f)
            val bottomNavWeights = remember { listOf(0.94f, 0.86f, 1.46f, 0.94f, 0.80f) }
            LiquidBottomTabs(
                selectedTabIndex = { selectedNavIndex },
                onTabSelected = { idx ->
                    val nextTab = BOTTOM_NAV_TAB_IDS.getOrElse(idx) { "chats" }
                    showAddFriendsView = false
                    if (nextTab != activeTab && isSearchOpen) {
                        isSearchOpen = false
                        searchQuery = ""
                    }
                    if (activeTab != nextTab) {
                        vm.setSidebarTab(nextTab)
                    }
                },
                backdrop = contentBackdrop,
                tabsCount = BOTTOM_NAV_TAB_IDS.size,
                tabWeights = bottomNavWeights,
                modifier = Modifier.fillMaxWidth(),
                isLightTheme = !palette.isDark,
                accentColor = activeNavTint,
                inactiveColor = inactiveNavTint,
            ) {
                /* 1. Updates */
                LiquidBottomTab(
                    weight = bottomNavWeights[0],
                    onClick = {
                        showAddFriendsView = false
                        isSearchOpen = false
                        searchQuery = ""
                        vm.setSidebarTab("updates")
                    },
                ) {
                    val tabTint = LocalLiquidBottomTabContentColor.current
                    val isSel = activeTab == "updates"
                    IosUpdatesNavIcon(tint = tabTint, selected = isSel, size = 23.dp)
                    Text(
                        text = "Updates",
                        color = tabTint,
                        fontSize = 10.5.sp,
                        fontWeight = if (isSel) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Clip,
                    )
                }

                /* 2. Calls */
                LiquidBottomTab(
                    weight = bottomNavWeights[1],
                    onClick = {
                        showAddFriendsView = false
                        isSearchOpen = false
                        searchQuery = ""
                        vm.setSidebarTab("calls")
                    },
                ) {
                    val tabTint = LocalLiquidBottomTabContentColor.current
                    val isSel = activeTab == "calls"
                    IosCallsNavIcon(tint = tabTint, selected = isSel, size = 22.dp)
                    Text(
                        text = com.ahad00010.jatext.data.jt("nav.calls"),
                        color = tabTint,
                        fontSize = 10.5.sp,
                        fontWeight = if (isSel) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Clip,
                    )
                }

                /* 3. Communities (1:1 Communities 3-person icon with full unclipped "Communities" label) */
                LiquidBottomTab(
                    weight = bottomNavWeights[2],
                    onClick = {
                        showAddFriendsView = false
                        if (activeTab != "communities") {
                            isSearchOpen = false
                            searchQuery = ""
                        }
                        vm.setSidebarTab("communities")
                    },
                ) {
                    val tabTint = LocalLiquidBottomTabContentColor.current
                    val isSel = activeTab == "communities"
                    Box(contentAlignment = Alignment.Center) {
                        IosGroupsNavIcon(tint = tabTint, selected = isSel, size = 24.dp)
                        if (totalGroupUnreadCount > 0) {
                            LiquidTabBadgePill(
                                count = totalGroupUnreadCount,
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .offset(x = 9.dp, y = (-4).dp),
                            )
                        }
                    }
                    Text(
                        text = "Communities",
                        color = tabTint,
                        fontSize = 10.5.sp,
                        fontWeight = if (isSel) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Clip,
                    )
                }

                /* 4. Chats (Default 4th tab, P2P chats only, 1:1 dual speech bubbles) */
                LiquidBottomTab(
                    weight = bottomNavWeights[3],
                    onClick = {
                        showAddFriendsView = false
                        if (activeTab != "chats") {
                            isSearchOpen = false
                            searchQuery = ""
                        }
                        vm.setSidebarTab("chats")
                    },
                ) {
                    val tabTint = LocalLiquidBottomTabContentColor.current
                    val isSel = activeTab == "chats" && !showAddFriendsView
                    Box(contentAlignment = Alignment.Center) {
                        IosChatsNavIcon(tint = tabTint, selected = isSel, size = 24.dp)
                        if (totalDmUnreadCount > 0) {
                            LiquidTabBadgePill(
                                count = totalDmUnreadCount,
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .offset(x = 9.dp, y = (-4).dp),
                            )
                        }
                    }
                    Text(
                        text = com.ahad00010.jatext.data.jt("nav.chats"),
                        color = tabTint,
                        fontSize = 10.5.sp,
                        fontWeight = if (isSel) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Clip,
                    )
                }

                /* 5. You (Shows user's circular PFP + "You", opens Settings) */
                LiquidBottomTab(
                    weight = bottomNavWeights[4],
                    onClick = {
                        showAddFriendsView = false
                        isSearchOpen = false
                        searchQuery = ""
                        vm.setSidebarTab("you")
                    },
                ) {
                    val tabTint = LocalLiquidBottomTabContentColor.current
                    val isSel = activeTab == "you"
                    val ringColor = if (isSel) {
                        tabTint
                    } else if (palette.isDark) {
                        Color.White.copy(alpha = 0.40f)
                    } else {
                        Color.Black.copy(alpha = 0.25f)
                    }
                    Box(
                        modifier = Modifier
                            .size(25.dp)
                            .clip(CircleShape)
                            .border(width = if (isSel) 1.7.dp else 1.25.dp, color = ringColor, shape = CircleShape)
                            .padding(1.5.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (me != null) {
                            JaAvatar(
                                avatarUrl = me.avatarUrl,
                                displayName = me.displayName.ifBlank { me.username },
                                avatarColor = me.avatarColor,
                                size = 22.dp,
                                ringWidth = 0.dp,
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .clip(CircleShape)
                                    .background(palette.accent)
                            )
                        }
                    }
                    Text(
                        text = "You",
                        color = tabTint,
                        fontSize = 10.5.sp,
                        fontWeight = if (isSel) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
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
                        val dmKey = "dm:${target.friend.id}"
                        val isPinned = state.chatOrganization.pinnedIds.contains(dmKey)
                        val isMuted = target.preview?.isMuted == true
                        val isArchived = target.preview?.isArchived == true
                        Text(
                            text = target.friend.displayName.ifBlank { target.friend.username },
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp,
                            modifier = Modifier.padding(bottom = 10.dp),
                        )
                        ContextActionItem(
                            icon = Icons.Rounded.PushPin,
                            label = if (isPinned) com.ahad00010.jatext.data.jt("sidebar.unpin") else com.ahad00010.jatext.data.jt("sidebar.pin"),
                            onClick = {
                                vm.togglePinThread(dmKey)
                                holdTarget = null
                            }
                        )
                        ContextActionItem(
                            icon = Icons.Rounded.ArrowUpward,
                            label = com.ahad00010.jatext.data.jt("sidebar.moveUp"),
                            onClick = {
                                vm.moveThreadInOrder(orderedDmKeys, dmKey, -1)
                                holdTarget = null
                            }
                        )
                        ContextActionItem(
                            icon = Icons.Rounded.ArrowDownward,
                            label = com.ahad00010.jatext.data.jt("sidebar.moveDown"),
                            onClick = {
                                vm.moveThreadInOrder(orderedDmKeys, dmKey, 1)
                                holdTarget = null
                            }
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
                        val grpKey = "group:${grp.id}"
                        val isPinned = state.chatOrganization.pinnedIds.contains(grpKey)
                        val isOwner = grp.myRole == "owner" || grp.ownerId == me?.id
                        Text(
                            text = grp.name,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp,
                            modifier = Modifier.padding(bottom = 10.dp),
                        )
                        ContextActionItem(
                            icon = Icons.Rounded.PushPin,
                            label = if (isPinned) com.ahad00010.jatext.data.jt("sidebar.unpin") else com.ahad00010.jatext.data.jt("sidebar.pin"),
                            onClick = {
                                vm.togglePinThread(grpKey)
                                holdTarget = null
                            }
                        )
                        ContextActionItem(
                            icon = Icons.Rounded.ArrowUpward,
                            label = com.ahad00010.jatext.data.jt("sidebar.moveUp"),
                            onClick = {
                                vm.moveThreadInOrder(orderedGroupKeys, grpKey, -1)
                                holdTarget = null
                            }
                        )
                        ContextActionItem(
                            icon = Icons.Rounded.ArrowDownward,
                            label = com.ahad00010.jatext.data.jt("sidebar.moveDown"),
                            onClick = {
                                vm.moveThreadInOrder(orderedGroupKeys, grpKey, 1)
                                holdTarget = null
                            }
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
                                label = if (grp.isCommunity) "Leave community" else "Leave group",
                                tint = palette.danger,
                                onClick = {
                                    vm.leaveGroup(grp.id)
                                    holdTarget = null
                                }
                            )
                        } else {
                            // ONLY the owner gets "Delete community/group" (2-step + exact name!)
                            ContextActionItem(
                                icon = Icons.Rounded.DeleteForever,
                                label = if (grp.isCommunity) "Delete community" else "Delete group",
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

    /* ==================== Owner-Only 2-Step Exact-Name Deletion Modal ==================== */
    ownerDeleteTarget?.let { grp ->
        val delEntityLower = if (grp.isCommunity) "community" else "group"
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
                    text = if (ownerDeleteStep == 1) "Delete \"${grp.name}\"?" else "Confirm exact $delEntityLower name",
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
                        text = "Type \"${grp.name}\" below to permanently delete this $delEntityLower for everyone:",
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

    /* ==================== Create E2EE Community Dialog ("Add Communities") ==================== */
    if (showCreateCommunityDialog) {
        var commName by remember { mutableStateOf("") }
        var commDescription by remember { mutableStateOf("") }
        var commColor by remember { mutableStateOf("purple") }
        var commAvatarUri by remember { mutableStateOf<Uri?>(null) }
        val commImagePicker = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.GetContent()
        ) { uri ->
            if (uri != null) commAvatarUri = uri
        }
        val colorChoices = remember {
            JaTextThemeManager.COMMUNITY_AVATAR_COLOR_IDS
        }

        Dialog(onDismissRequest = { showCreateCommunityDialog = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(22.dp))
                    .background(palette.bgSecondary)
                    .border(1.dp, palette.border, RoundedCornerShape(22.dp))
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = "Add Communities",
                            color = palette.textPrimary,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Lock,
                                contentDescription = null,
                                tint = palette.accent,
                                modifier = Modifier.size(12.dp),
                            )
                            Text(
                                text = "End-to-end encrypted community",
                                color = palette.accent,
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                    JaWebIconButton(
                        icon = Icons.Rounded.Close,
                        contentDescription = "Close",
                        size = 34.dp,
                        iconSize = 16.dp,
                        onClick = { showCreateCommunityDialog = false },
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    val chosenSpec = remember(commColor) { JaTextThemeManager.avatarColorSpec(commColor) }
                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .clip(CircleShape)
                            .background(Brush.linearGradient(colors = chosenSpec.gradientStops))
                            .border(3.dp, chosenSpec.ringColor, CircleShape)
                            .clickable { commImagePicker.launch("image/*") },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (commAvatarUri != null) {
                            AsyncImage(
                                model = commAvatarUri,
                                contentDescription = "Community PFP",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .fillMaxSize()
                                    .clip(CircleShape),
                            )
                        } else {
                            Text(
                                text = commName.trim().take(1).uppercase().ifBlank { "#" },
                                color = Color.White,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Black,
                            )
                        }
                    }
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        JaWebGhostButton(
                            text = if (commAvatarUri != null) "Change PFP" else "Upload PFP",
                            onClick = { commImagePicker.launch("image/*") },
                        )
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            colorChoices.forEach { cKey ->
                                val cSpec = JaTextThemeManager.avatarColorSpec(cKey)
                                val selected = commColor == cKey
                                Box(
                                    modifier = Modifier
                                        .size(24.dp)
                                        .clip(CircleShape)
                                        .background(Brush.linearGradient(cSpec.gradientStops))
                                        .border(
                                            width = if (selected) 2.5.dp else 1.dp,
                                            color = if (selected) Color.White else Color.Transparent,
                                            shape = CircleShape,
                                        )
                                        .clickable { commColor = cKey }
                                )
                            }
                        }
                    }
                }

                JaWebInput(
                    value = commName,
                    onValueChange = { if (it.length <= 60) commName = it },
                    label = "Community name",
                    placeholder = "Anime Lounge, Indie Builders...",
                )
                JaWebInput(
                    value = commDescription,
                    onValueChange = { if (it.length <= 160) commDescription = it },
                    label = "About this community (optional)",
                    placeholder = "Join and hang out with everyone...",
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    JaWebGhostButton(
                        text = "Cancel",
                        onClick = { showCreateCommunityDialog = false },
                    )
                    Spacer(Modifier.width(8.dp))
                    JaWebPrimaryButton(
                        text = "Create Community",
                        enabled = commName.trim().isNotEmpty(),
                        onClick = {
                            vm.createNewCommunity(
                                name = commName.trim(),
                                description = commDescription.trim(),
                                avatarColor = commColor,
                                avatarUri = commAvatarUri,
                            )
                            showCreateCommunityDialog = false
                        },
                    )
                }
            }
        }
    }

    /* ==================== Folder Editor Dialog ==================== */
    if (showFolderEditorDialog) {
        val initialSpec = editingFolderSpec
        var folderName by remember(initialSpec?.id) { mutableStateOf(initialSpec?.name.orEmpty()) }
        val selectedThreadKeys = remember(initialSpec?.id) {
            mutableStateListOf<String>().apply {
                initialSpec?.threadIds?.let { addAll(it) }
            }
        }
        Dialog(onDismissRequest = { showFolderEditorDialog = false }) {
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
                        text = if (initialSpec != null) "Edit folder" else "New folder",
                        color = palette.textPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    JaWebIconButton(
                        icon = Icons.Rounded.Close,
                        contentDescription = "Close",
                        size = 34.dp,
                        iconSize = 16.dp,
                        onClick = { showFolderEditorDialog = false },
                    )
                }
                JaWebInput(
                    value = folderName,
                    onValueChange = { folderName = it },
                    label = "Folder name",
                    placeholder = "Work, Family, Gaming...",
                )
                Text(
                    text = "Select chats & groups (${selectedThreadKeys.size})",
                    color = palette.textSecondary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 240.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(state.groups, key = { "fgrp:${it.id}" }) { grp ->
                        val tKey = "group:${grp.id}"
                        val checked = selectedThreadKeys.contains(tKey)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(11.dp))
                                .background(palette.bgTertiary)
                                .clickable {
                                    if (checked) selectedThreadKeys.remove(tKey) else selectedThreadKeys.add(tKey)
                                }
                                .padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            JaGroupAvatar(avatarUrl = grp.avatarUrl, name = grp.name, size = 32.dp, ringWidth = 2.dp)
                            Spacer(Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(grp.name, color = palette.textPrimary, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                                Text(
                                    if (grp.isCommunity) "Community" else "Group",
                                    color = palette.textSecondary,
                                    fontSize = 11.5.sp,
                                )
                            }
                            Checkbox(
                                checked = checked,
                                onCheckedChange = {
                                    if (it) selectedThreadKeys.add(tKey) else selectedThreadKeys.remove(tKey)
                                },
                                colors = CheckboxDefaults.colors(checkedColor = palette.accent, checkmarkColor = palette.accentDark),
                            )
                        }
                    }
                    items(state.friends, key = { "fdm:${it.id}" }) { f ->
                        val tKey = "dm:${f.id}"
                        val checked = selectedThreadKeys.contains(tKey)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(11.dp))
                                .background(palette.bgTertiary)
                                .clickable {
                                    if (checked) selectedThreadKeys.remove(tKey) else selectedThreadKeys.add(tKey)
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
                                    f.displayName.ifBlank { f.username },
                                    color = palette.textPrimary,
                                    fontSize = 13.5.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text("@${f.username}", color = palette.textSecondary, fontSize = 11.5.sp)
                            }
                            Checkbox(
                                checked = checked,
                                onCheckedChange = {
                                    if (it) selectedThreadKeys.add(tKey) else selectedThreadKeys.remove(tKey)
                                },
                                colors = CheckboxDefaults.colors(checkedColor = palette.accent, checkmarkColor = palette.accentDark),
                            )
                        }
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (initialSpec != null) {
                        JaWebDangerButton(
                            text = "Delete",
                            onClick = {
                                vm.deleteChatFolder(initialSpec.id)
                                if (activeFolderId == initialSpec.id) activeFolderId = "all"
                                showFolderEditorDialog = false
                            },
                        )
                    } else {
                        Spacer(Modifier.width(4.dp))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        JaWebGhostButton(
                            text = "Cancel",
                            onClick = { showFolderEditorDialog = false },
                        )
                        Spacer(Modifier.width(8.dp))
                        JaWebPrimaryButton(
                            text = "Save",
                            enabled = folderName.trim().isNotEmpty(),
                            onClick = {
                                vm.saveChatFolder(initialSpec?.id, folderName.trim(), selectedThreadKeys.toList())
                                showFolderEditorDialog = false
                            },
                        )
                    }
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

@Composable
private fun SidebarAlwaysSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    placeholder: String,
    onClear: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.008f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessMediumLow,
        ),
        label = "searchScale",
    )
    val showCancel = focused || query.isNotEmpty()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        JaWebInput(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.weight(1f),
            inputModifier = Modifier.onFocusChanged { focused = it.isFocused },
            placeholder = placeholder,
            leadingIcon = Icons.Rounded.Search,
            trailingContent = if (query.isNotEmpty()) {
                {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "Clear search",
                        tint = palette.textSecondary,
                        modifier = Modifier
                            .size(17.dp)
                            .clip(CircleShape)
                            .clickable { onQueryChange("") },
                    )
                }
            } else {
                null
            },
        )
        AnimatedVisibility(
            visible = showCancel,
            enter = fadeIn(tween(170)) + scaleIn(tween(170), initialScale = 0.92f),
            exit = fadeOut(tween(130)) + scaleOut(tween(130), targetScale = 0.92f),
        ) {
            Text(
                text = "Cancel",
                color = palette.accent,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = com.ahad00010.jatext.ui.theme.SfProTextFontFamily,
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .clickable { onClear() }
                    .padding(horizontal = 6.dp, vertical = 8.dp),
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DmSidebarRow(
    friend: JaUser,
    preview: ChatPreview?,
    myUserId: String,
    isSelf: Boolean = false,
    isSelected: Boolean,
    isPinned: Boolean = false,
    draftText: String? = null,
    presenceStatus: String,
    typingToMe: Boolean,
    onClick: () -> Unit,
    onAvatarClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val unread = if (isSelf || isSelected) 0 else (preview?.unreadCount ?: 0)
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
                val baseName = friend.displayName.ifBlank { friend.username }
                Text(
                    text = if (isSelf) "$baseName (You)" else baseName,
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
                    if (isPinned) {
                        Icon(
                            imageVector = Icons.Rounded.PushPin,
                            contentDescription = "Pinned",
                            tint = palette.accent,
                            modifier = Modifier.size(13.dp),
                        )
                    }
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
            val cleanDraft = draftText?.trim().orEmpty()
            val hasDraft = cleanDraft.isNotEmpty()
            val cleanPreviewBody = preview?.body?.takeUnless {
                JaTextCryptoEngine.isRawWireOrCorruptedPreview(it)
            }.orEmpty()
            val previewCopy = when {
                typingToMe -> "typing…"
                hasDraft -> "${com.ahad00010.jatext.data.jt("sidebar.draft")}: $cleanDraft"
                cleanPreviewBody.isNotBlank() && cleanPreviewBody != "No messages yet" -> {
                    val prefix = if (preview?.senderId == myUserId) "You: " else ""
                    "$prefix$cleanPreviewBody"
                }
                isSelf -> "Message yourself"
                else -> "@${friend.username}"
            }
            val previewAnnotated = remember(previewCopy, palette.isDark) {
                buildPreviewAnnotatedWithSpoilers(previewCopy, isDark = palette.isDark)
            }
            Text(
                text = previewAnnotated,
                color = when {
                    typingToMe || hasDraft -> palette.accent
                    unread > 0 -> palette.textPrimary
                    else -> palette.textSecondary
                },
                fontSize = 13.sp,
                fontWeight = if (unread > 0 || typingToMe || hasDraft) FontWeight.SemiBold else FontWeight.Normal,
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
    isPinned: Boolean = false,
    draftText: String? = null,
    typingLabel: String? = null,
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
            avatarColor = group.avatarColor,
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
                    if (isPinned) {
                        Icon(
                            imageVector = Icons.Rounded.PushPin,
                            contentDescription = "Pinned",
                            tint = palette.accent,
                            modifier = Modifier.size(13.dp),
                        )
                    }
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
            val cleanDraft = draftText?.trim().orEmpty()
            val hasDraft = cleanDraft.isNotEmpty()
            val hasTyping = !typingLabel.isNullOrBlank()
            val cleanGroupLastMsg = group.lastMessage.takeUnless {
                JaTextCryptoEngine.isRawWireOrCorruptedPreview(it)
            }.orEmpty()
            val subText = when {
                hasTyping -> typingLabel.orEmpty()
                hasDraft -> "${com.ahad00010.jatext.data.jt("sidebar.draft")}: $cleanDraft"
                cleanGroupLastMsg.isNotBlank() -> {
                    val prefix = when {
                        group.lastSenderId == myUserId -> "You: "
                        !group.lastSenderName.isNullOrBlank() -> "${group.lastSenderName}: "
                        else -> ""
                    }
                    "$prefix$cleanGroupLastMsg"
                }
                else -> "${group.memberCount} members"
            }
            val subAnnotated = remember(subText, palette.isDark) {
                buildPreviewAnnotatedWithSpoilers(subText, isDark = palette.isDark)
            }
            Text(
                text = subAnnotated,
                color = when {
                    hasTyping || hasDraft -> palette.accent
                    unread > 0 -> palette.textPrimary
                    else -> palette.textSecondary
                },
                fontSize = 13.sp,
                fontWeight = if (unread > 0 || hasTyping || hasDraft) FontWeight.SemiBold else FontWeight.Normal,
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
private fun ExploreCommunityRow(
    community: ExploreCommunitySummary,
    isJoined: Boolean,
    isJoining: Boolean,
    onAction: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val outlineColor = remember(community.avatarColor) {
        JaTextThemeManager.avatarColorSpec(community.avatarColor.ifBlank { "purple" }).ringColor
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(palette.bgTertiary)
            .border(1.dp, outlineColor.copy(alpha = 0.45f), RoundedCornerShape(16.dp))
            .clickable { onAction() }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        JaGroupAvatar(
            avatarUrl = community.avatarUrl,
            name = community.name,
            size = 50.dp,
            ringWidth = 2.8.dp,
            avatarColor = community.avatarColor.ifBlank { "purple" },
        )
        Spacer(Modifier.width(12.dp))
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = community.name,
                    color = palette.textPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(palette.accentSoft)
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Lock,
                        contentDescription = "E2EE",
                        tint = palette.accent,
                        modifier = Modifier.size(10.dp),
                    )
                    Text(
                        text = "E2EE",
                        color = palette.accent,
                        fontSize = 9.5.sp,
                        fontWeight = FontWeight.Black,
                    )
                }
            }
            if (community.description.isNotBlank()) {
                Text(
                    text = community.description,
                    color = palette.textSecondary,
                    fontSize = 12.5.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(7.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF22C55E))
                )
                Text(
                    text = "${community.memberCount} ${if (community.memberCount == 1) "member" else "members"}",
                    color = palette.textSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        Spacer(Modifier.width(10.dp))
        if (isJoined) {
            JaWebGhostButton(
                text = "Open",
                onClick = onAction,
            )
        } else {
            JaWebPrimaryButton(
                text = if (isJoining) "Joining..." else "Join",
                enabled = !isJoining,
                onClick = onAction,
            )
        }
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
            .defaultMinSize(minWidth = 17.dp, minHeight = 17.dp)
            .clip(CircleShape)
            .background(Color(0xFF42A85F))
            .padding(horizontal = 4.5.dp, vertical = 1.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            lineHeight = 11.sp,
            maxLines = 1,
        )
    }
}

@Composable
fun ExploreCommunitiesScreen(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
) {
    val palette = LocalJaTextPalette.current
    val focusManager = LocalFocusManager.current
    var query by remember { mutableStateOf("") }
    var showCreateDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        vm.refreshExploreCommunities()
    }

    BackHandler {
        if (query.isNotEmpty()) {
            query = ""
            focusManager.clearFocus()
        } else {
            vm.closeExploreCommunities()
        }
    }

    val joinedCommunityIds = remember(state.groups) {
        state.groups.filter { it.isCommunity }.map { it.id }.toSet()
    }
    val visibleCommunities = remember(state.exploreCommunities, query) {
        val q = query.trim().lowercase()
        state.exploreCommunities.filter { comm ->
            q.isEmpty() ||
                comm.name.lowercase().contains(q) ||
                comm.description.lowercase().contains(q)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bgPrimary)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(palette.bgSecondary)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            JaWebIconButton(
                icon = Icons.AutoMirrored.Rounded.ArrowBack,
                contentDescription = "Back to Communities",
                size = 36.dp,
                iconSize = 18.dp,
                onClick = { vm.closeExploreCommunities() },
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Explore Communities",
                    color = palette.textPrimary,
                    fontSize = 17.5.sp,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "Join and find communities to hang out with.",
                    color = palette.textSecondary,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            JaWebGhostButton(
                text = "Create",
                leadingIcon = Icons.Rounded.Add,
                onClick = { showCreateDialog = true },
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SidebarAlwaysSearchBar(
                query = query,
                onQueryChange = { query = it },
                placeholder = "Search public communities...",
                onClear = {
                    query = ""
                    focusManager.clearFocus()
                },
            )

            if (visibleCommunities.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 18.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(palette.bgSecondary)
                        .border(1.dp, palette.border, RoundedCornerShape(18.dp))
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = if (query.isBlank()) "No public communities yet" else "No matching communities found",
                        color = palette.textPrimary,
                        fontSize = 15.5.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = if (query.isBlank()) {
                            "Be the first to launch an end-to-end encrypted community for everyone to join!"
                        } else {
                            "Try a different keyword or create your own community."
                        },
                        color = palette.textSecondary,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(bottom = 24.dp),
                ) {
                    items(visibleCommunities, key = { "explore-page:${it.id}" }) { comm ->
                        val alreadyJoined = comm.isJoined || joinedCommunityIds.contains(comm.id)
                        val joining = state.joiningCommunityId == comm.id
                        ExploreCommunityRow(
                            community = comm,
                            isJoined = alreadyJoined,
                            isJoining = joining,
                            onAction = {
                                if (alreadyJoined) {
                                    vm.openGroupChat(comm.id)
                                } else {
                                    vm.joinCommunity(comm.id)
                                }
                            },
                        )
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        var commName by remember { mutableStateOf("") }
        var commDescription by remember { mutableStateOf("") }
        var commColor by remember { mutableStateOf("purple") }
        var commAvatarUri by remember { mutableStateOf<Uri?>(null) }
        val commImagePicker = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.GetContent()
        ) { uri ->
            if (uri != null) commAvatarUri = uri
        }
        Dialog(onDismissRequest = { showCreateDialog = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(22.dp))
                    .background(palette.bgSecondary)
                    .border(1.dp, palette.border, RoundedCornerShape(22.dp))
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Add Communities",
                        color = palette.textPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    JaWebIconButton(
                        icon = Icons.Rounded.Close,
                        contentDescription = "Close",
                        size = 34.dp,
                        iconSize = 16.dp,
                        onClick = { showCreateDialog = false },
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    val chosenSpec = remember(commColor) { JaTextThemeManager.avatarColorSpec(commColor) }
                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .clip(CircleShape)
                            .background(Brush.linearGradient(colors = chosenSpec.gradientStops))
                            .border(3.dp, chosenSpec.ringColor, CircleShape)
                            .clickable { commImagePicker.launch("image/*") },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (commAvatarUri != null) {
                            AsyncImage(
                                model = commAvatarUri,
                                contentDescription = "Community PFP",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .fillMaxSize()
                                    .clip(CircleShape),
                            )
                        } else {
                            Text(
                                text = commName.trim().take(1).uppercase().ifBlank { "#" },
                                color = Color.White,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Black,
                            )
                        }
                    }
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        JaWebGhostButton(
                            text = if (commAvatarUri != null) "Change PFP" else "Upload PFP",
                            onClick = { commImagePicker.launch("image/*") },
                        )
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            JaTextThemeManager.COMMUNITY_AVATAR_COLOR_IDS.forEach { cKey ->
                                val cSpec = JaTextThemeManager.avatarColorSpec(cKey)
                                val selected = commColor == cKey
                                Box(
                                    modifier = Modifier
                                        .size(24.dp)
                                        .clip(CircleShape)
                                        .background(Brush.linearGradient(cSpec.gradientStops))
                                        .border(
                                            width = if (selected) 2.5.dp else 1.dp,
                                            color = if (selected) Color.White else Color.Transparent,
                                            shape = CircleShape,
                                        )
                                        .clickable { commColor = cKey }
                                )
                            }
                        }
                    }
                }
                JaWebInput(
                    value = commName,
                    onValueChange = { if (it.length <= 60) commName = it },
                    label = "Community name",
                    placeholder = "Anime Lounge, Indie Builders...",
                )
                JaWebInput(
                    value = commDescription,
                    onValueChange = { if (it.length <= 240) commDescription = it },
                    label = "Description (optional)",
                    placeholder = "What is your community about?",
                    singleLine = false,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                ) {
                    JaWebGhostButton(
                        text = "Cancel",
                        onClick = { showCreateDialog = false },
                    )
                    JaWebPrimaryButton(
                        text = "Create Community",
                        enabled = commName.trim().isNotEmpty(),
                        onClick = {
                            val n = commName.trim()
                            val d = commDescription.trim()
                            val c = commColor
                            val u = commAvatarUri
                            showCreateDialog = false
                            vm.createNewCommunity(
                                name = n,
                                description = d,
                                avatarColor = c,
                                avatarUri = u,
                            )
                        },
                    )
                }
            }
        }
    }
}


