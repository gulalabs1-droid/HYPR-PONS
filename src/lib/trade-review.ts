export const TRADE_BUFFER_BPS = 200n;
export const QUOTE_REVIEW_TTL_MS = 30_000;
// Truncate displayed estimates, not transaction values. Exact amounts remain
// available in the review, and contract minima are always computed in wei.
export function readableTradeAmount(value: bigint, places = 6) {
  const scale = 10n ** 18n;
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(18, "0").slice(0, places).replace(/0+$/, "");
  if (value > 0n && whole === 0n && !fraction) return `<0.${"0".repeat(places - 1)}1`;
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}
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
