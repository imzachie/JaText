/*
 * Adapted from https://github.com/Kyant0/AndroidLiquidGlass (Apache License 2.0)
 * Copyright 2025 Kyant
 */
package com.kyant.backdrop.internal

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.isUnspecified
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.DefaultCameraDistance
import androidx.compose.ui.graphics.DefaultShadowColor
import androidx.compose.ui.graphics.GraphicsLayerScope
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.RenderEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.DrawTransform
import androidx.compose.ui.unit.Density
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

internal class InverseLayerScope : GraphicsLayerScope {

    override var size: Size = Size.Unspecified
    override var density: Float = 1f
    override var fontScale: Float = 1f

    override var scaleX: Float = 1f
    override var scaleY: Float = 1f
    override var alpha: Float = 1f
    override var translationX: Float = 0f
    override var translationY: Float = 0f
    override var shadowElevation: Float = 0f
    override var ambientShadowColor: Color = DefaultShadowColor
    override var spotShadowColor: Color = DefaultShadowColor
    override var rotationX: Float = 0f
    override var rotationY: Float = 0f
    override var rotationZ: Float = 0f
    override var cameraDistance: Float = DefaultCameraDistance
    override var transformOrigin: TransformOrigin = TransformOrigin.Center
    override var shape: Shape = RectangleShape
    override var clip: Boolean = false
    override var renderEffect: RenderEffect? = null
    override var compositingStrategy: CompositingStrategy = CompositingStrategy.Auto

    private var matrix: Matrix? = null

    fun DrawTransform.inverseTransform(
        density: Density,
        layerBlock: GraphicsLayerScope.() -> Unit
    ) {
        val currentSize = size
        if (currentSize.isUnspecified) return
        this@InverseLayerScope.size = currentSize
        this@InverseLayerScope.density = density.density
        fontScale = density.fontScale

        layerBlock()

        inverseTransformAtTopLeft(
            rotationZ = rotationZ,
            scaleX = scaleX,
            scaleY = scaleY
        )
    }

    fun reset() {
        size = Size.Unspecified
        density = 1f
        fontScale = 1f

        scaleX = 1f
        scaleY = 1f
        alpha = 1f
        translationX = 0f
        translationY = 0f
        shadowElevation = 0f
        ambientShadowColor = DefaultShadowColor
        spotShadowColor = DefaultShadowColor
        rotationX = 0f
        rotationY = 0f
        rotationZ = 0f
        cameraDistance = DefaultCameraDistance
        transformOrigin = TransformOrigin.Center
        shape = RectangleShape
        clip = false
        renderEffect = null
        compositingStrategy = CompositingStrategy.Auto
    }

    private fun DrawTransform.inverseTransformAtTopLeft(
        rotationZ: Float,
        scaleX: Float,
        scaleY: Float
    ) {
        val size = size
        if (size.isUnspecified) return
        val sX = scaleX * scaleX
        val sY = scaleY * scaleY
        if (sX == 0f || sY == 0f || !sX.isFinite() || !sY.isFinite()) return

        val pivot = Offset(
            transformOrigin.pivotFractionX * size.width,
            transformOrigin.pivotFractionY * size.height
        )
        val rad = -rotationZ * (PI / 180.0)
        val rCos = cos(rad).toFloat()
        val rSin = sin(rad).toFloat()

        val matrix = matrix?.apply { reset() } ?: Matrix().also { matrix = it }
        matrix.values[Matrix.ScaleX] = rCos / sX
        matrix.values[Matrix.SkewY] = rSin / sY
        matrix.values[Matrix.SkewX] = -rSin / sX
        matrix.values[Matrix.ScaleY] = rCos / sY
        matrix.values[Matrix.TranslateX] = (pivot.x - (rCos * pivot.x - rSin * pivot.y)) / sX
        matrix.values[Matrix.TranslateY] = (pivot.y - (rSin * pivot.x + rCos * pivot.y)) / sY

        transform(matrix)
    }
}
