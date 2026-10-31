import {
  ACCOUNT_SLOT_CHANGE_EVENT,
  DEFAULT_ACCOUNT_SLOT_ID,
  setTursoTokenForSlot,
} from "./accountManager";
import { PUBLIC_TURSO_API_ORIGIN, tursoRpc } from "./tursoClient";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  randomBytes,
  type E2EEVaultContents,
} from "./e2ee/cryptoPrimitives";
import {
  ensureUserE2EEInitialized,
  exportCurrentVaultContents,
  importRestoredVaultContents,
} from "./e2ee/keystore";
import {
  prewarmDecryptedDmBatch,
  prewarmDecryptedGroupBatch,
} from "./e2ee/messagePipeline";
import type { ChatMessage, GroupMessage } from "./types";
import {
  exportAllCachedWallpapers,
  getSavedOutgoingBubbleStyle,
  isValidBubbleStyleId,
  saveCachedWallpaper,
  saveOutgoingBubbleStyle,
} from "./chatCustomization";

export const QR_LINK_PREFIX = "JATEXT_LINK_V1";

export interface WebQrSessionHandle {
  pairingId: string;
  linkSecret: string;
  webDhPubB64: string;
  webDhPrivKey: CryptoKey;
  qrPayload: string;
  expiresAt: number;
  browserName: string;
  osName: string;
}

export interface SealedDeviceLinkBundle {
  v: number;
  userId: string;
  epk: string;
  iv: string;
  ct: string;
}

export interface PlainDeviceLinkBundle {
  v: number;
  userId: string;
  vault: E2EEVaultContents;
  outgoingBubbleStyle?: string;
  wallpapers?: Record<string, string>;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toAb(bytes: Uint8Array): ArrayBuffer {
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

export function detectBrowserAndOs(): { browserName: string; osName: string } {
  if (typeof navigator === "undefined") {
    return { browserName: "Chrome", osName: "" };
  }
  const ua = navigator.userAgent || "";
  let browserName = "Chrome";
  if (/Edg\//i.test(ua)) {
    browserName = "Edge";
  } else if (/OPR\/|Opera/i.test(ua)) {
    browserName = "Opera";
  } else if (/Firefox\/|FxiOS/i.test(ua)) {
    browserName = "Firefox";
  } else if ((navigator as Navigator & { brave?: unknown }).brave) {
    browserName = "Brave";
  } else if (/Chrome\/|CriOS/i.test(ua)) {
    browserName = "Chrome";
  } else if (/Safari\//i.test(ua)) {
    browserName = "Safari";
  }

  let osName = "";
  if (/Windows/i.test(ua)) osName = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) osName = "macOS";
  else if (/CrOS/i.test(ua)) osName = "ChromeOS";
  else if (/Linux/i.test(ua)) osName = "Linux";

  return { browserName, osName };
}

export async function startWebQrPairingSession(
  previousPairingId?: string,
): Promise<WebQrSessionHandle> {
  const subtle = globalThis.crypto.subtle;
  const kp = await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const pubRaw = new Uint8Array(await subtle.exportKey("raw", kp.publicKey));
  const webDhPubB64 = bytesToBase64Url(pubRaw);

  const linkSecret = bytesToBase64Url(randomBytes(24));
  const secretHashBuf = await subtle.digest("SHA-256", toAb(enc.encode(linkSecret)));
  const secretHash = bytesToBase64Url(new Uint8Array(secretHashBuf));

  const { browserName, osName } = detectBrowserAndOs();
  const created = await tursoRpc<{ pairingId: string; expiresAt: number }>(
    "createDeviceLinkSession",
    {
      secretHash,
      webDhPubB64,
      browserName,
      osName,
      ...(previousPairingId ? { previousPairingId } : {}),
    },
    { skipAuthClear: true },
  );

  const qrPayload = `${QR_LINK_PREFIX}|${created.pairingId}|${linkSecret}|${webDhPubB64}`;
  return {
    pairingId: created.pairingId,
    linkSecret,
    webDhPubB64,
    webDhPrivKey: kp.privateKey,
    qrPayload,
    expiresAt: created.expiresAt,
    browserName,
    osName,
  };
}

export async function pollWebQrPairingSession(
  handle: WebQrSessionHandle,
): Promise<{
  status: "pending" | "syncing" | "approved" | "completed" | "expired";
  token?: string;
  sealedBundleJson?: string;
  linkedDeviceId?: string;
}> {
  return await tursoRpc(
    "pollDeviceLinkSession",
    {
      pairingId: handle.pairingId,
      linkSecret: handle.linkSecret,
    },
    { skipAuthClear: true },
  );
}

async function openSealedDeviceLinkBundle(
  handle: WebQrSessionHandle,
  sealedJson: string,
): Promise<PlainDeviceLinkBundle> {
  const subtle = globalThis.crypto.subtle;
  const sealed = JSON.parse(sealedJson) as SealedDeviceLinkBundle;
  if (!sealed?.epk || !sealed?.iv || !sealed?.ct || !sealed?.userId) {
    throw new Error("Invalid encrypted sync bundle from phone.");
  }

  const peerPub = await subtle.importKey(
    "raw",
    toAb(base64UrlToBytes(sealed.epk)),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedBits = await subtle.deriveBits(
    { name: "ECDH", public: peerPub },
    handle.webDhPrivKey,
    256,
  );
  const hkdfBase = await subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const saltBuf = await subtle.digest("SHA-256", toAb(enc.encode(handle.linkSecret)));
  const infoBytes = enc.encode(`JaText-DeviceLink-Wrap-v1|${handle.pairingId}`);
  const aesKey = await subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: saltBuf,
      info: toAb(infoBytes),
    },
    hkdfBase,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const aadBytes = enc.encode(`JaText-DeviceLink-AAD-v1|${handle.pairingId}|${sealed.userId}`);
  const plainBuf = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toAb(base64UrlToBytes(sealed.iv)),
      additionalData: toAb(aadBytes),
    },
    aesKey,
    toAb(base64UrlToBytes(sealed.ct)),
  );
  return JSON.parse(dec.decode(plainBuf)) as PlainDeviceLinkBundle;
}

