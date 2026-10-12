import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { createClaimChallenge, isEvmAddress, verifyClaimChallenge } from "../src/lib/room-claims";

const creator = privateKeyToAccount("0x0123456789012345678901234567890123456789012345678901234567890123");
const otherWallet = privateKeyToAccount("0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd");

function launch(deployer = creator.address) {
  return {
    address: "0x0000000000000000000000000000000000000001",
    pool: "0x0000000000000000000000000000000000000002",
    name: "Test launch",
    symbol: "TEST",
    logo: "✦",
    description: "test",
    deployer,
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
    origin: "hypr" as const,
    dataStatus: "partial" as const,
  };
}

test("room claim verifies the indexed creator and rejects replay", async () => {
  const challenge = createClaimChallenge(launch(), creator.address, 46630);
  const signature = await creator.signMessage({ message: challenge.message });
  const result = await verifyClaimChallenge(challenge.challengeId, signature);
  assert.equal(result.claimantAddress.toLowerCase(), creator.address.toLowerCase());
  await assert.rejects(() => verifyClaimChallenge(challenge.challengeId, signature), /missing or expired/);
});

test("room claim rejects a valid signature from a non-creator wallet", async () => {
  const challenge = createClaimChallenge(launch(), otherWallet.address, 46630);
  const signature = await otherWallet.signMessage({ message: challenge.message });
  await assert.rejects(() => verifyClaimChallenge(challenge.challengeId, signature), /not the indexed launch creator/);
});

test("room claims canonicalize valid mixed-case hex room addresses", () => {
  const mixedCase = "0x8B7f0bC4B22fE4e3cA91E0C4b3fA1c7D5E6f8A90";
  assert.equal(isEvmAddress(mixedCase), true);
  const challenge = createClaimChallenge({ ...launch(), address: mixedCase }, creator.address, 46630);
  assert.equal(challenge.tokenAddress.toLowerCase(), mixedCase.toLowerCase());
});
