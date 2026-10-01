// api/_email.js — utilitarios compartilhados do envio de e-mails (nao e uma rota)
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export const SUPA = 'https://ixclkelqjpfkucejbzuq.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4Y2xrZWxxanBma3VjZWpienVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzM5NTAsImV4cCI6MjA5NjA0OTk1MH0.VmXA6P-9IS0TsNnh_2ZGBQZQqtqtCrp4CdHGOVIc5zU';
export const SITE = 'https://proposta.studiopulga.com.br';
export const WA = '5513996057099';
const FOTO = 'https://studio-pulga.vercel.app/preview__2_.webp';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Chama funcoes do banco protegidas por segredo (EMAIL_SECRET)
export async function rpc(fn, args) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ p_secret: process.env.EMAIL_SECRET, ...args }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : null;
}

export async function propostaDoBanco(lh) {
  const r = await fetch(`${SUPA}/rest/v1/propostas?link_hash=eq.${encodeURIComponent(lh)}&select=cliente,validade,expira_em`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const rows = await r.json();
  return rows && rows[0] ? rows[0] : null;
}

export const token = (lh) => crypto.createHmac('sha256', process.env.EMAIL_SECRET || '').update(String(lh)).digest('hex').slice(0, 32);
export const unsubUrl = (lh) => `${SITE}/api/descadastrar?lh=${encodeURIComponent(lh)}&t=${token(lh)}`;

const primeiroNome = (n) => {
  const p = String(n || '').trim().split(/\s+/)[0] || 'tudo bem';
  return p.charAt(0).toUpperCase() + p.slice(1);
};
const BR = { timeZone: 'America/Sao_Paulo' };
const fmtHora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { ...BR, hour: '2-digit', minute: '2-digit' });
const fmtData = (iso) => `${new Date(iso).toLocaleDateString('pt-BR', { ...BR, day: '2-digit', month: '2-digit' })} às ${fmtHora(iso)}`;

