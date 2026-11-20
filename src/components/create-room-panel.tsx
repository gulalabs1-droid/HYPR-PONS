"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { signInCommunity } from "@/lib/community-client";
import { walletErrorMessage } from "@/lib/wallet-discovery";
import { checkLaunchName } from "@/lib/launch-naming";

/** The fastest path to a show: a room with no coin, no transaction and no test ETH. */
export function CreateRoomPanel({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const check = checkLaunchName(name, "");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy || name.trim().length < 2 || check?.blocked) return;
    setBusy(true); setError("");
    try {
      await signInCommunity({ requireLiveHost: true });
      const response = await fetch("/api/community/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json() as { roomUrl?: string; error?: string };
      if (!response.ok || !data.roomUrl) throw new Error(data.error || "Your room couldn’t be created.");
      router.push(`${data.roomUrl}#creator-dashboard`);
    } catch (failure) { setError(walletErrorMessage(failure)); setBusy(false); }
  }
  return <section className={`create-room-panel${compact ? " is-compact" : ""}`} id="open-room" aria-labelledby="open-room-title">
    <div><span className="eyebrow">START HERE · NO COIN NEEDED</span><h2 id="open-room-title">Open your room in a minute.</h2>
      <p>Name it, sign in with your wallet (a free signature—no transaction or test ETH), and you’re ready to go live, schedule a show and invite people. You can add a coin later, or never.</p></div>
    <form onSubmit={create}>
      <label><span className="field-label">Room name</span><input value={name} onChange={event => setName(event.target.value)} maxLength={60} placeholder="e.g. Friday Night Hoops" autoComplete="off" disabled={busy} /></label>
      {check && <span className={`launch-name-check${check.blocked ? " is-blocked" : ""}`} role="status">{check.blocked ? check.message : "Test-style names are hidden from Explore—pick what you’d show your audience."}</span>}
      <button className="primary-button" disabled={busy || name.trim().length < 2 || Boolean(check?.blocked)}>{busy ? "Check your wallet…" : "Open my room →"}</button>
      {error && <span className="launch-status" role="alert">{error}</span>}
    </form>
  </section>;
}
