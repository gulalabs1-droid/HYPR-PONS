import type { NativeIndexedLaunch } from "@/lib/integrations/hypr/indexer";
import { readSupabaseConfig, type SupabaseConfig } from "./server";
import { applyIndexBatch, type IndexBatch } from "./indexer";

const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const hashPattern = /^0x[0-9a-fA-F]{64}$/;

export function nativeLaunchIndexBatch(launches: NativeIndexedLaunch[], factory: string, chainId: number, fromBlock: bigint, toBlock: bigint): IndexBatch {
  return {
    source: "hypr", chainId, fromBlock, toBlock,
    tokens: launches.map((launch) => ({
      address: launch.token, origin: "hypr", dataStatus: "partial", name: launch.name,
      symbol: launch.symbol, deployer: launch.creator,
      metadata: {
        factory: factory.toLowerCase(), creator: launch.creator, curve: launch.curve,
        transactionHash: launch.transactionHash, blockNumber: launch.blockNumber.toString(),
        logIndex: launch.eventId.split(":").pop(), totalSupply: launch.totalSupply.toString(),
        tradableSupply: launch.tradableSupply.toString(), virtualQuoteReserve: launch.virtualQuoteReserve.toString(),
        graduationThreshold: launch.graduationThreshold.toString(), totalFeeBps: launch.totalFeeBps.toString(),
        creatorFeeBps: launch.creatorFeeBps.toString(), protocolFeeBps: launch.protocolFeeBps.toString(),
      },
    })),
    events: launches.filter((launch) => launch.blockNumber >= fromBlock && launch.blockNumber <= toBlock).map((launch) => ({
      transactionHash: launch.transactionHash, logIndex: BigInt(launch.eventId.split(":").pop() || "0"),
      blockNumber: launch.blockNumber, eventType: "LaunchCreated", tokenAddress: launch.token,
      payload: { curve: launch.curve, creator: launch.creator, name: launch.name, symbol: launch.symbol },
    })),
  };
}

export async function persistDiscoveredNativeLaunches(launches: NativeIndexedLaunch[], factory: string, chainId: number, fromBlock: bigint, toBlock: bigint) {
  if (!launches.length || !readSupabaseConfig()) return;
  await applyIndexBatch(nativeLaunchIndexBatch(launches, factory, chainId, fromBlock, toBlock));
}

export function persistedNativeLaunch(row: unknown, factory: string): NativeIndexedLaunch | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  const m = value.metadata as Record<string, unknown> | undefined;
  if (!m || typeof m.factory !== "string" || m.factory.toLowerCase() !== factory.toLowerCase()) return null;
  if (typeof value.address !== "string" || !addressPattern.test(value.address) ||
      typeof m.curve !== "string" || !addressPattern.test(m.curve) ||
      typeof m.creator !== "string" || !addressPattern.test(m.creator) ||
      typeof m.transactionHash !== "string" || !hashPattern.test(m.transactionHash) ||
      typeof value.name !== "string" || !value.name || value.name.length > 32 ||
      typeof value.symbol !== "string" || !value.symbol || value.symbol.length > 10) return null;
  function integer(field: string) {
    const input = m![field];
    if (typeof input !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(input)) throw new Error("Invalid persisted native integer");
    return BigInt(input);
  }
  try {
    const blockNumber = integer("blockNumber");
    const logIndex = integer("logIndex");
    const totalSupply = integer("totalSupply");
    const tradableSupply = integer("tradableSupply");
    const virtualQuoteReserve = integer("virtualQuoteReserve");
    const graduationThreshold = integer("graduationThreshold");
    const totalFeeBps = integer("totalFeeBps");
    const creatorFeeBps = integer("creatorFeeBps");
    const protocolFeeBps = integer("protocolFeeBps");
    if (totalSupply <= tradableSupply || tradableSupply === 0n || virtualQuoteReserve === 0n ||
        graduationThreshold === 0n || totalFeeBps === 0n || totalFeeBps >= 10000n ||
        creatorFeeBps + protocolFeeBps !== totalFeeBps) return null;
    return {
      token: value.address as `0x${string}`, curve: m.curve as `0x${string}`,
      creator: m.creator as `0x${string}`, transactionHash: m.transactionHash as `0x${string}`,
      name: value.name, symbol: value.symbol, blockNumber,
      eventId: `${m.transactionHash.toLowerCase()}:${logIndex}`,
      totalSupply, tradableSupply, virtualQuoteReserve, graduationThreshold,
      totalFeeBps, creatorFeeBps, protocolFeeBps,
    };
  } catch { return null; }
}

export async function readPersistedNativeLaunches(
  factory: string,
  chainId: number,
  config: SupabaseConfig | null = readSupabaseConfig(),
  fetchImpl: typeof fetch = fetch,
) {
  if (!config) return [];
  const query = new URLSearchParams({
    select: "address,name,symbol,metadata", chain_id: `eq.${chainId}`, origin: "eq.hypr",
    data_status: "neq.demo", "metadata->>factory": `eq.${factory.toLowerCase()}`,
    order: "created_at.desc", limit: "500",
  });
  const response = await fetchImpl(`${config.url}/rest/v1/hypr_tokens?${query}`, {
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Native launch persistence unavailable (${response.status})`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("Native launch persistence returned an invalid response");
  return rows.map((row) => persistedNativeLaunch(row, factory)).filter((row): row is NativeIndexedLaunch => row !== null);
}
