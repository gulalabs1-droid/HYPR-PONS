import assert from "node:assert/strict";
import { test } from "node:test";
import { createTtlCache } from "../src/lib/ttl-cache";
import { checkLaunchName } from "../src/lib/launch-naming";
import { isBlockedRoomName, isThrowawayRoom } from "../src/lib/discovery";
import type { Launch } from "../src/lib/types";

test("concurrent viewer polls share one provider request and reuse it until it expires", async () => {
  let now = 1_000, calls = 0;
  const cache = createTtlCache<number>(3000);
  let release!: (value: number) => void;
  const load = () => { calls++; return new Promise<number>(resolve => { release = resolve; }); };
  const first = cache.get("room", load, () => now), second = cache.get("room", load, () => now);
  release(7);
  assert.deepEqual(await Promise.all([first, second]), [7, 7]);
  assert.equal(calls, 1);
  now += 2999; assert.equal(await cache.get("room", async () => { calls++; return 8; }, () => now), 7);
  now += 1; assert.equal(await cache.get("room", async () => { calls++; return 9; }, () => now), 9);
  assert.equal(calls, 2);
});

test("a failed provider read is not cached, so the next poll retries", async () => {
  const cache = createTtlCache<string>(3000);
  await assert.rejects(cache.get("room", async () => { throw new Error("LiveKit unavailable"); }));
  assert.equal(await cache.get("room", async () => "live"), "live");
});

test("the cache stays bounded when unknown keys are requested", async () => {
  const cache = createTtlCache<number>(60_000, 2);
  let calls = 0;
  for (const key of ["a", "b", "c"]) await cache.get(key, async () => ++calls);
  assert.equal(await cache.get("a", async () => ++calls), 4, "oldest entry was evicted");
  assert.equal(await cache.get("c", async () => ++calls), 3);
});

test("launch names flag hate-symbol shorthand and test-style names before the wallet prompt", () => {
  assert.equal(checkLaunchName("", ""), null);
  assert.equal(checkLaunchName("Maya Makes", "MAYA"), null);
  assert.equal(checkLaunchName("kkk", "KKKK")?.blocked, true);
  assert.equal(checkLaunchName("Friday Show", "1488")?.blocked, true);
  assert.equal(checkLaunchName("Nazi memes", "MEME")?.blocked, true);
  const scratch = checkLaunchName("test", "TST");
  assert.equal(scratch?.blocked, false);
  assert.match(scratch!.message, /permanent onchain/);
  // Ordinary words containing the letters are not blocked.
  assert.equal(isBlockedRoomName("Skkate Club"), false);
  assert.equal(isBlockedRoomName("Crisis Desk"), false);
  assert.equal(isBlockedRoomName("Kisses"), false);
});

test("blocked room names stay out of Explore even when a creator profile name looks normal", () => {
  const token = { address: `0x${"1".repeat(40)}`, name: "Night Show", symbol: "HEIL" } as Launch;
  assert.equal(isThrowawayRoom({ token, title: "Night Show" }), true);
  assert.equal(isThrowawayRoom({ token: { ...token, symbol: "NIGHT" }, title: "Night Show" }), false);
});
