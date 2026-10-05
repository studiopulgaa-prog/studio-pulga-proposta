// api/enviar-proposta.js — e-mail que o CLIENTE recebe ao clicar em "Escolher Plano".
// Seguranca: nome e valores vem do banco (nao do navegador), so links do proprio dominio,
// e no maximo 3 envios por proposta.
import nodemailer from 'nodemailer';
import { rpc, esc, unsubUrl, WA } from './_email.js';
import { LINK_OK } from './_seg.js';

const PLANOS = { plan1: ['Pensado na sua marca', 'v1'], plan2: ['Sua gestão', 'v2'], plan3: ['O mais completo', 'v3'] };
const MAX_ENVIOS = 3;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });

  try {
    const { lh, email, planoEscolhido, linkProposta } = req.body || {};
    const plano = PLANOS[planoEscolhido];
    if (!lh || !plano || !email || !/^\S+@\S+\.\S+$/.test(email) || String(email).length > 200 || String(lh).length > 64) {
      return res.status(400).json({ sucesso: false, erro: 'Dados inválidos' });
    }

    const p = await rpc('srv_proposta', { p_lh: lh });
    if (!p) return res.status(403).json({ sucesso: false, erro: 'Proposta não encontrada' });
    if (p.expira_em && Date.now() > new Date(p.expira_em).getTime()) return res.status(403).json({ sucesso: false, erro: 'Proposta expirada' });
    if ((p.emails_cliente || 0) >= MAX_ENVIOS) return res.status(429).json({ sucesso: false, erro: 'Limite de envios atingido' });

    const [planName, campo] = plano;
    const planPrice = p[campo];
    if (!planPrice) return res.status(400).json({ sucesso: false, erro: 'Plano não disponível' });
    const link = LINK_OK.test(linkProposta || '') && String(linkProposta).length < 8000 ? linkProposta : '';
    const nome = String(p.cliente || '').trim().split(/\s+/)[0] || 'tudo bem';
    const wa = `https://wa.me/${WA}?text=` + encodeURIComponent('Olá! Gostaria de fechar o plano ' + planName + '. Podemos avançar?');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;background:#F4EADD;margin:0;padding:20px;color:#6E2C14">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
  <div style="background:#6E2C14;color:#F4EADD;padding:30px;text-align:center">
    <h1 style="margin:0;font-size:30px;letter-spacing:-0.02em">STUDIO PULGA</h1>
    <p style="margin:6px 0 0;font-size:14px;opacity:.85">Sua proposta exclusiva</p>
  </div>
  <div style="padding:36px 30px">
    <div style="font-size:18px;font-weight:700">Olá, ${esc(nome)}.</div>
    <p style="color:#555;line-height:1.6">Obrigado pelo interesse! Aqui está o resumo do plano que você escolheu:</p>
    <div style="background:#F4EADD;border-left:4px solid #6E2C14;padding:20px;border-radius:6px">
      <div style="font-size:22px;font-weight:700">${esc(planName)}</div>
      <div style="font-size:20px;font-weight:600;margin-top:6px">R$ ${esc(planPrice)} <span style="font-size:13px;font-weight:400">por mês</span></div>
    </div>
    <p style="color:#555;line-height:1.6"><strong>Próximos passos:</strong><br>1. Rever a proposta completa<br>2. Tirar dúvidas com a gente<br>3. Confirmar pelo WhatsApp</p>
    ${link ? `<p style="text-align:center;margin:24px 0"><a href="${esc(link)}" style="color:#6E2C14;font-weight:700">VER PROPOSTA COMPLETA →</a></p>` : ''}
    <p style="text-align:center"><a href="${esc(wa)}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700">CONVERSAR PELO WHATSAPP</a></p>
  </div>
  <div style="background:#EAD8C5;padding:18px;text-align:center;font-size:12px;color:#6E2C14">
    <strong>Studio Pulga</strong> · Praia Grande, SP · (13) 9 9605-7099<br>
    <a href="${esc(unsubUrl(lh))}" style="color:#6E2C14">Não quero mais receber estes e-mails</a>
  </div>
</div></body></html>`;

    try { await rpc('srv_email_cliente_inc', { p_lh: lh }); } catch (e) { console.error('contador de envios', e); }
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com', port: 587, secure: false,
      auth: { user: process.env.BREVO_USER, pass: process.env.BREVO_PASS },
    });
    const info = await transporter.sendMail({
      from: process.env.BREVO_FROM || 'Studio Pulga <studio.pulgaa@gmail.com>',
      replyTo: process.env.REPLY_TO || 'contato@studiopulga.com.br',
      to: email,
      subject: `${nome}, sua proposta Studio Pulga: ${planName}`,
      html,
      text: `Olá, ${nome}. Você escolheu o plano ${planName} (R$ ${planPrice}/mês).${link ? '\nVer proposta: ' + link : ''}\nWhatsApp: ${wa}`,
      headers: { 'List-Unsubscribe': `<${unsubUrl(lh)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    });
    return res.status(200).json({ sucesso: true, messageId: info.messageId });
  } catch (erro) {
    console.error('Erro ao enviar email:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro ao enviar e-mail' });
  }
}
