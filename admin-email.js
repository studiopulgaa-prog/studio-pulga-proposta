// admin-email.js — acoes de e-mail no admin: enviar link por e-mail e marcar proposta como fechada
(function () {
  function api(body) {
    var token = sessionStorage.getItem('sp_token') || '';
    var h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    // /api/admin/email = mesma funcao de e-mail, mas dentro do caminho onde o cookie de 30 dias (HttpOnly) e enviado
    return fetch('/api/admin/email', { method: 'POST', credentials: 'same-origin', headers: h, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, erro: 'resposta invalida' }; }); });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function decodeLink(link) {
    try {
      var d = new URL(link).searchParams.get('d');
      // link compacto (z0, ou z~ dos links antigos): os dados vêm do que o admin acabou de gerar
      if (d.slice(0, 2) === 'z~' || d.slice(0, 2) === 'z0') { var u0 = window.SP_ULTIMO; return u0 && u0.link === link && u0.data && u0.data.tipo !== 'cardapio' ? u0.data : null; }
      var b = d.replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var bin = atob(b), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      var dd = JSON.parse(new TextDecoder('utf-8').decode(u));
      // cardapio: os textos dos e-mails automaticos ainda falam de "pacotes", entao nao oferece o envio
      return dd && dd.tipo === 'cardapio' ? null : dd;
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
    // o botao de e-mail fica sempre visivel: depois do bloco do link completo (que pode estar recolhido)
    var refBox = document.getElementById('shortWrap') || url;
    refBox.parentNode.insertBefore(box, refBox.nextSibling);
    var btn = box.querySelector('#btnEmailEnviar'), msg = box.querySelector('#emailMsg'),
        conf = box.querySelector('#emailConfirma'), para = box.querySelector('#emailPara');
    var atual = null;
    function atualizar() {
      var link = (url.textContent || '').trim();
      var data = link ? decodeLink(link) : null;
      atual = data && data.em && data.lh ? { link: link, data: data } : null;
      box.style.display = atual ? 'block' : 'none';
      msg.textContent = ''; conf.style.display = 'none';
      if (atual) { btn.disabled = false; btn.style.display = ''; btn.textContent = 'Outras opções de envio (lembretes ou só teste)'; }
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

  // 2) (antigo) status do e-mail dentro do Histórico em sanfona: agora fica na tela de Detalhe da proposta
  //    ("Cliente fechou", "Pausar e-mails" e "E-mails desta proposta"), que usa a mesma marcação no servidor.
})();
