import assert from "node:assert/strict";
import test from "node:test";
import { nativeLaunchIndexBatch, persistedNativeLaunch, readPersistedNativeLaunches } from "../src/lib/supabase/native-launches";

const factory = `0x${"a".repeat(40)}`;
const row = {
  address: `0x${"1".repeat(40)}`, name: "Persisted test", symbol: "TEST",
  metadata: {
    factory, creator: `0x${"2".repeat(40)}`, curve: `0x${"3".repeat(40)}`,
    transactionHash: `0x${"4".repeat(64)}`, blockNumber: "10", logIndex: "2",
    totalSupply: "1000000", tradableSupply: "800000", virtualQuoteReserve: "100",
    graduationThreshold: "10", totalFeeBps: "125", creatorFeeBps: "30", protocolFeeBps: "95",
  },
};

test("historical native records preserve canonical event identity without inventing state", () => {
  const launch = persistedNativeLaunch(row, factory);
  assert.ok(launch);
  assert.equal(launch.eventId, `${row.metadata.transactionHash}:2`);
  assert.equal(launch.blockNumber, 10n);
  assert.equal(launch.realQuoteReserve, undefined);
  assert.equal(launch.tradeCount, undefined);
});

test("native persistence round trips provenance and excludes old events from a newer checkpoint batch", () => {
  const launch = persistedNativeLaunch(row, factory)!;
  const batch = nativeLaunchIndexBatch([launch], factory, 46630, 11n, 20n);
  assert.equal(batch.tokens.length, 1);
  assert.equal(batch.events.length, 0);
  const token = batch.tokens[0];
  const restored = persistedNativeLaunch({ address: token.address, name: token.name, symbol: token.symbol, metadata: token.metadata }, factory);
  assert.equal(restored?.eventId, launch.eventId);
  assert.equal(restored?.creator, launch.creator);
  const original = nativeLaunchIndexBatch([launch], factory, 46630, 0n, 20n);
  assert.equal(original.events[0].blockNumber, 10n);
});

test("historical native records reject foreign factories, incomplete records and invalid economics", () => {
  assert.equal(persistedNativeLaunch(row, `0x${"b".repeat(40)}`), null);
  for (const field of ["creator", "transactionHash", "blockNumber", "totalSupply", "totalFeeBps"]) {
    const invalid = structuredClone(row);
    delete (invalid.metadata as Record<string, unknown>)[field];
    assert.equal(persistedNativeLaunch(invalid, factory), null);
  }
  assert.equal(persistedNativeLaunch({ ...row, metadata: { ...row.metadata, protocolFeeBps: "100" } }, factory), null);
  assert.equal(persistedNativeLaunch({ ...row, metadata: { ...row.metadata, graduationThreshold: "0" } }, factory), null);
});

test("persistent native lookup separates network/factory and keeps credentials in headers", async () => {
  let requestUrl = "";
  let headers: Headers | undefined;
  const launches = await readPersistedNativeLaunches(factory, 46630, { url: "https://example.supabase.co", serviceRoleKey: "test-server-key" }, async (input, init) => {
    requestUrl = String(input);
    headers = new Headers(init?.headers);
    return new Response(JSON.stringify([row]));
  });
  const url = new URL(requestUrl);
  assert.equal(url.searchParams.get("chain_id"), "eq.46630");
  assert.equal(url.searchParams.get("metadata->>factory"), `eq.${factory}`);
  assert.equal(url.searchParams.get("data_status"), "neq.demo");
  assert.equal(url.searchParams.get("origin"), "eq.hypr");
  assert.equal(requestUrl.includes("test-server-key"), false);
  assert.equal(headers?.get("authorization"), "Bearer test-server-key");
  assert.equal(launches.length, 1);
});
