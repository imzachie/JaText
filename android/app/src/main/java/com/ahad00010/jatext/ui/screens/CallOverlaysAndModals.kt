package com.ahad00010.jatext.ui.screens

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.CallEnd
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Cameraswitch
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Fullscreen
import androidx.compose.material.icons.rounded.FullscreenExit
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MicOff
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.PhoneInTalk
import androidx.compose.material.icons.rounded.ScreenShare
import androidx.compose.material.icons.rounded.StopScreenShare
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.VideocamOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.ahad00010.jatext.BuildConfig
import com.ahad00010.jatext.R
import com.ahad00010.jatext.data.ApkVersionManifest
import com.ahad00010.jatext.data.GroupDetails
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.TursoApiClient
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.components.JaGroupAvatar
import com.ahad00010.jatext.ui.components.JaWebGhostButton
import com.ahad00010.jatext.ui.components.JaWebInput
import com.ahad00010.jatext.ui.components.JaWebPrimaryButton
import com.ahad00010.jatext.ui.components.RichMarkdownText
import com.ahad00010.jatext.ui.components.WEB_WALLPAPER_PRESETS
import com.ahad00010.jatext.ui.components.jaBouncyClick
import com.ahad00010.jatext.ui.icons.ExternalArrowVectorIcon
import com.ahad00010.jatext.ui.icons.SocialBrandVectorIcon
import com.ahad00010.jatext.ui.icons.WebsiteGlobeVectorIcon
import com.ahad00010.jatext.ui.icons.getSocialPlatformMeta
import com.ahad00010.jatext.ui.icons.isHandleOnlyDiscord
import com.ahad00010.jatext.ui.theme.JaTextThemeManager
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import com.ahad00010.jatext.webrtc.NativeCallEngine
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.webrtc.EglBase
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

/**
 * Hardware-accelerated org.webrtc.SurfaceViewRenderer wrapper.
 */
@Composable
fun WebRtcVideoSurface(
    track: VideoTrack,
    eglContext: EglBase.Context,
    mirror: Boolean = false,
    scalingMatchFit: Boolean = false,
    modifier: Modifier = Modifier,
) {
    var rendererRef by remember { mutableStateOf<SurfaceViewRenderer?>(null) }

    DisposableEffect(track) {
        val current = rendererRef
        if (current != null) {
            try {
                track.addSink(current)
            } catch (_: Throwable) {
            }
        }
        onDispose {
            val r = rendererRef
            if (r != null) {
                try {
                    track.removeSink(r)
                } catch (_: Throwable) {
                }
            }
        }
    }

    AndroidView(
        factory = { ctx ->
            SurfaceViewRenderer(ctx).apply {
                init(eglContext, null)
                setMirror(mirror)
                setEnableHardwareScaler(true)
                setScalingType(
                    if (scalingMatchFit) RendererCommon.ScalingType.SCALE_ASPECT_FIT
                    else RendererCommon.ScalingType.SCALE_ASPECT_FILL
                )
                rendererRef = this
                try {
                    track.addSink(this)
                } catch (_: Throwable) {
                }
            }
        },
        update = { view ->
            view.setMirror(mirror)
        },
        onRelease = { view ->
            try {
                track.removeSink(view)
            } catch (_: Throwable) {
            }
            try {
                view.release()
            } catch (_: Throwable) {
            }
        },
        modifier = modifier,
    )
}

