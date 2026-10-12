import { ROBINHOOD_CHAIN, ROBINHOOD_TESTNET } from "@/lib/integrations/pons/constants";

export const HYPR_NETWORKS = {
  mainnet: ROBINHOOD_CHAIN,
  testnet: ROBINHOOD_TESTNET,
} as const;

export type HyprNetwork = keyof typeof HYPR_NETWORKS;

export function getHyprNetwork(): HyprNetwork {
  return process.env.HYPR_NETWORK === "mainnet" ? "mainnet" : "testnet";
}

export function getHyprFactoryAddress() {
  const rawAddress = process.env.HYPR_FACTORY_ADDRESS?.trim();
  if (!rawAddress) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(rawAddress)) {
    throw new Error("HYPR_FACTORY_ADDRESS must be a checksummed or hexadecimal EVM address");
  }
  return rawAddress as `0x${string}`;
}
