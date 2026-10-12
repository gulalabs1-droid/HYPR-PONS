import assert from "node:assert/strict";
import { createCipheriv, scryptSync } from "node:crypto";
import test from "node:test";
import { keccak256, verifyMessage } from "viem";
import { unlockTestnetKeystore } from "../scripts/testnet-keystore.mjs";

// Public, deliberately insecure test key. Never fund or use this fixture wallet.
const testKey = Buffer.from("1".padStart(64, "0"), "hex");
const password = "public-test-fixture";
const salt = Buffer.alloc(32, 2);
const iv = Buffer.alloc(16, 3);
const derived = scryptSync(password, salt, 32, { N: 1024, r: 8, p: 1 });
const cipher = createCipheriv("aes-128-ctr", derived.subarray(0, 16), iv);
const ciphertext = Buffer.concat([cipher.update(testKey), cipher.final()]);
const fixture = {
  version: 3,
  crypto: {
    cipher: "aes-128-ctr", cipherparams: { iv: iv.toString("hex") },
    ciphertext: ciphertext.toString("hex"), kdf: "scrypt",
    kdfparams: { n: 1024, r: 8, p: 1, dklen: 32, salt: salt.toString("hex") },
    mac: keccak256(Buffer.concat([derived.subarray(16), ciphertext])).slice(2),
  },
};
derived.fill(0);

test("V3 unlock recovers the known address and signs a local challenge", async () => {
  const account = unlockTestnetKeystore(fixture, password);
  assert.equal(account.address, "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf");
  const message = "local test only";
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
});

test("V3 rejects wrong passwords and changed encrypted key material", () => {
  assert.throws(() => unlockTestnetKeystore(fixture, "incorrect"), /integrity/);
  const changed = structuredClone(fixture);
  changed.crypto.ciphertext = "00".repeat(32);
  assert.throws(() => unlockTestnetKeystore(changed, password), /integrity/);
});

test("V3 rejects invalid lengths and oversized or non-power-of-two scrypt work", () => {
  const changed = structuredClone(fixture);
  changed.crypto.cipherparams.iv = "00";
  assert.throws(() => unlockTestnetKeystore(changed, password), /field/);
  for (const n of [0, 1025, 1048576]) {
    const expensive = structuredClone(fixture);
    expensive.crypto.kdfparams.n = n;
    assert.throws(() => unlockTestnetKeystore(expensive, password), /parameters/);
  }
});

test("V3 rejects unsupported versions and derivation formats", () => {
  assert.throws(() => unlockTestnetKeystore({ ...fixture, version: 1 }, password), /format/);
  assert.throws(() => unlockTestnetKeystore({ version: 3, crypto: {} }, password), /format/);
});
