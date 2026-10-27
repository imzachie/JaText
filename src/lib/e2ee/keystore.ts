import { useSyncExternalStore } from "react";
import {
  E2EE_SIGNAL_PREFIX,
  computeKeyFingerprint,
  computeSafetyNumber,
  decryptAttachmentBytes,
  decryptDmEnvelope,
  decryptGroupEnvelope,
  generateGroupEpochSecretB64,
  generateIdentityRecord,
  isEncryptedWireBody,
  parseEncryptedWireBody,
  sha256Bytes,
  bytesToHex,
  toPublicIdentityBundle,
  unwrapGroupKeySignalPacket,
  verifyPublicIdentityBundle,
  type AnyEncryptedEnvelope,
  type E2EEPlainPayload,
  type E2EEVaultContents,
  type EncryptedBlobDescriptor,
  type GroupKeySignalPacket,
  type PublicIdentityBundle,
  type StoredIdentityRecord,
} from "./cryptoPrimitives";

const IDB_NAME = "jatext-e2ee-db-v1";
const IDB_STORE = "user_state";
const FALLBACK_LS_PREFIX = "jatext:e2ee:state:v1:";

export interface PeerKeyEntry {
  bundle: PublicIdentityBundle;
  fingerprint: string;
  safetyNumber: string;
  verifiedKeyId?: string;
  previousKeyId?: string;
  keyChangedAt?: number;
}

export interface GroupEpochEntry {
  groupId: string;
  epoch: number;
  secretB64: string;
  fingerprint: string;
  createdAt: number;
}

export interface PersistedUserE2EEState {
  userId: string;
  primaryIdentity: StoredIdentityRecord;
  previousIdentities: StoredIdentityRecord[];
  myFingerprint: string;
  peerKeys: Record<string, PeerKeyEntry>;
  groupEpochs: Record<string, Record<number, GroupEpochEntry>>;
  backedUpKeyId?: string;
}

export interface IdentitySignalPacket {
  kind: "e2ee_ik";
  v: 1;
  kid: string;
  dh: string;
  sk: string;
  sig: string;
  ts: number;
}

