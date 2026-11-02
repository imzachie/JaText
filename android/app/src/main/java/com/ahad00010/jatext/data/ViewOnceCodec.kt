package com.ahad00010.jatext.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString

const val VIEW_ONCE_WIRE_PREFIX = "__JATEXT_VO_V1__:"
const val SPOILER_PREVIEW_MASK = "▪▪▪▪▪"

private val SPOILER_SPAN_REGEX = Regex("\\|\\|[\\s\\S]+?\\|\\|")
private val MD_CODE_FENCE_REGEX = Regex("```[\\s\\S]*?```")
private val MD_INLINE_CODE_REGEX = Regex("`([^`\\n]+)`")
private val MD_LINK_REGEX = Regex("\\[([^\\]]+)]\\((https?://[^\\s)]+)\\)")
private val MD_TRIPLE_EMPH_REGEX = Regex("(\\*\\*\\*|___)(.+?)\\1")
private val MD_DOUBLE_EMPH_REGEX = Regex("(\\*\\*|__)(.+?)\\1")
private val MD_STRIKE_HIGHLIGHT_REGEX = Regex("(~~|==)(.+?)\\1")

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
        val trimmed = body.trimStart()
        return trimmed.startsWith(VIEW_ONCE_WIRE_PREFIX) || trimmed.contains(VIEW_ONCE_WIRE_PREFIX)
    }

    fun maskSpoilersAndMarkdownForPreview(body: String?): String {
        if (body.isNullOrBlank()) return ""
        if (isViewOnceBody(body)) return "View once"
        return body
            .replace(SPOILER_SPAN_REGEX, SPOILER_PREVIEW_MASK)
            .replace("||", "")
            .replace(MD_CODE_FENCE_REGEX) { m ->
                val inner = m.value
                    .replace(Regex("^```[a-zA-Z0-9_+-]*\\n?"), "")
                    .removeSuffix("```")
                    .trim()
                inner.lineSequence().firstOrNull()?.takeIf { it.isNotBlank() } ?: "Code snippet"
            }
            .replace(MD_LINK_REGEX, "$1")
            .replace(MD_INLINE_CODE_REGEX, "$1")
            .replace(MD_TRIPLE_EMPH_REGEX, "$2")
            .replace(MD_DOUBLE_EMPH_REGEX, "$2")
            .replace(MD_STRIKE_HIGHLIGHT_REGEX, "$2")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    fun sanitizePreview(body: String?): String {
        if (body.isNullOrBlank()) return ""
        return maskSpoilersAndMarkdownForPreview(body)
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
