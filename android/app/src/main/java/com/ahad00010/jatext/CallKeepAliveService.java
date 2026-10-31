package com.ahad00010.jatext;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

public class CallKeepAliveService extends Service {

    public static final String ACTION_START = "com.ahad00010.jatext.CALL_KEEPALIVE_START";
    public static final String ACTION_STOP = "com.ahad00010.jatext.CALL_KEEPALIVE_STOP";
    public static final String EXTRA_TITLE = "callTitle";
    public static final String EXTRA_VIDEO = "withVideo";
    public static final int NOTIFICATION_ID = 9411;
    private static final String CHANNEL_ID = "active_call";

    private static volatile boolean callActive = false;

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    public static boolean isCallActive() {
        return callActive;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopKeepAlive();
            return START_NOT_STICKY;
        }

        if (ACTION_START.equals(intent.getAction())) {
            String title = intent.getStringExtra(EXTRA_TITLE);
            boolean withVideo = intent.getBooleanExtra(EXTRA_VIDEO, false);
            if (title == null || title.trim().isEmpty()) {
                title = "JaText Call";
            }

            try {
                ensureChannel();
                Notification notification = buildNotification(title, withVideo);

                boolean hasMicPerm =
                    ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
                    PackageManager.PERMISSION_GRANTED;
                boolean hasCamPerm =
                    withVideo &&
                    ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
                    PackageManager.PERMISSION_GRANTED;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    int fgsTypes = 0;
                    if (hasMicPerm) {
                        fgsTypes |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                    }
                    if (hasCamPerm) {
                        fgsTypes |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
                    }
                    if (fgsTypes == 0) {
                        stopSelf();
                        return START_NOT_STICKY;
                    }
                    startForeground(NOTIFICATION_ID, notification, fgsTypes);
                } else {
                    if (!hasMicPerm && !hasCamPerm) {
                        stopSelf();
                        return START_NOT_STICKY;
                    }
                    startForeground(NOTIFICATION_ID, notification);
                }

                callActive = true;
                acquireLocks();
            } catch (Throwable err) {
                // Never crash the app process if Android OEM restricts FGS start in a race condition
                callActive = true;
                acquireLocks();
                try {
                    stopSelf();
                } catch (Throwable ignored) {}
            }
        }

        return START_STICKY;
    }

    private Notification buildNotification(String title, boolean withVideo) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            9411,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        int iconRes = getApplicationInfo().icon;
        if (iconRes == 0) {
            iconRes = android.R.drawable.sym_call_outgoing;
        }

        String subtitle = (withVideo ? "Video call" : "Voice call") + " in progress · Tap to return";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(iconRes)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(contentIntent)
            .build();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Active Calls",
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Keeps voice and video calls connected while multitasking");
                channel.setSound(null, null);
                channel.enableVibration(false);
                nm.createNotificationChannel(channel);
            }
        }
    }

    @SuppressWarnings("deprecation")
    private void acquireLocks() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && (wakeLock == null || !wakeLock.isHeld())) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "JaText::CallWakeLock");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(4 * 60 * 60 * 1000L);
            }
        } catch (Throwable ignored) {}

        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null && (wifiLock == null || !wifiLock.isHeld())) {
                int lockMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                    : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wm.createWifiLock(lockMode, "JaText::CallWifiLock");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        } catch (Throwable ignored) {}
    }

    private void releaseLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Throwable ignored) {}
        wakeLock = null;

        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
        } catch (Throwable ignored) {}
        wifiLock = null;
    }

    private void stopKeepAlive() {
        callActive = false;
        releaseLocks();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Throwable ignored) {}
        try {
            stopSelf();
        } catch (Throwable ignored) {}
    }

    @Override
    public void onDestroy() {
        callActive = false;
        releaseLocks();
        super.onDestroy();
    }
}
