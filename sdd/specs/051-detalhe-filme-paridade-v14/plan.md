# Implementation Plan: Paridade visual do detalhe do filme com o Design System V14

**Slug**: `051-detalhe-filme-paridade-v14` | **Date**: 2026-10-02 | **Spec**: `sdd/specs/051-detalhe-filme-paridade-v14/spec.md`

## Summary

A função pedida já existe (marcar assistido — feature 019; Elenco com foto e Semelhantes
com "✓ Na sua lista" — feature 035). Esta feature é **só apresentação**: (1) hero do
detalhe do filme com capa grande de ponta a ponta sob vinheta, como `details()` do
protótipo e Spec §32; (2) botões de ação e selo "✓ Assistido" no visual V14; (3) cartões
de Elenco (foto + nome + personagem) e Semelhantes no padrão de cartão/foco V14, com o
selo "Na sua lista" mais evidente. Nenhuma chamada de rede, hook de dados ou regra de
foco muda. Todo CSS novo é **escopado a filmes** (`.vod-detail--movie`) porque
`.vod-detail*` é compartilhado com `SeriesDetailScreen`.

## Technical Context

**Language/Version**: TypeScript + React 19, Vite 8 (alvo `chrome108`, não remover)

**Primary Dependencies**: nenhuma nova. `DetailBackdrop`/`CastPeoplePanel`/`PersonPhoto` (`features/vod/DetailMetadata.tsx`), `SimilarPanel`, `ContentCard`, `PosterArt`, tokens de `index.css`

**Storage**: N/A (nenhuma mudança de dados; estado "assistido" segue `userStateRepository`)

**Testing**: vitest (`dom` project para `*.test.tsx`), E2E Playwright (`tv-web/e2e/`), passada na TV física

**Target Platform**: Samsung Tizen 9 / Chromium 120, origin `file://`, palco 1920×1080

**Performance Goals**: sem regressão de rolagem; backdrop é um único `<img>` (sem blur, sem `background-image` no `.screen`)

**Constraints**: só tokens (nada de cor/raio/espaçamento hardcoded); sem blur (padrão da 050); video-plane CSS de `screens.css` cobre `.screen` — a raiz continua `.screen.vod-detail`

**Scale/Scope**: 1 tela (`MovieDetailScreen`) + 3 componentes de apoio + `vod.css`

## Decisões Invariantes

- **D-001** Elenco e Semelhantes permanecem **abas** do detalhe (decisão do usuário, 2026-10-02). Sem rota nova.
- **D-002** Escopo só visual: nenhuma alteração em `useSimilarTitles`, `titleMetadata`, `tmdb*`, `userStateRepository`, nem na máquina de foco (`row`/`activeTab`/`panelFocusKey`) de `MovieDetailScreen`.
- **D-003** `.vod-detail-*` é compartilhado com a série. Mudanças vão sob o modificador `vod-detail--movie` na raiz de `MovieDetailScreen`; `SeriesDetailScreen` e suas capturas ficam idênticas.
- **D-004** Backdrop continua `<img>` filho do hero (`DetailBackdrop`, D-008 da 032), nunca `background-image` no `.screen`. Vinheta por pseudo-elemento/camada com tokens; sem blur.
- **D-005** Sem backdrop (ou imagem quebrada): o hero usa o pôster **nítido** em coluna (já existe) sobre superfície `--bg-surface`; nunca área vazia nem pôster esticado em faixa (lição R-004 da 050).
- **D-006** Textos de estado de Semelhantes e os rótulos `FOUND_LABEL`/`NOT_FOUND_LABEL` **não mudam** (contratos da 035 os fixam); só o estilo.
- **D-007** Foco no padrão V14: anel 4px + offset + glow + `scale(1.06)`, 140 ms, via a classe `tv-focus` existente. Sem novo mecanismo de foco.
- **D-008** Nada de conteúdo inventado do protótipo (relevância %, "4K UHD", "5.1 Dolby" fixos): os "fatos" continuam vindo de dados reais.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | Sem mudança |
| Segredos Fora dos Clientes e dos Logs | OK | OK | Nenhuma nova rede/log; chave TMDB não é tocada (FR-012) |
| Categorias da Fonte São Preservadas | OK | OK | `groupLabel(original_group)` intacto |
| IA e Classificação Nunca Inventam Dados | OK | OK | D-008: nada inventado |
| Comandos Locais Independem de Rede | OK | OK | Marcar assistido segue local |
| Trailers e Metadados Não Alteram o Estado Principal | OK | OK | Só apresentação |
| Toda Ação Essencial Tem Caminho por Controle Remoto | OK | OK | Foco inalterado (D-002) |
| Lista de Catálogo Não É Manifesto de Streaming | OK | OK | "Na sua lista" = existência no catálogo, sem prometer reprodução |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Estados vazio/erro/sem chave mantêm focável (FR-008) |
| Voltar Restaura Foco e Posição | OK | OK | Feature 035 intacta (FR-010) |
| Identidade de Reprodução Não Depende da URL | OK | OK | Sem mudança |
| Progresso e Capacidades São Reais | OK | OK | "✓ Assistido" vem do estado real |
| Documentação Canônica | OK | OK | `plan.md` + backlog; `CLAUDE.md` não muda |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/051-detalhe-filme-paridade-v14/
├── spec.md
├── plan.md
├── quickstart.md
├── tasks.md
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── features/
│   │   ├── movies/MovieDetailScreen.tsx        # raiz ganha `vod-detail--movie`; hero em camadas
│   │   ├── movies/MovieDetailScreen.*.test.tsx # existentes (elenco, semelhantes, trailers, metadata…)
│   │   └── vod/
│   │       ├── DetailMetadata.tsx              # DetailBackdrop, CastPeoplePanel, PersonPhoto
│   │       ├── SimilarPanel.tsx                # selo "Na sua lista"
│   │       └── SeriesDetailScreen (../series)  # NÃO muda (D-003)
│   └── styles/vod.css                          # bloco novo `.vod-detail--movie …`
└── e2e/                                        # novo roteiro do detalhe do filme
```

**Structure Decision**: edição localizada em `MovieDetailScreen.tsx`, `DetailMetadata.tsx`, `SimilarPanel.tsx` e um bloco de CSS no fim de `vod.css`. Nenhum arquivo novo de produção é obrigatório; `DetailBackdrop` pode ganhar uma prop opcional de variante (`large`) sem alterar o uso da série.

## Complexity Tracking

Sem violações.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (TV física).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run src/features/movies src/features/vod src/features/series
npx tsc -b
npm run lint
npm run build
npm run test:e2e   # com `npm run dev` na 5173
```

