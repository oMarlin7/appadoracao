-- =============================================================================
-- Adoração · esquema do banco (Supabase / Postgres)
--
-- Como usar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- (Ou, com a CLI do Supabase: `supabase db push`.)
--
-- Regras principais
--   • Só quem está logado vê os dados (a equipe toda vê o acervo, cultos e chat).
--   • Cada membro altera o que é seu (favoritas, mensagens, playlists, preferências).
--   • Acervo e cultos são colaborativos; excluir é do autor ou do líder.
--   • O primeiro cadastro vira líder (admin). Os demais precisam do código de convite,
--     definido pelo líder no app (Equipe → Código de convite).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id text primary key,
  name text not null default '',
  role text not null default 'member' check (role in ('admin', 'member')),
  functions text[] not null default '{}',
  color text not null default 'lavender',
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_settings (
  id text primary key default 'team' check (id = 'team'),
  name text not null default 'Ministério de Louvor',
  church text not null default '',
  invite_code text,
  updated_at timestamptz not null default now()
);

insert into public.team_settings (id) values ('team') on conflict (id) do nothing;

create table if not exists public.songs (
  id text primary key,
  title text not null,
  artist text not null default '',
  original_key text,
  team_key text,
  bpm integer,
  time_signature text,
  tempo text check (tempo in ('lenta', 'moderada', 'rapida')),
  themes text[] not null default '{}',
  moments text[] not null default '{}',
  tags text[] not null default '{}',
  meaning text not null default '',
  bible_refs text[] not null default '{}',
  content text not null default '',
  notes text not null default '',
  youtube_url text,
  created_by text references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id text primary key,
  user_id text not null references public.profiles (id) on delete cascade,
  song_id text not null references public.songs (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, song_id)
);

create table if not exists public.song_prefs (
  id text primary key,
  user_id text not null references public.profiles (id) on delete cascade,
  song_id text not null references public.songs (id) on delete cascade,
  key text,
  capo integer,
  updated_at timestamptz not null default now(),
  unique (user_id, song_id)
);

