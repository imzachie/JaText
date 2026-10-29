package com.ahad00010.jatext;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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

    public static final String DEFAULT_MESSAGES_CHANNEL_ID = "jatext_messages_default_v2";
    public static final String CUSTOM_MESSAGES_CHANNEL_ID = "jatext_messages_custom_v2";
    public static final String INCOMING_CALL_CHANNEL_ID = "jatext_incoming_calls_v2";
    public static final int INCOMING_CALL_NOTIFICATION_ID = 9413;

    private static final String SYS_CHANNEL_PREFIX = "jatext_msg_sys_";
    private static final long INCOMING_CALL_RING_TIMEOUT_MS = 60_000L;

    private static final Object LOCK = new Object();
    private static MediaPlayer activeRingtonePlayer = null;
    private static MediaPlayer activePreviewPlayer = null;
    private static MediaPlayer activeNotifPlayer = null;
    private static Vibrator activeVibrator = null;
    private static PowerManager.WakeLock incomingWakeLock = null;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static Runnable incomingTimeoutRunnable = null;

    private JaTextSoundManager() {}

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

        // Clean up legacy v1 channel that used generic OS beep
        try {
            nm.deleteNotificationChannel("messages");
        } catch (Throwable ignored) {}

        AudioAttributes notifAttrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        // Always keep default JaText channel registered (also referenced by AndroidManifest meta-data)
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
        // Clean older custom files of the same category to avoid storage bloat
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
                MediaPlayer mp = createConfiguredPlayer(ctx, category, mode, uriOrPath, loop, false);
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

        String mode = sp.getString("ringtone_mode", "default");
        String uriStr = sp.getString("ringtone_uri", "");

        synchronized (LOCK) {
            stopPlayerQuietly(activeRingtonePlayer);
            activeRingtonePlayer = null;

            boolean canPlayAudio = true;
            try {
                AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
                if (am != null && am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) {
                    canPlayAudio = false;
                }
            } catch (Throwable ignored) {}

            if (canPlayAudio) {
                try {
                    MediaPlayer mp = createConfiguredPlayer(ctx, "ringtone", mode, uriStr, true, true);
                    if (mp != null) {
                        mp.start();
                        activeRingtonePlayer = mp;
                    }
                } catch (Throwable ignored) {}
            }

            startCallVibration(ctx);
        }
    }

    public static void stopIncomingRingtoneLoop() {
        synchronized (LOCK) {
            stopPlayerQuietly(activeRingtonePlayer);
            activeRingtonePlayer = null;
            stopCallVibration();
        }
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
        SharedPreferences sp = JaTextE2EEDecryptor.prefs(ctx);
        if (sp.getBoolean("is_dnd", false)) return;

        // 1. Wake up screen immediately even if device is sleeping / locked
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

        // 2. Build incoming call launch intent for MainActivity
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

        // 3. Post high-priority CATEGORY_CALL full-screen intent notification
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
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
                .addAction(android.R.drawable.sym_call_incoming, "Open Call", fullScreenPi);

            nm.notify("incoming_call", INCOMING_CALL_NOTIFICATION_ID, builder.build());
        }

        // 4. Start looping call ringtone right away while waking up
        startIncomingRingtoneLoop(ctx);

        // 5. Directly launch MainActivity to the foreground immediately when minimized or unlocked!
        try {
            KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
            boolean locked = km != null && km.isKeyguardLocked();
            if (!locked || android.provider.Settings.canDrawOverlays(ctx)) {
                ctx.startActivity(launchIntent);
            } else {
                // Even when locked, attempt activity launch alongside fullScreenIntent
                ctx.startActivity(launchIntent);
            }
        } catch (Throwable ignored) {}

        // 6. Auto-dismiss native wake alert after 1 minute (60s) if unanswered
        if (incomingTimeoutRunnable != null) {
            mainHandler.removeCallbacks(incomingTimeoutRunnable);
        }
        final Context appCtx = ctx.getApplicationContext();
        incomingTimeoutRunnable = () -> cancelIncomingCallWakeup(appCtx);
        mainHandler.postDelayed(incomingTimeoutRunnable, INCOMING_CALL_RING_TIMEOUT_MS);
    }

    public static void cancelIncomingCallWakeup(Context ctx) {
        if (incomingTimeoutRunnable != null) {
            mainHandler.removeCallbacks(incomingTimeoutRunnable);
            incomingTimeoutRunnable = null;
        }
        stopIncomingRingtoneLoop();
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
        boolean asRingtoneUsage
    ) throws Exception {
        MediaPlayer mp = new MediaPlayer();
        mp.setAudioAttributes(
            new AudioAttributes.Builder()
                .setUsage(
                    asRingtoneUsage
                        ? AudioAttributes.USAGE_NOTIFICATION_RINGTONE
                        : ("ringtone".equalsIgnoreCase(category)
                            ? AudioAttributes.USAGE_NOTIFICATION_RINGTONE
                            : AudioAttributes.USAGE_NOTIFICATION)
                )
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
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
            Uri fallback = "ringtone".equalsIgnoreCase(category)
                ? getBundledDefaultRingtoneUri(ctx)
                : getBundledDefaultNotificationUri(ctx);
            mp.setDataSource(ctx, fallback);
        }

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
