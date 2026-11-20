import { NextRequest, NextResponse } from "next/server";
import { IngressClient, IngressInput } from "livekit-server-sdk";
import { COMMUNITY_SESSION_COOKIE, decodeAuthorization, requestOrigin, sameOrigin } from "@/lib/community-auth";
import { getCombinedLaunchData } from "@/lib/launch-data";
import { getLiveKitServerUrl, isLiveKitConfigured, roomNameForLaunch } from "@/lib/livekit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

// LiveKit ingress is billed per minute of streamed input, so it is opt-in.
function ingressEnabled() { return process.env.HYPR_INGRESS_ENABLED === "true" && isLiveKitConfigured(); }

function ingressClient() {
  return new IngressClient(getLiveKitServerUrl().replace(/^wss:/, "https:").replace(/^ws:/, "http:"), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

/** Creator-only: verify the signed-in wallet created this room, reading the chain directly. */
async function creatorRoom(request: NextRequest, roomId: string) {
  const session = decodeAuthorization(request.cookies.get(COMMUNITY_SESSION_COOKIE)?.value, requestOrigin(request), "session");
  if (!session || session.version !== 2) return { error: "Sign in again with your creator wallet to stream from OBS.", status: 401 } as const;
  const launch = (await getCombinedLaunchData()).launches.find(item => item.address.toLowerCase() === roomId.toLowerCase());
  if (!launch || launch.origin !== "hypr" || launch.dataStatus === "demo") return { error: "Room not found.", status: 404 } as const;
  if (launch.deployer.toLowerCase() !== session.wallet) return { error: "Only this room’s creator can stream to it.", status: 403 } as const;
  return { launch, wallet: session.wallet } as const;
}

const view = (info: { url?: string; streamKey?: string; ingressId?: string }) => ({ serverUrl: info.url || "", streamKey: info.streamKey || "", id: info.ingressId || "" });

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get("roomId") || "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(roomId)) return NextResponse.json({ error: "A valid room is required." }, { status: 400, headers });
  if (!ingressEnabled()) return NextResponse.json({ enabled: false }, { headers });
  const room = await creatorRoom(request, roomId);
  if ("error" in room) return NextResponse.json({ enabled: true, error: room.error }, { status: room.status, headers });
  try {
    const existing = (await ingressClient().listIngress({ roomName: roomNameForLaunch(roomId) }))[0];
    return NextResponse.json({ enabled: true, ingress: existing ? view(existing) : null }, { headers });
  } catch { return NextResponse.json({ enabled: true, error: "Streaming setup is temporarily unavailable." }, { status: 503, headers }); }
}

/** Create (or reset) this room's RTMP stream key. The stream joins as the room's host. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Use HYPR to set up streaming." }, { status: 403, headers });
  let body: { roomId?: unknown; reset?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers }); }
  if (typeof body?.roomId !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(body.roomId)) return NextResponse.json({ error: "A valid room is required." }, { status: 400, headers });
  if (!ingressEnabled()) return NextResponse.json({ error: "Streaming from OBS isn’t switched on for HYPR yet." }, { status: 503, headers });
  const room = await creatorRoom(request, body.roomId);
  if ("error" in room) return NextResponse.json({ error: room.error }, { status: room.status, headers });
  const client = ingressClient(), roomName = roomNameForLaunch(body.roomId);
  try {
    const existing = await client.listIngress({ roomName });
    if (existing[0] && body.reset !== true) return NextResponse.json({ ingress: view(existing[0]) }, { headers });
    await Promise.all(existing.map(item => item.ingressId ? client.deleteIngress(item.ingressId) : null));
    const created = await client.createIngress(IngressInput.RTMP_INPUT, {
      name: `HYPR ${room.launch.name}`.slice(0, 60), roomName,
      participantIdentity: `host-${room.wallet}`, participantName: `${room.launch.name} creator`,
      participantMetadata: JSON.stringify({ role: "host", launchAddress: body.roomId.toLowerCase(), source: "obs" }),
    });
    return NextResponse.json({ ingress: view(created) }, { headers });
  } catch { return NextResponse.json({ error: "Streaming setup is temporarily unavailable." }, { status: 503, headers }); }
}
