package com.ahad00010.jatext.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.ahad00010.jatext.ui.theme.JaTextPalette
import com.ahad00010.jatext.ui.theme.JaTextThemeManager

data class BubbleStyleSpec(
    val id: String,
    val label: String,
    val bgColors: List<Color>,
    val textColor: Color,
    val subTextColor: Color,
    val borderColor: Color,
    val usesLightBackground: Boolean,
    val accentDecorColor: Color,
)

val ALL_BUBBLE_STYLE_SPECS: List<BubbleStyleSpec> = listOf(
    BubbleStyleSpec("default", "Default", emptyList(), Color.White, Color(0xCCFFFFFF), Color.Transparent, usesLightBackground = false, accentDecorColor = Color.Transparent),
    BubbleStyleSpec("whee-sketch", "Whee Sketch", listOf(Color(0xFFE0F2FE), Color(0xFFBAE6FD)), Color(0xFF0C2233), Color(0xFF1E4766), Color(0xFF7DD3FC), usesLightBackground = true, accentDecorColor = Color(0x5538BDF8)),
    BubbleStyleSpec("ghost-limited", "Ghost", listOf(Color(0xFFF3E8FF), Color(0xFFE9D5FF)), Color(0xFF1F1235), Color(0xFF442B6E), Color(0xFFC084FC), usesLightBackground = true, accentDecorColor = Color(0x447C3AED)),
    BubbleStyleSpec("pumpkin-limited", "Pumpkin", listOf(Color(0xFFFFEDD5), Color(0xFFFDBA74)), Color(0xFF281205), Color(0xFF57290D), Color(0xFFFB923C), usesLightBackground = true, accentDecorColor = Color(0x33EA580C)),
    BubbleStyleSpec("spider-limited", "Spider", listOf(Color(0xFFD62839), Color(0xFF1D3557)), Color.White, Color(0xDDFFFFFF), Color(0xFFE63946), usesLightBackground = false, accentDecorColor = Color(0x44FFFFFF)),
    BubbleStyleSpec("bubbly-otter", "Bubbly Otter", listOf(Color(0xFFCCFBF1), Color(0xFF99F6E4)), Color(0xFF0A2622), Color(0xFF195249), Color(0xFF2DD4BF), usesLightBackground = true, accentDecorColor = Color(0x440D9488)),
    BubbleStyleSpec("glam-diva", "Glam Diva", listOf(Color(0xFFFFD6E4), Color(0xFFFFB8D0)), Color(0xFF2B0B17), Color(0xFF5C1E35), Color(0xFFFF8FB6), usesLightBackground = true, accentDecorColor = Color(0x44E11D48)),
    BubbleStyleSpec("chill-croc", "Chill Croc", listOf(Color(0xFFDCFCE7), Color(0xFFBBF7D0)), Color(0xFF0D2617), Color(0xFF1E5232), Color(0xFF4ADE80), usesLightBackground = true, accentDecorColor = Color(0x4416A34A)),
    BubbleStyleSpec("olivia-rodrigo", "Starlight", listOf(Color(0xFFEDE9FE), Color(0xFFDDD6FE)), Color(0xFF1E1038), Color(0xFF4C2882), Color(0xFFA78BFA), usesLightBackground = true, accentDecorColor = Color(0x446D28D9)),
    BubbleStyleSpec("frog-duck", "Frog & Duck", listOf(Color(0xFFFEF9C3), Color(0xFFD9F99D)), Color(0xFF1A2605), Color(0xFF3F5410), Color(0xFFA3E635), usesLightBackground = true, accentDecorColor = Color(0x4465A30D)),
    BubbleStyleSpec("flexing-cat", "Flexing Cat", listOf(Color(0xFFFAE8FF), Color(0xFFF5D0FE)), Color(0xFF290F30), Color(0xFF542361), Color(0xFFE879F9), usesLightBackground = true, accentDecorColor = Color(0x44C026D3)),
    BubbleStyleSpec("capybara", "Capybara", listOf(Color(0xFFF5ECE1), Color(0xFFE7D3BC)), Color(0xFF26190D), Color(0xFF52381F), Color(0xFFD2B48C), usesLightBackground = true, accentDecorColor = Color(0x33854D0E)),
    BubbleStyleSpec("frog", "Frog", listOf(Color(0xFFC8F7B8), Color(0xFFA3EA8E)), Color(0xFF0E240B), Color(0xFF284D22), Color(0xFF7CD965), usesLightBackground = true, accentDecorColor = Color(0x4439A828)),
    BubbleStyleSpec("cat-dog", "Cat & Dog", listOf(Color(0xFFFFF1F2), Color(0xFFFEF3C7)), Color(0xFF241218), Color(0xFF522A37), Color(0xFFFDA4AF), usesLightBackground = true, accentDecorColor = Color(0x44F43F5E)),
    BubbleStyleSpec("facepalm", "Facepalm", listOf(Color(0xFFE0E7FF), Color(0xFFC7D2FE)), Color(0xFF131936), Color(0xFF2D3A73), Color(0xFF818CF8), usesLightBackground = true, accentDecorColor = Color(0x444F46E5)),
    BubbleStyleSpec("heart-pepe", "Heart", listOf(Color(0xFFFFE4E6), Color(0xFFFECDD3)), Color(0xFF2B0C14), Color(0xFF5C1E2E), Color(0xFFFB7185), usesLightBackground = true, accentDecorColor = Color(0x44E11D48)),
    BubbleStyleSpec("pig-shark", "Pig & Shark", listOf(Color(0xFFFFE4EC), Color(0xFFBAE6FD)), Color(0xFF172030), Color(0xFF334766), Color(0xFFF9A8C0), usesLightBackground = true, accentDecorColor = Color(0x44EC4899)),
    BubbleStyleSpec("tongue-bear", "Bear", listOf(Color(0xFFFEF3C7), Color(0xFFFDE68A)), Color(0xFF291C06), Color(0xFF573E12), Color(0xFFFBBF24), usesLightBackground = true, accentDecorColor = Color(0x44D97706)),
    BubbleStyleSpec("doge", "Doge", listOf(Color(0xFFFEF08A), Color(0xFFFACC15)), Color(0xFF261B04), Color(0xFF523B0A), Color(0xFFEAB308), usesLightBackground = true, accentDecorColor = Color(0x44CA8A04)),
    BubbleStyleSpec("frog-chick", "Frog & Chick", listOf(Color(0xFFECFCCB), Color(0xFFFEF08A)), Color(0xFF1F2606), Color(0xFF475410), Color(0xFFBEF264), usesLightBackground = true, accentDecorColor = Color(0x4484CC16)),
    BubbleStyleSpec("hungry-dog", "Hungry Dog", listOf(Color(0xFFFFE4C4), Color(0xFFFEC89A)), Color(0xFF2B1406), Color(0xFF5C2D10), Color(0xFFF97316), usesLightBackground = true, accentDecorColor = Color(0x33EA580C)),
    BubbleStyleSpec("dino", "Dino", listOf(Color(0xFFD1FAE5), Color(0xFFA7F3D0)), Color(0xFF0B241A), Color(0xFF1A4F39), Color(0xFF34D399), usesLightBackground = true, accentDecorColor = Color(0x44059669)),
    BubbleStyleSpec("dachshund", "Dachshund", listOf(Color(0xFF6F4528), Color(0xFF4E2F1A)), Color.White, Color(0xDDFFFFFF), Color(0xFF8B5A36), usesLightBackground = false, accentDecorColor = Color(0x33FFFFFF)),
    BubbleStyleSpec("hungry-frog", "Hungry Frog", listOf(Color(0xFFBBF7D0), Color(0xFF86EFAC)), Color(0xFF0A2412), Color(0xFF1A4D2A), Color(0xFF4ADE80), usesLightBackground = true, accentDecorColor = Color(0x4416A34A)),
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

@Composable
fun StyledMessageBubbleContainer(
    styleId: String?,
    isMine: Boolean,
    palette: JaTextPalette,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.(ResolvedBubbleColors) -> Unit,
) {
    val spec = resolveBubbleStyleSpec(styleId)
    // Exact .bubble / .bubble.mine / .bubble.theirs geometry from src/index.css (20px radius, 6px tail corner)
    val shape = RoundedCornerShape(
        topStart = 20.dp,
        topEnd = 20.dp,
        bottomStart = if (isMine) 20.dp else 6.dp,
        bottomEnd = if (isMine) 6.dp else 20.dp,
    )
    val ink = resolveBubbleInkColors(styleId, isMine, palette)

    val bgMod = when {
        spec.id != "default" && spec.bgColors.size >= 2 -> {
            Modifier
                .background(Brush.linearGradient(spec.bgColors), shape)
                .border(1.dp, spec.borderColor, shape)
        }
        isMine -> {
            Modifier.background(palette.accent, shape)
        }
        else -> {
            Modifier
                .background(palette.bgTertiary, shape)
                .border(1.dp, palette.border, shape)
        }
    }

    Box(
        modifier = modifier
            .clip(shape)
            .then(bgMod)
            .drawBehind {
                if (spec.id != "default" && spec.accentDecorColor != Color.Transparent) {
                    val r1 = size.minDimension * 0.22f
                    val r2 = size.minDimension * 0.14f
                    drawCircle(
                        color = spec.accentDecorColor,
                        radius = r1,
                        center = Offset(size.width - r1 * 0.7f, r1 * 0.65f),
                    )
                    drawCircle(
                        color = spec.accentDecorColor,
                        radius = r2,
                        center = Offset(r2 * 1.1f, size.height - r2 * 0.8f),
                    )
                }
            }
            .padding(horizontal = 13.dp, vertical = 9.dp)
    ) {
        content(ink)
    }
}

data class WallpaperPresetSpec(
    val id: String,
    val label: String,
    val colors: List<Color>,
)

val CHAT_WALLPAPER_PRESETS: List<WallpaperPresetSpec> = listOf(
    WallpaperPresetSpec("none", "Default Surface", emptyList()),
    WallpaperPresetSpec("starry-dusk", "Starry Dusk", listOf(Color(0xFF0F172A), Color(0xFF1E1B4B), Color(0xFF311035))),
    WallpaperPresetSpec("aurora-mist", "Aurora Mist", listOf(Color(0xFF062825), Color(0xFF0F3D3E), Color(0xFF1D1B38))),
    WallpaperPresetSpec("emerald-grid", "Emerald Night", listOf(Color(0xFF071F18), Color(0xFF0D3327), Color(0xFF0A1D26))),
    WallpaperPresetSpec("midnight-bloom", "Midnight Bloom", listOf(Color(0xFF1A0B2E), Color(0xFF2D143C), Color(0xFF12182B))),
    WallpaperPresetSpec("sunset-haze", "Sunset Haze", listOf(Color(0xFF2B1222), Color(0xFF4C1D2E), Color(0xFF542B1E))),
    WallpaperPresetSpec("ocean-depths", "Ocean Depths", listOf(Color(0xFF041C2C), Color(0xFF0A324A), Color(0xFF0D4448))),
    WallpaperPresetSpec("velvet-cosmos", "Velvet Cosmos", listOf(Color(0xFF13091F), Color(0xFF24123B), Color(0xFF331538))),
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
    presenceStatus: String? = null, // "online" | "away" | "idle" | "dnd" | "offline" | null
    statusBorderColor: Color = Color(0xFF151519),
    modifier: Modifier = Modifier,
) {
    val initial = displayName.trim().take(1).uppercase().ifBlank { "?" }
    val colorSpec = JaTextThemeManager.avatarColorSpec(avatarColor)

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
            if (!avatarUrl.isNullOrBlank()) {
                AsyncImage(
                    model = avatarUrl,
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
