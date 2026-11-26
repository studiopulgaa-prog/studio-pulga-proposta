// api/_asaas.js — leitura de cobranças no Asaas. Não é uma rota. A chave vem SOMENTE de ASAAS_API_KEY (Vercel).
// Só LEITURA: este sistema não cria, altera nem cancela cobranças no Asaas.
const BASE = process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3';
export const asaasConfigurado = () => !!process.env.ASAAS_API_KEY;

async function api(caminho) {
  if (!asaasConfigurado()) return { ok: false, erro: 'falta ASAAS_API_KEY' };
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(BASE + caminho, { signal: ctrl.signal, headers: { access_token: process.env.ASAAS_API_KEY, 'User-Agent': 'studio-pulga-atendimento', 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, erro: (j && j.errors && j.errors[0] && j.errors[0].description) || 'HTTP ' + r.status };
    return { ok: true, dados: j };
  } catch (e) { return { ok: false, erro: e && e.name === 'AbortError' ? 'tempo esgotado' : 'rede' }; } finally { clearTimeout(t); }
}

export async function clientePorCnpj(cnpj) {
  const r = await api('/customers?cpfCnpj=' + encodeURIComponent(String(cnpj).replace(/\D/g, '')) + '&limit=10');
  if (!r.ok) return r;
  return { ok: true, lista: (r.dados.data || []).filter((c) => !c.deleted).map((c) => ({ id: c.id, nome: c.name, email: c.email })) };
}

const resumo = (p) => ({ id: p.id, cliente: p.customer, valor: p.value, vencimento: p.dueDate, status: p.status, link: p.invoiceUrl, boleto: p.bankSlipUrl, descricao: p.description, pago_em: p.paymentDate || p.clientPaymentDate || null });

export async function pagamento(id) {
  const r = await api('/payments/' + encodeURIComponent(id));
  return r.ok ? { ok: true, p: resumo(r.dados), bruto: r.dados } : r;
}

// cobranças em aberto (pendentes + vencidas) de um cliente do Asaas
export async function abertosDoCliente(customerId) {
  const out = [];
  for (const st of ['OVERDUE', 'PENDING']) {
    const r = await api(`/payments?customer=${encodeURIComponent(customerId)}&status=${st}&limit=20`);
    if (!r.ok) return r;
    (r.dados.data || []).filter((p) => !p.deleted).forEach((p) => out.push(resumo(p)));
  }
  out.sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
  return { ok: true, lista: out };
}

// todas as cobranças em aberto com vencimento entre duas datas (YYYY-MM-DD), paginando
export async function abertosEntre(de, ate) {
  const out = [];
  for (const st of ['PENDING', 'OVERDUE']) {
    for (let off = 0; off < 2000; off += 100) {
      const r = await api(`/payments?status=${st}&dueDate%5Bge%5D=${de}&dueDate%5Ble%5D=${ate}&limit=100&offset=${off}`);
      if (!r.ok) return r;
      (r.dados.data || []).filter((p) => !p.deleted).forEach((p) => out.push(resumo(p)));
      if (!r.dados.hasMore) break;
    }
  }
  return { ok: true, lista: out };
}

export async function pixCopiaCola(id) {
  const r = await api('/payments/' + encodeURIComponent(id) + '/pixQrCode');
  return r.ok && r.dados && r.dados.payload ? r.dados.payload : null;
}
export async function linhaDigitavel(id) {
  const r = await api('/payments/' + encodeURIComponent(id) + '/identificationField');
  return r.ok && r.dados && r.dados.identificationField ? r.dados.identificationField : null;
}
export async function notaFiscal(paymentId) {
  const r = await api('/invoices?payment=' + encodeURIComponent(paymentId) + '&limit=5');
  if (!r.ok) return null;
  const n = (r.dados.data || []).find((i) => i.status === 'AUTHORIZED' && i.pdfUrl);
  return n ? n.pdfUrl : null;
}
export async function ultimosPagos(customerId, n = 3) {
  const r = await api(`/payments?customer=${encodeURIComponent(customerId)}&status=RECEIVED&limit=${n}`);
  const r2 = await api(`/payments?customer=${encodeURIComponent(customerId)}&status=CONFIRMED&limit=${n}`);
  const L = [].concat(r.ok ? r.dados.data || [] : [], r2.ok ? r2.dados.data || [] : []).map(resumo);
  L.sort((a, b) => String(b.vencimento).localeCompare(String(a.vencimento)));
  return L.slice(0, n);
}

export const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dataBR = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '')); return m ? `${m[3]}/${m[2]}` : String(ymd || ''); };

// recebidos (RECEIVED/CONFIRMED) com data de pagamento entre duas datas (YYYY-MM-DD). Confere a data no código também.
export async function recebidosEntre(de, ate) {
  const out = [];
  for (const st of ['RECEIVED', 'CONFIRMED']) {
    for (let off = 0; off < 2000; off += 100) {
      const r = await api(`/payments?status=${st}&paymentDate%5Bge%5D=${de}&paymentDate%5Ble%5D=${ate}&limit=100&offset=${off}`);
      if (!r.ok) return r;
      (r.dados.data || []).filter((p) => !p.deleted).forEach((p) => {
        const d = String(p.paymentDate || p.confirmedDate || p.clientPaymentDate || '').slice(0, 10);
        if (d && d >= de && d <= ate) out.push({ ...resumo(p), pago_em: d });
      });
      if (!r.dados.hasMore) break;
    }
  }
  return { ok: true, lista: out };
}
