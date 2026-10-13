import assert from "node:assert/strict";
import { test } from "node:test";
import { minimumTradeOutput, reviewIsCurrent, pendingTradeKey, parsePendingTrade } from "../src/lib/trade-review";

test("review preserves an exact 2% minimum output and never accepts zero", () => {
  assert.equal(minimumTradeOutput(10000n), 9800n);
  assert.equal(minimumTradeOutput(1n), 1n);
});
test("reviews expire and are bound to the input and trade direction", () => {
  const review = { input: 100n, direction: "buy", reviewedAt: 1000 };
  assert.equal(reviewIsCurrent(review, 100n, "buy", 30000), true);
  assert.equal(reviewIsCurrent(review, 100n, "buy", 31001), false);
  assert.equal(reviewIsCurrent(review, 101n, "buy", 1001), false);
  assert.equal(reviewIsCurrent(review, 100n, "sell", 1001), false);
  assert.equal(reviewIsCurrent(review, 100n, "buy", 999), false);
});
test("pending trade recovery is separated by account/curve and validates saved receipts", () => {
  assert.equal(pendingTradeKey("0xABC", "0xDEF"), "hypr:pending-trade:46630:0xabc:0xdef");
  const hash = `0x${"a".repeat(64)}`;
  assert.deepEqual(parsePendingTrade(JSON.stringify({ hash, kind: "approval" })), { hash, kind: "approval" });
  assert.equal(parsePendingTrade(JSON.stringify({ hash: "https://bad.test", kind: "trade" })), null);
  assert.equal(parsePendingTrade(JSON.stringify({ hash, kind: "made-up" })), null);
});
