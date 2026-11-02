package com.ahad00010.jatext;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import androidx.core.app.NotificationCompat;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * On-device zero-knowledge E2EE notification decryptor for Android background & killed states.
 * Mirrors WebCrypto ECDH P-256 + HKDF-SHA-256 + AES-256-GCM bit-for-bit using MODE_PRIVATE keys.
 */
public final class JaTextE2EEDecryptor {

    public static final String PREFS_NAME = "jatext_e2ee_push";
    private static final String E2EE_MARKER = "__JATEXT_E2EE_V1__:";
    private static final String SIGNAL_PREFIX = "__JATEXT_CALL_SIG__:";

    // ASN.1 DER SubjectPublicKeyInfo prefix for 65-byte uncompressed P-256 (secp256r1) point
    private static final byte[] P256_SPKI_PREFIX = new byte[] {
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, (byte) 0x86,
        0x48, (byte) 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
        (byte) 0x86, 0x48, (byte) 0xce, 0x3d, 0x03, 0x01, 0x07,
        0x03, 0x42, 0x00
    };

    private JaTextE2EEDecryptor() {}

    public static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static boolean areNotificationsAllowed(Context ctx) {
        SharedPreferences sp = prefs(ctx);
        boolean enabled = sp.getBoolean("notifications_enabled", true);
        boolean dnd = sp.getBoolean("is_dnd", false);
        return enabled && !dnd;
    }

    public static void setAuthStorageItem(Context ctx, String key, String value, String convexUrl) {
        if (ctx == null || key == null) return;
        SharedPreferences.Editor ed = prefs(ctx).edit();
        ed.putString("auth_item:" + key, value);
        if (key.contains("__convexAuthJWT") || key.startsWith("jatext:turso-jwt:")) {
            ed.putString("auth_jwt", value);
            ed.putString("auth_jwt_key", key);
        } else if (key.contains("__convexAuthRefreshToken")) {
            ed.putString("auth_refresh", value);
            ed.putString("auth_refresh_key", key);
        }
        if (convexUrl != null && !convexUrl.isEmpty()) {
            ed.putString("convex_url", convexUrl);
        }
        ed.apply();
    }

    public static String getAuthStorageItem(Context ctx, String key) {
        if (ctx == null || key == null) return null;
        return prefs(ctx).getString("auth_item:" + key, null);
    }

    public static void removeAuthStorageItem(Context ctx, String key) {
        if (ctx == null || key == null) return;
        SharedPreferences.Editor ed = prefs(ctx).edit();
        ed.remove("auth_item:" + key);
        if (key.contains("__convexAuthJWT") || key.startsWith("jatext:turso-jwt:")) {
            ed.remove("auth_jwt");
        } else if (key.contains("__convexAuthRefreshToken")) {
            ed.remove("auth_refresh");
        }
        ed.apply();
    }

    public static void syncState(
        Context ctx,
        String convexUrl,
        String userId,
        boolean notificationsEnabled,
        boolean isDnd,
        String identitiesJson,
        String peersJson,
        String groupsJson,
        String authJwt,
        String authRefreshToken
    ) {
        if (ctx == null) return;
        SharedPreferences.Editor ed = prefs(ctx).edit();
        if (convexUrl != null && !convexUrl.isEmpty()) {
            ed.putString("convex_url", convexUrl);
        }
        if (userId != null) {
            ed.putString("user_id", userId);
        }
        ed.putBoolean("notifications_enabled", notificationsEnabled);
        ed.putBoolean("is_dnd", isDnd);
        if (identitiesJson != null) {
            ed.putString("identities_json", identitiesJson);
        }
        if (peersJson != null) {
            ed.putString("peers_json", peersJson);
        }
        if (groupsJson != null) {
            ed.putString("groups_json", groupsJson);
        }
        if (authJwt != null && !authJwt.isEmpty()) {
            ed.putString("auth_jwt", authJwt);
        }
        if (authRefreshToken != null && !authRefreshToken.isEmpty()) {
            ed.putString("auth_refresh", authRefreshToken);
        }
        ed.apply();
    }

    public static boolean isPlaceholderOrEncryptedPreview(String text) {
        if (text == null) return true;
        String t = text.trim();
        if (t.isEmpty()) return true;
        if (t.contains(E2EE_MARKER)) return true;
        if (t.contains("__JATEXT_") || t.contains("JATEXT_E2EE") || t.contains("JATEXT___")) return true;
        String lower = t.toLowerCase();
        return lower.equals("encrypted message") ||
            lower.equals("🔒 encrypted message") ||
            lower.equals("sent you a message") ||
            lower.contains("sent an encrypted message") ||
            lower.contains("mentioned you in an encrypted message") ||
            lower.equals("new message") ||
            lower.startsWith("decrypting") ||
            lower.startsWith("🔒 decrypting") ||
            lower.startsWith("waiting for this message");
    }

    private static boolean isPushTargetSuppressed(
        Context ctx,
        String senderId,
        String groupId,
        String chatId,
        String title,
        String type
    ) {
        try {
            String raw = getAuthStorageItem(ctx, "jatext:suppressed-push-targets");
            if (raw == null || raw.isEmpty()) return false;
            JSONObject obj = new JSONObject(raw);

            if (obj.optBoolean("communityMuted", false)) {
                if (
                    "announcement".equals(type) ||
                    "community".equals(type) ||
                    "jatext-community".equals(chatId) ||
                    (title != null && title.toLowerCase().contains("jatext community"))
                ) {
                    return true;
                }
            }

            if (groupId != null && !groupId.isEmpty()) {
                JSONArray groupIds = obj.optJSONArray("groupIds");
                if (groupIds != null) {
                    for (int i = 0; i < groupIds.length(); i++) {
                        if (groupId.equals(groupIds.optString(i))) {
                            return true;
                        }
                    }
                }
            } else {
                JSONArray dmIds = obj.optJSONArray("dmIds");
                if (dmIds != null) {
                    for (int i = 0; i < dmIds.length(); i++) {
                        String id = dmIds.optString(i);
                        if (
                            (senderId != null && senderId.equals(id)) ||
                            (chatId != null && chatId.equals(id))
                        ) {
                            return true;
                        }
                    }
                }
            }
        } catch (Throwable ignored) {
        }
        return false;
    }

