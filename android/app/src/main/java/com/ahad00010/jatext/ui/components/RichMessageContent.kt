package com.ahad00010.jatext.ui.components

import android.content.Intent
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.net.Uri
import android.widget.VideoView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.ClickableText
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Forward
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Fullscreen
import androidx.compose.material.icons.rounded.FullscreenExit
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.InsertDriveFile
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PhoneCallback
import androidx.compose.material.icons.rounded.PhoneForwarded
import androidx.compose.material.icons.rounded.PhoneMissed
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Poll
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.VolumeOff
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.isUnspecified
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import com.ahad00010.jatext.crypto.JaTextCryptoEngine
import com.ahad00010.jatext.data.CallInvitePayload
import com.ahad00010.jatext.data.CommunityPoll
import com.ahad00010.jatext.data.EncryptedBlobDescriptor
import com.ahad00010.jatext.data.ForwardedMessageContext
import com.ahad00010.jatext.data.GroupCallInvitePayload
import com.ahad00010.jatext.data.GroupSeenReader
import com.ahad00010.jatext.data.JaTextJson
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.LinkPreviewData
import com.ahad00010.jatext.data.MessageReaction
import com.ahad00010.jatext.data.ReplySummary
import com.ahad00010.jatext.data.TursoApiClient
import com.ahad00010.jatext.media.VoiceNoteMusicDetector
import com.ahad00010.jatext.ui.theme.JaTextPalette
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

private val URL_REGEX = Regex("""https?://[^\s<>)\]]+""")
private val IMAGE_EXT_REGEX = Regex("""\.(png|jpe?g|gif|webp|avif|bmp)(\?|#|$|\s)""", RegexOption.IGNORE_CASE)
private val VIDEO_EXT_REGEX = Regex("""\.(mp4|m4v|mov|webm|mkv|3gp)(\?|#|$|\s)""", RegexOption.IGNORE_CASE)
private val AUDIO_EXT_REGEX = Regex("""\.(m4a|mp3|wav|ogg|oga|opus|aac|flac)(\?|#|$|\s)""", RegexOption.IGNORE_CASE)

/* ==================== Call Invite Parsers & 1:1 Call Event Cards (`CallMessageCard.tsx`) ==================== */

fun parseDmCallInvitePayload(rawBody: String?): CallInvitePayload? {
    if (rawBody.isNullOrBlank()) return null
    val trimmed = JaTextCryptoEngine.stripBubbleStyleFromText(rawBody).trim()
    val jsonPart = when {
        trimmed.startsWith(JaTextCryptoEngine.CALL_INVITE_PREFIX) ->
            trimmed.removePrefix(JaTextCryptoEngine.CALL_INVITE_PREFIX).trim()
        trimmed.startsWith("**JATEXT_CALL**:") ->
            trimmed.removePrefix("**JATEXT_CALL**:").trim()
        trimmed.startsWith("**JATEXT:CALL**") ->
            trimmed.removePrefix("**JATEXT:CALL**").trimStart(':', ' ')
        else -> return null
    }
    return try {
        JaTextJson.decodeFromString<CallInvitePayload>(jsonPart)
    } catch (_: Throwable) {
        CallInvitePayload(callId = "legacy", mode = if (jsonPart.contains("video", true)) "video" else "voice", state = "ended")
    }
}

fun parseGroupCallInvitePayload(rawBody: String?): GroupCallInvitePayload? {
    if (rawBody.isNullOrBlank()) return null
    val trimmed = JaTextCryptoEngine.stripBubbleStyleFromText(rawBody).trim()
    val jsonPart = when {
        trimmed.startsWith(JaTextCryptoEngine.GROUP_CALL_INVITE_PREFIX) ->
            trimmed.removePrefix(JaTextCryptoEngine.GROUP_CALL_INVITE_PREFIX).trim()
        trimmed.startsWith("**JATEXT_CALL_GRP**:") ->
            trimmed.removePrefix("**JATEXT_CALL_GRP**:").trim()
        else -> return null
    }
    return try {
        JaTextJson.decodeFromString<GroupCallInvitePayload>(jsonPart)
    } catch (_: Throwable) {
        GroupCallInvitePayload(callId = "legacy-grp", state = if (jsonPart.contains("ended", true)) "ended" else "active")
    }
}

private fun formatCallDurationLabel(sec: Int): String {
    if (sec <= 0) return "0s"
    val h = sec / 3600
    val m = (sec % 3600) / 60
    val s = sec % 60
    return when {
        h > 0 -> "${h}h ${m}m"
        m > 0 -> "${m}m ${s}s"
        else -> "${s}s"
    }
}

/**
 * 1:1 port of `src/components/CallMessageCard.tsx` so `__JATEXT_CALL__:` renders a polished Call Card UI instead of raw text!
 */
