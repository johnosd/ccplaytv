# Handoff — 051-detalhe-filme-paridade-v14

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. React 19 + TS + Vite em `tv-web/`, alvo Tizen 9 (`chrome108` não remover).
- Próximo comando: `/sdd-execute 051-detalhe-filme-paridade-v14`. Backlog: **Planejada**.
- Fora desta sessão: `tv-web/src/styles/vod.css` e `VodCatalogScreen.tsx` estão **modificados e sem commit** (feature 050) — reler `vod.css` antes de editar. A 048 (Live) pode estar aberta na mesma árvore.

## O que a feature entrega

- **US1 (P1)**: hero do detalhe do filme com capa grande de ponta a ponta sob vinheta, botões V14 (incl. "Marcar como assistido") e selo "✓ Assistido".
- **US2 (P2)**: aba Elenco com cartões foto + nome + personagem, iniciais sem foto.
- **US3 (P2)**: aba Semelhantes com cartões V14; "✓ Na sua lista" evidente nos que existem no catálogo.
- **Decisões do usuário que contrariam o óbvio**: as funções **já existem** (019, 035) — a feature é só visual; Elenco e Semelhantes **continuam abas**, não viram telas de rota própria.

## Leitura obrigatória, em ordem

1. `spec.md` — escopo, FR-001..FR-012, SC-001..SC-006.
2. `plan.md` — decisões D-001..D-008, riscos R-001..R-006.
3. `tasks.md` — T001..T023.
4. `quickstart.md` — verificação ponta a ponta.
5. `.planning/memory/constitution.md` — foco, voltar, segredos.
6. Padrão de referência: `sdd/specs/050-filmes-series-paridade-v14/plan.md` (hero sem blur, capa real).

## Testes de contrato

Nenhum (feature puramente visual; justificativa em `plan.md` → Testes de Contrato). Os testes existentes de filme/elenco/semelhantes (`MovieDetailScreen.*.test.tsx`, `SimilarPanel.test.tsx`) devem continuar verdes **sem edição**. Travas de outras features que podem ser quebradas: `035`, `050`, `049`, `046`, `025` — conferir com `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug <slug>`.

## Stubs criados

Nenhum.

## Armadilhas já mapeadas

- `.vod-detail*` em `vod.css` é **compartilhado** com `SeriesDetailScreen`: todo CSS novo sob `.vod-detail--movie` (D-003); a série deve ficar idêntica.
- Backdrop é `<img>` filho do hero (`DetailBackdrop`), nunca `background-image` no `.screen` (D-008 da 032); some junto quando o AVPlay exibe. Sem blur.
- Textos `FOUND_LABEL`, `NOT_FOUND_LABEL` e `STATE_TEXT` de `SimilarPanel.tsx` são fixados por contratos da 035 — não mudar.
- `CastPeoplePanel`: manter `data-person-key`, `personFocusKey`, `onSelectPerson`; `SimilarRow`: `data-similar-key` (a rolagem do foco depende deles).
- Só **acrescentar** bloco ao fim de `vod.css`; não reeditar regras existentes (R-001). T007, T012, T016 editam o mesmo arquivo: sequenciais.
- Não importar conteúdo do protótipo ("4K UHD", "5.1 Dolby", relevância %) — ADR-011.
- E2E usam `localhost:5173` fixo; rodar parcial: `node e2e/run.mjs --only <nome> --jobs 1`.
- Não acrescentar parágrafo de status ao `CLAUDE.md`.

## Pendências do Analyze

- **A-001 (LOW)**: o protótipo mostra "Sinopse + Detalhes" em painéis (`.detail-panel`/`.fact-box`) e o Spec §32 lista "dados técnicos"; a spec não pede reestilizar a aba Detalhes. Recomendação: decidir no execute se entra (tasks não cobrem).
- **A-002 (LOW)**: "Minha Lista" e "Trailer" estão no Spec §32; já existem como ações — T007 só restila. Sem task nova.
- **A-003 (MEDIUM)**: FR-001/SC-001 ("sem texto ilegível") só são verificáveis visualmente; sem contrato. Mitigação: capturas em ≥3 filmes reais (R-003, T020).
- **A-004 (LOW)**: SC-002 ("1 s", "2 apertos") não tem task de medição dedicada; coberto por T019 (E2E).

## Gate de pronto

- Testes existentes + novos verdes; travas íntegras (035, 050, 049, 046, 025).
- De `tv-web/`: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e` completo com `npm run dev` na 5173.
- `quickstart.md` executado; série idêntica às capturas anteriores.
- Docs: `update-feature-status.ps1 -Slug 051-detalhe-filme-paridade-v14 -Status Implementada`, `plan.md` (Estado Atual/Execution Notes/PRÓXIMO), sem mexer no `CLAUDE.md`.
- Passada na TV física: **recomendação**, não gate.
