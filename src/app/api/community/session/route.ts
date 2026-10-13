import { NextRequest, NextResponse } from "next/server";
import { authorizationMessage, COMMUNITY_CHALLENGE_COOKIE, COMMUNITY_SESSION_COOKIE, communitySession, createCommunityChallenge, decodeAuthorization, encodeAuthorization, requestOrigin, sameOrigin, verifyCommunitySignature } from "@/lib/community-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function cookieOptions(request: Request, maxAge: number) { return { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict" as const, path: "/api/community", maxAge }; }

export async function GET(request: NextRequest) {
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  return NextResponse.json({ wallet: session?.wallet || null }, { headers });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to sign in." }, { status: 403, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Shared community is unavailable." }, { status: 503, headers });
  let body: { wallet?: string; signature?: string };
  try { body = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid body"); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  if (!body.signature) {
    try {
      const challenge = createCommunityChallenge(body.wallet || "", requestOrigin(request));
      const response = NextResponse.json({ message: authorizationMessage(challenge) }, { headers });
      response.cookies.set(COMMUNITY_CHALLENGE_COOKIE, encodeAuthorization(challenge), cookieOptions(request, 300));
      return response;
    } catch { return NextResponse.json({ error: "A valid public wallet address is required." }, { status: 400, headers }); }
  }
  const challenge = decodeAuthorization(request.cookies.get(COMMUNITY_CHALLENGE_COOKIE)?.value, requestOrigin(request), "challenge");
  if (!challenge || !await verifyCommunitySignature(challenge, body.signature)) return NextResponse.json({ error: "Wallet authorization expired or could not be verified. Try signing in again." }, { status: 401, headers });
  try {
    if (!await client.rpc<boolean>("hypr_consume_community_nonce", { p_nonce: challenge.nonce })) return NextResponse.json({ error: "Authorization already used. Sign in again." }, { status: 401, headers });
    const response = NextResponse.json({ wallet: challenge.wallet }, { headers });
    response.cookies.set(COMMUNITY_SESSION_COOKIE, encodeAuthorization(communitySession(challenge)), cookieOptions(request, 7200));
    response.cookies.set(COMMUNITY_CHALLENGE_COOKIE, "", cookieOptions(request, 0));
    return response;
  } catch { return NextResponse.json({ error: "Community sign-in is temporarily unavailable." }, { status: 503, headers }); }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to sign out." }, { status: 403, headers });
  const response = NextResponse.json({ wallet: null }, { headers });
  response.cookies.set(COMMUNITY_SESSION_COOKIE, "", cookieOptions(request, 0));
  response.cookies.set(COMMUNITY_CHALLENGE_COOKIE, "", cookieOptions(request, 0));
  return response;
}
