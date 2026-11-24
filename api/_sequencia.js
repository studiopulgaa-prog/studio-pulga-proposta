// api/_sequencia.js — sequência de e-mails da proposta (lembrete / último aviso) e e-mails sazonais. Não é uma rota.
// Chamado só pelo cron (api/lembretes.js). Envio sempre pelo Resend (api/_resend.js).
// Regras: só 9h-11h (Brasília) em dia útil; nunca o mesmo e-mail duas vezes (reserva atômica no banco ANTES de enviar);
// para tudo se a proposta estiver fechada, oculta, sem e-mail, descadastrada ou se o cliente já escolheu plano.
import { enviarEmail as enviarResend, esc, emailValido, fmtValidade } from './_resend.js';
import { unsubUrl, WA } from './_email.js';
import { LINK_OK } from './_seg.js';
import { CAMPANHAS, FERIADOS, MAX_POR_ANO, MIN_DIAS_ENTRE, TOLERANCIA_DIAS, FINAL, BOTAO_PADRAO } from './_campanhas.js';

const DIA = 86400000, H = 3600000, BR = 3 * H; // Brasília = UTC-3 (sem horário de verão)
export const JANELA = { ini: 9, fim: 11 };      // envia de 9:00 até 10:59
export const diaBR = (ts) => Math.floor((ts - BR) / DIA);
export const horaBR = (ts) => Math.floor((((ts - BR) % DIA) + DIA) % DIA / H);
export const diaStr = (n) => new Date(n * DIA).toISOString().slice(0, 10);
const diaNum = (s) => Math.round(Date.parse(s + 'T00:00:00Z') / DIA);
const FER = new Set(FERIADOS);
export const ehUtil = (n) => { const w = new Date(n * DIA).getUTCDay(); return w >= 1 && w <= 5 && !FER.has(diaStr(n)); };
export const dentroDaJanela = (agora) => ehUtil(diaBR(agora)) && horaBR(agora) >= JANELA.ini && horaBR(agora) < JANELA.fim;

// ---------- Parte A: durante a proposta ----------
// Validade de 1 a 2 dias: só o ÚLTIMO AVISO ("vence hoje").  3 dias ou mais: LEMBRETE na metade + ÚLTIMO AVISO no dia anterior ao vencimento.
// Fim de semana/feriado: o aviso recua para o último dia útil antes (o texto muda para "vence em [data]").
const util_antes = (d, minimo) => { while (d > minimo && !ehUtil(d)) d--; return d > minimo ? d : null; };
const util_depois = (d) => { while (!ehUtil(d)) d++; return d; };
const enviado = (en, ...chaves) => chaves.some((k) => en && en[k]);

export function planoPropostas(dados, agora) {
  const hoje = diaBR(agora), out = [];
  for (const e of (dados && dados.propostas) || []) {
    const en = e.enviados || {};
    if (e.pe_status !== 'ativa' || !en.link) continue;                    // fechada, descadastrada, teste ou sem e-mail do link
    if (!emailValido(e.email) || !e.expira_em) continue;
    if (Number(e.emails_cliente) > 0) continue;                           // o cliente já escolheu plano
    if (!LINK_OK.test(e.pe_link || '')) continue;
    const expMs = Date.parse(e.expira_em);
    if (!(agora < expMs)) continue;                                       // não há e-mail de "expirou"
    const envDia = diaBR(Date.parse(en.link)), expDia = diaBR(expMs), gap = expDia - envDia;
    if (!(gap >= 1)) continue;
    // dia-alvo do último aviso: véspera do vencimento (ou o próprio dia, se a validade é de 1-2 dias e vence à tarde/noite)
    const venceDeManha = horaBR(expMs) < 12;
    const alvo = gap <= 2 && !venceDeManha ? expDia : expDia - 1;
    const avisoDia = util_antes(alvo, envDia);
    let lembDia = null;
    if (gap >= 3) {
      lembDia = util_depois(envDia + Math.floor(gap / 2));
      if (lembDia >= (avisoDia == null ? expDia : avisoDia)) lembDia = null;
    }
    const base = { lh: e.lh, email: e.email, cliente: e.cliente, link: e.pe_link, expira: e.expira_em };
    if (avisoDia != null && hoje >= avisoDia && !enviado(en, 'ultimo_aviso', 'vence', 'vence18')) {
      const d = expDia - hoje;
      out.push({ ...base, parte: 'A', tipo: 'ultimo_aviso', variante: d <= 0 ? 'hoje' : d === 1 ? 'amanha' : 'data' });
    } else if (lembDia != null && hoje >= lembDia && hoje < (avisoDia == null ? expDia : avisoDia) && !enviado(en, 'lembrete', 'curiosidade')) {
      out.push({ ...base, parte: 'A', tipo: 'lembrete' });
    }
  }
  return out;
}

