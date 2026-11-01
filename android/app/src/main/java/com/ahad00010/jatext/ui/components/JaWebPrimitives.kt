package com.ahad00010.jatext.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette

/**
 * 120 FPS tactile spring press-scale clickable modifier for buttons, tiles, and chips across JaText.
 */
fun Modifier.jaBouncyClick(
    enabled: Boolean = true,
    pressedScale: Float = 0.96f,
    onClick: () -> Unit,
): Modifier = composed {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed && enabled) pressedScale else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMediumLow,
        ),
        label = "jaPressScale",
    )
    this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
        }
        .clickable(
            interactionSource = interactionSource,
            indication = null,
            enabled = enabled,
            onClick = onClick,
        )
}

data class JaTabItem(
    val id: String,
    val label: String,
    val icon: ImageVector? = null,
    val badgeCount: Int = 0,
)

/**
 * Exact 1:1 recreation of `.tabs` / `.tabs button.active` from src/index.css with animated pill transitions.
 */
@Composable
fun JaWebTabs(
    tabs: List<JaTabItem>,
    selectedId: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalJaTextPalette.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(999.dp))
            .background(palette.bgTertiary)
            .border(1.dp, palette.border.copy(alpha = 0.5f), RoundedCornerShape(999.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        tabs.forEach { tab ->
            val active = tab.id == selectedId
            val pillBg by animateColorAsState(
                targetValue = if (active) palette.accent else Color.Transparent,
                animationSpec = tween(durationMillis = 200),
                label = "tabBg",
            )
            val fg by animateColorAsState(
                targetValue = if (active) palette.accentDark else palette.textSecondary,
                animationSpec = tween(durationMillis = 180),
                label = "tabFg",
            )
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(999.dp))
                    .background(pillBg)
                    .jaBouncyClick(pressedScale = 0.95f) { onSelect(tab.id) }
                    .padding(horizontal = 8.dp, vertical = 9.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (tab.icon != null) {
                    Icon(
                        imageVector = tab.icon,
                        contentDescription = null,
                        tint = fg,
                        modifier = Modifier.size(15.dp),
                    )
                    Spacer(Modifier.width(5.dp))
                }
                Text(
                    text = tab.label,
                    color = fg,
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (tab.badgeCount > 0) {
                    Spacer(Modifier.width(5.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(palette.danger)
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = if (tab.badgeCount > 99) "99+" else tab.badgeCount.toString(),
                            color = Color.White,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = com.ahad00010.jatext.ui.theme.SfProRoundedFontFamily,
                        )
                    }
                }
            }
        }
    }
}

/**
 * Exact 1:1 recreation of `label + input / textarea` and `.username-input` from src/index.css.
 */
@Composable
fun JaWebInput(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    inputModifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String = "",
    leadingPrefix: String? = null,
    leadingIcon: ImageVector? = null,
    trailingContent: (@Composable () -> Unit)? = null,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else 5,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
) {
    val palette = LocalJaTextPalette.current
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    val borderColor by animateColorAsState(
        targetValue = if (focused) palette.accent else palette.border,
        animationSpec = tween(durationMillis = 160),
        label = "inputBorder",
    )
    val shape = RoundedCornerShape(14.dp)

    Column(modifier = modifier.fillMaxWidth()) {
        if (!label.isNullOrBlank()) {
            Text(
                text = label,
                color = palette.textPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(6.dp))
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(palette.bgTertiary)
                .border(1.2.dp, borderColor, shape)
                .padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = if (singleLine) Alignment.CenterVertically else Alignment.Top,
        ) {
            if (leadingIcon != null) {
                Icon(
                    imageVector = leadingIcon,
                    contentDescription = null,
                    tint = palette.textSecondary,
                    modifier = Modifier.size(17.dp),
                )
                Spacer(Modifier.width(8.dp))
            }
            if (!leadingPrefix.isNullOrEmpty()) {
                Text(
                    text = leadingPrefix,
                    color = palette.textSecondary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.width(4.dp))
            }
            Box(modifier = Modifier.weight(1f)) {
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    singleLine = singleLine,
                    minLines = minLines,
                    maxLines = maxLines,
                    visualTransformation = visualTransformation,
                    keyboardOptions = keyboardOptions,
                    keyboardActions = keyboardActions,
                    interactionSource = interactionSource,
                    cursorBrush = SolidColor(if (palette.isDark) Color.White else Color.Black),
                    textStyle = TextStyle(
                        color = palette.textPrimary,
                        fontSize = 15.sp,
                        fontFamily = com.ahad00010.jatext.ui.theme.SfProTextFontFamily,
                    ),
                    modifier = inputModifier.fillMaxWidth(),
                    decorationBox = { inner ->
                        if (value.isEmpty() && placeholder.isNotEmpty()) {
                            Text(
                                text = placeholder,
                                color = palette.textSecondary.copy(alpha = 0.72f),
                                fontSize = 15.sp,
                                maxLines = if (singleLine) 1 else maxLines,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        inner()
                    },
                )
            }
            if (trailingContent != null) {
                Spacer(Modifier.width(6.dp))
                trailingContent()
            }
        }
    }
}

/**
 * Exact 1:1 recreation of `.primary-btn` from src/index.css with tactile spring scale.
 */
@Composable
fun JaWebPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    big: Boolean = false,
    leadingIcon: ImageVector? = null,
    leading: (@Composable RowScope.() -> Unit)? = null,
) {
    val palette = LocalJaTextPalette.current
    Row(
        modifier = modifier
            .alpha(if (enabled) 1f else 0.45f)
            .jaBouncyClick(enabled = enabled, pressedScale = 0.97f, onClick = onClick)
            .clip(RoundedCornerShape(999.dp))
            .background(palette.accent)
            .padding(
                horizontal = if (big) 24.dp else 20.dp,
                vertical = if (big) 14.dp else 11.dp,
            ),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leadingIcon != null) {
            Icon(
                imageVector = leadingIcon,
                contentDescription = null,
                tint = palette.accentDark,
                modifier = Modifier.size(if (big) 18.dp else 16.dp),
            )
            Spacer(Modifier.width(7.dp))
        }
        if (leading != null) {
            leading()
            Spacer(Modifier.width(8.dp))
        }
        Text(
            text = text,
            color = palette.accentDark,
            fontSize = if (big) 16.sp else 15.sp,
            fontWeight = FontWeight.ExtraBold,
        )
    }
}

