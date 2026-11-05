/**
 * The Status music library.
 *
 * A Status only plays 30 seconds of audio, but the songs people want are whole
 * tracks, so each entry carries the full length plus the timestamp the preview
 * starts from, and whoever posts picks the part they want. Both clients use
 * this same list so a song picked on a phone reads correctly on desktop.
 *
 * The files are served by this app from public/songs, so a song starts as
 * quickly as any other page asset instead of waiting on a file host that
 * answers in seconds.
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

const SONGS_BASE = "/songs";

export const MAX_STATUS_AUDIO_MS = 30_000;

export const STATUS_SONGS: StatusSong[] = [
  {
    id: "young_black_and_rich",
    title: "Young Black & Rich",
    artist: "Melly Mike",
    coverUrl: `${SONGS_BASE}/young-black.jpg`,
    audioUrl: `${SONGS_BASE}/young-black-and-rich.mp3`,
    durationMs: 155_000,
    previewStartMs: 70_000,
  },
  {
    id: "boss_bitch",
    title: "Boss Bitch",
    artist: "Doja Cat",
    coverUrl: `${SONGS_BASE}/boss-bitch.jpg`,
    audioUrl: `${SONGS_BASE}/boss-bitch.mp3`,
    durationMs: 134_000,
    previewStartMs: 83_000,
  },
  {
    id: "sara_perche_ti_amo",
    title: "Sarà perché ti amo",
    artist: "Ricchi e Poveri",
    coverUrl: `${SONGS_BASE}/sara-perche-ti-amo.jpg`,
    audioUrl: `${SONGS_BASE}/sara-perche-ti-amo.mp3`,
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
 * and never runs past the end of the track.
 */
export function playWindow(startMs: number, durationMs: number): { startMs: number; lengthMs: number } {
  if (durationMs <= MAX_STATUS_AUDIO_MS) {
    return { startMs: 0, lengthMs: Math.max(0, durationMs) };
  }
  const limit = maxStartMs(durationMs);
  return {
    startMs: Math.min(Math.max(startMs, 0), limit),
    lengthMs: MAX_STATUS_AUDIO_MS,
  };
}
