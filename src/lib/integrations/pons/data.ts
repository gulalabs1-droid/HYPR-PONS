import type { Launch } from "@/lib/types";
import { fixtureLaunches } from "./fixtures";
import { readRecentLaunches } from "./indexer";

export async function getLaunches(): Promise<Launch[]> {
  if (process.env.PONS_INDEXER_MODE !== "rpc") return fixtureLaunches;
  try {
    const indexed = await readRecentLaunches();
    if (!indexed.length) return fixtureLaunches;
    const known = new Map(fixtureLaunches.map((item) => [item.address.toLowerCase(), item]));
    return indexed.map((item, index) => known.get(item.address.toLowerCase()) || {
      ...fixtureLaunches[index % fixtureLaunches.length],
      address: item.address,
      pool: item.pool,
      deployer: item.deployer,
      name: "New Robinhood token",
      symbol: "NEW",
      hype: 40,
      rank: index + 1,
      activeNow: 0,
    });
  } catch {
    return fixtureLaunches;
  }
}
