// admin-emails.js — aba "E-mails" (próximos envios, enviados, bloqueados, contador do mês, "Enviar teste para mim"),
// linha do tempo de cada proposta (Pausar / Cliente fechou / Reabrir / Nicho) e Nicho automático no formulário.
// Tudo passa por /api/admin/emails e /api/admin (sessão do admin). Dados sempre escapados antes de ir para a tela.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };
  var dh = function (iso) { return typeof fmtDH === 'function' ? fmtDH(iso) : String(iso || '').slice(0, 16).replace('T', ' '); };
  var SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var dia = function (s) { var d = new Date(s + 'T12:00:00Z'); return SEM[d.getUTCDay()] + ' ' + s.slice(8, 10) + '/' + s.slice(5, 7); };
  var NICHO = {arquiteto: 'Arquiteto/Designer', loja: 'Loja', construtora: 'Construtora', outro: 'Outro'};
  var TIPO = {link: 'Sua proposta', lembrete: 'Lembrete', ultimo_aviso: 'Último aviso', campanha: 'Sazonal', teste: 'Teste', resumo: 'Resumo semanal', escolha: 'Confirmação do plano', link_antigo: 'Link (envio antigo)'};
  var ST = {enviado: ['Enviado', '#6b5a50', 'rgba(110,44,20,.08)'], entregue: ['Entregue', '#fff', '#1a7a3c'], atrasado: ['Atrasado', '#fff', '#b36b00'],
    rejeitado: ['Rejeitado', '#fff', '#b3261e'], spam: ['Spam', '#fff', '#b3261e'], erro: ['Erro', '#fff', '#b3261e'], simulado: ['Simulado', '#4a3a33', '#EAD8C5']};
  var badge = function (st) { var b = ST[st] || [st, '#6b5a50', 'rgba(110,44,20,.08)']; return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;color:' + b[1] + ';background:' + b[2] + ';">' + esc(b[0]) + '</span>'; };
  var tipoTxt = function (l) { return (TIPO[l.tipo] || l.tipo || '') + (l.tipo === 'campanha' && l.campanha ? ' · ' + l.campanha : '') + (l.tipo === 'teste' && l.campanha ? ' · ' + l.campanha : ''); };

  function api(acao, dados) {
    var h = {'Content-Type': 'application/json'};
    if (typeof TOKEN !== 'undefined' && TOKEN) h['Authorization'] = 'Bearer ' + TOKEN;
    return fetch('/api/admin/emails', {method: 'POST', credentials: 'same-origin', headers: h, body: JSON.stringify(Object.assign({acao: acao}, dados || {}))})
      .then(function (r) {
        if (r.status === 401) { if (typeof logout === 'function') logout(true); alert('Sua sessão expirou. Entre novamente.'); throw new Error('sessao'); }
        return r.json().catch(function () { return {ok: false, erro: 'resposta inválida do servidor (HTTP ' + r.status + ')'}; });
      }).catch(function (e) { if (e && e.message === 'sessao') throw e; return {ok: false, erro: 'sem conexão com o servidor'}; });
  }

  // ---------- Nicho automático no formulário (até a pessoa escolher à mão) ----------
  var nichoMexido = false;
  function nichoAuto() {
    var sel = $('fNicho'); if (!sel || nichoMexido) return;
    var cd = typeof AREA !== 'undefined' && AREA === 'cd';
    // Cardápio: o nicho não é preenchido sozinho (obrigatório escolher). Planos: vem do modelo (Arquiteto/Loja).
    sel.value = cd ? '' : ((typeof PL_MODELO !== 'undefined' && PL_MODELO === 'loja') ? 'loja' : 'arquiteto');
    if (window.nvAtualiza) nvAtualiza();
  }
  if ($('fNicho')) {
    $('fNicho').addEventListener('change', function () { nichoMexido = true; });
    // trocar o modelo na Nova proposta volta ao nicho automático (até a pessoa escolher à mão)
    window.nichoNovoModelo = function () { nichoMexido = false; nichoAuto(); };
    var g = $('btnGerar'); if (g) g.addEventListener('click', nichoAuto, true);   // antes de gerar (cobre o Duplicar)
    setTimeout(nichoAuto, 0);
  }

  // ---------- Tela "E-mails" (aberta pelo menu; ver /admin-app.js) ----------
  var sec = $('secEmails');
  if (!sec) return;
  window.emailsApi = api;

  var H = function (t) { return '<div class="sec-sep">' + esc(t) + '</div>'; };
  var vazio = function (t) { return '<div class="hist-info">' + esc(t) + '</div>'; };
  function carregarPainel() {
    var c = $('emCorpo');
    return api('painel').then(function (d) {
      if (!d || !d.ok) { c.innerHTML = '<div class="hist-info" style="color:#b3261e;">' + esc((d && d.erro) || 'Não foi possível carregar.') + '</div><button class="btn-out" id="emRec">Tentar de novo</button>'; $('emRec').onclick = carregarPainel; return; }
      var h = '';
      var sim = d.modo !== 'envio';
      h += '<div style="padding:12px 14px;border-radius:12px;margin-bottom:12px;font-size:13px;line-height:1.45;background:' + (sim ? '#FFF4E0' : '#E7F4EC') + ';color:' + (sim ? '#7a4a00' : '#1a5c33') + ';"><strong>' + (sim ? 'Modo SIMULAÇÃO' : 'Envios LIGADOS') + '</strong><br>' +
        (sim ? 'Nada é enviado aos clientes. O sistema registra o que enviaria (aparece como "Simulado").' : 'Os e-mails automáticos estão indo para os clientes (máx. ' + esc(d.limite_dia) + ' por dia).') + '</div>';
      if (!d.email_teste) h += '<div class="hist-info" style="color:#b3261e;">Falta a variável EMAIL_TESTE no Vercel (testes e resumo semanal).</div>';
      if (!d.webhook) h += '<div class="hist-info" style="color:#b3261e;">Webhook do Resend ainda não configurado (RESEND_WEBHOOK_SECRET): sem status de entrega e sem bloqueio automático.</div>';
      var m = d.mes || {};
      var chip = function (n, t, cor) { return '<div style="flex:1;min-width:84px;background:#fff;border:1px solid var(--brl);border-radius:12px;padding:10px 8px;text-align:center;"><div style="font-size:20px;font-weight:700;color:' + (cor || '#6E2C14') + ';">' + esc(n || 0) + '</div><div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--gray);">' + esc(t) + '</div></div>'; };
      h += H('Este mês') + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">' + chip(m.enviados, 'Enviados') + chip(m.entregues, 'Entregues', '#1a7a3c') + chip((m.rejeitados || 0) + (m.spam || 0), 'Rejeit./spam', '#b3261e') + chip(m.erros, 'Falhas', '#b3261e') + (sim ? chip(m.simulados, 'Simulados', '#7a4a00') : '') + '</div>';
      // teste para mim
      h += H('Enviar teste para mim') + '<div class="hist-info">Vai só para ' + esc(d.email_teste || '(EMAIL_TESTE não configurado)') + ', com dados fictícios.</div>' +
        '<select class="inp" id="emModelo">' + (d.modelos || []).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nome) + '</option>'; }).join('') + '</select>' +
        '<button class="btn-out" id="emTeste" style="margin-top:8px;width:100%;"' + (d.email_teste ? '' : ' disabled') + '>' + ICO('send', 18) + 'Enviar teste para mim</button><div id="emTesteMsg" class="hist-info" style="margin-top:6px;"></div>';
      // próximos
      var px = d.proximos || [];
      h += H('Próximos envios (7 dias)' + (sim ? ' · simulação' : ''));
      h += px.length ? px.map(function (x) {
        if (x.aviso) return '<div class="hist-info" style="color:#b3261e;">' + esc(dia(x.data)) + ': ' + esc(x.aviso) + '</div>';
        return '<div class="hist-info" style="display:block;border-bottom:1px solid var(--brl);padding:6px 0;"><strong>' + esc(dia(x.data)) + ' · 9h</strong> ' + esc(x.rotulo) + '<br><span>' + esc(x.cliente || '') + ' · ' + esc(x.email) + '</span></div>';
      }).join('') : vazio('Nada agendado.');
      // enviados
      var lg = d.log || [];
      h += H('Enviados e registrados (últimos)');
      h += lg.length ? lg.slice(0, 50).map(function (l) {
        return '<div class="hist-info" style="display:block;border-bottom:1px solid var(--brl);padding:6px 0;">' + badge(l.status) + ' <strong>' + esc(tipoTxt(l)) + '</strong><br><span>' + esc(dh(l.criado_em)) + ' · ' + esc(l.cliente ? l.cliente + ' · ' : '') + esc(l.email || '') + '</span>' + (l.erro && (l.status === 'erro' || l.status === 'rejeitado') ? '<br><span style="color:#b3261e;">' + esc(l.erro) + '</span>' : '') + '</div>';
      }).join('') : vazio('Nenhum e-mail registrado ainda.');
      // suprimidos
      var sp = d.suprimidos || [];
      var MOT = {rejeitado: 'E-mail rejeitado', spam: 'Marcou como spam', descadastro: 'Pediu para sair'};
      h += H('Bloqueados (não recebem mais nada)');
      h += sp.length ? sp.map(function (x) { return '<div class="hist-info"><strong>' + esc(MOT[x.motivo] || x.motivo) + '</strong>' + esc(x.email) + ' · ' + esc(dh(x.criado_em)) + '</div>'; }).join('') : vazio('Nenhum contato bloqueado.');
      h += '<button class="btn-out" id="emAtual" style="margin-top:14px;width:100%;">' + ICO('refresh', 18) + 'Atualizar</button>';
      c.innerHTML = h;
      $('emAtual').onclick = carregarPainel;
      $('emTeste').onclick = function () {
        var b = this, msg = $('emTesteMsg'); b.disabled = true; msg.style.color = ''; msg.textContent = 'Enviando…';
        api('teste', {modelo: $('emModelo').value}).then(function (r) {
          b.disabled = false;
          msg.style.color = r.ok ? '#1a7a3c' : '#b3261e';
          msg.textContent = r.ok ? 'Teste enviado para ' + r.para + '. Confira a caixa de entrada e o spam.' : 'Não enviado: ' + (r.erro || 'erro');
          if (r.ok) setTimeout(carregarPainel, 1500);
        }).catch(function () { b.disabled = false; });
      };
    }).catch(function () {});
  }
  window.carregarPainelEmails = carregarPainel;

  // ---------- Linha do tempo de uma proposta ----------
  window.emailsProposta = function (id) {
    api('timeline', {id: id}).then(function (t) {
      if (!t || !t.ok) { if (typeof histMsg === 'function') histMsg('Não foi possível abrir: ' + ((t && t.erro) || 'erro'), true); return; }
      var parado = t.seq_status === 'fechada' || t.seq_status === 'pausada';
      var stTxt = t.suprimido ? 'Bloqueado (e-mail rejeitado ou spam)' : t.seq_status === 'descadastrada' ? 'Cliente pediu para não receber' : t.seq_status === 'fechada' ? 'Parados: cliente fechou' : t.seq_status === 'pausada' ? 'Pausados' : 'Ligados';
      var acao = function (status, txt) {
        return function () {
          if (typeof hFechar === 'function') hFechar();
          adm('seq_status', {id: id, status: status}).then(function (r) {
            var ok = r && r.ok;
            var fim = function () { if (typeof histMsg === 'function') histMsg(ok ? txt : 'Não foi possível: ' + ((r && r.erro) || 'erro'), !ok); };
            if (typeof carregarHistorico === 'function') carregarHistorico().then(fim); else fim();
          }).catch(function () {});
        };
      };
      var botoes = [];
      if (t.seq_status !== 'descadastrada' && !t.suprimido) {
        if (parado) botoes.push({t: 'Reabrir e-mails', c: 'pri', f: acao('ativa', 'E-mails religados para esta proposta.')});
        else { botoes.push({t: 'Pausar e-mails', f: acao('pausada', 'E-mails desta proposta pausados.')}); botoes.push({t: 'Cliente fechou', c: 'pri', f: acao('fechada', 'Marcada como fechada: nenhum e-mail automático vai mais.')}); }
      }
      botoes.push({t: 'Fechar', f: hFechar});
      hModal('E-mails · ' + (t.cliente || ''), (t.email || 'sem e-mail') + ' · E-mails automáticos: ' + stTxt + (t.modo !== 'envio' ? ' · (modo simulação)' : ''), function (corpo) {
        var h = '<label class="label" for="tlNicho">Nicho</label><select class="inp" id="tlNicho">' + Object.keys(NICHO).map(function (k) { return '<option value="' + k + '"' + (t.nicho === k ? ' selected' : '') + '>' + NICHO[k] + '</option>'; }).join('') + '</select><div id="tlNichoMsg" class="hist-info" style="margin-top:4px;">' + (t.nicho_ok === false || t.nicho_auto ? 'Ainda não confirmado. Escolha para confirmar.' : '') + '</div>';
        h += '<div class="sec-sep">Linha do tempo</div>';
        var lg = t.log || [];
        h += lg.length ? lg.map(function (l) { return '<div class="hist-info" style="display:block;border-bottom:1px solid var(--brl);padding:6px 0;">' + badge(l.status) + ' <strong>' + esc(tipoTxt(l)) + '</strong><br><span>' + esc(dh(l.criado_em)) + '</span>' + (l.erro && l.status !== 'entregue' ? '<br><span style="color:#b3261e;">' + esc(l.erro) + '</span>' : '') + '</div>'; }).join('') : '<div class="hist-info">Nenhum e-mail registrado ainda.</div>';
        var px = t.proximos || [];
        h += '<div class="sec-sep">Próximos</div>' + (px.length && !parado ? px.map(function (x) { return '<div class="hist-info">' + (x.aviso ? esc(x.aviso) : '<strong>' + esc(dia(x.data)) + ' · 9h</strong>' + esc(x.rotulo)) + '</div>'; }).join('') : '<div class="hist-info">Nada agendado.</div>');
        corpo.innerHTML = h;
        corpo.querySelector('#tlNicho').addEventListener('change', function () {
          var v = this.value, msg = corpo.querySelector('#tlNichoMsg'); msg.style.color = ''; msg.textContent = 'Salvando…';
          adm('nicho_confirmar', {id: id, valor: v}).then(function (r) {
            msg.style.color = r && r.ok ? '#1a7a3c' : '#b3261e'; msg.textContent = r && r.ok ? 'Nicho salvo: ' + NICHO[v] + '.' : 'Não foi salvo: ' + ((r && r.erro) || 'erro');
            if (r && r.ok && typeof carregarHistorico === 'function') carregarHistorico();
          }).catch(function () {});
        });
      }, botoes);
    }).catch(function () {});
  };
})();
