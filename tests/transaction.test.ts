import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyTransactionReceipt, waitForTransactionReceipt } from "../src/lib/transaction";

test("transaction receipt classification handles canonical and padded statuses", () => {
  assert.equal(classifyTransactionReceipt(null), "pending");
  assert.equal(classifyTransactionReceipt({}), "pending");
  assert.equal(classifyTransactionReceipt({ status: "0x1" }), "confirmed");
  assert.equal(classifyTransactionReceipt({ status: "0x01" }), "confirmed");
  assert.equal(classifyTransactionReceipt({ status: "0x0" }), "reverted");
  assert.equal(classifyTransactionReceipt({ status: "0x00" }), "reverted");
});

test("receipt polling waits through pending state and returns only after confirmation", async () => {
  let calls = 0;
  const provider = {
    request: async () => {
      calls += 1;
      return calls === 1 ? null : { status: "0x1" };
    },
  };
  const receipt = await waitForTransactionReceipt(provider, "0xhash", { attempts: 2, intervalMs: 0 });
  assert.deepEqual(receipt, { status: "0x1" });
  assert.equal(calls, 2);
});

test("receipt polling reports revert and timeout without assuming success", async () => {
  const revertedProvider = { request: async () => ({ status: "0x0" }) };
  await assert.rejects(
    () => waitForTransactionReceipt(revertedProvider, "0xreverted", { intervalMs: 0 }),
    /transaction reverted/,
  );
  const pendingProvider = { request: async () => null };
  await assert.rejects(
    () => waitForTransactionReceipt(pendingProvider, "0xtimedout", { attempts: 2, intervalMs: 0 }),
    /transaction receipt timed out/,
  );
});
