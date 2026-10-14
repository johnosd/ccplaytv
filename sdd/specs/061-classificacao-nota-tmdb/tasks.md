---
description: "Tasks da feature 061 — classificação indicativa e nota TMDB"
---

# Tasks: Classificação indicativa e nota TMDB no Início e no detalhe

**Input**: Documentos de design de `sdd/specs/061-classificacao-nota-tmdb/`

**Prerequisites**: plan.md, spec.md, logic/classificacao-e-nota.md, quickstart.md, contract-tests.lock

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend único em `tv-web/` (React + TS + Vite); comandos de teste/build rodam de `tv-web/`.
- Regras puras em `tv-web/src/lib/metadata/`; apresentação em `tv-web/src/components/`; telas em `tv-web/src/features/`.
- Tokens em `tv-web/src/index.css`; CSS compartilhado em `tv-web/src/styles/shared.css`; textos em
  `tv-web/src/lib/i18n/messages/*.ts` (pt/en/es).
- Scripts de trava e status rodam da raiz do repositório.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Textos e tokens que todas as stories usam.

- [X] T001 [P] Chaves `rating.content.aria`, `rating.content.years`, `rating.content.free` em pt/en/es em `tv-web/src/lib/i18n/messages/components.ts` (textos exatos em `logic/classificacao-e-nota.md` §3)
- [X] T002 [P] Tokens `--rating-br-l` … `--rating-br-18` e `--rating-br-*-ink` em `tv-web/src/index.css` (valores do protótipo, logic §3)

**Checkpoint**: `npx tsc -b` limpo; `npx vitest run src/lib/i18n` verde.

**Registro da Fase**:

- Status: Concluída em 2026-10-06 (T001–T002).
- Feito: Chaves `rating.content.aria`, `rating.content.years` e `rating.content.free` em pt/en/es; 12 tokens de fundo/tinta da escala brasileira conforme logic §3.
- Contrato: sem contrato nesta fase; `./.planning/scripts/powershell/check-contract-tests.ps1 -Slug 061-classificacao-nota-tmdb` → PASS, trava íntegra (5 testes preservados; implementação nas Fases 2–3).
- Testes executados: de `tv-web/`, `npx vitest run src/lib/i18n` → 5 arquivos / 18 testes verdes (rodado após T001 e T002); `npx tsc -b` → limpo; `npm run lint` → exit 0, avisos nos arquivos existentes; `npx oxlint --quiet` → exit 0, sem erros.
- Pendências: Nenhuma no Setup. Próxima fase: Foundational (T003–T014), aguardando confirmação conforme modo pausado.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Regras puras, obtenção/guarda do dado e os dois selos — tudo de que as três stories dependem.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `extrai só valores válidos de BR, US e ES…` — FR-006, FR-007
- `nota do TMDB: … pelo menos 50 votos` — FR-002, FR-008, SC-004
- `mostra só a classificação do país do idioma…` — FR-004, FR-005, FR-016, SC-003, SC-005
- `registro TMDB gravado antes da 061 é consultado UMA vez…` — FR-001, FR-003, FR-014, SC-001
- Comando (de `tv-web/`): `npx vitest run src/lib/metadata/contentRating.classificacao-nota-tmdb.contract.test.ts src/components/ContentRatingBadge.classificacao-nota-tmdb.contract.test.tsx src/lib/metadata/titleMetadata.classificacao-nota-tmdb.contract.test.ts`

### Implementation

