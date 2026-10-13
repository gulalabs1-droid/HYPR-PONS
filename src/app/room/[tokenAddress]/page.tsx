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
      ? `Join the ${token.name} community on HYPR. HYPE ${token.hype}.`
      : `Explore the ${token.name} room on HYPR. This is ${stateLabel} data; verify the token address and onchain state before relying on metrics.`,
    openGraph: {
      title: verified ? `HYPR — $${token.symbol} is ${token.rank === 1 ? "#1" : `#${token.rank}`} Rising` : `HYPR — $${token.symbol} community room · ${stateLabel}`,
      description: verified ? `${token.activeNow} people are in the room right now.` : `${stateLabel.toUpperCase()} DATA · Room activity and social metrics are not verified.`,
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
