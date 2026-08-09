const CACHE_NAME = "kcf-pwa-v1";
const ASSETS = [
  "./",
  "index.html",
  "about.html",
  "vision.html",
  "ministrie.html",
  "event.html",
  "membership.html",
  "contact.html",
  "gallery.html",
  "admin.html",
  "admin-login.html",
  "umma.css",
  "membership.css",
  "admin.css",
  "script.js",
  "membership.js",
  "admin.js",
  "logo.svg",
  "favicon.svg",
  "manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).then((response) => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("index.html")))
  );
});
