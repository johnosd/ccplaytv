# Handoff — 037-entrada-listas-prototipo (sdd-plan → sdd-execute)

## Contexto

- Repositório `ccplayTv`, branch `feature/novo-design-system`. Front em `tv-web/`
  (React 19 + TS + Vite, Vitest, Playwright por scripts `e2e*.mjs`).
- Próximo comando: `/sdd-execute 037-entrada-listas-prototipo`.
- Backlog: **Planejada**, 0/48 tasks.
- Mudou em disco fora do fluxo normal: o protótipo
  `docs/design/design-system/CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` foi
  ajustado em 2026-09-30 (título "Selecione ou Adicione sua lista", cartão-botão
  "Adicionar lista" que leva a `sourceSetup()`). É ele a referência visual.
- Working tree tem código **não commitado da feature 034** (`importApi.ts`,
  `db.ts`, `sourceRepository.ts`, `features/sources/SourceAccessGate.tsx`,
  `lib/catalog/sourceAccount.ts`/`accountCheck.ts` + contratos). Não é desta
  feature — não reverter, não commitar junto.

## O que a feature entrega

- **US1 (P1)** tela de listas no formato `profiles()`: cartão vertical com selo
  do tipo, avatar de iniciais em gradiente estável, nome e linha de avisos
  (**sem** data de sincronização); cartão-botão "Adicionar lista"; "Gerenciar
  listas" vira "⚙ Configurações" no canto. A linha Ressincronizar/Editar/
  Excluir via ↓ **continua** (decisão do usuário).
- **US2 (P1)** cadastro no formato `sourceSetup()`: "Conecte sua lista IPTV",
  "Como funciona", painel do celular como **mock "Em breve"** (sem QR/código),
  seletor **Xtream Codes (padrão)** / Lista M3U, "Conectar e sincronizar" → a
  **mesma tela de progresso de hoje** (decisão do usuário).
- **US3 (P2)** sem listas: só "Adicionar lista", em foco, textos de primeiro uso.
- **US4 (P3)** edição na tela nova, sem celular e sem trocar o tipo.

## Leitura obrigatória, em ordem

1. `spec.md` — FRs 001–024, decisões do usuário em `## Clarifications`.
2. `plan.md` — Decisões Invariantes D-001–D-014, **tabela "Textos"** (todas as
   strings), riscos R-001–R-007, travas de outras features.
3. `tasks.md` — 7 fases, T001–T037.
4. `logic/avatar-da-lista.md` — regras de iniciais, hash FNV-1a, 6 pares de tokens.
5. `quickstart.md` — cenários A–D e comandos.
6. `.planning/memory/constitution.md` — em especial Foco Visível, Voltar Restaura Foco, Segredos.

## Testes de contrato

Travados (5/5), comando a partir de `tv-web/`:

```powershell
npx vitest run src/features/profiles/listAvatar.entrada-listas.contract.test.ts src/features/profiles/ProfilesScreen.entrada-listas.contract.test.tsx src/features/import/AddSourceScreen.entrada-listas.contract.test.tsx
```

