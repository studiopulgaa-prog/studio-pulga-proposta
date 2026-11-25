// api/_atendimento.js — fluxo de cada mensagem recebida no WhatsApp (identificação, menu, IA, handoff). Não é uma rota.
// Regra de ouro: financeiro e dados do contrato só para número VERIFICADO com perfil "responsavel". Isso é checado aqui, no código.
import crypto from 'crypto';
import { get, um, ins, upd, contar, agoraIso, primeiraVez, config, alerta, mascTel, mascEmail } from './_wadb.js';
import { rpc } from './_email.js';
import { texto, lista, template, marcarLida, normTel, variantesTel } from './_wa.js';
import { enviarEmail, emailValido, esc } from './_resend.js';
import { responderIA, iaLigada, limparSaida, pedeHumano } from './_waia.js';
import { abertosDoCliente, pixCopiaCola, notaFiscal, ultimosPagos, brl, dataBR, asaasConfigurado } from './_asaas.js';
import { MENU_PADRAO, MENU_CLIENTE, MENU_VISITANTE, HORARIO_PADRAO, WHATSAPP_COMERCIAL_PADRAO, SITE_STUDIO } from './_watextos.js';

const H = 3600 * 1000;
const REVALIDAR_DIAS = 90;
const MAX_TENTATIVAS = 3, MAX_CODIGOS_DIA = 3, MAX_IA_HORA = 30;

// ---------- utilidades ----------
export function cnpjValido(c) {
  const d = String(c || '').replace(/\D/g, '');
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (n) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = pesos.reduce((a, p, i) => a + p * +d[i], 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === +d[12] && calc(13) === +d[13];
}
const hashCodigo = (codigo, tel) => crypto.createHmac('sha256', process.env.EMAIL_SECRET || '').update(`${tel}:${codigo}`).digest('hex');
const primeiro = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p.charAt(0).toLowerCase() + p.slice(1) : ''; };
const preenche = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
const diaBR = (ms = Date.now()) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
function partesBR(ms = Date.now()) {
  const o = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; });
  return { dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday), hora: Number(o.hour) % 24 };
}
async function avisosAtivos() {
  const L = await config('avisos', []);
  const hoje = diaBR();
  return (Array.isArray(L) ? L : []).filter((a) => a && a.inicio <= hoje && hoje <= (a.fim || a.inicio));
}
export async function dentroHorario(ms = Date.now()) {
  const h = await config('horario', HORARIO_PADRAO);
  const { dia, hora } = partesBR(ms);
  if ((await avisosAtivos()).some((a) => a.fechado !== false)) return false;
  return (h.dias || HORARIO_PADRAO.dias).includes(dia) && hora >= (h.inicio ?? 9) && hora < (h.fim ?? 18);
}
function quandoVolta(ms = Date.now()) {
  const { dia, hora } = partesBR(ms);
  if (dia >= 1 && dia <= 5 && hora < 9) return 'hoje a partir das 9h';
  if (dia >= 1 && dia <= 4) return 'amanhã a partir das 9h';
  return 'na segunda a partir das 9h';
}
const SAUDACAO_SO = /^(oi+e*|ola|olá|oie+|bom dia|boa tarde|boa noite|hello+u*|hey|e ai|eai|tudo bem\??|td bem\??|menu|inicio|início|opcoes|opções)[!.?\s]*$/i;
const FINANCEIRO = /(pag|boleto|pix|venc|nota fiscal|\bnf\b|fatura|cobran|valor|mensalidade|atras|juros|multa|comprovante)/i;

// ---------- leitura do estado ----------
async function contatoDoTelefone(tel) {
  for (const v of variantesTel(tel)) { const c = await um('wa_contatos', { telefone: v }); if (c) return c; }
  return null;
}
async function conversaDoTelefone(tel, nome) {
  let c = await um('wa_conversas', { telefone: tel });
  if (!c) c = await ins('wa_conversas', { telefone: tel, nome_wa: nome ? String(nome).slice(0, 80) : null }, true) || await um('wa_conversas', { telefone: tel });
  return c;
}
const salvarEstado = (conv, estado) => upd('wa_conversas', { id: conv.id }, { estado_fluxo: estado, updated_at: agoraIso() });

