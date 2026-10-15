import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadCapturedMedia } from "../src/lib/media-client";
import type { MediaReservation } from "../src/lib/media";

test("private media uploads use only scoped PUT grants and finalize retries without overwrites", async () => {
  const roomId=`0x${"1".repeat(40)}`, id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const reservation:MediaReservation={id,kind:"clip",mime:"video/webm",title:"Private capture",uploadUrl:`https://project.supabase.co/storage/v1/object/upload/sign/hypr-clips/${roomId}/${id}.webm?token=scoped-only`};
  const media={blob:new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3])]),mime:"video/webm",durationSeconds:2};
  const originalFetch=globalThis.fetch, originalWindow=Object.getOwnPropertyDescriptor(globalThis,"window");
  let events=0, putStatus=200, response=reservation;
  const calls:{url:string;options:RequestInit|undefined}[]=[];
  Object.defineProperty(globalThis,"window",{configurable:true,value:{dispatchEvent:()=>{events++;return true;}}});
  globalThis.fetch=async(input,options)=>{
    calls.push({url:String(input),options});
    if(options?.method==="PUT") return new Response(null,{status:putStatus});
    const body=JSON.parse(String(options?.body));
    return Response.json(body.action==="upload"?response:{saved:true});
  };
  try {
    await uploadCapturedMedia(roomId,reservation,media,()=>{});
    assert.equal(calls.length,3);assert.equal(calls[1].url,reservation.uploadUrl);
    assert.equal(calls[1].options?.body,media.blob);
    const headers=new Headers(calls[1].options?.headers);
    assert.equal(headers.get("x-upsert"),"false");assert.equal(headers.get("authorization"),null);assert.equal(headers.get("apikey"),null);
    assert.equal(JSON.parse(String(calls[2].options?.body)).action,"complete");assert.equal(events,1);
    for(const ready of [{uploaded:true},{ready:true}]) {
      calls.length=0;response={...reservation,...ready};await uploadCapturedMedia(roomId,reservation,media,()=>{});
      assert.equal(calls.filter(call=>call.options?.method==="PUT").length,0);
      assert.equal(calls.length,ready.ready?1:2);
    }
    calls.length=0;response=reservation;putStatus=409;
    await uploadCapturedMedia(roomId,reservation,media,()=>{});
    assert.equal(JSON.parse(String(calls.at(-1)?.options?.body)).action,"complete");
    calls.length=0;putStatus=403;
    await assert.rejects(uploadCapturedMedia(roomId,reservation,media,()=>{}),/download your backup/);
    assert.equal(calls.length,2,"a failed transfer cannot be marked complete");
    calls.length=0;response={...reservation,uploadUrl:"https://project.supabase.co/storage/v1/object/public/unscoped?token=test"};
    await assert.rejects(uploadCapturedMedia(roomId,reservation,media,()=>{}),/invalid upload destination/);
    assert.equal(calls.length,1);
  } finally {
    globalThis.fetch=originalFetch;
    if(originalWindow)Object.defineProperty(globalThis,"window",originalWindow);else Reflect.deleteProperty(globalThis,"window");
  }
});
