import { Capacitor } from "@capacitor/core";
import { JaTextNative } from "./nativeBridge";
import {
  clearDeadSlotTokensOnAuthFailure,
  getActiveAccountSlotId,
  getTursoTokenForSlotSync,
  getTursoTokenKeyForSlot,
  setTursoTokenForSlot,
} from "./accountManager";
import { ensureValidFileMime } from "./imageUtils";
import { isPrimaryMobileAppRuntime } from "./iosDetection";

export const PUBLIC_TURSO_API_ORIGIN = (
  (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim().replace(/\/+$/, "") ||
  "https://jatext.vercel.app"
);

export function getTursoApiBase(): string {
  const explicit = (import.meta.env.VITE_API_ORIGIN as string | undefined)
    ?.trim()
    .replace(/\/+$/, "");
  if (explicit) return explicit;
  if (Capacitor.isNativePlatform()) {
    return PUBLIC_TURSO_API_ORIGIN;
  }
  return "";
}

export async function resolveSlotToken(slotId = getActiveAccountSlotId()): Promise<string | null> {
  const syncVal = getTursoTokenForSlotSync(slotId);
  if (syncVal) return syncVal;
  if (Capacitor.isNativePlatform()) {
    try {
      const key = getTursoTokenKeyForSlot(slotId);
      const res = await JaTextNative.getAuthStorageItem({ key });
      if (res.value) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, res.value);
        }
        return res.value;
      }
    } catch {
      // ignore native storage error
    }
  }
  return null;
}

let lastActivityBurstAt = 0;
const syncWakeListeners = new Set<() => void>();

export function triggerImmediateTursoSync(burst = true): void {
  if (burst) {
    lastActivityBurstAt = Date.now();
  }
  for (const fn of syncWakeListeners) {
    fn();
  }
}

export function isInTursoActivityBurst(): boolean {
  return Date.now() - lastActivityBurstAt < 10_000;
}

export function subscribeTursoSyncWake(fn: () => void): () => void {
  syncWakeListeners.add(fn);
  return () => {
    syncWakeListeners.delete(fn);
  };
}

const MUTATION_OPS = new Set([
  "saveProfile",
  "setActivity",
  "sendFriendRequest",
  "respondFriendRequest",
  "removeFriend",
  "setUserBlocked",
  "sendMessage",
  "markMessagesRead",
  "toggleMessageReaction",
  "editMessage",
  "unsendMessage",
  "deleteMessageForMe",
  "setConversationPrefs",
  "upsertSticker",
  "setCommunityModerators",
  "sendCommunityMessage",
  "voteCommunityPoll",
  "endCommunityPoll",
  "mutateCommunityMessage",
  "setCommunityPrefs",
  "createGroup",
  "sendGroupMessage",
  "mutateGroupMessage",
  "manageGroup",
]);

export async function tursoRpc<T = unknown>(
  op: string,
  args: Record<string, unknown> = {},
  options?: { slotId?: string; skipAuthClear?: boolean },
): Promise<T> {
  const slotId = options?.slotId ?? getActiveAccountSlotId();
  const token = await resolveSlotToken(slotId);
  const base = getTursoApiBase();
  const res = await fetch(`${base}/api/turso`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ op, args }),
  });

  let payload: { ok?: boolean; data?: T; error?: string } | null = null;
  try {
    payload = (await res.json()) as { ok?: boolean; data?: T; error?: string };
  } catch {
    payload = null;
  }

  if (res.status === 401 && token && !options?.skipAuthClear && op !== "signInEmail" && op !== "signUpEmail") {
    await clearDeadSlotTokensOnAuthFailure(slotId, PUBLIC_TURSO_API_ORIGIN);
  }

  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.error || `Request failed (${res.status})`);
  }

  const data = payload.data as T & { refreshedToken?: string };
  if (data && typeof data === "object" && "refreshedToken" in data && typeof data.refreshedToken === "string") {
    await setTursoTokenForSlot(slotId, data.refreshedToken, PUBLIC_TURSO_API_ORIGIN);
  }

  if (MUTATION_OPS.has(op)) {
    triggerImmediateTursoSync(true);
  }

  return payload.data as T;
}

