import type { BroadcastPhase } from "./broadcast-lifecycle";
import type { Launch } from "./types";

export const TESTNET_DEMO_ROOM = "0xea3b5d2cf6eacd3dd6241736082b7698e519a675";

/** An outside feed is an optional feature of our own real testnet demo only. */
export function isTestnetDemoRoom(token: Pick<Launch, "address" | "origin" | "dataStatus">) {
  return process.env.NEXT_PUBLIC_HYPR_NETWORK !== "mainnet" && token.origin === "hypr" && token.dataStatus !== "demo" && token.address.toLowerCase() === TESTNET_DEMO_ROOM;
}

export function showDemoNews(token: Pick<Launch, "address" | "origin" | "dataStatus">, phase: BroadcastPhase) {
  return isTestnetDemoRoom(token) && (phase === "offline" || phase === "stopped" || phase === "ended");
}
