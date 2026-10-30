package com.ahad00010.jatext;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.FileOutputStream;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Manages JaText notification sounds, looping incoming call ringtones, phone system sound
 * discovery (RingtoneManager), custom uploaded audio files, and instant lock-screen /
 * minimized incoming call wakeup on Android.
 */
public final class JaTextSoundManager {

    // v4 channel ensures existing installs pick up the calibrated +40% bundled jatext_notification.mp3!
    public static final String DEFAULT_MESSAGES_CHANNEL_ID = "jatext_messages_default_v4";
    public static final String CUSTOM_MESSAGES_CHANNEL_ID = "jatext_messages_custom_v4";
    public static final String INCOMING_CALL_CHANNEL_ID = "jatext_incoming_calls_v4";
    public static final int INCOMING_CALL_NOTIFICATION_ID = 9413;

    private static final String SYS_CHANNEL_PREFIX = "jatext_msg_sys_";
    private static final long INCOMING_CALL_RING_TIMEOUT_MS = 60_000L;

    private static final Object LOCK = new Object();
    private static MediaPlayer activeRingtonePlayer = null;
    private static MediaPlayer activePreviewPlayer = null;
    private static MediaPlayer activeNotifPlayer = null;
    private static Vibrator activeVibrator = null;
    private static volatile boolean ringtoneActive = false;
    private static volatile long suppressCallWakeUntilMs = 0L;
    private static PowerManager.WakeLock incomingWakeLock = null;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static Runnable incomingTimeoutRunnable = null;

    private JaTextSoundManager() {}

    public static boolean isIncomingRingtoneActive() {
        return ringtoneActive;
    }

