# Implementation Plan: Gestão de categorias e controle parental

**Slug**: `066-categorias-controle-parental` | **Data**: 2026-10-09 | **Spec**: [spec.md](./spec.md)

## Summary

A pessoa esconde categorias (somem de todo o app) e bloqueia categorias com um PIN único de 4 dígitos
(cadeado na trilha, itens fora de qualquer outra superfície até o PIN certo, desbloqueio por sessão).
Ao ligar o controle parental, categorias de nome adulto vêm sugeridas; depois, categoria adulta nova já
chega bloqueada. O PIN também protege a gestão e adicionar/editar/remover listas, e pode ser recuperado
com os dados de uma lista cadastrada, conferidos só no aparelho.

Abordagem: um módulo novo `lib/catalog/categoryAccess.ts` calcula, na leitura, o estado efetivo de cada
categoria (preferência salva + PIN + sessão + regra do nome adulto) e os leitores de `lib/catalog`
deixam de fora o que está excluído. As telas recebem `locked` nas categorias e um estado de conteúdo
"bloqueada" com o `PinPrompt`. Persistência em duas tabelas Dexie novas (v20). Nenhuma rede.

## Technical Context

**Language/Version**: TypeScript ~5.9, React 19, Vite 8 (`tv-web/`), build `chrome108`.
**Primary Dependencies**: Dexie 4 (IndexedDB), @tanstack/react-query, @tanstack/react-virtual; navegação própria `useRemoteNav` (ADR-009). Nenhuma dependência nova.
**Storage**: IndexedDB via `CatalogDb` — v20 com `categoryPreferences` e `parentalPin` (`data-model.md`).
**Testing**: Vitest (projetos `dom` para `*.test.tsx` e `node` para `*.test.ts`; `fake-indexeddb`), Playwright E2E (`tv-web/e2e/*.mjs`, runner `e2e/run.mjs`).
**Target Platform**: Samsung Tizen 9 / Chromium 120, origem `file://`; desenvolvimento em Chromium desktop.
**Project Type**: app web de TV client-first (ADR-008); `api/` congelado, fora desta feature.
**Performance Goals**: o filtro não pode pesar na abertura das telas: `getCategoryAccess` lê preferências (dezenas de linhas) e as categorias da geração ativa (centenas) uma vez por leitura agregada; meta: < 10 ms por chamada no navegador com a lista real (medir no quickstart).
**Constraints**: teto de linhas da catraca (`scripts/architecture-baseline.json`) — `catalogApi.ts` 2190/2190, `App.tsx` 624/625, `AddSourceScreen.tsx` 421/421, `ProfilesScreen.tsx` 421/421, `LiveScreen.tsx` 349/349, `liveColumns.tsx` 511/511, `VodCategoryScreen.tsx` 950/950; import feature→feature proibido (UI compartilhada vai em `components/`, lógica em `lib/`). Segredo (PIN, credenciais) nunca em log/tela/erro.
**Scale/Scope**: listas reais com ~100–300 categorias e ~300 mil entradas; 1 PIN por aparelho; preferências por lista.

## Decisões Invariantes

