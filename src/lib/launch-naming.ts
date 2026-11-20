import { isBlockedRoomName, isThrowawayRoom } from "./discovery";
import type { Launch } from "./types";

export type LaunchNameCheck = { blocked: boolean; message: string };

/** Names and tickers are permanent onchain, so flag problems before the wallet prompt. */
export function checkLaunchName(name: string, symbol: string): LaunchNameCheck | null {
  const trimmedName = name.trim(), trimmedSymbol = symbol.trim();
  if (!trimmedName && !trimmedSymbol) return null;
  if (isBlockedRoomName(trimmedName) || isBlockedRoomName(trimmedSymbol)) {
    return { blocked: true, message: "HYPR can’t create a room with this name or symbol. Choose one you’d be glad to share publicly." };
  }
  if (trimmedName.length >= 2 && isThrowawayRoom({ token: { name: trimmedName } as Launch, title: trimmedName })) {
    return { blocked: false, message: "Test-style names are hidden from Explore. Your name and symbol are permanent onchain—pick what you’d show your audience." };
  }
  return null;
}
