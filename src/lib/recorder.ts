import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Gravação pelo microfone do aparelho (MediaRecorder). Sem filtros de voz de chamada
 * (cancelamento de eco/ruído), que estragam música.
 */

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export function recordingSupported(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export type RecorderState = 'idle' | 'asking' | 'recording' | 'paused' | 'done' | 'error'

export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | undefined>(undefined)
  const raf = useRef<number | undefined>(undefined)
  const ctx = useRef<AudioContext | null>(null)
  const startedAt = useRef(0)
  const accumulated = useRef(0)

  const cleanup = useCallback(() => {
    window.clearInterval(timer.current)
    if (raf.current) cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    void ctx.current?.close().catch(() => {})
    ctx.current = null
    setLevel(0)
  }, [])

  useEffect(() => cleanup, [cleanup])

  const tick = () => setElapsed(accumulated.current + (Date.now() - startedAt.current) / 1000)

  const start = useCallback(async () => {
    setError(null)
    setBlob(null)
    setElapsed(0)
    accumulated.current = 0
    setState('asking')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      stream.current = s
      const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported?.(m))
      const r = new MediaRecorder(s, mimeType ? { mimeType, audioBitsPerSecond: 128_000 } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      r.onstop = () => {
        setBlob(new Blob(chunks.current, { type: (r.mimeType || 'audio/webm').split(';')[0] }))
        setState('done')
        cleanup()
      }
      r.start(1000)
      rec.current = r
      startedAt.current = Date.now()
      timer.current = window.setInterval(tick, 250)
      setState('recording')

      // Medidor de volume
      try {
        const ac = new AudioContext()
        ctx.current = ac
        const analyser = ac.createAnalyser()
        analyser.fftSize = 512
        ac.createMediaStreamSource(s).connect(analyser)
        const data = new Uint8Array(analyser.fftSize)
        const loop = () => {
          analyser.getByteTimeDomainData(data)
          let peak = 0
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
          setLevel(Math.min(1, peak / 100))
          raf.current = requestAnimationFrame(loop)
        }
        loop()
      } catch {
        /* sem medidor */
      }
    } catch (e) {
      cleanup()
      setState('error')
      setError(
        (e as Error)?.name === 'NotAllowedError'
          ? 'O app precisa de permissão para usar o microfone. Libere nas configurações do navegador.'
          : 'Não foi possível acessar o microfone deste aparelho.',
      )
    }
  }, [cleanup])

  const pause = useCallback(() => {
    if (rec.current?.state !== 'recording') return
    rec.current.pause()
    accumulated.current += (Date.now() - startedAt.current) / 1000
    window.clearInterval(timer.current)
    setState('paused')
  }, [])

  const resume = useCallback(() => {
    if (rec.current?.state !== 'paused') return
    rec.current.resume()
    startedAt.current = Date.now()
    timer.current = window.setInterval(tick, 250)
    setState('recording')
  }, [])

  const stop = useCallback(() => {
    if (!rec.current || rec.current.state === 'inactive') return
    if (rec.current.state === 'recording') accumulated.current += (Date.now() - startedAt.current) / 1000
    setElapsed(accumulated.current)
    window.clearInterval(timer.current)
    rec.current.stop()
  }, [])

  const reset = useCallback(() => {
    if (rec.current && rec.current.state !== 'inactive') {
      rec.current.onstop = null
      rec.current.stop()
    }
    cleanup()
    setBlob(null)
    setElapsed(0)
    setState('idle')
  }, [cleanup])

  return { state, elapsed, level, blob, error, start, pause, resume, stop, reset }
}

/** Duração de um arquivo de áudio/vídeo (lê só os metadados). */
export function mediaDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement(file.type.startsWith('video') ? 'video' : 'audio')
    el.preload = 'metadata'
    const done = (v: number | null) => {
      URL.revokeObjectURL(url)
      resolve(v)
    }
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null)
    el.onerror = () => done(null)
    setTimeout(() => done(null), 5000)
    el.src = url
  })
}
