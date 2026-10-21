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
| R-005 | A vitrine é invalidada a cada lote da pré-carga (até 1/s) e hoje revarre tudo (`prefetchApi.ts`, achado do `logic` §5) | Com a leitura barata deixa de doer, mas pode sobrar custo de remontagem | **Resolvido (T034)**: a vitrine passou a ler candidatos (barata) e segue acompanhando cada lote — o que mantém o frescor (FR-008); a consulta pesada que sobrou (índice de nomes do Top 10/Dica) entrou no grupo de remontagem limitada |
| R-006 | A Home desenha as 5 fileiras de uma vez, sem virtualização vertical (as vitrines têm) | Pode ser parte do custo de renderização | **Resolvido: descartado pela medição (T003, 2026-10-20).** Com dado em cache, a Home revela em 1 ms e `paintMs` é 1 ms — desenhar não é o gargalo. Não virtualizar a Home nesta feature |
| R-007 | A TV é gate, com 2 passadas planejadas, e cada instalação pede autorização | A feature pode parar esperando a TV | **As 2 passadas foram feitas (2026-10-20)**: linha de base e validação. A validação **reprovou** (SC-001/002/003), e os achados estão em R-014 e R-015. Falta uma 3ª passada depois de P0–P3, mais a sonda `montagem086` — cada instalação continua pedindo autorização |
| R-012 | **Emenda aprovada dos contratos C1 e C2 (2026-10-20, autorizada pelo usuário)**: o C1 montava os candidatos a partir de `block?.items ?? items`, mas os blocos são comprimidos desde a 082 (`block.items` não existe), então passava registros **sem id local** — e o sorteio de "Bem avaliados" usa o id, o que fazia os dois caminhos divergirem por construção. O C2 gravava a preferência por nome (`n:Cat 0`) enquanto a categoria casa por `p:100`, e travava sem PIN configurado (sem PIN nada bloqueia, feature 067) | Os contratos não podiam passar sem quebrar FR-004 ou a feature 066 | **Resolvido**: C1 passa a ler os itens gravados por `readBlockChunks`; C2 passa `providerCategoryId` e configura o PIN antes de travar. O que cada teste verifica não mudou — só o preparo do cenário. Trava regravada; 5/5 verdes |
| R-013 | O `now` que a gravação passa é o **carimbo de obtenção**, não o relógio; a régua de ano de "Bem avaliados" compara com o ano corrente. Usar o carimbo fazia `eligibleCount` ficar 0 e a fileira vazia | Fileira "Bem avaliados" vazia em toda lista | **Resolvido (T022)**: os candidatos são escolhidos com `Date.now()`, documentado no `blockWrite.ts` e no logic §3 |
| R-009 | **A lista de categorias custa ~1 s** (`categoriesMs` 1 074 ms em Séries, T003): é a leitura obrigatória da vitrine e sozinha define quando a tela aparece. Não é a varredura do tipo, e o plano não a previa | SC-003 (≤ 1 s) fica no limite só por causa dela | **Reinterpretado pela sonda (T070)**: a trilha custa ~26 ms por volume (390 categorias), não ~900 ms — aqueles números eram contenção. Guardá-la pronta economiza ~25 ms em repouso e ~65 ms no p95 sob carga: ganho real, modesto. Antes disto o risco dizia (T061): com as fileiras em 0 ms, `categoriesMs` virou igual ao `revealMs` (854 ms em Filmes, 991 ms em Séries) — é ele que decide quando a vitrine aparece. Tratado por P1 de `logic/documento-de-tela.md`: a trilha de categorias entra no documento de tela e deixa de ser leitura própria |
| R-010 | **Memória não é mensurável nesta TV**: `performance.memory` devolveu 10 MB fixos nas 44 amostras | SC-010 (pico não maior que hoje) sem método de verificação | Tratar SC-010 como **não verificável na TV** e trocar a prova por uma indireta: o contrato C3 garante que a montagem não lê blocos do catálogo, que é a origem do consumo. Registrar na convergência |
| R-011 | Tudo fica 2–5× mais lento sob concorrência: o orçamento levou 2 437 ms durante a abertura, contra ~400 ms com o app quieto (T003) | As metas de tempo valem no pior momento, que é o real | Medir a validação (T061) no mesmo roteiro da linha de base, com a pré-carga acontecendo — comparar igual com igual |
| R-014 | **Parcialmente retirado (T069/T080, 2026-10-21)**: em séries a regressão era real e está resolvida (26,6 s → 3,1–3,5 s em 3 sessões); **em filmes não há evidência de regressão** — o `encodeMs` depende de haver regravação, e as sessões comparadas diferiam nisso (3ª sessão: 781 ms sem regravação). Duas explicações que eu dei para o número de filmes estavam erradas, e estão registradas no adendo §4 da evidência. O texto original dizia: a feature deixou a carga da lista mais lenta (T061, 2026-10-20): séries 3,2 s → 26,6 s, filmes 7,4 → 9,7 s, canais 1,6 → 3,7 s; leituras de categoria em segundo plano de 153–2 586 ms para 8 523–10 618 ms. Causa: `PreparedBlock` retém `blockItems` para todos os tipos (inclusive canais, que não têm fileiras), `pickCandidates`+`writeCandidates` rodam serializados com uma transação por categoria, e `fillNextCandidates` descomprime um bloco por rodada concorrendo com a carga | A 1ª abertura da sessão concorre com a carga **por desenho** (a lista sempre se atualiza), então a carga mais lenta piora exatamente a abertura que a feature queria acelerar; e desfaz o ganho da feature 085 | **Aberto**: P0 de `logic/documento-de-tela.md` — não retém itens, candidatos saem da codificação que já acontece e o documento é gravado uma vez por seção; backfill com orçamento e nunca durante a carga. Gate: carga de volta à linha de base **antes** de medir abertura |
| R-015 | **Resolvido pela sonda (T070, 2026-10-21), com uma hipótese REFUTADA**: a espera da abertura é fila, não volume (T061): a Home esperou 1 986 ms por uma leitura de dezenas de linhas, no instante em que a carga lia o preparo e comprimia. A literatura confirma a causa (transação `readwrite` segura os locks do store pelo tempo de vida; `readwrite` no mesmo store não é concorrente) mas **não** a cura — que outro banco tenha fila independente é plausível e não está medido | Qualquer redução de volume na abertura tem teto: a leitura espera o recurso ocupado | **Resolvido**: as 2 rodadas deram `localStorage` p95 **0,8/0,8 ms**, mesmo banco com 1 registro **22,6/19,1 ms** e **banco separado 223/40,8 ms — reprovado**. Banco próprio era a candidata principal e a TV a refutou. A causa é a **thread**, não a fila: só comprimindo, a leitura já custa p95 ~20 ms. P2 = `localStorage` com o IndexedDB como reserva; documento **cru**; P3 passa a ser "não começar a carga antes da 1ª revelação" (fatiar deu 19,2 e 104,9 — não confiável). Evidência: `evidencias/sonda-montagem-tv-2026-10-21.md` |
| R-008 | Top 10/Dica dependem do índice de nomes do tipo para casar títulos; esse casamento continua caro | Se rodar na hora errada, volta a competir com a navegação | D-004: roda fora da abertura, na fila que já existe; nunca na montagem |

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 — medição | Concluída: instrumentação por leitura + pico de heap; linha de base medida na TV (`evidencias/linha-de-base-tv-2026-10-20.md`) |
| Fase 2 — base | Concluída: schema v17, seleção movida para `lib/` com reexport, varredura de referência pronta |
| Fase 3 (US1) — fileiras guardadas | **Concluída**: 5/5 contratos verdes; a abertura não varre mais o tipo |
| Fase 4 (US2) — serviço externo | **Concluída** (T031 parcial): a montagem não espera rede, e o índice do Top 10/Dica saiu da abertura |
| Fase 5 (US3) — renderização | **Concluída sem mudança**: a medição descartou o desenho como gargalo (1 ms com cache) |
| Fase 6 (US4) — primeira tela | **Concluída**: capas da primeira tela com prioridade de rede; virtualização e lazy preservados |
| Fase 7 — gates e TV | Gates de código **verdes** (3682 testes, 54/54 E2E, build). **Validação na TV feita e reprovada**: SC-001/002/003 falharam (R-014, R-015) |
| Fase 8 — convergência | **P0, as medições na TV e o documento de tela fechados** (T064–T072, T076–T080). A abertura lê **um registro do `localStorage`** (p95 0,8 ms sob carga na TV) com o caminho dos candidatos como reserva. A carga espera a 1ª revelação da sessão (T073). Falta T074/T075 e a validação final |
| TV | Build de **medição** instalado (`VITE_CCPLAY_PERF` + canal de métricas) — **reinstalar o pacote normal** ao fechar a próxima rodada. Coletor parado |
| Próximo desenho | `logic/documento-de-tela.md`: P0 (desfazer a regressão da carga) → sonda `montagem086` → documento de tela numa leitura, fora do banco do catálogo |
| Sonda | `montagem086.js` (4 testes) **rodada na TV, 2 rodadas**, desinstalada ao final. Decidiu P2 = `localStorage`, documento **cru**, e refutou o banco separado. Evidência: `evidencias/sonda-montagem-tv-2026-10-21.md` |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-20 | Fase 1 (T001–T004) | Instrumentação por leitura e pico de heap; linha de base na TV: Início revela por `cap` em 2 039 ms com **6 de 6 leituras pendentes**; Séries espera 1 074 ms só por `categories`; reentrada em cache revela em 1 ms | R-006 descartado (renderização não é o gargalo); R-009 (categorias ~1 s) e R-010 (memória não mensurável) abertos |
| 2026-10-20 | Fase 2 (T010–T013) | Schema v17 com as 2 tabelas; seleção movida para `lib/catalog/{showcaseSelection,ratedSelection}.ts` com reexport em `features/vod`; `selectShowcaseRowsByScan` pronta; limpeza da lista | Travas de 052/056/065 confirmadas íntegras; teto de linhas do `db.ts` ajustado no baseline |
| 2026-10-20 | Fase 3 (US1, T020–T029) | Candidatos por categoria gravados junto do bloco; montagem lê dezenas de linhas em vez de varrer o tipo; 5/5 contratos verdes e 1060 testes passando | Emenda dos contratos C1/C2 (R-012); 2 testes de outras features atualizados por mudança deliberada |
| 2026-10-20 | Fase 4 (US2, T030–T036) | Slots de serviço externo deixam de segurar a revelação; índice de nomes do Top 10/Dica saiu da montagem para consulta própria e entrou no limite de remontagem do prefetch | T031 parcial: o casamento ainda roda na tela, não em segundo plano |
| 2026-10-20 | Fases 5 e 6 (US3/US4) | Renderização: nenhuma mudança — a medição mostrou 1 ms de desenho com cache (R-006 descartado). Capas da primeira tela ganham `fetchPriority: 'high'`; virtualização e lazy preservados | O custo que sobra é de navegação (39 fps na linha de base), a comparar na validação |
| 2026-10-20 | Fase 7 (T060, T062, T063) | Gates completos verdes: 3682 testes, 54/54 E2E, `tsc`, lint e build; regra permanente no `CLAUDE.md` | **T061 (validação na TV) pendente** — o usuário optou por não instalar agora (R-007) |

