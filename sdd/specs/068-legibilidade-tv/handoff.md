# Handoff — 068-legibilidade-tv

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. React 19 + TS + Vite (`tv-web/`), app Tizen.
- Próximo comando: `/sdd-execute 068-legibilidade-tv`. Backlog: **Planejada**, 0/43.
- A árvore tem muito trabalho não commitado da 067 e da correção de progresso de filmes — não misturar nos commits da 068.
- Arquivo de produção já alterado por este plano: `tv-web/src/features/live/LiveScreen.tsx` (stub, ver abaixo).

## O que a feature entrega

- **US1 (P1)**: escala de texto maior no app **inteiro**, player incluído: mínimo 20, padrão 24, texto grande 28, seção 32, título 48, destaque 64. Caixas crescem com o texto; ícones e capas **não**. Nome longo: "…" fora de foco, inteiro (rolando) no foco.
- **US2 (P2)**: TV ao vivo **sem topbar e sem bloco de título**; uma lista à esquerda (~1/3) que mostra categorias **ou** canais; destaque do canal focado à direita; contagem "N canais" no cabeçalho da lista de canais. RETURN dos canais → mesma categoria; RETURN das categorias → Início.
- Fora: Filmes/Séries em coluna única (fica como ideia no backlog).

## Leitura obrigatória, em ordem

1. `spec.md` — FR-001..FR-014, SC-001..SC-005, Clarifications (decisões do usuário).
2. `plan.md` — Decisões Invariantes D-001..D-011, riscos R-001..R-008, comandos.
3. `tasks.md` — fases 1–4 (T001–T034).
4. `logic/escala-e-auditoria.md` — tokens, mapa de literais, constantes de altura em JS, regra do nome longo, auditoria E2E.
5. `logic/live-coluna-unica.md` — o que já existe no teclado da Live, `data-live-view`, sem `shell`, "Gerenciar categorias", tetos, E2E a ajustar.
6. `contract-amendments/` — o texto exato do contrato emendado da 049.
7. `quickstart.md` — conferência no navegador e o gate na TV.
8. `.planning/memory/constitution.md`.

## Testes de contrato

- `tv-web/src/styles/escala.legibilidade-tv.contract.test.ts` — 2 testes, Fase 2 (US1).
- `tv-web/src/features/live/LiveScreen.legibilidade-tv.contract.test.tsx` — 2 testes, Fase 3 (US2).
- Rodar (em `tv-web/`): `npx vitest run src/styles/escala.legibilidade-tv.contract.test.ts src/features/live/LiveScreen.legibilidade-tv.contract.test.tsx` — hoje 4 vermelhos por asserção.
- Trava: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 068-legibilidade-tv` (4/5).
- **Outra trava afetada**: 049. T001 copia `contract-amendments/LiveScreen.navegacao-por-pagina.contract.test.tsx` verbatim e T002 regrava a trava da 049 com os **3** arquivos (comando exato em T002). Conferido: com `LIVE_ITEM_ROW_HEIGHT = 108` passa 3/3. Os contratos travados da 024/030/031/048 da Live **não** podem ser editados.

## Stubs criados

- `tv-web/src/features/live/LiveScreen.tsx`: prop `onManageCategories?: () => void` (sem efeito ainda). Para caber no teto, o comentário da prop `shell` virou comentário em linha. A prop `shell` **fica** (o contrato da 024 monta a Live com ela e espera a topbar).

## Armadilhas já mapeadas

- Os tokens `--fs-*` existem em **dois** lugares: `index.css` (base, conferido por `styles/tokens.test.ts`) e `styles/font-scale.css` (efetivo). Mudar os dois; `--font-scale` fica **1** (degraus não proporcionais).
- O contrato #2 varre todo `src/**/*.css` atrás de `font:`/`font-size:` com `Npx` < 20 — inclusive o `18px` da raiz em `index.css`.
- `LIVE_ITEM_ROW_HEIGHT` é **108** (linha 96 + 12), não outro número: o contrato emendado da 049 depende de `floor(640/108) = 5`.
- As três colunas da Live **continuam no DOM** — esconder por CSS (`data-live-view`). Vários contratos travados consultam `.live-column-groups`/`.live-column-channels`/`.live-preview-panel`.
- Sem `shell`, `renderLiveShell` devolve só os filhos e perderia o rodapé de dicas: usar `AppShell` com `topBar={null}` (precedente `VodCategoryScreen.tsx`).
- Tetos do ratchet: `LiveScreen.tsx` 349/349, `liveColumns.tsx` 510/511, `App.tsx` 565/625. Tirar `.live-header` e o objeto `shell` libera as linhas necessárias.
- "Gerenciar categorias" existe hoje só via `shell.onOpenSettings` em **dois** pontos de `LiveScreen.tsx`; sem trocar os dois, o vazio "todas escondidas" volta a mostrar "Voltar".
- Sem chave i18n nova: a contagem usa `live.channelCount`.
- `App.source-access.test.tsx` é flaky sob a suíte inteira (passa isolado) — pré-existente.
- Em PowerShell, `npm run x -- --flag` perde o `--`: para `test:e2e -- --only`, usar Bash ou `node e2e/run.mjs --only …`.
- Auditoria e capturas: só lista fictícia; nunca usar a lista real (`docs/m3u/dados.md`) nem mostrar credencial.

## Pendências do Analyze

- A-001 (LOW): SC-004 ("no máximo uma tecla a mais") não tem task própria — conferir no quickstart item 3 ao fechar a Fase 3.
- A-002 (LOW): FR-010 "foco no canal já lembrado da categoria" é comportamento existente; só T025 o cobre — conferir à mão no quickstart.

## Gate de pronto

- Contratos 068 (4/4) e 049 (emendado) verdes; travas `068-legibilidade-tv` e `049-navegacao-por-pagina` íntegras.
- `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen`, `node e2e/legibilidade-tv.mjs` (0 achados em pt/en/es), `npm run test:e2e`.
- `quickstart.md` executado; nota de emenda na Spec V14 §6; linha de regra no `CLAUDE.md`.
- **Passada na TV física é gate** (SC-005): o usuário aprova de longe.
