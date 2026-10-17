import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AccidentalPref } from '@/lib/music/theory'
import { TABLES, type AuthUser, type DataSnapshot, type Id, type Profile, type Row, type TableName, type Tables } from '@/types'

// ---------------------------------------------------------------------------
// Dados (cache local de todas as tabelas)
// ---------------------------------------------------------------------------

export function emptyData(): DataSnapshot {
  return Object.fromEntries(TABLES.map((t) => [t, {}])) as unknown as DataSnapshot
}

interface DataState {
  data: DataSnapshot
  /** Já recebemos dados (do cache ou do servidor)? */
  loaded: boolean
  syncing: boolean
  lastSync: number | null
  /** Erro na primeira carga (sem cache para mostrar). */
  error: string | null
  setError(error: string | null): void
  hydrate(snapshot: Partial<DataSnapshot>): void
  upsertLocal<T extends TableName>(table: T, row: Tables[T]): void
  removeLocal(table: TableName, id: Id): void
  reset(): void
  setSyncing(v: boolean): void
}

export const useData = create<DataState>()((set) => ({
  data: emptyData(),
  loaded: false,
  syncing: false,
  lastSync: null,
  error: null,
  setError: (error) => set({ error }),
  hydrate: (snapshot) =>
    set((s) => {
      const data = { ...s.data }
      for (const t of TABLES) if (snapshot[t]) (data as Record<string, unknown>)[t] = { ...snapshot[t] }
      return { data, loaded: true, lastSync: Date.now(), error: null }
    }),
  upsertLocal: (table, row) =>
    set((s) => ({
      data: { ...s.data, [table]: { ...s.data[table], [(row as { id: Id }).id]: row } },
    })),
  removeLocal: (table, id) =>
    set((s) => {
      if (!(id in s.data[table])) return s
      const next = { ...s.data[table] } as Record<string, Row>
      delete next[id]
      return { data: { ...s.data, [table]: next } }
    }),
  reset: () => set({ data: emptyData(), loaded: false, lastSync: null, error: null }),
  setSyncing: (syncing) => set({ syncing }),
}))

export function useTable<T extends TableName>(table: T): Record<Id, Tables[T]> {
  return useData((s) => s.data[table]) as Record<Id, Tables[T]>
}

export function useRows<T extends TableName>(table: T): Tables[T][] {
  const rec = useTable(table)
  return useMemo(() => Object.values(rec), [rec])
}

export function useRow<T extends TableName>(table: T, id: Id | null | undefined): Tables[T] | undefined {
  return useData((s) => (id ? (s.data[table] as Record<Id, Tables[T]>)[id] : undefined))
}

export const getData = () => useData.getState().data

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

interface SessionState {
  status: 'loading' | 'signedOut' | 'signedIn'
  user: AuthUser | null
  setUser(user: AuthUser | null): void
}

export const useSession = create<SessionState>()((set) => ({
  status: 'loading',
  user: null,
  setUser: (user) => set({ user, status: user ? 'signedIn' : 'signedOut' }),
}))

export const currentUserId = () => useSession.getState().user?.id ?? null

/** Perfil do membro logado. */
export function useMe(): Profile | undefined {
  const id = useSession((s) => s.user?.id)
  return useRow('profiles', id)
}

export function useIsAdmin(): boolean {
  return useMe()?.role === 'admin'
}

// ---------------------------------------------------------------------------
// Preferências deste aparelho
// ---------------------------------------------------------------------------

export type ThemePref = 'system' | 'light' | 'dark'
export type SheetView = 'cifra' | 'letra'

interface SettingsState {
  theme: ThemePref
  accidentals: AccidentalPref
  /** Escala da fonte da cifra/letra (1 = padrão). */
  fontScale: number
  /** Visão padrão ao abrir uma música; "auto" decide pela função do membro. */
  defaultView: SheetView | 'auto'
  showSectionLabels: boolean
  keepAwake: boolean
  libraryLayout: 'list' | 'grid'
  autoScrollSpeed: number
  lastChatRead: string | null
  set<K extends keyof Omit<SettingsState, 'set'>>(key: K, value: SettingsState[K]): void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      accidentals: 'auto',
      fontScale: 1,
      defaultView: 'auto',
      showSectionLabels: true,
      keepAwake: true,
      libraryLayout: 'list',
      autoScrollSpeed: 3,
      lastChatRead: null,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
    }),
    {
      name: 'adoracao:settings',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)
