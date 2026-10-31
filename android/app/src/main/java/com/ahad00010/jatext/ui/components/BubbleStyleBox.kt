package com.ahad00010.jatext.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.ahad00010.jatext.data.TursoApiClient
import com.ahad00010.jatext.ui.theme.JaTextPalette
import com.ahad00010.jatext.ui.theme.JaTextThemeManager
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import java.util.concurrent.ConcurrentHashMap

data class BubbleStyleSpec(
    val id: String,
    val label: String,
    val bgColors: List<Color>,
    val textColor: Color,
    val subTextColor: Color,
    val borderColor: Color,
    val borderWidthDp: Float = 2f,
    val usesLightBackground: Boolean = true,
    val limited: Boolean = false,
    val padTopDp: Float = 0f,
    val padRightDp: Float = 0f,
    val padBottomDp: Float = 0f,
    val padLeftDp: Float = 0f,
)

/**
 * Exact 1:1 port of BUBBLE_STYLES + BUBBLE_SPECS from src/lib/chatCustomization.ts & src/components/BubbleStyleArtwork.tsx.
 */
val ALL_BUBBLE_STYLE_SPECS: List<BubbleStyleSpec> = listOf(
    BubbleStyleSpec("default", "Default", emptyList(), Color.White, Color(0xCCFFFFFF), Color.Transparent, borderWidthDp = 0f, usesLightBackground = false),
    BubbleStyleSpec("whee-sketch", "Whee Sketch", listOf(Color(0xFFD7FCD4), Color(0xFFBEF5B9)), Color(0xFF141C16), Color(0xFF2E4032), Color(0xFF1F2922), 2f, true),
    BubbleStyleSpec("ghost-limited", "Ghost", listOf(Color(0xFFFFFFFF), Color(0xFFFFFFFF)), Color(0xFF171821), Color(0xFF45485E), Color(0xFFD9DCE8), 1.8f, true, limited = true, padRightDp = 14f),
    BubbleStyleSpec("pumpkin-limited", "Pumpkin", listOf(Color(0xFFFF9638), Color(0xFFF56D16)), Color(0xFF140800), Color(0xFF421C04), Color(0xFF9C3400), 2f, true, limited = true, padTopDp = 4f),
    BubbleStyleSpec("spider-limited", "Spider", listOf(Color(0xFF272238), Color(0xFF171422)), Color.White, Color(0xDDFFFFFF), Color(0xFF594F7A), 1.8f, false, limited = true, padRightDp = 10f),
    BubbleStyleSpec("bubbly-otter", "Bubbly Otter", listOf(Color(0xFFE3F6FF), Color(0xFFC8ECFF)), Color(0xFF142636), Color(0xFF2C4D69), Color(0xFF7BC9F5), 2f, true, padLeftDp = 16f),
    BubbleStyleSpec("glam-diva", "Glam Diva", listOf(Color(0xFFFFFFFF), Color(0xFFFFF7FA)), Color(0xFF1B1420), Color(0xFF543C61), Color(0xFFF2CAD8), 1.8f, true, padTopDp = 10f, padLeftDp = 6f, padRightDp = 6f),
    BubbleStyleSpec("chill-croc", "Chill Croc", listOf(Color(0xFF7BE068), Color(0xFF55C447)), Color(0xFF0E1F0B), Color(0xFF1E4018), Color(0xFF1F6319), 2f, true, padTopDp = 8f),
    BubbleStyleSpec("olivia-rodrigo", "Starlight", listOf(Color(0xFFDCD0FF), Color(0xFFC4B0FA)), Color(0xFF1F1438), Color(0xFF462E78), Color(0xFF8C6BE6), 2f, true),
    BubbleStyleSpec("frog-duck", "Frog & Duck", listOf(Color(0xFFFFF8CC), Color(0xFFFFEC9E)), Color(0xFF261F0C), Color(0xFF57471C), Color(0xFFE3B93B), 2f, true, padTopDp = 6f, padRightDp = 10f),
    BubbleStyleSpec("flexing-cat", "Flexing Cat", listOf(Color(0xFFFFF1DE), Color(0xFFFFE2BE)), Color(0xFF291A0C), Color(0xFF5C3B1C), Color(0xFFDF9B52), 2f, true, padLeftDp = 12f, padRightDp = 10f),
    BubbleStyleSpec("capybara", "Capybara", listOf(Color(0xFFF3FAD8), Color(0xFFE1F1B8)), Color(0xFF222914), Color(0xFF47542A), Color(0xFF96B858), 2f, true, padRightDp = 14f),
    BubbleStyleSpec("frog", "Frog", listOf(Color(0xFF7AE05C), Color(0xFF58C43B)), Color(0xFF0E200A), Color(0xFF1F4517), Color(0xFF236912), 2f, true, padTopDp = 8f),
    BubbleStyleSpec("cat-dog", "Cat & Dog", listOf(Color(0xFFFFF5EF), Color(0xFFFFE8DB)), Color(0xFF261914), Color(0xFF593B2F), Color(0xFFF0B698), 2f, true, padTopDp = 6f, padRightDp = 10f),
    BubbleStyleSpec("facepalm", "Facepalm", listOf(Color(0xFFEBF0FF), Color(0xFFD9E3FF)), Color(0xFF171F38), Color(0xFF36477A), Color(0xFF8EA6F2), 2f, true, padTopDp = 8f, padRightDp = 10f),
    BubbleStyleSpec("heart-pepe", "Heart Pepe", listOf(Color(0xFFFFEAF0), Color(0xFFFFD5E3)), Color(0xFF29141D), Color(0xFF5E2E42), Color(0xFFF78FB3), 2f, true, padLeftDp = 14f),
    BubbleStyleSpec("pig-shark", "Pig & Shark", listOf(Color(0xFFE6F5FF), Color(0xFFCDE9FF)), Color(0xFF142638), Color(0xFF2B4F73), Color(0xFF75B8F0), 2f, true, padLeftDp = 14f, padRightDp = 8f),
    BubbleStyleSpec("tongue-bear", "Tongue Bear", listOf(Color(0xFFFFFAFA), Color(0xFFFFF2F5)), Color(0xFF26161B), Color(0xFF593440), Color(0xFFFF8FAB), 2.8f, true, padLeftDp = 16f),
    BubbleStyleSpec("doge", "Doge", listOf(Color(0xFFFFF3CF), Color(0xFFFFE299)), Color(0xFF291C06), Color(0xFF5C4010), Color(0xFFDBA03B), 2f, true, padLeftDp = 14f, padRightDp = 8f),
    BubbleStyleSpec("frog-chick", "Frog & Chick", listOf(Color(0xFFFFFFFF), Color(0xFFE6F6FF)), Color(0xFF142736), Color(0xFF2E5470), Color(0xFF8FD3F4), 2f, true, padTopDp = 10f),
    BubbleStyleSpec("hungry-dog", "Hungry Dog", listOf(Color(0xFFF5A076), Color(0xFFE07C4F)), Color(0xFF1C0A03), Color(0xFF4A1D0B), Color(0xFF6E290F), 2f, true, padTopDp = 8f, padBottomDp = 4f),
    BubbleStyleSpec("dino", "Dino", listOf(Color(0xFFE4FAD9), Color(0xFFC8F2B6)), Color(0xFF162912), Color(0xFF2F5727), Color(0xFF52B83B), 2.2f, true, padLeftDp = 12f, padRightDp = 8f),
    BubbleStyleSpec("dachshund", "Dachshund", listOf(Color(0xFF6B381D), Color(0xFF522812)), Color.White, Color(0xDDFFFFFF), Color(0xFF381A0A), 2f, false, padLeftDp = 16f, padRightDp = 8f),
    BubbleStyleSpec("hungry-frog", "Hungry Frog", listOf(Color(0xFFFFF0F4), Color(0xFFFFE0EA)), Color(0xFF26151C), Color(0xFF593142), Color(0xFFFF85A8), 2.4f, true, padLeftDp = 14f, padRightDp = 8f),
)

