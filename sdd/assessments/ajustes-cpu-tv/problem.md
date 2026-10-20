# Assessment Problem: Ajustes finos de CPU na TV

- **Slug**: ajustes-cpu-tv
- **Criado**: 2026-10-19
- **Explora**: ./explora.md

## Problem Statement

Na TV, o índice de busca de um tipo inteiro leva ~2 s para montar na lista real (~4 s com 100 mil itens). Ele é
montado de novo a cada entrada na busca global ou em "Todos" por nome, e a cada lote da pré-carga com essas telas
abertas, sem ceder a vez à interface. Não se sabe se isso trava o controle remoto. O usuário não percebeu lentidão.

## Usuários / Partes Afetadas

- **Pessoa na TV** que abre a busca global ou "Todos" A–Z: se a montagem travar a thread principal, as teclas do
  controle ficam sem resposta por até ~2 s, mais ainda durante a pré-carga de uma lista recém-aberta.

## Goals

- Saber, por medição na TV, se montar o índice (busca global e "Todos" por nome) trava a tela: quadros > 50 ms e pior
  quadro, sozinho e com remontagem a cada 1 s, como faz a pré-carga.
- Se travar: montar o índice em fatias, cedendo a vez à interface (como a vitrine já faz), e não remontar o índice a
  cada lote da pré-carga enquanto a tela está aberta.

## Non-Goals

- **Ordenação A–Z**: a ordem de hoje fica (decisão do usuário, 2026-10-19). A chave pronta mudaria 126 pares em 11 mil
  nomes para ganhar ~85 ms.
- **Mensagens entre Workers**: nenhum caminho do app manda objetos grandes ao Worker hoje.
- **Decodificação de capas**: o ganho do `createImageBitmap` não foi provado, e `img.decode()` já é assíncrono.
- Montar o índice no Worker ou gravá-lo pronto no IndexedDB. Só se as fatias não bastarem.
- Mudar resultados de busca, a cobertura ("Busca em X de Y categorias") ou o formato de gravação da 082.

## Success Metrics

- **Partida** (sonda na TV, lista real): pior quadro e número de quadros > 50 ms durante `loadGlobalSearchIndex` e
  durante "Todos" por nome; e o mesmo com remontagem a cada 1 s por ~10 s.
- **Se virar feature**: durante a montagem, nenhum quadro > 100 ms e pior quadro ≤ 50 ms na TV; com a busca aberta
  durante a pré-carga, no máximo uma remontagem por entrada na tela (ou por intervalo definido no spec). Os resultados
  de busca continuam idênticos (testes de regressão).

## Cost of Inaction

Provavelmente baixo: ninguém percebeu, e a montagem é em boa parte assíncrona. Se a medição mostrar travamento, o custo
é a tela da busca sem resposta por segundos logo depois de abrir uma lista, que é justamente quando a pré-carga corre.
