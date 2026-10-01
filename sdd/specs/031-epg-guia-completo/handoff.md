# Handoff — 031-epg-guia-completo (sdd-plan → sdd-execute)

## Contexto

- Repositório `ccplayTv`, branch `feature/novo-design-system`. Frontend `tv-web/` (React 19 + TS + Vite 8,
  Dexie, React Query, `@tanstack/react-virtual`), alvo Tizen 8 / Chromium 108. `api/` não entra.
- Próximo comando: `/sdd-execute 031-epg-guia-completo`.
- Backlog: `Planejada`, 0/48 tasks. **Depende da 030** (`Convergida`): não recodifique nada de EPG — consuma
  `useEpgPrograms`, `nowNextForChannel`, `formatEpgTimeRange`, `SourceOut.epg`.
- Há trabalho **não commitado** da 030 e do fix do `Modal` na árvore: **não** use `git stash/checkout/reset`.
- Dados reais de teste: `.env` da raiz (gitignored), `CCPLAY_PROBE_USER/PASS/DNS`. Ler em tempo de execução;
  **nunca** imprimir, logar, colar em arquivo, commit ou prompt de subagente.

## O que a feature entrega

- **P1 US1** — "Guia completo" do preview abre o guia em **tela cheia** (sem topbar), na lista de origem, com o foco
  no programa atual **do canal de origem** (não do primeiro canal); RETURN volta à lista com o foco nesse canal.
- **P1 US2** — `←/→` por programa, `↑/↓` por canal mantendo a hora de referência, abas Hoje/Amanhã, CH± paginam,
  OK assiste (a lista do guia vira a vizinhança de zapping), programa encerrado só avisa.
- **P2 US3** — o "Guia" do chrome do player Live vira **real** (só quando a tela passa `onGuide`); guia opaco por
  cima do vídeo, sessão viva; fecha só com o novo canal tocando.
- **P3 US4** — seletor de lista **dentro do guia** — como painel do próprio guia, **não `Modal`** (R-004: o
  `PlayerLayer` captura o teclado e um `Modal` filho nunca receberia teclas).
- Remove o mock `epg-guide`. Nenhuma mudança de dados; nenhuma rede nova.

## Leitura obrigatória, em ordem

1. `spec.md` — FR-001…FR-025, edge cases, Clarifications.
2. `plan.md` — Decisões Invariantes D-001…D-012, riscos R-001…R-009, tabela de contratos.
3. `tasks.md` — 48 tarefas em 7 fases (T001–T036 + itens do checklist).
4. `logic/grade-e-foco.md` — modelo, `refTime`, geometria em %, zonas e teclas, estados, seletor, desempenho.
5. `logic/entradas-e-saida.md` — os dois hospedeiros, `onWatch`, `zapKeyRef`, `topLayer`, `onMediaKey`, `App`, remoções.
6. `quickstart.md` — roteiro manual e comandos.
7. `.planning/memory/constitution.md` — sobretudo "Foco Visível…" e "Voltar Restaura…".
8. Da 030: `sdd/specs/030-epg-dados-agora/plan.md` (`## Resultado Final`) e `tv-web/src/features/catalog/catalogApi.ts` (`useEpgPrograms`).

## Testes de contrato

