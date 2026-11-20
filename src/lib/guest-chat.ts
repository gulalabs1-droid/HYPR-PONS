import { createHash, createHmac, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto";
import { isBlockedRoomName } from "./discovery";

export const GUEST_COOKIE = "hypr-guest";
export const GUEST_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,23}$/;
const GUEST_TTL_MS = 30 * 24 * 60 * 60_000;
type GuestIdentity = { id: string; name: string; origin: string; expiresAt: number };

function key(info: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("Shared community is unavailable.");
  return Buffer.from(hkdfSync("sha256", secret, "HYPR guests", info, 32));
}

export function encodeGuest(value: GuestIdentity) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${createHmac("sha256", key("guest identity v1")).update(payload).digest("base64url")}`;
}

export function decodeGuest(value: string | undefined, origin: string, now = Date.now()): GuestIdentity | null {
  if (!value || value.length > 600) return null;
  try {
    const [payload, mac, extra] = value.split(".");
    if (!payload || !mac || extra) return null;
    const expected = createHmac("sha256", key("guest identity v1")).update(payload).digest();
    const supplied = Buffer.from(mac, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as GuestIdentity;
    if (decoded.origin !== origin || !/^[0-9a-f-]{36}$/.test(decoded.id) || typeof decoded.name !== "string" || !GUEST_NAME.test(decoded.name) || !Number.isSafeInteger(decoded.expiresAt) || decoded.expiresAt <= now) return null;
    return decoded;
  } catch { return null; }
}

export function newGuest(name: string, origin: string, existingId?: string): GuestIdentity {
  return { id: existingId || randomUUID(), name: name.trim().replace(/\s+/g, " "), origin, expiresAt: Date.now() + GUEST_TTL_MS };
}

// Common slurs and hate shorthand, matched on word boundaries after light
// normalization (case, separators, common digit swaps). Not exhaustive: room
// creators can still hide messages, and viewers can report them.
const SLURS = [
  "n[i1!]gg(?:er|a|ah|az|ers)", "f[a@]gg?(?:ot|ots|y)?", "k[i1]ke", "sp[i1]c", "ch[i1]nk", "tr[a@]nn(?:y|ie)", "ret[a@]rd(?:ed|s)?", "wetback", "g[o0][o0]k", "c[o0][o0]n",
];
const SLUR_PATTERN = new RegExp(`(^|[^a-z])(${SLURS.join("|")})([^a-z]|$)`, "i");
const LINK_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|xyz|gg|co|me|ly|app|link|site|top|ru)\b)/i;
const RESERVED_NAMES = /^(hypr|admin|administrator|moderator|mod|creator|host|support|staff|official)$/i;

function normalized(text: string) {
  return text.normalize("NFKC").replace(/[​-‍﻿]/g, "").replace(/[_.*-]+/g, "").replace(/0/g, "o").replace(/3/g, "e").replace(/4/g, "a").replace(/\$/g, "s");
}

/** Returns a user-facing reason when a message should not be posted. */
export function chatMessageProblem(body: string, { guest }: { guest: boolean }) {
  const text = body.trim();
  if (!text) return "Write a message first.";
  if (text.length > 280) return "Messages can be up to 280 characters.";
  if (SLUR_PATTERN.test(text) || SLUR_PATTERN.test(normalized(text)) || isBlockedRoomName(text)) return "That message can’t be posted here. Keep the room welcoming.";
  if (guest && LINK_PATTERN.test(text)) return "Guests can’t post links. Sign in to share a link.";
  return null;
}

export function guestNameProblem(name: unknown) {
  if (typeof name !== "string") return "Choose a nickname.";
  const value = name.trim().replace(/\s+/g, " ");
  if (!GUEST_NAME.test(value)) return "Nicknames are 2–24 letters, numbers, spaces, dots, dashes or underscores.";
  if (RESERVED_NAMES.test(value.replace(/[\s_.-]/g, "")) || SLUR_PATTERN.test(value) || SLUR_PATTERN.test(normalized(value)) || isBlockedRoomName(value)) return "Choose a different nickname.";
  return null;
}

/** Salted hash of the client network address for short-lived abuse limits only. */
export function clientRateKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHmac("sha256", key("guest rate limit v1")).update(forwarded).digest("hex");
}

/** Anonymous per-tab presence key: never stored raw, never linked to a wallet. */
export function presenceKey(roomId: string, viewer: string) {
  return createHash("sha256").update(key("presence v1")).update(roomId.toLowerCase()).update(viewer).digest("hex");
}

/** One vote per person where we can tell: wallet, then guest identity, then this tab. */
export function voterKey(roomId: string, identity: { wallet?: string | null; guestId?: string | null; viewer?: string | null }) {
  const subject = identity.wallet ? `wallet:${identity.wallet.toLowerCase()}` : identity.guestId ? `guest:${identity.guestId}` : identity.viewer && /^[a-f0-9]{32}$/.test(identity.viewer) ? `tab:${identity.viewer}` : "";
  if (!subject) return null;
  return createHash("sha256").update(key("poll voter v1")).update(roomId.toLowerCase()).update(subject).digest("hex");
}
