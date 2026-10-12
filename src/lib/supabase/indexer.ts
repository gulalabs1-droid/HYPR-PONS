import { getSupabaseAdminClient } from "./server";

export type IndexTokenRecord = {
  address: string;
  origin: "pons" | "hypr";
  dataStatus: "partial" | "verified";
  name: string;
  symbol: string;
  deployer?: string;
  pool?: string;
  launchedAt?: string;
  metadata?: Record<string, unknown>;
};

export type IndexEventRecord = {
  transactionHash: string;
  logIndex: bigint | number;
  blockNumber: bigint | number;
  eventType: string;
  tokenAddress?: string;
  payload?: Record<string, unknown>;
};

export type IndexBatch = {
  source: string;
  chainId: number;
  fromBlock: bigint | number;
  toBlock: bigint | number;
  tokens: IndexTokenRecord[];
  events: IndexEventRecord[];
};

export type AppliedIndexBatch = {
  source: string;
  chainId: number;
  cursorBlock: bigint;
  processedEvents: number;
};

function asDecimal(value: bigint | number) {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error("Index block values must be non-negative");
    return value.toString();
  }
  if (Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new Error("Index block values must be non-negative safe integers or bigint");
}

function asPayload(batch: IndexBatch) {
  return {
    p_source: batch.source,
    p_chain_id: batch.chainId,
    p_from_block: asDecimal(batch.fromBlock),
    p_to_block: asDecimal(batch.toBlock),
    p_tokens: batch.tokens,
    p_events: batch.events.map((event) => ({
      ...event,
      logIndex: asDecimal(event.logIndex),
      blockNumber: asDecimal(event.blockNumber),
    })),
  };
}

export function serializeIndexBatch(batch: IndexBatch) {
  if (!batch.source.trim() || batch.source.trim().length > 64) throw new Error("Index source is required and must be at most 64 characters");
  if (!Number.isSafeInteger(batch.chainId) || batch.chainId <= 0) throw new Error("Index chain ID is invalid");
  const fromBlock = BigInt(asDecimal(batch.fromBlock));
  const toBlock = BigInt(asDecimal(batch.toBlock));
  if (fromBlock > toBlock) throw new Error("Index batch range is invalid");
  return asPayload(batch);
}

type AppliedIndexBatchRow = {
  source: string;
  chain_id: number;
  cursor_block: string | number;
  processed_events: number;
};

function firstRow<T>(value: unknown): T | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value[0] as T;
}

export async function markIndexError(source: string, chainId: number, errorMessage: string) {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase index persistence is not configured");
  return client.rpc<boolean>("hypr_mark_index_error", {
    p_source: source.trim(),
    p_chain_id: chainId,
    p_error: errorMessage.slice(0, 2_000),
  });
}

/**
 * Apply one confirmed, bounded indexer batch. The SQL RPC owns the transaction,
 * source/chain lock, idempotent event upsert, and checkpoint advancement.
 */
export async function applyIndexBatch(batch: IndexBatch): Promise<AppliedIndexBatch> {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase index persistence is not configured");
  let rows: AppliedIndexBatchRow[];
  try {
    rows = await client.rpc<AppliedIndexBatchRow[]>("hypr_apply_index_batch", serializeIndexBatch(batch));
  } catch (error) {
    try {
      await markIndexError(batch.source, batch.chainId, error instanceof Error ? error.message : "Index batch failed");
    } catch {
      // Preserve the original batch error if the diagnostic write is unavailable.
    }
    throw error;
  }
  const row = firstRow<AppliedIndexBatchRow>(rows);
  if (!row) throw new Error("Supabase did not return an indexing checkpoint");
  return {
    source: row.source,
    chainId: row.chain_id,
    cursorBlock: BigInt(row.cursor_block),
    processedEvents: row.processed_events,
  };
}
