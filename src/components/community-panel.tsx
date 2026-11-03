"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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

type Community = { messages: Message[]; followers: number; following: boolean; wallet: string | null; checkedAt: string; hasMore?: boolean; pinned?: Message | null };

function speakerName(wallet: string, creator: string, creatorName?: string) {
  if (wallet.toLowerCase() !== creator.toLowerCase()) return shortAddress(wallet);
  return creatorName?.trim() || shortAddress(wallet);
}

export function CommunityPanel({ roomId, creator, creatorName, reportsEnabled = false, chatActive = true }: { roomId: string; creator: string; creatorName?: string; reportsEnabled?: boolean; chatActive?: boolean }) {
  const [state, setState] = useState<Community | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null | undefined>();
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);
  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const log = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const historyLimit = useRef(50);
  const pending = useRef(false);
  const active = useRef(true);
  const generation = useRef(0);
  const openMessage = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async (before?: string) => {
    if (pending.current || document.visibilityState === "hidden") return;
    pending.current = true;
    const current = generation.current;
    try {
      await awaitCommunityReset();
      const response = await fetch(`/api/community?roomId=${encodeURIComponent(roomId)}&limit=${before ? 50 : historyLimit.current}${before ? `&before=${encodeURIComponent(before)}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const data = await response.json() as Community & { error?: string };
      if (!response.ok || !Array.isArray(data.messages)) throw new Error(data.error || "Shared chat is unavailable.");
      if (active.current && generation.current===current) {
        setState(existing => {
          if (before && existing) {
            historyLimit.current = Math.min(500, historyLimit.current + 50);
            pinned.current = false;
            return { ...data, messages: [...data.messages, ...existing.messages.filter(message => !data.messages.some(item => item.id === message.id))], hasMore: data.hasMore };
          }
          return data;
        });
        setError("");
      }
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
    const reload = () => void refresh();
    window.addEventListener(COMMUNITY_UPDATED_EVENT, reload);
    function pinged(event: Event) { if ((event as CustomEvent<{ roomId?: string }>).detail?.roomId === roomId.toLowerCase()) void refresh(); }
    window.addEventListener(LIVE_CHAT_PING_EVENT, pinged);
    document.addEventListener("visibilitychange", reload);
    return () => { active.current = false; window.clearInterval(timer); provider?.removeListener?.("accountsChanged", changedWallet); window.removeEventListener(WALLET_CHANGED_EVENT, selectedWalletChanged); window.removeEventListener(COMMUNITY_UPDATED_EVENT, reload); window.removeEventListener(LIVE_CHAT_PING_EVENT, pinged); document.removeEventListener("visibilitychange", reload); };
  }, [refresh, roomId]);

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!openMessageId) return;
    const element = log.current;
    const actions = openMessage.current?.querySelector<HTMLElement>(".message-actions");
    if (element && actions) {
      const viewport = element.getBoundingClientRect(), menu = actions.getBoundingClientRect();
      if (menu.bottom > viewport.bottom) element.scrollTop += menu.bottom - viewport.bottom + 8;
      else if (menu.top < viewport.top) element.scrollTop -= viewport.top - menu.top + 8;
    }
    function closeOutside(event: PointerEvent) { if (!openMessage.current?.contains(event.target as Node)) setOpenMessageId(null); }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      openMessage.current?.querySelector<HTMLButtonElement>(".message-more")?.focus();
      setOpenMessageId(null);
    }
    document.addEventListener("pointerdown", closeOutside); document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [openMessageId]);
  useEffect(() => {
    const element = log.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [state?.messages.length, pendingBody]);
  useEffect(() => {
    if (chatActive && log.current && pinned.current) log.current.scrollTop = log.current.scrollHeight;
  }, [chatActive]);
  useEffect(() => {
    const element = log.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { if (pinned.current) element.scrollTop = element.scrollHeight; });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  async function signIn() {
    await signInCommunity();
  }

  async function update(action: "message" | "follow" | "hide" | "pin" | "unpin", extra: Record<string, unknown>) {
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
    <div className="panel-heading"><div><span className="eyebrow">COMMUNITY</span><h2>Room chat</h2></div><span className="chat-count">{state ? `${state.followers} follower${state.followers === 1 ? "" : "s"}` : "Checking…"}</span></div>
    <button className="secondary-button" disabled={busy || !state} aria-pressed={state?.following || false} onClick={() => void update("follow", { following: !state?.following })}>{state?.following ? "✓ Following" : "Follow room"}</button>
    {state?.wallet ? <p className="accounting-copy">Signed in as {shortAddress(state.wallet)} <button className="claim-link" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await resetCommunitySession(); window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT)); await refresh(); } catch { setError("Sign-out could not finish. Try again before switching accounts."); } finally { setBusy(false); } }}>Sign out</button></p> : <p className="accounting-copy">Free wallet sign-in for chat and follows · up to 2 hours.</p>}
    <div className="chat-messages" ref={log} onScroll={(event) => { const element = event.currentTarget; pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }} role="log" aria-label="Shared room messages" aria-live="polite" aria-relevant="additions">
      {state?.hasMore && (historyLimit.current < 500 ? <button type="button" className="claim-link" disabled={busy} onClick={() => void refresh(state.messages[0]?.id)}>Load earlier messages</button> : <p className="accounting-copy">Showing up to 500 recent messages.</p>)}
      {state?.pinned && <div className="message is-pinned"><span className="avatar" aria-hidden="true"><TokenArt seed={state.pinned.wallet} /></span><div className="message-bubble"><div className="message-heading"><strong>{speakerName(state.pinned.wallet, creator, creatorName)}</strong><span className="message-role">Pinned</span>{state.wallet === creator.toLowerCase() && <button className="message-unpin" type="button" disabled={busy} onClick={() => void update("unpin", {})}>Unpin</button>}</div><p>{state.pinned.body}</p></div></div>}
      {state && state.messages.length === 0 && <div className="chat-empty"><span aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></svg></span><strong>No messages yet</strong><span>Say hello to start the conversation.</span></div>}
      {!state && <p className="accounting-copy">Loading shared messages…</p>}
      {state?.messages.map((message) => {
        const creatorMessage = message.wallet.toLowerCase() === creator.toLowerCase();
        const ownMessage = state.wallet === message.wallet.toLowerCase();
        const creatorView = state.wallet === creator.toLowerCase();
        const canHide = Boolean(state.wallet && (ownMessage || creatorView));
        const hasOptions = canHide || creatorView || reportsEnabled;
        const isOpen = openMessageId === message.id;
        const name = speakerName(message.wallet, creator, creatorName);
        const actionsId = `chat-actions-${message.id}`;
        return <div className={`message${creatorMessage ? " is-creator" : ""}${ownMessage ? " is-mine" : ""}`} key={message.id}>
          <span className="avatar" aria-hidden="true"><TokenArt seed={message.wallet} /></span>
          <div className="message-bubble" ref={isOpen ? openMessage : undefined}>
            <div className="message-heading"><strong title={name}>{name}</strong>{creatorMessage && <span className="message-role">Creator</span>}<time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>{timeAgo(message.created_at, now)}</time>{hasOptions && <button type="button" className="message-more" aria-label={`Message options for ${name}`} aria-expanded={isOpen} aria-controls={isOpen ? actionsId : undefined} onClick={() => setOpenMessageId(current => current === message.id ? null : message.id)}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>}</div>
            <p>{message.body}</p>
            {isOpen && <div className="message-actions" id={actionsId}>{canHide && <button type="button" disabled={busy} onClick={() => { setOpenMessageId(null); void update("hide", { messageId: message.id }); }}>Hide message</button>}{creatorView && <button type="button" disabled={busy} onClick={() => { setOpenMessageId(null); void update("pin", { messageId: message.id }); }}>Pin</button>}{reportsEnabled && <button type="button" onClick={() => { setOpenMessageId(null); setReport(message.id); }}>Report</button>}</div>}
          </div>
        </div>;
      })}
      {pendingBody && state?.wallet && <div className="message is-mine is-pending"><span className="avatar" aria-hidden="true"><TokenArt seed={state.wallet} /></span><div className="message-bubble"><div className="message-heading"><strong>{speakerName(state.wallet, creator, creatorName)}</strong><time>Sending…</time></div><p>{pendingBody}</p></div></div>}
    </div>
    <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void update("message", { body: text.trim() }); }}><input aria-label="Shared room message" value={text} onChange={(event) => setText(event.target.value)} maxLength={280} disabled={busy || !state} placeholder="Say hello to the room" /><button aria-label="Send shared message" disabled={busy || !state || !text.trim()}>↑</button></form>
    {!state?.wallet && state && <button className="claim-link" disabled={busy} onClick={() => void authorize()}>{busy ? "Check your wallet…" : "Sign in to chat"}</button>}
    <span className="chat-footnote">Messages are public and saved. Your wallet address may be visible.</span>
    {reportsEnabled && <button className="claim-link" onClick={() => setReport(null)}>Report this room</button>}
    {reportsEnabled && report !== undefined && <ReportContent roomId={roomId} messageId={report} onClose={() => setReport(undefined)} />}
    {error && <p className="live-notice" role="alert">{error}</p>}
  </div>;
}
