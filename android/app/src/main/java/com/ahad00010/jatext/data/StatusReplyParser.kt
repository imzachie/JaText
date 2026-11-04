package com.ahad00010.jatext.data

/**
 * Status replies travel as ordinary DMs with a machine readable prefix.
 *
 * The prefix used to be rendered verbatim, so people saw raw markup like
 * `[Status reply: "..."]` inside a chat bubble. It stays in the stored body so
 * replies survive a reload and sync to every device, but both clients parse it
 * back out and show a proper "Replying to Status" card instead.
 *
 * The two prefixes below are both live formats: this native app writes one, the
 * web app writes the other, so each has to understand both or a reply sent on a
 * phone renders as markup on desktop and the other way round.
 */
object StatusReplyParser {

    data class Parsed(val quote: String?, val body: String)

    private val withCaption = listOf(
        Regex("^\\[Replied to Status: \"([\\s\\S]*?)\"\\]\\r?\\n?"),
        Regex("^\\[Status reply: \"([\\s\\S]*?)\"\\]\\r?\\n?"),
    )
    private val withoutCaption = listOf(
        Regex("^\\[Replied to your Status\\]\\r?\\n?"),
        Regex("^\\[Status reply\\]\\r?\\n?"),
    )

    /** quote is null when this message is not a status reply. */
    fun parse(body: String?): Parsed {
        val raw = body ?: ""
        for (pattern in withCaption) {
            val match = pattern.find(raw) ?: continue
            return Parsed(quote = match.groupValues[1], body = raw.substring(match.value.length))
        }
        for (pattern in withoutCaption) {
            val match = pattern.find(raw) ?: continue
            return Parsed(quote = "", body = raw.substring(match.value.length))
        }
        return Parsed(quote = null, body = raw)
    }

    /** For conversation list previews: `Replying to "caption": text`. */
    fun preview(body: String?): String {
        val parsed = parse(body)
        if (parsed.quote == null) return body ?: ""
        val label = if (parsed.quote.isBlank()) "Replying to Status" else "Replying to \"${parsed.quote}\""
        val rest = parsed.body.trim()
        return if (rest.isEmpty()) label else "$label: $rest"
    }
}
