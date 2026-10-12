// Local-only, macOS testnet preparation. Never broadcasts or exports a private key.
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAddress, verifyMessage } from "viem";
import { unlockTestnetKeystore } from "./testnet-keystore.mjs";

const service = "HYPR Robinhood Testnet";
const account = "hypr-testnet-deployer";
const directory = join(homedir(), "Library", "Application Support", "HYPR", "testnet");
const keystore = join(directory, "deployer.json");
const rpc = "https://rpc.testnet.chain.robinhood.com";

function run(program, args, options = {}) {
  return spawnSync(program, args, { encoding: "utf8", timeout: 30_000, maxBuffer: 1_000_000, ...options });
}

function fail(message) {
  // Never include child-process output: security's interactive prompt can echo input.
  throw new Error(message);
}

try {
  if (process.platform !== "darwin") fail("This helper requires macOS Keychain.");
  if (existsSync(directory) && (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())) {
    fail("The wallet directory must be a real directory, not a symlink.");
  }
  if (existsSync(keystore) && (!lstatSync(keystore).isFile() || lstatSync(keystore).isSymbolicLink())) {
    fail("The keystore must be a regular file, not a symlink.");
  }

  let lookup = run("/usr/bin/security", ["find-generic-password", "-a", account, "-s", service, "-w"]);
  let password;
  if (lookup.status === 0) {
    password = lookup.stdout.trim();
    if (!/^[a-f0-9]{64}$/.test(password)) fail("Existing Keychain item has an unexpected format; it was preserved.");
  } else {
    if (lookup.status !== 44) fail("Keychain access failed or needs your approval. No wallet was generated.");
    if (existsSync(keystore)) fail("An encrypted wallet exists but its Keychain password is missing. Nothing was overwritten.");
    password = randomBytes(32).toString("hex");
    // Pipe the security command rather than put a password in OS process arguments.
    const saved = run("/usr/bin/security", ["-i"], {
      input: `add-generic-password -a ${account} -s "${service}" -l "HYPR testnet deployer keystore password" -w ${password}\n`,
    });
    if (saved.status !== 0) fail("Could not save the password in Keychain. No wallet was generated.");
    lookup = run("/usr/bin/security", ["find-generic-password", "-a", account, "-s", service, "-w"]);
    if (lookup.status !== 0 || lookup.stdout.trim() !== password) fail("Keychain read-back failed. No wallet was generated.");
  }

  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  if (!existsSync(keystore)) {
    const created = run("cast", ["wallet", "new", directory, "deployer.json"], {
      env: { ...process.env, CAST_PASSWORD: password },
    });
    if (created.status !== 0 || !existsSync(keystore)) fail("Encrypted wallet generation failed. The recoverable password remains in Keychain.");
  }
  chmodSync(keystore, 0o600);
  const stored = JSON.parse(readFileSync(keystore, "utf8"));
  if (!stored.crypto && !stored.Crypto) fail("Unexpected keystore format; no signing attempted.");
  const signer = unlockTestnetKeystore(stored, password);
  const address = signer.address;
  const message = "HYPR local testnet wallet readiness check. No transaction or spending approval.";
  const signature = await signer.signMessage({ message });
  if (!await verifyMessage({ address, message, signature })) fail("Local signer verification failed.");
  // Foundry's keystore format may omit the optional public address field.
  if (stored.address && getAddress(`0x${stored.address.replace(/^0x/, "")}`) !== address) {
    fail("Keystore address disagrees with the recovered signer. Nothing was broadcast.");
  }
  password = undefined;
  lookup = undefined;

  const chain = run("cast", ["chain-id", "--rpc-url", rpc]);
  if (chain.status !== 0 || chain.stdout.trim() !== "46630") fail("Testnet RPC chain guard failed. Nothing was broadcast.");
  const balance = run("cast", ["balance", address, "--ether", "--rpc-url", rpc]);
  if (balance.status !== 0) fail("Wallet is prepared, but the public balance lookup failed.");
  console.log(JSON.stringify({
    chainId: 46630,
    address,
    protocolRecipient: address,
    encryptedKeystore: keystore,
    passwordStorage: `macOS Keychain: ${service} / ${account}`,
    signerVerified: true,
    balanceTestEth: balance.stdout.trim(),
    broadcast: false,
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