- **D-001 — Estado calculado na leitura.** Escondida/bloqueada é derivado de preferência + PIN + sessão + nome (`logic/acesso-categorias.md` §1). A importação e a atualização da lista **não** gravam nada desta feature; "categoria adulta nova chega bloqueada" sai da regra.
- **D-002 — Identidade da categoria = `categoryMatchKey`** de `structureDiff.ts` (`p:<id do provedor>` / `n:<nome>`), por lista e seção. Nunca o id local.
- **D-003 — Filtrar nos leitores de `lib/catalog`, depois dos memos.** Caches de `lib` guardam dado bruto; nenhum dado filtrado é memorizado. Leitores e exceções na tabela do `logic/acesso-categorias.md` §3.
- **D-004 — Sessão só em memória**, por lista; rebloqueia ao ir para segundo plano, ao mudar a lista ativa e ao desligar o controle.
- **D-005 — Mudança de acesso = `resetQueries`** das consultas de catálogo (não `invalidate`), para nada bloqueado continuar na tela durante a releitura.
- **D-006 — PIN como SHA-256 com sal**, `crypto.subtle` com fallback JS puro; nunca em texto, log ou atributo (`logic/pin.md` §1).
- **D-007 — Ligar o controle é atômico** (`enableParentalControl` grava PIN + decisões juntos); cancelar não grava nada.
- **D-008 — Proteção de telas sem tocar nos arquivos no teto**: adicionar/editar lista por `withParentalGate` em `navigation/routeModules.ts`; remover por `DeleteSourceModal`; categoria bloqueada por um estado de conteúdo compartilhado (`components/LockedCategoryState.tsx`).
- **D-009 — Recuperação só local**: igualdade com usuário+senha (Xtream) ou endereço (M3U) guardados; resposta só `boolean`.
- **D-010 — Sem limite de tentativas** de PIN (decisão do usuário).
- **D-011 — Nomes e ordem das categorias nunca mudam**; a gestão mostra a ordem da lista.
- **D-013 — Bloqueadas no fim da trilha** (emenda ao FR-033, pedido do usuário em 2026-10-09). `listVisibleCategories` devolve primeiro as não bloqueadas e depois as bloqueadas pelo bloqueio **salvo** (não o efetivo da sessão — a trilha não pula de lugar ao desbloquear), cada grupo na ordem da lista. Sem PIN não há bloqueada, e a ordem é a da lista. `listManagedCategories` (gestão) segue a ordem da lista. O número do canal não muda porque `channelNumberOf` compara `order`, não a posição na trilha.
- **D-014 — Adulto fora do histórico (FR-035).** Regra de leitura, como a D-001: `getAdultScope(sourceId)` (`categoryAccess.ts`) diz o que é adulto — categoria de nome adulto, categoria com bloqueio salvo pela pessoa (independe da sessão) e registro com `adult: true` (lido de `is_adult` do painel). `history.ts` e `continueWatching.ts` descartam esses registros depois de resolver, sem contar como não resolvidos. Nada deixa de ser gravado. Episódio vale pela série. `adult` entra no `CatalogRecord` por augmentation (o `db.ts` está no teto e com alterações de outra sessão).
- **D-012 — Número do canal não muda ao esconder** (ADR-011 §6). `channelNumberOf` (`features/live/channelNumber.ts`) soma as contagens das categorias anteriores da lista que recebe; com a trilha filtrada, isso renumeraria. `listVisibleCategories` expõe em cada categoria `hiddenBefore` (as escondidas de `order` menor na mesma seção, com os campos que `knownCategoryCount` usa) e `channelNumberOf` as soma também.

## Constitution Check

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | PIN é local e opcional; nada de conta. Proteger "adicionar lista" só vale com PIN criado pela própria pessoa; a primeira lista nunca pede PIN. |
| Segredos Fora dos Clientes e dos Logs | Atenção | OK | PIN só como hash (D-006); recuperação compara credenciais já guardadas (exceção ADR-008/010) sem exibir, logar nem enviar (D-009); contrato `pin` verifica que o PIN não aparece em nenhuma tabela e que não há `fetch`. |
| Categorias da Fonte São Preservadas | OK | OK | Esconder/bloquear não renomeia nem reordena (D-011); a detecção usa só o nome declarado. |
| IA e Classificação Nunca Inventam Dados | Atenção | OK | "Parece adulto" é sugestão confirmada pela pessoa, por lista fixa de termos; sem termo encontrado o app diz que não achou (FR-026). |
| Comandos Locais Independem de Rede | OK | OK | Tudo local; nenhuma rede nesta feature. |
| Trailers e Metadados Não Alteram o Estado | n/a | n/a | — |
| Toda Ação Essencial por Controle Remoto | Atenção | OK | PIN por teclas numéricas **e** teclado na tela navegável por setas (FR-018); RETURN fecha cada camada. |
| Lista Nunca É Manifesto | n/a | n/a | — |
| Foco Visível e Sem Becos Sem Saída | Atenção | OK | Estados novos (gestão, PIN, bloqueada, vazio por escondidas) têm elemento focável; focar categoria bloqueada não carrega nada (FR-013); contrato `PinPrompt` cobre foco após erro. |
| Voltar Restaura Foco e Posição | Atenção | OK | `resetQueries` refaz listas; telas já reconciliam foco por id; a gestão guarda foco por id da categoria. |
| Identidade de Reprodução Não Depende da URL | OK | OK | Esconder não apaga favorito/histórico/progresso (FR-008); a resolução continua por `stableId`. |
| Progresso e Capacidades São Reais | OK | OK | Contagens da lista em Fontes continuam as declaradas (premissa); a trilha mostra só o que existe. |
| Documentação É Canônica | OK | OK | Polish atualiza `CLAUDE.md` só se surgir regra permanente; `comingSoon.ts` perde `settings-parental` na mesma feature. |

