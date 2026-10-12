import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

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
    canPublishData: role === "host",
  });
  return token.toJwt();
}

function getRoomService() {
  const host = getLiveKitServerUrl().replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

function participantRole(metadata?: string) {
  if (!metadata) return "";
  try { return (JSON.parse(metadata) as { role?: string }).role || ""; } catch { return ""; }
}

export async function getLiveRoomStatus(roomName: string) {
  if (!isLiveKitConfigured()) return { configured: false, live: false, viewerCount: 0 };
  const service = getRoomService();
  const rooms = await service.listRooms([roomName]);
  if (!rooms[0]) return { configured: true, live: false, viewerCount: 0 };
  const participants = await service.listParticipants(roomName);
  const hostPresent = participants.some((participant) => participantRole(participant.metadata) === "host");
  return { configured: true, live: hostPresent, viewerCount: Math.max(0, participants.filter((participant) => participantRole(participant.metadata) !== "host").length) };
}
