-- E-mails "pro" (24/11/2026): registro de cada envio, supressão automática (webhook do Resend), nicho, pausa,
-- painel e resumo semanal. Só ADIÇÕES (nada é apagado). Reversão: db/2026-11-24_email_pro_REVERSAO.sql
begin;

-- 1) Nicho da proposta (Arquiteto/Designer | Loja | Outro). Vazio = automático (modelo Loja = loja; resto = arquiteto)
alter table public.propostas add column if not exists nicho text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'propostas_nicho_check') then
    alter table public.propostas add constraint propostas_nicho_check check (nicho is null or nicho in ('arquiteto','loja','outro'));
  end if;
end $$;

-- 2) "Pausar e-mails desta proposta": novo status permitido na sequência (os antigos continuam valendo)
alter table public.proposta_emails drop constraint if exists proposta_emails_status_check;
alter table public.proposta_emails add constraint proposta_emails_status_check
  check (status in ('ativa','fechada','descadastrada','teste','pausada'));

-- 3) Registro de cada e-mail (enviado, simulado, teste, resumo) e o status que o Resend devolve
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  modo text not null default 'envio',          -- envio | simulacao | teste | interno
  tipo text not null default '',               -- link | lembrete | ultimo_aviso | campanha | teste | resumo | escolha | link_antigo | aviso_limite
  chave text,                                   -- ex.: seq:<lh>:lembrete | camp:<email>:<id>:<ano>
  lh text, proposta_id uuid, email text, assunto text, campanha text,
  status text not null default 'enviado',      -- enviado | entregue | atrasado | rejeitado | spam | erro | simulado | aviso
  resend_id text unique,
  erro text
);
create index if not exists email_log_criado_idx on public.email_log (criado_em desc);
create index if not exists email_log_lh_idx on public.email_log (lh);
create unique index if not exists email_log_simulado_uq on public.email_log (chave) where status = 'simulado';
alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;

-- 4) Contatos bloqueados para sempre (rejeição definitiva ou "marcar como spam")
create table if not exists public.email_supressao (
  email text primary key,
  motivo text not null,                         -- rejeitado | spam
  detalhe text,
  criado_em timestamptz not null default now()
);
alter table public.email_supressao enable row level security;
revoke all on public.email_supressao from anon, authenticated;

