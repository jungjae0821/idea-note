const CACHE = "idea-note-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("idea-note-shell-") && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    /signin|signout|callback/.test(url.pathname)
  )
    return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res.ok && new URL(res.url).pathname === "/") {
            const c = await caches.open(CACHE);
            await c.put("/", res.clone());
          }
          return res;
        })
        .catch(
          async () =>
            (await caches.match("/")) ||
            new Response(
              "오프라인 조회를 준비하려면 인터넷에 연결한 뒤 앱을 한 번 열어주세요.",
              {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              },
            ),
        ),
    );
  } else if (/\.(js|css|woff2?|svg)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res.ok) {
            const c = await caches.open(CACHE);
            await c.put(req, res.clone());
          }
          return res;
        })
        .catch(
          async () =>
            (await caches.match(req)) || new Response("", { status: 503 }),
        ),
    );
  }
});
