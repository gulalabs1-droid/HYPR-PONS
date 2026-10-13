import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoomClient } from "@/components/room-client";
import { findRoomLaunch } from "@/lib/page-data";

type Props = { params: Promise<{ tokenAddress: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tokenAddress } = await params;
  const token = (await findRoomLaunch(tokenAddress))?.token;
  if (!token) return { title: "Room not found" };
  const verified = token.dataStatus === "verified";
  const stateLabel = token.dataStatus === "demo" ? "demo" : token.dataStatus === "partial" ? "partial" : "verified";
  return {
    title: `${token.symbol} community room${verified ? "" : ` · ${stateLabel}`}`,
    description: verified
      ? `Join the ${token.name} community on HYPR.`
      : `Explore the ${token.name} room on HYPR. This is ${stateLabel} data; verify the token address and onchain state before relying on metrics.`,
    openGraph: {
      title: `HYPR — $${token.symbol} community room`,
      description: "Onchain launch data, native broadcasts and shared room chat. Open the room for current status. Testnet assets have no real value.",
      type: "website",
    },
  };
}

export default async function RoomPage({ params }: Props) {
  const { tokenAddress } = await params;
  const result = await findRoomLaunch(tokenAddress);
  if (!result) notFound();
  return <RoomClient token={result.token} source={result.source} />;
}
