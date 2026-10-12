import type { CombinedLaunchDataSource } from "./launch-data";

export type DisplayNetwork = { name: string; id: string };

export function getDisplayNetwork(
  source: CombinedLaunchDataSource,
  nativeNetwork: "mainnet" | "testnet" = process.env.NEXT_PUBLIC_HYPR_NETWORK === "mainnet" ? "mainnet" : "testnet",
): DisplayNetwork {
  if (source === "rpc-partial" || source === "rpc-empty" || source === "rpc-error") {
    return { name: "Robinhood Chain", id: "4663" };
  }
  if (source === "mixed") {
    return { name: "Robinhood Chain · mixed sources", id: "mixed" };
  }
  return nativeNetwork === "mainnet"
    ? { name: "Robinhood Chain", id: "4663" }
    : { name: "Robinhood Chain testnet", id: "46630" };
}
