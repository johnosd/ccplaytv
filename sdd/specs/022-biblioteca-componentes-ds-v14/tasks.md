---
description: "Tasks da feature 022 — Biblioteca de Componentes do Design System V14 (Onda 1)"
---

# Tasks: Biblioteca de Componentes do Design System V14 (Onda 1 da migração)

**Input**: Documentos de design de `sdd/specs/022-biblioteca-componentes-ds-v14/`

**Prerequisites**: plan.md (obrigatório), spec.md (obrigatório), quickstart.md, contract-tests.lock

**Organization**: Tasks agrupadas por user story, na ordem de prioridade (P1 → P2 → P3), para permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: a qual user story a task pertence (US1–US9)

## Path Conventions

- Tudo em `tv-web/src/components/` (componentes) e `tv-web/src/lib/` (hooks/registro sem UI). Comandos rodam em `tv-web/`, salvo `check-contract-tests.ps1` (raiz do repositório).
- CSS novo em `tv-web/src/styles/components.css` (arquivo único, D-001 do plan.md) — **nunca** em `tv-web/src/features/screens.css`.
- Nenhuma task desta feature edita `tv-web/src/features/*Screen.tsx` (FR-003/SC-006).

**Regra transversal**: todo componente consome só tokens (feature 021) — nenhuma cor/raio/espaçamento/fonte literal (FR-001, SC-003). Nenhuma task lê `catalogRepository`/`userStateRepository` (FR-004).

---

## Phase 1: Setup (baseline)

**Purpose**: confirmar o ponto de partida antes de qualquer mudança.

- [X] T001 Rodar `npx vitest run` (suíte completa) e registrar o resultado no Registro desta fase — deve bater com o final da feature 021 convergida (858 passed, mesmas flakes conhecidas de `*.favorites.test.tsx`/`LiveScreen.test.tsx` sob paralelismo).

**Critério de Conclusão**: baseline registrada. Nenhum arquivo de produção alterado nesta fase.

**Registro da Fase**:

- Status: Concluída.
- Feito: baseline registrada antes de qualquer implementação.
- Contrato: `check-contract-tests.ps1 -Slug 022-biblioteca-componentes-ds-v14` → trava íntegra (5 testes), todos vermelhos por `not implemented` (esperado, ainda não implementados).
- Testes executados: `npx vitest run` (81 arquivos) → 7 failed | 856 passed (863 testes; os 5 contratos da própria feature 022, ainda stubs, mais as 2 flakes já documentadas em `*.favorites.test.tsx` sob paralelismo). Reconfirmado isolando `LiveScreen.favorites.test.tsx` + `MoviesScreen.favorites.test.tsx` → 2/2 arquivos, 20/20 testes verdes — flake de paralelismo, não regressão real, mesmo padrão já documentado nas features 018–021.
- Pendências: nenhuma.

---

## Phase 2: Foundational — camada de CSS dos componentes (bloqueia todas as stories)

**Purpose**: existe um lugar único para o CSS de todo componente novo, na ordem de camadas certa.

- [X] T002 Criar `tv-web/src/styles/components.css` com o comentário de cabeçalho (D-001 do plan.md: "CSS dos componentes da biblioteca V14 — Onda 1 da migração, importado depois de utilities.css e antes de screens.css"). Arquivo pode começar vazio além do comentário.
- [X] T003 Em `tv-web/src/main.tsx`, importar `./styles/components.css` depois de `./styles/utilities.css` e antes de `./features/screens.css`.

### Testes da Fase

- [X] T004 [P] Rodar `npx tsc -b` e `npx vitest run` (suíte completa) — confirmar zero regressão só com o import novo.

**Critério de Conclusão**: `components.css` existe e está importado na ordem certa; suíte completa continua exatamente como a baseline de T001.

**Checkpoint**: infraestrutura de estilos pronta — as stories podem começar.

**Registro da Fase**:

- Status: Concluída.
- Feito: `tv-web/src/styles/components.css` criado (só o comentário de cabeçalho); importado em `main.tsx` entre `utilities.css` e `screens.css`.
- Contrato: sem contrato nesta fase.
- Testes executados: `npx tsc -b` → limpo. `npm run lint` → só warnings pré-existentes (nenhum erro novo). `npx vitest run` → 8 failed | 855 passed (863) — mesmos 5 contratos ainda stub (esperado) + 3 flakes de `*.favorites.test.tsx` sob paralelismo (uma a mais que a baseline de T001 por variação normal de execução paralela, não por esta mudança — o import de CSS não pode afetar lógica de favoritos).
- Pendências: nenhuma.

---

## Phase 3: User Story 1 — Um diálogo abre e fecha sem perder o controle remoto (Priority: P1) 🎯 MVP