-- ===== funções (todas exigem o segredo) =====
create or replace function public.email_suprimido(p_secret text, p_email text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  return exists (select 1 from public.email_supressao where email = lower(trim(coalesce(p_email,''))));
end $$;

create or replace function public.log_registrar(p_secret text, p_d jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v uuid; st text := coalesce(p_d->>'status','enviado');
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if st = 'simulado' and coalesce(p_d->>'chave','') <> '' then
    insert into public.email_log(modo,tipo,chave,lh,proposta_id,email,assunto,campanha,status)
      values (coalesce(p_d->>'modo','simulacao'), coalesce(p_d->>'tipo',''), p_d->>'chave', p_d->>'lh', nullif(p_d->>'proposta_id','')::uuid,
              lower(trim(p_d->>'email')), left(p_d->>'assunto',300), p_d->>'campanha', 'simulado')
    on conflict (chave) where status = 'simulado' do update set atualizado_em = now()
    returning id into v;
    return v;
  end if;
  if coalesce(p_d->>'resend_id','') <> '' then
    insert into public.email_log(modo,tipo,chave,lh,proposta_id,email,assunto,campanha,status,resend_id,erro)
      values (coalesce(p_d->>'modo','envio'), coalesce(p_d->>'tipo',''), p_d->>'chave', p_d->>'lh', nullif(p_d->>'proposta_id','')::uuid,
              lower(trim(p_d->>'email')), left(p_d->>'assunto',300), p_d->>'campanha', st, p_d->>'resend_id', left(p_d->>'erro',300))
    on conflict (resend_id) do update set modo = excluded.modo, tipo = excluded.tipo, chave = excluded.chave, lh = excluded.lh,
      proposta_id = excluded.proposta_id, email = coalesce(public.email_log.email, excluded.email), assunto = excluded.assunto,
      campanha = excluded.campanha, atualizado_em = now()          -- o status que o webhook já gravou é mantido
    returning id into v;
    return v;
  end if;
  insert into public.email_log(modo,tipo,chave,lh,proposta_id,email,assunto,campanha,status,erro)
    values (coalesce(p_d->>'modo','envio'), coalesce(p_d->>'tipo',''), p_d->>'chave', p_d->>'lh', nullif(p_d->>'proposta_id','')::uuid,
            lower(trim(p_d->>'email')), left(p_d->>'assunto',300), p_d->>'campanha', st, left(p_d->>'erro',300))
  returning id into v;
  return v;
end $$;

-- evento do webhook do Resend: atualiza o status do envio e suprime rejeição definitiva / spam
create or replace function public.webhook_evento(p_secret text, p_resend_id text, p_evento text, p_email text, p_suprimir boolean, p_detalhe text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare novo text; rank_novo int; em text := lower(trim(coalesce(p_email,'')));
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  novo := case p_evento when 'email.delivered' then 'entregue' when 'email.delivery_delayed' then 'atrasado'
                        when 'email.bounced' then 'rejeitado' when 'email.complained' then 'spam' else null end;
  if novo is null then return jsonb_build_object('ok', true, 'ignorado', true); end if;
  rank_novo := case novo when 'atrasado' then 1 when 'entregue' then 2 when 'rejeitado' then 3 when 'spam' then 4 end;
  if coalesce(p_resend_id,'') <> '' then
    insert into public.email_log(modo, tipo, email, status, resend_id, erro)
      values ('envio', '', nullif(em,''), novo, p_resend_id, left(p_detalhe,300))
    on conflict (resend_id) do update set
      status = case when (case public.email_log.status when 'atrasado' then 1 when 'entregue' then 2 when 'rejeitado' then 3 when 'spam' then 4 else 0 end) < rank_novo
                    then novo else public.email_log.status end,
      erro = coalesce(left(p_detalhe,300), public.email_log.erro), atualizado_em = now();
  end if;
  if p_suprimir and em <> '' and novo in ('rejeitado','spam') then
    insert into public.email_supressao(email, motivo, detalhe) values (em, novo, left(p_detalhe,300))
    on conflict (email) do update set motivo = case when excluded.motivo = 'spam' then 'spam' else public.email_supressao.motivo end;
  end if;
  return jsonb_build_object('ok', true, 'status', novo);
end $$;

create or replace function public.adm_nicho(p_secret text, p_id uuid, p_nicho text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_nicho not in ('arquiteto','loja','outro') then raise exception 'nicho invalido'; end if;
  update public.propostas set nicho = p_nicho, atualizado_em = now() where id = p_id;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end $$;

-- "Pausar" entra como status aceito (não reativa quem se descadastrou)
create or replace function public.seq_status(p_secret text, p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare p public.propostas%rowtype; atual text;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_status not in ('fechada','ativa','pausada') then raise exception 'status invalido'; end if;
  select * into p from public.propostas where id = p_id;
  if not found or p.link_hash is null then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;
  select status into atual from public.proposta_emails where lh = p.link_hash;
  if atual = 'descadastrada' then return jsonb_build_object('ok', false, 'motivo', 'descadastrada'); end if;
  insert into public.proposta_emails(lh, email, cliente, link, status)
    values (p.link_hash, lower(trim(coalesce(p.email,''))), p.cliente, coalesce(p.snapshot->>'link',''), p_status)
  on conflict (lh) do update set status = p_status, atualizado_em = now();
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- nicho efetivo (o escolhido ou o automático)
create or replace function public._nicho(p public.propostas)
returns text language sql immutable set search_path to 'public' as $$
  select coalesce(p.nicho, case when p.snapshot->'form'->>'modelo' = 'loja' then 'loja' else 'arquiteto' end)
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

-- envio manual: recusa contato suprimido e devolve também o link_hash (para o descadastro em 1 clique)
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

-- painel "E-mails": últimos envios, suprimidos e contador do mês
create or replace function public.adm_emails_painel(p_secret text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb; mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select jsonb_build_object(
    'log', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select l.criado_em, l.modo, l.tipo, l.email, l.assunto, l.status, l.erro, l.campanha, l.lh,
               (select p.cliente from public.propostas p where p.link_hash = l.lh order by p.criado_em desc limit 1) as cliente
          from public.email_log l where l.tipo <> 'aviso_limite' order by l.criado_em desc limit 80) x), '[]'::jsonb),
    'suprimidos', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select s.email, s.motivo, s.criado_em from public.email_supressao s
        union all
        select distinct on (lower(trim(e.email))) lower(trim(e.email)), 'descadastro', e.atualizado_em
          from public.proposta_emails e where e.status = 'descadastrada' and coalesce(e.email,'') <> ''
        order by 3 desc limit 100) x), '[]'::jsonb),
    'mes', (select jsonb_build_object(
        'enviados', count(*) filter (where modo = 'envio' and status in ('enviado','entregue','atrasado','rejeitado','spam')),
        'entregues', count(*) filter (where modo = 'envio' and status = 'entregue'),
        'rejeitados', count(*) filter (where modo = 'envio' and status = 'rejeitado'),
        'spam', count(*) filter (where modo = 'envio' and status = 'spam'),
        'erros', count(*) filter (where modo = 'envio' and status = 'erro'),
        'simulados', count(*) filter (where status = 'simulado'),
        'testes', count(*) filter (where modo = 'teste'))
      from public.email_log where criado_em >= mes)
  ) into r;
  return r;
