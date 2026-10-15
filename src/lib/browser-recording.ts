import { MEDIA_LIMITS, mediaMime, type MediaKind } from "./media";

export type CapturedMedia = { blob: Blob; durationSeconds: number; mime: string };
export function recordingMime(hasVideo: boolean, supported = (type: string) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
  return (hasVideo ? ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"] : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]).find(supported) || null;
}
/** Records only already-published tracks supplied by the caller. Never requests devices or stops those source tracks. */
export function recordPublishedStream(stream: MediaStream, kind: MediaKind, options: {
  onState?: (seconds: number, bytes: number) => void;
  finalize?: (blob: Blob, milliseconds: number) => Promise<Blob>;
  Recorder?: typeof MediaRecorder;
} = {}) {
  const Recorder = options.Recorder || MediaRecorder;
  const tracks = stream.getTracks().filter(track => track.readyState === "live");
  if (!tracks.length) throw new Error("No published creator media is available to record.");
  const mime = recordingMime(tracks.some(track => track.kind === "video"), type => Recorder.isTypeSupported(type));
  if (!mime) throw new Error("Recording is not supported in this browser. Try a current Chrome, Edge or Safari browser.");
  const cleanMime = mediaMime(mime)!;
  const recorder = new Recorder(stream, { mimeType: mime, videoBitsPerSecond: 448000, audioBitsPerSecond: 48000 });
  const limit = MEDIA_LIMITS[kind], pieces: Blob[] = [];
  let bytes = 0, started = performance.now(), stopped = false, failure = "";
  let resolve: (value: CapturedMedia) => void = () => {}, reject: (error: Error) => void = () => {};
  const result = new Promise<CapturedMedia>((yes, no) => { resolve = yes; reject = no; });
  // Attach a rejection handler immediately; consumers can still await the original result.
  void result.catch(() => undefined);
  let timer: ReturnType<typeof setInterval>;
  function stop() {
    if (!stopped) { stopped = true; if (recorder.state !== "inactive") recorder.stop(); }
    return result;
  }
  function changed() { if (tracks.some(track => track.readyState !== "live")) void stop(); }
  recorder.ondataavailable = event => {
    if (!event.data.size) return;
    bytes += event.data.size;
    if (bytes > limit.bytes) { failure = "The recording exceeded its file-size limit and was not uploaded. Your broadcast continues."; pieces.length = 0; void stop(); return; }
    if (!failure) pieces.push(event.data);
  };
  recorder.onerror = () => { failure = "The browser could not finish this recording. Your broadcast is unchanged."; void stop(); };
  recorder.onstop = async () => {
    clearInterval(timer); tracks.forEach(track => track.removeEventListener("ended", changed));
    const milliseconds = Math.max(0, performance.now() - started);
    if (failure || bytes < 32 || milliseconds < 200 || milliseconds > (limit.seconds + 1) * 1000) { reject(new Error(failure || "The recording was too short or the browser paused it past its limit. Nothing was published.")); return; }
    try {
      let blob = new Blob(pieces, { type: cleanMime }); pieces.length = 0;
      if (cleanMime.endsWith("webm")) {
        const fix = options.finalize || (async (value: Blob, duration: number) => (await import("@fix-webm-duration/fix")).fixWebmDuration(value, duration, { logger: false }));
        blob = await fix(blob, milliseconds);
      }
      if (blob.size > limit.bytes) throw new Error("The final recording exceeded its size limit.");
      resolve({ blob, durationSeconds: milliseconds / 1000, mime: cleanMime });
    } catch { reject(new Error("The recording could not be finalized. Nothing was published.")); }
  };
  recorder.start(1000); started = performance.now();
  tracks.forEach(track => track.addEventListener("ended", changed));
  timer = setInterval(() => {
    const seconds = (performance.now() - started) / 1000;
    options.onState?.(seconds, bytes);
    if (seconds >= limit.seconds || tracks.some(track => track.readyState !== "live")) void stop();
  }, 250);
  return { stop, result };
}
