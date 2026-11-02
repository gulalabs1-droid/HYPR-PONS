import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { NativeLiveRoom } from "../src/components/native-live-room";
import type { Launch } from "../src/lib/types";

test("a creator can explicitly choose a separate signature if shared sign-in is unavailable", async () => {
  const saved = ["window","document","navigator","fetch"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  const wallet=`0x${"2".repeat(40)}`, roomId=`0x${"1".repeat(40)}`;
  let signatures=0, fallbackRequests=0, renderer:ReactTestRenderer|undefined;
  const provider={async request({method}:{method:string}) { if(method==="eth_accounts"||method==="eth_requestAccounts")return [wallet]; if(method==="eth_chainId")return "0xb626"; if(method==="eth_getBalance")return "0x0"; if(method==="personal_sign"){signatures++;return `0x${"1".repeat(130)}`;} throw new Error(method); },on(){},removeListener(){}};
  Object.defineProperty(globalThis,"window",{configurable:true,value:{ethereum:provider,setInterval(){return 1;},clearInterval(){},addEventListener(){},removeEventListener(){},dispatchEvent(){}}});
  Object.defineProperty(globalThis,"document",{configurable:true,value:{visibilityState:"visible",addEventListener(){},removeEventListener(){}}});
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{mediaDevices:{async getUserMedia(){return {getTracks(){return [{stop(){}}];}};}}}});
  Object.defineProperty(globalThis,"fetch",{configurable:true,value:async(path:string,options?:RequestInit)=>{
    if(path.startsWith("/api/live/status"))return Response.json({configured:true,live:false,viewerCount:0});
    if(path==="/api/community/session"&&!options?.method)return Response.json({wallet:null,canStartLive:false});
    if(path==="/api/community/session"&&options?.method==="POST")return Response.json({error:"Shared sign-in unavailable"},{status:503});
    if(path==="/api/live/token"){fallbackRequests++;return Response.json({error:"Synthetic test stopped before connecting"},{status:503});}
    throw new Error(`Unexpected request ${path}`);
  }});
  try {
    await act(async()=>{renderer=create(createElement(NativeLiveRoom,{token:{address:roomId,deployer:wallet} as Launch}));});
    const button=(text:string)=>renderer!.root.findAllByType("button").find(node=>node.props.children===text)!;
    await act(async()=>button("Open creator studio").props.onClick());
    await act(async()=>renderer!.root.findAllByType("input")[0].props.onChange({target:{checked:true}}));
    await act(async()=>button("Preview selected devices").props.onClick());
    await act(async()=>button("Start broadcast").props.onClick());
    assert.equal(signatures,0); assert.ok(button("Use one-time creator authorization"));
    await act(async()=>button("Use one-time creator authorization").props.onClick());
    assert.equal(signatures,1); assert.equal(fallbackRequests,1);
  } finally {
    await act(async()=>renderer?.unmount());
    for(const [key,descriptor] of saved) if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
  }
});
