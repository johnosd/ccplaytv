# Implementation Plan: Home no layout "Vitrine expandida" do Design System

**Slug**: `060-home-vitrine-expandida` | **Date**: 2026-10-05 | **Spec**: `sdd/specs/060-home-vitrine-expandida/spec.md`

## Summary

O Início ganha a variação B aprovada ("Vitrine expandida", referência Prime Video): um **billboard** de um título em tela cheia (backdrop, sinopse, "Continuar" com barra real, Trailer real) que **recolhe** quando o foco desce; as fileiras passam a ocupar a tela com a focada no topo e um **fundo ambiente** com a imagem do item focado; **pôsteres 250×375 com selos** e um **card focado que expande para 16:9** com informações; Continuar em 16:9 com progresso real; Top 10 com numeral; fileiras novas — **Filmes/Séries adicionados**, **Porque você assistiu X** (também em Filmes/Séries, no lugar do slot "Em breve") e **Ao vivo agora** com EPG.

Abordagem: `HomeContent` continua dono da navegação (um `useRemoteNav`), com regras puras novas (`buildHomeRows`, `cardBadges`, `pickBecauseSeed`) e componentes de apresentação novos em `features/home/` (`HomeBillboard`, `HomeTitleCard`, `HomeLiveCard`, `HomeAmbient`). O fundo entra por uma prop opcional nova do `AppShell` (`backdrop`), filha do `.screen`. O `Rail` ganha duas props opcionais (largura do focado e alinhamento no início). Dados: só o que o app já tem, mais o backdrop que já chega nas respostas do TMDB (campo opcional, sem mudança de esquema) e a busca de semelhantes do título semente ao abrir a tela. Os contratos travados de 052/053/056/057 foram emendados com autorização do usuário (D-012).

## Technical Context

**Language/Version**: TypeScript ~5 + React 19, Vite 8 (alvo `chrome108` — não remover de `vite.config.ts`)

**Primary Dependencies**: nenhuma nova. Reusa `useHomeHero`, `useContinueWatchingContent`, `useMyListContent`, `useFavoritesContent`, `useWeeklyTop10`/`useDailyTip`, `useRecentlyAdded`, `useCachedBackdrops`, `useWatchedIds`/`useFavoriteIds`/`useSeriesWatchedSummary`, `useTitleMetadata`, `useTmdbStatus`, `resolveTmdbTitles`, `useEpgPrograms`/`nowNextForChannel`/`formatEpgTimeRange`, `useIdFocus`, `Rail`, `PosterArt`, `RatingBadge`, `SeeAllCard`, `ComingSoon`, `DetailChips`, `primaryProgress`, `useCoverColor`/`usePanelHosts`, `trailerAction.ts` + `TrailerLayer`, `@tanstack/react-virtual`, catálogo de idioma (`lib/i18n`)

**Storage**: IndexedDB via Dexie (v16), **sem mudança de esquema**: `backdropUrl?` opcional dentro de `TmdbTitleRef` (gravado em `titleMetadata`) e de `DiscoveryTitle` (gravado em `discoveryCache`). A v17 continua livre. Nenhum estado do usuário novo.

**Testing**: vitest (projeto `dom` para `*.test.tsx`, `node` para `*.test.ts`), fake-indexeddb via `db`, E2E Playwright (`tv-web/e2e/run.mjs`), passada na TV física (gate)

**Target Platform**: Samsung QN50Q60DAGXZD — Tizen 9 / Chromium 120, origin `file://`, palco 1920×1080

**Performance Goals**: "Continuar" focável em ≤ 1 s com o catálogo local (SC-007); fileiras do índice de busca adiadas para depois do primeiro desenho (R-001); uma `<img>` de fundo por vez, sem `blur`; fundo só depois de 250 ms parado; expansão sem engasgo na TV ou sem animação (FR-028)

**Constraints**: tokens V14 (FR-024; medidas de card numa fonte única TS → variáveis CSS, padrão da 053); nenhum fundo no `.screen` (FR-027); nenhuma consulta/reprodução por foco (FR-022); URL de imagem nunca em log/erro (FR-026); toda string nova em pt/en/es (FR-025); nome acessível de "Continuar" exato (contrato 026)

**Scale/Scope**: 1 tela (`HomeContent`/`HomeScreen`) + 1 fileira em `VodShowcaseScreen`; 4 componentes novos, 3 regras puras, ~5 hooks (novos ou estendidos), 2 props opcionais (`AppShell`, `Rail`), mapeamentos do TMDB, CSS da Home reescrito, chaves em `messages/home.ts`/`vodShowcase.ts`/`comingSoon.ts`

## Decisões Invariantes

