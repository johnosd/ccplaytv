# Documento de tela: o desenho que falta para a montagem ser rápida

Escrito para quem vai implementar (próxima sessão do `sdd-execute`). Parte da medição de 2026-10-20 na TV
(`evidencias/linha-de-base-tv-2026-10-20.md` e `evidencias/validacao-tv-2026-10-20.md`), não de hipótese.

## 1. O que a medição já provou (não repita o diagnóstico)

| Fato medido na TV | Número | Consequência |
| --- | --- | --- |
| Desenhar não custa | `paintMs` 1–3 ms nas duas sessões | **Nada a ganhar em renderização.** R-006 descartado |
| Abertura com dado em mãos | 1–3 ms | O caminho rápido existe e funciona |
| **As fileiras calculadas já custam zero** | `addedMs` 0 ms, `ratedMs` 0 ms (Filmes e Séries) | **A US1 entregou.** Candidatos resolveram o que foram resolver |
| O que sobrou definindo o tempo das vitrines | `categoriesMs` **854 ms** (Filmes) e **991 ms** (Séries) — igual ao `revealMs` | O gargalo é a **trilha de categorias**, não as fileiras. É o R-009, previsto e não tratado |
| A Home na pior hora | `revealMs` 2 058 ms, `addedMoviesMs` **1 986 ms** | A leitura é de dezenas de linhas e esperou ~2 s: é **fila**, não volume |
| A carga por seção | `readMs` 6 046 ms, `encodeMs` 1 262 ms, `commitMs` ≈ 0 | O custo da carga é **ler o preparo e comprimir**, não gravar |
| A carga regrediu com esta feature | Séries 3,2 s → **26,6 s**; leituras de categoria 153–2 586 ms → 8 523–10 618 ms | Achado A1, corrigir antes de qualquer medição nova |

Duas conclusões que mandam no desenho:

1. **A abertura não é lenta por calcular ou por ler muito.** Ela é lenta por *esperar um recurso ocupado*. Reduzir
   volume (o que a US1 fez) só ajuda até onde a fila deixa. A Home provou isso: leitura minúscula, 1 986 ms de espera.
2. **Sobrou uma leitura obrigatória que ninguém atacou**: a trilha de categorias, ~0,9 s, que sozinha decide quando
   Filmes e Séries aparecem.

## 2. O que os grandes players fazem, e o que disso se aplica aqui

O padrão da Netflix na TV é o **LoLoMo** — *list of lists of movies*: a home é um **documento de página** montado por
um serviço que decide quais fileiras existem, e o cliente da TV **recebe a página pronta**. A razão declarada é
exatamente a nossa: desenhar uma tela pode envolver ~10 serviços, e fazer esse leque de chamadas *a partir da TV* é
ineficiente. A mesma equipe trata a TV como aparelho de memória restrita (MBs, não GBs, para gráficos) e mede fps,
tempo de resposta de tecla e tempo de início do app — as mesmas métricas que já coletamos.

Transferindo para o nosso cliente-primeiro (ADR-008), onde o "serviço" é o próprio aparelho:

| Prática | Nosso estado | O que fazer |
| --- | --- | --- |
| A tela lê **um** documento pronto | A Home faz **6 leituras** independentes (`hero`, `channels`, `continue`, `mylist`, `addedMovies`, `addedSeries`) e as vitrines ainda somam a trilha de categorias | P1 |
| Nada pesado compete com o primeiro desenho | A carga da lista começa junto com a abertura | P3 |
| Mostrar o guardado e revalidar atrás | Já quase: as fileiras entram depois | P4, tornando a troca atômica |
| Transações curtas (< ~50 ms), escrita grande fatiada | A carga lê o preparo e comprime em blocos longos | P0 e P3 |

Sobre IndexedDB, a literatura sustenta o diagnóstico mas **não** a cura: uma transação `readwrite` segura os locks dos
stores pelo tempo de vida dela, e transações `readwrite` no mesmo store não rodam concorrentemente — o que explica a
espera. Que **outro banco** tenha fila independente é plausível e não está medido em lugar nenhum. É por isso que a
escolha de P2 depende da sonda, não de opinião.

## 3. A proposta

Ordem por valor medido. P0 é correção; P1–P3 é o que muda o resultado.

### P0 — Devolver a carga ao que era (corrige A1)

