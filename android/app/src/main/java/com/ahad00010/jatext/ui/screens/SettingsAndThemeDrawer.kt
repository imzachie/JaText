package com.ahad00010.jatext.ui.screens

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Gavel
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.ahad00010.jatext.BuildConfig
import com.ahad00010.jatext.JaTextSoundManager
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.TursoApiClient
import com.ahad00010.jatext.data.UserSocialLink
import com.ahad00010.jatext.data.UserWebsiteLink
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.state.SessionUiState
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.components.JaTabItem
import com.ahad00010.jatext.ui.components.JaWebGhostButton
import com.ahad00010.jatext.ui.components.JaWebIconButton
import com.ahad00010.jatext.ui.components.JaWebInput
import com.ahad00010.jatext.ui.components.JaWebPrimaryButton
import com.ahad00010.jatext.ui.components.JaWebTabs
import com.ahad00010.jatext.ui.components.RichMarkdownText
import com.ahad00010.jatext.ui.components.jaBouncyClick
import com.ahad00010.jatext.ui.icons.SOCIAL_PLATFORM_SPECS
import com.ahad00010.jatext.ui.icons.SocialBrandVectorIcon
import com.ahad00010.jatext.ui.icons.WebsiteGlobeVectorIcon
import com.ahad00010.jatext.ui.icons.getSocialPlatformMeta
import com.ahad00010.jatext.ui.theme.AVATAR_COLOR_SPECS
import com.ahad00010.jatext.ui.theme.COLOUR_THEME_PRESETS
import com.ahad00010.jatext.ui.theme.CustomThemeData
import com.ahad00010.jatext.ui.theme.JaTextPalette
import com.ahad00010.jatext.ui.theme.JaTextThemeManager
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import kotlin.random.Random
import kotlinx.coroutines.delay
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

    var activeCategory by remember { mutableStateOf("profile") } // profile | appearance | socials | audio | encryption | legal
    var showCustomThemeDrawer by remember { mutableStateOf(false) }
    var legalDialogTab by remember { mutableStateOf<String?>(null) }

    BackHandler {
        if (showCustomThemeDrawer) {
            showCustomThemeDrawer = false
        } else {
            onClose()
        }
    }

    val categories = listOf(
        Triple("profile", "Profile", Icons.Rounded.Person),
        Triple("appearance", "Appearance", Icons.Rounded.Palette),
        Triple("socials", "Socials", Icons.Rounded.Link),
        Triple("audio", "Alerts & Audio", Icons.Rounded.NotificationsActive),
        Triple("encryption", "Encryption", Icons.Rounded.Lock),
        Triple("legal", "Legal Policies", Icons.Rounded.Gavel),
    )

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .then(
                    if (palette.rootGradientBrush != null) Modifier.background(palette.rootGradientBrush)
                    else Modifier.background(palette.bgPrimary)
                )
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
        ) {
            /* ==================== Settings Top Header (Kept Same as Existing Shell!) ==================== */
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

            /* ==================== Categorized Settings Navigation (Kept Same as Existing Shell!) ==================== */
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
                            .jaBouncyClick(pressedScale = 0.95f) { activeCategory = id }
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (selected) palette.accent else palette.bgTertiary)
                            .padding(horizontal = 13.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = icon,
                            contentDescription = null,
                            tint = if (selected) palette.accentDark else palette.textSecondary,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = label,
                            color = if (selected) palette.accentDark else palette.textSecondary,
                            fontSize = 13.sp,
                            fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.Medium,
                        )
                    }
                }
            }

            HorizontalDivider(color = palette.border)

            /* ==================== Animated Category Body ==================== */
            AnimatedContent(
                targetState = activeCategory,
                transitionSpec = {
                    fadeIn(animationSpec = tween(180)) togetherWith fadeOut(animationSpec = tween(120))
                },
                modifier = Modifier.fillMaxSize(),
                label = "settingsCategoryBody",
            ) { currentCat ->
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(18.dp)
                ) {
                    when (currentCat) {
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

                            // 1:1 Web `ProfileForm.tsx` `.pf-preview` (`2.5dp` `--profile-outline` `color.hex` border + Markdown Bio preview!)
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(20.dp))
                                    .background(palette.bgSecondary)
                                    .border(2.5.dp, colorSpec.ringColor, RoundedCornerShape(20.dp))
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
                                        val shownBanner = bannerUri?.toString()
                                            ?: me.bannerUrl?.takeIf { it.isNotBlank() }?.let { TursoApiClient.resolveAbsoluteMediaUrl(it) }
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
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
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
                                    if (bio.isNotBlank()) {
                                        Spacer(Modifier.height(2.dp))
                                        RichMarkdownText(
                                            text = bio,
                                            textColor = palette.textPrimary,
                                            subTextColor = palette.textSecondary,
                                            isLightSurface = !palette.isDark,
                                            accentColor = palette.accent,
                                            showLinkEmbeds = false,
                                            fontSizeSp = 13.5f,
                                        )
                                    }
                                }
                            }

                            Spacer(Modifier.height(16.dp))

                            // 1:1 Web Online Status Selector with Coloured Presence Dots
                            Text("Online Status", color = palette.textSecondary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(8.dp))
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                listOf(
                                    Triple("online", "Online", Color(0xFF22C55E)),
                                    Triple("away", "Away", Color(0xFFF59E0B)),
                                    Triple("dnd", "Do Not Disturb", Color(0xFFEF4444)),
                                    Triple("offline", "Invisible", Color(0xFF626272)),
                                ).forEach { (id, lbl, dotCol) ->
                                    val active = statusPref == id || (id == "away" && statusPref == "idle")
                                    Row(
                                        modifier = Modifier
                                            .jaBouncyClick(pressedScale = 0.95f) {
                                                statusPref = id
                                                vm.setPresenceStatus(id, customStatus)
                                            }
                                            .clip(RoundedCornerShape(999.dp))
                                            .background(if (active) palette.accentSoft else palette.bgSecondary)
                                            .border(1.dp, if (active) palette.accent else palette.border, RoundedCornerShape(999.dp))
                                            .padding(horizontal = 12.dp, vertical = 7.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(9.dp)
                                                .clip(CircleShape)
                                                .background(dotCol)
                                        )
                                        Spacer(Modifier.width(7.dp))
                                        Text(
                                            text = lbl,
                                            color = if (active) palette.textPrimary else palette.textSecondary,
                                            fontSize = 12.5.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
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
                                label = "Bio (${bio.length}/190 · Markdown supported)",
                                placeholder = "Tell friends a little about yourself… (**bold**, *italic*, `code`)",
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
                                            .jaBouncyClick(pressedScale = 0.95f) { avatarColor = spec.id }
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(if (selected) palette.accentSoft else palette.bgSecondary)
                                            .border(
                                                width = if (selected) 1.5.dp else 1.dp,
                                                color = if (selected) spec.ringColor else palette.border,
                                                shape = RoundedCornerShape(12.dp),
                                            )
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
                            AppearanceSettingsTab(
                                state = state,
                                vm = vm,
                                onOpenCustomDrawer = { showCustomThemeDrawer = true },
                            )
                        }

                        /* ==================== 1:1 Web Socials & Website (`ProfileForm.tsx` `sectionMode="socials"`) ==================== */
                        "socials" -> {
                            WebParitySocialsAndWebsiteSection(me = me, vm = vm)
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
                                    } catch (_: Throwable) {
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
                                    } catch (_: Throwable) {
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
                                shape = RoundedCornerShape(14.dp),
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
                                shape = RoundedCornerShape(14.dp),
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
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(palette.surface)
                                    .border(1.dp, palette.borderStrong, RoundedCornerShape(16.dp))
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

                        /* ==================== 1:1 Web Legal Policies & Privacy (`LegalModal.tsx` + `Settings.tsx`) ==================== */
                        "legal" -> {
                            WebParityLegalPoliciesSection(
                                palette = palette,
                                onOpenFullDocument = { tab -> legalDialogTab = tab },
                            )
                        }
                    }
                    Spacer(Modifier.height(32.dp))
                }
            }
        }

        /* ==================== Full 1:1 Web `CustomThemeDrawer.tsx` Slide-Over / Sheet ==================== */
        if (showCustomThemeDrawer) {
            WebParityCustomThemeDrawerOverlay(
                state = state,
                vm = vm,
                onBackToSettings = { showCustomThemeDrawer = false },
                onCloseAll = {
                    showCustomThemeDrawer = false
                    onClose()
                },
            )
        }

        legalDialogTab?.let { tab ->
            JaTextLegalModalDialog(
                initialTab = tab,
                onDismiss = { legalDialogTab = null },
            )
        }
    }
}

