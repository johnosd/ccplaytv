# Assessment Problem: Orçamento de memória do app na TV

- **Slug**: orcamento-memoria-app-tv
- **Criado**: 2026-10-19
- **Explora**: ./explora.md

## Problem Statement

Alguns leitores do app (busca global, índice de busca e "Todos" ordenado por nome ou com busca) carregam o tipo
inteiro, às vezes em mais de uma cópia, e não têm teto de memória. Na TV de referência o estouro não dá erro: o sistema
fecha o app perto de 4,4 milhões de objetos, e não há como medir a memória de dentro do app. Ainda não se sabe a que
distância desse limite a lista real (~55 mil itens) e uma lista de 100 mil itens ficam.

## Usuários / Partes Afetadas

- **Pessoa com lista grande na TV**: o app fecharia sem aviso ao buscar ou abrir "Todos". Hoje não há relato disso.
- **Desenvolvimento**: sem medição dentro do app, cada leitor novo que materializa o tipo inteiro é um risco invisível
  até alguém testar na TV.

## Goals

- Saber, por medição na TV com os leitores reais do app, quanto falta para o limite com a lista real e com uma lista
  de ~100 mil itens.
- Com uma lista de até ~100 mil itens, nenhuma tela do app (busca global, "Todos" em qualquer ordem, Início, Filmes,
  Séries, TV ao vivo) deve passar de um teto de memória definido com folga abaixo do limite medido.
- Pôr teto nos leitores agregados que hoje não têm: índice de busca, busca global, "Todos" (incluindo páginas
  acumuladas sem `maxPages`) e cópias derivadas (`toItemOut`).
- Ordenação por nome com chave pré-calculada no lugar do `Intl.Collator` a cada ordenação, nos mesmos leitores.

## Non-Goals

- Listas de centenas de milhares de itens. O alvo é ~100 mil; o caso extremo fica para depois, se aparecer demanda.
- Reescrever busca e ordenação como índice paginado no IndexedDB, salvo se a medição mostrar que é o único jeito de
  caber em ~100 mil.
- Mudar o formato de gravação da 082 (pedaços comprimidos, `readBlockChunks`, `makeRoomFor`).
- Cache de imagens do motor do navegador (fora do controle do app), rede em fluxo e mensagens entre Workers (itens
  próprios no backlog).
- Mudar o que a pessoa vê: os resultados de busca e a ordem continuam os mesmos.

## Success Metrics

- **Medição de partida** (sonda com os leitores reais): pico de objetos e de heap ao montar a busca global e "Todos"
  ordenado por nome, com a lista real e com uma lista sintética de ~100 mil itens.
- **Depois**: com ~100 mil itens, o pico de cada tela medida fica abaixo de um teto definido no spec. Sugestão de
  partida: ≤ 50 % do limite de objetos medido (~2,2 milhões) e do `jsHeapSizeLimit` (~180 MB).
- **Ordenação**: ordenar 11 mil nomes na TV em bem menos que os 144 ms de hoje. Meta exata no spec, a partir da medida
  "simples" de 18 ms.
- **Nenhuma mudança visível** nos resultados de busca e na ordem por nome (testes de regressão).

## Cost of Inaction

Hoje é baixo e incerto. Ninguém viu o app fechar, e a lista real pode estar longe do limite. O custo cresce com listas
maiores e com cada leitor novo que carrega o tipo inteiro. Quando um fechamento acontecer, será sem erro e sem
diagnóstico na TV. Sem a medição de partida, também não dá para dizer se o risco é real.
