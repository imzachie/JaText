/*
 * Adapted from https://github.com/Kyant0/AndroidLiquidGlass (Apache License 2.0)
 * Copyright 2025 Kyant
 */
package com.kyant.backdrop.navigation

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.spring
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.fastCoerceIn
import androidx.compose.ui.util.fastRoundToInt
import androidx.compose.ui.util.lerp
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberCombinedBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.effects.vibrancy
import com.kyant.backdrop.highlight.Highlight
import com.kyant.backdrop.shadow.InnerShadow
import com.kyant.backdrop.shadow.Shadow
import kotlin.math.abs
import kotlin.math.sign
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@Composable
fun LiquidBottomTabs(
    selectedTabIndex: () -> Int,
    onTabSelected: (index: Int) -> Unit,
    backdrop: Backdrop,
    tabsCount: Int,
    modifier: Modifier = Modifier,
    isLightTheme: Boolean = !isSystemInDarkTheme(),
    accentColor: Color = if (isLightTheme) Color(0xFF0088FF) else Color(0xFF0091FF),
    inactiveColor: Color = if (isLightTheme) Color(0xFF1C1C1E).copy(alpha = 0.82f) else Color(0xFFF2F2F7).copy(alpha = 0.85f),
    content: @Composable RowScope.() -> Unit
) {
    val containerColor =
        if (isLightTheme) Color(0xFFFAFAFC).copy(alpha = 0.72f)
        else Color(0xFF14141C).copy(alpha = 0.76f)

    val tabsBackdrop = rememberLayerBackdrop()

    BoxWithConstraints(
        modifier = modifier,
        contentAlignment = Alignment.CenterStart
    ) {
        val density = LocalDensity.current
        val tabWidth = with(density) {
            ((constraints.maxWidth.toFloat() - 8f.dp.toPx()) / tabsCount.coerceAtLeast(1)).coerceAtLeast(1f)
        }

        val offsetAnimation = remember { Animatable(0f) }
        val panelOffset by remember(density, constraints.maxWidth) {
            derivedStateOf {
                val maxW = constraints.maxWidth.toFloat().coerceAtLeast(1f)
                val fraction = (offsetAnimation.value / maxW).fastCoerceIn(-1f, 1f)
                with(density) {
                    4f.dp.toPx() * fraction.sign * EaseOut.transform(abs(fraction))
                }
            }
        }

        val isLtr = LocalLayoutDirection.current == LayoutDirection.Ltr
        val animationScope = rememberCoroutineScope()
        val latestSelectedTabIndex by rememberUpdatedState(selectedTabIndex)
        val latestOnTabSelected by rememberUpdatedState(onTabSelected)
        val maxIndex = (tabsCount - 1).coerceAtLeast(0)
        var currentIndex by remember {
            mutableIntStateOf(selectedTabIndex().coerceIn(0, maxIndex))
        }
        val dampedDragAnimation = remember(animationScope, tabsCount) {
            DampedDragAnimation(
                animationScope = animationScope,
                initialValue = currentIndex.toFloat(),
                valueRange = 0f..maxIndex.toFloat(),
                visibilityThreshold = 0.001f,
                initialScale = 1f,
                pressedScale = 78f / 56f,
                onDragStarted = {},
                onDragStopped = {
                    val targetIndex = targetValue.fastRoundToInt().coerceIn(0, maxIndex)
                    currentIndex = targetIndex
                    animateToValue(targetIndex.toFloat())
                    latestOnTabSelected(targetIndex)
                    animationScope.launch {
                        offsetAnimation.animateTo(
                            0f,
                            spring(1f, 300f, 0.5f)
                        )
                    }
                },
                onDrag = { _, dragAmount ->
                    updateValue(
                        (targetValue + dragAmount.x / tabWidth * if (isLtr) 1f else -1f)
                            .fastCoerceIn(0f, maxIndex.toFloat())
                    )
                    animationScope.launch {
                        offsetAnimation.snapTo(offsetAnimation.value + dragAmount.x)
                    }
                }
            )
        }
        LaunchedEffect(dampedDragAnimation, maxIndex) {
            snapshotFlow { latestSelectedTabIndex().coerceIn(0, maxIndex) }
                .collectLatest { index ->
                    if (currentIndex != index) {
                        currentIndex = index
                        dampedDragAnimation.animateToValue(index.toFloat())
                    }
                }
        }

        val interactiveHighlight = remember(animationScope, tabWidth, isLtr) {
            InteractiveHighlight(
                animationScope = animationScope,
                position = { size, _ ->
                    val w = if (size.isSpecified) size.width else 0f
                    val h = if (size.isSpecified) size.height else 0f
                    Offset(
                        if (isLtr) (dampedDragAnimation.value + 0.5f) * tabWidth + panelOffset
                        else w - (dampedDragAnimation.value + 0.5f) * tabWidth + panelOffset,
                        h / 2f
                    )
                }
            )
        }

        CompositionLocalProvider(
            LocalLiquidBottomTabContentColor provides inactiveColor
        ) {
            Row(
                Modifier
                    .graphicsLayer {
                        translationX = panelOffset
                    }
                    .drawBackdrop(
                        backdrop = backdrop,
                        shape = { CircleShape },
                        effects = {
                            vibrancy()
                            blur(14f.dp.toPx())
                            lens(12f.dp.toPx(), 14f.dp.toPx())
                        },
                        layerBlock = {
                            val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                            val w = if (size.isSpecified) size.width.coerceAtLeast(1f) else 1f
                            val scale = lerp(1f, 1f + 16f.dp.toPx() / w, progress)
                            scaleX = scale
                            scaleY = scale
                        },
                        onDrawSurface = { drawRect(containerColor) }
                    )
                    .then(interactiveHighlight.modifier)
                    .height(60f.dp)
                    .fillMaxWidth()
                    .padding(4f.dp),
                verticalAlignment = Alignment.CenterVertically,
                content = content
            )
        }

        CompositionLocalProvider(
            LocalLiquidBottomTabContentColor provides accentColor,
            LocalLiquidBottomTabScale provides {
                lerp(1f, 1.16f, dampedDragAnimation.pressProgress.coerceIn(0f, 1f))
            }
        ) {
            Row(
                Modifier
                    .clearAndSetSemantics {}
                    .alpha(0f)
                    .layerBackdrop(tabsBackdrop)
                    .graphicsLayer {
                        translationX = panelOffset
                    }
                    .drawBackdrop(
                        backdrop = backdrop,
                        shape = { CircleShape },
                        effects = {
                            val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                            vibrancy()
                            blur(12f.dp.toPx() * (1f - progress * 0.5f))
                            if (progress > 0.01f) {
                                lens(
                                    12f.dp.toPx() * progress,
                                    14f.dp.toPx() * progress
                                )
                            }
                        },
                        highlight = {
                            val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                            Highlight.Default.copy(alpha = progress)
                        },
                        onDrawSurface = { drawRect(containerColor) }
                    )
                    .then(interactiveHighlight.modifier)
                    .height(52f.dp)
                    .fillMaxWidth()
                    .padding(horizontal = 4f.dp),
                verticalAlignment = Alignment.CenterVertically,
                content = content
            )
        }

        Box(
            Modifier
                .padding(horizontal = 4f.dp)
                .graphicsLayer {
                    val w = if (size.isSpecified) size.width else 0f
                    translationX =
                        if (isLtr) dampedDragAnimation.value * tabWidth + panelOffset
                        else w - (dampedDragAnimation.value + 1f) * tabWidth + panelOffset
                }
                .then(interactiveHighlight.gestureModifier)
                .then(dampedDragAnimation.modifier)
                .drawBackdrop(
                    backdrop = rememberCombinedBackdrop(backdrop, tabsBackdrop),
                    shape = { CircleShape },
                    effects = {
                        val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                        lens(
                            10f.dp.toPx() * progress,
                            14f.dp.toPx() * progress,
                            chromaticAberration = true
                        )
                    },
                    highlight = {
                        val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                        Highlight.Default.copy(alpha = progress.coerceAtLeast(0.35f))
                    },
                    shadow = {
                        val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                        Shadow(alpha = progress)
                    },
                    innerShadow = {
                        val progress = dampedDragAnimation.pressProgress.coerceIn(0f, 1f)
                        InnerShadow(
                            radius = 8f.dp * progress,
                            alpha = progress
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
                        drawRect(
                            if (isLightTheme) Color.Black.copy(alpha = 0.09f)
                            else Color.White.copy(alpha = 0.13f),
                            alpha = (1f - progress).coerceIn(0f, 1f)
                        )
                        drawRect(Color.Black.copy(alpha = (0.03f * progress).coerceIn(0f, 1f)))
                    }
                )
                .height(52f.dp)
                .fillMaxWidth(1f / tabsCount.coerceAtLeast(1))
        )
    }
}

/**
 * iOS 26.3 separated circular Liquid Glass Search button (no label, icon-only circle)
 * positioned at the trailing end of the bottom navigation dock.
 */
@Composable
fun LiquidSeparatedSearchButton(
    active: Boolean,
    onClick: () -> Unit,
    backdrop: Backdrop,
    modifier: Modifier = Modifier,
    size: Dp = 60.dp,
    isLightTheme: Boolean = !isSystemInDarkTheme(),
    accentColor: Color = if (isLightTheme) Color(0xFF0088FF) else Color(0xFF0091FF),
    inactiveColor: Color = if (isLightTheme) Color(0xFF1C1C1E).copy(alpha = 0.86f) else Color(0xFFF2F2F7).copy(alpha = 0.90f),
) {
    val containerColor =
        if (isLightTheme) Color(0xFFFAFAFC).copy(alpha = 0.72f)
        else Color(0xFF14141C).copy(alpha = 0.76f)
    val animationScope = rememberCoroutineScope()
    val interactiveHighlight = remember(animationScope) {
        InteractiveHighlight(
            animationScope = animationScope,
            position = { drawSize, _ ->
                val w = if (drawSize.isSpecified) drawSize.width else 0f
                val h = if (drawSize.isSpecified) drawSize.height else 0f
                Offset(w / 2f, h / 2f)
            }
        )
    }
    val clickInteraction = remember { MutableInteractionSource() }

    Box(
        modifier = modifier
            .size(size)
            .then(interactiveHighlight.gestureModifier)
            .drawBackdrop(
                backdrop = backdrop,
                shape = { CircleShape },
                effects = {
                    vibrancy()
                    blur(14f.dp.toPx())
                    lens(12f.dp.toPx(), 14f.dp.toPx(), chromaticAberration = active)
                },
                highlight = {
                    Highlight.Default.copy(alpha = if (active) 0.90f else 0.55f)
                },
                shadow = {
                    if (active) Shadow(alpha = 0.65f) else null
                },
                innerShadow = {
                    if (active) InnerShadow(radius = 8.dp, alpha = 0.75f) else null
                },
                onDrawSurface = {
                    drawRect(containerColor)
                    if (active) {
                        drawRect(
                            if (isLightTheme) Color.Black.copy(alpha = 0.08f)
                            else Color.White.copy(alpha = 0.15f)
                        )
                    }
                }
            )
            .then(interactiveHighlight.modifier)
            .clickable(
                interactionSource = clickInteraction,
                indication = null,
                role = Role.Button,
                onClickLabel = "Search chats",
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        IosSearchNavIcon(
            tint = if (active) accentColor else inactiveColor,
            size = 23.dp,
        )
    }
}

