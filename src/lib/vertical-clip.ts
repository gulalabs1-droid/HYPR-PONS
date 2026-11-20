"use client";

export const VERTICAL_MAX_SECONDS = 60;
const WIDTH = 720, HEIGHT = 1280;

export function verticalMime() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(type => MediaRecorder.isTypeSupported(type)) || null;
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/), lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

/**
 * Re-records a published clip as a 9:16 video for TikTok, Reels and Shorts:
 * the original centered over a blurred copy, with the room name and link on it.
 * Runs entirely in this browser in real time; nothing is uploaded.
 */
export async function exportVerticalClip({ src, title, link, onProgress, signal }: { src: string; title: string; link: string; onProgress?: (fraction: number) => void; signal?: AbortSignal }) {
  const mimeType = verticalMime();
  if (!mimeType || typeof document === "undefined") throw new Error("This browser can’t make vertical videos. Try current Chrome, Edge or Safari on a computer.");
  const video = document.createElement("video");
  video.crossOrigin = "anonymous"; video.src = src; video.playsInline = true; video.preload = "auto";
  await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("The clip couldn’t be loaded for export. Reload the page and try again.")); });
  if (!Number.isFinite(video.duration) || video.duration > VERTICAL_MAX_SECONDS + 1) throw new Error(`Vertical export works for videos up to ${VERTICAL_MAX_SECONDS} seconds.`);
  const canvas = document.createElement("canvas"); canvas.width = WIDTH; canvas.height = HEIGHT;
  const context = canvas.getContext("2d")!;
  const stream = canvas.captureStream(30);
  let audio: AudioContext | null = null;
  try {
    audio = new AudioContext();
    const source = audio.createMediaElementSource(video), destination = audio.createMediaStreamDestination();
    source.connect(destination);
    destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
  } catch { /* silent export if the browser blocks audio capture */ }
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  const finished = new Promise<Blob>(resolve => { recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(";")[0] })); });
  let frame = 0;
  const draw = () => {
    const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
    context.fillStyle = "#0b0c0e"; context.fillRect(0, 0, WIDTH, HEIGHT);
    // Blurred, zoomed backdrop fills the frame; the original sits centered on top.
    const cover = Math.max(WIDTH / vw, HEIGHT / vh);
    context.save(); context.filter = "blur(28px) brightness(.55)"; context.drawImage(video, (WIDTH - vw * cover) / 2, (HEIGHT - vh * cover) / 2, vw * cover, vh * cover); context.restore();
    const fit = Math.min(WIDTH / vw, (HEIGHT * .62) / vh), fw = vw * fit, fh = vh * fit, top = (HEIGHT - fh) / 2;
    context.drawImage(video, (WIDTH - fw) / 2, top, fw, fh);
    context.textAlign = "center"; context.fillStyle = "#fff"; context.font = "800 46px system-ui, sans-serif";
    wrapLines(context, title, WIDTH - 96).forEach((line, index) => context.fillText(line, WIDTH / 2, top - 70 + index * 54 - (wrapLines(context, title, WIDTH - 96).length - 1) * 54));
    context.fillStyle = "#c7f36b"; context.font = "700 30px system-ui, sans-serif"; context.fillText("Watch live on HYPR", WIDTH / 2, top + fh + 80);
    context.fillStyle = "rgba(255,255,255,.75)"; context.font = "500 24px system-ui, sans-serif"; context.fillText(link.replace(/^https?:\/\//, ""), WIDTH / 2, top + fh + 120);
    if (video.duration) onProgress?.(Math.min(1, video.currentTime / video.duration));
    if (!video.ended && !signal?.aborted) frame = requestAnimationFrame(draw);
  };
  const stop = () => { cancelAnimationFrame(frame); if (recorder.state !== "inactive") recorder.stop(); };
  signal?.addEventListener("abort", () => { video.pause(); stop(); }, { once: true });
  video.onended = stop;
  recorder.start(500);
  await video.play();
  draw();
  const blob = await finished;
  video.removeAttribute("src"); video.load();
  void audio?.close().catch(() => undefined);
  if (signal?.aborted) throw new Error("Export canceled.");
  return blob;
}
