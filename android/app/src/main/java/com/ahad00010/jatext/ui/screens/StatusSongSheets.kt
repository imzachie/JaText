package com.ahad00010.jatext.ui.screens

import android.os.Handler
import android.os.Looper
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import android.content.Context
import coil.compose.AsyncImage
import com.ahad00010.jatext.data.StatusSong
import com.ahad00010.jatext.data.StatusSongs

/**
 * Plays one preview at a time. Starting a second song stops the first, so
 * tapping around the list never layers two tracks over each other.
 */
class SongPreviewPlayer {
    private var player: android.media.MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private var pendingStop: Runnable? = null

    fun play(context: Context, url: String, startMs: Int, lengthMs: Int, onEnded: () -> Unit) {
        stop()
        runCatching {
            val mp = android.media.MediaPlayer()
            if (url.startsWith("content://") || url.startsWith("file://")) {
                mp.setDataSource(context, android.net.Uri.parse(url))
            } else {
                mp.setDataSource(url)
            }
            mp.setOnPreparedListener { prepared ->
                runCatching {
                    if (startMs > 0) prepared.seekTo(startMs)
                    prepared.start()
                }
                // Stop exactly where the Status clip would stop.
                val stopper = Runnable {
                    runCatching { prepared.stop() }
                    onEnded()
                }
                pendingStop = stopper
                handler.postDelayed(stopper, lengthMs.toLong())
            }
            mp.setOnErrorListener { _, _, _ ->
                onEnded()
                true
            }
            mp.prepareAsync()
            player = mp
        }
    }

    fun stop() {
        pendingStop?.let { handler.removeCallbacks(it) }
        pendingStop = null
        runCatching { player?.stop() }
        runCatching { player?.release() }
        player = null
    }
}

@Composable
private fun rememberSongPreviewPlayer(): SongPreviewPlayer {
    val player = remember { SongPreviewPlayer() }
    DisposableEffect(Unit) {
        onDispose { player.stop() }
    }
    return player
}

@Composable
private fun SheetShell(
    visible: Boolean,
    onDismiss: () -> Unit,
    title: String,
    subtitle: String,
    content: @Composable () -> Unit,
) {
    if (!visible) return
    // Its own window, otherwise it lands behind the composer dialog it was
    // opened from and there is no way to touch it.
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        AnimatedVisibility(
            visible = true,
            enter = fadeIn() + slideInVertically { it / 8 },
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xB3000000))
                    .clickable { onDismiss() },
                contentAlignment = Alignment.BottomCenter,
            ) {
                Surface(
                    shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
                    color = Color(0xFF14141D),
                    modifier = Modifier
                        .fillMaxWidth()
                        // Draws edge to edge behind the system bars, so without
                        // the navigation padding the sheet hangs off the bottom
                        // of the screen, and without the height cap it can grow
                        // past it on a short phone.
                        .fillMaxHeight(0.92f)
                        .heightIn(max = 620.dp)
                        .navigationBarsPadding()
                        .clickable(enabled = false) {},
                ) {
                    Column(modifier = Modifier.padding(bottom = 10.dp)) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = title,
                                    color = Color.White,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                )
                                Text(
                                    text = subtitle,
                                    color = Color.White.copy(alpha = 0.6f),
                                    fontSize = 12.sp,
                                )
                            }
                            IconButton(onClick = onDismiss, modifier = Modifier.size(32.dp)) {
                                Icon(
                                    imageVector = Icons.Rounded.Close,
                                    contentDescription = "Close",
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                        content()
                    }
                }
            }
        }
    }
}

/**
 * The songs library. Tapping a row previews it from its best part, and Use
 * hands it to the trimmer so the poster can pick the 30 seconds they want.
 */
