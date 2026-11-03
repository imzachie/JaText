package com.ahad00010.jatext.ui.theme

import android.content.Context
import android.content.res.Resources
import android.graphics.Typeface
import android.graphics.fonts.Font as PlatformFont
import android.graphics.fonts.FontFamily as PlatformFontFamily
import android.graphics.fonts.FontStyle as PlatformFontStyle
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.ahad00010.jatext.R

/**
 * Dedicated iOS 26.4 Unicode 17.0 color emoji FontFamily (`res/font/jatext_ios_emoji.ttf`)
 * for standalone emoji cells, reaction chips, and pre-API-29 SpanStyle emoji runs.
 */
val IosEmojiOnlyFontFamily = FontFamily(
    Font(resId = R.font.jatext_ios_emoji, weight = FontWeight.Normal, style = FontStyle.Normal),
)

private data class SfProFaceSpec(
    val resId: Int,
    val weight: FontWeight,
    val italic: Boolean = false,
)

private val SF_PRO_TEXT_SPECS = listOf(
    SfProFaceSpec(R.font.sf_pro_text_ultralight, FontWeight.Thin),
    SfProFaceSpec(R.font.sf_pro_text_thin, FontWeight.ExtraLight),
    SfProFaceSpec(R.font.sf_pro_text_light, FontWeight.Light),
    SfProFaceSpec(R.font.sf_pro_text_regular, FontWeight.Normal),
    SfProFaceSpec(R.font.sf_pro_text_regular_italic, FontWeight.Normal, italic = true),
    SfProFaceSpec(R.font.sf_pro_text_medium, FontWeight.Medium),
    SfProFaceSpec(R.font.sf_pro_text_medium_italic, FontWeight.Medium, italic = true),
    SfProFaceSpec(R.font.sf_pro_text_semibold, FontWeight.SemiBold),
    SfProFaceSpec(R.font.sf_pro_text_semibold_italic, FontWeight.SemiBold, italic = true),
    SfProFaceSpec(R.font.sf_pro_text_bold, FontWeight.Bold),
    SfProFaceSpec(R.font.sf_pro_text_bold_italic, FontWeight.Bold, italic = true),
    SfProFaceSpec(R.font.sf_pro_text_heavy, FontWeight.ExtraBold),
    SfProFaceSpec(R.font.sf_pro_text_heavy_italic, FontWeight.ExtraBold, italic = true),
    SfProFaceSpec(R.font.sf_pro_text_black, FontWeight.Black),
)

private val SF_PRO_DISPLAY_SPECS = listOf(
    SfProFaceSpec(R.font.sf_pro_display_light, FontWeight.Thin),
    SfProFaceSpec(R.font.sf_pro_display_light, FontWeight.ExtraLight),
    SfProFaceSpec(R.font.sf_pro_display_light, FontWeight.Light),
    SfProFaceSpec(R.font.sf_pro_display_regular, FontWeight.Normal),
    SfProFaceSpec(R.font.sf_pro_display_regular_italic, FontWeight.Normal, italic = true),
    SfProFaceSpec(R.font.sf_pro_display_medium, FontWeight.Medium),
    SfProFaceSpec(R.font.sf_pro_display_semibold, FontWeight.SemiBold),
    SfProFaceSpec(R.font.sf_pro_display_bold, FontWeight.Bold),
    SfProFaceSpec(R.font.sf_pro_display_bold_italic, FontWeight.Bold, italic = true),
    SfProFaceSpec(R.font.sf_pro_display_heavy, FontWeight.ExtraBold),
    SfProFaceSpec(R.font.sf_pro_display_black, FontWeight.Black),
)

private val SF_PRO_ROUNDED_SPECS = listOf(
    SfProFaceSpec(R.font.sf_pro_rounded_regular, FontWeight.Light),
    SfProFaceSpec(R.font.sf_pro_rounded_regular, FontWeight.Normal),
    SfProFaceSpec(R.font.sf_pro_rounded_medium, FontWeight.Medium),
    SfProFaceSpec(R.font.sf_pro_rounded_semibold, FontWeight.SemiBold),
    SfProFaceSpec(R.font.sf_pro_rounded_bold, FontWeight.Bold),
    SfProFaceSpec(R.font.sf_pro_rounded_heavy, FontWeight.ExtraBold),
    SfProFaceSpec(R.font.sf_pro_rounded_black, FontWeight.Black),
)

private fun buildComposeFontFamily(specs: List<SfProFaceSpec>): FontFamily = FontFamily(
    specs.map { spec ->
        Font(
            resId = spec.resId,
            weight = spec.weight,
            style = if (spec.italic) FontStyle.Italic else FontStyle.Normal,
        )
    },
)

/**
 * Apple SF Pro Text (< 20sp) + iOS 26.4 Unicode 17.0 Emoji fallback:
 * Messages, composer input, sidebar previews, buttons, timestamps, settings rows, labels, menus.
 */
@Volatile
var SfProTextFontFamily: FontFamily = buildComposeFontFamily(SF_PRO_TEXT_SPECS)
    private set

/**
 * Apple SF Pro Display (>= 20sp) + iOS 26.4 Unicode 17.0 Emoji fallback:
 * Screen headers, hero greeting banners, login/onboarding titles, caller names, profile titles, modals.
 */
@Volatile
var SfProDisplayFontFamily: FontFamily = buildComposeFontFamily(SF_PRO_DISPLAY_SPECS)
    private set

