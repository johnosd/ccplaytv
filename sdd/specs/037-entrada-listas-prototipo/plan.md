# Implementation Plan: Entrada fiel ao protótipo — tela de listas e cadastro de lista

**Slug**: `037-entrada-listas-prototipo` | **Date**: 2026-09-30 | **Spec**: `sdd/specs/037-entrada-listas-prototipo/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Redesenhar as duas telas de entrada do app para ficarem fiéis ao protótipo V13.2
(`profiles()` e `sourceSetup()`), sem mudar o fluxo (Splash → tela de listas →
entrar numa lista ou cadastrar). A abordagem é **reescrever no lugar**
`ProfilesScreen.tsx` e `AddSourceScreen.tsx` — mesmos arquivos, mesmas props,
mesma navegação por estado/DOM que já têm — trocando estrutura, textos e CSS, e
acrescentando só três peças novas pequenas: `listAvatar.ts` (iniciais + par de
cores estável por id), a opção `initialFocus` no `useTvKeyNav` (para o cadastro
abrir com o foco em "Xtream Codes") e a sentinela exportada
`ADD_LIST_FOCUS_ID` (para voltar do cadastro com o foco em "Adicionar lista").
O maior custo não é a UI: são ~24 scripts E2E que cadastram lista pelos rótulos
antigos, migrados para um helper compartilhado novo (`e2e/lib/entrada.mjs`).

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (`tv-web/`), Vite 8 com alvo `chrome108`.

**Primary Dependencies**: `@tanstack/react-query` (listas via `useSources`/
`useCreateSource`/`useUpdateSource` em `features/import/importApi.ts`), Dexie
(`lib/catalog/db.ts`, só lido/gravado pelos hooks existentes). Nenhuma
dependência nova.

**Storage**: N/A — nada novo é gravado. O avatar é derivado (logic/avatar-da-lista.md).

**Testing**: Vitest + Testing Library (jsdom) para unidade/componente e
contratos; Playwright (scripts `tv-web/e2e*.mjs`, rodados por
`npm run test:e2e` contra o dev server) para E2E.

**Target Platform**: Samsung Tizen TV (QN50Q60DAGXZD, Tizen 9 / Chromium 120,
origem `file://`), palco lógico 1920×1080 (`components/Stage.tsx`); dev em
Chromium desktop.

**Performance Goals**: N/A — telas estáticas com poucas listas; a fileira de
cartões não é virtualizada hoje e não precisa ser.

**Constraints**: foco é estado (`useRemoteNav` + `.tv-focus`, ADR-009) na tela de
listas e DOM real (`useTvKeyNav`) no formulário — cada tela mantém o modelo que
já tem; só tokens V14 (`index.css`); rótulo permanente, nunca placeholder
(DS §37, já testado); nenhuma credencial/URL visível; mocks só via
`ComingSoon`/`comingSoon.ts` (ADR-011).

**Scale/Scope**: 2 telas + 1 módulo puro + 1 opção de hook + wiring em
`App.tsx`; ~24 scripts E2E ajustados.

## Decisões Invariantes

- **D-001 — Reescrever no lugar.** `ProfilesScreen.tsx` e `AddSourceScreen.tsx`
  continuam sendo as telas, com as mesmas props exportadas
  (`ProfilesScreenProps`, `AddSourceScreenProps`) e o mesmo registro em
  `App.tsx`/`appNav.ts`. Nenhuma rota nova, nenhum componente de tela novo. A
  tela `profileCreate()` do protótipo não é adotada.
- **D-002 — Ganchos de E2E estáveis.** As classes `.source-card`,
  `.source-card-wrap`, `.source-card-badge`, `.add-card` e o id
  `#add-source-title` continuam existindo com o mesmo papel (o mesmo motivo do
  D-006 da 023). O que muda nos E2E são os rótulos dos campos e do botão de
  envio — e isso passa a morar num helper só (D-011).
- **D-003 — Avatar derivado.** Iniciais e par de cores vêm de
  `features/profiles/listAvatar.ts`, pelas regras de `logic/avatar-da-lista.md`
  (hash FNV-1a do **id**, nunca do nome nem da URL; 6 pares de tokens
  `--list-avatar-N-from/to` que só referenciam `--brand-1..5`). Nada é
  persistido.
