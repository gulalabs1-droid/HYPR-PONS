import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto";
import { recoverMessageAddress } from "viem";
import { getHyprNetwork, HYPR_NETWORKS } from "./integrations/hypr/constants";

export const COMMUNITY_SESSION_COOKIE = "hypr-community-session";
export const COMMUNITY_CHALLENGE_COOKIE = "hypr-community-challenge";
type Authorization = { wallet: string; chainId: number; origin: string; nonce: string; expiresAt: number; kind: "challenge" | "session" };

function authKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("Shared community authentication is unavailable.");
  // Domain-separated key; the database credential itself never leaves the server.
  return Buffer.from(hkdfSync("sha256", secret, "HYPR community", "session signing v1", 32));
}

export function encodeAuthorization(value: Authorization) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${createHmac("sha256", authKey()).update(payload).digest("base64url")}`;
}

export function decodeAuthorization(value: string | undefined, origin: string, kind: Authorization["kind"], now = Date.now()): Authorization | null {
  if (!value || value.length > 2000) return null;
  try {
    const [payload, mac, extra] = value.split(".");
    if (!payload || !mac || extra) return null;
    const expected = createHmac("sha256", authKey()).update(payload).digest();
    const supplied = Buffer.from(mac, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as Authorization;
    if (decoded.kind !== kind || decoded.origin !== origin || decoded.chainId !== HYPR_NETWORKS[getHyprNetwork()].id || !/^0x[0-9a-f]{40}$/.test(decoded.wallet) || !Number.isSafeInteger(decoded.expiresAt) || decoded.expiresAt <= now || !/^[0-9a-f-]{36}$/.test(decoded.nonce)) return null;
    return decoded;
  } catch { return null; }
}

export function authorizationMessage(value: Authorization) {
  return ["HYPR community sign-in", `Website: ${value.origin}`, `Wallet: ${value.wallet}`, `Chain ID: ${value.chainId}`, `Nonce: ${value.nonce}`, `Expires: ${new Date(value.expiresAt).toISOString()}`, "Authorize community actions for two hours: chat, follows, reports, and your own creator profile/shows. No transaction, token approval, or funds transfer."].join("\n");
}

export function createCommunityChallenge(wallet: string, origin: string): Authorization {
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) throw new Error("A valid public wallet address is required.");
  return { wallet: wallet.toLowerCase(), origin, chainId: HYPR_NETWORKS[getHyprNetwork()].id, nonce: randomUUID(), expiresAt: Date.now() + 5 * 60_000, kind: "challenge" };
}

export async function verifyCommunitySignature(value: Authorization, signature: string) {
  if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) return false;
  try { return (await recoverMessageAddress({ message: authorizationMessage(value), signature: signature as `0x${string}` })).toLowerCase() === value.wallet; } catch { return false; }
}

export function communitySession(value: Authorization): Authorization {
  return { ...value, expiresAt: Date.now() + 2 * 60 * 60_000, kind: "session" };
}

export function sameOrigin(request: Request) {
  return request.headers.get("origin") === requestOrigin(request);
}

export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  // Next's local server can use localhost internally even when the browser
  // requests 127.0.0.1. Host is the browser-controlled destination, not an
  // arbitrary forwarded-origin header. Bind the signed session to that host.
  const host = request.headers.get("host");
  if (host && /^[a-zA-Z0-9.-]+(?::[0-9]+)?$/.test(host)) url.host = host;
  return url.origin;
}
