// api/_conteudo.js — textos editáveis da aba "Conteúdo" do admin (e-mails, campanhas, dados gerais). Não é uma rota.
// Os textos publicados ficam no banco (conteudo_versoes). Sem nada publicado, tudo continua EXATAMENTE como antes
// (os modelos originais de _sequencia.js e _resend.js). Aqui ficam os textos de fábrica e as funções de texto.
// Formato dos textos: só texto. **negrito**, linha em branco = novo parágrafo, Enter = quebra de linha.
// Variáveis: [Nome] [data] [link] [item] [valor]
import { esc } from './_resend.js';
import { CAMPANHAS, BOTAO_PADRAO } from './_campanhas.js';

export const EMAILS_PADRAO = {
  link: {
    assunto: '[Nome], sua proposta da Studio Pulga',
    pre: 'Sua proposta exclusiva está pronta. Válida até [data].',
    corpo: 'Preparei uma proposta exclusiva para você. É só tocar no botão abaixo para ver todos os detalhes.',
  },
  lembrete: {
    assunto: 'Ei, [Nome]! Sua proposta ainda tá por aqui 👀',
    pre: 'Sua proposta segue aberta até [data].',
    corpo: 'Conheço alguém que ainda não se decidiu, mas a gente tá por aqui, em? 😄\n\nSua proposta segue aberta até [data]. Luz, câmera e gravação, com roteiros, direção criativa e vantagens exclusivas esperando você. Bora criar com os pulguinhas?',
  },
  ultimo_amanha: {
    assunto: 'Última chamada, [Nome]! Amanhã a proposta vai embora',
    pre: 'Sua proposta vence amanhã.',
    corpo: 'Lets go? Amanhã, [data], ela vence e a gente segue pro próximo da fila. Quer fechar, ajustar ou pedir um tempinho a mais? Responde aqui, sem cerimônia.',
  },
  ultimo_hoje: {
    assunto: 'Última chamada, [Nome]! Hoje a proposta vai embora',
    pre: 'Sua proposta vence hoje.',
    corpo: 'Lets go? Hoje, [data], ela vence e a gente segue pro próximo da fila. Quer fechar, ajustar ou pedir um tempinho a mais? Responde aqui, sem cerimônia.',
  },
};
export const EMAILS_NOMES = { link: 'Envio do link', lembrete: 'Lembrete (metade da validade)', ultimo_amanha: 'Último aviso (vence amanhã)', ultimo_hoje: 'Último aviso (vence hoje)' };

export const GERAIS_PADRAO = {
  telefone: '(13) 9 9605-7099',
  whatsapp: '5513996057099',
  endereco: 'Praia Grande, SP',
  assinatura: 'Os pulguinhas do Studio Pulga',
  rodape_email: '',
};

// campanhas de fábrica no formato do editor (corpo em texto; parágrafos separados por linha em branco)
export const campanhasPadrao = () => CAMPANHAS.map((c) => ({
  id: c.id, ...(c.data ? { data: c.data } : { anual: c.anual }), publico: c.publico,
  assunto: c.assunto, corpo: c.corpo.join('\n\n'), botao: c.botao || '', ligado: true,
}));

export const padrao = () => ({ emails: EMAILS_PADRAO, emails_nomes: EMAILS_NOMES, gerais: GERAIS_PADRAO, campanhas: { itens: campanhasPadrao() }, botao_padrao: BOTAO_PADRAO });

// ---------- texto -> HTML seguro ----------
const VARS = { nome: 'Nome', data: 'data', link: 'link', item: 'item', valor: 'valor' };
export function trocaVars(t, v = {}) {
  return String(t == null ? '' : t).replace(/\[(nome|data|link|item|valor)\]/gi, (m, k) => {
    const x = v[VARS[k.toLowerCase()] ? k.toLowerCase() : k];
    return x == null ? '' : String(x);
  });
}
// escapa tudo, depois **negrito** e quebras (já escapado: não há como entrar HTML)
export function linhaHtml(t) { return esc(t).replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'); }
export const paragrafos = (t) => String(t || '').replace(/\r/g, '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
export const semNegrito = (t) => String(t || '').replace(/\*\*([^*\n][^*]*?)\*\*/g, '$1');

// texto do e-mail para um tipo: override publicado ou o de fábrica (por campo)
export function textoEmail(C, tipo) {
  const o = (C && C.emails && C.emails[tipo]) || {}, p = EMAILS_PADRAO[tipo] || {};
  const r = {};
  for (const k of ['assunto', 'pre', 'corpo']) r[k] = o[k] != null && String(o[k]).trim() !== '' ? o[k] : p[k];
  r.mudou = ['assunto', 'pre', 'corpo'].some((k) => o[k] != null && String(o[k]).trim() !== '' && o[k] !== p[k]);
  return r;
}

// campanhas publicadas (lista completa do editor) -> formato de _campanhas.js; sem publicação: as de fábrica
export function campanhasDe(C, base = CAMPANHAS) {
  const L = C && C.campanhas && Array.isArray(C.campanhas.itens) ? C.campanhas.itens : null;
  if (!L) return base;
  return L.filter((c) => c && c.ligado !== false).map((c) => ({
    id: c.id, ...(c.data ? { data: c.data } : { anual: c.anual }), publico: c.publico,
    assunto: String(c.assunto || ''), corpo: paragrafos(c.corpo), botao: c.botao || undefined, md: true,
  }));
}

// dados gerais (telefone, endereço, assinatura, WhatsApp, rodapé) aplicados num e-mail já montado
export function aplicarGerais(m, C) {
  const g = (C && C.gerais) || {}, P = GERAIS_PADRAO;
  if (!m || !Object.keys(g).length) return m;
  let { html, texto } = m;
  const troca = (de, para) => { if (para == null || String(para).trim() === '' || para === de) return; html = html.split(de).join(esc(para)); if (texto) texto = texto.split(de).join(para); };
  troca(P.telefone, g.telefone);
  troca(P.endereco, g.endereco);
  if (g.assinatura && g.assinatura.trim() && g.assinatura !== P.assinatura) { troca(P.assinatura, g.assinatura); troca('Equipe Studio Pulga', g.assinatura); }
  if (g.whatsapp && /^55\d{10,11}$/.test(g.whatsapp) && g.whatsapp !== P.whatsapp) { html = html.split('wa.me/' + P.whatsapp).join('wa.me/' + g.whatsapp); if (texto) texto = texto.split('wa.me/' + P.whatsapp).join('wa.me/' + g.whatsapp); }
  if (g.rodape_email && g.rodape_email.trim()) {
    const fim = '</td></tr>\n</table></td></tr></table></body></html>', i = html.lastIndexOf(fim);
    if (i >= 0) html = html.slice(0, i) + '<br>' + linhaHtml(g.rodape_email.trim()) + html.slice(i);
    if (texto) texto += '\n' + g.rodape_email.trim();
  }
  return { ...m, html, texto };
}
