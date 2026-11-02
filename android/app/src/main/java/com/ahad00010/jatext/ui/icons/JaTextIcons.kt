package com.ahad00010.jatext.ui.icons

import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ahad00010.jatext.data.UserSocialLink

/**
 * Pure vector Google "G" emblem for the in-app Google Sign-In button (zero WebView, zero emoji).
 */
@Composable
fun GoogleBrandVectorIcon(size: Dp = 20.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val stroke = w * 0.19f
        val inset = stroke / 2f + w * 0.06f
        val arcSize = Size(w - inset * 2f, h - inset * 2f)
        val topLeft = Offset(inset, inset)

        drawArc(
            color = Color(0xFFEA4335),
            startAngle = 215f,
            sweepAngle = 105f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(width = stroke, cap = StrokeCap.Butt),
        )
        drawArc(
            color = Color(0xFFFBBC05),
            startAngle = 140f,
            sweepAngle = 78f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(width = stroke, cap = StrokeCap.Butt),
        )
        drawArc(
            color = Color(0xFF34A853),
            startAngle = 45f,
            sweepAngle = 98f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(width = stroke, cap = StrokeCap.Butt),
        )
        drawArc(
            color = Color(0xFF4285F4),
            startAngle = -8f,
            sweepAngle = 56f,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(width = stroke, cap = StrokeCap.Butt),
        )
        drawLine(
            color = Color(0xFF4285F4),
            start = Offset(w * 0.52f, h * 0.50f),
            end = Offset(w - inset + stroke * 0.35f, h * 0.50f),
            strokeWidth = stroke * 0.92f,
            cap = StrokeCap.Butt,
        )
    }
}

/* ==================== 1:1 Web Socials Spec & Brand SVG Icons (`SocialIcons.tsx`) ==================== */

data class SocialPlatformSpec(
    val id: String,
    val label: String,
    val placeholder: String,
    val accent: Color,
    val buildUrl: (String) -> Pair<String, String>, // (handle, url)
) {
    val brandTint: Color
        get() = accent
}

data class SocialPlatformMeta(
    val label: String,
    val brandTint: Color,
    val id: String,
) {
    val accent: Color
        get() = brandTint
}

private fun cleanHandle(raw: String): String = raw.trim().trimStart('@')

private fun parseIfFullUrl(raw: String): String? {
    val trimmed = raw.trim()
    if (trimmed.startsWith("http://", ignoreCase = true) || trimmed.startsWith("https://", ignoreCase = true)) {
        return trimmed
    }
    return null
}

