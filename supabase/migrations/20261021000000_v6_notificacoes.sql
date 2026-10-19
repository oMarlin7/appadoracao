-- =============================================================================
-- Adoração · v6: notificações no celular (Web Push)
--
--   • profiles.notify_prefs: o que cada membro quer receber (escala, votacao, setlist, ensaio,
--     avisos); o que não estiver marcado como false fica ligado
--   • push_subscriptions: os aparelhos que ativaram as notificações (um endereço por aparelho)
--   • push_config: chaves VAPID (criadas pela função notificar) e o segredo do agendador
--   • push_log: o que já foi avisado (a função nunca repete uma notificação)
--
-- O agendador que chama a função a cada minuto está em 20261021000100_v6_agendador.sql.
-- Pode rodar de novo sem problema.
-- =============================================================================

alter table public.profiles add column if not exists notify_prefs jsonb not null default '{}'::jsonb;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id text not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid_public text,
  vapid_private jsonb,
  cron_secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  -- Endereço da função notificar deste projeto (o agendador chama este endereço).
  function_url text,
  updated_at timestamptz not null default now()
);
insert into public.push_config (id, function_url)
values (1, 'https://gqocxdbpgjcqjzckllvr.supabase.co/functions/v1/notificar')
on conflict (id) do nothing;

create table if not exists public.push_log (
  key text primary key,
  created_at timestamptz not null default now()
);

-- Só a função (chave de serviço) lê e grava configuração e registro; o app não tem acesso.
alter table public.push_subscriptions enable row level security;
alter table public.push_config enable row level security;
alter table public.push_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'aparelhos: ver os seus') then
    create policy "aparelhos: ver os seus" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid())::text);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Inscrever o aparelho (o endereço pode trocar de dono quando outra pessoa entra no mesmo
-- celular). Remover é com a função notificar, que também apaga os aparelhos que sumiram.
-- -----------------------------------------------------------------------------

create or replace function public.registrar_aparelho(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := (select auth.uid())::text;
begin
  if me is null then
    raise exception 'Entre na sua conta para ativar as notificações.';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Aparelho inválido para notificações.';
  end if;
  insert into public.push_subscriptions as s (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, me, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, updated_at = now();
end $$;

revoke execute on function public.registrar_aparelho(text, text, text, text) from public, anon;
grant execute on function public.registrar_aparelho(text, text, text, text) to authenticated;
