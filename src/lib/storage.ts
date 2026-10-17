/**
 * Acesso seguro ao localStorage/sessionStorage: em navegação privada, com dados do site
 * bloqueados ou dentro de alguns apps, o simples acesso pode lançar erro.
 */

type Kind = 'local' | 'session'

function store(kind: Kind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function readStorage(kind: Kind, key: string): string | null {
  try {
    return store(kind)?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeStorage(kind: Kind, key: string, value: string): void {
  try {
    store(kind)?.setItem(key, value)
  } catch {
    /* sem espaço ou bloqueado: segue sem lembrar */
  }
}

export function removeStorage(kind: Kind, key: string): void {
  try {
    store(kind)?.removeItem(key)
  } catch {
    /* idem */
  }
}

export function readJson<T>(kind: Kind, key: string, fallback: T): T {
  const raw = readStorage(kind, key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
