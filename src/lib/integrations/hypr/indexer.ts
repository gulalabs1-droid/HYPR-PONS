import { createPublicClient, http, parseAbi, parseAbiItem, type Log } from "viem";
import { HYPR_FACTORY_ABI } from "./abi";
import { getHyprFactoryAddress, getHyprNetwork, HYPR_NETWORKS, type HyprNetwork } from "./constants";
import { confirmedBlockRange, stableEventId, uniqueLogsByEventId } from "../indexer-utils";

const launchEvent = parseAbiItem(HYPR_FACTORY_ABI[0]);
const tradeEvent = parseAbiItem(
  "event TradeExecuted(address indexed trader, bool indexed isBuy, uint256 grossQuoteAmount, uint256 tokenAmount, uint256 fee, uint256 creatorFee, uint256 protocolFee, uint256 realQuoteReserve, uint256 realTokenReserve)",
);
const graduationEvent = parseAbiItem("event Graduated(bytes32 indexed poolId, uint256 tokenAmount, uint256 quoteAmount)");
const LOOKBACK_BLOCKS = 2_500n;
const CONFIRMATION_DEPTH = 12n;
const LOG_CHUNK_SIZE = 500n;
const curveStateAbi = parseAbi([
  "function realQuoteReserve() view returns (uint256)",
  "function realTokenReserve() view returns (uint256)",
  "function creatorFees() view returns (uint256)",
  "function protocolFees() view returns (uint256)",
  "function graduationPoolId() view returns (bytes32)",
  "function phase() view returns (uint8)",
]);

export type NativeIndexedLaunch = {
  token: `0x${string}`;
  curve: `0x${string}`;
  creator: `0x${string}`;
  totalSupply: bigint;
  tradableSupply: bigint;
  virtualQuoteReserve: bigint;
  graduationThreshold: bigint;
  totalFeeBps: bigint;
  creatorFeeBps: bigint;
  protocolFeeBps: bigint;
  name: string;
  symbol: string;
  curveProgressBps?: number;
  curvePhase?: "Live" | "Graduating" | "Graduated";
  realQuoteReserve?: bigint;
  realTokenReserve?: bigint;
  creatorFees?: bigint;
  protocolFees?: bigint;
  graduationPoolId?: `0x${string}`;
  tradeVolume?: bigint;
  tradeCount?: number;
  transactionHash: `0x${string}`;
  graduationTxHash?: `0x${string}`;
  eventId: string;
  blockNumber: bigint;
};

export type NativeProtocolSnapshot = {
  network: HyprNetwork;
  factoryAddress: `0x${string}` | null;
  source: "unconfigured" | "native-rpc" | "native-error";
  launchCount: number;
  activeLaunches?: number;
  graduatedLaunches?: number;
  totalTradeVolume?: bigint;
  totalTradeCount?: number;
  totalCreatorFees?: bigint;
  totalProtocolFees?: bigint;
  lookbackBlocks: bigint;
  confirmationDepth: bigint;
};

type LaunchLogArgs = Omit<NativeIndexedLaunch, "eventId" | "blockNumber">;

export const eventId = stableEventId;

export function normalizeLaunchLog(log: Log): NativeIndexedLaunch | null {
  const args = (log as Log & { args?: Partial<LaunchLogArgs> }).args;
  const id = eventId(log);
  if (
    !args?.token || !args.curve || !args.creator || args.totalSupply === undefined
    || args.tradableSupply === undefined || args.virtualQuoteReserve === undefined
    || args.graduationThreshold === undefined || args.totalFeeBps === undefined
    || args.creatorFeeBps === undefined || args.protocolFeeBps === undefined
    || args.name === undefined || args.symbol === undefined
    || log.blockNumber === null || id === null
  ) return null;
  return {
    token: args.token,
    curve: args.curve,
    creator: args.creator,
    totalSupply: args.totalSupply,
    tradableSupply: args.tradableSupply,
    virtualQuoteReserve: args.virtualQuoteReserve,
    graduationThreshold: args.graduationThreshold,
    totalFeeBps: args.totalFeeBps,
    creatorFeeBps: args.creatorFeeBps,
    protocolFeeBps: args.protocolFeeBps,
    name: args.name,
    symbol: args.symbol,
    transactionHash: log.transactionHash as `0x${string}`,
    eventId: id,
    blockNumber: log.blockNumber,
  };
}

