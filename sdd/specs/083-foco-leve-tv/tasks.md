---
description: "Tasks da feature Foco leve na TV"
---

# Tasks: Foco leve na TV

**Input**: Documentos de design de `sdd/specs/083-foco-leve-tv/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `logic/foco-leve.md`, `quickstart.md`

## Path Conventions

- Frontend React/TypeScript: `tv-web/src/`
- Estilos globais: `tv-web/src/index.css`
- Testes frontend: ao lado do sujeito em `tv-web/src/**/*.test.ts(x)`
- E2E: `tv-web/e2e/`
- Evidências da feature: `sdd/specs/083-foco-leve-tv/evidencias/`
- ADR visual: `sdd/adr/ADR-007-design-system-tv-identidade-visual.md`

## Phase 1: Setup — receita compartilhada

**Objetivo**: Confirmar o inventário real de consumidores de `.tv-focus` e estabelecer a baseline automatizada antes da alteração.

### Implementation

- [ ] T001 [P] [US1] Auditar `tv-web/src/index.css`, `PosterArt.tsx`, `Button.tsx`, `Chip.tsx`, `ContentCard.tsx`, `ChannelRow.tsx` e consumidores adicionais de `.tv-focus`; registrar exceções e classes `.no-scale` em `sdd/specs/083-foco-leve-tv/logic/foco-leve.md`.
- [ ] T002 [P] [US1] Executar baseline de `npm run lint`, `npx tsc -b`, suites focadas de componentes e E2E selecionado em `sdd/specs/083-foco-leve-tv/evidencias/baseline-automatizada.txt`.

### Testes da Fase

- [ ] T003 [P] [US1] Reexecutar `npx vitest run src/components/focoDeEstado.test.tsx src/components/PosterArt.test.tsx` em `tv-web/` e registrar a saída.

**Critério de Conclusão**: Inventário dos consumidores concluído, baseline registrada e testes atuais de foco verdes antes de alterar CSS.

**Registro da Fase**:

- Status:
- Feito:
- Contrato: N/A — feature visual sem testes de contrato travados.
- Testes executados:
- Pendências:

---

## Phase 2: Foundational — composição de foco de baixo custo

**Objetivo**: Implementar a receita global leve sem alterar geometria, navegação ou semântica.

### Implementation

- [ ] T004 [US1] Alterar `tv-web/src/index.css` para separar outline/scale do glow, usando camada pseudo-elemento não interativa e transição de `opacity` na faixa V14; manter tokens, `pointer-events`, stacking e fallback visual conforme `logic/foco-leve.md`.
- [ ] T005 [US1] Preservar no mesmo arquivo a distinção entre elementos escaláveis e `.no-scale`, o estado `:focus` nativo, `.tv-focus`, reduced motion e transições existentes que não pertençam ao glow.
- [ ] T006 [P] [US1] Adicionar/ajustar testes complementares de DOM em `tv-web/src/components/foco-leve-tv.test.tsx` apenas para verificar que a classe pública `.tv-focus` continua no item focado e que estados `.no-scale` não recebem transformação; não testar detalhes privados de CSSOM.

### Testes da Fase

- [ ] T007 [P] [US1] Executar `npx vitest run src/components/focoDeEstado.test.tsx src/components/PosterArt.test.tsx src/components/foco-leve-tv.test.tsx` em `tv-web/`.
- [ ] T008 [P] [US1] Executar `npm run lint`, `npx tsc -b` e `npm run build` em `tv-web/`.

**Critério de Conclusão**: A receita compartilhada mantém o foco visual e os contratos públicos, os testes focados passam e o build não apresenta regressão.

**Registro da Fase**:

- Status:
- Feito:
- Contrato: N/A.
- Testes executados:
- Pendências:

---

## Phase 3: User Story 1 — Navegar por uma grade com foco fluido (Priority: P1) 🎯 MVP

**Objetivo**: Provar que a nova receita mantém a leitura do foco e reduz o custo de animação na carga de referência.

### Implementation

- [ ] T009 [US1] Ajustar a composição CSS em `tv-web/src/index.css` após inspeção de grade com 140 cards, sem alterar dimensões, espaçamentos ou tokens gerais.
- [ ] T010 [US1] Verificar que `tv-web/src/components/PosterArt.tsx` e os consumidores de card não precisam de estado adicional; se uma exceção real exigir alteração, manter `focused` como única entrada e documentar a razão em `logic/foco-leve.md`.
- [ ] T011 [US1] Capturar evidência automatizada/navegador da grade de referência em `sdd/specs/083-foco-leve-tv/evidencias/grade-140-navegador.*`, classificando fps do navegador apenas como diagnóstico, nunca como aceite físico.

### Testes da Fase

- [ ] T012 [P] [US1] Rodar o roteiro Playwright selecionado (`home-vitrine-expandida`, `live-tv-ds-v14`, `vitrine-filmes-series`) e confirmar foco, SELECT e RETURN.
- [ ] T013 [US1] Executar a sonda de desempenho da 082 na TV QN50Q60DAGXZD com pelo menos 140 cards; registrar fps, pior quadro e quadros acima de 50 ms em `sdd/specs/083-foco-leve-tv/evidencias/sonda2-pos.md`.
- [ ] T014 [US1] Repetir a inspeção com reduced motion e troca rápida de foco, anotando qualquer efeito preso, corte ou perda de contraste.

**Critério de Conclusão**: A grade mostra um único foco reconhecível, SELECT/RETURN permanecem iguais e a TV registra pelo menos 50 fps sem quadro acima de 50 ms.

**Registro da Fase**:

- Status:
- Feito:
- Contrato: N/A — aceite físico não é representável por contrato DOM.
- Testes executados:
- Pendências:

---

## Phase 4: User Story 2 — Todas as áreas (Priority: P2)

**Objetivo**: Confirmar a consistência da receita em todas as famílias de grades e controles que reutilizam `.tv-focus`.

### Implementation

- [ ] T015 [P] [US2] Auditar visualmente Home em `tv-web/src/features/home/`, Live TV em `tv-web/src/features/live/` e VOD em `tv-web/src/features/vod/`; corrigir somente exceções que realmente quebrem o contrato compartilhado.
- [ ] T016 [P] [US2] Verificar componentes de estado e player que usam `.tv-focus` (`EmptyState`, `ErrorState`, `PlayerChrome`, `PlayerLayer`, `PinPrompt`) para garantir que a camada não bloqueia interação nem modifica `.no-scale`.
- [ ] T017 [US2] Registrar a matriz de superfícies e resultado visual em `sdd/specs/083-foco-leve-tv/evidencias/matriz-superficies.md`.

### Testes da Fase

- [ ] T018 [P] [US2] Executar suites Vitest de Home, Live, VOD e componentes tocados.
- [ ] T019 [US2] Executar E2E completo `npm run test:e2e` com dev server e preservar evidências relevantes sem sobrescrever capturas rastreadas.
- [ ] T020 [US2] Repetir SELECT/RETURN e bordas de viewport na TV física para pelo menos uma grade de cada família.

**Critério de Conclusão**: Todas as famílias avaliadas usam o mesmo foco leve, continuam distinguindo estados e não apresentam regressão de navegação; a matriz de evidências está completa.

**Registro da Fase**:

- Status:
- Feito:
- Contrato: N/A.
- Testes executados:
- Pendências:

---

## Phase 5: Polish & Cross-Cutting Concerns

**Objetivo**: Consolidar documentação, emenda arquitetural e gates de release.

### Implementation

- [ ] T021 [P] Atualizar `sdd/adr/ADR-007-design-system-tv-identidade-visual.md` com nota inline datada registrando a receita leve, o motivo da medição e a preservação da hierarquia visual; não reescrever o histórico da ADR.
- [ ] T022 [P] Atualizar `sdd/specs/083-foco-leve-tv/quickstart.md` e `plan.md` com resultados reais e links para as evidências finais.
- [ ] T023 Revisar diff e artefatos em busca de dados da TV, credenciais, URLs de provedor ou logs indevidos antes de integrar.

### Testes da Fase

- [ ] T024 Executar `npm run lint`, `npx tsc -b`, `npm run test`, `npm run build` e `npm run test:e2e` em `tv-web/`.
- [ ] T025 Executar o quickstart completo e classificar separadamente navegador, emulador e TV física.

**Critério de Conclusão**: Documentação canônica atualizada, todos os gates automatizados e E2E executados, quickstart concluído e gate físico de desempenho explicitamente aprovado ou bloqueado com risco registrado.

**Registro da Fase**:

- Status:
- Feito:
- Contrato: N/A.
- Testes executados:
- Pendências:

### Checklist de Release

- [ ] Fase 1 (Setup) concluída
- [ ] Fase 2 (Foundational) concluída
- [ ] Fase 3 (User Story 1) concluída
- [ ] Fase 4 (User Story 2) concluída
- [ ] Lint, TypeScript, Vitest e build verdes
- [ ] E2E Playwright executado antes da TV física
- [ ] Quickstart executado com evidências separadas por superfície
- [ ] Emenda da ADR-007 registrada
- [ ] Gate físico: 50 fps ou mais e zero quadros acima de 50 ms
- [ ] Revisão de segredos concluída

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: sem dependências; estabelece baseline.
- **Phase 2**: depende da Phase 1 e bloqueia as user stories.
- **Phase 3 (P1)**: depende da Phase 2; MVP validável isoladamente.
- **Phase 4 (P2)**: depende da Phase 2; pode começar após a receita global estar estável, mas deve fechar antes do Polish.
- **Phase 5**: depende das duas user stories e dos resultados físicos.

### Parallel Opportunities

- T001 e T002 podem rodar em paralelo antes da alteração.
- T006, T007 e T008 podem ser organizadas por arquivo/comando após T004/T005.
- T015, T016 e T017 podem rodar em paralelo após a receita global estar estável.

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fechar inventário e baseline.
2. Implementar a receita compartilhada leve.
3. Validar a grade de 140 cards no navegador e na TV.
4. Só então expandir a matriz P2 e fechar a documentação.

### Incremental Delivery

1. CSS global com fallback visível.
2. Regressão nos consumidores existentes.
3. Medição física da P1.
4. Auditoria P2 e gates finais.

## Notes

- Não há `contract-tests.lock`: o valor principal é visual e de hardware real.
- O executor deve ler `research.md`, `logic/foco-leve.md` e `quickstart.md` antes de tocar em `index.css`.
- Capturas e relatórios E2E podem sobrescrever arquivos rastreados em `tv-web/test-results/`; restaurar evidências comprometidas antes do Polish.
