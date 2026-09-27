# Implementation Plan: Biblioteca de Componentes do Design System V14 (Onda 1 da migração)

**Slug**: `022-biblioteca-componentes-ds-v14` | **Date**: 2026-09-26 | **Spec**: `sdd/specs/022-biblioteca-componentes-ds-v14/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Segunda onda da migração para o DS V14 Spectrum. Entrega 16 componentes
reutilizáveis em `tv-web/src/components/`, cada um testado isolado — **nenhuma
tela existente é tocada** (FR-003/SC-006). São 3 famílias por risco:

1. **Navegação por controle remoto de verdade** (P1): `Modal` (abre com
   foco já dentro dele, RETURN fecha e devolve o foco a quem abriu, no
   máximo um visível por vez), `EmptyState`/`ErrorState` (sempre com ação
   alcançável por SELECT), `Rail` (trilho horizontal virtualizado de
   verdade, reaproveitando `@tanstack/react-virtual` + os hooks de foco da
   feature 009).
2. **Composição de conteúdo** (P2): `ContentCard` (4 proporções, envolve o
   `PosterArt` existente sem reescrevê-lo), `ChannelRow`, `SideCategoryNav`
   (componente burro), `Tabs`.
3. **Peças simples** (P3): `Button`, `IconButton`, `Chip`, `Spinner`,
   `Skeleton`, `OfflineBanner` (detecção real de conectividade),
   `TextField` (IME), `ComingSoon` + o registro `comingSoon.ts`.

Todo componente consome só os tokens da feature 021 (já convergida), e o
CSS novo fica num arquivo próprio (`styles/components.css`), nunca em
`features/screens.css`.

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict via `tsconfig.app.json`), React 19.2, CSS puro. Mesmo ambiente da feature 021 — nada mudou.

**Primary Dependencies**: `@tanstack/react-virtual` (já dependência, usado só verticalmente até aqui — `Rail` é o primeiro uso **horizontal**, mesma API, `horizontal: true`). Hooks de foco da feature 009 (`useVirtualFocusSync`, `useScrollFocusedIntoView`) e o próprio `useRemoteNav` (feature 001+, `modal: true` já usado por `ConfirmDialog`). `Icon`/`iconPaths` e as classes utilitárias (`.no-scale`, `.pressed`, `.is-soft-disabled`, `.is-hard-disabled`) da feature 021. **Nenhuma dependência de runtime nova.**

**Storage**: nenhum. `OfflineBanner` lê `navigator.onLine` (estado do navegador, não persistido).

**Testing**: Vitest 5 + jsdom + Testing Library, mesmo padrão da feature 021/009 — inclusive o mock de `ResizeObserver`/`offsetWidth`/`offsetHeight` que `MoviesScreen.test.tsx` já usa para testar grades virtualizadas (`Rail` reaproveita a mesma técnica, adaptada pra `offsetWidth` horizontal).

**Target Platform**: mesmo da feature 021 (Samsung QN50Q60DAGXZD, Chromium 108). Nenhum componente aqui é montado numa tela real ainda, então não há superfície nova a validar na TV — a validação de hoje é só o navegador/testes (constitution: "Validação em hardware real" recomendada, não obrigatória, e não há tela pra validar de qualquer forma).

**Performance Goals**: `Rail` com centenas de itens não pode montar mais que a janela virtual + buffer no DOM (SC-002) — é o único requisito de desempenho mensurável desta feature.

**Constraints**:
- **`useRemoteNav({modal:true})` intercepta na fase de captura e chama
  `stopImmediatePropagation()`** (`tv-web/src/lib/useRemoteNav.ts`). É por
  isso que `ConfirmDialog` (o único modal existente hoje) não precisa de
  nenhuma lógica explícita de "restaurar foco" — enquanto ele está montado,
  o `useRemoteNav` (fase de bubble, sem `modal`) da tela por trás nunca
  recebe o evento, então o **estado de foco da tela por trás simplesmente
  não muda** enquanto o modal está aberto. `Modal` reaproduz exatamente
  esse mecanismo, generalizado.
- **Múltiplos listeners de captura no mesmo `document`** disparam na ordem
  de registro; o primeiro que chamar `stopImmediatePropagation()` impede
  QUALQUER listener seguinte (inclusive outro modal) de rodar naquele
  evento — dois `Modal` montados ao mesmo tempo deixariam o segundo
  inteiramente surdo ao teclado, sem conseguir nem fechar via RETURN. É
  por isso que FR-009 (no máximo um visível) precisa de aplicação real, não
  só disciplina de quem usa o componente (ver D-010).
- **Foco neste projeto é majoritariamente de estado** (classe `.tv-focus`
  aplicada por React, não `document.activeElement`) — só telas de
  "roving DOM focus" (formulários com `<input>` real, via `useTvKeyNav`)
  usam foco nativo. Os componentes novos que gerenciam foco próprio (nenhum
  gerencia — ver D-009/D-006: são todos "burros", o índice focado é do
  consumidor) não precisam chamar `.focus()` em nada.
- **`tsconfig.app.json`** restringe `types` a `["vite/client"]` — qualquer
  teste que precise de `node:fs`/`process` (nenhum previsto aqui) precisa do
  `/// <reference types="node" />` (achado da feature 021).
