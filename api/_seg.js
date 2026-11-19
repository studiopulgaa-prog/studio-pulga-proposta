// api/_seg.js — sessao do admin (token assinado no servidor) e utilitarios de seguranca
import crypto from 'crypto';
import { rpc } from './_email.js';

const TTL = 12 * 3600 * 1000; // sessao normal: 12 horas
export const TTL_LONGO = 30 * 24 * 3600 * 1000; // "manter conectado": 30 dias, revogavel (fica registrada no banco)
const assinar = (dados) => crypto.createHmac('sha256', process.env.ADMIN_TOKEN_SECRET || '').update(dados).digest('base64url');

export function criarToken() {
  const dados = Buffer.from(JSON.stringify({ exp: Date.now() + TTL })).toString('base64url');
  return `${dados}.${assinar(dados)}`;
}

// confere assinatura e prazo; devolve o conteudo do token ou null
function lerToken(req) {
  if (!process.env.ADMIN_TOKEN_SECRET) return null;
  const h = String((req.headers && req.headers.authorization) || '');
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [dados, sig] = t.split('.');
  if (!dados || !sig) return null;
  const esperado = assinar(dados);
  if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
  try { return JSON.parse(Buffer.from(dados, 'base64url').toString()); } catch (e) { return null; }
}

// sessao normal (12h): vale pela assinatura e pelo prazo. Sessao longa (30 dias): alem disso precisa estar registrada e nao revogada no banco.
// Se o banco nao responder, a sessao longa e recusada (nunca aceita "no escuro").
export async function sessaoValida(req) {
  const d = lerToken(req);
  if (!d || !(d.exp > Date.now())) return false;
  if (d.k !== 'l') return true;
  if (typeof d.j !== 'string' || !/^[0-9a-f]{32}$/.test(d.j)) return false;
  try { return (await rpc('adm_sessao_ok', { p_jti: d.j })) === true; } catch (e) { console.error('adm_sessao_ok', e); return false; }
}

// cria uma sessao longa registrada no banco; se nao der, devolve null (o login cai para a sessao normal de 12h)
export async function criarTokenLongo() {
  const j = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + TTL_LONGO;
  try { await rpc('adm_sessao_nova', { p_jti: j, p_exp: new Date(exp).toISOString() }); } catch (e) { console.error('adm_sessao_nova', e); return null; }
  const dados = Buffer.from(JSON.stringify({ exp, k: 'l', j })).toString('base64url');
  return { token: `${dados}.${assinar(dados)}`, exp };
}

// "Sair": revoga a sessao longa deste aparelho
export async function revogarSessao(req) {
  const d = lerToken(req);
  if (!d || d.k !== 'l' || typeof d.j !== 'string' || !/^[0-9a-f]{32}$/.test(d.j)) return false;
  await rpc('adm_sessao_revogar', { p_jti: d.j });
  return true;
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