/* ==================== 1:1 Web Socials & Website Section (`ProfileForm.tsx` `sectionMode="socials"`) ==================== */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WebParitySocialsAndWebsiteSection(
    me: JaUser,
    vm: JaTextSessionViewModel,
) {
    val palette = LocalJaTextPalette.current
    val scope = rememberCoroutineScope()

    val socials = remember(me.id) {
        mutableStateListOf<UserSocialLink>().apply {
            addAll(me.socials.orEmpty())
        }
    }
    var selectedPlatform by remember { mutableStateOf("discord") }
    var customPlatformName by remember { mutableStateOf("") }
    var socialInput by remember { mutableStateOf("") }
    var websiteTitle by remember(me.id) { mutableStateOf(me.website?.title.orEmpty()) }
    var websiteUrl by remember(me.id) { mutableStateOf(me.website?.url.orEmpty()) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }

    fun handleAddSocial() {
        errorMsg = null
        val raw = socialInput.trim()
        if (raw.isEmpty()) return
        val spec = SOCIAL_PLATFORM_SPECS.firstOrNull { it.id == selectedPlatform } ?: SOCIAL_PLATFORM_SPECS.first()
        val platformKey = if (spec.id == "other") {
            customPlatformName.trim().ifBlank { "Social" }.take(32)
        } else {
            spec.id
        }
        val (handle, builtUrl) = spec.buildUrl(raw)
        if (!builtUrl.startsWith("http://") && !builtUrl.startsWith("https://")) {
            errorMsg = "Social URL must start with http:// or https://"
            return
        }
        val existingIdx = socials.indexOfFirst { it.platform.equals(platformKey, ignoreCase = true) }
        val newEntry = UserSocialLink(
            platform = platformKey,
            handle = handle.take(100),
            url = builtUrl.take(300),
        )
        if (existingIdx >= 0) {
            socials[existingIdx] = newEntry
        } else if (socials.size < 16) {
            socials.add(newEntry)
        }
        socialInput = ""
        if (spec.id == "other") customPlatformName = ""
    }

    // 1. `.socials-fieldset` Card
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(palette.bgSecondary)
            .border(1.dp, palette.border, RoundedCornerShape(18.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "Socials",
            color = palette.textPrimary,
            fontSize = 16.5.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        Text(
            text = "Connect your Discord, YouTube, X, and other social accounts. Anyone viewing your profile picture can click your connected socials.",
            color = palette.textSecondary,
            fontSize = 13.sp,
            lineHeight = 18.5.sp,
        )

        // Connected socials list (`.connected-socials-list`)
        if (socials.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                socials.forEachIndexed { idx, soc ->
                    val meta = getSocialPlatformMeta(soc.platform)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(palette.bgTertiary)
                            .border(1.dp, meta.brandTint.copy(alpha = 0.40f), RoundedCornerShape(14.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(meta.brandTint.copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            SocialBrandVectorIcon(
                                platformId = soc.platform,
                                size = 17.dp,
                                tint = if (!palette.isDark && meta.id in listOf("github", "x", "tiktok", "threads")) {
                                    Color(0xFF111827)
                                } else {
                                    meta.brandTint
                                },
                            )
                        }
                        Spacer(Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = meta.label,
                                color = palette.textPrimary,
                                fontSize = 13.5.sp,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = soc.handle.ifBlank { soc.url },
                                color = palette.textSecondary,
                                fontSize = 12.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        JaWebIconButton(
                            icon = Icons.Rounded.Close,
                            contentDescription = "Disconnect ${meta.label}",
                            size = 30.dp,
                            iconSize = 14.dp,
                            onClick = { socials.removeAt(idx) },
                        )
                    }
                }
            }
        }

        // 14 Social Platform Chips (`.social-platform-chips`)
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            SOCIAL_PLATFORM_SPECS.forEach { plat ->
                val active = selectedPlatform == plat.id
                Row(
                    modifier = Modifier
                        .jaBouncyClick(pressedScale = 0.94f) { selectedPlatform = plat.id }
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (active) plat.brandTint.copy(alpha = 0.16f) else palette.bgTertiary)
                        .border(
                            width = if (active) 1.5.dp else 1.dp,
                            color = if (active) plat.brandTint else palette.border,
                            shape = RoundedCornerShape(999.dp),
                        )
                        .padding(horizontal = 11.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SocialBrandVectorIcon(
                        platformId = plat.id,
                        size = 14.dp,
                        tint = if (!palette.isDark && plat.id in listOf("github", "x", "tiktok", "threads")) {
                            Color(0xFF111827)
                        } else {
                            plat.brandTint
                        },
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = plat.label,
                        color = palette.textPrimary,
                        fontSize = 12.sp,
                        fontWeight = if (active) FontWeight.ExtraBold else FontWeight.SemiBold,
                    )
                }
            }
        }

        if (selectedPlatform == "other") {
            JaWebInput(
                value = customPlatformName,
                onValueChange = { customPlatformName = it.take(32) },
                placeholder = "Platform name (e.g. SoundCloud, Behance, Threads)",
            )
        }

        val activeSpec = SOCIAL_PLATFORM_SPECS.firstOrNull { it.id == selectedPlatform } ?: SOCIAL_PLATFORM_SPECS.first()
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            JaWebInput(
                value = socialInput,
                onValueChange = { socialInput = it.take(260) },
                placeholder = activeSpec.placeholder,
                modifier = Modifier.weight(1f),
            )
            JaWebGhostButton(
                text = "Connect",
                leadingIcon = Icons.Rounded.Add,
                enabled = socialInput.trim().isNotEmpty(),
                onClick = { handleAddSocial() },
            )
        }
    }

    Spacer(Modifier.height(14.dp))

    // 2. `.website-fieldset` Card
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(palette.bgSecondary)
            .border(1.dp, palette.border, RoundedCornerShape(18.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "Website",
            color = palette.textPrimary,
            fontSize = 16.5.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        Text(
            text = "Add a website title and URL. It appears right underneath your socials on your profile card.",
            color = palette.textSecondary,
            fontSize = 13.sp,
            lineHeight = 18.5.sp,
        )
        JaWebInput(
            value = websiteTitle,
            onValueChange = { websiteTitle = it.take(60) },
            label = "Title",
            placeholder = "e.g. Portfolio, My Channel, Blog",
        )
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = "URL",
                color = palette.textSecondary,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(palette.bgTertiary)
                    .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                    .padding(horizontal = 13.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                WebsiteGlobeVectorIcon(size = 16.dp, tint = palette.textSecondary)
                Spacer(Modifier.width(9.dp))
                BasicTextField(
                    value = websiteUrl,
                    onValueChange = { websiteUrl = it.take(300) },
                    singleLine = true,
                    textStyle = TextStyle(color = palette.textPrimary, fontSize = 14.5.sp),
                    modifier = Modifier.weight(1f),
                    decorationBox = { inner ->
                        if (websiteUrl.isEmpty()) {
                            Text("https://example.com", color = palette.textTertiary, fontSize = 14.5.sp)
                        }
                        inner()
                    },
                )
            }
        }
        if (websiteTitle.isNotBlank() || websiteUrl.isNotBlank()) {
            JaWebGhostButton(
                text = "Clear website",
                onClick = {
                    websiteTitle = ""
                    websiteUrl = ""
                },
            )
        }
    }

    if (!errorMsg.isNullOrBlank()) {
        Spacer(Modifier.height(12.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0x1FEF4444))
                .border(1.dp, Color(0x80EF4444), RoundedCornerShape(12.dp))
                .padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            Text(errorMsg!!, color = Color(0xFFFCA5A5), fontSize = 13.sp)
        }
    }

    Spacer(Modifier.height(18.dp))

    JaWebPrimaryButton(
        text = if (saving) "Saving…" else "Save Socials & Website",
        enabled = !saving,
        modifier = Modifier.fillMaxWidth(),
        onClick = {
            errorMsg = null
            val finalSocials = socials.toMutableList()
            if (socialInput.trim().isNotEmpty()) {
                val spec = SOCIAL_PLATFORM_SPECS.firstOrNull { it.id == selectedPlatform } ?: SOCIAL_PLATFORM_SPECS.first()
                val platformKey = if (spec.id == "other") {
                    customPlatformName.trim().ifBlank { "Social" }.take(32)
                } else {
                    spec.id
                }
                val (handle, builtUrl) = spec.buildUrl(socialInput.trim())
                if (builtUrl.startsWith("http://") || builtUrl.startsWith("https://")) {
                    finalSocials.removeAll { it.platform.equals(platformKey, ignoreCase = true) }
                    finalSocials.add(UserSocialLink(platformKey, handle.take(100), builtUrl.take(300)))
                }
            }

            var finalWebsite: UserWebsiteLink? = null
            if (websiteUrl.trim().isNotEmpty() || websiteTitle.trim().isNotEmpty()) {
                if (websiteUrl.trim().isEmpty()) {
                    errorMsg = "Enter a URL for your website (for example, https://example.com)."
                    return@JaWebPrimaryButton
                }
                val normalized = if (Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:").containsMatchIn(websiteUrl.trim())) {
                    websiteUrl.trim()
                } else {
                    "https://${websiteUrl.trim()}"
                }
                val hostFallback = runCatching { Uri.parse(normalized).host?.removePrefix("www.") }.getOrNull().orEmpty().ifBlank { "Website" }
                finalWebsite = UserWebsiteLink(
                    title = websiteTitle.trim().ifBlank { hostFallback }.take(60),
                    url = normalized.take(300),
                )
            }

            saving = true
            scope.launch {
                try {
                    vm.saveProfile(
                        displayName = me.displayName,
                        username = me.username,
                        bio = me.bio,
                        pronouns = me.pronouns,
                        avatarColor = me.avatarColor,
                        socials = finalSocials,
                        website = finalWebsite ?: UserWebsiteLink("", ""),
                    )
                    socialInput = ""
                    vm.showToast("Socials & website saved!")
                } catch (e: Throwable) {
                    errorMsg = e.message ?: "Could not save your socials."
                } finally {
                    saving = false
                }
            }
        },
    )
}

