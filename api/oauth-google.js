import crypto from "node:crypto";
import { getTursoConfig, upsertGoogleOAuthAccount } from "../server/tursoBackend.js";

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
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
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

function redirectWithError(res, platform, origin, message) {
  const encoded = encodeURIComponent(message);
  if (platform === "android") {
    res.writeHead(302, {
      Location: `com.ahad00010.jatext://auth?authError=${encoded}`,
    });
    return res.end();
  }
  res.writeHead(302, {
    Location: `${origin}/chats?authError=${encoded}`,
  });
  return res.end();
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const origin = resolveCallbackOrigin(req);
  const redirectUri = `${origin}/api/oauth-google`;
  const { clientId, clientSecret, configured } = getGoogleCredentials();

  const action = String(req.query?.action || "");
  if (action === "start" || (!req.query?.code && !req.query?.error)) {
    const platform = req.query?.platform === "android" ? "android" : "web";
    if (!configured) {
      return redirectWithError(
        res,
        platform,
        origin,
        "Google Sign-In is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel Environment Variables.",
      );
    }
    const state = signState({
      platform,
      origin,
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

  if (req.query?.error) {
    return redirectWithError(
      res,
      platform,
      targetOrigin,
      `Google sign-in was cancelled (${String(req.query.error)}).`,
    );
  }

  if (!parsedState) {
    return redirectWithError(
      res,
      platform,
      targetOrigin,
      "Google sign-in session expired. Please try again.",
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
      );
    }

    const { token } = await upsertGoogleOAuthAccount({
      googleSub: String(profile.sub),
      email: String(profile.email),
      name: profile.name ? String(profile.name) : undefined,
      picture: profile.picture ? String(profile.picture) : undefined,
    });

    if (platform === "android") {
      res.writeHead(302, {
        Location: `com.ahad00010.jatext://auth?tursoToken=${encodeURIComponent(token)}`,
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
    );
  }
}