- **`oxlint(only-export-components)`** reclama de um arquivo exportar
  componente + constante juntos (já visto em `PlayerControls.tsx`) — os
  dados de variante (`iconPaths.ts`-like) ficam em arquivo `.ts` separado
  do componente, mesmo padrão da feature 021.

**Scale/Scope**: 16 componentes novos + 1 hook (`useOnlineStatus`) + 1
registro de dados (`comingSoon.ts`) + 1 arquivo de estilos
(`styles/components.css`). Nenhum arquivo de tela é tocado.

## Decisões Invariantes

- **D-001 — CSS num arquivo só, camada nova.** Todo CSS desta feature fica
  em `tv-web/src/styles/components.css`, importado em `main.tsx` depois de
  `styles/utilities.css` e antes de `features/screens.css` (mesma regra de
  camadas da feature 021, D-007: token → utilitário → componente → tela).
  Um arquivo só, não um por componente — mesmo padrão que `screens.css` já
  usa pra todas as telas do app.
- **D-002 — `Button`.** `src/components/Button.tsx`. Props: `variant:
  'primary' | 'secondary' | 'ghost' | 'accent'`, `icon?: IconName`,
  `loading?: boolean`, `disabled?: boolean`, `onSelect: () => void`,
  `children` (rótulo). Renderiza um `<button>` real (ativa por Enter/click
  nativos — é um elemento de "roving DOM focus" quando usado num
  formulário, e a tela que o focar via `.tv-focus`/estado dispara
  `onSelect` diretamente, os dois caminhos convivem como já acontece hoje
  com `<button>` cru nas telas atuais). `disabled` usa `.is-hard-disabled`
  (feature 021) — sem foco, `aria-disabled`. `loading` desabilita clique
  (`aria-busy="true"`, sem `disabled` real pra não mudar semântica de
  foco) e nunca mostra número. Variantes = classe CSS (`.button-primary`
  etc.), cores só de token.
- **D-003 — `IconButton`.** `src/components/IconButton.tsx`. Props:
  `icon: IconName`, `label: string` (obrigatório — sem `label` opcional
  como `Icon`, porque um botão só de ícone SEMPRE precisa de nome
  acessível), `onSelect`, `disabled?`. Área mínima 52×52 via token de
  espaçamento; usa `Icon` (feature 021) com `label` repassado.
- **D-004 — `Chip`.** `src/components/Chip.tsx`. Props: `selected:
  boolean`, `children`, `onSelect?`. Selecionado usa `--accent-tint`/
  `--accent-tint-border` (já tokens da feature 021) **mais** um segundo
  sinal (borda mais grossa ou um glifo `✓`/check via `Icon`) — nunca só a
  cor de fundo, sempre com o texto do próprio chip como terceiro sinal
  (FR-026).
- **D-005 — `Tabs`.** `src/components/Tabs.tsx`. Props: `items: {id:
  string; label: string}[]`, `activeId: string`, `onSelect: (id: string)
  => void`. Puramente controlado (sem estado interno) — navegação por
  seta fica de quem usa (`useRemoteNav` externo chamando um índice), este
  componente só desenha e reporta ativação (FR-022: muda conteúdo só por
  SELECT, nunca por focar).
- **D-006 — `ContentCard` envolve `PosterArt`.** `src/components/
  ContentCard.tsx`. Props: `variant: 'portrait' | 'landscape' | 'wide' |
  'compact'`, `title`, `meta?: string`, `iconUrl?` (repassado direto pra
  `PosterArt` como `url`), `focused?`, `badge?: ReactNode` (progresso/
  assistido/AO VIVO — quem decide o conteúdo do badge é o consumidor,
  este componente só posiciona), `onSelect?`. Nunca reimplementa
  `<img>`/`onError`: sempre `<PosterArt url={iconUrl} title={title}
  focused={focused}>{badge}</PosterArt>` por dentro, com uma classe CSS de
  proporção (`.content-card-portrait` = 205×302 etc., via `aspect-ratio` +
  largura fixa, igual ao `.poster-box` já faz) envolvendo o `PosterArt` e
  o bloco de título/meta abaixo dele. Título com `text-overflow: ellipsis`
  + `-webkit-line-clamp` (trunca sem quebrar a altura do card, FR-017).
