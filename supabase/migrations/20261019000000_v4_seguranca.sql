-- =============================================================================
-- Adoração · v4: ajustes de segurança apontados pelo Security Advisor do Supabase
--
-- Como usar: depois dos arquivos anteriores, cole este no SQL Editor → Run.
-- Pode rodar mais de uma vez sem problema.
--
--   • Funções de gatilho não ficam expostas como RPC (os gatilhos continuam funcionando:
--     o Postgres não confere EXECUTE ao disparar um gatilho).
--   • As funções usadas pelas políticas só leem o que quem está logado já pode ver, então
--     rodam com as permissões de quem chama, e só para quem está logado.
--   • RPCs de propósito: check_invite_code (tela de cadastro, antes do login) e
--     aplicar_votacao (só para quem está logado).
--   • search_path fixo nas funções que ainda não tinham.
-- =============================================================================

alter function public.touch_updated_at() set search_path = public;
alter function public.keep_owner() set search_path = public;
alter function public.stamp_marked_by() set search_path = public;

alter function public.is_admin() security invoker;
alter function public.leads_service(text) security invoker;
alter function public.voting_open(text) security invoker;
alter function public.voting_window(text) security invoker;
alter function public.announcement_for_me(text[]) security invoker;

revoke execute on function
  public.touch_updated_at(),
  public.keep_owner(),
  public.stamp_marked_by(),
  public.delete_reactions(),
  public.handle_new_user(),
  public.handle_deleted_user(),
  public.protect_profile(),
  public.limit_votes(),
  public.protect_setlist(),
  public.protect_suggestion_status()
from public, anon, authenticated;

revoke execute on function
  public.is_admin(),
  public.leads_service(text),
  public.voting_open(text),
  public.voting_window(text),
  public.announcement_for_me(text[]),
  public.aplicar_votacao(text)
from public, anon;

grant execute on function
  public.is_admin(),
  public.leads_service(text),
  public.voting_open(text),
  public.voting_window(text),
  public.announcement_for_me(text[]),
  public.aplicar_votacao(text)
to authenticated;

revoke execute on function public.check_invite_code(text) from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;
