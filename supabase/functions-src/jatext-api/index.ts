/**
 * The JaText backend, running as a Supabase Edge Function.
 *
 * This file is only a host. The API itself is the same `api/*.js` handlers the
 * self hosted server and Vercel used, so there is one implementation to keep
 * correct rather than three. `scripts/build-edge-function.mjs` bundles this
 * together with those handlers into a single deployable file, because a function
 * cannot reach outside its own folder at runtime.
 *
 * Supabase calls every path of a function with the same handler, so routing by
 * pathname happens here. Cloudflare Pages forwards `/api/*` to this URL as is,
 * which is why the paths still begin with `/api/`.
 */

// The upload handler was written for Node and calls Buffer.isBuffer() before it
// looks at the bytes themselves. Deno exposes Buffer through node:buffer but not
// always as a global, and a missing global turns a valid upload into a
// ReferenceError. Import it and put it where the old code expects to find it.
import { Buffer as NodeBuffer } from "node:buffer";
if (!(globalThis as any).Buffer) (globalThis as any).Buffer = NodeBuffer;

// Supabase secrets arrive through Deno.env; the bundled server code reads
// process.env, which is not the same object in every runtime.
const env = (Deno as any).env;
for (const key of [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRESQL_URL",
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "POSTGRES_BRIDGE_URL",
  "POSTGRES_BRIDGE_SECRET",
  "PG_BRIDGE_URL",
  "PG_BRIDGE_SECRET",
  "JATEXT_PG_BRIDGE_SECRET",
  "PG_POOL_MAX",
  "PGSSLMODE",
  "PUBLIC_APP_ORIGIN",
  "AUTH_SECRET",
  "JWT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_ANDROID_CLIENT_ID",
  "GOOGLE_ANDROID_SHA",
  "KLIPY_API_KEY",
  "FCM_SERVICE_ACCOUNT_JSON",
  "WEBAUTHN_EXTRA_ORIGINS",
  "WEBAUTHN_ANDROID_ORIGINS",
]) {
  const value = env?.get?.(key);
  if (value && !process.env[key]) process.env[key] = value;
}

const ROUTES: Record<string, () => Promise<{ default: (req: unknown, res: unknown) => Promise<void> }>> = {
  "/api/turso": () => import("../../../api/turso.js"),
  "/api/media": () => import("../../../api/media.js"),
  "/api/oauth-google": () => import("../../../api/oauth-google.js"),
  "/api/auth-status": () => import("../../../api/auth-status.js"),
  "/api/link-preview": () => import("../../../api/link-preview.js"),
  "/api/push-test": () => import("../../../api/push-test.js"),
  "/api/klipy-test": () => import("../../../api/klipy-test.js"),
  "/api/ios-404": () => import("../../../api/ios-404.js"),
};

/**
 * Adapt a web `Request` to the `(req, res)` pair the handlers were written for.
 *
 * `req.body` is deliberately a string for JSON and a Buffer for everything
 * else: `api/media.js` branches on `Buffer.isBuffer(req.body)` to accept raw
 * upload bytes, and the JSON handlers call `JSON.parse` on a string themselves.
 * Handing both the same shape is what makes the existing code work untouched.
 */
async function toReq(request: Request) {
  const url = new URL(request.url);
  const contentType = request.headers.get("content-type") || "";
  const method = request.method.toUpperCase();
  let body: unknown = undefined;
  if (method !== "GET" && method !== "HEAD") {
    if (contentType.includes("application/json") || contentType.includes("text/")) {
      body = await request.text();
    } else {
      body = new Uint8Array(await request.arrayBuffer());
    }
  }
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  // The handlers answer with res.json(), so they never read the stream twice.
  return {
    method,
    url: `${url.pathname}${url.search}`,
    path: url.pathname,
    headers,
    query: Object.fromEntries(url.searchParams.entries()),
    body,
    ip: headers["x-forwarded-for"]?.split(",")[0]?.trim() || headers["cf-connecting-ip"] || "",
    socket: { remoteAddress: headers["x-forwarded-for"] || "0.0.0.0" },
  };
}

function toRes() {
  let status = 200;
  const headers = new Headers();
  let sent: BodyInit | null = null;
  let done = false;
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(name: string, value: string | number | string[]) {
      headers.set(name, String(value));
      return res;
    },
    getHeader(name: string) {
      return headers.get(name);
    },
    removeHeader(name: string) {
      headers.delete(name);
    },
    status(code: number) {
      status = code;
      res.statusCode = code;
      return res;
    },
    setStatusCode(code: number) {
      return res.status(code);
    },
    json(payload: unknown) {
      headers.set("Content-Type", "application/json; charset=utf-8");
      sent = JSON.stringify(payload);
      done = true;
      return res;
    },
    send(payload?: unknown) {
      if (payload == null) {
        done = true;
      } else if (typeof payload === "string") {
        sent = payload;
        done = true;
      } else if (payload instanceof Uint8Array || payload instanceof ArrayBuffer) {
        sent = payload as BodyInit;
        done = true;
      } else {
        headers.set("Content-Type", "application/json; charset=utf-8");
        sent = JSON.stringify(payload);
        done = true;
      }
      return res;
    },
    end(chunk?: unknown) {
      if (chunk != null) {
        sent = typeof chunk === "string" ? chunk : (chunk as BodyInit);
      }
      done = true;
      return res;
    },
    write(chunk: unknown) {
      sent = typeof chunk === "string" ? chunk : (chunk as BodyInit);
      return res;
    },
    on() {
      return res;
    },
    once() {
      return res;
    },
    get body() {
      return sent;
    },
  };
  return {
    res,
    finish: () => {
      void done;
      const body = sent;
      // 204 must not carry a body or Cloudflare's proxy complains.
      if (status === 204 || body == null) return new Response(null, { status, headers });
      return new Response(body as BodyInit, { status, headers });
    },
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-JaText-Filename, X-JaText-Mime, Range",
      },
    });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const key = ROUTES[path] ? path : `/api${path}`;
  const load = ROUTES[key];

  if (!load) {
    if (path === "/" || path === "/health" || path === "/api/health") {
      return Response.json({ ok: true, service: "jatext-edge", routes: Object.keys(ROUTES) });
    }
    return Response.json({ ok: false, error: `Unknown route ${path}` }, { status: 404 });
  }

  try {
    const handler = (await load()).default;
    const req = await toReq(request);
    const { res, finish } = toRes();
    await handler(req, res);
    const response = finish();
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[JaText Edge] ${path} failed: ${message}`);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
