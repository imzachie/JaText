package com.kyant.backdrop.navigation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * 1:1 replica of the "Updates" status-ring speech icon from `image (1).png`:
 * concentric inner circle + 3-segment status ring with bottom-left speech tail + green status dot at top-right.
 */
@Composable
fun IosUpdatesNavIcon(
    tint: Color,
    selected: Boolean = false,
    showStatusDot: Boolean = true,
    size: Dp = 24.dp,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val w = this.size.width
        val s = w / 24f
        val cx = 12f * s
        val cy = 12f * s
        val strokeW = (if (selected) 2.1f else 1.85f) * s

        // 1. Inner circle
        if (selected) {
            drawCircle(
                color = tint,
                radius = 5.0f * s,
                center = Offset(cx, cy),
                style = Fill,
            )
        } else {
            drawCircle(
                color = tint,
                radius = 4.95f * s,
                center = Offset(cx, cy),
                style = Stroke(width = strokeW),
            )
        }

        val outerR = 8.85f * s
        val arcRect = Rect(
            left = cx - outerR,
            top = cy - outerR,
            right = cx + outerR,
            bottom = cy + outerR,
        )

        // 2. Top arc (from ~10:45 to ~12:40, stopping before the green dot)
        drawArc(
            color = tint,
            startAngle = 228f,
            sweepAngle = 60f,
            useCenter = false,
            topLeft = arcRect.topLeft,
            size = arcRect.size,
            style = Stroke(width = strokeW, cap = StrokeCap.Round),
        )

        // 3. Right arc (from below the green dot down to ~4:45)
        drawArc(
            color = tint,
            startAngle = 346f,
            sweepAngle = 66f,
            useCenter = false,
            topLeft = arcRect.topLeft,
            size = arcRect.size,
            style = Stroke(width = strokeW, cap = StrokeCap.Round),
        )

        // 4. Bottom + bottom-left speech-bubble tail + left arc (continuous path)
        val tailPath = Path().apply {
            arcTo(
                rect = arcRect,
                startAngleDegrees = 74f,
                sweepAngleDegrees = 48f,
                forceMoveTo = true,
            )
            // Kick out to bottom-left speech tail tip and back onto the lower-left ring
            lineTo(4.15f * s, 19.65f * s)
            val rejoinDeg = 148.0 * PI / 180.0
            lineTo(
                cx + outerR * cos(rejoinDeg).toFloat(),
                cy + outerR * sin(rejoinDeg).toFloat(),
            )
            arcTo(
                rect = arcRect,
                startAngleDegrees = 148f,
                sweepAngleDegrees = 56f,
                forceMoveTo = false,
            )
        }
        drawPath(
            path = tailPath,
            color = tint,
            style = Stroke(
                width = strokeW,
                cap = StrokeCap.Round,
                join = StrokeJoin.Round,
            ),
        )

        // 5. Green status dot at ~1:30 (`317°`)
        if (showStatusDot) {
            val dotRad = 317.0 * PI / 180.0
            drawCircle(
                color = Color(0xFF42A85F),
                radius = 2.2f * s,
                center = Offset(
                    cx + outerR * cos(dotRad).toFloat(),
                    cy + outerR * sin(dotRad).toFloat(),
                ),
            )
        }
    }
}

/**
 * 1:1 replica of the "Calls" handset icon from `image (1).png` (outlined when inactive, filled when active).
 */
@Composable
fun IosCallsNavIcon(
    tint: Color,
    selected: Boolean = false,
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
            transform(Matrix().apply { scale(sx, sy) })
        }
        drawPath(
            path = scaled,
            color = tint,
            style = if (selected) {
                Fill
            } else {
                Stroke(
                    width = 1.85f * sx,
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round,
                )
            },
        )
    }
}

/**
 * 1:1 replica of the 3-people "Communities / Groups" icon from `image (1).png`:
 * elevated larger center person + two symmetric flanking people with flat-bottomed dome shoulders.
 */
