// api/wa.js — rota única do WhatsApp de atendimento (uma função só, por causa do limite de funções do Vercel).
//   /api/whatsapp/webhook  -> ?r=webhook  (Meta: GET verificação, POST mensagens; assinatura X-Hub-Signature-256)
//   /api/asaas/webhook     -> ?r=asaas    (Asaas: header asaas-access-token)
//   /api/cron/regua        -> ?r=regua    (cron diário do Vercel; Authorization: Bearer CRON_SECRET)
//   /api/admin/wa          -> ?r=admin    (painel; exige sessão do admin)
import crypto from 'crypto';
import { corpoCru } from './resend-webhook.js';
import { sessao } from './_seg.js';
import * as OS from './_os.js';
import { get, um, ins, upd, del, contar, agoraIso, config as cfg, salvarConfig, primeiraVez, alerta, mascTel } from './_wadb.js';
import { assinaturaOk, atualizarStatus, texto, template, listarTemplates, criarTemplate, normTel, ativo as waAtivo, configurado as waConfigurado } from './_wa.js';
import { processarMensagem, processarEco, cnpjValido, handoff } from './_atendimento.js';
import { rodarRegua, eventoAsaas, hojeBR, diasDesde } from './_regua.js';
import { clientePorCnpj, abertosEntre, asaasConfigurado, brl, dataBR } from './_asaas.js';
import { iaLigada, usoDoMes, limiteMensal, MODELO } from './_waia.js';
import { TEMPLATES, templateParaMeta, MANUAL_IA_PADRAO, MENU_PADRAO, HORARIO_PADRAO, WHATSAPP_COMERCIAL_PADRAO } from './_watextos.js';
import { emailValido } from './_resend.js';

export const config = { api: { bodyParser: false } };

const iguais = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, n);
const urlOk = (u) => !u || (/^https:\/\/[^\s<>"']{4,500}$/.test(u));
const H = 3600000;

// ---------------- Meta ----------------
async function webhookMeta(req, res) {
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q['hub.mode'] === 'subscribe' && process.env.WHATSAPP_VERIFY_TOKEN && iguais(q['hub.verify_token'], process.env.WHATSAPP_VERIFY_TOKEN)) return res.status(200).send(String(q['hub.challenge'] || ''));
    return res.status(403).send('forbidden');
  }
  if (req.method !== 'POST') return res.status(405).end();
  const cru = await corpoCru(req);
  if (!assinaturaOk(cru, req.headers['x-hub-signature-256'])) { console.error('wa webhook: assinatura inválida'); return res.status(401).end(); }
  let b; try { b = JSON.parse(cru); } catch (e) { return res.status(400).end(); }
  const tarefas = [];
  for (const en of (b.entry || [])) {
    for (const ch of (en.changes || [])) {
      const v = ch.value || {};
      if (ch.field === 'messages') {
        const nomes = {}; (v.contacts || []).forEach((c) => { nomes[c.wa_id] = c.profile && c.profile.name; });
        for (const m of (v.messages || [])) tarefas.push(processarMensagem(m, nomes[m.from]).catch((e) => console.error('wa msg', mascTel(m.from), e && e.message)));
        for (const s of (v.statuses || [])) tarefas.push(atualizarStatus(s));
      } else if (ch.field === 'smb_message_echoes') {
        for (const m of (v.message_echoes || [])) tarefas.push(processarEco(m).catch((e) => console.error('wa eco', e && e.message)));
      }
    }
  }
  await Promise.all(tarefas);
  return res.status(200).json({ ok: true });
}

// ---------------- Asaas ----------------
async function webhookAsaas(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.ASAAS_WEBHOOK_TOKEN || !iguais(req.headers['asaas-access-token'], process.env.ASAAS_WEBHOOK_TOKEN)) return res.status(401).end();
  let b; try { b = JSON.parse(await corpoCru(req)); } catch (e) { return res.status(400).end(); }
  const id = b.id || (b.event + ':' + (b.payment && b.payment.id) + ':' + (b.payment && b.payment.status));
  if (!(await primeiraVez('a:' + id, 'asaas'))) return res.json({ ok: true, repetido: true });
  try { return res.json(await eventoAsaas(b)); } catch (e) { console.error('asaas evento', e && e.message); return res.status(500).json({ ok: false }); }
}

