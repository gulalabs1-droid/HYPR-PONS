import webpush from "web-push";
import { getSupabaseAdminClient } from "./supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "./integrations/hypr/constants";

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushPayload = { title: string; body: string; url: string; tag: string };

// The server POSTs to subscription endpoints, so only real browser push
// services are accepted. Anything else would let a visitor aim HYPR's server
// at arbitrary URLs.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/];

export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim(), privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@hypr.invalid";
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

export function validSubscription(value: unknown): value is PushSubscriptionInput {
  if (!value || typeof value !== "object") return false;
  const { endpoint, keys } = value as Partial<PushSubscriptionInput>;
  if (typeof endpoint !== "string" || endpoint.length > 1000 || !keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return false;
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{10,100}$/.test(keys.auth)) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.some(pattern => pattern.test(url.hostname));
  } catch { return false; }
}

type Target = { endpoint: string; p256dh: string; auth: string };

/** Sends one event to everyone following the room. Each browser is notified at most once per ref. */
export async function notifyRoom(roomId: string, kind: "live" | "show", ref: string, payload: PushPayload, send = webpush.sendNotification) {
  const config = pushConfig(), client = getSupabaseAdminClient();
  if (!config || !client) return 0;
  const targets = await client.rpc<Target[]>("hypr_push_claim", { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_token_address: roomId, p_kind: kind, p_ref: ref.slice(0, 100) });
  let sent = 0;
  for (let offset = 0; offset < targets.length; offset += 20) {
    await Promise.all(targets.slice(offset, offset + 20).map(async target => {
      if (!validSubscription({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } })) return;
      try {
        await send({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), {
          TTL: kind === "live" ? 15 * 60 : 30 * 60, urgency: "high", topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32),
          vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
        });
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number })?.statusCode;
        await client.rpc("hypr_push_failed", { p_endpoint: target.endpoint, p_gone: status === 404 || status === 410 }).catch(() => undefined);
      }
    }));
  }
  return sent;
}