- **D-007 — `ChannelRow`.** `src/components/ChannelRow.tsx`. Props:
  `number: string`, `logoUrl?`, `name: string`, `nowPlaying?: string`
  (`undefined` = sem EPG, slot reservado vazio, nunca "0"/inventado),
  `progress?: number` (0–1, barra só se vier), `focused?`. Logo usa o
  mesmo par `<img>`+fallback do `PosterArt` (reaproveitado — não uma cópia
  da lógica: `ChannelRow` também renderiza `<PosterArt url={logoUrl}
  title={name} focused={focused} />` internamente, numa proporção
  compacta, igual ao `ContentCard`).
- **D-008 — `Rail` virtualizado de verdade.** `src/components/Rail.tsx`.
  Props: `items: T[]`, `renderItem: (item: T, index: number) =>
  ReactNode`, `focusedIndex: number`, `itemWidth: number` (px — geometria
  fixa, sem medição automática nesta v1: quem usa o `Rail` já sabe a
  largura do seu `ContentCard`/`ChannelRow`, evita a complexidade de
  `ResizeObserver` que a grade vertical precisou só porque suas colunas
  são fluidas). Por dentro: `useVirtualizer({ horizontal: true, count:
  items.length, getScrollElement, estimateSize: () => itemWidth, overscan:
  3 })` + `useVirtualFocusSync({ focusedIndex, scrollToIndex:
  virtualizer.scrollToIndex, enabled: items.length > 0 })` (reaproveitados
  tal qual da feature 009 — nenhuma lógica de scroll nova). `items.length
  === 0` retorna `null` (FR-016). Fade de borda: dois `::before`/`::after`
  com `mask-image`/gradiente, `position: sticky` nas bordas do contêiner
  (CSS puro, sem JS).
- **D-009 — `SideCategoryNav` burro.** `src/components/SideCategoryNav.tsx`.
  Props: `entries: {id: string; label: string; icon?: IconName; count?:
  number; pinned?: boolean}[]`, `selectedId: string`, `onSelect: (id:
  string) => void`. Ordena as `entries` recebidas colocando as com
  `pinned: true` primeiro, **na ordem em que vierem no array** (não
  reordena entre si) — quem monta o array já decide a ordem de "★
  Favoritos"/"↺ Histórico" antes das demais; este componente só garante
  que qualquer `pinned` fique acima de qualquer não-`pinned` (FR-021).
  `count` ausente = nenhum número desenhado (nunca "0").
- **D-010 — `Modal`: casca genérica + singleton por não-renderização.**
  `src/components/Modal.tsx`. Props: `onDirection?`, `onSelect?`, `onBack:
  () => void` (obrigatório — é o que fecha), `children`, `ariaLabel:
  string`. Por dentro: `useRemoteNav({ onDirection, onSelect, onBack },
  { modal: true })`, chamado **incondicionalmente enquanto o componente
  está montado** — o mecanismo de "foco volta a quem abriu" não é código
  deste componente, é a consequência de `stopImmediatePropagation`
  (Constraints acima): a tela por trás nunca vê o evento, seu estado de
  foco nunca muda, e quando o `Modal` desmonta, ela reage ao próximo
  evento exatamente de onde parou.

  **Singleton**: uma variável de módulo (`let activeModalId: symbol |
  null = null`) — no primeiro `useEffect` de montagem, se
  `activeModalId !== null`, este `Modal` **não registra** seu
  `useRemoteNav` nem renderiza `children` (renderiza só um contêiner
  vazio); se `activeModalId === null`, ele se registra como o ativo e
  desregistra no cleanup. Isso é FR-009 lido literalmente ("não permite
  duas instâncias VISÍVEIS") — não é uma pilha de modais aninhados (fora
  de escopo, nenhum consumidor precisa disso ainda), é só a garantia de
  que o segundo `<Modal>` montado por engano fica inerte e invisível, sem
  travar o primeiro. `role="dialog"`, `aria-modal="true"`,
  `aria-label={ariaLabel}`, `z-index: var(--z-overlay)`, fundo opaco (sem
  `backdrop-filter` — Spec V14 §28.2).
- **D-011 — `EmptyState`/`ErrorState`.** `src/components/EmptyState.tsx` +
  `ErrorState.tsx`. `EmptyState` props: `icon?: IconName`, `title`,
  `description?`, `action: {label: string; onSelect: () => void}`
  (exatamente uma, obrigatória — FR-010). `ErrorState` props: `icon?`,
  `title`, `description?`, `code?: string` (badge discreto,
  `data-testid="error-state-code"`, texto pequeno — FR-012), `actions:
  [{label,onSelect}] | [{label,onSelect},{label,onSelect}]` (1 ou 2, tipo
  TypeScript já impede 0 ou 3+ — FR-011). Cada ação é um `<button>` nativo
  com a classe `.button-secondary` — **a mesma classe visual que `Button`
  (D-002/US6) usa**, mas sem importar o componente `Button`: US1/US2 (P1)
  não podem depender de US6 (P3) pra ficarem independentemente entregáveis
  (regra do próprio template de tasks). As duas stories convergem pro
  mesmo visual via CSS compartilhado, nunca por import entre si.
