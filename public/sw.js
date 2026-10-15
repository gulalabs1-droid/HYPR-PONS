// Live status, chat and wallet sessions must never be served from cache:
// only immutable build assets and icons are cached here.
const STATIC_CACHE = "hypr-static-v1";
function notificationPath(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/following", self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : "/following";
  } catch { return "/following"; }
}
const OFFLINE_HTML = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · HYPR</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0c0e;color:#f1f2f4;font:16px/1.6 system-ui,sans-serif;text-align:center;padding:24px}b{display:inline-grid;place-items:center;width:56px;height:56px;border-radius:16px;background:#c7f36b;color:#0b0c0e;font-size:28px;margin-bottom:16px}p{color:#9aa1ab;max-width:34ch}</style><div><b>H</b><h1>You’re offline</h1><p>Live rooms need a connection. Reconnect and HYPR will pick up where you left off.</p></div></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("hypr-") && key !== STATIC_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })());
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === "string" ? data.title : "HYPR";
  const url = notificationPath(data.url);
  event.waitUntil(self.registration.showNotification(title, { body: typeof data.body === "string" ? data.body : "", icon: "/icons/hypr-192.png", badge: "/icons/hypr-192.png", tag: typeof data.tag === "string" ? data.tag : undefined, data: { url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(notificationPath(event.notification.data?.url), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url === target) || windows[0];
    if (existing) { await existing.focus(); if (existing.url !== target && "navigate" in existing) await existing.navigate(target); return; }
    await self.clients.openWindow(target);
  })());
});
