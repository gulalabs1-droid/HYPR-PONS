import { DiscoverClient } from "@/components/discover-client";
import { LaunchpadPanel } from "@/components/launchpad-panel";
import { getCombinedLaunchData } from "@/lib/launch-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await getCombinedLaunchData();
  return <DiscoverClient initialLaunches={result.launches} source={result.source}><LaunchpadPanel /></DiscoverClient>;
}
