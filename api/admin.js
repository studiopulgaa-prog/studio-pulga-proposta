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
      case 'nicho': // Arquiteto/Designer | Loja | Outro (Milão e Dia do Arquiteto só vão para Arquiteto/Designer)
        if (!UUID.test(b.id || '') || !['arquiteto', 'loja', 'outro'].includes(b.valor)) return ruim();
        await rpc('adm_nicho', { p_id: b.id, p_nicho: b.valor });
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
