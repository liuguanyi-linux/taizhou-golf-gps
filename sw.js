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
function inScope(url){try{const u=new URL(url);return u.origin===ROOT.origin&&u.pathname.startsWith(ROOT.pathname);}catch(_){return false;}}
self.addEventListener('message',event=>{
  if(event.data?.type!=='ACTIVATE_SAVED_UPDATE'||!event.source?.id||!inScope(event.source.url))return;
  event.waitUntil((async()=>{
    try{
      const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      // A confirmation in one tab must not switch resources beneath another editor.
      if(windows.some(client=>client.id!==event.source.id&&inScope(client.url))){
        event.source.postMessage({type:'GOLF_UPDATE_BLOCKED',reason:'other-windows'});return;
      }
      await self.skipWaiting();
    }catch(_){event.source.postMessage({type:'GOLF_UPDATE_BLOCKED',reason:'check-failed'});}
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const u=new URL(event.request.url);u.search='';u.hash='';
  if(u.pathname.endsWith('/'))u.pathname+='index.html';
  if(!urls.has(u.href))return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(u.href)||fetch(event.request);})());
});