/**
 * Full-Featured Native WebRTC 1:1 & Group Call Overlay:
 * - Clickable Fullscreen Screen Share & Video Viewer
 * - Screen Sharing WITH audio (MediaProjection + AudioPlaybackCaptureConfiguration)
 * - 5-Clip Soundboard ("Bruh", "Cheer", "Chime", "Laser", "Rimshot")
 * - 1-Minute unanswered timeout -> "Call dismissed" with "Retry" & "Close"
 * - "GC VC Ended" banner when a group call empties out
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NativeCallOverlay(
    me: JaUser,
    callEngine: NativeCallEngine,
) {
    val context = LocalContext.current
    val callState by callEngine.uiState.collectAsState()
    var showSoundboard by remember { mutableStateOf(false) }
    var elapsedSec by remember { mutableLongStateOf(0L) }

    LaunchedEffect(callState.startedAtMs, callState.active) {
        while (callState.active && callState.startedAtMs != null) {
            elapsedSec = ((System.currentTimeMillis() - (callState.startedAtMs ?: 0L)) / 1000L).coerceAtLeast(0L)
            delay(1000L)
        }
        if (!callState.active) elapsedSec = 0L
    }

    val callPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val micOk = results[Manifest.permission.RECORD_AUDIO] == true ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val camOk = results[Manifest.permission.CAMERA] == true ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        callEngine.onCallPermissionsResult(micGranted = micOk, cameraGranted = camOk)
    }

    LaunchedEffect(callState.pendingPermissionRequest?.id) {
        val req = callState.pendingPermissionRequest ?: return@LaunchedEffect
        val perms = buildList {
            add(Manifest.permission.RECORD_AUDIO)
            if (req.mode == "video" || req.withVideo) add(Manifest.permission.CAMERA)
        }
        callPermissionLauncher.launch(perms.toTypedArray())
    }

    val screenShareLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { res ->
        if (res.resultCode == Activity.RESULT_OK && res.data != null) {
            callEngine.startNativeScreenSharing(res.resultCode, res.data!!)
        }
    }

    // Transient "GC VC Ended" banner when call has just finished
    if (!callState.active && !callState.statusBanner.isNullOrBlank()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(16.dp),
            contentAlignment = Alignment.TopCenter,
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0xE6181A20))
                    .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(999.dp))
                    .padding(horizontal = 18.dp, vertical = 9.dp)
            ) {
                Text(
                    text = callState.statusBanner!!,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.5.sp,
                )
            }
        }
        return
    }

    if (!callState.active) return

    // Freely Draggable Minimized Floating Call Bubble (with Spring Edge Snap!)
    if (callState.minimized && callState.phase != "dismissed") {
        val density = LocalDensity.current
        val scope = rememberCoroutineScope()
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
        ) {
            val maxWpx = with(density) { maxWidth.toPx() }
            val maxHpx = with(density) { maxHeight.toPx() }
            val marginPx = with(density) { 12.dp.toPx() }
            var pillSize by remember { mutableStateOf(IntSize(0, 0)) }
            val offsetX = remember { Animatable(-1f) }
            val offsetY = remember { Animatable(marginPx) }

            LaunchedEffect(maxWpx, pillSize.width) {
                if (pillSize.width > 0 && offsetX.value < 0f && maxWpx > pillSize.width) {
                    offsetX.snapTo((maxWpx - pillSize.width - marginPx).coerceAtLeast(marginPx))
                }
            }

            Row(
                modifier = Modifier
                    .onSizeChanged { pillSize = it }
                    .offset {
                        val safeX = if (offsetX.value < 0f) marginPx else offsetX.value
                        IntOffset(safeX.roundToInt(), offsetY.value.roundToInt())
                    }
                    .pointerInput(maxWpx, maxHpx, pillSize) {
                        detectDragGestures(
                            onDragEnd = {
                                val pw = pillSize.width.toFloat().coerceAtLeast(120f)
                                val ph = pillSize.height.toFloat().coerceAtLeast(44f)
                                val centerX = offsetX.value + pw / 2f
                                val snapX = if (centerX < maxWpx / 2f) {
                                    marginPx
                                } else {
                                    (maxWpx - pw - marginPx).coerceAtLeast(marginPx)
                                }
                                val clampedY = offsetY.value.coerceIn(marginPx, (maxHpx - ph - marginPx).coerceAtLeast(marginPx))
                                scope.launch {
                                    offsetX.animateTo(
                                        snapX,
                                        spring(
                                            dampingRatio = Spring.DampingRatioLowBouncy,
                                            stiffness = Spring.StiffnessMediumLow,
                                        )
                                    )
                                }
                                scope.launch {
                                    offsetY.animateTo(clampedY, spring(stiffness = Spring.StiffnessMedium))
                                }
                            }
                        ) { change, dragAmount ->
                            change.consume()
                            val pw = pillSize.width.toFloat().coerceAtLeast(120f)
                            val ph = pillSize.height.toFloat().coerceAtLeast(44f)
                            val nextX = (offsetX.value + dragAmount.x).coerceIn(marginPx / 2f, (maxWpx - pw - marginPx / 2f).coerceAtLeast(marginPx))
                            val nextY = (offsetY.value + dragAmount.y).coerceIn(marginPx / 2f, (maxHpx - ph - marginPx / 2f).coerceAtLeast(marginPx))
                            scope.launch {
                                offsetX.snapTo(nextX)
                                offsetY.snapTo(nextY)
                            }
                        }
                    }
                    .shadow(14.dp, RoundedCornerShape(999.dp))
                    .clip(RoundedCornerShape(999.dp))
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(Color(0xFF059669), Color(0xFF10B981))
                        )
                    )
                    .border(1.dp, Color(0x55FFFFFF), RoundedCornerShape(999.dp))
                    .clickable { callEngine.setMinimized(false) }
                    .padding(start = 13.dp, end = 8.dp, top = 7.dp, bottom = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Rounded.PhoneInTalk,
                    contentDescription = "Return to call",
                    tint = Color.White,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(8.dp))
                val label = callState.peer?.displayName?.ifBlank { callState.peer?.username.orEmpty() }
                    ?: callState.group?.name
                    ?: "Active Call"
                Text(
                    text = "$label · %d:%02d".format(elapsedSec / 60, elapsedSec % 60),
                    color = Color.White,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 12.5.sp,
                    maxLines = 1,
                )
                Spacer(Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .size(26.dp)
                        .jaBouncyClick(pressedScale = 0.86f) { callEngine.hangUpCall(me) }
                        .clip(CircleShape)
                        .background(Color(0xFFEF4444)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.CallEnd,
                        contentDescription = "End call",
                        tint = Color.White,
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
        }
        return
    }

    val titleName = callState.peer?.displayName?.ifBlank { callState.peer?.username.orEmpty() }
        ?: callState.group?.name
        ?: "JaText Call"

    // Fullscreen Call Surface
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF0B0E14), Color(0xFF131824), Color(0xFF0A0C10))
                )
            )
            .statusBarsPadding()
            .navigationBarsPadding()
    ) {
        /* ==================== Unanswered 1-Minute "Call dismissed" View ==================== */
        if (callState.phase == "dismissed") {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                JaAvatar(
                    avatarUrl = callState.peer?.avatarUrl ?: callState.group?.avatarUrl,
                    displayName = titleName,
                    avatarColor = callState.peer?.avatarColor ?: "purple",
                    size = 94.dp,
                )
                Spacer(Modifier.height(18.dp))
                Text(
                    text = titleName,
                    color = Color.White,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "Call dismissed",
                    color = Color(0xFFFCA5A5),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(28.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Button(
                        onClick = { callEngine.retryDismissedCall(me) },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.height(48.dp).width(130.dp),
                    ) {
                        Icon(Icons.Rounded.Call, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Retry", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    OutlinedButton(
                        onClick = { callEngine.closeDismissedCall() },
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.height(48.dp).width(130.dp),
                    ) {
                        Text("Close", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }
            }
            return@Box
        }

        /* ==================== Incoming Ringing Screen ==================== */
        if (callState.phase == "incoming") {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Spacer(Modifier.height(24.dp))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    JaAvatar(
                        avatarUrl = callState.peer?.avatarUrl ?: callState.group?.avatarUrl,
                        displayName = titleName,
                        avatarColor = callState.peer?.avatarColor ?: "purple",
                        size = 104.dp,
                    )
                    Spacer(Modifier.height(18.dp))
                    Text(titleName, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = if (callState.isGroup) {
                            "Incoming Group ${callState.mode.replaceFirstChar { it.uppercase() }} Call…"
                        } else {
                            "Incoming Encrypted ${callState.mode.replaceFirstChar { it.uppercase() }} Call…"
                        },
                        color = Color(0xFF9CA3AF),
                        fontSize = 14.5.sp,
                    )
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 28.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            modifier = Modifier
                                .size(66.dp)
                                .clip(CircleShape)
                                .background(Color(0xFFEF4444))
                                .clickable { callEngine.declineIncomingCall(me) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Rounded.CallEnd, contentDescription = "Decline", tint = Color.White, modifier = Modifier.size(30.dp))
                        }
                        Spacer(Modifier.height(8.dp))
                        Text("Decline", color = Color(0xFFE5E7EB), fontSize = 13.sp)
                    }

                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            modifier = Modifier
                                .size(66.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF22C55E))
                                .clickable { callEngine.acceptIncomingCall(me, withVideo = callState.mode == "video") },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = if (callState.mode == "video") Icons.Rounded.Videocam else Icons.Rounded.Call,
                                contentDescription = "Accept",
                                tint = Color.White,
                                modifier = Modifier.size(30.dp),
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Text("Accept", color = Color(0xFFE5E7EB), fontSize = 13.sp)
                    }
                }
            }
            return@Box
        }

        /* ==================== Connected / Outgoing Call Stage ==================== */
        Column(modifier = Modifier.fillMaxSize()) {
            // Top Call Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(titleName, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    Text(
                        text = when (callState.phase) {
                            "outgoing" -> "Ringing…"
                            "connecting" -> "Connecting encrypted stream…"
                            else -> "%d:%02d • End-to-End Encrypted".format(elapsedSec / 60, elapsedSec % 60)
                        },
                        color = Color(0xFF9CA3AF),
                        fontSize = 12.5.sp,
                    )
                }
                if (!callState.isCameraOff) {
                    IconButton(onClick = { callEngine.flipCamera() }) {
                        Icon(Icons.Rounded.Cameraswitch, contentDescription = "Flip camera", tint = Color.White)
                    }
                }
                TextButton(onClick = { callEngine.setMinimized(true) }) {
                    Text("Minimize", color = Color(0xFF10B981), fontWeight = FontWeight.Bold)
                }
            }

            // Participant Video / Screen Share Grid (Tap any tile to view Fullscreen!)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                val primaryRemote = callState.participants.firstOrNull()
                if (primaryRemote?.videoTrack != null && (!primaryRemote.cameraOff || primaryRemote.screenSharing)) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(RoundedCornerShape(20.dp))
                            .background(Color.Black)
                            .clickable { callEngine.setFullscreenTarget(primaryRemote.user.id) }
                    ) {
                        WebRtcVideoSurface(
                            track = primaryRemote.videoTrack,
                            eglContext = callEngine.eglBase.eglBaseContext,
                            scalingMatchFit = primaryRemote.screenSharing,
                            modifier = Modifier.fillMaxSize(),
                        )
                        Row(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(10.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color(0x88000000))
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Rounded.Fullscreen, null, tint = Color.White, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = if (primaryRemote.screenSharing) "Tap for Fullscreen Screen" else "Fullscreen",
                                color = Color.White,
                                fontSize = 11.sp,
                            )
                        }
                    }
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        JaAvatar(
                            avatarUrl = callState.peer?.avatarUrl ?: callState.group?.avatarUrl,
                            displayName = titleName,
                            avatarColor = callState.peer?.avatarColor ?: "purple",
                            size = 100.dp,
                        )
                        Spacer(Modifier.height(14.dp))
                        Text(titleName, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        if (callState.isGroup) {
                            Text(
                                text = "${callState.participants.size + 1} in voice channel",
                                color = Color(0xFF9CA3AF),
                                fontSize = 13.sp,
                            )
                        }
                    }
                }

                // Local Camera or Screen Share PIP Preview (clickable for fullscreen!)
                if (callState.isScreenSharing && callState.localScreenPreview != null) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(12.dp)
                            .size(width = 116.dp, height = 164.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .border(1.5.dp, Color(0xFF10B981), RoundedCornerShape(14.dp))
                            .clickable { callEngine.setFullscreenTarget("local-screen") }
                    ) {
                        Image(
                            bitmap = callState.localScreenPreview!!.asImageBitmap(),
                            contentDescription = "Your shared screen",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                } else if (!callState.isCameraOff && callState.localVideoTrack != null) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(12.dp)
                            .size(width = 112.dp, height = 158.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .border(1.5.dp, Color(0x44FFFFFF), RoundedCornerShape(14.dp))
                            .clickable { callEngine.setFullscreenTarget("local-cam") }
                    ) {
                        WebRtcVideoSurface(
                            track = callState.localVideoTrack!!,
                            eglContext = callEngine.eglBase.eglBaseContext,
                            mirror = callState.frontCamera,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }

                // Floating Call Reactions
                if (callState.reactions.isNotEmpty()) {
                    Row(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(14.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        callState.reactions.forEach { r ->
                            Text(r.emoji, fontSize = 28.sp)
                        }
                    }
                }
            }

            /* ==================== 5-Clip Soundboard Drawer ("Bruh" replacing "Fanfare"!) ==================== */
            if (showSoundboard) {
                val clips = listOf(
                    "bruh" to "Bruh",
                    "cheer" to "Cheer",
                    "chime" to "Chime",
                    "laser" to "Laser",
                    "rimshot" to "Rimshot",
                )
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFF1A202E))
                        .border(1.dp, Color(0x28FFFFFF), RoundedCornerShape(16.dp))
                        .padding(12.dp)
                ) {
                    Text("Call Soundboard", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Spacer(Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        clips.forEach { (id, label) ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(Color(0xFF262F42))
                                    .clickable { callEngine.playSoundboard(id) }
                                    .padding(horizontal = 13.dp, vertical = 8.dp)
                            ) {
                                Text(label, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp)
                            }
                        }
                    }
                }
            }

            /* ==================== Bottom Call Control Dock ==================== */
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 18.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CallDockCircleButton(
                    icon = if (callState.isMuted) Icons.Rounded.MicOff else Icons.Rounded.Mic,
                    active = !callState.isMuted,
                    onClick = { callEngine.toggleMute() },
                )
                CallDockCircleButton(
                    icon = if (callState.isCameraOff) Icons.Rounded.VideocamOff else Icons.Rounded.Videocam,
                    active = !callState.isCameraOff,
                    onClick = { callEngine.toggleCamera() },
                )
                CallDockCircleButton(
                    icon = if (callState.isScreenSharing) Icons.Rounded.StopScreenShare else Icons.Rounded.ScreenShare,
                    active = callState.isScreenSharing,
                    onClick = {
                        if (callState.isScreenSharing) {
                            callEngine.stopNativeScreenSharing()
                        } else {
                            val mpm = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
                            if (mpm != null) {
                                screenShareLauncher.launch(mpm.createScreenCaptureIntent())
                            }
                        }
                    },
                )
                CallDockCircleButton(
                    icon = Icons.Rounded.GraphicEq,
                    active = showSoundboard,
                    onClick = { showSoundboard = !showSoundboard },
                )
                CallDockCircleButton(
                    icon = Icons.AutoMirrored.Rounded.VolumeUp,
                    active = callState.isSpeakerphone,
                    onClick = { callEngine.toggleSpeakerphone() },
                )
                Box(
                    modifier = Modifier
                        .size(54.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFEF4444))
                        .clickable { callEngine.hangUpCall(me) },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Rounded.CallEnd, contentDescription = "End Call", tint = Color.White, modifier = Modifier.size(26.dp))
                }
            }
        }

        /* ==================== Clickable Fullscreen Screen Share / Video Viewer ==================== */
        callState.fullscreenTargetId?.let { targetId ->
            Dialog(
                onDismissRequest = { callEngine.setFullscreenTarget(null) },
                properties = DialogProperties(usePlatformDefaultWidth = false),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black)
                ) {
                    when (targetId) {
                        "local-screen" -> {
                            callState.localScreenPreview?.let { bmp ->
                                Image(
                                    bitmap = bmp.asImageBitmap(),
                                    contentDescription = "Fullscreen screen share",
                                    contentScale = ContentScale.Fit,
                                    modifier = Modifier.fillMaxSize(),
                                )
                            }
                        }
                        "local-cam" -> {
                            callState.localVideoTrack?.let { trk ->
                                WebRtcVideoSurface(
                                    track = trk,
                                    eglContext = callEngine.eglBase.eglBaseContext,
                                    mirror = callState.frontCamera,
                                    scalingMatchFit = true,
                                    modifier = Modifier.fillMaxSize(),
                                )
                            }
                        }
                        else -> {
                            val rem = callState.participants.firstOrNull { it.user.id == targetId }
                            if (rem?.videoTrack != null) {
                                WebRtcVideoSurface(
                                    track = rem.videoTrack,
                                    eglContext = callEngine.eglBase.eglBaseContext,
                                    scalingMatchFit = true,
                                    modifier = Modifier.fillMaxSize(),
                                )
                            }
                        }
                    }

                    IconButton(
                        onClick = { callEngine.setFullscreenTarget(null) },
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .statusBarsPadding()
                            .padding(16.dp)
                            .clip(CircleShape)
                            .background(Color(0x88000000)),
                    ) {
                        Icon(Icons.Rounded.FullscreenExit, contentDescription = "Exit fullscreen", tint = Color.White)
                    }
                }
            }
        }
    }
}

