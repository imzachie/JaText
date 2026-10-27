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
            if (ctx == null) return;
            RemoteMessage.Notification notif = remoteMessage.getNotification();
            Map<String, String> data = remoteMessage.getData();

            String title = notif != null && notif.getTitle() != null
                ? notif.getTitle()
                : data.get("title");
            String body = notif != null && notif.getBody() != null
                ? notif.getBody()
                : data.get("body");
            if ((title == null || title.isEmpty()) && (body == null || body.isEmpty())) {
                return;
            }
            if (body != null) {
                if (body.contains("__JATEXT_E2EE_V1__:")) {
                    int markerIdx = body.indexOf("__JATEXT_E2EE_V1__:");
                    String prefixLabel = body.substring(0, markerIdx)
                        .replace("\u200B", "")
                        .replace("\u200C", "")
                        .replace("\u2063", "")
                        .trim();
                    body = prefixLabel.isEmpty()
                        ? "🔒 Sent you a message · Tap to open"
                        : prefixLabel;
                } else {
                    body = body
                        .replace("\u200B", "")
                        .replace("\u200C", "")
                        .replace("\u2063", "")
                        .trim();
                }
                if (body.startsWith("__JATEXT_CALL_SIG__:")) {
                    return;
                }
                if (body.startsWith("__JATEXT_BUBBLE__:")) {
                    int nl = body.indexOf('\n');
                    body = nl >= 0 ? body.substring(nl + 1) : body;
                }
                if (body.startsWith("__JATEXT_CALL_GRP__:")) {
                    body = body.contains("\"mode\":\"video\"")
                        ? "📹 Incoming group video call"
                        : "📞 Incoming group voice call";
                } else if (body.startsWith("__JATEXT_CALL__:")) {
                    body = body.contains("\"mode\":\"video\"")
                        ? "📹 Incoming video call"
                        : "📞 Incoming voice call";
                } else if (body.startsWith("__JATEXT_WALLPAPER__:") || body.startsWith("__JATEXT_WP__:")) {
                    body = "🖼️ Updated the chat wallpaper";
                }
            }

            NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    "messages",
                    "Messages",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("New JaText messages and call alerts");
                channel.enableVibration(true);
                nm.createNotificationChannel(channel);
            }

            Intent launchIntent = new Intent(ctx, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            String msgId = remoteMessage.getMessageId() != null
                ? remoteMessage.getMessageId()
                : String.valueOf(System.currentTimeMillis());
            launchIntent.putExtra("google.message_id", msgId);
            for (Map.Entry<String, String> entry : data.entrySet()) {
                launchIntent.putExtra(entry.getKey(), entry.getValue());
            }

            int reqCode = (int) (System.currentTimeMillis() & 0x7FFFFFFF);
            PendingIntent pi = PendingIntent.getActivity(
                ctx,
                reqCode,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            int iconRes = ctx.getApplicationInfo().icon;
            if (iconRes == 0) {
                iconRes = android.R.drawable.sym_action_chat;
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, "messages")
                .setSmallIcon(iconRes)
                .setContentTitle(title != null ? title : "JaText")
                .setContentText(body != null ? body : "New message")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body != null ? body : "New message"))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(pi);

            String tag = data.containsKey("groupId")
                ? "group:" + data.get("groupId")
                : data.containsKey("senderId")
                    ? "dm:" + data.get("senderId")
                    : msgId;
            nm.notify(tag, 1001, builder.build());
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
