import { backend, IMPORT_FUNCTION, isDemo } from './backend'

/**
 * Busca automática de cifra e letra. A extração roda no servidor (o navegador não
 * consegue buscar os sites de cifra) e devolve o texto no formato que o app já lê, junto
 * com o nome da música como está no Cifra Club.
 * No modo demonstração (sem Supabase) não há servidor: devolve `sem-servidor`.
 */

export type SheetFetch =
  | {
      ok: true
      content: string
      originalKey: string | null
      sourceUrl: string | null
      source: string
      /** Nome da música e do artista no Cifra Club (quando a página veio da busca do site). */
      title: string | null
      artist: string | null
    }
  | { ok: false; reason: 'sem-servidor' | 'nao-encontrada' }

interface SheetResponse {
  content?: string
  originalKey?: string | null
  sourceUrl?: string | null
  source?: string
  title?: string | null
  artist?: string | null
  error?: string
}

export async function fetchSongSheet(title: string, artist: string, cifraUrl?: string | null): Promise<SheetFetch> {
  if (isDemo) return { ok: false, reason: 'sem-servidor' }
  if (!title.trim()) return { ok: false, reason: 'nao-encontrada' }
  try {
    const r = await backend.invoke<SheetResponse>(IMPORT_FUNCTION, { action: 'cifra', title: title.trim(), artist: artist.trim(), cifraUrl: cifraUrl ?? null })
    if (!r || r.error || !r.content?.trim()) return { ok: false, reason: 'nao-encontrada' }
    return {
      ok: true,
      content: r.content,
      originalKey: r.originalKey ?? null,
      sourceUrl: r.sourceUrl ?? null,
      source: r.source ?? 'web',
      title: r.title ?? null,
      artist: r.artist ?? null,
    }
  } catch {
    return { ok: false, reason: 'nao-encontrada' }
  }
}
