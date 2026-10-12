import assert from "node:assert/strict";
import { test } from "node:test";
import { getHyprClientConfig } from "../src/lib/hypr-client-config";

test("native HYPR browser controls enable only on testnet", () => {
  const config = getHyprClientConfig("testnet");
  assert.equal(config.enabled, true);
  assert.equal(config.chainId, 46630);
  assert.equal(config.explorerUrl, "https://explorer.testnet.chain.robinhood.com");
});

test("native HYPR browser controls fail closed for mainnet or invalid configuration", () => {
  assert.equal(getHyprClientConfig("mainnet").enabled, false);
  assert.match(getHyprClientConfig("mainnet").reason || "", /testnet-only/);
  assert.equal(getHyprClientConfig("staging").enabled, false);
  assert.match(getHyprClientConfig("staging").reason || "", /must be testnet/);
});