@Composable
fun StatusSongPickerSheet(
    open: Boolean,
    onClose: () -> Unit,
    onPick: (StatusSong) -> Unit,
) {
    val player = rememberSongPreviewPlayer()
    val context = LocalContext.current
    var playingId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(open) {
        if (!open) {
            player.stop()
            playingId = null
        }
    }

    SheetShell(
        visible = open,
        onDismiss = onClose,
        title = "Songs",
        subtitle = "Tap a song to hear it, then pick the part you want.",
    ) {
        LazyColumn(modifier = Modifier.fillMaxWidth()) {
            itemsIndexed(StatusSongs.all) { index, song ->
                val isPlaying = playingId == song.id
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(
                            if (isPlaying) Color(0x249B6CFF) else Color.Transparent,
                        )
                        .padding(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .clickable {
                                if (isPlaying) {
                                    player.stop()
                                    playingId = null
                                } else {
                                    player.play(
                                        context = context,
                                        url = song.audioUrl,
                                        startMs = song.previewStartMs,
                                        lengthMs = StatusSongs.MAX_STATUS_AUDIO_MS,
                                        onEnded = { playingId = null },
                                    )
                                    playingId = song.id
                                }
                            }
                            .padding(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(contentAlignment = Alignment.Center, modifier = Modifier.width(18.dp)) {
                            if (isPlaying) {
                                Icon(
                                    imageVector = Icons.Rounded.Pause,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(13.dp),
                                )
                            } else {
                                Text(
                                    text = "${index + 1}",
                                    color = Color.White.copy(alpha = 0.55f),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                )
                            }
                        }
                        Spacer(Modifier.width(10.dp))
                        Box(contentAlignment = Alignment.Center) {
                            AsyncImage(
                                model = song.coverUrl,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(46.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(Color(0x14FFFFFF)),
                            )
                            if (isPlaying) {
                                Box(
                                    modifier = Modifier
                                        .size(46.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(Color(0x99000000)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Pause,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(16.dp),
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = song.title,
                                color = Color.White,
                                fontSize = 13.5.sp,
                                fontWeight = FontWeight.ExtraBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = song.artist,
                                color = Color.White.copy(alpha = 0.6f),
                                fontSize = 12.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Text(
                            text = StatusSongs.formatClock(song.durationMs),
                            color = Color.White.copy(alpha = 0.6f),
                            fontSize = 12.sp,
                        )
                    }
                    Spacer(Modifier.width(6.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color(0xFF9B6CFF))
                            .clickable {
                                player.stop()
                                playingId = null
                                onPick(song)
                            }
                            .padding(horizontal = 14.dp, vertical = 7.dp),
                    ) {
                        Text(
                            text = "Use",
                            color = Color(0xFF170D2B),
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                    }
                }
            }
        }
    }
}

/**
 * Picks where inside a track the 30 second clip begins. Used for library songs
 * and for anything uploaded, which is what makes clips longer than 30 seconds
 * usable at all.
 */
@Composable
fun StatusSongTrimSheet(
    open: Boolean,
    title: String,
    artist: String,
    coverUrl: String?,
    audioUrl: String,
    durationMs: Int,
    initialStartMs: Int,
    onCancel: () -> Unit,
    onConfirm: (startMs: Int, lengthMs: Int) -> Unit,
) {
    val player = rememberSongPreviewPlayer()
    val context = LocalContext.current
    val limit = StatusSongs.maxStartMs(durationMs)
    var startMs by remember(open, initialStartMs, durationMs) {
        mutableStateOf(initialStartMs.coerceIn(0, limit.coerceAtLeast(0)).toFloat())
    }
    var previewing by remember { mutableStateOf(false) }

    LaunchedEffect(open) {
        if (!open) {
            player.stop()
            previewing = false
        }
    }

    val window = StatusSongs.playWindow(startMs.toInt(), durationMs)
    val leftFraction = if (durationMs > 0) window.first.toFloat() / durationMs.toFloat() else 0f
    val widthFraction = if (durationMs > 0) window.second.toFloat() / durationMs.toFloat() else 0f

    SheetShell(
        visible = open,
        onDismiss = onCancel,
        title = "Choose the part",
        subtitle = "Status plays ${StatusSongs.formatClock(window.second)} from wherever you put it.",
    ) {
        Column(modifier = Modifier.padding(horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (!coverUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = coverUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(52.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0x14FFFFFF)),
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0x14FFFFFF)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            painter = androidx.compose.ui.res.painterResource(
                                id = com.ahad00010.jatext.R.drawable.ic_jt_music_note,
                            ),
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = title,
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = artist,
                        color = Color.White.copy(alpha = 0.6f),
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.width(10.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (previewing) Color(0xFF9B6CFF) else Color(0x14FFFFFF))
                        .clickable {
                            if (previewing) {
                                player.stop()
                                previewing = false
                            } else {
                                player.play(
                                    context = context,
                                    url = audioUrl,
                                    startMs = window.first,
                                    lengthMs = window.second,
                                    onEnded = { previewing = false },
                                )
                                previewing = true
                            }
                        }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = if (previewing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            contentDescription = null,
                            tint = if (previewing) Color(0xFF170D2B) else Color.White,
                            modifier = Modifier.size(15.dp),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = if (previewing) "Stop" else "Preview",
                            color = if (previewing) Color(0xFF170D2B) else Color.White,
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }

            Spacer(Modifier.height(18.dp))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0x1FFFFFFF)),
            ) {
                val before = leftFraction.coerceIn(0f, 1f)
                val width = widthFraction.coerceIn(0f, 1f - before)
                val after = (1f - before - width).coerceAtLeast(0f)
                if (before > 0f) {
                    Spacer(Modifier.weight(before))
                }
                Box(
                    modifier = Modifier
                        .weight(width.coerceAtLeast(0.001f))
                        .height(8.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(Color(0xFF9B6CFF)),
                )
                if (after > 0f) {
                    Spacer(Modifier.weight(after))
                }
            }

            Spacer(Modifier.height(10.dp))

            if (limit > 0) {
                Slider(
                    value = startMs,
                    onValueChange = { next ->
                        player.stop()
                        previewing = false
                        startMs = next
                    },
                    valueRange = 0f..limit.toFloat(),
                )
            } else {
                Text(
                    text = "This clip is ${StatusSongs.formatClock(durationMs)}, so the whole thing fits.",
                    color = Color.White.copy(alpha = 0.6f),
                    fontSize = 12.sp,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "Starts at ${StatusSongs.formatClock(window.first)}",
                    color = Color.White.copy(alpha = 0.6f),
                    fontSize = 12.sp,
                )
                Text(
                    text = "${StatusSongs.formatClock(window.first)} - ${StatusSongs.formatClock(window.first + window.second)}",
                    color = Color.White.copy(alpha = 0.6f),
                    fontSize = 12.sp,
                )
            }

            Spacer(Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { onCancel() }
                        .padding(horizontal = 14.dp, vertical = 9.dp),
                ) {
                    Text("Cancel", color = Color.White.copy(alpha = 0.7f), fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF14D990))
                        .clickable {
                            player.stop()
                            onConfirm(window.first, window.second)
                        }
                        .padding(horizontal = 18.dp, vertical = 9.dp),
                ) {
                    Text(
                        text = "Use this part",
                        color = Color(0xFF042F2E),
                        fontWeight = FontWeight.ExtraBold,
                    )
                }
            }
        }
    }
}

/** The composer's summary of the clip or song a status will play. */
@Composable
fun StatusPickedAudioCard(
    coverUrl: String?,
    title: String,
    subtitle: String,
    onChange: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0x0FFFFFFF))
            .border(1.dp, Color(0x14FFFFFF), RoundedCornerShape(14.dp))
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!coverUrl.isNullOrBlank()) {
            AsyncImage(
                model = coverUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0x14FFFFFF)),
            )
        } else {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0x14FFFFFF)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = androidx.compose.ui.res.painterResource(
                        id = com.ahad00010.jatext.R.drawable.ic_jt_music_note,
                    ),
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(17.dp),
                )
            }
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subtitle,
                color = Color.White.copy(alpha = 0.6f),
                fontSize = 11.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .border(1.dp, Color(0x29FFFFFF), RoundedCornerShape(999.dp))
                .clickable { onChange() }
                .padding(horizontal = 12.dp, vertical = 6.dp),
        ) {
            Text("Change part", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    }
}
