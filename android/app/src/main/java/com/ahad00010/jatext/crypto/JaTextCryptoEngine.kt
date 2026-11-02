package com.ahad00010.jatext.crypto

import android.content.Context
import android.util.Base64
import com.ahad00010.jatext.BuildConfig
import com.ahad00010.jatext.JaTextE2EEDecryptor
import com.ahad00010.jatext.data.ChatMessage
import com.ahad00010.jatext.data.DMEncryptedEnvelope
import com.ahad00010.jatext.data.E2EEPlainPayload
import com.ahad00010.jatext.data.E2EEVaultContents
import com.ahad00010.jatext.data.E2EEVaultGroupEpoch
import com.ahad00010.jatext.data.EncryptedBlobDescriptor
import com.ahad00010.jatext.data.ForwardedMessageContext
import com.ahad00010.jatext.data.GroupEncryptedEnvelope
import com.ahad00010.jatext.data.GroupEpochWrapEntry
import com.ahad00010.jatext.data.GroupKeySignalPacket
import com.ahad00010.jatext.data.GroupMember
import com.ahad00010.jatext.data.GroupMessage
import com.ahad00010.jatext.data.GroupSeenReader
import com.ahad00010.jatext.data.JaTextJson
import com.ahad00010.jatext.data.MessageE2EEProof
import com.ahad00010.jatext.data.OverflowDescriptor
import com.ahad00010.jatext.data.PlainDeviceLinkBundle
import com.ahad00010.jatext.data.PublicIdentityBundle
import com.ahad00010.jatext.data.ReplySummary
import com.ahad00010.jatext.data.SealedAutoSyncKeyring
import com.ahad00010.jatext.data.SealedDeviceLinkBundle
import com.ahad00010.jatext.data.SealedE2EEVault
import com.ahad00010.jatext.data.StickerMedia
import com.ahad00010.jatext.data.StoredIdentityRecord
import com.ahad00010.jatext.data.TursoApiClient
import java.io.File
import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import java.security.SecureRandom
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPrivateKeySpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
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
    const val GROUP_SEEN_SIGNAL_PREFIX = "__JATEXT_CALL_SIG__:SEEN:"
    const val FORWARD_METADATA_PREFIX = "__JATEXT_FWD_V1__:"
    const val WALLPAPER_PREFIX = "__JATEXT_WP__:"
    const val CALL_INVITE_PREFIX = "__JATEXT_CALL__:"
    const val GROUP_CALL_INVITE_PREFIX = "__JATEXT_CALL_GRP__:"
    const val E2EE_VAULT_STICKER_NAME = "__jatext_e2ee_vault_v1__"
    const val E2EE_AUTOSYNC_STICKER_NAME = "__jatext_e2ee_autosync_v1__"
    const val E2EE_BUBBLE_PREF_PREFIX = "__jatext_pref_bubble_v1__:"
    const val E2EE_DEVSYNC_REQ_PREFIX = "__jatext_e2ee_devreq_v1__:"
    const val E2EE_DEVSYNC_RES_PREFIX = "__jatext_e2ee_devres_v1__:"
    private const val MAX_INLINE_WIRE_CHARS = 3500
    private const val SAFETY_NUMBER_ROUNDS = 5200
    private val lastPeerForceRefreshAt = ConcurrentHashMap<String, Long>()
    private val peerFetchedAtByUserId = ConcurrentHashMap<String, Long>()
    private val lastGroupEpochPullAt = ConcurrentHashMap<String, Long>()
    @Volatile
    private var lastKeyringSelfHealAt = 0L

    fun isInternalSyncSticker(item: StickerMedia): Boolean {
        val n = item.name.trim()
        return n == E2EE_VAULT_STICKER_NAME ||
            n == E2EE_AUTOSYNC_STICKER_NAME ||
            n.startsWith(E2EE_BUBBLE_PREF_PREFIX) ||
            n.startsWith(E2EE_DEVSYNC_REQ_PREFIX) ||
            n.startsWith(E2EE_DEVSYNC_RES_PREFIX)
    }

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
    private val publishedSessionKeyIds: MutableSet<String> =
        Collections.newSetFromMap(ConcurrentHashMap<String, Boolean>())

    /* ==================== Base64Url & Hash Helpers ==================== */

    fun b64UrlEncode(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

    fun b64UrlDecode(str: String): ByteArray {
        val clean = str
            .trim()
            .replace('+', '-')
            .replace('/', '_')
            .trimEnd('=')
            .filterNot { it.isWhitespace() }
        if (clean.isEmpty()) return ByteArray(0)
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

    private fun importPkcs8Private(pkcs8: ByteArray): PrivateKey {
        require(pkcs8.isNotEmpty()) { "Empty EC private key bytes" }
        val kf = KeyFactory.getInstance("EC")
        try {
            return kf.generatePrivate(PKCS8EncodedKeySpec(pkcs8))
        } catch (primaryErr: Throwable) {
            // Fallback for WebCrypto RFC 5958 OneAsymmetricKey / SEC1 32-byte P-256 scalar
            val scalar32 = extractP256PrivateScalar(pkcs8) ?: throw primaryErr
            val params = AlgorithmParameters.getInstance("EC").apply {
                init(ECGenParameterSpec("secp256r1"))
            }.getParameterSpec(ECParameterSpec::class.java)
            return kf.generatePrivate(ECPrivateKeySpec(BigInteger(1, scalar32), params))
        }
    }

    private fun extractP256PrivateScalar(der: ByteArray): ByteArray? {
        if (der.size == 32) return der
        // Search for SEC1 OCTET STRING tag 0x04 length 0x20 (32-byte P-256 private scalar)
        for (i in 0..(der.size - 34)) {
            if (der[i] == 0x04.toByte() && der[i + 1] == 0x20.toByte()) {
                val candidate = der.copyOfRange(i + 2, i + 34)
                val bi = BigInteger(1, candidate)
                if (bi > BigInteger.ZERO) return candidate
            }
        }
        return null
    }

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

    private fun isUsablePrimaryIdentity(record: StoredIdentityRecord): Boolean {
        if (record.keyId.isBlank() ||
            record.dhPubB64.isBlank() ||
            record.dhPrivPkcs8B64.isBlank() ||
            record.sigPubB64.isBlank() ||
            record.sigPrivPkcs8B64.isBlank() ||
            record.selfSigB64.isBlank()
        ) {
            return false
        }
        return try {
            importPkcs8Private(b64UrlDecode(record.dhPrivPkcs8B64))
            importRawP256Public(b64UrlDecode(record.dhPubB64))
            importPkcs8Private(b64UrlDecode(record.sigPrivPkcs8B64))
            importRawP256Public(b64UrlDecode(record.sigPubB64))
            true
        } catch (_: Throwable) {
            false
        }
    }

    private fun isUsableDecryptKey(record: StoredIdentityRecord): Boolean {
        if (record.keyId.isBlank() || record.dhPrivPkcs8B64.isBlank()) return false
        return try {
            importPkcs8Private(b64UrlDecode(record.dhPrivPkcs8B64))
            true
        } catch (_: Throwable) {
            false
        }
    }

    fun loadLocalIdentities(context: Context, userId: String): List<StoredIdentityRecord> {
        val prefs = context.getSharedPreferences("jatext_e2ee_keystore", Context.MODE_PRIVATE)
        val merged = LinkedHashMap<String, StoredIdentityRecord>()

        val raw = prefs.getString("identities:$userId", null)
        if (!raw.isNullOrBlank()) {
            try {
                val parsed = JaTextJson.decodeFromString<List<StoredIdentityRecord>>(raw)
                for (rec in parsed) {
                    if (rec.keyId.isNotBlank() && isUsableDecryptKey(rec)) {
                        merged[rec.keyId] = if (rec.userId.isBlank()) rec.copy(userId = userId) else rec
                    }
                }
            } catch (_: Throwable) {
            }
        }

        // Also preserve legacy JaTextE2EEDecryptor decrypt-only keys if user upgraded from older APK
        val pushRaw = JaTextE2EEDecryptor.prefs(context).getString("identities_json", null)
        if (!pushRaw.isNullOrBlank()) {
            try {
                val parsed = JaTextJson.decodeFromString<List<StoredIdentityRecord>>(pushRaw)
                    .filter { it.userId == userId || it.userId.isBlank() }
                    .map { if (it.userId.isBlank()) it.copy(userId = userId) else it }
                for (rec in parsed) {
                    if (rec.keyId.isNotBlank() && !merged.containsKey(rec.keyId) && isUsableDecryptKey(rec)) {
                        merged[rec.keyId] = rec
                    }
                }
            } catch (_: Throwable) {
            }
        }
        return merged.values.toList()
    }

    fun saveLocalIdentities(context: Context, userId: String, records: List<StoredIdentityRecord>) {
        val prefs = context.getSharedPreferences("jatext_e2ee_keystore", Context.MODE_PRIVATE)
        prefs.edit().putString("identities:$userId", JaTextJson.encodeToString(records)).apply()
    }

    fun ensureOrCreatePrimaryIdentity(context: Context, userId: String): StoredIdentityRecord {
        val existing = loadLocalIdentities(context, userId)
        val validPrimary = existing.firstOrNull { isUsablePrimaryIdentity(it) }
        if (validPrimary != null) {
            if (existing.first().keyId != validPrimary.keyId) {
                val reordered = listOf(validPrimary) + existing.filter { it.keyId != validPrimary.keyId }
                saveLocalIdentities(context, userId, reordered)
            }
            return validPrimary
        }

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
        // Put the complete signing+DH identity first, while keeping any legacy DH-only keys after it for history decryption
        val updatedList = listOf(created) + existing.filter { it.keyId != created.keyId }
        saveLocalIdentities(context, userId, updatedList)
        return created
    }

    suspend fun ensurePrimaryIdentityPublished(
        identity: StoredIdentityRecord,
        token: String,
        force: Boolean = false,
    ) {
        if (token.isBlank() || identity.keyId.isBlank()) return
        if (!force && !publishedSessionKeyIds.add(identity.keyId)) return
        publishedSessionKeyIds.add(identity.keyId)
        try {
            TursoApiClient.rpcRaw(
                op = "publishE2EEIdentity",
                args = mapOf(
                    "keyId" to identity.keyId,
                    "dhPubB64" to identity.dhPubB64,
                    "sigPubB64" to identity.sigPubB64,
                    "selfSigB64" to identity.selfSigB64,
                    "deviceLabel" to "JaText Native Android",
                ),
                token = token
            )
            registerPeerBundles(
                listOf(
                    PublicIdentityBundle(
                        userId = identity.userId,
                        keyId = identity.keyId,
                        dhPubB64 = identity.dhPubB64,
                        sigPubB64 = identity.sigPubB64,
                        selfSigB64 = identity.selfSigB64,
                        ts = System.currentTimeMillis(),
                        updatedAt = System.currentTimeMillis(),
                    )
                )
            )
        } catch (_: Throwable) {
            publishedSessionKeyIds.remove(identity.keyId)
        }
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
                list.add(b)
                list.sortByDescending { maxOf(it.updatedAt ?: 0L, it.ts) }
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
        val nowMs = System.currentTimeMillis()
        val staleOrMissing = userIds.distinct().filter { uid ->
            uid.isNotBlank() && (
                getCachedPeerBundles(uid).isEmpty() ||
                    nowMs - (peerFetchedAtByUserId[uid] ?: 0L) > 12_000L
                )
        }
        if (staleOrMissing.isNotEmpty() && token.isNotBlank()) {
            try {
                for (uid in staleOrMissing) peerFetchedAtByUserId[uid] = nowMs
                val root = TursoApiClient.rpcRaw(
                    op = "getUserE2EEIdentities",
                    args = mapOf("userIds" to staleOrMissing),
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
        ensurePrimaryIdentityPublished(myIdentity, token)
        val peerMap = ensurePeerBundles(listOf(receiverId, myUserId), token)
        val receiverBundles = peerMap[receiverId].orEmpty().ifEmpty {
            if (receiverId == myUserId) {
                listOf(
                    PublicIdentityBundle(
                        userId = myUserId,
                        keyId = myIdentity.keyId,
                        dhPubB64 = myIdentity.dhPubB64,
                        sigPubB64 = myIdentity.sigPubB64,
                        selfSigB64 = myIdentity.selfSigB64,
                        ts = myIdentity.createdAt,
                    )
                )
            } else {
                emptyList()
            }
        }
        if (receiverBundles.isEmpty()) {
            return@withContext null
        }
        val receiverPrimary = receiverBundles.first()
        val myLocalOtherDevices = loadLocalIdentities(context, myUserId)
            .filter { it.keyId != myIdentity.keyId && it.dhPubB64.isNotBlank() }
            .map {
                PublicIdentityBundle(
                    userId = myUserId,
                    keyId = it.keyId,
                    dhPubB64 = it.dhPubB64,
                    sigPubB64 = it.sigPubB64,
                    selfSigB64 = it.selfSigB64,
                    ts = it.createdAt,
                )
            }
        val extraBundles = (
            receiverBundles.drop(1) +
                peerMap[myUserId].orEmpty().filter { it.keyId != myIdentity.keyId } +
                myLocalOtherDevices
            )

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
        targets[receiverPrimary.keyId] = receiverPrimary.dhPubB64
        targets[myIdentity.keyId] = myIdentity.dhPubB64
        for (extra in extraBundles) {
            if (targets.size < 24 && extra.keyId.isNotBlank() && extra.dhPubB64.isNotBlank()) {
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
        val baseWire = if (candidateWire.length <= MAX_INLINE_WIRE_CHARS) {
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
        val plainBodyStr = payload.b
        val dmControlSuffix = when {
            plainBodyStr.startsWith(CALL_INVITE_PREFIX) -> {
                if (plainBodyStr.contains("\"state\":\"ringing\"")) {
                    val callMode = if (plainBodyStr.contains("\"mode\":\"video\"")) "video" else "voice"
                    "\n(__JATEXT_CALL_DM_RINGING__:$callMode)"
                } else if (
                    plainBodyStr.contains("\"state\":\"missed\"") ||
                    plainBodyStr.contains("\"state\":\"ended\"") ||
                    plainBodyStr.contains("\"state\":\"declined\"")
                ) {
                    "\n(__JATEXT_CALL_DM_ENDED__)"
                } else ""
            }
            plainBodyStr.startsWith("__JATEXT_CALL_SIG__:") -> {
                try {
                    val sigObj = JaTextJson.parseToJsonElement(
                        plainBodyStr.removePrefix("__JATEXT_CALL_SIG__:")
                    ).jsonObject
                    val cid = sigObj["callId"]?.jsonPrimitive?.contentOrNull.orEmpty()
                        .replace(Regex("[^A-Za-z0-9_-]"), "")
                    val stype = sigObj["type"]?.jsonPrimitive?.contentOrNull.orEmpty()
                        .replace(Regex("[^A-Za-z0-9_-]"), "")
                    val devId = sigObj["deviceSessionId"]?.jsonPrimitive?.contentOrNull.orEmpty()
                        .replace(Regex("[^A-Za-z0-9_-]"), "")
                    val ts = sigObj["ts"]?.jsonPrimitive?.contentOrNull?.toLongOrNull()
                        ?: System.currentTimeMillis()
                    when {
                        cid.isNotEmpty() && (stype == "hangup" || stype == "decline") ->
                            "\n(__JATEXT_CALL_CANCEL__:$cid:$stype:$devId:$ts)"
                        cid.isNotEmpty() && (stype == "claim" || stype == "answer") ->
                            "\n(__JATEXT_CALL_CLAIM__:$cid:$stype:$devId:$ts)"
                        else -> ""
                    }
                } catch (_: Throwable) {
                    when {
                        plainBodyStr.contains("\"type\":\"hangup\"") || plainBodyStr.contains("\"type\":\"decline\"") ->
                            "\n(__JATEXT_CALL_CANCEL__)"
                        plainBodyStr.contains("\"type\":\"claim\"") || plainBodyStr.contains("\"type\":\"answer\"") ->
                            "\n(__JATEXT_CALL_CLAIM__)"
                        else -> ""
                    }
                }
            }
            else -> ""
        }
        val finalWire = "$baseWire$dmControlSuffix"

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
        var peerBundles = ensurePeerBundles(listOf(peerId), token)[peerId].orEmpty()
        if (peerId.isNotBlank() && peerBundles.none { it.keyId == env.sk || it.keyId == env.rk }) {
            val nowMs = System.currentTimeMillis()
            val lastRefresh = lastPeerForceRefreshAt[peerId] ?: 0L
            if (nowMs - lastRefresh > 8_000L) {
                lastPeerForceRefreshAt[peerId] = nowMs
                refreshPeerBundles(listOf(peerId), token)
                peerBundles = getCachedPeerBundles(peerId)
            }
        }

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

        if (plainBytes == null && token.isNotBlank()) {
            val healed = trySelfHealKeyringOnMiss(context, myUserId, token)
            if (healed) {
                val refreshedIdentities = loadLocalIdentities(context, myUserId)
                if (wra != null) {
                    for (id in refreshedIdentities) {
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
                        outerHeal@ for (id in refreshedIdentities) {
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
                                    break@outerHeal
                                } catch (_: Throwable) {
                                }
                            }
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

    private fun addGroupEpochCandidateSecret(groupId: String, epoch: Int, secretB64: String): Boolean {
        val clean = secretB64.trim()
        if (groupId.isBlank() || epoch <= 0 || clean.isEmpty()) return false
        val mapKey = "$groupId:$epoch"
        val existingRaw = groupEpochSecrets[mapKey].orEmpty()
        val existingList = existingRaw
            .split(",")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
        if (existingList.contains(clean)) return false
        val merged = (listOf(clean) + existingList).distinct().joinToString(",")
        groupEpochSecrets[mapKey] = merged
        return true
    }

    private fun tryIngestIdentitySignal(senderId: String, rawBody: String) {
        if (senderId.isBlank() || !rawBody.startsWith(E2EE_SIGNAL_PREFIX)) return
        val after = rawBody.removePrefix(E2EE_SIGNAL_PREFIX).trim()
        if (!after.contains("\"e2ee_ik\"")) return
        try {
            val obj = JaTextJson.parseToJsonElement(after).jsonObject
            if (obj["kind"]?.jsonPrimitive?.contentOrNull != "e2ee_ik") return
            val kid = obj["kid"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
            val dh = obj["dh"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
            val sk = obj["sk"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
            val sig = obj["sig"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
            val ts = obj["ts"]?.jsonPrimitive?.contentOrNull?.toLongOrNull() ?: 0L
            if (kid.isEmpty() || dh.isEmpty() || sk.isEmpty() || sig.isEmpty()) return
            val sigPayload = "JaText-IK-v1|$senderId|$kid|$dh|$sk".toByteArray(Charsets.UTF_8)
            val verified = ecdsaVerifyP1363(
                importRawP256Public(b64UrlDecode(sk)),
                sigPayload,
                b64UrlDecode(sig)
            )
            if (!verified) return
            registerPeerBundles(
                listOf(
                    PublicIdentityBundle(
                        userId = senderId,
                        keyId = kid,
                        dhPubB64 = dh,
                        sigPubB64 = sk,
                        selfSigB64 = sig,
                        ts = ts,
                    )
                )
            )
        } catch (_: Throwable) {
        }
    }

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
                    if (addGroupEpochCandidateSecret(pkt.gid, pkt.ep, b64UrlEncode(secretBytes))) {
                        persistGroupEpochMap(context, myUserId)
                    }
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
                val primaryCandidate = v.substringBefore(",").trim()
                if (ep > bestEp && primaryCandidate.isNotEmpty()) {
                    bestEp = ep
                    bestSecret = primaryCandidate
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
        forceRedistribute: Boolean = false,
        rotateEpoch: Boolean = false,
    ): Pair<Int, String> = withContext(Dispatchers.Default) {
        val existing = getLatestKnownGroupEpoch(groupId)
        if (existing != null && !forceRedistribute && !rotateEpoch) {
            return@withContext existing
        }

        val myIdentity = ensureOrCreatePrimaryIdentity(context, myUserId)
        val allIds = (memberUserIds + myUserId).distinct()
        val bundleMap = ensurePeerBundles(allIds, token)
        val myLocalBundles = loadLocalIdentities(context, myUserId)
            .filter { it.keyId.isNotBlank() && it.dhPubB64.isNotBlank() }
            .map {
                PublicIdentityBundle(
                    userId = myUserId,
                    keyId = it.keyId,
                    dhPubB64 = it.dhPubB64,
                    sigPubB64 = it.sigPubB64,
                    selfSigB64 = it.selfSigB64,
                    ts = it.createdAt,
                )
            }
        val allBundles = (bundleMap.values.flatten() + myLocalBundles).distinctBy { "${it.userId}:${it.keyId}" }

        val epoch: Int
        val secretBytes: ByteArray
        val secretB64: String
        if (existing != null && !rotateEpoch) {
            epoch = existing.first
            secretB64 = existing.second
            secretBytes = b64UrlDecode(secretB64)
        } else {
            epoch = (existing?.first ?: 0) + 1
            secretBytes = randomBytes(32)
            secretB64 = b64UrlEncode(secretBytes)
            addGroupEpochCandidateSecret(groupId, epoch, secretB64)
            persistGroupEpochMap(context, myUserId)
        }

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
                val pktJson = JaTextJson.encodeToString(pkt)
                TursoApiClient.rpcRaw(
                    op = "sendGroupMessage",
                    args = mapOf(
                        "groupId" to groupId,
                        "body" to "$E2EE_SIGNAL_PREFIX$pktJson"
                    ),
                    token = token
                )
                runCatching {
                    TursoApiClient.rpcRaw(
                        op = "publishGroupEpochKey",
                        args = mapOf(
                            "groupId" to groupId,
                            "epoch" to epoch,
                            "packetJson" to pktJson,
                        ),
                        token = token,
                    )
                }
            } catch (_: Throwable) {
            }
        }
        epoch to secretB64
    }

    private suspend fun trySelfHealKeyringOnMiss(
        context: Context,
        myUserId: String,
        token: String,
    ): Boolean {
        if (myUserId.isBlank() || token.isBlank()) return false
        val nowMs = System.currentTimeMillis()
        if (nowMs - lastKeyringSelfHealAt < 8_000L) return false
        lastKeyringSelfHealAt = nowMs
        return try {
            val boot = TursoApiClient.rpc<com.ahad00010.jatext.data.BootstrapResponse>(
                op = "bootstrap",
                token = token,
            )
            val allStickers = boot.stickerFavorites + boot.recentStickers
            val outcome = syncAccountKeyringWithServer(context, myUserId, allStickers, token, forcePush = false)
            outcome?.changedLocal == true
        } catch (_: Throwable) {
            false
        }
    }

    private suspend fun tryPullGroupEpochKeysFromServer(
        context: Context,
        myUserId: String,
        groupId: String,
        token: String,
    ) {
        if (groupId.isBlank() || myUserId.isBlank() || token.isBlank()) return
        val nowMs = System.currentTimeMillis()
        val prev = lastGroupEpochPullAt[groupId] ?: 0L
        if (nowMs - prev < 6_000L) return
        lastGroupEpochPullAt[groupId] = nowMs
        try {
            val root = TursoApiClient.rpcRaw(
                op = "getGroupEpochKeys",
                args = mapOf("groupId" to groupId),
                token = token,
            ).jsonObject
            val arr = root["packets"] as? kotlinx.serialization.json.JsonArray ?: return
            for (el in arr) {
                val obj = el.jsonObject
                val senderId = obj["senderId"]?.jsonPrimitive?.contentOrNull.orEmpty()
                val pktJson = obj["packetJson"]?.jsonPrimitive?.contentOrNull.orEmpty()
                if (pktJson.isNotBlank()) {
                    val raw = if (pktJson.startsWith(E2EE_SIGNAL_PREFIX)) pktJson else "$E2EE_SIGNAL_PREFIX$pktJson"
                    tryIngestGroupEpochSignal(context, myUserId, senderId, raw)
                }
            }
        } catch (_: Throwable) {
        }
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
        ensurePrimaryIdentityPublished(myIdentity, token)
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
        val baseWire = if (candidateWire.length <= MAX_INLINE_WIRE_CHARS) {
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
        val grpPlain = payload.b
        val grpControlSuffix = when {
            grpPlain.startsWith(GROUP_CALL_INVITE_PREFIX) -> {
                if (grpPlain.contains("\"state\":\"active\"")) {
                    val grpMode = if (grpPlain.contains("\"mode\":\"video\"")) "video" else "voice"
                    "\n(__JATEXT_CALL_GRP_ACTIVE__:$grpMode)"
                } else if (grpPlain.contains("\"state\":\"ended\"")) {
                    "\n(__JATEXT_CALL_GRP_ENDED__)"
                } else ""
            }
            grpPlain.startsWith("__JATEXT_CALL_SIG__:GRP:") -> {
                when {
                    grpPlain.contains("\"type\":\"ended\"") -> "\n(__JATEXT_CALL_GRP_ENDED__)"
                    grpPlain.contains("\"type\":\"claim-ring\"") ||
                        grpPlain.contains("\"type\":\"decline-ring\"") ||
                        grpPlain.contains("\"type\":\"join\"") -> "\n(__JATEXT_CALL_CLAIM__)"
                    else -> ""
                }
            }
            else -> ""
        }
        val finalWire = "$baseWire$grpControlSuffix"

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
        context: Context? = null,
        myUserId: String = "",
        token: String = "",
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
        var rawSecretEntry = groupEpochSecrets["$groupId:${env.ep}"]
        if (rawSecretEntry == null && context != null && myUserId.isNotBlank() && token.isNotBlank()) {
            trySelfHealKeyringOnMiss(context, myUserId, token)
            tryPullGroupEpochKeysFromServer(context, myUserId, groupId, token)
            rawSecretEntry = groupEpochSecrets["$groupId:${env.ep}"]
        }
        if (rawSecretEntry == null) return@withContext null
        val candidateSecrets = rawSecretEntry
            .split(",")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .distinct()
        if (candidateSecrets.isEmpty()) return@withContext null

        val ctBytes = when {
            !env.ct.isNullOrBlank() -> b64UrlDecode(env.ct)
            env.ovf != null && env.ovf.sid.isNotBlank() -> {
                val b = TursoApiClient.fetchMediaBytesSmart(env.ovf.sid)
                if (b64UrlEncode(sha256(b)) != env.ovf.h) return@withContext null
                b
            }
            else -> return@withContext null
        }

        val salt = try {
            b64UrlDecode(env.s)
        } catch (_: Throwable) {
            return@withContext null
        }
        val iv = try {
            b64UrlDecode(env.iv)
        } catch (_: Throwable) {
            return@withContext null
        }
        val aad = "JaText-Grp-AAD-v1|$groupId|${env.ep}|$senderId|${env.sk}|${env.s}".toByteArray(Charsets.UTF_8)

        for (secretCandidate in candidateSecrets) {
            try {
                val epochSecret = b64UrlDecode(secretCandidate)
                val msgKey = hkdfSha256(epochSecret, salt, "JaText-Grp-Msg-v1|$groupId|${env.ep}|$senderId|${env.sk}")
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
                return@withContext res
            } catch (_: Throwable) {
            }
        }
        null
    }

    /* ==================== Encrypted Media Attachments ==================== */

    fun isGifBytes(bytes: ByteArray): Boolean {
        return bytes.size >= 6 &&
            bytes[0] == 0x47.toByte() &&
            bytes[1] == 0x49.toByte() &&
            bytes[2] == 0x46.toByte() &&
            bytes[3] == 0x38.toByte()
    }

    /**
     * Losslessly patches any GIF87a/GIF89a byte array so it carries a NETSCAPE2.0
     * Application Extension with loopCount = 0 (infinite loop) for animated PFPs,
     * Group PFPs, Profile Banners, and Chat Wallpapers.
     */
    fun ensureInfiniteLoopGifBytes(bytes: ByteArray): ByteArray {
        if (!isGifBytes(bytes) || bytes.size < 14) return bytes
        val packed = bytes[10].toInt() and 0xFF
        val hasGct = (packed and 0x80) != 0
        val gctSize = if (hasGct) 3 * (1 shl ((packed and 0x07) + 1)) else 0
        val insertOffset = 13 + gctSize
        if (insertOffset > bytes.size) return bytes

        var i = insertOffset
        while (i + 18 < bytes.size) {
            if (
                bytes[i] == 0x21.toByte() &&
                bytes[i + 1] == 0xFF.toByte() &&
                bytes[i + 2] == 0x0B.toByte()
            ) {
                val id = String(bytes, i + 3, 11, Charsets.US_ASCII)
                if (
                    (id == "NETSCAPE2.0" || id == "ANIMEXTS1.0") &&
                    bytes[i + 14] == 0x03.toByte() &&
                    bytes[i + 15] == 0x01.toByte()
                ) {
                    if (bytes[i + 16] == 0x00.toByte() && bytes[i + 17] == 0x00.toByte()) {
                        return bytes
                    }
                    val patched = bytes.copyOf()
                    patched[4] = 0x39.toByte() // '9'
                    patched[5] = 0x61.toByte() // 'a'
                    patched[i + 16] = 0x00.toByte()
                    patched[i + 17] = 0x00.toByte()
                    return patched
                }
            }
            i++
        }

        val netscapeExt = byteArrayOf(
            0x21.toByte(), 0xFF.toByte(), 0x0B.toByte(),
            0x4E.toByte(), 0x45.toByte(), 0x54.toByte(), 0x53.toByte(),
            0x43.toByte(), 0x41.toByte(), 0x50.toByte(), 0x45.toByte(),
            0x32.toByte(), 0x2E.toByte(), 0x30.toByte(),
            0x03.toByte(), 0x01.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(),
        )
        val out = ByteArray(bytes.size + netscapeExt.size)
        System.arraycopy(bytes, 0, out, 0, insertOffset)
        out[4] = 0x39.toByte() // '9'
        out[5] = 0x61.toByte() // 'a'
        System.arraycopy(netscapeExt, 0, out, insertOffset, netscapeExt.size)
        System.arraycopy(bytes, insertOffset, out, insertOffset + netscapeExt.size, bytes.size - insertOffset)
        return out
    }

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

    suspend fun resolveOrDecryptAttachmentToFile(
        context: Context,
        mediaUrl: String,
        desc: EncryptedBlobDescriptor?,
    ): File? = withContext(Dispatchers.IO) {
        if (desc != null) {
            return@withContext resolveDecryptedAttachmentFile(
                context,
                mediaUrl,
                JaTextJson.encodeToString(desc),
            )
        }
        val key = b64UrlEncode(sha256(mediaUrl.toByteArray(Charsets.UTF_8))).take(24)
        decryptedMediaFileCache[key]?.takeIf { it.exists() }?.let { return@withContext it }
        val dir = File(context.cacheDir, "decrypted_media").apply { mkdirs() }
        val existingGif = File(dir, "plain_$key.gif")
        if (existingGif.exists() && existingGif.length() > 0L) {
            decryptedMediaFileCache[key] = existingGif
            return@withContext existingGif
        }
        val outFile = File(dir, "plain_$key.bin")
        if (outFile.exists() && outFile.length() > 0L) {
            decryptedMediaFileCache[key] = outFile
            return@withContext outFile
        }
        return@withContext try {
            val rawBytes = TursoApiClient.fetchMediaBytesSmart(mediaUrl)
            if (isGifBytes(rawBytes)) {
                val looped = ensureInfiniteLoopGifBytes(rawBytes)
                existingGif.writeBytes(looped)
                decryptedMediaFileCache[key] = existingGif
                existingGif
            } else {
                outFile.writeBytes(rawBytes)
                decryptedMediaFileCache[key] = outFile
                outFile
            }
        } catch (_: Throwable) {
            null
        }
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
        val rawExt = desc.n.substringAfterLast('.', "").take(6).filter { it.isLetterOrDigit() }
        val ext = if (desc.t.lowercase().startsWith("image/gif")) "gif" else rawExt
        val outFile = File(dir, "media_${desc.h.take(24)}${if (ext.isNotEmpty()) ".$ext" else ""}")
        if (outFile.exists() && outFile.length() >= desc.sz.toLong()) {
            decryptedMediaFileCache[desc.h] = outFile
            return@withContext outFile
        }

        return@withContext try {
            val ctBytes = TursoApiClient.fetchMediaBytesSmart(mediaUrl, hintTotalBytes = desc.sz + 16)
            if (b64UrlEncode(sha256(ctBytes)) != desc.h) return@withContext null
            val aad = "JaText-Blob-v1|${desc.t}|${desc.sz}".toByteArray(Charsets.UTF_8)
            val plain = aesGcmDecrypt(b64UrlDecode(desc.k), b64UrlDecode(desc.iv), aad, ctBytes)
            if (isGifBytes(plain)) {
                val gifFile = File(dir, "media_${desc.h.take(24)}.gif")
                gifFile.writeBytes(ensureInfiniteLoopGifBytes(plain))
                decryptedMediaFileCache[desc.h] = gifFile
                gifFile
            } else {
                outFile.writeBytes(plain)
                decryptedMediaFileCache[desc.h] = outFile
                outFile
            }
        } catch (_: Throwable) {
            null
        }
    }

    /* ==================== Batch Hydration of DM & Group Threads ==================== */

    private fun summarizeAttachmentFallback(
        attachmentType: String?,
        attachmentName: String?,
        isSticker: Boolean,
    ): String {
        if (isSticker) return "Sticker"
        val mime = attachmentType?.lowercase().orEmpty()
        return when {
            mime.startsWith("audio/") -> "Voice message"
            mime.startsWith("image/") -> "Photo"
            mime.startsWith("video/") -> "Video"
            !attachmentName.isNullOrBlank() -> attachmentName
            else -> "Attachment"
        }
    }

    private fun cleanReplySnippetText(
        body: String,
        attachmentType: String? = null,
        attachmentName: String? = null,
        isSticker: Boolean = false,
    ): String {
        val (noZw, _) = extractMessageBubbleStyle(body, attachmentType)
        val (_, noFwd) = extractForwardedContext(noZw)
        val trimmed = noFwd.trim()
        if (ViewOnceCodec.isViewOnceBody(trimmed)) {
            return "View once"
        }
        if (trimmed.startsWith(CALL_INVITE_PREFIX)) {
            return if (trimmed.contains("\"video\"")) "Video call" else "Voice call"
        }
        if (trimmed.startsWith(GROUP_CALL_INVITE_PREFIX)) {
            return if (trimmed.contains("\"ended\"")) "GC VC Ended" else "Group call"
        }
        if (trimmed.startsWith(WALLPAPER_PREFIX)) {
            return "Updated chat wallpaper"
        }
        if (trimmed.isNotEmpty() && !isEncryptedWireBody(trimmed) && !isSilentControlPayload(trimmed)) {
            return trimmed
        }
        return summarizeAttachmentFallback(attachmentType, attachmentName, isSticker)
    }

    data class ParsedGroupSeenCursor(
        val messageId: String,
        val seenUpToTs: Long,
        val ts: Long,
    )

    data class GroupHydrationOutcome(
        val messages: List<GroupMessage>,
        val seenByMessageId: Map<String, List<GroupSeenReader>>,
        val myCursorMessageId: String?,
        val mySeenUpToTs: Long,
    )

    fun parseGroupSeenSignal(rawBody: String?): ParsedGroupSeenCursor? {
        if (rawBody.isNullOrBlank() || !rawBody.startsWith(GROUP_SEEN_SIGNAL_PREFIX)) return null
        return try {
            val obj = JaTextJson.parseToJsonElement(rawBody.removePrefix(GROUP_SEEN_SIGNAL_PREFIX)).jsonObject
            val msgId = obj["messageId"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
            val seenUpTo = obj["seenUpToTs"]?.jsonPrimitive?.contentOrNull?.toLongOrNull() ?: 0L
            val ts = obj["ts"]?.jsonPrimitive?.contentOrNull?.toLongOrNull() ?: seenUpTo
            if (msgId.isEmpty() || seenUpTo <= 0L) null else ParsedGroupSeenCursor(msgId, seenUpTo, ts)
        } catch (_: Throwable) {
            null
        }
    }

    fun serializeGroupSeenSignal(messageId: String, seenUpToTs: Long): String {
        val obj = JsonObject(
            mapOf(
                "v" to JsonPrimitive(1),
                "messageId" to JsonPrimitive(messageId),
                "seenUpToTs" to JsonPrimitive(seenUpToTs),
                "ts" to JsonPrimitive(System.currentTimeMillis()),
            )
        )
        return "$GROUP_SEEN_SIGNAL_PREFIX$obj"
    }

    suspend fun hydrateDmMessages(
        context: Context,
        myUserId: String,
        rawMessages: List<ChatMessage>,
        token: String,
    ): List<ChatMessage> {
        val peerIds = rawMessages
            .flatMap { listOf(it.senderId, it.receiverId) }
            .filter { it.isNotBlank() && it != myUserId }
            .distinct()
        for (m in rawMessages) {
            val rawSig = m.rawWireBody ?: m.body
            if (rawSig.startsWith(E2EE_SIGNAL_PREFIX) && !rawSig.contains(E2EE_WIRE_MARKER)) {
                tryIngestIdentitySignal(m.senderId, rawSig)
            }
        }
        if (peerIds.isNotEmpty()) {
            ensurePeerBundles(peerIds, token)
        }
        val firstPass = ArrayList<ChatMessage>(rawMessages.size)
        for (m in rawMessages) {
            if (m.unsentAt != null) {
                firstPass.add(m.copy(body = ""))
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
                    val rawAttUrl = p.stk?.url ?: p.stk?.storageId ?: m.attachmentUrl
                    val effectiveAttUrl = rawAttUrl?.takeIf { it.isNotBlank() }?.let {
                        TursoApiClient.resolveAbsoluteMediaUrl(it)
                    }
                    val effectiveStickerUrl = p.stk?.let { stk ->
                        (stk.url ?: stk.storageId ?: m.attachmentUrl)?.takeIf { it.isNotBlank() }?.let {
                            TursoApiClient.resolveAbsoluteMediaUrl(it)
                        }
                    }
                    val effectiveAttName = p.att?.n ?: p.stk?.n ?: m.attachmentName
                    val effectiveAttType = p.att?.t ?: (if (p.stk != null) "sticker" else m.attachmentType)
                    firstPass.add(
                        m.copy(
                            body = strippedBody,
                            rawWireBody = wire,
                            bubbleStyle = bubble,
                            forwardedContext = fwdCtx ?: m.forwardedContext,
                            attachmentUrl = effectiveAttUrl,
                            attachmentName = effectiveAttName,
                            attachmentType = effectiveAttType,
                            stickerKey = p.stk?.key ?: m.stickerKey,
                            explicitStickerUrl = effectiveStickerUrl,
                            e2ee = dec.proof,
                            encryptedAttachmentJson = attDescJson,
                        )
                    )
                } else {
                    if (wire.startsWith(E2EE_SIGNAL_PREFIX)) continue
                    firstPass.add(
                        m.copy(
                            body = if (m.senderId == myUserId) {
                                "Syncing message from your other device…"
                            } else {
                                "Waiting for this message…"
                            },
                            rawWireBody = wire,
                            e2ee = MessageE2EEProof(encrypted = true),
                        )
                    )
                }
            } else {
                if (isSilentControlPayload(m.body)) continue
                val (cleanBody, bubble) = extractMessageBubbleStyle(m.body, m.attachmentType)
                val (fwdCtx, strippedBody) = extractForwardedContext(cleanBody)
                val resolvedUrl = m.attachmentUrl?.takeIf { it.isNotBlank() }?.let {
                    TursoApiClient.resolveAbsoluteMediaUrl(it)
                }
                firstPass.add(
                    m.copy(
                        body = strippedBody,
                        attachmentUrl = resolvedUrl,
                        bubbleStyle = m.bubbleStyle ?: bubble,
                        forwardedContext = fwdCtx ?: m.forwardedContext,
                    )
                )
            }
        }

        // Second pass: 2-tier decryption of quoted `replyTo` previews so replies NEVER show "Encrypted message"!
        val byId = firstPass.associateBy { it.id }
        val peerIdFallback = peerIds.firstOrNull().orEmpty()
        val finalOut = ArrayList<ChatMessage>(firstPass.size)
        for (m in firstPass) {
            val r = m.replyTo
            if (r == null) {
                finalOut.add(m)
                continue
            }
            val matched = byId[r.id]
            val resolvedReplyBody: String = when {
                matched != null -> {
                    if (matched.unsentAt != null) {
                        "Original message was unsent"
                    } else {
                        cleanReplySnippetText(
                            body = matched.body,
                            attachmentType = matched.attachmentType,
                            attachmentName = matched.attachmentName,
                            isSticker = matched.encryptedSticker != null,
                        )
                    }
                }
                isEncryptedWireBody(r.body) -> {
                    val peer = if (m.senderId == myUserId) m.receiverId else m.senderId.ifBlank { peerIdFallback }
                    val decReply = decryptDmWire(context, myUserId, r.id, myUserId, peer, r.body, token)
                        ?: decryptDmWire(context, myUserId, r.id, peer, myUserId, r.body, token)
                    if (decReply != null) {
                        val rp = decReply.payload
                        cleanReplySnippetText(
                            body = rp.b,
                            attachmentType = rp.att?.t ?: r.attachmentName,
                            attachmentName = rp.att?.n ?: rp.stk?.n ?: r.attachmentName,
                            isSticker = rp.stk != null,
                        )
                    } else {
                        r.attachmentName?.takeIf { it.isNotBlank() } ?: "Message"
                    }
                }
                else -> cleanReplySnippetText(
                    body = r.body,
                    attachmentName = r.attachmentName,
                    isSticker = false,
                )
            }
            finalOut.add(m.copy(replyTo = r.copy(body = resolvedReplyBody)))
        }
        return finalOut
    }

    suspend fun hydrateGroupMessagesWithSeen(
        context: Context,
        myUserId: String,
        groupId: String,
        rawMessages: List<GroupMessage>,
        members: List<GroupMember> = emptyList(),
        token: String = "",
    ): GroupHydrationOutcome {
        for (m in rawMessages) {
            val raw = m.rawWireBody ?: m.body
            if (raw.startsWith(E2EE_SIGNAL_PREFIX)) {
                if (!raw.contains(E2EE_WIRE_MARKER)) {
                    tryIngestIdentitySignal(m.senderId, raw)
                }
                tryIngestGroupEpochSignal(context, myUserId, m.senderId, raw)
            }
        }

        data class CursorMeta(
            val userId: String,
            val seenUpToTs: Long,
            val seenAt: Long,
            val fallbackName: String,
            val fallbackUsername: String,
            val fallbackAvatarColor: String,
            val fallbackAvatarUrl: String?,
        )

        val cursorsByUser = HashMap<String, CursorMeta>()
        var myCursorMsgId: String? = null
        var myCursorMsgCreatedAt = -1L
        var mySeenUpToTs = 0L

        fun recordSeenCursor(
            uid: String,
            seenUpToTs: Long,
            seenAt: Long,
            name: String,
            username: String,
            color: String,
            avatarUrl: String?,
        ) {
            if (uid.isBlank() || seenUpToTs <= 0L) return
            val existing = cursorsByUser[uid]
            if (existing == null || seenUpToTs >= existing.seenUpToTs) {
                cursorsByUser[uid] = CursorMeta(
                    userId = uid,
                    seenUpToTs = seenUpToTs,
                    seenAt = maxOf(seenAt, existing?.seenAt ?: 0L),
                    fallbackName = name,
                    fallbackUsername = username,
                    fallbackAvatarColor = color,
                    fallbackAvatarUrl = avatarUrl,
                )
            }
        }

        val firstPass = ArrayList<GroupMessage>(rawMessages.size)
        val rawSenderById = rawMessages.associate { it.id to it.senderId }

        for (m in rawMessages) {
            if (m.unsentAt != null) {
                firstPass.add(m.copy(body = ""))
                continue
            }
            val wire = m.rawWireBody ?: m.body
            if (wire.startsWith(E2EE_SIGNAL_PREFIX) && !wire.contains(E2EE_WIRE_MARKER)) {
                parseGroupSeenSignal(wire)?.let { sig ->
                    if (m.senderId == myUserId && m.createdAt >= myCursorMsgCreatedAt) {
                        myCursorMsgCreatedAt = m.createdAt
                        myCursorMsgId = m.id
                        mySeenUpToTs = maxOf(mySeenUpToTs, sig.seenUpToTs)
                    }
                    recordSeenCursor(
                        uid = m.senderId,
                        seenUpToTs = sig.seenUpToTs,
                        seenAt = sig.ts,
                        name = m.senderName,
                        username = m.senderUsername,
                        color = m.senderAvatarColor,
                        avatarUrl = m.senderAvatarUrl,
                    )
                }
                continue
            }
            if (isEncryptedWireBody(wire)) {
                val dec = decryptGroupWire(groupId, m.id, m.senderId, wire, context, myUserId, token)
                if (dec != null) {
                    val p = dec.payload
                    val sig = parseGroupSeenSignal(p.b)
                    if (sig != null) {
                        if (m.senderId == myUserId && m.createdAt >= myCursorMsgCreatedAt) {
                            myCursorMsgCreatedAt = m.createdAt
                            myCursorMsgId = m.id
                            mySeenUpToTs = maxOf(mySeenUpToTs, sig.seenUpToTs)
                        }
                        recordSeenCursor(
                            uid = m.senderId,
                            seenUpToTs = sig.seenUpToTs,
                            seenAt = sig.ts,
                            name = m.senderName,
                            username = m.senderUsername,
                            color = m.senderAvatarColor,
                            avatarUrl = m.senderAvatarUrl,
                        )
                        continue
                    }
                    if (isSilentControlPayload(p.b)) continue
                    val (cleanBody, zwBubble) = extractMessageBubbleStyle(p.b, m.attachmentType)
                    val (fwdCtx, strippedBody) = extractForwardedContext(cleanBody)
                    val bubble = p.bs?.takeIf { BUBBLE_STYLE_IDS.contains(it) } ?: zwBubble
                    val attDescJson = (p.att ?: p.stk?.att)?.let { JaTextJson.encodeToString(it) }
                    val rawAttUrl = p.stk?.url ?: p.stk?.storageId ?: m.attachmentUrl
                    val effectiveAttUrl = rawAttUrl?.takeIf { it.isNotBlank() }?.let {
                        TursoApiClient.resolveAbsoluteMediaUrl(it)
                    }
                    val effectiveStickerUrl = p.stk?.let { stk ->
                        (stk.url ?: stk.storageId ?: m.stickerUrl ?: m.attachmentUrl)?.takeIf { it.isNotBlank() }?.let {
                            TursoApiClient.resolveAbsoluteMediaUrl(it)
                        }
                    }
                    // Implicit seen cursor: sending a visible message proves they read up to createdAt!
                    recordSeenCursor(
                        uid = m.senderId,
                        seenUpToTs = m.createdAt,
                        seenAt = m.createdAt,
                        name = m.senderName,
                        username = m.senderUsername,
                        color = m.senderAvatarColor,
                        avatarUrl = m.senderAvatarUrl,
                    )
                    if (m.senderId == myUserId) {
                        mySeenUpToTs = maxOf(mySeenUpToTs, m.createdAt)
                    }
                    firstPass.add(
                        m.copy(
                            body = strippedBody,
                            rawWireBody = wire,
                            bubbleStyle = bubble,
                            forwardedContext = fwdCtx ?: m.forwardedContext,
                            attachmentUrl = effectiveAttUrl,
                            attachmentName = p.att?.n ?: p.stk?.n ?: m.attachmentName,
                            attachmentType = p.att?.t ?: (if (p.stk != null) "sticker" else m.attachmentType),
                            stickerKey = p.stk?.key ?: m.stickerKey,
                            explicitStickerUrl = effectiveStickerUrl,
                            e2ee = dec.proof,
                            encryptedAttachmentJson = attDescJson,
                        )
                    )
                } else {
                    if (wire.startsWith(E2EE_SIGNAL_PREFIX)) continue
                    firstPass.add(
                        m.copy(
                            body = if (m.senderId == myUserId) {
                                "Syncing message from your other device…"
                            } else {
                                "Waiting for this message…"
                            },
                            rawWireBody = wire,
                            e2ee = MessageE2EEProof(encrypted = true),
                        )
                    )
                }
            } else {
                val sig = parseGroupSeenSignal(m.body)
                if (sig != null) {
                    if (m.senderId == myUserId && m.createdAt >= myCursorMsgCreatedAt) {
                        myCursorMsgCreatedAt = m.createdAt
                        myCursorMsgId = m.id
                        mySeenUpToTs = maxOf(mySeenUpToTs, sig.seenUpToTs)
                    }
                    recordSeenCursor(
                        uid = m.senderId,
                        seenUpToTs = sig.seenUpToTs,
                        seenAt = sig.ts,
                        name = m.senderName,
                        username = m.senderUsername,
                        color = m.senderAvatarColor,
                        avatarUrl = m.senderAvatarUrl,
                    )
                    continue
                }
                if (isSilentControlPayload(m.body)) continue
                val (cleanBody, bubble) = extractMessageBubbleStyle(m.body, m.attachmentType)
                val (fwdCtx, strippedBody) = extractForwardedContext(cleanBody)
                val resolvedUrl = m.attachmentUrl?.takeIf { it.isNotBlank() }?.let {
                    TursoApiClient.resolveAbsoluteMediaUrl(it)
                }
                val resolvedStickerUrl = m.stickerUrl?.takeIf { it.isNotBlank() }?.let {
                    TursoApiClient.resolveAbsoluteMediaUrl(it)
                }
                recordSeenCursor(
                    uid = m.senderId,
                    seenUpToTs = m.createdAt,
                    seenAt = m.createdAt,
                    name = m.senderName,
                    username = m.senderUsername,
                    color = m.senderAvatarColor,
                    avatarUrl = m.senderAvatarUrl,
                )
                if (m.senderId == myUserId) {
                    mySeenUpToTs = maxOf(mySeenUpToTs, m.createdAt)
                }
                firstPass.add(
                    m.copy(
                        body = strippedBody,
                        attachmentUrl = resolvedUrl,
                        stickerUrl = resolvedStickerUrl,
                        bubbleStyle = m.bubbleStyle ?: bubble,
                        forwardedContext = fwdCtx ?: m.forwardedContext,
                    )
                )
            }
        }

        // Second pass: decrypt quoted `replyTo` previews in Group chats!
        val byId = firstPass.associateBy { it.id }
        val finalMessages = ArrayList<GroupMessage>(firstPass.size)
        for (m in firstPass) {
            val r = m.replyTo
            if (r == null) {
                finalMessages.add(m)
                continue
            }
            val matched = byId[r.id]
            val resolvedReplyBody: String = when {
                matched != null -> {
                    if (matched.unsentAt != null) {
                        "Original message was unsent"
                    } else {
                        cleanReplySnippetText(
                            body = matched.body,
                            attachmentType = matched.attachmentType,
                            attachmentName = matched.attachmentName,
                            isSticker = matched.encryptedSticker != null,
                        )
                    }
                }
                isEncryptedWireBody(r.body) -> {
                    val replySenderCandidates = buildList {
                        rawSenderById[r.id]?.takeIf { it.isNotBlank() }?.let { add(it) }
                        members.firstOrNull { it.displayName == r.senderName || it.username == r.senderName }?.id?.let {
                            if (!contains(it)) add(it)
                        }
                        for (mem in members) {
                            if (!contains(mem.id)) add(mem.id)
                        }
                    }
                    var decReply: DecryptedWireResult? = null
                    for (candSender in replySenderCandidates) {
                        decReply = decryptGroupWire(groupId, r.id, candSender, r.body)
                        if (decReply != null) break
                    }
                    if (decReply != null) {
                        val rp = decReply.payload
                        cleanReplySnippetText(
                            body = rp.b,
                            attachmentType = rp.att?.t,
                            attachmentName = rp.att?.n ?: rp.stk?.n ?: r.attachmentName,
                            isSticker = rp.stk != null,
                        )
                    } else {
                        r.attachmentName?.takeIf { it.isNotBlank() } ?: "Message"
                    }
                }
                else -> cleanReplySnippetText(
                    body = r.body,
                    attachmentName = r.attachmentName,
                    isSticker = false,
                )
            }
            finalMessages.add(m.copy(replyTo = r.copy(body = resolvedReplyBody)))
        }

        // Compute `seenByMessageId` (1:1 port of src/lib/groupSeenSignals.ts)
        val memberById = members.associateBy { it.id }
        val seenByMessageId = HashMap<String, MutableList<GroupSeenReader>>()
        val candidateVisible = finalMessages.filter {
            it.unsentAt == null && !it.id.startsWith("pending-") && parseWallpaperSignal(it.body, it.attachmentUrl) == null
        }

        if (candidateVisible.isNotEmpty()) {
            for ((uid, cursor) in cursorsByUser) {
                if (uid == myUserId) continue
                var targetMsg: GroupMessage? = null
                for (i in candidateVisible.indices.reversed()) {
                    val cand = candidateVisible[i]
                    if (cand.createdAt <= cursor.seenUpToTs) {
                        targetMsg = cand
                        break
                    }
                }
                if (targetMsg == null || targetMsg.senderId == uid) continue
                val mem = memberById[uid]
                val reader = GroupSeenReader(
                    id = uid,
                    displayName = mem?.displayName?.ifBlank { null } ?: cursor.fallbackName.ifBlank { "Member" },
                    username = mem?.username?.ifBlank { null } ?: cursor.fallbackUsername.ifBlank { "member" },
                    avatarColor = mem?.avatarColor?.ifBlank { null } ?: cursor.fallbackAvatarColor.ifBlank { "black" },
                    avatarUrl = (mem?.avatarUrl ?: cursor.fallbackAvatarUrl)?.takeIf { it.isNotBlank() },
                    seenAt = cursor.seenAt,
                )
                seenByMessageId.getOrPut(targetMsg.id) { mutableListOf() }.add(reader)
            }
            for ((_, list) in seenByMessageId) {
                list.sortByDescending { it.seenAt }
            }
        }

        return GroupHydrationOutcome(
            messages = finalMessages,
            seenByMessageId = seenByMessageId,
            myCursorMessageId = myCursorMsgId,
            mySeenUpToTs = mySeenUpToTs,
        )
    }

    suspend fun hydrateGroupMessages(
        context: Context,
        myUserId: String,
        groupId: String,
        rawMessages: List<GroupMessage>,
    ): List<GroupMessage> {
        return hydrateGroupMessagesWithSeen(
            context = context,
            myUserId = myUserId,
            groupId = groupId,
            rawMessages = rawMessages,
            members = emptyList(),
        ).messages
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
                val trimB = p.b.trim()
                return when {
                    trimB.startsWith(CALL_INVITE_PREFIX) || trimB.startsWith(GROUP_CALL_INVITE_PREFIX) ->
                        formatPreviewPlainText(p.b)
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

    /* ==================== Multi-Device Automatic Keyring Sync & E2EE Vault Restore ==================== */

    data class KeyringMergeOutcome(
        val changedLocal: Boolean,
        val needsRemotePush: Boolean,
        val primaryIdentity: StoredIdentityRecord,
    )

    fun clearDecryptedCaches() {
        decryptedByWireCache.clear()
        decryptedByMsgIdCache.clear()
        lastPeerForceRefreshAt.clear()
    }

    private fun isCompleteSigningAndDhIdentity(record: StoredIdentityRecord): Boolean {
        if (
            record.keyId.isBlank() ||
            record.dhPubB64.isBlank() ||
            record.dhPrivPkcs8B64.isBlank() ||
            record.sigPubB64.isBlank() ||
            record.sigPrivPkcs8B64.isBlank()
        ) {
            return false
        }
        return try {
            importPkcs8Private(b64UrlDecode(record.dhPrivPkcs8B64))
            importRawP256Public(b64UrlDecode(record.dhPubB64))
            importPkcs8Private(b64UrlDecode(record.sigPrivPkcs8B64))
            importRawP256Public(b64UrlDecode(record.sigPubB64))
            true
        } catch (_: Throwable) {
            false
        }
    }

    private fun isUsableDhIdentity(record: StoredIdentityRecord): Boolean {
        if (record.keyId.isBlank() || record.dhPrivPkcs8B64.isBlank()) return false
        return try {
            importPkcs8Private(b64UrlDecode(record.dhPrivPkcs8B64))
            true
        } catch (_: Throwable) {
            false
        }
    }

    private fun derivePbkdf2KeyBytes(
        algorithm: String,
        password: String,
        salt: ByteArray,
        iterations: Int,
        keyBits: Int = 256,
    ): ByteArray {
        val spec = PBEKeySpec(password.toCharArray(), salt, iterations, keyBits)
        return try {
            SecretKeyFactory.getInstance(algorithm).generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
    }

    private fun deriveAutoSyncKeyBytes(userId: String): ByteArray {
        return derivePbkdf2KeyBytes(
            algorithm = "PBKDF2WithHmacSHA256",
            password = "JaText-AutoKeyring-v1|$userId",
            salt = "JaText-AutoKeyring-Salt-v1|$userId".toByteArray(Charsets.UTF_8),
            iterations = 64_000,
            keyBits = 256,
        )
    }

    fun exportVaultContents(context: Context, userId: String): E2EEVaultContents {
        val primary = ensureOrCreatePrimaryIdentity(context, userId)
        val allLocal = loadLocalIdentities(context, userId)
        val previous = allLocal.filter { it.keyId != primary.keyId && isUsableDhIdentity(it) }
        val exportedEpochs = mutableListOf<E2EEVaultGroupEpoch>()
        for ((k, rawSecrets) in groupEpochSecrets.entries) {
            val sep = k.lastIndexOf(':')
            if (sep <= 0) continue
            val gid = k.substring(0, sep)
            val ep = k.substring(sep + 1).toIntOrNull() ?: continue
            if (gid.isBlank() || ep <= 0) continue
            val candidates = rawSecrets.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            for (secret in candidates) {
                exportedEpochs.add(
                    E2EEVaultGroupEpoch(
                        groupId = gid,
                        epoch = ep,
                        secretB64 = secret,
                        createdAt = System.currentTimeMillis(),
                    )
                )
            }
        }
        return E2EEVaultContents(
            v = 1,
            userId = userId,
            primaryIdentity = primary,
            previousIdentities = previous.take(32),
            groupEpochs = exportedEpochs,
            exportedAt = System.currentTimeMillis(),
        )
    }

    fun sealAutoSyncKeyring(contents: E2EEVaultContents): SealedAutoSyncKeyring {
        val keyBytes = deriveAutoSyncKeyBytes(contents.userId)
        val iv = randomBytes(12)
        val aad = "JaText-AutoKeyring-AAD-v1|${contents.userId}".toByteArray(Charsets.UTF_8)
        val plainBytes = JaTextJson.encodeToString(contents).toByteArray(Charsets.UTF_8)
        val ct = aesGcmEncrypt(keyBytes, iv, aad, plainBytes)
        val keyIds = buildList {
            if (contents.primaryIdentity.keyId.isNotBlank()) add(contents.primaryIdentity.keyId)
            for (p in contents.previousIdentities) {
                if (p.keyId.isNotBlank() && !contains(p.keyId)) add(p.keyId)
            }
        }
        return SealedAutoSyncKeyring(
            v = 1,
            userId = contents.userId,
            keyIds = keyIds,
            iv = b64UrlEncode(iv),
            ct = b64UrlEncode(ct),
            updatedAt = System.currentTimeMillis(),
        )
    }

    fun openAutoSyncKeyring(sealed: SealedAutoSyncKeyring, expectedUserId: String): E2EEVaultContents? {
        if (sealed.v != 1 || sealed.userId != expectedUserId || sealed.iv.isBlank() || sealed.ct.isBlank()) {
            return null
        }
        return try {
            val keyBytes = deriveAutoSyncKeyBytes(expectedUserId)
            val aad = "JaText-AutoKeyring-AAD-v1|$expectedUserId".toByteArray(Charsets.UTF_8)
            val plain = aesGcmDecrypt(keyBytes, b64UrlDecode(sealed.iv), aad, b64UrlDecode(sealed.ct))
            val parsed = JaTextJson.decodeFromString<E2EEVaultContents>(String(plain, Charsets.UTF_8))
            if (parsed.userId == expectedUserId && parsed.primaryIdentity.keyId.isNotBlank()) parsed else null
        } catch (_: Throwable) {
            null
        }
    }

    fun mergeAutoSyncedKeyring(
        context: Context,
        userId: String,
        remote: E2EEVaultContents?,
    ): KeyringMergeOutcome {
        loadGroupEpochMap(context, userId)
        val currentPrimary = ensureOrCreatePrimaryIdentity(context, userId)
        val localIdentities = loadLocalIdentities(context, userId).ifEmpty { listOf(currentPrimary) }

        if (remote == null || remote.userId != userId) {
            return KeyringMergeOutcome(
                changedLocal = false,
                needsRemotePush = true,
                primaryIdentity = currentPrimary,
            )
        }

        val completeByKeyId = LinkedHashMap<String, StoredIdentityRecord>()
        val legacyDhOnlyByKeyId = LinkedHashMap<String, StoredIdentityRecord>()

        val remoteAll = listOf(remote.primaryIdentity) + remote.previousIdentities
        for (item in remoteAll) {
            val fixed = if (item.userId.isBlank()) item.copy(userId = userId) else item
            if (isCompleteSigningAndDhIdentity(fixed)) {
                completeByKeyId[fixed.keyId] = fixed
            } else if (isUsableDhIdentity(fixed)) {
                legacyDhOnlyByKeyId[fixed.keyId] = fixed
            }
        }
        for (item in localIdentities) {
            val fixed = if (item.userId.isBlank()) item.copy(userId = userId) else item
            if (isCompleteSigningAndDhIdentity(fixed)) {
                if (!completeByKeyId.containsKey(fixed.keyId)) {
                    completeByKeyId[fixed.keyId] = fixed
                }
            } else if (isUsableDhIdentity(fixed) && !completeByKeyId.containsKey(fixed.keyId)) {
                legacyDhOnlyByKeyId[fixed.keyId] = fixed
            }
        }

        val sortedComplete = completeByKeyId.values.sortedWith { a, b ->
            val ta = if (a.createdAt > 0L) a.createdAt else Long.MAX_VALUE
            val tb = if (b.createdAt > 0L) b.createdAt else Long.MAX_VALUE
            if (ta != tb) ta.compareTo(tb) else a.keyId.compareTo(b.keyId)
        }

        val canonicalPrimary = sortedComplete.firstOrNull() ?: currentPrimary
        val canonicalPrevious = sortedComplete.drop(1).take(32)
        val mergedLocalList = buildList {
            add(canonicalPrimary)
            addAll(canonicalPrevious)
            for (legacy in legacyDhOnlyByKeyId.values) {
                if (none { it.keyId == legacy.keyId }) add(legacy)
            }
        }

        val localCompleteKeySet = localIdentities
            .filter { isCompleteSigningAndDhIdentity(it) }
            .map { it.keyId }
            .toSet()
        val remoteCompleteKeySet = remoteAll
            .filter { isCompleteSigningAndDhIdentity(it) }
            .map { it.keyId }
            .toSet()

        var epochsAddedLocally = false
        var localHasExtraEpoch = false
        val remoteEpochPairs = HashSet<String>()
        for (ep in remote.groupEpochs) {
            if (ep.groupId.isNotBlank() && ep.epoch > 0 && ep.secretB64.isNotBlank()) {
                remoteEpochPairs.add("${ep.groupId}:${ep.epoch}:${ep.secretB64.trim()}")
                if (addGroupEpochCandidateSecret(ep.groupId, ep.epoch, ep.secretB64)) {
                    epochsAddedLocally = true
                }
            }
        }
        for ((k, rawSecrets) in groupEpochSecrets.entries) {
            val sep = k.lastIndexOf(':')
            if (sep <= 0) continue
            val gid = k.substring(0, sep)
            val ep = k.substring(sep + 1).toIntOrNull() ?: continue
            val candidates = rawSecrets.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            for (secret in candidates) {
                if (!remoteEpochPairs.contains("$gid:$ep:$secret")) {
                    localHasExtraEpoch = true
                }
            }
        }

        val primaryChanged = currentPrimary.keyId != canonicalPrimary.keyId
        val gainedNewIdentity = sortedComplete.any { !localCompleteKeySet.contains(it.keyId) }
        val changedLocal = primaryChanged || gainedNewIdentity || epochsAddedLocally

        val remoteMissingIdentity = sortedComplete.any { !remoteCompleteKeySet.contains(it.keyId) }
        val remotePrimaryDiffers = remote.primaryIdentity.keyId != canonicalPrimary.keyId
        val needsRemotePush = remoteMissingIdentity || remotePrimaryDiffers || localHasExtraEpoch

        if (changedLocal) {
            saveLocalIdentities(context, userId, mergedLocalList)
            persistGroupEpochMap(context, userId)
            publishedSessionKeyIds.remove(canonicalPrimary.keyId)
            registerPeerBundles(
                mergedLocalList.filter { it.dhPubB64.isNotBlank() }.map {
                    PublicIdentityBundle(
                        userId = userId,
                        keyId = it.keyId,
                        dhPubB64 = it.dhPubB64,
                        sigPubB64 = it.sigPubB64,
                        selfSigB64 = it.selfSigB64,
                        ts = it.createdAt,
                    )
                }
            )
            clearDecryptedCaches()
        }

        return KeyringMergeOutcome(
            changedLocal = changedLocal,
            needsRemotePush = needsRemotePush,
            primaryIdentity = canonicalPrimary,
        )
    }

    suspend fun syncAccountKeyringWithServer(
        context: Context,
        userId: String,
        stickerItems: List<StickerMedia>,
        token: String,
        forcePush: Boolean = false,
    ): KeyringMergeOutcome? = withContext(Dispatchers.Default) {
        if (userId.isBlank() || token.isBlank()) return@withContext null
        try {
            val autoSyncEntry = stickerItems
                .filter { it.name.trim() == E2EE_AUTOSYNC_STICKER_NAME && it.url.isNotBlank() }
                .maxByOrNull { it.lastUsedAt ?: 0L }

            var remoteContents: E2EEVaultContents? = null
            if (autoSyncEntry != null) {
                try {
                    val rawBytes = TursoApiClient.fetchMediaBytesSmart(autoSyncEntry.url)
                    val sealed = JaTextJson.decodeFromString<SealedAutoSyncKeyring>(
                        String(rawBytes, Charsets.UTF_8)
                    )
                    remoteContents = openAutoSyncKeyring(sealed, userId)
                } catch (_: Throwable) {
                }
            }

            val outcome = mergeAutoSyncedKeyring(context, userId, remoteContents)
            ensurePrimaryIdentityPublished(outcome.primaryIdentity, token, force = outcome.changedLocal)

            if (outcome.needsRemotePush || forcePush) {
                try {
                    val exported = exportVaultContents(context, userId)
                    val sealed = sealAutoSyncKeyring(exported)
                    val jsonBytes = JaTextJson.encodeToString(sealed).toByteArray(Charsets.UTF_8)
                    val uploadedUrl = TursoApiClient.uploadMediaBytes(
                        bytes = jsonBytes,
                        fileName = "e2ee-autosync.json",
                        mimeType = "application/json",
                        token = token,
                    )
                    if (uploadedUrl.isNotBlank()) {
                        TursoApiClient.rpcRaw(
                            op = "upsertSticker",
                            args = mapOf(
                                "sticker" to mapOf(
                                    "key" to "upload:$uploadedUrl",
                                    "url" to uploadedUrl,
                                    "name" to E2EE_AUTOSYNC_STICKER_NAME,
                                    "mediaType" to "sticker",
                                    "source" to "upload",
                                ),
                                "isFavorite" to true,
                            ),
                            token = token,
                        )
                    }
                } catch (_: Throwable) {
                }
            }
            outcome
        } catch (_: Throwable) {
            null
        }
    }

    private fun normalizeRecoveryKey(input: String): String =
        input.uppercase().replace(Regex("[^A-Z0-9]"), "")

    fun openSealedE2EEVault(
        sealed: SealedE2EEVault,
        secretInput: String,
        useRecoveryKey: Boolean,
    ): E2EEVaultContents {
        val wrap = if (useRecoveryKey) sealed.recoveryWrap else sealed.pinWrap
        val formattedSecret = if (useRecoveryKey) {
            "rec:${sealed.userId}:${normalizeRecoveryKey(secretInput)}"
        } else {
            "pin:${sealed.userId}:$secretInput"
        }
        val vaultMasterBytes = try {
            val kwk = derivePbkdf2KeyBytes(
                algorithm = "PBKDF2WithHmacSHA512",
                password = formattedSecret,
                salt = b64UrlDecode(wrap.salt),
                iterations = wrap.iterations.coerceAtLeast(10_000),
                keyBits = 256,
            )
            aesGcmDecrypt(kwk, b64UrlDecode(wrap.iv), null, b64UrlDecode(wrap.ct))
        } catch (_: Throwable) {
            throw IllegalArgumentException(
                if (useRecoveryKey) "Incorrect E2EE Recovery Key." else "Incorrect E2EE backup PIN / passphrase."
            )
        }
        val aad = "JaText-Vault-v1|${sealed.userId}|${sealed.keyId}".toByteArray(Charsets.UTF_8)
        val plain = aesGcmDecrypt(
            vaultMasterBytes,
            b64UrlDecode(sealed.vaultIv),
            aad,
            b64UrlDecode(sealed.vaultCt),
        )
        return JaTextJson.decodeFromString<E2EEVaultContents>(String(plain, Charsets.UTF_8))
    }

    suspend fun restoreVaultFromServer(
        context: Context,
        userId: String,
        secretInput: String,
        useRecoveryKey: Boolean,
        stickerItems: List<StickerMedia>,
        token: String,
    ): StoredIdentityRecord = withContext(Dispatchers.Default) {
        var sealedVault: SealedE2EEVault? = null
        try {
            val root = TursoApiClient.rpcRaw("getMyE2EEVault", emptyMap(), token).jsonObject
            val vaultJsonStr = root["vaultJson"]?.jsonPrimitive?.contentOrNull
                ?: root["vault"]?.jsonObject?.get("vaultJson")?.jsonPrimitive?.contentOrNull
            if (!vaultJsonStr.isNullOrBlank()) {
                sealedVault = JaTextJson.decodeFromString<SealedE2EEVault>(vaultJsonStr)
            } else if (root["vault"] is JsonObject) {
                sealedVault = JaTextJson.decodeFromJsonElement(SealedE2EEVault.serializer(), root["vault"]!!)
            }
        } catch (_: Throwable) {
        }
        if (sealedVault == null) {
            val vaultSticker = stickerItems
                .filter { it.name.trim() == E2EE_VAULT_STICKER_NAME && it.url.isNotBlank() }
                .maxByOrNull { it.lastUsedAt ?: 0L }
            if (vaultSticker != null) {
                val raw = TursoApiClient.fetchMediaBytesSmart(vaultSticker.url)
                sealedVault = JaTextJson.decodeFromString<SealedE2EEVault>(String(raw, Charsets.UTF_8))
            }
        }
        val resolvedSealed = sealedVault
            ?: throw IllegalStateException("No encrypted E2EE Vault backup found for this account yet.")
        val opened = openSealedE2EEVault(resolvedSealed, secretInput, useRecoveryKey)
        val merged = mergeAutoSyncedKeyring(context, userId, opened)
        publishedSessionKeyIds.remove(merged.primaryIdentity.keyId)
        ensurePrimaryIdentityPublished(merged.primaryIdentity, token)
        syncAccountKeyringWithServer(context, userId, stickerItems, token, forcePush = true)
        merged.primaryIdentity
    }

    fun sealDeviceLinkBundle(
        context: Context,
        userId: String,
        pairingId: String,
        linkSecret: String,
        webDhPubB64: String,
        outgoingBubbleStyle: String,
        wallpapers: Map<String, String>,
    ): String {
        loadGroupEpochMap(context, userId)
        val vault = exportVaultContents(context, userId)
        val plainBundle = PlainDeviceLinkBundle(
            v = 1,
            userId = userId,
            vault = vault,
            outgoingBubbleStyle = outgoingBubbleStyle,
            wallpapers = wallpapers,
        )
        val plainBytes = JaTextJson.encodeToString(plainBundle).toByteArray(Charsets.UTF_8)

        val peerPub = importRawP256Public(b64UrlDecode(webDhPubB64))
        val kpg = KeyPairGenerator.getInstance("EC").apply {
            initialize(ECGenParameterSpec("secp256r1"), secureRandom)
        }
        val ephem = kpg.generateKeyPair()
        val shared = ecdhSharedSecret(ephem.private, peerPub)
        val salt = sha256(linkSecret.toByteArray(Charsets.UTF_8))
        val aesKey = hkdfSha256(shared, salt, "JaText-DeviceLink-Wrap-v1|$pairingId")
        val iv = randomBytes(12)
        val aad = "JaText-DeviceLink-AAD-v1|$pairingId|$userId".toByteArray(Charsets.UTF_8)
        val ct = aesGcmEncrypt(aesKey, iv, aad, plainBytes)

        val sealed = SealedDeviceLinkBundle(
            v = 1,
            userId = userId,
            epk = b64UrlEncode(exportRawUncompressedP256Public(ephem.public)),
            iv = b64UrlEncode(iv),
            ct = b64UrlEncode(ct),
        )
        return JaTextJson.encodeToString(sealed)
    }
}
