# Implementation Plan: EPG — Guia Completo em Tela Cheia

**Slug**: `031-epg-guia-completo` | **Date**: 2026-09-29 | **Spec**: `sdd/specs/031-epg-guia-completo/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Um componente novo, `EpgGuide` (`tv-web/src/features/live/guide/`), desenha a grade de
programação em tela cheia sobre os dados que a feature 030 já guarda: coluna fixa de canais,
linha do tempo de 2 h visíveis com programas como blocos de largura proporcional, marcador
"Agora", linha da hora atual, abas Hoje/Amanhã, painel de detalhe e um seletor de lista. A
lógica de grade e de foco é um módulo puro (`guideGrid.ts`); o componente só o liga ao React,
a `useEpgPrograms` (030) e aos hooks de catálogo que a Live TV já usa. O guia **não registra
teclado**: quem o hospeda encaminha as teclas por um `EpgGuideHandle`. Há dois hospedeiros — o
`LiveScreen` (parado, no lugar do conteúdo) e o `topLayer` do `PlayerLayer` (tocando, opaco
por cima do vídeo, com a sessão viva, como o zapping da 016). No player, o controle "Guia" só
vira real quando a tela passa `onGuide` (assim o contrato travado da 027 segue intacto). Nada
de dado novo, nada de rede nova: o guia só lê IndexedDB e as categorias que a Live TV já lê.

## Technical Context

**Language/Version**: TypeScript ~6.0 (`tv-web/`), React 19; Vite 8, alvo `chrome108`.

**Primary Dependencies**: `@tanstack/react-virtual` 3 (linhas), `@tanstack/react-query` 5,
Dexie 4 (só leitura, via `useEpgPrograms` da 030). **Nenhuma dependência nova.**

**Storage**: N/A — **nenhuma alteração de schema**. Consome `epgPrograms` e a configuração de EPG
da 030 (`data-model.md` da 030). `data-model.md` desta feature não existe por isso.

**Testing**: Vitest + jsdom + fake-indexeddb + Testing Library; Playwright (`tv-web/e2e/*.mjs`).

**Target Platform**: Samsung QN50Q60DAGXZD, Tizen 8.0 / Chromium 108; navegador para desenvolvimento.

**Performance Goals**: segurar `↓`/`→` com centenas de canais não congela (SC-002); mover foco nunca
dispara rede (FR-018); "Agora"/linha da hora com ≤ 1 min de atraso (FR-002).

**Constraints**: foco por estado + classe (ADR-009), sem foco DOM; tokens V14, nenhum valor literal de
cor/raio/espaço; `.no-scale` nos focáveis do guia (FR-005); o `PlayerLayer` captura o teclado, então
nada dentro do `topLayer` pode depender de `Modal` (feature 029); guia opaco sobre o plano de hardware.

**Scale/Scope**: painel de referência: 2.266 canais / 41 categorias, XMLTV com programação para **10 ids
de canal** na janela (achado da 030). Listas grandes ("Todos") são o caso de desempenho.

## Decisões Invariantes

- **D-001 — Um componente, dois hospedeiros.** `EpgGuide` não registra teclado (`useRemoteNav` só do
  hospedeiro); expõe `EpgGuideHandle { onDirection, onSelect, onBack, onPage }`. Parado: o `LiveScreen`
  renderiza o guia no lugar do conteúdo (sem topbar) e encaminha as teclas. Tocando: `topLayer` do
  `PlayerLayer`. Nunca dois ao mesmo tempo (`logic/entradas-e-saida.md` §1).
- **D-002 — Modelo puro separado.** Toda regra de grade/foco/dia mora em `guideGrid.ts` (sem React, sem
  relógio próprio, tudo recebe `now`); o componente não decide navegação (`logic/grade-e-foco.md`).
- **D-003 — Foco por identidade.** `{ channelId, programStart | null }` + `refTime` separado; nunca índice.
  Reconciliação por canal + início quando a programação muda.
- **D-004 — "Guia" do chrome é real só com `onGuide`.** `chromeControls` `features.guide?` (padrão `false`);
  sem ele o botão continua "Guia — em breve", sem `comingSoonId` (o mock `epg-guide` sai de `comingSoon.ts`,
  FR-011). É o que mantém verde o contrato travado da 027.
- **D-005 — Horário sempre deslocado na origem.** O guia recebe programas já com `offsetMs` da fonte somado
  (`useEpgPrograms.offsetMs`); dia e marcas de hora são do horário **local**.
- **D-006 — Janela visível 2 h, limites da janela guardada.** `bounds = [now−12 h, now+48 h]`; posições em %
  da janela (o mínimo legível é CSS). Virtualização vertical por `react-virtual`; "horizontal" = só os blocos
  que intersectam a janela (`blocksInView`).
- **D-007 — Assistir = `onWatch(channel, list, listKey)`.** A lista exibida vira a vizinhança de zapping
  (`zapSequenceRef`, feature 027 D-008) e o foco da Live TV vai para o canal escolhido (FR-012, FR-020).
- **D-008 — O guia aberto do player só fecha em `onEnteredPlaying`.** Mesma regra sem quadro preto da 016
  (FR-022); RETURN nele só faz `setGuide(null)` (sessão intacta).
- **D-009 — Seletor de lista é camada do próprio guia, não `Modal`.** O `PlayerLayer` captura o teclado;
  ver R-004.
- **D-010 — Sem programação = explicação + ação, nunca grade vazia sem saída.** `epg.state ∈ {not_configured,
  disabled, never_synced}` (ou `error` sem nenhum programa) abre a tela de explicação com "Configurar EPG"
  (`onOpenEpgSettings` → tela de EPG da 030) (FR-013).
- **D-011 — CH± pelo `topLayer`.** `PlayerLayerTopLayer` ganha `onMediaKey?` (hoje o player ignora teclas de
  mídia com `topLayer` aberto); parado, o `LiveScreen` passa `onMediaKey` ao seu `useRemoteNav` só enquanto
  `guide && !playing`.
- **D-012 — Textos só do EPG guardado.** Nenhum título/horário/sinopse fora da programação (FR-008); os
  únicos textos fixos são estados e avisos (`logic/grade-e-foco.md` §5/§7).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Guia só lê o que já está no aparelho. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Não toca endereço de EPG; "Configurar EPG" navega, não exibe URL. Guia nunca loga. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | O seletor lista as categorias como a fonte declarou, mais os dois virtuais já existentes. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | D-012: só EPG guardado; canal sem EPG = "Sem programação" factual. |
| Comandos Locais Independem de Rede | ✅ | ✅ | Mover foco/rolar/abas: zero rede (FR-018); só escolher uma lista nova (OK) pode ler categoria, pelo caminho da Live TV. |
| Trailers e Metadados Não Alteram o Estado Principal | ✅ | ✅ | O guia não toca `userStates`. |
| Toda Ação Essencial Tem Caminho por Controle Remoto | ✅ | ✅ | Tudo por setas/OK/RETURN/CH±. |
| Lista de Catálogo ≠ Manifesto de Streaming | ✅ | ✅ | N/A. |
| Foco Visível e Sem Becos Sem Saída | ⚠️ | ✅ | Risco no estado de barra vazia/erro e no seletor — `logic/grade-e-foco.md` §7 dá foco possível a todo estado; contrato 3 prova foco único; E2E prova estados. |
| Voltar Restaura Foco e Posição | ✅ | ✅ | RETURN em camadas (seletor → guia → Live/vídeo); foco na Live TV por id (contrato 4). |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Foco por `channelId`+`programStart`; nada usa URL. |
| Progresso e Capacidades São Reais | ✅ | ✅ | "Agora"/linha da hora do relógio real; cobertura de "Todos" declarada (FR-025). |
| Documentação do Repositório É Canônica | ✅ | ✅ | Polish atualiza `CLAUDE.md`, backlog, matriz da migração, `comingSoon`, testes/E2E que citavam o mock. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/031-epg-guia-completo/
├── spec.md
├── plan.md
├── logic/
│   ├── grade-e-foco.md
│   └── entradas-e-saida.md
├── quickstart.md
├── contract-tests.lock
├── handoff.md
└── tasks.md
```

(Sem `research.md` — não restou incerteza técnica além dos riscos abaixo; sem `data-model.md` — nenhum
dado novo; sem `contracts/` — nenhuma superfície de API.)

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── features/live/
│   │   ├── guide/                                   # NOVO
│   │   │   ├── guideGrid.ts                         # stub (funções puras)
│   │   │   ├── EpgGuide.tsx                         # stub (componente + tipos públicos)
│   │   │   ├── guideRows.ts                         # novo: itens + lookup → linhas (D-005)
│   │   │   └── *.epg-guia-completo.contract.test.*  # travados
│   │   ├── LiveScreen.tsx                           # estado do guia, entradas, topLayer, onWatch
│   │   └── LiveScreen.epg-guia-completo.contract.test.tsx   # travado
│   ├── components/
│   │   ├── PlayerLayer.tsx                          # onGuide, topLayer.onMediaKey
│   │   ├── chromeControls.ts                        # features.guide
│   │   ├── PlayerChrome.tsx                         # (rótulo "Guia" já existe)
│   │   └── PlayerLayer.epg-guia-completo.contract.test.tsx  # travado
│   ├── lib/comingSoon.ts                            # remove epg-guide
│   ├── styles/guide.css                             # NOVO (importado em main.tsx)
│   └── App.tsx                                      # onOpenEpgSettings
├── e2e/
│   ├── epg-guia-completo.mjs                        # NOVO, em test:e2e (fixture fictícia)
│   └── epg-guia-completo-real.mjs                   # NOVO, fora do test:e2e (.env)
└── package.json                                     # test:e2e ganha o roteiro novo
```

**Structure Decision**: tudo em `tv-web/`, sob `features/live/guide/` (o guia é parte da Live TV,
mesma fronteira das features 016/018). Sem arquivo novo emitido pelo Vite fora do bundle
(`guide.css` entra em `assets/index.css`) — nada a listar em `tizen_web_project.yaml`.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| — (nenhuma violação da constitution) | — | — |

(O desvio do FR-023, `Modal` → camada própria, é de mecanismo e não viola princípio: R-004.)

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run <arquivo>        # o mais estreito primeiro
npx tsc -b
npm run lint
npm run test
npm run build:tizen
npm run test:e2e                # com `npm run dev` recém-iniciado
node e2e/epg-guia-completo-real.mjs   # dado real do .env
```

Dados reais: o roteiro `epg-guia-completo-real.mjs` e a passada na TV usam o `.env` da raiz
(`CCPLAY_PROBE_*`), lido em tempo de execução — valores nunca vão para arquivo versionado, log ou commit.

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/features/live/guide/guideGrid.epg-guia-completo.contract.test.ts`,
`tv-web/src/features/live/guide/EpgGuide.epg-guia-completo.contract.test.tsx`,
`tv-web/src/features/live/LiveScreen.epg-guia-completo.contract.test.tsx`,
`tv-web/src/components/PlayerLayer.epg-guia-completo.contract.test.tsx`

Comando (de `tv-web/`): `npx vitest run src/features/live/guide src/features/live/LiveScreen.epg-guia-completo.contract.test.tsx src/components/PlayerLayer.epg-guia-completo.contract.test.tsx`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| navega por programa e por canal mantendo a hora de referência, e as abas Hoje/Amanhã saltam de dia | US2/AC1-AC3, FR-004, FR-014, FR-015, FR-016, edge lacuna/meia-noite | Fase 2 | `Error: not implemented` |
| a grade é proporcional e recortada na janela, e a rolagem mantém o foco visível dentro dos limites | US1/AC2, FR-001, FR-003, FR-014, edge programa curto/cortado | Fase 2 | `Error: not implemented` |
| abre no programa atual do canal de origem, marca o agora, esmaece o encerrado, alcança o canal sem EPG, e OK/RETURN agem | US1/AC1-AC3, US2/AC5-AC6, FR-002/003/005–008, FR-012, FR-019–FR-021, Constitution: Foco Visível | Fase 3 | `expected undefined to be defined` (o stub devolve `null`) |
| "Guia completo" do preview abre o guia (já não é "Em breve") no canal de origem, e RETURN volta à lista com o foco nesse mesmo canal | US1/AC1/AC4, FR-009, FR-011, FR-012, Constitution: Voltar Restaura Foco | Fase 3 | `expected null not to be null` (`.epg-guide` ausente) |
| "Guia" é real e OK nele chama onGuide quando a tela sabe abrir o guia; sem onGuide continua "Guia — em breve" e não chama nada | US3/AC1, FR-010, FR-011, Constitution: SELECT funcional | Fase 5 | `Unable to find an accessible element with the role "button" and name "Guia"` |

Vermelho confirmado em 2026-09-29: 5/5 falham por `not implemented` ou asserção, nenhum por
import/tipo/sintaxe; `tsc -b` e lint limpos; suíte `components` + `LiveScreen` + contratos 024/030: só o
contrato novo falha.

Stubs criados pelo plan (ponto de partida do execute, não travados):
`tv-web/src/features/live/guide/guideGrid.ts` (todas as funções lançam `not implemented`),
`tv-web/src/features/live/guide/EpgGuide.tsx` (props/`EpgGuideHandle` fixados; corpo devolve `null`),
props só de tipo: `PlayerLayer` `onGuide`, `ChromeFeatures.guide`, `LiveScreen` `onOpenEpgSettings`.

Fora do contrato, cobertos por testes da fase: `guideRows`, `tickTimes`/`programNearest`/`initialFocus`
isolados, estados carregando/erro/vazio/sem programação, seletor de lista, "Todos" com cobertura, CH±,
`chromeControls` (`features.guide`), `PlayerLayer` (`topLayer.onMediaKey`, `onGuide` no chrome), guia aberto do
player (sessão viva; fecha só em `onEnteredPlaying`), reconciliação quando a programação muda, meia-noite.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. -->

| Área | Estado |
| --- | --- |
| Fases 1–2 | Concluídas — `guideGrid.ts`, `guideRows.ts`. |
| Fase 3 (US1) | Concluída — `EpgGuide`, `guide.css`, entrada pelo preview, `App`. |
| Fase 4 (US2) | Concluída — abas Hoje/Amanhã, `onPage`/CH±, reconciliação. |
| Fase 5 (US3) | Concluída — `onGuide`, `topLayer` do guia, `onMediaKey`, mock `epg-guide` removido; contrato 5 verde; lado `LiveScreen` do player coberto pelo E2E. |
| Fase 6 (US4) | Concluída — seletor + cobertura de "Todos"; `EpgGuide.selector.test.tsx` 3/3. |
| Fase 7 (Polish) | Concluída — E2E fictício e real verdes, gates, docs. Só a passada física (T036) fica aberta, recomendada. |
| Verificação | `tsc`/`build:tizen` limpos; contratos 5/5 e 15 travas íntegras; vitest 1579/1583 (4 flakes conhecidas, 106/106 isoladas); `test:e2e` 14 scripts exit 0; E2E real com programa real. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | O XMLTV real do painel de referência só tem programação para 10 ids de canal (achado da 030); numa lista comum quase toda linha do guia é "Sem programação". | A validação com dado real precisa de uma lista com canais que têm programa. | Resolvido: E2E real usa **★ Favoritos**/categoria que contém esses canais (descobrir em tempo de execução, só contagens). Guia fica correto mesmo com EPG esparso (FR-007). |
| R-002 | Guia opaco por cima do plano de hardware do AVPlay, com o áudio seguindo, só está provado no zapping da 016 (translúcido) — não com uma camada 100% opaca de tela cheia. | Vídeo poderia aparecer por trás na TV. | `.epg-guide` com fundo opaco (`--bg-canvas`); confirmar na passada física (T036, recomendada). Sem TV: "não testado". |
| R-003 | (Parcial: no E2E real "Todos" cobriu só 2 de 41 categorias, p95 71 ms; sem milhares de canais montados — provar na TV.) "Todos" numa fonte grande lê `useEpgPrograms` para ~1 000 chaves e monta linhas em lista de milhares de canais. | Pode travar segurar `↓`/`→` na TV (SC-002). | Virtualização vertical + só linhas montadas calculam blocos; medir no E2E real e na TV; se preciso, ler só as chaves da janela virtual. |
| R-004 | **FR-023 diz "abre um `Modal`"**, mas `Modal` dentro do `topLayer` do `PlayerLayer` nunca recebe teclas (o player captura o teclado — feature 029). | Mecanismo da spec inviável na entrada pelo player. | Resolvido: D-009: seletor como painel do próprio guia, mesmo comportamento observável (lista, foco na atual, OK escolhe, RETURN fecha). Registrado; spec não reescrita. |
| R-005 | Mudar o controle "Guia" quebraria o contrato travado da 027 (exige o botão "Guia — em breve" sem capacidade de guia). | Trava vermelha. | Resolvido: D-004: real só com `onGuide`; contrato 5 fixa os dois lados. Nada do contrato 027 é editado. |
| R-006 | FR-015/FR-017 pedem CH± e "virtualização nos dois eixos". `PlayerLayer` ignora teclas de mídia com `topLayer`. | CH± no guia aberto do player não chegaria. | Resolvido: D-011 (`topLayer.onMediaKey`, mudança pequena e testada em `PlayerLayer`); eixo horizontal = só blocos da janela (`blocksInView`), o que cumpre o objetivo do FR-017 sem um segundo virtualizador. |
| R-007 | Fronteiras de dia em horário local (meia-noite, horário de verão) e marcas de hora em fusos com deslocamento não múltiplo de 30 min. | "Hoje/Amanhã" errado por uma hora perto de virada. | Resolvido: `dayOfTime`/`jumpToDay`/`tickTimes` trabalham com `Date` local (`new Date(y, m, d+1)`), não com aritmética de 24 h; contrato 1 cobre a virada. |
| R-008 | O guia aberto do player pode coexistir com erro de sessão (troca de canal falha). | O erro ficaria escondido atrás do guia. | Já tratado pela 016: `onSessionError` volta ao canal anterior com aviso; o `Toast` do `LiveScreen` fica acima. Cobrir em teste da Fase 5. |
| R-009 | Foco de estado dentro de `topLayer` compartilha o teclado com o zapping e o chrome (capture). | Tecla vazando para outra camada. | Resolvido: Guia e zapping nunca abertos juntos (D-001); testes de RETURN em camadas na Fase 5. |
| R-010 | "Configurar EPG" no guia aberto do player navega para as configurações: a Live TV desmonta e o player fecha; RETURN das configurações volta à Live TV parada. | O canal deixa de tocar. | Resolvido: Aceito: é a rota padrão do app (`open epg-settings` com `from: live`), ação explícita da pessoa. |
| R-011 | `PlayerLayerTopLayer.onMediaKey` retorna `void`, não `boolean` como o texto da T022. | Nenhum: o `PlayerLayer` não precisa saber se a tecla foi consumida (D-011). | Resolvido: Registrado como decisão; contratos não dependem disso. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-29 | Fases 1–2 (Setup + Foundational) | Modelo puro da grade (`guideGrid.ts`) e `guideRows.ts`; contratos 1–2 verdes; 18 testes novos. | Fase 3: o componente. |
| 2026-09-29 | Fase 7 (Polish) | E2E fictício (epg-guia-completo.mjs, em 	est:e2e) e real; bug de CSS real corrigido (.screen relativa zerava a altura); docs e gates. | Passada física. |
| 2026-09-29 | Fases 4–6 (US2–US4) | Abas, `onPage`, `onGuide`/`topLayer` do guia, `onMediaKey`, mock removido, seletor testado; bug real: `onGuide` estava no ramo VOD do `onSelect` (achado pelo contrato 5). | Fase 7: E2E e gates. |
| 2026-09-29 | Fase 3 (US1) | `guide.css`, `EpgGuide` completo, integração no `LiveScreen` (guia parado), `App`; testes de estados e de integração; teste antigo de \