@Composable
private fun CallDockCircleButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    active: Boolean,
    onClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(if (active) palette.accentSoft else Color(0xFF1B1B26))
            .border(1.dp, if (active) palette.accent else Color(0x28FFFFFF), CircleShape)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
    }
}

/**
 * Exact 1:1 Web `ProfileCard.tsx` Modal:
 * - `2.5dp` `--profile-outline` `color.hex` border + `2.5dp` banner bottom divider
 * - Active chat wallpaper ambient tint + banner fallback (so chat wallpapers affect the Contact Card too!)
 * - Overlapping `84dp` `JaAvatar` with `3.5dp` ring (ZERO crown badge)
 * - Rich Markdown rendering in user Bio
 * - 1:1 Web Socials & Website brand cards (`SocialBrandVectorIcon` + `WebsiteGlobeVectorIcon`)
 * - Compact E2EE Key Box with "Verify code"
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PeerProfileBottomModal(
    peer: JaUser,
    vm: JaTextSessionViewModel,
    onDismiss: () -> Unit,
    onOpenVerifySecurityCode: () -> Unit,
) {
    val context = LocalContext.current
    val palette = LocalJaTextPalette.current
    val sessionState by vm.state.collectAsState()
    val colorSpec = remember(peer.avatarColor) {
        JaTextThemeManager.avatarColorSpec(peer.avatarColor)
    }

    val rawChatWallpaper = remember(peer.id, sessionState.wallpaperNonce) {
        vm.cache.getWallpaperUrl("dm:${peer.id}")?.takeIf { it.isNotBlank() }
    }
    val resolvedWallpaperUrl = remember(rawChatWallpaper) {
        rawChatWallpaper?.let { raw ->
            if (raw.startsWith("preset:")) {
                val pid = raw.removePrefix("preset:")
                WEB_WALLPAPER_PRESETS.firstOrNull { it.id == pid }?.url
            } else {
                TursoApiClient.resolveAbsoluteMediaUrl(raw)
            }
        }
    }
    val resolvedBannerUrl = remember(peer.bannerUrl, resolvedWallpaperUrl) {
        when {
            !peer.bannerUrl.isNullOrBlank() -> TursoApiClient.resolveAbsoluteMediaUrl(peer.bannerUrl)
            !resolvedWallpaperUrl.isNullOrBlank() -> resolvedWallpaperUrl
            else -> null
        }
    }
    val isSelf = sessionState.me?.id == peer.id

    val securityPair by produceState<Pair<String, String>?>(initialValue = null, peer.id) {
        if (!isSelf) value = vm.computePeerSecurityCode(peer.id)
    }

    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(24.dp))
                .background(palette.bgSecondary)
                .border(2.5.dp, colorSpec.ringColor, RoundedCornerShape(24.dp))
        ) {
            // Ambient Chat Wallpaper Tint across the Contact Profile Card!
            if (!resolvedWallpaperUrl.isNullOrBlank()) {
                AsyncImage(
                    model = resolvedWallpaperUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    alpha = 0.22f,
                    modifier = Modifier.matchParentSize(),
                )
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .background(palette.bgSecondary.copy(alpha = 0.78f))
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 560.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Box(modifier = Modifier.fillMaxWidth()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(126.dp)
                            .background(
                                Brush.linearGradient(
                                    listOf(
                                        colorSpec.ringColor.copy(alpha = 0.50f),
                                        palette.bgTertiary,
                                    )
                                )
                            )
                    ) {
                        if (!resolvedBannerUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = resolvedBannerUrl,
                                contentDescription = null,
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
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(Color(0x940A0A10))
                                .border(1.dp, Color(0x38FFFFFF), CircleShape)
                                .clickable { onDismiss() },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = "Close",
                                tint = Color(0xFFF2F2F7),
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }

                    Box(
                        modifier = Modifier
                            .padding(start = 18.dp, top = 80.dp)
                            .size(92.dp)
                            .clip(CircleShape)
                            .background(palette.bgSecondary),
                        contentAlignment = Alignment.Center,
                    ) {
                        JaAvatar(
                            avatarUrl = peer.avatarUrl,
                            displayName = peer.displayName.ifBlank { peer.username },
                            avatarColor = peer.avatarColor,
                            size = 84.dp,
                            ringWidth = 3.5.dp,
                        )
                    }
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(
                            text = peer.displayName.ifBlank { peer.username },
                            color = palette.textPrimary,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Black,
                        )
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "@${peer.username}",
                                color = palette.textSecondary,
                                fontSize = 13.5.sp,
                            )
                            if (peer.pronouns.isNotBlank()) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(palette.bgTertiary)
                                        .border(1.dp, palette.border, RoundedCornerShape(999.dp))
                                        .padding(horizontal = 9.dp, vertical = 2.dp),
                                ) {
                                    Text(
                                        text = peer.pronouns,
                                        color = palette.textSecondary,
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }
                        }
                    }

                    /* ---- Rich Markdown Bio (1:1 with `ProfileCard.tsx`) ---- */
                    if (peer.bio.isNotBlank()) {
                        RichMarkdownText(
                            text = peer.bio,
                            textColor = palette.textPrimary,
                            subTextColor = palette.textSecondary,
                            isLightSurface = !palette.isDark,
                            accentColor = palette.accent,
                            showLinkEmbeds = false,
                            fontSizeSp = 14f,
                        )
                    }

                    /* ---- 1:1 Web Socials & Website Section (`.profile-links-section`) ---- */
                    val validWebsite = peer.website?.takeIf { it.url.isNotBlank() }
                    val validSocials = peer.socials?.filter { it.url.isNotBlank() || it.handle.isNotBlank() }.orEmpty()

                    if (validWebsite != null || validSocials.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                            Text(
                                text = "LINKS & SOCIALS",
                                color = palette.textSecondary,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 0.6.sp,
                            )

                            validWebsite?.let { site ->
                                val cleanHost = remember(site.url) {
                                    runCatching { Uri.parse(site.url).host?.removePrefix("www.") }.getOrNull().orEmpty()
                                }
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .jaBouncyClick(pressedScale = 0.98f) {
                                            try {
                                                val href = if (site.url.startsWith("http")) site.url else "https://${site.url}"
                                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(href)))
                                            } catch (_: Throwable) {
                                            }
                                        }
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(palette.bgTertiary)
                                        .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                        .padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(34.dp)
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(palette.accentSoft),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        WebsiteGlobeVectorIcon(size = 18.dp, tint = palette.accent)
                                    }
                                    Spacer(Modifier.width(10.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = site.title.ifBlank { cleanHost.ifBlank { site.url } },
                                            color = palette.textPrimary,
                                            fontSize = 13.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        Text(
                                            text = cleanHost.ifBlank { site.url },
                                            color = palette.textSecondary,
                                            fontSize = 11.5.sp,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                    ExternalArrowVectorIcon(size = 14.dp, tint = palette.textSecondary)
                                }
                            }

                            validSocials.chunked(2).forEach { pair ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    pair.forEach { soc ->
                                        val meta = getSocialPlatformMeta(soc.platform)
                                        val handleOnlyDiscord = isHandleOnlyDiscord(soc.platform, soc.url)
                                        val displayHandle = soc.handle.ifBlank {
                                            soc.url.trimEnd('/').substringAfterLast('/')
                                        }
                                        Row(
                                            modifier = Modifier
                                                .weight(1f)
                                                .jaBouncyClick(pressedScale = 0.97f) {
                                                    if (handleOnlyDiscord) {
                                                        val cb = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                                                        cb?.setPrimaryClip(ClipData.newPlainText("Discord handle", displayHandle))
                                                        vm.showToast("Copied Discord handle: $displayHandle")
                                                    } else {
                                                        try {
                                                            val href = if (soc.url.startsWith("http")) soc.url else "https://${soc.url}"
                                                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(href)))
                                                        } catch (_: Throwable) {
                                                        }
                                                    }
                                                }
                                                .clip(RoundedCornerShape(14.dp))
                                                .background(palette.bgTertiary)
                                                .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                                .padding(horizontal = 10.dp, vertical = 9.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Box(
                                                modifier = Modifier
                                                    .size(30.dp)
                                                    .clip(RoundedCornerShape(9.dp))
                                                    .background(meta.brandTint.copy(alpha = 0.14f)),
                                                contentAlignment = Alignment.Center,
                                            ) {
                                                SocialBrandVectorIcon(
                                                    platformId = soc.platform,
                                                    size = 16.dp,
                                                    tint = if (!palette.isDark && meta.id in listOf("github", "x", "tiktok", "threads")) {
                                                        Color(0xFF111827)
                                                    } else {
                                                        meta.brandTint
                                                    },
                                                )
                                            }
                                            Spacer(Modifier.width(8.dp))
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    text = meta.label,
                                                    color = palette.textPrimary,
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    maxLines = 1,
                                                )
                                                Text(
                                                    text = displayHandle,
                                                    color = palette.textSecondary,
                                                    fontSize = 11.sp,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                )
                                            }
                                            if (handleOnlyDiscord) {
                                                Icon(
                                                    imageVector = Icons.Rounded.ContentCopy,
                                                    contentDescription = "Copy handle",
                                                    tint = palette.textSecondary,
                                                    modifier = Modifier.size(13.dp),
                                                )
                                            } else {
                                                ExternalArrowVectorIcon(size = 13.dp, tint = palette.textSecondary)
                                            }
                                        }
                                    }
                                    if (pair.size == 1) {
                                        Spacer(Modifier.weight(1f))
                                    }
                                }
                            }
                        }
                    }

                    // Compact E2EE Key Box with proper card outline (for peer profiles)!
                    if (!isSelf) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(palette.bgTertiary)
                                .border(1.dp, palette.border, RoundedCornerShape(14.dp))
                                .padding(horizontal = 12.dp, vertical = 10.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Rounded.Lock, null, tint = palette.accent, modifier = Modifier.size(15.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        text = "End-to-End Encrypted",
                                        color = palette.textPrimary,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.5.sp,
                                    )
                                }
                                Text(
                                    text = "Verify code",
                                    color = palette.accent,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 12.sp,
                                    modifier = Modifier.clickable {
                                        onDismiss()
                                        onOpenVerifySecurityCode()
                                    },
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = securityPair?.second ?: "Fetching P-256 identity key…",
                                color = palette.textSecondary,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * WhatsApp-style 60-Digit Verify Security Code Modal (zero vault/backup friction!).
 */
@Composable
fun VerifySecurityCodeDialog(
    peer: JaUser,
    vm: JaTextSessionViewModel,
    onDismiss: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val securityPair by produceState<Pair<String, String>?>(initialValue = null, peer.id) {
        value = vm.computePeerSecurityCode(peer.id)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.VerifiedUser, null, tint = palette.accent, modifier = Modifier.size(22.dp))
                Spacer(Modifier.width(8.dp))
                Text("Verify security code", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
        },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "Compare this 60-digit safety number with ${peer.displayName.ifBlank { peer.username }}. If the numbers match on both screens, your chat is 100% end-to-end encrypted.",
                    color = palette.textSecondary,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                )
                Spacer(Modifier.height(16.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(palette.bgSecondary)
                        .border(1.dp, palette.borderStrong, RoundedCornerShape(14.dp))
                        .padding(16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    val code = securityPair?.first
                    if (code.isNullOrBlank()) {
                        Text("Computing safety number…", color = palette.textSecondary, fontSize = 13.sp)
                    } else {
                        val groups = code.split(" ")
                        val rows = groups.chunked(4)
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            rows.forEach { row ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceEvenly,
                                ) {
                                    row.forEach { block ->
                                        Text(
                                            text = block,
                                            color = palette.textPrimary,
                                            fontFamily = FontFamily.Monospace,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 15.sp,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
            ) {
                Text("Done", color = Color.White)
            }
        }
    )
}

/**
 * Group Members, Group PFP Upload & Rename Modal (1:1 parity with Web Group Settings!).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupMembersBottomModal(
    details: GroupDetails,
    vm: JaTextSessionViewModel,
    onDismiss: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    var newName by remember(details.id, details.name) { mutableStateOf(details.name) }
    var pickedGroupAvatarUri by remember(details.id) { mutableStateOf<Uri?>(null) }
    val canEditGroup = details.myRole == "owner" || details.myRole == "admin"

    val groupAvatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            pickedGroupAvatarUri = uri
            vm.updateGroupProfile(groupId = details.id, newName = null, avatarUri = uri)
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier.then(
                        if (canEditGroup) Modifier.clickable { groupAvatarPicker.launch("image/*") } else Modifier
                    )
                ) {
                    JaGroupAvatar(
                        avatarUrl = pickedGroupAvatarUri?.toString() ?: details.avatarUrl,
                        name = newName.ifBlank { details.name },
                        size = 64.dp,
                        ringWidth = 3.dp,
                    )
                    if (canEditGroup) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .size(24.dp)
                                .clip(CircleShape)
                                .background(palette.accent)
                                .border(2.dp, palette.surface, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.CameraAlt,
                                contentDescription = "Change group photo",
                                tint = palette.accentDark,
                                modifier = Modifier.size(13.dp),
                            )
                        }
                    }
                }
                Spacer(Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = details.name,
                        color = palette.textPrimary,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 18.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = "${details.members.size} encrypted members",
                        color = palette.textSecondary,
                        fontSize = 12.5.sp,
                    )
                    if (canEditGroup) {
                        Spacer(Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(
                                text = "Change group photo",
                                color = palette.accent,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.clickable { groupAvatarPicker.launch("image/*") },
                            )
                            if (!details.avatarUrl.isNullOrBlank() || pickedGroupAvatarUri != null) {
                                Text(
                                    text = "Remove",
                                    color = palette.danger,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.clickable {
                                        pickedGroupAvatarUri = null
                                        vm.updateGroupProfile(groupId = details.id, newName = null, clearAvatar = true)
                                    },
                                )
                            }
                        }
                    }
                }
            }

            if (canEditGroup) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    JaWebInput(
                        value = newName,
                        onValueChange = { newName = it },
                        placeholder = "Group name",
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    JaWebPrimaryButton(
                        text = "Save",
                        enabled = newName.trim().isNotEmpty() && newName.trim() != details.name,
                        onClick = {
                            vm.updateGroupProfile(groupId = details.id, newName = newName.trim(), avatarUri = null)
                        },
                    )
                }
            }

            LazyColumn(
                modifier = Modifier.heightIn(max = 260.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(details.members, key = { it.id }) { m ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(palette.bgSecondary)
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        JaAvatar(m.avatarUrl, m.displayName.ifBlank { m.username }, m.avatarColor, size = 38.dp)
                        Spacer(Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(m.displayName.ifBlank { m.username }, color = palette.textPrimary, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Text("@${m.username}", color = palette.textSecondary, fontSize = 12.sp)
                        }
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(palette.accentSoft)
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(m.role.uppercase(), color = palette.accent, fontSize = 10.5.sp, fontWeight = FontWeight.ExtraBold)
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

/**
 * Comfortable, Spacious "Enable Call & Alert Permissions" Startup Modal
 * (shown ONLY when notification/mic/camera permissions are actually missing!).
 */
@Composable
fun EnableCallAndAlertPermissionsModal(
    onGrantClick: () -> Unit,
    onLaterClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    Dialog(onDismissRequest = onLaterClick) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(24.dp))
                .background(palette.surface)
                .border(1.dp, palette.borderStrong, RoundedCornerShape(24.dp))
                .padding(horizontal = 26.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(palette.accentSoft),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Rounded.NotificationsActive, null, tint = palette.accent, modifier = Modifier.size(28.dp))
            }
            Spacer(Modifier.height(18.dp))
            Text(
                text = "Enable Call & Alert Permissions",
                color = palette.textPrimary,
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = "Allow notifications, microphone, and camera access so JaText can wake your screen on incoming encrypted calls and deliver instant plaintext alerts.",
                color = palette.textSecondary,
                fontSize = 13.5.sp,
                textAlign = TextAlign.Center,
                lineHeight = 19.5.sp,
            )
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = onGrantClick,
                colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) {
                Text("Allow Permissions", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = onLaterClick) {
                Text("Maybe later", color = palette.textSecondary)
            }
        }
    }
}

