package com.ahad00010.jatext.ui.effects

import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.graphics.Paint
import android.graphics.Rect
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt
import kotlin.random.Random
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull

/**
 * 1:1 Port of Aghajari/ThanosEffect (Telegram Message Disintegration Effect) for Jetpack Compose.
 * Sweeps 100% of the message bubble from left to right into drifting dust particles with zero
 * partial cutoff and zero split-second flash before "This message was unsent".
 */

private val ALPHAS = floatArrayOf(0.45f, 0.75f, 1.0f)
private const val MIN_DURATION_MS = 850
private const val MAX_DURATION_MS = 1650
private const val LINE_SENSITIVE_MS = 340
private const val SWEEP_DURATION_MS = 360f

private class SnapParticle(
    val initialX: Int,
    val initialY: Int,
    val initialR: Float,
    val color: Int,
    val lifeTime: Int,
    val initialAlpha: Int,
    val velocityY: Int,
    val translationY: Int,
    val translationX: Int,
) {
    private var time = 0f
    var alpha: Int = initialAlpha
        private set
    var x: Float = initialX.toFloat()
        private set
    var y: Float = initialY.toFloat()
        private set
    var r: Float = initialR
        private set

    fun update(
        deltaTimeMs: Float,
        offsetX: Float,
        offsetY: Float,
        centerX: Float,
        centerY: Float,
        renderingLine: Float,
    ): Boolean {
        time += deltaTimeMs
        val fraction = time / lifeTime.toFloat()
        if (fraction >= 1f) return false

        val renderingEffect = sqrt(min(1f, max(0.08f, renderingLine)))
        val safeCenterY = max(1f, centerY)
        val safeCenterX = max(1f, centerX)

        y = offsetY + initialY + ((initialY - safeCenterY) / safeCenterY) *
            translationY * fraction * renderingEffect
        y -= (fraction * velocityY).pow(2.0f) * sqrt(renderingEffect)

        x = offsetX + initialX + ((initialX - safeCenterX) / safeCenterX) *
            translationX * fraction * renderingEffect

        val firstRenderingFraction = time / 130f
        r = initialR * 1.2f
        if (firstRenderingFraction > 1.0f) {
            val rTimeFraction = (time - 130f) / max(1f, (lifeTime - 130f))
            r = min(15f, r * (1f - rTimeFraction))
        } else {
            val originalSize = max(r, initialR)
            r = originalSize - (originalSize - r) * firstRenderingFraction
        }
        alpha = (initialAlpha * min(1.2f - fraction, 1.0f)).toInt().coerceIn(0, 255)
        return true
    }
}

