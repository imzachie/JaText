/**
 * Supabase Storage as the home for attachment bytes.
 *
 * Attachments used to live inside the database itself: `media_blobs.data` for
 * small files and `media_chunks` for everything else, which means every photo,
 * voice note and video counted against Supabase's 500 MB database, and every byte
 * of playback streamed through the API function one 768 KB slice at a time.
 *
 * The Storage API is a plain HTTPS call with a service-role bearer token, so this
 * needs no SDK, no CLI and no second runtime. Objects are written once, are never
 * edited, and are read by anyone holding the row id, so the key layout is
 * `<owner>/<media id>`: unguessable, immutable, and cheap to delete by prefix if an
 * owner is ever purged.
 *
 * Everything here degrades to "not configured": with no SUPABASE_URL or no key the
 * API keeps storing bytes in the database exactly as before, which is what a
 * self-hosted server without Supabase expects.
 */

const cache = { key: null, cfg: null };

function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

/** The newest-style secret is a JSON array of publishable/secret keys. */
function secretKeyFromList() {
  const raw = firstEnv("SUPABASE_SECRET_KEYS", "SUPABY_SECRETS");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      const value = String(item?.value || item?.secret || "").trim();
      if (value) return value;
    }
  } catch {
    // Not JSON: treat the whole value as the key.
    return raw.startsWith("sb_secret_") || raw.startsWith("eyJ") ? raw : "";
  }
  return "";
}

/**
 * The project URL is worth deriving when it was not set: the database host in
 * DATABASE_URL carries the project ref, so one secret is enough to turn Storage on
 * instead of two that must agree with each other.
 */
function inferProjectUrl() {
  const explicit = firstEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  if (explicit) return explicit;
  const dbUrl = firstEnv("DATABASE_URL", "TURSO_DATABASE_URL");
  const match = /^postgres(?:ql)?:\/\/(?:[^@/]*@)?db\.([a-z0-9-]+)\.supabase\.co/i.exec(dbUrl);
  return match ? `https://${match[1]}.supabase.co` : "";
}

export function supabaseStorageConfig() {
  const projectUrl = inferProjectUrl();
  const serviceKey = firstEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
  ) || secretKeyFromList();
  const bucket = firstEnv("JATEXT_MEDIA_BUCKET") || "jatext-media";
  const signature = `${projectUrl}|${serviceKey.length}|${bucket}`;

  if (cache.key !== signature) {
    // Nothing here ever falls back to the anon key: it cannot write, and pretending
    // otherwise would turn a setup mistake into an upload that fails at the bucket.
    const key = serviceKey;
    cache.key = signature;
    cache.cfg = projectUrl && key
      ? {
          enabled: true,
          projectUrl: projectUrl.replace(/\/+$/, ""),
          serviceKey: key,
          bucket,
        }
      : { enabled: false, projectUrl: "", serviceKey: "", bucket };
  }
  return cache.cfg;
}

export function isSupabaseStorageEnabled() {
  return supabaseStorageConfig().enabled;
}

/** Public, cacheable, no auth: Supabase serves objects in a public bucket directly. */
export function publicObjectUrl(objectPath) {
  const cfg = supabaseStorageConfig();
  if (!cfg.enabled || !objectPath) return "";
  return `${cfg.projectUrl}/storage/v1/object/public/${cfg.bucket}/${objectPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

async function storageFetch(cfg, path, init) {
  const response = await fetch(`${cfg.projectUrl}/storage/v1/object/${cfg.bucket}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.serviceKey}`,
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const err = new Error(
      `Supabase Storage ${init?.method || "POST"} ${path} failed: HTTP ${response.status}${
        detail ? ` ${detail.slice(0, 240)}` : ""
      }`,
    );
    err.status = response.status;
    throw err;
  }
  return response;
}

/**
 * @param {string} objectPath key inside the bucket, e.g. `<userId>/<mediaId>`
 * @param {Uint8Array} bytes
 */
export async function uploadObject(objectPath, bytes, mimeType) {
  const cfg = supabaseStorageConfig();
  if (!cfg.enabled) throw new Error("Supabase Storage is not configured.");
  await storageFetch(cfg, objectPath, {
    method: "POST",
    headers: {
      "Content-Type": mimeType || "application/octet-stream",
      // Objects are content-addressed by media id, so a retry of the same bytes is
      // a replacement rather than a duplicate.
      "x-upsert": "true",
      "cache-control": "public, max-age=31536000, immutable",
    },
    body: bytes,
  });
  return publicObjectUrl(objectPath);
}

/**
 * Fetch one byte range of an object. Used when a client sends an explicit Range
 * header: answering it here keeps the redirect-free, CORS-free behaviour the app's
 * own video previewer relies on, while the whole-file case is handed to Storage.
 *
 * The read goes to the authenticated endpoint with the service key rather than the
 * public URL, so it also works if the bucket is ever flipped to private.
 */
export async function fetchObjectSlice(objectPath, start, end) {
  const cfg = supabaseStorageConfig();
  if (!cfg.enabled) throw new Error("Supabase Storage is not configured.");
  const response = await fetch(
    `${cfg.projectUrl}/storage/v1/object/${cfg.bucket}/${objectPath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")}`,
    {
      headers: {
        Authorization: `Bearer ${cfg.serviceKey}`,
        Range: `bytes=${start}-${end}`,
      },
    },
  );
  if (response.status !== 206 && response.status !== 200) {
    const err = new Error(`Supabase Storage range read failed: HTTP ${response.status}`);
    err.status = response.status === 404 ? 404 : 502;
    throw err;
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Best effort: a missing object is not an error worth failing a request over. */
export async function deleteObject(objectPath) {
  const cfg = supabaseStorageConfig();
  if (!cfg.enabled || !objectPath) return false;
  try {
    await storageFetch(cfg, objectPath, { method: "DELETE" });
    return true;
  } catch {
    return false;
  }
}

/** For tests and for the self-hosted path that points SUPABASE_URL at a stub. */
export function __setConfigCacheKey(value) {
  cache.key = value;
}
