-- Histórico: Cancelar / Excluir (Lixeira 30 dias) / Apagar em lote + acessos do cliente detalhados (24/11/2026).
-- Só ADIÇÕES (colunas/tabelas/funções novas; funções existentes ganham campos). Reversão: db/2026-11-24_historico_acessos_REVERSAO.sql
begin;

-- 1) Cancelada / excluída (lixeira). "oculta" continua existindo (compatível com o código antigo).
alter table public.propostas add column if not exists cancelada_em timestamptz;
alter table public.propostas add column if not exists excluida_em timestamptz;
update public.propostas set excluida_em = now() where oculta and excluida_em is null;   -- as já "apagadas" vão para a Lixeira (30 dias a partir de hoje)

-- 2) Acessos: o que o cliente fez (abriu, aba, plano visto, escolheu, WhatsApp), tipo de aparelho e navegador. Sem IP.
alter table public.acessos add column if not exists evento text not null default 'abriu';
alter table public.acessos add column if not exists detalhe text;
alter table public.acessos add column if not exists disp_tipo text;
alter table public.acessos add column if not exists navegador text;
create index if not exists acessos_proposta_idx on public.acessos (proposta_id);
drop policy if exists "registrar acesso" on public.acessos;
create policy "registrar acesso" on public.acessos for insert to anon, authenticated with check (
  char_length(proposta_id) between 1 and 64 and char_length(dispositivo_hash) between 1 and 64
  and evento in ('abriu','aba','viu_plano','escolheu','whatsapp')
  and (detalhe is null or char_length(detalhe) <= 60)
  and (disp_tipo is null or disp_tipo in ('iPhone','iPad','Android','Computador','Outro'))
  and (navegador is null or char_length(navegador) <= 20));

-- aparelhos do admin: acessos deles não contam
create table if not exists public.acessos_admin (
  dispositivo_hash text primary key,
  criado_em timestamptz not null default now()
);
alter table public.acessos_admin enable row level security;
revoke all on public.acessos_admin from anon, authenticated;

-- 3) proposta_status: cancelada ou excluída NUNCA abre (link longo ou curto)
create or replace function public.proposta_status(p_lh text, p_dhash text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select jsonb_build_object(
        'existe',       true,
        'indisponivel', (p.cancelada_em is not null or p.excluida_em is not null or p.oculta),
        'valida',       ((p.d_hash is null or p.d_hash = p_dhash) and p.expira_em > now()
                         and p.cancelada_em is null and p.excluida_em is null and not p.oculta),
        'expirada',     (p.expira_em <= now() and p.cancelada_em is null and p.excluida_em is null and not p.oculta),
        'expira_em',    p.expira_em,
        'agora',        now())
       from public.propostas p where p.link_hash = p_lh
      order by p.criado_em desc limit 1),
    jsonb_build_object('existe', false, 'valida', false, 'expirada', false, 'agora', now()));
$$;

-- 4) ações do Histórico (todas exigem o segredo)
create or replace function public.adm_cancelar(p_secret text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  update public.propostas set cancelada_em = now(), atualizado_em = now() where id = p_id and excluida_em is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end $$;

create or replace function public.adm_reativar(p_secret text, p_id uuid, p_dias integer)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_dias is null or p_dias < 1 or p_dias > 30 then raise exception 'dias invalidos'; end if;
  update public.propostas set expira_em = now() + (p_dias || ' days')::interval, oculta = false,
         cancelada_em = null, excluida_em = null, atualizado_em = now() where id = p_id;
  if not found then raise exception 'proposta nao encontrada'; end if;
end $$;

create or replace function public.adm_lixeira_mover(p_secret text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  update public.propostas set excluida_em = now(), oculta = true, atualizado_em = now() where id = p_id and excluida_em is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end $$;

-- apagar em lote (vai para a Lixeira). Ativas só com p_incluir_ativas.
create or replace function public.adm_apagar_lote(p_secret text, p_tipo text, p_filtro text, p_incluir_ativas boolean)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_filtro not in ('todas','expiradas','canceladas') then raise exception 'filtro invalido'; end if;
  if p_tipo is not null and p_tipo not in ('planos','cardapio') then raise exception 'tipo invalido'; end if;
  update public.propostas p set excluida_em = now(), oculta = true, atualizado_em = now()
   where p.excluida_em is null and not p.oculta and (p_tipo is null or p.tipo = p_tipo)
     and case p_filtro
           when 'canceladas' then p.cancelada_em is not null
           when 'expiradas'  then p.cancelada_em is null and p.expira_em <= now()
           else (p.cancelada_em is not null or p.expira_em <= now() or coalesce(p_incluir_ativas, false))
         end;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.adm_lixeira(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.excluida_em desc) from (
    select p.id, p.cliente, p.tipo, p.criado_em, p.expira_em, p.excluida_em, (p.cancelada_em is not null) as cancelada,
           greatest(0, 30 - floor(extract(epoch from (now() - p.excluida_em)) / 86400))::int as dias_restantes
      from public.propostas p where p.excluida_em is not null) x), '[]'::jsonb);
