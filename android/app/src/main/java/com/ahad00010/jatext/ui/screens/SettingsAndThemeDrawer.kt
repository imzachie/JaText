package com.ahad00010.jatext.ui.screens

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.media.MediaPlayer
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Computer
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Gavel
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.LinkOff
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Text
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
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
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import com.ahad00010.jatext.BuildConfig
import com.ahad00010.jatext.JaTextSoundManager
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.LinkedWebDevice
import com.ahad00010.jatext.data.OwnerManagedUser
import com.ahad00010.jatext.data.OwnerPlatformStats
import com.ahad00010.jatext.data.TursoApiClient
import com.ahad00010.jatext.data.UserSocialLink
import com.ahad00010.jatext.data.UserWebsiteLink
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.state.SessionUiState
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.components.JaWebInput
import com.ahad00010.jatext.ui.components.RichMarkdownText
import com.ahad00010.jatext.ui.components.jaBouncyClick
import com.ahad00010.jatext.ui.icons.SOCIAL_PLATFORM_SPECS
import com.ahad00010.jatext.ui.icons.SettingsAccountKeySvgIcon
import com.ahad00010.jatext.ui.icons.SettingsAddStatusPlusIcon
import com.ahad00010.jatext.ui.icons.SettingsBackChevronSvgIcon
import com.ahad00010.jatext.ui.icons.SettingsChatsBubbleSvgIcon
import com.ahad00010.jatext.ui.icons.SettingsChevronRightSvgIcon
import com.ahad00010.jatext.ui.icons.SettingsLegalDocSvgIcon
import com.ahad00010.jatext.ui.icons.SettingsLinkedDevicesSvgIcon
import com.ahad00010.jatext.ui.icons.SettingsNotificationsBadgeSvgIcon
import com.ahad00010.jatext.ui.icons.SettingsPrivacyLockSvgIcon
import com.ahad00010.jatext.ui.icons.SettingsQrCodeSvgIcon
import com.ahad00010.jatext.ui.icons.SettingsSearchSvgIcon
import com.ahad00010.jatext.ui.icons.SettingsSocialsLinksSvgIcon
import com.ahad00010.jatext.ui.icons.SocialBrandVectorIcon
import com.ahad00010.jatext.ui.icons.WebUiIconKind
import com.ahad00010.jatext.ui.icons.WebUiSvgIcon
import com.ahad00010.jatext.ui.icons.WebsiteGlobeVectorIcon
import com.ahad00010.jatext.ui.icons.getSocialPlatformMeta
import com.ahad00010.jatext.ui.theme.AVATAR_COLOR_SPECS
import com.ahad00010.jatext.ui.theme.COLOUR_THEME_PRESETS
import com.ahad00010.jatext.ui.theme.CustomThemeData
import com.ahad00010.jatext.ui.theme.JaTextPalette
import com.ahad00010.jatext.ui.theme.JaTextThemeManager
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import com.ahad00010.jatext.ui.theme.SfProDisplayFontFamily
import com.ahad00010.jatext.ui.theme.SfProTextFontFamily
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.emptyBackdrop
import com.kyant.backdrop.components.LiquidAmbientMeshBackdrop
import com.kyant.backdrop.components.LiquidButton
import com.kyant.backdrop.components.LiquidGlassCard
import com.kyant.backdrop.components.LiquidIconButton
import com.kyant.backdrop.components.LiquidOpticsLivePreview
import com.kyant.backdrop.components.LiquidPillChip
import com.kyant.backdrop.components.LiquidSlider
import com.kyant.backdrop.components.LiquidTextFieldBar
import com.kyant.backdrop.components.LiquidToggle
import com.kyant.backdrop.components.LocalLiquidGlassOptics
import com.kyant.backdrop.components.rememberPersistedLiquidGlassOptics
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt
import kotlin.random.Random
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val IOS_LIQUID_BLUE = Color(0xFF0088FF)
private val IOS_LIQUID_GREEN = Color(0xFF30D158)
private val IOS_LIQUID_RED = Color(0xFFFF3B30)

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun SettingsModalScreen(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    onClose: () -> Unit,
    embeddedInBottomBar: Boolean = false,
    onOpenAccountSwitcher: (() -> Unit)? = null,
    onFullScreenOverlayChange: (Boolean) -> Unit = {},
) {
    val context = LocalContext.current
    val palette = LocalJaTextPalette.current
    val scope = rememberCoroutineScope()
    val me = state.me ?: return

    val liquidOptics = rememberPersistedLiquidGlassOptics(context)
    val settingsBackdrop = remember { emptyBackdrop() }
    val systemNavBottomPadding = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

    var openSubpage by remember { mutableStateOf<String?>(null) } // null = "You" Hub | profile | appearance | devices | socials | audio | encryption | legal
    var showCustomThemeDrawer by remember { mutableStateOf(false) }
    var showQrScanner by remember { mutableStateOf(false) }
    var showCustomStatusDialog by remember { mutableStateOf(false) }
    var isSearchingSettings by remember { mutableStateOf(false) }
    var settingsSearchQuery by remember { mutableStateOf("") }
    var legalDialogTab by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(showCustomThemeDrawer, showQrScanner) {
        onFullScreenOverlayChange(showCustomThemeDrawer || showQrScanner)
    }
    DisposableEffect(Unit) {
        onDispose {
            onFullScreenOverlayChange(false)
        }
    }

    BackHandler {
        when {
            showQrScanner -> showQrScanner = false
            showCustomThemeDrawer -> showCustomThemeDrawer = false
            showCustomStatusDialog -> showCustomStatusDialog = false
            isSearchingSettings -> {
                isSearchingSettings = false
                settingsSearchQuery = ""
            }
            openSubpage != null -> openSubpage = null
            else -> onClose()
        }
    }

    val isOwnerAccount = remember(me.id, me.email, me.username, me.isOwner) {
        isJaTextPlatformOwner(me)
    }

    val subpageTitles = mapOf(
        "devices" to "Linked devices",
        "profile" to "Account",
        "encryption" to "Privacy",
        "appearance" to "Chats",
        "audio" to "Notifications",
        "socials" to "Socials",
        "legal" to "Legal",
        "owner" to "Owner Settings",
    )

    val tintedActionColor = if (palette.isDark) palette.accent else IOS_LIQUID_BLUE
    val pageCanvasSolidColor = when {
        !palette.isDark -> palette.bgSecondary
        palette.bgPrimary == Color(0xFF000000) -> Color.Black
        else -> palette.bgSecondary
    }

    CompositionLocalProvider(LocalLiquidGlassOptics provides liquidOptics) {
        Box(modifier = Modifier.fillMaxSize()) {
            /* ==================== Layer 0: Theme-Adaptive Settings Canvas ==================== */
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .then(
                        if (palette.rootGradientBrush != null) Modifier.background(palette.rootGradientBrush)
                        else Modifier.background(pageCanvasSolidColor)
                    )
            ) {
                if (palette.rootGradientBrush != null || (palette.isDark && openSubpage != null)) {
                    LiquidAmbientMeshBackdrop(
                        accentColor = palette.accent,
                        secondaryColor = Color(0xFF6366F1),
                        isDark = palette.isDark,
                    )
                }
            }

            /* ==================== Layer 1: Smooth Push/Pop "You" Hub <-> Subpage Container ==================== */
            AnimatedContent(
                targetState = openSubpage,
                transitionSpec = {
                    val pushing = initialState == null && targetState != null
                    val popping = initialState != null && targetState == null
                    when {
                        pushing -> (
                            slideInHorizontally(
                                animationSpec = tween(280, easing = FastOutSlowInEasing),
                                initialOffsetX = { fullWidth -> fullWidth / 3 },
                            ) + fadeIn(animationSpec = tween(220))
                        ) togetherWith (
                            slideOutHorizontally(
                                animationSpec = tween(260, easing = FastOutSlowInEasing),
                                targetOffsetX = { fullWidth -> -fullWidth / 5 },
                            ) + fadeOut(animationSpec = tween(175))
                        )
                        popping -> (
                            slideInHorizontally(
                                animationSpec = tween(260, easing = FastOutSlowInEasing),
                                initialOffsetX = { fullWidth -> -fullWidth / 4 },
                            ) + fadeIn(animationSpec = tween(200))
                        ) togetherWith (
                            slideOutHorizontally(
                                animationSpec = tween(250, easing = FastOutSlowInEasing),
                                targetOffsetX = { fullWidth -> fullWidth / 3 },
                            ) + fadeOut(animationSpec = tween(170))
                        )
                        else -> fadeIn(animationSpec = tween(200)) togetherWith fadeOut(animationSpec = tween(150))
                    }
                },
                label = "YouSettingsSubpageTransition",
                modifier = Modifier
                    .fillMaxSize()
                    .then(if (embeddedInBottomBar) Modifier else Modifier.navigationBarsPadding())
                    .imePadding(),
            ) { targetSubpage ->
                if (targetSubpage == null) {
                    YouHubRootScreen(
                        me = me,
                        state = state,
                        palette = palette,
                        pageCanvasSolidColor = pageCanvasSolidColor,
                        embeddedInBottomBar = embeddedInBottomBar,
                        systemNavBottomPadding = systemNavBottomPadding,
                        isSearching = isSearchingSettings,
                        searchQuery = settingsSearchQuery,
                        onToggleSearch = {
                            isSearchingSettings = !isSearchingSettings
                            if (!isSearchingSettings) settingsSearchQuery = ""
                        },
                        onSearchQueryChange = { settingsSearchQuery = it },
                        onOpenQrScanner = {
                            vm.clearDeviceLinkFeedback()
                            showQrScanner = true
                        },
                        onOpenCustomStatusDialog = { showCustomStatusDialog = true },
                        onSelectSubpage = { catId ->
                            isSearchingSettings = false
                            settingsSearchQuery = ""
                            openSubpage = catId
                        },
                        onCloseModal = if (!embeddedInBottomBar) onClose else null,
                    )
                } else {
                    val currentCat = targetSubpage
                    val subpageTitle = subpageTitles[currentCat] ?: "Settings"
                    val categoryScrollState = key(currentCat) { rememberScrollState() }
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .statusBarsPadding()
                    ) {
                        /* ==================== Subpage Navigation Bar (< You | Title | Action) ==================== */
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .jaBouncyClick { openSubpage = null }
                                    .padding(horizontal = 6.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                SettingsBackChevronSvgIcon(
                                    tint = tintedActionColor,
                                    modifier = Modifier.size(20.dp),
                                )
                                Spacer(Modifier.width(2.dp))
                                Text(
                                    text = "You",
                                    color = tintedActionColor,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }

                            Text(
                                text = subpageTitle,
                                color = if (currentCat == "owner") Color(0xFFEF4444) else palette.textPrimary,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = SfProDisplayFontFamily,
                                letterSpacing = (-0.3).sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f).padding(horizontal = 4.dp),
                            )

                            LiquidButton(
                                onClick = { vm.checkApkUpdate(manual = true) },
                                backdrop = settingsBackdrop,
                                isDark = palette.isDark,
                                height = 34.dp,
                                horizontalPadding = 12.dp,
                            ) {
                                Text(
                                    text = "Check updates",
                                    color = palette.textPrimary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }

                            if (!embeddedInBottomBar) {
                                LiquidIconButton(
                                    onClick = onClose,
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                    size = 34.dp,
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Close,
                                        contentDescription = "Close Settings",
                                        tint = palette.textPrimary,
                                        modifier = Modifier.size(17.dp),
                                    )
                                }
                            }
                        }

                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .verticalScroll(categoryScrollState)
                                .padding(horizontal = 16.dp, vertical = 8.dp)
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

                                /* ---- 1. Profile Hero Card (`LiquidGlassCard` + `2.5dp` `--profile-outline`) ---- */
                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                    cornerRadius = 24.dp,
                                    borderColor = colorSpec.ringColor,
                                    borderWidth = 2.dp,
                                    contentPadding = PaddingValues(0.dp),
                                    verticalArrangement = Arrangement.spacedBy(0.dp),
                                ) {
                                    Box(modifier = Modifier.fillMaxWidth()) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(122.dp)
                                                .background(
                                                    Brush.linearGradient(
                                                        listOf(
                                                            colorSpec.ringColor.copy(alpha = 0.48f),
                                                            palette.bgTertiary.copy(alpha = 0.72f),
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
                                            LiquidButton(
                                                onClick = { bannerPicker.launch("image/*") },
                                                backdrop = settingsBackdrop,
                                                isDark = true,
                                                height = 34.dp,
                                                horizontalPadding = 13.dp,
                                                modifier = Modifier
                                                    .align(Alignment.TopEnd)
                                                    .padding(10.dp),
                                            ) {
                                                Text(
                                                    text = "Upload banner",
                                                    color = Color.White,
                                                    fontSize = 11.5.sp,
                                                    fontWeight = FontWeight.Bold,
                                                )
                                            }
                                        }

                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(start = 16.dp, end = 16.dp, top = 76.dp),
                                            verticalAlignment = Alignment.Bottom,
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                        ) {
                                            Box(
                                                modifier = Modifier
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

                                            LiquidButton(
                                                onClick = { avatarPicker.launch("image/*") },
                                                backdrop = settingsBackdrop,
                                                isDark = palette.isDark,
                                                height = 36.dp,
                                                horizontalPadding = 14.dp,
                                            ) {
                                                Text(
                                                    text = "Change photo",
                                                    color = palette.textPrimary,
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Bold,
                                                )
                                            }
                                        }
                                    }

                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 18.dp, vertical = 14.dp),
                                        verticalArrangement = Arrangement.spacedBy(4.dp),
                                    ) {
                                        Text(
                                            text = displayName.ifBlank { username },
                                            color = palette.textPrimary,
                                            fontWeight = FontWeight.Black,
                                            fontSize = 19.sp,
                                        )
                                        Text(
                                            text = "@$username · Tap photo or banner to customise",
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

                                Spacer(Modifier.height(14.dp))

                                /* ---- 2. Online Status Liquid Glass Card ---- */
                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                ) {
                                    Text(
                                        text = "Online Status",
                                        color = palette.textPrimary,
                                        fontSize = 14.5.sp,
                                        fontWeight = FontWeight.Bold,
                                    )
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
                                            LiquidPillChip(
                                                selected = active,
                                                onClick = {
                                                    statusPref = id
                                                    vm.setPresenceStatus(id, customStatus)
                                                },
                                                backdrop = settingsBackdrop,
                                                isDark = palette.isDark,
                                                accentColor = dotCol,
                                            ) {
                                                Box(
                                                    modifier = Modifier
                                                        .size(9.dp)
                                                        .clip(CircleShape)
                                                        .background(if (active) Color.White else dotCol)
                                                )
                                                Spacer(Modifier.width(7.dp))
                                                Text(
                                                    text = lbl,
                                                    color = if (active) Color.White else palette.textPrimary,
                                                    fontSize = 12.5.sp,
                                                    fontWeight = FontWeight.Bold,
                                                )
                                            }
                                        }
                                    }
                                }

                                Spacer(Modifier.height(14.dp))

                                /* ---- 3. Identity & Name Box Bars (`LiquidTextFieldBar`) ---- */
                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                    verticalArrangement = Arrangement.spacedBy(13.dp),
                                ) {
                                    Text(
                                        text = "Profile Details",
                                        color = palette.textPrimary,
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                    )
                                    LiquidTextFieldBar(
                                        value = displayName,
                                        onValueChange = { displayName = it },
                                        backdrop = settingsBackdrop,
                                        label = "Display name",
                                        placeholder = "Your display name",
                                        isDark = palette.isDark,
                                        textColor = palette.textPrimary,
                                        subTextColor = palette.textSecondary,
                                        accentColor = tintedActionColor,
                                    )
                                    LiquidTextFieldBar(
                                        value = username,
                                        onValueChange = {
                                            username = it.lowercase().filter { ch ->
                                                ch.isLetterOrDigit() || ch == '.' || ch == '_' || ch == '-'
                                            }
                                        },
                                        backdrop = settingsBackdrop,
                                        label = "Username (14-day change cooldown)",
                                        leadingPrefix = "@",
                                        placeholder = "your-username",
                                        isDark = palette.isDark,
                                        textColor = palette.textPrimary,
                                        subTextColor = palette.textSecondary,
                                        accentColor = tintedActionColor,
                                    )
                                    LiquidTextFieldBar(
                                        value = customStatus,
                                        onValueChange = { customStatus = it.take(80) },
                                        backdrop = settingsBackdrop,
                                        label = "Custom status",
                                        placeholder = "What are you up to?",
                                        isDark = palette.isDark,
                                        textColor = palette.textPrimary,
                                        subTextColor = palette.textSecondary,
                                        accentColor = tintedActionColor,
                                    )
                                    LiquidTextFieldBar(
                                        value = pronouns,
                                        onValueChange = { pronouns = it.take(32) },
                                        backdrop = settingsBackdrop,
                                        label = "Pronouns",
                                        placeholder = "they/them, he/him, she/her...",
                                        isDark = palette.isDark,
                                        textColor = palette.textPrimary,
                                        subTextColor = palette.textSecondary,
                                        accentColor = tintedActionColor,
                                    )
                                    LiquidTextFieldBar(
                                        value = bio,
                                        onValueChange = { bio = it.take(190) },
                                        backdrop = settingsBackdrop,
                                        label = "Bio (${bio.length}/190 · Markdown supported)",
                                        placeholder = "Tell friends a little about yourself... (**bold**, *italic*, `code`)",
                                        singleLine = false,
                                        maxLines = 4,
                                        isDark = palette.isDark,
                                        textColor = palette.textPrimary,
                                        subTextColor = palette.textSecondary,
                                        accentColor = tintedActionColor,
                                    )
                                }

                                Spacer(Modifier.height(14.dp))

                                /* ---- 4. Avatar Colour & Profile Outline Card ---- */
                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                ) {
                                    Text(
                                        text = "Avatar colour & profile outline",
                                        color = palette.textPrimary,
                                        fontSize = 14.5.sp,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    FlowRow(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        AVATAR_COLOR_SPECS.forEach { spec ->
                                            val selected = avatarColor == spec.id
                                            LiquidPillChip(
                                                selected = selected,
                                                onClick = { avatarColor = spec.id },
                                                backdrop = settingsBackdrop,
                                                isDark = palette.isDark,
                                                accentColor = spec.ringColor,
                                                activeBorderColor = spec.ringColor,
                                                horizontalPadding = 11.dp,
                                                verticalPadding = 7.dp,
                                            ) {
                                                Box(
                                                    modifier = Modifier
                                                        .size(18.dp)
                                                        .clip(CircleShape)
                                                        .background(Brush.linearGradient(spec.gradientStops))
                                                        .border(1.5.dp, Color.White.copy(alpha = 0.85f), CircleShape)
                                                )
                                                Spacer(Modifier.width(7.dp))
                                                Text(
                                                    text = spec.name,
                                                    color = if (selected) Color.White else palette.textPrimary,
                                                    fontSize = 12.5.sp,
                                                    fontWeight = FontWeight.Bold,
                                                )
                                            }
                                        }
                                    }
                                }

                                Spacer(Modifier.height(18.dp))

                                /* ---- 5. Primary Tinted & Surface Liquid Buttons (Image 2 Top-Left) ---- */
                                LiquidButton(
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
                                    backdrop = settingsBackdrop,
                                    enabled = !saving,
                                    isDark = palette.isDark,
                                    tint = tintedActionColor,
                                    height = 52.dp,
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Check,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Text(
                                        text = if (saving) "Saving..." else "Save profile",
                                        color = Color.White,
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                    )
                                }

                                Spacer(Modifier.height(12.dp))

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    if (onOpenAccountSwitcher != null) {
                                        LiquidButton(
                                            onClick = onOpenAccountSwitcher,
                                            backdrop = settingsBackdrop,
                                            isDark = palette.isDark,
                                            height = 48.dp,
                                            modifier = Modifier.weight(1f),
                                        ) {
                                            Icon(
                                                imageVector = Icons.Rounded.Person,
                                                contentDescription = null,
                                                tint = palette.textPrimary,
                                                modifier = Modifier.size(17.dp),
                                            )
                                            Text(
                                                text = "Switch account",
                                                color = palette.textPrimary,
                                                fontSize = 13.5.sp,
                                                fontWeight = FontWeight.Bold,
                                            )
                                        }
                                    }

                                    LiquidButton(
                                        onClick = { vm.signOutCurrentAccount() },
                                        backdrop = settingsBackdrop,
                                        isDark = palette.isDark,
                                        tint = IOS_LIQUID_RED,
                                        height = 48.dp,
                                        modifier = Modifier.weight(1f),
                                    ) {
                                        Icon(
                                            imageVector = Icons.AutoMirrored.Rounded.Logout,
                                            contentDescription = null,
                                            tint = Color.White,
                                            modifier = Modifier.size(17.dp),
                                        )
                                        Text(
                                            text = "Sign out",
                                            color = Color.White,
                                            fontSize = 13.5.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }

                                Spacer(Modifier.height(14.dp))

                                /* ---- Blocked Users Section (Profile -> Blocked users) ---- */
                                var showBlockedList by remember { mutableStateOf(false) }
                                LaunchedEffect(showBlockedList) {
                                    if (showBlockedList) vm.refreshBlockedUsersList()
                                }
                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.Block,
                                            contentDescription = null,
                                            tint = palette.danger,
                                            modifier = Modifier.size(19.dp),
                                        )
                                        Text(
                                            text = com.ahad00010.jatext.data.jt("blocked.title"),
                                            color = palette.textPrimary,
                                            fontWeight = FontWeight.ExtraBold,
                                            fontSize = 16.sp,
                                        )
                                    }
                                    LiquidButton(
                                        onClick = {
                                            showBlockedList = !showBlockedList
                                            if (showBlockedList) vm.refreshBlockedUsersList()
                                        },
                                        backdrop = settingsBackdrop,
                                        isDark = palette.isDark,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Text(
                                            text = com.ahad00010.jatext.data.jt("blocked.cta"),
                                            color = palette.textPrimary,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                    if (showBlockedList) {
                                        if (state.blockedUsersList.isEmpty()) {
                                            Text(
                                                text = com.ahad00010.jatext.data.jt("blocked.empty"),
                                                color = palette.textSecondary,
                                                fontSize = 13.sp,
                                            )
                                        } else {
                                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                state.blockedUsersList.forEach { bu ->
                                                    Row(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .clip(RoundedCornerShape(14.dp))
                                                            .background(palette.bgTertiary)
                                                            .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                                            .padding(horizontal = 12.dp, vertical = 9.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                    ) {
                                                        JaAvatar(
                                                            avatarUrl = bu.avatarUrl,
                                                            displayName = bu.displayName.ifBlank { bu.username },
                                                            avatarColor = bu.avatarColor,
                                                            size = 36.dp,
                                                            ringWidth = 2.dp,
                                                        )
                                                        Spacer(Modifier.width(10.dp))
                                                        Column(modifier = Modifier.weight(1f)) {
                                                            Text(
                                                                text = bu.displayName.ifBlank { bu.username },
                                                                color = palette.textPrimary,
                                                                fontSize = 14.sp,
                                                                fontWeight = FontWeight.Bold,
                                                            )
                                                            Text(
                                                                text = "@${bu.username}",
                                                                color = palette.textSecondary,
                                                                fontSize = 12.sp,
                                                            )
                                                        }
                                                        LiquidButton(
                                                            onClick = { vm.unblockUserFromSettings(bu.id) },
                                                            backdrop = settingsBackdrop,
                                                            isDark = palette.isDark,
                                                            height = 34.dp,
                                                            horizontalPadding = 12.dp,
                                                        ) {
                                                            Text(
                                                                text = com.ahad00010.jatext.data.jt("blocked.unblock"),
                                                                color = palette.textPrimary,
                                                                fontSize = 12.5.sp,
                                                                fontWeight = FontWeight.Bold,
                                                            )
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            "appearance" -> {
                                AppearanceSettingsTab(
                                    state = state,
                                    vm = vm,
                                    backdrop = settingsBackdrop,
                                    onOpenCustomDrawer = { showCustomThemeDrawer = true },
                                )
                            }

                            "devices" -> {
                                LinkedDevicesSettingsSection(
                                    state = state,
                                    vm = vm,
                                    palette = palette,
                                    backdrop = settingsBackdrop,
                                    onOpenScanner = {
                                        vm.clearDeviceLinkFeedback()
                                        showQrScanner = true
                                    },
                                )
                            }

                            "socials" -> {
                                WebParitySocialsAndWebsiteSection(
                                    me = me,
                                    vm = vm,
                                    backdrop = settingsBackdrop,
                                )
                            }

                            "audio" -> {
                                var customNotifName by remember {
                                    mutableStateOf(vm.cache.getNotifSoundLabel().takeIf { vm.cache.getNotifSoundMode() == "custom" })
                                }
                                var customRingName by remember {
                                    mutableStateOf(vm.cache.getRingtoneLabel().takeIf { vm.cache.getRingtoneMode() == "custom" })
                                }
                                val soundPrefs = remember(context) {
                                    context.getSharedPreferences("jatext_audio_ui_prefs", Context.MODE_PRIVATE)
                                }
                                var inAppSoundsEnabled by remember {
                                    mutableStateOf(soundPrefs.getBoolean("in_app_sounds_enabled", true))
                                }
                                var alertVolumePct by remember {
                                    mutableFloatStateOf(soundPrefs.getFloat("alert_preview_volume_pct", 85f))
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

                                /* ---- iOS 26 Liquid Toggle & Slider Card ---- */
                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = "In-app alert tones",
                                                color = palette.textPrimary,
                                                fontSize = 15.sp,
                                                fontWeight = FontWeight.Bold,
                                            )
                                            Text(
                                                text = "Play crisp message & call alert cues while using JaText.",
                                                color = palette.textSecondary,
                                                fontSize = 12.sp,
                                            )
                                        }
                                        Spacer(Modifier.width(12.dp))
                                        LiquidToggle(
                                            selected = { inAppSoundsEnabled },
                                            onSelect = { next ->
                                                inAppSoundsEnabled = next
                                                soundPrefs.edit().putBoolean("in_app_sounds_enabled", next).apply()
                                            },
                                            backdrop = settingsBackdrop,
                                            isDark = palette.isDark,
                                            activeColor = IOS_LIQUID_GREEN,
                                        )
                                    }

                                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                        ) {
                                            Text(
                                                text = "Alert preview level",
                                                color = palette.textPrimary,
                                                fontSize = 13.5.sp,
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                            Text(
                                                text = "${alertVolumePct.roundToInt()}%",
                                                color = palette.textSecondary,
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.Bold,
                                            )
                                        }
                                        LiquidSlider(
                                            value = { alertVolumePct },
                                            onValueChange = { v ->
                                                alertVolumePct = v
                                                soundPrefs.edit().putFloat("alert_preview_volume_pct", v).apply()
                                            },
                                            valueRange = 10f..100f,
                                            backdrop = settingsBackdrop,
                                            isDark = palette.isDark,
                                            accentColor = tintedActionColor,
                                        )
                                    }
                                }

                                Spacer(Modifier.height(14.dp))

                                /* ---- Notification Sound Card ---- */
                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                ) {
                                    Text(
                                        text = "Notification Sound",
                                        color = palette.textPrimary,
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 16.sp,
                                    )
                                    SoundChoiceCard(
                                        title = "JaText (Default)",
                                        selected = customNotifName == null,
                                        backdrop = settingsBackdrop,
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
                                        SoundChoiceCard(
                                            title = customNotifName!!,
                                            selected = true,
                                            backdrop = settingsBackdrop,
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
                                    LiquidButton(
                                        onClick = { notifSoundLauncher.launch("audio/*") },
                                        backdrop = settingsBackdrop,
                                        isDark = palette.isDark,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(Icons.Rounded.MusicNote, null, tint = palette.accent, modifier = Modifier.size(18.dp))
                                        Text(
                                            text = "Add your custom notification sound",
                                            color = palette.textPrimary,
                                            fontSize = 13.5.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }

                                Spacer(Modifier.height(14.dp))

                                /* ---- Call Ringtone Card ---- */
                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                ) {
                                    Text(
                                        text = "Call Ringtone",
                                        color = palette.textPrimary,
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 16.sp,
                                    )
                                    SoundChoiceCard(
                                        title = "JaText (Default)",
                                        selected = customRingName == null,
                                        backdrop = settingsBackdrop,
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
                                        SoundChoiceCard(
                                            title = customRingName!!,
                                            selected = true,
                                            backdrop = settingsBackdrop,
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
                                    LiquidButton(
                                        onClick = { ringtoneSoundLauncher.launch("audio/*") },
                                        backdrop = settingsBackdrop,
                                        isDark = palette.isDark,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(Icons.Rounded.MusicNote, null, tint = palette.accent, modifier = Modifier.size(18.dp))
                                        Text(
                                            text = "Add your custom ringtone sound",
                                            color = palette.textPrimary,
                                            fontSize = 13.5.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }

                                Spacer(Modifier.height(14.dp))

                                /* ---- Custom Soundboards Card (<= 10 MB, <= 10s) ---- */
                                var newClipName by remember { mutableStateOf("") }
                                var uploadingClip by remember { mutableStateOf(false) }
                                LaunchedEffect(Unit) { vm.refreshSoundboards() }
                                val soundboardAudioLauncher = rememberLauncherForActivityResult(
                                    ActivityResultContracts.GetContent()
                                ) { uri ->
                                    if (uri != null) {
                                        val fallbackName = queryUriFileName(context, uri)
                                            ?.substringBeforeLast('.')
                                            ?.take(40)
                                            .orEmpty()
                                        val effectiveName = newClipName.trim().ifBlank { fallbackName.ifBlank { "Custom Clip" } }
                                        uploadingClip = true
                                        vm.createCustomSoundboardFromUri(
                                            name = effectiveName,
                                            audioUri = uri,
                                            onDone = {
                                                uploadingClip = false
                                                newClipName = ""
                                                vm.showToast("Soundboard clip saved!")
                                            },
                                            onError = { uploadingClip = false },
                                        )
                                    }
                                }

                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                ) {
                                    Text(
                                        text = com.ahad00010.jatext.data.jt("soundboard.title"),
                                        color = palette.textPrimary,
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 16.sp,
                                    )
                                    Text(
                                        text = com.ahad00010.jatext.data.jt("soundboard.desc"),
                                        color = palette.textSecondary,
                                        fontSize = 12.5.sp,
                                    )
                                    JaWebInput(
                                        value = newClipName,
                                        onValueChange = { newClipName = it.take(40) },
                                        label = "Clip name",
                                        placeholder = "Airhorn, Victory, Rimshot...",
                                    )
                                    LiquidButton(
                                        onClick = {
                                            if (!uploadingClip) soundboardAudioLauncher.launch("audio/*")
                                        },
                                        backdrop = settingsBackdrop,
                                        isDark = palette.isDark,
                                        tint = tintedActionColor,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(Icons.Rounded.Add, null, tint = Color.White, modifier = Modifier.size(18.dp))
                                        Text(
                                            text = if (uploadingClip) "Uploading..." else com.ahad00010.jatext.data.jt("soundboard.add"),
                                            color = Color.White,
                                            fontSize = 13.5.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                    if (state.soundboards.isNotEmpty()) {
                                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            state.soundboards.forEach { clip ->
                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .clip(RoundedCornerShape(14.dp))
                                                        .background(palette.bgTertiary)
                                                        .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                                        .padding(horizontal = 12.dp, vertical = 9.dp),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                ) {
                                                    Column(modifier = Modifier.weight(1f)) {
                                                        Text(
                                                            text = clip.name,
                                                            color = palette.textPrimary,
                                                            fontSize = 14.sp,
                                                            fontWeight = FontWeight.Bold,
                                                        )
                                                        Text(
                                                            text = "${(clip.durationMs / 1000f).let { String.format(java.util.Locale.US, "%.1fs", it) }} · ${(clip.byteSize / 1024).coerceAtLeast(1)} KB",
                                                            color = palette.textSecondary,
                                                            fontSize = 11.5.sp,
                                                        )
                                                    }
                                                    LiquidIconButton(
                                                        onClick = {
                                                            val raw = clip.audioUrl.trim()
                                                            val full = when {
                                                                raw.startsWith("http") -> raw
                                                                raw.startsWith("/") -> "https://jatext.vercel.app$raw"
                                                                else -> "https://jatext.vercel.app/api/media?id=$raw"
                                                            }
                                                            runCatching {
                                                                MediaPlayer().apply {
                                                                    setDataSource(full)
                                                                    setOnPreparedListener { it.start() }
                                                                    setOnCompletionListener { it.release() }
                                                                    setOnErrorListener { mp, _, _ -> mp.release(); true }
                                                                    prepareAsync()
                                                                }
                                                            }
                                                        },
                                                        backdrop = settingsBackdrop,
                                                        isDark = palette.isDark,
                                                        size = 34.dp,
                                                    ) {
                                                        Icon(Icons.Rounded.PlayArrow, "Preview", tint = palette.accent, modifier = Modifier.size(18.dp))
                                                    }
                                                    Spacer(Modifier.width(6.dp))
                                                    LiquidIconButton(
                                                        onClick = { vm.deleteCustomSoundboard(clip.id) },
                                                        backdrop = settingsBackdrop,
                                                        isDark = palette.isDark,
                                                        size = 34.dp,
                                                    ) {
                                                        Icon(Icons.Rounded.Delete, "Delete", tint = palette.danger, modifier = Modifier.size(17.dp))
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            "encryption" -> {
                                var copiedFp by remember { mutableStateOf(false) }
                                val activity = context as? Activity
                                LaunchedEffect(Unit) { vm.refreshSecuritySettings() }

                                /* ---- Time-Based 2FA (Authenticator App TOTP) ---- */
                                var setupSecret by remember { mutableStateOf<String?>(null) }
                                var setupOtpAuthUrl by remember { mutableStateOf<String?>(null) }
                                var totpInputCode by remember { mutableStateOf("") }
                                var disableCodeInput by remember { mutableStateOf("") }
                                var showDisablePrompt by remember { mutableStateOf(false) }
                                var backupCodesShown by remember { mutableStateOf<List<String>>(emptyList()) }
                                var totpBusy by remember { mutableStateOf(false) }

                                val qrBitmap = remember(setupOtpAuthUrl) {
                                    val url = setupOtpAuthUrl?.takeIf { it.isNotBlank() } ?: return@remember null
                                    runCatching {
                                        val matrix = com.google.zxing.qrcode.QRCodeWriter().encode(
                                            url,
                                            com.google.zxing.BarcodeFormat.QR_CODE,
                                            420,
                                            420,
                                        )
                                        val w = matrix.width
                                        val h = matrix.height
                                        val pixels = IntArray(w * h)
                                        for (y in 0 until h) {
                                            for (x in 0 until w) {
                                                pixels[y * w + x] = if (matrix.get(x, y)) {
                                                    android.graphics.Color.BLACK
                                                } else {
                                                    android.graphics.Color.WHITE
                                                }
                                            }
                                        }
                                        Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).apply {
                                            setPixels(pixels, 0, w, 0, 0, w, h)
                                        }
                                    }.getOrNull()
                                }

                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Rounded.Lock, null, tint = palette.accent, modifier = Modifier.size(20.dp))
                                        Spacer(Modifier.width(8.dp))
                                        Text(
                                            text = com.ahad00010.jatext.data.jt("twofa.title"),
                                            color = palette.textPrimary,
                                            fontSize = 17.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                        )
                                    }
                                    Text(
                                        text = "Protect your account with an authenticator app (Google Authenticator, Authy, 1Password, or Apple Passwords).",
                                        color = palette.textSecondary,
                                        fontSize = 12.5.sp,
                                        lineHeight = 18.sp,
                                    )

                                    if (state.securitySettings.totpEnabled) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(12.dp))
                                                .background(palette.accentSoft)
                                                .padding(horizontal = 12.dp, vertical = 9.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            Icon(Icons.Rounded.CheckCircle, null, tint = IOS_LIQUID_GREEN, modifier = Modifier.size(18.dp))
                                            Text(
                                                text = "2FA enabled · ${state.securitySettings.backupCodesRemaining} backup codes left",
                                                color = palette.textPrimary,
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.Bold,
                                            )
                                        }
                                        if (!showDisablePrompt) {
                                            LiquidButton(
                                                onClick = { showDisablePrompt = true },
                                                backdrop = settingsBackdrop,
                                                isDark = palette.isDark,
                                                tint = IOS_LIQUID_RED,
                                                modifier = Modifier.fillMaxWidth(),
                                            ) {
                                                Text(
                                                    text = com.ahad00010.jatext.data.jt("twofa.disable"),
                                                    color = Color.White,
                                                    fontSize = 13.5.sp,
                                                    fontWeight = FontWeight.Bold,
                                                )
                                            }
                                        } else {
                                            JaWebInput(
                                                value = disableCodeInput,
                                                onValueChange = { disableCodeInput = it },
                                                label = "Enter current 6-digit code to disable",
                                                placeholder = "000000",
                                            )
                                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                LiquidButton(
                                                    onClick = { showDisablePrompt = false; disableCodeInput = "" },
                                                    backdrop = settingsBackdrop,
                                                    isDark = palette.isDark,
                                                    modifier = Modifier.weight(1f),
                                                ) {
                                                    Text("Cancel", color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                                }
                                                LiquidButton(
                                                    onClick = {
                                                        if (disableCodeInput.trim().length >= 6 && !totpBusy) {
                                                            totpBusy = true
                                                            scope.launch {
                                                                try {
                                                                    vm.disableTotp(disableCodeInput)
                                                                    showDisablePrompt = false
                                                                    disableCodeInput = ""
                                                                    vm.showToast("2FA disabled")
                                                                } catch (e: Throwable) {
                                                                    vm.showToast(e.message ?: "Invalid code")
                                                                } finally {
                                                                    totpBusy = false
                                                                }
                                                            }
                                                        }
                                                    },
                                                    backdrop = settingsBackdrop,
                                                    isDark = palette.isDark,
                                                    tint = IOS_LIQUID_RED,
                                                    modifier = Modifier.weight(1f),
                                                ) {
                                                    Text("Confirm disable", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        }
                                    } else if (setupSecret == null) {
                                        LiquidButton(
                                            onClick = {
                                                if (!totpBusy) {
                                                    totpBusy = true
                                                    scope.launch {
                                                        try {
                                                            val res = vm.beginTotpSetup()
                                                            setupSecret = res.secret
                                                            setupOtpAuthUrl = res.otpauthUrl
                                                        } catch (e: Throwable) {
                                                            vm.showToast(e.message ?: "Failed to start 2FA setup")
                                                        } finally {
                                                            totpBusy = false
                                                        }
                                                    }
                                                }
                                            },
                                            backdrop = settingsBackdrop,
                                            isDark = palette.isDark,
                                            tint = tintedActionColor,
                                            modifier = Modifier.fillMaxWidth(),
                                        ) {
                                            Text(
                                                text = com.ahad00010.jatext.data.jt("twofa.setup"),
                                                color = Color.White,
                                                fontSize = 13.5.sp,
                                                fontWeight = FontWeight.Bold,
                                            )
                                        }
                                    } else {
                                        if (qrBitmap != null) {
                                            Box(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(vertical = 4.dp),
                                                contentAlignment = Alignment.Center,
                                            ) {
                                                Image(
                                                    bitmap = qrBitmap.asImageBitmap(),
                                                    contentDescription = "2FA QR Code",
                                                    modifier = Modifier
                                                        .size(190.dp)
                                                        .clip(RoundedCornerShape(16.dp))
                                                        .background(Color.White)
                                                        .padding(8.dp),
                                                )
                                            }
                                        }
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(12.dp))
                                                .background(palette.bgTertiary)
                                                .border(1.dp, palette.border, RoundedCornerShape(12.dp))
                                                .clickable {
                                                    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                                                    cm?.setPrimaryClip(ClipData.newPlainText("2FA Secret", setupSecret.orEmpty()))
                                                    vm.showToast("Copied manual secret key")
                                                }
                                                .padding(horizontal = 12.dp, vertical = 9.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text("Setup key (tap to copy)", color = palette.textSecondary, fontSize = 11.sp)
                                                Text(
                                                    text = setupSecret.orEmpty(),
                                                    color = palette.textPrimary,
                                                    fontSize = 13.sp,
                                                    fontFamily = FontFamily.Monospace,
                                                    fontWeight = FontWeight.Bold,
                                                )
                                            }
                                        }
                                        JaWebInput(
                                            value = totpInputCode,
                                            onValueChange = { totpInputCode = it },
                                            label = "Enter 6-digit code from your app",
                                            placeholder = "000000",
                                        )
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            LiquidButton(
                                                onClick = {
                                                    setupSecret = null
                                                    setupOtpAuthUrl = null
                                                    totpInputCode = ""
                                                },
                                                backdrop = settingsBackdrop,
                                                isDark = palette.isDark,
                                                modifier = Modifier.weight(1f),
                                            ) {
                                                Text("Cancel", color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                            }
                                            LiquidButton(
                                                onClick = {
                                                    if (totpInputCode.trim().length >= 6 && !totpBusy) {
                                                        totpBusy = true
                                                        scope.launch {
                                                            try {
                                                                val confirmed = vm.confirmTotpSetup(totpInputCode)
                                                                backupCodesShown = confirmed.backupCodes
                                                                setupSecret = null
                                                                setupOtpAuthUrl = null
                                                                totpInputCode = ""
                                                                vm.showToast("2FA enabled!")
                                                            } catch (e: Throwable) {
                                                                vm.showToast(e.message ?: "Invalid code")
                                                            } finally {
                                                                totpBusy = false
                                                            }
                                                        }
                                                    }
                                                },
                                                backdrop = settingsBackdrop,
                                                isDark = palette.isDark,
                                                tint = tintedActionColor,
                                                modifier = Modifier.weight(1f),
                                            ) {
                                                Text("Verify & enable", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                            }
                                        }
                                    }

                                    if (backupCodesShown.isNotEmpty()) {
                                        Column(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(12.dp))
                                                .background(palette.bgTertiary)
                                                .border(1.dp, palette.border, RoundedCornerShape(12.dp))
                                                .padding(12.dp),
                                            verticalArrangement = Arrangement.spacedBy(4.dp),
                                        ) {
                                            Text(
                                                text = "Save these recovery backup codes:",
                                                color = palette.textPrimary,
                                                fontSize = 12.5.sp,
                                                fontWeight = FontWeight.Bold,
                                            )
                                            Text(
                                                text = backupCodesShown.joinToString("   "),
                                                color = palette.accent,
                                                fontSize = 12.5.sp,
                                                fontFamily = FontFamily.Monospace,
                                            )
                                        }
                                    }
                                }

                                Spacer(Modifier.height(14.dp))

                                /* ---- Passkeys (Credential Manager WebAuthn) ---- */
                                var passkeyLabel by remember { mutableStateOf("") }
                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Rounded.Key, null, tint = palette.accent, modifier = Modifier.size(20.dp))
                                        Spacer(Modifier.width(8.dp))
                                        Text(
                                            text = com.ahad00010.jatext.data.jt("passkeys.title"),
                                            color = palette.textPrimary,
                                            fontSize = 17.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                        )
                                    }
                                    Text(
                                        text = "Sign in faster and phishing-free using your fingerprint, face unlock, or Google Password Manager.",
                                        color = palette.textSecondary,
                                        fontSize = 12.5.sp,
                                        lineHeight = 18.sp,
                                    )
                                    JaWebInput(
                                        value = passkeyLabel,
                                        onValueChange = { passkeyLabel = it.take(36) },
                                        label = "Passkey label (optional)",
                                        placeholder = "My Android Phone",
                                    )
                                    LiquidButton(
                                        onClick = {
                                            if (activity != null) {
                                                vm.registerPasskey(
                                                    activity = activity,
                                                    label = passkeyLabel.ifBlank { "Android Passkey" },
                                                    onDone = { passkeyLabel = "" },
                                                )
                                            }
                                        },
                                        backdrop = settingsBackdrop,
                                        isDark = palette.isDark,
                                        tint = tintedActionColor,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Icon(Icons.Rounded.Add, null, tint = Color.White, modifier = Modifier.size(18.dp))
                                        Text(
                                            text = com.ahad00010.jatext.data.jt("passkeys.add"),
                                            color = Color.White,
                                            fontSize = 13.5.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                    if (state.securitySettings.passkeys.isNotEmpty()) {
                                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            state.securitySettings.passkeys.forEach { pk ->
                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .clip(RoundedCornerShape(14.dp))
                                                        .background(palette.bgTertiary)
                                                        .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                                        .padding(horizontal = 12.dp, vertical = 9.dp),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                ) {
                                                    Icon(Icons.Rounded.Key, null, tint = palette.accent, modifier = Modifier.size(18.dp))
                                                    Spacer(Modifier.width(10.dp))
                                                    Column(modifier = Modifier.weight(1f)) {
                                                        Text(pk.label, color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                                        Text("Passkey active", color = palette.textSecondary, fontSize = 11.5.sp)
                                                    }
                                                    LiquidIconButton(
                                                        onClick = { vm.deletePasskey(pk.credentialId) },
                                                        backdrop = settingsBackdrop,
                                                        isDark = palette.isDark,
                                                        size = 34.dp,
                                                    ) {
                                                        Icon(Icons.Rounded.Delete, "Delete passkey", tint = palette.danger, modifier = Modifier.size(17.dp))
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                Spacer(Modifier.height(14.dp))

                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        WebUiSvgIcon(
                                            kind = WebUiIconKind.ShieldCheck,
                                            tint = palette.accent,
                                            size = 20.dp,
                                        )
                                        Spacer(Modifier.width(8.dp))
                                        Text(
                                            text = "End-to-End Encryption",
                                            color = palette.textPrimary,
                                            fontSize = 17.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                        )
                                    }
                                    Text(
                                        text = "Messages, voice notes, photos, videos, and group keys are encrypted locally on your device using NIST P-256 ECDH + AES-256-GCM before leaving your phone.",
                                        color = palette.textSecondary,
                                        fontSize = 13.sp,
                                        lineHeight = 18.5.sp,
                                    )
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(16.dp))
                                            .background(
                                                if (palette.isDark) Color.Black.copy(alpha = 0.28f)
                                                else Color.Black.copy(alpha = 0.05f)
                                            )
                                            .padding(12.dp)
                                    ) {
                                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                            Text(
                                                text = "Active Account Identity Key",
                                                color = palette.textPrimary,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp,
                                            )
                                            Text(
                                                text = "Key ID: ${state.myKeyId}",
                                                color = palette.textSecondary,
                                                fontSize = 12.sp,
                                                fontFamily = FontFamily.Monospace,
                                            )
                                            Text(
                                                text = "Fingerprint: ${state.myKeyFingerprint}",
                                                color = palette.textPrimary,
                                                fontSize = 12.5.sp,
                                                fontFamily = FontFamily.Monospace,
                                            )
                                        }
                                    }
                                    if (state.myKeyFingerprint.isNotBlank()) {
                                        LiquidButton(
                                            onClick = {
                                                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                                                cm?.setPrimaryClip(
                                                    ClipData.newPlainText(
                                                        "JaText Security Key",
                                                        "JaText E2EE Key (@${me.username} · ${state.myKeyId})\nFingerprint: ${state.myKeyFingerprint}",
                                                    )
                                                )
                                                copiedFp = true
                                                scope.launch {
                                                    delay(1800)
                                                    copiedFp = false
                                                }
                                            },
                                            backdrop = settingsBackdrop,
                                            isDark = palette.isDark,
                                            tint = if (copiedFp) IOS_LIQUID_GREEN else Color.Unspecified,
                                            modifier = Modifier.fillMaxWidth(),
                                        ) {
                                            Text(
                                                text = if (copiedFp) "Copied security key" else "Copy security key",
                                                color = if (copiedFp) Color.White else palette.textPrimary,
                                                fontSize = 13.5.sp,
                                                fontWeight = FontWeight.Bold,
                                            )
                                        }
                                    }
                                }

                                Spacer(Modifier.height(14.dp))

                                LiquidGlassCard(
                                    backdrop = settingsBackdrop,
                                    isDark = palette.isDark,
                                ) {
                                    Text(
                                        text = "App Version & Updates",
                                        color = palette.textPrimary,
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 15.5.sp,
                                    )
                                    Text(
                                        text = "Installed release: JaText v${BuildConfig.VERSION_NAME} (Build ${BuildConfig.VERSION_CODE}). JaText checks for updates automatically on launch, or you can check manually below.",
                                        color = palette.textSecondary,
                                        fontSize = 12.5.sp,
                                        lineHeight = 18.sp,
                                    )
                                    LiquidButton(
                                        onClick = { vm.checkApkUpdate(manual = true) },
                                        backdrop = settingsBackdrop,
                                        isDark = palette.isDark,
                                        tint = tintedActionColor,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Text(
                                            text = "Check for App Updates",
                                            color = Color.White,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }
                            }

                            "legal" -> {
                                WebParityLegalPoliciesSection(
                                    palette = palette,
                                    backdrop = settingsBackdrop,
                                    onOpenFullDocument = { tab -> legalDialogTab = tab },
                                )
                            }

                            "owner" -> {
                                if (isOwnerAccount) {
                                    OwnerSettingsMobileSection(
                                        me = me,
                                        vm = vm,
                                        palette = palette,
                                        backdrop = settingsBackdrop,
                                    )
                                }
                            }
                        }

                        Spacer(
                            Modifier.height(
                                if (embeddedInBottomBar) systemNavBottomPadding + 132.dp
                                else 36.dp
                            )
                        )
                        }
                    }
                }
            }

            /* ==================== Full iOS 26 Liquid Glass `CustomThemeDrawer` Overlay ==================== */
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

            if (showQrScanner) {
                QrScannerModal(
                    onDismiss = { showQrScanner = false },
                    onQrScanned = { rawCode ->
                        showQrScanner = false
                        openSubpage = "devices"
                        vm.handleScannedDeviceQrCode(rawCode)
                    },
                )
            }

            if (showCustomStatusDialog) {
                CustomStatusBubbleEditDialog(
                    me = me,
                    palette = palette,
                    onDismiss = { showCustomStatusDialog = false },
                    onSaveStatus = { newCustomStatus ->
                        val currentPref = me.statusPreference.orEmpty().ifBlank { "online" }
                        vm.setPresenceStatus(currentPref, newCustomStatus)
                        showCustomStatusDialog = false
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
}

/* ==================== 1:1 "You" Hub Screen (Settings Roadmap.png) ==================== */

private data class YouSettingsMenuEntry(
    val id: String,
    val label: String,
    val subtitleHint: String,
    val keywords: String,
    val labelColor: Color? = null,
    val icon: @Composable (Color) -> Unit,
)

private fun isJaTextPlatformOwner(user: JaUser): Boolean {
    return user.isOwner ||
        user.email.orEmpty().trim().equals("aidilzafri2013@gmail.com", ignoreCase = true) ||
        user.username.trim().removePrefix("@").equals("imzachie", ignoreCase = true)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun YouHubRootScreen(
    me: JaUser,
    state: SessionUiState,
    palette: JaTextPalette,
    pageCanvasSolidColor: Color,
    embeddedInBottomBar: Boolean,
    systemNavBottomPadding: androidx.compose.ui.unit.Dp,
    isSearching: Boolean,
    searchQuery: String,
    onToggleSearch: () -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onOpenQrScanner: () -> Unit,
    onOpenCustomStatusDialog: () -> Unit,
    onSelectSubpage: (String) -> Unit,
    onCloseModal: (() -> Unit)? = null,
) {
    val rootScroll = rememberScrollState()
    val searchFocusRequester = remember { FocusRequester() }
    LaunchedEffect(isSearching) {
        if (isSearching) {
            delay(80)
            runCatching { searchFocusRequester.requestFocus() }
        }
    }

    val cleanAvatarColorId = remember(me.avatarColor) {
        JaTextThemeManager.stripProfileMetaFromColorId(me.avatarColor)
    }
    val avatarColorSpec = remember(cleanAvatarColorId) {
        JaTextThemeManager.avatarColorSpec(cleanAvatarColorId)
    }
    val avatarTopOutlineColor = avatarColorSpec.ringColor

    val resolvedBannerUrl = remember(me.bannerUrl) {
        me.bannerUrl?.takeIf { it.isNotBlank() }?.let { TursoApiClient.resolveAbsoluteMediaUrl(it) }
    }

    val cardBgColor = when {
        palette.rootGradientBrush != null ->
            if (palette.isDark) palette.surface.copy(alpha = 0.84f) else Color.White.copy(alpha = 0.90f)
        palette.isDark -> palette.surface
        else -> Color.White
    }
    val cardBorderColor = if (palette.isDark) {
        palette.border.copy(alpha = 0.68f)
    } else {
        palette.border.copy(alpha = 0.42f)
    }
    val floatingPillBg = if (palette.isDark) {
        palette.surface.copy(alpha = 0.88f)
    } else {
        Color.White.copy(alpha = 0.92f)
    }

    val statusTopInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val bannerHeight = statusTopInset + 132.dp
    val avatarSize = 108.dp
    val avatarHalf = 54.dp

    val topCardEntry = remember {
        YouSettingsMenuEntry(
            id = "devices",
            label = "Linked devices",
            subtitleHint = "Link & manage Desktop Web sessions",
            keywords = "linked devices desktop web qr code browser computer session",
            icon = { tint -> SettingsLinkedDevicesSvgIcon(tint = tint, modifier = Modifier.size(22.dp)) },
        )
    }

    val mainCardEntries = remember {
        listOf(
            YouSettingsMenuEntry(
                id = "profile",
                label = "Account",
                subtitleHint = "Profile, avatar, banner, bio & blocked users",
                keywords = "account profile avatar banner username display name pronouns bio switch account sign out logout blocked users",
                icon = { tint -> SettingsAccountKeySvgIcon(tint = tint, modifier = Modifier.size(22.dp)) },
            ),
            YouSettingsMenuEntry(
                id = "encryption",
                label = "Privacy",
                subtitleHint = "2FA, Passkeys & end-to-end encryption",
                keywords = "privacy security encryption e2ee 2fa totp authenticator passkey biometric lock fingerprint keys",
                icon = { tint -> SettingsPrivacyLockSvgIcon(tint = tint, modifier = Modifier.size(22.dp)) },
            ),
            YouSettingsMenuEntry(
                id = "appearance",
                label = "Chats",
                subtitleHint = "Themes, wallpapers, chat bubbles & language",
                keywords = "chats appearance theme dark light oled onyx custom wallpaper bubble font language translation",
                icon = { tint -> SettingsChatsBubbleSvgIcon(tint = tint, modifier = Modifier.size(22.dp)) },
            ),
            YouSettingsMenuEntry(
                id = "audio",
                label = "Notifications",
                subtitleHint = "Alerts, ringtones, sounds & soundboards",
                keywords = "notifications alerts audio sound ringtone push vibration soundboard status activity",
                icon = { tint -> SettingsNotificationsBadgeSvgIcon(tint = tint, modifier = Modifier.size(22.dp)) },
            ),
            YouSettingsMenuEntry(
                id = "socials",
                label = "Socials",
                subtitleHint = "Social links & personal website",
                keywords = "socials links website discord github instagram youtube x twitter tiktok",
                icon = { tint -> SettingsSocialsLinksSvgIcon(tint = tint, modifier = Modifier.size(22.dp)) },
            ),
            YouSettingsMenuEntry(
                id = "legal",
                label = "Legal",
                subtitleHint = "Terms of Service, Privacy Policy & app version",
                keywords = "legal terms of service privacy policy rules version updates",
                icon = { tint -> SettingsLegalDocSvgIcon(tint = tint, modifier = Modifier.size(22.dp)) },
            ),
        )
    }

    val isOwnerAccount = remember(me.id, me.email, me.username, me.isOwner) {
        isJaTextPlatformOwner(me)
    }

    val ownerCardEntry = remember(isOwnerAccount) {
        if (!isOwnerAccount) null
        else YouSettingsMenuEntry(
            id = "owner",
            label = "Owner Settings",
            subtitleHint = "Platform administration, accounts & dangerous actions",
            keywords = "owner admin console delete account change username ban suspend revoke broadcast moderation",
            labelColor = Color(0xFFEF4444),
            icon = { tint ->
                SettingsPrivacyLockSvgIcon(
                    tint = tint,
                    modifier = Modifier.size(21.dp),
                )
            },
        )
    }

    val trimmedQuery = searchQuery.trim()
    val filteredEntries = remember(trimmedQuery, ownerCardEntry) {
        if (trimmedQuery.isBlank()) {
            emptyList()
        } else {
            val q = trimmedQuery.lowercase(Locale.ROOT)
            val allEntries = buildList {
                add(topCardEntry)
                addAll(mainCardEntries)
                if (ownerCardEntry != null) add(ownerCardEntry)
            }
            allEntries.filter { entry ->
                entry.label.lowercase(Locale.ROOT).contains(q) ||
                    entry.subtitleHint.lowercase(Locale.ROOT).contains(q) ||
                    entry.keywords.contains(q)
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rootScroll),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        /* ---------- 1. Hero Banner + Top-Only Avatar Colour Outline + Search & QR Shortcuts ---------- */
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(bannerHeight + avatarHalf),
        ) {
            // Banner preview across the top
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(bannerHeight)
                    .background(
                        Brush.linearGradient(
                            colors = if (palette.isDark) {
                                listOf(
                                    avatarTopOutlineColor.copy(alpha = 0.24f),
                                    palette.bgTertiary,
                                )
                            } else {
                                listOf(
                                    Color(0xFFECEEF4),
                                    avatarTopOutlineColor.copy(alpha = 0.14f),
                                )
                            }
                        )
                    )
                    .clickable { onSelectSubpage("profile") },
            ) {
                if (resolvedBannerUrl.isNullOrBlank()) {
                    // Subtle ambient decorative pattern when user has not uploaded a custom banner yet
                    Canvas(modifier = Modifier.fillMaxSize()) {
                        if (size.width <= 0f || size.height <= 0f) return@Canvas
                        val patternTint = if (palette.isDark) {
                            Color.White.copy(alpha = 0.055f)
                        } else {
                            Color.Black.copy(alpha = 0.045f)
                        }
                        val stroke = Stroke(width = 1.4.dp.toPx())
                        drawCircle(
                            color = patternTint,
                            radius = size.minDimension * 0.42f,
                            center = Offset(size.width * 0.18f, size.height * 0.35f),
                            style = stroke,
                        )
                        drawCircle(
                            color = patternTint,
                            radius = size.minDimension * 0.52f,
                            center = Offset(size.width * 0.84f, size.height * 0.28f),
                            style = stroke,
                        )
                        drawCircle(
                            color = patternTint,
                            radius = size.minDimension * 0.30f,
                            center = Offset(size.width * 0.52f, size.height * 0.18f),
                            style = stroke,
                        )
                    }
                } else {
                    AsyncImage(
                        model = resolvedBannerUrl,
                        contentDescription = "Profile banner",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }

            // Centered circular avatar overlapping banner bottom edge
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .size(avatarSize + 6.dp)
                    .clip(CircleShape)
                    .background(pageCanvasSolidColor)
                    .jaBouncyClick { onSelectSubpage("profile") },
                contentAlignment = Alignment.Center,
            ) {
                JaAvatar(
                    avatarUrl = me.avatarUrl,
                    displayName = me.displayName.ifBlank { me.username },
                    avatarColor = me.avatarColor,
                    size = avatarSize,
                    ringWidth = 0.dp,
                )
            }

            // Avatar colour outline ONLY AT TOP + horizontal banner split stroke (1:1 Settings Roadmap.png)
            Canvas(modifier = Modifier.matchParentSize()) {
                if (size.width <= 0f || size.height <= 0f) return@Canvas
                val splitY = bannerHeight.toPx()
                val cx = size.width / 2f
                val arcRadius = (avatarSize.toPx() / 2f) + 2.2.dp.toPx()
                val sw = 2.6.dp.toPx()

                val topOutlinePath = Path().apply {
                    moveTo(0f, splitY)
                    lineTo((cx - arcRadius).coerceAtLeast(0f), splitY)
                    arcTo(
                        rect = Rect(
                            left = cx - arcRadius,
                            top = splitY - arcRadius,
                            right = cx + arcRadius,
                            bottom = splitY + arcRadius,
                        ),
                        startAngleDegrees = 180f,
                        sweepAngleDegrees = 180f,
                        forceMoveTo = false,
                    )
                    lineTo(size.width, splitY)
                }
                drawPath(
                    path = topOutlinePath,
                    color = avatarTopOutlineColor,
                    style = Stroke(width = sw, cap = StrokeCap.Round),
                )
            }

            // Floating custom status thought-bubble on top of the account when set
            androidx.compose.animation.AnimatedVisibility(
                visible = !me.customStatus.isNullOrBlank(),
                enter = scaleIn(
                    animationSpec = spring(
                        dampingRatio = 0.68f,
                        stiffness = Spring.StiffnessMediumLow,
                    )
                ) + fadeIn(tween(180)),
                exit = scaleOut(tween(140)) + fadeOut(tween(120)),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = avatarSize - 12.dp, start = 64.dp),
            ) {
                Column(
                    horizontalAlignment = Alignment.Start,
                    modifier = Modifier.jaBouncyClick { onOpenCustomStatusDialog() },
                ) {
                    Box(
                        modifier = Modifier
                            .widthIn(min = 48.dp, max = 196.dp)
                            .shadow(6.dp, RoundedCornerShape(16.dp))
                            .clip(RoundedCornerShape(16.dp))
                            .background(cardBgColor)
                            .border(1.dp, cardBorderColor, RoundedCornerShape(16.dp))
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    ) {
                        Text(
                            text = me.customStatus.orEmpty(),
                            color = palette.textPrimary,
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            lineHeight = 15.5.sp,
                        )
                    }
                    Row(
                        modifier = Modifier.padding(start = 10.dp, top = 2.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(7.5.dp)
                                .shadow(2.dp, CircleShape)
                                .clip(CircleShape)
                                .background(cardBgColor)
                                .border(0.8.dp, cardBorderColor, CircleShape)
                        )
                    }
                    Box(
                        modifier = Modifier
                            .padding(start = 5.dp, top = 1.5.dp)
                            .size(4.5.dp)
                            .clip(CircleShape)
                            .background(cardBgColor)
                            .border(0.8.dp, cardBorderColor, CircleShape)
                    )
                }
            }

            // Top-left Search settings & Top-right Scan QR Code circular buttons
            Row(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .shadow(4.dp, CircleShape)
                        .clip(CircleShape)
                        .background(floatingPillBg)
                        .border(1.dp, cardBorderColor, CircleShape)
                        .jaBouncyClick { onToggleSearch() },
                    contentAlignment = Alignment.Center,
                ) {
                    SettingsSearchSvgIcon(
                        tint = palette.textPrimary,
                        modifier = Modifier.size(18.5.dp),
                    )
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .shadow(4.dp, CircleShape)
                            .clip(CircleShape)
                            .background(floatingPillBg)
                            .border(1.dp, cardBorderColor, CircleShape)
                            .jaBouncyClick { onOpenQrScanner() },
                        contentAlignment = Alignment.Center,
                    ) {
                        SettingsQrCodeSvgIcon(
                            tint = palette.textPrimary,
                            modifier = Modifier.size(18.5.dp),
                        )
                    }

                    if (onCloseModal != null) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .shadow(4.dp, CircleShape)
                                .clip(CircleShape)
                                .background(floatingPillBg)
                                .border(1.dp, cardBorderColor, CircleShape)
                                .jaBouncyClick { onCloseModal() },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = "Close",
                                tint = palette.textPrimary,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }
            }
        }

        /* ---------- 2. Display Name + Green (+) Custom Status Button ---------- */
        Spacer(Modifier.height(10.dp))

        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .jaBouncyClick { onOpenCustomStatusDialog() }
                .padding(horizontal = 16.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Text(
                text = me.displayName.ifBlank { me.username },
                color = palette.textPrimary,
                fontSize = 23.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = SfProDisplayFontFamily,
                letterSpacing = (-0.3).sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.width(6.dp))
            SettingsAddStatusPlusIcon(
                modifier = Modifier.size(20.dp),
                tint = Color(0xFF25D366),
            )
        }

        /* ---------- 3. Animated Live Settings Search Bar ---------- */
        AnimatedVisibility(
            visible = isSearching,
            enter = expandVertically(tween(220, easing = FastOutSlowInEasing)) + fadeIn(tween(180)),
            exit = shrinkVertically(tween(190, easing = FastOutSlowInEasing)) + fadeOut(tween(140)),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(cardBgColor)
                    .border(1.dp, cardBorderColor, RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                SettingsSearchSvgIcon(
                    tint = palette.textSecondary,
                    modifier = Modifier.size(17.dp),
                )
                Box(modifier = Modifier.weight(1f)) {
                    if (searchQuery.isEmpty()) {
                        Text(
                            text = "Search settings...",
                            color = palette.textTertiary,
                            fontSize = 15.sp,
                        )
                    }
                    BasicTextField(
                        value = searchQuery,
                        onValueChange = onSearchQueryChange,
                        singleLine = true,
                        cursorBrush = SolidColor(palette.accent),
                        textStyle = TextStyle(
                            color = palette.textPrimary,
                            fontSize = 15.sp,
                            fontFamily = SfProTextFontFamily,
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(searchFocusRequester),
                    )
                }
                if (searchQuery.isNotEmpty()) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "Clear search",
                        tint = palette.textSecondary,
                        modifier = Modifier
                            .size(18.dp)
                            .clickable { onSearchQueryChange("") },
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        /* ---------- 4. "Settings" Header + 1:1 Grouped Cards ---------- */
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
        ) {
            Text(
                text = "Settings",
                color = palette.textSecondary,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 6.dp, bottom = 7.dp),
            )

            if (trimmedQuery.isNotBlank()) {
                YouSettingsCard(
                    cardBgColor = cardBgColor,
                    cardBorderColor = cardBorderColor,
                ) {
                    if (filteredEntries.isEmpty()) {
                        Text(
                            text = "No matching settings found.",
                            color = palette.textSecondary,
                            fontSize = 14.sp,
                            modifier = Modifier.padding(horizontal = 18.dp, vertical = 18.dp),
                        )
                    } else {
                        filteredEntries.forEachIndexed { idx, entry ->
                            YouSettingsRowItem(
                                entry = entry,
                                palette = palette,
                                showSubtitle = true,
                                trailingBadge = if (entry.id == "devices" && state.linkedDevices.isNotEmpty()) {
                                    "${state.linkedDevices.size}"
                                } else null,
                                onClick = { onSelectSubpage(entry.id) },
                            )
                            if (idx < filteredEntries.lastIndex) {
                                YouSettingsInsetDivider(palette = palette)
                            }
                        }
                    }
                }
            } else {
                // Top Card: ONLY "Linked devices" (1:1 Settings Roadmap.png)
                YouSettingsCard(
                    cardBgColor = cardBgColor,
                    cardBorderColor = cardBorderColor,
                ) {
                    YouSettingsRowItem(
                        entry = topCardEntry,
                        palette = palette,
                        showSubtitle = false,
                        trailingBadge = if (state.linkedDevices.isNotEmpty()) {
                            "${state.linkedDevices.size}"
                        } else null,
                        onClick = { onSelectSubpage(topCardEntry.id) },
                    )
                }

                Spacer(Modifier.height(14.dp))

                // Second Card: Account, Privacy, Chats, Notifications, Socials, Legal
                YouSettingsCard(
                    cardBgColor = cardBgColor,
                    cardBorderColor = cardBorderColor,
                ) {
                    mainCardEntries.forEachIndexed { idx, entry ->
                        YouSettingsRowItem(
                            entry = entry,
                            palette = palette,
                            showSubtitle = false,
                            trailingBadge = null,
                            onClick = { onSelectSubpage(entry.id) },
                        )
                        if (idx < mainCardEntries.lastIndex) {
                            YouSettingsInsetDivider(palette = palette)
                        }
                    }
                }

                if (ownerCardEntry != null) {
                    Spacer(Modifier.height(14.dp))
                    YouSettingsCard(
                        cardBgColor = cardBgColor,
                        cardBorderColor = Color(0xFFEF4444).copy(alpha = if (palette.isDark) 0.42f else 0.30f),
                    ) {
                        YouSettingsRowItem(
                            entry = ownerCardEntry,
                            palette = palette,
                            showSubtitle = false,
                            trailingBadge = null,
                            onClick = { onSelectSubpage(ownerCardEntry.id) },
                        )
                    }
                }
            }
        }

        Spacer(
            Modifier.height(
                if (embeddedInBottomBar) systemNavBottomPadding + 132.dp
                else 40.dp
            )
        )
    }
}

@Composable
private fun YouSettingsCard(
    cardBgColor: Color,
    cardBorderColor: Color,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(cardBgColor)
            .border(0.8.dp, cardBorderColor, shape),
    ) {
        content()
    }
}

@Composable
private fun YouSettingsRowItem(
    entry: YouSettingsMenuEntry,
    palette: JaTextPalette,
    showSubtitle: Boolean,
    trailingBadge: String?,
    onClick: () -> Unit,
) {
    val resolvedRowColor = entry.labelColor ?: palette.textPrimary
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 14.5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(26.dp),
            contentAlignment = Alignment.Center,
        ) {
            entry.icon(resolvedRowColor)
        }
        Spacer(Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = entry.label,
                color = resolvedRowColor,
                fontSize = 16.sp,
                fontWeight = if (entry.labelColor != null) FontWeight.Bold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (showSubtitle) {
                Text(
                    text = entry.subtitleHint,
                    color = palette.textSecondary,
                    fontSize = 12.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (!trailingBadge.isNullOrBlank()) {
            Text(
                text = trailingBadge,
                color = palette.textSecondary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(end = 6.dp),
            )
        }
        SettingsChevronRightSvgIcon(
            tint = palette.textTertiary,
            modifier = Modifier.size(16.dp),
        )
    }
}

@Composable
private fun YouSettingsInsetDivider(palette: JaTextPalette) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 56.dp)
            .height(0.65.dp)
            .background(
                if (palette.isDark) palette.border.copy(alpha = 0.55f)
                else palette.border.copy(alpha = 0.48f)
            )
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CustomStatusBubbleEditDialog(
    me: JaUser,
    palette: JaTextPalette,
    onDismiss: () -> Unit,
    onSaveStatus: (String) -> Unit,
) {
    var draft by remember(me.customStatus) { mutableStateOf(me.customStatus.orEmpty()) }
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        delay(80)
        runCatching { focusRequester.requestFocus() }
    }

    val cardBg = if (palette.isDark) palette.surfaceElevated else Color.White
    val presets = remember {
        listOf("Available", "Busy", "Studying", "At work", "In a call", "Gaming")
    }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(24.dp))
                .background(cardBg)
                .border(1.dp, palette.border, RoundedCornerShape(24.dp))
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "Custom status",
                    color = palette.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = SfProDisplayFontFamily,
                )
                Icon(
                    imageVector = Icons.Rounded.Close,
                    contentDescription = "Close",
                    tint = palette.textSecondary,
                    modifier = Modifier
                        .size(20.dp)
                        .clickable { onDismiss() },
                )
            }

            Text(
                text = "Appears as a status bubble above your avatar.",
                color = palette.textSecondary,
                fontSize = 13.sp,
            )

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (palette.isDark) palette.bgSecondary else palette.bgSecondary)
                    .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                if (draft.isEmpty()) {
                    Text(
                        text = "What's on your mind?",
                        color = palette.textTertiary,
                        fontSize = 15.sp,
                    )
                }
                BasicTextField(
                    value = draft,
                    onValueChange = { if (it.length <= 80) draft = it },
                    singleLine = true,
                    cursorBrush = SolidColor(palette.accent),
                    textStyle = TextStyle(
                        color = palette.textPrimary,
                        fontSize = 15.sp,
                        fontFamily = SfProTextFontFamily,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(focusRequester),
                )
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                presets.forEach { preset ->
                    val active = draft.trim().equals(preset, ignoreCase = true)
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(
                                if (active) palette.accent.copy(alpha = 0.18f)
                                else palette.bgSecondary
                            )
                            .border(
                                1.dp,
                                if (active) palette.accent else palette.border,
                                RoundedCornerShape(999.dp),
                            )
                            .clickable { draft = preset }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    ) {
                        Text(
                            text = preset,
                            color = if (active) palette.accent else palette.textSecondary,
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (!me.customStatus.isNullOrBlank() || draft.isNotBlank()) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(palette.danger.copy(alpha = 0.12f))
                            .clickable { onSaveStatus("") }
                            .padding(horizontal = 14.dp, vertical = 11.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "Clear",
                            color = palette.danger,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
                Spacer(Modifier.weight(1f))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF25D366))
                        .jaBouncyClick { onSaveStatus(draft.trim()) }
                        .padding(horizontal = 20.dp, vertical = 11.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "Save",
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

/* ==================== 1:1 Web Socials & Website Section (iOS 26 Liquid Glass) ==================== */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WebParitySocialsAndWebsiteSection(
    me: JaUser,
    vm: JaTextSessionViewModel,
    backdrop: Backdrop,
) {
    val palette = LocalJaTextPalette.current
    val scope = rememberCoroutineScope()
    val tintedActionColor = if (palette.isDark) palette.accent else IOS_LIQUID_BLUE

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

    LiquidGlassCard(
        backdrop = backdrop,
        isDark = palette.isDark,
    ) {
        Text(
            text = "Socials",
            color = palette.textPrimary,
            fontSize = 17.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        Text(
            text = "Connect your Discord, YouTube, X, and other social accounts. Anyone viewing your profile picture can tap your connected socials.",
            color = palette.textSecondary,
            fontSize = 13.sp,
            lineHeight = 18.5.sp,
        )

        if (socials.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                socials.forEachIndexed { idx, soc ->
                    val meta = getSocialPlatformMeta(soc.platform)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(
                                if (palette.isDark) Color.White.copy(alpha = 0.06f)
                                else Color.Black.copy(alpha = 0.04f)
                            )
                            .border(1.dp, meta.brandTint.copy(alpha = 0.44f), RoundedCornerShape(16.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(meta.brandTint.copy(alpha = 0.16f)),
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
                        LiquidIconButton(
                            onClick = { socials.removeAt(idx) },
                            backdrop = backdrop,
                            isDark = palette.isDark,
                            size = 32.dp,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = "Disconnect ${meta.label}",
                                tint = palette.textPrimary,
                                modifier = Modifier.size(15.dp),
                            )
                        }
                    }
                }
            }
        }

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            SOCIAL_PLATFORM_SPECS.forEach { plat ->
                val active = selectedPlatform == plat.id
                LiquidPillChip(
                    selected = active,
                    onClick = { selectedPlatform = plat.id },
                    backdrop = backdrop,
                    isDark = palette.isDark,
                    accentColor = plat.brandTint,
                    activeBorderColor = plat.brandTint,
                    horizontalPadding = 11.dp,
                    verticalPadding = 7.dp,
                ) {
                    SocialBrandVectorIcon(
                        platformId = plat.id,
                        size = 14.dp,
                        tint = if (active) {
                            Color.White
                        } else if (!palette.isDark && plat.id in listOf("github", "x", "tiktok", "threads")) {
                            Color(0xFF111827)
                        } else {
                            plat.brandTint
                        },
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = plat.label,
                        color = if (active) Color.White else palette.textPrimary,
                        fontSize = 12.sp,
                        fontWeight = if (active) FontWeight.ExtraBold else FontWeight.SemiBold,
                    )
                }
            }
        }

        if (selectedPlatform == "other") {
            LiquidTextFieldBar(
                value = customPlatformName,
                onValueChange = { customPlatformName = it.take(32) },
                backdrop = backdrop,
                label = "Platform name",
                placeholder = "e.g. SoundCloud, Behance",
                isDark = palette.isDark,
                textColor = palette.textPrimary,
                subTextColor = palette.textSecondary,
                accentColor = tintedActionColor,
            )
        }

        val activeSpec = SOCIAL_PLATFORM_SPECS.firstOrNull { it.id == selectedPlatform } ?: SOCIAL_PLATFORM_SPECS.first()
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            LiquidTextFieldBar(
                value = socialInput,
                onValueChange = { socialInput = it.take(260) },
                backdrop = backdrop,
                placeholder = activeSpec.placeholder,
                isDark = palette.isDark,
                textColor = palette.textPrimary,
                subTextColor = palette.textSecondary,
                accentColor = activeSpec.brandTint,
                leadingSlot = {
                    SocialBrandVectorIcon(
                        platformId = activeSpec.id,
                        size = 16.dp,
                        tint = if (!palette.isDark && activeSpec.id in listOf("github", "x", "tiktok", "threads")) {
                            Color(0xFF111827)
                        } else {
                            activeSpec.brandTint
                        },
                    )
                },
                modifier = Modifier.weight(1f),
            )
            LiquidButton(
                onClick = { handleAddSocial() },
                backdrop = backdrop,
                enabled = socialInput.trim().isNotEmpty(),
                isDark = palette.isDark,
                tint = tintedActionColor,
                height = 48.dp,
                horizontalPadding = 16.dp,
            ) {
                Icon(Icons.Rounded.Add, null, tint = Color.White, modifier = Modifier.size(17.dp))
                Text("Connect", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }
    }

    Spacer(Modifier.height(14.dp))

    LiquidGlassCard(
        backdrop = backdrop,
        isDark = palette.isDark,
    ) {
        Text(
            text = "Website",
            color = palette.textPrimary,
            fontSize = 17.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        Text(
            text = "Add a website title and URL. It appears right underneath your socials on your profile card.",
            color = palette.textSecondary,
            fontSize = 13.sp,
            lineHeight = 18.5.sp,
        )
        LiquidTextFieldBar(
            value = websiteTitle,
            onValueChange = { websiteTitle = it.take(60) },
            backdrop = backdrop,
            label = "Title",
            placeholder = "e.g. Portfolio, My Channel, Blog",
            isDark = palette.isDark,
            textColor = palette.textPrimary,
            subTextColor = palette.textSecondary,
            accentColor = tintedActionColor,
        )
        LiquidTextFieldBar(
            value = websiteUrl,
            onValueChange = { websiteUrl = it.take(300) },
            backdrop = backdrop,
            label = "URL",
            placeholder = "https://example.com",
            isDark = palette.isDark,
            textColor = palette.textPrimary,
            subTextColor = palette.textSecondary,
            accentColor = tintedActionColor,
            leadingSlot = {
                WebsiteGlobeVectorIcon(size = 16.dp, tint = palette.textSecondary)
            },
        )
        if (websiteTitle.isNotBlank() || websiteUrl.isNotBlank()) {
            LiquidButton(
                onClick = {
                    websiteTitle = ""
                    websiteUrl = ""
                },
                backdrop = backdrop,
                isDark = palette.isDark,
                height = 42.dp,
            ) {
                Text("Clear website", color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }
    }

    if (!errorMsg.isNullOrBlank()) {
        Spacer(Modifier.height(12.dp))
        LiquidGlassCard(
            backdrop = backdrop,
            isDark = palette.isDark,
            borderColor = IOS_LIQUID_RED.copy(alpha = 0.65f),
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
        ) {
            Text(errorMsg!!, color = IOS_LIQUID_RED, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
    }

    Spacer(Modifier.height(18.dp))
    LiquidButton(
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
                    return@LiquidButton
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
        backdrop = backdrop,
        enabled = !saving,
        isDark = palette.isDark,
        tint = tintedActionColor,
        height = 52.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Icon(Icons.Rounded.Check, null, tint = Color.White, modifier = Modifier.size(18.dp))
        Text(
            text = if (saving) "Saving..." else "Save Socials & Website",
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.ExtraBold,
        )
    }
}

/* ==================== Legal Policies & Privacy Section (iOS 26 Liquid Glass) ==================== */

@Composable
private fun WebParityLegalPoliciesSection(
    palette: JaTextPalette,
    backdrop: Backdrop,
    onOpenFullDocument: (String) -> Unit,
) {
    var inlineTab by remember { mutableStateOf("terms") }
    val tintedActionColor = if (palette.isDark) palette.accent else IOS_LIQUID_BLUE

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        LiquidButton(
            onClick = { onOpenFullDocument("terms") },
            backdrop = backdrop,
            isDark = palette.isDark,
            height = 46.dp,
            modifier = Modifier.weight(1f),
        ) {
            Icon(Icons.Rounded.Description, null, tint = palette.accent, modifier = Modifier.size(17.dp))
            Text(
                text = "Terms",
                color = palette.textPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
            )
            Icon(Icons.Rounded.OpenInNew, null, tint = palette.textSecondary, modifier = Modifier.size(14.dp))
        }
        LiquidButton(
            onClick = { onOpenFullDocument("privacy") },
            backdrop = backdrop,
            isDark = palette.isDark,
            height = 46.dp,
            modifier = Modifier.weight(1f),
        ) {
            Icon(Icons.Rounded.Lock, null, tint = palette.accent, modifier = Modifier.size(17.dp))
            Text(
                text = "Privacy",
                color = palette.textPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
            )
            Icon(Icons.Rounded.OpenInNew, null, tint = palette.textSecondary, modifier = Modifier.size(14.dp))
        }
    }

    Spacer(Modifier.height(14.dp))

    LiquidGlassCard(
        backdrop = backdrop,
        isDark = palette.isDark,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            LiquidPillChip(
                selected = inlineTab == "terms",
                onClick = { inlineTab = "terms" },
                backdrop = backdrop,
                isDark = palette.isDark,
                accentColor = tintedActionColor,
                modifier = Modifier.weight(1f),
            ) {
                Icon(
                    Icons.Rounded.Description,
                    null,
                    tint = if (inlineTab == "terms") Color.White else palette.textSecondary,
                    modifier = Modifier.size(15.dp),
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = "Terms of Service",
                    color = if (inlineTab == "terms") Color.White else palette.textPrimary,
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            LiquidPillChip(
                selected = inlineTab == "privacy",
                onClick = { inlineTab = "privacy" },
                backdrop = backdrop,
                isDark = palette.isDark,
                accentColor = tintedActionColor,
                modifier = Modifier.weight(1f),
            ) {
                Icon(
                    Icons.Rounded.Lock,
                    null,
                    tint = if (inlineTab == "privacy") Color.White else palette.textSecondary,
                    modifier = Modifier.size(15.dp),
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = "Privacy Policy",
                    color = if (inlineTab == "privacy") Color.White else palette.textPrimary,
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

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

        LiquidButton(
            onClick = { onOpenFullDocument(inlineTab) },
            backdrop = backdrop,
            isDark = palette.isDark,
            tint = tintedActionColor,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = if (inlineTab == "terms") "Read full Terms of Service" else "Read full Privacy Policy",
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

/* ==================== Appearance Tab + iOS 26 Liquid Glass Optics Card (`image-24.png`) ==================== */

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun AppearanceSettingsTab(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    backdrop: Backdrop,
    onOpenCustomDrawer: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val cfg = state.themeConfig
    val optics = LocalLiquidGlassOptics.current
    val tintedActionColor = if (palette.isDark) palette.accent else IOS_LIQUID_BLUE

    /* ---- 1. Sync Across Devices Card with iOS 26 Green `LiquidToggle` (`image-24.png` Top-Center) ---- */
    LiquidGlassCard(
        backdrop = backdrop,
        isDark = palette.isDark,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Sync across devices",
                    color = palette.textPrimary,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 15.sp,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "Automatically sync your selected theme across Android and web.",
                    color = palette.textSecondary,
                    fontSize = 12.5.sp,
                )
            }
            Spacer(Modifier.width(12.dp))
            LiquidToggle(
                selected = { cfg.syncAcrossDevices },
                onSelect = { checked ->
                    vm.updateThemeConfig(cfg.copy(syncAcrossDevices = checked), pushRemoteIfSynced = checked)
                },
                backdrop = backdrop,
                isDark = palette.isDark,
                activeColor = IOS_LIQUID_GREEN,
            )
        }
    }

    Spacer(Modifier.height(14.dp))

    /* ---- 2. Default Themes + Customise Theme Studio Card ---- */
    LiquidGlassCard(
        backdrop = backdrop,
        isDark = palette.isDark,
    ) {
        Text("Default Themes", color = palette.textPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 15.5.sp)
        Text(
            text = "Pick a crisp default mode, choose any gradient colour theme, or build your own custom theme.",
            color = palette.textSecondary,
            fontSize = 12.5.sp,
            lineHeight = 18.sp,
        )

        val defaultSwatches = listOf(
            Triple("light", "Light", Color(0xFFFFFFFF)),
            Triple("ash", "Ash", Color(0xFF323339)),
            Triple("dark", "Dark", Color(0xFF1D1D21)),
            Triple("onyx", "Onyx", Color(0xFF000000)),
            Triple("system", "System", Color(0xFF1F2937)),
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
                        Text(label, color = palette.textSecondary, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }

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
                Text("Customise", color = palette.textSecondary, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            }
        }

        LiquidButton(
            onClick = {
                vm.updateThemeConfig(cfg.copy(kind = "custom"), pushRemoteIfSynced = false)
                onOpenCustomDrawer()
            },
            backdrop = backdrop,
            isDark = palette.isDark,
            tint = tintedActionColor,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Rounded.Palette, null, tint = Color.White, modifier = Modifier.size(18.dp))
            Text(
                text = "Open Customise Theme Studio",
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold,
            )
        }
    }

    Spacer(Modifier.height(14.dp))

    /* ---- 3. Colour Themes Preset Grid Card ---- */
    LiquidGlassCard(
        backdrop = backdrop,
        isDark = palette.isDark,
    ) {
        Text("Colour Themes", color = palette.textPrimary, fontWeight = FontWeight.ExtraBold, fontSize = 15.5.sp)

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

    Spacer(Modifier.height(14.dp))

    /* ---- 4. Languages Card (Liquid Glass Optics removed per user request!) ---- */
    LiquidGlassCard(
        backdrop = backdrop,
        isDark = palette.isDark,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Rounded.Language,
                contentDescription = null,
                tint = palette.accent,
                modifier = Modifier.size(20.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = com.ahad00010.jatext.data.jt("appearance.languages"),
                    color = palette.textPrimary,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 15.5.sp,
                )
                Text(
                    text = com.ahad00010.jatext.data.jt("appearance.languagesDesc"),
                    color = palette.textSecondary,
                    fontSize = 12.sp,
                )
            }
        }
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            com.ahad00010.jatext.data.JATEXT_LANGUAGE_OPTIONS.forEach { langOpt ->
                val selected = state.languageCode == langOpt.code
                LiquidPillChip(
                    selected = selected,
                    onClick = { vm.setAppLanguage(langOpt.code) },
                    backdrop = backdrop,
                    isDark = palette.isDark,
                    accentColor = tintedActionColor,
                    horizontalPadding = 12.dp,
                    verticalPadding = 8.dp,
                ) {
                    Text(
                        text = "${langOpt.nativeLabel} (${langOpt.englishLabel})",
                        color = if (selected) Color.White else palette.textPrimary,
                        fontSize = 12.5.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    )
                }
            }
        }
    }
}

/**
 * Full iOS 26 Liquid Glass Customise Theme Studio (`CustomThemeDrawer.tsx` parity).
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
    val studioBackdrop = remember { emptyBackdrop() }
    val tintedActionColor = if (palette.isDark) palette.accent else IOS_LIQUID_BLUE

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

    Box(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .then(
                    if (palette.rootGradientBrush != null) Modifier.background(palette.rootGradientBrush)
                    else Modifier.background(palette.bgPrimary)
                )
        ) {
            LiquidAmbientMeshBackdrop(
                accentColor = activeStopColor,
                secondaryColor = pureHueColor,
                isDark = palette.isDark,
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            /* ---- Header ---- */
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.Palette, null, tint = palette.accent, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "Customise Theme",
                        color = palette.textPrimary,
                        fontSize = 21.sp,
                        fontWeight = FontWeight.Black,
                        fontFamily = com.ahad00010.jatext.ui.theme.SfProDisplayFontFamily,
                    )
                }
                LiquidIconButton(
                    onClick = onCloseAll,
                    backdrop = studioBackdrop,
                    isDark = palette.isDark,
                    size = 38.dp,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "Close theme customiser",
                        tint = palette.textPrimary,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }

            /* ---- Scrollable Studio Body ---- */
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // 1. Appearance (`Dark` | `Light`)
                LiquidGlassCard(
                    backdrop = studioBackdrop,
                    isDark = palette.isDark,
                ) {
                    Text(
                        text = "APPEARANCE",
                        color = palette.textSecondary,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 0.6.sp,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        listOf(
                            Triple("dark", "Dark", Icons.Rounded.DarkMode),
                            Triple("light", "Light", Icons.Rounded.LightMode),
                        ).forEach { (id, lbl, icon) ->
                            val active = appearance == id
                            LiquidPillChip(
                                selected = active,
                                onClick = {
                                    appearance = id
                                    pushDraft(commitRemote = true)
                                },
                                backdrop = studioBackdrop,
                                isDark = palette.isDark,
                                accentColor = tintedActionColor,
                                modifier = Modifier.weight(1f),
                                verticalPadding = 10.dp,
                            ) {
                                Icon(
                                    imageVector = icon,
                                    contentDescription = lbl,
                                    tint = if (active) Color.White else palette.textSecondary,
                                    modifier = Modifier.size(16.dp),
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = lbl,
                                    color = if (active) Color.White else palette.textPrimary,
                                    fontSize = 13.5.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }
                }

                // 2. Colours Card
                LiquidGlassCard(
                    backdrop = studioBackdrop,
                    isDark = palette.isDark,
                ) {
                    Text(
                        text = "COLOURS",
                        color = palette.textSecondary,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 0.6.sp,
                    )

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

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(176.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .border(1.dp, palette.borderStrong, RoundedCornerShape(18.dp))
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

                    // Rainbow Hue LiquidSlider (`0..360°`)
                    LiquidSlider(
                        value = { hue },
                        onValueChange = { nextHue ->
                            hue = nextHue
                            syncActiveStopFromHsv(commitRemote = false)
                        },
                        valueRange = 0f..360f,
                        backdrop = studioBackdrop,
                        isDark = palette.isDark,
                        accentColor = pureHueColor,
                        isRainbowHue = true,
                        onValueChangeFinished = { syncActiveStopFromHsv(commitRemote = true) },
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        LiquidTextFieldBar(
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
                            backdrop = studioBackdrop,
                            monospace = true,
                            isDark = palette.isDark,
                            textColor = palette.textPrimary,
                            subTextColor = palette.textSecondary,
                            accentColor = activeStopColor,
                            leadingSlot = {
                                Box(
                                    modifier = Modifier
                                        .size(22.dp)
                                        .clip(CircleShape)
                                        .background(activeStopColor)
                                        .border(1.5.dp, Color.White.copy(alpha = 0.85f), CircleShape)
                                )
                            },
                            modifier = Modifier.weight(1f),
                        )

                        LiquidIconButton(
                            onClick = {
                                if (stops.size > 1) {
                                    stops.removeAt(selectedStopIdx.coerceIn(0, stops.lastIndex))
                                    selectStop((selectedStopIdx - 1).coerceAtLeast(0))
                                    pushDraft(commitRemote = true)
                                }
                            },
                            backdrop = studioBackdrop,
                            isDark = palette.isDark,
                            size = 44.dp,
                        ) {
                            Icon(Icons.Rounded.Remove, contentDescription = "Remove colour stop", tint = palette.textPrimary)
                        }
                    }

                    if (stops.size < 5) {
                        LiquidButton(
                            onClick = {
                                val newHue = (hue + 48f) % 360f
                                val rgb = android.graphics.Color.HSVToColor(floatArrayOf(newHue, 0.55f, 0.92f))
                                stops.add("#%06x".format(0xFFFFFF and rgb))
                                selectStop(stops.lastIndex)
                                pushDraft(commitRemote = true)
                            },
                            backdrop = studioBackdrop,
                            isDark = palette.isDark,
                            height = 44.dp,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Rounded.Add, null, tint = palette.textPrimary, modifier = Modifier.size(17.dp))
                            Text("Add Colour", color = palette.textPrimary, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                // 3. Controls Card (`Gradient Direction` & `Colour Intensity` via `LiquidSlider`)
                LiquidGlassCard(
                    backdrop = studioBackdrop,
                    isDark = palette.isDark,
                ) {
                    Text(
                        text = "CONTROLS",
                        color = palette.textSecondary,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 0.6.sp,
                    )

                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Gradient Direction", color = palette.textPrimary, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                            Text("${angle.toInt()}°", color = palette.textPrimary, fontSize = 13.5.sp, fontWeight = FontWeight.ExtraBold)
                        }
                        LiquidSlider(
                            value = { angle },
                            onValueChange = {
                                angle = it
                                pushDraft(commitRemote = false)
                            },
                            valueRange = 0f..360f,
                            backdrop = studioBackdrop,
                            isDark = palette.isDark,
                            accentColor = tintedActionColor,
                            onValueChangeFinished = { pushDraft(commitRemote = true) },
                        )
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("Colour Intensity", color = palette.textPrimary, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                            Text("${intensity.toInt()}%", color = palette.textPrimary, fontSize = 13.5.sp, fontWeight = FontWeight.ExtraBold)
                        }
                        LiquidSlider(
                            value = { intensity },
                            onValueChange = {
                                intensity = it
                                pushDraft(commitRemote = false)
                            },
                            valueRange = 10f..100f,
                            backdrop = studioBackdrop,
                            isDark = palette.isDark,
                            accentColor = tintedActionColor,
                            onValueChangeFinished = { pushDraft(commitRemote = true) },
                        )
                    }
                }
            }

            /* ---- Footer (`Shuffle` + `Apply Theme` + `Back to Settings`) ---- */
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    LiquidButton(
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
                        backdrop = studioBackdrop,
                        isDark = palette.isDark,
                        height = 48.dp,
                    ) {
                        Icon(Icons.Rounded.Shuffle, null, tint = palette.textPrimary, modifier = Modifier.size(17.dp))
                        Text("Shuffle", color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                    LiquidButton(
                        onClick = {
                            pushDraft(commitRemote = true)
                            appliedToast = true
                        },
                        backdrop = studioBackdrop,
                        isDark = palette.isDark,
                        tint = if (appliedToast) IOS_LIQUID_GREEN else tintedActionColor,
                        height = 48.dp,
                        modifier = Modifier.weight(1f),
                    ) {
                        if (appliedToast) {
                            Icon(Icons.Rounded.Check, null, tint = Color.White, modifier = Modifier.size(18.dp))
                        }
                        Text(
                            text = if (appliedToast) "Applied" else "Apply Theme",
                            color = Color.White,
                            fontSize = 14.5.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                }

                LiquidButton(
                    onClick = onBackToSettings,
                    backdrop = studioBackdrop,
                    isDark = palette.isDark,
                    height = 46.dp,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Back to Settings", color = palette.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun SoundChoiceCard(
    title: String,
    selected: Boolean,
    backdrop: Backdrop,
    onSelect: () -> Unit,
    onPreview: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(
                if (selected) palette.accentSoft
                else if (palette.isDark) Color.White.copy(alpha = 0.06f)
                else Color.Black.copy(alpha = 0.04f)
            )
            .border(1.dp, if (selected) palette.accent else palette.border, RoundedCornerShape(16.dp))
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
        LiquidIconButton(
            onClick = onPreview,
            backdrop = backdrop,
            isDark = palette.isDark,
            size = 34.dp,
            tint = palette.accent,
        ) {
            Icon(Icons.Rounded.PlayArrow, contentDescription = "Test sound", tint = palette.accent, modifier = Modifier.size(18.dp))
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

/* ==================== 3rd Tab: QR Linked Devices (iOS 26 Liquid Glass) ==================== */

@Composable
private fun LinkedDevicesSettingsSection(
    state: SessionUiState,
    vm: JaTextSessionViewModel,
    palette: JaTextPalette,
    backdrop: Backdrop,
    onOpenScanner: () -> Unit,
) {
    LaunchedEffect(state.slotId) {
        vm.refreshLinkedDevices()
    }

    val connectedCount = state.linkedDevices.size
    val maxDevices = state.maxLinkedDevices
    val limitReached = connectedCount >= maxDevices
    val isSyncing = state.deviceLinkPhase == "syncing"
    val tintedActionColor = if (palette.isDark) palette.accent else IOS_LIQUID_BLUE

    LiquidGlassCard(
        backdrop = backdrop,
        isDark = palette.isDark,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Link your devices",
                    color = palette.textPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Open jatext.vercel.app/chats on your computer and scan the QR code to use JaText on Web.",
                    color = palette.textSecondary,
                    fontSize = 13.sp,
                    lineHeight = 18.5.sp,
                )
            }
            Spacer(Modifier.width(10.dp))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(
                        if (limitReached) palette.warning.copy(alpha = 0.18f)
                        else palette.accentSoft
                    )
                    .border(
                        1.dp,
                        if (limitReached) palette.warning.copy(alpha = 0.50f)
                        else palette.accent.copy(alpha = 0.40f),
                        RoundedCornerShape(999.dp),
                    )
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(
                    text = "$connectedCount / $maxDevices",
                    color = if (limitReached) palette.warning else palette.accent,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        LiquidButton(
            onClick = onOpenScanner,
            backdrop = backdrop,
            enabled = !limitReached && !isSyncing,
            isDark = palette.isDark,
            tint = tintedActionColor,
            height = 50.dp,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(
                imageVector = Icons.Rounded.QrCodeScanner,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(19.dp),
            )
            Text(
                text = "Scan with QR code",
                color = Color.White,
                fontSize = 14.5.sp,
                fontWeight = FontWeight.ExtraBold,
            )
        }

        if (limitReached) {
            Text(
                text = "Maximum of $maxDevices devices connected. Disconnect at least one device below in order to link a new one.",
                color = palette.warning,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                lineHeight = 17.5.sp,
            )
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Rounded.Lock,
                    contentDescription = null,
                    tint = palette.success,
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = "Your messages and attachments stay end-to-end encrypted across linked devices.",
                    color = palette.textSecondary,
                    fontSize = 12.sp,
                    lineHeight = 16.5.sp,
                )
            }
        }
    }

    when (state.deviceLinkPhase) {
        "syncing" -> {
            Spacer(Modifier.height(14.dp))
            LiquidGlassCard(
                backdrop = backdrop,
                isDark = palette.isDark,
                borderColor = palette.accent.copy(alpha = 0.50f),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = palette.accent,
                        strokeWidth = 2.5.dp,
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Syncing to ${state.deviceLinkBrowserName.ifBlank { "Chrome" }} JaText...",
                            color = palette.textPrimary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = "Syncing end-to-end encrypted keys, messages, and attachments.",
                            color = palette.textSecondary,
                            fontSize = 12.sp,
                        )
                    }
                }
            }
        }

        "success" -> {
            Spacer(Modifier.height(14.dp))
            LiquidGlassCard(
                backdrop = backdrop,
                isDark = palette.isDark,
                borderColor = palette.success.copy(alpha = 0.55f),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Rounded.CheckCircle,
                        contentDescription = null,
                        tint = palette.success,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = "Successfully linked the device!",
                        color = palette.textPrimary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                    )
                    LiquidIconButton(
                        onClick = { vm.clearDeviceLinkFeedback() },
                        backdrop = backdrop,
                        isDark = palette.isDark,
                        size = 30.dp,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Close,
                            contentDescription = "Dismiss",
                            tint = palette.textSecondary,
                            modifier = Modifier.size(15.dp),
                        )
                    }
                }
            }
        }

        "error" -> {
            if (!state.deviceLinkError.isNullOrBlank()) {
                Spacer(Modifier.height(14.dp))
                LiquidGlassCard(
                    backdrop = backdrop,
                    isDark = palette.isDark,
                    borderColor = IOS_LIQUID_RED.copy(alpha = 0.55f),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = state.deviceLinkError,
                            color = IOS_LIQUID_RED,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.weight(1f),
                        )
                        LiquidIconButton(
                            onClick = { vm.clearDeviceLinkFeedback() },
                            backdrop = backdrop,
                            isDark = palette.isDark,
                            size = 30.dp,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = "Dismiss",
                                tint = IOS_LIQUID_RED,
                                modifier = Modifier.size(15.dp),
                            )
                        }
                    }
                }
            }
        }
    }

    Spacer(Modifier.height(18.dp))

    Text(
        text = "Connected Devices ($connectedCount/$maxDevices)",
        color = palette.textPrimary,
        fontSize = 15.sp,
        fontWeight = FontWeight.ExtraBold,
        modifier = Modifier.padding(start = 4.dp),
    )
    Spacer(Modifier.height(10.dp))

    if (state.linkedDevices.isEmpty()) {
        LiquidGlassCard(
            backdrop = backdrop,
            isDark = palette.isDark,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Computer,
                    contentDescription = null,
                    tint = palette.textTertiary,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "No linked devices yet",
                    color = palette.textPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Tap Scan with QR code above to link Chrome, Edge, Firefox, or any desktop browser.",
                    color = palette.textSecondary,
                    fontSize = 12.5.sp,
                )
            }
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (dev in state.linkedDevices) {
                ConnectedDeviceRowCard(
                    device = dev,
                    isDisconnecting = state.disconnectingDeviceId == dev.id,
                    palette = palette,
                    backdrop = backdrop,
                    onDisconnect = { vm.disconnectLinkedDevice(dev.id) },
                )
            }
        }
    }
}

@Composable
private fun ConnectedDeviceRowCard(
    device: LinkedWebDevice,
    isDisconnecting: Boolean,
    palette: JaTextPalette,
    backdrop: Backdrop,
    onDisconnect: () -> Unit,
) {
    val activitySubtitle = remember(device.lastActiveAt, device.osName) {
        val now = System.currentTimeMillis()
        val diff = now - device.lastActiveAt
        val timeText = when {
            device.lastActiveAt <= 0L -> "Linked"
            diff < 2 * 60_000L -> "Active now"
            diff < 60 * 60_000L -> "Last active ${(diff / 60_000L).coerceAtLeast(1)}m ago"
            diff < 24 * 60 * 60_000L -> "Last active ${(diff / 3_600_000L).coerceAtLeast(1)}h ago"
            else -> {
                val fmt = SimpleDateFormat("MMM d, h:mm a", Locale.getDefault())
                "Last active ${fmt.format(Date(device.lastActiveAt))}"
            }
        }
        if (device.osName.isNotBlank()) "${device.osName} · $timeText" else timeText
    }

    LiquidGlassCard(
        backdrop = backdrop,
        isDark = palette.isDark,
        cornerRadius = 20.dp,
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(palette.accentSoft),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Computer,
                    contentDescription = null,
                    tint = palette.accent,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = device.deviceLabel.ifBlank { "${device.browserName} JaText" },
                    color = palette.textPrimary,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = activitySubtitle,
                    color = palette.textSecondary,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(10.dp))
            LiquidButton(
                onClick = { if (!isDisconnecting) onDisconnect() },
                backdrop = backdrop,
                enabled = !isDisconnecting,
                isDark = palette.isDark,
                tint = IOS_LIQUID_RED,
                height = 36.dp,
                horizontalPadding = 13.dp,
            ) {
                Icon(
                    imageVector = Icons.Rounded.LinkOff,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = if (isDisconnecting) "..." else "Disconnect",
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

/* ==================== Owner Settings Admin Console (aidilzafri2013@gmail.com / @imzachie ONLY) ==================== */

@Composable
private fun OwnerSettingsMobileSection(
    me: JaUser,
    vm: JaTextSessionViewModel,
    palette: JaTextPalette,
    backdrop: Backdrop,
) {
    val scope = rememberCoroutineScope()
    val ownerDangerRed = Color(0xFFEF4444)

    var loading by remember { mutableStateOf(true) }
    var busyAction by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var stats by remember { mutableStateOf<OwnerPlatformStats?>(null) }
    var accounts by remember { mutableStateOf<List<OwnerManagedUser>>(emptyList()) }
    var selectedAccount by remember { mutableStateOf<OwnerManagedUser?>(null) }

    var newUsername by remember { mutableStateOf("") }
    var newDisplayName by remember { mutableStateOf("") }
    var suspendReason by remember { mutableStateOf("") }
    var confirmDeleteUsername by remember { mutableStateOf("") }
    var broadcastBody by remember { mutableStateOf("") }

    fun loadDashboard(q: String = searchQuery) {
        scope.launch {
            loading = true
            runCatching {
                vm.ownerAdminAction(
                    mapOf(
                        "subOp" to "searchUsers",
                        "query" to q.trim(),
                    )
                )
            }.onSuccess { resp ->
                if (resp.stats != null) stats = resp.stats
                accounts = resp.users
                val currentSel = selectedAccount
                if (currentSel != null) {
                    val refreshed = resp.users.firstOrNull { it.id == currentSel.id }
                    if (refreshed != null) {
                        selectedAccount = refreshed
                        newUsername = refreshed.username
                        newDisplayName = refreshed.displayName
                        suspendReason = refreshed.suspendedReason
                    }
                }
            }.onFailure { err ->
                vm.showToast(err.message ?: "Failed to load Owner Console")
            }
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        loadDashboard("")
    }

    fun runTargetAction(
        subOp: String,
        extra: Map<String, Any?> = emptyMap(),
        clearSelectionOnSuccess: Boolean = false,
    ) {
        val target = selectedAccount ?: return
        if (busyAction) return
        scope.launch {
            busyAction = true
            val payload = LinkedHashMap<String, Any?>().apply {
                put("subOp", subOp)
                put("targetUserId", target.id)
                putAll(extra)
            }
            runCatching {
                vm.ownerAdminAction(payload)
            }.onSuccess { resp ->
                vm.showToast(resp.message ?: "Owner action executed")
                if (clearSelectionOnSuccess) {
                    selectedAccount = null
                    confirmDeleteUsername = ""
                } else if (resp.user != null) {
                    selectedAccount = resp.user
                    newUsername = resp.user.username
                    newDisplayName = resp.user.displayName
                    suspendReason = resp.user.suspendedReason
                }
                loadDashboard(searchQuery)
            }.onFailure { err ->
                vm.showToast(err.message ?: "Action failed")
            }
            busyAction = false
        }
    }

    /* ---- 1. Restricted Owner Banner ---- */
    LiquidGlassCard(
        backdrop = backdrop,
        isDark = palette.isDark,
        borderColor = ownerDangerRed.copy(alpha = 0.55f),
        borderWidth = 1.5.dp,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(ownerDangerRed.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center,
            ) {
                SettingsPrivacyLockSvgIcon(
                    tint = ownerDangerRed,
                    modifier = Modifier.size(20.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "JaText Owner Console",
                    color = ownerDangerRed,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    text = "Signed in as @${me.username} (${me.email.orEmpty().ifBlank { "verified owner" }})",
                    color = palette.textSecondary,
                    fontSize = 12.sp,
                )
            }
            LiquidButton(
                onClick = { loadDashboard(searchQuery) },
                backdrop = backdrop,
                isDark = palette.isDark,
                height = 32.dp,
                horizontalPadding = 11.dp,
            ) {
                Text("Refresh", color = palette.textPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
        Text(
            text = "All actions below execute directly on Turso production tables with server-verified owner privileges. Changes take effect immediately across Mobile and Desktop.",
            color = palette.textSecondary,
            fontSize = 12.5.sp,
            lineHeight = 17.5.sp,
        )
    }

    /* ---- 2. Live Platform Metrics ---- */
    val s = stats
    if (s != null) {
        LiquidGlassCard(
            backdrop = backdrop,
            isDark = palette.isDark,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = "Live Platform Telemetry",
                color = palette.textPrimary,
                fontSize = 14.5.sp,
                fontWeight = FontWeight.ExtraBold,
            )
            val statPairs = listOf(
                Triple("Users", "${s.totalUsers}", palette.textPrimary),
                Triple("Online", "${s.onlineUsers}", Color(0xFF22C55E)),
                Triple("Suspended", "${s.suspendedUsers}", ownerDangerRed),
                Triple("DMs", "${s.totalMessages}", palette.accent),
                Triple("Groups", "${s.totalGroups}", palette.textPrimary),
                Triple("Web Links", "${s.linkedDevices}", palette.textPrimary),
            )
            statPairs.chunked(3).forEach { row ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    row.forEach { (label, countText, tint) ->
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .background(palette.bgTertiary.copy(alpha = 0.68f))
                                .border(1.dp, palette.border, RoundedCornerShape(12.dp))
                                .padding(horizontal = 10.dp, vertical = 9.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(
                                text = countText,
                                color = tint,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.ExtraBold,
                            )
                            Text(
                                text = label,
                                color = palette.textSecondary,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }
            }
        }
    }

    /* ---- 3. Quick Official Community Broadcast ---- */
    LiquidGlassCard(
        backdrop = backdrop,
        isDark = palette.isDark,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "Broadcast Community Announcement",
            color = palette.textPrimary,
            fontSize = 14.5.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        LiquidTextFieldBar(
            value = broadcastBody,
            onValueChange = { broadcastBody = it },
            backdrop = backdrop,
            isDark = palette.isDark,
            label = "Announcement text",
            placeholder = "Post an official update to JaText Community...",
            singleLine = false,
            textColor = palette.textPrimary,
            subTextColor = palette.textSecondary,
            accentColor = palette.accent,
        )
        LiquidButton(
            onClick = {
                val clean = broadcastBody.trim()
                if (clean.isEmpty() || busyAction) return@LiquidButton
                scope.launch {
                    busyAction = true
                    runCatching {
                        vm.ownerAdminAction(
                            mapOf(
                                "subOp" to "broadcastCommunity",
                                "body" to clean,
                            )
                        )
                    }.onSuccess { resp ->
                        broadcastBody = ""
                        vm.showToast(resp.message ?: "Posted to JaText Community")
                    }.onFailure { err ->
                        vm.showToast(err.message ?: "Broadcast failed")
                    }
                    busyAction = false
                }
            },
            backdrop = backdrop,
            enabled = broadcastBody.isNotBlank() && !busyAction,
            isDark = palette.isDark,
            tint = palette.accent,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Post to JaText Community", color = Color.White, fontSize = 13.5.sp, fontWeight = FontWeight.Bold)
        }
    }

    /* ---- 4. Account Directory & Lookup ---- */
    LiquidGlassCard(
        backdrop = backdrop,
        isDark = palette.isDark,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "Manage Accounts",
            color = palette.textPrimary,
            fontSize = 14.5.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            JaWebInput(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = "Search @username, email, name, or ID...",
                leadingIcon = Icons.Rounded.Search,
                modifier = Modifier.weight(1f),
            )
            LiquidButton(
                onClick = { loadDashboard(searchQuery) },
                backdrop = backdrop,
                isDark = palette.isDark,
                height = 42.dp,
                horizontalPadding = 14.dp,
            ) {
                Text(if (loading) "..." else "Find", color = palette.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }

        if (accounts.isEmpty() && !loading) {
            Text(
                text = "No accounts matched your query.",
                color = palette.textSecondary,
                fontSize = 13.sp,
                modifier = Modifier.padding(vertical = 6.dp),
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                accounts.take(30).forEach { acct ->
                    val isSelected = selectedAccount?.id == acct.id
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(
                                if (isSelected) ownerDangerRed.copy(alpha = 0.14f)
                                else palette.bgTertiary.copy(alpha = 0.65f)
                            )
                            .border(
                                width = if (isSelected) 1.5.dp else 1.dp,
                                color = if (isSelected) ownerDangerRed else palette.border,
                                shape = RoundedCornerShape(14.dp),
                            )
                            .clickable {
                                selectedAccount = acct
                                newUsername = acct.username
                                newDisplayName = acct.displayName
                                suspendReason = acct.suspendedReason
                                confirmDeleteUsername = ""
                            }
                            .padding(horizontal = 11.dp, vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        JaAvatar(
                            avatarUrl = acct.avatarUrl,
                            displayName = acct.displayName.ifBlank { acct.username },
                            avatarColor = acct.avatarColor,
                            size = 38.dp,
                            ringWidth = 2.dp,
                            presenceStatus = if (acct.online) "online" else "offline",
                            statusBorderColor = palette.bgSecondary,
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = acct.displayName.ifBlank { acct.username },
                                    color = palette.textPrimary,
                                    fontSize = 13.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (acct.isOwner) {
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        text = "OWNER",
                                        color = ownerDangerRed,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                    )
                                } else if (acct.isSuspended) {
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        text = "SUSPENDED",
                                        color = ownerDangerRed,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                    )
                                }
                            }
                            Text(
                                text = "@${acct.username} · ${acct.email.ifBlank { "no email" }}",
                                color = palette.textSecondary,
                                fontSize = 11.5.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }
    }

    /* ---- 5. Selected Account Danger Zone Inspector ---- */
    val target = selectedAccount
    if (target != null) {
        val isTargetOwner = target.isOwner || target.id == me.id
        LiquidGlassCard(
            backdrop = backdrop,
            isDark = palette.isDark,
            borderColor = ownerDangerRed.copy(alpha = 0.62f),
            borderWidth = 1.5.dp,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Inspecting @${target.username}",
                        color = ownerDangerRed,
                        fontSize = 15.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Text(
                        text = "ID: ${target.id} · 2FA: ${if (target.totpEnabled) "ON" else "OFF"} · Passkeys: ${target.passkeyCount} · Web Links: ${target.linkedDeviceCount}",
                        color = palette.textSecondary,
                        fontSize = 11.5.sp,
                    )
                }
                IconButton(onClick = { selectedAccount = null }, modifier = Modifier.size(28.dp)) {
                    Icon(Icons.Rounded.Close, contentDescription = "Close inspector", tint = palette.textSecondary)
                }
            }

            /* -- Force-Change Username -- */
            LiquidTextFieldBar(
                value = newUsername,
                onValueChange = { newUsername = it },
                backdrop = backdrop,
                isDark = palette.isDark,
                label = "Force-change username",
                placeholder = "new_username",
                textColor = palette.textPrimary,
                subTextColor = palette.textSecondary,
                accentColor = ownerDangerRed,
            )
            LiquidButton(
                onClick = {
                    runTargetAction(
                        subOp = "forceChangeUsername",
                        extra = mapOf("newUsername" to newUsername.trim().removePrefix("@")),
                    )
                },
                backdrop = backdrop,
                enabled = !busyAction && newUsername.trim().removePrefix("@").length >= 3,
                isDark = palette.isDark,
                tint = palette.accent,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Apply Username Override", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }

            /* -- Force-Change Display Name -- */
            LiquidTextFieldBar(
                value = newDisplayName,
                onValueChange = { newDisplayName = it },
                backdrop = backdrop,
                isDark = palette.isDark,
                label = "Force-change display name",
                placeholder = "Display Name",
                textColor = palette.textPrimary,
                subTextColor = palette.textSecondary,
                accentColor = ownerDangerRed,
            )
            LiquidButton(
                onClick = {
                    runTargetAction(
                        subOp = "forceUpdateProfile",
                        extra = mapOf("displayName" to newDisplayName.trim()),
                    )
                },
                backdrop = backdrop,
                enabled = !busyAction && newDisplayName.trim().isNotEmpty(),
                isDark = palette.isDark,
                tint = palette.accent,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Apply Display Name Override", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }

            if (!isTargetOwner) {
                /* -- Suspend / Unsuspend Account -- */
                LiquidTextFieldBar(
                    value = suspendReason,
                    onValueChange = { suspendReason = it },
                    backdrop = backdrop,
                    isDark = palette.isDark,
                    label = "Suspension reason (optional)",
                    placeholder = "Terms violation / abuse",
                    textColor = palette.textPrimary,
                    subTextColor = palette.textSecondary,
                    accentColor = ownerDangerRed,
                )
                LiquidButton(
                    onClick = {
                        runTargetAction(
                            subOp = "setSuspended",
                            extra = mapOf(
                                "suspended" to !target.isSuspended,
                                "reason" to suspendReason.trim(),
                            ),
                        )
                    },
                    backdrop = backdrop,
                    enabled = !busyAction,
                    isDark = palette.isDark,
                    tint = if (target.isSuspended) IOS_LIQUID_GREEN else ownerDangerRed,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = if (target.isSuspended) "Unsuspend Account" else "Suspend & Kick Account",
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }

                /* -- Session Revoke / Security Reset / Profile Wipe / Purge Messages -- */
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    LiquidButton(
                        onClick = { runTargetAction("revokeSessions") },
                        backdrop = backdrop,
                        enabled = !busyAction,
                        isDark = palette.isDark,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Revoke Sessions", color = palette.textPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    LiquidButton(
                        onClick = { runTargetAction("resetSecurity") },
                        backdrop = backdrop,
                        enabled = !busyAction,
                        isDark = palette.isDark,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Reset 2FA/Keys", color = palette.textPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    LiquidButton(
                        onClick = { runTargetAction("wipeProfile") },
                        backdrop = backdrop,
                        enabled = !busyAction,
                        isDark = palette.isDark,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Wipe Profile", color = ownerDangerRed, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    LiquidButton(
                        onClick = { runTargetAction("purgeUserMessages") },
                        backdrop = backdrop,
                        enabled = !busyAction,
                        isDark = palette.isDark,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Purge Messages", color = ownerDangerRed, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }

                /* -- Permanent Account Deletion -- */
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(ownerDangerRed.copy(alpha = 0.10f))
                        .border(1.dp, ownerDangerRed.copy(alpha = 0.48f), RoundedCornerShape(14.dp))
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "Permanent Account Deletion",
                        color = ownerDangerRed,
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    Text(
                        text = "Type @${target.username} below to permanently delete this account, its DMs, memberships, passkeys, and linked sessions.",
                        color = palette.textSecondary,
                        fontSize = 12.sp,
                        lineHeight = 16.5.sp,
                    )
                    JaWebInput(
                        value = confirmDeleteUsername,
                        onValueChange = { confirmDeleteUsername = it },
                        placeholder = "Type @${target.username} to confirm",
                        modifier = Modifier.fillMaxWidth(),
                    )
                    val matchesTarget = confirmDeleteUsername.trim().removePrefix("@")
                        .equals(target.username, ignoreCase = true)
                    LiquidButton(
                        onClick = {
                            if (matchesTarget) {
                                runTargetAction(
                                    subOp = "deleteAccount",
                                    clearSelectionOnSuccess = true,
                                )
                            }
                        },
                        backdrop = backdrop,
                        enabled = matchesTarget && !busyAction,
                        isDark = palette.isDark,
                        tint = ownerDangerRed,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = "Permanently Delete @${target.username}",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                }
            }
        }
    }
}

