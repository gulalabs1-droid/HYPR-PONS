import assert from "node:assert/strict";
import { test } from "node:test";
import { MEDIA_LIMITS, mediaHeaderMatches, mediaMime, mediaDuration } from "../src/lib/media";
import { recordingMime, recordPublishedStream } from "../src/lib/browser-recording";

test("recording formats and file headers reject non-media and impossible options", () => {
  assert.equal(mediaMime("video/webm;codecs=vp8,opus"), "video/webm");
  for (const value of ["text/html", "image/svg+xml", "application/javascript", undefined]) assert.equal(mediaMime(value), null);
  assert.equal(mediaHeaderMatches(new Uint8Array([0x1a,0x45,0xdf,0xa3]), "video/webm"), true);
  assert.equal(mediaHeaderMatches(new TextEncoder().encode("<script>alert(1)</script>"), "video/mp4"), false);
  assert.equal(mediaHeaderMatches(new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109]), "video/mp4"), true);
  assert.equal(recordingMime(true, () => false), null);
  assert.equal(recordingMime(true, type => type === "video/mp4"), "video/mp4");
  assert.equal(mediaDuration(90), "1:30");
});

class FakeRecorder {
  static isTypeSupported(type: string) { return type.startsWith("video/webm"); }
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  static latest: FakeRecorder;
  constructor() { FakeRecorder.latest = this; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob([new Uint8Array(64)]) }); this.onstop?.(); }
}
test("recording never requests devices or stops the source; final flush is awaited exactly once", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "performance"); let now = 0, sourceStops = 0;
  Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => now } });
  const source = { kind: "video", readyState: "live", addEventListener() {}, removeEventListener() {}, stop() { sourceStops++; } };
  try {
    const capture = recordPublishedStream({ getTracks: () => [source] } as unknown as MediaStream, "clip", { Recorder: FakeRecorder as unknown as typeof MediaRecorder, finalize: async blob => blob });
    now = 1200;
    const result = await capture.stop();
    assert.equal(result.blob.size, 64); assert.equal(result.durationSeconds, 1.2); assert.equal(sourceStops, 0);
    assert.equal((await capture.stop()).blob, result.blob);
  } finally { if (original) Object.defineProperty(globalThis, "performance", original); }
});
test("oversized recording chunks are rejected without uploading or stopping the broadcast", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "performance"); let now = 0;
  Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => now } });
  try {
    const source = { kind: "video", readyState: "live", addEventListener() {}, removeEventListener() {} };
    const capture = recordPublishedStream({ getTracks: () => [source] } as unknown as MediaStream, "clip", { Recorder: FakeRecorder as unknown as typeof MediaRecorder, finalize: async blob => blob });
    now = 1000;
    FakeRecorder.latest.ondataavailable?.({ data: new Blob([new Uint8Array(MEDIA_LIMITS.clip.bytes + 1)]) });
    await assert.rejects(capture.result, /file-size limit/);
  } finally { if (original) Object.defineProperty(globalThis, "performance", original); }
});

test("device shutdown waits for raw flush, not a slow metadata download or finalizer", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis,"performance"); let now=0, finish:(blob:Blob)=>void=()=>{}; let raw:Blob|undefined;
  Object.defineProperty(globalThis,"performance",{configurable:true,value:{now:()=>now}});
  try {
    const source={kind:"video",readyState:"live",addEventListener(){},removeEventListener(){}};
    const capture=recordPublishedStream({getTracks:()=>[source]} as unknown as MediaStream,"replay",{Recorder:FakeRecorder as unknown as typeof MediaRecorder,finalize:blob=>{raw=blob;return new Promise<Blob>(resolve=>{finish=resolve;});}});
    now=1200;const result=capture.stop();await capture.flushed;
    assert.ok(raw,"raw media is flushed even though finalization is still pending");
    finish(raw!);assert.equal((await result).durationSeconds,1.2);
  } finally {if(original)Object.defineProperty(globalThis,"performance",original);}
});
