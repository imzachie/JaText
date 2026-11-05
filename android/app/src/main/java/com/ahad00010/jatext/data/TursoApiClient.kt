package com.ahad00010.jatext.data

import com.ahad00010.jatext.BuildConfig
import java.io.File
import java.io.FileOutputStream
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class TursoApiException(message: String, val statusCode: Int = 500) : Exception(message)

class TwoFactorRequiredException(
    val challengeToken: String,
    val email: String = "",
) : Exception("Enter your authentication code")

object TursoApiClient {
    val apiOrigin: String = BuildConfig.API_ORIGIN.trimEnd('/')

    /** Where the newest published build always lives, whatever the server state. */
    private const val GITHUB_APK_MANIFEST_URL =
        "https://raw.githubusercontent.com/Ahad00010/JaText/main/release-cdn/apk-version.json"
    private const val GITHUB_APK_DOWNLOAD_URL =
        "https://github.com/Ahad00010/JaText/releases/download/apk-latest/JaText-release.apk"

    private const val MEDIA_CHUNK_BYTES = 768 * 1024
    private const val CHUNK_UPLOAD_THRESHOLD = 700 * 1024
    private const val MAX_UPLOAD_BYTES = 64 * 1024 * 1024
    private const val RANGE_SLICE_BYTES = 3 * 1024 * 1024

    val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val octetMediaType = "application/octet-stream".toMediaType()

    fun anyToJsonElement(value: Any?): JsonElement = when (value) {
        null -> JsonNull
        is JsonElement -> value
        is Boolean -> JsonPrimitive(value)
        is Number -> JsonPrimitive(value)
        is String -> JsonPrimitive(value)
        is Map<*, *> -> JsonObject(
            value.entries
                .filter { it.key != null }
                .associate { it.key.toString() to anyToJsonElement(it.value) }
        )
        is Iterable<*> -> JsonArray(value.map { anyToJsonElement(it) })
        is Array<*> -> JsonArray(value.map { anyToJsonElement(it) })
        else -> JsonPrimitive(value.toString())
    }

    suspend fun rpcRaw(
        op: String,
        args: Map<String, Any?> = emptyMap(),
        token: String? = null,
        onRefreshedToken: ((String) -> Unit)? = null,
    ): JsonElement = withContext(Dispatchers.IO) {
        val payloadObj = JsonObject(
            mapOf(
                "op" to JsonPrimitive(op),
                "args" to anyToJsonElement(args),
            )
        )
        val reqBuilder = Request.Builder()
            .url("$apiOrigin/api/turso")
            .post(payloadObj.toString().toRequestBody(jsonMediaType))
            .header("Content-Type", "application/json")
        if (!token.isNullOrBlank()) {
            reqBuilder.header("Authorization", "Bearer $token")
        }

        val request = reqBuilder.build()
        var lastError: Throwable? = null
        val maxAttempts = 3
        for (attempt in 0 until maxAttempts) {
            try {
                httpClient.newCall(request).execute().use { resp ->
                    val rawText = resp.body?.string().orEmpty()
                    val root = try {
                        JaTextJson.parseToJsonElement(rawText).jsonObject
                    } catch (_: Throwable) {
                        null
                    }
                    val ok = root?.get("ok")?.jsonPrimitive?.booleanOrNull == true
                    if (!resp.isSuccessful || !ok) {
                        val errMsg = root?.get("error")?.jsonPrimitive?.contentOrNull
                            ?: "Request failed (${resp.code})"
                        val apiEx = TursoApiException(errMsg, resp.code)
                        val retryable = resp.code == 429 || resp.code == 408 || resp.code >= 502
                        if (retryable && attempt + 1 < maxAttempts) {
                            lastError = apiEx
                        } else {
                            throw apiEx
                        }
                    } else {
                        val dataEl = root?.get("data") ?: JsonNull
                        if (dataEl is JsonObject) {
                            val refreshed = dataEl["refreshedToken"]?.jsonPrimitive?.contentOrNull
                            if (!refreshed.isNullOrBlank()) {
                                onRefreshedToken?.invoke(refreshed)
                            }
                        }
                        return@withContext dataEl
                    }
                }
            } catch (e: TursoApiException) {
                val retryable = e.statusCode == 429 || e.statusCode == 408 || e.statusCode >= 502
                if (!retryable || attempt + 1 >= maxAttempts) throw e
                lastError = e
            } catch (e: Throwable) {
                if (attempt + 1 >= maxAttempts) throw e
                lastError = e
            }
            delay(180L * (attempt + 1))
        }
        throw lastError ?: TursoApiException("Network request failed.")
    }

