# Plano de Implementação: Montagem rápida das telas principais

**Slug**: `086-montagem-rapida-telas` · **Spec**: ./spec.md · **Criado**: 2026-10-20

## Summary

Tirar a varredura do catálogo do caminho da abertura de Início, Filmes e Séries. Hoje cada abertura percorre o tipo inteiro
(43 510 filmes, 9 768 séries) para montar 24 cards: ~2 s de tela vazia no Início e +34–41 MB de heap por tipo. O desenho
troca isso por **candidatos guardados por categoria**, escritos por quem já está gravando a categoria, e mesclados na
abertura com os mesmos acumuladores de hoje — o conteúdo não muda, o custo sai da tela. As fileiras que dependem de serviço
externo (Top 10, Dica, Porque você assistiu) passam a ler um **resultado guardado**, e a montagem nunca espera rede.

## Technical Context

- **Linguagem/plataforma**: TypeScript 5 + React 19, Vite 8, alvo `chrome108`. TV de referência QN50Q60DAGXZD (Tizen 9 /
  Chromium 120, `file://`), ~4× mais lenta que o PC em processamento, `jsHeapSizeLimit` 364 MB.
- **Armazenamento**: IndexedDB via Dexie 4 (`tv-web/src/lib/catalog/db.ts`, schema na v16; esta feature acrescenta a v17).
  O catálogo é a fonte da verdade (ADR-002/ADR-008); nada aqui consulta provedor.
- **Testes**: Vitest com dois projetos (`dom` para `*.test.tsx`, `node` para `*.test.ts`), Playwright para E2E
  (`tv-web/e2e/run.mjs`). Canal de métricas da feature 085 para medir na TV.
- **Escala real medida**: 3 listas no aparelho do usuário, 390 categorias, 262 blocos, 1 049 episódios, 80 metadados.
- **Restrições**: ratchet de arquitetura (`lib/` não importa de `features/`; 300 linhas por arquivo de produção);
  constituição (foco, dados reais); teto de armazenamento da 082 (todo gravador novo chama `makeRoomFor`); feature 066
  (categoria escondida/travada nunca vaza).
- **ADRs relevantes**: ADR-002 (offline-first), ADR-008 (client-first), ADR-011 (DS V14, sem prévia no foco), ADR-020 (chave
  TMDB BYOK). Nenhuma é contrariada.

## Decisões Invariantes

- **D-001**: Os candidatos são **por categoria**, nunca uma seleção global. Recalcular = recalcular a categoria gravada, com
  os itens já em mãos. É isso que torna o custo incremental.
- **D-002**: A fileira final é montada com **os mesmos acumuladores de hoje**, alimentados na mesma ordem (categoria na ordem
  da fonte, itens na ordem do bloco). Não existe algoritmo de seleção novo — o contrato C1 prova a equivalência.
- **D-003**: Categoria escondida/travada e item ausente são filtrados **na leitura**, não no dado guardado. Mudar PIN ou
  visibilidade nunca exige recalcular.
- **D-004**: As fileiras de serviço externo guardam o **resultado** do casamento com o período a que pertence. A montagem lê;
  nunca dispara nem espera a consulta.
- **D-005**: Período vencido não esvazia fileira: mostra o guardado até o novo chegar, sem aviso técnico na tela.
- **D-006**: A lógica pura de seleção migra para `lib/catalog/showcaseSelection.ts` e `features/vod/*` **reexporta** — os
  contratos travados das features 052, 056 e 065 continuam importando dos mesmos caminhos.
- **D-007**: A varredura completa (`selectShowcaseRowsByScan`) continua existindo como referência de correção e caminho de
  reserva, mas **nunca** no caminho da abertura.
- **D-008**: A medição na TV (linha de base por leitura, renderização, quadros e memória) vem **antes** de mudar o desenho.
- **D-009**: Nenhuma mudança no motor `stepAssembly` da feature 079. A ordem das leituras e o que cada slot espera mudam; a
  máquina de revelação, não.

## Constitution Check

