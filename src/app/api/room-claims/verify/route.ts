import { NextResponse } from "next/server";
import { verifyClaimChallenge } from "@/lib/room-claims";
import { isSupabasePersistenceConfigured, verifyDurableClaim } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { challengeId?: unknown; signature?: unknown };
    if (typeof body.challengeId !== "string" || typeof body.signature !== "string") {
      return NextResponse.json({ error: "challengeId and signature are required" }, { status: 400 });
    }
    let durable: boolean;
    try {
      durable = isSupabasePersistenceConfigured();
    } catch {
      return NextResponse.json({ error: "Durable claim persistence is misconfigured" }, { status: 503 });
    }
    const result = durable
      ? await verifyDurableClaim(body.challengeId, body.signature)
      : await verifyClaimChallenge(body.challengeId, body.signature);
    if (!result) throw new Error("Claim persistence is unavailable");
    return NextResponse.json({
      verified: true,
      tokenAddress: result.tokenAddress,
      claimantAddress: result.claimantAddress,
      creatorAddress: result.creatorAddress,
      chainId: result.chainId,
      verifiedAt: result.verifiedAt,
      verification: "indexed-launch-creator",
      persistence: durable ? "supabase" : "process-local",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Claim verification failed" }, { status: 400 });
  }
}