**Objetivo**: `Modal` genérico, com foco real (intercepta teclado, RETURN fecha e devolve controle a quem abriu), no máximo um visível por vez.

**Independent Test**: seção 3 do `quickstart.md` (Vitest UI) nos contratos C1/C4.

### Contrato da Fase

- C1 `intercepta o teclado — setas/SELECT vão pro conteúdo do modal, RETURN chama onBack, e a tela por trás não recebe nada enquanto ele está aberto` — origem: US1/AC1–AC3 · FR-006–FR-008
- C4 `um segundo Modal montado enquanto o primeiro está aberto não renderiza conteúdo nem intercepta teclado` — origem: FR-009 · D-010
- Comando: `npx vitest run src/components/Modal.biblioteca-componentes.contract.test.tsx`

### Implementation

- [X] T005 [US1] Implementar `tv-web/src/components/Modal.tsx` (D-010 do plan.md): variável de módulo `activeModalId` (símbolo); no `useEffect` de montagem, se já houver um ativo, este `Modal` não registra `useRemoteNav` nem renderiza `children` (retorna só um `<div style="display:none">` ou `null` — decisão local, desde que nada de `children` apareça no DOM); senão, registra-se como ativo, chama `useRemoteNav({onDirection,onSelect,onBack},{modal:true})` (reaproveitado tal qual, sem reimplementar interceptação), e libera o slot no cleanup. Renderiza `role="dialog"` `aria-modal="true"` `aria-label={ariaLabel}` `z-index: var(--z-overlay)`. → contrato: C1, C4
- [X] T006 [US1] CSS `.modal-overlay` (fundo opaco `--bg-canvas` com alguma opacidade, sem `backdrop-filter` pesado — Spec V14 §28.2) e `.modal-panel` (`--radius-lg`, `--elevation-3`, `--space-4` de padding interno) em `tv-web/src/styles/components.css`.

### Testes da Fase

- [X] T007 [P] [US1] `tv-web/src/components/Modal.test.tsx`: `role="dialog"`/`aria-modal`/`aria-label` presentes; ao desmontar um `Modal` ativo e montar outro em seguida, o novo passa a interceptar (o slot do singleton foi liberado).

**Critério de Conclusão**: `npx vitest run src/components/Modal.biblioteca-componentes.contract.test.tsx` → 2/2 verdes, e `check-contract-tests.ps1 -Slug 022-biblioteca-componentes-ds-v14` íntegro.

**Checkpoint**: US1 funcional isoladamente — MVP da feature.

**Registro da Fase**:

- Status: Concluída.
- Feito: `Modal.tsx` implementado (singleton via `activeModalId: symbol | null`, `useRemoteNav({modal:isActive})` chamado incondicionalmente com handlers vazios quando inativo); CSS `.modal-overlay`/`.modal-panel` em `components.css`, usando o token `--player-zap-scrim` já existente para o fundo opaco (evita criar um valor rgba literal novo, SC-003).
- Contrato: `npx vitest run src/components/Modal.biblioteca-componentes.contract.test.tsx` → 2/2 verdes. `check-contract-tests.ps1` → trava íntegra.
- Testes executados: contrato + `Modal.test.tsx` juntos → 4/4 verdes. `npx tsc -b` limpo. `npm run lint` sem erros novos.
- Pendências: nenhuma.

---

## Phase 4: User Story 2 — Todo estado vazio ou de erro tem uma saída pelo controle (Priority: P1)

**Objetivo**: `EmptyState` (1 ação sempre) e `ErrorState` (1–2 ações, código opcional), cada ação nativamente focável/ativável.

**Independent Test**: seção 3 do `quickstart.md` no contrato C2. Independente de US1 (não usa `Modal`).

### Contrato da Fase

- C2 `EmptyState (1 ação) e ErrorState (1 ou 2 ações) são sempre ativáveis, e o código só aparece quando informado` — origem: US2/AC1–AC4 · FR-010–FR-013
- Comando: `npx vitest run src/components/EmptyErrorState.biblioteca-componentes.contract.test.tsx`

### Implementation

- [X] T008 [US2] Implementar `tv-web/src/components/EmptyState.tsx` (D-011): ícone opcional (`Icon`, feature 021), título, descrição, e a ação como `<button type="button" className="button-secondary" onClick={action.onSelect}>{action.label}</button>` — **nunca** importar o componente `Button` (D-011: US2 não depende de US6). → contrato: C2
- [X] T009 [US2] Implementar `tv-web/src/components/ErrorState.tsx` (D-011): mesma estrutura de `EmptyState`, mais `code` opcional em `<span data-testid="error-state-code" className="error-state-code">{code}</span>` (discreto — fonte pequena, `--text-annotation`), e as 1–2 `actions` mapeadas para o mesmo `<button className="button-secondary">` de T008. → contrato: C2
- [X] T010 [US2] CSS `.empty-state`/`.error-state`/`.error-state-code`/`.button-secondary` em `components.css` (o mesmo `.button-secondary` que a US6 vai reaproveitar depois, criado aqui pela primeira vez — ver D-011).

