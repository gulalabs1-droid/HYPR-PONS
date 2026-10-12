import { createHash, randomUUID } from "node:crypto";
import { getAddress, isAddress, recoverMessageAddress, type Hex } from "viem";
import type { Launch } from "@/lib/types";
import { ROBINHOOD_CHAIN } from "@/lib/integrations/pons/constants";
import { getHyprNetwork, HYPR_NETWORKS } from "@/lib/integrations/hypr/constants";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGES = 1_000;

export type ClaimChallenge = {
  challengeId: string;
  message: string;
  nonceHash: string;
  tokenAddress: `0x${string}`;
  claimantAddress: `0x${string}`;
  creatorAddress: `0x${string}`;
  chainId: number;
  expiresAt: number;
};

type ClaimStore = Map<string, ClaimChallenge>;

const processState = globalThis as typeof globalThis & { __hyprRoomClaimChallenges?: ClaimStore };
const challenges = processState.__hyprRoomClaimChallenges || new Map<string, ClaimChallenge>();
processState.__hyprRoomClaimChallenges = challenges;

function purgeExpired(now = Date.now()) {
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt <= now) challenges.delete(id);
  }
  while (challenges.size >= MAX_CHALLENGES) {
    const oldest = challenges.keys().next().value;
    if (!oldest) break;
    challenges.delete(oldest);
  }
}

export function isEvmAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && isAddress(value, { strict: false });
}

function canonicalAddress(value: string) {
  return getAddress(value.toLowerCase() as `0x${string}`) as `0x${string}`;
}

export function expectedClaimChainId(launch: Launch) {
  return launch.origin === "hypr" ? HYPR_NETWORKS[getHyprNetwork()].id : ROBINHOOD_CHAIN.id;
}

export function createClaimChallenge(launch: Launch, claimantAddress: `0x${string}`, chainId: number) {
  purgeExpired();
  const challengeId = randomUUID();
  const nonceHash = createHash("sha256").update(challengeId).digest("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const tokenAddress = canonicalAddress(launch.address);
  const creatorAddress = canonicalAddress(launch.deployer);
  const normalizedClaimant = canonicalAddress(claimantAddress);
  const message = [
    "HYPR ROOM CLAIM",
    "Sign to prove control of the wallet associated with this indexed launch creator.",
    "This signature sends no transaction and grants no token permissions.",
    "",
    "Domain: HYPR",
    `Token: ${tokenAddress}`,
    `Indexed creator: ${creatorAddress}`,
    `Claimant: ${normalizedClaimant}`,
    `Chain ID: ${chainId}`,
    `Challenge: ${challengeId}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");
  challenges.set(challengeId, {
    challengeId,
    message,
    nonceHash,
    tokenAddress,
    claimantAddress: normalizedClaimant,
    creatorAddress,
    chainId,
    expiresAt,
  });
  return { challengeId, message, expiresAt, tokenAddress, claimantAddress: normalizedClaimant, creatorAddress, chainId, nonceHash };
}

export async function verifyClaimChallenge(challengeId: string, signature: string) {
  purgeExpired();
  const challenge = challenges.get(challengeId);
  if (!challenge) throw new Error("Claim challenge is missing or expired");
  challenges.delete(challengeId);
  if (!/^0x[a-fA-F0-9]{128,130}$/.test(signature)) throw new Error("Invalid wallet signature");

  const recovered = getAddress(await recoverMessageAddress({ message: challenge.message, signature: signature as Hex }));
  if (recovered.toLowerCase() !== challenge.claimantAddress.toLowerCase()) throw new Error("Signature does not match the claimant wallet");
  if (recovered.toLowerCase() !== challenge.creatorAddress.toLowerCase()) throw new Error("Wallet is not the indexed launch creator");
  return { ...challenge, claimantAddress: recovered as `0x${string}`, verifiedAt: new Date().toISOString() };
}
