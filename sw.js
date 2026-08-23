/* PixelCraft Academy — precache same-origin.
   I path sono relativi a questo file, quindi funziona anche su
   un project site GitHub Pages (https://utente.github.io/repo/). */
const VERSION = "pixelcraft-gh-v8";

/* Senza questi l'app non parte offline. */
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./vendor/tf.min.js",
  "./models/mobilenet/model.json",
  "./models/mobilenet/weights.bin",
  "./js/strings.js",
  "./js/knn.js",
  "./js/image.js",
  "./js/speech.js",
  "./js/store.js",
  "./js/brain.js",
  "./js/explain.js",
  "./js/app.js",
];

/* Utili ma non vitali: se falliscono, l'app funziona lo stesso. */
const EXTRA = [
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./404.html",
  "./og.jpg",
];

/* addAll() e' tutto-o-niente: un singolo file fallito su rete mobile
   scartava l'intero precache in silenzio e l'app non partiva piu' offline,
   senza alcun errore visibile. Qui ogni file va per conto suo, e se manca
   qualcosa di vitale l'install fallisce in modo esplicito. */
async function putAll(cache, urls) {
  const failed = [];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: "reload" }));
        if (!res || !res.ok) throw new Error("HTTP " + (res && res.status));
        await cache.put(url, res);
      } catch (err) {
        failed.push(url + " (" + err.message + ")");
      }
    }),
  );
  return failed;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      const missingCore = await putAll(cache, CORE);
      const missingExtra = await putAll(cache, EXTRA);
      if (missingExtra.length) console.warn("[sw] opzionali non messi in cache:", missingExtra);
      if (missingCore.length) {
        console.error("[sw] precache incompleto:", missingCore);
        throw new Error("precache incompleto: " + missingCore.join(", "));
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const heavy =
    url.pathname.includes("/models/") ||
    url.pathname.endsWith("/tf.min.js") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".svg");

  event.respondWith(heavy ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) (await caches.open(VERSION)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === "navigate") {
      const home = (await caches.match("./")) || (await caches.match("./index.html"));
      if (home) return home;
    }
    throw new Error("offline");
  }
}
