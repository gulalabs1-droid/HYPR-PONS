"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MEDIA_UPDATED_EVENT, type MediaReservation } from "@/lib/media";
import { uploadCapturedMedia } from "@/lib/media-client";
import type { CapturedMedia } from "@/lib/browser-recording";

type Job = { roomId: string; reservation: MediaReservation; media: CapturedMedia; percent: number; status: "queued" | "uploading" | "saved" | "error"; error: string; download: string };
type Context = { available: boolean; canAccept: boolean; capturing: (active: boolean) => void; enqueue: (roomId: string, reservation: MediaReservation, media: CapturedMedia) => void };
const MediaUploads = createContext<Context>({ available: false, canAccept: false, capturing() {}, enqueue() {} });
export const useMediaUploads = () => useContext(MediaUploads);

export function MediaUploadProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]), [captures, setCaptures] = useState(0);
  const active = useRef(new Set<string>()), latest = useRef<Job[]>([]); latest.current = jobs;
  const capturing = useCallback((value: boolean) => setCaptures(count => Math.max(0, count + (value ? 1 : -1))), []);
  const enqueue = useCallback((roomId: string, reservation: MediaReservation, media: CapturedMedia) => {
    setJobs(current => current.some(job => job.reservation.id === reservation.id) ? current : [...current, { roomId, reservation, media, percent: 0, status: "queued", error: "", download: URL.createObjectURL(media.blob) }]);
  }, []);
  const change = useCallback((id: string, patch: Partial<Job>) => setJobs(current => current.map(job => job.reservation.id === id ? { ...job, ...patch } : job)), []);
  useEffect(() => {
    for (const job of jobs) {
      const id = job.reservation.id;
      if (job.status !== "queued" || active.current.has(id)) continue;
      active.current.add(id); change(id, { status: "uploading" });
      void uploadCapturedMedia(job.roomId, job.reservation, job.media, percent => change(id, { percent })).then(() => change(id, { status: "saved", percent: 100 }))
        .catch((failure: unknown) => change(id, { status: "error", error: failure instanceof Error ? failure.message : "Upload failed. Download a backup before closing this tab." }))
        .finally(() => active.current.delete(id));
    }
  }, [jobs, change]);
  useEffect(() => {
    if (!captures && !jobs.some(job => job.status !== "saved")) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [captures, jobs]);
  useEffect(() => () => { latest.current.forEach(job => URL.revokeObjectURL(job.download)); }, []);
  function dismiss(id: string) {
    const job = jobs.find(item => item.reservation.id === id); if (!job || job.status === "uploading" || job.status === "queued") return;
    URL.revokeObjectURL(job.download); setJobs(current => current.filter(item => item.reservation.id !== id));
  }
  return <MediaUploads.Provider value={{ available: true, canAccept: jobs.length + captures < 2, capturing, enqueue }}>
    {children}
    {jobs.length > 0 && <aside className="media-upload-tray" aria-label="Recording uploads" aria-live="polite">{jobs.map(job => <div className="media-upload-job" key={job.reservation.id}>
      <strong>{job.reservation.title}</strong><span>{job.status === "saved" ? "Private draft saved · creator review required" : job.status === "error" ? "Not saved to HYPR" : `Uploading ${job.percent}% · keep HYPR open`}</span>
      {(job.status === "uploading" || job.status === "queued") && <progress max={100} value={job.percent} aria-label={`Upload ${job.reservation.title}`} />}
      {job.error && <p role="alert">{job.error}</p>}
      <div className="media-actions"><a href={job.download} download={`HYPR-${job.reservation.kind}.${job.media.mime.endsWith("webm") ? "webm" : "mp4"}`}>Download backup</a>
        {job.status === "saved" && <Link href={`/room/${job.roomId}/recording/${job.reservation.id}`} onClick={() => window.dispatchEvent(new Event(MEDIA_UPDATED_EVENT))}>Preview draft</Link>}
        {job.status === "error" && <button type="button" onClick={() => change(job.reservation.id, { status: "queued", error: "" })}>Retry upload</button>}
        {(job.status === "saved" || job.status === "error") && <button type="button" onClick={() => dismiss(job.reservation.id)}>{job.status === "error" ? "Discard local backup" : "Dismiss"}</button>}
      </div>
    </div>)}</aside>}
  </MediaUploads.Provider>;
}
