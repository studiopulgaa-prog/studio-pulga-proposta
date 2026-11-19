-- Reversao de 2026-11-19_sessoes_admin.sql: remove as 3 funcoes e a tabela admin_sessoes.
-- Depois disto, sessoes longas deixam de valer (o login volta a dar so 12h) e nada mais muda.
begin;
drop function if exists public.adm_sessao_nova(text, text, timestamptz);
drop function if exists public.adm_sessao_ok(text, text);
drop function if exists public.adm_sessao_revogar(text, text);
drop table if exists public.admin_sessoes;
commit;