// ---------- Parte B: sazonais (só para quem teve proposta que EXPIROU sem fechar) ----------
export function campanhasDevidas(hoje, campanhas = CAMPANHAS) {
  const ano = Number(diaStr(hoje).slice(0, 4)), r = [];
  for (const c of campanhas) {
    for (const a of [ano - 1, ano]) {                                      // cobre a tolerância na virada do ano
      const data = c.data || (c.anual ? `${a}-${c.anual}` : null);
      if (!data || (c.data && a !== ano - 1 && a !== ano)) continue;
      const dn = diaNum(data);
      if (hoje >= dn && hoje <= dn + TOLERANCIA_DIAS) r.push({ c, dn, ano: Number(data.slice(0, 4)) });
    }
  }
  return [...new Map(r.map((x) => [x.c.id + x.ano, x])).values()].sort((a, b) => a.dn - b.dn);
}

export function planoCampanhas(dados, agora, campanhas = CAMPANHAS) {
  const hoje = diaBR(agora);
  if (!ehUtil(hoje)) return [];
  const devidas = campanhasDevidas(hoje, campanhas);
  if (!devidas.length) return [];
  const anoHoje = Number(diaStr(hoje).slice(0, 4));
  const bloqueados = new Set(((dados && dados.bloqueados) || []).map((s) => String(s).toLowerCase()));
  const camps = (dados && dados.campanhas) || [];
  const porEmail = new Map();
  for (const p of (dados && dados.propostas) || []) if (p.email) { const k = p.email.toLowerCase(); (porEmail.get(k) || porEmail.set(k, []).get(k)).push(p); }
  const out = [];
  for (const [email, props] of porEmail) {
    if (!emailValido(email) || bloqueados.has(email)) continue;
    if (props.some((p) => p.pe_status === 'fechada' || p.pe_status === 'descadastrada' || Number(p.emails_cliente) > 0)) continue;
    if (props.some((p) => !p.expira_em || Date.parse(p.expira_em) > agora)) continue;       // ainda tem proposta válida: não é caso de sazonal
    const base = props.slice().sort((a, b) => Date.parse(b.expira_em) - Date.parse(a.expira_em))[0];
    if (!base.lh) continue;
    // último e-mail já enviado a este contato (proposta ou campanha) e quantas campanhas no ano
    let ultimo = -Infinity;
    for (const p of props) for (const [k, v] of Object.entries(p.enviados || {})) { if (k.endsWith('_pulado')) continue; const t = Date.parse(v); if (t === t) ultimo = Math.max(ultimo, diaBR(t)); }
    const minhas = camps.filter((c) => String(c.email).toLowerCase() === email);
    for (const c of minhas) ultimo = Math.max(ultimo, diaBR(Date.parse(c.enviado_em)));
    let qtdAno = minhas.filter((c) => Number(c.ano) === anoHoje).length;
    for (const x of devidas) {
      const c = x.c;
      if (minhas.some((m) => m.campanha === c.id && Number(m.ano) === x.ano)) continue;     // nunca repetir
      if (c.publico === 'arquitetos' && base.modelo === 'loja') continue;
      if (c.publico === 'mulheres' && !props.some((p) => p.mulher === true)) continue;       // sem marcação, não envia
      if (hoje - ultimo < MIN_DIAS_ENTRE) continue;                                          // mínimo de dias entre e-mails
      if (qtdAno >= MAX_POR_ANO) continue;                                                   // máximo por ano
      out.push({ parte: 'B', email, lh: base.lh, cliente: base.cliente, tipo: 'campanha', campanha: c.id, ano: x.ano });
      break; // no máximo 1 e-mail por contato por execução
    }
  }
  return out;
}

