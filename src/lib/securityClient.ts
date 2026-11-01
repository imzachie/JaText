import { useSyncExternalStore } from "react";
import { bytesToBase64Url, base64UrlToBytes } from "./e2ee/cryptoPrimitives";
import { resolveTursoMediaUrl, tursoRpc, uploadMediaToTurso } from "./tursoClient";
import type { JaUser } from "./types";

export interface PasskeyItem {
  credentialId: string;
  label: string;
  createdAt: number;
  lastUsedAt?: number;
}

export interface SecuritySettingsState {
  totpEnabled: boolean;
  backupCodesRemaining: number;
  passkeys: PasskeyItem[];
}

export interface CustomSoundboardClip {
  id: string;
  name: string;
  audioUrl: string;
  durationMs: number;
  byteSize: number;
  createdAt: number;
}

export const MAX_SOUNDBOARD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_SOUNDBOARD_DURATION_MS = 10_000; // 10s

/* ==================== Custom Soundboards Store ==================== */

const sbListeners = new Set<() => void>();
let soundboardList: CustomSoundboardClip[] = [];

export function ingestServerSoundboards(items?: CustomSoundboardClip[] | null): void {
  if (!Array.isArray(items)) return;
  soundboardList = items.map((c) => ({
    ...c,
    audioUrl: resolveTursoMediaUrl(c.audioUrl) || c.audioUrl,
  }));
  for (const fn of sbListeners) fn();
}

export function useCustomSoundboards(): CustomSoundboardClip[] {
  return useSyncExternalStore(
    (cb) => {
      sbListeners.add(cb);
      return () => sbListeners.delete(cb);
    },
    () => soundboardList,
    () => soundboardList,
  );
}

export async function refreshCustomSoundboards(): Promise<CustomSoundboardClip[]> {
  const res = await tursoRpc<{ soundboards?: CustomSoundboardClip[] }>("listMySoundboards", {});
  ingestServerSoundboards(res.soundboards ?? []);
  return soundboardList;
}

export async function measureAudioFileDurationMs(file: File): Promise<number> {
  if (typeof window === "undefined") return 1000;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      try {
        const buf = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        await ctx.close().catch(() => undefined);
        return Math.round(decoded.duration * 1000);
      } catch {
        await ctx.close().catch(() => undefined);
      }
    }
  } catch {
    // Fall back to HTMLAudioElement metadata probe
  }

  return await new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => URL.revokeObjectURL(url);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const sec = audio.duration;
      cleanup();
      if (!Number.isFinite(sec) || sec <= 0) {
        reject(new Error("Could not determine audio duration."));
      } else {
        resolve(Math.round(sec * 1000));
      }
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("Unsupported audio file format."));
    };
    audio.src = url;
  });
}

export async function createCustomSoundboard(
  name: string,
  file: File,
): Promise<CustomSoundboardClip> {
  const cleanName = name.trim().slice(0, 40);
  if (!cleanName) throw new Error("Enter a name for your soundboard clip.");
  if (file.size > MAX_SOUNDBOARD_BYTES) {
    throw new Error("Audio file must be 10 MB or smaller.");
  }
  const durationMs = await measureAudioFileDurationMs(file);
  if (durationMs > MAX_SOUNDBOARD_DURATION_MS + 350) {
    throw new Error("Soundboard clips must be 10 seconds or shorter.");
  }
  const uploadedUrl = await uploadMediaToTurso(file);
  const res = await tursoRpc<{ clip: CustomSoundboardClip }>("createSoundboardClip", {
    name: cleanName,
    audioUrl: uploadedUrl,
    durationMs: Math.min(durationMs, MAX_SOUNDBOARD_DURATION_MS),
    byteSize: file.size,
  });
  const clip: CustomSoundboardClip = {
    ...res.clip,
    audioUrl: resolveTursoMediaUrl(res.clip.audioUrl) || res.clip.audioUrl,
  };
  soundboardList = [clip, ...soundboardList.filter((x) => x.id !== clip.id)];
  for (const fn of sbListeners) fn();
  return clip;
}

export async function removeCustomSoundboard(clipId: string): Promise<void> {
  await tursoRpc("deleteSoundboardClip", { clipId });
  soundboardList = soundboardList.filter((c) => c.id !== clipId);
  for (const fn of sbListeners) fn();
}

export function playAudioUrlPreview(url: string): void {
  const resolved = resolveTursoMediaUrl(url) || url;
  if (!resolved) return;
  try {
    const audio = new Audio(resolved);
    audio.volume = 0.85;
    void audio.play().catch(() => undefined);
  } catch {
    // Ignore autoplay block
  }
}

/* ==================== Blocked Users Helper ==================== */

export async function fetchBlockedUsersList(): Promise<Array<JaUser & { blockedAt?: number }>> {
  const res = await tursoRpc<{ users?: Array<JaUser & { blockedAt?: number }> }>(
    "getBlockedUsers",
    {},
  );
  return Array.isArray(res.users) ? res.users : [];
}

/* ==================== TOTP 2FA & WebAuthn Passkeys ==================== */

export async function fetchSecuritySettings(): Promise<SecuritySettingsState> {
  return await tursoRpc<SecuritySettingsState>("getSecuritySettings", {});
}

export async function beginTotpSetupRpc(): Promise<{ secret: string; otpauthUrl: string }> {
  return await tursoRpc<{ secret: string; otpauthUrl: string }>("beginTotpSetup", {});
}

export async function confirmTotpSetupRpc(
  code: string,
): Promise<{ ok: boolean; totpEnabled: boolean; backupCodes: string[] }> {
  return await tursoRpc("confirmTotpSetup", { code: code.trim() });
}

