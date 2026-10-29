package com.ahad00010.jatext;

import android.content.Context;
import android.content.Intent;
import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Intercepts FCM messages with 100% deterministic control:
 * - Suppresses message popups ONLY when JaText is actively visible on an unlocked, interactive screen.
 * - Immediately wakes the phone screen, opens MainActivity over lock screen / minimized state,
 *   and loops the call ringtone whenever an incoming voice or video call arrives!
 * - Decrypts E2EE messages on-device in Java using ECDH P-256 + AES-256-GCM (like WhatsApp)
 *   so heads-up banners and the notification bar ALWAYS show the real message text!
 */
public class JaTextFirebaseMessagingService extends MessagingService {

    @Override
    public void handleIntent(Intent intent) {
        Context appCtx = getApplicationContext();
        if (intent != null && intent.getExtras() != null) {
            boolean hasNotificationPayload =
                intent.hasExtra("gcm.notification.title") ||
                intent.hasExtra("gcm.notification.body") ||
                intent.hasExtra("gcm.n.e");
            if (hasNotificationPayload) {
                if (MainActivity.isActivelyVisibleUnlocked(appCtx)) {
                    return;
                }
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
                String callMode = intent.getStringExtra("callMode");
                boolean isEncrypted = "1".equals(intent.getStringExtra("isEncrypted"));
                String msgId = intent.getStringExtra("google.message_id");

                JaTextE2EEDecryptor.handleBackgroundPush(
                    appCtx,
                    title,
                    rawBody,
                    senderId,
                    groupId,
                    chatId,
                    type,
                    callMode,
                    isEncrypted,
                    msgId
                );
                return;
            }
        }

        super.handleIntent(intent);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Context appCtx = getApplicationContext();
        Map<String, String> data = remoteMessage.getData();
        String type = data != null ? data.get("type") : null;

        if ("call_cancel".equals(type)) {
            JaTextSoundManager.cancelIncomingCallWakeup(appCtx);
            return;
        }

        // If user is actively viewing JaText on an unlocked, interactive screen, forward to
        // Capacitor JS without showing a system notification banner.
        if (MainActivity.isActivelyVisibleUnlocked(appCtx)) {
            super.onMessageReceived(remoteMessage);
            return;
        }

        RemoteMessage.Notification notif = remoteMessage.getNotification();
        String title = notif != null && notif.getTitle() != null
            ? notif.getTitle()
            : (data != null ? data.get("title") : null);
        String rawWire = data != null ? data.get("rawWire") : null;
        String rawBody = (rawWire != null && !rawWire.isEmpty())
            ? rawWire
            : (notif != null && notif.getBody() != null
                ? notif.getBody()
                : (data != null ? data.get("body") : null));
        String senderId = data != null ? data.get("senderId") : null;
        String groupId = data != null ? data.get("groupId") : null;
        String chatId = data != null ? data.get("chatId") : null;
        String callMode = data != null ? data.get("callMode") : null;
        boolean isEncrypted = data != null && "1".equals(data.get("isEncrypted"));

        if (rawBody != null || senderId != null || groupId != null || chatId != null || type != null) {
            JaTextE2EEDecryptor.handleBackgroundPush(
                appCtx,
                title,
                rawBody,
                senderId,
                groupId,
                chatId,
                type,
                callMode,
                isEncrypted,
                remoteMessage.getMessageId()
            );
        }
    }
}
