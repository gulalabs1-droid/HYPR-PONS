import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoomClient } from "@/components/room-client";
import { getLaunches } from "@/lib/integrations/pons/data";

type Props = { params: Promise<{ tokenAddress: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tokenAddress } = await params;
  const token = (await getLaunches()).find((item) => item.address.toLowerCase() === tokenAddress.toLowerCase());
  if (!token) return { title: "Room not found" };
  return {
    title: `${token.symbol} community room`,
    description: `Join the ${token.name} community on HYPR. HYPE ${token.hype}.`,
    openGraph: {
      title: `HYPR — $${token.symbol} is ${token.rank === 1 ? "#1" : `#${token.rank}`} Rising`,
      description: `${token.activeNow} people are in the room right now.`,
      type: "website",
    },
  };
}

export default async function RoomPage({ params }: Props) {
  const { tokenAddress } = await params;
  const token = (await getLaunches()).find((item) => item.address.toLowerCase() === tokenAddress.toLowerCase());
  if (!token) notFound();
  return <RoomClient token={token} />;
}
