// api/admin.js — todas as acoes do painel passam por aqui (exige sessao valida)
import { rpc } from './_email.js';
import { sessaoValida, revogarSessao, cookieLimpo, lerCookie, origemOk, LINK_OK } from './_seg.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v, n) => String(v == null ? '' : v).slice(0, n);
const CHAVES = ['planos_arquiteto', 'planos_loja', 'cardapio'];
const MAX = 200000; // tamanho maximo (caracteres) de um padrao ou de uma copia de proposta
const objOuLista = (v) => v !== null && typeof v === 'object';
const tamanhoOk = (v) => { try { return JSON.stringify(v).length <= MAX; } catch (e) { return false; } };
const TIPO = { pl: 'planos', cd: 'cardapio', planos: 'planos', cardapio: 'cardapio' };

// Conteúdo editável: só texto (nada de HTML), tamanhos limitados e valores/datas conferidos no servidor.
const CT_SECOES = ['pagina', 'emails', 'campanhas', 'whatsapp', 'gerais'];
const CT_PUBLICO = ['todos', 'arquitetos', 'mulheres', 'construtoras', 'lojas'];
function limpaTexto(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (t.length > max) return null;
  if (/<\s*\/?\s*[a-z!]/i.test(t)) return null;   // sem HTML/script: o negrito é **assim**
  return t;
}
export function validarConteudo(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { erro: 'conteúdo inválido' };
  const out = {};
  for (const k of Object.keys(d)) if (!CT_SECOES.includes(k)) return { erro: 'seção desconhecida: ' + k };
  const mapa = (o, max, campo) => {
    if (o == null) return {};
    if (typeof o !== 'object' || Array.isArray(o)) throw new Error(campo);
    const r = {};
    for (const [k, v] of Object.entries(o)) {
      if (!/^[a-z0-9_]{1,40}$/.test(k)) throw new Error(campo + '.' + k);
      const t = limpaTexto(v, max); if (t == null) throw new Error(campo + '.' + k);
      r[k] = t;
    }
    return r;
  };
  try {
    if (d.pagina) { out.pagina = {}; for (const m of Object.keys(d.pagina)) { if (!['arq', 'loja', 'cd', 'mi'].includes(m)) throw new Error('pagina.' + m); out.pagina[m] = mapa(d.pagina[m], 2000, 'pagina.' + m); } }
    if (d.emails) { out.emails = {}; for (const m of Object.keys(d.emails)) { if (!['link', 'lembrete', 'ultimo_amanha', 'ultimo_hoje'].includes(m)) throw new Error('emails.' + m); out.emails[m] = mapa(d.emails[m], 4000, 'emails.' + m); } }
    if (d.whatsapp) out.whatsapp = mapa(d.whatsapp, 1000, 'whatsapp');
    if (d.gerais) {
      out.gerais = mapa(d.gerais, 300, 'gerais');
      for (const k of ['telefone', 'whatsapp']) if (out.gerais[k] && !/^[\d\s()+-]{8,20}$/.test(out.gerais[k])) throw new Error('gerais.' + k);
      if (out.gerais.whatsapp) { const z = out.gerais.whatsapp.replace(/\D/g, ''); out.gerais.whatsapp = /^\d{10,11}$/.test(z) ? '55' + z : z; }
    }
    if (d.campanhas) {
      const L = d.campanhas.itens;
      if (!Array.isArray(L) || L.length > 30) throw new Error('campanhas');
      out.campanhas = { itens: L.map((c, i) => {
        if (!c || typeof c !== 'object') throw new Error('campanhas.' + i);
        const id = String(c.id || ''), r = { id, ligado: c.ligado !== false };
        if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new Error('campanhas.' + i + '.id');
        if (c.data) { if (!/^\d{4}-\d{2}-\d{2}$/.test(c.data) || !Number.isFinite(Date.parse(c.data))) throw new Error('campanhas.' + i + '.data'); r.data = c.data; }
        else if (c.anual) { if (!/^\d{2}-\d{2}$/.test(c.anual)) throw new Error('campanhas.' + i + '.anual'); r.anual = c.anual; }
        else throw new Error('campanhas.' + i + '.data');
        if (!CT_PUBLICO.includes(c.publico)) throw new Error('campanhas.' + i + '.publico');
        r.publico = c.publico;
        for (const [k, max, obrig] of [['assunto', 200, true], ['corpo', 4000, true], ['botao', 60, false]]) {
          if (c[k] == null || c[k] === '') { if (obrig) throw new Error('campanhas.' + i + '.' + k); continue; }
          const t = limpaTexto(c[k], max); if (t == null || (obrig && !t.trim())) throw new Error('campanhas.' + i + '.' + k); r[k] = t;
        }
        return r;
      }) };
      if (new Set(out.campanhas.itens.map((c) => c.id)).size !== out.campanhas.itens.length) throw new Error('campanhas.id repetido');
    }
  } catch (e) { return { erro: 'campo inválido: ' + e.message }; }
  if (JSON.stringify(out).length > 280000) return { erro: 'conteúdo grande demais' };
  return { dados: out };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const b = req.body || {};
  // a pagina pergunta se ja ha sessao (o cookie HttpOnly nao e legivel por script)
  if (b.acao === 'ping') return res.json({ ok: true, logado: await sessaoValida(req) });
  // "Sair": revoga a sessao no banco e apaga o cookie
  if (b.acao === 'sair') {
    if (lerCookie(req) && !origemOk(req)) return res.status(403).json({ ok: false });
    try { await revogarSessao(req); } catch (e) { console.error('sair', e); return res.status(500).json({ ok: false }); }
    res.setHeader('Set-Cookie', cookieLimpo());
    return res.json({ ok: true });
  }
  if (!(await sessaoValida(req))) return res.status(401).json({ ok: false, erro: 'sessao expirada' });
  const ruim = () => res.status(400).json({ ok: false, erro: 'dados invalidos' });
  try {
    switch (b.acao) {
      case 'listar':
        return res.json({ ok: true, lista: await rpc('adm_listar', {}) });
      case 'listar2': { // histórico paginado: limite, cursor e filtros (tipo, situação, busca, testes)
        const r = await rpc('adm_listar2', {
          p_limite: Math.min(Math.max(parseInt(b.limite, 10) || 20, 1), 200),
          p_cursor: /^[0-9T:.\-Z]{10,40}\|[0-9a-f-]{36}$/i.test(b.cursor || '') ? b.cursor : null,
          p_tipo: ['planos', 'cardapio'].includes(b.tipo) ? b.tipo : null,
          p_status: ['ativas', 'escolheram', 'expiradas', 'canceladas'].includes(b.status) ? b.status : null,
          p_busca: b.busca ? txt(b.busca, 60) : null,
          p_testes: b.testes === true,
        });
        return res.json(r && r.ok ? r : { ok: false, erro: 'falha ao listar' });
      }
      case 'eventos': // linha do tempo da proposta, com data e hora
        if (!UUID.test(b.id || '')) return ruim();
        return res.json(await rpc('adm_eventos', { p_id: b.id, p_limite: Math.min(Math.max(parseInt(b.limite, 10) || 200, 1), 500) }));
      case 'atividades': // últimas atividades de todos os clientes (Início no computador)
        return res.json({ ok: true, lista: await rpc('adm_atividades', { p_limite: Math.min(Math.max(parseInt(b.limite, 10) || 12, 1), 50) }) });
      case 'criar': {
        const p = b.proposta || {};
        if (!p.cliente || !/^[A-Za-z0-9]{6,64}$/.test(p.link_hash || '') || !/^[0-9a-f]{64}$/.test(p.d_hash || '') || !Number.isFinite(Date.parse(p.expira_em))) return ruim();
        const extra = {};
        if (TIPO[p.tipo]) extra.tipo = TIPO[p.tipo];
        if (/^\S+@\S+\.\S+$/.test(p.email || '')) extra.email = txt(p.email, 200);
        if (p.snapshot != null) {
          if (!objOuLista(p.snapshot) || Array.isArray(p.snapshot) || !tamanhoOk(p.snapshot)) return ruim();
          extra.snapshot = p.snapshot;
        }
        const id = await rpc('adm_criar', { p: {
          ...extra,
          cliente: txt(p.cliente, 120), v1: txt(p.v1, 20), v2: txt(p.v2, 20), v3: txt(p.v3, 20),
          planos: Array.isArray(p.planos) ? p.planos.slice(0, 3).map(Boolean) : [true, true, true],
          validade: Math.min(Math.max(parseInt(p.validade, 10) || 2, 1), 30),
          link_hash: p.link_hash, expira_em: new Date(p.expira_em).toISOString(), d_hash: p.d_hash,
        } });
        return res.json({ ok: true, id });
      }
      case 'prop_get':
        if (!UUID.test(b.id || '')) return ruim();
        return res.json({ ok: true, proposta: await rpc('adm_prop_get', { p_id: b.id }) });
      case 'padroes_get':
        return res.json({ ok: true, padroes: await rpc('adm_padroes_get', {}) });
      case 'padrao_set':
        if (!CHAVES.includes(b.chave) || !objOuLista(b.dados) || !tamanhoOk(b.dados)) return ruim();
        return res.json({ ok: true, em: await rpc('adm_padrao_set', { p_chave: b.chave, p_dados: b.dados }) });
      case 'importar': {
        const pad = {};
        if (b.padroes != null) {
          if (!objOuLista(b.padroes) || Array.isArray(b.padroes)) return ruim();
          for (const k of CHAVES) if (objOuLista(b.padroes[k])) { if (!tamanhoOk(b.padroes[k])) return ruim(); pad[k] = b.padroes[k]; }
        }
        const hist = [];
        if (b.historico != null) {
          if (!Array.isArray(b.historico) || b.historico.length > 200) return ruim();
          for (const h of b.historico) {
            if (!h || !UUID.test(h.id || '') || !objOuLista(h.snapshot) || Array.isArray(h.snapshot) || !tamanhoOk(h.snapshot)) continue;
            hist.push({ id: h.id, tipo: TIPO[h.tipo] || null, snapshot: h.snapshot });
          }
        }
        const r = await rpc('adm_importar', { p_padroes: pad, p_hist: hist, p_sobrescrever: b.sobrescrever === true });
        return res.json({ ok: true, resultado: r });
      }
      case 'encerrar':
        if (!UUID.test(b.id || '')) return ruim();
        await rpc('adm_encerrar', { p_id: b.id });
        return res.json({ ok: true });
      case 'encerrar_todas':
        await rpc('adm_encerrar_todas', {});
        return res.json({ ok: true });
      case 'excluir':
        if (!UUID.test(b.id || '')) return ruim();
        await rpc('adm_excluir', { p_id: b.id });
        return res.json({ ok: true });
      case 'cancelar': // link para de abrir na hora ("não está mais disponível"); continua no Histórico como Cancelada
        if (!UUID.test(b.id || '')) return ruim();
        return res.json({ ok: true, ...(await rpc('adm_cancelar', { p_id: b.id })) });
      case 'lixeira_mover': // "Excluir do histórico": vai para a Lixeira (30 dias) e o link para de abrir
        if (!UUID.test(b.id || '')) return ruim();
        return res.json({ ok: true, ...(await rpc('adm_lixeira_mover', { p_id: b.id })) });
      case 'apagar_lote': { // "Apagar histórico": tudo vai para a Lixeira; ativas só com incluir_ativas
        if (b.confirmacao !== 'APAGAR' || !['todas', 'expiradas', 'canceladas'].includes(b.filtro) || !['planos', 'cardapio'].includes(b.tipo)) return ruim();
        const n = await rpc('adm_apagar_lote', { p_tipo: b.tipo, p_filtro: b.filtro, p_incluir_ativas: b.incluir_ativas === true });
        return res.json({ ok: true, n });
      }
      case 'lixeira':
        return res.json({ ok: true, lista: await rpc('adm_lixeira', {}) });
      case 'restaurar':
        if (!UUID.test(b.id || '')) return ruim();
        return res.json({ ok: true, ...(await rpc('adm_restaurar', { p_id: b.id })) });
      case 'apagar_definitivo': // só o que está na Lixeira
        if (!UUID.test(b.id || '')) return ruim();
        return res.json({ ok: true, n: await rpc('adm_apagar_definitivo', { p_id: b.id }) });
      case 'ignorar_disp': // este aparelho é do admin: os acessos dele não contam
        if (!/^d2_[a-z0-9]{4,40}$/.test(b.hash || '')) return ruim();
        await rpc('adm_ignorar_disp', { p_hash: b.hash });
        return res.json({ ok: true });
      case 'ocultar': // "Apagar do histórico": esconde e expira o link (a linha continua no banco)
        if (!UUID.test(b.id || '')) return ruim();
        await rpc('adm_ocultar', { p_id: b.id });
        return res.json({ ok: true });
      case 'reativar': { // volta a valer por N dias a partir de agora
        const dias = parseInt(b.dias, 10);
        if (!UUID.test(b.id || '') || ![1, 2, 3, 5, 7].includes(dias)) return ruim();
        await rpc('adm_reativar', { p_id: b.id, p_dias: dias });
        return res.json({ ok: true });
      }
      case 'mulher': // caixinha "Cliente mulher" (a campanha do Dia da Mulher só vai para as marcadas)
        if (!UUID.test(b.id || '') || typeof b.valor !== 'boolean') return ruim();
        await rpc('adm_mulher', { p_id: b.id, p_valor: b.valor });
        return res.json({ ok: true });
      case 'nicho': // Arquiteto/Designer | Loja | Construtora | Outro (Milão e Dia do Arquiteto só vão para Arquiteto/Designer)
        if (!UUID.test(b.id || '') || !['arquiteto', 'loja', 'construtora', 'outro'].includes(b.valor)) return ruim();
        await rpc('adm_nicho', { p_id: b.id, p_nicho: b.valor });
        return res.json({ ok: true });
      case 'contato': { // e-mail e WhatsApp do cliente (podem ser editados a qualquer momento; vazio apaga)
        if (!UUID.test(b.id || '')) return ruim();
        const em = String(b.email == null ? '' : b.email).trim(), wa = String(b.whatsapp == null ? '' : b.whatsapp).replace(/\D/g, '');
        if (em && (em.length > 200 || !/^\S+@\S+\.\S+$/.test(em))) return res.status(400).json({ ok: false, erro: 'e-mail inválido' });
        if (wa && !/^(55)?\d{10,11}$/.test(wa)) return res.status(400).json({ ok: false, erro: 'WhatsApp inválido (use DDD + número)' });
        // campo ausente = mantém o que está salvo (null); presente e vazio = apaga
        return res.json(await rpc('adm_contato', { p_id: b.id, p_email: 'email' in b ? em : null, p_whatsapp: 'whatsapp' in b ? wa : null }));
      }
      case 'follow': { // Aguardando · Ainda não decidiu · Escolheu · Fechou · Perdido (com registro no histórico)
        if (!UUID.test(b.id || '') || !['aguardando', 'nao_decidiu', 'escolheu', 'fechou', 'perdido'].includes(b.status)) return ruim();
        const dias = b.dias == null ? null : parseInt(b.dias, 10);
        if (dias != null && !(dias >= 1 && dias <= 30)) return ruim();
        return res.json(await rpc('adm_follow', { p_id: b.id, p_status: b.status, p_dias: dias }));
      }
      case 'conteudo_get':
        return res.json(await rpc('adm_conteudo_get', {}));
      case 'conteudo_versao':
        if (!Number.isInteger(b.versao) || b.versao < 1) return ruim();
        return res.json((await rpc('adm_conteudo_versao', { p_id: b.versao })) || { ok: false });
      case 'conteudo_rascunho':
      case 'conteudo_publicar': {
        const v = validarConteudo(b.dados);
        if (v.erro) return res.status(400).json({ ok: false, erro: v.erro });
        if (b.acao === 'conteudo_rascunho') return res.json(await rpc('adm_conteudo_rascunho', { p_dados: v.dados }));
        return res.json(await rpc('adm_conteudo_publicar', { p_dados: v.dados, p_resumo: txt(b.resumo, 2000), p_ativas: b.ativas === true }));
      }
      case 'site_get':
        return res.json({ ok: true, site: await rpc('adm_site_get', {}) });
      case 'site_set': // ID do Pixel da Meta (só números; não é segredo). Vazio = sem Pixel.
        if (b.chave !== 'pixel_id' || (b.valor && !/^\d{5,20}$/.test(String(b.valor)))) return ruim();
        return res.json(await rpc('adm_site_set', { p_chave: 'pixel_id', p_valor: String(b.valor || '') }));
      case 'nicho_confirmar': // grava o nicho e marca como confirmado pelo Isaque (some o selo "Nicho?")
        if (!UUID.test(b.id || '') || !['arquiteto', 'loja', 'construtora', 'outro'].includes(b.valor)) return ruim();
        await rpc('adm_nicho_confirmar', { p_id: b.id, p_nicho: b.valor });
        return res.json({ ok: true });
      case 'seq_status': { // "Fechou": para todos os e-mails da proposta; "Reabrir" volta a valer (não reativa quem se descadastrou)
        if (!UUID.test(b.id || '') || !['fechada', 'ativa', 'pausada'].includes(b.status)) return ruim();
        const r = await rpc('seq_status', { p_id: b.id, p_status: b.status });
        if (!r || !r.ok) return res.status(409).json({ ok: false, erro: r && r.motivo === 'descadastrada' ? 'O cliente pediu para não receber e-mails.' : 'Proposta não encontrada.' });
        return res.json({ ok: true });
      }
      case 'link':
        if (!/^[a-z0-9-]{1,120}$/.test(b.slug || '') || !LINK_OK.test(b.url || '') || String(b.url).length > 8000) return ruim();
        await rpc('adm_link', { p_slug: b.slug, p_url: b.url });
        return res.json({ ok: true });
      default:
        return ruim();
    }
  } catch (e) {
    console.error('admin', b.acao, e);
    // mostra o motivo real do banco (mensagem do Postgres; nunca contém segredos), para o painel exibir um erro útil
    let detalhe = '';
    try { const j = JSON.parse(String(e && e.message)); detalhe = String(j.message || '').slice(0, 160); } catch (x) { detalhe = ''; }
    return res.status(500).json({ ok: false, erro: 'erro interno', detalhe });
  }
}
