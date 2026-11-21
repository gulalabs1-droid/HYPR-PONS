import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { RemindMe } from "../src/components/remind-me";

test("room alerts appear only when the service is available, with calendar as a fallback", async () => {
  const events = new EventTarget();
  let enabled = false;
  const values = {
    window: { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), localStorage: { getItem: () => null }, matchMedia: () => ({ matches: false }) },
    navigator: { userAgent: "test" },
    fetch: async () => Response.json({ enabled, publicKey: enabled ? "test-public-key" : null }),
  };
  const saved = Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  let renderer: ReactTestRenderer | undefined;
  const roomId = `0x${"1".repeat(40)}`;
  try {
    await act(async () => { renderer = create(createElement(RemindMe, { roomId, calendarHref: "/calendar" })); });
    assert.equal(renderer!.root.findAllByType("button").length, 0);
    assert.equal(renderer!.root.findByType("a").props.href, "/calendar");
    await act(async () => { renderer!.unmount(); });

    enabled = true;
    await act(async () => { renderer = create(createElement(RemindMe, { roomId })); });
    assert.equal(renderer!.root.findAllByType("button").length, 1);
    assert.match(String(renderer!.root.findByType("button").children.join("")), /Notify me/);
  } finally {
    await act(async () => renderer?.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
