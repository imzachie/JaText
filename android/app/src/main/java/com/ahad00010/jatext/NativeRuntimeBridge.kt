package com.ahad00010.jatext

import android.graphics.Bitmap
import java.util.concurrent.CopyOnWriteArraySet

object NativeRuntimeBridge {
    interface SyncWakeListener {
        fun onSyncWake()
    }

    interface FcmTokenListener {
        fun onNewFcmToken(token: String)
    }

    interface ScreenCaptureListener {
        fun onScreenBitmapFrame(bitmap: Bitmap, width: Int, height: Int)
        fun onScreenAudioPcm(pcm16Le: ByteArray, length: Int, sampleRate: Int)
        fun onScreenCaptureStopped()
    }

    private val syncListeners = CopyOnWriteArraySet<SyncWakeListener>()
    private val fcmTokenListeners = CopyOnWriteArraySet<FcmTokenListener>()
    private val screenListeners = CopyOnWriteArraySet<ScreenCaptureListener>()

    @Volatile
    var latestFcmToken: String? = null

    fun addSyncWakeListener(listener: SyncWakeListener) {
        syncListeners.add(listener)
    }

    fun removeSyncWakeListener(listener: SyncWakeListener) {
        syncListeners.remove(listener)
    }

    @JvmStatic
    fun notifySyncWake() {
        for (l in syncListeners) {
            try {
                l.onSyncWake()
            } catch (_: Throwable) {
            }
        }
    }

    fun addFcmTokenListener(listener: FcmTokenListener) {
        fcmTokenListeners.add(listener)
        latestFcmToken?.let { listener.onNewFcmToken(it) }
    }

    fun removeFcmTokenListener(listener: FcmTokenListener) {
        fcmTokenListeners.remove(listener)
    }

    @JvmStatic
    fun dispatchFcmToken(token: String?) {
        if (token.isNullOrBlank()) return
        latestFcmToken = token
        for (l in fcmTokenListeners) {
            try {
                l.onNewFcmToken(token)
            } catch (_: Throwable) {
            }
        }
    }

    fun addScreenCaptureListener(listener: ScreenCaptureListener) {
        screenListeners.add(listener)
    }

    fun removeScreenCaptureListener(listener: ScreenCaptureListener) {
        screenListeners.remove(listener)
    }

    @JvmStatic
    fun emitScreenBitmap(bitmap: Bitmap, width: Int, height: Int) {
        if (screenListeners.isEmpty()) {
            try {
                bitmap.recycle()
            } catch (_: Throwable) {
            }
            return
        }
        for (l in screenListeners) {
            try {
                l.onScreenBitmapFrame(bitmap, width, height)
            } catch (_: Throwable) {
            }
        }
    }

    @JvmStatic
    fun emitScreenAudioPcm(pcm: ByteArray, length: Int, sampleRate: Int) {
        if (length <= 0) return
        val copy = pcm.copyOf(length)
        for (l in screenListeners) {
            try {
                l.onScreenAudioPcm(copy, length, sampleRate)
            } catch (_: Throwable) {
            }
        }
    }

    @JvmStatic
    fun emitScreenCaptureStopped() {
        for (l in screenListeners) {
            try {
                l.onScreenCaptureStopped()
            } catch (_: Throwable) {
            }
        }
    }
}
