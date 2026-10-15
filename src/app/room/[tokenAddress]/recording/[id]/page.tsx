import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ADDRESS, UUID, canonicalRoomUrl } from "@/lib/growth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HYPR_NETWORKS, getHyprNetwork } from "@/lib/integrations/hypr/constants";
import { RecordingPlayer } from "@/components/recording-player";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
type Props = { params: Promise<{ tokenAddress: string; id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tokenAddress, id } = await params;
  if (!ADDRESS.test(tokenAddress) || !UUID.test(id)) return { title: "Recording unavailable", robots: { index: false, follow: false } };
  const asset = await getSupabaseAdminClient()?.rpc<{ title: string }>("hypr_media", { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_token_address: tokenAddress, p_wallet_address: null, p_action: "asset", p_data: { id } }).catch(() => null);
  if (!asset) return { title: "Private or unavailable recording", robots: { index: false, follow: false } };
  const url = `${canonicalRoomUrl(tokenAddress)}/recording/${id}`;
  return { title: `${asset.title} · Saved recording`, description: "A creator-published HYPR recording. Watch without a wallet. This is saved audio/video, not a live broadcast.", alternates: { canonical: url }, openGraph: { title: asset.title, description: "Watch the saved recording on HYPR. No wallet required.", url, type: "website", images: [`${canonicalRoomUrl(tokenAddress)}/share-image`] } };
}
export default async function RecordingPage({ params }: Props) {
  const { tokenAddress, id } = await params;
  if (!ADDRESS.test(tokenAddress) || !UUID.test(id)) notFound();
  return <main className="recording-page"><Header /><div className="page-shell"><Link className="back-link" href={`/room/${tokenAddress}`}>← Back to the creator’s room</Link><RecordingPlayer roomId={tokenAddress} id={id} /><SiteFooter /></div></main>;
}
