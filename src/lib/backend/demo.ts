import { del, get, set } from 'idb-keyval'
import { buildDemoSeed } from '@/data/seed'
import { nowIso, uid } from '@/lib/utils'
import { TABLES, type AuthUser, type DataSnapshot, type Profile, type Row, type TableName } from '@/types'
import { AppError, type Backend, type ChangeEvent, type InviteCheck, type SignUpInput } from './types'

/**
 * Modo demonstração: os dados ficam no IndexedDB deste navegador.
 * Abas diferentes conversam pelo BroadcastChannel (dá para testar o chat entre dois membros
 * abrindo duas abas). A sessão fica no sessionStorage, então cada aba pode ser um membro.
 */

const DB_KEY = 'adoracao:demo:db:v1'
const SESSION_KEY = 'adoracao:demo:user'
const ACCOUNTS_KEY = 'adoracao:demo:accounts'

type Accounts = Record<string, { password: string; profileId: string }>

function emptySnapshot(): DataSnapshot {
  return Object.fromEntries(TABLES.map((t) => [t, {}])) as unknown as DataSnapshot
}

function readAccounts(): Accounts {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export interface DemoBackend extends Backend {
  demoSignIn(profileId: string): Promise<void>
  resetDemo(): Promise<void>
}

export function createDemoBackend(): DemoBackend {
  let db: DataSnapshot | null = null
  let loading: Promise<DataSnapshot> | null = null
  const authListeners = new Set<(u: AuthUser | null) => void>()
  const changeListeners = new Set<(e: ChangeEvent) => void>()
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('adoracao-demo') : null

  async function load(): Promise<DataSnapshot> {
    if (db) return db
    loading ??= (async () => {
      let stored: DataSnapshot | undefined
      try {
        stored = await get<DataSnapshot>(DB_KEY)
      } catch {
        stored = undefined
      }
      const snapshot = emptySnapshot()
      const source = stored ?? buildDemoSeed()
      for (const t of TABLES) Object.assign(snapshot[t], source[t] ?? {})
      db = snapshot
      if (!stored) persist()
      return snapshot
    })()
    return loading
  }

  /** Grava na hora: fechar a aba logo depois de uma alteração não pode perder dados. */
  function persist() {
    if (db) set(DB_KEY, db).catch(() => {})
  }

  function apply(e: ChangeEvent) {
    if (!db) return
    const table = db[e.table] as Record<string, Row>
    if (e.type === 'upsert') table[(e.row as { id: string }).id] = e.row
    else delete table[e.id]
  }

  channel?.addEventListener('message', (msg: MessageEvent<ChangeEvent | { type: 'reset' }>) => {
    const e = msg.data
    if (e.type === 'reset') {
      db = null
      loading = null
      return
    }
    apply(e)
    changeListeners.forEach((l) => l(e))
  })

  function currentUserId(): string | null {
    return sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY)
  }

  async function setSession(profileId: string | null) {
    if (profileId) {
      sessionStorage.setItem(SESSION_KEY, profileId)
      localStorage.setItem(SESSION_KEY, profileId)
    } else {
      sessionStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(SESSION_KEY)
    }
    const user = profileId ? { id: profileId, email: null } : null
    authListeners.forEach((l) => l(user))
  }

  return {
    mode: 'demo',

    async getUser() {
      const id = currentUserId()
      if (!id) return null
      const data = await load()
      return data.profiles[id] ? { id, email: null } : null
    },

    onAuthChange(cb) {
      authListeners.add(cb)
      return () => authListeners.delete(cb)
    },

    async demoSignIn(profileId) {
      await setSession(profileId)
    },

    async signIn(email, password) {
      const acc = readAccounts()[email.trim().toLowerCase()]
      if (!acc || acc.password !== password) throw new AppError('E-mail ou senha incorretos.')
      await setSession(acc.profileId)
    },

    async signUp({ email, password, name, functions }: SignUpInput) {
      const accounts = readAccounts()
      const key = email.trim().toLowerCase()
      if (accounts[key]) throw new AppError('Este e-mail já tem conta. Entre com sua senha.')
      if (password.length < 6) throw new AppError('A senha precisa ter pelo menos 6 caracteres.')
      const data = await load()
      const id = uid()
      const profile: Profile = {
        id,
        name: name.trim(),
        role: Object.keys(data.profiles).length === 0 ? 'admin' : 'member',
        functions,
        color: 'lavender',
        bio: '',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      const e: ChangeEvent = { type: 'upsert', table: 'profiles', row: profile }
      apply(e)
      persist()
      channel?.postMessage(e)
      accounts[key] = { password, profileId: id }
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
      await setSession(id)
      return { needsConfirmation: false }
    },

    async signOut() {
      await setSession(null)
    },

    async resetPassword() {
      throw new AppError('No modo demonstração não há envio de e-mail.')
    },

    async updatePassword() {
      throw new AppError('No modo demonstração não há senha para trocar.')
    },

    async checkInvite(): Promise<InviteCheck> {
      return 'ok'
    },

    async fetchAll() {
      const data = await load()
      // Cópia rasa por tabela: a store não deve mutar o "banco".
      return Object.fromEntries(TABLES.map((t) => [t, { ...data[t] }])) as unknown as DataSnapshot
    },

    subscribe(onChange) {
      changeListeners.add(onChange)
      return () => changeListeners.delete(onChange)
    },

    async upsert(table: TableName, row: Row) {
      await load()
      const e: ChangeEvent = { type: 'upsert', table, row }
      apply(e)
      persist()
      channel?.postMessage(e)
    },

    async remove(table, id) {
      await load()
      const e: ChangeEvent = { type: 'delete', table, id }
      apply(e)
      persist()
      channel?.postMessage(e)
    },

    async resetDemo() {
      await del(DB_KEY).catch(() => {})
      localStorage.removeItem(ACCOUNTS_KEY)
      db = null
      loading = null
      channel?.postMessage({ type: 'reset' })
    },
  }
}
