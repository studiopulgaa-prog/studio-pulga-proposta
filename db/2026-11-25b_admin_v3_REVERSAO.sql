-- Reversão de db/2026-11-25b_admin_v3.sql (volta as funções às versões de b1250e2 e apaga o que foi criado).
-- Atenção: apaga também o que foi preenchido depois (WhatsApp dos clientes, follow-up, histórico, Conteúdo publicado, ID do Pixel).
-- Os registros de acesso e a tabela de eventos continuam (o valor das escolhas é descartado).
begin;
drop trigger if exists propostas_conteudo on public.propostas;
drop function if exists public._conteudo_na_criacao();
drop function if exists public.adm_conteudo_get(text);
drop function if exists public.adm_conteudo_versao(text, int);
drop function if exists public.adm_conteudo_rascunho(text, jsonb);
drop function if exists public.adm_conteudo_publicar(text, jsonb, text, boolean);
drop function if exists public.conteudo_atual(text);
drop function if exists public.adm_site_get(text);
drop function if exists public.adm_site_set(text, text, text);
drop function if exists public.adm_contato(text, uuid, text, text);
drop function if exists public.adm_follow(text, uuid, text, int);
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
create or replace function public.adm_listar2(p_secret text, p_limite int default 20, p_cursor text default null,
  p_tipo text default null, p_status text default null, p_busca text default null, p_testes boolean default false)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare lim int := least(greatest(coalesce(p_limite, 20), 1), 200); c_em timestamptz; c_id uuid; q text; r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_cursor is not null and p_cursor ~ '^[^|]+\|[0-9a-fA-F-]{36}$' then
    c_em := split_part(p_cursor, '|', 1)::timestamptz; c_id := split_part(p_cursor, '|', 2)::uuid;
  end if;
  q := nullif(lower(translate(trim(coalesce(p_busca, '')), 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '');
  with base as (
    select p.*, public._nicho(p) as nicho_x,
      (select e.status from public.proposta_emails e where e.lh = p.link_hash) as seq_st,
      public._acessos_resumo(p.link_hash) as acs_x,
      case when p.cancelada_em is not null then 'cancelada' when p.expira_em <= now() then 'expirada' else 'ativa' end as st
    from public.propostas p
    where not p.oculta and p.excluida_em is null
      and (p_tipo is null or p.tipo = p_tipo)
      and (q is null or lower(translate(p.cliente, 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')) like '%' || q || '%')
  ), b2 as (
    select b.*, (coalesce(b.cliente, '') ~* '^\s*(teste|zz)' or coalesce(b.seq_st, '') = 'teste') as teste,
      ((b.acs_x->>'escolheu') is not null or coalesce(b.emails_cliente, 0) > 0) as escolheu
    from base b
  ), vis as (
    select * from b2 where coalesce(p_testes, false) or not teste
  ), sel as (
    select * from vis
    where (p_status is null or (p_status = 'ativas' and st = 'ativa') or (p_status = 'expiradas' and st = 'expirada')
           or (p_status = 'canceladas' and st = 'cancelada') or (p_status = 'escolheram' and escolheu))
      and (c_em is null or (criado_em, id) < (c_em, c_id))
    order by criado_em desc, id desc limit lim + 1
  )
  select jsonb_build_object('ok', true,
    'lista', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'cliente', s.cliente, 'v1', s.v1, 'v2', s.v2, 'v3', s.v3, 'planos', s.planos, 'validade', s.validade,
        'criado_em', s.criado_em, 'link_hash', s.link_hash, 'expira_em', s.expira_em, 'tipo', s.tipo, 'email', s.email,
        'atualizado_em', s.atualizado_em, 'tem_snapshot', s.snapshot is not null, 'enviado_em', s.enviado_em, 'envio_erro', s.envio_erro,
        'cliente_mulher', s.cliente_mulher, 'nicho', s.nicho_x, 'nicho_auto', s.nicho is null, 'nicho_ok', s.nicho_ok,
        'cancelada_em', s.cancelada_em, 'emails_cliente', s.emails_cliente, 'seq_status', s.seq_st,
        'suprimido', exists (select 1 from public.email_supressao z where z.email = lower(trim(s.email))),
        'status', s.st, 'acs', s.acs_x, 'teste', s.teste) order by s.criado_em desc, s.id desc)
      from (select * from sel order by criado_em desc, id desc limit lim) s), '[]'::jsonb),
    'proximo', (select to_char(x.criado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || x.id
                from (select * from sel order by criado_em desc, id desc offset lim - 1 limit 1) x
                where (select count(*) from sel) > lim),
    'contagens', (select jsonb_build_object(
        'ativas', count(*) filter (where st = 'ativa'), 'expiradas', count(*) filter (where st = 'expirada'),
        'canceladas', count(*) filter (where st = 'cancelada'), 'escolheram', count(*) filter (where escolheu),
        'todas', count(*)) from vis),
    'testes', (select count(*) from b2 where teste)
  ) into r;
  return r;
end $$;
create or replace function public.adm_eventos(p_secret text, p_id uuid, p_limite int default 200)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare lh text; r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select link_hash into lh from public.propostas where id = p_id;
  if lh is null then return jsonb_build_object('ok', false); end if;
  select jsonb_build_object('ok', true,
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('tipo', e.tipo, 'detalhe', e.detalhe, 'disp_tipo', e.disp_tipo, 'navegador', e.navegador,
                 'aparelho', left(md5(coalesce(e.dispositivo_hash, '')), 8), 'em', e.criado_em) order by e.criado_em desc, e.id desc)
       from (select * from public.proposta_eventos x where x.proposta_id = lh
               and not exists (select 1 from public.acessos_admin m where m.dispositivo_hash = x.dispositivo_hash)
             order by x.criado_em desc, x.id desc limit least(greatest(coalesce(p_limite, 200), 1), 500)) e), '[]'::jsonb),
    'antigos', (select jsonb_build_object('aberturas', count(*) filter (where a.evento = 'abriu'),
                  'aparelhos', count(distinct a.dispositivo_hash) filter (where a.dispositivo_hash like 'd2\_%'),
                  'primeiro', min(a.criado_em), 'ultimo', max(a.criado_em))
       from public.acessos a where a.proposta_id = lh
         and not exists (select 1 from public.proposta_eventos e where e.acesso_id = a.id)
         and not exists (select 1 from public.acessos_admin m where m.dispositivo_hash = a.dispositivo_hash))) into r;
  return r;