/**
 * Apple SF Pro Rounded + iOS 26.4 Unicode 17.0 Emoji fallback:
 * Unread counters, numeric pill badges, avatar initials, call duration timers, GIF / media badges.
 */
@Volatile
var SfProRoundedFontFamily: FontFamily = buildComposeFontFamily(SF_PRO_ROUNDED_SPECS)
    private set

private fun buildJaTextTypography(
    displayFamily: FontFamily,
    textFamily: FontFamily,
): Typography = Typography(
    displayLarge = TextStyle(
        fontFamily = displayFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 57.sp,
        lineHeight = 64.sp,
        letterSpacing = (-0.40).sp,
    ),
    displayMedium = TextStyle(
        fontFamily = displayFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 45.sp,
        lineHeight = 52.sp,
        letterSpacing = (-0.35).sp,
    ),
    displaySmall = TextStyle(
        fontFamily = displayFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 36.sp,
        lineHeight = 44.sp,
        letterSpacing = (-0.30).sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = displayFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.28).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = displayFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 34.sp,
        letterSpacing = (-0.24).sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = displayFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.20).sp,
    ),
    titleLarge = TextStyle(
        fontFamily = displayFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 21.sp,
        lineHeight = 27.sp,
        letterSpacing = (-0.18).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = textFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.5.sp,
        lineHeight = 22.sp,
        letterSpacing = (-0.12).sp,
    ),
    titleSmall = TextStyle(
        fontFamily = textFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.5.sp,
        lineHeight = 20.sp,
        letterSpacing = (-0.08).sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = textFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 15.5.sp,
        lineHeight = 21.sp,
        letterSpacing = (-0.10).sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = textFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = (-0.08).sp,
    ),
    bodySmall = TextStyle(
        fontFamily = textFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 12.5.sp,
        lineHeight = 17.sp,
        letterSpacing = (-0.04).sp,
    ),
    labelLarge = TextStyle(
        fontFamily = textFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 19.sp,
        letterSpacing = (-0.06).sp,
    ),
    labelMedium = TextStyle(
        fontFamily = textFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = (-0.02).sp,
    ),
    labelSmall = TextStyle(
        fontFamily = textFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 15.sp,
        letterSpacing = 0.sp,
    ),
)

@Volatile
var JaTextTypography: Typography = buildJaTextTypography(
    displayFamily = SfProDisplayFontFamily,
    textFamily = SfProTextFontFamily,
)
    private set

@Volatile
private var iosEmojiFallbackInstalled = false

@RequiresApi(Build.VERSION_CODES.Q)
private fun buildCustomFallbackFontFamily(
    res: Resources,
    specs: List<SfProFaceSpec>,
    emojiNativeFamily: PlatformFontFamily,
): FontFamily {
    val first = specs.first()
    val builder = PlatformFontFamily.Builder(
        PlatformFont.Builder(res, first.resId)
            .setWeight(first.weight.weight)
            .setSlant(
                if (first.italic) PlatformFontStyle.FONT_SLANT_ITALIC
                else PlatformFontStyle.FONT_SLANT_UPRIGHT,
            )
            .build(),
    )
    for (idx in 1 until specs.size) {
        val spec = specs[idx]
        builder.addFont(
            PlatformFont.Builder(res, spec.resId)
                .setWeight(spec.weight.weight)
                .setSlant(
                    if (spec.italic) PlatformFontStyle.FONT_SLANT_ITALIC
                    else PlatformFontStyle.FONT_SLANT_UPRIGHT,
                )
                .build(),
        )
    }
    val typeface = Typeface.CustomFallbackBuilder(builder.build())
        .addCustomFallback(emojiNativeFamily)
        .setSystemFallback("sans-serif")
        .build()
    return FontFamily(typeface)
}

/**
 * Chains Apple SF Pro -> iOS 26.4 Unicode 17.0 Color Emoji (`jatext_ios_emoji.ttf`) -> system
 * fallback across the entire Android app so every Text, TextField, composer, reaction, title,
 * name, bio, status, and preview renders genuine iOS 26.4 emojis instead of system NotoColorEmoji.
 */
fun ensureSfProWithIosEmojiInitialized(context: Context) {
    if (iosEmojiFallbackInstalled) return
    synchronized(IosEmojiOnlyFontFamily) {
        if (iosEmojiFallbackInstalled) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            runCatching {
                val res = context.applicationContext.resources
                val emojiNativeFamily = PlatformFontFamily.Builder(
                    PlatformFont.Builder(res, R.font.jatext_ios_emoji)
                        .setWeight(400)
                        .setSlant(PlatformFontStyle.FONT_SLANT_UPRIGHT)
                        .build(),
                ).build()
                val textWithEmoji = buildCustomFallbackFontFamily(res, SF_PRO_TEXT_SPECS, emojiNativeFamily)
                val displayWithEmoji = buildCustomFallbackFontFamily(res, SF_PRO_DISPLAY_SPECS, emojiNativeFamily)
                val roundedWithEmoji = buildCustomFallbackFontFamily(res, SF_PRO_ROUNDED_SPECS, emojiNativeFamily)
                SfProTextFontFamily = textWithEmoji
                SfProDisplayFontFamily = displayWithEmoji
                SfProRoundedFontFamily = roundedWithEmoji
                JaTextTypography = buildJaTextTypography(
                    displayFamily = displayWithEmoji,
                    textFamily = textWithEmoji,
                )
            }
        }
        iosEmojiFallbackInstalled = true
    }
}
