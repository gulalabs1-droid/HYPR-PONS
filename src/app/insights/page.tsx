import type { Metadata } from "next";
import { PilotInsights } from "@/components/pilot-insights";
import { growthEnabled } from "@/lib/growth-server";
import { Header } from "@/components/header";
import Link from "next/link";
export const dynamic="force-dynamic";
export const metadata: Metadata = { title:"Private pilot insights", robots:{index:false,follow:false} };
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ roomId?: string }> }) { if(!growthEnabled()) return <main><Header/><div className="page-shell growth-page-heading"><h1>Pilot insights are staged.</h1><p>Measurement is not enabled in this deployment. No activity totals are invented, and no wallet sign-in is needed to read this status.</p><Link href="/">Back to Discover →</Link></div></main>; const { roomId } = await searchParams; return <PilotInsights roomId={roomId} />; }