end $$;
create or replace function public._evento_de_acesso()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    insert into public.proposta_eventos (acesso_id, proposta_id, dispositivo_hash, tipo, detalhe, disp_tipo, navegador, criado_em)
    values (new.id, new.proposta_id, new.dispositivo_hash,
      case new.evento when 'aba' then 'viu_aba' when 'viu_plano' then 'viu_plano' when 'whatsapp' then 'clicou_whatsapp'
                      when 'escolheu' then 'escolheu_plano' else 'abriu' end,
      new.detalhe, new.disp_tipo, new.navegador, coalesce(new.criado_em, now()))
    on conflict (acesso_id) do nothing;
  exception when others then null;   -- nunca atrapalha o registro do cliente
  end;
  return new;
end $$;
drop policy if exists "registrar acesso" on public.acessos;
create policy "registrar acesso" on public.acessos for insert to anon, authenticated with check (
  char_length(proposta_id) between 1 and 64 and char_length(dispositivo_hash) between 1 and 64
  and evento in ('abriu','aba','viu_plano','escolheu','whatsapp')
  and (detalhe is null or char_length(detalhe) <= 60)
  and (disp_tipo is null or disp_tipo in ('iPhone','iPad','Android','Computador','Outro'))
  and (navegador is null or char_length(navegador) <= 20));
drop function if exists public._follow(public.propostas);
drop function if exists public._escolha(public.propostas);
drop table if exists public.proposta_followup;
drop table if exists public.conteudo_rascunho;
drop table if exists public.conteudo_versoes;
drop table if exists public.sp_site;
alter table public.proposta_eventos drop column if exists valor;
alter table public.acessos drop column if exists valor;
alter table public.propostas drop constraint if exists propostas_whatsapp_check;
alter table public.propostas drop constraint if exists propostas_follow_check;
alter table public.propostas drop column if exists whatsapp;
alter table public.propostas drop column if exists follow_status;
alter table public.propostas drop column if exists follow_em;
alter table public.propostas drop column if exists conteudo_v;
commit;
