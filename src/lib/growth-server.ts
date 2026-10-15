import { getSupabaseAdminClient } from "./supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "./integrations/hypr/constants";
import type { GrowthRoom } from "./growth";

export function growthEnabled() { return process.env.HYPR_GROWTH_ENABLED === "true"; }
export function growthChain() { return HYPR_NETWORKS[getHyprNetwork()].id; }
export function isOperatorWallet(wallet: string | null | undefined) {
  if (!wallet) return false;
  const configured = (process.env.HYPR_OPERATOR_WALLET || process.env.HYPR_ANALYTICS_ADMIN_WALLET || "").trim().toLowerCase();
  return Boolean(configured && configured === wallet.toLowerCase());
}
export async function readGrowth(wallet: string | null = null, roomId: string | null = null): Promise<GrowthRoom[]> {
  const client = getSupabaseAdminClient();
  if (!growthEnabled() || !client) throw new Error("Creator scheduling is not available yet.");
  return client.rpc<GrowthRoom[]>("hypr_read_growth", { p_chain_id: growthChain(), p_wallet_address: wallet, p_token_address: roomId });
}
