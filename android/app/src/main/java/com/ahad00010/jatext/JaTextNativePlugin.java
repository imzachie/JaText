package com.ahad00010.jatext;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "JaTextNative",
    permissions = {
        @Permission(
            strings = { Manifest.permission.RECORD_AUDIO, Manifest.permission.MODIFY_AUDIO_SETTINGS },
            alias = "microphone"
        ),
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
    }
)
public class JaTextNativePlugin extends Plugin {

    private static volatile JaTextNativePlugin activeInstance;

    private SpeechRecognizer speechRecognizer;
    private volatile boolean speechCaptureActive = false;
    private final StringBuilder accumulatedSpeech = new StringBuilder();
    private volatile File pendingUpdateApkFile = null;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
    }

    public static void emitScreenFrame(String base64Jpeg, int width, int height) {
        JaTextNativePlugin inst = activeInstance;
        if (inst == null) return;
        JSObject payload = new JSObject();
        payload.put("frame", base64Jpeg);
        payload.put("width", width);
        payload.put("height", height);
        inst.notifyListeners("screenCaptureFrame", payload);
    }

    public static void emitScreenAudio(String base64Pcm, int sampleRate) {
        JaTextNativePlugin inst = activeInstance;
        if (inst == null) return;
        JSObject payload = new JSObject();
        payload.put("pcm", base64Pcm);
        payload.put("sampleRate", sampleRate);
        inst.notifyListeners("screenCaptureAudio", payload);
    }

    public static void emitScreenCaptureStopped() {
        JaTextNativePlugin inst = activeInstance;
        if (inst == null) return;
        JSObject payload = new JSObject();
        payload.put("stopped", true);
        inst.notifyListeners("screenCaptureStopped", payload);
    }

    public static void emitRichContentPaste(String base64Data, String mimeType, String fileName) {
        JaTextNativePlugin inst = activeInstance;
        if (inst == null || base64Data == null || base64Data.isEmpty()) return;
        JSObject payload = new JSObject();
        payload.put("base64", base64Data);
        payload.put("mimeType", mimeType != null ? mimeType : "image/png");
        payload.put("fileName", fileName != null ? fileName : ("pasted-" + System.currentTimeMillis() + ".png"));
        inst.notifyListeners("richContentPaste", payload);
    }

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

    @PluginMethod
    @SuppressWarnings("deprecation")
    public void getAppVersionInfo(PluginCall call) {
        Context ctx = getContext();
        JSObject result = new JSObject();
        if (ctx == null) {
            result.put("versionName", "2.3");
            result.put("versionCode", 14);
            result.put("canInstallPackages", true);
            call.resolve(result);
            return;
        }
        try {
            PackageManager pm = ctx.getPackageManager();
            PackageInfo info = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? pm.getPackageInfo(ctx.getPackageName(), PackageManager.PackageInfoFlags.of(0))
                : pm.getPackageInfo(ctx.getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
            boolean canInstall = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || pm.canRequestPackageInstalls();
            result.put("versionName", info.versionName != null ? info.versionName : "2.2");
            result.put("versionCode", (int) versionCode);
            result.put("canInstallPackages", canInstall);
            call.resolve(result);
        } catch (Throwable err) {
            result.put("versionName", "2.2");
            result.put("versionCode", 13);
            result.put("canInstallPackages", true);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void openUnknownSourcesSettings(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.resolve();
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + ctx.getPackageName())
                );
                startActivityForResult(call, settingsIntent, "handleUnknownSourcesResult");
                return;
            } catch (Throwable ignored) {}
        }
        JSObject res = new JSObject();
        res.put("canInstallPackages", true);
        call.resolve(res);
    }

    @ActivityCallback
    private void handleUnknownSourcesResult(PluginCall call, ActivityResult result) {
        Context ctx = getContext();
        boolean canInstall = ctx == null ||
            Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            ctx.getPackageManager().canRequestPackageInstalls();

        if (canInstall && pendingUpdateApkFile != null && pendingUpdateApkFile.exists() && ctx != null) {
            File apk = pendingUpdateApkFile;
            pendingUpdateApkFile = null;
            launchPackageInstaller(ctx, apk);
        }

        if (call != null) {
            JSObject res = new JSObject();
            res.put("canInstallPackages", canInstall);
            res.put("launchedInstaller", canInstall);
            call.resolve(res);
        }
    }

    @PluginMethod
    public void fetchUpdateManifest(PluginCall call) {
        final String manifestUrl = call.getString("url");
        if (manifestUrl == null || manifestUrl.trim().isEmpty()) {
            call.reject("Missing manifest URL.");
            return;
        }
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                String currentUrl = manifestUrl.trim();
                for (int redirects = 0; redirects < 6; redirects++) {
                    URL url = new URL(currentUrl);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setUseCaches(false);
                    conn.setConnectTimeout(12000);
                    conn.setReadTimeout(15000);
                    conn.setRequestProperty("User-Agent", "JaText-Android-Updater");
                    conn.setRequestProperty("Accept", "application/json,*/*");
                    conn.setRequestProperty("Cache-Control", "no-cache");
                    conn.connect();

                    int status = conn.getResponseCode();
                    if (
                        status == HttpURLConnection.HTTP_MOVED_PERM ||
                        status == HttpURLConnection.HTTP_MOVED_TEMP ||
                        status == HttpURLConnection.HTTP_SEE_OTHER ||
                        status == 307 ||
                        status == 308
                    ) {
                        String location = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (location == null || location.isEmpty()) {
                            break;
                        }
                        currentUrl = location;
                        continue;
                    }

                    JSObject res = new JSObject();
                    res.put("status", status);
                    if (status >= 200 && status < 300) {
                        try (
                            InputStream in = conn.getInputStream();
                            ByteArrayOutputStream baos = new ByteArrayOutputStream()
                        ) {
                            byte[] buf = new byte[4096];
                            int r;
                            while ((r = in.read(buf)) != -1) {
                                baos.write(buf, 0, r);
                                if (baos.size() > 262144) break;
                            }
                            res.put("ok", true);
                            res.put("body", new String(baos.toByteArray(), StandardCharsets.UTF_8));
                        }
                    } else {
                        res.put("ok", false);
                        res.put("body", "");
                    }
                    call.resolve(res);
                    return;
                }
                JSObject fail = new JSObject();
                fail.put("ok", false);
                fail.put("status", 0);
                fail.put("body", "");
                call.resolve(fail);
            } catch (Throwable err) {
                JSObject fail = new JSObject();
                fail.put("ok", false);
                fail.put("status", 0);
                fail.put("body", "");
                call.resolve(fail);
            } finally {
                if (conn != null) {
                    try {
                        conn.disconnect();
                    } catch (Throwable ignored) {}
                }
            }
        }, "JaTextUpdateCheck").start();
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        final String downloadUrl = call.getString("url");
        final Context ctx = getContext();
        if (ctx == null || downloadUrl == null || downloadUrl.trim().isEmpty()) {
            call.reject("Missing update APK URL.");
            return;
        }

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                File updatesDir = new File(ctx.getCacheDir(), "updates");
                if (!updatesDir.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    updatesDir.mkdirs();
                }
                File outApk = new File(updatesDir, "JaText-release-update.apk");

                String currentUrl = downloadUrl.trim();
                for (int redirects = 0; redirects < 8; redirects++) {
                    URL url = new URL(currentUrl);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(45000);
                    conn.setRequestProperty("User-Agent", "JaText-Android-Updater");
                    conn.setRequestProperty("Accept", "application/octet-stream,*/*");
                    conn.connect();

                    int status = conn.getResponseCode();
                    if (
                        status == HttpURLConnection.HTTP_MOVED_PERM ||
                        status == HttpURLConnection.HTTP_MOVED_TEMP ||
                        status == HttpURLConnection.HTTP_SEE_OTHER ||
                        status == 307 ||
                        status == 308
                    ) {
                        String location = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (location == null || location.isEmpty()) {
                            throw new Exception("Redirect missing Location header");
                        }
                        currentUrl = location;
                        continue;
                    }
                    if (status < 200 || status >= 300) {
                        throw new Exception("Download failed (HTTP " + status + ")");
                    }
                    break;
                }

                long totalBytes = conn != null ? conn.getContentLengthLong() : -1L;
                long downloadedBytes = 0L;
                int lastPercent = -1;

                try (
                    InputStream in = conn.getInputStream();
                    FileOutputStream out = new FileOutputStream(outApk, false)
                ) {
                    byte[] buffer = new byte[16384];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        downloadedBytes += read;
                        int percent = totalBytes > 0
                            ? (int) Math.min(100L, (downloadedBytes * 100L) / totalBytes)
                            : -1;
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject prog = new JSObject();
                            prog.put("percent", percent);
                            prog.put("downloadedBytes", downloadedBytes);
                            prog.put("totalBytes", totalBytes);
                            notifyListeners("apkDownloadProgress", prog);
                        }
                    }
                    out.flush();
                }

                // Verify the downloaded file is a genuine APK archive (PK\x03\x04) and not an HTML fallback page
                if (!outApk.exists() || outApk.length() < 512 * 1024L) {
                    throw new Exception("Downloaded update file was incomplete (" + outApk.length() + " bytes).");
                }
                byte[] magic = new byte[4];
                try (FileInputStream fis = new FileInputStream(outApk)) {
                    int mRead = fis.read(magic);
                    if (
                        mRead < 4 ||
                        magic[0] != 0x50 ||
                        magic[1] != 0x4B ||
                        magic[2] != 0x03 ||
                        magic[3] != 0x04
                    ) {
                        throw new Exception("Update file is not a valid Android APK package.");
                    }
                }

                boolean canInstall = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
                    ctx.getPackageManager().canRequestPackageInstalls();

                Activity activity = getActivity();
                if (!canInstall && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && activity != null) {
                    pendingUpdateApkFile = outApk;
                    activity.runOnUiThread(() -> {
                        try {
                            Intent settingsIntent = new Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + ctx.getPackageName())
                            );
                            startActivityForResult(call, settingsIntent, "handleUnknownSourcesResult");
                        } catch (Throwable err) {
                            JSObject res = new JSObject();
                            res.put("needsUnknownSourcesPermission", true);
                            res.put("launchedInstaller", false);
                            call.resolve(res);
                        }
                    });
                    return;
                }

                pendingUpdateApkFile = null;
                if (activity != null) {
                    activity.runOnUiThread(() -> launchPackageInstaller(ctx, outApk));
                } else {
                    launchPackageInstaller(ctx, outApk);
                }

                JSObject res = new JSObject();
                res.put("needsUnknownSourcesPermission", false);
                res.put("launchedInstaller", true);
                call.resolve(res);
            } catch (Throwable err) {
                call.reject(
                    "Could not download update: " +
                    (err.getMessage() != null ? err.getMessage() : err.toString())
                );
            } finally {
                if (conn != null) {
                    try {
                        conn.disconnect();
                    } catch (Throwable ignored) {}
                }
            }
        }, "JaTextApkUpdater").start();
    }

    private void launchPackageInstaller(Context ctx, File apkFile) {
        try {
            Uri apkUri = FileProvider.getUriForFile(
                ctx,
                ctx.getPackageName() + ".fileprovider",
                apkFile
            );
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION |
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            );
            ctx.startActivity(installIntent);
        } catch (Throwable ignored) {}
    }

    @PluginMethod
    public void startScreenCapture(PluginCall call) {
        Context ctx = getContext();
        Activity activity = getActivity();
        if (ctx == null || activity == null) {
            JSObject result = new JSObject();
            result.put("started", false);
            call.resolve(result);
            return;
        }
        try {
            MediaProjectionManager mgr =
                (MediaProjectionManager) ctx.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            if (mgr == null) {
                JSObject result = new JSObject();
                result.put("started", false);
                call.resolve(result);
                return;
            }
            Intent captureIntent = mgr.createScreenCaptureIntent();
            startActivityForResult(call, captureIntent, "handleScreenCaptureResult");
        } catch (Throwable err) {
            call.reject("Could not start screen sharing: " + err.getMessage());
        }
    }

    @ActivityCallback
    @SuppressWarnings("deprecation")
    private void handleScreenCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Context ctx = getContext();
        if (ctx == null || result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject res = new JSObject();
            res.put("started", false);
            call.resolve(res);
            return;
        }
        try {
            DisplayMetrics metrics = new DisplayMetrics();
            WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
            if (wm != null && wm.getDefaultDisplay() != null) {
                wm.getDefaultDisplay().getRealMetrics(metrics);
            } else {
                metrics = ctx.getResources().getDisplayMetrics();
            }
            int rawW = Math.max(320, metrics.widthPixels);
            int rawH = Math.max(320, metrics.heightPixels);
            int maxEdge = Math.max(rawW, rawH);
            double scale = maxEdge > 720 ? (720.0 / maxEdge) : 1.0;
            int w = Math.max(240, (int) Math.round(rawW * scale)) & ~1;
            int h = Math.max(240, (int) Math.round(rawH * scale)) & ~1;

            Intent serviceIntent = new Intent(ctx, ScreenCaptureService.class);
            serviceIntent.setAction(ScreenCaptureService.ACTION_START);
            serviceIntent.putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.getResultCode());
            serviceIntent.putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, result.getData());
            ContextCompat.startForegroundService(ctx, serviceIntent);

            JSObject res = new JSObject();
            res.put("started", true);
            res.put("width", w);
            res.put("height", h);
            call.resolve(res);
        } catch (Throwable err) {
            call.reject("Could not initialize screen capture: " + err.getMessage());
        }
    }

    @PluginMethod
    public void stopScreenCapture(PluginCall call) {
        Context ctx = getContext();
        if (ctx != null) {
            try {
                Intent stopIntent = new Intent(ctx, ScreenCaptureService.class);
                stopIntent.setAction(ScreenCaptureService.ACTION_STOP);
                ctx.stopService(stopIntent);
            } catch (Throwable ignored) {}
        }
        JSObject res = new JSObject();
        res.put("stopped", true);
        call.resolve(res);
    }

    @PluginMethod
    public void copyImageBase64(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null || base64.isEmpty()) {
            call.reject("Missing image data.");
            return;
        }
        try {
            Context ctx = getContext();
            if (ctx == null) {
                call.reject("Context unavailable.");
                return;
            }
            byte[] pngBytes = Base64.decode(base64, Base64.DEFAULT);
            File outFile = new File(ctx.getCacheDir(), "jatext-clipboard.png");
            try (FileOutputStream fos = new FileOutputStream(outFile, false)) {
                fos.write(pngBytes);
                fos.flush();
            }
            Uri contentUri = FileProvider.getUriForFile(
                ctx,
                ctx.getPackageName() + ".fileprovider",
                outFile
            );
            ClipboardManager clipboard = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard == null) {
                call.reject("Clipboard unavailable.");
                return;
            }
            ClipData clip = ClipData.newUri(ctx.getContentResolver(), "JaText image", contentUri);
            clipboard.setPrimaryClip(clip);
            JSObject result = new JSObject();
            result.put("copied", true);
            call.resolve(result);
        } catch (Throwable err) {
            call.reject("Could not copy image to clipboard: " + err.getMessage());
        }
    }

    @PluginMethod
    public void requestMediaPermissions(PluginCall call) {
        boolean needVideo = Boolean.TRUE.equals(call.getBoolean("video", false));
        boolean micGranted = getPermissionState("microphone") == PermissionState.GRANTED;
        boolean camGranted = !needVideo || getPermissionState("camera") == PermissionState.GRANTED;
        if (micGranted && camGranted) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        String[] aliases = needVideo ? new String[] { "microphone", "camera" } : new String[] { "microphone" };
        requestPermissionForAliases(aliases, call, "mediaPermissionsCallback");
    }

    @PermissionCallback
    private void mediaPermissionsCallback(PluginCall call) {
        boolean needVideo = Boolean.TRUE.equals(call.getBoolean("video", false));
        boolean micGranted = getPermissionState("microphone") == PermissionState.GRANTED;
        boolean camGranted = !needVideo || getPermissionState("camera") == PermissionState.GRANTED;
        JSObject result = new JSObject();
        result.put("granted", micGranted && camGranted);
        call.resolve(result);
    }

    @SuppressWarnings("deprecation")
    @PluginMethod
    public void setCallAudioRoute(PluginCall call) {
        boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        boolean speaker = Boolean.TRUE.equals(call.getBoolean("speaker", true));
        boolean video = Boolean.TRUE.equals(call.getBoolean("video", false));
        String title = call.getString("title", "JaText Call");
        try {
            Context ctx = getContext();
            if (ctx != null) {
                if (active) {
                    try {
                        Intent svcIntent = new Intent(ctx, CallKeepAliveService.class);
                        svcIntent.setAction(CallKeepAliveService.ACTION_START);
                        svcIntent.putExtra(CallKeepAliveService.EXTRA_TITLE, title);
                        svcIntent.putExtra(CallKeepAliveService.EXTRA_VIDEO, video);
                        if (MainActivity.isAppInForeground()) {
                            ContextCompat.startForegroundService(ctx, svcIntent);
                        } else if (CallKeepAliveService.isCallActive()) {
                            ctx.startService(svcIntent);
                        }
                    } catch (Throwable ignored) {}
                } else {
                    try {
                        Intent stopIntent = new Intent(ctx, CallKeepAliveService.class);
                        stopIntent.setAction(CallKeepAliveService.ACTION_STOP);
                        ctx.stopService(stopIntent);
                    } catch (Throwable ignored) {}
                }

                AudioManager audioManager = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
                if (audioManager != null) {
                    if (active) {
                        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
                        boolean routedModern = false;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
                            int targetType = speaker
                                ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                                : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
                            for (AudioDeviceInfo device : devices) {
                                if (device.getType() == targetType) {
                                    routedModern = audioManager.setCommunicationDevice(device);
                                    break;
                                }
                            }
                        }
                        if (!routedModern) {
                            audioManager.setSpeakerphoneOn(speaker);
                        }
                    } else {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            audioManager.clearCommunicationDevice();
                        }
                        audioManager.setSpeakerphoneOn(false);
                        audioManager.setMode(AudioManager.MODE_NORMAL);
                    }
                }
            }
            Activity activity = getActivity();
            if (activity != null) {
                activity.runOnUiThread(() -> {
                    try {
                        if (active) {
                            activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        } else {
                            activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        }
                    } catch (Throwable ignored) {}
                });
            }
        } catch (Throwable ignored) {}
        JSObject result = new JSObject();
        result.put("speaker", speaker);
        call.resolve(result);
    }

    @PluginMethod
    public void startSpeechCapture(PluginCall call) {
        Activity activity = getActivity();
        Context ctx = getContext();
        if (activity == null || ctx == null) {
            JSObject res = new JSObject();
            res.put("started", false);
            call.resolve(res);
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                stopRecognizerInternal();
                if (!SpeechRecognizer.isRecognitionAvailable(ctx)) {
                    JSObject res = new JSObject();
                    res.put("started", false);
                    call.resolve(res);
                    return;
                }
                speechCaptureActive = true;
                accumulatedSpeech.setLength(0);
                startRecognizerPass(ctx);
                JSObject res = new JSObject();
                res.put("started", true);
                call.resolve(res);
            } catch (Throwable ignored) {
                speechCaptureActive = false;
                JSObject res = new JSObject();
                res.put("started", false);
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void stopSpeechCapture(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            JSObject res = new JSObject();
            res.put("transcript", accumulatedSpeech.toString().trim());
            call.resolve(res);
            return;
        }
        activity.runOnUiThread(() -> {
            speechCaptureActive = false;
            stopRecognizerInternal();
            JSObject res = new JSObject();
            res.put("transcript", accumulatedSpeech.toString().trim());
            call.resolve(res);
        });
    }

    private void startRecognizerPass(Context ctx) {
        if (!speechCaptureActive) return;
        try {
            if (speechRecognizer != null) {
                speechRecognizer.destroy();
            }
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(ctx);
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

            speechRecognizer.setRecognitionListener(
                new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {}

                    @Override
                    public void onBeginningOfSpeech() {}

                    @Override
                    public void onRmsChanged(float rmsdB) {}

                    @Override
                    public void onBufferReceived(byte[] buffer) {}

                    @Override
                    public void onEndOfSpeech() {}

                    @Override
                    public void onError(int error) {
                        if (
                            speechCaptureActive &&
                            MainActivity.isAppInForeground() &&
                            error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS
                        ) {
                            Activity act = getActivity();
                            if (act != null && act.getWindow() != null) {
                                act.getWindow()
                                    .getDecorView()
                                    .postDelayed(() -> {
                                        if (speechCaptureActive && MainActivity.isAppInForeground()) {
                                            startRecognizerPass(ctx);
                                        }
                                    }, 450);
                            }
                        }
                    }

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results != null
                            ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            : null;
                        if (matches != null && !matches.isEmpty() && matches.get(0) != null) {
                            String chunk = matches.get(0).trim();
                            if (!chunk.isEmpty()) {
                                if (accumulatedSpeech.length() > 0) accumulatedSpeech.append(' ');
                                accumulatedSpeech.append(chunk);
                                emitSpeechEvent(accumulatedSpeech.toString(), true);
                            }
                        }
                        if (speechCaptureActive) {
                            startRecognizerPass(ctx);
                        }
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults != null
                            ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            : null;
                        if (matches != null && !matches.isEmpty() && matches.get(0) != null) {
                            String partial = matches.get(0).trim();
                            String combined = accumulatedSpeech.length() > 0
                                ? accumulatedSpeech + " " + partial
                                : partial;
                            emitSpeechEvent(combined.trim(), false);
                        }
                    }

                    @Override
                    public void onEvent(int eventType, Bundle params) {}
                }
            );
            speechRecognizer.startListening(intent);
        } catch (Throwable ignored) {}
    }

    private void emitSpeechEvent(String text, boolean isFinal) {
        JSObject data = new JSObject();
        data.put("text", text);
        data.put("isFinal", isFinal);
        notifyListeners("speechTranscript", data);
    }

    private void stopRecognizerInternal() {
        try {
            if (speechRecognizer != null) {
                speechRecognizer.stopListening();
                speechRecognizer.cancel();
                speechRecognizer.destroy();
                speechRecognizer = null;
            }
        } catch (Throwable ignored) {
            speechRecognizer = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
        speechCaptureActive = false;
        stopRecognizerInternal();
        super.handleOnDestroy();
    }
}
