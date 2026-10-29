import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { clearActiveE2EESession, clearDecryptedSessionCaches } from "./e2ee/keystore";
import { JaTextNative } from "./nativeBridge";
import type { JaUser, StatusPreference } from "./types";

const SAVED_ACCOUNTS_STORAGE_KEY = "jatext:saved-accounts:v1";
export const ACCOUNT_SLOT_CHANGE_EVENT = "jatext:account-slot-changed";
export const SLOT_AUTH_INVALIDATED_EVENT = "jatext:slot-auth-invalidated";
export const DEFAULT_ACCOUNT_SLOT_ID = "default";

export interface SavedAccountEntry {
  slotId: string;
  userId: string;
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  avatarColor: string;
  statusPreference?: StatusPreference;
  lastUsedAt: number;
}

export interface MultiAccountState {
  activeSlotId: string;
  /** Non-null while user is on LoginPage after clicking "+ Add another account" */
  returnToSlotId: string | null;
  accounts: SavedAccountEntry[];
}

const DEFAULT_STATE: MultiAccountState = {
  activeSlotId: DEFAULT_ACCOUNT_SLOT_ID,
  returnToSlotId: null,
  accounts: [],
};

let cachedState: MultiAccountState | null = null;
const listeners = new Set<() => void>();
const slotCleanupHandlers = new Set<(slotId: string, mode: "full" | "clientOnly") => void>();

export function registerSlotCleanupHandler(
  handler: (slotId: string, mode: "full" | "clientOnly") => void,
): () => void {
  slotCleanupHandlers.add(handler);
  return () => {
    slotCleanupHandlers.delete(handler);
  };
}

function invokeSlotCleanup(slotId: string, mode: "full" | "clientOnly"): void {
  for (const handler of slotCleanupHandlers) {
    try {
      handler(slotId, mode);
    } catch {
      // Ignore cleanup errors.
    }
  }
}

function sanitizeAccountEntry(raw: unknown): SavedAccountEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<SavedAccountEntry>;
  if (
    typeof r.slotId !== "string" ||
    !r.slotId ||
    typeof r.userId !== "string" ||
    !r.userId
  ) {
    return null;
  }
  return {
    slotId: r.slotId,
    userId: r.userId,
    username: typeof r.username === "string" ? r.username : "",
    displayName: typeof r.displayName === "string" ? r.displayName : "",
    email: typeof r.email === "string" && r.email ? r.email : undefined,
    avatarUrl: typeof r.avatarUrl === "string" && r.avatarUrl ? r.avatarUrl : undefined,
    avatarColor: typeof r.avatarColor === "string" ? r.avatarColor : "purple",
    statusPreference:
      r.statusPreference === "online" ||
      r.statusPreference === "dnd" ||
      r.statusPreference === "offline"
        ? r.statusPreference
        : undefined,
    lastUsedAt: typeof r.lastUsedAt === "number" ? r.lastUsedAt : 0,
  };
}

function readStateFromStorage(): MultiAccountState {
  if (cachedState) return cachedState;
  if (typeof window === "undefined") {
    cachedState = DEFAULT_STATE;
    return cachedState;
  }
  try {
    const raw = window.localStorage.getItem(SAVED_ACCOUNTS_STORAGE_KEY);
    if (!raw) {
      cachedState = DEFAULT_STATE;
      return cachedState;
    }
    const parsed = JSON.parse(raw) as Partial<MultiAccountState>;
    const accounts: SavedAccountEntry[] = [];
    const seenSlots = new Set<string>();
    const seenUsers = new Set<string>();
    if (Array.isArray(parsed?.accounts)) {
      for (const item of parsed.accounts) {
        const clean = sanitizeAccountEntry(item);
        if (clean && !seenSlots.has(clean.slotId) && !seenUsers.has(clean.userId)) {
          seenSlots.add(clean.slotId);
          seenUsers.add(clean.userId);
          accounts.push(clean);
        }
      }
    }
    const activeSlotId =
      typeof parsed?.activeSlotId === "string" && parsed.activeSlotId
        ? parsed.activeSlotId
        : DEFAULT_ACCOUNT_SLOT_ID;
    const returnToSlotId =
      typeof parsed?.returnToSlotId === "string" &&
      parsed.returnToSlotId &&
      parsed.returnToSlotId !== activeSlotId
        ? parsed.returnToSlotId
        : null;
    cachedState = {
      activeSlotId,
      returnToSlotId,
      accounts,
    };
    return cachedState;
  } catch {
    cachedState = DEFAULT_STATE;
    return cachedState;
  }
}

