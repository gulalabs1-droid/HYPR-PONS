// Publish only the already-deployed testnet contracts' exact compiler input.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { encodeAbiParameters, keccak256 } from "viem";

const protocol = fileURLToPath(new URL("../protocol/", import.meta.url));
const explorer = "https://explorer.testnet.chain.robinhood.com";
const plan = JSON.parse(readFileSync(join(protocol, "broadcast/DeployHYPR.s.sol/46630/dry-run/run-latest.json"), "utf8"));
if (Number(plan.chain) !== 46630 || plan.transactions.length !== 2) throw new Error("Unexpected testnet plan");
await Promise.all(plan.transactions.map(async (entry) => {
  const name = entry.contractName;
  if (!["HYPRFactory", "HYPRV4GraduationAdapter"].includes(name)) throw new Error("Unexpected contract");
  const artifact = JSON.parse(readFileSync(join(protocol, "out", `${name}.sol`, `${name}.json`), "utf8"));
  const metadata = typeof artifact.metadata === "string" ? JSON.parse(artifact.metadata) : artifact.metadata;
  const generated = spawnSync("forge", ["verify-contract", entry.contractAddress, `src/${name}.sol:${name}`, "--chain", "46630", "--show-standard-json-input"], { cwd: protocol, encoding: "utf8", maxBuffer: 10_000_000 });
  if (generated.status !== 0) throw new Error("Could not generate compiler input");
  const input = JSON.parse(generated.stdout.slice(generated.stdout.indexOf("{")));
  for (const [path, source] of Object.entries(metadata.sources)) {
    if (!input.sources[path]?.content || keccak256(Buffer.from(input.sources[path].content)) !== source.keccak256) throw new Error("Source hash does not match deployment artifact");
  }
  // Foundry's verifier normalizes/reorders remappings; that changes the metadata
  // hash even when the executable code matches. Preserve deployment settings.
  input.settings = { ...metadata.settings, outputSelection: input.settings.outputSelection };
  delete input.settings.compilationTarget;
  const inputs = artifact.abi.find((item) => item.type === "constructor").inputs;
  const args = entry.arguments.map((value, index) => /^(u?int)/.test(inputs[index].type) ? BigInt(value) : value);
  const body = new URLSearchParams({
    module: "contract", action: "verifysourcecode", codeformat: "solidity-standard-json-input",
    contractaddress: entry.contractAddress, contractname: `src/${name}.sol:${name}`,
    compilerversion: `v${metadata.compiler.version}`, sourceCode: JSON.stringify(input),
    constructorArguments: encodeAbiParameters(inputs, args).slice(2),
  });
  const submitted = await (await fetch(`${explorer}/api/`, { method: "POST", body, signal: AbortSignal.timeout(30000) })).json();
  console.log(`${name} exact-input submission: ${submitted.message} / ${submitted.result}`);
  if (submitted.status !== "1") throw new Error("Exact-source verification submission rejected");
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const status = await (await fetch(`${explorer}/api/?${new URLSearchParams({ module: "contract", action: "checkverifystatus", guid: submitted.result })}`, { signal: AbortSignal.timeout(30000) })).json();
    if (status.result === "Pending in queue") continue;
    console.log(`${name} verifier: ${status.result}`);
    break;
  }
  const result = await (await fetch(`${explorer}/api/v2/smart-contracts/${entry.contractAddress}`, { signal: AbortSignal.timeout(30000) })).json();
  console.log(JSON.stringify({ contract: name, address: entry.contractAddress, fullyVerified: result.is_fully_verified, partiallyVerified: result.is_partially_verified }));
  if (!result.is_fully_verified) process.exitCode = 1;
}));
