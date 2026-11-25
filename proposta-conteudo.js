// proposta-conteudo.js — aplica na página do cliente os textos publicados na aba "Conteúdo" do admin.
// Sem nada publicado para esta proposta, NADA muda (nenhum elemento é tocado).
// Também cuida da prévia do admin (página dentro do admin, com dados fictícios: nada é registrado nem enviado).
(function () {
  var CAMPOS = window.SP_CAMPOS;
  var WA_PADRAO = '5513996057099';
  // ---- prévia do admin: só dentro de um quadro do próprio site, com ?previa=1 ----
  var PREVIA = null;
  try {
    if (/[?&]previa=1(&|$)/.test(location.search) && window.parent !== window && window.parent.SP_PREVIA) PREVIA = window.parent.SP_PREVIA;
  } catch (e) { PREVIA = null; }
  if (PREVIA) {
    window.SP_EM_PREVIA = true;
    window.fetch = function (u) {
      u = String(u && u.url ? u.url : u);
      if (u.indexOf('/rpc/proposta_status') >= 0) {
        var agora = Date.now();
        var st = {existe: true, valida: true, expirada: false, expira_em: new Date(agora + 3 * 86400000).toISOString(), agora: new Date(agora).toISOString(), conteudo: PREVIA.pagina(), zap: PREVIA.zap ? PREVIA.zap() : null};
        return Promise.resolve(new Response(JSON.stringify(st), {status: 200, headers: {'Content-Type': 'application/json'}}));
      }
      return Promise.resolve(new Response('null', {status: 200, headers: {'Content-Type': 'application/json'}}));   // nada sai da prévia
    };
    window.open = function () { return {}; };
    try { navigator.sendBeacon = function () { return true; }; } catch (e) {}
  }

  var ST = null, OVER = null, MODELO = null;
  function modelo() {
    var P = window.PROPOSTA || {};
    if (P.tipo !== 'cardapio') return P.mo === 'loja' ? 'loja' : 'arq';
    var C3 = window.C3;
    return C3 && C3.tabs && C3.tabs.length === 1 && C3.tabs[0] === 'milao' ? 'mi' : 'cd';
  }
  function zapOk(z) { return typeof z === 'string' && /^55\d{10,11}$/.test(z); }
  // troca o WhatsApp do estúdio (só se foi alterado em "Dados gerais")
  function aplicaZap(z) {
    if (!zapOk(z) || z === WA_PADRAO) return;
    try { window.WA_NUM = z; } catch (e) {}
    try { window.C3_ZAP = z; } catch (e) {}
    var b = document.getElementById('expiredBtn'); if (b && b.href) b.href = b.href.split('wa.me/' + WA_PADRAO).join('wa.me/' + z);
    if (!window.__spZap) {
      window.__spZap = true;
      var o = window.open;
      window.open = function (url) {
        var a = Array.prototype.slice.call(arguments);
        if (typeof url === 'string') a[0] = url.split('wa.me/' + WA_PADRAO).join('wa.me/' + (window.SP_ZAP || WA_PADRAO));
        return o.apply(window, a);
      };
    }
    window.SP_ZAP = z;
  }
  function campos(m) { return (CAMPOS && CAMPOS.pagina && CAMPOS.pagina[m]) || []; }
  function valor(c) { var v = OVER && OVER[c.k]; return typeof v === 'string' && v.trim() !== '' && v !== c.def ? v : null; }
  // antes de desenhar: variáveis usadas na montagem (ex.: formas de pagamento)
  function antes() {
    campos(MODELO).forEach(function (c) {
      if (!c.vr) return;
      if (!('__spDef_' + c.vr in window)) window['__spDef_' + c.vr] = window[c.vr];
      var v = valor(c); window[c.vr] = v != null ? v.replace(/\*\*/g, '') : window['__spDef_' + c.vr];
    });
    var P = window.PROPOSTA;
    if (P && window.PL_NOMES && MODELO !== 'cd' && MODELO !== 'mi') {   // nomes dos pacotes também na mensagem do WhatsApp
      [1, 2, 3].forEach(function (n) {
        var c = campos(MODELO).filter(function (x) { return x.plano === n; })[0]; if (!c) return;
        var v = valor(c); window.PL_NOMES[n] = n + 'º Pacote — ' + (v != null ? v.replace(/\*\*/g, '').replace(/\s+/g, ' ') : c.def);
      });
    }
  }
  // depois de desenhar: troca só os textos alterados (guarda o original para voltar)
  function depois() {
    campos(MODELO).forEach(function (c) {
      if (!c.sel) return;
      var v = valor(c), els = document.querySelectorAll(c.sel);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.__spOrig == null) { if (v == null) continue; el.__spOrig = el.innerHTML; }
        el.innerHTML = v != null ? CAMPOS.html(v) : el.__spOrig;   // texto escapado (só negrito e quebras)
      }
    });
  }
  // chamado por proposta.html: fase 'antes' (resposta do servidor) e 'depois' (página desenhada)
  window.spConteudo = function (st, fase) {
    try {
      if (fase === 'antes') {
        ST = st || {};
        OVER = null;
        if (PREVIA && window.PROPOSTA) { window.PROPOSTA.nome = PREVIA.nome || 'Cliente Teste'; }
        aplicaZap(ST.zap);
        return;
      }
      MODELO = modelo();
      if (window.spPixel) window.spPixel(ST, MODELO);   // Meta Pixel (só com ID configurado; nunca no admin)
      var pg = ST && ST.conteudo && typeof ST.conteudo === 'object' ? ST.conteudo : null;
      OVER = pg && pg[MODELO] && typeof pg[MODELO] === 'object' ? pg[MODELO] : null;
      if (!OVER && !PREVIA) return;   // nada publicado: não toca em nada
      antes();
      depois();
      if (typeof window.c3Tab === 'function' && !window.c3Tab.__sp) {   // abas desenhadas depois (Milão)
        var f = window.c3Tab; window.c3Tab = function () { var r = f.apply(this, arguments); try { depois(); } catch (e) {} return r; }; window.c3Tab.__sp = true;
      }
    } catch (e) {}
  };
  // planos: as formas de pagamento são montadas na hora; aplica antes de desenhar
  window.spConteudoAntes = function () { try { MODELO = modelo(); var pg = ST && ST.conteudo; OVER = pg && pg[MODELO] || null; if (OVER || PREVIA) antes(); } catch (e) {} };
  // prévia ao vivo: o admin chama depois de cada edição
  window.spPreviaAplicar = function () {
    if (!PREVIA) return;
    try { ST.conteudo = PREVIA.pagina(); ST.zap = PREVIA.zap ? PREVIA.zap() : null; aplicaZap(ST.zap); window.spConteudoAntes(); depois(); } catch (e) {}
  };
})();