// ---------- Modelos (mesmo visual do e-mail "Sua proposta": cabeçalho terracota, botão, rodapé) ----------
const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p.charAt(0).toUpperCase() + p.slice(1) : 'você'; };
const para = (t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#4a3a33">${t}</p>`;
const botao = (href, txt) => `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:26px auto"><tr><td style="background:#6E2C14;border-radius:50px"><a href="${esc(href)}" style="display:inline-block;padding:15px 34px;color:#F4EADD;font-weight:700;font-size:15px;text-decoration:none;letter-spacing:.02em">${esc(txt)}</a></td></tr></table>`;
export const ASSINATURA = 'Os pulguinhas do Studio Pulga';
export const whatsapp = (msg) => `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;

function moldura({ assunto, pre, kicker, corpo, lh }) {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#F4EADD;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F4EADD">${esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EADD"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#6E2C14;padding:28px 30px;text-align:center"><div style="font-family:'Arial Black',Arial,sans-serif;font-size:26px;font-weight:900;letter-spacing:.04em;color:#F4EADD">STUDIO PULGA</div><div style="font-size:11px;letter-spacing:.18em;color:#d9bfae;margin-top:6px">${esc(kicker)}</div></td></tr>
<tr><td style="padding:34px 32px 8px">${corpo}<p style="margin:0 0 26px;font-size:16px;line-height:1.65;color:#4a3a33">Um abraço,<br><strong style="color:#6E2C14">${esc(ASSINATURA)}</strong></p></td></tr>
<tr><td style="background:#EAD8C5;padding:20px;text-align:center;font-size:12px;line-height:1.6;color:#6b5a50"><strong>Studio Pulga</strong> · Praia Grande, SP · (13) 9 9605-7099<br><a href="${esc(unsubUrl(lh))}" style="color:#6b5a50">Não quero mais receber estes e-mails</a></td></tr>
</table></td></tr></table></body></html>`;
  return html;
}
const virarTexto = (paragrafos, botaoTxt, href, lh) => `${paragrafos.join('\n\n')}\n\n${botaoTxt}: ${href}\n\nUm abraço,\n${ASSINATURA}\nStudio Pulga · Praia Grande, SP · (13) 9 9605-7099\nPara parar de receber: ${unsubUrl(lh)}`;
const oi = (nome) => `<p style="margin:0 0 16px;font-size:18px;line-height:1.5;color:#6E2C14;font-weight:700">Olá, ${esc(nome)}!</p>`;

export function emailLembrete({ cliente, link, expira, lh }) {
  const nome = primeiroNome(cliente), val = fmtValidade(expira);
  const assunto = `Ei, ${nome}! Sua proposta ainda tá por aqui 👀`;
  const p1 = 'Conheço alguém que ainda não se decidiu, mas a gente tá por aqui, em? 😄';
  const p2 = `Sua proposta segue aberta até ${val}. Luz, câmera e gravação, com roteiros, direção criativa e vantagens exclusivas esperando você. Bora criar com os pulguinhas?`;
  const html = moldura({ assunto, pre: `Sua proposta segue aberta até ${val}.`, kicker: 'SUA PROPOSTA', lh,
    corpo: oi(nome) + para(esc(p1)) + para(esc(p2)) + botao(link, 'Ver minha proposta') });
  return { assunto, html, texto: virarTexto([`Olá, ${nome}!`, p1, p2], 'Ver minha proposta', link, lh) };
}

export function emailUltimoAviso({ cliente, link, expira, lh, variante }) {
  const nome = primeiroNome(cliente), val = fmtValidade(expira);
  const dataCurta = val.split(' às ')[0];
  const quando = { amanha: 'Amanhã', hoje: 'Hoje', data: `Em ${dataCurta}` }[variante] || 'Em breve';
  const assunto = variante === 'data' ? `Última chamada, ${nome}! A proposta vence em ${dataCurta}` : `Última chamada, ${nome}! ${quando} a proposta vai embora`;
  const p1 = variante === 'data'
    ? `Lets go? Em ${val}, ela vence e a gente segue pro próximo da fila. Quer fechar, ajustar ou pedir um tempinho a mais? Responde aqui, sem cerimônia.`
    : `Lets go? ${quando}, ${val}, ela vence e a gente segue pro próximo da fila. Quer fechar, ajustar ou pedir um tempinho a mais? Responde aqui, sem cerimônia.`;
  const html = moldura({ assunto, pre: `Sua proposta vence ${variante === 'hoje' ? 'hoje' : 'em ' + dataCurta}.`, kicker: 'ÚLTIMA CHAMADA', lh,
    corpo: oi(nome) + para(esc(p1)) + botao(link, 'Ver minha proposta') });
  return { assunto, html, texto: virarTexto([`Olá, ${nome}!`, p1], 'Ver minha proposta', link, lh) };
}

