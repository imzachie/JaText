@file:Suppress("DEPRECATION")

package com.ahad00010.jatext.ui.theme

import android.content.Context
import android.graphics.Typeface
import android.graphics.fonts.Font as PlatformFont
import android.graphics.fonts.FontFamily as PlatformFontFamily
import android.graphics.fonts.FontStyle as PlatformFontStyle
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.AndroidFont
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontLoadingStrategy
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.content.res.ResourcesCompat
import com.ahad00010.jatext.R
import java.util.concurrent.ConcurrentHashMap

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

@OptIn(ExperimentalTextApi::class)
private class SfProWithIosEmojiFont(
    val resId: Int,
    override val weight: FontWeight,
    override val style: FontStyle,
) : AndroidFont(
    loadingStrategy = FontLoadingStrategy.Blocking,
    typefaceLoader = SfProEmojiTypefaceLoader,
    variationSettings = FontVariation.Settings(),
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is SfProWithIosEmojiFont) return false
        return resId == other.resId && weight == other.weight && style == other.style
    }

    override fun hashCode(): Int {
        var result = resId
        result = 31 * result + weight.hashCode()
        result = 31 * result + style.hashCode()
        return result
    }
}

private object SfProEmojiTypefaceLoader : AndroidFont.TypefaceLoader {
    private val faceCache = ConcurrentHashMap<String, Typeface>()

    @Volatile
    private var cachedEmojiNativeFamily: Any? = null

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun getOrBuildEmojiNativeFamily(context: Context): PlatformFontFamily {
        val existing = cachedEmojiNativeFamily as? PlatformFontFamily
        if (existing != null) return existing
        synchronized(this) {
            val second = cachedEmojiNativeFamily as? PlatformFontFamily
            if (second != null) return second
            val built = PlatformFontFamily.Builder(
                PlatformFont.Builder(context.applicationContext.resources, R.font.jatext_ios_emoji)
                    .setWeight(400)
                    .setSlant(PlatformFontStyle.FONT_SLANT_UPRIGHT)
                    .build(),
            ).build()
            cachedEmojiNativeFamily = built
            return built
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun buildApi29TypefaceWithEmojiFallback(
        context: Context,
        font: SfProWithIosEmojiFont,
    ): Typeface {
        val isItalic = font.style == FontStyle.Italic
        val slant = if (isItalic) {
            PlatformFontStyle.FONT_SLANT_ITALIC
        } else {
            PlatformFontStyle.FONT_SLANT_UPRIGHT
        }
        val res = context.applicationContext.resources
        val primaryNativeFont = PlatformFont.Builder(res, font.resId)
            .setWeight(font.weight.weight)
            .setSlant(slant)
            .build()
        val primaryFamily = PlatformFontFamily.Builder(primaryNativeFont).build()
        val emojiFamily = getOrBuildEmojiNativeFamily(context)
        return Typeface.CustomFallbackBuilder(primaryFamily)
            .addCustomFallback(emojiFamily)
            .setSystemFallback("sans-serif")
            .setStyle(PlatformFontStyle(font.weight.weight, slant))
            .build()
    }

    override fun loadBlocking(context: Context, font: AndroidFont): Typeface? {
        if (font !is SfProWithIosEmojiFont) return null
        val key = "${font.resId}:${font.weight.weight}:${font.style == FontStyle.Italic}"
        faceCache[key]?.let { return it }
        val built = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            runCatching { buildApi29TypefaceWithEmojiFallback(context, font) }
                .getOrElse { ResourcesCompat.getFont(context, font.resId) }
        } else {
            ResourcesCompat.getFont(context, font.resId)
        }
        if (built != null) {
            faceCache[key] = built
        }
        return built
    }

    override suspend fun awaitLoad(context: Context, font: AndroidFont): Typeface? =
        loadBlocking(context, font)
}

/**
 * Builds a genuine Compose `FontListFontFamily` (`FontFamily(List<Font>)`) so Compose's
 * `FontMatcher` resolves every individual SF Pro weight (`100`..`900`) and `Italic` face
 * natively while chaining `jatext_ios_emoji.ttf` right behind every single face on API >= 29.
 */
private fun buildSfProWithEmojiFontFamily(specs: List<SfProFaceSpec>): FontFamily = FontFamily(
    specs.map { spec ->
        val fontStyle = if (spec.italic) FontStyle.Italic else FontStyle.Normal
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            SfProWithIosEmojiFont(
                resId = spec.resId,
                weight = spec.weight,
                style = fontStyle,
            )
        } else {
            Font(
                resId = spec.resId,
                weight = spec.weight,
                style = fontStyle,
            )
        }
    },
)