// ---------- envio com registro na conversa ----------
const op = (conv, origem) => ({ origem, conversa_id: conv.id });
async function diz(conv, t, origem = 'menu') { const r = await texto(conv.telefone, t, op(conv, origem)); return r; }
async function menuCliente(conv, nome) {
  const m = await config('textos_menu', MENU_PADRAO);
  return lista(conv.telefone, { corpo: preenche(m.saudacao_cliente || MENU_PADRAO.saudacao_cliente, { nome: nome || '' }).replace(/, !/, '!'), botao: 'ver opções', itens: MENU_CLIENTE }, op(conv, 'menu'));
}
async function menuVisitante(conv) {
  const m = await config('textos_menu', MENU_PADRAO);
  return lista(conv.telefone, { corpo: m.saudacao_visitante || MENU_PADRAO.saudacao_visitante, botao: 'ver opções', itens: MENU_VISITANTE }, op(conv, 'menu'));
}
async function txt(chave, vars = {}) { const m = await config('textos_menu', MENU_PADRAO); return preenche(m[chave] || MENU_PADRAO[chave], vars); }

// ---------- handoff ----------
export async function avisarEquipe(resumo, nomeCliente) {
  const nums = await config('numeros_alerta', []);
  for (const n of (Array.isArray(nums) ? nums : [])) {
    const tel = normTel(n && n.telefone);
    if (tel) { try { await template(tel, 'alerta_equipe', [String(resumo).slice(0, 200), String(nomeCliente || 'visitante').slice(0, 80)], { origem: 'sistema' }); } catch (e) { console.error('alerta wa', e && e.message); } }
  }
  const para = String(process.env.EMAIL_RESUMO || '').trim();
  if (emailValido(para)) {
    await enviarEmail({ para, assunto: 'Atendimento WhatsApp: ' + String(resumo).slice(0, 80).replace(/[\r\n]/g, ' '), html: `<p style="font-family:Arial;font-size:15px">${esc(resumo)}<br>Cliente: ${esc(nomeCliente || 'visitante')}</p><p style="font-family:Arial;font-size:15px"><a href="https://proposta.studiopulga.com.br/admin.html">Abrir o admin</a></p>` }).catch(() => {});
  }
}
export async function handoff(conv, { motivo, cliente, silencioso = false } = {}) {
  await upd('wa_conversas', { id: conv.id }, { modo: 'humano', humano_desde: agoraIso(), humano_ate: new Date(Date.now() + 24 * H).toISOString(), updated_at: agoraIso() });
  if (!silencioso) {
    const dentro = await dentroHorario();
    await diz(conv, dentro ? await txt('handoff') : await txt('handoff_fora', { quando: quandoVolta() }), 'sistema');
  }
  const resumo = motivo || 'cliente pediu para falar com a equipe';
  await alerta('handoff', { cliente_id: cliente ? cliente.id : null, conversa_id: conv.id, resumo });
  await avisarEquipe(resumo, cliente ? cliente.nome : (conv.nome_wa || 'visitante ' + mascTel(conv.telefone)));
}

