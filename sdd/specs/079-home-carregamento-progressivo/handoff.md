# Handoff — 079 Home, Filmes e Séries já montadas ao entrar

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca`; frontend React 19 + TypeScript + Vite em `tv-web/`, client-first para Tizen.
- Próximo comando: `/sdd-execute 079-home-carregamento-progressivo`.
- Backlog: `Planejada`, 0/38 tasks.
- Re-planejado em 2026-10-16 depois de uma entrevista com o usuário; o plano anterior (progressivo, só Home) foi descartado antes de qualquer código.

## O que a feature entrega

- P1 (Fase 1): regra comum `lib/assembly/` — espera, revelação, teto de 2 s, "Carregando" só após 300 ms, adiamento depois do teto.
- P1 (Fase 2, MVP): Home espera hero + fileiras + capas da primeira tela e aparece inteira; billboard **nunca** mostra boas-vindas antes do hero; hero que passa do teto deixa o billboard neutro até a próxima entrada.
- P1 (Fase 3): Filmes/Séries trocam a espera local (`rowsReady`, 3 s) pela regra comum: teto **2 s**, "Bem avaliados" e capas entram na espera, "Top 10"/"Adicionados" que chegam depois do teto acima do que está na tela ficam para a próxima visita.
- P2 (Fase 4): medição na TV; o aceite é a **avaliação visual do usuário**, não um número.
- Decisões do usuário que contrariam o óbvio: teto fixo de 2 s (não sai da medição); TMDB lento não estende o teto; o fundo do billboard **não** entra na espera.

## Leitura obrigatória, em ordem

1. `spec.md` — FR/SC e as Clarifications da entrevista e do plano (caminho do cache).
2. `plan.md` — decisões D-001..D-011, riscos R-001..R-006, contratos de outras features em jogo.
3. `tasks.md` — T001–T030 por fase.
4. `logic/montagem-de-tela.md` — regra exata (§2), hook (§3), slots por tela (§4), capas (§5), render (§6).
5. `research.md` — por que `lib/assembly`, caminho do cache, `decode()`, D-013 da 060.
6. `quickstart.md` — comandos e roteiro na TV.
7. `.planning/memory/constitution.md` — foco, estados honestos, segredos.

## Testes de contrato

Travados em `sdd/specs/079-home-carregamento-progressivo/contract-tests.lock` (5/5):

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/assembly/screenAssembly.home-carregamento-progressivo.contract.test.ts` | 2 | 1 |
| `tv-web/src/lib/assembly/useScreenAssembly.home-carregamento-progressivo.contract.test.tsx` | 1 | 1 |
| `tv-web/src/features/home/HomeContent.home-carregamento-progressivo.contract.test.tsx` | 1 | 2 |
| `tv-web/src/features/vod/VodShowcaseScreen.home-carregamento-progressivo.contract.test.tsx` | 1 | 3 |

- Rodar (em `tv-web/`): `npx vitest run src/lib/assembly src/features/home/HomeContent.home-carregamento-progressivo.contract.test.tsx src/features/vod/VodShowcaseScreen.home-carregamento-progressivo.contract.test.tsx`
- Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 079-home-carregamento-progressivo`
- Vermelhos confirmados no plan: 3× `not implemented`; Home falha porque o billboard aparece na hora; Filmes falha porque "Voltar" aparece na hora.
- Travas de **outras** features que esta pode quebrar (nunca editar): 026 (`HomeScreen.home-busca-configuracoes-ds-v14`), 060 (`HomeContent.home-vitrine-expandida`), 052 (`VodShowcaseScreen.vitrine-filmes-series`), `VodShowcaseScreen.carrosseis-filmes-series`, 056 (`bem-avaliados`), 057 (`top10-dica-tmdb`), `VodScreens.paridade-v14`.

## Stubs criados

- `tv-web/src/lib/assembly/screenAssembly.ts`: tipos, `ASSEMBLY_CAP_MS`, `LOADING_DELAY_MS`, `initialAssembly` (real); `stepAssembly` e `slotStatusOf` lançam `not implemented`.
- `tv-web/src/lib/assembly/useScreenAssembly.ts`: tipos (`UseScreenAssemblyOptions`, `ScreenAssembly`, `ImageLoader`); `useScreenAssembly` lança `not implemented`. A forma das opções e do retorno está presa pelo contrato do hook.

## Armadilhas já mapeadas

- **Decidir no render, não em efeito**: os contratos 026/052/056/057/paridade são síncronos; com as leituras `primary` resolvidas no 1º render a tela tem de aparecer no mesmo render.
- **`slotStatusOf` por `data === undefined`**: os mocks dos contratos às vezes não têm `isPending`/`isError`; consulta desabilitada conta como pendente.
- **jsdom não carrega imagem**: o carregador padrão sem `decode()` termina na hora; senão o contrato 060 estoura o `waitFor` de 1 s.
- **Ratchet**: `HomeContent.tsx` 637 e `VodShowcaseScreen.tsx` 749 linhas são tetos; a lógica vai para `useHomeAssembly.ts`/`useShowcaseAssembly.ts`.
- **Prévias de categoria fora da espera**: os contratos 056/057 mockam a prévia `pending` para sempre.
- **Raiz `.home-content` sempre presente** durante a espera: E2E (`legibilidade-tv.mjs`, `toHome`) esperam esse seletor.
- **Hero é âncora**: hero que chega depois do teto não troca o billboard; só `follow()` ou nova entrada.
- **`follow()` na Home**: toggle de "Minha Lista" do billboard e fechamento do player (prop `userActionKey`); sem isso "Continuar" não aparece após o 1º título assistido.
- **Teste de Filmes usa timers falsos só de `setTimeout`/`setInterval`/`Date`**: o hook não pode depender de `requestAnimationFrame` ou `queueMicrotask` com tempo para revelar.
- Não remover a regra de plano de hardware de `screens.css`.

## Pendências do Analyze

- A-001 (MEDIUM): SC-006/US4 dependem da TV física; sem ela a Fase 4 fica aberta e a feature não fecha — registrar explicitamente.
- A-003 (MEDIUM): FR-006 (foco fica na topbar se a pessoa subiu durante a espera) só tem teste na Home (T011); em Filmes/Séries, cobrir em T017.
- A-004 (LOW): "nova entrada" em Filmes/Séries assume que voltar do detalhe remonta `VodShowcaseScreen` (indicado pela prop `restore`); confirmar na T015, senão as fileiras adiadas não reaparecem ao voltar.
- A-002 (LOW): FR-016 (preservar restauração/SELECT/RETURN) não tem task dedicada; coberto pelos contratos 026/060/052 rodados em T013/T018.

## Gate de pronto

5/5 contratos 079 verdes e trava íntegra; contratos de 026/052/056/057/060/paridade verdes e intactos; `npm run lint`,
`npx tsc -b`, `npm run test`, `npm run build`, `npm run test:e2e`; quickstart executado; `legibilidade-tv.mjs` com o
billboard neutro; a passada na TV física com avaliação visual do usuário é **gate** (aceite da US4).
