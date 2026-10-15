import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function getLiveKitServerUrl() {
  return process.env.LIVEKIT_URL?.trim() || process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() || "";
}

export function getLiveKitClientUrl() {
  const raw = getLiveKitServerUrl();
  if (!raw) return "";
  if (raw.startsWith("https://")) return raw.replace(/^https:/, "wss:");
  if (raw.startsWith("http://")) return raw.replace(/^http:/, "ws:");
  return raw;
}

export function isLiveKitConfigured() {
  return Boolean(getLiveKitServerUrl() && process.env.LIVEKIT_API_KEY?.trim() && process.env.LIVEKIT_API_SECRET?.trim());
}

export function roomNameForLaunch(address: string) {
  if (!ADDRESS.test(address)) throw new Error("Invalid launch address");
  return `hypr-${address.toLowerCase()}`;
}

export async function createLiveKitToken({ roomName, identity, name, role, launchAddress }: { roomName: string; identity: string; name: string; role: "host" | "viewer"; launchAddress: string }) {
  if (!isLiveKitConfigured()) throw new Error("Native live streaming is not configured");
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity, name, ttl: "2h", metadata: JSON.stringify({ role, launchAddress }) });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    roomCreate: role === "host",
    canPublish: role === "host",
    canSubscribe: true,
    // Viewers send only reactions and chat pings; receivers validate and throttle every packet.
    canPublishData: true,
  });
  return token.toJwt();
}

function getRoomService() {
  const host = getLiveKitServerUrl().replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

export function participantRole(metadata?: string) {
  if (!metadata) return "";
  try { return (JSON.parse(metadata) as { role?: string }).role || ""; } catch { return ""; }
}

type MediaParticipant = { metadata?: string; tracks?: { source: number; muted?: boolean }[] };

export function statusFromParticipants(participants: MediaParticipant[]) {
  const host = participants.filter((participant) => participantRole(participant.metadata) === "host");
  const activeTracks = host.flatMap((participant) => participant.tracks || []).filter((track) => !track.muted);
  const video = activeTracks.some((track) => track.source === TrackSource.CAMERA || track.source === TrackSource.SCREEN_SHARE);
  const audio = activeTracks.some((track) => track.source === TrackSource.MICROPHONE || track.source === TrackSource.SCREEN_SHARE_AUDIO);
  return { configured: true, live: video || audio, video, audio, hostConnected: host.length > 0,
    viewerCount: participants.filter((participant) => participantRole(participant.metadata) === "viewer").length,
    checkedAt: new Date().toISOString() };
}

export async function getLiveRoomStatus(roomName: string) {
  if (!isLiveKitConfigured()) return { ...statusFromParticipants([]), configured: false };
  const service = getRoomService();
  const rooms = await service.listRooms([roomName]);
  if (!rooms[0]) return statusFromParticipants([]);
  const participants = await service.listParticipants(roomName);
  return statusFromParticipants(participants);
}

export async function getLiveRoomStatuses(roomNames: string[]) {
  if (!roomNames.length) return new Map<string, ReturnType<typeof statusFromParticipants> | null>();
  if (!isLiveKitConfigured()) return new Map(roomNames.map((name) => [name, { ...statusFromParticipants([]), configured: false }]));
  const service = getRoomService();
  const rooms = new Set((await service.listRooms(roomNames)).map((room) => room.name));
  const result = new Map<string, ReturnType<typeof statusFromParticipants> | null>();
  // Bound parallel calls; absent rooms need no participant request.
  for (let offset = 0; offset < roomNames.length; offset += 8) {
    await Promise.all(roomNames.slice(offset, offset + 8).map(async (name) => {
      try { result.set(name, rooms.has(name) ? statusFromParticipants(await service.listParticipants(name)) : statusFromParticipants([])); }
      catch { result.set(name, null); }
    }));
  }
  return result;
}