// ---------- identificação (CNPJ + código por e-mail) ----------
async function pedirCnpj(conv, estado, motivo) {
  await salvarEstado(conv, { ...estado, passo: 'cnpj', motivo: motivo || null });
  await diz(conv, motivo === 'revalidar' ? 'faz um tempinho que não confirmamos seu número 💌 ' + (await txt('pedir_cnpj')) : await txt('pedir_cnpj'));
}
function bloqueado(conv, contato) {
  const agora = Date.now();
  const a = conv.estado_fluxo && conv.estado_fluxo.bloqueado_ate ? Date.parse(conv.estado_fluxo.bloqueado_ate) : 0;
  const b = contato && contato.bloqueado_ate ? Date.parse(contato.bloqueado_ate) : 0;
  return Math.max(a || 0, b || 0) > agora;
}
async function receberCnpj(conv, estado, t) {
  const cnpj = String(t || '').replace(/\D/g, '');
  if (!cnpjValido(cnpj)) {
    const n = (estado.erros_cnpj || 0) + 1;
    if (n >= 4) { await salvarEstado(conv, { ...estado, passo: null, erros_cnpj: 0 }); await diz(conv, 'tudo bem! se preferir, a equipe confirma com você 💫'); return menuVisitante(conv); }
    await salvarEstado(conv, { ...estado, erros_cnpj: n });
    return diz(conv, await txt('cnpj_invalido'));
  }
  const desde = new Date(Date.now() - 24 * H).toISOString();
  if ((await contar('wa_codigos', { telefone: conv.telefone, 'created_at>=': desde })) >= MAX_CODIGOS_DIA) {
    await salvarEstado(conv, { ...estado, passo: null });
    return diz(conv, await txt('limite_codigos'));
  }
  const cli = await um('wa_clientes', { cnpj, 'status!=': 'encerrado' });
  // resposta sempre igual, exista ou não o CNPJ (não confirmamos quem é cliente)
  await salvarEstado(conv, { ...estado, passo: 'codigo', erros_cnpj: 0, tentativas: estado.tentativas || 0 });
  if (cli && emailValido(cli.email_responsavel)) {
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await ins('wa_codigos', { telefone: conv.telefone, cliente_id: cli.id, codigo_hash: hashCodigo(codigo, conv.telefone), expira_em: new Date(Date.now() + 10 * 60000).toISOString() });
    const html = `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;background:#F4EADD;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="520" style="max-width:520px;width:100%;background:#fff;border-radius:14px"><tr><td style="background:#6E2C14;padding:22px;text-align:center;color:#F4EADD;font-weight:900;letter-spacing:.04em;font-size:22px">STUDIO PULGA</td></tr><tr><td style="padding:28px 30px;color:#4a3a33;font-size:16px;line-height:1.6"><p style="margin:0 0 14px">hellouuu! 💫</p><p style="margin:0 0 14px">alguém pediu para vincular o WhatsApp final <strong>${esc(conv.telefone.slice(-4))}</strong> ao atendimento do studio pulga da <strong>${esc(cli.nome)}</strong>. o código é:</p><p style="margin:0 0 18px;text-align:center;font-size:34px;letter-spacing:.3em;font-weight:700;color:#6E2C14">${codigo}</p><p style="margin:0 0 14px">ele vale por 10 minutos. é só mandar no WhatsApp do studio.</p><p style="margin:0;font-size:13px;color:#7d6a5c">não foi você nem alguém da sua equipe? ignore este e-mail e nos avise. nunca pedimos este código por telefone.</p></td></tr></table></td></tr></table></body></html>`;
    const r = await enviarEmail({ para: cli.email_responsavel, assunto: 'Seu código de confirmação — Studio Pulga', html, texto: `Código de confirmação do Studio Pulga: ${codigo} (vale 10 minutos). Não foi você? Ignore este e-mail.`, idempotencia: 'wa-cod-' + conv.telefone + '-' + Date.now() });
    if (!r.ok) console.error('codigo email', mascEmail(cli.email_responsavel), r.codigo);
  }
  return diz(conv, await txt('codigo_enviado', { email: '' }));
}
async function receberCodigo(conv, estado, t, contato) {
  const codigo = String(t || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(codigo)) {
    if (/\d{14}/.test(String(t).replace(/\D/g, ''))) return receberCnpj(conv, { ...estado, passo: 'cnpj' }, t);
    return diz(conv, 'me manda só os 6 números do código que chegou no e-mail 💌 (ou "cancelar" pra voltar)');
  }
  const L = await get('wa_codigos', { telefone: conv.telefone, usado_em: null }, 'created_at desc', 1);
  const c = L && L[0];
  if (!c || Date.parse(c.expira_em) < Date.now()) { await salvarEstado(conv, { ...estado, passo: null }); return diz(conv, await txt('codigo_expirado')); }
  if (c.codigo_hash !== hashCodigo(codigo, conv.telefone)) {
    const n = (estado.tentativas || 0) + 1;
    if (n >= MAX_TENTATIVAS) {
      const ate = new Date(Date.now() + 24 * H).toISOString();
      await salvarEstado(conv, { ...estado, passo: null, tentativas: 0, bloqueado_ate: ate });
      if (contato) await upd('wa_contatos', { id: contato.id }, { bloqueado_ate: ate, tentativas_codigo: 0 });
      await upd('wa_codigos', { id: c.id }, { usado_em: agoraIso() });
      await alerta('bloqueio', { conversa_id: conv.id, cliente_id: c.cliente_id, resumo: `número ${mascTel(conv.telefone)} bloqueado por 24h (3 códigos errados)` });
      await avisarEquipe(`número ${mascTel(conv.telefone)} bloqueado por 24h após 3 códigos errados`, null);
      return diz(conv, await txt('bloqueado'));
    }
    await salvarEstado(conv, { ...estado, tentativas: n });
    return diz(conv, await txt('codigo_errado', { n: MAX_TENTATIVAS - n }));
  }
  await upd('wa_codigos', { id: c.id }, { usado_em: agoraIso() });
  const cli = await um('wa_clientes', { id: c.cliente_id });
  let ct = contato;
  if (ct && ct.cliente_id === c.cliente_id) {
    ct = await upd('wa_contatos', { id: ct.id }, { verificado_em: agoraIso(), tentativas_codigo: 0, bloqueado_ate: null, ativo: true });
  } else if (ct) {
    ct = await upd('wa_contatos', { id: ct.id }, { cliente_id: c.cliente_id, perfil: 'equipe', verificado_em: agoraIso(), tentativas_codigo: 0, bloqueado_ate: null, ativo: true });
    await alerta('novo_numero', { cliente_id: c.cliente_id, conversa_id: conv.id, resumo: `número ${mascTel(conv.telefone)} mudou de cliente e entrou como equipe` });
  } else {
    ct = await ins('wa_contatos', { cliente_id: c.cliente_id, telefone: conv.telefone, nome: conv.nome_wa || null, perfil: 'equipe', verificado_em: agoraIso() });
    await alerta('novo_numero', { cliente_id: c.cliente_id, conversa_id: conv.id, resumo: `novo número ${mascTel(conv.telefone)} vinculado como equipe (promova a responsável no admin, se for o caso)` });
    await avisarEquipe(`novo número ${mascTel(conv.telefone)} vinculado como equipe`, cli && cli.nome);
  }
  await upd('wa_conversas', { id: conv.id }, { cliente_id: c.cliente_id, estado_fluxo: { passo: null }, menu_dia: diaBR(), updated_at: agoraIso() });
  const conv2 = { ...conv, cliente_id: c.cliente_id };
  await diz(conv2, (await txt('codigo_ok', { nome: primeiro(ct && ct.nome) || primeiro(cli && cli.nome_contato) || '' })).replace(', !', '!'));
  return menuCliente(conv2, '');
}

