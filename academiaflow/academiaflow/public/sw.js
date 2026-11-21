// Service Worker v2: shell + páginas do app (network-first com fallback ao cache) + estáticos (cache-first).
const CACHE = "af-shell-v2";
const OFFLINE_PAGES = ["/treino", "/"]; // páginas que devem abrir sem rede
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/offline", "/manifest.json", ...OFFLINE_PAGES])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok && OFFLINE_PAGES.includes(url.pathname)) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
      return res;
    }).catch(async () => (await caches.match(req)) || (await caches.match("/offline"))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
    return res;
  })));
});

// Web Push (Etapa 4)
self.addEventListener("push", (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || "AcademiaFlow", { body: d.body, icon: "/icons/icon-192.png", data: { url: d.url || "/" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window" }).then((ws) => {
    const w = ws.find((c) => "focus" in c);
    return w ? (w.navigate(e.notification.data.url), w.focus()) : clients.openWindow(e.notification.data.url);
  }));
});
