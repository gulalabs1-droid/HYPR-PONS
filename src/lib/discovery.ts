import type { Launch } from "./types";
import type { GrowthRoom } from "./growth";

export const discoveryFilters = ["all", "live", "upcoming", "saved"] as const;
export type DiscoveryFilter = typeof discoveryFilters[number];
export type DiscoverySort = "live" | "new" | "name";
export type DiscoveryRoom = { token: Launch; creator?: GrowthRoom; title: string; description: string; upcoming: boolean };

/** Directory facts come from the index and creator profiles, never sample engagement. */
export function discoveryRooms(launches: Launch[], creators: GrowthRoom[], now = Date.now()): DiscoveryRoom[] {
  const profiles = new Map(creators.map(room => [room.address.toLowerCase(), room]));
  const seen = new Set<string>();
  return launches.filter(token => {
    const address = token.address.toLowerCase();
    if (token.dataStatus === "demo" || seen.has(address)) return false;
    seen.add(address); return true;
  }).map(token => {
    const creator = profiles.get(token.address.toLowerCase());
    const upcoming = token.broadcastStatus !== "live" && creator?.show?.status === "scheduled" && Date.parse(creator.show.startsAt) > now;
    return { token, creator, upcoming, title: creator?.displayName || token.name, description: creator?.bio || "A permanent place to watch, talk, and come back to." };
  });
}

const THROWAWAY = /^(test|demo|asdf|foo|bar|tmp|xxx+|kkk+|aaa+|hypr testnet demo)$/i;

/** Pilot/catalog hygiene: obvious scratch names stay out of Explore unless searched. Never guesses quality. */
export function isThrowawayRoom(room: Pick<DiscoveryRoom, "token" | "creator" | "title">) {
  const named = room.creator?.displayName?.trim();
  if (named && named.length >= 4 && !THROWAWAY.test(named)) return false;
  const title = room.title.trim();
  const name = room.token.name.trim();
  // Do not treat a ticker like TEST as junk by itself; fixtures and real rooms share that pattern.
  if (THROWAWAY.test(title) || THROWAWAY.test(name)) return true;
  if (title.length <= 2 || name.length <= 2) return true;
  if (/^(.)\1{2,}$/u.test(title) || /^(.)\1{2,}$/u.test(name)) return true;
  return false;
}

export function selectDiscoveryRooms(rooms: DiscoveryRoom[], query: string, filter: DiscoveryFilter, saved: string[], sort: DiscoverySort) {
  const needle = query.trim().toLocaleLowerCase();
  const savedSet = new Set(saved.map(address => address.toLowerCase()));
  return rooms.filter(room => {
    if (filter === "live" && room.token.broadcastStatus !== "live") return false;
    if (filter === "upcoming" && !room.upcoming) return false;
    if (filter === "saved" && !savedSet.has(room.token.address.toLowerCase())) return false;
    if (filter === "all" && !needle && isThrowawayRoom(room)) return false;
    return `${room.title} ${room.description} ${room.token.name} ${room.token.symbol} ${room.token.address} ${room.creator?.show?.title || ""}`.toLocaleLowerCase().includes(needle);
  }).sort((a, b) => {
    if (sort === "name") return a.title.localeCompare(b.title) || a.token.address.localeCompare(b.token.address);
    if (sort === "live") {
      const live = Number(b.token.broadcastStatus === "live") - Number(a.token.broadcastStatus === "live");
      if (live) return live;
    }
    // Native ranks already follow newest indexed block; do not invent a timestamp.
    return a.token.rank - b.token.rank || a.token.address.localeCompare(b.token.address);
  });
}

export function broadcastLabel(token: Launch) {
  if (token.broadcastStatus === "live") return "Live now";
  if (token.broadcastStatus === "offline") return "Offline · room open";
  if (token.broadcastStatus === "checking") return "Checking live status";
  return "Live status unavailable";
}
