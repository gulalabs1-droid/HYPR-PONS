import assert from "node:assert/strict";
import test from "node:test";
import { creatorAccessProblem, streamingErrorMessage } from "../src/lib/creator-access";
const creator = `0x${"a".repeat(40)}`;
test("broadcast preflight accepts only the indexed creator on the native testnet", () => {
  assert.equal(creatorAccessProblem(creator.toUpperCase(), 46630, creator), null);
  assert.match(creatorAccessProblem(undefined, 46630, creator)!, /Connect your creator wallet/);
  assert.match(creatorAccessProblem(creator, 4663, creator)!, /Robinhood Chain testnet/);
  assert.match(creatorAccessProblem(`0x${"b".repeat(40)}`, 46630, creator)!, /Switch to that wallet/);
});
test("streaming failures explain permissions, devices and cancelled signing", () => {
  assert.match(streamingErrorMessage({ name: "NotAllowedError" }), /site settings/);
  assert.match(streamingErrorMessage({ name: "NotFoundError" }), /No camera/);
  assert.match(streamingErrorMessage({ name: "NotReadableError" }), /another app/);
  assert.match(streamingErrorMessage({ code: 4001 }), /has not started/);
});
