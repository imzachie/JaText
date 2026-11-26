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
async function toReq(request: Request, overridePath?: string) {
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
    url: overridePath ?? `${url.pathname}${url.search}`,
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
      return await statusResponse(request);
    }
    return Response.json({ ok: false, error: `Unknown route ${path}` }, { status: 404 });
  }

  try {
    const response = await invoke(load, request);
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[JaText Edge] ${path} failed: ${message}`);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});

/** Runs one bundled API handler against a web Request and returns its Response. */
async function invoke(
  load: (typeof ROUTES)[string],
  request: Request,
  overridePath?: string,
) {
  const handler = (await load()).default;
  const req = await toReq(request, overridePath);
  const { res, finish } = toRes();
  await handler(req, res);
  return finish();
}

/**
 * What the API can actually see right now, including the database.
 *
 * Served as HTML when a browser asks and as JSON otherwise, because a status
 * status endpoint nobody can read in an address bar is no help at 2am: opening
 * https://jatextapp.pages.dev/api/health in a browser should be enough to tell
 * the function, the database URL and the schema are all reachable, and the
 * `error` field carries the Postgres message when they are not.
 */
async function statusResponse(request: Request) {
  const payload: Record<string, unknown> = {
    ok: false,
    service: "jatext-edge",
    routes: Object.keys(ROUTES),
  };
  let status = 503;

  const load = ROUTES["/api/auth-status"];
  if (load) {
    try {
      const probe = await invoke(load, request, "/api/auth-status");
      const health = (await probe.json()) as Record<string, unknown>;
      Object.assign(payload, health);
      status = health?.ok ? 200 : 503;
    } catch (err) {
      payload.probeError = err instanceof Error ? err.message : String(err);
    }
  } else {
    payload.probeError = "auth-status is not bundled";
  }

  const text = JSON.stringify(payload, null, 2);
  const isBrowser = (request.headers.get("accept") || "").includes("text/html");
  if (!isBrowser) {
    return new Response(text, {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  // The HTML answer is always 200. A status *page* that reports 5xx gets eaten by
  // link unfurlers, proxies and browser error screens before a person can read the
  // reason, which is the only thing it exists for; `ok` and `error` in the body say
  // whether it is actually healthy. Anything machine-checked asks for JSON and gets
  // the real code.
  status = 200;
  const safe = text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
  const banner = status === 200 ? "Reachable" : "Not working yet";
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>JaText API ${banner}</title>` +
      `<body style="margin:2rem;font:14px ui-monospace,Menlo,monospace;background:#0b0b0c;color:#e8e8ea">` +
      `<h1 style="font-size:16px">JaText API &middot; ${banner}</h1>` +
      `<pre style="white-space:pre-wrap;background:#141417;border:1px solid #26262c;border-radius:8px;padding:14px">${safe}</pre>` +
      `</body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
