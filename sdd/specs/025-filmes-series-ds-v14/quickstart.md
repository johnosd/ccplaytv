# Quickstart: Filmes e Séries no DS V14 (feature 025)

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm ci`).
- Uma lista de provedor Xtream cadastrada no app (para ano/inclusão/duração
  reais) e, se possível, uma lista M3U (para conferir a ausência de "Ano"/
  "Recém-adicionados").
- Para os E2E: `npm run dev` rodando **recém-iniciado** (um dev server de
  horas ficou instável na feature 022). No Windows, os scripts `e2e/*.mjs`
  precisam do override temporário do `executablePath` do Chromium (mesma
  nota das features 016–024).

## Checagens automatizadas (em `tv-web/`)

```powershell
npx vitest run src/lib/catalog/history.filmes-series-ds-v14.contract.test.ts src/features/vod/vodSort.filmes-series-ds-v14.contract.test.ts src/lib/catalog/vodMetadata.filmes-series-ds-v14.contract.test.ts src/features/movies/MoviesScreen.filmes-series-ds-v14.contract.test.tsx
npm run test
npx tsc -b
npm run lint
npm run build
npm run build:tizen
cd ..; .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 025-filmes-series-ds-v14
```

Todas as travas anteriores continuam íntegras (`check-contract-tests.ps1`
para 018–024; a de 017 tem o bug de backlog conhecido, fora desta feature).

## E2E (com `npm run dev`)

```powershell
npm run test:e2e
node e2e/filmes-series-ds-v14.mjs      # novo
node e2e/capa-real.mjs
node e2e/historico-continuar-assistindo.mjs
node e2e/favoritos.mjs
node e2e/busca-por-categoria.mjs
node e2e/paridade-visual.mjs
node e2e/shell-visual.mjs
node e2e/m3u-sob-demanda.mjs
node e2e/ciclo-vida-player.mjs
```

## Cenário ponta a ponta (navegador, 1920×1080)

1. Perfis → escolher a lista → Início → topbar "Filmes". A aba "Filmes" fica
   ativa e o foco na side nav, na 1ª categoria real.
2. Side nav: "Sua biblioteca" (★ Favoritos com número, ↺ Histórico sem
   número) e "Catálogo" (Todos, categorias com contagem só quando lidas).
3. Entrar numa categoria, andar até o 3º card: a hero band mostra capa,
   título, ano (se o painel declara) e grupo, sem sinopse.
4. ↑ na 1ª linha → "Pesquisar"; → "Ordenar · Ordem da fonte ▾"; OK → modal;
   escolher "Ano" → grade reordenada, sem ano no fim, foco no mesmo filme.
5. Trocar de categoria e voltar: o mesmo card de antes volta focado. Ir ao
   Início e voltar a Filmes: continua lembrado. A ordenação continua "Ano".
6. OK num card → detalhe V14: foco em "Assistir"/"Continuar"; "Minha Lista"
   alterna com toast; "Trailer", "Elenco" e "Semelhantes" anunciam "Em
   breve"; "Detalhes" só com campos reais; nenhum texto de placeholder.
7. Assistir alguns segundos (além do limiar de retomada), RETURN, RETURN:
   volta à grade no mesmo card. Abrir "↺ Histórico": o filme aparece, e a
   contagem passa a aparecer ao lado da entrada.
8. Séries: abrir uma série, "Temporada N ▾" → modal → trocar; episódios em
   cards 16:9 com imagem, duração e barra (painel que declara duração) ou
   "Continuar de mm:ss" (sem duração). Assistir um episódio e voltar: a
   ação primária vira "Continuar TX:EY"; "↺ Histórico" de Séries mostra a
   série uma vez.
9. Lista M3U: "Ordenar" oferece só "Ordem da fonte" e "A–Z".

## Itens cross-cutting da constitution

- [ ] Todo estado das quatro telas tem um elemento focável acionável por
      SELECT (carregando, erro, vazio, ★ vazio, ↺ vazio, fonte ausente,
      modais).
- [ ] Nenhuma URL de capa/reprodução/fonte em log, erro ou texto visível
      (inspecionar console durante o cenário).
- [ ] Nenhum dado inventado: sem sinopse, sem ano tirado do título, sem
      barra de progresso sem duração, sem "Recém-adicionados" em série sem
      `added`.
- [ ] Categorias da fonte na ordem declarada; ★/↺/Todos nunca as substituem.
- [ ] Voltar do detalhe restaura o card por identidade.
- [ ] Favorito, retomada e histórico continuam chaveados pela identidade
      estável (nada novo usa URL).
- [ ] Passada na TV física (recomendada, não gate): rolagem da grade com
      capas, hero band, plano de hardware nos dois detalhes, modal de
      temporada, teclas do controle.
