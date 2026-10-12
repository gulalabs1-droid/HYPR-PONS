// Explicitly approved testnet deployment only. No mainnet override or raw key output.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, encodeDeployData, formatEther, getAddress, getContractAddress, http, parseEther } from "viem";
import { unlockTestnetKeystore } from "./testnet-keystore.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const deployer = getAddress("0xE698beD535d853f002b1f448549D38ba8343Afa0");
const rpc = "https://rpc.testnet.chain.robinhood.com";
const chain = defineChain({ id: 46630, name: "Robinhood Chain Testnet", nativeCurrency: { name: "Test ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const transport = http(rpc, { retryCount: 0, timeout: 30_000 });
const client = createPublicClient({ chain, transport });
const maxFeePerGas = 20_000_001n;
const maxPriorityFeePerGas = 1n;
const costCap = parseEther("0.001");

function check(condition, message) { if (!condition) throw new Error(message); }
function artifact(name) { return JSON.parse(readFileSync(join(root, "protocol", "out", `${name}.sol`, `${name}.json`), "utf8")); }

try {
  check(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--broadcast-approved-testnet"), "Only check mode or explicit approved-testnet broadcast is supported.");
  const broadcast = process.argv[2] === "--broadcast-approved-testnet";
  check(await client.getChainId() === 46630, "Wrong chain. Nothing signed.");
  const plan = JSON.parse(readFileSync(join(root, "protocol/broadcast/DeployHYPR.s.sol/46630/dry-run/run-latest.json"), "utf8"));
  check(Number(plan.chain) === 46630 && plan.transactions.length === 2, "Unexpected deployment plan.");
  const nonce = await client.getTransactionCount({ address: deployer, blockTag: "pending" });
  check(nonce === 0, "This fresh-wallet plan expects nonce zero. Inspect any partial deployment; do not blindly redeploy.");
  const names = ["HYPRV4GraduationAdapter", "HYPRFactory"];
  const addresses = [0, 1].map((n) => getContractAddress({ from: deployer, nonce: BigInt(n) }));
  const argumentsByContract = [
    [getAddress("0x58daec3116aae6D93017bAAea7749052E8a04fA7"), getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"), 3000, 60, -887220, 887220],
    [deployer, addresses[0], parseEther("1000000"), parseEther("800000"), parseEther("100"), parseEther("10"), 125n, 30n, 95n],
  ];
  const contracts = names.map(artifact);
  let maxCost = 0n;
  for (let index = 0; index < 2; index++) {
    const entry = plan.transactions[index];
    const tx = entry.transaction;
    check(entry.transactionType === "CREATE" && entry.contractName === names[index], "Unexpected contract in plan.");
    check(getAddress(tx.from) === deployer && tx.to === null && BigInt(tx.value) === 0n && Number(BigInt(tx.chainId)) === 46630 && Number(BigInt(tx.nonce)) === index, "Invalid transaction envelope.");
    check(getAddress(entry.contractAddress) === addresses[index], "Predicted address mismatch.");
    const data = encodeDeployData({ abi: contracts[index].abi, bytecode: contracts[index].bytecode.object, args: argumentsByContract[index] });
    check(data.toLowerCase() === tx.input.toLowerCase(), "Plan bytecode or constructor arguments disagree with reviewed artifacts.");
    const gas = BigInt(tx.gas);
    check(gas > 0n && gas < 10_000_000n, "Unexpected deployment gas limit.");
    maxCost += gas * maxFeePerGas;
  }
  check(maxCost <= costCap, "Deployment exceeds approved test-ETH cap.");
  const balance = await client.getBalance({ address: deployer });
  check(balance >= maxCost, "Not enough test ETH for bounded deployment.");
  const block = await client.getBlock();
  check(block.baseFeePerGas !== null && block.baseFeePerGas + maxPriorityFeePerGas <= maxFeePerGas, "Current gas fees exceed the prepared fee cap.");
  console.log(JSON.stringify({ mode: broadcast ? "approved-testnet-broadcast" : "check-only", chainId: 46630, deployer, protocolRecipient: deployer, balanceTestEth: formatEther(balance), maximumExecutionCostTestEth: formatEther(maxCost), expectedAddresses: { adapter: addresses[0], factory: addresses[1] } }, null, 2));
  if (broadcast) {
    const saved = spawnSync("/usr/bin/security", ["find-generic-password", "-a", "hypr-testnet-deployer", "-s", "HYPR Robinhood Testnet", "-w"], { encoding: "utf8", timeout: 30_000 });
    check(saved.status === 0, "Could not unlock macOS Keychain.");
    const signer = unlockTestnetKeystore(JSON.parse(readFileSync(join(homedir(), "Library/Application Support/HYPR/testnet/deployer.json"), "utf8")), saved.stdout.trim());
    saved.stdout = "";
    check(signer.address === deployer, "Unexpected signer.");
    const wallet = createWalletClient({ account: signer, chain, transport });
    const evidence = { chainId: 46630, deployer, protocolRecipient: deployer, transactions: [] };
    const evidenceDirectory = join(root, "protocol/broadcast/HYPR-approved/46630");
    mkdirSync(evidenceDirectory, { recursive: true });
    const save = () => writeFileSync(join(evidenceDirectory, "receipts.json"), JSON.stringify(evidence, null, 2), { mode: 0o600 });
    for (let index = 0; index < 2; index++) {
      check(await client.getChainId() === 46630, "Chain changed before signing.");
      check(await client.getTransactionCount({ address: deployer, blockTag: "pending" }) === index, "Nonce changed before signing.");
      const tx = plan.transactions[index].transaction;
      const hash = await wallet.sendTransaction({ data: tx.input, gas: BigInt(tx.gas), nonce: index, value: 0n, maxFeePerGas, maxPriorityFeePerGas });
      const record = { contract: names[index], address: addresses[index], hash, status: "submitted" };
      evidence.transactions.push(record);
      save();
      console.log(`${names[index]} submitted: ${hash}`);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 120_000 });
      record.status = receipt.status;
      record.blockNumber = receipt.blockNumber.toString();
      record.gasUsed = receipt.gasUsed.toString();
      record.effectiveGasPrice = receipt.effectiveGasPrice.toString();
      save();
      check(receipt.status === "success" && getAddress(receipt.contractAddress) === addresses[index], "Deployment failed or returned a different address. Stop and inspect evidence.");
      check((await client.getBytecode({ address: addresses[index] }))?.length > 2, "Deployed bytecode missing.");
      console.log(`${names[index]} confirmed: ${addresses[index]}`);
    }
    console.log("Both testnet deployments confirmed. Run the independent Foundry deployment checker before configuring the frontend.");
  }
} catch (error) {
  // Avoid serializing signing errors, accounts, or RPC objects containing secrets.
  console.error(error.shortMessage ?? error.message ?? "Testnet deployment stopped.");
  process.exitCode = 1;
}
