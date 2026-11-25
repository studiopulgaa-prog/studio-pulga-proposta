// api/_waia.js — IA de atendimento (Claude Haiku pela API da Anthropic). Não é uma rota.
// Chave SOMENTE em ANTHROPIC_API_KEY (Vercel). O texto do cliente é dado, nunca instrução: as travas valem no código, não só no prompt.
import { config } from './_wadb.js';
import { rpc } from './_email.js';
import { MANUAL_IA_PADRAO } from './_watextos.js';

export const MODELO = 'claude-haiku-5-5';
export const PRECO = { entrada: 0.10 / 1e6, saida: 0.50 / 1e6 };   // US$ por token (Haiku 5.5, até 100 mil tokens por chamada)
const ACOES = ['nenhuma', 'mostrar_menu', 'handoff', 'enviar_manual_gravacao', 'enviar_link_pagamento', 'enviar_drive', 'enviar_onboarding'];

export const iaLigada = () => process.env.IA_ATIVA === 'true' && !!process.env.ANTHROPIC_API_KEY;
export const limiteMensal = () => { const n = Number(process.env.IA_LIMITE_MENSAL_USD); return Number.isFinite(n) && n > 0 ? n : 15; };
export const mesAtual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);

export async function usoDoMes() {
  try { const L = await rpc('wa_get', { p_tabela: 'wa_uso_ia', p_filtro: { mes: mesAtual() }, p_ordem: null, p_limite: 1 }); return (L && L[0]) || { mes: mesAtual(), custo_usd: 0, chamadas: 0 }; }
  catch (e) { return { mes: mesAtual(), custo_usd: 0, chamadas: 0, erro: true }; }
}

const FERRAMENTA = {
  name: 'responder',
  description: 'Resposta ao cliente no WhatsApp. Sempre use esta ferramenta.',
  input_schema: {
    type: 'object',
    properties: {
      mensagens: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', maxLength: 600 }, description: '1 a 3 balões curtos, no tom do manual.' },
      acao: { type: 'string', enum: ACOES, description: 'Ação que o sistema executa depois das mensagens.' },
      motivo_handoff: { type: 'string', maxLength: 200, description: 'Resumo de 1 linha para a equipe (só se acao = handoff), sem dados pessoais.' },
    },
    required: ['mensagens', 'acao'],
  },
};

// contexto: {cliente:{primeiro_nome, perfil, status, vencimento_dia, tem_manual, tem_drive, tem_onboarding}, financeiro:[...]|null, dentro_horario, agora, avisos, historico:[{papel:'cliente'|'studio', texto}]}
export async function responderIA(contexto) {
  if (!iaLigada()) return { ok: false, motivo: 'desligada' };
  const uso = await usoDoMes();
  if (Number(uso.custo_usd) >= limiteMensal()) return { ok: false, motivo: 'limite' };
  const manual = await config('manual_ia', MANUAL_IA_PADRAO);
  const sistema = `${typeof manual === 'string' && manual.trim() ? manual : MANUAL_IA_PADRAO}

DADOS DO SISTEMA (confiáveis; use só estes):
${JSON.stringify({ cliente: contexto.cliente, financeiro: contexto.financeiro, dentro_do_horario: contexto.dentro_horario, agora: contexto.agora, avisos: contexto.avisos }, null, 0)}
${contexto.cliente && contexto.cliente.perfil !== 'responsavel' ? '\nATENÇÃO: este número NÃO é do responsável. Não fale de valores, cobranças, pagamentos ou contrato; diga que esse assunto é só com o responsável.' : ''}
${contexto.cliente && contexto.cliente.status === 'pausado' ? '\nO cliente está com os serviços PAUSADOS por pagamento em aberto. Se o assunto for entrega ou gravação, explique com leveza e ofereça o link de pagamento (só para o responsável).' : ''}`;
  // histórico vira mensagens alternadas; o texto do cliente fica marcado como conversa
  const msgs = [];
  for (const h of contexto.historico.slice(-20)) {
    const role = h.papel === 'cliente' ? 'user' : 'assistant';
    const content = String(h.texto || '').slice(0, 1500) || '(mensagem sem texto)';
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += '\n' + content;
    else msgs.push({ role, content });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) return { ok: false, motivo: 'sem_mensagem' };

  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, max_tokens: 400, temperature: 0.6, system: sistema, messages: msgs, tools: [FERRAMENTA], tool_choice: { type: 'tool', name: 'responder' } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('ia', r.status, j && j.error && j.error.type); return { ok: false, motivo: 'erro_api', status: r.status }; }
    const u = j.usage || {};
    const custo = (u.input_tokens || 0) * PRECO.entrada + (u.output_tokens || 0) * PRECO.saida;
    try { await rpc('wa_uso_somar', { p_mes: mesAtual(), p_in: u.input_tokens || 0, p_out: u.output_tokens || 0, p_custo: custo }); } catch (e) { console.error('uso ia', e && e.message); }
    const bloco = (j.content || []).find((c) => c.type === 'tool_use' && c.name === 'responder');
    const inp = bloco && bloco.input;
    if (!inp || !Array.isArray(inp.mensagens) || !inp.mensagens.length) return { ok: false, motivo: 'resposta_vazia', custo };
    const mensagens = inp.mensagens.map((m) => String(m || '').trim()).filter(Boolean).slice(0, 3).map((m) => m.slice(0, 700));
    const acao = ACOES.includes(inp.acao) ? inp.acao : 'nenhuma';
    return { ok: true, mensagens, acao, motivo_handoff: String(inp.motivo_handoff || '').slice(0, 200), custo };
  } catch (e) {
    return { ok: false, motivo: e && e.name === 'AbortError' ? 'tempo' : 'rede' };
  } finally { clearTimeout(t); }
}

// remove links e dados que a IA não deveria escrever (os links saem sempre do servidor)
export function limparSaida(txt) {
  return String(txt || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '')
    .replace(/[ \t]{2,}/g, ' ').trim();
}

// palavras que forçam passar para a equipe, independente da IA
export function pedeHumano(txt) {
  const t = String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /\b(falar com (alguem|uma pessoa|atendente|humano|a equipe|a ju|o isaque)|atendente|humano|cancelar|cancelamento|rescindir|rescisao|reclama|insatisfeit|absurdo|desconto|negociar|parcelar|procon|advogad|processo judicial)/.test(t);
}
