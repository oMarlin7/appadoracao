import { useEffect, useMemo, useState } from 'react'
import { detectKeyFromText } from './music/analyze'
import { docChords, parseSheet, transposeDoc } from './music/sheet'
import { makeSpeller, mod12, semitonesBetween, transposeKey } from './music/theory'
import { useMyPref } from './hooks'
import { useMe, useSettings } from './store'
import { ROLE_BY_ID } from './taxonomy'
import type { Song } from '@/types'

export type KeySource = 'culto' | 'meu' | 'equipe' | 'original' | 'alterado'

/** Estado de exibição de uma cifra: tom escolhido, capotraste e documento já transposto. */
export function useSongSheet(song: Song | undefined, opts: { serviceKey?: string | null } = {}) {
  const pref = useMyPref(song?.id)
  const accidentals = useSettings((s) => s.accidentals)
  const parsed = useMemo(() => parseSheet(song?.content ?? ''), [song?.content])
  const hasChords = useMemo(() => docChords(parsed).length > 0, [parsed])
  const detected = useMemo(() => (song && !song.originalKey && hasChords ? detectKeyFromText(song.content) : null), [song, hasChords])
  const baseKey = song?.originalKey ?? detected ?? null
  const preferredKey = opts.serviceKey ?? pref?.key ?? song?.teamKey ?? baseKey

  const [displayKey, setDisplayKey] = useState<string | null>(preferredKey)
  const [capo, setCapo] = useState<number>(pref?.capo ?? 0)
  useEffect(() => {
    setDisplayKey(preferredKey)
    // Só quando muda a música ou o contexto (não a cada atualização em tempo real).
  }, [song?.id, opts.serviceKey])
  useEffect(() => {
    setCapo(pref?.capo ?? 0)
  }, [song?.id])

  const doc = useMemo(() => {
    if (!baseKey || !displayKey) return parsed
    const shift = semitonesBetween(baseKey, displayKey) - capo
    if (mod12(shift) === 0 && accidentals === 'auto') return parsed
    const shapeKey = capo ? transposeKey(displayKey, -capo) : displayKey
    return transposeDoc(parsed, shift, makeSpeller(shapeKey, accidentals))
  }, [parsed, baseKey, displayKey, capo, accidentals])

  let source: KeySource = 'alterado'
  if (displayKey && opts.serviceKey && displayKey === opts.serviceKey) source = 'culto'
  else if (displayKey && pref?.key && displayKey === pref.key) source = 'meu'
  else if (displayKey && song?.teamKey && displayKey === song.teamKey) source = 'equipe'
  else if (displayKey && displayKey === baseKey) source = 'original'

  const shapeKey = displayKey && capo ? transposeKey(displayKey, -capo) : displayKey

  return { doc, parsed, baseKey, displayKey, setDisplayKey, capo, setCapo, pref, hasChords, source, shapeKey, detected }
}

export const KEY_SOURCE_LABEL: Record<KeySource, string> = {
  culto: 'Tom do culto',
  meu: 'Meu tom',
  equipe: 'Tom da equipe',
  original: 'Tom original',
  alterado: 'Tom alterado',
}

/** Cifra para quem toca, letra para quem canta (a não ser que o membro escolha nos ajustes). */
export function useDefaultView(hasChords: boolean): 'cifra' | 'letra' {
  const pref = useSettings((s) => s.defaultView)
  const me = useMe()
  if (!hasChords) return 'letra'
  if (pref !== 'auto') return pref
  const fns = me?.functions ?? []
  if (!fns.length) return 'cifra'
  return fns.some((f) => ROLE_BY_ID[f]?.prefers === 'cifra') ? 'cifra' : 'letra'
}