- **D-001** `HomeContent` continua dono da navegação e do único `useRemoteNav` da Home (regra da 040). `HomeBillboard`, `HomeTitleCard`, `HomeLiveCard` e `HomeAmbient` são só apresentação (sem teclado, sem estado de foco).
- **D-002** Billboard = `section.home-hero` (classe mantida) com `data-state="expanded"` (foco no billboard/dock) ou `"collapsed"` (foco nas fileiras). Recolhido não tem focáveis no fluxo. Contrato 060.
- **D-003** Rolagem vertical: viewport `.home-rows` com a fileira focada no topo (`scrollTop = row.offsetTop`), fileiras acima com `is-above` (opacidade 0). Primeira sincronização após montar (inclusive restauração) **sem animação** (FR-020); `prefers-reduced-motion` sempre instantâneo. `logic/billboard-e-navegacao.md` §5.
- **D-004** Fundo: `AppShell` ganha `backdrop?: ReactNode`, renderizado como 1º filho de `.app-shell` (absoluto, atrás da topbar); sem a prop, nada muda nas outras telas. Camadas: cor da capa (`--home-ambient`) ou gradiente neutro → `<img>` 16:9 local → vinheta. Nunca estilo no `.screen`.
- **D-005** Fundo acompanha o card **só depois de 250 ms parado** (`HOME_AMBIENT_DELAY_MS`); billboard usa o título dele na hora; canal não troca o fundo.
- **D-006** Imagem 16:9 de um item = `provider_backdrop_url` → cache de metadata → `backdropUrl` que veio com a fileira (Top 10/Dica/Semelhantes). Só local. `logic/fileiras-e-dados.md` §1.
- **D-007** Cards: raiz com `data-item-id` e `tv-focus`; selos por `cardBadges` (NOVO = `added_at` nos últimos 7 dias; ★ só com nota > 0; ✓; ♥), estados lidos uma vez por tela, nunca por foco. Só o focado expande, e a camada expandida monta só com o foco.
- **D-008** `Rail` ganha `focusedItemWidth?` e `align?: 'auto' | 'start'`, ambos opcionais — sem eles o comportamento é o de hoje (contrato 022 intocado). Transição de posição por `--home-expand-duration` só dentro da Home.
- **D-009** Medidas numa fonte única `features/home/homeRowFormats.ts` (pôster 250×375 → 667×375; Continuar 480×270 → 600×338; canal 480×270; numeral 160 com recuo −44), passadas ao CSS por variáveis inline.
- **D-010** Billboard: regra de escolha da 026 inalterada; metadata do título dele obtida **ao abrir** a Home (`useTitleMetadata`, mesma consulta do detalhe), tolerando id inexistente; barra só via `primaryProgress`; duração de episódio só se o registro já estiver no aparelho. Nome acessível da primária = rótulo atual exato; "faltam X" por `aria-describedby` (contrato 026).
- **D-011** "Porque você assistiu": semente pela regra pura `pickBecauseSeed` (contrato); hook `useBecauseYouWatched` em módulo próprio `features/catalog/becauseApi.ts` (fora do `catalogApi`, que os testes de Filmes/Séries mocam parcialmente); **sem chave TMDB conectada, zero requisição e zero fileira**. Início = qualquer tipo; Filmes/Séries = o tipo da tela. Título "Porque você assistiu {título}".
- **D-012** **Emenda autorizada** (usuário, 2026-10-05) dos contratos travados de **052, 053, 056 e 057**: "Porque você assistiu" deixou de ser slot "Em breve" — sem semente não existe. Mudou só o que citava o slot; retravados 5/5 cada e registrados (052 R-021, 053 R-019, 056 R-014, 057 R-019). Ficam vermelhos até a Fase 5.
- **D-013** Filmes/Séries adicionados na Home: `useRecentlyAdded` por tipo, com cobertura, **carga adiada** para depois do primeiro desenho; mesma `queryKey` da vitrine.
- **D-014** Ordem das fileiras (FR-018) por `buildHomeRows`: continue · top10-movies · added-movies · tip-movies · because · channels ("Ao vivo agora") · mylist · top10-series · added-series · tip-series · ai. Fileira sem dado (ou carregando) não existe; `ai` sempre (soft-disabled).
- **D-015** A TV física é **gate** (SC-009, decisão do usuário), pela exceção da constitution em "Validação em hardware real": fluidez da expansão, troca de fundo com seta segurada e legibilidade não são provadas no navegador.
- **D-016** Fora: prévia de vídeo/trailer ao focar, carrossel automático do billboard, classificação indicativa, nota TMDB, relevância %, 4K/5.1 (ADR-011, item 72 do backlog).
- **D-017** Navegação: linhas `dock` → `hero` → fileiras; ↑ no hero vai ao dock, ↑ no dock à topbar (`onExitUp`); ←/→ param nas pontas; memória por linha por id (`useIdFocus`). Chaves `HomeFocus.rail` novas: `added-movies`, `added-series`, `because` (`channels` = "Ao vivo agora").
- **D-018** Mocks entregues saem de `comingSoon.ts` (+ catálogo pt/en/es): `vod-because` e `home-trailer`. O tipo `ShowcaseRowKind` mantém `'slot'` (contrato de foco da 053 usa slots sintéticos).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Sem mudança |
| Segredos Fora dos Clientes e dos Logs | OK | OK | URLs de imagem montadas sem chave (`tmdbImageUrl`); nenhuma URL em log/erro (FR-026); cor da capa só de capa "sem risco" (059) |
| Categorias da Fonte São Preservadas | OK | OK | Chip da categoria da lista separado dos gêneros (`DetailChips`) |
| IA e Classificação Nunca Inventam Dados | OK | OK | Fileiras sem dado não existem; semente ignora episódio sem série conhecida (contrato); sem classificação/nota TMDB inventadas (D-016) |
| Comandos Locais Independem de Rede, Backend ou IA | OK | OK | Navegação e expansão são locais; dados de rede (metadata do billboard, semelhantes da semente, Top 10/Dica) só ao abrir e nunca bloqueiam o foco |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | OK | OK | Trailer do billboard reusa a 033 (não toca progresso/favorito) |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | OK | OK | Dock alcançável por ↑ (D-017); todas as fileiras por ↓/↑; RETURN como hoje |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | OK | OK | Sem mudança |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Focar não reproduz nem consulta API (contrato, SC-004); fundo/cor depois de 250 ms parado. Ler a cor de uma capa já exibida é download de imagem, não consulta de serviço — ver R-003. Todo estado tem focável (billboard sempre existe) |
| Voltar Restaura Foco e Posição | OK | OK | Restauração por id em qualquer fileira, já recolhido e sem animação (contrato, FR-020) |
| Identidade de Reprodução Não Depende da URL | OK | OK | Progresso/assistido/favorito por `stableId`; semente por `stableId` |
| Progresso e Capacidades São Reais, Nunca Prometidos | OK | OK | Barra/"faltam" só via `primaryProgress`; cobertura parcial indicada nas fileiras do índice e do TMDB |
| Documentação do Repositório É Canônica | OK | OK | Spec V14 e protótipo já atualizados (sessão de 2026-10-05); emendas registradas nos 4 planos; backlog G3 atualizado |