- [X] T003 [P] Implementar `certificationsFromTmdb`, `tmdbRatingFromTmdb`, `certificationFor` e `tmdbRatingToShow` em `tv-web/src/lib/metadata/contentRating.ts` (stub; tabela e ordem de tipo em logic §2/§4) → contrato: `extrai só valores válidos…`, `nota do TMDB…`
- [X] T004 [US1] `detailParams.append_to_response` com `release_dates` (filme) / `content_ratings` (série) em `tv-web/src/lib/metadata/tmdbLookup.ts` (logic §1; a reserva de sinopse em `toMatched` não muda) → contrato: `registro TMDB gravado antes da 061…`
- [X] T005 `mapTmdbDetail` grava `certifications` (sempre, `{}` se vazio) e `tmdbRating` em `tv-web/src/lib/metadata/tmdbMapping.ts` (D-002) → contrato: `registro TMDB gravado antes da 061…`
- [X] T006 `tmdbLacks061` no `lacksNewFields` de `enrichFromTmdb` e cópia de `certifications`/`tmdbRating` só com `matched` em `mergeTitleMetadata`, em `tv-web/src/lib/metadata/titleMetadata.ts` (logic §5/§6) → contrato: `registro TMDB gravado antes da 061…`
- [X] T007 [P] `ContentRatingBadge` em `tv-web/src/components/ContentRatingBadge.tsx` (stub; país por `useT().language`, `aria-label` pelo i18n, classe por valor no Brasil) → contrato: `mostra só a classificação do país do idioma…`
- [X] T008 [P] `TmdbRatingBadge` em `tv-web/src/components/TmdbRatingBadge.tsx` (stub; texto contínuo "TMDB 7,8", `Intl.NumberFormat` do idioma, `null` abaixo do mínimo)
- [X] T009 [P] CSS `.content-rating-badge`, `.content-rating-badge--br-*` e `.tmdb-rating-badge` em `tv-web/src/styles/shared.css`, só com tokens (D-008)

### Testes da Fase

- [X] T010 [P] `tv-web/src/lib/metadata/tmdbMapping.test.ts`: os dois campos gravados a partir de um detalhe com `release_dates`/`content_ratings`; `certifications: {}` quando nada serve; sem votos numéricos, sem `tmdbRating`
- [X] T011 [P] Teste de `mergeTitleMetadata` (em `tv-web/src/lib/metadata/titleMetadata.test.ts`): copia só com `matched`; `no_match`/`dead_id` não têm os campos
- [X] T012 [P] `tv-web/src/components/TmdbRatingBadge.test.tsx`: pt "TMDB 7,8", en "TMDB 7.8", 49 votos → nada, nada focável
- [X] T013 [P] Teste do `ContentRatingBadge` (arquivo não travado, ex. `ContentRatingBadge.test.tsx`): `L` → "Classificação indicativa: livre", classe `--br-l`; série dos EUA (`TV-MA`) neutra
- [X] T014 Atualizar testes NÃO travados que semeiam `matched` sem `certifications` esperando 0 requisições ou comparam `fields` exato (R-003; ex. `titleMetadata.trailers.test.ts`, `titleMetadata.test.ts`, `tmdbMapping.test.ts`), citando a 061

**Critério de Conclusão**: o comando do contrato da fase → 4/4 verdes e `check-contract-tests.ps1 -Slug 061-classificacao-nota-tmdb` íntegro; travas 032, 033, 035 e 055 íntegras e seus contratos verdes; `npx tsc -b` limpo; `npx vitest run src/lib/metadata src/components` verde.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status: Concluída em 2026-10-06 (T003–T014), modo contínuo.
- Feito: Extração validada por país e tipo de lançamento; nota com mínimo de votos; dados na mesma chamada e no cache existente; reconsulta única ao abrir; selos acessíveis e não focáveis; CSS só com tokens; testes adicionais e semente da 033 isolada da atualização 061.
- Contrato: `npx vitest run src/lib/metadata/contentRating.classificacao-nota-tmdb.contract.test.ts src/components/ContentRatingBadge.classificacao-nota-tmdb.contract.test.tsx src/lib/metadata/titleMetadata.classificacao-nota-tmdb.contract.test.ts` → 4/4 verdes após os quatro vermelhos esperados; trava 061 íntegra.
- Testes executados: `npx vitest run src/lib/metadata src/components` → 96 arquivos / 543 testes verdes; testes adicionais T010–T013 → 19/19 verdes; `npx tsc -b` limpo; contratos relacionados 032/033/035/055 verdes, travas íntegras.
- Pendências: Nenhuma na fundação; seguir aos heroes do detalhe (Fase 3).

