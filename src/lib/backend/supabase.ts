import type { SupabaseClient } from '@supabase/supabase-js'
import { TABLES, type AuthUser, type DataSnapshot, type Row, type TableName } from '@/types'
import { AppError, isNetworkError, type Backend, type InviteCheck } from './types'

/**
 * Modo Supabase: contas reais (e-mail e senha), Postgres com RLS e Realtime.
 * O banco usa snake_case; o app usa camelCase — a conversão é automática por coluna.
 */

const toSnake = (s: string) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

function toDb(row: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [toSnake(k), v === undefined ? null : v]))
}

function fromDb<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v])) as T
}

const MESSAGE_HISTORY = 500
const PAGE = 1000

function translateError(e: unknown): Error {
  if (isNetworkError(e)) return new AppError('Sem conexão com a internet.', 'network')
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e)
  const rules: Array<[RegExp, string]> = [
    [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
    [/already registered|already been registered/i, 'Este e-mail já tem conta. Entre com sua senha.'],
    [/password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
    [/database error saving new user/i, 'Não foi possível criar a conta. Confira o código de convite com o líder.'],
    [/signups? not allowed|signup is disabled/i, 'Cadastros estão fechados. Fale com o líder do ministério.'],
    [/rate limit|too many/i, 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.'],
    [/row-level security|permission denied/i, 'Você não tem permissão para fazer isso.'],
    [/jwt expired/i, 'Sua sessão expirou. Entre novamente.'],
  ]
  for (const [re, text] of rules) if (re.test(msg)) return new AppError(text)
  return new AppError(msg || 'Algo deu errado. Tente novamente.')
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  // Carrega o SDK só quando o app está configurado (o modo demo fica mais leve).
  const clientP: Promise<SupabaseClient> = import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  )

  const userOf = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null =>
    u ? { id: u.id, email: u.email ?? null } : null

  async function fetchTable(sb: SupabaseClient, table: TableName): Promise<Record<string, unknown>[]> {
    if (table === 'messages') {
      const { data, error } = await sb
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MESSAGE_HISTORY)
      if (error) throw error
      return data ?? []
    }
    const all: Record<string, unknown>[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from(table)
        .select('*')
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw error
      all.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    return all
  }

  return {
    mode: 'supabase',

    async getUser() {
      const sb = await clientP
      const { data } = await sb.auth.getSession()
      return userOf(data.session?.user)
    },

    onAuthChange(cb) {
      let unsub = () => {}
      let cancelled = false
      clientP.then((sb) => {
        if (cancelled) return
        const { data } = sb.auth.onAuthStateChange((_event, session) => cb(userOf(session?.user)))
        unsub = () => data.subscription.unsubscribe()
      })
      return () => {
        cancelled = true
        unsub()
      }
    },

    async signIn(email, password) {
      const sb = await clientP
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw translateError(error)
    },

    async signUp({ email, password, name, inviteCode, functions }) {
      const sb = await clientP
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim(), invite_code: inviteCode.trim(), functions },
          emailRedirectTo: window.location.origin,
        },
      })
      if (error) throw translateError(error)
      return { needsConfirmation: !data.session }
    },

    async signOut() {
      const sb = await clientP
      await sb.auth.signOut()
    },

    async resetPassword(email) {
      const sb = await clientP
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/nova-senha`,
      })
      if (error) throw translateError(error)
    },

    async updatePassword(password) {
      const sb = await clientP
      const { error } = await sb.auth.updateUser({ password })
      if (error) throw translateError(error)
    },

    async checkInvite(code): Promise<InviteCheck> {
      const sb = await clientP
      const { data, error } = await sb.rpc('check_invite_code', { code: code.trim() })
      if (error) return 'unknown'
      return data === 'first' || data === 'ok' || data === 'invalid' ? data : 'unknown'
    },

    async fetchAll() {
      const sb = await clientP
      const out: Partial<DataSnapshot> = {}
      try {
        await Promise.all(
          TABLES.map(async (t) => {
            const rows = await fetchTable(sb, t)
            ;(out as Record<string, Record<string, Row>>)[t] = Object.fromEntries(
              rows.map((r) => [String(r.id), fromDb<Row>(r)]),
            )
          }),
        )
      } catch (e) {
        throw translateError(e)
      }
      return out
    },

    subscribe(onChange, onResync) {
      let disposed = false
      let cleanup = () => {}
      clientP.then((sb) => {
        if (disposed) return
        let hadProblem = false
        const channel = sb
          .channel('adoracao-db')
          .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
            const table = payload.table as TableName
            if (!TABLES.includes(table)) return
            if (payload.eventType === 'DELETE') {
              const id = (payload.old as { id?: string }).id
              if (id) onChange({ type: 'delete', table, id })
            } else {
              onChange({ type: 'upsert', table, row: fromDb<Row>(payload.new as Record<string, unknown>) })
            }
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              if (hadProblem) onResync()
              hadProblem = false
            } else hadProblem = true
          })
        cleanup = () => {
          sb.removeChannel(channel)
        }
      })
      return () => {
        disposed = true
        cleanup()
      }
    },

    async upsert(table, row) {
      const sb = await clientP
      const { error } = await sb.from(table).upsert(toDb(row))
      if (error) throw isNetworkError(error) ? error : translateError(error)
    },

    async remove(table, id) {
      const sb = await clientP
      const { error } = await sb.from(table).delete().eq('id', id)
      if (error) throw isNetworkError(error) ? error : translateError(error)
    },
  }
}
