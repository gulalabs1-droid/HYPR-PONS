import { selectedWalletProvider } from "./wallet-discovery";

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
  return selectedWalletProvider() || (window as Window & { ethereum?: EthereumProvider }).ethereum || null;
}

const TESTNET_PARAMS = {
  chainId: `0x${ROBINHOOD_TESTNET_CHAIN_ID.toString(16)}`,
  chainName: "Robinhood Chain testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com"],
};

// Asks the wallet to switch (adding the network first if it is unknown). Returns
// true only when the wallet reports the testnet chain afterwards.
export async function switchToRobinhoodTestnet(ethereum: EthereumProvider) {
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: TESTNET_PARAMS.chainId }] });
  } catch (error) {
    const code = (error as { code?: number; data?: { originalError?: { code?: number } } })?.code
      ?? (error as { data?: { originalError?: { code?: number } } })?.data?.originalError?.code;
    if (code !== 4902) return false;
    try {
      await ethereum.request({ method: "wallet_addEthereumChain", params: [TESTNET_PARAMS] });
    } catch {
      return false;
    }
  }
  try {
    return Number(await ethereum.request({ method: "eth_chainId" })) === ROBINHOOD_TESTNET_CHAIN_ID;
  } catch {
    return false;
  }
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function personalSignHex(message: string) {
  return `0x${Array.from(new TextEncoder().encode(message), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