export async function decryptAndHydrateLinkedWebSession(
  handle: WebQrSessionHandle,
  token: string,
  sealedBundleJson: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  onProgress?.(18);
  const plain = await openSealedDeviceLinkBundle(handle, sealedBundleJson);
  onProgress?.(36);

  // Store linked session token first so Turso RPCs & attachment downloads authenticate cleanly
  await setTursoTokenForSlot(DEFAULT_ACCOUNT_SLOT_ID, token, PUBLIC_TURSO_API_ORIGIN);

  // Initialize and import full E2EE identity + historical keys + group epoch secrets BEFORE entering /chats
  await ensureUserE2EEInitialized(plain.userId);
  if (plain.vault && plain.vault.userId === plain.userId) {
    await importRestoredVaultContents(plain.vault);
  }
  onProgress?.(55);

  if (plain.outgoingBubbleStyle && isValidBubbleStyleId(plain.outgoingBubbleStyle)) {
    saveOutgoingBubbleStyle(plain.outgoingBubbleStyle, { fromRemote: true });
  }
  if (plain.wallpapers && typeof plain.wallpapers === "object") {
    for (const [rawKey, url] of Object.entries(plain.wallpapers)) {
      if (!url) continue;
      const normalizedKey = rawKey.startsWith("grp:")
        ? `group:${rawKey.slice(4)}`
        : rawKey;
      saveCachedWallpaper(normalizedKey, url);
    }
  }

  // Warm recent conversations & encrypted media attachments so chats open instantaneously
  try {
    const boot = await tursoRpc<{
      me?: { id: string } | null;
      previews?: { friendId: string }[];
      groups?: { id: string }[];
    }>("bootstrap", {}, { slotId: DEFAULT_ACCOUNT_SLOT_ID });
    onProgress?.(72);

    const topDms = (boot?.previews ?? []).slice(0, 4);
    const topGroups = (boot?.groups ?? []).slice(0, 3);

    await Promise.all([
      ...topDms.map(async (conv) => {
        try {
          const thread = await tursoRpc<{ messages?: ChatMessage[] }>(
            "listMessages",
            { otherId: conv.friendId },
            { slotId: DEFAULT_ACCOUNT_SLOT_ID },
          );
          await prewarmDecryptedDmBatch((thread?.messages ?? []).slice(-16));
        } catch {
          // Best-effort thread warm
        }
      }),
      ...topGroups.map(async (grp) => {
        try {
          const thread = await tursoRpc<{ messages?: GroupMessage[] }>(
            "listGroupMessages",
            { groupId: grp.id },
            { slotId: DEFAULT_ACCOUNT_SLOT_ID },
          );
          await prewarmDecryptedGroupBatch((thread?.messages ?? []).slice(-16), grp.id);
        } catch {
          // Best-effort group warm
        }
      }),
    ]);

    onProgress?.(88);
  } catch {
    // Non-fatal: reactive store hydrates on mount
  }

  onProgress?.(96);
  await tursoRpc(
    "completeDeviceLinkSession",
    {
      pairingId: handle.pairingId,
      linkSecret: handle.linkSecret,
    },
    { skipAuthClear: true },
  ).catch(() => {});
  onProgress?.(100);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(ACCOUNT_SLOT_CHANGE_EVENT, { detail: DEFAULT_ACCOUNT_SLOT_ID }),
    );
  }
}

/* ================================================================== */
/* Primary Mobile -> Desktop Web QR Linking & Device Management        */
/* ================================================================== */