/**
 * Mobile Post-Update Welcome Modal.
 */
@Composable
fun PostUpdateWelcomeDialog(onDismiss: () -> Unit) {
    val palette = LocalJaTextPalette.current
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp))
                .background(palette.bgSecondary)
                .border(1.dp, palette.border, RoundedCornerShape(22.dp))
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Image(
                painter = painterResource(id = R.drawable.jatext_logo_icon),
                contentDescription = "JaText",
                modifier = Modifier.size(54.dp),
            )
            Text(
                text = "Welcome to JaText v${BuildConfig.VERSION_NAME}!",
                color = palette.textPrimary,
                fontWeight = FontWeight.Black,
                fontSize = 19.sp,
                textAlign = TextAlign.Center,
            )
            Text(
                text = "You're now running JaText v${BuildConfig.VERSION_NAME} with all 24 vector mascot bubble styles, shared chat wallpapers that tint contact cards, rich media & video playback, Markdown bios, and 120 FPS transitions.",
                color = palette.textSecondary,
                fontSize = 13.5.sp,
                lineHeight = 19.5.sp,
                textAlign = TextAlign.Center,
            )
            JaWebPrimaryButton(
                text = "Let's go!",
                modifier = Modifier.fillMaxWidth(),
                onClick = onDismiss,
            )
        }
    }
}

