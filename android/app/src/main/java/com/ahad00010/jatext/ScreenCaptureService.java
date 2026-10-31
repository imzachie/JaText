package com.ahad00010.jatext;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

public class ScreenCaptureService extends Service {

    public static final String ACTION_START = "com.ahad00010.jatext.SCREEN_CAPTURE_START";
    public static final String ACTION_STOP = "com.ahad00010.jatext.SCREEN_CAPTURE_STOP";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";
    public static final int NOTIFICATION_ID = 9412;
    private static final String CHANNEL_ID = "screen_share";
    private static final long MIN_FRAME_INTERVAL_MS = 66L;
    private static final long STATIC_FRAME_HEARTBEAT_MS = 320L;
    private static final int AUDIO_SAMPLE_RATE = 16000;

    private static volatile boolean capturing = false;

    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread workerThread;
    private Handler workerHandler;
    private AudioRecord playbackAudioRecord;
    private Thread audioCaptureThread;
    private volatile boolean audioCapturing = false;
    private PowerManager.WakeLock wakeLock;
    private volatile long lastFrameSentAt = 0L;
    private volatile Bitmap lastFrameBitmap = null;
    private int captureWidth = 540;
    private int captureHeight = 960;
    private int captureDpi = 240;

    private final Runnable staticFrameHeartbeat = new Runnable() {
        @Override
        public void run() {
            if (!capturing) return;
            try {
                long now = System.currentTimeMillis();
                Bitmap cached = lastFrameBitmap;
                if (cached != null && !cached.isRecycled() && now - lastFrameSentAt >= STATIC_FRAME_HEARTBEAT_MS) {
                    lastFrameSentAt = now;
                    Bitmap copy = cached.copy(Bitmap.Config.ARGB_8888, false);
                    if (copy != null) {
                        NativeRuntimeBridge.emitScreenBitmap(copy, captureWidth, captureHeight);
                    }
                }
            } catch (Throwable ignored) {}
            Handler h = workerHandler;
            if (capturing && h != null) {
                h.postDelayed(this, STATIC_FRAME_HEARTBEAT_MS);
            }
        }
    };

    public static boolean isCapturing() {
        return capturing;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    @SuppressWarnings("deprecation")
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopCaptureAndSelf(true);
            return START_NOT_STICKY;
        }

