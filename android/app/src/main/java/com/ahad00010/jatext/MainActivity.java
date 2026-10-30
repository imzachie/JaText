package com.ahad00010.jatext;

import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.service.notification.StatusBarNotification;
import android.view.Display;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.lang.ref.WeakReference;

public class MainActivity extends BridgeActivity {

    private static volatile boolean appInForeground = false;
    private static volatile WeakReference<MainActivity> activeInstanceRef = new WeakReference<>(null);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public static boolean isAppInForeground() {
        return appInForeground;
    }

    /**
     * Returns true ONLY when JaText is actively resumed in front of the user AND the physical
     * display is interactive (screen ON) AND the keyguard is unlocked (unless an incoming/active
     * call explicitly bypassed the lock screen).
     */
    public static boolean isActivelyVisibleUnlocked(Context ctx) {
        if (!appInForeground) return false;
        if (ctx == null) return appInForeground;
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                return false;
            }
            KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked()) {
                return false;
            }
        } catch (Throwable ignored) {}
        return true;
    }

    @SuppressWarnings("deprecation")
    public static void setCallLockScreenMode(boolean enabled) {
        MainActivity act = activeInstanceRef.get();
        if (act == null) return;
        act.runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    act.setShowWhenLocked(enabled);
                    act.setTurnScreenOn(enabled);
                } else if (enabled) {
                    act.getWindow().addFlags(
                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    );
                } else {
                    act.getWindow().clearFlags(
                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    );
                }
                if (enabled) {
                    act.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else if (!CallKeepAliveService.isCallActive()) {
                    act.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            } catch (Throwable ignored) {}
        });
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JaTextNativePlugin.class);
        this.initialPlugins.add(SafePushNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        activeInstanceRef = new WeakReference<>(this);
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
        installImeVisibilityNotifier();
        applyStatusBarAppearance();
        dispatchIncomingCallLaunchIfPresent(getIntent());
    }

    /**
     * Capacitor 8's built-in SystemBars plugin already pads DecorView bottom by imeInsets.bottom
     * and injects --safe-area-inset-* CSS variables. Do NOT add bottom padding on contentView here
     * (which would double-pad and create a black gap above the keyboard) — only observe IME
     * visibility changes and notify JS so the chat scroll container stays pinned to the bottom.
     */
    private boolean lastImeVisible = false;

    private void installImeVisibilityNotifier() {
        final View contentView = findViewById(android.R.id.content);
        if (contentView == null) return;
        ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
            try {
                boolean kbOpen = windowInsets.isVisible(WindowInsetsCompat.Type.ime());
                if (kbOpen != lastImeVisible) {
                    lastImeVisible = kbOpen;
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        String js =
                            "document.documentElement.classList.toggle('jatext-ime-open'," +
                            (kbOpen ? "true" : "false") +
                            ");" +
                            "window.dispatchEvent(new CustomEvent('jatext:ime-change',{detail:{open:" +
                            (kbOpen ? "true" : "false") +
                            "}}));";
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                }
            } catch (Throwable ignored) {}
            // DecorView (Capacitor SystemBars) already padded bottom by imeInsets.bottom, placing
            // WebView completely above the keyboard. Clear Type.ime() before WebView sees it so
            // Chromium never subtracts the keyboard height a second time inside WebView.
            return new WindowInsetsCompat.Builder(windowInsets)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .build();
        });
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
        activeInstanceRef = new WeakReference<>(this);
        appInForeground = true;
        clearDeliveredMessageNotifications();
    }

    @Override
    public void onResume() {
        super.onResume();
        activeInstanceRef = new WeakReference<>(this);
        appInForeground = true;
        // CRITICAL: Do NOT stop the looping call ringtone on resume — only clear the shade banner
        // once MainActivity is visible so the incoming call UI keeps ringing for the full 60s!
        JaTextSoundManager.onMainActivityResumed(this);
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
        appInForeground = false;
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
        if (activeInstanceRef.get() == this) {
            activeInstanceRef = new WeakReference<>(null);
        }
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
            applyStatusBarAppearance();
        }
    }

    @SuppressWarnings("deprecation")
    private void applyHighRefreshRateAndLockScreenFlags(Intent intent) {
        boolean isCallWake = false;
        if (intent != null && intent.getExtras() != null) {
            Bundle extras = intent.getExtras();
            isCallWake =
                extras.getBoolean("incomingCallWake", false) ||
                "incoming_call".equals(extras.getString("type"));
        }
        if (isCallWake || JaTextSoundManager.isIncomingRingtoneActive() || CallKeepAliveService.isCallActive()) {
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
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } catch (Throwable ignored) {}
        }

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
            // Clear intent extras after reading so normal later resumes don't re-trigger call wake
            intent.removeExtra("incomingCallWake");
            intent.removeExtra("type");
            mainHandler.postDelayed(
                () -> JaTextNativePlugin.emitNotificationOpen(senderId, groupId, chatId, isCallWake),
                120L
            );
        }
    }

    private void keepWebViewAliveForActiveMedia() {
        if (
            !CallKeepAliveService.isCallActive() &&
            !ScreenCaptureService.isCapturing() &&
            !JaTextSoundManager.isIncomingRingtoneActive()
        ) {
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
                            id != CallKeepAliveService.NOTIFICATION_ID &&
                            id != JaTextSoundManager.INCOMING_CALL_NOTIFICATION_ID
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
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(false);
            insetsController.setAppearanceLightNavigationBars(false);
        }
    }
}
