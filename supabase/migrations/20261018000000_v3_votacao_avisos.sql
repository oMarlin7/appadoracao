-- =============================================================================
-- Adoração · v3: tipos de evento, votação de músicas, avisos do líder e setlist do líder
--
-- Como usar: depois dos arquivos anteriores, cole este no SQL Editor → Run.
-- Pode rodar mais de uma vez sem problema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipo de evento (programação)
-- Apresentações: culto, festa, congresso, especial. Não contam como "próximo evento"
-- nem abrem votação: ensaio, reunião, confraternização.
-- -----------------------------------------------------------------------------

alter table public.services add column if not exists kind text not null default 'culto';
alter table public.services drop constraint if exists services_kind_check;
alter table public.services add constraint services_kind_check
  check (kind in ('culto', 'festa', 'congresso', 'especial', 'ensaio', 'reuniao', 'confraternizacao'));

-- Eventos antigos: deduz o tipo pelo título.
update public.services set kind = 'ensaio' where kind = 'culto' and (title ilike 'ensaio%' or title ilike 'passagem de som%');
update public.services set kind = 'reuniao' where kind = 'culto' and title ilike '%reuni%';
update public.services set kind = 'confraternizacao' where kind = 'culto' and title ilike '%confraterniza%';

-- -----------------------------------------------------------------------------
-- Como a equipe escolhe as músicas
-- -----------------------------------------------------------------------------

alter table public.team_settings add column if not exists selection_mode text not null default 'lider';
alter table public.team_settings drop constraint if exists team_settings_selection_mode_check;
alter table public.team_settings add constraint team_settings_selection_mode_check check (selection_mode in ('lider', 'votacao'));
alter table public.team_settings add column if not exists voting_picks integer not null default 2;
alter table public.team_settings drop constraint if exists team_settings_voting_picks_check;
alter table public.team_settings add constraint team_settings_voting_picks_check check (voting_picks between 1 and 5);
alter table public.team_settings add column if not exists timezone text not null default 'America/Sao_Paulo';

-- -----------------------------------------------------------------------------
-- Votação (uma por evento; sem linha aqui vale a regra semanal da equipe)
-- -----------------------------------------------------------------------------

