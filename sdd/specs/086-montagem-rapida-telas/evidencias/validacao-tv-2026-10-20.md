# Validação na TV — feature 086 (T061)

- **Data**: 2026-10-20 (coleta 2026-10-21T01:34Z)
- **Aparelho**: QN50Q60DAGXZD, Tizen 9 / Chromium 120, `file://`
- **Instalado**: `8tZqMtwANL.CCPlayTv`, build de medição (`VITE_CCPLAY_PERF=1`,
  `VITE_CCPLAY_METRICS_REPORT` para o coletor na LAN). Dados preservados (`deploy-tv.ps1 -SkipBuild`).
- **Origem**: `evidencias/validacao.jsonl` (25 linhas) contra `evidencias/linha-de-base.jsonl`
- **Classificação**: **gate** — e o gate **não passou**.
- **Roteiro**: o mesmo da linha de base (quickstart §4): 2 min na Início para o preenchimento em segundo plano,
  saída e reabertura, depois Início → Filmes → Séries, movendo foco e rolando até o fim em cada uma.

## 1. Montagem das telas

| Tela | Linha de base | Validação | Leitura |
| --- | --- | --- | --- |
| Início (1ª da sessão) | `cap`, 2039 ms, 6 pendentes | `cap`, **2058 ms**, 5 pendentes, `addedMoviesMs` 1986 | **sem ganho** |
| Filmes | `ready`, 497 ms, 6 pendentes | `ready`, **854 ms**, 5 pendentes | **pior** |
| Séries | `ready`, 1074 ms, 7 pendentes | `ready`, **991 ms**, 5 pendentes | empate |
| Início (em cache, 2×) | 1 ms, 2 pendentes | 1–3 ms, **0 pendentes** | melhor (só as pendências) |

`paintMs` ≤ 3 ms em toda abertura com dado em cache, nas duas sessões — confirma de novo que desenhar não é o custo.
`heapMB` ficou em 10 MB nas duas sessões (o valor não varia; não serve para o SC-010).

## 2. Critérios

| Critério | Meta | Resultado |
| --- | --- | --- |
| SC-001 | Início com conteúdo em ≤ 1 s na 1ª abertura | **falhou** (2058 ms) |
| SC-002 | Nenhuma das três revela por `cap` | **falhou** (Início revelou por `cap`) |
| SC-003 | Filmes e Séries ≤ 1 s com ≤ 2 leituras pendentes | **falhou** (tempo ok; 5 pendentes nas duas) |
| SC-004 | Montar as fileiras de um tipo ≤ 100 ms | não isolável nesta coleta |
| SC-005 / SC-006 | atualização com a tela aberta / sem rede | **não medidos** (coleta interrompida neste achado) |
| SC-008 | `paintMs` não maior que a linha de base | atendido (≤ 3 ms) |
| SC-009 | Quadros longos não aumentam | **falhou** (ver §3) |
| SC-010 | Pico de memória não maior | inconclusivo (`heapMB` constante) |
| SC-011 | Mais capas da 1ª tela prontas | inconclusivo (`imagesSettled` 0 nas duas) |

## 3. Achado A1 — a carga por seção regrediu (causa raiz)

| Seção | Linha de base `encodeMs` / `totalMs` | Validação `encodeMs` / `totalMs` |
| --- | --- | --- |
| Canais (2 355 itens, 42 cat.) | 375 / 1 620 ms | **2 492 / 3 682 ms** |
| Filmes (43 549 itens, 34 cat.) | 1 262 / 7 384 ms | **3 285 / 9 674 ms** |
| Séries (9 777 itens, 28 cat.) | 386 / 3 217 ms | **22 547 / 26 639 ms** |

As leituras de categoria em segundo plano acompanham: `entry` de séries foi de 153–2 586 ms para **8 523–10 618 ms**.
Quadros longos acumulados em janela equivalente: 141 → 74 em menos tempo decorrido, com `fps` caindo a 18–25 durante a
carga (linha de base: 23–57).

Causa, confirmada no código:

1. `prepareBlockWrite` ([blockWrite.ts:146](../../../tv-web/src/lib/catalog/blockWrite.ts#L146)) passou a **reter
   `blockItems`** — todos os itens descomprimidos da categoria — dentro do `PreparedBlock`, para todos os tipos,
   inclusive canais (que não têm candidatos). Com 43 mil filmes isso é pressão de memória e GC no caminho da carga.
2. `writeCompressedBlock` ([blockWrite.ts:196-203](../../../tv-web/src/lib/catalog/blockWrite.ts#L196-L203)) roda
   `pickCandidates` + `writeCandidates` **serializados** depois de cada commit, uma transação extra por categoria,
   dentro do laço da carga.
3. `fillNextCandidates` no housekeeping ([prefetch/index.ts:72](../../../tv-web/src/lib/catalog/prefetch/index.ts#L72))
   faz `readBlockChunks` — descompressão de um bloco inteiro — uma categoria por rodada, concorrendo com a carga e com a
   pré-carga. Com 390 categorias, é o catálogo inteiro sendo descomprimido ao longo da sessão.

O item 3 é um custo **único de migração** (a lista já estava gravada antes desta feature), e por isso contamina esta
coleta: a sessão da linha de base não o pagou. Os itens 1 e 2 são permanentes e contrariam o ganho da feature 085
(carga de 22,6 s → 8,86 s), que esta medição mostra desfeito para séries.

## 4. Leitura honesta

A feature atinge o que provou em teste — a abertura não varre mais o tipo, e as aberturas em cache já não têm leitura
pendente — mas **na TV, no cenário real, não há ganho de tempo na primeira abertura**, porque essa abertura concorre com
a atualização da lista, que esta feature deixou mais cara. Enquanto A1 não for corrigido, nenhum número de abertura
desta sessão serve de veredito: a comparação está contaminada pelo backfill e pela carga mais lenta.

Não há como afrouxar o critério depois de ver o resultado. T061 fica **em aberto**, e a feature não converge.
