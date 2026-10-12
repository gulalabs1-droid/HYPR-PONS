import { createDecipheriv, scryptSync, timingSafeEqual } from "node:crypto";
import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Ethereum V3 / Foundry scrypt keystore. Password and key never leave this process.
export function unlockTestnetKeystore(keystore, password) {
  const crypto = keystore.crypto ?? keystore.Crypto;
  const params = crypto?.kdfparams;
  if (keystore.version !== 3 || crypto?.cipher !== "aes-128-ctr" || crypto?.kdf !== "scrypt") {
    throw new Error("Unsupported keystore format.");
  }
  if (params?.dklen !== 32 || params.r !== 8 || params.p !== 1 ||
      !Number.isInteger(params.n) || params.n < 1024 || params.n > 262144 ||
      (params.n & (params.n - 1)) !== 0) {
    throw new Error("Unsupported keystore derivation parameters.");
  }
  function hex(value, bytes) {
    if (typeof value !== "string" || !new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(value)) {
      throw new Error("Invalid keystore field.");
    }
    return Buffer.from(value, "hex");
  }
  const ciphertext = hex(crypto.ciphertext, 32);
  const salt = hex(params.salt, 32);
  const iv = hex(crypto.cipherparams?.iv, 16);
  const mac = hex(crypto.mac, 32);
  const derived = scryptSync(password, salt, 32, { N: params.n, r: params.r, p: params.p, maxmem: 512 * 1024 * 1024 });
  let plaintext;
  let macInput;
  try {
    macInput = Buffer.concat([derived.subarray(16), ciphertext]);
    const calculated = Buffer.from(keccak256(macInput).slice(2), "hex");
    if (!timingSafeEqual(mac, calculated)) throw new Error("Keystore password/integrity check failed.");
    const decipher = createDecipheriv("aes-128-ctr", derived.subarray(0, 16), iv);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return privateKeyToAccount(`0x${plaintext.toString("hex")}`);
  } finally {
    derived.fill(0);
    plaintext?.fill(0);
    macInput?.fill(0);
  }
}
