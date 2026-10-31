package com.ahad00010.jatext.ui.components

import android.content.Intent
import android.media.MediaPlayer
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.InsertDriveFile
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Poll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.ahad00010.jatext.crypto.JaTextCryptoEngine
import com.ahad00010.jatext.data.CommunityPoll
import com.ahad00010.jatext.data.EncryptedBlobDescriptor
import com.ahad00010.jatext.data.ForwardedMessageContext
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
import kotlinx.coroutines.delay

private val URL_REGEX = Regex("""https?://[^\s<>"]+""")
private val MENTION_REGEX = Regex("""@[a-zA-Z0-9._]{2,24}""")

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
            .clip(RoundedCornerShape(10.dp))
            .background(cardBg)
            .border(1.dp, cardBorder, RoundedCornerShape(10.dp))
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
        Text(
            text = "${contextCard.sourceLabel}  •  $dateStr",
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
            .clip(RoundedCornerShape(8.dp))
            .background(barBg)
            .clickable { onJump(reply.id) }
            .padding(horizontal = 9.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(28.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(ink.textColor.copy(alpha = 0.65f))
        )
        Spacer(Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = reply.senderName,
                color = ink.textColor,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
            Text(
                text = reply.body.ifBlank { "Attachment" },
                color = ink.subTextColor,
                fontSize = 11.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * Native Android Voice Note Player:
 * - Renders play/pause controls, waveform bars, timer, and transcript in DARK INK (#16161D)
 *   whenever the message bubble uses a lighter background!
 * - Automatically runs VoiceNoteMusicDetector on the audio file; if music is detected,
 *   speech transcription is cancelled and outputs "(Music)" only!
 */
@Composable
fun NativeVoiceNoteBubblePlayer(
    attachmentUrl: String,
    encryptedAttachment: EncryptedBlobDescriptor?,
    ink: ResolvedBubbleColors,
) {
    val context = LocalContext.current
    var resolvedFile by remember(attachmentUrl, encryptedAttachment?.h) { mutableStateOf<File?>(null) }
    var loadingFile by remember(attachmentUrl) { mutableStateOf(true) }
    var bars by remember(attachmentUrl) { mutableStateOf(List(32) { i -> 0.24f + ((i * 5) % 6) * 0.12f }) }
    var transcriptLabel by remember(attachmentUrl) { mutableStateOf<String?>(null) }

    var isPlaying by remember { mutableStateOf(false) }
    var durationMs by remember { mutableIntStateOf(0) }
    var positionMs by remember { mutableIntStateOf(0) }
    var progress by remember { mutableFloatStateOf(0f) }
    var playerRef by remember { mutableStateOf<MediaPlayer?>(null) }

    LaunchedEffect(attachmentUrl, encryptedAttachment?.h) {
        loadingFile = true
        val file = if (attachmentUrl.startsWith("file://")) {
            Uri.parse(attachmentUrl).path?.let { File(it) }
        } else {
            JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(context, attachmentUrl, encryptedAttachment)
        }
        resolvedFile = file
        loadingFile = false
        if (file != null && file.exists()) {
            bars = VoiceNoteMusicDetector.buildWaveformSamples(file, bars = 32)
            val isMusic = VoiceNoteMusicDetector.analyzeAudioForMusic(file)
            if (isMusic) {
                transcriptLabel = "(Music)"
            }
        }
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
            delay(80L)
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
            .padding(vertical = 2.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(CircleShape)
                    .background(btnBg)
                    .clickable(enabled = !loadingFile && resolvedFile != null) {
                        val file = resolvedFile ?: return@clickable
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
                    },
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

        if (!transcriptLabel.isNullOrBlank()) {
            Spacer(Modifier.height(5.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Rounded.GraphicEq,
                    contentDescription = null,
                    tint = fgInk.copy(alpha = 0.8f),
                    modifier = Modifier.size(13.dp),
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = transcriptLabel!!,
                    color = fgInk,
                    fontSize = 12.sp,
                    fontStyle = FontStyle.Italic,
                )
            }
        }
    }
}

@Composable
fun MessageMediaAttachmentView(
    attachmentUrl: String,
    attachmentName: String?,
    attachmentType: String?,
    encryptedAttachment: EncryptedBlobDescriptor?,
    ink: ResolvedBubbleColors,
    onOpenImageFullscreen: (Any) -> Unit,
) {
    val context = LocalContext.current
    val mime = (encryptedAttachment?.mt ?: attachmentType.orEmpty()).lowercase()
    val cleanMime = mime.substringBefore(";")

    if (cleanMime.startsWith("audio/")) {
        NativeVoiceNoteBubblePlayer(
            attachmentUrl = attachmentUrl,
            encryptedAttachment = encryptedAttachment,
            ink = ink,
        )
        return
    }

    val modelState by produceState<Any?>(initialValue = if (encryptedAttachment == null) attachmentUrl else null, attachmentUrl, encryptedAttachment?.h) {
        if (encryptedAttachment == null) {
            value = attachmentUrl
        } else {
            value = JaTextCryptoEngine.resolveOrDecryptAttachmentToFile(context, attachmentUrl, encryptedAttachment)
        }
    }

    if (cleanMime.startsWith("image/")) {
        Box(
            modifier = Modifier
                .padding(bottom = 4.dp)
                .widthIn(max = 260.dp)
                .heightIn(min = 90.dp, max = 280.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0x1F000000))
                .clickable(enabled = modelState != null) {
                    modelState?.let { onOpenImageFullscreen(it) }
                },
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
                    contentDescription = attachmentName ?: "Image",
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
                .clip(RoundedCornerShape(10.dp))
                .background(boxBg)
                .clickable {
                    try {
                        val target = modelState
                        if (target is String && target.startsWith("http")) {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target)))
                        }
                    } catch (_: Throwable) {
                    }
                }
                .padding(10.dp),
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

@Composable
fun RichTextWithLinksAndMentions(
    text: String,
    ink: ResolvedBubbleColors,
    palette: JaTextPalette,
    onLongPressMessage: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val firstUrl = remember(text) { URL_REGEX.find(text)?.value }

    val annotated = remember(text, ink.textColor, palette.accent) {
        buildAnnotatedString {
            var cursor = 0
            val tokens = (URL_REGEX.findAll(text).map { it.range to ("URL" to it.value) } +
                MENTION_REGEX.findAll(text).map { it.range to ("MENTION" to it.value) })
                .sortedBy { it.first.first }

            for ((range, tagVal) in tokens) {
                if (range.first < cursor) continue
                if (range.first > cursor) {
                    append(text.substring(cursor, range.first))
                }
                val (tag, raw) = tagVal
                if (tag == "URL") {
                    pushStringAnnotation(tag = "URL", annotation = raw)
                    withStyle(
                        SpanStyle(
                            color = ink.textColor,
                            fontWeight = FontWeight.SemiBold,
                            textDecoration = TextDecoration.Underline,
                        )
                    ) {
                        append(raw)
                    }
                    pop()
                } else {
                    withStyle(
                        SpanStyle(
                            color = ink.textColor,
                            fontWeight = FontWeight.Bold,
                            background = ink.textColor.copy(alpha = 0.14f),
                        )
                    ) {
                        append(raw)
                    }
                }
                cursor = range.last + 1
            }
            if (cursor < text.length) {
                append(text.substring(cursor))
            }
        }
    }

    Column {
        @Suppress("DEPRECATION")
        ClickableText(
            text = annotated,
            style = TextStyle(
                color = ink.textColor,
                fontSize = 14.5.sp,
                lineHeight = 20.sp,
            ),
            onClick = { offset ->
                val urlAnn = annotated.getStringAnnotations("URL", offset, offset).firstOrNull()
                if (urlAnn != null) {
                    try {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(urlAnn.item)))
                    } catch (_: Throwable) {
                    }
                } else {
                    onLongPressMessage?.invoke()
                }
            }
        )

        if (firstUrl != null) {
            val preview by produceState<LinkPreviewData?>(initialValue = null, firstUrl) {
                value = TursoApiClient.fetchLinkPreview(firstUrl)
            }
            preview?.takeIf { !it.title.isNullOrBlank() }?.let { lp ->
                Spacer(Modifier.height(6.dp))
                val cardBg = if (ink.isLightSurface) Color(0x14000000) else Color(0x24000000)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(cardBg)
                        .clickable {
                            try {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(lp.url)))
                            } catch (_: Throwable) {
                            }
                        }
                        .padding(9.dp)
                ) {
                    if (!lp.siteName.isNullOrBlank()) {
                        Text(
                            text = lp.siteName,
                            color = ink.subTextColor,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Text(
                        text = lp.title.orEmpty(),
                        color = ink.textColor,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (!lp.description.isNullOrBlank()) {
                        Text(
                            text = lp.description,
                            color = ink.subTextColor,
                            fontSize = 11.5.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun CommunityPollCardUi(
    question: String,
    poll: CommunityPoll,
    canManage: Boolean,
    ink: ResolvedBubbleColors,
    onVote: (Int) -> Unit,
    onEndPoll: () -> Unit,
) {
    Column(
        modifier = Modifier
            .widthIn(min = 230.dp, max = 300.dp)
            .padding(vertical = 2.dp)
    ) {
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
                fontSize = 14.5.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.height(8.dp))
        val total = poll.totalVotes.coerceAtLeast(1)
        poll.options.forEachIndexed { idx, opt ->
            val count = poll.counts.getOrElse(idx) { 0 }
            val pct = if (poll.totalVotes == 0) 0 else ((count * 100f) / total).toInt()
            val selected = poll.myVote == idx
            val rowBg = if (selected) ink.textColor.copy(alpha = 0.22f) else ink.textColor.copy(alpha = 0.10f)

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 3.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(rowBg)
                    .border(
                        width = if (selected) 1.5.dp else 1.dp,
                        color = if (selected) ink.textColor else ink.textColor.copy(alpha = 0.18f),
                        shape = RoundedCornerShape(9.dp),
                    )
                    .clickable(enabled = poll.endedAt == null) { onVote(idx) }
                    .padding(horizontal = 10.dp, vertical = 8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = opt,
                        color = ink.textColor,
                        fontSize = 13.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = "$pct% ($count)",
                        color = ink.subTextColor,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = if (poll.endedAt != null) "${poll.totalVotes} votes • Poll ended" else "${poll.totalVotes} votes",
                color = ink.subTextColor,
                fontSize = 11.sp,
            )
            if (canManage && poll.endedAt == null) {
                Text(
                    text = "End poll",
                    color = ink.textColor,
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { onEndPoll() },
                )
            }
        }
    }
}

/**
 * Renders multi-emoji reactions (supports 2+ distinct reactions from the same user!).
 */
@OptIn(ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
fun MessageReactionPillsRow(
    reactions: List<MessageReaction>,
    myUserId: String,
    palette: JaTextPalette,
    alignEnd: Boolean,
    onToggleEmoji: (String) -> Unit,
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
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (mine) palette.accentSoft else palette.surface)
                    .border(
                        width = 1.dp,
                        color = if (mine) palette.accent else palette.border,
                        shape = RoundedCornerShape(999.dp),
                    )
                    .combinedClickable(
                        onClick = { onToggleEmoji(emoji) },
                    )
                    .padding(horizontal = 8.dp, vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = emoji, fontSize = 13.sp)
                if (list.size > 1) {
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = list.size.toString(),
                        color = if (mine) palette.accent else palette.textSecondary,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}
