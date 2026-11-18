-- Studio Pulga: Padrões e Histórico do admin no Supabase (18/11/2026)
-- Só ACRESCENTA: tabela nova "padroes", 4 colunas novas em "propostas", 3 funções novas
-- e substitui adm_criar / adm_listar mantendo a MESMA assinatura (chamadas antigas continuam valendo).
-- Tudo em uma transação. Não toca em eq_*, portal, onboarding.
begin;

-- 1) padrões por área (RLS ligado, sem nenhuma policy = anon e authenticated bloqueados)
create table public.padroes (
  chave text primary key check (chave in ('planos_arquiteto','planos_loja','cardapio')),
  dados jsonb not null check (octet_length(dados::text) <= 200000),
  atualizado_em timestamptz not null default now()
);
alter table public.padroes enable row level security;
revoke all on public.padroes from anon, authenticated;

-- 2) colunas novas em propostas (as existentes não mudam)
alter table public.propostas
  add column tipo text not null default 'planos' check (tipo in ('planos','cardapio')),
  add column email text,
  add column snapshot jsonb check (snapshot is null or octet_length(snapshot::text) <= 200000),
  add column atualizado_em timestamptz not null default now();
-- propostas antigas de Cardápio foram gravadas com os 3 planos desligados
update public.propostas set tipo = 'cardapio' where planos = '[false, false, false]'::jsonb;

-- 3) adm_criar: mesma assinatura (p_secret text, p jsonb); campos novos OPCIONAIS dentro de p
create or replace function public.adm_criar(p_secret text, p jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_tipo text; v_snap jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  v_tipo := case
    when p->>'tipo' in ('planos','cardapio') then p->>'tipo'
    when p->'planos' = '[false, false, false]'::jsonb then 'cardapio'
    else 'planos' end;
  v_snap := case when jsonb_typeof(p->'snapshot') = 'object' and octet_length((p->'snapshot')::text) <= 200000
                 then p->'snapshot' else null end;
  insert into public.propostas(cliente, v1, v2, v3, planos, validade, link_hash, expira_em, d_hash, tipo, email, snapshot)
  values (left(p->>'cliente', 120), left(p->>'v1', 20), left(p->>'v2', 20), left(p->>'v3', 20),
          p->'planos', (p->>'validade')::int, left(p->>'link_hash', 64),
          (p->>'expira_em')::timestamptz, left(p->>'d_hash', 64), v_tipo, left(p->>'email', 200), v_snap)
  returning id into v_id;
  return v_id;
end $function$;

-- 4) adm_listar: mesma assinatura (p_secret text); só acrescenta campos (sem o snapshot, que é pesado)
create or replace function public.adm_listar(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
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
    from public.propostas p order by p.criado_em desc limit 50) x;
  return r;
end $function$;

-- 5) funções novas (todas conferem o segredo antes de qualquer coisa)
create or replace function public.adm_prop_get(p_secret text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select jsonb_build_object('id', p.id, 'tipo', p.tipo, 'email', p.email, 'snapshot', p.snapshot) into r
    from public.propostas p where p.id = p_id;
  return r;
end $function$;

create or replace function public.adm_padroes_get(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select coalesce(jsonb_object_agg(chave, jsonb_build_object('dados', dados, 'atualizado_em', atualizado_em)), '{}'::jsonb)
    into r from public.padroes;
  return r;
end $function$;

create or replace function public.adm_padrao_set(p_secret text, p_chave text, p_dados jsonb)
returns timestamptz language plpgsql security definer set search_path to 'public' as $function$
declare t timestamptz;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_chave not in ('planos_arquiteto','planos_loja','cardapio') or p_dados is null then raise exception 'dados invalidos'; end if;
  insert into public.padroes(chave, dados, atualizado_em) values (p_chave, p_dados, now())
  on conflict (chave) do update set dados = excluded.dados, atualizado_em = now()
  returning atualizado_em into t;
  return t;
end $function$;

-- importação do navegador: padrões só sobrescrevem se p_sobrescrever = true; cópias só preenchem snapshot vazio (repetível)
create or replace function public.adm_importar(p_secret text, p_padroes jsonb, p_hist jsonb, p_sobrescrever boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare k text; e jsonb; n_pad int := 0; n_ok int := 0; n_ign int := 0; v_id uuid; v_n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if jsonb_typeof(p_padroes) = 'object' then
    foreach k in array array['planos_arquiteto','planos_loja','cardapio'] loop
      if p_padroes ? k and jsonb_typeof(p_padroes->k) in ('object','array') then
        if p_sobrescrever then
          insert into public.padroes(chave, dados) values (k, p_padroes->k)
            on conflict (chave) do update set dados = excluded.dados, atualizado_em = now();
          n_pad := n_pad + 1;
        else
          insert into public.padroes(chave, dados) values (k, p_padroes->k) on conflict (chave) do nothing;
          get diagnostics v_n = row_count; n_pad := n_pad + v_n;
        end if;
      end if;
    end loop;
  end if;
  if jsonb_typeof(p_hist) = 'array' then
    for e in select * from jsonb_array_elements(p_hist) loop
      if (e->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and jsonb_typeof(e->'snapshot') = 'object' and octet_length((e->'snapshot')::text) <= 200000 then
        v_id := (e->>'id')::uuid;
        update public.propostas
           set snapshot = e->'snapshot',
               tipo = case when e->>'tipo' in ('planos','cardapio') then e->>'tipo' else tipo end,
               atualizado_em = now()
         where id = v_id and snapshot is null;
        get diagnostics v_n = row_count;
        if v_n > 0 then n_ok := n_ok + 1; else n_ign := n_ign + 1; end if;
      else n_ign := n_ign + 1; end if;
    end loop;
  end if;
  return jsonb_build_object('padroes', n_pad, 'historico', n_ok, 'ignorados', n_ign);
end $function$;

commit;
