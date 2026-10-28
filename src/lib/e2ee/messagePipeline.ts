import {
  extractMessageBubbleStyle,
  isValidBubbleStyleId,
  stripBubbleStyleFromText,
} from "../chatCustomization";
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
  setPeerVerifiedState,
  type MessageE2EEProof,
} from "./keystore";

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

export async function prepareOutgoingDmEncrypted<TStorageId = string>(params: {
  receiverId: string;
  wireBody: string;
  file?: File;
  sticker?: StickerMedia;
  uploadFile: (file: File) => Promise<TStorageId>;
}): Promise<PreparedEncryptedWrite<TStorageId> | null> {
  const { receiverId, wireBody, file, sticker, uploadFile } = params;
  const state = getActiveE2EEState();
  if (!state) return null;
  const peerEntry = state.peerKeys[receiverId];
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

  const silentSignal =
    wireBody.startsWith("__JATEXT_CALL_SIG__:") || wireBody.startsWith("__JATEXT_REACT__:");

  const additionalDeviceBundles = [
    ...getAllMyIdentities(state).map((i) => ({ keyId: i.keyId, dhPubB64: i.dhPubB64 })),
    ...getPeerKnownBundles(peerEntry).map((b) => ({ keyId: b.keyId, dhPubB64: b.dhPubB64 })),
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

  return {
    encrypted: true,
    wireBody: encryptedWire,
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
  uploadFile: (file: File) => Promise<TStorageId>;
}): Promise<PreparedEncryptedWrite<TStorageId> | null> {
  const { groupId, wireBody, file, sticker, uploadFile } = params;
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

  const silentSignal =
    wireBody.startsWith("__JATEXT_CALL_SIG__:") || wireBody.startsWith("__JATEXT_REACT__:");

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

  return {
    encrypted: true,
    wireBody: encryptedWire,
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
        const res = await fetch(cipherUrl);
        if (!res.ok) return;
        const cipherBytes = new Uint8Array(await res.arrayBuffer());
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

function resolveReplyBody(
  reply: { id: string; senderId: string; body: string } | undefined,
  dmPeerReceiverId?: string,
  groupId?: string,
): string | undefined {
  if (!reply) return undefined;
  if (!isEncryptedWireBody(reply.body)) return reply.body;

  const state = getActiveE2EEState();
  const cacheKey = buildMessageDecryptCacheKey(`reply:${reply.id}`, reply.body, 0);
  const cached = getCachedDecryptedMessage(cacheKey);
  if (cached) {
    if (cached.payload) {
      return cached.payload.b || cached.payload.att?.n || cached.payload.stk?.n || "Attachment";
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
  });
  return "Decrypting…";
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
    const plainProof: MessageE2EEProof = {
      encrypted: false,
      decrypted: true,
      signatureVerified: false,
      algorithm: "Plaintext (sent before E2EE activation)",
      channel: "plain",
      rawWireBody: raw.body,
    };
    return { ...withReply, e2ee: plainProof };
  }

  const isSilentWire = raw.body.startsWith("__JATEXT_CALL_SIG__:");
  const cacheKey = buildMessageDecryptCacheKey(raw.id, raw.body, raw.editedAt);
  const cached = getCachedDecryptedMessage(cacheKey);
  if (!cached) {
    void decryptWireMessageCached({
      cacheKey,
      rawBody: raw.body,
      senderId: raw.senderId,
      receiverId: raw.receiverId,
    }).then(() => triggerRerender());
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

  const { cleanBody, bubbleStyle: markerStyle } = extractMessageBubbleStyle(resolvedBody, attachmentType);
  const explicitStyle =
    payload.bs && isValidBubbleStyleId(payload.bs) ? payload.bs : undefined;
  const resolvedStyle =
    explicitStyle ?? (markerStyle !== "default" ? markerStyle : withReply.bubbleStyle);
  const cleanedMime = attachmentType ? attachmentType.replace(/;jbs=[a-z0-9-]+/gi, "") : undefined;

  return {
    ...withReply,
    body: cleanBody,
    bubbleStyle: resolvedStyle,
    attachmentUrl,
    attachmentName,
    attachmentType: cleanedMime,
    stickerKey,
    replyTo: withReply.replyTo
      ? { ...withReply.replyTo, body: stripBubbleStyleFromText(withReply.replyTo.body) }
      : undefined,
    e2ee: proof,
  };
}

function extractClientMentions(
  body: string,
  senderId: string,
  groupDetails: GroupDetails | null,
): { mentionsEveryone: boolean; mentionedUserIds: string[] } {
  const mentionsEveryone = /(?:^|[\s(])@everyone\b/i.test(body);
  if (!groupDetails) {
    return { mentionsEveryone, mentionedUserIds: [] };
  }
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
    return {
      ...withReply,
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
  const cached = getCachedDecryptedMessage(cacheKey);
  if (!cached) {
    void decryptWireMessageCached({
      cacheKey,
      rawBody: raw.body,
      senderId: raw.senderId,
      groupId,
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

  const { cleanBody, bubbleStyle: markerStyle } = extractMessageBubbleStyle(resolvedBody, attachmentType);
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
    attachmentUrl,
    attachmentName,
    attachmentType: cleanedMime,
    stickerUrl,
    stickerName,
    stickerKey,
    replyTo: withReply.replyTo
      ? { ...withReply.replyTo, body: stripBubbleStyleFromText(withReply.replyTo.body) }
      : undefined,
    mentionsEveryone: raw.mentionsEveryone || mentions.mentionsEveryone,
    mentionedUserIds:
      raw.mentionedUserIds && raw.mentionedUserIds.length > 0
        ? raw.mentionedUserIds
        : mentions.mentionedUserIds,
    e2ee: proof,
  };
}

export function hydrateDecryptedChatPreview(preview: ChatPreview, myUserId: string): ChatPreview {
  if (!isEncryptedWireBody(preview.body)) return preview;
  const receiverId = preview.senderId === myUserId ? preview.friendId : myUserId;
  const cacheKey = buildMessageDecryptCacheKey(
    `prev:${preview.friendId}:${preview.createdAt}`,
    preview.body,
    0,
  );
  const cached = getCachedDecryptedMessage(cacheKey);
  if (!cached) {
    void decryptWireMessageCached({
      cacheKey,
      rawBody: preview.body,
      senderId: preview.senderId,
      receiverId,
    });
    return { ...preview, body: "Encrypted message" };
  }
  if (!cached.payload) {
    return { ...preview, body: "Encrypted message" };
  }
  const p = cached.payload;
  const cleanPreviewBody = stripBubbleStyleFromText(p.b);
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

export function hydrateDecryptedGroupSummary(
  group: GroupSummary,
  myUserId: string,
  myUsername?: string,
): GroupSummary {
  if (!isEncryptedWireBody(group.lastMessage)) return group;
  const cacheKey = buildMessageDecryptCacheKey(
    `gprev:${group.id}:${group.lastMessageAt}`,
    group.lastMessage,
    0,
  );
  const cached = getCachedDecryptedMessage(cacheKey);
  if (!cached) {
    void decryptWireMessageCached({
      cacheKey,
      rawBody: group.lastMessage,
      senderId: group.lastSenderId ?? "",
      groupId: group.id,
    });
    return { ...group, lastMessage: "Encrypted message" };
  }
  if (!cached.payload) {
    return { ...group, lastMessage: "Encrypted message" };
  }
  const p = cached.payload;
  const cleanGroupPreviewBody = stripBubbleStyleFromText(p.b);
  const summary =
    cleanGroupPreviewBody ||
    (p.att?.t?.startsWith("audio/")
      ? "Voice note"
      : p.att
        ? p.att.n || "Attachment"
        : p.stk
          ? p.stk.n || "Sticker"
          : "Encrypted message");

  const mentionedMe =
    group.lastMentionedMe ||
    Boolean(
      cleanGroupPreviewBody &&
        group.lastSenderId &&
        group.lastSenderId !== myUserId &&
        (/(?:^|[\s(])@everyone\b/i.test(cleanGroupPreviewBody) ||
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

export async function hydrateDecryptedDmMessageAsync(
  raw: ChatMessage,
  peerUserId: string,
  triggerRerender: () => void,
): Promise<ChatMessage> {
  if (!raw.unsentAt && isEncryptedWireBody(raw.body)) {
    const cacheKey = buildMessageDecryptCacheKey(raw.id, raw.body, raw.editedAt);
    const cached = await decryptWireMessageCached({
      cacheKey,
      rawBody: raw.body,
      senderId: raw.senderId,
      receiverId: raw.receiverId,
    });
    if (cached.payload?.att && raw.attachmentUrl) {
      try {
        await decryptRemoteAttachmentToObjectUrl(raw.attachmentUrl, cached.payload.att);
      } catch {
        // Ignore transient attachment fetch failure
      }
    } else if (cached.payload?.stk?.att && raw.attachmentUrl) {
      try {
        await decryptRemoteAttachmentToObjectUrl(raw.attachmentUrl, cached.payload.stk.att);
      } catch {
        // Ignore transient sticker fetch failure
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
): Promise<GroupMessage> {
  if (!raw.unsentAt && isEncryptedWireBody(raw.body)) {
    const cacheKey = buildMessageDecryptCacheKey(raw.id, raw.body, raw.editedAt);
    const cached = await decryptWireMessageCached({
      cacheKey,
      rawBody: raw.body,
      senderId: raw.senderId,
      groupId,
    });
    if (cached.payload?.att && raw.attachmentUrl) {
      try {
        await decryptRemoteAttachmentToObjectUrl(raw.attachmentUrl, cached.payload.att);
      } catch {
        // Ignore transient attachment fetch failure
      }
    } else if (cached.payload?.stk?.att && raw.attachmentUrl) {
      try {
        await decryptRemoteAttachmentToObjectUrl(raw.attachmentUrl, cached.payload.stk.att);
      } catch {
        // Ignore transient sticker fetch failure
      }
    }
  }
  return hydrateDecryptedGroupMessage(raw, groupId, groupDetails, triggerRerender);
}

