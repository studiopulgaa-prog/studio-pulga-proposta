// api/_wa.js — WhatsApp Cloud API (Meta). Não é uma rota.
// Token e IDs vêm SOMENTE das variáveis do Vercel. Nunca vão para log, resposta ou commit.
// MODO SIMULAÇÃO (padrão): sem WHATSAPP_ATIVO=true nada sai para clientes; só o TESTE_WHATSAPP recebe de verdade. O resto fica registrado.
import crypto from 'crypto';
import { ins, upd, mascTel } from './_wadb.js';

export const GRAPH = 'https://graph.facebook.com/v23.0';
export const TEMPLATE_LANG = 'pt_BR';

export const soDigitos = (t) => String(t || '').replace(/\D/g, '');
export function normTel(t) {
  let d = soDigitos(t);
  if (/^\d{10,11}$/.test(d)) d = '55' + d;
  return /^\d{10,15}$/.test(d) ? d : '';
}
// No Brasil a Meta às vezes entrega o número sem o 9 do celular (55 13 9xxxx-xxxx -> 55 13 xxxx-xxxx).
export function variantesTel(t) {
  const d = normTel(t); if (!d) return [];
  const v = [d];
  if (/^55\d{2}9\d{8}$/.test(d)) v.push(d.slice(0, 4) + d.slice(5));
  if (/^55\d{2}[6-9]\d{7}$/.test(d)) v.push(d.slice(0, 4) + '9' + d.slice(4));
  return v;
}

export const ativo = () => process.env.WHATSAPP_ATIVO === 'true';
export const configurado = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
const teste = () => normTel(process.env.TESTE_WHATSAPP);
const ehTeste = (para) => { const t = teste(); return !!t && variantesTel(para).includes(t); };

export function assinaturaOk(corpoCru, cabecalho) {
  const seg = process.env.WHATSAPP_APP_SECRET;
  if (!seg || !cabecalho || !String(cabecalho).startsWith('sha256=')) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', seg).update(corpoCru).digest('hex');
  const a = Buffer.from(String(cabecalho)), b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function graph(caminho, corpo, metodo = 'POST') {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`${GRAPH}/${caminho}`, {
      method: metodo, signal: ctrl.signal,
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, erro: (j && j.error && (j.error.error_user_msg || j.error.message)) || ('HTTP ' + r.status), codigo: j && j.error && j.error.code };
    return { ok: true, dados: j };
  } catch (e) {
    return { ok: false, erro: e && e.name === 'AbortError' ? 'tempo esgotado' : 'rede' };
  } finally { clearTimeout(t); }
}
export { graph };

// envia e registra em wa_mensagens. payload = parte específica do tipo (text / interactive / template)
// opções: origem, conversa_id, forcarSimulacao
export async function enviar(para, tipo, payload, { origem = 'sistema', conversa_id = null, forcarSimulacao = false } = {}) {
  const tel = normTel(para);
  if (!tel) return { ok: false, erro: 'telefone inválido' };
  const real = configurado() && !forcarSimulacao && (ativo() || ehTeste(tel));
  const reg = { conversa_id, telefone: tel, direcao: 'out', origem, tipo, conteudo: payload, simulado: !real, status: real ? 'enviando' : 'simulado' };
  if (!real) {
    try { await ins('wa_mensagens', reg); } catch (e) { console.error('wa reg', e && e.message); }
    return { ok: true, simulado: true, motivo: !configurado() ? 'whatsapp_nao_configurado' : 'modo_simulacao' };
  }
  const r = await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { messaging_product: 'whatsapp', recipient_type: 'individual', to: tel, type: tipo, [tipo]: payload });
  const id = r.ok && r.dados && r.dados.messages && r.dados.messages[0] && r.dados.messages[0].id;
  try { await ins('wa_mensagens', { ...reg, wa_message_id: id || null, status: r.ok ? 'sent' : 'failed', erro: r.ok ? null : String(r.erro).slice(0, 300) }); } catch (e) { console.error('wa reg', e && e.message); }
  if (!r.ok) console.error('wa envio', mascTel(tel), r.status, r.codigo, String(r.erro).slice(0, 160));
  return r.ok ? { ok: true, id } : { ok: false, erro: r.erro, codigo: r.codigo };
}

// ---- formatos
const corta = (s, n) => String(s == null ? '' : s).slice(0, n);
export const texto = (para, corpo, op) => enviar(para, 'text', { body: corta(corpo, 4000), preview_url: true }, op);

// lista interativa (menu). itens: [{id, titulo, descricao?}] (máx. 10)
export const lista = (para, { corpo, botao = 'ver opções', itens, cabecalho, rodape }, op) => enviar(para, 'interactive', {
  type: 'list',
  header: cabecalho ? { type: 'text', text: corta(cabecalho, 60) } : undefined,
  body: { text: corta(corpo, 1024) },
  footer: rodape ? { text: corta(rodape, 60) } : undefined,
  action: { button: corta(botao, 20), sections: [{ title: 'opções', rows: itens.slice(0, 10).map((i) => ({ id: corta(i.id, 200), title: corta(i.titulo, 24), description: i.descricao ? corta(i.descricao, 72) : undefined })) }] },
}, op);

// template aprovado. vars = ['texto 1', 'texto 2', ...] (corpo, na ordem {{1}}, {{2}}...). botaoUrl = sufixo da URL dinâmica (opcional)
export const template = (para, nome, vars = [], { botaoUrl, ...op } = {}) => {
  const components = [];
  if (vars.length) components.push({ type: 'body', parameters: vars.map((v) => ({ type: 'text', text: corta(String(v == null ? '' : v).replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   '), 900) })) });
  if (botaoUrl) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: corta(botaoUrl, 500) }] });
  return enviar(para, 'template', { name: nome, language: { code: TEMPLATE_LANG }, components }, op);
};

// marca como lida (o cliente vê os dois tiques azuis)
export async function marcarLida(waId) {
  if (!configurado() || !waId) return;
  await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { messaging_product: 'whatsapp', status: 'read', message_id: waId });
}

// status de entrega vindo do webhook
export async function atualizarStatus(st) {
  if (!st || !st.id) return;
  const set = { status: String(st.status || '').slice(0, 20) };
  if (st.errors && st.errors[0]) set.erro = String(st.errors[0].title || st.errors[0].message || '').slice(0, 300);
  try { await upd('wa_mensagens', { wa_message_id: st.id }, set); } catch (e) { console.error('wa status', e && e.message); }
}

// ---- templates (criados pela API; categoria UTILITY, pt_BR)
export async function listarTemplates() {
  if (!process.env.WHATSAPP_WABA_ID) return { ok: false, erro: 'falta WHATSAPP_WABA_ID' };
  if (!process.env.WHATSAPP_TOKEN) return { ok: false, erro: 'falta WHATSAPP_TOKEN' };
  const r = await graph(`${process.env.WHATSAPP_WABA_ID}/message_templates?fields=name,status,category,language,rejected_reason&limit=100`, null, 'GET');
  return r.ok ? { ok: true, lista: (r.dados && r.dados.data) || [] } : r;
}
export async function criarTemplate(t) {
  if (!process.env.WHATSAPP_WABA_ID || !process.env.WHATSAPP_TOKEN) return { ok: false, erro: 'falta WHATSAPP_WABA_ID ou WHATSAPP_TOKEN' };
  return graph(`${process.env.WHATSAPP_WABA_ID}/message_templates`, t);
}
