import { DiscoverClient } from "@/components/discover-client";
import { getLaunches } from "@/lib/integrations/pons/data";

export default async function HomePage() {
  const launches = await getLaunches();
  return <DiscoverClient initialLaunches={launches} />;
}
