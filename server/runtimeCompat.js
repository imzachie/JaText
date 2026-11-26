/**
 * The crypto the backend needs, without `node:crypto`.
 *
 * `server/tursoBackend.js` was written against Node and reaches for the
 * synchronous `createHash` / `createHmac` / `timingSafeEqual` / `scrypt`.
 * Those exist only in Node: the web platform's crypto is entirely
 * asynchronous, so a synchronous signing helper cannot be built on it, and the
 * server dies at import time anywhere else.
 *
 * Everything here is a direct implementation of the same algorithms, kept
 * synchronous so no call site has to change. `scripts/test-runtime-compat.mjs`
 * compares every function against Node's own crypto, so the two cannot drift.
 *
 * Signature verification is the exception: it is already awaited by its
 * callers, so it uses Web Crypto instead (see `verifySignature`).
 */

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr32 = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

/** FIPS 180-4 SHA-256 over raw bytes. */
export function sha256(message) {
  const bytes = toBytes(message);
  const bitLen = bytes.length * 8;
  // The message, a 0x80 byte and an 8 byte length, in whole 64 byte blocks.
  const withPad = new Uint8Array(((((bytes.length + 8) >> 6) + 1) << 6) >>> 0);
  withPad.set(bytes);
  withPad[bytes.length] = 0x80;
  const view = new DataView(withPad.buffer);
  view.setUint32(withPad.length - 4, bitLen >>> 0, false);
  view.setUint32(withPad.length - 8, Math.floor(bitLen / 0x100000000), false);

  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const w = new Uint32Array(64);

  for (let chunk = 0; chunk < withPad.length; chunk += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(chunk + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    const next = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i++) h[i] = (h[i] + next[i]) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i], false);
  return out;
}

/** FIPS 180-4 SHA-1, needed only for RFC 6238 TOTP. */
export function sha1(message) {
  const bytes = toBytes(message);
  const bitLen = bytes.length * 8;
  // The message, a 0x80 byte and an 8 byte length, in whole 64 byte blocks.
  const withPad = new Uint8Array(((((bytes.length + 8) >> 6) + 1) << 6) >>> 0);
  withPad.set(bytes);
  withPad[bytes.length] = 0x80;
  const view = new DataView(withPad.buffer);
  view.setUint32(withPad.length - 4, bitLen >>> 0, false);
  view.setUint32(withPad.length - 8, Math.floor(bitLen / 0x100000000), false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let chunk = 0; chunk < withPad.length; chunk += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(chunk + i * 4, false);
    for (let i = 16; i < 80; i++) {
      const v = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]) >>> 0;
      w[i] = ((v << 1) | (v >>> 31)) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f = 0;
      let k = 0;
      if (i < 20) {
        f = ((b & c) | (~b & d)) >>> 0;
        k = 0x5a827999;
      } else if (i < 40) {
        f = (b ^ c ^ d) >>> 0;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = ((b & c) | (b & d) | (c & d)) >>> 0;
        k = 0x8f1bbcdc;
      } else {
        f = (b ^ c ^ d) >>> 0;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((value, i) => outView.setUint32(i * 4, value, false));
  return out;
}

/** RFC 2104 HMAC, synchronous so token signing stays synchronous. */
export function hmac(algorithm, key, message) {
  const algo = normaliseAlgorithm(algorithm);
  const hash = algo === "sha1" ? sha1 : sha256;
  const blockSize = 64;
  let keyBytes = toBytes(key);
  if (keyBytes.length > blockSize) keyBytes = hash(keyBytes);
  const padded = new Uint8Array(blockSize);
  padded.set(keyBytes);
  const inner = new Uint8Array(blockSize);
  const outer = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    inner[i] = padded[i] ^ 0x36;
    outer[i] = padded[i] ^ 0x5c;
  }
  const messageBytes = toBytes(message);
  const innerInput = new Uint8Array(blockSize + messageBytes.length);
  innerInput.set(inner);
  innerInput.set(messageBytes, blockSize);
  const innerHash = hash(innerInput);
  const outerInput = new Uint8Array(blockSize + innerHash.length);
  outerInput.set(outer);
  outerInput.set(innerHash, blockSize);
  return hash(outerInput);
}

function normaliseAlgorithm(algorithm) {
  const algo = String(algorithm || "").toLowerCase().replace(/-/g, "");
  if (algo !== "sha1" && algo !== "sha256") {
    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }
  return algo;
}

