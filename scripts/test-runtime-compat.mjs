/**
 * Proves server/runtimeCompat.js matches Node's own crypto.
 *
 * The backend has to keep producing byte identical tokens and password hashes
 * wherever it runs, so this compares every primitive against `node:crypto` and
 * against the RFC 7914 scrypt vector. Run with `node scripts/test-runtime-compat.mjs`.
 */

import assert from "node:assert/strict";
import nodeCrypto from "node:crypto";
import {
  createHash,
  createHmac,
  hmac,
  scrypt,
  sha1,
  sha256,
  timingSafeEqual,
  toHex,
  verifySignature,
} from "../server/runtimeCompat.js";

const inputs = [
  "",
  "hello",
  "a".repeat(63),
  "b".repeat(64),
  "c".repeat(65),
  "the quick brown fox jumps over the lazy dog 0123456789",
  "üñïcödé ✓ 🔐",
];

let checks = 0;
function ok(label) {
  checks += 1;
  void label;
}

for (const input of inputs) {
  const bytes = new TextEncoder().encode(input);
  assert.equal(toHex(sha256(bytes)), nodeCrypto.createHash("sha256").update(bytes).digest("hex"), "sha256");
  assert.equal(toHex(sha1(bytes)), nodeCrypto.createHash("sha1").update(bytes).digest("hex"), "sha1");
  assert.equal(
    createHash("sha256").update(input, "utf8").digest("hex"),
    nodeCrypto.createHash("sha256").update(input, "utf8").digest("hex"),
    "sha256 accumulator",
  );
  ok("hash");
}

const keys = ["k", "s3cret", "K".repeat(64), "L".repeat(100), "\x00\x01\x02"];
for (const key of keys) {
  for (const input of inputs) {
    const bytes = new TextEncoder().encode(input);
    const nodeKey = Buffer.from(key, "utf8");
    assert.equal(
      toHex(hmac("sha256", nodeKey, bytes)),
      nodeCrypto.createHmac("sha256", nodeKey).update(bytes).digest("hex"),
      "hmac sha256",
    );
    assert.equal(
      toHex(hmac("sha1", nodeKey, bytes)),
      nodeCrypto.createHmac("sha1", nodeKey).update(bytes).digest("hex"),
      "hmac sha1",
    );
    assert.equal(
      createHmac("sha256", nodeKey).update(bytes).digest("base64"),
      nodeCrypto.createHmac("sha256", nodeKey).update(bytes).digest("base64"),
      "hmac accumulator base64",
    );
  }
  ok("hmac");
}

// The JWT path end to end: header.payload signed the same way both ways.
const signingInput = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0";
assert.equal(
  toHex(hmac("sha256", Buffer.from("secret", "utf8"), Buffer.from(signingInput, "utf8"))),
  nodeCrypto
    .createHmac("sha256", "secret")
    .update(signingInput)
    .digest("hex"),
  "jwt signature bytes",
);

// scrypt with Node's defaults, which is what stored password hashes use.
{
  const password = "correct horse battery staple";
  const salt = "0123456789abcdef0123456789abcdef";
  const expected = nodeCrypto.scryptSync(password, salt, 64);
  const actual = scrypt(password, salt, 64);
  assert.equal(toHex(actual), expected.toString("hex"), "scrypt defaults");
  ok("scrypt");
}

{
  // Non default parameters, the shape the RFC 7914 vectors use.
  const expected = nodeCrypto
    .scryptSync("password", "NaCl", 64, { N: 1024, r: 8, p: 16, maxmem: 64 * 1024 * 1024 })
    .toString("hex");
  assert.equal(toHex(scrypt("password", "NaCl", 64, { N: 1024, r: 8, p: 16 })), expected, "scrypt rfc vector");
  ok("scrypt vector");
}

assert.equal(timingSafeEqual(Buffer.from("abc"), Buffer.from("abc")), true);
assert.equal(timingSafeEqual(Buffer.from("abc"), Buffer.from("abd")), false);
assert.equal(timingSafeEqual(Buffer.from("abc"), Buffer.from("abcd")), false);
ok("timingSafeEqual");

// verifySignature has to accept what the Google and WebAuthn paths pass it.
for (const modulusLength of [2048]) {
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", { modulusLength });
  const jwk = publicKey.export({ format: "jwk" });
  const data = Buffer.from("payload to be signed", "utf8");
  const signature = nodeCrypto.sign("sha256", data, privateKey);
  assert.equal(await verifySignature("sha256", data, jwk, signature), true, "rsa verify");
  assert.equal(
    await verifySignature("sha256", Buffer.from("tampered"), jwk, signature),
    false,
    "rsa verify rejects tampering",
  );
  ok("verifySignature rsa");
}

{
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const jwk = publicKey.export({ format: "jwk" });
  const data = Buffer.from("webauthn signed payload", "utf8");
  const signature = nodeCrypto.sign("sha256", data, privateKey);
  assert.equal(await verifySignature("sha256", data, jwk, signature), true, "ecdsa verify");
  ok("verifySignature ecdsa");
}

// The passkey path stores DER SPKI, not a JWK, and signs with ES256 in DER.
{
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const data = Buffer.from("authenticator data plus client data hash", "utf8");
  const derSignature = nodeCrypto.sign("sha256", data, privateKey);
  assert.equal(await verifySignature("sha256", data, new Uint8Array(spki), derSignature), true, "ecdsa via spki der");
  const ieee = nodeCrypto.sign("sha256", data, { key: privateKey, dsaEncoding: "ieee-p1363" });
  assert.equal(await verifySignature("sha256", data, new Uint8Array(spki), ieee), true, "ecdsa raw signature");
  assert.equal(
    await verifySignature("sha256", Buffer.from("tampered payload"), new Uint8Array(spki), derSignature),
    false,
    "ecdsa via spki rejects tampering",
  );
  ok("verifySignature spki");
}

{
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const data = Buffer.from("rs256 passkey payload", "utf8");
  const signature = nodeCrypto.sign("sha256", data, privateKey);
  assert.equal(await verifySignature("sha256", data, new Uint8Array(spki), signature), true, "rs256 via spki der");
  ok("verifySignature rsa spki");
}

console.log(`runtimeCompat matches node:crypto across ${checks} checks.`);