create table if not exists public.song_polls (
  id text primary key references public.services (id) on delete cascade,
  mode text not null default 'votacao' check (mode in ('votacao', 'lider')),
  picks integer check (picks between 1 and 5),
  opens_at timestamptz,
  closes_at timestamptz,
  applied_at timestamptz,
  created_by text references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.votes (
  id text primary key,
  service_id text not null references public.services (id) on delete cascade,
  user_id text not null references public.profiles (id) on delete cascade,
  song_id text not null references public.songs (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (service_id, user_id, song_id)
);

create index if not exists votes_service_idx on public.votes (service_id);

-- -----------------------------------------------------------------------------
-- Avisos do líder (painel "Para você")
-- -----------------------------------------------------------------------------

create table if not exists public.announcements (
  id text primary key,
  title text not null,
  body text not null default '',
  icon text not null default 'megaphone',
  color text not null default 'lavender',
  -- vazio = equipe toda; 'user:<id>' = pessoa; 'role:<função>' = quem tem a função
  audience text[] not null default '{}',
  pinned boolean not null default false,
  ends_on date,
  created_by text references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Janela da votação
-- Regra semanal: o ensaio é a quinta antes do evento; a votação fecha no sábado 12h
-- anterior a esse ensaio e abre dois dias antes (quinta 12h). Para um culto de domingo:
-- abre na quinta 12h (10 dias antes) e fecha no sábado 12h (8 dias antes).
-- (A mesma regra está em src/lib/voting.ts.)
-- -----------------------------------------------------------------------------

create or replace function public.voting_window(
  sid text,
  out enabled boolean,
  out opens_at timestamptz,
  out closes_at timestamptz,
  out picks integer,
  out applied boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  svc public.services%rowtype;
  team public.team_settings%rowtype;
  poll public.song_polls%rowtype;
  dow integer;
  back integer;
  rehearsal date;
  tz text;
begin
  enabled := false;
  applied := false;
  select * into svc from public.services where id = sid;
  if not found or svc.kind not in ('culto', 'festa', 'congresso', 'especial') then
    return;
  end if;
  select * into team from public.team_settings where id = 'team';
  select * into poll from public.song_polls where id = sid;
  if coalesce(poll.mode, team.selection_mode, 'lider') <> 'votacao' then
    return;
  end if;
  tz := coalesce(team.timezone, 'America/Sao_Paulo');
  dow := extract(dow from svc.date)::integer;
  back := (dow - 4 + 7) % 7;
  if back = 0 then back := 7; end if;
  rehearsal := svc.date - back;
  enabled := true;
  picks := coalesce(poll.picks, team.voting_picks, 2);
  applied := poll.applied_at is not null;
  closes_at := coalesce(poll.closes_at, ((rehearsal - 5) + time '12:00') at time zone tz);
  opens_at := coalesce(poll.opens_at, ((rehearsal - 7) + time '12:00') at time zone tz);
end $$;

create or replace function public.voting_open(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(w.enabled and not w.applied and now() >= w.opens_at and now() < w.closes_at, false)
  from public.voting_window(sid) w
$$;

-- Cada membro vota em até N músicas (N = músicas escolhidas na votação).
create or replace function public.limit_votes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  max_picks integer;
begin
  select picks into max_picks from public.voting_window(new.service_id);
  if (select count(*) from public.votes where service_id = new.service_id and user_id = new.user_id) >= coalesce(max_picks, 0) then
    raise exception 'Você já usou todos os seus votos nesta votação';
  end if;
  return new;
end $$;

drop trigger if exists votes_limit on public.votes;
create trigger votes_limit before insert on public.votes for each row execute function public.limit_votes();
drop trigger if exists votes_owner on public.votes;
create trigger votes_owner before insert or update on public.votes for each row execute function public.keep_owner('user_id');

-- Só o líder escolhe as músicas do culto (a votação aplica o resultado por ele).
create or replace function public.protect_setlist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() or current_setting('adoracao.votacao', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if jsonb_array_length(coalesce(new.items, '[]'::jsonb)) > 0 then
      raise exception 'Somente o líder escolhe as músicas do culto';
    end if;
  elsif new.items is distinct from old.items then
    raise exception 'Somente o líder escolhe as músicas do culto';
  end if;
  return new;
end $$;

drop trigger if exists services_protect_setlist on public.services;
create trigger services_protect_setlist before insert or update on public.services
  for each row execute function public.protect_setlist();

-- Aceitar/recusar sugestões também é do líder.
create or replace function public.protect_suggestion_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() or current_setting('adoracao.votacao', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pendente';
  elsif new.status is distinct from old.status then
    raise exception 'Somente o líder aceita ou recusa sugestões';
  end if;
  return new;
end $$;

drop trigger if exists suggestions_protect_status on public.suggestions;
create trigger suggestions_protect_status before insert or update on public.suggestions
  for each row execute function public.protect_suggestion_status();

-- Fecha a votação: as mais votadas entram no setlist. Qualquer membro pode chamar depois do
-- prazo (assim o resultado entra mesmo que o líder não abra o app). Desempate: a sugestão
-- mais antiga. (Mesma ordem de src/lib/voting.ts.)
create or replace function public.aplicar_votacao(sid text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  w record;
  r record;
  new_items jsonb;
  added integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para continuar';
  end if;
  select * into w from public.voting_window(sid);
  if not w.enabled then
    raise exception 'Este evento não tem votação';
  end if;
  if w.applied then
    return 0;
  end if;
  if now() < w.closes_at then
    raise exception 'A votação ainda não terminou';
  end if;
  perform set_config('adoracao.votacao', 'on', true);
  select s.items into new_items from public.services s where s.id = sid for update;
  for r in
    select v.song_id, v.n
    from (select song_id, count(*) as n from public.votes where service_id = sid group by song_id) v
    left join (select song_id, min(created_at) as first_at from public.suggestions where service_id = sid group by song_id) sg
      using (song_id)
    order by v.n desc, sg.first_at asc nulls last, v.song_id
    limit w.picks
  loop
    if not exists (select 1 from jsonb_array_elements(new_items) it where it ->> 'songId' = r.song_id) then
      new_items := new_items || jsonb_build_array(jsonb_build_object(
        'id', 'votacao-' || r.song_id,
        'songId', r.song_id,
        'key', (select coalesce(team_key, original_key) from public.songs where id = r.song_id),
        'moment', null,
        'notes', 'Escolhida na votação'
      ));
      added := added + 1;
    end if;
    update public.suggestions set status = 'aceita' where service_id = sid and song_id = r.song_id;
  end loop;
  update public.services set items = new_items where id = sid;
  insert into public.song_polls (id, mode, applied_at) values (sid, 'votacao', now())
    on conflict (id) do update set applied_at = now();
  return added;
end $$;

revoke all on function public.aplicar_votacao(text) from public;
grant execute on function public.aplicar_votacao(text) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['song_polls', 'announcements'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

drop trigger if exists song_polls_owner on public.song_polls;
create trigger song_polls_owner before insert or update on public.song_polls for each row execute function public.keep_owner('created_by');
drop trigger if exists announcements_owner on public.announcements;
create trigger announcements_owner before insert or update on public.announcements for each row execute function public.keep_owner('created_by');

-- -----------------------------------------------------------------------------
-- Segurança por linha (RLS)
-- -----------------------------------------------------------------------------

alter table public.song_polls enable row level security;
alter table public.votes enable row level security;
alter table public.announcements enable row level security;

drop policy if exists "votação: equipe vê" on public.song_polls;
create policy "votação: equipe vê" on public.song_polls for select to authenticated using (true);
drop policy if exists "votação: líder configura" on public.song_polls;
create policy "votação: líder configura" on public.song_polls for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Votos são abertos (a equipe vê quem votou em quê, como numa enquete do grupo).
drop policy if exists "votos: equipe vê" on public.votes;
create policy "votos: equipe vê" on public.votes for select to authenticated using (true);
drop policy if exists "votos: votar" on public.votes;
create policy "votos: votar" on public.votes for insert to authenticated
  with check (
    user_id = auth.uid()::text
    and public.voting_open(service_id)
    and exists (
      select 1 from public.suggestions s
      where s.service_id = votes.service_id and s.song_id = votes.song_id and s.status <> 'recusada'
    )
  );
drop policy if exists "votos: tirar o voto" on public.votes;
create policy "votos: tirar o voto" on public.votes for delete to authenticated
  using (user_id = auth.uid()::text and public.voting_open(service_id));

-- Avisos: cada um vê os que são para si; o líder vê e gerencia todos.
create or replace function public.announcement_for_me(audience text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(array_length(audience, 1), 0) = 0
    or ('user:' || auth.uid()::text) = any (audience)
    or exists (
      select 1 from public.profiles p, unnest(p.functions) f
      where p.id = auth.uid()::text and ('role:' || f) = any (audience)
    )
$$;

drop policy if exists "avisos: para mim" on public.announcements;
create policy "avisos: para mim" on public.announcements for select to authenticated
  using (public.announcement_for_me(audience) or public.is_admin());
drop policy if exists "avisos: líder publica" on public.announcements;
create policy "avisos: líder publica" on public.announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Tempo real
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['song_polls', 'votes', 'announcements'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
