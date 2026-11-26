package com.ahad00010.jatext.ui.screens

import android.app.Activity
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import com.ahad00010.jatext.R
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.components.JaTabItem
import com.ahad00010.jatext.ui.components.JaWebGhostButton
import com.ahad00010.jatext.ui.components.JaWebIconButton
import com.ahad00010.jatext.ui.components.JaWebInput
import com.ahad00010.jatext.ui.components.JaWebPrimaryButton
import com.ahad00010.jatext.ui.components.JaWebTabs
import com.ahad00010.jatext.ui.theme.AVATAR_COLOR_SPECS
import com.ahad00010.jatext.ui.theme.JaTextPalette
import com.ahad00010.jatext.ui.theme.JaTextThemeManager
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Pure Native Startup Screen matching `.splash` in src/index.css:
 * shows official JaText logo, "Loading JaText…", and lock icon + "End-to-End Encrypted" underneath.
 */
@Composable
fun JaTextLoadingScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0B0B10)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(28.dp),
        ) {
            Image(
                painter = painterResource(id = R.drawable.jatext_logo_icon),
                contentDescription = "JaText Logo",
                modifier = Modifier.size(80.dp),
            )
            Spacer(Modifier.height(18.dp))
            CircularProgressIndicator(
                color = Color(0xFF9B6CFF),
                strokeWidth = 2.6.dp,
                modifier = Modifier.size(26.dp),
            )
            Spacer(Modifier.height(14.dp))
            Text(
                text = "Loading JaText…",
                color = Color(0xFFF2F2F7),
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Lock,
                    contentDescription = "Encrypted",
                    tint = Color(0xFF9B6CFF),
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(5.dp))
                Text(
                    text = "End-to-End Encrypted",
                    color = Color(0xFF9A9AAD),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

/**
 * Exact 1:1 recreation of src/components/LoginPage.tsx & `.login-*` in src/index.css!
 */
@Composable
fun NativeLoginScreen(
    vm: JaTextSessionViewModel,
    isAddingAnotherAccount: Boolean,
    onCancelAddAccount: () -> Unit,
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val scope = rememberCoroutineScope()
    val sessionState by vm.state.collectAsState()

    // LoginPage.tsx always uses the signature `:root` dark palette (#0b0b10 / #14141d / #1b1b26 / #262633 / #9b6cff)
    val loginPalette = remember {
        JaTextPalette(
            isDark = true,
            bgPrimary = Color(0xFF0B0B10),
            bgSecondary = Color(0xFF14141D),
            bgTertiary = Color(0xFF1B1B26),
            surface = Color(0xFF1B1B26),
            surfaceElevated = Color(0xFF242433),
            border = Color(0xFF262633),
            borderStrong = Color(0xFF3A3A4D),
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

    var authTab by remember { mutableStateOf("signin") } // "signin" | "signup"
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var totpCode by remember { mutableStateOf("") }
    var emailCode by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var legalDialogTab by remember { mutableStateOf<String?>(null) } // "terms" | "privacy" | null

    val googleBusy = sessionState.googleSignInInFlight
    val activeError = errorMsg?.takeIf { it.isNotBlank() } ?: sessionState.authError
    val savedAccounts = sessionState.accounts.filter { it.slotId != sessionState.slotId }

    CompositionLocalProvider(LocalJaTextPalette provides loginPalette) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(loginPalette.bgPrimary)
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                /* ==================== .login-hero ==================== */
                Column(
                    modifier = Modifier
                        .widthIn(max = 460.dp)
                        .fillMaxWidth()
                        .padding(bottom = 22.dp),
                    horizontalAlignment = Alignment.Start,
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.jatext_logo_full),
                        contentDescription = "JaText · JAMusic Coding and Research Corp",
                        contentScale = ContentScale.Fit,
                        alignment = Alignment.CenterStart,
                        modifier = Modifier
                            .fillMaxWidth(0.70f)
                            .widthIn(min = 215.dp, max = 265.dp)
                            .aspectRatio(1f),
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Text your people. Add friends by username, make your profile yours, and chat in real time.",
                        color = loginPalette.textSecondary,
                        fontSize = 16.5.sp,
                        lineHeight = 25.sp,
                    )
                    Spacer(Modifier.height(16.dp))
                    LoginHeroBullet(
                        icon = Icons.Rounded.ChatBubbleOutline,
                        text = "Real-time chats & attachments",
                        accent = loginPalette.accent,
                        textColor = loginPalette.textPrimary,
                    )
                    Spacer(Modifier.height(10.dp))
                    LoginHeroBullet(
                        icon = Icons.Rounded.Palette,
                        text = "Profile picture, banner & your own avatar color",
                        accent = loginPalette.accent,
                        textColor = loginPalette.textPrimary,
                    )
                    Spacer(Modifier.height(10.dp))
                    LoginHeroBullet(
                        icon = Icons.Rounded.Group,
                        text = "Friend requests: you only chat with people you accept",
                        accent = loginPalette.accent,
                        textColor = loginPalette.textPrimary,
                    )
                }

                /* ==================== .login-card ==================== */
                Column(
                    modifier = Modifier
                        .widthIn(max = 460.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(26.dp))
                        .background(loginPalette.bgSecondary)
                        .border(1.dp, loginPalette.border, RoundedCornerShape(26.dp))
                        .padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(15.dp),
                ) {
                    if (isAddingAnotherAccount) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            JaWebGhostButton(
                                text = "Back to active account",
                                leadingIcon = Icons.AutoMirrored.Rounded.ArrowBack,
                                onClick = onCancelAddAccount,
                            )
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(loginPalette.accentSoft)
                                    .padding(horizontal = 10.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.SwapHoriz,
                                    contentDescription = null,
                                    tint = loginPalette.accent,
                                    modifier = Modifier.size(14.dp),
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = "Adding account",
                                    color = loginPalette.accent,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                    }

                    if (savedAccounts.isNotEmpty()) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(loginPalette.bgTertiary)
                                .border(1.dp, loginPalette.border, RoundedCornerShape(16.dp))
                                .padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "Saved accounts on this device",
                                    color = loginPalette.textPrimary,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = "Tap to switch",
                                    color = loginPalette.textSecondary,
                                    fontSize = 12.sp,
                                )
                            }
                            savedAccounts.forEach { slot ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(loginPalette.bgSecondary)
                                        .border(1.dp, loginPalette.border, RoundedCornerShape(12.dp))
                                        .clickable { vm.switchToAccountSlot(slot.slotId) }
                                        .padding(horizontal = 10.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    JaAvatar(
                                        avatarUrl = slot.avatarUrl,
                                        displayName = slot.displayName.ifBlank { slot.username },
                                        avatarColor = slot.avatarColor,
                                        size = 34.dp,
                                        ringWidth = 2.5.dp,
                                    )
                                    Spacer(Modifier.width(10.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = slot.displayName.ifBlank { slot.username },
                                            color = loginPalette.textPrimary,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        Text(
                                            text = if (slot.username.isNotBlank()) "@${slot.username}" else "Saved account",
                                            color = loginPalette.textSecondary,
                                            fontSize = 12.sp,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                            }
                        }
                    }

                    if (!sessionState.pendingEmailVerifyChallengeToken.isNullOrBlank()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            JaWebGhostButton(
                                text = "Back",
                                leadingIcon = Icons.AutoMirrored.Rounded.ArrowBack,
                                onClick = {
                                    emailCode = ""
                                    errorMsg = null
                                    vm.cancelEmailVerification()
                                },
                            )
                        }
                        Text(
                            text = "Confirm your email",
                            color = loginPalette.textPrimary,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = com.ahad00010.jatext.ui.theme.SfProDisplayFontFamily,
                        )
                        val masked = sessionState.pendingEmailVerifyMasked
                        Text(
                            text = if (masked.isNotBlank()) {
                                "We sent a 6-digit code to $masked. JaText stays locked until you enter it."
                            } else {
                                "We sent a 6-digit code to your email. JaText stays locked until you enter it."
                            },
                            color = loginPalette.textSecondary,
                            fontSize = 14.5.sp,
                            lineHeight = 20.sp,
                        )
                        JaWebInput(
                            value = emailCode,
                            onValueChange = { next ->
                                emailCode = next.filter { ch -> ch.isDigit() }.take(6)
                                errorMsg = null
                                vm.clearAuthError()
                            },
                            label = "Verification code",
                            placeholder = "123456",
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Ascii,
                                imeAction = ImeAction.Done,
                            ),
                        )
                        if (!activeError.isNullOrBlank()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color(0x1FEF4444))
                                    .border(1.dp, Color(0x80EF4444), RoundedCornerShape(12.dp))
                                    .padding(horizontal = 13.dp, vertical = 10.dp)
                            ) {
                                Text(
                                    text = activeError,
                                    color = Color(0xFFFCA5A5),
                                    fontSize = 13.5.sp,
                                    lineHeight = 19.sp,
                                )
                            }
                        }
                        JaWebPrimaryButton(
                            text = if (busy) "Verifying..." else "Verify & continue",
                            enabled = !busy && emailCode.trim().length >= 6,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                busy = true
                                errorMsg = null
                                scope.launch {
                                    try {
                                        vm.verifyEmailCode(emailCode)
                                        emailCode = ""
                                    } catch (e: Throwable) {
                                        errorMsg = e.message ?: "That code did not work."
                                    } finally {
                                        busy = false
                                    }
                                }
                            },
                        )
                        // The wait the server asked for, counted down locally so the button
                        // cannot be hammered; a too-early tap still answers 429 with the
                        // real number of seconds left.
                        var resendIn by remember(
                            sessionState.pendingEmailVerifyChallengeToken,
                            sessionState.pendingEmailVerifyWaitSec,
                        ) {
                            mutableStateOf(sessionState.pendingEmailVerifyWaitSec)
                        }
                        LaunchedEffect(resendIn) {
                            if (resendIn > 0) {
                                delay(1000)
                                resendIn -= 1
                            }
                        }
                        Text(
                            text = "Not there after a minute? Check your spam or promotions folder.",
                            color = loginPalette.textSecondary,
                            fontSize = 12.5.sp,
                            lineHeight = 17.sp,
                        )
                        JaWebGhostButton(
                            text = if (resendIn > 0) "Send a new code (${resendIn}s)" else "Send a new code",
                            enabled = !busy && resendIn <= 0,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                busy = true
                                errorMsg = null
                                scope.launch {
                                    try {
                                        vm.resendEmailVerificationCode()
                                    } catch (e: Throwable) {
                                        errorMsg = e.message ?: "Could not send another code."
                                    } finally {
                                        busy = false
                                    }
                                }
                            },
                        )
                    } else if (!sessionState.pendingTwoFactorChallengeToken.isNullOrBlank()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            JaWebGhostButton(
                                text = "Back",
                                leadingIcon = Icons.AutoMirrored.Rounded.ArrowBack,
                                onClick = {
                                    totpCode = ""
                                    errorMsg = null
                                    vm.cancelTwoFactorChallenge()
                                },
                            )
                        }
                        Text(
                            text = "2FA",
                            color = loginPalette.textPrimary,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = com.ahad00010.jatext.ui.theme.SfProDisplayFontFamily,
                        )
                        Text(
                            text = "Enter your authentication code",
                            color = loginPalette.textSecondary,
                            fontSize = 14.5.sp,
                        )
                        JaWebInput(
                            value = totpCode,
                            onValueChange = {
                                totpCode = it
                                errorMsg = null
                                vm.clearAuthError()
                            },
                            label = "Authentication code",
                            placeholder = "000000",
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Ascii,
                                imeAction = ImeAction.Done,
                            ),
                        )
                        if (!activeError.isNullOrBlank()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color(0x1FEF4444))
                                    .border(1.dp, Color(0x80EF4444), RoundedCornerShape(12.dp))
                                    .padding(horizontal = 13.dp, vertical = 10.dp)
                            ) {
                                Text(
                                    text = activeError,
                                    color = Color(0xFFFCA5A5),
                                    fontSize = 13.5.sp,
                                    lineHeight = 19.sp,
                                )
                            }
                        }
                        JaWebPrimaryButton(
                            text = if (busy) "Verifying..." else "Verify",
                            enabled = !busy && totpCode.trim().length >= 6,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                busy = true
                                errorMsg = null
                                scope.launch {
                                    try {
                                        vm.verifyTwoFactorLogin(totpCode)
                                        totpCode = ""
                                    } catch (e: Throwable) {
                                        errorMsg = e.message ?: "Invalid authentication code."
                                    } finally {
                                        busy = false
                                    }
                                }
                            },
                        )
                    } else {

                    Text(
                        text = when {
                            isAddingAnotherAccount && authTab == "signin" -> "Add another account"
                            isAddingAnotherAccount -> "Create another account"
                            authTab == "signin" -> "Welcome back"
                            else -> "Create your account"
                        },
                        color = loginPalette.textPrimary,
                        fontSize = 23.sp,
                        fontWeight = FontWeight.ExtraBold,
                        fontFamily = com.ahad00010.jatext.ui.theme.SfProDisplayFontFamily,
                    )

                    /* ==================== Passkey Sign-In Pill ==================== */
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(999.dp))
                            .background(loginPalette.bgTertiary)
                            .border(1.dp, loginPalette.borderStrong, RoundedCornerShape(999.dp))
                            .clickable(enabled = !googleBusy && !busy && activity != null) {
                                val act = activity ?: return@clickable
                                errorMsg = null
                                vm.clearAuthError()
                                vm.startPasskeySignIn(act, email.takeIf { it.isNotBlank() })
                            }
                            .padding(horizontal = 20.dp, vertical = 11.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Key,
                            contentDescription = "Passkey",
                            tint = loginPalette.accent,
                            modifier = Modifier.size(19.dp),
                        )
                        Spacer(Modifier.width(9.dp))
                        Text(
                            text = "Sign in with Passkey",
                            color = loginPalette.textPrimary,
                            fontSize = 14.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }

                    /* ==================== .divider ("or") ==================== */
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        HorizontalDivider(color = loginPalette.border, modifier = Modifier.weight(1f))
                        Text(
                            text = "   or   ",
                            color = loginPalette.textSecondary,
                            fontSize = 13.sp,
                        )
                        HorizontalDivider(color = loginPalette.border, modifier = Modifier.weight(1f))
                    }

                    /* ==================== .tabs (Sign in | Sign up) ==================== */
                    JaWebTabs(
                        tabs = listOf(
                            JaTabItem("signin", "Sign in"),
                            JaTabItem("signup", "Sign up"),
                        ),
                        selectedId = authTab,
                        onSelect = {
                            authTab = it
                            errorMsg = null
                            vm.clearAuthError()
                        },
                    )

                    /* ==================== Email & Password Form ==================== */
                    JaWebInput(
                        value = email,
                        onValueChange = {
                            email = it
                            errorMsg = null
                            vm.clearAuthError()
                        },
                        label = "Email",
                        placeholder = "you@example.com",
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next,
                        ),
                    )

                    JaWebInput(
                        value = password,
                        onValueChange = {
                            password = it
                            errorMsg = null
                            vm.clearAuthError()
                        },
                        label = "Password",
                        placeholder = "••••••••",
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done,
                        ),
                        trailingContent = {
                            Icon(
                                imageVector = if (showPassword) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                                contentDescription = if (showPassword) "Hide password" else "Show password",
                                tint = loginPalette.textSecondary,
                                modifier = Modifier
                                    .size(20.dp)
                                    .clickable { showPassword = !showPassword },
                            )
                        },
                    )

                    if (!activeError.isNullOrBlank()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color(0x1FEF4444))
                                .border(1.dp, Color(0x80EF4444), RoundedCornerShape(12.dp))
                                .padding(horizontal = 13.dp, vertical = 10.dp)
                        ) {
                            Text(
                                text = activeError,
                                color = Color(0xFFFCA5A5),
                                fontSize = 13.5.sp,
                                lineHeight = 19.sp,
                            )
                        }
                    }

                    JaWebPrimaryButton(
                        text = when {
                            busy -> "Please wait…"
                            authTab == "signin" -> "Sign in"
                            else -> "Create account"
                        },
                        enabled = !busy && !googleBusy,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            if (email.isBlank() || password.isBlank()) {
                                errorMsg = "Please enter both your email and password."
                                return@JaWebPrimaryButton
                            }
                            busy = true
                            errorMsg = null
                            scope.launch {
                                try {
                                    if (authTab == "signup") {
                                        vm.signUpEmail(email, password)
                                    } else {
                                        vm.signInEmail(email, password)
                                    }
                                } catch (e: Throwable) {
                                    errorMsg = e.message ?: "Authentication failed"
                                } finally {
                                    busy = false
                                }
                            }
                        },
                    )
                    } // end normal login vs 2FA challenge

                    /* ==================== .login-legal-footer ==================== */
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = "By continuing, you agree to JaText's",
                            color = loginPalette.textSecondary,
                            fontSize = 12.5.sp,
                        )
                        Spacer(Modifier.height(3.dp))
                        Row(
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "Terms of Service",
                                color = loginPalette.accent,
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.clickable { legalDialogTab = "terms" },
                            )
                            Text(
                                text = " · ",
                                color = loginPalette.textSecondary,
                                fontSize = 12.5.sp,
                            )
                            Text(
                                text = "Privacy Policy",
                                color = loginPalette.accent,
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.clickable { legalDialogTab = "privacy" },
                            )
                        }
                    }
                }
            }

            legalDialogTab?.let { tab ->
                JaTextLegalModalDialog(
                    initialTab = tab,
                    onDismiss = { legalDialogTab = null },
                )
            }
        }
    }
}

