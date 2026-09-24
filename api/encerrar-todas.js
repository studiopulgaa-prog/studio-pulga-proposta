// api/encerrar-todas.js — Vercel Serverless Function
// Chamada pelo admin com senha para encerrar todas as propostas no Supabase
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { senha } = req.body || {};
  if (senha !== 'Studio2801') return res.status(401).json({ error: 'não autorizado' });

  const SUPA = 'https://ixclkelqjpfkucejbzuq.supabase.co';
  const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4Y2xrZWxxanBma3VjZWpienVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzM5NTAsImV4cCI6MjA5NjA0OTk1MH0.VmXA6P-9IS0TsNnh_2ZGBQZQqtqtCrp4CdHGOVIc5zU';

  const agora = new Date().toISOString();
  
  // Encerrar todas
  const r = await fetch(`${SUPA}/rest/v1/propostas`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ expira_em: agora })
  });

  if (r.ok) {
    res.json({ ok: true, encerradas_em: agora });
  } else {
    const err = await r.text();
    res.status(500).json({ ok: false, error: err });
  }
}
