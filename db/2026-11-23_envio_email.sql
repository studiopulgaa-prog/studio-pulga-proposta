-- E-mail "Sua proposta" (Resend): registro do envio na proposta + limite de 1 envio por proposta a cada 60 s.
-- Só ADICIONA: 3 colunas (nulas) e 2 funções; reescreve adm_listar apenas para devolver 2 campos a mais. Nada é apagado.
begin;

alter table public.propostas
  add column if not exists enviado_em timestamptz,          -- último envio com sucesso
  add column if not exists envio_erro text,                 -- motivo da última falha (some no próximo sucesso)
  add column if not exists envio_tentativa_em timestamptz;  -- reserva atômica do limite de 60 s

-- reserva a vaga de envio (atômica): recusa se a proposta não existe, está oculta, expirada, sem e-mail, sem link ou se houve tentativa nos últimos 60 s
create or replace function public.adm_email_reservar(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare p public.propostas%rowtype; n int; s text;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select * into p from public.propostas where id = p_id;
  if not found or p.oculta then return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada'); end if;
  if p.expira_em <= now() then return jsonb_build_object('ok', false, 'motivo', 'expirada'); end if;
  if coalesce(p.email, '') = '' then return jsonb_build_object('ok', false, 'motivo', 'sem_email'); end if;
  if coalesce(p.snapshot->>'link', '') = '' then return jsonb_build_object('ok', false, 'motivo', 'sem_link'); end if;
  update public.propostas set envio_tentativa_em = now()
   where id = p_id and (envio_tentativa_em is null or envio_tentativa_em <= now() - interval '60 seconds');
  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'limite',
      'espera_s', greatest(1, ceil(extract(epoch from (p.envio_tentativa_em + interval '60 seconds' - now())))::int));
  end if;
  select slug into s from public.links where url = p.snapshot->>'link' order by criado_em desc limit 1;
  return jsonb_build_object('ok', true, 'cliente', p.cliente, 'email', p.email, 'expira_em', p.expira_em,
    'tipo', p.tipo, 'link', p.snapshot->>'link', 'slug', s, 'enviado_em', p.enviado_em);
end $$;

-- grava o resultado do envio na proposta
create or replace function public.adm_email_resultado(p_secret text, p_id uuid, p_ok boolean, p_erro text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare t timestamptz;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  if p_ok then
    update public.propostas set enviado_em = now(), envio_erro = null where id = p_id returning enviado_em into t;
  else
    update public.propostas set envio_erro = left(coalesce(nullif(p_erro, ''), 'erro'), 300) where id = p_id returning enviado_em into t;
  end if;
  return jsonb_build_object('enviado_em', t);
end $$;

-- a lista passa a devolver enviado_em e envio_erro (resto idêntico ao adm_listar atual)
create or replace function public.adm_listar(p_secret text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not public._email_ok(p_secret) then raise exception 'nao autorizado'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc), '[]'::jsonb) into r from (
    select p.id, p.cliente, p.v1, p.v2, p.v3, p.planos, p.validade, p.criado_em, p.link_hash, p.expira_em,
      p.tipo, p.email, p.atualizado_em, (p.snapshot is not null) as tem_snapshot,
      p.enviado_em, p.envio_erro,
      case when p.expira_em <= now() then 'expirada' else 'ativa' end as status,
      (select count(*) from public.acessos a where a.proposta_id = p.link_hash) as ac,
      (select count(distinct a.dispositivo_hash) from public.acessos a
        where a.proposta_id = p.link_hash and a.dispositivo_hash like 'd2\_%') as dv
    from public.propostas p where not p.oculta order by p.criado_em desc limit 50) x;
  return r;
end $$;

commit;
