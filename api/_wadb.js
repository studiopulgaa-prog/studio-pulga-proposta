// api/_wadb.js — acesso às tabelas wa_* pelas funções wa_get / wa_ins / wa_upd / wa_del (segredo EMAIL_SECRET). Não é uma rota.
import { rpc } from './_email.js';

export const get = (tabela, filtro = {}, ordem = null, limite = 100) => rpc('wa_get', { p_tabela: tabela, p_filtro: filtro, p_ordem: ordem, p_limite: limite });
export const um = async (tabela, filtro, ordem = null) => { const r = await get(tabela, filtro, ordem, 1); return (r && r[0]) || null; };
export const contar = (tabela, filtro = {}) => rpc('wa_contar', { p_tabela: tabela, p_filtro: filtro });
export const ins = (tabela, linha, ignorar = false) => rpc('wa_ins', { p_tabela: tabela, p_linha: linha, p_ignorar: ignorar });
export const upd = async (tabela, filtro, set) => { const r = await rpc('wa_upd', { p_tabela: tabela, p_filtro: filtro, p_set: set }); return (r && r[0]) || null; };
export const del = (tabela, filtro) => rpc('wa_del', { p_tabela: tabela, p_filtro: filtro });
export const agoraIso = () => new Date().toISOString();

// idempotência de webhooks: true = primeira vez que vemos este id
export async function primeiraVez(id, origem) {
  const r = await ins('wa_eventos', { id: String(id).slice(0, 200), origem }, true);
  return !!r;
}

// ---- configuração editável (wa_config), com valores padrão
const cache = { t: 0, v: {} };
export async function config(chave, padrao) {
  if (Date.now() - cache.t > 30000) {
    try { const L = await get('wa_config', {}, null, 200); cache.v = {}; (L || []).forEach((r) => { cache.v[r.chave] = r.valor; }); cache.t = Date.now(); } catch (e) { console.error('wa_config', e && e.message); }
  }
  return cache.v[chave] !== undefined ? cache.v[chave] : padrao;
}
export function limparCacheConfig() { cache.t = 0; }

export async function salvarConfig(chave, valor) {
  const atual = await um('wa_config', { chave });
  if (!atual) { limparCacheConfig(); return ins('wa_config', { chave, valor }); }
  const hist = Array.isArray(atual.historico) ? atual.historico.slice(-9) : [];
  hist.push({ versao: atual.versao, valor: atual.valor, em: atual.updated_at });
  limparCacheConfig();
  return upd('wa_config', { chave }, { valor, versao: (atual.versao || 1) + 1, historico: hist, updated_at: agoraIso() });
}

export async function alerta(tipo, { cliente_id = null, conversa_id = null, resumo = '' } = {}) {
  try { return await ins('wa_alertas', { tipo, cliente_id, conversa_id, resumo: String(resumo || '').slice(0, 300) }); } catch (e) { console.error('alerta', e && e.message); return null; }
}

// ---- máscaras para log
export const mascTel = (t) => { const d = String(t || '').replace(/\D/g, ''); return d ? '***' + d.slice(-4) : ''; };
export const mascCnpj = (c) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 14 ? d.slice(0, 2) + '.***.***/' + d.slice(8, 12) + '-**' : '***'; };
export const mascEmail = (e) => {
  const [u, d] = String(e || '').split('@'); if (!d) return '***';
  const [dom, ...rest] = d.split('.');
  return (u.slice(0, 2) + '***') + '@' + (dom.slice(0, 2) + '***') + (rest.length ? '.' + rest.join('.') : '');
};
