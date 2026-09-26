# Quickstart: verificação da 015-capa-real-filmes-series

## Pré-requisitos

- `tv-web/` com dependências instaladas (`npm install`).
- `npm run dev` rodando (http://localhost:5173).

## Checagens automatizadas

```powershell
cd tv-web
npm run test
npm run lint
npm run build
npm run test:e2e      # com npm run dev já rodando
```

## Cenário ponta a ponta (navegador)

1. **Capa real em Filmes e Séries**: adicionar uma fonte M3U cujas
   entradas de filme/série tenham `tvg-logo` (ou uma fonte de painel
   Xtream real, se disponível). Esperado: ao entrar em Filmes e em
   Séries, os itens com capa declarada mostram a imagem real, não o
   placeholder de textura.
2. **Sem capa declarada**: um item da mesma fonte sem `tvg-logo`.
   Esperado: placeholder de sempre (textura + título), sem espaço vazio.
3. **Capa quebrada**: um item cujo `tvg-logo` aponta para uma URL
   inacessível. Esperado: placeholder de sempre, **sem** o ícone nativo de
   imagem quebrada do navegador em nenhum momento perceptível; abrir o
   DevTools → Network confirma só uma tentativa, sem repetição em loop.
4. **Live TV inalterado**: a mesma fonte, se tiver canais com `tvg-logo`,
   mostrado em Live TV. Esperado: placeholder de sempre, capa nunca
   aparece ali (FR-009).
5. **Carregamento segue a janela virtualizada** (D-007, pedido explícito
   do usuário): numa categoria com dezenas de itens com capa, abrir
   DevTools → Network, filtrar por imagem, entrar na categoria **sem
   rolar**. Esperado: só as requisições dos itens visíveis na tela (mais
   uma margem pequena de overscan) aparecem — não o total da categoria.
   Rolar a grade até o fim: o número de requisições cresce conforme novos
   itens entram na tela, nunca todas de uma vez no início.
6. **Fonte já importada antes desta feature**: abrir uma fonte
   sincronizada antes desta feature (sem ressincronizar). Esperado:
   placeholder em todos os itens, mesmo que a fonte real tenha capas —
   só uma ressincronização grava o campo novo (D-009).
7. **Ressincronizar** a fonte do passo 6. Esperado: depois de concluída,
   os itens com capa declarada passam a mostrar a imagem real.

## Itens da constitution a conferir

- Foco e SELECT continuam funcionando em qualquer estado da imagem
  (carregando, carregada, sem capa, falha) — nenhum card perde
  `tv-focus` nem deixa de responder ao controle remoto.
- Nenhuma URL de capa aparece em texto visível na tela, em toast, ou no
  console do navegador (inclusive em erro de carregamento).
- `PosterArt` e as classes novas de `screens.css` usam só tokens de
  `tv-web/src/index.css` — nenhuma cor/raio/tamanho de fonte literal.
- Rolar a grade de Filmes/Séries com capas carregando não trava nem
  soletra visivelmente mais devagar que antes desta feature.
