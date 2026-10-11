---
description: "Lista de tasks da feature 068 — legibilidade para TV"
---

# Tasks: Legibilidade para TV — letra maior no app e TV ao vivo em coluna única

**Input**: Documentos de design de `sdd/specs/068-legibilidade-tv/`

**Prerequisites**: plan.md, spec.md, logic/escala-e-auditoria.md, logic/live-coluna-unica.md, contract-amendments/, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2)
- Caminhos relativos à raiz do repositório

## Path Conventions

- Frontend em `tv-web/src/` (tokens em `index.css` e `styles/font-scale.css`; CSS por área em `styles/*.css`; telas em `features/<área>/`; foco/paginação em `lib/focus/`)
- E2E em `tv-web/e2e/*.mjs`, registrados no `SUITE` de `tv-web/e2e/run.mjs`
- Travas de contrato em `sdd/specs/<slug>/contract-tests.lock`; scripts em `.planning/scripts/powershell/`

---

## Phase 1: Setup — emenda do contrato da 049 e linha de base

**Purpose**: Aplicar a emenda aprovada (R-001, D-011) antes de mexer em alturas, e registrar a linha de base visual.

- [X] T001 Copiar **verbatim** `sdd/specs/068-legibilidade-tv/contract-amendments/LiveScreen.navegacao-por-pagina.contract.test.tsx` sobre `tv-web/src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx` (nenhuma outra edição)
- [X] T002 Regravar a trava da 049 com os **três** arquivos dela: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 049-navegacao-por-pagina -Write -Paths tv-web/src/lib/focus/paging.navegacao-por-pagina.contract.test.ts,tv-web/src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx,tv-web/src/features/vod/VodCategoryScreen.navegacao-por-pagina.contract.test.tsx`
- [X] T003 Anexar em `sdd/specs/049-navegacao-por-pagina/plan.md` → `## Riscos e Decisões` uma linha nova registrando a emenda (068, `PAGE` 7 → 5 por `LIVE_ITEM_ROW_HEIGHT` 108, aprovada pelo usuário na spec da 068)
- [X] T004 [P] Capturas de linha de base a 1920×1080 (Início, TV ao vivo, vitrine/grade, detalhe de filme e série, player, Configurações, perfis) em `sdd/specs/068-legibilidade-tv/evidencias/antes/` — sem lista real nem credencial na imagem

**Registro da Fase**:

- Status: concluída (2026-10-10)
- Feito: emenda da 049 aplicada verbatim e trava da 049 regravada com os 3 arquivos (5/5); R-068 anexado no `plan.md` da 049. As capturas de base saíram do próprio roteiro de auditoria (T005, adiantada): `node e2e/legibilidade-tv.mjs --langs pt --relatorio --capturas ../sdd/specs/068-legibilidade-tv/evidencias/antes` → 22 telas, 22 imagens, `evidencias/antes/auditoria.txt` com **163 achados de tamanho e 0 de texto vazando**.
- Contrato: `check-contract-tests.ps1 -Slug 068-legibilidade-tv` íntegro (4); `-Slug 049-navegacao-por-pagina` íntegro (5). O contrato emendado `LiveScreen.navegacao-por-pagina` está **2/3 vermelho de propósito** até a T010 (`LIVE_ITEM_ROW_HEIGHT` ainda 84).
- Testes executados: `npx vitest run src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx` → 2 falhas esperadas, 1 verde.
- Pendências: o guia de programação, a busca e a tela de pessoa ficam fora da auditoria automática (precisam de EPG/TMDB); o player é medido no estado de erro (a fixture não toca). Cobertos à mão no quickstart.

---

## Phase 2: User Story 1 — Letra maior no app inteiro (Priority: P1) 🎯 MVP

**Objetivo**: Todo texto do app na escala nova (mínimo 20, padrão 24, nomes 28–32, títulos 48), sem nada vazando, com nome inteiro no item focado.

**Independent Test**: `node e2e/legibilidade-tv.mjs` sem achados em pt/en/es, e as telas do quickstart conferidas no navegador.

### Contrato da Fase

