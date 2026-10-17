import {
  Anchor,
  AudioLines,
  Bird,
  CalendarHeart,
  CloudSun,
  Coins,
  Cross,
  Crown,
  DoorOpen,
  Drum,
  Droplets,
  Ear,
  Flame,
  Gauge,
  Gift,
  Globe,
  Guitar,
  Hand,
  HandHeart,
  HandHelping,
  Heart,
  Mic,
  MicVocal,
  Moon,
  Music,
  PartyPopper,
  Piano,
  Projector,
  Send,
  Shield,
  SlidersVertical,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Sunrise,
  Waves,
  Wind,
  Wine,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { stripAccents } from './music/sheet'

export type Pastel =
  | 'lavender'
  | 'mint'
  | 'peach'
  | 'sky'
  | 'rose'
  | 'butter'
  | 'orchid'
  | 'aqua'
  | 'sage'
  | 'coral'

export const PASTELS: Pastel[] = ['lavender', 'mint', 'peach', 'sky', 'rose', 'butter', 'orchid', 'aqua', 'sage', 'coral']

/** Estilo de "etiqueta" pastel (fundo suave + texto escuro), funciona no claro e no escuro. */
export function tint(color: Pastel): CSSProperties {
  return { backgroundColor: `var(--${color}-bg)`, color: `var(--${color}-ink)` }
}

export const solid = (color: Pastel) => `var(--${color}-solid)`
export const ink = (color: Pastel) => `var(--${color}-ink)`
export const soft = (color: Pastel) => `var(--${color}-bg)`

interface TaxonomyItem {
  id: string
  name: string
  short?: string
  description: string
  color: Pastel
  icon: LucideIcon
}

export interface Theme extends TaxonomyItem {
  verse?: { text: string; ref: string }
  /** Palavras/expressões (sem acento, minúsculas) que indicam o tema numa letra. */
  keywords: string[]
}

export const THEMES: Theme[] = [
  {
    id: 'adoracao',
    name: 'Adoração & Intimidade',
    short: 'Adoração',
    description: 'Reverência, contemplação e intimidade diante de Deus.',
    color: 'lavender',
    icon: Sparkles,
    verse: { text: 'Vinde, adoremos e prostremo-nos; ajoelhemos diante do Senhor.', ref: 'Salmos 95:6' },
    keywords: ['adorar', 'adoracao', 'adoro', 'adoramos', 'te adoro', 'prostro', 'prostrado', 'aos teus pes', 'tua presenca', 'presenca', 'intimidade', 'digno', 'face', 'contemplar', 'lugar secreto', 'trono'],
  },
  {
    id: 'celebracao',
    name: 'Louvor & Celebração',
    short: 'Celebração',
    description: 'Alegria, festa e exaltação pelo que Deus é e faz.',
    color: 'butter',
    icon: PartyPopper,
    verse: { text: 'Celebrai com júbilo ao Senhor, todas as terras.', ref: 'Salmos 100:1' },
    keywords: ['louvai', 'louvor', 'louvarei', 'louvamos', 'celebrar', 'celebracao', 'alegria', 'alegre', 'alegrai', 'dancar', 'danca', 'palmas', 'jubilo', 'cantai', 'cantarei', 'festa', 'aleluia', 'exultar', 'gritai', 'hosana'],
  },
  {
    id: 'gratidao',
    name: 'Gratidão',
    description: 'Reconhecer a bondade de Deus e tudo o que Ele já fez.',
    color: 'peach',
    icon: HandHeart,
    verse: { text: 'Rendei graças ao Senhor, porque ele é bom.', ref: 'Salmos 136:1' },
    keywords: ['obrigado', 'gratidao', 'grato', 'agradeco', 'agradecer', 'gracas te dou', 'dou gracas', 'rendei gracas', 'bencaos', 'quanto deus ja fez', 'bondade'],
  },
  {
    id: 'entrega',
    name: 'Entrega & Rendição',
    short: 'Entrega',
    description: 'A vida no altar: rendição, consagração e obediência.',
    color: 'sky',
    icon: Hand,
    verse: { text: 'Apresenteis o vosso corpo como sacrifício vivo, santo e agradável a Deus.', ref: 'Romanos 12:1' },
    keywords: ['entrego', 'entrega', 'rendido', 'rendicao', 'me rendo', 'eis-me aqui', 'eis me aqui', 'toma', 'minha vida', 'tudo que sou', 'consagro', 'consagracao', 'seja feita', 'tal qual estou', 'altar', 'quero ser'],
  },
  {
    id: 'espirito',
    name: 'Espírito Santo',
    description: 'Presença, poder e o mover do Espírito.',
    color: 'aqua',
    icon: Bird,
    verse: { text: 'Recebereis poder, ao descer sobre vós o Espírito Santo.', ref: 'Atos 1:8' },
    keywords: ['espirito', 'espirito santo', 'uncao', 'pentecostes', 'derrama', 'consolador', 'vento', 'sopro', 'chuvas', 'chuva', 'rio', 'pomba', 'enche-me', 'enche me'],
  },
  {
    id: 'avivamento',
    name: 'Avivamento & Fogo',
    short: 'Avivamento',
    description: 'Clamor por renovo, fogo no altar e paixão por Deus.',
    color: 'coral',
    icon: Flame,
    verse: { text: 'Aviva, ó Senhor, a tua obra no meio dos anos.', ref: 'Habacuque 3:2' },
    keywords: ['avivamento', 'aviva', 'fogo', 'chamas', 'arder', 'queima', 'renovo', 'desperta', 'despertar', 'avivar'],
  },
  {
    id: 'cruz',
    name: 'Cruz & Sangue',
    description: 'O sacrifício de Cristo e o poder do seu sangue.',
    color: 'rose',
    icon: Cross,
    verse: { text: 'Ele foi traspassado pelas nossas transgressões.', ref: 'Isaías 53:5' },
    keywords: ['cruz', 'sangue', 'calvario', 'cordeiro', 'morreu', 'morte', 'pregos', 'madeiro', 'espinhos', 'ferido', 'redencao', 'resgate', 'sacrificio', 'golgota', 'remido', 'remidor'],
  },
  {
    id: 'graca',
    name: 'Graça & Perdão',
    description: 'Amor imerecido que perdoa, aceita e transforma.',
    color: 'orchid',
    icon: Gift,
    verse: { text: 'Pela graça sois salvos, mediante a fé; é dom de Deus.', ref: 'Efésios 2:8' },
    keywords: ['graca', 'perdao', 'perdoou', 'perdoado', 'misericordia', 'imerecido', 'pecador', 'pecado', 'lavou', 'lava-me', 'lava me', 'alvo', 'neve', 'salvacao', 'salvo'],
  },
  {
    id: 'fe',
    name: 'Fé & Confiança',
    description: 'Confiança firme nas promessas e na fidelidade de Deus.',
    color: 'sage',
    icon: Anchor,
    verse: { text: 'A fé é a certeza das coisas que se esperam.', ref: 'Hebreus 11:1' },
    keywords: ['fe', 'confio', 'confianca', 'creio', 'crer', 'nao temerei', 'rocha', 'firme', 'promessas', 'fiel', 'fidelidade', 'em ti confio', 'seguranca', 'sustenta', 'castelo'],
  },
  {
    id: 'esperanca',
    name: 'Esperança & Consolo',
    short: 'Esperança',
    description: 'Consolo na dor e esperança que não decepciona.',
    color: 'sky',
    icon: Sunrise,
    verse: { text: 'E Deus limpará de seus olhos toda lágrima.', ref: 'Apocalipse 21:4' },
    keywords: ['esperanca', 'espero', 'consolo', 'consola', 'conforto', 'lagrimas', 'chorar', 'dor', 'nao desanimes', 'cuidara', 'amanha', 'aflicao', 'vale', 'tempestade', 'vagas', 'procelosas', 'paz'],
  },
  {
    id: 'cura',
    name: 'Cura & Restauração',
    short: 'Cura',
    description: 'Deus que cura, liberta e faz novas todas as coisas.',
    color: 'mint',
    icon: Sprout,
    verse: { text: 'Eu sou o Senhor que te sara.', ref: 'Êxodo 15:26' },
    keywords: ['cura', 'curar', 'sara', 'sarar', 'restaura', 'restauracao', 'toca em mim', 'milagre', 'levanta', 'faz novo', 'novo coracao', 'liberta', 'liberdade', 'cadeias', 'renova'],
  },
  {
    id: 'vitoria',
    name: 'Vitória & Batalha',
    short: 'Vitória',
    description: 'Guerra espiritual e a vitória que vem do Senhor.',
    color: 'coral',
    icon: Shield,
    verse: { text: 'Graças a Deus, que nos dá a vitória por nosso Senhor Jesus Cristo.', ref: '1 Coríntios 15:57' },
    keywords: ['vitoria', 'vitorioso', 'vencer', 'venceu', 'vencedor', 'vencendo', 'guerra', 'batalha', 'inimigo', 'muralhas', 'gigantes', 'leao', 'forte', 'poder', 'triunfo', 'espada', 'escudo'],
  },
  {
    id: 'majestade',
    name: 'Majestade & Santidade',
    short: 'Majestade',
    description: 'A grandeza, a soberania e a santidade de Deus.',
    color: 'lavender',
    icon: Crown,
    verse: { text: 'Santo, santo, santo é o Senhor dos Exércitos.', ref: 'Isaías 6:3' },
    keywords: ['santo', 'santidade', 'majestade', 'rei', 'reis', 'senhor dos senhores', 'soberano', 'onipotente', 'excelso', 'grandioso', 'coroai', 'coroa', 'gloria', 'altissimo', 'reina', 'trono'],
  },
  {
    id: 'amor',
    name: 'Amor de Deus',
    description: 'O amor do Pai que nos alcança e nos chama de filhos.',
    color: 'rose',
    icon: Heart,
    verse: { text: 'Deus amou o mundo de tal maneira que deu o seu Filho unigênito.', ref: 'João 3:16' },
    keywords: ['amor', 'amou', 'ama', 'amado', 'filho', 'filhos', 'pai', 'abraco', 'bracos', 'cuidado', 'amigo'],
  },
  {
    id: 'oracao',
    name: 'Oração & Clamor',
    short: 'Clamor',
    description: 'Buscar a face de Deus, interceder e depender dEle.',
    color: 'orchid',
    icon: Ear,
    verse: { text: 'Clama a mim, e responder-te-ei.', ref: 'Jeremias 33:3' },
    keywords: ['oracao', 'orar', 'oro', 'clamor', 'clamo', 'clamamos', 'ouve', 'escuta', 'busco', 'buscar', 'sonda', 'preciso de ti', 'mais perto', 'socorro'],
  },
  {
    id: 'missoes',
    name: 'Missões & Envio',
    short: 'Missões',
    description: 'Ide e fazei discípulos: o chamado para as nações.',
    color: 'mint',
    icon: Globe,
    verse: { text: 'Ide por todo o mundo e pregai o evangelho a toda criatura.', ref: 'Marcos 16:15' },
    keywords: ['nacoes', 'missoes', 'ide', 'pregai', 'evangelho', 'anunciar', 'mundo', 'povos', 'ceifa', 'seara', 'enviar', 'envia-me', 'envia me'],
  },
  {
    id: 'eternidade',
    name: 'Volta de Jesus & Eternidade',
    short: 'Eternidade',
    description: 'O céu, a eternidade e a esperança da volta de Cristo.',
    color: 'sky',
    icon: CloudSun,
    verse: { text: 'Certamente cedo venho. Amém. Ora vem, Senhor Jesus.', ref: 'Apocalipse 22:20' },
    keywords: ['ceus', 'eternidade', 'eternamente', 'voltara', 'nuvens', 'gloria eterna', 'cidade santa', 'mansao', 'arrebatamento', 'trombeta', 'nova jerusalem'],
  },
  {
    id: 'natal',
    name: 'Natal',
    description: 'O nascimento de Jesus: Deus conosco.',
    color: 'butter',
    icon: Star,
    verse: { text: 'Hoje vos nasceu o Salvador, que é Cristo, o Senhor.', ref: 'Lucas 2:11' },
    keywords: ['natal', 'menino', 'belem', 'manjedoura', 'nasceu', 'nascimento', 'estrela', 'pastores', 'magos', 'emanuel'],
  },
  {
    id: 'pascoa',
    name: 'Páscoa & Ressurreição',
    short: 'Ressurreição',
    description: 'O túmulo vazio: Cristo vive e reina.',
    color: 'peach',
    icon: Sun,
    verse: { text: 'Ele não está aqui, porque já ressuscitou.', ref: 'Mateus 28:6' },
    keywords: ['ressuscitou', 'ressurreicao', 'vive', 'tumulo', 'sepulcro', 'pascoa', 'venceu a morte', 'ressurreto', 'levantou'],
  },
]

export interface Moment extends TaxonomyItem {
  /** Temas que costumam funcionar nesse momento. */
  themes: string[]
  tempos: Tempo[]
}

export type Tempo = 'lenta' | 'moderada' | 'rapida'

export const MOMENTS: Moment[] = [
  {
    id: 'abertura',
    name: 'Abertura',
    description: 'Chamada à adoração: une a igreja e abre o culto.',
    color: 'butter',
    icon: DoorOpen,
    themes: ['celebracao', 'majestade', 'gratidao', 'vitoria'],
    tempos: ['rapida', 'moderada'],
  },
  {
    id: 'louvor',
    name: 'Louvor',
    description: 'Celebração, alegria e exaltação.',
    color: 'peach',
    icon: Music,
    themes: ['celebracao', 'vitoria', 'gratidao', 'majestade', 'pascoa'],
    tempos: ['rapida', 'moderada'],
  },
  {
    id: 'adoracao',
    name: 'Adoração',
    description: 'Contemplação e intimidade — o coração se derrama.',
    color: 'lavender',
    icon: Sparkles,
    themes: ['adoracao', 'majestade', 'amor', 'espirito'],
    tempos: ['lenta', 'moderada'],
  },
  {
    id: 'ministracao',
    name: 'Ministração',
    description: 'Após a palavra: resposta, quebrantamento e mover do Espírito.',
    color: 'sky',
    icon: Waves,
    themes: ['entrega', 'espirito', 'cura', 'graca', 'avivamento'],
    tempos: ['lenta', 'moderada'],
  },
  {
    id: 'oracao',
    name: 'Oração & Clamor',
    short: 'Oração',
    description: 'Fundo para oração, intercessão e clamor.',
    color: 'orchid',
    icon: Ear,
    themes: ['oracao', 'espirito', 'entrega', 'avivamento'],
    tempos: ['lenta'],
  },
  {
    id: 'oferta',
    name: 'Dízimos & Ofertas',
    short: 'Ofertas',
    description: 'Gratidão e generosidade no momento da oferta.',
    color: 'mint',
    icon: Coins,
    themes: ['gratidao', 'entrega', 'fe'],
    tempos: ['moderada', 'lenta'],
  },
  {
    id: 'ceia',
    name: 'Santa Ceia',
    short: 'Ceia',
    description: 'Memória da cruz, comunhão e exame do coração.',
    color: 'rose',
    icon: Wine,
    themes: ['cruz', 'graca', 'amor'],
    tempos: ['lenta'],
  },
  {
    id: 'apelo',
    name: 'Apelo',
    description: 'Convite para entregar a vida a Jesus.',
    color: 'sage',
    icon: HandHelping,
    themes: ['graca', 'entrega', 'amor', 'cruz'],
    tempos: ['lenta'],
  },
  {
    id: 'encerramento',
    name: 'Encerramento & Envio',
    short: 'Encerramento',
    description: 'Fé, missão e esperança para a semana.',
    color: 'aqua',
    icon: Send,
    themes: ['missoes', 'vitoria', 'fe', 'esperanca', 'celebracao'],
    tempos: ['rapida', 'moderada'],
  },
  {
    id: 'batismo',
    name: 'Batismo',
    description: 'Celebração da nova vida em Cristo.',
    color: 'sky',
    icon: Droplets,
    themes: ['entrega', 'graca', 'cruz', 'pascoa'],
    tempos: ['moderada', 'lenta'],
  },
  {
    id: 'especial',
    name: 'Ocasiões especiais',
    short: 'Especiais',
    description: 'Casamentos, apresentação de crianças, homenagens, datas.',
    color: 'coral',
    icon: CalendarHeart,
    themes: ['amor', 'gratidao', 'natal', 'pascoa'],
    tempos: ['moderada', 'lenta', 'rapida'],
  },
]

export const TEMPOS: Array<TaxonomyItem & { id: Tempo }> = [
  { id: 'lenta', name: 'Lenta', description: 'Contemplativa, para adoração.', color: 'sky', icon: Moon },
  { id: 'moderada', name: 'Moderada', description: 'Andamento médio.', color: 'sage', icon: Gauge },
  { id: 'rapida', name: 'Animada', description: 'Para celebrar.', color: 'peach', icon: Zap },
]

export interface MinistryRole {
  id: string
  name: string
  icon: LucideIcon
  color: Pastel
  /** Prefere ver a letra (cantores) ou a cifra (músicos)? */
  prefers: 'letra' | 'cifra'
}

export const ROLES: MinistryRole[] = [
  { id: 'ministro', name: 'Ministro(a)', icon: MicVocal, color: 'lavender', prefers: 'cifra' },
  { id: 'vocal', name: 'Vocal', icon: Mic, color: 'rose', prefers: 'letra' },
  { id: 'backvocal', name: 'Back vocal', icon: Mic, color: 'orchid', prefers: 'letra' },
  { id: 'violao', name: 'Violão', icon: Guitar, color: 'peach', prefers: 'cifra' },
  { id: 'guitarra', name: 'Guitarra', icon: Guitar, color: 'coral', prefers: 'cifra' },
  { id: 'baixo', name: 'Baixo', icon: AudioLines, color: 'sky', prefers: 'cifra' },
  { id: 'teclado', name: 'Teclado', icon: Piano, color: 'mint', prefers: 'cifra' },
  { id: 'bateria', name: 'Bateria', icon: Drum, color: 'butter', prefers: 'cifra' },
  { id: 'percussao', name: 'Percussão', icon: Drum, color: 'sage', prefers: 'cifra' },
  { id: 'sopro', name: 'Sopros', icon: Wind, color: 'aqua', prefers: 'cifra' },
  { id: 'som', name: 'Som / Técnica', icon: SlidersVertical, color: 'sage', prefers: 'letra' },
  { id: 'midia', name: 'Mídia / Projeção', icon: Projector, color: 'aqua', prefers: 'letra' },
]

export const SERVICE_PRESETS = [
  'Culto de Domingo',
  'Culto de Celebração',
  'Culto de Oração',
  'Culto de Jovens',
  'Culto de Santa Ceia',
  'Ensaio',
  'Evento especial',
]

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x])) as Record<string, T>
export const THEME_BY_ID = byId(THEMES)
export const MOMENT_BY_ID = byId(MOMENTS)
export const TEMPO_BY_ID = byId(TEMPOS)
export const ROLE_BY_ID = byId(ROLES)

