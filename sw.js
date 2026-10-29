/* Family AI Game Day - offline support (Team 468 | Code: JLWEO).
 * Caches the app files so it opens without internet after the first visit.
 * Video/audio files are not intercepted (phones stream them with range requests). */
const CACHE = "fagd-v2.1.0";
const SHELL = ["./", "index.html", "style.css", "rules.js", "judge.js", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || req.headers.has("range") || /\.(mp4|mov|webm|wav|m4a|mp3)$/i.test(url.pathname)) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});
