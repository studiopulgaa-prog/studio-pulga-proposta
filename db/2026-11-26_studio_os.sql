-- Studio OS (26/11/2026): usuários (Isaque e Ju), app de atendimento com push, anotações de cliente, etapa "em conversa" no funil.
-- Só ADIÇÕES: tabelas novas (wa_push, wa_notas), colunas novas e funções novas. Nenhum dado existente é alterado.
-- _wa_tabela_ok é recriada com a lista antiga + wa_push e wa_notas (mesmo padrão: acesso só pelo servidor com EMAIL_SECRET).
-- Reversão: db/2026-11-26_studio_os_REVERSAO.sql
begin;

-- ===== push (notificações no celular) =====
create table if not exists public.wa_push (
  id uuid primary key default gen_random_uuid(),
  usuario text not null check (usuario in ('isaque', 'ju')),
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  aparelho text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  ultimo_envio_em timestamptz,
  falhas int not null default 0
);
create index if not exists wa_push_ativo_idx on public.wa_push (ativo, usuario);

-- ===== anotações internas do cliente (ficha) =====
create table if not exists public.wa_notas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.wa_clientes(id) on delete cascade,
  autor text not null check (autor in ('isaque', 'ju')),
  texto text not null check (char_length(texto) between 1 and 4000),
  criado_em timestamptz not null default now()
);
create index if not exists wa_notas_cli_idx on public.wa_notas (cliente_id, criado_em desc);

-- ===== conversas e mensagens: dono, leitura, resolução, autor, comentário interno =====
alter table public.wa_conversas add column if not exists atendente text check (atendente is null or atendente in ('isaque', 'ju'));
alter table public.wa_conversas add column if not exists lida_em timestamptz;
alter table public.wa_conversas add column if not exists resolvida_em timestamptz;
alter table public.wa_mensagens add column if not exists autor text check (autor is null or autor in ('isaque', 'ju'));
alter table public.wa_mensagens add column if not exists interno boolean not null default false;   -- comentário da equipe: nunca vai para o cliente
create index if not exists wa_conversas_upd_idx on public.wa_conversas (updated_at desc);

-- ===== plano contratado na ficha do cliente =====
alter table public.wa_clientes add column if not exists plano text check (plano is null or char_length(plano) <= 80);

-- ===== funil comercial: etapa "em conversa" marcada à mão =====
alter table public.propostas add column if not exists em_conversa_em timestamptz;

do $$ declare t text; begin
  foreach t in array array['wa_push', 'wa_notas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

create or replace function public._wa_tabela_ok(t text) returns boolean language sql immutable as $$
  select t = any (array['wa_clientes','wa_contatos','wa_codigos','wa_conversas','wa_mensagens','wa_regua_envios','wa_config','wa_alertas','wa_uso_ia','wa_eventos','onboarding_senhas','wa_push','wa_notas']);
$$;
revoke all on function public._wa_tabela_ok(text) from public, anon, authenticated;

-- ===== marcar/desmarcar "em conversa" numa proposta (funil) =====
create or replace function public.adm_em_conversa(p_secret text, p_id uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  update public.propostas set em_conversa_em = case when p_on then coalesce(em_conversa_em, now()) else null end, atualizado_em = now() where id = p_id;
  return jsonb_build_object('ok', found);
end $$;

-- ===== dados do funil (todas as propostas visíveis, leve) =====
create or replace function public.adm_funil(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'em_conversa_em', p.em_conversa_em)) from public.propostas p
                    where p.em_conversa_em is not null and not p.oculta and p.excluida_em is null), '[]'::jsonb);
end $$;

-- ===== login: tentativas erradas por IP numa janela de N minutos (5 erradas = espera 10 min) =====
create or replace function public.login_falhas_min(p_secret text, p_ip text, p_min int)
returns int language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  return (select count(*) from public.login_tentativas where ip = p_ip and em > now() - make_interval(mins => least(greatest(coalesce(p_min, 10), 1), 60)));
end $$;

do $$ declare f text; begin
  foreach f in array array['adm_em_conversa(text,uuid,boolean)', 'adm_funil(text)', 'login_falhas_min(text,text,int)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to anon', f);   -- o servidor chama com a anon + EMAIL_SECRET; sem o segredo, recusa
  end loop;
end $$;

commit;
