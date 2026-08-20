# Studio Pulga — Sistema de Propostas

**URL de Produção:** https://studio-pulga-proposta.vercel.app

## Como Funciona

Sistema de propostas personalizadas para clientes da Studio Pulga.

### Admin
- URL: `/admin.html`
- Senha: `Studio2801`
- Preenc he dados do cliente e gere um link único que expira após os dias configurados

### Proposta
- Link único recebido pelo cliente
- Timer regressivo mostrando quantos dias/horas/minutos faltam
- Se expirar: tela bloqueada com opção de solicitar nova proposta via WhatsApp
- Botões levam direto ao WhatsApp

## Como Editar

1. Clone o repositório
2. Edite os arquivos (admin.html, proposta.html, etc)
3. Faça commit: `git add . && git commit -m "sua mensagem" && git push`
4. Vercel detecta e faz deploy automaticamente em 2-3 minutos

## Chave de Edição Rápida

- **Mudar Senha:** Procure em admin.html: `var SENHA = 'Studio2801';`
- **Mudar WhatsApp:** Procure `5513996057099` em ambos arquivos
- **Mudar Valores Planos:** Procure em proposta.html: `v1: '2.490'`, `v2: '2.690'`, `v3: '2.990'`
- **Mudar Cores:** Creme `#F4EADD` e Marrom `#6E2C14`

