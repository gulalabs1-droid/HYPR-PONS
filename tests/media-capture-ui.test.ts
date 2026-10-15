import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MediaCaptureControls } from "../src/components/media-capture-controls";
import { MediaUploadProvider } from "../src/components/media-upload-provider";

test("replay capture stays off without consent, auto-starts only after opt-in, and cannot start after leaving", async () => {
  const events=new EventTarget(), documentEvents=new EventTarget(); let reserveCalls=0, recorderStarts=0, walletPrompts=0, sourceStops=0;
  let delayed=false, release:(value:Response)=>void=()=>{};
  class Stream {
    constructor(private tracks: MediaStreamTrack[] = []) {}
    getTracks(){return this.tracks;} getAudioTracks(){return this.tracks.filter(track=>track.kind==="audio");} addTrack(track:MediaStreamTrack){this.tracks.push(track);}
  }
  class Recorder {
    static isTypeSupported(){return true;} state="inactive";
    ondataavailable:((value:{data:Blob})=>void)|null=null; onstop:(()=>void)|null=null;
    start(){recorderStarts++;this.state="recording";}
    stop(){this.state="inactive";this.ondataavailable?.({data:new Blob([new Uint8Array(64)])});this.onstop?.();}
  }
  const values={MediaStream:Stream,MediaRecorder:Recorder,window:{ethereum:{request:async()=>{walletPrompts++;throw new Error("An effect must not prompt a wallet");}},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),setInterval:()=>1,clearInterval(){},dispatchEvent:events.dispatchEvent.bind(events)},document:{visibilityState:"visible",addEventListener:documentEvents.addEventListener.bind(documentEvents),removeEventListener:documentEvents.removeEventListener.bind(documentEvents)},fetch:async(_input:unknown,options?:RequestInit)=>{
    if(options?.method==="POST") {reserveCalls++;if(delayed)return await new Promise<Response>(resolve=>{release=resolve;});return Response.json({id:"test-id",mime:"video/webm",title:"Replay",kind:"replay",uploadUrl:"unused"});}
    return Response.json({enabled:true,live:true,creator:true,clipsAllowed:false,wallet:`0x${"2".repeat(40)}`,assets:[]});
  }};
  const saved=Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,value});
  const track={id:"source-video",kind:"video",readyState:"live",addEventListener(){},removeEventListener(){},stop(){sourceStops++;}} as unknown as MediaStreamTrack;
  const props={roomId:`0x${"1".repeat(40)}`,host:true,tracks:[track],registerStop(){},onRecordingChange(){}};
  const render=(autoRecord:boolean)=>createElement(MediaUploadProvider,null,createElement(MediaCaptureControls,{...props,autoRecord}));
  let renderer:ReactTestRenderer|undefined;
  try {
    await act(async()=>{renderer=create(render(false));});
    assert.equal(reserveCalls,0);assert.equal(recorderStarts,0);
    await act(async()=>renderer?.unmount());
    await act(async()=>{renderer=create(render(true));});
    assert.equal(reserveCalls,1);assert.equal(recorderStarts,1);assert.equal(walletPrompts,0);
    await act(async()=>renderer?.unmount());
    delayed=true;
    await act(async()=>{renderer=create(render(true));});
    assert.equal(reserveCalls,2);
    await act(async()=>renderer?.unmount());
    await act(async()=>release(Response.json({id:"late",mime:"video/webm",title:"Replay",kind:"replay",uploadUrl:"unused"})));
    assert.equal(recorderStarts,1,"late authorization cannot restart media after leaving");assert.equal(sourceStops,0);
  } finally {
    await act(async()=>renderer?.unmount());
    for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
  }
});
