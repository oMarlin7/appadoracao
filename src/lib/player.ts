import { create } from 'zustand'
import { toast } from 'sonner'
import { backend } from './backend'
import { errorMessage } from './actions'
import type { Recording } from '@/types'

/**
 * Player das gravações de ensaio: um único <audio> para o app todo, então a gravação continua
 * tocando enquanto o membro navega (cifra, setlist, chat…).
 */

export interface Track {
  id: string
  title: string
  subtitle?: string
  storagePath: string
  songId?: string | null
}

interface PlayerState {
  track: Track | null
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error'
  position: number
  duration: number
  rate: number
  loop: boolean
  play(track: Track): Promise<void>
  toggle(): void
  seek(seconds: number): void
  skip(delta: number): void
  setRate(rate: number): void
  setLoop(loop: boolean): void
  stop(): void
}

let audio: HTMLAudioElement | null = null

function el(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'metadata'
  const set = usePlayer.setState
  audio.addEventListener('timeupdate', () => set({ position: audio!.currentTime }))
  audio.addEventListener('durationchange', () => set({ duration: Number.isFinite(audio!.duration) ? audio!.duration : 0 }))
  audio.addEventListener('play', () => set({ status: 'playing' }))
  audio.addEventListener('pause', () => set((s) => ({ status: s.status === 'loading' ? s.status : 'paused' })))
  audio.addEventListener('ended', () => set({ status: 'paused', position: 0 }))
  audio.addEventListener('error', () => {
    if (!usePlayer.getState().track) return
    set({ status: 'error' })
    toast.error('Não foi possível tocar esta gravação')
  })
  return audio
}

export const usePlayer = create<PlayerState>()((set, get) => ({
  track: null,
  status: 'idle',
  position: 0,
  duration: 0,
  rate: 1,
  loop: false,
  async play(track) {
    const a = el()
    if (get().track?.id === track.id && get().status !== 'error') {
      void a.play()
      return
    }
    a.pause()
    set({ track, status: 'loading', position: 0, duration: 0 })
    try {
      const url = await backend.fileUrl(track.storagePath)
      if (get().track?.id !== track.id) return
      a.src = url
      a.playbackRate = get().rate
      a.loop = get().loop
      await a.play()
      updateMediaSession(track)
    } catch (e) {
      if (get().track?.id !== track.id) return
      set({ status: 'error' })
      if ((e as Error)?.name !== 'AbortError') toast.error('Não foi possível tocar esta gravação', { description: errorMessage(e) })
    }
  },
  toggle() {
    const a = el()
    if (a.paused) void a.play()
    else a.pause()
  },
  seek(seconds) {
    const a = el()
    a.currentTime = Math.max(0, Math.min(seconds, a.duration || seconds))
    set({ position: a.currentTime })
  },
  skip(delta) {
    get().seek(el().currentTime + delta)
  },
  setRate(rate) {
    el().playbackRate = rate
    set({ rate })
  },
  setLoop(loop) {
    el().loop = loop
    set({ loop })
  },
  stop() {
    const a = el()
    a.pause()
    a.removeAttribute('src')
    a.load()
    set({ track: null, status: 'idle', position: 0, duration: 0 })
  },
}))

function updateMediaSession(track: Track) {
  if (!('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.subtitle ?? 'Ensaio', album: 'Adoração' })
    navigator.mediaSession.setActionHandler('play', () => usePlayer.getState().toggle())
    navigator.mediaSession.setActionHandler('pause', () => usePlayer.getState().toggle())
    navigator.mediaSession.setActionHandler('seekbackward', () => usePlayer.getState().skip(-10))
    navigator.mediaSession.setActionHandler('seekforward', () => usePlayer.getState().skip(10))
  } catch {
    /* navegador sem suporte completo */
  }
}

export function recordingTrack(r: Recording, subtitle?: string): Track {
  return { id: r.id, title: r.title, subtitle, storagePath: r.storagePath, songId: r.songId }
}

export function formatDuration(sec: number | null | undefined): string {
  if (!sec || !Number.isFinite(sec)) return '0:00'
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
