# Implementation Plan: Shell, Navegação e Entrada do Design System V14 (Onda 2)

**Slug**: `023-shell-navegacao-entrada-ds-v14` | **Date**: 2026-09-26 | **Spec**: `sdd/specs/023-shell-navegacao-entrada-ds-v14/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Troca a entrada do app, hoje "Home de fontes → hub da fonte → Live/Filmes/
Séries", pelo caminho da ADR-011:

**Splash → "Quem está assistindo?" (perfil = lista) → Início da fonte ativa,
com topbar.**

A navegação sai de `setNav` inline em `App.tsx` e vira um **redutor puro**
(`tv-web/src/navigation/appNav.ts`), testável sem montar o app. É ele que
decide RETURN em camadas, a pilha zerada ao trocar de lista e a tela de
perfis como base ou troca.

Componentes:

- **`ProfilesScreen`** substitui o `HomeScreen` antigo. Ganha estado de
  erro focável, exclusão com confirmação num `Modal` e foco na última lista
  usada, gravada em `localStorage` (só o id).
- **`HomeScreen`** (reescrito) é o Início: `AppShell` (`TopBar` +
  `OfflineBanner` + `HintBar`) em volta do conteúdo do hub atual
  (`ListHomeScreen`, restilizado e controlável por escopo).
- **Splash, onboarding e progresso** ganham o visual V14. O progresso
  termina com "Abrir lista", que leva ao Início daquela lista.

Live TV, Filmes, Séries, detalhes e player **não mudam**. Só o destino do
RETURN no nível raiz deles passa a ser o Início, e isso sai de graça do
redutor.

## Technical Context

**Language/Version**: TypeScript ~6.0 (strict), React 19.2, Vite 8 com build
`chrome108`.

**Primary Dependencies**:
- `@tanstack/react-query` 5, para `useSources`/`useDeleteSource`/
  `useResyncSource`/`useOpenSource`/`useImportJob` (`features/import/
  importApi.ts`) e `useCatalogCounts`/`useContinueWatchingContent`
  (`features/catalog/catalogApi.ts`).
- `useRemoteNav` (ADR-009), para foco por estado.
- `useTvKeyNav`, para foco DOM nos formulários.
- Biblioteca da feature 022: `Modal`, `Button`, `IconButton`,
  `ErrorState`, `Skeleton`, `Spinner`, `OfflineBanner`, `TextField`,
  `ComingSoon`, `ContentCard`, `Icon`.
- `useAnnounce`/`AnnouncerRegion` (021).

Nenhuma dependência nova.

**Storage**:
- IndexedDB via Dexie, sem nenhuma mudança de schema.
- `localStorage` só para `ccplaytv:last-source` (id da última lista). Usa o
  mesmo tratamento de armazenamento indisponível de `lib/motionPreference.ts`.

**Testing**:
- Vitest 5 + jsdom + Testing Library. Não há `user-event`: as teclas vão
  como `fireEvent.keyDown(document.body, …)`.
- Playwright via scripts `tv-web/e2e.mjs` + `tv-web/e2e/*.mjs` contra o dev
  server.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 8.0 / Chromium 108), com
palco lógico de 1920×1080 (`Stage`, 021).

**Performance Goals**: sem meta nova. A tela de perfis e o Início leem só
dados locais (IndexedDB e `localStorage`), sem rede para aparecer. A
medição na TV fica para o fim da Onda 3 (R-2 do roteiro).

**Constraints**:
- Sem `:has()`, sem `backdrop-filter` pesado e sem `will-change` em massa
  (Chromium 108).
- Só tokens de `index.css`, nenhum literal de cor, raio, espaçamento ou
  fonte.
- Fontes locais.
- Nenhum arquivo novo emitido pelo build sem entrada em
  `tizen_web_project.yaml`, porque a guarda de `sync-tizen.mjs` recusa.

**Scale/Scope**:
- Poucas listas por aparelho (1 a 5 típico). A fileira de cartões rola para
  muitas, sem virtualização.
- ~12 arquivos de produção tocados/criados e 9 scripts E2E ajustados.

## Decisões Invariantes

- **D-001 — Perfil = lista, fonte ativa por sessão** (ADR-011 §2/§3).
  - Nenhuma entidade de perfil nova.
  - A fonte ativa vive no estado de navegação (`AppNavState.activeSource`),
    não em armazenamento.
  - Só o **id** da última lista usada é gravado
    (`localStorage['ccplaytv:last-source']`), nunca nome, URL ou credencial.
- **D-002 — Onde cada coisa mora.**
  - `features/profiles/ProfilesScreen.tsx` substitui `features/home/
    HomeScreen.tsx`. O arquivo antigo e o teste dele saem; os cenários que
    ainda valem migram para `ProfilesScreen.test.tsx`.
  - `features/home/HomeScreen.tsx` passa a ser o **Início** (shell +
    conteúdo).
  - `features/list-home/ListHomeScreen.tsx` **fica** como o conteúdo do
    Início, restilizado e com `active`/`onExitUp`/`initialFocus`. Os testes
    dele continuam valendo. Ele só sai na Onda 5, com a Home definitiva
    (roteiro §6).
  - Shell em `features/shell/`: `AppShell.tsx`, `TopBar.tsx`,
    `HintBar.tsx`, `ExitModal.tsx`, `clock.ts`.
  - Navegação em `src/navigation/`: `appNav.ts`, `lastSource.ts`.
- **D-003 — Navegação é um redutor puro** (`logic/navegacao-app.md`).
  - `App.tsx` usa `useReducer(appNavReducer, …)` e só despacha.
  - Efeitos colaterais (gravar a última lista, `openSource.mutate`,
    acompanhamento de auto-refresh) ficam no `App`, fora do redutor.
  - RETURN numa tela base (Início, perfis-base) não é do redutor: a tela
    abre o modal de saída.
- **D-004 — Composição de foco por escopos ativos/inativos**
  (`logic/foco-shell.md`).
  - `TopBar` e `ListHomeScreen` registram o próprio `useRemoteNav`, com
    handlers só quando ativos.
  - O `HomeScreen` detém `zone`.
  - Nada de `modal: true` fora de modais.
  - Nada de biblioteca de foco (ADR-009).
- **D-005 — A topbar existe só no Início nesta onda** (FR-020). Live, Filmes,
  Séries, detalhes e player continuam em tela cheia, sem nenhuma mudança de
  layout.
- **D-006 — Seletores estáveis que os E2E já usam são preservados** como
  classes secundárias, para que a migração não reescreva cada script:
  - `.source-card`, `.source-card-wrap`, `.source-card-badge` (cartões de
    lista);
  - `.tiles-row` (atalhos do Início);
  - `.continue-watching-row`, `.continue-watching-title`;
  - `#add-source-title`;
  - rótulos "Nome de exibição"/"URL da lista M3U";
  - botão "Adicionar lista" do formulário;
  - textos "Concluída" e botão "Voltar" do progresso.

  O visual novo pode acrescentar classes, mas não remove essas.
- **D-007 — Registro de mocks.**
  - `COMING_SOON` ganha 3 entradas:
    - `search-global`: Busca, Onda 5 / M6;
    - `settings`: Configurações, Onda 5 / M6;
    - `pair-phone`: Conectar pelo celular, item 22.
  - `backlogItem` passa de `number` para `number | string`, para aceitar
    marcos como `'M6'`. Onda 5 é um marco, não um item numerado.
  - O teste de `comingSoon.test.ts` que afirmava "registro vazio" passa a
    afirmar exatamente essas 3 chaves. O arquivo não é contrato travado.
- **D-008 — Exclusão confirmada.**
  - OK em Excluir abre `Modal` "Excluir a lista <nome>?".
  - Foco inicial em Cancelar. Cancelar e RETURN fecham sem apagar.
  - Só "Excluir" dentro do modal chama `useDeleteSource().mutate(id)`.
- **D-009 — Fim da importação.**
  - Status `completed`/`completed_with_warnings` → botão primário "Abrir
    lista", focado → `choose-source` com a fonte do job (`job.source_id`,
    resolvida pela lista de `useSources` no `App`).
  - "Voltar" → `import-back`, que abre os perfis como base com foco na
    lista.
  - **Sem avanço automático**: avisos da importação (feature 014) precisam
    poder ser lidos. Isso é "a pessoa confirma", a leitura de US4/AC4 que
    a spec permite.
- **D-010 — Códigos de erro.** Falha ao ler as listas = `STO-01`
  (armazenamento local ilegível), no padrão de exemplos da Spec V14 §45. A
  tabela da §45 é exemplar, não exaustiva.
- **D-011 — Modal de saída único** (`features/shell/ExitModal.tsx`):
  - "Sair do CCPlayTV?", com "Cancelar" (foco inicial) e "Sair";
  - "Sair" chama `exitApp()` (`lib/tizenExit.ts`);
  - usado pelo Início e pelos perfis em modo `base`;
  - `ConfirmDialog` não é removido (fora de escopo).
- **D-012 — CSS novo em `tv-web/src/styles/shell.css`**:
  - importado em `main.tsx` **depois** de `features/screens.css`;
  - as regras antigas de `.source-card*`, `.add-card*`, `.tile*` e
    `.splash*` saem de `screens.css` na mesma task que as reescreve, para
    não haver definição dupla.

  Quebrar `screens.css` por tela é Onda 7.
- **D-013 — `TextField` ganha `hint?: string`**, texto de apoio visível
  ligado por `aria-describedby`. É a única extensão da biblioteca 022
  nesta onda: o formulário de edição precisa de "Deixe em branco para
  manter…", que hoje é placeholder, e o DS pede rótulo permanente (§37).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | "Perfil" é lista, não conta (ADR-011). Sem lista, o app abre e oferece "Adicionar lista". |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | O cartão mostra nome, tipo, estado e selos, nunca `provider_dns`, URL ou usuário (FR-048). `localStorage` guarda só o id. O onboarding mantém o comportamento write-only de usuário/senha na edição. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Não toca categorias. Esportes e Infantil ficam fora da topbar (ADR-011). |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | O Início provisório só tem dado real (contagens honestas do hub, "Continuar assistindo"). Os 3 mocks são "Em breve" registrados (D-007). |
| Comandos Locais Independem de Rede | ✅ | ✅ | Navegação, RETURN e topbar são 100% locais. `openSource.mutate` é fogo-e-esquece, como hoje. |
| Trailers e Metadados Não Alteram Estado | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho por Controle | ✅ | ✅ | Toda gestão de lista alcançável na tela de perfis. RETURN fecha modal antes de tela (FR-027). Mocks de celular/QR são conveniência, com o formulário real ao lado. |
| Lista Nunca é Manifesto de Streaming | N/A | N/A | Importador intocado. |
| Foco Visível e Sem Becos Sem Saída | ⚠️ | ✅ | Pré: o `HomeScreen` atual tem erro e carregando sem focável (bug do backlog). Pós: erro com `ErrorState` + "Tentar de novo" (contrato C4), carregando com "Adicionar lista" focável (`logic/foco-shell.md`), modais com foco inicial. SELECT ativa de fato (contratos C3–C5). |
| Voltar Restaura Foco e Posição | ✅ | ✅ | `HomeFocus` restaurado no RETURN, "Continuar assistindo" por **id** (C1). Snapshot de Filmes/Séries (017) carregado intacto pelo redutor. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Não toca identidade. Excluir continua limpando favoritos/retomada pela chave (013). |
| Progresso e Capacidades São Reais | ✅ | ✅ | Progresso de importação mantém só etapas/contagens reais, sem percentual (FR-037). Contagens do Início mantêm a regra de "nunca 0 para não aberto" (010). |
| Documentação É Canônica | ✅ | ✅ | O `CLAUDE.md` descreve "Home (sources)" e o fluxo antigo, e é atualizado no Polish. Backlog: os 2 bugs absorvidos saem na convergência. |

Nenhuma violação a justificar. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/023-shell-navegacao-entrada-ds-v14/
├── spec.md
├── plan.md                  # este arquivo
├── quickstart.md
├── logic/
│   ├── navegacao-app.md     # redutor de navegação (D-003)
│   └── foco-shell.md        # escopos topbar ↔ conteúdo, tela de perfis (D-004)
├── contract-tests.lock
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── e2e.mjs                                  # reescrito (bug do backlog absorvido)
├── e2e/*.mjs                                # entrada ajustada (Adicionar lista / perfis / topbar)
├── package.json                             # test:e2e (inalterado, a menos que um script mude de nome)
└── src/
    ├── App.tsx                              # useReducer(appNavReducer), efeitos de sessão
    ├── main.tsx                             # + import './styles/shell.css' depois de screens.css
    ├── navigation/                          # NOVO
    │   ├── appNav.ts                        # redutor puro (stub do plan)
    │   ├── appNav.shell-navegacao.contract.test.ts   # TRAVADO
    │   ├── appNav.test.ts                   # testes adicionais
    │   ├── lastSource.ts                    # id da última lista (stub do plan)
    │   └── lastSource.test.ts
    ├── features/
    │   ├── profiles/                        # NOVO
    │   │   ├── ProfilesScreen.tsx           # stub do plan
    │   │   ├── ProfilesScreen.shell-navegacao.contract.test.tsx  # TRAVADO
    │   │   └── ProfilesScreen.test.tsx      # cenários migrados do HomeScreen.test + novos
    │   ├── shell/                           # NOVO
    │   │   ├── AppShell.tsx  TopBar.tsx  HintBar.tsx  ExitModal.tsx  clock.ts
    │   │   └── *.test.tsx / clock.test.ts
    │   ├── home/HomeScreen.tsx              # REESCRITO: Início = AppShell + ListHomeScreen
    │   ├── home/HomeScreen.test.tsx         # REESCRITO
    │   ├── list-home/ListHomeScreen.tsx     # restilizado + active/onExitUp/initialFocus
    │   ├── splash/SplashScreen.tsx          # visual V14
    │   ├── import/AddSourceScreen.tsx       # visual V14 + TextField + ComingSoon pair-phone
    │   └── import/ImportProgressScreen.tsx  # visual V14 + "Abrir lista"
    ├── components/TextField.tsx             # + hint (D-013)
    ├── lib/comingSoon.ts                    # 3 entradas + tipo de backlogItem (D-007)
    └── styles/shell.css                     # NOVO (D-012)
```

Intocados (garantia de FR-046): `features/live/`, `features/movies/`,
`features/series/`, `components/PlayerLayer.tsx`, `lib/catalog/`,
`lib/player/`, `lib/focus/`.

**Structure Decision**: frontend único em `tv-web/`, feature-first em
`src/features/<área>/`. A navegação de app ganha pasta própria
(`src/navigation/`) por não ser feature de tela nem biblioteca de domínio
(`src/lib/` fica para catálogo, player e foco, que o roteiro manda não
reescrever).

## Complexity Tracking

Sem violações.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

- **Unitário**:
  - redutor (`appNav.test.ts`, além do contrato);
  - `lastSource`;
  - `clock` (formatação e agendamento na virada do minuto, com fake timers);
  - `TopBar` (ordem, clamp, "Em breve", ativo ≠ focado);
  - `HomeScreen` (UP/DOWN entre escopos sem tecla dupla, restauração por
    `HomeFocus`, modal de saída);
  - `ProfilesScreen` (vazio, carregando focável, selos, ações, foco depois
    de excluir, modo switch vs base);
  - `ImportProgressScreen` ("Abrir lista" em concluído);
  - `AddSourceScreen` (cartão pair-phone, rótulos);
  - `TextField` (`hint`).
- **E2E**: todos os scripts de `test:e2e`, ajustados para a entrada nova.
  `e2e.mjs` reescrito para cobrir sem lista → Adicionar lista → progresso →
  Abrir lista → Início → RETURN → modal de saída.
- **Manual**: `quickstart.md` no navegador, em 1920×1080.

Comandos-base (em `tv-web/`):

```powershell
npx vitest run <arquivo>        # o mais estreito primeiro
npm run test
npm run lint
npm run build
npm run build:tizen
npm run test:e2e                # dev server recém-iniciado na 5173
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:

- `tv-web/src/navigation/appNav.shell-navegacao.contract.test.ts`
- `tv-web/src/features/profiles/ProfilesScreen.shell-navegacao.contract.test.tsx`

Comando (em `tv-web/`):
`npx vitest run src/navigation/appNav.shell-navegacao.contract.test.ts src/features/profiles/ProfilesScreen.shell-navegacao.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| C1 `RETURN em camadas: detalhe → categoria (com snapshot) → Início (com o foco de origem) → Início é base` | US2/AC3-AC5, FR-028–FR-030 | Fase 2 | `Error: not implemented` |
| C2 `trocar de lista zera a pilha, e remover a lista ativa faz dos perfis a base` | US2/AC6-AC7, FR-031, FR-032, edge case | Fase 2 | `Error: not implemented` |
| C3 `foco inicial na última lista usada, e OK nela escolhe essa lista` | US1/AC1-AC2, FR-002/FR-004/FR-006 | Fase 3 | `Unable to find … role "button" and name /Quarto/` |
| C4 `falha ao ler as listas mostra erro com código e "Tentar de novo" focado e ativável por OK` | FR-008, Constitution: Foco Visível e Sem Becos Sem Saída | Fase 3 | `Unable to find … [data-testid="error-state-code"]` |
| C5 `Excluir exige confirmação num modal com Cancelar em foco — OK duplo não apaga nada` | US3/AC4-AC6, FR-010, SC-007 | Fase 5 | `Unable to find … name /Ressincronizar/` |

Vermelho confirmado em 2026-09-26: 5/5 falhando pelos motivos acima, com
`tsc -b` e `oxlint` limpos.

Por que esses 5:

- C1 e C2 são o coração da US2 e a regra mais fácil de errar (pilha
  zerada, perfis base × troca, lista ativa removida);
- C3 é a US1 central;
- C4 é o invariante da constitution que esta feature corrige;
- C5 é o caso caro de errar: apagar lista por OK duplo.

A composição de foco topbar ↔ conteúdo (FR-015) ficou fora do orçamento. É
coberta por teste unitário obrigatório na Fase 4 (T026) e pelo E2E.

Stubs criados pelo plan (ponto de partida do execute, não travados):

- `tv-web/src/navigation/appNav.ts`: tipos completos, funções com `throw
  new Error('not implemented')`;
- `tv-web/src/navigation/lastSource.ts`: idem;
- `tv-web/src/features/profiles/ProfilesScreen.tsx`: props completas,
  render `null`.

Notas para quem executa os contratos:

- Teclas vão em `document.body`, nunca em `document`. Só assim a captura do
  `Modal` roda antes da tela por trás (mesmo cuidado da 022).
- Os cartões de lista e as ações precisam ser `<button>` com nome acessível
  que contenha o nome da lista / o rótulo da ação.
- O `Modal` de exclusão usa `ariaLabel="Excluir a lista <nome>?"`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Navegação (`navigation/appNav.ts`) | Completo. Redutor puro, 2 contratos (C1/C2) + 9 testes adicionais verdes. |
| Tela de perfis (`ProfilesScreen`) | Completo. Escolha, erro focável, exclusão confirmada. 3 contratos (C3–C5) + 30 testes adicionais verdes. |
| Shell (`AppShell`/`TopBar`/`HintBar`/`clock`) | Completo. 37 testes verdes, inclusive o teste de "evento único por escopo" (R-002). |
| Início (`HomeScreen`/`ListHomeScreen`) | Completo. Composição de escopos, restauração por `HomeFocus`, corrida de "Continuar assistindo" vazio corrigida (R-006). 43 testes verdes. |
| Onboarding/progresso/Splash | Completo. "Abrir lista" sem avanço automático, cartão "Conectar pelo celular" mock. 31 testes verdes. |
| `App.tsx` | Reescrito sobre `useReducer(appNavReducer)`. |
| E2E | 9/9 scripts verdes (`e2e.mjs` + 8 de `e2e/`), num Chromium real. |
| Gates finais | `npm run test` 1049/1051 (2 flakes conhecidas, confirmadas isoladas), lint/build/build:tizen limpos, 5/5 contratos, travas anteriores íntegras (exceto 017, pré-existente e fora de escopo). |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Os 8 scripts E2E entram pelo caminho antigo: formulário direto sem lista, `.source-card` → hub, Escape no hub → Home de fontes. | Alto: o gate de E2E fica vermelho até os scripts serem ajustados. | Resolvido: D-006 preservou os seletores; a entrada dos 8 scripts foi ajustada em paralelo por 3 sub-agentes (T042), cada um confirmado 3–5× seguidas num Chromium real. `e2e.mjs` reescrito (T041). 9/9 verdes numa rodada conjunta final. |
| R-002 | Tecla dupla na troca de escopo topbar ↔ conteúdo: dois `useRemoteNav` escutam o mesmo `keydown`. | Médio: o foco pularia dois passos. | Resolvido: além da explicação original (handlers só pós-render), a `TopBar` ativa passou a registrar com `{modal: active}` (captura + `stopImmediatePropagation`) — o risco real é uma corrida do Chromium que o jsdom não reproduz (o `setState` de um listener nativo pode ser descarregado *entre* dois listeners do mesmo evento). Coberto por teste unitário dedicado (T026) e por uma asserção no E2E de histórico, no Chromium real. |
| R-003 | `e2e/paridade-visual.mjs` (evidência da 021, fora de `test:e2e`) entra pelo formulário direto e grava em `sdd/specs/021-…/evidencias`. | Baixo: não é gate. | Aceito, não ajustado (decisão mantida): o propósito dele (antes/depois da 021) acabou. Registrado aqui para ninguém confundir a quebra com regressão. |
| R-004 | Chamar `openSource.mutate` ao escolher a lista também depois de "Abrir lista" do progresso. | Baixo: a lista acabou de sincronizar, e a decisão por idade não dispara nada. | Aceito. Um caminho só para "escolher lista" é mais simples que dois. |
| R-005 | Excluir a lista ativa pela tela de perfis em modo `switch`. | Médio: um RETURN poderia levar a um Início de lista apagada. | Resolvido: `source-removed` zera a pilha e torna os perfis a base (contrato C2, verde). |
| R-006 | Achado na evidência visual (T045, `e2e/shell-visual.mjs`): (a) com um `Modal` aberto sobre `ProfilesScreen` (exclusão ou saída), o cartão/ação de origem continuava desenhando `.tv-focus` por trás — dois anéis de foco simultâneos, cosméticos mas incorretos (o `Modal` já é dono do teclado). (b) Achado no E2E de histórico (T042/T047): quando o item em foco de "Continuar assistindo" desaparece com a tela já montada (concluído em outra tela, a consulta invalida e revalida), `row` ficava preso em `'continue-watching'` sem nada renderizado — nenhum `.tv-focus` em lugar nenhum (constitution, "Foco Visível e Sem Becos Sem Saída"). | (a) Baixo, só visual. (b) Alto: violação real do princípio de foco. | Resolvido, os dois. (a): guarda `&& !confirmDelete && !showExit` nas 3 classes de foco de `ProfilesScreen.tsx`. (b): `effectiveRow` derivado em `ListHomeScreen.tsx` (cai em `'tiles'` quando a rail que `row` aponta está vazia), mesmo padrão que `ProfilesScreen` já usa para `effectiveId`. Coberto por teste unitário (reproduz a corrida via `queryClient.invalidateQueries`) e por uma asserção no E2E real. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-27 | Fase 1 (Setup) | Linha de base registrada, `comingSoon`/`TextField`/CSS estendidos. | Nenhuma. |
| 2026-09-27 | Fase 2 (Foundational) | Redutor de navegação, `lastSource`, `ExitModal`. C1/C2 verdes. | Nenhuma. |
| 2026-09-27 | Fase 3 (US1) — 3 frentes paralelas | `ProfilesScreen` completa (Frente A), `TopBar`/`AppShell` de exibição (Frente B, antecipada), onboarding/progresso/Splash (Frente C, antecipada), `ListHomeScreen`/`HomeScreen`/`App.tsx` (integração). C3/C4 verdes. | Composição de foco topbar↔conteúdo ainda sem navegação por teclado real (entra na Fase 4). |
| 2026-09-27 | Fase 4 (US2) | Navegação da `TopBar`, `clock`, `HintBar`, composição de escopos no `HomeScreen`. R-002 fechado com `{modal: active}`. | Nenhuma. |
| 2026-09-27 | Fase 5 (US3) | Gestão de listas na tela de perfis (grande parte já feita na Fase 3 pela Frente A). C5 verde. | Nenhuma. |
| 2026-09-27 | Fases 6–7 (US4/US5) | Onboarding/progresso/Splash (feitas na Fase 3 pela Frente C, sem dependência real destas fases). | Nenhuma. |
| 2026-09-27 | Fase 8 (Polish) | `e2e.mjs` reescrito; 8 scripts de `e2e/` ajustados (3 sub-agentes em paralelo); T047 ad-hoc (corrida real de foco em "Continuar assistindo", achada pelo E2E); R-006 (dois anéis de foco); gates finais; 18 capturas de evidência visual; documentação canônica. | Trava de `017-busca-local-catalogo` quebrada, pré-existente e fora de escopo — registrada em `.planning/backlog.md`. |

**PRÓXIMO**: `sdd-converge`.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/navigation/appNav.ts`, `lastSource.ts` — navegação pura.
- `tv-web/src/features/profiles/ProfilesScreen.tsx` — tela de perfis.
- `tv-web/src/features/shell/{AppShell,TopBar,HintBar,ExitModal,clock}.tsx` — shell do Início.
- `tv-web/src/features/home/HomeScreen.tsx` — Início (composição de escopos).
- `tv-web/src/features/list-home/ListHomeScreen.tsx` — conteúdo do Início.
- `tv-web/src/features/import/{AddSourceScreen,ImportProgressScreen}.tsx`, `tv-web/src/features/splash/SplashScreen.tsx` — entrada.
- `tv-web/src/App.tsx` — reescrito sobre o redutor.
- `tv-web/e2e.mjs` + `tv-web/e2e/*.mjs` — E2E ajustado; `tv-web/e2e/shell-visual.mjs` — evidência visual (T045).
- `sdd/specs/023-shell-navegacao-entrada-ds-v14/evidencias/` — 18 capturas em 1920×1080.

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **Portas 5173/5174 são do usuário** — nunca subir/derrubar. Um dev server
  do usuário nessas portas pode ser encerrado pelo próprio sistema por
  pressão de memória (aconteceu nesta sessão); não reiniciar por conta
  própria. Para rodar E2E sem depender delas, use um Vite efêmero numa porta
  livre (5175+) — o padrão que esta feature usou está descartável, mas o
  princípio (cópia temporária dos scripts com `localhost:5173` reescrito
  para a porta escolhida, dev server próprio, limpar tudo ao final) vale
  para qualquer sessão futura.
- **`[IO.File]::ReadAllText`/`WriteAllText` não seguem `Set-Location`
  dentro do mesmo comando PowerShell** neste ambiente — `Environment.
  CurrentDirectory` fica um passo atrás da mudança de diretório do
  PowerShell na mesma invocação. Sempre use caminho absoluto nesses dois
  métodos, mesmo logo depois de um `Set-Location`.
- **`taskkill /PID ... /T /F`** foi bloqueado uma vez pelo sandbox deste
  ambiente com uma mensagem confusa ("Remove-Item on system path '/PID' is
  blocked"). Prefira `Stop-Process -Id $pid -Force` para encerrar um
  processo filho iniciado por `Start-Process`.
- **`Start-Process` com `-RedirectStandardOutput`/`-RedirectStandardError`
  para o mesmo destino falha** ("same" error) — sempre arquivos distintos,
  mesmo que o conteúdo não importe.
- **A regra global de reduzir movimento** (`:root.reduce-motion *`,
  feature 021) cobre qualquer `animation`/`transition` nova sem precisar de
  código específico — não reinvente isso por tela (Splash incluído).

## Resultado Final

<!-- Anexado pelo sdd-converge. Nunca reescreve o que já existe acima. -->

Convergiu limpo em 2026-09-27 — nenhum achado acionável. Auditoria cobriu:
código de cada arquivo novo/reescrito contra spec.md (48 FRs, 7 SCs, 32
Acceptance Scenarios em 5 user stories) e contra as 13 Decisões Invariantes
do plan.md; releitura do código que faz os 5 contratos passarem, sem atalho
(nenhum mock da própria unidade, nenhuma lógica presa a valor exato de
teste); reconfirmação, do zero, dos gates completos — suíte unitária
(1050/1051, com `SeriesScreen.favorites.test.tsx` desta vez no lugar de
`LiveScreen`/`MoviesScreen` como a flake da rodada, confirmando que é
mesmo o padrão de flake-sob-paralelismo já documentado em várias features
anteriores, e não uma regressão desta — 3/3 isolado), os 8 scripts de
`tv-web/e2e/` + `e2e.mjs` (8/8, num Chromium real, numa segunda rodada
completa depois da correção do R-006), `tsc -b`, lint, e a trava de
contrato (5/5, íntegra). `git status` conferido arquivo a arquivo: nenhuma
mudança fora do que a spec/plano descrevem, `tv-web/src/lib/` intocado
salvo o registro de mocks (`comingSoon.ts`, D-007, previsto) e o
`lastSource.ts` novo (previsto), e as telas não redesenhadas (`features/
live/`, `features/movies/`, `features/series/`, `PlayerLayer.tsx`) com
zero mudança de arquivo — não só "mesmo comportamento", literalmente
nenhum diff.

**O que foi de fato construído** bate com o resumo do plano: a entrada do
app trocou de "Home de fontes → hub → Live/Filmes/Séries" para "Splash →
'Quem está assistindo?' → Início com topbar" (ADR-011), com a navegação
inteira num redutor puro testável sem montar o app
(`tv-web/src/navigation/appNav.ts`). `ProfilesScreen` substituiu a Home de
fontes; `HomeScreen`/`ListHomeScreen` viraram o Início (shell + conteúdo,
dois escopos de foco); onboarding, progresso e Splash ganharam o visual
V14. As 5 user stories, os 48 FRs e as 7 SCs estão implementados e cobertos
(unitário → contrato → E2E → manual, na mesma ordem de prioridade que a
Estratégia de Testes do plano definiu).

**Desvios acumulados sobre o planejado em `plan.md`, todos dentro do
escopo da feature:**

- **Execução em paralelo, fora da ordem de fases do `tasks.md`**: 3
  sub-agentes trabalharam ao mesmo tempo na Fase 3 (US1) — um em
  `ProfilesScreen` completa (T011+T017, incluindo trabalho que
  tecnicamente pertencia à Fase 5), outro na `TopBar`/`AppShell` de
  exibição (T014, antecipada), outro em onboarding/progresso/Splash (T034–
  T040, as Fases 6 e 7 inteiras, antecipadas). O resultado final é
  idêntico ao que as fases descrevem; só a ordem cronológica real difere
  da ordem numérica das tasks. Documentado nos Registros de Fase
  correspondentes.
- **R-002 (tecla dupla topbar↔conteúdo)** acabou sendo mais sério do que o
  plano previu: a explicação original ("handlers só atualizam pós-render")
  não bastava — havia uma corrida real do Chromium (o `setState` de um
  listener nativo pode ser descarregado *entre* dois listeners do mesmo
  evento) que o jsdom não reproduz. Fechada com `useRemoteNav({...},
  {modal: active})` na `TopBar` ativa, achado e confirmado só no E2E real.
- **R-006, dois bugs reais achados durante o Polish** (não estavam
  previstos em nenhuma Decisão Invariante): (a) dois anéis de foco
  simultâneos quando um `Modal` abre sobre `ProfilesScreen`; (b) um real,
  a foco preso numa rail de "Continuar assistindo" que esvaziou com a tela
  já montada — nenhum elemento focado em lugar nenhum, uma violação de
  verdade da constitution. Os dois corrigidos e cobertos por teste
  (unitário + E2E).
- **Um achado fora de escopo, não corrigido, só registrado**: a trava de
  contrato da feature `017-busca-local-catalogo` referencia dois arquivos
  de teste que não existem mais (provavelmente removidos pela feature
  `018-busca-por-categoria` sem re-travar). Não é da 023 mexer nisso — está
  em `.planning/backlog.md` → Bugs, para um `sdd-bugfix` ou uma decisão
  pontual futura.
- **Gate de E2E executado contra Vite efêmeros, não contra o dev server
  persistente da porta 5173/5174**: o dev server do usuário nessas portas
  foi encerrado pelo próprio sistema por pressão de memória no meio da
  sessão. Em vez de reiniciá-lo (fora do que esta sessão deveria decidir
  por conta própria), cada rodada de E2E subiu um Vite descartável numa
  porta livre. O requisito em si (E2E verde num Chromium real) foi
  cumprido integralmente; só o mecanismo de execução mudou. Documentado em
  `## Cuidados para Retomada`.

Nenhuma Decisão Invariante do plano foi violada ou revisada. `README.md` do
projeto não foi alterado: ele documenta arquitetura e visão de alto nível,
não o fluxo tela-a-tela, e não foi atualizado por nenhuma das últimas ~10
features (013–022) por esse mesmo motivo — sem mudança visível para quem o
lê, mantendo o padrão já estabelecido neste repositório.