// ---------------- cron ----------------
async function cronRegua(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ ok: false });
  const simular = (req.query || {}).simular === '1';
  try {
    const r = await rodarRegua({ simularSomente: simular });
    // conversas com a equipe há mais de 24h sem resposta voltam para a IA (o cliente nunca fica sem resposta)
    if (!simular) {
      const L = await get('wa_conversas', { modo: 'humano', 'humano_ate<': agoraIso() }, null, 200);
      for (const c of (L || [])) { await upd('wa_conversas', { id: c.id }, { modo: 'ia', humano_ate: null }); }
    }
    return res.json(r);
  } catch (e) { console.error('regua', e && e.message); return res.status(500).json({ ok: false, erro: 'erro interno' }); }
}

// ---------------- admin ----------------
const CONFIG_CHAVES = ['manual_ia', 'textos_menu', 'horario', 'avisos', 'whatsapp_comercial', 'numeros_alerta', 'ia_pausa_quando_equipe_responde_horas', 'proposta_whatsapp_auto', 'push_tudo'];
function validarConfig(chave, v) {
  switch (chave) {
    case 'manual_ia': return typeof v === 'string' && v.length >= 200 && v.length <= 20000 ? v : null;
    case 'textos_menu': { if (!v || typeof v !== 'object') return null; const o = {}; for (const k of Object.keys(MENU_PADRAO)) if (typeof v[k] === 'string' && v[k].trim()) o[k] = txt(v[k], 1000); return o; }
    case 'horario': { const d = Array.isArray(v && v.dias) ? v.dias.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : null; const i = Number(v && v.inicio), f = Number(v && v.fim); return d && d.length && i >= 0 && f <= 24 && i < f ? { dias: d, inicio: i, fim: f } : null; }
    case 'avisos': return Array.isArray(v) && v.length <= 20 ? v.filter((a) => a && /^\d{4}-\d{2}-\d{2}$/.test(a.inicio) && (!a.fim || /^\d{4}-\d{2}-\d{2}$/.test(a.fim))).map((a) => ({ inicio: a.inicio, fim: a.fim || a.inicio, texto: txt(a.texto, 300), fechado: a.fechado !== false })) : null;
    case 'whatsapp_comercial': return normTel(v) || null;
    case 'numeros_alerta': return Array.isArray(v) && v.length <= 5 ? v.map((n) => ({ nome: txt(n && n.nome, 40), telefone: normTel(n && n.telefone) })).filter((n) => n.telefone) : null;
    case 'ia_pausa_quando_equipe_responde_horas': { const n = Number(v); return n >= 1 && n <= 72 ? n : null; }
    case 'proposta_whatsapp_auto': return v === true || v === false ? v : null;
    case 'push_tudo': return v === true || v === false ? v : null;
    default: return null;
  }
}
const CAMPOS_CLIENTE = ['plano', 'nome', 'nome_contato', 'cnpj', 'email_responsavel', 'asaas_customer_id', 'vencimento_dia', 'clausula_atraso', 'pausa_automatica', 'status', 'manual_gravacao_url', 'drive_url', 'onboarding_url', 'onboarding_senha_id', 'observacoes'];
function validarCliente(c) {
  const o = {};
  o.nome = txt(c.nome, 120); if (!o.nome) return { erro: 'nome obrigatório' };
  o.nome_contato = txt(c.nome_contato, 80) || null;
  o.cnpj = String(c.cnpj || '').replace(/\D/g, ''); if (!cnpjValido(o.cnpj)) return { erro: 'CNPJ inválido' };
  o.email_responsavel = txt(c.email_responsavel, 200).toLowerCase(); if (!emailValido(o.email_responsavel)) return { erro: 'e-mail do responsável é obrigatório (é para onde vai o código)' };
  o.asaas_customer_id = txt(c.asaas_customer_id, 40) || null; if (o.asaas_customer_id && !/^cus_[A-Za-z0-9]+$/.test(o.asaas_customer_id)) return { erro: 'ID do Asaas inválido (começa com cus_)' };
  o.vencimento_dia = c.vencimento_dia == null || c.vencimento_dia === '' ? null : Number(c.vencimento_dia); if (o.vencimento_dia != null && ![10, 20].includes(o.vencimento_dia)) return { erro: 'vencimento: dia 10 ou 20' };
  o.clausula_atraso = txt(c.clausula_atraso, 12) || null; if (o.clausula_atraso && !/^[0-9]{1,2}(\.[0-9]{1,2})?[a-z]?$/i.test(o.clausula_atraso)) return { erro: 'cláusula: ex. 5.4' };
  o.pausa_automatica = c.pausa_automatica !== false;
  o.status = ['ativo', 'pausado', 'encerrado'].includes(c.status) ? c.status : 'ativo';
  for (const k of ['manual_gravacao_url', 'drive_url', 'onboarding_url']) { o[k] = txt(c[k], 500) || null; if (!urlOk(o[k])) return { erro: k + ': use um link https' }; }
  o.onboarding_senha_id = UUID.test(String(c.onboarding_senha_id || '')) ? c.onboarding_senha_id : null;
  o.observacoes = txt(c.observacoes, 1000) || null;
  const plano = txt(c.plano, 80); if (plano) o.plano = plano;   // coluna do SQL do Studio OS
  return { dados: o };
}

