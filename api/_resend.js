// api/_resend.js — envio de e-mail pelo Resend (nao e uma rota)
// A chave vem SOMENTE de process.env.RESEND_API_KEY (Vercel). Nunca vai para codigo, log, commit ou resposta.
export const REMETENTE = 'Studio Pulga <contato@studiopulga.com.br>';
export const RESPONDER_PADRAO = 'studio.pulgaa@gmail.com';
// Reply-To: variavel RESPONDER_A (Vercel) se existir e for valida; senao o Gmail da Studio
export const responderPara = () => (emailValido(process.env.RESPONDER_A) ? process.env.RESPONDER_A.trim() : RESPONDER_PADRAO);
const EMAIL_OK = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const emailValido = (e) => typeof e === 'string' && e.length <= 200 && EMAIL_OK.test(e) && !/[\r\n]/.test(e);

// Trava opcional de seguranca (ex.: no Preview): RESEND_SOMENTE_PARA="a@x.com,b@y.com" so deixa enviar para esses enderecos
function bloqueadoPelaTrava(para) {
  const lista = String(process.env.RESEND_SOMENTE_PARA || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return lista.length > 0 && !lista.includes(String(para).toLowerCase());
}

// enviarEmail({para, assunto, html, texto?, idempotencia?}) -> {ok:true, id} | {ok:false, codigo, erro}
// Pronto para a fase 2 (lembretes de cobranca): so chamar com outro assunto/html. Nunca dispara sozinho.
export async function enviarEmail({ para, assunto, html, texto, idempotencia, bcc, cabecalhos }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, codigo: 'sem_chave', erro: 'E-mail não configurado: falta a variável RESEND_API_KEY no Vercel.' };
  if (!emailValido(para)) return { ok: false, codigo: 'email_invalido', erro: 'E-mail do cliente inválido.' };
  if (bloqueadoPelaTrava(para)) return { ok: false, codigo: 'trava', erro: 'Envio bloqueado: este ambiente só envia para endereços de teste.' };
  if (typeof assunto !== 'string' || !assunto.trim() || assunto.length > 200 || /[\r\n]/.test(assunto)) return { ok: false, codigo: 'dados', erro: 'Assunto inválido.' };
  if (typeof html !== 'string' || !html || html.length > 200000) return { ok: false, codigo: 'dados', erro: 'Conteúdo do e-mail inválido.' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` };
    if (idempotencia) headers['Idempotency-Key'] = String(idempotencia).slice(0, 256);
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers, signal: ctrl.signal,
      body: JSON.stringify({ from: REMETENTE, to: [para], subject: assunto, html, text: texto || undefined, reply_to: responderPara(), bcc: bcc && emailValido(bcc) ? [bcc] : undefined, headers: cabecalhos || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j && j.id) return { ok: true, id: j.id };
    console.error('resend', r.status, j && (j.name || j.message) ? String(j.name || '') + ' ' + String(j.message || '').slice(0, 200) : '');
    return { ok: false, codigo: 'resend_' + r.status, erro: 'O serviço de e-mail recusou o envio' + (j && j.message ? ': ' + String(j.message).slice(0, 160) : ' (HTTP ' + r.status + ').') };
  } catch (e) {
    console.error('resend falha', e && e.name);
    return { ok: false, codigo: 'rede', erro: e && e.name === 'AbortError' ? 'O serviço de e-mail demorou demais para responder.' : 'Não foi possível falar com o serviço de e-mail.' };
  } finally { clearTimeout(t); }
}

// ---- modelo "Sua proposta" (visual simples terracota/creme; estilos inline, sem imagens externas)
const BR = { timeZone: 'America/Sao_Paulo' };
const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p.charAt(0).toUpperCase() + p.slice(1) : ''; };
export const fmtValidade = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { ...BR, day: '2-digit', month: '2-digit', year: 'numeric' }) + ' às ' + d.toLocaleTimeString('pt-BR', { ...BR, hour: '2-digit', minute: '2-digit' });
};

export function emailProposta({ cliente, link, expira }) {
  const nome = primeiroNome(cliente);
  const val = fmtValidade(expira);
  const assunto = nome ? `${nome}, sua proposta da Studio Pulga` : 'Sua proposta da Studio Pulga';
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#F4EADD;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F4EADD">Sua proposta exclusiva está pronta. Válida até ${esc(val)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EADD"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#6E2C14;padding:28px 30px;text-align:center"><div style="font-family:'Arial Black',Arial,sans-serif;font-size:26px;font-weight:900;letter-spacing:.04em;color:#F4EADD">STUDIO PULGA</div><div style="font-size:11px;letter-spacing:.18em;color:#d9bfae;margin-top:6px">SUA PROPOSTA</div></td></tr>
<tr><td style="padding:34px 32px 8px">
<p style="margin:0 0 16px;font-size:18px;line-height:1.5;color:#6E2C14;font-weight:700">Olá${nome ? ', ' + esc(nome) : ''}!</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#4a3a33">Preparei uma proposta exclusiva para você. É só tocar no botão abaixo para ver todos os detalhes.</p>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:26px auto"><tr><td style="background:#6E2C14;border-radius:50px"><a href="${esc(link)}" style="display:inline-block;padding:15px 34px;color:#F4EADD;font-weight:700;font-size:15px;text-decoration:none;letter-spacing:.02em">Ver minha proposta</a></td></tr></table>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#6b5a50;text-align:center">Ela é individual e tem validade até <strong style="color:#6E2C14">${esc(val)}</strong>.</p>
<p style="margin:0 0 22px;font-size:12px;line-height:1.6;color:#6b5a50;text-align:center;word-break:break-all">Se o botão não abrir, copie este endereço no navegador:<br><a href="${esc(link)}" style="color:#6E2C14">${esc(link)}</a></p>
<p style="margin:0 0 6px;font-size:16px;line-height:1.65;color:#4a3a33">Qualquer dúvida, é só responder este e-mail.</p>
<p style="margin:0 0 26px;font-size:16px;line-height:1.65;color:#4a3a33">Um abraço,<br><strong style="color:#6E2C14">Equipe Studio Pulga</strong></p>
</td></tr>
<tr><td style="background:#EAD8C5;padding:20px;text-align:center;font-size:12px;line-height:1.6;color:#6b5a50"><strong>Studio Pulga</strong> · Praia Grande, SP · (13) 9 9605-7099<br>Este e-mail foi enviado porque você pediu uma proposta à Studio Pulga.</td></tr>
</table></td></tr></table></body></html>`;
  const texto = `Olá${nome ? ', ' + nome : ''}!\n\nPreparei uma proposta exclusiva para você: ${link}\n\nEla é individual e tem validade até ${val}.\n\nQualquer dúvida, é só responder este e-mail.\n\nUm abraço,\nEquipe Studio Pulga\nStudio Pulga · Praia Grande, SP · (13) 9 9605-7099`;
  return { assunto, html, texto };
}
