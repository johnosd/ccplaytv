# Assessment Explora: Orçamento de memória do app na TV

- **Slug**: orcamento-memoria-app-tv
- **Criado**: 2026-10-19
- **Origem**: ideia do backlog (`.planning/backlog.md` → "[Feature] Orçamento de memória do app", sonda 2 da 082)

## Ideia Bruta

A sonda 2 da 082 mediu os limites de memória da TV de referência (QN50Q60DAGXZD, Tizen 9.0). A ideia é dar ao app um
orçamento de memória por área, medido pela sonda (contagem de objetos e alocação), com leitura sempre paginada, para
que listas grandes não façam a TV fechar o app.

## Evidência a Favor

- **Limites medidos na TV** (`sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda2-capacidades-tv-2026-10-18.md`):
  RAM total de 1,49 GB com ~310 MB livres no início; `jsHeapSizeLimit` de 364 MB; **a TV fechou a sonda perto de 4,4
  milhões de objetos pequenos, sem erro capturável**; buffers externos de 352 MiB até o sistema ficar com < 200 MB
  livres; item de catálogo descomprimido ≈ 460 B de heap.
- **Não há como observar a memória dentro do app na TV**: `performance.memory` fica sempre em 10 MB. Hoje um estouro
  seria invisível até o app fechar.
- **Há leitores que materializam o tipo inteiro**, confirmados no código em 2026-10-19:
  - `loadSearchIndex` (`lib/catalog/catalogSearch.ts:109`) chama `listAllOfKind` e guarda um registro compacto mais um
    `LazySearchIndexEntry` por item.
  - A **busca global** (`lib/catalog/globalSearch.ts:38-40`) carrega os **três** índices de uma vez. Na lista real são
    43 510 filmes + 9 768 séries + 2 355 canais ≈ 55 mil registros.
  - **"Todos" ordenado por nome ou com busca** (`VodCategoryScreen.tsx:209-213` → `useAggregatedItems`,
    `features/catalog/catalogApi.ts:1572`) usa o mesmo índice inteiro e ainda o converte em itens de tela (`toItemOut`).
    São duas cópias do tipo vivas ao mesmo tempo.
  - **"Todos" na ordem da fonte** já é paginado (feature 039), mas o `useInfiniteQuery` não tem `maxPages`. Descendo até
    o fim, todas as páginas ficam na memória.
- **Conta grosseira** (ASSUMPTION, não medida no app): 55 mil registros × ~460 B ≈ 25 MB por cópia. Com cada registro
  somando dezenas de objetos (strings, `providerGenres`), duas ou três cópias já estão na casa de milhões de objetos. Uma
  lista na casa de 100–300 mil itens (o caso citado no backlog) passaria do limite medido.
- **O que já tem teto**: o cache de pedaços da 082 (`CHUNK_CACHE_MAX_ITEMS = 30 000`, `blockChunks.ts:14`), o memo de
  blocos (`CACHE_MAX_ITEMS = 2 000`, `blockMemo.ts:27`) e o memo da projeção (`READ_PROJECTION_MEMO_MAX_CHUNKS = 8`). Isso
  mostra que o padrão "teto por área" já existe em partes e falta nos leitores agregados.
- **Ordenação no mesmo caminho**: `vodSort.ts:61` e `catalogSearch.ts:149` usam `Intl.Collator`, que levou 144 ms para
  11 mil nomes na TV. Uma chave de ordenação pré-calculada mexeria nos mesmos leitores.

## Evidência Contra

- **Não existe relato de o app real ter fechado na TV por memória.** O limite de 4,4 milhões foi medido com objetos
  sintéticos numa sonda separada, não com o CCPlayTV. A validação da 082 na TV (SC-001) passou com a lista real, mas não
  há registro de alguém ter aberto a busca global ou "Todos" ordenado por nome com essa lista no aparelho.
- **A conta de objetos por registro é estimativa.** O app pode estar longe do limite com a lista real de 55 mil itens. O
  risco concreto pode existir só em listas bem maiores, cuja frequência entre os usuários é desconhecida (ASSUMPTION).
- **"Orçamento por área" é amplo e difícil de verificar**: sem `performance.memory` na TV, só a sonda mede, e a sonda
  roda num app separado. Um teto genérico pode virar trabalho grande com ganho que ninguém consegue provar.
