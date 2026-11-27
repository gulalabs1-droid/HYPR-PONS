// Renders a film frame by frame and muxes the score: node render.mjs <story> <v|h> <out.mp4> <score.wav> [fps]
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const [story, format, out, audio, fpsArg] = process.argv.slice(2);
const fps = Number(fpsArg || 30);
const size = format === "h" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: size });
page.on("pageerror", e => { console.error("page error:", e.message); process.exitCode = 1; });
await page.goto(`${pathToFileURL(path.resolve("engine.html"))}?story=${story}&format=${format}`);
await page.waitForFunction(() => window.READY === true, null, { timeout: 30000 });
const duration = await page.evaluate(() => window.STORY.duration);
const frames = Math.round(duration * fps);

const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
  "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
  "-i", audio, "-map", "0:v", "-map", "1:a",
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high", "-tune", "film",
  "-c:a", "aac", "-b:a", "192k", "-af", "loudnorm=I=-15:TP=-1.5:LRA=11", "-ar", "48000",
  "-movflags", "+faststart", "-shortest", out], { stdio: ["pipe", "inherit", "inherit"] });
const done = new Promise((resolve, reject) => ff.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));

const started = Date.now();
for (let f = 0; f < frames; f++) {
  await page.evaluate(([t, fps]) => window.seek(t, fps), [f / fps, fps]);
  // A stalled frame (e.g. the machine slept) is retried rather than ending the render.
  let png;
  for (let attempt = 1; !png; attempt++) {
    try { png = await page.screenshot({ type: "png", timeout: 120000 }); }
    catch (error) { if (attempt >= 3) throw error; console.warn(`${story} ${format}: frame ${f} retry ${attempt}`); }
  }
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once("drain", r));
  if (f % 150 === 0) console.log(`${story} ${format}: frame ${f}/${frames} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
await done;
await browser.close();
console.log(`${story} ${format}: wrote ${out} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