/**
 * Apple SF Pro Text (< 20sp) + iOS 26.4 Unicode 17.0 Emoji fallback across all 14 faces:
 * Messages, composer input, sidebar previews, buttons, timestamps, settings rows, labels, menus.
 */
val SfProTextFontFamily: FontFamily = buildSfProWithEmojiFontFamily(SF_PRO_TEXT_SPECS)

/**
 * Apple SF Pro Display (>= 20sp) + iOS 26.4 Unicode 17.0 Emoji fallback across all 11 faces:
 * Screen headers, hero greeting banners, login/onboarding titles, caller names, profile titles, modals.
 */
val SfProDisplayFontFamily: FontFamily = buildSfProWithEmojiFontFamily(SF_PRO_DISPLAY_SPECS)

/**
 * Apple SF Pro Rounded + iOS 26.4 Unicode 17.0 Emoji fallback across all 7 weight mappings:
 * Unread counters, numeric pill badges, avatar initials, call duration timers, GIF / media badges.
 */
val SfProRoundedFontFamily: FontFamily = buildSfProWithEmojiFontFamily(SF_PRO_ROUNDED_SPECS)

val JaTextTypography: Typography = Typography(
    displayLarge = TextStyle(
        fontFamily = SfProDisplayFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 57.sp,
        lineHeight = 64.sp,
        letterSpacing = (-0.40).sp,
    ),
    displayMedium = TextStyle(
        fontFamily = SfProDisplayFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 45.sp,
        lineHeight = 52.sp,
        letterSpacing = (-0.35).sp,
    ),
    displaySmall = TextStyle(
        fontFamily = SfProDisplayFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 36.sp,
        lineHeight = 44.sp,
        letterSpacing = (-0.30).sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = SfProDisplayFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.28).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = SfProDisplayFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 34.sp,
        letterSpacing = (-0.24).sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = SfProDisplayFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.20).sp,
    ),
    titleLarge = TextStyle(
        fontFamily = SfProDisplayFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 21.sp,
        lineHeight = 27.sp,
        letterSpacing = (-0.18).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = SfProTextFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.5.sp,
        lineHeight = 22.sp,
        letterSpacing = (-0.12).sp,
    ),
    titleSmall = TextStyle(
        fontFamily = SfProTextFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.5.sp,
        lineHeight = 20.sp,
        letterSpacing = (-0.08).sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = SfProTextFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 15.5.sp,
        lineHeight = 21.sp,
        letterSpacing = (-0.10).sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = SfProTextFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = (-0.08).sp,
    ),
    bodySmall = TextStyle(
        fontFamily = SfProTextFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 12.5.sp,
        lineHeight = 17.sp,
        letterSpacing = (-0.04).sp,
    ),
    labelLarge = TextStyle(
        fontFamily = SfProTextFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 19.sp,
        letterSpacing = (-0.06).sp,
    ),
    labelMedium = TextStyle(
        fontFamily = SfProTextFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = (-0.02).sp,
    ),
    labelSmall = TextStyle(
        fontFamily = SfProTextFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 15.sp,
        letterSpacing = 0.sp,
    ),
)

/**
 * Eagerly warms the common SF Pro Text & Display Regular/Semibold/Bold faces + iOS 26.4
 * emoji fallback at startup so the first frame renders without font-decode hitching.
 */
fun ensureSfProWithIosEmojiInitialized(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        runCatching {
            val warmSpecs = listOf(
                SfProWithIosEmojiFont(R.font.sf_pro_text_regular, FontWeight.Normal, FontStyle.Normal),
                SfProWithIosEmojiFont(R.font.sf_pro_text_semibold, FontWeight.SemiBold, FontStyle.Normal),
                SfProWithIosEmojiFont(R.font.sf_pro_text_bold, FontWeight.Bold, FontStyle.Normal),
                SfProWithIosEmojiFont(R.font.sf_pro_display_bold, FontWeight.Bold, FontStyle.Normal),
            )
            for (f in warmSpecs) {
                SfProEmojiTypefaceLoader.loadBlocking(context.applicationContext, f)
            }
        }
    }
}
