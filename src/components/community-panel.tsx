"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEthereum, personalSignHex, shortAddress } from "@/lib/wallet";
import { OPEN_WALLET_EVENT, WALLET_CHANGED_EVENT, walletErrorMessage } from "@/lib/wallet-discovery";

type Message = { id: string; wallet: string; body: string; created_at: string };
type Community = { messages: Message[]; followers: number; following: boolean; wallet: string | null; checkedAt: string };

export function CommunityPanel({ roomId, creator }: { roomId: string; creator: string }) {
  const [state, setState] = useState<Community | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  const refresh = useCallback(async () => {
    if (pending.current || document.visibilityState === "hidden") return;
    pending.current = true;
    try {
      const response = await fetch(`/api/community?roomId=${encodeURIComponent(roomId)}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const data = await response.json() as Community & { error?: string };
      if (!response.ok || !Array.isArray(data.messages)) throw new Error(data.error || "Shared chat is unavailable.");
      if (active.current) { setState(data); setError(""); }
    } catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : "Shared chat is unavailable."); }
    finally { pending.current = false; }
  }, [roomId]);

  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    let provider = getEthereum();
    async function changedWallet() {
      await fetch("/api/community/session", { method: "DELETE" }).catch(() => undefined);
      if (active.current) setState((current) => current ? { ...current, wallet: null, following: false } : null);
      void refresh();
    }
    provider?.on?.("accountsChanged", changedWallet);
    function selectedWalletChanged() {
      provider?.removeListener?.("accountsChanged", changedWallet);
      provider = getEthereum(); provider?.on?.("accountsChanged", changedWallet);
      void changedWallet();
    }
    window.addEventListener(WALLET_CHANGED_EVENT, selectedWalletChanged);
    document.addEventListener("visibilitychange", refresh);
    return () => { active.current = false; window.clearInterval(timer); provider?.removeListener?.("accountsChanged", changedWallet); window.removeEventListener(WALLET_CHANGED_EVENT, selectedWalletChanged); document.removeEventListener("visibilitychange", refresh); };
  }, [refresh]);

  async function signIn() {
    const wallet = getEthereum();
    if (!wallet) { window.dispatchEvent(new Event(OPEN_WALLET_EVENT)); throw new Error("Choose a wallet to chat. Reading messages and watching need no wallet."); }
    const accounts = await wallet.request({ method: "eth_requestAccounts" }) as string[];
    if (!accounts[0]) throw new Error("No wallet account was returned.");
    const challenge = await fetch("/api/community/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: accounts[0] }) });
    const data = await challenge.json() as { message?: string; error?: string };
    if (!challenge.ok || !data.message) throw new Error(data.error || "Sign-in is unavailable.");
    const signature = await wallet.request({ method: "personal_sign", params: [personalSignHex(data.message), accounts[0]] });
    const verification = await fetch("/api/community/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature }) });
    const verified = await verification.json() as { error?: string; wallet?: string };
    if (!verification.ok || !verified.wallet) throw new Error(verified.error || "Wallet sign-in could not be verified.");
  }

  async function update(action: "message" | "follow" | "hide", extra: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (!state?.wallet) await signIn();
      const response = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, action, ...extra }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Update could not be saved.");
      if (action === "message") setText("");
      await refresh();
    } catch (failure) { setError(walletErrorMessage(failure)); }
    finally { setBusy(false); }
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
    {state?.wallet ? <p className="accounting-copy">Signed in as {shortAddress(state.wallet)} <button className="claim-link" disabled={busy} onClick={async () => { await fetch("/api/community/session", { method: "DELETE" }); await refresh(); }}>Sign out</button></p> : <p className="accounting-copy">One free wallet signature enables shared chat and follows. No transaction or token approval.</p>}
    <div className="chat-messages" role="log" aria-label="Shared room messages" aria-live="polite" aria-relevant="additions">
      {state && state.messages.length === 0 && <div className="chat-empty"><strong>No messages yet</strong><span>Be the first to say gm. Messages are shared with everyone in this room.</span></div>}
      {!state && <p className="accounting-copy">Loading shared messages…</p>}
      {state?.messages.map((message) => <div className="message" key={message.id}><span className="avatar" aria-hidden="true">◐</span><div><strong>{shortAddress(message.wallet)}{message.wallet.toLowerCase() === creator.toLowerCase() ? " · creator" : ""}</strong><p>{message.body}</p><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>{state.wallet && (state.wallet === message.wallet.toLowerCase() || state.wallet === creator.toLowerCase()) && <button className="claim-link" disabled={busy} onClick={() => void update("hide", { messageId: message.id })}>Hide message</button>}</div></div>)}
    </div>
    <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void update("message", { body: text.trim() }); }}><input aria-label="Shared room message" value={text} onChange={(event) => setText(event.target.value)} maxLength={280} disabled={busy || !state} placeholder="Say hello to the room" /><button aria-label="Send shared message" disabled={busy || !state || !text.trim()}>↑</button></form>
    {!state?.wallet && state && <button className="claim-link" disabled={busy} onClick={() => void authorize()}>{busy ? "Check your wallet…" : "Sign in to chat"}</button>}
    <span className="chat-footnote">Public, saved messages · your wallet address appears beside your messages. You and the creator can hide your messages.</span>
    {error && <p className="live-notice" role="alert">{error}</p>}
  </div>;
}
