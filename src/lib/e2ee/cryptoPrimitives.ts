/**
 * Real End-to-End Encryption (E2EE) Cryptographic Primitives for JaText.
 *
 * All cryptographic operations execute strictly on-device via the native
 * W3C Web Cryptography API (`window.crypto.subtle`):
 * - Identity Key Agreement: ECDH over NIST P-256
 * - Identity Digital Signatures: ECDSA over NIST P-256 with SHA-256
 * - Key Derivation: HKDF-SHA-256 (per-message keys & key-wrapping keys)
 * - Authenticated Symmetric Encryption: AES-256-GCM (96-bit random IV, 128-bit tag, AAD-bound)
 * - Zero-Knowledge Backup Vault KDF: PBKDF2-SHA-512 (600,000 iterations, 128-bit salt)
 * - Safety Numbers: 5,200-round iterative SHA-512 symmetric 60-digit fingerprint
 */

export const E2EE_WIRE_HEADER = "🔒 Encrypted\n__JATEXT_E2EE_V1__:";
export const E2EE_WIRE_MARKER = "__JATEXT_E2EE_V1__:";
export const E2EE_SIGNAL_PREFIX = "__JATEXT_CALL_SIG__:";
export const E2EE_VAULT_STICKER_NAME = "__jatext_e2ee_vault_v1__";
export const E2EE_DEVSYNC_REQ_PREFIX = "__jatext_e2ee_devreq_v1__:";
export const E2EE_DEVSYNC_RES_PREFIX = "__jatext_e2ee_devres_v1__:";
export const E2EE_MAX_INLINE_WIRE_CHARS = 3400;

const PBKDF2_ITERATIONS = 600_000;
const SAFETY_NUMBER_ROUNDS = 5_200;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getSubtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error("WebCrypto API (crypto.subtle) is unavailable in this environment.");
  }
  return cryptoObj.subtle;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(length);
  const out = new Uint8Array(buf);
  globalThis.crypto.getRandomValues(out);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes.buffer;
  }
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const buf = new ArrayBuffer(total);
  const out = new Uint8Array(buf);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const clean = b64url.trim().replace(/-/g, "+").replace(/_/g, "/");
  const pad = clean.length % 4 === 0 ? "" : "=".repeat(4 - (clean.length % 4));
  const binary = atob(clean + pad);
  const buf = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function sha256Bytes(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await getSubtle().digest("SHA-256", toArrayBuffer(data));
  return new Uint8Array(digest);
}

export async function sha512Bytes(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await getSubtle().digest("SHA-512", toArrayBuffer(data));
  return new Uint8Array(digest);
}

/* ------------------------------------------------------------------ */
/* Identity Keys (ECDH P-256 + ECDSA P-256)                            */
/* ------------------------------------------------------------------ */

export interface StoredIdentityRecord {
  userId: string;
  keyId: string;
  /** 65-byte raw uncompressed P-256 ECDH public key (base64url) */
  dhPubB64: string;
  /** PKCS#8 P-256 ECDH private key (base64url) */
  dhPrivPkcs8B64: string;
  /** 65-byte raw uncompressed P-256 ECDSA public key (base64url) */
  sigPubB64: string;
  /** PKCS#8 P-256 ECDSA private key (base64url) */
  sigPrivPkcs8B64: string;
  /** ECDSA P-256 signature binding userId + keyId + dhPub + sigPub */
  selfSigB64: string;
  createdAt: number;
}

export interface PublicIdentityBundle {
  userId: string;
  keyId: string;
  dhPubB64: string;
  sigPubB64: string;
  selfSigB64: string;
  ts: number;
}

function buildIdentitySignPayload(
  userId: string,
  keyId: string,
  dhPubB64: string,
  sigPubB64: string,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(`JaText-IK-v1|${userId}|${keyId}|${dhPubB64}|${sigPubB64}`) as Uint8Array<ArrayBuffer>;
}

export async function computeKeyIdFromPublicKeys(
  dhPubB64: string,
  sigPubB64: string,
): Promise<string> {
  const hash = await sha256Bytes(encoder.encode(`JaText-KeyID-v1|${dhPubB64}|${sigPubB64}`));
  return bytesToHex(hash.subarray(0, 8));
}

export async function computeKeyFingerprint(
  dhPubB64: string,
  sigPubB64: string,
): Promise<string> {
  const hash = await sha256Bytes(encoder.encode(`JaText-KeyFP-v1|${dhPubB64}|${sigPubB64}`));
  const hex = bytesToHex(hash).toUpperCase();
  const groups: string[] = [];
  for (let i = 0; i < 32; i += 4) {
    groups.push(hex.slice(i, i + 4));
  }
  return groups.join(" · ");
}

export async function generateIdentityRecord(userId: string): Promise<StoredIdentityRecord> {
  const subtle = getSubtle();
  const [dhPair, sigPair] = await Promise.all([
    subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
    subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]),
  ]);

  const [dhRawPub, dhPkcs8Priv, sigRawPub, sigPkcs8Priv] = await Promise.all([
    subtle.exportKey("raw", dhPair.publicKey),
    subtle.exportKey("pkcs8", dhPair.privateKey),
    subtle.exportKey("raw", sigPair.publicKey),
    subtle.exportKey("pkcs8", sigPair.privateKey),
  ]);

  const dhPubB64 = bytesToBase64Url(new Uint8Array(dhRawPub));
  const dhPrivPkcs8B64 = bytesToBase64Url(new Uint8Array(dhPkcs8Priv));
  const sigPubB64 = bytesToBase64Url(new Uint8Array(sigRawPub));
  const sigPrivPkcs8B64 = bytesToBase64Url(new Uint8Array(sigPkcs8Priv));
  const keyId = await computeKeyIdFromPublicKeys(dhPubB64, sigPubB64);

  const payload = buildIdentitySignPayload(userId, keyId, dhPubB64, sigPubB64);
  const sigBuf = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    sigPair.privateKey,
    payload,
  );
  const selfSigB64 = bytesToBase64Url(new Uint8Array(sigBuf));

  return {
    userId,
    keyId,
    dhPubB64,
    dhPrivPkcs8B64,
    sigPubB64,
    sigPrivPkcs8B64,
    selfSigB64,
    createdAt: Date.now(),
  };
}

export function toPublicIdentityBundle(record: StoredIdentityRecord): PublicIdentityBundle {
  return {
    userId: record.userId,
    keyId: record.keyId,
    dhPubB64: record.dhPubB64,
    sigPubB64: record.sigPubB64,
    selfSigB64: record.selfSigB64,
    ts: record.createdAt,
  };
}

