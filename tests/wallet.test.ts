import assert from "node:assert/strict";
import { test } from "node:test";
import { isRobinhoodChainId, personalSignHex, robinhoodNetworkLabel } from "../src/lib/wallet";

test("wallet helpers recognize both Robinhood networks and reject others", () => {
  assert.equal(isRobinhoodChainId(4663), true);
  assert.equal(isRobinhoodChainId(46630), true);
  assert.equal(isRobinhoodChainId(1), false);
  assert.equal(robinhoodNetworkLabel(4663), "Robinhood Chain");
  assert.equal(robinhoodNetworkLabel(46630), "Robinhood Chain testnet");
  assert.equal(robinhoodNetworkLabel(1), "an unsupported network");
});

test("wallet authorization messages use canonical UTF-8 hex for EVM providers", () => {
  assert.equal(personalSignHex("HYPR"), "0x48595052");
  assert.equal(personalSignHex("gm 🚀"), `0x${Buffer.from("gm 🚀").toString("hex")}`);
});
