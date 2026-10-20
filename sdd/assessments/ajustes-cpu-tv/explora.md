# Assessment Explora: Ajustes finos de CPU na TV

- **Slug**: ajustes-cpu-tv
- **Criado**: 2026-10-19
- **Origem**: ideia do backlog (`.planning/backlog.md` → "[Feature] Ajustes finos de CPU na TV: Worker, ordenação e capas")

## Ideia Bruta

A sonda 2 da 082 mediu na TV operações bem mais lentas que no PC. A ideia é revisar quatro pontos:
1. as mensagens entre Workers e a interface (mandar bytes, não objetos);
2. a ordenação por nome (chave pré-calculada);
3. a decodificação das capas;
4. desde 2026-10-19, a montagem do índice de busca, que leva ~2 s na TV.

## Evidência a Favor

- **Índice de busca lento na TV**, medido com o código real do app em 2 rodadas
  (`sdd/assessments/orcamento-memoria-app-tv/evidencias/memoria-leitores-tv-2026-10-19.md`):
  - busca global: 2,0–2,1 s na lista real e 3,8–3,9 s com 100 mil itens;
  - "Todos" filmes por nome: 2,3–2,6 s e 4,6 s.
- **O app repete esse trabalho**:
  - `useGlobalSearchIndex` e `useAggregatedItems` usam `staleTime: 0`, `refetchOnMount: 'always'` e `gcTime: 30_000`
    (`features/catalog/catalogApi.ts:1477-1485` e `:1572-1580`): cada entrada na busca ou em "Todos" por nome monta o
    índice de novo.
  - Durante a pré-carga em segundo plano (feature 038), `createPrefetchInvalidator` invalida `global-search-index` e
    `catalog-search-index` a cada lote de até 1 s (`features/catalog/prefetchApi.ts:30`, `:62-91`). Com a busca aberta
    enquanto a pré-carga corre, o índice de 2 s seria remontado sem parar. ASSUMPTION: não medido.
- **A montagem do índice não cede a vez à interface**: `loadSearchIndex` → `listAllOfKind` lê e decodifica o tipo
  inteiro e depois faz `map(compactSearchRecord)` de uma vez (`lib/catalog/catalogSearch.ts:109-120`). A vitrine, que
  também varre o tipo inteiro, já faz isso em fatias com `yieldToMain` (`catalogApi.ts:1663-1673`). Há precedente no
  próprio código.
- **Ordenação** (TV, 2 rodadas): o `Intl.Collator` do app ordena 11 mil nomes em 137 ms e 100 mil em 1,7 s. Pela chave
  pronta, 53 ms e 0,67 s. Montar a chave na hora custa 81–123 ms, então ela só compensa se for gravada junto com o
  catálogo.

## Evidência Contra

- **"2 s de montagem" não é "2 s de tela travada".** A descompressão (`DecompressionStream`) e o IndexedDB são
  assíncronos; só o `JSON.parse`, a criação dos objetos e o `map` rodam na thread principal. A sonda mediu tempo total,
  **não quadros**. Ainda não se sabe se o controle remoto trava durante a montagem.
- **Nenhum relato de lentidão percebida** na busca ou em "Todos" por nome. Na busca global, a pessoa ainda vai digitar
  pelo IME, e a montagem pode terminar antes do primeiro termo útil (2 caracteres). ASSUMPTION.
- **Worker sem alvo**: os três Workers (`importWorker`, `sectionWorker`, `epgWorker`) gravam direto no IndexedDB e
  mandam só mensagens pequenas. O custo de 195 ms do clone não ocorre em nenhum caminho do app hoje. Esta parte deve
  sair.
- **Capas sem ganho provado**: `img.decode()` só é usado para esperar a imagem ficar pronta
  (`lib/assembly/useScreenAssembly.ts:51`), de forma assíncrona. Trocar por `createImageBitmap` obrigaria a desenhar em
  canvas. Os 33 ms medidos podem nem bloquear a tela.
- **A ordenação pela chave muda o que a pessoa vê**: 126 pares de nomes vizinhos (em 11 mil) saem em outra ordem.
  Ordenar por nome só acontece quando a pessoa escolhe "A–Z", e 137 ms numa categoria de 11 mil é pouco perceptível. O
  caso caro (1,7 s) é "Todos" com 100 mil itens, além do alvo da lista real.

## Perguntas em Aberto

- Abrir a busca global ou "Todos" A–Z na TV parece lento ou trava o controle hoje?
- Com a busca aberta durante a pré-carga, a tela trava a cada lote? (medível com o `PerfOverlay`, modo C da sonda, ou
  com quadros na sonda durante `loadGlobalSearchIndex`)
- A ordem A–Z pode mudar em 126 pares para ganhar ~85 ms por ordenação?