**Restrição "Validação em hardware real"**: elevada a gate por D-015, dentro da exceção prevista.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/060-home-vitrine-expandida/
├── spec.md
├── plan.md
├── logic/
│   ├── billboard-e-navegacao.md   # estrutura, billboard, ordem das fileiras, linhas de foco, rolagem, fundo, dock
│   ├── cards-e-expansao.md        # medidas, Rail, HomeTitleCard, selos, card expandido, progresso do Continuar
│   └── fileiras-e-dados.md        # imagem 16:9, "Porque você assistiu", adicionados, Ao vivo agora, captura de backdrop
├── quickstart.md
├── tasks.md
├── contract-tests.lock
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── components/
│   │   └── Rail.tsx                      # props opcionais focusedItemWidth/align (D-008)
│   ├── features/
│   │   ├── shell/AppShell.tsx            # prop opcional backdrop (D-004)
│   │   ├── home/
│   │   │   ├── HomeContent.tsx           # STUB de RowKey já feito; reescrita da composição (billboard/fileiras/linhas)
│   │   │   ├── HomeScreen.tsx            # passa <HomeAmbient/> ao AppShell
│   │   │   ├── HomeBillboard.tsx         # NOVO
│   │   │   ├── HomeTitleCard.tsx         # NOVO (+ selos e camada expandida)
│   │   │   ├── HomeLiveCard.tsx          # NOVO
│   │   │   ├── HomeAmbient.tsx           # NOVO
│   │   │   ├── homeRows.ts               # NOVO — buildHomeRows
│   │   │   ├── homeRowFormats.ts         # NOVO — medidas
│   │   │   ├── cardBadges.ts             # NOVO — regra dos selos
│   │   │   └── HomeContent.home-vitrine-expandida.contract.test.tsx   # CONTRATO 060 (3)
│   │   ├── catalog/
│   │   │   ├── catalogApi.ts             # useRecentlyAdded com cobertura; DiscoveryPick/Dica com backdrop; useContinueProgress; useHomeImages
│   │   │   └── becauseApi.ts             # NOVO — useBecauseYouWatched (D-011)
│   │   └── vod/
│   │       ├── vodShowcaseRows.ts        # STUB de input já feito; fileira 'because' real
│   │       ├── VodShowcaseScreen.tsx     # liga useBecauseYouWatched
│   │       ├── vodShowcaseRows.home-vitrine-expandida.contract.test.ts       # CONTRATO 060 (1)
│   │       └── *.contract.test.* de 052/053/056/057                          # EMENDADOS (D-012)
│   ├── lib/
│   │   ├── catalog/becauseSeed.ts        # STUB → pickBecauseSeed
│   │   ├── catalog/becauseSeed.home-vitrine-expandida.contract.test.ts       # CONTRATO 060 (1)
│   │   ├── catalog/db.ts                 # TmdbTitleRef.backdropUrl?
│   │   ├── metadata/tmdbMapping.ts       # mapSimilar guarda backdrop
│   │   ├── metadata/tmdbDiscovery.ts     # DiscoveryTitle.backdropUrl?
│   │   ├── comingSoon.ts                 # remove vod-because, home-trailer
│   │   └── i18n/messages/{home,vodShowcase,comingSoon}.ts
│   ├── navigation/appNav.ts              # STUB já feito: rails added-movies/added-series/because
│   ├── styles/home.css                   # reescrito (billboard, fileiras, cards, ambiente)
│   └── index.css                         # token --home-expand-duration (se não couber em home.css)
└── e2e/
    ├── home-vitrine-expandida.mjs        # NOVO roteiro com capturas
    └── run.mjs                           # SUITE += home-vitrine-expandida; conferir home-busca-configuracoes, top10-dica,
                                          # carrosseis-filmes-series, vitrine-filmes-series, bem-avaliados, epg-dados-agora
