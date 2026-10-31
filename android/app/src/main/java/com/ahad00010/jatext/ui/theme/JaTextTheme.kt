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
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.serialization.Serializable

@Serializable
data class CustomThemeData(
    val appearance: String = "dark", // "light" | "dark"
    val colors: List<String> = listOf("#e8a87c", "#9b6b9e"),
    val angle: Int = 180,
    val intensity: Int = 60,
)

@Serializable
data class JaTextThemeConfig(
    val kind: String = "default", // "default" | "preset" | "custom"
    val defaultId: String = "dark", // "light" | "ash" | "dark" | "onyx" | "system"
    val presetId: String = "sunset",
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
    val accentHex: String,
)

val COLOUR_THEME_PRESETS: List<ColourThemePreset> = listOf(
    ColourThemePreset("mint-meadow", "Mint Apple", "light", listOf("#dff7ea", "#bfead6", "#d8f0ff"), 145, "#1f9d6b"),
    ColourThemePreset("citrus-sherbet", "Citrus Sherbet", "light", listOf("#fff3c4", "#ffd8a8", "#ffc9c9"), 140, "#e66a1f"),
    ColourThemePreset("retro-raincloud", "Retro Raincloud", "light", listOf("#dfe7fd", "#cddafd", "#bee1e6"), 155, "#4f6df5"),
    ColourThemePreset("hanami", "Hanami", "light", listOf("#fde2e4", "#fad2e1", "#e2ece9"), 135, "#d64d86"),
    ColourThemePreset("sunrise", "Sunrise", "light", listOf("#ffecd2", "#fcb69f", "#ffdde1"), 130, "#e35d5b"),
    ColourThemePreset("cotton-candy", "Cotton Candy", "light", listOf("#ffcbf2", "#e2afff", "#c0fdff"), 140, "#a84ad9"),
    ColourThemePreset("lofi-vibes", "LoFi Vibes", "light", listOf("#e8dff5", "#fce1e4", "#fcf4dd"), 150, "#7c5cbf"),
    ColourThemePreset("desert-khaki", "Desert Khaki", "light", listOf("#f4ebd9", "#e6d3b3", "#d8c3a5"), 155, "#9c6b3b"),
    ColourThemePreset("sunset", "Sunset", "dark", listOf("#2b1331", "#5b1d3b", "#8c3b32"), 155, "#f06553"),
    ColourThemePreset("chroma-glow", "Chroma Glow", "dark", listOf("#121638", "#2d1646", "#0f3a47"), 140, "#7c5cff"),
    ColourThemePreset("forest", "Forest", "dark", listOf("#0d1f18", "#163528", "#1e2e1e"), 155, "#34b37c"),
    ColourThemePreset("crimson-moon", "Crimson Moon", "dark", listOf("#1a090d", "#3d0e1a", "#260b1c"), 145, "#e03c5a"),
    ColourThemePreset("midnight-blurple", "Midnight Blurple", "dark", listOf("#0d1026", "#1d1f4e", "#2b1947"), 145, "#6b73ff"),
    ColourThemePreset("mars", "Mars", "dark", listOf("#240d0a", "#4a1b12", "#6b2b18"), 150, "#e8633a"),
    ColourThemePreset("dusk", "Dusk", "dark", listOf("#18192c", "#2d2546", "#462c4c"), 155, "#9b72f2"),
    ColourThemePreset("under-the-sea", "Under The Sea", "dark", listOf("#071e26", "#0d3847", "#114b47"), 150, "#24b8b8"),
    ColourThemePreset("retro-storm", "Retro Storm", "dark", listOf("#161b24", "#232d3f", "#2e2438"), 145, "#5c8df6"),
    ColourThemePreset("neon-nights", "Neon Nights", "dark", listOf("#120924", "#2e0f3d", "#0b2a3d"), 135, "#e040fb"),
    ColourThemePreset("strawberry-lemonade", "Strawberry Lemonade", "dark", listOf("#2e101c", "#471c24", "#3d2e14"), 145, "#f45b7a"),
    ColourThemePreset("aurora", "Aurora", "dark", listOf("#081c24", "#12382e", "#1d1a3d"), 140, "#2dd4a8"),
    ColourThemePreset("sepia", "Sepia", "dark", listOf("#1c1612", "#2e231b", "#3b2c20"), 150, "#c8965a"),
    ColourThemePreset("blurple-twilight", "Blurple Twilight", "dark", listOf("#141630", "#252152", "#38225c"), 150, "#7983f5"),
)