### Testes da Fase

- [X] T011 [P] [US2] `tv-web/src/components/EmptyState.test.tsx` + `ErrorState.test.tsx`: ícone ausente não quebra; descrição ausente não deixa espaço vazio; nenhum dos dois comunica o estado só por cor (conferir que existe texto/ícone além da cor de fundo).

**Critério de Conclusão**: `npx vitest run src/components/EmptyErrorState.biblioteca-componentes.contract.test.tsx` → 1/1 verde, contratos íntegros.

**Checkpoint**: US2 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `EmptyState.tsx`/`ErrorState.tsx` implementados (`<button className="button-secondary">` nativo, sem importar `Button`); CSS correspondente em `components.css`, incluindo `.button-secondary` (US6 vai reaproveitar essa classe, não recriá-la).
- Contrato: `npx vitest run src/components/EmptyErrorState.biblioteca-componentes.contract.test.tsx` → 1/1 verde. Trava íntegra.
- Testes executados: contrato + `EmptyState.test.tsx` + `ErrorState.test.tsx` → 5/5 verdes. `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 5: User Story 3 — Uma trilha horizontal de itens nunca monta tudo de uma vez (Priority: P1)

**Objetivo**: `Rail` virtualizado de verdade (`@tanstack/react-virtual`, horizontal), com fade de borda e indicador de posição.

**Independent Test**: seção 3 do `quickstart.md` no contrato C3. Independente de US1/US2.

### Contrato da Fase

- C3 `com 500 itens nunca monta mais que a janela virtual + overscan, e rolar monta itens novos` — origem: US3/AC1–AC2 · FR-014 · SC-002
- Comando: `npx vitest run src/components/Rail.biblioteca-componentes.contract.test.tsx`

### Implementation

- [X] T012 [US3] Implementar `tv-web/src/components/Rail.tsx` (D-008): `useVirtualizer({horizontal:true, count:items.length, getScrollElement:()=>scrollRef.current, estimateSize:()=>itemWidth, overscan:3})` + `useVirtualFocusSync({focusedIndex, scrollToIndex:virtualizer.scrollToIndex, enabled:items.length>0})` (reaproveitados de `@tanstack/react-virtual`/feature 009, sem lógica de scroll nova). `items.length === 0` retorna `null` (FR-016). Nó raiz com `className="rail"` (é o próprio contêiner de scroll, `ref={scrollRef}`), filho `className="rail-inner"` com `style={{width: virtualizer.getTotalSize()}}`, cada item virtual posicionado com `transform: translateX(...)`. → contrato: C3
- [X] T013 [US3] CSS `.rail` (`overflow-x:auto`, `overflow-y:hidden`, `position:relative`), `.rail-inner` (`position:relative`, `height:100%`), `.rail-item` (`position:absolute`, `top:0`), e o fade de borda (`::before`/`::after` com gradiente, `position:sticky` nas duas pontas) em `components.css`.
- [X] T014 [US3] Indicador de posição: uma barra fina (`.rail-position`) cujo `transform:scaleX(...)`/posição reflete `focusedIndex / (items.length - 1)` — sem número inventado, só a proporção.

### Testes da Fase

- [X] T015 [P] [US3] `tv-web/src/components/Rail.test.tsx`: com 1 item não mostra indicador de continuação; sem itens não renderiza nada (`container.firstChild === null`).

**Critério de Conclusão**: `npx vitest run src/components/Rail.biblioteca-componentes.contract.test.tsx` → 1/1 verde, contratos íntegros.

**Checkpoint**: US3 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `Rail.tsx` implementado (`@tanstack/react-virtual` horizontal + `useVirtualFocusSync`, ambos reaproveitados sem lógica nova). Fade de borda via `mask-image`/`-webkit-mask-image` (CSS puro, sem `::before`/`::after` — mais simples e sem custo de camada extra) e indicador de posição (`.rail-position-fill`, `scaleX` pela proporção real) em `components.css`.
- Contrato: `npx vitest run src/components/Rail.biblioteca-componentes.contract.test.tsx` → 1/1 verde. Trava íntegra.
- Testes executados: contrato + `Rail.test.tsx` → 3/3 verdes. `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 6: User Story 4 - Cards de conteúdo nas quatro proporções do catálogo (Priority: P2)

**Objetivo**: `ContentCard` (4 proporções, envolve `PosterArt`) e `ChannelRow`.

