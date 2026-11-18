// api/admin.js — todas as acoes do painel passam por aqui (exige sessao valida)
import { rpc } from './_email.js';
import { tokenValido, LINK_OK } from './_seg.js';

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
  if (!tokenValido(req)) return res.status(401).json({ ok: false, erro: 'sessao expirada' });
  const b = req.body || {};
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
      case 'link':
        if (!/^[a-z0-9-]{1,120}$/.test(b.slug || '') || !LINK_OK.test(b.url || '') || String(b.url).length > 8000) return ruim();
        await rpc('adm_link', { p_slug: b.slug, p_url: b.url });
        return res.json({ ok: true });
      default:
        return ruim();
    }
  } catch (e) {
    console.error('admin', b.acao, e);
    return res.status(500).json({ ok: false, erro: 'erro interno' });
  }
}
