package com.ahad00010.jatext;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Crash-safe wrapper around Capacitor's PushNotificationsPlugin that:
 * 1. Prevents crashes if google-services.json is absent.
 * 2. Suppresses push notifications while JaText is actively in the foreground.
 * 3. Uses rawWire + JaTextE2EEDecryptor when minimized so incoming calls wake/open immediately
 *    and E2EE messages ALWAYS show decrypted readable text!
 */
@CapacitorPlugin(
    name = "PushNotifications",
    permissions = { @Permission(strings = { "android.permission.POST_NOTIFICATIONS" }, alias = "receive") }
)
public class SafePushNotificationsPlugin extends PushNotificationsPlugin {

    private boolean isFirebaseConfigured() {
        try {
            Context context = getContext();
            if (context == null) {
                return false;
            }
            if (!FirebaseApp.getApps(context).isEmpty()) {
                return true;
            }
            return FirebaseApp.initializeApp(context) != null;
        } catch (Throwable ignored) {
            return false;
        }
    }

    @Override
    protected void handleOnNewIntent(Intent data) {
        if (data != null && data.getExtras() != null) {
            Bundle extras = data.getExtras();
            boolean isCallWake = extras.getBoolean("incomingCallWake", false) ||
                "incoming_call".equals(extras.getString("type"));
            String senderId = extras.getString("senderId");
            String groupId = extras.getString("groupId");
            String chatId = extras.getString("chatId");
            if (isCallWake || senderId != null || groupId != null || chatId != null) {
                JaTextNativePlugin.emitNotificationOpen(senderId, groupId, chatId, isCallWake);
            }
        }
        try {
            super.handleOnNewIntent(data);
        } catch (Throwable ignored) {}
    }

    @Override
    public void fireNotification(RemoteMessage remoteMessage) {
        if (MainActivity.isAppInForeground()) {
            return;
        }
        Context ctx = getContext();
        if (ctx != null && remoteMessage != null) {
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

            new Thread(() -> {
                JaTextE2EEDecryptor.handleBackgroundPush(
                    ctx.getApplicationContext(),
                    title,
                    rawBody,
                    senderId,
                    groupId,
                    chatId,
                    type,
                    remoteMessage.getMessageId()
                );
            }).start();
            return;
        }

        Bridge b = getBridge();
        if (b != null) {
            b.saveInstanceState();
        }
        try {
            super.fireNotification(remoteMessage);
        } catch (Throwable ignored) {}
    }

    @Override
    @PluginMethod
    public void register(PluginCall call) {
        if (!isFirebaseConfigured()) {
            JSObject err = new JSObject();
            err.put("error", "Firebase is not configured on this Android build.");
            notifyListeners("registrationError", err, true);
            call.resolve();
            return;
        }
        try {
            super.register(call);
        } catch (Throwable t) {
            call.reject("Push registration unavailable: " + t.getMessage());
        }
    }

    @Override
    @PluginMethod
    public void unregister(PluginCall call) {
        if (!isFirebaseConfigured()) {
            call.resolve();
            return;
        }
        try {
            super.unregister(call);
        } catch (Throwable t) {
            call.resolve();
        }
    }
}
