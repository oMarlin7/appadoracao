/**
 * Áudio sintetizado para as gravações de exemplo do modo demonstração: uma progressão de
 * acordes com pulso de metrônomo, gerada no aparelho (nada é baixado).
 */

const NOTE: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 }

function chordFreqs(name: string): number[] {
  const m = /^([A-G]#?)(m?)$/.exec(name)
  if (!m) return []
  const root = NOTE[m[1]]
  const third = m[2] ? 3 : 4
  // Fundamental na região de 3ª oitava + tríade uma oitava acima.
  return [root - 12, root, root + third, root + 7].map((n) => 220 * Math.pow(2, (n - 9 + 12) / 12 - 1))
}

function writeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true)
  return new Blob([buf], { type: 'audio/wav' })
}

export function synthRehearsal(chords: string[], bpm = 76, bars = 8): Blob {
  const rate = 22050
  const beat = 60 / bpm
  const total = bars * 4 * beat + 1.5
  const out = new Float32Array(Math.ceil(total * rate))
  for (let bar = 0; bar < bars; bar++) {
    const freqs = chordFreqs(chords[bar % chords.length])
    const start = bar * 4 * beat
    const len = 4 * beat + 1.2
    const s0 = Math.floor(start * rate)
    for (let i = 0; i < len * rate && s0 + i < out.length; i++) {
      const t = i / rate
      const env = Math.min(1, t / 0.04) * Math.exp(-t * 0.9)
      let x = 0
      freqs.forEach((f, k) => {
        x += (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * (k === 0 ? 0.5 : 0.32)
      })
      out[s0 + i] += x * env * 0.22
    }
    // Pulso suave em cada tempo
    for (let b = 0; b < 4; b++) {
      const c0 = Math.floor((start + b * beat) * rate)
      for (let i = 0; i < 0.05 * rate && c0 + i < out.length; i++) {
        const t = i / rate
        out[c0 + i] += Math.sin(2 * Math.PI * (b === 0 ? 1600 : 1100) * t) * Math.exp(-t * 90) * 0.18
      }
    }
  }
  return writeWav(out, rate)
}
