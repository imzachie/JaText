/**
 * The Status music library.
 *
 * A Status only plays 30 seconds of audio, but the songs people want are whole
 * tracks, so each entry carries the full length plus the timestamp the preview
 * starts from, and whoever posts picks the part they want. Both clients use
 * this same list so a song picked on a phone reads correctly on desktop.
 *
 * The files are hosted in the JaText-Essential-Stuff repo rather than bundled
 * here: three full songs plus cover art would add several megabytes to every
 * clone and to the web build, and none of it is needed by the app itself.
 */

export interface StatusSong {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  audioUrl: string;
  durationMs: number;
  /** Where a preview starts when someone taps the song to hear it. */
  previewStartMs: number;
}

const ESSENTIAL_RAW =
  "https://raw.githubusercontent.com/Ahad00010/JaText-Essential-Stuff/refs/heads/main";
const ESSENTIAL_FILE =
  "https://github.com/Ahad00010/JaText-Essential-Stuff/raw/refs/heads/main";

export const MAX_STATUS_AUDIO_MS = 30_000;

export const STATUS_SONGS: StatusSong[] = [
  {
    id: "young_black_and_rich",
    title: "Young Black & Rich",
    artist: "Melly Mike",
    coverUrl: `${ESSENTIAL_RAW}/Young%20Black.jpg`,
    audioUrl: `${ESSENTIAL_FILE}/Young%20Black%20&%20Rich.mp3`,
    durationMs: 155_000,
    previewStartMs: 70_000,
  },
  {
    id: "boss_bitch",
    title: "Boss Bitch",
    artist: "Doja Cat",
    coverUrl: `${ESSENTIAL_RAW}/Boss%20Bitch.jpg`,
    audioUrl: `${ESSENTIAL_FILE}/Boss%20Bitch.mp3`,
    durationMs: 134_000,
    previewStartMs: 83_000,
  },
  {
    id: "sara_perche_ti_amo",
    title: "Sarà perché ti amo",
    artist: "Ricchi e Poveri",
    coverUrl: `${ESSENTIAL_RAW}/Sar%C3%A0%20perch%C3%A9%20ti%20amo.jpg`,
    audioUrl: `${ESSENTIAL_FILE}/Sar%C3%A0%20perch%C3%A9%20ti%20amo.mp3`,
    durationMs: 191_000,
    previewStartMs: 127_000,
  },
];

export function findStatusSong(id: string): StatusSong | undefined {
  return STATUS_SONGS.find((s) => s.id === id);
}

/** "2:35" */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** How far into a track a 30 second clip can start, 0 when it all fits. */
export function maxStartMs(durationMs: number): number {
  return durationMs <= MAX_STATUS_AUDIO_MS ? 0 : durationMs - MAX_STATUS_AUDIO_MS;
}

/**
 * The window that actually plays. A Status never runs longer than 30 seconds,
 * and it never runs past the end of the track.
 */
export function playWindow(
  startMs: number,
  durationMs: number,
): { startMs: number; lengthMs: number } {
  if (durationMs <= MAX_STATUS_AUDIO_MS) {
    return { startMs: 0, lengthMs: Math.max(0, durationMs) };
  }
  const limit = maxStartMs(durationMs);
  const start = Math.min(Math.max(0, Math.round(startMs)), limit);
  return { startMs: start, lengthMs: MAX_STATUS_AUDIO_MS };
}
