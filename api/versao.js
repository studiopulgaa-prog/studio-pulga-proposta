// api/versao.js — versão publicada (commit do deploy). O app do admin compara para avisar "Nova versão disponível".
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const v = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev').slice(0, 12);
  res.status(200).json({ v });
}
