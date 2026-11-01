/*
 * Adapted from https://github.com/Kyant0/AndroidLiquidGlass (Apache License 2.0)
 * Copyright 2025 Kyant
 */
package com.kyant.backdrop.highlight

import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.isUnspecified
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.PaintingStyle
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.invalidateDraw
import androidx.compose.ui.node.requireGraphicsContext
import androidx.compose.ui.platform.InspectorInfo
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.util.fastCoerceAtMost
import com.kyant.backdrop.RuntimeShaderCacheImpl
import com.kyant.backdrop.internal.ShapeProvider
import com.kyant.backdrop.internal.blur
import com.kyant.backdrop.internal.clipOutline
import com.kyant.backdrop.internal.setRuntimeShader
import com.kyant.backdrop.isRuntimeShaderSupported
import kotlin.math.ceil

internal class HighlightElement(
    val shapeProvider: ShapeProvider,
    val highlight: () -> Highlight?
) : ModifierNodeElement<HighlightNode>() {

    override fun create(): HighlightNode {
        return HighlightNode(shapeProvider, highlight)
    }

    override fun update(node: HighlightNode) {
        node.shapeProvider = shapeProvider
        node.highlight = highlight
        node.invalidateCache()
        node.invalidateDraw()
    }

    override fun InspectorInfo.inspectableProperties() {
        name = "highlight"
        properties["shapeProvider"] = shapeProvider
        properties["highlight"] = highlight
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is HighlightElement) return false

        if (shapeProvider != other.shapeProvider) return false
        if (highlight != other.highlight) return false

        return true
    }

    override fun hashCode(): Int {
        var result = shapeProvider.hashCode()
        result = 31 * result + highlight.hashCode()
        return result
    }
}

internal class HighlightNode(
    var shapeProvider: ShapeProvider,
    var highlight: () -> Highlight?
) : DrawModifierNode, Modifier.Node() {

    override val shouldAutoInvalidate: Boolean = false

    private var highlightLayer: GraphicsLayer? = null

    private val paint =
        Paint().apply {
            style = PaintingStyle.Stroke
        }
    private var clipPath: Path? = null

    private val runtimeShaderCache = RuntimeShaderCacheImpl()

    private var cachedDrawSize: Size = Size.Unspecified
    private var cachedStyle: HighlightStyle? = null
    private var cachedWidthDp: Float = Float.NaN
    private var cachedBlurDp: Float = Float.NaN
    private var cachedShape: Shape? = null
    private var cachedDensity: Float = Float.NaN
    private var cachedLayoutDirection: LayoutDirection? = null

    fun invalidateCache() {
        cachedDrawSize = Size.Unspecified
        cachedStyle = null
    }

    override fun ContentDrawScope.draw() {
        val highlight = highlight()
        val drawSize = size
        if (
            highlight == null ||
            highlight.width.value <= 0f ||
            highlight.alpha <= 0f ||
            drawSize.isUnspecified ||
            drawSize.width <= 0f ||
            drawSize.height <= 0f
        ) {
            return drawContent()
        }

        drawContent()

        val highlightLayer = highlightLayer
        if (highlightLayer != null) {
            val density: Density = this
            val layoutDirection = layoutDirection
            val currentShape = shapeProvider.shape

            val needsRecord =
                cachedDrawSize != drawSize ||
                    cachedStyle != highlight.style ||
                    cachedWidthDp != highlight.width.value ||
                    cachedBlurDp != highlight.blurRadius.value ||
                    cachedShape != currentShape ||
                    cachedDensity != density.density ||
                    cachedLayoutDirection != layoutDirection

            highlightLayer.alpha = highlight.alpha.coerceIn(0f, 1f)
            highlightLayer.blendMode = highlight.style.blendMode

            if (needsRecord) {
                val safeSize =
                    IntSize(
                        (ceil(drawSize.width).toInt() + 2).coerceAtLeast(1),
                        (ceil(drawSize.height).toInt() + 2).coerceAtLeast(1)
                    )

                val outline = currentShape.createOutline(drawSize, layoutDirection, density)
                val clipPath =
                    if (outline is Outline.Rounded) {
                        clipPath ?: Path().also { clipPath = it }
                    } else {
                        null
                    }

                configurePaint(highlight)

                highlightLayer.record(safeSize) {
                    translate(1f, 1f) {
                        val canvas = drawContext.canvas
                        canvas.save()
                        canvas.clipOutline(outline, clipPath)
                        canvas.drawOutline(outline, paint)
                        canvas.restore()
                    }
                }
                cachedDrawSize = drawSize
                cachedStyle = highlight.style
                cachedWidthDp = highlight.width.value
                cachedBlurDp = highlight.blurRadius.value
                cachedShape = currentShape
                cachedDensity = density.density
                cachedLayoutDirection = layoutDirection
            }

            translate(-1f, -1f) {
                drawLayer(highlightLayer)
            }
        }
    }

    override fun onAttach() {
        val graphicsContext = requireGraphicsContext()
        highlightLayer = graphicsContext.createGraphicsLayer()
        invalidateCache()
    }

    override fun onDetach() {
        val graphicsContext = requireGraphicsContext()
        highlightLayer?.let { layer ->
            graphicsContext.releaseGraphicsLayer(layer)
            highlightLayer = null
        }
        clipPath = null
        runtimeShaderCache.clear()
        invalidateCache()
    }

    private fun DrawScope.configurePaint(highlight: Highlight) {
        paint.color = highlight.style.color
        paint.strokeWidth = ceil(highlight.width.toPx().fastCoerceAtMost(size.minDimension / 2f)) * 2f
        paint.blur(highlight.blurRadius.toPx())
        if (isRuntimeShaderSupported()) {
            val shader =
                runCatching {
                    with(highlight.style) {
                        createShader(
                            shape = shapeProvider.shape,
                            runtimeShaderCache = runtimeShaderCache
                        )
                    }
                }.getOrNull()
            paint.setRuntimeShader(shader)
        }
    }
}
