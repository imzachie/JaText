package com.ahad00010.jatext;

import android.content.Intent;
import android.os.Bundle;
import com.capacitorjs.plugins.pushnotifications.MessagingService;

/**
 * Custom FCM MessagingService that intercepts background/killed FCM notification intents
 * BEFORE Google Play Services auto-displays raw E2EE ciphertext, decrypts the message on-device
 * (like WhatsApp), and displays the actual readable message text in the notification shade.
 */
public class JaTextFirebaseMessagingService extends MessagingService {

    @Override
    public void handleIntent(Intent intent) {
        if (intent == null || !"com.google.android.c2dm.intent.RECEIVE".equals(intent.getAction())) {
            super.handleIntent(intent);
            return;
        }

        // When JaText is open in the foreground, delegate to Capacitor -> SafePushNotificationsPlugin
        // which suppresses system tray notifications while inside the app.
        if (MainActivity.isAppInForeground()) {
            super.handleIntent(intent);
            return;
        }

        Bundle extras = intent.getExtras();
        if (extras == null) {
            super.handleIntent(intent);
            return;
        }

        String title = firstNonEmpty(
            extras.getString("gcm.n.title"),
            extras.getString("gcm.notification.title"),
            extras.getString("title")
        );
        String rawBody = firstNonEmpty(
            extras.getString("rawWire"),
            extras.getString("gcm.n.body"),
            extras.getString("gcm.notification.body"),
            extras.getString("body")
        );
        String senderId = extras.getString("senderId");
        String groupId = extras.getString("groupId");
        String msgId = firstNonEmpty(
            extras.getString("google.message_id"),
            extras.getString("message_id"),
            String.valueOf(System.currentTimeMillis())
        );

        // If this is an internal FCM control packet with no notification/data payload, pass through
        if (title == null && rawBody == null && senderId == null && groupId == null) {
            super.handleIntent(intent);
            return;
        }

        if (!JaTextE2EEDecryptor.areNotificationsAllowed(this)) {
            return;
        }

        String readableBody = JaTextE2EEDecryptor.resolveNotificationBody(
            this,
            rawBody,
            senderId,
            groupId
        );
        if (readableBody == null || readableBody.isEmpty()) {
            return;
        }

        String tag = (groupId != null && !groupId.isEmpty())
            ? "group:" + groupId
            : (senderId != null && !senderId.isEmpty())
                ? "dm:" + senderId
                : msgId;

        Bundle launchExtras = new Bundle();
        launchExtras.putString("google.message_id", msgId);
        if (senderId != null) launchExtras.putString("senderId", senderId);
        if (groupId != null) launchExtras.putString("groupId", groupId);
        String type = extras.getString("type");
        if (type != null) launchExtras.putString("type", type);

        JaTextE2EEDecryptor.postSystemMessageNotification(
            this,
            tag,
            title != null ? title : "JaText",
            readableBody,
            launchExtras
        );
    }

    private static String firstNonEmpty(String... values) {
        if (values == null) return null;
        for (String v : values) {
            if (v != null && !v.trim().isEmpty()) {
                return v;
            }
        }
        return null;
    }
}