val SOCIAL_PLATFORM_SPECS: List<SocialPlatformSpec> = listOf(
    SocialPlatformSpec(
        id = "discord",
        label = "Discord",
        placeholder = "username or https://discord.gg/...",
        accent = Color(0xFF5865F2),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) {
                val seg = full.trimEnd('/').substringAfterLast('/').ifBlank { "Discord" }
                seg to full
            } else {
                val trimmed = raw.trim()
                if (trimmed.startsWith("discord.gg/", ignoreCase = true) || trimmed.startsWith("discord.com/", ignoreCase = true)) {
                    val url = "https://$trimmed"
                    trimmed.trimEnd('/').substringAfterLast('/').ifBlank { trimmed } to url
                } else {
                    cleanHandle(trimmed) to "https://discord.com/users"
                }
            }
        }
    ),
    SocialPlatformSpec(
        id = "youtube",
        label = "YouTube",
        placeholder = "@channel or https://youtube.com/@...",
        accent = Color(0xFFFF0033),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) {
                val m = Regex("youtube\\.com/(@[^/?#]+|channel/[^/?#]+|c/[^/?#]+)", RegexOption.IGNORE_CASE).find(full)
                (m?.groupValues?.getOrNull(1) ?: cleanHandle(raw)) to full
            } else {
                val h = cleanHandle(raw)
                "@$h" to "https://www.youtube.com/@${Uri.encode(h)}"
            }
        }
    ),
    SocialPlatformSpec(
        id = "x",
        label = "X",
        placeholder = "@username or https://x.com/...",
        accent = Color(0xFFE7E9EA),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) {
                val m = Regex("(?:x\\.com|twitter\\.com)/([^/?#]+)", RegexOption.IGNORE_CASE).find(full)
                val h = m?.groupValues?.getOrNull(1)?.let { "@${cleanHandle(it)}" } ?: raw.trim()
                h to full
            } else {
                val h = cleanHandle(raw)
                "@$h" to "https://x.com/${Uri.encode(h)}"
            }
        }
    ),
    SocialPlatformSpec(
        id = "instagram",
        label = "Instagram",
        placeholder = "@username or https://instagram.com/...",
        accent = Color(0xFFE1306C),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) {
                val m = Regex("instagram\\.com/([^/?#]+)", RegexOption.IGNORE_CASE).find(full)
                val h = m?.groupValues?.getOrNull(1)?.let { "@${cleanHandle(it)}" } ?: raw.trim()
                h to full
            } else {
                val h = cleanHandle(raw)
                "@$h" to "https://www.instagram.com/${Uri.encode(h)}"
            }
        }
    ),
    SocialPlatformSpec(
        id = "tiktok",
        label = "TikTok",
        placeholder = "@username or https://tiktok.com/@...",
        accent = Color(0xFFFE2C55),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) {
                val m = Regex("tiktok\\.com/@?([^/?#]+)", RegexOption.IGNORE_CASE).find(full)
                val h = m?.groupValues?.getOrNull(1)?.let { "@${cleanHandle(it)}" } ?: raw.trim()
                h to full
            } else {
                val h = cleanHandle(raw)
                "@$h" to "https://www.tiktok.com/@${Uri.encode(h)}"
            }
        }
    ),
    SocialPlatformSpec(
        id = "github",
        label = "GitHub",
        placeholder = "username or https://github.com/...",
        accent = Color(0xFFC9D1D9),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) {
                val m = Regex("github\\.com/([^/?#]+)", RegexOption.IGNORE_CASE).find(full)
                (m?.groupValues?.getOrNull(1)?.let { cleanHandle(it) } ?: raw.trim()) to full
            } else {
                val h = cleanHandle(raw)
                h to "https://github.com/${Uri.encode(h)}"
            }
        }
    ),
    SocialPlatformSpec(
        id = "twitch",
        label = "Twitch",
        placeholder = "channel or https://twitch.tv/...",
        accent = Color(0xFF9146FF),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) {
                val m = Regex("twitch\\.tv/([^/?#]+)", RegexOption.IGNORE_CASE).find(full)
                (m?.groupValues?.getOrNull(1)?.let { cleanHandle(it) } ?: raw.trim()) to full
            } else {
                val h = cleanHandle(raw)
                h to "https://www.twitch.tv/${Uri.encode(h)}"
            }
        }
    ),
    SocialPlatformSpec(
        id = "spotify",
        label = "Spotify",
        placeholder = "username or https://open.spotify.com/...",
        accent = Color(0xFF1DB954),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) "Spotify" to full
            else {
                val h = cleanHandle(raw)
                h to "https://open.spotify.com/user/${Uri.encode(h)}"
            }
        }
    ),
    SocialPlatformSpec(
        id = "reddit",
        label = "Reddit",
        placeholder = "u/username or https://reddit.com/u/...",
        accent = Color(0xFFFF4500),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) {
                val m = Regex("reddit\\.com/(?:user|u)/([^/?#]+)", RegexOption.IGNORE_CASE).find(full)
                (m?.groupValues?.getOrNull(1)?.let { "u/${cleanHandle(it)}" } ?: raw.trim()) to full
            } else {
                val h = cleanHandle(raw.removePrefix("u/").removePrefix("U/"))
                "u/$h" to "https://www.reddit.com/user/${Uri.encode(h)}"
            }
        }
    ),
    SocialPlatformSpec(
        id = "steam",
        label = "Steam",
        placeholder = "custom ID or https://steamcommunity.com/id/...",
        accent = Color(0xFF66C0F4),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) "Steam" to full
            else {
                val h = cleanHandle(raw)
                h to "https://steamcommunity.com/id/${Uri.encode(h)}"
            }
        }
    ),
    SocialPlatformSpec(
        id = "linkedin",
        label = "LinkedIn",
        placeholder = "handle or https://linkedin.com/in/...",
        accent = Color(0xFF0A66C2),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) "LinkedIn" to full
            else {
                val h = cleanHandle(raw)
                h to "https://www.linkedin.com/in/${Uri.encode(h)}"
            }
        }
    ),
    SocialPlatformSpec(
        id = "bluesky",
        label = "Bluesky",
        placeholder = "handle.bsky.social or https://bsky.app/...",
        accent = Color(0xFF0085FF),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) raw.trim() to full
            else {
                val h = cleanHandle(raw)
                val domain = if (h.contains(".")) h else "$h.bsky.social"
                "@$domain" to "https://bsky.app/profile/${Uri.encode(domain)}"
            }
        }
    ),
    SocialPlatformSpec(
        id = "telegram",
        label = "Telegram",
        placeholder = "@username or https://t.me/...",
        accent = Color(0xFF26A5E4),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) raw.trim() to full
            else {
                val h = cleanHandle(raw)
                "@$h" to "https://t.me/${Uri.encode(h)}"
            }
        }
    ),
    SocialPlatformSpec(
        id = "other",
        label = "Other platform",
        placeholder = "https://your-social-profile.com/...",
        accent = Color(0xFFA78BFA),
        buildUrl = { raw ->
            val full = parseIfFullUrl(raw)
            if (full != null) {
                val host = Uri.parse(full).host?.removePrefix("www.") ?: full
                host to full
            } else {
                val trimmed = raw.trim()
                trimmed to "https://$trimmed"
            }
        }
    ),
)