    suspend inline fun <reified T> rpc(
        op: String,
        args: Map<String, Any?> = emptyMap(),
        token: String? = null,
        noinline onRefreshedToken: ((String) -> Unit)? = null,
    ): T {
        val el = rpcRaw(op, args, token, onRefreshedToken)
        return JaTextJson.decodeFromJsonElement(kotlinx.serialization.serializer<T>(), el)
    }

    /* ==================== Native In-App Google Sign-In API ==================== */

    data class GoogleOAuthServerConfig(
        val clientId: String,
        val androidClientConfigured: Boolean,
    )

    data class MobileOAuthPollResult(
        val status: String,
        val token: String? = null,
        val me: JaUser? = null,
        val error: String? = null,
        val challengeToken: String? = null,
    )

    suspend fun fetchGoogleOAuthServerConfig(): GoogleOAuthServerConfig? = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder()
                .url("$apiOrigin/api/oauth-google?action=config")
                .get()
                .build()
            httpClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                val obj = JaTextJson.parseToJsonElement(resp.body?.string().orEmpty()).jsonObject
                val cid = obj["clientId"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
                    ?: return@withContext null
                val androidReady = obj["androidClientConfigured"]?.jsonPrimitive?.booleanOrNull == true
                GoogleOAuthServerConfig(clientId = cid, androidClientConfigured = androidReady)
            }
        } catch (_: Throwable) {
            null
        }
    }

    suspend fun fetchGoogleOAuthWebClientId(): String? =
        fetchGoogleOAuthServerConfig()?.clientId

    suspend fun pollGoogleMobileSession(mobileSessionId: String): MobileOAuthPollResult =
        withContext(Dispatchers.IO) {
            try {
                val encoded = URLEncoder.encode(mobileSessionId, "UTF-8")
                val req = Request.Builder()
                    .url("$apiOrigin/api/oauth-google?action=poll&mobileSession=$encoded")
                    .get()
                    .build()
                httpClient.newCall(req).execute().use { resp ->
                    val raw = resp.body?.string().orEmpty()
                    val obj = try {
                        JaTextJson.parseToJsonElement(raw).jsonObject
                    } catch (_: Throwable) {
                        null
                    } ?: return@withContext MobileOAuthPollResult(status = "pending")
                    val status = obj["status"]?.jsonPrimitive?.contentOrNull ?: "pending"
                    val token = obj["token"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
                    val error = obj["error"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
                    val challengeToken = obj["challengeToken"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
                    val meEl = obj["me"]
                    val me = if (meEl != null && meEl !is JsonNull) {
                        try {
                            JaTextJson.decodeFromJsonElement(JaUser.serializer(), meEl)
                        } catch (_: Throwable) {
                            null
                        }
                    } else {
                        null
                    }
                    MobileOAuthPollResult(
                        status = status,
                        token = token,
                        me = me,
                        error = error,
                        challengeToken = challengeToken,
                    )
                }
            } catch (_: Throwable) {
                MobileOAuthPollResult(status = "pending")
            }
        }

    suspend fun signInWithGoogleIdToken(idToken: String): Pair<String, JaUser> =
        withContext(Dispatchers.IO) {
            val bodyJson = JsonObject(
                mapOf("idToken" to JsonPrimitive(idToken))
            ).toString()
            val req = Request.Builder()
                .url("$apiOrigin/api/oauth-google")
                .post(bodyJson.toRequestBody(jsonMediaType))
                .header("Content-Type", "application/json")
                .build()
            httpClient.newCall(req).execute().use { resp ->
                val raw = resp.body?.string().orEmpty()
                val obj = try {
                    JaTextJson.parseToJsonElement(raw).jsonObject
                } catch (_: Throwable) {
                    null
                }
                val ok = obj?.get("ok")?.jsonPrimitive?.booleanOrNull == true
                val requiresTwoFactor = obj?.get("requiresTwoFactor")?.jsonPrimitive?.booleanOrNull == true
                val challengeToken = obj?.get("challengeToken")?.jsonPrimitive?.contentOrNull
                if (resp.isSuccessful && ok && requiresTwoFactor && !challengeToken.isNullOrBlank()) {
                    val email = obj["email"]?.jsonPrimitive?.contentOrNull.orEmpty()
                    throw TwoFactorRequiredException(challengeToken, email)
                }
                val token = obj?.get("token")?.jsonPrimitive?.contentOrNull
                if (!resp.isSuccessful || !ok || token.isNullOrBlank()) {
                    val err = obj?.get("error")?.jsonPrimitive?.contentOrNull
                        ?: "Google Sign-In failed (${resp.code})."
                    throw TursoApiException(err, resp.code)
                }
                val meEl = obj["me"]
                val me = if (meEl != null && meEl !is JsonNull) {
                    JaTextJson.decodeFromJsonElement(JaUser.serializer(), meEl)
                } else {
                    JaUser()
                }
                token to me
            }
        }

    /* ==================== Chunked Media Upload & Range Streaming ==================== */

    suspend fun uploadMediaBytes(
        bytes: ByteArray,
        fileName: String,
        mimeType: String,
        token: String,
    ): String = withContext(Dispatchers.IO) {
        if (bytes.isEmpty()) throw TursoApiException("Selected file is empty.", 400)
        if (bytes.size > MAX_UPLOAD_BYTES) {
            throw TursoApiException("Attachment exceeds the 64 MB size limit.", 413)
        }
        val baseMime = mimeType.substringBefore(';').trim().ifBlank { "application/octet-stream" }
        val storageMime = if (baseMime == "application/x-jatext-call+json") {
            "application/json"
        } else {
            baseMime
        }
        val safeName = fileName.ifBlank { "attachment" }

        if (bytes.size <= CHUNK_UPLOAD_THRESHOLD) {
            val encodedName = URLEncoder.encode(safeName, "UTF-8")
            val req = Request.Builder()
                .url("$apiOrigin/api/media")
                .post(bytes.toRequestBody(storageMime.toMediaType()))
                .header("Authorization", "Bearer $token")
                .header("Content-Type", storageMime)
                .header("X-JaText-Mime", storageMime)
                .header("X-JaText-Filename", encodedName)
                .build()
            return@withContext executeWithRetry(req) { resp ->
                val obj = JaTextJson.parseToJsonElement(resp.body?.string().orEmpty()).jsonObject
                val url = obj["url"]?.jsonPrimitive?.contentOrNull
                if (!resp.isSuccessful || url.isNullOrBlank()) {
                    throw TursoApiException(
                        obj["error"]?.jsonPrimitive?.contentOrNull ?: "Upload failed.",
                        resp.code
                    )
                }
                resolveAbsoluteMediaUrl(url)
            }
        }

        val chunkCount = (bytes.size + MEDIA_CHUNK_BYTES - 1) / MEDIA_CHUNK_BYTES
        val initJson = JsonObject(
            mapOf(
                "mimeType" to JsonPrimitive(storageMime),
                "fileName" to JsonPrimitive(safeName),
                "byteSize" to JsonPrimitive(bytes.size),
                "chunkCount" to JsonPrimitive(chunkCount),
            )
        ).toString()
        val initReq = Request.Builder()
            .url("$apiOrigin/api/media?action=init")
            .post(initJson.toRequestBody(jsonMediaType))
            .header("Authorization", "Bearer $token")
            .header("Content-Type", "application/json")
            .build()

        val (mediaId, finalUrl, chunkBytes) = executeWithRetry(initReq) { resp ->
            val obj = JaTextJson.parseToJsonElement(resp.body?.string().orEmpty()).jsonObject
            val id = obj["id"]?.jsonPrimitive?.contentOrNull
            val url = obj["url"]?.jsonPrimitive?.contentOrNull
            val cSize = obj["chunkSize"]?.jsonPrimitive?.intOrNull ?: MEDIA_CHUNK_BYTES
            if (!resp.isSuccessful || id.isNullOrBlank() || url.isNullOrBlank()) {
                throw TursoApiException(
                    obj["error"]?.jsonPrimitive?.contentOrNull ?: "Chunked upload init failed.",
                    resp.code
                )
            }
            Triple(id, resolveAbsoluteMediaUrl(url), cSize)
        }

        val totalChunks = (bytes.size + chunkBytes - 1) / chunkBytes
        val nextIndex = AtomicInteger(0)
        val workers = minOf(4, totalChunks)
        coroutineScope {
            (0 until workers).map {
                async(Dispatchers.IO) {
                    while (true) {
                        val idx = nextIndex.getAndIncrement()
                        if (idx >= totalChunks) break
                        val start = idx * chunkBytes
                        val len = minOf(chunkBytes, bytes.size - start)
                        val chunkReq = Request.Builder()
                            .url(
                                "$apiOrigin/api/media?action=chunk&id=${
                                    URLEncoder.encode(mediaId, "UTF-8")
                                }&index=$idx"
                            )
                            .post(bytes.toRequestBody(octetMediaType, start, len))
                            .header("Authorization", "Bearer $token")
                            .header("Content-Type", "application/octet-stream")
                            .header("X-JaText-Chunk-Index", idx.toString())
                            .build()
                        executeWithRetry(chunkReq) { resp ->
                            if (!resp.isSuccessful) {
                                throw TursoApiException("Upload chunk $idx failed (${resp.code}).", resp.code)
                            }
                        }
                    }
                }
            }.awaitAll()
        }
        finalUrl
    }

    fun resolveAbsoluteMediaUrl(rawUrl: String): String {
        val trimmed = rawUrl.trim()
        if (
            trimmed.startsWith("http://") ||
            trimmed.startsWith("https://") ||
            trimmed.startsWith("data:") ||
            trimmed.startsWith("content:") ||
            trimmed.startsWith("file:")
        ) {
            return trimmed
        }
        if (trimmed.startsWith("/")) return "$apiOrigin$trimmed"
        return "$apiOrigin/$trimmed"
    }

    suspend fun fetchMediaBytesSmart(rawUrl: String, hintTotalBytes: Int = 0): ByteArray =
        withContext(Dispatchers.IO) {
            val mediaUrl = resolveAbsoluteMediaUrl(rawUrl)
            var knownSize = hintTotalBytes
            if (knownSize <= 0) {
                val szMatch = Regex("[?&]sz=(\\d+)").find(mediaUrl)
                knownSize = szMatch?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 0
            }

            suspend fun fetchSlice(start: Int, end: Int): ByteArray {
                val req = Request.Builder()
                    .url(mediaUrl)
                    .get()
                    .header("Range", "bytes=$start-$end")
                    .build()
                return executeWithRetry(req) { resp ->
                    if (!resp.isSuccessful && resp.code != 206) {
                        throw TursoApiException("Media slice failed (${resp.code})", resp.code)
                    }
                    resp.body?.bytes() ?: ByteArray(0)
                }
            }

            if (knownSize > RANGE_SLICE_BYTES) {
                val out = ByteArray(knownSize)
                val ranges = mutableListOf<Pair<Int, Int>>()
                var offset = 0
                while (offset < knownSize) {
                    ranges.add(offset to minOf(knownSize - 1, offset + RANGE_SLICE_BYTES - 1))
                    offset += RANGE_SLICE_BYTES
                }
                val idxRef = AtomicInteger(0)
                coroutineScope {
                    (0 until minOf(4, ranges.size)).map {
                        async(Dispatchers.IO) {
                            while (true) {
                                val i = idxRef.getAndIncrement()
                                if (i >= ranges.size) break
                                val (s, e) = ranges[i]
                                val part = fetchSlice(s, e)
                                System.arraycopy(part, 0, out, s, minOf(part.size, out.size - s))
                            }
                        }
                    }.awaitAll()
                }
                return@withContext out
            }

            val req = Request.Builder().url(mediaUrl).get().build()
            val (code, firstBytes, totalSize) = executeWithRetry(req) { resp ->
                if (!resp.isSuccessful && resp.code != 206) {
                    throw TursoApiException("Media download failed (${resp.code})", resp.code)
                }
                val bytes = resp.body?.bytes() ?: ByteArray(0)
                val rangeHdr = resp.header("Content-Range").orEmpty()
                val totalFromRange = Regex("/(\\d+)$").find(rangeHdr)?.groupValues?.getOrNull(1)?.toIntOrNull()
                val totalFromHdr = resp.header("X-JaText-Total-Size")?.toIntOrNull()
                Triple(resp.code, bytes, totalFromRange ?: totalFromHdr ?: bytes.size)
            }

            if (code != 206 || totalSize <= firstBytes.size) {
                return@withContext firstBytes
            }

            val out = ByteArray(totalSize)
            System.arraycopy(firstBytes, 0, out, 0, firstBytes.size)
            val ranges = mutableListOf<Pair<Int, Int>>()
            var offset = firstBytes.size
            while (offset < totalSize) {
                ranges.add(offset to minOf(totalSize - 1, offset + RANGE_SLICE_BYTES - 1))
                offset += RANGE_SLICE_BYTES
            }
            val idxRef = AtomicInteger(0)
            coroutineScope {
                (0 until minOf(4, ranges.size)).map {
                    async(Dispatchers.IO) {
                        while (true) {
                            val i = idxRef.getAndIncrement()
                            if (i >= ranges.size) break
                            val (s, e) = ranges[i]
                            val part = fetchSlice(s, e)
                            System.arraycopy(part, 0, out, s, minOf(part.size, out.size - s))
                        }
                    }
                }.awaitAll()
            }
            out
        }

    /* ==================== OpenGraph Link Preview & OTA APK Updater ==================== */

    private val linkPreviewCache = java.util.concurrent.ConcurrentHashMap<String, LinkPreviewInfo>()

    suspend fun fetchLinkPreview(targetUrl: String): LinkPreviewInfo? = withContext(Dispatchers.IO) {
        linkPreviewCache[targetUrl]?.let { return@withContext it }
        try {
            val encoded = URLEncoder.encode(targetUrl, "UTF-8")
            val req = Request.Builder()
                .url("$apiOrigin/api/link-preview?url=$encoded")
                .get()
                .build()
            httpClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                val raw = resp.body?.string().orEmpty()
                val root = JaTextJson.parseToJsonElement(raw).jsonObject
                val previewEl = root["preview"] ?: root
                val parsed = JaTextJson.decodeFromJsonElement(LinkPreviewInfo.serializer(), previewEl)
                if (!parsed.title.isNullOrBlank() || !parsed.description.isNullOrBlank()) {
                    linkPreviewCache[targetUrl] = parsed
                    parsed
                } else {
                    null
                }
            }
        } catch (_: Throwable) {
            null
        }
    }

    /**
     * The manifest is published in the repo and copied into the web build, so a
     * self hosted server only ever advertises the build it last rebuilt, which
     * goes stale the moment its updater misses a run. GitHub is checked too and
     * the newest one wins, so a phone is still offered the latest build when the
     * server has fallen behind.
     *
     * The download follows whichever manifest won: the apk a stale server still
     * has on disk can be several builds older than the manifest it copied at the
     * same time, so the GitHub manifest pairs with the GitHub release asset.
     */
    suspend fun fetchLatestApkManifest(): ApkVersionManifest? = withContext(Dispatchers.IO) {
        val stamp = System.currentTimeMillis()
        val candidates = listOf(
            "$apiOrigin/apk-version.json?t=$stamp" to null,
            "$GITHUB_APK_MANIFEST_URL?t=$stamp" to GITHUB_APK_DOWNLOAD_URL,
        )
        var best: ApkVersionManifest? = null
        for ((url, downloadOverride) in candidates) {
            try {
                val req = Request.Builder()
                    .url(url)
                    .header("Cache-Control", "no-cache, no-store, must-revalidate")
                    .header("Pragma", "no-cache")
                    .get()
                    .build()
                val parsed = httpClient.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) null
                    else JaTextJson.decodeFromString<ApkVersionManifest>(resp.body?.string().orEmpty())
                }
                if (parsed == null || parsed.versionCode <= 0) continue
                val resolved =
                    if (downloadOverride != null) parsed.copy(downloadUrl = downloadOverride)
                    else parsed
                val current = best
                if (current == null || resolved.versionCode > current.versionCode) {
                    best = resolved
                }
            } catch (_: Throwable) {
            }
        }
        best
    }

    suspend fun downloadApkFile(
        downloadUrl: String,
        destFile: File,
        onProgress: (Float) -> Unit,
    ): File = withContext(Dispatchers.IO) {
        val url = resolveAbsoluteMediaUrl(downloadUrl)
        destFile.parentFile?.mkdirs()

        fun openFrom(offset: Long): okhttp3.Response {
            val builder = Request.Builder().url(url).get()
            if (offset > 0L) builder.header("Range", "bytes=$offset-")
            return httpClient.newCall(builder.build()).execute()
        }

        // Whatever is already there is the part that downloaded before the
        // screen locked, the network dropped or the app was pushed out of
        // memory. Ask for the rest of it rather than starting again.
        var alreadyHave = if (destFile.exists()) destFile.length() else 0L
        var resp = openFrom(alreadyHave)
        // 416 means the part on disk runs past the end of what the server is
        // serving, which happens when a newer APK was published while an older
        // download was half finished. The stale part is worthless, so drop it
        // and fetch the whole thing instead of failing the update.
        if (resp.code == 416 && alreadyHave > 0L) {
            resp.close()
            destFile.delete()
            alreadyHave = 0L
            resp = openFrom(0L)
        }
        resp.use { response ->
            // 206 means the server is sending the remainder, anything else is
            // a full body and the partial file has to be thrown away.
            val resumed = response.code == 206 && alreadyHave > 0L
            if (!resumed && !response.isSuccessful) {
                throw TursoApiException("APK download failed (${response.code})", response.code)
            }
            val body = response.body ?: throw TursoApiException("Empty APK response", 500)
            val remaining = body.contentLength()
            val total = if (resumed) alreadyHave + remaining else remaining
            body.byteStream().use { input ->
                FileOutputStream(destFile, resumed).use { output ->
                    val buf = ByteArray(64 * 1024)
                    var downloaded = alreadyHave
                    while (true) {
                        val n = input.read(buf)
                        if (n <= 0) break
                        output.write(buf, 0, n)
                        downloaded += n
                        if (total > 0L) {
                            onProgress((downloaded.toFloat() / total.toFloat()).coerceIn(0f, 1f))
                        }
                    }
                    output.flush()
                }
            }
            // Guard against being handed a short or mangled file. An APK is a
            // zip, so if it does not start with PK it is not something we can
            // install, and keeping it would fail every later attempt too.
            if (total > 0L && destFile.length() != total) {
                destFile.delete()
                throw TursoApiException("APK download was cut short, trying again", 500)
            }
            val head = ByteArray(2)
            destFile.inputStream().use { it.read(head) }
            if (head[0] != 0x50.toByte() || head[1] != 0x4B.toByte()) {
                destFile.delete()
                throw TursoApiException("Downloaded APK is not a valid package", 500)
            }
        }
        onProgress(1f)
        destFile
    }

    private suspend fun <R> executeWithRetry(
        request: Request,
        attempts: Int = 3,
        block: (okhttp3.Response) -> R,
    ): R {
        var lastErr: Throwable? = null
        for (i in 0 until attempts) {
            try {
                httpClient.newCall(request).execute().use { resp ->
                    if (resp.code >= 500 && i + 1 < attempts) {
                        lastErr = TursoApiException("Server error (${resp.code})", resp.code)
                    } else {
                        return block(resp)
                    }
                }
            } catch (e: TursoApiException) {
                if (e.statusCode < 500 || i + 1 >= attempts) throw e
                lastErr = e
            } catch (e: Throwable) {
                lastErr = e
                if (i + 1 >= attempts) throw e
            }
            delay(250L * (i + 1))
        }
        throw lastErr ?: TursoApiException("Network request failed.")
    }
}
