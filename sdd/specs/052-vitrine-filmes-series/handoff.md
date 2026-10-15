# Handoff — 052-vitrine-filmes-series

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. React 19 + TS + Vite em `tv-web/`, alvo Tizen 9 (`chrome108` não remover).
- Próximo comando: `/sdd-execute 052-vitrine-filmes-series`. Backlog: **Planejada** (0/44 itens — o script conta também o checklist de release). Modo sugerido: **pausado por fase**, com a Fase 5 (integração) como ponto de validação no localhost.
- **Fora desta sessão** (reler antes de depender): `docs/design/design-system/CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` modificado e sem commit; a árvore tem trabalho sem commit de 048/049/050/051 (Live, `components.css`, `live.css`, `Stage.tsx`, `screen-margins.css`, `font-scale.css`, `VodCatalogScreen.tsx`/`vod.css` da 050). **Não** reverter nem "consertar" nada disso.
- Existe também a `051-detalhe-filme-paridade-v14` (Planejada, de outra sessão): não toca esta feature, mas mexe em detalhes; evite editar `MovieDetailScreen`.

## O que a feature entrega

- **US1 (P1)**: tela de categoria só com Pesquisar, Ordenar e a grade **2 linhas × 6 colunas com capa inteira** (nunca recorte; o experimento 4×2 recortado foi descartado pelo usuário em 2026-10-02). É o `VodCatalogScreen` evoluído, sem trilha/sidebar/hero.
- **US2 (P1)**: vitrine de Filmes/Séries — hero do card focado (sem botões) + fileiras **Continue assistindo, ★ Favoritos, Adicionados recentemente, Categorias**, cada uma só com dado real (Categorias sempre) e cartão final "Ver tudo".
- **US3 (P2)**: foco, voltar e estados (vazio/carregando/erro) sem becos sem saída; E2E e migração dos roteiros que usavam a sidebar.
- **Decisões do usuário que contrariam o óbvio**: (a) "Adicionados recentemente" usa **só o que já foi obtido, sem aviso de cobertura**; (b) a fileira de Categorias começa por ★ Favoritos, ↺ Histórico e Todos (é o único caminho para as grades); (c) "Ver tudo" de Adicionados abre **Todos ordenado por Recém-adicionados**; (d) as **travas 025/036/049/050 são substituídas e regravadas** (aprovado) — não pedir de novo; (e) se 2 linhas não couberem na altura, **compactar o cabeçalho**, nunca encolher o card (< 205px) nem recortar capa.

## Leitura obrigatória, em ordem

1. `spec.md` — escopo e FRs (FR-001..FR-017), Assumptions (amenda de contratos).
2. `plan.md` — Decisões D-001..D-014 (o "como"), Riscos R-001..R-011, tabela de referências do DS.
3. `logic/vitrine-e-foco.md` — mapa de foco da vitrine, `recentlyAdded`, hero, mapeamento `target` → grade, `appNav`, geometria medida.
4. `tasks.md` — T001..T034 por fase.
5. `quickstart.md` — verificação ponta a ponta.
6. `.planning/memory/constitution.md` — gate (foco, voltar, segredos, dado real).
7. Modelo no código: `tv-web/src/features/home/HomeContent.tsx` (rails, `useIdFocus`, "Ver todos", teclado), `tv-web/src/lib/focus/useIdFocus.ts`, `tv-web/src/components/Rail.tsx`, `tv-web/src/features/vod/VodCatalogScreen.tsx` (tela a evoluir) e `sdd/specs/050-filmes-series-paridade-v14/plan.md` (hero/anel/medições).

## Testes de contrato

- Travados (5 testes, 3 arquivos): `tv-web/src/features/vod/vodShowcase.vitrine-filmes-series.contract.test.ts` (1, Fase 2), `VodCategoryScreen.vitrine-filmes-series.contract.test.tsx` (2, Fase 3), `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` (2, Fase 4).
- Rodar (de `tv-web/`): `npx vitest run src/features/vod/vodShowcase.vitrine-filmes-series.contract.test.ts src/features/vod/VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx src/features/vod/VodCategoryScreen.vitrine-filmes-series.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 052-vitrine-filmes-series`
- Seletores que o contrato fixa (criar com **exatamente** estes nomes): `.vod-showcase`, `section.vod-row[aria-label]` ("Continue assistindo", "★ Favoritos", "Adicionados recentemente", "Categorias"), `.vod-category-card`, `.vod-see-all-card`, `.content-card`, `.vod-hero-band`, `.vod-grid`, `.vod-toolbar-search-button`, `.vod-toolbar-sort-button`, `.content-card-title`; ausentes na categoria: `.vod-side-panel`, `.side-category-nav-item`, `.vod-hero-band`. Teclas: setas, Enter, Escape (= RETURN).
- **Travas que esta feature quebra por construção e DEVE regravar (T030, já aprovado)**: `025` (`MoviesScreen.filmes-series-ds-v14.contract.test.tsx`), `036` (`VodCatalogScreen.limpar-historico.contract.test.tsx`), `049` (`VodCatalogScreen.navegacao-por-pagina.contract.test.tsx`), `050` (`MoviesScreen.paridade-v14.contract.test.tsx`). Trocar o teste inteiro por um equivalente nas telas novas, regravar a trava e anotar `R-00X` no plan da feature de origem. **Travas que NÃO podem quebrar**: 018, 019, 022 (Rail), 023/024 (`appNav`), 026 (Início/`SeeAllCard`), 046.

## Stubs criados

