// admin-pwa.js — registra o service worker com a versão do deploy e mostra "Nova versão disponível — Atualizar"
// quando há deploy novo (confere ao voltar para o app e a cada 5 minutos).
(function () {
  'use strict';
  var V0 = null, reg = null, faixa = null;
  function versao() { return fetch('/api/versao', {cache: 'no-store'}).then(function (r) { return r.json(); }).then(function (j) { return j && j.v; }); }
  function mostrar() {
    if (faixa) return;
    faixa = document.createElement('div');
    faixa.id = 'spNovaVersao'; faixa.setAttribute('role', 'status');
    faixa.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top));z-index:9999;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:14px;background:#6E2C14;color:#F4EADD;font-family:Inter,system-ui,Arial,sans-serif;font-size:15px;font-weight:500;box-shadow:0 6px 24px rgba(0,0,0,.18);max-width:520px;margin:0 auto;';
    var t = document.createElement('span'); t.textContent = 'Nova versão disponível';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Atualizar';
    b.style.cssText = 'min-height:44px;padding:8px 18px;border:none;border-radius:50px;background:#F4EADD;color:#6E2C14;font-family:inherit;font-weight:600;font-size:15px;cursor:pointer;';
    b.addEventListener('click', function () {
      b.disabled = true; b.textContent = 'Atualizando…';
      var fim = function () { location.reload(); };
      if (reg && reg.update) reg.update().then(fim, fim); else fim();
    });
    faixa.appendChild(t); faixa.appendChild(b); document.body.appendChild(faixa);
  }
  function conferir() { versao().then(function (v) { if (V0 && v && v !== V0) mostrar(); }).catch(function () {}); }
  window.spConferirVersao = conferir;
  if (!('serviceWorker' in navigator)) { versao().then(function (v) { V0 = v; }).catch(function () {}); return; }
  window.addEventListener('load', function () {
    versao().then(function (v) { V0 = v || 'dev'; }).catch(function () { V0 = null; }).then(function () {
      return navigator.serviceWorker.register('/sw-admin.js' + (V0 ? '?v=' + encodeURIComponent(V0) : ''), {scope: '/admin.html'});
    }).then(function (r) { reg = r; }).catch(function () {});
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') conferir(); });
  setInterval(conferir, 5 * 60 * 1000);
})();
