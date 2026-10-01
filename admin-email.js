// admin-email.js — acoes de e-mail no admin: enviar link por e-mail e marcar proposta como fechada
(function () {
  function api(body) {
    body.senha = window.SENHA;
    return fetch('/api/email-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, erro: 'resposta invalida' }; }); });
  }
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
  var ROTULO = { ativa: 'Sequência ativa', fechada: 'Fechada (e-mails parados)', descadastrada: 'Cliente pediu para sair' };
  var TIPOS = { link: 'link', curiosidade: 'lembrete', vence: 'aviso de expiração', expirada: 'expirou', desconto: 'condição especial' };

  // 1) Botao "Enviar por e-mail" logo abaixo do link gerado
  var url = document.getElementById('resultUrl');
  if (url) {
    var box = document.createElement('div');
    box.style.cssText = 'margin-top:12px;display:none;';
    box.innerHTML = '<button class="btn-out" id="btnEmailEnviar"></button> <span id="emailMsg" style="font-size:12px;margin-left:6px;"></span>';
    url.parentNode.insertBefore(box, url.nextSibling);
    var btn = box.querySelector('#btnEmailEnviar'), msg = box.querySelector('#emailMsg');
    var atual = null;
    function atualizar() {
      var link = (url.textContent || '').trim();
      var data = link ? decodeLink(link) : null;
      atual = data && data.em && data.lh ? { link: link, data: data } : null;
      box.style.display = atual ? 'block' : 'none';
      msg.textContent = '';
      if (atual) { btn.disabled = false; btn.textContent = '✉ Enviar por e-mail para ' + atual.data.em; }
    }
    new MutationObserver(atualizar).observe(url, { childList: true, characterData: true, subtree: true });
    btn.addEventListener('click', function () {
      if (!atual) return;
      btn.disabled = true; msg.textContent = 'Enviando…';
      api({ acao: 'enviar', lh: atual.data.lh, email: atual.data.em, cliente: atual.data.nome, link: atual.link }).then(function (r) {
        if (r.ok) { msg.textContent = 'E-mail enviado! Os lembretes automáticos já estão programados.'; btn.textContent = '✓ Enviado'; setTimeout(carregarHistorico, 600); }
        else { msg.textContent = 'Não enviou: ' + (r.erro || 'erro'); btn.disabled = false; }
      });
    });
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
          row.innerHTML = '<strong>E-mail</strong>' + e.email + ' · ' + ROTULO[e.status] + (enviados ? '<br><span style="font-size:11px;opacity:.7">Enviados: ' + enviados + '</span>' : '');
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
          if (acoes) acoes.appendChild(b);
        });
      });
    };
  }
})();
