import { createHash } from "node:crypto";
import { getAddress, recoverMessageAddress, type Hex } from "viem";
import type { ClaimChallenge } from "@/lib/room-claims";

export type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

export type SupabaseRpcClient = {
  rpc<T>(functionName: string, args: Record<string, unknown>): Promise<T>;
};

type DurableClaimRow = {
  claim_id: string;
  room_id: string;
  chain_id: number;
  token_address: string;
  claimant_address: string;
  creator_address: string;
  challenge_message: string;
  expires_at: string;
  status?: string;
};

type DurableFinalizedClaimRow = {
  room_id: string;
  chain_id: number;
  token_address: string;
  claimant_address: string;
  creator_address: string;
  verified_at: string;
};

function readConfig(): SupabaseConfig | null {
  const rawUrl = process.env.SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!rawUrl && !serviceRoleKey) return null;
  if (!rawUrl || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together");

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("SUPABASE_URL must be a valid URL");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("SUPABASE_URL must use HTTPS");
  }
  if (url.username || url.password) throw new Error("SUPABASE_URL must not contain credentials");
  return { url: rawUrl.replace(/\/$/, ""), serviceRoleKey };
}

export function createSupabaseAdminClient(
  config: SupabaseConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): SupabaseRpcClient {
  if (!fetchImpl) throw new Error("Fetch is unavailable in the server runtime");
  return {
    async rpc<T>(functionName: string, args: Record<string, unknown>) {
      const response = await fetchImpl(`${config.url}/rest/v1/rpc/${functionName}`, {
        method: "POST",
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(args),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Supabase RPC failed (${response.status})`);
      return await response.json() as T;
    },
  };
}

function getAdminClient() {
  const config = readConfig();
  return config ? createSupabaseAdminClient(config) : null;
}

export function getSupabaseAdminClient() {
  return getAdminClient();
}

export function hashClaimChallengeId(challengeId: string) {
  return createHash("sha256").update(challengeId).digest("hex");
}

function firstRow<T>(value: unknown): T | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value[0] as T;
}

export async function persistClaimChallenge(challenge: ClaimChallenge) {
  const client = getAdminClient();
  if (!client) throw new Error("Supabase claim persistence is not configured");
  const rows = await client.rpc<DurableClaimRow[]>("hypr_create_room_claim", {
    p_claim_id: challenge.challengeId,
    p_chain_id: challenge.chainId,
    p_token_address: challenge.tokenAddress,
    p_claimant_address: challenge.claimantAddress,
    p_creator_address: challenge.creatorAddress,
    p_nonce_hash: hashClaimChallengeId(challenge.challengeId),
    p_challenge_message: challenge.message,
    p_expires_at: new Date(challenge.expiresAt).toISOString(),
  });
  const row = firstRow<DurableClaimRow>(rows);
  if (!row || row.claim_id !== challenge.challengeId) throw new Error("Supabase did not persist the claim challenge");
  return true;
}

async function rejectClaim(client: SupabaseRpcClient, challengeId: string) {
  try {
    await client.rpc<boolean>("hypr_reject_room_claim", { p_claim_id: challengeId });
  } catch {
    // Preserve the signature error. The pending row will expire and cannot be finalized.
  }
}

export async function verifyDurableClaim(challengeId: string, signature: string) {
  const client = getAdminClient();
  if (!client) return null;
  const rows = await client.rpc<DurableClaimRow[]>("hypr_get_room_claim", {
    p_nonce_hash: hashClaimChallengeId(challengeId),
  });
  const row = firstRow<DurableClaimRow>(rows);
  if (!row || row.claim_id !== challengeId || row.status !== "pending") {
    throw new Error("Claim challenge is missing or expired");
  }
  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await rejectClaim(client, challengeId);
    throw new Error("Claim challenge is missing or expired");
  }
  if (!/^0x[a-fA-F0-9]{128,130}$/.test(signature)) {
    await rejectClaim(client, challengeId);
    throw new Error("Invalid wallet signature");
  }

  try {
    const recovered = getAddress(await recoverMessageAddress({
      message: row.challenge_message,
      signature: signature as Hex,
    }));
    if (recovered.toLowerCase() !== row.claimant_address.toLowerCase()) {
      throw new Error("Signature does not match the claimant wallet");
    }
    if (recovered.toLowerCase() !== row.creator_address.toLowerCase()) {
      throw new Error("Wallet is not the indexed launch creator");
    }

    const verifiedAt = new Date().toISOString();
    const finalized = await client.rpc<DurableFinalizedClaimRow[]>("hypr_finalize_room_claim", {
      p_claim_id: challengeId,
      p_signature: signature,
      p_verified_at: verifiedAt,
    });
    const finalizedRow = firstRow<DurableClaimRow>(finalized);
    if (!finalizedRow) {
      throw new Error("Claim was consumed concurrently or could not be finalized");
    }
    return {
      tokenAddress: getAddress(finalizedRow.token_address) as `0x${string}`,
      claimantAddress: getAddress(finalizedRow.claimant_address) as `0x${string}`,
      creatorAddress: getAddress(finalizedRow.creator_address) as `0x${string}`,
      chainId: finalizedRow.chain_id,
      verifiedAt,
    };
  } catch (error) {
    await rejectClaim(client, challengeId);
    throw error;
  }
}

export function isSupabasePersistenceConfigured() {
  return readConfig() !== null;
}
