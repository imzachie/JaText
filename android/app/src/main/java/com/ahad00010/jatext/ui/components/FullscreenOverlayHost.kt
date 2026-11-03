package com.ahad00010.jatext.ui.components

import android.app.Activity
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.zIndex
import androidx.core.view.WindowCompat
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette

data class FullscreenOverlayEntry(
    val id: String,
    val secureScreen: Boolean,
    val backgroundColor: Color,
    val onBackState: State<() -> Unit>,
    val contentState: State<@Composable () -> Unit>,
)

class FullscreenOverlayHostState {
    val entries = mutableStateListOf<FullscreenOverlayEntry>()

    fun mount(entry: FullscreenOverlayEntry) {
        entries.removeAll { it.id == entry.id }
        entries.add(entry)
    }

    fun unmount(id: String) {
        entries.removeAll { it.id == id }
    }
}

val LocalFullscreenOverlayHost = compositionLocalOf<FullscreenOverlayHostState?> { null }

@Composable
fun FullscreenOverlaySlot(
    id: String,
    secureScreen: Boolean = false,
    backgroundColor: Color = Color(0xFF05070B),
    onBack: () -> Unit,
    content: @Composable () -> Unit,
) {
    val host = LocalFullscreenOverlayHost.current
    val latestOnBack = rememberUpdatedState(onBack)
    val latestContent = rememberUpdatedState(content)

    if (host != null) {
        DisposableEffect(host, id, secureScreen, backgroundColor) {
            val entry = FullscreenOverlayEntry(
                id = id,
                secureScreen = secureScreen,
                backgroundColor = backgroundColor,
                onBackState = latestOnBack,
                contentState = latestContent,
            )
            host.mount(entry)
            onDispose {
                host.unmount(id)
            }
        }
    } else {
        BackHandler(onBack = onBack)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(backgroundColor),
        ) {
            content()
        }
    }
}

@Composable
fun FullscreenOverlayStage(
    activity: Activity,
    hostState: FullscreenOverlayHostState,
) {
    val top = hostState.entries.lastOrNull()
    val anySecure = hostState.entries.any { it.secureScreen }
    val palette = LocalJaTextPalette.current
    val rootView = LocalView.current
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current

    // Immediately dismiss the soft keyboard whenever any fullscreen overlay (View Once, Image Lightbox, Story Viewer) opens!
    LaunchedEffect(top?.id) {
        if (top != null) {
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
        }
    }

    DisposableEffect(top != null, anySecure, palette.isDark) {
        runCatching {
            val window = activity.window
            if (anySecure) {
                window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            } else {
                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
            val controller = WindowCompat.getInsetsController(window, rootView)
            if (top != null) {
                controller.isAppearanceLightStatusBars = false
                controller.isAppearanceLightNavigationBars = false
            } else {
                val useDarkIcons = !palette.isDark
                controller.isAppearanceLightStatusBars = useDarkIcons
                controller.isAppearanceLightNavigationBars = useDarkIcons
            }
        }
        onDispose {
            if (hostState.entries.none { it.secureScreen }) {
                runCatching {
                    activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                }
            }
        }
    }

    if (top != null) {
        BackHandler(enabled = true) {
            top.onBackState.value.invoke()
        }
    }

    AnimatedContent(
        targetState = top,
        contentKey = { it?.id ?: "__none__" },
        transitionSpec = {
            if (targetState != null) {
                (fadeIn(animationSpec = tween(210)) +
                    scaleIn(
                        initialScale = 0.89f,
                        animationSpec = spring(dampingRatio = 0.82f, stiffness = 520f),
                    )).togetherWith(
                    fadeOut(animationSpec = tween(170)),
                )
            } else {
                fadeIn(animationSpec = tween(140)).togetherWith(
                    scaleOut(
                        targetScale = 0.90f,
                        animationSpec = tween(195, easing = FastOutSlowInEasing),
                    ) + fadeOut(animationSpec = tween(195)),
                )
            }
        },
        modifier = Modifier.zIndex(980f),
        label = "FullscreenOverlayAnimatedStage",
    ) { activeEntry ->
        if (activeEntry != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(activeEntry.backgroundColor)
                    .pointerInput(activeEntry.id) {
                        awaitPointerEventScope {
                            while (true) {
                                awaitPointerEvent()
                            }
                        }
                    },
            ) {
                activeEntry.contentState.value.invoke()
            }
        }
    }
}
