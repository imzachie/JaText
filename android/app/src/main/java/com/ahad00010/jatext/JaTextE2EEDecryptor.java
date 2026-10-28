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
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
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
        if (key.contains("__convexAuthJWT")) {
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
        if (key.contains("__convexAuthJWT")) {
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
        String groupsJson
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
        ed.apply();
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
        if (rawBody != null) {
            String trimmed = rawBody.trim();
            if (trimmed.startsWith(SIGNAL_PREFIX)) {
                return null;
            }
            if (!trimmed.contains(E2EE_MARKER)) {
                return cleanPlainPreview(trimmed);
            }
            // Try direct inline decrypt first in case body wasn't truncated
            String myUserId = prefs(ctx).getString("user_id", "");
            if (myUserId != null && !myUserId.isEmpty() && senderId != null && !senderId.isEmpty()) {
                String inlineDecrypted = tryDecryptWireBody(
                    ctx,
                    trimmed,
                    senderId,
                    myUserId,
                    groupId,
                    null,
                    null
                );
                if (inlineDecrypted != null) {
                    return inlineDecrypted.isEmpty() ? null : inlineDecrypted;
                }
            }
        }

        // Fetch full latest message(s) from Convex and decrypt on-device (like WhatsApp)
        try {
            String fromConvex = fetchAndDecryptLatestFromConvex(ctx, senderId, groupId);
            if (fromConvex != null) {
                return fromConvex.isEmpty() ? null : fromConvex;
            }
        } catch (Throwable ignored) {}

        return "New message";
    }

    private static String fetchAndDecryptLatestFromConvex(
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

        JSONObject queryRes = executeConvexQuery(convexUrl, jwt, senderId, groupId);
        if (queryRes == null || !"success".equals(queryRes.optString("status"))) {
            String refreshed = tryRefreshConvexJwt(ctx, convexUrl);
            if (refreshed != null && !refreshed.isEmpty()) {
                queryRes = executeConvexQuery(convexUrl, refreshed, senderId, groupId);
            }
        }
        if (queryRes == null || !"success".equals(queryRes.optString("status"))) {
            return null;
        }

        JSONArray rows = queryRes.optJSONArray("value");
        if (rows == null || rows.length() == 0) {
            return null;
        }

        // Collect any peer identity keys or group epoch keys directly from the conversation rows!
        List<String> extraPeerDhKeys = new ArrayList<>();
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
                        if (!dh.isEmpty()) extraPeerDhKeys.add(dh);
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
            if (row == null || row.has("unsentAt") && !row.isNull("unsentAt")) continue;
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
                String dec = tryDecryptWireBody(
                    ctx,
                    body,
                    rowSender,
                    rowReceiver,
                    groupId,
                    extraPeerDhKeys,
                    extraGroupEpochs
                );
                if (dec != null && !dec.isEmpty()) {
                    return dec;
                }
            } else {
                String clean = cleanPlainPreview(body);
                if (clean != null && !clean.isEmpty()) {
                    return clean;
                }
            }
        }
        return null;
    }

    private static JSONObject executeConvexQuery(
        String convexUrl,
        String jwt,
        String senderId,
        String groupId
    ) {
        try {
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

            String base = convexUrl.endsWith("/")
                ? convexUrl.substring(0, convexUrl.length() - 1)
                : convexUrl;
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
            conn.setConnectTimeout(3500);
            conn.setReadTimeout(3500);
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

    private static String tryDecryptWireBody(
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
            return formatDecryptedPayload(payload);
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

    public static String cleanPlainPreview(String raw) {
        if (raw == null) return "";
        String s = raw
            .replace("\u200B", "")
            .replace("\u200C", "")
            .replace("\u2063", "")
            .trim();
        if (s.startsWith(SIGNAL_PREFIX) || s.startsWith("__JATEXT_REACT__:")) {
            return "";
        }
        if (s.startsWith("__JATEXT_BUBBLE__:")) {
            int nl = s.indexOf('\n');
            s = nl >= 0 ? s.substring(nl + 1).trim() : "";
        }
        if (s.startsWith("__JATEXT_CALL_GRP__:")) {
            return s.contains("\"mode\":\"video\"")
                ? "Incoming group video call"
                : "Incoming group voice call";
        }
        if (s.startsWith("__JATEXT_CALL__:")) {
            return s.contains("\"mode\":\"video\"")
                ? "Incoming video call"
                : "Incoming voice call";
        }
        if (s.startsWith("__JATEXT_WALLPAPER__:") || s.startsWith("__JATEXT_WP__:")) {
            return "Updated the chat wallpaper";
        }
        return s;
    }

    public static void postSystemMessageNotification(
        Context ctx,
        String tag,
        String title,
        String body,
        Bundle extras
    ) {
        if (ctx == null || body == null || body.isEmpty()) return;
        if (MainActivity.isAppInForeground()) return;

        NotificationManager nm =
            (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "messages",
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("New JaText messages and call alerts");
            channel.enableVibration(true);
            nm.createNotificationChannel(channel);
        }

        Intent launchIntent = new Intent(ctx, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (extras != null) {
            launchIntent.putExtras(extras);
        }

        int reqCode = (int) ((tag != null ? tag.hashCode() : System.currentTimeMillis()) & 0x7FFFFFFF);
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
        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, "messages")
            .setSmallIcon(iconRes)
            .setContentTitle(safeTitle)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pi);

        String resolvedTag = (tag != null && !tag.isEmpty())
            ? tag
            : String.valueOf(System.currentTimeMillis());
        nm.notify(resolvedTag, 1001, builder.build());
    }

    /* ------------------------------------------------------------------ */
    /* Low-level Java Crypto Primitives matching WebCrypto                */
    /* ------------------------------------------------------------------ */

    private static byte[] b64UrlDecode(String input) {
        return Base64.decode(input, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
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
        return KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(pkcs8));
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
