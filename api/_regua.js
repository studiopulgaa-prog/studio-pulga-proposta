// api/_regua.js — régua de cobrança pelo WhatsApp (roda 1x por dia) e reação aos eventos do Asaas. Não é uma rota.
// O Asaas continua gerando a cobrança, o link, a nota e o e-mail. Aqui só saem os avisos de WhatsApp (sem duplicar com o Asaas).
// Etapas (dias corridos desde o vencimento, fuso de São Paulo): D-3, D0, D+2, D+5 (aviso de pausa), D+6 (pausa), D+10 (equipe), D+60 (alerta).
import { get, um, ins, upd, agoraIso, alerta } from './_wadb.js';
import { template, ativo as waAtivo } from './_wa.js';
import { abertosEntre, abertosDoCliente, pagamento, asaasConfigurado, brl, dataBR } from './_asaas.js';
import { avisarEquipe } from './_atendimento.js';

const DIA = 86400000;
export const ETAPAS = [
  { etapa: 'D-3', de: -3, ate: -1 },
  { etapa: 'D0', de: 0, ate: 1 },
  { etapa: 'D+2', de: 2, ate: 4 },
  { etapa: 'D+5', de: 5, ate: 9 },
  { etapa: 'D+6_pausa', de: 6, ate: 9999, exige: 'D+5' },
  { etapa: 'D+10_humano', de: 10, ate: 9999 },
  { etapa: 'D+60_alerta', de: 60, ate: 9999, exige: 'D+10_humano' },
];
export const hojeBR = (ms = Date.now()) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const ymdNum = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / DIA;
export const diasDesde = (venc, hoje) => ymdNum(hoje) - ymdNum(String(venc).slice(0, 10));
const soma = (ymd, d) => new Date((ymdNum(ymd) + d) * DIA).toISOString().slice(0, 10);
const inicioDoDiaBR = (ymd) => new Date(Date.parse(ymd + 'T00:00:00-03:00')).toISOString();

// escolhe no máximo UMA etapa por pagamento por dia. feitas = {etapa: enviado_em}
export function proximaEtapa(dias, feitas, hoje) {
  if (feitas.pular) return null;
  if (Object.values(feitas).some((em) => hojeBR(Date.parse(em)) === hoje)) return null;   // já teve envio hoje
  let escolhida = null;
  for (const e of ETAPAS) {
    if (dias < e.de || dias > e.ate || feitas[e.etapa]) continue;
    if (e.exige && !feitas[e.exige]) continue;   // D+5 nunca é pulado antes da pausa
    escolhida = e;
  }
  // D+5 pendente tem prioridade sobre pausa/alertas (o aviso precisa vir antes)
  if (dias >= 5 && dias <= 9 && !feitas['D+5'] && !feitas['D+6_pausa']) return ETAPAS.find((x) => x.etapa === 'D+5');
  return escolhida;
}

function varsDe(etapa, { nome, p, cli }) {
  const venc = dataBR(p.vencimento), valor = brl(p.valor), link = p.link || 'https://www.asaas.com';
  const clausula = cli.clausula_atraso ? `conforme a cláusula ${cli.clausula_atraso} do contrato` : 'conforme o contrato';
  switch (etapa) {
    case 'D-3': return ['lembrete_vencimento', [nome, venc, valor, link]];
    case 'D0': return ['cobranca_hoje', [nome, valor, link]];
    case 'D+2': return ['pagamento_nao_identificado', [nome, venc, valor, link]];
    case 'D+5': return ['aviso_atraso_pausa', [nome, venc, valor, clausula, link]];
    case 'D+6_pausa': return ['servicos_pausados', [nome, venc, link]];
    default: return [null, []];
  }
}
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || 'tudo bem';

async function responsaveis(clienteId) {
  const L = await get('wa_contatos', { cliente_id: clienteId, perfil: 'responsavel', ativo: true, 'verificado_em!=': null }, null, 10);
  return L || [];
}
async function conversaDe(tel) {
  return (await um('wa_conversas', { telefone: tel })) || (await ins('wa_conversas', { telefone: tel }, true)) || (await um('wa_conversas', { telefone: tel }));
}
async function mandarTemplate(cli, nomeTpl, vars) {
  const rs = await responsaveis(cli.id);
  const out = [];
  for (const c of rs) {
    const conv = await conversaDe(c.telefone);
    const v = vars.slice(); v[0] = primeiroNome(c.nome || cli.nome_contato || cli.nome);
    out.push(await template(c.telefone, nomeTpl, v, { origem: 'regua', conversa_id: conv && conv.id }));
  }
  return { n: rs.length, resultados: out };
}

