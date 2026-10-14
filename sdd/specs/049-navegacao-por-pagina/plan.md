# Implementation Plan: Navegação por página nas listas

**Slug**: `049-navegacao-por-pagina` | **Date**: 2026-10-02 | **Spec**: `sdd/specs/049-navegacao-por-pagina/spec.md`

**Nota**: Este plano muda a **navegação** (teclas) e retira os botões do destaque da 048. Base visual = 048; não muda painéis, tiles, cartões nem a grade de Filmes/Séries.

## Summary

→/← viram "página seguinte/anterior" nas listas verticais (trilha e canais da Live, o zapping, trilha de Filmes e Séries); OK passa a ser o único gesto que entra numa categoria e toca um canal; RETURN volta da lista de canais para a trilha. O destaque deixa de ser focável (sem botões); o Guia completo vira um ícone focável ao lado da lupa. Abordagem: funções puras de paginação (`lib/focus/paging.ts`) consumidas por `useLiveKeyboard` e `VodCatalogScreen`; a coluna 2 (destaque) some do modelo de foco da Live; um segundo ícone no topo da lista de canais (`topIcon` em `useLiveSearch`); rolagem que mantém a linha da tela ao paginar. Os contratos travados que assumem "→ entra/→ vai às ações" são emendados com aprovação (FR-014), e os E2E migrados. Detalhes em `logic/paginacao.md`.

## Technical Context

**Language/Version**: TypeScript (strict, `tsc -b`), React 19, Vite 8 (alvo `chrome108`; TV medida: Tizen 9 / Chromium 120)

**Primary Dependencies**: `@tanstack/react-virtual` (lista de canais), `useRemoteNav` próprio (ADR-009), hooks de `src/lib/focus/` — nenhuma dependência nova

**Storage**: N/A (nada persistido; a página é derivada da altura visível)

**Testing**: Vitest (`dom` jsdom para `*.test.tsx`; `node` para `*.test.ts`), E2E Playwright (`tv-web/e2e/*.mjs`, runner `e2e/run.mjs`, `npm run dev` rodando na 5173)

**Target Platform**: Samsung Tizen TV (referência QN50Q60DAGXZD), controle remoto; desenvolvimento em Chromium

**Performance Goals**: paginar com a seta segurada sem consulta de rede por página; sem trabalho por foco além do já existente (prefetch adiado em rajada — 046)

**Constraints**: constitution (foco, voltar, controle remoto completo); precedência ADR-011: constitution > ADRs > Spec V14 > Lab > protótipo — a Spec V14 §13/§33 descreve → como "entrar no conteúdo" nas trilhas; esta feature a contraria por decisão do usuário (ver D-010 e Complexity Tracking); coluna 2 e `previewAction` deixam de existir

**Scale/Scope**: listas de até milhares de canais e dezenas/centenas de categorias; 4 superfícies (trilha e canais da Live, zapping, trilha de Filmes/Séries); ~110 arquivos de teste/E2E citam →, dos quais uma fração assume "→ entra"

## Decisões Invariantes

