// proposta-pixel.js — Meta Pixel SÓ na página do cliente (nunca no admin) e SÓ com um ID configurado em Ajustes.
// Eventos: PageView e ViewContent ao abrir; ViewContent por aba/plano visto; Lead ao escolher ou chamar no WhatsApp.
// Nunca envia nome, e-mail ou telefone. Não carrega no aparelho marcado como do admin nem na prévia do admin.
// Teste: ?sp_pixel_teste=1 carrega mesmo no aparelho do admin (os acessos continuam sem contar no painel).
(function () {
  var ON = false, CAT = '', NICHO = '', ultimoLead = 0, vistos = {};
  var MODELOS = {arq: 'Arquiteto', loja: 'Loja', cd: 'Cardápio', mi: 'Especial Milão'};
  function doAdmin() { try { return localStorage.getItem('sp_nao_contar') === '1'; } catch (e) { return false; } }
  function teste() { return /[?&]sp_pixel_teste=1(&|$)/.test(location.search); }
  function carrega(id) {
    /* código oficial do Meta Pixel */
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('set', 'autoConfig', false, id);   // sem coleta automática de botões e campos (nada do formulário vai para a Meta)
    window.fbq('init', id);
  }
  function params(nome, extra) {
    var p = {content_name: String(nome || '').slice(0, 80), content_category: CAT};
    if (NICHO) p.nicho = NICHO;
    for (var k in extra) if (extra.hasOwnProperty(k)) p[k] = extra[k];
    return p;
  }
  function numero(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).replace(/[^\d,.]/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/\.(?=\d{3}(\D|$))/g, '');
    var n = parseFloat(s); return isFinite(n) ? n : null;
  }
  function aviso() {
    var f = document.querySelector('.footer-proposta'); if (!f || document.getElementById('spCookie')) return;
    var d = document.createElement('div'); d.id = 'spCookie'; d.textContent = 'Usamos cookies para medir o desempenho desta página.';
    d.style.cssText = 'font-size:10px;line-height:1.4;opacity:.6;margin-top:8px;';
    f.appendChild(d);
  }
  // chamado por proposta-conteudo.js depois que a página foi desenhada (proposta válida)
  window.spPixel = function (st, modelo) {
    try {
      if (ON || window.SP_EM_PREVIA) return;
      var id = String((st && st.pixel) || '');
      if (!/^\d{5,20}$/.test(id)) return;            // sem ID configurado: nada carrega
      if (doAdmin() && !teste()) return;              // aparelho do admin: nunca
      CAT = MODELOS[modelo] || ''; NICHO = st.nicho && /^[a-z]{2,20}$/.test(st.nicho) ? st.nicho : '';
      carrega(id); ON = true;
      window.fbq('track', 'PageView');
      window.fbq('track', 'ViewContent', params('Proposta'));
      var P = window.PROPOSTA || {}, C3 = window.C3;
      if (P.tipo === 'cardapio' && C3 && C3.tab) window.spPixelVer((window.C3_NOMES || {})[C3.tab] || C3.tab);
      aviso();
    } catch (e) {}
  };
  // aba ou plano visto (uma vez cada)
  window.spPixelVer = function (nome) {
    try { if (!ON || !nome || vistos[nome]) return; vistos[nome] = 1; window.fbq('track', 'ViewContent', params(nome)); } catch (e) {}
  };
  // escolha ou WhatsApp: um Lead por clique (a escolha já abre o WhatsApp: não conta duas vezes)
  window.spPixelLead = function (item, valor) {
    try {
      if (!ON) return;
      var t = Date.now(); if (t - ultimoLead < 3000) return; ultimoLead = t;
      var v = numero(valor), extra = v != null ? {value: v, currency: 'BRL'} : {};
      window.fbq('track', 'Lead', params(item || 'WhatsApp', extra));
    } catch (e) {}
  };
})();
