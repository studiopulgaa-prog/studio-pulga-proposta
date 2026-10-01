// api/enviar-proposta.js — Vercel Serverless Function
// Envia a proposta por e-mail via Brevo SMTP.
// Credenciais: variáveis de ambiente BREVO_USER e BREVO_PASS (configuradas no Vercel).
import nodemailer from 'nodemailer';

const SUPA = 'https://ixclkelqjpfkucejbzuq.supabase.co';
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4Y2xrZWxxanBma3VjZWpienVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzM5NTAsImV4cCI6MjA5NjA0OTk1MH0.VmXA6P-9IS0TsNnh_2ZGBQZQqtqtCrp4CdHGOVIc5zU';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });

  try {
    const { lh, cliente, email, v1, v2, v3, planoEscolhido, linkProposta } = req.body || {};

    if (!lh || !cliente || !planoEscolhido || !email || !/^\S+@\S+\.\S+$/.test(email) || String(email).length > 200) {
      return res.status(400).json({ sucesso: false, erro: 'Dados inválidos' });
    }

    // Só envia se a proposta existe no banco e ainda está válida.
    const chk = await fetch(`${SUPA}/rest/v1/propostas?link_hash=eq.${encodeURIComponent(lh)}&select=expira_em`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    const rows = chk.ok ? await chk.json() : [];
    if (!rows.length) return res.status(403).json({ sucesso: false, erro: 'Proposta não encontrada' });
    if (rows[0].expira_em && Date.now() > new Date(rows[0].expira_em).getTime()) {
      return res.status(403).json({ sucesso: false, erro: 'Proposta expirada' });
    }

    const planNames = { plan1: 'Pensado na sua marca', plan2: 'Sua gestão', plan3: 'O mais completo' };
    const planName = planNames[planoEscolhido];
    if (!planName) return res.status(400).json({ sucesso: false, erro: 'Plano inválido' });
    const planPrice = { plan1: v1, plan2: v2, plan3: v3 }[planoEscolhido] || '';
    const safeLink = /^https:\/\//.test(linkProposta || '') ? esc(linkProposta) : '';
    const wa = 'https://wa.me/5513996057099?text=' + encodeURIComponent('Olá! Gostaria de fechar o plano ' + planName + '. Podemos avançar?');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;background:#F4EADD;margin:0;padding:20px;color:#6E2C14">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#6E2C14;color:#F4EADD;padding:30px;text-align:center">
    <h1 style="margin:0;font-size:30px;letter-spacing:-0.02em">STUDIO PULGA</h1>
    <p style="margin:6px 0 0;font-size:14px;opacity:.85">Sua proposta exclusiva</p>
  </div>
  <div style="padding:36px 30px">
    <div style="font-size:18px;font-weight:700">Olá, ${esc(cliente)}.</div>
    <p style="color:#555;line-height:1.6">Obrigado pelo interesse! Aqui está o resumo do plano que você escolheu:</p>
    <div style="background:#F4EADD;border-left:4px solid #6E2C14;padding:20px;border-radius:6px">
      <div style="font-size:22px;font-weight:700">${esc(planName)}</div>
      <div style="font-size:20px;font-weight:600;margin-top:6px">R$ ${esc(planPrice)} <span style="font-size:13px;font-weight:400">por mês</span></div>
    </div>
    <p style="color:#555;line-height:1.6"><strong>Próximos passos:</strong><br>1. Rever a proposta completa<br>2. Tirar dúvidas com a gente<br>3. Confirmar pelo WhatsApp</p>
    ${safeLink ? `<p style="text-align:center;margin:24px 0"><a href="${safeLink}" style="color:#6E2C14;font-weight:700">VER PROPOSTA COMPLETA →</a></p>` : ''}
    <p style="text-align:center"><a href="${wa}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700">CONVERSAR PELO WHATSAPP</a></p>
  </div>
  <div style="background:#EAD8C5;padding:18px;text-align:center;font-size:12px;color:#6E2C14">
    <strong>Studio Pulga</strong> · Praia Grande, SP · (13) 9 9605-7099
  </div>
</div></body></html>`;

    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: process.env.BREVO_USER, pass: process.env.BREVO_PASS },
    });

    const info = await transporter.sendMail({
      from: process.env.BREVO_FROM || 'Studio Pulga <seumarketing@studiopulga.com>',
      to: email,
      subject: `Sua proposta Studio Pulga — ${planName}`,
      html,
    });

    return res.status(200).json({ sucesso: true, messageId: info.messageId });
  } catch (erro) {
    console.error('Erro ao enviar e-mail:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Falha ao enviar e-mail' });
  }
}
