-- Reversão de 2026-11-24_historico_acessos.sql
-- Volta proposta_status, adm_reativar, adm_listar, seq_dados e adm_email_reservar às versões anteriores e remove as funções novas.
-- Propostas canceladas passam a valer como EXPIRADAS (o link continua sem abrir). As da Lixeira continuam ocultas.
-- As colunas novas (cancelada_em, excluida_em, evento, detalhe, disp_tipo, navegador) ficam: são inofensivas para o código antigo.
begin;
update public.propostas set expira_em = least(expira_em, cancelada_em) where cancelada_em is not null;

create or replace function public.proposta_status(p_lh text, p_dhash text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select jsonb_build_object(
        'existe',    true,
        'valida',    ((p.d_hash is null or p.d_hash = p_dhash) and p.expira_em > now()),
        'expirada',  (p.expira_em <= now()),
        'expira_em', p.expira_em,
        'agora',     now())
       from public.propostas p where p.link_hash = p_lh
      order by p.criado_em desc limit 1),
    jsonb_build_object('existe', false, 'valida', false, 'expirada', false, 'agora', now()));
$$;

create or replace function public.adm_reativar(p_secret text, p_id uuid, p_dias integer)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_dias is null or p_dias < 1 or p_dias > 30 then raise exception 'dias invalidos'; end if;
  update public.propostas set expira_em = now() + (p_dias || ' days')::interval, oculta = false where id = p_id;
  if not found then raise exception 'proposta nao encontrada'; end if;
end $$;

create or replace function public.adm_listar(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc), '[]'::jsonb) into r from (
    select p.id, p.cliente, p.v1, p.v2, p.v3, p.planos, p.validade, p.criado_em, p.link_hash, p.expira_em,
      p.tipo, p.email, p.atualizado_em, (p.snapshot is not null) as tem_snapshot,
      p.enviado_em, p.envio_erro, p.cliente_mulher, public._nicho(p) as nicho, (p.nicho is null) as nicho_auto,
      (select e.status from public.proposta_emails e where e.lh = p.link_hash) as seq_status,
      exists (select 1 from public.email_supressao s where s.email = lower(trim(p.email))) as suprimido,
      case when p.expira_em <= now() then 'expirada' else 'ativa' end as status,
      (select count(*) from public.acessos a where a.proposta_id = p.link_hash) as ac,
      (select count(distinct a.dispositivo_hash) from public.acessos a
        where a.proposta_id = p.link_hash and a.dispositivo_hash like 'd2\_%') as dv
    from public.propostas p where not p.oculta order by p.criado_em desc limit 50) x;
  return r;
end $$;

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
         where not p.oculta and coalesce(p.email,'') <> '' and p.link_hash is not null) x), '[]'::jsonb),
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
  if not found or p.oculta then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;
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

drop policy if exists "registrar acesso" on public.acessos;
create policy "registrar acesso" on public.acessos for insert to anon, authenticated with check (
  char_length(proposta_id) between 1 and 64 and char_length(dispositivo_hash) between 1 and 64);

drop function if exists public.adm_cancelar(text, uuid);
drop function if exists public.adm_lixeira_mover(text, uuid);
drop function if exists public.adm_apagar_lote(text, text, text, boolean);
drop function if exists public.adm_lixeira(text);
drop function if exists public.adm_restaurar(text, uuid);
drop function if exists public.adm_apagar_definitivo(text, uuid);
drop function if exists public.adm_lixeira_purgar(text);
drop function if exists public._apagar_de_vez(uuid[]);
drop function if exists public.adm_ignorar_disp(text, text);
drop function if exists public._acessos_resumo(text);
drop table if exists public.acessos_admin;
commit;
