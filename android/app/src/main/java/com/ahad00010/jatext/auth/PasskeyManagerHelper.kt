package com.ahad00010.jatext.auth

import android.app.Activity
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.ahad00010.jatext.data.JaTextJson
import com.ahad00010.jatext.data.JaUser
import com.ahad00010.jatext.data.PasskeySummary
import com.ahad00010.jatext.data.TursoApiClient
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class PasskeyCancelledException : Exception("Passkey operation was cancelled.")

object PasskeyManagerHelper {
    private const val RP_ID = "jatext.vercel.app"

    suspend fun registerPasskey(
        activity: Activity,
        token: String,
        label: String = "Android Passkey",
    ): PasskeySummary {
        val started = TursoApiClient.rpcRaw(
            op = "beginPasskeyRegistration",
            args = mapOf("rpId" to RP_ID),
            token = token,
        ).jsonObject
        val challengeId = started["challengeId"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Missing passkey challenge ID.")
        val optionsJson = started["options"]?.toString()
            ?: throw IllegalStateException("Missing passkey options.")

        val credentialManager = CredentialManager.create(activity)
        val createReq = CreatePublicKeyCredentialRequest(requestJson = optionsJson)
        val result = try {
            credentialManager.createCredential(activity, createReq)
        } catch (_: CreateCredentialCancellationException) {
            throw PasskeyCancelledException()
        }
        val pkResp = result as? CreatePublicKeyCredentialResponse
            ?: throw IllegalStateException("Unexpected credential response.")

        val regObj = JaTextJson.parseToJsonElement(pkResp.registrationResponseJson).jsonObject
        val credentialId = regObj["rawId"]?.jsonPrimitive?.contentOrNull
            ?: regObj["id"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Missing credential ID.")
        val respObj = regObj["response"]?.jsonObject
            ?: throw IllegalStateException("Missing attestation response.")
        val clientDataJSON = respObj["clientDataJSON"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Missing clientDataJSON.")
        val attestationObject = respObj["attestationObject"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Missing attestationObject.")
        val authenticatorData = respObj["authenticatorData"]?.jsonPrimitive?.contentOrNull
        val publicKeySpki = respObj["publicKey"]?.jsonPrimitive?.contentOrNull
        val alg = respObj["publicKeyAlgorithm"]?.jsonPrimitive?.intOrNull ?: -7
        val transports = respObj["transports"]?.let { el ->
            runCatching {
                el.jsonArray.mapNotNull { it.jsonPrimitive.contentOrNull }
            }.getOrDefault(emptyList())
        }.orEmpty()

        val args = mutableMapOf<String, Any?>(
            "challengeId" to challengeId,
            "credentialId" to credentialId,
            "clientDataJSON" to clientDataJSON,
            "attestationObject" to attestationObject,
            "publicKeyAlgorithm" to alg,
            "label" to label.trim().ifBlank { "Android Passkey" },
            "transports" to transports,
        )
        if (!authenticatorData.isNullOrBlank()) args["authenticatorData"] = authenticatorData
        if (!publicKeySpki.isNullOrBlank()) args["publicKeySpki"] = publicKeySpki

        val finished = TursoApiClient.rpcRaw(
            op = "finishPasskeyRegistration",
            args = args,
            token = token,
        ).jsonObject
        val pkEl = finished["passkey"]
        return if (pkEl != null && pkEl !is JsonNull) {
            JaTextJson.decodeFromJsonElement(PasskeySummary.serializer(), pkEl)
        } else {
            PasskeySummary(
                credentialId = credentialId,
                label = label.trim().ifBlank { "Android Passkey" },
                createdAt = System.currentTimeMillis(),
            )
        }
    }

    suspend fun signInWithPasskey(
        activity: Activity,
        emailHint: String? = null,
    ): Pair<String, JaUser> {
        val beginArgs = mutableMapOf<String, Any?>("rpId" to RP_ID)
        if (!emailHint.isNullOrBlank()) {
            beginArgs["email"] = emailHint.trim().lowercase()
        }
        val started = TursoApiClient.rpcRaw(
            op = "beginPasskeyLogin",
            args = beginArgs,
        ).jsonObject
        val challengeId = started["challengeId"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Missing passkey login challenge.")
        val optionsJson = started["options"]?.toString()
            ?: throw IllegalStateException("Missing passkey request options.")

        val credentialManager = CredentialManager.create(activity)
        val option = GetPublicKeyCredentialOption(requestJson = optionsJson)
        val req = GetCredentialRequest(listOf(option))
        val result = try {
            credentialManager.getCredential(activity, req)
        } catch (_: GetCredentialCancellationException) {
            throw PasskeyCancelledException()
        }
        val pkCred = result.credential as? PublicKeyCredential
            ?: throw IllegalStateException("Selected credential is not a passkey.")
        val authObj = JaTextJson.parseToJsonElement(pkCred.authenticationResponseJson).jsonObject
        val credentialId = authObj["rawId"]?.jsonPrimitive?.contentOrNull
            ?: authObj["id"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Missing credential ID.")
        val respObj = authObj["response"]?.jsonObject
            ?: throw IllegalStateException("Missing assertion response.")
        val clientDataJSON = respObj["clientDataJSON"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Missing clientDataJSON.")
        val authenticatorData = respObj["authenticatorData"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Missing authenticatorData.")
        val signature = respObj["signature"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Missing passkey signature.")

        val finished = TursoApiClient.rpcRaw(
            op = "finishPasskeyLogin",
            args = mapOf(
                "challengeId" to challengeId,
                "credentialId" to credentialId,
                "clientDataJSON" to clientDataJSON,
                "authenticatorData" to authenticatorData,
                "signature" to signature,
            ),
        ).jsonObject
        val token = finished["token"]?.jsonPrimitive?.contentOrNull
            ?: throw IllegalStateException("Server did not return an auth token.")
        val meEl = finished["me"]
        val me = if (meEl != null && meEl !is JsonNull) {
            JaTextJson.decodeFromJsonElement(JaUser.serializer(), meEl)
        } else {
            JaUser()
        }
        return token to me
    }
}
