/*
 * Adapted from https://github.com/Kyant0/AndroidLiquidGlass (Apache License 2.0)
 * Copyright 2025 Kyant
 */
package com.kyant.backdrop.shadow

import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.isUnspecified
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.BlurEffect
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.layer.CompositingStrategy
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
import com.kyant.backdrop.internal.ShapeProvider
import com.kyant.backdrop.internal.clipOutline
import com.kyant.backdrop.isRenderEffectSupported

internal class InnerShadowElement(
    val shapeProvider: ShapeProvider,
    val shadow: () -> InnerShadow?
) : ModifierNodeElement<InnerShadowNode>() {

    override fun create(): InnerShadowNode {
        return InnerShadowNode(shapeProvider, shadow)
    }

    override fun update(node: InnerShadowNode) {
        node.shapeProvider = shapeProvider
        node.shadow = shadow
        node.invalidateCache()
        node.invalidateDraw()
    }

    override fun InspectorInfo.inspectableProperties() {
        name = "innerShadow"
        properties["shapeProvider"] = shapeProvider
        properties["shadow"] = shadow
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is InnerShadowElement) return false

        if (shapeProvider != other.shapeProvider) return false
        if (shadow != other.shadow) return false

        return true
    }

    override fun hashCode(): Int {
        var result = shapeProvider.hashCode()
        result = 31 * result + shadow.hashCode()
        return result
    }
}

internal class InnerShadowNode(
    var shapeProvider: ShapeProvider,
    var shadow: () -> InnerShadow?
) : DrawModifierNode, Modifier.Node() {

    override val shouldAutoInvalidate: Boolean = false

    private var shadowLayer: GraphicsLayer? = null

    private val paint = Paint()
    private var clipPath: Path? = null

    private var prevRadius = Float.NaN
    private var cachedDrawSize: Size = Size.Unspecified
    private var cachedRadiusDp: Float = Float.NaN
    private var cachedColor = androidx.compose.ui.graphics.Color.Unspecified
    private var cachedOffset = androidx.compose.ui.unit.DpOffset.Unspecified
    private var cachedShape: Shape? = null
    private var cachedDensity: Float = Float.NaN
    private var cachedLayoutDirection: LayoutDirection? = null
    private var cachedOutline: Outline? = null

    fun invalidateCache() {
        cachedDrawSize = Size.Unspecified
        cachedOutline = null
    }

    override fun ContentDrawScope.draw() {
        drawContent()

        if (!isRenderEffectSupported()) return
        val drawSize = size
        if (drawSize.isUnspecified || drawSize.width <= 0f || drawSize.height <= 0f) return

        val shadow = shadow() ?: return
        if (shadow.alpha <= 0f) return

        val shadowLayer = shadowLayer
        if (shadowLayer != null) {
            val density: Density = this
            val layoutDirection = layoutDirection
            val currentShape = shapeProvider.shape
            val radius = shadow.radius.toPx().coerceAtLeast(0f)

            shadowLayer.alpha = shadow.alpha.coerceIn(0f, 1f)
            shadowLayer.blendMode = shadow.blendMode
            if (prevRadius != radius) {
                shadowLayer.renderEffect =
                    if (radius > 0f && radius.isFinite()) {
                        BlurEffect(radius, radius, TileMode.Decal)
                    } else {
                        null
                    }
                prevRadius = radius
            }

            val needsRecord =
                cachedDrawSize != drawSize ||
                    cachedRadiusDp != shadow.radius.value ||
                    cachedColor != shadow.color ||
                    cachedOffset != shadow.offset ||
                    cachedShape != currentShape ||
                    cachedDensity != density.density ||
                    cachedLayoutDirection != layoutDirection ||
                    cachedOutline == null

            val outline = if (needsRecord) {
                val nextOutline = currentShape.createOutline(drawSize, layoutDirection, density)
                val cp =
                    if (nextOutline is Outline.Rounded) {
                        clipPath ?: Path().also { clipPath = it }
                    } else {
                        null
                    }
                val offsetX = shadow.offset.x.toPx()
                val offsetY = shadow.offset.y.toPx()
                configurePaint(shadow)
                val layerSize = IntSize(
                    drawSize.width.toInt().coerceAtLeast(1),
                    drawSize.height.toInt().coerceAtLeast(1)
                )
                shadowLayer.record(layerSize) {
                    val canvas = drawContext.canvas
                    canvas.save()
                    canvas.clipOutline(nextOutline, cp)
                    canvas.drawOutline(nextOutline, paint)
                    canvas.translate(offsetX, offsetY)
                    canvas.drawOutline(nextOutline, InnerShadowMaskPaint)
                    canvas.translate(-offsetX, -offsetY)
                    canvas.restore()
                }
                cachedDrawSize = drawSize
                cachedRadiusDp = shadow.radius.value
                cachedColor = shadow.color
                cachedOffset = shadow.offset
                cachedShape = currentShape
                cachedDensity = density.density
                cachedLayoutDirection = layoutDirection
                cachedOutline = nextOutline
                nextOutline
            } else {
                cachedOutline!!
            }

            val cp = if (outline is Outline.Rounded) clipPath else null
            val canvas = drawContext.canvas
            canvas.save()
            canvas.clipOutline(outline, cp)
            drawLayer(shadowLayer)
            canvas.restore()
        }
    }

    override fun onAttach() {
        val graphicsContext = requireGraphicsContext()
        shadowLayer =
            graphicsContext.createGraphicsLayer().apply {
                compositingStrategy = CompositingStrategy.Offscreen
            }
        invalidateCache()
    }

    override fun onDetach() {
        val graphicsContext = requireGraphicsContext()
        shadowLayer?.let { layer ->
            graphicsContext.releaseGraphicsLayer(layer)
            shadowLayer = null
        }
        clipPath = null
        invalidateCache()
    }

    private fun DrawScope.configurePaint(shadow: InnerShadow) {
        paint.color = shadow.color
    }
}

private val InnerShadowMaskPaint = Paint().apply {
    blendMode = BlendMode.Clear
}