- **D-012 — `OfflineBanner` com detecção real.** `src/lib/
  onlineStatus.ts` (`useOnlineStatus(): boolean`, inicializa de
  `navigator.onLine`, assina `online`/`offline` em `window`, remove no
  cleanup) + `src/components/OfflineBanner.tsx` (consome o hook; props
  só `onTestConnection: () => void`; quando `online` é `true`, retorna
  `null` — o banner nem existe no DOM enquanto conectado).
- **D-013 — `Spinner`.** `src/components/Spinner.tsx`. Prop `size: 20 |
  32 | 48`. `role="status"` com texto `sr-only` "Carregando" (feature
  021) — nunca number/percent.
- **D-014 — `Skeleton`.** `src/components/Skeleton.tsx`. Props: `width:
  number | string`, `height: number | string`, `variant?: 'rect' |
  'text'` (`rect` = cantos arredondados via `--radius-md`; `text` = barra
  fina, pra linhas de texto). Sem opacity-pulse quando `prefers-reduced-
  motion`/`.reduce-motion` (a mesma regra global da feature 021 já cobre
  isso — nenhum código extra aqui).
- **D-015 — `TextField`.** `src/components/TextField.tsx`. Props: `label:
  string`, `value`, `onChange`, `purpose: 'search' | 'url' | 'username' |
  'password' | 'text'`, `error?: string`, `id?` (gerado com `useId()` se
  ausente). Mapa fixo `purpose → {inputMode, type, autoComplete}`:
  `search→{inputMode:'search'}`, `url→{inputMode:'url',type:'url'}`,
  `username→{autoComplete:'username'}`, `password→{type:'password',
  autoComplete:'current-password'}`, `text→{}` (nenhum atributo especial,
  edge case "purpose não reconhecido" cai aqui pelo tipo TS + um `default`
  no mapa). `<label htmlFor={id}>` sempre visível (nunca vira
  placeholder). Com `error`: `aria-describedby={errorId}` +
  `aria-invalid="true"` + `<p id={errorId} className="text-field-error">`
  com um ícone (`Icon name="info"`) além da cor.
- **D-016 — `ComingSoon` + registro.** `src/lib/comingSoon.ts`: `export
  const COMING_SOON: Record<string, {message: string; backlogItem:
  number}>` com pelo menos uma entrada real de exemplo documentada (a
  primeira Onda 2 vai adicionar as suas). `export function
  getComingSoon(id: string)`: retorna a entrada ou lança
  `Error` (`` `ComingSoon: id "${id}" não registrado em comingSoon.ts` ``)
  — erro cedo, em qualquer ambiente (é erro de programação de quem usa a
  biblioteca, não algo que deva silenciar em produção). `src/components/
  ComingSoon.tsx`: props `id: string`, `focused?`, `onSelect?: () => void`
  (hook extra opcional, só para quem quiser reagir além do que já
  acontece por padrão). O feedback "Em breve" exigido por FR-035/US9-AC2 é
  responsabilidade do **próprio componente**, não do consumidor: ao
  ativar por SELECT/Enter, `ComingSoon` chama `useAnnounce()`
  (`tv-web/src/lib/announcer.ts`, feature 021 — mesma região `aria-live`
  que `Toast` já usa) anunciando `` `Em breve — ${message}` ``, e só depois
  invoca `onSelect?.()` se ele tiver sido passado. Isso garante que o
  Independent Test de US9 (renderizar `ComingSoon` isolado, sem nenhum
  consumidor externo) já prova FR-035 sozinho — não depende de um
  `onSelect` ser fornecido. Usa `Icon`, aplica `.is-soft-disabled`
  (feature 021).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Não se aplica. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Nenhum segredo — `TextField` de senha é só o atributo `type="password"`/`autocomplete`, sem armazenar nada. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Não se aplica — `SideCategoryNav` não sabe o que é categoria real (D-009). |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | `ComingSoon` nunca mostra dado inventado (FR-034), só a mensagem registrada. |
