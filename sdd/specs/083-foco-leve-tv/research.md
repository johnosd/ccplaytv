# Research: foco leve na TV

Revisado em 2026-10-19 (re-plano após a revisão da spec). A versão de 2026-10-18 escolhia de antemão o brilho em
pseudo-elemento; a exploração do código mostrou que essa escolha não pode ser feita sem medir (ver R1 e R2).

## R1 — O que encarece a receita atual

**Fato medido** (sonda 2 da 082, grade de 140 cards, troca de foco a cada 140 ms): só `scale(1.06)` → 52 fps / 33 ms;
receita completa → 38 fps / 133 ms (5 quadros > 50 ms). A diferença entre as duas é o contorno e, principalmente, a
sombra com desfoque **animada**: `transition: box-shadow 140ms` obriga a repintar a sombra de 40 px de desfoque (mais o
halo) a cada quadro da transição, no card que entra e no que sai.

**Fato do código**: hoje só duas regras animam `box-shadow` — a receita global (`tv-web/src/index.css`,
`button, .tv-focusable { transition: transform, box-shadow, background }`) e `.vod-detail-icon` (`styles/vod.css`).
Não há `backdrop-filter` nem `@keyframes` com sombra em `tv-web/src/`.

**Atenção à linha de base**: a sonda 2 não usou a receita exata do app (usou `0 0 32px 8px` + sombra de profundidade
`0 12px 40px` e `outline-offset: 6px`). O app usa halo `0 0 0 8px` + brilho `0 0 40px`, offset 3 px. A medição da 083
roda as duas na mesma sessão.

## R2 — Por que o pseudo-elemento não é a escolha automática

- `.poster-box` (o card de pôster de Início, fileiras de Filmes/Séries, Live) tem `overflow: hidden`: um `::after`
  com brilho **para fora** do card é cortado pela própria caixa. Funcionaria só num ancestral sem corte, o que muda a
  estrutura por consumidor — contra a regra única.
- `.vod-grid-cell .poster-box.tv-focus::before` (grade da vitrine) **já usa** o `::before` para o anel interno; um
  segundo uso colidiria.
- A receita é global (`button:focus`, `input:focus`, `[tabindex]:focus`, `.tv-focus`): um pseudo-elemento em todo
  `button`/`input` disputa com `::before/::after` já usados por componentes (degradês do Live, por exemplo).

## Decisão

Escolher a receita **por medição na TV**, em ordem de preferência, ficando com a **primeira** que atingir ≥ 50 fps e
zero quadros > 50 ms na sonda e mantiver a hierarquia visual na inspeção:

| Ordem | Candidata | O que muda | Custo estrutural |
| --- | --- | --- | --- |
| C1 | **Sombra estática** | Mesmo contorno, halo, brilho e escala; a transição passa a ser só de `transform` (e `background`). A sombra aparece/some de uma vez; a escala anima. | Nenhum — só a lista de `transition`. |
| C2 | **Brilho em camada com opacidade** | Contorno + halo no elemento; brilho pré-pintado num pseudo-elemento que só varia `opacity`. | Alto: corte por `overflow: hidden`, colisão com `::before/::after` existentes (R2). |
| C3 | **Brilho por degradê** | Como C2, mas o brilho é `radial-gradient` em vez de sombra desfocada. | Igual a C2. |
| C4 | **Sem brilho difuso** | Contorno + halo (sombra sem desfoque) + escala. | Nenhum, mas **contraria o FR-002** (perde o brilho): só com aprovação do usuário e emenda da spec. |

Se nenhuma candidata atingir a meta, a feature **não** é declarada convergida: registra-se o melhor resultado e o risco
(handoff de 2026-10-18, "Gate de pronto").

## Justificativa

C1 vem primeiro porque ataca exatamente o que a medição aponta (pintura da sombra a cada quadro) sem tocar estrutura,
seletor nem consumidor; o V14 §10 já pede transições curtas em `transform`/`opacity`. Seu risco é perceptivo — o
brilho "acende" em vez de crescer em 140 ms — e é avaliado na inspeção visual (SC-005). C2/C3 só entram se C1 não
bastar, e então exigem desenho por família de consumidor.

## Alternativas rejeitadas

- **Manter `box-shadow` na transição**: é a receita medida a 38 fps / 133 ms.
- **`backdrop-filter`/blur**: 32 fps / 217 ms; proibido pela spec.
- **`will-change: transform` em todos os focáveis**: cria uma camada por card (140+ camadas) e pressiona a memória de
  vídeo de uma TV com ~310 MB livres (sonda 2); fica fora salvo se a medição de uma candidata pedir, e então só no
  elemento focado.
- **Regra por tela**: duplicaria o contrato; a receita global é a superfície única (ADR-007 §4).

## Incertezas resolvidas durante a execução (Fase 1)

- Qual candidata atinge a meta na TV (números por candidata na mesma sessão).
- Se C1 mantém a leitura do foco a ~3 m com capas claras, escuras e saturadas.