@Immutable
data class JaTextPalette(
    val isDark: Boolean,
    val bgPrimary: Color,
    val bgSecondary: Color,
    val bgTertiary: Color,
    val surface: Color,
    val surfaceElevated: Color,
    val border: Color,
    val borderStrong: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val accent: Color,
    val accentSoft: Color,
    val onAccent: Color,
    val success: Color,
    val danger: Color,
    val warning: Color,
    val rootGradientBrush: Brush?,
)

val LocalJaTextPalette = staticCompositionLocalOf {
    JaTextPalette(
        isDark = true,
        bgPrimary = Color(0xFF0E0F12),
        bgSecondary = Color(0xFF14161B),
        bgTertiary = Color(0xFF1C1F26),
        surface = Color(0xFF22252E),
        surfaceElevated = Color(0xFF282C37),
        border = Color(0x1FFFFFFF),
        borderStrong = Color(0x33FFFFFF),
        textPrimary = Color(0xFFF3F4F6),
        textSecondary = Color(0xFF9CA3AF),
        textTertiary = Color(0xFF6B7280),
        accent = Color(0xFF10B981),
        accentSoft = Color(0x2610B981),
        onAccent = Color.White,
        success = Color(0xFF22C55E),
        danger = Color(0xFFEF4444),
        warning = Color(0xFFF59E0B),
        rootGradientBrush = null,
    )
}

object JaTextThemeManager {

    fun parseHexColor(hex: String, fallback: Color = Color(0xFF10B981)): Color {
        val cleaned = hex.trim().removePrefix("#")
        return try {
            when (cleaned.length) {
                6 -> Color((0xFF000000L or cleaned.toLong(16)).toInt())
                8 -> Color(cleaned.toLong(16).toInt())
                else -> fallback
            }
        } catch (_: Throwable) {
            fallback
        }
    }