- `tv-web/src/features/vod/VodShowcaseScreen.tsx` — props finais; retorna `null` (T016 implementa).
- `tv-web/src/features/vod/VodCategoryScreen.tsx` — props finais; retorna `null` (T008 o substitui **copiando** `VodCatalogScreen.tsx` por cima; a antiga fica até a T024).
- `tv-web/src/features/vod/vodShowcase.ts` — `recentlyAdded` lança `not implemented`; `SHOWCASE_LIMIT = 12` já é final (T003).
- `tv-web/src/features/vod/vodTarget.ts` — tipos **finais** (`VodTarget`, `VodShowcaseRow`, `VodShowcaseFocus`, `VodCategoryRestore`).
- `useRecentlyAdded` em `tv-web/src/features/catalog/catalogApi.ts` (antes de `FavoritesContent`) — lança `not implemented`; os contratos o mockam (T004).

## Armadilhas já mapeadas

- **A vitrine é o Início em miniatura**: reuse `Rail`, `useIdFocus`, o cartão "Ver todos" e o padrão `effectiveRow` de `HomeContent`; **não** copie as 190 linhas de teclado nem extraia um framework de fileiras (R-001).
- Extrair `HomeSeeAllCard` com markup **idêntico** (T005): o contrato 026 e `HomeContent.test.tsx` fixam o DOM.
- Não mudar o redutor de `appNav` (contratos 023/024); só tipos de tela novos. `openFavorites` e `FAVORITES_SNAPSHOT` somem; Início → "Filmes (N)" passa a abrir `*-category` com `target: favorites`.
- Ao evoluir `VodCatalogScreen` mantenha: `ROW_HEIGHT`/`GRID_COLS`/`rowHeight()`, `--lane` (CSS distribui as colunas, já da 050), `trailScrollRef` **sai** mas `gridContainerRef`/paginação (`paging.ts`, 049) ficam; `vodSessionMemory` **inalterada**.
- `←` na 1ª coluna deixa de ir à trilha: passa a não fazer nada (RETURN volta). O contrato 049 amendado deve refletir isso.
- Anel de foco: meça contra **todos** os ancestrais que recortam (`.vod-grid` **e** `.vod-content-column`; aprendizado R-009 da 050). Cartões de texto das fileiras: foco sem escala.
- Altura: com margens originais (76px) 2 linhas não cabem; com as atuais (`--safe-y` 38px em `screen-margins.css`) cabem — o E2E **mede** (modelo: o script de 050). Compactar cabeçalho antes de encolher card.
- `Stage.tsx` agora estica o palco em janelas largas (≥ 16:9): larguras de fileira/grade por fração do contêiner, nunca 1920 fixo; rodar o E2E também em 2200×1000 (`E2E_W`/`E2E_H` já existem no roteiro da 050).
- ~15 E2E usam `.side-category-nav-item` em Filmes/Séries (lista no plan): criar `e2e/lib/vod.mjs` primeiro (T028) e migrar por lote; scripts têm `http://localhost:5173` fixo (conferir quem escuta antes do gate); parcial: `node e2e/run.mjs --only a,b --jobs 1`.
- Instabilidades **conhecidas e não da 052**: `LiveScreen.paginacao.test.tsx` (falhou na suíte cheia, passa isolado) e `epg-guia-completo` (falhou perto da meia-noite, também com margens originais). Reexecute isolado e em outro horário antes de culpar a feature; registrar em `Pendências`, nunca como "baseline ok".
- `npm run build:tizen` regenera `CCPlayTv/` (versionado): reverter com `git checkout -- CCPlayTv` se não for parte da entrega.
- Nunca commitar `docs/m3u/dados.md` nem credenciais; nenhuma URL de stream em log/DOM.

## Pendências do Analyze

- **A-001 (MEDIUM)**: o contrato de foco da vitrine (S2) fixa a ordem das fileiras e a navegação por setas, mas **não** o comportamento de ↑ da 1ª fileira para a topbar nem a rolagem vertical (só verificáveis com `shell`/layout) — cobertos por T021/T027; recomendação: não aceitar a Fase 4 sem o teste da topbar e a captura.
- **A-002 (MEDIUM)**: `useRecentlyAdded` lê o índice inteiro de busca (R-002); em lista muito grande a abertura da vitrine pode pesar na TV. Recomendação: medir na passada na TV (recomendada) e, se pesar, adiar a fileira ou limitar ao que o prefetch (038) já preencheu — decisão a registrar em R-002.
- **A-003 (LOW)**: SC-003 ("≤ 3 setas + OK até uma grade") depende do foco inicial na 1ª fileira com itens; com Categorias como 4ª fileira são 3 ↓ + → até o cartão + OK. Conferir na T027 e registrar o número real.
- **A-004 (LOW)**: o hero na fileira de Categorias (nome + contagem) não está nos contratos (só D-005/T018/T021).
- **A-005 (LOW)**: o título do contrato de `VodCategoryScreen` fala em "RETURN volta à vitrine" mas a vitrine é do `App`; o teste só verifica `onBack`. A ligação real é a T023/T025.
- **A-006 (LOW)**: `docs/guia-praticas-app-tv/` não foi consultado neste plano (T032 cobre).

## Gate de pronto

- 5 contratos da 052 verdes **e** as 4 travas amendadas regravadas (T030); `check-contract-tests.ps1` íntegro para 052, 025, 036, 049, 050, 018, 019, 022, 023, 024, 026, 046.
- De `tv-web/`: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e` completo (porta 5173 conferida); `quickstart.md` executado; capturas de Live/Configurações/Busca/detalhes/player idênticas (SC-004).
- Docs no Polish: `update-feature-status.ps1 … -Status Implementada`, `plan.md` (Estado Atual/Execution Notes/PRÓXIMO), `R-00X` de emenda nos plans de 025/036/049/050; **não** editar o `CLAUDE.md`.
- Passada na TV física: **recomendação** (custo de "Adicionados recentemente" e rolagem das fileiras), não gate.
