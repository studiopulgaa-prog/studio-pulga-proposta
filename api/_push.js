// api/_push.js — notificações no celular (Web Push com VAPID) para o app de atendimento. Não é uma rota.
// Chaves SOMENTE nas variáveis do Vercel: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT. Sem elas, nada é enviado.
// A prévia nunca leva dados financeiros (valores e números longos são escondidos).
import { get, upd, config } from './_wadb.js';

export const pushConfigurado = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const chavePublica = () => process.env.VAPID_PUBLIC_KEY || '';
let pronto = false, webpush = null;
// carregado só quando há envio: se a biblioteca faltar, o webhook e o resto continuam funcionando
async function iniciar() {
  if (pronto) return true;
  if (!pushConfigurado()) return false;
  try { webpush = (await import('web-push')).default; } catch (e) { console.error('push: web-push indisponível'); return false; }
  const sub = /^(mailto:|https:\/\/)/.test(process.env.VAPID_SUBJECT || '') ? process.env.VAPID_SUBJECT : 'mailto:contato@studiopulga.com.br';
  webpush.setVapidDetails(sub, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  pronto = true; return true;
}

// tira da prévia o que pode ser financeiro: R$ 1.234,56, números com 5+ dígitos (CNPJ, código, conta), links
export function previaSegura(t, n = 90) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/R\$\s?[\d.,]+/gi, 'R$ •••').replace(/\d[\d.\-/ ]{4,}\d/g, '•••').replace(/https?:\/\/\S+/gi, '[link]');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// envia para os aparelhos ativos dos usuários (para = ['isaque','ju']). Nunca lança erro.
export async function notificar({ titulo, corpo, url = '/atendimento.html', tag = 'sp', para = ['isaque', 'ju'] } = {}) {
  try {
    if (!(await iniciar())) return { ok: false, motivo: 'sem_vapid' };
    let L;
    try { L = await get('wa_push', { ativo: true }, null, 50); } catch (e) { return { ok: false, motivo: 'sem_sql' }; }
    L = (L || []).filter((s) => para.includes(s.usuario));
    if (!L.length) return { ok: true, enviados: 0 };
    const carga = JSON.stringify({ t: String(titulo || 'Atendimento').slice(0, 60), b: String(corpo || '').slice(0, 140), u: /^\/[a-z0-9._\-/?=&#]*$/i.test(url) ? url : '/atendimento.html', g: String(tag || 'sp').slice(0, 60) });
    let n = 0;
    await Promise.all(L.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 3600, urgency: 'high', timeout: 4000 })
      .then(() => { n++; return upd('wa_push', { id: s.id }, { ultimo_envio_em: new Date().toISOString(), falhas: 0 }); })
      .catch((e) => {
        const st = e && e.statusCode;
        // 404/410: a inscrição não existe mais (app desinstalado ou permissão retirada) -> desativa
        const set = st === 404 || st === 410 ? { ativo: false } : { falhas: (s.falhas || 0) + 1, ativo: (s.falhas || 0) + 1 < 20 };
        return upd('wa_push', { id: s.id }, set).catch(() => {});
      })));
    return { ok: true, enviados: n };
  } catch (e) { console.error('push', e && e.message); return { ok: false, motivo: 'erro' }; }
}

// regras do atendimento: notifica quando a conversa está com a equipe / aguardando humano, pedido de humano e visitante novo.
// O que a IA está resolvendo não notifica (a não ser com "notificar tudo" ligado em Ajustes).
export async function pushMensagem({ conv, contato, texto, nomeExibido, novo }) {
  const tudo = (await config('push_tudo', false)) === true;
  const humano = conv.modo === 'humano' && !(conv.humano_ate && Date.parse(conv.humano_ate) < Date.now());
  if (!(humano || novo || tudo)) return null;
  const quem = nomeExibido || 'Contato';
  const titulo = novo && !contato ? 'Visitante novo · ' + quem : quem;
  return notificar({ titulo, corpo: previaSegura(texto || 'mensagem recebida'), url: '/atendimento.html#c=' + conv.id, tag: 'c' + conv.id });
}