    fun colorToHex(color: Color): String {
        val r = (color.red * 255f).toInt().coerceIn(0, 255)
        val g = (color.green * 255f).toInt().coerceIn(0, 255)
        val b = (color.blue * 255f).toInt().coerceIn(0, 255)
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

    fun avatarGradientColors(avatarColor: String?): List<Color> {
        return when (avatarColor?.lowercase()) {
            "blue" -> listOf(Color(0xFF3B82F6), Color(0xFF1D4ED8))
            "green" -> listOf(Color(0xFF10B981), Color(0xFF047857))
            "pink" -> listOf(Color(0xFFEC4899), Color(0xFFBE185D))
            "orange" -> listOf(Color(0xFFF97316), Color(0xFFC2410C))
            "teal" -> listOf(Color(0xFF14B8A6), Color(0xFF0F766E))
            "red" -> listOf(Color(0xFFEF4444), Color(0xFFB91C1C))
            "yellow" -> listOf(Color(0xFFEAB308), Color(0xFFA16207))
            else -> listOf(Color(0xFF8B5CF6), Color(0xFF6D28D9)) // purple default
        }
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
                            colors = c.cols.ifEmpty { listOf("#e8a87c", "#9b6b9e") },
                            angle = c.ang.toInt().coerceIn(0, 360),
                            intensity = c.int.toInt().coerceIn(5, 100),
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

    fun buildPalette(cfg: JaTextThemeConfig, systemDark: Boolean): JaTextPalette {
        return when (cfg.kind) {
            "preset" -> {
                val preset = COLOUR_THEME_PRESETS.firstOrNull { it.id == cfg.presetId }
                    ?: COLOUR_THEME_PRESETS.first { it.id == "sunset" }
                val isDark = preset.mode == "dark"
                val stops = preset.colors.map { parseHexColor(it) }
                val avg = stops.reduce { acc, c -> blendColors(acc, c, 0.5f) }
                val accent = parseHexColor(preset.accentHex)
                val baseBg = if (isDark) Color(0xFF101116) else Color(0xFFF9FAFB)
                val bgPrimary = blendColors(baseBg, avg, if (isDark) 0.58f else 0.52f)
                val bgSecondary = blendColors(if (isDark) Color(0xFF161820) else Color(0xFFFFFFFF), avg, 0.42f)
                val bgTertiary = blendColors(if (isDark) Color(0xFF1E212B) else Color(0xFFF3F4F6), avg, 0.36f)
                val surface = blendColors(if (isDark) Color(0xFF252936) else Color(0xFFFFFFFF), avg, 0.28f)
                JaTextPalette(
                    isDark = isDark,
                    bgPrimary = bgPrimary,
                    bgSecondary = bgSecondary,
                    bgTertiary = bgTertiary,
                    surface = surface,
                    surfaceElevated = blendColors(surface, if (isDark) Color.White else Color.Black, 0.06f),
                    border = if (isDark) Color(0x24FFFFFF) else Color(0x1F000000),
                    borderStrong = if (isDark) Color(0x3DFFFFFF) else Color(0x33000000),
                    textPrimary = if (isDark) Color(0xFFF7F8FA) else Color(0xFF111827),
                    textSecondary = if (isDark) Color(0xFFB8C0CC) else Color(0xFF4B5563),
                    textTertiary = if (isDark) Color(0xFF858E9E) else Color(0xFF6B7280),
                    accent = accent,
                    accentSoft = accent.copy(alpha = 0.16f),
                    onAccent = if (accent.luminance() > 0.62f) Color(0xFF111827) else Color.White,
                    success = Color(0xFF22C55E),
                    danger = Color(0xFFEF4444),
                    warning = Color(0xFFF59E0B),
                    rootGradientBrush = angledLinearBrush(stops, preset.angle),
                )
            }
            "custom" -> {
                val isDark = cfg.custom.appearance != "light"
                val factor = (cfg.custom.intensity.coerceIn(5, 100) / 100f)
                val rawStops = cfg.custom.colors.map { parseHexColor(it) }.ifEmpty {
                    listOf(Color(0xFFE8A87C), Color(0xFF9B6B9E))
                }
                val baseBg = if (isDark) Color(0xFF121318) else Color(0xFFF8F9FB)
                val tintedStops = rawStops.map { blendColors(baseBg, it, factor * 0.72f) }
                val avg = tintedStops.reduce { acc, c -> blendColors(acc, c, 0.5f) }
                val accent = rawStops.first()
                val surface = blendColors(if (isDark) Color(0xFF222530) else Color(0xFFFFFFFF), avg, 0.35f)
                JaTextPalette(
                    isDark = isDark,
                    bgPrimary = avg,
                    bgSecondary = blendColors(if (isDark) Color(0xFF171922) else Color(0xFFFFFFFF), avg, 0.55f),
                    bgTertiary = blendColors(if (isDark) Color(0xFF1F222E) else Color(0xFFF1F5F9), avg, 0.45f),
                    surface = surface,
                    surfaceElevated = blendColors(surface, if (isDark) Color.White else Color.Black, 0.06f),
                    border = if (isDark) Color(0x24FFFFFF) else Color(0x1F000000),
                    borderStrong = if (isDark) Color(0x3DFFFFFF) else Color(0x33000000),
                    textPrimary = if (isDark) Color(0xFFF7F8FA) else Color(0xFF111827),
                    textSecondary = if (isDark) Color(0xFFB8C0CC) else Color(0xFF4B5563),
                    textTertiary = if (isDark) Color(0xFF858E9E) else Color(0xFF6B7280),
                    accent = accent,
                    accentSoft = accent.copy(alpha = 0.18f),
                    onAccent = if (accent.luminance() > 0.62f) Color(0xFF111827) else Color.White,
                    success = Color(0xFF22C55E),
                    danger = Color(0xFFEF4444),
                    warning = Color(0xFFF59E0B),
                    rootGradientBrush = angledLinearBrush(
                        if (tintedStops.size == 1) listOf(tintedStops[0], tintedStops[0]) else tintedStops,
                        cfg.custom.angle
                    ),
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
                        bgSecondary = Color(0xFFF7F8FA),
                        bgTertiary = Color(0xFFEEF0F4),
                        surface = Color(0xFFFFFFFF),
                        surfaceElevated = Color(0xFFF3F4F6),
                        border = Color(0x17000000),
                        borderStrong = Color(0x2B000000),
                        textPrimary = Color(0xFF111827),
                        textSecondary = Color(0xFF4B5563),
                        textTertiary = Color(0xFF9CA3AF),
                        accent = Color(0xFF10B981),
                        accentSoft = Color(0x1F10B981),
                        onAccent = Color.White,
                        success = Color(0xFF16A34A),
                        danger = Color(0xFFDC2626),
                        warning = Color(0xFFD97706),
                        rootGradientBrush = null,
                    )
                    "ash" -> JaTextPalette(
                        isDark = true,
                        bgPrimary = Color(0xFF313338),
                        bgSecondary = Color(0xFF2B2D31),
                        bgTertiary = Color(0xFF232428),
                        surface = Color(0xFF383A40),
                        surfaceElevated = Color(0xFF404249),
                        border = Color(0x1FFFFFFF),
                        borderStrong = Color(0x33FFFFFF),
                        textPrimary = Color(0xFFF2F3F5),
                        textSecondary = Color(0xFFB5BAC1),
                        textTertiary = Color(0xFF80848E),
                        accent = Color(0xFF10B981),
                        accentSoft = Color(0x2610B981),
                        onAccent = Color.White,
                        success = Color(0xFF23A55A),
                        danger = Color(0xFFF23F43),
                        warning = Color(0xFFF0B232),
                        rootGradientBrush = null,
                    )
                    "onyx" -> JaTextPalette(
                        isDark = true,
                        bgPrimary = Color(0xFF000000),
                        bgSecondary = Color(0xFF090A0D),
                        bgTertiary = Color(0xFF111318),
                        surface = Color(0xFF151820),
                        surfaceElevated = Color(0xFF1D202A),
                        border = Color(0x22FFFFFF),
                        borderStrong = Color(0x38FFFFFF),
                        textPrimary = Color(0xFFF9FAFB),
                        textSecondary = Color(0xFF9CA3AF),
                        textTertiary = Color(0xFF6B7280),
                        accent = Color(0xFF10B981),
                        accentSoft = Color(0x2610B981),
                        onAccent = Color.White,
                        success = Color(0xFF22C55E),
                        danger = Color(0xFFEF4444),
                        warning = Color(0xFFF59E0B),
                        rootGradientBrush = null,
                    )
                    else -> JaTextPalette( // "dark" (#1d1d21 web default!)
                        isDark = true,
                        bgPrimary = Color(0xFF16171B),
                        bgSecondary = Color(0xFF1D1E24),
                        bgTertiary = Color(0xFF25272F),
                        surface = Color(0xFF2A2D37),
                        surfaceElevated = Color(0xFF323642),
                        border = Color(0x1FFFFFFF),
                        borderStrong = Color(0x33FFFFFF),
                        textPrimary = Color(0xFFF3F4F6),
                        textSecondary = Color(0xFFA1A8B5),
                        textTertiary = Color(0xFF6E7685),
                        accent = Color(0xFF10B981),
                        accentSoft = Color(0x2610B981),
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
                onPrimary = palette.onAccent,
                background = palette.bgPrimary,
                onBackground = palette.textPrimary,
                surface = palette.surface,
                onSurface = palette.textPrimary,
                surfaceVariant = palette.bgTertiary,
                onSurfaceVariant = palette.textSecondary,
                outline = palette.border,
                error = palette.danger,
            )
        } else {
            lightColorScheme(
                primary = palette.accent,
                onPrimary = palette.onAccent,
                background = palette.bgPrimary,
                onBackground = palette.textPrimary,
                surface = palette.surface,
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
