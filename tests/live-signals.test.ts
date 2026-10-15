import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeLiveSignal, encodeLiveSignal, REACTIONS, SenderThrottle } from "../src/lib/live-signals";

const bytes = (value: string) => new TextEncoder().encode(value);

test("live signals round-trip reactions and chat pings", () => {
  assert.deepEqual(decodeLiveSignal(encodeLiveSignal({ type: "react", reaction: 2 })), { type: "react", reaction: 2 });
  assert.deepEqual(decodeLiveSignal(encodeLiveSignal({ type: "chat" })), { type: "chat" });
});

test("untrusted live packets are rejected instead of rendered", () => {
  for (const payload of ['{"t":"r","r":99}', '{"t":"r","r":-1}', '{"t":"r","r":1.5}', '{"t":"r","r":"🔥"}', '{"t":"x"}', "not json", `{"t":"c","pad":"${"x".repeat(80)}"}`]) {
    assert.equal(decodeLiveSignal(bytes(payload)), null, payload);
  }
  assert.equal(REACTIONS.length, 5);
});

test("reaction throttling is per sender and recovers after the window", () => {
  const throttle = new SenderThrottle(2, 1000);
  assert.equal(throttle.allow("a", 0), true);
  assert.equal(throttle.allow("a", 10), true);
  assert.equal(throttle.allow("a", 20), false);
  assert.equal(throttle.allow("b", 20), true);
  assert.equal(throttle.allow("a", 1015), true);
});
