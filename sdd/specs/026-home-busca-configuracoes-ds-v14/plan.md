# Implementation Plan: Home definitiva, Busca global e Configurações no Design System V14 (Onda 5)

**Slug**: `026-home-busca-configuracoes-ds-v14` | **Date**: 2026-09-27 | **Spec**: `sdd/specs/026-home-busca-configuracoes-ds-v14/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Troca o conteúdo provisório do Início (`ListHomeScreen`, feature 023) pela
Home definitiva do DS V14: hero (Continuar → favorito → boas-vindas) com
retomada direta por cima do Início, rails reais ("Continuar assistindo",
"Minha Lista", "Canais favoritos") e mocks honestos (Curadoria IA, dock).
A lupa e a engrenagem da topbar deixam de ser "Em breve" em todas as telas
com topbar: a **Busca global** pesquisa canais, filmes e séries já lidos da
lista ativa (motor da 018, mínimo de 2 caracteres, aviso de cobertura
somado), e **Configurações** ganha seis abas — Fontes IPTV (gestão completa
de listas + Modo limitado), Acessibilidade ("Reduzir movimento" real) e
Sobre reais; Integrações, Player e Perfis & parental como "Em breve". A
tela de perfis mantém as ações por cartão (decisão do usuário no plan,
preserva a trava da 023) e ganha "Gerenciar listas".

Abordagem: dois motores locais puros novos em `lib/catalog/` (`homeHero.ts`,
`globalSearch.ts`), três telas em `features/` (`HomeContent` dentro do
`HomeScreen` existente, `SearchScreen`, `SettingsScreen`), extração dos
pedaços de gestão de lista compartilhados com `ProfilesScreen` para
`features/sources/`, e extensões **aditivas** no redutor `appNav` (telas
`search`/`settings`, ação `go-home`, campos opcionais em `live`/`movies`/
`series`) — sem editar nenhuma trava de contrato de outra feature.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Vite 8 (`build.target: 'chrome108'`)

**Primary Dependencies**: `@tanstack/react-query` (consultas locais), `@tanstack/react-virtual` (via `Rail`), Dexie (IndexedDB), componentes V14 da feature 022 (`Rail`, `ContentCard`, `ChannelRow`, `Skeleton`, `EmptyState`, `ErrorState`, `Modal`, `Button`, `SideCategoryNav`, `TextField`, `ComingSoon`), shell da 023 (`AppShell`, `TopBar`, `ExitModal`), `useRemoteNav` (ADR-009)

**Storage**: IndexedDB local (`channels`, `categories`, `userStates`, `sources`) — **nenhuma migração Dexie**. `localStorage` só para a preferência "Reduzir movimento" (já existe, feature 021).

**Testing**: Vitest + Testing Library + jsdom + `fake-indexeddb` (`src/setupTests.ts`); Playwright E2E (`tv-web/e2e.mjs`, `tv-web/e2e/*.mjs`) contra `npm run dev`

**Target Platform**: Samsung Tizen 8.0 / Chromium 108 (QN50Q60DAGXZD), palco 1920×1080

**Performance Goals**: busca responde ao digitar sem pausa perceptível com ~5.000 itens lidos (SC-005); rails virtualizadas (`Rail`), glow só no item focado

**Constraints**: client-first (ADR-008) — Home/Busca/Configurações nunca tocam rede; focar nunca reproduz nem consulta; nenhum segredo (URL/DNS/usuário/senha) em tela; mocks só pelo registro `comingSoon.ts` (ADR-011); tokens V14, nada literal

**Scale/Scope**: uso pessoal, uma lista ativa por vez (ADR-011 §3); dezenas–centenas de favoritos/progressos por lista

## Decisões Invariantes

- **D-001 — Nenhuma trava de outra feature é editada.** Consequências
  travadas: `HomeFocus` mantém as variantes `topbar` e `shortcuts` (contrato
  023); campos novos de `LiveShellProps`/`VodShellProps` são **opcionais**
  (contratos 024/025 constroem esses objetos com 4 campos e o `tsc -b` inclui
  testes); a tela de perfis mantém Ressincronizar/Editar/Excluir por cartão
  (contrato 023, decisão do usuário).
- **D-002 — Hero e busca são motores locais puros em `lib/catalog/`.**
  `loadHomeHero` e `loadGlobalSearchIndex`/`searchGlobal` só leem Dexie;
  proibido `ensureSeriesEpisodes`, `ensureCategory`, `storedEntries` ou
  qualquer conector (`logic/hero-home.md`, `logic/busca-global.md`).
- **D-003 — Busca global tem mínimo próprio (`GLOBAL_SEARCH_MIN_CHARS = 2`).**
  `SEARCH_MIN_CHARS` (3) e `searchIndex()` da 017/018 ficam intocados.
- **D-004 — Hero reproduz sem autoplay.** Filme ou episódio pelo
  `PlayerLayer` existente; conclusão e RETURN fecham a camada e devolvem o
  foco à ação primária. Próximo episódio só a partir do detalhe da série.
- **D-005 — Topbar real, por callback opcional.** `TopBar` ganha
  `onOpenSearch?`/`onOpenSettings?` e `currentItem` passa a aceitar
  `'search' | 'settings'`. Com callback: ícone normal e OK navega. Sem
  callback (só em testes que montam a topbar crua): soft disabled, OK não faz
  nada. O `App` sempre passa os dois. As entradas `search-global` e
  `settings` saem de `comingSoon.ts`.
- **D-006 — Navegação por extensão aditiva de `appNav`** (`logic/navegacao.md`):
  telas `search`/`settings`, ação `go-home`, campos opcionais `topbarFocus`,
  `openFavorites`, `initialChannel`. `back`/`open`/`switch-top` inalterados.
  "Início" na topbar de Live/Filmes/Séries/Busca/Configurações despacha
  `go-home`.
- **D-007 — Gestão de listas compartilhada, não duplicada.**
  `DeleteSourceModal`, `sourceFormat.ts` (`formatType`/`formatStatus`) e
  `LimitedModeNotice` vivem em `features/sources/`; `ProfilesScreen` e
  `SettingsScreen` importam de lá. Comportamento de `ProfilesScreen`
  inalterado.
- **D-008 — Plano de hardware no Início: `AppShell` fica montado.** A raiz
  do Início passa a ser `.screen.home-screen` com `AppShell` e `PlayerLayer`
  como filhos diretos; a regra existente `:root.video-plane-visible .screen >
  *:not(.player-overlay)` esconde a moldura sem remontar nada (o estado de
  foco das rails sobrevive). Diferente da Live (que só renderiza o player),
  porque a Home precisa voltar exatamente ao hero sem reler as rails.
- **D-009 — "Minha Lista" mistura filme e série por `favoritedAt`** via um
  hook novo `useMyListContent` (`logic/foco-home.md` §6); contagens N são de
  itens **resolvidos**.
- **D-010 — Foco por estado (ADR-009), restauração por id.** Início
  (`HomeFocus`), Busca (`SearchSnapshot`) e Configurações (`SettingsFocus`)
  guardam o foco de origem por id e o recebem de volta pelo `from` do
  `appNav`, mesmo padrão do `CategoryScreenSnapshot`.
- **D-011 — `ListHomeScreen` sai inteiro** (componente, 3 arquivos de teste,
  CSS do hub em `styles/home.css`). `LimitedModeNotice` sobrevive, movido.
- **D-012 — Versão do app vem do pacote Tizen.** `vite.config.ts` lê
  `version="…"` do `<widget>` de `CCPlayTv/config.xml` e define
  `__APP_VERSION__` (declarado em `src/vite-env.d.ts`); sem arquivo/atributo,
  o build falha — nunca uma versão inventada.
- **D-013 — Sem nova dependência npm, sem migração Dexie, sem arquivo novo
  emitido pelo build** (nada a acrescentar em `tizen_web_project.yaml`).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Nada novo exige login; Configurações abre sem lista ativa ("Gerenciar listas"). |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Fontes IPTV mostra só nome/tipo/estado (FR-024) — coberto por contrato (`painel.secreto` ausente do DOM). Nenhuma chave TMDB/OpenAI; abas BYOK são mock sem chave mascarada fictícia. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Busca não usa chips de gênero (fora de escopo); rails são favoritos/progresso reais. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Hero sem sinopse/nota/relevância; Curadoria IA = 1 card "Em breve"; contagens N reais; Sobre sem atribuição de serviço não usado. |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Hero/busca/rails leem só Dexie (D-002); contrato do hero prova série sem episódio → `open-detail`, sem buscar. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | Trailer é mock; nenhuma ação de metadado grava estado. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Gestão de lista por perfis **e** Configurações; busca com IME e RETURN em camadas (teclado → tela); modal de exclusão com RETURN. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto | ✅ | ✅ | Não toca importador. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Todo estado com focável (FR-046): hero de boas-vindas com ações reais, abas mock com "Voltar às abas", busca vazia com "Editar busca", "linha efetiva" quando uma rail some. SELECT ligado em tudo que tem `.tv-focus`. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | `HomeFocus`/`SearchSnapshot`/`SettingsFocus` por id (D-010); contrato do Início prova volta do player para "Continuar". Live não ganha memória de conteúdo (R-004). |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Hero parte de `stableId` (progresso/favorito) e resolve para id local; nunca URL. |
| Progresso e Capacidades São Reais, Nunca Prometidos | ✅ | ✅ | "Continuar" só com `isResumable`; cobertura "Busca em X de Y categorias" sempre visível (contrato). |
| Documentação do Repositório É Canônica | ✅ | ✅ | Tasks de docs no Polish (CLAUDE.md, backlog, roteiro da migração, comentários que citam `ListHomeScreen`). |

Sem violações — `Complexity Tracking` vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/026-home-busca-configuracoes-ds-v14/
├── spec.md
├── plan.md                 # este arquivo
├── quickstart.md
├── contract-tests.lock     # 5 testes travados
├── logic/
│   ├── hero-home.md
│   ├── foco-home.md
│   ├── busca-global.md
│   ├── foco-configuracoes.md
│   └── navegacao.md
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── vite.config.ts                         # D-012: define __APP_VERSION__
├── e2e.mjs, e2e/*.mjs                     # E2E (entradas pelo Início mudam)
└── src/
    ├── App.tsx                            # rotas search/settings, go-home, callbacks da topbar
    ├── vite-env.d.ts                      # declare const __APP_VERSION__
    ├── navigation/appNav.ts               # AppScreen/HomeFocus/ações (D-006)
    ├── lib/
    │   ├── comingSoon.ts                  # mocks novos; sai search-global/settings
    │   └── catalog/
    │       ├── homeHero.ts                # NOVO (stub) + contrato
    │       └── globalSearch.ts            # NOVO (stub) + contrato
    ├── components/TextField.tsx           # + inputRef opcional
    ├── features/
    │   ├── catalog/catalogApi.ts          # useHomeHero (stub), useMyListContent, useGlobalSearchIndex, invalidações
    │   ├── home/HomeScreen.tsx            # shell + player + escopos (existe)
    │   ├── home/HomeContent.tsx           # NOVO: hero + rails + mocks
    │   ├── list-home/                     # REMOVIDO (LimitedModeNotice → sources/)
    │   ├── sources/                       # NOVO: DeleteSourceModal, sourceFormat, LimitedModeNotice
    │   ├── search/SearchScreen.tsx        # NOVO
    │   ├── settings/SettingsScreen.tsx    # NOVO (stub) + painéis
    │   ├── profiles/ProfilesScreen.tsx    # + "Gerenciar listas"; usa features/sources
    │   ├── shell/TopBar.tsx               # D-005
    │   ├── live/LiveScreen.tsx            # initialChannel/openFavorites/initialTopbarItem, shell opcional search/settings
    │   └── vod/VodCatalogScreen.tsx (+ vodShell.ts, movies/, series/)   # idem
    └── styles/                            # home.css (reescrito), search.css, settings.css (novos, importados em main.tsx)
```

**Structure Decision**: frontend único em `tv-web/` (o `api/` congelado não é
tocado). Lógica sem React em `tv-web/src/lib/catalog/`; hooks React Query em
`features/catalog/catalogApi.ts`; uma pasta por tela em `features/`; CSS por
área em `src/styles/` (padrão das features 021–025).

## Complexity Tracking

> **Preencher SOMENTE se o Constitution Check tiver violações que precisam ser justificadas**

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (em `tv-web/`):

```powershell
npx tsc -b
npm run lint
npx vitest run <arquivo ou pasta>      # o mais estreito primeiro
npx vitest run                          # suíte completa
npm run build
npm run build:tizen
npm run dev                             # outro terminal, para os E2E
npm run test:e2e
```

Unitários novos (fora dos contratos) cobrem: redutor `appNav` (search/
settings/`go-home`/`standalone`/`topbarFocus`), `useMyListContent`,
`TopBar` com e sem callbacks, `SearchScreen` (IME/RETURN em camadas,
restauração por snapshot, estado vazio), painéis de Configurações
(acessibilidade, sobre, mocks, editar/ressincronizar, foco após excluir),
`HomeContent` (linhas ausentes, linha efetiva, "Ver todos", mocks),
`LiveScreen` com `initialChannel`.

Os testes existentes do hub (`ListHomeScreen*.test.tsx`) são removidos junto
com o componente; os de `HomeScreen.test.tsx`/`TopBar.test.tsx`/
`AppShell.test.tsx`/`ProfilesScreen.test.tsx` que dependiam do hub ou dos
mocks "Em breve" da topbar são **atualizados** (não são contrato).

E2E: todos os roteiros que entravam pelos atalhos grandes do Início passam a
entrar pela topbar; um roteiro novo `tv-web/e2e/home-busca-configuracoes.mjs`
cobre hero/rails, busca e Configurações, e entra em `test:e2e`.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:

- `tv-web/src/lib/catalog/homeHero.home-busca-configuracoes-ds-v14.contract.test.ts` (2)
- `tv-web/src/lib/catalog/globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts` (1)
- `tv-web/src/features/home/HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` (1)
- `tv-web/src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` (1)

Comando (em `tv-web/`):

```powershell
npx vitest run src/lib/catalog/homeHero.home-busca-configuracoes-ds-v14.contract.test.ts src/lib/catalog/globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts src/features/home/HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx
```

Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 026-home-busca-configuracoes-ds-v14`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| `loadHomeHero` — com progresso: item mais recente de "Continuar" que resolve; episódio vira série e a ação reproduz o episódio na posição | FR-002, FR-004, FR-005, US1/AC1, US1/AC5, SC-001, Constitution: Identidade de Reprodução | Fase 2 | `Error: not implemented` |
| `loadHomeHero` — sem progresso: favorito mais recente que resolve; série sem episódio → `open-detail`; sem favorito → boas-vindas | FR-002, FR-003, FR-006, US1/AC2-3, Constitution: IA Nunca Inventa, Comandos Locais | Fase 2 | `Error: not implemented` |
| `searchGlobal` — agrupa por tipo, normalização da 018, mínimo 2, cobertura somada | FR-037..FR-039, US3/AC2-3, Constitution: Progresso e Capacidades São Reais | Fase 2 | `Error: not implemented` |
| `HomeScreen` — "Continuar" focado; OK retoma por cima na posição; fechar devolve o foco | US1/AC1, US1/AC4, FR-004, FR-005, FR-007, FR-020, SC-001, Constitution: Voltar Restaura Foco | Fase 3 | `expect(element).not.toBeInTheDocument()` (grupo "Atalhos" do hub ainda presente) |
| `SettingsScreen` — Fontes IPTV sem credencial, lista ativa, Modo limitado; Excluir com confirmação | US2/AC1-2, US2/AC5, FR-022..FR-025, FR-028, SC-004, Constitution: Segredos | Fase 4 | `Unable to find an accessible element with the role "button" and name /Fontes IPTV/` |

Saída vermelha confirmada em 2026-09-27: 5/5 falhando pelos motivos acima;
`tsc -b` limpo; suítes de `features/{home,list-home,catalog,profiles,shell}`
com 157/157 verdes fora o contrato novo.

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/lib/catalog/homeHero.ts`, `tv-web/src/lib/catalog/globalSearch.ts`,
`tv-web/src/features/settings/SettingsScreen.tsx`, `useHomeHero`/`HomeHeroOut`
em `tv-web/src/features/catalog/catalogApi.ts`, props opcionais novas em
`tv-web/src/features/home/HomeScreen.tsx` (`onOpenContinueWatching` ficou
opcional só até ser removida).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 1 (Setup) | Concluída — `__APP_VERSION__`/`vite-env.d.ts`; `comingSoon.ts` com os 18 mocks corretos. |
| Fase 2 (Foundational) | Concluída — motores `homeHero`/`globalSearch`, hooks `useHomeHero`/`useMyListContent`/`useGlobalSearchIndex`, `appNav` estendido (D-006), `TopBar` real (D-005), `features/sources/` extraído (D-007), campos opcionais em `LiveShellProps`/`VodShellProps` (D-001). Contratos da fase (2 `loadHomeHero` + 1 `searchGlobal`) verdes; travas 023/024/025/026 íntegras. |
| Fase 3 (US1 — Home) | Concluída — `HomeContent`/`HomeScreen` novos, `LiveScreen`/`VodCatalogScreen`/`MoviesScreen`/`SeriesScreen` com `initialChannel`/`openFavorites`/`initialTopbarItem`, `App.tsx` ligado, hub antigo removido. Contrato `HomeScreen` verde; travas 023/024/025/026 íntegras. Falta a verificação manual de US1/AC1–AC12 no navegador (Polish). |
| Fase 4 (US2 — Configurações) | Concluída — `SettingsScreen` completo (Fontes IPTV/Acessibilidade/Sobre reais + 3 abas mock), `ProfilesScreen` com "Gerenciar listas", `App.tsx` ligado (engrenagem em todas as telas com topbar). Contrato `SettingsScreen` verde; travas 023/024/025/026 íntegras. Falta a verificação manual de US2/AC1–AC13 no navegador (Polish). |
| Fase 5 (US3 — Busca) | Concluída — `SearchScreen.tsx` (campo com IME real, cobertura, rails por tipo, vazio, RETURN em camadas, `SearchSnapshot`), `App.tsx` ligado (rota `search`, `switch-top` para Configurações), `styles/search.css`. Contrato `globalSearch` verde; travas 023/024/025/026 íntegras. Falta a verificação manual de US3/AC1–AC7 no navegador (Polish). |
| Fase 6 (Polish) | Concluída (T036–T040). Gate final: `tsc -b`/lint limpos, `npx vitest run` 1212/1218 (6 = flake conhecido sob paralelismo, 94/94 isolados), `build`/`build:tizen` verdes (sync Tizen sem arquivo fora da lista), `npm run test:e2e` (12 scripts encadeados) 100% verde. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Travas de contrato das features 023/024/025 restringem tipos e a tela de perfis (achado no plan: o 3º teste da 023 exercita Excluir pelos cartões). | Tirar as ações dos perfis ou tornar campos de shell obrigatórios quebraria travas convergidas. | Resolvido: decisão do usuário (2026-09-27) — perfis **mantêm** as ações; spec revista (FR-032, Clarifications). D-001 torna os campos novos opcionais e mantém `HomeFocus.shortcuts`. Confirmado no `sdd-converge`: travas 023/024/025 íntegras, `ProfilesScreen.tsx` mantém Editar/Ressincronizar/Excluir por cartão e ganhou "Gerenciar listas" (FR-032). |
| R-002 | Live agora pode ser aberta a partir da Busca; "Início" na topbar da Live era `back` (D-004 da 024). | `back` voltaria à Busca em vez do Início. | Resolvido: ação nova `go-home` (D-006); contrato 024 (`switch-top` + `back`) intocado. Confirmado no `sdd-converge` e por `live-tv-ds-v14.mjs`/`home-busca-configuracoes.mjs` (RETURN a partir de Filmes/Live volta sempre ao Início, nunca à Busca). |
| R-003 | Custo de render de hero + várias rails na TV (risco R-2 do roteiro da migração). | Possível lentidão ao abrir o Início na TV. | `Rail` virtualizada, glow só no focado; medição na TV física recomendada (quickstart), não gate. |
| R-004 | Voltar da Busca/Configurações para a Live restaura só o foco da topbar (lupa/engrenagem), não categoria/canal — a Live não tem memória de conteúdo (fora de escopo desde a 025). | Pessoa volta à Live na categoria padrão. | Aceito; registrar como limitação conhecida. Filmes/Séries restauram via snapshot. |
| R-005 | Gestão de lista em dois lugares (perfis e Configurações). | Divergência de comportamento com o tempo. | Resolvido: D-007 — um só `DeleteSourceModal`/`sourceFormat` (`features/sources/`), reaproveitado por `ProfilesScreen.tsx` e `SettingsScreen.tsx`; confirmado no `sdd-converge` (mesmo componente, mesmo texto de confirmação, "Cancelar" focado nos dois lugares) — o contrato 023 e o da 026 cobrem os dois lados. |
| R-006 | IME da TV (Done/Cancelar, RETURN com teclado aberto) só é verificável na TV. | RETURN poderia sair da tela com o teclado aberto. | Regra "RETURN com input focado só faz `blur`" testada em jsdom; roteiro manual no quickstart. |
| R-007 | Versão lida de `CCPlayTv/config.xml` no build (D-012). | Mudança de formato do arquivo quebraria o build. | Resolvido: falha explícita no `vite.config.ts` com mensagem clara, nunca fallback inventado. Confirmado no `sdd-converge` — `npm run build`/`build:tizen` leem a versão real e a aba Sobre mostra "Versão 0.2.1" (verificado via Playwright MCP, T039). |
| R-008 | D-008 difere do padrão da Live (que desmonta a moldura durante a reprodução). | Moldura poderia pintar sobre o vídeo na TV. | Coberto pela regra `.screen > *` já comprovada na TV (feature 003/011); passada visual na TV recomendada. |
| R-009 | Bug pré-existente achado por acaso durante a validação da Fase 2 (fora do escopo desta feature): `MovieDetailScreen.tsx`'s `formatShortDate` formatava `added_at` no fuso horário LOCAL da máquina, em vez de UTC — em qualquer fuso atrás de UTC (ex.: America/Sao_Paulo, UTC-3, o fuso desta máquina de execução), a data exibida recuava um dia inteiro. `MovieDetailScreen.test.tsx` falhava mesmo isolado por causa disso. | Data de inclusão errada na tela real, não só no teste. | Resolvido: corrigido com aprovação explícita do usuário (`AskUserQuestion`, 2026-09-27) — `formatShortDate` agora passa `timeZone: 'UTC'` ao `Intl.DateTimeFormat` (a data declarada pela fonte não tem componente de hora, então UTC é a única leitura correta). `MovieDetailScreen.test.tsx` 21/21 verde depois da correção. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-27 | Fase 1+2 (Setup + Foundational) | Implementadas juntas (Fase 1 não tinha checkpoint próprio em `tasks.md`): `__APP_VERSION__`, registro de mocks, `loadHomeHero`/`globalSearch` (contratos 3/3 verdes), `useHomeHero`/`useMyListContent`/`useGlobalSearchIndex`, `appNav` estendido (`search`/`settings`/`go-home`, `HomeFocus.rail` no lugar de `continue`), `TopBar` com Busca/Configurações reais, `features/sources/` extraído, campos opcionais em `LiveShellProps`/`VodShellProps`. `tsc -b`/lint limpos, travas 023/024/025/026 íntegras, suíte completa verde (só os 2 contratos de Fase 3/4, ainda não implementados, e o padrão de flake já documentado sob paralelismo — todos confirmados verdes isolados). | Nenhuma no escopo desta fase. |
| 2026-09-27 | Fase 3 (US1 — Home definitiva) | `HomeContent.tsx` (hero + 5 linhas, foco por id) e `HomeScreen.tsx` (raiz `.screen.home-screen`, `PlayerLayer` irmão, invalidações ao fechar) novos/reescritos; `LiveScreen`/`VodCatalogScreen`/`MoviesScreen`/`SeriesScreen` com `initialChannel`/`openFavorites`/`initialTopbarItem`; `App.tsx` ligado (`FAVORITES_SNAPSHOT` para "Ver todos"/"Filmes (N)"/"Séries (N)"); `features/list-home/` removido; `styles/home.css` reescrito. Contrato `HomeScreen` 1/1 verde; travas 023/024/025/026 íntegras; `tsc -b`/lint limpos; 304/310 verdes na suíte tocada (6 vermelhos = padrão de flake conhecido sob paralelismo, todos confirmados verdes isolados). Bug pré-existente fora de escopo achado e corrigido com aprovação do usuário: `MovieDetailScreen.tsx`'s `formatShortDate` (fuso horário, R-009). | Verificação manual de US1/AC1–AC12 no navegador (fica para o Polish/quickstart). |
| 2026-09-27 | Fase 4 (US2 — Configurações) | `SettingsScreen.tsx` completo (zonas `topbar`/`tabs`/`panel`, restauração por `SettingsFocus`); `SourcesPanel.tsx`/`AccessibilityPanel.tsx`/`AboutPanel.tsx`/`ComingSoonPanel.tsx` novos; `ProfilesScreen.tsx` com "Gerenciar listas" (linha `manage` nova, só a partir de "Adicionar lista"); `App.tsx` ligado; `styles/settings.css` novo. Contrato `SettingsScreen` 1/1 verde; travas 023/024/025/026 íntegras; `tsc -b`/lint limpos; 354/357 verdes na suíte tocada (3 vermelhos = mesmo padrão de flake). | Verificação manual de US2/AC1–AC13 no navegador (Polish). |
| 2026-09-27 | Fase 5 (US3 — Busca global) | `SearchScreen.tsx` completo (`logic/busca-global.md` §3–§5): campo com `inputRef` próprio (foco visual sem abrir o teclado sozinho), `imeOpen` via `focus`/`blur` nativos, cobertura sempre visível, rails só dos tipos com resultado, `EmptyState` com "Editar busca" focável, RETURN em camadas, `SearchSnapshot` restaura termo+foco por id. `App.tsx` ligado (rota `search`, `switch-top` direto para Configurações, resultados → detalhe/`live`, `from` carregando o snapshot). `styles/search.css` novo. Contrato `globalSearch` 1/1 verde; travas 023/024/025/026 íntegras; `tsc -b`/lint limpos; 408/408 verdes na varredura tocada (`search`/`home`/`shell`/`App`/`navigation`/`lib/catalog`/`comingSoon`, 39 arquivos). | Verificação manual de US3/AC1–AC7 no navegador (Polish, T039), incl. checar ausência de requisição de rede ao digitar. |
| 2026-09-27 | Fase 6 (Polish) — T036 | Os 12 scripts E2E que entravam pelo hub antigo (`.tiles-row`, 3 tiles fixos) foram reescritos pra entrar pela topbar/hero do Início definitivo: helper `openViaTopbar(page, destino)` (sobe até a topbar com `ArrowUp` de sobra, reseta pra "Início" com `ArrowLeft` de sobra — clamp em ambos os extremos —, então conta os `ArrowRight` certos) adicionado a cada script, substituindo `openShortcut(index)`/toques diretos em "Live TV é o primeiro tile". `historico-continuar-assistindo.mjs` precisou de mais que troca de seletor: a rail "Continuar assistindo" deixou de ser a linha adjacente à topbar (o hero agora ocupa essa posição), então o teste R-002 (UP/DOWN topbar↔conteúdo sem tecla dupla, um bug real de corrida só reproduzível em Chromium) foi realocado pro hero, e `m3u-sob-demanda.mjs`'s Cenário B precisou navegar até Configurações › Fontes IPTV (o aviso "Modo limitado" saiu do hub do Início nesta mesma feature, US2/D-007). Todos os 12 rodados individualmente contra o dev server: verdes. | T037 (novo roteiro dedicado), T038 (docs), T039 (quickstart), T040 (gate final). |
| 2026-09-28 | Fase 6 (Polish) — T037/T038/T039 | `home-busca-configuracoes.mjs` novo (fixture 1 canal + 1 filme, painel Xtream fictício "Modo limitado" à parte): hero retoma o filme direto sem passar pelo detalhe e volta; "Continuar assistindo"/"Minha Lista" (card próprio + agregado "Filmes (1)", que abre Filmes já em ★ Favoritos)/"Canais favoritos" (abre a Live já tocando); Busca com resultado (abre e volta restaurando termo+foco) e sem resultado (estado vazio); Configurações (Modo limitado numa fonte nova, excluir com confirmação sem trocar a fonte ativa por engano, "Reduzir movimento" liga de verdade). Rodado 2x seguidas pra confirmar que não é flaky: 40/40 verificações verdes nas duas. Incluído em `test:e2e`. T038: varredura em `CLAUDE.md`/`migracao-design-system-v14.md`/comentários de `HomeScreen.tsx`/`TopBar.tsx`/`appNav.ts` não achou nada pra corrigir — as menções a `ListHomeScreen`/"Em breve" da lupa/engrenagem que sobram são registros históricos de features já convergidas (019/023), não alegações de estado atual; a matriz real×mock do roteiro de migração já descrevia Busca/Configurações como "Real" prospectivamente. T039: cenários do `quickstart.md` não cobertos pelo novo E2E (Home vazia + mock anuncia "Em breve", Busca 1 char vs 2+ chars vs sem-resultado, "Gerenciar listas" da tela de perfis sem topbar + RETURN volta aos perfis, "Reduzir movimento" persiste depois de recarregar a página, Sobre mostra a versão real) verificados manualmente via Playwright MCP contra o dev server — sem screenshot (sandbox do MCP não expõe arquivo pro Read), só `browser_snapshot` (árvore de acessibilidade), suficiente pra confirmar rótulos/estrutura/ausência de segredo. | T040 (gate final). |

| 2026-09-28 | Fase 6 (Polish) — T040 (gate final) | `npx tsc -b` limpo; `npm run lint` só com os warnings pré-existentes já documentados (nenhum novo); `npx vitest run` (suíte completa) 1212/1218 — os 6 vermelhos (`*.favorites.test.tsx` de Live/Movies/Series, `LiveScreen.test.tsx` T010) são o mesmo padrão de flake sob paralelismo de toda a migração V14, confirmados 94/94 verdes isolados; `npm run build` e `npm run build:tizen` (sincronização pro projeto Tizen) verdes, sem nenhum arquivo emitido fora de `tizen_web_project.yaml`; `npm run test:e2e` (12 scripts encadeados: `e2e.mjs` + os 11 de `e2e/`, incluindo o novo `home-busca-configuracoes.mjs`) 100% verde contra um dev server recém-iniciado. Feature completa: todas as 40 tasks marcadas, Checklist de Release inteiro atendido. | Nenhuma — passada em TV física fica recomendada (não gate), mesmo padrão de features anteriores. |

**PRÓXIMO**: Feature completa (todas as fases e o Checklist de Release atendidos) — pronta para `sdd-converge`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/home/HomeContent.tsx` (novo) / `HomeScreen.tsx` (reescrito) — Home definitiva completa (Fase 3).
- `tv-web/src/features/settings/` — `SettingsScreen.tsx`, `SourcesPanel.tsx`, `AccessibilityPanel.tsx`, `AboutPanel.tsx`, `ComingSoonPanel.tsx` (Fase 4, completos).
- `tv-web/src/features/profiles/ProfilesScreen.tsx` — "Gerenciar listas" (linha `manage`).
- `tv-web/src/App.tsx` — todas as ações do Início/Configurações ligadas; `FAVORITES_SNAPSHOT` em `tv-web/src/features/catalog/categoryScreenSnapshot.ts`.
- `tv-web/src/styles/home.css`/`settings.css`/`search.css` — só tokens.
- `tv-web/src/features/search/SearchScreen.tsx` (novo, Fase 5) — campo, cobertura, rails, `SearchSnapshot`.
- `tv-web/e2e.mjs` + `tv-web/e2e/*.mjs` (11 scripts) — atualizados na Fase 6/T036 pra entrar pela topbar/hero em vez do hub antigo.
- `tv-web/e2e/home-busca-configuracoes.mjs` (novo, T037) + `tv-web/e2e/fixtures/home-busca-configuracoes.m3u`; `tv-web/package.json` (`test:e2e` inclui o novo script).
- Próximo foco (Fase 6): T040, gate final (suíte completa, `tsc`, lint, build, `build:tizen`, `test:e2e`).

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Fase 1 não tem "Registro da Fase"/checkpoint próprio em `tasks.md` (só Fase 2 em diante têm) — T001/T002 foram implementadas junto com a Fase 2 antes do primeiro checkpoint real, porque T002 (remover `search-global`/`settings` de `comingSoon.ts`) só fica consistente depois que T007 (TopBar real) e T013 (testes) também mudam — do contrário `TopBar.test.tsx` quebra no meio do caminho com um erro não tratado (`getComingSoon` lançando), não uma falha de asserção limpa.
- `HomeFocus` perdeu a variante `{ zone: 'continue' }` (virou `{ zone: 'rail', rail: 'continue', itemId }`) — isso obrigou ajustes mecânicos (só o literal, sem mudar comportamento) no antigo `ListHomeScreen`/`HomeScreen`, já removidos/reescritos na Fase 3.
- `resolveFavorites`/`resolveContinueWatching`/`activeGeneration` (todos já existiam em `catalogRepository.ts`) bastam para tudo que `homeHero.ts`/`catalogApi.ts` precisam — nenhuma função nova precisou ser exportada de lá.
- **`ContentCard`/`ChannelRow`/`HomeSeeAllCard` não são `role="button"`** (são `<div onClick>`, foco de estado por classe — ADR-009): testes que interagem com cards de rail precisam de `getByText`/seletor de classe, nunca `getByRole('button', …)` — só os botões de verdade (ações do hero, ícones do dock, `ChannelRow`… não, esse também é `<div>`) usam esse role.
- **Testes com `fake-indexeddb` real (não mockado) são o padrão de flake conhecido sob paralelismo** — `HomeContent.test.tsx` se junta a `*.favorites.test.tsx`/`LiveScreen.test.tsx`: passam 100% isolados, podem falhar de vez em quando na suíte completa. Não é regressão; não tentar "corrigir" isolando mais (já é assim por design, custo/benefício de mudar o `pool`/paralelismo do vitest é uma decisão maior, fora do escopo desta feature).
- **T022 saiu em `LiveScreen.favorites.test.tsx`, não `LiveScreen.test.tsx`** (tasks.md dizia o segundo) — esse arquivo é o que já roda `useFavoritesContent`/`useCatalogItem` reais; `LiveScreen.test.tsx` mocka as duas, o que exigiria reconstruir esse "real" ali dentro, redundante.
- **`ADD_SOURCE_ID` mora em `SourcesPanel.tsx`, não em `SettingsScreen.tsx`** — `SettingsScreen` importa `SourcesPanel`, então exportar o sentinela de `SettingsScreen.tsx` criaria um import circular entre os dois módulos.
- **Contrato da `SettingsScreen` exige exatamente UM elemento com o texto "Modo limitado" por linha** — não renderizar um badge próprio "Modo limitado" ao lado de `LimitedModeNotice` (cujo título já é esse texto); duplicar quebra `getByText(/Modo limitado/)` do contrato travado.
- **Foco inicial das abas é "Fontes IPTV" (índice 1 do array `TABS`), não a primeira do array** ("Integrações & BYOK", índice 0) — UP a partir do padrão precisa de DOIS toques pra alcançar a topbar, não um.
- **`.tv-focus` de um `ContentCard`/`ChannelRow` nunca fica no elemento raiz** (`.content-card`/`.channel-row`) — `PosterArt` é quem recebe a prop `focused` e aplica a classe no seu próprio `.poster-box` (um filho). Um seletor `.content-card.tv-focus` (ou `.channel-row.tv-focus`) nunca casa com nada; use só `.tv-focus` com escopo (ex.: `section[aria-label="X"] .tv-focus`) ou `.poster-box.tv-focus`. Achado ao escrever/rodar `historico-continuar-assistindo.mjs` na Fase 6 — dois `assert` deram falso-negativo por isso antes de perceber.
- **O hero, não mais a 1ª rail, é quem fica adjacente à topbar** — em qualquer script/teste E2E que suba com `ArrowUp` a partir de uma rail (ex.: "Continuar assistindo"), são SEMPRE 2 toques até a topbar (rail→hero, depois hero→topbar), nunca 1; e o que a `HomeContent` "lembra" ao descer de novo é a linha onde esse 2º toque partiu (o hero), não a rail original de onde a subida começou. Isso muda o antigo padrão R-002/023 (que testava a simetria UP/DOWN na PRÓPRIA rail adjacente à topbar) — a versão atual do teste (em `historico-continuar-assistindo.mjs`) testa a mesma simetria, só que no hero.
- **O aviso "Modo limitado" saiu do hub do Início nesta feature** (US1 removeu `ListHomeScreen`) **e foi pra Configurações › Fontes IPTV** (US2/D-007, `SourcesPanel.tsx`, mesma linha pra qualquer fonte — não só a ativa). Qualquer teste/script que abria o hub duma fonte "Modo limitado" pra ver a explicação precisa navegar até lá em vez disso (`m3u-sob-demanda.mjs`, Fase 6/T036).
- **Padrão `openViaTopbar(page, destino)` pra E2E** (definido em cada um dos 12 scripts atualizados na Fase 6/T036, sem módulo compartilhado — cada `e2e/*.mjs` é standalone): sobe até a topbar com até 6× `ArrowUp` (inofensivo em excesso — a topbar ignora `up`, e o conteúdo tem no máximo 6 linhas), reseta pra "Início" com até 6× `ArrowLeft` (clamp no item mais à esquerda), só então conta os `ArrowRight` certos (`home`/`live`/`movies`/`series`) e aperta Enter — funciona não importa de onde o foco tenha sido restaurado (topbar num item qualquer, ou conteúdo em qualquer linha), ao contrário do antigo `openShortcut(index)` que assumia sempre 3 tiles horizontais.

## Resultado Final

**Convergida em 2026-09-28, sem achados** (`sdd-converge`, verificação contra `spec.md`, a constitution e o código real de `tv-web/src/`).

As três user stories foram construídas exatamente como especificado, sem desvio de escopo:

- **US1 (Home definitiva)**: `HomeContent.tsx`/`HomeScreen.tsx` substituem por completo o hub provisório (`ListHomeScreen` confirmado ausente do repositório — só sobra em comentários explicativos, nunca em código executável). Cascata do hero (continue → favorito → boas-vindas), rails reais ("Continuar assistindo"/"Minha Lista"/"Canais favoritos") com skeleton e virtualização, "Ver todos (N)"/"Filmes (N)"/"Séries (N)" abrindo `★ Favoritos` do destino certo, e os dois mocks honestos (Curadoria IA, dock de serviços) — tudo confirmado pelos 2 testes de contrato de `homeHero.ts` + 1 de `HomeScreen.tsx`, pela suíte unitária e pelo E2E `home-busca-configuracoes.mjs`.
- **US2 (Configurações)**: `SettingsScreen.tsx` com as 6 abas na ordem certa (Fontes IPTV como inicial), gestão de lista completa (Editar/Ressincronizar/Excluir com confirmação/Adicionar), badge de Modo limitado sem nenhuma credencial visível (confirmado por teste de contrato e por dois E2E diferentes), "Reduzir movimento" real e persistente, e "Gerenciar listas" na tela de perfis abrindo Configurações sem topbar e sem lista ativa. As ações de gestão por cartão da tela de perfis (feature 023) continuam intocadas, como a spec exigiu (R-001).
- **US3 (Busca global)**: `SearchScreen.tsx` cobre o campo com IME real, o aviso de cobertura permanente, o limiar de 2 caracteres, os rails por tipo, o estado vazio, e o RETURN em camadas (teclado → tela) — confirmado por teste de contrato de `globalSearch.ts`, pela suíte unitária (8/8 em `SearchScreen.test.tsx`) e pelo E2E novo.

**Desvios acumulados durante a execução** (todos já registrados nas Execution Notes/Riscos e Decisões ao longo das Fases 1–6, aqui só resumidos):

1. Um bug pré-existente, fora do escopo original desta feature, foi achado por acaso na Fase 2 (`MovieDetailScreen.tsx`'s `formatShortDate` formatando em fuso local em vez de UTC) e corrigido com aprovação explícita do usuário (R-009) — o único código tocado fora do escopo direto das três user stories.
2. O teste R-002 (corrida real de teclado entre topbar e conteúdo, feature 023) precisou ser realocado da rail "Continuar assistindo" pro hero na Fase 6, porque o hero passou a ocupar a posição adjacente à topbar que antes era da 1ª rail — mesma propriedade, testada no lugar certo agora.
3. O aviso de "Modo limitado" (feature 014) mudou de lugar — do hub do Início pra Configurações › Fontes IPTV — exatamente como a spec pedia (FR-023), o que exigiu atualizar o Cenário B de `m3u-sob-demanda.mjs` (feature 014) pra continuar testando a explicação no lugar novo.

**Decisões técnicas que ficaram diferentes do plano original**: nenhuma — as Decisões Invariantes (D-001 a D-016, não reproduzidas aqui) se sustentaram sem emenda do início ao fim das 6 fases.

**Verificação em TV física**: não é gate desta feature (constitution, "Validação em hardware real" — nenhuma exceção declarada em `spec.md`/`plan.md`). R-003/R-006/R-008 permanecem abertos nesse sentido específico (medição de custo de render das rails, IME real da TV, confirmação visual do plano de hardware) — recomendados, registrados no `quickstart.md`, não bloqueantes.
