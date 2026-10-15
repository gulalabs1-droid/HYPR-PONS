"use client";
import type { Launch } from "@/lib/types";
import type { CombinedLaunchDataSource } from "@/lib/launch-data";
import { useLiveLaunches } from "@/lib/use-live-launches";
import { Header } from "./header";
import { SiteFooter } from "./site-footer";
import { GrowthDiscovery } from "./growth-discovery";
export function FollowingClient({ launches, source }: { launches: Launch[]; source: CombinedLaunchDataSource }) {
  const data = useLiveLaunches(launches, source);
  return <main><Header active="following" /><div className="page-shell"><section className="growth-page-heading"><span className="eyebrow">YOUR COMMUNITIES</span><h1>Come back for the next show.</h1><p>Saved follows live with your wallet—not just this tab. Watching never needs a wallet.</p></section><GrowthDiscovery launches={data.launches} followingOnly /><SiteFooter /></div></main>;
}
