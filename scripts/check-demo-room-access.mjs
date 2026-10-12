// Hosted ownership/streaming authorization checks. No transactions or media capture.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress } from "viem";
import { unlockTestnetKeystore } from "./testnet-keystore.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const demo = JSON.parse(readFileSync(join(root, "protocol/broadcast/HYPR-demo/46630/receipts.json"), "utf8"));
const app = "https://hypr-pons.vercel.app";
const check = (condition, message) => { if (!condition) throw new Error(message); };
async function post(path, body) {
  const response = await fetch(`${app}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
try {
  check(demo.completed && demo.chainId === 46630, "A confirmed testnet demo is required.");
  const saved = spawnSync("/usr/bin/security", ["find-generic-password", "-a", "hypr-testnet-deployer", "-s", "HYPR Robinhood Testnet", "-w"], { encoding: "utf8", timeout: 30000 });
  check(saved.status === 0, "Could not unlock macOS Keychain.");
  const signer = unlockTestnetKeystore(JSON.parse(readFileSync(join(homedir(), "Library/Application Support/HYPR/testnet/deployer.json"), "utf8")), saved.stdout.trim());
  saved.stdout = "";
  check(signer.address === getAddress(demo.creator), "Wrong demo signer.");
  const challenge = await post("/api/room-claims/challenge", { tokenAddress: demo.token, claimantAddress: signer.address, chainId: 46630 });
  check(challenge.status === 200 && challenge.body.persistence === "supabase", "Hosted durable ownership challenge failed.");
  const expected = [
    "HYPR ROOM CLAIM", "Sign to prove control of the wallet associated with this indexed launch creator.",
    "This signature sends no transaction and grants no token permissions.", "", "Domain: HYPR",
    `Token: ${getAddress(demo.token)}`, `Indexed creator: ${signer.address}`, `Claimant: ${signer.address}`,
    "Chain ID: 46630", `Challenge: ${challenge.body.challengeId}`, `Expires: ${new Date(challenge.body.expiresAt).toISOString()}`,
  ].join("\n");
  check(challenge.body.message === expected, "The ownership challenge is not the exact expected no-spending message.");
  const signature = await signer.signMessage({ message: expected });
  const claimed = await post("/api/room-claims/verify", { challengeId: challenge.body.challengeId, signature });
  check(claimed.status === 200 && claimed.body.verified && claimed.body.persistence === "supabase", "Hosted durable ownership claim failed.");
  const replay = await post("/api/room-claims/verify", { challengeId: challenge.body.challengeId, signature });
  check(replay.status === 400 && !replay.body.verified, "Consumed ownership challenge was replayable.");
  const roomName = `hypr-${demo.token.toLowerCase()}`;
  const timestamp = Date.now();
  const message = ["HYPR native live host authorization", `Room: ${roomName}`, `Wallet: ${signer.address.toLowerCase()}`, `Timestamp: ${timestamp}`].join("\n");
  const hostSignature = await signer.signMessage({ message });
  const host = await post("/api/live/token", { roomId: demo.token, role: "host", address: signer.address, timestamp, signature: hostSignature });
  check(host.status === 200 && typeof host.body.token === "string" && host.headers.get("cache-control") === "no-store", "Real creator host-token authorization failed.");
  const grant = JSON.parse(Buffer.from(host.body.token.split(".")[1], "base64url").toString("utf8"));
  check(grant.video.room === roomName && grant.video.canPublish === true && grant.video.roomJoin === true && grant.sub === `host-${signer.address.toLowerCase()}`, "Host token has unexpected room/identity/permissions.");
  const denied = await post("/api/live/token", { roomId: demo.token, role: "host", address: "0x0000000000000000000000000000000000000001", timestamp, signature: hostSignature });
  check(denied.status === 403 && !denied.body.token, "Non-creator host was not rejected.");
  const viewer = await post("/api/live/token", { roomId: demo.token, role: "viewer" });
  check(viewer.status === 409 && !viewer.body.token, "Offline room granted viewer access unexpectedly.");
  console.log(JSON.stringify({ room: demo.token, ownership: "verified and persisted in Supabase", replay: "rejected", creatorHostAuthorization: "passed", nonCreatorHost: "rejected", offlineViewer: "rejected", cache: "no-store", liveMediaSession: "not started", cameraOrMicrophone: "not accessed" }, null, 2));
} catch (error) {
  console.error(error.shortMessage ?? error.message ?? "Hosted room authorization checks failed.");
  process.exitCode = 1;
}