internal class ActiveSnapInstance(
    val messageId: String,
    private val bitmap: Bitmap,
    private val offsetX: Float,
    private val offsetY: Float,
    private val density: Float,
    pendingWeight: Int,
    private val onSweepComplete: () -> Unit,
) {
    private val width: Int = bitmap.width
    private val height: Int = bitmap.height
    private val pixels = IntArray(width * height).also {
        bitmap.getPixels(it, 0, width, 0, 0, width, height)
    }
    private val centerX: Float = width / 2f
    private val centerY: Float = height / 2f
    private val perPx: Int = (5 + 2 * pendingWeight).coerceAtMost(12)
    private val maxLine: Int = max(1, ceil(width.toFloat() / perPx.toFloat()).toInt())
    private val particles = ArrayList<SnapParticle>(max(96, (width * height) / (perPx * perPx)))

    private val srcRect = Rect(0, 0, width, height)
    private val dstRect = Rect(
        offsetX.toInt(),
        offsetY.toInt(),
        offsetX.toInt() + width,
        offsetY.toInt() + height,
    )

    private var line = 0
    private var animatedLineWidth = 0
    private var sweepElapsedMs = 0f
    private var timeMs = 0f
    private var endRenderingTimeMs = 0f
    private var recycled = false
    private var sweepCompleteFired = false

    fun notifySweepDoneOnce() {
        if (!sweepCompleteFired) {
            sweepCompleteFired = true
            onSweepComplete()
        }
    }

    private fun dpPx(dpVal: Float): Int = max(1, (density * dpVal).toInt())

    private fun randomInitialAlpha(color: Int): Int {
        val picked = ALPHAS[Random.nextInt(ALPHAS.size)]
        return min(AndroidColor.alpha(color), (picked * 255f).toInt())
    }

    private fun randomVelocity(): Int {
        val base = dpPx(4.2f)
        return base + Random.nextInt(max(1, base))
    }

    private fun randomTranslation(initialMinDp: Int): Int {
        var t = dpPx(initialMinDp.toFloat()).toFloat() + Random.nextInt(max(2, dpPx(58f))).toFloat()
        if (Random.nextInt(10) == 0) {
            t = -t / 4f
        }
        return t.toInt()
    }

    private fun calculateLifeTime(lineIdx: Int): Int {
        val minus = (((maxLine - lineIdx).toFloat() / maxLine.toFloat()) * LINE_SENSITIVE_MS).toInt()
        val span = max(1, MAX_DURATION_MS - MIN_DURATION_MS - minus + 1)
        return MIN_DURATION_MS + minus + Random.nextInt(span)
    }

    /**
     * Advances the disintegration front smoothly from `0` to `100%` of `width` over `SWEEP_DURATION_MS`
     * so every single column of the bubble turns into dust particles before `onSweepComplete` fires.
     */
    fun advanceSweep(deltaTimeMs: Float) {
        if (line >= maxLine) {
            if (endRenderingTimeMs == 0f) {
                endRenderingTimeMs = timeMs
            }
            animatedLineWidth = width
            notifySweepDoneOnce()
            return
        }

        sweepElapsedMs += deltaTimeMs
        val targetLine = ((sweepElapsedMs / SWEEP_DURATION_MS).coerceIn(0f, 1f) * maxLine.toFloat())
            .toInt()
            .coerceAtLeast(line + 1)
            .coerceAtMost(maxLine)

        while (line < targetLine) {
            val x = (line * perPx).coerceAtMost(width - 1)
            var y = 0
            while (y < height) {
                val color = pixels[y * width + x]
                if (AndroidColor.alpha(color) > 10) {
                    val minR = max(1, perPx / 3)
                    val initR = (minR..max(minR, perPx)).random().toFloat()
                    particles.add(
                        SnapParticle(
                            initialX = x,
                            initialY = y,
                            initialR = initR,
                            color = color,
                            lifeTime = calculateLifeTime(line),
                            initialAlpha = randomInitialAlpha(color),
                            velocityY = randomVelocity(),
                            translationY = randomTranslation(34),
                            translationX = randomTranslation(98),
                        )
                    )
                }
                y += perPx
            }
            line++
        }

        if (line >= maxLine) {
            animatedLineWidth = width
            srcRect.left = width
            dstRect.left = dstRect.right
            if (!recycled) {
                recycled = true
                bitmap.recycle()
            }
            if (endRenderingTimeMs == 0f) {
                endRenderingTimeMs = timeMs
            }
            notifySweepDoneOnce()
        } else {
            animatedLineWidth = (line * perPx).coerceIn(0, width)
            srcRect.left = animatedLineWidth
            dstRect.left = dstRect.right - width + srcRect.left
        }
    }

    fun draw(nativeCanvas: android.graphics.Canvas, paint: Paint, deltaTimeMs: Float): Boolean {
        timeMs += deltaTimeMs

        if (!recycled && animatedLineWidth < width) {
            // Soft alpha feather along the disintegration edge so the remaining slice never looks hard-cut
            val remainingRatio = (1f - (animatedLineWidth.toFloat() / width.toFloat())).coerceIn(0f, 1f)
            val slicePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                alpha = (255f * (remainingRatio * 1.15f).coerceIn(0f, 1f)).toInt()
            }
            nativeCanvas.drawBitmap(bitmap, srcRect, dstRect, slicePaint)
        } else if (!recycled && animatedLineWidth >= width) {
            recycled = true
            bitmap.recycle()
        }

        val renderingLine = line.toFloat() / maxLine.toFloat()
        var idx = 0
        val total = particles.size
        while (idx < total) {
            val p = particles[idx]
            if (p.update(deltaTimeMs, offsetX, offsetY, centerX, centerY, renderingLine)) {
                paint.color = p.color
                paint.alpha = p.alpha
                nativeCanvas.drawCircle(p.x, p.y, p.r, paint)
            }
            idx++
        }

        if (endRenderingTimeMs == 0f) return true
        val alive = timeMs <= endRenderingTimeMs + MAX_DURATION_MS
        if (!alive) {
            notifySweepDoneOnce()
            if (!recycled) {
                recycled = true
                bitmap.recycle()
            }
        }
        return alive
    }
}

private class RegisteredSnapTarget(
    var graphicsLayer: GraphicsLayer,
    var offsetInRoot: Offset,
    var density: Float,
)

@Stable
class ThanosSnapHostState {
    private val targets = HashMap<String, RegisteredSnapTarget>()
    private val recentlySnappedAtMs = HashMap<String, Long>()
    internal val hiddenSnappingIds = mutableStateMapOf<String, Boolean>()
    internal val activeInstances = ArrayList<ActiveSnapInstance>()
    internal var activeCount by mutableIntStateOf(0)

    fun hasRecentlySnapped(messageId: String): Boolean {
        val ts = recentlySnappedAtMs[messageId] ?: return false
        if (System.currentTimeMillis() - ts > 30_000L) {
            recentlySnappedAtMs.remove(messageId)
            return false
        }
        return true
    }

    private fun markSnapped(messageId: String) {
        val now = System.currentTimeMillis()
        recentlySnappedAtMs[messageId] = now
        if (recentlySnappedAtMs.size > 400) {
            val iter = recentlySnappedAtMs.entries.iterator()
            while (iter.hasNext()) {
                if (now - iter.next().value > 30_000L) iter.remove()
            }
        }
    }

    internal fun register(
        messageId: String,
        layer: GraphicsLayer,
        offsetInRoot: Offset,
        density: Float,
    ) {
        val existing = targets[messageId]
        if (existing != null) {
            existing.graphicsLayer = layer
            existing.offsetInRoot = offsetInRoot
            existing.density = density
        } else {
            targets[messageId] = RegisteredSnapTarget(layer, offsetInRoot, density)
        }
    }

