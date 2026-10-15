"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MEDIA_UPDATED_EVENT, type MediaLibrary } from "./media";
import { COMMUNITY_UPDATED_EVENT } from "./growth";
import { awaitCommunityReset, resetCommunitySession } from "./community-client";
import { subscribeMediaWalletChange } from "./media-client";
export function useMediaLibrary(roomId: string) {
  const [state, setState] = useState<MediaLibrary | null>(null), [error, setError] = useState("");
  const active = useRef(true), pending = useRef(false), generation = useRef(0);
  const refresh = useCallback(async () => {
    if (pending.current || document.visibilityState === "hidden") return;
    pending.current = true; const current = generation.current;
    try {
      await awaitCommunityReset();
      const response = await fetch(`/api/media?roomId=${encodeURIComponent(roomId)}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.assets)) throw new Error(data.error || "Video library unavailable.");
      if (active.current && current === generation.current) { setState(data); setError(""); }
    } catch (failure) {
      if (active.current && current === generation.current) { setState(null); setError(failure instanceof Error ? failure.message : "Video library unavailable."); }
    } finally { pending.current = false; }
  }, [roomId]);
  useEffect(() => {
    const counter = generation;
    active.current = true; setState(null); void refresh();
    const reload = () => void refresh();
    const changed = () => {
      generation.current++; setState(null);
      void resetCommunitySession().then(refresh).catch(() => setError("Wallet sign-out did not finish. Private recording controls remain locked."));
    };
    const timer = window.setInterval(reload, 10000);
    const unsubscribe = subscribeMediaWalletChange(changed);
    window.addEventListener(MEDIA_UPDATED_EVENT, reload); window.addEventListener(COMMUNITY_UPDATED_EVENT, reload); document.addEventListener("visibilitychange", reload);
    return () => { active.current = false; counter.current++; window.clearInterval(timer); unsubscribe(); window.removeEventListener(MEDIA_UPDATED_EVENT, reload); window.removeEventListener(COMMUNITY_UPDATED_EVENT, reload); document.removeEventListener("visibilitychange", reload); };
  }, [refresh]);
  return { state, error, refresh };
}
