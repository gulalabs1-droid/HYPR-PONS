import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { encodeAbiParameters, encodeEventTopics, parseAbiItem, type Log } from "viem";
import { HYPR_FACTORY_ABI } from "../src/lib/integrations/hypr/abi";
import { launchConfirmations, launchFromReceipt } from "../src/lib/launch-receipt";
import { checkLaunchProgress, launchStorageKey, parseSavedLaunch, type SubmittedLaunch } from "../src/lib/launch-recovery";
import { LaunchResultCard } from "../src/components/launchpad-panel";
import { GET } from "../src/app/api/launch-status/route";

const factory = "0x6461786C6a62e2b7E40917312Cc35bb3Df127d14";
const creator = "0x342209E9C6538b093AdBeE755808ad0546077A87";
const token = "0x93376cb24809d56175D55eAd36Fe60D125eDE411";
const curve = "0x3E76118fD9d989b361a5CeD3326dcF36353fa475";
const hash = `0x${"a".repeat(64)}` as const;
const submission: SubmittedLaunch = { hash, creator, chainId: 46630, factory, name: "Test room", symbol: "TEST" };
function receipt() {
  const event = parseAbiItem(HYPR_FACTORY_ABI[0]);
  const topics = encodeEventTopics({ abi: [event], eventName: "LaunchCreated", args: { token, curve, creator } });
  const data = encodeAbiParameters(event.inputs.filter((input) => !input.indexed), [1000000n, 800000n, 100n, 10n, 125n, 30n, 95n, "Test room", "TEST"]);
  const log = { address: factory, data, topics, logIndex: 3, transactionHash: hash, blockNumber: 100n } as Log;
  return { status: "success", transactionHash: hash, blockNumber: 100n, logs: [log] };
}
test("confirmed receipt recovers the exact canonical factory token and creator", () => {
  const launch = launchFromReceipt(receipt(), factory);
  assert.equal(launch.token.toLowerCase(), token.toLowerCase());
  assert.equal(launch.creator.toLowerCase(), creator.toLowerCase());
  assert.equal(launch.eventId, `${hash}:3`);
});
test("failed, foreign, malformed and multiple-launch receipts cannot create a success link", () => {
  const original = receipt();
  assert.throws(() => launchFromReceipt({ ...original, status: "reverted" }, factory));
  assert.throws(() => launchFromReceipt(original, token));
  assert.throws(() => launchFromReceipt({ ...original, logs: [{ ...original.logs[0], data: "0x" }] }, factory));
  assert.throws(() => launchFromReceipt({ ...original, logs: [...original.logs, ...original.logs] }, factory));
});
test("room readiness preserves the indexer's full twelve-block delay", () => {
  assert.equal(launchConfirmations(111n, 100n), 11);
  assert.equal(launchConfirmations(112n, 100n), 12);
  assert.equal(launchConfirmations(99n, 100n), 0);
});
test("saved launch recovery is isolated to factory, chain and wallet", () => {
  assert.deepEqual(parseSavedLaunch(JSON.stringify(submission), factory, creator), submission);
  assert.equal(parseSavedLaunch(JSON.stringify(submission), token, creator), null);
  assert.equal(parseSavedLaunch(JSON.stringify(submission), factory, token), null);
  assert.equal(parseSavedLaunch(JSON.stringify({ ...submission, chainId: 4663 }), factory, creator), null);
  assert.equal(parseSavedLaunch("not json", factory, creator), null);
  assert.equal(launchStorageKey(factory, creator), launchStorageKey(factory.toLowerCase(), creator.toLowerCase()));
});
test("ready lookup is no-store and only accepts the canonical room path and creator", async () => {
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(String(url), `/api/launch-status?tx=${hash}`);
    assert.equal(options?.cache, "no-store");
    return Response.json({ status: "ready", token, creator, roomUrl: `/room/${token}` });
  };
  assert.equal((await checkLaunchProgress(submission, fetcher)).status, "ready");
  await assert.rejects(checkLaunchProgress(submission, async () => Response.json({ status: "ready", token, creator: token, roomUrl: `/room/${token}` })), /different wallet/);
  await assert.rejects(checkLaunchProgress(submission, async () => Response.json({ status: "ready", token, creator, roomUrl: "https://evil.example" })), /room link/);
});
test("RPC and incomplete status failures preserve recovery without telling users to relaunch", async () => {
  await assert.rejects(checkLaunchProgress(submission, async () => new Response("", { status: 503 })), /don't create another coin|don’t create another coin/);
  await assert.rejects(checkLaunchProgress(submission, async () => Response.json({ status: "unknown" })), /incomplete/);
});
test("status endpoint rejects malformed hashes before RPC", async () => {
  const response = await GET(new Request("https://hypr.example/api/launch-status?tx=bad"));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
test("success card offers the real room and never implies an active camera", async () => {
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => { renderer = create(createElement(LaunchResultCard, { submission, progress: { status: "ready", token, creator, name: "Test room", roomUrl: `/room/${token}` }, notice: "", onCheck() {}, onNew() {} })); });
  assert.ok(JSON.stringify(renderer!.toJSON()).includes("Your coin has a home."));
  assert.ok(JSON.stringify(renderer!.toJSON()).includes("Opening the room does not turn on your camera."));
  assert.equal(renderer!.root.findAllByType("a").find((link) => link.props.href === `/room/${token}`)?.props.children, "Open your room →");
  await act(async () => renderer!.unmount());
});
test("pending card does not offer duplicate creation and displays live confirmation progress", async () => {
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => { renderer = create(createElement(LaunchResultCard, { submission, progress: { status: "confirming", confirmations: 7, requiredConfirmations: 12 }, notice: "", onCheck() {}, onNew() {} })); });
  const rendered = JSON.stringify(renderer!.toJSON());
  assert.ok(rendered.includes("7 / 12 confirmations"));
  assert.equal(rendered.includes("Create another coin"), false);
  assert.equal(rendered.includes("Open your room →"), false);
  await act(async () => renderer!.unmount());
});
