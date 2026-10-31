package com.ahad00010.jatext.ui.screens

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.CallEnd
import androidx.compose.material.icons.rounded.Cameraswitch
import androidx.compose.material.icons.rounded.Close
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.ahad00010.jatext.BuildConfig
import com.ahad00010.jatext.data.GroupDetails
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.icons.OwnerCrownVectorBadge
import com.ahad00010.jatext.ui.theme.JaTextThemeManager
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import com.ahad00010.jatext.webrtc.NativeCallEngine
import kotlinx.coroutines.delay
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

    // Minimized Floating Call Pill
    if (callState.minimized && callState.phase != "dismissed") {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 14.dp, vertical = 8.dp),
            contentAlignment = Alignment.TopEnd,
        ) {
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0xFF10B981))
                    .clickable { callEngine.setMinimized(false) }
                    .padding(horizontal = 14.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Rounded.PhoneInTalk, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                val label = callState.peer?.displayName ?: callState.group?.name ?: "Active Call"
                Text(
                    text = "$label • %d:%02d".format(elapsedSec / 60, elapsedSec % 60),
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.5.sp,
                )
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
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(if (active) Color(0xFF2B3548) else Color(0xFF181E29))
            .border(1.dp, if (active) Color(0xFF10B981) else Color(0x28FFFFFF), CircleShape)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
    }
}

/**
 * Peer "View profile" Modal featuring Banner, Bio, Socials & Website,
 * and a compact E2EE Key Box with proper card outline + "Verify security code"!
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

    val securityPair by produceState<Pair<String, String>?>(initialValue = null, peer.id) {
        value = vm.computePeerSecurityCode(peer.id)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 8.dp)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Brush.linearGradient(JaTextThemeManager.avatarGradientColors(peer.avatarColor)))
            ) {
                if (!peer.bannerUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = peer.bannerUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                JaAvatar(peer.avatarUrl, peer.displayName.ifBlank { peer.username }, peer.avatarColor, size = 58.dp)
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = peer.displayName.ifBlank { peer.username },
                            color = palette.textPrimary,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        if (peer.isOwner) {
                            Spacer(Modifier.width(5.dp))
                            OwnerCrownVectorBadge(size = 15.dp)
                        }
                    }
                    Text(
                        text = buildString {
                            append("@${peer.username}")
                            if (peer.pronouns.isNotBlank()) append(" • ${peer.pronouns}")
                        },
                        color = palette.textSecondary,
                        fontSize = 13.sp,
                    )
                }
            }

            if (peer.bio.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                Text(peer.bio, color = palette.textPrimary, fontSize = 14.sp, lineHeight = 19.sp)
            }

            peer.website?.takeIf { it.url.isNotBlank() }?.let { site ->
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(palette.bgSecondary)
                        .clickable {
                            try {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(site.url)))
                            } catch (_: Throwable) {
                            }
                        }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(site.title.ifBlank { site.url }, color = palette.accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.width(6.dp))
                    Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, tint = palette.accent, modifier = Modifier.size(14.dp))
                }
            }

            if (!peer.socials.isNullOrEmpty()) {
                Spacer(Modifier.height(10.dp))
                peer.socials.forEach { soc ->
                    Text(
                        text = "${soc.platform}: ${soc.handle.ifBlank { soc.url }}",
                        color = palette.textSecondary,
                        fontSize = 12.5.sp,
                        modifier = Modifier
                            .padding(vertical = 2.dp)
                            .clickable {
                                if (soc.url.startsWith("http")) {
                                    try {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(soc.url)))
                                    } catch (_: Throwable) {
                                    }
                                }
                            }
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            // Compact E2EE Key Box with proper card outline!
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(palette.bgSecondary)
                    .border(1.dp, palette.borderStrong, RoundedCornerShape(12.dp))
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
                        Text("End-to-End Encrypted", color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }
                    Text(
                        text = "Verify code",
                        color = palette.accent,
                        fontWeight = FontWeight.Bold,
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

            Spacer(Modifier.height(18.dp))
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
 * Group Members & Rename Modal.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupMembersBottomModal(
    details: GroupDetails,
    vm: JaTextSessionViewModel,
    onDismiss: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    var newName by remember(details.id) { mutableStateOf(details.name) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 10.dp)
        ) {
            Text(details.name, color = palette.textPrimary, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text("${details.members.size} encrypted members", color = palette.textSecondary, fontSize = 12.5.sp)
            Spacer(Modifier.height(12.dp))

            if (details.myRole == "owner" || details.myRole == "admin") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = newName,
                        onValueChange = { newName = it },
                        label = { Text("Rename group") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = { vm.renameGroup(details.id, newName) },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                    ) {
                        Text("Save", color = Color.White)
                    }
                }
                Spacer(Modifier.height(12.dp))
            }

            LazyColumn(modifier = Modifier.height(240.dp)) {
                items(details.members, key = { it.id }) { m ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        JaAvatar(m.avatarUrl, m.displayName.ifBlank { m.username }, m.avatarColor, size = 38.dp)
                        Spacer(Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(m.displayName.ifBlank { m.username }, color = palette.textPrimary, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Text("@${m.username}", color = palette.textSecondary, fontSize = 12.sp)
                        }
                        Text(m.role.uppercase(), color = palette.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
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
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = palette.surface,
        title = {
            Text(
                text = "Welcome to JaText v${BuildConfig.VERSION_NAME}!",
                color = palette.textPrimary,
                fontWeight = FontWeight.Bold,
            )
        },
        text = {
            Text(
                text = "JaText Android is now 100% Pure Native Jetpack Compose (zero WebView!) with native 120Hz GPU scrolling, in-app Google Sign-In, instant offline caching, and full E2EE + WebRTC parity.",
                color = palette.textSecondary,
                fontSize = 13.5.sp,
                lineHeight = 19.sp,
            )
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
            ) {
                Text("Let's go!", color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
    )
}
