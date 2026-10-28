import type { Pastel } from '@/lib/taxonomy'
import { firstName, hashString } from '@/lib/utils'

/**
 * Notas da atualização: aparecem em tela cheia na primeira vez que a pessoa abre o app numa
 * versão nova (ao tocar em "Atualizar"). Uma entrada por versão, a mais nova primeiro.
 *
 * Como escrever: direto na novidade, sem enrolar e sem prometer o que o app não faz. Diga
 * onde tocar, com o nome do botão entre ** (fica em negrito): "É só abrir… e tocar em **X**."
 */

export interface ReleaseItem {
  emoji: string
  title: string
  text: string
  kind: 'novo' | 'corrigido'
  color: Pastel
}

export interface Release {
  /** AAAA-MM-DD do dia em que a versão foi publicada (mais de uma no mesmo dia: "…b", "…c"). */
  id: string
  items: ReleaseItem[]
}

export const RELEASES: Release[] = [
  {
    id: '2026-10-28c',
    items: [
      {
        emoji: '🗳️',
        kind: 'novo',
        color: 'peach',
        title: 'Mais votos que músicas',
        text: 'Agora são dois números: quantas músicas entram e quantos votos cada um tem (dá pra votar em 3 e entrar só 1). Quem lidera ajusta em **Perfil → Equipe e convites** ou na própria votação do evento.',
      },
    ],
  },
  {
    id: '2026-10-28b',
    items: [
      {
        emoji: '🔀',
        kind: 'novo',
        color: 'orchid',
        title: 'Escolha onde troca no medley',
        text: 'Abra o medley e toque em **Onde troca**: escolha em que parte cada música começa e até onde vai. A cifra e a letra mostram só esse trecho, com o aviso da troca.',
      },
    ],
  },
  {
    id: '2026-10-28',
    items: [
      {
        emoji: '🎶',
        kind: 'novo',
        color: 'lavender',
        title: 'Chegou o medley!',
        text: 'Agora dá pra juntar duas ou mais músicas num medley, e ele conta como uma música só. É só abrir a música, tocar em **Sugerir para o culto** e depois em **Juntar com outra música**.',
      },
      {
        emoji: '📋',
        kind: 'novo',
        color: 'mint',
        title: 'Medley na playlist também',
        text: 'Abra a playlist, toque em **Medley**, escolha as músicas e pronto: elas entram juntinhas, com a cifra de cada uma na sequência.',
      },
      {
        emoji: '⏰',
        kind: 'novo',
        color: 'peach',
        title: 'Atraso agora fica registrado',
        text: 'No dia do culto, quem lidera abre o evento em **Programação** e toca no **relógio** ao lado do nome de quem chegou depois. O horário de chegada fica salvo na presença.',
      },
      {
        emoji: '🎸',
        kind: 'corrigido',
        color: 'sky',
        title: 'Cifra no tom certo',
        text: 'Cifra de violão com capotraste agora entra no tom que soa de verdade, e as tablaturas saíram da cifra. Bem mais limpo de ler!',
      },
    ],
  },
]

/** As versões que este aparelho ainda não mostrou (a mais nova primeiro). */
export function unseenReleases(seen: string | null, releases: Release[] = RELEASES): Release[] {
  return releases.filter((r) => !seen || r.id > seen)
}

const GREETINGS = [
  '{nome}, vem conferir as novidades do app Adoração!',
  'Você não vai acreditar, {nome} 😲',
  '{nome}, tem coisa nova no Adoração! ✨',
  'Olha só o que chegou pra você, {nome} 🎉',
  'Ei, {nome}! O Adoração ficou ainda melhor 🙌',
]

export function greetingFor(name: string, seed: string): string {
  return GREETINGS[hashString(seed) % GREETINGS.length].replace('{nome}', firstName(name) || 'Ei')
}