- `os tokens de texto valem 64/48/32/28/24/20 px, na base e na escala efetiva` — FR-001, US1/AC1
- `nenhum font-size/font com tamanho literal abaixo de 20 px` — FR-002, SC-001
- Comando (em `tv-web/`): `npx vitest run src/styles/escala.legibilidade-tv.contract.test.ts`

### Implementation

- [X] T005 [US1] Criar a auditoria `tv-web/e2e/legibilidade-tv.mjs` (lista fictícia com nomes longos e acentuados; telas e regras de `logic/escala-e-auditoria.md` §5; pt/en/es; saída "tela: seletor: problema") e registrá-la no `SUITE` de `tv-web/e2e/run.mjs` — rodar **antes** de mudar a escala e guardar a saída como referência (SC-001, SC-002)
- [X] T006 [US1] Tokens novos em `tv-web/src/index.css` e `tv-web/src/styles/font-scale.css` (`--font-scale` continua 1) — `logic/escala-e-auditoria.md` §1 → contrato: `os tokens de texto valem…`
- [X] T007 [US1] Atualizar `tv-web/src/styles/tokens.test.ts` para os valores base novos
- [X] T008 [US1] Trocar os `font:`/`font-size:` com px literal < 20 (e os demais literais do mapa) pelo token do papel em `tv-web/src/styles/player.css`, `tv-web/src/styles/shared.css` e `tv-web/src/index.css` — `logic/escala-e-auditoria.md` §2 → contrato: `nenhum font-size/font com tamanho literal…`
- [X] T009 [US1] Metadados auxiliares de `--fs-caption` para `--fs-body` onde forem metadado (programa "Agora", ano, duração, gênero) em `tv-web/src/styles/*.css` (D-003)
- [X] T010 [US1] TV ao vivo — linha de canal 96 px e `LIVE_ITEM_ROW_HEIGHT` 84 → 108 em `tv-web/src/features/live/liveTrail.ts` + `tv-web/src/styles/live.css`; itens da trilha; `TRAIL_ROW_PITCH_FALLBACK` em `tv-web/src/lib/focus/paging.ts` acompanhando a altura real (D-006, FR-007)
- [X] T011 [P] [US1] Guia: medir e, se vazar, ajustar `GUIDE_ROW_HEIGHT` em `tv-web/src/features/live/guide/EpgGuide.tsx` e o CSS correspondente
- [X] T012 [P] [US1] Início: cards, fileira de canais, `HOME_ROW_FORMATS`/`HOME_CHANNELS_VISIBLE` em `tv-web/src/features/home/homeRowFormats.ts` e `tv-web/src/styles/home.css`
- [X] T013 [P] [US1] Filmes/Séries: vitrine (`ROW_FORMATS[*].rowHeight`), grade e cards em `tv-web/src/features/vod/` e `tv-web/src/styles/vod.css`; detalhe de série (`EPISODE_ROW_HEIGHT` em `tv-web/src/features/series/SeriesDetailScreen.tsx`) e de filme
- [X] T014 [P] [US1] Busca e pessoa: `CARD_HEIGHT` em `tv-web/src/features/search/SearchScreen.tsx` e `tv-web/src/features/person/PersonScreen.tsx`
- [X] T015 [P] [US1] Player (chrome, barra, faixas, painéis), modais, Configurações (todas as abas), tela da lista (067), perfis, cadastro e teclado na tela (IME) — caixas crescem com o texto, anel de foco inteiro (FR-003, FR-004); ícones e capas mantêm o tamanho (FR-006, D-004)
- [X] T016 [US1] Nome longo no foco: uma utilidade (classe/componente) de rolagem horizontal só no item focado, depois de ~1 s, em `transform`, sem mudar a altura; com "Reduzir movimento" não anima — aplicar a linha de canal, item de trilha, card de filme/série e episódio (`logic/escala-e-auditoria.md` §4, FR-005, D-005, R-005)
- [X] T017 [US1] Rodar `node e2e/legibilidade-tv.mjs` e corrigir até zerar (repetir T010–T016 conforme a saída), em pt, en e es (SC-001, SC-002, R-002, R-008)
- [X] T018 [US1] Ajustar testes **não travados** e roteiros E2E cujos números dependem da altura (itens por página/fileira), mantendo a intenção de cada um (R-006)

