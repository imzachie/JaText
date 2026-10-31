package com.ahad00010.jatext

import android.Manifest
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.WindowManager
import java.lang.ref.WeakReference
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import coil.Coil
import coil.ImageLoader
import coil.decode.GifDecoder
import coil.decode.ImageDecoderDecoder
import com.ahad00010.jatext.crypto.JaTextCryptoEngine
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.OFFICIAL_COMMUNITY_ID
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.ui.effects.LocalThanosSnapHost
import com.ahad00010.jatext.ui.effects.ThanosSnapHostState
import com.ahad00010.jatext.ui.effects.ThanosSnapOverlayHost
import com.ahad00010.jatext.ui.screens.ChatThreadScreen
import com.ahad00010.jatext.ui.screens.EnableCallAndAlertPermissionsModal
import com.ahad00010.jatext.ui.screens.GroupMembersBottomModal
import com.ahad00010.jatext.ui.screens.JaTextLoadingScreen
import com.ahad00010.jatext.ui.screens.MobileUpdatePromptModal
import com.ahad00010.jatext.ui.screens.NativeCallOverlay
import com.ahad00010.jatext.ui.screens.NativeLoginScreen
import com.ahad00010.jatext.ui.screens.PeerProfileBottomModal
import com.ahad00010.jatext.ui.screens.PostUpdateWelcomeDialog
import com.ahad00010.jatext.ui.screens.ProfileSetupOnboardingScreen
import com.ahad00010.jatext.ui.screens.SettingsModalScreen
import com.ahad00010.jatext.ui.screens.SidebarScreen
import com.ahad00010.jatext.ui.screens.VerifySecurityCodeDialog
import com.ahad00010.jatext.ui.theme.JaTextTheme
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette

class MainActivity : ComponentActivity() {

