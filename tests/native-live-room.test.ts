import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConnectedRoom } from "../src/components/native-live-connected";
import { LiveKitRoom } from "@livekit/components-react";
import { ConnectionState, RemoteParticipant, Room, RoomEvent } from "livekit-client";
import type { BroadcastExit } from "../src/lib/broadcast-lifecycle";

test("connected host and viewer controls render inside the LiveKit room provider", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }; },
    addEventListener() {}, removeEventListener() {},
  } });
  try {
  for (const role of ["host", "viewer"] as const) {
      let renderer: ReactTestRenderer | undefined;
      await act(async () => {
        renderer = create(createElement(ConnectedRoom, {
          session: { token: "test-token", serverUrl: "wss://test.livekit.cloud", role },
          connect: false,
          onLeave() {},
          onError() {},
        }));
      });
      const controls = renderer!.root.findAllByType("button");
      assert.ok(controls.some(control => control.props.children === (role === "host" ? "End broadcast" : "Leave live")));
      await act(async () => renderer!.unmount());
  }
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

function browserStubs() {
  const names = ["window", "document"] as const;
  const saved = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const timers = new Map<number, () => void>(); let id = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }; },
    addEventListener() {}, removeEventListener() {},
    setTimeout(callback: () => void) { timers.set(++id, callback); return id; }, clearTimeout(timer: number) { timers.delete(timer); },
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  return { timers, restore() { for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); } } };
}

test("ending requires confirmation, cancellation keeps the session, and confirmed disconnect stops tracks once", async () => {
  const browser = browserStubs(); const room = new Room(); const exits: BroadcastExit[] = []; const disconnects: boolean[] = [];
  let renderer: ReactTestRenderer | undefined;
  const originalDisconnect = room.disconnect;
  room.disconnect = async (stopTracks?: boolean) => { if (stopTracks === true) { disconnects.push(true); room.emit(RoomEvent.Disconnected); } };
  try {
    await act(async () => { renderer = create(createElement(ConnectedRoom, { room, session: { token: "test-token", serverUrl: "wss://test.livekit.cloud", role: "host" }, connect: false, onLeave: (reason) => exits.push(reason), onError() {} })); });
    const provider = renderer!.root.findByType(LiveKitRoom);
    assert.equal(provider.props.audio, false); assert.equal(provider.props.video, false);
    const button = (label: string) => renderer!.root.findAllByType("button").find((node) => node.props.children === label)!;
    await act(async () => button("End broadcast").props.onClick());
    assert.equal(disconnects.length, 0); assert.equal(exits.length, 0);
    assert.match(JSON.stringify(renderer!.toJSON()), /does not close your community room/);
    await act(async () => button("Keep broadcasting").props.onClick());
    assert.equal(renderer!.root.findAllByType("dialog").length, 0); assert.equal(disconnects.length, 0);
    await act(async () => button("End broadcast").props.onClick());
    await act(async () => button("End broadcast now").props.onClick());
    assert.deepEqual(disconnects, [true]); assert.deepEqual(exits, ["host-ended"]);
    await act(async () => provider.props.onDisconnected());
    assert.deepEqual(exits, ["host-ended"]);
  } finally {
    await act(async () => renderer?.unmount()); room.disconnect = originalDisconnect; browser.restore();
  }
});

test("viewer leaving closes only their player; unexpected disconnect is not claimed as creator ending", async () => {
  const browser = browserStubs(); let renderer: ReactTestRenderer | undefined;
  try {
    for (const manual of [true, false]) {
      const room = new Room(); const exits: BroadcastExit[] = []; let disconnects = 0;
      const originalDisconnect = room.disconnect; room.disconnect = async (stopTracks?: boolean) => { if (stopTracks === true) { disconnects++; room.emit(RoomEvent.Disconnected); } };
      await act(async () => { renderer = create(createElement(ConnectedRoom, { room, session: { token: "test-token", serverUrl: "wss://test.livekit.cloud", role: "viewer" }, connect: false, onLeave: (reason) => exits.push(reason), onError() {} })); });
      const provider = renderer!.root.findByType(LiveKitRoom);
      assert.equal(provider.props.audio, false); assert.equal(provider.props.video, false);
      if (manual) await act(async () => renderer!.root.findAllByType("button").find((button) => button.props.children === "Leave live")!.props.onClick());
      else await act(async () => provider.props.onDisconnected());
      assert.deepEqual(exits, [manual ? "viewer-left" : "connection-lost"]);
      assert.equal(disconnects, manual ? 1 : 0);
      await act(async () => renderer!.unmount()); renderer = undefined; room.disconnect = originalDisconnect;
    }
  } finally { await act(async () => renderer?.unmount()); browser.restore(); }
});

