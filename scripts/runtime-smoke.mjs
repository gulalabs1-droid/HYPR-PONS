const baseUrl = (process.argv[2] || "http://127.0.0.1:3100").replace(/\/$/, "");
const expectUnconfigured = process.env.HYPR_SMOKE_EXPECT_UNCONFIGURED === "1";
const roomPath = "/room/0x8B7f0bC4B22fE4e3cA91E0C4b3fA1c7D5E6f8A90";

async function request(pathname, init) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`);
  return response;
}

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await request("/api/protocol/summary");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError || new Error("server did not become ready");
}

await waitForServer();
const homeResponse = await request("/");
for (const [header, expected] of [
  ["content-security-policy", "frame-src https://www.youtube-nocookie.com https://player.twitch.tv"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
]) {
  const value = homeResponse.headers.get(header) || "";
  if (!value.includes(expected)) throw new Error(`${header} is missing the expected security policy`);
}
for (const pathname of [
  "/protocol",
  "/api/launches",
  "/api/protocol/launches",
  "/api/protocol/summary",
]) {
  await request(pathname);
}

const roomHtml = await (await request(roomPath)).text();
if (!roomHtml.includes("NATIVE HYPR LIVE") && !roomHtml.includes("LIVE LAUNCH EXPERIENCE")) throw new Error("room is missing the live launch surface");
if (!roomHtml.includes("DEMO SAMPLE") && !roomHtml.includes("LOCAL PREVIEW")) {
  throw new Error("room is missing the honest chat source label");
}
if (expectUnconfigured && roomHtml.includes("people are in the room right now")) {
  throw new Error("demo room metadata is presenting sample activity as live");
}

const summary = await (await request("/api/protocol/summary")).json();
if (typeof summary.network !== "string" || typeof summary.source !== "string") {
  throw new Error("protocol summary is missing its source contract");
}
if (expectUnconfigured && (summary.source !== "unconfigured" || summary.launchCount !== 0)) {
  throw new Error("credential-free protocol summary is not explicitly unconfigured");
}

const malformedClaim = await fetch(`${baseUrl}/api/room-claims/challenge`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({}),
});
if (malformedClaim.status !== 400) throw new Error(`malformed claim returned HTTP ${malformedClaim.status}`);

const liveStatus = await request(`/api/live/status?roomId=${roomPath.split("/").pop()}`);
const liveStatusBody = await liveStatus.json();
if (typeof liveStatusBody.live !== "boolean" || typeof liveStatusBody.configured !== "boolean") {
  throw new Error("live status is missing its configured/live contract");
}
const liveToken = await fetch(`${baseUrl}/api/live/token`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ roomId: roomPath.split("/").pop(), role: "viewer" }),
});
if (liveToken.status !== 200 && liveToken.status !== 503) throw new Error(`live token returned unexpected HTTP ${liveToken.status}`);

console.log(`runtime smoke passed at ${baseUrl} (${summary.source})`);