### Testes de Contrato

**Nenhum.** A feature é puramente visual: o comportamento (assistido, elenco, semelhantes, foco, retorno) já é protegido por testes existentes (`MovieDetailScreen.test.tsx`, `.elenco`, `.semelhantes.contract`, `.limpar-historico`, `SimilarPanel.test.tsx`) que **precisam continuar verdes**. Um contrato novo só fixaria nomes de classe (detalhe de implementação). A prova do visual é E2E com captura + passada na TV (quickstart).

Testes adicionais (não travados, escritos no execute): `MovieDetailScreen.paridade-v14.test.tsx` — modificador `vod-detail--movie` na raiz; hero com e sem backdrop (fallback, imagem quebrada); selo "✓ Assistido" alterna ao marcar/desmarcar; `SeriesDetailScreen` sem a classe.

## Estado Atual

| Área | Estado |
| --- | --- |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `vod.css` e `VodCatalogScreen.tsx` estão modificados no working tree (feature 050, não commitada) | Conflito/mistura de diffs | Só **acrescentar** bloco ao fim de `vod.css`; não editar regras existentes; conferir `git diff` antes de commitar |
| R-002 | `.vod-detail*` é compartilhado com a série | Regressão visual na série | D-003: tudo sob `.vod-detail--movie`; captura da série idêntica (SC) |
| R-003 | Backdrop do TMDB pode ser claro/ruidoso e prejudicar o texto | Texto ilegível (SC-001) | Vinheta com tokens escurecendo a esquerda e a base; validar com 3+ filmes reais na captura |
| R-004 | Teste da 035 fixa textos/estrutura de `SimilarPanel`/`CastPeoplePanel` | Quebra de contrato travado | D-006; rodar `check-contract-tests.ps1` da 035 e demais antes/depois |
| R-005 | Altura do hero maior empurra abas/painel para fora da tela; foco precisa rolar | Foco "fora da vista" | Hero com altura em token/medida fixa; E2E confirma que a aba e o 1º cartão entram na viewport ao focar |
| R-006 | Fotos de elenco/pôsteres vêm de rede (TMDB) | Lentidão na TV | `loading="lazy"` já existe; manter; fallback de iniciais (SC-003) |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |

**PRÓXIMO**: —

## Arquivos Principais

- (nenhum ainda)

## Cuidados para Retomada

- (nenhum ainda)
