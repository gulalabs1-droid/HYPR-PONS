import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getCombinedLaunchData } from "@/lib/launch-data";
import { readNativeProtocolSnapshot, type NativeProtocolSnapshot } from "@/lib/integrations/hypr/indexer";

// Page renders only. Authorization routes (room claims, live tokens) must keep
// reading chain state directly instead of through this short-lived cache.
const PAGE_REVALIDATE_SECONDS = 10;

export const getPageLaunchData = cache(unstable_cache(getCombinedLaunchData, ["hypr-combined-launch-data"], { revalidate: PAGE_REVALIDATE_SECONDS }));

export const findRoomLaunch = cache(async (tokenAddress: string) => {
  const matches = (launches: Awaited<ReturnType<typeof getCombinedLaunchData>>) => launches.launches.find((item) => item.address.toLowerCase() === tokenAddress.toLowerCase());
  const cached = await getPageLaunchData();
  const hit = matches(cached);
  if (hit) return { token: hit, source: cached.source };
  // A launch confirmed seconds ago may not be in the cached list yet.
  const fresh = await getCombinedLaunchData();
  const token = matches(fresh);
  return token ? { token, source: fresh.source } : null;
});

const BIGINT_FIELDS = ["totalTradeVolume", "totalCreatorFees", "totalProtocolFees", "lookbackBlocks", "confirmationDepth"] as const;

const readSerializedSnapshot = unstable_cache(async () => {
  const snapshot = await readNativeProtocolSnapshot();
  return JSON.stringify(snapshot, (_key, value) => typeof value === "bigint" ? value.toString() : value);
}, ["hypr-protocol-snapshot"], { revalidate: PAGE_REVALIDATE_SECONDS });

export const getPageProtocolSnapshot = cache(async (): Promise<NativeProtocolSnapshot> => {
  const parsed = JSON.parse(await readSerializedSnapshot()) as Record<string, unknown>;
  for (const field of BIGINT_FIELDS) if (typeof parsed[field] === "string") parsed[field] = BigInt(parsed[field] as string);
  return parsed as NativeProtocolSnapshot;
});
