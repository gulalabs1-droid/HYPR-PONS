import { NextResponse } from "next/server";
import { getCombinedLaunchData } from "@/lib/launch-data";
import {
  createClaimChallenge,
  expectedClaimChainId,
  isEvmAddress,
} from "@/lib/room-claims";
import {
  isSupabasePersistenceConfigured,
  persistClaimChallenge,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { tokenAddress?: unknown; claimantAddress?: unknown; chainId?: unknown };
    const tokenAddress = body.tokenAddress;
    const claimantAddress = body.claimantAddress;
    const chainId = body.chainId;
    if (!isEvmAddress(tokenAddress) || !isEvmAddress(claimantAddress) || typeof chainId !== "number" || !Number.isInteger(chainId)) {
      return NextResponse.json({ error: "tokenAddress, claimantAddress, and integer chainId are required" }, { status: 400 });
    }

    const { launches } = await getCombinedLaunchData();
    const launch = launches.find((item) => item.address.toLowerCase() === tokenAddress.toLowerCase());
    if (!launch) return NextResponse.json({ error: "Launch was not found in the current indexed window" }, { status: 404 });
    if (launch.dataStatus === "demo") {
      return NextResponse.json({ error: "Demo rooms cannot be claimed until live launch data is configured" }, { status: 409 });
    }

    const expectedChainId = expectedClaimChainId(launch);
    if (chainId !== expectedChainId) {
      return NextResponse.json({ error: `Switch the wallet to the launch network (${expectedChainId}) first` }, { status: 400 });
    }

    const challenge = createClaimChallenge(launch, claimantAddress, expectedChainId);
    let persistence: "supabase" | "process-local" = "process-local";
    let durablePersistence = false;
    try {
      durablePersistence = isSupabasePersistenceConfigured();
    } catch {
      return NextResponse.json({ error: "Durable claim persistence is misconfigured; no claim was recorded" }, { status: 503 });
    }
    if (durablePersistence) {
      try {
        await persistClaimChallenge(challenge);
        persistence = "supabase";
      } catch {
        return NextResponse.json({ error: "Durable claim persistence is unavailable; no claim was recorded" }, { status: 503 });
      }
    }
    return NextResponse.json({
      challengeId: challenge.challengeId,
      message: challenge.message,
      expiresAt: challenge.expiresAt,
      tokenAddress: challenge.tokenAddress,
      creatorAddress: challenge.creatorAddress,
      chainId: challenge.chainId,
      verification: "indexed-launch-creator",
      persistence,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create claim challenge" }, { status: 400 });
  }
}
