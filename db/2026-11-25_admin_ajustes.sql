-- Ajustes do admin (25/11/2026): nicho Construtora + confirmação de nicho, linha do tempo com horário (tabela de eventos)
-- e listagem paginada no servidor. Só ADIÇÕES: coluna nova, tabela nova, gatilho novo, funções novas.
-- Muda só: a regra de valores do nicho (passa a aceitar 'construtora') e adm_nicho (idem). Nenhuma proposta é alterada.
-- Reversão: db/2026-11-25_admin_ajustes_REVERSAO.sql
begin;

-- 1) Nicho: + Construtora (não recebe Milão nem Dia do Arquiteto: esses só vão para 'arquiteto', ver api/_sequencia.js)
alter table public.propostas drop constraint if exists propostas_nicho_check;
alter table public.propostas add constraint propostas_nicho_check check (nicho is null or nicho in ('arquiteto','loja','construtora','outro'));
-- nicho confirmado pelo Isaque (as propostas que já existem ficam "não confirmado" até ele confirmar no admin)
alter table public.propostas add column if not exists nicho_ok boolean not null default false;

create or replace function public.adm_nicho(p_secret text, p_id uuid, p_nicho text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_nicho not in ('arquiteto','loja','construtora','outro') then raise exception 'nicho invalido'; end if;
  update public.propostas set nicho = p_nicho, atualizado_em = now() where id = p_id;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end $$;

create or replace function public.adm_nicho_confirmar(p_secret text, p_id uuid, p_nicho text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_nicho not in ('arquiteto','loja','construtora','outro') then raise exception 'nicho invalido'; end if;
  update public.propostas set nicho = p_nicho, nicho_ok = true, atualizado_em = now() where id = p_id;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end $$;

-- 2) Eventos do cliente com data e hora. A página do cliente NÃO muda: cada registro que ela já grava em "acessos"
--    vira também uma linha aqui (gatilho). Aparelho = identificador anônimo que já existe (sem IP).
create table if not exists public.proposta_eventos (
  id bigserial primary key,
  acesso_id uuid unique,
  proposta_id text not null,                -- link_hash da proposta (igual a acessos.proposta_id)
  dispositivo_hash text,
  tipo text not null check (tipo in ('abriu','viu_aba','viu_plano','clicou_whatsapp','escolheu_plano')),
  detalhe text,
  disp_tipo text,
  navegador text,
  criado_em timestamptz not null default now()
);
create index if not exists proposta_eventos_prop_idx on public.proposta_eventos (proposta_id, criado_em desc);
create index if not exists proposta_eventos_data_idx on public.proposta_eventos (criado_em desc);
alter table public.proposta_eventos enable row level security;   -- sem políticas: só as funções do admin leem
revoke all on public.proposta_eventos from anon, authenticated;

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
revoke all on function public._evento_de_acesso() from public, anon, authenticated;
drop trigger if exists acessos_evento on public.acessos;
create trigger acessos_evento after insert on public.acessos for each row execute function public._evento_de_acesso();

-- registros feitos pelo rastreio novo (desde 24/11, têm tipo de aparelho ou evento) entram com o horário original;
-- os mais antigos continuam só em "acessos" e aparecem como resumo "registro antigo".
insert into public.proposta_eventos (acesso_id, proposta_id, dispositivo_hash, tipo, detalhe, disp_tipo, navegador, criado_em)
select a.id, a.proposta_id, a.dispositivo_hash,
  case a.evento when 'aba' then 'viu_aba' when 'viu_plano' then 'viu_plano' when 'whatsapp' then 'clicou_whatsapp'
                when 'escolheu' then 'escolheu_plano' else 'abriu' end,
  a.detalhe, a.disp_tipo, a.navegador, a.criado_em
from public.acessos a
where (a.disp_tipo is not null or a.navegador is not null or a.evento <> 'abriu')
on conflict (acesso_id) do nothing;

-- 3) Linha do tempo de uma proposta (mais recente primeiro; aparelhos do admin não contam)
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

-- 4) Últimas atividades de todos os clientes (Início, computador)
create or replace function public.adm_atividades(p_secret text, p_limite int default 12)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.pid, 'cliente', x.cliente, 'tipo', x.tipo, 'detalhe', x.detalhe,
           'disp_tipo', x.disp_tipo, 'navegador', x.navegador, 'em', x.criado_em) order by x.criado_em desc), '[]'::jsonb) into r
  from (select p.id pid, p.cliente, e.tipo, e.detalhe, e.disp_tipo, e.navegador, e.criado_em
          from public.proposta_eventos e join public.propostas p on p.link_hash = e.proposta_id
         where not p.oculta and p.excluida_em is null
           and not exists (select 1 from public.acessos_admin m where m.dispositivo_hash = e.dispositivo_hash)
         order by e.criado_em desc limit least(greatest(coalesce(p_limite, 12), 1), 50)) x;
  return r;
end $$;

-- 5) Histórico paginado: limite, cursor e filtros (tipo, situação, busca, testes) + contagens para os chips
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

-- as funções adm_* seguem o padrão das outras: o servidor chama com a chave pública + segredo (p_secret, conferido em _email_ok)

commit;
