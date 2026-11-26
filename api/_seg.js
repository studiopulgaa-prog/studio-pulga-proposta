// api/_seg.js — sessao do admin (token assinado no servidor) e utilitarios de seguranca
import crypto from 'crypto';
import { rpc } from './_email.js';

const TTL = 12 * 3600 * 1000; // sessao normal: 12 horas
export const TTL_LONGO = 30 * 24 * 3600 * 1000; // "manter conectado": 30 dias, revogavel (fica registrada no banco)
const assinar = (dados) => crypto.createHmac('sha256', process.env.ADMIN_TOKEN_SECRET || '').update(dados).digest('base64url');

// usuários do Studio OS: isaque (tudo) e ju (Início, Atendimento, Clientes e Comercial). Token sem usuário (antigo) = isaque.
export const USUARIOS = ['isaque', 'ju'];
const usuarioOk = (u) => (USUARIOS.includes(u) ? u : 'isaque');
export function criarToken(u = 'isaque') {
  const dados = Buffer.from(JSON.stringify({ exp: Date.now() + TTL, u: usuarioOk(u) })).toString('base64url');
  return `${dados}.${assinar(dados)}`;
}

// ---- cookie da sessao de 30 dias: HttpOnly (script nao le), Secure, SameSite=Strict.
// Path=/api/admin: o navegador so manda o cookie para /api/admin e /api/admin/* (nunca para a pagina do cliente, /p/ ou outras rotas).
export const COOKIE = 'sp_admin';
const ATRIBUTOS = 'Path=/api/admin; HttpOnly; Secure; SameSite=Strict';
export const cookieSessao = (token, exp) => `${COOKIE}=${token}; Max-Age=${Math.max(1, Math.floor((exp - Date.now()) / 1000))}; ${ATRIBUTOS}`;
export const cookieLimpo = () => `${COOKIE}=; Max-Age=0; ${ATRIBUTOS}`;
export function lerCookie(req) {
  const c = String((req.headers && req.headers.cookie) || '');
  for (const p of c.split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === COOKIE) return p.slice(i + 1).trim();
  }
  return '';
}
// so aceita requisicoes que partem do proprio endereco do admin (Origin; se faltar, o Referer)
const ORIGEM_OK = /^https:\/\/(proposta\.studiopulga\.com\.br|studio-pulga-proposta\.vercel\.app|studio-pulga-proposta-[a-z0-9-]+-isaque-s-projects3\.vercel\.app)$/;
export function origemOk(req) {
  const h = req.headers || {};
  let o = String(h.origin || '');
  if (!o) { try { o = new URL(String(h.referer || '')).origin; } catch (e) { o = ''; } }
  return ORIGEM_OK.test(o);
}

// confere assinatura e prazo; devolve {d: conteudo do token, via: 'bearer'|'cookie'} ou null
function lerToken(req) {
  if (!process.env.ADMIN_TOKEN_SECRET) return null;
  const h = String((req.headers && req.headers.authorization) || '');
  let t = '', via = 'bearer';
  if (h.startsWith('Bearer ') && h.slice(7)) t = h.slice(7);
  else { t = lerCookie(req); via = 'cookie'; }
  const [dados, sig] = t.split('.');
  if (!dados || !sig) return null;
  const esperado = assinar(dados);
  if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
  try { return { d: JSON.parse(Buffer.from(dados, 'base64url').toString()), via }; } catch (e) { return null; }
}

// sessao normal (12h): vale pela assinatura e pelo prazo. Sessao longa (30 dias): alem disso precisa estar registrada e nao revogada no banco.
// Se o banco nao responder, a sessao longa e recusada (nunca aceita "no escuro").
// devolve { u: 'isaque'|'ju' } quando a sessão vale; senão null
export async function sessao(req) {
  const t = lerToken(req);
  if (!t) return null;
  if (t.via === 'cookie' && !origemOk(req)) return null; // cookie vai sozinho no pedido: so vale se o pedido partiu do admin
  const d = t.d;
  if (!(d.exp > Date.now())) return null;
  const s = { u: usuarioOk(d.u) };
  if (d.k !== 'l') return s;
  if (typeof d.j !== 'string' || !/^[0-9a-f]{32}$/.test(d.j)) return null;
  try { return (await rpc('adm_sessao_ok', { p_jti: d.j })) === true ? s : null; } catch (e) { console.error('adm_sessao_ok', e); return null; }
}
export async function sessaoValida(req) { return !!(await sessao(req)); }
// sessão do Isaque (áreas que a Ju não acessa: Ajustes, Financeiro detalhado, E-mails, Conteúdo)
export async function sessaoIsaque(req) { const s = await sessao(req); return !!(s && s.u === 'isaque'); }

// cria uma sessao longa registrada no banco; se nao der, devolve null (o login cai para a sessao normal de 12h)
export async function criarTokenLongo(u = 'isaque') {
  const j = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + TTL_LONGO;
  try { await rpc('adm_sessao_nova', { p_jti: j, p_exp: new Date(exp).toISOString() }); } catch (e) { console.error('adm_sessao_nova', e); return null; }
  const dados = Buffer.from(JSON.stringify({ exp, k: 'l', j, u: usuarioOk(u) })).toString('base64url');
  return { token: `${dados}.${assinar(dados)}`, exp };
}

// "Sair": revoga a sessao longa deste aparelho
export async function revogarSessao(req) {
  const t = lerToken(req);
  const d = t && t.d;
  if (!d || d.k !== 'l' || typeof d.j !== 'string' || !/^[0-9a-f]{32}$/.test(d.j)) return false;
  await rpc('adm_sessao_revogar', { p_jti: d.j });
  return true;
}

// compara a senha digitada com uma do Vercel, sem diferenciar maiusculas
function confere(senha, certaEnv) {
  const certa = String(certaEnv || '').trim().toUpperCase();
  if (!certa) return false;
  const a = crypto.createHash('sha256').update(String(senha || '').trim().toUpperCase()).digest();
  const b = crypto.createHash('sha256').update(certa).digest();
  return crypto.timingSafeEqual(a, b);
}
export function senhaConfere(senha) { return confere(senha, process.env.ADMIN_PASSWORD); }
// qual usuário é dono da senha: ADMIN_PASSWORD = isaque; ATENDIMENTO_SENHA_JU = ju (as duas sempre conferidas, mesmo tempo)
export function usuarioDaSenha(senha) {
  const i = confere(senha, process.env.ADMIN_PASSWORD), j = confere(senha, process.env.ATENDIMENTO_SENHA_JU);
  return i ? 'isaque' : j ? 'ju' : null;
}

export const ipDe = (req) => String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim() || 'desconhecido';

// links de proposta aceitos (dominio proprio ou o do Vercel)
export const LINK_OK = /^https:\/\/(proposta\.studiopulga\.com\.br|studio-pulga-proposta[a-z0-9-]*\.vercel\.app)\//;