    /**
     * Unified background/locked/minimized push handler:
     * - Wakes screen + launches MainActivity + loops ringtone immediately for incoming calls!
     * - Decrypts E2EE messages & group mentions on-device so heads-up and notification shade
     *   ALWAYS display the actual message text!
     */
    public static void handleBackgroundPush(
        Context ctx,
        String title,
        String rawBody,
        String senderId,
        String groupId,
        String chatId,
        String type,
        String callMode,
        boolean isEncryptedHint,
        String msgId
    ) {
        if (ctx == null) return;

        if (
            "call_cancel".equals(type) ||
            (rawBody != null && (
                rawBody.contains("(__JATEXT_CALL_CANCEL__") ||
                rawBody.contains("(__JATEXT_CALL_CLAIM__") ||
                rawBody.contains("(__JATEXT_CALL_DM_ENDED__") ||
                rawBody.contains("(__JATEXT_CALL_GRP_ENDED__")
            ))
        ) {
            JaTextSoundManager.cancelIncomingCallWakeup(ctx, true);
            return;
        }

        if (MainActivity.isActivelyVisibleUnlocked(ctx)) {
            return;
        }

        if (isPushTargetSuppressed(ctx, senderId, groupId, chatId, title, type)) {
            return;
        }

        // Fast-path instant incoming call wakeup (0ms, zero network latency!)
        boolean isCallFastPath =
            "call".equals(type) ||
            "incoming_call".equals(type) ||
            (rawBody != null && (
                rawBody.contains("(__JATEXT_CALL_DM_RINGING__:") ||
                rawBody.contains("(__JATEXT_CALL_GRP_ACTIVE__") ||
                (rawBody.contains("__JATEXT_CALL__:") && rawBody.contains("\"state\":\"ringing\"")) ||
                (rawBody.contains("__JATEXT_CALL_GRP__:") && rawBody.contains("\"state\":\"active\""))
            ));

        if (isCallFastPath) {
            boolean isVideo =
                "video".equalsIgnoreCase(callMode) ||
                (rawBody != null && (
                    rawBody.contains("RINGING__:video)") ||
                    rawBody.contains("ACTIVE__:video)") ||
                    rawBody.contains("\"mode\":\"video\"")
                ));
            String callerTitle = cleanCallerTitle(title);
            JaTextSoundManager.triggerIncomingCallWakeup(ctx, senderId, groupId, callerTitle, isVideo);
            return;
        }

        String effectiveRaw = rawBody;
        if (isEncryptedHint && (effectiveRaw == null || !effectiveRaw.contains(E2EE_MARKER))) {
            effectiveRaw = "Encrypted message";
        }

        // Always inspect/decrypt the real wire body so E2EE call invites & E2EE texts are resolved!
        ResolvedPushContent resolved = resolvePushContent(ctx, effectiveRaw, senderId, groupId);
        if (resolved == null) {
            return;
        }

        if (resolved.isIncomingCall) {
            String callerTitle = cleanCallerTitle(title);
            JaTextSoundManager.triggerIncomingCallWakeup(
                ctx,
                senderId,
                groupId,
                callerTitle,
                resolved.isVideoCall
            );
            return;
        }

        if (!areNotificationsAllowed(ctx)) {
            return;
        }
        if (
            resolved.readableBody == null ||
            resolved.readableBody.isEmpty() ||
            resolved.readableBody.contains(E2EE_MARKER)
        ) {
            return;
        }

        String tag;
        if ("announcement".equals(type) || "__jatext_community__".equals(chatId)) {
            tag = "community:announcements";
        } else if (groupId != null && !groupId.isEmpty()) {
            tag = "group:" + groupId;
        } else if (senderId != null && !senderId.isEmpty()) {
            tag = "dm:" + senderId;
        } else {
            tag = msgId != null ? msgId : String.valueOf(System.currentTimeMillis());
        }

        Bundle launchExtras = new Bundle();
        if (msgId != null) launchExtras.putString("google.message_id", msgId);
        if (senderId != null) launchExtras.putString("senderId", senderId);
        if (groupId != null) launchExtras.putString("groupId", groupId);
        if (chatId != null) launchExtras.putString("chatId", chatId);
        if (type != null) launchExtras.putString("type", type);

        postSystemMessageNotification(
            ctx,
            tag,
            title != null && !title.isEmpty() ? title : "JaText",
            resolved.readableBody,
            launchExtras
        );
    }

    private static String cleanCallerTitle(String rawTitle) {
        if (rawTitle == null || rawTitle.trim().isEmpty()) return "Incoming JaText Call";
        String t = rawTitle.trim();
        if (t.startsWith("New message from ")) {
            return t.substring("New message from ".length()).trim();
        }
        return t;
    }

    public static final class ResolvedPushContent {
        public final String readableBody;
        public final boolean isIncomingCall;
        public final boolean isVideoCall;

        ResolvedPushContent(String readableBody, boolean isIncomingCall, boolean isVideoCall) {
            this.readableBody = readableBody;
            this.isIncomingCall = isIncomingCall;
            this.isVideoCall = isVideoCall;
        }
    }

    public static ResolvedPushContent resolvePushContent(
        Context ctx,
        String rawBody,
        String senderId,
        String groupId
    ) {
        if (rawBody != null) {
            String trimmed = rawBody.trim();
            if (trimmed.startsWith(SIGNAL_PREFIX)) {
                return null;
            }
            ResolvedPushContent directCall = inspectRawForActiveCall(trimmed);
            if (directCall != null) {
                return directCall;
            }
            if (!isPlaceholderOrEncryptedPreview(trimmed)) {
                String plain = cleanPlainPreview(trimmed);
                if (plain == null || plain.isEmpty()) return null;
                boolean callHint = plain.equals("Incoming video call") ||
                    plain.equals("Incoming voice call") ||
                    plain.equals("Incoming group video call") ||
                    plain.equals("Incoming group voice call");
                return new ResolvedPushContent(plain, callHint, plain.contains("video"));
            }
            // Try direct inline decrypt first when rawWire was included in FCM data
            if (trimmed.contains(E2EE_MARKER)) {
                String myUserId = prefs(ctx).getString("user_id", "");
                if (myUserId != null && !myUserId.isEmpty() && senderId != null && !senderId.isEmpty()) {
                    ResolvedPushContent inlineDecrypted = tryDecryptWireContent(
                        ctx,
                        trimmed,
                        senderId,
                        myUserId,
                        groupId,
                        null,
                        null
                    );
                    if (inlineDecrypted != null) {
                        if (!inlineDecrypted.isIncomingCall &&
                            (inlineDecrypted.readableBody == null || inlineDecrypted.readableBody.isEmpty())) {
                            return null;
                        }
                        return inlineDecrypted;
                    }
                }
            }
        }

        // Fetch full latest message(s) from Convex and decrypt on-device (like WhatsApp)
        try {
            ResolvedPushContent fromConvex = fetchAndDecryptLatestContentFromConvex(ctx, senderId, groupId);
            if (fromConvex != null) {
                if (!fromConvex.isIncomingCall &&
                    (fromConvex.readableBody == null || fromConvex.readableBody.isEmpty())) {
                    return null;
                }
                return fromConvex;
            }
        } catch (Throwable ignored) {}

        if (rawBody != null && !isPlaceholderOrEncryptedPreview(rawBody)) {
            String fallbackPlain = cleanPlainPreview(rawBody);
            if (fallbackPlain != null && !fallbackPlain.isEmpty()) {
                return new ResolvedPushContent(fallbackPlain, false, false);
            }
        }
        return new ResolvedPushContent("Sent you a message", false, false);
    }

