// proposta-track.js — registra o que o cliente fez na proposta (abriu, aba, plano visto, escolheu, WhatsApp),
// com tipo de aparelho e navegador. Nada aparece na tela; sem IP; erro aqui nunca afeta a proposta.
// Navegador marcado pelo admin (localStorage "sp_nao_contar") não é contado.
(function () {
  'use strict';
  function ignorar() { if (window.SP_EM_PREVIA) return true; try { return localStorage.getItem('sp_nao_contar') === '1'; } catch (e) { return false; } }
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
  function envia(evento, detalhe, valor) {
    try {
      if (ignorar()) return;
      var p = lh(), d = disp();
      if (!p || !d) return;
      detalhe = detalhe ? String(detalhe).slice(0, 60) : null;
      valor = valor ? String(valor).slice(0, 40) : null;
      var k = 'ev_' + p + '_' + evento + '_' + (detalhe || '');
      try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) {}
      fetch(SUPA + '/rest/v1/acessos', {
        method: 'POST', keepalive: true,
        headers: {'Content-Type': 'application/json', 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Prefer': 'return=minimal'},
        body: JSON.stringify(valor ? {proposta_id: p, dispositivo_hash: d, evento: evento, detalhe: detalhe, valor: valor, disp_tipo: aparelho(), navegador: navegador()}
                                   : {proposta_id: p, dispositivo_hash: d, evento: evento, detalhe: detalhe, disp_tipo: aparelho(), navegador: navegador()})
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
  // ESCOLHA: registrada no clique final ("Enviar pedido" / "Quero este pacote"), ANTES de abrir o WhatsApp, com item e valor
  function brl(n) { try { return typeof cdFmt === 'function' ? cdFmt(n) : String(n); } catch (e) { return String(n); } }
  embrulha('enviarPedidoPlano', function (num) {
    var nomes = window.PL_NOMES || {}, vals = {1: PROPOSTA.v1, 2: PROPOSTA.v2, 3: PROPOSTA.v3};
    var item = String(nomes[num] || (num + 'º Pacote')).split(' — ')[0];
    envia('escolheu', item, vals[num] ? 'R$ ' + vals[num] + '/mês' : null);
    if (window.spPixelLead) spPixelLead(item, vals[num]);
  });
  embrulha('finalizarPedido', function (d, t) {
    t = t || {};
    var nomes = {avulsos: 'Avulsos', recorrente: 'Recorrente', milao: 'Especial Milão'};
    var aba = window.C3 && C3.tab && C3.tabs && C3.tabs.length ? ((window.C3_NOMES || {})[C3.tab] || nomes[C3.tab] || C3.tab) : '';
    var itens = [];
    (t.g || []).forEach(function (g) { (g.l || []).forEach(function (l) { if (l && l.t && !/^Parcela:/.test(l.t)) itens.push(String(l.t).split(' (')[0]); }); });
    var item = (aba ? aba + ': ' : '') + (itens.join(' + ') || 'Pacote');
    var valor = (t.m ? 'R$ ' + brl(t.m) + '/mês' : '') + (t.m && t.u ? ' + ' : '') + (t.u ? 'R$ ' + brl(t.u) : '');
    envia('escolheu', item, valor || null);
    if (window.spPixelLead) spPixelLead(item, t.m || t.u || null);
  });
  // Cardápio: troca de aba
  // Cardápio antigo (v1): "Quero este pacote" com os totais
  embrulha('cdQuero', function () {
    try {
      if (!(Date.now() <= PROPOSTA.expira) || typeof cdTotais !== 'function') return;
      var t = cdTotais(); if (!t || !t.n) return;
      var valor = (t.m ? 'R$ ' + brl(t.m) + '/mês' : '') + (t.m && t.u ? ' + ' : '') + (t.u ? 'R$ ' + brl(t.u) : '');
      envia('escolheu', 'Pacote', valor || null);
      if (window.spPixelLead) spPixelLead('Pacote', t.m || t.u || null);
    } catch (e) {}
  });
  embrulha('c3Tab', function (id) { envia('aba', id); });
  // WhatsApp (qualquer botão que abre o WhatsApp) e "Quero este pacote" do Cardápio
  var abre = window.open;
  window.open = function (url) {
    try {
      var u = String(url || '');
      if (u.indexOf('wa.me/') >= 0) {
        var txt = ''; try { txt = decodeURIComponent((u.split('text=')[1] || '').replace(/\+/g, ' ')); } catch (e) {}
        if (/interesse no Especial Milão/.test(txt)) {   // "Quero saber mais" do Especial Milão
          var tot = window.C3 && C3.mi && C3.mi.cfg && C3.mi.cfg.total;
          envia('escolheu', 'Especial Milão', tot ? 'R$ ' + brl(tot) : null);
          if (window.spPixelLead) spPixelLead('Especial Milão', tot || null);
        }
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
