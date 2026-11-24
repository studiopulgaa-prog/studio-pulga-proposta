// api/_envio.js — TODO e-mail passa por aqui: confere a lista de bloqueados (rejeição/spam), espaça os envios
// (no máximo 1 por segundo), põe o descadastro em 1 clique e registra o envio (email_log) para o painel e o webhook.
import { enviarEmail } from './_resend.js';
import { rpc, unsubUrl } from './_email.js';

let ultimoEnvio = 0;
let INTERVALO_MS = 1000;                       // no máximo 1 e-mail por segundo
export const _ritmoTeste = (ms) => { INTERVALO_MS = ms; ultimoEnvio = 0; };   // só usado pelos testes locais
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function registrar(d) {
  try { return await rpc('log_registrar', { p_d: d }); } catch (e) { console.error('log_registrar', e && e.message); return null; }
}

// opts: { para, assunto, html, texto, tipo, chave, lh, propostaId, campanha, modo, idempotencia, bcc, semDescadastro }
export async function enviarRegistrado(o) {
  const modo = o.modo || 'envio';
  let suprimido = false;
  try { suprimido = !!(await rpc('email_suprimido', { p_email: o.para })); }
  catch (e) { console.error('email_suprimido', e && e.message); return { ok: false, codigo: 'banco', erro: 'Não foi possível conferir a lista de bloqueados agora.' }; }
  if (suprimido) return { ok: false, codigo: 'suprimido', erro: 'Este contato está bloqueado (e-mail rejeitado ou marcado como spam).' };
  const falta = Math.min(INTERVALO_MS, ultimoEnvio + INTERVALO_MS - Date.now());   // nunca espera mais que o intervalo
  if (falta > 0) await esperar(falta);
  ultimoEnvio = Date.now();
  const cabecalhos = o.lh && !o.semDescadastro
    ? { 'List-Unsubscribe': `<${unsubUrl(o.lh)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined;
  const r = await enviarEmail({ para: o.para, assunto: o.assunto, html: o.html, texto: o.texto, idempotencia: o.idempotencia, bcc: o.bcc, cabecalhos });
  await registrar({
    modo, tipo: o.tipo || '', chave: o.chave || null, lh: o.lh || null, proposta_id: o.propostaId || null, email: o.para,
    assunto: o.assunto, campanha: o.campanha || null, status: r.ok ? 'enviado' : 'erro', resend_id: r.ok ? r.id : null,
    erro: r.ok ? null : `${r.codigo || 'erro'}: ${String(r.erro || '').slice(0, 200)}`,
  });
  return r;
}
