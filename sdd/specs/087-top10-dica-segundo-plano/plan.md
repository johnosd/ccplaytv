# Implementation Plan: Top 10 e Dica produzidos em segundo plano

**Feature**: 087-top10-dica-segundo-plano
**Spec**: `spec.md`
**Criado**: 2026-10-21

## Summary

Mover a produção do **Top 10** e da **Dica** da tela para a fila de segundo plano, guardando o resultado, e fazer as
telas apenas **lerem** esse resultado. As regras de seleção da feature 057 não mudam — muda **onde** e **quando** são
calculadas.

O que motiva: casar o ranking do TMDB com a lista exige um índice com os nomes de **todos** os itens do tipo, e montá-lo
percorre o catálogo inteiro (43 549 filmes na TV de referência). Hoje isso acontece na tela — fora da montagem (o slot é
`external`), mas na mesma thread, enquanto a pessoa navega. Depois da feature 086, é a última coisa que ainda percorre o
catálogo quando uma tela abre.

O trabalho real **não** é a mudança (ela já foi escrita uma vez, na 086/T082, e revertida): é levar para o lugar novo as
**14 garantias de comportamento** que hoje vivem nos testes de tela da 057, listadas em `spec.md` → `## Assumptions`.

## Technical Context

- **Linguagem/plataforma**: TypeScript + React 19 + Vite, alvo `chrome108`; app Tizen rodando de `file://` na TV
  (QN50Q60DAGXZD, Tizen 9 / Chromium 120).
- **Armazenamento**: IndexedDB via Dexie 4 (`tv-web/src/lib/catalog/db.ts`). A tabela `showcaseExternalRows` **já
  existe** (schema v17, feature 086) com índice `'id, sourceId, [sourceId+generation+kind]'`. Os campos novos desta
  feature **não são indexados** → **não há migração de schema**.
- **Serviço externo**: TMDB, com a chave BYOK da pessoa (ADR-020). O carregador (`lib/metadata/tmdbDiscovery.ts`) já faz
  cache por período em `discoveryCache` e já responde sem rede quando o período está em cache.
- **Regras de seleção**: `lib/metadata/discoveryRules.ts` (`selectTop10`, `selectTip`, `matchDiscoveryTitlesAsync`,
  `TOP10_MIN`, `TIP_MIN`, `yieldToMain`). **Contrato travado da feature 057 — não muda.**
- **Fila de segundo plano**: `lib/catalog/prefetch/index.ts` → `housekeeping()`. Já traz de graça: espera o aparelho
  ficar quieto (`activityGate`), cede a vez à primeira tela da sessão (`firstReveal`, feature 086) e se cala durante a
  carga da lista (`loadActivity`, feature 086).
- **Testes**: Vitest em dois projetos (`dom` para `*.test.tsx`, `node` para `*.test.ts`); E2E próprio em `tv-web/e2e/`.
- **Performance**: Filmes e Séries abrem em 313–380 ms (medido na TV em 2026-10-21). Esta feature **não deve piorar**
  isso, e o ganho esperado é em fluidez durante a navegação, não em tempo de abertura.

## Decisões Invariantes

1. **`discoveryRules.ts` e `tmdbDiscovery.ts` não mudam**, exceto **exportar `localDay`** (uma linha). Os dois têm
   contrato travado da feature 057.
2. **A forma do retorno de `useWeeklyTop10`/`useDailyTip` não muda** (`DiscoveryRowResult<R>`): o contrato de tela da
   057 (`VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx`) **mocka esses dois hooks**, e mudar a forma o quebra.
3. **O produtor mora em `lib/catalog/`**, nunca em `features/` (ratchet `lib-to-ui`). O registro guarda
   `CatalogReadItem`; a conversão para o item de tela fica na leitura, como a feature 086 já faz.
4. **Gravar vazio é intencional** quando a seleção fica abaixo do mínimo: o período é a validade, e sem isso a fila
   repete o trabalho mais caro (montar o índice do tipo) a cada rodada.
5. **A produção nunca roda na carga da lista nem antes da primeira revelação da sessão** — herda os portões da 086, e
   **não** é chamada ao fim da carga por seção.
