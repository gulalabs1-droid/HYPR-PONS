import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { AccessToken } from "livekit-server-sdk";
import { POST } from "../src/app/api/live/webhook/route";

test("live webhook accepts only a signed, unchanged LiveKit event", async () => {
  const config = { LIVEKIT_URL:"wss://test.livekit.cloud", LIVEKIT_API_KEY:"test-key", LIVEKIT_API_SECRET:"test-secret-with-enough-entropy" };
  const old = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  Object.assign(process.env, config);
  try {
    const body = JSON.stringify({ event:"participant_joined", room:{ name:`hypr-0x${"1".repeat(40)}` } });
    const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, { ttl:"1m" });
    token.sha256 = createHash("sha256").update(body).digest("base64");
    const authorization = await token.toJwt();
    const request = (payload:string, auth?:string) => new Request("https://hypr.example/api/live/webhook", { method:"POST", body:payload, headers:auth ? { authorization:auth } : {} });
    assert.equal((await POST(request(body))).status, 401);
    assert.equal((await POST(request(`${body} `, authorization))).status, 401);
    assert.equal((await POST(request(body, authorization))).status, 204);
    assert.equal((await POST(request("x".repeat(65537), authorization))).status, 413);
  } finally { for (const [key,value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
