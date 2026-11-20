"use client";
import React, { useEffect, useState } from "react";
import { signInCommunity } from "@/lib/community-client";
import { walletErrorMessage } from "@/lib/wallet-discovery";

type Ingress = { serverUrl: string; streamKey: string };

/** Lets creators keep their usual streaming software (OBS, Streamlabs) and send it to HYPR too. */
export function ObsSetup({ roomId }: { roomId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null), [ingress, setIngress] = useState<Ingress | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [reveal, setReveal] = useState(false), [copied, setCopied] = useState("");
  useEffect(() => {
    fetch(`/api/community/live-ingress?roomId=${roomId}`, { cache: "no-store" }).then(response => response.json()).then((data: { enabled?: boolean; ingress?: Ingress | null }) => { setEnabled(Boolean(data.enabled)); setIngress(data.ingress || null); }).catch(() => setEnabled(false));
  }, [roomId]);
  async function create(reset: boolean) {
    if (reset && !window.confirm("Reset your stream key? OBS will stop working until you paste the new key.")) return;
    setBusy(true); setError("");
    try {
      await signInCommunity({ requireLiveHost: true });
      const response = await fetch("/api/community/live-ingress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, reset }) });
      const data = await response.json() as { ingress?: Ingress; error?: string };
      if (!response.ok || !data.ingress) throw new Error(data.error || "Stream key unavailable.");
      setIngress(data.ingress); setReveal(false);
    } catch (failure) { setError(walletErrorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function copy(label: string, value: string) { try { await navigator.clipboard.writeText(value); setCopied(label); } catch { setError("Copy failed—select the text instead."); } }
  if (enabled === null) return <p className="accounting-copy">Checking streaming options…</p>;
  if (!enabled) return <div className="growth-form"><div className="hub-form-head"><h3>Stream from OBS</h3><p>Streaming from OBS or Streamlabs isn’t switched on for HYPR yet. You can go live from your browser in the player’s studio.</p></div></div>;
  return <div className="growth-form obs-setup">
    <div className="hub-form-head"><h3>Stream from OBS or Streamlabs</h3><p>Keep your usual setup and scenes. Add HYPR as a custom RTMP destination—alongside Twitch or YouTube with a multistream plugin or service.</p></div>
    {!ingress ? <button type="button" className="primary-button" disabled={busy} onClick={() => void create(false)}>{busy ? "Check your wallet…" : "Get my stream key"}</button> : <>
      <label>Server<span className="obs-field"><code>{ingress.serverUrl}</code><button type="button" className="claim-link" onClick={() => void copy("server", ingress.serverUrl)}>{copied === "server" ? "Copied" : "Copy"}</button></span></label>
      <label>Stream key<span className="obs-field"><code>{reveal ? ingress.streamKey : "•".repeat(Math.min(24, ingress.streamKey.length))}</code><button type="button" className="claim-link" onClick={() => setReveal(value => !value)}>{reveal ? "Hide" : "Show"}</button><button type="button" className="claim-link" onClick={() => void copy("key", ingress.streamKey)}>{copied === "key" ? "Copied" : "Copy"}</button></span></label>
      <ol className="studio-steps"><li>In OBS: Settings → Stream → Service: Custom.</li><li>Paste the server and stream key, then Start Streaming.</li><li>Your room shows LIVE within a few seconds and followers get an alert.</li></ol>
      <p className="creator-fineprint">Keep the key private—anyone with it can stream into your room. Don’t also go live from the browser studio at the same time. <button type="button" className="claim-link" disabled={busy} onClick={() => void create(true)}>Reset key</button></p>
    </>}
    {error && <p role="alert" className="live-notice">{error}</p>}
  </div>;
}
