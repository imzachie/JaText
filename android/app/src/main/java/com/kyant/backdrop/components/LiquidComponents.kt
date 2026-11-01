/*
 * iOS 26 Liquid Glass UI Component Suite for JaText
 * Adapted from https://github.com/Kyant0/AndroidLiquidGlass (Apache License 2.0, Copyright 2025 Kyant)
 */
package com.kyant.backdrop.components

import android.content.Context
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.isSpecified
import androidx.compose.ui.graphics.lerp as lerpColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.util.fastCoerceAtMost
import androidx.compose.ui.util.fastCoerceIn
import androidx.compose.ui.util.fastRoundToInt
import androidx.compose.ui.util.lerp
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberBackdrop
import com.kyant.backdrop.backdrops.rememberCombinedBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.effects.vibrancy
import com.kyant.backdrop.highlight.Highlight
import com.kyant.backdrop.navigation.DampedDragAnimation
import com.kyant.backdrop.navigation.InteractiveHighlight
import com.kyant.backdrop.shadow.InnerShadow
import com.kyant.backdrop.shadow.Shadow
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.tanh
import kotlinx.coroutines.flow.collectLatest

private const val PREFS_LIQUID_OPTICS = "jatext_liquid_glass_optics_v1"

@Stable
class LiquidGlassOpticsState(
    initialRefractionHeightDp: Float = 14f,
    initialRefractionAmountDp: Float = 24f,
    initialChromaticAberration: Float = 0.65f,
    private val onPersist: ((Float, Float, Float) -> Unit)? = null,
) {
    var refractionHeightDp by mutableFloatStateOf(initialRefractionHeightDp.coerceIn(0f, 32f))
        private set
    var refractionAmountDp by mutableFloatStateOf(initialRefractionAmountDp.coerceIn(0f, 44f))
        private set
    var chromaticAberration by mutableFloatStateOf(initialChromaticAberration.coerceIn(0f, 1f))
        private set

    fun update(
        heightDp: Float = refractionHeightDp,
        amountDp: Float = refractionAmountDp,
        aberration: Float = chromaticAberration,
    ) {
        refractionHeightDp = heightDp.coerceIn(0f, 32f)
        refractionAmountDp = amountDp.coerceIn(0f, 44f)
        chromaticAberration = aberration.coerceIn(0f, 1f)
        onPersist?.invoke(refractionHeightDp, refractionAmountDp, chromaticAberration)
    }

    fun resetDefaults() {
        update(heightDp = 14f, amountDp = 24f, aberration = 0.65f)
    }
}

val LocalLiquidGlassOptics = compositionLocalOf { LiquidGlassOpticsState() }

@Composable
fun rememberPersistedLiquidGlassOptics(context: Context): LiquidGlassOpticsState {
    return remember(context.applicationContext) {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_LIQUID_OPTICS, Context.MODE_PRIVATE)
        val h = prefs.getFloat("refraction_height_dp", 14f)
        val a = prefs.getFloat("refraction_amount_dp", 24f)
        val c = prefs.getFloat("chromatic_aberration", 0.65f)
        LiquidGlassOpticsState(
            initialRefractionHeightDp = h,
            initialRefractionAmountDp = a,
            initialChromaticAberration = c,
            onPersist = { nh, na, nc ->
                prefs.edit()
                    .putFloat("refraction_height_dp", nh)
                    .putFloat("refraction_amount_dp", na)
                    .putFloat("chromatic_aberration", nc)
                    .apply()
            }
        )
    }
}

/**
 * Ambient iOS 26 Subtle Aurora Orbs rendered inside the Settings backdrop layer so every
 * Liquid Glass card, toggle, slider, button, and input bar refracts rich specular light even on dark/onyx/light surfaces.
 */
