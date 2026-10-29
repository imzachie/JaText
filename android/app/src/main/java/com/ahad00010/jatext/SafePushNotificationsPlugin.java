package com.ahad00010.jatext;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

@CapacitorPlugin(
    name = "PushNotifications",
    permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "receive")
)
public class SafePushNotificationsPlugin extends PushNotificationsPlugin {

    @Override
    public void load() {
        try {
            if (MainActivity.isActivelyVisibleUnlocked(getContext())) {
                PushNotificationsPlugin.lastMessage = null;
            }
            super.load();
        } catch (Throwable ignored) {
            // Keep app running even if notification services fail during startup.
        }
    }

    @Override
    protected void handleOnNewIntent(Intent data) {
        if (data != null && data.getExtras() != null) {
            Bundle extras = data.getExtras();
            boolean isCallWake =
                extras.getBoolean("incomingCallWake", false) ||
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
        if (remoteMessage == null) return;
        Context ctx = getContext();

        // When the user has JaText actively open on an unlocked, interactive screen, NEVER show a system notification!
        if (MainActivity.isActivelyVisibleUnlocked(ctx)) {
            JSObject remoteMessageData = new JSObject();
            JSObject data = new JSObject();
            remoteMessageData.put("id", remoteMessage.getMessageId());
            for (Map.Entry<String, String> entry : remoteMessage.getData().entrySet()) {
                data.put(entry.getKey(), entry.getValue());
            }
            remoteMessageData.put("data", data);
            notifyListeners("pushNotificationReceived", remoteMessageData, true);
            return;
        }

        if (ctx == null) return;

        final Context appCtx = ctx.getApplicationContext();
        final RemoteMessage.Notification notif = remoteMessage.getNotification();
        final Map<String, String> data = remoteMessage.getData();
        final String title = notif != null && notif.getTitle() != null
            ? notif.getTitle()
            : (data != null ? data.get("title") : null);
        final String rawWire = data != null ? data.get("rawWire") : null;
        final String rawBody = (rawWire != null && !rawWire.isEmpty())
            ? rawWire
            : (notif != null && notif.getBody() != null
                ? notif.getBody()
                : (data != null ? data.get("body") : null));
        final String senderId = data != null ? data.get("senderId") : null;
        final String groupId = data != null ? data.get("groupId") : null;
        final String chatId = data != null ? data.get("chatId") : null;
        final String type = data != null ? data.get("type") : null;
        final String callMode = data != null ? data.get("callMode") : null;
        final boolean isEncrypted = data != null && "1".equals(data.get("isEncrypted"));
        final String msgId = remoteMessage.getMessageId();

        new Thread(() -> {
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
        }).start();
    }

    @Override
    @PluginMethod
    public void register(PluginCall call) {
        if (!JaTextNativePlugin.isFirebaseConfigured(getContext())) {
            sendError("Firebase push is not configured in this APK build.");
            call.resolve();
            return;
        }
        try {
            super.register(call);
        } catch (Throwable t) {
            String msg = t.getLocalizedMessage() != null ? t.getLocalizedMessage() : t.toString();
            sendError(msg);
            call.resolve();
        }
    }

    @Override
    @PluginMethod
    public void unregister(PluginCall call) {
        if (!JaTextNativePlugin.isFirebaseConfigured(getContext())) {
            call.resolve();
            return;
        }
        try {
            super.unregister(call);
        } catch (Throwable ignored) {
            call.resolve();
        }
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        this.checkPermissions(call);
    }
}
