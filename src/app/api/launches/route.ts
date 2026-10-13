import { NextResponse } from "next/server";
import { getPageLaunchData } from "@/lib/page-data";
import { getLiveRoomStatuses, roomNameForLaunch } from "@/lib/livekit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const result = await getPageLaunchData();
  const names = result.launches.filter((launch) => launch.origin === "hypr").map((launch) => roomNameForLaunch(launch.address));
  const statuses = await getLiveRoomStatuses(names).catch(() => null);
  const launches = result.launches.filter((launch) => launch.dataStatus !== "demo").map((launch) => {
    const status = statuses?.get(roomNameForLaunch(launch.address));
    return { ...launch, broadcastStatus: status?.configured ? status.live ? "live" : "offline" : "unavailable",
      viewerCount: status?.configured ? status.viewerCount : undefined, liveCheckedAt: status?.checkedAt };
  });
  return NextResponse.json({ ...result, launches, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
