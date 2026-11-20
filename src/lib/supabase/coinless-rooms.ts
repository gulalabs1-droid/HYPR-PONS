import type { Launch } from "@/lib/types";
import { readSupabaseConfig, type SupabaseConfig } from "./server";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

type Row = { address?: unknown; name?: unknown; metadata?: { kind?: unknown; creator?: unknown } | null; created_at?: unknown };

export function coinlessRoomLaunch(row: Row, index = 0): Launch | null {
  if (typeof row.address !== "string" || !/^0x[0-9a-f]{40}$/i.test(row.address) || typeof row.name !== "string" || row.metadata?.kind !== "room" || typeof row.metadata.creator !== "string" || !/^0x[0-9a-f]{40}$/i.test(row.metadata.creator)) return null;
  return {
    address: row.address as `0x${string}`, pool: ZERO, name: row.name, symbol: "ROOM", logo: "✦",
    description: "A permanent place to watch, talk, and come back for the next show.",
    deployer: row.metadata.creator as `0x${string}`, priceUsd: 0, marketCapUsd: 0, change24h: 0, holders: 0, activeNow: 0, followers: 0, hype: 0,
    rank: index + 1, launchedAt: typeof row.created_at === "string" ? row.created_at : "", trades24h: 0, officialLinks: [],
    origin: "hypr", dataStatus: "partial", coinless: true,
  };
}

/** Rooms opened without a coin. These live only in HYPR's database, never onchain. */
export async function readCoinlessRooms(chainId: number, config: SupabaseConfig | null = readSupabaseConfig(), fetchImpl: typeof fetch = fetch): Promise<Launch[]> {
  if (!config) return [];
  const query = new URLSearchParams({ select: "address,name,metadata,created_at", chain_id: `eq.${chainId}`, origin: "eq.hypr", data_status: "neq.demo", "metadata->>kind": "eq.room", order: "created_at.desc", limit: "500" });
  const response = await fetchImpl(`${config.url}/rest/v1/hypr_tokens?${query}`, { headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Room persistence unavailable (${response.status})`);
  const rows: unknown = await response.json();
  return Array.isArray(rows) ? rows.map((row, index) => coinlessRoomLaunch(row as Row, index)).filter((room): room is Launch => room !== null) : [];
}
