package com.ahad00010.jatext.ui.screens

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Gavel
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.ahad00010.jatext.BuildConfig
import com.ahad00010.jatext.JaTextSoundManager
import com.ahad00010.jatext.data.UserSocialLink
import com.ahad00010.jatext.data.UserWebsiteLink
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.state.SessionUiState
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.components.JaWebGhostButton
import com.ahad00010.jatext.ui.components.JaWebIconButton
import com.ahad00010.jatext.ui.components.JaWebInput
import com.ahad00010.jatext.ui.components.JaWebPrimaryButton
import com.ahad00010.jatext.ui.theme.AVATAR_COLOR_SPECS
import com.ahad00010.jatext.ui.theme.COLOUR_THEME_PRESETS
import com.ahad00010.jatext.ui.theme.CustomThemeData
import com.ahad00010.jatext.ui.theme.JaTextThemeManager
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import kotlinx.coroutines.launch

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun SettingsModalScreen(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val palette = LocalJaTextPalette.current
    val scope = rememberCoroutineScope()
    val me = state.me ?: return

    BackHandler { onClose() }

    var activeCategory by remember { mutableStateOf("profile") } // profile | appearance | socials | audio | encryption | legal

    val categories = listOf(
        Triple("profile", "Profile", Icons.Rounded.Person),
        Triple("appearance", "Appearance", Icons.Rounded.Palette),
        Triple("socials", "Socials", Icons.Rounded.Link),
        Triple("audio", "Alerts & Audio", Icons.Rounded.NotificationsActive),
        Triple("encryption", "Encryption", Icons.Rounded.Lock),
        Triple("legal", "Legal Policies", Icons.Rounded.Gavel),
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bgPrimary)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
    ) {
        /* ==================== Settings Top Header ==================== */
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(palette.bgSecondary)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Settings",
                    color = palette.textPrimary,
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Black,
                )
                Text(
                    text = "JaText v${BuildConfig.VERSION_NAME} (Build ${BuildConfig.VERSION_CODE})",
                    color = palette.textSecondary,
                    fontSize = 11.5.sp,
                )
            }
            JaWebGhostButton(
                text = "Check updates",
                onClick = { vm.checkApkUpdate(manual = true) },
            )
            JaWebIconButton(
                icon = Icons.Rounded.Close,
                contentDescription = "Close Settings",
                size = 38.dp,
                iconSize = 18.dp,
                onClick = onClose,
            )
        }

        /* ==================== Categorized Settings Navigation ==================== */
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(palette.bgSecondary)
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 14.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            categories.forEach { (id, label, icon) ->
                val selected = activeCategory == id
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(11.dp))
                        .background(if (selected) palette.accent else palette.bgTertiary)
                        .clickable { activeCategory = id }
                        .padding(horizontal = 13.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = if (selected) palette.onAccent else palette.textSecondary,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = label,
                        color = if (selected) palette.onAccent else palette.textSecondary,
                        fontSize = 13.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    )
                }
            }
        }

        HorizontalDivider(color = palette.border)

        /* ==================== Category Body ==================== */
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(18.dp)
        ) {
            when (activeCategory) {
                "profile" -> {
                    var displayName by remember(me.id) { mutableStateOf(me.displayName) }
                    var username by remember(me.id) { mutableStateOf(me.username) }
                    var pronouns by remember(me.id) { mutableStateOf(me.pronouns) }
                    var bio by remember(me.id) { mutableStateOf(me.bio) }
                    var avatarColor by remember(me.id) {
                        mutableStateOf(JaTextThemeManager.stripProfileMetaFromColorId(me.avatarColor))
                    }
                    var customStatus by remember(me.id) { mutableStateOf(me.customStatus.orEmpty()) }
                    var statusPref by remember(me.id) { mutableStateOf(me.statusPreference.orEmpty().ifBlank { "online" }) }
                    var avatarUri by remember { mutableStateOf<Uri?>(null) }
                    var bannerUri by remember { mutableStateOf<Uri?>(null) }
                    var saving by remember { mutableStateOf(false) }

                    val colorSpec = remember(avatarColor) {
                        JaTextThemeManager.avatarColorSpec(avatarColor)
                    }

                    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) {
                        if (it != null) avatarUri = it
                    }
                    val bannerPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) {
                        if (it != null) bannerUri = it
                    }

                    // 1:1 Web `ProfileForm.tsx` `.pf-preview` (`2.5dp` `--profile-outline` `color.hex` border!)
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(18.dp))
                            .background(palette.bgSecondary)
                            .border(2.5.dp, colorSpec.ringColor, RoundedCornerShape(18.dp))
                    ) {
                        Box(modifier = Modifier.fillMaxWidth()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(114.dp)
                                    .background(
                                        Brush.linearGradient(
                                            listOf(
                                                colorSpec.ringColor.copy(alpha = 0.44f),
                                                palette.bgTertiary,
                                            )
                                        )
                                    )
                                    .clickable { bannerPicker.launch("image/*") },
                            ) {
                                val shownBanner = bannerUri?.toString() ?: me.bannerUrl
                                if (!shownBanner.isNullOrBlank()) {
                                    AsyncImage(
                                        model = shownBanner,
                                        contentDescription = "Banner",
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                }
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.BottomCenter)
                                        .fillMaxWidth()
                                        .height(2.5.dp)
                                        .background(colorSpec.ringColor)
                                )
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .padding(10.dp)
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(Color(0x940A0A10))
                                        .border(1.dp, Color(0x38FFFFFF), RoundedCornerShape(999.dp))
                                        .padding(horizontal = 10.dp, vertical = 5.dp)
                                ) {
                                    Text("Upload banner", color = Color(0xFFF2F2F7), fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                                }
                            }

                            Box(
                                modifier = Modifier
                                    .padding(start = 16.dp, top = 70.dp)
                                    .size(90.dp)
                                    .clip(CircleShape)
                                    .background(palette.bgSecondary)
                                    .clickable { avatarPicker.launch("image/*") },
                                contentAlignment = Alignment.Center,
                            ) {
                                JaAvatar(
                                    avatarUrl = avatarUri?.toString() ?: me.avatarUrl,
                                    displayName = displayName.ifBlank { username },
                                    avatarColor = avatarColor,
                                    size = 82.dp,
                                    ringWidth = 3.5.dp,
                                    presenceStatus = statusPref,
                                    statusBorderColor = palette.bgSecondary,
                                )
                            }
                        }

                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 18.dp, vertical = 12.dp),
                        ) {
                            Text(
                                text = displayName.ifBlank { username },
                                color = palette.textPrimary,
                                fontWeight = FontWeight.Black,
                                fontSize = 18.sp,
                            )
                            Text(
                                text = "@$username · Tap avatar to change photo",
                                color = palette.textSecondary,
                                fontSize = 12.5.sp,
                            )
                        }
                    }

                    Spacer(Modifier.height(16.dp))

                    // Presence Status Picker
                    Text("Online Status", color = palette.textSecondary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        listOf("online" to "Online", "idle" to "Idle", "dnd" to "Do Not Disturb", "offline" to "Invisible").forEach { (id, lbl) ->
                            val active = statusPref == id
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(if (active) palette.accentSoft else palette.bgSecondary)
                                    .border(1.dp, if (active) palette.accent else palette.border, RoundedCornerShape(999.dp))
                                    .clickable {
                                        statusPref = id
                                        vm.setPresenceStatus(id, customStatus)
                                    }
                                    .padding(horizontal = 12.dp, vertical = 7.dp)
                            ) {
                                Text(lbl, color = if (active) palette.textPrimary else palette.textSecondary, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    Spacer(Modifier.height(14.dp))
                    JaWebInput(
                        value = customStatus,
                        onValueChange = { customStatus = it.take(80) },
                        label = "Custom status",
                        placeholder = "What are you up to?",
                    )
                    Spacer(Modifier.height(12.dp))
                    JaWebInput(
                        value = displayName,
                        onValueChange = { displayName = it },
                        label = "Display name",
                        placeholder = "Your display name",
                    )
                    Spacer(Modifier.height(12.dp))
                    JaWebInput(
                        value = username,
                        onValueChange = { username = it.lowercase().filter { ch -> ch.isLetterOrDigit() || ch == '.' || ch == '_' || ch == '-' } },
                        label = "Username (14-day change cooldown)",
                        leadingPrefix = "@",
                        placeholder = "your-username",
                    )
                    Spacer(Modifier.height(12.dp))
                    JaWebInput(
                        value = pronouns,
                        onValueChange = { pronouns = it.take(32) },
                        label = "Pronouns",
                        placeholder = "they/them, he/him, she/her…",
                    )
                    Spacer(Modifier.height(12.dp))
                    JaWebInput(
                        value = bio,
                        onValueChange = { bio = it.take(190) },
                        label = "Bio (${bio.length}/190)",
                        placeholder = "Tell friends a little about yourself…",
                        singleLine = false,
                        maxLines = 4,
                    )

                    Spacer(Modifier.height(16.dp))
                    Text("Avatar colour & profile outline", color = palette.textSecondary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        AVATAR_COLOR_SPECS.forEach { spec ->
                            val selected = avatarColor == spec.id
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(if (selected) palette.accentSoft else palette.bgSecondary)
                                    .border(
                                        width = if (selected) 1.5.dp else 1.dp,
                                        color = if (selected) spec.ringColor else palette.border,
                                        shape = RoundedCornerShape(12.dp),
                                    )
                                    .clickable { avatarColor = spec.id }
                                    .padding(horizontal = 10.dp, vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(7.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(18.dp)
                                        .clip(CircleShape)
                                        .background(Brush.linearGradient(spec.gradientStops))
                                        .border(1.5.dp, spec.ringColor, CircleShape)
                                )
                                Text(
                                    text = spec.name,
                                    color = palette.textPrimary,
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(20.dp))
                    JaWebPrimaryButton(
                        text = if (saving) "Saving…" else "Save profile",
                        enabled = !saving,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            saving = true
                            vm.setPresenceStatus(statusPref, customStatus)
                            scope.launch {
                                try {
                                    vm.saveProfile(
                                        displayName = displayName,
                                        username = username,
                                        bio = bio,
                                        pronouns = pronouns,
                                        avatarColor = avatarColor,
                                        avatarUri = avatarUri,
                                        bannerUri = bannerUri,
                                    )
                                    vm.showToast("Profile saved!")
                                } catch (e: Throwable) {
                                    vm.showToast(e.message ?: "Failed to save profile")
                                } finally {
                                    saving = false
                                }
                            }
                        },
                    )
                }

                "appearance" -> {
                    AppearanceSettingsTab(state = state, vm = vm)
                }

                "socials" -> {
                    // Explicit Constraint: Socials tab shows ONLY socials & website inputs (NO banner/pfp preview!)
                    val socialRows = remember(me.id) {
                        mutableStateListOf<UserSocialLink>().apply {
                            addAll(me.socials.orEmpty())
                        }
                    }
                    var webTitle by remember(me.id) { mutableStateOf(me.website?.title.orEmpty()) }
                    var webUrl by remember(me.id) { mutableStateOf(me.website?.url.orEmpty()) }
                    var savingSocials by remember { mutableStateOf(false) }

                    Text(
                        text = "Socials & Website",
                        color = palette.textPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Add your public social links and personal website to show on your profile card.",
                        color = palette.textSecondary,
                        fontSize = 13.sp,
                    )
                    Spacer(Modifier.height(16.dp))

                    OutlinedTextField(
                        value = webTitle,
                        onValueChange = { webTitle = it },
                        label = { Text("Website label (e.g. Portfolio)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = webUrl,
                        onValueChange = { webUrl = it },
                        label = { Text("Website URL (https://…)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Spacer(Modifier.height(18.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Social Profiles", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        OutlinedButton(
                            onClick = {
                                if (socialRows.size < 6) {
                                    socialRows.add(UserSocialLink(platform = "GitHub", handle = "", url = ""))
                                }
                            }
                        ) {
                            Icon(Icons.Rounded.Add, null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Add link", fontSize = 12.sp)
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                    socialRows.forEachIndexed { idx, item ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 5.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(palette.surface)
                                .border(1.dp, palette.border, RoundedCornerShape(12.dp))
                                .padding(12.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                OutlinedTextField(
                                    value = item.platform,
                                    onValueChange = { socialRows[idx] = item.copy(platform = it) },
                                    label = { Text("Platform (GitHub, X, Instagram…)") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                                IconButton(onClick = { socialRows.removeAt(idx) }) {
                                    Icon(Icons.Rounded.Close, contentDescription = "Remove", tint = palette.danger)
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = item.handle,
                                onValueChange = { socialRows[idx] = item.copy(handle = it) },
                                label = { Text("Handle (@username)") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = item.url,
                                onValueChange = { socialRows[idx] = item.copy(url = it) },
                                label = { Text("Profile URL (https://…)") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }

                    Spacer(Modifier.height(18.dp))
                    Button(
                        onClick = {
                            savingSocials = true
                            scope.launch {
                                try {
                                    vm.saveProfile(
                                        displayName = me.displayName,
                                        username = me.username,
                                        bio = me.bio,
                                        pronouns = me.pronouns,
                                        avatarColor = me.avatarColor,
                                        socials = socialRows.filter { it.handle.isNotBlank() || it.url.isNotBlank() },
                                        website = UserWebsiteLink(title = webTitle.trim(), url = webUrl.trim()),
                                    )
                                    vm.showToast("Socials & website saved!")
                                } catch (e: Throwable) {
                                    vm.showToast(e.message ?: "Failed to save socials")
                                } finally {
                                    savingSocials = false
                                }
                            }
                        },
                        enabled = !savingSocials,
                        colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                        shape = RoundedCornerShape(13.dp),
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                    ) {
                        Text("Save Socials & Website", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }

                "audio" -> {
                    var customNotifName by remember {
                        mutableStateOf(vm.cache.getNotifSoundLabel().takeIf { vm.cache.getNotifSoundMode() == "custom" })
                    }
                    var customRingName by remember {
                        mutableStateOf(vm.cache.getRingtoneLabel().takeIf { vm.cache.getRingtoneMode() == "custom" })
                    }

                    val notifSoundLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
                        if (uri != null) {
                            val name = queryUriFileName(context, uri) ?: "Custom notification.mp3"
                            try {
                                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                                if (bytes != null && bytes.isNotEmpty()) {
                                    val saved = JaTextSoundManager.saveCustomSoundFile(context, "notification", name, bytes)
                                    JaTextSoundManager.saveSoundPreferences(
                                        context, "custom", saved.absolutePath, name, null, null, null
                                    )
                                    customNotifName = name
                                    vm.showToast("Custom notification sound applied!")
                                }
                            } catch (e: Throwable) {
                                vm.showToast("Could not load custom notification sound")
                            }
                        }
                    }
                    val ringtoneSoundLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
                        if (uri != null) {
                            val name = queryUriFileName(context, uri) ?: "Custom ringtone.mp3"
                            try {
                                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                                if (bytes != null && bytes.isNotEmpty()) {
                                    val saved = JaTextSoundManager.saveCustomSoundFile(context, "ringtone", name, bytes)
                                    JaTextSoundManager.saveSoundPreferences(
                                        context, null, null, null, "custom", saved.absolutePath, name
                                    )
                                    customRingName = name
                                    vm.showToast("Custom ringtone applied!")
                                }
                            } catch (e: Throwable) {
                                vm.showToast("Could not load custom ringtone")
                            }
                        }
                    }

                    Text("Notification Sound", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Spacer(Modifier.height(8.dp))
                    SoundChoiceCard(
                        title = "JaText (Default)",
                        selected = customNotifName == null,
                        onSelect = {
                            JaTextSoundManager.saveSoundPreferences(
                                context, "default", "", "JaText (Default)", null, null, null
                            )
                            customNotifName = null
                        },
                        onPreview = {
                            JaTextSoundManager.previewSound(context, "notification", "default", "", false)
                        },
                    )
                    if (customNotifName != null) {
                        Spacer(Modifier.height(6.dp))
                        SoundChoiceCard(
                            title = customNotifName!!,
                            selected = true,
                            onSelect = {},
                            onPreview = {
                                JaTextSoundManager.previewSound(
                                    context,
                                    "notification",
                                    vm.cache.getNotifSoundMode(),
                                    vm.cache.getNotifSoundUri(),
                                    false
                                )
                            },
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { notifSoundLauncher.launch("audio/*") },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Rounded.MusicNote, null, tint = palette.accent, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Add your custom notification sound.", color = palette.textPrimary)
                    }

                    Spacer(Modifier.height(22.dp))

                    Text("Call Ringtone", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Spacer(Modifier.height(8.dp))
                    SoundChoiceCard(
                        title = "JaText (Default)",
                        selected = customRingName == null,
                        onSelect = {
                            JaTextSoundManager.saveSoundPreferences(
                                context, null, null, null, "default", "", "JaText (Default)"
                            )
                            customRingName = null
                        },
                        onPreview = {
                            JaTextSoundManager.previewSound(context, "ringtone", "default", "", false)
                        },
                    )
                    if (customRingName != null) {
                        Spacer(Modifier.height(6.dp))
                        SoundChoiceCard(
                            title = customRingName!!,
                            selected = true,
                            onSelect = {},
                            onPreview = {
                                JaTextSoundManager.previewSound(
                                    context,
                                    "ringtone",
                                    vm.cache.getRingtoneMode(),
                                    vm.cache.getRingtoneUri(),
                                    false
                                )
                            },
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { ringtoneSoundLauncher.launch("audio/*") },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Rounded.MusicNote, null, tint = palette.accent, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Add your custom ringtone sound.", color = palette.textPrimary)
                    }
                }

                "encryption" -> {
                    Text(
                        text = "End-to-End Encryption",
                        color = palette.textPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "Messages, voice notes, photos, videos, and group keys are encrypted locally on your device using NIST P-256 ECDH + AES-256-GCM before leaving your phone.",
                        color = palette.textSecondary,
                        fontSize = 13.5.sp,
                        lineHeight = 19.sp,
                    )
                    Spacer(Modifier.height(16.dp))
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(palette.surface)
                            .border(1.dp, palette.borderStrong, RoundedCornerShape(14.dp))
                            .padding(14.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.Lock, null, tint = palette.accent, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Active Device Identity Key", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                        Spacer(Modifier.height(8.dp))
                        Text("Key ID: ${state.myKeyId}", color = palette.textSecondary, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "Fingerprint: ${state.myKeyFingerprint}",
                            color = palette.textPrimary,
                            fontSize = 12.5.sp,
                            fontFamily = FontFamily.Monospace,
                        )
                    }
                }

                "legal" -> {
                    Text("Legal Policies & Privacy", color = palette.textPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(12.dp))
                    PolicyCard(
                        title = "Zero-Knowledge End-to-End Privacy",
                        body = "Direct messages, group chats, voice notes, and attachments are encrypted end-to-end on your device. Turso stores only ciphertext envelopes and routing metadata.",
                    )
                    Spacer(Modifier.height(10.dp))
                    PolicyCard(
                        title = "Terms of Service",
                        body = "Use JaText respectfully. Harassment, spam, unauthorized automated scraping, and distribution of harmful content are prohibited across Community and Group spaces.",
                    )
                    Spacer(Modifier.height(10.dp))
                    PolicyCard(
                        title = "Account & Data Controls",
                        body = "You can clear conversation histories, unsend recent messages for everyone, manage multi-account sessions, or sign out at any time.",
                    )
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

/**
 * Appearance Tab with exact web subtitle, genuine "Sync across devices",
 * Default Themes, 22 Colour Theme swatches with tooltips, and ZERO-LAG Custom Theme 2D HSV picker!
 */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun AppearanceSettingsTab(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
) {
    val palette = LocalJaTextPalette.current
    val cfg = state.themeConfig

    var showCustomBuilder by remember { mutableStateOf(cfg.kind == "custom") }

    Text(
        text = "Appearance",
        color = palette.textPrimary,
        fontSize = 18.sp,
        fontWeight = FontWeight.Bold,
    )
    Spacer(Modifier.height(4.dp))
    // Exact user-constrained subtitle ending on "... or build your own custom theme."
    Text(
        text = "Pick a crisp default mode, choose any gradient colour theme, or build your own custom theme.",
        color = palette.textSecondary,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    )

    Spacer(Modifier.height(16.dp))

    // Sync across devices toggle
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(palette.surface)
            .border(1.dp, palette.border, RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Sync across devices", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
            Text(
                text = "Automatically sync your selected theme across Android and web.",
                color = palette.textSecondary,
                fontSize = 12.sp,
            )
        }
        Switch(
            checked = cfg.syncAcrossDevices,
            onCheckedChange = { checked ->
                vm.updateThemeConfig(cfg.copy(syncAcrossDevices = checked), pushRemoteIfSynced = checked)
            },
            colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = palette.accent),
        )
    }

    Spacer(Modifier.height(18.dp))
    Text("Default Themes", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
    Spacer(Modifier.height(10.dp))

    val defaultSwatches = listOf(
        Triple("light", "Light", Color(0xFFFFFFFF)),
        Triple("ash", "Ash", Color(0xFF323339)),
        Triple("dark", "Dark", Color(0xFF1D1D21)),
        Triple("onyx", "Onyx", Color(0xFF000000)),
        Triple("system", "Sync with system", Color(0xFF1F2937)),
    )

    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        defaultSwatches.forEach { (id, label, color) ->
            val selected = cfg.kind == "default" && cfg.defaultId == id
            TooltipBox(
                positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
                tooltip = { PlainTooltip { Text(label) } },
                state = rememberTooltipState(),
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.clickable {
                        showCustomBuilder = false
                        vm.updateThemeConfig(cfg.copy(kind = "default", defaultId = id))
                    }
                ) {
                    Box(
                        modifier = Modifier
                            .size(54.dp)
                            .clip(CircleShape)
                            .background(color)
                            .border(
                                width = if (selected) 3.dp else 1.dp,
                                color = if (selected) palette.accent else palette.borderStrong,
                                shape = CircleShape,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (selected) {
                            Icon(
                                imageVector = Icons.Rounded.Check,
                                contentDescription = null,
                                tint = if (id == "light") Color(0xFF111827) else Color.White,
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(label, color = palette.textSecondary, fontSize = 11.sp)
                }
            }
        }

        // Custom Theme Tile (#668f81 -> #667c8b -> #84766d)
        val customSelected = cfg.kind == "custom"
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.clickable {
                showCustomBuilder = true
                vm.updateThemeConfig(cfg.copy(kind = "custom"))
            }
        ) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(
                            listOf(Color(0xFF668F81), Color(0xFF667C8B), Color(0xFF84766D))
                        )
                    )
                    .border(
                        width = if (customSelected) 3.dp else 1.dp,
                        color = if (customSelected) palette.accent else palette.borderStrong,
                        shape = CircleShape,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Rounded.Palette, contentDescription = "Customise Theme", tint = Color.White)
            }
            Spacer(Modifier.height(4.dp))
            Text("Customise", color = palette.textSecondary, fontSize = 11.sp)
        }
    }

    if (showCustomBuilder || cfg.kind == "custom") {
        Spacer(Modifier.height(18.dp))
        ZeroLagCustomThemeEditor(
            initialCustom = cfg.custom,
            onPreviewLocal = { liveCustom ->
                // Local-only update while dragging -> 120 FPS with ZERO network lag!
                vm.updateThemeConfig(cfg.copy(kind = "custom", custom = liveCustom), pushRemoteIfSynced = false)
            },
            onCommitSync = { finalCustom ->
                vm.updateThemeConfig(cfg.copy(kind = "custom", custom = finalCustom), pushRemoteIfSynced = true)
            }
        )
    }

    Spacer(Modifier.height(20.dp))
    Text("Colour Themes", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
    Spacer(Modifier.height(10.dp))

    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        COLOUR_THEME_PRESETS.forEach { preset ->
            val selected = cfg.kind == "preset" && cfg.presetId == preset.id
            val stops = remember(preset.id) { preset.colors.map { JaTextThemeManager.parseHexColor(it) } }
            TooltipBox(
                positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
                tooltip = { PlainTooltip { Text(preset.name) } },
                state = rememberTooltipState(),
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .width(66.dp)
                        .clickable {
                            showCustomBuilder = false
                            vm.updateThemeConfig(cfg.copy(kind = "preset", presetId = preset.id))
                        }
                ) {
                    Box(
                        modifier = Modifier
                            .size(54.dp)
                            .clip(CircleShape)
                            .background(JaTextThemeManager.angledLinearBrush(stops, preset.angle))
                            .border(
                                width = if (selected) 3.dp else 1.dp,
                                color = if (selected) palette.accent else palette.borderStrong,
                                shape = CircleShape,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (selected) {
                            Icon(
                                imageVector = Icons.Rounded.Check,
                                contentDescription = preset.name,
                                tint = if (preset.mode == "light") Color(0xFF111827) else Color.White,
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = preset.name,
                        color = palette.textSecondary,
                        fontSize = 10.5.sp,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/**
 * Pure Native Android RenderThread 2D HSV Palette + Hue / Angle / Intensity Sliders:
 * Zero React re-renders, zero WebView touch bridge, zero lag while dragging!
 */
@Composable
private fun ZeroLagCustomThemeEditor(
    initialCustom: CustomThemeData,
    onPreviewLocal: (CustomThemeData) -> Unit,
    onCommitSync: (CustomThemeData) -> Unit,
) {
    val palette = LocalJaTextPalette.current

    var appearance by remember { mutableStateOf(initialCustom.appearance) }
    val stops = remember {
        mutableStateListOf<String>().apply {
            addAll(initialCustom.colors.ifEmpty { listOf("#e8a87c", "#9b6b9e") })
        }
    }
    var selectedStopIdx by remember { mutableIntStateOf(0) }
    var angle by remember { mutableFloatStateOf(initialCustom.angle.toFloat()) }
    var intensity by remember { mutableFloatStateOf(initialCustom.intensity.toFloat()) }

    val initialHsv = remember(selectedStopIdx) {
        val c = JaTextThemeManager.parseHexColor(stops.getOrElse(selectedStopIdx) { "#e8a87c" })
        val arr = FloatArray(3)
        android.graphics.Color.RGBToHSV(
            (c.red * 255).toInt(),
            (c.green * 255).toInt(),
            (c.blue * 255).toInt(),
            arr
        )
        arr
    }
    var hue by remember(selectedStopIdx) { mutableFloatStateOf(initialHsv[0]) }
    var sat by remember(selectedStopIdx) { mutableFloatStateOf(initialHsv[1]) }
    var valueBri by remember(selectedStopIdx) { mutableFloatStateOf(initialHsv[2]) }

    fun buildCurrentData(): CustomThemeData = CustomThemeData(
        appearance = appearance,
        colors = stops.toList(),
        angle = angle.toInt(),
        intensity = intensity.toInt(),
    )

    fun updateActiveStopFromHsv(commit: Boolean) {
        val rgbInt = android.graphics.Color.HSVToColor(floatArrayOf(hue, sat, valueBri))
        val hex = "#%06x".format(0xFFFFFF and rgbInt)
        if (selectedStopIdx in stops.indices) {
            stops[selectedStopIdx] = hex
        }
        val next = buildCurrentData()
        if (commit) onCommitSync(next) else onPreviewLocal(next)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(palette.surface)
            .border(1.dp, palette.borderStrong, RoundedCornerShape(16.dp))
            .padding(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Customise Theme", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("dark" to "Dark", "light" to "Light").forEach { (id, lbl) ->
                    val active = appearance == id
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (active) palette.accent else palette.bgSecondary)
                            .clickable {
                                appearance = id
                                onCommitSync(buildCurrentData())
                            }
                            .padding(horizontal = 10.dp, vertical = 5.dp)
                    ) {
                        Text(lbl, color = if (active) Color.White else palette.textSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // Color stop chips
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            stops.forEachIndexed { idx, hex ->
                val c = JaTextThemeManager.parseHexColor(hex)
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(c)
                        .border(
                            width = if (selectedStopIdx == idx) 3.dp else 1.dp,
                            color = if (selectedStopIdx == idx) palette.textPrimary else palette.borderStrong,
                            shape = CircleShape,
                        )
                        .clickable { selectedStopIdx = idx }
                )
            }
            if (stops.size < 5) {
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(palette.bgSecondary)
                        .clickable {
                            stops.add("#6b73ff")
                            selectedStopIdx = stops.lastIndex
                            onCommitSync(buildCurrentData())
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Rounded.Add, contentDescription = "Add colour stop", tint = palette.textPrimary, modifier = Modifier.size(18.dp))
                }
            }
        }

        Spacer(Modifier.height(12.dp))

        // Native GPU 2D Saturation/Value Picker Canvas (0ms touch latency!)
        val pureHueColor = remember(hue) {
            Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, 1f, 1f)))
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(165.dp)
                .clip(RoundedCornerShape(12.dp))
                .pointerInput(selectedStopIdx) {
                    detectTapGestures { pos ->
                        sat = (pos.x / size.width).coerceIn(0f, 1f)
                        valueBri = (1f - (pos.y / size.height)).coerceIn(0f, 1f)
                        updateActiveStopFromHsv(commit = true)
                    }
                }
                .pointerInput(selectedStopIdx) {
                    detectDragGestures(
                        onDragEnd = { updateActiveStopFromHsv(commit = true) },
                        onDragCancel = { updateActiveStopFromHsv(commit = true) },
                        onDrag = { change, _ ->
                            change.consume()
                            sat = (change.position.x / size.width).coerceIn(0f, 1f)
                            valueBri = (1f - (change.position.y / size.height)).coerceIn(0f, 1f)
                            updateActiveStopFromHsv(commit = false)
                        }
                    )
                }
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                drawRect(brush = Brush.horizontalGradient(listOf(Color.White, pureHueColor)))
                drawRect(brush = Brush.verticalGradient(listOf(Color.Transparent, Color.Black)))
                val cx = sat * size.width
                val cy = (1f - valueBri) * size.height
                drawCircle(color = Color.White, radius = 9.dp.toPx(), center = Offset(cx, cy), style = Stroke(width = 3.dp.toPx()))
            }
        }

        Spacer(Modifier.height(10.dp))
        Text("Hue", color = palette.textSecondary, fontSize = 12.sp)
        Slider(
            value = hue,
            onValueChange = {
                hue = it
                updateActiveStopFromHsv(commit = false)
            },
            onValueChangeFinished = { updateActiveStopFromHsv(commit = true) },
            valueRange = 0f..360f,
            colors = SliderDefaults.colors(thumbColor = pureHueColor, activeTrackColor = pureHueColor),
        )

        Text("Gradient Angle (${angle.toInt()}°)", color = palette.textSecondary, fontSize = 12.sp)
        Slider(
            value = angle,
            onValueChange = {
                angle = it
                onPreviewLocal(buildCurrentData())
            },
            onValueChangeFinished = { onCommitSync(buildCurrentData()) },
            valueRange = 0f..360f,
            colors = SliderDefaults.colors(thumbColor = palette.accent, activeTrackColor = palette.accent),
        )

        Text("Colour Intensity (${intensity.toInt()}%)", color = palette.textSecondary, fontSize = 12.sp)
        Slider(
            value = intensity,
            onValueChange = {
                intensity = it
                onPreviewLocal(buildCurrentData())
            },
            onValueChangeFinished = { onCommitSync(buildCurrentData()) },
            valueRange = 10f..100f,
            colors = SliderDefaults.colors(thumbColor = palette.accent, activeTrackColor = palette.accent),
        )
    }
}

@Composable
private fun SoundChoiceCard(
    title: String,
    selected: Boolean,
    onSelect: () -> Unit,
    onPreview: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) palette.accentSoft else palette.surface)
            .border(1.dp, if (selected) palette.accent else palette.border, RoundedCornerShape(12.dp))
            .clickable { onSelect() }
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (selected) Icons.Rounded.Check else Icons.Rounded.MusicNote,
            contentDescription = null,
            tint = if (selected) palette.accent else palette.textSecondary,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text = title,
            color = palette.textPrimary,
            fontSize = 14.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onPreview, modifier = Modifier.size(32.dp)) {
            Icon(Icons.Rounded.PlayArrow, contentDescription = "Test sound", tint = palette.accent)
        }
    }
}

@Composable
private fun PolicyCard(title: String, body: String) {
    val palette = LocalJaTextPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(palette.surface)
            .border(1.dp, palette.border, RoundedCornerShape(14.dp))
            .padding(14.dp)
    ) {
        Text(title, color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
        Spacer(Modifier.height(5.dp))
        Text(body, color = palette.textSecondary, fontSize = 13.sp, lineHeight = 18.5.sp)
    }
}

private fun queryUriFileName(context: android.content.Context, uri: Uri): String? {
    return try {
        context.contentResolver.query(uri, null, null, null, null)?.use { c ->
            val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) c.getString(idx) else null
        }
    } catch (_: Throwable) {
        null
    }
}
