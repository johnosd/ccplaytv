# Quickstart — 059 detalhe Cinema (filme e série)

## Pré-requisitos

- `tv-web/`: `npm install` feito; `npm run dev` na 5173.
- Uma lista IPTV real ativa (credenciais em `.env` da raiz, `CCPLAY_PROBE_*` — nunca copiar valores para docs/logs) com filmes e séries; chave TMDB configurada em Configurações › Integrações & BYOK para os cenários com backdrop/elenco/semelhantes.
- Para a TV física: skill `tizen-tv` (TV na rede, perfil Samsung).

## Checagens automatizadas (de `tv-web/`)

```powershell
npx vitest run src/features/vod/detailProgress.detalhe-cinema.contract.test.ts src/lib/color/coverColor.detalhe-cinema.contract.test.ts src/features/movies/MovieDetailScreen.detalhe-cinema.contract.test.tsx src/features/series/SeriesDetailScreen.detalhe-cinema.contract.test.tsx src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx
npx tsc -b
npm run lint
npm run test
npm run build
node e2e/run.mjs --only detalhe-cinema --jobs 1
npm run test:e2e
```

Da raiz: `check-contract-tests.ps1` para 059, 035, 032 e 033 → todos `PASS`.

## Cenários (navegador, depois TV)

1. **Filme com backdrop e retomada** — abra um filme assistido pela metade. Esperado: backdrop em tela cheia, capa grande à esquerda, foco em "▶ Continuar de mm:ss" com barra e "faltam X"; texto legível.
2. **Filme sem duração conhecida** — um filme sem duração na fonte e sem casamento no TMDB, com posição salva. Esperado: "Continuar de …" sem barra e sem "faltam".
3. **Filme sem backdrop** — desligue a chave TMDB (ou escolha um título sem backdrop). Esperado: fundo na cor da capa quando ela puder ser lida; senão, gradiente neutro. Nunca área vazia. Anotar quantos de 5 títulos deram cor (R-003).
4. **Ações em ícone** — percorra com →. Esperado: rótulo aparece só no ícone focado; ordem: Reiniciar (com retomada), Minha Lista, Trailer, Semelhantes, Marcar assistido, Remover do histórico (se no Histórico); → para na ponta. OK em cada uma faz o que fazia antes.
5. **Chips** — a categoria da lista aparece num chip próprio, destacado, antes dos gêneros; "Dados: TMDB" ao lado quando os gêneros vêm do TMDB; a categoria não aparece mais na linha de metadata.
6. **Abas na primeira tela** — sem rolar, a fileira de abas está inteira visível no rodapé.
7. **Navegação por linhas** — ↓ das ações vai para a aba ativa; ↑ volta para a última ação focada (não necessariamente a primária); a página volta ao topo.
8. **Semelhantes** — com títulos dentro e fora da lista: duas linhas tituladas; ←/→ param na ponta; ↓/↑ trocam de linha; ↑ na 1ª linha vai para a aba. OK num da lista abre o detalhe; num de fora abre o resumo. Ação "Semelhantes" do hero cai no 1º título.
9. **Semelhantes sem nenhum na lista** — a 1ª linha mostra "Nenhum título semelhante está na sua lista."; ↓ cai na 2ª.
10. **Elenco e Detalhes** — fotos redondas (iniciais sem foto), nome e personagem; OK abre o ator e voltar restaura a aba e a pessoa. Detalhes em cartões, com "Dados: TMDB" nos campos do TMDB.
11. **Série** — série com episódio em andamento: "▶ Continuar T_:E_" com a barra DO episódio; ícones Minha Lista, Trailer, Semelhantes, Remover do histórico (sem Reiniciar nem Marcar assistido); aba Episódios, seletor de temporada e autoplay como antes.
12. **Player** — abra o player a partir do detalhe (filme e série). Esperado: nada do hero (backdrop, cor, brilho) aparece por cima do vídeo; ao fechar, o detalhe volta com a primária atualizada.
13. **Idioma** — troque o idioma do app para en e es: "faltam", "Categoria e gêneros", títulos das linhas de Semelhantes e a frase da 1ª linha vazia traduzidos; nomes de título/categoria/pessoa não.

## Itens cross-cutting (constitution)

- Todo estado (carregando, erro, sem chave, vazio) tem algo focável ou mantém o foco na aba.
- Focar não toca vídeo nem consulta serviço externo.
- Nenhuma URL de imagem, credencial ou chave aparece em console, erro ou tela.
- Tokens V14 apenas (sem cor/raio/espaçamento/fonte literais no CSS novo, fora as três medidas de layout `--detail-*`).

## TV física (gate — D-012)

Repetir os cenários 1, 3, 4, 6, 8, 11 e 12 na QN50Q60DAGXZD via `tizen-tv`, com capturas. Atenção: legibilidade sobre backdrops claros, fluidez ao rolar até as abas e ao trocar de linha em Semelhantes, peso do brilho da capa.