@Composable
fun IosGroupsNavIcon(
    tint: Color,
    selected: Boolean = false,
    size: Dp = 25.dp,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val sx = this.size.width / 24f
        val sy = this.size.height / 24f
        val strokeW = 1.75f * sx

        val centerDome = PathParser()
            .parsePathString("M7.0 18.6C7.0 15.15 9.1 13.35 12.0 13.35C14.9 13.35 17.0 15.15 17.0 18.6Z")
            .toPath()
            .let { p -> Path().apply { addPath(p); transform(Matrix().apply { scale(sx, sy) }) } }

        if (selected) {
            // Center head + dome filled
            drawCircle(
                color = tint,
                radius = 2.55f * sx,
                center = Offset(12.0f * sx, 7.65f * sy),
                style = Fill,
            )
            drawPath(path = centerDome, color = tint, style = Fill)

            // Side heads filled
            drawCircle(
                color = tint,
                radius = 1.95f * sx,
                center = Offset(5.7f * sx, 9.65f * sy),
                style = Fill,
            )
            drawCircle(
                color = tint,
                radius = 1.95f * sx,
                center = Offset(18.3f * sx, 9.65f * sy),
                style = Fill,
            )

            // Side domes with crisp cutout around the foreground center dome
            val centerMask = PathParser()
                .parsePathString("M5.65 19.4C5.65 14.3 8.35 12.05 12.0 12.05C15.65 12.05 18.35 14.3 18.35 19.4Z")
                .toPath()
                .let { p -> Path().apply { addPath(p); transform(Matrix().apply { scale(sx, sy) }) } }

            val leftFull = PathParser()
                .parsePathString("M1.6 18.1C1.6 15.55 3.15 14.15 5.35 14.15C7.35 14.15 8.8 15.35 8.8 18.1Z")
                .toPath()
                .let { p -> Path().apply { addPath(p); transform(Matrix().apply { scale(sx, sy) }) } }
            val rightFull = PathParser()
                .parsePathString("M15.2 18.1C15.2 15.35 16.65 14.15 18.65 14.15C20.85 14.15 22.4 15.55 22.4 18.1Z")
                .toPath()
                .let { p -> Path().apply { addPath(p); transform(Matrix().apply { scale(sx, sy) }) } }

            val leftCut = Path().apply { op(leftFull, centerMask, PathOperation.Difference) }
            val rightCut = Path().apply { op(rightFull, centerMask, PathOperation.Difference) }
            drawPath(path = leftCut, color = tint, style = Fill)
            drawPath(path = rightCut, color = tint, style = Fill)
        } else {
            // Center head + dome stroked
            drawCircle(
                color = tint,
                radius = 2.45f * sx,
                center = Offset(12.0f * sx, 7.65f * sy),
                style = Stroke(width = strokeW),
            )
            drawPath(
                path = centerDome,
                color = tint,
                style = Stroke(width = strokeW, cap = StrokeCap.Round, join = StrokeJoin.Round),
            )

            // Left head + tucked left dome
            drawCircle(
                color = tint,
                radius = 1.85f * sx,
                center = Offset(5.7f * sx, 9.65f * sy),
                style = Stroke(width = 1.68f * sx),
            )
            val leftShoulder = PathParser()
                .parsePathString("M7.15 15.05C6.55 14.65 5.8 14.45 5.0 14.45C3.05 14.45 1.8 15.85 1.8 18.05L5.35 18.05")
                .toPath()
                .let { p -> Path().apply { addPath(p); transform(Matrix().apply { scale(sx, sy) }) } }
            drawPath(
                path = leftShoulder,
                color = tint,
                style = Stroke(width = 1.68f * sx, cap = StrokeCap.Round, join = StrokeJoin.Round),
            )

            // Right head + tucked right dome
            drawCircle(
                color = tint,
                radius = 1.85f * sx,
                center = Offset(18.3f * sx, 9.65f * sy),
                style = Stroke(width = 1.68f * sx),
            )
            val rightShoulder = PathParser()
                .parsePathString("M16.85 15.05C17.45 14.65 18.2 14.45 19.0 14.45C20.95 14.45 22.2 15.85 22.2 18.05L18.65 18.05")
                .toPath()
                .let { p -> Path().apply { addPath(p); transform(Matrix().apply { scale(sx, sy) }) } }
            drawPath(
                path = rightShoulder,
                color = tint,
                style = Stroke(width = 1.68f * sx, cap = StrokeCap.Round, join = StrokeJoin.Round),
            )
        }
    }
}

