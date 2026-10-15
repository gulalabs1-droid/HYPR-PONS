import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

test("notifications never navigate outside HYPR, including protocol-relative links", async () => {
  const handlers = {}, opened = [];
  const origin = "https://hypr.test";
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    URL, self: { location: { origin }, addEventListener: (name, fn) => { handlers[name] = fn; }, clients: { matchAll: async () => [], openWindow: async url => { opened.push(url); } } },
  });
  for (const path of ["//evil.test", "/\\evil.test", "https://evil.test/a", "javascript:alert(1)", "/room/123?from=alert"]) {
    let work;
    handlers.notificationclick({ notification: { close() {}, data: { url: path } }, waitUntil: promise => { work = promise; } });
    await work;
    assert.equal(opened.at(-1), `${origin}${path === "/room/123?from=alert" ? path : "/following"}`);
  }
});

test("service worker never intercepts navigation, private APIs or video storage", () => {
  const handlers = {};
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    URL, self: { location: { origin:"https://hypr.test" }, addEventListener:(name,fn)=>{handlers[name]=fn;} },
  });
  for (const request of [
    {url:"https://hypr.test/room/real",method:"GET",mode:"navigate"},
    {url:"https://hypr.test/api/media/playback?id=private",method:"GET"},
    {url:"https://project.supabase.co/storage/v1/object/sign/private?token=scoped",method:"GET"},
    {url:"https://hypr.test/api/media",method:"POST"},
  ]) handlers.fetch({request,respondWith(){assert.fail("dynamic requests must remain browser/network controlled");}});
});
