'use strict';
/* Public shell only: API/authenticated responses are NEVER cached. */
const CACHE='edusphere-public-v7';
const SHELL=['/','/style.css','/design.css','/premium.css','/theme-v4.css','/v6.css','/v7.css','/app.js','/features-ui.js','/cms-ui.js','/operations-ui.js','/v5-ui.js','/v6-ui.js','/v7-ui.js','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()).catch(()=>{})));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/socket.io/'))return;
 if(SHELL.includes(u.pathname)&&u.pathname!=='/'){e.respondWith(fetch(e.request).then(r=>{if(r.ok&&r.type==='basic'){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));}});
