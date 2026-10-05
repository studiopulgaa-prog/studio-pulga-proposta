# Studio Pulga — Sistema de Propostas

**Produção:** https://proposta.studiopulga.com.br

## Como funciona
- `admin.html`: painel para gerar a proposta. A senha **não fica no código**: ela é conferida no servidor
  (`/api/admin-login`) contra a variável `ADMIN_PASSWORD` do Vercel. Para trocar a senha, altere essa variável no Vercel.
- `proposta.html`: página que o cliente vê. O link só abre se existir no banco e não tiver sido alterado (assinatura `d_hash`).
- `p.html`: link curto `/p/slug`.
- `/api/*`: funções do servidor (admin, e-mails, lembretes).

## Segurança
- Tabelas do Supabase protegidas por RLS; o navegador só usa funções públicas seguras (`proposta_status`, `link_url`).
- O servidor acessa o banco com segredo (`EMAIL_SECRET`), nunca exposto no navegador.
- Nunca coloque senhas, tokens ou chaves no código. Use variáveis de ambiente no Vercel.
