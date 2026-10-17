# Adoração · app do ministério de louvor

Repertório organizado por **tema, significado e momento do culto**, **cifras** que mudam de tom na hora, **letras** para os cantores, **cultos com setlist e escala**, **sugestões**, **playlists** e **chat** da equipe — num app leve, bonito e que funciona até sem internet.

![Telas do app no celular](docs/preview.png)

---

## O que o app faz

**Escolher a música certa, rápido**
- **Escolha rápida por momento**: toque em *Abertura*, *Louvor*, *Adoração*, *Ministração*, *Ceia*, *Ofertas*, *Apelo*… e veja na hora as músicas que funcionam ali.
- **Assistente de repertório**: entende pedidos como *“3 músicas de gratidão animadas para a abertura”* ou *“algo sobre a cruz para a ceia”*. Explica o porquê de cada sugestão: momento, tema, ritmo, **tom que emenda com a música anterior**, se a equipe já conhece e se foi tocada recentemente.
- **Setlist automático**: monta abertura → louvor → adoração → ministração a partir do tema da pregação, encadeando os tons.
- **Acervo organizado** por 19 temas (Adoração, Cruz & Sangue, Espírito Santo, Graça & Perdão, Vitória, Natal…), 11 momentos do culto, ritmo, tom, etiquetas, significado e referências bíblicas. Busca sem acento por título, artista, **trecho da letra** ou referência (“sl 23” acha Salmos 23).

**Cifras e letras**
- Transposição instantânea com a grafia correta (B♭ em Fá, A♯ em Mi; diminutos de passagem com ♯).
- **Tom da equipe** (o “nosso tom”), **tom pessoal** de cada membro e **tom do culto** em cada setlist.
- Capotraste com sugestão de forma fácil (“casa 3, forma de G”).
- Visão **Letra** limpa e grande para quem canta (abre direto nela para quem é vocal).
- Tamanho da fonte, rolagem automática, metrônomo e tela sempre ligada.
- **Modo ao vivo**: tela cheia e escura, uma música por vez, passa com gesto, setas do teclado ou **pedal Bluetooth**.
- **Colar cifra**: copie do Cifra Club (ou de um PDF/WhatsApp) e o app separa acordes, letra e seções, lê título/artista/tom/capo, **detecta o tom** pelos acordes e sugere temas e momentos pela letra.

**Equipe**
- Contas individuais com e-mail e senha, liberadas por **código de convite**.
- **Cultos** com setlist (arraste para reordenar), observações por música, alerta de saltos de tom e **escala** (quem ministra, canta e toca).
- **Sugestões para o culto**: qualquer membro sugere, a equipe apoia (👍) e o líder aceita — a música entra no setlist.
- **Favoritas** e **playlists** (só suas ou compartilhadas com a equipe).
- **Chat** em tempo real com reações e compartilhamento de músicas e cultos.

**Por baixo**
- Instala no celular como app (PWA) e **funciona offline**: alterações feitas sem internet são enviadas quando a conexão volta.
- Tema claro e escuro, layout para celular, tablet e computador.

![App no computador](docs/desktop.png)

---

## Experimentar agora (modo demonstração)

