import assert from "node:assert/strict";
import { test } from "node:test";
import { isRobinhoodChainId, robinhoodNetworkLabel } from "../src/lib/wallet";

test("wallet helpers recognize both Robinhood networks and reject others", () => {
  assert.equal(isRobinhoodChainId(4663), true);
  assert.equal(isRobinhoodChainId(46630), true);
  assert.equal(isRobinhoodChainId(1), false);
  assert.equal(robinhoodNetworkLabel(4663), "Robinhood Chain");
  assert.equal(robinhoodNetworkLabel(46630), "Robinhood Chain testnet");
  assert.equal(robinhoodNetworkLabel(1), "an unsupported network");
});
