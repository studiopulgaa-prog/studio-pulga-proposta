-- Admin v3 (25/11/2026): WhatsApp do cliente, escolha com item e valor, follow-up (Aguardando / Ainda não decidiu / Escolheu /
-- Fechou / Perdido) com histórico, aba Conteúdo (rascunho, publicação com versões) e Pixel da Meta configurável.
-- Só ADIÇÕES: colunas novas (vazias), tabelas novas, funções novas. Funções que já existiam ganham campos novos na resposta
-- (proposta_status, seq_dados, adm_listar2, adm_eventos, _evento_de_acesso). NENHUM dado existente das propostas é alterado.
-- Reversão: db/2026-11-25b_admin_v3_REVERSAO.sql
begin;

-- ===== A) contato, follow-up e escolha =====
alter table public.propostas add column if not exists whatsapp text;
alter table public.propostas add column if not exists follow_status text;
alter table public.propostas add column if not exists follow_em timestamptz;
alter table public.propostas add column if not exists conteudo_v int;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'propostas_whatsapp_check') then
    alter table public.propostas add constraint propostas_whatsapp_check check (whatsapp is null or whatsapp ~ '^55[0-9]{10,11}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'propostas_follow_check') then
    alter table public.propostas add constraint propostas_follow_check check (follow_status is null or follow_status in ('nao_decidiu','escolheu','fechou','perdido'));
  end if;
end $$;

-- valor do item escolhido (a página do cliente manda junto com a escolha)
alter table public.acessos add column if not exists valor text;
alter table public.proposta_eventos add column if not exists valor text;
drop policy if exists "registrar acesso" on public.acessos;
create policy "registrar acesso" on public.acessos for insert to anon, authenticated with check (
  char_length(proposta_id) between 1 and 64 and char_length(dispositivo_hash) between 1 and 64
  and evento in ('abriu','aba','viu_plano','escolheu','whatsapp')
  and (detalhe is null or char_length(detalhe) <= 60)
  and (valor is null or char_length(valor) <= 40)
  and (disp_tipo is null or disp_tipo in ('iPhone','iPad','Android','Computador','Outro'))
  and (navegador is null or char_length(navegador) <= 20));

create or replace function public._evento_de_acesso()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    insert into public.proposta_eventos (acesso_id, proposta_id, dispositivo_hash, tipo, detalhe, valor, disp_tipo, navegador, criado_em)
    values (new.id, new.proposta_id, new.dispositivo_hash,
      case new.evento when 'aba' then 'viu_aba' when 'viu_plano' then 'viu_plano' when 'whatsapp' then 'clicou_whatsapp'
                      when 'escolheu' then 'escolheu_plano' else 'abriu' end,
      new.detalhe, new.valor, new.disp_tipo, new.navegador, coalesce(new.criado_em, now()))
    on conflict (acesso_id) do nothing;
  exception when others then null;   -- nunca atrapalha o registro do cliente
  end;
  return new;
end $$;

-- histórico do follow-up (data, status, observação como "renovada até ...")
create table if not exists public.proposta_followup (
  id bigserial primary key,
  proposta_id uuid not null,
  status text not null,
  nota text,
  criado_em timestamptz not null default now()
);
create index if not exists proposta_followup_prop_idx on public.proposta_followup (proposta_id, criado_em desc);
alter table public.proposta_followup enable row level security;
revoke all on public.proposta_followup from anon, authenticated;

-- escolha válida do cliente: a última escolha (clique) que não foi desfeita por "Ainda não decidiu"
create or replace function public._escolha(p public.propostas)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('item', e.detalhe, 'valor', e.valor, 'em', e.criado_em)
    from public.proposta_eventos e
   where e.proposta_id = p.link_hash and e.tipo = 'escolheu_plano'
     and not exists (select 1 from public.acessos_admin m where m.dispositivo_hash = e.dispositivo_hash)
     -- uma marcação manual depois do clique (Aguardando, Ainda não decidiu, Perdido) desfaz a escolha; um clique novo vale de novo
     and (p.follow_em is null or e.criado_em > p.follow_em or p.follow_status in ('escolheu','fechou'))
   order by e.criado_em desc limit 1
$$;
-- status de follow-up: aguardando | nao_decidiu | escolheu | fechou | perdido
-- "Cliente fechou" antigo (e-mails com status 'fechada') continua valendo como Fechou.
create or replace function public._follow(p public.propostas)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when p.follow_status = 'fechou' or exists (select 1 from public.proposta_emails x where x.lh = p.link_hash and x.status = 'fechada') then 'fechou'
    when p.follow_status = 'perdido' then 'perdido'
    when p.follow_status = 'escolheu' or public._escolha(p) is not null
         or (coalesce(p.emails_cliente, 0) > 0 and p.follow_em is null) then 'escolheu'   -- registro antigo (antes do clique com item)
    when p.follow_status = 'nao_decidiu' then 'nao_decidiu'
    else 'aguardando' end
$$;
revoke all on function public._escolha(public.propostas) from public, anon, authenticated;
revoke all on function public._follow(public.propostas) from public, anon, authenticated;

-- editar e-mail e WhatsApp a qualquer momento
create or replace function public.adm_contato(p_secret text, p_id uuid, p_email text, p_whatsapp text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_lh text; em text := nullif(lower(trim(coalesce(p_email, ''))), ''); wa text := nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '');
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if em is not null and (char_length(em) > 200 or em !~ '^\S+@\S+\.\S+$') then raise exception 'email invalido'; end if;
  if wa ~ '^[0-9]{10,11}$' then wa := '55' || wa; end if;   -- (DD) 9 0000-0000 vira 55 + dígitos
  if wa is not null and wa !~ '^55[0-9]{10,11}$' then raise exception 'whatsapp invalido'; end if;
  -- parâmetro nulo = mantém; texto vazio = apaga
  update public.propostas set email = case when p_email is null then email else em end,
         whatsapp = case when p_whatsapp is null then whatsapp else wa end, atualizado_em = now()
   where id = p_id returning link_hash into v_lh;
  if v_lh is null then return jsonb_build_object('ok', false); end if;
  if p_email is not null and em is not null then update public.proposta_emails set email = em, atualizado_em = now() where proposta_emails.lh = v_lh; end if;
  if p_email is not null and em is null then update public.proposta_emails set status = 'pausada', atualizado_em = now() where proposta_emails.lh = v_lh and status = 'ativa'; end if;
  return jsonb_build_object('ok', true, 'email', em, 'whatsapp', wa);
end $$;

-- muda o status de follow-up (com registro no histórico)
create or replace function public.adm_follow(p_secret text, p_id uuid, p_status text, p_dias int default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare p public.propostas%rowtype; nota text; st_email text; exp timestamptz;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_status not in ('aguardando','nao_decidiu','escolheu','fechou','perdido') then raise exception 'status invalido'; end if;
  select * into p from public.propostas where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;
  select status into st_email from public.proposta_emails where lh = p.link_hash;
  if p_status = 'nao_decidiu' then
    if p.expira_em <= now() or p.cancelada_em is not null or p.excluida_em is not null or p.oculta then
      if p_dias is null then return jsonb_build_object('ok', false, 'motivo', 'precisa_renovar'); end if;
      perform public.adm_reativar(p_secret, p_id, p_dias);
      select expira_em into exp from public.propostas where id = p_id;
      nota := 'renovada até ' || to_char(exp at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI');
    end if;
    -- religa os lembretes (metade da validade e último aviso), sem passar por cima de quem pediu para sair
    update public.proposta_emails
       set status = 'ativa', enviados = enviados - 'lembrete' - 'ultimo_aviso' - 'curiosidade' - 'vence' - 'vence18', atualizado_em = now()
     where lh = p.link_hash and status in ('ativa','fechada','pausada');
  elsif p_status = 'fechou' then
    if coalesce(st_email, '') <> 'descadastrada' then
      insert into public.proposta_emails(lh, email, cliente, link, status)
        values (p.link_hash, lower(trim(coalesce(p.email,''))), p.cliente, coalesce(p.snapshot->>'link',''), 'fechada')
      on conflict (lh) do update set status = 'fechada', atualizado_em = now();
    end if;
  else
    if st_email = 'fechada' then update public.proposta_emails set status = 'ativa', atualizado_em = now() where lh = p.link_hash; end if;
  end if;
  update public.propostas set follow_status = case when p_status = 'aguardando' then null else p_status end, follow_em = now(), atualizado_em = now()
   where id = p_id;
  insert into public.proposta_followup(proposta_id, status, nota) values (p_id, p_status, nota);
  select * into p from public.propostas where id = p_id;
  return jsonb_build_object('ok', true, 'status', public._follow(p), 'nota', nota, 'expira_em', p.expira_em);
end $$;

-- linha do tempo: + histórico do follow-up e o valor da escolha
create or replace function public.adm_eventos(p_secret text, p_id uuid, p_limite int default 200)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare lh text; r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select link_hash into lh from public.propostas where id = p_id;
  if lh is null then return jsonb_build_object('ok', false); end if;
  select jsonb_build_object('ok', true,
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('tipo', e.tipo, 'detalhe', e.detalhe, 'valor', e.valor, 'disp_tipo', e.disp_tipo, 'navegador', e.navegador,
                 'aparelho', left(md5(coalesce(e.dispositivo_hash, '')), 8), 'em', e.criado_em) order by e.criado_em desc, e.id desc)
       from (select * from public.proposta_eventos x where x.proposta_id = lh
               and not exists (select 1 from public.acessos_admin m where m.dispositivo_hash = x.dispositivo_hash)
             order by x.criado_em desc, x.id desc limit least(greatest(coalesce(p_limite, 200), 1), 500)) e), '[]'::jsonb),
    'antigos', (select jsonb_build_object('aberturas', count(*) filter (where a.evento = 'abriu'),
                  'aparelhos', count(distinct a.dispositivo_hash) filter (where a.dispositivo_hash like 'd2\_%'),
                  'primeiro', min(a.criado_em), 'ultimo', max(a.criado_em))
       from public.acessos a where a.proposta_id = lh
         and not exists (select 1 from public.proposta_eventos e where e.acesso_id = a.id)
         and not exists (select 1 from public.acessos_admin m where m.dispositivo_hash = a.dispositivo_hash)),
    'follow', coalesce((select jsonb_agg(jsonb_build_object('status', f.status, 'nota', f.nota, 'em', f.criado_em) order by f.criado_em desc)
       from (select * from public.proposta_followup y where y.proposta_id = p_id order by y.criado_em desc limit 50) f), '[]'::jsonb)) into r;
  return r;
