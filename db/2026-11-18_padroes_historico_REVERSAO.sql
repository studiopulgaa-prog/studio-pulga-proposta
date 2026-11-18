-- REVERSÃO da migração 2026-11-18_padroes_historico.sql (uma transação).
-- Remove as funções novas, a tabela "padroes" e as 4 colunas novas de "propostas",
-- e restaura adm_criar e adm_listar às versões que estavam em produção.
-- (Os dados das 27 propostas originais não são afetados; backup em propostas_backup_2026-11-18.sql.)
begin;

drop function if exists public.adm_importar(text, jsonb, jsonb, boolean);
drop function if exists public.adm_padrao_set(text, text, jsonb);
drop function if exists public.adm_padroes_get(text);
drop function if exists public.adm_prop_get(text, uuid);

create or replace function public.adm_criar(p_secret text, p jsonb)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  insert into public.propostas(cliente, v1, v2, v3, planos, validade, link_hash, expira_em, d_hash)
  values (left(p->>'cliente', 120), left(p->>'v1', 20), left(p->>'v2', 20), left(p->>'v3', 20),
          p->'planos', (p->>'validade')::int, left(p->>'link_hash', 64),
          (p->>'expira_em')::timestamptz, left(p->>'d_hash', 64))
  returning id into v_id;
  return v_id;
end $function$;

create or replace function public.adm_listar(p_secret text)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc), '[]'::jsonb) into r from (
    select p.id, p.cliente, p.v1, p.v2, p.v3, p.planos, p.validade, p.criado_em, p.link_hash, p.expira_em,
      (select count(*) from public.acessos a where a.proposta_id = p.link_hash) as ac,
      (select count(distinct a.dispositivo_hash) from public.acessos a
        where a.proposta_id = p.link_hash and a.dispositivo_hash like 'd2\_%') as dv
    from public.propostas p order by p.criado_em desc limit 50) x;
  return r;
end $function$;

drop table if exists public.padroes;
alter table public.propostas
  drop column if exists tipo,
  drop column if exists email,
  drop column if exists snapshot,
  drop column if exists atualizado_em;

commit;