Precisa de [Node.js 20+](https://nodejs.org).

```bash
npm install
npm run dev
```

Abra http://localhost:5173 e escolha um dos 8 membros de exemplo. Nesse modo os dados ficam **só no seu navegador** — ótimo para conhecer o app. Abra duas abas como membros diferentes para ver o chat em tempo real.

---

## Colocar no ar para a equipe (gratuito, ~15 minutos)

O app usa o [Supabase](https://supabase.com) (banco, login e tempo real — o plano gratuito sobra para uma equipe) e pode ser publicado na [Vercel](https://vercel.com) ou na [Netlify](https://netlify.com).

### 1. Criar o banco no Supabase
1. Crie uma conta em supabase.com → **New project** (região *South America (São Paulo)*).
2. Abra **SQL Editor → New query**, cole o conteúdo de [`supabase/migrations/20261016000000_init.sql`](supabase/migrations/20261016000000_init.sql) e clique em **Run**.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
4. Em **Authentication → URL Configuration**, coloque em **Site URL** o endereço onde o app vai ficar (ex.: `https://adoracao-da-igreja.vercel.app`).
5. Opcional: em **Authentication → Sign In / Providers → Email**, desligue *Confirm email* se não quiser que cada membro confirme o e-mail antes de entrar (o código de convite já protege o cadastro).

> Projetos gratuitos do Supabase entram em pausa depois de uma semana sem uso. Com o ministério usando toda semana isso não acontece; se acontecer, é só clicar em *Restore* no painel.

### 2. Publicar o app
**Vercel**: *Add New → Project* → importe este repositório → em *Environment Variables* adicione:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

→ **Deploy**. (Na Netlify é igual: o arquivo `netlify.toml` já está pronto.)

Para rodar no seu computador conectado ao banco, copie `.env.example` para `.env.local` e preencha as mesmas variáveis.

### 3. Chamar a equipe
1. **O líder cria a conta primeiro** — o primeiro cadastro vira líder automaticamente.
2. Em **Equipe**, toque em **Gerar novo** código e depois em **Enviar convite** (vai pronto para o WhatsApp).
3. Cada membro abre o link, cria a conta com o código e marca suas funções (vocal, violão, teclado…).
4. **Instalar no celular**: no iPhone, *Compartilhar → Adicionar à Tela de Início*; no Android, menu ⋮ → *Instalar app*.

O líder pode promover outros líderes na tela **Equipe**. Para tirar alguém da equipe, exclua o usuário no painel do Supabase (*Authentication → Users*): o perfil sai junto com as favoritas, playlists e mensagens dessa pessoa (as músicas e cultos que ela cadastrou continuam).

### 4. Montar o acervo
- **Nova música → Colar cifra → Organizar**, confira temas, momentos e significado, e salve.
- Quer começar com exemplos? **Ajustes → Adicionar músicas de exemplo** (e depois *Remover músicas de exemplo*).
- Testou no modo demonstração e quer levar as músicas? No demo, **Ajustes → Exportar acervo**; no app oficial, **Ajustes → Importar acervo**.

---

## Formato da cifra

O formato é o mesmo do Cifra Club — acordes na linha de cima, letra embaixo, partes entre colchetes:

```
[Intro] G  D/F#  Em  C

[Refrão]
G              D/F#
Santo, santo é o Senhor
Em             C
Digno de louvor
```

Também funciona: `Refrão:`, `REFRÃO`, `2ª Parte`, observações como `(2x)`, tablaturas e o formato **ChordPro** (`[G]Santo, [D]santo`, `{c: Refrão}`), útil para importar arquivos `.cho` de outros apps. Na tela, a letra quebra bonito em qualquer largura e os acordes nunca desalinham ao mudar de tom.

---

## Sobre o acervo de exemplo e direitos autorais

O app vem com **canções de exemplo originais** (escritas para este projeto, livres para usar) e **dois hinos em domínio público** (*Santo! Santo! Santo!*, de Reginald Heber, tradução de João Gomes da Rocha; e a *Doxologia*, de Thomas Ken, tradução de Sarah P. Kalley). O texto dos hinos segue a tradição dos hinários evangélicos brasileiros — confira com o hinário da sua igreja.

Letras e cifras de músicas protegidas por direitos autorais **não** acompanham o código: cada ministério cadastra o próprio repertório para uso interno. Para projeção ou outras formas de uso público, verifiquem as licenças da igreja.

---

## Para quem for mexer no código

**Tecnologia**: React 19 + TypeScript, Vite, Tailwind CSS 4, Zustand, React Router, Motion, Supabase (Postgres, Auth, Realtime e RLS) e PWA (Workbox).

```bash
npm run dev        # servidor de desenvolvimento
npm run build      # checagem de tipos + build de produção (pasta dist/)
npm run preview    # serve o build
npm test           # testes (motor de cifras e acervo inicial)
npm run typecheck  # só a checagem de tipos
```

```
src/
  lib/music/       motor de cifras: acordes, transposição, leitura de cifras, detecção de tom (com testes)
  lib/recommend.ts assistente de repertório e setlist automático
  lib/search.ts    busca sem acento (título, artista, letra, referências)
  lib/backend/     modo demonstração (IndexedDB) e Supabase, com o mesmo contrato
  lib/sync.ts      cache offline, fila de alterações e tempo real
  lib/actions.ts   todas as ações do app (atualização otimista)
  lib/taxonomy.ts  temas, momentos do culto, ritmos e funções
  pages/           telas
  components/      componentes visuais (cifra, capas, sheets, layout…)
  data/            acervo inicial e equipe de demonstração
supabase/migrations/  esquema do banco com regras de segurança por linha
```

**Segurança**: todo acesso passa pelas regras de segurança por linha do Postgres. Só membros logados veem dados; cada um altera o que é seu (favoritas, mensagens, playlists, preferências); o acervo e os cultos são colaborativos; excluir é do autor ou do líder; ninguém se promove a líder sozinho e a equipe nunca fica sem líder.

## Próximos passos sugeridos

- **IA conversacional no assistente**: uma Edge Function do Supabase recebe o pedido em linguagem natural e o catálogo (títulos, temas, momentos, significados) e devolve as músicas escolhidas. O assistente atual (`recommend` e `parseRequest`) continua como base e funciona sem internet.
- Notificações push (novo culto, escala, menções no chat).
- Diagramas de acordes para violão e teclado.
- Estatísticas do ano (músicas mais tocadas, quem mais ministrou).
- Áudios de referência e multitracks por música.
