/*
 * Adapted from https://github.com/Kyant0/AndroidLiquidGlass (Apache License 2.0)
 * Copyright 2025 Kyant
 */
package com.kyant.backdrop.highlight

import android.os.Build
import androidx.annotation.FloatRange
import androidx.annotation.RequiresApi
import androidx.compose.foundation.shape.CornerBasedShape
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.ui.geometry.isUnspecified
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.util.fastCoerceAtMost
import com.kyant.backdrop.RuntimeShaderCache
import com.kyant.backdrop.asComposeShader
import com.kyant.backdrop.internal.DefaultHighlightShaderString
import com.kyant.backdrop.internal.VibrantHighlightShaderString
import kotlin.math.PI

@Immutable
interface HighlightStyle {

    val color: Color

    val blendMode: BlendMode

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    fun DrawScope.createShader(
        shape: Shape,
        runtimeShaderCache: RuntimeShaderCache
    ): Shader?

    @Immutable
    data class Plain(
        override val color: Color = Color.White.copy(alpha = 0.38f),
        override val blendMode: BlendMode = BlendMode.Plus
    ) : HighlightStyle {

        @RequiresApi(Build.VERSION_CODES.TIRAMISU)
        override fun DrawScope.createShader(
            shape: Shape,
            runtimeShaderCache: RuntimeShaderCache
        ): Shader? = null
    }

    @Immutable
    data class Default(
        @FloatRange(from = 0.0, to = 1.0) val intensity: Float = 0.5f,
        val angle: Float = 45f,
        @FloatRange(from = 0.0) val falloff: Float = 1f
    ) : HighlightStyle {

        override val color: Color = Color.White.copy(alpha = intensity.coerceIn(0f, 1f))

        override val blendMode: BlendMode = BlendMode.Plus

        @RequiresApi(Build.VERSION_CODES.TIRAMISU)
        override fun DrawScope.createShader(
            shape: Shape,
            runtimeShaderCache: RuntimeShaderCache
        ): Shader? {
            val drawSize = size
            if (drawSize.isUnspecified || drawSize.width <= 0f || drawSize.height <= 0f) return null
            val radii = getCornerRadii(shape)
            return runCatching {
                runtimeShaderCache.obtainRuntimeShader(
                    "Default",
                    DefaultHighlightShaderString
                ).apply {
                    setFloatUniform("size", drawSize.width, drawSize.height)
                    setColorUniform("color", color)
                    setFloatUniform("cornerRadii", radii[0], radii[1], radii[2], radii[3])
                    setFloatUniform("angle", angle * (PI / 180f).toFloat())
                    setFloatUniform("falloff", falloff)
                }.asComposeShader()
            }.getOrNull()
        }
    }

    @Immutable
    data class Ambient(
        @FloatRange(from = 0.0, to = 1.0) val intensity: Float = 0.38f
    ) : HighlightStyle {

        override val color: Color = Color.Black.copy(alpha = intensity.coerceIn(0f, 1f))

        override val blendMode: BlendMode = BlendMode.SrcOver

        @RequiresApi(Build.VERSION_CODES.TIRAMISU)
        override fun DrawScope.createShader(
            shape: Shape,
            runtimeShaderCache: RuntimeShaderCache
        ): Shader? {
            val drawSize = size
            if (drawSize.isUnspecified || drawSize.width <= 0f || drawSize.height <= 0f) return null
            val radii = getCornerRadii(shape)
            return runCatching {
                runtimeShaderCache.obtainRuntimeShader(
                    "Vibrant",
                    VibrantHighlightShaderString
                ).apply {
                    setFloatUniform("size", drawSize.width, drawSize.height)
                    setFloatUniform("cornerRadii", radii[0], radii[1], radii[2], radii[3])
                }.asComposeShader()
            }.getOrNull()
        }
    }

    companion object {

        @Stable
        val Default: Default = Default()

        @Stable
        val Ambient: Ambient = Ambient()

        @Stable
        val Plain: Plain = Plain()
    }
}

private fun DrawScope.getCornerRadii(shape: Shape): FloatArray {
    val size = size
    if (size.isUnspecified || size.width <= 0f || size.height <= 0f) {
        return FloatArray(4)
    }
    val shape = shape as? CornerBasedShape ?: return FloatArray(4) { size.minDimension / 2f }
    val isLtr = layoutDirection == LayoutDirection.Ltr
    val topLeft =
        if (isLtr) shape.topStart.toPx(size, this)
        else shape.topEnd.toPx(size, this)
    val topRight =
        if (isLtr) shape.topEnd.toPx(size, this)
        else shape.topStart.toPx(size, this)
    val bottomRight =
        if (isLtr) shape.bottomEnd.toPx(size, this)
        else shape.bottomStart.toPx(size, this)
    val bottomLeft =
        if (isLtr) shape.bottomStart.toPx(size, this)
        else shape.bottomEnd.toPx(size, this)
    val maxRadius = size.minDimension / 2f
    return floatArrayOf(
        topLeft.fastCoerceAtMost(maxRadius),
        topRight.fastCoerceAtMost(maxRadius),
        bottomRight.fastCoerceAtMost(maxRadius),
        bottomLeft.fastCoerceAtMost(maxRadius)
    )
}
