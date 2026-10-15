export type Show = { id: string; title: string; description: string; startsAt: string; revision: number; status: "scheduled" | "ended" | "canceled" };
export type GrowthRoom = { address: string; creator: string; name: string; displayName: string | null; bio: string | null; avatar: string; followers: number; following: boolean; owned: boolean; show: Show | null; moment: string | null };
export type GrowthState = { rooms: GrowthRoom[]; wallet: string | null; checkedAt: string; enabled: boolean };
export const COMMUNITY_UPDATED_EVENT = "hypr-community-updated";
export const BROADCAST_ENDED_EVENT = "hypr-broadcast-ended";
export const AVATARS = ["H", "★", "◉", "♫", "✦"] as const;
export const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateGrowthWrite(input: unknown, now = Date.now()): { roomId: string; action: string; payload: Record<string, unknown> } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  if (typeof body.roomId !== "string" || !ADDRESS.test(body.roomId) || typeof body.action !== "string" || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) return null;
  const p = body.payload as Record<string, unknown>;
  const text = (key: string, min: number, max: number) => typeof p[key] === "string" && (p[key] as string).trim().length >= min && (p[key] as string).length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(p[key] as string);
  let payload: Record<string, unknown>;
  if (body.action === "profile" && text("displayName", 1, 60) && text("bio", 0, 500) && AVATARS.includes(p.avatar as typeof AVATARS[number])) payload = { displayName: (p.displayName as string).trim(), bio: (p.bio as string).trim(), avatar: p.avatar };
  else if (body.action === "schedule" && typeof p.id === "string" && UUID.test(p.id) && Number.isSafeInteger(p.revision) && Number(p.revision) >= 0 && text("title", 1, 100) && text("description", 0, 500) && typeof p.startsAt === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(p.startsAt) && Number.isFinite(Date.parse(p.startsAt)) && Date.parse(p.startsAt) > now && Date.parse(p.startsAt) <= now + 90 * 86400_000) payload = { id: p.id, revision: p.revision, title: (p.title as string).trim(), description: (p.description as string).trim(), startsAt: new Date(p.startsAt).toISOString() };
  else if (["cancel", "finish"].includes(body.action) && typeof p.id === "string" && UUID.test(p.id) && Number.isSafeInteger(p.revision) && Number(p.revision) > 0) payload = { id: p.id, revision: p.revision };
  else if (body.action === "moment" && text("title", 0, 100)) payload = { title: (p.title as string).trim() };
  else if (body.action === "report" && ["spam", "harassment", "unsafe", "copyright", "other"].includes(String(p.reason)) && text("details", 0, 500) && (p.messageId === null || typeof p.messageId === "string" && UUID.test(p.messageId))) payload = { reason: p.reason, details: (p.details as string).trim(), messageId: p.messageId };
  else if (body.action === "resolve-report" && typeof p.id === "string" && UUID.test(p.id) && typeof p.hideMessage === "boolean") payload = { id: p.id, hideMessage: p.hideMessage };
  else return null;
  return { roomId: body.roomId.toLowerCase(), action: body.action, payload };
}

export function showPhase(show: Show | null, live: boolean, now = Date.now()) {
  if (live) return "live";
  if (!show) return "offline";
  if (show.status !== "scheduled") return show.status;
  return Date.parse(show.startsAt) > now ? "upcoming" : "awaiting-creator";
}

export function localDateTime(iso: string) {
  const date = new Date(iso);
  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

export function calendarText(show: Show, roomUrl: string) {
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HYPR//Creator shows//EN", "BEGIN:VEVENT", `UID:${show.id}@hypr`, `DTSTAMP:${stamp(show.startsAt)}`, `DTSTART:${stamp(show.startsAt)}`, `SUMMARY:${escape(show.title)}`, `DESCRIPTION:${escape(`${show.description}\nWatch at ${roomUrl}\nScheduled start; actual broadcast availability depends on the creator.`)}`, `URL:${roomUrl}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}

export function canonicalRoomUrl(address: string, base = process.env.NEXT_PUBLIC_APP_URL || "https://hypr-pons.vercel.app") {
  if (!ADDRESS.test(address)) throw new Error("Invalid room address");
  return new URL(`/room/${address.toLowerCase()}`, base).toString();
}
