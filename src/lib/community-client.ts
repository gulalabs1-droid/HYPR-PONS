"use client";
import { getEthereum, personalSignHex } from "./wallet";
import { OPEN_WALLET_EVENT, walletSessionDisconnected } from "./wallet-discovery";
import { COMMUNITY_SIGNED_OUT_EVENT, COMMUNITY_UPDATED_EVENT } from "./growth";

let resetting: Promise<void> | null = null;
let resetNeeded = false;
export class CommunitySignInError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function resetCommunitySession() {
  resetNeeded = true;
  if (!resetting) {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(COMMUNITY_SIGNED_OUT_EVENT));
    resetting = fetch("/api/community/session", { method:"DELETE", signal:AbortSignal.timeout(10000) }).then(response => { if (!response.ok) throw new Error("Sign-out did not finish. Retry before using another account."); resetNeeded=false; }).finally(() => { resetting = null; });
  }
  return resetting;
}
export async function awaitCommunityReset() { if (resetting) await resetting; else if(resetNeeded) await resetCommunitySession(); }

async function signInOnce(requireLiveHost: boolean) {
  await awaitCommunityReset();
  const provider = getEthereum();
  if (!provider || walletSessionDisconnected()) { window.dispatchEvent(new Event(OPEN_WALLET_EVENT)); throw new Error("Choose a wallet for saved follows and creator controls. Watching needs no wallet."); }
  let accounts: string[] = [];
  try { const known = await provider.request({ method: "eth_accounts" }); if (Array.isArray(known)) accounts = known; } catch { /* Some wallets only support an explicit connection request. */ }
  if (!accounts[0]) accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
  if (!accounts[0]) throw new Error("No wallet account was returned.");
  await awaitCommunityReset();
  const currentResponse = await fetch("/api/community/session", { cache: "no-store", signal:AbortSignal.timeout(10000) });
  if (!currentResponse.ok) throw new CommunitySignInError("HYPR sign-in is temporarily unavailable.", currentResponse.status);
  const current = await currentResponse.json();
  if (current.wallet?.toLowerCase() === accounts[0].toLowerCase() && (!requireLiveHost || current.canStartLive === true)) {
    const latest = await provider.request({ method: "eth_accounts" }) as string[];
    if (getEthereum() !== provider || !Array.isArray(latest) || latest[0]?.toLowerCase() !== accounts[0].toLowerCase()) throw new Error("Your wallet changed during sign-in. Choose the correct account and try again.");
    return current.wallet as string;
  }
  const challenge = await fetch("/api/community/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: accounts[0] }), signal:AbortSignal.timeout(10000) });
  const data = await challenge.json();
  if (!challenge.ok || !data.message) throw new CommunitySignInError(data.error || "Sign-in is unavailable.", challenge.status);
  const signature = await provider.request({ method: "personal_sign", params: [personalSignHex(data.message), accounts[0]] });
  const latest = await provider.request({ method: "eth_accounts" }) as string[];
  if (getEthereum() !== provider || !Array.isArray(latest) || latest[0]?.toLowerCase() !== accounts[0].toLowerCase()) throw new Error("Your wallet changed during sign-in. Choose the correct account and try again.");
  await awaitCommunityReset();
  const verification = await fetch("/api/community/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature }), signal:AbortSignal.timeout(10000) });
  const verified = await verification.json();
  if (!verification.ok || !verified.wallet) throw new CommunitySignInError(verified.error || "Wallet sign-in could not be verified.", verification.status);
  window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT));
  return verified.wallet as string;
}

let signingIn: Promise<string> | null = null;
export async function signInCommunity(options: { requireLiveHost?: boolean } = {}): Promise<string> {
  if (signingIn) {
    const wallet = await signingIn;
    // The first request may have reused an older chat-only session.
    return options.requireLiveHost ? signInCommunity(options) : wallet;
  }
  const pending = signInOnce(options.requireLiveHost === true);
  signingIn = pending;
  try { return await pending; } finally { if (signingIn === pending) signingIn = null; }
}
