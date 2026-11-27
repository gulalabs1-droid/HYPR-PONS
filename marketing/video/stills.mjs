// Renders a few still frames for review: node stills.mjs <story> <format v|h> <outDir> <t1> <t2> ...
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const [story, format, out, ...times] = process.argv.slice(2);
const size = format === "h" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: size });
page.on("pageerror", e => console.error("page error:", e.message));
await page.goto(`${pathToFileURL(path.resolve("engine.html"))}?story=${story}&format=${format}`);
await page.waitForFunction(() => window.READY === true, null, { timeout: 30000 });
for (const t of times) {
  await page.evaluate(t => window.seek(t), Number(t));
  await page.screenshot({ path: `${out}/${story}-${format}-${t}.png` });
}
await browser.close();