- **D-004 — Cartão de lista.** `<button class="source-card">` contendo, nesta
  ordem: selo do tipo (`formatType` → "Xtream"/"M3U", caixa alta por CSS),
  avatar com as iniciais (`aria-hidden="true"`), nome (`.source-card-name`,
  truncado) e a linha de avisos `.source-card-notices` com os `.source-card-badge`
  de hoje. `formatStatus` **sai** do cartão (continua em `sourceFormat.ts`,
  usado por Configurações). O nome acessível precisa conter o nome da lista
  (contrato travado da 023: `getByRole('button', { name: /Quarto/ })`).
- **D-005 — Cartão "Adicionar lista".** `<button class="add-card"
  aria-label="Adicionar lista">` com círculo + `Icon name="add"`, título
  "Adicionar lista" e pílula "＋ Adicionar" (decorativos). Nome acessível
  **exatamente** "Adicionar lista" (contratos 023 e 037).
- **D-006 — Botão do canto.** "Gerenciar listas" vira
  `<button class="profiles-settings-corner">` com `Icon name="settings"` +
  "Configurações", posicionado no canto inferior direito da safe zone. A
  navegação é a mesma de hoje (linha `manage` do estado: ↓ a partir de
  "Adicionar lista", ↑ volta; OK → `onManageSources`). ↓ num cartão de lista
  continua abrindo as ações (contrato 023).
- **D-007 — Voltar do cadastro cai em "Adicionar lista".** `ProfilesScreen`
  exporta `ADD_LIST_FOCUS_ID` (a sentinela `'__add__'` que já existe) e passa a
  aceitá-la em `initialFocusSourceId`. `App.tsx`, no `onAddSource` da tela de
  listas, despacha `open` com `from: { ...screen, focusSourceId:
  ADD_LIST_FOCUS_ID }` — a pilha de `appNav` já guarda o `from` (nenhuma
  mudança no reducer nem no seu contrato travado). O cadastro aberto por
  Configurações não muda.
- **D-008 — Escolha do tipo = dois cartões-botão.** O painel "Configuração
  manual" mostra dois `<button aria-pressed>` — "Xtream Codes" e "Lista M3U",
  cada um com a descrição do protótipo — que **são** o seletor. As duas
  pílulas pequenas "Xtream"/"M3U" do protótipo são fundidas neles (uma parada
  de foco por opção, com a descrição no próprio elemento acionável). Xtream
  Codes começa selecionado. Substitui o `Tabs` atual.
- **D-009 — Foco inicial do cadastro.** `useTvKeyNav` ganha a opção aditiva
  `initialFocus?: () => HTMLElement | null` (sem ela, nada muda para
  `ImportProgressScreen`/`EpgSettingsScreen`/`TmdbKeyScreen`). No cadastro, ela
  devolve o cartão do tipo selecionado; na edição não é passada (foco no
  primeiro campo, como hoje). A ordem do DOM segue a ordem visual: mock do
  celular → tipos → campos → Voltar → Conectar e sincronizar.
- **D-010 — Textos.** Rótulos: "Nome da lista", "Servidor", "Usuário", "Senha",
  "URL M3U". Envio: "Conectar e sincronizar" (enviando: "Conectando…"); edição:
  "Salvar alterações"/"Salvando…". As **mensagens de validação e de erro ficam
  idênticas** às de hoje (FR-018), exceto a de nome vazio, que vira "Informe um
  nome para a lista.". Demais textos na tabela "Textos" abaixo.
- **D-015 — Layout da edição.** Na edição não há painel lateral "Como
  funciona", painel do celular nem seletor de tipo: só o painel manual, em
  largura total, com os campos do tipo da lista e as ações (FR-021).
- **D-011 — Helper de E2E.** Novo `tv-web/e2e/lib/entrada.mjs` com
  `cadastrarListaM3u(page, { nome, url })` e
  `cadastrarListaXtream(page, { nome, servidor, usuario, senha })`, que partem da
  tela de listas, abrem o cadastro, escolhem o tipo, preenchem e enviam. Todos
  os scripts que hoje preenchem "Nome de exibição" passam a usá-lo — não se
  copia a sequência nova em 24 arquivos.
