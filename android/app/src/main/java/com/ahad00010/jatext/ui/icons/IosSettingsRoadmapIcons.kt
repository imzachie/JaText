package com.ahad00010.jatext.ui.icons

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * 1:1 custom vector icons for the "You" / Settings hub (Settings Roadmap.png).
 * Every icon renders on a 24x24 virtual grid with guard checks against unspecified draw sizes.
 */

@Composable
fun SettingsSearchSvgIcon(
    tint: Color,
    modifier: Modifier = Modifier.size(19.dp),
) {
    Canvas(modifier = modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val u = size.minDimension / 24f
        val sw = 2.0f * u
        drawCircle(
            color = tint,
            radius = 6.3f * u,
            center = Offset(10.6f * u, 10.6f * u),
            style = Stroke(width = sw, cap = StrokeCap.Round),
        )
        drawLine(
            color = tint,
            start = Offset(15.2f * u, 15.2f * u),
            end = Offset(19.8f * u, 19.8f * u),
            strokeWidth = sw,
            cap = StrokeCap.Round,
        )
    }
}

@Composable
fun SettingsQrCodeSvgIcon(
    tint: Color,
    modifier: Modifier = Modifier.size(19.dp),
) {
    Canvas(modifier = modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val u = size.minDimension / 24f
        val sw = 1.75f * u
        val stroke = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round)

        fun finderSquare(x: Float, y: Float) {
            drawRoundRect(
                color = tint,
                topLeft = Offset(x * u, y * u),
                size = Size(6.6f * u, 6.6f * u),
                cornerRadius = CornerRadius(1.35f * u, 1.35f * u),
                style = stroke,
            )
            drawRoundRect(
                color = tint,
                topLeft = Offset((x + 2.3f) * u, (y + 2.3f) * u),
                size = Size(2.0f * u, 2.0f * u),
                cornerRadius = CornerRadius(0.45f * u, 0.45f * u),
            )
        }

        finderSquare(3.5f, 3.5f)
        finderSquare(13.9f, 3.5f)
        finderSquare(3.5f, 13.9f)

        // Bottom-right QR modules matching Settings Roadmap.png
        val p = Path().apply {
            moveTo(14.1f * u, 14.1f * u)
            lineTo(16.6f * u, 14.1f * u)
            lineTo(16.6f * u, 16.6f * u)
            moveTo(19.8f * u, 14.1f * u)
            lineTo(19.8f * u, 17.2f * u)
            moveTo(14.1f * u, 19.8f * u)
            lineTo(17.2f * u, 19.8f * u)
        }
        drawPath(p, color = tint, style = stroke)
        drawCircle(
            color = tint,
            radius = 1.0f * u,
            center = Offset(19.6f * u, 19.6f * u),
        )
    }
}

@Composable
fun SettingsAddStatusPlusIcon(
    modifier: Modifier = Modifier.size(20.dp),
    tint: Color = Color(0xFF25D366),
) {
    Canvas(modifier = modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val u = size.minDimension / 24f
        drawCircle(
            color = tint,
            radius = 9.2f * u,
            center = Offset(12f * u, 12f * u),
            style = Stroke(width = 1.85f * u),
        )
        val arm = 4.2f * u
        drawLine(
            color = tint,
            start = Offset(12f * u - arm, 12f * u),
            end = Offset(12f * u + arm, 12f * u),
            strokeWidth = 1.95f * u,
            cap = StrokeCap.Round,
        )
        drawLine(
            color = tint,
            start = Offset(12f * u, 12f * u - arm),
            end = Offset(12f * u, 12f * u + arm),
            strokeWidth = 1.95f * u,
            cap = StrokeCap.Round,
        )
    }
}

