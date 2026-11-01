/*
 * Adapted from https://github.com/Kyant0/AndroidLiquidGlass (Apache License 2.0)
 * Copyright 2025 Kyant
 */
package com.kyant.backdrop.effects

import androidx.annotation.FloatRange
import androidx.compose.foundation.shape.AbsoluteRoundedCornerShape
import androidx.compose.foundation.shape.CornerBasedShape
import androidx.compose.ui.geometry.isUnspecified
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.util.fastCoerceAtLeast
import androidx.compose.ui.util.fastCoerceAtMost
import com.kyant.backdrop.BackdropEffectScope
import com.kyant.backdrop.internal.RoundedRectRefractionShaderString
import com.kyant.backdrop.internal.RoundedRectRefractionWithDispersionShaderString
import com.kyant.backdrop.internal.RuntimeShaderEffect
import com.kyant.backdrop.isRuntimeShaderSupported

fun BackdropEffectScope.lens(
    @FloatRange(from = 0.0) refractionHeight: Float,
    @FloatRange(from = 0.0) refractionAmount: Float,
    depthEffect: Boolean = false,
    chromaticAberration: Boolean = false
) {
    if (!isRuntimeShaderSupported()) return
    if (!refractionHeight.isFinite() || !refractionAmount.isFinite()) return
    if (refractionHeight <= 0f || refractionAmount <= 0f) return
    val currentSize = size
    if (currentSize.isUnspecified || currentSize.width <= 0f || currentSize.height <= 0f) return

    if (padding > 0f) {
        padding = (padding - refractionHeight).fastCoerceAtLeast(0f)
    }

    val radii = cornerRadii ?: return
    val createdEffect = runCatching {
        val shader =
            if (!chromaticAberration) {
                obtainRuntimeShader("Refraction", RoundedRectRefractionShaderString)
            } else {
                obtainRuntimeShader(
                    "RefractionWithDispersion",
                    RoundedRectRefractionWithDispersionShaderString
                )
            }
        shader.apply {
            setFloatUniform("size", currentSize.width, currentSize.height)
            setFloatUniform("offset", -padding, -padding)
            setFloatUniform("cornerRadii", radii[0], radii[1], radii[2], radii[3])
            setFloatUniform("refractionHeight", refractionHeight)
            setFloatUniform("refractionAmount", -refractionAmount)
            setFloatUniform("depthEffect", if (depthEffect) 1f else 0f)
            if (chromaticAberration) {
                setFloatUniform("chromaticAberration", 1f)
            }
        }
        RuntimeShaderEffect(shader, "content")
    }.getOrNull() ?: return

    effect(createdEffect)
}

private val BackdropEffectScope.cornerRadii: FloatArray?
    get() {
        val currentSize = size
        if (currentSize.isUnspecified || currentSize.width <= 0f || currentSize.height <= 0f) {
            return null
        }
        return when (val shape = shape) {
            is AbsoluteRoundedCornerShape -> {
                val maxRadius = currentSize.minDimension / 2f
                val topLeft = shape.topStart.toPx(currentSize, this)
                val topRight = shape.topEnd.toPx(currentSize, this)
                val bottomRight = shape.bottomEnd.toPx(currentSize, this)
                val bottomLeft = shape.bottomStart.toPx(currentSize, this)
                floatArrayOf(
                    topLeft.fastCoerceAtMost(maxRadius),
                    topRight.fastCoerceAtMost(maxRadius),
                    bottomRight.fastCoerceAtMost(maxRadius),
                    bottomLeft.fastCoerceAtMost(maxRadius)
                )
            }

            is CornerBasedShape -> {
                val maxRadius = currentSize.minDimension / 2f
                val isLtr = layoutDirection == LayoutDirection.Ltr
                val topLeft =
                    if (isLtr) shape.topStart.toPx(currentSize, this)
                    else shape.topEnd.toPx(currentSize, this)
                val topRight =
                    if (isLtr) shape.topEnd.toPx(currentSize, this)
                    else shape.topStart.toPx(currentSize, this)
                val bottomRight =
                    if (isLtr) shape.bottomEnd.toPx(currentSize, this)
                    else shape.bottomStart.toPx(currentSize, this)
                val bottomLeft =
                    if (isLtr) shape.bottomStart.toPx(currentSize, this)
                    else shape.bottomEnd.toPx(currentSize, this)
                floatArrayOf(
                    topLeft.fastCoerceAtMost(maxRadius),
                    topRight.fastCoerceAtMost(maxRadius),
                    bottomRight.fastCoerceAtMost(maxRadius),
                    bottomLeft.fastCoerceAtMost(maxRadius)
                )
            }

            else -> null
        }
    }