---

## Phase 3: User Story 1 - Classificação e nota TMDB no detalhe (Priority: P1) 🎯 MVP

**Objetivo**: O hero do detalhe de filme e de série mostra classificação do país do idioma e nota TMDB ao lado da nota do provedor.

**Independent Test**: com chave TMDB, abrir filmes e séries com e sem classificação no país do idioma, com nota acima e abaixo do mínimo; trocar o idioma e reabrir (quickstart cenários 1–7).

### Contrato da Fase

- `hero: "★ 7,4 Provedor", depois o selo… "TMDB 7,8"…` — US1/AC1+AC3, FR-009, FR-010, FR-016
- Comando (de `tv-web/`): `npx vitest run src/features/movies/MovieDetailScreen.classificacao-nota-tmdb.contract.test.tsx`

### Implementation

- [X] T015 [US1] Hero do filme: `ContentRatingBadge` e `TmdbRatingBadge` no `meta` do `DetailHero`, depois do `RatingBadge`, em `tv-web/src/features/movies/MovieDetailScreen.tsx` (ordem D-006) → contrato: `hero: "★ 7,4 Provedor"…`
- [X] T016 [US1] Hero da série: mesma coisa em `tv-web/src/features/series/SeriesDetailScreen.tsx` (depois de temporadas, assistidos e `RatingBadge`)
- [X] T017 [US1] Conferir no CSS do hero (`tv-web/src/styles/vod.css`, bloco da 059) que os selos cabem na linha de metadata sem quebrar o título nem empurrar as ações (Edge Case "título longo")

### Testes da Fase

- [X] T018 [P] [US1] Teste do hero da série (arquivo não travado, ex. `SeriesDetailScreen.classificacao.test.tsx`): selo + TMDB; sem dado, linha igual à de hoje
- [X] T019 [US1] Rodar `MovieDetailScreen*.test.tsx`, `SeriesDetailScreen*.test.tsx` e as travas 059/055; ajustar testes não travados que leem a linha de metadata inteira

**Critério de Conclusão**: `npx vitest run src/features/movies/MovieDetailScreen.classificacao-nota-tmdb.contract.test.tsx` → 1/1 verde, os 5 contratos da 061 verdes e a trava íntegra; contratos 059 e 055 verdes; `npx vitest run src/features/movies src/features/series src/features/vod` verde.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída em 2026-10-06 (T015–T019).
- Feito: Selos nos heroes de filme e série após a nota do provedor; selo brasileiro sem separador dentro do fundo colorido. Linha flexível com wrap já existente; título limitado a duas linhas pela 059. Teste da série cobre dados presentes e ausentes.
- Contrato: `npx vitest run src/features/movies/MovieDetailScreen.classificacao-nota-tmdb.contract.test.tsx` → 1/1 verde após vermelho esperado; total da 061: 5/5 verdes; travas 061/059/055 íntegras.
- Testes executados: `npx vitest run src/features/movies src/features/series src/features/vod` → 61 arquivos / 359 testes verdes, inclusive contratos 059.
- Pendências: Revisão visual do título longo no E2E/Polish; seguir ao billboard (US2).

---

## Phase 4: User Story 2 - Classificação e nota TMDB no billboard do Início (Priority: P2)

**Objetivo**: O billboard do Início mostra os dois dados do título em destaque.

**Independent Test**: Início com título casado no billboard, com e sem os dois dados; boas-vindas sem nada (quickstart cenário 8).

### Implementation

- [X] T020 [US2] `.home-hero-meta` em `tv-web/src/features/home/HomeContent.tsx` (≈ linha 835): `ContentRatingBadge certifications={heroMetadata?.certifications}` e `TmdbRatingBadge rating={heroMetadata?.tmdbRating}` depois do `RatingBadge` (D-006); nada no billboard de boas-vindas
- [X] T021 [US2] Estilo dos selos dentro de `.home-hero-meta` em `tv-web/src/styles/home.css`, só tokens

