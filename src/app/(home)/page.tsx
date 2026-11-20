import { DiscoverClient } from "@/components/discover-client";
import { LaunchpadPanel } from "@/components/launchpad-panel";
import { CreateRoomPanel } from "@/components/create-room-panel";
import { getPageLaunchData } from "@/lib/page-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await getPageLaunchData();
  return <DiscoverClient initialLaunches={result.launches} source={result.source}><CreateRoomPanel /><LaunchpadPanel /></DiscoverClient>;
}
