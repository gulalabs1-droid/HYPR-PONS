"use client";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { useLiveLaunches } from "@/lib/use-live-launches";
import { Header } from "./header";
import { SiteFooter } from "./site-footer";
import { GrowthDiscovery } from "./growth-discovery";
import { RoomAvatar } from "./discover-visuals";
import { LiveAlertsToggle } from "./live-alerts";
export function FollowingClient({ launches, source }: { launches: Launch[]; source: CombinedLaunchDataSource }) {
  const data = useLiveLaunches(launches, source);
  return <main className="following-page"><Header active="following" />
    <div className="aurora is-soft" aria-hidden="true"><span className="aurora-a" /><span className="aurora-b" /><span className="aurora-c" /></div>
    <div className="page-shell"><section className="growth-page-heading">
      {data.launches.length > 0 && <div className="avatar-stack" aria-hidden="true">{data.launches.slice(0, 5).map((launch) => <RoomAvatar key={launch.address} token={launch} size="md" />)}</div>}
      <span className="eyebrow">YOUR COMMUNITIES</span><h1>Come back for <em>the next show.</em></h1><p>Saved follows live with your wallet—not just this tab. Watching never needs a wallet.</p>
      <LiveAlertsToggle />
    </section><GrowthDiscovery launches={data.launches} followingOnly /><SiteFooter /></div></main>;
}