6. **Consulta ao TMDB passa a ser disparada por tempo, não por abrir a tela.** É uma mudança de natureza, aceita com o
   limite que o período impõe: no máximo 1 consulta/semana (Top 10) + 1/dia (Dica) por tipo, com a lista ativa — no
   máximo 4 por dia. A ADR-016 ("nenhuma consulta automática") trata do **serviço do portal**, não do TMDB; nenhuma ADR
   é contrariada. Registrado como R-001.
7. **Nenhum segredo sai**: a chave do TMDB nunca entra em registro, log ou métrica. O registro guarda só o que o card
   mostra.

## Constitution Check

| Princípio | Pré-Design | Pós-Design |
| --- | --- | --- |
| Foco é o estado mais importante; todo estado tem elemento focável | OK — a fileira que entra depois não move foco nem rolagem (FR-006); sem resultado a fileira não existe, e a tela já tem outras fileiras e a trilha | OK — nenhuma mudança de foco; a leitura entra pelo caminho que a 086 já usa |
| Voltar restaura foco e rolagem por id | OK — não toca navegação | OK |
| Identidade lógica estável (nunca URL) | OK — o registro guarda itens por id local do catálogo | OK |
| Segredos fora de log, erro e UI | **Atenção**: a produção usa a chave BYOK. Decisão invariante 7 fecha: a chave não entra no registro nem em métrica | OK — o registro tem só itens, posições, fundos e notas |
| Nada de progresso inventado nem dado falso | OK — sem resultado a fileira **não existe**; nunca esqueleto nem "Em breve" (FR-005) | OK |
| Categoria do provedor nunca substituída por taxonomia externa | OK — o TMDB só casa títulos; categorias não são tocadas | OK |
| Categoria escondida/travada nunca aparece | **Atenção**: o índice do produtor é do tipo inteiro. A cobertura gravada vem de `listVisibleCategories` | **Ver R-002**: o casamento usa o tipo inteiro, como hoje; a decisão de visibilidade continua onde já está |
| Verdades honestas; gate de qualidade antes de "pronto" | OK | OK — 5 contratos travados + E2E + TV |

Sem violação não justificável. Nada para `## Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```
sdd/specs/087-top10-dica-segundo-plano/
├── spec.md
├── plan.md
├── tasks.md
├── logic/producao-em-segundo-plano.md    ← onde cada coisa mora e quando roda
├── quickstart.md
└── contract-tests.lock
```

### Source Code (repository root)

```
tv-web/src/
├── lib/catalog/
│   ├── externalRows.ts                 ← NOVO (stub criado): o produtor
│   ├── showcaseRows.ts                   readExternalRow / writeExternalRow (prontos)
│   ├── showcaseTypes.ts                  ShowcaseExternalRowRecord (campos novos já no stub)
│   └── prefetch/index.ts                 housekeeping chama o produtor
├── lib/metadata/
│   ├── discoveryRules.ts                 NÃO MUDA (contrato travado da 057)
│   └── tmdbDiscovery.ts                  só exporta `localDay`
└── features/catalog/
    ├── catalogApi.ts                     useWeeklyTop10/useDailyTip passam a ler
    ├── catalogApi.discovery.test.tsx      ← 14 garantias mudam de lugar
    └── catalogApi.discovery.estados.test.tsx
```

## Complexity Tracking

Nada a registrar.

## Estratégia de Testes

Prioridade: unitário → contrato → E2E → manual na TV.

```bash
# área tocada (rápido, durante as fases)
npx vitest run src/lib/catalog src/features/catalog src/lib/metadata

# contratos desta feature
npx vitest run src/lib/catalog/externalRows.top10-dica-segundo-plano.contract.test.ts src/features/catalog/catalogApi.top10-dica-segundo-plano.contract.test.tsx

