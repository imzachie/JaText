import { useSyncExternalStore } from "react";
import { ensureInfiniteLoopGifBytes, sniffImageMime } from "../imageUtils";
import { fetchMediaBytesSmart } from "../tursoClient";
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
  knownBundles?: Record<string, PublicIdentityBundle>;
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
  /** Additional unwrapped secrets observed for the same (groupId, epoch) so split-brain historical messages always decrypt */
  candidateSecretsB64?: string[];
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

export interface VerifySignalPacket {
  kind: "e2ee_verify";
  v: 1;
  skid: string;
  rkid: string;
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
  if (activeUserId !== userId || (activeState && activeState.userId !== userId)) {
    activeUserId = userId;
    activeState = null;
    failedDecryptRetryAt.clear();
    notifyListeners();
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

    if (activeUserId === userId) {
      activeState = loaded;
      failedDecryptRetryAt.clear();
      notifyListeners();
    }
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
  failedDecryptRetryAt.clear();
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

export function getPeerKnownBundles(entry?: PeerKeyEntry | null): PublicIdentityBundle[] {
  if (!entry) return [];
  const map = new Map<string, PublicIdentityBundle>();
  map.set(entry.bundle.keyId, entry.bundle);
  if (entry.knownBundles) {
    for (const [k, b] of Object.entries(entry.knownBundles)) {
      if (!map.has(k)) map.set(k, b);
    }
  }
  return Array.from(map.values());
}

export function serializeVerifySignal(myKeyId: string, peerKeyId: string): string {
  const pkt: VerifySignalPacket = {
    kind: "e2ee_verify",
    v: 1,
    skid: myKeyId,
    rkid: peerKeyId,
    ts: Date.now(),
  };
  return `${E2EE_SIGNAL_PREFIX}${JSON.stringify(pkt)}`;
}

export function parseVerifySignal(body: string | null | undefined): VerifySignalPacket | null {
  if (!body || !body.startsWith(E2EE_SIGNAL_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(E2EE_SIGNAL_PREFIX.length)) as Partial<VerifySignalPacket>;
    if (
      parsed.kind !== "e2ee_verify" ||
      parsed.v !== 1 ||
      typeof parsed.skid !== "string" ||
      typeof parsed.rkid !== "string"
    ) {
      return null;
    }
    return {
      kind: "e2ee_verify",
      v: 1,
      skid: parsed.skid,
      rkid: parsed.rkid,
      ts: typeof parsed.ts === "number" ? parsed.ts : 0,
    };
  } catch {
    return null;
  }
}

export async function ingestPeerIdentityBundle(
  bundle: PublicIdentityBundle,
): Promise<PeerKeyEntry | null> {
  if (!activeState || bundle.userId === activeState.userId) return null;
  const current = activeState.peerKeys[bundle.userId];
  if (
    current &&
    current.bundle.keyId === bundle.keyId &&
    current.knownBundles?.[bundle.keyId]
  ) {
    return current;
  }
  if (current?.knownBundles?.[bundle.keyId] && current.bundle.ts >= bundle.ts) {
    return current;
  }

  const dedupeKey = `${activeState.userId}:${bundle.userId}:${bundle.keyId}`;
  if (pendingVerifications.has(dedupeKey)) return current ?? null;
  pendingVerifications.add(dedupeKey);

  try {
    const valid = await verifyPublicIdentityBundle(bundle);
    if (!valid) return current ?? null;
    if (!activeState) return null;

    const prevEntry = activeState.peerKeys[bundle.userId];
    const mergedKnown: Record<string, PublicIdentityBundle> = {
      ...(prevEntry?.knownBundles ?? {}),
      ...(prevEntry ? { [prevEntry.bundle.keyId]: prevEntry.bundle } : {}),
      [bundle.keyId]: bundle,
    };

    // Keep newest bundle as primary while retaining ALL sibling/historical device bundles in knownBundles!
    const shouldPromotePrimary =
      !prevEntry || bundle.ts === 0 || prevEntry.bundle.ts === 0 || bundle.ts >= prevEntry.bundle.ts;
    const activeBundle = shouldPromotePrimary ? bundle : prevEntry.bundle;

    const [fingerprint, safetyNumber] = await Promise.all([
      computeKeyFingerprint(activeBundle.dhPubB64, activeBundle.sigPubB64),
      computeSafetyNumber(
        {
          userId: activeState.userId,
          dhPubB64: activeState.primaryIdentity.dhPubB64,
          sigPubB64: activeState.primaryIdentity.sigPubB64,
        },
        {
          userId: activeBundle.userId,
          dhPubB64: activeBundle.dhPubB64,
          sigPubB64: activeBundle.sigPubB64,
        },
      ),
    ]);

    const changed = Boolean(prevEntry && prevEntry.bundle.keyId !== activeBundle.keyId);
    const preserveVerified =
      prevEntry?.verifiedKeyId &&
      (prevEntry.verifiedKeyId === activeBundle.keyId || Boolean(mergedKnown[prevEntry.verifiedKeyId]))
        ? activeBundle.keyId
        : undefined;
    const nextEntry: PeerKeyEntry = {
      bundle: activeBundle,
      knownBundles: mergedKnown,
      fingerprint,
      safetyNumber,
      verifiedKeyId: preserveVerified,
      previousKeyId: changed ? prevEntry?.bundle.keyId : prevEntry?.previousKeyId,
      keyChangedAt: changed && !preserveVerified ? Date.now() : prevEntry?.keyChangedAt,
    };

    activeState = {
      ...activeState,
      peerKeys: {
        ...activeState.peerKeys,
        [bundle.userId]: nextEntry,
      },
    };
    clearFailedDecryptionEntries();
    await writePersistedState(activeState);
    notifyListeners();
    return nextEntry;
  } finally {
    pendingVerifications.delete(dedupeKey);
  }
}

export async function setPeerVerifiedState(
  peerUserId: string,
  verified: boolean,
): Promise<boolean> {
  if (!activeState) return false;
  const entry = activeState.peerKeys[peerUserId];
  if (!entry) return false;
  const targetVerified = verified ? entry.bundle.keyId : undefined;
  if (entry.verifiedKeyId === targetVerified) return verified;
  const updated: PeerKeyEntry = {
    ...entry,
    verifiedKeyId: targetVerified,
    keyChangedAt: verified ? undefined : entry.keyChangedAt,
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
  return verified;
}

export async function togglePeerVerified(peerUserId: string): Promise<boolean> {
  if (!activeState) return false;
  const entry = activeState.peerKeys[peerUserId];
  if (!entry) return false;
  const nowVerified = entry.verifiedKeyId !== entry.bundle.keyId;
  return setPeerVerifiedState(peerUserId, nowVerified);
}

export function getGroupEpochAllSecrets(entry?: GroupEpochEntry | null): string[] {
  if (!entry) return [];
  const out: string[] = [];
  for (const s of [entry.secretB64, ...(entry.candidateSecretsB64 ?? [])]) {
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

const packetSecretByEpk = new Map<string, string>();
const checkedGroupKeyPackets = new Set<string>();

export function recordPacketSecretB64(epk: string, secretB64: string): void {
  if (epk && secretB64) {
    packetSecretByEpk.set(epk, secretB64);
  }
}

export function getKnownPacketSecretB64(epk: string): string | undefined {
  return packetSecretByEpk.get(epk);
}

export async function storeGroupEpochSecret(
  groupId: string,
  epoch: number,
  secretB64: string,
  options?: { preferExistingPrimary?: boolean },
): Promise<GroupEpochEntry | null> {
  if (!activeState) return null;
  const existing = activeState.groupEpochs[groupId]?.[epoch];
  const existingAll = getGroupEpochAllSecrets(existing);
  const preferExisting = Boolean(options?.preferExistingPrimary);

  if (existing && existingAll.includes(secretB64)) {
    if (preferExisting || existing.secretB64 === secretB64) {
      return existing;
    }
  }

  const primarySecret = existing && preferExisting ? existing.secretB64 : secretB64;
  const mergedCandidates: string[] = [];
  for (const s of [primarySecret, ...existingAll, secretB64]) {
    if (s && !mergedCandidates.includes(s)) {
      mergedCandidates.push(s);
    }
  }

  const fingerprint =
    existing && existing.secretB64 === primarySecret
      ? existing.fingerprint
      : await computeGroupEpochFingerprint(groupId, epoch, primarySecret);
  if (!activeState) return null;

  const entry: GroupEpochEntry = {
    groupId,
    epoch,
    secretB64: primarySecret,
    candidateSecretsB64: mergedCandidates.length > 1 ? mergedCandidates : undefined,
    fingerprint,
    createdAt: existing?.createdAt ?? Date.now(),
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
  clearFailedDecryptionEntries();
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
  const myIdentities = getAllMyIdentities(activeState);
  const checkKey = `${activeState.userId}:${packet.gid}:${packet.ep}:${packet.epk}:${myIdentities
    .map((i) => i.keyId)
    .join(",")}`;
  if (checkedGroupKeyPackets.has(checkKey)) {
    return false;
  }

  const peerCandidates =
    senderId === activeState.userId
      ? myIdentities.map(toPublicIdentityBundle)
      : getPeerKnownBundles(activeState.peerKeys[senderId]);

  const matchingSenderKey =
    peerCandidates.find((b) => b.keyId === packet.skid) ?? null;
  const candidatePublicList: (PublicIdentityBundle | null)[] = matchingSenderKey
    ? [matchingSenderKey, null]
    : [null];

  for (const candidatePublic of candidatePublicList) {
    try {
      const unwrapped = await unwrapGroupKeySignalPacket({
        packet,
        senderId,
        senderPublic: candidatePublic,
        myUserId: activeState.userId,
        myIdentities,
      });
      if (unwrapped) {
        checkedGroupKeyPackets.add(checkKey);
        recordPacketSecretB64(packet.epk, unwrapped);
        const alreadyKnown = getGroupEpochAllSecrets(
          activeState?.groupEpochs[packet.gid]?.[packet.ep],
        ).includes(unwrapped);
        await storeGroupEpochSecret(packet.gid, packet.ep, unwrapped, {
          preferExistingPrimary: true,
        });
        if (!alreadyKnown) {
          clearFailedDecryptionEntries();
          return true;
        }
        return false;
      }
    } catch {
      // Try next candidate
    }
  }
  checkedGroupKeyPackets.add(checkKey);
  return false;
}

/* ------------------------------------------------------------------ */
/* Vault Export & Multi-Device Restore                                 */
/* ------------------------------------------------------------------ */

export function exportCurrentVaultContents(): E2EEVaultContents | null {
  if (!activeState) return null;
  const groupEpochs: E2EEVaultContents["groupEpochs"] = [];
  for (const [groupId, epochsMap] of Object.entries(activeState.groupEpochs)) {
    for (const entry of Object.values(epochsMap)) {
      for (const secretB64 of getGroupEpochAllSecrets(entry)) {
        groupEpochs.push({
          groupId,
          epoch: entry.epoch,
          secretB64,
          createdAt: entry.createdAt,
        });
      }
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
    const prevEp = mergedGroups[ge.groupId]?.[ge.epoch];
    const combined: string[] = [];
    for (const s of [ge.secretB64, ...getGroupEpochAllSecrets(prevEp)]) {
      if (s && !combined.includes(s)) combined.push(s);
    }
    const primary = combined[0] ?? ge.secretB64;
    const fp = await computeGroupEpochFingerprint(ge.groupId, ge.epoch, primary);
    mergedGroups[ge.groupId] = {
      ...(mergedGroups[ge.groupId] ?? {}),
      [ge.epoch]: {
        groupId: ge.groupId,
        epoch: ge.epoch,
        secretB64: primary,
        candidateSecretsB64: combined.length > 1 ? combined : undefined,
        fingerprint: fp,
        createdAt: prevEp ? Math.min(prevEp.createdAt, ge.createdAt) : ge.createdAt,
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
  decryptedByWireCache.clear();
  failedDecryptRetryAt.clear();
  await writePersistedState(activeState);
  notifyListeners();
}

/**
 * Automatically merge remote account keyring with local state so all devices logged into
 * the same JaText account converge on one canonical primaryIdentity + full historical keyring!
 */
export async function mergeAutoSyncedKeyring(
  remote: E2EEVaultContents,
): Promise<{ changedLocal: boolean; needsRemotePush: boolean }> {
  if (!activeState || remote.userId !== activeState.userId) {
    return { changedLocal: false, needsRemotePush: false };
  }

  const localAll = getAllMyIdentities(activeState);
  const remoteAll = [remote.primaryIdentity, ...remote.previousIdentities];
  const byKeyId = new Map<string, StoredIdentityRecord>();
  for (const id of [...remoteAll, ...localAll]) {
    if (id?.keyId && id.dhPrivPkcs8B64 && !byKeyId.has(id.keyId)) {
      byKeyId.set(id.keyId, id);
    }
  }

  const sortedAll = Array.from(byKeyId.values()).sort((a, b) => {
    const ta = a.createdAt || Number.MAX_SAFE_INTEGER;
    const tb = b.createdAt || Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return a.keyId.localeCompare(b.keyId);
  });
  const canonicalPrimary = sortedAll[0] ?? activeState.primaryIdentity;
  const canonicalPrevious = sortedAll
    .filter((i) => i.keyId !== canonicalPrimary.keyId)
    .slice(0, 32);

  const remoteKeySet = new Set(remoteAll.map((i) => i.keyId));
  const localKeySet = new Set(localAll.map((i) => i.keyId));

  let changedLocal =
    activeState.primaryIdentity.keyId !== canonicalPrimary.keyId ||
    sortedAll.some((i) => !localKeySet.has(i.keyId));
  let needsRemotePush =
    remote.primaryIdentity.keyId !== canonicalPrimary.keyId ||
    sortedAll.some((i) => !remoteKeySet.has(i.keyId));

  const mergedGroups: Record<string, Record<number, GroupEpochEntry>> = {
    ...activeState.groupEpochs,
  };
  for (const ge of remote.groupEpochs) {
    const existingEp = mergedGroups[ge.groupId]?.[ge.epoch];
    const existingAll = getGroupEpochAllSecrets(existingEp);
    if (!existingEp || !existingAll.includes(ge.secretB64)) {
      changedLocal = true;
      const primary = existingEp ? existingEp.secretB64 : ge.secretB64;
      const combined: string[] = [];
      for (const s of [primary, ...existingAll, ge.secretB64]) {
        if (s && !combined.includes(s)) combined.push(s);
      }
      const fp =
        existingEp && existingEp.secretB64 === primary
          ? existingEp.fingerprint
          : await computeGroupEpochFingerprint(ge.groupId, ge.epoch, primary);
      mergedGroups[ge.groupId] = {
        ...(mergedGroups[ge.groupId] ?? {}),
        [ge.epoch]: {
          groupId: ge.groupId,
          epoch: ge.epoch,
          secretB64: primary,
          candidateSecretsB64: combined.length > 1 ? combined : undefined,
          fingerprint: fp,
          createdAt: existingEp ? Math.min(existingEp.createdAt, ge.createdAt) : ge.createdAt,
        },
      };
    }
  }

  const remoteGroupSecrets = new Set(
    remote.groupEpochs.map((g) => `${g.groupId}:${g.epoch}:${g.secretB64}`),
  );
  for (const [gid, epMap] of Object.entries(mergedGroups)) {
    for (const entry of Object.values(epMap)) {
      for (const s of getGroupEpochAllSecrets(entry)) {
        if (!remoteGroupSecrets.has(`${gid}:${entry.epoch}:${s}`)) {
          needsRemotePush = true;
        }
      }
    }
  }

  if (changedLocal) {
    const myFingerprint = await computeKeyFingerprint(
      canonicalPrimary.dhPubB64,
      canonicalPrimary.sigPubB64,
    );
    const updatedPeers: Record<string, PeerKeyEntry> = {};
    for (const [peerId, entry] of Object.entries(activeState.peerKeys)) {
      const safetyNumber = await computeSafetyNumber(
        {
          userId: activeState.userId,
          dhPubB64: canonicalPrimary.dhPubB64,
          sigPubB64: canonicalPrimary.sigPubB64,
        },
        {
          userId: entry.bundle.userId,
          dhPubB64: entry.bundle.dhPubB64,
          sigPubB64: entry.bundle.sigPubB64,
        },
      );
      updatedPeers[peerId] = { ...entry, safetyNumber };
    }

    activeState = {
      userId: activeState.userId,
      primaryIdentity: canonicalPrimary,
      previousIdentities: canonicalPrevious,
      myFingerprint,
      peerKeys: updatedPeers,
      groupEpochs: mergedGroups,
      backedUpKeyId: canonicalPrimary.keyId,
    };
    decryptedMessageCache.clear();
    decryptedByWireCache.clear();
    failedDecryptRetryAt.clear();
    await writePersistedState(activeState);
    notifyListeners();
  }

  return { changedLocal, needsRemotePush };
}

/* ------------------------------------------------------------------ */
/* Fast 60-FPS Decryption & Decrypted Media ObjectURL Caches           */
/* ------------------------------------------------------------------ */

export interface CachedDecryptedResult {
  payload: E2EEPlainPayload | null;
  proof: MessageE2EEProof;
}

const decryptedMessageCache = new Map<string, CachedDecryptedResult>();
const decryptedByWireCache = new Map<string, CachedDecryptedResult>();
const failedDecryptRetryAt = new Map<string, { res: CachedDecryptedResult; retryAt: number }>();
const inFlightDecryptions = new Map<string, Promise<CachedDecryptedResult>>();
const decryptedMediaUrlCache = new Map<string, string>();
const preseededMediaUrlByHash = new Map<string, string>();
const decryptedMediaBlobCache = new Map<string, Blob>();
const inFlightMediaDecrypts = new Map<string, Promise<string>>();

function buildWireContentCacheKey(rawBody: string): string {
  return `${rawBody.length}:${rawBody.slice(0, 96)}:${rawBody.slice(-96)}`;
}

export function seedOutgoingDecryptedWire(
  rawBody: string,
  payload: E2EEPlainPayload,
  proof: MessageE2EEProof,
): void {
  if (!rawBody) return;
  const res: CachedDecryptedResult = { payload, proof };
  decryptedByWireCache.set(buildWireContentCacheKey(rawBody), res);
  if (decryptedByWireCache.size > 2000) {
    const oldestKey = decryptedByWireCache.keys().next().value;
    if (oldestKey !== undefined) decryptedByWireCache.delete(oldestKey);
  }
}

export function seedOutgoingDecryptedMedia(
  descriptor: EncryptedBlobDescriptor,
  plainBytes: Uint8Array<ArrayBuffer>,
): void {
  if (!descriptor?.h || preseededMediaUrlByHash.has(descriptor.h)) return;
  const sniffed = sniffImageMime(plainBytes.subarray(0, 32));
  const rawMime = (descriptor.t || "application/octet-stream").replace(/;jbs=[a-z0-9-]+/gi, "");
  const cleanMime = sniffed === "image/gif" ? "image/gif" : rawMime === "application/octet-stream" && sniffed ? sniffed : rawMime;
  const finalBytes = cleanMime === "image/gif" ? ensureInfiniteLoopGifBytes(plainBytes) : plainBytes;
  const safeCopy = new Uint8Array(finalBytes.byteLength);
  safeCopy.set(finalBytes);
  const blob = new Blob([safeCopy], { type: cleanMime });
  const objUrl = URL.createObjectURL(blob);
  preseededMediaUrlByHash.set(descriptor.h, objUrl);
  decryptedMediaBlobCache.set(descriptor.h, blob);
}

function clearFailedDecryptionEntries(): void {
  failedDecryptRetryAt.clear();
  for (const [k, v] of decryptedMessageCache.entries()) {
    if (!v.proof.decrypted) {
      decryptedMessageCache.delete(k);
    }
  }
}

export function getCachedDecryptedMessage(
  cacheKey: string,
  rawBody?: string,
): CachedDecryptedResult | undefined {
  const hit = decryptedMessageCache.get(cacheKey);
  if (hit) return hit;
  if (rawBody) {
    const wireHit = decryptedByWireCache.get(buildWireContentCacheKey(rawBody));
    if (wireHit) {
      decryptedMessageCache.set(cacheKey, wireHit);
      return wireHit;
    }
  }
  const failed = failedDecryptRetryAt.get(cacheKey);
  if (failed && Date.now() < failed.retryAt) {
    return failed.res;
  }
  return undefined;
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

  if (params.rawBody) {
    const wireHit = decryptedByWireCache.get(buildWireContentCacheKey(params.rawBody));
    if (wireHit) {
      decryptedMessageCache.set(params.cacheKey, wireHit);
      return wireHit;
    }
  }

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
        const peerEntry = activeState.peerKeys[peerId];
        const peerPublic =
          peerId === activeState.userId
            ? toPublicIdentityBundle(activeState.primaryIdentity)
            : peerEntry?.bundle ?? null;
        const peerPublicCandidates =
          peerId === activeState.userId
            ? getAllMyIdentities(activeState).map(toPublicIdentityBundle)
            : getPeerKnownBundles(peerEntry);

        const { payload, signatureVerified } = await decryptDmEnvelope({
          envelope,
          myIdentities: getAllMyIdentities(activeState),
          peerPublic,
          peerPublicCandidates,
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
        decryptedByWireCache.set(buildWireContentCacheKey(rawBody), res);
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
            : getPeerKnownBundles(activeState.peerKeys[senderId]).find(
                (b) => b.keyId === envelope.sk,
              )?.sigPubB64;

        const { payload, signatureVerified } = await decryptGroupEnvelope({
          envelope,
          groupId: gid,
          epochSecretB64: epochEntry.secretB64,
          epochSecretsB64: getGroupEpochAllSecrets(epochEntry),
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
        decryptedByWireCache.set(buildWireContentCacheKey(rawBody), res);
        notifyListeners();
        return res;
      }
    } catch (err) {
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
            ? "Syncing encryption key…"
            : "Waiting for this message…",
        },
      };
      failedDecryptRetryAt.set(params.cacheKey, {
        res: failed,
        retryAt: Date.now() + (isTransientKeyWait ? 1500 : 4000),
      });
      notifyListeners();
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
  const key = `${descriptor.h}:${descriptor.k}:${cipherUrl}`;
  const direct = decryptedMediaUrlCache.get(key);
  if (direct) return direct;
  const preseeded = preseededMediaUrlByHash.get(descriptor.h);
  if (preseeded) {
    decryptedMediaUrlCache.set(key, preseeded);
    return preseeded;
  }
  return undefined;
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
  const cached = getCachedDecryptedMediaUrl(cipherUrl, descriptor);
  if (cached) return cached;

  const inflight = inFlightMediaDecrypts.get(key);
  if (inflight) return inflight;

  const task = (async () => {
    const cipherBuf = await fetchMediaBytesSmart(cipherUrl);
    const plainBytes = await decryptAttachmentBytes(cipherBuf, descriptor);
    const sniffed = sniffImageMime(plainBytes.subarray(0, 32));
    const rawMime = (descriptor.t || "application/octet-stream").replace(/;jbs=[a-z0-9-]+/gi, "");
    const cleanMime = sniffed === "image/gif" ? "image/gif" : rawMime === "application/octet-stream" && sniffed ? sniffed : rawMime;
    const finalBytes = cleanMime === "image/gif" ? ensureInfiniteLoopGifBytes(plainBytes) : plainBytes;
    const safeCopy = new Uint8Array(finalBytes.byteLength);
    safeCopy.set(finalBytes);
    const blob = new Blob([safeCopy], { type: cleanMime });
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
  decryptedByWireCache.clear();
  for (const url of new Set([
    ...decryptedMediaUrlCache.values(),
    ...preseededMediaUrlByHash.values(),
  ])) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore
    }
  }
  decryptedMediaUrlCache.clear();
  preseededMediaUrlByHash.clear();
  decryptedMediaBlobCache.clear();
}
