import assert from "node:assert/strict";
import { test } from "node:test";
import type { Log } from "viem";
import { confirmedBlockRange, stableEventId, uniqueLogsByEventId } from "../src/lib/integrations/indexer-utils";
import { getPonsRpcUrl } from "../src/lib/integrations/pons/constants";
import { getLaunchData } from "../src/lib/integrations/pons/data";
import { boundedMetadataValue, countStableLogs, normalizeLaunchLog as normalizePonsLaunchLog, resolvePonsVersion, v3QuotePriceFromSqrtPrice } from "../src/lib/integrations/pons/indexer";
import { normalizeLaunchLog as normalizeNativeLaunchLog } from "../src/lib/integrations/hypr/indexer";

const txHash = `0x${"11".repeat(32)}`;
const token = "0x0000000000000000000000000000000000000001" as `0x${string}`;
const deployer = "0x0000000000000000000000000000000000000002" as `0x${string}`;
const pool = "0x0000000000000000000000000000000000000003" as `0x${string}`;

test("stable event identity is transaction plus log index", () => {
  assert.equal(stableEventId({ transactionHash: txHash, logIndex: 4n }), `${txHash}:4`);
  assert.equal(stableEventId({ transactionHash: null, logIndex: 4n }), null);
  assert.equal(stableEventId({ transactionHash: txHash, logIndex: null }), null);
});

test("duplicate delivery keeps one log and invalid identities remain available for normalization", () => {
  const first = { transactionHash: txHash, logIndex: 4n, payload: "first" };
  const duplicate = { transactionHash: txHash, logIndex: 4n, payload: "duplicate" };
  const invalid = { transactionHash: null, logIndex: null, payload: "invalid" };
  assert.deepEqual(uniqueLogsByEventId([first, duplicate, invalid]), [duplicate, invalid]);
});

test("confirmation range excludes the newest blocks and reports an empty pre-start range", () => {
  assert.deepEqual(confirmedBlockRange(100n, 12n, 50n, 20n), { fromBlock: 38n, safeHead: 88n });
  assert.deepEqual(confirmedBlockRange(5n, 12n, 50n, 20n), { fromBlock: 20n, safeHead: 5n });
});

test("Pons launch normalization rejects incomplete logs and preserves the stable event id", () => {
  const base = {
    transactionHash: txHash,
    logIndex: 4n,
    blockNumber: 123n,
    args: { token, deployer, pool },
  } as unknown as Log;
  assert.deepEqual(normalizePonsLaunchLog(base), { address: token, deployer, pool, transactionHash: txHash, eventId: `${txHash}:4`, blockNumber: 123n });
  assert.equal(normalizePonsLaunchLog({ ...base, args: { token, deployer } } as unknown as Log), null);
  assert.equal(normalizePonsLaunchLog({ ...base, transactionHash: null } as unknown as Log), null);
});

test("Pons version selection fails closed instead of silently using the v1 adapter", () => {
  assert.equal(resolvePonsVersion(undefined), "v1");
  assert.equal(resolvePonsVersion(" V1 "), "v1");
  assert.throws(() => resolvePonsVersion("v2"), /Unsupported Pons version/);
});

test("Pons prefers an explicit RPC and supports the documented archive fallback", () => {
  const originalRpc = process.env.PONS_RPC_URL;
  const originalArchive = process.env.PONS_ARCHIVE_RPC_URL;
  try {
    process.env.PONS_RPC_URL = " https://rpc.example/live ";
    process.env.PONS_ARCHIVE_RPC_URL = "https://rpc.example/archive";
    assert.equal(getPonsRpcUrl(), "https://rpc.example/live");
    delete process.env.PONS_RPC_URL;
    assert.equal(getPonsRpcUrl(), "https://rpc.example/archive");
  } finally {
    if (originalRpc === undefined) delete process.env.PONS_RPC_URL; else process.env.PONS_RPC_URL = originalRpc;
    if (originalArchive === undefined) delete process.env.PONS_ARCHIVE_RPC_URL; else process.env.PONS_ARCHIVE_RPC_URL = originalArchive;
  }
});

