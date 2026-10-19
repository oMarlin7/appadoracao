-- =============================================================================
-- Adoração · v6: agendador das notificações
--
-- A cada minuto o banco chama a função notificar (endereço em push_config.function_url) com o
-- segredo de push_config. A função confere escala, votação, setlist, ensaio e avisos e envia só
-- o que for novo. Para outro projeto, troque push_config.function_url pelo endereço da função.
-- =============================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.disparar_notificacoes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.push_config;
begin
  select * into c from public.push_config where id = 1;
  if c.function_url is null then
    return;
  end if;
  perform net.http_post(
    url := c.function_url,
    body := '{"action":"rodada"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', c.cron_secret),
    timeout_milliseconds := 55000
  );
end $$;

revoke execute on function public.disparar_notificacoes() from public, anon, authenticated;

-- Mesmo nome = atualiza o agendamento existente.
select cron.schedule('adoracao-notificacoes', '* * * * *', $$ select public.disparar_notificacoes() $$);
