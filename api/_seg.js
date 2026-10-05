// api/_seg.js — sessao do admin (token assinado no servidor) e utilitarios de seguranca
import crypto from 'crypto';

const TTL = 12 * 3600 * 1000; // sessao dura 12 horas
const assinar = (dados) => crypto.createHmac('sha256', process.env.ADMIN_TOKEN_SECRET || '').update(dados).digest('base64url');

export function criarToken() {
  const dados = Buffer.from(JSON.stringify({ exp: Date.now() + TTL })).toString('base64url');
  return `${dados}.${assinar(dados)}`;
}

export function tokenValido(req) {
  if (!process.env.ADMIN_TOKEN_SECRET) return false;
  const h = String((req.headers && req.headers.authorization) || '');
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [dados, sig] = t.split('.');
  if (!dados || !sig) return false;
  const esperado = assinar(dados);
  if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return false;
  try { return JSON.parse(Buffer.from(dados, 'base64url').toString()).exp > Date.now(); } catch (e) { return false; }
}

// compara a senha digitada com a do Vercel (ADMIN_PASSWORD), sem diferenciar maiusculas
export function senhaConfere(senha) {
  const certa = String(process.env.ADMIN_PASSWORD || '').trim().toUpperCase();
  if (!certa) return false;
  const a = crypto.createHash('sha256').update(String(senha || '').trim().toUpperCase()).digest();
  const b = crypto.createHash('sha256').update(certa).digest();
  return crypto.timingSafeEqual(a, b);
}

export const ipDe = (req) => String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim() || 'desconhecido';

// links de proposta aceitos (dominio proprio ou o do Vercel)
export const LINK_OK = /^https:\/\/(proposta\.studiopulga\.com\.br|studio-pulga-proposta[a-z0-9-]*\.vercel\.app)\//;
