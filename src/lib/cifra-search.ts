import { backend, isDemo } from './backend'

/**
 * Busca automática de cifra e letra. A extração roda no servidor (o navegador não
 * consegue buscar os sites de cifra) e devolve o texto no formato que o app já lê.
 * No modo demonstração (sem Supabase) não há servidor: devolve `sem-servidor`.
 */

export type SheetFetch =
  | { ok: true; content: string; originalKey: string | null; sourceUrl: string | null; source: string }
  | { ok: false; reason: 'sem-servidor' | 'nao-encontrada' }

export async function fetchSongSheet(title: string, artist: string, cifraUrl?: string | null): Promise<SheetFetch> {
  if (isDemo) return { ok: false, reason: 'sem-servidor' }
  if (!title.trim()) return { ok: false, reason: 'nao-encontrada' }
  try {
    const r = await backend.invoke<{ content?: string; originalKey?: string | null; sourceUrl?: string | null; source?: string; error?: string }>(
      'importar-musica',
      { action: 'cifra', title: title.trim(), artist: artist.trim(), cifraUrl: cifraUrl ?? null },
    )
    if (!r || r.error || !r.content?.trim()) return { ok: false, reason: 'nao-encontrada' }
    return { ok: true, content: r.content, originalKey: r.originalKey ?? null, sourceUrl: r.sourceUrl ?? null, source: r.source ?? 'web' }
  } catch {
    return { ok: false, reason: 'nao-encontrada' }
  }
}