async function importEcdhPublicKey(rawB64: string): Promise<CryptoKey> {
  return getSubtle().importKey(
    "raw",
    toArrayBuffer(base64UrlToBytes(rawB64)),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

async function importEcdhPrivateKey(pkcs8B64: string): Promise<CryptoKey> {
  return getSubtle().importKey(
    "pkcs8",
    toArrayBuffer(base64UrlToBytes(pkcs8B64)),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
}

async function importEcdsaPublicKey(rawB64: string): Promise<CryptoKey> {
  return getSubtle().importKey(
    "raw",
    toArrayBuffer(base64UrlToBytes(rawB64)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

async function importEcdsaPrivateKey(pkcs8B64: string): Promise<CryptoKey> {
  return getSubtle().importKey(
    "pkcs8",
    toArrayBuffer(base64UrlToBytes(pkcs8B64)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

export async function verifyPublicIdentityBundle(
  bundle: PublicIdentityBundle,
): Promise<boolean> {
  try {
    if (!bundle.userId || !bundle.keyId || !bundle.dhPubB64 || !bundle.sigPubB64 || !bundle.selfSigB64) {
      return false;
    }
    const expectedKeyId = await computeKeyIdFromPublicKeys(bundle.dhPubB64, bundle.sigPubB64);
    if (expectedKeyId !== bundle.keyId) return false;

    // Validate both curve points import cleanly on P-256
    const [, sigPubKey] = await Promise.all([
      importEcdhPublicKey(bundle.dhPubB64),
      importEcdsaPublicKey(bundle.sigPubB64),
    ]);

    const payload = buildIdentitySignPayload(
      bundle.userId,
      bundle.keyId,
      bundle.dhPubB64,
      bundle.sigPubB64,
    );
    return await getSubtle().verify(
      { name: "ECDSA", hash: "SHA-256" },
      sigPubKey,
      toArrayBuffer(base64UrlToBytes(bundle.selfSigB64)),
      payload,
    );
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 60-Digit Safety Number (Signal-style symmetric iterative SHA-512)   */
/* ------------------------------------------------------------------ */

export async function computeSafetyNumber(
  a: { userId: string; dhPubB64: string; sigPubB64: string },
  b: { userId: string; dhPubB64: string; sigPubB64: string },
): Promise<string> {
  async function sideDigest(side: { userId: string; dhPubB64: string; sigPubB64: string }) {
    const seed = encoder.encode(
      `JaText-SafetySide-v1|${side.userId}|${side.dhPubB64}|${side.sigPubB64}`,
    );
    let current = seed as Uint8Array;
    for (let i = 0; i < SAFETY_NUMBER_ROUNDS; i++) {
      current = await sha512Bytes(concatBytes(current, seed));
    }
    // 6 chunks of 5 digits = 30 digits per participant
    const chunks: string[] = [];
    for (let offset = 0; offset < 30; offset += 5) {
      const value =
        ((BigInt(current[offset]) << 32n) |
          (BigInt(current[offset + 1]) << 24n) |
          (BigInt(current[offset + 2]) << 16n) |
          (BigInt(current[offset + 3]) << 8n) |
          BigInt(current[offset + 4])) %
        100_000n;
      chunks.push(value.toString().padStart(5, "0"));
    }
    return { sortKey: `${side.userId}|${side.dhPubB64}`, chunks };
  }

  const [da, db] = await Promise.all([sideDigest(a), sideDigest(b)]);
  const ordered = da.sortKey <= db.sortKey ? [...da.chunks, ...db.chunks] : [...db.chunks, ...da.chunks];
  return ordered.join(" ");
}

/* ------------------------------------------------------------------ */
/* HKDF-SHA-256 + AES-256-GCM Helpers                                  */
/* ------------------------------------------------------------------ */

async function hkdfDeriveAesGcmKey(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: string,
  usages: KeyUsage[] = ["encrypt", "decrypt"],
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey("raw", toArrayBuffer(ikm), "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(encoder.encode(info)),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

async function ecdhSharedBytes(privKey: CryptoKey, pubKey: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const bits = await getSubtle().deriveBits(
    { name: "ECDH", public: pubKey },
    privKey,
    256,
  );
  return new Uint8Array(bits);
}

/* ------------------------------------------------------------------ */
/* Binary Attachment / Spill Blob AES-256-GCM Encryption               */
/* ------------------------------------------------------------------ */

export interface EncryptedBlobDescriptor {
  /** 32-byte AES-256 key (base64url) */
  k: string;
  /** 12-byte random IV (base64url) */
  iv: string;
  /** Original filename */
  n: string;
  /** Original MIME type */
  t: string;
  /** Original plaintext byte size */
  sz: number;
  /** SHA-256 of ciphertext bytes (base64url) */
  h: string;
}

export async function encryptAttachmentBytes(
  plainBytes: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<{ ciphertextBytes: Uint8Array<ArrayBuffer>; descriptor: EncryptedBlobDescriptor }> {
  const subtle = getSubtle();
  const rawKey = randomBytes(32);
  const iv = randomBytes(12);
  const aesKey = await subtle.importKey(
    "raw",
    toArrayBuffer(rawKey),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const aad = encoder.encode(`JaText-Blob-v1|${mimeType}|${plainBytes.byteLength}`);
  const ctBuf = await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: toArrayBuffer(aad) },
    aesKey,
    toArrayBuffer(plainBytes),
  );
  const ciphertextBytes = new Uint8Array(ctBuf);
  const hashBytes = await sha256Bytes(ciphertextBytes);

  return {
    ciphertextBytes,
    descriptor: {
      k: bytesToBase64Url(rawKey),
      iv: bytesToBase64Url(iv),
      n: fileName,
      t: mimeType || "application/octet-stream",
      sz: plainBytes.byteLength,
      h: bytesToBase64Url(hashBytes),
    },
  };
}

export async function decryptAttachmentBytes(
  ciphertextBytes: Uint8Array,
  descriptor: EncryptedBlobDescriptor,
): Promise<Uint8Array<ArrayBuffer>> {
  const actualHash = bytesToBase64Url(await sha256Bytes(ciphertextBytes));
  if (actualHash !== descriptor.h) {
    throw new Error("Encrypted attachment integrity check (SHA-256) failed.");
  }
  const subtle = getSubtle();
  const aesKey = await subtle.importKey(
    "raw",
    toArrayBuffer(base64UrlToBytes(descriptor.k)),
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const aad = encoder.encode(`JaText-Blob-v1|${descriptor.t}|${descriptor.sz}`);
  const plainBuf = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(base64UrlToBytes(descriptor.iv)),
      additionalData: toArrayBuffer(aad),
    },
    aesKey,
    toArrayBuffer(ciphertextBytes),
  );
  return new Uint8Array(plainBuf);
}

/* ------------------------------------------------------------------ */
/* Encrypted Payload & Wire Envelopes (1:1 DM & Group Epoch)           */
/* ------------------------------------------------------------------ */

export interface E2EEPlainPayload {
  v: 1;
  /** Original message text / control body */
  b: string;
  /** Encrypted attachment descriptor when attachmentId holds AES-GCM ciphertext */
  att?: EncryptedBlobDescriptor;
  /** When text itself > 3,000 chars and no separate file was attached, attachmentId holds encrypted UTF-8 text */
  msgBlob?: EncryptedBlobDescriptor;
  /** Encrypted sticker/GIF metadata */
  stk?: {
    url?: string;
    storageId?: string;
    att?: EncryptedBlobDescriptor;
    n: string;
    key: string;
    mt: "gif" | "sticker" | "image";
  };
}

export interface DMEncryptedEnvelope {
  v: 1;
  c: "dm";
  /** Sender identity keyId */
  sk: string;
  /** Receiver identity keyId */
  rk: string;
  /** Ephemeral P-256 ECDH public key (65 bytes, b64url) */
  epk: string;
  /** Receiver-wrapped 32-byte CEK: iv(12B) || ct+tag(48B) */
  wr: string;
  /** Sender-wrapped 32-byte CEK (multi-device self-decryption): iv(12B) || ct+tag(48B) */
  ws: string;
  /** Payload 12-byte IV */
  iv: string;
  /** Inline AES-256-GCM ciphertext (omitted when spilled to encrypted blob) */
  ct?: string;
  /** Spill descriptor when ciphertext > E2EE_MAX_INLINE_WIRE_CHARS */
  ovf?: {
    sid: string;
    h: string;
  };
  /** Sender ECDSA P-256 signature */
  sig: string;
}

export interface GroupEncryptedEnvelope {
  v: 1;
  c: "grp";
  /** Group key epoch */
  ep: number;
  /** Sender identity keyId */
  sk: string;
  /** Per-message 16-byte HKDF salt */
  s: string;
  /** Payload 12-byte IV */
  iv: string;
  /** Inline AES-256-GCM ciphertext */
  ct?: string;
  /** Spill descriptor when ciphertext > E2EE_MAX_INLINE_WIRE_CHARS */
  ovf?: {
    sid: string;
    h: string;
  };
  /** Sender ECDSA P-256 signature */
  sig: string;
}

export type AnyEncryptedEnvelope = DMEncryptedEnvelope | GroupEncryptedEnvelope;

export function isEncryptedWireBody(body?: string | null): boolean {
  if (!body) return false;
  return body.includes(E2EE_WIRE_MARKER);
}

export function parseEncryptedWireBody(body?: string | null): AnyEncryptedEnvelope | null {
  if (!body) return null;
  const idx = body.indexOf(E2EE_WIRE_MARKER);
  if (idx === -1) return null;
  const rawJson = body.slice(idx + E2EE_WIRE_MARKER.length).trim();
  try {
    const parsed = JSON.parse(rawJson) as AnyEncryptedEnvelope;
    if (!parsed || parsed.v !== 1 || (parsed.c !== "dm" && parsed.c !== "grp")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function serializeEncryptedWireBody(
  envelope: AnyEncryptedEnvelope,
  silentSignal = false,
): string {
  const prefix = silentSignal
    ? `${E2EE_SIGNAL_PREFIX}${E2EE_WIRE_MARKER}`
    : E2EE_WIRE_HEADER;
  return `${prefix}${JSON.stringify(envelope)}`;
}

function buildDmSignaturePayload(
  senderId: string,
  receiverId: string,
  sk: string,
  rk: string,
  epk: string,
  wr: string,
  ws: string,
  iv: string,
  ctHashB64: string,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    `JaText-DM-Sig-v1|${senderId}|${receiverId}|${sk}|${rk}|${epk}|${wr}|${ws}|${iv}|${ctHashB64}`,
  ) as Uint8Array<ArrayBuffer>;
}

function buildDmAad(
  senderId: string,
  receiverId: string,
  sk: string,
  rk: string,
  epk: string,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    `JaText-DM-AAD-v1|${senderId}|${receiverId}|${sk}|${rk}|${epk}`,
  ) as Uint8Array<ArrayBuffer>;
}

export async function encryptDmPayload(params: {
  senderIdentity: StoredIdentityRecord;
  receiverPublic: PublicIdentityBundle;
  senderId: string;
  receiverId: string;
  payload: E2EEPlainPayload;
  silentSignal?: boolean;
  uploadOverflowCiphertext?: (ciphertextBytes: Uint8Array<ArrayBuffer>) => Promise<string>;
}): Promise<string> {
  const {
    senderIdentity,
    receiverPublic,
    senderId,
    receiverId,
    payload,
    silentSignal = false,
    uploadOverflowCiphertext,
  } = params;
  const subtle = getSubtle();

  // 1. Import identity keys + generate one-time ephemeral ECDH keypair
  const [senderDhPriv, senderDhPub, receiverDhPub, senderSigPriv, ephemPair] = await Promise.all([
    importEcdhPrivateKey(senderIdentity.dhPrivPkcs8B64),
    importEcdhPublicKey(senderIdentity.dhPubB64),
    importEcdhPublicKey(receiverPublic.dhPubB64),
    importEcdsaPrivateKey(senderIdentity.sigPrivPkcs8B64),
    subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
  ]);

  const epkRaw = new Uint8Array(await subtle.exportKey("raw", ephemPair.publicKey));
  const epkB64 = bytesToBase64Url(epkRaw);

  // 2. Hybrid Ephemeral + Static ECDH shared secrets
  const [ssEphemReceiver, ssStaticPair, ssEphemSender] = await Promise.all([
    ecdhSharedBytes(ephemPair.privateKey, receiverDhPub),
    ecdhSharedBytes(senderDhPriv, receiverDhPub),
    ecdhSharedBytes(ephemPair.privateKey, senderDhPub),
  ]);

  // 3. Random 256-bit Content Encryption Key (CEK) + AES-256-GCM encryption
  const cekBytes = randomBytes(32);
  const payloadIv = randomBytes(12);
  const aad = buildDmAad(
    senderId,
    receiverId,
    senderIdentity.keyId,
    receiverPublic.keyId,
    epkB64,
  );
  const cekCryptoKey = await subtle.importKey(
    "raw",
    toArrayBuffer(cekBytes),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const plainBytes = encoder.encode(JSON.stringify(payload));
  const ctBytes = new Uint8Array(
    await subtle.encrypt(
      { name: "AES-GCM", iv: payloadIv, additionalData: aad },
      cekCryptoKey,
      toArrayBuffer(plainBytes),
    ),
  );

  // 4. Wrap CEK separately for Receiver (ephem||static) and Sender (ephem||static)
  const [kwkReceiver, kwkSender] = await Promise.all([
    hkdfDeriveAesGcmKey(
      concatBytes(ssEphemReceiver, ssStaticPair),
      epkRaw,
      `JaText-DM-WrapR-v1|${senderId}|${receiverId}|${receiverPublic.keyId}`,
      ["encrypt"],
    ),
    hkdfDeriveAesGcmKey(
      concatBytes(ssEphemSender, ssStaticPair),
      epkRaw,
      `JaText-DM-WrapS-v1|${senderId}|${receiverId}|${senderIdentity.keyId}`,
      ["encrypt"],
    ),
  ]);

  const wrapIvR = randomBytes(12);
  const wrapIvS = randomBytes(12);
  const [wrappedR, wrappedS] = await Promise.all([
    subtle.encrypt({ name: "AES-GCM", iv: wrapIvR }, kwkReceiver, cekBytes),
    subtle.encrypt({ name: "AES-GCM", iv: wrapIvS }, kwkSender, cekBytes),
  ]);

  const wrB64 = bytesToBase64Url(concatBytes(wrapIvR, new Uint8Array(wrappedR)));
  const wsB64 = bytesToBase64Url(concatBytes(wrapIvS, new Uint8Array(wrappedS)));
  const ivB64 = bytesToBase64Url(payloadIv);
  const ctHashB64 = bytesToBase64Url(await sha256Bytes(ctBytes));

  const sigPayload = buildDmSignaturePayload(
    senderId,
    receiverId,
    senderIdentity.keyId,
    receiverPublic.keyId,
    epkB64,
    wrB64,
    wsB64,
    ivB64,
    ctHashB64,
  );
  const sigB64 = bytesToBase64Url(
    new Uint8Array(
      await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, senderSigPriv, sigPayload),
    ),
  );

  const inlineCtB64 = bytesToBase64Url(ctBytes);
  const candidateEnvelope: DMEncryptedEnvelope = {
    v: 1,
    c: "dm",
    sk: senderIdentity.keyId,
    rk: receiverPublic.keyId,
    epk: epkB64,
    wr: wrB64,
    ws: wsB64,
    iv: ivB64,
    ct: inlineCtB64,
    sig: sigB64,
  };
  const inlineWire = serializeEncryptedWireBody(candidateEnvelope, silentSignal);

  if (inlineWire.length <= E2EE_MAX_INLINE_WIRE_CHARS) {
    return inlineWire;
  }

  if (!uploadOverflowCiphertext) {
    throw new Error("Encrypted message exceeds inline wire size limit.");
  }
  const sid = await uploadOverflowCiphertext(ctBytes);
  return serializeEncryptedWireBody(
    {
      v: 1,
      c: "dm",
      sk: senderIdentity.keyId,
      rk: receiverPublic.keyId,
      epk: epkB64,
      wr: wrB64,
      ws: wsB64,
      iv: ivB64,
      ovf: { sid, h: ctHashB64 },
      sig: sigB64,
    },
    silentSignal,
  );
}

export async function decryptDmEnvelope(params: {
  envelope: DMEncryptedEnvelope;
  myIdentities: StoredIdentityRecord[];
  peerPublic: PublicIdentityBundle | null;
  myUserId: string;
  senderId: string;
  receiverId: string;
  fetchOverflowCiphertext?: (storageId: string) => Promise<Uint8Array<ArrayBuffer>>;
}): Promise<{ payload: E2EEPlainPayload; signatureVerified: boolean }> {
  const {
    envelope,
    myIdentities,
    peerPublic,
    myUserId,
    senderId,
    receiverId,
    fetchOverflowCiphertext,
  } = params;
  const subtle = getSubtle();

  // Resolve ciphertext bytes (inline or overflow storage blob)
  let ctBytes: Uint8Array<ArrayBuffer>;
  if (envelope.ct) {
    ctBytes = base64UrlToBytes(envelope.ct);
  } else if (envelope.ovf?.sid && fetchOverflowCiphertext) {
    ctBytes = await fetchOverflowCiphertext(envelope.ovf.sid);
    const actualHash = bytesToBase64Url(await sha256Bytes(ctBytes));
    if (actualHash !== envelope.ovf.h) {
      throw new Error("Encrypted message overflow hash mismatch.");
    }
  } else {
    throw new Error("Encrypted message ciphertext is unavailable.");
  }

  const ctHashB64 = bytesToBase64Url(await sha256Bytes(ctBytes));

  // Verify ECDSA sender signature whenever sender's public signing key is available
  let signatureVerified = false;
  const isFromMe = senderId === myUserId;
  const senderMatchingOwn = isFromMe
    ? myIdentities.find((id) => id.keyId === envelope.sk)
    : undefined;
  const senderSigPubB64 = isFromMe
    ? senderMatchingOwn?.sigPubB64
    : peerPublic && peerPublic.keyId === envelope.sk
      ? peerPublic.sigPubB64
      : undefined;

  if (senderSigPubB64) {
    try {
      const sigPub = await importEcdsaPublicKey(senderSigPubB64);
      const sigPayload = buildDmSignaturePayload(
        senderId,
        receiverId,
        envelope.sk,
        envelope.rk,
        envelope.epk,
        envelope.wr,
        envelope.ws,
        envelope.iv,
        ctHashB64,
      );
      signatureVerified = await subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        sigPub,
        toArrayBuffer(base64UrlToBytes(envelope.sig)),
        sigPayload,
      );
      if (!signatureVerified) {
        throw new Error("Sender signature verification failed.");
      }
    } catch (err) {
      if (err instanceof Error && err.message === "Sender signature verification failed.") {
        throw err;
      }
    }
  }

  // Locate matching local identity key (primary or historical)
  const targetKeyId = isFromMe ? envelope.sk : envelope.rk;
  const candidates = [
    ...myIdentities.filter((k) => k.keyId === targetKeyId),
    ...myIdentities.filter((k) => k.keyId !== targetKeyId),
  ];
  if (candidates.length === 0) {
    throw new Error("E2EE identity key is not unlocked on this device.");
  }
  if (!peerPublic) {
    throw new Error("Waiting for peer's E2EE public key.");
  }

  const epkBytes = base64UrlToBytes(envelope.epk);
  const [epkCryptoKey, peerDhPub] = await Promise.all([
    importEcdhPublicKey(envelope.epk),
    importEcdhPublicKey(peerPublic.dhPubB64),
  ]);

  const wrapRaw = base64UrlToBytes(isFromMe ? envelope.ws : envelope.wr);
  if (wrapRaw.byteLength < 29) {
    throw new Error("Malformed wrapped CEK.");
  }
  const wrapIv = wrapRaw.subarray(0, 12);
  const wrapCt = wrapRaw.subarray(12);
  const aad = buildDmAad(senderId, receiverId, envelope.sk, envelope.rk, envelope.epk);

  let lastErr: unknown = null;
  for (const myIdentity of candidates) {
    try {
      const myDhPriv = await importEcdhPrivateKey(myIdentity.dhPrivPkcs8B64);
      const [ssEphem, ssStatic] = await Promise.all([
        ecdhSharedBytes(myDhPriv, epkCryptoKey),
        ecdhSharedBytes(myDhPriv, peerDhPub),
      ]);
      const info = isFromMe
        ? `JaText-DM-WrapS-v1|${senderId}|${receiverId}|${myIdentity.keyId}`
        : `JaText-DM-WrapR-v1|${senderId}|${receiverId}|${myIdentity.keyId}`;
      const kwk = await hkdfDeriveAesGcmKey(
        concatBytes(ssEphem, ssStatic),
        epkBytes,
        info,
        ["decrypt"],
      );
      const cekBuf = await subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(wrapIv) },
        kwk,
        toArrayBuffer(wrapCt),
      );
      const cekCryptoKey = await subtle.importKey(
        "raw",
        cekBuf,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );
      const plainBuf = await subtle.decrypt(
        {
          name: "AES-GCM",
          iv: toArrayBuffer(base64UrlToBytes(envelope.iv)),
          additionalData: aad,
        },
        cekCryptoKey,
        toArrayBuffer(ctBytes),
      );
      const parsed = JSON.parse(decoder.decode(plainBuf)) as E2EEPlainPayload;
      return { payload: parsed, signatureVerified };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("Could not decrypt message.");
}

/* ------------------------------------------------------------------ */
/* Group Epoch Key Distribution & Group Message Encryption             */
/* ------------------------------------------------------------------ */

export interface GroupEpochWrapEntry {
  kid: string;
  iv: string;
  ct: string;
}

export interface GroupKeySignalPacket {
  kind: "e2ee_gk";
  v: 1;
  gid: string;
  ep: number;
  skid: string;
  epk: string;
  wraps: Record<string, GroupEpochWrapEntry>;
  sig: string;
  ts: number;
}

export function generateGroupEpochSecretB64(): string {
  return bytesToBase64Url(randomBytes(32));
}

function buildGroupKeyPacketSigPayload(
  gid: string,
  ep: number,
  senderId: string,
  skid: string,
  epk: string,
  wraps: Record<string, GroupEpochWrapEntry>,
): Uint8Array<ArrayBuffer> {
  const canonicalWraps = Object.keys(wraps)
    .sort()
    .map((uid) => `${uid}:${wraps[uid].kid}:${wraps[uid].iv}:${wraps[uid].ct}`)
    .join(",");
  return encoder.encode(
    `JaText-GK-Sig-v1|${gid}|${ep}|${senderId}|${skid}|${epk}|${canonicalWraps}`,
  ) as Uint8Array<ArrayBuffer>;
}

export async function createGroupKeySignalPacket(params: {
  groupId: string;
  epoch: number;
  epochSecretB64: string;
  senderIdentity: StoredIdentityRecord;
  memberBundles: PublicIdentityBundle[];
}): Promise<GroupKeySignalPacket> {
  const { groupId, epoch, epochSecretB64, senderIdentity, memberBundles } = params;
  const subtle = getSubtle();
  const epochSecretBytes = base64UrlToBytes(epochSecretB64);

  const [ephemPair, senderSigPriv] = await Promise.all([
    subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
    importEcdsaPrivateKey(senderIdentity.sigPrivPkcs8B64),
  ]);
  const epkRaw = new Uint8Array(await subtle.exportKey("raw", ephemPair.publicKey));
  const epkB64 = bytesToBase64Url(epkRaw);

  const wraps: Record<string, GroupEpochWrapEntry> = {};
  await Promise.all(
    memberBundles.map(async (member) => {
      const memberDhPub = await importEcdhPublicKey(member.dhPubB64);
      const ss = await ecdhSharedBytes(ephemPair.privateKey, memberDhPub);
      const kwk = await hkdfDeriveAesGcmKey(
        ss,
        epkRaw,
        `JaText-GK-Wrap-v1|${groupId}|${epoch}|${senderIdentity.userId}|${member.userId}|${member.keyId}`,
        ["encrypt"],
      );
      const iv = randomBytes(12);
      const aad = encoder.encode(`JaText-GK-AAD-v1|${groupId}|${epoch}|${member.userId}`);
      const ct = await subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: toArrayBuffer(aad) },
        kwk,
        epochSecretBytes,
      );
      wraps[member.userId] = {
        kid: member.keyId,
        iv: bytesToBase64Url(iv),
        ct: bytesToBase64Url(new Uint8Array(ct)),
      };
    }),
  );

  const sigPayload = buildGroupKeyPacketSigPayload(
    groupId,
    epoch,
    senderIdentity.userId,
    senderIdentity.keyId,
    epkB64,
    wraps,
  );
  const sigB64 = bytesToBase64Url(
    new Uint8Array(
      await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, senderSigPriv, sigPayload),
    ),
  );

  return {
    kind: "e2ee_gk",
    v: 1,
    gid: groupId,
    ep: epoch,
    skid: senderIdentity.keyId,
    epk: epkB64,
    wraps,
    sig: sigB64,
    ts: Date.now(),
  };
}

export async function unwrapGroupKeySignalPacket(params: {
  packet: GroupKeySignalPacket;
  senderId: string;
  senderPublic: PublicIdentityBundle | null;
  myUserId: string;
  myIdentities: StoredIdentityRecord[];
}): Promise<string | null> {
  const { packet, senderId, senderPublic, myUserId, myIdentities } = params;
  const subtle = getSubtle();

  const myWrap = packet.wraps[myUserId];
  if (!myWrap) return null;

  // Verify distributor ECDSA signature whenever distributor's public key is available
  if (senderPublic && senderPublic.keyId === packet.skid) {
    const sigPub = await importEcdsaPublicKey(senderPublic.sigPubB64);
    const sigPayload = buildGroupKeyPacketSigPayload(
      packet.gid,
      packet.ep,
      senderId,
      packet.skid,
      packet.epk,
      packet.wraps,
    );
    const ok = await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      sigPub,
      toArrayBuffer(base64UrlToBytes(packet.sig)),
      sigPayload,
    );
    if (!ok) {
      throw new Error("Group epoch key signature verification failed.");
    }
  }

  const epkBytes = base64UrlToBytes(packet.epk);
  const epkPub = await importEcdhPublicKey(packet.epk);
  const aad = encoder.encode(`JaText-GK-AAD-v1|${packet.gid}|${packet.ep}|${myUserId}`);

  const candidates = [
    ...myIdentities.filter((k) => k.keyId === myWrap.kid),
    ...myIdentities.filter((k) => k.keyId !== myWrap.kid),
  ];

  for (const myIdentity of candidates) {
    try {
      const myDhPriv = await importEcdhPrivateKey(myIdentity.dhPrivPkcs8B64);
      const ss = await ecdhSharedBytes(myDhPriv, epkPub);
      const kwk = await hkdfDeriveAesGcmKey(
        ss,
        epkBytes,
        `JaText-GK-Wrap-v1|${packet.gid}|${packet.ep}|${senderId}|${myUserId}|${myIdentity.keyId}`,
        ["decrypt"],
      );
      const secretBuf = await subtle.decrypt(
        {
          name: "AES-GCM",
          iv: toArrayBuffer(base64UrlToBytes(myWrap.iv)),
          additionalData: toArrayBuffer(aad),
        },
        kwk,
        toArrayBuffer(base64UrlToBytes(myWrap.ct)),
      );
      return bytesToBase64Url(new Uint8Array(secretBuf));
    } catch {
      // Try next candidate identity
    }
  }
  return null;
}

function buildGroupMsgAad(
  groupId: string,
  epoch: number,
  senderId: string,
  senderKeyId: string,
  saltB64: string,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    `JaText-Grp-AAD-v1|${groupId}|${epoch}|${senderId}|${senderKeyId}|${saltB64}`,
  ) as Uint8Array<ArrayBuffer>;
}

function buildGroupMsgSigPayload(
  groupId: string,
  epoch: number,
  senderId: string,
  senderKeyId: string,
  saltB64: string,
  ivB64: string,
  ctHashB64: string,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    `JaText-Grp-Sig-v1|${groupId}|${epoch}|${senderId}|${senderKeyId}|${saltB64}|${ivB64}|${ctHashB64}`,
  ) as Uint8Array<ArrayBuffer>;
}

export async function encryptGroupPayload(params: {
  groupId: string;
  epoch: number;
  epochSecretB64: string;
  senderIdentity: StoredIdentityRecord;
  senderId: string;
  payload: E2EEPlainPayload;
  silentSignal?: boolean;
  uploadOverflowCiphertext?: (ciphertextBytes: Uint8Array<ArrayBuffer>) => Promise<string>;
}): Promise<string> {
  const {
    groupId,
    epoch,
    epochSecretB64,
    senderIdentity,
    senderId,
    payload,
    silentSignal = false,
    uploadOverflowCiphertext,
  } = params;
  const subtle = getSubtle();

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const saltB64 = bytesToBase64Url(salt);
  const ivB64 = bytesToBase64Url(iv);

  const [msgKey, senderSigPriv] = await Promise.all([
    hkdfDeriveAesGcmKey(
      base64UrlToBytes(epochSecretB64),
      salt,
      `JaText-Grp-Msg-v1|${groupId}|${epoch}|${senderId}|${senderIdentity.keyId}`,
      ["encrypt"],
    ),
    importEcdsaPrivateKey(senderIdentity.sigPrivPkcs8B64),
  ]);

  const aad = buildGroupMsgAad(groupId, epoch, senderId, senderIdentity.keyId, saltB64);
  const plainBytes = encoder.encode(JSON.stringify(payload));
  const ctBytes = new Uint8Array(
    await subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      msgKey,
      toArrayBuffer(plainBytes),
    ),
  );
  const ctHashB64 = bytesToBase64Url(await sha256Bytes(ctBytes));

  const sigPayload = buildGroupMsgSigPayload(
    groupId,
    epoch,
    senderId,
    senderIdentity.keyId,
    saltB64,
    ivB64,
    ctHashB64,
  );
  const sigB64 = bytesToBase64Url(
    new Uint8Array(
      await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, senderSigPriv, sigPayload),
    ),
  );

  const inlineCtB64 = bytesToBase64Url(ctBytes);
  const candidate: GroupEncryptedEnvelope = {
    v: 1,
    c: "grp",
    ep: epoch,
    sk: senderIdentity.keyId,
    s: saltB64,
    iv: ivB64,
    ct: inlineCtB64,
    sig: sigB64,
  };
  const inlineWire = serializeEncryptedWireBody(candidate, silentSignal);
  if (inlineWire.length <= E2EE_MAX_INLINE_WIRE_CHARS) {
    return inlineWire;
  }

  if (!uploadOverflowCiphertext) {
    throw new Error("Encrypted group message exceeds inline wire size limit.");
  }
  const sid = await uploadOverflowCiphertext(ctBytes);
  return serializeEncryptedWireBody(
    {
      v: 1,
      c: "grp",
      ep: epoch,
      sk: senderIdentity.keyId,
      s: saltB64,
      iv: ivB64,
      ovf: { sid, h: ctHashB64 },
      sig: sigB64,
    },
    silentSignal,
  );
}

export async function decryptGroupEnvelope(params: {
  envelope: GroupEncryptedEnvelope;
  groupId: string;
  epochSecretB64: string;
  senderId: string;
  senderSigPubB64?: string;
  fetchOverflowCiphertext?: (storageId: string) => Promise<Uint8Array<ArrayBuffer>>;
}): Promise<{ payload: E2EEPlainPayload; signatureVerified: boolean }> {
  const {
    envelope,
    groupId,
    epochSecretB64,
    senderId,
    senderSigPubB64,
    fetchOverflowCiphertext,
  } = params;
  const subtle = getSubtle();

  let ctBytes: Uint8Array<ArrayBuffer>;
  if (envelope.ct) {
    ctBytes = base64UrlToBytes(envelope.ct);
  } else if (envelope.ovf?.sid && fetchOverflowCiphertext) {
    ctBytes = await fetchOverflowCiphertext(envelope.ovf.sid);
    const actualHash = bytesToBase64Url(await sha256Bytes(ctBytes));
    if (actualHash !== envelope.ovf.h) {
      throw new Error("Encrypted group message overflow hash mismatch.");
    }
  } else {
    throw new Error("Encrypted group message ciphertext is unavailable.");
  }

  const ctHashB64 = bytesToBase64Url(await sha256Bytes(ctBytes));
  let signatureVerified = false;
  if (senderSigPubB64) {
    const sigPub = await importEcdsaPublicKey(senderSigPubB64);
    const sigPayload = buildGroupMsgSigPayload(
      groupId,
      envelope.ep,
      senderId,
      envelope.sk,
      envelope.s,
      envelope.iv,
      ctHashB64,
    );
    signatureVerified = await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      sigPub,
      toArrayBuffer(base64UrlToBytes(envelope.sig)),
      sigPayload,
    );
    if (!signatureVerified) {
      throw new Error("Group message signature verification failed.");
    }
  }

  const saltBytes = base64UrlToBytes(envelope.s);
  const msgKey = await hkdfDeriveAesGcmKey(
    base64UrlToBytes(epochSecretB64),
    saltBytes,
    `JaText-Grp-Msg-v1|${groupId}|${envelope.ep}|${senderId}|${envelope.sk}`,
    ["decrypt"],
  );
  const aad = buildGroupMsgAad(groupId, envelope.ep, senderId, envelope.sk, envelope.s);
  const plainBuf = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(base64UrlToBytes(envelope.iv)),
      additionalData: aad,
    },
    msgKey,
    toArrayBuffer(ctBytes),
  );
  return {
    payload: JSON.parse(decoder.decode(plainBuf)) as E2EEPlainPayload,
    signatureVerified,
  };
}

/* ------------------------------------------------------------------ */
/* Zero-Knowledge Multi-Device Key Vault (PBKDF2-SHA-512 + AES-GCM)    */
/* ------------------------------------------------------------------ */

export interface E2EEVaultContents {
  v: 1;
  userId: string;
  primaryIdentity: StoredIdentityRecord;
  previousIdentities: StoredIdentityRecord[];
  groupEpochs: { groupId: string; epoch: number; secretB64: string; createdAt: number }[];
  exportedAt: number;
}

export interface SealedE2EEVault {
  v: 1;
  userId: string;
  keyId: string;
  /** Passphrase-wrapped vault key */
  pinWrap: {
    salt: string;
    iterations: number;
    iv: string;
    ct: string;
  };
  /** 24-char Recovery Key-wrapped vault key */
  recoveryWrap: {
    salt: string;
    iterations: number;
    iv: string;
    ct: string;
  };
  /** AES-256-GCM encrypted E2EEVaultContents */
  vaultIv: string;
  vaultCt: string;
  updatedAt: number;
}

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRecoveryKey(): string {
  const bytes = randomBytes(24);
  const chars: string[] = [];
  for (let i = 0; i < 24; i++) {
    chars.push(RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length]);
  }
  return [
    chars.slice(0, 6).join(""),
    chars.slice(6, 12).join(""),
    chars.slice(12, 18).join(""),
    chars.slice(18, 24).join(""),
  ].join("-");
}

