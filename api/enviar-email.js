// api/enviar-email.js — "Enviar proposta por e-mail" (Resend). Chamado pelo admin em /api/admin/enviar-email (rewrite no vercel.json,
// para o cookie de 30 dias, que so vai para /api/admin/*, chegar aqui). Protegido pela sessao do admin (+ conferencia de Origin no cookie).
import { rpc, SITE } from './_email.js';
import { sessaoValida, LINK_OK } from './_seg.js';
import { emailProposta, emailValido } from './_resend.js';
import { enviarRegistrado } from './_envio.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOTIVO = {
  nao_encontrada: [404, 'Proposta não encontrada.'],
  expirada: [409, 'A proposta está expirada. Reative a validade antes de enviar.'],
  sem_email: [400, 'Esta proposta não tem e-mail do cliente.'],
  sem_link: [409, 'Esta proposta não tem link guardado; gere uma nova.'],
  cancelada: [409, 'Esta proposta foi cancelada. Reative antes de enviar.'],
  suprimido: [409, 'Este contato está bloqueado: o e-mail foi rejeitado ou marcado como spam antes.'],
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });
  if (!(await sessaoValida(req))) return res.status(401).json({ ok: false, erro: 'sessao expirada' });
  const b = req.body || {};
  if (b.acao !== 'proposta' || !UUID.test(b.id || '')) return res.status(400).json({ ok: false, erro: 'dados invalidos' });
  // sem a chave nada e reservado nem gravado: o admin so recebe um aviso claro
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ ok: false, erro: 'E-mail não configurado: falta a variável RESEND_API_KEY no Vercel.' });
  let reservado = false;
  try {
    const r = await rpc('adm_email_reservar', { p_id: b.id });
    if (!r || !r.ok) {
      if (r && r.motivo === 'limite') return res.status(429).json({ ok: false, erro: `Aguarde ${r.espera_s}s para enviar de novo (limite de 1 envio por minuto por proposta).`, espera_s: r.espera_s });
      const m = MOTIVO[r && r.motivo] || [400, 'Não foi possível enviar.'];
      return res.status(m[0]).json({ ok: false, erro: m[1] });
    }
    reservado = true;
    if (!emailValido(r.email)) {
      await rpc('adm_email_resultado', { p_id: b.id, p_ok: false, p_erro: 'E-mail do cliente inválido.' });
      return res.status(400).json({ ok: false, erro: 'E-mail do cliente inválido. Confira o endereço.' });
    }
    // link individual curto /p/<slug>; se a proposta ainda nao tem, cria um (mesmo formato do admin)
    let slug = r.slug;
    if (!slug) {
      if (!LINK_OK.test(r.link || '')) {
        await rpc('adm_email_resultado', { p_id: b.id, p_ok: false, p_erro: 'Link da proposta inválido.' });
        return res.status(409).json({ ok: false, erro: 'Link da proposta inválido.' });
      }
      const base = String(r.cliente || 'proposta').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'proposta';
      slug = `${base}-${Date.now().toString(36)}`;
      await rpc('adm_link', { p_slug: slug, p_url: r.link });
    }
    const link = `${SITE}/p/${slug}`;
    const m = emailProposta({ cliente: r.cliente, link, expira: r.expira_em });
    const env = await enviarRegistrado({ para: r.email, assunto: m.assunto, html: m.html, texto: m.texto, lh: r.lh, propostaId: b.id, tipo: 'link', chave: r.lh ? `link:${r.lh}` : null, idempotencia: `proposta-${b.id}-${Math.floor(Date.now() / 60000)}` });
    const reg = await rpc('adm_email_resultado', { p_id: b.id, p_ok: env.ok, p_erro: env.ok ? '' : env.erro });
    if (!env.ok) return res.status(502).json({ ok: false, erro: env.erro, codigo: env.codigo });
    // entra na sequência de lembretes (a data deste primeiro e-mail é a base do cálculo); falha aqui não desfaz o envio
    try { await rpc('seq_registrar_link', { p_id: b.id, p_link: link }); } catch (e) { console.error('seq_registrar_link', e && e.message); }
    return res.json({ ok: true, enviado_em: reg && reg.enviado_em, para: r.email });
  } catch (e) {
    console.error('enviar-email', e && e.message);
    if (reservado) { try { await rpc('adm_email_resultado', { p_id: b.id, p_ok: false, p_erro: 'Erro interno ao enviar.' }); } catch (x) { /* segue */ } }
    return res.status(500).json({ ok: false, erro: 'erro interno' });
  }
}
