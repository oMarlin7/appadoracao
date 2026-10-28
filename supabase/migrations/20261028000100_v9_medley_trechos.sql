-- =============================================================================
-- Adoração · v9: onde troca de música no medley
--
-- O trecho de cada música do medley: { "<id da música>": { "from": {"index", "label"},
-- "to": {"index", "label"} } }. Sem trecho, a música entra inteira. Pode rodar mais de uma vez.
-- =============================================================================

alter table public.songs add column if not exists medley_cuts jsonb;

alter table public.songs drop constraint if exists songs_medley_cuts_check;
alter table public.songs add constraint songs_medley_cuts_check
  check (medley_cuts is null or jsonb_typeof(medley_cuts) = 'object');