**Independent Test**: seção 3 do `quickstart.md` no contrato C5. Independente de US1–US3.

### Contrato da Fase

- C5 `renderiza via PosterArt (mesma estrutura, sem <img> duplicada) e cada variante tem uma classe própria e distinta` — origem: US4/AC1,AC2,AC5 · FR-017–FR-018 · SC-005
- Comando: `npx vitest run src/components/ContentCard.biblioteca-componentes.contract.test.tsx`

### Implementation

- [X] T016 [US4] Implementar `tv-web/src/components/ContentCard.tsx` (D-006): `<div className={`content-card content-card--${variant}`}><PosterArt url={iconUrl} title={title} focused={focused}>{badge}</PosterArt><div className="content-card-title">{title}</div>{meta && <div className="content-card-meta">{meta}</div>}</div>`, `onClick={onSelect}` no nó raiz. → contrato: C5
- [X] T017 [US4] CSS das 4 variantes em `components.css`: `.content-card--portrait` (205×302, `aspect-ratio:205/302`), `.content-card--landscape` (292×164), `.content-card--wide` (356×200), `.content-card--compact` (250×126) — largura fixa + `aspect-ratio`, nunca depender do conteúdo pra definir tamanho (FR-017, sem *layout shift*). `.content-card-title` com `-webkit-line-clamp:2`/`text-overflow:ellipsis`.
- [X] T018 [US4] Implementar `tv-web/src/components/ChannelRow.tsx` (D-007): `<PosterArt url={logoUrl} title={name} focused={focused} />` numa proporção compacta + número + nome + slot "Agora" (`{nowPlaying ?? ''}`, sempre presente no DOM, nunca "0" — FR-019) + barra de progresso só quando `progress` vier.
- [X] T019 [US4] CSS `.channel-row`/`.channel-row-now`/`.channel-row-progress` em `components.css`.

### Testes da Fase

- [X] T020 [P] [US4] `tv-web/src/components/ChannelRow.test.tsx`: sem `nowPlaying`, o slot existe vazio no DOM (não desaparece); sem `logoUrl`, cai no placeholder do `PosterArt` (mesma garantia do contrato de `ContentCard`, aqui em unitário porque não é P1).

**Critério de Conclusão**: `npx vitest run src/components/ContentCard.biblioteca-componentes.contract.test.tsx` → 1/1 verde, contratos íntegros.