// ---------- ações do menu do cliente ----------
async function financeiro(conv, cli, contato) {
  if (!contato || contato.perfil !== 'responsavel') return diz(conv, await txt('so_responsavel'));
  if (!asaasConfigurado() || !cli.asaas_customer_id) { await diz(conv, 'vou pedir pra equipe te mandar certinho 💌'); return handoff(conv, { motivo: 'pedido financeiro (Asaas não vinculado a este cliente)', cliente: cli, silencioso: true }); }
  const r = await abertosDoCliente(cli.asaas_customer_id);
  if (!r.ok) { await diz(conv, 'não consegui consultar agora 🥹 vou chamar a equipe'); return handoff(conv, { motivo: 'falha ao consultar o Asaas', cliente: cli, silencioso: true }); }
  if (!r.lista.length) {
    const pagos = await ultimosPagos(cli.asaas_customer_id, 1);
    let nf = null; if (pagos[0]) nf = await notaFiscal(pagos[0].id);
    await diz(conv, 'tudo em dia por aqui! 💫 nenhuma cobrança em aberto.' + (pagos[0] ? `\n\núltimo pagamento: ${brl(pagos[0].valor)} (vencimento ${dataBR(pagos[0].vencimento)}).` : '') + (nf ? `\nnota fiscal: ${nf}` : ''), 'menu');
    return diz(conv, 'precisa de mais alguma coisa? é só escrever ou mandar "menu" 💌');
  }
  const linhas = r.lista.slice(0, 3).map((p) => `• ${brl(p.valor)} · vence ${dataBR(p.vencimento)}${p.status === 'OVERDUE' ? ' (em atraso)' : ''}\n${p.link}`);
  await diz(conv, 'olha o que tem em aberto por aqui 💌\n\n' + linhas.join('\n\n'), 'menu');
  const pix = await pixCopiaCola(r.lista[0].id);
  if (pix) { await diz(conv, 'se preferir, o pix copia e cola da primeira é este:'); await diz(conv, pix); }
  return diz(conv, 'se já pagou, me manda o comprovante por aqui. desconto, parcelamento ou mudar o vencimento é com a equipe, é só pedir 🫂');
}
async function enviarLinkPagamento(conv, cli, contato) {
  if (!contato || contato.perfil !== 'responsavel') return diz(conv, await txt('so_responsavel'));
  return financeiro(conv, cli, contato);
}
async function gravacao(conv, cli) {
  await diz(conv, 'bora gravar? 🎬\n\nantes de tudo: lente limpinha, celular na vertical (9:16), maior resolução ligada e espaço livre no celular.\nvisão geral no 1x, detalhe no 2x ou 3x, takes de 5 a 30 segundos e movimento lento.');
  if (cli && cli.manual_gravacao_url) await diz(conv, 'aqui tá o seu manual de gravação completinho 💌 ' + cli.manual_gravacao_url);
  return diz(conv, 'quer agendar ou remarcar uma gravação? me manda 2 ou 3 opções de dia e horário que eu passo pra equipe confirmar 💫');
}
async function material(conv, cli) {
  if (cli && cli.drive_url) return diz(conv, 'manda tudo pela sua pasta do drive, assim não perde qualidade 💫 ' + cli.drive_url + '\n\nse quiser, me conta aqui o que mandou que eu aviso a equipe!');
  return diz(conv, await txt('midia_sem_drive'));
}