### Testes da Fase

- [X] T022 [P] [US2] Teste do billboard (arquivo não travado, ex. `HomeContent.classificacao.test.tsx`): com metadata → os dois na ordem; boas-vindas → nenhum
- [X] T023 [US2] Rodar `src/features/home` e as travas 060/026; ajustar testes não travados

**Critério de Conclusão**: contratos da 061 verdes e trava íntegra; contratos 060 e 026 verdes; `npx vitest run src/features/home` verde.

**Registro da Fase**:

- Status: Concluída em 2026-10-06 (T020–T023).
- Feito: Classificação e nota TMDB na metadata do billboard, após a nota do provedor; boas-vindas sem selos; estilos por tokens. Teste com cache real verifica a ordem.
- Contrato: sem contrato novo nesta fase; 061 e 060/026 preservados, travas íntegras.
- Testes executados: `npx vitest run src/features/home` → 12 arquivos / 85 testes verdes, inclusive os contratos Home da 060/026.
- Pendências: Nenhuma na US2; seguir aos cards expandidos (US3).

---

## Phase 5: User Story 3 - Classificação e nota TMDB no card expandido do Início (Priority: P3)

**Objetivo**: O card expandido mostra os dois quando já estão no aparelho; Top 10 e Dica trazem a nota da descoberta.

**Independent Test**: focar cards com metadata guardada, sem metadata, e do Top 10/Dica; nenhuma requisição ao focar (quickstart cenário 9).

### Implementation

- [X] T024 [US3] `DiscoveryRowResult.ratings?` (mapa itemId → `TmdbRating`, ao lado de `images`) em `useDiscoveryRow` de `tv-web/src/features/catalog/catalogApi.ts` (logic §7; opcional, R-006)
- [X] T025 [US3] `HomeContent.tsx`: juntar `ratings` do Top 10 e da Dica (filmes e séries) num mapa e passar `tmdbRating` ao `HomeTitleCard` (só uma linha de montagem e a prop; R-005)
- [X] T026 [US3] `HomeTitleCard.tsx` → `HomeCardExpanded`: `ContentRatingBadge` com `view?.certifications` e `TmdbRatingBadge` com `view?.tmdbRating ?? tmdbRating` na `.home-card-expanded-meta`, depois do `RatingBadge` (D-007); nunca `useTitleMetadata`
- [X] T027 [US3] Estilo dos selos em `.home-card-expanded-meta` em `tv-web/src/styles/home.css`, só tokens

### Testes da Fase

- [X] T028 [P] [US3] `HomeTitleCard.test.tsx`: expandido com cache → os dois; com nota só da descoberta → TMDB sem classificação; sem nada → nenhum; pôster não expandido → nenhum (FR-013)
- [X] T029 [P] [US3] Teste de `useDiscoveryRow`/`useWeeklyTop10` com `ratings` montado a partir de `voteAverage`/`voteCount` (em `catalogApi.discovery.test.tsx`)
- [X] T030 [US3] Rodar `src/features/home src/features/catalog src/features/vod` e as travas 057/060

**Critério de Conclusão**: contratos da 061 verdes e trava íntegra; contratos 057 e 060 verdes; o teste que espiona `fetch` ao focar (contrato 060) continua verde.

**Registro da Fase**:

- Status: Concluída em 2026-10-06 (T024–T030).
- Feito: Mapas opcionais de notas por id em Top 10/Dica; montagem fora de HomeContent; card expandido usa cache de metadata com precedência e descoberta como reserva da nota, sem consulta; pôster pequeno sem novos selos; estilos por tokens.
- Contrato: sem contrato novo; 061/057/060 com travas íntegras, contratos relacionados verdes; espionagem de fetch no contrato 060 continua verde.
- Testes executados: `npx vitest run src/features/home src/features/catalog src/features/vod src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx src/lib/catalog/homeHero.home-busca-configuracoes-ds-v14.contract.test.ts src/lib/catalog/globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts` → 68 arquivos / 367 testes verdes; `npx tsc -b` limpo.
- Pendências: E2E, quickstart, medição real SC-006 e docs na Fase 6.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, gates e documentação.

