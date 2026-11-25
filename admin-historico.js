// admin-historico.js — "Apagar histórico" (dupla confirmação, vai para a Lixeira), "Lixeira" (restaurar / apagar de vez)
// e marcação deste aparelho como do admin (os acessos dele às propostas não contam).
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };
  // "Apagar histórico" vale para a área escolhida em Ajustes; a Lixeira segue o filtro da lista de Propostas
  var tipoArea = function () { return window.AJ_AREA === 'cd' ? 'cardapio' : 'planos'; };
  var nomeArea = function () { return tipoArea() === 'cardapio' ? 'Cardápio' : 'Planos de gestão'; };
  var tipoLx = function () { return window.P_TIPO === 'planos' || window.P_TIPO === 'cardapio' ? window.P_TIPO : ''; };
  var nomeLx = function () { return tipoLx() === 'cardapio' ? ' · Cardápio' : tipoLx() === 'planos' ? ' · Planos' : ''; };

  // ---------- Apagar histórico (lote) ----------
  // as quantidades vêm do servidor (a lista do admin agora carrega em páginas)
  function apagarHistorico() {
    histMsg('Contando as propostas…');
    adm('listar2', {tipo: tipoArea(), testes: true, limite: 1}).then(function (r) {
      if (!(r && r.ok)) return histMsg('Não foi possível contar as propostas: ' + erroTxt(r), true);
      histMsg(''); apagarModal(r.contagens || {});
    }).catch(function () {});
  }
  function apagarModal(C) {
    var conta = function (f, ativas) {
      if (f === 'canceladas') return C.canceladas || 0;
      if (f === 'expiradas') return C.expiradas || 0;
      return (C.canceladas || 0) + (C.expiradas || 0) + (ativas ? (C.ativas || 0) : 0);
    };
    var refs = hModal('Apagar histórico · ' + nomeArea(), 'As propostas escolhidas saem da lista, o link delas para de abrir e elas ficam 30 dias na Lixeira (dá para restaurar).', function (c) {
      var h = '<div class="label" style="margin-top:4px;">O que apagar</div>';
      [['expiradas', 'Só as expiradas'], ['canceladas', 'Só as canceladas'], ['todas', 'Todas (expiradas e canceladas)']].forEach(function (o, i) {
        h += '<label class="hck"><input type="radio" name="apgF" value="' + o[0] + '"' + (i === 0 ? ' checked' : '') + '><div>' + o[1] + ' <small id="apgN_' + o[0] + '"></small></div></label>';
      });
      h += '<label class="hck" id="apgAtWrap" style="display:none;"><input type="checkbox" id="apgAtivas"><div><strong style="color:#b3261e;">Incluir também as ATIVAS</strong><small>O link delas para de abrir na hora.</small></div></label>';
      h += '<label class="label" for="apgConf" style="margin-top:10px;">Para confirmar, digite APAGAR</label><input class="inp" id="apgConf" autocomplete="off" autocapitalize="characters" placeholder="APAGAR">';
      c.innerHTML = h;
      var atualiza = function () {
        var f = (c.querySelector('input[name=apgF]:checked') || {}).value || 'expiradas';
        $('apgAtWrap').style.display = f === 'todas' ? '' : 'none';
        if (f !== 'todas') $('apgAtivas').checked = false;
        ['expiradas', 'canceladas'].forEach(function (k) { $('apgN_' + k).textContent = '(' + conta(k) + ')'; });
        $('apgN_todas').textContent = '(' + conta('todas', $('apgAtivas').checked) + ')';
        var n = conta(f, $('apgAtivas').checked);
        refs.ok.textContent = 'Apagar ' + n + (n === 1 ? ' proposta' : ' propostas');
        refs.ok.disabled = !n || $('apgConf').value.trim().toUpperCase() !== 'APAGAR';
      };
      c.addEventListener('change', function (e) { if (e.target.id !== 'apgConf') atualiza(); });   // o campo de texto usa só 'input'
      c.addEventListener('input', atualiza);
      setTimeout(atualiza, 0);
    }, [
      {t: 'Cancelar', f: hFechar},
      {t: 'Apagar', id: 'ok', c: 'perigo', f: function () {
        var f = (document.querySelector('input[name=apgF]:checked') || {}).value || 'expiradas';
        var ativas = !!($('apgAtivas') && $('apgAtivas').checked);
        if ($('apgConf').value.trim().toUpperCase() !== 'APAGAR') return;
        hFechar(); histMsg('Apagando…');
        adm('apagar_lote', {tipo: tipoArea(), filtro: f, incluir_ativas: ativas, confirmacao: 'APAGAR'}).then(function (r) {
          var ok = r && r.ok;
          return hFinal(ok ? (r.n || 0) + ((r.n === 1) ? ' proposta foi' : ' propostas foram') + ' para a Lixeira.' : 'NÃO foi possível apagar: ' + erroTxt(r), !ok);
        }).catch(function () {});
      }}
    ]);
  }

  // ---------- Lixeira ----------
  function lixeira() {
    histMsg('Abrindo a Lixeira…');
    adm('lixeira', {}).then(function (r) {
      histMsg('');
      if (!r || !r.ok) { histMsg('Não foi possível abrir a Lixeira: ' + erroTxt(r), true); return; }
      var itens = (r.lista || []).filter(function (p) { return !tipoLx() || (p.tipo || 'planos') === tipoLx(); });
      hModal('Lixeira' + nomeLx(), itens.length ? 'Ficam aqui por 30 dias e depois são apagadas de vez, sozinhas.' : 'A Lixeira está vazia.', function (c) {
        c.innerHTML = itens.map(function (p) {
          return '<div class="hist-info" style="display:block;border-bottom:1px solid var(--brl);padding:8px 0;"><strong>' + escH(p.cliente) + '</strong><br>' +
            '<span>' + ((p.tipo || 'planos') === 'cardapio' ? 'Cardápio' : 'Planos') + ' · excluída em ' + escH(fmtDH(p.excluida_em)) + ' · apaga de vez em ' + escH(p.dias_restantes) + (p.dias_restantes === 1 ? ' dia' : ' dias') + (p.cancelada ? ' · estava cancelada' : '') + '</span><br>' +
            '<button class="btn-out" type="button" data-lx-res="' + escH(p.id) + '" style="margin-top:6px;">' + ICO('restore', 18) + 'Restaurar</button> ' +
            '<button class="btn-enc" type="button" data-lx-del="' + escH(p.id) + '" style="margin-top:6px;">Apagar de vez</button></div>';
        }).join('');
        c.addEventListener('click', function (e) {
          var b = e.target.closest('button'); if (!b) return;
          var id = b.getAttribute('data-lx-res') || b.getAttribute('data-lx-del');
          var p = itens.filter(function (x) { return x.id === id; })[0]; if (!p) return;
          if (b.hasAttribute('data-lx-res')) {
            hFechar(); histMsg('Restaurando…');
            adm('restaurar', {id: id}).then(function (rr) {
              var ok = rr && rr.ok && rr.ok !== false;
              return hFinal(ok ? '"' + p.cliente + '" voltou para o Histórico (o link só abre se estiver dentro da validade e não cancelada; use "Reativar" se precisar).' : 'NÃO foi possível restaurar: ' + erroTxt(rr), !ok);
            }).catch(function () {});
          } else {
            hFechar();
            hModal('Apagar "' + p.cliente + '" de vez?', 'Não dá para desfazer: a proposta, o link curto e os acessos dela são apagados.', null, [
              {t: 'Voltar', f: hFechar},
              {t: 'Apagar de vez', c: 'perigo', f: function () {
                hFechar(); histMsg('Apagando de vez…');
                adm('apagar_definitivo', {id: id}).then(function (rr) {
                  var ok = rr && rr.ok;
                  return hFinal(ok ? '"' + p.cliente + '" apagada de vez.' : 'NÃO foi possível apagar: ' + erroTxt(rr), !ok);
                }).catch(function () {});
              }}
            ]);
          }
        });
      }, [{t: 'Fechar', f: hFechar}]);
    }).catch(function () {});
  }

  if ($('btnApagarHist')) $('btnApagarHist').addEventListener('click', apagarHistorico);
  if ($('btnLixeira')) $('btnLixeira').addEventListener('click', lixeira);

  // ---------- Este aparelho é do admin: acessos às propostas não contam ----------
  // mesmo identificador anônimo da página da proposta (navegador + tela + idioma + fuso)
  function _h53(str, seed) {
    var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (var i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  function deviceIdAdmin() {
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var fp = [navigator.userAgent, navigator.language, navigator.platform, screen.width + 'x' + screen.height, window.devicePixelRatio || 1, screen.colorDepth, navigator.hardwareConcurrency || 0, tz].join('|');
    return 'd2_' + _h53(fp, 1) + _h53(fp, 2);
  }
  function marcarAparelho() {
    try { localStorage.setItem('sp_nao_contar', '1'); } catch (e) {}
    var h = deviceIdAdmin(), feito = '';
    try { feito = localStorage.getItem('sp_disp_admin') || ''; } catch (e) {}
    if (feito === h) return;
    adm('ignorar_disp', {hash: h}).then(function (r) { if (r && r.ok) try { localStorage.setItem('sp_disp_admin', h); } catch (e) {} }).catch(function () {});
  }
  window.spMarcarAparelhoAdmin = marcarAparelho;
  // quando o painel aparece (login feito ou sessão restaurada)
  var wrap = $('adminWrap');
  if (wrap) {
    var tentar = function () { if (wrap.style.display !== 'none' && wrap.offsetParent !== null) { marcarAparelho(); return true; } return false; };
    if (!tentar()) { var mo = new MutationObserver(function () { if (tentar()) mo.disconnect(); }); mo.observe(wrap, {attributes: true, attributeFilter: ['style']}); }
  }
})();
