"use client";
import { awaitCommunityReset, signInCommunity } from "./community-client";
import type { CapturedMedia } from "./browser-recording";
import { MEDIA_UPDATED_EVENT, type MediaReservation } from "./media";
import { getEthereum } from "./wallet";
import { WALLET_CHANGED_EVENT } from "./wallet-discovery";

export function subscribeMediaWalletChange(changed: () => void) {
  let provider = getEthereum(); provider?.on?.("accountsChanged", changed);
  const selected = () => { provider?.removeListener?.("accountsChanged", changed); provider = getEthereum(); provider?.on?.("accountsChanged", changed); changed(); };
  window.addEventListener(WALLET_CHANGED_EVENT, selected);
  return () => { provider?.removeListener?.("accountsChanged", changed); window.removeEventListener(WALLET_CHANGED_EVENT, selected); };
}

export async function mediaAction(roomId: string, action: string, data: Record<string, unknown> = {}) {
  await awaitCommunityReset();
  const response = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, action, ...data }), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The recording action failed.");
  return result;
}
export async function authorizeMedia() { return signInCommunity(); }
export async function uploadCapturedMedia(roomId: string, reservation: MediaReservation, media: CapturedMedia, progress: (percent: number) => void) {
  // A fresh same-origin authorization is required on retries; never send wallet or server credentials to Storage.
  const fresh = await mediaAction(roomId, "upload", { id: reservation.id }) as MediaReservation;
  if (fresh.ready) { progress(100); window.dispatchEvent(new Event(MEDIA_UPDATED_EVENT)); return; }
  const url = new URL(fresh.uploadUrl), token = url.searchParams.get("token");
  const path = url.pathname.match(/^\/storage\/v1\/object\/upload\/sign\/(hypr-(?:replays|clips))\/(0x[0-9a-f]{40}\/[0-9a-f-]{36}\.(?:mp4|webm))$/);
  if (!token || !path || url.protocol !== "https:") throw new Error("Storage returned an invalid upload destination.");
  if (!fresh.uploaded) { const { Upload } = await import("tus-js-client");
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(media.blob, { endpoint: `${url.origin}/storage/v1/upload/resumable`, headers: { "x-signature": token, "x-upsert": "false" },
      metadata: { bucketName: path[1], objectName: path[2], contentType: media.mime, cacheControl: "0" }, chunkSize: 6 * 1024 * 1024,
      uploadDataDuringCreation: true, storeFingerprintForResuming: false, removeFingerprintOnSuccess: true, retryDelays: [0, 1000, 3000, 5000],
      onProgress: (sent, total) => progress(Math.min(99, Math.round(sent / total * 100))), onError: reject, onSuccess: () => resolve() });
    upload.start();
  }); }
  await mediaAction(roomId, "complete", { id: fresh.id, durationSeconds: media.durationSeconds });
  progress(100); window.dispatchEvent(new Event(MEDIA_UPDATED_EVENT));
}