test("an absent creator releases the viewer after the grace window, but reconnection cancels that exit", async () => {
  const browser = browserStubs(); const room = new Room(); const exits: BroadcastExit[] = [];
  const originalDisconnect = room.disconnect; room.disconnect = async (stopTracks?: boolean) => { if (stopTracks === true) room.emit(RoomEvent.Disconnected); };
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = create(createElement(ConnectedRoom, { room, session: { token: "test-token", serverUrl: "wss://test.livekit.cloud", role: "viewer" }, connect: false, onLeave: (reason) => exits.push(reason), onError() {} })); });
    await act(async () => { room.state = ConnectionState.Connected; room.emit(RoomEvent.ConnectionStateChanged, room.state); });
    assert.equal(browser.timers.size, 1); assert.equal(exits.length, 0);
    await act(async () => { room.state = ConnectionState.Reconnecting; room.emit(RoomEvent.ConnectionStateChanged, room.state); });
    assert.equal(browser.timers.size, 0); assert.equal(exits.length, 0);
    await act(async () => { room.state = ConnectionState.Connected; room.emit(RoomEvent.ConnectionStateChanged, room.state); });
    const host = new RemoteParticipant(room.engine.client, "PA_creator", "host-creator", undefined, '{"role":"host"}');
    await act(async () => { room.remoteParticipants.set(host.identity, host); room.emit(RoomEvent.ParticipantConnected, host); });
    assert.equal(browser.timers.size, 0); assert.equal(exits.length, 0);
    await act(async () => { room.remoteParticipants.delete(host.identity); room.emit(RoomEvent.ParticipantDisconnected, host); });
    const expiry = [...browser.timers.values()][0]; assert.ok(expiry);
    await act(async () => expiry()); assert.deepEqual(exits, ["creator-offline"]);
  } finally { await act(async () => renderer?.unmount()); room.disconnect = originalDisconnect; browser.restore(); }
});

test("a failed end action preserves the session and allows retry instead of claiming success", async () => {
  const browser = browserStubs(); const room = new Room(); const exits: BroadcastExit[] = []; const errors: string[] = [];
  const originalDisconnect = room.disconnect; let attempts = 0; let renderer: ReactTestRenderer | undefined;
  room.disconnect = async (stopTracks?: boolean) => {
    if (stopTracks !== true) return;
    attempts++; if (attempts === 1) throw new Error("test disconnect failure"); room.emit(RoomEvent.Disconnected);
  };
  try {
    await act(async () => { renderer = create(createElement(ConnectedRoom, { room, session: { token: "test-token", serverUrl: "wss://test.livekit.cloud", role: "host" }, connect: false, onLeave: (reason) => exits.push(reason), onError: (message) => errors.push(message) })); });
    const button = (label: string) => renderer!.root.findAllByType("button").find((node) => node.props.children === label)!;
    await act(async () => button("End broadcast").props.onClick());
    await act(async () => button("End broadcast now").props.onClick());
    assert.equal(exits.length, 0); assert.equal(button("End broadcast now").props.disabled, false);
    assert.ok(errors.some((message) => message.includes("Could not close")));
    await act(async () => button("End broadcast now").props.onClick());
    assert.equal(attempts, 2); assert.deepEqual(exits, ["host-ended"]);
  } finally { await act(async () => renderer?.unmount()); room.disconnect = originalDisconnect; browser.restore(); }
});
