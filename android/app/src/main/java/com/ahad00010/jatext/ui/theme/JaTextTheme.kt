package com.ahad00010.jatext.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import com.ahad00010.jatext.data.SyncedCustomGradient
import com.ahad00010.jatext.data.SyncedThemePayload
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlinx.serialization.Serializable

@Serializable
data class CustomThemeData(
    val appearance: String = "dark", // "light" | "dark"
    val colors: List<String> = listOf("#efb4aa", "#b6e0d3"),
    val angle: Int = 45,
    val intensity: Int = 60,
)

@Serializable
data class JaTextThemeConfig(
    val kind: String = "default", // "default" | "preset" | "custom"
    val defaultId: String = "dark", // "light" | "ash" | "dark" | "onyx" | "system"
    val presetId: String = "mint-meadow",
    val custom: CustomThemeData = CustomThemeData(),
    val syncAcrossDevices: Boolean = true,
    val updatedAt: Long = 0L,
)

data class ColourThemePreset(
    val id: String,
    val name: String,
    val mode: String, // "light" | "dark"
    val colors: List<String>,
    val angle: Int,
    val intensity: Int,
    val accentHex: String,
)

/**
 * Exact 1:1 Colour Theme presets from src/lib/themeEngine.ts (21 presets + Custom Theme tile = 22 tiles).
 */
val COLOUR_THEME_PRESETS: List<ColourThemePreset> = listOf(
    ColourThemePreset("mint-meadow", "Mint Apple", "light", listOf("#a8d9c7", "#afddad", "#c8e2af"), 180, 68, "#2b9468"),
    ColourThemePreset("citrus-sherbet", "Citrus Sherbet", "light", listOf("#f9d796", "#f7caa0", "#f6bfa8"), 180, 68, "#d96b27"),
    ColourThemePreset("retro-raincloud", "Retro Raincloud", "light", listOf("#a6bbd2", "#bbbcda", "#98bbce"), 135, 66, "#4f6df5"),
    ColourThemePreset("hanami", "Hanami", "light", listOf("#f6d9d2", "#e6ebcb", "#d0ecce"), 45, 70, "#d64d86"),
    ColourThemePreset("sunrise", "Sunrise", "light", listOf("#f7c4b4", "#f9dfc1", "#fceeb5"), 135, 68, "#e35d5b"),
    ColourThemePreset("cotton-candy", "Cotton Candy", "light", listOf("#d2c4f6", "#f5c6ec", "#c4e7f7"), 135, 68, "#9b4de0"),
    ColourThemePreset("lofi-vibes", "LoFi Vibes", "light", listOf("#d6d0f2", "#f2d5df", "#f4ebd0"), 145, 66, "#7c5cbf"),
    ColourThemePreset("desert-khaki", "Desert Khaki", "light", listOf("#e9dec7", "#dcc8a9", "#cfb696"), 155, 66, "#9c6b3b"),
    ColourThemePreset("sunset", "Sunset", "dark", listOf("#3c1d47", "#732645", "#a84438"), 145, 72, "#f06553"),
    ColourThemePreset("chroma-glow", "Chroma Glow", "dark", listOf("#1a1f4e", "#3d1d5c", "#134e5e"), 135, 72, "#9b6cff"),
    ColourThemePreset("forest", "Forest", "dark", listOf("#102920", "#1c4534", "#273d27"), 150, 72, "#34b37c"),
    ColourThemePreset("crimson-moon", "Crimson Moon", "dark", listOf("#240b11", "#4f1222", "#330e26"), 145, 74, "#e03c5a"),
    ColourThemePreset("midnight-blurple", "Midnight Blurple", "dark", listOf("#121636", "#262966", "#38215c"), 145, 74, "#7983f5"),
    ColourThemePreset("mars", "Mars", "dark", listOf("#2e110d", "#5e2217", "#85361e"), 150, 72, "#e8633a"),
    ColourThemePreset("dusk", "Dusk", "dark", listOf("#1f2038", "#3a3059", "#593861"), 155, 72, "#9b72f2"),
    ColourThemePreset("under-the-sea", "Under The Sea", "dark", listOf("#092833", "#11495c", "#165e59"), 150, 72, "#24b8b8"),
    ColourThemePreset("retro-storm", "Retro Storm", "dark", listOf("#1c222e", "#2d3950", "#3b2e47"), 145, 70, "#5c8df6"),
    ColourThemePreset("neon-nights", "Neon Nights", "dark", listOf("#190c30", "#3d1452", "#0f3852"), 135, 74, "#e040fb"),
    ColourThemePreset("strawberry-lemonade", "Strawberry Lemonade", "dark", listOf("#3d1525", "#5c242e", "#4f3b1a"), 145, 72, "#f45b7a"),
    ColourThemePreset("aurora", "Aurora", "dark", listOf("#0b2630", "#174a3d", "#26224f"), 140, 72, "#2dd4a8"),
    ColourThemePreset("sepia", "Sepia", "dark", listOf("#241c17", "#3b2d23", "#4c3929"), 150, 70, "#c8965a"),
    ColourThemePreset("blurple-twilight", "Blurple Twilight", "dark", listOf("#1a1c3d", "#302b69", "#472c75"), 150, 74, "#9b6cff"),
)

