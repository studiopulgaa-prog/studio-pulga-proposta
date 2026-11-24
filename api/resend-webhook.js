// api/resend-webhook.js — eventos do Resend (entregue, rejeitado, spam, atrasado). Assinatura conferida (padrão Svix)
// com o segredo RESEND_WEBHOOK_SECRET (Vercel). Rejeição definitiva ou "marcar como spam" => contato bloqueado para sempre.
import crypto from 'node:crypto';
import { rpc } from './_email.js';

const TOLERANCIA_S = 300;
const EVENTOS = new Set(['email.delivered', 'email.bounced', 'email.complained', 'email.delivery_delayed']);

function lerStream(req, ms = 2000) {
  return new Promise((resolve) => {
    const partes = []; let fim = false;
    const acabar = () => { if (!fim) { fim = true; resolve(Buffer.concat(partes).toString('utf8')); } };
    try {
      req.on('data', (c) => partes.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end', acabar); req.on('error', acabar);
    } catch (e) { acabar(); }
    setTimeout(acabar, ms);
  });
}
// corpo cru (a assinatura é sobre os bytes exatos); se o ambiente já leu o corpo, usa o que ele guardou
export async function corpoCru(req) {
  if (req.readableEnded === false || req.readable) { const t = await lerStream(req); if (t) return t; }
  const b = req.body;
  if (typeof b === 'string') return b;
  if (Buffer.isBuffer(b)) return b.toString('utf8');
  if (b && typeof b === 'object') return JSON.stringify(b);
  return '';
}

export function assinaturaOk(segredo, id, ts, assinatura, corpo, agoraS = Math.floor(Date.now() / 1000)) {
  if (!segredo || !id || !ts || !assinatura) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(agoraS - t) > TOLERANCIA_S) return false;
  let chave;
  try { chave = Buffer.from(String(segredo).replace(/^whsec_/, ''), 'base64'); } catch (e) { return false; }
  if (!chave.length) return false;
  const esperado = crypto.createHmac('sha256', chave).update(`${id}.${ts}.${corpo}`).digest();
  return String(assinatura).split(' ').some((p) => {
    const [v, sig] = p.split(',');
    if (v !== 'v1' || !sig) return false;
    const rec = Buffer.from(sig, 'base64');
    return rec.length === esperado.length && crypto.timingSafeEqual(rec, esperado);
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const segredo = process.env.RESEND_WEBHOOK_SECRET;
  if (!segredo) return res.status(503).json({ ok: false, erro: 'webhook nao configurado' });
  const h = req.headers || {};
  const corpo = await corpoCru(req);
  if (!assinaturaOk(segredo, h['svix-id'], h['svix-timestamp'], h['svix-signature'], corpo)) return res.status(401).json({ ok: false });
  let ev;
  try { ev = JSON.parse(corpo); } catch (e) { return res.status(400).json({ ok: false }); }
  if (!ev || !EVENTOS.has(ev.type)) return res.json({ ok: true, ignorado: true });
  const d = ev.data || {};
  const para = Array.isArray(d.to) ? d.to[0] : d.to;
  const bounce = d.bounce || {};
  const definitivo = ev.type === 'email.complained' || (ev.type === 'email.bounced' && !/^(transient|temporary)/i.test(String(bounce.type || '')));
  const detalhe = ev.type === 'email.bounced' ? [bounce.type, bounce.subType, bounce.message].filter(Boolean).join(' · ').slice(0, 280) || 'rejeitado'
    : ev.type === 'email.complained' ? 'marcado como spam' : null;
  try {
    await rpc('webhook_evento', { p_resend_id: String(d.email_id || ''), p_evento: ev.type, p_email: String(para || ''), p_suprimir: definitivo, p_detalhe: detalhe });
    return res.json({ ok: true });
  } catch (e) {
    console.error('webhook', e && e.message);
    return res.status(500).json({ ok: false });   // o Resend tenta de novo sozinho
  }
}
