import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { RoomFaq } from "@/components/room-faq";

export const metadata: Metadata = { title: "FAQ & getting started", alternates: { canonical: "/faq" }, description: "Watching, wallets, saved rooms, streaming, and the honest limits of the HYPR testnet preview." };
export default function FaqPage() {
  return <main className="faq-page"><Header /><div className="page-shell"><Link href="/discover" className="back-link">← Back to Discover</Link><header><span className="eyebrow">THE HYPR FIELD GUIDE</span><h1>Come for the stream.<br /><em>Feel at home.</em></h1><p>You don’t need to know crypto to find your people here.</p></header><RoomFaq /><p className="discovery-service-notice">This is a testnet preview, not a promise of investment returns or a fully staffed moderation service.</p><SiteFooter /></div></main>;
}