| Comandos Locais Independem de Rede | ✅ | ✅ | `OfflineBanner` lê estado local do navegador, sem chamada de rede própria. |
| Trailers e Metadados Não Alteram o Estado | ✅ | ✅ | Não se aplica. |
| Toda Ação Essencial por Controle Remoto | ✅ | ✅ | Todo componente interativo é ativável por SELECT/Enter — nenhum depende de mouse (D-002–D-016 usam `<button>` real ou `useRemoteNav`). |
| Lista de Catálogo ≠ Manifesto | ✅ | ✅ | Não se aplica. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Núcleo de US1/US2: `Modal` nunca deixa foco escapar (D-010), `EmptyState`/`ErrorState` sempre têm ação alcançável (D-011, contrato C2). Nenhum estado (disabled, loading, erro) comunica só por cor. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | `Modal` fechado por RETURN devolve o controle exatamente à tela por trás, pelo mecanismo de interceptação (D-010, contrato C1) — não por índice, porque o estado da tela nunca mudou. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Não se aplica. |
| Progresso e Capacidades São Reais | ✅ | ✅ | `Spinner` nunca mostra percentual (FR-027); `OfflineBanner` reflete conectividade real, não um prop estático (FR-029, D-012). |
| Documentação do Repositório É Canônica | ✅ | ✅ | O Polish atualiza `CLAUDE.md` com o resumo da Onda 1. |
| Restrição: Design system de TV | ✅ | ✅ | Toda a feature É a implementação desse princípio — tokens em vez de literais (FR-001, contrato C5 confere `ContentCard`). |
| Restrição: plataforma-alvo Chromium 108 | ✅ | ✅ | Nenhuma API nova além do que a feature 021 já validou (`@tanstack/react-virtual` já em uso desde a feature 009). |
| Fluxo: testes automatizados + E2E antes da TV | ✅ | ✅ | `vitest` por task; `npm run test:e2e` no Polish, sem tela tocada então sem E2E novo — só confere que os existentes continuam verdes. |

Sem violações. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/022-biblioteca-componentes-ds-v14/
├── spec.md
├── plan.md                    # este arquivo
├── quickstart.md              # verificação manual (leitor de tela, teclado, reduced motion herdado)
├── contract-tests.lock        # 5 contratos travados
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/src/
├── main.tsx                              # + import styles/components.css
├── styles/
│   └── components.css                    # NOVO — CSS dos 16 componentes (D-001)
├── lib/
│   ├── onlineStatus.ts                   # NOVO (stub) — useOnlineStatus, CONTRATO C? não, unit only
│   └── comingSoon.ts                     # NOVO (stub) — registro + getComingSoon
└── components/
    ├── Button.tsx (+ .test.tsx)          # NOVO
    ├── IconButton.tsx (+ .test.tsx)      # NOVO
    ├── Chip.tsx (+ .test.tsx)            # NOVO
    ├── Tabs.tsx (+ .test.tsx)            # NOVO
    ├── ContentCard.tsx (+ .test.tsx)     # NOVO
    ├── ContentCard.biblioteca-componentes.contract.test.tsx  # CONTRATO C5
    ├── ChannelRow.tsx (+ .test.tsx)      # NOVO
    ├── Rail.tsx (+ .test.tsx)            # NOVO (stub)
    ├── Rail.biblioteca-componentes.contract.test.tsx          # CONTRATO C3
    ├── SideCategoryNav.tsx (+ .test.tsx) # NOVO
    ├── Modal.tsx (+ .test.tsx)           # NOVO (stub)
    ├── Modal.biblioteca-componentes.contract.test.tsx          # CONTRATO C1, C4
    ├── EmptyState.tsx (+ .test.tsx)      # NOVO (stub)
    ├── ErrorState.tsx (+ .test.tsx)      # NOVO (stub)
    ├── EmptyErrorState.biblioteca-componentes.contract.test.tsx  # CONTRATO C2
    ├── OfflineBanner.tsx (+ .test.tsx)   # NOVO
    ├── Spinner.tsx (+ .test.tsx)         # NOVO
    ├── Skeleton.tsx (+ .test.tsx)        # NOVO
    ├── TextField.tsx (+ .test.tsx)       # NOVO
    └── ComingSoon.tsx (+ .test.tsx)      # NOVO