| 2026-10-20 | Fase 7 (T061) | **Validação na TV feita e o gate NÃO passou** (`evidencias/validacao-tv-2026-10-20.md`). O que a feature prometeu, entregou: `addedMs`/`ratedMs` = **0 ms**. Mas SC-001/002/003 falharam, porque sobraram duas coisas: a trilha de categorias (`categoriesMs` 854–991 ms, = `revealMs`) e a contenção com a carga (Home: leitura de dezenas de linhas esperando **1 986 ms**). E a carga regrediu: séries 3,2 s → **26,6 s** | R-014 (regressão da carga) e R-015 (contenção) abertos; desenho da saída em `logic/documento-de-tela.md` |

| 2026-10-20 | Fase 8 (T064–T068, T076, T077) | P0 fechado: os candidatos saem da codificação que já acontecia e a carga por seção grava **uma vez** (`writeCandidatesBatch`), o `PreparedBlock` não retém mais o bloco e nada é calculado para `channel`, e o backfill se cala durante a carga (`loadActivity.ts`) com teto de 400 ms. **T064/T065 eram falso positivo da convergência**: FR-010 e FR-011 já estavam garantidos por `deleteCategoryItems`, agora travados por teste | T069/T070 dependem da TV; T071–T075 (documento de tela) não começaram |