# gates finais
npm run test && npx tsc -b && npm run lint && npm run build
npm run test:e2e        # precisa de `npm run dev` no ar
```

Travas a conferir (esta feature e as que ela pode quebrar):

```powershell
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 087-top10-dica-segundo-plano
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 057-top10-dica-tmdb
.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 086-montagem-rapida-telas
```

### Testes de Contrato

**5 de 5 do orçamento usados.** Arquivos travados em `contract-tests.lock`:

| Teste | Arquivo | Origem | Vermelho confirmado por |
| --- | --- | --- | --- |
| grava os mesmos itens, na mesma ordem e com a posição real | `lib/catalog/externalRows...contract.test.ts` | **FR-004**, US1/AC1 | `not implemented` |
| dentro do período não produz; vencido sem resposta mantém | idem | **FR-007**, **FR-008**, US2/AC1+AC3 | `not implemented` |
| abaixo do mínimo grava o período com a fileira vazia | idem | **FR-015** | `not implemented` |
| lê o guardado sem tocar a rede nem percorrer o catálogo; sem resultado a fileira não existe | `features/catalog/catalogApi...contract.test.tsx` | **FR-001**, **FR-002**, **FR-003**, **FR-005** | asserção (`expected +0 to be 3`) |
| remover a chave apaga o guardado e a fileira some, sem requisição | idem | **FR-011**, US3/AC2 | asserção — **hoje a tela toca a rede** (`called 1 times`) |

Confirmado em 2026-10-21: `5 failed (5)`, nenhum por erro de import, sintaxe ou tipo; e a suíte da área seguiu com
`1002 passed` — os stubs não quebraram nada.

**O que os contratos deliberadamente NÃO cobrem** (fica para os testes de fase, porque o orçamento é 5): troca de
idioma (FR-012), salvar a chave acordando a fila (FR-010), série usando o ranking de séries, estabilidade do sorteio da
Dica, e as demais garantias da lista de `## Assumptions`. **Elas não são opcionais** — o FR-017 as exige, e o Critério
de Conclusão de cada fase as cobra.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação |
| --- | --- | --- | --- |
| R-001 | **A consulta ao TMDB passa a ser disparada por tempo**, não por abrir a tela: a cota da chave da pessoa é consumida mesmo em sessões em que ela nunca abriria Filmes ou Séries | Consumo de cota alheio ao uso; mudança de natureza em relação ao que existe hoje | Decisão invariante 6: o período limita a no máximo 1 consulta/semana (Top 10) + 1/dia (Dica) por tipo, só com lista ativa — no máximo 4/dia. A ADR-016 trata do serviço do portal, não do TMDB. **Se o consumo incomodar, a saída é produzir só depois de a tela ter sido aberta uma vez na vida da lista** — registrar antes de implementar |
| R-002 | O índice do produtor é do **tipo inteiro**, incluindo categorias escondidas/travadas — igual a hoje | Um título de categoria escondida poderia entrar na fileira | **Igual ao comportamento atual** (a feature não muda isso): o casamento é por nome, e a cobertura gravada vem de `listVisibleCategories`. Se virar requisito, é feature própria — não alargar aqui sem registrar |
| R-003 | Os 14 testes de comportamento mudam de lugar; perder uma garantia no caminho é silencioso | Regressão invisível em "sem rede", "chave recusada", "troca de idioma" | O FR-017 e a tabela do `logic` §8 listam cada garantia e o destino dela. O Critério de Conclusão da Fase 4 exige a tabela inteira coberta |
| R-004 | A estabilidade do sorteio da Dica **muda de natureza**: era "fixado na montagem da tela", passa a ser "fixado no período gravado" | Um teste de hoje cobre o comportamento antigo e não tem equivalente direto | Esperado e mais forte (sobrevive a remontagens). Registrado no `logic` §8; o teste equivalente verifica a estabilidade pelo `periodKey` |
| R-005 | `catalogApi.ts` tem teto de linhas no ratchet | Build vermelho por 1 linha, como aconteceu na 086 | Remover o bloco da tela **reduz** o arquivo. Rodar `node scripts/architecture.mjs` antes de fechar a fase, e **não** aproveitar para mover outras coisas para lá |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. -->

## Cuidados para Retomada

<!-- Anexado pelo sdd-execute quando descobrir armadilha operacional. -->