@Composable
fun LiquidAmbientMeshBackdrop(
    accentColor: Color,
    secondaryColor: Color,
    isDark: Boolean,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        if (w <= 0f || h <= 0f) return@Canvas
        val alphaBoost = if (isDark) 0.20f else 0.16f
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(accentColor.copy(alpha = alphaBoost), Color.Transparent),
                center = Offset(w * 0.85f, h * 0.14f),
                radius = w * 0.68f,
            ),
            radius = w * 0.68f,
            center = Offset(w * 0.85f, h * 0.14f),
        )
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color(0xFF38BDF8).copy(alpha = alphaBoost * 0.85f), Color.Transparent),
                center = Offset(w * 0.14f, h * 0.44f),
                radius = w * 0.62f,
            ),
            radius = w * 0.62f,
            center = Offset(w * 0.14f, h * 0.44f),
        )
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(secondaryColor.copy(alpha = alphaBoost * 0.9f), Color.Transparent),
                center = Offset(w * 0.78f, h * 0.78f),
                radius = w * 0.66f,
            ),
            radius = w * 0.66f,
            center = Offset(w * 0.78f, h * 0.78f),
        )
    }
}

/**
 * Grouped iOS 26 Liquid Glass Container Card (`ScrollContainerContent` + `DialogContent` style).
 */
