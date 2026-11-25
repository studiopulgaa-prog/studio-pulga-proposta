-- Reversão de db/2026-11-25_admin_ajustes.sql
-- Atenção: propostas marcadas como 'construtora' voltam a "sem nicho" (a regra antiga não aceita esse valor).
begin;
drop trigger if exists acessos_evento on public.acessos;
drop function if exists public._evento_de_acesso();
drop function if exists public.adm_eventos(text, uuid, int);
drop function if exists public.adm_atividades(text, int);
drop function if exists public.adm_listar2(text, int, text, text, text, text, boolean);
drop function if exists public.adm_nicho_confirmar(text, uuid, text);
drop table if exists public.proposta_eventos;
update public.propostas set nicho = null where nicho = 'construtora';
alter table public.propostas drop constraint if exists propostas_nicho_check;
alter table public.propostas add constraint propostas_nicho_check check (nicho is null or nicho in ('arquiteto','loja','outro'));
alter table public.propostas drop column if exists nicho_ok;
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
commit;
