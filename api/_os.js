// api/_os.js — dados do Studio OS (Início, Clientes, ficha, Financeiro, busca, app de atendimento). Não é uma rota.
// Chamado por api/wa.js (rota /api/admin/wa, que exige sessão). Asaas é SÓ leitura.
import { rpc } from './_email.js';
import { get, um, ins, upd, contar, agoraIso, config, salvarConfig } from './_wadb.js';
import { texto as waTexto, normTel } from './_wa.js';
import { abertosEntre, abertosDoCliente, ultimosPagos, recebidosEntre, asaasConfigurado, brl, dataBR } from './_asaas.js';
import { hojeBR, diasDesde, proximaEtapa } from './_regua.js';
import { chavePublica, pushConfigurado, notificar } from './_push.js';

const H = 3600000, DIA = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, n);
const ymd = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const soma = (L) => Math.round(L.reduce((a, p) => a + Number(p.valor || 0), 0) * 100) / 100;

// ---- o SQL do Studio OS já foi rodado? (tabela wa_notas liberada). Guardado por 60 s.
let SQL = { t: 0, ok: false };
export async function sqlPronto() {
  if (Date.now() - SQL.t < 60000) return SQL.ok;
  try { await contar('wa_notas', {}); SQL = { t: Date.now(), ok: true }; } catch (e) { SQL = { t: Date.now(), ok: false }; }
  return SQL.ok;
}
const exigeSql = async () => { if (!(await sqlPronto())) throw Object.assign(new Error('sql'), { semSql: true }); };

// ---- Asaas com cache curto (o Início abre várias vezes por dia; o Asaas não precisa ser lido a cada toque)
const CACHE = {};
async function cache(chave, ms, f) {
  const c = CACHE[chave];
  if (c && Date.now() - c.t < ms) return c.v;
  const v = await f(); if (v && v.ok) CACHE[chave] = { t: Date.now(), v };
  return v;
}
const mesDe = (ms) => { const d = ymd(ms); return { de: d.slice(0, 8) + '01', ate: d }; };
function mesAnterior(ms) {
  const d = new Date(ymd(ms) + 'T12:00:00Z'); const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const fimMesmoDia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, Math.min(d.getUTCDate(), new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).getUTCDate())));
  return { de: ini.toISOString().slice(0, 10), ate: fimMesmoDia.toISOString().slice(0, 10) };
}
async function abertos() { return cache('abertos', 3 * 60000, () => abertosEntre(ymd(Date.now() - 120 * DIA), ymd(Date.now() + 45 * DIA))); }

async function clientesMapa() {
  const cli = (await get('wa_clientes', {}, 'nome asc', 1000)) || [];
  const porAsaas = {}; cli.forEach((c) => { if (c.asaas_customer_id) porAsaas[c.asaas_customer_id] = c; });
  return { cli, porAsaas };
}

// situação financeira de cada cliente: em dia / vence hoje / atrasado X dias / pausado
function situacoes(cli, porAsaas, lista, hoje) {
  const s = {};
  cli.forEach((c) => { s[c.id] = { st: c.status === 'pausado' ? 'pausado' : c.status === 'encerrado' ? 'encerrado' : c.asaas_customer_id ? 'em_dia' : 'sem_asaas', dias: 0, aberto: 0 }; });
  (lista || []).forEach((p) => {
    const c = porAsaas[p.cliente]; if (!c) return;
    const d = diasDesde(p.vencimento, hoje), x = s[c.id];
    x.aberto += Number(p.valor || 0);
    if (d > 0 && x.st !== 'pausado') { x.st = 'atrasado'; x.dias = Math.max(x.dias, d); }
    else if (d === 0 && x.st === 'em_dia') x.st = 'vence_hoje';
  });
  return s;
}

