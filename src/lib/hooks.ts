import { useEffect, useMemo, useRef, useState } from 'react'
import { useRows, useSession, useSettings, useTable } from './store'
import { todayString } from './utils'
import type { Id, Service, Song } from '@/types'

export function useSongs(): Song[] {
  const rows = useRows('songs')
  return useMemo(() => rows.slice().sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')), [rows])
}

export function useFavoriteIds(userId?: Id | null): Set<Id> {
  const me = useSession((s) => s.user?.id)
  const uidToUse = userId ?? me
  const favs = useRows('favorites')
  return useMemo(() => new Set(favs.filter((f) => f.userId === uidToUse).map((f) => f.songId)), [favs, uidToUse])
}

/** Quantos membros favoritaram cada música. */
export function useFavoriteCounts(): Map<Id, number> {
  const favs = useRows('favorites')
  return useMemo(() => {
    const m = new Map<Id, number>()
    for (const f of favs) m.set(f.songId, (m.get(f.songId) ?? 0) + 1)
    return m
  }, [favs])
}

export function useServices(): { upcoming: Service[]; past: Service[] } {
  const rows = useRows('services')
  return useMemo(() => {
    const today = todayString()
    const sorted = rows.slice().sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
    return {
      upcoming: sorted.filter((s) => s.date >= today),
      past: sorted.filter((s) => s.date < today).reverse(),
    }
  }, [rows])
}

export function useNextService(): Service | undefined {
  const { upcoming } = useServices()
  return upcoming.find((s) => s.title.toLowerCase() !== 'ensaio') ?? upcoming[0]
}

/** Quantas vezes cada música foi tocada nos cultos já registrados. */
export function usePlayCounts(): Map<Id, number> {
  const rows = useRows('services')
  return useMemo(() => {
    const today = todayString()
    const m = new Map<Id, number>()
    for (const s of rows) if (s.date <= today) for (const it of s.items) m.set(it.songId, (m.get(it.songId) ?? 0) + 1)
    return m
  }, [rows])
}

export function useMyPref(songId: Id | undefined) {
  const me = useSession((s) => s.user?.id)
  const prefs = useTable('song_prefs')
  return songId && me ? prefs[`${me}:${songId}`] : undefined
}

export function useTeam() {
  return useTable('team_settings').team
}

export function useUnreadCount(): number {
  const me = useSession((s) => s.user?.id)
  const lastRead = useSettings((s) => s.lastChatRead)
  const msgs = useRows('messages')
  return useMemo(() => msgs.filter((m) => m.userId !== me && (!lastRead || m.createdAt > lastRead)).length, [msgs, me, lastRead])
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

/** Mantém a tela ligada (Wake Lock) enquanto o componente estiver montado. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) await lock.release()
      } catch {
        /* sem permissão / bateria fraca */
      }
    }
    void request()
    const onVisible = () => document.visibilityState === 'visible' && void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [enabled])
}

/** Rolagem automática suave do elemento (ou da janela). */
export function useAutoScroll(active: boolean, speed: number, target?: HTMLElement | null) {
  const raf = useRef(0)
  useEffect(() => {
    if (!active) return
    let last = performance.now()
    let carry = 0
    const pxPerSec = 6 + speed * 9
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      carry += pxPerSec * dt
      const step = Math.floor(carry)
      if (step >= 1) {
        carry -= step
        if (target) target.scrollTop += step
        else window.scrollBy(0, step)
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [active, speed, target])
}

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Adoração` : 'Adoração · Ministério de Louvor'
  }, [title])
}