    private static ResolvedPushContent inspectRawForActiveCall(String raw) {
        if (raw == null) return null;
        String s = raw.replace("\u200B", "").replace("\u200C", "").replace("\u2063", "").trim();
        while (s.startsWith("__JATEXT_BUBBLE__:") || s.startsWith("__JATEXT_FWD_V1__:")) {
            int nl = s.indexOf('\n');
            s = nl >= 0 ? s.substring(nl + 1).trim() : "";
        }
        long now = System.currentTimeMillis();
        if (s.startsWith("__JATEXT_CALL__:")) {
            try {
                JSONObject obj = new JSONObject(s.substring("__JATEXT_CALL__:".length()).trim());
                String state = obj.optString("state", "");
                String mode = obj.optString("mode", "voice");
                long ts = obj.optLong("ts", 0L);
                if ("ringing".equals(state) && (ts <= 0L || now - ts < 60_000L)) {
                    boolean video = "video".equals(mode);
                    return new ResolvedPushContent(
                        video ? "Incoming video call" : "Incoming voice call",
                        true,
                        video
                    );
                }
                if ("missed".equals(state)) {
                    return new ResolvedPushContent(
                        "video".equals(mode) ? "Missed video call" : "Missed voice call",
                        false,
                        false
                    );
                }
                return null;
            } catch (Throwable ignored) {}
        }
        if (s.startsWith("__JATEXT_CALL_GRP__:")) {
            try {
                JSONObject obj = new JSONObject(s.substring("__JATEXT_CALL_GRP__:".length()).trim());
                String state = obj.optString("state", "");
                String mode = obj.optString("mode", "voice");
                long ts = obj.optLong("ts", 0L);
                if ("active".equals(state) && (ts <= 0L || now - ts < 60_000L)) {
                    boolean video = "video".equals(mode);
                    return new ResolvedPushContent(
                        video ? "Incoming group video call" : "Incoming group voice call",
                        true,
                        video
                    );
                }
                return null;
            } catch (Throwable ignored) {}
        }
        return null;
    }

    /**
     * Resolves a push notification's body into human-readable plaintext by decrypting inline or
     * fetching the latest encrypted message from Convex and decrypting on-device.
     * Returns null if the message is a silent signal that should NOT trigger a notification.
     */
    public static String resolveNotificationBody(
        Context ctx,
        String rawBody,
        String senderId,
        String groupId
    ) {
        ResolvedPushContent content = resolvePushContent(ctx, rawBody, senderId, groupId);
        return content != null ? content.readableBody : null;
    }

