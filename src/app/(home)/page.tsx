import { DiscoverClient } from "@/components/discover-client";
import { CreateRoomPanel } from "@/components/create-room-panel";
import { getPageLaunchData } from "@/lib/page-data";

// Served from cache and refreshed every 10 seconds; live status updates in the browser.
export const revalidate = 10;

export default async function HomePage() {
  const result = await getPageLaunchData();
  return <DiscoverClient initialLaunches={result.launches} source={result.source}><CreateRoomPanel /></DiscoverClient>;
}
