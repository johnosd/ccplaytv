# Implementation Plan: Busca Local em Live TV, Filmes e Séries

**Slug**: `017-busca-local-catalogo` | **Date**: 2026-09-25 | **Spec**: `sdd/specs/017-busca-local-catalogo/spec.md`

## Summary

Uma entrada "🔍 Buscar" no topo da trilha de cada seção abre um campo
digitado com o teclado do sistema da TV; a busca filtra, em memória, os
itens do tipo da seção já gravados no aparelho (nunca rede), a partir de 3
caracteres, sem acento nem caixa, com quem começa pelo termo primeiro, e
avisa "busca em X de Y categorias" quando a cobertura é parcial. Os
resultados reusam a mesma lista/grade da seção (foco, favoritar, abrir).
Voltar do detalhe de Filmes/Séries passa a restaurar a tela de origem —
busca **e** grade — por um snapshot guardado no histórico de navegação do
`App.tsx`, fechando junto o bug de backlog "Voltar do detalhe pra grade não
restaura foco nem posição" (decisão do usuário). Contrato de "como" em
`logic/busca-local.md`; definição de pronto nos 5 testes de contrato
travados.

## Technical Context

**Language/Version**: TypeScript 5 / React 19, Vite (target `chrome108`).

**Primary Dependencies**: `@tanstack/react-query` v5, `@tanstack/react-virtual`
(lista/grade já virtualizadas, feature 009), Dexie (IndexedDB). Nenhuma
dependência nova.

**Storage**: IndexedDB via Dexie — só leitura. Sem versão nova do schema: a
busca varre a faixa `[sourceId+generation+kind+groupOrder]` (índice já
existente desde a v3) e filtra em memória; não há índice por nome, e não é
preciso criar um (ver R-001).

**Testing**: Vitest + Testing Library + `fake-indexeddb`; Playwright E2E
(`tv-web/e2e/*.mjs`, fixture HTTP local).

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 8.0 / Chromium 108).

**Performance Goals**: SC-002 — resultados sem atraso perceptível após a
pausa de ~300 ms. O índice é lido **uma vez** ao abrir a busca; cada termo
é um filtro síncrono em memória.

**Constraints**: `useRemoteNav` (ADR-009) intercepta Backspace/espaço/Enter/
setas no `document` — precisa de guarda para alvo editável (D-005). O
teclado do sistema abre por foco DOM real + Enter nativo no `<input>`
(mesmo mecanismo de `AddSourceScreen`). `App.tsx` desmonta a tela de
categoria ao abrir o detalhe (D-006).

**Scale/Scope**: seção com até dezenas de milhares de itens gravados
(provedor: só categorias abertas; M3U `stored`: só as abertas; `eager`
legado: tudo).

## Decisões Invariantes

- **D-001**: A busca nunca toca rede nem obtém categoria não aberta
  (FR-009). Lê só `channels` (tipo da seção, geração ativa) e
  `categories`.
- **D-002**: Índice em memória, lido uma vez por entrada na busca
  (`refetchOnMount: 'always'`); filtro síncrono por termo. Isso torna
  FR-008/SC-004 verdadeiros por construção — não existe resposta
  assíncrona por termo que chegue fora de ordem. Sem schema novo.
- **D-003**: Categoria coberta = `fetchMode === 'eager' ||
  itemsFetchedAt !== undefined`. **`stored` nunca aberta conta como não
  coberta** — resolve a premissa aberta da spec: o conteúdo guardado
  (feature 014) não tem registro em `channels` (logo nem id para
  tocar/abrir) até a categoria ser aberta, e é apagado de `storedEntries`
  nesse momento. É exatamente o fallback que a spec já previa (Assumptions).
- **D-004**: Normalização única (`normalizeForSearch`: NFD + remove
  `̀-ͯ` + minúsculas + trim + espaços colapsados), aplicada ao
  nome e ao termo. Ordem: começa-com primeiro, depois contém, cada grupo
  por nome normalizado.
- **D-005**: `useRemoteNav` ganha uma guarda: com alvo editável (`input`,
  `textarea`, `contenteditable`), Backspace, espaço, Enter, ← e → ficam com
  o campo (sem `preventDefault`, sem handler). RETURN (10009/Escape/
  XF86Back) e ↑/↓ continuam com a tela. Nenhuma tela atual tem campo sob
  `useRemoteNav`, então nada existente muda. Nota inline na ADR-009.
