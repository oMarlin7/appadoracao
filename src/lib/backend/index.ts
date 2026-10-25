import { createDemoBackend, type DemoBackend } from './demo'
import { createSupabaseBackend } from './supabase'
import type { Backend } from './types'

export * from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Sem as variáveis do Supabase, o app roda em modo demonstração (dados só neste aparelho). */
export const backend: Backend = url && anonKey ? createSupabaseBackend(url, anonKey) : createDemoBackend()

export const isDemo = backend.mode === 'demo'

/** Função do servidor que busca músicas e monta a ficha (na prévia de teste, uma cópia dela). */
export const IMPORT_FUNCTION = import.meta.env.VITE_IMPORT_FUNCTION || 'importar-musica'

export function demoBackend(): DemoBackend | null {
  return isDemo ? (backend as DemoBackend) : null
}