### Testes da Fase

- [X] T019 [P] [US1] Teste da utilidade de nome longo (rola só com foco; não rola com "Reduzir movimento") junto do componente criado em T016
- [X] T020 [P] [US1] Rodar os contratos travados de paginação/memória de foco (049 e os da Live) com a altura nova: `npx vitest run src/features/live src/features/vod src/lib/focus`

**Critério de Conclusão**: `npx vitest run src/styles/escala.legibilidade-tv.contract.test.ts` → 2/2 verdes e `check-contract-tests.ps1 -Slug 068-legibilidade-tv` íntegro; contrato emendado da 049 verde e `-Slug 049-navegacao-por-pagina` íntegro; `node e2e/legibilidade-tv.mjs` sem achados nos 3 idiomas; `npx tsc -b`, `npm run lint` e `npm run test` limpos.

**Checkpoint**: escala nova no app inteiro, testável sem a US2.

**Registro da Fase**:

- Status: concluída (2026-10-10)
- Feito: tokens 64/48/32/28/24/20 em `index.css` e `font-scale.css` (`--font-scale` 1) e `tokens.test.ts`; 36 `font:` com px fixo em `player.css`/`shared.css` e o 18px da raiz viraram tokens pelo papel; 33 rótulos/metadados de `--fs-caption` → `--fs-body` (D-003); linha de canal 96px e `LIVE_ITEM_ROW_HEIGHT` 108; título dos cards em `--fs-body-lg` (28) e inteiro no card focado da vitrine/grade (`:has`, cresce sobre a capa); `MarqueeText` (novo, `components/`) no nome do canal (prop `nameActive` da `ChannelRow`), da trilha (`SideCategoryNav`), do episódio e do canal favorito da Início; nome do programa no guia em 24px (`GUIDE_ROW_HEIGHT` 84 mantido, cabe); `CARD_HEIGHT` 370 → 410 (busca e pessoa); `EPISODE_ROW_HEIGHT` 196 → 220 e sinopse do episódio em 2 linhas; trilha das Configurações 288 → 384px e a da tela da lista 384 → 480px. Mantidos: `TRAIL_ROW_PITCH_FALLBACK` 56 (só reserva sem layout), formatos da Início e da vitrine (auditoria e E2E sem achado).
- Contrato: `npx vitest run src/styles/escala.legibilidade-tv.contract.test.ts` → 2/2 verdes; 049 emendado (`LiveScreen.navegacao-por-pagina`) 3/3 verde; travas 068 e 049 íntegras.
- Testes executados: `npm run test` → 3184 verdes, 2 vermelhos = só os contratos da US2 (Fase 3); `npx tsc -b` limpo; `npm run lint` ok (tetos respeitados: `liveColumns` 510/511, `SeriesDetailScreen` 1021/1021); `node e2e/legibilidade-tv.mjs --relatorio` → 66 telas (pt/en/es), **0 achados** (base: 163); `node e2e/run.mjs --only serie-foco-episodios,home-vitrine-expandida,vitrine-filmes-series,carrosseis-filmes-series,ime-formularios,home-busca-configuracoes,vod-pesquisa-ordenacao,epg-guia-completo,modal-temporada,detalhe-cinema,configuracoes-lista-global,categorias-controle-parental,favoritos,idioma-do-app` → 14/14. Testes não travados ajustados (T018): `LiveScreen.paginacao.test.tsx` (página de 5), `SideCategoryNav.collapsed.test.tsx` e `SeriesDetailScreen.metadata.test.tsx` (texto dentro de `.marquee-inner`). Novo: `MarqueeText.test.tsx` (3).
- Pendências: a auditoria ganhou folga de 20% da altura do glifo (falso positivo: a caixa do glifo passa da linha de 1.2) e ignora linha inteira escondida por `line-clamp` (R-009). Player só medido no estado de erro (a fixture não toca) — o chrome em reprodução fica para o quickstart/TV. E2E da TV ao vivo ficam para depois da Fase 3.

---