export const themeName = (id: string, short = false) =>
  (short ? THEME_BY_ID[id]?.short : undefined) ?? THEME_BY_ID[id]?.name ?? id
export const momentName = (id: string, short = false) =>
  (short ? MOMENT_BY_ID[id]?.short : undefined) ?? MOMENT_BY_ID[id]?.name ?? id

// ---------------------------------------------------------------------------
// Sugestões automáticas (usadas ao cadastrar/importar músicas)
// ---------------------------------------------------------------------------

export function normalizeForMatch(text: string): string {
  return ` ${stripAccents(text.toLowerCase()).replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ')} `
}

/** Pontua os temas pela letra: cada palavra-chave encontrada soma (expressões valem mais). */
export function suggestThemes(lyrics: string, limit = 4): string[] {
  const text = normalizeForMatch(lyrics)
  const scored = THEMES.map((t) => {
    let score = 0
    for (const kw of t.keywords) {
      const needle = ` ${kw} `
      let idx = text.indexOf(needle)
      let hits = 0
      while (idx !== -1 && hits < 4) {
        hits++
        idx = text.indexOf(needle, idx + 1)
      }
      score += hits * (kw.includes(' ') ? 2 : 1)
    }
    return { id: t.id, score }
  })
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.id)
}

/** Momentos prováveis a partir dos temas e do ritmo. */
export function suggestMoments(themes: string[], tempo: Tempo | null | undefined, limit = 3): string[] {
  return MOMENTS.map((m) => {
    let score = themes.reduce((acc, t, i) => acc + (m.themes.includes(t) ? 3 - Math.min(i, 2) * 0.5 : 0), 0)
    if (tempo && m.tempos.includes(tempo)) score += m.tempos[0] === tempo ? 2 : 1
    if (m.id === 'especial' || m.id === 'batismo') score -= 2
    return { id: m.id, score }
  })
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.id)
}
