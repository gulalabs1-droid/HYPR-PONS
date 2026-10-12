import { parseAbiItem, decodeEventLog, type Log } from "viem";
import { HYPR_FACTORY_ABI } from "./integrations/hypr/abi";
import { normalizeLaunchLog, type NativeIndexedLaunch } from "./integrations/hypr/indexer";

export const LAUNCH_CONFIRMATION_DEPTH = 12n;
export const transactionHashPattern = /^0x[0-9a-fA-F]{64}$/;
const launchEvent = parseAbiItem(HYPR_FACTORY_ABI[0]);

export function launchFromReceipt(receipt: { status: string; transactionHash: string; blockNumber: bigint; logs: readonly Log[] }, factory: string): NativeIndexedLaunch {
  if (receipt.status !== "success") throw new Error("The launch transaction did not succeed.");
  const launches = receipt.logs.filter((log) => log.address.toLowerCase() === factory.toLowerCase()).flatMap((log) => {
    try {
      const decoded = decodeEventLog({ abi: [launchEvent], data: log.data, topics: log.topics, strict: true });
      const normalized = normalizeLaunchLog({ ...log, transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber, args: decoded.args } as Log);
      return normalized ? [normalized] : [];
    } catch { return []; }
  });
  if (launches.length !== 1) throw new Error("This transaction does not contain one canonical HYPR launch.");
  return launches[0];
}

export function launchConfirmations(latest: bigint, launchBlock: bigint) {
  // Match the indexer's safe head exactly: latest - 12, not receipt-count + 1.
  return Number(latest > launchBlock ? latest - launchBlock : 0n);
}
