-- Studio Pulga: "Manter conectado (30 dias)" do admin, com sessao revogavel (19/11/2026)
-- Só ACRESCENTA: 1 tabela nova (admin_sessoes, RLS ligado e sem policy) e 3 funcoes novas.
-- Nao altera propostas, links, acessos, padroes nem nenhuma funcao existente. Tudo em uma transacao.
begin;

create table public.admin_sessoes (
  jti text primary key check (jti ~ '^[0-9a-f]{32}$'),
  criada_em timestamptz not null default now(),
  expira_em timestamptz not null,
  revogada_em timestamptz
);
alter table public.admin_sessoes enable row level security;
revoke all on public.admin_sessoes from anon, authenticated;

-- registra uma sessao nova (e apaga as vencidas ha mais de 1 dia)
create or replace function public.adm_sessao_nova(p_secret text, p_jti text, p_exp timestamptz)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_exp > now() + interval '31 days' or p_exp <= now() then raise exception 'prazo invalido'; end if;
  delete from public.admin_sessoes where expira_em < now() - interval '1 day';
  insert into public.admin_sessoes(jti, expira_em) values (p_jti, p_exp);
end $function$;

-- a sessao vale? (existe, nao foi revogada e nao venceu)
create or replace function public.adm_sessao_ok(p_secret text, p_jti text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  return exists (select 1 from public.admin_sessoes s where s.jti = p_jti and s.revogada_em is null and s.expira_em > now());
end $function$;

-- "Sair": revoga a sessao deste aparelho
create or replace function public.adm_sessao_revogar(p_secret text, p_jti text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  update public.admin_sessoes set revogada_em = now() where jti = p_jti and revogada_em is null;
end $function$;

revoke all on function public.adm_sessao_nova(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.adm_sessao_ok(text, text) from public, anon, authenticated;
revoke all on function public.adm_sessao_revogar(text, text) from public, anon, authenticated;
grant execute on function public.adm_sessao_nova(text, text, timestamptz) to anon;
grant execute on function public.adm_sessao_ok(text, text) to anon;
grant execute on function public.adm_sessao_revogar(text, text) to anon;
-- (o servidor chama com a chave anon + segredo EMAIL_SECRET, igual as outras adm_*; sem o segredo a funcao recusa)

commit;
