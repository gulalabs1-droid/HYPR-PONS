import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ADDRESS, UUID, canonicalRoomUrl } from "@/lib/growth";
import { growthEnabled, readGrowth } from "@/lib/growth-server";
import { ShareRoom } from "@/components/share-room";
type Props = { params: Promise<{ tokenAddress: string }> };
export const dynamic = "force-dynamic";
async function findCard(address: string) { if (!ADDRESS.test(address) || !growthEnabled()) return null; return readGrowth(null,address).then(rooms => rooms[0]?.moment ? rooms[0] : null); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tokenAddress } = await params; const room = await findCard(tokenAddress).catch(()=>null);
  if (!room) return { title:"Share card unavailable", robots:{index:false,follow:false} };
  const url = `${canonicalRoomUrl(tokenAddress)}/moment`, image = `${canonicalRoomUrl(tokenAddress)}/share-image?moment=1`;
  return { title:`${room.moment} · Moment Share Card`, description:`${room.displayName || room.name} on HYPR. A topic share card—not a video clip. Open the permanent room to watch when live.`, alternates:{canonical:url}, openGraph:{title:room.moment!, description:"Moment Share Card—not a playable video or saved replay.", url, images:[{url:image,width:1200,height:630}]}, twitter:{card:"summary_large_image",images:[image]} };
}
export default async function MomentPage({ params, searchParams }: Props & { searchParams: Promise<{ via?: string }> }) {
  const { tokenAddress } = await params;
  const result = await findCard(tokenAddress).then(room=>({room,error:false})).catch(()=>({room:null,error:true}));
  if(result.error) return <main className="moment-page"><h1>Share card temporarily unavailable</h1><p>We could not load the creator’s card. This does not mean it was deleted.</p><Link href={`/room/${tokenAddress}`}>Open the permanent room →</Link></main>;
  const room=result.room; if (!room) notFound();
  const { via } = await searchParams;
  const destination = `/room/${room.address}${via && UUID.test(via) ? `?via=${via}` : ""}`;
  return <main className="moment-page"><Link href="/">HYPR · Discover</Link><p className="eyebrow">MOMENT SHARE CARD · NOT VIDEO</p><h1>{room.moment}</h1><p>Shared by {room.displayName || room.name}. This is a topic card, not a recording or replay.</p>{/* Same-origin generated artwork; unoptimized avoids another image service/cost. */}<Image unoptimized className="moment-card-image" src={`/room/${room.address}/share-image?moment=1`} width={1200} height={630} alt={`${room.displayName || room.name}: ${room.moment}. HYPR topic share card, not video.`} /><p><Link className="primary-button" href={destination}>Open creator’s permanent room →</Link></p><ShareRoom roomId={room.address} name={room.displayName || room.name} moment /></main>;
}
