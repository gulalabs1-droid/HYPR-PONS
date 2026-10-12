import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { createClaimChallenge } from "../src/lib/room-claims";
import { applyIndexBatch, serializeIndexBatch } from "../src/lib/supabase/indexer";
import { createSupabaseAdminClient, hashClaimChallengeId, verifyDurableClaim } from "../src/lib/supabase/server";

test("claim challenge hashes are deterministic and never store the raw id", () => {
  const challengeId = "8b1f35e8-ec25-47a5-a55c-7ca5a1bd0b0a";
  const hash = hashClaimChallengeId(challengeId);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, challengeId);
  assert.equal(hash, hashClaimChallengeId(challengeId));
});

test("index batches serialize bigint ranges for the transactional checkpoint RPC", () => {
  const payload = serializeIndexBatch({
    source: "hypr",
    chainId: 46630,
    fromBlock: 100n,
    toBlock: 200n,
    tokens: [{
      address: "0x0000000000000000000000000000000000000001",
      origin: "hypr",
      dataStatus: "partial",
      name: "Launch",
      symbol: "LCH",
    }],
    events: [{
      transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      logIndex: 2n,
      blockNumber: 150n,
      eventType: "LaunchCreated",
      tokenAddress: "0x0000000000000000000000000000000000000001",
    }],
  });
  assert.equal(payload.p_from_block, "100");
  assert.equal(payload.p_to_block, "200");
  assert.equal(payload.p_events[0].logIndex, "2");
  assert.equal(payload.p_events[0].blockNumber, "150");
  assert.throws(() => serializeIndexBatch({
    source: "hypr",
    chainId: 46630,
    fromBlock: -1,
    toBlock: 2,
    tokens: [],
    events: [],
  }), /non-negative/);
});

test("failed index batches preserve the original error and attempt a diagnostic marker", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls: string[] = [];
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  globalThis.fetch = async (url) => {
    const functionName = String(url).split("/").pop() || "";
    calls.push(functionName);
    if (functionName === "hypr_apply_index_batch") return new Response("upstream failure", { status: 503 });
    return new Response(JSON.stringify(true), { status: 200 });
  };
  try {
    await assert.rejects(() => applyIndexBatch({
      source: "hypr",
      chainId: 46630,
      fromBlock: 100n,
      toBlock: 200n,
      tokens: [],
      events: [],
    }), /Supabase RPC failed \(503\)/);
    assert.deepEqual(calls, ["hypr_apply_index_batch", "hypr_mark_index_error"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("Supabase admin RPC sends the service key only in server-side request headers", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createSupabaseAdminClient(
    { url: "https://example.supabase.co", serviceRoleKey: "service-role-test-key" },
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify([{ ok: true }]), { status: 200 });
    },
  );

  const result = await client.rpc("hypr_get_room_claim", { p_nonce_hash: "abc" });
  assert.deepEqual(result, [{ ok: true }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/hypr_get_room_claim");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer service-role-test-key");
  assert.equal((calls[0].init.headers as Record<string, string>).apikey, "service-role-test-key");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { p_nonce_hash: "abc" });
});

test("durable claim verification recovers the signer before atomic finalization", async () => {
  const creator = privateKeyToAccount("0x0123456789012345678901234567890123456789012345678901234567890123");
  const challenge = createClaimChallenge({
    address: "0x0000000000000000000000000000000000000001",
    pool: "0x0000000000000000000000000000000000000002",
    name: "Persisted launch",
    symbol: "PERSIST",
    logo: "✦",
    description: "test",
    deployer: creator.address,
    priceUsd: 0,
    marketCapUsd: 0,
    change24h: 0,
    holders: 0,
    activeNow: 0,
    followers: 0,
    hype: 0,
    rank: 1,
    launchedAt: "",
    trades24h: 0,
    officialLinks: [],
    origin: "hypr",
    dataStatus: "partial",
  }, creator.address, 46630);
  const signature = await creator.signMessage({ message: challenge.message });
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  globalThis.fetch = async (url, init) => {
    const functionName = String(url).split("/").pop() || "";
    calls.push(functionName);
    if (functionName === "hypr_get_room_claim") {
      return new Response(JSON.stringify([{
        claim_id: challenge.challengeId,
        room_id: "00000000-0000-0000-0000-000000000001",
        chain_id: 46630,
        token_address: challenge.tokenAddress,
        claimant_address: creator.address,
        creator_address: creator.address,
        challenge_message: challenge.message,
        expires_at: new Date(challenge.expiresAt).toISOString(),
        status: "pending",
      }]), { status: 200 });
    }
    assert.equal(functionName, "hypr_finalize_room_claim");
    assert.equal(JSON.parse(String(init?.body)).p_claim_id, challenge.challengeId);
    return new Response(JSON.stringify([{
      room_id: "00000000-0000-0000-0000-000000000001",
      chain_id: 46630,
      token_address: challenge.tokenAddress,
      claimant_address: creator.address,
      creator_address: creator.address,
      verified_at: new Date().toISOString(),
    }]), { status: 200 });
  };
  try {
    const result = await verifyDurableClaim(challenge.challengeId, signature);
    assert.equal(result?.claimantAddress.toLowerCase(), creator.address.toLowerCase());
    assert.deepEqual(calls, ["hypr_get_room_claim", "hypr_finalize_room_claim"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
