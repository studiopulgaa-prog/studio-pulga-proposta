// api/lembretes.js — roda 1x por dia (Vercel Cron). Envia o lembrete devido de cada proposta ativa.
import { rpc, enviar } from './_email.js';

const DIA = 86400000;
const diaBR = (ts) => Date.parse(new Date(ts - 3 * 3600000).toISOString().slice(0, 10));

// dia (contado a partir do envio do link) => tipo de e-mail, proporcional a validade V
function calendario(V) {
  const s = [];
  if (V >= 3) s.push([Math.ceil(V / 2), 'curiosidade']);
  if (V >= 2 && !s.some((x) => x[0] >= V - 1)) s.push([V - 1, 'vence']);
  s.push([V + 1, 'expirada']);
  s.push([15, 'desconto']);
  return s.sort((a, b) => a[0] - b[0]);
}

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false });
  }
  const agora = Date.now();
  const resultado = [];
  try {
    const lista = await rpc('email_pendentes', {});
    for (const e of lista) {
      try {
        // proposta apagada: para a sequencia
        if (!e.expira_em) { await rpc('email_status', { p_lh: e.lh, p_status: 'fechada' }); continue; }
        const V = e.validade || 2;
        const dias = Math.round((diaBR(agora) - diaBR(Date.parse(e.enviados.link))) / DIA);
        const devidos = calendario(V).filter(([d, t]) => d <= dias && !e.enviados[t] && !e.enviados[t + '_pulado']);
        if (!devidos.length) continue;
        const [, tipo] = devidos[devidos.length - 1];
        for (const [, t] of devidos.slice(0, -1)) await rpc('email_marcar_enviado', { p_lh: e.lh, p_tipo: t + '_pulado' });
        const expirada = agora > new Date(e.expira_em).getTime();
        if ((tipo === 'curiosidade' || tipo === 'vence') && expirada) { await rpc('email_marcar_enviado', { p_lh: e.lh, p_tipo: tipo + '_pulado' }); continue; }
        await enviar({ to: e.email, tipo, dados: { cliente: e.cliente, link: e.link, lh: e.lh, validade: V } });
        await rpc('email_marcar_enviado', { p_lh: e.lh, p_tipo: tipo });
        resultado.push({ lh: e.lh, tipo });
      } catch (err) {
        console.error('lembrete falhou', e.lh, err);
        resultado.push({ lh: e.lh, erro: err.message });
      }
    }
    return res.json({ ok: true, enviados: resultado });
  } catch (err) {
    console.error('lembretes', err);
    return res.status(500).json({ ok: false, erro: err.message });
  }
}
