import { createHmac, hkdfSync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse, type AuthenticationResponseJSON, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { COMMUNITY_SESSION_COOKIE, encodeAuthorization, requestOrigin, sameOrigin } from "@/lib/community-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { guestNameProblem } from "@/lib/guest-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const CHALLENGE_COOKIE = "hypr-passkey-challenge";
const cookie = (request: Request, maxAge: number) => ({ httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict" as const, path: "/api/community", maxAge });

type Challenge = { challenge: string; origin: string; purpose: "register" | "login"; name?: string; expiresAt: number };
function key() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("unavailable");
  return Buffer.from(hkdfSync("sha256", secret, "HYPR passkeys", "challenge v1", 32));
}
function sealChallenge(value: Challenge) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${createHmac("sha256", key()).update(payload).digest("base64url")}`;
}
function openChallenge(value: string | undefined, origin: string, purpose: Challenge["purpose"]): Challenge | null {
  if (!value || value.length > 2000) return null;
  try {
    const [payload, mac] = value.split(".");
    const expected = createHmac("sha256", key()).update(payload).digest(), supplied = Buffer.from(mac || "", "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as Challenge;
    return decoded.origin === origin && decoded.purpose === purpose && decoded.expiresAt > Date.now() ? decoded : null;
  } catch { return null; }
}
const rpId = (origin: string) => new URL(origin).hostname;

/** A two-hour HYPR member session, without a wallet. Member accounts can't broadcast or create rooms. */
function signedIn(request: NextRequest, memberAddress: string, name: string) {
  const origin = requestOrigin(request);
  const session = { wallet: memberAddress.toLowerCase(), chainId: HYPR_NETWORKS[getHyprNetwork()].id, origin, nonce: randomUUID(), expiresAt: Date.now() + 2 * 60 * 60_000, kind: "session" as const, account: "passkey" as const, name };
  const response = NextResponse.json({ wallet: session.wallet, name, kind: "passkey" }, { headers });
  response.cookies.set(COMMUNITY_SESSION_COOKIE, encodeAuthorization(session), cookie(request, 7200));
  response.cookies.set(CHALLENGE_COOKIE, "", cookie(request, 0));
  return response;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to sign in." }, { status: 403, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503, headers });
  let body: { action?: unknown; name?: unknown; response?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  const origin = requestOrigin(request), rpID = rpId(origin);

  if (body.action === "register-options") {
    const problem = guestNameProblem(body.name);
    if (problem) return NextResponse.json({ error: problem }, { status: 422, headers });
    const name = String(body.name).trim().replace(/\s+/g, " ");
    const options = await generateRegistrationOptions({ rpName: "HYPR", rpID, userName: name, userDisplayName: name, userID: randomBytes(16), attestationType: "none", authenticatorSelection: { residentKey: "required", userVerification: "preferred" } });
    const response = NextResponse.json({ options }, { headers });
    response.cookies.set(CHALLENGE_COOKIE, sealChallenge({ challenge: options.challenge, origin, purpose: "register", name, expiresAt: Date.now() + 5 * 60_000 }), cookie(request, 300));
    return response;
  }
  if (body.action === "register") {
    const challenge = openChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value, origin, "register");
    if (!challenge?.name) return NextResponse.json({ error: "That took too long. Try again." }, { status: 401, headers });
    try {
      const result = await verifyRegistrationResponse({ response: body.response as RegistrationResponseJSON, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
      if (!result.verified) throw new Error("unverified");
      const { credential } = result.registrationInfo;
      const memberAddress = `0x${randomBytes(20).toString("hex")}`;
      await client.rpc("hypr_passkey_register", { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_member_address: memberAddress, p_display_name: challenge.name, p_credential_id: credential.id, p_public_key: Buffer.from(credential.publicKey).toString("base64url"), p_counter: credential.counter, p_transports: credential.transports || [] });
      return signedIn(request, memberAddress, challenge.name);
    } catch { return NextResponse.json({ error: "Your passkey couldn’t be set up. Try again." }, { status: 400, headers }); }
  }
  if (body.action === "login-options") {
    const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
    const response = NextResponse.json({ options }, { headers });
    response.cookies.set(CHALLENGE_COOKIE, sealChallenge({ challenge: options.challenge, origin, purpose: "login", expiresAt: Date.now() + 5 * 60_000 }), cookie(request, 300));
    return response;
  }
  if (body.action === "login") {
    const challenge = openChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value, origin, "login");
    const response = body.response as AuthenticationResponseJSON | undefined;
    if (!challenge || typeof response?.id !== "string") return NextResponse.json({ error: "That took too long. Try again." }, { status: 401, headers });
    try {
      const account = await client.rpc<{ memberAddress: string; name: string; publicKey: string; counter: number; transports: string[] } | null>("hypr_passkey_lookup", { p_credential_id: response.id });
      if (!account) return NextResponse.json({ error: "We don’t recognize that passkey. Create a new one instead." }, { status: 404, headers });
      const result = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
        credential: { id: response.id, publicKey: new Uint8Array(Buffer.from(account.publicKey, "base64url")), counter: Number(account.counter), transports: account.transports as never } });
      if (!result.verified) throw new Error("unverified");
      await client.rpc("hypr_passkey_used", { p_credential_id: response.id, p_counter: result.authenticationInfo.newCounter });
      return signedIn(request, account.memberAddress, account.name);
    } catch { return NextResponse.json({ error: "That passkey couldn’t be verified. Try again." }, { status: 401, headers }); }
  }
  return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
}
