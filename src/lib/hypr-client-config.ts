export type HyprClientConfig = {
  enabled: boolean;
  chainId: 46630;
  networkLabel: "Robinhood Chain testnet (46630)";
  explorerUrl: "https://explorer.testnet.chain.robinhood.com";
  reason?: string;
};

export function getHyprClientConfig(rawNetwork = process.env.NEXT_PUBLIC_HYPR_NETWORK): HyprClientConfig {
  const network = rawNetwork?.trim().toLowerCase() || "testnet";
  if (network === "testnet") {
    return {
      enabled: true,
      chainId: 46630,
      networkLabel: "Robinhood Chain testnet (46630)",
      explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    };
  }
  return {
    enabled: false,
    chainId: 46630,
    networkLabel: "Robinhood Chain testnet (46630)",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    reason: network === "mainnet"
      ? "Native HYPR launch and trade controls are testnet-only in this MVP; mainnet is locked.":
        "NEXT_PUBLIC_HYPR_NETWORK must be testnet for native HYPR controls.",
  };
}
