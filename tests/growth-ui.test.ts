import assert from "node:assert/strict";
import { test } from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createElement } from "react";
import { ShareRoom } from "../src/components/share-room";
import { useGrowth } from "../src/lib/use-growth";
import { savedRooms, saveRoomOnDevice } from "../src/lib/saved-rooms";
import { analyticsAllowed, setAnalyticsPreference } from "../src/lib/pilot-analytics";
import { awaitCommunityReset, resetCommunitySession } from "../src/lib/community-client";

const roomId=`0x${"1".repeat(40)}`;
function globals(values:Record<string,unknown>) {
  const saved=Object.entries(values).map(([name])=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  for(const [name,value] of Object.entries(values)) Object.defineProperty(globalThis,name,{configurable:true,value});
  return ()=>{ for(const [name,value] of saved) { if(value) Object.defineProperty(globalThis,name,value); else Reflect.deleteProperty(globalThis,name); } };
}
test("guest sharing copies only the clean canonical room; canceling native share records nothing", async () => {
  const target=new EventTarget(); let copied=""; let requests=0;
  const restore=globals({window:{location:{origin:"https://hypr.test",href:`https://hypr.test/room/${roomId}?untrusted=1#trade`},localStorage:{getItem:()=>null},addEventListener:target.addEventListener.bind(target),removeEventListener:target.removeEventListener.bind(target)},navigator:{clipboard:{writeText:async(value:string)=>{copied=value;}},share:async()=>{throw Object.assign(new Error("cancel"),{name:"AbortError"});}},fetch:async()=>{requests++;return Response.json({});}});
  let renderer:ReactTestRenderer|undefined;
  try {
    await act(async()=>{renderer=create(createElement(ShareRoom,{roomId,name:"Creator"}));});
    await act(async()=>renderer!.root.findAllByType("button")[0].props.onClick());
    assert.equal(copied,`https://hypr-pons.vercel.app/room/${roomId}`); assert.equal(requests,0);
    await act(async()=>renderer!.root.findAllByType("button")[1].props.onClick());
    assert.equal(requests,0); assert.doesNotMatch(JSON.stringify(renderer!.toJSON()),/Shared\./);
  } finally { await act(async()=>renderer?.unmount()); restore(); }
});

test("Following drops stale account state and waits for server sign-out before refreshing", async () => {
  const target=new EventTarget(), documentTarget=new EventTarget();
  const timers=new Map<number,()=>void>(); let timer=0; let accountChanged:(...args:unknown[])=>void=()=>{};
  let finishReset:()=>void=()=>{}; let resetPending=false; const readsDuringReset:boolean[]=[];
  const provider={request:async()=>[],on:(event:string,handler:(...args:unknown[])=>void)=>{if(event==="accountsChanged") accountChanged=handler;},removeListener(){}};
  const restore=globals({window:{ethereum:provider,addEventListener:target.addEventListener.bind(target),removeEventListener:target.removeEventListener.bind(target),dispatchEvent:target.dispatchEvent.bind(target),setInterval:(fn:()=>void)=>{timers.set(++timer,fn);return timer;},clearInterval:(id:number)=>timers.delete(id),setTimeout:()=>++timer,clearTimeout(){}},document:{visibilityState:"visible",addEventListener:documentTarget.addEventListener.bind(documentTarget),removeEventListener:documentTarget.removeEventListener.bind(documentTarget)},fetch:async(url:string,options?:RequestInit)=>{
    if(options?.method==="DELETE") {resetPending=true;await new Promise<void>(resolve=>{finishReset=resolve;});resetPending=false;return Response.json({wallet:null});}
    readsDuringReset.push(resetPending);return Response.json({enabled:true,rooms:[],wallet:readsDuringReset.length===1?"old-account":null});
  }});
  let renderer:ReactTestRenderer|undefined;
  function Harness(){const growth=useGrowth(); return createElement("span",null,growth.state?.wallet || "guest");}
  try {
    // The existing selected-provider helper falls back to this injected provider.
    await act(async()=>{renderer=create(createElement(Harness));});
    assert.match(JSON.stringify(renderer!.toJSON()),/old-account/);
    await act(async()=>accountChanged([]));
    assert.doesNotMatch(JSON.stringify(renderer!.toJSON()),/old-account/);
    assert.equal(readsDuringReset.length,1);
    await act(async()=>finishReset());
    assert.deepEqual(readsDuringReset,[false,false]);
  } finally { await act(async()=>renderer?.unmount()); restore(); }
});

test("device saves survive reads, deduplicate without fake followers, and can be removed without a wallet",()=>{
  const data=new Map<string,string>(),events:Event[]=[];
  const restore=globals({window:{localStorage:{getItem:(key:string)=>data.get(key)||null,setItem:(key:string,value:string)=>data.set(key,value)},dispatchEvent:(event:Event)=>{events.push(event);return true;}}});
  try {saveRoomOnDevice(roomId,true);saveRoomOnDevice(roomId,true);assert.deepEqual(savedRooms(),[roomId]);assert.equal(events.length,2);saveRoomOnDevice(roomId,false);assert.deepEqual(savedRooms(),[]);assert.throws(()=>saveRoomOnDevice("bad",true));}
  finally {restore();}
});

test("unavailable analytics cannot enable consent, and failed withdrawal keeps local tracking off",async()=>{
  const data=new Map<string,string>();let available=false;
  const restore=globals({window:{localStorage:{getItem:(key:string)=>data.get(key)||null,setItem:(key:string,value:string)=>data.set(key,value)},dispatchEvent:()=>true},navigator:{},fetch:async(_url:string,init?:RequestInit)=>available?Response.json({tracking:JSON.parse(String(init?.body)).action==="consent"}):Response.json({error:"unavailable"},{status:503})});
  try {assert.ok(await setAnalyticsPreference(true));assert.equal(analyticsAllowed(),false);available=true;assert.equal(await setAnalyticsPreference(true),null);assert.equal(analyticsAllowed(),true);available=false;assert.ok(await setAnalyticsPreference(false));assert.equal(analyticsAllowed(),false);}
  finally {restore();}
});

test("a failed account reset stays fail-closed until server sign-out succeeds",async()=>{
  let available=false,attempts=0;
  const restore=globals({fetch:async()=>{attempts++;return Response.json({}, {status:available?200:503});}});
  try {await assert.rejects(resetCommunitySession());await assert.rejects(awaitCommunityReset());assert.equal(attempts,2);available=true;await awaitCommunityReset();assert.equal(attempts,3);await awaitCommunityReset();assert.equal(attempts,3);}
  finally {restore();}
});
