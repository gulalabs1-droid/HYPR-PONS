import { WebhookReceiver } from "livekit-server-sdk";
import { getRoomService, isLiveKitConfigured, participantRole } from "@/lib/livekit";
import { revokeStaleGuests, type GuestService } from "@/lib/live-guests-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 64 * 1024;

async function readBody(request: Request) {
  if (!request.body) return "";
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

// LiveKit signs the exact body. Never trust an unsigned event or its participant metadata.
export async function POST(request: Request) {
  if (!isLiveKitConfigured()) return new Response(null, { status: 503 });
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  let body: string;
  try { body = await readBody(request); } catch { return new Response(null, { status: 413 }); }
  let event;
  try {
    event = await new WebhookReceiver(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!).receive(body, request.headers.get("authorization") || undefined);
  } catch { return new Response(null, { status: 401 }); }
  const roomName = event.room?.name || "";
  if (event.event !== "participant_left" || !/^hypr-0x[a-f0-9]{40}$/.test(roomName) ||
      !/^host-0x[a-f0-9]{40}$/.test(event.participant?.identity || "") || participantRole(event.participant?.metadata) !== "host") {
    return new Response(null, { status: 204 });
  }
  try {
    const service = getRoomService();
    if ((await service.listRooms([roomName])).length) {
      const participants = await service.listParticipants(roomName);
      // Use current participants, not the possibly delayed webhook, as the source of truth.
      await revokeStaleGuests(service as unknown as GuestService, roomName, participants);
    }
    return new Response(null, { status: 204 });
  } catch {
    // A non-success response lets the provider retry; normal status checks also reconcile.
    return new Response(null, { status: 503 });
  }
}
