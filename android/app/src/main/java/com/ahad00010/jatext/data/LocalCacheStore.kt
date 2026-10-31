package com.ahad00010.jatext.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.ahad00010.jatext.BuildConfig
import com.ahad00010.jatext.JaTextE2EEDecryptor
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.json.JSONArray
import org.json.JSONObject

val JaTextJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    coerceInputValues = true
    encodeDefaults = true
    explicitNulls = false
}

class LocalCacheStore(private val appContext: Context) :
    SQLiteOpenHelper(appContext, "jatext_native_cache.db", null, 2) {

    private val prefs = appContext.getSharedPreferences("jatext_native_prefs", Context.MODE_PRIVATE)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS kv_cache (
                cache_key TEXT PRIMARY KEY,
                json_val TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS kv_cache (
                cache_key TEXT PRIMARY KEY,
                json_val TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }

    private fun putKv(key: String, jsonVal: String) {
        try {
            val values = ContentValues().apply {
                put("cache_key", key)
                put("json_val", jsonVal)
                put("updated_at", System.currentTimeMillis())
            }
            writableDatabase.insertWithOnConflict(
                "kv_cache",
                null,
                values,
                SQLiteDatabase.CONFLICT_REPLACE
            )
        } catch (_: Throwable) {
        }
    }

    private fun getKv(key: String): String? {
        return try {
            readableDatabase.query(
                "kv_cache",
                arrayOf("json_val"),
                "cache_key = ?",
                arrayOf(key),
                null,
                null,
                null
            ).use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        } catch (_: Throwable) {
            null
        }
    }

    private fun deleteKv(key: String) {
        try {
            writableDatabase.delete("kv_cache", "cache_key = ?", arrayOf(key))
        } catch (_: Throwable) {
        }
    }

    /* ==================== Multi-Account Slots ==================== */

    fun getActiveSlotId(): String {
        return prefs.getString("active_slot_id", "slot-1") ?: "slot-1"
    }

    fun setActiveSlotId(slotId: String) {
        prefs.edit().putString("active_slot_id", slotId).apply()
        val token = getTokenForSlot(slotId)
        if (!token.isNullOrBlank()) {
            JaTextE2EEDecryptor.setAuthStorageItem(
                appContext,
                "jatext:turso-jwt:$slotId",
                token,
                BuildConfig.API_ORIGIN
            )
        }
    }

    fun getAccounts(): List<AccountSlot> {
        val raw = prefs.getString("account_slots_json", null) ?: return emptyList()
        return try {
            JaTextJson.decodeFromString<List<AccountSlot>>(raw)
        } catch (_: Throwable) {
            emptyList()
        }
    }

    fun saveAccounts(accounts: List<AccountSlot>) {
        try {
            prefs.edit()
                .putString("account_slots_json", JaTextJson.encodeToString(accounts))
                .apply()
        } catch (_: Throwable) {
        }
    }

    fun getTokenForSlot(slotId: String): String? {
        val fromSlots = getAccounts().firstOrNull { it.slotId == slotId }?.token
        if (!fromSlots.isNullOrBlank()) return fromSlots
        return prefs.getString("token:$slotId", null)?.takeIf { it.isNotBlank() }
    }

    fun upsertSlotSession(slotId: String, token: String, user: JaUser?) {
        prefs.edit().putString("token:$slotId", token).apply()
        val current = getAccounts().toMutableList()
        val existingIdx = current.indexOfFirst {
            it.slotId == slotId || (user != null && user.id.isNotBlank() && it.userId == user.id)
        }
        val effectiveSlotId = if (existingIdx >= 0) current[existingIdx].slotId else slotId
        val prev = if (existingIdx >= 0) current[existingIdx] else null
        val updated = AccountSlot(
            slotId = effectiveSlotId,
            userId = user?.id ?: prev?.userId.orEmpty(),
            email = user?.email ?: prev?.email.orEmpty(),
            displayName = user?.displayName ?: prev?.displayName.orEmpty(),
            username = user?.username ?: prev?.username.orEmpty(),
            avatarColor = user?.avatarColor ?: prev?.avatarColor ?: "black",
            avatarUrl = user?.avatarUrl ?: prev?.avatarUrl,
            token = token,
            lastActiveAt = System.currentTimeMillis(),
        )
        if (existingIdx >= 0) {
            current[existingIdx] = updated
        } else {
            current.add(updated)
        }
        saveAccounts(current)
        prefs.edit().putString("active_slot_id", effectiveSlotId).apply()
        JaTextE2EEDecryptor.setAuthStorageItem(
            appContext,
            "jatext:turso-jwt:$effectiveSlotId",
            token,
            BuildConfig.API_ORIGIN
        )
    }

    fun createNextEmptySlotId(): String {
        val existingIds = getAccounts().map { it.slotId }.toSet()
        var n = 1
        while (existingIds.contains("slot-$n")) {
            n++
        }
        return "slot-$n"
    }

    fun removeSlotSession(slotId: String) {
        prefs.edit().remove("token:$slotId").apply()
        val remaining = getAccounts().filterNot { it.slotId == slotId }
        saveAccounts(remaining)
        deleteKv("boot:$slotId")
        JaTextE2EEDecryptor.removeAuthStorageItem(appContext, "jatext:turso-jwt:$slotId")
        if (getActiveSlotId() == slotId) {
            val next = remaining.firstOrNull()?.slotId ?: "slot-1"
            setActiveSlotId(next)
        }
    }

    /* ==================== Offline Bootstrap & Thread Cache ==================== */

    fun saveBootstrapCache(slotId: String, boot: BootstrapResponse) {
        try {
            putKv("boot:$slotId", JaTextJson.encodeToString(boot))
        } catch (_: Throwable) {
        }
    }

    fun loadBootstrapCache(slotId: String): BootstrapResponse? {
        val raw = getKv("boot:$slotId") ?: return null
        return try {
            JaTextJson.decodeFromString<BootstrapResponse>(raw)
        } catch (_: Throwable) {
            null
        }
    }

    fun saveDmMessagesCache(slotId: String, friendId: String, messages: List<ChatMessage>) {
        try {
            val trimmed = if (messages.size > 160) messages.takeLast(160) else messages
            putKv("dm:$slotId:$friendId", JaTextJson.encodeToString(trimmed))
        } catch (_: Throwable) {
        }
    }

    fun loadDmMessagesCache(slotId: String, friendId: String): List<ChatMessage>? {
        val raw = getKv("dm:$slotId:$friendId") ?: return null
        return try {
            JaTextJson.decodeFromString<List<ChatMessage>>(raw)
        } catch (_: Throwable) {
            null
        }
    }

    fun saveGroupMessagesCache(slotId: String, groupId: String, messages: List<GroupMessage>) {
        try {
            val trimmed = if (messages.size > 160) messages.takeLast(160) else messages
            putKv("grp:$slotId:$groupId", JaTextJson.encodeToString(trimmed))
        } catch (_: Throwable) {
        }
    }

    fun loadGroupMessagesCache(slotId: String, groupId: String): List<GroupMessage>? {
        val raw = getKv("grp:$slotId:$groupId") ?: return null
        return try {
            JaTextJson.decodeFromString<List<GroupMessage>>(raw)
        } catch (_: Throwable) {
            null
        }
    }

    fun saveGroupDetailsCache(slotId: String, groupId: String, details: GroupDetails) {
        try {
            putKv("grpdet:$slotId:$groupId", JaTextJson.encodeToString(details))
        } catch (_: Throwable) {
        }
    }

    fun loadGroupDetailsCache(slotId: String, groupId: String): GroupDetails? {
        val raw = getKv("grpdet:$slotId:$groupId") ?: return null
        return try {
            JaTextJson.decodeFromString<GroupDetails>(raw)
        } catch (_: Throwable) {
            null
        }
    }

    /* ==================== Preferences, Bubbles, Wallpapers, Drafts & Calls ==================== */

    fun getOutgoingBubbleStyle(slotId: String): String {
        return prefs.getString("bubble:$slotId", "default") ?: "default"
    }

    fun setOutgoingBubbleStyle(slotId: String, styleId: String) {
        prefs.edit().putString("bubble:$slotId", styleId).apply()
    }

    fun getWallpaperUrl(scopeKey: String): String? {
        return prefs.getString("wp:$scopeKey", null)?.takeIf { it.isNotBlank() }
    }

    fun setWallpaperUrl(scopeKey: String, url: String?) {
        if (url.isNullOrBlank()) {
            prefs.edit().remove("wp:$scopeKey").apply()
        } else {
            prefs.edit().putString("wp:$scopeKey", url).apply()
        }
    }

    fun getDraft(slotId: String, targetKey: String): String {
        return prefs.getString("draft:$slotId:$targetKey", "") ?: ""
    }

    fun setDraft(slotId: String, targetKey: String, text: String) {
        if (text.isEmpty()) {
            prefs.edit().remove("draft:$slotId:$targetKey").apply()
        } else {
            prefs.edit().putString("draft:$slotId:$targetKey", text).apply()
        }
    }

    fun getCallHistory(slotId: String): List<CallHistoryEntry> {
        val raw = getKv("calls:$slotId") ?: return emptyList()
        return try {
            JaTextJson.decodeFromString<List<CallHistoryEntry>>(raw)
        } catch (_: Throwable) {
            emptyList()
        }
    }

    fun upsertCallHistory(slotId: String, entry: CallHistoryEntry) {
        val list = getCallHistory(slotId).toMutableList()
        val idx = list.indexOfFirst { it.id == entry.id }
        if (idx >= 0) {
            list[idx] = entry
        } else {
            list.add(0, entry)
        }
        putKv("calls:$slotId", JaTextJson.encodeToString(list.take(100)))
    }

    fun isPeerSecurityVerified(userId: String, peerId: String, fingerprint: String): Boolean {
        return prefs.getString("verified:$userId:$peerId", null) == fingerprint
    }

    fun setPeerSecurityVerified(userId: String, peerId: String, fingerprint: String, verified: Boolean) {
        if (verified) {
            prefs.edit().putString("verified:$userId:$peerId", fingerprint).apply()
        } else {
            prefs.edit().remove("verified:$userId:$peerId").apply()
        }
    }

    fun getThemeJson(userScope: String): String? {
        return prefs.getString("theme:$userScope", null)
    }

    fun setThemeJson(userScope: String, jsonStr: String) {
        prefs.edit().putString("theme:$userScope", jsonStr).apply()
    }

    fun isNotificationsEnabled(): Boolean {
        return prefs.getBoolean("notifications_enabled", true)
    }

    fun setNotificationsEnabled(enabled: Boolean) {
        prefs.edit().putBoolean("notifications_enabled", enabled).apply()
    }

    fun isSoundsEnabled(): Boolean {
        return prefs.getBoolean("sounds_enabled", true)
    }

    fun setSoundsEnabled(enabled: Boolean) {
        prefs.edit().putBoolean("sounds_enabled", enabled).apply()
    }

    fun getNotifSoundMode(): String =
        JaTextE2EEDecryptor.prefs(appContext).getString("notif_sound_mode", "default") ?: "default"

    fun getNotifSoundLabel(): String =
        JaTextE2EEDecryptor.prefs(appContext).getString("notif_sound_label", "JaText (Default)") ?: "JaText (Default)"

    fun getNotifSoundUri(): String =
        JaTextE2EEDecryptor.prefs(appContext).getString("notif_sound_uri", "") ?: ""

    fun getRingtoneMode(): String =
        JaTextE2EEDecryptor.prefs(appContext).getString("ringtone_mode", "default") ?: "default"

    fun getRingtoneLabel(): String =
        JaTextE2EEDecryptor.prefs(appContext).getString("ringtone_label", "JaText (Default)") ?: "JaText (Default)"

    fun getRingtoneUri(): String =
        JaTextE2EEDecryptor.prefs(appContext).getString("ringtone_uri", "") ?: ""

    fun getLastSeenVersionCode(): Int = prefs.getInt("last_seen_version_code", 0)
    fun setLastSeenVersionCode(code: Int) {
        prefs.edit().putInt("last_seen_version_code", code).apply()
    }

    fun hasShownPermissionsOnboarding(): Boolean = prefs.getBoolean("shown_perms_modal", false)
    fun markShownPermissionsOnboarding() {
        prefs.edit().putBoolean("shown_perms_modal", true).apply()
    }

    fun syncSuppressedPushTargets(
        communityMuted: Boolean,
        suppressedDmIds: Collection<String>,
        suppressedGroupIds: Collection<String>,
    ) {
        try {
            val obj = JSONObject().apply {
                put("communityMuted", communityMuted)
                put("dmIds", JSONArray(suppressedDmIds.toList()))
                put("groupIds", JSONArray(suppressedGroupIds.toList()))
            }
            JaTextE2EEDecryptor.setAuthStorageItem(
                appContext,
                "jatext:suppressed-push-targets",
                obj.toString(),
                BuildConfig.API_ORIGIN
            )
        } catch (_: Throwable) {
        }
    }
}
