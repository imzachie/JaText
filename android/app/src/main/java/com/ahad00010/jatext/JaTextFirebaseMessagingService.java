package com.ahad00010.jatext;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Looper;
import android.os.PowerManager;
import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Intercepts ALL Firebase Cloud Messaging events (`com.google.firebase.MESSAGING_EVENT`)
 * BEFORE Firebase's default system-tray renderer can ever display raw E2EE ciphertext:
 * - Suppresses popups when JaText is actively visible on an unlocked, interactive screen.
 * - Immediately wakes the phone screen, opens MainActivity over lock screen / minimized state,
 *   and loops the call ringtone whenever an incoming voice or video call arrives.
 * - Decrypts E2EE messages on-device in Java using ECDH P-256 + AES-256-GCM (fetching full
 *   untruncated wire envelopes from Convex when needed) so notifications ALWAYS show real text!
 */
public class JaTextFirebaseMessagingService extends MessagingService {

    private static final ExecutorService PUSH_EXECUTOR = Executors.newCachedThreadPool();

    private static String firstNonEmpty(Bundle extras, String... keys) {
        if (extras == null) return null;
        for (String k : keys) {
            String val = extras.getString(k);
            if (val != null && !val.isEmpty()) {
                return val;
            }
        }
        return null;
    }

    @Override
    public void handleIntent(Intent intent) {
        final Context appCtx = getApplicationContext();
        if (intent == null || intent.getExtras() == null) {
            super.handleIntent(intent);
            return;
        }

        Bundle extras = intent.getExtras();
        String messageType = extras.getString("message_type");
        if (messageType != null && !"gcm".equals(messageType)) {
            super.handleIntent(intent);
            return;
        }

        final String type = extras.getString("type");
        if ("call_cancel".equals(type)) {
            JaTextSoundManager.cancelIncomingCallWakeup(appCtx, true);
            return;
        }

        boolean hasNotificationPayload =
            extras.containsKey("gcm.notification.title") ||
            extras.containsKey("gcm.notification.body") ||
            extras.containsKey("gcm.n.title") ||
            extras.containsKey("gcm.n.body") ||
            extras.containsKey("gcm.n.e");

        final String title = firstNonEmpty(
            extras,
            "gcm.notification.title",
            "gcm.n.title",
            "title"
        );
        final String notifBody = firstNonEmpty(
            extras,
            "gcm.notification.body",
            "gcm.n.body",
            "body"
        );
        final String rawWire = extras.getString("rawWire");
        final String rawBody = (rawWire != null && !rawWire.isEmpty()) ? rawWire : notifBody;
        final String senderId = extras.getString("senderId");
        final String groupId = extras.getString("groupId");
        final String chatId = extras.getString("chatId");
        final String callMode = extras.getString("callMode");
        final boolean isEncrypted =
            "1".equals(extras.getString("isEncrypted")) ||
            (rawBody != null && rawBody.contains("__JATEXT_E2EE_V1__:"));
        final String msgId = firstNonEmpty(extras, "google.message_id", "message_id");

        // Never post OS banners when the user is actively looking at JaText on an unlocked screen!
        if (MainActivity.isActivelyVisibleUnlocked(appCtx)) {
            if (!hasNotificationPayload) {
                super.handleIntent(intent);
            }
            return;
        }

        // Intercept BOTH legacy `notification` pushes AND `data`-only pushes here so Firebase's
        // built-in DisplayNotification NEVER posts raw `__JATEXT_E2EE_V1__:` ciphertext!
        if (
            hasNotificationPayload ||
            rawBody != null ||
            senderId != null ||
            groupId != null ||
            chatId != null ||
            type != null
        ) {
            Runnable task = () -> {
                PowerManager.WakeLock wl = null;
                try {
                    PowerManager pm = (PowerManager) appCtx.getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "JaText:PushDecryptWake");
                        wl.setReferenceCounted(false);
                        wl.acquire(12_000L);
                    }
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
                } catch (Throwable ignored) {
                } finally {
                    if (wl != null) {
                        try {
                            if (wl.isHeld()) wl.release();
                        } catch (Throwable ignored) {}
                    }
                }
            };

            if (Looper.myLooper() == Looper.getMainLooper()) {
                PUSH_EXECUTOR.execute(task);
            } else {
                task.run();
            }
            return;
        }

        super.handleIntent(intent);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Context appCtx = getApplicationContext();
        Map<String, String> data = remoteMessage.getData();
        String type = data != null ? data.get("type") : null;

        if ("call_cancel".equals(type)) {
            JaTextSoundManager.cancelIncomingCallWakeup(appCtx, true);
            return;
        }

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
