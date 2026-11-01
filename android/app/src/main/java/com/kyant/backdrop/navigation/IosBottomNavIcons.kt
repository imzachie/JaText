package com.kyant.backdrop.navigation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * iOS 26 SF-Symbol-proportioned speech bubble (`bubble.left.fill` / `message.fill` silhouette)
 * for the "Chats" tab.
 */
@Composable
fun IosChatsNavIcon(
    tint: Color,
    size: Dp = 23.dp,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val sx = this.size.width / 24f
        val sy = this.size.height / 24f
        val path = PathParser()
            .parsePathString(
                "M12 3.4C6.8 3.4 2.7 6.85 2.7 11.15C2.7 13.48 3.96 15.56 5.95 16.97C5.76 18.23 5.05 19.56 4.18 20.32C3.95 20.52 4.12 20.89 4.42 20.85C6.38 20.62 8.15 19.78 9.32 18.68C10.18 18.83 11.08 18.91 12 18.91C17.2 18.91 21.3 15.46 21.3 11.15C21.3 6.85 17.2 3.4 12 3.4Z"
            )
            .toPath()
        val scaled = Path().apply {
            addPath(path)
            transform(
                androidx.compose.ui.graphics.Matrix().apply {
                    scale(sx, sy)
                }
            )
        }
        drawPath(
            path = scaled,
            color = tint,
            style = Stroke(
                width = 1.9f * sx,
                cap = StrokeCap.Round,
                join = StrokeJoin.Round,
            ),
        )
    }
}

/**
 * iOS 26 SF-Symbol handset (`phone` silhouette) for the "Calls" tab.
 */
@Composable
fun IosCallsNavIcon(
    tint: Color,
    size: Dp = 23.dp,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val sx = this.size.width / 24f
        val sy = this.size.height / 24f
        val path = PathParser()
            .parsePathString(
                "M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z"
            )
            .toPath()
        val scaled = Path().apply {
            addPath(path)
            transform(
                androidx.compose.ui.graphics.Matrix().apply {
                    scale(sx, sy)
                }
            )
        }
        drawPath(
            path = scaled,
            color = tint,
            style = Stroke(
                width = 1.85f * sx,
                cap = StrokeCap.Round,
                join = StrokeJoin.Round,
            ),
        )
    }
}

/**
 * iOS 26 SF-Symbol `plus.circle` icon for the "Add" tab.
 */
@Composable
fun IosAddNavIcon(
    tint: Color,
    size: Dp = 23.dp,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val w = this.size.width
        val s = w / 24f
        val center = Offset(w / 2f, this.size.height / 2f)
        drawCircle(
            color = tint,
            radius = 8.8f * s,
            center = center,
            style = Stroke(width = 1.85f * s),
        )
        drawLine(
            color = tint,
            start = Offset(center.x - 4.1f * s, center.y),
            end = Offset(center.x + 4.1f * s, center.y),
            strokeWidth = 1.95f * s,
            cap = StrokeCap.Round,
        )
        drawLine(
            color = tint,
            start = Offset(center.x, center.y - 4.1f * s),
            end = Offset(center.x, center.y + 4.1f * s),
            strokeWidth = 1.95f * s,
            cap = StrokeCap.Round,
        )
    }
}

/**
 * Authentic Apple iOS SF-Symbol `gear` icon for the "Settings" tab:
 * precision 10-tooth outer cog wheel + machined rim + 3 120-degree inner spokes + center hub ring.
 */
@Composable
fun IosSettingsGearIcon(
    tint: Color,
    size: Dp = 23.dp,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val s = w / 24f
        val cx = w / 2f
        val cy = h / 2f
        val center = Offset(cx, cy)

        // 1. 10 evenly spaced precision rounded cogs around the outer gear wheel
        val teethCount = 10
        for (i in 0 until teethCount) {
            val angleRad = (i * (360.0 / teethCount) - 90.0) * (PI / 180.0)
            val cosA = cos(angleRad).toFloat()
            val sinA = sin(angleRad).toFloat()
            drawLine(
                color = tint,
                start = Offset(cx + cosA * 7.4f * s, cy + sinA * 7.4f * s),
                end = Offset(cx + cosA * 10.15f * s, cy + sinA * 10.15f * s),
                strokeWidth = 2.0f * s,
                cap = StrokeCap.Round,
            )
        }

        // 2. Machined outer gear wheel ring
        drawCircle(
            color = tint,
            radius = 7.35f * s,
            center = center,
            style = Stroke(width = 1.85f * s),
        )

        // 3. Signature Apple iOS 3-spoke inner wheel (-90deg, 30deg, 150deg)
        val spokeAngles = doubleArrayOf(-90.0, 30.0, 150.0)
        for (deg in spokeAngles) {
            val rad = deg * (PI / 180.0)
            val cosA = cos(rad).toFloat()
            val sinA = sin(rad).toFloat()
            drawLine(
                color = tint,
                start = Offset(cx + cosA * 2.35f * s, cy + sinA * 2.35f * s),
                end = Offset(cx + cosA * 6.95f * s, cy + sinA * 6.95f * s),
                strokeWidth = 1.55f * s,
                cap = StrokeCap.Round,
            )
        }

        // 4. Concentric inner hub ring
        drawCircle(
            color = tint,
            radius = 2.25f * s,
            center = center,
            style = Stroke(width = 1.55f * s),
        )
    }
}

/**
 * Authentic Apple iOS 26.3 SF-Symbol `magnifyingglass` icon for the separated circular Search button.
 */
@Composable
fun IosSearchNavIcon(
    tint: Color,
    size: Dp = 24.dp,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val w = this.size.width
        val s = w / 24f
        val lensCenter = Offset(10.5f * s, 10.5f * s)
        val radius = 6.2f * s
        drawCircle(
            color = tint,
            radius = radius,
            center = lensCenter,
            style = Stroke(width = 2.05f * s),
        )
        drawLine(
            color = tint,
            start = Offset(15.05f * s, 15.05f * s),
            end = Offset(20.15f * s, 20.15f * s),
            strokeWidth = 2.2f * s,
            cap = StrokeCap.Round,
        )
    }
}

