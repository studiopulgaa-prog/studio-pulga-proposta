# Pagamento: plano de integração (só documento, nada implementado)

**Estado atual:** o cliente escolhe o pacote e clica em "Quero este pacote". Abre uma tela de confirmação (resumo, totais, forma de pagamento de preferência, nome, e-mail e telefone) e o botão "Enviar pedido" abre o WhatsApp (5513996057099) com tudo preenchido. Hoje o fechamento passa por uma confirmação enviada pelo WhatsApp. Nada cobra, nenhuma chave está no código e o site não coleta dados de cartão.

**Ponto de troca no código:** toda a saída do pedido passa por uma única função, `finalizarPedido(d, t)` em `proposta.html`. Para ligar um pagamento, basta trocar o que ela faz (em vez de abrir o WhatsApp, chamar `/api/criar-cobranca` e abrir o link devolvido). O restante da página não muda.

## Regras comuns aos dois provedores

- A página manda ao servidor só o necessário (nome, e-mail, telefone, itens, aba, forma preferida, datas de stories do Milão). **Nunca** manda valores como verdade.
- Função de servidor `/api/criar-cobranca` (Vercel): confere no Supabase se a proposta existe e não expirou (como já faz o envio de e-mail), **recalcula os totais no servidor** e só então chama o provedor.
- Chaves só em variáveis de ambiente do Vercel. Nenhuma chave no código do navegador, no repositório ou no chat.
- Dados de cartão são digitados sempre na tela do provedor, nunca no nosso site.
- Os dois provedores ficam atrás de uma interface única (`criarCobranca(pedido) → { url, id }`), em arquivos separados (`api/_pagamento/asaas.js`, `api/_pagamento/infinitepay.js`). Escolha por variável `PAGAMENTO_PROVEDOR` (`asaas` ou `infinitepay`), sem mexer na página.

## Provedor A: Asaas

Serve para tudo: assinatura recorrente no cartão, Pix, boleto e cartão parcelado.

- **Recorrente (Planos e aba Recorrente):** cria assinatura (`/subscriptions`) no cartão, Pix ou boleto, com a parcela mensal. Milão pode ter data final.
- **Único / parcelado:** cria cobrança (`/payments`) com `installmentCount` e `installmentValue` (parcelamento no cartão, Pix ou boleto).
- Devolve `invoiceUrl`; a página abre a tela de pagamento do Asaas.
- **Confirmação:** webhook `/api/asaas-webhook`, conferindo o token (`ASAAS_WEBHOOK_TOKEN`). Marca como pago e avisa a equipe.
- Variáveis: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`.

## Provedor B: InfinitePay

Serve para pagamento **único** ou parcelado. **Não tem recorrência**: a mensalidade não pode ser assinatura automática por ele.

- **Link de pagamento** (valor único ou parcelado) ou **API de checkout** com até 12 parcelas.
- Para o plano mensal, cada mês seria um novo link/cobrança (manual ou agendada por nós), não uma assinatura.
- **Confirmação:** o webhook **não é assinado**, então não dá para confiar nele sozinho. A função recebe o aviso e **confirma consultando o próprio provedor** (`/payment_check`) antes de marcar como pago.
- Variáveis: credenciais da conta InfinitePay (nome/tag da conta e, se usarmos a API, a chave) em variáveis do Vercel.

## O que eu preciso de você (Isaque)

1. **Escolher o provedor** (ou os dois: Asaas para recorrência, InfinitePay para pagamento único).
2. **Asaas:** conta e **chave de API sandbox** (para testar sem cobrar), colocada em `ASAAS_API_KEY` no Vercel (ambiente Preview). Definir um texto secreto para `ASAAS_WEBHOOK_TOKEN` e cadastrar a URL do webhook no painel do Asaas.
3. **InfinitePay:** conta ativa, a "tag" da conta (InfiniteTag) e a chave/credencial da API, se usarmos checkout por API. Cadastrar a URL do webhook no painel.
4. **Não mandar nenhuma chave no chat.** Você coloca direto no Vercel; eu te digo o nome exato da variável.
5. **Autorizar criar a função em `api/`** deste repositório (branch `cardapio`).
6. **Autorizar criar uma tabela no Supabase** para registrar cobranças e status (id da proposta, id do provedor, valor, forma, status). Sem tabela, o status fica só no provedor. Eu pergunto antes de criar.
7. **Decisões de negócio:** formas permitidas em cada tipo (avulso, plano, Milão); desconto no Pix (sim/não); regras de parcelamento no cartão; o que acontece com a assinatura do Milão se o cliente desistir antes de abril; e para onde vai o aviso de pagamento confirmado (e-mail ou WhatsApp).

Antes de criar qualquer tabela ou função, eu pergunto.
