import {
  extractMessageBubbleStyle,
  isValidBubbleStyleId,
  stripBubbleStyleFromText,
} from "../chatCustomization";
import { fetchMediaBytesSmart, tursoRpc } from "../tursoClient";
import {
  extractForwardedContext,
  stripForwardedMetadataFromText,
} from "../forwardedContext";
import type { ChatMessage, ChatPreview, GroupDetails, GroupMessage, GroupSummary, StickerMedia } from "../types";
import {
  E2EE_AUTOSYNC_STICKER_NAME,
  E2EE_BUBBLE_PREF_PREFIX,
  E2EE_DEVSYNC_REQ_PREFIX,
  E2EE_DEVSYNC_RES_PREFIX,
  E2EE_MAX_INLINE_WIRE_CHARS,
  E2EE_VAULT_STICKER_NAME,
  decryptAttachmentBytes,
  encryptAttachmentBytes,
  encryptDmPayload,
  encryptGroupPayload,
  isEncryptedWireBody,
  type E2EEPlainPayload,
  type EncryptedBlobDescriptor,
} from "./cryptoPrimitives";
import {
  buildMessageDecryptCacheKey,
  decryptRemoteAttachmentToObjectUrl,
  decryptWireMessageCached,
  getActiveE2EEState,
  getAllMyIdentities,
  getCachedDecryptedMediaUrl,
  getCachedDecryptedMessage,
  getLatestGroupEpoch,
  getPeerKnownBundles,
  ingestGroupKeySignalPacket,
  ingestPeerIdentityBundle,
  parseGroupKeySignal,
  parseIdentitySignal,
  parseVerifySignal,
  seedOutgoingDecryptedMedia,
  seedOutgoingDecryptedWire,
  setPeerVerifiedState,
  type MessageE2EEProof,
} from "./keystore";

function isSilentEncryptedControlPayload(body: string): boolean {
  return (
    body.startsWith("__JATEXT_CALL_SIG__:") ||
    body.startsWith("__JATEXT_GC_SIG__:") ||
    body.startsWith("__JATEXT_REACT__:") ||
    body.startsWith("__JATEXT_SEEN__:") ||
    body.startsWith("__JATEXT_GROUP_SEEN_V1__:") ||
    body.startsWith("__JATEXT_E2EE_VER__:") ||
    body.startsWith("__JATEXT_IK_V1__:") ||
    body.startsWith("__JATEXT_GK_V1__:") ||
    body.startsWith("__JATEXT_E2EE_IK__:") ||
    body.startsWith("__JATEXT_E2EE_GK__:") ||
    body.startsWith(E2EE_BUBBLE_PREF_PREFIX) ||
    body.startsWith(E2EE_DEVSYNC_REQ_PREFIX) ||
    body.startsWith(E2EE_DEVSYNC_RES_PREFIX)
  );
}

export function isInternalE2EEStickerName(name?: string | null): boolean {
  if (!name) return false;
  return (
    name === E2EE_VAULT_STICKER_NAME ||
    name === E2EE_AUTOSYNC_STICKER_NAME ||
    name.startsWith(E2EE_BUBBLE_PREF_PREFIX) ||
    name.startsWith(E2EE_DEVSYNC_REQ_PREFIX) ||
    name.startsWith(E2EE_DEVSYNC_RES_PREFIX)
  );
}

function maybeApplyMutualVerifySignal(body: string, senderId: string, receiverId?: string): void {
  const ver = parseVerifySignal(body);
  if (!ver) return;
  const state = getActiveE2EEState();
  if (!state) return;
  const peerId = senderId === state.userId ? receiverId : senderId;
  if (peerId && peerId !== state.userId) {
    void setPeerVerifiedState(peerId, true);
  }
}

export function scanDmRowsForE2EESignals(rows: { id: string; senderId: string; receiverId?: string; body: string }[]): void {
  for (const row of rows) {
    const ik = parseIdentitySignal(row.body, row.senderId);
    if (ik) {
      void ingestPeerIdentityBundle(ik);
    }
    maybeApplyMutualVerifySignal(row.body, row.senderId, row.receiverId);
  }
}

export async function scanDmRowsForE2EESignalsAsync(
  rows: { id: string; senderId: string; receiverId?: string; body: string }[],
): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  for (const row of rows) {
    const ik = parseIdentitySignal(row.body, row.senderId);
    if (ik) {
      tasks.push(ingestPeerIdentityBundle(ik));
    }
    maybeApplyMutualVerifySignal(row.body, row.senderId, row.receiverId);
  }
  if (tasks.length > 0) await Promise.all(tasks);
}

export function scanGroupRowsForE2EESignals(
  rows: { id: string; senderId: string; body: string }[],
): void {
  // First pass: ingest all member public identity bundles
  for (const row of rows) {
    const ik = parseIdentitySignal(row.body, row.senderId);
    if (ik) {
      void ingestPeerIdentityBundle(ik);
    }
  }
  // Second pass: unwrap any group epoch key envelopes addressed to us
  for (const row of rows) {
    const gk = parseGroupKeySignal(row.body);
    if (gk) {
      void ingestGroupKeySignalPacket(gk, row.senderId);
    }
  }
}

export async function scanGroupRowsForE2EESignalsAsync(
  rows: { id: string; senderId: string; body: string }[],
): Promise<void> {
  const ikTasks: Promise<unknown>[] = [];
  for (const row of rows) {
    const ik = parseIdentitySignal(row.body, row.senderId);
    if (ik) ikTasks.push(ingestPeerIdentityBundle(ik));
  }
  if (ikTasks.length > 0) await Promise.all(ikTasks);

  const gkTasks: Promise<unknown>[] = [];
  for (const row of rows) {
    const gk = parseGroupKeySignal(row.body);
    if (gk) gkTasks.push(ingestGroupKeySignalPacket(gk, row.senderId));
  }
  if (gkTasks.length > 0) await Promise.all(gkTasks);
}

/* ------------------------------------------------------------------ */
/* Outgoing Encryption Helpers                                         */
/* ------------------------------------------------------------------ */

export interface PreparedEncryptedWrite<TStorageId = string> {
  encrypted: boolean;
  wireBody: string;
  attachmentId?: TStorageId;
  attachmentName?: string;
  attachmentType?: string;
}

const lastPeerSendRefreshAt = new Map<string, number>();

