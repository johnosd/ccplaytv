# Lógica — Cruzamento de títulos do TMDB com o catálogo local

Arquivo: `tv-web/src/lib/metadata/localTitleMatch.ts` (`resolveTmdbTitles`,
stub já criado). Contrato: `localTitleMatch.semelhantes.contract.test.ts`.
Usado pela aba Semelhantes (refs de um tipo) e pela página de ator (refs de
filme e série juntos).

## 1. Regras (FR-005 a FR-008)

1. **Só o que já está no aparelho**: registros da geração ativa da fonte em
   `channels`. Nunca rede, nunca `ensureCategory`, nunca ler `storedEntries`
   (conteúdo M3U de categoria nunca aberta não é catálogo ainda).
2. **Mesmo tipo**: ref `movie` só com `kind:'movie'`; `series` só com
   `kind:'series'`.
3. **Identidade primeiro**: registro local cujo `titleMetadata` tem
   `tmdb.status === 'matched'` com o mesmo `tmdbId`. `providerTmdbId` sozinho
   **não** é identidade (é só dica, D-004 da 032).
4. **Título + ano** (só sem identidade): `comparableTitle(record.originalName)`
   igual a `comparableTitle(ref.title)` ou `comparableTitle(ref.originalTitle)`;
   ano local = `record.year ?? yearHintFromTitle(record.originalName)`; os dois
   anos conhecidos e **iguais** (emenda R-012; antes `|Δ| ≤ 1`). Registro local sem ano **nunca** casa por título.
5. **Cópias vs. ambíguo**: se os registros que casaram por título têm **todos
   o mesmo ano local**, são cópias da mesma obra → vale o **primeiro na ordem
   da fonte**. Anos diferentes → **não encontrado** (nunca escolhe por
   aproximação). Várias cópias por identidade → a primeira na ordem da fonte.
6. **Ordem de saída**: encontrados primeiro, na ordem recebida; depois os não
   encontrados, na ordem recebida. Ref repetida (mesma `key`) entra uma vez.
7. **Cobertura** por tipo pedido em `kinds` (mesmo sem nenhum ref daquele
   tipo): `total` = categorias do tipo na geração ativa (`listCategories`);
   `covered` = as que já têm conteúdo no aparelho — a MESMA regra da busca
   (`isCovered` de `lib/catalog/catalogSearch.ts`: `eager` sempre;
   `on_demand`/`stored` só com `itemsFetchedAt`). Exportar `isCovered`, não
   duplicar.

"Ordem da fonte" = a ordem do índice `[sourceId+generation+kind+groupOrder]`
(groupOrder crescente, depois chave primária) — a mesma que
`resolveFavorites` já usa para desempate.

## 2. Algoritmo (uma varredura por tipo)

```text
resolveTmdbTitles(sourceId, refs, kinds, { database = db }):
  generation = activeGeneration(sourceId); se undefined → todos não encontrados,
    coverage[k] = { covered: 0, total: 0 } para cada k em kinds
  refs = dedup por key (`tmdb:${kind}:${tmdbId}`)
  para cada kind em kinds:
    categorias = listCategories(sourceId, kind) → coverage[kind]
  para cada kind com refs:
    wantedIds = Set(refs do kind .tmdbId)
    identidade: titleMetadata.where('sourceId').equals(sourceId)
                 → filtra kind e tmdb.status==='matched' e wantedIds.has(tmdbId)
                 → Map<stableId, tmdbId>
    alvosPorTitulo: Map<comparable, ref[]>  (title e originalTitle; comparable '' ignorado)
    varrer channels do kind na geração (.each):
      sid = titleStableId(record)
      se sid ∈ identidade e tmdbId ainda sem acerto por identidade → guarda record
      comp = comparableTitle(record.originalName)
      para cada ref em alvosPorTitulo.get(comp) (sem repetir ref):
        anoLocal = record.year ?? yearHintFromTitle(record.originalName)
        se anoLocal e ref.year definidos e anoLocal = ref.year (R-012; antes |Δ| ≤ 1):
          acertosPorTitulo[ref].push({ record, anoLocal })
    para cada ref:
      local = porIdentidade[ref] ?? (
        acertos = acertosPorTitulo[ref] ?? []
        acertos vazio → nenhum
        todos com o mesmo anoLocal → acertos[0].record
        senão → nenhum)
  montar titles (encontrados, depois não encontrados), localItemId = String(record.id)
```

Custo: uma leitura sequencial do tipo na geração (o mesmo que a busca global
e "Todos" já fazem) + `titleMetadata` por fonte (só títulos já abertos). Só é
executado quando a aba Semelhantes está ativa ou a página de ator abre —
nunca por foco, nunca em lote (R-003).

## 3. O que NÃO fazer

- Não casar por `record.name` exibido nem por substring/prefixo.
- Não ignorar o ano quando só há um candidato local ("parece o mesmo").
- Não guardar o resultado do cruzamento no IndexedDB: ele depende do que foi
  aberto desde então; recalcular é barato e sempre honesto.
