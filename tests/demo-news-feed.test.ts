import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { NativeLiveRoom } from "../src/components/native-live-room";
import { DemoNewsFeed } from "../src/components/demo-news-feed";
import { isTestnetDemoRoom } from "../src/lib/demo-news";
import { fallbackNewsVideo, findNBCNewsBroadcast, NBC_NEWS_CHANNEL, NBC_NEWS_VERIFIED_VIDEO, NBC_NEWS_VERIFIED_UNTIL } from "../src/lib/nbc-news";
import type { Launch } from "../src/lib/types";

const demo = { address: "0xeA3b5d2Cf6EAcD3dd6241736082b7698E519a675", deployer: `0x${"2".repeat(40)}`, origin: "hypr", dataStatus: "partial" } as Launch;

test("the news lookup accepts only a live NBC News NOW broadcast", () => {
  const item = { id: { videoId: "0uwAtfBIVx0" }, snippet: { channelId: NBC_NEWS_CHANNEL, title: "LIVE: NBC News NOW - Nov. 5", liveBroadcastContent: "live" } };
  assert.equal(findNBCNewsBroadcast({ items: [item] }), "0uwAtfBIVx0");
  assert.equal(findNBCNewsBroadcast({ items: [{ ...item, snippet: { ...item.snippet, title: "Stay Tuned NOW" } }] }), null);
  assert.equal(findNBCNewsBroadcast({ items: [{ ...item, snippet: { ...item.snippet, channelId: "another-channel" } }] }), null);
  assert.equal(findNBCNewsBroadcast({ items: [{ ...item, snippet: { ...item.snippet, liveBroadcastContent: "none" } }] }), null);
  assert.equal(findNBCNewsBroadcast({ items: [{ ...item, id: { videoId: "bad" } }] }), null);
  assert.equal(findNBCNewsBroadcast({ items: null }), null);
  assert.equal(fallbackNewsVideo(NBC_NEWS_VERIFIED_UNTIL - 1), NBC_NEWS_VERIFIED_VIDEO);
  assert.equal(fallbackNewsVideo(NBC_NEWS_VERIFIED_UNTIL), null);
});

test("the external news feature is limited to the actual HYPR testnet demo", () => {
  assert.equal(isTestnetDemoRoom(demo), true);
  assert.equal(isTestnetDemoRoom({ ...demo, address: `0x${"1".repeat(40)}` }), false);
  assert.equal(isTestnetDemoRoom({ ...demo, origin: "pons" }), false);
  assert.equal(isTestnetDemoRoom({ ...demo, dataStatus: "demo" }), false);
  const previous = process.env.NEXT_PUBLIC_HYPR_NETWORK;
  try { process.env.NEXT_PUBLIC_HYPR_NETWORK = "mainnet"; assert.equal(isTestnetDemoRoom(demo), false); }
  finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_HYPR_NETWORK; else process.env.NEXT_PUBLIC_HYPR_NETWORK = previous; }
});

test("a temporary lookup failure does not interrupt an already playing news video", async () => {
  const keys = ["window", "document", "fetch", "IntersectionObserver"] as const;
  const saved = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let refresh: (() => void) | undefined; let calls = 0; let renderer: ReactTestRenderer | undefined;
  class Observer {
    constructor(private callback: (entries: Array<{ isIntersecting: boolean; intersectionRatio: number }>) => void) {}
    observe() { this.callback([{ isIntersecting: true, intersectionRatio: 1 }]); }
    disconnect() {}
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: { IntersectionObserver: Observer, matchMedia() { return { matches: false }; }, setInterval(callback: () => void) { refresh = callback; return 1; }, clearInterval() {} } });
  Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: Observer });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => { if (calls++) throw new Error("Network offline"); return Response.json({ videoId: NBC_NEWS_VERIFIED_VIDEO }); } });
  try {
    await act(async () => { renderer = create(createElement(DemoNewsFeed), { createNodeMock: () => ({}) }); });
    assert.match(JSON.stringify(renderer!.toJSON()), /embed\/0uwAtfBIVx0/);
    assert.equal(renderer!.root.findByType("a").props.href, `https://www.youtube.com/watch?v=${NBC_NEWS_VERIFIED_VIDEO}`);
    await act(async () => refresh!());
    assert.match(JSON.stringify(renderer!.toJSON()), /embed\/0uwAtfBIVx0/);
  } finally {
    await act(async () => renderer?.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});

test("the external feed yields to the creator and disappears when live status is unavailable", async () => {
  const keys = ["window", "document", "navigator", "fetch", "IntersectionObserver"] as const;
  const saved = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let tick: (() => void) | undefined; let calls = 0; let deviceRequests = 0;
  let renderer: ReactTestRenderer | undefined;
  const statuses = [
    Response.json({ configured: true, live: false, hostConnected: false }),
    Response.json({ configured: true, live: true, hostConnected: true, viewerCount: 1 }),
    Response.json({ configured: true, live: false, hostConnected: true }),
    Response.json({ configured: true, live: false, hostConnected: false }),
    Response.json({ error: "unavailable" }, { status: 503 }),
  ];
  class Observer {
    constructor(private callback: (entries: Array<{ isIntersecting: boolean; intersectionRatio: number }>) => void) {}
    observe() { this.callback([{ isIntersecting: true, intersectionRatio: 1 }]); }
    disconnect() {}
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: { IntersectionObserver: Observer, matchMedia() { return { matches: false }; }, setInterval(callback: () => void, delay: number) { if (delay === 5000) tick = callback; return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: Observer });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { async getUserMedia() { deviceRequests++; throw Error("Media must not be requested"); } } } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url: string) => url === "/api/news" ? Response.json({ videoId: NBC_NEWS_VERIFIED_VIDEO }) : statuses[calls++] });
  try {
    await act(async () => { renderer = create(createElement(NativeLiveRoom, { token: demo }), { createNodeMock: () => ({}) }); });
    const text = () => JSON.stringify(renderer!.toJSON());
    assert.match(text(), /EXTERNAL NEWS/); assert.match(text(), /creator is offline/i); assert.match(text(), /youtube-nocookie/);
    assert.doesNotMatch(text(), /Watch live/);
    await act(async () => tick!()); assert.match(text(), /The creator is live/); assert.match(text(), /Watch live/); assert.doesNotMatch(text(), /youtube-nocookie/);
    await act(async () => tick!()); assert.doesNotMatch(text(), /youtube-nocookie/);
    await act(async () => tick!()); assert.match(text(), /youtube-nocookie/);
    await act(async () => tick!()); assert.match(text(), /Broadcast status unavailable/); assert.doesNotMatch(text(), /youtube-nocookie/);
    assert.equal(deviceRequests, 0);
  } finally {
    await act(async () => renderer?.unmount());
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
