package com.ahad00010.jatext;

import android.app.NotificationManager;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.StatusBarNotification;
import android.view.Display;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static volatile boolean appInForeground = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public static boolean isAppInForeground() {
        return appInForeground;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JaTextNativePlugin.class);
        this.initialPlugins.add(SafePushNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        appInForeground = true;
        applyHighRefreshRateAndLockScreenFlags(getIntent());
        JaTextSoundManager.ensureActiveMessageChannel(this);
        if (getBridge() != null) {
            getBridge().registerPlugin(SafePushNotificationsPlugin.class);
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                WebSettings ws = webView.getSettings();
                ws.setMediaPlaybackRequiresUserGesture(false);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    ws.setOffscreenPreRaster(true);
                }
                webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
                webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
                JaTextWebView.installReceiveContentSupport(webView);
            }
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        applyStatusBarAppearance();
        dispatchIncomingCallLaunchIfPresent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyHighRefreshRateAndLockScreenFlags(intent);
        dispatchIncomingCallLaunchIfPresent(intent);
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
        JaTextSoundManager.cancelIncomingCallWakeup(this);
        clearDeliveredMessageNotifications();
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.onResume();
                webView.resumeTimers();
            }
        } catch (Throwable ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebViewAliveForActiveMedia();
    }

    @Override
    public void onStop() {
        appInForeground = false;
        super.onStop();
        keepWebViewAliveForActiveMedia();
        mainHandler.postDelayed(this::keepWebViewAliveForActiveMedia, 140L);
        mainHandler.postDelayed(this::keepWebViewAliveForActiveMedia, 480L);
    }

    @Override
    public void onDestroy() {
        appInForeground = false;
        mainHandler.removeCallbacksAndMessages(null);
        JaTextSoundManager.stopSoundPreview();
        try {
            stopService(new Intent(this, CallKeepAliveService.class));
        } catch (Throwable ignored) {}
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

    @SuppressWarnings("deprecation")
    private void applyHighRefreshRateAndLockScreenFlags(Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
            } else {
                getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                );
            }
            if (intent != null && intent.getBooleanExtra("incomingCallWake", false)) {
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        } catch (Throwable ignored) {}

        // Request the highest native refresh rate (60Hz / 90Hz / 120Hz) supported by the display
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Display display = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    ? getDisplay()
                    : getWindowManager().getDefaultDisplay();
                if (display != null) {
                    Display.Mode current = display.getMode();
                    Display.Mode[] modes = display.getSupportedModes();
                    Display.Mode best = current;
                    for (Display.Mode mode : modes) {
                        if (
                            mode.getPhysicalWidth() == current.getPhysicalWidth() &&
                            mode.getPhysicalHeight() == current.getPhysicalHeight() &&
                            mode.getRefreshRate() > best.getRefreshRate()
                        ) {
                            best = mode;
                        }
                    }
                    if (best.getModeId() != current.getModeId()) {
                        WindowManager.LayoutParams lp = getWindow().getAttributes();
                        lp.preferredDisplayModeId = best.getModeId();
                        getWindow().setAttributes(lp);
                    }
                }
            } catch (Throwable ignored) {}
        }
    }

    private void dispatchIncomingCallLaunchIfPresent(Intent intent) {
        if (intent == null) return;
        Bundle extras = intent.getExtras();
        if (extras == null) return;
        String type = extras.getString("type", "");
        boolean isCallWake = extras.getBoolean("incomingCallWake", false) || "incoming_call".equals(type);
        String senderId = extras.getString("senderId");
        String groupId = extras.getString("groupId");
        String chatId = extras.getString("chatId");
        if (isCallWake || senderId != null || groupId != null || chatId != null) {
            mainHandler.postDelayed(
                () -> JaTextNativePlugin.emitNotificationOpen(senderId, groupId, chatId, isCallWake),
                120L
            );
        }
    }

    private void keepWebViewAliveForActiveMedia() {
        if (!CallKeepAliveService.isCallActive() && !ScreenCaptureService.isCapturing()) {
            return;
        }
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
                        int id = notif.getId();
                        if (
                            id != ScreenCaptureService.NOTIFICATION_ID &&
                            id != CallKeepAliveService.NOTIFICATION_ID
                        ) {
                            if (notif.getTag() != null) {
                                nm.cancel(notif.getTag(), id);
                            } else {
                                nm.cancel(id);
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
}