    companion object {
        private val mainHandler = Handler(Looper.getMainLooper())

        @Volatile
        private var activeActivityRef: WeakReference<MainActivity>? = null

        @JvmStatic
        fun peekActiveActivity(): MainActivity? = activeActivityRef?.get()

        @JvmStatic
        fun notifyRealtimeSyncWake() {
            NativeRuntimeBridge.notifySyncWake()
        }

        @JvmStatic
        fun isActivelyVisibleUnlocked(ctx: Context?): Boolean {
            if (!NativeRuntimeBridge.isAppInForeground) return false
            val appCtx = ctx?.applicationContext ?: activeActivityRef?.get()?.applicationContext ?: return true
            return try {
                val pm = appCtx.getSystemService(Context.POWER_SERVICE) as? PowerManager
                val km = appCtx.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
                val interactive = pm?.isInteractive ?: true
                val locked = km?.isKeyguardLocked ?: false
                interactive && !locked
            } catch (_: Throwable) {
                NativeRuntimeBridge.isAppInForeground
            }
        }

        @JvmStatic
        fun setCallLockScreenMode(enabled: Boolean) {
            mainHandler.post {
                val activity = activeActivityRef?.get() ?: return@post
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                        activity.setShowWhenLocked(enabled)
                        activity.setTurnScreenOn(enabled)
                    } else {
                        @Suppress("DEPRECATION")
                        if (enabled) {
                            activity.window.addFlags(
                                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            )
                        } else {
                            activity.window.clearFlags(
                                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            )
                        }
                    }
                    if (enabled) {
                        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    } else {
                        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    }
                } catch (_: Throwable) {
                }
            }
        }

        @JvmStatic
        fun bringToFrontAfterAuth() {
            mainHandler.post {
                val activity = activeActivityRef?.get() ?: return@post
                try {
                    val bringIntent = Intent(activity, MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    }
                    activity.startActivity(bringIntent)
                } catch (_: Throwable) {
                }
            }
        }
    }

    private val sessionViewModel: JaTextSessionViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN or
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        )
        activeActivityRef = WeakReference(this)

        // Register global Coil GIF / Animated WebP decoder + OkHttp Range reassembly & NETSCAPE2.0 loop=0
        val rawSliceClient = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(35, TimeUnit.SECONDS)
            .build()
        val animatedMediaClient = rawSliceClient.newBuilder()
            .addInterceptor { chain ->
                val req = chain.request()
                val res = chain.proceed(req)
                if (req.method != "GET" || !res.isSuccessful || req.header("Range") != null) {
                    return@addInterceptor res
                }

                val contentTypeHeader = res.header("Content-Type")?.lowercase().orEmpty()
                val urlStr = req.url.toString().lowercase()
                val mayBeAnimatedOrChunked = res.code == 206 ||
                    contentTypeHeader.contains("gif") ||
                    urlStr.contains("/api/media/") ||
                    urlStr.endsWith(".gif")

                if (!mayBeAnimatedOrChunked) {
                    return@addInterceptor res
                }

                val firstBody = res.body ?: return@addInterceptor res
                val firstBytes = firstBody.bytes()
                if (firstBytes.isEmpty()) {
                    return@addInterceptor res.newBuilder()
                        .body(firstBytes.toResponseBody(firstBody.contentType()))
                        .build()
                }

                var assembledBytes = firstBytes
                var reassembled206 = false
                if (res.code == 206) {
                    val cr = res.header("Content-Range").orEmpty().trim()
                    val m = Regex("""^bytes\s+(\d+)-(\d+)/(\d+)""", RegexOption.IGNORE_CASE).find(cr)
                    if (m != null) {
                        val firstEnd = m.groupValues[2].toIntOrNull() ?: -1
                        val totalSize = m.groupValues[3].toIntOrNull() ?: -1
                        if (totalSize > firstEnd + 1 && totalSize <= 32 * 1024 * 1024) {
                            val full = ByteArray(totalSize)
                            val initialCopy = firstBytes.size.coerceAtMost(totalSize)
                            System.arraycopy(firstBytes, 0, full, 0, initialCopy)
                            var cursor = initialCopy
                            val sliceStep = (3.8 * 1024 * 1024).toInt()
                            while (cursor < totalSize) {
                                val reqEnd = (cursor + sliceStep - 1).coerceAtMost(totalSize - 1)
                                val sliceReq = Request.Builder()
                                    .url(req.url)
                                    .header("Range", "bytes=$cursor-$reqEnd")
                                    .build()
                                val sliceBytes = rawSliceClient.newCall(sliceReq).execute().use { sr ->
                                    if (!sr.isSuccessful) null else sr.body?.bytes()
                                }
                                if (sliceBytes == null || sliceBytes.isEmpty()) break
                                val len = sliceBytes.size.coerceAtMost(totalSize - cursor)
                                System.arraycopy(sliceBytes, 0, full, cursor, len)
                                cursor += len
                            }
                            if (cursor >= totalSize) {
                                assembledBytes = full
                                reassembled206 = true
                            }
                        }
                    }
                }

                val isGif = JaTextCryptoEngine.isGifBytes(assembledBytes)
                val finalBytes = if (isGif) {
                    JaTextCryptoEngine.ensureInfiniteLoopGifBytes(assembledBytes)
                } else {
                    assembledBytes
                }
                val finalMediaType = if (isGif) {
                    "image/gif".toMediaType()
                } else {
                    firstBody.contentType() ?: "image/jpeg".toMediaType()
                }

                res.newBuilder()
                    .apply {
                        if (reassembled206) {
                            code(200)
                            removeHeader("Content-Range")
                        }
                    }
                    .header("Content-Type", finalMediaType.toString())
                    .header("Content-Length", finalBytes.size.toString())
                    .body(finalBytes.toResponseBody(finalMediaType))
                    .build()
            }
            .build()

        Coil.setImageLoader(
            ImageLoader.Builder(applicationContext)
                .okHttpClient(animatedMediaClient)
                .components {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        add(ImageDecoderDecoder.Factory())
                    } else {
                        add(GifDecoder.Factory())
                    }
                }
                .crossfade(true)
                .build()
        )

        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }

        // Request native 120Hz / highest supported display refresh rate on Android RenderThread
        requestHighestRefreshRate()
        handleIncomingPushIntent(intent)

        setContent {
            val uiState by sessionViewModel.state.collectAsState()
            val thanosSnapHost = remember { ThanosSnapHostState() }
            JaTextTheme(config = uiState.themeConfig) {
                CompositionLocalProvider(LocalThanosSnapHost provides thanosSnapHost) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        JaTextRootHost(
                            activity = this@MainActivity,
                            vm = sessionViewModel,
                        )
                        ThanosSnapOverlayHost(hostState = thanosSnapHost)
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingPushIntent(intent)
    }

    override fun onStart() {
        super.onStart()
        activeActivityRef = WeakReference(this)
        NativeRuntimeBridge.isAppInForeground = true
        sessionViewModel.triggerImmediateSync(burst = true)
    }

    override fun onResume() {
        super.onResume()
        window.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN or
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        )
        activeActivityRef = WeakReference(this)
        sessionViewModel.onActivityResumed()
    }

    override fun onStop() {
        NativeRuntimeBridge.isAppInForeground = false
        super.onStop()
    }

    override fun onDestroy() {
        if (activeActivityRef?.get() === this) {
            activeActivityRef = null
        }
        super.onDestroy()
    }

    private fun handleIncomingPushIntent(intent: Intent?) {
        if (intent == null) return
        val dataUri = intent.data
        if (dataUri != null && dataUri.scheme == "com.ahad00010.jatext" && dataUri.host == "auth") {
            val tursoToken = dataUri.getQueryParameter("tursoToken")
            val authError = dataUri.getQueryParameter("authError")
            intent.data = null
            if (!tursoToken.isNullOrBlank()) {
                sessionViewModel.completeDirectTursoTokenSignIn(tursoToken, null)
            } else if (!authError.isNullOrBlank()) {
                sessionViewModel.reportExternalAuthError(authError)
            }
            return
        }
        if (intent.getBooleanExtra("jatext_decline_call", false)) {
            JaTextSoundManager.cancelIncomingCallWakeup(this, true)
            sessionViewModel.state.value.me?.let { me ->
                sessionViewModel.callEngine.declineIncomingCall(me)
            }
            return
        }
        val targetType = intent.getStringExtra("jatext_target_type")
        val targetId = intent.getStringExtra("jatext_target_id")
        if (!targetType.isNullOrBlank()) {
            when (targetType) {
                "dm" -> if (!targetId.isNullOrBlank()) sessionViewModel.openDmChat(targetId)
                "group" -> if (!targetId.isNullOrBlank()) sessionViewModel.openGroupChat(targetId)
                "community" -> sessionViewModel.openCommunityChat()
            }
            return
        }
        val groupId = intent.getStringExtra("groupId")
        val chatId = intent.getStringExtra("chatId")
        val senderId = intent.getStringExtra("senderId")
        val pushType = intent.getStringExtra("type")
        when {
            !groupId.isNullOrBlank() -> sessionViewModel.openGroupChat(groupId)
            chatId == OFFICIAL_COMMUNITY_ID ||
                chatId == "jatext-community" ||
                pushType == "community" ||
                pushType == "announcement" -> sessionViewModel.openCommunityChat()
            !senderId.isNullOrBlank() && pushType != "incoming_call" -> sessionViewModel.openDmChat(senderId)
            !chatId.isNullOrBlank() -> sessionViewModel.openDmChat(chatId)
        }
        sessionViewModel.triggerImmediateSync(burst = true)
    }

    private fun requestHighestRefreshRate() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val modes = display?.supportedModes ?: return
                val best = modes.maxByOrNull { it.refreshRate } ?: return
                window.attributes = window.attributes.apply {
                    preferredDisplayModeId = best.modeId
                }
            }
        } catch (_: Throwable) {
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun JaTextRootHost(
    activity: MainActivity,
    vm: JaTextSessionViewModel,
) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val isImeVisible = WindowInsets.isImeVisible
    var wasImeVisible by remember { mutableStateOf(false) }

    // Whenever the user closes/dismisses the soft keyboard, immediately release focus from
    // any BasicTextField/TextField so Android NEVER re-opens the keyboard on its own!
    LaunchedEffect(isImeVisible) {
        if (isImeVisible) {
            wasImeVisible = true
        } else if (wasImeVisible) {
            wasImeVisible = false
            focusManager.clearFocus(force = true)
        }
    }

    val state by vm.state.collectAsState()
    val palette = LocalJaTextPalette.current

    var showSettings by remember { mutableStateOf(false) }
    var viewingPeerProfile by remember { mutableStateOf<JaUser?>(null) }
    var verifyingPeerCode by remember { mutableStateOf<JaUser?>(null) }
    var showGroupMembers by remember { mutableStateOf(false) }
    var showPermissionsModal by remember { mutableStateOf(false) }

    val anyRootModalOpen =
        viewingPeerProfile != null ||
            verifyingPeerCode != null ||
            showGroupMembers ||
            showPermissionsModal ||
            state.showPostUpdateWelcome

    LaunchedEffect(anyRootModalOpen, showSettings, state.activeChatId, state.activeGroupId) {
        focusManager.clearFocus(force = true)
        keyboardController?.hide()
    }

    val requiredPermissions = remember {
        buildList {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
            add(Manifest.permission.RECORD_AUDIO)
            add(Manifest.permission.CAMERA)
        }
    }

    val multiPermLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) {
        showPermissionsModal = false
    }

    // Check at startup ONLY when authenticated and permissions are genuinely missing!
    LaunchedEffect(state.isAuthenticated) {
        if (state.isAuthenticated && !vm.cache.wasPermissionPromptDismissed()) {
            val anyMissing = requiredPermissions.any { perm ->
                ContextCompat.checkSelfPermission(context, perm) != PackageManager.PERMISSION_GRANTED
            }
            showPermissionsModal = anyMissing
        }
    }

    val authStage = when {
        state.loading -> "loading"
        !state.isAuthenticated -> "login"
        state.me?.needsProfileSetup == true -> "onboarding"
        else -> "app"
    }

    Box(modifier = Modifier.fillMaxSize()) {
        AnimatedContent(
            targetState = authStage,
            transitionSpec = {
                (fadeIn(tween(220)) + scaleIn(initialScale = 0.98f, animationSpec = tween(220)))
                    .togetherWith(fadeOut(tween(160)))
            },
            label = "JaTextAuthStage",
        ) { stage ->
            when (stage) {
                "loading" -> {
                    JaTextLoadingScreen()
                }
                "login" -> {
                    NativeLoginScreen(
                        vm = vm,
                        isAddingAnotherAccount = state.addingAccountReturnSlotId != null,
                        onCancelAddAccount = { vm.cancelAddAnotherAccount() },
                    )
                }
                "onboarding" -> {
                    state.me?.let { me ->
                        ProfileSetupOnboardingScreen(me = me, vm = vm)
                    } ?: JaTextLoadingScreen()
                }
                else -> {
                    val screenKey = when {
                        showSettings -> "settings"
                        state.activeChatId != null || state.activeGroupId != null -> "thread"
                        else -> "sidebar"
                    }

                    Box(modifier = Modifier.fillMaxSize()) {
                        AnimatedContent(
                            targetState = screenKey,
                            transitionSpec = {
                                if (targetState == "thread" || targetState == "settings") {
                                    (slideInHorizontally(
                                        animationSpec = spring(
                                            dampingRatio = Spring.DampingRatioNoBouncy,
                                            stiffness = Spring.StiffnessMediumLow,
                                        )
                                    ) { (it * 0.28f).toInt() } + fadeIn(tween(180)))
                                        .togetherWith(
                                            slideOutHorizontally(tween(180)) { -(it * 0.10f).toInt() } + fadeOut(tween(150))
                                        )
                                } else {
                                    (slideInHorizontally(
                                        animationSpec = spring(
                                            dampingRatio = Spring.DampingRatioNoBouncy,
                                            stiffness = Spring.StiffnessMediumLow,
                                        )
                                    ) { -(it * 0.12f).toInt() } + fadeIn(tween(170)))
                                        .togetherWith(
                                            slideOutHorizontally(tween(190)) { (it * 0.28f).toInt() } + fadeOut(tween(150))
                                        )
                                }
                            },
                            label = "JaTextRootNav",
                        ) { target ->
                            when (target) {
                                "settings" -> {
                                    SettingsModalScreen(
                                        state = state,
                                        vm = vm,
                                        onClose = { showSettings = false },
                                    )
                                }
                                "thread" -> {
                                    ChatThreadScreen(
                                        state = state,
                                        vm = vm,
                                        onOpenPeerProfile = { peer -> viewingPeerProfile = peer },
                                        onOpenSecurityCode = { peer -> verifyingPeerCode = peer },
                                        onOpenGroupMembers = { showGroupMembers = true },
                                    )
                                }
                                else -> {
                                    SidebarScreen(
                                        state = state,
                                        vm = vm,
                                        onOpenSettings = { showSettings = true },
                                        onOpenProfile = { peer -> viewingPeerProfile = peer },
                                        onInstallUpdate = { vm.downloadAndInstallApkUpdate(activity) },
                                    )
                                }
                            }
                        }

                        // Native WebRTC Call Stage & Draggable PIP Overlay
                        state.me?.let { me ->
                            NativeCallOverlay(
                                me = me,
                                callEngine = vm.callEngine,
                            )
                        }
                    }
                }
            }
        }

        // Modals
        viewingPeerProfile?.let { peer ->
            PeerProfileBottomModal(
                peer = peer,
                vm = vm,
                onDismiss = { viewingPeerProfile = null },
                onOpenVerifySecurityCode = { verifyingPeerCode = peer },
            )
        }

        verifyingPeerCode?.let { peer ->
            VerifySecurityCodeDialog(
                peer = peer,
                vm = vm,
                onDismiss = { verifyingPeerCode = null },
            )
        }

        if (showGroupMembers && state.groupDetails != null) {
            GroupMembersBottomModal(
                details = state.groupDetails!!,
                vm = vm,
                onDismiss = { showGroupMembers = false },
            )
        }

        if (showPermissionsModal && state.isAuthenticated) {
            EnableCallAndAlertPermissionsModal(
                onGrantClick = {
                    vm.cache.setPermissionPromptDismissed(true)
                    multiPermLauncher.launch(requiredPermissions.toTypedArray())
                },
                onLaterClick = {
                    vm.cache.setPermissionPromptDismissed(true)
                    showPermissionsModal = false
                }
            )
        }

        if (state.showPostUpdateWelcome && state.isAuthenticated) {
            PostUpdateWelcomeDialog(onDismiss = { vm.dismissPostUpdateWelcome() })
        }

        // Global Mobile-Only "Update your JaText version!" Modal — works on EVERY screen (including Login!)
        val liveUpdate = state.availableUpdate
        if (liveUpdate != null) {
            MobileUpdatePromptModal(
                manifest = liveUpdate,
                downloadingProgress = if (state.updateDownloading) (state.updateProgress * 100f).toInt() else null,
                onInstallClick = { vm.downloadAndInstallApkUpdate(activity) },
                onLaterClick = { vm.dismissUpdatePrompt() },
            )
        }

        // 5-second "Deleted the message for me." bottom popup with Undo button
        val undoBanner = state.deletedForMeUndo
        val undoProgress = remember { Animatable(1f) }
        LaunchedEffect(undoBanner?.nonce) {
            if (undoBanner != null) {
                undoProgress.snapTo(1f)
                val remMs = (undoBanner.expiresAt - System.currentTimeMillis()).coerceIn(200L, 5_000L).toInt()
                undoProgress.animateTo(
                    targetValue = 0f,
                    animationSpec = tween(durationMillis = remMs, easing = LinearEasing),
                )
            }
        }
        AnimatedVisibility(
            visible = undoBanner != null,
            enter = slideInVertically(
                animationSpec = spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessMediumLow)
            ) { it } + fadeIn(tween(150)),
            exit = slideOutVertically(tween(150)) { it } + fadeOut(tween(140)),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 74.dp, start = 18.dp, end = 18.dp),
        ) {
            Column(
                modifier = Modifier
                    .widthIn(min = 280.dp, max = 420.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xF214141D))
                    .border(1.dp, palette.accent.copy(alpha = 0.45f), RoundedCornerShape(16.dp))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = "Deleted the message for me.",
                        color = Color.White,
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(10.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(palette.accentSoft)
                            .border(1.dp, palette.accent.copy(alpha = 0.5f), RoundedCornerShape(999.dp))
                            .clickable { vm.undoDeleteMessageForMe() }
                            .padding(horizontal = 13.dp, vertical = 5.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "Undo",
                            color = palette.accent,
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth(undoProgress.value.coerceIn(0f, 1f))
                        .height(3.dp)
                        .background(palette.accent)
                )
            }
        }

        // Animated Native Toast Pill
        var lastToastText by remember { mutableStateOf("") }
        if (!state.toastMessage.isNullOrBlank()) {
            lastToastText = state.toastMessage!!
        }
        AnimatedVisibility(
            visible = !state.toastMessage.isNullOrBlank(),
            enter = slideInVertically(
                animationSpec = spring(dampingRatio = Spring.DampingRatioLowBouncy, stiffness = Spring.StiffnessMediumLow)
            ) { it } + fadeIn(tween(150)),
            exit = slideOutVertically(tween(150)) { it } + fadeOut(tween(140)),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 72.dp, start = 20.dp, end = 20.dp),
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0xEE181A22))
                    .border(1.dp, palette.borderStrong, RoundedCornerShape(999.dp))
                    .padding(horizontal = 18.dp, vertical = 10.dp)
            ) {
                Text(text = lastToastText, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}