export interface MessageE2EEProof {
  encrypted: boolean;
  decrypted: boolean;
  signatureVerified: boolean;
  algorithm: string;
  channel: "dm" | "grp" | "plain";
  senderKeyId?: string;
  receiverKeyId?: string;
  ephemeralPublicKey?: string;
  groupEpoch?: number;
  iv?: string;
  signature?: string;
  rawWireBody: string;
  attachmentEncrypted?: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* IndexedDB + Fallback Persistence                                    */
/* ------------------------------------------------------------------ */

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readPersistedState(userId: string): Promise<PersistedUserE2EEState | null> {
  const db = await openDatabase();
  if (db) {
    const fromIdb = await new Promise<PersistedUserE2EEState | null>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(userId);
        req.onsuccess = () => resolve((req.result as PersistedUserE2EEState | undefined) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    db.close();
    if (fromIdb) return fromIdb;
  }

  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(`${FALLBACK_LS_PREFIX}${userId}`);
      if (raw) return JSON.parse(raw) as PersistedUserE2EEState;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

async function writePersistedState(state: PersistedUserE2EEState): Promise<void> {
  const db = await openDatabase();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(state, state.userId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    db.close();
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`${FALLBACK_LS_PREFIX}${state.userId}`, JSON.stringify(state));
    }
  } catch {
    // Ignore quota errors
  }
}

/* ------------------------------------------------------------------ */
/* In-Memory Reactive Store + Subscription                             */
/* ------------------------------------------------------------------ */

let activeUserId: string | null = null;
let activeState: PersistedUserE2EEState | null = null;
let snapshotVersion = 0;
const initPromises = new Map<string, Promise<PersistedUserE2EEState>>();
const listeners = new Set<() => void>();

export interface E2EESnapshot {
  version: number;
  userId: string | null;
  ready: boolean;
  myKeyId: string | null;
  myDhPubB64: string | null;
  mySigPubB64: string | null;
  myFingerprint: string | null;
  backedUp: boolean;
  peerKeys: Record<string, PeerKeyEntry>;
  groupEpochs: Record<string, Record<number, GroupEpochEntry>>;
}

let cachedSnapshot: E2EESnapshot = {
  version: 0,
  userId: null,
  ready: false,
  myKeyId: null,
  myDhPubB64: null,
  mySigPubB64: null,
  myFingerprint: null,
  backedUp: false,
  peerKeys: {},
  groupEpochs: {},
};

function notifyListeners() {
  snapshotVersion += 1;
  cachedSnapshot = {
    version: snapshotVersion,
    userId: activeUserId,
    ready: Boolean(activeState && activeState.userId === activeUserId),
    myKeyId: activeState?.primaryIdentity.keyId ?? null,
    myDhPubB64: activeState?.primaryIdentity.dhPubB64 ?? null,
    mySigPubB64: activeState?.primaryIdentity.sigPubB64 ?? null,
    myFingerprint: activeState?.myFingerprint ?? null,
    backedUp: Boolean(
      activeState &&
        activeState.backedUpKeyId &&
        activeState.backedUpKeyId === activeState.primaryIdentity.keyId,
    ),
    peerKeys: activeState ? { ...activeState.peerKeys } : {},
    groupEpochs: activeState ? { ...activeState.groupEpochs } : {},
  };
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeE2EE(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getE2EESnapshot(): E2EESnapshot {
  return cachedSnapshot;
}

export function useE2EESnapshot(): E2EESnapshot {
  return useSyncExternalStore(subscribeE2EE, getE2EESnapshot, getE2EESnapshot);
}

export function getActiveE2EEState(): PersistedUserE2EEState | null {
  return activeState;
}

export function getAllMyIdentities(state: PersistedUserE2EEState): StoredIdentityRecord[] {
  const seen = new Set<string>([state.primaryIdentity.keyId]);
  const out = [state.primaryIdentity];
  for (const prev of state.previousIdentities) {
    if (!seen.has(prev.keyId)) {
      seen.add(prev.keyId);
      out.push(prev);
    }
  }
  return out;
}

export async function ensureUserE2EEInitialized(userId: string): Promise<PersistedUserE2EEState> {
  if (activeState && activeState.userId === userId) {
    activeUserId = userId;
    return activeState;
  }
  const existingInit = initPromises.get(userId);
  if (existingInit) return existingInit;

  const task = (async () => {
    let loaded = await readPersistedState(userId);
    if (!loaded) {
      const identity = await generateIdentityRecord(userId);
      const myFingerprint = await computeKeyFingerprint(identity.dhPubB64, identity.sigPubB64);
      loaded = {
        userId,
        primaryIdentity: identity,
        previousIdentities: [],
        myFingerprint,
        peerKeys: {},
        groupEpochs: {},
      };
      await writePersistedState(loaded);
    } else if (!loaded.myFingerprint) {
      loaded.myFingerprint = await computeKeyFingerprint(
        loaded.primaryIdentity.dhPubB64,
        loaded.primaryIdentity.sigPubB64,
      );
      await writePersistedState(loaded);
    }

    activeUserId = userId;
    activeState = loaded;
    notifyListeners();
    return loaded;
  })();

  initPromises.set(userId, task);
  try {
    return await task;
  } finally {
    initPromises.delete(userId);
  }
}

export function clearActiveE2EESession(): void {
  activeUserId = null;
  activeState = null;
  notifyListeners();
}

export async function computeGroupEpochFingerprint(
  groupId: string,
  epoch: number,
  secretB64: string,
): Promise<string> {
  const digest = await sha256Bytes(
    new TextEncoder().encode(`JaText-GrpFP-v1|${groupId}|${epoch}|${secretB64}`),
  );
  const hex = bytesToHex(digest).toUpperCase();
  const parts: string[] = [];
  for (let i = 0; i < 32; i += 4) {
    parts.push(hex.slice(i, i + 4));
  }
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Peer Identity & Group Epoch Ingestion                               */
/* ------------------------------------------------------------------ */

export function serializeIdentitySignal(record: StoredIdentityRecord): string {
  const pkt: IdentitySignalPacket = {
    kind: "e2ee_ik",
    v: 1,
    kid: record.keyId,
    dh: record.dhPubB64,
    sk: record.sigPubB64,
    sig: record.selfSigB64,
    ts: record.createdAt,
  };
  return `${E2EE_SIGNAL_PREFIX}${JSON.stringify(pkt)}`;
}

export function parseIdentitySignal(
  body: string | null | undefined,
  senderId: string,
): PublicIdentityBundle | null {
  if (!body || !body.startsWith(E2EE_SIGNAL_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(E2EE_SIGNAL_PREFIX.length)) as Partial<IdentitySignalPacket>;
    if (
      parsed.kind !== "e2ee_ik" ||
      parsed.v !== 1 ||
      typeof parsed.kid !== "string" ||
      typeof parsed.dh !== "string" ||
      typeof parsed.sk !== "string" ||
      typeof parsed.sig !== "string"
    ) {
      return null;
    }
    return {
      userId: senderId,
      keyId: parsed.kid,
      dhPubB64: parsed.dh,
      sigPubB64: parsed.sk,
      selfSigB64: parsed.sig,
      ts: typeof parsed.ts === "number" ? parsed.ts : 0,
    };
  } catch {
    return null;
  }
}

export function serializeGroupKeySignal(pkt: GroupKeySignalPacket): string {
  return `${E2EE_SIGNAL_PREFIX}${JSON.stringify(pkt)}`;
}

export function parseGroupKeySignal(body: string | null | undefined): GroupKeySignalPacket | null {
  if (!body || !body.startsWith(E2EE_SIGNAL_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(E2EE_SIGNAL_PREFIX.length)) as Partial<GroupKeySignalPacket>;
    if (
      parsed.kind !== "e2ee_gk" ||
      parsed.v !== 1 ||
      typeof parsed.gid !== "string" ||
      typeof parsed.ep !== "number" ||
      typeof parsed.skid !== "string" ||
      typeof parsed.epk !== "string" ||
      !parsed.wraps ||
      typeof parsed.wraps !== "object" ||
      typeof parsed.sig !== "string"
    ) {
      return null;
    }
    return parsed as GroupKeySignalPacket;
  } catch {
    return null;
  }
}

const pendingVerifications = new Set<string>();

export async function ingestPeerIdentityBundle(
  bundle: PublicIdentityBundle,
): Promise<PeerKeyEntry | null> {
  if (!activeState || bundle.userId === activeState.userId) return null;
  const current = activeState.peerKeys[bundle.userId];
  if (current && current.bundle.keyId === bundle.keyId) {
    return current;
  }
  // Ignore older announcements if we already have a newer verified bundle
  if (current && bundle.ts > 0 && current.bundle.ts > bundle.ts) {
    return current;
  }

  const dedupeKey = `${activeState.userId}:${bundle.userId}:${bundle.keyId}`;
  if (pendingVerifications.has(dedupeKey)) return current ?? null;
  pendingVerifications.add(dedupeKey);

  try {
    const valid = await verifyPublicIdentityBundle(bundle);
    if (!valid) return current ?? null;
    if (!activeState) return null;

    const [fingerprint, safetyNumber] = await Promise.all([
      computeKeyFingerprint(bundle.dhPubB64, bundle.sigPubB64),
      computeSafetyNumber(
        {
          userId: activeState.userId,
          dhPubB64: activeState.primaryIdentity.dhPubB64,
          sigPubB64: activeState.primaryIdentity.sigPubB64,
        },
        {
          userId: bundle.userId,
          dhPubB64: bundle.dhPubB64,
          sigPubB64: bundle.sigPubB64,
        },
      ),
    ]);

    const prevEntry = activeState.peerKeys[bundle.userId];
    const changed = Boolean(prevEntry && prevEntry.bundle.keyId !== bundle.keyId);
    const nextEntry: PeerKeyEntry = {
      bundle,
      fingerprint,
      safetyNumber,
      verifiedKeyId: changed ? undefined : prevEntry?.verifiedKeyId,
      previousKeyId: changed ? prevEntry?.bundle.keyId : prevEntry?.previousKeyId,
      keyChangedAt: changed ? Date.now() : prevEntry?.keyChangedAt,
    };

    activeState = {
      ...activeState,
      peerKeys: {
        ...activeState.peerKeys,
        [bundle.userId]: nextEntry,
      },
    };
    await writePersistedState(activeState);
    notifyListeners();
    return nextEntry;
  } finally {
    pendingVerifications.delete(dedupeKey);
  }
}

export async function togglePeerVerified(peerUserId: string): Promise<boolean> {
  if (!activeState) return false;
  const entry = activeState.peerKeys[peerUserId];
  if (!entry) return false;
  const nowVerified = entry.verifiedKeyId !== entry.bundle.keyId;
  const updated: PeerKeyEntry = {
    ...entry,
    verifiedKeyId: nowVerified ? entry.bundle.keyId : undefined,
    keyChangedAt: nowVerified ? undefined : entry.keyChangedAt,
  };
  activeState = {
    ...activeState,
    peerKeys: {
      ...activeState.peerKeys,
      [peerUserId]: updated,
    },
  };
  await writePersistedState(activeState);
  notifyListeners();
  return nowVerified;
}

export async function storeGroupEpochSecret(
  groupId: string,
  epoch: number,
  secretB64: string,
): Promise<GroupEpochEntry | null> {
  if (!activeState) return null;
  const existing = activeState.groupEpochs[groupId]?.[epoch];
  if (existing && existing.secretB64 === secretB64) return existing;

  const fingerprint = await computeGroupEpochFingerprint(groupId, epoch, secretB64);
  if (!activeState) return null;

  const entry: GroupEpochEntry = {
    groupId,
    epoch,
    secretB64,
    fingerprint,
    createdAt: Date.now(),
  };
  activeState = {
    ...activeState,
    groupEpochs: {
      ...activeState.groupEpochs,
      [groupId]: {
        ...(activeState.groupEpochs[groupId] ?? {}),
        [epoch]: entry,
      },
    },
  };
  await writePersistedState(activeState);
  notifyListeners();
  return entry;
}

export function getLatestGroupEpoch(groupId: string): GroupEpochEntry | null {
  if (!activeState) return null;
  const byEpoch = activeState.groupEpochs[groupId];
  if (!byEpoch) return null;
  const epochs = Object.keys(byEpoch)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  if (epochs.length === 0) return null;
  return byEpoch[epochs[0]] ?? null;
}

export async function ensureInitialGroupEpoch(groupId: string): Promise<GroupEpochEntry | null> {
  const existing = getLatestGroupEpoch(groupId);
  if (existing) return existing;
  const secretB64 = generateGroupEpochSecretB64();
  return storeGroupEpochSecret(groupId, 1, secretB64);
}

export async function rotateGroupEpoch(groupId: string): Promise<GroupEpochEntry | null> {
  const current = getLatestGroupEpoch(groupId);
  const nextEpoch = (current?.epoch ?? 0) + 1;
  const secretB64 = generateGroupEpochSecretB64();
  return storeGroupEpochSecret(groupId, nextEpoch, secretB64);
}

export async function ingestGroupKeySignalPacket(
  packet: GroupKeySignalPacket,
  senderId: string,
): Promise<boolean> {
  if (!activeState) return false;
  if (activeState.groupEpochs[packet.gid]?.[packet.ep]) {
    return false;
  }
  const senderPublic =
    senderId === activeState.userId
      ? toPublicIdentityBundle(activeState.primaryIdentity)
      : activeState.peerKeys[senderId]?.bundle ?? null;

  try {
    const unwrapped = await unwrapGroupKeySignalPacket({
      packet,
      senderId,
      senderPublic,
      myUserId: activeState.userId,
      myIdentities: getAllMyIdentities(activeState),
    });
    if (!unwrapped) return false;
    await storeGroupEpochSecret(packet.gid, packet.ep, unwrapped);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Vault Export & Multi-Device Restore                                 */
/* ------------------------------------------------------------------ */

export function exportCurrentVaultContents(): E2EEVaultContents | null {
  if (!activeState) return null;
  const groupEpochs: E2EEVaultContents["groupEpochs"] = [];
  for (const [groupId, epochsMap] of Object.entries(activeState.groupEpochs)) {
    for (const entry of Object.values(epochsMap)) {
      groupEpochs.push({
        groupId,
        epoch: entry.epoch,
        secretB64: entry.secretB64,
        createdAt: entry.createdAt,
      });
    }
  }
  return {
    v: 1,
    userId: activeState.userId,
    primaryIdentity: activeState.primaryIdentity,
    previousIdentities: activeState.previousIdentities,
    groupEpochs,
    exportedAt: Date.now(),
  };
}

export async function markCurrentIdentityBackedUp(keyId: string): Promise<void> {
  if (!activeState) return;
  activeState = {
    ...activeState,
    backedUpKeyId: keyId,
  };
  await writePersistedState(activeState);
  notifyListeners();
}

export async function importRestoredVaultContents(contents: E2EEVaultContents): Promise<void> {
  if (!activeState || contents.userId !== activeState.userId) {
    throw new Error("This E2EE backup belongs to a different JaText account.");
  }

  // Keep any locally-generated temporary identity in previousIdentities so ZERO messages are lost!
  const mergedPrevMap = new Map<string, StoredIdentityRecord>();
  if (activeState.primaryIdentity.keyId !== contents.primaryIdentity.keyId) {
    mergedPrevMap.set(activeState.primaryIdentity.keyId, activeState.primaryIdentity);
  }
  for (const prev of activeState.previousIdentities) {
    if (prev.keyId !== contents.primaryIdentity.keyId) {
      mergedPrevMap.set(prev.keyId, prev);
    }
  }
  for (const prev of contents.previousIdentities) {
    if (prev.keyId !== contents.primaryIdentity.keyId) {
      mergedPrevMap.set(prev.keyId, prev);
    }
  }

  const myFingerprint = await computeKeyFingerprint(
    contents.primaryIdentity.dhPubB64,
    contents.primaryIdentity.sigPubB64,
  );

  // Recompute safety numbers with restored primary identity for all known peers
  const updatedPeers: Record<string, PeerKeyEntry> = {};
  for (const [peerId, entry] of Object.entries(activeState.peerKeys)) {
    const safetyNumber = await computeSafetyNumber(
      {
        userId: activeState.userId,
        dhPubB64: contents.primaryIdentity.dhPubB64,
        sigPubB64: contents.primaryIdentity.sigPubB64,
      },
      {
        userId: entry.bundle.userId,
        dhPubB64: entry.bundle.dhPubB64,
        sigPubB64: entry.bundle.sigPubB64,
      },
    );
    updatedPeers[peerId] = { ...entry, safetyNumber };
  }

  const mergedGroups: Record<string, Record<number, GroupEpochEntry>> = {
    ...activeState.groupEpochs,
  };
  for (const ge of contents.groupEpochs) {
    const fp = await computeGroupEpochFingerprint(ge.groupId, ge.epoch, ge.secretB64);
    mergedGroups[ge.groupId] = {
      ...(mergedGroups[ge.groupId] ?? {}),
      [ge.epoch]: {
        groupId: ge.groupId,
        epoch: ge.epoch,
        secretB64: ge.secretB64,
        fingerprint: fp,
        createdAt: ge.createdAt,
      },
    };
  }

  activeState = {
    userId: activeState.userId,
    primaryIdentity: contents.primaryIdentity,
    previousIdentities: Array.from(mergedPrevMap.values()),
    myFingerprint,
    peerKeys: updatedPeers,
    groupEpochs: mergedGroups,
    backedUpKeyId: contents.primaryIdentity.keyId,
  };
  decryptedMessageCache.clear();
  await writePersistedState(activeState);
  notifyListeners();
}

/* ------------------------------------------------------------------ */
/* Fast 60-FPS Decryption & Decrypted Media ObjectURL Caches           */
/* ------------------------------------------------------------------ */

export interface CachedDecryptedResult {
  payload: E2EEPlainPayload | null;
  proof: MessageE2EEProof;
}

const decryptedMessageCache = new Map<string, CachedDecryptedResult>();
const inFlightDecryptions = new Map<string, Promise<CachedDecryptedResult>>();
const decryptedMediaUrlCache = new Map<string, string>();
const decryptedMediaBlobCache = new Map<string, Blob>();
const inFlightMediaDecrypts = new Map<string, Promise<string>>();

export function getCachedDecryptedMessage(cacheKey: string): CachedDecryptedResult | undefined {
  return decryptedMessageCache.get(cacheKey);
}

export function buildMessageDecryptCacheKey(
  id: string,
  rawBody: string,
  editedAt?: number,
): string {
  const stateKey = activeState?.primaryIdentity.keyId ?? "nokey";
  const tail = rawBody.slice(-28);
  return `${stateKey}:${id}:${editedAt ?? 0}:${rawBody.length}:${tail}`;
}

export async function decryptWireMessageCached(params: {
  cacheKey: string;
  rawBody: string;
  senderId: string;
  receiverId?: string;
  groupId?: string;
  fetchOverflowCiphertext?: (storageId: string) => Promise<Uint8Array<ArrayBuffer>>;
}): Promise<CachedDecryptedResult> {
  const hit = decryptedMessageCache.get(params.cacheKey);
  if (hit) return hit;

  const inflight = inFlightDecryptions.get(params.cacheKey);
  if (inflight) return inflight;

  const task = (async (): Promise<CachedDecryptedResult> => {
    const { rawBody, senderId, receiverId, groupId, fetchOverflowCiphertext } = params;
    if (!isEncryptedWireBody(rawBody)) {
      return {
        payload: null,
        proof: {
          encrypted: false,
          decrypted: true,
          signatureVerified: false,
          algorithm: "Plaintext (Legacy / Unencrypted)",
          channel: "plain",
          rawWireBody: rawBody,
        },
      };
    }

    const envelope: AnyEncryptedEnvelope | null = parseEncryptedWireBody(rawBody);
    if (!envelope || !activeState) {
      return {
        payload: null,
        proof: {
          encrypted: true,
          decrypted: false,
          signatureVerified: false,
          algorithm: "ECDH-P256 + HKDF-SHA256 + AES-256-GCM + ECDSA-P256",
          channel: envelope?.c ?? "dm",
          rawWireBody: rawBody,
          error: !activeState ? "Initializing local E2EE keystore…" : "Invalid E2EE wire envelope.",
        },
      };
    }

    try {
      if (envelope.c === "dm") {
        const peerId = senderId === activeState.userId ? (receiverId ?? "") : senderId;
        const peerPublic =
          peerId === activeState.userId
            ? toPublicIdentityBundle(activeState.primaryIdentity)
            : activeState.peerKeys[peerId]?.bundle ?? null;

        const { payload, signatureVerified } = await decryptDmEnvelope({
          envelope,
          myIdentities: getAllMyIdentities(activeState),
          peerPublic,
          myUserId: activeState.userId,
          senderId,
          receiverId: receiverId ?? "",
          fetchOverflowCiphertext,
        });
        const res: CachedDecryptedResult = {
          payload,
          proof: {
            encrypted: true,
            decrypted: true,
            signatureVerified,
            algorithm: "ECDH P-256 + HKDF-SHA-256 + AES-256-GCM + ECDSA P-256",
            channel: "dm",
            senderKeyId: envelope.sk,
            receiverKeyId: envelope.rk,
            ephemeralPublicKey: envelope.epk,
            iv: envelope.iv,
            signature: envelope.sig,
            rawWireBody: rawBody,
            attachmentEncrypted: Boolean(payload.att || payload.stk?.att),
          },
        };
        decryptedMessageCache.set(params.cacheKey, res);
        notifyListeners();
        return res;
      } else {
        const gid = groupId ?? "";
        const epochEntry = activeState.groupEpochs[gid]?.[envelope.ep];
        if (!epochEntry) {
          return {
            payload: null,
            proof: {
              encrypted: true,
              decrypted: false,
              signatureVerified: false,
              algorithm: "Group Epoch HKDF-SHA-256 + AES-256-GCM + ECDSA P-256",
              channel: "grp",
              senderKeyId: envelope.sk,
              groupEpoch: envelope.ep,
              iv: envelope.iv,
              signature: envelope.sig,
              rawWireBody: rawBody,
              error: `Waiting for Group Epoch #${envelope.ep} key…`,
            },
          };
        }
        const senderSigPub =
          senderId === activeState.userId
            ? getAllMyIdentities(activeState).find((i) => i.keyId === envelope.sk)?.sigPubB64
            : activeState.peerKeys[senderId]?.bundle.keyId === envelope.sk
              ? activeState.peerKeys[senderId]?.bundle.sigPubB64
              : undefined;

        const { payload, signatureVerified } = await decryptGroupEnvelope({
          envelope,
          groupId: gid,
          epochSecretB64: epochEntry.secretB64,
          senderId,
          senderSigPubB64: senderSigPub,
          fetchOverflowCiphertext,
        });
        const res: CachedDecryptedResult = {
          payload,
          proof: {
            encrypted: true,
            decrypted: true,
            signatureVerified,
            algorithm: "Group Epoch HKDF-SHA-256 + AES-256-GCM + ECDSA P-256",
            channel: "grp",
            senderKeyId: envelope.sk,
            groupEpoch: envelope.ep,
            iv: envelope.iv,
            signature: envelope.sig,
            rawWireBody: rawBody,
            attachmentEncrypted: Boolean(payload.att || payload.stk?.att),
          },
        };
        decryptedMessageCache.set(params.cacheKey, res);
        notifyListeners();
        return res;
      }
    } catch (err) {
      // Do NOT permanently cache transient missing-peer-key failures so once peer key arrives it decrypts immediately!
      const msg = err instanceof Error ? err.message : "Could not decrypt message.";
      const isTransientKeyWait =
        msg.includes("Waiting for") || msg.includes("not unlocked");
      const failed: CachedDecryptedResult = {
        payload: null,
        proof: {
          encrypted: true,
          decrypted: false,
          signatureVerified: false,
          algorithm:
            envelope.c === "dm"
              ? "ECDH P-256 + HKDF-SHA-256 + AES-256-GCM + ECDSA P-256"
              : "Group Epoch HKDF-SHA-256 + AES-256-GCM + ECDSA P-256",
          channel: envelope.c,
          senderKeyId: envelope.sk,
          receiverKeyId: envelope.c === "dm" ? envelope.rk : undefined,
          ephemeralPublicKey: envelope.c === "dm" ? envelope.epk : undefined,
          groupEpoch: envelope.c === "grp" ? envelope.ep : undefined,
          iv: envelope.iv,
          signature: envelope.sig,
          rawWireBody: rawBody,
          error: isTransientKeyWait
            ? msg
            : "🔒 Encrypted with a different device key — unlock your E2EE backup in Settings to read",
        },
      };
      if (!isTransientKeyWait) {
        decryptedMessageCache.set(params.cacheKey, failed);
        notifyListeners();
      }
      return failed;
    }
  })();

  inFlightDecryptions.set(params.cacheKey, task);
  try {
    return await task;
  } finally {
    inFlightDecryptions.delete(params.cacheKey);
  }
}

export function getCachedDecryptedMediaUrl(
  cipherUrl: string,
  descriptor: EncryptedBlobDescriptor,
): string | undefined {
  return decryptedMediaUrlCache.get(`${descriptor.h}:${descriptor.k}:${cipherUrl}`);
}

export function getCachedDecryptedMediaBlob(
  descriptorHash: string,
): Blob | undefined {
  return decryptedMediaBlobCache.get(descriptorHash);
}

export async function decryptRemoteAttachmentToObjectUrl(
  cipherUrl: string,
  descriptor: EncryptedBlobDescriptor,
): Promise<string> {
  const key = `${descriptor.h}:${descriptor.k}:${cipherUrl}`;
  const cached = decryptedMediaUrlCache.get(key);
  if (cached) return cached;

  const inflight = inFlightMediaDecrypts.get(key);
  if (inflight) return inflight;

  const task = (async () => {
    const res = await fetch(cipherUrl);
    if (!res.ok) throw new Error("Failed to download encrypted media.");
    const cipherBuf = new Uint8Array(await res.arrayBuffer());
    const plainBytes = await decryptAttachmentBytes(cipherBuf, descriptor);
    const cleanMime = (descriptor.t || "application/octet-stream").replace(/;jbs=[a-z0-9-]+/gi, "");
    const blob = new Blob([plainBytes], { type: cleanMime });
    const objUrl = URL.createObjectURL(blob);
    decryptedMediaUrlCache.set(key, objUrl);
    decryptedMediaBlobCache.set(descriptor.h, blob);
    notifyListeners();
    return objUrl;
  })();

  inFlightMediaDecrypts.set(key, task);
  try {
    return await task;
  } finally {
    inFlightMediaDecrypts.delete(key);
  }
}

export function clearDecryptedSessionCaches(): void {
  decryptedMessageCache.clear();
  for (const url of decryptedMediaUrlCache.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore
    }
  }
  decryptedMediaUrlCache.clear();
  decryptedMediaBlobCache.clear();
}