/**
 * Exact 1:1 recreation of `.ghost-btn` from src/index.css with tactile spring scale.
 */
@Composable
fun JaWebGhostButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    leadingIcon: ImageVector? = null,
) {
    val palette = LocalJaTextPalette.current
    Row(
        modifier = modifier
            .alpha(if (enabled) 1f else 0.45f)
            .jaBouncyClick(enabled = enabled, pressedScale = 0.96f, onClick = onClick)
            .clip(RoundedCornerShape(999.dp))
            .background(palette.bgTertiary.copy(alpha = 0.35f))
            .border(1.dp, palette.border, RoundedCornerShape(999.dp))
            .padding(horizontal = 14.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leadingIcon != null) {
            Icon(
                imageVector = leadingIcon,
                contentDescription = null,
                tint = palette.textSecondary,
                modifier = Modifier.size(15.dp),
            )
            Spacer(Modifier.width(6.dp))
        }
        Text(
            text = text,
            color = palette.textSecondary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

/**
 * Exact 1:1 recreation of `.danger-btn` from src/index.css.
 */
@Composable
fun JaWebDangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val palette = LocalJaTextPalette.current
    Row(
        modifier = modifier
            .alpha(if (enabled) 1f else 0.45f)
            .jaBouncyClick(enabled = enabled, pressedScale = 0.96f, onClick = onClick)
            .clip(RoundedCornerShape(999.dp))
            .background(palette.danger.copy(alpha = 0.08f))
            .border(1.dp, palette.danger, RoundedCornerShape(999.dp))
            .padding(horizontal = 18.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = text,
            color = palette.danger,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

/**
 * Exact 1:1 recreation of `.icon-btn` from src/index.css (`38px` circle, `var(--panel-2)`, `1px solid var(--border)`).
 */
@Composable
fun JaWebIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 38.dp,
    iconSize: Dp = 18.dp,
    active: Boolean = false,
    badgeCount: Int = 0,
    containerColor: Color? = null,
    borderColor: Color? = null,
    iconTint: Color? = null,
) {
    val palette = LocalJaTextPalette.current
    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .size(size)
                .jaBouncyClick(pressedScale = 0.92f, onClick = onClick)
                .clip(CircleShape)
                .background(containerColor ?: palette.bgTertiary)
                .border(1.dp, borderColor ?: (if (active) palette.accent else palette.border), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = iconTint ?: (if (active) palette.accent else palette.textPrimary),
                modifier = Modifier.size(iconSize),
            )
        }
        if (badgeCount > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 3.dp, y = (-3).dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(palette.accent)
                    .padding(horizontal = 5.dp, vertical = 1.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = badgeCount.toString(),
                    color = palette.accentDark,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Black,
                    fontFamily = com.ahad00010.jatext.ui.theme.SfProRoundedFontFamily,
                )
            }
        }
    }
}

/**
 * Exact `.verified-badge` + `.official-badge` from src/index.css!
 */
@Composable
fun JaVerifiedBadge(size: Dp = 17.dp) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(Color(0xFF2888E8)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Rounded.Check,
            contentDescription = "Verified",
            tint = Color.White,
            modifier = Modifier.size(size * 0.68f),
        )
    }
}

@Composable
fun JaOfficialBadge(text: String = "OFFICIAL") {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Color(0xFF4ADE80))
            .padding(horizontal = 7.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text.uppercase(),
            color = Color(0xFF052E16),
            fontSize = 9.5.sp,
            fontWeight = FontWeight.Black,
            fontFamily = com.ahad00010.jatext.ui.theme.SfProRoundedFontFamily,
            letterSpacing = 0.4.sp,
        )
    }
}