```

**Structure Decision**: continua tudo em `tv-web/`, `src/components/` (já a
pasta dos componentes compartilhados desde a feature 011/015/021). CSS novo
em `styles/components.css` (D-001), nunca em `features/screens.css`.
Nenhuma pasta nova de nível 1.

## Complexity Tracking

> **Preencher SOMENTE se o Constitution Check tiver violações que precisam ser justificadas**

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

- **Contratos (5, travados)**: definem pronto para US1 (Modal, EmptyState/
  ErrorState, Rail) e cobrem dois riscos "traiçoeiros" adicionais (Modal
  singleton; ContentCard realmente reaproveitando `PosterArt` com geometria
  estável).
- **Unitários** (escritos no execute, um arquivo por componente): os 16
  componentes, cada estado aplicável (SC-001) — `Button`/`IconButton`/
  `Chip`/`Tabs`/`ChannelRow`/`SideCategoryNav`/`OfflineBanner`/`Spinner`/
  `Skeleton`/`TextField`/`ComingSoon` não têm contrato dedicado (P2/P3, sem
  o risco que justifica travar), mas têm teste unitário comum.
- **Regressão**: suíte completa (858+ testes da feature 021) precisa
  continuar 100% verde — nenhum arquivo de tela é tocado (FR-003/SC-006),
  então não há superfície de regressão além de `main.tsx` (só ganha mais um
  import de CSS).
- **E2E**: nenhum roteiro novo (nenhuma tela muda). No Polish, rodar
  `npm run test:e2e` inteiro só para confirmar zero regressão, mesma
  disciplina da feature 021.
- **Manual**: `quickstart.md` cobre navegação por teclado do `Modal`/
  `Tabs`/`SideCategoryNav` no navegador, e reduzir movimento (herdado da
  feature 021, sem código novo) aplicado ao `Skeleton`/transições dos
  componentes novos.

Comandos-base (em `tv-web/`):

```powershell
npx tsc -b
npm run lint
npx vitest run
npm run build
npm run dev                  # outro terminal, só para test:e2e no Polish
npm run test:e2e
```

### Testes de Contrato

Arquivos a travar em `contract-tests.lock`:
- `tv-web/src/components/Modal.biblioteca-componentes.contract.test.tsx` (2 casos: C1, C4)
- `tv-web/src/components/EmptyErrorState.biblioteca-componentes.contract.test.tsx` (1 caso: C2)
- `tv-web/src/components/Rail.biblioteca-componentes.contract.test.tsx` (1 caso: C3)
- `tv-web/src/components/ContentCard.biblioteca-componentes.contract.test.tsx` (1 caso: C5)

Comando (em `tv-web/`):
`npx vitest run src/components/Modal.biblioteca-componentes.contract.test.tsx src/components/EmptyErrorState.biblioteca-componentes.contract.test.tsx src/components/Rail.biblioteca-componentes.contract.test.tsx src/components/ContentCard.biblioteca-componentes.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| C1 `Modal intercepta teclado — setas/SELECT vão pro conteúdo do modal, RETURN chama onBack, e a tela por trás não recebe nada enquanto ele está aberto` | US1/AC1–AC3 · FR-006–FR-008 · Constitution: Foco Visível / Voltar Restaura Foco | Fase 3 (US1) | `Error: not implemented` |
| C2 `EmptyState com 1 ação e ErrorState com 1 ou 2 ações sempre têm elemento(s) ativável(is) por click/Enter, e o código aparece só quando informado` | US2/AC1–AC4 · FR-010–FR-013 · Constitution: Foco Visível | Fase 4 (US2) | `Error: not implemented` |
| C3 `Rail com 500 itens nunca monta mais que a janela virtual + overscan, e rolar monta itens novos` | US3/AC1–AC2 · FR-014 · SC-002 | Fase 5 (US3) | `Error: not implemented` |
| C4 `um segundo Modal montado enquanto o primeiro está aberto não renderiza conteúdo nem intercepta teclado; ao desmontar o primeiro e montar de novo, o novo passa a funcionar` | FR-009 · D-010 | Fase 3 (US1) | `Error: not implemented` |
| C5 `ContentCard usa o PosterArt de verdade (mesma <img>/fallback, sem <img> duplicada) e as 4 variantes têm dimensões fixas e distintas` | US4/AC1–AC2/AC5 · FR-017–FR-018 · SC-005 | Fase 6 (US4) | `Error: not implemented` |

