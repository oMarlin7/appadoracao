-- =============================================================================
-- Adoração · v10: votos por pessoa separados das músicas escolhidas
--
-- Antes, cada pessoa votava em tantas músicas quantas entravam no setlist. Agora são dois
-- números: quantas músicas a votação escolhe (voting_picks / picks, como antes) e em quantas
-- cada pessoa pode votar (voting_votes / max_votes). Ex.: cada um vota em 3, entra 1.
-- Sem votos definidos, vale o número de músicas (o comportamento de antes).
-- Pode rodar mais de uma vez.
-- =============================================================================

alter table public.team_settings add column if not exists voting_votes integer;
alter table public.team_settings drop constraint if exists team_settings_voting_votes_check;
alter table public.team_settings add constraint team_settings_voting_votes_check check (voting_votes between 1 and 20);

alter table public.song_polls add column if not exists max_votes integer;
alter table public.song_polls drop constraint if exists song_polls_max_votes_check;
alter table public.song_polls add constraint song_polls_max_votes_check check (max_votes between 1 and 20);

-- Em quantas músicas cada pessoa pode votar neste evento.
create or replace function public.voting_votes(sid text) returns integer
language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select p.max_votes from public.song_polls p where p.id = sid),
    (select t.voting_votes from public.team_settings t where t.id = 'team'),
    (select w.picks from public.voting_window(sid) w),
    2
  )
$$;

revoke execute on function public.voting_votes(text) from public, anon;
grant execute on function public.voting_votes(text) to authenticated;

-- Reenviar o mesmo voto (ex.: depois de cair a internet) não conta como voto a mais.
create or replace function public.limit_votes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  max_votes integer;
begin
  max_votes := public.voting_votes(new.service_id);
  if (select count(*) from public.votes where service_id = new.service_id and user_id = new.user_id and id <> new.id) >= coalesce(max_votes, 0) then
    raise exception 'Você já usou todos os seus votos nesta votação';
  end if;
  return new;
end $$;

revoke execute on function public.limit_votes() from public, anon, authenticated;