end $$;

create or replace function public.adm_restaurar(p_secret text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  update public.propostas set excluida_em = null, oculta = false, atualizado_em = now() where id = p_id and excluida_em is not null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end $$;

-- apaga de vez (só o que está na Lixeira): proposta, link curto, registro de e-mails e acessos
create or replace function public._apagar_de_vez(p_ids uuid[])
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  delete from public.links l using public.propostas p where p.id = any(p_ids) and p.excluida_em is not null and l.url = p.snapshot->>'link';
  delete from public.proposta_emails e using public.propostas p where p.id = any(p_ids) and p.excluida_em is not null and e.lh = p.link_hash;
  delete from public.acessos a using public.propostas p where p.id = any(p_ids) and p.excluida_em is not null and a.proposta_id = p.link_hash;
  delete from public.propostas p where p.id = any(p_ids) and p.excluida_em is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public._apagar_de_vez(uuid[]) from public, anon, authenticated;

create or replace function public.adm_apagar_definitivo(p_secret text, p_id uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  return public._apagar_de_vez(array[p_id]);
end $$;

-- limpeza automática: o que está na Lixeira há mais de 30 dias (chamada pelo cron diário)
create or replace function public.adm_lixeira_purgar(p_secret text)
returns integer language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  return public._apagar_de_vez(array(select id from public.propostas where excluida_em < now() - interval '30 days'));
end $$;

create or replace function public.adm_ignorar_disp(p_secret text, p_hash text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_hash !~ '^d2_[a-z0-9]{4,40}$' then raise exception 'hash invalido'; end if;
  insert into public.acessos_admin(dispositivo_hash) values (p_hash) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- 5) resumo de acessos de uma proposta (sem os aparelhos do admin)
create or replace function public._acessos_resumo(p_lh text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with a as (select * from public.acessos x where x.proposta_id = p_lh
              and not exists (select 1 from public.acessos_admin m where m.dispositivo_hash = x.dispositivo_hash))
  select jsonb_build_object(
    'aberturas', (select count(*) from a where evento = 'abriu'),
    'primeiro',  (select min(criado_em) from a where evento = 'abriu'),
    'ultimo',    (select max(criado_em) from a),
    'dispositivos', (select count(distinct dispositivo_hash) from a where dispositivo_hash like 'd2\_%'),
    'aparelhos', coalesce((select jsonb_agg(jsonb_build_object('tipo', t, 'nav', nv, 'vezes', n, 'ultimo', u) order by u desc) from (
        select dispositivo_hash, max(disp_tipo) t, max(navegador) nv, count(*) filter (where evento = 'abriu') n, max(criado_em) u
          from a where dispositivo_hash like 'd2\_%' group by dispositivo_hash) d), '[]'::jsonb),
    'abas',      coalesce((select jsonb_agg(distinct detalhe) from a where evento = 'aba' and detalhe is not null), '[]'::jsonb),
    'planos',    coalesce((select jsonb_agg(distinct detalhe) from a where evento = 'viu_plano' and detalhe is not null), '[]'::jsonb),
    'escolheu',  (select detalhe from a where evento = 'escolheu' order by criado_em desc limit 1),
    'whatsapp',  exists (select 1 from a where evento = 'whatsapp'));
$$;
revoke all on function public._acessos_resumo(text) from public, anon, authenticated;

create or replace function public.adm_listar(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc), '[]'::jsonb) into r from (
    select p.id, p.cliente, p.v1, p.v2, p.v3, p.planos, p.validade, p.criado_em, p.link_hash, p.expira_em,
      p.tipo, p.email, p.atualizado_em, (p.snapshot is not null) as tem_snapshot,
      p.enviado_em, p.envio_erro, p.cliente_mulher, public._nicho(p) as nicho, (p.nicho is null) as nicho_auto,
      p.cancelada_em, p.emails_cliente,
      (select e.status from public.proposta_emails e where e.lh = p.link_hash) as seq_status,
      exists (select 1 from public.email_supressao s where s.email = lower(trim(p.email))) as suprimido,
      case when p.cancelada_em is not null then 'cancelada' when p.expira_em <= now() then 'expirada' else 'ativa' end as status,
      public._acessos_resumo(p.link_hash) as acs,
      (select count(*) from public.acessos a where a.proposta_id = p.link_hash and a.evento = 'abriu'
         and not exists (select 1 from public.acessos_admin m where m.dispositivo_hash = a.dispositivo_hash)) as ac,
      (select count(distinct a.dispositivo_hash) from public.acessos a where a.proposta_id = p.link_hash and a.dispositivo_hash like 'd2\_%'
         and not exists (select 1 from public.acessos_admin m where m.dispositivo_hash = a.dispositivo_hash)) as dv
    from public.propostas p where not p.oculta and p.excluida_em is null order by p.criado_em desc limit 80) x;
  return r;
end $$;

-- 6) e-mails: cancelada/excluída não recebe nada (sequência, sazonais, envio manual)
create or replace function public.seq_dados(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select jsonb_build_object(
    'propostas', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select p.id, p.link_hash as lh, lower(trim(p.email)) as email, p.cliente, p.tipo, p.criado_em, p.expira_em,
               p.emails_cliente, p.cliente_mulher as mulher, (p.snapshot->'form'->>'modelo') as modelo, public._nicho(p) as nicho,
               e.status as pe_status, coalesce(e.enviados, '{}'::jsonb) as enviados, e.link as pe_link
          from public.propostas p left join public.proposta_emails e on e.lh = p.link_hash
         where not p.oculta and p.cancelada_em is null and p.excluida_em is null
           and coalesce(p.email,'') <> '' and p.link_hash is not null) x), '[]'::jsonb),
    'bloqueados', coalesce((select jsonb_agg(distinct em) from (
        select lower(trim(e.email)) em from public.proposta_emails e where e.status in ('fechada','descadastrada','pausada')
        union select lower(trim(p.email)) from public.propostas p where p.emails_cliente > 0 and coalesce(p.email,'') <> ''
        union select s.email from public.email_supressao s) b), '[]'::jsonb),
    'suprimidos', coalesce((select jsonb_agg(s.email) from public.email_supressao s), '[]'::jsonb),
    'campanhas', coalesce((select jsonb_agg(jsonb_build_object('email', c.email, 'campanha', c.campanha, 'ano', c.ano, 'enviado_em', c.enviado_em))
                             from public.email_campanhas c), '[]'::jsonb),
    'falhas', coalesce((select jsonb_object_agg(chave, n) from (select chave, count(*) n from public.email_log
                         where modo = 'envio' and status = 'erro' and chave is not null group by chave) f), '{}'::jsonb),
    'enviados_hoje', (select count(*) from public.email_log where modo = 'envio' and tipo in ('lembrete','ultimo_aviso','campanha')
                       and status <> 'erro' and (criado_em at time zone 'America/Sao_Paulo')::date = hoje)
  ) into r;
  return r;
