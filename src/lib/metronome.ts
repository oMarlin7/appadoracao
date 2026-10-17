import { useEffect, useRef, useState } from 'react'

/**
 * Metrônomo simples com Web Audio (agenda os cliques um pouco à frente para não "escorregar").
 * O primeiro tempo do compasso soa mais agudo.
 */
export function useMetronome(bpm: number | null | undefined, beatsPerBar = 4) {
  const [running, setRunning] = useState(false)
  const [beat, setBeat] = useState(-1)
  const ctxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!running || !bpm) return
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = ctxRef.current ?? new Ctx()
    ctxRef.current = ctx
    void ctx.resume()
    const interval = 60 / bpm
    let next = ctx.currentTime + 0.06
    let count = 0
    const timers: number[] = []

    const click = (time: number, accent: boolean) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = accent ? 1560 : 1040
      gain.gain.setValueAtTime(0.0001, time)
      gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.32, time + 0.002)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05)
      osc.connect(gain).connect(ctx.destination)
      osc.start(time)
      osc.stop(time + 0.06)
    }

    const scheduler = window.setInterval(() => {
      while (next < ctx.currentTime + 0.12) {
        const n = count % beatsPerBar
        click(next, n === 0)
        const delay = Math.max(0, (next - ctx.currentTime) * 1000)
        timers.push(window.setTimeout(() => setBeat(n), delay))
        next += interval
        count++
      }
    }, 25)

    return () => {
      clearInterval(scheduler)
      timers.forEach(clearTimeout)
      setBeat(-1)
    }
  }, [running, bpm, beatsPerBar])

  useEffect(() => () => void ctxRef.current?.close().catch(() => {}), [])

  return { running, toggle: () => setRunning((r) => !r), stop: () => setRunning(false), beat }
}