export async function readRecentNativeLaunches(
  rpcUrl = process.env.HYPR_RPC_URL || HYPR_NETWORKS[getHyprNetwork()].rpcUrl,
): Promise<NativeIndexedLaunch[]> {
  const factoryAddress = getHyprFactoryAddress();
  if (!factoryAddress) return [];
  const network = HYPR_NETWORKS[getHyprNetwork()];
  const client = createPublicClient({ chain: network, transport: http(rpcUrl) });
  const latest = await client.getBlockNumber();
  const { fromBlock, safeHead } = confirmedBlockRange(latest, CONFIRMATION_DEPTH, LOOKBACK_BLOCKS, 0n);
  const logs: Log[] = [];
  for (let cursor = fromBlock; cursor <= safeHead; cursor += LOG_CHUNK_SIZE) {
    const toBlock = cursor + LOG_CHUNK_SIZE - 1n < safeHead ? cursor + LOG_CHUNK_SIZE - 1n : safeHead;
    logs.push(...await client.getLogs({
      address: factoryAddress,
      event: launchEvent,
      fromBlock: cursor,
      toBlock,
    }));
  }
  const uniqueLogs = uniqueLogsByEventId(logs);
  const launches = uniqueLogs.map(normalizeLaunchLog).filter((item): item is NativeIndexedLaunch => Boolean(item));
  return Promise.all(launches.map(async (launch) => {
    const [quoteReserveResult, tokenReserveResult, creatorFeesResult, protocolFeesResult, poolIdResult, phaseResult] = await Promise.allSettled([
      client.readContract({ address: launch.curve, abi: curveStateAbi, functionName: "realQuoteReserve" }),
      client.readContract({ address: launch.curve, abi: curveStateAbi, functionName: "realTokenReserve" }),
      client.readContract({ address: launch.curve, abi: curveStateAbi, functionName: "creatorFees" }),
      client.readContract({ address: launch.curve, abi: curveStateAbi, functionName: "protocolFees" }),
      client.readContract({ address: launch.curve, abi: curveStateAbi, functionName: "graduationPoolId" }),
      client.readContract({ address: launch.curve, abi: curveStateAbi, functionName: "phase" }),
    ]);
    const realQuoteReserve = quoteReserveResult.status === "fulfilled" ? quoteReserveResult.value : undefined;
    const realTokenReserve = tokenReserveResult.status === "fulfilled" ? tokenReserveResult.value : undefined;
    const creatorFees = creatorFeesResult.status === "fulfilled" ? creatorFeesResult.value : undefined;
    const protocolFees = protocolFeesResult.status === "fulfilled" ? protocolFeesResult.value : undefined;
    const graduationPoolId = poolIdResult.status === "fulfilled" ? poolIdResult.value : undefined;
    const phaseValue = phaseResult.status === "fulfilled" ? Number(phaseResult.value) : -1;
    const curvePhase = phaseValue === 0 ? "Live" : phaseValue === 1 ? "Graduating" : phaseValue === 2 ? "Graduated" : undefined;
    let graduationTxHash: `0x${string}` | undefined;
    if (phaseValue === 2) {
      try {
        const graduationLogs: Log[] = [];
        for (let cursor = launch.blockNumber; cursor <= safeHead; cursor += LOG_CHUNK_SIZE) {
          const toBlock = cursor + LOG_CHUNK_SIZE - 1n < safeHead ? cursor + LOG_CHUNK_SIZE - 1n : safeHead;
          graduationLogs.push(...await client.getLogs({
            address: launch.curve,
            event: graduationEvent,
            fromBlock: cursor,
            toBlock,
          }));
        }
        const confirmedGraduationLogs = uniqueLogsByEventId(graduationLogs).filter((log) => log.transactionHash != null);
        const lastGraduationLog = confirmedGraduationLogs[confirmedGraduationLogs.length - 1];
        graduationTxHash = lastGraduationLog?.transactionHash as `0x${string}` | undefined;
      } catch {
        // A missing graduation-log read must not hide the confirmed curve state.
      }
    }
    const curveProgressBps = realQuoteReserve === undefined
      ? undefined
      : realQuoteReserve >= launch.graduationThreshold
        ? 10_000
        : Number((realQuoteReserve * 10_000n) / launch.graduationThreshold);
    let tradeVolume: bigint | undefined;
    let tradeCount: number | undefined;
    try {
      const tradeLogs: Log[] = [];
      for (let cursor = launch.blockNumber; cursor <= safeHead; cursor += LOG_CHUNK_SIZE) {
        const toBlock = cursor + LOG_CHUNK_SIZE - 1n < safeHead ? cursor + LOG_CHUNK_SIZE - 1n : safeHead;
        tradeLogs.push(...await client.getLogs({
          address: launch.curve,
          event: tradeEvent,
          fromBlock: cursor,
          toBlock,
        }));
      }
      const uniqueTrades = uniqueLogsByEventId(tradeLogs);
      tradeVolume = 0n;
      tradeCount = 0;
      for (const log of uniqueTrades) {
        const args = (log as Log & { args?: { grossQuoteAmount?: bigint } }).args;
        if (eventId(log) === null || args?.grossQuoteAmount === undefined) continue;
        tradeVolume += args.grossQuoteAmount;
        tradeCount += 1;
      }
    } catch {
      // Keep launch/state data visible when a bounded trade-log query is unavailable.
    }
    return { ...launch, curveProgressBps, curvePhase, realQuoteReserve, realTokenReserve, creatorFees, protocolFees, graduationPoolId, graduationTxHash, tradeVolume, tradeCount };
  }));
}

