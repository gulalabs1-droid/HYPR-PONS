import { encodeFunctionData, formatEther, parseAbi, type Address, type Hex } from "viem";
import { ROBINHOOD_TESTNET_CHAIN_ID } from "./wallet";

export const CREATE_LAUNCH_ABI = parseAbi([
  "function createLaunch(string name, string symbol) returns (address tokenAddress, address curveAddress)",
]);

export type LaunchReadClient = {
  getChainId(): Promise<number>;
  getBalance(args: { address: Address }): Promise<bigint>;
  getGasPrice(): Promise<bigint>;
  estimateGas(args: { account: Address; to: Address; data: Hex; value: bigint }): Promise<bigint>;
};

export class LaunchPreflightError extends Error {
  constructor(message: string, readonly needsFunding = false) { super(message); }
}

/** Read-only checks: this helper never requests a signature or sends a transaction. */
export async function prepareNativeLaunch(client: LaunchReadClient, account: Address, factory: Address, name: string, symbol: string) {
  const cleanName = name.trim();
  const cleanSymbol = symbol.trim().replace(/^\$+/, "").toUpperCase();
  const bytes = new TextEncoder();
  if (cleanName.length < 2 || bytes.encode(cleanName).length > 32 || cleanSymbol.length < 2 || bytes.encode(cleanSymbol).length > 10) {
    throw new LaunchPreflightError("Use a name of 2–32 UTF-8 bytes and a symbol of 2–10 UTF-8 bytes (excluding a leading $). No transaction was sent.");
  }
  if (await client.getChainId() !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new LaunchPreflightError("The launch RPC is not Robinhood Chain testnet. No transaction was sent.");
  }
  const balance = await client.getBalance({ address: account });
  if (balance === 0n) {
    throw new LaunchPreflightError(`Your wallet ${account} has 0 Robinhood test ETH. Get free test ETH from the official faucet for this exact address, then try again. No transaction was sent. Do not buy real ETH.`, true);
  }
  const data = encodeFunctionData({ abi: CREATE_LAUNCH_ABI, functionName: "createLaunch", args: [cleanName, cleanSymbol] });
  // A public-RPC estimate also detects contract reverts before the wallet is opened.
  const [estimate, gasPrice] = await Promise.all([
    client.estimateGas({ account, to: factory, data, value: 0n }), client.getGasPrice(),
  ]);
  if (estimate <= 0n || gasPrice <= 0n) throw new LaunchPreflightError("A valid testnet gas estimate is unavailable. No transaction was sent.");
  const gas = (estimate * 120n + 99n) / 100n;
  const feeBudget = gas * gasPrice * 2n;
  if (balance < feeBudget) {
    throw new LaunchPreflightError(`Your wallet has ${formatEther(balance)} test ETH; the current buffered gas budget is ${formatEther(feeBudget)} test ETH. Get free Robinhood test ETH before creating a launch. No transaction was sent.`, true);
  }
  return { data, gas, feeBudget, account };
}

export function launchErrorMessage(error: unknown) {
  const item = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const message = typeof item.message === "string" ? item.message : "";
  if (item.code === 4001 || /user rejected|user denied/i.test(message)) return "You cancelled the wallet request. No new launch was confirmed.";
  if (/insufficient funds|insufficient balance/i.test(message)) return "The wallet does not have enough Robinhood test ETH for gas. Use the official faucet; do not buy real ETH. No new launch was confirmed.";
  if (error instanceof LaunchPreflightError) return error.message;
  if (!message || /^unexpected error\.?$/i.test(message.trim())) return "The wallet could not prepare or submit this testnet transaction. Check its popup and Activity for a transaction hash before retrying. No new launch was confirmed.";
  return message;
}
