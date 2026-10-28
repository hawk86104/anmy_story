/* Only public shell resources are cached. Family API, media and page HTML stay on the network. */
const CACHE = "mylife-shell-__SHELL_VERSION__";
const SHELL = [
  "/offline.html",
  "/offline.css",
  "/offline-draft.js",
  "/app-icon.svg",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("mylife-shell-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin")
  )
    return;
  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) => (await cache.match(url.pathname)) || fetch(request),
        ),
    );
  } else if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await (await caches.open(CACHE)).match("/offline.html")) ||
          Response.error(),
      ),
    );
  }
});
