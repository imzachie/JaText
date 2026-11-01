import { useSyncExternalStore } from "react";
import { encryptAttachmentBytes, type EncryptedBlobDescriptor } from "./e2ee/cryptoPrimitives";
import { seedOutgoingDecryptedMedia } from "./e2ee/keystore";
import { tursoRpc, uploadMediaToTurso } from "./tursoClient";

export const VIEW_ONCE_PREFIX = "__JATEXT_VO_V1__:";
const OPENED_STORAGE_KEY = "jatext:view_once_opened:v1";

export interface ViewOnceMediaItem {
  url: string;
  name: string;
  mime: string;
  att?: EncryptedBlobDescriptor;
}

export interface ViewOnceEnvelope {
  v: 1;
  text?: string;
  photo?: ViewOnceMediaItem;
  audio?: ViewOnceMediaItem;
}

const openedListeners = new Set<() => void>();
const openedSet = new Set<string>(loadInitialOpenedIds());
let cachedOpenedSnapshot: ReadonlySet<string> = new Set(openedSet);

function loadInitialOpenedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OPENED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function persistOpenedIds() {
  cachedOpenedSnapshot = new Set(openedSet);
  try {
    localStorage.setItem(OPENED_STORAGE_KEY, JSON.stringify([...openedSet].slice(-2500)));
  } catch {
    // Ignore quota errors
  }
  for (const fn of openedListeners) fn();
}

export function ingestServerOpenedViewOnceIds(ids?: string[] | null): void {
  if (!Array.isArray(ids) || ids.length === 0) return;
  let changed = false;
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (id && !openedSet.has(id)) {
      openedSet.add(id);
      changed = true;
    }
  }
  if (changed) {
    persistOpenedIds();
  }
}

export function isViewOnceMessageOpened(messageId: string): boolean {
  return openedSet.has(messageId);
}

export async function markViewOnceMessageBurned(messageId: string): Promise<void> {
  const cleanId = String(messageId || "").trim();
  if (!cleanId) return;
  if (!openedSet.has(cleanId)) {
    openedSet.add(cleanId);
    persistOpenedIds();
  }
  await tursoRpc("markViewOnceOpened", { messageId: cleanId }).catch(() => undefined);
}

export function useOpenedViewOnceIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    (cb) => {
      openedListeners.add(cb);
      return () => openedListeners.delete(cb);
    },
    () => cachedOpenedSnapshot,
    () => cachedOpenedSnapshot,
  );
}

export function isViewOnceBody(body?: string | null): boolean {
  if (!body) return false;
  return body.trimStart().startsWith(VIEW_ONCE_PREFIX);
}

export function parseViewOnceEnvelope(
  body?: string | null,
  fallbackAttachment?: {
    url?: string;
    name?: string;
    type?: string;
    encryptedAttachment?: EncryptedBlobDescriptor;
  },
): ViewOnceEnvelope | null {
  if (!body) return null;
  const trimmed = body.trimStart();
  if (!trimmed.startsWith(VIEW_ONCE_PREFIX)) return null;
  const rawJson = trimmed.slice(VIEW_ONCE_PREFIX.length).trim();
  try {
    const parsed = JSON.parse(rawJson) as Partial<ViewOnceEnvelope>;
    const env: ViewOnceEnvelope = {
      v: 1,
      ...(typeof parsed.text === "string" && parsed.text.trim() ? { text: parsed.text } : {}),
      ...(parsed.photo && parsed.photo.url ? { photo: parsed.photo } : {}),
      ...(parsed.audio && parsed.audio.url ? { audio: parsed.audio } : {}),
    };
    if (!env.photo && !env.audio && fallbackAttachment?.url) {
      const mime = fallbackAttachment.type || fallbackAttachment.encryptedAttachment?.t || "";
      const item: ViewOnceMediaItem = {
        url: fallbackAttachment.url,
        name: fallbackAttachment.name || fallbackAttachment.encryptedAttachment?.n || "media",
        mime,
        ...(fallbackAttachment.encryptedAttachment
          ? { att: fallbackAttachment.encryptedAttachment }
          : {}),
      };
      if (mime.startsWith("audio/")) {
        env.audio = item;
      } else {
        env.photo = item;
      }
    }
    return env;
  } catch {
    return {
      v: 1,
      text: rawJson,
    };
  }
}

export function serializeViewOnceEnvelope(envelope: ViewOnceEnvelope): string {
  return `${VIEW_ONCE_PREFIX}${JSON.stringify(envelope)}`;
}

/**
 * Encrypts and uploads optional photo and/or audio files into a single zero-knowledge
 * View Once envelope so Text, Photo, Audio, Text+Photo, Photo+Audio, and Text+Audio
 * all travel as one atomic View Once message.
 */
export async function buildEncryptedViewOnceBody(params: {
  text?: string;
  photoFile?: File | null;
  audioFile?: File | null;
}): Promise<string> {
  const cleanText = (params.text ?? "").trim();
  let photoItem: ViewOnceMediaItem | undefined;
  let audioItem: ViewOnceMediaItem | undefined;

  if (params.photoFile) {
    const plainBytes = new Uint8Array(await params.photoFile.arrayBuffer());
    const mime = params.photoFile.type || "image/jpeg";
    const name = params.photoFile.name || "view-once-photo.jpg";
    const { ciphertextBytes, descriptor } = await encryptAttachmentBytes(plainBytes, name, mime);
    seedOutgoingDecryptedMedia(descriptor, plainBytes);
    const encFile = new File([ciphertextBytes], "vo-photo.jatext", {
      type: "application/octet-stream",
    });
    const url = await uploadMediaToTurso(encFile);
    photoItem = { url, name, mime, att: descriptor };
  }

  if (params.audioFile) {
    const plainBytes = new Uint8Array(await params.audioFile.arrayBuffer());
    const mime = params.audioFile.type || "audio/webm";
    const name = params.audioFile.name || "view-once-audio.webm";
    const { ciphertextBytes, descriptor } = await encryptAttachmentBytes(plainBytes, name, mime);
    seedOutgoingDecryptedMedia(descriptor, plainBytes);
    const encFile = new File([ciphertextBytes], "vo-audio.jatext", {
      type: "application/octet-stream",
    });
    const url = await uploadMediaToTurso(encFile);
    audioItem = { url, name, mime, att: descriptor };
  }

  return serializeViewOnceEnvelope({
    v: 1,
    ...(cleanText ? { text: cleanText } : {}),
    ...(photoItem ? { photo: photoItem } : {}),
    ...(audioItem ? { audio: audioItem } : {}),
  });
}