- **D-001** Página = o que cabe na área visível agora (`floor(clientHeight / passo)`, mínimo 1). Passo da lista de canais = `LIVE_ITEM_ROW_HEIGHT` (84, constante: lista virtualizada); passo da trilha = medido, com fallback 56. Nunca um número fixo de itens.
- **D-002** `pagedIndex` é pura e presa a `[0, total-1]`: sem circularidade, sem "só se houver página inteira". Lista curta vai ao extremo.
- **D-003** Paginar só move o foco (estado da tela, ADR-009): nunca entra, toca, abre o Guia nem consulta rede (constitution: foco não executa).
- **D-004** A Live passa a ter **duas colunas de foco** (0 trilha, 1 canais). `previewAction`, `PREVIEW_ACTION_COUNT` e o ramo `effectiveCol === 2` são removidos, não escondidos.
- **D-005** O destaque não tem `<button>` nem `tabindex`. Ações: OK toca, Segurar OK favorita (`onLongSelect`/`onFavoriteKey` já existem), Guia = `.live-guide-button` no topo da lista.
- **D-006** Topo da lista de canais = linha de 2 ícones (lupa, Guia) controlada por `topFocused` + `topIcon` em `useLiveSearch`. Com o campo de busca aberto o Guia some; no zapping não há topo.
- **D-007** → e ← nunca trocam de coluna. Trilha → canais: só OK (ou OK em Favoritos/Todos). Canais → trilha: só RETURN (a regra de camadas da busca 018 continua).
- **D-008** A grade de Filmes/Séries não muda; só `col === 0` de `VodCatalogScreen` troca → por página (←/→ na trilha) e o OK já entrava.
- **D-009** A rolagem mantém o item na mesma linha da tela (âncora por offset); nunca rola além do conteúdo.
- **D-010** Emenda aprovada pelo usuário (2026-10-02, "Nova feature 049 pelo SDD"): contratos 018/024/030/031/046/048 e demais travados afetados são reescritos **só** onde assumem o fluxo antigo, cada um registrado em `## Riscos e Decisões` e com a trava regravada (`check-contract-tests.ps1 -Slug <slug> -Write`).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | N/A |
| Segredos Fora dos Clientes e dos Logs | OK | OK | Nada de dado sensível; nenhum log novo |
| Categorias da Fonte São Preservadas | OK | OK | Só navegação; rótulos intactos |
| IA e Classificação Nunca Inventam Dados | OK | OK | N/A |
| Comandos Locais Independem de Rede, Backend ou IA | OK | OK | Paginar é local; sem rede por página (D-003) |
| Trailers e Metadados Não Alteram o Estado Principal | OK | OK | N/A |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | OK | OK | Assistir = OK; Favoritar = Segurar OK; Guia = ícone focável por setas+OK; voltar = RETURN. A ação "Guia" **perde** o caminho pelo destaque, mas ganha outro por setas |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto | OK | OK | N/A |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Estados carregando/vazio/erro mantêm a ação focável; RETURN volta à trilha (FR-006/FR-013); paginar não executa |
| Voltar Restaura Foco e Posição | OK | OK | RETURN/OK reentram por identidade (046); a rolagem ancora a linha |
| Identidade de Reprodução Não Depende da URL | OK | OK | N/A |
| Progresso e Capacidades São Reais | OK | OK | N/A (sem barra inventada) |
| Documentação do Repositório É Canônica | OK | OK | ADR-011 recebe nota de atualização (T033); planos 048/024/031 registram a mudança |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/049-navegacao-por-pagina/
├── spec.md
├── plan.md
├── tasks.md
├── handoff.md
├── quickstart.md
├── contract-tests.lock
└── logic/paginacao.md
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── lib/focus/
│   │   ├── paging.ts                         # NOVO (stub do plan): pageSizeFor, pagedIndex
│   │   └── usePageScrollAnchor.ts            # NOVO (task): mantém a linha da tela ao paginar
│   ├── features/live/
│   │   ├── useLiveKeyboard.ts                # → página; OK entra/toca; sem coluna 2
│   │   ├── useLiveSearch.ts                  # + topIcon ('search' | 'guide')
│   │   ├── useLiveGuide.tsx                  # openGuideFromPreview → openGuideFromList (ou mantém o nome)
│   │   ├── liveColumns.tsx                   # sem .live-preview-actions; + .live-guide-button
│   │   ├── LiveScreen.tsx                    # sem previewAction
│   │   └── liveTrail.ts                      # sem PREVIEW_ACTION_COUNT; LIVE_HINTS
│   ├── features/vod/VodCatalogScreen.tsx     # col 0: ←/→ paginam; VOD_HINTS
│   ├── styles/live.css                       # remove .live-preview-action*; estilo do ícone de Guia
│   └── features/**/*.test.tsx, e2e/*.mjs     # migração do fluxo antigo (FR-014)
├── e2e/navegacao-por-pagina.mjs              # NOVO: roteiro da feature
└── e2e/run.mjs                               # registra o roteiro
```

**Structure Decision**: tudo em `tv-web/` (frontend client-first); `api/` e `CCPlayTv/` intactos (só o build sincroniza). `liveColumns.tsx` continua desenhando por **funções** (regra da 040: refs ficam refs, um `useRemoteNav` por componente).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Contraria a Spec V14 §13/§33 (→ entra no conteúdo; "focus path" por colunas) e remove os 3 botões do destaque (§25/§31.1) | Decisão do usuário: → pagina para navegar rápido; OK entra | Manter → entrando e paginar com outra tecla (CH±) foi oferecido e **recusado** pelo usuário; registrar como nota de atualização na ADR-011 (T033) |
| Reescrever contratos travados de outras features (018/024/030/031/046/048…) | Eles assertam justamente o fluxo antigo | Deixá-los vermelhos bloquearia o gate; emenda é o caminho previsto pelo `sdd-execute` §5b, aqui pré-aprovada |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx tsc -b
npx vitest run <arquivo-ou-pasta>        # durante as fases
npm run lint
npm run test                             # gate final (~5-8 min)
npm run build ; npm run build:tizen
node e2e/run.mjs --only navegacao-por-pagina   # com `npm run dev` na 5173 (confirme quem escuta a 5173!)
npm run test:e2e                         # suíte inteira, gate final
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/focus/paging.navegacao-por-pagina.contract.test.ts`,
`tv-web/src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx`,
`tv-web/src/features/vod/VodCatalogScreen.navegacao-por-pagina.contract.test.tsx`

Comando: `npx vitest run src/lib/focus/paging.navegacao-por-pagina.contract.test.ts src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx src/features/vod/VodCatalogScreen.navegacao-por-pagina.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| paginação: avança/volta uma página, bordas, lista curta, vazia, SC-001 | FR-001/002/003, SC-001 | Fase 2 | `Error: not implemented` |
| Live: →/← paginam trilha e lista sem entrar nem tocar; OK entra; RETURN volta e reentrada devolve o canal | US1+US2, FR-001..006, SC-002/003 | Fase 3 | asserção: `expected null to be 'Notícias'` (→ hoje entra) |
| Live: destaque sem botões; ↑ lupa, → ícone de Guia, OK abre o Guia, ↓ volta | US3, FR-007/008, Constitution (controle remoto) | Fase 4 | asserção: `expected …(3) to have a length of +0` (3 botões hoje) |
| Live: busca — ←/→ no campo são do cursor; nos resultados, → pagina | FR-010, FR-004 | Fase 4 | asserção: `expected null to be 'Canal 08'` |
| Vod: trilha pagina sem abrir; OK entra; grade intacta; ← na 1ª coluna volta | US4, FR-001/011 | Fase 5 | asserção: `expected null to be 'Cat 12'` |

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/focus/paging.ts`.

Estado de partida confirmado: `tsc -b` limpo; suíte de `features/live`, `features/vod`, `lib/focus` e `components` → 638 verdes + os 5 contratos desta feature vermelhos pelo motivo certo (nenhum por import/tipo).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fases 1–2 (baseline, paginação pura) | Concluídas — `paging.ts`; contrato 1/1 verde |
| Fases 3–5 (Live, destaque/Guia, trilha de Filmes/Séries) | Concluídas — 5/5 contratos verdes |
| Fase 6 (zapping, acabamento) | Concluída — RETURN em camadas no zapping |
| Fase 7 (emenda e migração) | Concluída — 8 travas regravadas (018, 024, 025, 030, 031, 036, 046, 048) |
| Fase 8 (Polish) | Concluída exceto passada em TV física (recomendação) — tsc, lint, 345 arquivos de teste, build, build:tizen, E2E 29/29, travas íntegras |

## Riscos e Decisões` e com a trava regravada (`check-contract-tests.ps1 -Slug <slug> -Write`).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | OK | OK | N/A |
| Segredos Fora dos Clientes e dos Logs | OK | OK | Nada de dado sensível; nenhum log novo |
| Categorias da Fonte São Preservadas | OK | OK | Só navegação; rótulos intactos |
| IA e Classificação Nunca Inventam Dados | OK | OK | N/A |
| Comandos Locais Independem de Rede, Backend ou IA | OK | OK | Paginar é local; sem rede por página (D-003) |
| Trailers e Metadados Não Alteram o Estado Principal | OK | OK | N/A |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | OK | OK | Assistir = OK; Favoritar = Segurar OK; Guia = ícone focável por setas+OK; voltar = RETURN. A ação "Guia" **perde** o caminho pelo destaque, mas ganha outro por setas |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto | OK | OK | N/A |
| Foco Visível e Sem Becos Sem Saída | OK | OK | Estados carregando/vazio/erro mantêm a ação focável; RETURN volta à trilha (FR-006/FR-013); paginar não executa |
| Voltar Restaura Foco e Posição | OK | OK | RETURN/OK reentram por identidade (046); a rolagem ancora a linha |
| Identidade de Reprodução Não Depende da URL | OK | OK | N/A |
| Progresso e Capacidades São Reais | OK | OK | N/A (sem barra inventada) |
| Documentação do Repositório É Canônica | OK | OK | ADR-011 recebe nota de atualização (T033); planos 048/024/031 registram a mudança |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/049-navegacao-por-pagina/
├── spec.md
├── plan.md
├── tasks.md
├── handoff.md
├── quickstart.md
├── contract-tests.lock
└── logic/paginacao.md
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── lib/focus/
│   │   ├── paging.ts                         # NOVO (stub do plan): pageSizeFor, pagedIndex
│   │   └── usePageScrollAnchor.ts            # NOVO (task): mantém a linha da tela ao paginar
│   ├── features/live/
│   │   ├── useLiveKeyboard.ts                # → página; OK entra/toca; sem coluna 2
│   │   ├── useLiveSearch.ts                  # + topIcon ('search' | 'guide')
│   │   ├── useLiveGuide.tsx                  # openGuideFromPreview → openGuideFromList (ou mantém o nome)
│   │   ├── liveColumns.tsx                   # sem .live-preview-actions; + .live-guide-button
│   │   ├── LiveScreen.tsx                    # sem previewAction
│   │   └── liveTrail.ts                      # sem PREVIEW_ACTION_COUNT; LIVE_HINTS
│   ├── features/vod/VodCatalogScreen.tsx     # col 0: ←/→ paginam; VOD_HINTS
│   ├── styles/live.css                       # remove .live-preview-action*; estilo do ícone de Guia
│   └── features/**/*.test.tsx, e2e/*.mjs     # migração do fluxo antigo (FR-014)
├── e2e/navegacao-por-pagina.mjs              # NOVO: roteiro da feature
└── e2e/run.mjs                               # registra o roteiro
```

**Structure Decision**: tudo em `tv-web/` (frontend client-first); `api/` e `CCPlayTv/` intactos (só o build sincroniza). `liveColumns.tsx` continua desenhando por **funções** (regra da 040: refs ficam refs, um `useRemoteNav` por componente).

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| Contraria a Spec V14 §13/§33 (→ entra no conteúdo; "focus path" por colunas) e remove os 3 botões do destaque (§25/§31.1) | Decisão do usuário: → pagina para navegar rápido; OK entra | Manter → entrando e paginar com outra tecla (CH±) foi oferecido e **recusado** pelo usuário; registrar como nota de atualização na ADR-011 (T033) |
| Reescrever contratos travados de outras features (018/024/030/031/046/048…) | Eles assertam justamente o fluxo antigo | Deixá-los vermelhos bloquearia o gate; emenda é o caminho previsto pelo `sdd-execute` §5b, aqui pré-aprovada |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx tsc -b
npx vitest run <arquivo-ou-pasta>        # durante as fases
npm run lint
npm run test                             # gate final (~5-8 min)
npm run build ; npm run build:tizen
node e2e/run.mjs --only navegacao-por-pagina   # com `npm run dev` na 5173 (confirme quem escuta a 5173!)
npm run test:e2e                         # suíte inteira, gate final
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/focus/paging.navegacao-por-pagina.contract.test.ts`,
`tv-web/src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx`,
`tv-web/src/features/vod/VodCatalogScreen.navegacao-por-pagina.contract.test.tsx`

Comando: `npx vitest run src/lib/focus/paging.navegacao-por-pagina.contract.test.ts src/features/live/LiveScreen.navegacao-por-pagina.contract.test.tsx src/features/vod/VodCatalogScreen.navegacao-por-pagina.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| paginação: avança/volta uma página, bordas, lista curta, vazia, SC-001 | FR-001/002/003, SC-001 | Fase 2 | `Error: not implemented` |
| Live: →/← paginam trilha e lista sem entrar nem tocar; OK entra; RETURN volta e reentrada devolve o canal | US1+US2, FR-001..006, SC-002/003 | Fase 3 | asserção: `expected null to be 'Notícias'` (→ hoje entra) |
| Live: destaque sem botões; ↑ lupa, → ícone de Guia, OK abre o Guia, ↓ volta | US3, FR-007/008, Constitution (controle remoto) | Fase 4 | asserção: `expected …(3) to have a length of +0` (3 botões hoje) |
| Live: busca — ←/→ no campo são do cursor; nos resultados, → pagina | FR-010, FR-004 | Fase 4 | asserção: `expected null to be 'Canal 08'` |
| Vod: trilha pagina sem abrir; OK entra; grade intacta; ← na 1ª coluna volta | US4, FR-001/011 | Fase 5 | asserção: `expected null to be 'Cat 12'` |

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/focus/paging.ts`.

Estado de partida confirmado: `tsc -b` limpo; suíte de `features/live`, `features/vod`, `lib/focus` e `components` → 638 verdes + os 5 contratos desta feature vermelhos pelo motivo certo (nenhum por import/tipo).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Cerca de 110 arquivos de teste/E2E citam →; muitos usam "→ entra na categoria" ou "→ vai às ações" | Alto — grande reescrita mecânica, fácil de afrouxar sem querer | Resolvido: Fase 7 por arquivo/grupo, com a regra (→ de entrada vira OK; ações do destaque viram OK/Segurar OK/ícone); proibido afrouxar asserção; rodar o arquivo a cada grupo |
| R-002 | Contratos travados 018/024/030/031/046/048 (e outros) assumem o fluxo antigo | Alto — gate vermelho | Resolvido: D-010: emenda pré-aprovada, mínima, com `R-0NN` aqui e regravação da trava por slug; nunca editar fora disso |
| R-003 | Âncora de rolagem (D-009) diverge entre jsdom (sem layout) e navegador/TV | Médio — foco "pula" de linha | Resolvido: `logic/paginacao.md` §3; E2E mede a linha relativa no Chromium; TV física é recomendação |
| R-004 | Virtualização: o item-alvo pode não estar montado quando a página muda | Médio — foco sem nó | Resolvido: rolar por `pageSize*84` antes do commit e deixar `useVirtualFocusSync` corrigir (§3.4) |
| R-005 | Dicas do rodapé dependentes de foco podem não caber / `HintBar` fixa | Baixo | Resolvido: `logic/paginacao.md` §8: lista única se necessário; E2E mede texto cortado |
| R-006 | Perde-se o acesso rápido às ações pelo destaque; Segurar OK exige hábito | Baixo | Dica "Segurar OK Favoritar" já está no rodapé; Guia por ícone focável |
| R-007 | Contraria a Spec V14 (→ entra no conteúdo) | Médio — divergência do DS | Resolvido: Complexity Tracking + nota de atualização na ADR-011 (T033) |
| R-008 | Emenda aprovada (D-010): contratos 018/024/030/031/046/048 e 025/036 reescritos só onde assumiam → entra/→ vai às ações; travas regravadas. 018: o cenário "trocar de categoria com a busca aberta" deixou de ser alcançável (RETURN em camadas fecha a busca antes de ir à trilha) — passou a RETURN em camadas. 031: o guia abre no canal onde o ícone foi alcançado. 048: "ações em linha" substituído por "destaque informativo" (continua com 4 casos). 046: o zapping fechado pela trilha devolve o foco à trilha; OK reentra e a memória devolve o canal. | Médio | Resolvido: ver Registro da Fase 7. |
| R-009 | RETURN no zapping agora é em camadas (canais → trilha → fecha a lista) — antes um RETURN fechava a lista. Necessário porque → não troca mais de coluna e a trilha ficaria inalcançável. | Médio — um toque a mais para fechar o zapping | Resolvido: Decisão do plano (consequência de D-007); registrada e testada (LiveScreen.test.tsx T023, E2E zapping). |
| R-010 | A lista de canais é virtualizada: mudar o foco no mesmo instante da rolagem fazia o virtualizador rolar de novo (item na borda, não na mesma linha). | Médio | Resolvido: rolagem imediata, foco no quadro seguinte (equestAnimationFrame) com destino pendente (pendingChannelIdxRef) para toques rápidos. E2E mede a linha (184px → 184px). |
| R-011 | O Guia só é alcançável a partir do 1º canal (↑ no 1º canal → lupa → Guia): a origem do guia é sempre o 1º da lista, não o canal focado. O contrato 031 protegia "origem ≠ primeiro". | Médio — perde-se abrir o guia num canal qualquer por seta | Aceito nesta feature (decisão do usuário: ícone ao lado da lupa); follow-up sugerido: tecla GUIDE do controle abrindo o guia no canal focado, ou ↑ em qualquer canal indo ao topo. |
| R-012 | setTopFocused no meio do toque mudaria o modo do OK (curto/legado) entre keydown e keyup e ativaria o Guia duas vezes. | Baixo | Resolvido: o foco só sai do ícone quando o guia fecha (efeito em useLiveKeyboard). |
| R-013 | Recuperação (2026-10-02): um `git reset` externo descartou as edições não commitadas em arquivos versionados; foram reaplicadas a partir do histórico da sessão. Ao reaplicar, o E2E `player-dev-mpegts` passou a falhar de forma determinística: `lastGoodChannelRef` (fallback de erro da troca de canal, D-008 da 027) nunca era limpo ao fechar o player, então um canal inválido iniciado depois voltava ao canal antigo em vez de mostrar o erro PLAY-04 — bug pré-existente que só aparecia por tempo. | Médio — erro de canal inválido mascarado | Resolvido: `useLiveZapping.onPlayerClosed` zera o fallback (1 linha, fora do escopo estrito da 049, aceito por bloquear o gate); o E2E também passou a esperar o foco no Canal 4 antes do OK. Sem teste unitário próprio — candidato a follow-up. |

| R-052 | Feature 052: a trilha de categorias de Filmes/Séries deixou de existir; o contrato `VodCatalogScreen.navegacao-por-pagina.contract.test.tsx` virou `VodCategoryScreen.navegacao-por-pagina.contract.test.tsx` (grade cartão a cartão, ← na 1ª coluna não faz nada, ↑ vai à toolbar). A paginação da Live é inalterada. | Registro — emenda de contrato travado | Resolvido: executada pela feature 052 com aprovação do usuário (2026-10-02); trava regravada. |
| R-068 | Feature 068 (legibilidade para TV): a linha de canal da Live cresceu (`LIVE_ITEM_ROW_HEIGHT` 84 → 108), então `LiveScreen.navegacao-por-pagina.contract.test.tsx` passou a `PAGE = 5` (`floor(640/108)`) com um passo a mais até a última página. A regra de paginação é a mesma. | Registro — emenda de contrato travado | Resolvido: emenda escrita no `sdd-plan` da 068 (`sdd/specs/068-legibilidade-tv/contract-amendments/`), aprovada pelo usuário na spec da 068; aplicada verbatim e trava regravada com os 3 arquivos (2026-10-10). |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-02 | Fases 1–8 | Paginação por →/←, OK entra, RETURN em camadas (inclui zapping), destaque informativo e ícone de Guia, trilha de Filmes/Séries; emenda de 8 travas e migração de ~35 testes e ~25 E2E; E2E novo 
avegacao-por-pagina.mjs. Gate: tsc, lint, 345 arquivos de teste, build, build:tizen, E2E 29/29, travas íntegras. | Passada em TV física (recomendação); R-011 (guia só do 1º canal) |

| 2026-10-02 | Passada na TV física | Instalado na QN50Q60DAGXZD via deploy-tv.ps1; o usuário relatou que todos os testes feitos na TV rodaram com sucesso (cenários não detalhados por escrito; quem viu: o usuário). | Nenhuma |

**PRÓXIMO**: sdd-converge na 049 (e T031/T033 da 048).

## Arquivos Principais

- `tv-web/src/lib/focus/paging.ts` (+ `paging.test.ts`)
- `tv-web/src/features/live/useLiveKeyboard.ts` (`pageList`, linha do topo, guia), `useLiveSearch.ts` (`topIcon`), `useLiveZapping.ts` (RETURN em camadas), `liveColumns.tsx` (`.live-top-icons`/`.live-guide-button`, sem ações), `LiveScreen.tsx`, `liveTrail.ts`
- `tv-web/src/features/vod/VodCatalogScreen.tsx` (`col === 0`)
- `tv-web/e2e/navegacao-por-pagina.mjs` (+ `run.mjs`)

## Cuidados para Retomada

- Os scripts E2E têm `http://localhost:5173` fixo: confira quem escuta nessa porta antes (um Vite de worktree temporário já mascarou o gate na 048).
- `npm run test:e2e -- --only a,b` não funciona pelo PowerShell: use `node e2e/run.mjs --only a,b --jobs 1`.
- jsdom devolve `offsetTop = 0` e `clientHeight` fixo nos contratos: o tamanho de página usa fallback (84 canais, 56 trilha).
- Os E2E que navegam até a topbar a partir da lista de canais precisam de RETURN antes (→/← paginam): ver `openViaTopbar` em `e2e/navegacao-por-pagina.mjs`.
- Testes com `waitFor`: o foco da página de canais é aplicado no quadro seguinte (`requestAnimationFrame`); nunca asserte logo depois do toque.
- `R` é alias de `Invoke-History` no PowerShell: não use como nome de função em scripts de edição.

## Resultado Final

Convergida em 2026-10-02 (após recuperação do código, ver R-013).

- **Entregue:** →/← paginam a trilha e a lista de canais da Live (também Favoritos/Todos/busca), o zapping e a trilha de Filmes/Séries (`paging.ts`: `pageSizeFor`, `pagedIndex`, `measuredRowPitch`, `scrollByPage`); OK entra/toca, RETURN volta em camadas (inclusive dentro do zapping); destaque informativo sem botões; ícone de Guia (`.live-guide-button`) ao lado da lupa com `topIcon` em `useLiveSearch`; dicas do rodapé atualizadas; grade de Filmes/Séries intacta.
- **Desvios do plano:** (1) `←`/`→` na linha do topo movem entre lupa e Guia (previsto), mas o foco só sai do ícone quando o guia fecha (R-012); (2) a paginação de canais aplica o foco no quadro seguinte com destino pendente, por causa da lista virtualizada (R-010); (3) RETURN em camadas no zapping (R-009); (4) `onPlayerClosed` zera o fallback de erro de canal (R-013, fora do escopo estrito, bug pré-existente exposto pela recuperação); (5) o Guia abre sempre no canal onde o ícone foi alcançado, o 1º da lista (R-011, aceito).
- **Verificação:** 5/5 contratos verdes e travas íntegras (049 + 8 regravadas: 018, 024, 025, 030, 031, 036, 046, 048); `npm run test` com 347 arquivos verdes (1 arquivo vermelho é o contrato da 050, ainda `Planejada`); `tsc`, lint, build e build:tizen limpos; `node e2e/run.mjs` 29/29; instalado e validado na TV física pelo usuário (relato do usuário, sem lista de cenários).
- **Pendente fora desta feature:** tecla GUIDE para abrir o guia no canal focado (follow-up de R-011); teste unitário próprio do fallback de erro (R-013).

