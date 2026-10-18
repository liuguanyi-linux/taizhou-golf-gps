/* Versioned app shell only. Never cache APIs, GPS uploads or external map tiles. */
importScripts('./app/precache.js');
const CACHE='golf-workbench-'+self.GOLF_BUILD.id,ROOT=new URL('./',self.location.href);
const urls=new Set(self.GOLF_BUILD.files.map(p=>new URL(p,ROOT).href));
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const c=await caches.open(CACHE);
  try{await c.addAll([...urls].map(url=>new Request(url,{cache:'reload'})));}catch(e){await caches.delete(CACHE);throw e;}
  // No skipWaiting: don't swap code underneath an active editor.
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_SAVED_UPDATE')event.waitUntil(self.skipWaiting());});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const u=new URL(event.request.url);u.search='';u.hash='';
  if(u.pathname.endsWith('/'))u.pathname+='index.html';
  if(!urls.has(u.href))return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(u.href)||fetch(event.request);})());
});