export function emailCampanha({ cliente, lh, camp }) {
  const nome = primeiroNome(cliente), c = camp;
  const msg = whatsapp(`Olá! Recebi o e-mail da Studio Pulga (${c.assunto.replace(/[^\p{L}\p{N} ,.!?'-]/gu, '').trim()}) e quero conversar.`);
  const ps = [...c.corpo, FINAL];
  const html = moldura({ assunto: c.assunto, pre: c.corpo[0].slice(0, 90), kicker: 'ESTAMOS POR AQUI', lh,
    corpo: oi(nome) + ps.map((t) => para(esc(t))).join('') + botao(msg, c.botao || BOTAO_PADRAO) });
  return { assunto: c.assunto, html, texto: virarTexto([`Olá, ${nome}!`, ...ps], c.botao || BOTAO_PADRAO, msg, lh) };
}

// ---------- Execução ----------
// deps: { rpc, enviar(opts)->{ok,...} }. ativo=false => só simula (devolve o que enviaria, sem enviar e sem gravar nada).
export async function rodar({ agora, rpc, enviar = enviarResend, ativo = false, campanhas = CAMPANHAS, ignorarJanela = false }) {
  const res = { agora: new Date(agora).toISOString(), dia: diaStr(diaBR(agora)), hora: horaBR(agora), util: ehUtil(diaBR(agora)), enviados: [], pulados: [] };
  if (!ignorarJanela && !dentroDaJanela(agora)) { res.fora_da_janela = true; return res; }
  const dados = await rpc('seq_dados', {});
  const plano = [...planoPropostas(dados, agora), ...planoCampanhas(dados, agora, campanhas)];
  for (const it of plano) {
    const rotulo = it.parte === 'A' ? { lh: it.lh, tipo: it.tipo, variante: it.variante } : { campanha: it.campanha, ano: it.ano };
    if (!ativo) { res.enviados.push({ ...rotulo, para: it.email, simulado: true }); continue; }
    try {
      let reservou;
      if (it.parte === 'A') reservou = await rpc('seq_reservar', { p_lh: it.lh, p_tipo: it.tipo });
      else reservou = await rpc('seq_reservar_campanha', { p_email: it.email, p_campanha: it.campanha, p_ano: it.ano, p_lh: it.lh });
      if (!reservou) { res.pulados.push({ ...rotulo, motivo: 'ja_enviado' }); continue; }
      const m = it.parte === 'B' ? emailCampanha({ cliente: it.cliente, lh: it.lh, camp: campanhas.find((c) => c.id === it.campanha) })
        : it.tipo === 'lembrete' ? emailLembrete(it) : emailUltimoAviso(it);
      const r = await enviar({
        para: it.email, assunto: m.assunto, html: m.html, texto: m.texto,
        idempotencia: it.parte === 'A' ? `seq-${it.lh}-${it.tipo}` : `camp-${it.email}-${it.campanha}-${it.ano}`,
        cabecalhos: { 'List-Unsubscribe': `<${unsubUrl(it.lh)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      if (!r.ok) {   // falhou: libera a reserva para tentar de novo no próximo dia útil dentro da tolerância
        if (it.parte === 'A') await rpc('seq_liberar', { p_lh: it.lh, p_tipo: it.tipo });
        else await rpc('seq_liberar_campanha', { p_email: it.email, p_campanha: it.campanha, p_ano: it.ano });
        res.pulados.push({ ...rotulo, motivo: 'falha', codigo: r.codigo });
        if (r.codigo === 'sem_chave') break;
        continue;
      }
      res.enviados.push({ ...rotulo, para: it.email });
    } catch (err) {
      console.error('sequencia', rotulo, err && err.message);
      res.pulados.push({ ...rotulo, motivo: 'erro' });
    }
  }
  return res;
}