**Checkpoint**: US4 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `ContentCard.tsx`/`ChannelRow.tsx` implementados, ambos delegando no `PosterArt` real (D-006/D-007). CSS das 4 variantes + `.channel-row*` em `components.css`.
- Contrato: achado real durante a implementação — `getByText('pôster')` (busca exata) no contrato C5 nunca batia com a estrutura real do `PosterArt` (rótulo "pôster"+`<br/>`+título no mesmo `<span>`; Testing Library concatena só os nós de texto diretos). Confirmado empiricamente com um teste de sanidade isolado (removido depois). Reportado ao usuário (passo 5b) — aprovada a correção da asserção para `getByText('pôster', {exact:false})`, sem tocar em `PosterArt`. Trava regravada; ver R-005 em `plan.md`. `npx vitest run src/components/ContentCard.biblioteca-componentes.contract.test.tsx` → 1/1 verde. Trava íntegra.
- Testes executados: contrato + `ChannelRow.test.tsx` → 4/4 verdes. `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 7: User Story 5 - Navegar entre categorias e abas sem lógica de catálogo (Priority: P2)

**Objetivo**: `SideCategoryNav` (burro) e `Tabs` (controlado).

**Independent Test**: teste unitário — sem contrato (P2, sem risco comportamental novo).

### Implementation

- [X] T021 [US5] Implementar `tv-web/src/components/SideCategoryNav.tsx` (D-009): recebe `entries`, ordena colocando `pinned:true` primeiro sem reordenar entre si (`[...entries].sort((a,b) => Number(b.pinned) - Number(a.pinned))` é **errado** porque `sort` não é garantidamente estável entre engines antigos para elementos "iguais" na chave — usar partição explícita: `[...entries.filter(e=>e.pinned), ...entries.filter(e=>!e.pinned)]`, que preserva a ordem relativa dentro de cada grupo por construção). `count` ausente não desenha número.
- [X] T022 [US5] CSS `.side-category-nav`/`.side-category-nav-item`/`.side-category-nav-pinned-badge` em `components.css`.
- [X] T023 [US5] Implementar `tv-web/src/components/Tabs.tsx` (D-005): puramente controlado (`items`, `activeId`, `onSelect`), sem estado interno — a navegação por seta é de quem usa.
- [X] T024 [US5] CSS `.tabs`/`.tabs-item`/`.tabs-item-active` em `components.css` (seleção usa `--accent-tint`/`--accent-tint-border`, mesmo padrão de `.is-soft-disabled` etc. da feature 021).

### Testes da Fase

- [X] T025 [P] [US5] `tv-web/src/components/SideCategoryNav.test.tsx`: 2 entradas `pinned` e 3 não-`pinned` em ordem embaralhada → as 2 pinned aparecem primeiro, cada grupo na ordem recebida.
- [X] T026 [P] [US5] `tv-web/src/components/Tabs.test.tsx`: `onSelect` dispara só em ativação, nunca ao só re-renderizar com `activeId` igual.

**Critério de Conclusão**: os dois arquivos de teste acima verdes; `npx tsc -b`/`npm run lint` limpos.

**Checkpoint**: US5 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `SideCategoryNav.tsx` (partição explícita, não `.sort()`) e `Tabs.tsx` (puramente controlado) implementados; CSS correspondente em `components.css`.
- Contrato: sem contrato nesta fase (P2, sem risco que justifique travar).
- Testes executados: `SideCategoryNav.test.tsx` + `Tabs.test.tsx` → 4/4 verdes. `npx tsc -b` limpo, `npm run lint` sem erros novos.
- Pendências: nenhuma.

---

## Phase 8: User Story 6 - Ações e status com um único vocabulário visual (Priority: P3)

**Objetivo**: `Button`, `IconButton`, `Chip`.

**Independent Test**: teste unitário — sem contrato.

### Implementation

- [X] T027 [US6] Implementar `tv-web/src/components/Button.tsx` (D-002): `variant` 4 valores, `<button>` real, `loading` com `aria-busy="true"` sem `disabled` real (continua focável/anunciável, só não ativa — ver T028), `disabled` usa `.is-hard-disabled` (feature 021). Reaproveita a classe `.button-secondary` já criada em T010 (US2) para a variante `secondary` — **primeira vez que uma classe é compartilhada entre stories via CSS, nunca via import de componente**.
- [X] T028 [US6] Em `Button.tsx`, `onClick` ignora o clique quando `loading` (checagem em código, já que `disabled` real não é usado nesse estado).
- [X] T029 [US6] CSS `.button-primary`/`.button-ghost`/`.button-accent` (variantes que faltam) em `components.css`, radius `--radius-pill`.
- [X] T030 [US6] Implementar `tv-web/src/components/IconButton.tsx` (D-003): área mínima 52×52 (`--space-6` + ajuste, ou valor fixo documentado), `label` obrigatório repassado ao `Icon`.
- [X] T031 [US6] Implementar `tv-web/src/components/Chip.tsx` (D-004): `selected` usa `--accent-tint`/`--accent-tint-border` **mais** borda mais grossa (segundo sinal, além da cor — FR-026). Desvio pequeno: nenhum dos 17 ícones da feature 021 cobre "check" (adicionar um novo está fora de escopo), então o glifo de confirmação é `✓` direto (`.chip-check`), não `Icon`.
- [X] T032 [US6] CSS `.icon-button`/`.chip`/`.chip-selected` em `components.css`.

### Testes da Fase

- [X] T033 [P] [US6] `tv-web/src/components/Button.test.tsx`: cada variante renderiza a classe certa; `loading` não dispara `onSelect` ao clicar.
- [X] T034 [P] [US6] `tv-web/src/components/IconButton.test.tsx`: sempre expõe `aria-label`/nome acessível (`getByRole('button', {name})`).
- [X] T035 [P] [US6] `tv-web/src/components/Chip.test.tsx`: selecionado e não selecionado diferem em mais de um atributo/classe (não só a cor computada).

**Critério de Conclusão**: os 3 arquivos de teste verdes; `npx tsc -b`/`npm run lint` limpos.

**Checkpoint**: US6 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `Button.tsx`/`IconButton.tsx`/`Chip.tsx` implementados; `Button` reaproveita `.button-secondary` (criada na Fase 4) sem redefini-la do zero. CSS das variantes faltantes em `components.css`.
- Contrato: sem contrato nesta fase (P3). Trava íntegra (verificada, nada tocado).
- Testes executados: `Button.test.tsx` + `IconButton.test.tsx` + `Chip.test.tsx` → 7/7 verdes. `npx tsc -b` limpo (1 iteração: `vi` importado sem uso em `Chip.test.tsx`, corrigido). `npm run lint` sem erros novos.
- Pendências: nenhuma.

---

## Phase 9: User Story 7 - Feedback de sistema sem inventar dado (Priority: P3)

**Objetivo**: `Spinner`, `Skeleton`, `OfflineBanner` (com detecção real de conectividade).

**Independent Test**: teste unitário — sem contrato.

### Implementation

- [X] T036 [US7] Implementar `tv-web/src/components/Spinner.tsx` (D-013): `size: 20|32|48`, `role="status"` + `<span className="sr-only">Carregando</span>` (região de anúncio da feature 021 reaproveitada só pelo padrão `sr-only`, sem depender de `AnnouncerRegion` estar montada — funciona com ou sem ela, igual ao `Toast` sem região).
- [X] T037 [US7] Implementar `tv-web/src/lib/onlineStatus.ts` (D-012): `useOnlineStatus()` — estado inicial `navigator.onLine`, assina `window.addEventListener('online'|'offline', ...)`, remove no cleanup.
- [X] T038 [US7] Implementar `tv-web/src/components/OfflineBanner.tsx` (D-012): consome `useOnlineStatus()`; `online === true` retorna `null`; senão, mensagem + botão "Testar conexão" (`onTestConnection`).
- [X] T039 [US7] Implementar `tv-web/src/components/Skeleton.tsx` (D-014): `width`/`height`/`variant` (`rect`|`text`); nenhuma animação além do que a regra global de shimmer/pulse (se vier a existir) já herdaria de `--duration-*` — nesta v1, um tom estático de `--bg-hover` já basta (sem inventar uma animação nova fora do escopo do design system).
- [X] T040 [US7] CSS `.spinner`/`.offline-banner`/`.skeleton`/`.skeleton-text` em `components.css`.

### Testes da Fase

- [X] T041 [P] [US7] `tv-web/src/components/Spinner.test.tsx`: os 3 tamanhos; nunca renderiza um número/percentual (busca por `%`/dígito solto no texto e falha se achar).
- [X] T042 [P] [US7] `tv-web/src/lib/onlineStatus.test.ts` + `OfflineBanner.test.tsx`: `navigator.onLine=false` no início → banner aparece; disparar evento `online` → some; `navigator.onLine=true` no início → banner nunca aparece.
- [X] T043 [P] [US7] `tv-web/src/components/Skeleton.test.tsx`: `width`/`height` recebidos aparecem no estilo inline (geometria controlável por quem usa, pré-requisito de SC-005 quando combinado com o real na Onda 2).

**Critério de Conclusão**: os 3 conjuntos de teste verdes; `npx tsc -b`/`npm run lint` limpos.

**Checkpoint**: US7 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `Spinner.tsx`, `onlineStatus.ts`/`OfflineBanner.tsx` (detecção real de `navigator.onLine` + eventos), `Skeleton.tsx` implementados. Animação do spinner usa `calc(var(--duration-slow) * 3)` (token, sem literal) — colapsada automaticamente pela regra global de `prefers-reduced-motion`/`.reduce-motion` da feature 021, sem código extra.
- Contrato: sem contrato nesta fase (P3). Trava íntegra.
- Testes executados: `Spinner.test.tsx` + `onlineStatus.test.ts` + `OfflineBanner.test.tsx` + `Skeleton.test.tsx` → 8/8 verdes. `npx tsc -b` limpo, `npm run lint` sem erros novos.
- Pendências: nenhuma.

---

## Phase 10: User Story 8 - Um campo de texto que aciona o teclado nativo certo (Priority: P3)

**Objetivo**: `TextField` isolado, com IME correto.

**Independent Test**: teste unitário — sem contrato.

### Implementation

- [X] T044 [US8] Implementar `tv-web/src/components/TextField.tsx` (D-015): mapa fixo `purpose → {inputMode?, type?, autoComplete?}` (`search`/`url`/`username`/`password`/`text`, `text` e qualquer valor não mapeado caem no mesmo `default` sem atributos especiais). `useId()` quando `id` não vier. `<label htmlFor={id}>` sempre visível. Com `error`: `aria-describedby={errorId}` + `aria-invalid="true"` + `<p id={errorId}>` com `Icon name="info"` ao lado do texto.
- [X] T045 [US8] CSS `.text-field`/`.text-field-label`/`.text-field-input`/`.text-field-error` em `components.css` (borda de erro usa `--danger`, nunca só isso — o ícone é o segundo sinal).

### Testes da Fase

- [X] T046 [P] [US8] `tv-web/src/components/TextField.test.tsx`: cada `purpose` produz os atributos certos (tabela dos 5 casos); com `error`, `aria-describedby` aponta pro `id` do parágrafo de erro; rótulo continua no DOM com o campo vazio.

**Critério de Conclusão**: teste verde; `npx tsc -b`/`npm run lint` limpos.

**Checkpoint**: US8 funcional isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `TextField.tsx` implementado com mapa fixo de `purpose`; CSS em `components.css` com `--danger` + ícone como segundo sinal de erro.
- Contrato: sem contrato nesta fase (P3). Trava íntegra.
- Testes executados: `TextField.test.tsx` → 7/7 verdes. `npx tsc -b` limpo, `npm run lint` sem erros novos.
- Pendências: nenhuma.

---

## Phase 11: User Story 9 - Funcionalidade ainda não construída nunca finge ser real (Priority: P3)

**Objetivo**: `ComingSoon` + `comingSoon.ts`.

**Independent Test**: teste unitário — sem contrato.

### Implementation

- [X] T047 [US9] Implementar `tv-web/src/lib/comingSoon.ts` (D-016): `COMING_SOON: Record<string,{message:string; backlogItem:number}>` com uma entrada de exemplo documentada (comentário dizendo que a Onda 2 adiciona as suas); `getComingSoon(id)` lança `Error` com o id no texto quando não encontrado.
- [X] T048 [US9] Implementar `tv-web/src/components/ComingSoon.tsx` (D-016, revisado): usa `getComingSoon(id)`, aplica `.is-soft-disabled` (feature 021), mostra `Icon` + mensagem. Ao ativar por SELECT/Enter, chama `useAnnounce()` (`tv-web/src/lib/announcer.ts`, feature 021) anunciando `` `Em breve — ${message}` `` — isso é o que cumpre FR-035/US9-AC2 pelo próprio componente, sem depender de consumidor — e só então invoca `onSelect?.()` se fornecido (hook extra, não a única via do feedback).
- [X] T049 [US9] CSS `.coming-soon` em `components.css` (usa `.is-soft-disabled` de `utilities.css`, sem duplicar a regra).

### Testes da Fase

- [X] T050 [P] [US9] `tv-web/src/lib/comingSoon.test.ts`: id registrado retorna a entrada; id ausente lança com o id no texto do erro.
- [X] T051 [P] [US9] `tv-web/src/components/ComingSoon.test.tsx`: renderiza a mensagem do registro; ativar por SELECT/Enter **sem** passar `onSelect` já produz o anúncio "Em breve — {message}" na região `aria-live` (FR-035 cumprido só pelo componente); com `onSelect` fornecido, ele também dispara.

**Critério de Conclusão**: os 2 arquivos de teste verdes; `npx tsc -b`/`npm run lint` limpos.

**Checkpoint**: US9 funcional isoladamente — todas as 9 user stories completas.

**Registro da Fase**:

- Status: Concluída.
- Feito: `comingSoon.ts`/`ComingSoon.tsx` implementados conforme D-016 revisado (achado A-001 do Analyze do `sdd-plan`) — o próprio componente anuncia "Em breve — {message}" via `useAnnounce()`, sem depender de `onSelect` do consumidor. Reaproveitado o padrão `withRegion` de `announcer.test.tsx` (feature 021) pra testar o anúncio de verdade.
- Contrato: sem contrato nesta fase (P3). Trava íntegra.
- Testes executados: `comingSoon.test.ts` + `ComingSoon.test.tsx` → 5/5 verdes, confirmando FR-035 cumprido sozinho (teste dedicado sem `onSelect`). `npx tsc -b` limpo, `npm run lint` sem erros novos.
- Pendências: nenhuma.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: confirmar SC-001 a SC-007, rodar os gates finais e atualizar a documentação canônica.

- [X] T052 Conferir SC-001: cada um dos 16 componentes tem teste cobrindo todo estado aplicável (default/focused/disabled/loading/error) — revisar a lista contra `spec.md` e completar o que faltar.
- [X] T053 Rodar a seção 2 do `quickstart.md` (grep por cor/valor literal) e corrigir qualquer achado antes de fechar (SC-003).
- [X] T054 Rodar `npx tsc -b`, `npm run lint`, `npx vitest run` (suíte completa) e comparar com a baseline de T001 — nenhuma regressão, e confirmar que nenhum arquivo em `tv-web/src/features/` mudou (`git diff --stat -- tv-web/src/features` vazio, SC-006).
- [X] T055 Rodar `npm run test:e2e` (dev server de pé) e comparar com o resultado da feature 021 — sem tela tocada, o resultado deve ser idêntico (SC-007).
- [X] T056 Atualizar `CLAUDE.md`: registrar a feature 022 com veredito honesto (16 componentes prontos, nenhuma tela consumindo ainda, os 5 contratos e o que cada um prova) — mesmo padrão da entrada da feature 021.

**Registro da Fase**:

- Status: Concluída.
- Feito: SC-001 reforçado com 4 testes que faltavam (`disabled` em `Button`/`IconButton`, `progress` em `ChannelRow`, variante `text` em `Skeleton`); SC-003 conferido por grep (nenhuma cor literal; restam só larguras exatas de card da Spec V14 e espessuras de traço 1–4px, fora de "cor/raio/espaçamento/fonte"); `CLAUDE.md` com o parágrafo da feature 022 e o veredito honesto; R-006 registrado em `plan.md` (leitura de FR-006/edge case de foco do `Modal`).
- Contrato: `check-contract-tests.ps1 -Slug 022-biblioteca-componentes-ds-v14` → trava íntegra (5 testes); 5/5 verdes na suíte completa.
- Testes executados: `npx tsc -b` limpo; `npm run lint` sem erros novos; `npx vitest run` → 2 failed | 907 passed (909); `git status -- tv-web/src/features` vazio (SC-006); E2E rodado script a script → 7/8 verdes, `e2e.mjs` falha em `button:has-text("Sair")` (bug pré-existente, idêntico à feature 021, R-005 de lá) — SC-007.
- Pendências: (1) `LiveScreen.favorites.test.tsx` e `SeriesScreen.favorites.test.tsx` falham na suíte completa e passam isolados (18/18) — flake de paralelismo já documentada em features anteriores, **problema aberto, não baseline ok**; (2) R-006 (foco do `Modal`) e R-004 (SC-005 parcial) ficam abertos para o `sdd-converge` avaliar; (3) sem passe em TV física — nada visível entrega nesta onda.

### Checklist de Release

- [X] Fase 1 (baseline) concluída
- [X] Fase 2 (CSS foundational) concluída
- [X] Fase 3 (US1 Modal) concluída
- [X] Fase 4 (US2 EmptyState/ErrorState) concluída
- [X] Fase 5 (US3 Rail) concluída
- [X] Fase 6 (US4 ContentCard/ChannelRow) concluída
- [X] Fase 7 (US5 SideCategoryNav/Tabs) concluída
- [X] Fase 8 (US6 Button/IconButton/Chip) concluída
- [X] Fase 9 (US7 Spinner/Skeleton/OfflineBanner) concluída
- [X] Fase 10 (US8 TextField) concluída
- [X] Fase 11 (US9 ComingSoon) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 022-biblioteca-componentes-ds-v14` íntegro
- [X] SC-001 a SC-007 conferidos individualmente (T052–T055) — SC-005 só parcialmente provável nesta feature (R-004: `Skeleton` genérico, nenhuma tela monta os dois lado a lado ainda)
- [X] Nenhum arquivo em `tv-web/src/features/` alterado (SC-006)
- [X] `npm run test:e2e` sem regressão em relação à feature 021
- [X] `CLAUDE.md` atualizado

