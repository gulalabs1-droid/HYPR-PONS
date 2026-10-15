import type { Metadata } from "next";
import { FollowingClient } from "@/components/following-client";
import { getPageLaunchData } from "@/lib/page-data";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Following", description: "Return to your HYPR communities and their next shows.", robots: { index: false, follow: false } };
export default async function FollowingPage() { const result = await getPageLaunchData(); return <FollowingClient launches={result.launches} source={result.source} />; }
