/*
 * Adapted from https://github.com/Kyant0/AndroidLiquidGlass (Apache License 2.0)
 * Copyright 2025 Kyant
 */
package com.kyant.backdrop.internal

import android.graphics.BlurMaskFilter
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Shader

internal fun Paint.blur(radius: Float) {
    this.asFrameworkPaint().maskFilter =
        if (radius.isFinite() && radius > 0f) BlurMaskFilter(radius, BlurMaskFilter.Blur.NORMAL)
        else null
}

internal fun Paint.setRuntimeShader(shader: Shader?) {
    this.shader = shader
}
