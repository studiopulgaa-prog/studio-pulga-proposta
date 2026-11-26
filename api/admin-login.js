// api/admin-login.js — confere a senha do painel no servidor e devolve uma sessao de 12h (ou de 30 dias, revogavel, se pedido)
import { rpc } from './_email.js';
import { criarToken, criarTokenLongo, usuarioDaSenha, ipDe, cookieSessao, origemOk } from './_seg.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const ip = ipDe(req);
  const manter = (req.body || {}).manter === true;
  if (manter && !origemOk(req)) return res.status(403).json({ ok: false, erro: 'origem nao permitida' }); // so o cookie exige origem; o login normal segue igual
  try {
    // 5 senhas erradas = espera 10 minutos (por aparelho/rede). Sem o SQL do Studio OS, vale a regra antiga (8 em 15 min).
    let bloq = false;
    try { const n = await rpc('login_falhas_min', { p_ip: ip, p_min: 10 }); bloq = Number(n) >= 5; }
    catch (e) { const f = await rpc('login_falhas', { p_ip: ip }); bloq = !!(f && f.ip >= 8); }
    const f2 = await rpc('login_falhas', { p_ip: ip });
    if (bloq || (f2 && f2.total >= 100)) {
      return res.status(429).json({ ok: false, erro: 'Muitas tentativas erradas. Aguarde 10 minutos.' });
    }
  } catch (e) { console.error('login_falhas', e); }

  const u = usuarioDaSenha((req.body || {}).senha);
  if (!u) {
    try { await rpc('login_falha', { p_ip: ip }); } catch (e) { console.error('login_falha', e); }
    await espera(800);
    return res.status(401).json({ ok: false, erro: 'Senha incorreta.' });
  }
  if (manter) {
    // sessao de 30 dias: vai SO no cookie HttpOnly (a resposta nao leva o token, entao a pagina nunca o ve nem o guarda)
    const l = await criarTokenLongo(u);
    if (l) { res.setHeader('Set-Cookie', cookieSessao(l.token, l.exp)); return res.json({ ok: true, longo: true, exp: l.exp, usuario: u }); }
  }
  return res.json({ ok: true, token: criarToken(u), usuario: u });
}
