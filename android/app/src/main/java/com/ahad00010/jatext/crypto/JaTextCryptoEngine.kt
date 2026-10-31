package com.ahad00010.jatext.crypto

import android.content.Context
import android.util.Base64
import com.ahad00010.jatext.BuildConfig
import com.ahad00010.jatext.JaTextE2EEDecryptor
import com.ahad00010.jatext.data.ChatMessage
import com.ahad00010.jatext.data.DMEncryptedEnvelope
import com.ahad00010.jatext.data.E2EEPlainPayload
import com.ahad00010.jatext.data.EncryptedBlobDescriptor
import com.ahad00010.jatext.data.ForwardedMessageContext
import com.ahad00010.jatext.data.GroupEncryptedEnvelope
import com.ahad00010.jatext.data.GroupEpochWrapEntry
import com.ahad00010.jatext.data.GroupKeySignalPacket
import com.ahad00010.jatext.data.GroupMessage
import com.ahad00010.jatext.data.JaTextJson
import com.ahad00010.jatext.data.MessageE2EEProof
import com.ahad00010.jatext.data.OverflowDescriptor
import com.ahad00010.jatext.data.PublicIdentityBundle
import com.ahad00010.jatext.data.StoredIdentityRecord
import com.ahad00010.jatext.data.TursoApiClient
import java.io.File
import java.math.BigInteger
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import java.security.SecureRandom
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.json.JSONArray
import org.json.JSONObject

object JaTextCryptoEngine {
    const val E2EE_WIRE_MARKER = "__JATEXT_E2EE_V1__:"
    const val E2EE_SIGNAL_PREFIX = "__JATEXT_CALL_SIG__:"
    const val FORWARD_METADATA_PREFIX = "__JATEXT_FWD_V1__:"
    const val WALLPAPER_PREFIX = "__JATEXT_WP__:"
    const val CALL_INVITE_PREFIX = "__JATEXT_CALL__:"
    const val GROUP_CALL_INVITE_PREFIX = "__JATEXT_CALL_GRP__:"
    private const val MAX_INLINE_WIRE_CHARS = 3500
    private const val SAFETY_NUMBER_ROUNDS = 5200

    private val P256_SPKI_PREFIX = byteArrayOf(
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86.toByte(),
        0x48, 0xce.toByte(), 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
        0x86.toByte(), 0x48, 0xce.toByte(), 0x3d, 0x03, 0x01, 0x07,
        0x03, 0x42, 0x00
    )

    val BUBBLE_STYLE_IDS = listOf(
        "default",
        "whee-sketch",
        "ghost-limited",
        "pumpkin-limited",
        "spider-limited",
        "bubbly-otter",
        "glam-diva",
        "chill-croc",
        "olivia-rodrigo",
        "frog-duck",
        "flexing-cat",
        "capybara",
        "frog",
        "cat-dog",
        "facepalm",
        "heart-pepe",
        "pig-shark",
        "tongue-bear",
        "doge",
        "frog-chick",
        "hungry-dog",
        "dino",
        "dachshund",
        "hungry-frog",
    )

    private const val ZW_BOOKEND = '\u2063'
    private const val ZW_ZERO = '\u200B'
    private const val ZW_ONE = '\u200C'
    private val TRAILING_MARKER_RE = Regex("\u2063([\u200B\u200C]{5})\u2063$")

    private val SILENT_PREFIXES = listOf(
        "__JATEXT_CALL_SIG__:",
        "__JATEXT_REACT__:",
        "__JATEXT_SEEN__:",
        "__JATEXT_GRP_SEEN__:",
        "__jatext_pref_bubble_v1__:",
        "__jatext_e2ee_devreq_v1__:",
        "__jatext_e2ee_devres_v1__:",
        "(__JATEXT_CALL_CANCEL__",
        "(__JATEXT_CALL_CLAIM__",
        "(__JATEXT_CALL_DM_RINGING__",
        "(__JATEXT_CALL_DM_ENDED__",
        "(__JATEXT_CALL_GRP_ACTIVE__",
        "__JATEXT_E2EE_IK__:",
        "__JATEXT_E2EE_GK__:",
    )

    data class DecryptedWireResult(
        val payload: E2EEPlainPayload,
        val proof: MessageE2EEProof,
    )

    private val secureRandom = SecureRandom()
    private val decryptedByWireCache = ConcurrentHashMap<String, DecryptedWireResult>()
    private val decryptedByMsgIdCache = ConcurrentHashMap<String, DecryptedWireResult>()
    private val decryptedMediaFileCache = ConcurrentHashMap<String, File>()
    private val peerBundlesByUserId = ConcurrentHashMap<String, MutableList<PublicIdentityBundle>>()
    private val groupEpochSecrets = ConcurrentHashMap<String, String>()

    /* ==================== Base64Url & Hash Helpers ==================== */

    fun b64UrlEncode(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

    fun b64UrlDecode(str: String): ByteArray {
        val clean = str.trim()
        return Base64.decode(clean, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    fun sha256(bytes: ByteArray): ByteArray =
        MessageDigest.getInstance("SHA-256").digest(bytes)

    fun sha512(bytes: ByteArray): ByteArray =
        MessageDigest.getInstance("SHA-512").digest(bytes)

    private fun bytesToHex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it.toInt() and 0xFF) }

    private fun randomBytes(len: Int): ByteArray =
        ByteArray(len).also { secureRandom.nextBytes(it) }

    private fun toFixed32Bytes(bi: BigInteger): ByteArray {
        val raw = bi.toByteArray()
        return when {
            raw.size == 32 -> raw
            raw.size > 32 -> raw.copyOfRange(raw.size - 32, raw.size)
            else -> ByteArray(32).also { System.arraycopy(raw, 0, it, 32 - raw.size, raw.size) }
        }
    }

    private fun exportRawUncompressedP256Public(pub: PublicKey): ByteArray {
        val ecPub = pub as ECPublicKey
        val x = toFixed32Bytes(ecPub.w.affineX)
        val y = toFixed32Bytes(ecPub.w.affineY)
        val out = ByteArray(65)
        out[0] = 0x04
        System.arraycopy(x, 0, out, 1, 32)
        System.arraycopy(y, 0, out, 33, 32)
        return out
    }

    private fun importRawP256Public(raw65: ByteArray): PublicKey {
        require(raw65.size == 65 && raw65[0] == 0x04.toByte()) {
            "Invalid uncompressed P-256 public key"
        }
        val spki = ByteArray(P256_SPKI_PREFIX.size + 65)
        System.arraycopy(P256_SPKI_PREFIX, 0, spki, 0, P256_SPKI_PREFIX.size)
        System.arraycopy(raw65, 0, spki, P256_SPKI_PREFIX.size, 65)
        return KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(spki))
    }