```

**Structure Decision**: frontend único em `tv-web/`; nada em `api/` nem em `CCPlayTv/` além do build normal. Componentes novos ao lado da tela que os usa (`features/home/`); a regra de semente fica em `lib/catalog/` (pura, sem React, perto de `userStateRepository`); o hook de "Porque você assistiu" fica num módulo próprio de `features/catalog/` por causa dos mocks parciais (D-011).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Edição de contratos travados de outras features (052, 053, 056, 057) | O item 69 (absorvido pela spec, decisão do usuário) faz "Porque você assistiu" deixar de ser um slot sempre presente; esses contratos verificavam a ordem/navegação passando pelo slot | "Só na Home" (item 69 parcial) e "fileira sempre presente com cartão orientativo" foram oferecidas; o usuário escolheu emendar os 4 (2026-10-05). Mudança mínima — só o que citava o slot —, retravada e registrada nos 4 planos (D-012) |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (TV física — **gate**, D-015).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run src/features/home src/features/vod src/features/catalog src/lib/catalog src/lib/metadata src/components src/navigation src/lib/i18n
npx tsc -b
npm run lint
npm run build
npm run test:e2e                          # com `npm run dev` na 5173
node e2e/run.mjs --only home-vitrine-expandida --jobs 1
```

Integridade das travas (da raiz do repo):