// ================= Início =================
export async function inicio(u) {
  const agora = Date.now(), hoje = hojeBR(agora);
  const out = { ok: true, usuario: u, agora: new Date(agora).toISOString() };
  // conversas: quem precisa de resposta (com a equipe ou pedindo humano), com tempo esperando
  const convs = (await get('wa_conversas', {}, 'ultima_msg_em desc', 200)) || [];
  const contatos = (await get('wa_contatos', { ativo: true }, null, 1000)) || [];
  const { cli, porAsaas } = await clientesMapa();
  const nomeCli = {}; cli.forEach((c) => { nomeCli[c.id] = c.nome; });
  const pf = {}; contatos.forEach((c) => { pf[c.telefone] = c; });
  const espera = convs.filter((c) => c.modo === 'humano' && !c.resolvida_em && c.ultima_msg_cliente_em && (!c.ultima_msg_em || Date.parse(c.ultima_msg_cliente_em) >= Date.parse(c.ultima_msg_em) - 1000 || c.nao_lidas > 0));
  out.responder = espera.map((c) => ({ id: c.id, nome: (pf[c.telefone] && pf[c.telefone].nome) || c.nome_wa || 'Contato', cliente: nomeCli[c.cliente_id] || '', atendente: c.atendente || null, esperando_min: Math.max(0, Math.round((agora - Date.parse(c.ultima_msg_cliente_em)) / 60000)), nao_lidas: c.nao_lidas }))
    .sort((a, b) => b.esperando_min - a.esperando_min);
  out.kpi = { aguardando: out.responder.length, nao_lidas: convs.reduce((a, c) => a + (c.nao_lidas || 0), 0) };
  // atividade do WhatsApp (mensagens recebidas recentes)
  const msgs = (await get('wa_mensagens', { direcao: 'in', 'created_at>=': new Date(agora - 7 * DIA).toISOString() }, 'created_at desc', 30)) || [];
  const telNome = (t) => (pf[t] && pf[t].nome) || (convs.find((c) => c.telefone === t) || {}).nome_wa || 'Contato';
  out.atividade = msgs.map((m) => ({ tipo: 'mensagem', em: m.created_at, titulo: 'Mensagem de ' + telNome(m.telefone), conversa_id: m.conversa_id }));
  if (u !== 'isaque' || !asaasConfigurado()) { out.financeiro = u === 'isaque' ? { erro: 'falta a variável ASAAS_API_KEY no Vercel' } : null; return out; }
  // financeiro (só Isaque)
  const meta = (await config('metas', {})) || {};
  const m0 = mesDe(agora), m1 = mesAnterior(agora);
  const [rec, recAnt, ab] = await Promise.all([cache('rec' + m0.de + m0.ate, 3 * 60000, () => recebidosEntre(m0.de, m0.ate)), cache('rec' + m1.de + m1.ate, 30 * 60000, () => recebidosEntre(m1.de, m1.ate)), abertos()]);
  if (!rec.ok || !ab.ok) { out.financeiro = { erro: 'Asaas: ' + (rec.erro || ab.erro) }; return out; }
  const atras = ab.lista.filter((p) => diasDesde(p.vencimento, hoje) > 0), vhoje = ab.lista.filter((p) => diasDesde(p.vencimento, hoje) === 0);
  const sit = situacoes(cli, porAsaas, ab.lista, hoje);
  const envios = (await get('wa_regua_envios', { 'enviado_em>=': new Date(agora - 40 * DIA).toISOString() }, 'enviado_em desc', 500)) || [];
  const fila = [];
  vhoje.forEach((p) => { const c = porAsaas[p.cliente]; if (c) fila.push({ tipo: 'vence_hoje', cliente: c.nome, cliente_id: c.id, dias: 0, valor: brl(p.valor) }); });
  atras.forEach((p) => {
    const c = porAsaas[p.cliente]; if (!c) return;
    const d = diasDesde(p.vencimento, hoje), et = envios.filter((e) => e.asaas_payment_id === p.id).map((e) => e.etapa);
    fila.push({ tipo: c.status === 'pausado' ? 'pausado' : et.includes('D+5') && !et.includes('D+6_pausa') ? 'aviso_pausa' : 'atrasada', cliente: c.nome, cliente_id: c.id, dias: d, valor: brl(p.valor) });
  });
  cli.filter((c) => c.status === 'pausado' && !fila.some((f) => f.cliente_id === c.id)).forEach((c) => fila.push({ tipo: 'pausado', cliente: c.nome, cliente_id: c.id, dias: null, valor: '' }));
  const ordem = { pausado: 0, aviso_pausa: 1, atrasada: 2, vence_hoje: 3 };
  fila.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || (b.dias || 0) - (a.dias || 0));
  out.financeiro = {
    recebido: soma(rec.lista), recebido_ant: recAnt.ok ? soma(recAnt.lista) : null, meta: Number(meta.recebido_mes) || null,
    aberto: soma(ab.lista.filter((p) => diasDesde(p.vencimento, hoje) <= 0)), atrasado: soma(atras), n_atrasadas: atras.length,
    pausados: cli.filter((c) => c.status === 'pausado').length, fila,
  };
  out.metas = { fechadas_mes: Number(meta.propostas_fechadas_mes) || null };
  rec.lista.slice().sort((a, b) => String(b.pago_em).localeCompare(String(a.pago_em))).slice(0, 10).forEach((p) => {
    const c = porAsaas[p.cliente]; out.atividade.push({ tipo: 'pagamento', em: p.pago_em + 'T12:00:00-03:00', titulo: 'Pagamento recebido' + (c ? ' · ' + c.nome : ''), cliente_id: c ? c.id : null });
  });
  return out;
}

