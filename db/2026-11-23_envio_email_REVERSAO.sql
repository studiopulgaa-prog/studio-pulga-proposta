-- Reversão de 2026-11-23_envio_email.sql (volta o adm_listar de 19/11 e remove o que foi adicionado)
begin;
create or replace function public.adm_listar(p_secret text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc), '[]'::jsonb) into r from (
    select p.id, p.cliente, p.v1, p.v2, p.v3, p.planos, p.validade, p.criado_em, p.link_hash, p.expira_em,
      p.tipo, p.email, p.atualizado_em, (p.snapshot is not null) as tem_snapshot,
      case when p.expira_em <= now() then 'expirada' else 'ativa' end as status,
      (select count(*) from public.acessos a where a.proposta_id = p.link_hash) as ac,
      (select count(distinct a.dispositivo_hash) from public.acessos a
        where a.proposta_id = p.link_hash and a.dispositivo_hash like 'd2\_%') as dv
    from public.propostas p where not p.oculta order by p.criado_em desc limit 50) x;
  return r;
end $$;
drop function if exists public.adm_email_reservar(text, uuid);
drop function if exists public.adm_email_resultado(text, uuid, boolean, text);
alter table public.propostas drop column if exists enviado_em, drop column if exists envio_erro, drop column if exists envio_tentativa_em;
commit;
