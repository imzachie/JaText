package com.ahad00010.jatext;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import android.view.WindowManager;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
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

    private SpeechRecognizer speechRecognizer;
    private volatile boolean speechCaptureActive = false;
    private final StringBuilder accumulatedSpeech = new StringBuilder();

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
        try {
            Context ctx = getContext();
            if (ctx != null) {
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
                        if (speechCaptureActive && error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                            Activity act = getActivity();
                            if (act != null) {
                                act.getWindow()
                                    .getDecorView()
                                    .postDelayed(() -> startRecognizerPass(ctx), 350);
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
        speechCaptureActive = false;
        stopRecognizerInternal();
        super.handleOnDestroy();
    }
}
