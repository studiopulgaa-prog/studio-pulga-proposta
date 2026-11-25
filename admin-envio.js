// admin-envio.js — "Enviar por e-mail" (Resend): botao na proposta recem-gerada, no Historico e opcao "enviar ao gerar".
// Tudo passa por /api/admin/enviar-email (sessao do admin; a chave do Resend fica so no servidor).
(function () {
  function post(id) {
    var h = {'Content-Type': 'application/json'};
    if (typeof TOKEN !== 'undefined' && TOKEN) h['Authorization'] = 'Bearer ' + TOKEN;
    return fetch('/api/admin/enviar-email', {method: 'POST', credentials: 'same-origin', headers: h, body: JSON.stringify({acao: 'proposta', id: id})})
      .then(function (r) {
        if (r.status === 401) { if (typeof logout === 'function') logout(true); alert('Sua sessão expirou. Entre novamente.'); throw new Error('sessao'); }
        return r.json().catch(function () { return {ok: false, erro: 'resposta inválida do servidor (HTTP ' + r.status + ')'}; });
      });
  }
  // envia e devolve {ok, enviado_em} ou {ok:false, erro}
  function enviar(id) {
    return post(id).catch(function (e) { if (e && e.message === 'sessao') throw e; return {ok: false, erro: 'sem conexão com o servidor'}; });
  }
  function fmt(iso) { return typeof fmtDH === 'function' ? fmtDH(iso) : iso; }

  // confirmacao (por DOM) e envio; "depois" recarrega a lista do servidor e mostra o resultado
  window.envioEmail = function (id, opts) {
    opts = opts || {};
    var p = typeof propPorId === 'function' ? propPorId(id) : null;
    var para = (p && p.email) || opts.email || '';
    var feito = function (r) {
      var msg = r.ok ? 'E-mail enviado para ' + (r.para || para) + (r.enviado_em ? ' em ' + fmt(r.enviado_em) : '') + '.' : 'E-mail NÃO enviado: ' + (r.erro || 'erro');
      if (opts.depois) opts.depois(r, msg);
      if (typeof carregarHistorico === 'function') carregarHistorico().then(function () { if (typeof histMsg === 'function') histMsg(msg, !r.ok); });
    };
    var rodar = function () {
      if (typeof histMsg === 'function') histMsg('Enviando e-mail…');
      enviar(id).then(feito).catch(function () {});
    };
    if (opts.semConfirmar) return rodar();
    var ja = p && p.enviado_em;
    hModal(ja ? 'Reenviar a proposta por e-mail?' : 'Enviar a proposta por e-mail?',
      'Vai para: ' + para + (ja ? ' (já enviada em ' + fmt(p.enviado_em) + ')' : '') + '. Confira se o endereço está certo.', null,
      [{t: 'Cancelar', f: hFechar}, {t: ja ? 'Reenviar' : 'Enviar', c: 'pri', f: function () { hFechar(); rodar(); }}]);
  };

  // opcao "enviar ao gerar" (checkbox do formulario) e botao na proposta recem-gerada
  var cb = document.getElementById('fEnviarGerar');
  var rb = document.getElementById('btnEmailGerado');
  var rbMsg = document.getElementById('emailGeradoMsg');
  window.envioGerado = function (id, email) {   // chamado depois que a proposta foi salva e o link curto existe
    if (!rb) return;
    window.SP_ID_GERADO = id;
    rb.style.display = email ? '' : 'none'; rbMsg.textContent = '';
    rb.textContent = 'Enviar por e-mail para ' + email; rb.disabled = false;
    rb.dataset.id = id; rb.dataset.email = email || '';
  };
  if (rb) rb.addEventListener('click', function () {
    var id = rb.dataset.id; if (!id) return;
    envioEmail(id, {email: rb.dataset.email, depois: function (r, msg) { rbMsg.textContent = msg; rbMsg.style.color = r.ok ? '#1a7a3c' : '#b3261e'; if (r.ok) rb.textContent = 'Reenviar por e-mail'; }});
  });
  // chamado por mostraResultado quando o link curto ficou pronto
  window.SP_AUTOENVIO_RODA = function () {
    var f = window.SP_AUTOENVIO; window.SP_AUTOENVIO = null;
    if (f) f();
  };
  window.envioConfigurar = function (id, email) {   // logo apos salvar a proposta (antes de mostrar o resultado)
    window.envioGerado(id, email);
    var mu = document.getElementById('fMulher');
    if (mu && mu.checked && typeof adm === 'function') adm('mulher', {id: id, valor: true}).catch(function () {});  // marca "cliente mulher" (opcional)
    var wa = document.getElementById('fWhats'), wd = wa ? wa.value.replace(/\D/g, '') : '';   // WhatsApp do cliente (opcional) -> salvo como 55 + dígitos
    if ((wd.length === 10 || wd.length === 11) && typeof adm === 'function') adm('contato', {id: id, whatsapp: '55' + wd}).catch(function () {});
    var ni = document.getElementById('fNicho');   // nicho (escolhido ou automático pelo modelo)
    if (ni && ni.value && typeof adm === 'function') adm('nicho_confirmar', {id: id, valor: ni.value}).catch(function () {});   // nicho escolhido na Nova = confirmado
    window.SP_AUTOENVIO = (cb && cb.checked && email) ? function () {
      envioEmail(id, {email: email, semConfirmar: true, depois: function (r, msg) { rbMsg.textContent = msg; rbMsg.style.color = r.ok ? '#1a7a3c' : '#b3261e'; if (r.ok) rb.textContent = 'Reenviar por e-mail'; }});
    } : null;
  };

  // ---- Histórico: "Cliente fechou / Reabrir lembretes" e "Cliente mulher" ----
  function aviso(msg, erro) { if (typeof histMsg === 'function') histMsg(msg, !!erro); }
  function recarregar(msg) { if (typeof carregarHistorico === 'function') carregarHistorico().then(function () { aviso(msg, false); }); else aviso(msg, false); }
  window.seqFechou = function (id) {
    var p = typeof propPorId === 'function' ? propPorId(id) : null;
    var fechada = p && (p.seq_status === 'fechada' || p.seq_status === 'pausada');
    var rodar = function () {
      hFechar();
      adm('seq_status', {id: id, status: fechada ? 'ativa' : 'fechada'}).then(function (r) {
        if (r && r.ok) recarregar(fechada ? 'Lembretes religados para esta proposta.' : 'Pronto: nenhum e-mail automático vai mais para esta proposta.');
        else aviso('Não foi possível: ' + ((r && r.erro) || 'erro'), true);
      }).catch(function () {});
    };
    hModal(fechada ? 'Reabrir os lembretes?' : 'Marcar como fechada?',
      fechada ? 'Os lembretes automáticos voltam a valer para esta proposta.' : 'Para todos os e-mails automáticos desta proposta (lembrete, último aviso e e-mails de datas especiais).', null,
      [{t: 'Cancelar', f: hFechar}, {t: fechada ? 'Reabrir' : 'Marcar como fechada', c: 'pri', f: rodar}]);
  };
  window.seqMulher = function (id) {
    var p = typeof propPorId === 'function' ? propPorId(id) : null;
    var novo = !(p && p.cliente_mulher);
    adm('mulher', {id: id, valor: novo}).then(function (r) {
      if (r && r.ok) recarregar(novo ? 'Marcada como cliente mulher.' : 'Marcação de cliente mulher removida.');
      else aviso('Não foi possível: ' + ((r && r.erro) || 'erro'), true);
    }).catch(function () {});
  };
})();
