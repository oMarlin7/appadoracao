import { docToText, parseSheet } from '@/lib/music/sheet'
import type { Tempo } from '@/lib/taxonomy'
import type { Song } from '@/types'

/**
 * Músicas iniciais
 * --------------
 * • Canções de exemplo: composições originais escritas para este app (livres para usar),
 *   que mostram cifra, letra, transposição e organização por tema/momento.
 * • Hinos em domínio público (autor, compositor e tradutor falecidos há mais de 70 anos).
 *
 * As músicas que o ministério canta entram pelo botão "Nova música" → "Colar cifra".
 * As cifras abaixo são escritas em ChordPro (preciso) e convertidas para o formato
 * tradicional de acordes sobre a letra, que é como ficam salvas e editáveis.
 */

type SeedSong = Pick<Song, 'id' | 'title' | 'artist' | 'originalKey' | 'bpm' | 'themes' | 'moments' | 'meaning' | 'bibleRefs' | 'tags'> & {
  teamKey?: string
  tempo: Tempo
  timeSignature?: string
  notes?: string
  chordpro: string
}

const EXEMPLO = 'Canção de exemplo'

const SEED: SeedSong[] = [
  {
    id: 'ex-celebrai',
    title: 'Celebrai',
    artist: EXEMPLO,
    originalKey: 'G',
    bpm: 128,
    tempo: 'rapida',
    themes: ['celebracao', 'majestade', 'gratidao'],
    moments: ['abertura', 'louvor'],
    meaning:
      'Convite para a igreja se levantar e celebrar: Deus reina, é fiel e merece toda a nossa alegria. Ótima para abrir o culto e unir a congregação logo no começo.',
    bibleRefs: ['Salmos 100', 'Salmos 47:1'],
    tags: ['exemplo'],
    chordpro: `[Intro] G  C  Em  D

[Verso 1]
[G]Levanta, igreja, é dia de [C]festa
[Em]O Rei da glória está [D]aqui
[G]Que cada voz se una e ce[C]lebre
[Em]Tudo o que Ele [D]fez por mim

[Pré-Refrão]
[C]Bate palmas, ale[D]gra o coração
[C]Canta forte, er[D]gue as tuas mãos

[Refrão]
[G]Celebrai, cele[D]brai
[Em]O Senhor reina, [C]Ele é fiel
[G]Celebrai, cele[D]brai
[Em]Terra e céu [C]cantam seu lou[D]vor

[Verso 2]
[G]Ele quebrou as minhas cor[C]rentes
[Em]Mudou meu pranto em dança e can[D]ção
[G]Por isso eu canto, por isso eu [C]danço
[Em]Há festa no meu cora[D]ção

[Ponte]
[C]Aleluia, ale[G/B]luia
[Am7]Glória ao Rei, glória ao [D]Rei
[C]Aleluia, ale[G/B]luia
[Am7]Para sempre reina[D]rá

[Final] G  C  Em  D  G`,
  },
  {
    id: 'ex-santo-es-tu',
    title: 'Santo És Tu',
    artist: EXEMPLO,
    originalKey: 'D',
    teamKey: 'E',
    bpm: 68,
    tempo: 'lenta',
    themes: ['adoracao', 'majestade'],
    moments: ['adoracao', 'ministracao'],
    meaning:
      'Contemplação da santidade de Deus a partir da visão de Isaías: diante do trono, a única resposta possível é reverência e adoração.',
    bibleRefs: ['Isaías 6:1-3', 'Apocalipse 4:8'],
    tags: ['exemplo'],
    notes: 'Começar só com teclado. Bateria entra no segundo refrão.',
    chordpro: `[Intro] D  A/C#  Bm  G

[Verso 1]
[D]Diante do teu [A/C#]trono
[Bm]Os anjos se [G]curvam
[D]Cobrem o rosto e [A/C#]cantam
[Bm]Sem ces[G]sar

[Verso 2]
[D]E eu, que nada me[A/C#]reço
[Bm]Fui chamado à tua [G]mesa
[D]Tua glória me al[A/C#]cança
[Em7]Me faz ado[A4]rar [A]

[Refrão]
[G]Santo és Tu, Se[A]nhor
[Bm]Digno de todo o lou[D/F#]vor
[G]Santo és Tu, Se[A]nhor
[Bm]Para sem[A]pre, santo [G]és

[Ponte]
[G]Toda a [D/F#]terra
[Em7]Está cheia da tua [A]glória
[G]Toda a [D/F#]terra
[Em7]Proclama: santo [A]és

[Final] G  A  D`,
  },
  {
    id: 'ex-tua-bondade',
    title: 'Tua Bondade',
    artist: EXEMPLO,
    originalKey: 'A',
    bpm: 96,
    tempo: 'moderada',
    themes: ['gratidao', 'fe', 'amor'],
    moments: ['oferta', 'louvor', 'adoracao'],
    meaning:
      'Uma canção de memória e gratidão: olhar para a estrada percorrida e reconhecer que a bondade e a fidelidade de Deus nos acompanharam em cada estação.',
    bibleRefs: ['Salmos 23:6', 'Lamentações 3:22-23', 'Salmos 103:2'],
    tags: ['exemplo'],
    chordpro: `[Intro] A  E/G#  F#m  D

[Verso 1]
[A]Quando olho a estrada que an[E/G#]dei
[F#m]Vejo as marcas do teu cui[D]dado
[A]Nos dias claros e nas noites [E/G#]frias
[F#m]Tu nunca me dei[E]xaste de [D]lado

[Refrão]
[A]Tua bondade me se[E]guiu
[F#m]Tua mão me susten[D]tou
[A]Cada manhã, novas miseri[E]córdias
[F#m]Obri[E]gado, meu Se[D]nhor

[Verso 2]
[A]Se eu contasse as bênçãos uma a [E/G#]uma
[F#m]Faltaria tempo pra agrade[D]cer
[A]Tudo o que tenho veio de [E/G#]ti
[F#m]Tudo o que sou é [E]pra ti, ó [D]Deus

[Ponte]
[D]Eu vou cantar da tua fideli[A/C#]dade
[Bm]Enquanto houver fôlego em [E]mim
[D]Eu vou cantar da tua fideli[A/C#]dade
[Bm]Até o [E]fim, até o [A]fim

[Final] D  E  A`,
  },
  {
    id: 'ex-eis-me-aqui',
    title: 'Eis-me Aqui',
    artist: EXEMPLO,
    originalKey: 'E',
    bpm: 72,
    tempo: 'lenta',
    themes: ['entrega', 'missoes'],
    moments: ['ministracao', 'apelo'],
    meaning:
      'Resposta ao chamado de Deus como a de Isaías: rendição total, disponibilidade para ser enviado e a vida colocada no altar.',
    bibleRefs: ['Isaías 6:8', 'Romanos 12:1'],
    tags: ['exemplo'],
    chordpro: `[Intro] E  B/D#  C#m7  A

[Verso 1]
[E]Ouvi a tua voz cha[B/D#]mando
[C#m7]Quem irá por [A]nós?
[E]Meu coração se in[B/D#]clina
[C#m7]Toma o meu vi[A]ver

[Pré-Refrão]
[A]Não quero nada a[B]lém
[C#m7]Do que Tu queres pra [A]mim

[Refrão]
[E]Eis-me aqui, en[B]via-me
[C#m7]Tudo o que sou, eu en[A]trego a ti
[E]Eis-me aqui, en[B]via-me
[C#m7]Faz-me instru[B]mento, Se[A]nhor

[Verso 2]
[E]Ponho no teu al[B/D#]tar
[C#m7]Meus sonhos e meus [A]planos
[E]Que a tua vontade [B/D#]seja
[C#m7]Meu ali[A]mento

[Ponte]
[A]Eu me rendo, eu me [E/G#]rendo
[F#m7]Seja feita a tua von[B]tade
[A]Eu me rendo, eu me [E/G#]rendo
[F#m7]Meu Se[B]nhor, eis-me a[E]qui

[Final] A  B  E`,
  },
  {
    id: 'ex-sopra-espirito',
    title: 'Sopra, Espírito',
    artist: EXEMPLO,
    originalKey: 'C',
    bpm: 76,
    tempo: 'lenta',
    themes: ['espirito', 'avivamento'],
    moments: ['ministracao', 'oracao'],
    meaning:
      'Clamor pelo agir do Espírito Santo, como no Pentecostes e no vale de ossos secos: vida nova, fogo e unção sobre a igreja.',
    bibleRefs: ['Atos 2:1-4', 'Ezequiel 37:9', 'João 3:8'],
    tags: ['exemplo'],
    chordpro: `[Intro] C  G/B  Am7  F

[Verso 1]
[C]Como vento impe[G/B]tuoso
[Am7]No dia de Pente[F]costes
[C]Vem encher este lu[G/B]gar
[Am7]Vem, Espí[G]rito de [F]Deus

[Verso 2]
[C]No vale de ossos [G/B]secos
[Am7]Tua voz traz vida [F]nova
[C]Sopra sobre a tua i[G/B]greja
[Am7]Faz o teu [G]povo vi[F]ver

[Refrão]
[F]Sopra, Espí[G]rito
[Am7]Enche-nos outra [C/E]vez
[F]Derrama o teu [G]fogo
[Am7]Sobre [G]nós, Se[F]nhor

[Ponte]
[F]Vem, Es[G]pírito [Am7]Santo
[F]Vem, Es[G]pírito [C]Santo
[F]Vem e [G]faz-nos ar[Am7]der [G/B] [C]

[Final] F  G  C`,
  },
  {
    id: 'ex-no-calvario',
    title: 'No Calvário',
    artist: EXEMPLO,
    originalKey: 'Bb',
    bpm: 70,
    tempo: 'lenta',
    themes: ['cruz', 'graca', 'amor'],
    moments: ['ceia', 'adoracao', 'apelo'],
    meaning:
      'Meditação sobre a cruz: o Cordeiro que tomou o nosso lugar e pagou o preço por completo. Ótima para a Santa Ceia e para momentos de quebrantamento.',
    bibleRefs: ['Isaías 53:5', '1 Pedro 2:24', '1 Coríntios 11:26'],
    tags: ['exemplo'],
    chordpro: `[Intro] Bb  F/A  Gm7  Eb

[Verso 1]
[Bb]Sobre um monte, uma [F/A]cruz
[Gm7]Ali o Justo deu a [Eb]vida
[Bb]Os cravos e a co[F/A]roa
[Gm7]Eram [F]meus, não [Eb]dEle

[Verso 2]
[Bb]O Cordeiro silenci[F/A]ou
[Gm7]Levou sobre si meu pe[Eb]cado
[Bb]Seu sangue fala mais [F/A]alto
[Gm7]Que a minha [F]condena[Eb]ção

[Refrão]
[Eb]No Calvário eu a[F]chei
[Gm7]Perdão, amor e [Bb/D]paz
[Eb]Na cruz o meu Se[F]nhor
[Gm7]Me alcan[F]çou [Eb]

[Ponte]
[Eb]Está consu[Bb/D]mado
[Cm7]O preço foi [F]pago
[Eb]Está consu[Bb/D]mado
[Cm7]Eu sou [F]livre em [Bb]ti

[Final] Eb  F  Bb`,
  },
  {
    id: 'ex-graca-sem-fim',
    title: 'Graça Sem Fim',
    artist: EXEMPLO,
    originalKey: 'F',
    teamKey: 'G',
    bpm: 84,
    tempo: 'moderada',
    themes: ['graca', 'amor', 'cura'],
    moments: ['adoracao', 'apelo', 'ministracao'],
    meaning:
      'A graça que nos encontra como estamos e não nos deixa como estávamos — a parábola do filho pródigo cantada: perdão, aceitação e um novo começo.',
    bibleRefs: ['Efésios 2:8-9', 'Romanos 5:20', 'Lucas 15:20'],
    tags: ['exemplo'],
    chordpro: `[Intro] F  C/E  Dm7  Bb

[Verso 1]
[F]Eu vinha de longe, can[C/E]sado
[Dm7]Vestindo a culpa e a ver[Bb]gonha
[F]Mas antes que eu dissesse [C/E]algo
[Dm7]O Pai cor[C]reu ao meu en[Bb]contro

[Refrão]
[Bb]Graça sem fim, graça sem [C]fim
[Dm7]Que me encontrou e me fez [F/A]filho
[Bb]Graça sem fim, graça sem [C]fim
[Dm7]Nunca [C]vai me dei[Bb]xar

[Verso 2]
[F]Onde abundou o meu pe[C/E]cado
[Dm7]Superabundou o teu a[Bb]mor
[F]Não há passado tão es[C/E]curo
[Dm7]Que a tua [C]luz não alcan[Bb]çou

[Ponte]
[Bb]Eu não mereço, mas Tu me [F/A]amas
[Gm7]Eu não mereço, mas Tu me [C]chamas
[Bb]Eu não mereço, mas Tu me a[F/A]braças
[Gm7]Graça, [C]graça sem [F]fim

[Final] Bb  C  F`,
  },
  {
    id: 'ex-firme-estou',
    title: 'Firme Estou',
    artist: EXEMPLO,
    originalKey: 'D',
    bpm: 100,
    tempo: 'moderada',
    themes: ['fe', 'vitoria', 'esperanca'],
    moments: ['louvor', 'encerramento'],
    meaning:
      'Declaração de confiança: mesmo quando tudo ao redor treme, quem está firmado na Rocha permanece de pé.',
    bibleRefs: ['Mateus 7:24-25', 'Salmos 46:1-3', 'Hebreus 10:23'],
    tags: ['exemplo'],
    chordpro: `[Intro] D  G  Bm  A

[Verso 1]
[D]Se a tempestade vi[G]er
[Bm]Se o mar se levan[A]tar
[D]Minha casa não ca[G]irá
[Bm]Pois na [A]Rocha es[G]tá

[Pré-Refrão]
[G]Tuas promessas não [A]falham
[Bm]Teu amor não [A]muda ja[G]mais

[Refrão]
[D]Firme estou, firme es[A]tou
[Bm]Em ti, Senhor, eu con[G]fio
[D]Firme estou, firme es[A]tou
[Bm]Tu és [A]fi[G]el

[Verso 2]
[D]Se o caminho escure[G]cer
[Bm]Tua palavra é luz pra [A]mim
[D]Não temerei mal al[G]gum
[Bm]Tu es[A]tás a[G]qui

[Ponte]
[G]Não teme[A]rei
[Bm]Não teme[D/F#]rei
[G]Deus é o [A]meu re[D]fúgio

[Final] G  A  D`,
  },
  {
    id: 'ex-amanhecer',
    title: 'Vai Amanhecer',
    artist: EXEMPLO,
    originalKey: 'Em',
    bpm: 90,
    tempo: 'moderada',
    themes: ['esperanca', 'fe', 'cura'],
    moments: ['ministracao', 'encerramento'],
    meaning:
      'Para quem atravessa o vale: o choro pode durar uma noite, mas a alegria vem pela manhã. Uma canção de consolo e esperança.',
    bibleRefs: ['Salmos 30:5', 'Salmos 23:4', 'Romanos 15:13'],
    tags: ['exemplo'],
    chordpro: `[Intro] Em  C  G  D

[Verso 1]
[Em]A noite parece [C]longa
[G]E as lágrimas não param de ca[D]ir
[Em]Mas no silêncio es[C]cuto
[G]Tua voz falando a [D]mim

[Refrão]
[C]Vai amanhe[G]cer
[D]O choro dura uma noite [Em]só
[C]Vai amanhe[G]cer
[D]A alegria vem, Tu és fi[Em]el
[C]Vai amanhe[D]cer [Em]

[Verso 2]
[Em]No vale da sombra eu [C]sigo
[G]Teu cajado me con[D]sola
[Em]Não estou sozinho, eu [C]sei
[G]Tua mão me guia a[D]gora

[Ponte]
[C]Esperança que não [G]falha
[D]Luz que vence a escuri[Em]dão
[C]Esperança que não [G]falha
[D]Cristo [C]em [Em]mim

[Final] C  D  Em`,
  },
  {
    id: 'ex-ele-vive',
    title: 'Ele Vive',
    artist: EXEMPLO,
    originalKey: 'A',
    bpm: 132,
    tempo: 'rapida',
    themes: ['pascoa', 'vitoria', 'celebracao'],
    moments: ['louvor', 'abertura'],
    meaning: 'Celebração da ressurreição: o túmulo está vazio, a morte foi vencida e Jesus reina para sempre.',
    bibleRefs: ['Mateus 28:6', '1 Coríntios 15:55-57', 'Apocalipse 1:18'],
    tags: ['exemplo'],
    chordpro: `[Intro] A  D  F#m  E

[Verso 1]
[A]Na manhã do terceiro [D]dia
[F#m]A pedra foi remo[E]vida
[A]O que a morte quis pren[D]der
[F#m]Ela não segu[E]rou

[Pré-Refrão]
[D]Cantem os céus, cante a [E]terra
[D]O Senhor ressusci[E]tou

[Refrão]
[A]Ele vive, Ele [E]vive
[F#m]O túmulo está va[D]zio
[A]Ele vive, Ele [E]vive
[F#m]Jesus ven[E]ceu, Ele [D]vive

[Verso 2]
[A]Ó morte, onde está tua vi[D]tória?
[F#m]Ó morte, onde está teu po[E]der?
[A]O Leão de Judá se levan[D]tou
[F#m]E para sempre vai rei[E]nar

[Ponte]
[D]Aleluia, Ele [A/C#]reina
[Bm]Aleluia, Ele [E]vive
[D]Aleluia, Ele [A/C#]reina
[Bm]Para [E]sempre, Ele [A]vive

[Final] D  E  A`,
  },
  {
    id: 'ex-noite-santa',
    title: 'Noite Santa',
    artist: EXEMPLO,
    originalKey: 'C',
    bpm: 66,
    tempo: 'lenta',
    timeSignature: '3/4',
    themes: ['natal', 'adoracao'],
    moments: ['especial', 'adoracao'],
    meaning: 'Canção de Natal sobre o milagre da encarnação: o Rei eterno nasceu numa manjedoura — Deus conosco.',
    bibleRefs: ['Lucas 2:7-14', 'Isaías 9:6', 'Mateus 1:23'],
    tags: ['exemplo'],
    chordpro: `[Intro] C  F  C  G

[Verso 1]
[C]Numa noite tão se[F]re[C]na
[Am]Belém dor[Dm]mia em [G]paz
[C]Na manjedoura pe[F]que[C]na
[Am]O Rei nas[G]ceu, Je[C]sus

[Verso 2]
[C]Os anjos cantam [F]gló[C]ria
[Am]Pastores [Dm]vêm ado[G]rar
[C]A luz que muda a [F]his[C]tória
[Am]Veio nos [G]visi[C]tar

[Refrão]
[F]Noite santa, noite [C]santa
[Dm]Deus conosco, Ema[G]nuel
[F]Noite santa, noite [C/E]santa
[Dm7]Nasceu o [G]Rei [C]

[Final] F  G  C`,
  },
  {
    id: 'ex-ide',
    title: 'Ide',
    artist: EXEMPLO,
    originalKey: 'E',
    bpm: 120,
    tempo: 'rapida',
    themes: ['missoes', 'celebracao', 'fe'],
    moments: ['encerramento', 'louvor'],
    meaning:
      'Canção de envio: a igreja sai do culto para ser luz na cidade e anunciar o evangelho a toda criatura.',
    bibleRefs: ['Marcos 16:15', 'Mateus 28:19-20', 'Isaías 52:7'],
    tags: ['exemplo'],
    chordpro: `[Intro] E  A  C#m  B

[Verso 1]
[E]Há um mundo lá fora espe[A]rando
[C#m]Por uma palavra de a[B]mor
[E]Há corações que ainda não [A]sabem
[C#m]Que existe um Salva[B]dor

[Pré-Refrão]
[A]Somos luz no meio da ci[B]dade
[A]Somos sal, a voz do teu a[B]mor

[Refrão]
[E]Ide, ide, anunci[B]ai
[C#m]Que Jesus é o Se[A]nhor
[E]Ide, ide, a toda na[B]ção
[C#m]O evan[B]gelho do a[A]mor

[Ponte]
[A]Envia-me, en[E/G#]via-me
[F#m]Aonde Tu quiseres, eu i[B]rei
[A]Envia-me, en[E/G#]via-me
[F#m]Eis-me a[B]qui, Se[E]nhor

[Final] A  B  E`,
  },
  {
    id: 'ex-rei-dos-reis',
    title: 'Rei dos Reis',
    artist: EXEMPLO,
    originalKey: 'Ab',
    teamKey: 'G',
    bpm: 88,
    tempo: 'moderada',
    themes: ['majestade', 'adoracao', 'vitoria'],
    moments: ['adoracao', 'abertura'],
    meaning:
      'Exaltação ao Cristo soberano: toda autoridade lhe pertence, e um dia todo joelho se dobrará diante dEle.',
    bibleRefs: ['Apocalipse 19:16', 'Filipenses 2:9-11', 'Salmos 24:7-10'],
    tags: ['exemplo'],
    chordpro: `[Intro] Ab  Eb/G  Fm7  Db

[Verso 1]
[Ab]Coroado de [Eb/G]glória
[Fm7]Assentado no [Db]trono
[Ab]Os céus anun[Eb/G]ciam
[Fm7]O teu do[Eb]mí[Db]nio

[Refrão]
[Db]Rei dos reis, Senhor dos se[Eb]nhores
[Fm7]Todo o poder pertence a [Ab/C]ti
[Db]Rei dos reis, Senhor dos se[Eb]nhores
[Fm7]Reinas [Eb]para [Db]sempre

[Verso 2]
[Ab]Todo joelho se [Eb/G]dobra
[Fm7]Toda língua con[Db]fessa
[Ab]Que Jesus Cristo é Se[Eb/G]nhor
[Fm7]Para a [Eb]glória de [Db]Deus

[Ponte]
[Db]Abri as [Ab/C]portas
[Bbm7]Que entre o Rei da [Eb]glória
[Db]Abri as [Ab/C]portas
[Bbm7]Ele é o [Eb]Se[Ab]nhor

[Final] Db  Eb  Ab`,
  },
  {
    id: 'ex-clamor',
    title: 'Clamor',
    artist: EXEMPLO,
    originalKey: 'Am',
    bpm: 64,
    tempo: 'lenta',
    themes: ['oracao', 'avivamento', 'entrega'],
    moments: ['oracao', 'ministracao'],
    meaning:
      'Oração cantada por restauração e avivamento, inspirada em 2 Crônicas 7:14: humilhar-se, buscar a face de Deus e esperar o seu agir.',
    bibleRefs: ['2 Crônicas 7:14', 'Habacuque 3:2', 'Jeremias 33:3'],
    tags: ['exemplo'],
    chordpro: `[Intro] Am  F  C  G

[Verso 1]
[Am]Senhor, ouve o nosso cla[F]mor
[C]Viemos buscar a tua [G]face
[Am]Nos humilhamos diante de [F]ti
[C]Sara a [G]nossa [Am]terra

[Refrão]
[F]Aviva a tua [G]obra
[Em]No meio dos [Am]anos
[F]Aviva a tua i[G]greja
[Am]Ouve, [G]ó [F]Deus

[Verso 2]
[Am]Lava o nosso cora[F]ção
[C]Restaura o primeiro a[G]mor
[Am]Que o teu fogo desça outra [F]vez
[C]Sobre o [G]teu al[Am]tar

[Ponte]
[F]Clamamos a [G]ti
[Em]Responde-[Am]nos
[F]Clamamos a [G]ti
[F]Vem, [G]Se[Am]nhor

[Final] F  G  Am`,
  },
  {
    id: 'ex-vitoria',
    title: 'Vitória',
    artist: EXEMPLO,
    originalKey: 'B',
    bpm: 140,
    tempo: 'rapida',
    themes: ['vitoria', 'celebracao', 'fe'],
    moments: ['louvor', 'encerramento'],
    meaning: 'Hino de guerra espiritual e celebração: a batalha pertence ao Senhor e em Cristo somos mais que vencedores.',
    bibleRefs: ['2 Crônicas 20:15', 'Romanos 8:37', '1 Coríntios 15:57'],
    tags: ['exemplo'],
    chordpro: `[Intro] B  E  G#m  F#

[Verso 1]
[B]Quando o inimigo vi[E]er
[G#m]Como um rio a transbor[F#]dar
[B]O Espírito do Se[E]nhor
[G#m]Vai se levan[F#]tar

[Pré-Refrão]
[E]A batalha é do Se[F#]nhor
[E]Não teme[F#]remos, não

[Refrão]
[B]Vitória, vi[F#]tória
[G#m]Em Cristo somos mais que vence[E]dores
[B]Vitória, vi[F#]tória
[G#m]Canta[F#]mos ao [E]Rei

[Ponte]
[E]As muralhas vão ca[B/D#]ir
[C#m7]Quando o povo lou[F#]var
[E]As muralhas vão ca[B/D#]ir
[C#m7]Jesus [F#]vai triun[B]far

[Final] E  F#  B`,
  },
  {
    id: 'ex-fonte-de-cura',
    title: 'Fonte de Cura',
    artist: EXEMPLO,
    originalKey: 'G',
    bpm: 74,
    tempo: 'lenta',
    themes: ['cura', 'espirito', 'fe'],
    moments: ['ministracao', 'oracao'],
    meaning:
      'Fé no Deus que cura e restaura: um convite para levar dores, enfermidades e feridas da alma até Jesus, como a mulher que tocou em suas vestes.',
    bibleRefs: ['Êxodo 15:26', 'Isaías 53:5', 'Marcos 5:27-29'],
    tags: ['exemplo'],
    chordpro: `[Intro] G  D/F#  Em7  C

[Verso 1]
[G]Como a mulher que to[D/F#]cou
[Em7]A orla da tua [C]veste
[G]Eu venho com fé, Se[D/F#]nhor
[Em7]Só pre[D]ciso te to[C]car

[Refrão]
[C]Tu és a fonte de [D]cura
[Em7]Que nunca seca[G/B]rá
[C]Tu és a fonte de [D]cura
[Em7]Toca [D]em mim, Se[C]nhor

[Verso 2]
[G]As feridas da minha [D/F#]alma
[Em7]Tuas mãos podem sa[C]rar
[G]Pelas tuas pisa[D/F#]duras
[Em7]Fui cu[D]rado, eu [C]sei

[Ponte]
[C]Cura, Se[G/B]nhor
[Am7]Restaura, Se[D]nhor
[C]Cura, Se[G/B]nhor
[Am7]O teu [D]po[G]vo

[Final] C  D  G`,
  },
  {
    id: 'ex-amor-de-pai',
    title: 'Amor de Pai',
    artist: EXEMPLO,
    originalKey: 'Eb',
    bpm: 72,
    tempo: 'lenta',
    themes: ['amor', 'adoracao', 'graca'],
    moments: ['adoracao', 'apelo'],
    meaning:
      'O amor do Pai que nos adota como filhos: não somos órfãos, somos amados, acolhidos e chamados pelo nome.',
    bibleRefs: ['1 João 3:1', 'Romanos 8:15', 'Sofonias 3:17'],
    tags: ['exemplo'],
    chordpro: `[Intro] Eb  Bb/D  Cm7  Ab

[Verso 1]
[Eb]Antes que eu te conhe[Bb/D]cesse
[Cm7]Tu já me conhe[Ab]cias
[Eb]Me chamaste pelo [Bb/D]nome
[Cm7]Me fi[Bb]zeste filho [Ab]teu

[Refrão]
[Ab]Amor de Pai, que me alcan[Bb]çou
[Cm7]Que me abraçou como es[Eb/G]tou
[Ab]Amor de Pai, que não me [Bb]deixa
[Cm7]Eu sou a[Bb]mado por [Ab]ti

[Verso 2]
[Eb]Tu cantas sobre a minha [Bb/D]vida
[Cm7]Te alegras em mim, Se[Ab]nhor
[Eb]Não sou mais órfão, não sou mais es[Bb/D]cravo
[Cm7]Sou [Bb]filho, sou do [Ab]Pai

[Ponte]
[Ab]Aba, [Eb/G]Pai
[Fm7]Aba, [Bb]Pai
[Ab]Aba, [Eb/G]Pai
[Fm7]Eu [Bb]sou [Eb]teu

[Final] Ab  Bb  Eb`,
  },
  {
    id: 'hino-santo-santo-santo',
    title: 'Santo! Santo! Santo!',
    artist: 'Reginald Heber · trad. João Gomes da Rocha',
    originalKey: 'D',
    bpm: 80,
    tempo: 'moderada',
    themes: ['majestade', 'adoracao'],
    moments: ['abertura', 'adoracao'],
    meaning:
      'Hino clássico (1826) sobre a santidade do Deus trino, inspirado em Isaías 6 e Apocalipse 4. Melodia NICAEA, de John B. Dykes. Domínio público.',
    bibleRefs: ['Isaías 6:3', 'Apocalipse 4:8'],
    tags: ['exemplo', 'hino', 'domínio público'],
    notes: 'Texto conforme a tradição dos hinários evangélicos brasileiros — confira com o hinário da sua igreja.',
    chordpro: `[Estrofe 1]
[D]Santo! [Bm]Santo! [G]Santo! [D]Deus onipo[A]tente!
[G]Cedo de ma[D]nhã canta[Em]remos teu lou[A]vor.
[D]Santo! [Bm]Santo! [G]Santo! [D]Deus Jeová tri[A]úno,
[G]És um só [D]Deus, ex[A]celso Cria[D]dor.

[Estrofe 2]
[D]Santo! [Bm]Santo! [G]Santo! [D]Todos os re[A]midos,
[G]Juntos com os [D]anjos, pro[Em]clamam teu lou[A]vor;
[D]Antes de for[Bm]mar-se o [G]firmamento e a [A]terra,
[G]Eras, és, e [D]sempre [A]hás de ser, Se[D]nhor.

[Estrofe 3]
[D]Santo! [Bm]Santo! [G]Santo! [D]Nós, os peca[A]dores,
[G]Não podemos [D]ver tua [Em]glória sem te[A]mor;
[D]Tu somente és [Bm]santo, [G]só tu és per[A]feito,
[G]Deus sobe[D]rano, i[A]menso em teu a[D]mor.

[Estrofe 4]
[D]Santo! [Bm]Santo! [G]Santo! [D]Deus onipo[A]tente!
[G]Tuas obras [D]louvam teu [Em]nome com fer[A]vor;
[D]Santo! [Bm]Santo! [G]Santo! [D]Justo e compas[A]sivo!
[G]És um só [D]Deus, su[A]premo Cria[D]dor.`,
  },
  {
    id: 'hino-doxologia',
    title: 'Doxologia',
    artist: 'Thomas Ken · trad. Sarah P. Kalley',
    originalKey: 'G',
    bpm: 72,
    tempo: 'lenta',
    themes: ['majestade', 'gratidao', 'adoracao'],
    moments: ['encerramento', 'oferta'],
    meaning:
      'A doxologia mais cantada da igreja (1674): louvor ao Pai, ao Filho e ao Espírito Santo. Melodia OLD HUNDREDTH. Ideal para encerrar o culto ou após as ofertas. Domínio público.',
    bibleRefs: ['Salmos 150:6', 'Romanos 11:36'],
    tags: ['exemplo', 'hino', 'domínio público'],
    notes: 'Algumas edições trazem pequenas variações no texto — use a do hinário da igreja.',
    chordpro: `[Doxologia]
[G]A Deus, su[D]premo [Em]Benfei[C]tor[D],
[G]Vós, anjos e [Em]homens, [Am]dai lou[D]vor[G];
[G]A Deus, o [D]Filho, a [Em]Deus, o [D]Pai,
[G]A Deus, Es[C]pírito, [D]glória [G]dai!

[Final]
[C]A[G]mém.`,
  },
]

export const EXAMPLE_TAG = 'exemplo'

export function buildSeedSongs(baseTime = Date.now()): Song[] {
  return SEED.map((s, i) => {
    const stamp = new Date(baseTime - (SEED.length - i) * 3_600_000 * 7).toISOString()
    return {
      id: s.id,
      title: s.title,
      artist: s.artist,
      originalKey: s.originalKey,
      teamKey: s.teamKey ?? null,
      bpm: s.bpm,
      timeSignature: s.timeSignature ?? '4/4',
      tempo: s.tempo,
      themes: s.themes,
      moments: s.moments,
      tags: s.tags,
      meaning: s.meaning,
      bibleRefs: s.bibleRefs,
      content: docToText(parseSheet(s.chordpro)),
      notes: s.notes ?? '',
      youtubeUrl: null,
      createdBy: null,
      createdAt: stamp,
      updatedAt: stamp,
    }
  })
}