| Princípio | Pré-Design | Pós-Design |
| --- | --- | --- |
| Sem Conta Obrigatória | OK — nada de conta | OK |
| Segredos Fora dos Clientes e dos Logs | Atenção: os candidatos guardam nome e URL de capa do provedor | OK — é o mesmo dado já gravado em `categoryBlocks` (ADR-010); nada vai a log, erro ou terceiro, e o canal de métricas só manda números |
| Categorias da Fonte São Preservadas | OK — não mexe em categorias | OK |
| IA e Classificação Nunca Inventam Dados | OK — seleção determinística sobre dado do provedor | OK |
| Comandos Locais Independem de Rede | Reforçado: a montagem deixa de esperar rede | OK (FR-013, contrato C3) |
| Foco Visível e Sem Becos Sem Saída | Risco: fileira entrando depois da revelação | OK — FR-018 proíbe mover foco/rolagem; a tela nunca aparece vazia |
| Voltar Restaura Foco e Posição | OK — reconciliação por id não muda | OK |
| Identidade de Reprodução Não Depende da URL | Atenção: candidatos guardam campos de item | OK — guardam `providerStreamId`/`seriesId`, a mesma identidade lógica; nenhuma URL de reprodução |
| Progresso e Capacidades São Reais | Atenção: cobertura parcial precisa continuar honesta | OK — FR-006 guarda a cobertura junto |
| Uma Lista Nunca É Manifesto de Streaming | OK | OK |
| Toda Ação Essencial por Controle Remoto | OK — não muda navegação | OK |
| Documentação do Repositório É Canônica | — | OK — Polish atualiza o que mudar |

Nenhuma violação. `## Complexity Tracking` fica vazio.

## Project Structure

```text
tv-web/src/
├── lib/catalog/
│   ├── db.ts                          # schema v17: showcaseCandidates, showcaseExternalRows
│   ├── showcaseCandidates.ts          # NOVO (stub) — candidatos por categoria
│   ├── showcaseRows.ts                # NOVO (stub) — montagem + fileiras externas
│   ├── showcaseSelection.ts           # NOVO (stub) — lógica pura movida de features/vod + varredura de referência
│   ├── repository/categoryItems.ts    # renewCategoryItems: passa a gravar candidatos
│   ├── storageRelease.ts              # liberação: apaga candidatos da categoria
│   ├── sourceDeletion.ts              # apagar lista: apaga candidatos e fileiras externas
│   └── catalogDerivedRows.ts          # iterateKindRecordBatches (só na varredura de referência, fora da tela)
├── features/
│   ├── catalog/catalogApi.ts          # useRecentlyAdded/useTopRated/Top10/Dica passam a ler o guardado
│   ├── catalog/prefetchApi.ts         # invalidação por lote da vitrine (achado §5 do logic)
│   ├── vod/vodShowcase.ts             # reexporta de lib/catalog/showcaseSelection
│   ├── vod/ratedSelection.ts          # idem
│   ├── vod/useShowcaseAssembly.ts     # slots: externas deixam de segurar a tela
│   ├── home/useHomeAssembly.ts        # ordem das leituras
│   └── home/HomeContent.tsx           # leituras da Home
└── components/ (Rail, PosterArt)      # prioridade das capas da primeira tela
```

## Estratégia de Testes

Prioridade: unitário → contrato → E2E → manual na TV.

**Testes de contrato (5/5, travados)**

| Teste | Arquivo | Fase | Origem |
| --- | --- | --- | --- |
| C1 `a montagem por candidatos devolve exatamente o mesmo que a varredura completa` | `showcaseRows.montagem-rapida.contract.test.ts` | 3 | FR-004, US1/AC1 |
| C2 `item de categoria escondida ou travada por PIN nunca aparece…` | idem | 3 | FR-005, Constitution (feature 066) |
| C3 `montar as fileiras não lê nenhum bloco do catálogo nem toca a rede` | idem | 3 | FR-002, FR-013, FR-016 |
| C4 `uma categoria gravada depois entra nas fileiras na montagem seguinte` | idem | 3 | FR-008, US1/AC3 |
| C5 `guarda os mais novos e os melhores da categoria, sem ler o banco…` | `showcaseCandidates.montagem-rapida.contract.test.ts` | 3 | FR-003, `logic` §1 |

