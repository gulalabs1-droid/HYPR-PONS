import assert from "node:assert/strict";
import { test } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { authorizationMessage, communitySession, createCommunityChallenge, decodeAuthorization, encodeAuthorization, sameOrigin, verifyCommunitySignature } from "../src/lib/community-auth";

test("community authentication binds wallet, website, chain, expiry and signature", async () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousNetwork = process.env.HYPR_NETWORK;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-community-server-secret";
  process.env.HYPR_NETWORK = "testnet";
  try {
    const account = privateKeyToAccount(generatePrivateKey());
    const challenge = createCommunityChallenge(account.address, "https://hypr.test");
    const encoded = encodeAuthorization(challenge);
    assert.ok(decodeAuthorization(encoded, "https://hypr.test", "challenge"));
    assert.equal(decodeAuthorization(encoded, "https://evil.test", "challenge"), null);
    assert.equal(decodeAuthorization(encoded, "https://hypr.test", "session"), null);
    assert.equal(decodeAuthorization(encoded, "https://hypr.test", "challenge", challenge.expiresAt + 1), null);
    assert.equal(decodeAuthorization(encoded + "tampered", "https://hypr.test", "challenge"), null);
    const signature = await account.signMessage({ message: authorizationMessage(challenge) });
    assert.equal(await verifyCommunitySignature(challenge, signature), true);
    assert.equal(await verifyCommunitySignature({ ...challenge, wallet: `0x${"1".repeat(40)}` }, signature), false);
    assert.ok(decodeAuthorization(encodeAuthorization(communitySession(challenge)), "https://hypr.test", "session"));
    assert.equal(sameOrigin(new Request("https://hypr.test/api/community", { headers: { origin: "https://evil.test" } })), false);
    assert.equal(sameOrigin(new Request("https://hypr.test/api/community", { headers: { origin: "https://hypr.test" } })), true);
    assert.equal(sameOrigin(new Request("http://localhost:3101/api/community", { headers: { host: "127.0.0.1:3101", origin: "http://127.0.0.1:3101" } })), true);
    assert.equal(sameOrigin(new Request("https://hypr.test/api/community", { headers: { host: "hypr.test", origin: "https://evil.test" } })), false);
  } finally {
    if (original === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = original;
    if (previousNetwork === undefined) delete process.env.HYPR_NETWORK; else process.env.HYPR_NETWORK = previousNetwork;
  }
});
