// api/_sequencia.js — sequência de e-mails da proposta (lembrete / último aviso) e e-mails sazonais. Não é uma rota.
// Chamado só pelo cron (api/lembretes.js). Envio sempre pelo Resend (api/_resend.js).
// Regras: só 9h-11h (Brasília) em dia útil; nunca o mesmo e-mail duas vezes (reserva atômica no banco ANTES de enviar);
// para tudo se a proposta estiver fechada, oculta, sem e-mail, descadastrada ou se o cliente já escolheu plano.
import { esc, emailValido, fmtValidade, emailProposta } from './_resend.js';
import { enviarRegistrado, registrar } from './_envio.js';
import { unsubUrl, WA, SITE } from './_email.js';
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

// situação de follow-up (vem do banco). Sem o campo (dados antigos): "escolheu" = já mandou o pedido por e-mail.
const escolheu = (p) => (p.follow === undefined ? Number(p.emails_cliente) > 0 : p.follow === 'escolheu' || p.follow === 'fechou');
const paraLembretes = (p) => escolheu(p) || p.follow === 'perdido';

export function planoPropostas(dados, agora) {
  const hoje = diaBR(agora), out = [];
  for (const e of (dados && dados.propostas) || []) {
    const en = e.enviados || {};
    if (e.pe_status !== 'ativa' || !en.link) continue;                    // fechada, descadastrada, teste ou sem e-mail do link
    if (!emailValido(e.email) || !e.expira_em) continue;
    if (paraLembretes(e)) continue;                                       // escolheu, fechou ou perdido: sem lembretes
    if (!LINK_OK.test(e.pe_link || '')) continue;
    const expMs = Date.parse(e.expira_em);
    if (!(agora < expMs)) continue;                                       // não há e-mail de "expirou"
    // "Ainda não decidiu": a contagem recomeça na data da marcação (lembretes religados)
    const inicio = e.follow === 'nao_decidiu' && e.follow_em ? Math.max(Date.parse(en.link), Date.parse(e.follow_em)) : Date.parse(en.link);
    const envDia = diaBR(inicio), expDia = diaBR(expMs), gap = expDia - envDia;
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
    const base = { lh: e.lh, id: e.id, email: e.email, cliente: e.cliente, link: e.pe_link, expira: e.expira_em };
    if (avisoDia != null && hoje >= avisoDia && !enviado(en, 'ultimo_aviso', 'vence', 'vence18')) {
      const d = expDia - hoje;
      out.push({ ...base, parte: 'A', tipo: 'ultimo_aviso', variante: d <= 0 ? 'hoje' : d === 1 ? 'amanha' : 'data' });
    } else if (lembDia != null && hoje >= lembDia && hoje < (avisoDia == null ? expDia : avisoDia) && !enviado(en, 'lembrete', 'curiosidade')) {
      out.push({ ...base, parte: 'A', tipo: 'lembrete' });
    }
  }
  return out;
}

export const nichoDe = (p) => p.nicho || (p.modelo === 'loja' ? 'loja' : 'arquiteto');

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
    if (props.some((p) => ['fechada', 'descadastrada', 'pausada'].includes(p.pe_status) || escolheu(p))) continue;   // escolheu/fechou: sem sazonais (perdido continua)
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
      if (c.publico === 'arquitetos' && nichoDe(base) !== 'arquiteto') continue;              // Milão e Dia do Arquiteto: só Arquiteto/Designer
      if (c.publico === 'mulheres' && !props.some((p) => p.mulher === true)) continue;       // sem marcação, não envia
      if (c.publico === 'construtoras' && nichoDe(base) !== 'construtora') continue;
      if (c.publico === 'lojas' && nichoDe(base) !== 'loja') continue;
      if (hoje - ultimo < MIN_DIAS_ENTRE) continue;                                          // mínimo de dias entre e-mails
      if (qtdAno >= MAX_POR_ANO) continue;                                                   // máximo por ano
      out.push({ parte: 'B', email, lh: base.lh, id: base.id, cliente: base.cliente, tipo: 'campanha', campanha: c.id, ano: x.ano });
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