// ---------- IA ----------
async function historico(conv) {
  const L = await get('wa_mensagens', { conversa_id: conv.id }, 'created_at desc', 20);
  return (L || []).reverse().map((m) => {
    const c = m.conteudo || {};
    let t = '';
    if (m.direcao === 'in') t = c.texto || (c.midia ? '(enviou um arquivo)' : '');
    else if (m.tipo === 'text') t = typeof c.body === 'string' ? c.body : '';
    else if (m.tipo === 'interactive') t = (c.body && c.body.text) || '';
    else if (m.tipo === 'template') t = '(mensagem automática: ' + (c.name || 'template') + ')';
    return { papel: m.direcao === 'in' ? 'cliente' : 'studio', texto: t };
  }).filter((h) => h.texto);
}
async function usarIA(conv, cli, contato, textoCliente) {
  const umaHora = new Date(Date.now() - H).toISOString();
  if ((await contar('wa_mensagens', { telefone: conv.telefone, origem: 'ia', 'created_at>=': umaHora })) >= MAX_IA_HORA) {
    await alerta('limite_ia', { conversa_id: conv.id, cliente_id: cli && cli.id, resumo: 'limite de mensagens de IA por hora neste número' });
    await diz(conv, await txt('sem_ia')); return menuCliente(conv, '');
  }
  let fin = null;
  if (contato && contato.perfil === 'responsavel' && cli.asaas_customer_id && asaasConfigurado() && FINANCEIRO.test(textoCliente)) {
    const r = await abertosDoCliente(cli.asaas_customer_id);
    fin = r.ok ? { em_aberto: r.lista.map((p) => ({ valor: brl(p.valor), vencimento: dataBR(p.vencimento), em_atraso: p.status === 'OVERDUE' })) } : { erro: 'consulta indisponível agora' };
  }
  const ctx = {
    cliente: { primeiro_nome: primeiro((contato && contato.nome) || cli.nome_contato || ''), empresa: cli.nome, perfil: contato ? contato.perfil : 'equipe', status: cli.status, vencimento_dia: cli.vencimento_dia, tem_manual_gravacao: !!cli.manual_gravacao_url, tem_drive: !!cli.drive_url, tem_onboarding: !!cli.onboarding_url },
    financeiro: fin, dentro_horario: await dentroHorario(), agora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), avisos: (await avisosAtivos()).map((a) => a.texto),
    historico: await historico(conv),
  };
  const r = await responderIA(ctx);
  if (!r.ok) {
    if (r.motivo !== 'desligada') await alerta(r.motivo === 'limite' ? 'limite_ia' : 'ia_falhou', { conversa_id: conv.id, cliente_id: cli.id, resumo: 'IA indisponível (' + r.motivo + '): caiu no menu' });
    await diz(conv, await txt('sem_ia')); return menuCliente(conv, '');
  }
  for (const m of r.mensagens) { const limpo = limparSaida(m); if (limpo) await texto(conv.telefone, limpo, op(conv, 'ia')); }
  switch (r.acao) {
    case 'handoff': return handoff(conv, { motivo: r.motivo_handoff || 'a IA passou para a equipe', cliente: cli, silencioso: false });
    case 'mostrar_menu': return menuCliente(conv, '');
    case 'enviar_manual_gravacao': return cli.manual_gravacao_url ? diz(conv, cli.manual_gravacao_url) : null;
    case 'enviar_drive': return cli.drive_url ? diz(conv, cli.drive_url) : diz(conv, await txt('midia_sem_drive'));
    case 'enviar_link_pagamento': return enviarLinkPagamento(conv, cli, contato);
    case 'enviar_onboarding': {
      if (!cli.onboarding_url) return null;
      let senha = null; if (cli.onboarding_senha_id) { const s = await um('onboarding_senhas', { id: cli.onboarding_senha_id }); senha = s && s.ativo ? s.senha : null; }
      return diz(conv, 'aqui o seu formulário 💌 ' + cli.onboarding_url + (senha ? `\nsenha: ${senha}` : ''));
    }
    default: return null;
  }
}