fun getSocialPlatformMeta(platformRaw: String): SocialPlatformMeta {
    val key = platformRaw.trim().lowercase()
    val match = SOCIAL_PLATFORM_SPECS.firstOrNull {
        it.id == key || it.label.lowercase() == key
    }
    return if (match != null && match.id != "other") {
        SocialPlatformMeta(match.label, match.accent, match.id)
    } else {
        SocialPlatformMeta(platformRaw.trim().ifEmpty { "Social" }, Color(0xFFA78BFA), key)
    }
}

fun isHandleOnlyDiscord(platform: String, url: String): Boolean {
    val key = platform.trim().lowercase()
    return key == "discord" && (url.isBlank() || url == "https://discord.com/users")
}

fun isHandleOnlyDiscord(social: UserSocialLink): Boolean =
    isHandleOnlyDiscord(social.platform, social.url)

private val SVG_PATHS_24 = mapOf(
    "discord" to "M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.11 13.11 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z",
    "youtube" to "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z",
    "x" to "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
    "tiktok" to "M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1Z",
    "github" to "M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.56v-2.02c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.7 5.39-5.27 5.68.42.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.53 11.53 0 0 0 23.5 12.02C23.5 5.74 18.27.5 12 .5Z",
    "twitch" to "M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z",
    "spotify" to "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z",
    "reddit" to "M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701z",
    "linkedin" to "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
    "telegram" to "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
    "steam" to "M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0z",
)

@Composable
fun SocialBrandVectorIcon(
    platformId: String,
    size: Dp = 15.dp,
    tint: Color = Color.Unspecified,
) {
    val key = remember(platformId) {
        val raw = platformId.trim().lowercase()
        if (raw == "twitter") "x" else raw
    }
    val (_, defaultAccent, _) = remember(platformId) { getSocialPlatformMeta(platformId) }
    val resolvedTint = if (tint == Color.Unspecified) defaultAccent else tint
    val pathData = SVG_PATHS_24[key]
    val parsedBasePath = remember(pathData) {
        pathData?.let {
            try {
                PathParser().parsePathString(it).toPath()
            } catch (_: Throwable) {
                null
            }
        }
    }

    Canvas(modifier = Modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val scale = w / 24f

        when {
            key == "instagram" -> {
                val sw = 2.1f * scale
                drawRoundRect(
                    color = resolvedTint,
                    topLeft = Offset(2f * scale, 2f * scale),
                    size = Size(20f * scale, 20f * scale),
                    cornerRadius = CornerRadius(5f * scale, 5f * scale),
                    style = Stroke(width = sw),
                )
                drawCircle(
                    color = resolvedTint,
                    radius = 4f * scale,
                    center = Offset(12f * scale, 12f * scale),
                    style = Stroke(width = sw),
                )
                drawCircle(
                    color = resolvedTint,
                    radius = 1.25f * scale,
                    center = Offset(17.5f * scale, 6.5f * scale),
                )
            }
            key == "bluesky" -> {
                // Bluesky butterfly
                val p = PathParser().parsePathString(
                    "M12 10.8c-1.1-2.1-4.1-6-6.9-7.9C2.4 1 1.4 1.3.8 1.6.1 2 0 3.2 0 3.9c0 .7.4 5.6.6 6.4.8 2.7 3.6 3.6 6.2 3.2-4.4.7-5.5 3.1-3.1 5.5 4.6 4.7 6.6-1.2 7.2-3 .1-.3.2-.4.2-.3 0-.1.1 0 .2.3.6 1.8 2.6 7.7 7.2 3 2.4-2.4 1.3-4.8-3.1-5.5 2.6.4 5.4-.5 6.2-3.2.2-.8.6-5.7.6-6.4 0-.7-.1-1.9-.8-2.3-.6-.3-1.6-.6-4.3 1.3-2.8 1.9-5.8 5.8-6.9 7.9Z"
                ).toPath()
                val m = Matrix().apply { scale(scale, scale) }
                p.transform(m)
                drawPath(p, color = resolvedTint)
            }
            parsedBasePath != null -> {
                val copy = Path().apply { addPath(parsedBasePath) }
                val m = Matrix().apply { scale(scale, scale) }
                copy.transform(m)
                drawPath(copy, color = resolvedTint)
            }
            else -> {
                // Link chain icon fallback
                val p1 = PathParser().parsePathString("M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71").toPath()
                val p2 = PathParser().parsePathString("M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71").toPath()
                val m = Matrix().apply { scale(scale, scale) }
                p1.transform(m)
                p2.transform(m)
                val stroke = Stroke(width = 2.1f * scale, cap = StrokeCap.Round, join = StrokeJoin.Round)
                drawPath(p1, color = resolvedTint, style = stroke)
                drawPath(p2, color = resolvedTint, style = stroke)
            }
        }
    }
}

