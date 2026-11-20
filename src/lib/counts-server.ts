import { after } from "next/server";
import { getSupabaseAdminClient } from "./supabase/server";
import { getHyprNetwork, HYPR_NETWORKS } from "./integrations/hypr/constants";
import { permitsPilotRequest } from "./pilot-analytics-server";

export const CLIENT_COUNT_EVENTS = ["room_view", "play_start", "watch_30s", "follow", "share", "alert_on"] as const;
export type CountEvent = typeof CLIENT_COUNT_EVENTS[number] | "chat_message" | "guest_message" | "poll_vote";

function later(task: () => Promise<unknown>) {
  const run = () => task().then(() => undefined, () => undefined);
  try { after(run); } catch { void run(); }
}

/** Adds one to today's anonymous total. Bots and Do Not Track / GPC requests are skipped. */
export function countEvent(request: Request | null, roomId: string, event: CountEvent) {
  if (request && !permitsPilotRequest(request)) return;
  const client = getSupabaseAdminClient();
  if (!client || !/^0x[a-fA-F0-9]{40}$/.test(roomId)) return;
  later(() => client.rpc("hypr_count_event", { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_token_address: roomId, p_event: event }));
}

export function recordPeak(roomId: string, broadcastRef: string, viewers: number) {
  const client = getSupabaseAdminClient();
  if (!client || !broadcastRef || !Number.isInteger(viewers)) return;
  later(() => client.rpc("hypr_record_peak", { p_chain_id: HYPR_NETWORKS[getHyprNetwork()].id, p_token_address: roomId, p_broadcast_ref: broadcastRef.slice(0, 100), p_viewers: viewers }));
}