@Composable
fun SettingsLinkedDevicesSvgIcon(
    tint: Color,
    modifier: Modifier = Modifier.size(22.dp),
) {
    Canvas(modifier = modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val u = size.minDimension / 24f
        val sw = 1.75f * u
        drawRoundRect(
            color = tint,
            topLeft = Offset(4.2f * u, 5.4f * u),
            size = Size(15.6f * u, 10.4f * u),
            cornerRadius = CornerRadius(1.5f * u, 1.5f * u),
            style = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
        drawLine(
            color = tint,
            start = Offset(2.1f * u, 18.4f * u),
            end = Offset(21.9f * u, 18.4f * u),
            strokeWidth = sw,
            cap = StrokeCap.Round,
        )
    }
}

@Composable
fun SettingsAccountKeySvgIcon(
    tint: Color,
    modifier: Modifier = Modifier.size(22.dp),
) {
    Canvas(modifier = modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val u = size.minDimension / 24f
        val sw = 1.75f * u
        // Top key ring bow
        drawCircle(
            color = tint,
            radius = 3.55f * u,
            center = Offset(12f * u, 7.1f * u),
            style = Stroke(width = sw),
        )
        // Small inner key pinhole dot
        drawCircle(
            color = tint,
            radius = 0.85f * u,
            center = Offset(12f * u, 6.5f * u),
        )
        // Vertical key blade + 2 right teeth at bottom
        val blade = Path().apply {
            moveTo(12f * u, 10.65f * u)
            lineTo(12f * u, 19.7f * u)
            moveTo(12f * u, 16.0f * u)
            lineTo(14.8f * u, 16.0f * u)
            moveTo(12f * u, 18.6f * u)
            lineTo(15.3f * u, 18.6f * u)
        }
        drawPath(
            path = blade,
            color = tint,
            style = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
    }
}

@Composable
fun SettingsPrivacyLockSvgIcon(
    tint: Color,
    modifier: Modifier = Modifier.size(22.dp),
) {
    Canvas(modifier = modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val u = size.minDimension / 24f
        val sw = 1.75f * u
        // Shackle arch
        val shackle = Path().apply {
            moveTo(8.5f * u, 10.7f * u)
            lineTo(8.5f * u, 7.6f * u)
            arcTo(
                rect = Rect(8.5f * u, 4.1f * u, 15.5f * u, 11.1f * u),
                startAngleDegrees = 180f,
                sweepAngleDegrees = 180f,
                forceMoveTo = false,
            )
            lineTo(15.5f * u, 10.7f * u)
        }
        drawPath(
            path = shackle,
            color = tint,
            style = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
        // Lock body
        drawRoundRect(
            color = tint,
            topLeft = Offset(5.9f * u, 10.7f * u),
            size = Size(12.2f * u, 8.8f * u),
            cornerRadius = CornerRadius(2.3f * u, 2.3f * u),
            style = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
    }
}

@Composable
fun SettingsChatsBubbleSvgIcon(
    tint: Color,
    modifier: Modifier = Modifier.size(22.dp),
) {
    Canvas(modifier = modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val u = size.minDimension / 24f
        val sw = 1.75f * u
        val bubble = Path().apply {
            // Clean single oval speech bubble with bottom-left tail matching Settings Roadmap.png
            val rect = Rect(3.7f * u, 4.7f * u, 20.3f * u, 18.3f * u)
            arcTo(rect, startAngleDegrees = 146f, sweepAngleDegrees = 326f, forceMoveTo = true)
            lineTo(4.5f * u, 19.1f * u)
            close()
        }
        drawPath(
            path = bubble,
            color = tint,
            style = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
    }
}

@Composable
fun SettingsNotificationsBadgeSvgIcon(
    tint: Color,
    modifier: Modifier = Modifier.size(22.dp),
) {
    Canvas(modifier = modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val u = size.minDimension / 24f
        val sw = 1.75f * u
        // Rounded square with clean top-right cutout around the notification badge dot
        val boxPath = Path().apply {
            val l = 4.8f * u
            val t = 5.8f * u
            val r = 18.2f * u
            val b = 19.2f * u
            val cr = 3.5f * u

            // Start along top edge before badge dot, go counter-clockwise around the square
            moveTo(13.6f * u, t)
            lineTo(l + cr, t)
            arcTo(Rect(l, t, l + 2 * cr, t + 2 * cr), 270f, -90f, false)
            lineTo(l, b - cr)
            arcTo(Rect(l, b - 2 * cr, l + 2 * cr, b), 180f, -90f, false)
            lineTo(r - cr, b)
            arcTo(Rect(r - 2 * cr, b - 2 * cr, r, b), 90f, -90f, false)
            lineTo(r, 10.4f * u)
        }
        drawPath(
            path = boxPath,
            color = tint,
            style = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
        // Top-right solid notification badge dot
        drawCircle(
            color = tint,
            radius = 2.45f * u,
            center = Offset(18.0f * u, 6.0f * u),
        )
    }
}

@Composable
fun SettingsSocialsLinksSvgIcon(
    tint: Color,
    modifier: Modifier = Modifier.size(22.dp),
) {
    Canvas(modifier = modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val u = size.minDimension / 24f
        val sw = 1.75f * u
        // Clean globe / socials icon matching exact 1.75 stroke weight
        drawCircle(
            color = tint,
            radius = 7.6f * u,
            center = Offset(12f * u, 12f * u),
            style = Stroke(width = sw),
        )
        drawOval(
            color = tint,
            topLeft = Offset(8.5f * u, 4.4f * u),
            size = Size(7.0f * u, 15.2f * u),
            style = Stroke(width = sw),
        )
        drawLine(
            color = tint,
            start = Offset(4.7f * u, 12f * u),
            end = Offset(19.3f * u, 12f * u),
            strokeWidth = sw,
            cap = StrokeCap.Round,
        )
    }
}

@Composable
fun SettingsLegalDocSvgIcon(
    tint: Color,
    modifier: Modifier = Modifier.size(22.dp),
) {
    Canvas(modifier = modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val u = size.minDimension / 24f
        val sw = 1.75f * u
        drawRoundRect(
            color = tint,
            topLeft = Offset(5.6f * u, 4.2f * u),
            size = Size(12.8f * u, 15.6f * u),
            cornerRadius = CornerRadius(2.4f * u, 2.4f * u),
            style = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
        drawLine(
            color = tint,
            start = Offset(8.8f * u, 9.0f * u),
            end = Offset(15.2f * u, 9.0f * u),
            strokeWidth = sw,
            cap = StrokeCap.Round,
        )
        drawLine(
            color = tint,
            start = Offset(8.8f * u, 12.4f * u),
            end = Offset(15.2f * u, 12.4f * u),
            strokeWidth = sw,
            cap = StrokeCap.Round,
        )
        drawLine(
            color = tint,
            start = Offset(8.8f * u, 15.8f * u),
            end = Offset(12.8f * u, 15.8f * u),
            strokeWidth = sw,
            cap = StrokeCap.Round,
        )
    }
}

@Composable
fun SettingsChevronRightSvgIcon(
    tint: Color,
    modifier: Modifier = Modifier.size(16.dp),
) {
    Canvas(modifier = modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val u = size.minDimension / 24f
        val path = Path().apply {
            moveTo(9.2f * u, 5.8f * u)
            lineTo(15.4f * u, 12.0f * u)
            lineTo(9.2f * u, 18.2f * u)
        }
        drawPath(
            path = path,
            color = tint,
            style = Stroke(width = 2.15f * u, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
    }
}

@Composable
fun SettingsBackChevronSvgIcon(
    tint: Color,
    modifier: Modifier = Modifier.size(20.dp),
) {
    Canvas(modifier = modifier) {
        if (size.width <= 0f || size.height <= 0f) return@Canvas
        val u = size.minDimension / 24f
        val path = Path().apply {
            moveTo(15.0f * u, 5.0f * u)
            lineTo(8.0f * u, 12.0f * u)
            lineTo(15.0f * u, 19.0f * u)
        }
        drawPath(
            path = path,
            color = tint,
            style = Stroke(width = 2.3f * u, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
    }
}
