-- =============================================================================
-- Adoração · v8: medley
--
-- Um medley é uma música como as outras (entra no setlist, na votação e nas playlists), feita
-- de duas ou mais músicas tocadas em sequência. A cifra não fica no medley: o app junta a de
-- cada parte, na ordem desta lista. Pode rodar mais de uma vez.
-- =============================================================================

alter table public.songs add column if not exists medley_ids text[];

alter table public.songs drop constraint if exists songs_medley_ids_check;
alter table public.songs add constraint songs_medley_ids_check
  check (medley_ids is null or cardinality(medley_ids) between 1 and 20);
