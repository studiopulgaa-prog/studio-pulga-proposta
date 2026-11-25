// admin-app.js — telas do admin: Início, Propostas (lista), Detalhe, Nova proposta (modelo, validade, rodapé), E-mails e Ajustes.
// Usa as funções que já existem em admin.html (adm, carregarHistorico, gerarLink, histCancelar, histReativar, envioEmail...).
// Dados vindos do servidor vão para a tela só por textContent (nada de innerHTML com dados). innerHTML só com ícones fixos.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var TELA = 'inicio', DET_ID = null, DET_VOLTA = 'propostas';
  var P_ST = 'ativas', P_TESTES = false, P_BUSCA = '', P_N = 20, PAG = 20;
  var NV_MODELO = 'arq', NV_MODO = 'copiar', LINKS = {};
  var NICHO_N = {arquiteto: 'Arquiteto/Designer', loja: 'Loja', outro: 'Outro'};
  var ABA_N = {avulsos: 'Avulsos', recorrente: 'Recorrente', milao: 'Especial Milão'};
  var MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  window.AJ_AREA = 'pl'; window.P_TIPO = 'todas';

  // ---------- pequenos construtores (DOM) ----------
  function E(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function Ic(n, sz) { var s = document.createElement('span'); s.innerHTML = ICO(n, sz); return s.firstChild; }
  function B(cls, ic, txt, f) {
    var b = E('button', cls); b.type = 'button';
    if (ic) b.appendChild(Ic(ic, 18));
    if (txt) b.appendChild(document.createTextNode(txt));
    if (f) b.addEventListener('click', f);
    return b;
  }
  function limpa(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function semAcento(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // ---------- datas no horário de Brasília ----------
  var FMT = new Intl.DateTimeFormat('pt-BR', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});
  function partes(ms) { var o = {}; FMT.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; }); if (o.hour === '24') o.hour = '00'; return o; }
  function diaNum(ms) { var o = partes(ms); return Date.UTC(+o.year, +o.month - 1, +o.day) / 86400000; }
  function hm(ms) { var o = partes(ms); return o.hour + ':' + o.minute; }
  function dm(ms) { var o = partes(ms); return o.day + '/' + o.month; }
  function quando(iso) {   // "hoje às 18:00", "amanhã às 09:10", "ontem às 20:00", "28/11 às 18:00"
    var ms = Date.parse(iso); if (!isFinite(ms)) return '—';
    var d = diaNum(ms) - diaNum(Date.now());
    return (d === 0 ? 'hoje' : d === 1 ? 'amanhã' : d === -1 ? 'ontem' : dm(ms)) + ' às ' + hm(ms);
  }
  function restam(iso) {
    var r = Date.parse(iso) - Date.now(); if (!(r > 0)) return '';
    var h = Math.floor(r / 3600000), d = Math.floor(h / 24);
    if (d >= 1) return 'restam ' + d + (d === 1 ? ' dia' : ' dias') + (h % 24 ? ' e ' + (h % 24) + ' h' : '');
    if (h >= 1) return 'restam ' + h + ' h';
    return 'restam ' + Math.max(1, Math.ceil(r / 60000)) + ' min';
  }

  // ---------- leitura de uma proposta ----------
  function st(p) { return p.status || (propAtiva(p) ? 'ativa' : 'expirada'); }
  function ehTeste(p) { return /^\s*(teste|zz)/i.test(String(p.cliente || '')) || p.seq_status === 'teste'; }
  function acs(p) { return p.acs || {}; }
  function nAb(p) { var A = acs(p); return Number(A.aberturas != null ? A.aberturas : p.ac) || 0; }
  function nDv(p) { var A = acs(p); return Number(A.dispositivos != null ? A.dispositivos : p.dv) || 0; }
  function escolha(p) { var A = acs(p); return A.escolheu || (Number(p.emails_cliente) > 0 ? 'plano' : ''); }
  function fechada(p) { return p.seq_status === 'fechada'; }
  function tipoP(p) { return areaDe(p) === 'cd' ? 'cardapio' : 'planos'; }
  function modeloTxt(p) {
    if (tipoP(p) === 'cardapio') return 'Cardápio';
    return 'Planos · ' + ({arquiteto: 'Arquiteto', loja: 'Loja', outro: 'Outro'}[p.nicho] || 'Arquiteto');
  }
  function valoresTxt(p) {
    if (tipoP(p) === 'cardapio') return p.v1 ? 'Plano de entrada R$ ' + p.v1 : '';
    var pl = p.planos || [true, true, true], o = [];
    [p.v1, p.v2, p.v3].forEach(function (v, i) { if (pl[i] && v) o.push('P' + (i + 1) + ' R$ ' + v); });
    return o.join(' · ');
  }
  function escolhaTxt(p) { var e = escolha(p); return e === 'plano' ? 'Escolheu um plano' : 'Escolheu ' + e; }

  // ---------- navegação ----------
  var SEC = {inicio: 'scrInicio', propostas: 'secHist', detalhe: 'scrDetalhe', nova: 'secNova', emails: 'scrEmails', ajustes: 'scrAjustes'};
  function irPara(t, semRolar) {
    if (!SEC[t]) t = 'inicio';
    var antes = TELA; TELA = t;
    Object.keys(SEC).forEach(function (k) { var s = $(SEC[k]); if (s) s.classList.toggle('on', k === t); });
    var navK = t === 'detalhe' ? 'propostas' : t;
    document.querySelectorAll('#navApp [data-nav]').forEach(function (b) {
      var on = b.getAttribute('data-nav') === navK; b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.body.classList.toggle('tem-foot', t === 'nova');
    if (t === 'nova' && antes !== 'nova' && AREA === 'cd' && !window.NV_DUP) { nvSync(); nvAbasDoModelo(); }
    if (t === 'nova') nvAtualiza();
    if (t === 'ajustes') ajRender();
    if (t === 'emails' && window.carregarPainelEmails) carregarPainelEmails();
    if (t === 'inicio') { renderInicio(); emailsSemana(false); }
    if (t === 'propostas') renderLista();
    if (!semRolar) window.scrollTo(0, 0);
  }
  window.irPara = irPara;
  window.appEntrou = function () { document.body.classList.remove('lg'); irPara('inicio'); };
  window.appRender = function () {
    renderInicio(); renderLista();
    if (TELA === 'detalhe') { if (propPorId(DET_ID)) renderDetalhe(); else irPara('propostas'); }
  };

  // ---------- INÍCIO ----------
  function saudacao() { var h = +partes(Date.now()).hour; return h >= 5 && h < 12 ? 'bom dia' : h >= 12 && h < 18 ? 'boa tarde' : 'boa noite'; }
  function renderInicio() {
    var t = limpa($('inTit')); t.appendChild(document.createTextNode(saudacao() + ', ')); t.appendChild(E('strong', null, 'Isaque'));
    var base = _lista.filter(function (p) { return !ehTeste(p); });
    var at = base.filter(function (p) { return st(p) === 'ativa'; });
    $('inAtivas').textContent = at.length;
    $('inAbriram').textContent = at.filter(function (p) { return nAb(p) > 0; }).length;
    $('inEscolheram').textContent = at.filter(function (p) { return escolha(p); }).length;
    // precisam de atenção
    var itens = [];
    base.forEach(function (p) {
      var s = st(p); if (s === 'cancelada') return;
      var mot = [], prio = 9, ac = null, ic = 'eye', cls = '';
      var esc = escolha(p), rest = Date.parse(p.expira_em) - Date.now();
      if (esc && !fechada(p) && p.seq_status !== 'descadastrada') { mot.push(escolhaTxt(p)); prio = 1; ic = 'check'; cls = 'ok'; ac = {t: 'Fechou', c: 'ok', f: function () { seqFechou(p.id); }}; }
      if (s === 'ativa' && rest > 0 && rest <= 86400000) { mot.push('Vence ' + quando(p.expira_em)); if (prio > 2) { prio = 2; ic = 'clock'; ac = {t: 'Renovar', f: function () { histReativar(p.id); }}; } }
      if (s === 'ativa' && nDv(p) > 3) { mot.push('Aberta em ' + nDv(p) + ' aparelhos'); if (prio > 3) { prio = 3; ic = 'phone'; cls = 'al'; } }
      if (s === 'ativa' && nAb(p) > 0 && !esc) { mot.push('Abriu ' + nAb(p) + 'x, não escolheu'); if (prio > 4) prio = 4; }
      if (!mot.length) return;
      itens.push({p: p, mot: mot, prio: prio, ac: ac, ic: ic, cls: cls, rest: rest});
    });
    itens.sort(function (a, b) { return a.prio - b.prio || a.rest - b.rest; });
    $('inAtN').textContent = itens.length ? String(itens.length) : '';
    var w = limpa($('inAtencao'));
    var box = E('div', 'lst'); w.appendChild(box);
    if (!itens.length) { box.appendChild(E('div', 'vazio', _lista.length ? 'Tudo em dia. Nenhuma proposta precisa de atenção agora.' : 'Nenhuma proposta ainda. Crie a primeira em "Nova proposta".')); return; }
    itens.slice(0, 8).forEach(function (x) {
      var r = E('div', 'lst-i');
      var ic = E('div', 'lst-ic' + (x.cls ? ' ' + x.cls : '')); ic.appendChild(Ic(x.ic, 18));
      var tx = E('button', 'lst-tx'); tx.type = 'button'; tx.style.cssText = 'border:none;background:none;text-align:left;padding:0;min-height:44px;justify-content:center;';
      tx.appendChild(E('b', null, x.p.cliente)); tx.appendChild(E('span', null, x.mot.join(' · ')));
      tx.setAttribute('aria-label', 'Abrir ' + x.p.cliente + ': ' + x.mot.join(', '));
      tx.addEventListener('click', function () { abrirDetalhe(x.p.id, 'inicio'); });
      r.appendChild(ic); r.appendChild(tx);
      var a = x.ac || {t: 'Ver', f: function () { abrirDetalhe(x.p.id, 'inicio'); }};
      var bt = B('lst-a' + (a.c ? ' ' + a.c : ''), null, a.t, a.f); bt.setAttribute('aria-label', a.t + ': ' + x.p.cliente);
      r.appendChild(bt); box.appendChild(r);
    });
    if (itens.length > 8) { var m = B('btn-out', null, 'Ver todas as propostas', function () { irPara('propostas'); }); m.style.cssText = 'width:100%;margin-top:8px;'; w.appendChild(m); }
  }
  var EM_T = 0, EM_D = null;
  function emailsSemana(forcar) {
    if (!window.emailsApi) return;
    if (!forcar && EM_D && Date.now() - EM_T < 60000) return desenhaEm(EM_D);
    emailsApi('painel').then(function (d) { if (d && d.ok) { EM_D = d; EM_T = Date.now(); } desenhaEm(d); }).catch(function () {});
  }
  function desenhaEm(d) {
    var w = limpa($('inEmails'));
    var box = E('div', 'em-sem'); w.appendChild(box);
    if (!d || !d.ok) { var x = E('div'); x.appendChild(E('span', null, 'Não foi possível carregar os e-mails agora.')); box.appendChild(x); return; }
    var sem = Date.now() - 7 * 86400000, sim = d.modo !== 'envio';
    var lg = (d.log || []).filter(function (l) { return Date.parse(l.criado_em) >= sem; });
    var cnt = function (f) { return lg.filter(f).length; };
    var nums = sim ? [[cnt(function (l) { return l.status === 'simulado'; }), 'Simulados'], [cnt(function (l) { return l.status !== 'simulado'; }), 'Enviados']]
                   : [[cnt(function (l) { return l.status !== 'simulado'; }), 'Enviados'], [cnt(function (l) { return l.status === 'entregue'; }), 'Entregues']];
    nums.push([(d.proximos || []).filter(function (x) { return !x.aviso; }).length, 'Agendados']);
    nums.forEach(function (n) { var c = E('div'); c.appendChild(E('b', null, String(n[0]))); c.appendChild(E('span', null, n[1])); box.appendChild(c); });
    var s = E('span', 'selo ' + (sim ? 'sim' : 'at'), sim ? 'Simulação' : 'Ativo'); box.appendChild(s);
    var bt = B('btn-out', null, 'Abrir E-mails', function () { irPara('emails'); }); bt.style.cssText = 'width:100%;margin-top:8px;'; w.appendChild(bt);
  }

  // ---------- PROPOSTAS ----------
  var ST_F = {
    ativas: function (p) { return st(p) === 'ativa'; },
    escolheram: function (p) { return !!escolha(p); },
    expiradas: function (p) { return st(p) === 'expirada'; },
    canceladas: function (p) { return st(p) === 'cancelada'; }
  };
  function baseLista(comTestes) {
    var q = semAcento(P_BUSCA).trim();
    return _lista.filter(function (p) {
      if (window.P_TIPO !== 'todas' && tipoP(p) !== window.P_TIPO) return false;
      if (!comTestes && ehTeste(p)) return false;
      if (q && semAcento(p.cliente).indexOf(q) < 0) return false;
      return true;
    });
  }
  function renderLista() {
    var base = baseLista(P_TESTES);
    // chips de situação
    var ch = limpa($('pChips'));
    [['ativas', 'Ativas'], ['escolheram', 'Escolheram'], ['expiradas', 'Expiradas'], ['canceladas', 'Canceladas']].forEach(function (c) {
      var n = base.filter(ST_F[c[0]]).length, on = P_ST === c[0];
      var b = B('chip' + (on ? ' on' : ''), null, c[1] + ' ', function () { P_ST = on ? '' : c[0]; P_N = PAG; renderLista(); });
      b.appendChild(E('span', 'n', String(n))); b.setAttribute('aria-pressed', on ? 'true' : 'false'); ch.appendChild(b);
    });
    var tst = _lista.filter(function (p) { return ehTeste(p) && (window.P_TIPO === 'todas' || tipoP(p) === window.P_TIPO); });
    var bt = B('chip tst' + (P_TESTES ? ' on' : ''), null, 'Mostrar testes ', function () { P_TESTES = !P_TESTES; P_N = PAG; renderLista(); });
    bt.appendChild(E('span', 'n', String(tst.length))); bt.setAttribute('aria-pressed', P_TESTES ? 'true' : 'false'); ch.appendChild(bt);
    // limpar testes
    var lt = limpa($('pTestes'));
    lt.style.display = tst.length ? '' : 'none';
    if (tst.length) { lt.appendChild(E('span', null, tst.length + (tst.length === 1 ? ' proposta de teste' : ' propostas de teste') + (P_TESTES ? '' : ' escondidas'))); lt.appendChild(B('btn-out', 'trash', 'Limpar testes', function () { limparTestes(tst); })); }
    // cartões
    var L = P_ST ? base.filter(ST_F[P_ST]) : base;
    var w = $('histLista'); limpa(w);
    if (!L.length) {
      var msg = !_lista.length ? 'Nenhuma proposta ainda. Toque em "Nova" para criar a primeira.' : P_BUSCA ? 'Nenhuma proposta com "' + P_BUSCA + '".' : 'Nenhuma proposta ' + ({ativas: 'ativa', escolheram: 'escolhida', expiradas: 'expirada', canceladas: 'cancelada'}[P_ST] || '') + ' por aqui.';
      w.appendChild(E('div', 'empty', msg)); return;
    }
    L.slice(0, P_N).forEach(function (p) { w.appendChild(cartao(p)); });
    if (L.length > P_N) {
      var m = B('btn-out mais', null, 'Carregar mais ' + Math.min(PAG, L.length - P_N) + ' (' + (L.length - P_N) + ' restantes)', function () { P_N += PAG; renderLista(); });
      w.appendChild(m);
    }
  }
  function pillStatus(p) {
    var s = st(p);
    if (s === 'cancelada') return E('span', 'pill cn', 'Cancelada');
    if (s === 'expirada') return E('span', 'pill ex', 'Expirada');
    if (escolha(p)) return E('span', 'pill ok', escolha(p) === 'plano' ? 'Escolheu' : 'Escolheu ' + escolha(p));
    var r = Date.parse(p.expira_em) - Date.now(), d = diaNum(Date.parse(p.expira_em)) - diaNum(Date.now());
    if (r > 0 && d <= 1) return E('span', 'pill vc', d === 0 ? 'Vence hoje' : 'Vence amanhã');
    return E('span', 'pill at', 'Ativa');
  }
  function validadeTxt(p) {
    var s = st(p);
    if (s === 'cancelada') return 'cancelada ' + (p.cancelada_em ? quando(p.cancelada_em) : '');
    if (s === 'expirada') return 'expirou ' + quando(p.expira_em);
    return 'vence ' + quando(p.expira_em);
  }
  function cartao(p) {
    var c = E('button', 'pc'); c.type = 'button';
    var l1 = E('div', 'pc-l1'); l1.appendChild(E('span', 'pc-n', p.cliente)); l1.appendChild(pillStatus(p)); c.appendChild(l1);
    c.appendChild(E('span', 'pc-m', modeloTxt(p) + ' · ' + validadeTxt(p)));
    var b = E('div', 'pc-b'), ab = nAb(p), dv = nDv(p);
    if (ehTeste(p)) b.appendChild(E('span', 'pill ts', 'Teste'));
    b.appendChild(E('span', 'pill', ab ? 'Abriu ' + ab + 'x' : 'Não abriu'));
    if (dv) b.appendChild(E('span', 'pill', dv + (dv === 1 ? ' dispositivo' : ' dispositivos')));
    if (dv > 3) { var a = E('span', 'pill al'); a.appendChild(Ic('alert', 14)); a.appendChild(document.createTextNode(dv + ' aparelhos')); a.title = 'Aberta em mais de 3 aparelhos: o link pode ter sido repassado'; b.appendChild(a); }
    if (escolha(p) && st(p) !== 'ativa') b.appendChild(E('span', 'pill ok', escolhaTxt(p)));
    if (fechada(p)) b.appendChild(E('span', 'pill ok', 'Cliente fechou'));
    c.appendChild(b);
    c.setAttribute('aria-label', p.cliente + ', ' + modeloTxt(p) + ', ' + validadeTxt(p) + ', ' + (ab ? 'abriu ' + ab + ' vezes' : 'não abriu'));
    c.addEventListener('click', function () { abrirDetalhe(p.id, 'propostas'); });
    return c;
  }
  function limparTestes(tst) {
    hModal('Limpar ' + tst.length + (tst.length === 1 ? ' proposta de teste?' : ' propostas de teste?'), 'Vão para a Lixeira (30 dias, dá para restaurar) e o link delas para de abrir.', function (c) {
      tst.slice(0, 30).forEach(function (p) { var d = E('div', 'hist-info'); d.appendChild(E('strong', null, p.cliente)); d.appendChild(document.createTextNode(' · ' + validadeTxt(p))); c.appendChild(d); });
      if (tst.length > 30) c.appendChild(E('div', 'hist-info', '… e mais ' + (tst.length - 30) + '.'));
    }, [{t: 'Voltar', f: hFechar}, {t: 'Mover para a Lixeira', c: 'perigo', f: function () {
      hFechar(); histMsg('Limpando testes…');
      var feitas = 0, falhas = [];
      tst.reduce(function (pr, p) { return pr.then(function () { return hAcao('lixeira_mover', {id: p.id}).then(function (r) { if (r.ok) feitas++; else falhas.push(p.cliente + ': ' + r.erro); }); }); }, Promise.resolve())
        .then(function () { return hFinal(feitas + (feitas === 1 ? ' teste foi' : ' testes foram') + ' para a Lixeira.' + (falhas.length ? ' NÃO foi: ' + falhas.join('; ') : ''), falhas.length > 0); })
        .catch(function () {});
    }}]);
  }

  // ---------- DETALHE ----------
  function abrirDetalhe(id, volta) {
    DET_ID = id; DET_VOLTA = volta || 'propostas';
    renderDetalhe(); irPara('detalhe');
    var p = propPorId(id);
    if (p && !LINKS[id] && (p.tem_snapshot || snapDe(id))) comSnap(p, function (L) { if (L && L.link) { LINKS[id] = L.link; if (TELA === 'detalhe' && DET_ID === id) renderDetalhe(); } });
  }
  window.abrirDetalhe = abrirDetalhe;
  function mensagemWA(p, link) {
    var n = primeiroNome(p.cliente);
    return 'Olá' + (n ? ', ' + n : '') + '! Preparei esta proposta pra você: ' + link + '. Ela é exclusiva e tem validade até ' + fmtValidade(Date.parse(p.expira_em)) + '.';
  }
  function copiar(txt, b) {
    var ok = function () { histMsg('Link copiado.'); if (b) { var o = b.lastChild.textContent; b.lastChild.textContent = 'Copiado'; setTimeout(function () { b.lastChild.textContent = o; }, 1800); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, function () { histMsg('Não foi possível copiar. Mantenha o dedo sobre o link para copiar.', true); });
    else histMsg('Este navegador não deixa copiar automaticamente.', true);
  }
  function tlItem(cls, t, sub) { var i = E('div', 'tl-i'); i.appendChild(E('div', 'tl-d' + (cls ? ' ' + cls : ''))); var d = E('div'); d.appendChild(E('b', null, t)); if (sub) d.appendChild(E('span', null, sub)); i.appendChild(d); return i; }
  function infoL(box, k, v, cls) { var r = E('div'); r.appendChild(E('span', null, k)); r.appendChild(E('span', cls || null, v)); box.appendChild(r); }
  function renderDetalhe() {
    var p = propPorId(DET_ID), w = limpa($('scrDetalhe'));
    if (!p) { w.appendChild(E('div', 'empty', 'Proposta não encontrada.')); return; }
    var idx = _lista.indexOf(p), s = st(p), A = acs(p), link = LINKS[p.id] || ((snapDe(p.id) || {}).link) || '';
    // topo
    var top = E('div', 'dt-top'); var bv = B('ib', 'back', null, function () { irPara(DET_VOLTA); }); bv.setAttribute('aria-label', 'Voltar'); top.appendChild(bv); w.appendChild(top);
    w.appendChild(E('span', 'mk', '// ' + modeloTxt(p).toLowerCase()));
    w.appendChild(E('h1', 'tt', p.cliente));
    var vt = valoresTxt(p); if (vt) w.appendChild(E('div', 'dt-meta', vt));
    var pb = E('div', 'pc-b'); pb.appendChild(pillStatus(p)); if (ehTeste(p)) pb.appendChild(E('span', 'pill ts', 'Teste')); if (fechada(p)) pb.appendChild(E('span', 'pill ok', 'Cliente fechou')); w.appendChild(pb);
    // validade
    var vd = E('div', 'vd'), vl = E('div', 'vd-l'), bar = E('div', 'vd-b'), fil = E('div');
    if (s === 'cancelada') { vl.appendChild(E('span', null, 'Cancelada ' + (p.cancelada_em ? quando(p.cancelada_em) : ''))); vl.appendChild(E('span', null, 'link bloqueado')); fil.style.width = '0'; }
    else if (s === 'expirada') { vl.appendChild(E('span', null, 'Expirou ' + quando(p.expira_em))); vl.appendChild(E('span', null, 'link bloqueado')); fil.style.width = '0'; }
    else {
      var tot = (parseInt(p.validade, 10) || 2) * 86400000, rest = Date.parse(p.expira_em) - Date.now();
      var t = quando(p.expira_em); vl.appendChild(E('span', null, 'Vence ' + t)); vl.appendChild(E('span', null, restam(p.expira_em)));
      fil.style.width = Math.max(3, Math.min(100, rest / tot * 100)) + '%';
    }
    bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', vl.textContent);
    bar.appendChild(fil); vd.appendChild(vl); vd.appendChild(bar); w.appendChild(vd);
    // 3 ações
    var acts = E('div', 'acts'), ativa = s === 'ativa', semLink = !link;
    var bc = B('btn-out', 'copy', 'Copiar link', function () { if (link) copiar(link, bc); }); bc.disabled = semLink;
    var bw = B('btn-out', 'wa', 'WhatsApp', function () { if (link) window.open('https://wa.me/?text=' + encodeURIComponent(mensagemWA(p, link)), '_blank', 'noopener'); }); bw.disabled = semLink || !ativa;
    var be = B('btn-out', 'mail', 'E-mail'); be.disabled = !p.email || !ativa; if (!be.disabled) be.setAttribute('data-mail', p.id);
    acts.appendChild(bc); acts.appendChild(bw); acts.appendChild(be); w.appendChild(acts);
    var notas = [];
    if (semLink) notas.push(p.tem_snapshot || snapDe(p.id) ? 'Carregando o link…' : 'O link desta proposta antiga não foi guardado.');
    if (!ativa) notas.push('WhatsApp e e-mail só para proposta ativa.');
    else if (!p.email) notas.push('Sem e-mail cadastrado.');
    if (notas.length) w.appendChild(E('div', 'acts-n', notas.join(' ')));
    // atividade
    var hd = E('div', 'sec-hd'); hd.appendChild(E('h2', 'sec', 'Atividade do cliente'));
    var ab = nAb(p), dv = nDv(p); hd.appendChild(E('span', null, ab ? ab + (ab === 1 ? ' abertura' : ' aberturas') + (dv ? ' · ' + dv + (dv === 1 ? ' dispositivo' : ' dispositivos') : '') : '')); w.appendChild(hd);
    var tl = E('div', 'tl'); w.appendChild(tl);
    if (!ab && !escolha(p)) tl.appendChild(tlItem('mu', 'Ainda não abriu', 'Criada ' + quando(p.criado_em)));
    else {
      if (escolha(p)) tl.appendChild(tlItem('ok', escolhaTxt(p), fechada(p) ? 'Marcada como cliente fechou' : 'Falta marcar "Cliente fechou"'));
      if (A.whatsapp) tl.appendChild(tlItem('ok', 'Clicou no WhatsApp', null));
      if (dv > 3) tl.appendChild(tlItem('al', 'Aberta em ' + dv + ' aparelhos', 'O link pode ter sido repassado.'));
      if (A.ultimo) tl.appendChild(tlItem('', 'Último acesso', quando(A.ultimo)));
      if ((A.planos || []).length) tl.appendChild(tlItem('', 'Viu ' + ((A.planos.length === 1) ? 'o plano ' : 'os planos ') + A.planos.join(', '), null));
      if ((A.abas || []).length) tl.appendChild(tlItem('', 'Viu ' + ((A.abas.length === 1) ? 'a aba ' : 'as abas ') + A.abas.map(function (a) { return ABA_N[a] || a; }).join(', '), null));
      var soma = 0;
      (A.aparelhos || []).forEach(function (d) {
        soma += Number(d.vezes) || 0;
        var ap = d.tipo ? d.tipo + (d.nav ? ' · ' + d.nav : '') : 'Aparelho não identificado (registro antigo)';
        tl.appendChild(tlItem('mu', 'Abriu ' + (Number(d.vezes) || 0) + 'x' + (d.ultimo ? ' · último ' + quando(d.ultimo) : ''), ap));
      });
      if (ab > soma) tl.appendChild(tlItem('mu', (ab - soma) + (ab - soma === 1 ? ' abertura' : ' aberturas') + ' sem aparelho registrado', 'Aparelho não identificado (registro antigo)'));
      if (A.primeiro) tl.appendChild(tlItem('', 'Primeira abertura', quando(A.primeiro)));
    }
    // e-mail
    if (p.email) {
      var h2 = E('div', 'sec-hd'); h2.appendChild(E('h2', 'sec', 'E-mail')); h2.appendChild(E('span')); w.appendChild(h2);
      var inf = E('div', 'info'); w.appendChild(inf);
      infoL(inf, 'Para', p.email);
      if (p.envio_erro) infoL(inf, 'Envio', 'Erro: ' + p.envio_erro + (p.enviado_em ? ' (último ok ' + quando(p.enviado_em) + ')' : ''), 'err-t');
      else infoL(inf, 'Envio', p.enviado_em ? 'Enviado ' + quando(p.enviado_em) : 'Ainda não enviado', p.enviado_em ? 'ok-t' : null);
      var sq = p.suprimido ? ['Bloqueado (rejeitado ou spam)', 'err-t'] : p.seq_status === 'fechada' ? ['Parados: cliente fechou', 'ok-t'] : p.seq_status === 'pausada' ? ['Pausados', 'al-t'] : p.seq_status === 'descadastrada' ? ['Parados: o cliente pediu para sair', 'err-t'] : ['Lembretes ligados (9h–11h, dia útil)', null];
      infoL(inf, 'Automáticos', sq[0], sq[1]);
      var bt = B('btn-out', 'mail', 'E-mails desta proposta'); bt.setAttribute('data-tl', p.id); bt.style.cssText = 'width:100%;margin-top:8px;'; w.appendChild(bt);
    }
    // gerenciar
    var h3 = E('div', 'sec-hd'); h3.appendChild(E('h2', 'sec', 'Gerenciar')); h3.appendChild(E('span')); w.appendChild(h3);
    var gr = E('div', 'gr'); w.appendChild(gr);
    if (p.seq_status !== 'descadastrada') { var bf = B('btn-out', fechada(p) ? 'restore' : 'check', fechada(p) ? 'Desfazer "Cliente fechou" (religar lembretes)' : 'Cliente fechou'); bf.setAttribute('data-fech', p.id); gr.appendChild(bf); }
    var br = B('btn-out', 'refresh', s === 'cancelada' ? 'Reativar proposta' : s === 'expirada' ? 'Reativar validade' : 'Renovar validade'); br.setAttribute('data-rea', p.id); gr.appendChild(br);
    var bd = B('btn-out', 'dup', 'Duplicar'); bd.setAttribute('data-dup', String(idx)); gr.appendChild(bd);
    if (p.email && p.seq_status !== 'descadastrada' && !p.suprimido && !fechada(p)) gr.appendChild(B('btn-out', p.seq_status === 'pausada' ? 'play' : 'pause', p.seq_status === 'pausada' ? 'Retomar e-mails desta proposta' : 'Pausar e-mails desta proposta', function () { pausar(p); }));
    gr.appendChild(B('btn-out', 'tag', 'Nicho e cliente mulher · ' + (NICHO_N[p.nicho] || 'Arquiteto/Designer') + (p.cliente_mulher ? ' · mulher' : ''), function () { nichoMulher(p); }));
    var rz = E('div', 'risco'); w.appendChild(rz);
    if (s !== 'cancelada') { var bx = B('btn-enc', 'ban', 'Cancelar proposta'); bx.setAttribute('data-enc', p.id); rz.appendChild(bx); }
    rz.appendChild(B('btn-enc', 'trash', 'Mover para a lixeira', function () { paraLixeira(p); }));
  }
  function pausar(p) {
    var pa = p.seq_status === 'pausada';
    hModal(pa ? 'Retomar os e-mails?' : 'Pausar os e-mails desta proposta?', pa ? 'Os lembretes automáticos voltam a valer para "' + p.cliente + '".' : 'Nenhum e-mail automático vai para "' + p.cliente + '" até você retomar. O link continua abrindo.', null,
      [{t: 'Voltar', f: hFechar}, {t: pa ? 'Retomar' : 'Pausar', c: 'pri', f: function () {
        hFechar(); histMsg('Salvando…');
        hAcao('seq_status', {id: p.id, status: pa ? 'ativa' : 'pausada'}).then(function (r) { return hFinal(r.ok ? (pa ? 'E-mails retomados.' : 'E-mails desta proposta pausados.') : 'Não foi possível: ' + r.erro, !r.ok); }).catch(function () {});
      }}]);
  }
  function paraLixeira(p) {
    hModal('Mover "' + p.cliente + '" para a lixeira?', 'Some da lista e o link para de abrir. Fica 30 dias na Lixeira (dá para restaurar) e depois é apagada de vez.', null,
      [{t: 'Voltar', f: hFechar}, {t: 'Mover para a lixeira', c: 'perigo', f: function () {
        hFechar(); histMsg('Movendo…');
        hAcao('lixeira_mover', {id: p.id}).then(function (r) {
          if (r.ok && DET_ID === p.id) TELA_DEPOIS = 'propostas';
          return hFinal(r.ok ? '"' + p.cliente + '" foi para a Lixeira (o link não abre mais).' : 'NÃO foi possível mover "' + p.cliente + '": ' + r.erro, !r.ok);
        }).catch(function () {});
      }}]);
  }
  var TELA_DEPOIS = null;
  function nichoMulher(p) {
    hModal('Nicho e cliente mulher', p.cliente + '. O nicho decide quais e-mails de datas especiais a proposta recebe; "cliente mulher" decide o e-mail do Dia da Mulher.', function (c) {
      var l = E('label', 'label', 'Nicho'); l.htmlFor = 'dtNicho'; c.appendChild(l);
      var se = E('select', 'inp'); se.id = 'dtNicho';
      Object.keys(NICHO_N).forEach(function (k) { var o = E('option', null, NICHO_N[k]); o.value = k; if ((p.nicho || 'arquiteto') === k) o.selected = true; se.appendChild(o); });
      c.appendChild(se);
      var ck = E('label', 'ck-l'); ck.style.marginTop = '10px'; var i = E('input'); i.type = 'checkbox'; i.checked = !!p.cliente_mulher; ck.appendChild(i); ck.appendChild(E('span', null, 'Cliente mulher (campanha do Dia da Mulher)')); c.appendChild(ck);
      var m = E('div', 'hist-info'); m.setAttribute('role', 'status'); m.style.marginTop = '6px'; c.appendChild(m);
      var salva = function (acao, dados, txt) {
        m.style.color = ''; m.textContent = 'Salvando…';
        hAcao(acao, Object.assign({id: p.id}, dados)).then(function (r) { m.style.color = r.ok ? '#2F6B3F' : '#A3261E'; m.textContent = r.ok ? txt : 'Não foi salvo: ' + r.erro; if (r.ok) carregarHistorico(); }).catch(function () {});
      };
      se.addEventListener('change', function () { salva('nicho', {valor: se.value}, 'Nicho salvo: ' + NICHO_N[se.value] + '.'); });
      i.addEventListener('change', function () { salva('mulher', {valor: i.checked}, i.checked ? 'Marcada como cliente mulher.' : 'Marcação removida.'); });
    }, [{t: 'Fechar', c: 'pri', f: hFechar}]);
  }

  // ---------- NOVA PROPOSTA ----------
  function nvAbasDoModelo() {
    if (NV_MODELO !== 'mi') return;
    [['nvAv', 'nvDivAv', false], ['nvRc', 'nvDivRc', false], ['nvMi', 'nvDivMi', true]].forEach(function (x) { $(x[0]).checked = x[2]; $(x[1]).classList.toggle('on', x[2]); });
    miCliRender();
  }
  window.nvAbasDoModelo = nvAbasDoModelo;
  function nvModelo(m, duplicando) {
    NV_MODELO = m;
    if (m === 'arq' || m === 'loja') { areaSet('pl'); if (!duplicando) modeloAplica(m); }
    else { areaSet('cd'); if (!duplicando) nvAbasDoModelo(); }
    if (window.nichoNovoModelo) nichoNovoModelo();
    nvAtualiza();
  }
  window.nvModelo = nvModelo;
  window.nvDuplicada = function () {   // depois de "Duplicar": o cartão do modelo segue o que veio da proposta antiga
    if (AREA === 'cd') NV_MODELO = ($('nvMi').checked && !$('nvAv').checked && !$('nvRc').checked) ? 'mi' : 'cd';
    else NV_MODELO = PL_MODELO === 'loja' ? 'loja' : 'arq';
    if (window.nichoNovoModelo) nichoNovoModelo();
    nvAtualiza();
  };
  function linhaR(box, k, v) { var r = E('div', 'rl'); r.appendChild(E('span', null, k)); r.appendChild(E('span', null, v)); box.appendChild(r); }
  function nvAtualiza() {
    if (!$('nvResumo')) return;
    document.querySelectorAll('#secNova [data-mdl]').forEach(function (b) { var on = b.getAttribute('data-mdl') === NV_MODELO; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    var sel = $('fNicho'); $('nichoTxt').textContent = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
    try {
      var M = (typeof c3S !== 'undefined' && c3S.mi) || {}, a = String(M.ida || ''), b = String(M.volta || '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b)) $('mdlMiSub').textContent = (+a.slice(8)) + ' a ' + (+b.slice(8)) + ' de ' + MES[+b.slice(5, 7) - 1];
    } catch (e) {}
    var r = limpa($('nvResumo'));
    if (AREA !== 'cd') {
      var nn = 0;
      [1, 2, 3].forEach(function (n) {
        if (!$('ck' + n).checked) return; nn++;
        var v = $('fV' + n).value.trim(), de = $('fVO' + n).value.trim();
        linhaR(r, n + 'º Pacote', v ? (de ? 'de R$ ' + de + ' por ' : '') + 'R$ ' + v : 'sem valor');
      });
      if (!nn) linhaR(r, 'Planos', 'nenhum marcado');
    } else {
      var ab = [['nvAv', 'Avulsos'], ['nvRc', 'Recorrente'], ['nvMi', 'Especial Milão']].filter(function (x) { return $(x[0]).checked; }).map(function (x) { return x[1]; });
      linhaR(r, 'Abas', ab.length ? ab.join(' · ') : 'nenhuma marcada');
      if ($('nvRc').checked) {
        var vE = $('cdVEntrada').value.trim(), base = '';
        try { var C = c3SBase(), ops = (C.rc.plano.ops || []), alvo = ops.filter(function (x) { return x.pre; })[0] || ops[0]; base = alvo ? String(alvo.valor) : ''; } catch (e) {}
        linhaR(r, 'Plano de entrada', vE ? 'R$ ' + vE + ' (só este cliente)' : base ? 'R$ ' + base : '—');
      }
      if ($('nvMi').checked) { var mt = ''; try { mt = String(c3SBase().mi.total || '').trim(); } catch (e) {} linhaR(r, 'Especial Milão', mt ? 'R$ ' + mt + ' no total' : 'valor dos Padrões'); }
    }
    linhaR(r, 'Validade', diasSel + (diasSel === 1 ? ' dia' : ' dias') + ' · até ' + fmtValidade(Date.now() + diasSel * 86400000));
    var em = ($('fEmail').value || '').trim(), okEm = /^\S+@\S+\.\S+$/.test(em);
    var bE = $('btnGerarEmail'); bE.disabled = !okEm; bE.title = okEm ? 'Gera o link e envia para ' + em : 'Preencha o e-mail do cliente para enviar';
    bE.textContent = okEm ? 'Gerar e enviar por e-mail' : 'Gerar e enviar por e-mail (sem e-mail)';
  }
  window.nvAtualiza = nvAtualiza;
  window.nvLinkPronto = function (link) {
    var t = $('resOkTxt');
    if (NV_MODO === 'email') { t.textContent = 'Link gerado. Enviando por e-mail…'; histMsg('Link gerado. Enviando por e-mail…'); }
    else {
      t.textContent = 'Link gerado';
      var fim = function (ok) { t.textContent = ok ? 'Link gerado e copiado' : 'Link gerado. Toque em "Copiar link".'; histMsg(ok ? 'Link gerado e copiado.' : 'Link gerado. Toque em "Copiar link" para copiar.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { fim(true); }, function () { fim(false); }); else fim(false);
    }
    setTimeout(function () { var el = $('result'); if (el && el.scrollIntoView) el.scrollIntoView({block: 'start', behavior: 'smooth'}); }, 50);
  };

  // ---------- AJUSTES ----------
  function ajRender() {
    var cd = window.AJ_AREA === 'cd';
    document.querySelectorAll('#scrAjustes [data-aj]').forEach(function (b) { var on = b.getAttribute('data-aj') === window.AJ_AREA; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('padTit').textContent = 'Padrões · ' + (cd ? 'Cardápio' : 'Planos de gestão');
    $('zonaArea').textContent = cd ? 'Cardápio' : 'Planos de gestão';
    $('padPl').style.display = cd ? 'none' : ''; $('padCd').style.display = cd ? '' : 'none';
    if (TELA !== 'ajustes') return;
    if (cd) { c3Render(); padCdBotoes(); } else padPlRender();
  }
  window.ajRender = ajRender;

  // ---------- ligações ----------
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('#navApp [data-nav]').forEach(function (b) { b.addEventListener('click', function () { irPara(b.getAttribute('data-nav')); }); });
    $('inNova').addEventListener('click', function () { irPara('nova'); });
    // lista
    $('pBusca').addEventListener('input', function () { P_BUSCA = this.value; P_N = PAG; renderLista(); });
    document.querySelectorAll('#secHist [data-ptipo]').forEach(function (b) {
      b.addEventListener('click', function () {
        window.P_TIPO = b.getAttribute('data-ptipo'); P_N = PAG;
        document.querySelectorAll('#secHist [data-ptipo]').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        renderLista();
      });
    });
    // nova
    document.querySelectorAll('#secNova [data-mdl]').forEach(function (b) { b.addEventListener('click', function () { nvModelo(b.getAttribute('data-mdl')); }); });
    $('nichoAlt').addEventListener('click', function () { var bx = $('nichoBox'), ab = bx.style.display === 'none'; bx.style.display = ab ? '' : 'none'; this.setAttribute('aria-expanded', ab ? 'true' : 'false'); this.textContent = ab ? 'Fechar' : 'Alterar'; if (ab) $('fNicho').focus(); });
    $('fNicho').addEventListener('change', nvAtualiza);
    $('ajTog').addEventListener('click', function () { var bx = $('ajBody'), ab = bx.style.display === 'none'; bx.style.display = ab ? '' : 'none'; this.setAttribute('aria-expanded', ab ? 'true' : 'false'); });
    ['fEmail', 'fV1', 'fV2', 'fV3', 'fVO1', 'fVO2', 'fVO3', 'cdVEntrada'].forEach(function (id) { $(id).addEventListener('input', nvAtualiza); });
    ['ck1', 'ck2', 'ck3'].forEach(function (id) { $(id).addEventListener('change', nvAtualiza); $('divC' + id.slice(1)).addEventListener('click', function () { setTimeout(nvAtualiza, 0); }); });
    // rodapé: modo do clique (antes do gerarLink de admin.html)
    $('btnGerar').addEventListener('click', function () { NV_MODO = window._nvModo || 'copiar'; window._nvModo = null; $('fEnviarGerar').checked = NV_MODO === 'email'; }, true);
    $('btnGerarEmail').addEventListener('click', function () { if (this.disabled) return; window._nvModo = 'email'; $('btnGerar').click(); });
    // ajustes
    document.querySelectorAll('#scrAjustes [data-aj]').forEach(function (b) { b.addEventListener('click', function () { window.AJ_AREA = b.getAttribute('data-aj'); ajRender(); }); });
    $('btnEncTodas').addEventListener('click', function () { encerrarTodas(); });
    nvAtualiza();
  });
  // depois de uma ação: se a proposta saiu da lista, volta para Propostas
  var hFinal0 = window.hFinal;
  window.hFinal = function (txt, erro) {
    return hFinal0(txt, erro).then(function () { if (TELA_DEPOIS) { var t = TELA_DEPOIS; TELA_DEPOIS = null; if (TELA === 'detalhe' && !propPorId(DET_ID)) irPara(t); } });
  };
  // a lista da Lixeira sempre é recarregada do servidor; se a proposta voltou, aparece de novo nas listas
})();