/**
 * 1:1 replica of the dual-overlapping speech bubbles "Chats" icon from `image (1).png`:
 * primary left bubble (bottom-left tail) + peeking right bubble (bottom-right tail),
 * solid-filled with crisp transparent separation crescent when selected, outlined when unselected.
 */
@Composable
fun IosChatsNavIcon(
    tint: Color,
    selected: Boolean = true,
    size: Dp = 25.dp,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val sx = this.size.width / 24f
        val sy = this.size.height / 24f

        val frontBubble = PathParser()
            .parsePathString(
                "M10.1 4.2C5.8 4.2 2.4 6.95 2.4 10.45C2.4 12.35 3.45 14.04 5.1 15.18C4.92 16.32 4.28 17.52 3.55 18.22C3.35 18.4 3.5 18.74 3.78 18.7C5.45 18.5 6.98 17.78 8.0 16.82C8.68 16.95 9.38 17.02 10.1 17.02C14.4 17.02 17.8 14.22 17.8 10.61C17.8 7.05 14.4 4.2 10.1 4.2Z"
            )
            .toPath()
            .let { p -> Path().apply { addPath(p); transform(Matrix().apply { scale(sx, sy) }) } }

        val backBubble = PathParser()
            .parsePathString(
                "M15.1 6.35C18.75 6.35 21.65 8.75 21.65 11.75C21.65 13.4 20.75 14.88 19.32 15.86C19.48 16.86 20.02 17.9 20.65 18.52C20.82 18.68 20.68 18.98 20.44 18.95C19.02 18.78 17.72 18.14 16.85 17.32C16.28 17.43 15.7 17.5 15.1 17.5C11.45 17.5 8.55 15.08 8.55 12.05C8.55 8.92 11.45 6.35 15.1 6.35Z"
            )
            .toPath()
            .let { p -> Path().apply { addPath(p); transform(Matrix().apply { scale(sx, sy) }) } }

        val frontExpandedMask = PathParser()
            .parsePathString(
                "M10.1 2.75C5.0 2.75 0.95 6.1 0.95 10.45C0.95 15.0 5.0 18.55 10.1 18.55C15.2 18.55 19.35 15.0 19.35 10.6C19.35 6.15 15.2 2.75 10.1 2.75Z"
            )
            .toPath()
            .let { p -> Path().apply { addPath(p); transform(Matrix().apply { scale(sx, sy) }) } }

        if (selected) {
            drawPath(path = frontBubble, color = tint, style = Fill)
            val backPeeking = Path().apply { op(backBubble, frontExpandedMask, PathOperation.Difference) }
            drawPath(path = backPeeking, color = tint, style = Fill)
        } else {
            val strokeW = 1.78f * sx
            drawPath(
                path = frontBubble,
                color = tint,
                style = Stroke(width = strokeW, cap = StrokeCap.Round, join = StrokeJoin.Round),
            )
            val backPeeking = Path().apply { op(backBubble, frontExpandedMask, PathOperation.Difference) }
            drawPath(
                path = backPeeking,
                color = tint,
                style = Stroke(width = 1.65f * sx, cap = StrokeCap.Round, join = StrokeJoin.Round),
            )
        }
    }
}

/**
 * Legacy helper icons preserved for internal reuse if needed.
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
        drawCircle(
            color = tint,
            radius = 7.35f * s,
            center = center,
            style = Stroke(width = 1.85f * s),
        )
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
        drawCircle(
            color = tint,
            radius = 2.25f * s,
            center = center,
            style = Stroke(width = 1.55f * s),
        )
    }
}
