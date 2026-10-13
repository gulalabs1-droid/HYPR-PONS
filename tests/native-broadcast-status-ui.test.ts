import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { NativeLiveRoom } from "../src/components/native-live-room";
import type { Launch } from "../src/lib/types";

test("the actual room component distinguishes pause, stop, unavailable status and a returning creator without saving media", async () => {
  const keys = ["window", "document", "navigator", "fetch"] as const;
  const saved = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let tick: (() => void) | undefined; let calls = 0; let mediaRequests = 0; let chatOpens = 0;
  let renderer: ReactTestRenderer | undefined;
  const statuses = [
    Response.json({ configured: true, live: true, hostConnected: true, viewerCount: 2 }),
    Response.json({ configured: true, live: false, hostConnected: true, viewerCount: 2 }),
    Response.json({ configured: true, live: false, hostConnected: false, viewerCount: 0 }),
    Response.json({ error: "unavailable" }, { status: 503 }),
    Response.json({ configured: true, live: false, hostConnected: true }),
    Response.json({ configured: true, live: true, hostConnected: true, viewerCount: 1 }),
  ];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setInterval(callback: () => void) { tick = callback; return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { async getUserMedia() { mediaRequests++; throw Error("Media must not be requested"); } } } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (path: string) => {
    assert.match(path, /^\/api\/live\/status\?/); return statuses[calls++];
  } });
  try {
    await act(async () => { renderer = create(createElement(NativeLiveRoom, { token: { address: `0x${"1".repeat(40)}`, deployer: `0x${"2".repeat(40)}` } as Launch, onOpenChat() { chatOpens++; } })); });
    const text = () => JSON.stringify(renderer!.toJSON());
    assert.match(text(), /The creator is live/);
    await act(async () => tick!()); assert.match(text(), /Broadcast paused/);
    await act(async () => tick!()); assert.match(text(), /Broadcast stopped. Room still open/);
    await act(async () => tick!()); assert.match(text(), /Broadcast status unavailable/); assert.doesNotMatch(text(), /Broadcast stopped. Room still open/);
    await act(async () => tick!()); assert.match(text(), /Creator in the studio/); assert.doesNotMatch(text(), /Broadcast paused/);
    await act(async () => tick!()); assert.match(text(), /The creator is live/);
    await act(async () => renderer!.root.findAllByType("button").find((button) => button.props["aria-label"] === "Open room chat")!.props.onClick());
    assert.equal(chatOpens, 1); assert.equal(mediaRequests, 0);
    assert.match(text(), /Video replay: not saved/);
    assert.equal(calls, statuses.length);
  } finally {
    await act(async () => renderer?.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
