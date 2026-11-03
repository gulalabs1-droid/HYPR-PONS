import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { CommunityPanel } from "../src/components/community-panel";

test("message options stay available to the right people without crowding chat", async () => {
  const events = new EventTarget(), documentEvents = new EventTarget();
  const creator = `0x${"2".repeat(40)}`, viewer = `0x${"3".repeat(40)}`;
  const posts: Array<Record<string, unknown>> = [];
  let signedIn = creator;
  const messages = [
    { id: "creator-message", wallet: creator, body: "Welcome to the room", created_at: new Date().toISOString() },
    { id: "viewer-message", wallet: viewer, body: "Hello!", created_at: new Date().toISOString() },
  ];
  const values = {
    window: { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events), setInterval: () => 1, clearInterval() {}, location: { href: "https://hypr.test/room" }, localStorage: { getItem: () => null } },
    document: { visibilityState: "visible", addEventListener: documentEvents.addEventListener.bind(documentEvents), removeEventListener: documentEvents.removeEventListener.bind(documentEvents) },
    navigator: {},
    fetch: async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return Response.json({ ok: true }); }
      return Response.json({ followers: 0, following: false, wallet: signedIn, messages, hasMore: false });
    },
  };
  const saved = Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  let renderer: ReactTestRenderer | undefined;
  const buttons = () => renderer!.root.findAllByType("button");
  const find = (text: string) => buttons().find(button => button.children.includes(text));
  const options = () => buttons().filter(button => String(button.props["aria-label"] || "").startsWith("Message options for"));
  try {
    await act(async () => { renderer = create(createElement(CommunityPanel, { roomId: `0x${"1".repeat(40)}`, creator, creatorName: "Creator", reportsEnabled: true })); });
    assert.equal(options().length, 2);
    assert.equal(find("Hide message"), undefined);
    assert.equal(find("Pin"), undefined);
    assert.equal(find("Report"), undefined);
    await act(async () => options()[0].props.onClick());
    assert.equal(options()[0].props["aria-expanded"], true);
    assert.ok(find("Hide message") && find("Pin") && find("Report"));
    await act(async () => { find("Pin")!.props.onClick(); await new Promise<void>(resolve => setImmediate(resolve)); });
    assert.equal(posts[0].action, "pin");
    assert.equal(posts[0].messageId, "creator-message");
    assert.equal(find("Pin"), undefined);

    signedIn = viewer;
    await act(async () => documentEvents.dispatchEvent(new Event("visibilitychange")));
    await act(async () => options()[0].props.onClick());
    assert.equal(find("Hide message"), undefined);
    assert.equal(find("Pin"), undefined);
    assert.ok(find("Report"));
    await act(async () => options()[1].props.onClick());
    assert.ok(find("Hide message") && find("Report"));
    assert.equal(find("Pin"), undefined);
  } finally {
    await act(async () => renderer?.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});

test("opening a hidden chat shows the newest message without pulling a reader away from older messages", async () => {
  const events = new EventTarget(), documentEvents = new EventTarget();
  let visible = false, top = 0;
  const log = { scrollHeight: 600, clientHeight: 300, get scrollTop() { return top; }, set scrollTop(value: number) { if (visible) top = value; } };
  const creator = `0x${"2".repeat(40)}`, roomId = `0x${"1".repeat(40)}`;
  const values = {
    window: { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), setInterval: () => 1, clearInterval() {} },
    document: { visibilityState: "visible", addEventListener: documentEvents.addEventListener.bind(documentEvents), removeEventListener: documentEvents.removeEventListener.bind(documentEvents) },
    fetch: async () => Response.json({ followers: 0, following: false, wallet: null, hasMore: false, messages: [{ id: "one", wallet: creator, body: "Latest", created_at: new Date().toISOString() }] }),
  };
  const saved = Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  let renderer: ReactTestRenderer | undefined;
  const panel = (chatActive: boolean) => createElement(CommunityPanel, { roomId, creator, chatActive });
  try {
    await act(async () => { renderer = create(panel(false), { createNodeMock: (element) => element.props.role === "log" ? log : null }); });
    assert.equal(top, 0);
    visible = true;
    await act(async () => renderer!.update(panel(true)));
    assert.equal(top, 600);
    top = 100;
    await act(async () => renderer!.root.findByProps({ role: "log" }).props.onScroll({ currentTarget: log }));
    visible = false;
    await act(async () => renderer!.update(panel(false)));
    visible = true;
    await act(async () => renderer!.update(panel(true)));
    assert.equal(top, 100);
  } finally {
    await act(async () => renderer?.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