export interface LinkedWebDeviceInfo {
  id: string;
  deviceLabel: string;
  browserName: string;
  osName: string;
  linkedAt: number;
  lastActiveAt: number;
}

export async function listLinkedWebDevices(): Promise<{
  devices: LinkedWebDeviceInfo[];
  maxDevices: number;
}> {
  const res = await tursoRpc<{
    devices?: LinkedWebDeviceInfo[];
    maxDevices?: number;
  }>("listLinkedDevices", {});
  return {
    devices: Array.isArray(res?.devices) ? res.devices : [],
    maxDevices: typeof res?.maxDevices === "number" ? res.maxDevices : 5,
  };
}

export async function disconnectLinkedWebDevice(deviceId: string): Promise<void> {
  await tursoRpc("disconnectLinkedDevice", { deviceId });
}

export async function approveQrPairingFromPrimaryMobile(
  rawQrPayload: string,
  userId: string,
): Promise<{
  linkedDeviceId: string;
  browserName: string;
  osName: string;
}> {
  const trimmed = rawQrPayload.trim();
  const parts = trimmed.split("|");
  if (parts.length < 4 || parts[0] !== QR_LINK_PREFIX) {
    throw new Error(
      "That QR code is not a valid JaText Web login code. Open jatext.vercel.app/chats on your computer and scan the QR code shown there.",
    );
  }
  const [, pairingId, linkSecret, webDhPubB64] = parts;
  if (!pairingId || !linkSecret || !webDhPubB64) {
    throw new Error("Incomplete JaText QR code payload. Refresh the QR code on your computer and try again.");
  }

  // Step 1: Claim session so Desktop Web immediately shows encrypted sync progress
  const claimed = await tursoRpc<{
    ok: boolean;
    webDhPubB64: string;
    browserName: string;
    osName: string;
  }>("claimDeviceLinkSession", {
    pairingId,
    linkSecret,
  });

  // Step 2: Export E2EE keyring + outgoing bubble style + wallpapers
  await ensureUserE2EEInitialized(userId);
  const vault = exportCurrentVaultContents();
  if (!vault) {
    throw new Error("Your local encryption keyring is still initializing. Please try scanning again in a moment.");
  }

  const rawWallpapers = exportAllCachedWallpapers();
  const wallpapers: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawWallpapers)) {
    if (typeof v === "string" && v.length > 0) {
      wallpapers[k] = v;
    }
  }

  const plainBundle: PlainDeviceLinkBundle = {
    v: 1,
    userId,
    vault,
    outgoingBubbleStyle: getSavedOutgoingBubbleStyle(),
    wallpapers,
  };

  // Step 3: Seal with ephemeral ECDH P-256 + HKDF-SHA256 + AES-256-GCM
  const subtle = globalThis.crypto.subtle;
  const peerPub = await subtle.importKey(
    "raw",
    toAb(base64UrlToBytes(claimed.webDhPubB64 || webDhPubB64)),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const epkPair = await subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const epkRaw = new Uint8Array(await subtle.exportKey("raw", epkPair.publicKey));
  const epk = bytesToBase64Url(epkRaw);

  const sharedBits = await subtle.deriveBits(
    { name: "ECDH", public: peerPub },
    epkPair.privateKey,
    256,
  );
  const hkdfBase = await subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const saltBuf = await subtle.digest("SHA-256", toAb(enc.encode(linkSecret)));
  const infoBytes = enc.encode(`JaText-DeviceLink-Wrap-v1|${pairingId}`);
  const aesKey = await subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: saltBuf,
      info: toAb(infoBytes),
    },
    hkdfBase,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const ivBytes = randomBytes(12);
  const aadBytes = enc.encode(`JaText-DeviceLink-AAD-v1|${pairingId}|${userId}`);
  const ctBuf = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toAb(ivBytes),
      additionalData: toAb(aadBytes),
    },
    aesKey,
    toAb(enc.encode(JSON.stringify(plainBundle))),
  );

  const sealed: SealedDeviceLinkBundle = {
    v: 1,
    userId,
    epk,
    iv: bytesToBase64Url(ivBytes),
    ct: bytesToBase64Url(new Uint8Array(ctBuf)),
  };

  // Step 4: Approve session and push zero-knowledge sealed vault bundle
  const approved = await tursoRpc<{
    ok: boolean;
    linkedDeviceId: string;
    browserName?: string;
    osName?: string;
  }>("approveDeviceLinkSession", {
    pairingId,
    linkSecret,
    sealedBundleJson: JSON.stringify(sealed),
  });

  return {
    linkedDeviceId: approved.linkedDeviceId,
    browserName: approved.browserName || claimed.browserName || "Web Browser",
    osName: approved.osName || claimed.osName || "",
  };
}

