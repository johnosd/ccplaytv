---
description: "Tasks da feature 024 — Live TV no Design System V14 (Onda 3)"
---

# Tasks: Live TV no Design System V14 (Onda 3)

**Input**: Documentos de design de `sdd/specs/024-live-tv-ds-v14/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, logic/numero-do-canal.md, logic/foco-live-shell.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend único em `tv-web/`. Comandos `npx vitest`, `npm run …` e `node e2e/…` rodam de dentro de `tv-web/`.
- Tela: `tv-web/src/features/live/`. Shell: `tv-web/src/features/shell/`. Componentes compartilhados: `tv-web/src/components/`. Navegação: `tv-web/src/navigation/`. Catálogo: `tv-web/src/lib/catalog/` e `tv-web/src/features/catalog/catalogApi.ts`. CSS novo: `tv-web/src/styles/live.css`.
- E2E: `tv-web/e2e/*.mjs` e `tv-web/e2e.mjs`.
- Scripts SDD: `.planning/scripts/powershell/`, rodados na raiz do repositório.
- `api/` não é tocado.

---

## Phase 1: Setup

**Purpose**: fechar a incerteza do `num` e registrar o mock novo.

- [x] T001 Verificar o campo `num` de `get_live_streams` contra o painel real, seguindo `research.md` R1 (resposta sem filtro vs. filtrada por duas categorias que não sejam a primeira). Usar a fonte já importada no navegador de desenvolvimento, pedir ao usuário para conduzir se for preciso, e **nunca** ler `docs/m3u/dados.md` nem registrar credencial ou URL. Anotar o resultado (confirmado / refutado / não verificável) em `research.md` e no R-001 de `plan.md`.
- [x] T002 [P] Registrar o mock `epg-guide` ("Guia de programação completo dos canais.", item 42) em `tv-web/src/lib/comingSoon.ts`, com o teste correspondente em `tv-web/src/lib/comingSoon.test.ts`.

**Registro da Fase**:

- Status: Concluída
- Feito: T001 — a única fonte já importada no dev server era uma fixture M3U de debug (`stored`, sem provedor); o usuário apontou a credencial de teste do `.env` da raiz (nunca `docs/m3u/dados.md`); verificado contra um painel Xtream real via script isolado (scratchpad, nunca imprimiu credencial): `num` **refutado** como global (2266 canais, só 5/122 e 0/79 bateram filtrando por categoria) — `sourceNumber` não será capturado; T004/T017 dispensam a parte condicional. T002 — mock `epg-guide` registrado, teste do registro atualizado (4 ids esperados).
- Contrato: sem contrato nesta fase.
- Testes executados: `npx vitest run src/lib/comingSoon.test.ts` → 4/4 verdes.
- Pendências: nenhuma.

---

## Phase 2: Foundational (dados, navegação e componentes)

**Purpose**: tudo que as stories consomem — captura de logo, posição por categoria, número do canal, `switch-top`, e as extensões mínimas dos componentes da 022 e da `TopBar` da 023.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `channelNumberOf — contrato da feature 024 › deriva o número da ordem da fonte, igual em qualquer entrada, e some quando não é derivável`: FR-030, FR-031, SC-005.
- `appNav — contrato da feature 024 › topbar da Live troca de destino de topo sem empilhar, e RETURN volta sempre ao Início`: FR-001, FR-003, D-004.
- `logo do canal — contrato da feature 024 › M3U (tvg-logo) e provedor (stream_icon) capturam o logo do canal; valor inválido vira ausência`: FR-028.
- Comando: `npx vitest run src/features/live/channelNumber.live-tv-ds-v14.contract.test.ts src/navigation/appNav.live-tv-ds-v14.contract.test.ts src/lib/catalog/channelLogo.live-tv-ds-v14.contract.test.ts`

### Implementation

- [x] T003 [P] Capturar `iconUrl` de canal em `classifyEntry` (remover a exclusão `byGroup === 'channel' ? undefined : iconUrl`) em `tv-web/src/lib/catalog/classifier.ts`, e atualizar os comentários de feature 015 que dizem "nunca para canal" em `classifier.ts`, `importPipeline.ts`, `categoryLoader.ts` e `db.ts`. → contrato: logo do canal
- [x] T004 [P] Capturar `iconUrl: normalizeIconUrl(raw.stream_icon)` em `mapLiveEntry`, em `tv-web/src/lib/catalog/xtreamConnector.ts`. ~~Só se a T001 confirmou: capturar também `sourceNumber`~~ — **T001 refutou** (`research.md` R1): `num` não é global, não é capturado. Nenhuma mudança em `categoryLoader.ts`/`toItemRecord` para `sourceNumber`. → contrato: logo do canal
- [x] T005 Inverter os três testes da feature 015 que afirmam "canal nunca captura" (`tv-web/src/lib/catalog/classifier.test.ts:89`, `tv-web/src/lib/catalog/xtreamConnector.test.ts:229`, `tv-web/src/lib/catalog/importPipeline.test.ts:958`), com comentário citando a feature 024 e o R-003.
- [x] T006 Adicionar `categoryPosition?: number` e `sourceNumber?: number` (doc de campo, sem índice, sem bump de versão) em `tv-web/src/lib/catalog/db.ts`. Gravar `categoryPosition: index` no `bulkAdd` de `storeCategoryItems` e de `storeStoredCategory` (só os itens, não os episódios) em `tv-web/src/lib/catalog/catalogRepository.ts`. Ver `data-model.md`.
- [x] T007 Mapear `category_id`, `category_position` e `source_number` em `toItemOut`, em `tv-web/src/features/catalog/catalogApi.ts`. Atualizar o comentário de `icon_url`, que hoje diz "nunca preenchido para canal".
- [x] T008 Implementar `channelNumberOf` e exportar `knownCategoryCount(category): number | undefined` em `tv-web/src/features/live/channelNumber.ts`, seguindo `logic/numero-do-canal.md` §2–§3. → contrato: `channelNumberOf`
- [x] T009 [P] Tratar a ação `switch-top` em `appNavReducer` (troca `screen`, mantém `history` e `activeSource`) em `tv-web/src/navigation/appNav.ts`, e documentar a regra em `sdd/specs/023-shell-navegacao-entrada-ds-v14/logic/navegacao-app.md` com uma nota `**Atualização (feature 024):**`. → contrato: `appNav`
- [x] T010 [P] Adicionar a prop `variant?: 'poster' | 'logo'` (padrão `'poster'`, idêntica a hoje) em `tv-web/src/components/PosterArt.tsx`. Em `'logo'`, o placeholder mostra as iniciais do título (até 3 caracteres, maiúsculas) em vez de "pôster". A lógica de falha/`lazy` continua a mesma (D-007).
- [x] T011 [P] Em `tv-web/src/components/ChannelRow.tsx`:
  - `number` passa a ser opcional (ausente = nenhuma coluna de número desenhada com texto);
  - PosterArt com `variant="logo"`;
  - novas props `nameClassName?`, `favorite?` (estrela) e `unavailable?` (selo "Indisponível" + `is-soft-disabled`).

  O slot "Agora" continua sempre presente e vazio sem dado.
- [x] T012 [P] Em `tv-web/src/components/SideCategoryNav.tsx`: prop `focusedRef?: Ref<HTMLButtonElement>`, aplicada na entrada focada (para `useScrollFocusedIntoView`), e campo por entrada `pinnedBadge?: boolean` (padrão `true`, idêntico a hoje).
- [x] T013 [P] Em `tv-web/src/features/shell/TopBar.tsx`: prop `currentItem?: 'home' | TopDestination` (padrão `'home'`) define `topbar-item--current`/`aria-current`, e prop `onGoHome?: () => void` é chamada por OK em "Início" quando ele não é o atual. OK no destino atual não faz nada. O `HomeScreen` não muda.

### Testes da Fase

- [x] T014 [P] Teste de `categoryPosition` gravado na ordem recebida pelas duas escritas, em `tv-web/src/lib/catalog/catalogRepository.test.ts`, e de que `toItemOut` expõe os três campos novos, via um hook existente, em `tv-web/src/features/catalog/catalogApi.test.tsx`.
- [x] T015 [P] Teste de `knownCategoryCount` por `fetchMode` em `tv-web/src/features/live/channelNumber.test.ts`.
- [x] T016 [P] Testes das variantes e props novas em `tv-web/src/components/PosterArt.test.tsx`, `ChannelRow.test.tsx`, `SideCategoryNav.test.tsx` e `tv-web/src/features/shell/TopBar.test.tsx` (`currentItem="live"`: "TV ao vivo" com `aria-current`; OK em "Início" chama `onGoHome`).
- [x] T017 ~~Se a T001 confirmou: teste de `sourceNumber`~~ — **dispensada**: T001 refutou o `num` como global, `sourceNumber` não é capturado (nada a testar).

**Critério de Conclusão**:

- O comando do Contrato da Fase dá 3/3 verdes, e `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 024-live-tv-ds-v14` está íntegro.
- Os contratos travados da 022 e da 023 continuam verdes: `ContentCard.biblioteca-componentes.contract.test.tsx`, `appNav.shell-navegacao.contract.test.ts`, `ProfilesScreen.shell-navegacao.contract.test.tsx`.
- Suíte de `src/lib/catalog`, `src/components`, `src/features/shell` e `src/navigation` verde, e `tsc -b` limpo.

**Checkpoint**: Fundação pronta. Nenhuma tela mudou ainda de aparência.

**Registro da Fase**:

- Status: Concluída
- Feito: iconUrl capturado para canal nos dois caminhos (M3U `classifyEntry`, provedor `mapLiveEntry`), sem `sourceNumber` (T001 refutou); 3 testes da 015 invertidos; `categoryPosition` gravado por `storeCategoryItems`/`storeStoredCategory`; `category_id`/`category_position`/`source_number` mapeados em `toItemOut`; `channelNumberOf`/`knownCategoryCount` implementados; `switch-top` tratado no `appNavReducer` (nota inline em `logic/navegacao-app.md` da 023); `PosterArt` ganhou `variant="logo"` (iniciais até 3 caracteres); `ChannelRow` ganhou `number?`/`nameClassName`/`favorite`/`unavailable`; `SideCategoryNav` ganhou `focusedRef`/`pinnedBadge`; `TopBar` ganhou `currentItem`/`onGoHome`. Testes adicionais (T014–T016) cobrindo tudo isso.
- Contrato: `npx vitest run src/features/live/channelNumber.live-tv-ds-v14.contract.test.ts src/navigation/appNav.live-tv-ds-v14.contract.test.ts src/lib/catalog/channelLogo.live-tv-ds-v14.contract.test.ts` → 3/3 verdes; `check-contract-tests.ps1 -Slug 024-live-tv-ds-v14` íntegro (5/5).
- Testes executados: contratos travados da 022/023 (`ContentCard...`, `appNav.shell-navegacao...`, `ProfilesScreen.shell-navegacao...`) → 6/6 verdes; suíte de `src/lib/catalog`, `src/components`, `src/features/shell`, `src/navigation` → 58 arquivos, 508/508 verdes; `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Navegar e assistir canais no layout V14 sob a topbar (Priority: P1) 🎯 MVP

**Objetivo**: a Live abre sob a topbar, em 3 colunas V14 (categorias / canais / preview informativo), e continua assistindo exatamente como hoje.

**Independent Test**: topbar → "TV ao vivo" → entrar numa categoria → OK num canal abre o player → RETURN volta ao mesmo canal → RETURN na trilha volta ao Início; ↑ em "★ Favoritos" leva à topbar e ↓ volta.

### Contrato da Fase

- `LiveScreen — contrato da feature 024 › sob a topbar: ↑ em ★ Favoritos sobe para "TV ao vivo", ↓ volta ao mesmo item, RETURN na topbar volta ao Início`: US1/AC1-AC2, US1/AC5, FR-001..FR-003, SC-003.
- Comando: `npx vitest run src/features/live/LiveScreen.live-tv-ds-v14.contract.test.tsx -t "sob a topbar"`
- Precisa continuar verde: `npx vitest run src/features/live/LiveScreen.busca-categoria.contract.test.tsx` (018, travado).

### Implementation

- [x] T018 [US1] Compor o shell dentro da `LiveScreen` pela prop `shell`, seguindo `logic/foco-live-shell.md` §1–§3, em `tv-web/src/features/live/LiveScreen.tsx`:
  - estado `zone`/`topbarItem`;
  - `AppShell` + `TopBar currentItem="live"`, com `active` só quando `zone === 'topbar'`;
  - `HintBar` com OK Assistir / segurar OK ou amarelo Favoritar / RETURN Voltar;
  - ↑ no índice 0 da trilha sobe para a topbar;
  - `useRemoteNav` da tela recebe `{}` com a topbar ativa;
  - RETURN na topbar chama `onBack`.

  Os estados de topo (carregando/erro/vazio) também ficam dentro da moldura. → contrato: sob a topbar
- [x] T019 [US1] Passar `shell` em `tv-web/src/App.tsx`, no `case 'live'`:
  - `sourceName: source.display_name`;
  - `onGoHome: goBack`;
  - `onSwitchTop: (d) => dispatch({ type: 'switch-top', screen: { name: d } })`;
  - `onOpenProfiles: () => dispatch({ type: 'open-profiles' })`.
- [x] T020 [US1] Redesenhar a apresentação, sem tocar nos hooks (D-001), em `tv-web/src/features/live/LiveScreen.tsx`:
  - cabeçalho "TV ao vivo" + `Chip` da entrada aberta + `Chip` "N canais" só quando conhecido (FR-006);
  - coluna de categorias com `SideCategoryNav`: "★ Favoritos" com ícone `favorite`, `pinnedBadge: false` e contagem `favoriteIds.size`; "Todos" pinned, sem badge e sem número; categorias da fonte com `knownCategoryCount` (FR-007/FR-008); `focusedRef` ligado a `useScrollFocusedIntoView`;
  - lista virtualizada de `ChannelRow` dentro de um `<button>` por linha, com `.tv-focus` no botão e `nameClassName="live-item-name"` (D-008);
  - `LIVE_ITEM_ROW_HEIGHT` recalculado pela linha real (R-006);
  - preview informativo em `.live-preview-panel` (logo, nome, grupo, slot "Agora" vazio), ou a orientação neutra sem `<button>` quando não há canal (FR-013, FR-018).
- [x] T021 [US1] Reescrever todos os estados com `ErrorState`/`EmptyState`/`Spinner` e ligar SELECT à ação focada (R-005, FR-027), em `tv-web/src/features/live/LiveScreen.tsx`:
  - carregando categorias, erro de categorias (Tentar de novo / Voltar), lista sem canais;
  - carregando categoria, falha (Tentar de novo), fonte ausente (Ressincronizar);
  - "Todos" vazio, grupo vazio.

  "★ Favoritos" vazio continua em `FavoritesEmptyState`.
- [x] T022 [US1] Criar `tv-web/src/styles/live.css`, só com tokens, e importá-lo em `tv-web/src/main.tsx` depois de `components.css`:
  - 3 colunas e cabeçalho sob a safe zone;
  - linha com glow só no foco;
  - preview maior que as colunas auxiliares (§25);
  - sem `:has()`, `backdrop-filter` ou `will-change` em massa.

  Remover de `tv-web/src/features/screens.css` as regras `.live-*` que ficarem sem uso, mantendo `.player-zap-columns` e a regra do plano de hardware.
- [x] T023 [US1] Conferir que, com o player aberto, a `LiveScreen` não renderiza a moldura, portanto nada pinta sobre o plano de hardware (FR-004/FR-005, D-002). Se algum elemento da moldura sobreviver, somar a raiz à regra `:root.video-plane-visible …` em `tv-web/src/features/screens.css`, no padrão já usado.

### Testes da Fase

- [x] T024 [US1] Atualizar seletores em `tv-web/src/features/live/LiveScreen.test.tsx` (`.live-item` → linha de canal / `.side-category-nav-item`, etc.), sem remover asserção de comportamento. Toda asserção que deixar de fazer sentido vai para Riscos e Decisões antes de mudar.
- [x] T025 [P] [US1] Testes novos em `tv-web/src/features/live/LiveScreen.test.tsx`:
  - contagem só quando conhecida, com "Todos" sem número e categoria nunca lida sem "0" (FR-008);
  - chip "N canais" (FR-006);
  - SELECT aciona "Tentar de novo"/"Voltar" nos estados de topo (R-005);
  - com `shell`, player aberto sem `.topbar` (FR-004);
  - RETURN na trilha chama `onBack`;
  - SC-002: em cada estado (carregando, erro, fonte ausente, grupo vazio, "Todos" vazio, "★ Favoritos" vazio, lista, preview), existe **exatamente um** elemento com `.tv-focus` na tela, e SELECT o aciona. Um teste parametrizado à mão (sem `.each`), percorrendo os estados.
- [x] T026 [P] [US1] Teste de `App` (ou do redutor via `App.tsx`) de que "Filmes" na topbar da Live abre Filmes e RETURN volta ao Início, em `tv-web/src/navigation/appNav.test.ts` (incluindo `open-profiles` a partir da Live e RETURN de volta a ela).

**Critério de Conclusão**:

- O comando do Contrato da Fase dá 1/1 verde, o contrato travado da 018 dá 4/4, e `check-contract-tests.ps1 -Slug 024-live-tv-ds-v14` e `-Slug 018-busca-por-categoria` estão íntegros.
- `LiveScreen.test.tsx` verde, isolado e na suíte.
- A Live abre sob a topbar no navegador (1920×1080) e os passos 1–3 e 8 do `quickstart.md` funcionam.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída
- Feito: shell composto na `LiveScreen` via prop `shell` (topbar `currentItem="live"`, escopos topbar/conteúdo, ↑ em ★ Favoritos sobe à topbar, RETURN nela volta ao Início); `App.tsx` conecta `shell` no `case 'live'`; 3 colunas redesenhadas com `SideCategoryNav`/`ChannelRow`/preview; cabeçalho "TV ao vivo" + chips; todos os estados de topo/conteúdo reescritos com `ErrorState`/`EmptyState`/`Spinner`, com o bug pré-existente R-005 corrigido (SELECT agora aciona a ação focada nos 3 estados de topo, antes mortos); `live.css` criado e `screens.css` perdeu as regras `.live-*` mortas/movidas; confirmado que o player aberto nunca renderiza a moldura (D-002). Verificado num Chromium real (Playwright) além dos testes: shell, foco topbar↔trilha, switch-top, RETURN em camadas.
- Contrato: `npx vitest run src/features/live/LiveScreen.live-tv-ds-v14.contract.test.tsx -t "sob a topbar"` → 1/1 verde; `LiveScreen.busca-categoria.contract.test.tsx` → 4/4 verde; `check-contract-tests.ps1` de ambos íntegro.
- Testes executados: `LiveScreen.test.tsx` → 67/67 (isolado e na suíte, 1 flake pré-existente sob paralelismo confirmado à parte); `tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 4: User Story 3 - Zapping, favoritos e busca preservados no visual novo (Priority: P1)

**Objetivo**: zapping (016), favoritos por gesto (013), busca por categoria e "Todos" (018), prefetch (010/015) e ciclo de vida (020) idênticos em comportamento, no visual V14.

**Independent Test**: `zapping-live-tv.mjs`, `busca-por-categoria.mjs` e `favoritos.mjs` verdes; contrato da 018 sem edição.

### Contrato da Fase

- Nenhum contrato novo da 024. Precisam continuar verdes: `LiveScreen.busca-categoria.contract.test.tsx` (018) e `PlayerLayer.ciclo-vida-player.contract.test.tsx` (020).
- Comando: `npx vitest run src/features/live/LiveScreen.busca-categoria.contract.test.tsx src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx`

### Implementation

- [x] T027 [US3] `renderColumns(withPreview)` em `tv-web/src/features/live/LiveScreen.tsx` (D-009, `logic/foco-live-shell.md` §5):
  - a tela passa `true`, o `topLayer` do zapping passa `false`;
  - zapping em 2 colunas V14, sem topbar;
  - → no canal, dentro do zapping, mantém o comportamento atual.

  Estilo do `.player-zap-columns` em `live.css`, com o vídeo escurecido atrás.
- [x] T028 [US3] Trocar o glifo 🔍 do `.search-icon-button` por `Icon name="search"`, mantendo classe, `aria-label` e comportamento, e restilizar `.search-field`/status/cobertura com tokens, em `tv-web/src/features/live/LiveScreen.tsx` e `tv-web/src/styles/live.css`.
- [x] T029 [US3] Conferir que segurar OK, a tecla amarela, `FavoritesEmptyState`, `FavoritesUnresolvedNote`, `FavoriteHint`, o aviso de divergência de contagem, o aviso de conteúdo antigo e o `useCategoryFocusPrefetch` continuam ligados exatamente como antes, e restilizar só o necessário, em `tv-web/src/features/live/LiveScreen.tsx`.

### Testes da Fase

- [x] T030 [US3] Atualizar seletores em `tv-web/src/features/live/LiveScreen.favorites.test.tsx` e nos testes de zapping de `LiveScreen.test.tsx`, sem remover asserção.
- [x] T031 [P] [US3] Teste de que o zapping não tem `.live-preview-panel` nem `.topbar`, e de que ↑ em "★ Favoritos" dentro do zapping não muda nada, em `tv-web/src/features/live/LiveScreen.test.tsx`.

**Critério de Conclusão**:

- Os contratos da 018 (4/4) e da 020 (4/4) verdes e íntegros.
- `LiveScreen.test.tsx` e `LiveScreen.favorites.test.tsx` verdes; falha só sob paralelismo precisa passar isolada, e isso é registrado.
- Passos 5–7 do `quickstart.md` funcionam no navegador.

**Checkpoint**: nada do que a Live fazia antes regrediu.

**Registro da Fase**:

- Status: Concluída
- Feito: `renderColumns(withPreview)` — zapping chama com `false` (sem preview, sem topbar, D-009), tela normal com `true`; ícone de busca trocado para `Icon name="search"` mantendo classe/comportamento; ↑ em "★ Favoritos" dentro do zapping sem efeito, mesmo com `shell` (guarda `shell && !zapOpen`); favoritos/busca/prefetch/ciclo de vida confirmados intactos (nenhum desses hooks foi tocado).
- Contrato: `npx vitest run src/features/live/LiveScreen.busca-categoria.contract.test.tsx src/components/PlayerLayer.ciclo-vida-player.contract.test.tsx` → 5/5 verdes (4+1); ambas travas íntegras.
- Testes executados: `LiveScreen.test.tsx` → 67/67; `LiveScreen.favorites.test.tsx` → 16/16 (isolado; teste (b) confirmado como o mesmo flake pré-existente sob paralelismo, documentado desde a feature 013).
- Pendências: nenhuma.

---

## Phase 5: User Story 2 - Preview com ações do canal focado (Priority: P2)

**Objetivo**: coluna 2 com "Assistir", "Favoritar"/"Favorito" e "Guia completo" ("Em breve").

**Independent Test**: → no canal chega a "Assistir"; Favoritar alterna com toast e estrela; Guia mostra "Em breve"; ← volta ao canal; Assistir abre o player.

### Contrato da Fase

- `LiveScreen — contrato da feature 024 › preview: sem canal não tem ação; → leva a "Assistir", favoritar alterna o rótulo, ← volta ao canal, Assistir abre o player`: US2/AC1-AC3, US2/AC5-AC6, FR-014..FR-016, FR-018.
- Comando: `npx vitest run src/features/live/LiveScreen.live-tv-ds-v14.contract.test.tsx -t "preview"`

### Implementation

- [x] T032 [US2] Adicionar `col = 2` e `previewAction` em `tv-web/src/features/live/LiveScreen.tsx`, seguindo `logic/foco-live-shell.md` §2–§4:
  - → num canal, fora do zapping, entra em "Assistir";
  - ↑/↓ com clamp entre as ações;
  - ← ou RETURN voltam ao canal;
  - ao trocar de entrada, `col = 1` e `previewAction = 0`;
  - canal que sumiu com `col === 2` volta para `col = 1`;
  - linha de origem com `is-selected` enquanto o foco está no preview. → contrato: preview
- [x] T033 [US2] Ações do preview (`Button` da 022 ou `button` com as classes V14) em `tv-web/src/features/live/LiveScreen.tsx`:
  - "Assistir" usa o mesmo caminho de OK no canal;
  - "Favoritar"/"Favorito" chama `toggleFocusedFavorite`, com o rótulo pelo `favoriteIds`;
  - "Guia completo" tem `is-soft-disabled` e mostra o toast `Em breve — ${getComingSoon('epg-guide').message}`;
  - canal sem reprodução: "Assistir" com `is-soft-disabled` e o toast atual (FR-019). → contrato: preview
- [x] T034 [US2] Estilo do preview (ações verticais, estados focado, soft disabled e pressionado) em `tv-web/src/styles/live.css`.

### Testes da Fase

- [x] T035 [P] [US2] Testes em `tv-web/src/features/live/LiveScreen.test.tsx`:
  - "Guia completo" mostra o toast "Em breve" e não navega;
  - "Assistir" soft disabled num canal sem reprodução mostra o toast e não chama `fetchPlayback`;
  - segurar OK no preview não favorita;
  - canal desfavoritado dentro de "★ Favoritos" com o foco no preview devolve o foco a um canal vizinho ou ao estado vazio, nunca a um preview órfão.

**Critério de Conclusão**:

- O comando do Contrato da Fase dá 1/1 verde, o comando dos contratos da 024 dá 5/5, e `check-contract-tests.ps1 -Slug 024-live-tv-ds-v14` está íntegro.
- Passo 4 do `quickstart.md` funciona no navegador.

**Checkpoint**: preview com ações funcional.

**Registro da Fase**:

- Status: Concluída
- Feito: `col` estendido pra `0|1|2` com `previewAction`; → do canal (fora do zapping, com canal ativo) entra no preview em "Assistir"; ↑/↓ movem entre as 3 ações; ← ou RETURN voltam ao canal; `effectiveCol` cai pra 1 quando o canal ativo some (nunca preview órfão); "Assistir"/"Favoritar"/"Guia completo" implementados (Guia como mock registrado, item 42); estilo `.live-preview-action` em `live.css`. Verificado num Chromium real (Playwright): glow no botão focado, alternância Favoritar/Favorito.
- Contrato: `npx vitest run src/features/live/LiveScreen.live-tv-ds-v14.contract.test.tsx -t "preview"` → 1/1 verde; os 5 contratos da 024 → 5/5 verdes; trava íntegra.
- Testes executados: `LiveScreen.test.tsx` → 67/67; `LiveScreen.favorites.test.tsx` → 16/16 (com o novo teste (h2): desfavoritar o único favorito pelo preview volta pra col 1, sem preview órfão).
- Pendências: nenhuma.

---

## Phase 6: User Story 4 - Logo e número de canal reais (Priority: P2)

**Objetivo**: linha, preview e zapping mostram o logo declarado (ou iniciais) e o número derivado (ou nenhum).

**Independent Test**: fonte com logos → categoria mostra logos; logo quebrado mostra iniciais; o mesmo canal tem o mesmo número na categoria, em "Todos" e em "★ Favoritos".

### Contrato da Fase

- Já verdes desde a Fase 2: `channelNumberOf` e logo do canal. Esta fase liga os dois à tela.

### Implementation

- [x] T036 [US4] Passar `logoUrl={channel.icon_url ?? undefined}` e `number={channelNumberOf(channel, categories) ?? undefined}` para cada `ChannelRow`, na lista e no zapping, e o mesmo logo e número ao preview, em `tv-web/src/features/live/LiveScreen.tsx`. `categories` é a lista já carregada por `useCategoryList`; nenhuma leitura nova.
- [x] T037 [US4] Garantir que nenhuma URL de logo apareça em texto visível, `aria-label`, log ou mensagem de erro (FR-032). A `<img>` usa `alt=""`, como já faz. Revisar os `console.*` e os toasts tocados.

### Testes da Fase

- [x] T038 [P] [US4] Testes em `tv-web/src/features/live/LiveScreen.test.tsx`:
  - linha com `icon_url` monta `<img>`, e sem ele mostra as iniciais;
  - o mesmo canal (mesmo `category_id`/`category_position`) mostra o mesmo número numa categoria e em "Todos";
  - categoria anterior não lida deixa o canal sem número, e nunca aparece "000".
- [x] T039 [P] [US4] Teste de ponta a ponta no repositório (`fake-indexeddb`) em `tv-web/src/lib/catalog/categoryLoader.test.ts`: ler uma categoria de provedor e uma `stored` grava `iconUrl` e `categoryPosition` de canal na ordem da fonte.

**Critério de Conclusão**:

- Contratos da 024 com 5/5 verdes e íntegros; T038/T039 verdes.
- Passos 9–10 do `quickstart.md` funcionam no navegador.

**Checkpoint**: todas as user stories funcionais.

**Registro da Fase**:

- Status: Concluída
- Feito: `logoUrl`/`number` conectados na lista, zapping e preview via `channel.icon_url`/`channelNumberOf(channel, categories)`; nenhuma URL de logo em texto/aria-label/log (só `<img src>`); testes de logo/número em `LiveScreen.test.tsx` (img vs. iniciais, mesmo número em categoria e "Todos", categoria anterior não lida deixa sem número) e ponta a ponta em `categoryLoader.test.ts` (provedor e `stored` gravam `iconUrl`/`categoryPosition` na ordem da fonte). Verificado num Chromium real (Playwright): iniciais como placeholder de logo.
- Contrato: já verdes desde a Fase 2 (`channelNumberOf`, logo do canal) — continuam 5/5, trava íntegra.
- Testes executados: `LiveScreen.test.tsx` → 67/67; `categoryLoader.test.ts` → 17/17.
- Pendências: nenhuma.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: E2E, gates de build, documentação canônica.

- [x] T040 Atualizar seletores de `tv-web/e2e/zapping-live-tv.mjs`, `tv-web/e2e/busca-por-categoria.mjs` e `tv-web/e2e/favoritos.mjs` (e de `ciclo-vida-player.mjs`/`m3u-sob-demanda.mjs`, se tocarem a Live), sem perder asserção de comportamento (FR-033, R-002). O override do Chromium no Windows é temporário e nunca vai para commit.
- [x] T041 Conferir `tv-web/e2e/shell-visual.mjs` e `tv-web/e2e/paridade-visual.mjs`: a topbar ganhou um destino atual novo e a Live mudou de layout por decisão. Atualizar as referências de captura da Live com registro em Riscos e Decisões, nunca silenciosamente.
- [x] T042 Rodar a suíte completa (`npm run test`), `npx tsc -b`, `npm run lint`, `npm run build` e `npm run build:tizen`. Se o build emitir arquivo novo, ele entra em `tizen_web_project.yaml` (o guard do `sync-tizen.mjs` acusa).
- [x] T043 Adicionar a nota inline `**Atualização (feature 024):**` em `sdd/adr/ADR-011-adocao-design-system-v14-spectrum.md` §6: o número passa a ser derivado de ordem da categoria + posição, some quando não é derivável, e o `num` do painel entra só se confirmado (resultado da T001).
- [x] T044 Executar `quickstart.md` inteiro no navegador em 1920×1080, incluindo o checklist da constitution.
- [x] T045 Criar `tv-web/e2e/live-tv-ds-v14.mjs`, no padrão dos outros scripts:
  - topbar ↔ Live (↑/↓, RETURN ao Início, "Filmes" e RETURN ao Início);
  - preview (Assistir, Favoritar, Guia "Em breve", ← ao canal);
  - logo quebrado sem ícone de imagem quebrada;
  - número igual em categoria, "Todos" e "★ Favoritos";
  - numa categoria com 500 canais, linhas montadas limitadas à janela mais o overscan (SC-004, R-006), medidas no palco 1920×1080;
  - SC-002 num Chromium real: após cada passo do roteiro acima, `document.querySelectorAll('.tv-focus').length === 1`.
- [x] T046 Com `npm run dev` recém-iniciado, rodar `npm run test:e2e` e todos os `node e2e/*.mjs` do `quickstart.md`, e registrar o resultado.
- [x] T047 **Ad-hoc, descoberta ao rodar T040/T041**: `tv-web/e2e/capa-real.mjs` (feature 015) também toca a Live TV e não estava listado no plan.md. Corrigido: o cenário "Live TV: canal nunca mostra capa" invertia o próprio FR-009 que a feature 024 (R-003) reverte por decisão do usuário — vira "canal AGORA mostra o logo declarado"; seletor de entrada na categoria trocado de `.live-item:not(.live-item-favorites)` para `.side-category-nav-item.tv-focus`; asserção de `<img>` trocada de `.live-item img` (count 0) para `.live-channel-row img` (count 1). 20/20 verificações verdes. Registrado em `plan.md` R-010.

### Checklist de Release

- [x] Fase 1 (Setup) concluída, com o R-001 registrado
- [x] Fase 2 (Foundational) concluída
- [x] Fase 3 (US1) concluída
- [x] Fase 4 (US3) concluída
- [x] Fase 5 (US2) concluída
- [x] Fase 6 (US4) concluída
- [x] Testes de contrato da 024 todos verdes na suíte completa, e `check-contract-tests.ps1 -Slug 024-live-tv-ds-v14` íntegro
- [x] Contratos travados da 018, 020, 022 e 023 verdes e íntegros (`check-contract-tests.ps1` para cada slug)
- [x] `npm run test`, `tsc -b`, `lint`, `build` e `build:tizen` limpos (flakes conhecidos confirmados isolados: `LiveScreen.test.tsx` T010, `LiveScreen.favorites.test.tsx` (b), `MoviesScreen.favorites.test.tsx` — 88/88 isolados)
- [x] E2E (`npm run test:e2e` + scripts da Live + `live-tv-ds-v14.mjs`) verdes num dev server recém-iniciado (9 scripts encadeados, todos verdes)
- [x] `quickstart.md` executado com sucesso, checklist da constitution incluído (7/7 itens, com evidência de cada um)
- [x] ADR-011 §6 com a nota inline
- [ ] Passada na TV física com a skill `tizen-tv`: **recomendada, não gate**; **não realizada nesta sessão** — sem acesso à TV física (QN50Q60DAGXZD) neste ambiente. Registrado como pendência aberta, não bloqueante para a convergência.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências. A T001 decide se a T004 e a T017 capturam `sourceNumber`; o resto não espera por ela.
- **Foundational (Fase 2)**: depende do Setup e bloqueia todas as user stories.
- **US1 (Fase 3)**: depende da Fase 2. É o MVP.
- **US3 (Fase 4)**: depende da Fase 3, porque é o mesmo arquivo `LiveScreen.tsx` e o mesmo `renderColumns`.
- **US2 (Fase 5)**: depende da Fase 3 (coluna do preview já existe).
- **US4 (Fase 6)**: depende das Fases 2 e 3.
- **Polish (Fase 7)**: depende de todas.

### Parallel Opportunities

- Fase 2: T003, T004, T009, T010, T011, T012 e T013 mexem em arquivos diferentes.
- Fases 3 a 6 tocam quase sempre `LiveScreen.tsx`: rodar em sequência, não em paralelo.

---

## Implementation Strategy

### MVP First (User Story 1)

1. Fases 1 e 2.
2. Fase 3 (US1): a Live V14 sob a topbar, assistindo como antes.
3. **PARAR E VALIDAR**: contrato da topbar, contrato da 018 e passos 1–3/8 do quickstart.

### Incremental Delivery

1. US3 logo depois do MVP: sem ela, a onda não pode ser entregue (critério do roteiro).
2. Depois US2 (preview com ações) e US4 (logo e número na tela).
3. Polish com E2E completos.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- Nunca editar arquivo listado em qualquer `contract-tests.lock`.
- Commitar após cada task ou grupo lógico coerente.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
