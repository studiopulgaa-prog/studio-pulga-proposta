// sw-atendimento.js — service worker do app "Atendimento Studio Pulga". Escopo: /atendimento.html.
// Casca do app em cache (abre rápido e sem internet); a rede vem primeiro. /api NUNCA passa por cache.
// Recebe as notificações (Web Push) e, ao tocar, abre a conversa.
var V = new URL(self.location.href).searchParams.get('v') || 'dev';
var CACHE = 'sp-atend-' + V;
var ARQS = ['/atendimento.html', '/atendimento.js', '/atendimento.css', '/manifest-atendimento.json', '/icons/icon-192.png'];
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(ARQS.map(function (u) { return c.add(new Request(u, {cache: 'no-store'})).catch(function () {}); })); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('sp-atend-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || u.pathname.indexOf('/api/') === 0) return;
  if (!(r.mode === 'navigate' || ARQS.indexOf(u.pathname) >= 0)) return;
  e.respondWith(fetch(r, {cache: 'no-store'}).then(function (resp) {
    if (resp && resp.ok && resp.type === 'basic') { var cp = resp.clone(); caches.open(CACHE).then(function (c) { c.put(r.mode === 'navigate' ? '/atendimento.html' : r, cp); }); }
    return resp;
  }).catch(function () { return caches.match(r.mode === 'navigate' ? '/atendimento.html' : r).then(function (m) { return m || Response.error(); }); }));
});
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = {b: e.data ? e.data.text() : ''}; }
  var url = /^\/[a-z0-9._\-/?=&#]*$/i.test(d.u || '') ? d.u : '/atendimento.html';
  e.waitUntil(self.registration.showNotification(d.t || 'Atendimento', {body: d.b || '', tag: d.g || 'sp', renotify: true, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: {url: url}}));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/atendimento.html';
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { var c = cs[i]; if (new URL(c.url).pathname === '/atendimento.html') { c.postMessage({tipo: 'abrir', url: url}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
