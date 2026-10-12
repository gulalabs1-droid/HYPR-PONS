import assert from "node:assert/strict";
import test from "node:test";
import { formatCurveProgress } from "../src/lib/curve-progress";

test("tiny actual curve reserves remain visibly nonzero", () => {
  assert.equal(formatCurveProgress("493747562121412", "10000000000000000000", 0, "Live"), "0.004937%");
  assert.equal(formatCurveProgress("1", "10000000000000000000"), "<0.000001%");
  assert.equal(formatCurveProgress("100000000000000000", "10000000000000000000"), "1%");
});

test("curve progress handles zero, invalid and graduated values without invention", () => {
  assert.equal(formatCurveProgress("0", "10"), "0%");
  assert.equal(formatCurveProgress("0", "10", 0, "Graduated"), "100%");
  assert.equal(formatCurveProgress("10", "10"), "100%");
  assert.equal(formatCurveProgress("1", "0"), "—");
  assert.equal(formatCurveProgress("-1", "10"), "—");
  assert.equal(formatCurveProgress(undefined, undefined, 123), "1.23%");
  assert.equal(formatCurveProgress(), "—");
});
