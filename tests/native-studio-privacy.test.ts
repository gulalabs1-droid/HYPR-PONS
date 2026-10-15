import assert from "node:assert/strict";
import { test } from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createElement } from "react";
import { NativeLiveRoom } from "../src/components/native-live-room";
import type { Launch } from "../src/lib/types";

test("opening the studio leaves devices off; only explicit private preview requests media and closing stops it", async () => {
  const keys = ["window", "document", "navigator", "fetch"] as const;
  const saved = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let requests = 0; let stopped = 0;
  let renderer: ReactTestRenderer | undefined;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setInterval() { return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { async getUserMedia(constraints: unknown) {
    requests++; assert.deepEqual(constraints, { video: true, audio: false });
    return { getTracks() { return [{ stop() { stopped++; } }]; } };
  } } } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (path: string) => {
    assert.match(path, /^\/api\/live\/status\?/); // No publishing token or media upload is allowed in this test.
    return Response.json({ configured: true, live: false, viewerCount: 0 });
  } });
  try {
    await act(async () => { renderer = create(createElement(NativeLiveRoom, { token: { address: `0x${"1".repeat(40)}`, deployer: `0x${"2".repeat(40)}` } as Launch })); });
    await act(async () => renderer!.root.findAllByType("button").find((button) => button.props.children === "Open creator studio")!.props.onClick());
    const inputs = renderer!.root.findAllByType("input");
    assert.equal(inputs.length, 3); assert.equal(inputs[0].props.checked, false); assert.equal(inputs[1].props.checked, false); assert.equal(inputs[2].props.checked, false);
    assert.equal(requests, 0);
    assert.equal(renderer!.root.findAllByType("button").find((button) => button.props.children === "Authorize & start broadcast")!.props.disabled, true);
    await act(async () => inputs[0].props.onChange({ target: { checked: true } }));
    assert.equal(requests, 0);
    await act(async () => renderer!.root.findAllByType("button").find((button) => button.props.children === "Preview selected devices")!.props.onClick());
    assert.equal(requests, 1); assert.equal(stopped, 0);
    assert.match(JSON.stringify(renderer!.toJSON()), /Only on this device · not broadcasting/);
    await act(async () => renderer!.root.findAllByType("button").find((button) => button.props.children === "Close studio")!.props.onClick());
    assert.equal(stopped, 1);
    assert.equal(requests, 1);
  } finally {
    await act(async () => renderer?.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
