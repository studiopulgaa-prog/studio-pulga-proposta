# Pagamento (Asaas): plano de integração

**Estado atual:** só existe o bloco visual "Forma de pagamento" no resumo "Seu pacote" da proposta (cartão recorrente, Pix, boleto, cartão parcelado à vista). Está **desativado**. Nada cobra, nenhuma chave está no código e o site não coleta dados de cartão.

## Como seria a integração

1. **Cliente escolhe o pacote** na proposta e a forma de pagamento. A página manda só o necessário (nome, itens, totais, modo Avulsos/Recorrente, mês de entrada do Milão, datas de stories) para uma função de servidor.
2. **Função de servidor** (`/api/criar-cobranca`, Vercel) valida a proposta no Supabase (existe e não expirou, como já faz o envio de e-mail) e **recalcula os valores no servidor** (nunca confia no total vindo do navegador). Depois chama a API do Asaas com a chave guardada em variável de ambiente do Vercel (`ASAAS_API_KEY`):
   - cria (ou reaproveita) o cliente no Asaas;
   - **Cartão recorrente / Pix recorrente / boleto mensal:** cria uma assinatura (`/subscriptions`) com a parcela do mês e a data final (Milão: até o mês final);
   - **Cartão parcelado à vista / pagamento único:** cria uma cobrança (`/payments`) com `installmentCount` e `installmentValue`;
   - **Stories nos outros dias do Milão:** cobrança única separada.
3. **Redirecionamento:** a função devolve o link de pagamento (`invoiceUrl`) e a página abre a tela de pagamento **do próprio Asaas**. Os dados do cartão são digitados lá, nunca no nosso site.
4. **Webhook de confirmação** (`/api/asaas-webhook`): o Asaas avisa quando o pagamento é confirmado. A função confere o token do webhook (`ASAAS_WEBHOOK_TOKEN`), marca a proposta como paga e avisa a equipe (e-mail ou WhatsApp).
5. **Segurança:** chave só no servidor; a função usa as RPCs com segredo já existentes; resposta ao navegador sem dados sensíveis; nada de `innerHTML` com dados do usuário.

## Precisa de mim (Isaque)

- **Chave de API sandbox do Asaas** (para testar sem cobrar de verdade). Colocar em `ASAAS_API_KEY` nas variáveis do Vercel, só no ambiente Preview. **Não mandar a chave no chat.**
- **Token do webhook** (você define um texto secreto) em `ASAAS_WEBHOOK_TOKEN`, e cadastrar a URL do webhook no painel do Asaas.
- **Onde criar a função:** sugestão, na pasta `api/` deste mesmo repositório (branch `cardapio`), junto das funções atuais. Se preferir outro lugar, me diga.
- **Se pode criar tabela no Supabase** para registrar cobranças e status (id da proposta, id Asaas, valor, forma, status). Sem tabela, o status só ficaria no Asaas.
- Decisões de negócio: quais formas valem para cada tipo (avulso, plano, Milão), se há desconto no Pix, número máximo de parcelas no cartão, e o que acontece com a assinatura do Milão se o cliente sair antes de abril.

Antes de criar qualquer tabela ou função, eu pergunto.
