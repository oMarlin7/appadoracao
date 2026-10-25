// Supabase Edge Function · importar-musica · biblia
//
// Confere as referências bíblicas que a IA sugere: o livro precisa existir e o capítulo
// também (João tem 21 capítulos, então "João 25:3" fica de fora). Não confere o versículo.

/** Livro (sem acento, minúsculo) → número de capítulos. */
const BOOKS: Record<string, number> = {
  genesis: 50, exodo: 40, levitico: 27, numeros: 36, deuteronomio: 34, josue: 24, juizes: 21, rute: 4,
  '1 samuel': 31, '2 samuel': 24, '1 reis': 22, '2 reis': 25, '1 cronicas': 29, '2 cronicas': 36,
  esdras: 10, neemias: 13, ester: 10, jo: 42, salmos: 150, salmo: 150, proverbios: 31, eclesiastes: 12,
  cantares: 8, canticos: 8, 'cantico dos canticos': 8, 'canticos dos canticos': 8, 'cantares de salomao': 8,
  isaias: 66, jeremias: 52, lamentacoes: 5, ezequiel: 48, daniel: 12, oseias: 14, joel: 3, amos: 9,
  obadias: 1, jonas: 4, miqueias: 7, naum: 3, habacuque: 3, sofonias: 3, ageu: 2, zacarias: 14, malaquias: 4,
  mateus: 28, marcos: 16, lucas: 24, joao: 21, atos: 28, 'atos dos apostolos': 28, romanos: 16,
  '1 corintios': 16, '2 corintios': 13, galatas: 6, efesios: 6, filipenses: 4, colossenses: 4,
  '1 tessalonicenses': 5, '2 tessalonicenses': 3, '1 timoteo': 6, '2 timoteo': 4, tito: 3, filemom: 1,
  hebreus: 13, tiago: 5, '1 pedro': 5, '2 pedro': 3, '1 joao': 5, '2 joao': 1, '3 joao': 1, judas: 1,
  apocalipse: 22,
}

/** "Salmos 23:1-3", "1 Coríntios 13:4", "Isaías 53" → existe? */
export function isBibleRef(ref: string): boolean {
  const t = ref
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  const m = /^(?:([1-3])\s*[ºª°]?\s+)?([a-z]+(?: [a-z]+)*) (\d{1,3})(?:\s*[:.,]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?$/.exec(t)
  if (!m) return false
  const chapters = BOOKS[m[1] ? `${m[1]} ${m[2]}` : m[2]]
  const chapter = Number(m[3])
  const verse = m[4] ? Number(m[4]) : 1
  const until = m[5] ? Number(m[5]) : verse
  return !!chapters && chapter >= 1 && chapter <= chapters && verse >= 1 && verse <= 176 && until >= verse
}