export async function readNativeProtocolSnapshot(): Promise<NativeProtocolSnapshot> {
  const network = getHyprNetwork();
  let factoryAddress: `0x${string}` | null;
  try {
    factoryAddress = getHyprFactoryAddress();
  } catch {
    return {
      network,
      factoryAddress: null,
      source: "native-error",
      launchCount: 0,
      lookbackBlocks: LOOKBACK_BLOCKS,
      confirmationDepth: CONFIRMATION_DEPTH,
    };
  }
  const base = {
    network,
    factoryAddress,
    launchCount: 0,
    lookbackBlocks: LOOKBACK_BLOCKS,
    confirmationDepth: CONFIRMATION_DEPTH,
  } as const;
  if (!factoryAddress) return { ...base, source: "unconfigured" };

  try {
    const launches = await readRecentNativeLaunches();
    const phasesComplete = launches.every((launch) => launch.curvePhase !== undefined);
    const tradeCountsComplete = launches.every((launch) => launch.tradeCount !== undefined);
    const tradeVolumesComplete = launches.every((launch) => launch.tradeVolume !== undefined);
    const creatorFeesComplete = launches.every((launch) => launch.creatorFees !== undefined);
    const protocolFeesComplete = launches.every((launch) => launch.protocolFees !== undefined);
    return {
      ...base,
      source: "native-rpc",
      launchCount: launches.length,
      activeLaunches: phasesComplete ? launches.filter((launch) => launch.curvePhase !== "Graduated").length : undefined,
      graduatedLaunches: phasesComplete ? launches.filter((launch) => launch.curvePhase === "Graduated").length : undefined,
      totalTradeVolume: tradeVolumesComplete ? launches.reduce((total, launch) => total + (launch.tradeVolume || 0n), 0n) : undefined,
      totalTradeCount: tradeCountsComplete ? launches.reduce((total, launch) => total + (launch.tradeCount || 0), 0) : undefined,
      totalCreatorFees: creatorFeesComplete ? launches.reduce((total, launch) => total + (launch.creatorFees || 0n), 0n) : undefined,
      totalProtocolFees: protocolFeesComplete ? launches.reduce((total, launch) => total + (launch.protocolFees || 0n), 0n) : undefined,
    };
  } catch {
    return { ...base, source: "native-error" };
  }
}