    internal fun unregister(messageId: String) {
        targets.remove(messageId)
        hiddenSnappingIds.remove(messageId)
    }

    suspend fun snapMessageThen(messageId: String, onCommitUnsend: () -> Unit) {
        markSnapped(messageId)
        val target = targets[messageId]
        if (target == null) {
            onCommitUnsend()
            return
        }
        val capturedBitmap: Bitmap? = try {
            val img = target.graphicsLayer.toImageBitmap()
            val raw = img.asAndroidBitmap()
            if (raw.width >= 4 && raw.height >= 4) {
                raw.copy(Bitmap.Config.ARGB_8888, false)
            } else {
                null
            }
        } catch (_: Throwable) {
            null
        }

        if (capturedBitmap == null) {
            onCommitUnsend()
            return
        }

        val sweepDone = CompletableDeferred<Unit>()
        val inst = ActiveSnapInstance(
            messageId = messageId,
            bitmap = capturedBitmap,
            offsetX = target.offsetInRoot.x,
            offsetY = target.offsetInRoot.y,
            density = target.density,
            pendingWeight = activeInstances.size,
            onSweepComplete = { sweepDone.complete(Unit) },
        )

        // Hide the live Compose bubble BEFORE frame 1 of the particle sweep
        hiddenSnappingIds[messageId] = true
        inst.advanceSweep(12f)
        activeInstances.add(inst)
        activeCount = activeInstances.size

        // Wait until 100% of the bubble bitmap has disintegrated into dust particles
        withTimeoutOrNull(950L) {
            sweepDone.await()
        }
        inst.notifySweepDoneOnce()

        // Commit the optimistic unsend FIRST so Compose swaps directly to "This message was unsent"
        // BEFORE we ever clear hiddenSnappingIds, eliminating any split-second bubble flash!
        onCommitUnsend()
        withFrameNanos { }
        withFrameNanos { }
        hiddenSnappingIds.remove(messageId)
    }
}

val LocalThanosSnapHost = compositionLocalOf<ThanosSnapHostState?> { null }

fun Modifier.thanosSnapTarget(
    messageId: String,
    hostState: ThanosSnapHostState?,
): Modifier {
    if (hostState == null || messageId.isBlank()) return this
    return this.composed {
        val graphicsLayer = rememberGraphicsLayer()
        val density = androidx.compose.ui.platform.LocalDensity.current.density
        var latestOffset by remember { mutableStateOf(Offset.Zero) }
        val isSnappingHidden = hostState.hiddenSnappingIds[messageId] == true

        DisposableEffect(messageId, hostState) {
            onDispose {
                hostState.unregister(messageId)
            }
        }

        Modifier
            .onGloballyPositioned { coords ->
                latestOffset = coords.positionInRoot()
                hostState.register(messageId, graphicsLayer, latestOffset, density)
            }
            .drawWithContent {
                if (!isSnappingHidden) {
                    graphicsLayer.record {
                        this@drawWithContent.drawContent()
                    }
                    drawLayer(graphicsLayer)
                }
            }
    }
}

@Composable
fun ThanosSnapOverlayHost(
    hostState: ThanosSnapHostState,
    modifier: Modifier = Modifier,
) {
    var frameTick by remember { mutableIntStateOf(0) }
    var lastFrameNanos by remember { mutableStateOf(0L) }
    var latestDeltaMs by remember { mutableStateOf(16.67f) }
    val paint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
        }
    }

    LaunchedEffect(hostState.activeCount > 0) {
        if (hostState.activeCount <= 0) {
            lastFrameNanos = 0L
            return@LaunchedEffect
        }
        while (hostState.activeInstances.isNotEmpty()) {
            withFrameNanos { nowNanos ->
                val rawDeltaMs = if (lastFrameNanos == 0L) {
                    16.67f
                } else {
                    ((nowNanos - lastFrameNanos) / 1_000_000.0).toFloat().coerceIn(4f, 64f)
                }
                lastFrameNanos = nowNanos
                latestDeltaMs = rawDeltaMs
                var i = 0
                while (i < hostState.activeInstances.size) {
                    hostState.activeInstances[i].advanceSweep(rawDeltaMs)
                    i++
                }
                frameTick++
            }
        }
        hostState.activeCount = 0
        lastFrameNanos = 0L
    }

    if (hostState.activeCount > 0) {
        Canvas(modifier = modifier.fillMaxSize()) {
            val tick = frameTick
            if (tick >= 0) {
                drawIntoCanvas { composeCanvas ->
                    val native = composeCanvas.nativeCanvas
                    val iter = hostState.activeInstances.iterator()
                    while (iter.hasNext()) {
                        val instance = iter.next()
                        if (!instance.draw(native, paint, latestDeltaMs)) {
                            iter.remove()
                        }
                    }
                    if (hostState.activeInstances.isEmpty() && hostState.activeCount != 0) {
                        hostState.activeCount = 0
                    }
                }
            }
        }
    }
}