// ================= Clientes =================
export async function clientesOS(u) {
  const { cli, porAsaas } = await clientesMapa();
  const ct = (await get('wa_contatos', {}, null, 2000)) || [];
  const senhas = (await get('onboarding_senhas', {}, null, 200)) || [];
  let sit = null, erroAsaas = null;
  if (asaasConfigurado()) { const ab = await abertos(); if (ab.ok) sit = situacoes(cli, porAsaas, ab.lista, hojeBR()); else erroAsaas = ab.erro; }
  return {
    ok: true, erro_asaas: erroAsaas,
    lista: cli.map((c) => {
      const s = sit ? sit[c.id] : null;
      return {
        id: c.id, nome: c.nome, contato: c.nome_contato || '', status: c.status, plano: c.plano || '', vencimento_dia: c.vencimento_dia,
        numeros: ct.filter((x) => x.cliente_id === c.id && x.ativo).length,
        responsavel_ok: ct.some((x) => x.cliente_id === c.id && x.ativo && x.perfil === 'responsavel' && x.verificado_em),
        onboarding: c.onboarding_senha_id ? ((senhas.find((x) => x.id === c.onboarding_senha_id) || {}).nicho || 'senha') : '',
        financeiro: c.status === 'pausado' ? 'pausado' : s ? s.st : (c.asaas_customer_id ? 'desconhecido' : 'sem_asaas'),
        dias_atraso: s && s.st === 'atrasado' ? s.dias : 0,
        drive: !!c.drive_url, manual: !!c.manual_gravacao_url,
      };
    }),
  };
}