/* ==================== 1:1 Web Legal Policies & Privacy (`Settings.tsx` + `LegalModal.tsx`) ==================== */

@Composable
private fun WebParityLegalPoliciesSection(
    palette: JaTextPalette,
    onOpenFullDocument: (String) -> Unit,
) {
    var inlineTab by remember { mutableStateOf("terms") }

    Text(
        text = "Legal Policies & Privacy",
        color = palette.textPrimary,
        fontSize = 18.sp,
        fontWeight = FontWeight.ExtraBold,
    )
    Spacer(Modifier.height(4.dp))
    Text(
        text = "Review JaText's official Terms of Service and Privacy Policy.",
        color = palette.textSecondary,
        fontSize = 13.sp,
    )
    Spacer(Modifier.height(14.dp))

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .jaBouncyClick(pressedScale = 0.96f) { onOpenFullDocument("terms") }
                .clip(RoundedCornerShape(16.dp))
                .background(palette.bgSecondary)
                .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                .padding(horizontal = 13.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Rounded.Description, null, tint = palette.accent, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(
                text = "Terms of Service",
                color = palette.textPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            Icon(Icons.Rounded.OpenInNew, null, tint = palette.textSecondary, modifier = Modifier.size(14.dp))
        }
        Row(
            modifier = Modifier
                .weight(1f)
                .jaBouncyClick(pressedScale = 0.96f) { onOpenFullDocument("privacy") }
                .clip(RoundedCornerShape(16.dp))
                .background(palette.bgSecondary)
                .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                .padding(horizontal = 13.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Rounded.Lock, null, tint = palette.accent, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(
                text = "Privacy Policy",
                color = palette.textPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            Icon(Icons.Rounded.OpenInNew, null, tint = palette.textSecondary, modifier = Modifier.size(14.dp))
        }
    }

    Spacer(Modifier.height(14.dp))

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(palette.bgSecondary)
            .border(1.dp, palette.border, RoundedCornerShape(20.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        JaWebTabs(
            tabs = listOf(
                JaTabItem("terms", "Terms of Service", icon = Icons.Rounded.Description),
                JaTabItem("privacy", "Privacy Policy", icon = Icons.Rounded.Lock),
            ),
            selectedId = inlineTab,
            onSelect = { inlineTab = it },
        )

        if (inlineTab == "terms") {
            Text("Terms of Service", color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
            Text("For JaText · Effective date: 25 October 2026", color = palette.textSecondary, fontSize = 12.sp)
            Text(
                "These terms govern your use of JaText, an independent real-time encrypted messaging app. By creating an account or using JaText, you agree to these terms and to our Privacy Policy.",
                color = palette.textSecondary,
                fontSize = 13.sp,
                lineHeight = 19.sp,
            )
            Text("1. Your account", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text("• Provide accurate registration details, keep credentials secure, and be at least 13 years old.\n• Usernames can be changed at most once every 14 days.", color = palette.textSecondary, fontSize = 13.sp, lineHeight = 19.sp)
            Text("2. Acceptable use", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text("• Do not harass, threaten, spam, impersonate others, upload illegal content, or attempt unauthorised access.", color = palette.textSecondary, fontSize = 13.sp, lineHeight = 19.sp)
            Text("3. Your content & availability", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text("• You keep ownership of your profile, messages, and files. JaText stores and delivers them solely to operate the service on an \"as is\" basis.", color = palette.textSecondary, fontSize = 13.sp, lineHeight = 19.sp)
        } else {
            Text("Privacy Policy", color = palette.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
            Text("For JaText · Effective date: 25 October 2026", color = palette.textSecondary, fontSize = 12.sp)
            Text(
                "JaText never sells your personal information, uses your messages for advertising, or shows third-party ads.",
                color = palette.textSecondary,
                fontSize = 13.sp,
                lineHeight = 19.sp,
            )
            Text("1. Information we collect", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text("• Email & encrypted credentials (or Google name, email, and avatar if using Google Sign-In; never your Google password, Gmail, Drive, or contacts).\n• Profile details, social links, and end-to-end encrypted messages & media envelopes.", color = palette.textSecondary, fontSize = 13.sp, lineHeight = 19.sp)
            Text("2. Service providers & retention", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text("• Turso hosts encrypted database & media chunks; Vercel hosts web & API routes; Google provides optional sign-in and push delivery.\n• Contact the developer support email on the Google sign-in consent screen to request account deletion at any time.", color = palette.textSecondary, fontSize = 13.sp, lineHeight = 19.sp)
        }

        JaWebGhostButton(
            text = if (inlineTab == "terms") "Read full Terms of Service" else "Read full Privacy Policy",
            modifier = Modifier.fillMaxWidth(),
            onClick = { onOpenFullDocument(inlineTab) },
        )
    }
}

/* ==================== Appearance Tab + 1:1 Web `CustomThemeDrawer.tsx` ==================== */

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun AppearanceSettingsTab(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    onOpenCustomDrawer: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val cfg = state.themeConfig

    Text(
        text = "Appearance",
        color = palette.textPrimary,
        fontSize = 18.sp,
        fontWeight = FontWeight.Bold,
    )
    Spacer(Modifier.height(4.dp))
    // User-constrained subtitle ending on "... or build your own custom theme."
    Text(
        text = "Pick a crisp default mode, choose any gradient colour theme, or build your own custom theme.",
        color = palette.textSecondary,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    )

    Spacer(Modifier.height(16.dp))

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(palette.surface)
            .border(1.dp, palette.border, RoundedCornerShape(16.dp))
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
                    modifier = Modifier.jaBouncyClick(pressedScale = 0.92f) {
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

        // Customise Theme Tile -> Opens 1:1 Web `CustomThemeDrawer`!
        val customSelected = cfg.kind == "custom"
        val customPreviewStops = remember(cfg.custom.colors) {
            cfg.custom.colors.ifEmpty { listOf("#668F81", "#667C8B", "#84766D") }
                .map { JaTextThemeManager.parseHexColor(it) }
                .let { if (it.size == 1) listOf(it[0], it[0]) else it }
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.jaBouncyClick(pressedScale = 0.92f) {
                vm.updateThemeConfig(cfg.copy(kind = "custom"), pushRemoteIfSynced = false)
                onOpenCustomDrawer()
            }
        ) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(CircleShape)
                    .background(Brush.linearGradient(customPreviewStops))
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

    if (cfg.kind == "custom") {
        Spacer(Modifier.height(12.dp))
        JaWebPrimaryButton(
            text = "Open Customise Theme Studio",
            leadingIcon = Icons.Rounded.Palette,
            modifier = Modifier.fillMaxWidth(),
            onClick = onOpenCustomDrawer,
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
                        .jaBouncyClick(pressedScale = 0.92f) {
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
 * Exact 1:1 recreation of `src/components/CustomThemeDrawer.tsx`:
 * - Live background gradient preview
 * - Segmented `Dark` / `Light` Appearance switch with Moon & Sun icons
 * - Gradient stops bar (`custom-theme-stops-bar`) + selectable circular stop chips
 * - 120 FPS 2D Saturation/Value canvas with Web's signature double-ring cursor
 * - Custom GPU-fast Rainbow Hue Slider + `#HEX` editable code row + `-` remove stop + `+ Add Colour`
 * - Custom GPU-fast Gradient Direction (`0°..360°`) & Colour Intensity (`10%..100%`) sliders
 * - `Shuffle` + `Apply Theme` (`✓ Applied`) + `Back to Settings` footer!
 */
@Composable
private fun WebParityCustomThemeDrawerOverlay(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    onBackToSettings: () -> Unit,
    onCloseAll: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val cfg = state.themeConfig
    val initialCustom = cfg.custom

    var appearance by remember { mutableStateOf(initialCustom.appearance.ifBlank { "dark" }) }
    val stops = remember {
        mutableStateListOf<String>().apply {
            addAll(initialCustom.colors.ifEmpty { listOf("#efb4aa", "#b695f8") })
        }
    }
    var selectedStopIdx by remember { mutableIntStateOf(0) }
    var angle by remember { mutableFloatStateOf(initialCustom.angle.toFloat()) }
    var intensity by remember { mutableFloatStateOf(initialCustom.intensity.toFloat()) }
    var hexDraft by remember { mutableStateOf(stops.firstOrNull()?.uppercase() ?: "#EFB4AA") }
    var appliedToast by remember { mutableStateOf(false) }

    LaunchedEffect(appliedToast) {
        if (appliedToast) {
            delay(1600L)
            appliedToast = false
        }
    }

    fun hsvFromHex(hex: String): FloatArray {
        val c = JaTextThemeManager.parseHexColor(hex)
        val arr = FloatArray(3)
        android.graphics.Color.RGBToHSV(
            (c.red * 255f).toInt().coerceIn(0, 255),
            (c.green * 255f).toInt().coerceIn(0, 255),
            (c.blue * 255f).toInt().coerceIn(0, 255),
            arr
        )
        return arr
    }

    val startHsv = remember { hsvFromHex(stops.firstOrNull() ?: "#efb4aa") }
    var hue by remember { mutableFloatStateOf(startHsv[0]) }
    var sat by remember { mutableFloatStateOf(startHsv[1]) }
    var valueBri by remember { mutableFloatStateOf(startHsv[2]) }

    fun selectStop(idx: Int) {
        val clamped = idx.coerceIn(0, (stops.size - 1).coerceAtLeast(0))
        selectedStopIdx = clamped
        val h = stops.getOrElse(clamped) { "#efb4aa" }
        val arr = hsvFromHex(h)
        hue = arr[0]
        sat = arr[1]
        valueBri = arr[2]
        hexDraft = h.uppercase()
    }

    fun buildCurrentData(): CustomThemeData = CustomThemeData(
        appearance = appearance,
        colors = stops.toList(),
        angle = angle.toInt(),
        intensity = intensity.toInt(),
    )

    fun pushDraft(commitRemote: Boolean) {
        vm.updateThemeConfig(
            cfg.copy(kind = "custom", custom = buildCurrentData()),
            pushRemoteIfSynced = commitRemote,
        )
    }

    fun syncActiveStopFromHsv(commitRemote: Boolean) {
        val rgbInt = android.graphics.Color.HSVToColor(floatArrayOf(hue, sat, valueBri))
        val hex = "#%06x".format(0xFFFFFF and rgbInt)
        if (selectedStopIdx in stops.indices) {
            stops[selectedStopIdx] = hex
        }
        hexDraft = hex.uppercase()
        pushDraft(commitRemote)
    }

    val activeHex = stops.getOrElse(selectedStopIdx.coerceIn(0, (stops.size - 1).coerceAtLeast(0))) { "#efb4aa" }
    val activeStopColor = remember(activeHex) { JaTextThemeManager.parseHexColor(activeHex) }
    val pureHueColor = remember(hue) {
        Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, 1f, 1f)))
    }
    val stopColorList = remember(stops.toList()) {
        val mapped = stops.map { JaTextThemeManager.parseHexColor(it) }
        if (mapped.size == 1) listOf(mapped[0], mapped[0]) else mapped
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .then(
                if (palette.rootGradientBrush != null) Modifier.background(palette.rootGradientBrush)
                else Modifier.background(palette.bgPrimary)
            )
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 14.dp, vertical = 10.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(palette.bgSecondary.copy(alpha = 0.94f))
                .border(1.dp, palette.borderStrong, RoundedCornerShape(24.dp))
        ) {
            /* ---- `.custom-theme-drawer-head` ---- */
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.Palette, null, tint = palette.accent, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "Customise Theme",
                        color = palette.textPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                }
                JaWebIconButton(
                    icon = Icons.Rounded.Close,
                    contentDescription = "Close theme customiser",
                    size = 34.dp,
                    iconSize = 16.dp,
                    onClick = onCloseAll,
                )
            }

            HorizontalDivider(color = palette.border)

            /* ---- `.custom-theme-drawer-body` ---- */
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 18.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // 1. Appearance (`Dark` | `Light`)
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "APPEARANCE",
                        color = palette.textSecondary,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 0.6.sp,
                    )
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(palette.bgTertiary)
                            .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                            .padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        listOf(
                            Triple("dark", "Dark", Icons.Rounded.DarkMode),
                            Triple("light", "Light", Icons.Rounded.LightMode),
                        ).forEach { (id, lbl, icon) ->
                            val active = appearance == id
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .jaBouncyClick(pressedScale = 0.96f) {
                                        appearance = id
                                        pushDraft(commitRemote = true)
                                    }
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(if (active) palette.accent else Color.Transparent)
                                    .padding(vertical = 9.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    imageVector = icon,
                                    contentDescription = lbl,
                                    tint = if (active) palette.accentDark else palette.textSecondary,
                                    modifier = Modifier.size(16.dp),
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = lbl,
                                    color = if (active) palette.accentDark else palette.textSecondary,
                                    fontSize = 13.5.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                }

                // 2. Colours (`custom-theme-stops-bar` + 2D SV Canvas + Rainbow Hue + Hex Row + Add Colour)
                Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
                    Text(
                        text = "COLOURS",
                        color = palette.textSecondary,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 0.6.sp,
                    )

                    // Gradient stops bar with circular stop chips along the gradient!
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(44.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(14.dp)
                                .clip(RoundedCornerShape(999.dp))
                                .background(Brush.horizontalGradient(stopColorList))
                                .border(1.dp, palette.borderStrong, RoundedCornerShape(999.dp))
                        )
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 6.dp),
                            horizontalArrangement = if (stops.size == 1) Arrangement.Center else Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            stops.forEachIndexed { idx, hex ->
                                val c = JaTextThemeManager.parseHexColor(hex)
                                val selected = idx == selectedStopIdx
                                Box(
                                    modifier = Modifier
                                        .size(if (selected) 32.dp else 26.dp)
                                        .jaBouncyClick(pressedScale = 0.90f) { selectStop(idx) }
                                        .clip(CircleShape)
                                        .background(c)
                                        .border(
                                            width = if (selected) 3.dp else 2.dp,
                                            color = if (selected) Color.White else Color(0x99000000),
                                            shape = CircleShape,
                                        )
                                )
                            }
                        }
                    }

                    // 2D Saturation-Value Canvas (`custom-theme-sv-canvas`) with Double-Ring Cursor
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(178.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .border(1.dp, palette.borderStrong, RoundedCornerShape(16.dp))
                            .pointerInput(selectedStopIdx) {
                                detectTapGestures { pos ->
                                    sat = (pos.x / size.width).coerceIn(0f, 1f)
                                    valueBri = (1f - (pos.y / size.height)).coerceIn(0f, 1f)
                                    syncActiveStopFromHsv(commitRemote = true)
                                }
                            }
                            .pointerInput(selectedStopIdx) {
                                detectDragGestures(
                                    onDragEnd = { syncActiveStopFromHsv(commitRemote = true) },
                                    onDragCancel = { syncActiveStopFromHsv(commitRemote = true) },
                                    onDrag = { change, _ ->
                                        change.consume()
                                        sat = (change.position.x / size.width).coerceIn(0f, 1f)
                                        valueBri = (1f - (change.position.y / size.height)).coerceIn(0f, 1f)
                                        syncActiveStopFromHsv(commitRemote = false)
                                    }
                                )
                            }
                    ) {
                        Canvas(modifier = Modifier.fillMaxSize()) {
                            drawRect(color = pureHueColor)
                            drawRect(brush = Brush.horizontalGradient(listOf(Color.White, Color.Transparent)))
                            drawRect(brush = Brush.verticalGradient(listOf(Color.Transparent, Color.Black)))

                            val cx = (sat * size.width).coerceIn(10.dp.toPx(), size.width - 10.dp.toPx())
                            val cy = ((1f - valueBri) * size.height).coerceIn(10.dp.toPx(), size.height - 10.dp.toPx())
                            drawCircle(color = Color(0x88000000), radius = 11.5.dp.toPx(), center = Offset(cx, cy), style = Stroke(width = 2.dp.toPx()))
                            drawCircle(color = activeStopColor, radius = 9.dp.toPx(), center = Offset(cx, cy))
                            drawCircle(color = Color.White, radius = 9.5.dp.toPx(), center = Offset(cx, cy), style = Stroke(width = 2.5.dp.toPx()))
                        }
                    }

                    // Custom Rainbow Hue Track Slider (`0..360°`)
                    WebFastTrackSlider(
                        value = hue,
                        min = 0f,
                        max = 360f,
                        isRainbowHue = true,
                        accentColor = pureHueColor,
                        onValueChange = { nextHue ->
                            hue = nextHue
                            syncActiveStopFromHsv(commitRemote = false)
                        },
                        onValueChangeFinished = { syncActiveStopFromHsv(commitRemote = true) },
                    )

                    // Hex Colour Code Row (`custom-theme-hex-row`) + Remove Stop Button
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(14.dp))
                                .background(palette.bgTertiary)
                                .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                .padding(horizontal = 10.dp, vertical = 9.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(24.dp)
                                    .clip(RoundedCornerShape(7.dp))
                                    .background(activeStopColor)
                                    .border(1.dp, palette.borderStrong, RoundedCornerShape(7.dp))
                            )
                            Spacer(Modifier.width(10.dp))
                            BasicTextField(
                                value = hexDraft,
                                onValueChange = { raw ->
                                    val clean = raw.uppercase().take(7)
                                    hexDraft = clean
                                    val candidate = if (clean.startsWith("#")) clean else "#$clean"
                                    if (Regex("^#[0-9A-F]{6}$").matches(candidate)) {
                                        val norm = candidate.lowercase()
                                        if (selectedStopIdx in stops.indices) {
                                            stops[selectedStopIdx] = norm
                                        }
                                        val arr = hsvFromHex(norm)
                                        hue = arr[0]
                                        sat = arr[1]
                                        valueBri = arr[2]
                                        pushDraft(commitRemote = true)
                                    }
                                },
                                singleLine = true,
                                textStyle = TextStyle(
                                    color = palette.textPrimary,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }

                        JaWebIconButton(
                            icon = Icons.Rounded.Remove,
                            contentDescription = "Remove colour stop",
                            size = 42.dp,
                            iconSize = 18.dp,
                            onClick = {
                                if (stops.size > 1) {
                                    stops.removeAt(selectedStopIdx.coerceIn(0, stops.lastIndex))
                                    selectStop((selectedStopIdx - 1).coerceAtLeast(0))
                                    pushDraft(commitRemote = true)
                                }
                            },
                        )
                    }

                    // `+ Add Colour` Button (up to 5 stops)
                    if (stops.size < 5) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .jaBouncyClick(pressedScale = 0.97f) {
                                    val newHue = (hue + 48f) % 360f
                                    val rgb = android.graphics.Color.HSVToColor(floatArrayOf(newHue, 0.55f, 0.92f))
                                    stops.add("#%06x".format(0xFFFFFF and rgb))
                                    selectStop(stops.lastIndex)
                                    pushDraft(commitRemote = true)
                                }
                                .clip(RoundedCornerShape(14.dp))
                                .background(palette.bgTertiary)
                                .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                .padding(vertical = 10.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Rounded.Add, null, tint = palette.textPrimary, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = "Add Colour",
                                color = palette.textPrimary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }

                // 3. Controls (`Gradient Direction` & `Colour Intensity`)
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        text = "CONTROLS",
                        color = palette.textSecondary,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 0.6.sp,
                    )

                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Gradient Direction", color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            Text("${angle.toInt()}°", color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
                        }
                        WebFastTrackSlider(
                            value = angle,
                            min = 0f,
                            max = 360f,
                            isRainbowHue = false,
                            accentColor = palette.accent,
                            onValueChange = {
                                angle = it
                                pushDraft(commitRemote = false)
                            },
                            onValueChangeFinished = { pushDraft(commitRemote = true) },
                        )
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Colour Intensity", color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            Text("${intensity.toInt()}%", color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
                        }
                        WebFastTrackSlider(
                            value = intensity,
                            min = 10f,
                            max = 100f,
                            isRainbowHue = false,
                            accentColor = palette.accent,
                            onValueChange = {
                                intensity = it
                                pushDraft(commitRemote = false)
                            },
                            onValueChangeFinished = { pushDraft(commitRemote = true) },
                        )
                    }
                }
            }

            HorizontalDivider(color = palette.border)

            /* ---- `.custom-theme-drawer-foot` (`Shuffle` + `Apply Theme` + `Back to Settings`) ---- */
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    JaWebGhostButton(
                        text = "Shuffle",
                        leadingIcon = Icons.Rounded.Shuffle,
                        onClick = {
                            val baseHue = Random.nextFloat() * 360f
                            val count = Random.nextInt(2, 4)
                            stops.clear()
                            repeat(count) { i ->
                                val h = (baseHue + i * (45f + Random.nextFloat() * 55f)) % 360f
                                val s = 0.42f + Random.nextFloat() * 0.40f
                                val v = if (appearance == "light") 0.88f + Random.nextFloat() * 0.10f else 0.65f + Random.nextFloat() * 0.28f
                                val rgb = android.graphics.Color.HSVToColor(floatArrayOf(h, s, v))
                                stops.add("#%06x".format(0xFFFFFF and rgb))
                            }
                            angle = Random.nextInt(0, 360).toFloat()
                            selectStop(0)
                            pushDraft(commitRemote = true)
                        },
                    )
                    JaWebPrimaryButton(
                        text = if (appliedToast) "Applied" else "Apply Theme",
                        leadingIcon = if (appliedToast) Icons.Rounded.Check else null,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            pushDraft(commitRemote = true)
                            appliedToast = true
                        },
                    )
                }

                JaWebGhostButton(
                    text = "Back to Settings",
                    modifier = Modifier.fillMaxWidth(),
                    onClick = onBackToSettings,
                )
            }
        }
    }
}

