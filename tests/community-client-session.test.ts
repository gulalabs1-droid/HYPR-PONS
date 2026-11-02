import assert from "node:assert/strict";
import { test } from "node:test";
import { signInCommunity } from "../src/lib/community-client";

test("one wallet signature is reused for chat and starting a creator broadcast", async () => {
  const wallet = `0x${"2".repeat(40)}`, savedWindow = Object.getOwnPropertyDescriptor(globalThis,"window"), savedFetch = globalThis.fetch;
  let signed = false, signatureRequests = 0, connectRequests = 0, challenges = 0;
  const provider = { async request({method}:{method:string}) {
    if (method === "eth_accounts") return [wallet];
    if (method === "eth_requestAccounts") { connectRequests++; return [wallet]; }
    if (method === "personal_sign") { signatureRequests++; return "0xsigned"; }
    throw new Error(`Unexpected wallet method ${method}`);
  } };
  Object.defineProperty(globalThis,"window",{configurable:true,value:{ethereum:provider,dispatchEvent(){}}});
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json({ wallet:signed ? wallet : null, canStartLive:signed });
    const body = JSON.parse(String(options.body));
    if (body.wallet) { challenges++; return Response.json({message:"Test sign-in"}); }
    if (body.signature) { signed = true; return Response.json({wallet}); }
    throw new Error("Unexpected request");
  };
  try {
    assert.deepEqual(await Promise.all([signInCommunity(), signInCommunity({requireLiveHost:true})]), [wallet,wallet]);
    assert.equal(await signInCommunity({requireLiveHost:true}), wallet);
    assert.equal(signatureRequests, 1); assert.equal(challenges, 1); assert.equal(connectRequests, 0);
  } finally { globalThis.fetch = savedFetch; if (savedWindow) Object.defineProperty(globalThis,"window",savedWindow); else Reflect.deleteProperty(globalThis,"window"); }
});

test("an older chat-only session asks once for the expanded live permission", async () => {
  const wallet = `0x${"3".repeat(40)}`, savedWindow = Object.getOwnPropertyDescriptor(globalThis,"window"), savedFetch = globalThis.fetch;
  let expanded = false, signatures = 0;
  const provider = { async request({method}:{method:string}) { if (method === "eth_accounts") return [wallet]; if (method === "personal_sign") { signatures++; return "0xsigned"; } throw new Error(method); } };
  Object.defineProperty(globalThis,"window",{configurable:true,value:{ethereum:provider,dispatchEvent(){}}});
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json({wallet,canStartLive:expanded});
    if (JSON.parse(String(options.body)).wallet) return Response.json({message:"Test expanded sign-in"});
    expanded = true; return Response.json({wallet});
  };
  try {
    await signInCommunity(); assert.equal(signatures,0);
    await signInCommunity({requireLiveHost:true}); await signInCommunity({requireLiveHost:true}); assert.equal(signatures,1);
  } finally { globalThis.fetch = savedFetch; if (savedWindow) Object.defineProperty(globalThis,"window",savedWindow); else Reflect.deleteProperty(globalThis,"window"); }
});