/**
 * Exact 1:1 Avatar Color definitions matching src/lib/colors.ts (`AVATAR_COLORS`).
 */
data class AvatarColorSpec(
    val id: String,
    val name: String,
    val note: String? = null,
    val ringColor: Color,
    val softColor: Color,
    val gradientStops: List<Color>,
)

val AVATAR_COLOR_SPECS: List<AvatarColorSpec> = listOf(
    AvatarColorSpec(
        id = "black",
        name = "Default (Black)",
        note = "if.. ur boring",
        ringColor = Color(0xFF43434F),
        softColor = Color(0xFF1C1C22),
        gradientStops = listOf(Color(0xFF1C1C22), Color(0xFF33333F)),
    ),
    AvatarColorSpec(
        id = "yellow",
        name = "Yellow",
        ringColor = Color(0xFFFFC61A),
        softColor = Color(0xFF3A2E05),
        gradientStops = listOf(Color(0xFFFFC61A), Color(0xFFFF9D00)),
    ),
    AvatarColorSpec(
        id = "pink",
        name = "Pink",
        ringColor = Color(0xFFFF5D8F),
        softColor = Color(0xFF3D1222),
        gradientStops = listOf(Color(0xFFFF5D8F), Color(0xFFFF2E63)),
    ),
    AvatarColorSpec(
        id = "purple",
        name = "Purple",
        ringColor = Color(0xFF8B5CF6),
        softColor = Color(0xFF241543),
        gradientStops = listOf(Color(0xFF8B5CF6), Color(0xFF6D28D9)),
    ),
    AvatarColorSpec(
        id = "blue",
        name = "Blue",
        ringColor = Color(0xFF3B82F6),
        softColor = Color(0xFF10233F),
        gradientStops = listOf(Color(0xFF3B82F6), Color(0xFF2563EB)),
    ),
    AvatarColorSpec(
        id = "teal",
        name = "Teal",
        ringColor = Color(0xFF14B8A6),
        softColor = Color(0xFF07332E),
        gradientStops = listOf(Color(0xFF14B8A6), Color(0xFF0D9488)),
    ),
    AvatarColorSpec(
        id = "green",
        name = "Green",
        ringColor = Color(0xFF22C55E),
        softColor = Color(0xFF0C2B16),
        gradientStops = listOf(Color(0xFF22C55E), Color(0xFF16A34A)),
    ),
    AvatarColorSpec(
        id = "orange",
        name = "Orange",
        ringColor = Color(0xFFFB7C1E),
        softColor = Color(0xFF3D1E05),
        gradientStops = listOf(Color(0xFFFB7C1E), Color(0xFFEA580C)),
    ),
    AvatarColorSpec(
        id = "red",
        name = "Red",
        ringColor = Color(0xFFEF4444),
        softColor = Color(0xFF3A1010),
        gradientStops = listOf(Color(0xFFEF4444), Color(0xFFDC2626)),
    ),
)

@Immutable
data class JaTextPalette(
    val isDark: Boolean,
    val bgPrimary: Color,      // var(--bg)
    val bgSecondary: Color,    // var(--panel)
    val bgTertiary: Color,     // var(--panel-2)
    val surface: Color,        // var(--panel-2) / card surface
    val surfaceElevated: Color,
    val border: Color,         // var(--border)
    val borderStrong: Color,
    val textPrimary: Color,    // var(--text)
    val textSecondary: Color,  // var(--muted)
    val textTertiary: Color,
    val accent: Color,         // var(--accent) = #9b6cff default
    val accentDark: Color,     // var(--accent-dark) = #170d2b in dark, #ffffff in light (used on .primary-btn & .tabs.active)
    val accentSoft: Color,
    val onAccent: Color,       // #ffffff on .bubble.mine & .send-btn
    val success: Color,        // var(--ok) = #22c55e
    val danger: Color,         // var(--danger) = #ef4444
    val warning: Color,
    val rootGradientBrush: Brush?,
)

