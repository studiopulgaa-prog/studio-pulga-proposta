// api/lembretes.js — cron do Supabase (já existente: 9h e 18h de Brasília). Protegido por CRON_SECRET.
// 9h: sequência da proposta (lembrete + último aviso) e e-mails sazonais (api/_sequencia.js); às segundas, resumo semanal para EMAIL_RESUMO (ou EMAIL_TESTE).
// A chamada das 18h ("noite") não envia nada.
// Fase SIMULAÇÃO (padrão): sem SEQUENCIA_ATIVA=1 no Vercel nada vai para clientes; o cron só REGISTRA o que enviaria (aparece no painel e no resumo).
// Fase LIGADA: SEQUENCIA_ATIVA=1. Trava: no máximo 20 e-mails automáticos por dia.
//   Simulação com data fictícia (nunca envia nem grava): ?simular=1&agora=2027-01-05T12:00:00Z
import { rpc } from './_email.js';
import { rodar, previsao, emailResumo, dentroDaJanela, diaBR, diaStr } from './_sequencia.js';
import { enviarRegistrado } from './_envio.js';
import { emailValido } from './_resend.js';


export async function resumoSemanal({ agora, ativo }) {
  // resumo vai para EMAIL_RESUMO (Gmail da Studio); sem ela, para EMAIL_TESTE
  const para = String(process.env.EMAIL_RESUMO || process.env.EMAIL_TESTE || '').trim();
  if (!emailValido(para)) return { enviado: false, motivo: 'sem_EMAIL_TESTE' };
  const st = await rpc('email_resumo_dados', { p_desde: new Date(agora - 7 * 86400000).toISOString() });
  if (st && st.ja_enviado_hoje) return { enviado: false, motivo: 'ja_enviado' };
  const proximos = previsao(await rpc('seq_dados', {}), agora, 7);
  const m = emailResumo({ st: st || {}, proximos, ativo, agora });
  const r = await enviarRegistrado({ para, assunto: m.assunto, html: m.html, texto: m.texto, tipo: 'resumo', modo: 'interno', chave: `resumo:${diaStr(diaBR(agora))}` });
  return { enviado: !!r.ok, codigo: r.ok ? undefined : r.codigo };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false });
  }
  const q = req.query || {};
  const simular = q.simular === '1';
  let agora = Date.now();
  if (simular && q.agora) {
    const t = Date.parse(q.agora);
    if (!(t === t)) return res.status(400).json({ ok: false, erro: 'data invalida' });
    agora = t;
  }
  // Lixeira do Histórico: apaga de vez o que está lá há mais de 30 dias (nas duas chamadas do dia; nunca na simulação)
  let lixeira = null;
  if (!simular) { try { lixeira = await rpc('adm_lixeira_purgar', {}); } catch (e) { console.error('lixeira', e && e.message); } }
  if (q.turno === 'noite' && !simular) return res.json({ ok: true, turno: 'noite', enviados: [], lixeira_apagadas: lixeira, aviso: 'sem envios fora das 9h-11h' });
  const ativo = !simular && process.env.SEQUENCIA_ATIVA === '1';
  try {
    const r = await rodar({ agora, rpc, ativo, registrarSimulacao: !simular && !ativo });
    // segunda-feira, dentro da janela: resumo semanal (só para EMAIL_TESTE; vale também na fase de simulação)
    if (!simular && dentroDaJanela(agora) && new Date((diaBR(agora)) * 86400000).getUTCDay() === 1) {
      try { r.resumo = await resumoSemanal({ agora, ativo }); } catch (e) { console.error('resumo', e && e.message); r.resumo = { enviado: false, motivo: 'erro' }; }
    }
    return res.json({ ok: true, modo: ativo ? 'envio' : 'simulacao', lixeira_apagadas: lixeira, ...r });
  } catch (err) {
    console.error('lembretes', err && err.message);
    return res.status(500).json({ ok: false, erro: 'erro interno' });
  }
}
