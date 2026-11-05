package com.ahad00010.jatext.data

/**
 * The Status music library.
 *
 * A Status only plays 30 seconds of audio, but the songs people want are whole
 * tracks, so every entry carries the full length plus the timestamp a preview
 * starts from, and whoever posts picks the part they want.
 *
 * The files live in the JaText-Essential-Stuff repo rather than being bundled
 * into the app: three full songs plus cover art would add several megabytes to
 * every install for something most people never open.
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

    private const val ESSENTIAL_RAW =
        "https://raw.githubusercontent.com/Ahad00010/JaText-Essential-Stuff/refs/heads/main"
    private const val ESSENTIAL_FILE =
        "https://github.com/Ahad00010/JaText-Essential-Stuff/raw/refs/heads/main"

    val all: List<StatusSong> = listOf(
        StatusSong(
            id = "young_black_and_rich",
            title = "Young Black & Rich",
            artist = "Melly Mike",
            coverUrl = "$ESSENTIAL_RAW/Young%20Black.jpg",
            audioUrl = "$ESSENTIAL_FILE/Young%20Black%20&%20Rich.mp3",
            durationMs = 155_000,
            previewStartMs = 70_000,
        ),
        StatusSong(
            id = "boss_bitch",
            title = "Boss Bitch",
            artist = "Doja Cat",
            coverUrl = "$ESSENTIAL_RAW/Boss%20Bitch.jpg",
            audioUrl = "$ESSENTIAL_FILE/Boss%20Bitch.mp3",
            durationMs = 134_000,
            previewStartMs = 83_000,
        ),
        StatusSong(
            id = "sara_perche_ti_amo",
            title = "Sarà perché ti amo",
            artist = "Ricchi e Poveri",
            coverUrl = "$ESSENTIAL_RAW/Sar%C3%A0%20perch%C3%A9%20ti%20amo.jpg",
            audioUrl = "$ESSENTIAL_FILE/Sar%C3%A0%20perch%C3%A9%20ti%20amo.mp3",
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
