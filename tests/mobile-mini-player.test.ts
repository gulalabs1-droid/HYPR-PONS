import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type RefObject } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MobileMiniPlayer, useMobileMiniPlayer } from "../src/components/mobile-mini-player";

test("mini player appears only after scrolling past the stage and respects dismissal and screen size", async () => {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let callback: IntersectionObserverCallback | undefined;
  let changed: (() => void) | undefined;
  let observed = 0, disconnected = 0, margin = "";
  const mobile = { matches: true, addEventListener(_event: string, fn: () => void) { changed = fn; }, removeEventListener() {} };
  class Observer {
    constructor(fn: IntersectionObserverCallback, options?: IntersectionObserverInit) { callback = fn; margin = options?.rootMargin || ""; }
    observe() { observed++; }
    disconnect() { disconnected++; }
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: { matchMedia: () => mobile, IntersectionObserver: Observer } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 110 }) }) } });
  let current: ReturnType<typeof useMobileMiniPlayer>;
  const stageRef = { current: {} } as RefObject<HTMLElement>;
  function Harness({ active }: { active: boolean }) { current = useMobileMiniPlayer(stageRef, active); return null; }
  let renderer: ReactTestRenderer | undefined;
  const emit = (intersecting: boolean, bottom: number) => callback?.([{ isIntersecting: intersecting, boundingClientRect: { bottom }, rootBounds: { top: 110 } } as IntersectionObserverEntry], {} as IntersectionObserver);
  try {
    await act(async () => { renderer = create(createElement(Harness, { active: true })); });
    assert.equal(margin, "-110px 0px 0px 0px"); assert.equal(observed, 1); assert.equal(current!.visible, false);
    await act(async () => emit(false, 900));
    assert.equal(current!.visible, false, "the player is not shown before reaching the stage");
    await act(async () => emit(true, 300));
    assert.equal(current!.visible, false);
    await act(async () => emit(false, 100));
    assert.equal(current!.visible, true, "scrolling below the stage opens the mini player");
    await act(async () => current!.setEnabled(false));
    assert.equal(current!.visible, false); assert.equal(current!.enabled, false); assert.ok(disconnected > 0);
    await act(async () => current!.setEnabled(true));
    await act(async () => emit(false, 100));
    assert.equal(current!.visible, true, "a viewer can turn it back on");
    mobile.matches = false; await act(async () => changed?.());
    assert.equal(current!.visible, false, "the mobile player does not appear on desktop");
    await act(async () => renderer!.update(createElement(Harness, { active: false })));
    assert.equal(current!.visible, false);
  } finally {
    await act(async () => renderer?.unmount());
    if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow); else Reflect.deleteProperty(globalThis, "window");
    if (savedDocument) Object.defineProperty(globalThis, "document", savedDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});

test("mini player controls share playback actions and do not create audio or device tracks", async () => {
  let paused = 0, muted = 0, closed = 0, returned = 0;
  const playback = { paused: false, muted: false, volume: 1, togglePause: () => paused++, toggleMute: () => muted++, setVolume: () => {} };
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = create(createElement(MobileMiniPlayer, { playback, live: true, status: "Live", onStage: true, guests: [{ id: "guest" }], onClose: () => closed++, onReturn: () => returned++ })); });
    const button = (label: string) => renderer!.root.findAllByType("button").find(item => item.props["aria-label"] === label)!;
    assert.equal(renderer!.root.findAllByType("audio").length, 0);
    assert.match(JSON.stringify(renderer!.toJSON()), /You’re still on stage/);
    await act(async () => button("Pause watching").props.onClick());
    await act(async () => button("Mute for me").props.onClick());
    await act(async () => button("Return to the full broadcast").props.onClick());
    await act(async () => button("Move mini player to the left").props.onClick());
    assert.ok(button("Move mini player to the right"));
    await act(async () => button("Close mini player and keep watching").props.onClick());
    assert.deepEqual([paused, muted, returned, closed], [1, 1, 1, 1]);
    await act(async () => renderer!.update(createElement(MobileMiniPlayer, { playback: { ...playback, paused: true, muted: true }, live: true, status: "Live", onStage: false, guests: [], onClose() {}, onReturn() {} })));
    assert.match(JSON.stringify(renderer!.toJSON()), /Playback paused/);
    assert.ok(button("Resume watching live")); assert.ok(button("Unmute for me"));
  } finally { await act(async () => renderer?.unmount()); }
});
