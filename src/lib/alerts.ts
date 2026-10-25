export interface NotificationPreferences {
  notificationsEnabled: boolean;
  soundsEnabled: boolean;
}

const PREFERENCES_KEY = "jatext-notification-preferences-v1";

export function loadNotificationPreferences(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return { notificationsEnabled: false, soundsEnabled: true };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { notificationsEnabled: false, soundsEnabled: true };
    }
    const preferences = parsed as Partial<NotificationPreferences>;
    return {
      notificationsEnabled: preferences.notificationsEnabled === true,
      soundsEnabled: preferences.soundsEnabled !== false,
    };
  } catch {
    return { notificationsEnabled: false, soundsEnabled: true };
  }
}

export function saveNotificationPreferences(preferences: NotificationPreferences) {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

let audioContext: AudioContext | null = null;

export function playMessageSound(direction: "sent" | "received") {
  if (typeof window.AudioContext === "undefined") return;
  audioContext ??= new window.AudioContext();
  if (audioContext.state === "suspended") {
    void audioContext.resume().catch(() => undefined);
  }

  const context = audioContext;
  const tones = direction === "sent" ? [660] : [880, 1175];
  tones.forEach((frequency, index) => {
    const startAt = context.currentTime + index * 0.12;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.11);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.12);
  });
}
