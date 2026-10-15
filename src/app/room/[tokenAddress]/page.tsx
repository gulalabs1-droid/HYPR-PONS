import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoomClient } from "@/components/room-client";
import { findRoomLaunch } from "@/lib/page-data";
import { ADDRESS, canonicalRoomUrl } from "@/lib/growth";
import { readGrowth } from "@/lib/growth-server";

type Props = { params: Promise<{ tokenAddress: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tokenAddress } = await params;
  if (!ADDRESS.test(tokenAddress)) return { title: "Room not found", robots: { index: false, follow: false } };
  const token = (await findRoomLaunch(tokenAddress))?.token;
  if (!token) return { title: "Room not found" };
  const verified = token.dataStatus === "verified";
  const stateLabel = token.dataStatus === "demo" ? "demo" : token.dataStatus === "partial" ? "partial" : "verified";
  const room = await readGrowth(null, tokenAddress).then(rooms => rooms[0]).catch(() => null);
  const name = room?.displayName || token.name, url = canonicalRoomUrl(tokenAddress), image = `${url}/share-image`;
  return {
    title: `${name} · Creator community${verified ? "" : ` · ${stateLabel}`}`,
    description: `${room?.bio || `Watch ${name}, join the conversation and return for the next show.`} Watching needs no wallet. Trading is optional; testnet assets have no real value.`,
    alternates: { canonical: url },
    openGraph: {
      title: `${name} on HYPR`,
      description: "Watch creators. Join a lasting community. Open the room for current live status; this preview does not promise a live broadcast or replay.",
      type: "website",
      url, images: [{ url: image, width:1200, height:630 }],
    },
    twitter: { card: "summary_large_image", title: `${name} on HYPR`, description: "Watching needs no wallet. Trading is optional. Testnet preview.", images: [image] },
  };
}

export default async function RoomPage({ params }: Props) {
  const { tokenAddress } = await params;
  if (!ADDRESS.test(tokenAddress)) notFound();
  const result = await findRoomLaunch(tokenAddress);
  if (!result) notFound();
  return <RoomClient token={result.token} source={result.source} />;
}
