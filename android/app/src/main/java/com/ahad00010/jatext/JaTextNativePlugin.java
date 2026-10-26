package com.ahad00010.jatext;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "JaTextNative")
public class JaTextNativePlugin extends Plugin {

    public static boolean isFirebaseConfigured(Context ctx) {
        if (ctx == null) {
            return false;
        }
        try {
            int appIdRes = ctx.getResources().getIdentifier("google_app_id", "string", ctx.getPackageName());
            if (appIdRes == 0) {
                return false;
            }
            String appId = ctx.getString(appIdRes);
            return appId != null && !appId.trim().isEmpty();
        } catch (Throwable ignored) {
            return false;
        }
    }

    @PluginMethod
    public void checkPushSupport(PluginCall call) {
        JSObject result = new JSObject();
        result.put("firebaseConfigured", isFirebaseConfigured(getContext()));
        call.resolve(result);
    }
}
