// admin-atendimento.js — aba "WhatsApp" do admin: conversas, clientes e números, cobrança (régua), senhas do onboarding e ajustes.
// Fala só com /api/admin/wa (exige sessão). Dados do servidor entram na tela SOMENTE por textContent (nada de innerHTML com dados).
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SUB = 'conversas', CONV = null, CONV_F = 'todas', CLI = {lista: [], contatos: []}, SENHAS = [], CFG = null, POLL = null;

  var css = document.createElement('style');
  css.textContent = [
    '#scrAtend{max-width:980px;}',
    '.at-sub{display:flex;gap:8px;overflow-x:auto;margin:14px 0 16px;scrollbar-width:none;}',
    '.at-sub::-webkit-scrollbar{display:none;}',
    '.at-banner{border-radius:14px;padding:12px 14px;font-size:14px;margin-bottom:12px;line-height:1.45;}',
    '.at-banner.sim{background:var(--warnbg);color:var(--warn);}',
    '.at-banner.ok{background:var(--okbg);color:var(--ok);}',
    '.at-row{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line2);cursor:pointer;min-height:56px;background:none;border-left:0;border-right:0;border-top:0;width:100%;text-align:left;}',
    '.at-row:last-child{border-bottom:none;}',
    '.at-row select.inp{width:auto;min-height:40px;font-size:13.5px;padding:6px 8px;flex-shrink:0;}',
    '@media(max-width:520px){.at-row{flex-wrap:wrap;}.at-row .at-grow{flex-basis:100%;}}',
    '.at-row .at-nm{font-weight:600;font-size:15px;}',
    '.at-row .at-sm{font-size:12.5px;color:var(--tx2);}',
    '.at-row .at-grow{flex:1;min-width:0;}',
    '.at-tag{font-size:11.5px;font-weight:600;padding:3px 8px;border-radius:999px;background:var(--soft);color:var(--br);white-space:nowrap;}',
    '.at-tag.h{background:var(--warnbg);color:var(--warn);}',
    '.at-tag.r{background:var(--errbg);color:var(--err);}',
    '.at-tag.g{background:var(--okbg);color:var(--ok);}',
    '.at-badge{min-width:22px;height:22px;border-radius:11px;background:var(--br);color:#FFF8F1;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;padding:0 6px;}',
    '.at-th{display:flex;flex-direction:column;gap:8px;padding:14px;background:#EFE3D6;border-radius:var(--r);max-height:60vh;overflow-y:auto;}',
    '.at-b{max-width:82%;padding:9px 12px;border-radius:14px;font-size:14.5px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;}',
    '.at-b.in{align-self:flex-start;background:#fff;}',
    '.at-b.out{align-self:flex-end;background:#F7E6DA;}',
    '.at-b .at-meta{display:block;font-size:11px;color:var(--tx2);margin-top:4px;}',
    '.at-bar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;}',
    '.at-bar .chip{cursor:pointer;}',
    '.at-grid{display:grid;grid-template-columns:1fr;gap:10px;}',
    '@media(min-width:700px){.at-grid{grid-template-columns:1fr 1fr;}}',
    '.at-f label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--tx2);}',
    '.at-env{display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:13.5px;}',
    '.at-mini{min-height:40px;padding:6px 12px;border-radius:12px;border:1px solid var(--line);background:var(--card);font-size:13.5px;font-weight:600;cursor:pointer;}',
    '.at-mini.pri{background:var(--br);color:#FFF8F1;border-color:var(--br);}',
    '.at-mini.dan{color:var(--err);}',
    '.at-cob td,.at-cob th{padding:8px 6px;border-bottom:1px solid var(--line2);font-size:13.5px;text-align:left;vertical-align:top;}',
    '.at-cob{width:100%;border-collapse:collapse;}',
    '.at-vazio{padding:20px;text-align:center;color:var(--tx2);font-size:14px;}'
  ].join('\n');
  document.head.appendChild(css);

  function E(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function limpa(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function btn(cls, txt, f) { var b = E('button', cls, txt); b.type = 'button'; if (f) b.addEventListener('click', f); return b; }
  function msg(t, erro) { if (window.histMsg) window.histMsg(t, erro); else alert(t); }
  function quando(iso) {
    if (!iso) return '';
    var d = new Date(iso), h = new Date();
    var o = {timeZone: 'America/Sao_Paulo'};
    var dia = d.toLocaleDateString('pt-BR', o), hoje = h.toLocaleDateString('pt-BR', o);
    return (dia === hoje ? 'hoje' : dia.slice(0, 5)) + ' ' + d.toLocaleTimeString('pt-BR', Object.assign({hour: '2-digit', minute: '2-digit'}, o));
  }
  function fmtTel(t) { var d = String(t || '').replace(/^55/, ''); return d.length >= 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, -4) + '-' + d.slice(-4) : t; }

  function api(acao, dados) {
    var h = {'Content-Type': 'application/json'};
    if (typeof TOKEN !== 'undefined' && TOKEN) h.Authorization = 'Bearer ' + TOKEN;
    return fetch('/api/admin/wa', {method: 'POST', credentials: 'same-origin', headers: h, body: JSON.stringify(Object.assign({acao: acao}, dados || {}))})
      .then(function (r) {
        if (r.status === 401) { if (window.logout) logout(true); throw new Error('sessao'); }
        return r.json().catch(function () { return {ok: false, erro: 'resposta inválida (HTTP ' + r.status + ')'}; });
      }).catch(function (e) { return {ok: false, erro: e && e.message === 'sessao' ? 'sessão expirada' : 'sem conexão'}; });
  }

  // ---------------- casca ----------------
  function casca() {
    var s = $('scrAtend'); limpa(s);
    var hd = E('div', 'scr-hd'); var d = E('div'); d.appendChild(E('span', 'mk', '// atendimento · whatsapp'));
    var h1 = E('h1', 'tt'); h1.appendChild(document.createTextNode('whats')); h1.appendChild(E('strong', null, 'app')); d.appendChild(h1); hd.appendChild(d); s.appendChild(hd);
    s.appendChild(E('div', null)).id = 'atBanner';
    var sub = E('div', 'at-sub chips');
    [['conversas', 'Conversas'], ['clientes', 'Clientes e números'], ['cobranca', 'Cobrança'], ['senhas', 'Senhas onboarding'], ['ajustes', 'Ajustes']].forEach(function (x) {
      var b = btn('chip' + (SUB === x[0] ? ' on' : ''), x[1], function () { SUB = x[0]; CONV = null; casca(); });
      sub.appendChild(b);
    });
    s.appendChild(sub);
    var c = E('div'); c.id = 'atCorpo'; s.appendChild(c);
    painel();
    ({conversas: conversas, clientes: clientes, cobranca: cobranca, senhas: senhas, ajustes: ajustes})[SUB]();
  }
  function painel() {
    api('painel').then(function (r) {
      var b = $('atBanner'); if (!b) return; limpa(b);
      if (!r.ok) { b.appendChild(E('div', 'at-banner sim', 'Não foi possível ler o status: ' + (r.erro || ''))); return; }
      var faltam = Object.keys(r.env).filter(function (k) { return !r.env[k] && k !== 'WHATSAPP_ATIVO' && k !== 'IA_ATIVA'; });
      var t = r.modo === 'envio' ? 'Envio REAL ligado.' : 'Modo simulação: nada sai para clientes (só o número de teste recebe).';
      t += ' IA: ' + (r.ia.ligada ? 'ligada' : 'desligada') + ' · gasto do mês US$ ' + r.ia.gasto_usd.toFixed(2) + ' de ' + r.ia.limite_usd + '.';
      if (r.alertas) t += ' Alertas abertos: ' + r.alertas + '.';
      if (faltam.length) t += ' Falta configurar: ' + faltam.join(', ') + '.';
      b.appendChild(E('div', 'at-banner ' + (r.modo === 'envio' ? 'ok' : 'sim'), t));
      var nb = document.querySelector('#navApp [data-nav="atend"] .at-badge');
      if (nb) { nb.textContent = r.nao_lidas || ''; nb.style.display = r.nao_lidas ? '' : 'none'; }
    });
  }

  // ---------------- conversas ----------------
  function conversas() {
    var c = limpa($('atCorpo'));
    if (CONV) return thread(CONV);
    var al = E('div'); c.appendChild(al);
    api('alertas').then(function (r) {
      if (!r.ok || !r.lista.length) return;
      var hd = E('div', 'sec-hd'); hd.appendChild(E('h2', 'sec', 'Alertas')); hd.appendChild(E('span', null, String(r.lista.length))); al.appendChild(hd);
      var L = E('div', 'lst'); al.appendChild(L);
      r.lista.slice(0, 15).forEach(function (a) {
        var row = E('div', 'at-row'); row.style.cursor = 'default';
        var g = E('div', 'at-grow'); g.appendChild(E('div', 'at-nm', a.resumo || a.tipo)); g.appendChild(E('div', 'at-sm', (a.cliente ? a.cliente + ' · ' : '') + quando(a.created_at)));
        row.appendChild(E('span', 'at-tag ' + (/bloqueio|pausa|d10|d60|ia_falhou|limite/.test(a.tipo) ? 'r' : 'h'), a.tipo));
        row.appendChild(g);
        row.appendChild(btn('at-mini', 'resolver', function () { api('alerta_resolver', {id: a.id}).then(function () { conversas(); painel(); }); }));
        L.appendChild(row);
      });
    });
    var bar = E('div', 'at-bar chips');
    [['todas', 'Todas'], ['nao_lidas', 'Não lidas'], ['humano', 'Com a equipe'], ['ia', 'Com a IA'], ['visitantes', 'Visitantes']].forEach(function (x) {
      bar.appendChild(btn('chip' + (CONV_F === x[0] ? ' on' : ''), x[1], function () { CONV_F = x[0]; conversas(); }));
    });
    c.appendChild(bar);
    var L = E('div', 'lst'); L.appendChild(E('div', 'loading', 'Carregando…')); c.appendChild(L);
    api('conversas', {filtro: CONV_F}).then(function (r) {
      limpa(L);
      if (!r.ok) { L.appendChild(E('div', 'at-vazio', r.erro || 'erro')); return; }
      if (!r.lista.length) { L.appendChild(E('div', 'at-vazio', 'Nenhuma conversa ainda.')); return; }
      r.lista.forEach(function (v) {
        var row = btn('at-row', null, function () { CONV = v.id; conversas(); });
        var g = E('div', 'at-grow');
        g.appendChild(E('div', 'at-nm', (v.nome || fmtTel(v.telefone)) + (v.cliente ? ' · ' + v.cliente : '')));
        g.appendChild(E('div', 'at-sm', fmtTel(v.telefone) + ' · ' + quando(v.ultima) + (v.perfil ? ' · ' + v.perfil : v.cliente ? '' : ' · visitante')));
        row.appendChild(g);
        row.appendChild(E('span', 'at-tag ' + (v.modo === 'humano' ? 'h' : ''), v.modo === 'humano' ? 'equipe' : 'IA'));
        if (v.nao_lidas) row.appendChild(E('span', 'at-badge', String(v.nao_lidas)));
        L.appendChild(row);
      });
    });
  }
  function textoDe(m) {
    var c = m.conteudo || {};
    if (m.direcao === 'in') return c.texto || (c.midia ? '📎 arquivo' : '(' + m.tipo + ')');
    if (m.tipo === 'text') return c.body || '';
    if (m.tipo === 'interactive') return (c.body && c.body.text ? c.body.text : '') + '\n[menu]';
    if (m.tipo === 'template') return '[modelo: ' + (c.name || '') + '] ' + ((c.components && c.components[0] && c.components[0].parameters) || []).map(function (p) { return p.text; }).join(' · ');
    return '(' + m.tipo + ')';
  }
  var ORIGEM = {cliente: 'cliente', ia: 'IA', menu: 'menu', equipe_admin: 'equipe (admin)', equipe_app: 'equipe (celular)', regua: 'cobrança', sistema: 'sistema', proposta: 'proposta'};
  function thread(id) {
    var c = limpa($('atCorpo'));
    c.appendChild(btn('at-mini', '← voltar', function () { CONV = null; conversas(); }));
    var hd = E('div', 'at-bar'); c.appendChild(hd);
    var th = E('div', 'at-th'); th.appendChild(E('div', 'loading', 'Carregando…')); c.appendChild(th);
    var box = E('div'); c.appendChild(box);
    api('mensagens', {id: id}).then(function (r) {
      limpa(th); limpa(hd);
      if (!r.ok) { th.appendChild(E('div', 'at-vazio', r.erro || 'erro')); return; }
      var cv = r.conversa;
      hd.appendChild(E('span', 'at-nm', fmtTel(cv.telefone)));
      hd.appendChild(E('span', 'at-tag ' + (cv.modo === 'humano' ? 'h' : ''), cv.modo === 'humano' ? 'com a equipe' + (cv.humano_ate ? ' até ' + quando(cv.humano_ate) : '') : 'com a IA'));
      hd.appendChild(btn('at-mini', cv.modo === 'humano' ? 'Devolver à IA' : 'Assumir conversa', function () { api('modo', {id: id, modo: cv.modo === 'humano' ? 'ia' : 'humano'}).then(function () { thread(id); }); }));
      r.lista.forEach(function (m) {
        var b = E('div', 'at-b ' + m.direcao, textoDe(m));
        b.appendChild(E('span', 'at-meta', (ORIGEM[m.origem] || m.origem) + ' · ' + quando(m.em) + (m.simulado ? ' · simulado' : m.status ? ' · ' + m.status : '') + (m.erro ? ' · erro: ' + m.erro : '')));
        th.appendChild(b);
      });
      th.scrollTop = th.scrollHeight;
      limpa(box);
      if (cv.janela) {
        var ta = E('textarea', 'inp'); ta.placeholder = 'Responder como equipe (a IA pausa por 24h)'; ta.style.marginTop = '12px'; box.appendChild(ta);
        box.appendChild(btn('btn-main', 'Enviar', function () {
          var t = ta.value.trim(); if (!t) return;
          api('responder', {id: id, texto: t}).then(function (x) { if (!x.ok) msg(x.erro || 'erro', true); else { if (x.simulado) msg('Registrado (modo simulação).'); thread(id); } });
        }));
      } else {
        box.appendChild(E('p', 'at-sm', 'Fora da janela de 24h: o WhatsApp só deixa mandar um modelo aprovado.'));
        var n = E('input', 'inp'); n.placeholder = 'Primeiro nome do cliente'; box.appendChild(n);
        var a = E('input', 'inp'); a.placeholder = 'Assunto (ex.: a gravação de sexta)'; a.style.marginTop = '8px'; box.appendChild(a);
        box.appendChild(btn('btn-main', 'Enviar "retomar conversa"', function () { api('retomar', {id: id, nome: n.value, assunto: a.value}).then(function (x) { if (!x.ok) msg(x.erro, true); else thread(id); }); }));
      }
      painel();
    });
  }

  // ---------------- clientes ----------------
  function campo(rotulo, el) { var f = E('div', 'at-f'); var l = E('label', null, rotulo); f.appendChild(l); f.appendChild(el); return f; }
  function inp(v, ph, tipo) { var i = E('input', 'inp'); i.value = v == null ? '' : v; if (ph) i.placeholder = ph; if (tipo) i.type = tipo; return i; }
  function clientes() {
    var c = limpa($('atCorpo'));
    c.appendChild(btn('btn-main', '+ Novo cliente', function () { formCliente({}); }));
    var L = E('div', 'lst'); L.style.marginTop = '14px'; L.appendChild(E('div', 'loading', 'Carregando…')); c.appendChild(L);
    Promise.all([api('clientes'), api('senhas')]).then(function (rs) {
      var r = rs[0]; SENHAS = rs[1].ok ? rs[1].lista : [];
      limpa(L);
      if (!r.ok) { L.appendChild(E('div', 'at-vazio', r.erro || 'erro')); return; }
      CLI = r;
      if (!r.lista.length) { L.appendChild(E('div', 'at-vazio', 'Nenhum cliente cadastrado. O financeiro só funciona para clientes cadastrados aqui.')); return; }
      r.lista.forEach(function (k) {
        var ct = r.contatos.filter(function (x) { return x.cliente_id === k.id; });
        var row = btn('at-row', null, function () { formCliente(k); });
        var g = E('div', 'at-grow'); g.appendChild(E('div', 'at-nm', k.nome));
        g.appendChild(E('div', 'at-sm', 'CNPJ ' + String(k.cnpj).slice(0, 2) + '.***.***/' + String(k.cnpj).slice(8, 12) + '-** · venc. dia ' + (k.vencimento_dia || '—') + ' · ' + ct.length + ' número(s)' + (k.asaas_customer_id ? ' · Asaas ok' : ' · sem Asaas')));
        row.appendChild(g);
        row.appendChild(E('span', 'at-tag ' + (k.status === 'pausado' ? 'r' : k.status === 'encerrado' ? 'h' : 'g'), k.status));
        L.appendChild(row);
      });
    });
  }
  var FORM_FIM = null;   // Studio OS: quando o formulário abre num painel, "voltar"/salvar fecham o painel
  function fimForm() { if (FORM_FIM) { var f = FORM_FIM; FORM_FIM = null; f(); } else clientes(); }
  function formCliente(k) {
    var c = limpa($('atCorpo'));
    c.appendChild(btn('at-mini', '← voltar', fimForm));
    var card = E('div', 'card'); card.style.marginTop = '12px'; c.appendChild(card);
    card.appendChild(E('h2', 'sec', k.id ? k.nome : 'Novo cliente'));
    var g = E('div', 'at-grid'); g.style.marginTop = '12px'; card.appendChild(g);
    var F = {
      nome: inp(k.nome, 'Nome da empresa'), nome_contato: inp(k.nome_contato, 'Nome de quem fala com a gente'), cnpj: inp(k.cnpj, 'só números'),
      email_responsavel: inp(k.email_responsavel, 'e-mail que recebe o código', 'email'), asaas_customer_id: inp(k.asaas_customer_id, 'cus_...'),
      clausula_atraso: inp(k.clausula_atraso, 'ex.: 5.4'), manual_gravacao_url: inp(k.manual_gravacao_url, 'https://... (PDF do manual)'),
      drive_url: inp(k.drive_url, 'https://drive.google.com/...'), onboarding_url: inp(k.onboarding_url, 'https://formulario.studiopulga.com.br/...'),
      observacoes: inp(k.observacoes, '')
    };
    var venc = E('select', 'inp'); [['', '—'], ['10', 'dia 10'], ['20', 'dia 20']].forEach(function (o) { var op = E('option', null, o[1]); op.value = o[0]; if (String(k.vencimento_dia || '') === o[0]) op.selected = true; venc.appendChild(op); });
    var st = E('select', 'inp'); ['ativo', 'pausado', 'encerrado'].forEach(function (o) { var op = E('option', null, o); op.value = o; if ((k.status || 'ativo') === o) op.selected = true; st.appendChild(op); });
    var pa = E('select', 'inp'); [['1', 'sim (padrão do contrato)'], ['0', 'não pausar automaticamente']].forEach(function (o) { var op = E('option', null, o[1]); op.value = o[0]; if ((k.pausa_automatica === false ? '0' : '1') === o[0]) op.selected = true; pa.appendChild(op); });
    var se = E('select', 'inp'); var op0 = E('option', null, '—'); op0.value = ''; se.appendChild(op0);
    SENHAS.forEach(function (s) { var op = E('option', null, s.nicho); op.value = s.id; if (k.onboarding_senha_id === s.id) op.selected = true; se.appendChild(op); });
    [['Empresa', F.nome], ['Contato principal', F.nome_contato], ['CNPJ', F.cnpj], ['E-mail do responsável', F.email_responsavel], ['Cliente no Asaas', F.asaas_customer_id], ['Vencimento', venc], ['Cláusula de atraso no contrato', F.clausula_atraso], ['Pausa automática no 6º dia', pa], ['Situação', st], ['Manual de gravação (link)', F.manual_gravacao_url], ['Pasta do Drive', F.drive_url], ['Formulário de onboarding (link)', F.onboarding_url], ['Senha do onboarding', se], ['Observações', F.observacoes]].forEach(function (x) { g.appendChild(campo(x[0], x[1])); });
    var bar = E('div', 'at-bar'); card.appendChild(bar);
    bar.appendChild(btn('at-mini', 'Buscar no Asaas pelo CNPJ', function () {
      api('asaas_buscar', {cnpj: F.cnpj.value}).then(function (r) {
        if (!r.ok) return msg(r.erro, true);
        if (!r.lista.length) return msg('Nenhum cliente com esse CNPJ no Asaas.', true);
        if (r.lista.length > 1) return msg('Mais de um cliente no Asaas com esse CNPJ: confira e cole o ID certo (' + r.lista.map(function (x) { return x.id; }).join(', ') + ').', true);
        F.asaas_customer_id.value = r.lista[0].id; if (!F.email_responsavel.value && r.lista[0].email) F.email_responsavel.value = r.lista[0].email;
        msg('Encontrado no Asaas: ' + r.lista[0].nome);
      });
    }));
    card.appendChild(btn('btn-main', 'Salvar cliente', function () {
      var d = {id: k.id, vencimento_dia: venc.value || null, status: st.value, pausa_automatica: pa.value === '1', onboarding_senha_id: se.value || null};
      Object.keys(F).forEach(function (n) { d[n] = F[n].value.trim(); });
      api('cliente_salvar', {cliente: d}).then(function (r) { if (!r.ok) return msg(r.erro, true); msg('Cliente salvo.'); CLI.lista = []; if (!k.id) formCliente(r.cliente); else fimForm(); });
    }));
    if (!k.id) return;
    // números
    var cc = E('div', 'card'); c.appendChild(cc);
    cc.appendChild(E('h2', 'sec', 'Números de WhatsApp'));
    cc.appendChild(E('p', 'at-sm', 'Responsável vê o financeiro; Equipe só conteúdo e gravação. Todo número confirma uma vez com o código enviado ao e-mail do responsável.'));
    var L = E('div', 'lst'); L.style.margin = '10px 0'; cc.appendChild(L);
    (CLI.contatos || []).filter(function (x) { return x.cliente_id === k.id; }).forEach(function (x) {
      var row = E('div', 'at-row'); row.style.cursor = 'default';
      var g2 = E('div', 'at-grow'); g2.appendChild(E('div', 'at-nm', (x.nome || '') + ' ' + fmtTel(x.telefone)));
      g2.appendChild(E('div', 'at-sm', (x.verificado_em ? 'confirmado ' + quando(x.verificado_em) : 'aguardando confirmação') + (x.bloqueado ? ' · BLOQUEADO' : '')));
      row.appendChild(g2);
      var sp = E('select', 'inp'); sp.style.width = 'auto'; [['responsavel', 'Responsável'], ['equipe', 'Equipe']].forEach(function (o) { var op = E('option', null, o[1]); op.value = o[0]; if (x.perfil === o[0]) op.selected = true; sp.appendChild(op); });
      sp.addEventListener('change', function () { api('contato_salvar', {contato: {cliente_id: k.id, telefone: x.telefone, nome: x.nome, perfil: sp.value}}).then(function (r) { msg(r.ok ? 'Perfil atualizado.' : r.erro, !r.ok); }); });
      row.appendChild(sp);
      if (x.bloqueado) row.appendChild(btn('at-mini', 'desbloquear', function () { api('contato_acao', {id: x.id, tipo: 'desbloquear'}).then(function () { recarregaForm(k.id); }); }));
      row.appendChild(btn('at-mini dan', 'remover', function () { if (confirm('Remover este número do cliente?')) api('contato_acao', {id: x.id, tipo: 'remover'}).then(function () { recarregaForm(k.id); }); }));
      L.appendChild(row);
    });
    var g3 = E('div', 'at-grid'); cc.appendChild(g3);
    var nt = inp('', '(13) 9 9999-9999', 'tel'), nn = inp('', 'Nome'), np = E('select', 'inp');
    [['responsavel', 'Responsável'], ['equipe', 'Equipe']].forEach(function (o) { var op = E('option', null, o[1]); op.value = o[0]; np.appendChild(op); });
    g3.appendChild(campo('Telefone', nt)); g3.appendChild(campo('Nome', nn)); g3.appendChild(campo('Perfil', np));
    cc.appendChild(btn('btn-main', 'Adicionar número', function () {
      api('contato_salvar', {contato: {cliente_id: k.id, telefone: nt.value, nome: nn.value, perfil: np.value}}).then(function (r) { if (!r.ok) return msg(r.erro, true); recarregaForm(k.id); });
    }));
  }
  function recarregaForm(id) { api('clientes').then(function (r) { if (r.ok) { CLI = r; var k = r.lista.filter(function (x) { return x.id === id; })[0]; if (k) formCliente(k); } }); }

  // ---------------- cobrança ----------------
  function cobranca() {
    var c = limpa($('atCorpo'));
    c.appendChild(E('p', 'at-sm', 'O Asaas gera a cobrança, o link, a nota e o e-mail. Aqui saem os avisos de WhatsApp: 3 dias antes, no dia, 2 dias depois, aviso de pausa no 5º dia, pausa no 6º, equipe no 10º. Deixe desligadas as notificações de WhatsApp no Asaas para não duplicar.'));
    var bar = E('div', 'at-bar'); c.appendChild(bar);
    bar.appendChild(btn('at-mini', 'Simular a régua de hoje', function () {
      api('regua_simular').then(function (r) { if (!r.ok) return msg(r.motivo || r.erro, true); msg(r.etapas.length ? 'Hoje sairiam: ' + r.etapas.map(function (e) { return e.cliente + ' → ' + e.etapa; }).join('; ') : 'Nada para enviar hoje.'); });
    }));
    var box = E('div', 'card'); box.appendChild(E('div', 'loading', 'Consultando o Asaas…')); c.appendChild(box);
    api('cobranca').then(function (r) {
      limpa(box);
      if (!r.ok) { box.appendChild(E('div', 'at-vazio', r.erro || 'erro')); return; }
      if (r.sem_vinculo) box.appendChild(E('p', 'at-sm', r.sem_vinculo + ' cobrança(s) em aberto de clientes ainda não ligados ao Asaas aqui (aba Clientes).'));
      if (!r.lista.length) { box.appendChild(E('div', 'at-vazio', 'Nenhuma cobrança em aberto de clientes cadastrados.')); return; }
      var tb = E('table', 'at-cob'); var tr = E('tr'); ['Cliente', 'Valor', 'Venc.', 'Dias', 'Avisos', ''].forEach(function (h) { tr.appendChild(E('th', null, h)); }); tb.appendChild(tr);
      r.lista.forEach(function (p) {
        var t = E('tr');
        var c1 = E('td'); c1.appendChild(E('div', 'at-nm', p.cliente)); if (p.status_cliente === 'pausado') c1.appendChild(E('span', 'at-tag r', 'pausado')); t.appendChild(c1);
        t.appendChild(E('td', null, p.valor)); t.appendChild(E('td', null, p.vencimento));
        t.appendChild(E('td', null, (p.dias > 0 ? '+' : '') + p.dias));
        t.appendChild(E('td', 'at-sm', p.envios.map(function (e) { return e.etapa + (e.simulado ? ' (sim.)' : '') + (e.detalhe && !/^(ok|simulado)/.test(e.detalhe) ? ' · ' + e.detalhe : ''); }).join(', ') || '—'));
        var c6 = E('td');
        if (!p.envios.some(function (e) { return e.etapa === 'pular'; })) c6.appendChild(btn('at-mini', 'pular régua', function () { if (confirm('Parar os avisos automáticos desta cobrança?')) api('regua_pular', {pagamento: p.id}).then(cobranca); }));
        if (p.status_cliente === 'pausado') c6.appendChild(btn('at-mini', 'reativar cliente', function () { api('cliente_status', {id: p.cliente_id, status: 'ativo'}).then(cobranca); }));
        t.appendChild(c6); tb.appendChild(t);
      });
      var wrap = E('div'); wrap.style.overflowX = 'auto'; wrap.appendChild(tb); box.appendChild(wrap);
    });
  }

  // ---------------- senhas ----------------
  function senhas() {
    var c = limpa($('atCorpo'));
    var L = E('div', 'lst'); L.appendChild(E('div', 'loading', 'Carregando…')); c.appendChild(L);
    api('senhas').then(function (r) {
      limpa(L); SENHAS = r.ok ? r.lista : [];
      if (!r.ok) { L.appendChild(E('div', 'at-vazio', r.erro)); return; }
      if (!SENHAS.length) L.appendChild(E('div', 'at-vazio', 'Nenhuma senha cadastrada ainda.'));
      SENHAS.forEach(function (s) {
        var row = E('div', 'at-row'); row.style.cursor = 'default';
        var g = E('div', 'at-grow'); g.appendChild(E('div', 'at-nm', s.nicho + (s.ativo ? '' : ' (inativa)')));
        var sv = E('div', 'at-sm', 'senha: ••••••'); g.appendChild(sv);
        if (s.url_formulario) g.appendChild(E('div', 'at-sm', s.url_formulario));
        row.appendChild(g);
        row.appendChild(btn('at-mini', 'mostrar', function () { sv.textContent = sv.textContent.indexOf('•') > -1 ? 'senha: ' + s.senha : 'senha: ••••••'; }));
        row.appendChild(btn('at-mini pri', 'copiar p/ cliente', function () {
          var t = 'aqui está o seu formulário de boas-vindas 💌\n' + (s.url_formulario || 'https://formulario.studiopulga.com.br') + '\nsenha: ' + s.senha;
          (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { msg('Copiado.'); }, function () { prompt('Copie:', t); });
        }));
        row.appendChild(btn('at-mini', 'editar', function () { formSenha(s); }));
        L.appendChild(row);
      });
      c.appendChild(E('div', null)).style.height = '12px';
      c.appendChild(btn('btn-main', '+ Nova senha', function () { formSenha({ativo: true}); }));
    });
  }
  function formSenha(s) {
    var c = limpa($('atCorpo'));
    c.appendChild(btn('at-mini', '← voltar', senhas));
    var card = E('div', 'card'); card.style.marginTop = '12px'; c.appendChild(card);
    var n = inp(s.nicho, 'ex.: Arquitetos'), p = inp(s.senha, 'ex.: Arq03'), u = inp(s.url_formulario, 'https://formulario.studiopulga.com.br'), o = inp(s.observacao, '');
    var at = E('select', 'inp'); [['1', 'ativa'], ['0', 'inativa']].forEach(function (x) { var op = E('option', null, x[1]); op.value = x[0]; if ((s.ativo === false ? '0' : '1') === x[0]) op.selected = true; at.appendChild(op); });
    [['Nicho / formulário', n], ['Senha', p], ['Link do formulário', u], ['Observação', o], ['Situação', at]].forEach(function (x) { card.appendChild(campo(x[0], x[1])); });
    card.appendChild(btn('btn-main', 'Salvar', function () { api('senha_salvar', {senha: {id: s.id, nicho: n.value, senha: p.value, url_formulario: u.value, observacao: o.value, ativo: at.value === '1'}}).then(function (r) { if (!r.ok) return msg(r.erro, true); senhas(); }); }));
    if (s.id) card.appendChild(btn('at-mini dan', 'remover', function () { if (confirm('Remover esta senha da lista?')) api('senha_remover', {id: s.id}).then(senhas); }));
  }

  // ---------------- ajustes ----------------
  function ajustes() {
    var c = limpa($('atCorpo'));
    var envC = E('div', 'card'); c.appendChild(envC);
    var tplC = E('div', 'card'); c.appendChild(tplC);
    var cfgC = E('div', 'card'); c.appendChild(cfgC);
    api('painel').then(function (r) {
      envC.appendChild(E('h2', 'sec', 'Variáveis no Vercel'));
      if (!r.ok) return envC.appendChild(E('p', 'at-sm', r.erro));
      var g = E('div', 'at-env'); g.style.marginTop = '10px';
      Object.keys(r.env).forEach(function (k) { g.appendChild(E('span', null, k)); g.appendChild(E('span', 'at-tag ' + (r.env[k] ? 'g' : 'r'), r.env[k] ? 'ok' : (k === 'WHATSAPP_ATIVO' || k === 'IA_ATIVA' ? 'desligado' : 'falta'))); });
      envC.appendChild(g);
      var bar = E('div', 'at-bar'); envC.appendChild(bar);
      bar.appendChild(btn('at-mini', 'Testar envio (texto)', function () { api('teste_envio').then(function (x) { msg(x.ok ? 'Enviado para o número de teste.' : x.erro, !x.ok); }); }));
      bar.appendChild(btn('at-mini', 'Testar envio (modelo)', function () { api('teste_envio', {template: true}).then(function (x) { msg(x.ok ? 'Modelo enviado para o número de teste.' : x.erro, !x.ok); }); }));
    });
    api('templates').then(function (r) {
      tplC.appendChild(E('h2', 'sec', 'Modelos de mensagem (Meta)'));
      if (r.erro) tplC.appendChild(E('p', 'at-sm', 'Meta: ' + r.erro));
      var L = E('div', 'lst'); L.style.margin = '10px 0'; tplC.appendChild(L);
      (r.lista || []).forEach(function (t) {
        var row = E('div', 'at-row'); row.style.cursor = 'default';
        var g = E('div', 'at-grow'); g.appendChild(E('div', 'at-nm', t.name)); g.appendChild(E('div', 'at-sm', t.texto)); if (t.motivo && t.motivo !== 'NONE') g.appendChild(E('div', 'at-sm', 'motivo: ' + t.motivo));
        row.appendChild(g); row.appendChild(E('span', 'at-tag ' + (t.status === 'APPROVED' ? 'g' : t.status === 'REJECTED' ? 'r' : 'h'), t.status));
        L.appendChild(row);
      });
      tplC.appendChild(btn('btn-main', 'Criar modelos que faltam na Meta', function () {
        api('templates_criar').then(function (x) { if (!x.ok) return msg(x.erro, true); msg(x.resultado.map(function (y) { return y.name + ': ' + (y.ja ? 'já existia' : y.ok ? 'enviado para aprovação' : 'erro ' + y.erro); }).join(' · ')); ajustes(); });
      }));
    });
    api('config').then(function (r) {
      if (!r.ok) return cfgC.appendChild(E('p', 'at-sm', r.erro));
      CFG = r;
      var V = function (k) { return r.valores[k] != null ? r.valores[k] : r.padroes[k]; };
      cfgC.appendChild(E('h2', 'sec', 'Atendimento'));
      var com = inp(V('whatsapp_comercial'), '5513...'); cfgC.appendChild(campo('WhatsApp comercial (visitante interessado vai para cá)', com));
      cfgC.appendChild(btn('at-mini', 'salvar', function () { salvarCfg('whatsapp_comercial', com.value); }));
      var na = V('numeros_alerta') || [];
      var a1 = inp(na[0] && na[0].telefone, 'Isaque: 5513...'), a2 = inp(na[1] && na[1].telefone, 'Ju: 5513...');
      cfgC.appendChild(campo('Números que recebem alertas (Isaque e Ju)', a1)); cfgC.appendChild(a2);
      cfgC.appendChild(btn('at-mini', 'salvar', function () { salvarCfg('numeros_alerta', [{nome: 'Isaque', telefone: a1.value}, {nome: 'Ju', telefone: a2.value}]); }));
      var hp = inp(V('ia_pausa_quando_equipe_responde_horas'), '12', 'number'); cfgC.appendChild(campo('Quando a equipe responde pelo celular, a IA fica quieta por (horas)', hp));
      cfgC.appendChild(btn('at-mini', 'salvar', function () { salvarCfg('ia_pausa_quando_equipe_responde_horas', Number(hp.value)); }));
      var av = V('avisos') || []; var a0 = av[0] || {};
      var ai = inp(a0.inicio, '', 'date'), af = inp(a0.fim, '', 'date'), at = inp(a0.texto, 'feriadou! 🥳 o escritório estará fechado...');
      cfgC.appendChild(campo('Aviso de feriado/recesso: de', ai)); cfgC.appendChild(campo('até', af)); cfgC.appendChild(campo('texto (a IA usa nas respostas)', at));
      cfgC.appendChild(btn('at-mini', 'salvar aviso', function () { salvarCfg('avisos', ai.value ? [{inicio: ai.value, fim: af.value || ai.value, texto: at.value, fechado: true}] : []); }));
      var man = E('textarea', 'inp'); man.style.minHeight = '320px'; man.value = V('manual_ia');
      cfgC.appendChild(campo('Manual da IA (o jeito de responder)', man));
      cfgC.appendChild(btn('btn-main', 'Salvar manual da IA', function () { salvarCfg('manual_ia', man.value); }));
      cfgC.appendChild(btn('at-mini', 'voltar ao texto padrão', function () { if (confirm('Voltar o manual para o texto padrão?')) { man.value = r.padroes.manual_ia; } }));
    });
  }
  function salvarCfg(k, v) { api('config_salvar', {chave: k, valor: v}).then(function (r) { msg(r.ok ? 'Salvo.' : (r.erro || 'erro'), !r.ok); }); }

  window.atCarregar = function () {
    casca();
    if (POLL) clearInterval(POLL);
    POLL = setInterval(function () {
      var s = $('scrAtend'); if (!s || !s.classList.contains('on') || document.hidden) return;
      if (SUB === 'conversas' && CONV) { var th = s.querySelector('.at-th'); if (th && !s.querySelector('textarea:focus') && !s.querySelector('input:focus')) thread(CONV); }
      else if (SUB === 'conversas') conversas();
    }, 20000);
  };
  window.atPainel = painel;
  // Studio OS: abre uma parte desta tela dentro de outro lugar (Ajustes, Clientes). sub: ajustes | senhas | clientes | cobranca | form
  window.atAbrir = function (sub, root, extra, fim) {
    FORM_FIM = sub === 'form' && typeof fim === 'function' ? fim : null;
    var velho = document.getElementById('atCorpo'); if (velho && !root.contains(velho)) velho.removeAttribute('id');
    limpa(root); var c = E('div'); c.id = 'atCorpo'; root.appendChild(c);
    CONV = null; SUB = sub === 'form' ? 'clientes' : sub;
    if (sub === 'form') { var go = function () { formCliente(extra || {}); }; if (SENHAS.length) go(); else api('senhas').then(function (r) { if (r.ok) SENHAS = r.lista; go(); }); return; }
    ({conversas: conversas, clientes: clientes, cobranca: cobranca, senhas: senhas, ajustes: ajustes})[SUB]();
  };
})();