Comando (em `tv-web/`):

```bash
npx vitest run src/lib/catalog/showcaseRows.montagem-rapida.contract.test.ts src/lib/catalog/showcaseCandidates.montagem-rapida.contract.test.ts
```

Saída vermelha confirmada em 2026-10-20 — os 5 falham com `Error: not implemented`, nenhum por import/tipo/sintaxe.

Trava (na raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 086-montagem-rapida-telas`

**Comandos base** (em `tv-web/`): `npm run test` · `npx tsc -b` · `npm run lint` · `npm run build` ·
`npm run test:e2e -- --only <scripts>` (pelo Bash: no PowerShell o `--` some).

**Travas de outras features que esta pode quebrar**: 052/056/065 (`features/vod/vodShowcase.*`,
`ratedSelection*.contract.test.ts` — D-006 existe para elas continuarem passando), 079
(`screenAssembly.home-carregamento-progressivo.contract.test.ts`), 066, 082 e 085.

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | O dedupe por título de "Bem avaliados" é global entre categorias; um top-K por categoria pode, em teoria, divergir da varredura | FR-004 (mesmos itens) falha | `RATED_CANDIDATES = 48` (pool de 36 + folga) e o contrato C1 compara com a varredura. Se divergir, **aumentar a folga**, nunca mudar o algoritmo para o teste passar |
| R-002 | `eligibleCount` por categoria soma com duplicatas entre categorias, superestimando o total | O mínimo de 5 para a fileira existir, e o aviso de cobertura, podem diferir num catálogo pequeno | Contar elegíveis distintos na mesclagem (os candidatos já estão em mãos), não somar os números por categoria |
| R-003 | Os candidatos ocupam espaço: ~48+12 itens × 390 categorias × 3 listas | Teto de armazenamento da 082 | Gravar pelos caminhos que já chamam `makeRoomFor`; medir o tamanho real na Fase 2 e baixar `RATED_CANDIDATES` se passar de ~1 MB por lista |
| R-004 | Mover a seleção de `features/vod` para `lib/` pode quebrar os contratos travados das features 052, 056 e 065 | Trava de outra feature vermelha | **Resolvido (T011, 2026-10-20)**: código movido com reexport nos caminhos antigos; as três travas verificadas íntegras e 194 testes de `features/vod` passando |
| R-005 | A vitrine é invalidada a cada lote da pré-carga (até 1/s) e hoje revarre tudo (`prefetchApi.ts`, achado do `logic` §5) | Com a leitura barata deixa de doer, mas pode sobrar custo de remontagem | **Aberto**: a medição (T003) não teve tela aberta durante o pico da pré-carga, então não confirmou nem descartou. Reavaliar na Fase 4 (T034) com a leitura já barata |
| R-006 | A Home desenha as 5 fileiras de uma vez, sem virtualização vertical (as vitrines têm) | Pode ser parte do custo de renderização | **Resolvido: descartado pela medição (T003, 2026-10-20).** Com dado em cache, a Home revela em 1 ms e `paintMs` é 1 ms — desenhar não é o gargalo. Não virtualizar a Home nesta feature |
| R-007 | A TV é gate, com 2 passadas planejadas, e cada instalação pede autorização | A feature pode parar esperando a TV | Pedir autorização por instalação; fechar sem a TV só por decisão explícita do usuário, registrada aqui |
| R-009 | **A lista de categorias custa ~1 s** (`categoriesMs` 1 074 ms em Séries, T003): é a leitura obrigatória da vitrine e sozinha define quando a tela aparece. Não é a varredura do tipo, e o plano não a previa | SC-003 (≤ 1 s) fica no limite só por causa dela | Medir e tratar na Fase 4 (ordem das leituras): se continuar em ~1 s depois da US1, abrir task própria. Não aumentar o escopo sem medir |
| R-010 | **Memória não é mensurável nesta TV**: `performance.memory` devolveu 10 MB fixos nas 44 amostras | SC-010 (pico não maior que hoje) sem método de verificação | Tratar SC-010 como **não verificável na TV** e trocar a prova por uma indireta: o contrato C3 garante que a montagem não lê blocos do catálogo, que é a origem do consumo. Registrar na convergência |
| R-011 | Tudo fica 2–5× mais lento sob concorrência: o orçamento levou 2 437 ms durante a abertura, contra ~400 ms com o app quieto (T003) | As metas de tempo valem no pior momento, que é o real | Medir a validação (T061) no mesmo roteiro da linha de base, com a pré-carga acontecendo — comparar igual com igual |
| R-008 | Top 10/Dica dependem do índice de nomes do tipo para casar títulos; esse casamento continua caro | Se rodar na hora errada, volta a competir com a navegação | D-004: roda fora da abertura, na fila que já existe; nunca na montagem |

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 — medição | Concluída: instrumentação por leitura + pico de heap; linha de base medida na TV (`evidencias/linha-de-base-tv-2026-10-20.md`) |
| Fase 2 — base | Concluída: schema v17, seleção movida para `lib/` com reexport, varredura de referência pronta |
| Fases 3–6 | Pendentes; contratos C1–C5 vermelhos por `not implemented` |
| TV | Pacote normal reinstalado; coletor parado |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-20 | Fase 1 (T001–T004) | Instrumentação por leitura e pico de heap; linha de base na TV: Início revela por `cap` em 2 039 ms com **6 de 6 leituras pendentes**; Séries espera 1 074 ms só por `categories`; reentrada em cache revela em 1 ms | R-006 descartado (renderização não é o gargalo); R-009 (categorias ~1 s) e R-010 (memória não mensurável) abertos |
| 2026-10-20 | Fase 2 (T010–T013) | Schema v17 com as 2 tabelas; seleção movida para `lib/catalog/{showcaseSelection,ratedSelection}.ts` com reexport em `features/vod`; `selectShowcaseRowsByScan` pronta; limpeza da lista | Travas de 052/056/065 confirmadas íntegras; teto de linhas do `db.ts` ajustado no baseline |

**PRÓXIMO**: Fase 3 (T020–T028) — implementar os candidatos e a montagem até os 5 contratos ficarem verdes. Antes: Fase 2 (T010–T013) — schema v17, mover a lógica de seleção para `lib/catalog/showcaseSelection.ts` com reexport em `features/vod` (R-004) e a varredura de referência.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual. -->

- `tv-web/src/lib/assembly/useScreenAssembly.ts` — tempo por leitura (`slotMs`) e `paintMs`
- `tv-web/src/lib/perf/assemblyTiming.ts` — emite `<leitura>Ms` e `paintMs` no canal
- `tv-web/src/components/PerfOverlay.tsx` — pico de heap junto dos quadros
- `tv-web/src/lib/catalog/showcaseSelection.ts` — seleção pura + `selectShowcaseRowsByScan` (referência do C1)
- `tv-web/src/lib/catalog/ratedSelection.ts` — "Bem avaliados" (movido de `features/vod`)
- `tv-web/src/lib/catalog/{showcaseCandidates,showcaseRows}.ts` — stubs a implementar na Fase 3
- `tv-web/src/lib/catalog/{db,showcaseTypes,sourceDeletion}.ts` — schema v17 e limpeza
- `sdd/specs/086-montagem-rapida-telas/evidencias/linha-de-base-tv-2026-10-20.md` — a referência da validação

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)
- A chave de métrica de uma leitura é camelCase com sufixo `Ms` (`added-movies` → `addedMoviesMs`): o canal recusa chave com hífen.
- `paintMs` inclui a janela deliberada de 300 ms da feature 079 quando a tela revela por `ready`; não é "custo de pintar" puro.
- Medir com o app recém-aberto mede junto a pré-carga — que é o caso real, mas torna a comparação válida só contra outra medição no mesmo roteiro.
- O `sdb` pode travar ao lançar o app depois de instalar; a instalação já foi feita, basta abrir pela TV.
- `VodShowcaseScreen.test.tsx` é flake conhecido na suíte completa (passa isolado); não confunda com regressão desta feature.
