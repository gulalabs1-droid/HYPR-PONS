import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto";
import { UUID } from "./growth";
import { getSupabaseAdminClient } from "./supabase/server";
import { growthChain, growthEnabled } from "./growth-server";

export const PILOT_COOKIE = "hypr-pilot-consent";
function key() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Analytics unavailable");
  return Buffer.from(hkdfSync("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY, "HYPR pilot analytics", "anonymous consent v1", 32));
}
export function issuePilotConsent(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ id: randomUUID(), expires: now + 30 * 86400_000 })).toString("base64url");
  return `${payload}.${createHmac("sha256", key()).update(payload).digest("base64url")}`;
}
export function readPilotConsent(value: string | undefined, now = Date.now()) {
  if (!value || value.length > 500) return null;
  try {
    const [payload, mac, extra] = value.split("."); if (!payload || !mac || extra) return null;
    const signature = Buffer.from(mac, "base64url"), expected = createHmac("sha256", key()).update(payload).digest();
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.id === "string" && UUID.test(data.id) && Number.isSafeInteger(data.expires) && data.expires > now ? data.id as string : null;
  } catch { return null; }
}
export function permitsPilotRequest(request: Request) {
  return request.headers.get("dnt") !== "1" && request.headers.get("sec-gpc") !== "1" && !/bot|crawler|spider|preview|facebookexternalhit|slack|discord|whatsapp|telegram/i.test(request.headers.get("user-agent") || "");
}
export async function recordPilotEvent(actor: string, event: string, room: string, id: string, shareId: string | null) {
  const client = getSupabaseAdminClient();
  if (!growthEnabled() || !client) return null;
  return client.rpc<{ shareId?: string }>("hypr_record_growth_event", { p_chain_id: growthChain(), p_token_address: room, p_actor_id: actor, p_event: event, p_event_id: id, p_share_id: shareId });
}
