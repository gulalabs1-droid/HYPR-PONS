"use client";
import { useState } from "react";
import { signInCommunity } from "@/lib/community-client";
import { walletErrorMessage } from "@/lib/wallet-discovery";
import { Modal } from "./modal";
export function ReportContent({ roomId, messageId = null, onClose }: { roomId: string; messageId?: string | null; onClose: () => void }) {
  const [reason, setReason] = useState("spam"), [details, setDetails] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setNotice("");
    try { await signInCommunity(); const response = await fetch("/api/community/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, action: "report", payload: { reason, details, messageId } }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setNotice(messageId ? "Report saved for this room’s creator. HYPR does not promise immediate review or stream removal." : "Room report saved for the creator and, when configured, HYPR operators. This is not an emergency service."); }
    catch (failure) { setNotice(walletErrorMessage(failure)); } finally { setBusy(false); }
  }
  return <Modal title={messageId ? "Report a message" : "Report this room"} onClose={onClose}><form className="growth-form" onSubmit={event => { event.preventDefault(); void submit(); }}><p className="dialog-copy">{messageId ? "A free wallet sign-in is required to reduce spam. Message reports go to this room’s creator. For immediate danger, use local emergency services." : "A free wallet sign-in is required to reduce spam. Room reports go to the creator and, when a HYPR operator wallet is configured, to that independent inbox. This is not a takedown guarantee or emergency service."}</p><label>Reason<select value={reason} onChange={event => setReason(event.target.value)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="unsafe">Unsafe content</option><option value="copyright">Copyright</option><option value="other">Other</option></select></label><label>Details (optional)<textarea maxLength={500} value={details} onChange={event => setDetails(event.target.value)} /></label><button className="primary-button" disabled={busy}>{busy ? "Saving…" : messageId ? "Send to room creator" : "Send room report"}</button>{notice && <p role="status">{notice}</p>}</form></Modal>;
}
