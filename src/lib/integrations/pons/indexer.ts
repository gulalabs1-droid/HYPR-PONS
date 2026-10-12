import { createPublicClient, http, parseAbi, parseAbiItem, type Log } from "viem";
import type { Launch } from "@/lib/types";
import { getPonsRpcUrl, PONS, ROBINHOOD_CHAIN } from "./constants";
import { confirmedBlockRange, stableEventId, uniqueLogsByEventId } from "../indexer-utils";

const PONS_TOKEN_LAUNCHED_SIGNATURE = "event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)";
const launchEvent = parseAbiItem(PONS_TOKEN_LAUNCHED_SIGNATURE);
const swapEvent = parseAbiItem("event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)");
const tokenMetadataAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const poolStateAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
]);
const LOOKBACK_BLOCKS = 2_500n;
const CONFIRMATION_DEPTH = 12n;
const LOG_CHUNK_SIZE = 500n;

export type IndexedLaunch = Pick<Launch, "address" | "pool" | "deployer"> & {
  eventId: string;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  name?: string;
  symbol?: string;
  decimals?: number;
  swapCount?: number;
  poolPriceQuote?: number;
  poolLiquidity?: string;
};

export const eventId = stableEventId;

export function countStableLogs(logs: Log[]) {
  return uniqueLogsByEventId(logs).filter((log) => eventId(log) !== null).length;
}

export function resolvePonsVersion(rawVersion = process.env.PONS_VERSION) {
  const version = rawVersion?.trim().toLowerCase() || "v1";
  if (version !== "v1") throw new Error(`Unsupported Pons version: ${version}. The configured adapter only supports v1.`);
  return "v1" as const;
}

export function boundedMetadataValue(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

export function v3QuotePriceFromSqrtPrice(
  sqrtPriceX96: bigint,
  tokenIsToken0: boolean,
  tokenDecimals: number,
  quoteDecimals = 18,
) {
  if (sqrtPriceX96 <= 0n || !Number.isInteger(tokenDecimals) || !Number.isInteger(quoteDecimals)) return undefined;
  const normalizedSqrt = Number(sqrtPriceX96) / 2 ** 96;
  if (!Number.isFinite(normalizedSqrt) || normalizedSqrt <= 0) return undefined;
  const rawPrice = normalizedSqrt * normalizedSqrt;
  const humanPrice = tokenIsToken0
    ? rawPrice * 10 ** (tokenDecimals - quoteDecimals)
    : (1 / rawPrice) * 10 ** (tokenDecimals - quoteDecimals);
  return Number.isFinite(humanPrice) && humanPrice > 0 ? humanPrice : undefined;
}

export function normalizeLaunchLog(log: Log): IndexedLaunch | null {
  const args = (log as Log & { args?: { token?: `0x${string}`; deployer?: `0x${string}`; pool?: `0x${string}` } }).args;
  const id = eventId(log);
  if (!args?.token || !args.deployer || !args.pool || log.blockNumber === null || id === null) return null;
  return { address: args.token, deployer: args.deployer, pool: args.pool, transactionHash: log.transactionHash as `0x${string}`, eventId: id, blockNumber: log.blockNumber };
}

export async function readRecentLaunches(rpcUrl = getPonsRpcUrl()): Promise<IndexedLaunch[]> {
  resolvePonsVersion();
  const client = createPublicClient({ chain: ROBINHOOD_CHAIN, transport: http(rpcUrl) });
  const latest = await client.getBlockNumber();
  const { fromBlock, safeHead } = confirmedBlockRange(latest, CONFIRMATION_DEPTH, LOOKBACK_BLOCKS, PONS.activeFactoryStartBlock);
  if (fromBlock > safeHead) return [];
  const logs: Log[] = [];
  for (let cursor = fromBlock; cursor <= safeHead; cursor += LOG_CHUNK_SIZE) {
    const toBlock = cursor + LOG_CHUNK_SIZE - 1n < safeHead ? cursor + LOG_CHUNK_SIZE - 1n : safeHead;
    logs.push(...await client.getLogs({ address: PONS.activeFactory, event: launchEvent, fromBlock: cursor, toBlock }));
  }
  const uniqueLogs = uniqueLogsByEventId(logs);
  const launches = uniqueLogs.map(normalizeLaunchLog).filter((item): item is IndexedLaunch => Boolean(item));
  return Promise.all(launches.map(async (launch) => {
    const [nameResult, symbolResult, decimalsResult] = await Promise.allSettled([
      client.readContract({ address: launch.address, abi: tokenMetadataAbi, functionName: "name" }),
      client.readContract({ address: launch.address, abi: tokenMetadataAbi, functionName: "symbol" }),
      client.readContract({ address: launch.address, abi: tokenMetadataAbi, functionName: "decimals" }),
    ]);
    const name = nameResult.status === "fulfilled" ? boundedMetadataValue(nameResult.value, 128) : undefined;
    const symbol = symbolResult.status === "fulfilled" ? boundedMetadataValue(symbolResult.value, 32) : undefined;
    const decimals = decimalsResult.status === "fulfilled" ? Number(decimalsResult.value) : undefined;
    const [token0Result, token1Result, slot0Result, liquidityResult] = await Promise.allSettled([
      client.readContract({ address: launch.pool, abi: poolStateAbi, functionName: "token0" }),
      client.readContract({ address: launch.pool, abi: poolStateAbi, functionName: "token1" }),
      client.readContract({ address: launch.pool, abi: poolStateAbi, functionName: "slot0" }),
      client.readContract({ address: launch.pool, abi: poolStateAbi, functionName: "liquidity" }),
    ]);
    const token0 = token0Result.status === "fulfilled" ? token0Result.value : undefined;
    const token1 = token1Result.status === "fulfilled" ? token1Result.value : undefined;
    const sqrtPriceX96 = slot0Result.status === "fulfilled" ? slot0Result.value[0] : undefined;
    const poolLiquidity = liquidityResult.status === "fulfilled" ? liquidityResult.value.toString() : undefined;
    const tokenAddress = launch.address.toLowerCase();
    const isToken0 = typeof token0 === "string" && token0.toLowerCase() === tokenAddress;
    const isToken1 = typeof token1 === "string" && token1.toLowerCase() === tokenAddress;
    const hasWethQuote = typeof token0 === "string" && typeof token1 === "string"
      && ((isToken0 && token1.toLowerCase() === PONS.weth.toLowerCase()) || (isToken1 && token0.toLowerCase() === PONS.weth.toLowerCase()));
    const poolPriceQuote = hasWethQuote && sqrtPriceX96 !== undefined && decimals !== undefined
      ? v3QuotePriceFromSqrtPrice(sqrtPriceX96, isToken0, decimals, 18)
      : undefined;
    let swapCount: number | undefined;
    try {
      const swapLogs: Log[] = [];
      for (let cursor = fromBlock; cursor <= safeHead; cursor += LOG_CHUNK_SIZE) {
        const toBlock = cursor + LOG_CHUNK_SIZE - 1n < safeHead ? cursor + LOG_CHUNK_SIZE - 1n : safeHead;
        swapLogs.push(...await client.getLogs({
          address: launch.pool,
          event: swapEvent,
          fromBlock: cursor,
          toBlock,
        }));
      }
      swapCount = countStableLogs(swapLogs);
    } catch {
      // Keep launch identity and metadata visible when a pool query is unavailable.
    }
    return {
      ...launch,
      name,
      symbol,
      decimals: decimals !== undefined && Number.isInteger(decimals) && decimals <= 255 ? decimals : undefined,
      swapCount,
      poolPriceQuote,
      poolLiquidity,
    };
  }));
}
