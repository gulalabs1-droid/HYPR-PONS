// One explicitly approved, labeled public testnet demo. Never a mainnet coin launch.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, formatEther, getAddress, http, parseEther, parseEventLogs } from "viem";
import { unlockTestnetKeystore } from "./testnet-keystore.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const creator = getAddress("0xE698beD535d853f002b1f448549D38ba8343Afa0");
const factory = getAddress("0x6461786C6a62e2b7E40917312Cc35bb3Df127d14");
const adapter = getAddress("0x77bc7Ed4B59F9D8B68104F7F4dB673D2777B19eE");
const rpc = "https://rpc.testnet.chain.robinhood.com";
const chain = defineChain({ id: 46630, name: "Robinhood Chain Testnet", nativeCurrency: { name: "Test ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const transport = http(rpc, { retryCount: 0, timeout: 30000 });
const client = createPublicClient({ chain, transport });
const artifact = (name) => JSON.parse(readFileSync(join(root, "protocol/out", `${name}.sol`, `${name}.json`), "utf8"));
const factoryAbi = artifact("HYPRFactory").abi;
const curveAbi = artifact("HYPRCurve").abi;
const tokenAbi = artifact("HYPRToken").abi;
const cap = parseEther("0.003");
const buyValue = parseEther("0.001");
const maxFeePerGas = 20_000_001n;
const maxPriorityFeePerGas = 1n;
const evidenceDirectory = join(root, "protocol/broadcast/HYPR-demo/46630");
const evidenceFile = join(evidenceDirectory, "receipts.json");
const check = (condition, message) => { if (!condition) throw new Error(message); };
const read = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args });

try {
  check(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--broadcast-approved-testnet"), "Only check mode or explicit approved-testnet broadcast is supported.");
  const broadcast = process.argv[2] === "--broadcast-approved-testnet";
  check(!existsSync(evidenceFile), "A demo evidence file already exists. Inspect it; do not duplicate a launch or replay transactions.");
  check(await client.getChainId() === 46630, "Wrong chain. Nothing signed.");
  const expected = {
    protocolRecipient: creator, graduationAdapter: adapter, totalSupply: parseEther("1000000"),
    tradableSupply: parseEther("800000"), virtualQuoteReserve: parseEther("100"),
    graduationThreshold: parseEther("10"), totalFeeBps: 125n, creatorFeeBps: 30n, protocolFeeBps: 95n,
  };
  for (const [field, value] of Object.entries(expected)) {
    const actual = await read(factory, factoryAbi, field);
    check(typeof value === "bigint" ? actual === value : getAddress(actual) === value, `Factory configuration mismatch: ${field}`);
  }
  const balance = await client.getBalance({ address: creator });
  check(balance >= cap, "Not enough test ETH to cover the approved bounded demo.");
  const createArgs = ["HYPR Testnet Demo", "HYPRTEST"];
  const simulated = await client.simulateContract({ account: creator, address: factory, abi: factoryAbi, functionName: "createLaunch", args: createArgs });
  console.log(JSON.stringify({ mode: broadcast ? "approved-testnet-demo" : "check-only", chainId: 46630, creator, factory, name: createArgs[0], symbol: createArgs[1], buyTestEth: "0.001", grossValueAndGasCapTestEth: "0.003", balanceTestEth: formatEther(balance), predictedToken: simulated.result[0], predictedCurve: simulated.result[1] }, null, 2));
  if (broadcast) {
    const saved = spawnSync("/usr/bin/security", ["find-generic-password", "-a", "hypr-testnet-deployer", "-s", "HYPR Robinhood Testnet", "-w"], { encoding: "utf8", timeout: 30000 });
    check(saved.status === 0, "Could not unlock macOS Keychain.");
    const signer = unlockTestnetKeystore(JSON.parse(readFileSync(join(homedir(), "Library/Application Support/HYPR/testnet/deployer.json"), "utf8")), saved.stdout.trim());
    saved.stdout = "";
    check(signer.address === creator, "Unexpected signer.");
    const wallet = createWalletClient({ account: signer, chain, transport });
    const evidence = { chainId: 46630, label: "Controlled testnet demo, not a real-money coin", creator, factory, approvedCapTestEth: "0.003", buyTestEth: "0.001", transactions: [], snapshots: {} };
    mkdirSync(evidenceDirectory, { recursive: true });
    let reservedCost = 0n;
    const save = () => writeFileSync(evidenceFile, JSON.stringify(evidence, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2), { mode: 0o600 });
    async function send(step, address, abi, functionName, args = [], value = 0n) {
      check(await client.getChainId() === 46630, "Chain changed before signing.");
      const block = await client.getBlock();
      check(block.baseFeePerGas !== null && block.baseFeePerGas + maxPriorityFeePerGas <= maxFeePerGas, "Gas price exceeds the bounded demo fee cap.");
      const simulation = await client.simulateContract({ account: creator, address, abi, functionName, args, value });
      const estimate = await client.estimateContractGas({ account: creator, address, abi, functionName, args, value });
      const gas = (estimate * 130n + 99n) / 100n;
      const maximum = value + gas * maxFeePerGas;
      check(reservedCost + maximum <= cap, "Demo would exceed the approved gross value-plus-gas budget. Stopped before signing.");
      check(await client.getBalance({ address: creator }) >= maximum, "Test wallet has insufficient balance for the next step.");
      const nonce = await client.getTransactionCount({ address: creator, blockTag: "pending" });
      const record = { step, address, functionName, nonce, value, gasLimit: gas, maximumFeePerGas: maxFeePerGas, status: "prepared" };
      evidence.transactions.push(record);
      reservedCost += maximum;
      evidence.maximumReservedTestEth = formatEther(reservedCost);
      save();
      const hash = await wallet.writeContract({ ...simulation.request, account: signer, chain, nonce, gas, maxFeePerGas, maxPriorityFeePerGas });
      record.hash = hash;
      record.status = "submitted";
      save();
      console.log(`${step} submitted: ${hash}`);
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 120000 });
      Object.assign(record, { status: receipt.status, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice });
      record.events = parseEventLogs({ abi, logs: receipt.logs }).filter((event) => getAddress(event.address) === address).map((event) => ({ name: event.eventName, args: event.args }));
      save();
      check(receipt.status === "success", `${step} reverted. Stop and inspect the evidence; no automatic replay.`);
      console.log(`${step} confirmed in block ${receipt.blockNumber}`);
      return receipt;
    }
    const creation = await send("create", factory, factoryAbi, "createLaunch", createArgs);
    const events = parseEventLogs({ abi: factoryAbi, eventName: "LaunchCreated", logs: creation.logs }).filter((event) => getAddress(event.address) === factory);
    check(events.length === 1, "Missing or duplicate canonical launch event.");
    const launch = events[0].args;
    check(getAddress(launch.creator) === creator && launch.name === createArgs[0] && launch.symbol === createArgs[1], "Launch event disagrees with approved demo.");
    const token = getAddress(launch.token);
    const curve = getAddress(launch.curve);
    evidence.token = token;
    evidence.curve = curve;
    check(getAddress(await read(token, tokenAbi, "factory")) === factory && getAddress(await read(curve, curveAbi, "factory")) === factory && getAddress(await read(curve, curveAbi, "creator")) === creator, "Launch contract identity mismatch.");
    async function snapshot(label) {
      const [reserve, inventory, creatorFees, protocolFees, phase, held, tokenReserve, ethBalance] = await Promise.all([
        read(curve, curveAbi, "realQuoteReserve"), read(curve, curveAbi, "realTokenReserve"),
        read(curve, curveAbi, "creatorFees"), read(curve, curveAbi, "protocolFees"), read(curve, curveAbi, "phase"),
        read(token, tokenAbi, "balanceOf", [creator]), read(token, tokenAbi, "balanceOf", [curve]), client.getBalance({ address: curve }),
      ]);
      const graduationAllocation = phase === 2 ? 0n : expected.totalSupply - expected.tradableSupply;
      check(ethBalance >= reserve + creatorFees + protocolFees && tokenReserve === inventory + graduationAllocation, "Launch reserve solvency check failed.");
      const state = { reserve, inventory, creatorFees, protocolFees, phase, creatorTokenBalance: held, curveEthBalance: ethBalance };
      evidence.snapshots[label] = state;
      save();
      return state;
    }
    await snapshot("created");
    const [tokensOut] = await read(curve, curveAbi, "quoteBuy", [buyValue]);
    const deadline = async () => (await client.getBlock()).timestamp + 600n;
    await send("buy", curve, curveAbi, "buy", [tokensOut * 99n / 100n, await deadline()], buyValue);
    const bought = await snapshot("afterBuy");
    check(bought.creatorFees === buyValue * 30n / 10000n && bought.protocolFees === buyValue * 95n / 10000n && bought.reserve === buyValue * 9875n / 10000n && bought.creatorTokenBalance === tokensOut, "Buy accounting disagrees with approved fee split.");
    const soldTokens = bought.creatorTokenBalance / 2n;
    check(soldTokens > 0n, "Insufficient acquired tokens for the controlled sell.");
    await send("approve-exact-sell", token, tokenAbi, "approve", [curve, soldTokens]);
    const [netEthOut, grossQuoteOut, sellFee] = await read(curve, curveAbi, "quoteSell", [soldTokens]);
    await send("sell-half", curve, curveAbi, "sell", [soldTokens, netEthOut * 99n / 100n, await deadline()]);
    const sold = await snapshot("afterSell");
    const creatorSellFee = grossQuoteOut * 30n / 10000n;
    check(sold.creatorFees === bought.creatorFees + creatorSellFee && sold.protocolFees === bought.protocolFees + sellFee - creatorSellFee && sold.reserve === bought.reserve - grossQuoteOut && sold.creatorTokenBalance === bought.creatorTokenBalance - soldTokens, "Sell accounting mismatch.");
    await send("claim-creator-fees", curve, curveAbi, "claimCreatorFees");
    const creatorClaimed = await snapshot("afterCreatorClaim");
    check(creatorClaimed.creatorFees === 0n && creatorClaimed.protocolFees === sold.protocolFees && creatorClaimed.reserve === sold.reserve, "Creator fee claim changed the wrong ledger or reserve.");
    await send("claim-protocol-fees", curve, curveAbi, "claimProtocolFees");
    const claimed = await snapshot("afterProtocolClaim");
    check(claimed.creatorFees === 0n && claimed.protocolFees === 0n && claimed.reserve === sold.reserve && claimed.phase === 0, "Protocol fee claim or lifecycle check failed.");
    evidence.executionGasCostWei = evidence.transactions.reduce((sum, tx) => sum + tx.gasUsed * tx.effectiveGasPrice, 0n);
    evidence.walletBalanceAfterWei = await client.getBalance({ address: creator });
    evidence.completed = true;
    save();
    console.log(JSON.stringify({ result: "controlled public testnet demo passed", token, curve, roomUrl: `https://hypr-pons.vercel.app/room/${token}`, transactions: evidence.transactions.length, maximumReservedTestEth: evidence.maximumReservedTestEth, executionGasCostTestEth: formatEther(evidence.executionGasCostWei), creatorFeesClaimedTestEth: formatEther(sold.creatorFees), protocolFeesClaimedTestEth: formatEther(sold.protocolFees), graduation: "not attempted: unchanged 10-ETH reserve threshold exceeds faucet funding", cameraBroadcast: "not tested by this script" }, null, 2));
  }
} catch (error) {
  console.error(error.shortMessage ?? error.message ?? "Controlled testnet demo stopped.");
  process.exitCode = 1;
}
