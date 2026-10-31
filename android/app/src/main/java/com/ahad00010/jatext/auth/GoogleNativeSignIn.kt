package com.ahad00010.jatext.auth

import android.app.Activity
import android.content.Context
import android.content.Intent
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.ahad00010.jatext.data.TursoApiClient
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.tasks.await

class GoogleSignInCancelledException : Exception("Google sign-in was cancelled.")

object GoogleNativeSignIn {

    suspend fun resolveServerWebClientId(context: Context): String {
        val fromServer = TursoApiClient.fetchGoogleOAuthWebClientId()
        if (!fromServer.isNullOrBlank()) return fromServer

        val resId = context.resources.getIdentifier(
            "default_web_client_id",
            "string",
            context.packageName
        )
        if (resId != 0) {
            val fromRes = context.getString(resId).trim()
            if (fromRes.isNotBlank()) return fromRes
        }
        throw IllegalStateException(
            "Google Sign-In is not configured yet. Set GOOGLE_CLIENT_ID in Vercel Environment Variables."
        )
    }

    /**
     * Launches Android's built-in Credential Manager Google Sign-In bottom sheet
     * directly over the JaText Activity (zero Chrome browser redirect).
     * Returns a verified Google OIDC idToken string, or null if legacy Play Services
     * Intent fallback should be launched instead.
     */
    suspend fun requestInAppIdTokenViaCredentialManager(
        activity: Activity,
        serverClientId: String,
    ): String? {
        val credentialManager = CredentialManager.create(activity)

        // Attempt 1: Explicit Sign-In With Google bottom sheet (works even on first sign-in)
        try {
            val signInWithGoogleOption = GetSignInWithGoogleOption.Builder(serverClientId)
                .build()
            val req = GetCredentialRequest.Builder()
                .addCredentialOption(signInWithGoogleOption)
                .build()
            val result = credentialManager.getCredential(activity, req)
            extractGoogleIdToken(result.credential)?.let { return it }
        } catch (e: GetCredentialCancellationException) {
            throw GoogleSignInCancelledException()
        } catch (_: NoCredentialException) {
            // Fall through to GetGoogleIdOption / Play Services Auth dialog
        } catch (_: Throwable) {
            // Fall through to GetGoogleIdOption / Play Services Auth dialog
        }

        // Attempt 2: Standard Google ID account selector sheet (unfiltered across device accounts)
        return try {
            val googleIdOption = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(serverClientId)
                .setAutoSelectEnabled(false)
                .build()
            val req = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build()
            val result = credentialManager.getCredential(activity, req)
            extractGoogleIdToken(result.credential)
        } catch (e: GetCredentialCancellationException) {
            throw GoogleSignInCancelledException()
        } catch (_: Throwable) {
            null
        }
    }

    private fun extractGoogleIdToken(credential: androidx.credentials.Credential): String? {
        if (credential is CustomCredential &&
            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            return GoogleIdTokenCredential.createFrom(credential.data).idToken
        }
        return null
    }

    /**
     * Native Google Play Services Auth account-picker dialog fallback (also 100% in-app,
     * never redirects to Chrome).
     */
    @Suppress("DEPRECATION")
    suspend fun buildPlayServicesSignInIntent(activity: Activity, serverClientId: String): Intent {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(serverClientId)
            .requestEmail()
            .requestProfile()
            .build()
        val client = GoogleSignIn.getClient(activity, gso)
        try {
            client.signOut().await()
        } catch (_: Throwable) {
        }
        return client.signInIntent
    }

    @Suppress("DEPRECATION")
    fun extractIdTokenFromPlayServicesResult(data: Intent?): String {
        val task = GoogleSignIn.getSignedInAccountFromIntent(data)
        try {
            val account = task.getResult(ApiException::class.java)
            val idToken = account?.idToken
            if (!idToken.isNullOrBlank()) return idToken
            throw IllegalStateException("Google Play Services did not return an ID token.")
        } catch (e: ApiException) {
            when (e.statusCode) {
                12501, 16 -> throw GoogleSignInCancelledException()
                10 -> throw IllegalStateException(
                    "Developer error (code 10): Add an Android OAuth 2.0 Client for package com.ahad00010.jatext with your release keystore SHA-1 in Google Cloud Console (same project as GOOGLE_CLIENT_ID)."
                )
                else -> throw IllegalStateException("Google Sign-In error (${e.statusCode}).")
            }
        }
    }
}