export async function ficha(u, id) {
  if (!UUID.test(id || '')) return { ok: false, erro: 'id' };
  const c = await um('wa_clientes', { id }); if (!c) return { ok: false, erro: 'não encontrado' };
  const ct = (await get('wa_contatos', { cliente_id: id }, 'created_at asc', 50)) || [];
  const tels = ct.map((x) => x.telefone);
  const convs = ((await get('wa_conversas', { cliente_id: id }, 'ultima_msg_em desc', 20)) || []);
  for (const t of tels) if (!convs.some((v) => v.telefone === t)) { const v = await um('wa_conversas', { telefone: t }); if (v) convs.push(v); }
  const linha = [];
  for (const v of convs.slice(0, 6)) {
    const L = (await get('wa_mensagens', { conversa_id: v.id }, 'created_at desc', 25)) || [];
    L.forEach((m) => linha.push({ tipo: m.interno ? 'comentario' : m.direcao === 'in' ? 'msg_in' : 'msg_out', em: m.created_at, texto: textoMsg(m), origem: m.origem, autor: m.autor || null, conversa_id: v.id }));
  }
  const alertas = (await get('wa_alertas', { cliente_id: id }, 'created_at desc', 30)) || [];
  alertas.forEach((a) => linha.push({ tipo: 'alerta', em: a.created_at, texto: a.resumo || a.tipo, resolvido: !!a.resolvido_em }));
  let notas = [];
  if (await sqlPronto()) { notas = (await get('wa_notas', { cliente_id: id }, 'criado_em desc', 100)) || []; notas.forEach((n) => linha.push({ tipo: 'nota', em: n.criado_em, texto: n.texto, autor: n.autor })); }
  const out = {
    ok: true,
    cliente: { id: c.id, nome: c.nome, contato: c.nome_contato, status: c.status, plano: c.plano || '', vencimento_dia: c.vencimento_dia, drive_url: c.drive_url, manual_gravacao_url: c.manual_gravacao_url, onboarding_url: c.onboarding_url, tem_senha: !!c.onboarding_senha_id, observacoes: c.observacoes, criado_em: c.created_at },
    contatos: ct.map((x) => ({ id: x.id, nome: x.nome, telefone: x.telefone, perfil: x.perfil, verificado: !!x.verificado_em, ativo: x.ativo })),
    conversas: convs.map((v) => ({ id: v.id, telefone: v.telefone, modo: v.modo, ultima: v.ultima_msg_em, nao_lidas: v.nao_lidas })),
    notas, sql: await sqlPronto(),
  };
  if (u === 'isaque') {
    out.cliente.cnpj = c.cnpj; out.cliente.email_responsavel = c.email_responsavel; out.cliente.asaas_customer_id = c.asaas_customer_id;
    if (c.asaas_customer_id && asaasConfigurado()) {
      const [ab, pg] = await Promise.all([abertosDoCliente(c.asaas_customer_id), ultimosPagos(c.asaas_customer_id, 6)]);
      const hoje = hojeBR();
      out.financeiro = { abertos: ab.ok ? ab.lista.map((p) => ({ id: p.id, valor: brl(p.valor), vencimento: dataBR(p.vencimento), dias: diasDesde(p.vencimento, hoje), link: p.link })) : [], pagos: pg.map((p) => ({ valor: brl(p.valor), vencimento: dataBR(p.vencimento), pago_em: p.pago_em })), erro: ab.ok ? null : ab.erro };
      pg.forEach((p) => linha.push({ tipo: 'pagamento', em: (p.pago_em || p.vencimento) + 'T12:00:00-03:00', texto: 'Pagamento recebido · ' + brl(p.valor) }));
      const env = (await get('wa_regua_envios', { cliente_id: id }, 'enviado_em desc', 30)) || [];
      out.financeiro.regua = env.map((e) => ({ etapa: e.etapa, em: e.enviado_em, simulado: e.simulado }));
      env.forEach((e) => linha.push({ tipo: 'regua', em: e.enviado_em, texto: 'Régua de cobrança: ' + e.etapa + (e.simulado ? ' (simulação)' : '') }));
    }
  } else {
    // a Ju vê só a situação (sem valores)
    let s = c.status === 'pausado' ? 'pausado' : 'desconhecido';
    if (c.asaas_customer_id && asaasConfigurado() && c.status !== 'pausado') { const ab = await abertosDoCliente(c.asaas_customer_id); if (ab.ok) { const d = Math.max(0, ...ab.lista.map((p) => diasDesde(p.vencimento, hojeBR()))); s = d > 0 ? 'atrasado' : 'em_dia'; } }
    out.situacao = s;
  }
  linha.sort((a, b) => String(b.em).localeCompare(String(a.em)));
  out.linha = linha.slice(0, 120);
  return out;
}
export function textoMsg(m) {
  const c = m.conteudo || {};
  if (m.tipo === 'template') return '[modelo: ' + (c.name || '') + ']';
  if (m.tipo === 'interactive') return (c.body && c.body.text) || '[menu]';
  return c.texto || c.body || (m.tipo === 'nota' ? '' : '[' + m.tipo + ']');
}

export async function notaAdd(u, clienteId, t) {
  await exigeSql();
  if (!UUID.test(clienteId || '')) return { ok: false, erro: 'cliente' };
  const texto = txt(t, 4000); if (!texto) return { ok: false, erro: 'anotação vazia' };
  return { ok: true, nota: await ins('wa_notas', { cliente_id: clienteId, autor: u, texto }) };
}