export function pbkdf2Sha256(password, salt, iterations, dkLen) {
  const passwordBytes = toBytes(password);
  const saltBytes = toBytes(salt);
  const blockCount = Math.ceil(dkLen / 32);
  const out = new Uint8Array(blockCount * 32);
  // Each block is HMAC(password, salt || INT_32_BE(i)), so the counter goes
  // after the salt, not before it.
  const block = new Uint8Array(saltBytes.length + 4);
  block.set(saltBytes, 0);
  const view = new DataView(block.buffer);
  for (let i = 1; i <= blockCount; i++) {
    view.setUint32(saltBytes.length, i, false);
    const target = out.subarray((i - 1) * 32, i * 32);
    let u = hmac("sha256", passwordBytes, block);
    target.set(u);
    for (let c = 1; c < iterations; c++) {
      u = hmac("sha256", passwordBytes, u);
      for (let j = 0; j < 32; j++) target[j] ^= u[j];
    }
  }
  return out.subarray(0, dkLen);
}

function rotl32(v, n) {
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

/**
 * Salsa20 quarter round: the pair sum is added, and the accumulator is XORed.
 *
 * Worth the comment because the operations are easy to swap, and swapping them
 * still produces a plausible looking hash: `x[b] ^= rotl(x[a] + x[d], 7)`.
 * Getting it wrong changes nothing visible until a scrypt hash stops matching
 * the one stored in the database, which is every password in the table.
 */
function quarterRound(x, a, b, c, d) {
  x[b] = (x[b] ^ rotl32((x[a] + x[d]) >>> 0, 7)) >>> 0;
  x[c] = (x[c] ^ rotl32((x[b] + x[a]) >>> 0, 9)) >>> 0;
  x[d] = (x[d] ^ rotl32((x[c] + x[b]) >>> 0, 13)) >>> 0;
  x[a] = (x[a] ^ rotl32((x[d] + x[c]) >>> 0, 18)) >>> 0;
}

/** Salsa20/8 core, run in place over 16 little endian words. */
export function salsa208(x) {
  const input = Uint32Array.from(x);
  for (let round = 0; round < 4; round++) {
    quarterRound(x, 0, 4, 8, 12);
    quarterRound(x, 5, 9, 13, 1);
    quarterRound(x, 10, 14, 2, 6);
    quarterRound(x, 15, 3, 7, 11);
    quarterRound(x, 0, 1, 2, 3);
    quarterRound(x, 5, 6, 7, 4);
    quarterRound(x, 10, 11, 8, 9);
    quarterRound(x, 15, 12, 13, 14);
  }
  for (let i = 0; i < 16; i++) x[i] = (x[i] + input[i]) >>> 0;
}

/** scrypt BlockMix over one 128*r byte block. */
export function blockMix(block, r) {
  const slices = 2 * r;
  const src = new Uint32Array(block.buffer, block.byteOffset, slices * 16);
  const out = new Uint8Array(block.length);
  const dst = new Uint32Array(out.buffer, out.byteOffset, slices * 16);
  const x = new Uint32Array(16);
  x.set(src.subarray((slices - 1) * 16, slices * 16));
  for (let i = 0; i < slices; i++) {
    const base = i * 16;
    for (let w = 0; w < 16; w++) x[w] = (x[w] ^ src[base + w]) >>> 0;
    salsa208(x);
    // Even numbered outputs first, then the odd ones.
    const target = ((i >> 1) + (i & 1) * r) * 16;
    dst.set(x, target);
  }
  return out;
}

/** scrypt ROMix. */
function romix(block, n, r) {
  const blockBytes = 128 * r;
  const history = new Uint8Array(blockBytes * n);
  let x = Uint8Array.from(block);
  for (let i = 0; i < n; i++) {
    history.set(x, i * blockBytes);
    x = blockMix(x, r);
  }
  for (let i = 0; i < n; i++) {
    const view = new DataView(x.buffer, x.byteOffset, x.byteLength);
    const j = view.getUint32(blockBytes - 64, true) % n;
    const slice = history.subarray(j * blockBytes, (j + 1) * blockBytes);
    for (let k = 0; k < blockBytes; k++) x[k] ^= slice[k];
    x = blockMix(x, r);
  }
  return x;
}

/**
 * RFC 7914 scrypt with Node's own defaults, which is what the stored password
 * hashes were made with. Returns bytes, like `crypto.scrypt` does.
 */
export function scrypt(password, salt, keyLen = 64, options = {}) {
  const n = Number(options.N || 16384);
  const r = Number(options.r || 8);
  const p = Number(options.p || 1);
  const derived = pbkdf2Sha256(toBytes(password), toBytes(salt), 1, p * 128 * r);
  for (let i = 0; i < p; i++) {
    const offset = i * 128 * r;
    const mixed = romix(derived.subarray(offset, offset + 128 * r), n, r);
    derived.set(mixed, offset);
  }
  return pbkdf2Sha256(toBytes(password), derived, 1, keyLen);
}

export function toHex(bytes) {
  let out = "";
  for (const value of bytes) out += value.toString(16).padStart(2, "0");
  return out;
}

export function toBase64(bytes) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(String(value).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function timingSafeEqual(a, b) {
  const left = toBytes(a);
  const right = toBytes(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

/**
 * Node returns a Buffer from these, and some call sites use Buffer only
 * methods like `.toString("hex")`, so hand one back wherever Node's is around.
 * A Uint8Array is the same thing on a runtime without it.
 */
function wrap(bytes) {
  return typeof globalThis.Buffer !== "undefined" ? globalThis.Buffer.from(bytes) : bytes;
}

export function randomBytes(length) {
  const out = new Uint8Array(length);
  const source = globalThis.crypto;
  if (source && typeof source.getRandomValues === "function") {
    // getRandomValues caps at 65536 bytes per call.
    for (let written = 0; written < length; written += 65536) {
      source.getRandomValues(out.subarray(written, Math.min(length, written + 65536)));
    }
    return out;
  }
  for (let i = 0; i < length; i++) out[i] = Math.floor(Math.random() * 256);
  return wrap(out);
}

export function toUtf8(bytes) {
  return new TextDecoder().decode(toBytes(bytes));
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (typeof input === "string") return new TextEncoder().encode(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError("Expected a string, Buffer or Uint8Array");
}

class HashAccumulator {
  constructor(algorithm) {
    this.algorithm = normaliseAlgorithm(algorithm);
    this.chunks = [];
  }

  update(input, inputEncoding) {
    this.chunks.push(
      inputEncoding
        ? new TextEncoder().encode(
            inputEncoding === "hex" ? hexToString(String(input)) : String(input),
          )
        : toBytes(input),
    );
    return this;
  }

  digest(encoding) {
    const hash = this.algorithm === "sha1" ? sha1 : sha256;
    const result = hash(concat(this.chunks));
    if (encoding === "hex") return toHex(result);
    if (encoding === "base64") return toBase64(result);
    return wrap(result);
  }
}

class HmacAccumulator {
  constructor(algorithm, key) {
    this.algorithm = normaliseAlgorithm(algorithm);
    this.key = toBytes(key);
    this.chunks = [];
  }

  update(input, inputEncoding) {
    this.chunks.push(
      inputEncoding
        ? new TextEncoder().encode(
            inputEncoding === "hex" ? hexToString(String(input)) : String(input),
          )
        : toBytes(input),
    );
    return this;
  }

  digest(encoding) {
    const result = hmac(this.algorithm, this.key, concat(this.chunks));
    if (encoding === "hex") return toHex(result);
    if (encoding === "base64") return toBase64(result);
    return wrap(result);
  }
}

function hexToString(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(out);
}

function concat(chunks) {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Drop in replacement for the parts of `crypto.createHash` that are used. */
export function createHash(algorithm) {
  return new HashAccumulator(algorithm);
}

/** Drop in replacement for the parts of `crypto.createHmac` that are used. */
export function createHmac(algorithm, key) {
  return new HmacAccumulator(algorithm, key);
}

/**
 * DER encoded ECDSA signature (what an authenticator returns, and what
 * `node:crypto` accepts) into the raw r || s form Web Crypto requires.
 *
 * Skipping this is silent: the signature never verifies, so every passkey
 * login fails with a generic error instead of anything useful.
 */
function ecdsaSignatureToRaw(signature, fieldBytes) {
  const bytes = toBytes(signature);
  if (bytes.length === fieldBytes * 2) return bytes;
  if (bytes[0] !== 0x30) return bytes;
  let offset = 2;
  if ((bytes[1] & 0x80) !== 0) offset = 2 + (bytes[1] & 0x7f);
  if (bytes[offset] !== 0x02) return bytes;
  const rLength = bytes[offset + 1];
  const r = bytes.subarray(offset + 2, offset + 2 + rLength);
  const sStart = offset + 2 + rLength;
  if (bytes[sStart] !== 0x02) return bytes;
  const sLength = bytes[sStart + 1];
  const s = bytes.subarray(sStart + 2, sStart + 2 + sLength);
  // A leading 0x00 is added when the high bit is set, which makes the integer
  // one byte longer than the field, so take the low bytes of each.
  const take = (value) =>
    value.length > fieldBytes ? value.subarray(value.length - fieldBytes) : value;
  const rRaw = take(r);
  const sRaw = take(s);
  const out = new Uint8Array(fieldBytes * 2);
  out.set(rRaw, fieldBytes - rRaw.length);
  out.set(sRaw, fieldBytes * 2 - sRaw.length);
  return out;
}

/**
 * Import a verification key without knowing its type, because a passkey SPKI
 * does not say which algorithm to use and Web Crypto refuses a mismatch.
 *
 * `key` is either a JWK object (the Google ID token path) or DER subject public
 * key info (the passkey path, stored that way in `user_passkeys`).
 */
const VERIFY_KEY_CANDIDATES = [
  { name: "ECDSA", namedCurve: "P-256" },
  { name: "ECDSA", namedCurve: "P-384" },
  { name: "ECDSA", namedCurve: "P-521" },
  { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
  { name: "RSA-PSS", hash: { name: "SHA-256" } },
];

function isJwkKey(key) {
  return key && typeof key === "object" && !ArrayBuffer.isView(key) && typeof key.kty === "string";
}

async function importVerifyKey(key, hashName) {
  const subtle = globalThis.crypto.subtle;
  const jwk = isJwkKey(key) ? key : null;
  if (jwk) {
    if (jwk.kty === "EC") {
      const namedCurve = jwk.crv || "P-256";
      return {
        cryptoKey: await subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve }, false, VERIFY_USAGES),
        algorithm: { name: "ECDSA", hash: { name: hashName } },
        fieldBytes: namedCurve === "P-384" ? 48 : namedCurve === "P-521" ? 66 : 32,
      };
    }
    const name = String(jwk.alg || "").startsWith("PS") ? "RSA-PSS" : "RSASSA-PKCS1-v1_5";
    return {
      cryptoKey: await subtle.importKey("jwk", jwk, { name, hash: { name: hashName } }, false, VERIFY_USAGES),
      algorithm:
        name === "RSA-PSS"
          ? { name: "RSA-PSS", saltLength: hashName === "SHA-512" ? 64 : 32 }
          : { name: "RSASSA-PKCS1-v1_5", hash: { name: hashName } },
      fieldBytes: 0,
    };
  }

  const der = toBytes(key);
  let lastError = null;
  for (const candidate of VERIFY_KEY_CANDIDATES) {
    const algorithm = { ...candidate };
    if (candidate.name !== "ECDSA") algorithm.hash = { name: hashName };
    try {
      const cryptoKey = await subtle.importKey("spki", der, algorithm, false, VERIFY_USAGES);
      return {
        cryptoKey,
        algorithm:
          candidate.name === "ECDSA"
            ? { name: "ECDSA", hash: { name: hashName } }
            : candidate.name === "RSA-PSS"
              ? { name: "RSA-PSS", saltLength: hashName === "SHA-512" ? 64 : 32 }
              : { name: "RSASSA-PKCS1-v1_5", hash: { name: hashName } },
        fieldBytes:
          candidate.namedCurve === "P-384" ? 48 : candidate.namedCurve === "P-521" ? 66 : candidate.name === "ECDSA" ? 32 : 0,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Unsupported verification key: ${lastError ? lastError.message : "unknown"}`);
}

const VERIFY_USAGES = ["verify"];

/**
 * Verify a detached signature. `algorithm` is "sha256" the way
 * `node:crypto.verify` takes it, and `key` is a JWK or DER SPKI.
 *
 * ECDSA signatures are accepted in both shapes an authenticator may produce:
 * DER, which is the WebAuthn default, and the raw r || s form.
 */
export async function verifySignature(algorithm, data, key, signature) {
  const hashName = normaliseAlgorithm(algorithm) === "sha1" ? "SHA-1" : "SHA-256";
  const { cryptoKey, algorithm: verifyAlgorithm, fieldBytes } = await importVerifyKey(key, hashName);
  let signatureBytes = toBytes(signature);
  if (fieldBytes > 0) signatureBytes = ecdsaSignatureToRaw(signatureBytes, fieldBytes);
  return globalThis.crypto.subtle.verify(verifyAlgorithm, cryptoKey, signatureBytes, toBytes(data));
}

/** Whether a passkey's stored SPKI can be imported at all, the registration check. */
export async function canImportVerifyKey(key) {
  try {
    await importVerifyKey(key, "SHA-256");
    return true;
  } catch {
    return false;
  }
}

/**
 * RSA COSE key -> DER subject public key info, which is the shape the
 * `user_passkeys` table stores. Node did this with createPublicKey().export().
 */
export async function spkiFromRsaJwk(nBytes, eBytes) {
  const subtle = globalThis.crypto.subtle;
  const cryptoKey = await subtle.importKey(
    "jwk",
    { kty: "RSA", n: toBase64Url(toBytes(nBytes)), e: toBase64Url(toBytes(eBytes)), alg: "RS256" },
    { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
    true,
    VERIFY_USAGES,
  );
  return new Uint8Array(await subtle.exportKey("spki", cryptoKey));
}

function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * The subset of `node:crypto` this server uses, sync parts included.
 *
 * Assigning this to a local `crypto` keeps every existing call site readable
 * while removing the `node:crypto` import, which is the line that made the
 * server unrunnable outside Node.
 */
export const nodeLikeCrypto = {
  createHash,
  createHmac,
  timingSafeEqual,
  randomBytes,
  randomUUID: () => globalThis.crypto.randomUUID(),
  scrypt: null,
};
