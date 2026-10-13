export const TRADE_BUFFER_BPS = 200n;
export const QUOTE_REVIEW_TTL_MS = 30_000;
export function minimumTradeOutput(output: bigint) { return output * (10_000n - TRADE_BUFFER_BPS) / 10_000n || 1n; }
export function reviewIsCurrent(review: { input: bigint; direction: string; reviewedAt: number }, input: bigint, direction: string, now = Date.now()) {
  return review.input === input && review.direction === direction && now >= review.reviewedAt && now - review.reviewedAt <= QUOTE_REVIEW_TTL_MS;
}

export function pendingTradeKey(curve: string, wallet: string) { return `hypr:pending-trade:46630:${curve.toLowerCase()}:${wallet.toLowerCase()}`; }
export function parsePendingTrade(raw: string | null) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { hash?: unknown; kind?: unknown };
    return typeof value.hash === "string" && /^0x[0-9a-f]{64}$/i.test(value.hash) && (value.kind === "approval" || value.kind === "trade")
      ? { hash: value.hash, kind: value.kind as "approval" | "trade" } : null;
  } catch { return null; }
}
