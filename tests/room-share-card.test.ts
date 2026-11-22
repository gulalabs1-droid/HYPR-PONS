import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReactElement, ReactNode } from "react";
import { roomShareCard, showTime } from "../src/lib/room-share-card";

/** All text drawn on the card, joined. */
function text(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  return text((node as ReactElement<{ children?: ReactNode }>).props.children);
}

const address = "0xbafd51c162b00bf85430e5b6bfa3e3ad049867f6";

test("live room card says it is live and offers Watch", () => {
  const card = text(roomShareCard({ address, name: "Demo", live: true, liveTitle: "Build night" }));
  assert.match(card, /LIVE NOW/);
  assert.match(card, /Build night/);
  assert.match(card, /Watch/);
  assert.match(card, /testnet preview/);
});

test("offline cards never say live", () => {
  const between = text(roomShareCard({ address, name: "Demo", live: false }));
  const upcoming = text(roomShareCard({ address, name: "Demo", live: false, upcoming: { title: "Q&A", startsAt: "2026-11-28T20:00:00Z" } }));
  for (const card of [between, upcoming]) assert.doesNotMatch(card, /LIVE/);
  assert.match(between, /Between shows/);
  assert.match(upcoming, /Next show · Sat 28 Nov · 20:00 UTC/);
  assert.match(upcoming, /Follow/);
});

test("moment card quotes the moment", () => {
  assert.match(text(roomShareCard({ address, name: "Ama", live: false, moment: "Best show yet" })), /“Best show yet”/);
});

test("long names and bios are shortened at a word boundary", () => {
  const card = text(roomShareCard({ address, name: "A very long creator room name that keeps going and going", live: false }));
  assert.match(card, /A very long creator room name that…/);
  assert.doesNotMatch(card, /\bke…/);
});

test("show times are written in UTC", () => {
  assert.equal(showTime("2026-11-28T20:00:00Z"), "Sat 28 Nov · 20:00 UTC");
});
