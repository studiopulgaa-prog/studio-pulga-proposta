// proposta-track.js — registra o que o cliente fez na proposta (abriu, aba, plano visto, escolheu, WhatsApp),
// com tipo de aparelho e navegador. Nada aparece na tela; sem IP; erro aqui nunca afeta a proposta.
// Navegador marcado pelo admin (localStorage "sp_nao_contar") não é contado.
(function () {
  'use strict';
  function ignorar() { try { return localStorage.getItem('sp_nao_contar') === '1'; } catch (e) { return false; } }
  function aparelho() {
    var ua = navigator.userAgent || '';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/iPhone|iPod/.test(ua)) return 'iPhone';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'Computador';
    return 'Outro';
  }
  function navegador() {
    var ua = navigator.userAgent || '';
    if (/Instagram/.test(ua)) return 'Instagram';
    if (/FBAN|FBAV/.test(ua)) return 'Facebook';
    if (/WhatsApp/i.test(ua)) return 'WhatsApp';
    if (/SamsungBrowser/.test(ua)) return 'Samsung';
    if (/Edg\//.test(ua)) return 'Edge';
    if (/OPR\/|Opera/.test(ua)) return 'Opera';
    if (/Firefox|FxiOS/.test(ua)) return 'Firefox';
    if (/Chrome|CriOS/.test(ua)) return 'Chrome';
    if (/Safari/.test(ua)) return 'Safari';
    return 'Outro';
  }
  function lh() { return window.PROPOSTA && typeof PROPOSTA.lh === 'string' ? PROPOSTA.lh : ''; }
  function disp() { try { return typeof deviceId === 'function' ? deviceId() : ''; } catch (e) { return ''; } }
  function envia(evento, detalhe) {
    try {
      if (ignorar()) return;
      var p = lh(), d = disp();
      if (!p || !d) return;
      detalhe = detalhe ? String(detalhe).slice(0, 60) : null;
      var k = 'ev_' + p + '_' + evento + '_' + (detalhe || '');
      try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) {}
      fetch(SUPA + '/rest/v1/acessos', {
        method: 'POST', keepalive: true,
        headers: {'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Prefer': 'return=minimal'},
        body: JSON.stringify({proposta_id: p, dispositivo_hash: d, evento: evento, detalhe: detalhe, disp_tipo: aparelho(), navegador: navegador()})
      }).catch(function () {});
    } catch (e) {}
  }
  window.spTrack = envia;
  function embrulha(nome, antes) {
    var f = window[nome];
    if (typeof f !== 'function') return;
    window[nome] = function () { try { antes.apply(this, arguments); } catch (e) {} return f.apply(this, arguments); };
  }
  // abriu (substitui o registro antigo: mesmo momento, mais detalhes)
  window.registrarAcesso = function () {
    try {
      if (!window.PROPOSTA || !PROPOSTA.nome) return;
      envia('abriu', null);
      if (PROPOSTA.tipo === 'cardapio' && window.C3 && C3.tab) envia('aba', C3.tab);
      observaPlanos();
    } catch (e) {}
  };
  // Planos de gestão: "Escolher Plano X"
  embrulha('fecharPlano', function (e, num) { envia('escolheu', 'P' + num); });
  // Cardápio: troca de aba
  embrulha('c3Tab', function (id) { envia('aba', id); });
  // WhatsApp (qualquer botão que abre o WhatsApp) e "Quero este pacote" do Cardápio
  var abre = window.open;
  window.open = function (url) {
    try {
      var u = String(url || '');
      if (u.indexOf('wa.me/') >= 0) {
        var txt = ''; try { txt = decodeURIComponent((u.split('text=')[1] || '').replace(/\+/g, ' ')); } catch (e) {}
        if (/Quero este pacote/.test(txt)) {
          var aba = (txt.match(/\(aba ([^)]+)\)/) || [])[1];
          envia('escolheu', 'Pacote' + (aba ? ' · ' + aba : ''));
        } else if (/Especial Milão/.test(txt)) envia('escolheu', 'Especial Milão');
        envia('whatsapp', null);
      }
    } catch (e) {}
    return abre.apply(window, arguments);
  };
  // Plano visto: cartão na tela (60%) por 1,5 s
  var observado = false;
  function observaPlanos() {
    if (observado || !('IntersectionObserver' in window)) return;
    observado = true;
    var timers = {};
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        var i = en.target.id.replace('plano', ''), nome = 'P' + (Number(i) + 1);
        if (en.isIntersecting && en.intersectionRatio >= 0.6) timers[i] = setTimeout(function () { envia('viu_plano', nome); }, 1500);
        else clearTimeout(timers[i]);
      });
    }, {threshold: [0, 0.6]});
    ['plano0', 'plano1', 'plano2'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.offsetParent !== null && el.style.display !== 'none') io.observe(el);
    });
  }
})();
