// atendimento.js — inbox do WhatsApp em equipe (Isaque e Ju). Usado em /atendimento.html (app no celular) e na tela "Atendimento" do Studio OS.
// Fala só com /api/admin/wa (sessão). Tudo que vem do servidor entra na tela por textContent (nunca innerHTML com dados).
(function () {
  'use strict';
  var API = '/api/admin/wa', POLL_MS = 5000;
  var S = {root: null, admin: false, lista: [], agora: null, filtro: 'todas', busca: '', conv: null, msgs: [], convAgora: null, timer: null, ciclo: 0, usuario: null,
    modoNota: false, respostas: null, pend: [], ocupado: false, vivo: false};

  function E(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function B(c, x, f, rot) { var b = E('button', c, x); b.type = 'button'; if (f) b.addEventListener('click', f); if (rot) b.setAttribute('aria-label', rot); return b; }
  function limpa(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }
  function aviso(t, erro) { if (window.histMsg) return window.histMsg(t, erro); var a = document.getElementById('atToast'); if (!a) { a = E('div', 'ax-toast'); a.id = 'atToast'; a.setAttribute('role', 'status'); document.body.appendChild(a); } a.textContent = t; a.className = 'ax-toast on' + (erro ? ' er' : ''); clearTimeout(a._t); a._t = setTimeout(function () { a.className = 'ax-toast'; }, 3200); }
  var NOMES = {isaque: 'Isaque', ju: 'Ju'};
  var ORIGEM = {ia: 'IA', menu: 'Menu', regua: 'Cobrança', sistema: 'Sistema', proposta: 'Proposta', equipe_app: 'Equipe (celular)'};
  var STATUS = {sent: 'enviado', delivered: 'entregue', read: 'lido', failed: 'falhou', simulado: 'simulação', enviando: 'enviando…', interno: ''};
  var ESTADO = {ia: ['Com a IA', ''], equipe: ['Com a equipe', 'ok'], aguardando: ['Aguardando humano', 'er'], visitante: ['Visitante', 'al'], resolvida: ['Resolvida', '']};

  function tokenH() { var h = {'Content-Type': 'application/json'}; var t = (typeof TOKEN !== 'undefined' && TOKEN) || sessionStorage.getItem('sp_token') || ''; if (t) h.Authorization = 'Bearer ' + t; return h; }
  function api(acao, dados) {
    return fetch(API, {method: 'POST', credentials: 'same-origin', headers: tokenH(), body: JSON.stringify(Object.assign({acao: acao}, dados || {}))})
      .then(function (r) {
        if (r.status === 401) { if (S.admin && window.logout) logout(true); else telaLogin(); return {ok: false, erro: 'sessão expirada', sessao: true}; }
        if (r.status === 403) return {ok: false, erro: 'sem permissão'};
        return r.json().catch(function () { return {ok: false, erro: 'resposta inválida'}; });
      }).catch(function () { return {ok: false, erro: 'sem conexão', rede: true}; });
  }
  function hora(iso) {
    if (!iso) return '';
    var d = new Date(iso), h = new Date(), o = {timeZone: 'America/Sao_Paulo'};
    var dia = d.toLocaleDateString('pt-BR', o), hoje = h.toLocaleDateString('pt-BR', o), ontem = new Date(Date.now() - 864e5).toLocaleDateString('pt-BR', o);
    var hm = d.toLocaleTimeString('pt-BR', Object.assign({hour: '2-digit', minute: '2-digit'}, o));
    return dia === hoje ? hm : dia === ontem ? 'ontem' : dia.slice(0, 5);
  }
  function restante(iso) {
    var ms = Date.parse(iso || '') - Date.now(); if (!(ms > 0)) return null;
    var h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    return h ? h + ' h ' + (m < 10 ? '0' : '') + m + ' min' : m + ' min';
  }
  function iniciais(n) { var p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase(); }

  // ---------------- casca ----------------
  function montar(root, op) {
    op = op || {};
    if (S.root !== root || !root.querySelector('.ax-app')) {
      S.root = root; S.admin = !!op.admin; limpa(root);
      var app = E('div', 'ax-app'); root.appendChild(app);
      var L = E('div', 'ax-l'); L.id = 'atL'; app.appendChild(L);
      var R = E('div', 'ax-r'); R.id = 'atR'; app.appendChild(R);
      casca(L); vazioR();
    }
    S.vivo = true;
    var m = /c=([0-9a-f-]{36})/.exec(location.hash || '');
    carregar(true).then(function () { if (m) abrir(m[1]); });
    iniciarPoll();
  }
  function parar() { S.vivo = false; clearTimeout(S.timer); }
  function casca(L) {
    var hd = E('div', 'ax-hd');
    var t = E('div'); t.appendChild(E('h1', 'ax-tt', 'Atendimento')); var sub = E('span', 'ax-sub', ''); sub.id = 'atSub'; t.appendChild(sub); hd.appendChild(t);
    var ac = E('div', 'ax-hd-ac');
    ac.appendChild(B('ax-ib', '⋯', menuApp, 'Mais opções'));
    hd.appendChild(ac); L.appendChild(hd);
    var net = E('div', 'ax-net', 'Sem conexão. As mensagens vão quando a internet voltar.'); net.id = 'atNet'; net.setAttribute('role', 'status'); L.appendChild(net);
    var pb = E('div', 'ax-push'); pb.id = 'atPush'; L.appendChild(pb); bannerPush();
    var bu = E('input', 'ax-busca'); bu.type = 'search'; bu.placeholder = 'Buscar conversa'; bu.setAttribute('aria-label', 'Buscar conversa'); bu.addEventListener('input', function () { S.busca = bu.value.trim().toLowerCase(); lista(); }); L.appendChild(bu);
    var ch = E('div', 'ax-chips'); ch.setAttribute('role', 'group'); ch.setAttribute('aria-label', 'Filtro');
    [['todas', 'Todas'], ['nao_lidas', 'Não lidas'], ['humano', 'Precisam de humano'], ['comigo', 'Comigo'], ['visitantes', 'Visitantes']].forEach(function (x) {
      var b = B('ax-chip' + (S.filtro === x[0] ? ' on' : ''), null, function () { S.filtro = x[0]; ch.querySelectorAll('.ax-chip').forEach(function (y) { var on = y === b; y.classList.toggle('on', on); y.setAttribute('aria-pressed', on ? 'true' : 'false'); }); lista(); });
      b.appendChild(document.createTextNode(x[1])); var n = E('span', 'n', ''); n.setAttribute('data-n', x[0]); b.appendChild(n); b.setAttribute('aria-pressed', S.filtro === x[0] ? 'true' : 'false');
      ch.appendChild(b);
    });
    L.appendChild(ch);
    var ls = E('div', 'ax-lista'); ls.id = 'atLista'; ls.setAttribute('role', 'list'); L.appendChild(ls);
    for (var i = 0; i < 5; i++) { var sk = E('div', 'ax-row'); sk.appendChild(E('span', 'os-sk', '')); ls.appendChild(sk); }
    window.addEventListener('online', rede); window.addEventListener('offline', rede); rede();
  }
  function rede() { var n = document.getElementById('atNet'); if (n) n.classList.toggle('on', !navigator.onLine); if (navigator.onLine) reenviar(); }

  // ---------------- lista ----------------
  function carregar(tudo) {
    if (S.ocupado) return Promise.resolve();
    S.ocupado = true;
    return api('inbox', tudo || !S.agora ? {} : {desde: S.agora}).then(function (r) {
      S.ocupado = false;
      if (!r.ok) { if (!S.lista.length && !r.sessao) { var ls = document.getElementById('atLista'); if (ls) { limpa(ls); var e = E('div', 'ax-vazio'); e.appendChild(E('b', null, 'Não foi possível carregar as conversas.')); e.appendChild(document.createTextNode(r.erro || '')); e.appendChild(B('ax-btn', 'Tentar de novo', function () { carregar(true); })); ls.appendChild(e); } } return; }
      if (!Array.isArray(r.lista)) r.lista = [];
      S.agora = r.agora;
      if (r.parcial) { r.lista.forEach(function (c) { var i = idx(c.id); if (i > -1) S.lista[i] = c; else S.lista.push(c); }); }
      else S.lista = r.lista;
      S.lista.sort(function (a, b) { return String(b.ultima).localeCompare(String(a.ultima)); });
      lista(); badge();
      if (!S.usuario) api('eu').then(function (x) { if (x.ok) { S.usuario = x.usuario; lista(); } });
    });
  }
  function idx(id) { for (var i = 0; i < S.lista.length; i++) if (S.lista[i].id === id) return i; return -1; }
  function passa(c, f) {
    if (f === 'nao_lidas') return c.nao_lidas > 0;
    if (f === 'humano') return c.estado === 'aguardando' || c.estado === 'equipe';
    if (f === 'comigo') return !!S.usuario && c.atendente === S.usuario;
    if (f === 'visitantes') return c.estado === 'visitante';
    return c.estado !== 'resolvida' || c.nao_lidas > 0;
  }
  function lista() {
    var ls = document.getElementById('atLista'); if (!ls) return; limpa(ls);
    var L = S.lista.filter(function (c) { return passa(c, S.filtro) && (!S.busca || (c.nome + ' ' + c.cliente + ' ' + c.telefone_fim).toLowerCase().indexOf(S.busca) > -1); });
    L.sort(function (a, b) { return (b.nao_lidas > 0) - (a.nao_lidas > 0) || String(b.ultima).localeCompare(String(a.ultima)); });
    ['todas', 'nao_lidas', 'humano', 'comigo', 'visitantes'].forEach(function (f) { var n = S.root && S.root.querySelector('[data-n="' + f + '"]'); if (n) { var k = S.lista.filter(function (c) { return passa(c, f); }).length; n.textContent = f === 'todas' || !k ? '' : String(k); } });
    var sub = document.getElementById('atSub'); if (sub) { var nl = S.lista.reduce(function (a, c) { return a + (c.nao_lidas || 0); }, 0); sub.textContent = nl ? nl + ' não lida' + (nl > 1 ? 's' : '') : 'Tudo em dia'; }
    if (!L.length) { var v = E('div', 'ax-vazio'); v.appendChild(E('b', null, S.lista.length ? 'Nada neste filtro.' : 'Nenhuma conversa ainda.')); v.appendChild(document.createTextNode(S.lista.length ? 'Troque o filtro ou a busca.' : 'Quando alguém mandar mensagem para o WhatsApp de suporte, aparece aqui.')); ls.appendChild(v); return; }
    L.forEach(function (c) {
      var r = B('ax-row' + (S.conv && S.conv.id === c.id ? ' sel' : '') + (c.nao_lidas ? ' nl' : ''), null, function () { abrir(c.id); });
      r.setAttribute('role', 'listitem');
      r.appendChild(E('span', 'ax-av', iniciais(c.nome || c.cliente || c.telefone_fim)));
      var g = E('span', 'ax-g');
      var l1 = E('span', 'ax-l1'); l1.appendChild(E('b', null, c.nome || 'Contato •••' + c.telefone_fim)); l1.appendChild(E('time', null, hora(c.ultima))); g.appendChild(l1);
      g.appendChild(E('span', 'ax-l2', (c.cliente ? c.cliente + ' · ' : '') + (c.previa_de && c.previa_de !== 'cliente' ? (ORIGEM[c.previa_de] || 'Equipe') + ': ' : '') + (c.previa || '')));
      var l3 = E('span', 'ax-l3'); var es = ESTADO[c.estado] || ESTADO.ia; l3.appendChild(E('span', 'os-b ' + es[1], es[0]));
      if (c.atendente) l3.appendChild(E('span', 'ax-dono', NOMES[c.atendente] || c.atendente));
      if (c.nao_lidas) { var n = E('span', 'ax-nl', String(c.nao_lidas)); n.setAttribute('aria-label', c.nao_lidas + ' não lidas'); l3.appendChild(n); }
      g.appendChild(l3); r.appendChild(g); ls.appendChild(r);
    });
  }
  function badge() {
    var n = S.lista.reduce(function (a, c) { return a + (c.nao_lidas || 0); }, 0);
    var b = document.querySelector('#navApp [data-nav="atend"] .at-badge'); if (b) { b.textContent = n || ''; b.style.display = n ? '' : 'none'; }
    if (!S.admin) document.title = (n ? '(' + n + ') ' : '') + 'Atendimento Studio Pulga';
    try { if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n); else navigator.clearAppBadge(); } } catch (e) {}
  }

  // ---------------- conversa ----------------
  function vazioR() { var R = document.getElementById('atR'); if (!R) return; limpa(R); var v = E('div', 'ax-vazio ax-vr'); v.appendChild(E('b', null, 'Escolha uma conversa')); v.appendChild(document.createTextNode('As mensagens aparecem aqui.')); R.appendChild(v); S.root.classList.remove('ax-aberta'); }
  function abrir(id) {
    S.conv = {id: id}; S.msgs = []; S.convAgora = null; S.modoNota = false;
    S.root.classList.add('ax-aberta');
    var R = limpa(document.getElementById('atR'));
    var sk = E('div', 'ax-th'); for (var i = 0; i < 4; i++) sk.appendChild(E('span', 'os-sk', '')); R.appendChild(sk);
    try { history.replaceState(null, '', location.pathname + location.search + (S.admin ? '#atend' : '#c=' + id)); } catch (e) {}
    return api('conversa', {id: id}).then(function (r) {
      if (!r.ok) { limpa(R); R.appendChild(E('div', 'ax-vazio', 'Não foi possível abrir: ' + (r.erro || ''))); return; }
      S.conv = r.conversa; S.msgs = r.lista; S.convAgora = r.agora;
      var i = idx(id); if (i > -1) { S.lista[i].nao_lidas = 0; lista(); badge(); }
      thread();
    });
  }
  function voltar() { S.conv = null; vazioR(); lista(); try { history.replaceState(null, '', location.pathname + location.search + (S.admin ? '#atend' : '')); } catch (e) {} }
  function thread() {
    var R = limpa(document.getElementById('atR')), c = S.conv;
    var hd = E('div', 'ax-thd');
    hd.appendChild(B('ax-ib ax-volta', '‹', voltar, 'Voltar para a lista'));
    var who = E('div', 'ax-who'); who.appendChild(E('b', null, c.nome || 'Contato'));
    var m = E('span', null, ''); var partes = [];
    if (c.cliente) partes.push(c.cliente.nome);
    partes.push(c.perfil === 'responsavel' ? 'Responsável' : c.perfil === 'equipe' ? 'Equipe do cliente' : 'Visitante');
    m.textContent = partes.join(' · '); who.appendChild(m);
    var es = ESTADO[c.estado] || ESTADO.ia, bs = E('span', 'ax-who-b'); bs.appendChild(E('span', 'os-b ' + es[1], es[0] + (c.atendente ? ' · ' + (NOMES[c.atendente] || c.atendente) : '')));
    bs.appendChild(E('span', 'os-b ' + (c.verificado ? 'ok' : ''), c.verificado ? 'Verificado' : 'Não verificado')); who.appendChild(bs);
    hd.appendChild(who);
    var ac = E('div', 'ax-thd-ac');
    if (c.cliente) ac.appendChild(B('ax-btn sm', 'Ficha', function () { if (window.osFicha) osFicha(c.cliente.id); else location.href = '/admin.html#ficha=' + c.cliente.id; }));
    if (c.modo !== 'humano' || !c.atendente || (S.usuario && c.atendente !== S.usuario)) ac.appendChild(B('ax-btn sm pri', c.atendente && c.modo === 'humano' ? 'Assumir (está com ' + (NOMES[c.atendente] || c.atendente) + ')' : 'Assumir', function () { acao('assumir'); }));
    if (c.modo === 'humano') ac.appendChild(B('ax-btn sm', 'Devolver p/ IA', function () { acao('devolver'); }));
    if (c.estado !== 'resolvida') ac.appendChild(B('ax-btn sm', 'Resolver', function () { acao('resolver'); }));
    hd.appendChild(ac); R.appendChild(hd);
    var th = E('div', 'ax-th'); th.id = 'atTh'; th.setAttribute('role', 'log'); th.setAttribute('aria-live', 'polite'); R.appendChild(th);
    S.msgs.forEach(function (x) { th.appendChild(bolha(x)); });
    S.pend.filter(function (p) { return p.conv === c.id; }).forEach(function (p) { th.appendChild(bolhaPend(p)); });
    R.appendChild(compositor());
    th.scrollTop = th.scrollHeight;
  }
  function bolha(x) {
    if (x.interno) {
      var n = E('div', 'ax-nota'); n.appendChild(E('span', 'ax-nota-r', 'Comentário interno · ' + (NOMES[x.autor] || 'equipe') + ' · ' + hora(x.em)));
      n.appendChild(E('p', null, x.texto)); return n;
    }
    var out = x.direcao === 'out', b = E('div', 'ax-b ' + (out ? 'out' : 'in') + (x.origem === 'ia' ? ' ia' : '') + (x.status === 'failed' ? ' err' : ''));
    if (out) b.appendChild(E('span', 'ax-b-de', x.autor ? NOMES[x.autor] || x.autor : (ORIGEM[x.origem] || 'Equipe')));
    b.appendChild(E('p', null, x.texto || '[' + x.tipo + ']'));
    var meta = E('span', 'ax-b-m', hora(x.em) + (out ? ' · ' + (STATUS[x.status] || x.status || '') : '') + (x.simulado && x.status !== 'simulado' ? ' (simulação)' : ''));
    b.appendChild(meta);
    if (x.status === 'failed' && x.erro) b.appendChild(E('span', 'ax-b-e', 'Motivo: ' + x.erro));
    return b;
  }
  function bolhaPend(p) { var b = E('div', 'ax-b out pend'); b.appendChild(E('span', 'ax-b-de', 'Na fila')); b.appendChild(E('p', null, p.texto)); var m = E('span', 'ax-b-m', p.erro ? 'não enviada · ' : 'enviando…'); if (p.erro) m.appendChild(B('ax-lnk', 'tentar de novo', reenviar)); b.appendChild(m); return b; }
  function acao(tipo) {
    var id = S.conv.id;
    api(tipo, {id: id}).then(function (r) {
      if (!r.ok) return aviso(r.erro || 'erro', true);
      aviso(tipo === 'assumir' ? 'Você assumiu: a IA fica em pausa.' : tipo === 'devolver' ? 'Conversa devolvida para a IA.' : 'Conversa resolvida.');
      if (tipo === 'resolver') { voltar(); carregar(true); } else abrir(id).then(function () { carregar(); });
    });
  }

  // ---------------- caixa de texto ----------------
  function compositor() {
    var c = S.conv, w = E('div', 'ax-comp');
    var rest = restante(c.janela_ate);
    var info = E('div', 'ax-jan'); w.appendChild(info);
    if (!rest && !S.modoNota) {
      info.className = 'ax-jan fech';
      info.appendChild(E('b', null, 'A janela de 24h fechou.'));
      info.appendChild(document.createTextNode(' O WhatsApp só deixa enviar um modelo aprovado. Mande o "retomar conversa" e, quando o cliente responder, a conversa reabre.'));
      var f = E('div', 'ax-ret');
      var nm = E('input', 'ax-in'); nm.placeholder = 'Nome (ex.: Bia)'; nm.value = String(c.nome || '').split(' ')[0]; nm.setAttribute('aria-label', 'Nome do cliente');
      var as = E('input', 'ax-in'); as.placeholder = 'Assunto (ex.: o seu material)'; as.setAttribute('aria-label', 'Assunto');
      f.appendChild(nm); f.appendChild(as);
      f.appendChild(B('ax-btn pri', 'Enviar "retomar conversa"', function (ev) {
        var b = ev.currentTarget; b.disabled = true;
        api('retomar', {id: c.id, nome: nm.value, assunto: as.value}).then(function (r) { b.disabled = false; if (!r.ok) return aviso(r.erro || 'erro', true); aviso(r.simulado ? 'Registrado (modo simulação).' : 'Modelo enviado.'); abrir(c.id); });
      }));
      w.appendChild(f);
      w.appendChild(B('ax-lnk', 'Escrever comentário interno', function () { S.modoNota = true; thread(); }));
      return w;
    }
    info.textContent = S.modoNota ? 'Comentário interno: só a equipe vê. Não vai para o cliente.' : 'Janela aberta: ' + rest + ' para responder com texto livre.';
    if (S.modoNota) info.className = 'ax-jan nota';
    var bar = E('div', 'ax-cbar');
    bar.appendChild(B('ax-chipm' + (S.modoNota ? '' : ' on'), 'Mensagem', function () { S.modoNota = false; thread(); }));
    bar.appendChild(B('ax-chipm' + (S.modoNota ? ' on' : ''), 'Comentário interno', function () { S.modoNota = true; thread(); }));
    if (!S.modoNota) bar.appendChild(B('ax-chipm', 'Respostas rápidas', respostasRapidas));
    w.appendChild(bar);
    var row = E('div', 'ax-crow');
    var ta = E('textarea', 'ax-ta'); ta.id = 'atTa'; ta.rows = 1; ta.placeholder = S.modoNota ? 'Escreva um comentário para a equipe' : 'Escreva uma mensagem'; ta.setAttribute('aria-label', ta.placeholder); ta.maxLength = S.modoNota ? 2000 : 4000;
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; });
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); envia(); } });
    var bt = B('ax-send' + (S.modoNota ? ' nota' : ''), null, envia, S.modoNota ? 'Salvar comentário' : 'Enviar');
    bt.appendChild(E('span', null, S.modoNota ? 'Salvar' : 'Enviar'));
    row.appendChild(ta); row.appendChild(bt); w.appendChild(row);
    function envia() {
      var t = ta.value.trim(); if (!t) return ta.focus();
      if (S.modoNota) {
        bt.disabled = true;
        api('comentario', {id: c.id, texto: t}).then(function (r) { bt.disabled = false; if (!r.ok) return aviso(r.erro || 'erro', true); ta.value = ''; novidades(); });
        return;
      }
      var p = {conv: c.id, texto: t, id: Date.now()}; S.pend.push(p); ta.value = ''; ta.style.height = '';
      var th = document.getElementById('atTh'); if (th) { th.appendChild(bolhaPend(p)); th.scrollTop = th.scrollHeight; }
      mandar(p);
    }
    return w;
  }
  function mandar(p) {
    p.erro = null;
    return api('enviar', {id: p.conv, texto: p.texto}).then(function (r) {
      if (r.ok) { S.pend = S.pend.filter(function (x) { return x !== p; }); if (r.simulado) aviso('Registrado (modo simulação: não saiu para o cliente).'); if (S.conv && S.conv.id === p.conv) novidades(true); return; }
      if (r.rede) { p.erro = 'sem conexão'; if (S.conv && S.conv.id === p.conv) thread(); return; }
      S.pend = S.pend.filter(function (x) { return x !== p; }); aviso(r.erro || 'não foi possível enviar', true);
      if (r.janela === false && S.conv) abrir(S.conv.id); else if (S.conv) thread();
    });
  }
  function reenviar() { S.pend.filter(function (p) { return p.erro; }).forEach(mandar); }
  function respostasRapidas() {
    var abre = function (L) {
      var box = E('div', 'ax-rr'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Respostas rápidas');
      var hd = E('div', 'ax-rr-hd'); hd.appendChild(E('b', null, 'Respostas rápidas')); hd.appendChild(B('ax-lnk', 'Editar', function () { fecha(); editarRespostas(L); })); hd.appendChild(B('ax-ib', '×', fecha, 'Fechar')); box.appendChild(hd);
      L.forEach(function (x) { var b = B('ax-rr-i', null, function () { var ta = document.getElementById('atTa'); if (ta) { ta.value = (ta.value ? ta.value + ' ' : '') + x.texto; ta.dispatchEvent(new Event('input')); ta.focus(); } fecha(); }); b.appendChild(E('b', null, x.titulo)); b.appendChild(E('span', null, x.texto)); box.appendChild(b); });
      var fundo = E('div', 'ax-fundo'); fundo.addEventListener('click', fecha);
      document.body.appendChild(fundo); document.body.appendChild(box);
      var esc = function (ev) { if (ev.key === 'Escape') fecha(); }; document.addEventListener('keydown', esc);
      function fecha() { box.remove(); fundo.remove(); document.removeEventListener('keydown', esc); }
      var f0 = box.querySelector('.ax-rr-i'); if (f0) f0.focus();
    };
    if (S.respostas) return abre(S.respostas);
    api('respostas').then(function (r) { if (r.ok) { S.respostas = r.lista; abre(r.lista); } else aviso(r.erro || 'erro', true); });
  }
  function editarRespostas(L) {
    var box = E('div', 'ax-rr ax-rr-ed'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Editar respostas rápidas');
    var hd = E('div', 'ax-rr-hd'); hd.appendChild(E('b', null, 'Editar respostas rápidas')); box.appendChild(hd);
    var lst = E('div'); box.appendChild(lst);
    var linhas = [];
    function linha(x) { var d = E('div', 'ax-rr-l'); var t = E('input', 'ax-in'); t.value = x.titulo || ''; t.placeholder = 'Título'; t.maxLength = 40; var v = E('textarea', 'ax-in'); v.value = x.texto || ''; v.placeholder = 'Texto'; v.rows = 2; v.maxLength = 1000; d.appendChild(t); d.appendChild(v); d.appendChild(B('ax-lnk', 'remover', function () { d.remove(); linhas = linhas.filter(function (y) { return y.d !== d; }); })); lst.appendChild(d); linhas.push({d: d, t: t, v: v}); }
    L.forEach(linha);
    var ac = E('div', 'ax-rr-ac');
    ac.appendChild(B('ax-btn', '+ Nova', function () { linha({}); }));
    ac.appendChild(B('ax-btn', 'Cancelar', fecha));
    ac.appendChild(B('ax-btn pri', 'Salvar', function () {
      var nv = linhas.map(function (y) { return {titulo: y.t.value.trim(), texto: y.v.value.trim()}; }).filter(function (y) { return y.titulo && y.texto; });
      api('respostas_salvar', {lista: nv}).then(function (r) { if (!r.ok) return aviso(r.erro || 'erro', true); S.respostas = r.lista; aviso('Respostas salvas.'); fecha(); });
    }));
    box.appendChild(ac);
    var fundo = E('div', 'ax-fundo'); document.body.appendChild(fundo); document.body.appendChild(box);
    function fecha() { box.remove(); fundo.remove(); }
  }

  // ---------------- atualização (5 s só com o app aberto) ----------------
  function iniciarPoll() {
    clearTimeout(S.timer);
    S.timer = setTimeout(function tick() {
      if (!S.vivo) return;
      if (document.visibilityState === 'visible' && navigator.onLine) { S.ciclo++; carregar(S.ciclo % 12 === 0); if (S.conv && S.conv.id) novidades(S.ciclo % 6 === 0); }
      S.timer = setTimeout(tick, POLL_MS);
    }, POLL_MS);
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.vivo) { carregar(); if (S.conv && S.conv.id) novidades(true); } });
  function novidades(tudo) {
    var id = S.conv.id;
    return api('conversa', tudo || !S.convAgora ? {id: id} : {id: id, desde: S.convAgora}).then(function (r) {
      if (!r.ok || !S.conv || S.conv.id !== id) return;
      var mudouCabecalho = JSON.stringify([S.conv.estado, S.conv.atendente, S.conv.modo, !!restante(S.conv.janela_ate)]) !== JSON.stringify([r.conversa.estado, r.conversa.atendente, r.conversa.modo, !!restante(r.conversa.janela_ate)]);
      S.conv = r.conversa; S.convAgora = r.agora;
      var novas = 0;
      if (tudo) { novas = r.lista.length !== S.msgs.length || JSON.stringify(r.lista.map(function (x) { return x.status; })) !== JSON.stringify(S.msgs.map(function (x) { return x.status; })); S.msgs = r.lista; }
      else r.lista.forEach(function (x) { if (!S.msgs.some(function (y) { return y.id === x.id; })) { S.msgs.push(x); novas++; } });
      if (mudouCabecalho) return thread();
      if (novas) {
        var th = document.getElementById('atTh'); if (!th) return;
        var noFim = th.scrollHeight - th.scrollTop - th.clientHeight < 80;
        var ta = document.getElementById('atTa'), rasc = ta ? ta.value : '', foco = document.activeElement === ta;
        limpa(th); S.msgs.forEach(function (x) { th.appendChild(bolha(x)); }); S.pend.filter(function (p) { return p.conv === id; }).forEach(function (p) { th.appendChild(bolhaPend(p)); });
        if (ta) { ta.value = rasc; if (foco) ta.focus(); }
        if (noFim) th.scrollTop = th.scrollHeight;
      }
    });
  }

  // ---------------- notificações (Web Push) ----------------
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function bannerPush() {
    var b = document.getElementById('atPush'); if (!b) return; limpa(b); b.className = 'ax-push';
    if (S.admin) return;   // no admin do computador não há push: o app do celular é que notifica
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      if (ios() && !standalone()) { b.className = 'ax-push on'; b.appendChild(E('b', null, 'Notificações no iPhone')); b.appendChild(E('span', null, 'Toque em Compartilhar › "Adicionar à Tela de Início" e abra o app por lá. Depois ative as notificações aqui.')); }
      return;
    }
    if (window.Notification && Notification.permission === 'granted') { navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) { if (!s) mostrar(); else salvarInscricao(s); }).catch(function () {}); return; }
    if (window.Notification && Notification.permission === 'denied') { b.className = 'ax-push on'; b.appendChild(E('span', null, 'As notificações estão bloqueadas neste aparelho. Libere nas configurações do navegador.')); return; }
    mostrar();
    function mostrar() {
      b.className = 'ax-push on'; limpa(b);
      b.appendChild(E('span', null, ios() && !standalone() ? 'No iPhone, as notificações funcionam com o app na Tela de Início (Compartilhar › Adicionar à Tela de Início).' : 'Receba um aviso quando chegar mensagem para a equipe.'));
      if (!(ios() && !standalone())) b.appendChild(B('ax-btn pri sm', 'Ativar notificações neste celular', ativarPush));
    }
  }
  function b64(s) { var p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')), o = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) o[i] = r.charCodeAt(i); return o; }
  function ativarPush() {
    api('push_chave').then(function (k) {
      if (!k.ok || !k.configurado) return aviso('As notificações ainda não foram configuradas no servidor (faltam as chaves VAPID).', true);
      if (!k.sql) return aviso('Falta rodar o SQL do Studio OS no Supabase.', true);
      return Notification.requestPermission().then(function (p) {
        if (p !== 'granted') return aviso('Permissão negada. Libere nas configurações do aparelho.', true);
        return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64(k.chave)}); })
          .then(function (s) { return salvarInscricao(s).then(function (r) { if (r.ok) { aviso('Notificações ativadas neste celular.'); api('push_teste'); bannerPush(); } else aviso(r.erro || 'erro', true); }); });
      });
    }).catch(function () { aviso('Não foi possível ativar as notificações.', true); });
  }
  function salvarInscricao(s) { var j = s.toJSON ? s.toJSON() : s; return api('push_inscrever', {inscricao: {endpoint: j.endpoint, keys: j.keys}, aparelho: (ios() ? 'iPhone' : /android/i.test(navigator.userAgent) ? 'Android' : 'Computador')}); }
  function menuApp() {
    var box = E('div', 'ax-rr'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Opções');
    var hd = E('div', 'ax-rr-hd'); hd.appendChild(E('b', null, S.usuario ? 'Conectado como ' + (NOMES[S.usuario] || S.usuario) : 'Opções')); hd.appendChild(B('ax-ib', '×', fecha, 'Fechar')); box.appendChild(hd);
    var it = function (t, f) { var b = B('ax-rr-i', null, function () { fecha(); f(); }); b.appendChild(E('b', null, t)); box.appendChild(b); };
    it('Atualizar agora', function () { carregar(true); });
    it('Editar respostas rápidas', function () { api('respostas').then(function (r) { if (r.ok) editarRespostas(r.lista); }); });
    if (!S.admin) {
      it('Ativar notificações neste celular', ativarPush);
      it('Testar notificação', function () { api('push_teste').then(function (r) { aviso(r.ok ? 'Enviada (' + r.enviados + ' aparelho(s)).' : r.erro, !r.ok); }); });
      it('Abrir o Studio OS', function () { location.href = '/admin.html'; });
      it('Sair deste aparelho', sair);
    }
    var fundo = E('div', 'ax-fundo'); fundo.addEventListener('click', fecha); document.body.appendChild(fundo); document.body.appendChild(box);
    function fecha() { box.remove(); fundo.remove(); }
  }
  function sair() {
    var h = tokenH();
    fetch('/api/admin', {method: 'POST', credentials: 'same-origin', headers: h, body: '{"acao":"sair"}'}).catch(function () {}).then(function () {
      sessionStorage.removeItem('sp_token');
      navigator.serviceWorker && navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager && reg.pushManager.getSubscription(); }).then(function (s) { if (s) { api('push_sair', {endpoint: s.endpoint}); s.unsubscribe(); } }).catch(function () {});
      telaLogin();
    });
  }

  // ---------------- login (só no app do celular) ----------------
  function telaLogin() {
    if (S.admin || !S.root) return;
    parar();
    var root = limpa(S.root); root.classList.remove('ax-aberta');
    var f = E('form', 'ax-login'); f.setAttribute('aria-label', 'Entrar');
    f.appendChild(E('span', 'ax-login-mk', 'studio pulga'));
    f.appendChild(E('h1', null, 'Atendimento'));
    var l = E('label', null, 'Senha'); l.htmlFor = 'atSenha'; f.appendChild(l);
    var i = E('input', 'ax-in'); i.type = 'password'; i.id = 'atSenha'; i.autocomplete = 'current-password'; i.required = true; f.appendChild(i);
    var ck = E('label', 'ax-manter'); var c = E('input'); c.type = 'checkbox'; c.checked = true; ck.appendChild(c); ck.appendChild(E('span', null, 'Manter conectado neste celular (30 dias)')); f.appendChild(ck);
    var bt = E('button', 'ax-btn pri', 'Entrar'); bt.type = 'submit'; f.appendChild(bt);
    var er = E('div', 'ax-login-e'); er.setAttribute('role', 'alert'); f.appendChild(er);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); bt.disabled = true; er.textContent = '';
      fetch('/api/admin-login', {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({senha: i.value, manter: c.checked})})
        .then(function (r) { return r.json(); }).then(function (r) {
          bt.disabled = false; i.value = '';
          if (!r.ok) { er.textContent = r.erro || 'Senha incorreta.'; return; }
          if (r.token) sessionStorage.setItem('sp_token', r.token); else sessionStorage.removeItem('sp_token');
          S.usuario = r.usuario; S.lista = []; S.agora = null; S.root = null; montar(root, {});
        }).catch(function () { bt.disabled = false; er.textContent = 'Sem conexão.'; });
    });
    root.appendChild(f); i.focus();
  }

  window.atApp = {montar: montar, parar: parar, abrir: function (id) { if (S.root) abrir(id); }};
})();