/**
 * Custom GPU-fast horizontal track slider matching `FastGpuSlider` in `CustomThemeDrawer.tsx` (`22dp` thumb, rainbow or accent track).
 */
@Composable
private fun WebFastTrackSlider(
    value: Float,
    min: Float,
    max: Float,
    isRainbowHue: Boolean,
    accentColor: Color,
    onValueChange: (Float) -> Unit,
    onValueChangeFinished: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val rainbowBrush = remember {
        Brush.horizontalGradient(
            listOf(
                Color(0xFFFF0000),
                Color(0xFFFFFF00),
                Color(0xFF00FF00),
                Color(0xFF00FFFF),
                Color(0xFF0000FF),
                Color(0xFFFF00FF),
                Color(0xFFFF0000),
            )
        )
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(30.dp)
            .pointerInput(min, max) {
                detectTapGestures { pos ->
                    val pad = 11.dp.toPx()
                    val usable = (size.width - pad * 2f).coerceAtLeast(1f)
                    val ratio = ((pos.x - pad) / usable).coerceIn(0f, 1f)
                    onValueChange(min + ratio * (max - min))
                    onValueChangeFinished()
                }
            }
            .pointerInput(min, max) {
                detectDragGestures(
                    onDragEnd = { onValueChangeFinished() },
                    onDragCancel = { onValueChangeFinished() },
                    onDrag = { change, _ ->
                        change.consume()
                        val pad = 11.dp.toPx()
                        val usable = (size.width - pad * 2f).coerceAtLeast(1f)
                        val ratio = ((change.position.x - pad) / usable).coerceIn(0f, 1f)
                        onValueChange(min + ratio * (max - min))
                    }
                )
            }
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val thumbRadius = 11.dp.toPx()
            val trackH = 12.dp.toPx()
            val trackTop = (size.height - trackH) / 2f
            val usableW = (size.width - thumbRadius * 2f).coerceAtLeast(1f)
            val ratio = ((value - min) / (max - min).coerceAtLeast(1f)).coerceIn(0f, 1f)
            val thumbX = thumbRadius + ratio * usableW

            if (isRainbowHue) {
                drawRoundRect(
                    brush = rainbowBrush,
                    topLeft = Offset(thumbRadius, trackTop),
                    size = Size(usableW, trackH),
                    cornerRadius = CornerRadius(trackH / 2f, trackH / 2f),
                )
            } else {
                drawRoundRect(
                    color = palette.bgTertiary,
                    topLeft = Offset(thumbRadius, trackTop),
                    size = Size(usableW, trackH),
                    cornerRadius = CornerRadius(trackH / 2f, trackH / 2f),
                )
                drawRoundRect(
                    color = accentColor,
                    topLeft = Offset(thumbRadius, trackTop),
                    size = Size((usableW * ratio).coerceAtLeast(trackH / 2f), trackH),
                    cornerRadius = CornerRadius(trackH / 2f, trackH / 2f),
                )
            }

            val cy = size.height / 2f
            drawCircle(color = Color(0x66000000), radius = thumbRadius + 1.5.dp.toPx(), center = Offset(thumbX, cy))
            drawCircle(color = accentColor, radius = thumbRadius - 1.dp.toPx(), center = Offset(thumbX, cy))
            drawCircle(color = Color.White, radius = thumbRadius - 1.dp.toPx(), center = Offset(thumbX, cy), style = Stroke(width = 2.8.dp.toPx()))
        }
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
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) palette.accentSoft else palette.surface)
            .border(1.dp, if (selected) palette.accent else palette.border, RoundedCornerShape(14.dp))
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
