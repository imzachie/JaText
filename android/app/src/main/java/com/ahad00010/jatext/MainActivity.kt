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
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.OFFICIAL_COMMUNITY_ID
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.ui.screens.ChatThreadScreen
import com.ahad00010.jatext.ui.screens.EnableCallAndAlertPermissionsModal
import com.ahad00010.jatext.ui.screens.GroupMembersBottomModal
import com.ahad00010.jatext.ui.screens.JaTextLoadingScreen
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
        activeActivityRef = WeakReference(this)

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
            JaTextTheme(config = uiState.themeConfig) {
                JaTextRootHost(
                    activity = this,
                    vm = sessionViewModel,
                )
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

@Composable
private fun JaTextRootHost(
    activity: MainActivity,
    vm: JaTextSessionViewModel,
) {
    val context = LocalContext.current
    val state by vm.state.collectAsState()
    val palette = LocalJaTextPalette.current

    var showSettings by remember { mutableStateOf(false) }
    var viewingPeerProfile by remember { mutableStateOf<JaUser?>(null) }
    var verifyingPeerCode by remember { mutableStateOf<JaUser?>(null) }
    var showGroupMembers by remember { mutableStateOf(false) }
    var showPermissionsModal by remember { mutableStateOf(false) }

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

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.loading -> {
                JaTextLoadingScreen()
            }
            !state.isAuthenticated -> {
                NativeLoginScreen(
                    vm = vm,
                    isAddingAnotherAccount = state.addingAccountReturnSlotId != null,
                    onCancelAddAccount = { vm.cancelAddAnotherAccount() },
                )
            }
            state.me?.needsProfileSetup == true -> {
                ProfileSetupOnboardingScreen(me = state.me!!, vm = vm)
            }
            else -> {
                val screenKey = when {
                    showSettings -> "settings"
                    state.activeChatId != null || state.activeGroupId != null -> "thread"
                    else -> "sidebar"
                }

                AnimatedContent(
                    targetState = screenKey,
                    transitionSpec = {
                        if (targetState == "thread" || targetState == "settings") {
                            (slideInHorizontally(tween(200)) { it / 4 } + fadeIn(tween(180)))
                                .togetherWith(fadeOut(tween(150)))
                        } else {
                            fadeIn(tween(170)).togetherWith(
                                slideOutHorizontally(tween(190)) { it / 4 } + fadeOut(tween(150))
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
                                onInstallUpdate = { vm.downloadAndInstallApkUpdate(activity) },
                            )
                        }
                    }
                }

                // Native WebRTC Call Stage & PIP Overlay
                state.me?.let { me ->
                    NativeCallOverlay(
                        me = me,
                        callEngine = vm.callEngine,
                    )
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

        // Lightweight Native Toast Pill
        state.toastMessage?.let { msg ->
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(bottom = 72.dp, start = 20.dp, end = 20.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0xEE181A22))
                    .border(1.dp, palette.borderStrong, RoundedCornerShape(999.dp))
                    .padding(horizontal = 18.dp, vertical = 10.dp)
            ) {
                Text(text = msg, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}
