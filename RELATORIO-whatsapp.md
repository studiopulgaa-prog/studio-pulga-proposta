# WhatsApp de atendimento e cobrança — relatório (26/11/2026)

## O que foi feito
- **Rota única** `api/wa.js` (limite de funções do Vercel), com rewrites:
  - `/api/whatsapp/webhook` — Meta: GET de verificação; POST com assinatura `X-Hub-Signature-256` conferida.
  - `/api/asaas/webhook` — Asaas, com o header `asaas-access-token`.
  - `/api/cron/regua` — cron diário do Vercel às 12:05 UTC (9:05 em Brasília), protegido pelo `CRON_SECRET`.
  - `/api/admin/wa` — painel, exige a sessão do admin.
- **Módulos**:
  - `_wa.js`: envio, modo simulação e templates.
  - `_atendimento.js`: identificação, menu, IA e handoff.
  - `_waia.js`: Claude Haiku, com limite mensal e fallback para o menu.
  - `_asaas.js`: só leitura.
  - `_regua.js`: régua de cobrança.
  - `_wadb.js`: banco.
  - `_watextos.js`: textos, templates e o manual da IA.
- **Banco**:
  - `db/2026-11-26_whatsapp.sql`: só adições, com tabelas `wa_*` e `onboarding_senhas`, e funções `wa_*` protegidas pelo `EMAIL_SECRET`.
  - Reversão em `db/2026-11-26_whatsapp_REVERSAO.sql`.
- **Admin**: aba nova "WhatsApp", com Conversas e alertas, Clientes e números, Cobrança, Senhas do onboarding e Ajustes (variáveis, modelos da Meta, manual da IA, feriados, números de alerta). Nada das abas antigas mudou além do botão no menu.

## Segurança
- Financeiro só para número **verificado** com perfil **responsável** (checado no código, não só no prompt).
- Verificação:
  - CNPJ, seguido de um código de 6 dígitos enviado ao **e-mail do responsável**.
  - O código não vai pelo WhatsApp e no banco só fica o hash.
  - A resposta é igual exista ou não o CNPJ.
  - 3 erros bloqueiam o número por 24h; no máximo 3 códigos por dia.
  - Revalidação a cada 90 dias, ou quando o e-mail do responsável muda.
- Número novo entra como **equipe**. A promoção a responsável é só no admin.
- A IA não escreve links: o servidor remove o que ela escrever e manda só os links do cadastro e do Asaas.
- Teto de gasto mensal da IA, no máximo 30 respostas de IA por hora por número e timeout de 15 s. Em qualquer falha, a conversa cai no menu.
- Idempotência:
  - mensagens e eventos repetidos são ignorados;
  - cada etapa da régua é única por cobrança;
  - no máximo 1 envio por cobrança por dia.

## Variáveis (Vercel → studio-pulga-proposta)
| Variável | Situação |
|---|---|
| WHATSAPP_TOKEN, ANTHROPIC_API_KEY, CRON_SECRET, EMAIL_SECRET, RESEND_API_KEY, EMAIL_RESUMO | já existem |
| WHATSAPP_PHONE_NUMBER_ID | criar (teste: ID do número de teste; depois o do chip novo) |
| WHATSAPP_WABA_ID | criar |
| WHATSAPP_APP_SECRET | criar (Meta → app → Configurações → Básico → Chave secreta) |
| WHATSAPP_VERIFY_TOKEN | criar (texto aleatório; o mesmo vai no cadastro do webhook na Meta) |
| TESTE_WHATSAPP | criar (número do Isaque, 55 + DDD + número) |
| ASAAS_API_KEY | criar (produção) |
| ASAAS_WEBHOOK_TOKEN | criar (texto aleatório; o mesmo vai no webhook do Asaas) |
| IA_ATIVA=true | ligar depois de colocar créditos na Anthropic |
| IA_LIMITE_MENSAL_USD | opcional (padrão 15) |
| WHATSAPP_ATIVO=true | só quando tudo estiver testado (libera o envio real) |

## Para ligar
1. Rodar `db/2026-11-26_whatsapp.sql` no Supabase (SQL editor).
2. Criar as variáveis acima e fazer redeploy.
3. Meta:
   - webhook `https://proposta.studiopulga.com.br/api/whatsapp/webhook` com o verify token;
   - assinar os campos `messages` e `smb_message_echoes`.
4. Asaas:
   - webhook `https://proposta.studiopulga.com.br/api/asaas/webhook` com o token e os eventos de cobrança;
   - **desligar as notificações de WhatsApp** do Asaas (manter as de e-mail).
5. Admin → WhatsApp → Ajustes:
   - "Criar modelos que faltam na Meta" e aguardar aprovação;
   - preencher os números de alerta.
6. Cadastrar os clientes (CNPJ, e-mail do responsável, ID do Asaas, vencimento, links) e os números.
7. Testar com o número de teste, depois trocar para o chip novo e ligar `WHATSAPP_ATIVO`.

## Fora desta entrega
- Disparo automático da proposta pelo WhatsApp: o modelo `proposta_studio` já está pronto, mas a ligação com a aba Nova fica para depois, para não mexer no fluxo aprovado.