@Composable
fun CallMessageCardUi(
    invite: CallInvitePayload,
    isMine: Boolean,
    isLiveThisCall: Boolean,
    palette: JaTextPalette,
    onActionClick: () -> Unit,
) {
    val ageMs = if (invite.ts > 0L) System.currentTimeMillis() - invite.ts else 120_000L
    val effectiveState = when {
        isLiveThisCall -> invite.state
        invite.state == "connected" -> "ended"
        invite.state == "ringing" && (isMine || ageMs > 50_000L) -> "missed"
        else -> invite.state
    }
    val isMissedOrDeclined = effectiveState == "missed" || effectiveState == "declined"

    val title = if (invite.mode == "video") {
        if (isMissedOrDeclined) {
            if (isMine) "Unanswered video call" else "Missed video call"
        } else {
            "Video call"
        }
    } else {
        if (isMissedOrDeclined) {
            if (isMine) "Unanswered voice call" else "Missed voice call"
        } else {
            "Voice call"
        }
    }

    val subtitle = when {
        isLiveThisCall -> "Tap to return to active call"
        effectiveState == "ringing" -> if (isMine) "Ringing..." else "Incoming call..."
        effectiveState == "connected" -> "In progress"
        effectiveState == "declined" -> "Declined"
        effectiveState == "missed" -> if (isMine) "No answer" else "Tap to call back"
        invite.durationSec != null && invite.durationSec > 0 -> formatCallDurationLabel(invite.durationSec)
        else -> "Call ended"
    }

    val badgeColor = when {
        isLiveThisCall -> Color(0xFF22C55E)
        isMissedOrDeclined -> Color(0xFFEF4444)
        else -> palette.accent
    }
    val iconVec = when {
        invite.mode == "video" -> Icons.Rounded.Videocam
        isMissedOrDeclined -> Icons.Rounded.PhoneMissed
        isMine -> Icons.Rounded.PhoneForwarded
        else -> Icons.Rounded.PhoneCallback
    }
    val actionLabel = when {
        isLiveThisCall -> "Open"
        isMissedOrDeclined && !isMine -> "Call back"
        else -> "Call"
    }

    Row(
        modifier = Modifier
            .widthIn(min = 235.dp, max = 305.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(palette.surfaceElevated)
            .border(
                width = 1.dp,
                color = if (isLiveThisCall) Color(0xFF22C55E).copy(alpha = 0.55f)
                else if (isMissedOrDeclined) Color(0xFFEF4444).copy(alpha = 0.42f)
                else palette.border,
                shape = RoundedCornerShape(18.dp),
            )
            .jaBouncyClick(pressedScale = 0.98f, onClick = onActionClick)
            .padding(horizontal = 13.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(badgeColor.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = iconVec,
                contentDescription = title,
                tint = badgeColor,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.width(11.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = palette.textPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subtitle,
                color = if (isMissedOrDeclined) Color(0xFFFCA5A5) else palette.textSecondary,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(if (isLiveThisCall) Color(0xFF22C55E) else palette.accent)
                .padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = if (invite.mode == "video") Icons.Rounded.Videocam else Icons.Rounded.Call,
                contentDescription = null,
                tint = if (isLiveThisCall) Color(0xFF052E16) else palette.accentDark,
                modifier = Modifier.size(14.dp),
            )
            Spacer(Modifier.width(5.dp))
            Text(
                text = actionLabel,
                color = if (isLiveThisCall) Color(0xFF052E16) else palette.accentDark,
                fontSize = 12.sp,
                fontWeight = FontWeight.ExtraBold,
            )
        }
    }
}

@Composable
fun GroupCallMessageCardUi(
    invite: GroupCallInvitePayload,
    isLiveThisCall: Boolean,
    palette: JaTextPalette,
    onJoinOrCall: () -> Unit,
) {
    val isEnded = !isLiveThisCall && (invite.state == "ended" || (invite.ts > 0L && System.currentTimeMillis() - invite.ts > 3_600_000L))
    val title = if (isEnded) "GC VC Ended" else if (invite.mode == "video") "Group video call" else "Group voice call"
    val subtitle = when {
        isLiveThisCall -> "Active right now · Tap to open"
        isEnded -> invite.durationSec?.takeIf { it > 0 }?.let { "Ended · ${formatCallDurationLabel(it)}" } ?: "Voice channel ended"
        invite.hostName.isNotBlank() -> "Started by ${invite.hostName}"
        else -> "Tap to join voice channel"
    }
    val badgeColor = if (isEnded) palette.textTertiary else Color(0xFF22C55E)

    Row(
        modifier = Modifier
            .widthIn(min = 240.dp, max = 310.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(palette.surfaceElevated)
            .border(1.dp, if (!isEnded) Color(0xFF22C55E).copy(alpha = 0.45f) else palette.border, RoundedCornerShape(18.dp))
            .jaBouncyClick(pressedScale = 0.98f, onClick = onJoinOrCall)
            .padding(horizontal = 13.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(badgeColor.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (invite.mode == "video") Icons.Rounded.Videocam else Icons.Rounded.Call,
                contentDescription = title,
                tint = badgeColor,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.width(11.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = palette.textPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
            Text(
                text = subtitle,
                color = palette.textSecondary,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(if (!isEnded) Color(0xFF22C55E) else palette.accent)
                .padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = when {
                    isLiveThisCall -> "Open"
                    isEnded -> "Start"
                    else -> "Join"
                },
                color = if (!isEnded) Color(0xFF052E16) else palette.accentDark,
                fontSize = 12.sp,
                fontWeight = FontWeight.ExtraBold,
            )
        }
    }
}

/* ==================== Forwarded Context & Reply Banner ==================== */

@Composable
fun ForwardedContextCardUi(
    contextCard: ForwardedMessageContext,
    myUserId: String,
    knownGroupIds: Set<String>,
    knownFriendIds: Set<String>,
    ink: ResolvedBubbleColors,
    onJumpToOriginal: (ForwardedMessageContext) -> Unit,
) {
    val canJump = when (contextCard.sourceKind) {
        "community" -> true
        "group" -> contextCard.groupId != null && knownGroupIds.contains(contextCard.groupId)
        "dm" -> {
            val ids = contextCard.dmUserIds.orEmpty()
            val peer = ids.firstOrNull { it != myUserId }
            ids.contains(myUserId) && peer != null && knownFriendIds.contains(peer)
        }
        else -> false
    }
    val dateStr = remember(contextCard.originalCreatedAt) {
        SimpleDateFormat("MMM d, yyyy 'at' h:mm a", Locale.getDefault())
            .format(Date(contextCard.originalCreatedAt))
    }
    val cardBg = if (ink.isLightSurface) Color(0x14000000) else Color(0x24000000)
    val cardBorder = if (ink.isLightSurface) Color(0x29000000) else Color(0x38FFFFFF)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 6.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(cardBg)
            .border(1.dp, cardBorder, RoundedCornerShape(12.dp))
            .then(
                if (canJump) Modifier.clickable { onJumpToOriginal(contextCard) } else Modifier
            )
            .padding(horizontal = 10.dp, vertical = 7.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.Forward,
                contentDescription = "Forwarded",
                tint = ink.subTextColor,
                modifier = Modifier.size(14.dp),
            )
            Spacer(Modifier.width(5.dp))
            Text(
                text = "Forwarded from ${contextCard.originalSenderName}",
                color = ink.textColor,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        val labelText = contextCard.sourceLabel.ifBlank {
            when (contextCard.sourceKind) {
                "community" -> "JaText Community"
                "group" -> contextCard.groupName ?: "Group Chat"
                else -> "Direct Message"
            }
        }
        Text(
            text = "$labelText  ·  $dateStr",
            color = ink.subTextColor,
            fontSize = 10.5.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (canJump) {
            Text(
                text = "Tap to view original message",
                color = ink.textColor.copy(alpha = 0.85f),
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
fun ReplyQuoteBannerUi(
    reply: ReplySummary,
    ink: ResolvedBubbleColors,
    onJump: (String) -> Unit,
) {
    val barBg = if (ink.isLightSurface) Color(0x14000000) else Color(0x24000000)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 6.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(barBg)
            .clickable { onJump(reply.id) }
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(28.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(ink.textColor.copy(alpha = 0.72f))
        )
        Spacer(Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = reply.senderName.orEmpty().ifBlank { "Message" },
                color = ink.textColor,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
            Text(
                text = reply.body.ifBlank { reply.attachmentName ?: "Attachment" },
                color = ink.subTextColor,
                fontSize = 11.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/* ==================== Native Voice Note Player ==================== */

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NativeVoiceNoteBubblePlayer(
    attachmentUrl: String,
    attachmentType: String? = null,
    encryptedAttachment: EncryptedBlobDescriptor?,
    ink: ResolvedBubbleColors,
    showTranscript: Boolean = false,
    onHideTranscript: (() -> Unit)? = null,
    onLongPressMessage: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    var resolvedFile by remember(attachmentUrl, encryptedAttachment?.h) { mutableStateOf<File?>(null) }
    var loadingFile by remember(attachmentUrl) { mutableStateOf(true) }
    var bars by remember(attachmentUrl) { mutableStateOf(List(32) { i -> 0.24f + ((i * 5) % 6) * 0.12f }) }
    var transcriptLabel by remember(attachmentUrl) { mutableStateOf<String?>(null) }
    var transcribing by remember(attachmentUrl) { mutableStateOf(false) }

    var isPlaying by remember { mutableStateOf(false) }
    var durationMs by remember { mutableIntStateOf(0) }
    var positionMs by remember { mutableIntStateOf(0) }
    var progress by remember { mutableFloatStateOf(0f) }
    var playerRef by remember { mutableStateOf<MediaPlayer?>(null) }

    LaunchedEffect(attachmentUrl, encryptedAttachment?.h) {
        loadingFile = true
        val file = when {
            attachmentUrl.startsWith("file://") -> Uri.parse(attachmentUrl).path?.let { File(it) }
            attachmentUrl.startsWith("content://") -> withContext(Dispatchers.IO) {
                try {
                    val tmp = File(context.cacheDir, "vn_tmp_${attachmentUrl.hashCode()}.m4a")
                    context.contentResolver.openInputStream(Uri.parse(attachmentUrl))?.use { inp ->
                        tmp.outputStream().use { out -> inp.copyTo(out) }
                    }
                    tmp.takeIf { it.exists() && it.length() > 0L }
                } catch (_: Throwable) {
                    null
                }
            }
            else -> JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(
                context,
                TursoApiClient.resolveAbsoluteMediaUrl(attachmentUrl),
                encryptedAttachment
            )
        }
        resolvedFile = file
        loadingFile = false
        if (file != null && file.exists()) {
            try {
                val mmr = MediaMetadataRetriever()
                mmr.setDataSource(file.absolutePath)
                durationMs = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toIntOrNull() ?: 0
                mmr.release()
            } catch (_: Throwable) {
            }
            bars = VoiceNoteMusicDetector.buildWaveformSamples(file, bars = 32)
        }
    }

    // Strictly on-demand transcription ONLY when user holds down voice note -> clicks "Transcribe"
    LaunchedEffect(showTranscript, resolvedFile) {
        if (!showTranscript) return@LaunchedEffect
        if (!transcriptLabel.isNullOrBlank()) return@LaunchedEffect
        val file = resolvedFile ?: return@LaunchedEffect
        if (!file.exists()) return@LaunchedEffect
        transcribing = true
        val rawHint = encryptedAttachment?.mt ?: attachmentType
        transcriptLabel = VoiceNoteMusicDetector.transcribeVoiceNoteOnDemand(context, file, rawHint)
        transcribing = false
    }

    LaunchedEffect(isPlaying, playerRef) {
        while (isPlaying && playerRef != null) {
            try {
                val mp = playerRef ?: break
                if (mp.isPlaying) {
                    positionMs = mp.currentPosition
                    durationMs = mp.duration.coerceAtLeast(1)
                    progress = (positionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
                }
            } catch (_: Throwable) {
            }
            delay(70L)
        }
    }

    DisposableEffect(attachmentUrl) {
        onDispose {
            try {
                playerRef?.stop()
            } catch (_: Throwable) {
            }
            try {
                playerRef?.release()
            } catch (_: Throwable) {
            }
            playerRef = null
        }
    }

    val fgInk = ink.voiceNoteInkColor
    val trackUnplayed = fgInk.copy(alpha = 0.30f)
    val btnBg = fgInk.copy(alpha = 0.14f)

    Column(
        modifier = Modifier
            .widthIn(min = 215.dp, max = 275.dp)
            .then(
                if (onLongPressMessage != null) {
                    Modifier.combinedClickable(
                        onClick = {},
                        onLongClick = onLongPressMessage,
                    )
                } else {
                    Modifier
                }
            )
            .padding(vertical = 2.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .jaBouncyClick(enabled = !loadingFile && resolvedFile != null, pressedScale = 0.91f) {
                        val file = resolvedFile ?: return@jaBouncyClick
                        val current = playerRef
                        if (current != null && isPlaying) {
                            current.pause()
                            isPlaying = false
                        } else if (current != null) {
                            current.start()
                            isPlaying = true
                        } else {
                            try {
                                val mp = MediaPlayer().apply {
                                    setDataSource(file.absolutePath)
                                    prepare()
                                    durationMs = duration.coerceAtLeast(1)
                                    setOnCompletionListener {
                                        isPlaying = false
                                        progress = 0f
                                        positionMs = 0
                                    }
                                    start()
                                }
                                playerRef = mp
                                isPlaying = true
                            } catch (_: Throwable) {
                            }
                        }
                    }
                    .clip(CircleShape)
                    .background(btnBg),
                contentAlignment = Alignment.Center,
            ) {
                if (loadingFile) {
                    CircularProgressIndicator(
                        color = fgInk,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp),
                    )
                } else {
                    Icon(
                        imageVector = if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        contentDescription = if (isPlaying) "Pause voice note" else "Play voice note",
                        tint = fgInk,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }

            Spacer(Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Canvas(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(26.dp)
                ) {
                    val count = bars.size.coerceAtLeast(1)
                    val gap = 2.5.dp.toPx()
                    val barW = ((size.width - gap * (count - 1)) / count).coerceAtLeast(2f)
                    for (i in 0 until count) {
                        val ratio = i.toFloat() / count.toFloat()
                        val h = (size.height * bars[i].coerceIn(0.16f, 1f)).coerceAtLeast(4f)
                        val y = (size.height - h) / 2f
                        drawRoundRect(
                            color = if (ratio <= progress) fgInk else trackUnplayed,
                            topLeft = Offset(i * (barW + gap), y),
                            size = Size(barW, h),
                            cornerRadius = CornerRadius(barW / 2f, barW / 2f),
                        )
                    }
                }
                Spacer(Modifier.height(3.dp))
                val shownSec = ((if (isPlaying || positionMs > 0) positionMs else durationMs) / 1000).coerceAtLeast(0)
                Text(
                    text = "%d:%02d".format(shownSec / 60, shownSec % 60),
                    color = fgInk.copy(alpha = 0.85f),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }

        if (showTranscript) {
            Spacer(Modifier.height(7.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(11.dp))
                    .background(fgInk.copy(alpha = 0.10f))
                    .border(1.dp, fgInk.copy(alpha = 0.18f), RoundedCornerShape(11.dp))
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Rounded.GraphicEq,
                            contentDescription = null,
                            tint = fgInk.copy(alpha = 0.85f),
                            modifier = Modifier.size(13.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = "Transcription",
                            color = fgInk.copy(alpha = 0.9f),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    if (onHideTranscript != null) {
                        Text(
                            text = "Hide transcribe",
                            color = fgInk,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(fgInk.copy(alpha = 0.14f))
                                .clickable { onHideTranscript() }
                                .padding(horizontal = 8.dp, vertical = 3.dp),
                        )
                    }
                }
                Text(
                    text = when {
                        transcribing || loadingFile -> "Transcribing voice note..."
                        !transcriptLabel.isNullOrBlank() -> transcriptLabel!!
                        else -> "No clear speech detected in this voice note."
                    },
                    color = fgInk,
                    fontSize = 12.5.sp,
                    fontStyle = if (transcribing) FontStyle.Italic else FontStyle.Normal,
                )
            }
        }
    }
}

/* ==================== Inline Native Video Attachment Player + Fullscreen ==================== */

@Composable
fun InlineVideoAttachmentPlayer(
    attachmentUrl: String,
    attachmentName: String?,
    encryptedAttachment: EncryptedBlobDescriptor?,
    ink: ResolvedBubbleColors,
) {
    val context = LocalContext.current
    var resolvedFile by remember(attachmentUrl, encryptedAttachment?.h) { mutableStateOf<File?>(null) }
    var loading by remember(attachmentUrl, encryptedAttachment?.h) { mutableStateOf(true) }
    var thumbBitmap by remember(attachmentUrl, encryptedAttachment?.h) { mutableStateOf<Bitmap?>(null) }
    var durationSec by remember(attachmentUrl, encryptedAttachment?.h) { mutableIntStateOf(0) }
    var playingInline by remember(attachmentUrl, encryptedAttachment?.h) { mutableStateOf(false) }
    var fullscreenOpen by remember(attachmentUrl, encryptedAttachment?.h) { mutableStateOf(false) }
    var savedPositionMs by remember(attachmentUrl, encryptedAttachment?.h) { mutableIntStateOf(0) }
    var isMuted by remember(attachmentUrl, encryptedAttachment?.h) { mutableStateOf(false) }
    var playbackSpeed by remember(attachmentUrl, encryptedAttachment?.h) { mutableFloatStateOf(1f) }

    LaunchedEffect(attachmentUrl, encryptedAttachment?.h) {
        loading = true
        val file = when {
            attachmentUrl.startsWith("file://") -> Uri.parse(attachmentUrl).path?.let { File(it) }
            attachmentUrl.startsWith("content://") -> withContext(Dispatchers.IO) {
                try {
                    val tmp = File(context.cacheDir, "vid_tmp_${attachmentUrl.hashCode()}.mp4")
                    if (!tmp.exists() || tmp.length() == 0L) {
                        context.contentResolver.openInputStream(Uri.parse(attachmentUrl))?.use { inp ->
                            tmp.outputStream().use { out -> inp.copyTo(out) }
                        }
                    }
                    tmp.takeIf { it.exists() && it.length() > 0L }
                } catch (_: Throwable) {
                    null
                }
            }
            else -> JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(
                context,
                TursoApiClient.resolveAbsoluteMediaUrl(attachmentUrl),
                encryptedAttachment
            )
        }
        resolvedFile = file
        if (file != null && file.exists()) {
            withContext(Dispatchers.IO) {
                try {
                    val mmr = MediaMetadataRetriever()
                    mmr.setDataSource(file.absolutePath)
                    val durMs = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
                    durationSec = (durMs / 1000L).toInt()
                    thumbBitmap = mmr.getFrameAtTime(0L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                    mmr.release()
                } catch (_: Throwable) {
                }
            }
        }
        loading = false
    }

    Box(
        modifier = Modifier
            .padding(bottom = 4.dp)
            .widthIn(min = 228.dp, max = 278.dp)
            .height(192.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFF0E0F16)),
        contentAlignment = Alignment.Center,
    ) {
        when {
            loading -> {
                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.2.dp,
                    modifier = Modifier.size(26.dp),
                )
            }
            resolvedFile != null && playingInline && !fullscreenOpen -> {
                JaTextControlledVideoSurface(
                    videoFile = resolvedFile!!,
                    title = attachmentName ?: encryptedAttachment?.n,
                    initialDurationSec = durationSec,
                    initialPositionMs = savedPositionMs,
                    isFullscreen = false,
                    isMuted = isMuted,
                    onToggleMute = { isMuted = !isMuted },
                    playbackSpeed = playbackSpeed,
                    onCycleSpeed = {
                        playbackSpeed = nextVideoPlaybackSpeed(playbackSpeed)
                    },
                    onPositionUpdate = { pos -> savedPositionMs = pos },
                    onToggleFullscreen = { pos ->
                        savedPositionMs = pos
                        playingInline = false
                        fullscreenOpen = true
                    },
                    onCloseFullscreen = null,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            resolvedFile != null -> {
                thumbBitmap?.let { bmp ->
                    Image(
                        bitmap = bmp.asImageBitmap(),
                        contentDescription = attachmentName ?: "Video",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color(0x26000000),
                                    Color(0x38000000),
                                    Color(0xB806070C),
                                )
                            )
                        )
                        .clickable { playingInline = true }
                )
                Box(
                    modifier = Modifier
                        .size(50.dp)
                        .jaBouncyClick(pressedScale = 0.92f) { playingInline = true }
                        .clip(CircleShape)
                        .background(Color(0xBB10121B))
                        .border(1.5.dp, Color(0x66FFFFFF), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.PlayArrow,
                        contentDescription = "Play video",
                        tint = Color.White,
                        modifier = Modifier.size(28.dp),
                    )
                }

                // Bottom preview bar with play icon, progress preview & duration + fullscreen toggle
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                ) {
                    val previewDurMs = (durationSec * 1000).coerceAtLeast(1)
                    val previewFrac = if (durationSec > 0) {
                        (savedPositionMs.toFloat() / previewDurMs.toFloat()).coerceIn(0f, 1f)
                    } else 0f
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(3.5.dp)
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color(0x55FFFFFF))
                    ) {
                        if (previewFrac > 0f) {
                            Box(
                                modifier = Modifier
                                    .fillMaxHeight()
                                    .fillMaxWidth(previewFrac)
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(Color(0xFF3897F0))
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = if (durationSec > 0) {
                                "${formatVideoClockMs(savedPositionMs)} / ${formatVideoClockMs(durationSec * 1000)}"
                            } else {
                                "0:00"
                            },
                            color = Color.White,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            fontFamily = FontFamily.Monospace,
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(26.dp)
                                    .clip(CircleShape)
                                    .background(Color(0x88000000))
                                    .clickable { isMuted = !isMuted },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = if (isMuted) Icons.Rounded.VolumeOff else Icons.Rounded.VolumeUp,
                                    contentDescription = if (isMuted) "Unmute video" else "Mute video",
                                    tint = Color.White,
                                    modifier = Modifier.size(15.dp),
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .size(26.dp)
                                    .clip(CircleShape)
                                    .background(Color(0x88000000))
                                    .clickable { fullscreenOpen = true },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Fullscreen,
                                    contentDescription = "Fullscreen",
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                    }
                }
            }
            else -> {
                Text(
                    text = "Unable to load video",
                    color = ink.subTextColor,
                    fontSize = 12.sp,
                )
            }
        }
    }

    if (fullscreenOpen && resolvedFile != null) {
        val file = resolvedFile!!
        Dialog(
            onDismissRequest = { fullscreenOpen = false },
            properties = DialogProperties(
                usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false,
            ),
        ) {
            JaTextControlledVideoSurface(
                videoFile = file,
                title = attachmentName ?: encryptedAttachment?.n,
                initialDurationSec = durationSec,
                initialPositionMs = savedPositionMs,
                isFullscreen = true,
                isMuted = isMuted,
                onToggleMute = { isMuted = !isMuted },
                playbackSpeed = playbackSpeed,
                onCycleSpeed = {
                    playbackSpeed = nextVideoPlaybackSpeed(playbackSpeed)
                },
                onPositionUpdate = { pos -> savedPositionMs = pos },
                onToggleFullscreen = { pos ->
                    savedPositionMs = pos
                    fullscreenOpen = false
                },
                onCloseFullscreen = { pos ->
                    savedPositionMs = pos
                    fullscreenOpen = false
                },
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFA05060A)),
            )
        }
    }
}

private fun nextVideoPlaybackSpeed(current: Float): Float = when {
    current < 0.7f -> 1f
    current < 1.1f -> 1.25f
    current < 1.4f -> 1.5f
    current < 1.8f -> 2f
    else -> 0.5f
}

private fun formatVideoSpeedLabel(speed: Float): String = when {
    speed == 0.5f -> "0.5x"
    speed == 1.25f -> "1.25x"
    speed == 1.5f -> "1.5x"
    speed == 2f -> "2x"
    else -> "1x"
}

private fun formatVideoClockMs(ms: Int): String {
    val totalSec = (ms.coerceAtLeast(0) / 1000)
    val hrs = totalSec / 3600
    val mins = (totalSec % 3600) / 60
    val secs = totalSec % 60
    return if (hrs > 0) {
        "%d:%02d:%02d".format(hrs, mins, secs)
    } else {
        "%d:%02d".format(mins, secs)
    }
}

@Composable
private fun JaTextControlledVideoSurface(
    videoFile: File,
    title: String?,
    initialDurationSec: Int,
    initialPositionMs: Int,
    isFullscreen: Boolean,
    isMuted: Boolean,
    onToggleMute: () -> Unit,
    playbackSpeed: Float,
    onCycleSpeed: () -> Unit,
    onPositionUpdate: (Int) -> Unit,
    onToggleFullscreen: (Int) -> Unit,
    onCloseFullscreen: ((Int) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    var videoViewRef by remember { mutableStateOf<VideoView?>(null) }
    var mediaPlayerRef by remember { mutableStateOf<MediaPlayer?>(null) }
    var isPlaying by remember { mutableStateOf(true) }
    var durationMs by remember { mutableIntStateOf((initialDurationSec * 1000).coerceAtLeast(0)) }
    var positionMs by remember { mutableIntStateOf(initialPositionMs.coerceAtLeast(0)) }
    var isScrubbing by remember { mutableStateOf(false) }
    var scrubFraction by remember { mutableFloatStateOf(0f) }
    var controlsVisible by remember { mutableStateOf(true) }
    var interactionTick by remember { mutableIntStateOf(0) }

    val bumpInteraction = {
        controlsVisible = true
        interactionTick += 1
    }

    val seekToPosition = { targetMs: Int ->
        val safeMax = durationMs.coerceAtLeast(1)
        val clamped = targetMs.coerceIn(0, safeMax)
        positionMs = clamped
        onPositionUpdate(clamped)
        try {
            val mp = mediaPlayerRef
            if (mp != null && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                mp.seekTo(clamped.toLong(), MediaPlayer.SEEK_CLOSEST)
            } else {
                videoViewRef?.seekTo(clamped)
            }
        } catch (_: Throwable) {
            try {
                videoViewRef?.seekTo(clamped)
            } catch (_: Throwable) {
            }
        }
    }

    val togglePlayPause = {
        bumpInteraction()
        val vv = videoViewRef
        if (vv != null) {
            if (vv.isPlaying) {
                vv.pause()
                isPlaying = false
                onPositionUpdate(vv.currentPosition.coerceAtLeast(0))
            } else {
                if (durationMs > 0 && positionMs >= durationMs - 200) {
                    seekToPosition(0)
                }
                vv.start()
                isPlaying = true
                mediaPlayerRef?.let { mp ->
                    try {
                        mp.playbackParams = mp.playbackParams.setSpeed(playbackSpeed)
                    } catch (_: Throwable) {
                    }
                }
            }
        }
    }

    LaunchedEffect(isMuted, mediaPlayerRef) {
        val vol = if (isMuted) 0f else 1f
        try {
            mediaPlayerRef?.setVolume(vol, vol)
        } catch (_: Throwable) {
        }
    }

    LaunchedEffect(playbackSpeed, mediaPlayerRef, isPlaying) {
        if (isPlaying) {
            try {
                mediaPlayerRef?.let { mp ->
                    mp.playbackParams = mp.playbackParams.setSpeed(playbackSpeed)
                }
            } catch (_: Throwable) {
            }
        }
    }

    // Live 60/10Hz playback playhead tracker
    LaunchedEffect(videoViewRef, isPlaying, isScrubbing) {
        while (isPlaying && !isScrubbing) {
            val vv = videoViewRef
            if (vv != null) {
                try {
                    val dur = vv.duration
                    if (dur > 0) durationMs = dur
                    val cur = vv.currentPosition.coerceAtLeast(0)
                    positionMs = if (durationMs > 0) cur.coerceAtMost(durationMs) else cur
                    onPositionUpdate(positionMs)
                } catch (_: Throwable) {
                }
            }
            delay(80L)
        }
    }

    // Auto-hide controls after 3.2s of uninterrupted playback
    LaunchedEffect(controlsVisible, isPlaying, isScrubbing, interactionTick) {
        if (controlsVisible && isPlaying && !isScrubbing) {
            delay(3200L)
            if (isPlaying && !isScrubbing) {
                controlsVisible = false
            }
        }
    }

    DisposableEffect(videoFile.absolutePath) {
        onDispose {
            try {
                val cur = videoViewRef?.currentPosition ?: positionMs
                if (cur > 0) onPositionUpdate(cur)
                videoViewRef?.stopPlayback()
            } catch (_: Throwable) {
            }
            mediaPlayerRef = null
            videoViewRef = null
        }
    }

    val effectiveDuration = durationMs.coerceAtLeast(1)
    val displayFraction = if (isScrubbing) {
        scrubFraction.coerceIn(0f, 1f)
    } else if (durationMs > 0) {
        (positionMs.toFloat() / effectiveDuration.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }
    val displayPositionMs = if (isScrubbing && durationMs > 0) {
        (scrubFraction * durationMs).toInt().coerceIn(0, durationMs)
    } else {
        positionMs
    }

    Box(
        modifier = modifier.clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
        ) {
            if (controlsVisible && isPlaying) {
                controlsVisible = false
            } else {
                bumpInteraction()
            }
        },
        contentAlignment = Alignment.Center,
    ) {
        AndroidView(
            factory = { ctx ->
                VideoView(ctx).apply {
                    videoViewRef = this
                    setVideoPath(videoFile.absolutePath)
                    setOnPreparedListener { mp ->
                        mediaPlayerRef = mp
                        mp.isLooping = false
                        val dur = mp.duration
                        if (dur > 0) durationMs = dur
                        val vol = if (isMuted) 0f else 1f
                        try {
                            mp.setVolume(vol, vol)
                        } catch (_: Throwable) {
                        }
                        if (initialPositionMs > 0 && (dur <= 0 || initialPositionMs < dur - 250)) {
                            try {
                                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                                    mp.seekTo(initialPositionMs.toLong(), MediaPlayer.SEEK_CLOSEST)
                                } else {
                                    seekTo(initialPositionMs)
                                }
                            } catch (_: Throwable) {
                            }
                        }
                        start()
                        isPlaying = true
                        if (playbackSpeed != 1f) {
                            try {
                                mp.playbackParams = mp.playbackParams.setSpeed(playbackSpeed)
                            } catch (_: Throwable) {
                            }
                        }
                    }
                    setOnCompletionListener {
                        isPlaying = false
                        if (durationMs > 0) {
                            positionMs = durationMs
                        }
                        onPositionUpdate(0)
                        controlsVisible = true
                    }
                }
            },
            modifier = if (isFullscreen) Modifier.fillMaxWidth() else Modifier.fillMaxSize(),
        )

        AnimatedVisibility(
            visible = controlsVisible || !isPlaying || isScrubbing,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize(),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color(0x8804050A),
                                Color(0x1804050A),
                                Color(0x1804050A),
                                Color(0xCC04050A),
                            )
                        )
                    )
            ) {
                // Top action bar
                Row(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .fillMaxWidth()
                        .padding(
                            horizontal = if (isFullscreen) 16.dp else 8.dp,
                            vertical = if (isFullscreen) 28.dp else 6.dp,
                        ),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    if (isFullscreen && !title.isNullOrBlank()) {
                        Text(
                            text = title,
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier
                                .weight(1f, fill = false)
                                .padding(end = 10.dp)
                                .clip(RoundedCornerShape(999.dp))
                                .background(Color(0x9912141E))
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    } else {
                        Spacer(Modifier.width(1.dp))
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(if (isFullscreen) 8.dp else 5.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(Color(0xAA12141E))
                                .border(0.8.dp, Color(0x38FFFFFF), RoundedCornerShape(999.dp))
                                .clickable {
                                    bumpInteraction()
                                    onCycleSpeed()
                                }
                                .padding(
                                    horizontal = if (isFullscreen) 10.dp else 7.dp,
                                    vertical = if (isFullscreen) 6.dp else 3.dp,
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = formatVideoSpeedLabel(playbackSpeed),
                                color = Color.White,
                                fontSize = if (isFullscreen) 12.sp else 10.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }

                        Box(
                            modifier = Modifier
                                .size(if (isFullscreen) 36.dp else 28.dp)
                                .clip(CircleShape)
                                .background(Color(0xAA12141E))
                                .border(0.8.dp, Color(0x38FFFFFF), CircleShape)
                                .clickable {
                                    bumpInteraction()
                                    onToggleMute()
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = if (isMuted) Icons.Rounded.VolumeOff else Icons.Rounded.VolumeUp,
                                contentDescription = if (isMuted) "Unmute video" else "Mute video",
                                tint = Color.White,
                                modifier = Modifier.size(if (isFullscreen) 19.dp else 15.dp),
                            )
                        }

                        if (isFullscreen && onCloseFullscreen != null) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xAA12141E))
                                    .border(0.8.dp, Color(0x38FFFFFF), CircleShape)
                                    .clickable { onCloseFullscreen(positionMs) },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Close,
                                    contentDescription = "Close fullscreen video",
                                    tint = Color.White,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        } else {
                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xAA12141E))
                                    .border(0.8.dp, Color(0x38FFFFFF), CircleShape)
                                    .clickable { onToggleFullscreen(positionMs) },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Fullscreen,
                                    contentDescription = "Fullscreen video",
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                    }
                }

                // Center transport controls (Play/Pause + Fullscreen -10s / +10s)
                Row(
                    modifier = Modifier.align(Alignment.Center),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(22.dp),
                ) {
                    if (isFullscreen) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(Color(0xAA12141E))
                                .border(1.dp, Color(0x40FFFFFF), RoundedCornerShape(999.dp))
                                .jaBouncyClick(pressedScale = 0.92f) {
                                    bumpInteraction()
                                    seekToPosition(positionMs - 10_000)
                                }
                                .padding(horizontal = 13.dp, vertical = 8.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "-10s",
                                color = Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }

                    Box(
                        modifier = Modifier
                            .size(if (isFullscreen) 58.dp else 42.dp)
                            .jaBouncyClick(pressedScale = 0.90f) { togglePlayPause() }
                            .clip(CircleShape)
                            .background(Color(0xC610121B))
                            .border(1.4.dp, Color(0x66FFFFFF), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            contentDescription = if (isPlaying) "Pause video" else "Play video",
                            tint = Color.White,
                            modifier = Modifier.size(if (isFullscreen) 32.dp else 24.dp),
                        )
                    }

                    if (isFullscreen) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(Color(0xAA12141E))
                                .border(1.dp, Color(0x40FFFFFF), RoundedCornerShape(999.dp))
                                .jaBouncyClick(pressedScale = 0.92f) {
                                    bumpInteraction()
                                    seekToPosition(positionMs + 10_000)
                                }
                                .padding(horizontal = 13.dp, vertical = 8.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "+10s",
                                color = Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }

                // Bottom controller bar + scrubbable progress bar!
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(
                            horizontal = if (isFullscreen) 18.dp else 8.dp,
                            vertical = if (isFullscreen) 26.dp else 6.dp,
                        ),
                ) {
                    JaTextVideoScrubBar(
                        progress = displayFraction,
                        isScrubbing = isScrubbing,
                        isFullscreen = isFullscreen,
                        onScrubStart = { frac ->
                            isScrubbing = true
                            scrubFraction = frac
                            bumpInteraction()
                        },
                        onScrubChange = { frac ->
                            isScrubbing = true
                            scrubFraction = frac
                            bumpInteraction()
                            if (durationMs > 0) {
                                val target = (frac * durationMs).toInt().coerceIn(0, durationMs)
                                positionMs = target
                            }
                        },
                        onScrubEnd = { frac ->
                            if (durationMs > 0) {
                                seekToPosition((frac * durationMs).toInt())
                            }
                            isScrubbing = false
                            bumpInteraction()
                        },
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(if (isFullscreen) 30.dp else 22.dp)
                                    .clip(CircleShape)
                                    .clickable { togglePlayPause() },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                                    contentDescription = if (isPlaying) "Pause" else "Play",
                                    tint = Color.White,
                                    modifier = Modifier.size(if (isFullscreen) 20.dp else 16.dp),
                                )
                            }
                            Text(
                                text = "${formatVideoClockMs(displayPositionMs)} / ${formatVideoClockMs(durationMs)}",
                                color = Color.White,
                                fontSize = if (isFullscreen) 12.5.sp else 10.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                fontFamily = FontFamily.Monospace,
                            )
                        }

                        if (isFullscreen) {
                            Box(
                                modifier = Modifier
                                    .size(30.dp)
                                    .clip(CircleShape)
                                    .clickable { onToggleFullscreen(positionMs) },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.FullscreenExit,
                                    contentDescription = "Exit fullscreen",
                                    tint = Color.White,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun JaTextVideoScrubBar(
    progress: Float,
    isScrubbing: Boolean,
    isFullscreen: Boolean,
    onScrubStart: (Float) -> Unit,
    onScrubChange: (Float) -> Unit,
    onScrubEnd: (Float) -> Unit,
) {
    val clamped = progress.coerceIn(0f, 1f)
    var dragFraction by remember { mutableFloatStateOf(clamped) }
    val thumbScale by animateFloatAsState(
        targetValue = if (isScrubbing) 1.32f else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "videoThumbScale",
    )

    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(if (isFullscreen) 28.dp else 22.dp)
            .pointerInput(Unit) {
                detectTapGestures { offset ->
                    val width = size.width.toFloat().coerceAtLeast(1f)
                    val frac = (offset.x / width).coerceIn(0f, 1f)
                    dragFraction = frac
                    onScrubStart(frac)
                    onScrubEnd(frac)
                }
            }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragStart = { startOffset ->
                        val width = size.width.toFloat().coerceAtLeast(1f)
                        val frac = (startOffset.x / width).coerceIn(0f, 1f)
                        dragFraction = frac
                        onScrubStart(frac)
                    },
                    onHorizontalDrag = { change, _ ->
                        change.consume()
                        val width = size.width.toFloat().coerceAtLeast(1f)
                        val frac = (change.position.x / width).coerceIn(0f, 1f)
                        dragFraction = frac
                        onScrubChange(frac)
                    },
                    onDragEnd = {
                        onScrubEnd(dragFraction)
                    },
                    onDragCancel = {
                        onScrubEnd(dragFraction)
                    },
                )
            }
    ) {
        if (size.isUnspecified || size.width <= 0f || size.height <= 0f) return@Canvas
        val trackHeight = (if (isScrubbing) 6.dp else 4.dp).toPx()
        val thumbRadius = (if (isFullscreen) 7.dp else 5.5.dp).toPx() * thumbScale
        val padX = thumbRadius.coerceAtMost(size.width * 0.1f)
        val usableWidth = (size.width - padX * 2f).coerceAtLeast(1f)
        val centerY = size.height / 2f
        val topY = centerY - trackHeight / 2f
        val corner = CornerRadius(trackHeight / 2f, trackHeight / 2f)

        // Background track
        drawRoundRect(
            color = Color(0x58FFFFFF),
            topLeft = Offset(padX, topY),
            size = Size(usableWidth, trackHeight),
            cornerRadius = corner,
        )

        // Filled progress track
        val activeW = (usableWidth * clamped).coerceIn(0f, usableWidth)
        if (activeW > 0f) {
            drawRoundRect(
                color = Color(0xFF3897F0),
                topLeft = Offset(padX, topY),
                size = Size(activeW, trackHeight),
                cornerRadius = corner,
            )
        }

        // Scrub thumb with subtle halo
        val thumbX = padX + activeW
        if (isScrubbing) {
            drawCircle(
                color = Color(0xFF3897F0).copy(alpha = 0.32f),
                radius = thumbRadius * 1.65f,
                center = Offset(thumbX, centerY),
            )
        }
        drawCircle(
            color = Color.White,
            radius = thumbRadius,
            center = Offset(thumbX, centerY),
        )
    }
}

/* ==================== Unified Media Attachment Dispatcher ==================== */

fun isMessageAudioVoiceNote(
    attachmentUrl: String?,
    attachmentName: String?,
    attachmentType: String?,
    encryptedAttachment: EncryptedBlobDescriptor?,
): Boolean {
    if (attachmentUrl.isNullOrBlank()) return false
    val rawMime = (encryptedAttachment?.mt ?: attachmentType.orEmpty()).lowercase()
    val cleanMime = rawMime.substringBefore(";").trim()
    val hint = "${encryptedAttachment?.n.orEmpty()} ${attachmentName.orEmpty()} $attachmentUrl"
    return cleanMime.startsWith("audio/") || AUDIO_EXT_REGEX.containsMatchIn(hint)
}

fun isMessageImageAttachment(
    attachmentUrl: String?,
    attachmentName: String?,
    attachmentType: String?,
    encryptedAttachment: EncryptedBlobDescriptor?,
): Boolean {
    if (attachmentUrl.isNullOrBlank()) return false
    val rawMime = (encryptedAttachment?.mt ?: attachmentType.orEmpty()).lowercase()
    val cleanMime = rawMime.substringBefore(";").trim()
    val hint = "${encryptedAttachment?.n.orEmpty()} ${attachmentName.orEmpty()} $attachmentUrl"
    val isAudio = cleanMime.startsWith("audio/") || AUDIO_EXT_REGEX.containsMatchIn(hint)
    val isVideo = !isAudio && (cleanMime.startsWith("video/") || VIDEO_EXT_REGEX.containsMatchIn(hint))
    return !isAudio && !isVideo && (cleanMime.startsWith("image/") || IMAGE_EXT_REGEX.containsMatchIn(hint))
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MessageMediaAttachmentView(
    attachmentUrl: String,
    attachmentName: String?,
    attachmentType: String?,
    encryptedAttachment: EncryptedBlobDescriptor?,
    ink: ResolvedBubbleColors,
    onOpenImageFullscreen: (Any) -> Unit,
    showTranscript: Boolean = false,
    onHideTranscript: (() -> Unit)? = null,
    onLongPressMessage: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val rawMime = (encryptedAttachment?.mt ?: attachmentType.orEmpty()).lowercase()
    val cleanMime = rawMime.substringBefore(";").trim()
    val nameAndUrlHint = "${encryptedAttachment?.n.orEmpty()} ${attachmentName.orEmpty()} $attachmentUrl"

    val isAudio = cleanMime.startsWith("audio/") || AUDIO_EXT_REGEX.containsMatchIn(nameAndUrlHint)
    val isVideo = !isAudio && (cleanMime.startsWith("video/") || VIDEO_EXT_REGEX.containsMatchIn(nameAndUrlHint))
    val isImage = !isAudio && !isVideo && (cleanMime.startsWith("image/") || IMAGE_EXT_REGEX.containsMatchIn(nameAndUrlHint))

    if (isAudio) {
        NativeVoiceNoteBubblePlayer(
            attachmentUrl = attachmentUrl,
            attachmentType = attachmentType,
            encryptedAttachment = encryptedAttachment,
            ink = ink,
            showTranscript = showTranscript,
            onHideTranscript = onHideTranscript,
            onLongPressMessage = onLongPressMessage,
        )
        return
    }

    if (isVideo) {
        InlineVideoAttachmentPlayer(
            attachmentUrl = attachmentUrl,
            attachmentName = encryptedAttachment?.n ?: attachmentName,
            encryptedAttachment = encryptedAttachment,
            ink = ink,
        )
        return
    }

    val isLocalUri = attachmentUrl.startsWith("content://") || attachmentUrl.startsWith("file://")
    val absUrl = remember(attachmentUrl) {
        if (isLocalUri) attachmentUrl else TursoApiClient.resolveAbsoluteMediaUrl(attachmentUrl)
    }

    val modelState by produceState<Any?>(
        initialValue = if (encryptedAttachment == null) (if (isLocalUri) Uri.parse(attachmentUrl) else absUrl) else null,
        absUrl,
        encryptedAttachment?.h,
    ) {
        value = when {
            isLocalUri -> Uri.parse(attachmentUrl)
            encryptedAttachment == null -> absUrl
            else -> JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(context, absUrl, encryptedAttachment)
        }
    }

    if (isImage) {
        Box(
            modifier = Modifier
                .padding(bottom = 4.dp)
                .widthIn(min = 140.dp, max = 265.dp)
                .heightIn(min = 96.dp, max = 285.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0x1F000000))
                .combinedClickable(
                    enabled = modelState != null,
                    onClick = { modelState?.let { onOpenImageFullscreen(it) } },
                    onLongClick = { onLongPressMessage?.invoke() },
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (modelState == null) {
                CircularProgressIndicator(
                    color = ink.textColor,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(24.dp),
                )
            } else {
                AsyncImage(
                    model = modelState,
                    contentDescription = encryptedAttachment?.n ?: attachmentName ?: "Image",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    } else {
        val boxBg = if (ink.isLightSurface) Color(0x14000000) else Color(0x24000000)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 4.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(boxBg)
                .clickable {
                    try {
                        when (val target = modelState) {
                            is File -> {
                                val fileUri = FileProvider.getUriForFile(
                                    context,
                                    "${context.packageName}.fileprovider",
                                    target
                                )
                                val viewIntent = Intent(Intent.ACTION_VIEW).apply {
                                    setDataAndType(fileUri, cleanMime.ifBlank { "*/*" })
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }
                                context.startActivity(viewIntent)
                            }
                            is String -> {
                                if (target.startsWith("http")) {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target)))
                                }
                            }
                            is Uri -> {
                                val viewIntent = Intent(Intent.ACTION_VIEW, target).apply {
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }
                                context.startActivity(viewIntent)
                            }
                        }
                    } catch (_: Throwable) {
                    }
                }
                .padding(11.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Rounded.InsertDriveFile,
                contentDescription = null,
                tint = ink.textColor,
                modifier = Modifier.size(22.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = encryptedAttachment?.n ?: attachmentName ?: "Attachment",
                color = ink.textColor,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.OpenInNew,
                contentDescription = "Open",
                tint = ink.subTextColor,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

/* ==================== Rich Markdown Parser + OpenGraph Link Embed WITH Image (`LinkEmbeds.tsx`) ==================== */

private val INLINE_TOKEN_RE = Regex(
    """(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\n]+\*)|(\[([^\]]+)\]\((https?://[^\s)]+)\))|(https?://[^\s<>)\]]+)|(@[a-zA-Z0-9._]{2,24})"""
)

private fun buildMarkdownAnnotatedLine(
    raw: String,
    textColor: Color,
    codeBgColor: Color,
    linkColor: Color,
): AnnotatedString = buildAnnotatedString {
    var cursor = 0
    for (m in INLINE_TOKEN_RE.findAll(raw)) {
        if (m.range.first < cursor) continue
        if (m.range.first > cursor) {
            append(raw.substring(cursor, m.range.first))
        }
        val token = m.value
        when {
            m.groups[1] != null -> {
                withStyle(
                    SpanStyle(
                        fontFamily = FontFamily.Monospace,
                        background = codeBgColor,
                        color = textColor,
                        fontSize = 13.sp,
                    )
                ) {
                    append(" ${token.substring(1, token.length - 1)} ")
                }
            }
            m.groups[2] != null || m.groups[3] != null -> {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = textColor)) {
                    append(token.substring(2, token.length - 2))
                }
            }
            m.groups[4] != null -> {
                withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough, color = textColor.copy(alpha = 0.85f))) {
                    append(token.substring(2, token.length - 2))
                }
            }
            m.groups[5] != null -> {
                withStyle(SpanStyle(fontStyle = FontStyle.Italic, color = textColor)) {
                    append(token.substring(1, token.length - 1))
                }
            }
            m.groups[6] != null -> {
                val label = m.groups[7]?.value.orEmpty()
                val url = m.groups[8]?.value.orEmpty()
                pushStringAnnotation(tag = "URL", annotation = url)
                withStyle(
                    SpanStyle(
                        color = linkColor,
                        fontWeight = FontWeight.SemiBold,
                        textDecoration = TextDecoration.Underline,
                    )
                ) {
                    append(label)
                }
                pop()
            }
            m.groups[9] != null -> {
                pushStringAnnotation(tag = "URL", annotation = token)
                withStyle(
                    SpanStyle(
                        color = linkColor,
                        fontWeight = FontWeight.SemiBold,
                        textDecoration = TextDecoration.Underline,
                    )
                ) {
                    append(token)
                }
                pop()
            }
            m.groups[10] != null -> {
                withStyle(
                    SpanStyle(
                        color = textColor,
                        fontWeight = FontWeight.Bold,
                        background = textColor.copy(alpha = 0.14f),
                    )
                ) {
                    append(token)
                }
            }
        }
        cursor = m.range.last + 1
    }
    if (cursor < raw.length) {
        append(raw.substring(cursor))
    }
}

private sealed class MarkdownBlockNode {
    data class Paragraph(val text: String, val headingLevel: Int = 0) : MarkdownBlockNode()
    data class Quote(val text: String) : MarkdownBlockNode()
    data class ListItem(val bullet: String, val text: String) : MarkdownBlockNode()
    data class CodeFence(val lang: String, val code: String) : MarkdownBlockNode()
}

private fun parseMarkdownBlocks(text: String): List<MarkdownBlockNode> {
    val lines = text.split('\n')
    val out = mutableListOf<MarkdownBlockNode>()
    var i = 0
    while (i < lines.size) {
        val line = lines[i]
        val trimmed = line.trimStart()
        if (trimmed.startsWith("```")) {
            val lang = trimmed.removePrefix("```").trim()
            val codeBuf = StringBuilder()
            i++
            while (i < lines.size && !lines[i].trimStart().startsWith("```")) {
                if (codeBuf.isNotEmpty()) codeBuf.append('\n')
                codeBuf.append(lines[i])
                i++
            }
            out.add(MarkdownBlockNode.CodeFence(lang, codeBuf.toString()))
            i++
            continue
        }
        when {
            trimmed.startsWith("### ") -> out.add(MarkdownBlockNode.Paragraph(trimmed.removePrefix("### "), headingLevel = 3))
            trimmed.startsWith("## ") -> out.add(MarkdownBlockNode.Paragraph(trimmed.removePrefix("## "), headingLevel = 2))
            trimmed.startsWith("# ") -> out.add(MarkdownBlockNode.Paragraph(trimmed.removePrefix("# "), headingLevel = 1))
            trimmed.startsWith("> ") || trimmed == ">" -> out.add(MarkdownBlockNode.Quote(trimmed.removePrefix(">").trimStart()))
            trimmed.startsWith("- ") || trimmed.startsWith("* ") ->
                out.add(MarkdownBlockNode.ListItem("•", trimmed.substring(2)))
            Regex("""^\d+\.\s+""").containsMatchIn(trimmed) -> {
                val prefix = trimmed.substringBefore(' ')
                val rest = trimmed.substringAfter(' ').trimStart()
                out.add(MarkdownBlockNode.ListItem(prefix, rest))
            }
            else -> out.add(MarkdownBlockNode.Paragraph(line))
        }
        i++
    }
    return out
}

private fun parseHexThemeColor(hex: String?, fallback: Color): Color {
    if (hex.isNullOrBlank()) return fallback
    return try {
        val clean = hex.trim().removePrefix("#")
        if (clean.length == 6) {
            Color((0xFF000000L or clean.toLong(16)).toInt())
        } else {
            fallback
        }
    } catch (_: Throwable) {
        fallback
    }
}

/**
 * Full Markdown + Mention + Link + OpenGraph Image Embed renderer (used for messages AND user bios!).
 */
private fun sanitizeInternalTextBeforeMarkdown(raw: String): String {
    val clean = JaTextCryptoEngine.stripBubbleStyleFromText(raw)
    JaTextCryptoEngine.parseWallpaperSignal(clean, null)?.let { wp ->
        val actor = wp.actorName?.takeIf { it.isNotBlank() }
        val action = if (wp.kind == "none") "cleared the chat wallpaper" else "changed the chat wallpaper"
        return if (actor != null) "$actor $action" else action.replaceFirstChar { it.uppercase() }
    }
    if (clean.startsWith(JaTextCryptoEngine.WALLPAPER_PREFIX)) {
        return "Updated chat wallpaper"
    }
    return clean
}

@Composable
fun RichMarkdownText(
    text: String,
    textColor: Color,
    subTextColor: Color,
    isLightSurface: Boolean,
    accentColor: Color,
    showLinkEmbeds: Boolean = true,
    fontSizeSp: Float = 14.5f,
    onNonLinkTap: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val safeText = remember(text) { sanitizeInternalTextBeforeMarkdown(text) }
    val blocks = remember(safeText) { parseMarkdownBlocks(safeText) }
    val firstUrl = remember(safeText, showLinkEmbeds) {
        if (showLinkEmbeds) URL_REGEX.find(safeText)?.value else null
    }
    val codeBg = if (isLightSurface) Color(0x18000000) else Color(0x2E000000)
    val linkTint = if (isLightSurface) textColor else textColor

    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        blocks.forEach { block ->
            when (block) {
                is MarkdownBlockNode.CodeFence -> {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (isLightSurface) Color(0x16000000) else Color(0x38000000))
                            .border(1.dp, textColor.copy(alpha = 0.14f), RoundedCornerShape(10.dp))
                            .padding(horizontal = 10.dp, vertical = 8.dp)
                    ) {
                        if (block.lang.isNotEmpty()) {
                            Text(
                                text = block.lang,
                                color = subTextColor,
                                fontSize = 10.5.sp,
                                fontWeight = FontWeight.Bold,
                            )
                            Spacer(Modifier.height(2.dp))
                        }
                        Text(
                            text = block.code,
                            color = textColor,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 12.5.sp,
                            lineHeight = 17.sp,
                        )
                    }
                }
                is MarkdownBlockNode.Quote -> {
                    val ann = remember(block.text, textColor, codeBg) {
                        buildMarkdownAnnotatedLine(block.text, textColor, codeBg, linkTint)
                    }
                    Row(
                        modifier = Modifier
                            .height(IntrinsicSize.Min)
                            .padding(vertical = 1.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .width(3.dp)
                                .fillMaxHeight()
                                .clip(RoundedCornerShape(2.dp))
                                .background(textColor.copy(alpha = 0.50f))
                        )
                        Spacer(Modifier.width(8.dp))
                        @Suppress("DEPRECATION")
                        ClickableText(
                            text = ann,
                            style = TextStyle(
                                color = subTextColor,
                                fontSize = fontSizeSp.sp,
                                fontStyle = FontStyle.Italic,
                                lineHeight = (fontSizeSp + 5.5f).sp,
                            ),
                            onClick = { offset ->
                                val urlAnn = ann.getStringAnnotations("URL", offset, offset).firstOrNull()
                                if (urlAnn != null) {
                                    try {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(urlAnn.item)))
                                    } catch (_: Throwable) {
                                    }
                                } else {
                                    onNonLinkTap?.invoke()
                                }
                            }
                        )
                    }
                }
                is MarkdownBlockNode.ListItem -> {
                    val ann = remember(block.text, textColor, codeBg) {
                        buildMarkdownAnnotatedLine(block.text, textColor, codeBg, linkTint)
                    }
                    Row(verticalAlignment = Alignment.Top) {
                        Text(
                            text = "${block.bullet} ",
                            color = textColor,
                            fontSize = fontSizeSp.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        @Suppress("DEPRECATION")
                        ClickableText(
                            text = ann,
                            style = TextStyle(
                                color = textColor,
                                fontSize = fontSizeSp.sp,
                                lineHeight = (fontSizeSp + 5.5f).sp,
                            ),
                            modifier = Modifier.weight(1f),
                            onClick = { offset ->
                                val urlAnn = ann.getStringAnnotations("URL", offset, offset).firstOrNull()
                                if (urlAnn != null) {
                                    try {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(urlAnn.item)))
                                    } catch (_: Throwable) {
                                    }
                                } else {
                                    onNonLinkTap?.invoke()
                                }
                            }
                        )
                    }
                }
                is MarkdownBlockNode.Paragraph -> {
                    if (block.text.isEmpty()) {
                        Spacer(Modifier.height(4.dp))
                    } else {
                        val ann = remember(block.text, textColor, codeBg) {
                            buildMarkdownAnnotatedLine(block.text, textColor, codeBg, linkTint)
                        }
                        val sizeSp = when (block.headingLevel) {
                            1 -> fontSizeSp + 4f
                            2 -> fontSizeSp + 2.5f
                            3 -> fontSizeSp + 1f
                            else -> fontSizeSp
                        }
                        @Suppress("DEPRECATION")
                        ClickableText(
                            text = ann,
                            style = TextStyle(
                                color = textColor,
                                fontSize = sizeSp.sp,
                                fontWeight = if (block.headingLevel > 0) FontWeight.ExtraBold else FontWeight.Normal,
                                lineHeight = (sizeSp + 5.5f).sp,
                            ),
                            onClick = { offset ->
                                val urlAnn = ann.getStringAnnotations("URL", offset, offset).firstOrNull()
                                if (urlAnn != null) {
                                    try {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(urlAnn.item)))
                                    } catch (_: Throwable) {
                                    }
                                } else {
                                    onNonLinkTap?.invoke()
                                }
                            }
                        )
                    }
                }
            }
        }

        if (firstUrl != null) {
            val preview by produceState<LinkPreviewData?>(initialValue = null, firstUrl) {
                value = TursoApiClient.fetchLinkPreview(firstUrl)
            }
            preview?.takeIf { it.hasEmbed && (!it.title.isNullOrBlank() || !it.effectiveImageUrl.isNullOrBlank()) }?.let { lp ->
                Spacer(Modifier.height(6.dp))
                val cardBg = if (isLightSurface) Color(0x14000000) else Color(0x28000000)
                val stripeColor = parseHexThemeColor(lp.themeColor, accentColor)
                val imgUrl = lp.effectiveImageUrl?.let { TursoApiClient.resolveAbsoluteMediaUrl(it) }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(IntrinsicSize.Min)
                        .clip(RoundedCornerShape(14.dp))
                        .background(cardBg)
                        .border(1.dp, textColor.copy(alpha = 0.14f), RoundedCornerShape(14.dp))
                        .clickable {
                            try {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(lp.url.ifBlank { firstUrl })))
                            } catch (_: Throwable) {
                            }
                        }
                ) {
                    Box(
                        modifier = Modifier
                            .width(4.dp)
                            .fillMaxHeight()
                            .background(stripeColor)
                    )
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .padding(10.dp)
                    ) {
                        val hostLabel = lp.siteName?.takeIf { it.isNotBlank() }
                            ?: lp.domain?.takeIf { it.isNotBlank() }
                            ?: runCatching { Uri.parse(firstUrl).host?.removePrefix("www.") }.getOrNull()
                        if (!hostLabel.isNullOrBlank()) {
                            Text(
                                text = hostLabel,
                                color = subTextColor,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                            )
                            Spacer(Modifier.height(2.dp))
                        }
                        if (!lp.title.isNullOrBlank()) {
                            Text(
                                text = lp.title,
                                color = textColor,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        if (!lp.description.isNullOrBlank()) {
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = lp.description,
                                color = subTextColor,
                                fontSize = 11.5.sp,
                                lineHeight = 15.5.sp,
                                maxLines = 3,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        if (!imgUrl.isNullOrBlank()) {
                            Spacer(Modifier.height(8.dp))
                            AsyncImage(
                                model = imgUrl,
                                contentDescription = lp.title ?: "Link preview",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 110.dp, max = 168.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(Color(0x1F000000)),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun RichTextWithLinksAndMentions(
    text: String,
    ink: ResolvedBubbleColors,
    palette: JaTextPalette,
    onLongPressMessage: (() -> Unit)? = null,
) {
    RichMarkdownText(
        text = text,
        textColor = ink.textColor,
        subTextColor = ink.subTextColor,
        isLightSurface = ink.isLightSurface,
        accentColor = palette.accent,
        showLinkEmbeds = true,
        fontSizeSp = 14.5f,
        onNonLinkTap = onLongPressMessage,
    )
}

/* ==================== Community Polls, Reactions & Group "Seen by" Avatars ==================== */

@Composable
fun CommunityPollCardUi(
    question: String,
    poll: CommunityPoll,
    canManage: Boolean,
    ink: ResolvedBubbleColors,
    onVote: (Int) -> Unit,
    onEndPoll: () -> Unit,
    onViewVoters: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp)
    ) {
        if (question.isNotBlank()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Rounded.Poll,
                    contentDescription = null,
                    tint = ink.textColor,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = question,
                    color = ink.textColor,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.height(8.dp))
        }
        val total = poll.totalVotes.coerceAtLeast(1)
        val showResults = poll.endedAt != null || poll.myVote != null

        poll.options.forEachIndexed { idx, opt ->
            val count = poll.counts.getOrElse(idx) { 0 }
            val pctFloat = if (poll.totalVotes == 0) 0f else (count.toFloat() / total.toFloat()).coerceIn(0f, 1f)
            val animatedPct by animateFloatAsState(
                targetValue = if (showResults) pctFloat else 0f,
                animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                label = "pollBarPct",
            )
            val pct = (pctFloat * 100f).toInt()
            val selected = poll.myVote == idx

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 3.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(ink.textColor.copy(alpha = 0.08f))
                    .border(
                        width = if (selected) 1.5.dp else 1.dp,
                        color = if (selected) ink.textColor else ink.textColor.copy(alpha = 0.18f),
                        shape = RoundedCornerShape(12.dp),
                    )
                    .clickable(enabled = poll.endedAt == null) { onVote(idx) }
            ) {
                if (showResults && animatedPct > 0f) {
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(animatedPct)
                                .background(ink.textColor.copy(alpha = if (selected) 0.24f else 0.14f))
                        )
                    }
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 9.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = opt,
                        color = ink.textColor,
                        fontSize = 13.5.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                        modifier = Modifier.weight(1f),
                    )
                    if (showResults) {
                        Text(
                            text = "$pct% ($count)",
                            color = ink.subTextColor,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(5.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = if (poll.endedAt != null) "${poll.totalVotes} votes · Poll ended" else "${poll.totalVotes} votes",
                color = ink.subTextColor,
                fontSize = 11.5.sp,
                textDecoration = if (onViewVoters != null && poll.totalVotes > 0) TextDecoration.Underline else TextDecoration.None,
                modifier = if (onViewVoters != null && poll.totalVotes > 0) {
                    Modifier.clickable { onViewVoters() }
                } else {
                    Modifier
                },
            )
            if (canManage && poll.endedAt == null) {
                Text(
                    text = "End poll",
                    color = ink.textColor,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { onEndPoll() },
                )
            }
        }
    }
}

/**
 * Renders multi-emoji reactions (supports 2+ distinct reactions from the same user + animated bounce + `+` button!).
 */
@OptIn(ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
fun MessageReactionPillsRow(
    reactions: List<MessageReaction>,
    myUserId: String,
    palette: JaTextPalette,
    alignEnd: Boolean,
    onToggleEmoji: (String) -> Unit,
    onOpenPicker: (() -> Unit)? = null,
) {
    if (reactions.isEmpty()) return
    val grouped = remember(reactions) {
        reactions.groupBy { it.emoji }
    }
    FlowRow(
        modifier = Modifier.padding(top = 4.dp),
        horizontalArrangement = if (alignEnd) Arrangement.spacedBy(5.dp, Alignment.End) else Arrangement.spacedBy(5.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        grouped.forEach { (emoji, list) ->
            val mine = list.any { it.userId == myUserId }
            val popScale by animateFloatAsState(
                targetValue = if (mine) 1.03f else 1f,
                animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
                label = "reactionScale",
            )
            Row(
                modifier = Modifier
                    .graphicsLayer {
                        scaleX = popScale
                        scaleY = popScale
                    }
                    .jaBouncyClick(pressedScale = 0.88f) { onToggleEmoji(emoji) }
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (mine) palette.accentSoft else palette.surface)
                    .border(
                        width = 1.dp,
                        color = if (mine) palette.accent else palette.border,
                        shape = RoundedCornerShape(999.dp),
                    )
                    .padding(horizontal = 8.dp, vertical = 3.5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = emoji, fontSize = 13.sp)
                Spacer(Modifier.width(4.dp))
                Text(
                    text = list.size.toString(),
                    color = if (mine) palette.accent else palette.textSecondary,
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        if (onOpenPicker != null) {
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .jaBouncyClick(pressedScale = 0.90f, onClick = onOpenPicker)
                    .clip(CircleShape)
                    .background(palette.surface)
                    .border(1.dp, palette.border, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Add,
                    contentDescription = "Add another reaction",
                    tint = palette.textSecondary,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
    }
}

/**
 * 1:1 recreation of `.group-seen-row` / `.group-seen-avatars` from `GroupChatView.tsx`.
 */
@Composable
fun GroupSeenAvatarsRowUi(
    seenReaders: List<GroupSeenReader>,
    alignEnd: Boolean,
    hasWallpaper: Boolean,
    palette: JaTextPalette,
    onClickReader: (JaUser) -> Unit,
) {
    if (seenReaders.isEmpty()) return
    val shown = seenReaders.take(6)
    val overflow = seenReaders.size - shown.size

    Row(
        modifier = Modifier.padding(top = 3.dp),
        horizontalArrangement = if (alignEnd) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Seen by",
            color = if (hasWallpaper) Color(0xE0FFFFFF) else palette.textTertiary,
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium,
        )
        Spacer(Modifier.width(5.dp))
        Row(horizontalArrangement = Arrangement.spacedBy((-4).dp), verticalAlignment = Alignment.CenterVertically) {
            shown.forEach { reader ->
                JaAvatar(
                    avatarUrl = reader.avatarUrl,
                    displayName = reader.displayName,
                    avatarColor = reader.avatarColor,
                    size = 16.dp,
                    ringWidth = 1.5.dp,
                    modifier = Modifier.clickable {
                        onClickReader(
                            JaUser(
                                id = reader.id,
                                displayName = reader.displayName,
                                username = reader.username,
                                avatarColor = reader.avatarColor,
                                avatarUrl = reader.avatarUrl,
                                onboardingComplete = true,
                            )
                        )
                    }
                )
            }
            if (overflow > 0) {
                Spacer(Modifier.width(6.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(palette.bgTertiary)
                        .border(1.dp, palette.border, RoundedCornerShape(999.dp))
                        .padding(horizontal = 5.dp, vertical = 1.dp)
                ) {
                    Text(
                        text = "+$overflow",
                        color = palette.textSecondary,
                        fontSize = 9.5.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}