    private static ResolvedPushContent fetchAndDecryptLatestContentFromConvex(
        Context ctx,
        String senderId,
        String groupId
    ) throws Exception {
        SharedPreferences sp = prefs(ctx);
        String convexUrl = sp.getString("convex_url", null);
        String jwt = sp.getString("auth_jwt", null);
        String myUserId = sp.getString("user_id", null);
        if (convexUrl == null || convexUrl.isEmpty() || myUserId == null || myUserId.isEmpty()) {
            return null;
        }
        if (jwt == null || jwt.isEmpty()) {
            jwt = tryRefreshConvexJwt(ctx, convexUrl);
        }
        if (jwt == null || jwt.isEmpty()) {
            return null;
        }

        String activeJwt = jwt;
        JSONObject queryRes = executeConvexQuery(convexUrl, activeJwt, senderId, groupId);
        if (queryRes == null || !"success".equals(queryRes.optString("status"))) {
            String refreshed = tryRefreshConvexJwt(ctx, convexUrl);
            if (refreshed != null && !refreshed.isEmpty()) {
                activeJwt = refreshed;
                queryRes = executeConvexQuery(convexUrl, activeJwt, senderId, groupId);
            }
        }
        if (queryRes == null || !"success".equals(queryRes.optString("status"))) {
            return null;
        }

        JSONArray rows = queryRes.optJSONArray("value");
        if (rows == null || rows.length() == 0) {
            return null;
        }

        // Collect ALL peer identity keys across devices or group epoch keys directly from Convex!
        List<String> extraPeerDhKeys = new ArrayList<>();
        if (senderId != null && !senderId.isEmpty() && groupId == null) {
            List<String> fetchedPeerDhs = fetchPeerDhKeysFromConvex(convexUrl, activeJwt, senderId);
            for (String dh : fetchedPeerDhs) {
                if (dh != null && !dh.isEmpty() && !extraPeerDhKeys.contains(dh)) {
                    extraPeerDhKeys.add(dh);
                }
            }
        }
        JSONObject extraGroupEpochs = new JSONObject();

        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) continue;
            String b = row.optString("body", "");
            String rowSender = row.optString("senderId", "");
            if (b.startsWith(SIGNAL_PREFIX)) {
                try {
                    JSONObject pkt = new JSONObject(b.substring(SIGNAL_PREFIX.length()));
                    String kind = pkt.optString("kind", "");
                    if ("e2ee_ik".equals(kind) && !myUserId.equals(rowSender)) {
                        String dh = pkt.optString("dh", "");
                        if (!dh.isEmpty() && !extraPeerDhKeys.contains(dh)) extraPeerDhKeys.add(dh);
                    } else if ("e2ee_gk".equals(kind) && groupId != null) {
                        int ep = pkt.optInt("ep", 0);
                        String secret = tryUnwrapGroupEpochSignal(ctx, pkt, rowSender, myUserId);
                        if (secret != null && !secret.isEmpty() && ep > 0) {
                            String epKey = groupId + ":" + ep;
                            JSONArray arr = extraGroupEpochs.optJSONArray(epKey);
                            if (arr == null) {
                                arr = new JSONArray();
                                extraGroupEpochs.put(epKey, arr);
                            }
                            arr.put(secret);
                        }
                    }
                } catch (Throwable ignored) {}
            }
        }

        // Walk backwards from newest message to find the latest incoming user-visible message
        for (int i = rows.length() - 1; i >= 0; i--) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null || (row.has("unsentAt") && !row.isNull("unsentAt"))) continue;
            String rowSender = row.optString("senderId", "");
            if (myUserId.equals(rowSender)) continue;
            if (senderId != null && !senderId.isEmpty() && groupId == null && !senderId.equals(rowSender)) {
                continue;
            }
            String body = row.optString("body", "");
            if (body.startsWith(SIGNAL_PREFIX) || body.startsWith("__JATEXT_REACT__:")) {
                continue;
            }
            if (body.contains(E2EE_MARKER)) {
                String rowReceiver = row.optString("receiverId", myUserId);
                ResolvedPushContent dec = tryDecryptWireContent(
                    ctx,
                    body,
                    rowSender,
                    rowReceiver,
                    groupId,
                    extraPeerDhKeys,
                    extraGroupEpochs
                );
                if (dec != null && (dec.isIncomingCall || (dec.readableBody != null && !dec.readableBody.isEmpty()))) {
                    return dec;
                }
            } else {
                ResolvedPushContent callCheck = inspectRawForActiveCall(body);
                if (callCheck != null) return callCheck;
                String clean = cleanPlainPreview(body);
                if (clean != null && !clean.isEmpty()) {
                    return new ResolvedPushContent(clean, false, false);
                }
            }
        }
        return null;
    }

    private static List<String> fetchPeerDhKeysFromConvex(String convexUrl, String jwt, String peerUserId) {
        List<String> keys = new ArrayList<>();
        try {
            String base = convexUrl.endsWith("/")
                ? convexUrl.substring(0, convexUrl.length() - 1)
                : convexUrl;
            if (!base.contains(".convex.cloud")) {
                JSONArray userIds = new JSONArray();
                userIds.put(peerUserId);
                JSONObject argsObj = new JSONObject();
                argsObj.put("userIds", userIds);
                JSONObject rpcReq = new JSONObject();
                rpcReq.put("op", "getUserE2EEIdentities");
                rpcReq.put("args", argsObj);
                JSONObject res = postJson(base + "/api/turso", rpcReq.toString(), jwt);
                if (res != null && res.optBoolean("ok", false)) {
                    JSONObject data = res.optJSONObject("data");
                    JSONArray arr = data != null ? data.optJSONArray("bundles") : null;
                    if (arr != null) {
                        for (int i = 0; i < arr.length(); i++) {
                            JSONObject item = arr.optJSONObject(i);
                            if (item != null) {
                                String dh = item.optString("dhPubB64", "");
                                if (!dh.isEmpty() && !keys.contains(dh)) keys.add(dh);
                            }
                        }
                    }
                }
                return keys;
            }
            JSONArray userIds = new JSONArray();
            userIds.put(peerUserId);
            JSONObject argsObj = new JSONObject();
            argsObj.put("userIds", userIds);
            JSONArray argsArr = new JSONArray();
            argsArr.put(argsObj);
            JSONObject reqBody = new JSONObject();
            reqBody.put("path", "e2ee:getUserIdentities");
            reqBody.put("format", "convex_encoded_json");
            reqBody.put("args", argsArr);
            JSONObject res = postJson(base + "/api/query", reqBody.toString(), jwt);
            if (res == null || !"success".equals(res.optString("status"))) return keys;
            JSONArray arr = res.optJSONArray("value");
            if (arr == null) return keys;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item != null) {
                    String dh = item.optString("dhPubB64", "");
                    if (!dh.isEmpty() && !keys.contains(dh)) {
                        keys.add(dh);
                    }
                }
            }
        } catch (Throwable ignored) {}
        return keys;
    }

    private static JSONObject executeConvexQuery(
        String convexUrl,
        String jwt,
        String senderId,
        String groupId
    ) {
        try {
            String base = convexUrl.endsWith("/")
                ? convexUrl.substring(0, convexUrl.length() - 1)
                : convexUrl;
            if (!base.contains(".convex.cloud")) {
                JSONObject argsObj = new JSONObject();
                String op;
                if (groupId != null && !groupId.isEmpty()) {
                    op = "listGroupMessages";
                    argsObj.put("groupId", groupId);
                } else if (senderId != null && !senderId.isEmpty()) {
                    op = "listMessages";
                    argsObj.put("otherId", senderId);
                } else {
                    return null;
                }
                JSONObject rpcReq = new JSONObject();
                rpcReq.put("op", op);
                rpcReq.put("args", argsObj);
                JSONObject res = postJson(base + "/api/turso", rpcReq.toString(), jwt);
                if (res == null || !res.optBoolean("ok", false)) return null;
                JSONObject data = res.optJSONObject("data");
                JSONArray msgs = data != null ? data.optJSONArray("messages") : null;
                JSONObject wrapped = new JSONObject();
                wrapped.put("status", "success");
                wrapped.put("value", msgs != null ? msgs : new JSONArray());
                return wrapped;
            }
            JSONObject argsObj = new JSONObject();
            String path;
            if (groupId != null && !groupId.isEmpty()) {
                path = "groups:listMessages";
                argsObj.put("groupId", groupId);
            } else if (senderId != null && !senderId.isEmpty()) {
                path = "messages:list";
                argsObj.put("otherId", senderId);
            } else {
                return null;
            }

            JSONArray argsArr = new JSONArray();
            argsArr.put(argsObj);

            JSONObject reqBody = new JSONObject();
            reqBody.put("path", path);
            reqBody.put("format", "convex_encoded_json");
            reqBody.put("args", argsArr);

            return postJson(base + "/api/query", reqBody.toString(), jwt);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static synchronized String tryRefreshConvexJwt(Context ctx, String convexUrl) {
        try {
            SharedPreferences sp = prefs(ctx);
            String refreshToken = sp.getString("auth_refresh", null);
            if (refreshToken == null || refreshToken.isEmpty()) return null;

            JSONObject arg = new JSONObject();
            arg.put("refreshToken", refreshToken);
            JSONArray argsArr = new JSONArray();
            argsArr.put(arg);

            JSONObject req = new JSONObject();
            req.put("path", "auth:signIn");
            req.put("format", "convex_encoded_json");
            req.put("args", argsArr);

            String base = convexUrl.endsWith("/")
                ? convexUrl.substring(0, convexUrl.length() - 1)
                : convexUrl;
            JSONObject res = postJson(base + "/api/action", req.toString(), null);
            if (res == null || !"success".equals(res.optString("status"))) return null;

            JSONObject val = res.optJSONObject("value");
            JSONObject tokens = val != null ? val.optJSONObject("tokens") : null;
            if (tokens == null) return null;

            String newJwt = tokens.optString("token", "");
            String newRefresh = tokens.optString("refreshToken", "");
            if (newJwt.isEmpty()) return null;

            SharedPreferences.Editor ed = sp.edit();
            ed.putString("auth_jwt", newJwt);
            String jwtKey = sp.getString("auth_jwt_key", null);
            if (jwtKey != null) ed.putString("auth_item:" + jwtKey, newJwt);

            if (!newRefresh.isEmpty()) {
                ed.putString("auth_refresh", newRefresh);
                String refKey = sp.getString("auth_refresh_key", null);
                if (refKey != null) ed.putString("auth_item:" + refKey, newRefresh);
            }
            ed.commit();
            return newJwt;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static JSONObject postJson(String endpoint, String bodyJson, String bearerToken) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(endpoint);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(7500);
            conn.setReadTimeout(7500);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Convex-Client", "npm-1.35.1");
            if (bearerToken != null && !bearerToken.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
            }
            byte[] out = bodyJson.getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(out);
            }
            int code = conn.getResponseCode();
            InputStream is = code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
            if (is == null) return null;
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) != -1) {
                baos.write(buf, 0, n);
            }
            return new JSONObject(new String(baos.toByteArray(), StandardCharsets.UTF_8));
        } catch (Throwable ignored) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String tryUnwrapGroupEpochSignal(
        Context ctx,
        JSONObject pkt,
        String senderId,
        String myUserId
    ) {
        try {
            JSONObject wraps = pkt.optJSONObject("wraps");
            JSONObject kwraps = pkt.optJSONObject("kwraps");
            JSONObject myUserWrap = wraps != null ? wraps.optJSONObject(myUserId) : null;
            if (myUserWrap == null && kwraps == null) return null;

            String gid = pkt.optString("gid", "");
            int ep = pkt.optInt("ep", 0);
            String epkB64 = pkt.optString("epk", "");
            byte[] epkBytes = b64UrlDecode(epkB64);
            PublicKey epkPub = importRawP256PublicKey(epkBytes);
            byte[] aad = ("JaText-GK-AAD-v1|" + gid + "|" + ep + "|" + myUserId)
                .getBytes(StandardCharsets.UTF_8);

            JSONArray identities = new JSONArray(prefs(ctx).getString("identities_json", "[]"));
            for (int i = 0; i < identities.length(); i++) {
                JSONObject idObj = identities.optJSONObject(i);
                if (idObj == null) continue;
                try {
                    String myKeyId = idObj.optString("keyId", "");
                    PrivateKey myPriv = importPkcs8PrivateKey(
                        b64UrlDecode(idObj.optString("dhPrivPkcs8B64", ""))
                    );
                    byte[] ss = ecdhSharedSecret(myPriv, epkPub);
                    byte[] kwk = hkdfSha256(
                        ss,
                        epkBytes,
                        "JaText-GK-Wrap-v1|" + gid + "|" + ep + "|" + senderId + "|" + myUserId + "|" + myKeyId
                    );

                    JSONObject kw = kwraps != null ? kwraps.optJSONObject(myKeyId) : null;
                    if (kw != null) {
                        try {
                            byte[] plain = aesGcmDecrypt(
                                kwk,
                                b64UrlDecode(kw.optString("iv", "")),
                                aad,
                                b64UrlDecode(kw.optString("ct", ""))
                            );
                            return Base64.encodeToString(
                                plain,
                                Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING
                            );
                        } catch (Throwable ignored) {}
                    }

                    if (myUserWrap != null) {
                        byte[] plain = aesGcmDecrypt(
                            kwk,
                            b64UrlDecode(myUserWrap.optString("iv", "")),
                            aad,
                            b64UrlDecode(myUserWrap.optString("ct", ""))
                        );
                        return Base64.encodeToString(
                            plain,
                            Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING
                        );
                    }
                } catch (Throwable ignored) {}
            }
        } catch (Throwable ignored) {}
        return null;
    }

    private static ResolvedPushContent tryDecryptWireContent(
        Context ctx,
        String wireBody,
        String senderId,
        String receiverId,
        String groupId,
        List<String> extraPeerDhKeys,
        JSONObject extraGroupEpochs
    ) {
        try {
            int idx = wireBody.indexOf(E2EE_MARKER);
            if (idx < 0) return null;
            String jsonPart = wireBody.substring(idx + E2EE_MARKER.length()).trim();
            int nl = jsonPart.indexOf('\n');
            if (nl >= 0) {
                jsonPart = jsonPart.substring(0, nl).trim();
            }
            JSONObject env = new JSONObject(jsonPart);
            if (env.optInt("v", 0) != 1) return null;

            String channel = env.optString("c", "");
            SharedPreferences sp = prefs(ctx);
            String myUserId = sp.getString("user_id", "");

            byte[] plainPayloadBytes = null;
            if ("dm".equals(channel)) {
                plainPayloadBytes = decryptDmEnvelopeBytes(
                    sp,
                    env,
                    myUserId,
                    senderId,
                    receiverId,
                    extraPeerDhKeys
                );
            } else if ("grp".equals(channel) && groupId != null) {
                plainPayloadBytes = decryptGroupEnvelopeBytes(
                    sp,
                    env,
                    groupId,
                    senderId,
                    extraGroupEpochs
                );
            }
            if (plainPayloadBytes == null) return null;

            JSONObject payload = new JSONObject(
                new String(plainPayloadBytes, StandardCharsets.UTF_8)
            );
            String rawPayloadBody = payload.optString("b", "");
            ResolvedPushContent callContent = inspectRawForActiveCall(rawPayloadBody);
            if (callContent != null) {
                return callContent;
            }
            String formatted = formatDecryptedPayload(payload);
            return new ResolvedPushContent(formatted, false, false);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static byte[] decryptDmEnvelopeBytes(
        SharedPreferences sp,
        JSONObject env,
        String myUserId,
        String senderId,
        String receiverId,
        List<String> extraPeerDhKeys
    ) throws Exception {
        String ctB64 = env.optString("ct", "");
        if (ctB64.isEmpty()) return null;
        byte[] ctBytes = b64UrlDecode(ctB64);
        byte[] ivBytes = b64UrlDecode(env.optString("iv", ""));
        String sk = env.optString("sk", "");
        String rk = env.optString("rk", "");
        String epkB64 = env.optString("epk", "");
        byte[] epkBytes = b64UrlDecode(epkB64);
        PublicKey epkPub = importRawP256PublicKey(epkBytes);
        byte[] aad = ("JaText-DM-AAD-v1|" + senderId + "|" + receiverId + "|" + sk + "|" + rk + "|" + epkB64)
            .getBytes(StandardCharsets.UTF_8);

        JSONArray identities = new JSONArray(sp.getString("identities_json", "[]"));
        if (identities.length() == 0) return null;

        // Path A: Multi-device ephemeral wrap (wra)
        JSONObject wra = env.optJSONObject("wra");
        if (wra != null) {
            for (int i = 0; i < identities.length(); i++) {
                JSONObject idObj = identities.optJSONObject(i);
                if (idObj == null) continue;
                String myKeyId = idObj.optString("keyId", "");
                String wraEntry = wra.optString(myKeyId, "");
                if (wraEntry.isEmpty()) continue;
                try {
                    byte[] rawM = b64UrlDecode(wraEntry);
                    if (rawM.length < 29) continue;
                    PrivateKey myPriv = importPkcs8PrivateKey(
                        b64UrlDecode(idObj.optString("dhPrivPkcs8B64", ""))
                    );
                    byte[] ssM = ecdhSharedSecret(myPriv, epkPub);
                    byte[] kwkM = hkdfSha256(
                        ssM,
                        epkBytes,
                        "JaText-DM-WrapM-v1|" + senderId + "|" + receiverId + "|" + myKeyId
                    );
                    byte[] cek = aesGcmDecrypt(
                        kwkM,
                        Arrays.copyOfRange(rawM, 0, 12),
                        null,
                        Arrays.copyOfRange(rawM, 12, rawM.length)
                    );
                    return aesGcmDecrypt(cek, ivBytes, aad, ctBytes);
                } catch (Throwable ignored) {}
            }
        }

        // Path B: Dual-ECDH wrap (wr / ws) across sdh + all known peer device keys
        boolean isFromMe = myUserId != null && myUserId.equals(senderId);
        String wrapB64 = isFromMe ? env.optString("ws", "") : env.optString("wr", "");
        if (wrapB64.isEmpty()) return null;
        byte[] wrapRaw = b64UrlDecode(wrapB64);
        if (wrapRaw.length < 29) return null;
        byte[] wrapIv = Arrays.copyOfRange(wrapRaw, 0, 12);
        byte[] wrapCt = Arrays.copyOfRange(wrapRaw, 12, wrapRaw.length);

        List<String> peerDhCandidates = new ArrayList<>();
        String sdh = env.optString("sdh", "");
        if (!isFromMe && !sdh.isEmpty()) {
            peerDhCandidates.add(sdh);
        }
        if (extraPeerDhKeys != null) {
            for (String k : extraPeerDhKeys) {
                if (!peerDhCandidates.contains(k)) peerDhCandidates.add(k);
            }
        }
        String peerId = isFromMe ? receiverId : senderId;
        JSONObject peersMap = new JSONObject(sp.getString("peers_json", "{}"));
        JSONArray peerArr = peersMap.optJSONArray(peerId);
        if (peerArr != null) {
            for (int p = 0; p < peerArr.length(); p++) {
                JSONObject pb = peerArr.optJSONObject(p);
                if (pb == null) continue;
                String dh = pb.optString("dhPubB64", "");
                if (!dh.isEmpty() && !peerDhCandidates.contains(dh)) {
                    peerDhCandidates.add(dh);
                }
            }
        }

        for (int i = 0; i < identities.length(); i++) {
            JSONObject idObj = identities.optJSONObject(i);
            if (idObj == null) continue;
            try {
                String myKeyId = idObj.optString("keyId", "");
                PrivateKey myPriv = importPkcs8PrivateKey(
                    b64UrlDecode(idObj.optString("dhPrivPkcs8B64", ""))
                );
                byte[] ssEphem = ecdhSharedSecret(myPriv, epkPub);
                String info = (isFromMe ? "JaText-DM-WrapS-v1|" : "JaText-DM-WrapR-v1|")
                    + senderId + "|" + receiverId + "|" + myKeyId;

                for (String peerDhB64 : peerDhCandidates) {
                    try {
                        PublicKey peerPub = importRawP256PublicKey(b64UrlDecode(peerDhB64));
                        byte[] ssStatic = ecdhSharedSecret(myPriv, peerPub);
                        byte[] ikm = new byte[ssEphem.length + ssStatic.length];
                        System.arraycopy(ssEphem, 0, ikm, 0, ssEphem.length);
                        System.arraycopy(ssStatic, 0, ikm, ssEphem.length, ssStatic.length);
                        byte[] kwk = hkdfSha256(ikm, epkBytes, info);
                        byte[] cek = aesGcmDecrypt(kwk, wrapIv, null, wrapCt);
                        return aesGcmDecrypt(cek, ivBytes, aad, ctBytes);
                    } catch (Throwable ignored) {}
                }
            } catch (Throwable ignored) {}
        }
        return null;
    }

    private static void collectEpochSecrets(Object raw, List<String> dest) {
        if (raw == null || raw == JSONObject.NULL) return;
        if (raw instanceof JSONArray) {
            JSONArray arr = (JSONArray) raw;
            for (int i = 0; i < arr.length(); i++) {
                String s = arr.optString(i, "");
                if (!s.isEmpty() && !dest.contains(s)) {
                    dest.add(s);
                }
            }
        } else if (raw instanceof String) {
            String s = (String) raw;
            if (!s.isEmpty() && !dest.contains(s)) {
                dest.add(s);
            }
        }
    }

    private static byte[] decryptGroupEnvelopeBytes(
        SharedPreferences sp,
        JSONObject env,
        String groupId,
        String senderId,
        JSONObject extraGroupEpochs
    ) throws Exception {
        String ctB64 = env.optString("ct", "");
        if (ctB64.isEmpty()) return null;
        int ep = env.optInt("ep", 0);
        String sk = env.optString("sk", "");
        String saltB64 = env.optString("s", "");
        String ivB64 = env.optString("iv", "");

        String epochKey = groupId + ":" + ep;
        List<String> candidateSecrets = new ArrayList<>();
        if (extraGroupEpochs != null) {
            collectEpochSecrets(extraGroupEpochs.opt(epochKey), candidateSecrets);
        }
        try {
            JSONObject groupsMap = new JSONObject(sp.getString("groups_json", "{}"));
            collectEpochSecrets(groupsMap.opt(epochKey), candidateSecrets);
        } catch (Throwable ignored) {}

        if (candidateSecrets.isEmpty()) return null;

        byte[] saltBytes = b64UrlDecode(saltB64);
        byte[] ivBytes = b64UrlDecode(ivB64);
        byte[] ctBytes = b64UrlDecode(ctB64);
        byte[] aad = ("JaText-Grp-AAD-v1|" + groupId + "|" + ep + "|" + senderId + "|" + sk + "|" + saltB64)
            .getBytes(StandardCharsets.UTF_8);
        String info = "JaText-Grp-Msg-v1|" + groupId + "|" + ep + "|" + senderId + "|" + sk;

        for (String secretB64 : candidateSecrets) {
            try {
                byte[] msgKey = hkdfSha256(b64UrlDecode(secretB64), saltBytes, info);
                return aesGcmDecrypt(msgKey, ivBytes, aad, ctBytes);
            } catch (Throwable ignored) {}
        }
        return null;
    }

    private static String formatDecryptedPayload(JSONObject payload) {
        String body = payload.optString("b", "");
        if (body.startsWith(SIGNAL_PREFIX) || body.startsWith("__JATEXT_REACT__:")) {
            return "";
        }
        String cleaned = cleanPlainPreview(body);
        if (cleaned != null && !cleaned.isEmpty()) {
            return cleaned;
        }
        JSONObject stk = payload.optJSONObject("stk");
        if (stk != null) {
            String name = stk.optString("n", "Sticker");
            return name.isEmpty() ? "Sent a sticker" : name;
        }
        JSONObject att = payload.optJSONObject("att");
        if (att != null) {
            String mime = att.optString("t", "").toLowerCase();
            String name = att.optString("n", "Attachment");
            if (mime.startsWith("audio/")) return "Voice note";
            if (mime.startsWith("image/")) return "Photo";
            if (mime.startsWith("video/")) return "Video";
            return name;
        }
        if (payload.optJSONObject("msgBlob") != null) {
            return "Sent a long message";
        }
        return "New message";
    }

    private static final Object DEDUPE_LOCK = new Object();
    private static String lastPostedTag = null;
    private static String lastPostedBody = null;
    private static long lastPostedAtMs = 0L;

    public static String cleanPlainPreview(String raw) {
        if (raw == null) return "";
        String s = raw
            .replace("\u200B", "")
            .replace("\u200C", "")
            .replace("\u2063", "")
            .trim();
        if (
            s.startsWith(SIGNAL_PREFIX) ||
            s.startsWith("__JATEXT_REACT__:") ||
            s.contains("(__JATEXT_CALL_CANCEL__") ||
            s.contains("(__JATEXT_CALL_CLAIM__")
        ) {
            return "";
        }
        while (s.startsWith("__JATEXT_BUBBLE__:") || s.startsWith("__JATEXT_FWD_V1__:")) {
            int nl = s.indexOf('\n');
            s = nl >= 0 ? s.substring(nl + 1).trim() : "";
        }
        if (s.startsWith("__JATEXT_CALL_GRP__:")) {
            if (s.contains("\"state\":\"ended\"")) return "";
            return s.contains("\"mode\":\"video\"")
                ? "Incoming group video call"
                : "Incoming group voice call";
        }
        if (s.startsWith("__JATEXT_CALL__:")) {
            if (s.contains("\"state\":\"ended\"") || s.contains("\"state\":\"declined\"")) return "";
            if (s.contains("\"state\":\"missed\"")) {
                return s.contains("\"mode\":\"video\"") ? "Missed video call" : "Missed voice call";
            }
            return s.contains("\"mode\":\"video\"")
                ? "Incoming video call"
                : "Incoming voice call";
        }
        if (s.startsWith("__JATEXT_VO_V1__:")) {
            return "Click to view.";
        }
        if (s.startsWith("__JATEXT_WALLPAPER__:") || s.startsWith("__JATEXT_WP__:")) {
            return "Updated the chat wallpaper";
        }
        if (s.contains(E2EE_MARKER) || s.startsWith("__JATEXT_") || s.contains("JATEXT_E2EE")) {
            return "";
        }
        s = s
            .replaceAll("\\|\\|[\\s\\S]+?\\|\\|", "▒▒▒")
            .replaceAll("\\*\\*\\*(.+?)\\*\\*\\*", "$1")
            .replaceAll("\\*\\*(.+?)\\*\\*", "$1")
            .replaceAll("(?<![A-Za-z0-9_])__([^_\\n]+?)__(?![A-Za-z0-9_])", "$1")
            .replaceAll("~~(.+?)~~", "$1")
            .replaceAll("`([^`]+)`", "$1")
            .trim();
        return s;
    }

    public static void postSystemMessageNotification(
        Context ctx,
        String tag,
        String title,
        String body,
        Bundle extras
    ) {
        postSystemMessageNotification(ctx, tag, title, body, extras, false);
    }

    public static void postSystemMessageNotification(
        Context ctx,
        String tag,
        String title,
        String body,
        Bundle extras,
        boolean allowWhenForeground
    ) {
        if (ctx == null || body == null || body.isEmpty()) return;
        if (body.contains(E2EE_MARKER) || body.startsWith("__JATEXT_") || body.contains("JATEXT_E2EE")) {
            return;
        }
        if (!allowWhenForeground && MainActivity.isActivelyVisibleUnlocked(ctx)) return;

        String resolvedTag = (tag != null && !tag.isEmpty())
            ? tag
            : String.valueOf(System.currentTimeMillis());

        long now = System.currentTimeMillis();
        boolean silentInPlaceUpdate = false;
        synchronized (DEDUPE_LOCK) {
            if (
                resolvedTag.equals(lastPostedTag) &&
                body.equals(lastPostedBody) &&
                now - lastPostedAtMs < 15_000L
            ) {
                // Exact same decrypted message was already posted seconds ago; skip duplicate chime!
                return;
            }
            if (resolvedTag.equals(lastPostedTag) && now - lastPostedAtMs < 4_500L) {
                silentInPlaceUpdate = true;
            }
            lastPostedTag = resolvedTag;
            lastPostedBody = body;
            lastPostedAtMs = now;
        }

        NotificationManager nm =
            (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        String channelId = JaTextSoundManager.ensureActiveMessageChannel(ctx);

        Intent launchIntent = new Intent(ctx, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (extras != null) {
            launchIntent.putExtras(extras);
        }

        int reqCode = (int) ((resolvedTag.hashCode()) & 0x7FFFFFFF);
        PendingIntent pi = PendingIntent.getActivity(
            ctx,
            reqCode,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        int iconRes = ctx.getApplicationInfo().icon;
        if (iconRes == 0) {
            iconRes = android.R.drawable.sym_action_chat;
        }

        String safeTitle = (title != null && !title.isEmpty()) ? title : "JaText";
        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, channelId)
            .setSmallIcon(iconRes)
            .setContentTitle(safeTitle)
            .setContentText(body)
            .setTicker(safeTitle + ": " + body)
            .setStyle(new NotificationCompat.BigTextStyle().setBigContentTitle(safeTitle).bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(silentInPlaceUpdate)
            .setAutoCancel(true)
            .setContentIntent(pi);

        nm.notify(resolvedTag, 1001, builder.build());
        if (!silentInPlaceUpdate) {
            JaTextSoundManager.playCustomNotificationSoundIfNeeded(ctx);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Low-level Java Crypto Primitives matching WebCrypto                */
    /* ------------------------------------------------------------------ */

    private static byte[] b64UrlDecode(String input) {
        if (input == null) return new byte[0];
        String clean = input
            .trim()
            .replace('+', '-')
            .replace('/', '_')
            .replace("=", "")
            .replaceAll("\\s+", "");
        if (clean.isEmpty()) return new byte[0];
        return Base64.decode(clean, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static PublicKey importRawP256PublicKey(byte[] raw65) throws Exception {
        if (raw65.length != 65 || raw65[0] != 0x04) {
            throw new IllegalArgumentException("Invalid uncompressed P-256 public key");
        }
        byte[] spki = new byte[P256_SPKI_PREFIX.length + raw65.length];
        System.arraycopy(P256_SPKI_PREFIX, 0, spki, 0, P256_SPKI_PREFIX.length);
        System.arraycopy(raw65, 0, spki, P256_SPKI_PREFIX.length, raw65.length);
        return KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(spki));
    }

    private static PrivateKey importPkcs8PrivateKey(byte[] pkcs8) throws Exception {
        if (pkcs8 == null || pkcs8.length == 0) {
            throw new IllegalArgumentException("Empty EC private key");
        }
        KeyFactory kf = KeyFactory.getInstance("EC");
        try {
            return kf.generatePrivate(new PKCS8EncodedKeySpec(pkcs8));
        } catch (Throwable primaryErr) {
            for (int i = 0; i <= pkcs8.length - 34; i++) {
                if (pkcs8[i] == 0x04 && pkcs8[i + 1] == 0x20) {
                    byte[] scalar32 = Arrays.copyOfRange(pkcs8, i + 2, i + 34);
                    BigInteger bi = new BigInteger(1, scalar32);
                    if (bi.compareTo(BigInteger.ZERO) > 0) {
                        AlgorithmParameters params = AlgorithmParameters.getInstance("EC");
                        params.init(new ECGenParameterSpec("secp256r1"));
                        ECParameterSpec ecSpec = params.getParameterSpec(ECParameterSpec.class);
                        return kf.generatePrivate(new ECPrivateKeySpec(bi, ecSpec));
                    }
                }
            }
            if (primaryErr instanceof Exception) throw (Exception) primaryErr;
            throw new RuntimeException(primaryErr);
        }
    }

    private static byte[] ecdhSharedSecret(PrivateKey priv, PublicKey pub) throws Exception {
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(priv);
        ka.doPhase(pub, true);
        byte[] raw = ka.generateSecret();
        if (raw.length == 32) return raw;
        if (raw.length < 32) {
            byte[] padded = new byte[32];
            System.arraycopy(raw, 0, padded, 32 - raw.length, raw.length);
            return padded;
        }
        return Arrays.copyOfRange(raw, raw.length - 32, raw.length);
    }

    private static byte[] hkdfSha256(byte[] ikm, byte[] salt, String info) throws Exception {
        byte[] realSalt = (salt == null || salt.length == 0) ? new byte[32] : salt;
        Mac extractMac = Mac.getInstance("HmacSHA256");
        extractMac.init(new SecretKeySpec(realSalt, "HmacSHA256"));
        byte[] prk = extractMac.doFinal(ikm);

        Mac expandMac = Mac.getInstance("HmacSHA256");
        expandMac.init(new SecretKeySpec(prk, "HmacSHA256"));
        byte[] infoBytes = info.getBytes(StandardCharsets.UTF_8);
        expandMac.update(infoBytes);
        expandMac.update((byte) 0x01);
        return expandMac.doFinal();
    }

    private static byte[] aesGcmDecrypt(
        byte[] key32,
        byte[] iv12,
        byte[] aad,
        byte[] ctWithTag
    ) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        SecretKeySpec keySpec = new SecretKeySpec(key32, "AES");
        GCMParameterSpec gcmSpec = new GCMParameterSpec(128, iv12);
        cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmSpec);
        if (aad != null && aad.length > 0) {
            cipher.updateAAD(aad);
        }
        return cipher.doFinal(ctWithTag);
    }
}