function emitSlotChanged(prevSlotId: string, nextSlotId: string) {
  if (prevSlotId !== nextSlotId && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(ACCOUNT_SLOT_CHANGE_EVENT, { detail: nextSlotId }),
    );
  }
}

function persistState(next: MultiAccountState) {
  const prevSlotId = cachedState?.activeSlotId ?? DEFAULT_ACCOUNT_SLOT_ID;
  cachedState = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SAVED_ACCOUNTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota issues.
    }
  }
  emitSlotChanged(prevSlotId, next.activeSlotId);
  for (const listener of listeners) {
    listener();
  }
}

export function getMultiAccountState(): MultiAccountState {
  return readStateFromStorage();
}

export function getActiveAccountSlotId(): string {
  return readStateFromStorage().activeSlotId;
}

export function getScopedStorageKey(baseKey: string, slotId = getActiveAccountSlotId()): string {
  return slotId === DEFAULT_ACCOUNT_SLOT_ID ? baseKey : `${baseKey}:${slotId}`;
}

export function getConvexStorageNamespaceForSlot(convexUrl: string, slotId: string): string {
  return slotId === DEFAULT_ACCOUNT_SLOT_ID ? convexUrl : `${convexUrl}__${slotId}`;
}

function escapeConvexAuthNamespace(namespace: string): string {
  return namespace.replace(/[^a-zA-Z0-9]/g, "");
}

export function getConvexAuthKeysForSlot(convexUrl: string, slotId: string): {
  jwtKey: string;
  refreshKey: string;
  verifierKey: string;
  fetchTimeKey: string;
} {
  const escaped = escapeConvexAuthNamespace(
    getConvexStorageNamespaceForSlot(convexUrl, slotId),
  );
  return {
    jwtKey: `__convexAuthJWT_${escaped}`,
    refreshKey: `__convexAuthRefreshToken_${escaped}`,
    verifierKey: `__convexAuthOAuthVerifier_${escaped}`,
    fetchTimeKey: `__convexAuthServerStateFetchTime_${escaped}`,
  };
}

export function getDemoSessionKeyForSlot(slotId: string): string {
  return slotId === DEFAULT_ACCOUNT_SLOT_ID
    ? "jatext-demo-session-v1"
    : `jatext-demo-session-v1:${slotId}`;
}

const invalidatedAuthSlots = new Set<string>();

export function hasStoredAuthForSlot(
  convexUrl: string | undefined,
  slotId: string,
): boolean {
  if (typeof window === "undefined") return false;
  if (invalidatedAuthSlots.has(slotId)) return false;
  try {
    if (!convexUrl) {
      return Boolean(window.localStorage.getItem(getDemoSessionKeyForSlot(slotId)));
    }
    const { jwtKey, refreshKey } = getConvexAuthKeysForSlot(convexUrl, slotId);
    if (
      window.localStorage.getItem(jwtKey) ||
      window.localStorage.getItem(refreshKey)
    ) {
      return true;
    }
    if (Capacitor.isNativePlatform()) {
      return readStateFromStorage().accounts.some((a) => a.slotId === slotId);
    }
    return false;
  } catch {
    return false;
  }
}

