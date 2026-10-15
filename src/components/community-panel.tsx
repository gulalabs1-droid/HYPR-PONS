"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEthereum, shortAddress } from "@/lib/wallet";
import { WALLET_CHANGED_EVENT, walletErrorMessage } from "@/lib/wallet-discovery";
import { awaitCommunityReset, resetCommunitySession, signInCommunity } from "@/lib/community-client";
import { COMMUNITY_UPDATED_EVENT } from "@/lib/growth";
import { ReportContent } from "./report-content";
import { TokenArt } from "./token-art";
import { analyticsAllowed, shareAttribution } from "@/lib/pilot-analytics";
import { LIVE_CHAT_PING_EVENT, sendLiveSignal } from "@/lib/live-signals";

type Message = { id: string; wallet: string; body: string; created_at: string };
function timeAgo(iso: string, now: number) {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return "now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Community = { messages: Message[]; followers: number; following: boolean; wallet: string | null; checkedAt: string };

function speakerName(wallet: string, creator: string, creatorName?: string) {
  if (wallet.toLowerCase() !== creator.toLowerCase()) return shortAddress(wallet);
  return creatorName?.trim() || shortAddress(wallet);
}

export function CommunityPanel({ roomId, creator, creatorName, reportsEnabled = false }: { roomId: string; creator: string; creatorName?: string; reportsEnabled?: boolean }) {
  const [state, setState] = useState<Community | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null | undefined>();
  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const log = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const pending = useRef(false);
  const active = useRef(true);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (pending.current || document.visibilityState === "hidden") return;
    pending.current = true;
    const current = generation.current;
    try {
      await awaitCommunityReset();
      const response = await fetch(`/api/community?roomId=${encodeURIComponent(roomId)}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const data = await response.json() as Community & { error?: string };
      if (!response.ok || !Array.isArray(data.messages)) throw new Error(data.error || "Shared chat is unavailable.");
      if (active.current && generation.current===current) { setState(data); setError(""); }
    } catch (failure) { if (active.current && generation.current===current) setError(failure instanceof Error ? failure.message : "Shared chat is unavailable."); }
    finally { pending.current = false; }
  }, [roomId]);

  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8000);
    let provider = getEthereum();
    async function changedWallet() {
      generation.current++;
      if (active.current) setState((current) => current ? { ...current, wallet: null, following: false } : null);
      await resetCommunitySession().catch(() => { if(active.current) setError("Sign-out could not finish. Private actions remain locked until it succeeds."); });
      void refresh();
    }
    provider?.on?.("accountsChanged", changedWallet);
    function selectedWalletChanged() {
      provider?.removeListener?.("accountsChanged", changedWallet);
      provider = getEthereum(); provider?.on?.("accountsChanged", changedWallet);
      void changedWallet();
    }
    window.addEventListener(WALLET_CHANGED_EVENT, selectedWalletChanged);
    window.addEventListener(COMMUNITY_UPDATED_EVENT, refresh);
    function pinged(event: Event) { if ((event as CustomEvent<{ roomId?: string }>).detail?.roomId === roomId.toLowerCase()) void refresh(); }
    window.addEventListener(LIVE_CHAT_PING_EVENT, pinged);
    document.addEventListener("visibilitychange", refresh);
    return () => { active.current = false; window.clearInterval(timer); provider?.removeListener?.("accountsChanged", changedWallet); window.removeEventListener(WALLET_CHANGED_EVENT, selectedWalletChanged); window.removeEventListener(COMMUNITY_UPDATED_EVENT, refresh); window.removeEventListener(LIVE_CHAT_PING_EVENT, pinged); document.removeEventListener("visibilitychange", refresh); };
  }, [refresh, roomId]);

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const element = log.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [state?.messages.length, pendingBody]);

  async function signIn() {
    await signInCommunity();
  }

  async function update(action: "message" | "follow" | "hide", extra: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    const draft = action === "message" ? String(extra.body || "") : "";
    try {
      await awaitCommunityReset();
      if (!state?.wallet) await signIn();
      if (draft) { setPendingBody(draft); setText(""); pinned.current = true; }
      const response = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, action, ...extra, shareId: shareAttribution(), analyticsConsent: analyticsAllowed() }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Update could not be saved.");
      window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT));
      await refresh();
      if (action === "message") sendLiveSignal(roomId, { type: "chat" });
    } catch (failure) { if (draft) setText(draft); setError(walletErrorMessage(failure)); }
    finally { setBusy(false); setPendingBody(null); }
  }

  async function authorize() {
    setBusy(true); setError("");
    try { await signIn(); await refresh(); }
    catch (failure) { setError(walletErrorMessage(failure)); }
    finally { setBusy(false); }
  }

  return <div className="chat-panel">
    <div className="panel-heading"><div><span className="eyebrow">COMMUNITY · CHAT CONTINUES</span><h2>Room chat</h2></div><span className="chat-count">{state ? `${state.followers} follower${state.followers === 1 ? "" : "s"}` : "Checking…"}</span></div>
    <button className="secondary-button" disabled={busy || !state} aria-pressed={state?.following || false} onClick={() => void update("follow", { following: !state?.following })}>{state?.following ? "✓ Following" : "Follow room"}</button>
    {state?.wallet ? <p className="accounting-copy">Signed in as {shortAddress(state.wallet)} <button className="claim-link" disabled={busy} onClick={async () => { await fetch("/api/community/session", { method: "DELETE" }); await refresh(); }}>Sign out</button></p> : <p className="accounting-copy">One free wallet signature enables shared chat and follows. No transaction or token approval.</p>}
    <div className="chat-messages" ref={log} onScroll={(event) => { const element = event.currentTarget; pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }} role="log" aria-label="Shared room messages" aria-live="polite" aria-relevant="additions">
      {state && state.messages.length === 0 && <div className="chat-empty"><span aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></svg></span><strong>No messages yet</strong><span>Be the first to say gm. Messages are shared with everyone in this room.</span></div>}
      {!state && <p className="accounting-copy">Loading shared messages…</p>}
      {state?.messages.map((message) => <div className={`message${message.wallet.toLowerCase() === creator.toLowerCase() ? " is-creator" : ""}${state.wallet === message.wallet.toLowerCase() ? " is-mine" : ""}`} key={message.id}><span className="avatar" aria-hidden="true"><TokenArt seed={message.wallet} /></span><div><strong>{speakerName(message.wallet, creator, creatorName)}{message.wallet.toLowerCase() === creator.toLowerCase() ? " · creator" : ""}</strong><p>{message.body}</p><time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>{timeAgo(message.created_at, now)}</time>{state.wallet && (state.wallet === message.wallet.toLowerCase() || state.wallet === creator.toLowerCase()) && <button className="claim-link" disabled={busy} onClick={() => void update("hide", { messageId: message.id })}>Hide message</button>}{reportsEnabled && <button className="claim-link" onClick={() => setReport(message.id)}>Report message</button>}</div></div>)}
      {pendingBody && state?.wallet && <div className="message is-mine is-pending"><span className="avatar" aria-hidden="true"><TokenArt seed={state.wallet} /></span><div><strong>{speakerName(state.wallet, creator, creatorName)}</strong><p>{pendingBody}</p><time>Sending…</time></div></div>}
    </div>
    <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void update("message", { body: text.trim() }); }}><input aria-label="Shared room message" value={text} onChange={(event) => setText(event.target.value)} maxLength={280} disabled={busy || !state} placeholder="Say hello to the room" /><button aria-label="Send shared message" disabled={busy || !state || !text.trim()}>↑</button></form>
    {!state?.wallet && state && <button className="claim-link" disabled={busy} onClick={() => void authorize()}>{busy ? "Check your wallet…" : "Sign in to chat"}</button>}
    <span className="chat-footnote">Public, saved messages · the creator’s display name is shown when they have one; everyone else’s wallet address still appears. You and the creator can hide your messages.</span>
    {reportsEnabled && <button className="claim-link" onClick={() => setReport(null)}>Report this room to its creator</button>}
    {reportsEnabled && report !== undefined && <ReportContent roomId={roomId} messageId={report} onClose={() => setReport(undefined)} />}
    {error && <p className="live-notice" role="alert">{error}</p>}
  </div>;
}
