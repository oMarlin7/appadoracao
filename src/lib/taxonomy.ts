import {
  Anchor,
  AudioLines,
  BookOpen,
  Bird,
  Briefcase,
  Church,
  Compass,
  Feather,
  Gem,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  Hourglass,
  House,
  Leaf,
  Lightbulb,
  MessageCircle,
  Mountain,
  Plane,
  Sparkle,
  Swords,
  Tent,
  Trees,
  Umbrella,
  Wheat,
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
import type { CustomTheme } from '@/types'
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

export type ThemeGroup = 'deus' | 'cristo' | 'resposta' | 'vida' | 'igreja' | 'datas' | 'equipe'

export const THEME_GROUPS: Array<{ id: ThemeGroup; name: string }> = [
  { id: 'deus', name: 'Quem Deus é' },
  { id: 'cristo', name: 'Obra de Cristo' },
  { id: 'resposta', name: 'Nossa resposta' },
  { id: 'vida', name: 'Vida com Deus' },
  { id: 'igreja', name: 'Espírito & Igreja' },
  { id: 'datas', name: 'Datas especiais' },
  { id: 'equipe', name: 'Criados pela equipe' },
]

export interface Theme extends TaxonomyItem {
  group: ThemeGroup
  /** Criado pela equipe (pode ser editado/excluído). */
  custom?: boolean
  verse?: { text: string; ref: string }
  /** Palavras/expressões (sem acento, minúsculas) que indicam o tema numa letra. */
  keywords: string[]
}

const BUILTIN_THEMES: Theme[] = [
  {
    id: 'adoracao',
    group: 'resposta',
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
    group: 'resposta',
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
    group: 'resposta',
    name: 'Gratidão',
    description: 'Reconhecer a bondade de Deus e tudo o que Ele já fez.',
    color: 'peach',
    icon: HandHeart,
    verse: { text: 'Rendei graças ao Senhor, porque ele é bom.', ref: 'Salmos 136:1' },
    keywords: ['obrigado', 'gratidao', 'grato', 'agradeco', 'agradecer', 'gracas te dou', 'dou gracas', 'rendei gracas', 'bencaos', 'quanto deus ja fez', 'bondade'],
  },
  {
    id: 'entrega',
    group: 'resposta',
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
    group: 'igreja',
    name: 'Espírito Santo',
    description: 'Presença, poder e o mover do Espírito.',
    color: 'aqua',
    icon: Bird,
    verse: { text: 'Recebereis poder, ao descer sobre vós o Espírito Santo.', ref: 'Atos 1:8' },
    keywords: ['espirito', 'espirito santo', 'uncao', 'pentecostes', 'derrama', 'consolador', 'vento', 'sopro', 'chuvas', 'chuva', 'rio', 'pomba', 'enche-me', 'enche me'],
  },
  {
    id: 'avivamento',
    group: 'igreja',
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
    group: 'cristo',
    name: 'Cruz & Sangue',
    description: 'O sacrifício de Cristo e o poder do seu sangue.',
    color: 'rose',
    icon: Cross,
    verse: { text: 'Ele foi traspassado pelas nossas transgressões.', ref: 'Isaías 53:5' },
    keywords: ['cruz', 'sangue', 'calvario', 'cordeiro', 'morreu', 'morte', 'pregos', 'madeiro', 'espinhos', 'ferido', 'redencao', 'resgate', 'sacrificio', 'golgota', 'remido', 'remidor'],
  },
  {
    id: 'graca',
    group: 'cristo',
    name: 'Graça & Perdão',
    description: 'Amor imerecido que perdoa, aceita e transforma.',
    color: 'orchid',
    icon: Gift,
    verse: { text: 'Pela graça sois salvos, mediante a fé; é dom de Deus.', ref: 'Efésios 2:8' },
    keywords: ['graca', 'perdao', 'perdoou', 'perdoado', 'misericordia', 'imerecido', 'pecador', 'pecado', 'lavou', 'lava-me', 'lava me', 'alvo', 'neve', 'salvacao', 'salvo'],
  },
  {
    id: 'fe',
    group: 'vida',
    name: 'Fé & Confiança',
    description: 'Confiança firme nas promessas e na fidelidade de Deus.',
    color: 'sage',
    icon: Anchor,
    verse: { text: 'A fé é a certeza das coisas que se esperam.', ref: 'Hebreus 11:1' },
    keywords: ['fe', 'confio', 'confianca', 'creio', 'crer', 'nao temerei', 'rocha', 'firme', 'promessas', 'fiel', 'fidelidade', 'em ti confio', 'seguranca', 'sustenta', 'castelo'],
  },
  {
    id: 'esperanca',
    group: 'vida',
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
    group: 'vida',
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
    group: 'vida',
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
    group: 'deus',
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
    group: 'deus',
    name: 'Amor de Deus',
    description: 'O amor do Pai que nos alcança e nos chama de filhos.',
    color: 'rose',
    icon: Heart,
    verse: { text: 'Deus amou o mundo de tal maneira que deu o seu Filho unigênito.', ref: 'João 3:16' },
    keywords: ['amor', 'amou', 'ama', 'amado', 'filho', 'filhos', 'pai', 'abraco', 'bracos', 'cuidado', 'amigo'],
  },
  {
    id: 'oracao',
    group: 'resposta',
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
    group: 'igreja',
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
    group: 'cristo',
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
    group: 'datas',
    name: 'Natal',
    description: 'O nascimento de Jesus: Deus conosco.',
    color: 'butter',
    icon: Star,
    verse: { text: 'Hoje vos nasceu o Salvador, que é Cristo, o Senhor.', ref: 'Lucas 2:11' },
    keywords: ['natal', 'menino', 'belem', 'manjedoura', 'nasceu', 'nascimento', 'estrela', 'pastores', 'magos', 'emanuel'],
  },
  {
    id: 'pascoa',
    group: 'cristo',
    name: 'Páscoa & Ressurreição',
    short: 'Ressurreição',
    description: 'O túmulo vazio: Cristo vive e reina.',
    color: 'peach',
    icon: Sun,
    verse: { text: 'Ele não está aqui, porque já ressuscitou.', ref: 'Mateus 28:6' },
    keywords: ['ressuscitou', 'ressurreicao', 'vive', 'tumulo', 'sepulcro', 'pascoa', 'venceu a morte', 'ressurreto', 'levantou'],
  },
  {
    id: 'fidelidade',
    group: 'deus',
    name: 'Fidelidade de Deus',
    short: 'Fidelidade',
    description: 'Deus cumpre o que promete, em todas as estações.',
    color: 'sage',
    icon: Mountain,
    verse: { text: 'As suas misericórdias não têm fim; renovam-se cada manhã. Grande é a tua fidelidade.', ref: 'Lamentações 3:22-23' },
    keywords: ['fidelidade', 'fiel', 'tua fidelidade', 'grande e a tua fidelidade', 'nunca falhou', 'nunca falha', 'cumpre', 'cumpriu', 'promessa', 'promessas', 'alianca', 'estacoes', 'todas as estacoes'],
  },
  {
    id: 'nome-jesus',
    group: 'deus',
    name: 'Nome de Jesus',
    description: 'O nome que está acima de todo nome.',
    color: 'orchid',
    icon: Sparkle,
    verse: { text: 'Deus o exaltou soberanamente e lhe deu o nome que está acima de todo nome.', ref: 'Filipenses 2:9' },
    keywords: ['nome de jesus', 'teu nome', 'seu nome', 'acima de todo nome', 'poderoso nome', 'santo nome', 'nome de cristo', 'ao nome', 'teu nome e', 'o nome'],
  },
  {
    id: 'criacao',
    group: 'deus',
    name: 'Criação & Grandeza',
    short: 'Criação',
    description: 'A glória de Deus vista em tudo o que Ele criou.',
    color: 'aqua',
    icon: Trees,
    verse: { text: 'Os céus proclamam a glória de Deus, e o firmamento anuncia as obras das suas mãos.', ref: 'Salmos 19:1' },
    keywords: ['criacao', 'criou', 'criador', 'firmamento', 'estrelas', 'mar', 'mares', 'montes', 'montanhas', 'natureza', 'universo', 'obra das tuas maos', 'ceus proclamam', 'sol', 'lua'],
  },
  {
    id: 'presenca',
    group: 'deus',
    name: 'Presença de Deus',
    short: 'Presença',
    description: 'Desejo de estar com Deus e ser cheio da Sua presença.',
    color: 'lavender',
    icon: Tent,
    verse: { text: 'Na tua presença há plenitude de alegria.', ref: 'Salmos 16:11' },
    keywords: ['tua presenca', 'sua presenca', 'presenca', 'habitar', 'habita', 'morada', 'tabernaculo', 'santo dos santos', 'estar contigo', 'perto de ti', 'mais de ti', 'enche este lugar', 'nuvem'],
  },
  {
    id: 'volta',
    group: 'cristo',
    name: 'Volta de Jesus',
    description: 'Esperança na volta de Cristo e no Reino que vem.',
    color: 'butter',
    icon: Hourglass,
    verse: { text: 'Certamente cedo venho. Amém. Ora, vem, Senhor Jesus.', ref: 'Apocalipse 22:20' },
    keywords: ['maranata', 'vem senhor', 'ora vem', 'ele voltara', 'voltara', 'sua volta', 'tua volta', 'vinda', 'trombeta', 'arrebatamento', 'cedo venho', 'noiva', 'nos ares'],
  },
  {
    id: 'arrependimento',
    group: 'resposta',
    name: 'Arrependimento & Quebrantamento',
    short: 'Arrependimento',
    description: 'Coração quebrantado, confissão e volta para Deus.',
    color: 'sky',
    icon: Feather,
    verse: { text: 'Cria em mim, ó Deus, um coração puro e renova em mim um espírito inabalável.', ref: 'Salmos 51:10' },
    keywords: ['arrependimento', 'arrependido', 'quebrantado', 'quebranta', 'quebrantamento', 'confesso', 'perdoa-me', 'perdoa me', 'pequei', 'volto', 'filho prodigo', 'coracao puro', 'cria em mim', 'contrito', 'humilha'],
  },
  {
    id: 'santidade',
    group: 'resposta',
    name: 'Santidade & Consagração',
    short: 'Santidade',
    description: 'Vida separada para Deus, pureza e obediência.',
    color: 'lavender',
    icon: Gem,
    verse: { text: 'Sede santos, porque eu sou santo.', ref: '1 Pedro 1:16' },
    keywords: ['santidade', 'santificado', 'santifica', 'santifica-me', 'pureza', 'puro', 'limpo', 'separado', 'consagrado', 'consagrar', 'obediencia', 'obedecer', 'vida santa', 'sem mancha'],
  },
  {
    id: 'paz',
    group: 'vida',
    name: 'Paz',
    description: 'A paz de Deus que guarda o coração.',
    color: 'mint',
    icon: Waves,
    verse: { text: 'E a paz de Deus, que excede todo o entendimento, guardará os vossos corações.', ref: 'Filipenses 4:7' },
    keywords: ['paz', 'tua paz', 'sossego', 'descanso', 'descansar', 'calma', 'acalma', 'aquieta', 'aquietai', 'quietude', 'sereno', 'bonanca', 'tranquilo', 'nao temas'],
  },
  {
    id: 'provisao',
    group: 'vida',
    name: 'Provisão & Cuidado',
    short: 'Provisão',
    description: 'Deus supre, cuida e sustenta em todas as necessidades.',
    color: 'butter',
    icon: Wheat,
    verse: { text: 'O meu Deus suprirá todas as vossas necessidades.', ref: 'Filipenses 4:19' },
    keywords: ['provisao', 'provedor', 'supre', 'suprira', 'sustento', 'pao', 'mana', 'jeova jire', 'cuida de mim', 'nada me faltara', 'pastor', 'abundancia', 'deserto'],
  },
  {
    id: 'protecao',
    group: 'vida',
    name: 'Refúgio & Proteção',
    short: 'Refúgio',
    description: 'Deus é abrigo, escudo e fortaleza.',
    color: 'sky',
    icon: Umbrella,
    verse: { text: 'Aquele que habita no esconderijo do Altíssimo, à sombra do Onipotente descansará.', ref: 'Salmos 91:1' },
    keywords: ['refugio', 'abrigo', 'esconderijo', 'fortaleza', 'escudo', 'protecao', 'protege', 'guardara', 'sombra', 'asas', 'debaixo das tuas asas', 'torre forte', 'livramento', 'livra'],
  },
  {
    id: 'direcao',
    group: 'vida',
    name: 'Direção & Sabedoria',
    short: 'Direção',
    description: 'Buscar a vontade de Deus e ser guiado por Ele.',
    color: 'orchid',
    icon: Compass,
    verse: { text: 'Lâmpada para os meus pés é a tua palavra e luz para o meu caminho.', ref: 'Salmos 119:105' },
    keywords: ['direcao', 'guia', 'guia-me', 'guia me', 'conduz', 'conduza', 'caminho', 'caminhos', 'tua vontade', 'sabedoria', 'ensina-me', 'ensina me', 'passos', 'luz para o meu caminho'],
  },
  {
    id: 'familia',
    group: 'vida',
    name: 'Família',
    description: 'Lar, casamento, pais e filhos debaixo da bênção de Deus.',
    color: 'rose',
    icon: House,
    verse: { text: 'Eu e a minha casa serviremos ao Senhor.', ref: 'Josué 24:15' },
    keywords: ['familia', 'familias', 'minha casa', 'meu lar', 'lar', 'casamento', 'esposa', 'marido', 'maes', 'geracoes', 'geracao', 'heranca', 'eu e a minha casa'],
  },
  {
    id: 'palavra',
    group: 'vida',
    name: 'Palavra de Deus',
    short: 'Palavra',
    description: 'A Bíblia como luz, alimento e verdade.',
    color: 'sage',
    icon: BookOpen,
    verse: { text: 'Porque a palavra de Deus é viva e eficaz.', ref: 'Hebreus 4:12' },
    keywords: ['tua palavra', 'palavra', 'escrituras', 'biblia', 'verdade', 'lei do senhor', 'mandamentos', 'lampada', 'meditar', 'medito', 'alimento'],
  },
  {
    id: 'recomeco',
    group: 'vida',
    name: 'Recomeço & Novo Tempo',
    short: 'Recomeço',
    description: 'Novas misericórdias, nova estação, coisa nova.',
    color: 'mint',
    icon: Leaf,
    verse: { text: 'Eis que faço uma coisa nova.', ref: 'Isaías 43:19' },
    keywords: ['recomeco', 'recomecar', 'novo tempo', 'nova estacao', 'coisa nova', 'novo dia', 'amanhecer', 'nova vida', 'nascer de novo', 'ano novo', 'renascer', 'todas as coisas novas'],
  },
  {
    id: 'unidade',
    group: 'igreja',
    name: 'Unidade & Comunhão',
    short: 'Comunhão',
    description: 'Igreja unida como corpo, irmãos em amor.',
    color: 'peach',
    icon: HeartHandshake,
    verse: { text: 'Oh! Quão bom e quão suave é que os irmãos vivam em união!', ref: 'Salmos 133:1' },
    keywords: ['unidade', 'unidos', 'uniao', 'um so corpo', 'corpo de cristo', 'comunhao', 'irmaos', 'igreja', 'juntos', 'familia de deus', 'um so coracao', 'povo de deus'],
  },
  {
    id: 'batalha',
    group: 'igreja',
    name: 'Batalha Espiritual',
    short: 'Batalha',
    description: 'Autoridade em Cristo, guerra espiritual e intercessão.',
    color: 'coral',
    icon: Swords,
    verse: { text: 'Revesti-vos de toda a armadura de Deus.', ref: 'Efésios 6:11' },
    keywords: ['batalha', 'guerra', 'armadura', 'autoridade', 'declaro', 'cadeias', 'correntes', 'fortalezas', 'trevas', 'inimigo', 'muralhas', 'sangue de jesus tem poder'],
  },
]

/** Ícones que a equipe pode escolher ao criar um tema. */
export const THEME_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  heart: Heart,
  flame: Flame,
  crown: Crown,
  cross: Cross,
  star: Star,
  sun: Sun,
  sunrise: Sunrise,
  leaf: Leaf,
  sprout: Sprout,
  mountain: Mountain,
  waves: Waves,
  wind: Wind,
  bird: Bird,
  shield: Shield,
  anchor: Anchor,
  book: BookOpen,
  house: House,
  church: Church,
  globe: Globe,
  gift: Gift,
  hand: HandHeart,
  handshake: HeartHandshake,
  compass: Compass,
  lightbulb: Lightbulb,
  music: Music,
  gem: Gem,
  tent: Tent,
}

