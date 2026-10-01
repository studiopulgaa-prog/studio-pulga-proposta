// api/email-admin.js — acoes do admin: enviar link por e-mail, mudar status, listar
import { rpc, propostaDoBanco, enviar } from './_email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Metodo nao permitido' });
  const { senha, acao, lh, email, cliente, link, status, modo } = req.body || {};
  if (senha !== (process.env.ADMIN_KEY || 'Studio2801')) return res.status(401).json({ ok: false, erro: 'nao autorizado' });

  try {
    if (acao === 'listar') {
      return res.json({ ok: true, itens: await rpc('email_listar', {}) });
    }
    if (acao === 'status') {
      if (!lh) return res.status(400).json({ ok: false, erro: 'lh obrigatorio' });
      await rpc('email_status', { p_lh: lh, p_status: status });
      return res.json({ ok: true });
    }
    if (acao === 'enviar') {
      if (!lh || !cliente || !/^\S+@\S+\.\S+$/.test(email || '') || !/^https:\/\//.test(link || '')) {
        return res.status(400).json({ ok: false, erro: 'dados invalidos' });
      }
      const p = await propostaDoBanco(lh);
      if (!p) return res.status(404).json({ ok: false, erro: 'proposta nao encontrada' });
      if (p.expira_em && Date.now() > new Date(p.expira_em).getTime()) return res.status(403).json({ ok: false, erro: 'proposta expirada' });
      const reg = await rpc('email_registrar', { p_lh: lh, p_email: email, p_cliente: cliente, p_link: link });
      if (reg.enviados && reg.enviados.link) return res.status(409).json({ ok: false, erro: 'o e-mail com o link ja foi enviado para esta proposta' });
      if (reg.status === 'descadastrada') return res.status(409).json({ ok: false, erro: 'este cliente pediu para nao receber e-mails' });
      // copia oculta para voce conferir o 1o e-mail na hora
      await enviar({ to: reg.email, tipo: 'link', dados: { cliente, link, lh, expira: p.expira_em }, bcc: process.env.BCC_COPIA || 'studio.pulgaa@gmail.com' });
      await rpc('email_marcar_enviado', { p_lh: lh, p_tipo: 'link' });
      // modo teste: envia so este e-mail, sem lembretes
      if (modo === 'teste') await rpc('email_status', { p_lh: lh, p_status: 'teste' });
      return res.json({ ok: true, modo: modo === 'teste' ? 'teste' : 'ativar' });
    }
    return res.status(400).json({ ok: false, erro: 'acao invalida' });
  } catch (e) {
    console.error('email-admin', e);
    return res.status(500).json({ ok: false, erro: e.message || 'erro' });
  }
}
