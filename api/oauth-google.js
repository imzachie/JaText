import crypto from "node:crypto";
import {
  consumeMobileOAuthHandoff,
  getTursoConfig,
  saveMobileOAuthHandoff,
  upsertGoogleOAuthAccount,
} from "../server/tursoBackend.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getGoogleCredentials() {
  const clientId = (
    process.env.GOOGLE_CLIENT_ID ||
    process.env.AUTH_GOOGLE_ID ||
    ""
  ).trim();
  const clientSecret = (
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.AUTH_GOOGLE_SECRET ||
    ""
  ).trim();
  const extraAndroidClientIds = (process.env.GOOGLE_ANDROID_CLIENT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const androidClientConfigured = Boolean(
    extraAndroidClientIds.length > 0 || process.env.GOOGLE_ANDROID_SHA1_READY === "1",
  );
  return {
    clientId,
    clientSecret,
    extraAndroidClientIds,
    androidClientConfigured,
    configured: Boolean(clientId && clientSecret),
  };
}

function getStateSecret() {
  const cfg = getTursoConfig();
  return (
    process.env.AUTH_SECRET ||
    process.env.JWT_SECRET ||
    cfg.authToken ||
    "jatext-oauth-fallback"
  );
}

function resolveCallbackOrigin(req) {
  const explicit = (process.env.PUBLIC_APP_ORIGIN || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "jatext.vercel.app")
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

function signState(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getStateSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

function verifyState(rawState) {
  if (!rawState || typeof rawState !== "string" || !rawState.includes(".")) return null;
  const [encoded, sig] = rawState.split(".");
  const expected = crypto
    .createHmac("sha256", getStateSecret())
    .update(encoded)
    .digest("base64url");
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!parsed?.ts || Date.now() - Number(parsed.ts) > 15 * 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function redirectWithError(res, platform, origin, message, mobileSession = "") {
  if (mobileSession) {
    await saveMobileOAuthHandoff({
      sessionId: mobileSession,
      status: "error",
      error: message,
    }).catch(() => undefined);
  }
  const encoded = encodeURIComponent(message);
  if (platform === "android") {
    const sessSuffix = mobileSession ? `&mobileSession=${encodeURIComponent(mobileSession)}` : "";
    res.writeHead(302, {
      Location: `com.ahad00010.jatext://auth?authError=${encoded}${sessSuffix}`,
    });
    return res.end();
  }
  res.writeHead(302, {
    Location: `${origin}/chats?authError=${encoded}`,
  });
  return res.end();
}

function isAllowedGoogleAudience(aud, azp, clientId, extraAndroidClientIds) {
  const allowed = new Set([clientId, ...extraAndroidClientIds]);
  if (allowed.has(aud)) return true;
  const projectPrefix = clientId.includes("-") ? `${clientId.split("-")[0]}-` : "";
  if (
    projectPrefix &&
    aud.startsWith(projectPrefix) &&
    aud.endsWith(".apps.googleusercontent.com")
  ) {
    return true;
  }
  if (azp && allowed.has(azp)) return true;
  return false;
}

async function handleNativeGoogleTokenSignIn(req, res, credentials) {
  const { clientId, extraAndroidClientIds } = credentials;
  if (!clientId) {
    return res.status(500).json({
      ok: false,
      error: "Google Sign-In is not configured on the server (missing GOOGLE_CLIENT_ID).",
    });
  }

  let body = {};
  try {
    body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body && typeof req.body === "object"
          ? req.body
          : {};
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON request body." });
  }

  const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";

  if (!idToken && !accessToken) {
    return res.status(400).json({
      ok: false,
      error: "Missing Google idToken or accessToken.",
    });
  }

  try {
    if (idToken) {
      const verifyResp = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );
      const claims = await verifyResp.json();
      if (!verifyResp.ok || !claims?.sub || !claims?.email) {
        return res.status(401).json({
          ok: false,
          error: claims?.error_description || "Invalid or expired Google ID token.",
        });
      }

      const iss = String(claims.iss || "");
      if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") {
        return res.status(401).json({ ok: false, error: "Invalid Google token issuer." });
      }

      const aud = String(claims.aud || "");
      const azp = String(claims.azp || "");
      if (!isAllowedGoogleAudience(aud, azp, clientId, extraAndroidClientIds)) {
        return res.status(401).json({
          ok: false,
          error: "Google ID token audience mismatch.",
        });
      }

      if (String(claims.email_verified) === "false") {
        return res.status(401).json({
          ok: false,
          error: "Your Google email address is not verified.",
        });
      }

      const { token, me } = await upsertGoogleOAuthAccount({
        googleSub: String(claims.sub),
        email: String(claims.email),
        name: claims.name ? String(claims.name) : undefined,
        picture: claims.picture ? String(claims.picture) : undefined,
      });

      return res.status(200).json({ ok: true, token, me });
    }

    const userResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await userResp.json();
    if (!userResp.ok || !profile?.sub || !profile?.email) {
      return res.status(401).json({
        ok: false,
        error: "Could not verify Google account profile.",
      });
    }

    const { token, me } = await upsertGoogleOAuthAccount({
      googleSub: String(profile.sub),
      email: String(profile.email),
      name: profile.name ? String(profile.name) : undefined,
      picture: profile.picture ? String(profile.picture) : undefined,
    });
    return res.status(200).json({ ok: true, token, me });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Google Sign-In failed.",
    });
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  res.setHeader("Cache-Control", "no-store");

  const credentials = getGoogleCredentials();
  const { clientId, clientSecret, androidClientConfigured, configured } = credentials;
  const action = String(req.query?.action || "");

  if (req.method === "GET" && action === "config") {
    return res.status(200).json({
      ok: true,
      configured: Boolean(clientId),
      clientId,
      androidClientConfigured,
    });
  }

  if (req.method === "GET" && action === "poll") {
    const mobileSession = String(req.query?.mobileSession || "").trim();
    if (!mobileSession) {
      return res.status(400).json({ ok: false, status: "missing", error: "Missing mobileSession." });
    }
    try {
      const result = await consumeMobileOAuthHandoff(mobileSession);
      return res.status(200).json({
        ok: result.status !== "error",
        ...result,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        status: "error",
        error: err instanceof Error ? err.message : "Failed to poll mobile OAuth status.",
      });
    }
  }

  if (req.method === "POST") {
    return handleNativeGoogleTokenSignIn(req, res, credentials);
  }

  const origin = resolveCallbackOrigin(req);
  const redirectUri = `${origin}/api/oauth-google`;

  if (action === "start" || (!req.query?.code && !req.query?.error)) {
    const platform = req.query?.platform === "android" ? "android" : "web";
    const mobileSession =
      typeof req.query?.mobileSession === "string" &&
      /^[a-f0-9]{24,96}$/i.test(req.query.mobileSession.trim())
        ? req.query.mobileSession.trim()
        : "";
    if (!configured) {
      return redirectWithError(
        res,
        platform,
        origin,
        "Google Sign-In is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel Environment Variables.",
        mobileSession,
      );
    }
    if (mobileSession) {
      await saveMobileOAuthHandoff({
        sessionId: mobileSession,
        status: "pending",
      }).catch(() => undefined);
    }
    const state = signState({
      platform,
      origin,
      mobileSession,
      ts: Date.now(),
      nonce: crypto.randomBytes(8).toString("hex"),
    });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      prompt: "select_account",
      state,
    });
    res.writeHead(302, {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
    return res.end();
  }

  const parsedState = verifyState(String(req.query?.state || ""));
  const platform = parsedState?.platform === "android" ? "android" : "web";
  const targetOrigin = parsedState?.origin || origin;
  const mobileSession = String(parsedState?.mobileSession || "");

  if (req.query?.error) {
    return redirectWithError(
      res,
      platform,
      targetOrigin,
      `Google sign-in was cancelled (${String(req.query.error)}).`,
      mobileSession,
    );
  }

  if (!parsedState) {
    return redirectWithError(
      res,
      platform,
      targetOrigin,
      "Google sign-in session expired. Please try again.",
      mobileSession,
    );
  }

  try {
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(req.query.code || ""),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok || !tokenJson?.access_token) {
      return redirectWithError(
        res,
        platform,
        targetOrigin,
        tokenJson?.error_description || "Failed to exchange Google OAuth code.",
        mobileSession,
      );
    }

    const userResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const profile = await userResp.json();
    if (!userResp.ok || !profile?.sub || !profile?.email) {
      return redirectWithError(
        res,
        platform,
        targetOrigin,
        "Could not read your Google profile email.",
        mobileSession,
      );
    }

    const { token, me } = await upsertGoogleOAuthAccount({
      googleSub: String(profile.sub),
      email: String(profile.email),
      name: profile.name ? String(profile.name) : undefined,
      picture: profile.picture ? String(profile.picture) : undefined,
    });

    if (mobileSession) {
      await saveMobileOAuthHandoff({
        sessionId: mobileSession,
        status: "complete",
        token,
        me,
      }).catch(() => undefined);
    }

    if (platform === "android") {
      const sessSuffix = mobileSession ? `&mobileSession=${encodeURIComponent(mobileSession)}` : "";
      res.writeHead(302, {
        Location: `com.ahad00010.jatext://auth?tursoToken=${encodeURIComponent(token)}${sessSuffix}`,
      });
      return res.end();
    }

    res.writeHead(302, {
      Location: `${targetOrigin}/chats?tursoToken=${encodeURIComponent(token)}`,
    });
    return res.end();
  } catch (err) {
    return redirectWithError(
      res,
      platform,
      targetOrigin,
      err instanceof Error ? err.message : "Google Sign-In failed.",
      mobileSession,
    );
  }
}
