import { createPublicClient, http, parseAbiItem, type Log } from "viem";
import type { Launch } from "@/lib/types";
import { PONS, ROBINHOOD_CHAIN } from "./constants";

const PONS_TOKEN_LAUNCHED_SIGNATURE = "event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)";
const launchEvent = parseAbiItem(PONS_TOKEN_LAUNCHED_SIGNATURE);

export type IndexedLaunch = Pick<Launch, "address" | "pool" | "deployer"> & { eventId: string; blockNumber: bigint };

export function eventId(log: Pick<Log, "transactionHash" | "logIndex">) {
  return `${log.transactionHash ?? "unknown"}:${log.logIndex ?? 0}`;
}

export function normalizeLaunchLog(log: Log): IndexedLaunch | null {
  const args = (log as Log & { args?: { token?: `0x${string}`; deployer?: `0x${string}`; pool?: `0x${string}` } }).args;
  if (!args?.token || !args.deployer || !args.pool || log.blockNumber === null) return null;
  return { address: args.token, deployer: args.deployer, pool: args.pool, eventId: eventId(log), blockNumber: log.blockNumber };
}

export async function readRecentLaunches(rpcUrl = process.env.PONS_RPC_URL || ROBINHOOD_CHAIN.rpcUrl): Promise<IndexedLaunch[]> {
  const client = createPublicClient({ chain: ROBINHOOD_CHAIN, transport: http(rpcUrl) });
  const latest = await client.getBlockNumber();
  const fromBlock = latest > 2500n ? latest - 2500n : PONS.activeFactoryStartBlock;
  const logs = await client.getLogs({ address: PONS.activeFactory, event: launchEvent, fromBlock, toBlock: latest });
  return logs.map(normalizeLaunchLog).filter((item): item is IndexedLaunch => Boolean(item));
}