Stubs criados pelo plan (ponto de partida do execute, não travados):
- `tv-web/src/components/Modal.tsx`
- `tv-web/src/components/EmptyState.tsx`
- `tv-web/src/components/ErrorState.tsx`
- `tv-web/src/components/Rail.tsx`
- `tv-web/src/components/ContentCard.tsx`

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup/Foundational | Concluído — baseline registrada (T001), `styles/components.css` criado e importado em `main.tsx` entre `utilities.css` e `screens.css` (T002/T003). |
| US1 (Modal) | Concluído — singleton por variável de módulo, `useRemoteNav({modal:isActive})`. Contratos C1/C4 verdes. |
| US2 (EmptyState/ErrorState) | Concluído — `.button-secondary` nativo, sem depender de `Button` (D-011). Contrato C2 verde. |
| US3 (Rail) | Concluído — `@tanstack/react-virtual` horizontal + `useVirtualFocusSync` reaproveitados. Contrato C3 verde. |
| US4 (ContentCard/ChannelRow) | Concluído — ambos delegam no `PosterArt` real, geometria fixa por variante. Contrato C5 verde (asserção corrigida, R-005). |
| US5 (SideCategoryNav/Tabs) | Concluído — componentes burros, partição explícita pra `pinned`. |
| US6 (Button/IconButton/Chip) | Concluído — `Button` reaproveita `.button-secondary` da US2. `Chip` usa glifo `✓` (nenhum ícone "check" nos 17 da feature 021). |
| US7 (Spinner/Skeleton/OfflineBanner) | Concluído — `OfflineBanner` com detecção real (`navigator.onLine` + eventos). |
| US8 (TextField) | Concluído — mapa fixo `purpose → atributos IME`, sem encadeamento entre campos. |
| US9 (ComingSoon) | Concluído — anuncia "Em breve" por conta própria (FR-035), sem depender de `onSelect` do consumidor (correção do achado A-001). |
| Polish | Concluído — SC-001/003/006/007 conferidos, SC-002 pelo contrato C3, SC-004 pelo contrato C2 + teste de `ComingSoon`, SC-005 só parcial (R-004). `CLAUDE.md` atualizado. |
| Suíte | 909 testes: 907 passando, 2 flakes de `*.favorites.test.tsx` sob paralelismo (18/18 isolados). 5/5 contratos verdes, trava íntegra. `tsc`/lint limpos. E2E 7/8 (`e2e.mjs` = bug pré-existente da 021). |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Dois `Modal` montados ao mesmo tempo deixariam o segundo surdo ao teclado (nenhum consegue nem fechar) se cada um registrasse seu próprio `useRemoteNav({modal:true})` sem coordenação — ordem de registro dos listeners de captura decide quem "vence", e não é o mais recente. | Alto se acontecesse (controle remoto preso). | D-010: singleton por variável de módulo — o segundo `Modal` não registra `useRemoteNav` nem renderiza conteúdo enquanto o primeiro estiver ativo. Contrato C4 prova o efeito. |
| R-002 | `Rail` sem medição automática de largura (D-008, ao contrário da grade vertical que usa `usePosterColumnWidth`/`ResizeObserver`) exige que quem o consome sempre saiba a largura exata do item — se estiver errada, a virtualização desalinha. | Médio (é erro de uso, não do componente). | Documentado explicitamente na prop `itemWidth` e no `quickstart.md`. Reavaliar se a Onda 2 mostrar necessidade real de medição automática — não anexar essa complexidade sem um caso de uso concreto. |
| R-003 | `ComingSoon`/`comingSoon.ts` lançando `Error` para id não registrado poderia derrubar uma tela inteira em produção se alguém errar o id ao copiar/colar. | Baixo (só acontece por erro de programação, pego em teste/dev antes de qualquer tela real usar isso — nenhuma tela usa `ComingSoon` ainda). | Aceito: o objetivo é falhar alto e cedo (constitution: nunca inventar dado — silenciar um id errado seria pior, mostraria um `ComingSoon` com mensagem indefinida). Reavaliar só se uma tela real vier a montar `ComingSoon` com um id vindo de dado dinâmico (hoje sempre é literal no código). |
| R-004 | SC-005 pede dimensões idênticas entre `ContentCard` e `Skeleton` da mesma variante, "medido em teste" — mas `Skeleton` (D-014) é genérico (`width`/`height` livres, sem as 4 variantes do `ContentCard`), e nenhuma tela real ainda combina os dois (FR-003), então a igualdade byte-a-byte não é observável nesta feature. | Baixo (SC-005 é de uma story P3, sem consumidor real ainda). | Aceito parcialmente: esta feature garante que `Skeleton` aceita geometria controlável e a aplica corretamente (T043); a comparação real com um `ContentCard` montado lado a lado fica para quando a Onda 2 de fato consumir os dois na mesma tela — achado A-002 do Analyze do `sdd-plan`, 2026-09-26. |
| R-005 | Contrato C5 (travado) usava `screen.getByText('pôster')` (busca exata) para provar que `ContentCard` delega no `PosterArt` real — mas o rótulo do `PosterArt` (feature 015) tem "pôster" e o título no mesmo `<span>`, separados por `<br/>`; Testing Library concatena só os nós de texto diretos do elemento ("pôsterFilme Exemplo"), então uma busca exata por "pôster" nunca bate — confirmado empiricamente com um teste de sanidade isolado do `PosterArt`, sem `ContentCard` no meio. | Médio (bloqueava US4/P2 sem violar nenhuma Decisão Invariante — só a asserção do teste estava tecnicamente errada). | **Resolvido** (aprovado pelo usuário, 2026-09-26, sdd-execute Fase 6): trocada a asserção para `getByText('pôster', { exact: false })` — mesma verificação (o texto "pôster" está presente no rótulo), sem tocar em `PosterArt`. Trava regravada (`check-contract-tests.ps1 -Write`). |
| R-006 | FR-006 diz que o `Modal` "coloca o foco no primeiro elemento focável do seu conteúdo" ao abrir, e o edge case da spec pede um destino de recuperação se quem abriu não existir mais. O `Modal` implementado (D-010) **não** move foco nem escolhe qual filho começa focado: neste projeto o foco é de estado (`.tv-focus` aplicada por quem renderiza), e o conteúdo (`children`) é do consumidor. O que o componente garante é interceptação imediata do teclado desde o primeiro evento (`useRemoteNav({modal:true})`) e que o estado da tela por trás nunca muda enquanto ele está aberto — logo "voltar a quem abriu" acontece sozinho. | Médio: é uma leitura de FR-006/edge case, não uma implementação literal; pode ser apontada pelo `sdd-converge`. Sem consumidor real ainda (FR-003), então nenhum fluxo é afetado hoje. | Aberto, decisão registrada na execução (2026-09-26). Quem consumir o `Modal` na Onda 2 passa o conteúdo já com o primeiro item focado por estado; se um destino de recuperação explícito for necessário (opener desmontado durante o modal), isso vira comportamento do consumidor ou uma emenda ao `Modal` — não inventar antes de existir um caso real. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-26 | Setup + Foundational | Baseline registrada (7 failed/856 passed — 5 contratos stub + 2 flakes conhecidas); `styles/components.css` criado e importado em `main.tsx`. | Nenhuma. |
| 2026-09-26 | US1 (Modal) | `Modal.tsx` implementado — singleton via `activeModalId`, `useRemoteNav({modal:isActive})` chamado incondicionalmente (regra dos hooks) com handlers vazios quando inativo. CSS usa o token `--player-zap-scrim` já existente pro fundo opaco. Contratos C1/C4 verdes de primeira, 4/4 testes (contrato + unitário). | Nenhuma. |
| 2026-09-26 | US2 (EmptyState/ErrorState) | Implementados com `<button className="button-secondary">` nativo (D-011 revisado no `sdd-plan` — sem depender de `Button`/US6). Contrato C2 verde de primeira, 5/5 testes. | Nenhuma. |
| 2026-09-26 | US3 (Rail) | `Rail.tsx` implementado com `@tanstack/react-virtual` horizontal + `useVirtualFocusSync`, sem lógica de scroll nova. Fade de borda via `mask-image` (mais simples que `::before`/`::after`, sem custo de camada extra — pequeno desvio de D-008, efeito visível idêntico). Contrato C3 verde de primeira, 3/3 testes. | Nenhuma. |
| 2026-09-26 | US4 (ContentCard/ChannelRow) | Implementados delegando no `PosterArt` real. Achado real no contrato C5: `getByText('pôster')` exato nunca bate com a estrutura do `PosterArt` (texto quebrado por `<br/>`) — corrigido com aprovação do usuário para `{exact:false}` (R-005), trava regravada. 4/4 testes unitários + contrato verdes. | Nenhuma. |
| 2026-09-26 | US5 + US6 | `SideCategoryNav`/`Tabs` (P2) e `Button`/`IconButton`/`Chip` (P3) implementados, sem contrato (nenhum risco de foco novo). `Chip` usa `✓` literal em vez de `Icon` — nenhum dos 17 ícones cobre "check". 11/11 testes unitários verdes. | Nenhuma. |
| 2026-09-26 | US7 + US8 | `Spinner`/`Skeleton`/`OfflineBanner` (detecção real de conectividade) e `TextField` (mapa fixo de `purpose`) implementados, sem contrato. 15/15 testes unitários verdes. | Nenhuma. |
| 2026-09-26 | US9 (ComingSoon) | Implementado conforme D-016 revisado (achado A-001 corrigido no `sdd-plan`) — anuncia "Em breve" por conta própria via `useAnnounce()`. 5/5 testes verdes, todas as 9 stories completas. | Nenhuma. |
| 2026-09-26 | Polish | SC-001 reforçado (+4 testes), SC-003 por grep, regressão completa (907/909, 2 flakes conhecidas isoladamente verdes), E2E 7/8 (mesma falha pré-existente da 021), `CLAUDE.md` atualizado, R-006 registrado (foco do `Modal`). Todas as 56 tasks de `tasks.md` marcadas. | Flakes `*.favorites.test.tsx` sob paralelismo; R-004 e R-006 abertos para o converge. |

