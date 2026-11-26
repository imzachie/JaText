/**
 * Forwards every /api/* call to wherever the Node backend actually runs.
 *
 * Cloudflare Pages only serves files, and its _redirects proxying refuses
 * external hosts, so the API has to be forwarded from a Pages Function
 * instead. This keeps one public origin (https://jatextapp.pages.dev) for the web app
 * and the Android APK, which means neither of them has to know the backend
 * lives somewhere else: no CORS, and the sign-in token is first party.
 *
 * The body is streamed rather than buffered, so a 768 KB upload chunk or a
 * video Range response costs the same as the bytes it carries.
 */

/**
 * Where the API lives. The default is the Supabase Edge Function this repo
 * publishes (see .github/workflows/deploy-edge-function.yml), so a Pages
 * project needs no configuration at all to serve the app. Override
 * JATEXT_API_ORIGIN in Pages → Settings → Environment variables only to point
 * the same frontend at another backend, e.g. during a migration.
 */
const DEFAULT_API_ORIGIN =
  "https://nroosqwxyhkavdokxahn.supabase.co/functions/v1/jatext-api";

function apiOrigin(env) {
  const raw = (env.JATEXT_API_ORIGIN || DEFAULT_API_ORIGIN).trim();
  return raw.replace(/\/+$/, "");
}

/**
 * Hop-by-hop headers must not be replayed upstream, and Cloudflare's own
 * client hints confuse some hosts. Content-Length is dropped because the body
 * is streamed, which is the whole point of this file.
 */
function forwardHeaders(request) {
  const out = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const name = key.toLowerCase();
    if (
      name === "host" ||
      name === "content-length" ||
      name === "connection" ||
      name === "keep-alive" ||
      name === "transfer-encoding" ||
      name === "upgrade" ||
      name === "proxy-authorization" ||
      name === "te" ||
      name === "trailer"
    ) {
      continue;
    }
    out.set(key, value);
  }
  // The backend uses this to decide where to send people back to after Google
  // sign-in, so it has to see the origin the browser actually used.
  out.set("X-Forwarded-Host", new URL(request.url).host);
  out.set("X-Forwarded-Proto", "https");
  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  const incoming = new URL(request.url);
  const upstream = new URL(
    incoming.pathname + incoming.search,
    apiOrigin(env),
  );

  const isBodyless = request.method === "GET" || request.method === "HEAD";

  try {
    const upstreamResponse = await fetch(
      new Request(upstream.toString(), {
        method: request.method,
        headers: forwardHeaders(request),
        body: isBodyless ? undefined : request.body,
        duplex: isBodyless ? undefined : "half",
        redirect: "manual",
      }),
    );

    // 3xx, Range responses and media are handed straight back. Rewriting the
    // Location header keeps a redirect aimed at the backend pointed at the
    // public origin instead, so the browser never sees the other hostname.
    const headers = new Headers(upstreamResponse.headers);
    const location = headers.get("Location");
    if (location) {
      const backendOrigin = apiOrigin(env);
      if (location.startsWith(backendOrigin)) {
        headers.set(
          "Location",
          incoming.origin + location.slice(backendOrigin.length),
        );
      }
    }
    headers.delete("content-encoding");
    headers.delete("content-length");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Could not reach the JaText backend: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: `GET, POST, PUT, DELETE, OPTIONS`,
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-JaText-Filename, X-JaText-Mime, Range",
    },
  });
}
