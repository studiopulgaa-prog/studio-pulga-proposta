// admin-conteudo.js — aba "Conteúdo": textos da página do cliente (por modelo), e-mails, datas especiais, WhatsApp e dados gerais.
// Rascunho e publicação passam por /api/admin (sessão). Cada publicação vira uma versão (com "Voltar para esta versão").
// Tudo é texto: **negrito** e quebras de linha. Nada de HTML. Na tela, sempre textContent (ou o mesmo escape da página).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var F = window.SP_CAMPOS;
  function E(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function B(c, x, f) { var b = E('button', c, x); b.type = 'button'; if (f) b.addEventListener('click', f); return b; }
  var copia = function (o) { return JSON.parse(JSON.stringify(o == null ? null : o)); };
  var EMAILS = [['link', 'Envio do link', 'sua-proposta'], ['lembrete', 'Lembrete', 'lembrete'], ['ultimo_amanha', 'Último aviso · amanhã', 'ultimo-amanha'], ['ultimo_hoje', 'Último aviso · hoje', 'ultimo-hoje']];
  var PUBLICO = [['todos', 'Todos'], ['arquitetos', 'Arquitetos'], ['mulheres', 'Mulheres'], ['construtoras', 'Construtoras'], ['lojas', 'Lojas']];
  var SECOES = [];
  F.modelos.forEach(function (m) { SECOES.push({id: 'pagina:' + m[0], g: 'Página', t: m[1]}); });
  EMAILS.forEach(function (m) { SECOES.push({id: 'email:' + m[0], g: 'E-mails', t: m[1]}); });
  SECOES.push({id: 'campanhas', g: 'E-mails', t: 'Datas especiais'});
  SECOES.push({id: 'whatsapp', g: 'WhatsApp', t: 'Mensagens'});
  SECOES.push({id: 'gerais', g: 'Dados gerais', t: 'Contato e assinatura'});
  SECOES.push({id: 'versoes', g: 'Histórico', t: 'Versões publicadas'});

  var S = {srv: null, P: null, D: {}, pub: {}, sec: 'pagina:arq', sujo: false, carregando: false, prevT: null, prevSeq: 0, campSel: null};
  window.SP_CONTEUDO = null;   // textos publicados (o WhatsApp manual do Detalhe lê daqui)

  // ---------- leitura e escrita do rascunho (só o que difere do original) ----------
  function defEmail(k, c) { return ((S.P && S.P.emails && S.P.emails[k]) || {})[c] || ''; }
  function defCampos(lista, k) { for (var i = 0; i < lista.length; i++) if (lista[i].k === k) return lista[i]; return null; }
  function obter(sec, sub, k, def) {
    var o = S.D[sec]; if (sub) o = o && o[sub];
    return o && o[k] != null ? o[k] : def;
  }
  function gravar(sec, sub, k, v, def) {
    var o = S.D[sec] || (S.D[sec] = {}); if (sub) o = o[sub] || (o[sub] = {});
    if (v === def) delete o[k]; else o[k] = v;
    if (sub && !Object.keys(o).length) delete S.D[sec][sub];
    if (!Object.keys(S.D[sec]).length) delete S.D[sec];
    marcaSujo();
  }
  function marcaSujo() { S.sujo = true; status(); agendaPrevia(); }
  function campanhas() { return (S.D.campanhas && S.D.campanhas.itens) || copia(S.P.campanhas.itens); }
  function campDef(id) { var L = S.P.campanhas.itens; for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; }
  function gravaCampanhas(L) {
    if (JSON.stringify(L) === JSON.stringify(S.P.campanhas.itens)) delete S.D.campanhas; else S.D.campanhas = {itens: L};
    marcaSujo();
  }

  // ---------- validação ----------
  var VAR_OK = /^\[(nome|data|link|item|valor)\]$/i;
  function avisos(t) {
    var a = [], m = String(t || '').match(/\[[^\]\n]{1,30}\]/g) || [];
    m.forEach(function (x) { if (!VAR_OK.test(x)) a.push('Variável desconhecida ' + x + ' (use [Nome], [data], [link], [item] ou [valor])'); });
    if ((String(t || '').match(/\*\*/g) || []).length % 2) a.push('Negrito sem fechar: falta um **');
    if (/<\s*\/?\s*[a-z!]/i.test(String(t || ''))) a.push('Sem HTML: use só texto (o < > vira texto)');
    return a;
  }
  function erros() {
    var L = [];
    EMAILS.forEach(function (m) { ['assunto', 'corpo'].forEach(function (c) { if (!String(obter('emails', m[0], c, defEmail(m[0], c))).trim()) L.push('E-mail ' + m[1] + ': ' + (c === 'assunto' ? 'assunto' : 'texto') + ' em branco'); }); });
    F.whatsapp.forEach(function (c) { if (!String(obter('whatsapp', null, c.k, c.def)).trim()) L.push('WhatsApp ' + c.rot + ': em branco'); });
    F.gerais.forEach(function (c) {
      var v = String(obter('gerais', null, c.k, c.def)).trim();
      if (c.req && !v) L.push('Dados gerais: ' + c.rot + ' em branco');
      if (c.k === 'telefone' && v && !/^[\d\s()+-]{8,20}$/.test(v)) L.push('Telefone: só números, espaço, ( ) e -');
      if (c.k === 'whatsapp' && v) { var d = v.replace(/\D/g, ''); if (!/^(55)?\d{10,11}$/.test(d) || /[^\d\s()+-]/.test(v)) L.push('WhatsApp do estúdio: DDD + número (só números)'); }
    });
    campanhas().forEach(function (c) {
      var n = 'Data especial "' + (c.assunto || c.id) + '"';
      if (!String(c.assunto || '').trim()) L.push(n + ': assunto em branco');
      if (!String(c.corpo || '').trim()) L.push(n + ': texto em branco');
      if (c.data && !/^\d{4}-\d{2}-\d{2}$/.test(c.data)) L.push(n + ': data inválida');
      if (c.anual && !/^\d{2}-\d{2}$/.test(c.anual)) L.push(n + ': dia/mês inválido');
      if (!c.data && !c.anual) L.push(n + ': sem data');
    });
    F.modelos.forEach(function (m) { F.pagina[m[0]].forEach(function (c) { var v = obter('pagina', m[0], c.k, c.def); if (c.def && !String(v).trim()) L.push('Página ' + m[1] + ': "' + c.rot + '" em branco (use Restaurar original)'); }); });
    return L;
  }

  // ---------- servidor ----------
  function carregar() {
    if (S.carregando) return Promise.resolve();
    S.carregando = true;
    return adm('conteudo_get', {}).then(function (r) {
      S.carregando = false;
      if (!(r && r.ok)) { var c = $('ctCorpo'); if (c) { c.textContent = ''; c.appendChild(E('div', 'empty', 'Não foi possível carregar o conteúdo: ' + ((r && r.erro) || 'sem resposta'))); } return; }
      S.srv = r; S.P = r.padrao;
      S.pub = (r.atual && r.atual.dados) || {};
      window.SP_CONTEUDO = S.pub;
      if (!S.sujo) S.D = copia(r.rascunho || S.pub || {}) || {};
      render();
    }).catch(function () { S.carregando = false; });
  }
  window.ctCarregar = carregar;
  // os textos publicados chegam logo após o login (WhatsApp manual usa)
  window.ctPublicados = function () { if (!S.srv) carregar(); };

  function salvar(msg) {
    var e = $('ctSalvar'); if (e) e.disabled = true;
    return adm('conteudo_rascunho', {dados: S.D}).then(function (r) {
      if (e) e.disabled = false;
      if (r && r.ok) { S.sujo = false; S.srv.rascunho = copia(S.D); S.srv.rascunho_em = r.em; status(); histMsg(msg || 'Rascunho salvo. Nada mudou para os clientes ainda.'); }
      else histMsg('Não foi possível salvar: ' + ((r && r.erro) || 'erro'), true);
      return r;
    }).catch(function () { if (e) e.disabled = false; });
  }

  // ---------- resumo das mudanças (para a publicação e o histórico) ----------
  function achata(o, pre, out) {
    out = out || {};
    Object.keys(o || {}).forEach(function (k) { var v = o[k], p = pre ? pre + '.' + k : k; if (v && typeof v === 'object' && !Array.isArray(v)) achata(v, p, out); else out[p] = JSON.stringify(v); });
    return out;
  }
  function rotulo(p) {
    var a = p.split('.');
    if (a[0] === 'pagina') { var m = F.modelos.filter(function (x) { return x[0] === a[1]; })[0]; var c = defCampos(F.pagina[a[1]] || [], a[2]); return 'Página ' + (m ? m[1] : a[1]) + ' · ' + (c ? c.rot : a[2]); }
    if (a[0] === 'emails') { var e = EMAILS.filter(function (x) { return x[0] === a[1]; })[0]; return 'E-mail ' + (e ? e[1] : a[1]) + ' · ' + ({assunto: 'assunto', pre: 'pré-cabeçalho', corpo: 'texto'}[a[2]] || a[2]); }
    if (a[0] === 'whatsapp') { var w = defCampos(F.whatsapp, a[1]); return 'WhatsApp · ' + (w ? w.rot : a[1]); }
    if (a[0] === 'gerais') { var g = defCampos(F.gerais, a[1]); return 'Dados gerais · ' + (g ? g.rot : a[1]); }
    if (a[0] === 'campanhas') return 'Datas especiais';
    return p;
  }
  function mudancas(de, para) {
    var A = achata(de), Bm = achata(para), L = [], vist = {};
    Object.keys(A).concat(Object.keys(Bm)).forEach(function (k) { if (vist[k]) return; vist[k] = 1; if (A[k] !== Bm[k]) { var r = rotulo(k); if (L.indexOf(r) < 0) L.push(r); } });
    return L;
  }

  // ---------- publicar ----------
  function publicar(resumoExtra) {
    var er = erros();
    if (er.length) {
      hModal('Corrija antes de publicar', 'Campos obrigatórios em branco ou com formato errado:', function (c) { var u = E('ul', 'ct-err'); er.slice(0, 12).forEach(function (x) { u.appendChild(E('li', null, x)); }); c.appendChild(u); }, [{t: 'Entendi', c: 'pri', f: hFechar}]);
      return;
    }
    var L = mudancas(S.pub, S.D);
    if (!L.length) { histMsg('Nada mudou em relação ao que está publicado.'); return; }
    var av = [];
    var junta = function (t) { avisos(t).forEach(function (x) { if (av.indexOf(x) < 0) av.push(x); }); };
    Object.values(achata(S.D)).forEach(function (j) { try { junta(JSON.parse(j)); } catch (e) {} });
    hModal('Publicar alterações?', 'Vale para as propostas NOVAS. As propostas já enviadas continuam com os textos de antes, a menos que você marque abaixo.', function (c) {
      c.appendChild(E('div', 'label', 'O que muda (' + L.length + '):'));
      var u = E('ul', 'ct-mud'); L.slice(0, 14).forEach(function (x) { u.appendChild(E('li', null, x)); }); if (L.length > 14) u.appendChild(E('li', null, '… e mais ' + (L.length - 14))); c.appendChild(u);
      if (av.length) { var w = E('div', 'ct-aviso'); w.appendChild(E('b', null, 'Atenção: ')); w.appendChild(document.createTextNode(av.slice(0, 3).join(' · '))); c.appendChild(w); }
      var ck = E('label', 'ck-l ct-ativas'); var i = E('input'); i.type = 'checkbox'; i.id = 'ctAtivas'; ck.appendChild(i);
      ck.appendChild(E('span', null, 'Aplicar também às propostas ativas')); c.appendChild(ck);
      c.appendChild(E('div', 'ct-aviso-a', 'Se marcar: quem já recebeu o link e abrir de novo vê os textos novos da página. E-mails automáticos e mensagens de WhatsApp sempre usam a versão publicada mais recente.'));
    }, [{t: 'Voltar', f: hFechar}, {t: 'Publicar', c: 'pri', f: function (b) {
      var ativas = !!($('ctAtivas') && $('ctAtivas').checked);
      b.disabled = true;
      var resumo = (resumoExtra ? resumoExtra + ' · ' : '') + L.join('; ');
      adm('conteudo_publicar', {dados: S.D, resumo: resumo.slice(0, 1900), ativas: ativas}).then(function (r) {
        b.disabled = false; hFechar();
        if (!(r && r.ok)) return histMsg('Não foi possível publicar: ' + ((r && r.erro) || 'erro'), true);
        S.sujo = false;
        histMsg('Publicado (versão ' + r.id + ')' + (ativas ? ' e aplicado a ' + (r.ativas || 0) + ' proposta(s) ativa(s).' : '. Vale para as propostas novas.'));
        carregar();
      }).catch(function () { b.disabled = false; });
    }}]);
  }

  // ---------- tela ----------
  function status() {
    var s = $('ctStatus'); if (!s || !S.srv) return;
    var a = S.srv.atual, t = a ? 'Publicado: versão ' + a.id + ' · ' + fmtDH(a.criado_em) : 'Nada publicado ainda: a página e os e-mails usam os textos de fábrica';
    var dif = mudancas(S.pub, S.D).length;
    s.textContent = t + (dif ? ' · ' + dif + ' alteração(ões) ainda não publicada(s)' : '') + (S.sujo ? ' · rascunho não salvo' : '');
    s.className = 'ct-status' + (S.sujo || dif ? ' al' : '');
  }
  function render() {
    var w = $('ctCorpo'); if (!w || !S.srv) return;
    w.textContent = '';
    var bar = E('div', 'ct-bar');
    bar.appendChild(E('div', 'ct-status', '')).id = 'ctStatus';
    var bb = E('div', 'ct-bb');
    var bs = B('btn-out', 'Salvar rascunho', function () { salvar(); }); bs.id = 'ctSalvar'; bb.appendChild(bs);
    var bp = B('btn-out ok', 'Publicar', function () { publicar(); }); bp.id = 'ctPublicar'; bb.appendChild(bp);
    bar.appendChild(bb); w.appendChild(bar);
    var g = E('div', 'ct-grid');
    // lista de seções (no celular vira um seletor)
    var nav = E('div', 'ct-nav');
    var sel = E('select', 'inp ct-sel'); sel.id = 'ctSel'; sel.setAttribute('aria-label', 'Seção');
    var gAtual = null, og = null;
    SECOES.forEach(function (x) {
      if (x.g !== gAtual) { gAtual = x.g; nav.appendChild(E('div', 'ct-g', x.g)); og = E('optgroup'); og.label = x.g; sel.appendChild(og); }
      var b = B('ct-it' + (x.id === S.sec ? ' on' : ''), x.t, function () { abre(x.id); }); b.setAttribute('data-sec', x.id);
      if (x.id === S.sec) b.setAttribute('aria-current', 'true');
      if (mudouSec(x.id)) b.appendChild(E('span', 'ct-dot', '•')).title = 'Alterado';
      nav.appendChild(b);
      var o = E('option', null, x.t); o.value = x.id; if (x.id === S.sec) o.selected = true; og.appendChild(o);
    });
    sel.addEventListener('change', function () { abre(sel.value); });
    w.appendChild(sel);
    g.appendChild(nav);
    var ed = E('div', 'ct-ed'); ed.id = 'ctEd'; g.appendChild(ed);
    var pv = E('div', 'ct-pv'); pv.id = 'ctPv'; g.appendChild(pv);
    w.appendChild(g);
    var bpv = B('btn-out ct-pvb', 'Ver prévia', abrePreviaCel); bpv.id = 'ctPvBtn'; w.appendChild(bpv);
    status(); editor(); previa(true);
  }
  function mudouSec(id) {
    var a = id.split(':');
    if (a[0] === 'pagina') return !!(S.D.pagina && S.D.pagina[a[1]] && Object.keys(S.D.pagina[a[1]]).length);
    if (a[0] === 'email') return !!(S.D.emails && S.D.emails[a[1]] && Object.keys(S.D.emails[a[1]]).length);
    if (a[0] === 'campanhas') return !!S.D.campanhas;
    if (a[0] === 'whatsapp') return !!(S.D.whatsapp && Object.keys(S.D.whatsapp).length);
    if (a[0] === 'gerais') return !!(S.D.gerais && Object.keys(S.D.gerais).length);
    return false;
  }
  function abre(id) {
    S.sec = id; S.campSel = null;
    document.querySelectorAll('#ctCorpo .ct-it').forEach(function (b) { var on = b.getAttribute('data-sec') === id; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    if ($('ctSel')) $('ctSel').value = id;
    editor(); previa(true);
  }

  // um campo de texto com: negrito, variáveis, "Restaurar original" e avisos
  function campo(box, o) {
    // o: {rot, def, valor, ta, max, vars, req, set(v), dica}
    var f = E('div', 'field ct-f');
    var hd = E('div', 'ct-fh'); var id = 'ct_' + Math.random().toString(36).slice(2, 9);
    var lb = E('label', 'label', o.rot); lb.htmlFor = id; hd.appendChild(lb);
    var mod = o.valor !== o.def;
    if (mod) hd.appendChild(E('span', 'ct-mod', 'alterado'));
    f.appendChild(hd);
    var inp = o.ta ? E('textarea', 'inp ct-ta') : E('input', 'inp'); inp.id = id;
    if (!o.ta) inp.type = 'text';
    inp.value = o.valor; if (o.max) inp.maxLength = o.max;
    if (o.ta) inp.rows = Math.min(10, Math.max(3, Math.ceil(String(o.valor).length / 46) + (String(o.valor).match(/\n/g) || []).length));
    var tb = E('div', 'ct-tb');
    var bB = B('ct-ch ct-b', 'B', function () { envolve(inp, '**'); }); bB.setAttribute('aria-label', 'Negrito'); bB.title = 'Negrito (**texto**)'; tb.appendChild(bB);
    if (o.vars) F.VARS.forEach(function (v) { var c = B('ct-ch', '[' + v + ']', function () { insere(inp, '[' + v + ']'); }); c.setAttribute('aria-label', 'Inserir ' + v); tb.appendChild(c); });
    if (o.def !== '' || mod) { var rs = B('lnk ct-rs', 'Restaurar original', function () { inp.value = o.def; muda(); }); rs.hidden = !mod; tb.appendChild(rs); }
    f.appendChild(tb); f.appendChild(inp);
    var av = E('div', 'ct-av'); av.setAttribute('role', 'status'); f.appendChild(av);
    if (o.dica) f.appendChild(E('div', 'ct-dica', o.dica));
    function muda() {
      var v = inp.value; o.set(v);
      var m = v !== o.def, rs = tb.querySelector('.ct-rs'); if (rs) rs.hidden = !m;
      var tag = hd.querySelector('.ct-mod'); if (m && !tag) hd.appendChild(E('span', 'ct-mod', 'alterado')); if (!m && tag) tag.remove();
      var a = avisos(v); if (o.req && !v.trim()) a.unshift('Campo obrigatório: não pode ficar em branco');
      if (!o.vars && /\[(nome|data|link|item|valor)\]/i.test(v)) a.push('Variáveis não funcionam neste campo');
      av.textContent = a.join(' · '); f.classList.toggle('ct-warn', !!a.length);
    }
    inp.addEventListener('input', muda);
    if (o.sel) inp.addEventListener('focus', function () {   // a prévia rola até o texto que está sendo editado
      try { var fr = document.querySelector('#ctPv iframe.ct-pg'), el = fr && fr.contentDocument && fr.contentDocument.querySelector(o.sel.split(',')[0]); if (el && el.offsetParent) el.scrollIntoView({block: 'center'}); } catch (e) {}
    });
    var a0 = avisos(o.valor); if (a0.length) { av.textContent = a0.join(' · '); f.classList.add('ct-warn'); }
    box.appendChild(f);
    return inp;
  }
  function insere(inp, t) { var a = inp.selectionStart || 0, b = inp.selectionEnd || 0; inp.setRangeText ? inp.setRangeText(t, a, b, 'end') : (inp.value += t); inp.focus(); inp.dispatchEvent(new Event('input')); }
  function envolve(inp, m) {
    var a = inp.selectionStart || 0, b = inp.selectionEnd || 0, s = inp.value.slice(a, b) || 'texto';
    inp.setRangeText(m + s + m, a, b, 'select'); inp.focus(); inp.dispatchEvent(new Event('input'));
  }

  function editor() {
    var ed = $('ctEd'); if (!ed) return; ed.textContent = '';
    var a = S.sec.split(':');
    var hd = E('div', 'ct-edh'); var sx = SECOES.filter(function (x) { return x.id === S.sec; })[0];
    hd.appendChild(E('span', 'mk', '// ' + sx.g.toLowerCase())); hd.appendChild(E('h2', 'ct-tt', sx.t)); ed.appendChild(hd);
    if (a[0] === 'pagina') {
      var m = a[1];
      ed.appendChild(E('p', 'card-sub', 'Textos fixos da página do cliente neste modelo. Em branco ou igual ao original = a página fica como está. Os pacotes, itens, valores (De/Para) e os textos do Especial Milão ficam em Ajustes › Padrões.'));
      var gr = null;
      F.pagina[m].forEach(function (c) {
        if (c.g !== gr) { gr = c.g; ed.appendChild(E('div', 'ct-sub', gr)); }
        campo(ed, {rot: c.rot, def: c.def, sel: c.sel, valor: obter('pagina', m, c.k, c.def), ta: c.ta, max: c.max, set: function (v) { gravar('pagina', m, c.k, v, c.def); }});
      });
      var pad = B('btn-out', 'Abrir Padrões (pacotes, itens e valores)', function () { irPara('ajustes'); var bt = document.querySelector('#scrAjustes [data-aj="' + (m === 'cd' || m === 'mi' ? 'cd' : 'pl') + '"]'); if (bt) bt.click(); });
      pad.style.width = '100%'; ed.appendChild(pad);
      if (m === 'cd' || m === 'mi') ed.appendChild(E('p', 'ct-dica', 'A página não tem perguntas frequentes (FAQ). Se quiser uma seção de FAQ, ela precisa ser criada antes.'));
    } else if (a[0] === 'email') {
      var k = a[1];
      ed.appendChild(E('p', 'card-sub', 'Variáveis: [Nome] vira o primeiro nome do cliente, [data] a validade, [link] o endereço da proposta. Linha em branco = novo parágrafo. O botão "Ver minha proposta" e o rodapé continuam automáticos.'));
      campo(ed, {rot: 'Assunto', def: defEmail(k, 'assunto'), valor: obter('emails', k, 'assunto', defEmail(k, 'assunto')), max: 200, vars: true, req: true, set: function (v) { gravar('emails', k, 'assunto', v, defEmail(k, 'assunto')); }});
      campo(ed, {rot: 'Pré-cabeçalho (aparece ao lado do assunto na caixa de entrada)', def: defEmail(k, 'pre'), valor: obter('emails', k, 'pre', defEmail(k, 'pre')), max: 200, vars: true, set: function (v) { gravar('emails', k, 'pre', v, defEmail(k, 'pre')); }});
      campo(ed, {rot: 'Texto', def: defEmail(k, 'corpo'), valor: obter('emails', k, 'corpo', defEmail(k, 'corpo')), ta: true, max: 4000, vars: true, req: true, set: function (v) { gravar('emails', k, 'corpo', v, defEmail(k, 'corpo')); }});
      if (k === 'ultimo_amanha') ed.appendChild(E('p', 'ct-dica', 'Quando a véspera cai em fim de semana ou feriado, o aviso sai antes, com o texto de fábrica ("vence em [data]").'));
      botaoTeste(ed);
    } else if (a[0] === 'campanhas') {
      edCampanhas(ed);
    } else if (a[0] === 'whatsapp') {
      ed.appendChild(E('p', 'card-sub', 'Mensagens do botão WhatsApp no Detalhe da proposta. Você ainda pode editar o texto antes de enviar.'));
      F.whatsapp.forEach(function (c) { campo(ed, {rot: c.rot, def: c.def, valor: obter('whatsapp', null, c.k, c.def), ta: true, max: c.max, vars: true, req: true, set: function (v) { gravar('whatsapp', null, c.k, v, c.def); }}); });
    } else if (a[0] === 'gerais') {
      ed.appendChild(E('p', 'card-sub', 'Aparecem no rodapé e na assinatura dos e-mails. O WhatsApp do estúdio vale para os botões da página e dos e-mails.'));
      F.gerais.forEach(function (c) {
        var i = campo(ed, {rot: c.rot, def: c.def, valor: obter('gerais', null, c.k, c.def), ta: c.ta, max: c.max, req: c.req, set: function (v) { gravar('gerais', null, c.k, v, c.def); }});
        if (c.tel) { i.inputMode = 'tel'; }
      });
      botaoTeste(ed, 'lembrete');
    } else if (a[0] === 'versoes') edVersoes(ed);
  }

  function edCampanhas(ed) {
    ed.appendChild(E('p', 'card-sub', 'E-mails de datas especiais para quem teve proposta que expirou sem fechar. [Nome] vira o primeiro nome. Quem escolheu ou fechou não recebe.'));
    var L = campanhas();
    if (!S.campSel || !L.some(function (c) { return c.id === S.campSel; })) S.campSel = L[0] && L[0].id;
    var lst = E('div', 'ct-camps');
    L.forEach(function (c) {
      var b = B('ct-camp' + (c.id === S.campSel ? ' on' : '') + (c.ligado === false ? ' off' : ''), null, function () { S.campSel = c.id; editor(); previa(true); });
      b.appendChild(E('b', null, c.assunto || '(sem assunto)'));
      b.appendChild(E('span', null, (c.data ? c.data.split('-').reverse().join('/') : 'todo ano em ' + String(c.anual || '').split('-').reverse().join('/')) + ' · ' + ((PUBLICO.filter(function (p) { return p[0] === c.publico; })[0] || [0, c.publico])[1]) + (c.ligado === false ? ' · desligada' : '')));
      lst.appendChild(b);
    });
    ed.appendChild(lst);
    ed.appendChild(B('btn-out', '+ Nova data especial', function () {
      var L2 = campanhas(), id = 'nova-' + Date.now().toString(36);
      var d = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      L2.push({id: id, data: d, publico: 'todos', assunto: 'Novo e-mail', corpo: 'Olá! Escreva aqui o texto do e-mail.', botao: '', ligado: false});
      S.campSel = id; gravaCampanhas(L2); editor(); previa(true);
    }));
    var c = L.filter(function (x) { return x.id === S.campSel; })[0]; if (!c) return;
    var def = campDef(c.id) || {assunto: '', corpo: '', botao: ''};
    var box = E('div', 'card ct-cbox'); ed.appendChild(box);
    var set = function (k, v) { var L2 = campanhas(); L2.forEach(function (x) { if (x.id === c.id) { if (v === undefined) delete x[k]; else x[k] = v; } }); gravaCampanhas(L2); };
    var lig = E('label', 'ck-l'); var ci = E('input'); ci.type = 'checkbox'; ci.checked = c.ligado !== false; lig.appendChild(ci); lig.appendChild(E('span', null, 'Ligada (envia na data)')); box.appendChild(lig);
    ci.addEventListener('change', function () { set('ligado', ci.checked); editor(); });
    // data: única ou todo ano
    var dt = E('div', 'ct-dt');
    var tp = E('select', 'inp'); tp.setAttribute('aria-label', 'Tipo de data');
    [['data', 'Data única'], ['anual', 'Todo ano']].forEach(function (x) { var o = E('option', null, x[1]); o.value = x[0]; if ((c.anual ? 'anual' : 'data') === x[0]) o.selected = true; tp.appendChild(o); });
    var di = E('input', 'inp'); di.type = 'date'; di.setAttribute('aria-label', 'Data de envio');
    di.value = c.data || ('2027-' + (c.anual || '01-01'));
    var upd = function () {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(di.value)) return;
      var L2 = campanhas(); L2.forEach(function (x) { if (x.id !== c.id) return; delete x.data; delete x.anual; if (tp.value === 'anual') x.anual = di.value.slice(5); else x.data = di.value; }); gravaCampanhas(L2);
    };
    tp.addEventListener('change', upd); di.addEventListener('change', upd);
    var l1 = E('label', 'label', 'Quando enviar'); box.appendChild(l1); dt.appendChild(tp); dt.appendChild(di); box.appendChild(dt);
    var lp = E('label', 'label', 'Para quem'); lp.htmlFor = 'ctPub'; box.appendChild(lp);
    var pu = E('select', 'inp'); pu.id = 'ctPub';
    PUBLICO.forEach(function (p) { var o = E('option', null, p[1]); o.value = p[0]; if (c.publico === p[0]) o.selected = true; pu.appendChild(o); });
    pu.addEventListener('change', function () { set('publico', pu.value); });
    box.appendChild(pu);
    campo(box, {rot: 'Assunto', def: def.assunto, valor: c.assunto || '', max: 200, vars: true, req: true, set: function (v) { set('assunto', v); }});
    campo(box, {rot: 'Texto', def: def.corpo, valor: c.corpo || '', ta: true, max: 4000, vars: true, req: true, set: function (v) { set('corpo', v); }});
    campo(box, {rot: 'Texto do botão (opcional; abre o WhatsApp)', def: def.botao || '', valor: c.botao || '', max: 60, set: function (v) { set('botao', v); }});
    var ac = E('div', 'ct-acs');
    if (campDef(c.id)) ac.appendChild(B('lnk', 'Restaurar original desta data', function () { var L2 = campanhas().map(function (x) { return x.id === c.id ? copia(campDef(c.id)) : x; }); gravaCampanhas(L2); editor(); previa(true); }));
    else ac.appendChild(B('lnk ct-del', 'Excluir esta data', function () { var L2 = campanhas().filter(function (x) { return x.id !== c.id; }); S.campSel = null; gravaCampanhas(L2); editor(); previa(true); }));
    box.appendChild(ac);
    botaoTeste(ed, 'camp-' + c.id);
  }

  function edVersoes(ed) {
    ed.appendChild(E('p', 'card-sub', 'Cada publicação vira uma versão. "Voltar para esta versão" traz os textos dela para o rascunho; depois é só publicar.'));
    var V = (S.srv && S.srv.versoes) || [];
    if (!V.length) ed.appendChild(E('div', 'empty', 'Nenhuma versão publicada ainda.'));
    var l = E('div', 'ct-vers');
    V.forEach(function (v, i) {
      var r = E('div', 'ct-ver');
      var t = E('div'); t.appendChild(E('b', null, 'Versão ' + v.id + (i === 0 ? ' · em uso' : '')));
      t.appendChild(E('span', null, fmtDH(v.criado_em) + (v.aplicou_ativas ? ' · aplicada a ' + v.aplicou_ativas + ' ativa(s)' : '')));
      if (v.resumo) t.appendChild(E('small', null, v.resumo));
      r.appendChild(t);
      if (i > 0 || mudancas(S.pub, S.D).length) r.appendChild(B('btn-out', 'Voltar para esta versão', function () { voltarVersao(v.id); }));
      l.appendChild(r);
    });
    ed.appendChild(l);
    ed.appendChild(B('btn-out ct-fab', 'Restaurar tudo para os textos de fábrica', function () {
      hModal('Voltar tudo para os textos de fábrica?', 'O rascunho fica igual ao original (página, e-mails, datas especiais, WhatsApp e dados gerais). Nada muda para os clientes até você publicar.', null,
        [{t: 'Voltar', f: hFechar}, {t: 'Restaurar no rascunho', c: 'pri', f: function () { hFechar(); S.D = {}; marcaSujo(); render(); histMsg('Rascunho com os textos de fábrica. Publique para valer.'); }}]);
    }));
  }
  function voltarVersao(id) {
    adm('conteudo_versao', {versao: id}).then(function (r) {
      if (!(r && r.ok)) return histMsg('Não foi possível abrir a versão: ' + ((r && r.erro) || 'erro'), true);
      S.D = copia(r.dados || {}); marcaSujo(); render();
      publicar('Voltou para a versão ' + id);
    });
  }

  // ---------- prévia ----------
  function modeloEmailAtual() {
    var a = S.sec.split(':');
    if (a[0] === 'email') return EMAILS.filter(function (m) { return m[0] === a[1]; })[0][2];
    if (a[0] === 'campanhas') return S.campSel ? 'camp-' + S.campSel : null;
    if (a[0] === 'gerais') return 'lembrete';
    return null;
  }
  function botaoTeste(box, mod) {
    var b = B('btn-out ct-teste', 'Enviar teste para mim', function () {
      var m = mod || modeloEmailAtual(); if (!m) return;
      b.disabled = true; b.textContent = 'Enviando…';
      apiEmails('teste', {modelo: m, conteudo: S.D}).then(function (r) {
        b.disabled = false; b.textContent = 'Enviar teste para mim';
        histMsg(r && r.ok ? 'Teste enviado para ' + r.para + ' (com o rascunho).' : 'Não foi possível: ' + ((r && r.erro) || 'erro'), !(r && r.ok));
      });
    });
    box.appendChild(b);
  }
  function apiEmails(acao, dados) {
    var h = {'Content-Type': 'application/json'};
    if (typeof TOKEN !== 'undefined' && TOKEN) h['Authorization'] = 'Bearer ' + TOKEN;
    return fetch('/api/admin/emails', {method: 'POST', credentials: 'same-origin', headers: h, body: JSON.stringify(Object.assign({acao: acao}, dados || {}))})
      .then(function (r) { return r.json().catch(function () { return {ok: false, erro: 'HTTP ' + r.status}; }); })
      .catch(function () { return {ok: false, erro: 'sem conexão'}; });
  }
  function agendaPrevia() { clearTimeout(S.prevT); S.prevT = setTimeout(function () { previa(false); }, 450); }
  // o quadro da página lê daqui (proposta-conteudo.js, modo prévia)
  window.SP_PREVIA = {
    nome: 'Cliente Teste',
    pagina: function () { return copia((S.D && S.D.pagina) || {}); },
    zap: function () { var z = String(obter('gerais', null, 'whatsapp', '5513996057099')).replace(/\D/g, ''); return /^\d{10,11}$/.test(z) ? '55' + z : z; }
  };
  function dataPrevia(m, cb) {
    var exp = Date.now() + 3 * 86400000;
    if (m === 'arq' || m === 'loja') return cb('/proposta.html?previa=1&d=' + encode({nome: 'Cliente Teste', v1: '2.690', v2: '3.690', v3: '3.990', planos: [true, true, true], mo: m, expira: exp, lh: 'previa'}));
    // cardápio e Milão: usa o link de uma proposta desse modelo (de preferência de teste), com o nome trocado
    var L = (window._lista || []).filter(function (p) { return areaDe(p) === 'cd' && (p.tem_snapshot || snapDe(p.id)); });
    L.sort(function (a, b) { var ta = /^(zz|teste)/i.test(a.cliente) ? 0 : 1, tb = /^(zz|teste)/i.test(b.cliente) ? 0 : 1; return ta - tb || String(b.criado_em).localeCompare(String(a.criado_em)); });
    var i = 0;
    (function tenta() {
      if (i >= L.length || i > 8) return cb(null);
      var p = L[i++];
      comSnap(p, function (s) {
        var nv = s && s.form && s.form.nv, so = nv && !nv[0] && !nv[1] && nv[2];
        if (s && s.link && (m === 'mi' ? so : !so)) cb('/proposta.html?previa=1&d=' + s.link.split('?d=')[1]); else tenta();
      });
    })();
  }
  var PV = {modelo: null, src: null};
  function previa(troca) {
    var pv = $('ctPv'); if (!pv) return;
    var a = S.sec.split(':'), seq = ++S.prevSeq;
    if (a[0] === 'pagina') {
      var fr = pv.querySelector('iframe.ct-pg');
      if (!troca && fr && PV.modelo === a[1] && fr.contentWindow && fr.contentWindow.spPreviaAplicar) { try { fr.contentWindow.spPreviaAplicar(); } catch (e) {} return; }
      pv.textContent = ''; pv.appendChild(E('div', 'ct-pvh', 'Prévia · celular'));
      var cx = E('div', 'ct-cel'); pv.appendChild(cx); cx.appendChild(E('div', 'loading', 'Carregando a página…'));
      PV.modelo = a[1];
      dataPrevia(a[1], function (src) {
        if (seq !== S.prevSeq) return;
        cx.textContent = '';
        if (!src) { cx.appendChild(E('div', 'empty', 'Para ver a prévia deste modelo, gere uma proposta de teste nele (nome começando com "Teste").')); return; }
        var f = E('iframe', 'ct-pg'); f.title = 'Prévia da página do cliente'; f.src = src; f.setAttribute('loading', 'lazy');
        cx.appendChild(f);
      });
      return;
    }
    if (a[0] === 'whatsapp') {
      pv.textContent = ''; pv.appendChild(E('div', 'ct-pvh', 'Prévia · WhatsApp (dados fictícios)'));
      var ch = E('div', 'ct-zap');
      F.whatsapp.forEach(function (c) {
        ch.appendChild(E('div', 'ct-zap-r', c.rot));
        var t = String(obter('whatsapp', null, c.k, c.def)).replace(/\[nome\]/gi, 'Ana').replace(/\[data\]/gi, '28/11/2026 às 18:00').replace(/\[link\]/gi, location.origin + '/p/ana-exemplo').replace(/\[item\]/gi, '2º Pacote').replace(/\[valor\]/gi, 'R$ 2.990/mês');
        var bl = E('div', 'ct-zap-b'); bl.innerHTML = F.html(t).replace(/\*\*/g, ''); ch.appendChild(bl);   // F.html escapa tudo
      });
      pv.appendChild(ch);
      return;
    }
    var mod = modeloEmailAtual();
    if (!mod) { pv.textContent = ''; return; }
    var box = pv.querySelector('.ct-mail');
    if (troca || !box) {
      pv.textContent = ''; pv.appendChild(E('div', 'ct-pvh', 'Prévia · e-mail (dados fictícios)'));
      box = E('div', 'ct-mail'); pv.appendChild(box);
      box.appendChild(E('div', 'ct-mail-a', '')); var fr2 = E('iframe', 'ct-mf'); fr2.title = 'Prévia do e-mail'; fr2.setAttribute('sandbox', 'allow-same-origin'); box.appendChild(fr2);   // quadro sem scripts
    }
    apiEmails('previa', {modelo: mod, conteudo: S.D}).then(function (r) {
      if (seq !== S.prevSeq) return;
      var as = box.querySelector('.ct-mail-a'), fr3 = box.querySelector('iframe');
      if (!(r && r.ok)) { as.textContent = 'Prévia indisponível: ' + ((r && r.erro) || 'erro'); return; }
      as.textContent = 'Assunto: ' + r.assunto;
      fr3.srcdoc = r.html;   // quadro isolado (sandbox sem scripts)
    });
  }
  function abrePreviaCel() {
    document.body.classList.add('ct-pv-on');
    var x = $('ctPvX');
    if (!x) { x = B('btn-main ct-pv-x', 'Fechar prévia', function () { document.body.classList.remove('ct-pv-on'); var b = $('ctPvBtn'); if (b) b.focus(); }); x.id = 'ctPvX'; document.body.appendChild(x); }
    previa(true); x.focus();
  }

  // ---------- Meta Pixel (Ajustes) ----------
  var PX = {salvo: null};
  window.pxRender = function () {
    var i = $('pxId'); if (!i) return;
    if (!i.__px) {
      i.__px = true;
      i.addEventListener('input', function () { var v = i.value.replace(/\D/g, ''); if (v !== i.value) i.value = v; $('pxErr').style.display = ''; });
      $('pxSalvar').addEventListener('click', pxSalvar);
      $('pxTestar').addEventListener('click', pxTestar);
    }
    adm('site_get', {}).then(function (r) {
      if (!(r && r.ok)) { $('pxMsg').textContent = 'Não foi possível ler o ID agora.'; return; }
      PX.salvo = (r.site && r.site.pixel_id) || '';
      if (document.activeElement !== i) i.value = PX.salvo;
      $('pxMsg').textContent = PX.salvo ? 'Pixel ligado na página do cliente.' : 'Sem Pixel: nada da Meta carrega.';
    });
  };
  function pxSalvar() {
    var i = $('pxId'), v = i.value.trim();
    if (v && !/^\d{5,20}$/.test(v)) { $('pxErr').style.display = 'block'; i.focus(); return; }
    var b = $('pxSalvar'); b.disabled = true;
    adm('site_set', {chave: 'pixel_id', valor: v}).then(function (r) {
      b.disabled = false;
      if (!(r && r.ok)) { $('pxMsg').textContent = 'Não foi possível salvar: ' + ((r && r.erro) || 'erro'); return; }
      PX.salvo = v; $('pxMsg').textContent = v ? 'Salvo. O Pixel vale a partir da próxima abertura de cada proposta.' : 'Pixel desligado: nada da Meta carrega.';
      histMsg(v ? 'ID do Pixel salvo.' : 'Pixel desligado.');
    }).catch(function () { b.disabled = false; });
  }
  function pxTestar() {
    var i = $('pxId'), v = i.value.trim(), m = $('pxMsg');
    if (!/^\d{5,20}$/.test(v)) { $('pxErr').style.display = 'block'; i.focus(); return; }
    if (v !== PX.salvo) { m.textContent = 'Salve o ID antes de testar.'; return; }
    var L = (window._lista || []).filter(function (p) { return /^(zz|teste)/i.test(String(p.cliente).trim()) && Date.parse(p.expira_em) > Date.now() && !p.cancelada_em && (p.tem_snapshot || snapDe(p.id)); });
    if (!L.length) { m.textContent = 'Para testar, gere uma proposta de teste (nome começando com "Teste") e toque em Testar de novo.'; return; }
    var w = window.open('about:blank', '_blank');
    comSnap(L[0], function (s) {
      if (!(s && s.link)) { if (w) w.close(); m.textContent = 'Não encontrei o link da proposta de teste.'; return; }
      var u = s.link + (s.link.indexOf('?') >= 0 ? '&' : '?') + 'sp_pixel_teste=1';
      if (w) w.location.href = u; else window.open(u, '_blank');
      m.textContent = 'Abrimos "' + L[0].cliente + '" com o Pixel ligado. No Gerenciador de Eventos da Meta › Testar eventos, PageView e ViewContent aparecem em até 1 minuto. Esse teste não conta nos acessos.';
    });
  }
  window.addEventListener('beforeunload', function (e) { if (S.sujo) { e.preventDefault(); e.returnValue = ''; } });
})();