end $$;

-- histórico paginado: + whatsapp, follow-up, escolha (item e valor) e link curto
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
      public._acessos_resumo(p.link_hash) as acs_x, public._escolha(p) as escolha_x, public._follow(p) as follow_x,
      case when p.cancelada_em is not null then 'cancelada' when p.expira_em <= now() then 'expirada' else 'ativa' end as st
    from public.propostas p
    where not p.oculta and p.excluida_em is null
      and (p_tipo is null or p.tipo = p_tipo)
      and (q is null or lower(translate(p.cliente, 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')) like '%' || q || '%')
  ), b2 as (
    select b.*, (coalesce(b.cliente, '') ~* '^\s*(teste|zz)' or coalesce(b.seq_st, '') = 'teste') as teste,
      (b.follow_x in ('escolheu','fechou')) as escolheu
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
        'whatsapp', s.whatsapp, 'follow', s.follow_x, 'follow_em', s.follow_em, 'escolha', s.escolha_x,
        'curto', (select l.slug from public.links l where l.url = s.snapshot->>'link' order by l.criado_em desc limit 1),
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

-- ===== B) Conteúdo: rascunho + versões publicadas =====
create table if not exists public.conteudo_rascunho (
  id int primary key default 1 check (id = 1),
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.conteudo_versoes (
  id serial primary key,
  dados jsonb not null,
  resumo text,
  aplicou_ativas int not null default 0,
  criado_em timestamptz not null default now()
);
alter table public.conteudo_rascunho enable row level security;
alter table public.conteudo_versoes enable row level security;
revoke all on public.conteudo_rascunho from anon, authenticated;
revoke all on public.conteudo_versoes from anon, authenticated;

-- toda proposta nova guarda a versão de conteúdo vigente (as já enviadas ficam com a delas)
create or replace function public._conteudo_na_criacao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.conteudo_v is null then new.conteudo_v := (select max(id) from public.conteudo_versoes); end if;
  return new;
end $$;
revoke all on function public._conteudo_na_criacao() from public, anon, authenticated;
drop trigger if exists propostas_conteudo on public.propostas;
create trigger propostas_conteudo before insert on public.propostas for each row execute function public._conteudo_na_criacao();

create or replace function public.adm_conteudo_get(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  return jsonb_build_object('ok', true,
    'rascunho', (select dados from public.conteudo_rascunho where id = 1),
    'rascunho_em', (select atualizado_em from public.conteudo_rascunho where id = 1),
    'atual', (select jsonb_build_object('id', v.id, 'dados', v.dados, 'criado_em', v.criado_em) from public.conteudo_versoes v order by v.id desc limit 1),
    'versoes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'resumo', v.resumo, 'criado_em', v.criado_em, 'aplicou_ativas', v.aplicou_ativas) order by v.id desc)
       from (select * from public.conteudo_versoes order by id desc limit 60) v), '[]'::jsonb));
end $$;

create or replace function public.adm_conteudo_versao(p_secret text, p_id int)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  return (select jsonb_build_object('ok', true, 'id', v.id, 'dados', v.dados, 'resumo', v.resumo, 'criado_em', v.criado_em) from public.conteudo_versoes v where v.id = p_id);
end $$;

create or replace function public.adm_conteudo_rascunho(p_secret text, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 300000 then raise exception 'conteudo invalido'; end if;
  insert into public.conteudo_rascunho(id, dados, atualizado_em) values (1, p_dados, now())
  on conflict (id) do update set dados = excluded.dados, atualizado_em = now();
  return jsonb_build_object('ok', true, 'em', now());
end $$;

create or replace function public.adm_conteudo_publicar(p_secret text, p_dados jsonb, p_resumo text, p_ativas boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v int; n int := 0;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 300000 then raise exception 'conteudo invalido'; end if;
  insert into public.conteudo_versoes(dados, resumo) values (p_dados, left(coalesce(p_resumo, ''), 2000)) returning id into v;
  insert into public.conteudo_rascunho(id, dados, atualizado_em) values (1, p_dados, now())
  on conflict (id) do update set dados = excluded.dados, atualizado_em = now();
  if coalesce(p_ativas, false) then
    update public.propostas set conteudo_v = v
     where cancelada_em is null and excluida_em is null and not oculta and expira_em > now();
    get diagnostics n = row_count;
    update public.conteudo_versoes set aplicou_ativas = n where id = v;
  end if;
  return jsonb_build_object('ok', true, 'id', v, 'ativas', n);
end $$;

-- o que vale agora (e-mails automáticos, envio do link e WhatsApp leem daqui)
create or replace function public.conteudo_atual(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  return coalesce((select v.dados from public.conteudo_versoes v order by v.id desc limit 1), '{}'::jsonb);
end $$;

-- ===== C) Pixel da Meta (não é segredo) =====
create table if not exists public.sp_site (
  chave text primary key,
  valor text,
  atualizado_em timestamptz not null default now()
);
alter table public.sp_site enable row level security;
revoke all on public.sp_site from anon, authenticated;
-- o Pixel que já estava na página continua valendo (pode ser trocado ou apagado em Ajustes)
insert into public.sp_site(chave, valor) values ('pixel_id', '1973272740000551') on conflict (chave) do nothing;

create or replace function public.adm_site_get(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  return coalesce((select jsonb_object_agg(chave, valor) from public.sp_site), '{}'::jsonb);
end $$;
create or replace function public.adm_site_set(p_secret text, p_chave text, p_valor text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v text := nullif(trim(coalesce(p_valor, '')), '');
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_chave not in ('pixel_id') then raise exception 'chave invalida'; end if;
  if v is not null and v !~ '^[0-9]{5,20}$' then raise exception 'valor invalido'; end if;
  insert into public.sp_site(chave, valor, atualizado_em) values (p_chave, v, now())
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
  return jsonb_build_object('ok', true, 'valor', v);
end $$;

-- página do cliente: + textos publicados (da versão da proposta) e o ID do Pixel
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
        'agora',        now(),
        'conteudo',     (select v.dados->'pagina' from public.conteudo_versoes v where v.id = p.conteudo_v
                          and (p.d_hash is null or p.d_hash = p_dhash)),
        'zap',          (select v.dados->'gerais'->>'whatsapp' from public.conteudo_versoes v where v.id = p.conteudo_v
                          and (p.d_hash is null or p.d_hash = p_dhash)),
        'pixel',        (select s.valor from public.sp_site s where s.chave = 'pixel_id'))
       from public.propostas p where p.link_hash = p_lh
      order by p.criado_em desc limit 1),
    jsonb_build_object('existe', false, 'valida', false, 'expirada', false, 'agora', now(),
                       'pixel', (select s.valor from public.sp_site s where s.chave = 'pixel_id')));
$$;

-- e-mails automáticos: + follow-up, escolha e conteúdo publicado
create or replace function public.seq_dados(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select jsonb_build_object(
    'propostas', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select p.id, p.link_hash as lh, lower(trim(p.email)) as email, p.cliente, p.tipo, p.criado_em, p.expira_em,
               p.emails_cliente, p.cliente_mulher as mulher, (p.snapshot->'form'->>'modelo') as modelo, public._nicho(p) as nicho,
               e.status as pe_status, coalesce(e.enviados, '{}'::jsonb) as enviados, e.link as pe_link,
               public._follow(p) as follow, p.follow_em
          from public.propostas p left join public.proposta_emails e on e.lh = p.link_hash
         where not p.oculta and p.cancelada_em is null and p.excluida_em is null
           and coalesce(p.email,'') <> '' and p.link_hash is not null) x), '[]'::jsonb),
    'bloqueados', coalesce((select jsonb_agg(distinct em) from (
        select lower(trim(e.email)) em from public.proposta_emails e where e.status in ('fechada','descadastrada','pausada')
        union select lower(trim(p.email)) from public.propostas p
               where coalesce(p.email,'') <> '' and public._follow(p) in ('escolheu','fechou')
        union select s.email from public.email_supressao s) b), '[]'::jsonb),
    'suprimidos', coalesce((select jsonb_agg(s.email) from public.email_supressao s), '[]'::jsonb),
    'campanhas', coalesce((select jsonb_agg(jsonb_build_object('email', c.email, 'campanha', c.campanha, 'ano', c.ano, 'enviado_em', c.enviado_em))
                             from public.email_campanhas c), '[]'::jsonb),
    'falhas', coalesce((select jsonb_object_agg(chave, n) from (select chave, count(*) n from public.email_log
                         where modo = 'envio' and status = 'erro' and chave is not null group by chave) f), '{}'::jsonb),
    'enviados_hoje', (select count(*) from public.email_log where modo = 'envio' and tipo in ('lembrete','ultimo_aviso','campanha')
                       and status <> 'erro' and (criado_em at time zone 'America/Sao_Paulo')::date = hoje),
    'conteudo', coalesce((select v.dados - 'pagina' from public.conteudo_versoes v order by v.id desc limit 1), '{}'::jsonb)
  ) into r;
  return r;
end $$;

commit;
