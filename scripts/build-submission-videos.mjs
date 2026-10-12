// Local-only video composition. No uploads, signatures, capture or transactions.
// Founder voice stays in the ignored submission directory; source is preserved.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const output = path.join(root, "submission/worldsfair-20261012");
const screens = path.join(output, "screens");
const work = path.join(output, "render");
await mkdir(work, { recursive: true });
const inputAudio = "/Users/ct/Desktop/HYPR-pitch.m4a";
const probe = (file) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_name,width,height", "-of", "json", file], { encoding: "utf8" }));
const ffmpeg = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", ...args], { stdio: "inherit" });
const xml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const metadata = [];

async function overlay(index, title, footer) {
  const file = path.join(work, `${index}-overlay.png`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
  <rect x="128" y="25" width="6" height="38" rx="3" fill="#c7f36b"/>
  <text x="151" y="55" fill="#f1f2f4" font-family="Arial" font-size="32" font-weight="bold">${xml(title)}</text>
  <text x="128" y="1063" fill="#a6abb5" font-family="Arial" font-size="20">${xml(footer)}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

async function renderScene(id, image, title, footer, duration, audio) {
  await readFile(path.join(screens, image)); // Fail if actual browser evidence is missing.
  const frame = await overlay(id, title, footer);
  const file = path.join(work, `${id}.mp4`);
  const args = ["-loop", "1", "-framerate", "24", "-i", path.join(screens, image), "-i", frame];
  if (audio) args.push("-i", audio);
  args.push("-filter_complex", "[0:v]scale=1664:936:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:96:color=0x0b0c0e[screen];[screen][1:v]overlay=0:0:format=auto,format=yuv420p[v]", "-map", "[v]");
  if (audio) args.push("-map", "2:a:0", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,apad", "-c:a", "aac", "-b:a", "192k", "-ar", "48000");
  else args.push("-an");
  args.push("-t", duration.toFixed(4), "-r", "24", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22", "-movflags", "+faststart", file);
  ffmpeg(args);
  console.log(`Rendered ${id}: ${duration.toFixed(2)}s`);
  return file;
}

async function concat(name, files, audio) {
  const list = path.join(work, `${name}-concat.txt`);
  await writeFile(list, files.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
  const file = path.join(output, `${name}.mp4`);
  const args = ["-f", "concat", "-safe", "0", "-i", list];
  if (audio) args.push("-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest");
  else args.push("-c", "copy");
  args.push("-movflags", "+faststart", "-metadata", "title=HYPR — Crypto World's Fair", "-metadata", "comment=Robinhood testnet prototype. Edited actual live-product screens; not proof of a new transaction or media session.", file);
  ffmpeg(args);
  const info = probe(file);
  const seconds = Number(info.format.duration);
  const limit = name.includes("pitch") ? 120 : 180;
  if (!(seconds > 0 && seconds < limit)) throw new Error(`${name} violates the ${limit}s limit: ${seconds}`);
  metadata.push({ file: path.basename(file), durationSeconds: seconds, bytes: Number(info.format.size), limitSeconds: limit });
  return file;
}

const sourceInfo = probe(inputAudio);
const sourceDuration = Number(sourceInfo.format.duration);
if (!(sourceDuration > 30 && sourceDuration < 180)) throw new Error("Review unexpected founder recording length before editing.");
const voice = path.join(work, "founder-voice-normalized.m4a");
// Small tempo adjustment preserves all spoken content while allowing safety margin.
const tempo = Math.max(1, sourceDuration / 116);
ffmpeg(["-i", inputAudio, "-vn", "-af", `atempo=${tempo.toFixed(7)},loudnorm=I=-16:TP=-1.5:LRA=11`, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", voice]);
const voiceDuration = Number(probe(voice).format.duration);
const pitchScenes = [
  ["01-home.jpg", "HYPR | Every launch deserves a home", 18],
  ["04-room.jpg", "A persistent destination for the creator and community", 12],
  ["02-create.jpg", "Fixed supply. Visible economics. Wallet-authorized creation.", 12],
  ["05-studio.jpg", "Native creator studio | media acceptance remains a separate gate", 12],
  ["11-receipt.jpg", "Public testnet evidence | existing confirmed transaction", 12],
  ["03-discover.jpg", "Next: a small creator pilot, feedback, and repeat visits", 12],
  ["09-social-preview.jpg", "Honest scope | social previews, not mainnet readiness", 12],
  ["08-accounting.jpg", "Business hypothesis | transparent fees shared with creators", 10],
];
const pitchFiles = [];
for (let i = 0; i < pitchScenes.length; i++) {
  const [image, title, weight] = pitchScenes[i];
  pitchFiles.push(await renderScene(`pitch-${i}`, image, title, "Caleb | Gula Labs | Original founder voice | Robinhood Chain TESTNET", voiceDuration * weight / 100));
}
await concat("HYPR-founder-pitch", pitchFiles, voice);

const demoScenes = [
  ["01-home.jpg", "1 | Explore HYPR without an account", "This is Hyper, running on Robinhood Chain testnet. The app is public, and browsing does not require an account. Test assets have no real value."],
  ["02-create.jpg", "2 | Inspect creation and immutable configuration", "The creation form accepts a name and ticker. Supply, creator fees, protocol fees, and the graduation threshold are visible. This walkthrough does not create a new token or request a transaction."],
  ["03-discover.jpg", "3 | Discover an existing onchain launch", "We search for the real Hyper Testnet Demo and open its canonical room. Missing social and market metrics are left blank, not invented."],
  ["04-room.jpg", "4 | A persistent room attached to the actual token", "The room identifies the real token, network, and creator. This is an existing confirmed launch, not a generated mock room."],
  ["05-studio.jpg", "5 | Native creator authorization boundary", "The creator studio is inside Hyper. Only the creator wallet can authorize broadcasting. The studio shown here is offline; this is not evidence of video delivery."],
  ["06-buy-quote.jpg", "6 | Read an actual buy quote and fee", "Entering point zero zero one test ether returns an onchain buy quote and the fee. Signing is a separate wallet action. We do not press the buy button."],
  ["07-sell-quote.jpg", "7 | Read the sell quote separately", "The sell view shows estimated ether output and its fee separately. Approval and transaction signing would be required to sell. No transaction is broadcast in this walkthrough."],
  ["08-accounting.jpg", "8 | Current fee balances are not lifetime earnings", "Accounting labels current unclaimed balances and reserves. Zero claimed balances are not a claim of zero historical fees, or of real-money revenue."],
  ["11-receipt.jpg", "9 | Inspect genuine public-chain evidence", "The explorer shows a successful earlier testnet buy. Separate creation, selling, and fee-claim receipts are documented in the repository. This is historical evidence, not a transaction performed by this video."],
  ["09-social-preview.jpg", "10 | State the remaining release gates", "Chat and follows are local previews. Graduation is fork-tested, not publicly completed. Actual broadcast media, shared social services, security review, and mainnet readiness remain separate gates."],
];
const demoFiles = [];
for (let i = 0; i < demoScenes.length; i++) {
  const [image, title, speech] = demoScenes[i];
  const script = path.join(work, `demo-${i}.txt`);
  const audio = path.join(work, `demo-${i}.aiff`);
  await writeFile(script, speech);
  execFileSync("say", ["-v", "Daniel", "-r", "155", "-f", script, "-o", audio], { stdio: "inherit" });
  const duration = Number(probe(audio).format.duration) + 0.35;
  demoFiles.push(await renderScene(`demo-${i}`, image, title, "Edited live-site screens | System narration | TESTNET only | No new transactions", duration, audio));
}
await concat("HYPR-product-demo", demoFiles);
await writeFile(path.join(output, "video-checks.json"), JSON.stringify({ source: inputAudio, sourceDurationSeconds: sourceDuration, sourcePreserved: true, tempoFactor: tempo, artifacts: metadata, scope: "No uploads. No synthetic founder. Screens are actual current app/explorer captures; media delivery is not claimed." }, null, 2));
console.log(JSON.stringify(metadata, null, 2));