export async function senhaDoCliente(id) {
  if (!UUID.test(id || '')) return { ok: false, erro: 'id' };
  const c = await um('wa_clientes', { id }); if (!c || !c.onboarding_senha_id) return { ok: false, erro: 'cliente sem senha de onboarding' };
  const s = await um('onboarding_senhas', { id: c.onboarding_senha_id }); if (!s) return { ok: false, erro: 'senha não encontrada' };
  return { ok: true, nicho: s.nicho, senha: s.senha, url: s.url_formulario || c.onboarding_url || '' };
}

// ================= Financeiro (Isaque) =================
export async function financeiro() {
  if (!asaasConfigurado()) return { ok: false, erro: 'falta a variável ASAAS_API_KEY no Vercel' };
  const agora = Date.now(), hoje = hojeBR(agora), m0 = mesDe(agora), m1 = mesAnterior(agora);
  const [rec, recAnt, ab] = await Promise.all([cache('rec' + m0.de + m0.ate, 3 * 60000, () => recebidosEntre(m0.de, m0.ate)), cache('rec' + m1.de + m1.ate, 30 * 60000, () => recebidosEntre(m1.de, m1.ate)), abertos()]);
  if (!rec.ok || !ab.ok) return { ok: false, erro: 'Asaas: ' + (rec.erro || ab.erro) };
  const { cli, porAsaas } = await clientesMapa();
  const envios = (await get('wa_regua_envios', {}, 'enviado_em desc', 1000)) || [];
  const nome = {}; cli.forEach((c) => { nome[c.id] = c.nome; });
  const cob = ab.lista.map((p) => {
    const c = porAsaas[p.cliente], d = diasDesde(p.vencimento, hoje);
    const env = envios.filter((e) => e.asaas_payment_id === p.id);
    const feitas = {}; env.forEach((e) => { feitas[e.etapa] = e.enviado_em; });
    const prox = proximaEtapa(d, feitas, hoje);
    return { id: p.id, cliente: c ? c.nome : '(sem vínculo)', cliente_id: c ? c.id : null, status_cliente: c ? c.status : null, valor: brl(p.valor), valor_n: Number(p.valor || 0), vencimento: dataBR(p.vencimento), venc_iso: p.vencimento, dias: d, status: p.status, link: p.link,
      etapas: env.map((e) => ({ etapa: e.etapa, em: e.enviado_em, simulado: e.simulado })), proxima: feitas.pular ? 'régua pulada' : prox ? prox.etapa : (d < -3 ? 'D-3 em ' + (-3 - d) + ' dia(s)' : '—') };
  }).sort((a, b) => b.dias - a.dias);
  return {
    ok: true,
    kpi: { recebido: soma(rec.lista), recebido_ant: recAnt.ok ? soma(recAnt.lista) : null, meta: Number(((await config('metas', {})) || {}).recebido_mes) || null,
      a_receber: soma(ab.lista.filter((p) => diasDesde(p.vencimento, hoje) <= 0)), atrasado: soma(ab.lista.filter((p) => diasDesde(p.vencimento, hoje) > 0)), pausados: cli.filter((c) => c.status === 'pausado').length },
    cobrancas: cob,
    historico: envios.slice(0, 200).map((e) => ({ cliente: nome[e.cliente_id] || '', etapa: e.etapa, em: e.enviado_em, simulado: e.simulado, detalhe: e.detalhe })),
  };
}

