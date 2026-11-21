import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { FollowButton } from "../src/components/follow-button";
import type { useGrowth } from "../src/lib/use-growth";

test("a signed-in follow is synced even when its room is missing from the cached profile", async () => {
  const events = new EventTarget(), storage = new Map<string, string>();
  const posts: Array<Record<string, unknown>> = [];
  let succeeds = true;
  const values = {
    window: { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events), localStorage: { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) } },
    fetch: async (url: string, init?: RequestInit) => { if (url === "/api/community") posts.push(JSON.parse(String(init?.body))); return Response.json({}, { status: succeeds ? 200 : 503 }); },
  };
  const saved = Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const growth = { state: { wallet: `0x${"2".repeat(40)}`, enabled: true, rooms: [] }, error: "", refresh() {} } as unknown as ReturnType<typeof useGrowth>;
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = create(createElement(FollowButton, { roomId: `0x${"1".repeat(40)}`, growth })); });
    await act(async () => { renderer!.root.findByType("button").props.onClick(); await new Promise<void>(resolve => setImmediate(resolve)); });
    assert.equal(posts[0].action, "follow");
    assert.equal(posts[0].following, true);
    assert.match(renderer!.root.findByProps({ role: "status" }).children.join(""), /all your devices/);
    await act(async () => renderer!.unmount());

    succeeds = false;
    await act(async () => { renderer = create(createElement(FollowButton, { roomId: `0x${"3".repeat(40)}`, growth })); });
    await act(async () => { renderer!.root.findByType("button").props.onClick(); await new Promise<void>(resolve => setImmediate(resolve)); });
    assert.match(renderer!.root.findByProps({ role: "status" }).children.join(""), /Saved on this device/);
  } finally {
    await act(async () => renderer?.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
