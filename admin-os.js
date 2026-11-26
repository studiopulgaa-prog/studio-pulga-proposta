// admin-os.js — Studio OS: menu (sidebar/barra inferior + "Mais"), busca global (Ctrl/Cmd+K), Início (painel do dia),
// Comercial (funil kanban + tabela), Clientes (tabela + ficha), Financeiro e partes novas de Ajustes.
// Dados do servidor entram na tela SOMENTE por textContent. Ações passam por /api/admin (adm) e /api/admin/wa (sessão).
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function E(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function B(c, x, f, rot) { var b = E('button', c, x); b.type = 'button'; if (f) b.addEventListener('click', f); if (rot) b.setAttribute('aria-label', rot); return b; }
  function I(n, sz) { var s = E('span'); s.innerHTML = window.ICO ? ICO(n, sz || 16) : ''; return s.firstChild || E('span'); }   // ícone: SVG fixo do próprio admin (sem dados)
  function BI(c, ico, x, f, rot) { var b = B(c, null, f, rot); if (ico) b.appendChild(I(ico)); if (x) b.appendChild(E('span', null, x)); return b; }
  function limpa(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }
  function msg(t, er) { if (window.histMsg) histMsg(t, er); }
  var EU = function () { return window.SP_USUARIO === 'ju' ? 'ju' : 'isaque'; };
  var NOMES = {isaque: 'Isaque', ju: 'Ju'};
  var brl = function (v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}); };
  var brl0 = function (v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', {maximumFractionDigits: 0}); };
  var DIA = 864e5;
  function rel(iso) {
    var t = Date.parse(iso || ''); if (!isFinite(t)) return '';
    var d = Date.now() - t, m = Math.round(d / 6e4);
    if (m < 1) return 'agora'; if (m < 60) return 'há ' + m + ' min';
    var h = Math.round(m / 60); if (h < 24) return 'há ' + h + ' h';
    var dd = Math.round(h / 24); if (dd < 30) return 'há ' + dd + (dd === 1 ? ' dia' : ' dias');
    return new Date(t).toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit'});
  }
  function espera(min) { if (min < 60) return min + ' min'; var h = Math.floor(min / 60); return h < 48 ? h + ' h' : Math.floor(h / 24) + ' dias'; }
  function wa(acao, dados) {
    var h = {'Content-Type': 'application/json'}; if (typeof TOKEN !== 'undefined' && TOKEN) h.Authorization = 'Bearer ' + TOKEN;
    return fetch('/api/admin/wa', {method: 'POST', credentials: 'same-origin', headers: h, body: JSON.stringify(Object.assign({acao: acao}, dados || {}))})
      .then(function (r) { if (r.status === 401) { if (window.logout) logout(true); return {ok: false, erro: 'sessão expirada'}; } if (r.status === 403) return {ok: false, erro: 'sem permissão'}; return r.json().catch(function () { return {ok: false, erro: 'resposta inválida'}; }); })
      .catch(function () { return {ok: false, erro: 'sem conexão'}; });
  }
  function sk(box, n, cls) { limpa(box); for (var i = 0; i < (n || 3); i++) box.appendChild(E('span', 'os-sk' + (cls ? ' ' + cls : ''), '')); }
  function vazio(box, t, sub) { var v = E('div', 'os-vazio'); v.appendChild(E('b', null, t)); if (sub) v.appendChild(document.createTextNode(sub)); box.appendChild(v); return v; }
  function erro(box, t, re) { var e = E('div', 'os-erro'); e.appendChild(E('span', null, t)); if (re) e.appendChild(B('os-btn sm', 'Tentar de novo', re)); box.appendChild(e); }
  function cab(sec, titulo, sub, acoes) {
    var hd = E('div', 'scr-hd'); var d = E('div');
    if (sub) d.appendChild(E('span', 'mk', sub));
    d.appendChild(E('h1', 'tt', titulo)); hd.appendChild(d);
    var ac = E('div', 'os-hd-ac'); (acoes || []).forEach(function (a) { if (a) ac.appendChild(a); }); hd.appendChild(ac);
    sec.appendChild(hd); return hd;
  }
  function kpi(box, rot, val, extras, clk) {
    var k = clk ? B('os-kpi clk', null, clk) : E('div', 'os-kpi'); k.appendChild(E('span', null, rot)); k.appendChild(E('b', null, val));
    var sm = E('small'); (extras || []).forEach(function (x) { if (x) sm.appendChild(x); }); k.appendChild(sm);
    box.appendChild(k); return k;
  }
  function tendencia(atual, ant) {
    if (ant == null || !(ant > 0)) return E('span', null, 'sem base no mês anterior');
    var p = Math.round((atual - ant) / ant * 100), s = E('span', p >= 0 ? 'up' : 'dn', (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '%');
    s.setAttribute('aria-label', (p >= 0 ? 'alta de ' : 'queda de ') + Math.abs(p) + '% em relação ao mesmo período do mês anterior'); return s;
  }
  function barra(k, p) { var b = E('div', 'bar'); var i = E('i'); i.style.width = Math.max(0, Math.min(100, p)) + '%'; b.appendChild(i); k.appendChild(b); b.setAttribute('role', 'img'); b.setAttribute('aria-label', Math.round(p) + '% da meta'); }

  // ================= menu, perfil, "Mais" =================
  function perfil() {
    var ju = EU() === 'ju';
    document.querySelectorAll('[data-perfil="isaque"]').forEach(function (el) { el.style.display = ju ? 'none' : ''; });
    var eu = $('osEu'); if (eu) { limpa(eu); eu.appendChild(E('span', null, 'Conectado como')); eu.appendChild(E('b', null, NOMES[EU()])); }
    document.body.classList.toggle('os-ju', ju);
  }
  window.osMais = function () {
    var f = E('div', 'os-dr-fundo on'), sh = E('div', 'os-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', 'Mais opções');
    var it = function (ico, t, fn) { var b = BI('', ico, t, function () { fecha(); fn(); }); sh.appendChild(b); };
    it('search', 'Buscar', abreBusca);
    it('plus', 'Nova proposta', function () { irPara('nova'); });
    if (EU() === 'isaque') { it('money', 'Financeiro', function () { irPara('fin'); }); it('edit', 'Conteúdo', function () { irPara('conteudo'); }); it('mail', 'E-mails', function () { irPara('emails'); }); it('gear', 'Ajustes', function () { irPara('ajustes'); }); }
    it('chat', 'Abrir o app de atendimento', function () { location.href = '/atendimento.html'; });
    it('logout', 'Sair (' + NOMES[EU()] + ')', function () { if (window.logout) logout(); });
    document.body.appendChild(f); document.body.appendChild(sh);
    requestAnimationFrame(function () { sh.classList.add('on'); var b0 = sh.querySelector('button'); if (b0) b0.focus(); });
    f.addEventListener('click', fecha);
    var esc = function (e) { if (e.key === 'Escape') fecha(); }; document.addEventListener('keydown', esc);
    function fecha() { document.removeEventListener('keydown', esc); sh.remove(); f.remove(); var m = document.querySelector('#navApp [data-nav="mais"]'); if (m) m.focus(); }
  };

  // ================= busca global =================
  var K = {box: null, t: null, sel: 0, itens: []};
  function abreBusca() {
    if (!K.box) {
      K.box = E('div', 'os-k'); K.box.setAttribute('role', 'dialog'); K.box.setAttribute('aria-modal', 'true'); K.box.setAttribute('aria-label', 'Buscar');
      var bx = E('div', 'os-k-box'); var ln = E('div', 'os-k-in'); ln.appendChild(I('search', 18));
      var inp = E('input'); inp.type = 'search'; inp.placeholder = 'Buscar clientes, propostas e conversas'; inp.setAttribute('aria-label', 'Buscar'); inp.id = 'osKIn'; ln.appendChild(inp);
      ln.appendChild(B('os-btn sm', 'Esc', fechaBusca, 'Fechar busca'));
      bx.appendChild(ln); var res = E('div', 'os-k-res'); res.id = 'osKRes'; res.setAttribute('role', 'listbox'); bx.appendChild(res); K.box.appendChild(bx);
      K.box.addEventListener('click', function (e) { if (e.target === K.box) fechaBusca(); });
      inp.addEventListener('input', function () { clearTimeout(K.t); var q = inp.value.trim(); K.t = setTimeout(function () { buscar(q); }, 220); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); K.sel = Math.max(0, Math.min(K.itens.length - 1, K.sel + (e.key === 'ArrowDown' ? 1 : -1))); marca(); }
        else if (e.key === 'Enter' && K.itens[K.sel]) { e.preventDefault(); K.itens[K.sel].click(); }
        else if (e.key === 'Escape') fechaBusca();
      });
      document.body.appendChild(K.box);
    }
    K.box.classList.add('on'); var inp2 = $('osKIn'); inp2.value = ''; buscar(''); setTimeout(function () { inp2.focus(); }, 0);
  }
  function fechaBusca() { if (K.box) K.box.classList.remove('on'); }
  function marca() { K.itens.forEach(function (b, i) { b.classList.toggle('on', i === K.sel); b.setAttribute('aria-selected', i === K.sel ? 'true' : 'false'); }); if (K.itens[K.sel]) K.itens[K.sel].scrollIntoView({block: 'nearest'}); }
  function buscar(q) {
    var res = $('osKRes'); limpa(res); K.itens = []; K.sel = 0;
    var grupo = function (t) { res.appendChild(E('div', 'os-k-g', t)); };
    var item = function (t, sub, fn) { var b = B('os-k-i', null, function () { fechaBusca(); fn(); }); b.setAttribute('role', 'option'); b.appendChild(E('span', null, t)); if (sub) b.appendChild(E('small', null, sub)); res.appendChild(b); K.itens.push(b); };
    if (q.length < 2) {
      grupo('Atalhos');
      item('Nova proposta', 'Comercial', function () { irPara('nova'); });
      item('Atendimento', 'conversas do WhatsApp', function () { irPara('atend'); });
      item('Clientes', '', function () { irPara('clientes'); });
      if (EU() === 'isaque') item('Financeiro', 'cobranças e régua', function () { irPara('fin'); });
      marca(); return;
    }
    // propostas carregadas: resposta na hora; o servidor completa com clientes e conversas
    var nq = norm(q), loc = (window._lista || []).filter(function (p) { return norm(p.cliente).indexOf(nq) > -1; }).slice(0, 6);
    if (loc.length) { grupo('Propostas'); loc.forEach(function (p) { item(p.cliente, rotStatus(p), function () { irPara('propostas'); abreProposta(p.id); }); }); }
    var ld = E('div', 'os-k-g', 'Buscando…'); res.appendChild(ld); marca();
    wa('busca', {q: q}).then(function (r) {
      if ($('osKIn').value.trim() !== q) return;
      ld.remove();
      r.clientes = r.clientes || []; r.conversas = r.conversas || [];
      if (!r.ok) { res.appendChild(E('div', 'os-k-g', 'Não foi possível buscar: ' + (r.erro || ''))); return; }
      if (r.clientes.length) { grupo('Clientes'); r.clientes.forEach(function (c) { item(c.nome, c.status, function () { osFicha(c.id); }); }); }
      if (r.conversas.length) { grupo('Conversas'); r.conversas.forEach(function (c) { item(c.nome || 'Contato', c.modo === 'humano' ? 'com a equipe' : 'com a IA', function () { irPara('atend'); setTimeout(function () { if (window.atApp) atApp.abrir(c.id); }, 50); }); }); }
      var ja = {}; loc.forEach(function (p) { ja[p.id] = 1; });
      var pr = (r.propostas || []).filter(function (p) { return !ja[p.id]; });
      if (pr.length) { grupo('Propostas (todas)'); pr.forEach(function (p) { item(p.cliente, p.status, function () { carregaPropostas().then(function () { irPara('propostas'); abreProposta(p.id); }); }); }); }
      if (!K.itens.length) res.appendChild(E('div', 'os-vazio', 'Nada encontrado para "' + q + '".'));
      marca();
    });
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && $('adminWrap') && $('adminWrap').style.display === 'block') { e.preventDefault(); abreBusca(); }
  });

  // ================= dados de propostas (para Início e Comercial) =================
  var KB = {lista: null, t: 0, conversa: {}, view: 'kanban', filtros: {nicho: 'todos', periodo: 'tudo', quentes: false, antigas: false}};
  function carregaPropostas(forca) {
    if (!forca && KB.lista && Date.now() - KB.t < 60000) return Promise.resolve(KB.lista);
    return Promise.all([adm('listar2', {limite: 200, testes: false}), adm('funil', {}).catch(function () { return {ok: false}; })]).then(function (rs) {
      if (rs[0] && rs[0].ok) { KB.lista = rs[0].lista || []; KB.t = Date.now(); }
      KB.conversa = {}; if (rs[1] && rs[1].ok) (rs[1].lista || []).forEach(function (x) { KB.conversa[x.id] = x.em_conversa_em; });
      return KB.lista || [];
    });
  }
  var ab = function (p) { return Number((p.acs || {}).aberturas || 0); };
  var ultimoAcesso = function (p) { return (p.acs || {}).ultimo || null; };
  var ultimaAcao = function (p) { var L = [p.criado_em, ultimoAcesso(p), p.follow_em, KB.conversa[p.id], p.escolha && p.escolha.em].map(function (x) { return Date.parse(x || '') || 0; }); return Math.max.apply(null, L); };
  function etapa(p) {
    if (p.follow === 'fechou') return 'fechou';
    if (p.follow === 'perdido' || p.status === 'cancelada' || p.status === 'expirada') return 'perdida';
    if (KB.conversa[p.id] || p.follow === 'escolheu' || p.follow === 'nao_decidiu') return 'conversa';
    if (ab(p) > 0) return 'abriu';
    return 'enviada';
  }
  function inicioEtapa(p, e) {
    var x = e === 'fechou' ? p.follow_em : e === 'perdida' ? (p.follow === 'perdido' ? p.follow_em : p.cancelada_em || p.expira_em) : e === 'conversa' ? (KB.conversa[p.id] || p.follow_em || (p.escolha && p.escolha.em)) : e === 'abriu' ? ((p.acs || {}).primeiro || ultimoAcesso(p)) : p.criado_em;
    return Date.parse(x || p.criado_em) || Date.now();
  }
  var quente = function (p) { var e = etapa(p); return (e === 'abriu' || e === 'conversa') && ab(p) >= 2 && Date.now() - (Date.parse(ultimoAcesso(p) || '') || 0) <= 14 * DIA; };
  var antiga = function (p) { var e = etapa(p); return e !== 'fechou' && e !== 'perdida' && Date.now() - ultimaAcao(p) > 30 * DIA; };
  function rotStatus(p) { return {enviada: 'Enviada', abriu: 'Abriu', conversa: 'Em conversa', fechou: 'Fechou', perdida: p.follow === 'perdido' ? 'Perdida' : p.status === 'cancelada' ? 'Cancelada' : 'Expirada'}[etapa(p)]; }
  function valorDe(p) {
    if (p.escolha && p.escolha.valor) return p.escolha.valor;
    if (p.tipo === 'cardapio') return 'Cardápio';
    var v = [p.v1, p.v2, p.v3].filter(function (x, i) { return x && (!p.planos || p.planos[i] !== false); });
    return v.length ? 'R$ ' + v[0] + (v.length > 1 ? ' a ' + v[v.length - 1] : '') + '/mês' : '';
  }
  var NICHO = {arquiteto: 'Arquiteto', loja: 'Loja', construtora: 'Construtora', outro: 'Outro'};

  // ================= Início =================
  var INI = {d: null, t: 0, ativ: null};
  function osInicio() {
    var sc = $('scrInicio'); if (!sc) return;
    if (!$('osIni')) { var old = E('div'); old.style.display = 'none'; old.id = 'osIniVelho'; while (sc.firstChild) old.appendChild(sc.firstChild); sc.appendChild(old); var n = E('div'); n.id = 'osIni'; sc.appendChild(n); }
    var velho = $('osIniVelho');   // blocos antigos que continuam úteis (follow-up e e-mails) são reaproveitados
    ['inAtencao', 'inEmails'].forEach(function (id) { var e = $(id); if (e && !velho.contains(e)) velho.appendChild(e); });
    var w = limpa($('osIni')), h = new Date().getHours(), dt = new Date().toLocaleDateString('pt-BR', {timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long'});
    cab(w, (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + ', ' + NOMES[EU()], dt.charAt(0).toUpperCase() + dt.slice(1), [BI('os-btn pri', 'plus', 'Nova proposta', function () { irPara('nova'); })]);
    var kp = E('div', 'os-kpis'); kp.id = 'osIniK'; w.appendChild(kp); for (var i = 0; i < (EU() === 'isaque' ? 4 : 2); i++) kp.appendChild(E('span', 'os-sk k', ''));
    var g = E('div', 'os-g2'); w.appendChild(g);
    var c1 = E('div'), c2 = E('div'); g.appendChild(c1); g.appendChild(c2);
    var bloco = function (id, t) { var hd = E('div', 'os-blk-hd'); hd.appendChild(E('h2', null, t)); var sp = E('span', null, ''); sp.id = id + 'N'; hd.appendChild(sp); c1.appendChild(hd); var b = E('div'); b.id = id; c1.appendChild(b); sk(b, 2); return b; };
    bloco('osResp', 'Precisam de resposta');
    if (EU() === 'isaque') bloco('osCob', 'Cobranças');
    bloco('osQuentes', 'Propostas quentes');
    var hf = E('div', 'os-blk-hd'); hf.appendChild(E('h2', null, 'Follow-up de propostas')); c1.appendChild(hf); if ($('inAtencao')) c1.appendChild($('inAtencao'));
    var hd = E('div', 'os-blk-hd'); hd.appendChild(E('h2', null, 'Atividade recente')); c2.appendChild(hd);
    var at = E('div', 'os-list'); at.id = 'osAtiv'; at.style.padding = '10px 14px'; c2.appendChild(at); sk(at, 5);
    if (EU() === 'isaque' && $('inEmails')) { var he = E('div', 'os-blk-hd'); he.appendChild(E('h2', null, 'E-mails desta semana')); c2.appendChild(he); c2.appendChild($('inEmails')); }
    Promise.all([wa('inicio'), carregaPropostas(), adm('atividades', {limite: 20}).catch(function () { return {ok: false}; })]).then(function (rs) {
      INI.d = rs[0]; desenhaInicio(rs[0], rs[1], rs[2] && rs[2].ok ? rs[2].lista : []);
    });
  }
  function lista5(box, itens, desenha, verTodos, vazioT) {
    limpa(box); var L = E('div', 'os-list'); box.appendChild(L);
    if (!itens.length) { vazio(L, vazioT[0], vazioT[1]); return; }
    itens.slice(0, 5).forEach(function (x) { L.appendChild(desenha(x)); });
    if (itens.length > 5 && verTodos) L.appendChild(B('os-mais', 'Ver todos (' + itens.length + ')', verTodos));
  }
  function li(t, sub, dir, badge, fn) {
    var r = fn ? B('os-li', null, fn) : E('div', 'os-li'); var g = E('div', 'g'); g.appendChild(E('b', null, t)); if (sub) g.appendChild(E('span', null, sub)); r.appendChild(g);
    if (badge) r.appendChild(badge); if (dir) r.appendChild(E('span', 'r', dir)); return r;
  }
  function desenhaInicio(d, props, ativProps) {
    var kp = limpa($('osIniK')); if (!kp) return;
    var ok = !!(d && d.ok && d.kpi);
    var mes0 = new Date(); mes0 = new Date(mes0.getFullYear(), mes0.getMonth(), 1).getTime();
    var ativas = props.filter(function (p) { return p.status === 'ativa'; }), abertas = ativas.filter(function (p) { return ab(p) > 0; });
    var fechadas = props.filter(function (p) { return p.follow === 'fechou' && Date.parse(p.follow_em || '') >= mes0; });
    var enviadasMes = props.filter(function (p) { return Date.parse(p.criado_em) >= mes0; }).length;
    if (EU() === 'isaque') {
      var F = ok && d.financeiro;
      if (F && !F.erro) {
        var k1 = kpi(kp, 'Recebido no mês', brl0(F.recebido), [tendencia(F.recebido, F.recebido_ant), F.meta ? E('span', null, 'meta ' + brl0(F.meta)) : B('os-lnk-s', 'definir meta', function () { irPara('ajustes'); })], function () { irPara('fin'); });
        if (F.meta) barra(k1, F.recebido / F.meta * 100);
        kpi(kp, 'Em aberto · atrasado', brl0(F.aberto), [E('span', F.atrasado ? 'dn' : null, F.atrasado ? brl0(F.atrasado) + ' atrasado (' + F.n_atrasadas + ')' : 'nada atrasado'), F.pausados ? E('span', 'dn', F.pausados + ' pausado(s)') : null], function () { irPara('fin'); });
      } else {
        kpi(kp, 'Recebido no mês', '—', [E('span', null, (F && F.erro) || 'Asaas indisponível')]);
        kpi(kp, 'Em aberto · atrasado', '—', [E('span', null, 'conecte o Asaas em Ajustes')]);
      }
    }
    var meta = ok && d.metas && d.metas.fechadas_mes;
    var k3 = kpi(kp, 'Propostas no mês', fechadas.length + ' fechada' + (fechadas.length === 1 ? '' : 's'), [E('span', null, ativas.length + ' ativas · ' + abertas.length + ' abertas'), E('span', null, (enviadasMes ? Math.round(fechadas.length / enviadasMes * 100) : 0) + '% de conversão'), meta ? E('span', null, 'meta ' + meta) : null], function () { irPara('propostas'); });
    if (meta) barra(k3, fechadas.length / meta * 100);
    kpi(kp, 'Conversas aguardando', ok ? String(d.kpi.aguardando) : '—', [E('span', ok && d.kpi.aguardando ? 'dn' : null, ok ? (d.kpi.nao_lidas + ' não lida' + (d.kpi.nao_lidas === 1 ? '' : 's')) : (d && d.erro) || 'sem dados')], function () { irPara('atend'); });
    // precisam de resposta
    var R = ok ? d.responder || [] : [];
    $('osRespN').textContent = R.length ? String(R.length) : '';
    if (!ok) { limpa($('osResp')); erro($('osResp'), 'Atendimento: ' + ((d && d.erro) || 'sem resposta'), osInicio); }
    else lista5($('osResp'), R, function (c) {
      var bd = E('span', 'os-b ' + (c.esperando_min > 60 ? 'er' : 'al'), 'esperando ' + espera(c.esperando_min));
      return li(c.nome + (c.cliente ? ' · ' + c.cliente : ''), c.atendente ? 'com ' + NOMES[c.atendente] : 'sem dono', null, bd, function () { irPara('atend'); setTimeout(function () { if (window.atApp) atApp.abrir(c.id); }, 60); });
    }, function () { irPara('atend'); }, ['Ninguém esperando resposta.', 'As conversas com a IA não aparecem aqui.']);
    // cobranças
    if (EU() === 'isaque' && $('osCob')) {
      var F2 = ok && d.financeiro, fila = F2 && !F2.erro ? F2.fila || [] : [];
      $('osCobN').textContent = fila.length ? String(fila.length) : '';
      if (F2 && F2.erro) { limpa($('osCob')); erro($('osCob'), F2.erro); }
      else lista5($('osCob'), fila, function (x) {
        var T = {vence_hoje: ['Vence hoje', 'al'], atrasada: ['Atrasada ' + x.dias + ' dia' + (x.dias === 1 ? '' : 's'), 'er'], aviso_pausa: ['Aviso de pausa enviado (D+5)', 'er'], pausado: ['Pausado', 'er']}[x.tipo];
        return li(x.cliente, x.valor || '', null, E('span', 'os-b ' + T[1], T[0]), function () { osFicha(x.cliente_id); });
      }, function () { irPara('fin'); }, ['Nenhuma cobrança pedindo atenção hoje.', '']);
    }
    // propostas quentes (sem itens parados há mais de 30 dias)
    var hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    var Q = props.filter(function (p) {
      if (antiga(p) || p.status !== 'ativa') return false;
      var vence = Date.parse(p.expira_em) - hoje0.getTime();
      return quente(p) || (vence >= 0 && vence < 2 * DIA && etapa(p) !== 'fechou');
    }).sort(function (a, b) { return Date.parse(a.expira_em) - Date.parse(b.expira_em); });
    $('osQuentesN').textContent = Q.length ? String(Q.length) : '';
    lista5($('osQuentes'), Q, function (p) {
      var vence = Date.parse(p.expira_em) - hoje0.getTime(), vb = vence < DIA ? 'Vence hoje' : vence < 2 * DIA ? 'Vence amanhã' : null;
      return li(p.cliente, ab(p) + ' abertura' + (ab(p) === 1 ? '' : 's') + ' · ' + rel(ultimoAcesso(p) || p.criado_em), null, E('span', 'os-b ' + (vb ? 'al' : 'br'), vb || 'Quente'), function () { irPara('propostas'); abreProposta(p.id); });
    }, function () { KB.filtros.quentes = true; irPara('propostas'); }, ['Nenhuma proposta quente agora.', 'Aparecem as que abriram 2+ vezes nos últimos 14 dias ou vencem até amanhã.']);
    // atividade recente (propostas + WhatsApp + pagamentos)
    var A = [];
    (ativProps || []).forEach(function (a) { if (/^\s*(teste|zz)/i.test(a.cliente || '')) return; A.push({em: a.em, t: a.cliente, s: a.tipo === 'escolheu_plano' ? 'Escolheu ' + (a.detalhe || 'um plano') : a.tipo === 'clicou_whatsapp' ? 'Clicou no WhatsApp' : a.tipo === 'viu_plano' ? 'Viu o plano ' + (a.detalhe || '') : a.tipo === 'viu_aba' ? 'Viu uma aba' : 'Abriu a proposta', c: a.tipo === 'escolheu_plano' ? 'ok' : '', f: function () { irPara('propostas'); abreProposta(a.id); }}); });
    (ok ? d.atividade || [] : []).forEach(function (x) { A.push({em: x.em, t: x.titulo, s: x.tipo === 'pagamento' ? 'Pagamento' : 'WhatsApp', c: x.tipo === 'pagamento' ? 'ok' : 'br', f: x.conversa_id ? function () { irPara('atend'); setTimeout(function () { atApp.abrir(x.conversa_id); }, 60); } : x.cliente_id ? function () { osFicha(x.cliente_id); } : null}); });
    A.sort(function (a, b) { return String(b.em).localeCompare(String(a.em)); });
    var at = limpa($('osAtiv'));
    if (!A.length) { vazio(at, 'Sem atividade recente.'); return; }
    var tl = E('div', 'os-tl'); at.appendChild(tl);
    A.slice(0, 12).forEach(function (x) { var i = E('div', 'os-tl-i ' + (x.c || '')); var t = x.f ? B('os-tl-lnk', null, x.f) : E('div'); t.appendChild(E('b', null, x.t)); t.appendChild(E('span', null, x.s + ' · ' + rel(x.em))); i.appendChild(t); tl.appendChild(i); });
  }

  // ================= Comercial (funil) =================
  var ETAPAS = [['enviada', 'Enviada'], ['abriu', 'Abriu'], ['conversa', 'Em conversa'], ['fechou', 'Fechou'], ['perdida', 'Perdida/Expirada']];
  function osComercial() {
    var sc = $('secHist'); if (!sc) return;
    var pwl = sc.querySelector('.pw-l'); if (!pwl) return;
    if (!$('osCom')) {
      var hdOld = pwl.querySelector('.scr-hd'); if (hdOld) hdOld.classList.add('os-velho-hd');
      var w = E('div'); w.id = 'osCom'; pwl.insertBefore(w, pwl.firstChild);
      var st = E('style'); st.textContent = '#secHist.os-fn .pw-l>*:not(#osCom){display:none;}#secHist.os-fn .pw{display:block;}#secHist .os-velho-hd{display:none;}' +
        '@media (min-width:1100px){#secHist.os-fn .pw-r{position:fixed;top:0;right:0;bottom:0;width:min(560px,100%);z-index:181;background:var(--bg);box-shadow:var(--sh2);transform:translateX(100%);transition:transform .2s ease;overflow:auto;padding:64px 20px 24px;display:block;}' +
        'body.os-det-on #secHist.os-fn .pw-r{transform:none;}body.os-det-on #osDrX{display:flex;position:fixed;top:12px;right:16px;z-index:182;}}#osDrX{display:none;}' +
        '#secHist.os-fn .pw-l{max-width:none;}';
      document.head.appendChild(st);
      var fundo = E('div', 'os-dr-fundo'); fundo.id = 'osDrF'; fundo.addEventListener('click', fechaDrawer); document.body.appendChild(fundo);
      var x = BI('os-btn', 'x', 'Fechar', fechaDrawer, 'Fechar detalhe'); x.id = 'osDrX'; document.body.appendChild(x);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('os-det-on')) fechaDrawer(); });
    }
    sc.classList.toggle('os-fn', KB.view !== 'lista');
    if (KB.view === 'lista') { comCab($('osCom')); return; }
    var w2 = $('osCom'); comCab(w2);
    var corpo = E('div'); corpo.id = 'osComCorpo'; w2.appendChild(corpo); sk(corpo, 4);
    carregaPropostas().then(function () { desenhaFunil(); });
  }
  function comCab(w) {
    limpa(w);
    var vw = E('div', 'segm'); vw.setAttribute('role', 'group'); vw.setAttribute('aria-label', 'Visão'); vw.style.minWidth = '240px';
    [['kanban', 'Funil'], ['tabela', 'Tabela'], ['lista', 'Histórico']].forEach(function (x) { var b = B(KB.view === x[0] ? 'on' : '', x[1], function () { KB.view = x[0]; fechaDrawer(); osComercial(); if (x[0] === 'lista' && window.irPara) { /* lista antiga já está na tela */ } }); b.setAttribute('aria-pressed', KB.view === x[0] ? 'true' : 'false'); vw.appendChild(b); });
    cab(w, 'Comercial', 'Propostas em funil', [vw, BI('os-btn pri', 'plus', 'Nova proposta', function () { irPara('nova'); })]);
    if (KB.view === 'lista') { var old = $('secHist').querySelector('.os-velho-hd'); if (old) old.style.display = 'none'; }
  }
  function filtrados() {
    var f = KB.filtros, lim = {d30: 30, d90: 90}[f.periodo];
    return (KB.lista || []).filter(function (p) {
      if (f.nicho !== 'todos' && (p.nicho || 'outro') !== f.nicho) return false;
      if (lim && Date.now() - Date.parse(p.criado_em) > lim * DIA) return false;
      if (f.antigas) return antiga(p);
      if (antiga(p)) return false;
      if (f.quentes && !quente(p)) return false;
      var e = etapa(p); if ((e === 'fechou' || e === 'perdida') && !lim && Date.now() - inicioEtapa(p, e) > 60 * DIA) return false;
      return true;
    });
  }
  function desenhaFunil() {
    var w = limpa($('osComCorpo')); if (!w) return;
    if (!KB.lista) { erro(w, 'Não foi possível carregar as propostas.', function () { carregaPropostas(true).then(desenhaFunil); }); return; }
    var f = KB.filtros, ch = E('div', 'os-chips'); ch.setAttribute('role', 'group'); ch.setAttribute('aria-label', 'Filtros');
    var chip = function (t, on, fn) { var b = B('os-chip' + (on ? ' on' : ''), t, fn); b.setAttribute('aria-pressed', on ? 'true' : 'false'); ch.appendChild(b); };
    [['todos', 'Todos os nichos'], ['arquiteto', 'Arquiteto'], ['loja', 'Loja'], ['construtora', 'Construtora'], ['outro', 'Outro']].forEach(function (x) { chip(x[1], f.nicho === x[0], function () { f.nicho = x[0]; desenhaFunil(); }); });
    [['tudo', 'Todo o período'], ['d30', '30 dias'], ['d90', '90 dias']].forEach(function (x) { chip(x[1], f.periodo === x[0], function () { f.periodo = x[0]; desenhaFunil(); }); });
    chip('Só quentes', f.quentes, function () { f.quentes = !f.quentes; f.antigas = false; desenhaFunil(); });
    chip('Antigas (+30 dias)', f.antigas, function () { f.antigas = !f.antigas; f.quentes = false; desenhaFunil(); });
    w.appendChild(ch);
    var L = filtrados();
    // conversão por etapa e tempo médio até fechar
    var tot = L.length, abr = L.filter(function (p) { return ab(p) > 0 || ['conversa', 'fechou'].indexOf(etapa(p)) > -1; }).length, conv = L.filter(function (p) { var e = etapa(p); return e === 'conversa' || e === 'fechou'; }).length, fe = L.filter(function (p) { return etapa(p) === 'fechou'; });
    var pc = function (a, b) { return b ? Math.round(a / b * 100) + '%' : '—'; };
    var tm = fe.length ? Math.round(fe.reduce(function (a, p) { return a + (inicioEtapa(p, 'fechou') - Date.parse(p.criado_em)); }, 0) / fe.length / DIA) : null;
    var fu = E('div', 'os-funil');
    [['Propostas', String(tot)], ['Abriram', pc(abr, tot)], ['Em conversa', pc(conv, abr)], ['Fecharam', pc(fe.length, conv)], ['Tempo médio até fechar', tm == null ? '—' : tm + ' dia' + (tm === 1 ? '' : 's')]].forEach(function (x) { var d = E('div'); d.appendChild(E('span', null, x[0])); d.appendChild(E('b', null, x[1])); fu.appendChild(d); });
    w.appendChild(fu);
    if (!L.length) { vazio(w, f.antigas ? 'Nenhuma proposta parada há mais de 30 dias.' : 'Nenhuma proposta neste filtro.', 'Troque os filtros acima.'); return; }
    if (KB.view === 'tabela') return tabelaCom(w, L);
    var kb = E('div', 'os-kb'); w.appendChild(kb);
    ETAPAS.forEach(function (e) {
      var col = E('section', 'os-kc'); col.setAttribute('aria-label', e[1]);
      var Le = L.filter(function (p) { return etapa(p) === e[0]; }).sort(function (a, b) { return ultimaAcao(b) - ultimaAcao(a); });
      var hd = E('div', 'os-kc-hd'); hd.appendChild(E('b', null, e[1])); hd.appendChild(E('span', null, String(Le.length))); col.appendChild(hd);
      var bd = E('div', 'os-kc-bd'); col.appendChild(bd);
      if (!Le.length) bd.appendChild(E('div', 'os-vazio', '—'));
      Le.forEach(function (p) { bd.appendChild(cartao(p, e[0])); });
      kb.appendChild(col);
    });
  }
  function cartao(p, e) {
    var c = B('os-card' + (window.DET_ID_OS === p.id ? ' sel' : ''), null, function () { abreProposta(p.id); });
    c.appendChild(E('span', 't', p.cliente));
    var m = E('span', 'm'); m.appendChild(E('span', null, NICHO[p.nicho] || 'Outro')); var v = valorDe(p); if (v) m.appendChild(E('span', null, '· ' + v)); c.appendChild(m);
    var dias = Math.floor((Date.now() - inicioEtapa(p, e)) / DIA), m2 = E('span', 'm');
    if (e !== 'fechou' && e !== 'perdida') { var cl = dias > 14 ? 'er' : dias > 7 ? 'al' : ''; m2.appendChild(E('span', 'os-b ' + cl, dias + (dias === 1 ? ' dia' : ' dias') + ' na etapa')); }
    m2.appendChild(E('span', null, ab(p) + ' abertura' + (ab(p) === 1 ? '' : 's'))); c.appendChild(m2);
    c.appendChild(E('span', 'm', 'Última atividade ' + rel(new Date(ultimaAcao(p)).toISOString())));
    if (quente(p)) c.appendChild(E('span', 'os-b br', 'Quente'));
    return c;
  }
  function tabelaCom(w, L) {
    var tw = E('div', 'os-tw'), t = E('table', 'os-t'); tw.appendChild(t);
    var th = E('thead'), tr = E('tr'); ['Cliente', 'Etapa', 'Nicho', 'Valor', 'Aberturas', 'Dias na etapa', 'Última atividade'].forEach(function (h, i) { var x = E('th', null, h); x.scope = 'col'; if (i === 4 || i === 5) x.style.textAlign = 'right'; tr.appendChild(x); }); th.appendChild(tr); t.appendChild(th);
    var tb = E('tbody'); t.appendChild(tb);
    L.slice().sort(function (a, b) { return ultimaAcao(b) - ultimaAcao(a); }).forEach(function (p) {
      var e = etapa(p), r = E('tr'); r.tabIndex = 0; r.addEventListener('click', function () { abreProposta(p.id); }); r.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') abreProposta(p.id); });
      var c0 = E('td'); c0.appendChild(E('b', null, p.cliente)); r.appendChild(c0);
      var c1 = E('td'); c1.appendChild(E('span', 'os-b ' + ({fechou: 'ok', perdida: '', conversa: 'br', abriu: 'al', enviada: ''}[e]), rotStatus(p))); r.appendChild(c1);
      r.appendChild(E('td', null, NICHO[p.nicho] || 'Outro')); r.appendChild(E('td', null, valorDe(p))); r.appendChild(E('td', 'n', String(ab(p))));
      r.appendChild(E('td', 'n', e === 'fechou' || e === 'perdida' ? '—' : String(Math.floor((Date.now() - inicioEtapa(p, e)) / DIA))));
      r.appendChild(E('td', null, rel(new Date(ultimaAcao(p)).toISOString())));
      tb.appendChild(r);
    });
    w.appendChild(tw);
  }
  function abreProposta(id) {
    window.DET_ID_OS = id;
    var p = (KB.lista || []).filter(function (x) { return x.id === id; })[0];
    // garante que a proposta está na lista que o Detalhe usa
    if (p && window._lista && !_lista.some(function (x) { return x.id === id; })) _lista.push(p);
    abrirDetalhe(id, 'propostas');
    if (window.matchMedia('(min-width:1100px)').matches && KB.view !== 'lista') { document.body.classList.add('os-det-on'); $('osDrF').classList.add('on'); setTimeout(function () { var x = $('osDrX'); if (x) x.focus(); }, 50); }
    document.querySelectorAll('#osCom .os-card').forEach(function (c) { c.classList.remove('sel'); });
  }
  function fechaDrawer() { document.body.classList.remove('os-det-on'); var f = $('osDrF'); if (f) f.classList.remove('on'); }
  // barra "Em conversa" no detalhe da proposta (funil)
  window.osDetalheExtra = function (p, w) {
    if (!w || !p || p.follow === 'fechou') return;
    var on = !!KB.conversa[p.id], bar = E('div', 'os-acs'); bar.style.marginTop = '12px';
    bar.appendChild(E('span', 'os-b ' + (on ? 'br' : ''), on ? 'Em conversa desde ' + rel(KB.conversa[p.id]) : 'Funil: ' + (rotStatus(p) || '')));
    bar.appendChild(B('os-btn sm', on ? 'Tirar de "Em conversa"' : 'Marcar "Em conversa"', function () {
      adm('em_conversa', {id: p.id, on: !on}).then(function (r) {
        if (!(r && r.ok)) return msg(r && r.erro ? r.erro : 'Falta rodar o SQL do Studio OS para usar "Em conversa".', true);
        if (on) delete KB.conversa[p.id]; else KB.conversa[p.id] = new Date().toISOString();
        msg(on ? 'Saiu de "Em conversa".' : 'Marcada como "Em conversa".'); if (window.appRender) appRender(); if ($('osComCorpo')) desenhaFunil();
      });
    }));
    w.insertBefore(bar, w.children[1] || null);
  };

  // ================= Clientes =================
  var CL = {d: null, f: 'todos', q: ''};
  var FIN = {em_dia: ['Em dia', 'ok'], vence_hoje: ['Vence hoje', 'al'], atrasado: ['Atrasado', 'er'], pausado: ['Pausado', 'er'], encerrado: ['Encerrado', ''], sem_asaas: ['Sem Asaas', ''], desconhecido: ['—', '']};
  function osClientes() {
    var sc = limpa($('scrClientes'));
    cab(sc, 'Clientes', 'Cadastro, financeiro e WhatsApp', [EU() === 'isaque' ? BI('os-btn pri', 'plus', 'Novo cliente', function () { drawerCadastro({}); }) : null]);
    var bu = E('div', 'busca'); bu.appendChild(I('search', 18)); var inp = E('input', 'inp'); inp.type = 'search'; inp.placeholder = 'Buscar empresa ou contato'; inp.setAttribute('aria-label', 'Buscar cliente'); inp.value = CL.q; bu.appendChild(inp); sc.appendChild(bu);
    var ch = E('div', 'os-chips'); ch.id = 'osClCh'; sc.appendChild(ch);
    var corpo = E('div'); corpo.id = 'osClCorpo'; sc.appendChild(corpo); sk(corpo, 5);
    inp.addEventListener('input', function () { CL.q = inp.value.trim(); tabelaCl(); });
    wa('clientes_os').then(function (r) { CL.d = r; tabelaCl(); });
  }
  function tabelaCl() {
    var w = limpa($('osClCorpo')), r = CL.d; if (!w) return;
    if (!r || !r.ok || !Array.isArray(r.lista)) { erro(w, 'Não foi possível carregar os clientes: ' + ((r && r.erro) || ''), osClientes); return; }
    var F = {todos: function () { return true; }, em_dia: function (c) { return c.financeiro === 'em_dia'; }, atrasado: function (c) { return c.financeiro === 'atrasado'; }, pausado: function (c) { return c.status === 'pausado'; }, sem_resp: function (c) { return !c.responsavel_ok && c.status !== 'encerrado'; }, encerrado: function (c) { return c.status === 'encerrado'; }};
    var ch = limpa($('osClCh'));
    [['todos', 'Todos'], ['em_dia', 'Em dia'], ['atrasado', 'Atrasados'], ['pausado', 'Pausados'], ['sem_resp', 'Sem responsável verificado'], ['encerrado', 'Encerrados']].forEach(function (x) {
      var n = r.lista.filter(F[x[0]]).length, b = B('os-chip' + (CL.f === x[0] ? ' on' : ''), null, function () { CL.f = x[0]; tabelaCl(); }); b.appendChild(document.createTextNode(x[1])); b.appendChild(E('span', 'n', String(n))); b.setAttribute('aria-pressed', CL.f === x[0] ? 'true' : 'false'); ch.appendChild(b);
    });
    if (r.erro_asaas) erro(w, 'Situação financeira indisponível (Asaas: ' + r.erro_asaas + ').');
    var nq = norm(CL.q), L = r.lista.filter(F[CL.f]).filter(function (c) { return !nq || norm(c.nome + ' ' + c.contato).indexOf(nq) > -1; });
    if (!r.lista.length) { vazio(w, 'Nenhum cliente cadastrado ainda.', EU() === 'isaque' ? 'Use "Novo cliente" para cadastrar CNPJ, e-mail do responsável e o ID do Asaas.' : 'O Isaque cadastra os clientes.'); return; }
    if (!L.length) { vazio(w, 'Nenhum cliente neste filtro.'); return; }
    var tw = E('div', 'os-tw'), t = E('table', 'os-t'); tw.appendChild(t);
    var th = E('thead'), tr = E('tr'); ['Empresa', 'Plano', 'Vencimento', 'Financeiro', 'WhatsApp', 'Onboarding'].forEach(function (h) { var x = E('th', null, h); x.scope = 'col'; tr.appendChild(x); }); th.appendChild(tr); t.appendChild(th);
    var tb = E('tbody'); t.appendChild(tb);
    L.forEach(function (c) {
      var r2 = E('tr'); r2.tabIndex = 0; r2.addEventListener('click', function () { osFicha(c.id); }); r2.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') osFicha(c.id); });
      var c0 = E('td'); c0.appendChild(E('b', null, c.nome)); if (c.contato) c0.appendChild(E('span', 'sub', c.contato)); r2.appendChild(c0);
      r2.appendChild(E('td', null, c.plano || '—'));
      r2.appendChild(E('td', null, c.vencimento_dia ? 'dia ' + c.vencimento_dia : '—'));
      var f = FIN[c.status === 'encerrado' ? 'encerrado' : c.financeiro] || FIN.desconhecido, c3 = E('td'); c3.appendChild(E('span', 'os-b ' + f[1], c.financeiro === 'atrasado' ? 'Atrasado ' + c.dias_atraso + 'd' : f[0])); r2.appendChild(c3);
      var c4 = E('td'); c4.appendChild(document.createTextNode(c.numeros + (c.numeros === 1 ? ' número' : ' números'))); c4.appendChild(E('span', 'sub', c.responsavel_ok ? 'responsável verificado' : 'sem responsável verificado')); r2.appendChild(c4);
      var c5 = E('td'); c5.appendChild(E('span', 'os-b ' + (c.onboarding ? 'ok' : ''), c.onboarding ? 'Senha: ' + c.onboarding : 'Sem senha')); r2.appendChild(c5);
      tb.appendChild(r2);
    });
    w.appendChild(tw);
  }
  // ---- ficha (estilo Attio): cabeçalho, ações rápidas, abas, linha do tempo unificada, anotações
  var FC = {id: null, d: null, aba: 'geral'};
  window.osFicha = function (id) {
    if (!id) return;
    FC.id = id; FC.aba = FC.id === id ? FC.aba : 'geral';
    irPara('ficha');
    var sc = limpa($('scrFicha'));
    sc.appendChild(BI('os-btn sm', 'left', 'Clientes', function () { irPara('clientes'); }, 'Voltar para Clientes'));
    var corpo = E('div'); corpo.id = 'osFcCorpo'; corpo.style.marginTop = '12px'; sc.appendChild(corpo); sk(corpo, 6);
    try { history.replaceState(null, '', location.pathname + '#ficha=' + id); } catch (e) {}
    wa('ficha', {id: id}).then(function (r) { if (FC.id !== id) return; FC.d = r; ficha(); });
  };
  function ficha() {
    var w = limpa($('osFcCorpo')), r = FC.d; if (!w) return;
    if (!r || !r.ok || !r.cliente) { erro(w, 'Não foi possível abrir a ficha: ' + ((r && r.erro) || ''), function () { osFicha(FC.id); }); return; }
    ['contatos', 'conversas', 'notas', 'linha'].forEach(function (k) { if (!Array.isArray(r[k])) r[k] = []; });
    var c = r.cliente, hd = E('div', 'os-fc-hd');
    hd.appendChild(E('div', 'os-fc-av', String(c.nome || '?').trim().split(/\s+/).slice(0, 2).map(function (x) { return x[0]; }).join('').toUpperCase()));
    var tx = E('div'); tx.style.flex = '1'; tx.style.minWidth = '0'; tx.appendChild(E('h1', null, c.nome));
    var m = E('div', 'm');
    m.appendChild(E('span', 'os-b ' + (c.status === 'ativo' ? 'ok' : c.status === 'pausado' ? 'er' : ''), c.status === 'ativo' ? 'Ativo' : c.status === 'pausado' ? 'Pausado' : 'Encerrado'));
    if (c.plano) m.appendChild(E('span', null, c.plano));
    if (c.vencimento_dia) m.appendChild(E('span', null, '· vence dia ' + c.vencimento_dia));
    if (r.situacao) { var f = FIN[r.situacao] || FIN.desconhecido; m.appendChild(E('span', 'os-b ' + f[1], f[0])); }
    if (r.financeiro && r.financeiro.abertos) { var at = r.financeiro.abertos.filter(function (p) { return p.dias > 0; }); m.appendChild(E('span', 'os-b ' + (at.length ? 'er' : 'ok'), at.length ? 'Atrasado ' + Math.max.apply(null, at.map(function (p) { return p.dias; })) + ' dias' : 'Em dia')); }
    tx.appendChild(m); hd.appendChild(tx); w.appendChild(hd);
    // ações rápidas
    var ac = E('div', 'os-acs'); w.appendChild(ac);
    var conv = (r.conversas || [])[0];
    ac.appendChild(BI('os-btn' + (conv ? ' pri' : ''), 'chat', 'WhatsApp', function () {
      if (conv) { irPara('atend'); setTimeout(function () { atApp.abrir(conv.id); }, 60); return; }
      var tel = (r.contatos.filter(function (x) { return x.perfil === 'responsavel'; })[0] || r.contatos[0] || {}).telefone;
      if (tel) window.open('https://wa.me/' + tel, '_blank', 'noopener'); else msg('Nenhum número cadastrado para este cliente.', true);
    }));
    if (c.email_responsavel) { var em = E('a', 'os-btn'); em.href = 'mailto:' + c.email_responsavel; em.appendChild(I('mail')); em.appendChild(E('span', null, 'E-mail')); ac.appendChild(em); }
    if (c.tem_senha) ac.appendChild(BI('os-btn', 'key', 'Copiar senha do onboarding', function () {
      wa('senha_cliente', {id: c.id}).then(function (x) {
        if (!x.ok) return msg(x.erro || 'erro', true);
        var t = (x.url ? 'Formulário: ' + x.url + '\n' : '') + 'Senha: ' + x.senha;
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { msg('Senha copiada (' + x.nicho + ').'); }, function () { prompt('Copie:', t); });
      });
    }));
    var link = function (u, ico, t) { if (!u) return; var a = E('a', 'os-btn'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.appendChild(I(ico)); a.appendChild(E('span', null, t)); ac.appendChild(a); };
    link(c.drive_url, 'folder', 'Drive'); link(c.manual_gravacao_url, 'link', 'Manual');
    if (EU() === 'isaque') ac.appendChild(BI('os-btn', 'edit', 'Editar cadastro', function () { drawerCadastro(Object.assign({}, c, {id: c.id})); }));
    // abas
    var tabs = E('div', 'os-tabs'); tabs.setAttribute('role', 'tablist'); w.appendChild(tabs);
    var corpo = E('div'); corpo.setAttribute('role', 'tabpanel'); w.appendChild(corpo);
    [['geral', 'Visão geral'], ['conversas', 'Conversas'], ['fin', 'Financeiro'], ['proposta', 'Proposta/Contrato'], ['onb', 'Onboarding'], ['arq', 'Arquivos'], ['notas', 'Anotações' + (r.notas.length ? ' (' + r.notas.length + ')' : '')]].forEach(function (x) {
      var b = B(FC.aba === x[0] ? 'on' : '', x[1], function () { FC.aba = x[0]; ficha(); }); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', FC.aba === x[0] ? 'true' : 'false'); tabs.appendChild(b);
    });
    ({geral: abaGeral, conversas: abaConversas, fin: abaFin, proposta: abaProposta, onb: abaOnb, arq: abaArq, notas: abaNotas})[FC.aba](corpo, r);
  }
  function dl(box, pares) { var d = E('dl', 'os-dl'); pares.forEach(function (p) { if (p[1] == null || p[1] === '') return; d.appendChild(E('dt', null, p[0])); d.appendChild(E('dd', null, p[1])); }); box.appendChild(d); }
  var TL = {msg_in: ['', 'Mensagem do cliente'], msg_out: ['br', 'Mensagem enviada'], comentario: ['al', 'Comentário interno'], nota: ['al', 'Anotação'], pagamento: ['ok', 'Pagamento'], regua: ['', 'Cobrança'], alerta: ['er', 'Alerta'], proposta: ['br', 'Proposta']};
  function linhaTempo(box, L, n) {
    if (!L.length) { vazio(box, 'Nada registrado ainda.'); return; }
    var tl = E('div', 'os-tl'); box.appendChild(tl);
    L.slice(0, n || 30).forEach(function (x) {
      var k = TL[x.tipo] || ['', x.tipo], i = E('div', 'os-tl-i ' + k[0]);
      i.appendChild(E('b', null, k[1] + (x.autor ? ' · ' + (NOMES[x.autor] || x.autor) : x.origem && x.tipo === 'msg_out' ? ' · ' + ({ia: 'IA', menu: 'menu', regua: 'régua', sistema: 'sistema', equipe_admin: 'equipe'}[x.origem] || x.origem) : '')));
      i.appendChild(E('span', null, rel(x.em)));
      if (x.texto) i.appendChild(E('p', null, String(x.texto).slice(0, 400)));
      tl.appendChild(i);
    });
  }
  function propostasDoCliente(c) {
    var toks = norm(c.nome).split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 4 && ['studio', 'arquitetura', 'interiores', 'design', 'construtora', 'ltda', 'eireli'].indexOf(t) < 0; });
    if (!toks.length) return [];
    return (KB.lista || window._lista || []).filter(function (p) { var n = norm(p.cliente); return toks.some(function (t) { return n.indexOf(t) > -1; }); });
  }
  function abaGeral(w, r) {
    var c = r.cliente;
    dl(w, [['Contato', c.contato], ['Plano', c.plano], ['Vencimento', c.vencimento_dia ? 'dia ' + c.vencimento_dia : ''], ['CNPJ', c.cnpj ? c.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : ''], ['E-mail do responsável', c.email_responsavel], ['Asaas', c.asaas_customer_id], ['Cliente desde', c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR') : ''], ['Observações', c.observacoes]]);
    var hd = E('div', 'os-blk-hd'); hd.appendChild(E('h2', null, 'Números no WhatsApp')); hd.appendChild(E('span', null, String(r.contatos.length))); w.appendChild(hd);
    var L = E('div', 'os-list'); w.appendChild(L);
    if (!r.contatos.length) vazio(L, 'Nenhum número cadastrado.');
    r.contatos.forEach(function (x) { L.appendChild(li((x.nome || 'Sem nome') + ' · ' + fmtTel(x.telefone), x.perfil === 'responsavel' ? 'Responsável' : 'Equipe', null, E('span', 'os-b ' + (x.verificado ? 'ok' : 'al'), x.verificado ? 'Verificado' : 'Não verificado'))); });
    var hd2 = E('div', 'os-blk-hd'); hd2.appendChild(E('h2', null, 'Linha do tempo')); w.appendChild(hd2);
    var L2 = r.linha.slice(); propostasDoCliente(c).forEach(function (p) { L2.push({tipo: 'proposta', em: p.criado_em, texto: p.cliente + ' · ' + rotStatus(p)}); });
    L2.sort(function (a, b) { return String(b.em).localeCompare(String(a.em)); });
    var b = E('div', 'os-list'); b.style.padding = '10px 14px'; w.appendChild(b); linhaTempo(b, L2, 25);
  }
  function fmtTel(t) { var d = String(t || '').replace(/^55/, ''); return d.length >= 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, -4) + '-' + d.slice(-4) : t; }
  function abaConversas(w, r) {
    if (!r.conversas.length) { vazio(w, 'Nenhuma conversa com este cliente.', 'Quando um número dele mandar mensagem, aparece aqui.'); return; }
    var L = E('div', 'os-list'); w.appendChild(L);
    r.conversas.forEach(function (v) { L.appendChild(li(fmtTel(v.telefone), v.modo === 'humano' ? 'com a equipe' : 'com a IA', rel(v.ultima), v.nao_lidas ? E('span', 'os-b er', v.nao_lidas + ' não lida(s)') : null, function () { irPara('atend'); setTimeout(function () { atApp.abrir(v.id); }, 60); })); });
    var hd = E('div', 'os-blk-hd'); hd.appendChild(E('h2', null, 'Mensagens recentes')); w.appendChild(hd);
    var b = E('div', 'os-list'); b.style.padding = '10px 14px'; w.appendChild(b);
    linhaTempo(b, r.linha.filter(function (x) { return /^msg_|comentario/.test(x.tipo); }), 40);
  }
  function abaFin(w, r) {
    if (EU() !== 'isaque') { dl(w, [['Situação', (FIN[r.situacao] || FIN.desconhecido)[0]]]); w.appendChild(E('p', 'card-sub', 'Valores e cobranças ficam só com o Isaque.')); return; }
    var F = r.financeiro;
    if (!F) { vazio(w, 'Cliente sem vínculo com o Asaas.', 'Edite o cadastro e preencha o ID do Asaas (cus_...).'); return; }
    if (F.erro) erro(w, 'Asaas: ' + F.erro);
    var hd = E('div', 'os-blk-hd'); hd.appendChild(E('h2', null, 'Em aberto')); w.appendChild(hd);
    var L = E('div', 'os-list'); w.appendChild(L);
    if (!F.abertos.length) vazio(L, 'Nada em aberto.');
    F.abertos.forEach(function (p) { var x = li(p.valor, 'vence ' + p.vencimento, null, E('span', 'os-b ' + (p.dias > 0 ? 'er' : p.dias === 0 ? 'al' : 'ok'), p.dias > 0 ? 'atrasada ' + p.dias + 'd' : p.dias === 0 ? 'vence hoje' : 'a vencer')); if (p.link) { var a = E('a', 'os-btn sm', 'Abrir'); a.href = p.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; x.appendChild(a); } L.appendChild(x); });
    var hd2 = E('div', 'os-blk-hd'); hd2.appendChild(E('h2', null, 'Últimos pagamentos')); w.appendChild(hd2);
    var L2 = E('div', 'os-list'); w.appendChild(L2); if (!F.pagos.length) vazio(L2, 'Nenhum pagamento encontrado.');
    F.pagos.forEach(function (p) { L2.appendChild(li(p.valor, 'vencimento ' + p.vencimento + (p.pago_em ? ' · pago em ' + p.pago_em.split('-').reverse().join('/') : ''), null, E('span', 'os-b ok', 'Pago'))); });
    var hd3 = E('div', 'os-blk-hd'); hd3.appendChild(E('h2', null, 'Régua de cobrança (WhatsApp)')); w.appendChild(hd3);
    var L3 = E('div', 'os-list'); w.appendChild(L3); if (!(F.regua || []).length) vazio(L3, 'Nenhum aviso enviado.');
    (F.regua || []).forEach(function (e) { L3.appendChild(li(e.etapa, rel(e.em), null, e.simulado ? E('span', 'os-b', 'Simulação') : E('span', 'os-b ok', 'Enviado'))); });
  }
  function abaProposta(w, r) {
    var P = propostasDoCliente(r.cliente);
    w.appendChild(E('p', 'card-sub', 'Propostas com o nome parecido com o desta empresa.'));
    if (!P.length) { vazio(w, 'Nenhuma proposta encontrada.', 'A ligação é feita pelo nome da empresa.'); return; }
    var L = E('div', 'os-list'); w.appendChild(L);
    P.forEach(function (p) { L.appendChild(li(p.cliente, valorDe(p) + ' · ' + new Date(p.criado_em).toLocaleDateString('pt-BR'), null, E('span', 'os-b ' + (etapa(p) === 'fechou' ? 'ok' : ''), rotStatus(p)), function () { irPara('propostas'); abreProposta(p.id); })); });
  }
  function abaOnb(w, r) {
    var c = r.cliente;
    dl(w, [['Formulário', c.onboarding_url || '—'], ['Senha', c.tem_senha ? 'cadastrada (use "Copiar senha")' : 'sem senha vinculada']]);
    if (c.onboarding_url) { var a = E('a', 'os-btn'); a.style.marginTop = '12px'; a.href = c.onboarding_url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.appendChild(I('link')); a.appendChild(E('span', null, 'Abrir formulário')); w.appendChild(a); }
  }
  function abaArq(w, r) {
    var c = r.cliente; if (!c.drive_url && !c.manual_gravacao_url) { vazio(w, 'Nenhum link de arquivos.', EU() === 'isaque' ? 'Edite o cadastro para incluir o Drive e o manual de gravação.' : ''); return; }
    var L = E('div', 'os-list'); w.appendChild(L);
    [[c.drive_url, 'Pasta no Drive'], [c.manual_gravacao_url, 'Manual de gravação']].forEach(function (x) { if (!x[0]) return; var a = E('a', 'os-li'); a.href = x[0]; a.target = '_blank'; a.rel = 'noopener noreferrer'; var g = E('div', 'g'); g.appendChild(E('b', null, x[1])); g.appendChild(E('span', null, x[0])); a.appendChild(g); L.appendChild(a); });
  }
  function abaNotas(w, r) {
    if (!r.sql) { erro(w, 'Falta rodar o SQL do Studio OS no Supabase para usar as anotações.'); return; }
    var f = E('div', 'card'); var ta = E('textarea', 'inp'); ta.rows = 3; ta.placeholder = 'Anotação interna (só a equipe vê)'; ta.setAttribute('aria-label', 'Nova anotação'); ta.maxLength = 4000; f.appendChild(ta);
    var bt = BI('os-btn pri', null, 'Salvar anotação', function () {
      var t = ta.value.trim(); if (!t) return ta.focus(); bt.disabled = true;
      wa('nota_add', {cliente_id: r.cliente.id, texto: t}).then(function (x) { bt.disabled = false; if (!x.ok) return msg(x.erro || 'erro', true); r.notas.unshift(x.nota); r.linha.unshift({tipo: 'nota', em: x.nota.criado_em, texto: x.nota.texto, autor: x.nota.autor}); msg('Anotação salva.'); ficha(); });
    }); bt.style.marginTop = '8px'; f.appendChild(bt); w.appendChild(f);
    if (!r.notas.length) { vazio(w, 'Nenhuma anotação ainda.'); return; }
    r.notas.forEach(function (n) { var d = E('div', 'os-nota'); d.appendChild(E('p', null, n.texto)); d.appendChild(E('span', null, (NOMES[n.autor] || n.autor) + ' · ' + new Date(n.criado_em).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}))); w.appendChild(d); });
  }
  // cadastro (o formulário do WhatsApp, com CNPJ, e-mail do responsável, Asaas e números) num painel lateral
  function drawerCadastro(k) {
    var f = E('div', 'os-dr-fundo'), dr = E('div', 'os-dr'); dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-modal', 'true'); dr.setAttribute('aria-label', k.id ? 'Editar cadastro' : 'Novo cliente');
    var hd = E('div', 'os-dr-hd'); hd.appendChild(E('b', null, k.id ? 'Editar cadastro · ' + k.nome : 'Novo cliente')); hd.appendChild(BI('os-btn sm', 'x', 'Fechar', fecha)); dr.appendChild(hd);
    var bd = E('div', 'os-dr-bd'); dr.appendChild(bd);
    document.body.appendChild(f); document.body.appendChild(dr);
    requestAnimationFrame(function () { f.classList.add('on'); dr.classList.add('on'); });
    f.addEventListener('click', fecha);
    var esc = function (e) { if (e.key === 'Escape') fecha(); }; document.addEventListener('keydown', esc);
    if (!window.atAbrir) { bd.appendChild(E('p', null, 'Cadastro indisponível.')); return; }
    if (!k.id) { atAbrir('form', bd, {}, fecha); return; }
    sk(bd, 4);
    wa('clientes').then(function (r) {   // o formulário usa o cadastro completo (com os números)
      var x = r.ok ? r.lista.filter(function (y) { return y.id === k.id; })[0] : null;
      if (!x) { limpa(bd); erro(bd, 'Não foi possível abrir o cadastro: ' + (r.erro || 'cliente não encontrado')); return; }
      atAbrir('form', bd, x, fecha);
    });
    function fecha() { document.removeEventListener('keydown', esc); dr.remove(); f.remove(); CL.d = null; if ($('scrClientes').classList.contains('on')) osClientes(); if ($('scrFicha').classList.contains('on') && FC.id) osFicha(FC.id); }
  }

  // ================= Financeiro =================
  var FN = {d: null, f: 'todas'};
  function osFin() {
    var sc = limpa($('scrFin'));
    cab(sc, 'Financeiro', 'Cobranças do Asaas e régua do WhatsApp (só leitura do Asaas)', [B('os-btn', 'Simular a régua de hoje', function () {
      wa('regua_simular').then(function (r) { if (!r.ok) return msg(r.motivo || r.erro || 'erro', true); msg(r.etapas && r.etapas.length ? 'Hoje sairiam: ' + r.etapas.map(function (e) { return e.etapa + ' · ' + (e.cliente || ''); }).join('; ') : 'Hoje a régua não enviaria nada.'); });
    })]);
    var kp = E('div', 'os-kpis'); kp.id = 'osFinK'; sc.appendChild(kp); for (var i = 0; i < 4; i++) kp.appendChild(E('span', 'os-sk k', ''));
    var corpo = E('div'); corpo.id = 'osFinCorpo'; sc.appendChild(corpo); sk(corpo, 6);
    wa('financeiro').then(function (r) { FN.d = r; desenhaFin(); });
  }
  function desenhaFin() {
    var kp = limpa($('osFinK')), w = limpa($('osFinCorpo')), r = FN.d; if (!w) return;
    if (!r || !r.ok || !r.kpi) { erro(w, (r && r.erro) || 'Não foi possível carregar.', osFin); return; }
    if (!Array.isArray(r.cobrancas)) r.cobrancas = []; if (!Array.isArray(r.historico)) r.historico = [];
    var k = r.kpi;
    var k1 = kpi(kp, 'Recebido no mês', brl0(k.recebido), [tendencia(k.recebido, k.recebido_ant), k.meta ? E('span', null, 'meta ' + brl0(k.meta)) : null]); if (k.meta) barra(k1, k.recebido / k.meta * 100);
    kpi(kp, 'A receber', brl0(k.a_receber), [E('span', null, 'a vencer, até 45 dias')]);
    kpi(kp, 'Atrasado', brl0(k.atrasado), [E('span', k.atrasado ? 'dn' : null, r.cobrancas.filter(function (c) { return c.dias > 0; }).length + ' cobrança(s)')]);
    kpi(kp, 'Clientes pausados', String(k.pausados), [E('span', k.pausados ? 'dn' : null, k.pausados ? 'serviço em pausa por atraso' : 'nenhum')]);
    var F = {todas: function () { return true; }, atrasadas: function (c) { return c.dias > 0; }, semana: function (c) { return c.dias <= 0 && c.dias >= -7; }, pausados: function (c) { return c.status_cliente === 'pausado'; }};
    var ch = E('div', 'os-chips'); w.appendChild(ch);
    [['todas', 'Todas'], ['atrasadas', 'Atrasadas'], ['semana', 'Vencem em 7 dias'], ['pausados', 'Clientes pausados']].forEach(function (x) { var n = r.cobrancas.filter(F[x[0]]).length, b = B('os-chip' + (FN.f === x[0] ? ' on' : ''), null, function () { FN.f = x[0]; desenhaFin(); }); b.appendChild(document.createTextNode(x[1])); b.appendChild(E('span', 'n', String(n))); b.setAttribute('aria-pressed', FN.f === x[0] ? 'true' : 'false'); ch.appendChild(b); });
    var L = r.cobrancas.filter(F[FN.f]);
    if (!L.length) vazio(w, 'Nenhuma cobrança neste filtro.');
    else {
      var tw = E('div', 'os-tw'), t = E('table', 'os-t'); tw.appendChild(t);
      var th = E('thead'), tr = E('tr'); ['Cliente', 'Vencimento', 'Valor', 'Situação', 'Régua', 'Próxima ação', ''].forEach(function (h, i) { var x = E('th', null, h); x.scope = 'col'; if (i === 2) x.style.textAlign = 'right'; tr.appendChild(x); }); th.appendChild(tr); t.appendChild(th);
      var tb = E('tbody'); t.appendChild(tb);
      L.forEach(function (c) {
        var r2 = E('tr'); if (c.cliente_id) { r2.tabIndex = 0; r2.addEventListener('click', function (ev) { if (ev.target.closest('button,a')) return; osFicha(c.cliente_id); }); } else r2.style.cursor = 'default';
        var c0 = E('td'); c0.appendChild(E('b', null, c.cliente)); r2.appendChild(c0);
        r2.appendChild(E('td', null, c.vencimento)); r2.appendChild(E('td', 'n', c.valor));
        var c3 = E('td'); c3.appendChild(E('span', 'os-b ' + (c.dias > 0 ? 'er' : c.dias === 0 ? 'al' : ''), c.dias > 0 ? 'Atrasada ' + c.dias + 'd' : c.dias === 0 ? 'Vence hoje' : 'A vencer')); r2.appendChild(c3);
        r2.appendChild(E('td', null, c.etapas.length ? c.etapas.map(function (e) { return e.etapa + (e.simulado ? '*' : ''); }).join(' → ') : '—'));
        r2.appendChild(E('td', null, c.proxima));
        var c6 = E('td'); c6.style.whiteSpace = 'nowrap';
        if (c.link) { var a = E('a', 'os-btn sm', 'Asaas'); a.href = c.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; c6.appendChild(a); }
        if (c.proxima !== 'régua pulada' && c.dias > -4) c6.appendChild(B('os-btn sm', 'Pular régua', function () {
          hModal('Parar a régua desta cobrança?', c.cliente + ' · ' + c.valor + ' · vence ' + c.vencimento + '. Os avisos automáticos do WhatsApp param para esta cobrança (o Asaas continua igual).', null, [{t: 'Voltar', f: hFechar}, {t: 'Parar a régua', c: 'perigo', f: function () {
            hFechar(); wa('regua_pular', {pagamento: c.id}).then(function (x) { msg(x.ok ? 'Régua parada para esta cobrança.' : x.erro, !x.ok); if (x.ok) osFin(); });
          }}]);
        }));
        if (c.status_cliente === 'pausado') c6.appendChild(B('os-btn sm', 'Reativar cliente', function () { wa('cliente_status', {id: c.cliente_id, status: 'ativo'}).then(function (x) { msg(x.ok ? 'Cliente reativado.' : x.erro, !x.ok); if (x.ok) osFin(); }); }));
        r2.appendChild(c6); tb.appendChild(r2);
      });
      w.appendChild(tw);
      w.appendChild(E('p', 'card-sub', '* simulação (com WHATSAPP_ATIVO desligado nada sai para o cliente). Etapas: D-3, D0, D+2, D+5 (aviso de pausa), D+6 (pausa), D+10 (equipe).'));
    }
    var hd = E('div', 'os-blk-hd'); hd.appendChild(E('h2', null, 'Histórico de envios da régua')); hd.appendChild(E('span', null, String(r.historico.length))); w.appendChild(hd);
    var H = E('div', 'os-list'); w.appendChild(H);
    if (!r.historico.length) vazio(H, 'Nenhum envio ainda.');
    r.historico.slice(0, 40).forEach(function (e) { H.appendChild(li((e.cliente || 'Cliente') + ' · ' + e.etapa, (e.detalhe || '') + '', rel(e.em), E('span', 'os-b ' + (e.simulado ? '' : 'ok'), e.simulado ? 'Simulação' : 'Enviado'))); });
  }

  // ================= Ajustes (partes novas) =================
  var AJ = {sub: 'wa'};
  function osAjustes() {
    var w = $('osAjustes'); if (!w || EU() !== 'isaque') return;
    limpa(w);
    // metas
    var hd = E('div', 'sec-hd'); hd.appendChild(E('h2', 'sec', 'Metas')); hd.appendChild(E('span')); w.appendChild(hd);
    var c = E('div', 'card'); w.appendChild(c);
    var cp = function (rot, id, ph) { var f = E('div', 'field'); var l = E('label', 'label', rot); l.htmlFor = id; f.appendChild(l); var i = E('input', 'inp'); i.id = id; i.inputMode = 'decimal'; i.placeholder = ph; f.appendChild(i); c.appendChild(f); return i; };
    var m1 = cp('Recebido no mês (R$)', 'osMetaRec', 'ex.: 20000'), m2 = cp('Propostas fechadas no mês', 'osMetaFec', 'ex.: 4');
    c.appendChild(B('btn-out ok', 'Salvar metas', function () { wa('metas_salvar', {metas: {recebido_mes: m1.value, propostas_fechadas_mes: m2.value}}).then(function (r) { msg(r.ok ? 'Metas salvas.' : r.erro, !r.ok); }); }));
    wa('metas_get').then(function (r) { if (r.ok && r.metas) { m1.value = r.metas.recebido_mes || ''; m2.value = r.metas.propostas_fechadas_mes || ''; } });
    // usuários
    var hu = E('div', 'sec-hd'); hu.appendChild(E('h2', 'sec', 'Usuários')); hu.appendChild(E('span')); w.appendChild(hu);
    var cu = E('div', 'os-list'); w.appendChild(cu);
    cu.appendChild(li('Isaque', 'Tudo. Senha: variável ADMIN_PASSWORD no Vercel.', null, E('span', 'os-b ok', 'Administrador')));
    cu.appendChild(li('Ju', 'Início, Atendimento, Comercial e Clientes (sem Ajustes, Financeiro, Conteúdo e E-mails). Senha: variável ATENDIMENTO_SENHA_JU no Vercel.', null, E('span', 'os-b br', 'Atendimento')));
    w.appendChild(E('p', 'card-sub', 'Quem entra é reconhecido pela senha. 5 senhas erradas seguidas bloqueiam por 10 minutos. Mensagens, conversas assumidas e anotações ficam com o nome de quem fez.'));
    // notificações
    var hn = E('div', 'sec-hd'); hn.appendChild(E('h2', 'sec', 'Notificações no celular')); hn.appendChild(E('span')); w.appendChild(hn);
    var cn = E('div', 'card'); w.appendChild(cn);
    cn.appendChild(E('p', 'card-sub', 'Avisam quando chega mensagem para a equipe, quando alguém pede atendimento humano e quando um visitante novo escreve. Ative no app (abra /atendimento.html no celular e instale).'));
    var lb = E('label', 'ck-l'); var ck = E('input'); ck.type = 'checkbox'; ck.id = 'osPushTudo'; lb.appendChild(ck); lb.appendChild(E('span', null, 'Notificar todas as mensagens (inclusive as que a IA está respondendo)')); cn.appendChild(lb);
    ck.addEventListener('change', function () { wa('config_salvar', {chave: 'push_tudo', valor: ck.checked}).then(function (r) { msg(r.ok ? 'Salvo.' : r.erro, !r.ok); }); });
    wa('config').then(function (r) { if (r.ok && r.valores) ck.checked = r.valores.push_tudo === true; });
    var ap = E('a', 'btn-out'); ap.href = '/atendimento.html'; ap.style.marginTop = '10px'; ap.textContent = 'Abrir o app de atendimento'; cn.appendChild(ap);
    // WhatsApp e senhas do onboarding (telas que já existiam)
    var hw = E('div', 'sec-hd'); hw.appendChild(E('h2', 'sec', 'WhatsApp e onboarding')); hw.appendChild(E('span')); w.appendChild(hw);
    var sg = E('div', 'segm'); sg.setAttribute('role', 'group'); sg.setAttribute('aria-label', 'Qual ajuste'); sg.style.marginBottom = '12px';
    var box = E('div');
    [['wa', 'Atendimento (IA, modelos, horário)'], ['senhas', 'Senhas do onboarding']].forEach(function (x) { var b = B(AJ.sub === x[0] ? 'on' : '', x[1], function () { AJ.sub = x[0]; sg.querySelectorAll('button').forEach(function (y) { y.classList.toggle('on', y === b); y.setAttribute('aria-pressed', y === b ? 'true' : 'false'); }); abre(); }); b.setAttribute('aria-pressed', AJ.sub === x[0] ? 'true' : 'false'); sg.appendChild(b); });
    w.appendChild(sg); w.appendChild(box);
    function abre() { if (window.atAbrir) atAbrir(AJ.sub === 'wa' ? 'ajustes' : 'senhas', box); }
    abre();
  }

  // ================= roteamento =================
  window.osTela = function (t) {
    if (t !== 'propostas') fechaDrawer();
    if (t === 'inicio') osInicio();
    else if (t === 'propostas') osComercial();
    else if (t === 'clientes') osClientes();
    else if (t === 'fin') osFin();
    else if (t === 'ajustes') osAjustes();
  };
  var entrou = window.appEntrou;
  window.appEntrou = function () {
    perfil();
    var m = /ficha=([0-9a-f-]{36})/.exec(location.hash || '');
    if (entrou) entrou();
    if (m) osFicha(m[1]); else if (/^#(financeiro|fin)$/.test(location.hash) && EU() === 'isaque') irPara('fin'); else if (location.hash === '#atend') irPara('atend');
  };
  ['osBuscaBtn', 'osBuscaCel'].forEach(function (id) { var b = $(id); if (b) b.addEventListener('click', abreBusca); });
  window.osBusca = abreBusca;
  if (window.icoFill) icoFill($('navApp'));
})();