Travados em `sdd/specs/031-epg-guia-completo/contract-tests.lock` (5/5):

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/features/live/guide/guideGrid.epg-guia-completo.contract.test.ts` | 2 | 2 |
| `tv-web/src/features/live/guide/EpgGuide.epg-guia-completo.contract.test.tsx` | 1 | 3 |
| `tv-web/src/features/live/LiveScreen.epg-guia-completo.contract.test.tsx` | 1 | 3 |
| `tv-web/src/components/PlayerLayer.epg-guia-completo.contract.test.tsx` | 1 | 5 |

- Rodar (de `tv-web/`): `npx vitest run src/features/live/guide src/features/live/LiveScreen.epg-guia-completo.contract.test.tsx src/components/PlayerLayer.epg-guia-completo.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 031-epg-guia-completo`
- **Travas de outras features que esta quebra se errar** (nenhuma pode ser editada): 027
  `PlayerLayer.player-chrome.contract.test.tsx` (**exige o botão "Guia — em breve" quando o player não recebe
  `onGuide`** — por isso D-004), 029 `PlayerLayer.audio-legendas-info.*`, 024 `LiveScreen.live-tv-ds-v14.*`, 018
  `LiveScreen.busca-categoria.*`, 030 `LiveScreen.epg-dados-agora.*`, 022 `Modal.*`.
- A saída vermelha esperada de cada contrato está em `plan.md` → Testes de Contrato.

## Stubs criados

- `tv-web/src/features/live/guide/guideGrid.ts` — tipos prontos; **todas as funções lançam `not implemented`** (T002–T005).
- `tv-web/src/features/live/guide/EpgGuide.tsx` — props e `EpgGuideHandle { onDirection, onSelect, onBack, onPage }`
  **fixados** (o contrato 3 depende deles); o corpo devolve `null` (T009–T011).
- Só tipo (provisório até a task indicada): `PlayerLayer` `onGuide?` (T021), `ChromeFeatures.guide?` (T021),
  `LiveScreen` `onOpenEpgSettings?` (T012/T013).
- **Ainda não existem** e você cria: `guideRows.ts` (T006), `guide.css` (T008), os testes da fase e os E2E.

## Armadilhas já mapeadas

- **`PlayerLayer` captura o teclado** (fase de captura + `stopImmediatePropagation`): nada dentro do `topLayer` pode
  usar `Modal`, nem registrar `useRemoteNav` próprio — por isso o `EpgGuide` só expõe `EpgGuideHandle` e o hospedeiro
  encaminha as teclas.
- **`PlayerLayer` ignora teclas de mídia com `topLayer` aberto** (`if (topLayer || …) return`, ≈ linha 953): CH± no
  guia do player exige `topLayer.onMediaKey` (T022). Sem isso, CH± só funcionaria parado.
- **Contrato 027 vs "Guia" real**: sem `onGuide`, rótulo **"Guia — em breve"**, `availability: 'soon'` e **sem**
  `comingSoonId` (o mock `epg-guide` some — `getComingSoon('epg-guide')` passaria a lançar). Toast próprio no OK.
- **Preview → guia → RETURN**: `setCol(1)` ao abrir, senão o foco volta ao preview e `.live-channel-row.tv-focus` não
  existe (o contrato 4 lê o canal focado da lista).
- **Foco por identidade** (`channelId` + `programStart`), `refTime` separado; ↑/↓ nunca mudam `refTime`.
- **Horário**: programas já vêm com o deslocamento da fonte somado (`lookup.offsetMs`); "hoje/amanhã" e marcas de
  hora em **horário local** — `new Date(y, m, d+1)`, nunca +24 h (horário de verão). Nos contratos, use `new Date(y,m,d,…)`.
- **`react-virtual` no jsdom** só renderiza linhas com `offsetHeight`/`clientHeight`/`scrollHeight` simulados — copie o
  bloco de mocks dos contratos ao escrever testes da fase. Com `vi.useFakeTimers({ toFake: ['Date'] })` o `waitFor` do
  RTL funciona (só `Date` é falso); **não** falsifique `setInterval` junto sem espera manual (ver
  `LiveScreen.epg.test.tsx` da 030, `settle()` condicional — esperas fixas de 60 ms flakeiam sob paralelismo).
- **`useEpgPrograms` usa `keepPreviousData`**: ao trocar a lista os programas antigos ficam por um instante — a
  linha de um canal novo só ganha programa quando a consulta termina.
- **Guia opaco sobre o AVPlay**: `.epg-guide` precisa de fundo opaco (`--bg-canvas`), diferente do scrim do zapping
  (`--player-zap-scrim`, translúcido). Regra de plano de hardware em `player.css` (`.screen > *:not(.player-overlay)`).
- **E2E**: `page.route('**/live/**', …)` **trava o Vite** num reload (casa `/src/features/live/*`) — use
  `${base}/live/**` com a origem do servidor fictício (aprendizado da 030). Reiniciar `npm run dev` antes de rodar.
  O XMLTV real do painel só cobre **10 ids de canal**: o E2E real deve favoritar canais que têm programa (por contagem).
- **Flakes conhecidos** sob paralelismo: `*.favorites.test.tsx`, `LiveScreen.test.tsx` T010 — passam isolados.
  **Falha pré-existente aberta** (não é desta feature): `e2e/home-busca-configuracoes.mjs`, passo "Continuar"
  (~19% no código pré-030) — pode derrubar o `test:e2e` (`&&`); rode os scripts seguintes individualmente.
- **Não** use `Set-Content -Encoding UTF8` (BOM no PS 5.1); **não** use `cmd /c rmdir`/`Remove-Item -Recurse` em caminho
  de sistema (o ambiente bloqueia).

## Pendências do Analyze

| ID | Severidade | Resumo | Recomendação |
| --- | --- | --- | --- |
| A1 | MEDIUM | FR-023 diz "abre um `Modal`"; o desenho usa painel do próprio guia (R-004) | Aceitar; alinhar o texto do FR-023 na convergência |
| A2 | MEDIUM | SC-002, R-002 (guia opaco sobre o plano de hardware) e R-003 (desempenho de "Todos") só se provam na TV | T036 recomendada; registrar "não testado" se não houver TV |
| A3 | LOW | FR-017 diz "virtualizada nos dois eixos"; o eixo horizontal é só a janela visível (`blocksInView`) (R-006) | Aceitar; registrar na convergência |
| A4 | LOW | O edge "hora atual cruza a meia-noite com o guia aberto" só é coberto de forma implícita (T015/contrato 1) | Incluir um caso explícito em T020 |
| A5 | LOW | O contrato 3 já cobre OK/RETURN e ↑/↓ (US2/AC5-AC6) embora US2 seja a Fase 4 | Aceitar; a Fase 4 fecha o resto da US2 |

## Gate de pronto

- 5/5 contratos verdes + trava 031 íntegra + travas 017–030 íntegras (sem edição).
- `npx tsc -b`, `npm run lint`, `npm run test` (flakes confirmados isolados), `npm run build:tizen`,
  `npm run test:e2e` (com `e2e/epg-guia-completo.mjs`), `node e2e/epg-guia-completo-real.mjs` com o `.env`.
- `quickstart.md` no navegador; nenhum teste/E2E cita `epg-guide`.
- Polish: `CLAUDE.md`, `.planning/backlog.md` (item 42c), `.planning/migracao-design-system-v14.md`, `README.md` (na convergência).
- Passada na TV física: **recomendada, não gate** (a spec não eleva).