end $$;

-- linha do tempo de uma proposta
create or replace function public.adm_email_timeline(p_secret text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare p public.propostas%rowtype; r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select * into p from public.propostas where id = p_id;
  if not found then return null; end if;
  select jsonb_build_object(
    'id', p.id, 'cliente', p.cliente, 'email', p.email, 'lh', p.link_hash, 'nicho', public._nicho(p), 'nicho_auto', p.nicho is null,
    'mulher', p.cliente_mulher, 'expira_em', p.expira_em, 'enviado_em', p.enviado_em,
    'seq_status', (select e.status from public.proposta_emails e where e.lh = p.link_hash),
    'enviados', (select e.enviados from public.proposta_emails e where e.lh = p.link_hash),
    'suprimido', exists (select 1 from public.email_supressao s where s.email = lower(trim(p.email))),
    'log', coalesce((select jsonb_agg(to_jsonb(x) order by x.criado_em) from (
        select l.criado_em, l.modo, l.tipo, l.assunto, l.status, l.erro, l.campanha from public.email_log l
         where (l.lh = p.link_hash or l.proposta_id = p.id) and l.tipo <> 'aviso_limite') x), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- resumo semanal: números desde p_desde
create or replace function public.email_resumo_dados(p_secret text, p_desde timestamptz)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select jsonb_build_object(
    'enviados', count(*) filter (where modo = 'envio' and status in ('enviado','entregue','atrasado','rejeitado','spam')),
    'entregues', count(*) filter (where modo = 'envio' and status = 'entregue'),
    'rejeitados', count(*) filter (where modo = 'envio' and status = 'rejeitado'),
    'spam', count(*) filter (where modo = 'envio' and status = 'spam'),
    'erros', count(*) filter (where modo = 'envio' and status = 'erro'),
    'simulados', coalesce((select jsonb_agg(jsonb_build_object('em', s.criado_em, 'email', s.email, 'tipo', s.tipo, 'campanha', s.campanha) order by s.criado_em)
                  from public.email_log s where s.status = 'simulado' and s.atualizado_em >= p_desde), '[]'::jsonb),
    'avisos_limite', coalesce((select jsonb_agg(jsonb_build_object('em', a.criado_em, 'detalhe', a.erro) order by a.criado_em)
                  from public.email_log a where a.tipo = 'aviso_limite' and a.criado_em >= p_desde), '[]'::jsonb),
    'descadastros', (select count(*) from public.proposta_emails e where e.status = 'descadastrada' and e.atualizado_em >= p_desde),
    'suprimidos', (select count(*) from public.email_supressao s where s.criado_em >= p_desde),
    'ja_enviado_hoje', exists (select 1 from public.email_log x where x.tipo = 'resumo' and x.status <> 'erro'
                        and (x.criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date)
  ) into r from public.email_log where criado_em >= p_desde;
  return r;
end $$;

-- "Enviar teste para mim": segundos desde o último teste (limite anti-clique repetido)
create or replace function public.adm_teste_espera(p_secret text)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
declare t timestamptz;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select max(criado_em) into t from public.email_log where modo = 'teste';
  if t is null then return 0; end if;
  return greatest(0, ceil(10 - extract(epoch from (now() - t)))::int);
end $$;

commit;
