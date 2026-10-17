-- =============================================================================
-- Adoração · v2: fotos e capas, Spotify, presença, gravações de ensaio e temas da equipe
--
-- Como usar: depois do primeiro arquivo (…_init.sql), cole este no SQL Editor → Run.
-- Pode rodar mais de uma vez sem problema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Colunas novas
-- -----------------------------------------------------------------------------

alter table public.profiles add column if not exists avatar_url text;
alter table public.songs add column if not exists cover_url text;
alter table public.songs add column if not exists spotify_url text;

-- -----------------------------------------------------------------------------
-- Tabelas novas
-- -----------------------------------------------------------------------------

-- Presença: o membro confirma ou justifica a ausência; o líder marca quem esteve lá.
create table if not exists public.attendance (
  id text primary key,
  service_id text not null references public.services (id) on delete cascade,
  user_id text not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('confirmado', 'presente', 'ausente')),
  reason text,
  note text not null default '',
  marked_by text references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, user_id)
);

-- Gravações de ensaio (o arquivo de áudio fica no Storage, bucket "ensaios").
create table if not exists public.recordings (
  id text primary key,
  title text not null default '',
  service_id text references public.services (id) on delete set null,
  song_id text references public.songs (id) on delete set null,
  storage_path text not null,
  mime_type text not null default 'audio/webm',
  duration_sec integer,
  size_bytes bigint,
  created_by text references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Temas criados pela equipe (somam aos temas que já vêm no app).
create table if not exists public.custom_themes (
  id text primary key,
  name text not null,
  description text not null default '',
  icon text not null default 'sparkles',
  color text not null default 'lavender',
  keywords text[] not null default '{}',
  created_by text references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attendance_service_idx on public.attendance (service_id);
create index if not exists recordings_service_idx on public.recordings (service_id);

-- -----------------------------------------------------------------------------
-- Funções e gatilhos
-- -----------------------------------------------------------------------------

-- Ministro (líder) do culto?
create or replace function public.leads_service(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.services where id = sid and leader_id = auth.uid()::text)
$$;

-- Guarda quem fez a última marcação de presença.
create or replace function public.stamp_marked_by() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    new.marked_by := auth.uid()::text;
  end if;
  if tg_op = 'UPDATE' then
    new.service_id := old.service_id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists attendance_marked_by on public.attendance;
create trigger attendance_marked_by before insert or update on public.attendance for each row execute function public.stamp_marked_by();

do $$
declare
  t text;
begin
  foreach t in array array['attendance', 'recordings', 'custom_themes'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

drop trigger if exists recordings_owner on public.recordings;
create trigger recordings_owner before insert or update on public.recordings for each row execute function public.keep_owner('created_by');
drop trigger if exists custom_themes_owner on public.custom_themes;
create trigger custom_themes_owner before insert or update on public.custom_themes for each row execute function public.keep_owner('created_by');

-- -----------------------------------------------------------------------------
-- Segurança por linha (RLS)
-- -----------------------------------------------------------------------------

alter table public.attendance enable row level security;
alter table public.recordings enable row level security;
alter table public.custom_themes enable row level security;

-- Presença: a equipe vê; cada um marca a sua; líder e ministro do culto marcam todos.
drop policy if exists "presença: equipe vê" on public.attendance;
create policy "presença: equipe vê" on public.attendance for select to authenticated using (true);
drop policy if exists "presença: marcar" on public.attendance;
create policy "presença: marcar" on public.attendance for insert to authenticated
  with check (user_id = auth.uid()::text or public.is_admin() or public.leads_service(service_id));
drop policy if exists "presença: alterar" on public.attendance;
create policy "presença: alterar" on public.attendance for update to authenticated
  using (user_id = auth.uid()::text or public.is_admin() or public.leads_service(service_id))
  with check (user_id = auth.uid()::text or public.is_admin() or public.leads_service(service_id));
drop policy if exists "presença: apagar" on public.attendance;
create policy "presença: apagar" on public.attendance for delete to authenticated
  using (user_id = auth.uid()::text or public.is_admin() or public.leads_service(service_id));

-- Gravações: a equipe ouve e envia; quem enviou (ou o líder) edita e apaga.
drop policy if exists "gravações: equipe vê" on public.recordings;
create policy "gravações: equipe vê" on public.recordings for select to authenticated using (true);
drop policy if exists "gravações: enviar" on public.recordings;
create policy "gravações: enviar" on public.recordings for insert to authenticated with check (true);
drop policy if exists "gravações: autor ou líder edita" on public.recordings;
create policy "gravações: autor ou líder edita" on public.recordings for update to authenticated
  using (created_by = auth.uid()::text or public.is_admin()) with check (true);
drop policy if exists "gravações: autor ou líder apaga" on public.recordings;
create policy "gravações: autor ou líder apaga" on public.recordings for delete to authenticated
  using (created_by = auth.uid()::text or public.is_admin());

-- Temas: a equipe vê e cria; quem criou (ou o líder) edita e apaga.
drop policy if exists "temas: equipe vê" on public.custom_themes;
create policy "temas: equipe vê" on public.custom_themes for select to authenticated using (true);
drop policy if exists "temas: criar" on public.custom_themes;
create policy "temas: criar" on public.custom_themes for insert to authenticated with check (true);
drop policy if exists "temas: autor ou líder edita" on public.custom_themes;
create policy "temas: autor ou líder edita" on public.custom_themes for update to authenticated
  using (created_by = auth.uid()::text or public.is_admin()) with check (true);
drop policy if exists "temas: autor ou líder apaga" on public.custom_themes;
create policy "temas: autor ou líder apaga" on public.custom_themes for delete to authenticated
  using (created_by = auth.uid()::text or public.is_admin());

-- -----------------------------------------------------------------------------
-- Arquivos dos ensaios (Supabase Storage, bucket privado "ensaios")
-- Cada membro envia para a pasta com o próprio id; a equipe toda pode ouvir.
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('ensaios', 'ensaios', false, 104857600)
    on conflict (id) do nothing;

    execute 'drop policy if exists "ensaios: equipe ouve" on storage.objects';
    execute $p$create policy "ensaios: equipe ouve" on storage.objects for select to authenticated
      using (bucket_id = 'ensaios')$p$;
    execute 'drop policy if exists "ensaios: enviar na minha pasta" on storage.objects';
    execute $p$create policy "ensaios: enviar na minha pasta" on storage.objects for insert to authenticated
      with check (bucket_id = 'ensaios' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute 'drop policy if exists "ensaios: autor ou líder apaga" on storage.objects';
    execute $p$create policy "ensaios: autor ou líder apaga" on storage.objects for delete to authenticated
      using (bucket_id = 'ensaios' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))$p$;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Tempo real
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['attendance', 'recordings', 'custom_themes'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