fun resolveBubbleStyleSpec(styleId: String?): BubbleStyleSpec {
    if (styleId.isNullOrBlank() || styleId == "default") return ALL_BUBBLE_STYLE_SPECS[0]
    return ALL_BUBBLE_STYLE_SPECS.firstOrNull { it.id == styleId } ?: ALL_BUBBLE_STYLE_SPECS[0]
}

data class ResolvedBubbleColors(
    val textColor: Color,
    val subTextColor: Color,
    val voiceNoteInkColor: Color,
    val isLightSurface: Boolean,
)

fun resolveBubbleInkColors(
    styleId: String?,
    isMine: Boolean,
    palette: JaTextPalette,
): ResolvedBubbleColors {
    val spec = resolveBubbleStyleSpec(styleId)
    if (spec.id != "default") {
        val voiceInk = if (spec.usesLightBackground) Color(0xFF16161D) else Color.White
        return ResolvedBubbleColors(
            textColor = spec.textColor,
            subTextColor = spec.subTextColor,
            voiceNoteInkColor = voiceInk,
            isLightSurface = spec.usesLightBackground,
        )
    }
    return if (isMine) {
        val lightAccent = !palette.isDark && palette.onAccent != Color.White
        ResolvedBubbleColors(
            textColor = palette.onAccent,
            subTextColor = palette.onAccent.copy(alpha = 0.78f),
            voiceNoteInkColor = if (lightAccent) Color(0xFF16161D) else Color.White,
            isLightSurface = lightAccent,
        )
    } else {
        val lightIncoming = !palette.isDark
        ResolvedBubbleColors(
            textColor = palette.textPrimary,
            subTextColor = palette.textSecondary,
            voiceNoteInkColor = if (lightIncoming) Color(0xFF16161D) else Color.White,
            isLightSurface = lightIncoming,
        )
    }
}

/* ==================== Cached SVG Path Helper for 120 FPS Mascot Drawing ==================== */

private val cachedSvgPaths = ConcurrentHashMap<String, Path>()

private fun svgPath(d: String): Path {
    return cachedSvgPaths.getOrPut(d) {
        try {
            PathParser().parsePathString(d).toPath()
        } catch (_: Throwable) {
            Path()
        }
    }
}