const CLIENT_MEDIA_CHUNK_BYTES = 768 * 1024; // 768 KB per chunk (matches api/media.js)
const CLIENT_CHUNK_UPLOAD_THRESHOLD = 700 * 1024; // Use chunked upload above 700 KB
const CLIENT_MAX_UPLOAD_BYTES = 64 * 1024 * 1024; // 64 MB max video/audio attachment
const CLIENT_RANGE_SLICE_BYTES = 3 * 1024 * 1024; // 3 MB per Range GET (< Vercel 4.5 MB cap)

async function postWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 && i + 1 < attempts) {
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i + 1 < attempts) {
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Network error during upload.");
}

export async function uploadMediaToTurso(
  rawFile: File,
  slotId = getActiveAccountSlotId(),
): Promise<string> {
  const file = await ensureValidFileMime(rawFile);
  const token = await resolveSlotToken(slotId);
  if (!token) {
    throw new Error("Please sign in before uploading files.");
  }
  if (file.size <= 0) {
    throw new Error("Selected file is empty.");
  }
  if (file.size > CLIENT_MAX_UPLOAD_BYTES) {
    throw new Error("Attachment exceeds the 64 MB size limit.");
  }

  const baseMime = (file.type || "application/octet-stream").split(";")[0].trim();
  const storageMime =
    baseMime === "application/x-jatext-call+json"
      ? "application/json"
      : baseMime || "application/octet-stream";

  const base = getTursoApiBase();
  const safeFileName = file.name || "attachment";

  // Compact files (<= 700 KB): fast single-shot upload using ArrayBuffer (avoids Android WebView File stream bugs)
  if (file.size <= CLIENT_CHUNK_UPLOAD_THRESHOLD) {
    const bodyBuf = await file.arrayBuffer();
    const res = await postWithRetry(`${base}/api/media`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": storageMime,
        "X-JaText-Mime": storageMime,
        "X-JaText-Filename": encodeURIComponent(safeFileName),
      },
      body: bodyBuf,
    });

    let json: { ok?: boolean; url?: string; error?: string } | null = null;
    try {
      json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
    } catch {
      json = null;
    }

    if (!res.ok || !json?.ok || !json.url) {
      throw new Error(json?.error || "Upload failed. Please try again.");
    }
    return json.url;
  }

  // Video / audio / large attachments (> 700 KB up to 64 MB): chunked parallel upload
  const chunkCount = Math.ceil(file.size / CLIENT_MEDIA_CHUNK_BYTES);
  const initRes = await postWithRetry(`${base}/api/media?action=init`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mimeType: storageMime,
      fileName: safeFileName,
      byteSize: file.size,
      chunkCount,
    }),
  });

  let initJson: {
    ok?: boolean;
    id?: string;
    url?: string;
    chunkSize?: number;
    error?: string;
  } | null = null;
  try {
    initJson = (await initRes.json()) as {
      ok?: boolean;
      id?: string;
      url?: string;
      chunkSize?: number;
      error?: string;
    };
  } catch {
    initJson = null;
  }

  if (!initRes.ok || !initJson?.ok || !initJson.id || !initJson.url) {
    throw new Error(initJson?.error || "Upload failed. Please try again.");
  }

  const mediaId = initJson.id;
  const chunkBytes = initJson.chunkSize || CLIENT_MEDIA_CHUNK_BYTES;
  const totalChunks = Math.ceil(file.size / chunkBytes);
  let nextIdx = 0;
  const concurrency = Math.min(4, totalChunks);

  const worker = async () => {
    while (nextIdx < totalChunks) {
      const idx = nextIdx++;
      const start = idx * chunkBytes;
      const end = Math.min(file.size, start + chunkBytes);
      const sliceBuf = await file.slice(start, end).arrayBuffer();
      const chunkRes = await postWithRetry(
        `${base}/api/media?action=chunk&id=${encodeURIComponent(mediaId)}&index=${idx}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/octet-stream",
            "X-JaText-Chunk-Index": String(idx),
          },
          body: sliceBuf,
        },
      );
      if (!chunkRes.ok) {
        let errJson: { error?: string } | null = null;
        try {
          errJson = (await chunkRes.json()) as { error?: string };
        } catch {
          errJson = null;
        }
        throw new Error(errJson?.error || "Upload failed. Please try again.");
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return initJson.url;
}

/**
 * Downloads media bytes reliably even when the encrypted video/audio exceeds Vercel's
 * 4.5 MB single-response limit by transparently assembling 3 MB HTTP 206 byte ranges.
 */
export async function fetchMediaBytesSmart(
  mediaUrl: string,
  hintTotalBytes?: number,
): Promise<Uint8Array> {
  let knownSize = hintTotalBytes && hintTotalBytes > 0 ? hintTotalBytes : 0;
  if (!knownSize) {
    try {
      const u = new URL(mediaUrl, typeof window !== "undefined" ? window.location.origin : "https://jatext.vercel.app");
      const szParam = Number(u.searchParams.get("sz") || 0);
      if (Number.isFinite(szParam) && szParam > 0) {
        knownSize = szParam;
      }
    } catch {
      // Ignore URL parse error
    }
  }

  const fetchRangeSlice = async (start: number, end: number): Promise<Uint8Array> => {
    const res = await postWithRetry(mediaUrl, {
      method: "GET",
      headers: {
        Range: `bytes=${start}-${end}`,
      },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Failed to download media slice (${res.status}).`);
    }
    return new Uint8Array(await res.arrayBuffer());
  };

  if (knownSize > CLIENT_RANGE_SLICE_BYTES) {
    const out = new Uint8Array(knownSize);
    const ranges: Array<{ start: number; end: number }> = [];
    for (let offset = 0; offset < knownSize; offset += CLIENT_RANGE_SLICE_BYTES) {
      ranges.push({
        start: offset,
        end: Math.min(knownSize - 1, offset + CLIENT_RANGE_SLICE_BYTES - 1),
      });
    }
    let idx = 0;
    const workers = Array.from({ length: Math.min(4, ranges.length) }, async () => {
      while (idx < ranges.length) {
        const r = ranges[idx++];
        const part = await fetchRangeSlice(r.start, r.end);
        out.set(part, r.start);
      }
    });
    await Promise.all(workers);
    return out;
  }

  const res = await postWithRetry(mediaUrl, { method: "GET" });
  if (!res.ok && res.status !== 206) {
    throw new Error(`Failed to download media (${res.status}).`);
  }
  const firstPart = new Uint8Array(await res.arrayBuffer());
  if (res.status !== 206) {
    return firstPart;
  }

  // Server returned 206 Partial Content for an unhinted >3 MB media blob; assemble remaining slices!
  const contentRange = res.headers.get("Content-Range") || "";
  const totalHeader = Number(res.headers.get("X-JaText-Total-Size") || 0);
  const rangeMatch = /\/(\d+)$/.exec(contentRange);
  const totalSize = rangeMatch ? Number(rangeMatch[1]) : totalHeader;
  if (!totalSize || totalSize <= firstPart.byteLength) {
    return firstPart;
  }

  const out = new Uint8Array(totalSize);
  out.set(firstPart, 0);
  const ranges: Array<{ start: number; end: number }> = [];
  for (let offset = firstPart.byteLength; offset < totalSize; offset += CLIENT_RANGE_SLICE_BYTES) {
    ranges.push({
      start: offset,
      end: Math.min(totalSize - 1, offset + CLIENT_RANGE_SLICE_BYTES - 1),
    });
  }
  let idx = 0;
  const workers = Array.from({ length: Math.min(4, ranges.length) }, async () => {
    while (idx < ranges.length) {
      const r = ranges[idx++];
      const part = await fetchRangeSlice(r.start, r.end);
      out.set(part, r.start);
    }
  });
  await Promise.all(workers);
  return out;
}

let pendingWebOAuthError: string | null = null;

export function consumePendingOAuthError(): string | null {
  const e = pendingWebOAuthError;
  pendingWebOAuthError = null;
  return e;
}

export async function captureUrlOAuthCallbackIfPresent(
  slotId = getActiveAccountSlotId(),
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const tursoToken = url.searchParams.get("tursoToken");
  const authError = url.searchParams.get("authError");
  if (!tursoToken && !authError) return false;

  url.searchParams.delete("tursoToken");
  url.searchParams.delete("authError");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);

  // Desktop Web (/chats) is strictly linked-device via Mobile QR; primary mobile runtimes
  // (Android APK and authorized iOS /ios/chats) accept direct OAuth callback tokens.
  if (!isPrimaryMobileAppRuntime()) {
    return false;
  }

  if (authError) {
    pendingWebOAuthError = authError;
    return false;
  }
  if (tursoToken) {
    await setTursoTokenForSlot(slotId, tursoToken, PUBLIC_TURSO_API_ORIGIN);
    return true;
  }
  return false;
}