val LocalJaTextPalette = staticCompositionLocalOf {
    JaTextPalette(
        isDark = true,
        bgPrimary = Color(0xFF0B0B10),
        bgSecondary = Color(0xFF14141D),
        bgTertiary = Color(0xFF1B1B26),
        surface = Color(0xFF1B1B26),
        surfaceElevated = Color(0xFF242533),
        border = Color(0xFF262633),
        borderStrong = Color(0xFF38384A),
        textPrimary = Color(0xFFF2F2F7),
        textSecondary = Color(0xFF9A9AAD),
        textTertiary = Color(0xFF6E6E82),
        accent = Color(0xFF9B6CFF),
        accentDark = Color(0xFF170D2B),
        accentSoft = Color(0x2E9B6CFF),
        onAccent = Color.White,
        success = Color(0xFF22C55E),
        danger = Color(0xFFEF4444),
        warning = Color(0xFFF59E0B),
        rootGradientBrush = null,
    )
}

object JaTextThemeManager {

    private const val META_DELIMITER = "|__JT_META__:"

    fun stripProfileMetaFromColorId(rawColor: String?): String {
        if (rawColor.isNullOrBlank()) return "black"
        val idx = rawColor.indexOf(META_DELIMITER)
        val clean = (if (idx >= 0) rawColor.substring(0, idx) else rawColor).trim().lowercase()
        return clean.ifBlank { "black" }
    }

    fun avatarColorSpec(rawColor: String?): AvatarColorSpec {
        val cleanId = stripProfileMetaFromColorId(rawColor)
        return AVATAR_COLOR_SPECS.firstOrNull { it.id == cleanId } ?: AVATAR_COLOR_SPECS[0]
    }

    fun avatarGradientColors(avatarColor: String?): List<Color> =
        avatarColorSpec(avatarColor).gradientStops

    fun parseHexColor(hex: String, fallback: Color = Color(0xFF9B6CFF)): Color {
        val cleaned = hex.trim().removePrefix("#")
        return try {
            when (cleaned.length) {
                3 -> {
                    val expanded = buildString {
                        for (ch in cleaned) {
                            append(ch)
                            append(ch)
                        }
                    }
                    Color((0xFF000000L or expanded.toLong(16)).toInt())
                }
                6 -> Color((0xFF000000L or cleaned.toLong(16)).toInt())
                8 -> Color(cleaned.toLong(16).toInt())
                else -> fallback
            }
        } catch (_: Throwable) {
            fallback
        }
    }

    fun colorToHex(color: Color): String {
        val r = (color.red * 255f).roundToInt().coerceIn(0, 255)
        val g = (color.green * 255f).roundToInt().coerceIn(0, 255)
        val b = (color.blue * 255f).roundToInt().coerceIn(0, 255)
        return "#%02x%02x%02x".format(r, g, b)
    }

    fun blendColors(a: Color, b: Color, t: Float): Color {
        val clamped = t.coerceIn(0f, 1f)
        return Color(
            red = a.red + (b.red - a.red) * clamped,
            green = a.green + (b.green - a.green) * clamped,
            blue = a.blue + (b.blue - a.blue) * clamped,
            alpha = a.alpha + (b.alpha - a.alpha) * clamped,
        )
    }

    fun angledLinearBrush(stops: List<Color>, angleDeg: Int): Brush {
        if (stops.size < 2) {
            val single = stops.firstOrNull() ?: Color(0xFF1D1D21)
            return Brush.linearGradient(listOf(single, single))
        }
        val rad = ((angleDeg - 90) * PI / 180.0)
        val dx = cos(rad).toFloat()
        val dy = sin(rad).toFloat()
        val start = Offset(500f - dx * 500f, 500f - dy * 500f)
        val end = Offset(500f + dx * 500f, 500f + dy * 500f)
        return Brush.linearGradient(colors = stops, start = start, end = end)
    }