function moldura({ assunto, pre, kicker, corpo, lh, semRodape }) {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#F4EADD;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F4EADD">${esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EADD"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#6E2C14;padding:28px 30px;text-align:center"><div style="font-family:'Arial Black',Arial,sans-serif;font-size:26px;font-weight:900;letter-spacing:.04em;color:#F4EADD">STUDIO PULGA</div><div style="font-size:11px;letter-spacing:.18em;color:#d9bfae;margin-top:6px">${esc(kicker)}</div></td></tr>
<tr><td style="padding:34px 32px 8px">${corpo}<p style="margin:0 0 26px;font-size:16px;line-height:1.65;color:#4a3a33">Um abraço,<br><strong style="color:#6E2C14">${esc(ASSINATURA)}</strong></p></td></tr>
<tr><td style="background:#EAD8C5;padding:20px;text-align:center;font-size:12px;line-height:1.6;color:#6b5a50"><strong>Studio Pulga</strong> · Praia Grande, SP · (13) 9 9605-7099${semRodape ? '' : `<br><a href="${esc(unsubUrl(lh))}" style="color:#6b5a50">Não quero mais receber estes e-mails</a>`}</td></tr>
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
export const LIMITE_DIA = 20;      // trava contra disparo acidental: no máximo 20 e-mails automáticos por dia
export const MAX_TENTATIVAS = 3;   // falhou 3 vezes: para de tentar e fica como "erro" no painel
export const chaveDe = (it) => (it.parte === 'A' ? `seq:${it.lh}:${it.tipo}` : `camp:${it.email}:${it.campanha}:${it.ano}`);
const ROTULO = { lembrete: 'Lembrete', ultimo_aviso: 'Último aviso' };
export const rotuloItem = (it, campanhas = CAMPANHAS) => (it.parte === 'B' ? 'Sazonal: ' + ((campanhas.find((c) => c.id === it.campanha) || {}).assunto || it.campanha) : ROTULO[it.tipo] || it.tipo);

export function montarItem(it, campanhas = CAMPANHAS) {
  if (it.parte === 'B') return emailCampanha({ cliente: it.cliente, lh: it.lh, camp: campanhas.find((c) => c.id === it.campanha) });
  return it.tipo === 'lembrete' ? emailLembrete(it) : emailUltimoAviso(it);
}

// o que sai hoje (com a trava diária e sem o que já falhou 3 vezes)
export function planoDoDia(dados, agora, campanhas = CAMPANHAS, jaHoje = 0) {
  const falhas = (dados && dados.falhas) || {};
  const todos = [...planoPropostas(dados, agora), ...planoCampanhas(dados, agora, campanhas)];
  const desistidos = todos.filter((it) => (falhas[chaveDe(it)] || 0) >= MAX_TENTATIVAS);
  const validos = todos.filter((it) => (falhas[chaveDe(it)] || 0) < MAX_TENTATIVAS);
  const vagas = Math.max(0, LIMITE_DIA - jaHoje);
  return { itens: validos.slice(0, vagas), adiados: validos.slice(vagas), desistidos };
}

// previsão dos próximos dias úteis (painel e resumo semanal): simula as reservas sem tocar no banco
export function previsao(dados, agora, dias = 7, campanhas = CAMPANHAS) {
  const d = JSON.parse(JSON.stringify(dados || {}));
  d.campanhas = d.campanhas || [];
  const out = [];
  let dia = diaBR(agora);
  if (horaBR(agora) >= JANELA.fim) dia += 1;
  const fim = diaBR(agora) + dias;
  for (; dia <= fim; dia++) {
    if (!ehUtil(dia)) continue;
    const ts = dia * DIA + BR + 9.5 * H;                        // 9:30 de Brasília
    const { itens, adiados } = planoDoDia(d, ts, campanhas, dia === diaBR(agora) ? Number(d.enviados_hoje || 0) : 0);
    for (const it of itens) {
      out.push({ data: diaStr(dia), email: it.email, cliente: it.cliente, lh: it.lh, tipo: it.tipo, campanha: it.campanha || null, rotulo: rotuloItem(it, campanhas) });
      const iso = new Date(ts).toISOString();
      if (it.parte === 'A') { const p = d.propostas.find((x) => x.lh === it.lh); if (p) p.enviados = { ...(p.enviados || {}), [it.tipo]: iso }; }
      else d.campanhas.push({ email: it.email, campanha: it.campanha, ano: it.ano, enviado_em: iso });
    }
    if (adiados.length) out.push({ data: diaStr(dia), aviso: `${adiados.length} e-mail(s) passariam do limite de ${LIMITE_DIA} por dia e ficam para o dia útil seguinte` });
  }
  return out;
}

// deps: { rpc, enviar(opts)->{ok,...} }. ativo=false => simulação: registra o que ENVIARIA (registrarSimulacao) e não envia nada.
export async function rodar({ agora, rpc, enviar = enviarRegistrado, ativo = false, campanhas = CAMPANHAS, ignorarJanela = false, registrarSimulacao = false }) {
  const res = { agora: new Date(agora).toISOString(), dia: diaStr(diaBR(agora)), hora: horaBR(agora), util: ehUtil(diaBR(agora)), enviados: [], pulados: [] };
  if (!ignorarJanela && !dentroDaJanela(agora)) { res.fora_da_janela = true; return res; }
  const dados = await rpc('seq_dados', {});
  const { itens, adiados, desistidos } = planoDoDia(dados, agora, campanhas, ativo ? Number(dados.enviados_hoje || 0) : 0);
  for (const it of desistidos) res.pulados.push({ chave: chaveDe(it), motivo: 'falhou_3_vezes' });
  if (adiados.length) {
    res.limite_diario = { limite: LIMITE_DIA, adiados: adiados.length };
    if (ativo || registrarSimulacao) await registrar({ modo: ativo ? 'envio' : 'simulacao', tipo: 'aviso_limite', status: 'aviso',
      erro: `${adiados.length} e-mail(s) passariam do limite de ${LIMITE_DIA} no dia ${res.dia}; ficaram para o próximo dia útil.` });
  }
  for (const it of itens) {
    const chave = chaveDe(it);
    const rotulo = it.parte === 'A' ? { lh: it.lh, tipo: it.tipo, variante: it.variante } : { campanha: it.campanha, ano: it.ano };
    if (!ativo) {
      res.enviados.push({ ...rotulo, para: it.email, simulado: true });
      if (registrarSimulacao) await registrar({ modo: 'simulacao', status: 'simulado', tipo: it.tipo, chave, lh: it.lh, proposta_id: it.id || null,
        email: it.email, assunto: montarItem(it, campanhas).assunto, campanha: it.campanha || null });
      continue;
    }
    try {
      const reservou = it.parte === 'A'
        ? await rpc('seq_reservar', { p_lh: it.lh, p_tipo: it.tipo })
        : await rpc('seq_reservar_campanha', { p_email: it.email, p_campanha: it.campanha, p_ano: it.ano, p_lh: it.lh });
      if (!reservou) { res.pulados.push({ ...rotulo, motivo: 'ja_enviado' }); continue; }
      const m = montarItem(it, campanhas);
      const tent = Number(((dados.falhas || {})[chave]) || 0);
      const r = await enviar({
        para: it.email, assunto: m.assunto, html: m.html, texto: m.texto, lh: it.lh, propostaId: it.id || null,
        tipo: it.tipo, chave, campanha: it.campanha || null, idempotencia: `${chave}:${tent}`,
      });
      if (!r.ok) {   // falhou: libera para tentar de novo no próximo ciclo (até 3 vezes no total)
        if (it.parte === 'A') await rpc('seq_liberar', { p_lh: it.lh, p_tipo: it.tipo });
        else await rpc('seq_liberar_campanha', { p_email: it.email, p_campanha: it.campanha, p_ano: it.ano });
        res.pulados.push({ ...rotulo, motivo: r.codigo === 'suprimido' ? 'suprimido' : 'falha', codigo: r.codigo, tentativa: tent + 1 });
        if (r.codigo === 'sem_chave' || r.codigo === 'banco') break;
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

// ---------- "Enviar teste para mim": os modelos com dados fictícios ----------
export function modelosTeste(campanhas = CAMPANHAS) {
  const exp = new Date(Date.now() + 3 * DIA).toISOString(), link = `${SITE}/p/exemplo-teste`, lh = 'teste';
  const base = { cliente: 'Cliente Teste', link, expira: exp, lh };
  const lista = [
    { id: 'sua-proposta', nome: 'Sua proposta (envio do link)', f: () => emailProposta(base) },
    { id: 'lembrete', nome: 'Lembrete (metade da validade)', f: () => emailLembrete(base) },
    { id: 'ultimo-amanha', nome: 'Último aviso (vence amanhã)', f: () => emailUltimoAviso({ ...base, variante: 'amanha' }) },
    { id: 'ultimo-hoje', nome: 'Último aviso (vence hoje)', f: () => emailUltimoAviso({ ...base, variante: 'hoje' }) },
    ...campanhas.map((c) => ({ id: 'camp-' + c.id, nome: 'Sazonal: ' + c.assunto, f: () => emailCampanha({ cliente: 'Cliente Teste', lh, camp: c }) })),
  ];
  return lista;
}

// ---------- Resumo semanal para o Isaque ----------
const fmtDia = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);
const linha = (a, b) => `<tr><td style="padding:6px 0;color:#6b5a50;font-size:14px">${esc(a)}</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#6E2C14;font-size:14px">${esc(b)}</td></tr>`;
export function emailResumo({ st, proximos, ativo, agora }) {
  const assunto = `Resumo semanal dos e-mails da Studio Pulga (${fmtDia(diaStr(diaBR(agora)))})`;
  const sim = st.simulados || [], av = st.avisos_limite || [];
  const prox = proximos.filter((x) => !x.aviso), avProx = proximos.filter((x) => x.aviso);
  const lista = (itens, f) => (itens.length ? `<ul style="margin:0 0 16px;padding-left:18px;font-size:13px;line-height:1.6;color:#4a3a33">${itens.slice(0, 40).map((x) => `<li>${f(x)}</li>`).join('')}${itens.length > 40 ? `<li>… e mais ${itens.length - 40}</li>` : ''}</ul>` : `<p style="margin:0 0 16px;font-size:13px;color:#6b5a50">Nada.</p>`);
  const h3 = (t) => `<p style="margin:18px 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#6E2C14;text-transform:uppercase">${esc(t)}</p>`;
  const corpo = `<p style="margin:0 0 14px;font-size:15px;color:#4a3a33">Modo atual: <strong style="color:${ativo ? '#1a7a3c' : '#b36b00'}">${ativo ? 'LIGADO (enviando aos clientes)' : 'SIMULAÇÃO (nada é enviado aos clientes)'}</strong></p>
${h3('Últimos 7 dias')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linha('Enviados', st.enviados || 0)}${linha('Entregues', st.entregues || 0)}${linha('Rejeitados', st.rejeitados || 0)}${linha('Marcados como spam', st.spam || 0)}${linha('Falhas no envio', st.erros || 0)}${linha('Descadastros', st.descadastros || 0)}${linha('Contatos bloqueados (novos)', st.suprimidos || 0)}</table>
${av.length ? h3('Atenção: limite diário') + lista(av, (x) => esc(x.detalhe || '')) : ''}
${ativo ? '' : h3('Teria sido enviado (simulação)') + lista(sim, (x) => `${esc(fmtDia(String(x.em).slice(0, 10)))} · ${esc(x.email)} · ${esc(x.campanha ? 'Sazonal ' + x.campanha : (ROTULO[x.tipo] || x.tipo))}`)}
${h3('Agendado para os próximos 7 dias')}${lista(prox, (x) => `${esc(fmtDia(x.data))} · ${esc(x.cliente || '')} (${esc(x.email)}) · ${esc(x.rotulo)}`)}${avProx.map((x) => `<p style="margin:0 0 8px;font-size:13px;color:#b3261e">${esc(fmtDia(x.data))}: ${esc(x.aviso)}</p>`).join('')}
<p style="margin:16px 0 0;font-size:13px;color:#6b5a50">Detalhes no admin, aba <strong>E-mails</strong>.</p>`;
  const html = moldura({ assunto, pre: `Enviados: ${st.enviados || 0} · Agendados: ${prox.length}`, kicker: 'RESUMO SEMANAL', lh: null, corpo, semRodape: true });
  const texto = [`Resumo semanal — modo ${ativo ? 'LIGADO' : 'SIMULAÇÃO'}`, `Enviados: ${st.enviados || 0} | Entregues: ${st.entregues || 0} | Rejeitados: ${st.rejeitados || 0} | Spam: ${st.spam || 0} | Falhas: ${st.erros || 0} | Descadastros: ${st.descadastros || 0}`,
    ...(av.map((x) => 'ATENÇÃO: ' + x.detalhe)), ativo ? '' : `Simulados: ${sim.length}`, 'Próximos 7 dias:', ...prox.map((x) => `${fmtDia(x.data)} ${x.email} ${x.rotulo}`)].filter(Boolean).join('\n');
  return { assunto, html, texto };
}