- **D-006**: Restauração ao voltar do detalhe por **snapshot opaco no
  histórico** do `App.tsx` (`CategoryScreenSnapshot`: trailKey, entered,
  col, focusedItemId, searchTerm) — não por manter telas montadas. Vale
  para busca **e** grade de Filmes/Séries. Reconciliação por identidade,
  rolagem pelo `useVirtualFocusSync` existente.
- **D-007**: Os resultados reusam a lista/grade da seção (mesmo
  virtualizador, foco por id, favoritar, abrir) — `entered.kind ===
  'search'` só troca a fonte dos itens. Nada de grade duplicada.
- **D-008**: Confirmar a busca (FR-016) = tecla "Done" do teclado Samsung
  (keyCode 65376) ou ↓ a partir do campo. Enter no campo é da plataforma
  (abre o teclado) — nunca interceptado.
- **D-009**: "🔍 Buscar" não aparece na trilha do zapping (feature 016) —
  decisão do usuário. Emenda a FR-004 da 016 com nota inline.
- **D-010**: O termo nunca é persistido, logado nem enviado (FR-021) —
  fica em estado React e, no máximo, no snapshot em memória do histórico.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Busca 100% local, sem conta nem OpenAI (RF-012) |
| Segredos Fora dos Clientes e dos Logs | OK | OK | Termo não é logado/persistido (D-010); a busca não lê URL/credencial |
| Categorias da Fonte São Preservadas | OK | OK | Rótulo de categoria mostrado é o da fonte (`groupLabel`) |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede/Backend/IA | OK | OK | Nada da busca espera rede (D-001) |
| Trailers e Metadados Não Alteram Estado | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | OK | OK | Entrar, digitar (teclado do sistema), confirmar (Done/↓), abrir, sair (RETURN) — tudo no controle |
| Uma Lista de Catálogo Nunca é Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | Atenção | OK | Estado vazio tem botão focável ativável por SELECT (FR-015); campo com foco DOM visível; guarda de teclado (D-005) evita RETURN/Backspace ambíguos |
| Voltar Restaura Foco e Posição | **Violação pré-existente** | OK | Filmes/Séries hoje perdem o estado ao voltar do detalhe (bug de backlog). Resolvido junto por D-006, por decisão do usuário |
| Identidade de Reprodução Não Depende da URL | OK | OK | Resultados são os mesmos registros; foco e snapshot por id |
| Progresso e Capacidades São Reais | OK | OK | "Busca em X de Y categorias" nunca apresenta catálogo parcial como completo (FR-014, D-003) |
| Documentação do Repositório É Canônica | OK | OK | Nota inline na ADR-009 e na spec 016; backlog e CLAUDE.md no Polish |

Nenhuma violação não justificável — `Complexity Tracking` vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/017-busca-local-catalogo/
├── spec.md
├── plan.md                 # este arquivo
├── logic/
│   └── busca-local.md      # contrato do "como"
├── quickstart.md           # verificação manual (TV física)
├── contract-tests.lock     # trava dos 5 testes de contrato
└── tasks.md
```

Sem `research.md` (sem incerteza técnica que leitura de código não
resolveu — a de hardware, tecla Done/abertura do teclado, vai para
quickstart e R-003), sem `data-model.md` (nenhuma entidade nova), sem
`contracts/` (nenhuma API).

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── App.tsx                                   # snapshot no histórico (D-006)
│   ├── lib/
│   │   ├── useRemoteNav.ts                        # guarda de alvo editável (D-005)
│   │   ├── useDebouncedValue.ts                   # novo
│   │   └── catalog/
│   │       ├── catalogSearch.ts                   # STUB → implementar (D-002..D-004)
│   │       └── catalogRepository.ts               # leitura por faixa de tipo, exposta
│   ├── features/
│   │   ├── catalog/
│   │   │   ├── catalogApi.ts                      # useCatalogSearch (STUB)
│   │   │   └── categoryScreenSnapshot.ts          # tipo do snapshot (pronto)
│   │   ├── live/LiveScreen.tsx                    # entrada + modo busca; sem busca no zapping
│   │   ├── movies/MoviesScreen.tsx                # entrada + modo busca + restore
│   │   ├── series/SeriesScreen.tsx                # idem
│   │   └── screens.css                            # .search-field / status / .live-item-search / .live-item-group
│   └── (testes de contrato travados — ver Estratégia de Testes)
└── e2e/busca-local.mjs                            # novo
```

