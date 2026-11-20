import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEther } from "viem";
import { tipAnnouncement, tipProblem } from "../src/lib/tips";

const creator = `0x${"c".repeat(40)}`, viewer = `0x${"v".replace("v", "a").repeat(40)}`;
const ok = { from: viewer, to: creator, value: parseEther("0.005"), input: "0x", chainId: 46630 };
const receipt = { status: "success", blockNumber: 10n };

test("only a successful plain transfer from a viewer to the room creator counts as a tip", () => {
  assert.equal(tipProblem(ok, receipt, creator.toUpperCase().replace("0X", "0x"), 46630), null);
  assert.match(tipProblem(null, null, creator, 46630)!, /not found/);
  assert.match(tipProblem(ok, { ...receipt, status: "reverted" }, creator, 46630)!, /failed/);
  assert.match(tipProblem({ ...ok, to: `0x${"d".repeat(40)}` }, receipt, creator, 46630)!, /creator/);
  assert.match(tipProblem({ ...ok, input: "0xa9059cbb" }, receipt, creator, 46630)!, /plain transfers/);
  assert.match(tipProblem({ ...ok, chainId: 4663 }, receipt, creator, 46630)!, /different network/);
  assert.match(tipProblem({ ...ok, value: 1n }, receipt, creator, 46630)!, /between/);
  assert.match(tipProblem({ ...ok, from: creator }, receipt, creator, 46630)!, /own room/);
});

test("tip announcements state the amount in test ETH", () => {
  assert.equal(tipAnnouncement(parseEther("0.005")), "💸 Tipped the creator 0.005 test ETH");
});