create table if not exists public.playlists (
  id text primary key,
  name text not null,
  description text not null default '',
  color text not null default 'lavender',
  owner_id text not null references public.profiles (id) on delete cascade,
  is_shared boolean not null default true,
  song_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id text primary key,
  title text not null,
  date date not null,
  time text,
  theme text not null default '',
  bible_text text not null default '',
  notes text not null default '',
  leader_id text references public.profiles (id) on delete set null,
  -- setlist: [{ id, songId, key, moment, notes }]
  items jsonb not null default '[]',
  -- escala: [{ userId, role }]
  team jsonb not null default '[]',
  created_by text references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists services_date_idx on public.services (date);

create table if not exists public.suggestions (
  id text primary key,
  song_id text not null references public.songs (id) on delete cascade,
  service_id text references public.services (id) on delete cascade,
  user_id text not null references public.profiles (id) on delete cascade,
  note text not null default '',
  status text not null default 'pendente' check (status in ('pendente', 'aceita', 'recusada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Anexos do chat ficam sem chave estrangeira de propósito: se a música/culto sair do
-- acervo, a mensagem continua e o app mostra "removido".
create table if not exists public.messages (
  id text primary key,
  user_id text not null references public.profiles (id) on delete cascade,
  text text not null default '',
  song_id text,
  service_id text,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists messages_created_at_idx on public.messages (created_at desc);

-- Reações servem para "apoiar" sugestões e para os emojis do chat.
create table if not exists public.reactions (
  id text primary key,
  target_type text not null check (target_type in ('suggestion', 'message')),
  target_id text not null,
  user_id text not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now()
);

create index if not exists reactions_target_idx on public.reactions (target_id);

-- -----------------------------------------------------------------------------
-- Funções auxiliares
-- -----------------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid()::text and role = 'admin')
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Mantém o "dono" de uma linha: no cadastro é quem está logado; depois o app não muda mais.
-- (Alterações feitas pelo próprio banco, como o "set null" quando um perfil é excluído,
-- chegam aqui com profundidade de gatilho > 1 e são respeitadas.)
create or replace function public.keep_owner() returns trigger
language plpgsql as $$
declare
  col text := tg_argv[0];
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new := jsonb_populate_record(new, jsonb_build_object(col, auth.uid()::text));
    end if;
  elsif pg_trigger_depth() = 1 then
    new := jsonb_populate_record(new, jsonb_build_object(col, to_jsonb(old) -> col));
  end if;
  return new;
end $$;

-- Só líderes mudam papéis, e a equipe nunca fica sem líder.
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Somente líderes podem alterar papéis na equipe';
    end if;
    if old.role = 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'A equipe precisa de pelo menos um líder';
    end if;
  end if;
  return new;
end $$;

-- Ao apagar uma mensagem ou sugestão, as reações dela saem junto.
create or replace function public.delete_reactions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.reactions where target_id = old.id;
  return old;
end $$;

-- -----------------------------------------------------------------------------
-- Cadastro: cria o perfil e valida o código de convite
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_first boolean := not exists (select 1 from public.profiles);
  provided text := lower(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  expected text;
  fns text[];
begin
  select lower(trim(coalesce(invite_code, ''))) into expected from public.team_settings where id = 'team';
  -- Primeiro usuário (vira líder) e convites feitos pelo painel do Supabase dispensam código.
  if not is_first and new.invited_at is null and (coalesce(expected, '') = '' or provided <> expected) then
    raise exception 'Código de convite inválido';
  end if;

  select coalesce(array_agg(x), '{}') into fns
  from jsonb_array_elements_text(coalesce(new.raw_user_meta_data -> 'functions', '[]'::jsonb)) as x;

  insert into public.profiles (id, name, role, functions, color)
  values (
    new.id::text,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    case when is_first then 'admin' else 'member' end,
    fns,
    (array['lavender', 'mint', 'peach', 'sky', 'rose', 'butter', 'orchid', 'aqua', 'sage', 'coral'])[1 + floor(random() * 10)::int]
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Excluir o usuário no painel (Authentication → Users) tira a pessoa da equipe.
create or replace function public.handle_deleted_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.profiles where id = old.id::text;
  return old;
end $$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_user();

-- A tela de cadastro consulta isto antes de criar a conta (para dar uma mensagem clara).
create or replace function public.check_invite_code(code text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from public.profiles) then 'first'
    when exists (
      select 1 from public.team_settings
      where id = 'team' and coalesce(invite_code, '') <> '' and lower(trim(invite_code)) = lower(trim(code))
    ) then 'ok'
    else 'invalid'
  end
$$;

revoke all on function public.check_invite_code(text) from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Gatilhos
-- -----------------------------------------------------------------------------

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles for each row execute function public.protect_profile();

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'team_settings', 'songs', 'song_prefs', 'playlists', 'services', 'suggestions'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

drop trigger if exists songs_owner on public.songs;
create trigger songs_owner before insert or update on public.songs for each row execute function public.keep_owner('created_by');
drop trigger if exists services_owner on public.services;
create trigger services_owner before insert or update on public.services for each row execute function public.keep_owner('created_by');
drop trigger if exists playlists_owner on public.playlists;
create trigger playlists_owner before insert or update on public.playlists for each row execute function public.keep_owner('owner_id');
drop trigger if exists favorites_owner on public.favorites;
create trigger favorites_owner before insert or update on public.favorites for each row execute function public.keep_owner('user_id');
drop trigger if exists song_prefs_owner on public.song_prefs;
create trigger song_prefs_owner before insert or update on public.song_prefs for each row execute function public.keep_owner('user_id');
drop trigger if exists suggestions_owner on public.suggestions;
create trigger suggestions_owner before insert or update on public.suggestions for each row execute function public.keep_owner('user_id');
drop trigger if exists messages_owner on public.messages;
create trigger messages_owner before insert or update on public.messages for each row execute function public.keep_owner('user_id');
drop trigger if exists reactions_owner on public.reactions;
create trigger reactions_owner before insert or update on public.reactions for each row execute function public.keep_owner('user_id');

drop trigger if exists messages_cleanup on public.messages;
create trigger messages_cleanup after delete on public.messages for each row execute function public.delete_reactions();
drop trigger if exists suggestions_cleanup on public.suggestions;
create trigger suggestions_cleanup after delete on public.suggestions for each row execute function public.delete_reactions();

-- -----------------------------------------------------------------------------
-- Segurança por linha (RLS)
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.team_settings enable row level security;
alter table public.songs enable row level security;
alter table public.favorites enable row level security;
alter table public.song_prefs enable row level security;
alter table public.playlists enable row level security;
alter table public.services enable row level security;
alter table public.suggestions enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;

-- Perfis
drop policy if exists "perfis: equipe vê" on public.profiles;
create policy "perfis: equipe vê" on public.profiles for select to authenticated using (true);
drop policy if exists "perfis: cada um edita o seu" on public.profiles;
create policy "perfis: cada um edita o seu" on public.profiles for update to authenticated
  using (id = auth.uid()::text or public.is_admin()) with check (id = auth.uid()::text or public.is_admin());
drop policy if exists "perfis: líder remove" on public.profiles;
create policy "perfis: líder remove" on public.profiles for delete to authenticated using (public.is_admin());

-- Configurações da equipe (código de convite só para quem está logado)
drop policy if exists "equipe: vê" on public.team_settings;
create policy "equipe: vê" on public.team_settings for select to authenticated using (true);
drop policy if exists "equipe: líder cria" on public.team_settings;
create policy "equipe: líder cria" on public.team_settings for insert to authenticated with check (public.is_admin());
drop policy if exists "equipe: líder edita" on public.team_settings;
create policy "equipe: líder edita" on public.team_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Acervo (colaborativo)
drop policy if exists "músicas: equipe vê" on public.songs;
create policy "músicas: equipe vê" on public.songs for select to authenticated using (true);
drop policy if exists "músicas: equipe cadastra" on public.songs;
create policy "músicas: equipe cadastra" on public.songs for insert to authenticated with check (true);
drop policy if exists "músicas: equipe edita" on public.songs;
create policy "músicas: equipe edita" on public.songs for update to authenticated using (true) with check (true);
drop policy if exists "músicas: autor ou líder exclui" on public.songs;
create policy "músicas: autor ou líder exclui" on public.songs for delete to authenticated
  using (created_by = auth.uid()::text or public.is_admin());

-- Favoritas (a equipe vê, para o ranking de "queridinhas")
drop policy if exists "favoritas: equipe vê" on public.favorites;
create policy "favoritas: equipe vê" on public.favorites for select to authenticated using (true);
drop policy if exists "favoritas: cada um as suas" on public.favorites;
create policy "favoritas: cada um as suas" on public.favorites for all to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

-- Preferências pessoais (tom e capotraste)
drop policy if exists "preferências: só o dono" on public.song_prefs;
create policy "preferências: só o dono" on public.song_prefs for all to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

-- Playlists
drop policy if exists "playlists: compartilhadas ou minhas" on public.playlists;
create policy "playlists: compartilhadas ou minhas" on public.playlists for select to authenticated
  using (is_shared or owner_id = auth.uid()::text or public.is_admin());
drop policy if exists "playlists: criar as minhas" on public.playlists;
create policy "playlists: criar as minhas" on public.playlists for insert to authenticated with check (owner_id = auth.uid()::text);
drop policy if exists "playlists: dono ou líder edita" on public.playlists;
create policy "playlists: dono ou líder edita" on public.playlists for update to authenticated
  using (owner_id = auth.uid()::text or public.is_admin()) with check (true);
drop policy if exists "playlists: dono ou líder exclui" on public.playlists;
create policy "playlists: dono ou líder exclui" on public.playlists for delete to authenticated
  using (owner_id = auth.uid()::text or public.is_admin());

-- Cultos (setlist e escala colaborativos)
drop policy if exists "cultos: equipe vê" on public.services;
create policy "cultos: equipe vê" on public.services for select to authenticated using (true);
drop policy if exists "cultos: equipe cria" on public.services;
create policy "cultos: equipe cria" on public.services for insert to authenticated with check (true);
drop policy if exists "cultos: equipe edita" on public.services;
create policy "cultos: equipe edita" on public.services for update to authenticated using (true) with check (true);
drop policy if exists "cultos: autor, ministro ou líder exclui" on public.services;
create policy "cultos: autor, ministro ou líder exclui" on public.services for delete to authenticated
  using (created_by = auth.uid()::text or leader_id = auth.uid()::text or public.is_admin());

-- Sugestões
drop policy if exists "sugestões: equipe vê" on public.suggestions;
create policy "sugestões: equipe vê" on public.suggestions for select to authenticated using (true);
drop policy if exists "sugestões: sugerir" on public.suggestions;
create policy "sugestões: sugerir" on public.suggestions for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists "sugestões: equipe atualiza" on public.suggestions;
create policy "sugestões: equipe atualiza" on public.suggestions for update to authenticated using (true) with check (true);
drop policy if exists "sugestões: autor ou líder exclui" on public.suggestions;
create policy "sugestões: autor ou líder exclui" on public.suggestions for delete to authenticated
  using (user_id = auth.uid()::text or public.is_admin());

-- Chat
drop policy if exists "chat: equipe vê" on public.messages;
create policy "chat: equipe vê" on public.messages for select to authenticated using (true);
drop policy if exists "chat: enviar" on public.messages;
create policy "chat: enviar" on public.messages for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists "chat: editar a minha" on public.messages;
create policy "chat: editar a minha" on public.messages for update to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
drop policy if exists "chat: autor ou líder apaga" on public.messages;
create policy "chat: autor ou líder apaga" on public.messages for delete to authenticated
  using (user_id = auth.uid()::text or public.is_admin());

-- Reações
drop policy if exists "reações: equipe vê" on public.reactions;
create policy "reações: equipe vê" on public.reactions for select to authenticated using (true);
drop policy if exists "reações: cada um as suas" on public.reactions;
create policy "reações: cada um as suas" on public.reactions for all to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- Tempo real
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'team_settings', 'songs', 'favorites', 'song_prefs', 'playlists', 'services', 'suggestions', 'messages', 'reactions'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
