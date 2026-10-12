export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;
export const ROBINHOOD_CHAIN_IDS = [ROBINHOOD_CHAIN_ID, ROBINHOOD_TESTNET_CHAIN_ID] as const;

export function isRobinhoodChainId(chainId: number) {
  return chainId === ROBINHOOD_CHAIN_ID || chainId === ROBINHOOD_TESTNET_CHAIN_ID;
}

export function robinhoodNetworkLabel(chainId: number) {
  if (chainId === ROBINHOOD_TESTNET_CHAIN_ID) return "Robinhood Chain testnet";
  if (chainId === ROBINHOOD_CHAIN_ID) return "Robinhood Chain";
  return "an unsupported network";
}

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { ethereum?: EthereumProvider }).ethereum || null;
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
