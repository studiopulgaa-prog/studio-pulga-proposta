-- WhatsApp de atendimento e cobrança (26/11/2026)
-- Só ADIÇÕES: tabelas novas com prefixo wa_ (+ onboarding_senhas) e funções novas wa_*.
-- Nenhuma tabela ou função existente é alterada. RLS ligado e acesso só pelo servidor (chave anon + segredo EMAIL_SECRET),
-- no mesmo padrão das funções adm_* (public._email_ok).
-- Reversão: db/2026-11-26_whatsapp_REVERSAO.sql
begin;

create table if not exists public.wa_clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nome_contato text,
  cnpj text not null unique check (cnpj ~ '^[0-9]{14}$'),
  email_responsavel text,
  asaas_customer_id text,
  vencimento_dia int check (vencimento_dia is null or vencimento_dia in (10, 20)),
  clausula_atraso text,
  pausa_automatica boolean not null default true,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'encerrado')),
  pausado_por_regua boolean not null default false,
  manual_gravacao_url text,
  drive_url text,
  onboarding_url text,
  onboarding_senha_id uuid,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wa_contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.wa_clientes(id) on delete cascade,
  telefone text not null unique check (telefone ~ '^[0-9]{10,15}$'),
  nome text,
  perfil text not null default 'equipe' check (perfil in ('responsavel', 'equipe')),
  verificado_em timestamptz,
  tentativas_codigo int not null default 0,
  bloqueado_ate timestamptz,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.wa_codigos (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  cliente_id uuid not null,
  codigo_hash text not null,
  expira_em timestamptz not null,
  usado_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wa_codigos_tel_idx on public.wa_codigos (telefone, created_at desc);

create table if not exists public.wa_conversas (
  id uuid primary key default gen_random_uuid(),
  telefone text not null unique,
  cliente_id uuid,
  nome_wa text,
  modo text not null default 'ia' check (modo in ('ia', 'humano', 'menu')),
  humano_desde timestamptz,
  humano_ate timestamptz,
  ultima_msg_cliente_em timestamptz,
  ultima_msg_em timestamptz,
  menu_dia text,
  estado_fluxo jsonb not null default '{}'::jsonb,
  nao_lidas int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wa_conversas_ult_idx on public.wa_conversas (ultima_msg_em desc);

create table if not exists public.wa_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid,
  telefone text not null,
  direcao text not null check (direcao in ('in', 'out')),
  origem text not null check (origem in ('cliente', 'ia', 'menu', 'equipe_admin', 'equipe_app', 'regua', 'sistema', 'proposta')),
  tipo text not null default 'text',
  conteudo jsonb not null default '{}'::jsonb,
  wa_message_id text unique,
  status text,
  simulado boolean not null default false,
  erro text,
  custo_ia_usd numeric(12, 6),
  created_at timestamptz not null default now()
);
create index if not exists wa_mensagens_conv_idx on public.wa_mensagens (conversa_id, created_at desc);
create index if not exists wa_mensagens_tel_idx on public.wa_mensagens (telefone, created_at desc);

create table if not exists public.wa_regua_envios (
  id uuid primary key default gen_random_uuid(),
  asaas_payment_id text not null,
  cliente_id uuid,
  etapa text not null check (etapa in ('D-3', 'D0', 'D+2', 'D+5', 'D+6_pausa', 'D+10_humano', 'D+60_alerta', 'pago', 'pular')),
  enviado_em timestamptz not null default now(),
  simulado boolean not null default false,
  detalhe text,
  unique (asaas_payment_id, etapa)
);

create table if not exists public.wa_config (
  chave text primary key,
  valor jsonb not null,
  versao int not null default 1,
  historico jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.wa_alertas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('handoff', 'bloqueio', 'ia_falhou', 'limite_ia', 'pausa', 'd10', 'd60', 'novo_numero', 'asaas_vinculo', 'erro_envio')),
  cliente_id uuid,
  conversa_id uuid,
  resumo text,
  resolvido_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wa_alertas_aberto_idx on public.wa_alertas (resolvido_em, created_at desc);

create table if not exists public.wa_uso_ia (
  mes text primary key,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  custo_usd numeric(12, 6) not null default 0,
  chamadas int not null default 0
);

create table if not exists public.wa_eventos (
  id text primary key,          -- idempotência de webhooks (Meta / Asaas)
  origem text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.onboarding_senhas (
  id uuid primary key default gen_random_uuid(),
  nicho text not null,
  senha text not null,
  url_formulario text,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['wa_clientes','wa_contatos','wa_codigos','wa_conversas','wa_mensagens','wa_regua_envios','wa_config','wa_alertas','wa_uso_ia','wa_eventos','onboarding_senhas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ===== funções genéricas (só tabelas da lista; colunas e filtros sempre com %I / %L) =====
create or replace function public._wa_tabela_ok(t text) returns boolean language sql immutable as $$
  select t = any (array['wa_clientes','wa_contatos','wa_codigos','wa_conversas','wa_mensagens','wa_regua_envios','wa_config','wa_alertas','wa_uso_ia','wa_eventos','onboarding_senhas']);
$$;

-- filtro: {"coluna": valor} = igualdade; {"coluna>=": v}, ">", "<", "<=", "!=" ; valor null = IS NULL; {"coluna!=": null} = IS NOT NULL;
-- {"coluna~*": "texto"} = contém (sem diferenciar maiúsculas)
create or replace function public._wa_where(p_filtro jsonb) returns text language plpgsql immutable as $$
declare k text; v jsonb; col text; op text; partes text[] := array[]::text[]; m text[];
begin
  if p_filtro is null or p_filtro = '{}'::jsonb then return 'true'; end if;
  for k, v in select * from jsonb_each(p_filtro) loop
    m := regexp_match(k, '^([a-z_][a-z0-9_]{0,40})(>=|<=|!=|>|<|~\*)?$');
    if m is null then raise exception 'filtro invalido: %', k; end if;
    col := m[1]; op := coalesce(m[2], '=');
    if jsonb_typeof(v) = 'null' then
      partes := partes || format('%I is %s null', col, case when op = '!=' then 'not' else '' end);
    elsif op = '~*' then
      partes := partes || format('%I::text ilike %L', col, '%' || replace(replace(v #>> '{}', '%', ''), '_', '') || '%');
    else
      partes := partes || format('%I %s %L', col, op, v #>> '{}');
    end if;
  end loop;
  return array_to_string(partes, ' and ');
end $$;

create or replace function public.wa_get(p_secret text, p_tabela text, p_filtro jsonb default '{}'::jsonb, p_ordem text default null, p_limite int default 100)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb; ordem text := '';
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if not public._wa_tabela_ok(p_tabela) then raise exception 'tabela'; end if;
  if p_ordem is not null then
    if p_ordem !~ '^[a-z_][a-z0-9_]{0,40}( (asc|desc))?$' then raise exception 'ordem'; end if;
    ordem := ' order by ' || split_part(p_ordem, ' ', 1)::text || ' ' || coalesce(nullif(split_part(p_ordem, ' ', 2), ''), 'asc');
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (select * from public.%I where %s %s limit %s) x',
    p_tabela, public._wa_where(p_filtro), ordem, least(greatest(coalesce(p_limite, 100), 1), 1000)) into r;
  return r;
end $$;

create or replace function public.wa_contar(p_secret text, p_tabela text, p_filtro jsonb default '{}'::jsonb)
returns int language plpgsql stable security definer set search_path to 'public' as $$
declare n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if not public._wa_tabela_ok(p_tabela) then raise exception 'tabela'; end if;
  execute format('select count(*) from public.%I where %s', p_tabela, public._wa_where(p_filtro)) into n;
  return n;
end $$;

-- insere (colunas = chaves do json; as que faltam usam o padrão da tabela). p_ignorar = on conflict do nothing (devolve null)
create or replace function public.wa_ins(p_secret text, p_tabela text, p_linha jsonb, p_ignorar boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare cols text; r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if not public._wa_tabela_ok(p_tabela) then raise exception 'tabela'; end if;
  select string_agg(format('%I', k), ',') into cols from jsonb_object_keys(p_linha) k;
  if cols is null then raise exception 'linha vazia'; end if;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) %s returning to_jsonb(%I.*)',
    p_tabela, cols, cols, p_tabela, case when p_ignorar then 'on conflict do nothing' else '' end, p_tabela) using p_linha into r;
  return r;
end $$;

create or replace function public.wa_upd(p_secret text, p_tabela text, p_filtro jsonb, p_set jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare cols text; r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if not public._wa_tabela_ok(p_tabela) then raise exception 'tabela'; end if;
  if p_filtro is null or p_filtro = '{}'::jsonb then raise exception 'filtro obrigatorio'; end if;
  select string_agg(format('%I', k), ',') into cols from jsonb_object_keys(p_set) k;
  if cols is null then raise exception 'set vazio'; end if;
  execute format('with u as (update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where %s returning *) select coalesce(jsonb_agg(to_jsonb(u)), ''[]''::jsonb) from u',
    p_tabela, cols, cols, p_tabela, public._wa_where(p_filtro)) using p_set into r;
  return r;
end $$;

create or replace function public.wa_del(p_secret text, p_tabela text, p_filtro jsonb)
returns int language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_tabela not in ('onboarding_senhas', 'wa_contatos', 'wa_codigos') then raise exception 'tabela'; end if;
  if p_filtro is null or p_filtro = '{}'::jsonb then raise exception 'filtro obrigatorio'; end if;
  execute format('delete from public.%I where %s', p_tabela, public._wa_where(p_filtro));
  get diagnostics n = row_count;
  return n;
end $$;

-- soma o uso da IA no mês (atômico)
create or replace function public.wa_uso_somar(p_secret text, p_mes text, p_in bigint, p_out bigint, p_custo numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  insert into public.wa_uso_ia (mes, tokens_in, tokens_out, custo_usd, chamadas) values (p_mes, p_in, p_out, p_custo, 1)
  on conflict (mes) do update set tokens_in = wa_uso_ia.tokens_in + excluded.tokens_in, tokens_out = wa_uso_ia.tokens_out + excluded.tokens_out,
    custo_usd = wa_uso_ia.custo_usd + excluded.custo_usd, chamadas = wa_uso_ia.chamadas + 1
  returning to_jsonb(wa_uso_ia.*) into r;
  return r;
end $$;

-- soma não lidas sem corrida
create or replace function public.wa_conversa_toque(p_secret text, p_id uuid, p_cliente boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  update public.wa_conversas set ultima_msg_em = now(), updated_at = now(),
    ultima_msg_cliente_em = case when p_cliente then now() else ultima_msg_cliente_em end,
    nao_lidas = case when p_cliente then nao_lidas + 1 else nao_lidas end
  where id = p_id;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'wa_get(text,text,jsonb,text,int)', 'wa_contar(text,text,jsonb)', 'wa_ins(text,text,jsonb,boolean)', 'wa_upd(text,text,jsonb,jsonb)',
    'wa_del(text,text,jsonb)', 'wa_uso_somar(text,text,bigint,bigint,numeric)', 'wa_conversa_toque(text,uuid,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to anon', f);   -- o servidor chama com a anon + EMAIL_SECRET; sem o segredo, recusa
  end loop;
  execute 'revoke all on function public._wa_where(jsonb) from public, anon, authenticated';
  execute 'revoke all on function public._wa_tabela_ok(text) from public, anon, authenticated';
end $$;

commit;