- [X] T036 Descoberta durante T031: manter apenas `certifications`/`tmdbRating` do mesmo título como placeholder local em `useTitleMetadata`, durante a releitura de idioma da 054; nunca sinopse em outro idioma ou selos de outro título. Cobrir em `useTitleMetadata.classificacao.test.tsx` e ajustar E2E à exceção já documentada em SC-005/R-002.
- [X] T037 Desvio autorizado pelo usuário em 2026-10-06 durante T032: investigar e corrigir a falha “← para no primeiro canal” da Live TV em `navegacao-por-pagina.mjs`; incluir regressão fora dos contratos travados e validar a navegação por página e a suíte completa. Paginação verde na suíte; novo achado distinto em memória de foco fica aberto em T032/R-010.
- [X] T038 Desvio adicional autorizado pelo usuário em 2026-10-06: investigar e corrigir “Maximum update depth exceeded” no fluxo de zapping de `memoria-foco-key-repeat`; capturar a origem, acrescentar regressão não travada e validar os gates completos. Usuário também autorizou usar as credenciais de QA do `.env` para medir SC-006 real em T033.
- [X] T031 E2E `tv-web/e2e/classificacao-nota-tmdb.mjs` (TMDB simulado por `context.route`, como `home-vitrine-expandida.mjs`; nunca rede real): detalhe com selo e TMDB na ordem; troca para en no mesmo detalhe; registro antigo consultado uma vez; card expandido sem requisição; nenhuma chave no DOM/console. Registrar na `SUITE` de `tv-web/e2e/run.mjs`
- [X] T032 Gates: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen`, `node e2e/run.mjs` (com `npm run dev`); travas 061, 055, 035, 033, 032, 059, 060, 057 íntegras
- [X] T033 Rodar `quickstart.md` (cenários 1–10 no navegador)
- [X] T034 Docs: Spec V14 (`docs/design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md`) — seção Home (l. ~1526) e Detalhe (l. ~1593) deixam de tratar classificação/nota TMDB como "dado novo" e descrevem a regra (país pelo idioma, mínimo de votos) (FR-020, D-010); `README.md` (item do detalhe/Início); `plan.md` (Estado Atual, Execution Notes, PRÓXIMO); `update-feature-status.ps1 -Slug 061-classificacao-nota-tmdb -Status Implementada`; **não** editar `CLAUDE.md`
- T035 **Recomendação fora dos gates obrigatórios, não executada**: passada na TV física para legibilidade das cores oficiais sobre backdrops claros e escuros. Mantida sem checkbox para não contar como bloqueio de implementação, conforme `plan.md` §Estratégia de Testes; não representa teste aprovado em hardware.

**Registro da Fase**:

- Status: Concluída em 2026-10-06; todas as tarefas obrigatórias e critérios de release aprovados. T035 permanece recomendação não executada, fora dos gates.
- Feito: Roteiro `e2e/classificacao-nota-tmdb.mjs` criado e registrado; quickstart 1–10 executado com fixtures/TMDB simulado, incluindo Top 10/Dica só com nota da descoberta. Revisão visual de capturas 1920×1080: título longo sem sobreposição de ações e card expandido legível, sem selos em pôsteres pequenos. Spec V14 e README atualizados. T036 mantém só os selos locais ao trocar idioma.
- Contrato: 5/5 contratos 061 verdes na suíte completa; `check-contract-tests.ps1` para 061/055/035/033/032/059/060/057 e 049/046 dos desvios → dez travas íntegras, contratos relacionados verdes, sem editar arquivos travados.
- Testes executados na versão final: `npx tsc -b` limpo; `npm run lint` exit 0 (avisos existentes); `npm run test` → 450 arquivos / 2841 testes verdes em 144,9 s; `npm run build` e `npm run build:tizen` verdes, saída sincronizada em CCPlayTv. `node e2e/run.mjs` → **41/41 scripts verdes em 405 s**, três em paralelo, sem retries, incluindo 061 e a regressão T038. `node e2e/classificacao-nota-tmdb-real.mjs` → dez títulos reais verificados, SC-006 3/3 com BR válido (100%).
- Iterações do roteiro: corrigidos seletores (foco no pôster), campos de fixture, episódio local da série e expectativa de idioma. A 054 faz a releitura já existente; a 061 não adiciona consulta separada. Não houve alteração de contratos para passar os testes.
- Desvio autorizado T037: corrida de foco na Live TV reproduzida em teste não travado (Canal 01 em vez de Canal 08); callbacks antigos deixam de aplicar foco e destinos novos deixam de ser apagados por renders intermediários. 41 arquivos / 263 testes Live/foco verdes; 4/4 E2E direcionados verdes; paginação verde na suíte completa. Travas 049/046/061 íntegras. Builds e suíte unitária completa aprovados.
- T033/SC-006 real: autorização explícita recebida e roteiro real executado; dez títulos distintos, três com BR válido e 3/3 selos corretos (100%), sete sem selo de reserva, dez segundas aberturas sem nova consulta. Capturas no temporário, nenhum segredo na saída/DOM/console. Amostra sem notas elegíveis (nota positiva com 50 votos); casos elegíveis cobertos por fixtures/contratos. Polling assíncrono corrigido nos dois roteiros 061: `expect.poll` aguarda `page.evaluate`, em vez de aceitar uma Promise antes do resultado.
- Desvio autorizado T038: após 21 execuções e ensaios de 60 ciclos/CPU reduzida sem reprodução, 100 eventos de scroll capturaram as pilhas em setState/useOverflowEdges e virtualizador/flushSync. Alteração no hook compartilhado não bastou e foi descartada. Correção mínima: `useFlushSync: false` no virtualizador Live. Regressão por rajadas incluída no E2E padrão; 4/4 direcionados verdes e o ensaio que reproduziu o erro (`CCPLAY_E2E_STRESS_ROUNDS=2`, `CCPLAY_E2E_STRESS_SCROLL=1`) passou com o hook original. Após a correção final: `npm run test` → 450 arquivos / 2841 verdes em 144,9 s; tipos, lint e ambos builds aprovados; dez travas íntegras.
- Pendências: nenhuma bloqueante. T035: TV física não executada (recomendação, não gate). Nenhum veredito sobre AVPlay/hardware deriva dos testes de navegador.

### Checklist de Release

- [X] Fase 2 (Fundação) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro (061 e as travas listadas em T032)
- [X] E2E verde, inclusive o novo `classificacao-nota-tmdb`
- [X] `quickstart.md` executado
- [X] Nenhuma chave TMDB em log, DOM ou console; nenhuma requisição por foco
- [X] Spec V14 e README atualizados

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **US1 (Phase 3)**, **US2 (Phase 4)**, **US3 (Phase 5)**: dependem da Fase 2; P1 → P2 → P3 (US2 e US3 mexem no mesmo `HomeContent.tsx` — melhor em sequência)
- **Polish (Phase 6)**: depois das três stories

### Parallel Opportunities

- T001/T002; T003/T007/T008/T009; os testes [P] de cada fase.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fases 1 e 2 (fundação + 4 contratos)
2. Fase 3 (detalhe) → contrato do hero verde
3. **PARAR E VALIDAR** no navegador (quickstart 1–7)

### Incremental Delivery

1. Fundação → detalhe (MVP) → billboard → card expandido → Polish.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Nunca editar os arquivos de `contract-tests.lock` (061 e de outras features)
- Commitar após cada fase

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
