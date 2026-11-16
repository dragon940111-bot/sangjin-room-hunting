// 버전 b4ee2688c0
const C='sangjin-room-b4ee2688c0';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png'])));});
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys()){if(k!==C&&k.startsWith('sangjin-room-'))await caches.delete(k);}await self.clients.claim();})()));
async function fresh(){const c=await caches.open(C);const old=await c.match('index.html');
  try{const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),8000);
    const r=await fetch('index.html',{cache:'no-store',signal:ctl.signal});clearTimeout(t);
    if(r.ok){const et=r.headers.get('etag')||r.headers.get('last-modified')||'';const oe=old?(old.headers.get('etag')||old.headers.get('last-modified')||''):'';
      await c.put('index.html',r.clone());
      if(old&&et&&et!==oe){(await self.clients.matchAll()).forEach(cl=>cl.postMessage({type:'updated'}));}
      return r;}
  }catch(e){}
  return old||Response.error();}
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
  if(e.request.mode==='navigate'||u.pathname.endsWith('/index.html')||u.pathname.endsWith('/')){e.respondWith(fresh());return;}
  if(u.origin===location.origin){e.respondWith(caches.open(C).then(async c=>{const hit=await c.match(e.request);if(hit)return hit;
    const r=await fetch(e.request);if(r.ok)c.put(e.request,r.clone());return r;}));}
});