/** Temas do app + temas criados pela equipe (atualizado quando a tabela muda). */
export const THEMES: Theme[] = [...BUILTIN_THEMES]

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
    themes: ['celebracao', 'majestade', 'gratidao', 'vitoria', 'unidade'],
    tempos: ['rapida', 'moderada'],
  },
  {
    id: 'louvor',
    name: 'Louvor',
    description: 'Celebração, alegria e exaltação.',
    color: 'peach',
    icon: Music,
    themes: ['celebracao', 'vitoria', 'gratidao', 'majestade', 'pascoa', 'criacao', 'nome-jesus'],
    tempos: ['rapida', 'moderada'],
  },
  {
    id: 'adoracao',
    name: 'Adoração',
    description: 'Contemplação e intimidade — o coração se derrama.',
    color: 'lavender',
    icon: Sparkles,
    themes: ['adoracao', 'majestade', 'amor', 'espirito', 'presenca', 'nome-jesus', 'santidade'],
    tempos: ['lenta', 'moderada'],
  },
  {
    id: 'ministracao',
    name: 'Ministração',
    description: 'Após a palavra: resposta, quebrantamento e mover do Espírito.',
    color: 'sky',
    icon: Waves,
    themes: ['entrega', 'espirito', 'cura', 'graca', 'avivamento', 'arrependimento', 'paz', 'fidelidade'],
    tempos: ['lenta', 'moderada'],
  },
  {
    id: 'oracao',
    name: 'Oração & Clamor',
    short: 'Oração',
    description: 'Fundo para oração, intercessão e clamor.',
    color: 'orchid',
    icon: Ear,
    themes: ['oracao', 'espirito', 'entrega', 'avivamento', 'arrependimento', 'batalha', 'direcao'],
    tempos: ['lenta'],
  },
  {
    id: 'oferta',
    name: 'Dízimos & Ofertas',
    short: 'Ofertas',
    description: 'Gratidão e generosidade no momento da oferta.',
    color: 'mint',
    icon: Coins,
    themes: ['gratidao', 'entrega', 'fe', 'provisao', 'fidelidade'],
    tempos: ['moderada', 'lenta'],
  },
  {
    id: 'ceia',
    name: 'Santa Ceia',
    short: 'Ceia',
    description: 'Memória da cruz, comunhão e exame do coração.',
    color: 'rose',
    icon: Wine,
    themes: ['cruz', 'graca', 'amor', 'arrependimento', 'unidade'],
    tempos: ['lenta'],
  },
  {
    id: 'apelo',
    name: 'Apelo',
    description: 'Convite para entregar a vida a Jesus.',
    color: 'sage',
    icon: HandHelping,
    themes: ['graca', 'entrega', 'amor', 'cruz', 'arrependimento', 'recomeco'],
    tempos: ['lenta'],
  },
  {
    id: 'encerramento',
    name: 'Encerramento & Envio',
    short: 'Encerramento',
    description: 'Fé, missão e esperança para a semana.',
    color: 'aqua',
    icon: Send,
    themes: ['missoes', 'vitoria', 'fe', 'esperanca', 'celebracao', 'volta', 'protecao'],
    tempos: ['rapida', 'moderada'],
  },
  {
    id: 'batismo',
    name: 'Batismo',
    description: 'Celebração da nova vida em Cristo.',
    color: 'sky',
    icon: Droplets,
    themes: ['entrega', 'graca', 'cruz', 'pascoa', 'recomeco'],
    tempos: ['moderada', 'lenta'],
  },
  {
    id: 'especial',
    name: 'Ocasiões especiais',
    short: 'Especiais',
    description: 'Casamentos, apresentação de crianças, homenagens, datas.',
    color: 'coral',
    icon: CalendarHeart,
    themes: ['amor', 'gratidao', 'natal', 'pascoa', 'familia'],
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

export const ABSENCE_REASONS: Array<{ id: string; name: string; icon: LucideIcon }> = [
  { id: 'trabalho', name: 'Trabalho', icon: Briefcase },
  { id: 'saude', name: 'Saúde', icon: HeartPulse },
  { id: 'viagem', name: 'Viagem', icon: Plane },
  { id: 'familia', name: 'Família', icon: House },
  { id: 'estudos', name: 'Estudos', icon: GraduationCap },
  { id: 'outro', name: 'Outro motivo', icon: MessageCircle },
]
export const ABSENCE_REASON_BY_ID = Object.fromEntries(ABSENCE_REASONS.map((r) => [r.id, r]))

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
export const THEME_BY_ID: Record<string, Theme> = byId(THEMES)

export function customThemeToTheme(c: Pick<CustomTheme, 'id' | 'name' | 'description' | 'icon' | 'color' | 'keywords'>): Theme {
  return {
    id: c.id,
    group: 'equipe',
    custom: true,
    name: c.name,
    description: c.description || 'Tema criado pela equipe.',
    color: PASTELS.includes(c.color) ? c.color : 'lavender',
    icon: THEME_ICONS[c.icon] ?? Sparkles,
    keywords: (c.keywords ?? []).map((k) => normalizeForMatch(k).trim()).filter(Boolean),
  }
}

/** Junta os temas criados pela equipe aos do app (chamado sempre que a tabela muda). */
export function applyCustomThemes(rows: CustomTheme[]) {
  const custom = rows.map(customThemeToTheme).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  THEMES.splice(0, THEMES.length, ...BUILTIN_THEMES, ...custom)
  for (const k of Object.keys(THEME_BY_ID)) delete THEME_BY_ID[k]
  Object.assign(THEME_BY_ID, byId(THEMES))
}

export function groupThemes(list: Theme[] = THEMES): Array<{ id: ThemeGroup; name: string; themes: Theme[] }> {
  return THEME_GROUPS.map((g) => ({ ...g, themes: list.filter((t) => t.group === g.id) })).filter((g) => g.themes.length)
}
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
