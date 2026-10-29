package com.ahad00010.jatext;

import android.content.Intent;
import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Intercepts FCM messages BEFORE Firebase's automatic system tray display:
 * - Suppresses ALL notifications while JaText is actively in the foreground so users never see
 *   popups while already inside the app.
 * - Immediately wakes the phone screen, opens MainActivity over lock screen / minimized state,
 *   and loops the call ringtone whenever an incoming voice or video call arrives!
 * - Decrypts E2EE messages on-device in Java using ECDH P-256 + AES-256-GCM (like WhatsApp)
 *   so heads-up banners and the notification bar ALWAYS show the real message text!
 */
public class JaTextFirebaseMessagingService extends MessagingService {

    @Override
    public void handleIntent(Intent intent) {
        if (MainActivity.isAppInForeground()) {
            if (intent != null && intent.getExtras() != null) {
                boolean hasNotificationPayload =
                    intent.hasExtra("gcm.notification.title") ||
                    intent.hasExtra("gcm.notification.body") ||
                    intent.hasExtra("gcm.n.e");
                if (hasNotificationPayload) {
                    return;
                }
            }
        }

        if (intent != null && intent.getExtras() != null) {
            boolean hasNotificationPayload =
                intent.hasExtra("gcm.notification.title") ||
                intent.hasExtra("gcm.notification.body") ||
                intent.hasExtra("gcm.n.e");
            if (hasNotificationPayload) {
                String title = intent.getStringExtra("gcm.notification.title");
                if (title == null) title = intent.getStringExtra("title");
                String rawWire = intent.getStringExtra("rawWire");
                String notifBody = intent.getStringExtra("gcm.notification.body");
                if (notifBody == null) notifBody = intent.getStringExtra("body");
                String rawBody = (rawWire != null && !rawWire.isEmpty()) ? rawWire : notifBody;

                String senderId = intent.getStringExtra("senderId");
                String groupId = intent.getStringExtra("groupId");
                String chatId = intent.getStringExtra("chatId");
                String type = intent.getStringExtra("type");
                String msgId = intent.getStringExtra("google.message_id");

                JaTextE2EEDecryptor.handleBackgroundPush(
                    getApplicationContext(),
                    title,
                    rawBody,
                    senderId,
                    groupId,
                    chatId,
                    type,
                    msgId
                );
                return;
            }
        }

        super.handleIntent(intent);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        if (MainActivity.isAppInForeground()) {
            return;
        }
        Map<String, String> data = remoteMessage.getData();
        RemoteMessage.Notification notif = remoteMessage.getNotification();
        String title = notif != null ? notif.getTitle() : (data != null ? data.get("title") : null);
        String rawWire = data != null ? data.get("rawWire") : null;
        String rawBody = (rawWire != null && !rawWire.isEmpty())
            ? rawWire
            : (notif != null ? notif.getBody() : (data != null ? data.get("body") : null));
        String senderId = data != null ? data.get("senderId") : null;
        String groupId = data != null ? data.get("groupId") : null;
        String chatId = data != null ? data.get("chatId") : null;
        String type = data != null ? data.get("type") : null;

        if (rawBody != null || senderId != null || groupId != null || chatId != null || type != null) {
            JaTextE2EEDecryptor.handleBackgroundPush(
                getApplicationContext(),
                title,
                rawBody,
                senderId,
                groupId,
                chatId,
                type,
                remoteMessage.getMessageId()
            );
            return;
        }
        super.onMessageReceived(remoteMessage);
    }
}
