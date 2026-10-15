import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { createCommunityChallenge, communitySession, encodeAuthorization } from "../src/lib/community-auth";
import { GET, POST } from "../src/app/api/community/growth/route";
import { POST as analytics } from "../src/app/api/community/analytics/route";
import { issuePilotConsent, permitsPilotRequest, readPilotConsent } from "../src/lib/pilot-analytics-server";
const roomId = `0x${"1".repeat(40)}`, wallet = `0x${"2".repeat(40)}`;
test("growth routes preserve guest reads and reject cross-site, unsigned and malformed creator writes", async () => {
  const saved = {...process.env}, original = globalThis.fetch; const writes:Record<string,unknown>[]=[];
  Object.assign(process.env,{SUPABASE_URL:"https://db.test",SUPABASE_SERVICE_ROLE_KEY:"test-only-key",HYPR_NETWORK:"testnet",HYPR_GROWTH_ENABLED:"true"});
  globalThis.fetch = async (_url,init) => { writes.push(JSON.parse(String(init?.body))); return Response.json(String(_url).endsWith("hypr_read_growth")?[]:{saved:true}); };
  const request=(body:unknown,cookie="",origin="https://hypr.test")=>new NextRequest("https://hypr.test/api/community/growth",{method:"POST",headers:{origin,cookie},body:JSON.stringify(body)});
  try {
    assert.equal((await GET(new NextRequest("https://hypr.test/api/community/growth"))).status,200);
    assert.equal((await POST(request({}))).status,401);
    assert.equal((await POST(request({},"","https://evil.test"))).status,403);
    const cookie=`hypr-community-session=${encodeAuthorization(communitySession(createCommunityChallenge(wallet,"https://hypr.test")))}`;
    assert.equal((await POST(request(null,cookie))).status,400);
    const response=await POST(request({roomId,action:"profile",wallet:"spoof",payload:{displayName:"Name",bio:"",avatar:"H"}},cookie));
    assert.equal(response.status,200); assert.equal(writes.at(-1)?.p_wallet_address,wallet);
    process.env.HYPR_GROWTH_ENABLED="false";
    assert.equal((await GET(new NextRequest("https://hypr.test/api/community/growth"))).status,200);
    assert.equal((await POST(request({roomId,action:"moment",payload:{title:"Topic"}},cookie))).status,503);
  } finally { globalThis.fetch=original; for(const key of Object.keys(process.env)) if(!(key in saved)) delete process.env[key]; Object.assign(process.env,saved); }
});
test("analytics consent is signed, expiring and bot/privacy filtered; clients cannot invent follows", async () => {
  const saved={...process.env},original=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:"https://db.test",SUPABASE_SERVICE_ROLE_KEY:"test-only-key",HYPR_NETWORK:"testnet",HYPR_GROWTH_ENABLED:"true"});
  globalThis.fetch=async()=>Response.json({});
  const request=(body:unknown,cookie="",extra:Record<string,string>={})=>new NextRequest("https://hypr.test/api/community/analytics",{method:"POST",headers:{origin:"https://hypr.test",cookie,...extra},body:JSON.stringify(body)});
  try {
    const value=issuePilotConsent(100); assert.ok(readPilotConsent(value,101)); assert.equal(readPilotConsent(value+"x",101),null); assert.equal(readPilotConsent(value,31*86400_000),null);
    assert.equal(permitsPilotRequest(new Request("https://hypr.test",{headers:{"sec-gpc":"1"}})),false);
    assert.equal(permitsPilotRequest(new Request("https://hypr.test",{headers:{"user-agent":"Twitterbot"}})),false);
    assert.equal((await analytics(request({action:"event",event:"room_viewed",roomId,id:crypto.randomUUID()}))).status,401);
    const consent=await analytics(request({action:"consent"})); assert.equal(consent.status,200); assert.match(consent.headers.get("set-cookie")!,/HttpOnly/);
    const cookie=consent.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await analytics(request({action:"event",event:"creator_followed",roomId,id:crypto.randomUUID()},cookie))).status,400);
    assert.equal((await analytics(request({action:"event",event:"room_viewed",roomId,id:crypto.randomUUID()},cookie))).status,200);
    assert.equal((await analytics(request({action:"withdraw"},cookie))).status,200);
  } finally { globalThis.fetch=original; for(const key of Object.keys(process.env)) if(!(key in saved)) delete process.env[key]; Object.assign(process.env,saved); }
});