end $$;

create or replace function public.adm_email_reservar(p_secret text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare p public.propostas%rowtype; n int; s text;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select * into p from public.propostas where id = p_id;
  if not found or p.oculta or p.excluida_em is not null then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;
  if p.cancelada_em is not null then return jsonb_build_object('ok', false, 'motivo', 'cancelada'); end if;
  if p.expira_em <= now() then return jsonb_build_object('ok', false, 'motivo', 'expirada'); end if;
  if coalesce(p.email, '') = '' then return jsonb_build_object('ok', false, 'motivo', 'sem_email'); end if;
  if coalesce(p.snapshot->>'link', '') = '' then return jsonb_build_object('ok', false, 'motivo', 'sem_link'); end if;
  if exists (select 1 from public.email_supressao where email = lower(trim(p.email))) then
    return jsonb_build_object('ok', false, 'motivo', 'suprimido'); end if;
  update public.propostas set envio_tentativa_em = now()
   where id = p_id and (envio_tentativa_em is null or envio_tentativa_em <= now() - interval '60 seconds');
  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'limite',
      'espera_s', greatest(1, ceil(extract(epoch from (p.envio_tentativa_em + interval '60 seconds' - now())))::int));
  end if;
  select slug into s from public.links where url = p.snapshot->>'link' order by criado_em desc limit 1;
  return jsonb_build_object('ok', true, 'cliente', p.cliente, 'email', p.email, 'expira_em', p.expira_em,
    'tipo', p.tipo, 'link', p.snapshot->>'link', 'slug', s, 'enviado_em', p.enviado_em, 'lh', p.link_hash);
end $$;

commit;
