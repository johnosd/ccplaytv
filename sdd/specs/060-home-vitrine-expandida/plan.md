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

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | "Filmes/Séries adicionados" leem o índice de busca inteiro de cada tipo (≈240 ms de CPU por tipo no PC na 1ª leitura, mais na TV — bug `tela-principal-filmes-lenta-na-tv`) | Abrir o Início fica lento (SC-007) | Carga adiada para depois do 1º desenho (D-013); `queryKey` compartilhada com a vitrine; medir na TV |
| R-002 | `Rail` virtualizado com largura variável: posições remedidas a cada foco podem saltar | Fileira "pulando" na TV | `measure()` só ao mudar o foco; transição de `transform`; teste do `Rail`; fallback FR-028 |
| R-003 | Ler a cor da capa baixa de novo a imagem da capa (modo CORS) quando o foco para num card sem backdrop. A constitution proíbe consulta a **serviço externo** por foco; isto é download de imagem já exibida (mesma natureza de rolar e carregar pôsteres), só de capa "sem risco" (059) e depois de 250 ms parado | Interpretação da constitution | Registrado aqui; se o usuário preferir, cair para o gradiente neutro (desligar `useCoverColor` no card) sem mudar o resto |
| R-004 | Testes e E2E não travados que conhecem a Home antiga ou o slot (`HomeContent*.test.tsx`, `comingSoon.test.ts`, `vodShowcaseRows.discovery.test.ts`, `VodShowcaseScreen*.test.tsx`, `e2e/home-busca-configuracoes.mjs`, `top10-dica.mjs`, `carrosseis-filmes-series.mjs`, `vitrine-filmes-series.mjs`, `bem-avaliados.mjs`, `epg-dados-agora.mjs`) | Vermelhos fora do contrato | Atualizar no mesmo passo da mudança, citando a 060 (tasks das fases 3–6) |
| R-005 | Contratos emendados de 052/053/056/057 ficam vermelhos entre o plan e a Fase 5 | Suíte vermelha no meio do execute | Esperado e documentado (D-012); a Fase 5 os deixa verdes sem editá-los |
| R-006 | TV física é gate (D-015) | Feature não fecha sem a passada | Rodar `tizen-tv` depois do E2E; se não der, decisão explícita do usuário com risco registrado aqui |
| R-007 | Série no billboard/Continuar sem registro local do episódio: sem duração → sem barra | Menos barras que o protótipo | Aceito pela spec (FR-004); nunca buscar episódios só para a barra |
| R-008 | `HomeContent.tsx` (≈650 linhas) cresce com billboard, linhas e fileiras novas | Arquivo difícil de manter | Extrair dados para `useHomeData` e o render das fileiras para funções/componentes de apresentação; manter um só `useRemoteNav` (regra da 040) |
| R-009 | `AppShell` é compartilhado por várias telas | Regressão visual em Live/Filmes/Busca | Prop opcional; sem ela o DOM é idêntico; E2E de shell (`shell-visual`, `paridade-visual`) |
| R-010 | Backdrops guardados das respostas do TMDB só aparecem depois da próxima renovação de cada cache (semana/dia/24 h) | Poucas imagens 16:9 no primeiro dia | Aceito (sem consulta nova); cai no pôster + cor |
| R-011 | `useTitleMetadata` do billboard roda com o `catalogApi` real no contrato 026 (id `'movie-7'`) | Exceção na tela | Tolerar id inexistente/erro como "sem metadata" (D-010); o contrato 026 deve seguir verde |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: —

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- (nenhum ainda)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)
