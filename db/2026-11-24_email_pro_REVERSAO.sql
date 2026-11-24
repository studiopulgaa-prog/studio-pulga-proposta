-- Reversão de 2026-11-24_email_pro.sql: volta as funções de 24/11 (sequência) e remove o que foi adicionado.
-- ATENÇÃO: apaga o registro de envios (email_log) e a lista de suprimidos (email_supressao).
begin;
update public.proposta_emails set status = 'ativa' where status = 'pausada';
alter table public.proposta_emails drop constraint if exists proposta_emails_status_check;
alter table public.proposta_emails add constraint proposta_emails_status_check check (status in ('ativa','fechada','descadastrada','teste'));
-- funções voltam à versão de db/2026-11-24_sequencia_email.sql (seq_status, seq_dados, adm_listar) e de 23/11 (adm_email_reservar):
-- rode, NESTA ORDEM, depois deste arquivo: db/2026-11-24_sequencia_email.sql (é idempotente) e o trecho de adm_email_reservar de db/2026-11-23_envio_email.sql
drop function if exists public.email_suprimido(text, text);
drop function if exists public.log_registrar(text, jsonb);
drop function if exists public.webhook_evento(text, text, text, text, boolean, text);
drop function if exists public.adm_nicho(text, uuid, text);
drop function if exists public.adm_emails_painel(text);
drop function if exists public.adm_email_timeline(text, uuid);
drop function if exists public.email_resumo_dados(text, timestamptz);
drop function if exists public.adm_teste_espera(text);
drop table if exists public.email_log;
drop table if exists public.email_supressao;
commit;
-- _nicho e a coluna propostas.nicho ficam (inofensivas) até seq_dados/adm_listar voltarem; depois, se quiser:
-- drop function if exists public._nicho(public.propostas); alter table public.propostas drop column if exists nicho;
