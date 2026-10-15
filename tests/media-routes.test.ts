import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/media/route";
import { GET as playback } from "../src/app/api/media/playback/route";
import { encodeAuthorization, COMMUNITY_SESSION_COOKIE } from "../src/lib/community-auth";
const roomId = `0x${"1".repeat(40)}`, id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("media routes preserve guest reads, private drafts, same-origin writes and scoped storage links", async () => {
  const saved = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, HYPR_NETWORK: process.env.HYPR_NETWORK };
  Object.assign(process.env, { SUPABASE_URL: "https://storage.test", SUPABASE_SERVICE_ROLE_KEY: "unit-test-key-only", HYPR_NETWORK: "testnet" });
  const originalFetch = globalThis.fetch; let privateAsset = false; const calls: {url:string;body:Record<string,unknown>}[]=[];
  globalThis.fetch = async (input, options) => {
    const url = String(input), body = JSON.parse(String(options?.body || "{}")); calls.push({url,body});
    if (url.endsWith("/hypr_media")) {
      if (body.p_action === "list") return Response.json({ enabled:true,creator:false,clipsAllowed:false,assets:[] });
      if (body.p_action === "asset") {
        if (privateAsset && !body.p_wallet_address) return Response.json({}, {status:403});
        return Response.json({ id,kind:"replay",title:"Real recording",mime:"video/webm",path:`${roomId}/${id}.webm`,bucket:"hypr-replays",published:!privateAsset,durationSeconds:1 });
      }
      return Response.json({saved:true});
    }
    if (url.includes("/object/sign/")) return Response.json({ signedURL:`/object/sign/hypr-replays/${roomId}/${id}.webm?token=scoped-test-token` });
    throw new Error(`unexpected request ${url}`);
  };
  const auth = encodeAuthorization({ wallet:`0x${"2".repeat(40)}`,chainId:46630,origin:"https://hypr.test",nonce:id,expiresAt:Date.now()+60000,kind:"session" });
  const post = (body:unknown, origin="https://hypr.test", cookie="") => POST(new NextRequest("https://hypr.test/api/media",{method:"POST",headers:{origin,cookie,"Content-Type":"application/json"},body:JSON.stringify(body)}));
  try {
    assert.equal((await post({roomId,action:"publish",id})).status,401);
    assert.equal((await post({},"https://evil.test")).status,403);
    assert.equal((await post({roomId,action:"reserve",kind:"replay",mime:"text/html",title:"Bad",consent:true},undefined,`${COMMUNITY_SESSION_COOKIE}=${auth}`)).status,400);
    assert.equal((await GET(new NextRequest(`https://hypr.test/api/media?roomId=${roomId}`))).status,200);
    const response = await playback(new NextRequest(`https://hypr.test/api/media/playback?roomId=${roomId}&id=${id}`));
    assert.equal(response.status,200); const data=await response.json();
    assert.equal(data.url,`https://storage.test/storage/v1/object/sign/hypr-replays/${roomId}/${id}.webm?token=scoped-test-token`);
    assert.equal(response.headers.get("cache-control"),"no-store"); assert.ok(!JSON.stringify(data).includes("unit-test-key-only"));
    privateAsset=true;
    assert.equal((await playback(new NextRequest(`https://hypr.test/api/media/playback?roomId=${roomId}&id=${id}`))).status,404);
    assert.equal((await playback(new NextRequest(`https://hypr.test/api/media/playback?roomId=${roomId}&id=${id}`,{headers:{cookie:`${COMMUNITY_SESSION_COOKIE}=${auth}`}}))).status,200);
    assert.ok(calls.some(call=>call.body.p_wallet_address===null && call.body.p_action==="asset"));
  } finally {
    globalThis.fetch=originalFetch;
    for (const [key,value] of Object.entries(saved)) { if(value===undefined) delete process.env[key]; else process.env[key]=value; }
  }
});
