package com.ahad00010.jatext.ui.screens

import android.app.Activity
import android.content.Intent
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
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
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahad00010.jatext.R
import com.ahad00010.jatext.auth.GoogleSignInCancelledException
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.state.JaTextSessionViewModel
import com.ahad00010.jatext.ui.components.JaAvatar
import com.ahad00010.jatext.ui.icons.GoogleBrandVectorIcon
import com.ahad00010.jatext.ui.theme.JaTextThemeManager
import com.ahad00010.jatext.ui.theme.LocalJaTextPalette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Pure Native Startup Screen showing official JaText logo, "Loading JaText…",
 * and lock vector icon + "End-to-End Encrypted" right underneath.
 */
@Composable
fun JaTextLoadingScreen() {
    val palette = LocalJaTextPalette.current
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0B0C0E)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(28.dp),
        ) {
            Image(
                painter = painterResource(id = R.drawable.jatext_logo_icon),
                contentDescription = "JaText Logo",
                modifier = Modifier
                    .size(76.dp)
                    .clip(RoundedCornerShape(20.dp)),
            )
            Spacer(Modifier.height(20.dp))
            CircularProgressIndicator(
                color = palette.accent,
                strokeWidth = 2.6.dp,
                modifier = Modifier.size(28.dp),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = "Loading JaText…",
                color = Color(0xFFF3F4F6),
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Lock,
                    contentDescription = "Encrypted",
                    tint = Color(0xFF10B981),
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(5.dp))
                Text(
                    text = "End-to-End Encrypted",
                    color = Color(0xFF9CA3AF),
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

/**
 * Scrollable, responsive, 100% pure-native Login & Sign-Up Screen matching LoginPage.tsx,
 * featuring in-app Google Sign-In via Android Credential Manager (zero Chrome redirect!).
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

    var isSignUp by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    val googleBusy = sessionState.googleSignInInFlight
    val activeError = errorMsg?.takeIf { it.isNotBlank() } ?: sessionState.authError

    val scrollState = rememberScrollState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF0A0D10), Color(0xFF0F1419), Color(0xFF0A0C0F))
                )
            )
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 22.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = 420.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(24.dp))
                    .background(Color(0xFF15181F))
                    .border(1.dp, Color(0x22FFFFFF), RoundedCornerShape(24.dp))
                    .padding(horizontal = 24.dp, vertical = 28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (isAddingAnotherAccount) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(Color(0xFF202530))
                                .clickable { onCancelAddAccount() }
                                .padding(horizontal = 12.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                                contentDescription = "Back",
                                tint = Color(0xFFE5E7EB),
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = "Back to active account",
                                color = Color(0xFFE5E7EB),
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }

                Image(
                    painter = painterResource(id = R.drawable.jatext_logo_icon),
                    contentDescription = "JaText",
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(16.dp)),
                )
                Spacer(Modifier.height(14.dp))
                Text(
                    text = if (isSignUp) "Create your JaText account" else "Welcome back to JaText",
                    color = Color.White,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = if (isSignUp) {
                        "Fast, private, end-to-end encrypted messaging across web and Android."
                    } else {
                        "Sign in to sync your encrypted chats, groups, and custom themes."
                    },
                    color = Color(0xFF9CA3AF),
                    fontSize = 13.5.sp,
                    textAlign = TextAlign.Center,
                    lineHeight = 19.sp,
                )

                Spacer(Modifier.height(22.dp))

                // In-App Google Sign-In Button (Credential Manager + 82%-height In-App OAuth Sheet!)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color.White)
                        .clickable(enabled = !googleBusy && !busy && activity != null) {
                            val act = activity ?: return@clickable
                            errorMsg = null
                            vm.startGoogleSignIn(act)
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    if (googleBusy) {
                        CircularProgressIndicator(
                            color = Color(0xFF111827),
                            strokeWidth = 2.2.dp,
                            modifier = Modifier.size(20.dp),
                        )
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            GoogleBrandVectorIcon(size = 20.dp)
                            Spacer(Modifier.width(10.dp))
                            Text(
                                text = "Continue with Google",
                                color = Color(0xFF111827),
                                fontSize = 14.5.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }

                Spacer(Modifier.height(18.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    HorizontalDivider(color = Color(0x22FFFFFF), modifier = Modifier.weight(1f))
                    Text(
                        text = "  OR CONTINUE WITH EMAIL  ",
                        color = Color(0xFF6B7280),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    HorizontalDivider(color = Color(0x22FFFFFF), modifier = Modifier.weight(1f))
                }

                Spacer(Modifier.height(16.dp))

                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it; errorMsg = null; vm.clearAuthError() },
                    label = { Text("Email address") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Next,
                    ),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Color(0xFF10B981),
                        unfocusedBorderColor = Color(0x33FFFFFF),
                        focusedLabelColor = Color(0xFF10B981),
                        unfocusedLabelColor = Color(0xFF9CA3AF),
                    ),
                    shape = RoundedCornerShape(13.dp),
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(12.dp))

                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it; errorMsg = null; vm.clearAuthError() },
                    label = { Text(if (isSignUp) "Password (8+ characters)" else "Password") },
                    singleLine = true,
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    trailingIcon = {
                        IconButton(onClick = { showPassword = !showPassword }) {
                            Icon(
                                imageVector = if (showPassword) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                                contentDescription = if (showPassword) "Hide password" else "Show password",
                                tint = Color(0xFF9CA3AF),
                            )
                        }
                    },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedBorderColor = Color(0xFF10B981),
                        unfocusedBorderColor = Color(0x33FFFFFF),
                        focusedLabelColor = Color(0xFF10B981),
                        unfocusedLabelColor = Color(0xFF9CA3AF),
                    ),
                    shape = RoundedCornerShape(13.dp),
                    modifier = Modifier.fillMaxWidth(),
                )

                if (!activeError.isNullOrBlank()) {
                    Spacer(Modifier.height(12.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(11.dp))
                            .background(Color(0x29EF4444))
                            .border(1.dp, Color(0x55EF4444), RoundedCornerShape(11.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp)
                    ) {
                        Text(
                            text = activeError,
                            color = Color(0xFFFCA5A5),
                            fontSize = 12.5.sp,
                            lineHeight = 17.sp,
                        )
                    }
                }

                Spacer(Modifier.height(18.dp))

                Button(
                    onClick = {
                        if (email.isBlank() || password.isBlank()) {
                            errorMsg = "Please enter both your email and password."
                            return@Button
                        }
                        busy = true
                        errorMsg = null
                        scope.launch {
                            try {
                                if (isSignUp) {
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
                    enabled = !busy && !googleBusy,
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF10B981),
                        contentColor = Color.White,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                ) {
                    if (busy) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.2.dp,
                            modifier = Modifier.size(20.dp),
                        )
                    } else {
                        Text(
                            text = if (isSignUp) "Create Account" else "Sign In",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = if (isSignUp) "Already have an account? " else "New to JaText? ",
                        color = Color(0xFF9CA3AF),
                        fontSize = 13.5.sp,
                    )
                    Text(
                        text = if (isSignUp) "Sign in" else "Create an account",
                        color = Color(0xFF10B981),
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.clickable {
                            isSignUp = !isSignUp
                            errorMsg = null
                        },
                    )
                }

                Spacer(Modifier.height(18.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Rounded.Lock,
                        contentDescription = null,
                        tint = Color(0xFF10B981),
                        modifier = Modifier.size(13.dp),
                    )
                    Spacer(Modifier.width(5.dp))
                    Text(
                        text = "Protected by P-256 End-to-End Encryption",
                        color = Color(0xFF6B7280),
                        fontSize = 11.5.sp,
                    )
                }
            }
        }
    }
}

/**
 * First-time Profile Setup screen when me.needsProfileSetup == true.
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
    var bio by remember(me.id) { mutableStateOf(me.bio) }
    var avatarColor by remember(me.id) { mutableStateOf(me.avatarColor.ifBlank { "purple" }) }
    var pickedAvatarUri by remember { mutableStateOf<Uri?>(null) }
    var usernameHint by remember { mutableStateOf<String?>(null) }
    var usernameAvailable by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }

    val avatarLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) pickedAvatarUri = uri
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
        usernameHint = msg ?: if (avail) "@$clean is available" else "@$clean is taken"
    }

    val colorChoices = listOf("purple", "blue", "green", "pink", "orange", "teal", "red", "yellow")

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bgPrimary)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(16.dp))
        Text(
            text = "Finish setting up your profile",
            color = palette.textPrimary,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Pick your display name, unique @username, and avatar style.",
            color = palette.textSecondary,
            fontSize = 13.5.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(22.dp))

        Box(
            modifier = Modifier.clickable { avatarLauncher.launch("image/*") },
            contentAlignment = Alignment.BottomEnd,
        ) {
            JaAvatar(
                avatarUrl = pickedAvatarUri?.toString() ?: me.avatarUrl,
                displayName = displayName.ifBlank { username.ifBlank { "JT" } },
                avatarColor = avatarColor,
                size = 86.dp,
            )
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(palette.accent),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Rounded.CameraAlt,
                    contentDescription = "Choose photo",
                    tint = Color.White,
                    modifier = Modifier.size(15.dp),
                )
            }
        }

        Spacer(Modifier.height(14.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            colorChoices.forEach { cName ->
                val grad = JaTextThemeManager.avatarGradientColors(cName)
                Box(
                    modifier = Modifier
                        .size(30.dp)
                        .clip(CircleShape)
                        .background(Brush.linearGradient(grad))
                        .border(
                            width = if (avatarColor == cName) 2.5.dp else 1.dp,
                            color = if (avatarColor == cName) Color.White else Color.Transparent,
                            shape = CircleShape,
                        )
                        .clickable { avatarColor = cName },
                    contentAlignment = Alignment.Center,
                ) {
                    if (avatarColor == cName) {
                        Icon(
                            imageVector = Icons.Rounded.Check,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(15.dp),
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(20.dp))

        OutlinedTextField(
            value = displayName,
            onValueChange = { displayName = it },
            label = { Text("Display Name") },
            singleLine = true,
            shape = RoundedCornerShape(13.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = username,
            onValueChange = { username = it.lowercase().filter { ch -> ch.isLetterOrDigit() || ch == '.' || ch == '_' } },
            label = { Text("Username") },
            prefix = { Text("@") },
            singleLine = true,
            shape = RoundedCornerShape(13.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        if (!usernameHint.isNullOrBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = usernameHint!!,
                color = if (usernameAvailable) palette.success else palette.danger,
                fontSize = 12.sp,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = bio,
            onValueChange = { bio = it.take(180) },
            label = { Text("Bio (optional)") },
            maxLines = 3,
            shape = RoundedCornerShape(13.dp),
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(22.dp))
        Button(
            onClick = {
                saving = true
                scope.launch {
                    try {
                        vm.saveProfile(
                            displayName = displayName.ifBlank { username },
                            username = username,
                            bio = bio,
                            pronouns = me.pronouns,
                            avatarColor = avatarColor,
                            avatarUri = pickedAvatarUri,
                        )
                    } catch (e: Throwable) {
                        vm.showToast(e.message ?: "Failed to save profile")
                    } finally {
                        saving = false
                    }
                }
            },
            enabled = !saving && username.length >= 3 && usernameAvailable,
            colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
        ) {
            if (saving) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            } else {
                Text("Continue to JaText", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color.White)
            }
        }
    }
}
