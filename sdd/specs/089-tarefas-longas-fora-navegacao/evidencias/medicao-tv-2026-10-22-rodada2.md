# Rodada 2 de 4 — o dono dos 93%, nomeado (feature 089, T022)

**Data**: 2026-10-22 · **Aparelho**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, `file://`), IP `192.168.0.12`
**Classificação**: **gate** — é esta rodada que dá o alvo à Fase 4
**Origem**: `evidencias/app-metricas-tv-2026-10-22-rodada2.jsonl` (93 linhas) · 54 janelas de ~5 s, 40 em navegação plena
**Orçamento**: rodada **2 de 4** (FR-010/SC-012). Restam duas, que são as de verificação do FR-005.
**A medida acrescentada** (uma só, D-003): contadores de **acionamento** por janela — `scrollsN`, `idbTxN`, `queriesN`.

## 1. Por que contadores, e não mais tempo

A rodada 1 mostrou um padrão bimodal (1,23× logo após a tecla, **1,62×** acima de 300 ms) que descartou tanto trabalho
síncrono com a tecla quanto trabalho periódico independente dela. Sobrou trabalho que a navegação **dispara** e que
**transborda** o intervalo entre teclas (357 ms). Três candidatas, nenhuma medida: as consultas disparadas pela troca de
foco, o recálculo do virtualizador pelo `scrollToIndex`, e a leitura de bloco do IndexedDB.

Contar separa as três sem cronometrar nada: se um subsistema é acionado dezenas de vezes por janela para 14 teclas, é
ele que enfileira o trabalho. Tudo foi instalado **de fora** — ouvinte de `scroll` em captura, remendo temporário em
`IDBDatabase.prototype.transaction`, e `queryClient.getQueryCache().subscribe()` — sem uma linha nos arquivos do
caminho quente (D-008).

## 2. O resultado

Em navegação plena (`teclaN ≥ 13`, n=40), por janela de ~5 s:

| Contador | Mediana | Por tecla | Máximo |
| --- | --- | --- | --- |
| `teclaN` | 14 | 1,0 | 20 |
| `scrollsN` | 6 | 0,4 | 14 |
| `idbTxN` | 9 | 0,6 | 243 |
| **`queriesN`** | **274** | **19,6** | **607** |

**Vinte eventos do cache de consultas por tecla**, contra meio evento de scroll e meia transação de banco. A ordem de
grandeza decide sozinha.

E o tempo preso acompanha (corte na mediana de `queriesN`):

| Janelas | `longTaskMs` | `ltForaMs` | fps |
| --- | --- | --- | --- |
| `queriesN` ≤ 281 (n=28) | 1 487 ms | 1 392 ms | **41** |
| `queriesN` > 281 (n=26) | 1 682 ms | 1 580 ms | **33** |

Pelo mesmo critério, aplicado aos outros dois:

| Contador | Tempo preso, baixo → alto | fps, baixo → alto | Leitura |
| --- | --- | --- | --- |
| `scrollsN` | 1 569 → 1 606 ms | 40 → 40 | **refutado** — nenhuma diferença |
| `idbTxN` | 1 445 → 1 659 ms | 42 → 33 | correlaciona, mas com volume **30× menor** |

**O virtualizador está eliminado.** `scrollsN` mediana 6 por janela e zero correlação: o `scrollToIndex` de
`useVirtualFocusSync` não é o problema, e cortar `overscan` não devolveria fluidez.

O `idbTxN` correlaciona, porém com 9 acionamentos contra 274 — e é plausivelmente **consequência**, não causa: uma
consulta que precisa de dados abre a transação. Contagem não distingue causa de consequência, e isto fica dito.

## 3. O mecanismo, no código

Os 19,6 eventos por tecla têm explicação exata em `features/catalog/catalogApi.ts:1774`, `useCategoryPreviews`:

```ts
const idsKey = categories.map((category) => category.id).join(',')
const query = useQuery({
  queryKey: categoryPreviewWindowKey(sourceId, idsKey),
  queryFn: async () => {
    const loaded = await Promise.all(categories.map(async (category) => {
      const preview = await queryClient.fetchQuery({ queryKey: categoryPreviewKey(sourceId, category.id), … })
      …
```

A chave da consulta **contém a lista de ids das categorias da janela visível**. Cada tecla que desliza a janela muda
`idsKey`, e com isso:

1. uma consulta **nova** é criada (chave nova);
2. a `queryFn` dispara um `fetchQuery` **por categoria da janela**, cada um com seus próprios eventos de cache;
3. a consulta anterior fica órfã e vai para coleta.

Com a janela cobrindo algumas categorias (virtualização vertical com `overscan: 2`), isso dá a ordem de 20 eventos por
tecla — exatamente o medido. O cache interno por categoria evita **reler o disco** (é por isso que `idbTxN` é baixo),
mas a **orquestração** — criar a consulta, o `Promise.all`, montar o `Map`, notificar os observadores — é refeita a
cada tecla.

Isso é compatível com tudo o que se sabe: é assíncrono (chega depois da tecla, transbordando o intervalo), depende da
navegação (a janela só desliza navegando), não é leitura de disco, não é scroll, e não aparece nas etapas da 088
porque o re-render que provoca acontece **depois** do primeiro quadro, onde o intervalo `render` já fechou.

O comentário no próprio código registra uma tentativa anterior que falhou: `useQueries` com um conjunto de observadores
que mudava a cada tecla estourou "Maximum update depth" numa descida longa. Então a solução da Fase 4 **não** é voltar
a ela.

## 4. Leitura honesta

**O alvo está nomeado**, com número do aparelho e mecanismo identificado no código: a recriação, a cada tecla, da
consulta da janela de previews de categoria.

O que isto **não** é: uma medida de **tempo** gasto nessa orquestração. Contagem e correlação não são cronometragem, e
a prova de que o alvo é o certo será o **ganho medido em duas rodadas** (FR-005) — exatamente o que a Fase 4 exige. Se
a mudança não mover os três números, ela **sai**, e o que foi tentado fica registrado.

SC-001 (< 15%), SC-002 (< 300 ms) e SC-003 (≥ 45 fps) seguem reprovados: 31% de thread presa, 383 ms de pior quadro
(mediana), 40 fps. Nada foi otimizado ainda — o FR-001 exigia o alvo primeiro, e agora ele existe.

A sonda voltou a fechar com **`falhas = 0`** nas quatro janelas (Filmes 37/37 fps, Séries 38/41), confirmando o
conserto da Fase 2 numa segunda rodada independente.

## 5. Segurança (FR-014)

`.jsonl` auditado: fora dos carimbos de tempo, só `source`, `outcome` (`done`/`failed`), `screen`
(`home`/`movies`/`series`), `reason` (`cap`/`ready`) e `kind` (`movie`/`series`/`channel`) — conjunto fechado. Nenhum
nome de item, categoria, canal, URL, host ou credencial. Os contadores são números puros. Pacote normal reinstalado;
nada foi desinstalado.
