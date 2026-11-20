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
import { RoomPoll, type Poll } from "./room-poll";

// Q&A without a new schema: a question is a chat message with this prefix.
const QUESTION_PREFIX = "Q: ";
const isQuestion = (body: string) => body.startsWith(QUESTION_PREFIX);

type Message = { id: string; wallet: string | null; guest?: string | null; body: string; created_at: string };
type ChatSettings = { guestsAllowed: boolean; slowMode: number };
const SLOW_MODES = [0, 5, 15, 30, 60];
const PRESENCE_MS = 25000;
function tabViewerId() {
  try {
    const existing = window.sessionStorage.getItem("hypr-viewer");
    if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
    const created = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
    window.sessionStorage.setItem("hypr-viewer", created);
    return created;
  } catch { return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join(""); }
}
function timeAgo(iso: string, now: number) {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return "now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Community = { messages: Message[]; followers: number; following: boolean; wallet: string | null; guest?: { name: string } | null; checkedAt: string; hasMore?: boolean; pinned?: Message | null; settings?: ChatSettings; here?: number; poll?: Poll | null };

function speakerName(message: Pick<Message, "wallet" | "guest">, creator: string, creatorName?: string) {
  if (!message.wallet) return message.guest || "Guest";
  if (message.wallet.toLowerCase() !== creator.toLowerCase()) return shortAddress(message.wallet);
  return creatorName?.trim() || shortAddress(message.wallet);
}
const isCreator = (message: Pick<Message, "wallet">, creator: string) => message.wallet?.toLowerCase() === creator.toLowerCase();

export function CommunityPanel({ roomId, creator, creatorName, reportsEnabled = false, chatActive = true }: { roomId: string; creator: string; creatorName?: string; reportsEnabled?: boolean; chatActive?: boolean }) {
  const [state, setState] = useState<Community | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null | undefined>();
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);
  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [nickname, setNickname] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [here, setHere] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const [questionsOnly, setQuestionsOnly] = useState(false);
  const viewerId = useRef("");
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
      if (!viewerId.current) viewerId.current = tabViewerId();
      const response = await fetch(`/api/community?roomId=${encodeURIComponent(roomId)}&viewer=${viewerId.current}&limit=${before ? 50 : historyLimit.current}${before ? `&before=${encodeURIComponent(before)}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
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
    // Anonymous "here now": a random per-tab ID, hashed on the server and kept for minutes.
    let live = true;
    const viewer = viewerId.current || (viewerId.current = tabViewerId());
    async function beat() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/community/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, viewer }), signal: AbortSignal.timeout(8000) });
        const data = await response.json() as { here?: number | null };
        if (live && response.ok && typeof data.here === "number") setHere(data.here);
      } catch { /* presence is decorative; chat keeps working */ }
    }
    void beat();
    const timer = window.setInterval(() => void beat(), PRESENCE_MS);
    document.addEventListener("visibilitychange", beat);
    return () => { live = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", beat); };
  }, [roomId]);
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

  const guestsAllowed = state?.settings?.guestsAllowed !== false;
  const guestName = state?.guest?.name || "";
  const asGuest = Boolean(state && !state.wallet && guestsAllowed);
  const needsNickname = asGuest && (!guestName || editingName);

  async function sendGuest(body: string) {
    if (busy) return;
    const chosen = needsNickname ? nickname.trim() : guestName;
    if (!chosen) { setError("Choose a nickname to chat."); return; }
    setBusy(true); setError(""); setPendingBody(body); setText(""); pinned.current = true;
    try {
      const response = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, action: "guest-message", body, guestName: chosen }) });
      const result = await response.json() as { error?: string; needsName?: boolean };
      if (!response.ok) { if (result.needsName) setEditingName(true); throw new Error(result.error || "Message not sent."); }
      setEditingName(false);
      await refresh();
      sendLiveSignal(roomId, { type: "chat" });
    } catch (failure) { setText(body); setError(failure instanceof Error ? failure.message : "Message not sent."); }
    finally { setBusy(false); setPendingBody(null); }
  }

  async function saveSettings(next: ChatSettings) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, action: "settings", ...next }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Chat settings not saved.");
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Chat settings not saved."); }
    finally { setBusy(false); }
  }

  async function update(action: "message" | "follow" | "hide" | "pin" | "unpin", extra: Record<string, unknown>) {
    if (busy) return;
    if (action === "message" && asGuest) return sendGuest(String(extra.body || ""));
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
    <div className="panel-heading"><div><span className="eyebrow">COMMUNITY</span><h2>Room chat</h2></div>{here !== null && here >= 2 && <span className="chat-here" aria-label={`${here} people here now`}><span className="status-dot" aria-hidden="true" />{here} here now</span>}</div>
    {state?.settings && state.settings.slowMode > 0 && <p className="chat-slow-mode">Slow mode · one message every {state.settings.slowMode}s</p>}
    {!state?.wallet && asGuest && guestName && !editingName ? <p className="accounting-copy">Chatting as <strong>{guestName}</strong> <button className="claim-link" disabled={busy} onClick={() => { setNickname(guestName); setEditingName(true); }}>Change</button></p> : null}
    {state?.wallet ? <p className="accounting-copy">Signed in as {shortAddress(state.wallet)} <button className="claim-link" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await resetCommunitySession(); window.dispatchEvent(new Event(COMMUNITY_UPDATED_EVENT)); await refresh(); } catch { setError("Sign-out could not finish. Try again before switching accounts."); } finally { setBusy(false); } }}>Sign out</button></p> : !asGuest && state ? <p className="accounting-copy">The creator limited chat to signed-in members.</p> : null}
    {state && (state.poll || state.wallet === creator.toLowerCase()) && <RoomPoll roomId={roomId} poll={state.poll} creatorView={state.wallet === creator.toLowerCase()} viewer={viewerId.current} onChanged={() => refresh()} />}
    {state?.wallet === creator.toLowerCase() && state.messages.some(message => isQuestion(message.body)) && <button type="button" className={`chat-questions-filter${questionsOnly ? " is-on" : ""}`} aria-pressed={questionsOnly} onClick={() => setQuestionsOnly(value => !value)}>❓ Questions ({state.messages.filter(message => isQuestion(message.body)).length}){questionsOnly ? " · show all" : ""}</button>}
    <div className="chat-messages" ref={log} onScroll={(event) => { const element = event.currentTarget; pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }} role="log" aria-label="Shared room messages" aria-live="polite" aria-relevant="additions">
      {state?.hasMore && (historyLimit.current < 500 ? <button type="button" className="claim-link" disabled={busy} onClick={() => void refresh(state.messages[0]?.id)}>Load earlier messages</button> : <p className="accounting-copy">Showing up to 500 recent messages.</p>)}
      {state?.pinned && <div className="message is-pinned"><span className="avatar" aria-hidden="true"><TokenArt seed={state.pinned.wallet || `guest:${state.pinned.guest}`} /></span><div className="message-bubble"><div className="message-heading"><strong>{speakerName(state.pinned, creator, creatorName)}</strong><span className="message-role">Pinned</span>{state.wallet === creator.toLowerCase() && <button className="message-unpin" type="button" disabled={busy} onClick={() => void update("unpin", {})}>Unpin</button>}</div><p>{state.pinned.body}</p></div></div>}
      {state && state.messages.length === 0 && <div className="chat-empty"><span aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></svg></span><strong>No messages yet</strong><span>Say hello—no wallet needed.</span></div>}
      {!state && <p className="accounting-copy">Loading shared messages…</p>}
      {state?.messages.filter(message => !questionsOnly || isQuestion(message.body)).map((message) => {
        const creatorMessage = isCreator(message, creator);
        const ownMessage = Boolean(message.wallet && state.wallet === message.wallet.toLowerCase());
        const creatorView = state.wallet === creator.toLowerCase();
        const canHide = Boolean(state.wallet && (ownMessage || creatorView));
        const hasOptions = canHide || creatorView || reportsEnabled;
        const isOpen = openMessageId === message.id;
        const name = speakerName(message, creator, creatorName);
        const actionsId = `chat-actions-${message.id}`;
        return <div className={`message${creatorMessage ? " is-creator" : ""}${ownMessage ? " is-mine" : ""}`} key={message.id}>
          <span className="avatar" aria-hidden="true"><TokenArt seed={message.wallet || `guest:${message.guest}`} /></span>
          <div className="message-bubble" ref={isOpen ? openMessage : undefined}>
            <div className="message-heading"><strong title={name}>{name}</strong>{creatorMessage && <span className="message-role">Creator</span>}{!message.wallet && <span className="message-role is-guest">Guest</span>}{isQuestion(message.body) && <span className="message-role is-question">Question</span>}<time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>{timeAgo(message.created_at, now)}</time>{hasOptions && <button type="button" className="message-more" aria-label={`Message options for ${name}`} aria-expanded={isOpen} aria-controls={isOpen ? actionsId : undefined} onClick={() => setOpenMessageId(current => current === message.id ? null : message.id)}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>}</div>
            <p>{isQuestion(message.body) ? message.body.slice(QUESTION_PREFIX.length) : message.body}</p>
            {isOpen && <div className="message-actions" id={actionsId}>{canHide && <button type="button" disabled={busy} onClick={() => { setOpenMessageId(null); void update("hide", { messageId: message.id }); }}>{creatorView && isQuestion(message.body) ? "Mark answered" : "Hide message"}</button>}{creatorView && <button type="button" disabled={busy} onClick={() => { setOpenMessageId(null); void update("pin", { messageId: message.id }); }}>{isQuestion(message.body) ? "Spotlight" : "Pin"}</button>}{reportsEnabled && <button type="button" onClick={() => { setOpenMessageId(null); setReport(message.id); }}>Report</button>}</div>}
          </div>
        </div>;
      })}
      {pendingBody && (state?.wallet || asGuest) && <div className="message is-mine is-pending"><span className="avatar" aria-hidden="true"><TokenArt seed={state?.wallet || `guest:${guestName || nickname}`} /></span><div className="message-bubble"><div className="message-heading"><strong>{state?.wallet ? speakerName({ wallet: state.wallet }, creator, creatorName) : guestName || nickname}</strong><time>Sending…</time></div><p>{pendingBody}</p></div></div>}
    </div>
    {needsNickname && <label className="chat-nickname"><span>Your nickname</span><input value={nickname} onChange={event => setNickname(event.target.value)} maxLength={24} placeholder="e.g. Sam" autoComplete="nickname" disabled={busy} /></label>}
    <form className="chat-form" onSubmit={(event) => { event.preventDefault(); const body = text.trim(); void update("message", { body: asking && !isQuestion(body) ? `${QUESTION_PREFIX}${body}`.slice(0, 280) : body }); setAsking(false); }}><button type="button" className={`chat-ask${asking ? " is-on" : ""}`} aria-pressed={asking} aria-label="Send as a question for the creator" title="Ask the creator a question" disabled={busy || !state} onClick={() => setAsking(value => !value)}>❓</button><input aria-label="Shared room message" value={text} onChange={(event) => setText(event.target.value)} maxLength={280} disabled={busy || !state || (!state.wallet && !guestsAllowed)} placeholder={state && !state.wallet && !guestsAllowed ? "Sign in to chat in this room" : asking ? "Ask the creator a question" : "Say hello to the room"} /><button aria-label="Send shared message" disabled={busy || !state || !text.trim() || (needsNickname && nickname.trim().length < 2) || (!state.wallet && !guestsAllowed)}>↑</button></form>
    {!state?.wallet && state && <button className="claim-link" disabled={busy} onClick={() => void authorize()}>{busy ? "Check your wallet…" : asGuest ? "Or sign in with a wallet" : "Sign in to chat"}</button>}
    {state?.wallet && state.wallet === creator.toLowerCase() && state.settings && <div className="chat-settings" aria-label="Chat settings">
      <label><input type="checkbox" checked={state.settings.guestsAllowed} disabled={busy} onChange={event => void saveSettings({ ...state.settings!, guestsAllowed: event.target.checked })} /> Allow guest chat</label>
      <label>Slow mode <select value={state.settings.slowMode} disabled={busy} onChange={event => void saveSettings({ ...state.settings!, slowMode: Number(event.target.value) })}>{SLOW_MODES.map(value => <option key={value} value={value}>{value ? `${value}s` : "Off"}</option>)}</select></label>
    </div>}
    <span className="chat-footnote">Messages are public and saved.{state?.wallet ? " Your wallet address may be visible." : ""}</span>
    {reportsEnabled && <button className="claim-link" onClick={() => setReport(null)}>Report this room</button>}
    {reportsEnabled && report !== undefined && <ReportContent roomId={roomId} messageId={report} onClose={() => setReport(undefined)} />}
    {error && <p className="live-notice" role="alert">{error}</p>}
  </div>;
}
