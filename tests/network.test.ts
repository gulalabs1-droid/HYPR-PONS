import assert from "node:assert/strict";
import { test } from "node:test";
import { getDisplayNetwork } from "../src/lib/network-display";

test("Pons-only sources display Robinhood Chain mainnet", () => {
  assert.deepEqual(getDisplayNetwork("rpc-partial", "testnet"), { name: "Robinhood Chain", id: "4663" });
  assert.deepEqual(getDisplayNetwork("rpc-empty", "testnet"), { name: "Robinhood Chain", id: "4663" });
  assert.deepEqual(getDisplayNetwork("rpc-error", "testnet"), { name: "Robinhood Chain", id: "4663" });
});

test("mixed and native-only sources preserve their own network context", () => {
  assert.deepEqual(getDisplayNetwork("mixed", "testnet"), { name: "Robinhood Chain · mixed sources", id: "mixed" });
  assert.deepEqual(getDisplayNetwork("native-empty", "testnet"), { name: "Robinhood Chain testnet", id: "46630" });
  assert.deepEqual(getDisplayNetwork("native-empty", "mainnet"), { name: "Robinhood Chain", id: "4663" });
});