## Phase 3: User Story 2 — TV ao vivo sem cabeçalho e em coluna única (Priority: P2)

**Objetivo**: Live sem topbar nem título; uma lista à esquerda (categorias **ou** canais), destaque à direita; OK entra, RETURN volta à categoria, RETURN volta ao Início.

**Independent Test**: quickstart → Navegador, itens 3–5.

### Contrato da Fase

- `sem topbar nem título; coluna única: categorias → OK → canais (com "N canais") → RETURN → mesma categoria → RETURN → Início` — US2/AC1..AC4, FR-008..FR-011
- `sem topbar, o vazio "todas escondidas" mantém "Gerenciar categorias" focado e o OK chega a onManageCategories` — FR-013, D-010 da 067
- Comando (em `tv-web/`): `npx vitest run src/features/live/LiveScreen.legibilidade-tv.contract.test.tsx`

### Implementation

- [X] T021 [US2] `tv-web/src/App.tsx` (`case 'live'`): deixar de passar `shell`; passar `onManageCategories={() => openListSettings(dispatch, source.id, { name: 'live' }, { tab: 'parental' })}` (D-008, D-009) → contrato: `sem topbar nem título…`, `…Gerenciar categorias…`
- [X] T022 [US2] `tv-web/src/features/live/LiveScreen.tsx`: tirar o bloco `.live-header`; `data-live-view` em `.live-body` por `effectiveCol`; sem `shell`, `AppShell` com `topBar={null}` e as mesmas dicas; `onManage = shell?.onOpenSettings ? () => shell.onOpenSettings('parental') : onManageCategories` nos dois pontos; manter a prop `shell` (contrato da 024) — `logic/live-coluna-unica.md` §2–§4, teto 349 (R-004)
- [X] T023 [US2] `tv-web/src/features/live/liveColumns.tsx`: cabeçalho da lista de canais (`.live-panel-head`) com o nome da entrada e `t('live.channelCount', { n })` (D-010), teto 511 → contrato: `sem topbar nem título…`
- [X] T024 [US2] `tv-web/src/styles/live.css`: esconder a coluna inativa por `data-live-view`; lista ≈ 1/3 da largura útil, destaque no resto, em tokens de espaço (FR-009, SC-003)
- [X] T025 [US2] Conferir que favoritos, "Todos", números de canal, busca, guia, controle parental e zapping seguem iguais (FR-013): `npx vitest run src/features/live`
- [X] T026 [US2] Ajustar os E2E da Live que usam topbar/título (`logic/live-coluna-unica.md` §5): `live-tv-ds-v14.mjs`, `live-paridade-v14.mjs`, `zapping-live-tv.mjs`, `navegacao-por-pagina.mjs`, `memoria-foco-key-repeat.mjs`, `epg-*`, conforme falharem

### Testes da Fase

- [X] T027 [P] [US2] Teste de `App` (não travado) cobrindo que a Live é montada sem topbar e que "Gerenciar categorias" abre a tela da lista na aba Categorias, ao lado dos testes existentes de `tv-web/src/App*.test.tsx`

**Critério de Conclusão**: `npx vitest run src/features/live/LiveScreen.legibilidade-tv.contract.test.tsx` → 2/2 verdes e `check-contract-tests.ps1 -Slug 068-legibilidade-tv` íntegro; contratos travados da 024/030/031/048/049 da Live verdes sem edição; `npm run test:e2e -- --only <roteiros da Live>` verde; `npm run lint` dentro dos tetos.

**Checkpoint**: Live em coluna única, sem perder nenhum comportamento.

**Registro da Fase**:

