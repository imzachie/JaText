const TIMEOUT_MS = 5_000;

async function fetchJsonOrText(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return {
      httpStatus: res.status,
      ok: res.ok,
      json,
      text: json ? undefined : text.slice(0, 500),
    };
  } catch (err) {
    return {
      httpStatus: 0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const rawConvexUrl = (
    process.env.VITE_CONVEX_URL || "https://kindred-wombat-306.convex.cloud"
  ).trim();
  const convexUrl = rawConvexUrl.replace(/\/+$/, "");
  let convexHost = "unknown";
  try {
    convexHost = new URL(convexUrl).host;
  } catch {
    convexHost = "invalid-url";
  }
  const siteUrl = convexUrl.replace(/\.convex\.cloud$/i, ".convex.site");

  const commonHeaders = {
    "Content-Type": "application/json",
    "Convex-Client": "npm-1.34.1",
  };

  const [queryProbe, oidcProbe, googleProbe] = await Promise.all([
    fetchJsonOrText(`${convexUrl}/api/query`, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        path: "users:checkUsername",
        format: "convex_encoded_json",
        args: [{ username: "jatext_health_probe" }],
      }),
    }),
    fetchJsonOrText(`${siteUrl}/.well-known/openid-configuration`, {
      method: "GET",
    }),
    fetchJsonOrText(`${convexUrl}/api/action`, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        path: "auth:signIn",
        format: "convex_encoded_json",
        args: [{ provider: "google", params: {} }],
      }),
    }),
  ]);

  const summarizeUdf = (probe, sanitizeSuccessValue = false) => {
    if (!probe.json) {
      return {
        httpStatus: probe.httpStatus,
        ok: probe.ok,
        text: probe.text,
        error: probe.error,
      };
    }
    if (probe.json.status === "success") {
      return {
        httpStatus: probe.httpStatus,
        udfStatus: "success",
        ...(sanitizeSuccessValue
          ? {
              hasRedirect: Boolean(probe.json.value?.redirect),
              redirectHost: (() => {
                try {
                  return probe.json.value?.redirect
                    ? new URL(probe.json.value.redirect).host
                    : null;
                } catch {
                  return "invalid";
                }
              })(),
            }
          : { value: probe.json.value }),
      };
    }
    return {
      httpStatus: probe.httpStatus,
      udfStatus: probe.json.status ?? "http_error",
      code: probe.json.code,
      message: probe.json.errorMessage ?? probe.json.message,
    };
  };

  const querySummary = summarizeUdf(queryProbe, false);
  const googleSummary = summarizeUdf(googleProbe, true);
  const oidcSummary = {
    httpStatus: oidcProbe.httpStatus,
    ok: oidcProbe.ok,
    issuer: oidcProbe.json?.issuer ?? null,
    code: oidcProbe.json?.code ?? null,
    message: oidcProbe.json?.message ?? oidcProbe.text ?? oidcProbe.error ?? null,
  };

  const healthy =
    querySummary.udfStatus === "success" &&
    oidcSummary.ok &&
    googleSummary.udfStatus === "success" &&
    Boolean(googleSummary.hasRedirect);

  res.status(200).json({
    ok: healthy,
    hasDeployKeyInEnv: Boolean(process.env.CONVEX_DEPLOY_KEY),
    convexHost,
    query: querySummary,
    oidc: oidcSummary,
    googleSignIn: googleSummary,
  });
}
