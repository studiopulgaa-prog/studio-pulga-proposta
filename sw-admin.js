// sw-admin.js — service worker do app do admin (PWA). Escopo: só "/admin.html".
// A versão vem do endereço de registro (/sw-admin.js?v=<commit>): cada deploy registra um endereço novo, então o
// navegador instala esta versão sozinho (skipWaiting + clients.claim) e apaga os caches antigos.
// Página e arquivos do admin: SEMPRE da rede primeiro; o cache só serve de reserva sem internet. /api nunca passa por cache.
var V = new URL(self.location.href).searchParams.get('v') || 'dev';
var CACHE = 'sp-admin-' + V;
var ARQS = ['/admin.html', '/admin-app.js', '/admin-envio.js', '/admin-emails.js', '/admin-historico.js', '/admin-email.js', '/admin-pwa.js', '/admin-conteudo.js', '/conteudo-campos.js', '/admin-atendimento.js', '/admin-os.js', '/admin-os.css', '/atendimento.js', '/atendimento.css', '/manifest.json'];
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(ARQS.map(function (u) { return c.add(new Request(u, {cache: 'no-store'})).catch(function () {}); })); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || u.pathname.indexOf('/api/') === 0) return;   // /api e outros sites: direto na rede
  var doAdmin = r.mode === 'navigate' || ARQS.indexOf(u.pathname) >= 0 || u.pathname.indexOf('/icons/') === 0;
  if (!doAdmin) return;
  e.respondWith(fetch(r, {cache: 'no-store'}).then(function (resp) {
    if (resp && resp.ok && resp.type === 'basic') { var cp = resp.clone(); caches.open(CACHE).then(function (c) { c.put(r.mode === 'navigate' ? '/admin.html' : r, cp); }); }
    return resp;
  }).catch(function () {
    return caches.match(r.mode === 'navigate' ? '/admin.html' : r).then(function (m) { return m || Response.error(); });
  }));
});
