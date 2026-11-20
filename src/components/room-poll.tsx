"use client";
import React, { useState } from "react";

export type Poll = { id: string; question: string; options: string[]; counts: number[]; open: boolean; mine: number | null };

/** A quick room poll: creators ask, everyone taps. Results show live; it's for fun, not a vote that decides anything. */
export function RoomPoll({ roomId, poll, creatorView, viewer, onChanged }: { roomId: string; poll?: Poll | null; creatorView: boolean; viewer: string; onChanged: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [composing, setComposing] = useState(false);
  const [question, setQuestion] = useState(""), [options, setOptions] = useState(["", ""]);
  async function send(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/community/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, viewer, ...body }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Poll not updated.");
      await onChanged();
      return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Poll not updated."); return false; }
    finally { setBusy(false); }
  }
  const total = poll ? poll.counts.reduce((sum, value) => sum + value, 0) : 0;
  return <div className="room-poll">
    {poll && <>
      <div className="room-poll-head"><span className="eyebrow">{poll.open ? "LIVE POLL" : "POLL RESULTS"}</span><span>{total} vote{total === 1 ? "" : "s"}</span></div>
      <strong>{poll.question}</strong>
      <ul>{poll.options.map((option, index) => {
        const share = total ? Math.round(poll.counts[index] / total * 100) : 0;
        return <li key={option + index}><button type="button" disabled={busy || !poll.open} aria-pressed={poll.mine === index} onClick={() => void send({ action: "vote", pollId: poll.id, option: index })} style={{ "--share": `${share}%` } as React.CSSProperties}><span>{poll.mine === index ? "✓ " : ""}{option}</span><span>{share}%</span></button></li>;
      })}</ul>
      {creatorView && poll.open && <button type="button" className="claim-link" disabled={busy} onClick={() => void send({ action: "close" })}>End poll</button>}
    </>}
    {creatorView && !poll?.open && (composing ? <form className="room-poll-form" onSubmit={async event => { event.preventDefault(); if (await send({ action: "open", question, options })) { setComposing(false); setQuestion(""); setOptions(["", ""]); } }}>
      <input value={question} onChange={event => setQuestion(event.target.value)} maxLength={120} placeholder="Ask the room…" aria-label="Poll question" required />
      {options.map((option, index) => <input key={index} value={option} maxLength={40} placeholder={`Option ${index + 1}`} aria-label={`Option ${index + 1}`} onChange={event => setOptions(current => current.map((item, at) => at === index ? event.target.value : item))} required={index < 2} />)}
      <div className="room-poll-actions">{options.length < 4 && <button type="button" className="claim-link" onClick={() => setOptions(current => [...current, ""])}>+ Option</button>}<button type="button" className="claim-link" onClick={() => setComposing(false)}>Cancel</button><button className="primary-button" disabled={busy}>Start poll</button></div>
    </form> : <button type="button" className="secondary-button room-poll-start" onClick={() => setComposing(true)}>📊 Start a poll</button>)}
    {error && <p className="live-notice" role="alert">{error}</p>}
  </div>;
}
