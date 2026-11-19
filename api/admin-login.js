// api/admin-login.js — confere a senha do painel no servidor e devolve uma sessao de 12h (ou de 30 dias, revogavel, se pedido)
import { rpc } from './_email.js';
import { criarToken, criarTokenLongo, senhaConfere, ipDe } from './_seg.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const ip = ipDe(req);
  try {
    const f = await rpc('login_falhas', { p_ip: ip });
    if (f && (f.ip >= 8 || f.total >= 100)) {
      return res.status(429).json({ ok: false, erro: 'Muitas tentativas erradas. Aguarde 15 minutos.' });
    }
  } catch (e) { console.error('login_falhas', e); }

  if (!senhaConfere((req.body || {}).senha)) {
    try { await rpc('login_falha', { p_ip: ip }); } catch (e) { console.error('login_falha', e); }
    await espera(800);
    return res.status(401).json({ ok: false, erro: 'Senha incorreta.' });
  }
  if ((req.body || {}).manter === true) {
    const l = await criarTokenLongo();
    if (l) return res.json({ ok: true, token: l.token, longo: true, exp: l.exp });
  }
  return res.json({ ok: true, token: criarToken() });
}