@Composable
fun WebsiteGlobeVectorIcon(size: Dp = 15.dp, tint: Color = Color.White) {
    Canvas(modifier = Modifier.size(size)) {
        val scale = this.size.width / 24f
        val sw = 2.1f * scale
        drawCircle(
            color = tint,
            radius = 10f * scale,
            center = Offset(12f * scale, 12f * scale),
            style = Stroke(width = sw),
        )
        drawLine(
            color = tint,
            start = Offset(2f * scale, 12f * scale),
            end = Offset(22f * scale, 12f * scale),
            strokeWidth = sw,
            cap = StrokeCap.Round,
        )
        val meridian = PathParser().parsePathString(
            "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        ).toPath()
        meridian.transform(Matrix().apply { scale(scale, scale) })
        drawPath(meridian, color = tint, style = Stroke(width = sw, join = StrokeJoin.Round))
    }
}

@Composable
fun ExternalArrowVectorIcon(size: Dp = 13.dp, tint: Color = Color.White) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.width / 24f
        val sw = 2.2f * s
        drawLine(tint, Offset(7f * s, 17f * s), Offset(17f * s, 7f * s), strokeWidth = sw, cap = StrokeCap.Round)
        val corner = Path().apply {
            moveTo(7f * s, 7f * s)
            lineTo(17f * s, 7f * s)
            lineTo(17f * s, 17f * s)
        }
        drawPath(corner, color = tint, style = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

/* ==================== 1:1 Web Stroked UI SVG Icons (`src/components/UiIcons.tsx`) ==================== */

enum class WebUiIconKind {
    MoreVertical,
    User,
    Users,
    ShieldCheck,
    BubblePalette,
    Image,
    RefreshSync,
    Bell,
    BellOff,
    Archive,
    UserMinus,
    Ban,
    LockClosed,
    Unlock,
    Settings,
    Trash,
    Reply,
    Forward,
    Copy,
    Edit,
    Undo,
    SmilePlus,
    Star,
    Link,
    Transcript,
    Search,
}

@Composable
fun WebUiSvgIcon(
    kind: WebUiIconKind,
    tint: Color,
    size: Dp = 18.dp,
    strokeWidth: Float = 1.9f,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val s = this.size.width / 24f
        val sw = strokeWidth * s
        val stroke = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round)
        val mat = Matrix().apply { scale(s, s) }
        fun strokeSvgPath(d: String) {
            val p = PathParser().parsePathString(d).toPath()
            p.transform(mat)
            drawPath(p, color = tint, style = stroke)
        }

        when (kind) {
            WebUiIconKind.MoreVertical -> {
                val r = 1.35f * s
                drawCircle(color = tint, radius = r, center = Offset(12f * s, 5f * s))
                drawCircle(color = tint, radius = r, center = Offset(12f * s, 12f * s))
                drawCircle(color = tint, radius = r, center = Offset(12f * s, 19f * s))
            }
            WebUiIconKind.User -> {
                drawCircle(color = tint, radius = 4f * s, center = Offset(12f * s, 8f * s), style = stroke)
                strokeSvgPath("M5 20a7 7 0 0 1 14 0")
            }
            WebUiIconKind.Users -> {
                strokeSvgPath("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2")
                drawCircle(color = tint, radius = 4f * s, center = Offset(9f * s, 7f * s), style = stroke)
                strokeSvgPath("M22 21v-2a4 4 0 0 0-3-3.87")
                strokeSvgPath("M16 3.13a4 4 0 0 1 0 7.75")
            }
            WebUiIconKind.ShieldCheck -> {
                strokeSvgPath("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z")
                strokeSvgPath("m9 12 2 2 4-4")
            }
            WebUiIconKind.BubblePalette -> {
                strokeSvgPath("M21 11.5a8.4 8.4 0 0 1-9 8.4 8.7 8.7 0 0 1-3.6-.8L3 20.5l1.5-4.7A8.4 8.4 0 1 1 21 11.5Z")
                drawCircle(color = tint, radius = 1.1f * s, center = Offset(9f * s, 11.5f * s))
                drawCircle(color = tint, radius = 1.1f * s, center = Offset(12.5f * s, 9.5f * s))
                drawCircle(color = tint, radius = 1.1f * s, center = Offset(15.5f * s, 12f * s))
            }
            WebUiIconKind.Image -> {
                drawRoundRect(
                    color = tint,
                    topLeft = Offset(3f * s, 3f * s),
                    size = Size(18f * s, 18f * s),
                    cornerRadius = CornerRadius(2.5f * s, 2.5f * s),
                    style = stroke,
                )
                drawCircle(color = tint, radius = 1.5f * s, center = Offset(8.5f * s, 8.5f * s), style = stroke)
                strokeSvgPath("m21 15-5-5L5 21")
            }
            WebUiIconKind.RefreshSync -> {
                strokeSvgPath("M3 12a9 9 0 0 1 15-6.7L21 8")
                strokeSvgPath("M21 3v5h-5")
                strokeSvgPath("M21 12a9 9 0 0 1-15 6.7L3 16")
                strokeSvgPath("M8 16H3v5")
            }
            WebUiIconKind.Bell -> {
                strokeSvgPath("M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9")
                strokeSvgPath("M10.3 21a1.94 1.94 0 0 0 3.4 0")
            }
            WebUiIconKind.BellOff -> {
                strokeSvgPath("M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5")
                strokeSvgPath("M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7")
                strokeSvgPath("M10.3 21a1.94 1.94 0 0 0 3.4 0")
                drawLine(tint, Offset(2f * s, 2f * s), Offset(22f * s, 22f * s), strokeWidth = sw, cap = StrokeCap.Round)
            }
            WebUiIconKind.Archive -> {
                drawRoundRect(
                    color = tint,
                    topLeft = Offset(2f * s, 3f * s),
                    size = Size(20f * s, 5f * s),
                    cornerRadius = CornerRadius(1.5f * s, 1.5f * s),
                    style = stroke,
                )
                strokeSvgPath("M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8")
                drawLine(tint, Offset(10f * s, 12f * s), Offset(14f * s, 12f * s), strokeWidth = sw, cap = StrokeCap.Round)
            }
            WebUiIconKind.UserMinus -> {
                strokeSvgPath("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2")
                drawCircle(color = tint, radius = 4f * s, center = Offset(9f * s, 7f * s), style = stroke)
                drawLine(tint, Offset(16f * s, 11f * s), Offset(22f * s, 11f * s), strokeWidth = sw, cap = StrokeCap.Round)
            }
            WebUiIconKind.Ban -> {
                drawCircle(color = tint, radius = 9.5f * s, center = Offset(12f * s, 12f * s), style = stroke)
                drawLine(tint, Offset(5.3f * s, 5.3f * s), Offset(18.7f * s, 18.7f * s), strokeWidth = sw, cap = StrokeCap.Round)
            }
            WebUiIconKind.LockClosed -> {
                drawRoundRect(
                    color = tint,
                    topLeft = Offset(4f * s, 11f * s),
                    size = Size(16f * s, 10f * s),
                    cornerRadius = CornerRadius(2.5f * s, 2.5f * s),
                    style = stroke,
                )
                strokeSvgPath("M8 11V7a4 4 0 0 1 8 0v4")
            }
            WebUiIconKind.Unlock -> {
                drawRoundRect(
                    color = tint,
                    topLeft = Offset(4f * s, 11f * s),
                    size = Size(16f * s, 10f * s),
                    cornerRadius = CornerRadius(2.5f * s, 2.5f * s),
                    style = stroke,
                )
                strokeSvgPath("M8 11V7a4 4 0 0 1 7.8-1.2")
            }
            WebUiIconKind.Settings -> {
                drawCircle(color = tint, radius = 3.1f * s, center = Offset(12f * s, 12f * s), style = stroke)
                strokeSvgPath("M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.02 1.42 1.09H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z")
            }
            WebUiIconKind.Trash -> {
                drawLine(tint, Offset(3f * s, 6f * s), Offset(21f * s, 6f * s), strokeWidth = sw, cap = StrokeCap.Round)
                strokeSvgPath("M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6")
                strokeSvgPath("M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2")
                drawLine(tint, Offset(10f * s, 11f * s), Offset(10f * s, 17f * s), strokeWidth = sw, cap = StrokeCap.Round)
                drawLine(tint, Offset(14f * s, 11f * s), Offset(14f * s, 17f * s), strokeWidth = sw, cap = StrokeCap.Round)
            }
            WebUiIconKind.Reply -> {
                strokeSvgPath("M9 17 4 12 9 7")
                strokeSvgPath("M20 18v-2a4 4 0 0 0-4-4H4")
            }
            WebUiIconKind.Forward -> {
                strokeSvgPath("M15 17 20 12 15 7")
                strokeSvgPath("M4 18v-2a4 4 0 0 1 4-4h12")
            }
            WebUiIconKind.Copy -> {
                drawRoundRect(
                    color = tint,
                    topLeft = Offset(9f * s, 9f * s),
                    size = Size(13f * s, 13f * s),
                    cornerRadius = CornerRadius(2f * s, 2f * s),
                    style = stroke,
                )
                strokeSvgPath("M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1")
            }
            WebUiIconKind.Edit -> {
                drawLine(tint, Offset(12f * s, 20f * s), Offset(21f * s, 20f * s), strokeWidth = sw, cap = StrokeCap.Round)
                strokeSvgPath("M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z")
            }
            WebUiIconKind.Undo -> {
                strokeSvgPath("M3 7v6h6")
                strokeSvgPath("M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 3L3 13")
            }
            WebUiIconKind.SmilePlus -> {
                strokeSvgPath("M22 11v1a10 10 0 1 1-9-10")
                strokeSvgPath("M8 14s1.5 2 4 2 4-2 4-2")
                drawCircle(color = tint, radius = 1f * s, center = Offset(9f * s, 9f * s))
                drawCircle(color = tint, radius = 1f * s, center = Offset(15f * s, 9f * s))
                drawLine(tint, Offset(16f * s, 5f * s), Offset(22f * s, 5f * s), strokeWidth = sw, cap = StrokeCap.Round)
                drawLine(tint, Offset(19f * s, 2f * s), Offset(19f * s, 8f * s), strokeWidth = sw, cap = StrokeCap.Round)
            }
            WebUiIconKind.Star -> {
                strokeSvgPath("M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z")
            }
            WebUiIconKind.Link -> {
                strokeSvgPath("M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71")
                strokeSvgPath("M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71")
            }
            WebUiIconKind.Transcript -> {
                drawRoundRect(
                    color = tint,
                    topLeft = Offset(3f * s, 4f * s),
                    size = Size(18f * s, 16f * s),
                    cornerRadius = CornerRadius(3f * s, 3f * s),
                    style = stroke,
                )
                drawLine(tint, Offset(7f * s, 9f * s), Offset(17f * s, 9f * s), strokeWidth = sw, cap = StrokeCap.Round)
                drawLine(tint, Offset(7f * s, 13f * s), Offset(17f * s, 13f * s), strokeWidth = sw, cap = StrokeCap.Round)
                drawLine(tint, Offset(7f * s, 16.5f * s), Offset(12.5f * s, 16.5f * s), strokeWidth = sw, cap = StrokeCap.Round)
            }
            WebUiIconKind.Search -> {
                drawCircle(
                    color = tint,
                    radius = 7f * s,
                    center = Offset(11f * s, 11f * s),
                    style = stroke,
                )
                drawLine(
                    color = tint,
                    start = Offset(16.2f * s, 16.2f * s),
                    end = Offset(21f * s, 21f * s),
                    strokeWidth = sw,
                    cap = StrokeCap.Round,
                )
            }
        }
    }
}