    /**
     * Exact HSV accent computation matching computePreviewAccent() in src/lib/themeEngine.ts!
     */
    private fun computePreviewAccentColors(isDark: Boolean, firstStop: Color): Pair<Color, Color> {
        val r = firstStop.red
        val g = firstStop.green
        val b = firstStop.blue
        val cMax = max(r, max(g, b))
        val cMin = min(r, min(g, b))
        val d = cMax - cMin
        var h = 0f
        if (d != 0f) {
            h = when (cMax) {
                r -> ((g - b) / d) % 6f
                g -> ((b - r) / d) + 2f
                else -> ((r - g) / d) + 4f
            } * 60f
            if (h < 0f) h += 360f
        }
        val s = if (cMax == 0f) 0f else d / cMax
        val v = cMax

        val outS: Float
        val outV: Float
        val accentDark: Color
        if (!isDark) {
            outS = (s + 0.28f).coerceIn(0.55f, 0.88f)
            outV = (v * 0.78f).coerceIn(0.45f, 0.76f)
            accentDark = Color.White
        } else {
            outS = (s + 0.14f).coerceIn(0.48f, 0.82f)
            outV = (v + 0.18f).coerceIn(0.72f, 0.95f)
            accentDark = Color(0xFF0F1018)
        }
        val c = outV * outS
        val x = c * (1f - abs(((h / 60f) % 2f) - 1f))
        val m = outV - c
        val (r1, g1, b1) = when {
            h < 60f -> Triple(c, x, 0f)
            h < 120f -> Triple(x, c, 0f)
            h < 180f -> Triple(0f, c, x)
            h < 240f -> Triple(0f, x, c)
            h < 300f -> Triple(x, 0f, c)
            else -> Triple(c, 0f, x)
        }
        return Color(
            red = (r1 + m).coerceIn(0f, 1f),
            green = (g1 + m).coerceIn(0f, 1f),
            blue = (b1 + m).coerceIn(0f, 1f),
            alpha = 1f,
        ) to accentDark
    }

    /**
     * Exact gradient palette computation matching buildCssGradientFromSpec() in src/lib/themeEngine.ts!
     */
    private fun buildGradientPalette(
        isDark: Boolean,
        rawHexColors: List<String>,
        angle: Int,
        intensity: Int,
    ): JaTextPalette {
        val rawStops = rawHexColors.map { parseHexColor(it) }.ifEmpty { listOf(Color(0xFF9B6CFF)) }
        val baseBg = if (!isDark) Color(0xFFFCFDFF) else Color(0xFF0D0E14)
        val strength = (intensity.coerceIn(10, 100) / 100f)
        val factor = if (!isDark) strength * 0.78f else strength * 0.72f
        val blendedStops = rawStops.map { blendColors(baseBg, it, factor) }

        val firstTint = blendedStops.first()
        val midTint = blendedStops[blendedStops.size / 2]
        val avgTint = blendColors(firstTint, midTint, 0.5f)
        val (accent, accentDark) = computePreviewAccentColors(isDark, rawStops.first())

        val panel = if (!isDark) {
            blendColors(Color.White, avgTint, 0.42f).copy(alpha = 0.86f)
        } else {
            blendColors(Color(0xFF101118), avgTint, 0.46f).copy(alpha = 0.84f)
        }
        val panel2 = if (!isDark) {
            blendColors(Color(0xFFF1F3F8), avgTint, 0.55f).copy(alpha = 0.90f)
        } else {
            blendColors(Color(0xFF1A1C26), avgTint, 0.52f).copy(alpha = 0.88f)
        }
        val border = if (!isDark) {
            blendColors(Color(0xFFCCD2DE), avgTint, 0.42f).copy(alpha = 0.78f)
        } else {
            blendColors(Color(0xFF383C4E), avgTint, 0.48f).copy(alpha = 0.72f)
        }

        return JaTextPalette(
            isDark = isDark,
            bgPrimary = avgTint,
            bgSecondary = panel,
            bgTertiary = panel2,
            surface = panel2,
            surfaceElevated = blendColors(panel2, if (isDark) Color.White else Color.Black, 0.07f),
            border = border,
            borderStrong = if (isDark) Color(0x47FFFFFF) else Color(0x36000000),
            textPrimary = if (!isDark) Color(0xFF12151C) else Color(0xFFF4F5FA),
            textSecondary = if (!isDark) Color(0xFF4A5162) else Color(0xFFB4B8CB),
            textTertiary = if (!isDark) Color(0xFF6B7280) else Color(0xFF85899E),
            accent = accent,
            accentDark = accentDark,
            accentSoft = accent.copy(alpha = 0.20f),
            onAccent = Color.White,
            success = Color(0xFF22C55E),
            danger = Color(0xFFEF4444),
            warning = Color(0xFFF59E0B),
            rootGradientBrush = angledLinearBrush(
                if (blendedStops.size == 1) listOf(blendedStops[0], blendedStops[0]) else blendedStops,
                angle,
            ),
        )
    }

