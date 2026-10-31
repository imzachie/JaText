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
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt
import kotlin.random.Random
import kotlinx.coroutines.delay

/**
 * 1:1 Port of Aghajari/ThanosEffect (Telegram Message Disintegration Effect) for Jetpack Compose.
 * Reference:
 *  - ThanosEffect-Core/EffectUtils.kt & ParticleLifeTime.kt
 *  - ThanosEffect-Canvas/Particle.kt & CanvasViewRenderer.kt
 *  - ThanosEffect-Compose/ThanosEffectModifier.kt & ThanosEffectCompose.kt
 */

private val ALPHAS = floatArrayOf(0.3f, 0.6f, 1.0f)
private const val MIN_DURATION_MS = 1400
private const val MAX_DURATION_MS = 2800
private const val LINE_SENSITIVE_MS = 600
private const val LINE_DELAY_MS = 16L

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

        val renderingEffect = sqrt(min(1f, renderingLine))
        val safeCenterY = max(1f, centerY)
        val safeCenterX = max(1f, centerX)

        y = offsetY + initialY + ((initialY - safeCenterY) / safeCenterY) *
            translationY * fraction * renderingEffect
        y -= (fraction * velocityY).pow(2.0f) * sqrt(renderingEffect)

        x = offsetX + initialX + ((initialX - safeCenterX) / safeCenterX) *
            translationX * fraction * renderingEffect

        val firstRenderingFraction = time / 200f
        r = initialR * 1.2f
        if (firstRenderingFraction > 1.0f) {
            val rTimeFraction = (time - 200f) / max(1f, (lifeTime - 200f))
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
    private val bitmap: Bitmap,
    private val offsetX: Float,
    private val offsetY: Float,
    private val density: Float,
    pendingWeight: Int,
) {
    private val width: Int = bitmap.width
    private val height: Int = bitmap.height
    private val pixels = IntArray(width * height).also {
        bitmap.getPixels(it, 0, width, 0, 0, width, height)
    }
    private val centerX: Float = width / 2f
    private val centerY: Float = height / 2f
    private val perPx: Int = (6 + 2 * pendingWeight).coerceAtMost(14)
    private val maxLine: Int = max(1, width / perPx)
    private val particles = ArrayList<SnapParticle>(max(64, (width * height) / (perPx * perPx)))

    private val srcRect = Rect(0, 0, width, height)
    private val dstRect = Rect(
        offsetX.toInt(),
        offsetY.toInt(),
        offsetX.toInt() + width,
        offsetY.toInt() + height,
    )

    private var line = 0
    private var animatedLineWidth = 0
    private var timeMs = 0f
    private var nextLineWallMs = 0L
    private var endRenderingTimeMs = 0f
    private var recycled = false

    private fun dpPx(dpVal: Float): Int = max(1, (density * dpVal).toInt())

    private fun randomInitialAlpha(color: Int): Int {
        val picked = ALPHAS[Random.nextInt(ALPHAS.size)]
        return min(AndroidColor.alpha(color), (picked * 255f).toInt())
    }

    private fun randomVelocity(): Int {
        val base = dpPx(4f)
        return base + Random.nextInt(max(1, base))
    }

    private fun randomTranslation(initialMinDp: Int): Int {
        var t = dpPx(initialMinDp.toFloat()).toFloat() + Random.nextInt(max(2, dpPx(56f))).toFloat()
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

    fun spawnNextLinesIfReady(nowWallMs: Long) {
        if (nowWallMs < nextLineWallMs) return
        if (line >= maxLine) {
            if (endRenderingTimeMs == 0f) {
                endRenderingTimeMs = timeMs
            }
            animatedLineWidth = width
            return
        }

        val renderCount = if (width > dpPx(300f)) dpPx(2f) else dpPx(1f)
        var emitted = 0
        while (emitted < renderCount && line < maxLine) {
            val x = line * perPx
            animatedLineWidth = x
            srcRect.left = animatedLineWidth
            dstRect.left = dstRect.right - width + srcRect.left

            var onThisLine = 0
            var y = 0
            while (y < height) {
                val color = pixels[y * width + x]
                if (AndroidColor.alpha(color) > 10) {
                    onThisLine++
                    val minR = max(1, perPx / 4)
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
                            translationY = randomTranslation(32),
                            translationX = randomTranslation(96),
                        )
                    )
                }
                y += perPx
            }
            line++
            if (onThisLine > 0) {
                emitted++
            }
        }
        nextLineWallMs = nowWallMs + LINE_DELAY_MS
    }

    fun draw(nativeCanvas: android.graphics.Canvas, paint: Paint, deltaTimeMs: Float): Boolean {
        timeMs += deltaTimeMs

        if (!recycled && animatedLineWidth < width) {
            nativeCanvas.drawBitmap(bitmap, srcRect, dstRect, null)
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
        if (!alive && !recycled) {
            recycled = true
            bitmap.recycle()
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
    internal val hiddenSnappingIds = mutableStateMapOf<String, Boolean>()
    internal val activeInstances = ArrayList<ActiveSnapInstance>()
    internal var activeCount by mutableIntStateOf(0)

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

        val inst = ActiveSnapInstance(
            bitmap = capturedBitmap,
            offsetX = target.offsetInRoot.x,
            offsetY = target.offsetInRoot.y,
            density = target.density,
            pendingWeight = activeInstances.size,
        )
        inst.spawnNextLinesIfReady(System.currentTimeMillis())
        hiddenSnappingIds[messageId] = true
        activeInstances.add(inst)
        activeCount = activeInstances.size

        // Commit the unsend RPC right as the left-to-right disintegration finishes sweeping the bubble
        delay(250L)
        onCommitUnsend()
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
                val nowWall = System.currentTimeMillis()
                var i = 0
                while (i < hostState.activeInstances.size) {
                    hostState.activeInstances[i].spawnNextLinesIfReady(nowWall)
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
            // Read frameTick so Compose redraws on every VSYNC frame (60Hz / 120Hz)
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
