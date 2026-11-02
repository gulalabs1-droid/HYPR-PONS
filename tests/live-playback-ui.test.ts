import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Room } from "livekit-client";
import type { AudioTrackProps } from "@livekit/components-react";
import { LivePlaybackAudio, LivePlaybackControls, useViewerPlayback } from "../src/components/live-playback-controls";

test("viewers can mute, adjust volume, pause and resume without changing the broadcast", async () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "window"), storage = new Map<string,string>();
  Object.defineProperty(globalThis, "window", { configurable:true, value:{ localStorage:{ getItem:(key:string) => storage.get(key) || null, setItem:(key:string,value:string) => storage.set(key,value) } } });
  let starts = 0, current: ReturnType<typeof useViewerPlayback>; let renderer:ReactTestRenderer|undefined;
  const room = { startAudio:async () => { starts++; } } as unknown as Room;
  function Harness() { current = useViewerPlayback(room, true); return createElement(LivePlaybackControls, { playback:current, live:true }); }
  try {
    await act(async () => { renderer = create(createElement(Harness)); });
    const button = (text:string) => renderer!.root.findAllByType("button").find(node => String(node.props.children).includes(text))!;
    assert.equal(current!.volume, 1); assert.equal(current!.muted, false);
    await act(async () => button("Pause").props.onClick());
    assert.equal(current!.paused, true); assert.equal(starts, 0);
    await act(async () => button("Mute").props.onClick());
    assert.equal(current!.muted, true);
    await act(async () => button("Resume live").props.onClick());
    assert.equal(current!.paused, false); assert.equal(current!.muted, true); assert.equal(starts, 0);
    await act(async () => button("Unmute").props.onClick());
    assert.equal(current!.muted, false); assert.equal(starts, 1);
    await act(async () => renderer!.root.findByType("input").props.onChange({target:{value:"35"}}));
    assert.equal(current!.volume, 0.35); assert.equal(starts, 1);
    await act(async () => renderer!.root.findByType("input").props.onChange({target:{value:"0"}}));
    assert.equal(current!.muted, true);
    await act(async () => button("Unmute").props.onClick());
    assert.equal(current!.volume, 0.75); assert.equal(current!.muted, false); assert.equal(starts, 2);
    await act(async () => renderer!.unmount()); renderer = undefined;
    await act(async () => { renderer = create(createElement(Harness)); });
    assert.equal(current!.volume, 0.75, "volume is remembered on this device");
    assert.equal(current!.paused, false, "a new player does not stay paused");
  } finally { await act(async () => renderer?.unmount()); if (old) Object.defineProperty(globalThis,"window",old); else Reflect.deleteProperty(globalThis,"window"); }
});

test("muting applies again when audio attaches and does not disable the track used for a clip", async () => {
  const audio={muted:false}, source={enabled:true}; let attaches=0, detaches=0, renderer:ReactTestRenderer|undefined;
  const track={attach(element:typeof audio){attaches++;element.muted=false;},detach(){detaches++;},mediaStreamTrack:source};
  const ref={participant:{identity:"host"},publication:{track,trackSid:"TR_test"}} as unknown as NonNullable<AudioTrackProps["trackRef"]>;
  try {
    await act(async()=>{renderer=create(createElement(LivePlaybackAudio,{trackRef:ref,muted:true,volume:0.4}),{createNodeMock:()=>audio});});
    assert.equal(attaches,1); assert.equal(audio.muted,true); assert.equal(source.enabled,true);
    await act(async()=>renderer!.update(createElement(LivePlaybackAudio,{trackRef:ref,muted:false,volume:0.4})));
    assert.equal(audio.muted,false); assert.equal(source.enabled,true);
    await act(async()=>renderer!.unmount()); renderer=undefined; assert.equal(detaches,1);
  } finally { await act(async()=>renderer?.unmount()); }
});