export async function prepareOutgoingDmEncrypted<TStorageId = string>(params: {
  receiverId: string;
  wireBody: string;
  file?: File;
  sticker?: StickerMedia;
  uploadFile: (file: File) => Promise<TStorageId>;
}): Promise<PreparedEncryptedWrite<TStorageId> | null> {
  const { receiverId, wireBody, file, sticker, uploadFile } = params;
  let state = getActiveE2EEState();
  if (!state) return null;

  // Refresh peer & own remote device bundles (12s TTL) so unlinked/switched devices never use stale keys
  const nowTs = Date.now();
  const prevRef = lastPeerSendRefreshAt.get(receiverId) ?? 0;
  if (!state.peerKeys[receiverId] || nowTs - prevRef > 12_000) {
    lastPeerSendRefreshAt.set(receiverId, nowTs);
    try {
      const res = await tursoRpc<{
        bundles?: Array<{
          userId: string;
          keyId: string;
          dhPubB64: string;
          sigPubB64: string;
          selfSigB64: string;
          ts?: number;
        }>;
      }>("getUserE2EEIdentities", { userIds: [receiverId, state.userId] });
      for (const b of res?.bundles ?? []) {
        await ingestPeerIdentityBundle({
          userId: b.userId,
          keyId: b.keyId,
          dhPubB64: b.dhPubB64,
          sigPubB64: b.sigPubB64,
          selfSigB64: b.selfSigB64,
          ts: b.ts ?? nowTs,
        }).catch(() => undefined);
      }
      state = getActiveE2EEState() ?? state;
    } catch {
      // Fall back to cached peerEntry if offline
    }
  }

  let peerEntry = state.peerKeys[receiverId];
  if (!peerEntry && receiverId === state.userId) {
    const ownPrimary = getAllMyIdentities(state)[0];
    if (ownPrimary) {
      await ingestPeerIdentityBundle({
        userId: state.userId,
        keyId: ownPrimary.keyId,
        dhPubB64: ownPrimary.dhPubB64,
        sigPubB64: ownPrimary.sigPubB64,
        selfSigB64: ownPrimary.selfSigB64,
        ts: nowTs,
      }).catch(() => undefined);
      state = getActiveE2EEState() ?? state;
      peerEntry = state.peerKeys[receiverId];
    }
  }
  if (!peerEntry) return null;

  let attachmentId: TStorageId | undefined;
  let attDescriptor: EncryptedBlobDescriptor | undefined;
  let stkPayload: E2EEPlainPayload["stk"] | undefined;

  if (file) {
    const plainBytes = new Uint8Array(await file.arrayBuffer());
    const { ciphertextBytes, descriptor } = await encryptAttachmentBytes(
      plainBytes,
      file.name || "attachment",
      file.type || "application/octet-stream",
    );
    seedOutgoingDecryptedMedia(descriptor, plainBytes);
    const encFile = new File([ciphertextBytes], "encrypted.jatext", {
      type: "application/octet-stream",
    });
    attachmentId = await uploadFile(encFile);
    attDescriptor = descriptor;
  } else if (sticker) {
    if (sticker.source === "klipy" && sticker.url) {
      stkPayload = {
        url: sticker.url,
        n: sticker.name,
        key: sticker.key,
        mt: sticker.mediaType,
      };
    } else if (sticker.url) {
      const resp = await fetch(sticker.url);
      if (!resp.ok) throw new Error("Could not read custom sticker for encryption.");
      const plainBytes = new Uint8Array(await resp.arrayBuffer());
      const mime = sticker.mediaType === "gif" ? "image/gif" : "image/png";
      const { ciphertextBytes, descriptor } = await encryptAttachmentBytes(
        plainBytes,
        sticker.name || "sticker.png",
        mime,
      );
      seedOutgoingDecryptedMedia(descriptor, plainBytes);
      const encFile = new File([ciphertextBytes], "encrypted.jatext", {
        type: "application/octet-stream",
      });
      attachmentId = await uploadFile(encFile);
      stkPayload = {
        att: descriptor,
        n: sticker.name,
        key: sticker.key,
        mt: sticker.mediaType,
      };
    }
  }

  const outgoingStyle = extractMessageBubbleStyle(wireBody, file?.type).bubbleStyle;

  let payload: E2EEPlainPayload = {
    v: 1,
    b: wireBody,
    ...(outgoingStyle !== "default" ? { bs: outgoingStyle } : {}),
    ...(attDescriptor ? { att: attDescriptor } : {}),
    ...(stkPayload ? { stk: stkPayload } : {}),
  };

  // Pre-check if very long message text needs encrypted msgBlob spill in attachmentId
  if (!attachmentId && wireBody.length > 1800) {
    const textBytes = new TextEncoder().encode(wireBody);
    const { ciphertextBytes, descriptor } = await encryptAttachmentBytes(
      textBytes,
      "message.txt",
      "text/plain;charset=utf-8",
    );
    const encFile = new File([ciphertextBytes], "encrypted.jatext", {
      type: "application/octet-stream",
    });
    attachmentId = await uploadFile(encFile);
    payload = {
      v: 1,
      b: "",
      ...(outgoingStyle !== "default" ? { bs: outgoingStyle } : {}),
      msgBlob: descriptor,
      ...(stkPayload ? { stk: stkPayload } : {}),
    };
  }

  const silentSignal = isSilentEncryptedControlPayload(wireBody);

  const myRemoteEntry = state.peerKeys[state.userId];
  const additionalDeviceBundles = [
    ...getPeerKnownBundles(peerEntry).map((b) => ({ keyId: b.keyId, dhPubB64: b.dhPubB64 })),
    ...getPeerKnownBundles(myRemoteEntry).map((b) => ({ keyId: b.keyId, dhPubB64: b.dhPubB64 })),
    ...getAllMyIdentities(state).map((i) => ({ keyId: i.keyId, dhPubB64: i.dhPubB64 })),
  ];

  const encryptedWire = await encryptDmPayload({
    senderIdentity: state.primaryIdentity,
    receiverPublic: peerEntry.bundle,
    additionalDeviceBundles,
    senderId: state.userId,
    receiverId,
    payload,
    silentSignal,
    uploadOverflowCiphertext: async () => {
      throw new Error("Message is too long (exceeds encrypted wire limit).");
    },
  });

  if (encryptedWire.length > E2EE_MAX_INLINE_WIRE_CHARS + 500) {
    throw new Error("Encrypted message exceeds maximum allowed wire length.");
  }

  let finalDmWire = encryptedWire;
  if (wireBody.startsWith("__JATEXT_CALL__:")) {
    if (wireBody.includes('"state":"ringing"')) {
      const callMode = wireBody.includes('"mode":"video"') ? "video" : "voice";
      finalDmWire = `${encryptedWire}\n(__JATEXT_CALL_DM_RINGING__:${callMode})`;
    } else if (
      wireBody.includes('"state":"missed"') ||
      wireBody.includes('"state":"ended"') ||
      wireBody.includes('"state":"declined"')
    ) {
      finalDmWire = `${encryptedWire}\n(__JATEXT_CALL_DM_ENDED__)`;
    }
  } else if (wireBody.startsWith("__JATEXT_CALL_SIG__:")) {
    let ctrlSuffix = "";
    try {
      const sigObj = JSON.parse(wireBody.slice("__JATEXT_CALL_SIG__:".length)) as {
        callId?: string;
        type?: string;
        deviceSessionId?: string;
        ts?: number;
      };
      const cid = String(sigObj.callId ?? "").replace(/[^A-Za-z0-9_-]/g, "");
      const stype = String(sigObj.type ?? "").replace(/[^A-Za-z0-9_-]/g, "");
      const devId = String(sigObj.deviceSessionId ?? "").replace(/[^A-Za-z0-9_-]/g, "");
      const ts = Number.isFinite(sigObj.ts) ? Number(sigObj.ts) : Date.now();
      if (cid && (stype === "hangup" || stype === "decline")) {
        ctrlSuffix = `\n(__JATEXT_CALL_CANCEL__:${cid}:${stype}:${devId}:${ts})`;
      } else if (cid && (stype === "claim" || stype === "answer")) {
        ctrlSuffix = `\n(__JATEXT_CALL_CLAIM__:${cid}:${stype}:${devId}:${ts})`;
      }
    } catch {
      if (wireBody.includes('"type":"hangup"') || wireBody.includes('"type":"decline"')) {
        ctrlSuffix = `\n(__JATEXT_CALL_CANCEL__)`;
      } else if (wireBody.includes('"type":"claim"') || wireBody.includes('"type":"answer"')) {
        ctrlSuffix = `\n(__JATEXT_CALL_CLAIM__)`;
      }
    }
    if (ctrlSuffix) {
      finalDmWire = `${encryptedWire}${ctrlSuffix}`;
    }
  }

  const dmPreseedPayload: E2EEPlainPayload = payload.msgBlob
    ? { ...payload, b: wireBody, msgBlob: undefined }
    : payload;
  seedOutgoingDecryptedWire(finalDmWire, dmPreseedPayload, {
    encrypted: true,
    decrypted: true,
    signatureVerified: true,
    algorithm: "ECDH P-256 + HKDF-SHA-256 + AES-256-GCM + ECDSA P-256",
    channel: "dm",
    senderKeyId: state.primaryIdentity.keyId,
    receiverKeyId: peerEntry.bundle.keyId,
    rawWireBody: finalDmWire,
    attachmentEncrypted: Boolean(payload.att || payload.stk?.att),
  });

  return {
    encrypted: true,
    wireBody: finalDmWire,
    ...(attachmentId !== undefined
      ? {
          attachmentId,
          attachmentName: "encrypted.jatext",
          attachmentType: "application/octet-stream",
        }
      : {}),
  };
}

