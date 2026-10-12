import { NextResponse } from "next/server";
import { createPublicClient, http, TransactionReceiptNotFoundError } from "viem";
import { getHyprFactoryAddress, getHyprNetwork, HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";
import { launchFromReceipt, launchConfirmations, LAUNCH_CONFIRMATION_DEPTH, transactionHashPattern } from "@/lib/launch-receipt";
import { persistDiscoveredNativeLaunches } from "@/lib/supabase/native-launches";
import { readSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const hash = new URL(request.url).searchParams.get("tx") || "";
  if (!transactionHashPattern.test(hash)) return json({ error: "A valid launch transaction hash is required." }, 400);
  try {
    const factory = getHyprFactoryAddress();
    if (!factory || getHyprNetwork() !== "testnet") return json({ error: "Testnet launch recovery is unavailable." }, 503);
    const network = HYPR_NETWORKS.testnet;
    const client = createPublicClient({ chain: network, transport: http(process.env.HYPR_RPC_URL || network.rpcUrl, { timeout: 10000, retryCount: 0 }) });
    if (await client.getChainId() !== network.id) return json({ error: "Launch network is unavailable." }, 503);
    const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
    if (receipt.status === "reverted") return json({ status: "failed", message: "The transaction was reverted. No coin was created." });
    let launch;
    try { launch = launchFromReceipt(receipt, factory); }
    catch { return json({ error: "This transaction is not a successful HYPR launch." }, 422); }
    const confirmations = launchConfirmations(await client.getBlockNumber(), receipt.blockNumber);
    const details = { transactionHash: hash, creator: launch.creator, token: launch.token, curve: launch.curve, name: launch.name, symbol: launch.symbol, confirmations, requiredConfirmations: Number(LAUNCH_CONFIRMATION_DEPTH) };
    if (confirmations < Number(LAUNCH_CONFIRMATION_DEPTH)) return json({ ...details, status: "confirming" });
    // Recover this exact receipt even after it has aged out of the recent log window.
    // Only canonical, sufficiently confirmed factory logs enter persistence.
    if (!readSupabaseConfig()) return json({ ...details, status: "indexing", message: "Your coin is created. Room setup is temporarily unavailable; do not create it again." });
    try { await persistDiscoveredNativeLaunches([launch], factory, network.id, receipt.blockNumber, receipt.blockNumber); }
    catch { return json({ ...details, status: "indexing", message: "Your coin is created. We’re still preparing its room; do not create it again." }); }
    return json({ ...details, status: "ready", roomUrl: `/room/${launch.token}` });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) return json({ status: "pending", confirmations: 0, requiredConfirmations: Number(LAUNCH_CONFIRMATION_DEPTH) });
    return json({ error: "We couldn’t check your transaction right now. Keep this page or check the transaction link; don’t submit another launch." }, 503);
  }
}