    fun applyRemotePayload(current: JaTextThemeConfig, remote: SyncedThemePayload): JaTextThemeConfig {
        return when (remote.k) {
            "p", "preset" -> current.copy(
                kind = "preset",
                presetId = remote.p ?: current.presetId,
                updatedAt = remote.u ?: System.currentTimeMillis(),
            )
            "c", "custom" -> {
                val c = remote.c
                current.copy(
                    kind = "custom",
                    custom = if (c != null) {
                        CustomThemeData(
                            appearance = if (c.a == "l" || c.a == "light") "light" else "dark",
                            colors = c.cols.ifEmpty { listOf("#efb4aa", "#b6e0d3") },
                            angle = c.ang.toInt().coerceIn(0, 360),
                            intensity = c.int.toInt().coerceIn(10, 100),
                        )
                    } else {
                        current.custom
                    },
                    updatedAt = remote.u ?: System.currentTimeMillis(),
                )
            }
            else -> current.copy(
                kind = "default",
                defaultId = remote.d ?: "dark",
                updatedAt = remote.u ?: System.currentTimeMillis(),
            )
        }
    }

    fun toSyncedPayload(cfg: JaTextThemeConfig): SyncedThemePayload {
        val u = cfg.updatedAt.takeIf { it > 0L } ?: System.currentTimeMillis()
        return when (cfg.kind) {
            "preset" -> SyncedThemePayload(k = "p", p = cfg.presetId, u = u)
            "custom" -> SyncedThemePayload(
                k = "c",
                c = SyncedCustomGradient(
                    a = if (cfg.custom.appearance == "light") "l" else "d",
                    cols = cfg.custom.colors.take(5),
                    ang = cfg.custom.angle.toDouble(),
                    int = cfg.custom.intensity.toDouble(),
                ),
                u = u,
            )
            else -> SyncedThemePayload(k = "d", d = cfg.defaultId, u = u)
        }
    }

