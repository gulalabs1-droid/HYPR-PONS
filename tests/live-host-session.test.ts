import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/community/live-host/route";
import { communitySession, createCommunityChallenge, encodeAuthorization } from "../src/lib/community-auth";
import { createCreatorLiveSession } from "../src/lib/live-host-session";
import { TokenVerifier } from "livekit-server-sdk";

test("starting a broadcast requires the same-origin, expanded signed-in session and a real indexed room", async () => {
  const config = { LIVEKIT_URL:"wss://test.livekit.cloud", LIVEKIT_API_KEY:"test-key", LIVEKIT_API_SECRET:"test-secret-with-enough-entropy", SUPABASE_SERVICE_ROLE_KEY:"test-role-key", HYPR_NETWORK:"testnet", HYPR_FACTORY_ADDRESS:"", PONS_INDEXER_MODE:"fixture" };
  const saved = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]])); Object.assign(process.env,config);
  try {
    const origin="https://hypr.test", wallet=`0x${"2".repeat(40)}`, roomId=`0x${"1".repeat(40)}`;
    const challenge=createCommunityChallenge(wallet,origin), current=communitySession(challenge), old={...current,version:undefined};
    const cookie=(value:typeof current)=>`hypr-community-session=${encodeAuthorization(value)}`;
    const request=(body:unknown, auth="", requestOrigin=origin)=>new NextRequest(`${origin}/api/community/live-host`,{method:"POST",headers:{origin:requestOrigin,cookie:auth},body:JSON.stringify(body)});
    assert.equal((await POST(request({roomId}))).status,401);
    assert.equal((await POST(request({roomId},cookie(current),"https://evil.test"))).status,403);
    assert.equal((await POST(request({roomId},cookie(old)))).status,401);
    assert.equal((await POST(request({roomId:"invalid"},cookie(current)))).status,400);
    assert.equal((await POST(request({roomId},cookie(current)))).status,404);
  } finally { for (const [key,value] of Object.entries(saved)) if(value===undefined) delete process.env[key]; else process.env[key]=value; }
});

test("a creator session grants host access only to the wallet that created the indexed native room", async () => {
  const config = { LIVEKIT_URL:"wss://test.livekit.cloud", LIVEKIT_API_KEY:"test-key", LIVEKIT_API_SECRET:"test-secret-with-enough-entropy" };
  const saved = Object.fromEntries(Object.keys(config).map(key => [key,process.env[key]])); Object.assign(process.env,config);
  try {
    const roomId=`0x${"1".repeat(40)}`, wallet=`0x${"2".repeat(40)}`, other=`0x${"3".repeat(40)}`, origin="https://hypr.test";
    const launch={address:roomId,origin:"hypr" as const,dataStatus:"partial" as const,deployer:wallet,name:"Real room"};
    const load=async()=>[launch];
    await assert.rejects(createCreatorLiveSession(roomId,other,origin,load), /Only the creator/);
    await assert.rejects(createCreatorLiveSession(roomId,wallet,origin,async()=>[{...launch,dataStatus:"demo"}]), /not available/);
    const result=await createCreatorLiveSession(roomId,wallet,origin,load);
    const claims=await new TokenVerifier(config.LIVEKIT_API_KEY,config.LIVEKIT_API_SECRET).verify(result.token);
    assert.equal(claims.sub,`host-${wallet}`); assert.equal(claims.video?.canPublish,true);
    assert.equal(result.capability.wallet,wallet); assert.equal(result.capability.roomId,roomId);
  } finally { for (const [key,value] of Object.entries(saved)) if(value===undefined) delete process.env[key]; else process.env[key]=value; }
});
