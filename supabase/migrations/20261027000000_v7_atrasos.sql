-- =============================================================================
-- Adoração · v7: atrasos na presença
--
-- Novo status "atrasado" (a pessoa esteve, mas chegou depois do horário) e o horário em que
-- chegou. Pode rodar mais de uma vez. Quem pode marcar continua o mesmo da v2: cada um a sua,
-- o líder do ministério e o ministro do evento, todos.
-- =============================================================================

alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('confirmado', 'presente', 'atrasado', 'ausente'));

-- HH:mm (hora local do evento).
alter table public.attendance add column if not exists arrived_at text;
alter table public.attendance drop constraint if exists attendance_arrived_at_check;
alter table public.attendance add constraint attendance_arrived_at_check
  check (arrived_at is null or arrived_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