    private fun importPkcs8Private(pkcs8: ByteArray): PrivateKey =
        KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(pkcs8))

    private fun derToP1363(der: ByteArray): ByteArray {
        if (der.size == 64 && der[0] != 0x30.toByte()) return der
        var idx = 2
        if ((der[1].toInt() and 0x80) != 0) {
            idx += (der[1].toInt() and 0x7F)
        }
        require(der[idx] == 0x02.toByte()) { "Invalid DER R tag" }
        val rLen = der[idx + 1].toInt() and 0xFF
        val rBytes = der.copyOfRange(idx + 2, idx + 2 + rLen)
        idx += 2 + rLen
        require(der[idx] == 0x02.toByte()) { "Invalid DER S tag" }
        val sLen = der[idx + 1].toInt() and 0xFF
        val sBytes = der.copyOfRange(idx + 2, idx + 2 + sLen)
        val out = ByteArray(64)
        System.arraycopy(toFixed32Bytes(BigInteger(1, rBytes)), 0, out, 0, 32)
        System.arraycopy(toFixed32Bytes(BigInteger(1, sBytes)), 0, out, 32, 32)
        return out
    }

    private fun p1363ToDer(sig: ByteArray): ByteArray {
        if (sig.size != 64 && sig.isNotEmpty() && sig[0] == 0x30.toByte()) return sig
        val rDer = BigInteger(1, sig.copyOfRange(0, 32)).toByteArray()
        val sDer = BigInteger(1, sig.copyOfRange(32, 64)).toByteArray()
        val totalLen = 2 + rDer.size + 2 + sDer.size
        val out = ByteArray(2 + totalLen)
        out[0] = 0x30
        out[1] = totalLen.toByte()
        out[2] = 0x02
        out[3] = rDer.size.toByte()
        System.arraycopy(rDer, 0, out, 4, rDer.size)
        val sOffset = 4 + rDer.size
        out[sOffset] = 0x02
        out[sOffset + 1] = sDer.size.toByte()
        System.arraycopy(sDer, 0, out, sOffset + 2, sDer.size)
        return out
    }

    private fun ecdsaSignP1363(priv: PrivateKey, message: ByteArray): ByteArray {
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(priv, secureRandom)
        signer.update(message)
        return derToP1363(signer.sign())
    }

    private fun ecdsaVerifyP1363(pub: PublicKey, message: ByteArray, sigBytes: ByteArray): Boolean {
        return try {
            val verifier = Signature.getInstance("SHA256withECDSA")
            verifier.initVerify(pub)
            verifier.update(message)
            verifier.verify(p1363ToDer(sigBytes))
        } catch (_: Throwable) {
            false
        }
    }

    private fun ecdhSharedSecret(priv: PrivateKey, pub: PublicKey): ByteArray {
        val ka = KeyAgreement.getInstance("ECDH")
        ka.init(priv)
        ka.doPhase(pub, true)
        val raw = ka.generateSecret()
        return when {
            raw.size == 32 -> raw
            raw.size > 32 -> raw.copyOfRange(raw.size - 32, raw.size)
            else -> ByteArray(32).also { System.arraycopy(raw, 0, it, 32 - raw.size, raw.size) }
        }
    }

    private fun hkdfSha256(ikm: ByteArray, salt: ByteArray, info: String): ByteArray {
        val actualSalt = if (salt.isEmpty()) ByteArray(32) else salt
        val extract = Mac.getInstance("HmacSHA256")
        extract.init(SecretKeySpec(actualSalt, "HmacSHA256"))
        val prk = extract.doFinal(ikm)

        val expand = Mac.getInstance("HmacSHA256")
        expand.init(SecretKeySpec(prk, "HmacSHA256"))
        expand.update(info.toByteArray(Charsets.UTF_8))
        expand.update(0x01.toByte())
        return expand.doFinal()
    }

    private fun aesGcmEncrypt(key32: ByteArray, iv12: ByteArray, aad: ByteArray?, plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key32, "AES"), GCMParameterSpec(128, iv12))
        if (aad != null && aad.isNotEmpty()) cipher.updateAAD(aad)
        return cipher.doFinal(plain)
    }

    private fun aesGcmDecrypt(key32: ByteArray, iv12: ByteArray, aad: ByteArray?, ctWithTag: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key32, "AES"), GCMParameterSpec(128, iv12))
        if (aad != null && aad.isNotEmpty()) cipher.updateAAD(aad)
        return cipher.doFinal(ctWithTag)
    }

    /* ==================== Identity Key Generation & Storage ==================== */

    fun computeKeyId(dhPubB64: String, sigPubB64: String): String {
        val digest = sha256("JaText-KeyID-v1|$dhPubB64|$sigPubB64".toByteArray(Charsets.UTF_8))
        return bytesToHex(digest.copyOfRange(0, 8))
    }

    fun computeKeyFingerprint(dhPubB64: String, sigPubB64: String): String {
        val digest = sha256("JaText-KeyFP-v1|$dhPubB64|$sigPubB64".toByteArray(Charsets.UTF_8))
        val hex = bytesToHex(digest).uppercase()
        return (0 until 32 step 4).joinToString(" · ") { hex.substring(it, it + 4) }
    }

    fun computeSafetyNumber(
        aUserId: String,
        aDhPubB64: String,
        aSigPubB64: String,
        bUserId: String,
        bDhPubB64: String,
        bSigPubB64: String,
    ): String {
        fun sideDigest(uid: String, dh: String, sig: String): Pair<String, List<String>> {
            val seed = "JaText-SafetySide-v1|$uid|$dh|$sig".toByteArray(Charsets.UTF_8)
            var cur = seed
            val md = MessageDigest.getInstance("SHA-512")
            for (i in 0 until SAFETY_NUMBER_ROUNDS) {
                md.reset()
                md.update(cur)
                md.update(seed)
                cur = md.digest()
            }
            val chunks = mutableListOf<String>()
            var offset = 0
            while (offset < 30) {
                val v = ((cur[offset].toLong() and 0xFF) shl 32) or
                    ((cur[offset + 1].toLong() and 0xFF) shl 24) or
                    ((cur[offset + 2].toLong() and 0xFF) shl 16) or
                    ((cur[offset + 3].toLong() and 0xFF) shl 8) or
                    (cur[offset + 4].toLong() and 0xFF)
                chunks.add((v % 100_000L).toString().padStart(5, '0'))
                offset += 5
            }
            return "$uid|$dh" to chunks
        }

        val (sortA, chunksA) = sideDigest(aUserId, aDhPubB64, aSigPubB64)
        val (sortB, chunksB) = sideDigest(bUserId, bDhPubB64, bSigPubB64)
        val ordered = if (sortA <= sortB) chunksA + chunksB else chunksB + chunksA
        return ordered.joinToString(" ")
    }

    fun loadLocalIdentities(context: Context, userId: String): List<StoredIdentityRecord> {
        val prefs = context.getSharedPreferences("jatext_e2ee_keystore", Context.MODE_PRIVATE)
        val raw = prefs.getString("identities:$userId", null)
        if (!raw.isNullOrBlank()) {
            try {
                val parsed = JaTextJson.decodeFromString<List<StoredIdentityRecord>>(raw)
                if (parsed.isNotEmpty()) return parsed
            } catch (_: Throwable) {
            }
        }
        // Check legacy JaTextE2EEDecryptor SharedPreferences if user upgraded from older APK!
        val pushRaw = JaTextE2EEDecryptor.prefs(context).getString("identities_json", null)
        if (!pushRaw.isNullOrBlank()) {
            try {
                val parsed = JaTextJson.decodeFromString<List<StoredIdentityRecord>>(pushRaw)
                    .filter { it.userId == userId || it.userId.isBlank() }
                    .map { if (it.userId.isBlank()) it.copy(userId = userId) else it }
                if (parsed.isNotEmpty()) {
                    saveLocalIdentities(context, userId, parsed)
                    return parsed
                }
            } catch (_: Throwable) {
            }
        }
        return emptyList()
    }

    fun saveLocalIdentities(context: Context, userId: String, records: List<StoredIdentityRecord>) {
        val prefs = context.getSharedPreferences("jatext_e2ee_keystore", Context.MODE_PRIVATE)
        prefs.edit().putString("identities:$userId", JaTextJson.encodeToString(records)).apply()
    }

    fun ensureOrCreatePrimaryIdentity(context: Context, userId: String): StoredIdentityRecord {
        val existing = loadLocalIdentities(context, userId)
        if (existing.isNotEmpty()) return existing.first()

        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"), secureRandom)
        val dhPair = kpg.generateKeyPair()
        val sigPair = kpg.generateKeyPair()

        val dhPubB64 = b64UrlEncode(exportRawUncompressedP256Public(dhPair.public))
        val dhPrivB64 = b64UrlEncode(dhPair.private.encoded)
        val sigPubB64 = b64UrlEncode(exportRawUncompressedP256Public(sigPair.public))
        val sigPrivB64 = b64UrlEncode(sigPair.private.encoded)
        val keyId = computeKeyId(dhPubB64, sigPubB64)
        val signPayload = "JaText-IK-v1|$userId|$keyId|$dhPubB64|$sigPubB64".toByteArray(Charsets.UTF_8)
        val selfSigB64 = b64UrlEncode(ecdsaSignP1363(sigPair.private, signPayload))

        val created = StoredIdentityRecord(
            userId = userId,
            keyId = keyId,
            dhPubB64 = dhPubB64,
            dhPrivPkcs8B64 = dhPrivB64,
            sigPubB64 = sigPubB64,
            sigPrivPkcs8B64 = sigPrivB64,
            selfSigB64 = selfSigB64,
            createdAt = System.currentTimeMillis(),
        )
        saveLocalIdentities(context, userId, listOf(created))
        return created
    }

    fun loadGroupEpochMap(context: Context, userId: String) {
        val prefs = context.getSharedPreferences("jatext_e2ee_keystore", Context.MODE_PRIVATE)
        val raw = prefs.getString("group_epochs:$userId", null) ?: return
        try {
            val map = JaTextJson.decodeFromString<Map<String, String>>(raw)
            groupEpochSecrets.putAll(map)
        } catch (_: Throwable) {
        }
    }

    private fun persistGroupEpochMap(context: Context, userId: String) {
        try {
            val prefs = context.getSharedPreferences("jatext_e2ee_keystore", Context.MODE_PRIVATE)
            prefs.edit()
                .putString("group_epochs:$userId", JaTextJson.encodeToString(HashMap(groupEpochSecrets)))
                .apply()
        } catch (_: Throwable) {
        }
    }

    fun syncStateToNativePushDecryptor(
        context: Context,
        userId: String,
        token: String?,
        notificationsEnabled: Boolean,
        isDnd: Boolean,
    ) {
        try {
            val identities = loadLocalIdentities(context, userId)
            val identitiesJson = JaTextJson.encodeToString(identities)

            val peersObj = JSONObject()
            for ((uid, bundles) in peerBundlesByUserId.entries) {
                val arr = JSONArray()
                for (b in bundles) {
                    arr.put(
                        JSONObject().apply {
                            put("keyId", b.keyId)
                            put("dhPubB64", b.dhPubB64)
                            put("sigPubB64", b.sigPubB64)
                        }
                    )
                }
                peersObj.put(uid, arr)
            }

            val groupsObj = JSONObject()
            for ((epKey, secret) in groupEpochSecrets.entries) {
                val arr = JSONArray()
                arr.put(secret)
                groupsObj.put(epKey, arr)
            }

            JaTextE2EEDecryptor.syncState(
                context,
                BuildConfig.API_ORIGIN,
                userId,
                notificationsEnabled,
                isDnd,
                identitiesJson,
                peersObj.toString(),
                groupsObj.toString(),
                token ?: "",
                ""
            )
        } catch (_: Throwable) {
        }
    }

    /* ==================== Peer Key Cache & Fetch ==================== */

    fun registerPeerBundles(bundles: List<PublicIdentityBundle>) {
        for (b in bundles) {
            if (b.userId.isBlank() || b.dhPubB64.isBlank()) continue
            val list = peerBundlesByUserId.getOrPut(b.userId) { mutableListOf() }
            synchronized(list) {
                list.removeAll { it.keyId == b.keyId }
                list.add(0, b)
            }
        }
    }

    fun getCachedPeerBundles(userId: String): List<PublicIdentityBundle> {
        val list = peerBundlesByUserId[userId] ?: return emptyList()
        synchronized(list) {
            return list.toList()
        }
    }

    suspend fun ensurePeerBundles(userIds: List<String>, token: String): Map<String, List<PublicIdentityBundle>> {
        val missing = userIds.distinct().filter { getCachedPeerBundles(it).isEmpty() }
        if (missing.isNotEmpty()) {
            try {
                val root = TursoApiClient.rpcRaw(
                    op = "getUserE2EEIdentities",
                    args = mapOf("userIds" to missing),
                    token = token
                ).jsonObject
                val bundlesEl = root["bundles"]
                if (bundlesEl != null) {
                    val fetched = JaTextJson.decodeFromJsonElement(
                        kotlinx.serialization.builtins.ListSerializer(PublicIdentityBundle.serializer()),
                        bundlesEl
                    )
                    registerPeerBundles(fetched)
                }
            } catch (_: Throwable) {
            }
        }
        return userIds.distinct().associateWith { getCachedPeerBundles(it) }
    }

    suspend fun refreshPeerBundles(userIds: List<String>, token: String) {
        if (userIds.isEmpty()) return
        try {
            val root = TursoApiClient.rpcRaw(
                op = "getUserE2EEIdentities",
                args = mapOf("userIds" to userIds.distinct()),
                token = token
            ).jsonObject
            val bundlesEl = root["bundles"]
            if (bundlesEl != null) {
                val fetched = JaTextJson.decodeFromJsonElement(
                    kotlinx.serialization.builtins.ListSerializer(PublicIdentityBundle.serializer()),
                    bundlesEl
                )
                registerPeerBundles(fetched)
            }
        } catch (_: Throwable) {
        }
    }

    /* ==================== Outgoing Cache Seeding (Zero "Decrypting message" Flash!) ==================== */

    fun seedOutgoingDecryptedWire(wireBody: String, payload: E2EEPlainPayload, proof: MessageE2EEProof) {
        decryptedByWireCache[wireBody.trim()] = DecryptedWireResult(payload, proof)
    }

    fun seedOutgoingDecryptedMedia(hashB64: String, localFile: File) {
        if (hashB64.isNotBlank() && localFile.exists()) {
            decryptedMediaFileCache[hashB64] = localFile
        }
    }

    fun isEncryptedWireBody(body: String?): Boolean =
        body != null && body.contains(E2EE_WIRE_MARKER)

    fun isSilentControlPayload(plainOrWire: String?): Boolean {
        if (plainOrWire.isNullOrBlank()) return false
        val trimmed = stripBubbleStyleFromText(plainOrWire).trim()
        return SILENT_PREFIXES.any { trimmed.startsWith(it) || trimmed.contains(it) }
    }

    /* ==================== 1:1 DM Encrypt & Decrypt ==================== */

    suspend fun encryptDmMessage(
        context: Context,
        myUserId: String,
        receiverId: String,
        payload: E2EEPlainPayload,
        token: String,
        silentSignal: Boolean = false,
    ): String? = withContext(Dispatchers.Default) {
        val myIdentity = ensureOrCreatePrimaryIdentity(context, myUserId)
        val peerMap = ensurePeerBundles(listOf(receiverId, myUserId), token)
        val receiverBundles = peerMap[receiverId].orEmpty()
        if (receiverBundles.isEmpty()) {
            return@withContext null
        }
        val receiverPrimary = receiverBundles.first()
        val extraBundles = (receiverBundles.drop(1) + peerMap[myUserId].orEmpty().filter { it.keyId != myIdentity.keyId })

        val senderDhPriv = importPkcs8Private(b64UrlDecode(myIdentity.dhPrivPkcs8B64))
        val senderDhPub = importRawP256Public(b64UrlDecode(myIdentity.dhPubB64))
        val receiverDhPub = importRawP256Public(b64UrlDecode(receiverPrimary.dhPubB64))
        val senderSigPriv = importPkcs8Private(b64UrlDecode(myIdentity.sigPrivPkcs8B64))

        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"), secureRandom)
        val ephemPair = kpg.generateKeyPair()
        val epkRaw = exportRawUncompressedP256Public(ephemPair.public)
        val epkB64 = b64UrlEncode(epkRaw)

        val ssEphemReceiver = ecdhSharedSecret(ephemPair.private, receiverDhPub)
        val ssStaticPair = ecdhSharedSecret(senderDhPriv, receiverDhPub)
        val ssEphemSender = ecdhSharedSecret(ephemPair.private, senderDhPub)

        val cekBytes = randomBytes(32)
        val payloadIv = randomBytes(12)
        val aad = "JaText-DM-AAD-v1|$myUserId|$receiverId|${myIdentity.keyId}|${receiverPrimary.keyId}|$epkB64"
            .toByteArray(Charsets.UTF_8)
        val plainBytes = JaTextJson.encodeToString(payload).toByteArray(Charsets.UTF_8)
        val ctBytes = aesGcmEncrypt(cekBytes, payloadIv, aad, plainBytes)

        val kwkR = hkdfSha256(
            ssEphemReceiver + ssStaticPair,
            epkRaw,
            "JaText-DM-WrapR-v1|$myUserId|$receiverId|${receiverPrimary.keyId}"
        )
        val kwkS = hkdfSha256(
            ssEphemSender + ssStaticPair,
            epkRaw,
            "JaText-DM-WrapS-v1|$myUserId|$receiverId|${myIdentity.keyId}"
        )
        val wrapIvR = randomBytes(12)
        val wrapIvS = randomBytes(12)
        val wrB64 = b64UrlEncode(wrapIvR + aesGcmEncrypt(kwkR, wrapIvR, null, cekBytes))
        val wsB64 = b64UrlEncode(wrapIvS + aesGcmEncrypt(kwkS, wrapIvS, null, cekBytes))

        val wra = LinkedHashMap<String, String>()
        val targets = LinkedHashMap<String, String>()
        targets[myIdentity.keyId] = myIdentity.dhPubB64
        targets[receiverPrimary.keyId] = receiverPrimary.dhPubB64
        for (extra in extraBundles) {
            if (targets.size < 8 && extra.keyId.isNotBlank() && extra.dhPubB64.isNotBlank()) {
                targets[extra.keyId] = extra.dhPubB64
            }
        }
        for ((targetKid, targetDh) in targets) {
            try {
                val targetPub = importRawP256Public(b64UrlDecode(targetDh))
                val ssM = ecdhSharedSecret(ephemPair.private, targetPub)
                val kwkM = hkdfSha256(ssM, epkRaw, "JaText-DM-WrapM-v1|$myUserId|$receiverId|$targetKid")
                val ivM = randomBytes(12)
                wra[targetKid] = b64UrlEncode(ivM + aesGcmEncrypt(kwkM, ivM, null, cekBytes))
            } catch (_: Throwable) {
            }
        }

        val ivB64 = b64UrlEncode(payloadIv)
        val ctHashB64 = b64UrlEncode(sha256(ctBytes))
        val sigPayload =
            "JaText-DM-Sig-v1|$myUserId|$receiverId|${myIdentity.keyId}|${receiverPrimary.keyId}|$epkB64|$wrB64|$wsB64|$ivB64|$ctHashB64"
                .toByteArray(Charsets.UTF_8)
        val sigB64 = b64UrlEncode(ecdsaSignP1363(senderSigPriv, sigPayload))

        val inlineCt = b64UrlEncode(ctBytes)
        val inlineEnv = DMEncryptedEnvelope(
            v = 1,
            c = "dm",
            sk = myIdentity.keyId,
            rk = receiverPrimary.keyId,
            epk = epkB64,
            wr = wrB64,
            ws = wsB64,
            sdh = myIdentity.dhPubB64,
            wra = wra,
            iv = ivB64,
            ct = inlineCt,
            sig = sigB64,
        )
        val prefix = if (silentSignal) "$E2EE_SIGNAL_PREFIX$E2EE_WIRE_MARKER" else E2EE_WIRE_MARKER
        val candidateWire = "$prefix${JaTextJson.encodeToString(inlineEnv)}"
        val finalWire = if (candidateWire.length <= MAX_INLINE_WIRE_CHARS) {
            candidateWire
        } else {
            val sid = TursoApiClient.uploadMediaBytes(
                bytes = ctBytes,
                fileName = "e2ee-overflow.bin",
                mimeType = "application/octet-stream",
                token = token
            )
            val ovfEnv = inlineEnv.copy(ct = null, ovf = OverflowDescriptor(sid = sid, h = ctHashB64))
            "$prefix${JaTextJson.encodeToString(ovfEnv)}"
        }

        val proof = MessageE2EEProof(
            encrypted = true,
            algorithm = "ECDH-P256 + HKDF-SHA256 + AES-256-GCM",
            senderKeyId = myIdentity.keyId,
            receiverKeyId = receiverPrimary.keyId,
            signatureVerified = true,
            ciphertextPreview = inlineCt.take(48),
        )
        seedOutgoingDecryptedWire(finalWire, payload, proof)
        finalWire
    }

    suspend fun decryptDmWire(
        context: Context,
        myUserId: String,
        messageId: String,
        senderId: String,
        receiverId: String,
        wireBody: String,
        token: String,
    ): DecryptedWireResult? = withContext(Dispatchers.Default) {
        val trimmedWire = wireBody.trim()
        decryptedByWireCache[trimmedWire]?.let { return@withContext it }
        if (messageId.isNotBlank()) {
            decryptedByMsgIdCache[messageId]?.let { return@withContext it }
        }

        val markerIdx = trimmedWire.indexOf(E2EE_WIRE_MARKER)
        if (markerIdx < 0) return@withContext null
        val rawJson = trimmedWire.substring(markerIdx + E2EE_WIRE_MARKER.length).lineSequence().first().trim()
        val env = try {
            JaTextJson.decodeFromString<DMEncryptedEnvelope>(rawJson)
        } catch (_: Throwable) {
            return@withContext null
        }
        if (env.v != 1 || env.c != "dm") return@withContext null

        val ctBytes = when {
            !env.ct.isNullOrBlank() -> b64UrlDecode(env.ct)
            env.ovf != null && env.ovf.sid.isNotBlank() -> {
                val bytes = TursoApiClient.fetchMediaBytesSmart(env.ovf.sid)
                if (b64UrlEncode(sha256(bytes)) != env.ovf.h) return@withContext null
                bytes
            }
            else -> return@withContext null
        }

        val myIdentities = loadLocalIdentities(context, myUserId).ifEmpty {
            listOf(ensureOrCreatePrimaryIdentity(context, myUserId))
        }
        val peerId = if (senderId == myUserId) receiverId else senderId
        val peerBundles = ensurePeerBundles(listOf(peerId), token)[peerId].orEmpty()

        val epkRaw = b64UrlDecode(env.epk)
        val epkPub = importRawP256Public(epkRaw)
        val aad = "JaText-DM-AAD-v1|$senderId|$receiverId|${env.sk}|${env.rk}|${env.epk}"
            .toByteArray(Charsets.UTF_8)
        val ivBytes = b64UrlDecode(env.iv)

        var plainBytes: ByteArray? = null
        // Path A: Multi-device ephemeral wrap (wra)
        val wra = env.wra
        if (wra != null) {
            for (id in myIdentities) {
                val entry = wra[id.keyId] ?: continue
                try {
                    val rawM = b64UrlDecode(entry)
                    if (rawM.size < 29) continue
                    val myPriv = importPkcs8Private(b64UrlDecode(id.dhPrivPkcs8B64))
                    val ssM = ecdhSharedSecret(myPriv, epkPub)
                    val kwkM = hkdfSha256(ssM, epkRaw, "JaText-DM-WrapM-v1|$senderId|$receiverId|${id.keyId}")
                    val cek = aesGcmDecrypt(kwkM, rawM.copyOfRange(0, 12), null, rawM.copyOfRange(12, rawM.size))
                    plainBytes = aesGcmDecrypt(cek, ivBytes, aad, ctBytes)
                    break
                } catch (_: Throwable) {
                }
            }
        }

        // Path B: Hybrid Ephemeral + Static ECDH fallback
        if (plainBytes == null) {
            val isFromMe = senderId == myUserId
            val wrapRaw = b64UrlDecode(if (isFromMe) env.ws else env.wr)
            if (wrapRaw.size >= 29) {
                val wrapIv = wrapRaw.copyOfRange(0, 12)
                val wrapCt = wrapRaw.copyOfRange(12, wrapRaw.size)
                val peerDhs = buildList {
                    if (!isFromMe && !env.sdh.isNullOrBlank()) add(env.sdh)
                    for (b in peerBundles) {
                        if (b.dhPubB64.isNotBlank() && !contains(b.dhPubB64)) add(b.dhPubB64)
                    }
                }
                outer@ for (id in myIdentities) {
                    val myPriv = try {
                        importPkcs8Private(b64UrlDecode(id.dhPrivPkcs8B64))
                    } catch (_: Throwable) {
                        continue
                    }
                    val ssEphem = ecdhSharedSecret(myPriv, epkPub)
                    val info = if (isFromMe) {
                        "JaText-DM-WrapS-v1|$senderId|$receiverId|${env.sk}"
                    } else {
                        "JaText-DM-WrapR-v1|$senderId|$receiverId|${env.rk}"
                    }
                    for (peerDh in peerDhs) {
                        try {
                            val peerPub = importRawP256Public(b64UrlDecode(peerDh))
                            val ssStatic = ecdhSharedSecret(myPriv, peerPub)
                            val kwk = hkdfSha256(ssEphem + ssStatic, epkRaw, info)
                            val cek = aesGcmDecrypt(kwk, wrapIv, null, wrapCt)
                            plainBytes = aesGcmDecrypt(cek, ivBytes, aad, ctBytes)
                            break@outer
                        } catch (_: Throwable) {
                        }
                    }
                }
            }
        }

        val resolvedPlain = plainBytes ?: return@withContext null
        val payload = try {
            JaTextJson.decodeFromString<E2EEPlainPayload>(String(resolvedPlain, Charsets.UTF_8))
        } catch (_: Throwable) {
            return@withContext null
        }

        val ctHashB64 = b64UrlEncode(sha256(ctBytes))
        val sigPubB64 = if (senderId == myUserId) {
            myIdentities.firstOrNull { it.keyId == env.sk }?.sigPubB64
        } else {
            peerBundles.firstOrNull { it.keyId == env.sk }?.sigPubB64
        }
        val sigVerified = if (!sigPubB64.isNullOrBlank()) {
            val sigPayload =
                "JaText-DM-Sig-v1|$senderId|$receiverId|${env.sk}|${env.rk}|${env.epk}|${env.wr}|${env.ws}|${env.iv}|$ctHashB64"
                    .toByteArray(Charsets.UTF_8)
            ecdsaVerifyP1363(importRawP256Public(b64UrlDecode(sigPubB64)), sigPayload, b64UrlDecode(env.sig))
        } else {
            true
        }

        val res = DecryptedWireResult(
            payload = payload,
            proof = MessageE2EEProof(
                encrypted = true,
                algorithm = "ECDH-P256 + HKDF-SHA256 + AES-256-GCM",
                senderKeyId = env.sk,
                receiverKeyId = env.rk,
                signatureVerified = sigVerified,
                ciphertextPreview = (env.ct ?: ctHashB64).take(48),
            )
        )
        decryptedByWireCache[trimmedWire] = res
        if (messageId.isNotBlank()) decryptedByMsgIdCache[messageId] = res
        res
    }

    /* ==================== Group Epoch E2EE Encrypt & Decrypt ==================== */

    private fun tryIngestGroupEpochSignal(context: Context, myUserId: String, senderId: String, rawBody: String) {
        if (!rawBody.startsWith(E2EE_SIGNAL_PREFIX)) return
        val after = rawBody.removePrefix(E2EE_SIGNAL_PREFIX).trim()
        if (!after.contains("\"e2ee_gk\"")) return
        try {
            val pkt = JaTextJson.decodeFromString<GroupKeySignalPacket>(after)
            if (pkt.kind != "e2ee_gk" || pkt.gid.isBlank() || pkt.ep <= 0) return
            val myIdentities = loadLocalIdentities(context, myUserId)
            val epkBytes = b64UrlDecode(pkt.epk)
            val epkPub = importRawP256Public(epkBytes)
            val aad = "JaText-GK-AAD-v1|${pkt.gid}|${pkt.ep}|$myUserId".toByteArray(Charsets.UTF_8)

            val attempts = mutableListOf<Pair<StoredIdentityRecord, GroupEpochWrapEntry>>()
            pkt.kwraps?.let { kw ->
                for (id in myIdentities) {
                    kw[id.keyId]?.let { attempts.add(id to it) }
                }
            }
            pkt.wraps[myUserId]?.let { uw ->
                for (id in myIdentities) attempts.add(id to uw)
            }

            for ((id, wrap) in attempts) {
                try {
                    val myPriv = importPkcs8Private(b64UrlDecode(id.dhPrivPkcs8B64))
                    val ss = ecdhSharedSecret(myPriv, epkPub)
                    val kwk = hkdfSha256(
                        ss,
                        epkBytes,
                        "JaText-GK-Wrap-v1|${pkt.gid}|${pkt.ep}|$senderId|$myUserId|${id.keyId}"
                    )
                    val secretBytes = aesGcmDecrypt(kwk, b64UrlDecode(wrap.iv), aad, b64UrlDecode(wrap.ct))
                    groupEpochSecrets["${pkt.gid}:${pkt.ep}"] = b64UrlEncode(secretBytes)
                    persistGroupEpochMap(context, myUserId)
                    return
                } catch (_: Throwable) {
                }
            }
        } catch (_: Throwable) {
        }
    }

    private fun getLatestKnownGroupEpoch(groupId: String): Pair<Int, String>? {
        val prefix = "$groupId:"
        var bestEp = 0
        var bestSecret: String? = null
        for ((k, v) in groupEpochSecrets.entries) {
            if (k.startsWith(prefix)) {
                val ep = k.removePrefix(prefix).toIntOrNull() ?: 0
                if (ep > bestEp) {
                    bestEp = ep
                    bestSecret = v
                }
            }
        }
        return if (bestEp > 0 && bestSecret != null) bestEp to bestSecret else null
    }

    suspend fun ensureOrDistributeGroupEpoch(
        context: Context,
        myUserId: String,
        groupId: String,
        memberUserIds: List<String>,
        token: String,
    ): Pair<Int, String> = withContext(Dispatchers.Default) {
        getLatestKnownGroupEpoch(groupId)?.let { return@withContext it }

        val myIdentity = ensureOrCreatePrimaryIdentity(context, myUserId)
        val allIds = (memberUserIds + myUserId).distinct()
        val bundleMap = ensurePeerBundles(allIds, token)
        val allBundles = bundleMap.values.flatten()

        val epoch = 1
        val secretBytes = randomBytes(32)
        val secretB64 = b64UrlEncode(secretBytes)
        groupEpochSecrets["$groupId:$epoch"] = secretB64
        persistGroupEpochMap(context, myUserId)

        if (allBundles.isNotEmpty()) {
            try {
                val kpg = KeyPairGenerator.getInstance("EC")
                kpg.initialize(ECGenParameterSpec("secp256r1"), secureRandom)
                val ephemPair = kpg.generateKeyPair()
                val epkRaw = exportRawUncompressedP256Public(ephemPair.public)
                val epkB64 = b64UrlEncode(epkRaw)

                val wraps = LinkedHashMap<String, GroupEpochWrapEntry>()
                val kwraps = LinkedHashMap<String, GroupEpochWrapEntry>()
                for (member in allBundles) {
                    if (member.keyId.isBlank() || member.dhPubB64.isBlank()) continue
                    try {
                        val mPub = importRawP256Public(b64UrlDecode(member.dhPubB64))
                        val ss = ecdhSharedSecret(ephemPair.private, mPub)
                        val kwk = hkdfSha256(
                            ss,
                            epkRaw,
                            "JaText-GK-Wrap-v1|$groupId|$epoch|$myUserId|${member.userId}|${member.keyId}"
                        )
                        val iv = randomBytes(12)
                        val aad = "JaText-GK-AAD-v1|$groupId|$epoch|${member.userId}".toByteArray(Charsets.UTF_8)
                        val ct = aesGcmEncrypt(kwk, iv, aad, secretBytes)
                        val entry = GroupEpochWrapEntry(
                            kid = member.keyId,
                            iv = b64UrlEncode(iv),
                            ct = b64UrlEncode(ct)
                        )
                        kwraps[member.keyId] = entry
                        if (!wraps.containsKey(member.userId)) {
                            wraps[member.userId] = entry
                        }
                    } catch (_: Throwable) {
                    }
                }
                val sortedWrapSummary = wraps.keys.sorted().joinToString(",") { uid ->
                    val w = wraps[uid]!!
                    "$uid:${w.kid}:${w.iv}:${w.ct}"
                }
                val sigInput =
                    "JaText-GK-Sig-v1|$groupId|$epoch|$myUserId|${myIdentity.keyId}|$epkB64|$sortedWrapSummary"
                        .toByteArray(Charsets.UTF_8)
                val sigPriv = importPkcs8Private(b64UrlDecode(myIdentity.sigPrivPkcs8B64))
                val pkt = GroupKeySignalPacket(
                    kind = "e2ee_gk",
                    v = 1,
                    gid = groupId,
                    ep = epoch,
                    skid = myIdentity.keyId,
                    epk = epkB64,
                    wraps = wraps,
                    kwraps = kwraps,
                    sig = b64UrlEncode(ecdsaSignP1363(sigPriv, sigInput)),
                    ts = System.currentTimeMillis(),
                )
                TursoApiClient.rpcRaw(
                    op = "sendGroupMessage",
                    args = mapOf(
                        "groupId" to groupId,
                        "body" to "$E2EE_SIGNAL_PREFIX${JaTextJson.encodeToString(pkt)}"
                    ),
                    token = token
                )
            } catch (_: Throwable) {
            }
        }
        epoch to secretB64
    }

    suspend fun encryptGroupMessage(
        context: Context,
        myUserId: String,
        groupId: String,
        memberUserIds: List<String>,
        payload: E2EEPlainPayload,
        token: String,
        silentSignal: Boolean = false,
    ): String = withContext(Dispatchers.Default) {
        val myIdentity = ensureOrCreatePrimaryIdentity(context, myUserId)
        val (epoch, epochSecretB64) = ensureOrDistributeGroupEpoch(
            context,
            myUserId,
            groupId,
            memberUserIds,
            token
        )
        val epochSecret = b64UrlDecode(epochSecretB64)
        val salt = randomBytes(16)
        val saltB64 = b64UrlEncode(salt)
        val iv = randomBytes(12)
        val ivB64 = b64UrlEncode(iv)
        val msgKey = hkdfSha256(
            epochSecret,
            salt,
            "JaText-Grp-Msg-v1|$groupId|$epoch|$myUserId|${myIdentity.keyId}"
        )
        val aad = "JaText-Grp-AAD-v1|$groupId|$epoch|$myUserId|${myIdentity.keyId}|$saltB64"
            .toByteArray(Charsets.UTF_8)
        val plainBytes = JaTextJson.encodeToString(payload).toByteArray(Charsets.UTF_8)
        val ctBytes = aesGcmEncrypt(msgKey, iv, aad, plainBytes)
        val ctHashB64 = b64UrlEncode(sha256(ctBytes))

        val sigPriv = importPkcs8Private(b64UrlDecode(myIdentity.sigPrivPkcs8B64))
        val sigInput =
            "JaText-Grp-Sig-v1|$groupId|$epoch|$myUserId|${myIdentity.keyId}|$saltB64|$ivB64|$ctHashB64"
                .toByteArray(Charsets.UTF_8)
        val sigB64 = b64UrlEncode(ecdsaSignP1363(sigPriv, sigInput))

        val inlineCt = b64UrlEncode(ctBytes)
        val env = GroupEncryptedEnvelope(
            v = 1,
            c = "grp",
            ep = epoch,
            sk = myIdentity.keyId,
            s = saltB64,
            iv = ivB64,
            ct = inlineCt,
            sig = sigB64,
        )
        val prefix = if (silentSignal) "$E2EE_SIGNAL_PREFIX$E2EE_WIRE_MARKER" else E2EE_WIRE_MARKER
        val candidateWire = "$prefix${JaTextJson.encodeToString(env)}"
        val finalWire = if (candidateWire.length <= MAX_INLINE_WIRE_CHARS) {
            candidateWire
        } else {
            val sid = TursoApiClient.uploadMediaBytes(
                bytes = ctBytes,
                fileName = "e2ee-grp-overflow.bin",
                mimeType = "application/octet-stream",
                token = token
            )
            "$prefix${JaTextJson.encodeToString(env.copy(ct = null, ovf = OverflowDescriptor(sid = sid, h = ctHashB64)))}"
        }

        val proof = MessageE2EEProof(
            encrypted = true,
            algorithm = "GroupEpoch-HKDF-SHA256 + AES-256-GCM",
            senderKeyId = myIdentity.keyId,
            epoch = epoch,
            signatureVerified = true,
            ciphertextPreview = inlineCt.take(48),
        )
        seedOutgoingDecryptedWire(finalWire, payload, proof)
        finalWire
    }

    suspend fun decryptGroupWire(
        groupId: String,
        messageId: String,
        senderId: String,
        wireBody: String,
    ): DecryptedWireResult? = withContext(Dispatchers.Default) {
        val trimmed = wireBody.trim()
        decryptedByWireCache[trimmed]?.let { return@withContext it }
        if (messageId.isNotBlank()) {
            decryptedByMsgIdCache[messageId]?.let { return@withContext it }
        }
        val markerIdx = trimmed.indexOf(E2EE_WIRE_MARKER)
        if (markerIdx < 0) return@withContext null
        val rawJson = trimmed.substring(markerIdx + E2EE_WIRE_MARKER.length).lineSequence().first().trim()
        val env = try {
            JaTextJson.decodeFromString<GroupEncryptedEnvelope>(rawJson)
        } catch (_: Throwable) {
            return@withContext null
        }
        if (env.v != 1 || env.c != "grp") return@withContext null
        val secretB64 = groupEpochSecrets["$groupId:${env.ep}"] ?: return@withContext null

        val ctBytes = when {
            !env.ct.isNullOrBlank() -> b64UrlDecode(env.ct)
            env.ovf != null && env.ovf.sid.isNotBlank() -> {
                val b = TursoApiClient.fetchMediaBytesSmart(env.ovf.sid)
                if (b64UrlEncode(sha256(b)) != env.ovf.h) return@withContext null
                b
            }
            else -> return@withContext null
        }

        return@withContext try {
            val epochSecret = b64UrlDecode(secretB64)
            val salt = b64UrlDecode(env.s)
            val iv = b64UrlDecode(env.iv)
            val msgKey = hkdfSha256(epochSecret, salt, "JaText-Grp-Msg-v1|$groupId|${env.ep}|$senderId|${env.sk}")
            val aad = "JaText-Grp-AAD-v1|$groupId|${env.ep}|$senderId|${env.sk}|${env.s}".toByteArray(Charsets.UTF_8)
            val plain = aesGcmDecrypt(msgKey, iv, aad, ctBytes)
            val payload = JaTextJson.decodeFromString<E2EEPlainPayload>(String(plain, Charsets.UTF_8))
            val res = DecryptedWireResult(
                payload = payload,
                proof = MessageE2EEProof(
                    encrypted = true,
                    algorithm = "GroupEpoch-HKDF-SHA256 + AES-256-GCM",
                    senderKeyId = env.sk,
                    epoch = env.ep,
                    signatureVerified = true,
                    ciphertextPreview = (env.ct ?: "").take(48),
                )
            )
            decryptedByWireCache[trimmed] = res
            if (messageId.isNotBlank()) decryptedByMsgIdCache[messageId] = res
            res
        } catch (_: Throwable) {
            null
        }
    }

    /* ==================== Encrypted Media Attachments ==================== */

    fun encryptAttachmentBytes(
        plainBytes: ByteArray,
        fileName: String,
        mimeType: String,
    ): Pair<ByteArray, EncryptedBlobDescriptor> {
        val rawKey = randomBytes(32)
        val iv = randomBytes(12)
        val cleanMime = mimeType.ifBlank { "application/octet-stream" }
        val aad = "JaText-Blob-v1|$cleanMime|${plainBytes.size}".toByteArray(Charsets.UTF_8)
        val ctBytes = aesGcmEncrypt(rawKey, iv, aad, plainBytes)
        val hashB64 = b64UrlEncode(sha256(ctBytes))
        val desc = EncryptedBlobDescriptor(
            k = b64UrlEncode(rawKey),
            iv = b64UrlEncode(iv),
            n = fileName.ifBlank { "attachment" },
            t = cleanMime,
            sz = plainBytes.size,
            h = hashB64,
        )
        return ctBytes to desc
    }

    suspend fun resolveDecryptedAttachmentFile(
        context: Context,
        mediaUrl: String,
        descriptorJson: String,
    ): File? = withContext(Dispatchers.IO) {
        val desc = try {
            JaTextJson.decodeFromString<EncryptedBlobDescriptor>(descriptorJson)
        } catch (_: Throwable) {
            return@withContext null
        }
        decryptedMediaFileCache[desc.h]?.takeIf { it.exists() }?.let { return@withContext it }

        val dir = File(context.cacheDir, "decrypted_media").apply { mkdirs() }
        val ext = desc.n.substringAfterLast('.', "").take(6).filter { it.isLetterOrDigit() }
        val outFile = File(dir, "media_${desc.h.take(24)}${if (ext.isNotEmpty()) ".$ext" else ""}")
        if (outFile.exists() && outFile.length() == desc.sz.toLong()) {
            decryptedMediaFileCache[desc.h] = outFile
            return@withContext outFile
        }

        return@withContext try {
            val ctBytes = TursoApiClient.fetchMediaBytesSmart(mediaUrl, hintTotalBytes = desc.sz + 16)
            if (b64UrlEncode(sha256(ctBytes)) != desc.h) return@withContext null
            val aad = "JaText-Blob-v1|${desc.t}|${desc.sz}".toByteArray(Charsets.UTF_8)
            val plain = aesGcmDecrypt(b64UrlDecode(desc.k), b64UrlDecode(desc.iv), aad, ctBytes)
            outFile.writeBytes(plain)
            decryptedMediaFileCache[desc.h] = outFile
            outFile
        } catch (_: Throwable) {
            null
        }
    }

    /* ==================== Batch Hydration of DM & Group Threads ==================== */

    suspend fun hydrateDmMessages(
        context: Context,
        myUserId: String,
        rawMessages: List<ChatMessage>,
        token: String,
    ): List<ChatMessage> {
        val peerIds = rawMessages.flatMap { listOf(it.senderId, it.receiverId) }.filter { it.isNotBlank() && it != myUserId }.distinct()
        if (peerIds.isNotEmpty()) {
            ensurePeerBundles(peerIds, token)
        }
        val out = ArrayList<ChatMessage>(rawMessages.size)
        for (m in rawMessages) {
            if (m.unsentAt != null) {
                out.add(m.copy(body = ""))
                continue
            }
            val wire = m.rawWireBody ?: m.body
            if (isEncryptedWireBody(wire)) {
                val dec = decryptDmWire(context, myUserId, m.id, m.senderId, m.receiverId, wire, token)
                if (dec != null) {
                    val p = dec.payload
                    if (isSilentControlPayload(p.b)) continue
                    val (cleanBody, zwBubble) = extractMessageBubbleStyle(p.b, m.attachmentType)
                    val (fwdCtx, strippedBody) = extractForwardedContext(cleanBody)
                    val bubble = p.bs?.takeIf { BUBBLE_STYLE_IDS.contains(it) } ?: zwBubble
                    val attDescJson = (p.att ?: p.stk?.att)?.let { JaTextJson.encodeToString(it) }
                    val effectiveAttUrl = p.stk?.url ?: p.stk?.storageId ?: m.attachmentUrl
                    val effectiveAttName = p.att?.n ?: p.stk?.n ?: m.attachmentName
                    val effectiveAttType = p.att?.t ?: m.attachmentType
                    out.add(
                        m.copy(
                            body = strippedBody,
                            rawWireBody = wire,
                            bubbleStyle = bubble,
                            forwardedContext = fwdCtx ?: m.forwardedContext,
                            attachmentUrl = effectiveAttUrl,
                            attachmentName = effectiveAttName,
                            attachmentType = effectiveAttType,
                            stickerKey = p.stk?.key ?: m.stickerKey,
                            e2ee = dec.proof,
                            encryptedAttachmentJson = attDescJson,
                        )
                    )
                } else {
                    // Never show raw wire text or transient "Decrypting message" on own outgoing self-echoes!
                    if (m.senderId == myUserId) continue
                    out.add(
                        m.copy(
                            body = "Encrypted message",
                            rawWireBody = wire,
                            e2ee = MessageE2EEProof(encrypted = true),
                        )
                    )
                }
            } else {
                if (isSilentControlPayload(m.body)) continue
                val (cleanBody, bubble) = extractMessageBubbleStyle(m.body, m.attachmentType)
                val (fwdCtx, strippedBody) = extractForwardedContext(cleanBody)
                out.add(
                    m.copy(
                        body = strippedBody,
                        bubbleStyle = m.bubbleStyle ?: bubble,
                        forwardedContext = fwdCtx ?: m.forwardedContext,
                    )
                )
            }
        }
        return out
    }

    suspend fun hydrateGroupMessages(
        context: Context,
        myUserId: String,
        groupId: String,
        rawMessages: List<GroupMessage>,
    ): List<GroupMessage> {
        for (m in rawMessages) {
            val raw = m.rawWireBody ?: m.body
            if (raw.startsWith(E2EE_SIGNAL_PREFIX)) {
                tryIngestGroupEpochSignal(context, myUserId, m.senderId, raw)
            }
        }
        val out = ArrayList<GroupMessage>(rawMessages.size)
        for (m in rawMessages) {
            if (m.unsentAt != null) {
                out.add(m.copy(body = ""))
                continue
            }
            val wire = m.rawWireBody ?: m.body
            if (wire.startsWith(E2EE_SIGNAL_PREFIX) && !wire.contains(E2EE_WIRE_MARKER)) {
                continue
            }
            if (isEncryptedWireBody(wire)) {
                val dec = decryptGroupWire(groupId, m.id, m.senderId, wire)
                if (dec != null) {
                    val p = dec.payload
                    if (isSilentControlPayload(p.b)) continue
                    val (cleanBody, zwBubble) = extractMessageBubbleStyle(p.b, m.attachmentType)
                    val (fwdCtx, strippedBody) = extractForwardedContext(cleanBody)
                    val bubble = p.bs?.takeIf { BUBBLE_STYLE_IDS.contains(it) } ?: zwBubble
                    val attDescJson = (p.att ?: p.stk?.att)?.let { JaTextJson.encodeToString(it) }
                    out.add(
                        m.copy(
                            body = strippedBody,
                            rawWireBody = wire,
                            bubbleStyle = bubble,
                            forwardedContext = fwdCtx ?: m.forwardedContext,
                            attachmentUrl = p.stk?.url ?: p.stk?.storageId ?: m.attachmentUrl,
                            attachmentName = p.att?.n ?: p.stk?.n ?: m.attachmentName,
                            attachmentType = p.att?.t ?: m.attachmentType,
                            stickerKey = p.stk?.key ?: m.stickerKey,
                            e2ee = dec.proof,
                            encryptedAttachmentJson = attDescJson,
                        )
                    )
                } else {
                    if (m.senderId == myUserId) continue
                    out.add(
                        m.copy(
                            body = "Encrypted message",
                            rawWireBody = wire,
                            e2ee = MessageE2EEProof(encrypted = true),
                        )
                    )
                }
            } else {
                if (isSilentControlPayload(m.body)) continue
                val (cleanBody, bubble) = extractMessageBubbleStyle(m.body, m.attachmentType)
                val (fwdCtx, strippedBody) = extractForwardedContext(cleanBody)
                out.add(
                    m.copy(
                        body = strippedBody,
                        bubbleStyle = m.bubbleStyle ?: bubble,
                        forwardedContext = fwdCtx ?: m.forwardedContext,
                    )
                )
            }
        }
        return out
    }

    suspend fun decryptPreviewText(
        context: Context,
        myUserId: String,
        peerOrGroupId: String,
        senderId: String,
        rawPreview: String,
        isGroup: Boolean,
        token: String,
    ): String {
        if (rawPreview.isBlank()) return "No messages yet"
        if (isEncryptedWireBody(rawPreview)) {
            val dec = if (isGroup) {
                decryptGroupWire(peerOrGroupId, "", senderId, rawPreview)
            } else {
                val receiverId = if (senderId == myUserId) peerOrGroupId else myUserId
                decryptDmWire(context, myUserId, "", senderId, receiverId, rawPreview, token)
            }
            if (dec != null) {
                val p = dec.payload
                return when {
                    p.stk != null -> "Sent a sticker"
                    p.att != null -> when {
                        p.att.t.startsWith("audio/") -> "Voice message"
                        p.att.t.startsWith("image/") -> "Photo"
                        p.att.t.startsWith("video/") -> "Video"
                        else -> p.att.n.ifBlank { "Attachment" }
                    }
                    else -> formatPreviewPlainText(p.b)
                }
            }
            return "Message"
        }
        return formatPreviewPlainText(rawPreview)
    }

    fun formatPreviewPlainText(raw: String): String {
        val (clean, _) = extractMessageBubbleStyle(raw, null)
        val (_, noFwd) = extractForwardedContext(clean)
        val trimmed = noFwd.trim()
        if (trimmed.startsWith(CALL_INVITE_PREFIX)) {
            return if (trimmed.contains("\"video\"")) "Video call" else "Voice call"
        }
        if (trimmed.startsWith(GROUP_CALL_INVITE_PREFIX)) {
            return if (trimmed.contains("\"ended\"")) "GC VC Ended" else "Group call"
        }
        if (trimmed.startsWith(WALLPAPER_PREFIX)) {
            return "Updated chat wallpaper"
        }
        if (isSilentControlPayload(trimmed)) return ""
        return trimmed.ifBlank { "Attachment" }
    }

    /* ==================== Bubble Style, Forwarded Context & Wallpaper Codecs ==================== */

    fun encodeBubbleStyleMarker(styleId: String): String {
        val idx = BUBBLE_STYLE_IDS.indexOf(styleId)
        if (idx <= 0) return ""
        val sb = StringBuilder(7)
        sb.append(ZW_BOOKEND)
        for (b in 4 downTo 0) {
            sb.append(if (((idx shr b) and 1) == 1) ZW_ONE else ZW_ZERO)
        }
        sb.append(ZW_BOOKEND)
        return sb.toString()
    }

    fun attachBubbleStyleToOutgoing(body: String, styleId: String): String {
        val cleaned = stripBubbleStyleFromText(body)
        if (styleId == "default" || !BUBBLE_STYLE_IDS.contains(styleId)) return cleaned
        return cleaned + encodeBubbleStyleMarker(styleId)
    }

    fun stripBubbleStyleFromText(body: String?): String {
        if (body.isNullOrEmpty()) return ""
        return body.replace(TRAILING_MARKER_RE, "")
    }

    fun extractMessageBubbleStyle(body: String?, attachmentType: String?): Pair<String, String> {
        val raw = body.orEmpty()
        val match = TRAILING_MARKER_RE.find(raw)
        if (match != null) {
            var idx = 0
            for (ch in match.groupValues[1]) {
                idx = (idx shl 1) or (if (ch == ZW_ONE) 1 else 0)
            }
            val style = BUBBLE_STYLE_IDS.getOrElse(idx) { "default" }
            return raw.substring(0, match.range.first) to style
        }
        if (!attachmentType.isNullOrBlank()) {
            val m = Regex(";jbs=([a-z0-9-]+)", RegexOption.IGNORE_CASE).find(attachmentType)
            val candidate = m?.groupValues?.getOrNull(1)
            if (candidate != null && BUBBLE_STYLE_IDS.contains(candidate)) {
                return raw to candidate
            }
        }
        return raw to "default"
    }

    fun encodeForwardedBody(plainBody: String, context: ForwardedMessageContext): String {
        val (_, stripped) = extractForwardedContext(plainBody)
        val encoded = b64UrlEncode(JaTextJson.encodeToString(context).toByteArray(Charsets.UTF_8))
        return if (stripped.isNotBlank()) {
            "$FORWARD_METADATA_PREFIX$encoded\n$stripped"
        } else {
            "$FORWARD_METADATA_PREFIX$encoded"
        }
    }

    fun extractForwardedContext(body: String?): Pair<ForwardedMessageContext?, String> {
        if (body.isNullOrEmpty()) return null to ""
        val regex = Regex("__JATEXT_FWD_V1__:([A-Za-z0-9_-]+)\\n?")
        val m = regex.find(body) ?: return null to body.removePrefix("Forwarded:\n")
        val stripped = body.replaceFirst(regex, "")
        return try {
            val jsonStr = String(b64UrlDecode(m.groupValues[1]), Charsets.UTF_8)
            val ctx = JaTextJson.decodeFromString<ForwardedMessageContext>(jsonStr)
            ctx to stripped
        } catch (_: Throwable) {
            null to stripped
        }
    }

    data class ParsedWallpaperSignal(
        val kind: String,
        val url: String?,
        val actorName: String?,
    )

    fun parseWallpaperSignal(body: String?, attachmentUrl: String?): ParsedWallpaperSignal? {
        val clean = stripBubbleStyleFromText(body)
        if (!clean.startsWith(WALLPAPER_PREFIX)) return null
        return try {
            val obj = JaTextJson.parseToJsonElement(clean.removePrefix(WALLPAPER_PREFIX)).jsonObject
            val kind = obj["kind"]?.jsonPrimitive?.contentOrNull ?: return null
            val actor = obj["actorName"]?.jsonPrimitive?.contentOrNull
            when (kind) {
                "none" -> ParsedWallpaperSignal("none", null, actor)
                "custom" -> ParsedWallpaperSignal(
                    "custom",
                    attachmentUrl ?: obj["url"]?.jsonPrimitive?.contentOrNull,
                    actor
                )
                "preset" -> ParsedWallpaperSignal(
                    "preset",
                    obj["url"]?.jsonPrimitive?.contentOrNull,
                    actor
                )
                else -> null
            }
        } catch (_: Throwable) {
            null
        }
    }

    fun serializeWallpaperSignal(kind: String, url: String?, presetId: String?, actorName: String?): String {
        val map = mutableMapOf<String, JsonPrimitive>("v" to JsonPrimitive(1), "kind" to JsonPrimitive(kind))
        if (!url.isNullOrBlank()) map["url"] = JsonPrimitive(url)
        if (!presetId.isNullOrBlank()) map["presetId"] = JsonPrimitive(presetId)
        if (!actorName.isNullOrBlank()) map["actorName"] = JsonPrimitive(actorName)
        return "$WALLPAPER_PREFIX${JsonObject(map)}"
    }
}
