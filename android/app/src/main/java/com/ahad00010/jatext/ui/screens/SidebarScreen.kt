package com.ahad00010.jatext.ui.screens

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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.CallMade
import androidx.compose.material.icons.rounded.CallReceived
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.ExitToApp
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.GroupAdd
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.NotificationsOff
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material.icons.rounded.Unarchive
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahad00010.jatext.R
import com.ahad00010.jatext.data.CallHistoryEntry
import com.ahad00010.jatext.data.ChatPreview
import com.ahad00010.jatext.data.GroupSummary
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.state.SessionUiState
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.icons.OwnerCrownVectorBadge
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private sealed interface SidebarHoldTarget {
    data object Community : SidebarHoldTarget
    data class Dm(val friend: JaUser, val preview: ChatPreview?) : SidebarHoldTarget
    data class Group(val group: GroupSummary) : SidebarHoldTarget
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun SidebarScreen(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    onOpenSettings: () -> Unit,
    onInstallUpdate: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val me = state.me

    var searchQuery by remember { mutableStateOf("") }
    var activeTab by remember { mutableStateOf("chats") } // chats | groups | friends | requests | calls | archived
    var showAccountSwitcher by remember { mutableStateOf(false) }
    var showAddFriendDialog by remember { mutableStateOf(false) }
    var showCreateGroupDialog by remember { mutableStateOf(false) }
    var holdTarget by remember { mutableStateOf<SidebarHoldTarget?>(null) }

    // 2-step Owner Group Deletion confirmation state
    var ownerDeleteTarget by remember { mutableStateOf<GroupSummary?>(null) }
    var ownerDeleteStep by remember { mutableIntStateOf(1) }
    var ownerDeleteTypedName by remember { mutableStateOf("") }

    val previewByFriend = remember(state.previews) { state.previews.associateBy { it.friendId } }
    val activityByFriend = remember(state.friendActivities) { state.friendActivities.associateBy { it.userId } }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .then(
                if (palette.rootGradientBrush != null) {
                    Modifier.background(palette.rootGradientBrush)
                } else {
                    Modifier.background(palette.bgPrimary)
                }
            )
            .statusBarsPadding()
            .navigationBarsPadding()
    ) {
        /* ==================== Top Header Bar ==================== */
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { showAccountSwitcher = true }
                    .padding(vertical = 4.dp, horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                JaAvatar(
                    avatarUrl = me?.avatarUrl,
                    displayName = me?.displayName?.ifBlank { me.username } ?: "JaText",
                    avatarColor = me?.avatarColor,
                    size = 40.dp,
                    presenceStatus = me?.statusPreference ?: "online",
                    statusBorderColor = palette.bgPrimary,
                )
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f, fill = false)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = me?.displayName?.ifBlank { me.username } ?: "JaText",
                            color = palette.textPrimary,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (me?.isOwner == true) {
                            Spacer(Modifier.width(5.dp))
                            OwnerCrownVectorBadge(size = 14.dp)
                        }
                        Spacer(Modifier.width(3.dp))
                        Icon(
                            imageVector = Icons.Rounded.KeyboardArrowDown,
                            contentDescription = "Switch account",
                            tint = palette.textSecondary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    Text(
                        text = if (!me?.customStatus.isNullOrBlank()) {
                            me?.customStatus.orEmpty()
                        } else {
                            "@${me?.username.orEmpty()}"
                        },
                        color = palette.textSecondary,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            IconButton(onClick = { showAddFriendDialog = true }) {
                Icon(
                    imageVector = Icons.Rounded.PersonAdd,
                    contentDescription = "Add Friend",
                    tint = palette.textPrimary,
                )
            }
            IconButton(onClick = { showCreateGroupDialog = true }) {
                Icon(
                    imageVector = Icons.Rounded.GroupAdd,
                    contentDescription = "Create Group",
                    tint = palette.textPrimary,
                )
            }
            IconButton(onClick = onOpenSettings) {
                Icon(
                    imageVector = Icons.Rounded.Settings,
                    contentDescription = "Settings",
                    tint = palette.textPrimary,
                )
            }
        }

        /* ==================== Mobile-Only OTA Update Banner ==================== */
        state.availableUpdate?.let { manifest ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(palette.accentSoft)
                    .border(1.dp, palette.accent, RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 11.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Rounded.SystemUpdate,
                        contentDescription = null,
                        tint = palette.accent,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(9.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Update your JaText version!",
                            color = palette.textPrimary,
                            fontSize = 13.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "v${manifest.versionName} (Build ${manifest.versionCode}) is ready to install.",
                            color = palette.textSecondary,
                            fontSize = 11.5.sp,
                        )
                    }
                    if (!state.updateDownloading) {
                        Button(
                            onClick = onInstallUpdate,
                            colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.height(34.dp),
                        ) {
                            Text("Update", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        }
                        IconButton(onClick = { vm.dismissUpdatePrompt() }, modifier = Modifier.size(30.dp)) {
                            Icon(Icons.Rounded.Close, contentDescription = "Dismiss", tint = palette.textSecondary, modifier = Modifier.size(16.dp))
                        }
                    }
                }
                if (state.updateDownloading) {
                    Spacer(Modifier.height(8.dp))
                    LinearProgressIndicator(
                        progress = { state.updateProgress },
                        color = palette.accent,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }

        /* ==================== Search Input ==================== */
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 6.dp)
                .clip(RoundedCornerShape(13.dp))
                .background(palette.bgSecondary)
                .border(1.dp, palette.border, RoundedCornerShape(13.dp))
                .padding(horizontal = 12.dp, vertical = 2.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.height(40.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Search,
                    contentDescription = null,
                    tint = palette.textTertiary,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(8.dp))
                androidx.compose.foundation.text.BasicTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    singleLine = true,
                    textStyle = androidx.compose.ui.text.TextStyle(
                        color = palette.textPrimary,
                        fontSize = 14.sp,
                    ),
                    modifier = Modifier.weight(1f),
                    decorationBox = { inner ->
                        if (searchQuery.isEmpty()) {
                            Text(
                                text = "Search chats, groups, or @friends…",
                                color = palette.textTertiary,
                                fontSize = 13.5.sp,
                            )
                        }
                        inner()
                    }
                )
                if (searchQuery.isNotEmpty()) {
                    IconButton(onClick = { searchQuery = "" }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Rounded.Close, contentDescription = "Clear", tint = palette.textSecondary, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }

        /* ==================== Filter Tabs (Full Width Scrollable -> Calls Never Cut Off!) ==================== */
        val reqCount = state.incoming.size
        val tabs = listOf(
            "chats" to "Chats",
            "groups" to "Groups",
            "friends" to "Friends",
            "requests" to if (reqCount > 0) "Requests ($reqCount)" else "Requests",
            "calls" to "Calls",
            "archived" to "Archived",
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            tabs.forEach { (id, label) ->
                val selected = activeTab == id
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (selected) palette.accent else palette.bgSecondary)
                        .border(
                            width = 1.dp,
                            color = if (selected) palette.accent else palette.border,
                            shape = RoundedCornerShape(999.dp),
                        )
                        .clickable { activeTab = id }
                        .padding(horizontal = 14.dp, vertical = 7.dp)
                ) {
                    Text(
                        text = label,
                        color = if (selected) palette.onAccent else palette.textSecondary,
                        fontSize = 12.5.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    )
                }
            }
        }

        HorizontalDivider(color = palette.border)

        /* ==================== Smooth 120Hz Native LazyColumn List ==================== */
        val q = searchQuery.trim().lowercase()
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(vertical = 8.dp),
        ) {
            if (activeTab == "chats") {
                // Pinned Official JaText Community (Hold ONLY shows Mute / Unmute!)
                if (q.isEmpty() || "jatext community".contains(q)) {
                    item(key = "pinned-community") {
                        val lastComm = state.communityMessages.lastOrNull()
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .combinedClickable(
                                    onClick = { vm.openCommunityChat() },
                                    onLongClick = { holdTarget = SidebarHoldTarget.Community },
                                )
                                .padding(horizontal = 16.dp, vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(46.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(palette.accentSoft),
                                contentAlignment = Alignment.Center,
                            ) {
                                Image(
                                    painter = painterResource(id = R.drawable.jatext_logo_icon),
                                    contentDescription = "JaText Community",
                                    modifier = Modifier
                                        .size(34.dp)
                                        .clip(RoundedCornerShape(10.dp)),
                                )
                            }
                            Spacer(Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = "JaText Community",
                                        color = palette.textPrimary,
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.weight(1f),
                                    )
                                    if (state.communityMuted) {
                                        Icon(
                                            imageVector = Icons.Rounded.NotificationsOff,
                                            contentDescription = "Muted",
                                            tint = palette.textTertiary,
                                            modifier = Modifier.size(15.dp),
                                        )
                                        Spacer(Modifier.width(6.dp))
                                    }
                                    lastComm?.let {
                                        Text(
                                            text = formatShortTime(it.createdAt),
                                            color = palette.textTertiary,
                                            fontSize = 11.5.sp,
                                        )
                                    }
                                }
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = if (lastComm != null) {
                                        "${lastComm.senderName}: ${lastComm.body.ifBlank { "Sticker / Poll" }}"
                                    } else {
                                        "Official announcements, polls & global chat"
                                    },
                                    color = palette.textSecondary,
                                    fontSize = 13.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }

                // Unified sorted DM + Group feed (excluding archived)
                data class UnifiedRow(
                    val key: String,
                    val sortTs: Long,
                    val friend: JaUser? = null,
                    val preview: ChatPreview? = null,
                    val group: GroupSummary? = null,
                )

                val dmRows = state.friends.mapNotNull { f ->
                    val p = previewByFriend[f.id]
                    if (p?.isArchived == true) return@mapNotNull null
                    if (q.isNotEmpty() && !f.displayName.lowercase().contains(q) && !f.username.lowercase().contains(q)) {
                        return@mapNotNull null
                    }
                    UnifiedRow(
                        key = "dm:${f.id}",
                        sortTs = p?.createdAt ?: 0L,
                        friend = f,
                        preview = p,
                    )
                }
                val grpRows = state.groups.mapNotNull { g ->
                    if (!g.isArchived && (q.isEmpty() || g.name.lowercase().contains(q))) {
                        UnifiedRow(
                            key = "grp:${g.id}",
                            sortTs = g.lastMessageAt,
                            group = g,
                        )
                    } else {
                        null
                    }
                }
                val combined = (dmRows + grpRows).sortedByDescending { it.sortTs }

                items(items = combined, key = { it.key }) { item ->
                    if (item.friend != null) {
                        val f = item.friend
                        val p = item.preview
                        val act = activityByFriend[f.id]
                        val status = when {
                            act?.online == true -> act.statusPreference
                            else -> "offline"
                        }
                        DmSidebarRow(
                            friend = f,
                            preview = p,
                            presenceStatus = status,
                            typingToMe = act?.typingToMe == true,
                            onClick = { vm.openDmChat(f.id) },
                            onLongClick = { holdTarget = SidebarHoldTarget.Dm(f, p) },
                        )
                    } else if (item.group != null) {
                        GroupSidebarRow(
                            group = item.group,
                            onClick = { vm.openGroupChat(item.group.id) },
                            onLongClick = { holdTarget = SidebarHoldTarget.Group(item.group) },
                        )
                    }
                }
            } else if (activeTab == "groups") {
                val filtered = state.groups.filter { !it.isArchived && (q.isEmpty() || it.name.lowercase().contains(q)) }
                items(filtered, key = { "grp-tab:${it.id}" }) { g ->
                    GroupSidebarRow(
                        group = g,
                        onClick = { vm.openGroupChat(g.id) },
                        onLongClick = { holdTarget = SidebarHoldTarget.Group(g) },
                    )
                }
            } else if (activeTab == "friends") {
                val filtered = state.friends.filter {
                    q.isEmpty() || it.displayName.lowercase().contains(q) || it.username.lowercase().contains(q)
                }
                items(filtered, key = { "fr-tab:${it.id}" }) { f ->
                    val act = activityByFriend[f.id]
                    val status = if (act?.online == true) act.statusPreference else "offline"
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { vm.openDmChat(f.id) }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        JaAvatar(
                            avatarUrl = f.avatarUrl,
                            displayName = f.displayName.ifBlank { f.username },
                            avatarColor = f.avatarColor,
                            size = 44.dp,
                            presenceStatus = status,
                            statusBorderColor = palette.bgPrimary,
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = f.displayName.ifBlank { f.username },
                                color = palette.textPrimary,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = "@${f.username}",
                                color = palette.textSecondary,
                                fontSize = 12.5.sp,
                            )
                        }
                        IconButton(onClick = { me?.let { vm.callEngine.startDmCall(it, f, "voice") } }) {
                            Icon(Icons.Rounded.Call, contentDescription = "Voice Call", tint = palette.accent)
                        }
                        IconButton(onClick = { me?.let { vm.callEngine.startDmCall(it, f, "video") } }) {
                            Icon(Icons.Rounded.Videocam, contentDescription = "Video Call", tint = palette.accent)
                        }
                    }
                }
            } else if (activeTab == "requests") {
                if (state.incoming.isEmpty() && state.outgoing.isEmpty()) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(40.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("No pending friend requests", color = palette.textSecondary, fontSize = 14.sp)
                        }
                    }
                }
                items(state.incoming, key = { "in:${it.requestId}" }) { req ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        JaAvatar(
                            avatarUrl = req.user.avatarUrl,
                            displayName = req.user.displayName.ifBlank { req.user.username },
                            avatarColor = req.user.avatarColor,
                            size = 44.dp,
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = req.user.displayName.ifBlank { req.user.username },
                                color = palette.textPrimary,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.5.sp,
                            )
                            Text("@${req.user.username} wants to connect", color = palette.textSecondary, fontSize = 12.sp)
                        }
                        Button(
                            onClick = { vm.respondFriendRequest(req.requestId, true) },
                            colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                            modifier = Modifier.height(34.dp),
                        ) {
                            Text("Accept", fontSize = 12.sp, color = Color.White)
                        }
                        Spacer(Modifier.width(6.dp))
                        TextButton(onClick = { vm.respondFriendRequest(req.requestId, false) }) {
                            Text("Decline", fontSize = 12.sp, color = palette.danger)
                        }
                    }
                }
            } else if (activeTab == "calls") {
                // Spacious full-width Calls rows so nothing is ever clipped or cut off!
                if (state.callHistory.isEmpty()) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(40.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("No recent voice or video calls yet", color = palette.textSecondary, fontSize = 14.sp)
                        }
                    }
                }
                items(state.callHistory, key = { "call:${it.id}" }) { entry ->
                    CallHistoryRowUi(
                        entry = entry,
                        onRedial = {
                            if (me == null) return@CallHistoryRowUi
                            if (entry.peerId != null) {
                                val peer = state.friends.firstOrNull { it.id == entry.peerId }
                                if (peer != null) vm.callEngine.startDmCall(me, peer, entry.mode)
                            } else if (entry.groupId != null) {
                                val grp = state.groups.firstOrNull { it.id == entry.groupId }
                                if (grp != null) vm.callEngine.startGroupCall(me, grp, entry.mode)
                            }
                        }
                    )
                }
            } else if (activeTab == "archived") {
                val archDms = state.friends.mapNotNull { f ->
                    val p = previewByFriend[f.id]
                    if (p?.isArchived == true) f to p else null
                }
                val archGrps = state.groups.filter { it.isArchived }
                if (archDms.isEmpty() && archGrps.isEmpty()) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(40.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("No archived chats", color = palette.textSecondary, fontSize = 14.sp)
                        }
                    }
                }
                items(archDms, key = { "arch-dm:${it.first.id}" }) { (f, p) ->
                    DmSidebarRow(
                        friend = f,
                        preview = p,
                        presenceStatus = "offline",
                        typingToMe = false,
                        onClick = { vm.openDmChat(f.id) },
                        onLongClick = { holdTarget = SidebarHoldTarget.Dm(f, p) },
                    )
                }
                items(archGrps, key = { "arch-grp:${it.id}" }) { g ->
                    GroupSidebarRow(
                        group = g,
                        onClick = { vm.openGroupChat(g.id) },
                        onLongClick = { holdTarget = SidebarHoldTarget.Group(g) },
                    )
                }
            }
        }
    }

    /* ==================== Hold / Long-Press Context Sheet (Nav-Bar-Safe!) ==================== */
    holdTarget?.let { target ->
        ModalBottomSheet(
            onDismissRequest = { holdTarget = null },
            containerColor = palette.surface,
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
                            fontWeight = FontWeight.Bold,
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
                            fontWeight = FontWeight.Bold,
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
                            label = "Remove chat",
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
                            fontWeight = FontWeight.Bold,
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
                            // Non-owners get Leave group, never "Delete group"!
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
        AlertDialog(
            onDismissRequest = { ownerDeleteTarget = null },
            containerColor = palette.surface,
            title = {
                Text(
                    text = if (ownerDeleteStep == 1) "Delete \"${grp.name}\"?" else "Confirm exact group name",
                    color = palette.textPrimary,
                    fontWeight = FontWeight.Bold,
                )
            },
            text = {
                if (ownerDeleteStep == 1) {
                    Text(
                        text = "This permanently deletes \"${grp.name}\" and all encrypted messages for every member. This action cannot be undone.",
                        color = palette.textSecondary,
                        fontSize = 14.sp,
                    )
                } else {
                    Column {
                        Text(
                            text = "Type \"${grp.name}\" below to permanently delete this group for everyone:",
                            color = palette.textSecondary,
                            fontSize = 13.5.sp,
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = ownerDeleteTypedName,
                            onValueChange = { ownerDeleteTypedName = it },
                            placeholder = { Text(grp.name) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            },
            confirmButton = {
                if (ownerDeleteStep == 1) {
                    Button(
                        onClick = { ownerDeleteStep = 2 },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.danger),
                    ) {
                        Text("Continue", color = Color.White)
                    }
                } else {
                    Button(
                        onClick = {
                            vm.deleteGroupPermanentlyAsOwner(grp.id)
                            ownerDeleteTarget = null
                        },
                        enabled = ownerDeleteTypedName.trim() == grp.name.trim(),
                        colors = ButtonDefaults.buttonColors(containerColor = palette.danger),
                    ) {
                        Text("Delete permanently", color = Color.White)
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { ownerDeleteTarget = null }) {
                    Text("Cancel", color = palette.textSecondary)
                }
            }
        )
    }

    /* ==================== Multi-Account Switcher Sheet ==================== */
    if (showAccountSwitcher) {
        ModalBottomSheet(
            onDismissRequest = { showAccountSwitcher = false },
            containerColor = palette.surface,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp, vertical = 10.dp)
            ) {
                Text(
                    text = "Accounts on this device",
                    color = palette.textPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                )
                Spacer(Modifier.height(12.dp))
                state.accounts.forEach { slot ->
                    val active = slot.slotId == state.slotId
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clip(RoundedCornerShape(13.dp))
                            .background(if (active) palette.accentSoft else palette.bgSecondary)
                            .border(
                                1.dp,
                                if (active) palette.accent else palette.border,
                                RoundedCornerShape(13.dp)
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
                            size = 40.dp,
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = slot.displayName.ifBlank { slot.username },
                                color = palette.textPrimary,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.5.sp,
                            )
                            Text(
                                text = "@${slot.username}",
                                color = palette.textSecondary,
                                fontSize = 12.sp,
                            )
                        }
                        if (active) {
                            Text("Active", color = palette.accent, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(13.dp))
                        .background(palette.bgSecondary)
                        .clickable {
                            showAccountSwitcher = false
                            vm.startAddAnotherAccount()
                        }
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Rounded.Add, contentDescription = null, tint = palette.accent)
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = "Add another JaText account",
                        color = palette.textPrimary,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                    )
                }
                Spacer(Modifier.height(8.dp))
                TextButton(
                    onClick = {
                        showAccountSwitcher = false
                        vm.signOutCurrentAccount()
                    },
                    modifier = Modifier.align(Alignment.End)
                ) {
                    Text("Sign out of @${me?.username.orEmpty()}", color = palette.danger)
                }
                Spacer(Modifier.height(10.dp))
            }
        }
    }

    /* ==================== Add Friend Dialog ==================== */
    if (showAddFriendDialog) {
        var friendHandle by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showAddFriendDialog = false },
            containerColor = palette.surface,
            title = { Text("Add Friend", color = palette.textPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text(
                        text = "Enter their exact @username to send an encrypted friend invite:",
                        color = palette.textSecondary,
                        fontSize = 13.5.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = friendHandle,
                        onValueChange = { friendHandle = it },
                        prefix = { Text("@") },
                        label = { Text("username") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        vm.sendFriendRequest(friendHandle)
                        showAddFriendDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                ) {
                    Text("Send Request", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddFriendDialog = false }) {
                    Text("Cancel", color = palette.textSecondary)
                }
            }
        )
    }

    /* ==================== Create Group Dialog ==================== */
    if (showCreateGroupDialog) {
        var groupName by remember { mutableStateOf("") }
        val selectedIds = remember { mutableStateListOf<String>() }
        AlertDialog(
            onDismissRequest = { showCreateGroupDialog = false },
            containerColor = palette.surface,
            title = { Text("New Encrypted Group", color = palette.textPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    OutlinedTextField(
                        value = groupName,
                        onValueChange = { groupName = it },
                        label = { Text("Group name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(12.dp))
                    Text("Select friends:", color = palette.textSecondary, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(6.dp))
                    LazyColumn(modifier = Modifier.height(210.dp)) {
                        items(state.friends, key = { it.id }) { f ->
                            val checked = selectedIds.contains(f.id)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        if (checked) selectedIds.remove(f.id) else selectedIds.add(f.id)
                                    }
                                    .padding(vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(
                                    checked = checked,
                                    onCheckedChange = {
                                        if (it) selectedIds.add(f.id) else selectedIds.remove(f.id)
                                    }
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = "${f.displayName.ifBlank { f.username }} (@${f.username})",
                                    color = palette.textPrimary,
                                    fontSize = 13.5.sp,
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        vm.createNewGroup(groupName, selectedIds.toList())
                        showCreateGroupDialog = false
                    },
                    enabled = groupName.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                ) {
                    Text("Create Group", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateGroupDialog = false }) {
                    Text("Cancel", color = palette.textSecondary)
                }
            }
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DmSidebarRow(
    friend: JaUser,
    preview: ChatPreview?,
    presenceStatus: String,
    typingToMe: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val unread = preview?.unreadCount ?: 0
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        JaAvatar(
            avatarUrl = friend.avatarUrl,
            displayName = friend.displayName.ifBlank { friend.username },
            avatarColor = friend.avatarColor,
            size = 46.dp,
            presenceStatus = presenceStatus,
            statusBorderColor = palette.bgPrimary,
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = friend.displayName.ifBlank { friend.username },
                    color = palette.textPrimary,
                    fontSize = 15.sp,
                    fontWeight = if (unread > 0) FontWeight.ExtraBold else FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (preview?.isMuted == true) {
                    Icon(
                        imageVector = Icons.Rounded.NotificationsOff,
                        contentDescription = "Muted",
                        tint = palette.textTertiary,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(5.dp))
                }
                preview?.createdAt?.takeIf { it > 0L }?.let {
                    Text(
                        text = formatShortTime(it),
                        color = if (unread > 0) palette.accent else palette.textTertiary,
                        fontSize = 11.5.sp,
                        fontWeight = if (unread > 0) FontWeight.Bold else FontWeight.Normal,
                    )
                }
            }
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Rounded.Lock,
                    contentDescription = null,
                    tint = palette.accent.copy(alpha = 0.85f),
                    modifier = Modifier.size(12.dp),
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = when {
                        typingToMe -> "typing…"
                        preview != null && preview.body.isNotBlank() -> preview.body
                        else -> "Tap to start an encrypted chat"
                    },
                    color = when {
                        typingToMe -> palette.accent
                        unread > 0 -> palette.textPrimary
                        else -> palette.textSecondary
                    },
                    fontSize = 13.sp,
                    fontWeight = if (unread > 0 || typingToMe) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (unread > 0) {
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(palette.accent)
                            .padding(horizontal = 7.dp, vertical = 2.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = if (unread > 99) "99+" else unread.toString(),
                            color = palette.onAccent,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun GroupSidebarRow(
    group: GroupSummary,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val unread = group.unreadCount
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!group.avatarUrl.isNullOrBlank()) {
            JaAvatar(
                avatarUrl = group.avatarUrl,
                displayName = group.name,
                avatarColor = "teal",
                size = 46.dp,
            )
        } else {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(palette.bgTertiary),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Groups,
                    contentDescription = group.name,
                    tint = palette.accent,
                    modifier = Modifier.size(24.dp),
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = group.name,
                    color = palette.textPrimary,
                    fontSize = 15.sp,
                    fontWeight = if (unread > 0) FontWeight.ExtraBold else FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (group.isSilenced) {
                    Icon(
                        imageVector = Icons.Rounded.NotificationsOff,
                        contentDescription = "Muted",
                        tint = palette.textTertiary,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(5.dp))
                }
                group.lastMessageAt.takeIf { it > 0L }?.let {
                    Text(
                        text = formatShortTime(it),
                        color = if (unread > 0) palette.accent else palette.textTertiary,
                        fontSize = 11.5.sp,
                    )
                }
            }
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = group.lastMessage.ifBlank { "${group.memberCount} members" },
                    color = if (unread > 0) palette.textPrimary else palette.textSecondary,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (unread > 0) {
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(palette.accent)
                            .padding(horizontal = 7.dp, vertical = 2.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = if (unread > 99) "99+" else unread.toString(),
                            color = palette.onAccent,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CallHistoryRowUi(
    entry: CallHistoryEntry,
    onRedial: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onRedial() }
            .padding(horizontal = 16.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        JaAvatar(
            avatarUrl = entry.avatarUrl,
            displayName = entry.title,
            avatarColor = entry.avatarColor,
            size = 44.dp,
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = entry.title,
                color = palette.textPrimary,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (entry.direction == "outgoing") Icons.Rounded.CallMade else Icons.Rounded.CallReceived,
                    contentDescription = null,
                    tint = if (entry.status == "missed" || entry.status == "declined") palette.danger else palette.success,
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = "${entry.mode.replaceFirstChar { it.uppercase() }} • ${formatShortTime(entry.timestamp)}",
                    color = palette.textSecondary,
                    fontSize = 12.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        IconButton(onClick = onRedial) {
            Icon(
                imageVector = if (entry.mode == "video") Icons.Rounded.Videocam else Icons.Rounded.Call,
                contentDescription = "Call back",
                tint = palette.accent,
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
        Icon(imageVector = icon, contentDescription = null, tint = resolvedTint, modifier = Modifier.size(21.dp))
        Spacer(Modifier.width(14.dp))
        Text(text = label, color = resolvedTint, fontSize = 15.sp, fontWeight = FontWeight.Medium)
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