- Status: concluída (2026-10-10)
- Feito: retomada com T021–T025 já implementadas; conferida a Live sem topbar/título, uma lista por vez, contagem no cabeçalho e gestão de categorias preservada. T026: revisados os ajustes existentes dos roteiros e executados os 8 E2E da Live, sem necessidade de nova alteração. T027: `App.test.tsx` cobre entrada sem `shell`/topbar, gestão da lista ativa na aba `parental`, retorno à Live e depois ao Início.
- Contrato: `npx vitest run src/features/live` → 224/224 verdes (32 arquivos), incluindo os 2 contratos da 068 e os contratos travados da Live das features 024/030/031/048/049, sem edição. `check-contract-tests.ps1 -Slug 068-legibilidade-tv` → trava íntegra (4); `-Slug 049-navegacao-por-pagina` → trava íntegra (5).
- Testes executados: em `tv-web/`, `npx vitest run src/features/live` → 224/224; `npx vitest run src/App.test.tsx` → 5/5; `node e2e/run.mjs --only live-tv-ds-v14,live-paridade-v14,zapping-live-tv,navegacao-por-pagina,memoria-foco-key-repeat,epg-dados-agora,epg-guia-completo,headers-catchup --jobs 4 --retry 0` → 8/8 (128 s); `npm run lint` → sem erros, tetos respeitados (avisos do linter e da catraca); `npx tsc -b` → sem erros (exit 0).
- Pendências: revisão manual do quickstart (incluindo SC-004 e canal lembrado por categoria), gates completos e aprovação de longe na TV ficam para a Fase 4. Nenhuma falha nos testes executados desta fase.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: documentação, gates completos e a passada na TV.

- [X] T028 [P] Nota de emenda em `docs/design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md` §6 (escala nova, alinhada à ADR-007 §7; 20 px mínimo) (R-007)
- [X] T029 [P] `CLAUDE.md` → seção "Design system": uma linha de regra permanente (mínimo 20 px, padrão 24; tokens `--fs-*`; a auditoria `e2e/legibilidade-tv.mjs` cobre telas novas)
- [X] T030 Capturas depois (mesmas telas de T004) em `sdd/specs/068-legibilidade-tv/evidencias/depois/`
- [X] T031 `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen`
- [ ] T032 `npm run test:e2e` completo (com `npm run dev` rodando)
- [X] T033 Executar `quickstart.md` (navegador, itens 1–6)
- [X] T034 **Gate SC-005**: instalar na TV física (`deploy-tv.ps1`) e o usuário aprova de longe as telas do SC-002; registrar quem viu e o resultado no `plan.md`
- [X] T035 Ajuste solicitado durante a Fase 4: somente a lista lateral de categorias de Filmes/Séries segue o visual da Live (largura expandida, linhas e iniciais); preservar recolhimento, pôsteres/fileiras, grade e navegação. Validar VOD, E2E e atualizar pacote antes da instalação.

### Checklist de Release

- [X] Fase 1 (emenda 049) concluída e trava da 049 íntegra
- [X] Fase 2 (US1) concluída
- [X] Fase 3 (US2) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro (068 e 049)
- [X] Auditoria `e2e/legibilidade-tv.mjs` sem achados em pt/en/es
- [X] `npm run build:tizen` sem arquivo emitido fora de `CCPlayTv/tizen_web_project.yaml`
- [ ] `npm run test:e2e` verde
- [X] `quickstart.md` executado
- [X] Passada na TV física aprovada pelo usuário (gate)

**Registro da Fase**:

- Status: encerrada por solicitação do usuário (2026-10-10), com pendência E2E registrada separadamente
- Feito: T028/T029 documentam a escala 64/48/32/28/24/20 e o mínimo 20 px; T030 salva 23 capturas em `evidencias/depois/` (as telas da base e a aba Histórico da lista).
- Contrato: `npm run test` → 3187/3187 verdes, 533 arquivos (inclui todos os contratos); travas 068 (4) e 049 (5) íntegras.
- Testes executados: `npm run lint`, `npm run build` e `npm run build:tizen` → aprovados (TypeScript, guard de demux e sincronização do manifesto); `node e2e/legibilidade-tv.mjs --capturas ../sdd/specs/068-legibilidade-tv/evidencias/depois` → 69 telas pt/en/es, 0 achados (`evidencias/fase4-auditoria.txt`); `node e2e/legibilidade-tv.mjs --quickstart` → 69 telas e ciclo da Live/marquee/movimento reduzido verdes nos três idiomas (`evidencias/fase4-quickstart.txt`). Conferência visual/funcional detalhada em `evidencias/quickstart-navegador.md`.
- Revalidação: usuário autorizou fixar `locale: 'pt-BR'` em `performance-navegacao`; `node e2e/run.mjs --only player-dev-mpegts,performance-navegacao,configuracoes-lista-global --jobs 1 --retry 0` → 2/3 aprovados (262 s). Navegação e SELECT em Gerenciar categorias verdes; `player-dev-mpegts` repetiu a falha inicial (reprodução não confirmada em 15 s, nenhuma conexão ativa), embora as dez trocas e a reconexão tenham passado. Evidência: `evidencias/fase4-e2e-reproducao.txt`. Lint reexecutado após a correção: aprovado.
- Ajuste T035 solicitado e esclarecido pelo usuário: apenas o visual da lateral de categorias de Filmes/Séries segue a Live; manter pôsteres/fileiras, grade e recolhimento automático. Proposta de lista de títulos descartada, sem editar contratos. `npx vitest run src/features/vod src/components/SideCategoryNav.collapsed.test.tsx` → 185/185 em 43 arquivos; lint e build:tizen verdes; travas 052/053 íntegras. Auditoria renovada: 69 telas pt/en/es, 0 achados (`evidencias/fase4-vod-auditoria.txt`). E2E de carrosséis verde com verificações da largura/iniciais e capturas expandida/recolhida, inspecionadas pelo agente. Vitrine teve uma asserção lendo o botão inteiro (incluía o tile decorativo); seletor corrigido para o rótulo, sem afrouxar a verificação de prefixo, e roteiro revalidado com sucesso (`evidencias/fase4-vod-vitrine-revalidacao.txt`). Nova suíte completa em `evidencias/fase4-vod-e2e-completo.txt` ainda em andamento; falha inicial do player repetida.
- Resultado final desta rodada: `npm run test:e2e -- --jobs 3 --retry 0` → 44/46 em 1075 s; falhas em player-dev-mpegts (R-012) e no seletor de rótulo da vitrine, este corrigido e revalidado com sucesso. T032 permanece aberto; não aceitar a falha do player como baseline.
- TV: `deploy-tv.ps1 -TvIp 192.168.0.2 -SkipBuild` → instalação, lançamento e applist confirmados em 2026-10-10, mesmo certificado Samsung e sem desinstalar (`evidencias/fase4-vod-deploy-tv.txt`). T034/SC-005 ainda exigem aprovação visual do usuário; retorno específico sobre categorias e recolhimento solicitado. Aprovação específica recebida em 2026-10-10: usuário, na TV e de longe, "Categorias e recolhimento aprovados". Isso aprova T035, sem presumir aprovação global das demais telas do SC-005.

- Fechamento: usuário confirmou "ja validei todas telas pode fechar" em 2026-10-10. Todas as telas aprovadas na TV física pelo usuário; T034/SC-005 e checklist da TV concluídos. Feature encerrada por solicitação, mantendo T032 e o checklist E2E desmarcados: suíte completa 44/46, vitrine corrigida/revalidada separadamente, falha inicial de player-dev-mpegts ainda sem correção (R-012). Pendência transferida para Ideias Futuras no backlog; encerramento não equivale a suíte verde.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 1**: sem dependências; precisa vir antes de T010 (altura da linha de canal).
- **Fase 2 (US1)**: depende da Fase 1. T005 primeiro (guia o resto); T006–T009 antes de T010–T016; T017 fecha.
- **Fase 3 (US2)**: depende só da Fase 1 em termos de contrato; feita depois da US1 para medir a largura da coluna já com a letra nova.
- **Fase 4**: depende das fases 2 e 3.

### Parallel Opportunities

- T011–T015 (áreas diferentes) em paralelo depois de T006–T009.
- T028/T029 em paralelo com T030–T033.

---

## Implementation Strategy

1. Fase 1 → emenda aplicada e travada.
2. Fase 2 → escala nova guiada pela auditoria; parar e conferir no navegador.
3. Fase 3 → Live em coluna única.
4. Fase 4 → gates e TV física.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Contratos travados nunca são editados; a única emenda é a de T001, aprovada.
- Commitar após cada fase (só quando o usuário pedir)

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