    public static Uri getBundledDefaultNotificationUri(Context ctx) {
        return Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.jatext_notification);
    }

    public static Uri getBundledDefaultRingtoneUri(Context ctx) {
        return Uri.parse("android.resource://" + ctx.getPackageName() + "/" + R.raw.jatext_ringtone);
    }

    public static void saveSoundPreferences(
        Context ctx,
        String notifMode,
        String notifUri,
        String notifLabel,
        String ringMode,
        String ringUri,
        String ringLabel
    ) {
        if (ctx == null) return;
        SharedPreferences.Editor ed = JaTextE2EEDecryptor.prefs(ctx).edit();
        if (notifMode != null) ed.putString("notif_sound_mode", notifMode);
        if (notifUri != null) ed.putString("notif_sound_uri", notifUri);
        if (notifLabel != null) ed.putString("notif_sound_label", notifLabel);
        if (ringMode != null) ed.putString("ringtone_mode", ringMode);
        if (ringUri != null) ed.putString("ringtone_uri", ringUri);
        if (ringLabel != null) ed.putString("ringtone_label", ringLabel);
        ed.apply();
        ensureActiveMessageChannel(ctx);
    }

    /**
     * Ensures the NotificationChannel matching the user's current notification sound preference
     * exists and returns its channel ID.
     */
    public static String ensureActiveMessageChannel(Context ctx) {
        if (ctx == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return DEFAULT_MESSAGES_CHANNEL_ID;
        }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return DEFAULT_MESSAGES_CHANNEL_ID;

        // Clean up legacy v1/v2/v3 channels so Android loads the calibrated +40% v4 notification sound
        try {
            nm.deleteNotificationChannel("messages");
            nm.deleteNotificationChannel("jatext_messages_default_v2");
            nm.deleteNotificationChannel("jatext_messages_custom_v2");
            nm.deleteNotificationChannel("jatext_messages_default_v3");
            nm.deleteNotificationChannel("jatext_messages_custom_v3");
        } catch (Throwable ignored) {}

        AudioAttributes notifAttrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        // Always keep default JaText channel registered (referenced by AndroidManifest meta-data)
        NotificationChannel defaultChannel = new NotificationChannel(
            DEFAULT_MESSAGES_CHANNEL_ID,
            "Messages (JaText Default)",
            NotificationManager.IMPORTANCE_HIGH
        );
        defaultChannel.setDescription("JaText message notifications");
        defaultChannel.enableVibration(true);
        defaultChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        defaultChannel.setSound(getBundledDefaultNotificationUri(ctx), notifAttrs);
        nm.createNotificationChannel(defaultChannel);

        SharedPreferences sp = JaTextE2EEDecryptor.prefs(ctx);
        String mode = sp.getString("notif_sound_mode", "default");
        String uriStr = sp.getString("notif_sound_uri", "");
        String label = sp.getString("notif_sound_label", "JaText (Default)");

        if ("system".equals(mode) && uriStr != null && !uriStr.isEmpty()) {
            String chanId = SYS_CHANNEL_PREFIX + Integer.toHexString(uriStr.hashCode());
            try {
                List<NotificationChannel> existing = nm.getNotificationChannels();
                if (existing != null) {
                    for (NotificationChannel ch : existing) {
                        String id = ch.getId();
                        if (id != null && id.startsWith(SYS_CHANNEL_PREFIX) && !id.equals(chanId)) {
                            nm.deleteNotificationChannel(id);
                        }
                    }
                }
            } catch (Throwable ignored) {}

            NotificationChannel sysChannel = new NotificationChannel(
                chanId,
                "Messages (" + (label != null && !label.isEmpty() ? label : "System") + ")",
                NotificationManager.IMPORTANCE_HIGH
            );
            sysChannel.setDescription("JaText message alerts");
            sysChannel.enableVibration(true);
            sysChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            sysChannel.setSound(Uri.parse(uriStr), notifAttrs);
            nm.createNotificationChannel(sysChannel);
            return chanId;
        }

        if ("custom".equals(mode) && uriStr != null && !uriStr.isEmpty()) {
            File f = new File(uriStr);
            if (f.exists()) {
                NotificationChannel customChannel = new NotificationChannel(
                    CUSTOM_MESSAGES_CHANNEL_ID,
                    "Messages (Custom Sound)",
                    NotificationManager.IMPORTANCE_HIGH
                );
                customChannel.setDescription("JaText custom sound notifications");
                customChannel.enableVibration(true);
                customChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                // Channel stays silent while MediaPlayer plays the private custom audio file cleanly
                customChannel.setSound(null, null);
                nm.createNotificationChannel(customChannel);
                return CUSTOM_MESSAGES_CHANNEL_ID;
            }
        }

        return DEFAULT_MESSAGES_CHANNEL_ID;
    }

    public static void playCustomNotificationSoundIfNeeded(Context ctx) {
        if (ctx == null) return;
        SharedPreferences sp = JaTextE2EEDecryptor.prefs(ctx);
        String mode = sp.getString("notif_sound_mode", "default");
        if (!"custom".equals(mode)) return;
        String path = sp.getString("notif_sound_uri", "");
        if (path == null || path.isEmpty()) return;
        File file = new File(path);
        if (!file.exists()) return;

        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null && am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) {
                return;
            }
        } catch (Throwable ignored) {}

        synchronized (LOCK) {
            stopPlayerQuietly(activeNotifPlayer);
            activeNotifPlayer = null;
            try {
                MediaPlayer mp = new MediaPlayer();
                mp.setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                );
                mp.setDataSource(file.getAbsolutePath());
                mp.setLooping(false);
                mp.setVolume(1.0f, 1.0f);
                mp.setOnCompletionListener(player -> {
                    synchronized (LOCK) {
                        if (activeNotifPlayer == player) activeNotifPlayer = null;
                    }
                    stopPlayerQuietly(player);
                });
                mp.prepare();
                mp.start();
                activeNotifPlayer = mp;
            } catch (Throwable ignored) {}
        }
    }

    public static JSArray listDeviceSounds(Context ctx, String category) {
        JSArray out = new JSArray();
        if (ctx == null) return out;
        int ringType = "ringtone".equalsIgnoreCase(category)
            ? RingtoneManager.TYPE_RINGTONE
            : RingtoneManager.TYPE_NOTIFICATION;
        Cursor cursor = null;
        try {
            RingtoneManager rm = new RingtoneManager(ctx);
            rm.setType(ringType);
            cursor = rm.getCursor();
            Set<String> seenUris = new HashSet<>();
            int idx = 0;
            while (cursor != null && cursor.moveToNext() && idx < 120) {
                int pos = cursor.getPosition();
                Uri uri = rm.getRingtoneUri(pos);
                String title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX);
                if (uri == null) continue;
                String uriStr = uri.toString();
                if (seenUris.contains(uriStr)) continue;
                seenUris.add(uriStr);
                JSObject item = new JSObject();
                item.put("title", (title != null && !title.trim().isEmpty()) ? title.trim() : ("Sound " + (idx + 1)));
                item.put("uri", uriStr);
                out.put(item);
                idx++;
            }
        } catch (Throwable ignored) {
        } finally {
            if (cursor != null) {
                try {
                    cursor.close();
                } catch (Throwable ignored) {}
            }
        }
        return out;
    }

    public static File saveCustomSoundFile(
        Context ctx,
        String category,
        String originalName,
        byte[] bytes
    ) throws Exception {
        File dir = new File(ctx.getFilesDir(), "custom_sounds");
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        String ext = "mp3";
        if (originalName != null) {
            int dot = originalName.lastIndexOf('.');
            if (dot >= 0 && dot < originalName.length() - 1) {
                String candidate = originalName.substring(dot + 1).replaceAll("[^a-zA-Z0-9]", "").toLowerCase();
                if (!candidate.isEmpty() && candidate.length() <= 5) {
                    ext = candidate;
                }
            }
        }
        String prefix = "ringtone".equalsIgnoreCase(category) ? "custom_ringtone" : "custom_notification";
        File outFile = new File(dir, prefix + "_" + System.currentTimeMillis() + "." + ext);
        File[] existing = dir.listFiles();
        if (existing != null) {
            for (File f : existing) {
                if (f.getName().startsWith(prefix + "_")) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            }
        }
        try (FileOutputStream fos = new FileOutputStream(outFile, false)) {
            fos.write(bytes);
            fos.flush();
        }
        return outFile;
    }

    public static void previewSound(
        Context ctx,
        String category,
        String mode,
        String uriOrPath,
        boolean loop
    ) {
        if (ctx == null) return;
        stopSoundPreview();
        synchronized (LOCK) {
            try {
                // Previews always play on USAGE_MEDIA so users can hear them even on vibrate mode!
                MediaPlayer mp = createConfiguredPlayer(
                    ctx,
                    category,
                    mode,
                    uriOrPath,
                    loop,
                    AudioAttributes.USAGE_MEDIA
                );
                if (mp == null) return;
                if (!loop) {
                    mp.setOnCompletionListener(player -> {
                        synchronized (LOCK) {
                            if (activePreviewPlayer == player) activePreviewPlayer = null;
                        }
                        stopPlayerQuietly(player);
                    });
                }
                mp.start();
                activePreviewPlayer = mp;
            } catch (Throwable ignored) {}
        }
    }

    public static void stopSoundPreview() {
        synchronized (LOCK) {
            stopPlayerQuietly(activePreviewPlayer);
            activePreviewPlayer = null;
        }
    }

    public static void startIncomingRingtoneLoop(Context ctx) {
        if (ctx == null) return;
        SharedPreferences sp = JaTextE2EEDecryptor.prefs(ctx);
        if (sp.getBoolean("is_dnd", false)) return;

        synchronized (LOCK) {
            // If already actively playing the incoming ringtone (e.g. started 100ms earlier by
            // native call wakeup before JS mounted), keep it playing without resetting to 0:00!
            try {
                if (activeRingtonePlayer != null && activeRingtonePlayer.isPlaying()) {
                    ringtoneActive = true;
                    return;
                }
            } catch (Throwable ignored) {}

            stopPlayerQuietly(activeRingtonePlayer);
            activeRingtonePlayer = null;
            ringtoneActive = true;

            String mode = sp.getString("ringtone_mode", "default");
            String uriStr = sp.getString("ringtone_uri", "");

            boolean playAudio = true;
            int audioUsage = AudioAttributes.USAGE_NOTIFICATION_RINGTONE;
            try {
                AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    int ringerMode = am.getRingerMode();
                    int ringVol = am.getStreamVolume(AudioManager.STREAM_RING);
                    int musicVol = am.getStreamVolume(AudioManager.STREAM_MUSIC);
                    if (ringerMode == AudioManager.RINGER_MODE_SILENT) {
                        playAudio = false;
                    } else if (ringerMode == AudioManager.RINGER_MODE_NORMAL && ringVol > 0) {
                        audioUsage = AudioAttributes.USAGE_NOTIFICATION_RINGTONE;
                    } else if (musicVol > 0) {
                        // Phone ringer switch is on Vibrate or Ring volume is 0 while Media volume
                        // is turned up -> play on USAGE_MEDIA so incoming voice/video calls are audible!
                        audioUsage = AudioAttributes.USAGE_MEDIA;
                    } else {
                        playAudio = false;
                    }
                }
            } catch (Throwable ignored) {}

            if (playAudio) {
                try {
                    MediaPlayer mp = createConfiguredPlayer(ctx, "ringtone", mode, uriStr, true, audioUsage);
                    if (mp != null) {
                        mp.start();
                        activeRingtonePlayer = mp;
                    }
                } catch (Throwable ignored) {
                    // Fallback to USAGE_MEDIA with bundled raw ringtone if custom/system URI failed
                    try {
                        MediaPlayer fallbackMp = createConfiguredPlayer(
                            ctx,
                            "ringtone",
                            "default",
                            "",
                            true,
                            AudioAttributes.USAGE_MEDIA
                        );
                        if (fallbackMp != null) {
                            fallbackMp.start();
                            activeRingtonePlayer = fallbackMp;
                        }
                    } catch (Throwable ignored2) {}
                }
            }

            startCallVibration(ctx);
        }
    }

    public static void stopIncomingRingtoneLoop() {
        synchronized (LOCK) {
            ringtoneActive = false;
            stopPlayerQuietly(activeRingtonePlayer);
            activeRingtonePlayer = null;
            stopCallVibration();
        }
    }

    /**
     * Called when MainActivity comes to the foreground while an incoming call is ringing.
     * Dismisses the heads-up notification card (since the full-screen JaText CallOverlay is now
     * visible!) WITHOUT stopping the looping ringtone or vibration!
     */
    public static void onMainActivityResumed(Context ctx) {
        if (ctx == null) return;
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel("incoming_call", INCOMING_CALL_NOTIFICATION_ID);
            }
        } catch (Throwable ignored) {}
    }

    @SuppressWarnings("deprecation")
    public static void triggerIncomingCallWakeup(
        Context ctx,
        String callerId,
        String groupId,
        String callerTitle,
        boolean isVideo
    ) {
        if (ctx == null) return;
        // Prevent late-arriving duplicate FCM packets from restarting ringtone right after user declined!
        if (System.currentTimeMillis() < suppressCallWakeUntilMs) return;
        SharedPreferences sp = JaTextE2EEDecryptor.prefs(ctx);
        if (sp.getBoolean("is_dnd", false)) return;

        // 1. Always start the looping call ringtone + vibration immediately!
        startIncomingRingtoneLoop(ctx);
        MainActivity.setCallLockScreenMode(true);

        // If user is already actively looking at JaText on an unlocked, interactive screen,
        // the CallOverlay UI is already right in front of them — just arm the 60s safety timeout!
        boolean needsWakeOrForegroundLaunch = !MainActivity.isActivelyVisibleUnlocked(ctx);

        if (needsWakeOrForegroundLaunch) {
            // 2. Wake up screen immediately even if device is sleeping / locked / in Doze
            synchronized (LOCK) {
                try {
                    PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        if (incomingWakeLock != null && incomingWakeLock.isHeld()) {
                            incomingWakeLock.release();
                        }
                        incomingWakeLock = pm.newWakeLock(
                            PowerManager.FULL_WAKE_LOCK |
                            PowerManager.ACQUIRE_CAUSES_WAKEUP |
                            PowerManager.ON_AFTER_RELEASE,
                            "JaText::IncomingCallWake"
                        );
                        incomingWakeLock.setReferenceCounted(false);
                        incomingWakeLock.acquire(INCOMING_CALL_RING_TIMEOUT_MS);
                    }
                } catch (Throwable ignored) {}
            }

            // 3. Build incoming call launch intent for MainActivity
            Bundle extras = new Bundle();
            extras.putBoolean("incomingCallWake", true);
            if (callerId != null) extras.putString("senderId", callerId);
            if (groupId != null) extras.putString("groupId", groupId);
            extras.putString("type", "incoming_call");
            extras.putString("callMode", isVideo ? "video" : "voice");

            Intent launchIntent = new Intent(ctx, MainActivity.class);
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_SINGLE_TOP |
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            );
            launchIntent.putExtras(extras);

            PendingIntent fullScreenPi = PendingIntent.getActivity(
                ctx,
                INCOMING_CALL_NOTIFICATION_ID,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // 4. Post high-priority CATEGORY_CALL full-screen intent notification
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    try {
                        nm.deleteNotificationChannel("jatext_incoming_calls_v2");
                        nm.deleteNotificationChannel("jatext_incoming_calls_v3");
                    } catch (Throwable ignored) {}
                    NotificationChannel ch = new NotificationChannel(
                        INCOMING_CALL_CHANNEL_ID,
                        "Incoming Calls",
                        NotificationManager.IMPORTANCE_HIGH
                    );
                    ch.setDescription("Full-screen alerts for incoming JaText voice and video calls");
                    ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    ch.enableVibration(true);
                    ch.setSound(null, null);
                    nm.createNotificationChannel(ch);
                }

                int iconRes = ctx.getApplicationInfo().icon;
                if (iconRes == 0) {
                    iconRes = android.R.drawable.sym_call_incoming;
                }

                String safeTitle = (callerTitle != null && !callerTitle.isEmpty())
                    ? callerTitle
                    : "Incoming JaText Call";
                String subtitle = isVideo
                    ? "Incoming video call · Tap to answer"
                    : "Incoming voice call · Tap to answer";

                NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, INCOMING_CALL_CHANNEL_ID)
                    .setSmallIcon(iconRes)
                    .setContentTitle(safeTitle)
                    .setContentText(subtitle)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setOngoing(true)
                    .setAutoCancel(true)
                    .setTimeoutAfter(INCOMING_CALL_RING_TIMEOUT_MS)
                    .setContentIntent(fullScreenPi)
                    .setFullScreenIntent(fullScreenPi, true)
                    .addAction(android.R.drawable.sym_call_incoming, "Answer / View Call", fullScreenPi);

                nm.notify("incoming_call", INCOMING_CALL_NOTIFICATION_ID, builder.build());
            }

            // 5. Directly launch MainActivity to the foreground immediately (works when minimized
            // and over lock screen when Display Over Other Apps / Full Screen Intent is enabled!)
            try {
                ctx.startActivity(launchIntent);
            } catch (Throwable ignored) {}
        }

        // 6. Auto-stop native ringtone/wakeup after 1 minute (60s) if unanswered
        if (incomingTimeoutRunnable != null) {
            mainHandler.removeCallbacks(incomingTimeoutRunnable);
        }
        final Context appCtx = ctx.getApplicationContext();
        incomingTimeoutRunnable = () -> cancelIncomingCallWakeup(appCtx, false);
        mainHandler.postDelayed(incomingTimeoutRunnable, INCOMING_CALL_RING_TIMEOUT_MS);
    }

    public static void cancelIncomingCallWakeup(Context ctx) {
        cancelIncomingCallWakeup(ctx, false);
    }

    public static void cancelIncomingCallWakeup(Context ctx, boolean suppressRecentRetrigger) {
        if (suppressRecentRetrigger) {
            suppressCallWakeUntilMs = System.currentTimeMillis() + 8_000L;
        }
        if (incomingTimeoutRunnable != null) {
            mainHandler.removeCallbacks(incomingTimeoutRunnable);
            incomingTimeoutRunnable = null;
        }
        stopIncomingRingtoneLoop();
        MainActivity.setCallLockScreenMode(false);
        synchronized (LOCK) {
            if (incomingWakeLock != null) {
                try {
                    if (incomingWakeLock.isHeld()) incomingWakeLock.release();
                } catch (Throwable ignored) {}
                incomingWakeLock = null;
            }
        }
        if (ctx != null) {
            try {
                NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    nm.cancel("incoming_call", INCOMING_CALL_NOTIFICATION_ID);
                }
            } catch (Throwable ignored) {}
        }
    }

    private static MediaPlayer createConfiguredPlayer(
        Context ctx,
        String category,
        String mode,
        String uriOrPath,
        boolean loop,
        int audioUsage
    ) throws Exception {
        MediaPlayer mp = new MediaPlayer();
        mp.setAudioAttributes(
            new AudioAttributes.Builder()
                .setUsage(audioUsage)
                .setContentType(
                    audioUsage == AudioAttributes.USAGE_MEDIA
                        ? AudioAttributes.CONTENT_TYPE_MUSIC
                        : AudioAttributes.CONTENT_TYPE_SONIFICATION
                )
                .build()
        );

        boolean sourceSet = false;
        if ("custom".equals(mode) && uriOrPath != null && !uriOrPath.isEmpty()) {
            File f = new File(uriOrPath);
            if (f.exists()) {
                mp.setDataSource(f.getAbsolutePath());
                sourceSet = true;
            }
        } else if ("system".equals(mode) && uriOrPath != null && !uriOrPath.isEmpty()) {
            mp.setDataSource(ctx, Uri.parse(uriOrPath));
            sourceSet = true;
        }

        if (!sourceSet) {
            int rawResId = "ringtone".equalsIgnoreCase(category)
                ? R.raw.jatext_ringtone
                : R.raw.jatext_notification;
            AssetFileDescriptor afd = ctx.getResources().openRawResourceFd(rawResId);
            if (afd == null) {
                mp.release();
                return null;
            }
            try {
                mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            } finally {
                try {
                    afd.close();
                } catch (Throwable ignored) {}
            }
        }

        mp.setVolume(1.0f, 1.0f);
        mp.setLooping(loop);
        mp.prepare();
        return mp;
    }

    @SuppressWarnings("deprecation")
    private static void startCallVibration(Context ctx) {
        stopCallVibration();
        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null && am.getRingerMode() == AudioManager.RINGER_MODE_SILENT) {
                return;
            }
            Vibrator vib;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vib = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                vib = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vib != null && vib.hasVibrator()) {
                long[] pattern = new long[] { 0L, 650L, 950L };
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vib.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vib.vibrate(pattern, 0);
                }
                activeVibrator = vib;
            }
        } catch (Throwable ignored) {}
    }

    private static void stopCallVibration() {
        if (activeVibrator != null) {
            try {
                activeVibrator.cancel();
            } catch (Throwable ignored) {}
            activeVibrator = null;
        }
    }

    private static void stopPlayerQuietly(MediaPlayer mp) {
        if (mp == null) return;
        try {
            if (mp.isPlaying()) mp.stop();
        } catch (Throwable ignored) {}
        try {
            mp.reset();
        } catch (Throwable ignored) {}
        try {
            mp.release();
        } catch (Throwable ignored) {}
    }
}