**PRÓXIMO**: `sdd-converge` na feature 022 — auditar código contra spec/plan, em especial R-006 (FR-006 do `Modal` lido como "teclado interceptado", não "foco movido") e R-004 (SC-005).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/styles/components.css` (D-001, CSS dos 16 componentes) + `tv-web/src/main.tsx` (import entre `utilities.css` e `screens.css`)
- `tv-web/src/components/`: os 16 componentes (`Modal`, `EmptyState`, `ErrorState`, `Rail`, `ContentCard`, `ChannelRow`, `SideCategoryNav`, `Tabs`, `Button`, `IconButton`, `Chip`, `Spinner`, `Skeleton`, `OfflineBanner`, `TextField`, `ComingSoon`), cada um com seu `.test.tsx`; 4 arquivos `*.biblioteca-componentes.contract.test.tsx` travados
- `tv-web/src/lib/onlineStatus.ts`, `tv-web/src/lib/comingSoon.ts` (+ testes)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **Mock de `ResizeObserver`/`offsetWidth` em teste de `Rail`**: mesma
  técnica de `MoviesScreen.test.tsx` (`Object.defineProperty` em
  `HTMLElement.prototype`), mas para `offsetWidth` (rail é horizontal) em
  vez de `offsetHeight`/`offsetWidth` combinados da grade vertical.
- **`.css?raw`/`.css?inline` sob Vitest voltam vazio** — se algum teste
  precisar ler `styles/components.css`, usar `node:fs` +
  `/// <reference types="node" />`, como `tokens.test.ts` da feature 021.
