const CACHE='kilometric-public-v1';
const PUBLIC=['/offline.html','/icon-192.png','/icon-512.png','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PUBLIC)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('kilometric-public-')||key.startsWith('fleetwise-public-'))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const {request}=event,url=new URL(request.url);
  // Never cache authenticated API responses, trip records or GPS requests.
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.match('/offline.html')));return;}
  if(PUBLIC.includes(url.pathname))event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});
