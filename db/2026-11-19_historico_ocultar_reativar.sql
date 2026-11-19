-- Histórico do admin: "Apagar do histórico" (oculta, sem apagar a linha) e "Reativar / estender validade".
-- NÃO APLICADO: aguarda "pode aplicar". Tudo numa transação.
begin;

-- 1) marca de oculta (nenhuma linha é apagada; as existentes ficam visíveis)
alter table public.propostas add column if not exists oculta boolean not null default false;

-- 2) "Apagar do histórico": oculta e expira o link (mesma regra de adm_encerrar)
create or replace function public.adm_ocultar(p_secret text, p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  update public.proposta_emails set status = 'fechada', atualizado_em = now()
   where status = 'ativa' and lh = (select link_hash from public.propostas where id = p_id);
  update public.propostas set oculta = true, expira_em = least(expira_em, now()) where id = p_id;
end $$;

-- 3) "Reativar / estender": volta a valer por p_dias (1 a 30) a partir de agora; também desoculta
create or replace function public.adm_reativar(p_secret text, p_id uuid, p_dias int) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_dias is null or p_dias < 1 or p_dias > 30 then raise exception 'dias invalidos'; end if;
  update public.propostas set expira_em = now() + (p_dias || ' days')::interval, oculta = false where id = p_id;
  if not found then raise exception 'proposta nao encontrada'; end if;
end $$;

-- 4) a lista não mostra as ocultas (resto idêntico ao adm_listar atual)
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

commit;
