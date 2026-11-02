import type { Launch } from "./types";
import { getCombinedLaunchData } from "./launch-data";
import { createLiveKitToken, getLiveKitClientUrl, roomNameForLaunch } from "./livekit";
import { createHostCapability } from "./live-host-auth";

export class CreatorLiveError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** The authenticated wallet only gains host access to its own indexed native room. */
export async function createCreatorLiveSession(roomId: string, wallet: string, origin: string, load: () => Promise<Pick<Launch, "address" | "origin" | "dataStatus" | "deployer" | "name">[]> = async () => (await getCombinedLaunchData()).launches) {
  const launch = (await load()).find(item => item.address.toLowerCase() === roomId);
  if (!launch || launch.origin !== "hypr" || launch.dataStatus === "demo") throw new CreatorLiveError("This native HYPR room is not available.", 404);
  if (launch.deployer.toLowerCase() !== wallet) throw new CreatorLiveError("Only the creator of this room can broadcast here.", 403);
  const roomName = roomNameForLaunch(roomId);
  const capability = createHostCapability(roomId, wallet, origin);
  const token = await createLiveKitToken({ roomName, identity: `host-${wallet}`, name: `${launch.name} creator`, role: "host", launchAddress: roomId, controlId: capability.controlId });
  return { token, serverUrl: getLiveKitClientUrl(), roomName, role: "host" as const, capability };
}
