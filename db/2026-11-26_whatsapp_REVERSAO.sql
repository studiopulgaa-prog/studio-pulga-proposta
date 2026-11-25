-- Reversão de db/2026-11-26_whatsapp.sql — remove SOMENTE o que aquele arquivo criou.
-- ATENÇÃO: apaga as conversas, contatos e histórico do WhatsApp. Faça um backup antes, se quiser guardar.
begin;
drop function if exists public.wa_get(text,text,jsonb,text,int);
drop function if exists public.wa_contar(text,text,jsonb);
drop function if exists public.wa_ins(text,text,jsonb,boolean);
drop function if exists public.wa_upd(text,text,jsonb,jsonb);
drop function if exists public.wa_del(text,text,jsonb);
drop function if exists public.wa_uso_somar(text,text,bigint,bigint,numeric);
drop function if exists public.wa_conversa_toque(text,uuid,boolean);
drop function if exists public._wa_where(jsonb);
drop function if exists public._wa_tabela_ok(text);
drop table if exists public.wa_mensagens, public.wa_conversas, public.wa_codigos, public.wa_contatos, public.wa_regua_envios,
  public.wa_config, public.wa_alertas, public.wa_uso_ia, public.wa_eventos, public.onboarding_senhas, public.wa_clientes;
commit;
