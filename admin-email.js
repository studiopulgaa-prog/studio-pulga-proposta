// admin-email.js — acoes de e-mail no admin: enviar link por e-mail e marcar proposta como fechada
(function () {
  function api(body) {
    var token = sessionStorage.getItem('sp_token') || '';
    return fetch('/api/email-admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, erro: 'resposta invalida' }; }); });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function decodeLink(link) {
    try {
      var d = new URL(link).searchParams.get('d');
      var b = d.replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var bin = atob(b), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder('utf-8').decode(u));
    } catch (e) { return null; }
  }
  var ROTULO = { ativa: 'Sequência ativa', fechada: 'Fechada (e-mails parados)', descadastrada: 'Cliente pediu para sair', teste: 'Teste (sem lembretes)' };
  var TIPOS = { link: 'link', curiosidade: 'como funciona', vence: 'expira amanhã (9h)', vence18: 'expira amanhã (18h)', expirada: 'expirou', desconto: 'condição especial' };

  // 1) Envio do 1o e-mail com confirmacao: ativar lembretes ou so teste
  var url = document.getElementById('resultUrl');
  if (url) {
    var box = document.createElement('div');
    box.style.cssText = 'margin-top:12px;display:none;';
    box.innerHTML = '<button class="btn-out" id="btnEmailEnviar"></button>' +
      '<div id="emailConfirma" style="display:none;margin-top:10px;padding:12px;border:1.5px solid var(--br);border-radius:10px;background:#fff;">' +
      '<div id="emailPara" style="font-size:13px;margin-bottom:10px;"></div>' +
      '<div class="btn-row"><button class="btn-main" id="btnAtivar" style="margin:0;height:38px;font-size:13px;">Enviar e ativar lembretes</button>' +
      '<button class="btn-out" id="btnTeste">Enviar só este (teste, sem lembretes)</button>' +
      '<button class="btn-out" id="btnCancelaEnvio">Cancelar</button></div></div>' +
      '<div id="emailMsg" style="font-size:12px;margin-top:8px;"></div>';
    url.parentNode.insertBefore(box, url.nextSibling);
    var btn = box.querySelector('#btnEmailEnviar'), msg = box.querySelector('#emailMsg'),
        conf = box.querySelector('#emailConfirma'), para = box.querySelector('#emailPara');
    var atual = null;
    function atualizar() {
      var link = (url.textContent || '').trim();
      var data = link ? decodeLink(link) : null;
      atual = data && data.em && data.lh ? { link: link, data: data } : null;
      box.style.display = atual ? 'block' : 'none';
      msg.textContent = ''; conf.style.display = 'none';
      if (atual) { btn.disabled = false; btn.style.display = ''; btn.textContent = '✉ Enviar por e-mail para ' + atual.data.em; }
    }
    new MutationObserver(atualizar).observe(url, { childList: true, characterData: true, subtree: true });
    btn.addEventListener('click', function () {
      if (!atual) return;
      para.textContent = 'Vai para: ' + atual.data.em + ' (confira se está escrito certo). Você também recebe uma cópia.';
      conf.style.display = 'block'; btn.style.display = 'none';
    });
    box.querySelector('#btnCancelaEnvio').addEventListener('click', function () { conf.style.display = 'none'; btn.style.display = ''; });
    function enviar(modo) {
      if (!atual) return;
      conf.style.display = 'none'; msg.textContent = 'Enviando…';
      api({ acao: 'enviar', modo: modo, lh: atual.data.lh, email: atual.data.em, cliente: atual.data.nome, link: atual.link }).then(function (r) {
        if (r.ok) { msg.textContent = modo === 'teste' ? 'E-mail de teste enviado. Nenhum lembrete será enviado.' : 'E-mail enviado! Os lembretes automáticos estão programados.'; setTimeout(carregarHistorico, 600); }
        else { msg.textContent = 'Não enviou: ' + (r.erro || 'erro'); btn.style.display = ''; btn.disabled = false; }
      });
    }
    box.querySelector('#btnAtivar').addEventListener('click', function () { enviar('ativar'); });
    box.querySelector('#btnTeste').addEventListener('click', function () { enviar('teste'); });
  }

  // 2) Status do e-mail e botao "Marcar como fechado" em cada proposta do historico
  var render = window.renderHistorico;
  if (typeof render === 'function') {
    window.renderHistorico = function (lista) {
      render(lista);
      api({ acao: 'listar' }).then(function (r) {
        if (!r.ok) return;
        var mapa = {};
        (r.itens || []).forEach(function (i) { mapa[i.lh] = i; });
        lista.forEach(function (p, i) {
          var e = mapa[p.link_hash], corpo = document.getElementById('hb' + i);
          if (!e || !corpo) return;
          var enviados = Object.keys(e.enviados || {}).filter(function (k) { return TIPOS[k]; }).map(function (k) { return TIPOS[k]; }).join(', ');
          var row = document.createElement('div');
          row.className = 'hist-info';
          row.innerHTML = '<strong>E-mail</strong>' + esc(e.email) + ' · ' + esc(ROTULO[e.status] || e.status) + (enviados ? '<br><span style="font-size:11px;opacity:.7">Enviados: ' + enviados + '</span>' : '');
          var acoes = corpo.querySelector('.hist-actions');
          corpo.insertBefore(row, acoes);
          var b = document.createElement('button');
          b.className = 'btn-out';
          var novo = e.status === 'ativa' ? 'fechada' : 'ativa';
          b.textContent = e.status === 'ativa' ? '✓ Marcar como fechado' : '↺ Reativar e-mails';
          b.addEventListener('click', function () {
            b.disabled = true;
            api({ acao: 'status', lh: p.link_hash, status: novo }).then(function (x) { if (x.ok) carregarHistorico(); else { alert('Erro: ' + (x.erro || '')); b.disabled = false; } });
          });
          if (acoes && e.status !== 'descadastrada') acoes.appendChild(b);
        });
      });
    };
  }
})();
