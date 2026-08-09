const CACHE_NAME = "kcf-pwa-v3";
const SHELL_ASSETS = [
  "./", "index.html", "membership.html", "admin-login.html", "admin.html",
  "umma.css", "membership.css", "admin.css", "script.js", "membership.js", "admin.js",
  "supabase-firebase-compat.js", "supabase-config.js", "runtime-config.js",
  "logo.svg", "favicon.svg", "manifest.webmanifest",
  "member-manifest.webmanifest", "admin-manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("kcf-pwa-") && key !== CACHE_NAME).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const page = url.pathname.endsWith("admin.html") || url.pathname.endsWith("admin-login.html")
        ? "admin-login.html"
        : url.pathname.endsWith("membership.html") ? "membership.html" : "index.html";
      return (await caches.match(page)) || Response.error();
    }));
    return;
  }

  const mustRefresh = ["script", "style", "worker", "manifest"].includes(request.destination)
    || /\.(?:js|css|webmanifest)$/i.test(url.pathname);

  if (mustRefresh) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    }).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
    }
    return response;
  })));
});