    /**
     * Exact 1:1 Default + Gradient Palettes matching applyThemeToDocument() in src/lib/themeEngine.ts!
     */
    fun buildPalette(cfg: JaTextThemeConfig, systemDark: Boolean): JaTextPalette {
        return when (cfg.kind) {
            "preset" -> {
                val preset = COLOUR_THEME_PRESETS.firstOrNull { it.id == cfg.presetId }
                    ?: COLOUR_THEME_PRESETS.first()
                buildGradientPalette(
                    isDark = preset.mode == "dark",
                    rawHexColors = preset.colors,
                    angle = preset.angle,
                    intensity = preset.intensity,
                )
            }
            "custom" -> {
                buildGradientPalette(
                    isDark = cfg.custom.appearance != "light",
                    rawHexColors = cfg.custom.colors,
                    angle = cfg.custom.angle,
                    intensity = cfg.custom.intensity,
                )
            }
            else -> {
                val resolvedId = if (cfg.defaultId == "system") {
                    if (systemDark) "dark" else "light"
                } else {
                    cfg.defaultId
                }
                when (resolvedId) {
                    "light" -> JaTextPalette(
                        isDark = false,
                        bgPrimary = Color(0xFFFFFFFF),
                        bgSecondary = Color(0xFFF2F3F5),
                        bgTertiary = Color(0xFFE6E8EC),
                        surface = Color(0xFFE6E8EC),
                        surfaceElevated = Color(0xFFDCE0E6),
                        border = Color(0xFFD5D8E0),
                        borderStrong = Color(0xFFB8BDC9),
                        textPrimary = Color(0xFF111318),
                        textSecondary = Color(0xFF585D6A),
                        textTertiary = Color(0xFF7B8190),
                        accent = Color(0xFF7C4DFF),
                        accentDark = Color.White,
                        accentSoft = Color(0x247C4DFF),
                        onAccent = Color.White,
                        success = Color(0xFF22C55E),
                        danger = Color(0xFFEF4444),
                        warning = Color(0xFFD97706),
                        rootGradientBrush = null,
                    )
                    "ash" -> JaTextPalette(
                        isDark = true,
                        bgPrimary = Color(0xFF323339),
                        bgSecondary = Color(0xFF2B2D31),
                        bgTertiary = Color(0xFF383A40),
                        surface = Color(0xFF383A40),
                        surfaceElevated = Color(0xFF42444B),
                        border = Color(0xFF43464F),
                        borderStrong = Color(0xFF575B66),
                        textPrimary = Color(0xFFF2F3F5),
                        textSecondary = Color(0xFFA9ADB8),
                        textTertiary = Color(0xFF848996),
                        accent = Color(0xFF9B6CFF),
                        accentDark = Color(0xFF170D2B),
                        accentSoft = Color(0x2E9B6CFF),
                        onAccent = Color.White,
                        success = Color(0xFF22C55E),
                        danger = Color(0xFFEF4444),
                        warning = Color(0xFFF59E0B),
                        rootGradientBrush = null,
                    )
                    "onyx" -> JaTextPalette(
                        isDark = true,
                        bgPrimary = Color(0xFF000000),
                        bgSecondary = Color(0xFF07070A),
                        bgTertiary = Color(0xFF121218),
                        surface = Color(0xFF121218),
                        surfaceElevated = Color(0xFF1A1A22),
                        border = Color(0xFF20202A),
                        borderStrong = Color(0xFF323240),
                        textPrimary = Color(0xFFF5F5FA),
                        textSecondary = Color(0xFF8F90A3),
                        textTertiary = Color(0xFF66677A),
                        accent = Color(0xFF9B6CFF),
                        accentDark = Color(0xFF170D2B),
                        accentSoft = Color(0x2E9B6CFF),
                        onAccent = Color.White,
                        success = Color(0xFF22C55E),
                        danger = Color(0xFFEF4444),
                        warning = Color(0xFFF59E0B),
                        rootGradientBrush = null,
                    )
                    else -> JaTextPalette( // Exact Web Dark Theme (#1d1d21 / #151519 / #24252b / #30323a / #9b6cff)
                        isDark = true,
                        bgPrimary = Color(0xFF1D1D21),
                        bgSecondary = Color(0xFF151519),
                        bgTertiary = Color(0xFF24252B),
                        surface = Color(0xFF24252B),
                        surfaceElevated = Color(0xFF2E3038),
                        border = Color(0xFF30323A),
                        borderStrong = Color(0xFF454854),
                        textPrimary = Color(0xFFF2F2F7),
                        textSecondary = Color(0xFF9A9AAD),
                        textTertiary = Color(0xFF6E7082),
                        accent = Color(0xFF9B6CFF),
                        accentDark = Color(0xFF170D2B),
                        accentSoft = Color(0x2E9B6CFF),
                        onAccent = Color.White,
                        success = Color(0xFF22C55E),
                        danger = Color(0xFFEF4444),
                        warning = Color(0xFFF59E0B),
                        rootGradientBrush = null,
                    )
                }
            }
        }
    }
}

@Composable
fun JaTextTheme(
    config: JaTextThemeConfig,
    content: @Composable () -> Unit,
) {
    val systemDark = isSystemInDarkTheme()
    val palette = remember(config, systemDark) {
        JaTextThemeManager.buildPalette(config, systemDark)
    }
    val materialScheme = remember(palette) {
        if (palette.isDark) {
            darkColorScheme(
                primary = palette.accent,
                onPrimary = palette.accentDark,
                background = palette.bgPrimary,
                onBackground = palette.textPrimary,
                surface = palette.bgSecondary,
                onSurface = palette.textPrimary,
                surfaceVariant = palette.bgTertiary,
                onSurfaceVariant = palette.textSecondary,
                outline = palette.border,
                error = palette.danger,
            )
        } else {
            lightColorScheme(
                primary = palette.accent,
                onPrimary = palette.accentDark,
                background = palette.bgPrimary,
                onBackground = palette.textPrimary,
                surface = palette.bgSecondary,
                onSurface = palette.textPrimary,
                surfaceVariant = palette.bgTertiary,
                onSurfaceVariant = palette.textSecondary,
                outline = palette.border,
                error = palette.danger,
            )
        }
    }

    CompositionLocalProvider(LocalJaTextPalette provides palette) {
        MaterialTheme(
            colorScheme = materialScheme,
            content = content,
        )
    }
}