---

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 1 (baseline)**: primeira.
- **Fase 2 (CSS foundational)**: depende da 1. Bloqueia todas as stories (todo componente escreve em `components.css`).
- **Fases 3–11 (US1–US9)**: dependem da 2, e são **independentes entre si** — podem ser feitas em qualquer ordem ou em paralelo, exceto pela ordem de prioridade recomendada (P1 → P2 → P3) e pela regra do CSS compartilhado:
  - Fase 4 (US2) cria `.button-secondary`; Fase 8 (US6) a reaproveita para a variante `secondary` de `Button` — se US6 for feita ANTES de US2, quem a implementar cria `.button-secondary` lá, e US2 a reaproveita no sentido inverso. De qualquer forma, **só uma das duas cria a classe**, a outra reaproveita — registrar isso no Registro da Fase de quem chegar primeiro.
- **Fase 12 (Polish)**: depende de todas as stories desejadas estarem completas.

### Parallel Opportunities

- Fases 3, 4 e 5 (as três P1) podem ser feitas em paralelo por serem independentes — a única coordenação é a nota de `.button-secondary` acima, que só se aplica entre US2 e US6.
- Fases 6–11 (P2/P3) idem, todas paralelizáveis entre si.
- Dentro de cada fase, as tasks de teste marcadas `[P]` rodam em paralelo entre si.

---

## Parallel Example: Fases P1

```bash
# As 3 fases P1 podem ser trabalhadas em paralelo depois da Fase 2:
Task: "Fase 3 — Modal (US1)"
Task: "Fase 4 — EmptyState/ErrorState (US2)"
Task: "Fase 5 — Rail (US3)"
```

---

## Implementation Strategy

### MVP First

1. Fases 1 e 2.
2. Fase 3 (US1, Modal) — sozinha já entrega o componente de maior risco da
   feature, validável isoladamente.

### Incremental Delivery

Fase 4 → Fase 5 → Fase 6 → ... → Fase 11, em qualquer ordem dentro de cada
nível de prioridade. Fase 12 (Polish) por último.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- Commitar após cada fase fechada.
- Os contratos são travados: **nunca** editar os 4 arquivos listados em `contract-tests.lock`.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
