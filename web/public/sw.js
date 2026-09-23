/* GeekAdmin — network-first, para o celular na loja. */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open("geekadmin-v4").then((cache) => cache.addAll(["/admin"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/ws")) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open("geekadmin-v4").then((cache) => cache.put(req, copy)).catch(() => undefined);
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/admin"))),
  );
});
