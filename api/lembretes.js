// api/lembretes.js — chamado pelo agendador do Supabase as 9h (turno=manha) e 18h (turno=noite), horario de Brasilia.
import { rpc, enviar } from './_email.js';

const DIA = 86400000;
const diaBR = (ts) => Math.round(Date.parse(new Date(ts - 3 * 3600000).toISOString().slice(0, 10)) / DIA);

// agenda proporcional a data real de expiracao: [dia, tipo]
function agenda(envDia, expDia) {
  const s = [];
  const vence = expDia - 1;
  if (vence > envDia) s.push([vence, 'vence']);
  const gap = expDia - envDia;
  if (gap >= 3) { const c = envDia + Math.ceil(gap / 2); if (c < vence) s.push([c, 'curiosidade']); }
  s.push([expDia + 1, 'expirada']);
  s.push([envDia + 15, 'desconto']);
  return s.sort((a, b) => a[0] - b[0]);
}

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false });
  }
  const noite = (req.query && req.query.turno) === 'noite';
  const agora = Date.now();
  const hoje = diaBR(agora);
  const resultado = [];
  try {
    const itens = await rpc('email_pendentes', {});
    for (const e of itens) {
      try {
        // proposta apagada: para a sequencia
        if (!e.expira_em) { await rpc('email_status', { p_lh: e.lh, p_status: 'fechada' }); continue; }
        const expMs = Date.parse(e.expira_em);
        const envDia = diaBR(Date.parse(e.enviados.link));
        const expDia = diaBR(expMs);
        const dados = { cliente: e.cliente, link: e.link, lh: e.lh, expira: e.expira_em };

        if (noite) {
          // 2a versao do aviso "expira amanha", so se a das 9h saiu hoje
          if (hoje === expDia - 1 && e.enviados.vence && !e.enviados.vence18 && agora < expMs) {
            await enviar({ to: e.email, tipo: 'vence18', dados });
            await rpc('email_marcar_enviado', { p_lh: e.lh, p_tipo: 'vence18' });
            resultado.push({ lh: e.lh, tipo: 'vence18' });
          }
          continue;
        }

        const devidos = agenda(envDia, expDia).filter(([d, t]) => d <= hoje && !e.enviados[t] && !e.enviados[t + '_pulado']);
        if (!devidos.length) continue;
        const [, tipo] = devidos[devidos.length - 1];
        for (const [, t] of devidos.slice(0, -1)) await rpc('email_marcar_enviado', { p_lh: e.lh, p_tipo: t + '_pulado' });
        if ((tipo === 'curiosidade' || tipo === 'vence') && agora > expMs) { await rpc('email_marcar_enviado', { p_lh: e.lh, p_tipo: tipo + '_pulado' }); continue; }
        await enviar({ to: e.email, tipo, dados });
        await rpc('email_marcar_enviado', { p_lh: e.lh, p_tipo: tipo });
        resultado.push({ lh: e.lh, tipo });
      } catch (err) {
        console.error('lembrete falhou', e.lh, err);
        resultado.push({ lh: e.lh, erro: err.message });
      }
    }
    return res.json({ ok: true, turno: noite ? 'noite' : 'manha', enviados: resultado });
  } catch (err) {
    console.error('lembretes', err);
    return res.status(500).json({ ok: false, erro: err.message });
  }
}
