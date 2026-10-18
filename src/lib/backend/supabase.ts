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
const BUCKET = 'ensaios'

/** Tabela ou coluna que ainda não existe no banco (migração nova não aplicada). */
const missingTable = (e: { code?: string; message?: string }) =>
  e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message ?? '')
const missingColumn = (e: { code?: string; message?: string }) => {
  if (e.code !== 'PGRST204' && !/column .* does not exist|could not find the '.*' column/i.test(e.message ?? '')) return null
  return /'([a-z_]+)' column|column "?([a-z_]+)"? /i.exec(e.message ?? '')?.slice(1).find(Boolean) ?? null
}
/** Tabelas das migrações v2 em diante: sem elas o app segue funcionando, só sem as funções novas. */
const OPTIONAL_TABLES: TableName[] = ['attendance', 'recordings', 'custom_themes', 'song_polls', 'votes', 'announcements', 'inbox_state']
const UPGRADE_HINT = 'O banco precisa ser atualizado: rode no SQL Editor os arquivos de supabase/migrations que ainda não rodou (veja o README).'

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
    [/somente o líder|já usou todos os seus votos|votação ainda não terminou|não tem votação/i, msg.replace(/^.*?(Somente|Você|A votação|Este evento)/, '$1')],
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
    // Banco ainda sem a migração v2: o app segue funcionando sem as funções novas.
    const optional = (OPTIONAL_TABLES as string[]).includes(table)
    const all: Record<string, unknown>[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from(table)
        .select('*')
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) {
        if (optional && missingTable(error)) {
          console.warn(UPGRADE_HINT)
          return []
        }
        throw error
      }
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
      const payload = toDb(row)
      // Colunas novas que o banco ainda não conhece (sem a migração v2) são deixadas de fora,
      // para o resto da alteração não se perder.
      for (let attempt = 0; attempt < 4; attempt++) {
        const { error } = await sb.from(table).upsert(payload)
        if (!error) return
        if (isNetworkError(error)) throw error
        if (missingTable(error)) throw new AppError(UPGRADE_HINT)
        const col = missingColumn(error)
        if (!col || !(col in payload)) throw translateError(error)
        console.warn(`Coluna ${table}.${col} não existe no banco. ${UPGRADE_HINT}`)
        delete payload[col]
      }
    },

    async remove(table, id) {
      const sb = await clientP
      const { error } = await sb.from(table).delete().eq('id', id)
      if (error) throw isNetworkError(error) ? error : translateError(error)
    },

    async uploadFile(path, file, contentType) {
      const sb = await clientP
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType, upsert: false, cacheControl: '31536000' })
      if (error) {
        if (/bucket not found/i.test(error.message)) throw new AppError(UPGRADE_HINT)
        throw isNetworkError(error) ? error : translateError(error)
      }
    },

    async fileUrl(path) {
      const sb = await clientP
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6)
      if (error || !data) throw translateError(error ?? new Error('Arquivo não encontrado.'))
      return data.signedUrl
    },

    async removeFile(path) {
      const sb = await clientP
      const { error } = await sb.storage.from(BUCKET).remove([path])
      if (error && !isNetworkError(error)) console.warn('Arquivo não removido do Storage', path, error)
    },

    async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
      const sb = await clientP
      const { data, error } = await sb.rpc(fn, args)
      if (error) throw isNetworkError(error) ? error : translateError(error)
      return data as T
    },

    async invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
      const sb = await clientP
      const { data, error } = await sb.functions.invoke(fn, { body })
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status
        if (status === 404) throw new AppError('A função do servidor ainda não foi publicada (veja o README).', 'no-server')
        throw translateError(error)
      }
      return data as T
    },
  }
}
