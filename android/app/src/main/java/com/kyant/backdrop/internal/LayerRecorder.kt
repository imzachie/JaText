/*
 * Adapted from https://github.com/Kyant0/AndroidLiquidGlass (Apache License 2.0)
 * Copyright 2025 Kyant
 */
package com.kyant.backdrop.internal

import androidx.compose.ui.geometry.isUnspecified
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.node.DelegatableNode
import androidx.compose.ui.node.requireDensity
import androidx.compose.ui.unit.IntSize

internal fun DrawScope.recordLayer(
    node: DelegatableNode,
    layer: GraphicsLayer,
    size: IntSize? = null,
    block: DrawScope.() -> Unit
) {
    val targetSize = if (size != null) {
        size
    } else {
        val drawSize = this.size
        if (drawSize.isUnspecified || drawSize.width <= 0f || drawSize.height <= 0f) return
        IntSize(drawSize.width.toInt(), drawSize.height.toInt())
    }
    if (targetSize.width <= 0 || targetSize.height <= 0) return
    val density = node.requireDensity()
    layer.record(targetSize) {
        val prevDensity = drawContext.density
        drawContext.density = density
        try {
            this.block()
        } finally {
            drawContext.density = prevDensity
        }
    }
}