// a Ju (perfil atendimento) não acessa Ajustes, Financeiro detalhado nem o cadastro (CNPJ/e-mail definem quem vê o financeiro)
const SO_ISAQUE = new Set(['config', 'config_salvar', 'templates', 'templates_criar', 'teste_envio', 'senhas', 'senha_salvar', 'senha_remover', 'cobranca', 'regua_pular', 'regua_simular',
  'cliente_status', 'cliente_salvar', 'contato_salvar', 'contato_acao', 'asaas_buscar', 'clientes', 'financeiro', 'metas_get', 'metas_salvar']);

async function admin(req, res, b) {
  const S = await sessao(req);
  if (!S) return res.status(401).json({ ok: false, erro: 'sessão' });
  const a = b.acao, u = S.u;
  if (u !== 'isaque' && SO_ISAQUE.has(a)) return res.status(403).json({ ok: false, erro: 'sem permissão' });
  try {
    switch (a) {
      // ----- Studio OS
      case 'eu': return res.json({ ok: true, usuario: u, sql: await OS.sqlPronto() });
      case 'inicio': return res.json(await OS.inicio(u));
      case 'clientes_os': return res.json(await OS.clientesOS(u));
      case 'ficha': return res.json(await OS.ficha(u, b.id));
      case 'nota_add': return res.json(await OS.notaAdd(u, b.cliente_id, b.texto));
      case 'senha_cliente': return res.json(await OS.senhaDoCliente(b.id));
      case 'financeiro': return res.json(await OS.financeiro());
      case 'busca': return res.json(await OS.busca(u, b.q));
      case 'metas_get': return res.json(await OS.metasGet());
      case 'metas_salvar': return res.json(await OS.metasSalvar(b.metas));
      // ----- app de atendimento
      case 'inbox': return res.json(await OS.inbox(u, b.desde));
      case 'conversa': return res.json(await OS.conversa(u, b.id, b.desde));
      case 'enviar': return res.json(await OS.enviarEquipe(u, b.id, b.texto));
      case 'comentario': return res.json(await OS.comentario(u, b.id, b.texto));
      case 'assumir': case 'devolver': case 'resolver': return res.json(await OS.acaoConversa(u, b.id, a));
      case 'respostas': return res.json(await OS.respostas());
      case 'respostas_salvar': return res.json(await OS.respostasSalvar(b.lista));
      case 'push_chave': return res.json(await OS.pushChave());
      case 'push_inscrever': return res.json(await OS.pushInscrever(u, b.inscricao, b.aparelho));
      case 'push_sair': return res.json(await OS.pushSair(b.endpoint));
      case 'push_teste': return res.json(await OS.pushTeste(u));
      case 'painel': {
        const uso = await usoDoMes();
        const env = { WHATSAPP_TOKEN: !!process.env.WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID: !!process.env.WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_WABA_ID: !!process.env.WHATSAPP_WABA_ID, WHATSAPP_APP_SECRET: !!process.env.WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN: !!process.env.WHATSAPP_VERIFY_TOKEN, WHATSAPP_ATIVO: waAtivo(), TESTE_WHATSAPP: !!normTel(process.env.TESTE_WHATSAPP), ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY, IA_ATIVA: process.env.IA_ATIVA === 'true', ASAAS_API_KEY: asaasConfigurado(), ASAAS_WEBHOOK_TOKEN: !!process.env.ASAAS_WEBHOOK_TOKEN, CRON_SECRET: !!process.env.CRON_SECRET };
        return res.json({ ok: true, env, modo: waAtivo() ? 'envio' : 'simulacao', ia: { ligada: iaLigada(), modelo: MODELO, gasto_usd: Number(uso.custo_usd || 0), chamadas: uso.chamadas || 0, limite_usd: limiteMensal() }, alertas: await contar('wa_alertas', { resolvido_em: null }), nao_lidas: await contar('wa_conversas', { 'nao_lidas>': 0 }), humano: await contar('wa_conversas', { modo: 'humano' }) });
      }
      case 'conversas': {
        const f = {}; if (b.filtro === 'humano' || b.filtro === 'ia') f.modo = b.filtro; if (b.filtro === 'nao_lidas') f['nao_lidas>'] = 0; if (b.filtro === 'visitantes') f.cliente_id = null;
        const L = await get('wa_conversas', f, 'ultima_msg_em desc', 100);
        const cli = await get('wa_clientes', {}, null, 1000); const nm = {}; (cli || []).forEach((c) => { nm[c.id] = c.nome; });
        const ct = await get('wa_contatos', { ativo: true }, null, 1000); const pf = {}; (ct || []).forEach((c) => { pf[c.telefone] = c; });
        return res.json({ ok: true, lista: (L || []).filter((c) => c.ultima_msg_em).map((c) => ({ id: c.id, telefone: c.telefone, nome: (pf[c.telefone] && pf[c.telefone].nome) || c.nome_wa || '', cliente: nm[c.cliente_id] || '', perfil: pf[c.telefone] ? pf[c.telefone].perfil : '', modo: c.modo, nao_lidas: c.nao_lidas, ultima: c.ultima_msg_em, janela: !!(c.ultima_msg_cliente_em && Date.parse(c.ultima_msg_cliente_em) > Date.now() - 24 * H) })) });
      }
      case 'mensagens': {
        if (!UUID.test(b.id || '')) return res.json({ ok: false, erro: 'id' });
        const conv = await um('wa_conversas', { id: b.id }); if (!conv) return res.json({ ok: false, erro: 'não encontrada' });
        const L = await get('wa_mensagens', { conversa_id: b.id }, 'created_at desc', 150);
        await upd('wa_conversas', { id: b.id }, { nao_lidas: 0 });
        return res.json({ ok: true, conversa: { id: conv.id, telefone: conv.telefone, modo: conv.modo, humano_ate: conv.humano_ate, janela: !!(conv.ultima_msg_cliente_em && Date.parse(conv.ultima_msg_cliente_em) > Date.now() - 24 * H) }, lista: (L || []).reverse().map((m) => ({ id: m.id, direcao: m.direcao, origem: m.origem, tipo: m.tipo, conteudo: m.conteudo, status: m.status, simulado: m.simulado, erro: m.erro, em: m.created_at })) });
      }
      case 'responder': {
        if (!UUID.test(b.id || '')) return res.json({ ok: false, erro: 'id' });
        const conv = await um('wa_conversas', { id: b.id }); if (!conv) return res.json({ ok: false, erro: 'não encontrada' });
        const t = txt(b.texto, 4000); if (!t) return res.json({ ok: false, erro: 'mensagem vazia' });
        if (!(conv.ultima_msg_cliente_em && Date.parse(conv.ultima_msg_cliente_em) > Date.now() - 24 * H)) return res.json({ ok: false, erro: 'fora da janela de 24h: use "retomar conversa"' });
        const r = await texto(conv.telefone, t, { origem: 'equipe_admin', conversa_id: conv.id, autor: u });
        await upd('wa_conversas', { id: conv.id }, { modo: 'humano', humano_desde: agoraIso(), humano_ate: new Date(Date.now() + 24 * H).toISOString(), ultima_msg_em: agoraIso() });
        return res.json(r.ok ? { ok: true, simulado: !!r.simulado } : { ok: false, erro: r.erro });
      }
      case 'retomar': {
        if (!UUID.test(b.id || '')) return res.json({ ok: false, erro: 'id' });
        const conv = await um('wa_conversas', { id: b.id }); if (!conv) return res.json({ ok: false, erro: 'não encontrada' });
        const nome = txt(b.nome, 40) || 'tudo bem', assunto = txt(b.assunto, 80) || 'o seu atendimento';
        const r = await template(conv.telefone, 'retomar_conversa', [nome, assunto], { origem: 'equipe_admin', conversa_id: conv.id, autor: u });
        return res.json(r.ok ? { ok: true, simulado: !!r.simulado } : { ok: false, erro: r.erro });
      }
      case 'modo': {
        if (!UUID.test(b.id || '') || !['ia', 'humano'].includes(b.modo)) return res.json({ ok: false, erro: 'dados' });
        await upd('wa_conversas', { id: b.id }, b.modo === 'humano' ? { modo: 'humano', humano_desde: agoraIso(), humano_ate: new Date(Date.now() + 24 * H).toISOString() } : { modo: 'ia', humano_ate: null });
        return res.json({ ok: true });
      }
      case 'alertas': {
        const L = await get('wa_alertas', b.todos ? {} : { resolvido_em: null }, 'created_at desc', 100);
        const cli = await get('wa_clientes', {}, null, 1000); const nm = {}; (cli || []).forEach((c) => { nm[c.id] = c.nome; });
        return res.json({ ok: true, lista: (L || []).map((x) => ({ ...x, cliente: nm[x.cliente_id] || '' })) });
      }
      case 'alerta_resolver': {
        if (!UUID.test(b.id || '')) return res.json({ ok: false, erro: 'id' });
        await upd('wa_alertas', { id: b.id }, { resolvido_em: agoraIso() }); return res.json({ ok: true });
      }
      case 'clientes': {
        const L = await get('wa_clientes', {}, 'nome asc', 1000);
        const ct = await get('wa_contatos', {}, 'created_at asc', 1000);
        return res.json({ ok: true, lista: L || [], contatos: (ct || []).map((c) => ({ ...c, bloqueado: !!(c.bloqueado_ate && Date.parse(c.bloqueado_ate) > Date.now()) })) });
      }
      case 'cliente_salvar': {
        const v = validarCliente(b.cliente || {}); if (v.erro) return res.json({ ok: false, erro: v.erro });
        if (v.dados.plano && !(await OS.sqlPronto())) delete v.dados.plano;   // sem o SQL do Studio OS não há coluna "plano"
        const id = b.cliente && b.cliente.id;
        if (id) {
          if (!UUID.test(id)) return res.json({ ok: false, erro: 'id' });
          const antes = await um('wa_clientes', { id });
          const r = await upd('wa_clientes', { id }, { ...v.dados, updated_at: agoraIso() });
          // trocou o e-mail do responsável: todos os números revalidam
          if (antes && antes.email_responsavel !== v.dados.email_responsavel) await upd('wa_contatos', { cliente_id: id }, { verificado_em: null });
          return res.json({ ok: true, cliente: r });
        }
        if (await um('wa_clientes', { cnpj: v.dados.cnpj })) return res.json({ ok: false, erro: 'já existe um cliente com este CNPJ' });
        return res.json({ ok: true, cliente: await ins('wa_clientes', v.dados) });
      }
      case 'contato_salvar': {
        const c = b.contato || {};
        const tel = normTel(c.telefone); if (!tel) return res.json({ ok: false, erro: 'telefone inválido (DDD + número)' });
        if (!UUID.test(c.cliente_id || '')) return res.json({ ok: false, erro: 'cliente' });
        const perfil = c.perfil === 'responsavel' ? 'responsavel' : 'equipe';
        const nome = txt(c.nome, 80) || null;
        const ja = await um('wa_contatos', { telefone: tel });
        if (ja) {
          const set = { cliente_id: c.cliente_id, perfil, nome, ativo: c.ativo !== false };
          if (ja.cliente_id !== c.cliente_id) set.verificado_em = null;   // mudou de cliente: confirma de novo
          return res.json({ ok: true, contato: await upd('wa_contatos', { id: ja.id }, set) });
        }
        // número cadastrado pelo admin ainda precisa confirmar o código uma vez (prova que é a pessoa certa)
        return res.json({ ok: true, contato: await ins('wa_contatos', { cliente_id: c.cliente_id, telefone: tel, perfil, nome }) });
      }
      case 'contato_acao': {
        if (!UUID.test(b.id || '')) return res.json({ ok: false, erro: 'id' });
        const ct = await um('wa_contatos', { id: b.id }); if (!ct) return res.json({ ok: false, erro: 'não encontrado' });
        if (b.tipo === 'desbloquear') { await upd('wa_contatos', { id: b.id }, { bloqueado_ate: null, tentativas_codigo: 0 }); const cv = await um('wa_conversas', { telefone: ct.telefone }); if (cv) await upd('wa_conversas', { id: cv.id }, { estado_fluxo: {} }); }
        else if (b.tipo === 'revalidar') await upd('wa_contatos', { id: b.id }, { verificado_em: null });
        else if (b.tipo === 'remover') await del('wa_contatos', { id: b.id });
        else return res.json({ ok: false, erro: 'tipo' });
        return res.json({ ok: true });
      }
      case 'asaas_buscar': {
        const cnpj = String(b.cnpj || '').replace(/\D/g, ''); if (!cnpjValido(cnpj)) return res.json({ ok: false, erro: 'CNPJ inválido' });
        const r = await clientePorCnpj(cnpj); return res.json(r.ok ? { ok: true, lista: r.lista } : { ok: false, erro: r.erro });
      }
      case 'cobranca': {
        if (!asaasConfigurado()) return res.json({ ok: false, erro: 'falta a variável ASAAS_API_KEY no Vercel' });
        const hoje = hojeBR();
        const r = await abertosEntre(new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10), new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));
        if (!r.ok) return res.json({ ok: false, erro: 'Asaas: ' + r.erro });
        const cli = await get('wa_clientes', { 'asaas_customer_id!=': null }, null, 1000); const pc = {}; (cli || []).forEach((c) => { pc[c.asaas_customer_id] = c; });
        const out = [];
        for (const p of r.lista) {
          const c = pc[p.cliente]; if (!c) continue;
          const env = await get('wa_regua_envios', { asaas_payment_id: p.id }, 'enviado_em asc', 20);
          out.push({ id: p.id, cliente: c.nome, cliente_id: c.id, status_cliente: c.status, valor: brl(p.valor), vencimento: dataBR(p.vencimento), dias: diasDesde(p.vencimento, hoje), status: p.status, link: p.link, envios: (env || []).map((e) => ({ etapa: e.etapa, em: e.enviado_em, simulado: e.simulado, detalhe: e.detalhe })) });
        }
        out.sort((x, y) => y.dias - x.dias);
        return res.json({ ok: true, lista: out, sem_vinculo: r.lista.filter((p) => !pc[p.cliente]).length });
      }
      case 'regua_pular': {
        const id = txt(b.pagamento, 40); if (!/^pay_[A-Za-z0-9]+$/.test(id)) return res.json({ ok: false, erro: 'pagamento' });
        await ins('wa_regua_envios', { asaas_payment_id: id, etapa: 'pular', detalhe: 'pulado no admin' }, true); return res.json({ ok: true });
      }
      case 'cliente_status': {
        if (!UUID.test(b.id || '') || !['ativo', 'pausado'].includes(b.status)) return res.json({ ok: false, erro: 'dados' });
        await upd('wa_clientes', { id: b.id }, { status: b.status, pausado_por_regua: false, updated_at: agoraIso() }); return res.json({ ok: true });
      }
      case 'regua_simular': return res.json(await rodarRegua({ simularSomente: true }));
      case 'senhas': return res.json({ ok: true, lista: (await get('onboarding_senhas', {}, 'nicho asc', 200)) || [] });
      case 'senha_salvar': {
        const s = b.senha || {}; const o = { nicho: txt(s.nicho, 60), senha: txt(s.senha, 60), url_formulario: txt(s.url_formulario, 300) || null, observacao: txt(s.observacao, 200) || null, ativo: s.ativo !== false };
        if (!o.nicho || !o.senha) return res.json({ ok: false, erro: 'nicho e senha são obrigatórios' });
        if (!urlOk(o.url_formulario)) return res.json({ ok: false, erro: 'link do formulário: use https' });
        if (s.id) { if (!UUID.test(s.id)) return res.json({ ok: false, erro: 'id' }); return res.json({ ok: true, senha: await upd('onboarding_senhas', { id: s.id }, o) }); }
        return res.json({ ok: true, senha: await ins('onboarding_senhas', o) });
      }
      case 'senha_remover': { if (!UUID.test(b.id || '')) return res.json({ ok: false, erro: 'id' }); await del('onboarding_senhas', { id: b.id }); return res.json({ ok: true }); }
      case 'config': {
        const o = {}; for (const k of CONFIG_CHAVES) o[k] = await cfg(k, null);
        return res.json({ ok: true, valores: o, padroes: { manual_ia: MANUAL_IA_PADRAO, textos_menu: MENU_PADRAO, horario: HORARIO_PADRAO, whatsapp_comercial: WHATSAPP_COMERCIAL_PADRAO, ia_pausa_quando_equipe_responde_horas: 12, proposta_whatsapp_auto: true, avisos: [], numeros_alerta: [] } });
      }
      case 'config_salvar': {
        if (!CONFIG_CHAVES.includes(b.chave)) return res.json({ ok: false, erro: 'chave' });
        const v = validarConfig(b.chave, b.valor); if (v == null) return res.json({ ok: false, erro: 'valor inválido' });
        await salvarConfig(b.chave, v); return res.json({ ok: true });
      }
      case 'templates': {
        const r = await listarTemplates();
        const meta = r.ok ? r.lista : [];
        return res.json({ ok: true, erro: r.ok ? null : r.erro, lista: TEMPLATES.map((t) => { const m = meta.find((x) => x.name === t.name); return { name: t.name, texto: t.texto, status: m ? m.status : 'não criado', categoria: m ? m.category : '', motivo: m ? m.rejected_reason : '' }; }) });
      }
      case 'templates_criar': {
        const r0 = await listarTemplates(); if (!r0.ok) return res.json({ ok: false, erro: r0.erro });
        const existentes = new Set(r0.lista.map((x) => x.name)); const out = [];
        for (const t of TEMPLATES) {
          if (existentes.has(t.name)) { out.push({ name: t.name, ok: true, ja: true }); continue; }
          const r = await criarTemplate(templateParaMeta(t)); out.push({ name: t.name, ok: r.ok, erro: r.ok ? null : r.erro });
        }
        return res.json({ ok: true, resultado: out });
      }
      case 'teste_envio': {
        const tel = normTel(process.env.TESTE_WHATSAPP); if (!tel) return res.json({ ok: false, erro: 'falta a variável TESTE_WHATSAPP' });
        if (!waConfigurado()) return res.json({ ok: false, erro: 'faltam WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID' });
        const r = b.template ? await template(tel, 'retomar_conversa', ['isaque', 'o teste do atendimento'], { origem: 'sistema' }) : await texto(tel, 'teste do atendimento studio pulga 💫', { origem: 'sistema' });
        return res.json(r.ok ? { ok: true, simulado: !!r.simulado } : { ok: false, erro: r.erro });
      }
      default: return res.json({ ok: false, erro: 'ação desconhecida' });
    }
  } catch (e) {
    console.error('wa admin', a, e && e.message);
    if (e && e.semSql) return res.json({ ok: false, erro: 'falta rodar o SQL db/2026-11-26_studio_os.sql no Supabase', sem_sql: true });
    const m = String(e && e.message || '');
    return res.json({ ok: false, erro: /does not exist|wa_get|function/i.test(m) ? 'banco ainda não preparado (rode o SQL db/2026-11-26_whatsapp.sql)' : 'erro no servidor' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const r = (req.query || {}).r;
  if (r === 'webhook') return webhookMeta(req, res);
  if (r === 'asaas') return webhookAsaas(req, res);
  if (r === 'regua') return cronRegua(req, res);
  if (r === 'admin') {
    if (req.method !== 'POST') return res.status(405).json({ ok: false });
    let b = {}; try { b = JSON.parse((await corpoCru(req)) || '{}'); } catch (e) { return res.status(400).json({ ok: false }); }
    return admin(req, res, b);
  }
  return res.status(404).json({ ok: false });
}
