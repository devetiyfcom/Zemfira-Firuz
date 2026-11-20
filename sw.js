// Dəvətnamə üçün offline keş
const CACHE = "zf-devetname-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
const MEDIA = ["./video.mp4", "./musiqi.mp3"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    // Video və musiqi: hansı varsa onu saxla
    await Promise.all(MEDIA.map((u) => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Video/musiqi üçün Range sorğusunu keşdən 206 cavabı ilə ver (Safari üçün vacibdir)
async function rangeResponse(req, cached) {
  const range = req.headers.get("range");
  const buf = await cached.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range || "");
  const size = buf.byteLength;
  const start = m && m[1] ? Number(m[1]) : 0;
  const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google şriftləri: əvvəl keş, sonra şəbəkə
  if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com")) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }
      catch { return Response.error(); }
    })());
    return;
  }
  if (url.origin !== location.origin) return;

  if (/\.(mp4|mp3)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const cached = await c.match(url.pathname.startsWith("/") ? new Request(url.href) : req, { ignoreSearch: true });
      if (cached) return req.headers.get("range") ? rangeResponse(req, cached) : cached;
      return fetch(req);
    })());
    return;
  }

  // Səhifə: əvvəl şəbəkə (yeniləmələr görünsün), internet yoxdursa keş
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    } catch {
      return (await c.match(req, { ignoreSearch: true })) || (await c.match("./index.html")) || Response.error();
    }
  })());
});
