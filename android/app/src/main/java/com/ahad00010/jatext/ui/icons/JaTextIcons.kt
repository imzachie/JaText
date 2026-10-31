package com.ahad00010.jatext.ui.icons

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Pure vector Google "G" emblem for the in-app Google Sign-In button (zero WebView, zero emoji).
 */
@Composable
fun GoogleBrandVectorIcon(size: Dp = 20.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val stroke = w * 0.19f
        val inset = stroke / 2f + w * 0.06f
        val arcSize = androidx.compose.ui.geometry.Size(w - inset * 2f, h - inset * 2f)
        val topLeft = Offset(inset, inset)

        // Red top arc
        drawArc(
            color = Color(0xFFEA4335),
            startAngle = 215f,
            sweepAngle = 105f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(width = stroke, cap = StrokeCap.Butt),
        )
        // Yellow left arc
        drawArc(
            color = Color(0xFFFBBC05),
            startAngle = 140f,
            sweepAngle = 78f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(width = stroke, cap = StrokeCap.Butt),
        )
        // Green bottom arc
        drawArc(
            color = Color(0xFF34A853),
            startAngle = 45f,
            sweepAngle = 98f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(width = stroke, cap = StrokeCap.Butt),
        )
        // Blue right arc + crossbar
        drawArc(
            color = Color(0xFF4285F4),
            startAngle = -8f,
            sweepAngle = 56f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(width = stroke, cap = StrokeCap.Butt),
        )
        drawLine(
            color = Color(0xFF4285F4),
            start = Offset(w * 0.52f, h * 0.50f),
            end = Offset(w - inset + stroke * 0.35f, h * 0.50f),
            strokeWidth = stroke * 0.92f,
            cap = StrokeCap.Butt,
        )
    }
}

/**
 * Crisp owner crown vector badge (replaces any crown emoji).
 */
@Composable
fun OwnerCrownVectorBadge(size: Dp = 14.dp, tint: Color = Color(0xFFFBBF24)) {
    Canvas(modifier = Modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val path = Path().apply {
            moveTo(w * 0.12f, h * 0.80f)
            lineTo(w * 0.08f, h * 0.30f)
            lineTo(w * 0.34f, h * 0.54f)
            lineTo(w * 0.50f, h * 0.18f)
            lineTo(w * 0.66f, h * 0.54f)
            lineTo(w * 0.92f, h * 0.30f)
            lineTo(w * 0.88f, h * 0.80f)
            close()
        }
        drawPath(path = path, color = tint)
    }
}