/**
 * Global Mobile-Only "Update your JaText version!" Modal (`MobileUpdateGate.tsx` 1:1)!
 * Mounted at the root of `MainActivity` so it triggers immediately on ANY screen
 * (including Login, Onboarding, Sidebar, Chat, and Settings) whenever a newer APK is live!
 */
@Composable
fun MobileUpdatePromptModal(
    manifest: ApkVersionManifest,
    downloadingProgress: Int?,
    onInstallClick: () -> Unit,
    onLaterClick: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    val isDownloading = downloadingProgress != null
    Dialog(
        onDismissRequest = {
            if (!isDownloading) onLaterClick()
        },
        properties = DialogProperties(dismissOnBackPress = !isDownloading, dismissOnClickOutside = !isDownloading),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(24.dp))
                .background(Color(0xFF14141D))
                .border(1.5.dp, palette.accent.copy(alpha = 0.55f), RoundedCornerShape(24.dp))
                .padding(horizontal = 24.dp, vertical = 26.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Image(
                painter = painterResource(id = R.drawable.jatext_logo_icon),
                contentDescription = "JaText",
                modifier = Modifier.size(58.dp),
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(palette.accentSoft)
                    .border(1.dp, palette.accent.copy(alpha = 0.45f), RoundedCornerShape(999.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp),
            ) {
                Text(
                    text = "NEW RELEASE · v${manifest.versionName} (Build ${manifest.versionCode})",
                    color = palette.accent,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                )
            }
            Text(
                text = "Update your JaText version!",
                color = Color(0xFFF2F2F7),
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
            )
            Text(
                text = "A newer version of JaText is ready (installed: v${BuildConfig.VERSION_NAME}). Tap below to download and install the update directly inside the app.",
                color = Color(0xFF9A9AAD),
                fontSize = 13.5.sp,
                lineHeight = 19.5.sp,
                textAlign = TextAlign.Center,
            )

            if (isDownloading) {
                val pct = (downloadingProgress ?: 0).coerceIn(0, 100)
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = if (pct >= 100) "Launching Android installer…" else "Downloading update…",
                            color = Color(0xFFF2F2F7),
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "$pct%",
                            color = palette.accent,
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color(0xFF262633))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(fraction = (pct / 100f).coerceIn(0.03f, 1f))
                                .height(8.dp)
                                .clip(RoundedCornerShape(999.dp))
                                .background(palette.accent)
                        )
                    }
                }
            } else {
                Spacer(Modifier.height(4.dp))
                JaWebPrimaryButton(
                    text = "Update to v${manifest.versionName}",
                    modifier = Modifier.fillMaxWidth(),
                    onClick = onInstallClick,
                )
                JaWebGhostButton(
                    text = "Remind me later",
                    modifier = Modifier.fillMaxWidth(),
                    onClick = onLaterClick,
                )
            }
        }
    }
}