**Structure Decision**: projeto único `tv-web/`; só os arquivos acima.
`api/` e `CCPlayTv/` não são tocados.

## Complexity Tracking

*(vazio — nenhuma violação a justificar; a violação pré-existente de "Voltar
Restaura Foco e Posição" é **corrigida** por esta feature, não introduzida)*

## Estratégia de Testes

Prioridade: contrato (travado) → unitário complementar → E2E → manual (TV).

Comandos-base (em `tv-web/`):

```powershell
npx vitest run <arquivo>          # o mais estreito primeiro
npm run test
npm run lint
npm run build
npm run test:e2e                  # com npm run dev rodando
```

Suítes `*.favorites.test.tsx` têm flakiness de timing conhecida sob
paralelismo (gesto de 800 ms em tempo real) — confirmar isolado com
`--no-file-parallelism` antes de concluir regressão.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/catalog/catalogSearch.contract.test.ts`,
`tv-web/src/lib/useRemoteNav.busca.contract.test.tsx`,
`tv-web/src/features/movies/MoviesScreen.busca.contract.test.tsx`,
`tv-web/src/features/live/LiveScreen.busca.contract.test.tsx`

Comando (em `tv-web/`):
`npx vitest run src/lib/catalog/catalogSearch.contract.test.ts src/lib/useRemoteNav.busca.contract.test.tsx src/features/movies/MoviesScreen.busca.contract.test.tsx src/features/live/LiveScreen.busca.contract.test.tsx`

| Teste | Origem | Fase | Vermelho confirmado (antes do execute) |
| --- | --- | --- | --- |
| encontra por "contém" sem acento nem caixa, a partir de 3 caracteres… | FR-005, FR-007, FR-010 | Fase 2 | `Error: not implemented` |
| lê só o tipo pedido da geração ativa e conta cobertura… | FR-002, FR-009, FR-014, D-003 | Fase 2 | `Error: not implemented` |
| deixa Backspace, espaço, Enter e setas laterais para o campo… | FR-003, FR-020, D-005 | Fase 2 | `AssertionError: tecla "Backspace" não deveria ser consumida` |
| "🔍 Buscar" abre um campo vazio com foco; os resultados trazem a categoria, a contagem e a cobertura parcial | FR-001/003/004/011/013/014 (US1-AC1/2, US2-AC1) | Fase 3 | `AssertionError: expected '★Favoritos' to contain 'Buscar'` |
| abrir um resultado entrega um snapshot que… restaura termo, resultados e foco | FR-001/017/019 + Constitution: Voltar Restaura Foco e Posição | Fase 4 | `AssertionError: expected null not to be null` |

Stubs criados pelo plan (ponto de partida, não travados):
`tv-web/src/lib/catalog/catalogSearch.ts`,
`tv-web/src/features/catalog/categoryScreenSnapshot.ts`,
`useCatalogSearch` em `tv-web/src/features/catalog/catalogApi.ts`,
props `restore`/`snapshot` em `MoviesScreen.tsx`/`SeriesScreen.tsx`.

Fora do contrato por orçamento (cobertos por testes adicionais das fases):
Séries (espelho de Filmes), zapping sem busca (D-009), estado vazio
focável (FR-015), Done/↓ (FR-016), RETURN resultado→campo→trilha (FR-020),
favoritar num resultado (FR-018), grade normal restaurada ao voltar do
detalhe. Só em hardware real (quickstart): abertura do teclado do sistema,
tecla Done, SC-002 na TV.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup | Fase 1 concluída — baseline confirmado (build limpo, só os 5 contratos vermelhos) |
| Foundational | Fase 2 concluída — `catalogSearch.ts`, `useCatalogSearch`, `useDebouncedValue`, guarda de campo editável em `useRemoteNav` |
| US1 — Live TV | Fase 3 concluída — "🔍 Buscar" na trilha, modo busca reusando a mesma lista/foco/favoritar, cobertura parcial, zapping sem busca |
| US1 — Filmes/Séries + restore | Fase 4 concluída — busca espelhada em `MoviesScreen.tsx`/`SeriesScreen.tsx` (D-007); `CategoryScreenSnapshot` capturado em `onOpenMovie`/`onOpenSeries` e restaurado via `restore`; `App.tsx` grava o snapshot na entrada de histórico da tela de origem (T021); fecha o bug de backlog "Voltar do detalhe pra grade não restaura foco nem posição" |
| US2 — Cobertura e estado vazio | Fase 5 concluída — estado vazio e aviso de cobertura (`covered < total`) corretos nas três telas; regra de cobertura (`isCovered`) testada isolada contra banco real; ver R-005 para o conflito FR-015/T026 resolvido com o usuário |
| Polish | Fase 6 concluída — E2E novo (`busca-local.mjs`), notas de ADR-009/spec 016/backlog, gates rodados. Ver R-006: usuário pediu um redesenho da UX de entrada/escopo da busca durante esta fase; feature fecha `Implementada` no design atual (entrada única na trilha, busca por tipo inteiro) por decisão explícita do usuário — o redesenho é trabalho novo, não uma continuação desta feature |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Seção com muitos itens gravados (fonte `eager` legada, dezenas de milhares) deixa a leitura do índice lenta ao abrir a busca | Médio — só a abertura, não cada tecla (D-002) | Medir na TV (quickstart); se preciso, índice com só `id`/nome e leitura em blocos — sem schema novo |
| R-002 | Tocar um canal pela busca e abrir o zapping reancora a trilha na categoria do canal (016 D-006); fechar o player cai na categoria, não na busca | Baixo — mesmo comportamento aceito da 016 (R-001 de lá) | Aceito; documentado para não ser confundido com regressão de FR-019 |
| R-003 | Teclado do sistema sob uma tela `useRemoteNav`: abertura por Enter nativo e a tecla Done (65376) só são verificáveis na TV física | Alto se falhar — sem digitação não há busca | Quickstart cenários A–C obrigatórios na TV; fallback: ↓ confirma sempre |
| R-004 | Mudar a trilha (nova entrada no topo) quebra asserções de testes existentes que listam a trilha exata ou contam setas a partir de "Favoritos" | Baixo — mudança de spec legítima (FR-001) | Resolvido: T014 (Live TV, Fase 3) e T022 (Filmes/Séries, Fase 4) atualizaram todas as suítes afetadas — composição esperada mudou, a força da asserção não |
| R-005 | Conflito entre FR-015/T026 (estado vazio pede um botão "Voltar ao campo" acionável por SELECT) e o achado de design das Fases 3/4: o campo de busca mantém foco DOM real nesse estado — único elemento realmente focado — e SELECT nele é passthrough do editable-guard (não aciona nada); um botão extra criaria dois elementos com aparência de foco ao mesmo tempo | Baixo — decisão de UX, não de dados/segurança | Resolvido: usuário confirmou explicitamente (2026-09-25) manter sem o botão nas três telas; FR-015 (`spec.md`) e T026 (`tasks.md`) emendados com nota inline em vez de reescritos |
| R-006 | Durante a Fase 6, o usuário pediu um redesenho real da UX de busca: escopo por categoria (não mais por tipo inteiro), uma categoria virtual "Todos" para buscar em tudo, e o ponto de entrada virando um ícone dentro da categoria em vez de um item fixo no topo da trilha — contradiz D-001 e FR-001 desta spec | Alto — muda a superfície pública da feature já implementada e testada (5 contratos, E2E, ADR-009 emendado) | Resolvido: perguntado ao usuário via AskUserQuestion se deveria reabrir a 017 agora ou convergir como está; resposta explícita: converge no design atual sem investir mais esforço, redesenho vira trabalho novo depois. Feature fecha `Implementada` com o design "busca por tipo, entrada única na trilha" — não descrever o redesenho como entregue em nenhum artefato desta feature. **Atualização (feature 018, 2026-09-25):** o redesenho previsto aqui foi especificado, planejado e implementado como `018-busca-por-categoria` (Fase 5/Polish concluída) — substitui em produção o design descrito nesta spec/plano. ADR-009 não precisou de emenda nova: a guarda de alvo editável (D-008 da 018) só mudou de onde na árvore de estados é usada, não de comportamento |
| R-007 | `npm run test:e2e` completo não está limpo nesta máquina Windows | Baixo — pré-existente, sem relação com a 017 | Aceito, sem correção nesta feature: `e2e.mjs` falha por um seletor desatualizado; `e2e/favoritos.mjs` e `e2e/zapping-live-tv.mjs` apontam para um caminho fixo de Chromium só válido no sandbox Linux original, sem fallback (diferente de `capa-real.mjs`/`m3u-sob-demanda.mjs`/`busca-local.mjs`, que já têm `launchBrowser()` com fallback). Corrigir os scripts antigos é trabalho de outra sessão, não desta feature |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-25 | Fase 1 (Setup) | Baseline confirmado: `npm run build` limpo, `npx vitest run src/features src/lib` → 620/625 (só os 5 contratos vermelhos, pelo motivo esperado), trava íntegra. | Nenhuma |
| 2026-09-25 | Fase 2 (Foundational) | Índice de busca (`listAllOfKind` em `catalogRepository.ts`; `normalizeForSearch`/`buildSearchIndex`/`searchIndex`/`loadSearchIndex` em `catalogSearch.ts`), `useCatalogSearch` (React Query, `refetchOnMount: 'always'`), `useDebouncedValue`, e guarda de alvo editável no `useRemoteNav` (Backspace/espaço/Enter/←/→ ficam com o campo). 3/3 contratos da fase verdes; suíte da área sem regressão (flakiness pré-existente de `*.favorites.test.tsx` confirmada isolada). | Nenhuma |

| 2026-09-25 | Fase 3 (US1 — Live TV) | `LiveScreen.tsx`: trilha genérica (iteração sobre `trail`, não mais botões fixos), modo busca reusando `items`/`channelIdx`/`activeChannel`/virtualizador/favoritar sem duplicar a grade (D-007). Tabela de foco completa (↓/Done→1º resultado, ↑ na 1ª linha→campo, RETURN resultado→campo→trilha→onBack). Achado durante T011/T012: um botão "Voltar ao campo" no estado vazio seria redundante com o campo (que já mantém foco DOM real ali) — removido, simplificado para só a mensagem. | Nenhuma |
| 2026-09-25 | Fase 4 (US1 — Filmes/Séries + restore) | `MoviesScreen.tsx`/`SeriesScreen.tsx` espelharam a Fase 3 integralmente (busca reusando a grade de pôsteres, D-007), mais o mecanismo de snapshot (`CategoryScreenSnapshot`): `onOpenMovie`/`onOpenSeries` agora entregam `(id, snapshot)`, e `restore?` inicializa todo o estado relevante (`col`, `trailKey`, `entered`, `focusedItemId`, `searchTerm`) ao remontar. `App.tsx` (T021) grava o snapshot na entrada de histórico da tela `movies`/`series` de origem no momento do `goto` para o detalhe — sem generalizar a assinatura de `goto`, cada case (`movies`/`series`) monta a entrada de histórico inline. Mesmo achado de UX da Fase 3 (sem botão "Voltar ao campo" redundante) replicado aqui. T022 corrigiu as 4 suítes de trilha pré-existentes; T023–T025 (testes não-travados) cobriram o ciclo busca→snapshot→restore em Séries, a grade normal com restore + reconciliação por id de categoria sumida, e o roteamento em `App.test.tsx` (novo arquivo). | Nenhuma |

| 2026-09-25 | Fase 5 (US2 — cobertura e estado vazio) | T026/T027 já estavam implementados desde as Fases 3/4 (só confirmados e marcados), exceto o conflito FR-015/T026 sobre o botão "Voltar ao campo" — resolvido com o usuário (R-005), mantendo a decisão sem botão das Fases 3/4. T028: novo `catalogSearch.test.ts` testa `isCovered`/`loadSearchIndex` direto (nenhuma categoria aberta, `eager` sem carimbo, carimbo vencido >24h — os três continuam cobertos ou não exatamente como D-003 define). T029: preencheu a lacuna real de Filmes (nenhum teste de busca vazia/cobertura existia lá ainda) e completou Live TV com "cobertura total → sem aviso" (só "cobertura parcial" e "sem resultado" existiam). | Nenhuma |
| 2026-09-25 | Fase 6 (Polish) | Novo `busca-local.mjs` (E2E): buscar canal e tocar, buscar filme com abrir/voltar restaurando termo e foco, aviso de cobertura parcial, RETURN em camadas — 17/17 verificações, 2/2 execuções estáveis. Achado de ambiente (não é bug do app, documentado em Cuidados para Retomada): `page.route()` registrado antes do primeiro `goto`, ou ainda ativo num `goto` de página inteira posterior, trava a navegação do Playwright indefinidamente nesta máquina Windows — mitigado registrando as rotas só depois da 1ª navegação e dando `unroute` antes de qualquer `goto` de página inteira seguinte. ADR-009 e `sdd/specs/016-zapping-live-tv/spec.md` emendados (notas inline, T031/T032); backlog atualizado (bug de restore fechado removido da lista, item 8 atualizado, T033). `npm run test`/`lint`/`build` limpos; `test:e2e` completo não está limpo nesta máquina por 3 scripts pré-existentes sem relação com esta feature (R-007). **Durante esta fase, o usuário pediu um redesenho real da busca** (escopo por categoria + "Todos" + ícone de entrada) — ver R-006: decisão explícita foi fechar a 017 no design atual, sem investir mais esforço nela, e tratar o redesenho como trabalho novo. | R-001/R-003 (medição de performance e verificação do teclado do sistema) seguem sem evidência de TV física — não é gate obrigatório para esta feature (mesma política de outras features recentes), mas fica registrado em aberto |

**PRÓXIMO**: Feature `Implementada` no design atual (entrada única "🔍 Buscar" no topo da trilha, busca por tipo inteiro). O redesenho pedido pelo usuário em 2026-09-25 (escopo por categoria, categoria virtual "Todos", entrada como ícone — ver R-006) é trabalho novo: outra sessão precisa decidir o caminho formal (`sdd-adr` para a decisão de design, ou direto `sdd-specify`/emenda de spec) antes de tocar o código desta feature de novo. O gate de TV física (`quickstart.md` A–G, R-001/R-003) segue em aberto, não bloqueante.

## Arquivos Principais

- `tv-web/src/lib/catalog/catalogSearch.ts`
- `tv-web/src/lib/catalog/catalogRepository.ts`
- `tv-web/src/lib/useDebouncedValue.ts`
- `tv-web/src/lib/useRemoteNav.ts`
- `tv-web/src/features/catalog/catalogApi.ts`
- `tv-web/src/features/catalog/categoryScreenSnapshot.ts`
- `tv-web/src/features/live/LiveScreen.tsx`
- `tv-web/src/features/movies/MoviesScreen.tsx`
- `tv-web/src/features/series/SeriesScreen.tsx`
- `tv-web/src/App.tsx`
- `tv-web/src/features/screens.css`

## Cuidados para Retomada

- `MoviesScreen.tsx`/`SeriesScreen.tsx`/`LiveScreen.tsx` compartilham o mesmo padrão de trilha genérica e modo busca — ao mexer num, espelhar no(s) outro(s) (D-007); os testes `*.busca.contract.test.tsx` de Live/Filmes são a referência mais confiável do comportamento esperado.
- `App.tsx` não generaliza `goto()` para aceitar um patch da tela atual — cada case que abre um detalhe com snapshot monta a entrada de histórico inline (`{ ...screen, restore: snapshot }`), porque `Partial<Screen>` não distribui sobre a união discriminada. Replicar esse padrão, não tentar um `goto` genérico com patch.
- Achado da Fase 6 (T030, ambiente Windows local, não é bug do app): neste ambiente, `page.route(...)` registrado **antes** do primeiro `page.goto()` de um script Playwright prende essa navegação indefinidamente (nunca resolve, mesmo com timeout alto); e uma rota ainda registrada também prende qualquer `page.goto()` **subsequente** de navegação de página inteira. Mitigação usada em `busca-local.mjs`: registrar as rotas só depois da primeira navegação bem-sucedida, e `page.unroute(...)` antes de qualquer `goto` de página inteira posterior. Os demais scripts de `e2e/` que usam `page.route` antes do primeiro `goto` (`zapping-live-tv.mjs`, `m3u-sob-demanda.mjs`) não foram alterados — não reproduzido neles nesta sessão, e mexer neles está fora do escopo desta feature.