@Composable
private fun LoginHeroBullet(
    icon: ImageVector,
    text: String,
    accent: Color,
    textColor: Color,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = accent,
            modifier = Modifier.size(17.dp),
        )
        Spacer(Modifier.width(9.dp))
        Text(
            text = text,
            color = textColor,
            fontSize = 14.5.sp,
        )
    }
}

/**
 * 1:1 recreation of `src/components/LegalModal.tsx` (used on both Login and Settings -> Legal Policies & Privacy).
 */
@Composable
fun JaTextLegalModalDialog(
    initialTab: String = "terms",
    onDismiss: () -> Unit,
) {
    val palette = LocalJaTextPalette.current
    var tab by remember(initialTab) { mutableStateOf(if (initialTab == "privacy") "privacy" else "terms") }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(24.dp))
                .background(palette.bgSecondary)
                .border(1.dp, palette.border, RoundedCornerShape(24.dp))
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                JaWebTabs(
                    tabs = listOf(
                        JaTabItem("terms", "Terms of Service", icon = Icons.Rounded.Description),
                        JaTabItem("privacy", "Privacy Policy", icon = Icons.Rounded.Lock),
                    ),
                    selectedId = tab,
                    onSelect = { tab = it },
                    modifier = Modifier.weight(1f),
                )
                JaWebIconButton(
                    icon = Icons.Rounded.Close,
                    contentDescription = "Close legal document",
                    size = 36.dp,
                    iconSize = 16.dp,
                    onClick = onDismiss,
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 240.dp, max = 420.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (tab == "terms") {
                    Text(
                        text = "Terms of Service",
                        color = palette.textPrimary,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                        fontFamily = com.ahad00010.jatext.ui.theme.SfProDisplayFontFamily,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("For ", color = palette.textSecondary, fontSize = 12.5.sp)
                        Text("JaText", color = palette.accent, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                        Text(" · Effective date: 25 October 2026", color = palette.textSecondary, fontSize = 12.5.sp)
                    }
                    Text(
                        text = "These terms govern your use of JaText, a small independent messaging app. By creating an account or using JaText, you agree to these terms and to our Privacy Policy.",
                        color = palette.textSecondary,
                        fontSize = 13.5.sp,
                        lineHeight = 20.sp,
                    )
                    Text(
                        text = "Read Privacy Policy",
                        color = palette.accent,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable { tab = "privacy" },
                    )

                    LegalSectionHeading("1. Your account", palette)
                    LegalBullet("You must provide accurate information when registering and keep your sign-in credentials secure.", palette)
                    LegalBullet("You are responsible for all activity that occurs under your account.", palette)
                    LegalBullet("You must be at least 13 years old, or the minimum age required to hold an account in your country.", palette)
                    LegalBullet("Your username can be changed at most once every 14 days, as shown in the app.", palette)

                    LegalSectionHeading("2. Acceptable use", palette)
                    Text("When using JaText, you agree not to:", color = palette.textSecondary, fontSize = 13.5.sp)
                    LegalBullet("Harass, threaten, exploit, or harm other users.", palette)
                    LegalBullet("Send spam, scams, malware, or other harmful content.", palette)
                    LegalBullet("Upload content that is illegal, or that you do not have the right to share.", palette)
                    LegalBullet("Impersonate another person in a misleading way.", palette)
                    LegalBullet("Attempt to break, overload, reverse-engineer, or gain unauthorised access to the service or other users' accounts.", palette)
                    LegalBullet("Use the service for any unlawful purpose.", palette)

                    LegalSectionHeading("3. Your content", palette)
                    LegalBody(
                        "You keep ownership of the profile information, messages, and files you submit (\"your content\"). You give JaText permission to store, transmit, and display your content only as needed to operate the service (for example, showing your profile to other users and delivering your messages to the people you send them to). You are responsible for your content.",
                        palette
                    )

                    LegalSectionHeading("4. Availability", palette)
                    LegalBody(
                        "JaText is a small independent project provided \"as is\" and \"as available,\" without warranties of any kind. The service may change, break, lose data, or be discontinued at any time. Do not rely on JaText as your only copy of important information.",
                        palette
                    )

                    LegalSectionHeading("5. Suspension and termination", palette)
                    LegalBody(
                        "We may suspend or remove accounts that violate these terms. You may stop using JaText at any time and may request deletion of your account using the contact method described in the Privacy Policy.",
                        palette
                    )

                    LegalSectionHeading("6. Liability", palette)
                    LegalBody(
                        "To the maximum extent allowed by law, JaText and its developer are not liable for any indirect, incidental, or consequential damages arising from your use of the service.",
                        palette
                    )

                    LegalSectionHeading("7. Changes to these terms", palette)
                    LegalBody(
                        "If these terms change, the updated version will be posted with a new effective date. Continuing to use JaText after a change means you accept the updated terms.",
                        palette
                    )

                    LegalSectionHeading("8. Contact", palette)
                    LegalBody(
                        "Questions about these terms can be sent to the developer at the user support email shown on the Google sign-in consent screen for JaText.",
                        palette
                    )
                } else {
                    Text(
                        text = "Privacy Policy",
                        color = palette.textPrimary,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.ExtraBold,
                        fontFamily = com.ahad00010.jatext.ui.theme.SfProDisplayFontFamily,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("For ", color = palette.textSecondary, fontSize = 12.5.sp)
                        Text("JaText", color = palette.accent, fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                        Text(" · Effective date: 25 October 2026", color = palette.textSecondary, fontSize = 12.5.sp)
                    }
                    LegalBody(
                        "JaText is a small, independent messaging app that lets people create an account, build a profile, add friends, and exchange messages and attachments. This policy explains what information JaText collects, why, and what happens to it.",
                        palette
                    )

                    LegalSectionHeading("1. Information we collect", palette)
                    LegalBullet("Account information: When you register with an email address and password, we store your email address and encrypted authentication credentials; your password is never stored in plain text or visible to other users.", palette)
                    LegalBullet("Google sign-in information: If you choose \"Continue with Google,\" Google shares your name, email address, and profile picture with us so we can create and sign you into your JaText account. We do not receive your Google password or access Gmail, Drive, or contacts.", palette)
                    LegalBullet("Profile information: Display name, username, biography, pronouns, profile picture, banner image, and avatar colour you choose to set.", palette)
                    LegalBullet("Messages and attachments: Direct messages, group messages, voice notes, and attachments are end-to-end encrypted on your device before transmission and stored so they can be delivered to participants.", palette)
                    LegalBullet("Technical information: Hosting and backend providers may record standard technical data (such as IP address and request logs) to run and secure the service.", palette)

                    LegalSectionHeading("2. How we use your information", palette)
                    LegalBullet("To create and operate your account and let you sign in.", palette)
                    LegalBullet("To display your profile to other users of JaText.", palette)
                    LegalBullet("To deliver your messages and attachments to your friends and groups.", palette)
                    LegalBullet("To keep the service running, secure, and free of abuse.", palette)
                    LegalBody(
                        "We do not sell your personal information, use your messages for advertising, or show third-party ads.",
                        palette
                    )

                    LegalSectionHeading("3. Google user data", palette)
                    LegalBody(
                        "JaText's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
                        palette
                    )

                    LegalSectionHeading("4. Service providers", palette)
                    LegalBullet("Turso: hosts encrypted database, authentication, and media chunk storage.", palette)
                    LegalBullet("Vercel: hosts the JaText website and serverless API routes.", palette)
                    LegalBullet("Google: provides optional sign-in and push notification delivery.", palette)

                    LegalSectionHeading("5. Data retention and deletion", palette)
                    LegalBody(
                        "Your account data, profile, and messages are kept for as long as your account exists so the service can function. Contact us via the support email shown on the Google sign-in consent screen to request account deletion.",
                        palette
                    )

                    LegalSectionHeading("6. Children", palette)
                    LegalBody(
                        "JaText is not directed at children under 13 (or the minimum age required in your country).",
                        palette
                    )

                    LegalSectionHeading("7. Contact", palette)
                    LegalBody(
                        "For privacy questions or deletion requests, contact the developer at the user support email shown on the Google sign-in consent screen for JaText.",
                        palette
                    )
                }
            }

            JaWebPrimaryButton(
                text = "Done",
                modifier = Modifier.fillMaxWidth(),
                onClick = onDismiss,
            )
        }
    }
}