// ---------- entrada principal ----------
function extrair(msg) {
  const tipo = msg.type;
  if (tipo === 'text') return { tipo, texto: (msg.text && msg.text.body) || '' };
  if (tipo === 'interactive') {
    const i = msg.interactive || {};
    const r = i.list_reply || i.button_reply || {};
    return { tipo, id: r.id || '', texto: r.title || '' };
  }
  if (tipo === 'button') return { tipo, id: (msg.button && msg.button.payload) || '', texto: (msg.button && msg.button.text) || '' };
  if (['image', 'video', 'document', 'sticker'].includes(tipo)) return { tipo, midia: true, texto: (msg[tipo] && msg[tipo].caption) || '' };
  if (tipo === 'audio') return { tipo, audio: true, texto: '' };
  return { tipo: tipo || 'desconhecido', texto: '' };
}

export async function processarMensagem(msg, nomeWa) {
  if (!msg || !msg.id || !msg.from) return;
  if (!(await primeiraVez('m:' + msg.id, 'meta'))) return;
  const tel = normTel(msg.from);
  if (!tel) return;
  const e = extrair(msg);
  let conv = await conversaDoTelefone(tel, nomeWa);
  if (nomeWa && !conv.nome_wa) { try { conv = (await upd('wa_conversas', { id: conv.id }, { nome_wa: String(nomeWa).slice(0, 80) })) || conv; } catch (err) { /* nome é opcional */ } }
  await ins('wa_mensagens', { conversa_id: conv.id, telefone: tel, direcao: 'in', origem: 'cliente', tipo: e.tipo, conteudo: { texto: e.texto ? String(e.texto).slice(0, 4000) : '', id: e.id || undefined, midia: e.midia || undefined }, wa_message_id: msg.id, status: 'received' }, true);
  await rpc('wa_conversa_toque', { p_id: conv.id, p_cliente: true });
  marcarLida(msg.id).catch(() => {});

  const contato = await contatoDoTelefone(tel);
  const estado = conv.estado_fluxo || {};
  if (bloqueado(conv, contato)) {
    if (!estado.avisou_bloqueio) { await salvarEstado(conv, { ...estado, avisou_bloqueio: true }); await diz(conv, await txt('bloqueado')); }
    return;
  }
  if (estado.avisou_bloqueio) await salvarEstado(conv, { ...estado, avisou_bloqueio: false, bloqueado_ate: null });

  // equipe atendendo: a IA fica quieta (volta sozinha depois do prazo)
  if (conv.modo === 'humano') {
    if (conv.humano_ate && Date.parse(conv.humano_ate) < Date.now()) {
      conv = (await upd('wa_conversas', { id: conv.id }, { modo: 'ia', humano_ate: null })) || conv;
      await alerta('handoff', { conversa_id: conv.id, cliente_id: conv.cliente_id, resumo: 'conversa voltou para a IA após 24h sem resposta da equipe' });
    } else return;
  }

  const t = String(e.texto || '').trim();
  if (/^(cancelar|sair|voltar)$/i.test(t) && estado.passo) { await salvarEstado(conv, { passo: null }); return contato && contato.cliente_id ? menuCliente(conv, '') : menuVisitante(conv); }
  if (estado.passo === 'cnpj') return receberCnpj(conv, estado, t);
  if (estado.passo === 'codigo') return receberCodigo(conv, estado, t, contato);

  const verificado = contato && contato.ativo && contato.cliente_id && contato.verificado_em;
  const cli = verificado ? await um('wa_clientes', { id: contato.cliente_id }) : null;

  // ----- visitante (ou número ainda não confirmado)
  if (!cli || cli.status === 'encerrado') {
    if (e.id === 'v_planos') {
      const com = normTel(await config('whatsapp_comercial', WHATSAPP_COMERCIAL_PADRAO)) || WHATSAPP_COMERCIAL_PADRAO;
      return diz(conv, await txt('visitante_planos', { site: SITE_STUDIO, comercial: 'https://wa.me/' + com }));
    }
    if (e.id === 'v_cliente' || /\b(sou cliente|ja sou cliente|já sou cliente)\b/i.test(t)) return pedirCnpj(conv, estado);
    if (e.id === 'v_equipe' || pedeHumano(t)) return handoff(conv, { motivo: 'visitante pediu para falar com a equipe' + (t ? ': "' + t.slice(0, 80) + '"' : ''), cliente: null });
    if (cnpjValido(t)) return receberCnpj(conv, { ...estado, passo: 'cnpj' }, t);
    if (contato && contato.cliente_id && !contato.verificado_em) return pedirCnpj(conv, estado);
    return menuVisitante(conv);
  }

  // ----- cliente: revalidação a cada 90 dias
  if (Date.parse(contato.verificado_em) < Date.now() - REVALIDAR_DIAS * 24 * H) {
    await upd('wa_contatos', { id: contato.id }, { verificado_em: null });
    return pedirCnpj(conv, estado, 'revalidar');
  }
  const nome = primeiro(contato.nome || cli.nome_contato || '');
  const hoje = diaBR();
  if (conv.menu_dia !== hoje && !e.id) {
    await upd('wa_conversas', { id: conv.id }, { menu_dia: hoje });
    await menuCliente(conv, nome);
    if (!t || SAUDACAO_SO.test(t)) return;
  }
  if (/^menu$/i.test(t)) return menuCliente(conv, nome);

  if (e.audio) return diz(conv, await txt('audio'));
  if (e.midia && !t) return cli.drive_url ? diz(conv, await txt('midia', { drive: cli.drive_url })) : diz(conv, await txt('midia_sem_drive'));

  switch (e.id) {
    case 'm_plano': return diz(conv, 'me conta sua dúvida sobre o plano ou o conteúdo 💫');
    case 'm_fin': return financeiro(conv, cli, contato);
    case 'm_grav': return gravacao(conv, cli);
    case 'm_mat': return material(conv, cli);
    case 'm_equipe': return handoff(conv, { motivo: 'cliente pediu para falar com a equipe (menu)', cliente: cli });
    default: break;
  }
  if (pedeHumano(t)) return handoff(conv, { motivo: 'pedido do cliente: "' + t.slice(0, 100) + '"', cliente: cli });
  if (FINANCEIRO.test(t) && contato.perfil !== 'responsavel') return diz(conv, await txt('so_responsavel'));
  if (!t) return menuCliente(conv, nome);
  if (!iaLigada()) { await diz(conv, await txt('sem_ia')); return menuCliente(conv, nome); }
  return usarIA(conv, cli, contato, t);
}

// eco do app WhatsApp Business (a equipe respondeu pelo celular): pausa a IA nesta conversa
export async function processarEco(eco) {
  if (!eco || !eco.id || !eco.to) return;
  if (!(await primeiraVez('e:' + eco.id, 'meta'))) return;
  const tel = normTel(eco.to); if (!tel) return;
  const conv = await conversaDoTelefone(tel, null);
  const ja = await um('wa_mensagens', { wa_message_id: eco.id });
  if (!ja) await ins('wa_mensagens', { conversa_id: conv.id, telefone: tel, direcao: 'out', origem: 'equipe_app', tipo: eco.type || 'text', conteudo: { body: (eco.text && eco.text.body) || '' }, wa_message_id: eco.id, status: 'sent' }, true);
  const horas = Number(await config('ia_pausa_quando_equipe_responde_horas', 12)) || 12;
  await upd('wa_conversas', { id: conv.id }, { modo: 'humano', humano_desde: agoraIso(), humano_ate: new Date(Date.now() + horas * H).toISOString(), nao_lidas: 0, ultima_msg_em: agoraIso() });
}
