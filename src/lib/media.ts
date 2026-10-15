export const MEDIA_UPDATED_EVENT = "hypr-media-updated";
export const MEDIA_LIMITS = { replay: { seconds: 600, bytes: 40 * 1024 * 1024 }, clip: { seconds: 30, bytes: 8 * 1024 * 1024 } } as const;
export type MediaKind = keyof typeof MEDIA_LIMITS;
export type MediaAsset = { id: string; kind: MediaKind; title: string; durationSeconds: number; createdAt: string; published: boolean; manageable: boolean; own: boolean };
export type MediaLibrary = { enabled: boolean; creator: boolean; wallet: string | null; clipsAllowed: boolean; live: boolean; assets: MediaAsset[] };
export type MediaReservation = { id: string; uploadUrl: string; kind: MediaKind; title: string; mime: string; ready?: boolean; uploaded?: boolean };
export function mediaMime(value: unknown) {
  if (typeof value !== "string") return null;
  const type = value.split(";")[0].trim().toLowerCase();
  return ["video/webm", "video/mp4", "audio/webm", "audio/mp4"].includes(type) ? type : null;
}
export function mediaHeaderMatches(bytes: Uint8Array, mime: string) {
  return mime.endsWith("webm") ? bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
    : bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp";
}
export function mediaDuration(value: number) { const seconds = Math.max(0, Math.round(value)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