| 2026-10-21 | Fase 8 (T069, T070, T079, T080) | Carga na TV em 3 sessões: séries 3,1–3,5 s (era 26,6), leituras de categoria 0,1–1,1 s (eram 8,5–10,6), Filmes/Séries abrindo em ~0,33 s e capas já prontas na revelação (5 de 13). Sonda em 2 rodadas decidiu P2 = **`localStorage`** e **refutou o banco separado** (p95 223 ms); a trilha de categorias custa ~26 ms, não ~900 (R-009 reinterpretado) | **Duas explicações minhas para o `encodeMs` de filmes estavam erradas**: o número depende de haver regravação, e as sessões comparadas diferiam nisso (adendo §4). SC-001 ainda não atingido (Início ~2,1 s) |

| 2026-10-21 | Fase 8 (T071, T072, T078) | Documento de tela em `localStorage`: `screenDocumentStore.ts` (o meio) + `screenDocument.ts` (a montagem), lido numa leitura síncrona com validação de geração, dia e visibilidade; refeito no fim da carga por seção e na fila do prefetch, **nunca** na abertura. `loadShowcaseSelections` saiu de `catalogApi.ts`, que ficou menor que antes (2 160 < 2 182 linhas) | Dois testes de outras features pegaram um **defeito real**: sem invalidar o documento ao gravar candidatos, a fileira não acompanharia a pré-carga (FR-008). Corrigido e travado por teste |

| 2026-10-21 | Fase 8 (T073) | A carga por seção só começa depois da 1ª revelação da sessão, com teto de 2,5 s (`lib/assembly/firstReveal.ts`). A espera ficou em `sectionRunner.ts`, em quem decide o momento, não dentro de `loadSection` — que roda no Worker e é chamado direto por testes. Gate completo: 3694 testes e **54/54 E2E** | T074/T075 e a validação final na TV |

**PRÓXIMO**: **validação na TV** (SC-001 a SC-012) — é o que falta para saber se o Início sai dos ~2,1 s, agora que a
carga não compete com o primeiro desenho e a abertura lê um registro do `localStorage`. T074/T075 (troca atômica e
casamento externo em 2º plano) podem vir antes ou depois, mas **não** mudam os números de abertura. Reinstalar o pacote
normal ao fim.

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
