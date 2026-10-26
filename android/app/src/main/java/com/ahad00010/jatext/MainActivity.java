package com.ahad00010.jatext;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JaTextNativePlugin.class);
        this.initialPlugins.add(SafePushNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
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
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyStatusBarAppearance();
        }
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