private fun DrawScope.drawSvgD(
    d: String,
    scale: Float,
    fill: Color? = null,
    stroke: Color? = null,
    strokeWidth: Float = 1.5f,
) {
    val base = svgPath(d)
    val p = Path().apply { addPath(base) }
    p.transform(Matrix().apply { scale(scale, scale) })
    if (fill != null) {
        drawPath(p, color = fill)
    }
    if (stroke != null) {
        drawPath(
            p,
            color = stroke,
            style = Stroke(width = strokeWidth * scale, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
    }
}

private fun DrawScope.drawSvgEllipse(
    cx: Float,
    cy: Float,
    rx: Float,
    ry: Float,
    scale: Float,
    fill: Color? = null,
    stroke: Color? = null,
    strokeWidth: Float = 1.5f,
) {
    val tl = Offset((cx - rx) * scale, (cy - ry) * scale)
    val sz = Size(rx * 2f * scale, ry * 2f * scale)
    if (fill != null) drawOval(color = fill, topLeft = tl, size = sz)
    if (stroke != null) drawOval(color = stroke, topLeft = tl, size = sz, style = Stroke(width = strokeWidth * scale))
}

private enum class DecoAnchor {
    TOP_LEFT,
    TOP_CENTER,
    TOP_RIGHT,
    LEFT_CENTER,
    RIGHT_CENTER,
    BOTTOM_LEFT,
    BOTTOM_CENTER,
    BOTTOM_RIGHT,
}

private fun DrawScope.withDecoBox(
    anchor: DecoAnchor,
    vw: Float,
    vh: Float,
    dpPx: Float,
    thumbScale: Float,
    block: DrawScope.(Float) -> Unit,
) {
    val s = dpPx * thumbScale
    val boxW = vw * s
    val boxH = vh * s
    val tx: Float
    val ty: Float
    when (anchor) {
        DecoAnchor.TOP_LEFT -> {
            tx = -8f * s
            ty = -10f * s
        }
        DecoAnchor.TOP_CENTER -> {
            tx = (size.width - boxW) / 2f
            ty = -14f * s
        }
        DecoAnchor.TOP_RIGHT -> {
            tx = size.width - boxW + 8f * s
            ty = -10f * s
        }
        DecoAnchor.LEFT_CENTER -> {
            tx = -14f * s
            ty = (size.height - boxH) / 2f
        }
        DecoAnchor.RIGHT_CENTER -> {
            tx = size.width - boxW + 14f * s
            ty = (size.height - boxH) / 2f
        }
        DecoAnchor.BOTTOM_LEFT -> {
            tx = -8f * s
            ty = size.height - boxH + 8f * s
        }
        DecoAnchor.BOTTOM_CENTER -> {
            tx = (size.width - boxW) / 2f
            ty = size.height - boxH + 9f * s
        }
        DecoAnchor.BOTTOM_RIGHT -> {
            tx = size.width - boxW + 8f * s
            ty = size.height - boxH + 8f * s
        }
    }
    withTransform({ translate(left = tx, top = ty) }) {
        block(s)
    }
}

/**
 * Exact 1:1 Canvas vector port of all 23 decorated styles in `src/components/BubbleStyleArtwork.tsx`.
 */
private fun DrawScope.drawBubbleStyleMascots(styleId: String, thumbScale: Float = 1f) {
    val dpPx = 1.dp.toPx()
    when (styleId) {
        "whee-sketch" -> {
            withDecoBox(DecoAnchor.TOP_LEFT, 24f, 18f, dpPx, thumbScale) { s ->
                drawSvgD("M3 14 C5 6, 12 3, 21 4", s, stroke = Color(0xFF1F2922), strokeWidth = 2f)
                drawSvgD("M6 16 L9 12", s, stroke = Color(0xFF5EC96F), strokeWidth = 2f)
            }
            withDecoBox(DecoAnchor.BOTTOM_RIGHT, 22f, 18f, dpPx, thumbScale) { s ->
                drawSvgD("M16 3 C18 9, 15 14, 20 16 L11 14", s, fill = Color(0xFFBEF5B9), stroke = Color(0xFF1F2922), strokeWidth = 2f)
            }
        }
        "ghost-limited" -> {
            withDecoBox(DecoAnchor.TOP_LEFT, 22f, 20f, dpPx, thumbScale) { s ->
                drawSvgD("M9 2 L10.5 6.5 L15 8 L10.5 9.5 L9 14 L7.5 9.5 L3 8 L7.5 6.5 Z", s, fill = Color(0xFFFFD452))
            }
            withDecoBox(DecoAnchor.RIGHT_CENTER, 36f, 40f, dpPx, thumbScale) { s ->
                drawSvgD(
                    "M7 20 C7 9, 27 9, 27 20 L29 33 C26 31, 24 35, 21 33 C18 31, 16 35, 13 33 C10 31, 8 34, 6 32 Z",
                    s,
                    fill = Color.White,
                    stroke = Color(0xFF232533),
                    strokeWidth = 2f,
                )
                drawSvgEllipse(14f, 19f, 2f, 2.8f, s, fill = Color(0xFF1B1C26))
                drawSvgEllipse(21f, 19f, 2f, 2.8f, s, fill = Color(0xFF1B1C26))
                drawSvgEllipse(17.5f, 24f, 2.1f, 2.8f, s, fill = Color(0xFF2B2030))
                drawCircle(Color(0xCCFF9EB5), radius = 2.2f * s, center = Offset(10.8f * s, 22f * s))
                drawCircle(Color(0xCCFF9EB5), radius = 2.2f * s, center = Offset(24.2f * s, 22f * s))
            }
        }
        "pumpkin-limited" -> {
            withDecoBox(DecoAnchor.TOP_CENTER, 38f, 20f, dpPx, thumbScale) { s ->
                drawSvgD("M17 16 C16 9, 20 3, 25 3 C26 6, 22 10, 22 16 Z", s, fill = Color(0xFF2F8F38), stroke = Color(0xFF184D1D), strokeWidth = 1.6f)
                drawSvgD("M17 14 C11 10, 7 12, 9 16 C12 18, 15 17, 17 15 Z", s, fill = Color(0xFF46B84F), stroke = Color(0xFF184D1D), strokeWidth = 1.4f)
            }
            withDecoBox(DecoAnchor.BOTTOM_RIGHT, 28f, 24f, dpPx, thumbScale) { s ->
                drawSvgEllipse(15f, 13f, 9.5f, 9.5f, s, fill = Color(0xFFFF7A1A), stroke = Color(0xFF7C2800), strokeWidth = 1.7f)
                drawSvgD("M11 11 L13.5 8 L14.5 11.5 Z", s, fill = Color(0xFF3A1200))
                drawSvgD("M16.5 11.5 L18 8 L20 11 Z", s, fill = Color(0xFF3A1200))
                drawSvgD("M10.5 14.5 Q15 18.5 19.5 14.5", s, stroke = Color(0xFF3A1200), strokeWidth = 1.8f)
            }
        }
        "spider-limited" -> {
            withDecoBox(DecoAnchor.TOP_LEFT, 34f, 30f, dpPx, thumbScale) { s ->
                drawSvgD("M2 2 L28 6 M2 2 L22 18 M2 2 L8 26", s, stroke = Color(0xBFA69EC4), strokeWidth = 1.2f)
                drawSvgD("M12 4 Q11 10 5 12 M20 5 Q18 14 7 19", s, stroke = Color(0xBFA69EC4), strokeWidth = 1.1f)
            }
            withDecoBox(DecoAnchor.BOTTOM_RIGHT, 34f, 34f, dpPx, thumbScale) { s ->
                drawLine(Color(0xFFCFC8E8), Offset(18f * s, 0f), Offset(18f * s, 15f * s), strokeWidth = 1.2f * s)
                drawSvgD("M9 17 Q5 14 3 17 M9 20 Q4 20 2 23 M27 17 Q31 14 33 17 M27 20 Q32 20 34 23", s, stroke = Color(0xFF111019), strokeWidth = 2f)
                drawSvgEllipse(18f, 19f, 7.5f, 7.5f, s, fill = Color(0xFF14121D), stroke = Color(0xFF7D72A6), strokeWidth = 1.3f)
                drawCircle(Color.White, 2.1f * s, Offset(15.5f * s, 18.5f * s))
                drawCircle(Color.White, 2.1f * s, Offset(20.5f * s, 18.5f * s))
                drawCircle(Color(0xFF111111), 1f * s, Offset(15.8f * s, 18.7f * s))
                drawCircle(Color(0xFF111111), 1f * s, Offset(20.2f * s, 18.7f * s))
            }
        }
        "bubbly-otter" -> {
            withDecoBox(DecoAnchor.LEFT_CENTER, 38f, 42f, dpPx, thumbScale) { s ->
                drawSvgEllipse(10f, 11f, 4f, 4f, s, fill = Color(0xFF9C6B43), stroke = Color(0xFF4D311B), strokeWidth = 1.5f)
                drawSvgEllipse(26f, 11f, 4f, 4f, s, fill = Color(0xFF9C6B43), stroke = Color(0xFF4D311B), strokeWidth = 1.5f)
                drawSvgEllipse(18f, 21f, 12f, 13f, s, fill = Color(0xFFB57F52), stroke = Color(0xFF4D311B), strokeWidth = 1.6f)
                drawSvgEllipse(18f, 20f, 8.5f, 7f, s, fill = Color(0xFFF5DFC6))
                drawCircle(Color(0xFF24160C), 1.6f * s, Offset(14.2f * s, 17.5f * s))
                drawCircle(Color(0xFF24160C), 1.6f * s, Offset(21.8f * s, 17.5f * s))
                drawSvgEllipse(18f, 20f, 2.3f, 1.6f, s, fill = Color(0xFF3B2313))
                drawSvgD("M15.5 22.2 Q18 24 20.5 22.2", s, stroke = Color(0xFF3B2313), strokeWidth = 1.3f)
                drawCircle(Color(0xCCFF9DB0), 1.8f * s, Offset(11.8f * s, 20.5f * s))
                drawCircle(Color(0xCCFF9DB0), 1.8f * s, Offset(24.2f * s, 20.5f * s))
            }
            withDecoBox(DecoAnchor.TOP_RIGHT, 30f, 28f, dpPx, thumbScale) { s ->
                drawSvgEllipse(20f, 10f, 6.5f, 6.5f, s, fill = Color(0xBFFFFFFF), stroke = Color(0xFF7CC7F7), strokeWidth = 1.4f)
                drawCircle(Color.White, 1.8f * s, Offset(18f * s, 8f * s))
                drawSvgEllipse(9f, 17f, 4f, 4f, s, fill = Color(0xBFFFDAF5), stroke = Color(0xFF8AD0FA), strokeWidth = 1.2f)
            }
        }
        "glam-diva" -> {
            withDecoBox(DecoAnchor.TOP_CENTER, 68f, 28f, dpPx, thumbScale) { s ->
                drawSvgD("M9 13 Q17 6 25 13", s, fill = Color(0xFFC084FC), stroke = Color(0xFF1F1424), strokeWidth = 1.6f)
                drawSvgEllipse(17f, 14f, 7f, 4f, s, fill = Color.White, stroke = Color(0xFF1F1424), strokeWidth = 1.5f)
                drawCircle(Color(0xFF231829), 2.6f * s, Offset(18f * s, 14f * s))
                drawCircle(Color.White, 0.9f * s, Offset(19f * s, 13f * s))
                drawSvgD("M9 11 L6 8 M13 8.5 L11 5 M17 8 L17 4.5", s, stroke = Color(0xFF1F1424), strokeWidth = 1.4f)

                drawSvgD("M43 13 Q51 6 59 13", s, fill = Color(0xFFC084FC), stroke = Color(0xFF1F1424), strokeWidth = 1.6f)
                drawSvgEllipse(51f, 14f, 7f, 4f, s, fill = Color.White, stroke = Color(0xFF1F1424), strokeWidth = 1.5f)
                drawCircle(Color(0xFF231829), 2.6f * s, Offset(52f * s, 14f * s))
                drawCircle(Color.White, 0.9f * s, Offset(53f * s, 13f * s))
                drawSvgD("M59 11 L62 8 M55 8.5 L57 5 M51 8 L51 4.5", s, stroke = Color(0xFF1F1424), strokeWidth = 1.4f)

                drawSvgD("M26 22 Q30 18 34 20.5 Q38 18 42 22 Q34 27.5 26 22 Z", s, fill = Color(0xFFE11D48), stroke = Color(0xFF7F1029), strokeWidth = 1.2f)
            }
            withDecoBox(DecoAnchor.BOTTOM_LEFT, 24f, 24f, dpPx, thumbScale) { s ->
                drawSvgD("M5 19 L9 9 M9 20 L13 10 M13 21 L17 12", s, stroke = Color(0xFFF3C6A8), strokeWidth = 3.2f)
                drawCircle(Color(0xFFE11D48), 1.8f * s, Offset(9.5f * s, 7.8f * s))
                drawCircle(Color(0xFFE11D48), 1.8f * s, Offset(13.5f * s, 8.8f * s))
                drawCircle(Color(0xFFE11D48), 1.8f * s, Offset(17.5f * s, 10.8f * s))
            }
            withDecoBox(DecoAnchor.BOTTOM_RIGHT, 24f, 24f, dpPx, thumbScale) { s ->
                drawSvgD("M19 19 L15 9 M15 20 L11 10 M11 21 L7 12", s, stroke = Color(0xFFF3C6A8), strokeWidth = 3.2f)
                drawCircle(Color(0xFFE11D48), 1.8f * s, Offset(14.5f * s, 7.8f * s))
                drawCircle(Color(0xFFE11D48), 1.8f * s, Offset(10.5f * s, 8.8f * s))
                drawCircle(Color(0xFFE11D48), 1.8f * s, Offset(6.5f * s, 10.8f * s))
            }
        }
        "chill-croc" -> {
            withDecoBox(DecoAnchor.TOP_LEFT, 48f, 26f, dpPx, thumbScale) { s ->
                drawSvgD("M12 14 C12 6, 30 6, 30 14 Z", s, fill = Color(0xFFFF7B1C), stroke = Color(0xFF6E2C00), strokeWidth = 1.5f)
                drawSvgD("M4 14 L15 14", s, stroke = Color(0xFFFF7B1C), strokeWidth = 4f)
                drawSvgEllipse(24f, 17f, 4.8f, 4.8f, s, fill = Color.White, stroke = Color(0xFF1F6319), strokeWidth = 1.5f)
                drawSvgEllipse(34f, 17f, 4.8f, 4.8f, s, fill = Color.White, stroke = Color(0xFF1F6319), strokeWidth = 1.5f)
                drawCircle(Color(0xFF162114), 2f * s, Offset(25f * s, 17f * s))
                drawCircle(Color(0xFF162114), 2f * s, Offset(35f * s, 17f * s))
            }
            withDecoBox(DecoAnchor.BOTTOM_RIGHT, 32f, 20f, dpPx, thumbScale) { s ->
                drawSvgD("M4 4 L8 12 L12 4 L16 12 L20 4 Z", s, fill = Color.White, stroke = Color(0xFF1F6319), strokeWidth = 1.2f)
                drawSvgD("M20 10 Q28 11 30 17 Q23 18 18 14 Z", s, fill = Color(0xFF4EC240), stroke = Color(0xFF1F6319), strokeWidth = 1.5f)
            }
        }
        "olivia-rodrigo" -> {
            withDecoBox(DecoAnchor.TOP_LEFT, 34f, 30f, dpPx, thumbScale) { s ->
                val cx = 14f
                val cy = 14f
                drawCircle(Color(0xFF9333EA), 4.5f * s, Offset(cx * s, (cy - 6f) * s))
                drawCircle(Color(0xFFA855F7), 4.5f * s, Offset((cx + 5.7f) * s, (cy - 1.8f) * s))
                drawCircle(Color(0xFF9333EA), 4.5f * s, Offset((cx + 3.5f) * s, (cy + 4.8f) * s))
                drawCircle(Color(0xFFA855F7), 4.5f * s, Offset((cx - 3.5f) * s, (cy + 4.8f) * s))
                drawCircle(Color(0xFF7E22CE), 4.5f * s, Offset((cx - 5.7f) * s, (cy - 1.8f) * s))
                drawCircle(Color(0xFFFDE047), 3.2f * s, Offset(cx * s, cy * s))
                drawSvgD("M27 5 L28 8 L31 9 L28 10 L27 13 L26 10 L23 9 L26 8 Z", s, fill = Color.White)
            }
            withDecoBox(DecoAnchor.BOTTOM_RIGHT, 32f, 28f, dpPx, thumbScale) { s ->
                val cx = 18f
                val cy = 15f
                drawCircle(Color(0xFF7E22CE), 4f * s, Offset(cx * s, (cy - 5.3f) * s))
                drawCircle(Color(0xFFA855F7), 4f * s, Offset((cx + 5f) * s, (cy - 1.6f) * s))
                drawCircle(Color(0xFF9333EA), 4f * s, Offset((cx + 3.1f) * s, (cy + 4.2f) * s))
                drawCircle(Color(0xFFA855F7), 4f * s, Offset((cx - 3.1f) * s, (cy + 4.2f) * s))
                drawCircle(Color(0xFF9333EA), 4f * s, Offset((cx - 5f) * s, (cy - 1.6f) * s))
                drawCircle(Color(0xFFFDE047), 2.8f * s, Offset(cx * s, cy * s))
            }
        }
        "frog-duck" -> {
            withDecoBox(DecoAnchor.TOP_LEFT, 34f, 26f, dpPx, thumbScale) { s ->
                drawSvgEllipse(11f, 10f, 4.2f, 4.2f, s, fill = Color(0xFF6FD649), stroke = Color(0xFF285918), strokeWidth = 1.4f)
                drawSvgEllipse(21f, 10f, 4.2f, 4.2f, s, fill = Color(0xFF6FD649), stroke = Color(0xFF285918), strokeWidth = 1.4f)
                drawSvgEllipse(16f, 16f, 11f, 7.5f, s, fill = Color(0xFF6FD649), stroke = Color(0xFF285918), strokeWidth = 1.4f)
                drawCircle(Color(0xFF182612), 1.6f * s, Offset(11f * s, 10f * s))
                drawCircle(Color(0xFF182612), 1.6f * s, Offset(21f * s, 10f * s))
                drawSvgD("M13 16.5 Q16 19 19 16.5", s, stroke = Color(0xFF285918), strokeWidth = 1.4f)
            }
            withDecoBox(DecoAnchor.BOTTOM_RIGHT, 34f, 30f, dpPx, thumbScale) { s ->
                drawSvgEllipse(18f, 16f, 9.5f, 9.5f, s, fill = Color(0xFFFFE047), stroke = Color(0xFF855A08), strokeWidth = 1.5f)
                drawCircle(Color(0xFF231906), 1.5f * s, Offset(15f * s, 14f * s))
                drawCircle(Color(0xFF231906), 1.5f * s, Offset(21.5f * s, 14f * s))
                drawSvgEllipse(18.2f, 17.8f, 4f, 2.2f, s, fill = Color(0xFFFF841F), stroke = Color(0xFF855A08), strokeWidth = 1.1f)
            }
        }
        "flexing-cat" -> {
            withDecoBox(DecoAnchor.LEFT_CENTER, 32f, 34f, dpPx, thumbScale) { s ->
                drawSvgD(
                    "M25 26 C14 28, 7 22, 9 13 C10 8, 16 7, 18 11 C19 13, 16 16, 15 16 C19 15, 24 17, 25 22 Z",
                    s,
                    fill = Color(0xFFF7A94B),
                    stroke = Color(0xFF6E3D0B),
                    strokeWidth = 1.6f,
                )
            }
            withDecoBox(DecoAnchor.TOP_RIGHT, 34f, 30f, dpPx, thumbScale) { s ->
                drawSvgD("M7 13 L10 4 L16 10 Z", s, fill = Color(0xFFF7A94B), stroke = Color(0xFF6E3D0B), strokeWidth = 1.4f)
                drawSvgD("M27 13 L24 4 L18 10 Z", s, fill = Color(0xFFF7A94B), stroke = Color(0xFF6E3D0B), strokeWidth = 1.4f)
                drawSvgEllipse(17f, 17f, 10.5f, 8.5f, s, fill = Color(0xFFF7A94B), stroke = Color(0xFF6E3D0B), strokeWidth = 1.5f)
                drawCircle(Color(0xFF2B1704), 1.5f * s, Offset(13.5f * s, 16f * s))
                drawCircle(Color(0xFF2B1704), 1.5f * s, Offset(20.5f * s, 16f * s))
                drawSvgD("M14 19.5 Q17 21.8 20.5 19", s, stroke = Color(0xFF2B1704), strokeWidth = 1.4f)
            }
        }
        "capybara" -> {
            withDecoBox(DecoAnchor.RIGHT_CENTER, 38f, 42f, dpPx, thumbScale) { s ->
                drawSvgEllipse(20f, 9f, 4.6f, 4.6f, s, fill = Color(0xFFFF8C1A), stroke = Color(0xFF783900), strokeWidth = 1.3f)
                drawSvgD("M20 4.5 Q23 2 24 4.8", s, fill = Color(0xFF46B038), stroke = Color(0xFF1E5917), strokeWidth = 1f)
                drawSvgEllipse(12f, 15f, 3f, 3f, s, fill = Color(0xFF8F5C38), stroke = Color(0xFF452814), strokeWidth = 1.3f)
                drawSvgEllipse(19f, 23f, 12f, 10.5f, s, fill = Color(0xFFAB7148), stroke = Color(0xFF452814), strokeWidth = 1.6f)
                drawSvgEllipse(24f, 24f, 6.2f, 5.2f, s, fill = Color(0xFF8A5632))
                drawLine(Color(0xFF29160A), Offset(14f * s, 20f * s), Offset(18f * s, 20f * s), strokeWidth = 1.7f * s, cap = StrokeCap.Round)
                drawCircle(Color(0xFF29160A), 1.2f * s, Offset(25.5f * s, 22.5f * s))
                drawSvgD("M23 26 Q25 27.5 27 26", s, stroke = Color(0xFF29160A), strokeWidth = 1.3f)
            }
        }
        "frog" -> {
            withDecoBox(DecoAnchor.TOP_CENTER, 60f, 24f, dpPx, thumbScale) { s ->
                drawSvgEllipse(18f, 12f, 8.5f, 8.5f, s, fill = Color(0xFF62CF44), stroke = Color(0xFF236912), strokeWidth = 1.7f)
                drawSvgEllipse(42f, 12f, 8.5f, 8.5f, s, fill = Color(0xFF62CF44), stroke = Color(0xFF236912), strokeWidth = 1.7f)
                drawCircle(Color.White, 5.5f * s, Offset(18f * s, 12f * s))
                drawCircle(Color.White, 5.5f * s, Offset(42f * s, 12f * s))
                drawCircle(Color(0xFF13210F), 3f * s, Offset(18.5f * s, 12f * s))
                drawCircle(Color(0xFF13210F), 3f * s, Offset(41.5f * s, 12f * s))
                drawCircle(Color.White, 1f * s, Offset(19.5f * s, 10.8f * s))
                drawCircle(Color.White, 1f * s, Offset(42.5f * s, 10.8f * s))
                drawSvgEllipse(9f, 19f, 3.2f, 1.8f, s, fill = Color(0xD9FF94AC))
                drawSvgEllipse(51f, 19f, 3.2f, 1.8f, s, fill = Color(0xD9FF94AC))
            }
        }
        "cat-dog" -> {
            withDecoBox(DecoAnchor.TOP_LEFT, 34f, 28f, dpPx, thumbScale) { s ->
                drawSvgD("M7 14 L9 4 L16 10 Z", s, fill = Color.White, stroke = Color(0xFF5C4338), strokeWidth = 1.4f)
                drawSvgD("M27 14 L25 4 L18 10 Z", s, fill = Color.White, stroke = Color(0xFF5C4338), strokeWidth = 1.4f)
                drawSvgEllipse(17f, 16.5f, 10.5f, 8f, s, fill = Color.White, stroke = Color(0xFF5C4338), strokeWidth = 1.4f)
                drawCircle(Color(0xFF2C1D16), 1.4f * s, Offset(13.5f * s, 16f * s))
                drawCircle(Color(0xFF2C1D16), 1.4f * s, Offset(20.5f * s, 16f * s))
                drawSvgD("M16 18 L18 18 L17 19.5 Z", s, fill = Color(0xFFFF8DA6))
            }
            withDecoBox(DecoAnchor.BOTTOM_RIGHT, 36f, 30f, dpPx, thumbScale) { s ->
                drawSvgEllipse(8f, 17f, 3.5f, 6.5f, s, fill = Color(0xFFD98A3C), stroke = Color(0xFF5C3614), strokeWidth = 1.3f)
                drawSvgEllipse(28f, 17f, 3.5f, 6.5f, s, fill = Color(0xFFD98A3C), stroke = Color(0xFF5C3614), strokeWidth = 1.3f)
                drawSvgEllipse(18f, 16f, 9.5f, 8f, s, fill = Color(0xFFF7B963), stroke = Color(0xFF5C3614), strokeWidth = 1.4f)
                drawCircle(Color(0xFF2C1908), 1.4f * s, Offset(14.8f * s, 15f * s))
                drawCircle(Color(0xFF2C1908), 1.4f * s, Offset(21.2f * s, 15f * s))
                drawSvgEllipse(18f, 17.8f, 2f, 1.4f, s, fill = Color(0xFF3B210B))
                drawSvgEllipse(18f, 21.5f, 2f, 2.6f, s, fill = Color(0xFFFF758F))
            }
        }
        "facepalm" -> {
            withDecoBox(DecoAnchor.TOP_RIGHT, 44f, 32f, dpPx, thumbScale) { s ->
                drawSvgEllipse(21f, 17f, 10.5f, 10.5f, s, fill = Color(0xFFFFE1C9), stroke = Color(0xFF2C2538), strokeWidth = 1.5f)
                drawSvgD("M10 16 C10 6, 32 6, 32 16 C29 11, 14 11, 10 16 Z", s, fill = Color(0xFF252136))
                drawSvgD("M15 24 L22 13 C24 12, 27 14, 25 17 L20 26 Z", s, fill = Color(0xFFFFD2B0), stroke = Color(0xFF2C2538), strokeWidth = 1.3f)
                drawLine(Color(0xFF2C2538), Offset(13f * s, 18f * s), Offset(17f * s, 19f * s), strokeWidth = 1.5f * s, cap = StrokeCap.Round)
                drawSvgD("M36 9 C38 13, 39 16, 36 18 C33 16, 34 13, 36 9 Z", s, fill = Color(0xFF38BDF8), stroke = Color(0xFF0369A1), strokeWidth = 1.1f)
            }
        }
        "heart-pepe" -> {
            withDecoBox(DecoAnchor.LEFT_CENTER, 40f, 38f, dpPx, thumbScale) { s ->
                drawSvgEllipse(13f, 12f, 4.5f, 4.5f, s, fill = Color(0xFF63C74D), stroke = Color(0xFF215217), strokeWidth = 1.4f)
                drawSvgEllipse(22f, 12f, 4.5f, 4.5f, s, fill = Color(0xFF63C74D), stroke = Color(0xFF215217), strokeWidth = 1.4f)
                drawSvgEllipse(18f, 20f, 11f, 9f, s, fill = Color(0xFF63C74D), stroke = Color(0xFF215217), strokeWidth = 1.5f)
                drawCircle(Color.White, 2f * s, Offset(13.5f * s, 12.5f * s))
                drawCircle(Color.White, 2f * s, Offset(21.5f * s, 12.5f * s))
                drawCircle(Color(0xFF111111), 1.1f * s, Offset(14f * s, 12.5f * s))
                drawCircle(Color(0xFF111111), 1.1f * s, Offset(22f * s, 12.5f * s))
                drawSvgD("M12 22 Q18 25 24 22", s, stroke = Color(0xFFC94A38), strokeWidth = 2.2f)
                drawSvgD(
                    "M28 22 C28 19, 33 19, 33 22 C33 19, 38 19, 38 22 C38 26, 33 29, 33 30 C33 29, 28 26, 28 22 Z",
                    s,
                    fill = Color(0xFFEF4444),
                    stroke = Color(0xFF881337),
                    strokeWidth = 1.2f,
                )
            }
            withDecoBox(DecoAnchor.TOP_RIGHT, 24f, 22f, dpPx, thumbScale) { s ->
                drawSvgD("M8 9 C8 6.5, 12 6.5, 12 9 C12 6.5, 16 6.5, 16 9 C16 12.5, 12 15, 12 16 C12 15, 8 12.5, 8 9 Z", s, fill = Color(0xFFFB7185))
            }
        }
        "pig-shark" -> {
            withDecoBox(DecoAnchor.LEFT_CENTER, 38f, 36f, dpPx, thumbScale) { s ->
                drawSvgD("M15 4 L22 10 L13 11 Z", s, fill = Color(0xFF5AA9E6), stroke = Color(0xFF1E4E79), strokeWidth = 1.4f)
                drawSvgEllipse(19f, 20f, 11f, 11f, s, fill = Color(0xFF5AA9E6), stroke = Color(0xFF1E4E79), strokeWidth = 1.5f)
                drawSvgEllipse(20f, 21f, 8f, 7f, s, fill = Color(0xFFFFC2D4))
                drawCircle(Color(0xFF231820), 1.3f * s, Offset(17f * s, 19.5f * s))
                drawCircle(Color(0xFF231820), 1.3f * s, Offset(23f * s, 19.5f * s))
                drawSvgEllipse(20f, 22.5f, 3.2f, 2.1f, s, fill = Color(0xFFFF94B2), stroke = Color(0xFF9E3B58), strokeWidth = 1f)
            }
            withDecoBox(DecoAnchor.BOTTOM_RIGHT, 28f, 26f, dpPx, thumbScale) { s ->
                drawSvgD("M8 18 Q16 16 21 8 Q21 16 26 21 Q17 22 8 18 Z", s, fill = Color(0xFF5AA9E6), stroke = Color(0xFF1E4E79), strokeWidth = 1.4f)
            }
        }
        "tongue-bear" -> {
            withDecoBox(DecoAnchor.LEFT_CENTER, 40f, 40f, dpPx, thumbScale) { s ->
                drawSvgEllipse(10f, 11f, 4f, 4f, s, fill = Color(0xFF9C6644), stroke = Color(0xFF472A17), strokeWidth = 1.4f)
                drawSvgEllipse(25f, 11f, 4f, 4f, s, fill = Color(0xFF9C6644), stroke = Color(0xFF472A17), strokeWidth = 1.4f)
                drawSvgEllipse(17.5f, 20f, 11f, 11f, s, fill = Color(0xFFB0754F), stroke = Color(0xFF472A17), strokeWidth = 1.5f)
                drawSvgEllipse(18f, 22f, 5.5f, 4.5f, s, fill = Color(0xFFF5DCC4))
                drawCircle(Color(0xFF211209), 1.4f * s, Offset(14f * s, 17.5f * s))
                drawCircle(Color(0xFF211209), 1.4f * s, Offset(21f * s, 17.5f * s))
                drawSvgEllipse(18f, 20f, 2f, 1.4f, s, fill = Color(0xFF361D0E))
                drawSvgD("M16 23 C22 23, 31 21, 38 24 C31 29, 21 29, 16 25 Z", s, fill = Color(0xFFFF8FAB), stroke = Color(0xFFAD3959), strokeWidth = 1.3f)
            }
        }
        "doge" -> {
            withDecoBox(DecoAnchor.LEFT_CENTER, 38f, 38f, dpPx, thumbScale) { s ->
                drawSvgD("M8 14 L10 4 L17 10 Z", s, fill = Color(0xFFE6A645), stroke = Color(0xFF66410D), strokeWidth = 1.4f)
                drawSvgD("M29 14 L27 4 L20 10 Z", s, fill = Color(0xFFE6A645), stroke = Color(0xFF66410D), strokeWidth = 1.4f)
                drawSvgEllipse(18.5f, 20f, 11f, 10f, s, fill = Color(0xFFF0B556), stroke = Color(0xFF66410D), strokeWidth = 1.5f)
                drawSvgEllipse(18.5f, 22.5f, 7.5f, 6f, s, fill = Color(0xFFFFF5DF))
                drawSvgEllipse(15f, 18f, 2.1f, 1.5f, s, fill = Color.White, stroke = Color(0xFF2B1B05), strokeWidth = 1f)
                drawSvgEllipse(22f, 18f, 2.1f, 1.5f, s, fill = Color.White, stroke = Color(0xFF2B1B05), strokeWidth = 1f)
                drawCircle(Color(0xFF1C1204), 1f * s, Offset(15.8f * s, 18f * s))
                drawCircle(Color(0xFF1C1204), 1f * s, Offset(22.8f * s, 18f * s))
                drawSvgEllipse(18.5f, 21f, 2f, 1.4f, s, fill = Color(0xFF241706))
                drawSvgD("M15.5 24 Q18.5 25.8 22 23.5", s, stroke = Color(0xFF241706), strokeWidth = 1.3f)
            }
            withDecoBox(DecoAnchor.BOTTOM_RIGHT, 24f, 24f, dpPx, thumbScale) { s ->
                drawSvgD("M10 12 L10 6 C10 4, 14 4, 14 7 L14 11 L18 11 C20 11, 20 18, 16 18 L10 18 Z", s, fill = Color(0xFFF0B556), stroke = Color(0xFF66410D), strokeWidth = 1.3f)
            }
        }
        "frog-chick" -> {
            withDecoBox(DecoAnchor.TOP_CENTER, 66f, 28f, dpPx, thumbScale) { s ->
                drawSvgEllipse(14f, 20f, 6f, 6f, s, fill = Color.White, stroke = Color(0xFFBAE6FD), strokeWidth = 1.2f)
                drawSvgEllipse(24f, 19f, 7f, 7f, s, fill = Color.White, stroke = Color(0xFFBAE6FD), strokeWidth = 1.2f)
                drawSvgEllipse(42f, 19f, 7f, 7f, s, fill = Color.White, stroke = Color(0xFFBAE6FD), strokeWidth = 1.2f)
                drawSvgEllipse(52f, 20f, 6f, 6f, s, fill = Color.White, stroke = Color(0xFFBAE6FD), strokeWidth = 1.2f)
                drawSvgEllipse(25f, 14f, 7.5f, 6f, s, fill = Color(0xFF67D149), stroke = Color(0xFF235C14), strokeWidth = 1.3f)
                drawCircle(Color(0xFF162912), 1.3f * s, Offset(22.5f * s, 12f * s))
                drawCircle(Color(0xFF162912), 1.3f * s, Offset(27.5f * s, 12f * s))
                drawSvgEllipse(41f, 14f, 6f, 6f, s, fill = Color(0xFFFFE14D), stroke = Color(0xFF855A08), strokeWidth = 1.3f)
                drawCircle(Color(0xFF211704), 1.1f * s, Offset(39f * s, 13f * s))
                drawCircle(Color(0xFF211704), 1.1f * s, Offset(43f * s, 13f * s))
                drawSvgD("M40 15 L42 15 L41 17 Z", s, fill = Color(0xFFFF7B1C))
            }
        }
        "hungry-dog" -> {
            withDecoBox(DecoAnchor.TOP_CENTER, 56f, 24f, dpPx, thumbScale) { s ->
                drawSvgEllipse(10f, 14f, 4.5f, 7f, s, fill = Color(0xFF8C3718), stroke = Color(0xFF4D1A07), strokeWidth = 1.3f)
                drawSvgEllipse(46f, 14f, 4.5f, 7f, s, fill = Color(0xFF8C3718), stroke = Color(0xFF4D1A07), strokeWidth = 1.3f)
                drawSvgEllipse(21f, 12f, 4.2f, 4.2f, s, fill = Color.White, stroke = Color(0xFF4D1A07), strokeWidth = 1.3f)
                drawSvgEllipse(35f, 12f, 4.2f, 4.2f, s, fill = Color.White, stroke = Color(0xFF4D1A07), strokeWidth = 1.3f)
                drawCircle(Color(0xFF1F0D05), 2f * s, Offset(21.5f * s, 12f * s))
                drawCircle(Color(0xFF1F0D05), 2f * s, Offset(34.5f * s, 12f * s))
                drawSvgEllipse(28f, 16f, 3.4f, 2.3f, s, fill = Color(0xFF2B1106))
            }
            withDecoBox(DecoAnchor.BOTTOM_CENTER, 46f, 16f, dpPx, thumbScale) { s ->
                drawSvgD("M8 3 L12 9 L16 3 L20 8 L26 8 L30 3 L34 9 L38 3 Z", s, fill = Color.White, stroke = Color(0xFF5C210B), strokeWidth = 1f)
                drawSvgEllipse(23f, 10f, 6f, 3.5f, s, fill = Color(0xFFFF85A1))
            }
        }
        "dino" -> {
            withDecoBox(DecoAnchor.TOP_LEFT, 38f, 30f, dpPx, thumbScale) { s ->
                drawSvgD("M6 12 L10 5 L14 10 L18 4 L22 10 Z", s, fill = Color(0xFF3B9427))
                drawSvgD("M6 22 C6 10, 26 8, 30 16 L20 20 L27 24 L10 25 Z", s, fill = Color(0xFF5EC947), stroke = Color(0xFF205714), strokeWidth = 1.5f)
                drawCircle(Color.White, 1.8f * s, Offset(18f * s, 14f * s))
                drawCircle(Color(0xFF12210E), 1f * s, Offset(18.5f * s, 14f * s))
            }
            withDecoBox(DecoAnchor.BOTTOM_RIGHT, 28f, 24f, dpPx, thumbScale) { s ->
                drawSvgD("M6 16 Q17 17 24 8 Q23 19 10 21 Z", s, fill = Color(0xFF5EC947), stroke = Color(0xFF205714), strokeWidth = 1.5f)
            }
        }
        "dachshund" -> {
            withDecoBox(DecoAnchor.LEFT_CENTER, 38f, 36f, dpPx, thumbScale) { s ->
                drawSvgEllipse(22f, 19f, 10f, 9f, s, fill = Color(0xFF8F4C29), stroke = Color(0xFF3D1D0C), strokeWidth = 1.5f)
                drawSvgEllipse(27f, 21f, 4.8f, 8f, s, fill = Color(0xFF592B13), stroke = Color(0xFF3D1D0C), strokeWidth = 1.3f)
                drawSvgD("M20 15 C11 15, 4 17, 5 22 C6 25, 14 25, 20 23 Z", s, fill = Color(0xFF8F4C29), stroke = Color(0xFF3D1D0C), strokeWidth = 1.5f)
                drawCircle(Color(0xFF1F0E05), 2.2f * s, Offset(5.5f * s, 19.5f * s))
                drawCircle(Color(0xFF1F0E05), 1.6f * s, Offset(18f * s, 16.5f * s))
                drawCircle(Color(0xFFE09F67), 1.3f * s, Offset(19f * s, 14f * s))
            }
            withDecoBox(DecoAnchor.BOTTOM_RIGHT, 28f, 26f, dpPx, thumbScale) { s ->
                drawSvgD("M9 17 Q19 15 24 6", s, stroke = Color(0xFF8F4C29), strokeWidth = 4.2f)
                drawSvgEllipse(8f, 21f, 4f, 2.6f, s, fill = Color(0xFFD9955B), stroke = Color(0xFF3D1D0C), strokeWidth = 1.2f)
            }
        }
        "hungry-frog" -> {
            withDecoBox(DecoAnchor.BOTTOM_LEFT, 36f, 32f, dpPx, thumbScale) { s ->
                drawSvgEllipse(11f, 12f, 4f, 4f, s, fill = Color(0xFF63CF48), stroke = Color(0xFF215914), strokeWidth = 1.3f)
                drawSvgEllipse(20f, 12f, 4f, 4f, s, fill = Color(0xFF63CF48), stroke = Color(0xFF215914), strokeWidth = 1.3f)
                drawSvgEllipse(16f, 19f, 10.5f, 8f, s, fill = Color(0xFF63CF48), stroke = Color(0xFF215914), strokeWidth = 1.5f)
                drawCircle(Color(0xFF13240E), 1.4f * s, Offset(11f * s, 12f * s))
                drawCircle(Color(0xFF13240E), 1.4f * s, Offset(20f * s, 12f * s))
                drawSvgD("M18 20 Q27 17 35 10", s, stroke = Color(0xFFFF7096), strokeWidth = 3.5f)
            }
            withDecoBox(DecoAnchor.TOP_RIGHT, 28f, 26f, dpPx, thumbScale) { s ->
                drawSvgEllipse(11f, 11f, 4.5f, 3.2f, s, fill = Color(0xFF60A5FA), stroke = Color(0xFF1E3A8A), strokeWidth = 1.1f)
                drawSvgEllipse(18f, 14f, 4.5f, 3.2f, s, fill = Color(0xFFFDE047), stroke = Color(0xFF854D0E), strokeWidth = 1.1f)
                drawLine(Color(0xFF1E293B), Offset(12f * s, 16f * s), Offset(17f * s, 9f * s), strokeWidth = 1.6f * s, cap = StrokeCap.Round)
            }
        }
    }
}

/**
 * Miniature 1:1 preview pill shown inside the 3-column "Suggested" Bubble Style sheet (`BubblePreviewThumb` in `BubbleStyleArtwork.tsx`).
 */
@Composable
fun BubblePreviewThumbUi(
    styleId: String,
    palette: JaTextPalette,
    modifier: Modifier = Modifier,
) {
    val spec = resolveBubbleStyleSpec(styleId)
    val lineColor = if (spec.id == "default") {
        palette.onAccent.copy(alpha = 0.72f)
    } else if (spec.usesLightBackground) {
        Color(0x47191C26)
    } else {
        Color(0xB8FFFFFF)
    }

    Box(
        modifier = modifier
            .size(width = 86.dp, height = 52.dp)
            .padding(horizontal = 8.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .drawWithContent {
                    val r = 16.dp.toPx()
                    if (spec.id == "default") {
                        drawRoundRect(
                            color = palette.accent,
                            cornerRadius = CornerRadius(r, r),
                        )
                    } else {
                        drawRoundRect(
                            brush = Brush.linearGradient(spec.bgColors),
                            cornerRadius = CornerRadius(r, r),
                        )
                        drawRoundRect(
                            color = spec.borderColor,
                            cornerRadius = CornerRadius(r, r),
                            style = Stroke(width = spec.borderWidthDp.dp.toPx()),
                        )
                    }
                    drawContent()
                    if (spec.id != "default") {
                        drawBubbleStyleMascots(spec.id, thumbScale = 0.72f)
                    }
                }
                .padding(horizontal = 12.dp, vertical = 9.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(
                    modifier = Modifier
                        .width(38.dp)
                        .height(4.5.dp)
                        .clip(RoundedCornerShape(99.dp))
                        .background(lineColor)
                )
                Box(
                    modifier = Modifier
                        .width(24.dp)
                        .height(4.5.dp)
                        .clip(RoundedCornerShape(99.dp))
                        .background(lineColor.copy(alpha = 0.75f))
                )
            }
        }
    }
}

/**
 * Live 1:1 Message Bubble Container (`DecoratedMessageBubble` from `BubbleStyleArtwork.tsx`).
 * Draws rounded bubble body + border + unclipped overhanging mascots so mascots sit right on the bubble edge!
 */
@Composable
fun StyledMessageBubbleContainer(
    styleId: String?,
    isMine: Boolean,
    palette: JaTextPalette,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.(ResolvedBubbleColors) -> Unit,
) {
    val spec = resolveBubbleStyleSpec(styleId)
    val ink = resolveBubbleInkColors(styleId, isMine, palette)
    val decorated = spec.id != "default" && spec.bgColors.size >= 2

    val outerMarginMod = if (decorated) {
        Modifier.padding(
            top = 8.dp,
            bottom = 6.dp,
            start = if (isMine) 4.dp else 8.dp,
            end = if (isMine) 8.dp else 4.dp,
        )
    } else {
        Modifier
    }

    val shape = if (decorated) {
        RoundedCornerShape(21.dp)
    } else {
        RoundedCornerShape(
            topStart = 20.dp,
            topEnd = 20.dp,
            bottomStart = if (isMine) 20.dp else 6.dp,
            bottomEnd = if (isMine) 6.dp else 20.dp,
        )
    }

    Box(modifier = outerMarginMod.then(modifier)) {
        if (decorated) {
            Box(
                modifier = Modifier
                    .drawWithContent {
                        val cr = 21.dp.toPx()
                        // Subtle drop shadow
                        drawRoundRect(
                            color = Color(0x28000000),
                            topLeft = Offset(0f, 2.dp.toPx()),
                            size = this.size,
                            cornerRadius = CornerRadius(cr, cr),
                        )
                        drawRoundRect(
                            brush = Brush.linearGradient(spec.bgColors),
                            cornerRadius = CornerRadius(cr, cr),
                        )
                        drawRoundRect(
                            color = spec.borderColor,
                            cornerRadius = CornerRadius(cr, cr),
                            style = Stroke(width = spec.borderWidthDp.dp.toPx()),
                        )
                        drawContent()
                        drawBubbleStyleMascots(spec.id, thumbScale = 1f)
                    }
                    .padding(
                        start = (14f + spec.padLeftDp).dp,
                        end = (14f + spec.padRightDp).dp,
                        top = (10f + spec.padTopDp).dp,
                        bottom = (10f + spec.padBottomDp).dp,
                    )
            ) {
                content(ink)
            }
        } else {
            val stdMod = if (isMine) {
                Modifier.background(palette.accent, shape)
            } else {
                Modifier
                    .background(palette.bgTertiary, shape)
                    .border(1.dp, palette.border, shape)
            }
            Box(
                modifier = Modifier
                    .clip(shape)
                    .then(stdMod)
                    .padding(horizontal = 14.dp, vertical = 10.dp)
            ) {
                content(ink)
            }
        }
    }
}

/* ==================== 1:1 Web Chat Wallpaper Presets (`src/lib/chatCustomization.ts`) ==================== */

data class WebWallpaperPresetSpec(
    val id: String,
    val label: String,
    val url: String,
)

val WEB_WALLPAPER_PRESETS: List<WebWallpaperPresetSpec> = listOf(
    WebWallpaperPresetSpec(
        id = "wp-1",
        label = "Starry Night",
        url = "https://i.pinimg.com/236x/74/da/f3/74daf3ae818919526e814777c181bfc1.jpg",
    ),
    WebWallpaperPresetSpec(
        id = "wp-2",
        label = "Soft Clouds",
        url = "https://cdn.wallpapersafari.com/95/23/Nbysph.jpg",
    ),
    WebWallpaperPresetSpec(
        id = "wp-3",
        label = "Pastel Sky",
        url = "https://i.pinimg.com/236x/64/3a/b3/643ab3286afd2991f261061ff251dc10.jpg",
    ),
    WebWallpaperPresetSpec(
        id = "wp-4",
        label = "Classic Dark",
        url = "https://wallpapers.com/images/hd/whatsapp-chat-background-mn1uthhgygqpr7r2.jpg",
    ),
    WebWallpaperPresetSpec(
        id = "wp-5",
        label = "Stars & Clouds",
        url = "https://wallpapers.com/images/hd/whatsapp-chat-stars-and-clouds-73osu5fosbnwrd3z.jpg",
    ),
    WebWallpaperPresetSpec(
        id = "wp-6",
        label = "Midnight Glow",
        url = "https://wallpaperaccess.com/full/1288076.jpg",
    ),
)

/**
 * Exact 1:1 recreation of src/components/Avatar.tsx:
 * - Outer ring (`box-shadow: 0 0 0 ${ringWidth}px ${color.hex}`) rendered cleanly outside the circle
 * - 135deg gradient background behind the picture (`color.gradient`)
 * - Single 900-weight initial letter (`size * 0.42`) when no avatarUrl is set
 * - Exact `.activity-dot` (`#22c55e` online, `#f59e0b` away/idle, `#ef4444` dnd, `#626272` offline)
 */
@Composable
fun JaAvatar(
    avatarUrl: String?,
    displayName: String,
    avatarColor: String?,
    size: Dp = 44.dp,
    ringWidth: Dp = 3.dp,
    presenceStatus: String? = null,
    statusBorderColor: Color = Color(0xFF151519),
    modifier: Modifier = Modifier,
) {
    val initial = displayName.trim().take(1).uppercase().ifBlank { "?" }
    val colorSpec = JaTextThemeManager.avatarColorSpec(avatarColor)
    val resolvedUrl = remember(avatarUrl) {
        avatarUrl?.takeIf { it.isNotBlank() }?.let { TursoApiClient.resolveAbsoluteMediaUrl(it) }
    }

    Box(
        modifier = modifier
            .padding(ringWidth)
            .size(size)
            .drawBehind {
                if (ringWidth > 0.dp) {
                    drawCircle(
                        color = colorSpec.ringColor,
                        radius = (this.size.minDimension / 2f) + ringWidth.toPx(),
                    )
                }
            }
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        colors = colorSpec.gradientStops,
                        start = Offset.Zero,
                        end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
                    )
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = initial,
                color = Color.White,
                fontWeight = FontWeight.Black,
                fontSize = (size.value * 0.42f).sp,
            )
            if (!resolvedUrl.isNullOrBlank()) {
                AsyncImage(
                    model = resolvedUrl,
                    contentDescription = displayName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(CircleShape),
                )
            }
        }
        if (presenceStatus != null) {
            val dotColor = when (presenceStatus.lowercase()) {
                "online" -> Color(0xFF22C55E)
                "away", "idle" -> Color(0xFFF59E0B)
                "dnd" -> Color(0xFFEF4444)
                else -> Color(0xFF626272)
            }
            val dotSize = (size.value * 0.31f).coerceIn(11f, 15f).dp
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = 1.dp, y = 1.dp)
                    .size(dotSize)
                    .clip(CircleShape)
                    .background(dotColor)
                    .border(2.dp, statusBorderColor, CircleShape)
            )
        }
    }
}

/**
 * Exact 1:1 Group Avatar (`group-avatar` / `group-avatar-fallback` from `GroupChatView.tsx` & `Sidebar.tsx`).
 */
@Composable
fun JaGroupAvatar(
    avatarUrl: String?,
    name: String,
    size: Dp = 44.dp,
    ringWidth: Dp = 2.dp,
    palette: JaTextPalette = LocalJaTextPalette.current,
    modifier: Modifier = Modifier,
) {
    val resolvedUrl = remember(avatarUrl) {
        avatarUrl?.takeIf { it.isNotBlank() }?.let { TursoApiClient.resolveAbsoluteMediaUrl(it) }
    }
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(palette.accentSoft)
            .border(ringWidth, palette.accent.copy(alpha = 0.55f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (!resolvedUrl.isNullOrBlank()) {
            AsyncImage(
                model = resolvedUrl,
                contentDescription = name,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape),
            )
        } else {
            Icon(
                imageVector = Icons.Rounded.Groups,
                contentDescription = name,
                tint = palette.accent,
                modifier = Modifier.size(size * 0.52f),
            )
        }
    }
}