export async function clearDeadSlotTokensOnAuthFailure(
  slotId: string,
  convexUrl: string,
): Promise<void> {
  invalidatedAuthSlots.add(slotId);
  const keys = getConvexAuthKeysForSlot(convexUrl, slotId);
  await Promise.all([
    deleteAuthItem(keys.jwtKey),
    deleteAuthItem(keys.refreshKey),
    deleteAuthItem(keys.verifierKey),
    deleteAuthItem(keys.fetchTimeKey),
  ]);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: keys.jwtKey,
          newValue: null,
          storageArea: window.localStorage,
        }),
      );
    } catch {
      // Ignore synthetic StorageEvent error in older WebViews.
    }
    window.dispatchEvent(
      new CustomEvent(SLOT_AUTH_INVALIDATED_EVENT, { detail: slotId }),
    );
  }
}

async function readAuthItem(key: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await JaTextNative.getAuthStorageItem({ key });
      if (res.value) return res.value;
    } catch {
      // Fallback to localStorage
    }
  }
  if (typeof window !== "undefined") {
    return window.localStorage.getItem(key);
  }
  return null;
}

async function writeAuthItem(key: string, value: string, convexUrl?: string): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, value);
  }
  if (Capacitor.isNativePlatform()) {
    await JaTextNative.setAuthStorageItem({ key, value, convexUrl }).catch(() => undefined);
  }
}

async function deleteAuthItem(key: string): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(key);
  }
  if (Capacitor.isNativePlatform()) {
    await JaTextNative.removeAuthStorageItem({ key }).catch(() => undefined);
  }
}

async function clearSlotStoredTokens(slotId: string, convexUrl?: string): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(getDemoSessionKeyForSlot(slotId));
  }
  if (!convexUrl) return;
  const keys = getConvexAuthKeysForSlot(convexUrl, slotId);
  await Promise.all([
    deleteAuthItem(keys.jwtKey),
    deleteAuthItem(keys.refreshKey),
    deleteAuthItem(keys.verifierKey),
    deleteAuthItem(keys.fetchTimeKey),
  ]);
}

/**
 * Ensures Android's background FCM decryptor (`JaTextE2EEDecryptor`) immediately points its
 * active `auth_jwt` & `auth_refresh` pointers to the newly selected account slot!
 */
export async function syncNativeActiveSlotTokens(
  slotId: string,
  convexUrl?: string,
): Promise<void> {
  if (!Capacitor.isNativePlatform() || !convexUrl) return;
  const { jwtKey, refreshKey } = getConvexAuthKeysForSlot(convexUrl, slotId);
  const [jwt, refresh] = await Promise.all([readAuthItem(jwtKey), readAuthItem(refreshKey)]);
  if (jwt) {
    await JaTextNative.setAuthStorageItem({ key: jwtKey, value: jwt, convexUrl }).catch(
      () => undefined,
    );
  }
  if (refresh) {
    await JaTextNative.setAuthStorageItem({ key: refreshKey, value: refresh, convexUrl }).catch(
      () => undefined,
    );
  }
}

/**
 * Registers or updates the currently signed-in `me` user inside the saved accounts list.
 * If the user signed into an account that was ALREADY saved in an earlier slot, automatically
 * transfers the fresh tokens into that existing slot and deduplicates cleanly!
 */