@Composable
private fun LegalSectionHeading(title: String, palette: JaTextPalette) {
    Text(
        text = title,
        color = palette.textPrimary,
        fontWeight = FontWeight.Bold,
        fontSize = 14.5.sp,
        modifier = Modifier.padding(top = 4.dp),
    )
}

@Composable
private fun LegalBody(text: String, palette: JaTextPalette) {
    Text(
        text = text,
        color = palette.textSecondary,
        fontSize = 13.5.sp,
        lineHeight = 20.sp,
    )
}

@Composable
private fun LegalBullet(text: String, palette: JaTextPalette) {
    Row(verticalAlignment = Alignment.Top) {
        Text(
            text = "•  ",
            color = palette.accent,
            fontSize = 13.5.sp,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = text,
            color = palette.textSecondary,
            fontSize = 13.5.sp,
            lineHeight = 19.5.sp,
            modifier = Modifier.weight(1f),
        )
    }
}

/**
 * Exact 1:1 recreation of src/components/Onboarding.tsx + ProfileForm.tsx (`.onboarding-page`, `.pf-preview`, `.color-grid`).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileSetupOnboardingScreen(
    me: JaUser,
    vm: JaTextSessionViewModel,
) {
    val palette = LocalJaTextPalette.current
    val scope = rememberCoroutineScope()

    var displayName by remember(me.id) { mutableStateOf(me.displayName) }
    var username by remember(me.id) { mutableStateOf(me.username) }
    var pronouns by remember(me.id) { mutableStateOf(me.pronouns) }
    var bio by remember(me.id) { mutableStateOf(me.bio) }
    var avatarColor by remember(me.id) {
        mutableStateOf(JaTextThemeManager.stripProfileMetaFromColorId(me.avatarColor))
    }
    var pickedAvatarUri by remember { mutableStateOf<Uri?>(null) }
    var pickedBannerUri by remember { mutableStateOf<Uri?>(null) }
    var usernameHint by remember { mutableStateOf<String?>(null) }
    var usernameAvailable by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }

    val avatarLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) pickedAvatarUri = uri
    }
    val bannerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) pickedBannerUri = uri
    }

    LaunchedEffect(username) {
        val clean = username.trim().lowercase()
        if (clean == me.username || clean.length < 3) {
            usernameHint = null
            return@LaunchedEffect
        }
        delay(300L)
        val (avail, msg) = vm.checkUsernameAvailability(clean)
        usernameAvailable = avail
        usernameHint = msg ?: if (avail) "@$clean is available!" else "@$clean is already taken."
    }

    val colorSpec = JaTextThemeManager.avatarColorSpec(avatarColor)
    val bannerPreview = pickedBannerUri?.toString() ?: me.bannerUrl

    Column(
        modifier = Modifier
            .fillMaxSize()
            .then(
                if (palette.rootGradientBrush != null) Modifier.background(palette.rootGradientBrush)
                else Modifier.background(palette.bgPrimary)
            )
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 600.dp)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "Make it yours",
                color = palette.textPrimary,
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                fontFamily = com.ahad00010.jatext.ui.theme.SfProDisplayFontFamily,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = "Pick your @username, profile picture, banner, and avatar outline color.",
                color = palette.textSecondary,
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )

            /* ==================== .pf-preview (2.5dp --profile-outline!) ==================== */
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(22.dp))
                    .background(palette.bgSecondary)
                    .border(2.5.dp, colorSpec.ringColor, RoundedCornerShape(22.dp))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(128.dp)
                        .clickable { bannerLauncher.launch("image/*") },
                    contentAlignment = Alignment.Center,
                ) {
                    if (!bannerPreview.isNullOrBlank()) {
                        AsyncImage(
                            model = bannerPreview,
                            contentDescription = "Profile banner",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(
                                    Brush.linearGradient(
                                        colors = colorSpec.gradientStops,
                                        start = Offset.Zero,
                                        end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
                                    )
                                )
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(Color(0x8C000000))
                            .padding(horizontal = 14.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = "Tap to change banner",
                            color = Color.White,
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .height(2.5.dp)
                            .background(colorSpec.ringColor)
                    )
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .offset(y = (-34).dp)
                            .clickable { avatarLauncher.launch("image/*") },
                    ) {
                        JaAvatar(
                            avatarUrl = pickedAvatarUri?.toString() ?: me.avatarUrl,
                            displayName = displayName.ifBlank { username.ifBlank { "?" } },
                            avatarColor = avatarColor,
                            size = 82.dp,
                            ringWidth = 3.5.dp,
                        )
                        Box(
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .size(30.dp)
                                .clip(CircleShape)
                                .background(palette.bgTertiary)
                                .border(1.dp, palette.border, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.CameraAlt,
                                contentDescription = "Upload avatar",
                                tint = palette.textPrimary,
                                modifier = Modifier.size(15.dp),
                            )
                        }
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = displayName.ifBlank { "Your Name" },
                            color = palette.textPrimary,
                            fontSize = 19.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        Text(
                            text = buildString {
                                append("@")
                                append(username.ifBlank { "username" })
                                if (pronouns.isNotBlank()) {
                                    append(" · ")
                                    append(pronouns)
                                }
                            },
                            color = palette.textSecondary,
                            fontSize = 13.5.sp,
                        )
                        if (bio.isNotBlank()) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = bio,
                                color = palette.textPrimary,
                                fontSize = 13.5.sp,
                            )
                        }
                    }
                }
            }

            JaWebInput(
                value = displayName,
                onValueChange = { displayName = it },
                label = "Display name",
                placeholder = "How friends see you",
            )

            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                JaWebInput(
                    value = username,
                    onValueChange = {
                        username = it.lowercase().filter { ch -> ch.isLetterOrDigit() || ch == '.' || ch == '_' }.take(20)
                    },
                    label = "Username",
                    leadingPrefix = "@",
                    placeholder = "your-username",
                )
                if (!usernameHint.isNullOrBlank()) {
                    Text(
                        text = usernameHint!!,
                        color = if (usernameAvailable) palette.success else Color(0xFFFCA5A5),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            JaWebInput(
                value = pronouns,
                onValueChange = { pronouns = it.take(32) },
                label = "Pronouns (optional)",
                placeholder = "they/them, he/him, she/her…",
            )

            JaWebInput(
                value = bio,
                onValueChange = { bio = it.take(180) },
                label = "Bio (optional)",
                placeholder = "Tell people a little about yourself…",
                singleLine = false,
                minLines = 2,
                maxLines = 4,
            )

            /* ==================== .color-fieldset / .color-grid ==================== */
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .border(1.dp, palette.border, RoundedCornerShape(16.dp))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "Avatar & profile outline color",
                    color = palette.textPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    maxItemsInEachRow = 3,
                ) {
                    AVATAR_COLOR_SPECS.forEach { spec ->
                        val selected = avatarColor == spec.id
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(14.dp))
                                .background(if (selected) palette.accentSoft else palette.bgTertiary)
                                .border(
                                    width = 2.dp,
                                    color = if (selected) palette.accent else palette.border,
                                    shape = RoundedCornerShape(14.dp),
                                )
                                .clickable { avatarColor = spec.id }
                                .padding(horizontal = 8.dp, vertical = 12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(
                                        Brush.linearGradient(
                                            colors = spec.gradientStops,
                                            start = Offset.Zero,
                                            end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
                                        )
                                    )
                                    .border(2.dp, spec.ringColor, CircleShape)
                            )
                            Text(
                                text = spec.name,
                                color = palette.textPrimary,
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center,
                            )
                            if (!spec.note.isNullOrBlank()) {
                                Text(
                                    text = spec.note,
                                    color = palette.textSecondary,
                                    fontSize = 10.5.sp,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                    }
                }
            }

            JaWebPrimaryButton(
                text = if (saving) "Saving…" else "Save & start chatting",
                big = true,
                enabled = !saving && username.length >= 3 && usernameAvailable,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    saving = true
                    scope.launch {
                        try {
                            vm.saveProfile(
                                displayName = displayName.ifBlank { username },
                                username = username,
                                bio = bio,
                                pronouns = pronouns,
                                avatarColor = avatarColor,
                                avatarUri = pickedAvatarUri,
                                bannerUri = pickedBannerUri,
                            )
                        } catch (e: Throwable) {
                            vm.showToast(e.message ?: "Failed to save profile")
                        } finally {
                            saving = false
                        }
                    }
                },
            )

            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                JaWebGhostButton(
                    text = "Sign out",
                    onClick = { vm.signOutCurrentAccount() },
                )
            }
        }
    }
}
