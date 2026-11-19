// api/admin-logout.js — "Sair": revoga no banco a sessao longa (30 dias) deste aparelho
import { revogarSessao } from './_seg.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try { await revogarSessao(req); } catch (e) { console.error('admin-logout', e); return res.status(500).json({ ok: false }); }
  return res.json({ ok: true });
}