export async function syncActiveUserToSavedAccounts(
  user: JaUser,
  convexUrl?: string,
): Promise<void> {
  if (!user?.id) return;
  const state = readStateFromStorage();
  const currentSlotId = state.activeSlotId;
  invalidatedAuthSlots.delete(currentSlotId);

  const duplicateInOtherSlot = state.accounts.find(
    (acct) => acct.userId === user.id && acct.slotId !== currentSlotId,
  );

  if (duplicateInOtherSlot) {
    const canonicalSlotId = duplicateInOtherSlot.slotId;
    invalidatedAuthSlots.delete(canonicalSlotId);
    if (convexUrl) {
      const fromKeys = getConvexAuthKeysForSlot(convexUrl, currentSlotId);
      const toKeys = getConvexAuthKeysForSlot(convexUrl, canonicalSlotId);
      const [freshJwt, freshRefresh] = await Promise.all([
        readAuthItem(fromKeys.jwtKey),
        readAuthItem(fromKeys.refreshKey),
      ]);
      if (freshJwt) await writeAuthItem(toKeys.jwtKey, freshJwt, convexUrl);
      if (freshRefresh) await writeAuthItem(toKeys.refreshKey, freshRefresh, convexUrl);
      await clearSlotStoredTokens(currentSlotId, convexUrl);
    } else if (typeof window !== "undefined") {
      window.localStorage.setItem(getDemoSessionKeyForSlot(canonicalSlotId), user.id);
      window.localStorage.removeItem(getDemoSessionKeyForSlot(currentSlotId));
    }
    invokeSlotCleanup(currentSlotId, "full");
    invokeSlotCleanup(canonicalSlotId, "clientOnly");

    const updatedAccounts = state.accounts
      .filter((a) => a.slotId !== currentSlotId)
      .map((a) =>
        a.slotId === canonicalSlotId
          ? {
              ...a,
              username: user.username || a.username,
              displayName: user.displayName || user.username || a.displayName || "JaText User",
              email: user.email ?? a.email,
              avatarUrl: user.avatarUrl,
              avatarColor: user.avatarColor,
              statusPreference: user.statusPreference,
              lastUsedAt: Date.now(),
            }
          : a,
      );

    persistState({
      activeSlotId: canonicalSlotId,
      returnToSlotId: null,
      accounts: updatedAccounts,
    });
    return;
  }

  const existingSameSlot = state.accounts.find((a) => a.slotId === currentSlotId);
  const nextEntry: SavedAccountEntry = {
    slotId: currentSlotId,
    userId: user.id,
    username: user.username || existingSameSlot?.username || "",
    displayName:
      user.displayName || user.username || existingSameSlot?.displayName || "JaText User",
    email: user.email ?? existingSameSlot?.email,
    avatarUrl: user.avatarUrl,
    avatarColor: user.avatarColor,
    statusPreference: user.statusPreference,
    lastUsedAt: existingSameSlot?.lastUsedAt || Date.now(),
  };

  // Avoid noisy writes if nothing meaningful changed
  if (
    existingSameSlot &&
    state.returnToSlotId === null &&
    existingSameSlot.userId === nextEntry.userId &&
    existingSameSlot.username === nextEntry.username &&
    existingSameSlot.displayName === nextEntry.displayName &&
    existingSameSlot.email === nextEntry.email &&
    existingSameSlot.avatarUrl === nextEntry.avatarUrl &&
    existingSameSlot.avatarColor === nextEntry.avatarColor &&
    existingSameSlot.statusPreference === nextEntry.statusPreference
  ) {
    return;
  }

  const nextAccounts = existingSameSlot
    ? state.accounts.map((a) => (a.slotId === currentSlotId ? { ...nextEntry, lastUsedAt: Date.now() } : a))
    : [...state.accounts, { ...nextEntry, lastUsedAt: Date.now() }];

  persistState({
    activeSlotId: currentSlotId,
    returnToSlotId: null,
    accounts: nextAccounts,
  });
}

/**
 * Switches directly to another saved account slot WITHOUT signing out the current account!
 */
export async function switchToAccountSlot(
  targetSlotId: string,
  convexUrl?: string,
): Promise<void> {
  const state = readStateFromStorage();
  if (!targetSlotId) return;
  if (state.activeSlotId === targetSlotId && state.returnToSlotId === null) return;

  clearActiveE2EESession();
  await syncNativeActiveSlotTokens(targetSlotId, convexUrl);

  const nextAccounts = state.accounts.map((a) =>
    a.slotId === targetSlotId ? { ...a, lastUsedAt: Date.now() } : a,
  );
  persistState({
    activeSlotId: targetSlotId,
    returnToSlotId: null,
    accounts: nextAccounts,
  });
}

