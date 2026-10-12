import assert from "node:assert/strict";
import { test } from "node:test";
import { isReviewedHyprV0Config, REVIEWED_HYPR_V0 } from "../src/lib/hypr-launch-config";

const recipient = "0x0000000000000000000000000000000000000001";

test("reviewed HYPR V0 economics are accepted with a nonzero recipient", () => {
  assert.equal(isReviewedHyprV0Config({ ...REVIEWED_HYPR_V0, protocolRecipient: recipient }), true);
});

test("launch creation fails closed when reviewed economics or recipient are wrong", () => {
  const valid = { ...REVIEWED_HYPR_V0, protocolRecipient: recipient };
  assert.equal(isReviewedHyprV0Config({ ...valid, graduationThreshold: 11n * 10n ** 18n }), false);
  assert.equal(isReviewedHyprV0Config({ ...valid, protocolFeeBps: 94n }), false);
  assert.equal(isReviewedHyprV0Config({ ...valid, protocolRecipient: "0x0000000000000000000000000000000000000000" }), false);
  assert.equal(isReviewedHyprV0Config({ ...valid, protocolRecipient: "not-an-address" }), false);
});