- **D-012 — CSS escopado, progresso intocado.** `styles/profiles.css` é
  reescrito para a tela nova; o cadastro ganha um bloco `.source-setup` em
  `styles/onboarding.css`. As regras compartilhadas com `ImportProgressScreen`
  (`.screen.onboarding`, `.onboarding-brand*`, `.onboarding-kicker`,
  `.onboarding-title`, `.onboarding-subtitle`, `.progress-*`) **não mudam** —
  ajustes para as telas novas são feitos por seletor escopado
  (`.profiles-screen .onboarding-brand`, `.source-setup .onboarding-title`).
  As regras que só o cadastro antigo usava (`.onboarding-layout`,
  `.onboarding-form`, `.onboarding-fields`, `.onboarding-tabs`,
  `.onboarding-side*`, `.onboarding-submit`) são removidas quando ficarem sem
  uso (conferir por grep antes).
- **D-013 — Rolagem do cadastro.** A raiz do cadastro rola na vertical
  (`overflow-y: auto` + `.no-scrollbar`); como o foco ali é DOM real, o
  `focus()` do `useTvKeyNav` já traz o elemento para a vista. O layout mira
  caber em 1080 sem rolar com Xtream (4 campos em grade 2 colunas, como o
  protótipo), mas a rolagem é a garantia (FR-020).
- **D-014 — Tipografia.** Onde o protótipo usa tamanhos sem token (76/66/58 px),
  vale o token V14 mais próximo (`--fs-display` 64 px para o título das duas
  telas). Anel de foco: receita global V14 (`.tv-focus`/`:focus`), não o
  contorno branco do protótipo.

### Textos (D-010)