test("Pons RPC failure returns an error and never substitutes sample launches", async () => {
  const originalMode = process.env.PONS_INDEXER_MODE;
  const originalRpc = process.env.PONS_RPC_URL;
  const originalVersion = process.env.PONS_VERSION;
  process.env.PONS_INDEXER_MODE = "rpc";
  process.env.PONS_RPC_URL = "http://127.0.0.1:1";
  delete process.env.PONS_VERSION;
  try {
    const result = await getLaunchData();
    assert.equal(result.source, "rpc-error");
    assert.equal(result.launches.length, 0);
  } finally {
    if (originalMode === undefined) delete process.env.PONS_INDEXER_MODE; else process.env.PONS_INDEXER_MODE = originalMode;
    if (originalRpc === undefined) delete process.env.PONS_RPC_URL; else process.env.PONS_RPC_URL = originalRpc;
    if (originalVersion === undefined) delete process.env.PONS_VERSION; else process.env.PONS_VERSION = originalVersion;
  }
});

test("unsupported Pons version fails closed with no launch state", async () => {
  const originalMode = process.env.PONS_INDEXER_MODE;
  const originalVersion = process.env.PONS_VERSION;
  process.env.PONS_INDEXER_MODE = "rpc";
  process.env.PONS_VERSION = "v2";
  try {
    const result = await getLaunchData();
    assert.equal(result.source, "rpc-error");
    assert.deepEqual(result.launches, []);
  } finally {
    if (originalMode === undefined) delete process.env.PONS_INDEXER_MODE; else process.env.PONS_INDEXER_MODE = originalMode;
    if (originalVersion === undefined) delete process.env.PONS_VERSION; else process.env.PONS_VERSION = originalVersion;
  }
});

test("Pons metadata is bounded before it can enter the room model", () => {
  assert.equal(boundedMetadataValue("  HYPR  ", 8), "HYPR");
  assert.equal(boundedMetadataValue("", 8), undefined);
  assert.equal(boundedMetadataValue("123456789", 8), undefined);
  assert.equal(boundedMetadataValue(42, 8), undefined);
});

test("Pons pool swap counts deduplicate stable log identities", () => {
  const swap = { transactionHash: txHash, logIndex: 9n } as unknown as Log;
  const duplicate = { transactionHash: txHash, logIndex: 9n } as unknown as Log;
  const incomplete = { transactionHash: null, logIndex: null } as unknown as Log;
  assert.equal(countStableLogs([swap, duplicate, incomplete]), 1);
});

test("Pons V3 pool quotes respect token ordering and decimals", () => {
  const oneToOneSqrtPrice = 2n ** 96n;
  assert.equal(v3QuotePriceFromSqrtPrice(oneToOneSqrtPrice, true, 18), 1);
  assert.equal(v3QuotePriceFromSqrtPrice(oneToOneSqrtPrice, false, 18), 1);
  assert.equal(v3QuotePriceFromSqrtPrice(oneToOneSqrtPrice, true, 6), 1e-12);
  assert.equal(v3QuotePriceFromSqrtPrice(0n, true, 18), undefined);
});

test("native launch normalization requires the complete LaunchCreated payload", () => {
  const base = {
    transactionHash: txHash,
    logIndex: 7n,
    blockNumber: 321n,
    args: {
      token,
      curve: pool,
      creator: deployer,
      totalSupply: 1000n,
      tradableSupply: 900n,
      virtualQuoteReserve: 100n,
      graduationThreshold: 500n,
      totalFeeBps: 125n,
      creatorFeeBps: 75n,
      protocolFeeBps: 50n,
      name: "HYPR",
      symbol: "HYP",
    },
  } as unknown as Log;
  const normalized = normalizeNativeLaunchLog(base);
  assert.equal(normalized?.eventId, `${txHash}:7`);
  assert.equal(normalized?.transactionHash, txHash);
  assert.equal(normalized?.blockNumber, 321n);
  assert.equal(normalized?.protocolFeeBps, 50n);
  assert.equal(normalizeNativeLaunchLog({ ...base, args: { ...((base as Log & { args: object }).args), symbol: undefined } } as unknown as Log), null);
});