@Composable
fun LiquidGlassCard(
    backdrop: Backdrop,
    modifier: Modifier = Modifier,
    isDark: Boolean = isSystemInDarkTheme(),
    cornerRadius: Dp = 24.dp,
    blurRadius: Dp = 20.dp,
    surfaceTint: Color = Color.Unspecified,
    borderColor: Color = Color.Unspecified,
    borderWidth: Dp = 1.dp,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    verticalArrangement: Arrangement.Vertical = Arrangement.spacedBy(12.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    val optics = LocalLiquidGlassOptics.current
    val shape = remember(cornerRadius) { RoundedCornerShape(cornerRadius) }
    val resolvedSurface = if (surfaceTint.isSpecified) {
        surfaceTint
    } else if (isDark) {
        Color(0xFF181924).copy(alpha = 0.56f)
    } else {
        Color(0xFFFFFFFF).copy(alpha = 0.62f)
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .drawBackdrop(
                backdrop = backdrop,
                shape = { shape },
                effects = {
                    vibrancy()
                    blur(blurRadius.toPx())
                    lens(
                        refractionHeight = optics.refractionHeightDp.dp.toPx(),
                        refractionAmount = optics.refractionAmountDp.dp.toPx(),
                        depthEffect = true,
                        chromaticAberration = optics.chromaticAberration >= 0.45f,
                    )
                },
                highlight = {
                    Highlight.Default.copy(alpha = if (isDark) 0.48f else 0.62f)
                },
                shadow = {
                    Shadow(
                        radius = 14.dp,
                        color = Color.Black.copy(alpha = if (isDark) 0.22f else 0.08f),
                    )
                },
                onDrawSurface = {
                    drawRect(resolvedSurface)
                }
            )
            .then(
                if (borderColor.isSpecified) {
                    Modifier.border(borderWidth, borderColor, shape)
                } else {
                    Modifier
                }
            )
            .padding(contentPadding),
        verticalArrangement = verticalArrangement,
        content = content,
    )
}

/**
 * Authentic Kyant0 Surface & Tinted iOS 26 Liquid Glass Capsule Button (Image 2 Top-Left).
 * - Surface Liquid Button: pass `surfaceColor = Color.White.copy(alpha = 0.22f)` (or leave default).
 * - Tinted Liquid Button: pass `tint = Color(0xFF0088FF)` / `palette.accent` / `Color(0xFFFF8D28)` / `palette.danger`.
 */
@Composable
fun LiquidButton(
    onClick: () -> Unit,
    backdrop: Backdrop,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isInteractive: Boolean = true,
    isDark: Boolean = isSystemInDarkTheme(),
    height: Dp = 48.dp,
    horizontalPadding: Dp = 18.dp,
    tint: Color = Color.Unspecified,
    surfaceColor: Color = Color.Unspecified,
    content: @Composable RowScope.() -> Unit,
) {
    val animationScope = rememberCoroutineScope()
    val optics = LocalLiquidGlassOptics.current
    val interactionSource = remember { MutableInteractionSource() }

    val interactiveHighlight = remember(animationScope) {
        InteractiveHighlight(animationScope = animationScope)
    }

    val defaultSurface = if (!tint.isSpecified && !surfaceColor.isSpecified) {
        if (isDark) Color.White.copy(alpha = 0.14f) else Color.White.copy(alpha = 0.52f)
    } else {
        surfaceColor
    }

    Row(
        modifier = modifier
            .alpha(if (enabled) 1f else 0.48f)
            .drawBackdrop(
                backdrop = backdrop,
                shape = { CircleShape },
                effects = {
                    vibrancy()
                    blur(8f.dp.toPx())
                    lens(
                        (optics.refractionHeightDp * 0.85f).coerceAtLeast(8f).dp.toPx(),
                        optics.refractionAmountDp.coerceAtLeast(14f).dp.toPx(),
                        chromaticAberration = optics.chromaticAberration >= 0.5f,
                    )
                },
                highlight = {
                    Highlight.Default.copy(alpha = if (tint.isSpecified) 0.65f else 0.52f)
                },
                shadow = {
                    Shadow(
                        radius = 10.dp,
                        color = if (tint.isSpecified) tint.copy(alpha = 0.24f) else Color.Black.copy(alpha = 0.12f),
                    )
                },
                layerBlock = if (isInteractive && enabled) {
                    {
                        if (size.isSpecified && size.width > 0f && size.height > 0f) {
                            val width = size.width
                            val heightPx = size.height
                            val progress = interactiveHighlight.pressProgress.coerceIn(0f, 1f)
                            val scale = lerp(1f, 1f + 4f.dp.toPx() / heightPx, progress)

                            val maxOffset = size.minDimension.coerceAtLeast(1f)
                            val maxDim = size.maxDimension.coerceAtLeast(1f)
                            val initialDerivative = 0.05f
                            val offset = interactiveHighlight.offset
                            translationX = maxOffset * tanh(initialDerivative * offset.x / maxOffset)
                            translationY = maxOffset * tanh(initialDerivative * offset.y / maxOffset)

                            val maxDragScale = 4f.dp.toPx() / heightPx
                            val offsetAngle = atan2(offset.y, offset.x)
                            scaleX =
                                scale +
                                    maxDragScale * abs(cos(offsetAngle) * offset.x / maxDim) *
                                    (width / heightPx).fastCoerceAtMost(1f)
                            scaleY =
                                scale +
                                    maxDragScale * abs(sin(offsetAngle) * offset.y / maxDim) *
                                    (heightPx / width).fastCoerceAtMost(1f)
                        }
                    }
                } else {
                    null
                },
                onDrawSurface = {
                    if (tint.isSpecified) {
                        drawRect(tint, blendMode = BlendMode.Hue)
                        drawRect(tint.copy(alpha = 0.78f))
                    }
                    if (defaultSurface.isSpecified) {
                        drawRect(defaultSurface)
                    }
                }
            )
            .clickable(
                interactionSource = interactionSource,
                indication = if (isInteractive) null else LocalIndication.current,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .then(
                if (isInteractive && enabled) {
                    Modifier
                        .then(interactiveHighlight.modifier)
                        .then(interactiveHighlight.gestureModifier)
                } else {
                    Modifier
                }
            )
            .height(height)
            .padding(horizontal = horizontalPadding),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/**
 * Circular iOS 26 Liquid Glass Icon Button (Image 2 Top-Right).
 */
@Composable
fun LiquidIconButton(
    onClick: () -> Unit,
    backdrop: Backdrop,
    modifier: Modifier = Modifier,
    size: Dp = 38.dp,
    tint: Color = Color.Unspecified,
    isDark: Boolean = isSystemInDarkTheme(),
    content: @Composable BoxScope.() -> Unit,
) {
    val animationScope = rememberCoroutineScope()
    val interactionSource = remember { MutableInteractionSource() }
    val interactiveHighlight = remember(animationScope) {
        InteractiveHighlight(animationScope = animationScope)
    }

    Box(
        modifier = modifier
            .size(size)
            .drawBackdrop(
                backdrop = backdrop,
                shape = { CircleShape },
                effects = {
                    vibrancy()
                    blur(10f.dp.toPx())
                    lens(8f.dp.toPx(), 16f.dp.toPx())
                },
                highlight = { Highlight.Default.copy(alpha = 0.55f) },
                layerBlock = {
                    if (this.size.isSpecified && this.size.height > 0f) {
                        val progress = interactiveHighlight.pressProgress.coerceIn(0f, 1f)
                        val s = lerp(1f, 1.12f, progress)
                        scaleX = s
                        scaleY = s
                    }
                },
                onDrawSurface = {
                    if (tint.isSpecified) {
                        drawRect(tint.copy(alpha = 0.24f))
                    } else {
                        drawRect(
                            if (isDark) Color.White.copy(alpha = 0.12f)
                            else Color.Black.copy(alpha = 0.06f)
                        )
                    }
                }
            )
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .then(interactiveHighlight.modifier)
            .then(interactiveHighlight.gestureModifier),
        contentAlignment = Alignment.Center,
        content = content,
    )
}

/**
 * Authentic Kyant0 iOS 26 Liquid Glass Switch / Toggle (Image 2 Top-Center).
 * Thumb expands into a live refracting, chromatic-aberration Liquid Glass droplet when pressed or dragged!
 */
@Composable
fun LiquidToggle(
    selected: () -> Boolean,
    onSelect: (Boolean) -> Unit,
    backdrop: Backdrop,
    modifier: Modifier = Modifier,
    isDark: Boolean = isSystemInDarkTheme(),
    activeColor: Color = if (!isDark) Color(0xFF34C759) else Color(0xFF30D158),
) {
    val trackColor =
        if (!isDark) Color(0xFF787880).copy(alpha = 0.24f)
        else Color(0xFF787880).copy(alpha = 0.42f)

    val density = LocalDensity.current
    val isLtr = LocalLayoutDirection.current == LayoutDirection.Ltr
    val dragWidth = with(density) { 20f.dp.toPx() }
    val animationScope = rememberCoroutineScope()
    val latestSelected by rememberUpdatedState(selected)
    val latestOnSelect by rememberUpdatedState(onSelect)
    var didDrag by remember { mutableStateOf(false) }
    var fraction by remember { mutableFloatStateOf(if (selected()) 1f else 0f) }

    val dampedDragAnimation = remember(animationScope) {
        DampedDragAnimation(
            animationScope = animationScope,
            initialValue = fraction,
            valueRange = 0f..1f,
            visibilityThreshold = 0.001f,
            initialScale = 1f,
            pressedScale = 1.48f,
            onDragStarted = {},
            onDragStopped = {
                if (didDrag) {
                    fraction = if (targetValue >= 0.5f) 1f else 0f
                    latestOnSelect(fraction == 1f)
                    didDrag = false
                } else {
                    fraction = if (latestSelected()) 0f else 1f
                    latestOnSelect(fraction == 1f)
                }
            },
            onDrag = { _, dragAmount ->
                if (!didDrag) {
                    didDrag = dragAmount.x != 0f
                }
                val delta = dragAmount.x / dragWidth.coerceAtLeast(1f)
                fraction =
                    if (isLtr) (fraction + delta).fastCoerceIn(0f, 1f)
                    else (fraction - delta).fastCoerceIn(0f, 1f)
            }
        )
    }

    LaunchedEffect(dampedDragAnimation) {
        snapshotFlow { fraction }
            .collectLatest { f ->
                dampedDragAnimation.updateValue(f)
            }
    }
    LaunchedEffect(Unit) {
        snapshotFlow { latestSelected() }
            .collectLatest { isSelected ->
                val target = if (isSelected) 1f else 0f
                if (target != fraction) {
                    fraction = target
                    dampedDragAnimation.animateToValue(target)
                }
            }
    }

    val trackBackdrop = rememberLayerBackdrop()

    Box(
        modifier = modifier,
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            Modifier
                .layerBackdrop(trackBackdrop)
                .clip(CircleShape)
                .drawBehind {
                    val f = dampedDragAnimation.value.fastCoerceIn(0f, 1f)
                    drawRect(lerpColor(trackColor, activeColor, f))
                }
                .size(64f.dp, 28f.dp)
        )

        Box(
            Modifier
                .graphicsLayer {
                    val f = dampedDragAnimation.value.fastCoerceIn(0f, 1f)
                    val pad = 2f.dp.toPx()
                    translationX =
                        if (isLtr) lerp(pad, pad + dragWidth, f)
                        else lerp(-pad, -(pad + dragWidth), f)
                }
                .semantics {
                    role = Role.Switch
                }
                .then(dampedDragAnimation.modifier)
                .drawBackdrop(
                    backdrop = rememberCombinedBackdrop(
                        backdrop,
                        rememberBackdrop(trackBackdrop) { drawBackdrop ->
                            val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                            val sX = lerp(2f / 3f, 0.75f, progress)
                            val sY = lerp(0.05f, 0.75f, progress)
                            scale(sX, sY) {
                                drawBackdrop()
                            }
                        }
                    ),
                    shape = { CircleShape },
                    effects = {
                        val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                        blur(8f.dp.toPx() * (1f - progress))
                        lens(
                            5f.dp.toPx() * progress,
                            10f.dp.toPx() * progress,
                            chromaticAberration = true,
                        )
                    },
                    highlight = {
                        val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                        Highlight.Ambient.copy(
                            width = Highlight.Ambient.width / 1.5f,
                            blurRadius = Highlight.Ambient.blurRadius / 1.5f,
                            alpha = progress.coerceAtLeast(0.22f),
                        )
                    },
                    shadow = {
                        Shadow(
                            radius = 4f.dp,
                            color = Color.Black.copy(alpha = 0.14f),
                        )
                    },
                    innerShadow = {
                        val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                        InnerShadow(
                            radius = 4f.dp * progress,
                            alpha = progress,
                        )
                    },
                    layerBlock = {
                        scaleX = dampedDragAnimation.scaleX
                        scaleY = dampedDragAnimation.scaleY
                        val velocity = dampedDragAnimation.velocity / 50f
                        scaleX /= 1f - (velocity * 0.75f).fastCoerceIn(-0.2f, 0.2f)
                        scaleY *= 1f - (velocity * 0.25f).fastCoerceIn(-0.2f, 0.2f)
                    },
                    onDrawSurface = {
                        val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                        drawRect(Color.White.copy(alpha = (1f - progress * 0.88f).coerceIn(0f, 1f)))
                    }
                )
                .size(40f.dp, 24f.dp)
        )
    }
}

/**
 * Authentic Kyant0 iOS 26 Liquid Glass Slider (Image 2 Bottom-Center).
 * Supports standard iOS Blue / custom accent tracks AND Rainbow Hue tracks for the Theme Studio!
 */
@Composable
fun LiquidSlider(
    value: () -> Float,
    onValueChange: (Float) -> Unit,
    valueRange: ClosedFloatingPointRange<Float>,
    backdrop: Backdrop,
    modifier: Modifier = Modifier,
    visibilityThreshold: Float = ((valueRange.endInclusive - valueRange.start) / 400f).coerceAtLeast(0.001f),
    isDark: Boolean = isSystemInDarkTheme(),
    accentColor: Color = if (!isDark) Color(0xFF0088FF) else Color(0xFF0091FF),
    isRainbowHue: Boolean = false,
    onValueChangeFinished: (() -> Unit)? = null,
) {
    val trackColor =
        if (!isDark) Color(0xFF787880).copy(alpha = 0.22f)
        else Color(0xFF787880).copy(alpha = 0.38f)

    val rainbowBrush = remember {
        Brush.horizontalGradient(
            listOf(
                Color(0xFFFF0000),
                Color(0xFFFFFF00),
                Color(0xFF00FF00),
                Color(0xFF00FFFF),
                Color(0xFF0000FF),
                Color(0xFFFF00FF),
                Color(0xFFFF0000),
            )
        )
    }

    val trackBackdrop = rememberLayerBackdrop()
    val latestValue by rememberUpdatedState(value)
    val latestOnValueChange by rememberUpdatedState(onValueChange)
    val latestOnFinished by rememberUpdatedState(onValueChangeFinished)

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .height(34.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        val trackWidth = constraints.maxWidth.toFloat().coerceAtLeast(1f)
        val rangeSpan = (valueRange.endInclusive - valueRange.start).coerceAtLeast(0.0001f)

        val isLtr = LocalLayoutDirection.current == LayoutDirection.Ltr
        val animationScope = rememberCoroutineScope()
        var didDrag by remember { mutableStateOf(false) }

        val dampedDragAnimation = remember(animationScope, valueRange.start, valueRange.endInclusive) {
            DampedDragAnimation(
                animationScope = animationScope,
                initialValue = latestValue().coerceIn(valueRange),
                valueRange = valueRange,
                visibilityThreshold = visibilityThreshold,
                initialScale = 1f,
                pressedScale = 1.48f,
                onDragStarted = {},
                onDragStopped = {
                    if (didDrag) {
                        latestOnValueChange(targetValue.coerceIn(valueRange))
                        didDrag = false
                    }
                    latestOnFinished?.invoke()
                },
                onDrag = { _, dragAmount ->
                    if (!didDrag) {
                        didDrag = dragAmount.x != 0f
                    }
                    val delta = rangeSpan * (dragAmount.x / trackWidth)
                    val nextVal =
                        if (isLtr) (targetValue + delta).coerceIn(valueRange)
                        else (targetValue - delta).coerceIn(valueRange)
                    updateValue(nextVal)
                    latestOnValueChange(nextVal)
                }
            )
        }

        LaunchedEffect(dampedDragAnimation, valueRange.start, valueRange.endInclusive) {
            snapshotFlow { latestValue().coerceIn(valueRange) }
                .collectLatest { v ->
                    if (abs(dampedDragAnimation.targetValue - v) > visibilityThreshold * 0.5f) {
                        dampedDragAnimation.updateValue(v)
                    }
                }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .layerBackdrop(trackBackdrop),
            contentAlignment = Alignment.CenterStart,
        ) {
            Box(
                Modifier
                    .clip(CircleShape)
                    .then(
                        if (isRainbowHue) Modifier.background(rainbowBrush)
                        else Modifier.background(trackColor)
                    )
                    .pointerInput(animationScope, trackWidth, valueRange.start, valueRange.endInclusive) {
                        detectTapGestures { position ->
                            val delta = rangeSpan * (position.x / trackWidth)
                            val targetVal =
                                (if (isLtr) valueRange.start + delta
                                else valueRange.endInclusive - delta)
                                    .coerceIn(valueRange)
                            dampedDragAnimation.animateToValue(targetVal)
                            latestOnValueChange(targetVal)
                            latestOnFinished?.invoke()
                        }
                    }
                    .height(if (isRainbowHue) 10f.dp else 6f.dp)
                    .fillMaxWidth()
            )

            if (!isRainbowHue) {
                Box(
                    Modifier
                        .clip(CircleShape)
                        .background(accentColor)
                        .height(6f.dp)
                        .layout { measurable, constraints ->
                            val placeable = measurable.measure(constraints)
                            val progress = dampedDragAnimation.progress.fastCoerceIn(0f, 1f)
                            val w = (constraints.maxWidth * progress).fastRoundToInt().coerceAtLeast(0)
                            layout(w, placeable.height) {
                                placeable.place(0, 0)
                            }
                        }
                )
            }
        }

        Box(
            Modifier
                .graphicsLayer {
                    val thumbW = if (size.isSpecified) size.width else 0f
                    val prog = dampedDragAnimation.progress.fastCoerceIn(0f, 1f)
                    val minX = -thumbW / 4f
                    val maxX = (trackWidth - thumbW * 3f / 4f).coerceAtLeast(minX)
                    translationX =
                        (-thumbW / 2f + trackWidth * prog)
                            .fastCoerceIn(minX, maxX) * if (isLtr) 1f else -1f
                }
                .then(dampedDragAnimation.modifier)
                .drawBackdrop(
                    backdrop = rememberCombinedBackdrop(
                        backdrop,
                        rememberBackdrop(trackBackdrop) { drawBackdrop ->
                            val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                            val sX = lerp(2f / 3f, 1f, progress)
                            val sY = lerp(0.08f, 1f, progress)
                            scale(sX, sY) {
                                drawBackdrop()
                            }
                        }
                    ),
                    shape = { CircleShape },
                    effects = {
                        val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                        blur(8f.dp.toPx() * (1f - progress))
                        lens(
                            10f.dp.toPx() * progress,
                            14f.dp.toPx() * progress,
                            chromaticAberration = true,
                        )
                    },
                    highlight = {
                        val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                        Highlight.Ambient.copy(
                            width = Highlight.Ambient.width / 1.5f,
                            blurRadius = Highlight.Ambient.blurRadius / 1.5f,
                            alpha = progress.coerceAtLeast(0.24f),
                        )
                    },
                    shadow = {
                        Shadow(
                            radius = 5f.dp,
                            color = Color.Black.copy(alpha = 0.16f),
                        )
                    },
                    innerShadow = {
                        val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                        InnerShadow(
                            radius = 4f.dp * progress,
                            alpha = progress,
                        )
                    },
                    layerBlock = {
                        scaleX = dampedDragAnimation.scaleX
                        scaleY = dampedDragAnimation.scaleY
                        val velocity = dampedDragAnimation.velocity / 10f
                        scaleX /= 1f - (velocity * 0.75f).fastCoerceIn(-0.2f, 0.2f)
                        scaleY *= 1f - (velocity * 0.25f).fastCoerceIn(-0.2f, 0.2f)
                    },
                    onDrawSurface = {
                        val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                        drawRect(Color.White.copy(alpha = (1f - progress * 0.88f).coerceIn(0f, 1f)))
                    }
                )
                .size(40f.dp, 24f.dp)
        )
    }
}

/**
 * Authentic iOS 26 Liquid Glass Input Box Bar (for Display Name, @Username, Custom Status, Pronouns, Bio, Socials, Website, Hex).
 */
@Composable
fun LiquidTextFieldBar(
    value: String,
    onValueChange: (String) -> Unit,
    backdrop: Backdrop,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String = "",
    leadingPrefix: String? = null,
    leadingIcon: ImageVector? = null,
    leadingSlot: (@Composable () -> Unit)? = null,
    singleLine: Boolean = true,
    maxLines: Int = if (singleLine) 1 else 4,
    monospace: Boolean = false,
    isDark: Boolean = isSystemInDarkTheme(),
    textColor: Color = if (isDark) Color(0xFFF5F5F7) else Color(0xFF111827),
    subTextColor: Color = if (isDark) Color(0xFFA1A1AA) else Color(0xFF6B7280),
    accentColor: Color = Color(0xFF0091FF),
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
) {
    val optics = LocalLiquidGlassOptics.current
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val shape = remember(singleLine) {
        if (singleLine) RoundedCornerShape(999.dp) else RoundedCornerShape(20.dp)
    }

    val focusBorderColor by animateColorAsState(
        targetValue = if (isFocused) accentColor.copy(alpha = 0.88f)
        else if (isDark) Color.White.copy(alpha = 0.14f)
        else Color.Black.copy(alpha = 0.08f),
        animationSpec = tween(180),
        label = "liquidInputBorder",
    )

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (!label.isNullOrBlank()) {
            Text(
                text = label,
                color = if (isFocused) accentColor else subTextColor,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 6.dp),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = if (singleLine) 48.dp else 92.dp)
                .drawBackdrop(
                    backdrop = backdrop,
                    shape = { shape },
                    effects = {
                        vibrancy()
                        blur(18f.dp.toPx())
                        lens(
                            (optics.refractionHeightDp * 0.7f).coerceAtLeast(6f).dp.toPx(),
                            (optics.refractionAmountDp * 0.75f).coerceAtLeast(10f).dp.toPx(),
                        )
                    },
                    highlight = {
                        Highlight.Default.copy(alpha = if (isFocused) 0.72f else 0.38f)
                    },
                    innerShadow = {
                        InnerShadow(
                            radius = 4.dp,
                            alpha = if (isDark) 0.28f else 0.10f,
                        )
                    },
                    onDrawSurface = {
                        drawRect(
                            if (isDark) Color(0xFF0E0F17).copy(alpha = if (isFocused) 0.64f else 0.50f)
                            else Color(0xFFFFFFFF).copy(alpha = if (isFocused) 0.82f else 0.66f)
                        )
                    }
                )
                .border(
                    width = if (isFocused) 1.5.dp else 1.dp,
                    color = focusBorderColor,
                    shape = shape,
                )
                .padding(horizontal = 16.dp, vertical = if (singleLine) 11.dp else 13.dp),
            verticalAlignment = if (singleLine) Alignment.CenterVertically else Alignment.Top,
        ) {
            if (leadingSlot != null) {
                leadingSlot()
                Spacer(Modifier.width(10.dp))
            } else if (leadingIcon != null) {
                Icon(
                    imageVector = leadingIcon,
                    contentDescription = null,
                    tint = if (isFocused) accentColor else subTextColor,
                    modifier = Modifier.size(17.dp),
                )
                Spacer(Modifier.width(9.dp))
            } else if (!leadingPrefix.isNullOrBlank()) {
                Text(
                    text = leadingPrefix,
                    color = if (isFocused) accentColor else subTextColor,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.width(3.dp))
            }

            Box(modifier = Modifier.weight(1f)) {
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    singleLine = singleLine,
                    maxLines = maxLines,
                    interactionSource = interactionSource,
                    keyboardOptions = keyboardOptions,
                    cursorBrush = SolidColor(accentColor),
                    textStyle = TextStyle(
                        color = textColor,
                        fontSize = 14.5.sp,
                        fontWeight = FontWeight.Medium,
                        fontFamily = if (monospace) FontFamily.Monospace else FontFamily.Default,
                        lineHeight = 20.sp,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                    decorationBox = { innerTextField ->
                        if (value.isEmpty() && placeholder.isNotEmpty()) {
                            Text(
                                text = placeholder,
                                color = subTextColor.copy(alpha = 0.65f),
                                fontSize = 14.5.sp,
                                lineHeight = 20.sp,
                            )
                        }
                        innerTextField()
                    },
                )
            }

            if (isFocused && value.isNotEmpty() && singleLine) {
                Spacer(Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(subTextColor.copy(alpha = 0.24f))
                        .clickable { onValueChange("") },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "Clear",
                        tint = textColor,
                        modifier = Modifier.size(12.dp),
                    )
                }
            }
        }
    }
}