| Onde | Texto |
| --- | --- |
| Listas — kicker (com listas / sem listas) | "Bem-vindo de volta" / "Configuração inicial" |
| Listas — título | "Selecione ou Adicione" + quebra + "sua lista" |
| Listas — subtítulo (com / sem / carregando) | "Escolha uma lista para continuar ou adicione uma nova." / "Adicione sua primeira lista para começar." / "Carregando suas listas…" |
| Listas — rodapé | "Cada lista mantém seu próprio histórico, favoritos e recomendações." |
| Cadastro — kicker / título | "Configuração inicial" / "Conecte sua lista IPTV" |
| Cadastro — subtítulo | "Escolha Xtream Codes ou Lista M3U e preencha os dados da sua lista. Conectar pelo celular chega em breve." |
| Como funciona — passos | 1 "Escolha o tipo" · "Xtream Codes ou Lista M3U"; 2 "Digite os dados" · "Servidor e login, ou a URL da lista"; 3 "Sincronizar tudo" · "Canais, EPG, filmes e séries chegam na TV" |
| Como funciona — nota | "Em breve: conectar pelo celular, sem digitar no controle remoto." |
| Painel principal | h2 "Adicionar serviço" · "Preencha na TV com o controle remoto — o teclado da TV abre em cada campo." |
| Painel do celular | selo "Em breve" · h3 "Conectar com celular" · texto "Parear a TV com o celular por QR code, para não digitar URLs longas no controle." · `ComingSoon id="pair-phone"` |
| Painel manual | selo "Disponível agora" · h3 "Configuração manual" · "Xtream Codes" — "Servidor, usuário e senha com categorias e EPG." · "Lista M3U" — "URL única para playlist rápida e compatível." |
| Edição — kicker / título | "Suas listas" / "Editar lista" (subtítulo de edição de hoje) |

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Nada de conta; perfil = lista (ADR-011). |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Cartão sem data, sem DNS/URL/credencial (FR-024, contrato 037 #1); edição mantém usuário/senha em branco; mensagens de erro inalteradas. |
| Categorias da Fonte São Preservadas | N/A | N/A | Não toca catálogo. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Mock do celular sem QR/código/endereço (FR-013, contrato 037 #5); textos não prometem pareamento (FR-014). |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | Telas leem só IndexedDB; cadastro usa o pipeline local de hoje. |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | ✅ | ✅ | Todos os controles alcançáveis por setas (D-006, D-009, D-013). |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Carregando/vazio/erro mantêm focável; "Configurações" focável em todos exceto erro (onde "Tentar de novo" já é); cadastro rola com o foco. |
| Voltar Restaura Foco e Posição | ⚠️ | ✅ | Hoje voltar do cadastro cai na última lista usada; D-007 resolve com a sentinela por id (contrato 037 #3). |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Par de cores por hash do **id** (D-003). |
| Progresso e Capacidades São Reais, Nunca Prometidos | ✅ | ✅ | Tela de progresso intocada; nenhum passo de "Como funciona" marcado como concluído. |
| Documentação do Repositório É Canônica | ✅ | ✅ | Polish atualiza `CLAUDE.md`, backlog e comentários de cabeçalho das duas telas. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/037-entrada-listas-prototipo/
├── spec.md
├── plan.md                  # este arquivo
├── quickstart.md
├── logic/
│   └── avatar-da-lista.md   # iniciais + hash FNV-1a + 6 pares de tokens
├── contract-tests.lock      # 3 arquivos, 5 testes
├── tasks.md
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/
├── e2e.mjs                                   # usa o helper novo
├── e2e/
│   ├── lib/entrada.mjs                       # NOVO (D-011)
│   └── *.mjs                                 # ~23 scripts migram para o helper
└── src/
    ├── App.tsx                               # onAddSource com `from` (D-007)
    ├── index.css                             # tokens --list-avatar-N-from/to (D-003)
    ├── lib/
    │   ├── useTvKeyNav.ts                    # opção initialFocus (D-009)
    │   └── useTvKeyNav.test.tsx
    ├── styles/
    │   ├── profiles.css                      # reescrito (tela de listas)
    │   └── onboarding.css                    # + bloco .source-setup; remove regras órfãs
    └── features/
        ├── profiles/
        │   ├── ProfilesScreen.tsx            # reescrito (US1, US3)
        │   ├── ProfilesScreen.test.tsx       # textos/assertivas atualizados
        │   ├── ProfilesScreen.entrada-listas.contract.test.tsx   # TRAVADO
        │   ├── ProfilesScreen.shell-navegacao.contract.test.tsx  # TRAVADO (023)
        │   ├── listAvatar.ts                 # NOVO (stub do plan)
        │   └── listAvatar.entrada-listas.contract.test.ts        # TRAVADO
        ├── import/
        │   ├── AddSourceScreen.tsx           # reescrito (US2, US4)
        │   ├── AddSourceScreen.test.tsx      # textos/assertivas atualizados
        │   ├── AddSourceScreen.entrada-listas.contract.test.tsx  # TRAVADO
        │   ├── OnboardingBrand.tsx           # reusado nas duas telas
        │   └── ImportProgressScreen.tsx      # NÃO muda
        └── sources/sourceFormat.ts           # NÃO muda (formatType reusado)
```

**Structure Decision**: projeto `tv-web/` (React/Vite) sozinho; `api/` e
`CCPlayTv/` não são tocados (um único `assets/index.css` é empacotado — CSS novo
não exige mudança em `tizen_web_project.yaml`).

## Complexity Tracking

Nenhuma violação da constitution. Desvios **do protótipo** (não da constitution),
todos por precedência da ADR-011 ou por honestidade de mock: D-008 (pílulas
fundidas nos cartões de tipo), D-014 (tamanhos por token), textos de FR-013/
FR-014 (celular como "Em breve"), campo Nome sem valor pré-preenchido.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (a partir de `tv-web/`):

```powershell
npx vitest run <arquivo>            # o mais estreito primeiro
npm run test                        # suíte inteira (flakes conhecidos: *.favorites.test.tsx / LiveScreen.test.tsx sob paralelismo — confirmar isolado)
npx tsc -b
npm run lint
npm run build:tizen
npm run dev                         # em outro terminal, antes do E2E
npm run test:e2e
```

- Unidade: `listAvatar` (casos além do contrato), `useTvKeyNav` com
  `initialFocus`.
- Componente: `ProfilesScreen.test.tsx` e `AddSourceScreen.test.tsx`
  atualizados para os textos novos, mais estados (carregando/vazio/erro),
  edição, validação, RETURN, `findUnnamedControls` em cada estado.
- Integração: `App.test.tsx`/`appNav` — voltar do cadastro aberto pela tela de
  listas cai em "Adicionar lista".
- E2E: todos os scripts de `test:e2e` verdes com o helper novo; `e2e.mjs`
  ganha asserções da tela nova (título, cartão-botão, foco de volta).
- Manual: `quickstart.md` (comparação lado a lado com o protótipo — SC-001).

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/features/profiles/listAvatar.entrada-listas.contract.test.ts`,
`tv-web/src/features/profiles/ProfilesScreen.entrada-listas.contract.test.tsx`,
`tv-web/src/features/import/AddSourceScreen.entrada-listas.contract.test.tsx`

Comando (de `tv-web/`):
`npx vitest run src/features/profiles/listAvatar.entrada-listas.contract.test.ts src/features/profiles/ProfilesScreen.entrada-listas.contract.test.tsx src/features/import/AddSourceScreen.entrada-listas.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| listAvatar › iniciais seguem as regras… e o par de cores é estável… | FR-005, Edge Cases | Fase 2 | `Error: not implemented` |
| ProfilesScreen › tela de listas no formato do protótipo… | US1/AC1, US1/AC4, FR-003, FR-005–FR-007, FR-024 | Fase 3 | `expected 'Quem está assistindo?' to match /Selecione ou Adicione\s*sua lista/` |
| ProfilesScreen › foco inicial pedido em "Adicionar lista"…; ↓ "Configurações"… | FR-008, FR-019, Constitution: Voltar Restaura Foco e Posição | Fase 3 | `expect(element).toHaveClass("tv-focus")` no cartão "Adicionar lista" |
| AddSourceScreen › abre em Xtream Codes…; "Conectar e sincronizar" cria a lista | US2/AC1–AC4, FR-012, FR-015–FR-018 | Fase 4 | `toHaveTextContent` — título ainda "Adicionar lista" |
| AddSourceScreen › "Conectar com celular" é mock honesto… | FR-013, FR-014, FR-023, SC-005 | Fase 4 | `Unable to find … role "heading" and name "Conectar com celular"` |

Saída vermelha confirmada em 2026-09-30: 5/5 falhando pelos motivos acima; a
suíte da área (`src/features/profiles src/features/import src/navigation`)
continuou 108/108 verde com os stubs.

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/features/profiles/listAvatar.ts` (funções com
`throw new Error('not implemented')`, `LIST_AVATAR_VARIANTS = 6`);
`ADD_LIST_FOCUS_ID` exportado em `tv-web/src/features/profiles/ProfilesScreen.tsx`
(ainda não honrado em `initialFocusSourceId`).

Travas de **outras** features que esta toca e precisam continuar íntegras e
verdes: 023 (`ProfilesScreen.shell-navegacao.contract.test.tsx`,
`appNav.shell-navegacao.contract.test.ts`), 026
(`SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`), 028
(`accessibleNames.limpeza-qa-ds-v14.contract.test.tsx`).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| US1 — tela de listas | Concluída — formato `profiles()`, avatar por id, cartão-botão, "Configurações" no canto, voltar do cadastro em "Adicionar lista" |
| US2 — cadastro | Concluída — formato `sourceSetup()`, Xtream Codes padrão e em foco, celular "Em breve", cabe em 1080 dentro da safe zone |
| US3 — primeiro uso | Concluída — textos de primeiro uso/carregando, só "Adicionar lista" em foco |
| US4 — edição | Concluída — só o painel manual, sem celular/seletor/"Como funciona" |
| Contratos | 037 5/5 verdes; travas 037/023/026/028 íntegras |
| Suítes | Unitária completa: 1872/1886 — 4 flakes conhecidos (106/106 isolados) + 10 contratos das features 034/036 (planejadas, stubs `not implemented`, vermelhos por design); `tsc`/lint/`build:tizen` limpos; `test:e2e` 18/18 |
| E2E | Todos os cadastros de lista em `tv-web/e2e*` via `e2e/lib/entrada.mjs`; `paridade-*`/`shell-visual`/`-real` migrados e não rodados |
| Chips da 034 no cartão | Ainda não existem; a linha `.source-card-notices` está pronta (R-001) |
| SC-001 (capturas) | Os 7 estados capturados: com/sem listas, carregando, erro, cadastro Xtream/M3U, edição (T038 fechou CV-001) |
| TV física | Feita em 2026-09-30 na QN50Q60DAGXZD (192.168.0.2), reinstalação com o mesmo certificado (IndexedDB preservado): o usuário conferiu tela de listas, foco, cadastro com Xtream Codes em foco e rolagem, teclado da TV por campo, RETURN para "Adicionar lista" e legibilidade das iniciais — "tudo funcionou conforme esperado". O estado "sem listas" na TV não foi visto (exigiria desinstalar). |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A feature 034 (planejada, código parcial no working tree) também põe chips de conta e "Sincronizando" no cartão da lista (`sourceAlertChips` em `sourceFormat.ts`). | Conflito de merge / chips perdidos no cartão novo. | O cartão novo tem a linha `.source-card-notices` (D-004); quem entrar por último renderiza ali os chips da outra. Conferir `git log`/working tree de `ProfilesScreen.tsx` e `sourceFormat.ts` ao começar a Fase 3. |
| R-002 | ~24 scripts E2E (incluindo `-real`, fora do `test:e2e`) preenchem "Nome de exibição"/"URL da lista M3U" contando com M3U como padrão e clicam "Adicionar lista" como envio. | `test:e2e` inteiro vermelho após a Fase 4. | Resolvido: helper `e2e/lib/entrada.mjs` (D-011); 25 scripts migrados na Fase 4, grep sem rótulo antigo, `test:e2e` 18/18. |
| R-003 | O `sourceSetup()` do protótipo não cabe em 1080 (corta Usuário/Senha). | Campo/ação fora da tela no controle remoto. | Resolvido: grade 2 colunas + espaçamentos compactados — cadastro Xtream cabe em 1080 dentro da safe zone (painel termina em y=990); rolagem com `scroll-padding-block` como garantia; quickstart B confirma todo focável inteiro na tela. |
| R-004 | Tamanhos de fonte do protótipo sem token (76/66/58 px). | Tela menos "igual" ao protótipo. | Resolvido: `--fs-display` (64 px) nas duas telas (D-014), desvio aceito e conferido nas capturas. |
| R-005 | `ProfilesScreen.test.tsx` e `AddSourceScreen.test.tsx` têm muitas asserções nos textos antigos ("Quem está assistindo?", "Gerenciar listas", "Nome de exibição", `tablist`, "Nunca sincronizada"). | Suíte vermelha por texto, não por comportamento. | Resolvido: os dois arquivos reescritos para os textos novos com a mesma cobertura de comportamento e casos a mais (54 e 46 testes verdes). |
| R-006 | `useTvKeyNav` é compartilhado por 4 telas. | Regressão de foco inicial em outra tela. | Resolvido: `initialFocus` aditivo (só o cadastro passa) + ordenação por documento (R-009); testes das outras telas que usam o hook verdes. |
| R-008 | Com `onBackField`, RETURN no cadastro volta um focável por vez e só sai no **primeiro** focável do DOM. Com o foco inicial em "Xtream Codes" (D-009) e o mock do celular antes dele no DOM, o RETURN logo ao abrir iria para o mock, não para a tela de listas — contraria US2/AC6 e FR-019. | RETURN "não volta" na primeira tentativa. | Resolvido: a premissa não vale — o `AddSourceScreen` nunca usou `onBackField`; o RETURN é do `useRemoteNav({ onBack })` e sai da tela de qualquer focável (inclusive de um campo: Escape/10009 não estão entre as teclas que o campo editável segura). Nada mudou no hook; coberto por teste ("RETURN com o foco num campo também sai da tela") e pelo `e2e.mjs`. |
| R-007 | FR-023 da spec diz que mock deve ter "em breve" no nome **e** `aria-disabled`; o `ComingSoon` (022/028) tem só a mensagem no nome + `aria-disabled`, e o verificador da 028 aceita isso. | Ambiguidade na leitura do FR. | Resolvido: FR-023 emendado (Analyze A-01, 2026-09-30) para o padrão do `ComingSoon` — `aria-disabled` + "Em breve" visível e anunciado (contrato 037 #5). |
| R-009 | No jsdom (nwsapi), `container.querySelectorAll` com lista de seletores devolve os elementos agrupados por seletor (todos os `button` antes dos `input`), não na ordem do documento. O `useTvKeyNav` navegava, nos testes, numa ordem que o navegador nunca tem (tipos → Voltar → Conectar → campos). | Testes de ordem de foco enganosos; bug real escondido ou falso. | Resolvido: `getFocusable` ordena por `compareDocumentPosition` (no navegador, no-op); teste de botões e campos misturados em `useTvKeyNav.test.tsx` (T027a). |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-30 | Fase 1 (Setup) | T001: chips de conta da 034 (`sourceAlertChips`) **não** estão no working tree nem no `git log` de `sourceFormat.ts`/`ProfilesScreen.tsx` — o cartão novo só renderiza os `.source-card-badge` atuais; quem entrar por último (034) usa `.source-card-notices` (R-001). T002: 5/5 contratos vermelhos pelos motivos da tabela, trava íntegra. | — |
| 2026-09-30 | Fase 2 (Foundational) | T003–T008: avatar (iniciais + FNV-1a), 6 pares de tokens, `initialFocus` aditivo no `useTvKeyNav` (+4 testes), helper E2E. Contrato `listAvatar` 1/1; testes das 4 telas que usam o hook seguem verdes (R-006). | — |
| 2026-09-30 | Fase 3 (US1) | T009–T019: tela de listas reescrita no formato `profiles()`; `ADD_LIST_FOCUS_ID` honrado + `from` no `App.tsx`; `profiles.css` só com tokens; `ProfilesScreen.test.tsx` atualizado (+3 casos: avatar decorativo, nome longo, linha de avisos) e `App.test.tsx` (+1: voltar do cadastro em "Adicionar lista"); `e2e.mjs` +4 verificações, verde. Textos de T029 entraram junto. | R-008 (RETURN no cadastro com `initialFocus`) para a Fase 4 |

| 2026-09-30 | Fase 4 (US2) | T020–T028a + T027a (ad-hoc): cadastro reescrito no formato `sourceSetup()` (edição já no mesmo JSX); bloco `.source-setup` só com tokens, compactado para caber na safe zone; 25 scripts E2E migrados para o helper; `AddSourceScreen.test.tsx` reescrito (15 testes, +ordem de foco, RETURN num campo, "Voltar", OK duplo, validação completa); `e2e.mjs` +SC-002. R-008 resolvido sem código; R-009 (ordem do jsdom) corrigido no hook. `test:e2e` 18/18. | Paridade/`shell-visual`/`-real` migrados mas não rodados |

| 2026-09-30 | Fase 5 (US3) | T029 conferido (já no código desde a Fase 3); T030: +3 testes de primeiro uso/carregando em `ProfilesScreen.test.tsx`. 54/54. | — |
| 2026-09-30 | Fase 6 (US4) | T031 conferido (já no JSX da Fase 4); T032: +3 testes de edição (Xtream, gravação via `updateSource`, M3U). 46/46. | — |
| 2026-09-30 | Fase 7 (Polish) | T033 regras órfãs do `onboarding.css` removidas (só `.onboarding-error` ficou); T034 suíte completa (falhas = flakes conhecidos + contratos de 034/036 ainda não executadas), `tsc`/lint/`build:tizen` limpos; T035 travas íntegras; T036 quickstart A–D por roteiro Playwright + capturas do app e do protótipo (fora do repo); T037 `CLAUDE.md` e `migracao-design-system-v14.md`. | TV física (recomendada) |

| 2026-09-30 | Phase 8 (Convergence) | T038 (CV-001, SC-001): capturas de carregando e erro num Chromium real via `addInitScript` sobre `IDBFactory.prototype.open`; 9/9 verificações. Sem código de produção. | — |

| 2026-09-30 | Pós-convergência (TV física) | `deploy-tv.ps1` instalou e lançou na QN50Q60DAGXZD; o usuário verificou os 6 pontos do roteiro (tela de listas, foco, cadastro/rolagem, IME, RETURN, iniciais) e aprovou. Primeiro uso na TV não observado. | — |

**PRÓXIMO**: nada pendente nesta feature; R-001 fica com a feature 034.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/profiles/ProfilesScreen.tsx`, `listAvatar.ts` + testes
- `tv-web/src/features/import/AddSourceScreen.tsx` + `AddSourceScreen.test.tsx`
- `tv-web/src/styles/profiles.css`, `tv-web/src/styles/onboarding.css` (bloco `.source-setup`), tokens `--list-avatar-N-*` em `index.css`
- `tv-web/src/lib/useTvKeyNav.ts` (`initialFocus`, ordem por documento)
- `tv-web/src/App.tsx` (`from` com `ADD_LIST_FOCUS_ID`)
- `tv-web/e2e/lib/entrada.mjs`, `tv-web/e2e.mjs` (SC-002)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- Captura do protótipo com Playwright: a tela inicial dele já é `profiles()`, mas o splash dele fica por cima por ~6 s — esperar antes de capturar. `go()` não é global (está numa closure); o cadastro abre clicando em `[data-action="newProfile"]`.
- Não editar arquivos com acento via `Get-Content`/`Set-Content` do Windows PowerShell 5.1 sem `-Encoding UTF8`: ele lê como ANSI e grava mojibake. Usar Edit/Write, ou `[IO.File]::ReadAllText/WriteAllText` com UTF-8.
- O Playwright não clica em controle com `aria-disabled="true"` (o mock `ComingSoon` é soft-disabled de propósito): num roteiro, usar `click({ force: true })` ou foco + Enter.
- Iniciais seguem a regra à risca: "Sala de Estar" → "SD" (primeira letra das duas primeiras palavras, conta "de").

## Resultado Final

Convergida em 2026-09-30 (segunda passada do `sdd-converge`; a primeira achou só CV-001, fechado pela T038).

**Construído**: `ProfilesScreen` no formato `profiles()` ("Selecione ou Adicione sua lista"): cartão com selo do tipo, avatar de iniciais com par de cores por FNV-1a do id (`listAvatar.ts`, 6 pares de tokens sobre `--brand-*`), nome e avisos, sem data; cartão-botão "Adicionar lista"; "⚙ Configurações" no canto; volta do cadastro com foco em "Adicionar lista" (`ADD_LIST_FOCUS_ID` + `from` no `App.tsx`). `AddSourceScreen` no formato `sourceSetup()` ("Conecte sua lista IPTV"): "Como funciona", celular como mock "Em breve", seletor Xtream Codes (padrão, em foco via `initialFocus`) / Lista M3U, campos e ações novos, mesma validação e `mutate`; edição só com o painel manual. Todos os cadastros E2E via `e2e/lib/entrada.mjs`. SC-002 medido: 2 OK.

**Desvios em relação ao plano original**:
- R-008 não exigiu código: o cadastro nunca usou `onBackField`; RETURN já saía de qualquer focável.
- T027a (ad-hoc): `useTvKeyNav` passou a ordenar os focáveis pela posição no documento — o jsdom agrupava por seletor (R-009). Sem efeito no navegador.
- O modo edição (T031) e os textos de primeiro uso (T029) entraram junto com as Fases 4 e 3, por serem o mesmo JSX; as Fases 5/6 ficaram só com os testes.
- Edição: selo com o tipo da lista + h2 "Configuração manual" (a tabela "Textos" não fixava esse cabeçalho).
- Espaçamentos do cadastro compactados para caber na safe zone (em vez de só rolar).

**Ficam em aberto (não gates)**: R-001 (chips de conta da 034 no cartão — a 034 ainda não tem código; a linha `.source-card-notices` está pronta); passada na TV física (recomendada); scripts de captura `paridade-*`/`shell-visual` e os dois `-real` migrados mas não rodados.

**Atualização (2026-09-30, pós-convergência):** a passada na TV física, recomendada, foi feita e aprovada pelo usuário (ver `## Estado Atual` → TV física); só o estado "sem listas" não foi observado no aparelho.