1. `PreparedBlock` **não retém** `blockItems`. Hoje retém, para todos os tipos, inclusive canais, que não têm fileiras
   ([blockWrite.ts:146](../../../tv-web/src/lib/catalog/blockWrite.ts#L146)).
2. Os candidatos saem **da codificação que já acontece** — os itens estão em mãos ali — e ficam **acumulados em
   memória**. O documento é gravado **uma vez por seção**, não uma transação por categoria
   ([blockWrite.ts:196-203](../../../tv-web/src/lib/catalog/blockWrite.ts#L196-L203)).
3. `fillNextCandidates` ([prefetch/index.ts:72](../../../tv-web/src/lib/catalog/prefetch/index.ts#L72)) **não roda
   enquanto a carga está ativa**, ganha orçamento de tempo por rodada, e prefere os candidatos que a conversão de
   blocos da 082 já produz a descomprimir um bloco só para isso.

**Gate**: a carga por seção volta aos números da linha de base (séries ≤ ~3,5 s, filmes ≤ ~8 s) antes de medir abertura.

### P1 — Um documento por tela, lido numa leitura

Um registro por tela (`home`, `movies`, `series`) com **tudo o que a tela precisa para o primeiro desenho**:

```ts
interface ScreenDocument {
  id: 'home' | 'movies' | 'series'
  sourceId: string
  generation: number
  builtAt: number
  /** A trilha de categorias já na ordem da fonte — resolve o R-009 (854–991 ms hoje). */
  categories: { id: number; name: string; order: number; covered: boolean }[]
  /** As fileiras já montadas, na ordem em que a tela as desenha. */
  rows: { key: string; items: CatalogReadItem[]; external?: boolean; period?: string }[]
  /** As capas da PRIMEIRA tela, para o decode começar antes do 1º desenho (hoje só se sabe depois das leituras). */
  firstScreenImages: string[]
  coveredCategories: number
  totalCategories: number
}
```

- **Quem escreve**: quem grava a seção, em lote no fim (P0.2). Nunca a tela.
- **Quem lê**: a montagem, com **uma** leitura por chave primária.
- **Categoria escondida/travada continua filtrada na leitura** (feature 066, regra permanente): cada item carrega o
  `categoryId`, e a leitura aplica `getCategoryAccess` em memória. O access é a única leitura extra, e é pequena —
  precisa continuar fora do documento porque a preferência muda sem recarregar o catálogo.
- `covered` por categoria sai de `isCovered`, para o aviso de cobertura parcial seguir honesto (FR-006).

Ganho esperado: 6 leituras → 1; e `categoriesMs` (o gargalo atual, ~0,9 s) deixa de existir como leitura própria.

### P2 — O documento mora fora do banco do catálogo

É isto que torna a abertura **imune** à atualização em curso. Duas candidatas, **decididas pela sonda** (§4):

- **(a) banco próprio** (`ccplay-screens`): fila de transações independente, se a sonda confirmar que a fila é por banco.
- **(b) `localStorage`**: sem fila nenhuma, síncrono; ~27 KB por tela medidos no ensaio. Risco é bloquear a thread —
  a sonda mede o custo real de `getItem` + `JSON.parse` na TV, com a carga em curso.

Sem P2, P1 ainda espera na fila: foi o que aconteceu com a Home (leitura pequena, 1 986 ms).

### P3 — A carga cede a vez à primeira tela

- A carga e a pré-carga **não começam** antes da primeira revelação da sessão (ou de um teto curto, se nada revelar).
- Fatias curtas, cedendo a vez entre pedaços — alinhado à recomendação de manter transações abaixo de ~50 ms.

Ataca diretamente o pior caso medido: a Home abriu no mesmo instante em que a seção de canais era lida e comprimida.

### P4 — Stale-while-revalidate atômico

A tela mostra o documento guardado na hora; quando a atualização termina, o documento é **substituído inteiro**. Uma
fileira nunca aparece pela metade, e o foco e a rolagem não se movem (constituição: foco é o estado mais importante).
Atende o requisito de guardar informação **sem** perder a atualização.

### P5 — As capas da primeira tela vêm no documento

Hoje `imageUrls` só é conhecido **depois** de as leituras resolverem
([useHomeAssembly.ts:72](../../../tv-web/src/features/home/useHomeAssembly.ts#L72)), então o `decode` com
`fetchPriority: 'high'` começa tarde — o que explica `imagesSettled: 0` nas duas sessões. Com as URLs no documento, o
decode começa na mesma leitura que traz as fileiras.

## 4. O que a sonda ainda tem de responder (está escrita e pronta)

`sonda-tv/app2/montagem086.js`, três testes. Ensaiada no PC (roda de ponta a ponta, 4 formas de leitura, zero falhas) —
e, como esperado, **o PC não distingue nada**: tudo ≤ 1,3 ms, repouso 0,2 ms. Só a TV decide.

```powershell
.\sdd\specs\082-orcamento-armazenamento-tv\sonda-tv\instalar-sonda.ps1 -TvIp <ip> -App app2 `
  -AppId ccpSondaV2.Capacidades -Only montagemContencao,montagemDocumento,montagemBackfill
```

| Teste | Pergunta | Decide |
| --- | --- | --- |
| `montagemContencao` | Qual a latência de ler o documento **no mesmo banco**, **em outro banco** e no **localStorage**, sob carga `real` (ler+comprimir+gravar), `soIdb` (isola a fila) e `soCpu` (isola a thread)? E com a carga `fatiada`? | **P2 (a) ou (b)**, e se P3 basta sozinho |
| `montagemDocumento` | Gravar/ler o documento cru, como texto ou comprimido — bytes e ms | Formato do documento em P1 |
| `montagemBackfill` | Custo de descomprimir um bloco, e a projeção para as 390 categorias desta TV | Orçamento do backfill em P0.3 |

Critério de aprovação, fixado **antes** de medir: P2 é adotada se a leitura do documento sob carga `real` ficar com
**p95 ≤ 50 ms** (um quadro de folga a 60 fps) em ao menos uma das duas candidatas, nas **duas rodadas**. Se nenhuma
atingir, P2 não resolve sozinha e P3 passa a ser obrigatória — não afrouxar o número depois de ver o resultado.

## 5. Invariantes que este desenho não pode quebrar

1. **A abertura nunca percorre o tipo** (regra permanente da 086 no `CLAUDE.md`): nada de `iterateKindRecordBatches`,
   `loadSearchIndex` ou `selectShowcaseRowsByScan` no caminho da montagem.
2. **Categoria escondida/travada é filtrada na leitura**, nunca no dado guardado (feature 066).
3. **A tela nunca espera rede**: leitura que depende de serviço externo segue marcada `external` no slot.
4. **O documento nunca é fonte da verdade** — é uma projeção descartável do catálogo. Apagá-lo só custa uma abertura
   lenta; nunca perde conteúdo.
5. **Geração**: documento de geração diferente da ativa é ignorado, como os candidatos já fazem.
6. **Segredos**: o documento guarda o que o card mostra. URL de playback e credencial continuam fora dele (ADR-010
   permite no aparelho, mas não há motivo para colocá-las aqui).
7. **Foco**: fileira que entra depois da revelação não move foco nem rolagem.

## 6. Ordem sugerida de execução

| Passo | Conteúdo | Gate |
| --- | --- | --- |
| 1 | P0 (A1) | Carga de volta à linha de base, na TV |
| 2 | Sonda na TV, 2 rodadas | Decide P2 (a)/(b) com o critério de §4 |
| 3 | P1 + P2 | Contrato novo: a montagem faz **uma** leitura do documento (+ access) |
| 4 | P3 | Abertura da Home durante a carga ≤ 1 s |
| 5 | P4 + P5 | SC-005 (atualização com a tela aberta) e SC-011 (capas prontas) |
| 6 | Validação na TV, roteiro do `quickstart.md` §5 | SC-001 a SC-011 |

Formalmente isto são fases novas na 086 (a feature não convergiu, e estes são os critérios dela) — `sdd-converge`
anexa a fase e o `sdd-execute` a executa. Não vale fechar a 086 sem os números da TV.

## Fontes

- [Bringing Rich Experiences to Memory-Constrained TV Devices](https://netflixtechblog.com/bringing-rich-experiences-to-memory-constrained-tv-devices-6de771eabb16) — métricas e restrição de memória na TV
- [Evolution of Java Usage at Netflix](https://blog.bytebytego.com/p/evolution-of-java-usage-at-netflix) — LoLoMo e o leque de serviços por tela
- [Netflix web architecture reverse-engineered](https://gist.github.com/sshh12/dda3a89514f850c459380b18b1f7eb7b) — forma do documento de browse (fonte não oficial)
- [Speeding up IndexedDB reads and writes](https://nolanlawson.com/2021/08/22/speeding-up-indexeddb-reads-and-writes/) — transações pequenas × grandes
- [IndexedDB Transaction Management Patterns](https://www.browser-storage.com/indexeddb-architecture-advanced-patterns/indexeddb-transaction-management/) — locks pelo tempo de vida da transação, escopos curtos (fonte menos estabelecida)
- [Solving IndexedDB Slowness](https://rxdb.info/slow-indexeddb.html) e [IndexedDB tutorial](https://rxdb.info/articles/indexeddb/indexeddb-tutorial.html) — partição e trabalho em memória (claims do próprio fornecedor)
