-- =============================================================================
-- Adoração · v5: salvar o próprio perfil, votação encerrada pelo líder, avisos lidos e
-- excluídos (em todos os aparelhos) e quantidade livre de músicas na votação
--
-- Como usar: depois dos arquivos anteriores, cole este no SQL Editor → Run.
-- Pode rodar mais de uma vez sem problema.
--
-- O app salva cada linha com "insert … on conflict do update". Para o Postgres isso passa
-- pelas regras de INSERT mesmo quando a linha já existe — por isso as regras abaixo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Perfis: cada um salva o seu (o papel continua sendo coisa do líder)
-- -----------------------------------------------------------------------------

create or replace function public.guard_profile_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.role := coalesce((select p.role from public.profiles p where p.id = new.id), 'member');
  return new;
end $$;

create or replace trigger profiles_guard_insert before insert on public.profiles
  for each row execute function public.guard_profile_insert();

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'perfis: salvar o seu') then
    create policy "perfis: salvar o seu" on public.profiles for insert to authenticated
      with check (id = (select auth.uid())::text or public.is_admin());
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Eventos e sugestões: salvar uma linha que já existe segue a regra da alteração
-- -----------------------------------------------------------------------------

create or replace function public.protect_setlist() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  current_items jsonb;
begin
  if auth.uid() is null or public.is_admin() or current_setting('adoracao.votacao', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    select s.items into current_items from public.services s where s.id = new.id;
    if found then
      if new.items is distinct from current_items then
        raise exception 'Somente o líder escolhe as músicas do culto';
      end if;
    elsif jsonb_array_length(coalesce(new.items, '[]'::jsonb)) > 0 then
      raise exception 'Somente o líder escolhe as músicas do culto';
    end if;
  elsif new.items is distinct from old.items then
    raise exception 'Somente o líder escolhe as músicas do culto';
  end if;
  return new;
end $$;

create or replace function public.protect_suggestion_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() or current_setting('adoracao.votacao', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Sugestão nova começa pendente; ao salvar uma que já existe, o status fica como está.
    new.status := coalesce((select s.status from public.suggestions s where s.id = new.id), 'pendente');
  elsif new.status is distinct from old.status then
    raise exception 'Somente o líder aceita ou recusa sugestões';
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Votação
-- -----------------------------------------------------------------------------

-- Reenviar o mesmo voto (ex.: depois de cair a internet) não conta como voto a mais.
create or replace function public.limit_votes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  max_picks integer;
begin
  select picks into max_picks from public.voting_window(new.service_id);
  if (select count(*) from public.votes where service_id = new.service_id and user_id = new.user_id and id <> new.id) >= coalesce(max_picks, 0) then
    raise exception 'Você já usou todos os seus votos nesta votação';
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'votes' and policyname = 'votos: salvar o seu') then
    create policy "votos: salvar o seu" on public.votes for update to authenticated
      using (user_id = (select auth.uid())::text)
      with check (user_id = (select auth.uid())::text and public.voting_open(service_id));
  end if;
end $$;

-- O líder pode encerrar a votação e levar o resultado para o setlist na hora; depois do
-- prazo, qualquer membro pode (assim o resultado entra mesmo sem o líder abrir o app).
create or replace function public.aplicar_votacao(sid text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  w record;
  r record;
  new_items jsonb;
  added integer := 0;
  early boolean;
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
  early := now() < w.closes_at;
  if early and not public.is_admin() then
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
  insert into public.song_polls (id, mode, applied_at, closes_at)
    values (sid, 'votacao', now(), case when early then now() end)
    on conflict (id) do update
      set applied_at = now(),
          closes_at = case when early then now() else public.song_polls.closes_at end;
  return added;
end $$;

-- Quantidade de músicas escolhidas na votação: o líder decide (de 1 a 20).
alter table public.team_settings drop constraint if exists team_settings_voting_picks_check;
alter table public.team_settings add constraint team_settings_voting_picks_check check (voting_picks between 1 and 20);
alter table public.song_polls drop constraint if exists song_polls_picks_check;
alter table public.song_polls add constraint song_polls_picks_check check (picks between 1 and 20);

-- -----------------------------------------------------------------------------
-- Avisos lidos e excluídos de cada membro (iguais no celular e no computador)
-- -----------------------------------------------------------------------------

create table if not exists public.inbox_state (
  id text primary key references public.profiles (id) on delete cascade,
  dismissed text[] not null default '{}',
  seen text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.inbox_state enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inbox_state' and policyname = 'avisos lidos: só o dono') then
    create policy "avisos lidos: só o dono" on public.inbox_state for all to authenticated
      using (id = (select auth.uid())::text) with check (id = (select auth.uid())::text);
  end if;
end $$;

create or replace trigger inbox_state_touch before insert or update on public.inbox_state
  for each row execute function public.touch_updated_at();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inbox_state'
  ) then
    alter publication supabase_realtime add table public.inbox_state;
  end if;
end $$;

-- Funções de gatilho não ficam expostas como RPC.
revoke execute on function public.guard_profile_insert() from public, anon, authenticated;
