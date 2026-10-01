// api/descadastrar.js — link "nao quero mais receber" (GET) e One-Click (POST)
import { rpc, token } from './_email.js';

export default async function handler(req, res) {
  const lh = String((req.query && req.query.lh) || '');
  const t = String((req.query && req.query.t) || '');
  const pagina = (msg) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Studio Pulga</title></head><body style="font-family:Arial,sans-serif;background:#F4EADD;color:#6E2C14;text-align:center;padding:60px 20px"><h1>Studio Pulga</h1><p>${msg}</p></body></html>`;
  if (!lh || t !== token(lh)) return res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(pagina('Link inv&aacute;lido.'));
  try {
    await rpc('email_status', { p_lh: lh, p_status: 'descadastrada' });
    return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(pagina('Pronto! Voc&ecirc; n&atilde;o receber&aacute; mais e-mails sobre esta proposta.'));
  } catch (e) {
    return res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(pagina('N&atilde;o foi poss&iacute;vel concluir agora. Tente novamente.'));
  }
}
