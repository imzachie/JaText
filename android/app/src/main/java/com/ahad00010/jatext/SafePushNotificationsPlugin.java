package com.ahad00010.jatext;

import android.Manifest;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "PushNotifications",
    permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "receive")
)
public class SafePushNotificationsPlugin extends PushNotificationsPlugin {

    @Override
    public void load() {
        try {
            super.load();
        } catch (Throwable ignored) {
            // Keep app running even if notification services fail during startup.
        }
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