/**
 * Allocates a fresh auth slot and navigates to LoginPage while keeping all existing
 * accounts 100% signed in so the user can add another account or cancel in 1 tap.
 */
export function beginAddAnotherAccount(): string {
  const state = readStateFromStorage();
  const activeEntry = state.accounts.find((a) => a.slotId === state.activeSlotId);
  const fallbackReturn =
    activeEntry?.slotId ??
    state.returnToSlotId ??
    [...state.accounts].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0]?.slotId ??
    null;

  // Reuse current slot if it doesn't hold a saved account yet
  const nextSlotId = activeEntry
    ? `slot_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`
    : state.activeSlotId;

  clearActiveE2EESession();

  persistState({
    activeSlotId: nextSlotId,
    returnToSlotId: fallbackReturn && fallbackReturn !== nextSlotId ? fallbackReturn : null,
    accounts: state.accounts,
  });
  return nextSlotId;
}

export async function cancelAddAnotherAccount(convexUrl?: string): Promise<void> {
  const state = readStateFromStorage();
  const target =
    (state.returnToSlotId && state.accounts.some((a) => a.slotId === state.returnToSlotId)
      ? state.returnToSlotId
      : [...state.accounts].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0]?.slotId) ?? null;
  if (target) {
    await switchToAccountSlot(target, convexUrl);
  }
}

/**
 * Removes an inactive saved account from this device without affecting the active session.
 */
export async function removeSavedAccountSlot(
  slotIdToRemove: string,
  convexUrl?: string,
): Promise<void> {
  const state = readStateFromStorage();
  if (!slotIdToRemove || slotIdToRemove === state.activeSlotId) return;

  await clearSlotStoredTokens(slotIdToRemove, convexUrl);
  invokeSlotCleanup(slotIdToRemove, "full");
  const remaining = state.accounts.filter((a) => a.slotId !== slotIdToRemove);
  const nextReturn =
    state.returnToSlotId === slotIdToRemove
      ? ([...remaining].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0]?.slotId ?? null)
      : state.returnToSlotId;

  persistState({
    activeSlotId: state.activeSlotId,
    returnToSlotId: nextReturn,
    accounts: remaining,
  });
}

/**
 * Called right after `signOut()` revokes the active slot's server session.
 * Automatically switches into the most recently used remaining saved account if one exists!
 */
export async function finalizeSignOutCurrentSlot(
  signedOutSlotId: string,
  convexUrl?: string,
): Promise<void> {
  clearDecryptedSessionCaches();
  await clearSlotStoredTokens(signedOutSlotId, convexUrl);
  invokeSlotCleanup(signedOutSlotId, "full");
  const state = readStateFromStorage();
  const remaining = state.accounts.filter((a) => a.slotId !== signedOutSlotId);
  const nextBest = [...remaining].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0] ?? null;

  if (nextBest) {
    await syncNativeActiveSlotTokens(nextBest.slotId, convexUrl);
    persistState({
      activeSlotId: nextBest.slotId,
      returnToSlotId: null,
      accounts: remaining.map((a) =>
        a.slotId === nextBest.slotId ? { ...a, lastUsedAt: Date.now() } : a,
      ),
    });
  } else {
    persistState({
      activeSlotId: DEFAULT_ACCOUNT_SLOT_ID,
      returnToSlotId: null,
      accounts: [],
    });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === SAVED_ACCOUNTS_STORAGE_KEY) {
      const prevSlot = cachedState?.activeSlotId ?? DEFAULT_ACCOUNT_SLOT_ID;
      cachedState = null;
      const fresh = readStateFromStorage();
      emitSlotChanged(prevSlot, fresh.activeSlotId);
      listener();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

export function useMultiAccountState(): MultiAccountState {
  return useSyncExternalStore(subscribe, readStateFromStorage, () => DEFAULT_STATE);
}
