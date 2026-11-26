package com.ahad00010.jatext.data

/**
 * The Status music library.
 *
 * A Status only plays 30 seconds of audio, but the songs people want are whole
 * tracks, so every entry carries the full length plus the timestamp a preview
 * starts from, and whoever posts picks the part they want.
 *
 * The files are served by the self hosted server, so a song starts as quickly
 * as any other request instead of waiting on a public file host that answers
 * in seconds. They are not bundled into the app either: three full songs plus
 * cover art would add several megabytes to every install for something most
 * people never open.
 */
data class StatusSong(
    val id: String,
    val title: String,
    val artist: String,
    val coverUrl: String,
    val audioUrl: String,
    val durationMs: Int,
    /** Where a preview starts when someone taps the song to hear it. */
    val previewStartMs: Int,
)

object StatusSongs {

    const val MAX_STATUS_AUDIO_MS = 30_000

    private const val SONGS_BASE = "https://jatextapp.pages.dev/songs"

    val all: List<StatusSong> = listOf(
        StatusSong(
            id = "young_black_and_rich",
            title = "Young Black & Rich",
            artist = "Melly Mike",
            coverUrl = "$SONGS_BASE/young-black.jpg",
            audioUrl = "$SONGS_BASE/young-black-and-rich.mp3",
            durationMs = 155_000,
            previewStartMs = 70_000,
        ),
        StatusSong(
            id = "boss_bitch",
            title = "Boss Bitch",
            artist = "Doja Cat",
            coverUrl = "$SONGS_BASE/boss-bitch.jpg",
            audioUrl = "$SONGS_BASE/boss-bitch.mp3",
            durationMs = 134_000,
            previewStartMs = 83_000,
        ),
        StatusSong(
            id = "sara_perche_ti_amo",
            title = "Sarà perché ti amo",
            artist = "Ricchi e Poveri",
            coverUrl = "$SONGS_BASE/sara-perche-ti-amo.jpg",
            audioUrl = "$SONGS_BASE/sara-perche-ti-amo.mp3",
            durationMs = 191_000,
            previewStartMs = 127_000,
        ),
    )

    fun find(id: String): StatusSong? = all.firstOrNull { it.id == id }

    /** "2:35" */
    fun formatClock(ms: Int): String {
        val total = (ms / 1000).coerceAtLeast(0)
        val mins = total / 60
        val secs = total % 60
        val padded = if (secs < 10) "0$secs" else "$secs"
        return "$mins:$padded"
    }

    /** How far into a track a 30 second clip can start, 0 when it all fits. */
    fun maxStartMs(durationMs: Int): Int =
        if (durationMs <= MAX_STATUS_AUDIO_MS) 0 else durationMs - MAX_STATUS_AUDIO_MS

    /**
     * The window that actually plays. A Status never runs longer than 30
     * seconds and never runs past the end of the track.
     */
    fun playWindow(startMs: Int, durationMs: Int): Pair<Int, Int> =
        if (durationMs <= MAX_STATUS_AUDIO_MS) {
            0 to durationMs.coerceAtLeast(0)
        } else {
            startMs.coerceIn(0, maxStartMs(durationMs)) to MAX_STATUS_AUDIO_MS
        }
}
