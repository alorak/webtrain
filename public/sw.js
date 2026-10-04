const CACHE_NAME = "webtrain-shell-v1";

const scopeUrl = () => new URL("./", self.registration.scope).href;

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const root = scopeUrl();

  try {
    const response = await fetch(root, { cache: "reload" });
    if (!response.ok) return;

    const html = await response.clone().text();
    await cache.put(root, response);

    const discovered = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], root))
      .filter((url) => url.origin === self.location.origin)
      .map((url) => url.href);

    const extras = [
      new URL("manifest.webmanifest", root).href,
      new URL("icons/webtrain-192.png", root).href,
      new URL("icons/webtrain-512.png", root).href,
      new URL("icons/webtrain.svg", root).href,
    ];

    await Promise.all(
      [...new Set([...discovered, ...extras])].map(async (url) => {
        try {
          const asset = await fetch(url, { cache: "reload" });
          if (asset.ok) await cache.put(url, asset);
        } catch {
          // A single optional asset should not block installation.
        }
      }),
    );
  } catch {
    // The current page is already open; installation may retry on next visit.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheAppShell().then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("webtrain-shell-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(scopeUrl(), response.clone());
          }
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(event.request)) ||
            (await caches.match(scopeUrl())) ||
            Response.error()
          );
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    }),
  );
});
