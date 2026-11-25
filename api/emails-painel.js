// api/emails-painel.js — aba "E-mails" do admin (via /api/admin/emails, rewrite no vercel.json para o cookie de 30 dias chegar).
// Ações: painel | timeline {id} | teste {modelo}. Sessão do admin obrigatória. O teste vai SÓ para EMAIL_TESTE.
import { rpc } from './_email.js';
import { sessaoValida } from './_seg.js';
import { emailValido } from './_resend.js';
import { previsao, modelosTeste, LIMITE_DIA } from './_sequencia.js';
import { validarConteudo } from './admin.js';
import { enviarRegistrado } from './_envio.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mascarar = (e) => { const [u, d] = String(e).split('@'); return u && d ? u.slice(0, 2) + '•••@' + d : ''; };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });
  if (!(await sessaoValida(req))) return res.status(401).json({ ok: false, erro: 'sessao expirada' });
  const b = req.body || {};
  const teste = String(process.env.EMAIL_TESTE || '').trim();
  try {
    if (b.acao === 'painel') {
      const [p, dados] = await Promise.all([rpc('adm_emails_painel', {}), rpc('seq_dados', {})]);
      return res.json({
        ok: true, ...p, proximos: previsao(dados, Date.now(), 7), limite_dia: LIMITE_DIA,
        modo: process.env.SEQUENCIA_ATIVA === '1' ? 'envio' : 'simulacao',
        email_teste: emailValido(teste) ? mascarar(teste) : '', webhook: !!process.env.RESEND_WEBHOOK_SECRET,
        modelos: modelosTeste(undefined, (dados && dados.conteudo) || null).map((m) => ({ id: m.id, nome: m.nome })),
      });
    }
    if (b.acao === 'timeline') {
      if (!UUID.test(b.id || '')) return res.status(400).json({ ok: false, erro: 'dados invalidos' });
      const t = await rpc('adm_email_timeline', { p_id: b.id });
      if (!t) return res.status(404).json({ ok: false, erro: 'Proposta não encontrada.' });
      let proximos = [];
      try { proximos = previsao(await rpc('seq_dados', {}), Date.now(), 30).filter((x) => x.lh === t.lh); } catch (e) { /* segue sem previsão */ }
      return res.json({ ok: true, ...t, proximos, modo: process.env.SEQUENCIA_ATIVA === '1' ? 'envio' : 'simulacao' });
    }
    // textos usados no teste/prévia: o rascunho da aba Conteúdo (se veio) ou os publicados
    const conteudo = async () => {
      if (b.conteudo != null) { const v = validarConteudo(b.conteudo); if (v.erro) throw Object.assign(new Error(v.erro), { status: 400 }); return v.dados; }
      return (await rpc('conteudo_atual', {})) || null;
    };
    if (b.acao === 'previa') {   // HTML do e-mail com dados fictícios (nada é enviado)
      const m = modelosTeste(undefined, await conteudo()).find((x) => x.id === b.modelo);
      if (!m) return res.status(400).json({ ok: false, erro: 'Modelo inválido.' });
      const e = m.f();
      return res.json({ ok: true, assunto: e.assunto, html: e.html });
    }
    if (b.acao === 'teste') {
      if (!emailValido(teste)) return res.status(503).json({ ok: false, erro: 'Falta a variável EMAIL_TESTE no Vercel (o e-mail que recebe os testes).' });
      const m = modelosTeste(undefined, await conteudo()).find((x) => x.id === b.modelo);
      if (!m) return res.status(400).json({ ok: false, erro: 'Modelo inválido.' });
      const espera = await rpc('adm_teste_espera', {});
      if (espera > 0) return res.status(429).json({ ok: false, erro: `Aguarde ${espera}s para enviar outro teste.` });
      const e = m.f();
      const r = await enviarRegistrado({ para: teste, assunto: '[TESTE] ' + e.assunto, html: e.html, texto: e.texto, tipo: 'teste', modo: 'teste', campanha: m.id, semDescadastro: true });
      if (!r.ok) return res.status(502).json({ ok: false, erro: r.erro || 'Falha no envio.' });
      return res.json({ ok: true, para: mascarar(teste), modelo: m.nome });
    }
    return res.status(400).json({ ok: false, erro: 'acao invalida' });
  } catch (e) {
    if (e && e.status === 400) return res.status(400).json({ ok: false, erro: e.message });
    console.error('emails-painel', e && e.message);
    return res.status(500).json({ ok: false, erro: 'Erro ao carregar os dados de e-mail. Tente de novo.' });
  }
}