        if (ACTION_START.equals(intent.getAction())) {
            int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED);
            Intent resultData = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent.class)
                : intent.getParcelableExtra(EXTRA_RESULT_DATA);

            if (resultCode != Activity.RESULT_OK || resultData == null) {
                stopCaptureAndSelf(true);
                return START_NOT_STICKY;
            }

            try {
                ensureChannel();
                Notification notification = buildNotification();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                    );
                } else {
                    startForeground(NOTIFICATION_ID, notification);
                }

                acquireWakeLock();
                setupProjection(resultCode, resultData);
            } catch (Throwable err) {
                stopCaptureAndSelf(true);
            }
        }
        return START_NOT_STICKY;
    }

    private void setupProjection(int resultCode, Intent resultData) {
        cleanupProjectionResources();

        MediaProjectionManager mgr =
            (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (mgr == null) {
            stopCaptureAndSelf(true);
            return;
        }

        computeCaptureDimensions();

        workerThread = new HandlerThread("JaTextScreenCapture");
        workerThread.start();
        workerHandler = new Handler(workerThread.getLooper());

        mediaProjection = mgr.getMediaProjection(resultCode, resultData);
        if (mediaProjection == null) {
            stopCaptureAndSelf(true);
            return;
        }

        // Android 14+ requires registering a callback BEFORE createVirtualDisplay!
        mediaProjection.registerCallback(
            new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    stopCaptureAndSelf(true);
                }
            },
            workerHandler
        );

        imageReader = ImageReader.newInstance(
            captureWidth,
            captureHeight,
            PixelFormat.RGBA_8888,
            2
        );

        imageReader.setOnImageAvailableListener(
            (reader) -> {
                Image image = null;
                try {
                    image = reader.acquireLatestImage();
                    if (image == null) return;
                    long now = System.currentTimeMillis();
                    if (now - lastFrameSentAt < MIN_FRAME_INTERVAL_MS) {
                        return;
                    }
                    lastFrameSentAt = now;
                    processImageFrame(image);
                } catch (Throwable ignored) {
                } finally {
                    if (image != null) {
                        try {
                            image.close();
                        } catch (Throwable ignored) {}
                    }
                }
            },
            workerHandler
        );

        virtualDisplay = mediaProjection.createVirtualDisplay(
            "JaTextScreenShare",
            captureWidth,
            captureHeight,
            captureDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.getSurface(),
            null,
            workerHandler
        );

        capturing = true;
        workerHandler.postDelayed(staticFrameHeartbeat, STATIC_FRAME_HEARTBEAT_MS);

        // Start Android 10+ internal device audio capture alongside screen video
        startPlaybackAudioCapture(mediaProjection);
    }

    private void startPlaybackAudioCapture(MediaProjection projection) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || projection == null) {
            return;
        }
        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return;
        }
        try {
            AudioPlaybackCaptureConfiguration playbackConfig =
                new AudioPlaybackCaptureConfiguration.Builder(projection)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(AudioAttributes.USAGE_GAME)
                    .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                    .build();

            AudioFormat audioFormat = new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(AUDIO_SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                .build();

            int minBuf = AudioRecord.getMinBufferSize(
                AUDIO_SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            );
            // ~60ms PCM frames (1920 bytes = 960 16-bit samples at 16kHz)
            int chunkBytes = 1920;
            int bufferSize = Math.max(minBuf > 0 ? minBuf * 2 : 4096, chunkBytes * 4);

            AudioRecord record = new AudioRecord.Builder()
                .setAudioFormat(audioFormat)
                .setBufferSizeInBytes(bufferSize)
                .setAudioPlaybackCaptureConfig(playbackConfig)
                .build();

            if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                try {
                    record.release();
                } catch (Throwable ignored) {}
                return;
            }

            playbackAudioRecord = record;
            audioCapturing = true;
            record.startRecording();

            audioCaptureThread = new Thread(
                () -> {
                    byte[] pcmBuf = new byte[chunkBytes];
                    while (audioCapturing && capturing) {
                        try {
                            int read = record.read(pcmBuf, 0, pcmBuf.length);
                            if (read > 0) {
                                // Skip completely silent chunks to save bridge overhead
                                boolean nonZero = false;
                                for (int i = 0; i < read; i += 4) {
                                    if (pcmBuf[i] != 0 || (i + 1 < read && pcmBuf[i + 1] != 0)) {
                                        nonZero = true;
                                        break;
                                    }
                                }
                                if (nonZero) {
                                    NativeRuntimeBridge.emitScreenAudioPcm(pcmBuf, read, AUDIO_SAMPLE_RATE);
                                }
                            } else if (read < 0) {
                                break;
                            }
                        } catch (Throwable err) {
                            break;
                        }
                    }
                },
                "JaTextScreenAudio"
            );
            audioCaptureThread.setDaemon(true);
            audioCaptureThread.start();
        } catch (Throwable ignored) {
            // If OEM restricts internal audio capture, keep video screen sharing running cleanly.
        }
    }

    private void processImageFrame(Image image) {
        Image.Plane[] planes = image.getPlanes();
        if (planes == null || planes.length == 0) return;

        ByteBuffer buffer = planes[0].getBuffer();
        int pixelStride = planes[0].getPixelStride();
        int rowStride = planes[0].getRowStride();
        int rowPadding = rowStride - pixelStride * captureWidth;

        int paddedWidth = captureWidth + Math.max(0, rowPadding / Math.max(1, pixelStride));
        Bitmap rawBitmap = Bitmap.createBitmap(paddedWidth, captureHeight, Bitmap.Config.ARGB_8888);
        buffer.rewind();
        rawBitmap.copyPixelsFromBuffer(buffer);

        Bitmap cleanBitmap = rawBitmap;
        if (paddedWidth != captureWidth) {
            cleanBitmap = Bitmap.createBitmap(rawBitmap, 0, 0, captureWidth, captureHeight);
            rawBitmap.recycle();
        }

        Bitmap prev = lastFrameBitmap;
        lastFrameBitmap = cleanBitmap.copy(Bitmap.Config.ARGB_8888, false);
        if (prev != null && !prev.isRecycled()) {
            try {
                prev.recycle();
            } catch (Throwable ignored) {}
        }
        NativeRuntimeBridge.emitScreenBitmap(cleanBitmap, captureWidth, captureHeight);
    }

    @SuppressWarnings("deprecation")
    private void computeCaptureDimensions() {
        DisplayMetrics metrics = new DisplayMetrics();
        WindowManager wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (wm != null && wm.getDefaultDisplay() != null) {
            wm.getDefaultDisplay().getRealMetrics(metrics);
        } else {
            metrics = getResources().getDisplayMetrics();
        }
        int rawW = Math.max(320, metrics.widthPixels);
        int rawH = Math.max(320, metrics.heightPixels);
        int maxEdge = Math.max(rawW, rawH);
        double scale = maxEdge > 720 ? (720.0 / maxEdge) : 1.0;
        int w = Math.max(240, (int) Math.round(rawW * scale));
        int h = Math.max(240, (int) Math.round(rawH * scale));
        if ((w & 1) == 1) w -= 1;
        if ((h & 1) == 1) h -= 1;
        captureWidth = w;
        captureHeight = h;
        captureDpi = Math.max(120, metrics.densityDpi);
    }

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && (wakeLock == null || !wakeLock.isHeld())) {
                wakeLock = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "JaText::ScreenShareWakeLock"
                );
                wakeLock.acquire(2 * 60 * 60 * 1000L);
            }
        } catch (Throwable ignored) {}
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Screen Sharing",
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Active while sharing your screen on a JaText call");
                channel.setSound(null, null);
                channel.enableVibration(false);
                nm.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(
            this,
            101,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, ScreenCaptureService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(
            this,
            102,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle("JaText screen & audio share active")
            .setContentText("Your screen and media audio are being shared in the call")
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(openPi)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop sharing", stopPi)
            .build();
    }

    private void cleanupProjectionResources() {
        capturing = false;
        audioCapturing = false;
        Bitmap prev = lastFrameBitmap;
        lastFrameBitmap = null;
        if (prev != null && !prev.isRecycled()) {
            try {
                prev.recycle();
            } catch (Throwable ignored) {}
        }
        try {
            if (workerHandler != null) {
                workerHandler.removeCallbacks(staticFrameHeartbeat);
            }
        } catch (Throwable ignored) {}
        try {
            if (playbackAudioRecord != null) {
                try {
                    playbackAudioRecord.stop();
                } catch (Throwable ignored) {}
                playbackAudioRecord.release();
                playbackAudioRecord = null;
            }
        } catch (Throwable ignored) {}
        audioCaptureThread = null;
        try {
            if (virtualDisplay != null) {
                virtualDisplay.release();
                virtualDisplay = null;
            }
        } catch (Throwable ignored) {}
        try {
            if (imageReader != null) {
                imageReader.close();
                imageReader = null;
            }
        } catch (Throwable ignored) {}
        try {
            if (mediaProjection != null) {
                mediaProjection.stop();
                mediaProjection = null;
            }
        } catch (Throwable ignored) {}
        try {
            if (workerThread != null) {
                workerThread.quitSafely();
                workerThread = null;
            }
            workerHandler = null;
        } catch (Throwable ignored) {}
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            wakeLock = null;
        } catch (Throwable ignored) {}
    }

    private void stopCaptureAndSelf(boolean notifyListeners) {
        boolean wasCapturing = capturing;
        cleanupProjectionResources();
        if (notifyListeners && wasCapturing) {
            NativeRuntimeBridge.emitScreenCaptureStopped();
        }
        try {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Throwable ignored) {}
        stopSelf();
    }

    @Override
    public void onDestroy() {
        cleanupProjectionResources();
        super.onDestroy();
    }
}
