const baseUrl = (process.argv[2] || "http://127.0.0.1:3100").replace(/\/$/, "");
const expectUnconfigured = process.env.HYPR_SMOKE_EXPECT_UNCONFIGURED === "1";
const sampleRoomAddress = "0x8B7f0bC4B22fE4e3cA91E0C4b3fA1c7D5E6f8A90";

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

const launchData = await (await request("/api/launches")).json();
if (!Array.isArray(launchData.launches) || typeof launchData.source !== "string") throw new Error("launch API has an invalid source contract");
const nativeData = await (await request("/api/protocol/launches")).json();
if (!Array.isArray(nativeData.launches) || typeof nativeData.source !== "string") throw new Error("native launch API has an invalid source contract");
const roomAddress = nativeData.launches[0]?.token || launchData.launches[0]?.address || sampleRoomAddress;
const hasIndexedRooms = nativeData.launches.length > 0 || launchData.launches.length > 0;
const roomResponse = await fetch(`${baseUrl}/room/${roomAddress}`);
if (!hasIndexedRooms) {
  if (roomResponse.status !== 404) throw new Error("an empty launch source must not invent a sample room");
} else {
  if (!roomResponse.ok) throw new Error(`indexed room returned HTTP ${roomResponse.status}`);
  const roomHtml = await roomResponse.text();
  if (!roomHtml.includes("NATIVE HYPR LIVE") && !roomHtml.includes("LIVE LAUNCH EXPERIENCE")) throw new Error("room is missing the live launch surface");
  if (!roomHtml.includes("SHARED ROOM CHAT")) throw new Error("room is missing shared community chat");
  if (roomHtml.includes("LOCAL PREVIEW") || roomHtml.includes("Illustrative sample")) throw new Error("room is still presenting sample activity");
  if (expectUnconfigured && roomHtml.includes("people are in the room right now")) throw new Error("demo room metadata is presenting sample activity as live");
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

const liveStatus = await request(`/api/live/status?roomId=${roomAddress}`);
const liveStatusBody = await liveStatus.json();
if (typeof liveStatusBody.live !== "boolean" || typeof liveStatusBody.configured !== "boolean") {
  throw new Error("live status is missing its configured/live contract");
}
if (launchData.launches.some((launch) => launch.dataStatus === "demo")) throw new Error("public API must not return sample launches");
const community = await fetch(`${baseUrl}/api/community?roomId=${roomAddress}`);
if (hasIndexedRooms && !community.ok) throw new Error(`shared community returned HTTP ${community.status}`);
const unsignedCommunityWrite = await fetch(`${baseUrl}/api/community`, { method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl }, body: JSON.stringify({ roomId: roomAddress, action: "message", body: "must not save" }) });
if (unsignedCommunityWrite.status !== 401) throw new Error("community writes must require a verified wallet session");
const liveToken = await fetch(`${baseUrl}/api/live/token`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ roomId: sampleRoomAddress, role: "viewer" }),
});
if (![403, 404, 503].includes(liveToken.status)) throw new Error(`non-native smoke room must not receive a live token; returned HTTP ${liveToken.status}`);

console.log(`runtime smoke passed at ${baseUrl} (${summary.source})`);