export function normalizeRecoveryKey(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function derivePbkdf2Key(
  secret: string,
  salt: Uint8Array,
  iterations: number,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    "raw",
    toArrayBuffer(encoder.encode(secret)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-512",
      salt: toArrayBuffer(salt),
      iterations,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function sealE2EEVault(params: {
  contents: E2EEVaultContents;
  passphrase: string;
  recoveryKey?: string;
}): Promise<{ sealed: SealedE2EEVault; recoveryKey: string }> {
  const { contents, passphrase } = params;
  if (passphrase.trim().length < 6) {
    throw new Error("E2EE backup PIN / passphrase must be at least 6 characters.");
  }
  const subtle = getSubtle();
  const recoveryKey = params.recoveryKey ?? generateRecoveryKey();
  const normalizedRecovery = normalizeRecoveryKey(recoveryKey);

  // Random 256-bit Master Vault Key
  const vaultMasterBytes = randomBytes(32);
  const vaultIv = randomBytes(12);
  const vaultAesKey = await subtle.importKey(
    "raw",
    toArrayBuffer(vaultMasterBytes),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const vaultAad = encoder.encode(`JaText-Vault-v1|${contents.userId}|${contents.primaryIdentity.keyId}`);
  const vaultCt = new Uint8Array(
    await subtle.encrypt(
      { name: "AES-GCM", iv: vaultIv, additionalData: toArrayBuffer(vaultAad) },
      vaultAesKey,
      toArrayBuffer(encoder.encode(JSON.stringify(contents))),
    ),
  );

  // Wrap vaultMasterBytes independently with Passphrase AND with Recovery Key
  const pinSalt = randomBytes(16);
  const recSalt = randomBytes(16);
  const pinIv = randomBytes(12);
  const recIv = randomBytes(12);

  const [pinKwk, recKwk] = await Promise.all([
    derivePbkdf2Key(`pin:${contents.userId}:${passphrase}`, pinSalt, PBKDF2_ITERATIONS, ["encrypt"]),
    derivePbkdf2Key(`rec:${contents.userId}:${normalizedRecovery}`, recSalt, PBKDF2_ITERATIONS, ["encrypt"]),
  ]);

  const [pinWrapped, recWrapped] = await Promise.all([
    subtle.encrypt({ name: "AES-GCM", iv: pinIv }, pinKwk, vaultMasterBytes),
    subtle.encrypt({ name: "AES-GCM", iv: recIv }, recKwk, vaultMasterBytes),
  ]);

  return {
    recoveryKey,
    sealed: {
      v: 1,
      userId: contents.userId,
      keyId: contents.primaryIdentity.keyId,
      pinWrap: {
        salt: bytesToBase64Url(pinSalt),
        iterations: PBKDF2_ITERATIONS,
        iv: bytesToBase64Url(pinIv),
        ct: bytesToBase64Url(new Uint8Array(pinWrapped)),
      },
      recoveryWrap: {
        salt: bytesToBase64Url(recSalt),
        iterations: PBKDF2_ITERATIONS,
        iv: bytesToBase64Url(recIv),
        ct: bytesToBase64Url(new Uint8Array(recWrapped)),
      },
      vaultIv: bytesToBase64Url(vaultIv),
      vaultCt: bytesToBase64Url(vaultCt),
      updatedAt: Date.now(),
    },
  };
}

export async function openSealedE2EEVault(params: {
  sealed: SealedE2EEVault;
  secretInput: string;
  mode: "pin" | "recovery";
}): Promise<E2EEVaultContents> {
  const { sealed, secretInput, mode } = params;
  const subtle = getSubtle();
  const wrap = mode === "pin" ? sealed.pinWrap : sealed.recoveryWrap;
  const formattedSecret =
    mode === "pin"
      ? `pin:${sealed.userId}:${secretInput}`
      : `rec:${sealed.userId}:${normalizeRecoveryKey(secretInput)}`;

  let vaultMasterBuf: ArrayBuffer;
  try {
    const kwk = await derivePbkdf2Key(
      formattedSecret,
      base64UrlToBytes(wrap.salt),
      wrap.iterations,
      ["decrypt"],
    );
    vaultMasterBuf = await subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(base64UrlToBytes(wrap.iv)) },
      kwk,
      toArrayBuffer(base64UrlToBytes(wrap.ct)),
    );
  } catch {
    throw new Error(
      mode === "pin"
        ? "Incorrect E2EE backup PIN / passphrase."
        : "Incorrect E2EE Recovery Key.",
    );
  }

  const vaultAesKey = await subtle.importKey(
    "raw",
    vaultMasterBuf,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const vaultAad = encoder.encode(`JaText-Vault-v1|${sealed.userId}|${sealed.keyId}`);
  const plainBuf = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(base64UrlToBytes(sealed.vaultIv)),
      additionalData: toArrayBuffer(vaultAad),
    },
    vaultAesKey,
    toArrayBuffer(base64UrlToBytes(sealed.vaultCt)),
  );
  return JSON.parse(decoder.decode(plainBuf)) as E2EEVaultContents;
}

/* ------------------------------------------------------------------ */
/* Live Device-to-Device ECDH Key Sync (1-Tap SAS Code Verification)   */
/* ------------------------------------------------------------------ */

export interface DeviceSyncRequest {
  v: 1;
  deviceId: string;
  deviceLabel: string;
  userId: string;
  dhPubB64: string;
  sasCode: string;
  createdAt: number;
}

export interface LocalDeviceSyncKeypair {
  request: DeviceSyncRequest;
  dhPrivPkcs8B64: string;
}

export interface DeviceSyncResponse {
  v: 1;
  deviceId: string;
  userId: string;
  epk: string;
  iv: string;
  ct: string;
  sig: string;
  sigPub: string;
  createdAt: number;
}

export async function computeDeviceSasCode(userId: string, dhPubB64: string): Promise<string> {
  const digest = await sha256Bytes(encoder.encode(`JaText-DevSAS-v1|${userId}|${dhPubB64}`));
  const num =
    (((digest[0] << 24) >>> 0) + (digest[1] << 16) + (digest[2] << 8) + digest[3]) % 1_000_000;
  const six = num.toString().padStart(6, "0");
  return `${six.slice(0, 3)}-${six.slice(3)}`;
}

export async function generateDeviceSyncKeypair(
  userId: string,
  deviceId: string,
  deviceLabel: string,
): Promise<LocalDeviceSyncKeypair> {
  const subtle = getSubtle();
  const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const [rawPub, pkcs8Priv] = await Promise.all([
    subtle.exportKey("raw", pair.publicKey),
    subtle.exportKey("pkcs8", pair.privateKey),
  ]);
  const dhPubB64 = bytesToBase64Url(new Uint8Array(rawPub));
  const sasCode = await computeDeviceSasCode(userId, dhPubB64);
  return {
    dhPrivPkcs8B64: bytesToBase64Url(new Uint8Array(pkcs8Priv)),
    request: {
      v: 1,
      deviceId,
      deviceLabel,
      userId,
      dhPubB64,
      sasCode,
      createdAt: Date.now(),
    },
  };
}

export async function wrapVaultForDeviceSync(params: {
  request: DeviceSyncRequest;
  contents: E2EEVaultContents;
}): Promise<DeviceSyncResponse> {
  const { request, contents } = params;
  const subtle = getSubtle();
  const expectedSas = await computeDeviceSasCode(request.userId, request.dhPubB64);
  if (expectedSas !== request.sasCode || request.userId !== contents.userId) {
    throw new Error("Device sync request verification failed.");
  }

  const [ephemPair, targetDhPub, sigPriv] = await Promise.all([
    subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]),
    importEcdhPublicKey(request.dhPubB64),
    importEcdsaPrivateKey(contents.primaryIdentity.sigPrivPkcs8B64),
  ]);
  const epkRaw = new Uint8Array(await subtle.exportKey("raw", ephemPair.publicKey));
  const epkB64 = bytesToBase64Url(epkRaw);
  const ss = await ecdhSharedBytes(ephemPair.privateKey, targetDhPub);
  const aesKey = await hkdfDeriveAesGcmKey(
    ss,
    epkRaw,
    `JaText-DevSync-v1|${contents.userId}|${request.deviceId}`,
    ["encrypt"],
  );
  const iv = randomBytes(12);
  const aad = encoder.encode(`JaText-DevSync-AAD-v1|${contents.userId}|${request.deviceId}`);
  const ctBytes = new Uint8Array(
    await subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: toArrayBuffer(aad) },
      aesKey,
      toArrayBuffer(encoder.encode(JSON.stringify(contents))),
    ),
  );
  const ctB64 = bytesToBase64Url(ctBytes);
  const ivB64 = bytesToBase64Url(iv);
  const ctHashB64 = bytesToBase64Url(await sha256Bytes(ctBytes));
  const sigPayload = encoder.encode(
    `JaText-DevSync-Sig-v1|${contents.userId}|${request.deviceId}|${epkB64}|${ivB64}|${ctHashB64}`,
  );
  const sigB64 = bytesToBase64Url(
    new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, sigPriv, sigPayload)),
  );

  return {
    v: 1,
    deviceId: request.deviceId,
    userId: contents.userId,
    epk: epkB64,
    iv: ivB64,
    ct: ctB64,
    sig: sigB64,
    sigPub: contents.primaryIdentity.sigPubB64,
    createdAt: Date.now(),
  };
}