**PRÓXIMO**: `sdd-converge` da 031; passada física (T036) quando a TV estiver acessível — R-002 e R-003.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/features/live/guide/EpgGuide.tsx` (abas Hoje/Amanhã e `onPage` a fazer), `guideGrid.ts`, `guideRows.ts`, `tv-web/src/styles/guide.css`
- `tv-web/src/features/live/LiveScreen.tsx` (`guide`, `watchFromGuide`, `zapKeyRef`; falta `onMediaKey` e `onGuide`), `tv-web/src/App.tsx`
- Fase 5: `tv-web/src/components/PlayerLayer.tsx`, `chromeControls.ts`, `comingSoon.ts`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- (nenhum ainda)

## Resultado Final

Convergida em 2026-09-29 (sdd-converge): os 25 FR e os 5 SC têm código e teste, nenhuma lacuna acionável.

**O que foi construído.** `EpgGuide` (`features/live/guide/`) + modelo puro (`guideGrid.ts`, `guideRows.ts`) + `guide.css`: grade canais × programas, painel de detalhe, abas Hoje/Amanhã, linha da hora atual, encerrado esmaecido, seletor de lista (★ Favoritos/Todos/categorias) com cobertura de "Todos", CH±. Dois hospedeiros: Live TV parada (substitui o conteúdo) e `topLayer` do `PlayerLayer` (sessão viva, fecha só quando o canal escolhido toca — `guideWatchPendingRef`). "Guia" do chrome real com `onGuide`; mock `epg-guide` removido.

**Desvios do plano/spec (todos já registrados).** (1) FR-023 pede `Modal`; o seletor é painel do próprio guia (R-004/D-009: `Modal` não recebe teclas dentro do player). (2) FR-017 "virtualizada nos dois eixos": vertical por `useVirtualizer`, horizontal só pela janela de blocos visíveis (R-006). (3) `onMediaKey` do topLayer retorna `void` (R-011). (4) Seletor, `watchFromGuide` e `zapKeyRef` foram adiantados para a Fase 3. (5) Teste da virada da meia-noite no componente removido (o `useNow` não é simulável); coberto pelo contrato 1. (6) Achados só no navegador/contrato: `.screen` sobrescrita zerava a altura do guia; `onGuide` estava no ramo VOD do `onSelect`. Ambos corrigidos.

**Evidência.** Contratos 5/5 e 15 travas íntegras; vitest 1579/1583 (4 flakes conhecidas, 106/106 isoladas ×3); `tsc`/`build:tizen` limpos; `test:e2e` (14 scripts) exit 0; E2E real com programa real (p95 128 ms).

**Ainda aberto (não bloqueia).** R-002 (guia opaco sobre o plano de hardware do AVPlay com áudio) e R-003/SC-002 (desempenho com milhares de canais: o E2E real cobriu 2 de 41 categorias em "Todos") só se provam na TV física (T036, recomendada). R-008 (falha de troca com o guia aberto) sem teste dedicado. R-013 do usuário (E2E instável da 030) segue sem decisão e é fora desta feature.
