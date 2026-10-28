package com.ahad00010.jatext;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
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
            if (MainActivity.isAppInForeground()) {
                PushNotificationsPlugin.lastMessage = null;
            }
            super.load();
        } catch (Throwable ignored) {
            // Keep app running even if notification services fail during startup.
        }
    }

    @Override
    public void fireNotification(RemoteMessage remoteMessage) {
        if (remoteMessage == null) return;

        // When the user has JaText open in the foreground, NEVER show a system notification!
        if (MainActivity.isAppInForeground()) {
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

        // App is minimized / backgrounded: show Android system notification!
        postBackgroundSystemNotification(remoteMessage);
    }

    private void postBackgroundSystemNotification(RemoteMessage remoteMessage) {
        try {
            Context ctx = getContext();
            if (ctx == null || !JaTextE2EEDecryptor.areNotificationsAllowed(ctx)) return;
            RemoteMessage.Notification notif = remoteMessage.getNotification();
            Map<String, String> data = remoteMessage.getData();

            String title = notif != null && notif.getTitle() != null
                ? notif.getTitle()
                : data.get("title");
            String rawBody = notif != null && notif.getBody() != null
                ? notif.getBody()
                : data.get("body");
            String senderId = data.get("senderId");
            String groupId = data.get("groupId");
            if ((title == null || title.isEmpty()) && (rawBody == null || rawBody.isEmpty())) {
                return;
            }

            String readableBody = JaTextE2EEDecryptor.resolveNotificationBody(
                ctx,
                rawBody,
                senderId,
                groupId
            );
            if (readableBody == null || readableBody.isEmpty()) {
                return;
            }

            String msgId = remoteMessage.getMessageId() != null
                ? remoteMessage.getMessageId()
                : String.valueOf(System.currentTimeMillis());
            android.os.Bundle extras = new android.os.Bundle();
            extras.putString("google.message_id", msgId);
            for (Map.Entry<String, String> entry : data.entrySet()) {
                extras.putString(entry.getKey(), entry.getValue());
            }

            String tag = (groupId != null && !groupId.isEmpty())
                ? "group:" + groupId
                : (senderId != null && !senderId.isEmpty())
                    ? "dm:" + senderId
                    : msgId;
            JaTextE2EEDecryptor.postSystemMessageNotification(
                ctx,
                tag,
                title != null ? title : "JaText",
                readableBody,
                extras
            );
        } catch (Throwable ignored) {}
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