export async function prepareOutgoingGroupEncrypted<TStorageId = string>(params: {
  groupId: string;
  wireBody: string;
  file?: File;
  sticker?: StickerMedia;
  canMentionEveryone?: boolean;
  uploadFile: (file: File) => Promise<TStorageId>;
}): Promise<PreparedEncryptedWrite<TStorageId> | null> {
  const { groupId, wireBody, file, sticker, canMentionEveryone = false, uploadFile } = params;
  const state = getActiveE2EEState();
  if (!state) return null;
  const epochEntry = getLatestGroupEpoch(groupId);
  if (!epochEntry) return null;

  let attachmentId: TStorageId | undefined;
  let attDescriptor: EncryptedBlobDescriptor | undefined;
  let stkPayload: E2EEPlainPayload["stk"] | undefined;

  if (file) {
    const plainBytes = new Uint8Array(await file.arrayBuffer());
    const { ciphertextBytes, descriptor } = await encryptAttachmentBytes(
      plainBytes,
      file.name || "attachment",
      file.type || "application/octet-stream",
    );
    seedOutgoingDecryptedMedia(descriptor, plainBytes);
    const encFile = new File([ciphertextBytes], "encrypted.jatext", {
      type: "application/octet-stream",
    });
    attachmentId = await uploadFile(encFile);
    attDescriptor = descriptor;
  } else if (sticker) {
    if (sticker.source === "klipy" && sticker.url) {
      stkPayload = {
        url: sticker.url,
        n: sticker.name,
        key: sticker.key,
        mt: sticker.mediaType,
      };
    } else if (sticker.url) {
      const resp = await fetch(sticker.url);
      if (!resp.ok) throw new Error("Could not read custom sticker for group encryption.");
      const plainBytes = new Uint8Array(await resp.arrayBuffer());
      const mime = sticker.mediaType === "gif" ? "image/gif" : "image/png";
      const { ciphertextBytes, descriptor } = await encryptAttachmentBytes(
        plainBytes,
        sticker.name || "sticker.png",
        mime,
      );
      seedOutgoingDecryptedMedia(descriptor, plainBytes);
      const encFile = new File([ciphertextBytes], "encrypted.jatext", {
        type: "application/octet-stream",
      });
      attachmentId = await uploadFile(encFile);
      stkPayload = {
        att: descriptor,
        n: sticker.name,
        key: sticker.key,
        mt: sticker.mediaType,
      };
    }
  }

  const outgoingGroupStyle = extractMessageBubbleStyle(wireBody, file?.type).bubbleStyle;

  let payload: E2EEPlainPayload = {
    v: 1,
    b: wireBody,
    ...(outgoingGroupStyle !== "default" ? { bs: outgoingGroupStyle } : {}),
    ...(attDescriptor ? { att: attDescriptor } : {}),
    ...(stkPayload ? { stk: stkPayload } : {}),
  };

  if (!attachmentId && wireBody.length > 1800) {
    const textBytes = new TextEncoder().encode(wireBody);
    const { ciphertextBytes, descriptor } = await encryptAttachmentBytes(
      textBytes,
      "message.txt",
      "text/plain;charset=utf-8",
    );
    const encFile = new File([ciphertextBytes], "encrypted.jatext", {
      type: "application/octet-stream",
    });
    attachmentId = await uploadFile(encFile);
    payload = {
      v: 1,
      b: "",
      ...(outgoingGroupStyle !== "default" ? { bs: outgoingGroupStyle } : {}),
      msgBlob: descriptor,
      ...(stkPayload ? { stk: stkPayload } : {}),
    };
  }

  const silentSignal = isSilentEncryptedControlPayload(wireBody);

  const encryptedWire = await encryptGroupPayload({
    groupId,
    epoch: epochEntry.epoch,
    epochSecretB64: epochEntry.secretB64,
    senderIdentity: state.primaryIdentity,
    senderId: state.userId,
    payload,
    silentSignal,
    uploadOverflowCiphertext: async () => {
      throw new Error("Group message is too long.");
    },
  });

  // Append lightweight mention routing metadata on a second line so Convex push dispatch
  // notifies mentioned group members (and @everyone ONLY for group owner / moderators)
  // while keeping message text end-to-end encrypted inside the v1 JSON envelope.
  let finalWire = encryptedWire;
  if (
    wireBody.startsWith("__JATEXT_CALL_GRP__:") &&
    wireBody.includes('"state":"ended"') &&
    encryptedWire.length + 32 <= 3980
  ) {
    finalWire = `${encryptedWire}\n(__JATEXT_CALL_GRP_ENDED__)`;
  } else if (wireBody.startsWith("__JATEXT_CALL_SIG__:GRP:") && encryptedWire.length + 32 <= 3980) {
    if (wireBody.includes('"type":"ended"')) {
      finalWire = `${encryptedWire}\n(__JATEXT_CALL_GRP_ENDED__)`;
    } else if (
      wireBody.includes('"type":"claim-ring"') ||
      wireBody.includes('"type":"decline-ring"') ||
      wireBody.includes('"type":"join"')
    ) {
      finalWire = `${encryptedWire}\n(__JATEXT_CALL_CLAIM__)`;
    }
  } else if (!silentSignal && wireBody) {
    if (
      wireBody.startsWith("__JATEXT_CALL_GRP__:") &&
      wireBody.includes('"state":"active"') &&
      encryptedWire.length + 38 <= 3980
    ) {
      const grpMode = wireBody.includes('"mode":"video"') ? "video" : "voice";
      finalWire = `${encryptedWire}\n(__JATEXT_CALL_GRP_ACTIVE__:${grpMode})`;
    } else {
      const cleanTextForMentions = stripBubbleStyleFromText(wireBody);
      const wantsEveryone =
        canMentionEveryone && /(?:^|[\s(])@everyone\b/i.test(cleanTextForMentions);
      if (wantsEveryone) {
        if (encryptedWire.length + 13 <= 3980) {
          finalWire = `${encryptedWire}\n(@everyone)`;
        }
      } else {
        const handles = new Set<string>();
        const re = /(?:^|[\s(])@([a-z0-9._]{3,20})\b/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(cleanTextForMentions)) !== null) {
          const h = m[1].toLowerCase();
          if (h !== "everyone") handles.add(`@${h}`);
        }
        if (handles.size > 0) {
          const suffix = `\n(${Array.from(handles).slice(0, 25).join(" ")})`;
          if (encryptedWire.length + suffix.length <= 3980) {
            finalWire = `${encryptedWire}${suffix}`;
          }
        }
      }
    }
  }

  const grpPreseedPayload: E2EEPlainPayload = payload.msgBlob
    ? { ...payload, b: wireBody, msgBlob: undefined }
    : payload;
  seedOutgoingDecryptedWire(finalWire, grpPreseedPayload, {
    encrypted: true,
    decrypted: true,
    signatureVerified: true,
    algorithm: "Group Epoch HKDF-SHA-256 + AES-256-GCM + ECDSA P-256",
    channel: "grp",
    senderKeyId: state.primaryIdentity.keyId,
    groupEpoch: epochEntry.epoch,
    rawWireBody: finalWire,
    attachmentEncrypted: Boolean(payload.att || payload.stk?.att),
  });

  return {
    encrypted: true,
    wireBody: finalWire,
    ...(attachmentId !== undefined
      ? {
          attachmentId,
          attachmentName: "encrypted.jatext",
          attachmentType: "application/octet-stream",
        }
      : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Incoming Decryption & Media Blob Resolution                         */
/* ------------------------------------------------------------------ */

const overflowCipherCache = new Map<string, Uint8Array<ArrayBuffer>>();
const inFlightOverflowCipher = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

function fetchOverflowCiphertextBytes(storageId: string): Promise<Uint8Array<ArrayBuffer>> {
  const normalizedUrl =
    storageId.startsWith("http://") ||
    storageId.startsWith("https://") ||
    storageId.startsWith("/")
      ? storageId
      : `/api/media?id=${encodeURIComponent(storageId)}`;
  const hit = overflowCipherCache.get(normalizedUrl);
  if (hit) return Promise.resolve(hit);
  const inflight = inFlightOverflowCipher.get(normalizedUrl);
  if (inflight) return inflight;

  const task = (async (): Promise<Uint8Array<ArrayBuffer>> => {
    try {
      const raw = await fetchMediaBytesSmart(normalizedUrl);
      const copy = new Uint8Array(raw.byteLength);
      copy.set(raw);
      overflowCipherCache.set(normalizedUrl, copy);
      return copy;
    } finally {
      inFlightOverflowCipher.delete(normalizedUrl);
    }
  })();
  inFlightOverflowCipher.set(normalizedUrl, task);
  return task;
}

const msgBlobTextCache = new Map<string, string>();
const inFlightMsgBlob = new Map<string, Promise<void>>();

function resolveSpilledText(
  cipherUrl: string | undefined,
  descriptor: EncryptedBlobDescriptor | undefined,
  onResolved: () => void,
): string | null {
  if (!descriptor || !cipherUrl) return null;
  const key = `${descriptor.h}:${cipherUrl}`;
  const hit = msgBlobTextCache.get(key);
  if (hit !== undefined) return hit;

  if (!inFlightMsgBlob.has(key)) {
    const p = (async () => {
      try {
        const cipherBytes = await fetchMediaBytesSmart(cipherUrl);
        const plainBytes = await decryptAttachmentBytes(cipherBytes, descriptor);
        msgBlobTextCache.set(key, new TextDecoder().decode(plainBytes));
        onResolved();
      } catch {
        // Ignore transient network errors
      } finally {
        inFlightMsgBlob.delete(key);
      }
    })();
    inFlightMsgBlob.set(key, p);
  }
  return "Decrypting long message…";
}

function sanitizeViewOnceReplyPreview(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("__JATEXT_VO_V1__:")) {
    return "View once";
  }
  return text;
}

function resolveReplyBody(
  reply: { id: string; senderId: string; body: string } | undefined,
  dmPeerReceiverId?: string,
  groupId?: string,
): string | undefined {
  if (!reply) return undefined;
  if (!isEncryptedWireBody(reply.body)) return sanitizeViewOnceReplyPreview(reply.body);

  const state = getActiveE2EEState();
  const cacheKey = buildMessageDecryptCacheKey(`reply:${reply.id}`, reply.body, 0);
  const cached = getCachedDecryptedMessage(cacheKey, reply.body);
  if (cached) {
    if (cached.payload) {
      const resolved =
        cached.payload.b || cached.payload.att?.n || cached.payload.stk?.n || "Attachment";
      return sanitizeViewOnceReplyPreview(resolved);
    }
    return cached.proof.error ?? "Encrypted message";
  }

  const receiverId =
    dmPeerReceiverId && state
      ? reply.senderId === state.userId
        ? dmPeerReceiverId
        : state.userId
      : undefined;

  void decryptWireMessageCached({
    cacheKey,
    rawBody: reply.body,
    senderId: reply.senderId,
    receiverId,
    groupId,
    fetchOverflowCiphertext: fetchOverflowCiphertextBytes,
  });
  return "Decrypting…";
}

function extractFallbackCallControlSignal(rawBody: string): string | null {
  const m = rawBody.match(
    /\(__JATEXT_CALL_(?:CANCEL|CLAIM)__:([A-Za-z0-9_-]+):(hangup|decline|claim|answer):([A-Za-z0-9_-]*):(\d+)\)/,
  );
  if (!m) return null;
  const [, callId, type, deviceSessionId, tsStr] = m;
  if (type === "answer") {
    // Only use control fallback as a sibling-device claim header until full SDP decrypts
    return `__JATEXT_CALL_SIG__:${JSON.stringify({
      callId,
      type: "claim",
      ...(deviceSessionId ? { deviceSessionId } : {}),
      ts: Number(tsStr) || Date.now(),
    })}`;
  }
  return `__JATEXT_CALL_SIG__:${JSON.stringify({
    callId,
    type,
    ...(deviceSessionId ? { deviceSessionId } : {}),
    ts: Number(tsStr) || Date.now(),
  })}`;
}

export function hydrateDecryptedDmMessage(
  raw: ChatMessage,
  peerUserId: string,
  triggerRerender: () => void,
): ChatMessage {
  if (raw.unsentAt) return raw;

  const decryptedReplyBody = resolveReplyBody(raw.replyTo, peerUserId, undefined);
  const withReply =
    raw.replyTo && decryptedReplyBody !== undefined
      ? { ...raw, replyTo: { ...raw.replyTo, body: decryptedReplyBody } }
      : raw;

  if (!isEncryptedWireBody(raw.body)) {
    const { context: fwdContext, strippedBody } = extractForwardedContext(raw.body);
    const plainProof: MessageE2EEProof = {
      encrypted: false,
      decrypted: true,
      signatureVerified: false,
      algorithm: "Plaintext (sent before E2EE activation)",
      channel: "plain",
      rawWireBody: raw.body,
    };
    return {
      ...withReply,
      body: strippedBody,
      forwardedContext: fwdContext ?? withReply.forwardedContext,
      forwardedFrom:
        withReply.forwardedFrom ?? fwdContext?.originalSenderName,
      e2ee: plainProof,
    };
  }

  const isSilentWire = raw.body.startsWith("__JATEXT_CALL_SIG__:");
  const fallbackControlBody = isSilentWire ? extractFallbackCallControlSignal(raw.body) : null;
  const cacheKey = buildMessageDecryptCacheKey(raw.id, raw.body, raw.editedAt);
  const cached = getCachedDecryptedMessage(cacheKey, raw.body);
  if (!cached) {
    void decryptWireMessageCached({
      cacheKey,
      rawBody: raw.body,
      senderId: raw.senderId,
      receiverId: raw.receiverId,
      fetchOverflowCiphertext: fetchOverflowCiphertextBytes,
    }).then(() => triggerRerender());
    if (fallbackControlBody) {
      return {
        ...withReply,
        body: fallbackControlBody,
        attachmentUrl: undefined,
        attachmentName: undefined,
        attachmentType: undefined,
        e2ee: {
          encrypted: true,
          decrypted: true,
          signatureVerified: false,
          algorithm: "ECDH P-256 + HKDF-SHA-256 + AES-256-GCM + ECDSA P-256",
          channel: "dm",
          rawWireBody: raw.body,
        },
      };
    }
    return {
      ...withReply,
      body: isSilentWire ? "__JATEXT_CALL_SIG__:decrypting" : "Decrypting message…",
      attachmentUrl: undefined,
      attachmentName: undefined,
      attachmentType: undefined,
      e2ee: {
        encrypted: true,
        decrypted: false,
        signatureVerified: false,
        algorithm: "ECDH P-256 + HKDF-SHA-256 + AES-256-GCM + ECDSA P-256",
        channel: "dm",
        rawWireBody: raw.body,
      },
    };
  }

  if (!cached.payload) {
    if (fallbackControlBody) {
      return {
        ...withReply,
        body: fallbackControlBody,
        attachmentUrl: undefined,
        attachmentName: undefined,
        attachmentType: undefined,
        e2ee: { ...cached.proof, decrypted: true },
      };
    }
    return {
      ...withReply,
      body: isSilentWire
        ? "__JATEXT_CALL_SIG__:undecryptable"
        : cached.proof.error ?? "Encrypted message",
      attachmentUrl: undefined,
      attachmentName: undefined,
      attachmentType: undefined,
      e2ee: cached.proof,
    };
  }

  const { payload, proof } = cached;
  let resolvedBody = payload.b;
  if (payload.msgBlob) {
    resolvedBody = resolveSpilledText(raw.attachmentUrl, payload.msgBlob, triggerRerender) ?? "";
  }
  maybeApplyMutualVerifySignal(resolvedBody, raw.senderId, raw.receiverId);

  let attachmentUrl = raw.attachmentUrl;
  let attachmentName = raw.attachmentName;
  let attachmentType = raw.attachmentType;
  let stickerKey = raw.stickerKey;

  if (payload.msgBlob) {
    attachmentUrl = undefined;
    attachmentName = undefined;
    attachmentType = undefined;
  } else if (payload.att && raw.attachmentUrl) {
    const objUrl = getCachedDecryptedMediaUrl(raw.attachmentUrl, payload.att);
    if (objUrl) {
      attachmentUrl = objUrl;
    } else {
      attachmentUrl = undefined;
      void decryptRemoteAttachmentToObjectUrl(raw.attachmentUrl, payload.att).then(() =>
        triggerRerender(),
      );
    }
    attachmentName = payload.att.n;
    attachmentType = payload.att.t;
  } else if (payload.stk) {
    stickerKey = payload.stk.key;
    attachmentName = payload.stk.n;
    attachmentType = payload.stk.mt === "gif" ? "image/gif" : "image/png";
    if (payload.stk.url) {
      attachmentUrl = payload.stk.url;
    } else if (payload.stk.att && raw.attachmentUrl) {
      const objUrl = getCachedDecryptedMediaUrl(raw.attachmentUrl, payload.stk.att);
      if (objUrl) {
        attachmentUrl = objUrl;
      } else {
        attachmentUrl = undefined;
        void decryptRemoteAttachmentToObjectUrl(raw.attachmentUrl, payload.stk.att).then(() =>
          triggerRerender(),
        );
      }
      attachmentType = payload.stk.att.t;
    }
  }

  const { cleanBody: bubbleCleanBody, bubbleStyle: markerStyle } = extractMessageBubbleStyle(resolvedBody, attachmentType);
  const { context: fwdContext, strippedBody: cleanBody } = extractForwardedContext(bubbleCleanBody);
  const explicitStyle =
    payload.bs && isValidBubbleStyleId(payload.bs) ? payload.bs : undefined;
  const resolvedStyle =
    explicitStyle ?? (markerStyle !== "default" ? markerStyle : withReply.bubbleStyle);
  const cleanedMime = attachmentType ? attachmentType.replace(/;jbs=[a-z0-9-]+/gi, "") : undefined;

  return {
    ...withReply,
    body: cleanBody,
    bubbleStyle: resolvedStyle,
    forwardedContext: fwdContext ?? withReply.forwardedContext,
    forwardedFrom:
      withReply.forwardedFrom ?? fwdContext?.originalSenderName,
    attachmentUrl,
    attachmentName,
    attachmentType: cleanedMime,
    stickerKey,
    replyTo: withReply.replyTo
      ? {
          ...withReply.replyTo,
          body: stripForwardedMetadataFromText(stripBubbleStyleFromText(withReply.replyTo.body)),
        }
      : undefined,
    e2ee: proof,
  };
}

function extractClientMentions(
  body: string,
  senderId: string,
  groupDetails: GroupDetails | null,
): { mentionsEveryone: boolean; mentionedUserIds: string[] } {
  const rawWantsEveryone = /(?:^|[\s(])@everyone\b/i.test(body);
  if (!groupDetails) {
    return { mentionsEveryone: false, mentionedUserIds: [] };
  }
  const senderMember = groupDetails.members.find((m) => m.id === senderId);
  const senderCanMentionEveryone =
    senderMember?.role === "owner" || senderMember?.role === "moderator";
  const mentionsEveryone = rawWantsEveryone && senderCanMentionEveryone;
  if (mentionsEveryone) {
    return {
      mentionsEveryone: true,
      mentionedUserIds: groupDetails.members.filter((m) => m.id !== senderId).map((m) => m.id),
    };
  }
  const handles = new Set<string>();
  const re = /(?:^|[\s(])@([a-z0-9._]{3,20})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const h = m[1].toLowerCase();
    if (h !== "everyone") handles.add(h);
  }
  if (handles.size === 0) return { mentionsEveryone: false, mentionedUserIds: [] };
  const mentionedUserIds = groupDetails.members
    .filter((mem) => mem.id !== senderId && mem.username && handles.has(mem.username.toLowerCase()))
    .map((mem) => mem.id);
  return { mentionsEveryone: false, mentionedUserIds };
}

export function hydrateDecryptedGroupMessage(
  raw: GroupMessage,
  groupId: string,
  groupDetails: GroupDetails | null,
  triggerRerender: () => void,
): GroupMessage {
  if (raw.unsentAt) return raw;

  const decryptedReplyBody = raw.replyTo
    ? resolveReplyBody(
        { id: raw.replyTo.id, senderId: raw.replyTo.senderId, body: raw.replyTo.body },
        undefined,
        groupId,
      )
    : undefined;
  const withReply =
    raw.replyTo && decryptedReplyBody !== undefined
      ? { ...raw, replyTo: { ...raw.replyTo, body: decryptedReplyBody } }
      : raw;

  if (!isEncryptedWireBody(raw.body)) {
    const { context: fwdContext, strippedBody } = extractForwardedContext(raw.body);
    return {
      ...withReply,
      body: strippedBody,
      forwardedContext: fwdContext ?? withReply.forwardedContext,
      forwardedFromName:
        withReply.forwardedFromName ?? fwdContext?.originalSenderName,
      e2ee: {
        encrypted: false,
        decrypted: true,
        signatureVerified: false,
        algorithm: "Plaintext (sent before E2EE activation)",
        channel: "plain",
        rawWireBody: raw.body,
      },
    };
  }

  const isSilentWire = raw.body.startsWith("__JATEXT_CALL_SIG__:");
  const cacheKey = buildMessageDecryptCacheKey(raw.id, raw.body, raw.editedAt);
  const cached = getCachedDecryptedMessage(cacheKey, raw.body);
  if (!cached) {
    void decryptWireMessageCached({
      cacheKey,
      rawBody: raw.body,
      senderId: raw.senderId,
      groupId,
      fetchOverflowCiphertext: fetchOverflowCiphertextBytes,
    }).then(() => triggerRerender());
    return {
      ...withReply,
      body: isSilentWire ? "__JATEXT_CALL_SIG__:decrypting" : "Decrypting message…",
      attachmentUrl: undefined,
      attachmentName: undefined,
      attachmentType: undefined,
      stickerUrl: undefined,
      e2ee: {
        encrypted: true,
        decrypted: false,
        signatureVerified: false,
        algorithm: "Group Epoch HKDF-SHA-256 + AES-256-GCM + ECDSA P-256",
        channel: "grp",
        rawWireBody: raw.body,
      },
    };
  }

  if (!cached.payload) {
    return {
      ...withReply,
      body: isSilentWire
        ? "__JATEXT_CALL_SIG__:undecryptable"
        : cached.proof.error ?? "Encrypted message",
      attachmentUrl: undefined,
      attachmentName: undefined,
      attachmentType: undefined,
      stickerUrl: undefined,
      e2ee: cached.proof,
    };
  }

  const { payload, proof } = cached;
  let resolvedBody = payload.b;
  if (payload.msgBlob) {
    resolvedBody = resolveSpilledText(raw.attachmentUrl, payload.msgBlob, triggerRerender) ?? "";
  }

  let attachmentUrl = raw.attachmentUrl;
  let attachmentName = raw.attachmentName;
  let attachmentType = raw.attachmentType;
  let stickerUrl = raw.stickerUrl;
  let stickerName = raw.stickerName;
  let stickerKey = raw.stickerKey;

  if (payload.msgBlob) {
    attachmentUrl = undefined;
    attachmentName = undefined;
    attachmentType = undefined;
  } else if (payload.att && raw.attachmentUrl) {
    const objUrl = getCachedDecryptedMediaUrl(raw.attachmentUrl, payload.att);
    if (objUrl) {
      attachmentUrl = objUrl;
    } else {
      attachmentUrl = undefined;
      void decryptRemoteAttachmentToObjectUrl(raw.attachmentUrl, payload.att).then(() =>
        triggerRerender(),
      );
    }
    attachmentName = payload.att.n;
    attachmentType = payload.att.t;
  } else if (payload.stk) {
    stickerKey = payload.stk.key;
    stickerName = payload.stk.n;
    if (payload.stk.url) {
      stickerUrl = payload.stk.url;
      attachmentUrl = undefined;
    } else if (payload.stk.att && raw.attachmentUrl) {
      const objUrl = getCachedDecryptedMediaUrl(raw.attachmentUrl, payload.stk.att);
      if (objUrl) {
        stickerUrl = objUrl;
      } else {
        stickerUrl = undefined;
        void decryptRemoteAttachmentToObjectUrl(raw.attachmentUrl, payload.stk.att).then(() =>
          triggerRerender(),
        );
      }
      attachmentUrl = undefined;
    }
  }

  const { cleanBody: bubbleCleanBody, bubbleStyle: markerStyle } = extractMessageBubbleStyle(resolvedBody, attachmentType);
  const { context: fwdContext, strippedBody: cleanBody } = extractForwardedContext(bubbleCleanBody);
  const explicitStyle =
    payload.bs && isValidBubbleStyleId(payload.bs) ? payload.bs : undefined;
  const resolvedStyle =
    explicitStyle ?? (markerStyle !== "default" ? markerStyle : withReply.bubbleStyle);
  const cleanedMime = attachmentType ? attachmentType.replace(/;jbs=[a-z0-9-]+/gi, "") : undefined;
  const mentions = extractClientMentions(cleanBody, raw.senderId, groupDetails);

  return {
    ...withReply,
    body: cleanBody,
    bubbleStyle: resolvedStyle,
    forwardedContext: fwdContext ?? withReply.forwardedContext,
    forwardedFromName:
      withReply.forwardedFromName ?? fwdContext?.originalSenderName,
    attachmentUrl,
    attachmentName,
    attachmentType: cleanedMime,
    stickerUrl,
    stickerName,
    stickerKey,
    replyTo: withReply.replyTo
      ? {
          ...withReply.replyTo,
          body: stripForwardedMetadataFromText(stripBubbleStyleFromText(withReply.replyTo.body)),
        }
      : undefined,
    mentionsEveryone: raw.mentionsEveryone || mentions.mentionsEveryone,
    mentionedUserIds:
      raw.mentionedUserIds && raw.mentionedUserIds.length > 0
        ? raw.mentionedUserIds
        : mentions.mentionedUserIds,
    e2ee: proof,
  };
}

export function hydrateDecryptedChatPreview(
  preview: ChatPreview,
  myUserId: string,
  triggerRerender?: () => void,
): ChatPreview {
  if (!isEncryptedWireBody(preview.body)) {
    return {
      ...preview,
      body: stripForwardedMetadataFromText(stripBubbleStyleFromText(preview.body)),
    };
  }
  const receiverId = preview.senderId === myUserId ? preview.friendId : myUserId;
  const cacheKey = buildMessageDecryptCacheKey(
    `prev:${preview.friendId}:${preview.createdAt}`,
    preview.body,
    0,
  );
  const cached = getCachedDecryptedMessage(cacheKey, preview.body);
  if (!cached) {
    void decryptWireMessageCached({
      cacheKey,
      rawBody: preview.body,
      senderId: preview.senderId,
      receiverId,
      fetchOverflowCiphertext: fetchOverflowCiphertextBytes,
    }).then(() => {
      triggerRerender?.();
    });
    return { ...preview, body: "Encrypted message" };
  }
  if (!cached.payload) {
    return { ...preview, body: "Encrypted message" };
  }
  const p = cached.payload;
  const cleanPreviewBody = stripForwardedMetadataFromText(stripBubbleStyleFromText(p.b));
  const summary =
    cleanPreviewBody ||
    (p.att?.t?.startsWith("audio/")
      ? "Voice note"
      : p.att
        ? p.att.n || "Attachment"
        : p.stk
          ? p.stk.n || "Sticker"
          : "Encrypted message");
  return { ...preview, body: summary };
}

export async function decryptWirePreviewAsync(params: {
  rawBody: string;
  senderId: string;
  receiverId?: string;
  groupId?: string;
  cacheHint: string;
}): Promise<string | null> {
  if (!params.rawBody) return null;
  if (!isEncryptedWireBody(params.rawBody)) {
    return stripForwardedMetadataFromText(stripBubbleStyleFromText(params.rawBody)) || null;
  }
  const cacheKey = buildMessageDecryptCacheKey(params.cacheHint, params.rawBody, 0);
  const res = await decryptWireMessageCached({
    cacheKey,
    rawBody: params.rawBody,
    senderId: params.senderId,
    receiverId: params.receiverId,
    groupId: params.groupId,
    fetchOverflowCiphertext: fetchOverflowCiphertextBytes,
  });
  if (!res.payload) return null;
  const p = res.payload;
  const clean = stripForwardedMetadataFromText(stripBubbleStyleFromText(p.b));
  return (
    clean ||
    (p.att?.t?.startsWith("audio/")
      ? "Voice note"
      : p.att
        ? p.att.n || "Attachment"
        : p.stk
          ? p.stk.n || "Sticker"
          : null)
  );
}

export function hydrateDecryptedGroupSummary(
  group: GroupSummary,
  myUserId: string,
  myUsername?: string,
  triggerRerender?: () => void,
  allowedEveryoneSenderIds?: ReadonlySet<string>,
): GroupSummary {
  if (!isEncryptedWireBody(group.lastMessage)) {
    return {
      ...group,
      lastMessage: stripForwardedMetadataFromText(stripBubbleStyleFromText(group.lastMessage)),
    };
  }
  const cacheKey = buildMessageDecryptCacheKey(
    `gprev:${group.id}:${group.lastMessageAt}`,
    group.lastMessage,
    0,
  );
  const cached = getCachedDecryptedMessage(cacheKey, group.lastMessage);
  if (!cached) {
    void decryptWireMessageCached({
      cacheKey,
      rawBody: group.lastMessage,
      senderId: group.lastSenderId ?? "",
      groupId: group.id,
      fetchOverflowCiphertext: fetchOverflowCiphertextBytes,
    }).then(() => {
      triggerRerender?.();
    });
    return { ...group, lastMessage: "Encrypted message" };
  }
  if (!cached.payload) {
    return { ...group, lastMessage: "Encrypted message" };
  }
  const p = cached.payload;
  const cleanGroupPreviewBody = stripForwardedMetadataFromText(stripBubbleStyleFromText(p.b));
  const summary =
    cleanGroupPreviewBody ||
    (p.att?.t?.startsWith("audio/")
      ? "Voice note"
      : p.att
        ? p.att.n || "Attachment"
        : p.stk
          ? p.stk.n || "Sticker"
          : "Encrypted message");

  const senderAllowedEveryone =
    !allowedEveryoneSenderIds ||
    (group.lastSenderId ? allowedEveryoneSenderIds.has(group.lastSenderId) : false);

  const mentionedMe =
    group.lastMentionedMe ||
    Boolean(
      cleanGroupPreviewBody &&
        group.lastSenderId &&
        group.lastSenderId !== myUserId &&
        ((senderAllowedEveryone && /(?:^|[\s(])@everyone\b/i.test(cleanGroupPreviewBody)) ||
          (myUsername &&
            new RegExp(`(?:^|[\\s(])@${myUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
              cleanGroupPreviewBody,
            ))),
    );

  return {
    ...group,
    lastMessage: summary,
    lastMentionedMe: mentionedMe,
  };
}

function isCallSignalDescriptor(att?: EncryptedBlobDescriptor): boolean {
  if (!att) return false;
  const mime = (att.t || "").toLowerCase();
  const name = (att.n || "").toLowerCase();
  return (
    mime.includes("jatext-call") ||
    mime.includes("jatext-gcall") ||
    name.startsWith("call-") ||
    name.startsWith("gcall-")
  );
}

export async function hydrateDecryptedDmMessageAsync(
  raw: ChatMessage,
  peerUserId: string,
  triggerRerender: () => void,
  options?: { skipRemoteAttachments?: boolean; onlyCallSignalAttachments?: boolean },
): Promise<ChatMessage> {
  if (!raw.unsentAt && isEncryptedWireBody(raw.body)) {
    const cacheKey = buildMessageDecryptCacheKey(raw.id, raw.body, raw.editedAt);
    const cached = await decryptWireMessageCached({
      cacheKey,
      rawBody: raw.body,
      senderId: raw.senderId,
      receiverId: raw.receiverId,
      fetchOverflowCiphertext: fetchOverflowCiphertextBytes,
    });
    if (!options?.skipRemoteAttachments) {
      if (
        cached.payload?.att &&
        raw.attachmentUrl &&
        (!options?.onlyCallSignalAttachments || isCallSignalDescriptor(cached.payload.att))
      ) {
        try {
          await decryptRemoteAttachmentToObjectUrl(raw.attachmentUrl, cached.payload.att);
        } catch {
          // Ignore transient attachment fetch failure
        }
      } else if (
        cached.payload?.stk?.att &&
        raw.attachmentUrl &&
        !options?.onlyCallSignalAttachments
      ) {
        try {
          await decryptRemoteAttachmentToObjectUrl(raw.attachmentUrl, cached.payload.stk.att);
        } catch {
          // Ignore transient sticker fetch failure
        }
      }
    }
  }
  return hydrateDecryptedDmMessage(raw, peerUserId, triggerRerender);
}

export async function hydrateDecryptedGroupMessageAsync(
  raw: GroupMessage,
  groupId: string,
  groupDetails: GroupDetails | null,
  triggerRerender: () => void,
  options?: { skipRemoteAttachments?: boolean; onlyCallSignalAttachments?: boolean },
): Promise<GroupMessage> {
  if (!raw.unsentAt && isEncryptedWireBody(raw.body)) {
    const cacheKey = buildMessageDecryptCacheKey(raw.id, raw.body, raw.editedAt);
    const cached = await decryptWireMessageCached({
      cacheKey,
      rawBody: raw.body,
      senderId: raw.senderId,
      groupId,
      fetchOverflowCiphertext: fetchOverflowCiphertextBytes,
    });
    if (!options?.skipRemoteAttachments) {
      if (
        cached.payload?.att &&
        raw.attachmentUrl &&
        (!options?.onlyCallSignalAttachments || isCallSignalDescriptor(cached.payload.att))
      ) {
        try {
          await decryptRemoteAttachmentToObjectUrl(raw.attachmentUrl, cached.payload.att);
        } catch {
          // Ignore transient attachment fetch failure
        }
      } else if (
        cached.payload?.stk?.att &&
        raw.attachmentUrl &&
        !options?.onlyCallSignalAttachments
      ) {
        try {
          await decryptRemoteAttachmentToObjectUrl(raw.attachmentUrl, cached.payload.stk.att);
        } catch {
          // Ignore transient sticker fetch failure
        }
      }
    }
  }
  return hydrateDecryptedGroupMessage(raw, groupId, groupDetails, triggerRerender);
}

export async function prewarmDecryptedDmBatch(
  rows: ChatMessage[],
  maxWaitMs = 140,
): Promise<void> {
  if (!rows.length || !getActiveE2EEState()) return;
  await scanDmRowsForE2EESignalsAsync(rows);
  const tasks: Promise<unknown>[] = [];
  for (const raw of rows) {
    if (raw.unsentAt || !isEncryptedWireBody(raw.body)) continue;
    const cacheKey = buildMessageDecryptCacheKey(raw.id, raw.body, raw.editedAt);
    if (getCachedDecryptedMessage(cacheKey, raw.body)) continue;
    tasks.push(
      decryptWireMessageCached({
        cacheKey,
        rawBody: raw.body,
        senderId: raw.senderId,
        receiverId: raw.receiverId,
        fetchOverflowCiphertext: fetchOverflowCiphertextBytes,
      }),
    );
  }
  if (!tasks.length) return;
  await Promise.race([
    Promise.allSettled(tasks),
    new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs)),
  ]);
}

export async function prewarmDecryptedGroupBatch(
  rows: GroupMessage[],
  groupId: string,
  maxWaitMs = 140,
): Promise<void> {
  if (!rows.length || !getActiveE2EEState()) return;
  await scanGroupRowsForE2EESignalsAsync(rows);
  const tasks: Promise<unknown>[] = [];
  for (const raw of rows) {
    if (raw.unsentAt || !isEncryptedWireBody(raw.body)) continue;
    const cacheKey = buildMessageDecryptCacheKey(raw.id, raw.body, raw.editedAt);
    if (getCachedDecryptedMessage(cacheKey, raw.body)) continue;
    tasks.push(
      decryptWireMessageCached({
        cacheKey,
        rawBody: raw.body,
        senderId: raw.senderId,
        groupId,
        fetchOverflowCiphertext: fetchOverflowCiphertextBytes,
      }),
    );
  }
  if (!tasks.length) return;
  await Promise.race([
    Promise.allSettled(tasks),
    new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs)),
  ]);
}