export async function rodarRegua({ agora = Date.now(), simularSomente = false } = {}) {
  if (!asaasConfigurado()) return { ok: false, motivo: 'falta ASAAS_API_KEY' };
  const hoje = hojeBR(agora);
  const r = await abertosEntre(soma(hoje, -65), soma(hoje, 3));
  if (!r.ok) return { ok: false, motivo: 'asaas: ' + r.erro };
  const clientes = await get('wa_clientes', { 'asaas_customer_id!=': null, 'status!=': 'encerrado' }, null, 1000);
  const porCustomer = {}; (clientes || []).forEach((c) => { porCustomer[c.asaas_customer_id] = c; });
  const relatorio = [];
  for (const p of r.lista) {
    const cli = porCustomer[p.cliente];
    if (!cli) continue;
    const dias = diasDesde(p.vencimento, hoje);
    const envios = await get('wa_regua_envios', { asaas_payment_id: p.id }, null, 20);
    const feitas = {}; (envios || []).forEach((e) => { feitas[e.etapa] = e.enviado_em; });
    const e = proximaEtapa(dias, feitas, hoje);
    if (!e) continue;
    if (e.etapa === 'D+6_pausa' && feitas['D+5'] && Date.parse(feitas['D+5']) >= Date.parse(inicioDoDiaBR(hoje))) continue;
    relatorio.push({ cliente: cli.nome, pagamento: p.id, dias, etapa: e.etapa });
    if (simularSomente) continue;
    // confere de novo no Asaas antes de qualquer aviso de atraso
    if (dias >= 2) { const pr = await pagamento(p.id); if (!pr.ok || !['PENDING', 'OVERDUE'].includes(pr.p.status)) continue; }
    // "reserva" a etapa (UNIQUE): se outra execução já fez, não repete
    const reserva = await ins('wa_regua_envios', { asaas_payment_id: p.id, cliente_id: cli.id, etapa: e.etapa, simulado: !waAtivo() }, true);
    if (!reserva) continue;
    try {
      if (e.etapa === 'D+10_humano') {
        await alerta('d10', { cliente_id: cli.id, resumo: `10 dias de atraso (${brl(p.valor)}, venc. ${dataBR(p.vencimento)}): régua parou, decisão da equipe` });
        for (const c of await responsaveis(cli.id)) { const conv = await conversaDe(c.telefone); if (conv) await upd('wa_conversas', { id: conv.id }, { modo: 'humano', humano_desde: agoraIso(), humano_ate: new Date(Date.now() + 7 * DIA).toISOString() }); }
        await avisarEquipe(`10 dias de atraso: ${brl(p.valor)} vencido em ${dataBR(p.vencimento)}. a régua parou`, cli.nome);
        continue;
      }
      if (e.etapa === 'D+60_alerta') {
        await alerta('d60', { cliente_id: cli.id, resumo: `60 dias de atraso: o contrato permite rescisão com notificação formal (decisão só da equipe)` });
        continue;
      }
      if (e.etapa === 'D+6_pausa') {
        if (!cli.pausa_automatica) { await alerta('pausa', { cliente_id: cli.id, resumo: 'atraso de 6 dias; pausa automática desligada para este cliente (nada foi enviado)' }); await upd('wa_regua_envios', { id: reserva.id }, { detalhe: 'pausa_automatica_off' }); continue; }
        await upd('wa_clientes', { id: cli.id }, { status: 'pausado', pausado_por_regua: true, updated_at: agoraIso() });
        await alerta('pausa', { cliente_id: cli.id, resumo: `serviços pausados por atraso (${brl(p.valor)}, venc. ${dataBR(p.vencimento)})` });
        await avisarEquipe(`serviços PAUSADOS por atraso: ${brl(p.valor)} vencido em ${dataBR(p.vencimento)}`, cli.nome);
      }
      const [tpl, vars] = varsDe(e.etapa, { nome: '', p, cli });
      const env = await mandarTemplate(cli, tpl, vars);
      if (!env.n) {
        await upd('wa_regua_envios', { id: reserva.id }, { detalhe: 'sem_responsavel_verificado' });
        if (['D+5', 'D+6_pausa'].includes(e.etapa)) await avisarEquipe(`etapa ${e.etapa} da cobrança sem WhatsApp de responsável verificado (só o e-mail do Asaas foi)`, cli.nome);
      } else await upd('wa_regua_envios', { id: reserva.id }, { detalhe: env.resultados.map((x) => (x.ok ? (x.simulado ? 'simulado' : 'ok') : 'erro')).join(',') });
    } catch (err) {
      console.error('regua', e.etapa, err && err.message);
      await upd('wa_regua_envios', { id: reserva.id }, { detalhe: 'erro: ' + String(err && err.message).slice(0, 120) });
    }
  }
  return { ok: true, hoje, modo: waAtivo() ? 'envio' : 'simulacao', etapas: relatorio };
}

// ---- eventos do Asaas (webhook)
export async function eventoAsaas(ev) {
  const p = ev && ev.payment;
  if (!p || !p.id || !p.customer) return { ok: true, ignorado: true };
  const cli = await um('wa_clientes', { asaas_customer_id: p.customer });
  if (!cli) return { ok: true, sem_cliente: true };
  if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH'].includes(ev.event)) {
    const reserva = await ins('wa_regua_envios', { asaas_payment_id: p.id, cliente_id: cli.id, etapa: 'pago', simulado: !waAtivo() }, true);
    if (!reserva) return { ok: true, repetido: true };
    let voltou = false;
    if (cli.status === 'pausado' && cli.pausado_por_regua) {
      const ab = await abertosDoCliente(cli.asaas_customer_id);
      const aindaAtrasado = ab.ok && ab.lista.some((x) => x.status === 'OVERDUE' && x.id !== p.id);
      if (!aindaAtrasado) {
        await upd('wa_clientes', { id: cli.id }, { status: 'ativo', pausado_por_regua: false, updated_at: agoraIso() });
        voltou = true;
        await avisarEquipe(`pagamento recebido: serviços reativados (${brl(p.value)})`, cli.nome);
      }
    }
    const envios = await get('wa_regua_envios', { asaas_payment_id: p.id }, null, 20);
    const teveCobranca = (envios || []).some((x) => ['D+2', 'D+5', 'D+6_pausa', 'D+10_humano'].includes(x.etapa));
    if (voltou || teveCobranca) {
      await mandarTemplate(cli, 'pagamento_confirmado', ['', brl(p.value), voltou ? 'os serviços já voltaram com tudo.' : 'tudo em dia por aqui.']);
    }
    return { ok: true, pago: true, reativado: voltou };
  }
  return { ok: true };
}
