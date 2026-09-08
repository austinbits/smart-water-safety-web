import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const dist = path.resolve("dist");
const list = [];
function walk(p) {
  for (const f of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, f.name);
    if (f.isDirectory()) walk(full);
    else if (/\.(js|css)$/.test(f.name))
      list.push("/" + path.relative(dist, full).replaceAll("\\", "/"));
  }
}
walk(path.join(dist, "assets"));
const assets = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/data/manifest.json",
  "/data/catalog.json",
  ...["calangute", "muthathi", "dudhsagar"].flatMap((s) => [
    `/data/${s}.json`,
    `/data/kml/${s}.kml`,
  ]),
  ...list,
];
const digest = createHash("sha256");
for (const asset of assets.filter((a) => a !== "/"))
  digest.update(fs.readFileSync(path.join(dist, asset.slice(1))));
const version = digest.digest("hex").slice(0, 12);
const worker = `const CACHE='sws-app-${version}',ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('sws-app-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api')||url.pathname.startsWith('/socket.io'))return;
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match('/index.html'))));return;}
 if(ASSETS.includes(url.pathname)||url.pathname.startsWith('/data/kml/'))e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(hit=>hit||fetch(e.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return response;})));
});`;
fs.writeFileSync(path.join(dist, "sw.js"), worker);
console.log(
  `Offline app shell prepared: ${assets.length} local assets. External map tiles are not bulk-cached.`,
);
