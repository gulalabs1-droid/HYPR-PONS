"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { COMMUNITY_UPDATED_EVENT, type GrowthState } from "./growth";
import { WALLET_CHANGED_EVENT } from "./wallet-discovery";
import { getEthereum } from "./wallet";
import { awaitCommunityReset, resetCommunitySession } from "./community-client";

export function useGrowth(roomId?: string) {
  const [state, setState] = useState<GrowthState | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true, pending = false;
    let controller: AbortController | undefined;
    async function load() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      const current = generation.current;
      const requestController = new AbortController(); controller = requestController;
      const timeout = window.setTimeout(() => requestController.abort(), 12000);
      try {
        await awaitCommunityReset();
        if (!active) return;
        const response = await fetch(`/api/community/growth${roomId ? `?roomId=${encodeURIComponent(roomId)}` : ""}`, { cache: "no-store", signal: requestController.signal });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.rooms)) throw new Error(data.error || "Shows are unavailable.");
        if (active && current === generation.current) { setState(data); setError(""); }
      } catch (failure) { if (active && current === generation.current) setError(failure instanceof Error ? failure.message : "Shows are unavailable."); }
      finally { pending = false; window.clearTimeout(timeout); }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    let provider = getEthereum();
    const changedAccount = () => {
      generation.current++; setState(null);
      void resetCommunitySession().then(refresh).catch(() => setError("Sign-out could not finish. Retry before using another wallet."));
    };
    const changed = () => { provider?.removeListener?.("accountsChanged", changedAccount); provider=getEthereum(); provider?.on?.("accountsChanged", changedAccount); changedAccount(); };
    provider?.on?.("accountsChanged", changedAccount);
    window.addEventListener(COMMUNITY_UPDATED_EVENT, refresh);
    window.addEventListener(WALLET_CHANGED_EVENT, changed);
    document.addEventListener("visibilitychange", load);
    return () => { active = false; controller?.abort(); provider?.removeListener?.("accountsChanged", changedAccount); window.clearInterval(timer); window.removeEventListener(COMMUNITY_UPDATED_EVENT, refresh); window.removeEventListener(WALLET_CHANGED_EVENT, changed); document.removeEventListener("visibilitychange", load); };
  }, [roomId, revision, refresh]);
  return { state, error, refresh };
}
