import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, parseEther, type Address } from "viem";
import { CREATE_LAUNCH_ABI, LaunchPreflightError, launchErrorMessage, prepareNativeLaunch, type LaunchReadClient } from "../src/lib/launch-preflight";

const account: Address = "0x342209E9C6538b093AdBeE755808ad0546077A87";
const factory: Address = "0x6461786C6a62e2b7E40917312Cc35bb3Df127d14";
function reader(balance = parseEther("0.001"), chainId = 46630) {
  const calls: string[] = [];
  const client: LaunchReadClient = {
    async getChainId() { calls.push("chain"); return chainId; },
    async getBalance(args) { assert.equal(args.address, account); calls.push("balance"); return balance; },
    async getGasPrice() { calls.push("price"); return 10_000_000n; },
    async estimateGas(args) { assert.equal(args.account, account); assert.equal(args.to, factory); assert.equal(args.value, 0n); calls.push("estimate"); return 1_737_912n; },
  };
  return { client, calls };
}
test("zero-balance Phantom account stops before any transaction preparation", async () => {
  const { client, calls } = reader(0n);
  await assert.rejects(prepareNativeLaunch(client, account, factory, "mm", "mm"), (error: unknown) => error instanceof LaunchPreflightError && error.needsFunding && /0 Robinhood test ETH/.test(error.message));
  assert.deepEqual(calls, ["chain", "balance"]);
});
test("funded launch has normalized calldata and a buffered gas budget", async () => {
  const { client } = reader();
  const prepared = await prepareNativeLaunch(client, account, factory, " mm ", "$mm");
  assert.deepEqual(decodeFunctionData({ abi: CREATE_LAUNCH_ABI, data: prepared.data }).args, ["mm", "MM"]);
  assert.equal(prepared.gas, 2_085_495n);
  assert.equal(prepared.feeBudget, 41_709_900_000_000n);
});
test("small nonzero balance is not mistaken for enough gas", async () => {
  const { client } = reader(1n);
  await assert.rejects(prepareNativeLaunch(client, account, factory, "mm", "mm"), (error: unknown) => error instanceof LaunchPreflightError && error.needsFunding);
});
test("wrong public RPC chain fails closed", async () => {
  const { client, calls } = reader(parseEther("1"), 4663);
  await assert.rejects(prepareNativeLaunch(client, account, factory, "mm", "mm"), /not Robinhood Chain testnet/);
  assert.deepEqual(calls, ["chain"]);
});
test("empty normalized symbol and overlength UTF-8 metadata stop before RPC", async () => {
  const { client, calls } = reader();
  await assert.rejects(prepareNativeLaunch(client, account, factory, "mm", "$$"), /UTF-8 bytes/);
  await assert.rejects(prepareNativeLaunch(client, account, factory, "🚀".repeat(9), "MM"), /UTF-8 bytes/);
  assert.deepEqual(calls, []);
});
test("simulation rejection and invalid fee estimates fail closed", async () => {
  const { client } = reader();
  client.estimateGas = async () => { throw new Error("execution reverted"); };
  await assert.rejects(prepareNativeLaunch(client, account, factory, "mm", "mm"), /execution reverted/);
  const invalid = reader().client;
  invalid.getGasPrice = async () => 0n;
  await assert.rejects(prepareNativeLaunch(invalid, account, factory, "mm", "mm"), /valid testnet gas estimate/);
});
test("wallet errors handle ordinary objects and never imply a confirmed launch", () => {
  assert.match(launchErrorMessage({ code: 4001, message: "Unexpected error" }), /cancelled/);
  assert.match(launchErrorMessage({ message: "insufficient funds" }), /official faucet/);
  assert.match(launchErrorMessage(new Error("Unexpected error")), /Activity.*hash before retrying/);
  assert.match(launchErrorMessage(undefined), /No new launch was confirmed/);
});
