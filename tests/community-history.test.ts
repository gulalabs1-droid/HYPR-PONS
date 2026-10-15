import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { CommunityPanel } from "../src/components/community-panel";

test("expanded chat refreshes authoritatively so hidden history cannot reappear", async () => {
  const events = new EventTarget(), documentEvents = new EventTarget();
  const requests: string[] = []; let hidden = false;
  const msg = (id: string, body: string) => ({ id, body, wallet: `0x${"2".repeat(40)}`, created_at: new Date().toISOString() });
  const values = { window: { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {} }, document: { visibilityState: "visible", addEventListener: documentEvents.addEventListener.bind(documentEvents), removeEventListener: documentEvents.removeEventListener.bind(documentEvents) }, fetch: async (url: string) => {
    requests.push(url); const older = url.includes("before=");
    return Response.json({ followers: 0, following: false, wallet: null, hasMore: !older, messages: older ? [msg("older", "Hide this older message")] : hidden ? [msg("newer", "Current message")] : [msg("newer", "Current message")] });
  } };
  const saved = Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = create(createElement(CommunityPanel, { roomId: `0x${"1".repeat(40)}`, creator: `0x${"2".repeat(40)}` })); });
    const earlier = renderer!.root.findAllByType("button").find(button => button.children.includes("Load earlier messages"))!;
    await act(async () => earlier.props.onClick());
    assert.match(JSON.stringify(renderer!.toJSON()), /Hide this older message/);
    hidden = true;
    await act(async () => documentEvents.dispatchEvent(new Event("visibilitychange")));
    assert.ok(requests.at(-1)?.includes("limit=100"));
    assert.doesNotMatch(JSON.stringify(renderer!.toJSON()), /Hide this older message/);
    assert.match(JSON.stringify(renderer!.toJSON()), /Current message/);
  } finally {
    await act(async () => renderer?.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
