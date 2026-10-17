import type { AuthUser, DataSnapshot, Row, TableName } from '@/types'

export type ChangeEvent =
  | { type: 'upsert'; table: TableName; row: Row }
  | { type: 'delete'; table: TableName; id: string }

export interface SignUpInput {
  email: string
  password: string
  name: string
  inviteCode: string
  functions: string[]
}

/** Situação do cadastro: primeiro usuário (vira líder), código obrigatório, etc. */
export type InviteCheck = 'first' | 'ok' | 'invalid' | 'unknown'

/**
 * Contrato único para os dois modos do app:
 *  - demo: tudo salvo no próprio aparelho (IndexedDB), para experimentar sem configurar nada;
 *  - supabase: contas reais, banco compartilhado e atualizações em tempo real.
 */
export interface Backend {
  readonly mode: 'demo' | 'supabase'
  getUser(): Promise<AuthUser | null>
  onAuthChange(cb: (user: AuthUser | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signUp(input: SignUpInput): Promise<{ needsConfirmation: boolean }>
  signOut(): Promise<void>
  resetPassword(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  checkInvite(code: string): Promise<InviteCheck>
  fetchAll(): Promise<Partial<DataSnapshot>>
  /** Assina mudanças feitas por outros membros. `onResync` = reconectou, recarregue tudo. */
  subscribe(onChange: (e: ChangeEvent) => void, onResync: () => void): () => void
  upsert<T extends TableName>(table: T, row: Row<T>): Promise<void>
  remove(table: TableName, id: string): Promise<void>
}

export class AppError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
  }
}

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e)
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg)
}
