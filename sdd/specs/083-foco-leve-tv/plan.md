# Implementation Plan: Foco leve na TV

**Slug**: `083-foco-leve-tv` | **Date**: 2026-10-18 | **Spec**: `sdd/specs/083-foco-leve-tv/spec.md`

## Summary

A feature will replace the expensive animated focus glow used by the shared `.tv-focus` recipe with a cheaper composition. Cards keep the visible outline and scale contract, while a non-interactive pre-painted glow layer changes opacity instead of animating a large `box-shadow` on every focused card. The shared rule covers Home, Live TV, Filmes, Séries and other components that already consume `.tv-focus`; navigation state and SELECT/RETURN remain untouched.

## Technical Context

**Language/Version**: TypeScript 6 / React 19 / CSS, built by Vite 8 for `chrome108`.

**Primary Dependencies**: React, Vite, Vitest, Playwright, project-owned `useRemoteNav`, `@tanstack/react-virtual` for virtualized catalog grids.

**Storage**: N/A. The feature changes presentation only and must not touch IndexedDB, localStorage or catalog data.

**Testing**: Vitest existing component suites, Oxlint, `tsc -b`, Vite build, Playwright E2E, manual Samsung TV measurement using the feature 082 probe.

**Target Platform**: Samsung QN50Q60DAGXZD, Tizen 9.0 / Chromium 120 measured on the device; `chrome108` remains the compatibility floor and the package is served from `file://` on TV.

**Performance Goals**: On the 140-card reference grid, at least 50 fps and zero frames above 50 ms. The prior baseline was 38 fps with the complete recipe and 32 fps with `backdrop-filter`.

**Constraints**: Preserve the V14 focus hierarchy (outline, scale, glow), keep `.no-scale` behavior, avoid `backdrop-filter`, avoid layout changes, keep pseudo-elements non-interactive, respect reduced-motion, and preserve the global `.tv-focus` contract from ADR-007/ADR-009.

**Scale/Scope**: One shared CSS focus surface affects all current focused controls and cards; manual performance scope is a 140-card grid plus representative Home, Live, Filmes and Séries surfaces.

## Decisões Invariantes

- A mudança permanece centralizada na receita compartilhada de `.tv-focus`; não haverá regras de foco duplicadas por tela.
- `outline: 4px`, `outline-offset: 3px` e `scale(1.06)` permanecem para elementos escaláveis; `.no-scale` continua sem transformação.
- O glow novo é uma camada pseudo-elemento não interativa e não pode alterar geometria, tamanho medido, virtualização ou hit testing.
- A animação do glow varia `opacity` em 120–160 ms; `backdrop-filter` e animação de `box-shadow` pesado ficam fora da implementação.
- Focar continua sendo apenas seleção de estado; SELECT executa e RETURN navega segundo os contratos existentes.
- O aceite de desempenho da spec exige confirmação na TV física com a sonda 2; navegador/emulador não substituem essa medição.

## Constitution Check

*GATE: passou antes do design e foi reavaliado contra o design descrito neste plano.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | Sem autenticação ou fonte. |
| Segredos Fora dos Clientes e dos Logs | Passa | Passa | Nenhum dado, URL ou log tocado. |
| Categorias da Fonte São Preservadas | N/A | N/A | Nenhuma leitura de catálogo. |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | Sem metadata ou classificação. |
| Comandos Locais Independem de Rede, Backend ou IA | Passa | Passa | Foco e animação são locais e síncronos. |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | N/A | N/A | Nenhum trailer/metadata. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | Passa | Passa | CSS não adiciona ação nem remove SELECT/RETURN. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | Sem importação. |
| Foco Visível e Sem Becos Sem Saída | Passa | Passa | Mantém contorno, escala, glow e foco por estado React; fallback visual existe. |
| Voltar Restaura Foco e Posição | Passa | Passa | Nenhuma lógica de memória é alterada. |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | Sem estado de reprodução. |
| Progresso e Capacidades São Reais, Nunca Prometidos | Passa | Passa | Métrica de fps é medida; não será estimada no navegador como hardware. |
| Documentação do Repositório É Canônica | Passa | Passa | `research`, `logic`, `quickstart` e emenda ADR serão mantidos juntos. |
| Restrições de plataforma/design | Passa | Passa | V14, ADR-007, ADR-009, `chrome108` e TV física respeitados. |
| Fluxo de desenvolvimento | Passa | Passa | Lint, type-check, Vitest, build e E2E antes do gate físico. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/083-foco-leve-tv/
├── spec.md
├── plan.md
├── tasks.md
├── research.md
├── quickstart.md
└── logic/
    └── foco-leve.md
