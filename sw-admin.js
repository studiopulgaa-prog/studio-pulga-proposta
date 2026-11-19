// sw-admin.js — service worker MINIMO do admin instalavel (PWA).
// Nao guarda nada em cache: nenhuma resposta de /api, nenhum dado de proposta, nem a propria pagina.
// O escopo e so "/admin.html" (definido no registro): a pagina do cliente e o link curto nao passam por aqui.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  // limpa qualquer cache que exista de versoes antigas e assume as abas abertas
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
// sem respondWith: toda requisicao segue direto para a rede, como se nao houvesse service worker
self.addEventListener('fetch', function () {});
