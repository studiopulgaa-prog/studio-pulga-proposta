-- Sequência de e-mails da proposta + e-mails sazonais (24/11/2026). Só ADIÇÕES; nada é apagado.
-- Reversão: db/2026-11-24_sequencia_email_REVERSAO.sql
begin;

-- 1) "Cliente mulher" (opcional, padrão desmarcada): a campanha do Dia da Mulher só vai para as marcadas
alter table public.propostas add column if not exists cliente_mulher boolean not null default false;

-- 2) Registro de cada e-mail sazonal por contato (e-mail). A chave primária impede enviar o mesmo e-mail duas vezes.
create table if not exists public.email_campanhas (
  email text not null,
  campanha text not null,
  ano integer not null,
  lh text,
  enviado_em timestamptz not null default now(),
  primary key (email, campanha, ano)
);
alter table public.email_campanhas enable row level security;   -- sem policy: só as funções abaixo (com segredo) mexem
revoke all on public.email_campanhas from anon, authenticated;

-- 3) Funções (todas exigem o segredo, como as demais)
create or replace function public.adm_mulher(p_secret text, p_id uuid, p_valor boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  update public.propostas set cliente_mulher = coalesce(p_valor, false), atualizado_em = now() where id = p_id;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end $$;

-- marca a proposta como fechada/ativa na sequência (cria o registro se ainda não existir). Não reativa quem se descadastrou.
create or replace function public.seq_status(p_secret text, p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare p public.propostas%rowtype; atual text;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_status not in ('fechada','ativa') then raise exception 'status invalido'; end if;
  select * into p from public.propostas where id = p_id;
  if not found or p.link_hash is null then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;
  select status into atual from public.proposta_emails where lh = p.link_hash;
  if atual = 'descadastrada' then return jsonb_build_object('ok', false, 'motivo', 'descadastrada'); end if;
  insert into public.proposta_emails(lh, email, cliente, link, status)
    values (p.link_hash, lower(trim(coalesce(p.email,''))), p.cliente, coalesce(p.snapshot->>'link',''), p_status)
  on conflict (lh) do update set status = p_status, atualizado_em = now();
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- depois que o e-mail com o link sai pelo botão do admin: registra na sequência (para os lembretes valerem)
create or replace function public.seq_registrar_link(p_secret text, p_id uuid, p_link text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare p public.propostas%rowtype;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select * into p from public.propostas where id = p_id;
  if not found or p.link_hash is null or coalesce(p.email,'') = '' then return jsonb_build_object('ok', false); end if;
  insert into public.proposta_emails(lh, email, cliente, link, status, enviados)
    values (p.link_hash, lower(trim(p.email)), p.cliente, p_link, 'ativa',
            jsonb_build_object('link', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')))
  on conflict (lh) do update set email = excluded.email, cliente = excluded.cliente, link = excluded.link,
    enviados = case when public.proposta_emails.enviados ? 'link' then public.proposta_emails.enviados
                    else public.proposta_emails.enviados || excluded.enviados end,
    atualizado_em = now();
  return jsonb_build_object('ok', true, 'lh', p.link_hash);
end $$;

-- tudo que o cron precisa ler, de uma vez (propostas visíveis com e-mail + o registro de e-mails + campanhas já enviadas)
create or replace function public.seq_dados(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select jsonb_build_object(
    'propostas', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select p.id, p.link_hash as lh, lower(trim(p.email)) as email, p.cliente, p.tipo, p.criado_em, p.expira_em,
               p.emails_cliente, p.cliente_mulher as mulher, (p.snapshot->'form'->>'modelo') as modelo,
               e.status as pe_status, coalesce(e.enviados, '{}'::jsonb) as enviados, e.link as pe_link
          from public.propostas p left join public.proposta_emails e on e.lh = p.link_hash
         where not p.oculta and coalesce(p.email,'') <> '' and p.link_hash is not null) x), '[]'::jsonb),
    'bloqueados', coalesce((select jsonb_agg(distinct em) from (
        select lower(trim(e.email)) em from public.proposta_emails e where e.status in ('fechada','descadastrada')
        union
        select lower(trim(p.email)) from public.propostas p where p.emails_cliente > 0 and coalesce(p.email,'') <> '') b), '[]'::jsonb),
    'campanhas', coalesce((select jsonb_agg(jsonb_build_object('email', c.email, 'campanha', c.campanha, 'ano', c.ano, 'enviado_em', c.enviado_em))
                             from public.email_campanhas c), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- reserva atômica de um e-mail da proposta (lembrete / último aviso). Devolve false se já foi reservado/enviado.
create or replace function public.seq_reservar(p_secret text, p_lh text, p_tipo text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_tipo not in ('lembrete','ultimo_aviso') then raise exception 'tipo invalido'; end if;
  update public.proposta_emails
     set enviados = enviados || jsonb_build_object(p_tipo, to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')), atualizado_em = now()
   where lh = p_lh and status = 'ativa' and not (enviados ? p_tipo);
  get diagnostics n = row_count;
  return n > 0;
end $$;
create or replace function public.seq_liberar(p_secret text, p_lh text, p_tipo text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_tipo not in ('lembrete','ultimo_aviso') then raise exception 'tipo invalido'; end if;
  update public.proposta_emails set enviados = enviados - p_tipo, atualizado_em = now() where lh = p_lh;
end $$;

-- reserva atômica de uma campanha para um contato; também garante o registro da proposta (para o descadastro funcionar)
create or replace function public.seq_reservar_campanha(p_secret text, p_email text, p_campanha text, p_ano integer, p_lh text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  insert into public.proposta_emails(lh, email, cliente, link)
    select p.link_hash, lower(trim(p.email)), p.cliente, coalesce(p.snapshot->>'link','') from public.propostas p
     where p.link_hash = p_lh and coalesce(p.email,'') <> ''
  on conflict (lh) do nothing;
  insert into public.email_campanhas(email, campanha, ano, lh) values (lower(trim(p_email)), p_campanha, p_ano, p_lh)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;
create or replace function public.seq_liberar_campanha(p_secret text, p_email text, p_campanha text, p_ano integer)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  delete from public.email_campanhas where email = lower(trim(p_email)) and campanha = p_campanha and ano = p_ano;
end $$;

-- descadastro por contato: cria o registro se faltar e bloqueia todas as propostas do mesmo e-mail
create or replace function public.seq_descadastrar(p_secret text, p_lh text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare em text;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  insert into public.proposta_emails(lh, email, cliente, link)
    select p.link_hash, lower(trim(p.email)), p.cliente, coalesce(p.snapshot->>'link','') from public.propostas p
     where p.link_hash = p_lh and coalesce(p.email,'') <> ''
  on conflict (lh) do nothing;
  select email into em from public.proposta_emails where lh = p_lh;
  if em is null then return jsonb_build_object('ok', false); end if;
  update public.proposta_emails set status = 'descadastrada', atualizado_em = now() where lh = p_lh or lower(trim(email)) = em;
  return jsonb_build_object('ok', true);
end $$;

-- Histórico: devolve também "cliente mulher" e o status da sequência (fechada etc.)
create or replace function public.adm_listar(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc), '[]'::jsonb) into r from (
    select p.id, p.cliente, p.v1, p.v2, p.v3, p.planos, p.validade, p.criado_em, p.link_hash, p.expira_em,
      p.tipo, p.email, p.atualizado_em, (p.snapshot is not null) as tem_snapshot,
      p.enviado_em, p.envio_erro, p.cliente_mulher,
      (select e.status from public.proposta_emails e where e.lh = p.link_hash) as seq_status,
      case when p.expira_em <= now() then 'expirada' else 'ativa' end as status,
      (select count(*) from public.acessos a where a.proposta_id = p.link_hash) as ac,
      (select count(distinct a.dispositivo_hash) from public.acessos a
        where a.proposta_id = p.link_hash and a.dispositivo_hash like 'd2\_%') as dv
    from public.propostas p where not p.oculta order by p.criado_em desc limit 50) x;
  return r;
end $$;

commit;
