# Handoff — feature 083 Foco leve na TV

## Contexto

Repositório `ccplayTv`, frontend React 19/TypeScript/Vite em `tv-web/`, foco direcional por estado React/`useRemoteNav`. Próximo comando: `/sdd-execute 083-foco-leve-tv`. O backlog deve ficar em `Planejada`. Nesta sessão foram criados `plan.md`, `tasks.md`, `research.md`, `logic/foco-leve.md` e `quickstart.md`; `spec.md` já existia. Nenhum código de produto foi alterado.

## O que a feature entrega

- **P1**: foco de card visualmente equivalente e mais fluido na grade de referência, com meta física de 50 fps ou mais e zero quadros acima de 50 ms.
- **P2**: a mesma receita leve em Home, Live TV, Filmes, Séries e demais consumidores da classe `.tv-focus`, preservando SELECT/RETURN.

Decisões do usuário: preservar o visual atual com brilho mais barato, aplicar a todas as grades e manter navegação, dimensões e tokens gerais fora do escopo.

## Leitura obrigatória, em ordem

1. `spec.md` — escopo, FRs, stories e métricas.
2. `plan.md` — contexto técnico, invariantes, constitution check e riscos.
3. `tasks.md` — fases e comandos de execução.
4. `research.md` — comparação de receitas e decisão pelo pseudo-elemento/opacity.
5. `logic/foco-leve.md` — invariantes de CSS, fallback e medição.
6. `quickstart.md` — gates automatizados e roteiro de TV.
7. `.planning/memory/constitution.md` — foco visível, controle remoto, documentação e gates.
8. `sdd/adr/ADR-007-design-system-tv-identidade-visual.md` e `ADR-009-navegao-direcional-prpria-useremotenav-vez.md` — receita visual atual e modelo de foco React.

## Testes de contrato

Não há `contract-tests.lock` nem testes de contrato novos. A feature é uma mudança visual CSS e o aceite central depende de frame time/legibilidade na QN50Q60DAGXZD. Rodar os testes existentes de `.tv-focus`, PosterArt, Home, Live e VOD; o quickstart lista os comandos. Travas de outras features que podem ser afetadas incluem contratos de Home/VOD/Live que verificam a classe `.tv-focus`; não editar esses arquivos.

## Stubs criados

Nenhum stub. A implementação deve começar na regra compartilhada existente em `tv-web/src/index.css`.

## Armadilhas já mapeadas

- Não trocar foco React por `.focus()` de DOM, Norigin ou outra biblioteca: ADR-009 fixa o modelo atual.
- Não usar `backdrop-filter` nem animar o glow pesado no `box-shadow`: a sonda 2 mediu 32 fps/217 ms e 38 fps/133 ms.
- Não remover outline/scale para ganhar fps antes de conferir equivalência visual; o fallback precisa continuar reconhecível.
- Preservar `.no-scale`, reduced motion, `pointer-events` e stacking da camada; uma pseudo-camada não pode bloquear SELECT.
- Não considerar navegador/emulador como prova de SC-001/SC-002; a TV física é o gate da medição.
- Instalação na TV deve preservar IndexedDB e não usar desinstalação/limpeza de dados.
- E2E pode sobrescrever capturas rastreadas em `tv-web/test-results/`; restaurar antes do Polish.

## Pendências do Analyze

Nenhum achado CRITICAL/HIGH. R-001 a R-004 são riscos de execução já registrados em `plan.md`, não lacunas impeditivas; resolver durante as fases e registrar evidência.

## Gate de pronto

Testes focados e completos do Vitest, `npm run lint`, `npx tsc -b`, `npm run build`, E2E Playwright antes da TV, quickstart executado, emenda inline da ADR-007 e medição física com pelo menos 50 fps/zero quadros acima de 50 ms. Se o hardware não atingir o alvo, não declarar a feature convergida; registrar o resultado e o risco residual.