export async function unwrapDeviceSyncResponse(params: {
  response: DeviceSyncResponse;
  localSync: LocalDeviceSyncKeypair;
}): Promise<E2EEVaultContents> {
  const { response, localSync } = params;
  const subtle = getSubtle();
  if (
    response.deviceId !== localSync.request.deviceId ||
    response.userId !== localSync.request.userId
  ) {
    throw new Error("Device sync response does not match this device.");
  }

  const ctBytes = base64UrlToBytes(response.ct);
  const ctHashB64 = bytesToBase64Url(await sha256Bytes(ctBytes));
  const sigPub = await importEcdsaPublicKey(response.sigPub);
  const sigPayload = encoder.encode(
    `JaText-DevSync-Sig-v1|${response.userId}|${response.deviceId}|${response.epk}|${response.iv}|${ctHashB64}`,
  );
  const sigValid = await subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    sigPub,
    toArrayBuffer(base64UrlToBytes(response.sig)),
    sigPayload,
  );
  if (!sigValid) {
    throw new Error("Device sync signature verification failed.");
  }

  const [myPriv, epkPub] = await Promise.all([
    importEcdhPrivateKey(localSync.dhPrivPkcs8B64),
    importEcdhPublicKey(response.epk),
  ]);
  const ss = await ecdhSharedBytes(myPriv, epkPub);
  const aesKey = await hkdfDeriveAesGcmKey(
    ss,
    base64UrlToBytes(response.epk),
    `JaText-DevSync-v1|${response.userId}|${response.deviceId}`,
    ["decrypt"],
  );
  const aad = encoder.encode(`JaText-DevSync-AAD-v1|${response.userId}|${response.deviceId}`);
  const plainBuf = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(base64UrlToBytes(response.iv)),
      additionalData: toArrayBuffer(aad),
    },
    aesKey,
    toArrayBuffer(ctBytes),
  );
  return JSON.parse(decoder.decode(plainBuf)) as E2EEVaultContents;
}