```powershell
foreach ($s in '060-home-vitrine-expandida','026-home-busca-configuracoes-ds-v14','022-biblioteca-componentes-ds-v14','052-vitrine-filmes-series','053-carrosseis-filmes-series','056-bem-avaliados','057-top10-dica-tmdb','059-detalhe-cinema-filme-serie','035-semelhantes-elenco-ator') { .\.planning\scripts\powershell\check-contract-tests.ps1 -Slug $s }
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (5/5):
`tv-web/src/features/home/HomeContent.home-vitrine-expandida.contract.test.tsx` (3),
`tv-web/src/lib/catalog/becauseSeed.home-vitrine-expandida.contract.test.ts` (1),
`tv-web/src/features/vod/vodShowcaseRows.home-vitrine-expandida.contract.test.ts` (1)

Comando (de `tv-web/`):

```powershell
npx vitest run src/features/home/HomeContent.home-vitrine-expandida.contract.test.tsx src/lib/catalog/becauseSeed.home-vitrine-expandida.contract.test.ts src/features/vod/vodShowcaseRows.home-vitrine-expandida.contract.test.ts
```

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| Home — billboard expandido no "Continuar"; ↓ recolhe e foca o 1º card; ↑ volta e expande | US1/AC1, AC3, AC5; FR-003, FR-006, FR-019 | Fase 3 | `expected null to be 'expanded'` (sem `data-state`) |
| Home — andar pelos cards não reproduz nem faz requisição; o fundo vira o backdrop guardado do card | US1/AC4; FR-007, FR-022, SC-004; Constitution: Foco Sem Becos | Fase 3 | `expected null to be '<id>'` (sem `data-item-id`) |
| Home — voltando com foco num card (por id), abre recolhido no mesmo card | US1/AC6; FR-020; Constitution: Voltar Restaura | Fase 3 | `expected null to be '<id>'` (sem `data-item-id`) |
| `pickBecauseSeed` — concluído mais recente da fonte/tipo; episódio → série; ignora não concluído, outra fonte, tirado do Histórico, episódio sem série | FR-014, US3/AC2–AC3; Constitution: Nunca Inventam Dados | Fase 2 | `Error: not implemented` |
| `buildShowcaseRows` — "Porque você assistiu <título>" real com semente, ausente sem; nenhum slot; mocks removidos | FR-014–FR-016, US3/AC3, SC-008 | Fase 5 | `expected 'slot' to be 'items'` |

Confirmado em 2026-10-05: os 5 vermelhos acima, pelo motivo certo; o resto da área (`src/features/home`, `src/features/vod`, `src/navigation`, `src/lib/catalog`) 776/776 verde; `tsc -b` limpo.

**Contratos de outras features emendados (D-012)** — ficam vermelhos até a Fase 5 (6 testes, só pelo slot ainda existir): `vodShowcaseRows.carrosseis-filmes-series.contract.test.ts`, `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (2), `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` (1), `vodShowcase.bem-avaliados.contract.test.ts` (1), `VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx` (1). Os outros 7 testes desses arquivos seguem verdes. Contratos que **devem continuar verdes sem edição**: 026 (`HomeScreen`, `homeHero`), 022 (`Rail`), 035, 057 (`tmdbDiscovery`, `discoveryRules`), 059.

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/catalog/becauseSeed.ts` (`pickBecauseSeed` lança `not implemented`, tipos `BecauseSeed`/`PickBecauseSeedOptions`), `tv-web/src/features/vod/vodShowcaseRows.ts` (`hasBecause?`/`becauseTitle?` no input, ainda não lidos), `tv-web/src/navigation/appNav.ts` (chaves `added-movies`/`added-series`/`because` em `HomeFocus.rail`), `tv-web/src/features/home/HomeContent.tsx` (as mesmas chaves em `RowKey`, sempre `false` em `rowExists`).

Testes adicionais (escritos no execute, não travados): `homeRows.test.ts`, `cardBadges.test.ts`, `Rail.home-vitrine-expandida.test.tsx` (largura do focado, `align: 'start'`, sem as props = comportamento atual), `becauseApi.test.tsx` (sem chave = zero `fetch`; semente sem semelhantes na lista = sem fileira), `HomeBillboard.test.tsx` (nome acessível exato, `aria-describedby`, Trailer por estado), `HomeLiveCard.test.tsx` (com/sem EPG), `tmdbMapping`/`tmdbDiscovery` (backdrop guardado, sem chave na URL), atualização dos testes existentes que esperavam a Home antiga ou o slot (`HomeContent.test.tsx`, `HomeContent.top10-dica.test.tsx`, `comingSoon.test.ts`, `vodShowcaseRows.discovery.test.ts`, `VodShowcaseScreen.carrosseis.test.tsx`, `VodShowcaseScreen.discovery.test.tsx`, `VodShowcaseScreen.test.tsx`).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (Fase 1) | Concluída — chaves pt/en/es, `homeRowFormats.ts` e token `--home-expand-duration` |
| Fundação (Fase 2) | Concluída — `pickBecauseSeed` (contrato 1/1 verde), `buildHomeRows`, `cardBadges`, `Rail` com largura do focado, `AppShell.backdrop`, backdrop do TMDB guardado, `useHomeImages`/`useContinueCards`/`useRecentlyAdded(enabled)`; nenhuma tela mudou ainda |
| US1 (billboard e fundo) | Concluída — `HomeContent` com billboard que recolhe, fundo ambiente por portal, linhas `dock → hero → fileiras`, restauração por id sem animar, Trailer real, `home-trailer` removido; contratos da Home 3/3 e o da 026 verdes; `top10-dica` E2E verde |
| US2 (cards e expansão) | Concluída — `HomeTitleCard` completo (selos, expansão no foco, Continuar 16:9 com progresso real), `Rail` com `focusedItemWidth`/`align="start"`, `HomeTitleCard.test.tsx` e testes de fileira |
| US3 (fileiras novas) | Concluída — `becauseApi.ts`, fileira "Porque você assistiu" real em Filmes/Séries e no Início, "Ao vivo agora" com `HomeLiveCard` (EPG real), `added-movies`/`added-series` com cobertura, ordem FR-018 por `buildHomeRows`; `vod-because` removido dos mocks |
| Contratos | 060: 5/5 verdes; emendados de 052/053/056/057 verdes; 026, 022, 035 e 059 verdes; todas as travas íntegras |
| Validação (Fase 6) | `tsc -b` e lint limpos; `npx vitest run` 443 arquivos / 2826 testes verdes; `build` e `build:tizen` ok; `node e2e/run.mjs` **40/40** (inclui o novo `home-vitrine-expandida`); revisão de segredos feita |
| Navegador com a lista real (T042) | Executado em 2026-10-06: 0 falhas e 3 itens não verificáveis no navegador (cenário 2, cenário 6 com candidato de trailer e cenário 12 no plano de hardware); ver "Verificação no navegador com a lista real — 2026-10-06" |
| TV física (T043, gate D-015/SC-009) | Declarada pelo usuário como realizada com sucesso em 2026-10-06 (sem medição); FR-028 mantido como está |
| Falta | Nada em tasks (T042, T043 e T044 fechadas); A-001/R-003 (cor da capa ao focar) seguem como estão, pois o usuário não pediu mudança |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | "Filmes/Séries adicionados" leem o índice de busca inteiro de cada tipo (≈240 ms de CPU por tipo no PC na 1ª leitura, mais na TV — bug `tela-principal-filmes-lenta-na-tv`) | Abrir o Início fica lento (SC-007) | Resolvido: (convergência de 2026-10-06) carga adiada para depois do 1º desenho (D-013) e `queryKey` compartilhada com a vitrine; no navegador com a lista real a ação primária ficou focável e a barra chegou depois dos dados adiados; sem medição na TV (passada declarada com sucesso pelo usuário, sem números) |
| R-002 | `Rail` virtualizado com largura variável: posições remedidas a cada foco podem saltar | Fileira "pulando" na TV | Resolvido: (convergência de 2026-10-06) `measure()` só ao mudar o foco e teste do `Rail` verdes; a expansão não anima a largura (fallback FR-028 como padrão); sem medição de fluidez na TV |
| R-003 | Ler a cor da capa baixa de novo a imagem da capa (modo CORS) quando o foco para num card sem backdrop. A constitution proíbe consulta a **serviço externo** por foco; isto é download de imagem já exibida (mesma natureza de rolar e carregar pôsteres), só de capa "sem risco" (059) e depois de 250 ms parado | Interpretação da constitution | Registrado aqui; se o usuário preferir, cair para o gradiente neutro (desligar `useCoverColor` no card) sem mudar o resto |
| R-004 | Testes e E2E não travados que conhecem a Home antiga ou o slot (`HomeContent*.test.tsx`, `comingSoon.test.ts`, `vodShowcaseRows.discovery.test.ts`, `VodShowcaseScreen*.test.tsx`, `e2e/home-busca-configuracoes.mjs`, `top10-dica.mjs`, `carrosseis-filmes-series.mjs`, `vitrine-filmes-series.mjs`, `bem-avaliados.mjs`, `epg-dados-agora.mjs`) | Vermelhos fora do contrato | Resolvido: (convergência de 2026-10-06) atualizados nas fases 3–6; vitest da área verde (257 arquivos, 1635 testes) e E2E 40/40 no registro da Fase 6 |
| R-005 | Contratos emendados de 052/053/056/057 ficam vermelhos entre o plan e a Fase 5 | Suíte vermelha no meio do execute | Resolvido: (convergência de 2026-10-06) as travas de 052/053/056/057 estão íntegras e verdes |
| R-006 | TV física é gate (D-015) | Feature não fecha sem a passada | Resolvido: (convergência de 2026-10-06) passada na TV declarada com sucesso pelo usuário em 2026-10-06 (SC-009), sem números medidos |
| R-007 | Série no billboard/Continuar sem registro local do episódio: sem duração → sem barra | Menos barras que o protótipo | Resolvido: (convergência de 2026-10-06) aceito pela spec (FR-004); a barra só nasce de `primaryProgress` |
| R-008 | `HomeContent.tsx` (≈650 linhas) cresce com billboard, linhas e fileiras novas | Arquivo difícil de manter | Extrair dados para `useHomeData` e o render das fileiras para funções/componentes de apresentação; manter um só `useRemoteNav` (regra da 040) |
| R-009 | `AppShell` é compartilhado por várias telas | Regressão visual em Live/Filmes/Busca | Prop opcional; sem ela o DOM é idêntico; E2E de shell (`shell-visual`, `paridade-visual`) |
| R-010 | Backdrops guardados das respostas do TMDB só aparecem depois da próxima renovação de cada cache (semana/dia/24 h) | Poucas imagens 16:9 no primeiro dia | Aceito (sem consulta nova); cai no pôster + cor |
| R-011 | `useTitleMetadata` do billboard roda com o `catalogApi` real no contrato 026 (id `'movie-7'`) | Exceção na tela | Tolerar id inexistente/erro como "sem metadata" (D-010); o contrato 026 deve seguir verde |
| R-012 | No Xtream a série não tem data de inclusão (`last_modified` é atualização, nunca inclusão — feature 025) | "Séries adicionadas" não aparece em fontes Xtream; só com fonte que informe a data | Aceito: sem dado, a fileira não existe (FR-018); o E2E confirma. Não inventar data a partir de `last_modified` |
| R-013 | ↑ no dock sai para a topbar; ao voltar com ↓ o foco poderia reentrar no dock ("Em breve") | Foco pousando num ícone sem função | Resolvido: (convergência de 2026-10-06) confirmado no navegador com a lista real: ↓ da topbar pousa nas ações do billboard |
| R-014 | `.home-content` tem `overflow: hidden` e as ações do billboard ficam na borda da safe zone | Anel de foco da ação cortado à esquerda (visto na captura) | Resolvido: (convergência de 2026-10-06) `margin-inline` negativo + `padding-inline` iguais (`--space-2`); o anel de foco aparece inteiro nas capturas |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-05 | Fases 1–2 (Setup e Fundação) | T001–T013: textos, medidas, regras puras (`pickBecauseSeed`, `buildHomeRows`, `cardBadges`), `Rail`/`AppShell` com props opcionais, backdrop do TMDB guardado, hooks locais; contrato da semente 1/1, 48 testes novos/ajustados, `tsc` limpo. Desvios: o backdrop do Top 10/Dica vai no mapa `images` do retorno do hook (não em `DiscoveryPick`, para não tocar `selectTop10`/`selectTip` sob contrato 057); `useContinueCards(sourceId)` no lugar de `useContinueProgress`; `.rail-item` sem transição de `transform` — a rolagem do `Rail` é que será suave (`scroll-behavior`, Fase 4), porque animar `transform` com `scrollLeft` instantâneo faz o trilho "pular" | Fase 3 (billboard, fundo, linhas de foco) |
| 2026-10-05 | Fase 3 (US1 — billboard e fundo) | T014–T021: `HomeAmbient`, `HomeBillboard`, `HomeContent` reescrito, `HomeScreen` com portal do fundo, `home-trailer` removido, `home.css` novo, `HomeTitleCard` básico; contratos 3/3 (+026 1/1), `src/features/home` 66/66 estável, `top10-dica` E2E verde com capturas conferidas. Desvios: o fundo é desenhado por portal na camada do `AppShell` **ou inline** (o contrato 060 renderiza `HomeContent` sozinho e exige `.home-ambient img`; `ambientHost` `undefined` = inline, `null` = aguardando a camada); ↓ do dock volta às ações e ↑ do hero passa pelo dock (os testes antigos de topbar ganharam um ↑); o teste do dock "Em breve" passava por acidente e foi endurecido | Fase 4 (cards, selos, expansão) |
| 2026-10-05 | Fase 4 (US2 — cards e expansão) | T022–T027: `HomeTitleCard` completo + `useCachedTitleView`/`useDeferred`, fileiras com card expandido e `align="start"`, selos por leituras únicas, Continuar 16:9 com barra e legenda reais, CSS; `src/features/home` 80/80, `top10-dica` E2E com capturas conferidas. Desvios: o crescimento da largura não é animado (é o fallback FR-028 já como padrão; só a camada expandida faz fade) — a TV decide se vale animar; a rolagem horizontal da fileira é suave por `scroll-behavior` em `.home-row .rail` (instantânea na volta de um destino e com "reduzir movimento"); o ✓ de série só depois de `HOME_DEFERRED_MS` | Fase 5 (fileiras novas, "Porque você assistiu", Ao vivo agora) |
| 2026-10-05 | Fase 5 (US3 — fileiras novas) | T028–T036: `becauseApi.ts` (sem chave TMDB, zero leitura além do estado da chave), "Porque você assistiu" em Filmes/Séries e no Início, `HomeLiveCard` + "Ao vivo agora", `added-movies`/`added-series`, ordem FR-018; contrato 060 5/5 + 6 emendados verdes, travas íntegras, 433 arquivos / 2717 testes, `tsc` limpo. Desvios: um único mapa `titleRows` no `HomeContent` (seleção, direção, fundo e imagens de todas as fileiras de título); `allItems`/`extraImages` calculados a cada render (sem memo com dependências instáveis); 3 testes de EPG da Home migrados de `.channel-row*` para `.home-live-*` | Fase 6 (E2E, build, TV física) |
| 2026-10-05 | Fase 6 (Polish, parcial) | T037–T041: E2E novo na `SUITE`; 6 E2E antigos ajustados (layout novo, ↑ passa pelo dock, "Ao vivo agora", sem slot); vitest 443/2826, `tsc`, lint, `build`, `build:tizen` ok; E2E 40/40 (1ª rodada 34/39, as 5 falhas eram roteiros antigos). Desvios/achados: "Séries adicionadas" não existe no Xtream (R-012); ↓ da topbar agora sempre pousa no billboard (R-013); anel de foco do billboard cortado pelo `overflow` corrigido (R-014); o "Porque você assistiu" positivo ficou nos testes unitários, não no E2E | T043 (TV física, gate) |
| 2026-10-06 | Fase 6 (fechamento) | T043 (passada na TV física, gate D-015, declarada com sucesso pelo usuário, sem números; FR-028 mantido como está) e T044 (docs: Spec V14 seção "Home" já traz a ordem FR-018 com Dica e as duas fileiras de adicionados; protótipo `home()` segue ilustrativo; A-001/R-003 sem mudança; `CLAUDE.md` intocado); status `Implementada` | — |

**PRÓXIMO**: nenhum em tasks (53/53). Rodar `sdd-converge 060-home-vitrine-expandida`. T042 (navegador com a lista real), T043 (TV física) e T044 (docs e status `Implementada`) foram fechadas em 2026-10-06; ver "Passada física na TV — 2026-10-06" e "Verificação no navegador com a lista real — 2026-10-06".

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `.claude/skills/tizen-tv/SKILL.md` — procedimento da passada na TV física (T043); build com `npm run build:tizen` já validado
- `tv-web/src/styles/home.css` — `--home-expand-duration` (FR-028: zerar se a expansão engasgar) e `.home-live-*`; `tv-web/src/features/home/homeRowFormats.ts` (`HOME_AMBIENT_DELAY_MS`, `HOME_DEFERRED_MS`)
- `tv-web/e2e/home-vitrine-expandida-real.mjs` — roteiro com a lista real do `.env` (T042), fora do `test:e2e`; capturas na pasta temporária do sistema (capturas em `tv-web/test-results/home-vitrine-expandida/`)
- `tv-web/src/features/home/HomeContent.tsx`, `HomeLiveCard.tsx`, `HomeTitleCard.tsx`, `src/features/catalog/becauseApi.ts` — código pronto
- `docs/design/design-system/CCPlayTV_Design_System_Spec_v14_Spectrum.md` (seção "Home" já atualizada) e `quickstart.md` (cenários da TV)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Para trocar texto multilinha em arquivo de teste/E2E, use o `Edit` (não um script PowerShell com aspas duplas): `${selector}` e `$` dentro de aspas duplas são expandidos pelo PowerShell, e arquivos CRLF não casam com `\n`.
- Nos scripts PowerShell que usam `[IO.File]::ReadAllText/WriteAllText`, use SEMPRE caminho absoluto: o `cd` do PowerShell não muda o diretório que o .NET usa (um `Mark` com caminho relativo falhou procurando `tv-web\sdd\...`).
- `Get-Content` sem `-Encoding UTF8` mostra os acentos quebrados dos `.ts` no console, mas os arquivos estão corretos; edite com o `Edit`/`Read`, nunca regrave arquivo de código via `Set-Content` sem `-Encoding utf8`.

## Passada física na TV — 2026-10-06

Passada feita na TV QN50Q60DAGXZD, declarada pelo usuário em 06/10/2026 como **realizada com sucesso**. Registro honesto: o resultado vem do relato do usuário, sem números medidos nem capturas; não há medição para citar. Os riscos de hardware desta feature (marcados como "só se prova na TV") ficam encerrados por decisão do usuário.

Fecha o gate D-015 (SC-009). **FR-028 (`--home-expand-duration`) não foi decidido por medição**: o valor atual fica como está. T042 (quickstart no navegador) e T044 (docs e status `Implementada`) foram fechadas no mesmo dia.

## Verificação no navegador com a lista real — 2026-10-06

T042 executada por `node e2e/home-vitrine-expandida-real.mjs` (Chromium 1920 × 1080, `npm run dev`, lista Xtream e chave TMDB do `.env` da raiz; só contagens e rótulos do app na saída, nenhum nome do provedor). Resultado da última rodada: **0 falhas, 3 itens não verificáveis no navegador**.

**Verificado com dado real**
- 7 (boas-vindas): numa rodada com perfil novo, a lista sem progresso nem favoritos abriu o billboard de boas-vindas expandido, com atalhos focáveis.
- 1: "▶ Continuar" com barra e "faltam 1 h 28 min" juntos, só depois de a duração chegar (antes disso, nenhum dos dois); a 1ª fileira no rodapé.
- 3: ↓ recolhe (fileira focada a 56 px da topbar), ↑ expande com a última ação focada, ↑ vai ao dock e à topbar.
- 4: 14 → + 2 ↓ + 8 → seguidos, 0 requisições ao painel ou ao TMDB.
- 8/9: pôster 250 × 375, card expandido 667 × 375, 49 selos ★ todos com nota, 14 selos NOVO, 12 numerais de Top 10; → no último card não sai da fileira.
- 5: voltar de um detalhe reabre a mesma fileira e o mesmo card, por id, com o billboard recolhido.
- 10/11: ordem do FR-018 respeitada (continue > top10-movies > added-movies > tip-movies > because > channels > mylist > top10-series > tip-series > ai); "Ao vivo agora" com 3 canais favoritos; "Porque você assistiu" e Dica de filme presentes na Home **e** na vitrine de Filmes (a vitrine é virtualizada: só aparecem ao percorrer as fileiras); nenhum slot "Em breve".
- 6: a ação Trailer é alcançável; sem candidato fica soft-disabled.
- 12: a camada do player vive dentro do `.screen`, é opaca e fica por cima do Início; ao fechar, o foco volta ao "Continuar".
- 13: en e es com a ação primária e os rótulos das fileiras traduzidos (nenhum em português) e os nomes do provedor intactos (26 e 27 itens comparados por id).
- Checklist: nenhuma credencial ou chave no DOM nem no console, nenhuma URL de painel no console, 0 erros de página.

**Não verificável no navegador**
- 2: título sem backdrop e sem imagem na listagem (a lista real não permite forçar); segue coberto pelo E2E com fixtures e pelo teste do `useCoverColor`.
- 6: camada do trailer com candidato (o título testado não teve candidato).
- 12: o plano de hardware do AVPlay (`video-plane-visible`) nunca vale no navegador de dev; a prova é a passada na TV, declarada pelo usuário.

**Limites do teste.** Progresso (1 filme em andamento, 1 concluído), favoritos (2 filmes, 2 séries) e 3 canais favoritos foram **semeados no IndexedDB** a partir do catálogo real, não produzidos pelo player nem pela pessoa. O catálogo já estava inteiro no aparelho (43 mil filmes, 9,7 mil séries, 2,3 mil canais), então o aviso de cobertura parcial de "Filmes adicionados" não apareceu (correto: cobertura total) e "Ao vivo agora" ficou sem barra de horário (EPG não configurado). "Séries adicionadas" não existe, como esperado no Xtream (R-012). O episódio em andamento de série não foi semeado.

Achados do próprio roteiro, sem relação com o app: o seletor `.source-card-wrap` também envolve o cartão "Adicionar lista"; os dados do billboard chegam adiados (ler texto e barra em instantes diferentes dá falso negativo); a vitrine virtualiza as fileiras; um perfil persistente interrompido deixa o idioma em en/es.

## Resultado Final

Convergida em 2026-10-06 sem achado acionável (`sdd-converge`), com uma observação de manutenção em aberto (R-008, abaixo).

**O que foi construído.** Início no layout "Vitrine expandida": billboard de um título (continuar → favorito → boas-vindas) que recolhe quando o foco desce, com fundo ambiente (backdrop guardado, senão cor da capa da 059, senão neutro), dock no canto, "Continuar" com barra e "faltam X" só com posição e duração reais (`primaryProgress`) e Trailer real (mock `home-trailer` removido). Cards de pôster 250 × 375 com selos (`cardBadges`) que expandem no foco (667 × 375; Continuar 480 × 270 → 600 × 338), Top 10 com numeral, "Ao vivo agora" com EPG real (`HomeLiveCard`), "Filmes adicionados" com cobertura, "Porque você assistiu" (`becauseApi.ts`, sem chave TMDB zero requisição) na Home e em Filmes e Séries (mock `vod-because` removido) e a ordem do FR-018 por `buildHomeRows`. O `Rail` ganhou `focusedItemWidth`/`align` opcionais e o `AppShell`, a prop `backdrop`, sem alterar os outros usos. O backdrop que já vem do TMDB é guardado no cache existente, sem consulta nova e sem mudar o esquema (Dexie segue v16; a v17 não foi usada).

**Verificação da convergência.** Trava de contrato íntegra (5/5) e as de 052, 053, 056, 057, 026, 059 e 022 também; `tsc -b` limpo; `npm run lint` exit 0; vitest da área (home, vod, catalog, lib/catalog, lib/metadata, components, navigation, lib/i18n, movies, series) com 257 arquivos e 1635 testes verdes. O E2E não foi reexecutado na convergência (registro da Fase 6: 40/40) e o roteiro com a lista real passou em 2026-10-06 (0 falhas, 3 itens não verificáveis no navegador).

**Desvios em relação ao plano original.** O backdrop do Top 10/Dica vai no mapa `images` do retorno do hook, não em `DiscoveryPick`; `useContinueCards(sourceId)` no lugar de `useContinueProgress`; o crescimento da largura do card não é animado (o fallback FR-028 virou o padrão); o fundo é desenhado por portal na camada do `AppShell` ou inline; ↓ da topbar sempre pousa no billboard (R-013); "Séries adicionadas" não existe no Xtream (R-012).

**Observação em aberto (R-008).** `HomeContent.tsx` tem 864 linhas (o risco previa ≈650) e a extração prometida (`useHomeData` e o render das fileiras em componentes) não foi feita; mantém um só `useRemoteNav` (D-001). É dívida de manutenção, não um requisito da spec, e fica registrada em R-008 sem `Resolvido:`; o limite de tamanho por lint é o item 49b do backlog.

**Honestidade sobre o gate.** SC-009 (passada na TV física) e a decisão do FR-028 foram fechados por declaração do usuário em 2026-10-06, sem números; SC-007 (≤ 1 s) só foi visto no navegador. O progresso, os favoritos e os canais favoritos do teste com a lista real foram semeados no IndexedDB, não produzidos pelo player.