// ================= busca global =================
export async function busca(u, q) {
  q = txt(q, 60).replace(/[%_]/g, ''); if (q.length < 2) return { ok: true, clientes: [], conversas: [], propostas: [] };
  const dig = q.replace(/\D/g, '');
  const [c1, c2, v1, v2, k1] = await Promise.all([
    get('wa_clientes', { 'nome~*': q }, 'nome asc', 8),
    dig.length >= 4 ? get('wa_clientes', { 'cnpj~*': dig }, 'nome asc', 8) : [],
    get('wa_conversas', { 'nome_wa~*': q }, 'ultima_msg_em desc', 8),
    dig.length >= 4 ? get('wa_conversas', { 'telefone~*': dig }, 'ultima_msg_em desc', 8) : [],
    get('wa_contatos', { 'nome~*': q }, null, 8),
  ]);
  const cl = {}; [].concat(c1 || [], c2 || []).forEach((c) => { cl[c.id] = { id: c.id, nome: c.nome, status: c.status }; });
  const cv = {}; [].concat(v1 || [], v2 || []).forEach((v) => { cv[v.id] = { id: v.id, nome: v.nome_wa || v.telefone.slice(-4), modo: v.modo }; });
  for (const k of (k1 || [])) { const v = await um('wa_conversas', { telefone: k.telefone }); if (v) cv[v.id] = { id: v.id, nome: k.nome || v.nome_wa, modo: v.modo }; }
  let pr = [];
  try { const r = await rpc('adm_listar2', { p_limite: 8, p_cursor: null, p_tipo: null, p_status: null, p_busca: q, p_testes: false }); pr = ((r && r.lista) || []).map((p) => ({ id: p.id, cliente: p.cliente, status: p.status, follow: p.follow })); } catch (e) { pr = []; }
  return { ok: true, clientes: Object.values(cl).slice(0, 8), conversas: Object.values(cv).slice(0, 8), propostas: pr };
}

// ================= app de atendimento =================
const estadoConv = (c, cliId) => (c.resolvida_em ? 'resolvida' : c.modo === 'humano' ? (c.atendente ? 'equipe' : 'aguardando') : !(cliId || c.cliente_id) ? 'visitante' : 'ia');
export async function inbox(u, desde) {
  const filtroDesde = desde && !isNaN(Date.parse(desde)) ? new Date(Date.parse(desde) - 2000).toISOString() : null;
  let L;
  if (filtroDesde) {
    const [a, b] = await Promise.all([get('wa_conversas', { 'ultima_msg_em>=': filtroDesde }, 'ultima_msg_em desc', 100), get('wa_conversas', { 'updated_at>=': filtroDesde }, 'updated_at desc', 100)]);
    const m = {}; [].concat(a || [], b || []).forEach((c) => { m[c.id] = c; }); L = Object.values(m);
  } else L = (await get('wa_conversas', { 'ultima_msg_em!=': null }, 'ultima_msg_em desc', 150)) || [];
  const ct = (await get('wa_contatos', {}, null, 2000)) || []; const pf = {}; ct.forEach((c) => { pf[c.telefone] = c; });
  const cli = (await get('wa_clientes', {}, null, 1000)) || []; const nm = {}; cli.forEach((c) => { nm[c.id] = c.nome; });
  const ult = (await get('wa_mensagens', { 'created_at>=': new Date(Date.now() - 60 * DIA).toISOString() }, 'created_at desc', 600)) || [];
  const prev = {}; ult.forEach((m) => { if (!prev[m.conversa_id] && !m.interno) prev[m.conversa_id] = m; });
  return {
    ok: true, agora: new Date().toISOString(), parcial: !!filtroDesde,
    lista: L.filter((c) => c.ultima_msg_em).map((c) => {
      const p = prev[c.id], k = pf[c.telefone], cid = c.cliente_id || (k && k.verificado_em && k.cliente_id) || null;
      return { id: c.id, nome: (k && k.nome) || c.nome_wa || '', telefone_fim: String(c.telefone).slice(-4), cliente: nm[cid] || '', cliente_id: cid,
        perfil: k ? k.perfil : '', verificado: !!(k && k.verificado_em), estado: estadoConv(c, cid), atendente: c.atendente || null, nao_lidas: c.nao_lidas || 0,
        ultima: c.ultima_msg_em, previa: p ? String(textoMsg(p)).slice(0, 120) : '', previa_de: p ? (p.direcao === 'in' ? 'cliente' : p.origem) : '',
        janela_ate: c.ultima_msg_cliente_em ? new Date(Date.parse(c.ultima_msg_cliente_em) + 24 * H).toISOString() : null };
    }).sort((a, b) => String(b.ultima).localeCompare(String(a.ultima))),
  };
}

