"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useMediaLibrary } from "@/lib/use-media-library";
import { authorizeMedia, mediaAction } from "@/lib/media-client";
import { MEDIA_UPDATED_EVENT, mediaDuration, type MediaAsset } from "@/lib/media";
import { Modal } from "./modal";

export function RoomMediaLibrary({ roomId }: { roomId: string }) {
  const library = useMediaLibrary(roomId);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [publish, setPublish] = useState<MediaAsset | null>(null);
  async function update(action: "publish" | "hide", asset: MediaAsset) {
    if (busy) return; setBusy(true); setError("");
    try { await authorizeMedia(); await mediaAction(roomId, action, { id: asset.id }); window.dispatchEvent(new Event(MEDIA_UPDATED_EVENT)); await library.refresh(); setPublish(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The recording was not updated."); }
    finally { setBusy(false); }
  }
  return <section className="media-library" aria-label="Room replays and clips">
    <div className="panel-heading"><div><span className="eyebrow">WATCH AGAIN</span><h2>Replays & clips</h2></div>{Boolean(library.state?.assets.length) && <span>{library.state!.assets.length} {library.state!.assets.length === 1 ? "recording" : "recordings"}</span>}</div>
    <p className="accounting-copy">Published recordings are free to watch.</p>
    {!library.state && !library.error && <p role="status">Loading recordings…</p>}
    {library.error && <div className="live-notice" role="status"><p>{library.error}</p><button className="claim-link" type="button" onClick={() => void library.refresh()}>Retry video library</button></div>}
    {library.state && !library.state.assets.length && <div className="media-empty"><span aria-hidden="true">▷</span><h3>No recordings yet</h3><p>Replays and clips appear here when the creator publishes them.</p></div>}
    <div className="media-grid">{library.state?.assets.map(asset => <article className="media-card" key={asset.id}>
      <span className="media-kind">{asset.kind === "clip" ? "VIDEO / AUDIO CLIP" : "SAVED REPLAY"} · {mediaDuration(Number(asset.durationSeconds))}</span>
      <h3>{asset.title}</h3><p>{asset.published ? "Published by the creator" : "Private · creator review required"}</p><time dateTime={asset.createdAt}>{new Date(asset.createdAt).toLocaleDateString()}</time>
      <div className="media-actions"><Link className="secondary-button" href={`/room/${roomId}/recording/${asset.id}`}>{asset.published ? "Watch recording" : "Preview draft"} ↗</Link>
        {asset.manageable && (asset.published ? <button type="button" className="claim-link" disabled={busy} onClick={() => void update("hide", asset)}>Hide from HYPR</button> : <button type="button" className="claim-link" disabled={busy} onClick={() => setPublish(asset)}>Review & publish</button>)}
      </div>
    </article>)}</div>
    <details className="media-details"><summary>Recording info & private drafts</summary>
      <p className="accounting-copy">Recording is opt-in and starts as a private draft. Replays: up to 10 minutes / 40 MB. Clips: the next 30 seconds / 8 MB. Total storage: 256 MB. Keep HYPR open until the upload finishes.</p>
      <p className="accounting-copy">Hiding a recording removes HYPR access, but downloaded copies remain and an issued playback link can work for up to five minutes.</p>
      {library.state && !library.state.wallet && <button className="claim-link" type="button" disabled={busy} onClick={async () => { setBusy(true); try { await authorizeMedia(); await library.refresh(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Sign-in failed."); } finally { setBusy(false); } }}>Sign in to see private drafts</button>}
    </details>
    {error && <p role="alert" className="live-notice">{error}</p>}
    {publish && <Modal title="Publish this recording?" onClose={() => { if (!busy) setPublish(null); }}><p className="dialog-copy"><strong>{publish.title}</strong></p><p className="dialog-copy">Review the draft first. Publishing makes this recording watchable by anyone with its link, without a wallet. Only publish media you have rights to share. Downloaded copies cannot be recalled.</p><div className="dialog-actions"><Link className="secondary-button" href={`/room/${roomId}/recording/${publish.id}`}>Preview first</Link><button className="primary-button" disabled={busy} onClick={() => void update("publish", publish)}>{busy ? "Publishing…" : "Publish recording"}</button></div></Modal>}
  </section>;
}
