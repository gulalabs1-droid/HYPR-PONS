export type SubmittedLaunch = { hash: string; creator: string; chainId: number; factory: string; name: string; symbol: string };
export type LaunchProgress = {
  status: "pending" | "confirming" | "indexing" | "ready" | "failed";
  confirmations?: number; requiredConfirmations?: number; token?: string; creator?: string;
  name?: string; symbol?: string; roomUrl?: string; message?: string;
};
const hashPattern = /^0x[0-9a-fA-F]{64}$/;
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
export function launchStorageKey(factory: string, creator: string) { return `hypr:launch:46630:${factory.toLowerCase()}:${creator.toLowerCase()}`; }
export function parseSavedLaunch(raw: string | null, factory: string, creator: string): SubmittedLaunch | null {
  try {
    const value = JSON.parse(raw || "null") as SubmittedLaunch | null;
    return value && hashPattern.test(value.hash) && addressPattern.test(value.creator) && value.creator.toLowerCase() === creator.toLowerCase() && value.factory?.toLowerCase() === factory.toLowerCase() && value.chainId === 46630 && typeof value.name === "string" && typeof value.symbol === "string" ? value : null;
  } catch { return null; }
}
export async function checkLaunchProgress(submission: SubmittedLaunch, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<LaunchProgress> {
  const response = await fetchImpl(`/api/launch-status?tx=${encodeURIComponent(submission.hash)}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("We couldn’t check your transaction. Use Check again; don’t create another coin.");
  const value = await response.json() as LaunchProgress;
  if (!["pending", "confirming", "indexing", "ready", "failed"].includes(value.status)) throw new Error("The transaction response was incomplete. Keep your transaction link and check again.");
  if (value.creator && value.creator.toLowerCase() !== submission.creator.toLowerCase()) throw new Error("This launch belongs to a different wallet. No new transaction was sent.");
  if (value.status === "ready" && (!value.token || !addressPattern.test(value.token) || value.roomUrl !== `/room/${value.token}`)) throw new Error("The room link could not be verified. Check again without creating another coin.");
  return value;
}
