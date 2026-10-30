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

export async function uploadMediaToTurso(
  rawFile: File,
  slotId = getActiveAccountSlotId(),
): Promise<string> {
  const file = await ensureValidFileMime(rawFile);
  const token = await resolveSlotToken(slotId);
  if (!token) {
    throw new Error("Please sign in before uploading files.");
  }
  const baseMime = (file.type || "application/octet-stream").split(";")[0].trim();
  const storageMime =
    baseMime === "application/x-jatext-call+json"
      ? "application/json"
      : baseMime || "application/octet-stream";

  const base = getTursoApiBase();
  const res = await fetch(`${base}/api/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": storageMime,
      "X-JaText-Mime": storageMime,
      "X-JaText-Filename": encodeURIComponent(file.name || "attachment"),
    },
    body: file,
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