export async function conversa(u, id, desde) {
  if (!UUID.test(id || '')) return { ok: false, erro: 'id' };
  const c = await um('wa_conversas', { id }); if (!c) return { ok: false, erro: 'não encontrada' };
  const k = await um('wa_contatos', { telefone: c.telefone });
  const cli = c.cliente_id ? await um('wa_clientes', { id: c.cliente_id }) : (k && k.cliente_id ? await um('wa_clientes', { id: k.cliente_id }) : null);
  const f = { conversa_id: id }; if (desde && !isNaN(Date.parse(desde))) f['created_at>'] = new Date(Date.parse(desde) - 1000).toISOString();
  const L = (await get('wa_mensagens', f, 'created_at desc', 200)) || [];
  // abrir = ler
  const set = { nao_lidas: 0 }; if (await sqlPronto()) set.lida_em = agoraIso();
  if (c.nao_lidas || set.lida_em) await upd('wa_conversas', { id }, set);
  return {
    ok: true, agora: new Date().toISOString(),
    conversa: { id: c.id, nome: (k && k.nome) || c.nome_wa || '', telefone: c.telefone, estado: estadoConv(c, cli && cli.id), modo: c.modo, atendente: c.atendente || null, humano_ate: c.humano_ate,
      janela_ate: c.ultima_msg_cliente_em ? new Date(Date.parse(c.ultima_msg_cliente_em) + 24 * H).toISOString() : null,
      perfil: k ? k.perfil : '', verificado: !!(k && k.verificado_em), cliente: cli ? { id: cli.id, nome: cli.nome } : null },
    lista: L.reverse().map((m) => ({ id: m.id, direcao: m.direcao, origem: m.origem, tipo: m.tipo, texto: textoMsg(m), status: m.status, simulado: m.simulado, erro: m.erro, autor: m.autor || null, interno: !!m.interno, em: m.created_at })),
  };
}

export async function enviarEquipe(u, id, t) {
  if (!UUID.test(id || '')) return { ok: false, erro: 'id' };
  const c = await um('wa_conversas', { id }); if (!c) return { ok: false, erro: 'não encontrada' };
  const msg = txt(t, 4000); if (!msg) return { ok: false, erro: 'mensagem vazia' };
  if (!(c.ultima_msg_cliente_em && Date.parse(c.ultima_msg_cliente_em) > Date.now() - 24 * H)) return { ok: false, erro: 'janela de 24h fechada: use o modelo "retomar conversa"', janela: false };
  const r = await waTexto(c.telefone, msg, { origem: 'equipe_admin', conversa_id: c.id, autor: u });
  // a equipe respondeu: a IA fica quieta pelo tempo configurado (padrão 12 h)
  const horas = Number(await config('ia_pausa_quando_equipe_responde_horas', 12)) || 12;
  const set = { modo: 'humano', humano_desde: agoraIso(), humano_ate: new Date(Date.now() + horas * H).toISOString(), ultima_msg_em: agoraIso(), nao_lidas: 0 };
  if (await sqlPronto()) { if (!c.atendente) set.atendente = u; set.resolvida_em = null; }
  await upd('wa_conversas', { id }, set);
  return r.ok ? { ok: true, simulado: !!r.simulado } : { ok: false, erro: r.erro };
}

export async function comentario(u, id, t) {
  await exigeSql();
  if (!UUID.test(id || '')) return { ok: false, erro: 'id' };
  const c = await um('wa_conversas', { id }); if (!c) return { ok: false, erro: 'não encontrada' };
  const msg = txt(t, 2000); if (!msg) return { ok: false, erro: 'comentário vazio' };
  // comentário interno: só é gravado; nunca passa pela função de envio
  await ins('wa_mensagens', { conversa_id: id, telefone: c.telefone, direcao: 'out', origem: 'equipe_admin', tipo: 'nota', conteudo: { texto: msg }, interno: true, autor: u, status: 'interno', simulado: true });
  return { ok: true };
}

