"use client";
import { getEthereum, personalSignHex } from "./wallet";
import { OPEN_WALLET_EVENT } from "./wallet-discovery";
import { COMMUNITY_UPDATED_EVENT } from "./growth";

let resetting: Promise<void> | null = null;
let resetNeeded = false;
export async function resetCommunitySession() {
  resetNeeded = true;
  if (!resetting) resetting = fetch("/api/community/session", { method:"DELETE", signal:AbortSignal.timeout(10000) }).then(response => { if (!response.ok) throw new Error("Sign-out did not finish. Retry before using another account."); resetNeeded=false; }).finally(() => { resetting = null; });
  return resetting;
}
export async function awaitCommunityReset() { if (resetting) await resetting; else if(resetNeeded) await resetCommunitySession(); }

export async function signInCommunity() {
  await awaitCommunityReset();
  const provider = getEthereum();
  if (!provider) { window.dispatchEvent(new Event(OPEN_WALLET_EVENT)); throw new Error("Choose a wallet for saved follows and creator controls. Watching needs no wallet."); }
  const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
  if (!accounts[0]) throw new Error("No wallet account was returned.");
  await awaitCommunityReset();
  const current = await fetch("/api/community/session", { cache: "no-store", signal:AbortSignal.timeout(10000) }).then(response => response.json());
  if (current.wallet?.toLowerCase() === accounts[0].toLowerCase()) return current.wallet as string;
  const challenge = await fetch("/api/community/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: accounts[0] }), signal:AbortSignal.timeout(10000) });
  const data = await challenge.json();
  if (!challenge.ok || !data.message) throw new Error(data.error || "Sign-in is unavailable.");
  const signature = await provider.request({ method: "personal_sign", params: [personalSignHex(data.message), accounts[0]] });
  await awaitCommunityReset();
  const verification = await fetch("/api/community/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature }), signal:AbortSignal.timeout(10000) });
  const verified = await verification.json();
  if (!verification.ok || !verified.wallet) throw new Error(verified.error || "Wallet sign-in could not be verified.");
  window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT));
  return verified.wallet as string;
}