- `listAvatar.entrada-listas.contract.test.ts` — 1 teste, Fase 2.
- `ProfilesScreen.entrada-listas.contract.test.tsx` — 2 testes, Fase 3.
- `AddSourceScreen.entrada-listas.contract.test.tsx` — 2 testes, Fase 4.

Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 037-entrada-listas-prototipo`.
Travas de outras features que esta pode quebrar: **023**
(`ProfilesScreen.shell-navegacao.contract.test.tsx` — nome acessível do cartão
contém o nome da lista, `/Adicionar lista/` existe, ↓ numa lista abre as ações,
exclusão com modal; `appNav.shell-navegacao.contract.test.ts`), **026**
(`SettingsScreen…contract`), **028** (`accessibleNames…contract`).

## Stubs criados

- `tv-web/src/features/profiles/listAvatar.ts` — `LIST_AVATAR_VARIANTS = 6`
  (definitivo) e `listInitials`/`listAvatarVariant` com `throw new Error('not implemented')`.
- `tv-web/src/features/profiles/ProfilesScreen.tsx` — `export const
  ADD_LIST_FOCUS_ID = ADD_ID` com comentário "STUB do sdd-plan"; ainda **não**
  honrado em `initialFocusSourceId` (T013 remove o comentário).

## Armadilhas já mapeadas

- **~24 scripts E2E** cadastram lista com `getByLabel('Nome de exibição')` +
  `'URL da lista M3U'` **sem clicar em aba** (contam com M3U como padrão) e
  enviam por `getByRole('button', { name: 'Adicionar lista' })`. Com Xtream
  padrão e rótulos novos, **todos quebram** — por isso o helper
  `e2e/lib/entrada.mjs` (T006) e a migração T026 na mesma fase da troca.
  Inclui os `-real` (Xtream, fora do `test:e2e`).
- `.source-card`, `.source-card-wrap`, `.source-card-badge`, `.add-card`,
  `#add-source-title` são seletores de E2E — **não renomear** (D-002).
- O `useTvKeyNav` foca o **primeiro focável do DOM** ao montar; na ordem visual
  do protótipo esse seria o mock do celular. Use a opção nova `initialFocus`
  (T005/T024), não reordene o DOM contra a ordem visual.
- `ImportProgressScreen` compartilha `.screen.onboarding`, `.onboarding-brand*`,
  `-kicker`, `-title`, `-subtitle` e `OnboardingBrand` — está **fora do
  escopo**; ajuste por seletor escopado (`.profiles-screen …`, `.source-setup …`).
- `SourceOut` pode ganhar campos da 034 (`account`) — ler o tipo atual antes
  de mexer no cartão; a linha `.source-card-notices` deve abrigar os chips da
  034 se já existirem (R-001).
- Nenhum `placeholder` nos inputs (DS §37; já testado em `AddSourceScreen.test.tsx`).
- Mensagens de validação/erro ficam **idênticas** às de hoje (FR-018), com uma
  exceção: nome vazio → "Informe um nome para a lista." (atualizar a asserção
  em `AddSourceScreen.test.tsx`, que é o único lugar que cita a antiga).
- Edição: sem "Como funciona", sem celular, sem seletor — painel manual em
  largura total (D-015).
- Iniciais do avatar sobre o gradiente em `--bg-base` (tinta escura), não
  branco — `--brand-3` é amarelo.
- E2E: reinicie o dev server antes (`npm run dev` em `tv-web/`); servidor de
  várias horas deixa a sequência instável. Flakes conhecidos da suíte unitária:
  `*.favorites.test.tsx`/`LiveScreen.test.tsx` sob paralelismo — confirmar isolado.
- `npm` roda em `tv-web/`, não na raiz (não há `package.json` na raiz).

## Pendências do Analyze

Nenhuma. As quatro foram resolvidas em 2026-09-30 (registradas em
`spec.md` → `## Clarifications`):

- A-01 → FR-023 emendado para o padrão do `ComingSoon` (`aria-disabled` + "Em
  breve" visível e anunciado); R-007 marcado como resolvido.
- A-02 → FR-018: nome vazio passa a "Informe um nome para a lista."; D-010 e T023/T027.
- A-03 → FR-021 + D-015: edição sem "Como funciona"; T031/T032.
- A-04 → SC-002 ganhou a task T028a (asserção no `e2e.mjs` contando os OK).

## Gate de pronto

- Contratos 037 5/5 verdes; travas 037/023/026/028 íntegras.
- `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build:tizen` limpos.
- `npm run test:e2e` verde com o dev server recém-iniciado; nenhum rótulo antigo em `tv-web/e2e*`.
- `quickstart.md` A–D com capturas 1920×1080 lado a lado com o protótipo.
- Docs no Polish: `CLAUDE.md` (Project status), backlog via script.
- TV física: **recomendada, não gate**.
