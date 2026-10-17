import { del, get, set } from 'idb-keyval'
import { useEffect, useState } from 'react'
import { backend, isDemo, isNetworkError, type ChangeEvent } from './backend'
import { readJson, removeStorage, writeStorage } from './storage'
import { useData } from './store'
import type { DataSnapshot, Row, TableName } from '@/types'

/**
 * Sincronização "local primeiro":
 *  1. mostra na hora o que está no cache do aparelho (funciona sem internet);
 *  2. busca tudo do servidor e assina as mudanças em tempo real;
 *  3. alterações feitas offline entram numa fila e são enviadas quando a conexão volta.
 */

type Op = { op: 'upsert'; table: TableName; row: Row } | { op: 'delete'; table: TableName; id: string }

const OUTBOX_KEY = 'adoracao:outbox'
const cacheKey = (userId: string) => `adoracao:cache:${userId}`

function readOutbox(): Op[] {
  return readJson<Op[]>('local', OUTBOX_KEY, [])
}

function writeOutbox(ops: Op[]) {
  writeStorage('local', OUTBOX_KEY, JSON.stringify(ops))
  outboxListeners.forEach((l) => l(ops.length))
}

const outboxListeners = new Set<(n: number) => void>()

export function enqueue(op: Op) {
  // Mantém só a última operação por linha.
  const key = (o: Op) => `${o.table}:${o.op === 'upsert' ? (o.row as { id: string }).id : o.id}`
  const ops = readOutbox().filter((o) => key(o) !== key(op))
  ops.push(op)
  writeOutbox(ops)
}

let flushing = false

export async function flushOutbox(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    let ops = readOutbox()
    while (ops.length) {
      const op = ops[0]
      try {
        if (op.op === 'upsert') await backend.upsert(op.table, op.row)
        else await backend.remove(op.table, op.id)
      } catch (e) {
        if (isNetworkError(e)) break
        console.warn('Operação descartada da fila', op, e)
      }
      ops = readOutbox().slice(1)
      writeOutbox(ops)
    }
  } finally {
    flushing = false
  }
}

function applyOps(snapshot: Partial<DataSnapshot>, ops: Op[]) {
  for (const op of ops) {
    const table = (snapshot[op.table] ?? {}) as Record<string, Row>
    if (op.op === 'upsert') table[(op.row as { id: string }).id] = op.row
    else delete table[op.id]
    ;(snapshot as Record<string, unknown>)[op.table] = table
  }
}

function applyChange(e: ChangeEvent) {
  const store = useData.getState()
  if (e.type === 'upsert') store.upsertLocal(e.table, e.row as never)
  else store.removeLocal(e.table, e.id)
}

export async function refresh(): Promise<void> {
  const store = useData.getState()
  store.setSyncing(true)
  try {
    const snapshot = await backend.fetchAll()
    applyOps(snapshot, readOutbox())
    useData.getState().hydrate(snapshot)
  } catch (e) {
    // Sem rede e com cache: segue com o que temos.
    if (!useData.getState().loaded) throw e
  } finally {
    useData.getState().setSyncing(false)
  }
}

let stopCurrent: (() => void) | null = null

export async function startSync(userId: string): Promise<void> {
  stopSync()
  const cleanups: Array<() => void> = []
  stopCurrent = () => cleanups.forEach((c) => c())

  if (!isDemo) {
    try {
      const cached = await get<DataSnapshot>(cacheKey(userId))
      if (cached && !useData.getState().loaded) useData.getState().hydrate(cached)
    } catch {
      /* sem cache */
    }
    // Salva o cache (debounce) sempre que os dados mudarem.
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubStore = useData.subscribe((s, prev) => {
      if (s.data === prev.data) return
      clearTimeout(timer)
      timer = setTimeout(() => set(cacheKey(userId), useData.getState().data).catch(() => {}), 800)
    })
    cleanups.push(() => {
      clearTimeout(timer)
      unsubStore()
    })
  }

  cleanups.push(backend.subscribe(applyChange, () => void refresh()))

  const onOnline = () => {
    void flushOutbox().then(refresh)
  }
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    const last = useData.getState().lastSync ?? 0
    if (Date.now() - last > 60_000) void flushOutbox().then(refresh)
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  cleanups.push(() => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
  })

  await refresh()
  void flushOutbox()
}

export function stopSync() {
  stopCurrent?.()
  stopCurrent = null
}

export async function clearLocalCache(userId: string | null) {
  if (userId) await del(cacheKey(userId)).catch(() => {})
  removeStorage('local', OUTBOX_KEY)
  outboxListeners.forEach((l) => l(0))
}

// ---------------------------------------------------------------------------
// Hooks de status
// ---------------------------------------------------------------------------

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function usePendingCount(): number {
  const [n, setN] = useState(() => readOutbox().length)
  useEffect(() => {
    outboxListeners.add(setN)
    return () => {
      outboxListeners.delete(setN)
    }
  }, [])
  return n
}