Restrição "Design system de TV": telas novas só com tokens V14 (FR-034). Fluxo "Testes E2E antes da TV": roteiro E2E novo no Polish.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/066-categorias-controle-parental/
├── spec.md
├── plan.md
├── tasks.md
├── data-model.md
├── logic/acesso-categorias.md
├── logic/pin.md
├── quickstart.md
├── handoff.md
└── contract-tests.lock
```

### Source Code (repository root)

```text
tv-web/src/
├── lib/
│   ├── catalog/
│   │   ├── categoryAccess.ts                (novo — stub do plan)
│   │   ├── dbSchema.ts                      (v20)
│   │   ├── db.ts                            (tipos/tabelas novas)
│   │   ├── catalogSearch.ts                 (listVisibleCategories)
│   │   ├── catalogDerivedRows.ts            (pular excluídas)
│   │   ├── sourceRepository.ts              (deleteSource apaga preferências)
│   │   ├── prefetch/index.ts                (pular escondidas)
│   │   └── repository/{kindReads,stableIds,series,categoryReads,categoryWindow}.ts
│   ├── parental/
│   │   ├── pin.ts                           (novo — stub do plan)
│   │   └── sha256.ts                        (novo — fallback)
│   ├── metadata/localTitleMatch.ts          (listVisibleCategories)
│   ├── tizenMediaKeys.ts                    (registerDigitKeys)
│   ├── comingSoon.ts                        (sai settings-parental)
│   └── i18n/messages/{parental.ts (novo), settings.ts, comingSoon.ts}
├── components/
│   ├── PinPrompt.tsx                        (novo — stub do plan)
│   ├── LockedCategoryState.tsx              (novo)
│   ├── ParentalGate.tsx                     (novo — withParentalGate)
│   ├── RecoverPinFlow.tsx                   (novo — Esqueci o PIN)
│   ├── SideCategoryNav.tsx                  (cadeado)
│   └── iconPaths.ts                         (ícone lock)
├── features/
│   ├── catalog/{catalogApi.ts (só troca de chamada), categoryAccessApi.ts (novo)}
│   ├── settings/tabs/{settingsTabs.ts, SimpleTabs.tsx, ParentalTab.tsx (novo)}
│   ├── settings/parental/*                  (novos: lista de categorias, ligar/desligar, sugestão)
│   ├── sources/DeleteSourceModal.tsx        (PIN antes de remover)
│   ├── live/liveColumns.tsx                 (estado bloqueada; compensar linhas)
│   └── vod/{VodShowcaseScreen.tsx, VodCategoryScreen.tsx}
├── navigation/routeModules.ts               (withParentalGate em AddSourceScreen)
├── App.tsx                                  (1 hook; compensar 1 linha)
└── styles/*.css                             (tokens V14)
tv-web/e2e/categorias-controle-parental.mjs (novo) + e2e/run.mjs
```

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Filtro repetido em ~8 leitores de `lib/catalog` em vez de um ponto único | Não existe um ponto único: as leituras agregadas consultam `categories`/`categoryBlocks` por caminhos diferentes (065 otimizou cada um) | Filtrar só em `listCategories` deixaria vazar itens pela busca, "Todos", fileiras e favoritos; filtrar só na UI exigiria crescer arquivos no teto e repetir a regra em cada tela |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (em `tv-web/`):

```bash
npx vitest run <arquivo-ou-pasta>        # durante as fases
npm run test                             # suíte completa (gate final)
npx tsc -b
npm run lint                             # oxlint + catraca de arquitetura (tetos!)
npm run build
npm run test:e2e -- --only categorias-controle-parental   # com npm run dev no ar
npm run test:e2e                         # gate final
```

Na raiz: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 066-categorias-controle-parental`.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts` (3),
`tv-web/src/lib/parental/pin.categorias-controle-parental.contract.test.ts` (1),
`tv-web/src/components/PinPrompt.categorias-controle-parental.contract.test.tsx` (1).

Comando: `npx vitest run src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts src/lib/parental/pin.categorias-controle-parental.contract.test.ts src/components/PinPrompt.categorias-controle-parental.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| escondida some das trilhas, de "Todos"/busca, das fileiras e dos favoritos; mostrar devolve tudo | US1/AC2+AC4, FR-007/FR-008 | Fase 3 | `Error: not implemented` (`setCategoryPreference`) |
| bloqueada fica na trilha com cadeado e sem itens fora dela; PIN certo libera só esta lista até rebloquear | US2/AC2+AC4, FR-013/014/015 | Fase 4 | `Error: not implemented` (`enableParentalControl`) |
| nome adulto sem decisão chega bloqueado; recusada fica livre; sem PIN nada bloqueia | US3, FR-022/024/025 | Fase 5 | `Error: not implemented` (`setCategoryPreference`) |
| PIN só como hash, errado nega, recuperação confere usuário+senha ou endereço sem rede | FR-012/016/028/029 | Fase 2 | `Error: not implemented` (`hasPin`) |
| 4 dígitos enviam; errado avisa e limpa com foco; dígitos nunca aparecem; RETURN cancela | FR-012/016/018/031; Constitution: Foco | Fase 4 | `Error: not implemented` (`PinPrompt`) |

Saída vermelha confirmada em 2026-10-09: 3 arquivos / 5 testes falhando, todos por `Error: not implemented` (o `afterEach` do contrato de acesso também lança `not implemented` em `relockSession` até a Fase 2).

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/lib/catalog/categoryAccess.ts`, `tv-web/src/lib/parental/pin.ts`, `tv-web/src/components/PinPrompt.tsx`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Setup) | Concluída |
| Fase 2 (Foundational) | Concluída — v20, `parentalTables.ts`, `pin.ts`, `sha256.ts`, núcleo de `categoryAccess.ts`, i18n, ícone; contrato PIN 1/1 verde |
| Fase 3 (US1) | Concluída — leitores filtrados (inclusive `kindCursor.ts`, R-010), trilhas/busca/vitrines com `listVisibleCategories`, número do canal estável, reset das consultas, aba real, vazio "todas escondidas"; contratos US1 e US2 verdes |
| Fase 4 (US2) | Concluída — `PinPrompt`, teclas numéricas, cadeado, estado bloqueado em Live e Filmes/Séries, gestão com bloqueio e PIN (ligar/trocar/desligar), PIN para adicionar/editar/remover lista, rebloqueio; bloqueadas no fim da trilha (D-013); contratos US1/US2/PinPrompt/PIN verdes |
| Fase 5 (US3) | Concluída — regra de nome adulto, etapa de sugestão antes do PIN; os 5 contratos verdes |
| Fase 6 (US4) | Concluída — "Esqueci o PIN" em todos os pedidos de PIN (`ParentalPinPrompt` + `RecoverPinFlow`), só local |
| Fase 7 (Polish) | Concluída — E2E da feature verde, segredos revisados, medição (R-015), gates com ressalvas fora da feature, regra no `CLAUDE.md`; regressão de desempenho na vitrine corrigida (R-016) |
| TV física | Verificada pelo usuário em 2026-10-10: teclas numéricas, ligar (PIN 2×, aviso, interruptor), cadeado no fim da trilha, PIN para entrar, rebloqueio pelo Home; `AbortError` transitório ao ligar antes de religar a TV (R-017, causa não identificada) |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Arquivos no teto da catraca (`catalogApi.ts`, `App.tsx`, `AddSourceScreen.tsx`, `ProfilesScreen.tsx`, `LiveScreen.tsx`, `liveColumns.tsx`, `VodCategoryScreen.tsx`) | Alto — `npm run lint` reprova qualquer linha a mais | Resolvido (auditoria de convergência, 2026-10-10): D-008: lógica em módulos novos; troca de chamada com o mesmo número de linhas; onde precisar de linha nova, extrair código do próprio arquivo para compensar. Subir teto só como último recurso, editando o JSON à mão com justificativa no commit e um `R-0XX` aqui. |
| R-002 | `crypto.subtle` pode não existir na origem `file://` da TV (contexto seguro não verificado) | Médio — sem hash, sem PIN | Resolvido (auditoria de convergência, 2026-10-10): D-006: fallback SHA-256 em JS puro, testado contra vetores conhecidos; registrar na passada da TV qual caminho rodou. |
| R-003 | Teclas numéricas do controle só chegam ao app se registradas no Tizen | Médio — PIN só pelo teclado na tela | Resolvido (auditoria de convergência, 2026-10-10): `registerDigitKeys()` dentro de `registerMediaKeys()`; teclado na tela é o caminho completo (FR-018). Confirmar na TV física. |
| R-004 | `resetQueries` ao rebloquear (volta do segundo plano) faz as telas montadas recarregarem | Médio — piscar de carregamento/foco | Resolvido (auditoria de convergência, 2026-10-10): Só notifica quando havia sessão desbloqueada; telas já reconciliam foco por id; E2E cobre voltar com foco válido. |
| R-005 | Algum leitor agregado esquecido deixaria vazar itens escondidos/bloqueados | Alto — quebra a promessa do controle parental | Resolvido (auditoria de convergência, 2026-10-10): Tabela do `logic/acesso-categorias.md` §3 + E2E que percorre todas as superfícies do FR-007 com uma categoria escondida e uma bloqueada (SC-001/SC-002). |
| R-006 | Falso positivo do nome adulto (ex.: "Adult Swim") chega bloqueado | Baixo | Resolvido (auditoria de convergência, 2026-10-10): Lista fixa conservadora; a pessoa libera na gestão e a recusa é lembrada (FR-024). |
| R-007 | O PIN de 4 dígitos com hash não resiste a quem lê o IndexedDB | Baixo — fora da ameaça (crianças/visitantes) | Resolvido (auditoria de convergência, 2026-10-10): Documentado em `logic/pin.md` §1 e nas Assumptions da spec. |
| R-008 | Esconder categorias de canais renumeraria os canais seguintes (`channelNumberOf` soma só as categorias que recebe) | Médio — contradiz ADR-011 §6 e o edge case da spec | Resolvido (auditoria de convergência, 2026-10-10): D-012 + teste em T018 (número igual antes e depois de esconder uma categoria anterior). |
| R-010 | `readKindCursorPage` existe em dois lugares: `lib/catalog/kindCursor.ts` (o que `catalogApi.ts` usa) e `repository/kindReads.ts` (cópia não chamada); a tabela do `logic` §3 só cita a segunda | Alto — "Todos" vazaria escondidas/bloqueadas | Resolvido: os dois filtrados (Fase 3); `categoryAccess.leitores.test.ts` cobre o de `kindCursor.ts`. A cópia sem uso fica para uma limpeza fora desta feature. |
| R-011 | FR-009 precisa abrir Configurações já na aba nova a partir de Live/Filmes/Séries, com `LiveScreen.tsx` no teto | Médio | Resolvido: `onOpenSettings(tab?: 'parental')` (mesma linha nos tipos de shell) → `restore: { zone: 'panel', tab }`; `SectionEmptyState` em `components/` e `useSectionAllHidden` em `lib/` (a catraca não deixa `vod`/`live` importarem `features/catalog`). |
| R-012 | Pedido novo no meio da Fase 4: categorias adultas "sempre no fim da lista" contradizia o FR-033 | Médio — mudança de critério de aceite | Resolvido: perguntado ao usuário (passo 13 do `sdd-execute`); escolha "só as bloqueadas" → D-013, emenda anexada ao FR-033, teste em `categoryAccess.test.ts`. |
| R-013 | Remover lista com PIN precisa saber "existe PIN?" na hora: os contratos travados da 023/026 exigem que, sem PIN, "Excluir" remova no mesmo toque (8 testes quebraram com a leitura assíncrona) | Médio | Resolvido: espelho síncrono em `localStorage` (`ccplay.parental.pinActive`, só um booleano) escrito ao ligar/desligar e realinhado por `hasPin()` (chamado ao abrir o app no `useCategoryAccessLifecycle`); só o banco padrão o escreve. Alterar o espelho só burla o PIN para quem já acessa o armazenamento — mesma fronteira do R-007. |
| R-014 | SC-004 (≤ 10 teclas do Início até esconder) não se cumpre com a gestão em Configurações: o mínimo medido no E2E foi 16 | Médio — critério de aceite | Resolvido por decisão do usuário (passo 13 do `sdd-execute`): SC-004 emendado para ≤ 16 teclas; o atalho na trilha (OK longo → "Esconder esta categoria?") foi oferecido e não adotado. O E2E mede e falha acima de 16. |
| R-015 | Medição (T036, quickstart 9) com a lista real do `.env` (104 categorias, 43.358 filmes já pré-carregados), `e2e/medicao-parental-real.mjs` | Informativo | Resolvido (auditoria de convergência, 2026-10-10): Sem preferências: `getCategoryAccess` p50 0,3 ms (máx 0,7), trilha de Filmes 0,8 ms, `listAllOfKind('movie')` 124 ms. Com 5 escondidas + controle ligado (5 bloqueadas + 5 adultas pela regra = 15 excluídas): **assentado** `getCategoryAccess` p50 1,6 ms (máx 2,2 — meta < 10 ms cumprida), trilha 0,8 ms, `listAllOfKind` 103 ms com 8.087 itens; **logo após a mudança** 30 ms (máx 50), pela disputa com o reset das 21 consultas (D-005) — transitório, só no instante da troca. Medido no navegador de desenvolvimento; a TV não foi medida. |
| R-016 | Leitores chamando `getCategoryAccess` a cada leitura faziam 2–3 leituras do IndexedDB mesmo sem preferência nem PIN; a vitrine com 302 fileiras estourou "Maximum update depth" no virtualizador (E2E `carrosseis-filmes-series`) | Alto — regressão de desempenho | Resolvido: regra salva (PIN + preferências) em memória por banco/lista, esquecida a cada `notifyCategoryAccessChanged` (toda escrita de acesso o chama); sessão lida na hora; sem regra, retorno imediato. Não é dado filtrado em cache (D-003). |
| R-017 | Passada na TV (2026-10-10, usuário): as teclas numéricas do controle chegam ao PIN (R-003 confirmado). Ao ligar o controle, depois do 2º PIN, a tela não confirmava nada e o botão seguia "Ligar" — sem console na TV, não dá para saber se falhou ao gravar ou só não avisou | Médio | Ajuste: (1) o `PinPrompt` não fica mais parado se o envio falhar — avisa "Não foi possível salvar. Tente de novo." e limpa; (2) aviso "Controle parental ligado…" ao concluir; (3) a linha de controle virou interruptor "Controle parental: Desligado/Ligado" (+ "Trocar PIN" quando ligado), pedido do usuário. Testes: `PinPrompt.erro.test.tsx`, `ParentalTab.test.tsx`, E2E da feature. Na TV: a gravação falhou com `AbortError` (transação abortada pelo IndexedDB) duas vezes seguidas; depois de a TV ser religada, ligou na primeira tentativa ("Controle parental ligado"). **Causa não identificada** — transitória; hipóteses: pressão de memória/espaço ou disputa com uma gravação longa do catálogo. O `PinPrompt` mostra a cadeia de nomes do erro (ex.: `AbortError ← QuotaExceededError`, nunca a mensagem crua) para a próxima ocorrência. |
| R-018 | Convergência (Fase 8): episódio de série bloqueada retomava depois do segundo plano (linhas de episódio não têm categoria); o guia oferecia categoria bloqueada | Alto | Resolvido: `getChannel` de episódio exige a série-pai quando há exclusões; o guia não lista bloqueadas (com `hiddenBefore`, sem renumerar). Desvio: sem cadeado/PIN dentro do guia (`EpgGuide.tsx` no teto) — a bloqueada entra pela trilha. Falha ao gravar o PIN vira `STO-01`/`PAR-01` (decisão do usuário). |
| R-019 | Emenda FR-035 (pedido do usuário, 2026-10-10): adulto nunca no ↺ Histórico/Continuar assistindo; antes, o adulto aparecia com o controle desligado e com o PIN digitado (diagnóstico com teste). A lista real não manda `is_adult` (nenhuma flag nos 55 mil itens; só o nome das categorias) | Médio | Resolvido: D-014 — `getAdultScope` + filtro na leitura do histórico, do Continuar e do destaque do Início; `is_adult` lido quando o painel mandar. A semente de "Porque você assistiu" não foi mudada (fora do FR-035). |
| R-009 | `lib/catalog/db.ts` está em 859/860 linhas (teto); declarar as tabelas novas na classe `CatalogDb` estoura | Médio — lint reprova | Resolvido (auditoria de convergência, 2026-10-10): As tabelas v20 ficam só em `dbSchema.ts`; o acesso tipado é por `database.table<CategoryPreferenceRecord>('categoryPreferences')` num módulo próprio (`lib/catalog/parentalTables.ts`), com os tipos fora de `db.ts`. |
| R-020 | **Emenda (067):** o PIN deixa de ser um por aparelho e passa a ser **um por lista** (FR-011, FR-015, FR-017, FR-019, FR-022, FR-027 desta spec), com a API `lib/parental/listPin.ts` e migração do PIN único na Dexie v21. | Contratos travados `pin.…` (1 teste) e `categoryAccess.…` (US2/US3) mudavam de critério | Resolvido: decisão do usuário (2026-10-09), aplicada na T002 da 067 com o texto de `sdd/specs/067-configuracoes-lista-global/contract-amendments/`. Trava regravada 5/5 em 2026-10-10 (R-001 da 067). |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-09 | Fase 1 / Setup | Linha de base: 5/5 contratos vermelhos por `not implemented`, tsc 0, lint ok; v20 livre; achado o teto de `db.ts` (R-009). | Fase 2 |
| 2026-10-09 | Fase 2 / Foundational | Dados v20 fora de `db.ts`, PIN com hash e reserva JS, acesso calculado na leitura, i18n e ícone; contrato PIN verde; 74 testes; `sourceRepository.ts` mantido no teto compactando comentários. | Fase 3 (US1) |
| 2026-10-10 | Fase 10 / Convergence | T047 sem código: o resumo da Privacidade já contava só o visível (falso positivo da convergência); teste de regressão. | `sdd-converge` |
| 2026-10-10 | Fase 9 / Emenda FR-035 | Adulto fora do histórico/Continuar/destaque do Início por padrão (nome adulto, `is_adult`, bloqueio salvo); `is_adult` lido do painel; 4 testes novos; E2E e áreas tocadas verdes. | `sdd-converge` |
| 2026-10-10 | Fase 8 / Convergence | T039–T043: episódios não retomam bloqueados, guia sem bloqueadas, testes de estados, E2E estendido (Favoritos, busca global, canais, número), código `PAR-01`/`STO-01` no PIN. | `sdd-converge` de novo |
| 2026-10-10 | TV física (parcial, 2) | Ligar falhou com `AbortError` 2×; com a TV religada, ligou. Causa não identificada (R-017); diagnóstico da cadeia de erro fica no `PinPrompt`. | Cadeado e rebloqueio pelo Home na TV |
| 2026-10-10 | TV física (parcial) | Teclas numéricas ok; ligar sem retorno → interruptor, aviso de sucesso e erro visível no PIN (R-017); reinstalado. | Nova tentativa de ligar na TV |
| 2026-10-10 | Fase 7 / Polish | E2E da feature, segredos, medição real, gates; regressão de desempenho na vitrine achada no E2E completo e corrigida (R-016); `CLAUDE.md` com a regra dos leitores. | TV física (recomendada) |
| 2026-10-09 | Fase 6 / US4 | `RecoverPinFlow` (Xtream/M3U, erro genérico, sem rede) e `ParentalPinPrompt` em todos os pontos; 597 testes das áreas tocadas verdes. | Fase 7 (Polish) |
| 2026-10-09 | Fase 5 / US3 | `isAdultCategoryName` (23 casos), `SuggestionStep` no fluxo de ligar; os 5 contratos verdes; `App.source-access` instável sob carga (passa isolado). | Fase 6 (US4) |
| 2026-10-09 | Fase 4 / US2 | `PinPrompt` (contrato verde), dígitos no Tizen, cadeado, `LockedCategoryState` em Live/Filmes/Séries, gestão com bloqueio e fluxos de PIN, `withParentalGate` e PIN ao remover (R-013), rebloqueio testado; pedido novo: bloqueadas no fim (D-013, R-012). | Fase 5 (US3) |
| 2026-10-09 | Fase 3 / US1 | Filtros nos leitores (achado `kindCursor.ts`, R-010), troca para `listVisibleCategories`, `hiddenBefore` no número do canal, reset de 21 chaves, aba real e vazio "todas escondidas" (R-011); desvio da fachada da Fase 2 corrigido; contratos US1/US2 verdes; T018/T019 verdes. | Fase 4 (US2) |

**PRÓXIMO**: `sdd-converge` da 066. No commit, `xtreamConnector.ts` com `git -c core.autocrlf=false add` (blob em CRLF).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/e2e/categorias-controle-parental.mjs` (novo, T034) e `tv-web/e2e/run.mjs` (`SUITE`).
- `tv-web/e2e/paridade-limpeza.mjs` — passo antigo do painel "Em breve" de Configurações.
- `sdd/specs/066-categorias-controle-parental/quickstart.md` — roteiro de navegador e medição.

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `db.ts` tem 1 linha de folga (R-009): não acrescente tabelas na classe; use `parentalTables.ts`.
- Outra sessão pode estar commitando na mesma árvore (ex.: `10762da`, Home): commitar só os arquivos desta feature.
- Remover lista decide pelo espelho síncrono `pinActiveHint()` (R-013): qualquer caminho novo que grave/apague o PIN fora de `enableParentalControl`/`disableParentalControl`/`hasPin` precisa manter o espelho.
- Rodar `update-feature-status.ps1` pelo Bash com acento mostra `Execu�ao` só no console; o arquivo fica certo.

## Resultado Final

<!-- Anexado pelo sdd-converge em 2026-10-10. -->

**Construído.** Esconder e bloquear categorias da lista ativa em Configurações › Categorias & parental (seções Canais/Filmes/Séries, Visível/Escondida e Livre/Bloqueada, foco por identidade da categoria). O estado é calculado na leitura (`lib/catalog/categoryAccess.ts`) a partir de preferências (Dexie v20, `categoryPreferences`), PIN (`parentalPin`, SHA-256 com sal e reserva em JS), sessão em memória e a regra do nome adulto; os leitores de `lib/catalog` filtram depois dos memos (trilhas, "Todos", busca local/global, fileiras, Favoritos/Histórico/Continuar, série, categoria aberta, item por id, episódio pela série-pai). PIN único (`PinPrompt` com teclas 0–9 e teclado na tela; `ParentalPinPrompt` com "Esqueci o PIN" — usuário/senha ou endereço de uma lista, só no aparelho), cadeado na trilha, estado bloqueado em Live e Filmes/Séries, PIN para entrar na aba, ligar/trocar/desligar, adicionar/editar/remover lista; rebloqueio por segundo plano e troca de lista; sugestão adulta ao ligar; vazio "todas escondidas" com atalho para a gestão.

**Desvios em relação ao plano original.**
- SC-004 emendado para ≤ 16 teclas (a gestão fica em Configurações; R-014). FR-033 emendado: bloqueadas vão para o fim da trilha (D-013, R-012).
- Leitores a mais que a tabela do `logic` §3 não listava: `lib/catalog/kindCursor.ts` (o "Todos" real, R-010) e o episódio (resolve pela série, R-018).
- Regra salva em memória por banco/lista, esquecida a cada mudança de acesso (R-016) — a releitura do IndexedDB a cada leitura derrubava a vitrine com muitas categorias.
- Espelho síncrono de "existe PIN" em `localStorage` para remover lista sem esperar o IndexedDB (contratos da 023/026; R-013).
- Guia de programação sem as categorias bloqueadas, em vez de cadeado + PIN dentro dele (`EpgGuide.tsx` no teto; R-018).
- A linha de controle virou interruptor com aviso de sucesso, e a falha ao gravar o PIN mostra código do catálogo (`STO-01`/`PAR-01`) — pedidos do usuário na TV (R-017).
- A aba nova não importa `features/catalog` (catraca): consultas próprias em `features/settings/tabs/ParentalTab.tsx`; o vazio "todas escondidas" usa `lib/catalog/useSectionAllHidden.ts` e `components/SectionEmptyState.tsx`.

**Verificação.** 5/5 contratos verdes e trava íntegra; E2E `categorias-controle-parental.mjs` (esconder, Favoritos, busca global, canais e número, sugestão, PIN, rebloqueio, recuperação sem rede, adicionar lista); medição com a lista real (R-015). TV física pelo usuário: teclas numéricas, ligar, cadeado no fim, PIN para entrar, rebloqueio pelo Home.

**Aceito em aberto.** SC-001: fileiras do Início, ↺ Histórico/Continuar assistindo e o guia cobertos por teste unitário dos mesmos leitores, sem roteiro de tela (ideia futura no backlog). R-017: causa do `AbortError` ao ligar na TV não identificada. Não vistos na TV: episódio que não retoma depois do Home e o guia sem bloqueadas.

### Emenda FR-035 — convergência de 2026-10-10

Depois da primeira convergência, o usuário pediu que conteúdo adulto nunca aparecesse no ↺ Histórico (Fases 9–10). Construído: `getAdultScope` (nome adulto ∪ `is_adult` do painel ∪ bloqueio salvo pela pessoa) filtrando o ↺ Histórico (lista, páginas e o resumo da aba Privacidade, que reaproveita `loadHistory`), o Continuar assistindo e o destaque "continuar" do Início; a reprodução continua gravada (retomada funciona) e não conta como não resolvida; o `is_adult` passou a ser lido do painel Xtream (canais, filmes, séries), embora a lista real do usuário não o mande — nela valem os nomes das 5 categorias adultas. Desvios: `adult` entrou no `CatalogRecord` por augmentation (`lib/catalog/adultFlag.ts`), sem linha nova no `db.ts`; o achado C3-01 (resumo da Privacidade) foi falso positivo. Aceito em aberto: "Porque você assistiu" ainda usa o histórico gravado como semente (fora do FR-035); com só reproduções adultas, a Privacidade mostra "nada para limpar".
