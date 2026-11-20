import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { sameOrigin } from "@/lib/community-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { tipAnnouncement, tipProblem } from "@/lib/tips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/**
 * Announces a tip after checking the chain: the viewer's wallet already sent
 * test ETH straight to the creator. HYPR never holds or moves funds.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to share a tip." }, { status: 403, headers });
  let body: { roomId?: unknown; hash?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  if (typeof body?.roomId !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(body.roomId) || typeof body.hash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(body.hash)) return NextResponse.json({ error: "Invalid tip." }, { status: 400, headers });
  if (getHyprNetwork() !== "testnet") return NextResponse.json({ error: "Tips are available on testnet only." }, { status: 503, headers });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Tips can’t be announced right now." }, { status: 503, headers });
  const { findRoomLaunch } = await import("@/lib/page-data");
  const room = await findRoomLaunch(body.roomId);
  if (!room || room.token.origin !== "hypr") return NextResponse.json({ error: "Room not found." }, { status: 404, headers });
  const network = HYPR_NETWORKS.testnet;
  const chain = createPublicClient({ chain: network, transport: http(process.env.HYPR_RPC_URL || network.rpcUrl, { timeout: 10000, retryCount: 1 }) });
  const hash = body.hash as `0x${string}`;
  const [tx, receipt] = await Promise.all([chain.getTransaction({ hash }).catch(() => null), chain.getTransactionReceipt({ hash }).catch(() => null)]);
  const problem = tipProblem(tx ? { from: tx.from, to: tx.to, value: tx.value, input: tx.input, chainId: tx.chainId } : null, receipt, room.token.deployer, network.id);
  if (problem) return NextResponse.json({ error: problem }, { status: tx && receipt ? 422 : 404, headers });
  try {
    const recorded = await client.rpc<boolean>("hypr_record_tip", { p_chain_id: network.id, p_token_address: body.roomId, p_tx_hash: hash.toLowerCase(), p_from: tx!.from.toLowerCase(), p_amount_wei: tx!.value.toString(), p_announcement: tipAnnouncement(tx!.value) });
    return NextResponse.json({ announced: recorded }, { headers });
  } catch { return NextResponse.json({ error: "Your tip was sent, but the chat announcement failed. It’s still in the creator’s wallet." }, { status: 503, headers }); }
}
