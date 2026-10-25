import { create } from 'zustand'
import { toast } from 'sonner'
import { usePlayer } from './player'

/**
 * Prévia de 30 s das músicas na busca, para conferir se é a música certa sem abrir o vídeo.
 * Um só áudio para o app inteiro: tocar outra para a anterior. O play sai direto do toque
 * (o iPhone só deixa tocar som assim).
 */

interface PreviewState {
  /** Candidato tocando (ou pausado) agora. */
  id: string | null
  playing: boolean
  /** 0 a 1 */
  progress: number
  toggle(id: string, url: string): void
  stop(): void
}

let audio: HTMLAudioElement | null = null

function el(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'none'
  const set = usePreview.setState
  audio.addEventListener('play', () => set({ playing: true }))
  audio.addEventListener('pause', () => set({ playing: false }))
  audio.addEventListener('timeupdate', () => set({ progress: audio!.duration ? audio!.currentTime / audio!.duration : 0 }))
  audio.addEventListener('ended', () => set({ id: null, playing: false, progress: 0 }))
  audio.addEventListener('error', () => {
    if (!usePreview.getState().id) return
    set({ id: null, playing: false, progress: 0 })
    toast('Não deu para tocar a prévia agora')
  })
  return audio
}

export const usePreview = create<PreviewState>()((set, get) => ({
  id: null,
  playing: false,
  progress: 0,
  toggle(id, url) {
    const a = el()
    if (get().id === id) {
      if (a.paused) void a.play().catch(() => {})
      else a.pause()
      return
    }
    // Uma gravação de ensaio tocando no mini player para enquanto a prévia toca.
    if (usePlayer.getState().status === 'playing') usePlayer.getState().toggle()
    a.pause()
    a.src = url
    set({ id, playing: false, progress: 0 })
    void a.play().catch((e: unknown) => {
      if ((e as Error)?.name === 'AbortError') return
      set({ id: null, playing: false, progress: 0 })
      toast('Não deu para tocar a prévia agora')
    })
  },
  stop() {
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    set({ id: null, playing: false, progress: 0 })
  },
}))
