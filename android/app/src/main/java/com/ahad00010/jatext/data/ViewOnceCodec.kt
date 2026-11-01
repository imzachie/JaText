package com.ahad00010.jatext.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString

const val VIEW_ONCE_WIRE_PREFIX = "__JATEXT_VO_V1__:"

@Serializable
data class ViewOnceMediaPayload(
    val url: String = "",
    val name: String = "media",
    val mime: String = "",
    val att: EncryptedBlobDescriptor? = null,
)

@Serializable
data class ViewOnceEnvelopePayload(
    val v: Int = 1,
    val text: String? = null,
    val photo: ViewOnceMediaPayload? = null,
    val audio: ViewOnceMediaPayload? = null,
)

object ViewOnceCodec {
    fun isViewOnceBody(body: String?): Boolean {
        if (body.isNullOrBlank()) return false
        return body.trimStart().startsWith(VIEW_ONCE_WIRE_PREFIX)
    }

    fun encode(envelope: ViewOnceEnvelopePayload): String {
        return "$VIEW_ONCE_WIRE_PREFIX${JaTextJson.encodeToString(envelope)}"
    }

    fun decode(
        body: String?,
        fallbackUrl: String? = null,
        fallbackName: String? = null,
        fallbackMime: String? = null,
        fallbackAtt: EncryptedBlobDescriptor? = null,
    ): ViewOnceEnvelopePayload? {
        if (body.isNullOrBlank()) return null
        val trimmed = body.trimStart()
        if (!trimmed.startsWith(VIEW_ONCE_WIRE_PREFIX)) return null
        val rawJson = trimmed.removePrefix(VIEW_ONCE_WIRE_PREFIX).trim()
        val parsed = try {
            JaTextJson.decodeFromString<ViewOnceEnvelopePayload>(rawJson)
        } catch (_: Throwable) {
            ViewOnceEnvelopePayload(v = 1, text = rawJson)
        }
        if (parsed.photo == null && parsed.audio == null && !fallbackUrl.isNullOrBlank()) {
            val mime = fallbackMime ?: fallbackAtt?.t.orEmpty()
            val item = ViewOnceMediaPayload(
                url = fallbackUrl,
                name = fallbackName ?: fallbackAtt?.n ?: "media",
                mime = mime,
                att = fallbackAtt,
            )
            return if (mime.startsWith("audio/")) {
                parsed.copy(audio = item)
            } else {
                parsed.copy(photo = item)
            }
        }
        return parsed
    }
}
