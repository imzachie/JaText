package com.ahad00010.jatext.auth

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.ahad00010.jatext.data.TursoApiClient
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.security.SecureRandom

class GoogleSignInCancelledException : Exception("Google sign-in was cancelled.")

object GoogleNativeSignIn {

    private const val PREFS_NAME = "jatext_google_auth_prefs"
    private const val KEY_CM_SHA1_MISSING_AT = "cm_sha1_missing_at"
    private const val SHA1_RETRY_COOLDOWN_MS = 6L * 60L * 60L * 1000L // 6 hours

    private val secureRandom = SecureRandom()

    fun generateMobileSessionId(): String {
        val bytes = ByteArray(24)
        secureRandom.nextBytes(bytes)
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            sb.append(String.format("%02x", b))
        }
        return sb.toString()
    }

    private fun hasBundledAndroidOAuthResource(context: Context): Boolean {
        val resId = context.resources.getIdentifier(
            "default_web_client_id",
            "string",
            context.packageName
        )
        if (resId == 0) return false
        return context.getString(resId).trim().isNotBlank()
    }

    private fun isSha1RecentlyMarkedMissing(context: Context): Boolean {
        val sp = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val ts = sp.getLong(KEY_CM_SHA1_MISSING_AT, 0L)
        return ts > 0L && System.currentTimeMillis() - ts < SHA1_RETRY_COOLDOWN_MS
    }

    private fun markSha1Missing(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_CM_SHA1_MISSING_AT, System.currentTimeMillis())
            .apply()
    }

    private fun clearSha1Missing(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_CM_SHA1_MISSING_AT)
            .apply()
    }

    /**
     * Play Services credentials-play-services-auth wraps status 16 ("[28444] Developer console is
     * not set up correctly.") inside GetCredentialCancellationException!
     * Only treat an exception as user cancellation if it is genuinely a user dismissal and NOT a
     * Play Services / Developer Console configuration error.
     */
    private fun isGenuineUserDismissal(e: Throwable): Boolean {
        if (e !is GetCredentialCancellationException) return false
        val msg = (e.message ?: "").lowercase()
        if (
            msg.contains("28444") ||
            msg.contains("developer console") ||
            msg.contains("developer_error") ||
            msg.contains("10:") ||
            msg.contains("cannot find a matching credential") ||
            msg.contains("not authorized") ||
            msg.contains("unregistered") ||
            msg.contains("configuration")
        ) {
            return false
        }
        return true
    }

    private fun isDeveloperConsoleSha1Error(e: Throwable): Boolean {
        val msg = (e.message ?: "").lowercase()
        return msg.contains("28444") ||
            msg.contains("developer console") ||
            msg.contains("developer_error") ||
            msg.contains("10:")
    }

    /**
     * Attempts Android Credential Manager when an Android OAuth 2.0 Client ID is configured.
     * If no Android SHA-1 client is registered yet (e.g. only Web GOOGLE_CLIENT_ID is configured
     * on Vercel), returns null immediately so the caller opens the 1-tap In-App Partial Bottom-Sheet
     * Auth Tab without making the user tap twice.
     */
    suspend fun tryCredentialManagerIfConfigured(
        activity: Activity,
        serverConfig: TursoApiClient.GoogleOAuthServerConfig?,
    ): String? {
        val appCtx = activity.applicationContext
        val serverClientId = serverConfig?.clientId?.takeIf { it.isNotBlank() } ?: run {
            val resId = appCtx.resources.getIdentifier(
                "default_web_client_id",
                "string",
                appCtx.packageName
            )
            if (resId != 0) appCtx.getString(resId).trim() else ""
        }
        if (serverClientId.isBlank()) return null

        val androidClientConfigured =
            hasBundledAndroidOAuthResource(appCtx) || (serverConfig?.androidClientConfigured == true)
        if (!androidClientConfigured || isSha1RecentlyMarkedMissing(appCtx)) {
            return null
        }

        val credentialManager = CredentialManager.create(activity)

        // Attempt 1: Sign-In With Google bottom sheet
        try {
            val signInOpt = GetSignInWithGoogleOption.Builder(serverClientId).build()
            val req = GetCredentialRequest.Builder()
                .addCredentialOption(signInOpt)
                .build()
            val result = credentialManager.getCredential(activity, req)
            extractGoogleIdToken(result.credential)?.let {
                clearSha1Missing(appCtx)
                return it
            }
        } catch (e: Throwable) {
            if (isGenuineUserDismissal(e)) {
                throw GoogleSignInCancelledException()
            }
            if (isDeveloperConsoleSha1Error(e)) {
                markSha1Missing(appCtx)
                return null
            }
        }

        // Attempt 2: Standard Google ID option
        return try {
            val googleIdOpt = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(serverClientId)
                .setAutoSelectEnabled(false)
                .build()
            val req = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOpt)
                .build()
            val result = credentialManager.getCredential(activity, req)
            extractGoogleIdToken(result.credential)?.also {
                clearSha1Missing(appCtx)
            }
        } catch (e: Throwable) {
            if (isGenuineUserDismissal(e)) {
                throw GoogleSignInCancelledException()
            }
            if (isDeveloperConsoleSha1Error(e)) {
                markSha1Missing(appCtx)
            }
            null
        }
    }

    private fun extractGoogleIdToken(credential: androidx.credentials.Credential): String? {
        if (credential is GoogleIdTokenCredential) {
            return credential.idToken
        }
        if (credential is CustomCredential &&
            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            return GoogleIdTokenCredential.createFrom(credential.data).idToken
        }
        return null
    }

    /**
     * Launches Google's OAuth 2.0 account chooser inside an in-app 82%-height rounded
     * Partial Custom Tab sheet directly over MainActivity (zero WebView code, zero full-screen
     * browser switch, works immediately with Web GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET!).
     * Returns straight into JaText via BOTH com.ahad00010.jatext://auth deep-link AND
     * Turso mobileSession background polling.
     */
    fun launchInAppGoogleOAuthSheet(
        activity: Activity,
        mobileSessionId: String,
    ) {
        val authUrl =
            "${TursoApiClient.apiOrigin}/api/oauth-google?action=start&platform=android&mobileSession=$mobileSessionId"
        val authUri = Uri.parse(authUrl)

        val displayMetrics = activity.resources.displayMetrics
        val sheetHeightPx = (displayMetrics.heightPixels * 0.82f).toInt().coerceAtLeast(560)

        val darkColors = CustomTabColorSchemeParams.Builder()
            .setToolbarColor(0xFF0F1419.toInt())
            .setSecondaryToolbarColor(0xFF0F1419.toInt())
            .setNavigationBarColor(0xFF0A0C0F.toInt())
            .build()

        val customTabsIntent = CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(darkColors)
            .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
            .setInitialActivityHeightPx(sheetHeightPx, CustomTabsIntent.ACTIVITY_HEIGHT_ADJUSTABLE)
            .setToolbarCornerRadiusDp(22)
            .setShowTitle(true)
            .setUrlBarHidingEnabled(true)
            .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
            .setBookmarksButtonEnabled(false)
            .setDownloadButtonEnabled(false)
            .build()

        val preferredPkg = try {
            CustomTabsClient.getPackageName(
                activity,
                listOf(
                    "com.android.chrome",
                    "com.google.android.apps.chrome",
                    "com.sec.android.app.sbrowser",
                    "com.brave.browser",
                    "com.microsoft.emmx",
                ),
                true
            ) ?: CustomTabsClient.getPackageName(activity, null)
        } catch (_: Throwable) {
            null
        }

        if (!preferredPkg.isNullOrBlank()) {
            customTabsIntent.intent.setPackage(preferredPkg)
        }

        try {
            customTabsIntent.launchUrl(activity, authUri)
        } catch (_: Throwable) {
            val viewIntent = Intent(Intent.ACTION_VIEW, authUri)
            activity.startActivity(viewIntent)
        }
    }
}