const p = (t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#4a3a33">${t}</p>`;
const btn = (href, txt) => `<table role="presentation" align="center" style="margin:26px auto"><tr><td style="background:#6E2C14;border-radius:50px"><a href="${esc(href)}" style="display:inline-block;padding:15px 34px;color:#F4EADD;font-weight:700;font-size:15px;text-decoration:none;letter-spacing:.02em">${txt}</a></td></tr></table>`;
const btn2 = (href, txt) => `<p style="text-align:center;margin:0 0 8px"><a href="${esc(href)}" style="color:#6E2C14;font-weight:700;font-size:14px">${txt}</a></p>`;
const wa = (msg) => `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
const lista = (itens) => `<table role="presentation" width="100%" style="margin:0 0 18px">${itens.map((i) => `<tr><td width="24" valign="top" style="color:#6E2C14;font-weight:700;font-size:16px;padding:4px 0">&bull;</td><td style="font-size:15px;line-height:1.55;color:#4a3a33;padding:4px 0">${i}</td></tr>`).join('')}</table>`;
const passo = (quando, txt) => `<tr><td style="padding:10px 14px;background:#F4EADD;border-left:4px solid #6E2C14;font-size:14px;color:#4a3a33;line-height:1.5"><strong style="color:#6E2C14">${quando}</strong><br>${txt}</td></tr><tr><td style="height:8px"></td></tr>`;

const wrap = ({ kicker, pre, corpo, lh }) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4EADD;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F4EADD">${esc(pre)}</div>
<table role="presentation" width="100%" style="background:#F4EADD"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
  <tr><td style="background:#6E2C14;padding:26px 30px;text-align:center"><div style="font-family:'Arial Black',Arial,sans-serif;font-size:26px;font-weight:900;letter-spacing:.04em;color:#F4EADD">STUDIO PULGA</div><div style="font-size:11px;letter-spacing:.18em;color:#d9bfae;margin-top:6px">${esc(kicker)}</div></td></tr>
  <tr><td style="background:#6E2C14;line-height:0"><img src="${FOTO}" width="600" alt="Studio Pulga" style="display:block;width:100%;height:auto;border:0;color:#F4EADD;font-size:14px"></td></tr>
  <tr><td style="padding:34px 32px 18px">${corpo}</td></tr>
  <tr><td style="background:#EAD8C5;padding:20px;text-align:center;font-size:12px;line-height:1.6;color:#6b5a50"><strong>Studio Pulga</strong> · Praia Grande, SP · (13) 9 9605-7099<br><a href="${esc(unsubUrl(lh))}" style="color:#6b5a50">Não quero mais receber estes e-mails</a></td></tr>
</table></td></tr></table></body></html>`;

// tipos: link | curiosidade | vence | vence18 | expirada | desconto
export function montar(tipo, { cliente, link, lh, expira }) {
  const nome = primeiroNome(cliente);
  const oi = `<p style="margin:0 0 18px;font-size:20px;font-weight:700;color:#6E2C14">Olá, ${esc(nome)}!</p>`;
  const exp = expira ? fmtData(expira) : '';
  const expHora = expira ? fmtHora(expira) : '';
  const t = {
    link: {
      kicker: 'PROPOSTA EXCLUSIVA',
      subject: `${nome}, sua proposta da Studio Pulga está pronta`,
      pre: `Ela fica no ar até ${exp}. Dá uma olhada com calma.`,
      corpo: oi + p('Foi um prazer conversar com você. Como combinado, aqui está a proposta que montamos pensando na sua marca.') + p('Dentro dela você encontra:') + lista(['Os pacotes mensais lado a lado, para comparar com calma', 'O que cada pacote entrega e o que fica de fora', 'O valor de cada plano']) + p(`Ela fica no ar até <strong>${esc(exp)}</strong>. Escolha o pacote que fizer mais sentido e a gente segue pelo WhatsApp.`) + btn(link, 'VER MINHA PROPOSTA'),
    },
    curiosidade: {
      kicker: 'COMO FUNCIONA',
      subject: `${nome}, como seria o seu mês com a Studio Pulga`,
      pre: 'Planejamento, captação, edição e relatório: veja como funciona.',
      corpo: oi + p('Uma dúvida comum depois da reunião é: e no dia a dia, como funciona? Em resumo, conforme o pacote escolhido:') + `<table role="presentation" width="100%" style="margin:0 0 18px">${passo('Início do mês', 'Planejamento de conteúdo e calendário de postagens')}${passo('Durante o mês', 'Captação, edição e publicação, com acompanhamento de perto')}${passo('Fechamento', 'Relatório do que funcionou e ajustes para o mês seguinte')}</table>` + p(`Sua proposta continua no ar até <strong>${esc(exp)}</strong>, se quiser rever os pacotes com calma.`) + btn(link, 'REVER MINHA PROPOSTA'),
    },
    vence: {
      kicker: 'AVISO',
      subject: `Bom dia, ${nome}! Sua proposta expira amanhã`,
      pre: `O link sai do ar amanhã às ${expHora}.`,
      corpo: `<p style="margin:0 0 18px;font-size:20px;font-weight:700;color:#6E2C14">Bom dia, ${esc(nome)}!</p>` + p(`Passando só para avisar: o link da sua proposta sai do ar <strong>amanhã, às ${esc(expHora)}</strong>. Dá tempo de rever com calma hoje e tirar qualquer dúvida comigo.`) + btn(link, 'ABRIR MINHA PROPOSTA') + btn2(wa('Olá! Tenho uma dúvida sobre a minha proposta.'), 'Tirar dúvida no WhatsApp'),
    },
    vence18: {
      kicker: 'ÚLTIMA CHAMADA',
      subject: `${nome}, última chamada de hoje: sua proposta expira amanhã`,
      pre: `Ainda dá tempo. O link sai do ar amanhã às ${expHora}.`,
      corpo: `<p style="margin:0 0 18px;font-size:20px;font-weight:700;color:#6E2C14">${esc(nome)}, última chamada de hoje.</p>` + p(`Sua proposta expira <strong>amanhã, às ${esc(expHora)}</strong>. Se quiser fechar ou ajustar algo, me chama agora e a gente resolve ainda hoje à noite.`) + btn(link, 'ABRIR ANTES QUE EXPIRE') + btn2(wa('Olá! Quero fechar ou ajustar a minha proposta.'), 'Falar agora no WhatsApp'),
    },
    expirada: {
      kicker: 'PROPOSTA EXPIRADA',
      subject: `${nome}, sua proposta expirou, mas dá para reativar`,
      pre: 'A conversa não precisa acabar aqui.',
      corpo: oi + p('O link da sua proposta venceu, mas a conversa não precisa acabar aqui. Se ainda faz sentido para você, geramos um novo link rapidinho, com tudo o que combinamos na reunião.') + btn(wa('Olá! Minha proposta expirou e gostaria de um novo link.'), 'PEDIR NOVO LINK'),
    },
    desconto: {
      kicker: 'CONDIÇÃO ESPECIAL',
      subject: `${nome}, uma condição especial para você`,
      pre: 'Podemos ter uma condição especial para fechar agora.',
      corpo: oi + p('Faz um tempo desde a nossa reunião e a gente ainda quer muito trabalhar com você. Por isso, podemos ter uma <strong>condição especial</strong> para fechar agora. Me chama que eu te conto os detalhes.') + btn(wa('Olá! Gostaria de saber a condição especial da minha proposta.'), 'FALAR SOBRE A CONDIÇÃO'),
    },
  }[tipo];
  const html = wrap({ kicker: t.kicker, pre: t.pre, corpo: t.corpo, lh });
  const texto = t.corpo.replace(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g, '$2: $1').replace(/<\/(p|tr|table)>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&bull;/g, '-').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
  return { subject: t.subject, html, text: `${texto}\n\nPara parar de receber: ${unsubUrl(lh)}` };
}

export async function enviar({ to, tipo, dados, bcc }) {
  const m = montar(tipo, dados);
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com', port: 587, secure: false,
    auth: { user: process.env.BREVO_USER, pass: process.env.BREVO_PASS },
  });
  const msg = {
    from: process.env.BREVO_FROM || 'Studio Pulga <studio.pulgaa@gmail.com>',
    to,
    subject: m.subject,
    html: m.html,
    text: m.text,
    headers: { 'List-Unsubscribe': `<${unsubUrl(dados.lh)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
  if (process.env.REPLY_TO) msg.replyTo = process.env.REPLY_TO;
  if (bcc) msg.bcc = bcc;
  return transporter.sendMail(msg);
}
