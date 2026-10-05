# Studio Pulga — Propostas

Sistema de propostas personalizadas da Studio Pulga (Praia Grande, SP).

## Arquitetura
- Site estático (HTML) + funções serverless em `/api`, publicado no Vercel. Todo push no `master` faz deploy automático.
- Banco: Supabase (tabelas `propostas` e `acessos`).
- `admin.html`: gera o link exclusivo da proposta (dados codificados em `?d=`).
- `proposta.html`: página que o cliente vê. `fecharPlano()` abre o WhatsApp e, se houver e-mail, dispara `/api/enviar-proposta`.

## E-mail
- `api/enviar-proposta.js` usa nodemailer com Brevo SMTP.
- Variáveis de ambiente no Vercel: `BREVO_USER`, `BREVO_PASS`, `BREVO_FROM`. NUNCA escrever senhas ou tokens no código.
- O envio só acontece se a proposta existe no Supabase e não expirou.

## Regras de trabalho
- Editar, conferir com `git diff` que só o necessário mudou, commitar em português no `master` e dar push. Informar o hash no final.
- Responder em português do Brasil, de forma direta e objetiva.
- Marca: terracota `#6E2C14` e creme `#F4EADD`.

## Segurança (obrigatório)
- O repositório pode ser público: NUNCA escrever senhas, tokens ou chaves no código. Tudo em variáveis do Vercel.
- Senha do painel: variável `ADMIN_PASSWORD` (Vercel). Sessão assinada com `ADMIN_TOKEN_SECRET`.
- Tabelas `propostas`, `links`, `acessos` têm RLS. O navegador só chama `proposta_status` e `link_url` (RPC) e insere em `acessos`.
- Ações do admin passam por `/api/admin` (exige sessão). O servidor usa RPCs com o segredo `EMAIL_SECRET`.
- Nunca usar `innerHTML` com dados vindos do link, do banco ou do usuário sem escapar.
