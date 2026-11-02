import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST as viewerAction } from "../src/app/api/community/live-guests/route";
import { POST as hostAction } from "../src/app/api/live/guests/route";
import { communitySession, createCommunityChallenge, encodeAuthorization } from "../src/lib/community-auth";
import { createHostCapability, encodeHostCapability, liveHostCookieName } from "../src/lib/live-host-auth";

test("guest routes reject cross-site, unsigned, malformed and wrong-room requests", async () => {
  const config = { LIVEKIT_URL:"wss://test.livekit.cloud", LIVEKIT_API_KEY:"test-key", LIVEKIT_API_SECRET:"test-secret-with-enough-entropy", SUPABASE_SERVICE_ROLE_KEY:"test-only-key", HYPR_NETWORK:"testnet" };
  const old = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  Object.assign(process.env, config);
  try {
    const origin = "https://hypr.test", roomId = `0x${"1".repeat(40)}`, wallet = `0x${"2".repeat(40)}`;
    const request = (path:string, body:unknown, cookie = "", requestOrigin = origin) => new NextRequest(`${origin}${path}`, { method:"POST", headers:{origin:requestOrigin,cookie}, body:JSON.stringify(body) });
    const viewerPath = "/api/community/live-guests", hostPath = "/api/live/guests";
    const session = `hypr-community-session=${encodeAuthorization(communitySession(createCommunityChallenge(wallet,origin)))}`;
    const capability = createHostCapability(roomId,wallet,origin);
    const hostCookie = `${liveHostCookieName(roomId)}=${encodeHostCapability(capability)}`;
    assert.equal((await viewerAction(request(viewerPath,{action:"request",roomId}))).status,401);
    assert.equal((await viewerAction(request(viewerPath,{action:"request",roomId},session,"https://evil.test"))).status,403);
    assert.equal((await viewerAction(request(viewerPath,{action:"approve",roomId},session))).status,400);
    assert.equal((await hostAction(request(hostPath,{action:"approve",roomId}))).status,401);
    assert.equal((await hostAction(request(hostPath,{action:"approve",roomId},hostCookie,"https://evil.test"))).status,403);
    assert.equal((await hostAction(request(hostPath,{action:"request",roomId},hostCookie))).status,400);
    assert.equal((await hostAction(request(hostPath,{action:"approve",roomId:`0x${"3".repeat(40)}`},hostCookie))).status,401);
  } finally { for (const [key,value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