```

### Source Code (repository root)

```text
tv-web/
├── src/index.css                         # tokens e receita global .tv-focus
├── src/components/PosterArt.tsx          # foco dos posters/cards
├── src/components/Button.tsx             # foco de botões
├── src/components/Chip.tsx               # foco de chips
├── src/components/ContentCard.tsx        # composição de cards de catálogo
├── src/components/ChannelRow.tsx         # logo/canal em Live TV
├── src/features/home/                    # rails e cards da Home
├── src/features/live/                    # grades/linhas de Live TV
├── src/features/vod/                     # vitrine e grades de Filmes/Séries
├── src/components/*.test.tsx             # regressões de foco existentes
└── e2e/                                  # roteiros Playwright existentes
```

**Structure Decision**: A feature é uma alteração transversal de CSS global com regressão nos consumidores existentes. Não há nova entidade, rota, API, storage ou hook de navegação. Os arquivos de tela só são tocados se a auditoria encontrar uma exceção real ao contrato `.tv-focus`.

## Complexity Tracking

Nenhuma violação da constitution foi identificada.

## Estratégia de Testes

Prioridade: unitário/componente existente → lint/type-check/build → E2E → inspeção manual → medição na TV física.

Comandos-base, a partir de `tv-web/`:

```powershell
npm run lint
npx tsc -b
npm run test
npm run build
npm run test:e2e -- --only home-vitrine-expandida,live-tv-ds-v14,vitrine-filmes-series
npm run test:e2e
```

### Testes de Contrato

Esta feature não cria `contract-tests.lock` nem testes de contrato novos. O comportamento central é uma composição visual CSS e o aceite principal depende de frame time e legibilidade na QN50Q60DAGXZD, que não podem ser provados por Vitest nem por DOM jsdom. Os testes existentes de `.tv-focus`, `PosterArt`, Home, Live e VOD serão executados como regressão; testes complementares podem ser adicionados fora de arquivos travados se uma exceção de consumidor for encontrada.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Pseudo-elemento/stacking pode variar no Chromium 108/Tizen. | Glow pode ser cortado, sobrepor texto ou não aparecer. | Manter outline/scale como fallback; validar no navegador e na TV; ajustar `position`, `z-index`, `isolation` e `pointer-events` apenas se medição/visual exigir. |
| R-002 | Reduzir custo de animação pode reduzir contraste percebido em capas reais. | Usuário pode perder a localização do foco a distância. | Comparar capas claras, escuras e saturadas no roteiro físico; não aceitar apenas fps sem inspeção visual. |
| R-003 | Receita global alcança componentes fora das grades de cards. | Botões, player ou campos podem ter regressão visual. | Auditar consumidores de `.tv-focus`, preservar `.no-scale` e rodar suites focadas de componentes/player. |
| R-004 | A emenda de ADR-007/V14 ainda não está registrada. | Documentação canônica pode continuar descrevendo uma receita já substituída. | Incluir tarefa explícita de emenda inline em ADR-007 e nota de compatibilidade no registro da feature antes do Polish. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: Implementar Fase 1 e validar a receita compartilhada no navegador antes da TV.

## Arquivos Principais

- `tv-web/src/index.css` — receita global de foco.
- `tv-web/src/components/PosterArt.tsx` — poster/card que recebe `.tv-focus`.
- `tv-web/src/components/*.test.tsx` — regressões existentes de foco.
- `sdd/adr/ADR-007-design-system-tv-identidade-visual.md` — decisão visual a emendar.
- `sdd/specs/082-orcamento-armazenamento-tv/evidencias/sonda2-capacidades-tv-2026-10-18.md` — baseline físico.

## Cuidados para Retomada

- Não migrar para `.focus()` de DOM, Norigin ou nova biblioteca; ADR-009 fixa foco como estado React e classe CSS.
- Não apagar dados da TV ao instalar; a medição depende do app preservando o catálogo local.
- Não declarar SC-001/SC-002 aprovados com navegador/emulador; eles exigem a QN50Q60DAGXZD.
- Não remover outline/scale antes de comprovar que a camada nova mantém a hierarquia visual.
