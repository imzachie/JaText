package com.ahad00010.jatext;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static volatile boolean appInForeground = false;

    public static boolean isAppInForeground() {
        return appInForeground;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JaTextNativePlugin.class);
        this.initialPlugins.add(SafePushNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        appInForeground = true;
        ensureMessagesNotificationChannel();
        if (getBridge() != null) {
            getBridge().registerPlugin(SafePushNotificationsPlugin.class);
            if (getBridge().getWebView() != null) {
                getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
            }
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        applyStatusBarAppearance();
    }

    @Override
    public void onStart() {
        super.onStart();
        appInForeground = true;
        clearDeliveredMessageNotifications();
    }

    @Override
    public void onResume() {
        super.onResume();
        appInForeground = true;
        clearDeliveredMessageNotifications();
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebViewAliveForActiveScreenShare();
    }

    @Override
    public void onStop() {
        appInForeground = false;
        super.onStop();
        keepWebViewAliveForActiveScreenShare();
    }

    @Override
    public void onDestroy() {
        appInForeground = false;
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            appInForeground = true;
            applyStatusBarAppearance();
        }
    }

    private void keepWebViewAliveForActiveScreenShare() {
        if (!ScreenCaptureService.isCapturing()) return;
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.onResume();
                webView.resumeTimers();
            }
        } catch (Throwable ignored) {}
    }

    private void clearDeliveredMessageNotifications() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                StatusBarNotification[] active = nm.getActiveNotifications();
                if (active != null) {
                    for (StatusBarNotification notif : active) {
                        if (notif.getId() != ScreenCaptureService.NOTIFICATION_ID) {
                            if (notif.getTag() != null) {
                                nm.cancel(notif.getTag(), notif.getId());
                            } else {
                                nm.cancel(notif.getId());
                            }
                        }
                    }
                }
            }
        } catch (Throwable ignored) {}
    }

    private void applyStatusBarAppearance() {
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().getDecorView().setBackgroundColor(Color.rgb(11, 11, 16));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.setAppearanceLightStatusBars(false);
    }

    private void ensureMessagesNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null) {
                    NotificationChannel channel = new NotificationChannel(
                        "messages",
                        "Messages",
                        NotificationManager.IMPORTANCE_HIGH
                    );
                    channel.setDescription("New JaText messages and call alerts");
                    channel.enableVibration(true);
                    nm.createNotificationChannel(channel);
                }
            } catch (Throwable ignored) {}
        }
    }
}
