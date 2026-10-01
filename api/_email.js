// api/_email.js — utilitarios compartilhados do envio de e-mails (nao e uma rota)
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export const SUPA = 'https://ixclkelqjpfkucejbzuq.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4Y2xrZWxxanBma3VjZWpienVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzM5NTAsImV4cCI6MjA5NjA0OTk1MH0.VmXA6P-9IS0TsNnh_2ZGBQZQqtqtCrp4CdHGOVIc5zU';
export const SITE = 'https://proposta.studiopulga.com.br';
export const WA = '5513996057099';

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

const wrap = (corpo, lh) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#F4EADD;margin:0;padding:20px;color:#333">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#6E2C14;color:#fff;padding:28px;text-align:center"><h1 style="margin:0;font-size:28px">Studio Pulga</h1></div>
  <div style="padding:36px 30px;line-height:1.6;color:#555">${corpo}</div>
  <div style="background:#EAD8C5;padding:18px;text-align:center;font-size:12px;color:#666">
    <strong>Studio Pulga</strong> · Praia Grande, SP · (13) 9 9605-7099<br>
    <a href="${esc(unsubUrl(lh))}" style="color:#666">N&atilde;o quero mais receber estes e-mails</a>
  </div>
</div></body></html>`;

const btn = (href, txt) => `<p style="text-align:center;margin:28px 0"><a href="${esc(href)}" style="display:inline-block;background:#6E2C14;color:#F4EADD;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700">${txt}</a></p>`;
const wa = (msg) => `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;

// tipos: link | curiosidade | vence | expirada | desconto
export function montar(tipo, { cliente, link, lh, validade }) {
  const nome = esc(cliente || 'tudo bem');
  const oi = `<p style="font-size:18px;font-weight:700;color:#6E2C14">Ol&aacute;, ${nome}!</p>`;
  const t = {
    link: {
      subject: `${cliente}, sua proposta da Studio Pulga`,
      corpo: `${oi}<p>Conforme conversamos, aqui est&aacute; o link da proposta que preparamos especialmente para voc&ecirc;. Ela fica dispon&iacute;vel por ${esc(validade)} ${validade == 1 ? 'dia' : 'dias'}.</p>${btn(link, 'VER MINHA PROPOSTA')}<p>Qualquer d&uacute;vida, &eacute; s&oacute; responder por aqui ou chamar no WhatsApp.</p>`,
    },
    curiosidade: {
      subject: `${cliente}, deu tempo de olhar a proposta?`,
      corpo: `${oi}<p>Sua proposta continua no ar. Vale dar mais uma olhada com calma nos pacotes e no que cada um entrega para a sua marca.</p>${btn(link, 'REVER MINHA PROPOSTA')}<p>Se surgiu alguma d&uacute;vida depois da nossa conversa, me chama que eu ajudo a decidir o melhor formato.</p>`,
    },
    vence: {
      subject: `${cliente}, sua proposta expira amanhã`,
      corpo: `${oi}<p>Passando para avisar que o link da sua proposta <strong>expira amanh&atilde;</strong>. Depois disso ele sai do ar.</p>${btn(link, 'ABRIR ANTES QUE EXPIRE')}<p>Se quiser fechar ou tirar d&uacute;vidas, &eacute; s&oacute; chamar.</p>`,
    },
    expirada: {
      subject: `${cliente}, sua proposta expirou, mas dá para reativar`,
      corpo: `${oi}<p>O link da sua proposta expirou. Se ainda faz sentido para voc&ecirc;, ou ficou alguma d&uacute;vida, a gente gera um novo link rapidinho, com tudo que conversamos na nossa reuni&atilde;o.</p>${btn(wa('Olá! Minha proposta expirou e gostaria de um novo link.'), 'PEDIR NOVO LINK')}`,
    },
    desconto: {
      subject: `${cliente}, uma condição especial para você`,
      corpo: `${oi}<p>Faz um tempo desde a nossa reuni&atilde;o e queremos muito trabalhar com voc&ecirc;. Por isso, podemos ter uma <strong>condi&ccedil;&atilde;o especial</strong> para fechar agora.</p>${btn(wa('Olá! Gostaria de saber a condição especial da minha proposta.'), 'FALAR SOBRE A CONDIÇÃO')}`,
    },
  }[tipo];
  const texto = t.corpo.replace(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g, '$2: $1').replace(/<[^>]+>/g, ' ').replace(/&([a-z])(acute|circ|tilde|cedil);/gi, (m, l, k) => ({ a: { acute: 'á', circ: 'â', tilde: 'ã' }, e: { acute: 'é', circ: 'ê' }, i: { acute: 'í' }, o: { acute: 'ó', circ: 'ô', tilde: 'õ' }, u: { acute: 'ú' }, c: { cedil: 'ç' } }[l.toLowerCase()] || {})[k] || l).replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  return { subject: t.subject, html: wrap(t.corpo, lh), text: texto + `\n\nPara parar de receber: ${unsubUrl(lh)}` };
}

export async function enviar({ to, tipo, dados }) {
  const m = montar(tipo, dados);
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com', port: 587, secure: false,
    auth: { user: process.env.BREVO_USER, pass: process.env.BREVO_PASS },
  });
  return transporter.sendMail({
    from: process.env.BREVO_FROM || 'Studio Pulga <studio.pulgaa@gmail.com>',
    to,
    subject: m.subject,
    html: m.html,
    text: m.text,
    headers: { 'List-Unsubscribe': `<${unsubUrl(dados.lh)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  });
}
