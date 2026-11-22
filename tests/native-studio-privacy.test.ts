import assert from "node:assert/strict";
import { test } from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createElement } from "react";
import { NativeLiveRoom } from "../src/components/native-live-room";
import type { Launch } from "../src/lib/types";

const textOf = (node: { children?: unknown[] }): string => (node.children || []).map(child => typeof child === "string" ? child : textOf(child as { children?: unknown[] })).join("");

test("devices stay off until the creator taps Go live; the preview is private and closing stops it", async () => {
  const keys = ["window", "document", "navigator", "fetch"] as const;
  const saved = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let requests = 0; let stopped = 0;
  let renderer: ReactTestRenderer | undefined;
  // Only the creator's own wallet sees the Go live entry point.
  const creatorWallet = { request: async ({ method }: { method: string }) => method === "eth_accounts" ? [`0x${"2".repeat(40)}`] : "0xb626", on() {}, removeListener() {} };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { ethereum: creatorWallet, location: { hash: "", pathname: "/", search: "" }, history: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {}, requestAnimationFrame() { return 1; }, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { async getUserMedia(constraints: MediaStreamConstraints) {
    requests++; assert.ok(constraints.video && constraints.audio, "asks for camera and mic together");
    return { getTracks() { return [{ kind: "video", enabled: true, stop() { stopped++; } }, { kind: "audio", enabled: true, stop() { stopped++; } }]; } };
  } } } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (path: string) => {
    assert.match(path, /^\/api\/live\/status\?/); // No publishing token or media upload is allowed in this test.
    return Response.json({ configured: true, live: false, viewerCount: 0 });
  } });
  try {
    await act(async () => { renderer = create(createElement(NativeLiveRoom, { token: { address: `0x${"1".repeat(40)}`, deployer: `0x${"2".repeat(40)}` } as Launch })); });
    assert.equal(requests, 0, "loading the room never touches devices");
    const goLive = () => renderer!.root.findAll(node => node.type === "button" && textOf(node as never) === "Go live");
    await act(async () => goLive()[0].props.onClick());
    assert.equal(requests, 1); assert.equal(stopped, 0);
    assert.match(JSON.stringify(renderer!.toJSON()), /Preview · only you/);
    assert.equal(renderer!.root.findAllByProps({ role: "switch" })[0].props["aria-checked"], false, "replay recording starts off");
    assert.equal(goLive()[0].props.disabled, false);
    await act(async () => renderer!.root.findByProps({ "aria-label": "Close go live" }).props.onClick());
    assert.equal(stopped, 2);
    assert.equal(requests, 1);
  } finally {
    await act(async () => renderer?.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
