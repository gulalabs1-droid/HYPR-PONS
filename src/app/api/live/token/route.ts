import { NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { getCombinedLaunchData } from "@/lib/launch-data";
import { createLiveKitToken, getLiveKitClientUrl, getLiveRoomStatus, isLiveKitConfigured, roomNameForLaunch } from "@/lib/livekit";

export const runtime = "nodejs";

type TokenRequest = { roomId?: string; role?: "host" | "viewer"; address?: string; timestamp?: number; signature?: `0x${string}` };

function hostMessage(roomName: string, address: string, timestamp: number) {
  return ["HYPR native live host authorization", `Room: ${roomName}`, `Wallet: ${address.toLowerCase()}`, `Timestamp: ${timestamp}`].join("\n");
}

export async function POST(request: Request) {
  if (!isLiveKitConfigured()) return NextResponse.json({ error: "Native live streaming is not connected yet. Add the LiveKit server settings before going live." }, { status: 503 });
  let body: TokenRequest;
  try { body = await request.json() as TokenRequest; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (body.role !== "host" && body.role !== "viewer") return NextResponse.json({ error: "Choose a host or viewer role." }, { status: 400 });
  const roomId = body.roomId || "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(roomId)) return NextResponse.json({ error: "A valid HYPR room address is required." }, { status: 400 });
  const roomName = roomNameForLaunch(roomId);
  const launch = (await getCombinedLaunchData()).launches.find((item) => item.address.toLowerCase() === roomId.toLowerCase());
  if (!launch) return NextResponse.json({ error: "This launch is not currently indexed." }, { status: 404 });
  if (launch.origin !== "hypr" || launch.dataStatus === "demo") return NextResponse.json({ error: "Native streaming is available only for real HYPR launches." }, { status: 403 });

  if (body.role === "host") {
    const address = body.address || "";
    const timestamp = Number(body.timestamp);
    if (!/^0x[a-fA-F0-9]{40}$/.test(address) || !Number.isSafeInteger(timestamp) || !body.signature) return NextResponse.json({ error: "Wallet authorization is incomplete." }, { status: 400 });
    if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return NextResponse.json({ error: "This live authorization expired. Please try again." }, { status: 401 });
    if (launch.deployer.toLowerCase() !== address.toLowerCase()) return NextResponse.json({ error: "Only the verified native HYPR launch creator can start this room." }, { status: 403 });
    try {
      const recovered = await recoverMessageAddress({ message: hostMessage(roomName, address, timestamp), signature: body.signature });
      if (recovered.toLowerCase() !== address.toLowerCase()) throw new Error("signature mismatch");
    } catch { return NextResponse.json({ error: "Wallet signature could not be verified." }, { status: 401 }); }
    const token = await createLiveKitToken({ roomName, identity: `host-${address.toLowerCase()}`, name: `${launch.name} creator`, role: "host", launchAddress: roomId.toLowerCase() });
    return NextResponse.json({ token, serverUrl: getLiveKitClientUrl(), roomName, role: "host" }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    if (!(await getLiveRoomStatus(roomName)).live) return NextResponse.json({ error: "The creator is currently offline." }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "Live access is temporarily unavailable." }, { status: 503 });
  }
  const token = await createLiveKitToken({ roomName, identity: `viewer-${crypto.randomUUID()}`, name: "HYPR viewer", role: "viewer", launchAddress: roomId.toLowerCase() });
  return NextResponse.json({ token, serverUrl: getLiveKitClientUrl(), roomName, role: "viewer" }, { headers: { "Cache-Control": "no-store" } });
}