export async function disableTotpRpc(code: string): Promise<void> {
  await tursoRpc("disableTotp", { code: code.trim() });
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u8.byteLength);
  new Uint8Array(out).set(u8);
  return out;
}

function currentWebAuthnRpId(): string {
  if (typeof window === "undefined") return "jatext.vercel.app";
  return window.location.hostname || "jatext.vercel.app";
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}

export async function registerPasskeyInBrowser(label?: string): Promise<PasskeyItem> {
  if (!isWebAuthnSupported()) {
    throw new Error("Passkeys are not supported in this browser.");
  }
  const rpId = currentWebAuthnRpId();
  const started = await tursoRpc<{
    challengeId: string;
    options: {
      rp: { name: string; id: string };
      user: { id: string; name: string; displayName: string };
      challenge: string;
      pubKeyCredParams: Array<{ type: "public-key"; alg: number }>;
      timeout: number;
      attestation: AttestationConveyancePreference;
      authenticatorSelection: AuthenticatorSelectionCriteria;
      excludeCredentials?: Array<{ type: "public-key"; id: string }>;
    };
  }>("beginPasskeyRegistration", { rpId });

  const publicKey: PublicKeyCredentialCreationOptions = {
    rp: started.options.rp,
    user: {
      id: toArrayBuffer(base64UrlToBytes(started.options.user.id)),
      name: started.options.user.name,
      displayName: started.options.user.displayName,
    },
    challenge: toArrayBuffer(base64UrlToBytes(started.options.challenge)),
    pubKeyCredParams: started.options.pubKeyCredParams,
    timeout: started.options.timeout,
    attestation: started.options.attestation,
    authenticatorSelection: started.options.authenticatorSelection,
    excludeCredentials: (started.options.excludeCredentials ?? []).map((c) => ({
      type: "public-key",
      id: toArrayBuffer(base64UrlToBytes(c.id)),
    })),
  };

  const created = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential | null;
  if (!created) {
    throw new Error("Passkey creation was cancelled.");
  }

  const attResp = created.response as AuthenticatorAttestationResponse & {
    getPublicKey?: () => ArrayBuffer | null;
    getPublicKeyAlgorithm?: () => number;
    getAuthenticatorData?: () => ArrayBuffer;
    getTransports?: () => string[];
  };
  const spkiBuf = attResp.getPublicKey?.() ?? null;
  const authDataBuf = attResp.getAuthenticatorData?.() ?? null;
  const alg = attResp.getPublicKeyAlgorithm?.() ?? -7;
  const transports = attResp.getTransports?.() ?? [];

  const finished = await tursoRpc<{ ok: boolean; passkey: PasskeyItem }>(
    "finishPasskeyRegistration",
    {
      challengeId: started.challengeId,
      credentialId: bytesToBase64Url(new Uint8Array(created.rawId)),
      clientDataJSON: bytesToBase64Url(new Uint8Array(attResp.clientDataJSON)),
      attestationObject: bytesToBase64Url(new Uint8Array(attResp.attestationObject)),
      ...(authDataBuf
        ? { authenticatorData: bytesToBase64Url(new Uint8Array(authDataBuf)) }
        : {}),
      ...(spkiBuf ? { publicKeySpki: bytesToBase64Url(new Uint8Array(spkiBuf)) } : {}),
      publicKeyAlgorithm: alg,
      label: label?.trim() || "Device Passkey",
      transports,
    },
  );
  return finished.passkey;
}

export async function signInWithPasskeyInBrowser(
  emailHint?: string,
): Promise<{ token: string; me: JaUser }> {
  if (!isWebAuthnSupported()) {
    throw new Error("Passkeys are not supported in this browser.");
  }
  const rpId = currentWebAuthnRpId();
  const started = await tursoRpc<{
    challengeId: string;
    options: {
      challenge: string;
      rpId: string;
      timeout: number;
      userVerification: UserVerificationRequirement;
      allowCredentials?: Array<{ type: "public-key"; id: string; transports?: string[] }>;
    };
  }>(
    "beginPasskeyLogin",
    { rpId, ...(emailHint?.trim() ? { email: emailHint.trim() } : {}) },
    { skipAuthClear: true },
  );

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: toArrayBuffer(base64UrlToBytes(started.options.challenge)),
    rpId: started.options.rpId,
    timeout: started.options.timeout,
    userVerification: started.options.userVerification,
    ...(started.options.allowCredentials?.length
      ? {
          allowCredentials: started.options.allowCredentials.map((c) => ({
            type: "public-key",
            id: toArrayBuffer(base64UrlToBytes(c.id)),
          })),
        }
      : {}),
  };

  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!cred) {
    throw new Error("Passkey sign-in was cancelled.");
  }
  const assertResp = cred.response as AuthenticatorAssertionResponse;

  return await tursoRpc<{ token: string; me: JaUser }>(
    "finishPasskeyLogin",
    {
      challengeId: started.challengeId,
      credentialId: bytesToBase64Url(new Uint8Array(cred.rawId)),
      clientDataJSON: bytesToBase64Url(new Uint8Array(assertResp.clientDataJSON)),
      authenticatorData: bytesToBase64Url(new Uint8Array(assertResp.authenticatorData)),
      signature: bytesToBase64Url(new Uint8Array(assertResp.signature)),
    },
    { skipAuthClear: true },
  );
}

export async function removePasskeyRpc(credentialId: string): Promise<void> {
  await tursoRpc("deletePasskey", { credentialId });
}
