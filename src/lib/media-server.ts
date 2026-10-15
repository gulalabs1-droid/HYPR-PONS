import { readSupabaseConfig } from "./supabase/server";
import { mediaHeaderMatches } from "./media";

export type StoredMedia = { id: string; kind: "clip" | "replay"; title: string; mime: string; path: string; bucket: string; published: boolean; ready: boolean; uploaded: boolean; durationSeconds: number };
function config() { const value = readSupabaseConfig(); if (!value) throw new Error("Video storage is unavailable."); return value; }
function objectPath(asset: StoredMedia) {
  if (!['hypr-clips','hypr-replays'].includes(asset.bucket) || !/^0x[0-9a-f]{40}\/[0-9a-f-]{36}\.(webm|mp4)$/.test(asset.path)) throw new Error("Invalid stored recording.");
  return `${asset.bucket}/${asset.path}`;
}
async function storageRequest(path: string, body: unknown) {
  const { url, serviceRoleKey } = config();
  const response = await fetch(`${url}/storage/v1/${path}`, { method: "POST", headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Video storage could not authorize this request.");
  return { url, result: await response.json() as { url?: string; signedURL?: string } };
}
function signedUrl(base: string, path: string | undefined, expected: string) {
  if (!path) throw new Error("Video storage did not return a link.");
  const result = new URL(path.startsWith("/object/") ? `/storage/v1${path}` : path, base);
  if (result.origin !== new URL(base).origin || !result.pathname.startsWith(`/storage/v1/${expected}`)) throw new Error("Video storage returned an invalid link.");
  return result.toString();
}
export async function createMediaUpload(asset: StoredMedia) {
  const path = objectPath(asset);
  const { url, result } = await storageRequest(`object/upload/sign/${path}`, {});
  return signedUrl(url, result.url, `object/upload/sign/${path}`);
}
export async function createMediaPlayback(asset: StoredMedia) {
  const path = objectPath(asset);
  const { url, result } = await storageRequest(`object/sign/${path}`, { expiresIn: 300 });
  return signedUrl(url, result.signedURL, `object/sign/${path}`);
}
export async function verifyMediaHeader(asset: StoredMedia) {
  const { url, serviceRoleKey } = config();
  const response = await fetch(`${url}/storage/v1/object/authenticated/${objectPath(asset)}`, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Range: "bytes=0-31" }, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok || !response.body) throw new Error("Uploaded recording cannot be read.");
  const reader = response.body.getReader();
  const header = new Uint8Array(32); let length = 0;
  try {
    while (length < 32) {
      const part = await reader.read(); if (part.done) break;
      const bytes = part.value.subarray(0, 32 - length); header.set(bytes, length); length += bytes.length;
    }
  } finally { await reader.cancel(); }
  if (!mediaHeaderMatches(header.subarray(0, length), asset.mime)) throw new Error("The uploaded file is not a supported recording.");
}