export async function acaoConversa(u, id, tipo) {
  if (!UUID.test(id || '')) return { ok: false, erro: 'id' };
  const c = await um('wa_conversas', { id }); if (!c) return { ok: false, erro: 'não encontrada' };
  const sql = await sqlPronto();
  let set;
  if (tipo === 'assumir') { set = { modo: 'humano', humano_desde: agoraIso(), humano_ate: new Date(Date.now() + 24 * H).toISOString() }; if (sql) { set.atendente = u; set.resolvida_em = null; } }
  else if (tipo === 'devolver') { set = { modo: 'ia', humano_ate: null }; if (sql) set.atendente = null; }
  else if (tipo === 'resolver') { set = { modo: 'ia', humano_ate: null, nao_lidas: 0 }; if (!sql) return { ok: false, erro: 'rode o SQL db/2026-11-26_studio_os.sql para usar "Resolver"' }; set.atendente = null; set.resolvida_em = agoraIso(); }
  else return { ok: false, erro: 'ação' };
  await upd('wa_conversas', { id }, set);
  return { ok: true };
}

// respostas rápidas (as duas pessoas podem editar)
export async function respostas() { const r = await config('respostas_rapidas', null); return { ok: true, lista: Array.isArray(r) ? r : RESPOSTAS_PADRAO }; }
export async function respostasSalvar(L) {
  if (!Array.isArray(L) || L.length > 40) return { ok: false, erro: 'lista inválida' };
  const v = L.map((x) => ({ titulo: txt(x && x.titulo, 40), texto: txt(x && x.texto, 1000) })).filter((x) => x.titulo && x.texto);
  await salvarConfig('respostas_rapidas', v); return { ok: true, lista: v };
}
const RESPOSTAS_PADRAO = [
  { titulo: 'Já vejo', texto: 'oi! já estou vendo isso pra você, só um instante 💫' },
  { titulo: 'Retorno hoje', texto: 'anotei aqui! te dou um retorno ainda hoje, combinado?' },
  { titulo: 'Drive', texto: 'pode mandar os arquivos pelo Drive do seu projeto que a gente já organiza por aqui ✨' },
  { titulo: 'Obrigada', texto: 'imagina! qualquer coisa é só chamar 🤍' },
];

// ---- push: inscrição do aparelho
export async function pushChave() { return { ok: true, chave: chavePublica(), configurado: pushConfigurado(), sql: await sqlPronto() }; }
export async function pushInscrever(u, s, aparelho) {
  await exigeSql();
  const endpoint = txt(s && s.endpoint, 800), p256dh = txt(s && s.keys && s.keys.p256dh, 200), auth = txt(s && s.keys && s.keys.auth, 100);
  if (!/^https:\/\/[^\s]+$/.test(endpoint) || !p256dh || !auth) return { ok: false, erro: 'inscrição inválida' };
  const ja = await um('wa_push', { endpoint });
  const dados = { usuario: u, p256dh, auth, aparelho: txt(aparelho, 80) || null, ativo: true, falhas: 0 };
  if (ja) await upd('wa_push', { id: ja.id }, dados); else await ins('wa_push', { endpoint, ...dados });
  return { ok: true };
}
export async function pushSair(endpoint) { await exigeSql(); const e = txt(endpoint, 800); if (e) await upd('wa_push', { endpoint: e }, { ativo: false }); return { ok: true }; }
export async function pushTeste(u) { const r = await notificar({ titulo: 'Notificações ligadas', corpo: 'É assim que as mensagens vão chegar neste celular.', url: '/atendimento.html', tag: 'teste', para: [u] }); return r.ok ? { ok: true, enviados: r.enviados } : { ok: false, erro: r.motivo === 'sem_vapid' ? 'faltam as variáveis VAPID no Vercel' : r.motivo === 'sem_sql' ? 'rode o SQL do Studio OS' : 'não foi possível enviar' }; }

// ---- metas (Ajustes)
export async function metasGet() { return { ok: true, metas: (await config('metas', {})) || {} }; }
export async function metasSalvar(m) {
  const n = (v, max) => { const x = Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x * 100) / 100 : null; };
  const v = { recebido_mes: n(m && m.recebido_mes, 10000000), propostas_fechadas_mes: n(m && m.propostas_fechadas_mes, 1000) };
  await salvarConfig('metas', v); return { ok: true, metas: v };
}
export { normTel };
