-- Reversão do Studio OS (26/11/2026). Apaga só o que db/2026-11-26_studio_os.sql criou.
-- ATENÇÃO: apaga as inscrições de push e as anotações de clientes feitas depois disso.
begin;
drop function if exists public.adm_em_conversa(text, uuid, boolean);
drop function if exists public.adm_funil(text);
drop function if exists public.login_falhas_min(text, text, int);
create or replace function public._wa_tabela_ok(t text) returns boolean language sql immutable as $$
  select t = any (array['wa_clientes','wa_contatos','wa_codigos','wa_conversas','wa_mensagens','wa_regua_envios','wa_config','wa_alertas','wa_uso_ia','wa_eventos','onboarding_senhas']);
$$;
revoke all on function public._wa_tabela_ok(text) from public, anon, authenticated;
drop table if exists public.wa_push;
drop table if exists public.wa_notas;
drop index if exists public.wa_conversas_upd_idx;
alter table public.wa_conversas drop column if exists atendente;
alter table public.wa_conversas drop column if exists lida_em;
alter table public.wa_conversas drop column if exists resolvida_em;
alter table public.wa_mensagens drop column if exists autor;
alter table public.wa_mensagens drop column if exists interno;
alter table public.propostas drop column if exists em_conversa_em;
alter table public.wa_clientes drop column if exists plano;
commit;
