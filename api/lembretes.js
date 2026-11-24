// api/lembretes.js — cron do Supabase (já existente: 9h e 18h de Brasília). Protegido por CRON_SECRET.
// Roda a sequência da proposta (lembrete + último aviso) e os e-mails sazonais, via api/_sequencia.js.
// Só envia entre 9h e 11h em dia útil; a chamada das 18h ("noite") não envia nada.
// Segurança: só ENVIA se a variável SEQUENCIA_ATIVA=1 estiver no Vercel; sem ela, apenas SIMULA (devolve o que enviaria).
//   Simulação com data fictícia: ?simular=1&agora=2027-01-05T12:00:00Z  (a data fictícia só vale com simular=1; nunca envia).
import { rpc } from './_email.js';
import { rodar } from './_sequencia.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false });
  }
  const q = req.query || {};
  const simular = q.simular === '1';
  let agora = Date.now();
  if (simular && q.agora) {
    const t = Date.parse(q.agora);
    if (!(t === t)) return res.status(400).json({ ok: false, erro: 'data invalida' });
    agora = t;
  }
  if (q.turno === 'noite' && !simular) return res.json({ ok: true, turno: 'noite', enviados: [], aviso: 'sem envios fora das 9h-11h' });
  const ativo = !simular && process.env.SEQUENCIA_ATIVA === '1';
  try {
    const r = await rodar({ agora, rpc, ativo });
    return res.json({ ok: true, modo: ativo ? 'envio' : 'simulacao', ...r });
  } catch (err) {
    console.error('lembretes', err && err.message);
    return res.status(500).json({ ok: false, erro: 'erro interno' });
  }
}
