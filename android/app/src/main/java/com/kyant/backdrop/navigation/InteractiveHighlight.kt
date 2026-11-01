/*
 * Adapted from https://github.com/Kyant0/AndroidLiquidGlass (Apache License 2.0)
 * Copyright 2025 Kyant
 */
package com.kyant.backdrop.navigation

import android.graphics.RuntimeShader
import android.os.Build
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.VectorConverter
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.spring
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.isUnspecified
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.util.fastCoerceIn
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

class InteractiveHighlight(
    val animationScope: CoroutineScope,
    val position: (size: Size, offset: Offset) -> Offset = { _, offset -> offset }
) {

    private val pressProgressAnimationSpec =
        spring(0.5f, 300f, 0.001f)
    private val positionAnimationSpec =
        spring(0.5f, 300f, Offset.VisibilityThreshold)

    private val pressProgressAnimation =
        Animatable(0f, 0.001f)
    private val positionAnimation =
        Animatable(Offset.Zero, Offset.VectorConverter, Offset.VisibilityThreshold)

    private var startPosition = Offset.Zero
    val pressProgress: Float get() = pressProgressAnimation.value
    val offset: Offset get() = positionAnimation.value - startPosition

    private val shader: RuntimeShader? by lazy(LazyThreadSafetyMode.NONE) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            runCatching {
                RuntimeShader(
                    """
uniform float2 size;
layout(color) uniform half4 color;
uniform float radius;
uniform float2 position;

half4 main(float2 coord) {
    float dist = distance(coord, position);
    float intensity = smoothstep(radius, radius * 0.5, dist);
    return color * intensity;
}"""
                )
            }.getOrNull()
        } else {
            null
        }
    }

    val modifier: Modifier =
        Modifier.drawWithContent {
            val rawProgress = pressProgressAnimation.value
            val drawSize = size
            val activeShader = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) shader else null
            if (rawProgress > 0f && !drawSize.isUnspecified && drawSize.width > 0f && drawSize.height > 0f) {
                val safeProgress = rawProgress.coerceIn(0f, 1f)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && activeShader != null) {
                    drawRect(
                        Color.White.copy(alpha = (0.08f * safeProgress).coerceIn(0f, 1f)),
                        blendMode = BlendMode.Plus
                    )
                    val brush = runCatching {
                        activeShader.apply {
                            val pos = position(drawSize, positionAnimation.value)
                            setFloatUniform("size", drawSize.width, drawSize.height)
                            setColorUniform(
                                "color",
                                Color.White.copy(alpha = (0.15f * safeProgress).coerceIn(0f, 1f)).toArgb()
                            )
                            setFloatUniform("radius", drawSize.minDimension * 1.5f)
                            setFloatUniform(
                                "position",
                                pos.x.fastCoerceIn(0f, drawSize.width),
                                pos.y.fastCoerceIn(0f, drawSize.height)
                            )
                        }
                        ShaderBrush(activeShader)
                    }.getOrNull()
                    if (brush != null) {
                        drawRect(
                            brush = brush,
                            blendMode = BlendMode.Plus
                        )
                    }
                } else {
                    drawRect(
                        Color.White.copy(alpha = (0.25f * safeProgress).coerceIn(0f, 1f)),
                        blendMode = BlendMode.Plus
                    )
                }
            }

            drawContent()
        }

    val gestureModifier: Modifier =
        Modifier.pointerInput(animationScope) {
            inspectDragGestures(
                onDragStart = { down ->
                    startPosition = down.position
                    animationScope.launch {
                        launch { pressProgressAnimation.animateTo(1f, pressProgressAnimationSpec) }
                        launch { positionAnimation.snapTo(startPosition) }
                    }
                },
                onDragEnd = {
                    animationScope.launch {
                        launch { pressProgressAnimation.animateTo(0f, pressProgressAnimationSpec) }
                        launch { positionAnimation.animateTo(startPosition, positionAnimationSpec) }
                    }
                },
                onDragCancel = {
                    animationScope.launch {
                        launch { pressProgressAnimation.animateTo(0f, pressProgressAnimationSpec) }
                        launch { positionAnimation.animateTo(startPosition, positionAnimationSpec) }
                    }
                }
            ) { change, _ ->
                animationScope.launch { positionAnimation.snapTo(change.position) }
            }
        }
}
