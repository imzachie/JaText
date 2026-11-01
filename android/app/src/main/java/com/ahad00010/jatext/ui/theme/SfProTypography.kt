package com.ahad00010.jatext.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.ahad00010.jatext.R

/**
 * Apple SF Pro Text (< 20sp):
 * Messages, composer input, sidebar previews, buttons, timestamps, settings rows, labels, menus.
 * Maps every Compose FontWeight (W100..W900) and FontStyle.Italic to its genuine Apple SF Pro OTF.
 */
val SfProTextFontFamily = FontFamily(
    Font(resId = R.font.sf_pro_text_ultralight, weight = FontWeight.Thin, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_text_thin, weight = FontWeight.ExtraLight, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_text_light, weight = FontWeight.Light, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_text_regular, weight = FontWeight.Normal, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_text_regular_italic, weight = FontWeight.Normal, style = FontStyle.Italic),
    Font(resId = R.font.sf_pro_text_medium, weight = FontWeight.Medium, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_text_medium_italic, weight = FontWeight.Medium, style = FontStyle.Italic),
    Font(resId = R.font.sf_pro_text_semibold, weight = FontWeight.SemiBold, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_text_semibold_italic, weight = FontWeight.SemiBold, style = FontStyle.Italic),
    Font(resId = R.font.sf_pro_text_bold, weight = FontWeight.Bold, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_text_bold_italic, weight = FontWeight.Bold, style = FontStyle.Italic),
    Font(resId = R.font.sf_pro_text_heavy, weight = FontWeight.ExtraBold, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_text_heavy_italic, weight = FontWeight.ExtraBold, style = FontStyle.Italic),
    Font(resId = R.font.sf_pro_text_black, weight = FontWeight.Black, style = FontStyle.Normal),
)

/**
 * Apple SF Pro Display (>= 20sp):
 * Screen headers, hero greeting banners, login/onboarding titles, caller names, profile titles, modals.
 */
val SfProDisplayFontFamily = FontFamily(
    Font(resId = R.font.sf_pro_display_light, weight = FontWeight.Thin, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_display_light, weight = FontWeight.ExtraLight, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_display_light, weight = FontWeight.Light, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_display_regular, weight = FontWeight.Normal, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_display_regular_italic, weight = FontWeight.Normal, style = FontStyle.Italic),
    Font(resId = R.font.sf_pro_display_medium, weight = FontWeight.Medium, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_display_semibold, weight = FontWeight.SemiBold, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_display_bold, weight = FontWeight.Bold, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_display_bold_italic, weight = FontWeight.Bold, style = FontStyle.Italic),
    Font(resId = R.font.sf_pro_display_heavy, weight = FontWeight.ExtraBold, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_display_black, weight = FontWeight.Black, style = FontStyle.Normal),
)

/**
 * Apple SF Pro Rounded:
 * Unread counters, numeric pill badges, avatar initials, call duration timers, GIF / media badges.
 */
val SfProRoundedFontFamily = FontFamily(
    Font(resId = R.font.sf_pro_rounded_regular, weight = FontWeight.Light, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_rounded_regular, weight = FontWeight.Normal, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_rounded_medium, weight = FontWeight.Medium, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_rounded_semibold, weight = FontWeight.SemiBold, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_rounded_bold, weight = FontWeight.Bold, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_rounded_heavy, weight = FontWeight.ExtraBold, style = FontStyle.Normal),
    Font(resId = R.font.sf_pro_rounded_black, weight = FontWeight.Black, style = FontStyle.Normal),
)

/**
 * Complete Material 3 Typography pairing SF Pro Display (>= 20sp) with SF Pro Text (< 20sp)
 * using Apple Human Interface Guidelines optical tracking.
 */
val JaTextTypography = Typography(
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