- **Paginar busca e ordenação muda o produto**: buscar e ordenar por nome hoje precisam do tipo inteiro. Paginar exige
  índice persistido (ex.: nome normalizado e chave de ordenação no IndexedDB) ou aceitar um resultado parcial. É uma
  mudança de arquitetura, não um ajuste.

## Perguntas em Aberto

- O app real já fechou sozinho na TV em alguma tela (busca global, "Todos", Início)?
- Qual o tamanho de lista que o app precisa suportar: a lista real (~55 mil) ou listas de centenas de milhares?
- Dá para reproduzir com a sonda, carregando os leitores reais do app (índice de busca da lista real) em vez de objetos
  sintéticos, antes de especificar?
- A ordenação com chave pré-calculada entra nesta feature ou fica separada?

## Ensaio no PC da medição (2026-10-19) — diagnóstico/registro, não decide

Sonda preparada em `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/`: `memoria/entrada.ts` empacota os **leitores
reais** do app (`loadGlobalSearchIndex`, `loadSearchIndex`, `readKindCursorPage`, `sortVodItems`, gravador
`writeCompressedBlock` da 082) em `app2/appReal.js` (`memoria/empacotar.mjs`). Os testes estão em `app2/memoria.js`:
`memoriaLeitores` e `ordenacaoChave`. O banco foi semeado com as amostras sanitizadas, replicadas até a lista real
(2 355 canais, 43 510 filmes, 9 768 séries) e até ~100 mil itens (4 300 / 78 700 / 17 000).

Heap retido medido no Chromium do PC (DevTools `Runtime.getHeapUsage` depois de GC), mesmo V8 da TV em outra versão:

| Cenário | Lista real | ~100 mil | Objetos + strings (real / 100 mil) |
| --- | --- | --- | --- |
| Busca global (3 índices) | 20,6 MB | 28,0 MB | 111 mil + 124 mil / 200 mil + 211 mil |
| "Todos" filmes por nome (índice + itens + cópia ordenada) | 16,1 MB | 31,8 MB | 131 mil + 139 mil / 236 mil + 243 mil |
| "Todos" filmes na ordem da fonte até o fim | 9,8 MB | 20,1 MB | 44 mil + 139 mil / 79 mil + 243 mil |
| 2,2 milhões de objetos sintéticos da sonda 2 (folga) | ~130 MB | — | — |

- **Leitura**: a TV fechou a sonda 2 perto de 4,4 milhões de objetos sintéticos, o que no V8 equivale a ~260 MB. O pior
  cenário (100 mil, "Todos" por nome) fica em ~12 % disso, bem abaixo do critério de 50 %. A conta grosseira do Explora
  (dezenas de objetos por registro) **superestimou**: cada registro custa 2–3 objetos mais as strings.
- **Limites desta leitura**: mede só a estrutura retida, sem o pico transitório da montagem e sem o resto do app (React,
  DOM, imagens, outros caches). O número da TV (memória livre do sistema e sobrevivência com a folga de 2,2 milhões) é o
  gate e **ainda não foi medido**: o usuário adiou a instalação na TV em 2026-10-19.
- **Ordenação** (PC, mediana de 3): 11 mil nomes — Collator do app 22,5 ms, chave pré-calculada 11 + 9,4 ms; 100 mil —
  236 ms contra 81 + 99 ms. **A chave muda a ordem em 126 pares vizinhos (11 mil) e 165 (100 mil)** em relação ao
  `Intl.Collator('pt-BR', base)` do app. Trocar seria uma mudança visível de ordem, não só de velocidade. O ganho na TV
  (onde o Collator custou 144 ms contra 18 ms da comparação simples) ainda precisa da rodada no aparelho.
- Instalar: `.\sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\instalar-sonda.ps1 -TvIp <ip> -App app2 -AppId
  ccpSondaV2.Capacidades -Only ordenacaoChave,memoriaLeitores`, depois de gerar `appReal.js` com `empacotar.mjs`.

**Atualização (2026-10-19, 23:03)**: a rodada na TV foi feita depois, com autorização do usuário: 2 rodadas, e os 6
cenários passaram no gate. Números em `./evidencias/memoria-leitores-tv-2026-10-19.md`; veredito em `decision.md`.