/**
 * Refracting iOS 26 Liquid Glass Pill Chip (used for Settings category tabs, Online Status pills, and Segmented switches).
 */
@Composable
fun LiquidPillChip(
    selected: Boolean,
    onClick: () -> Unit,
    backdrop: Backdrop,
    modifier: Modifier = Modifier,
    isDark: Boolean = isSystemInDarkTheme(),
    accentColor: Color = Color(0xFF0091FF),
    activeBorderColor: Color = accentColor,
    horizontalPadding: Dp = 14.dp,
    verticalPadding: Dp = 8.dp,
    content: @Composable RowScope.() -> Unit,
) {
    val animationScope = rememberCoroutineScope()
    val interactionSource = remember { MutableInteractionSource() }
    val interactiveHighlight = remember(animationScope) {
        InteractiveHighlight(animationScope = animationScope)
    }

    Row(
        modifier = modifier
            .drawBackdrop(
                backdrop = backdrop,
                shape = { CircleShape },
                effects = {
                    vibrancy()
                    blur(16f.dp.toPx())
                    lens(8f.dp.toPx(), 16f.dp.toPx())
                },
                highlight = {
                    Highlight.Default.copy(alpha = if (selected) 0.72f else 0.36f)
                },
                layerBlock = {
                    if (size.isSpecified && size.height > 0f) {
                        val p = interactiveHighlight.pressProgress.coerceIn(0f, 1f)
                        val s = lerp(1f, 1.05f, p)
                        scaleX = s
                        scaleY = s
                    }
                },
                onDrawSurface = {
                    if (selected) {
                        drawRect(accentColor, blendMode = BlendMode.Hue)
                        drawRect(accentColor.copy(alpha = if (isDark) 0.56f else 0.72f))
                    } else {
                        drawRect(
                            if (isDark) Color(0xFF1A1B26).copy(alpha = 0.52f)
                            else Color.White.copy(alpha = 0.62f)
                        )
                    }
                }
            )
            .border(
                width = if (selected) 1.5.dp else 1.dp,
                color = if (selected) activeBorderColor.copy(alpha = 0.85f)
                else if (isDark) Color.White.copy(alpha = 0.12f)
                else Color.Black.copy(alpha = 0.08f),
                shape = CircleShape,
            )
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.Tab,
                onClick = onClick,
            )
            .then(interactiveHighlight.modifier)
            .then(interactiveHighlight.gestureModifier)
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
        content = content,
    )
}
