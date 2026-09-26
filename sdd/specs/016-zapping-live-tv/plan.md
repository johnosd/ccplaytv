# Implementation Plan: Zapping por Cima do Vídeo em Live TV

**Slug**: `016-zapping-live-tv` | **Date**: 2026-09-25 | **Spec**: `sdd/specs/016-zapping-live-tv/spec.md`

## Summary

Com um canal em reprodução de tela cheia, SELECT traz de volta a trilha de
categorias e a lista de canais por cima do vídeo (que continua tocando,
escurecido atrás); escolher outro canal troca a sessão sem instante
perceptível de tela preta; falha na troca reverte automaticamente para o
canal anterior com um aviso. Toda a lógica de negócio (quando abrir, o que
mostrar, foco inicial, decidir trocar vs. fechar, reverter em erro) vive em
`LiveScreen.tsx`; `PlayerLayer.tsx` ganha só um mecanismo genérico — uma
camada de conteúdo opcional (`topLayer`) para a qual redireciona seu único
registro de teclado modal, e dois callbacks de ciclo de vida da sessão
(`onEnteredPlaying`/`onSessionError`) — sem nunca aprender o que é "canal" ou
"categoria". A troca de sessão em si reaproveita, sem alteração, o
`useEffect` de `[itemId, attempt, createAdapter]` que `PlayerLayer` já tem;
o requisito de "zero gap" é satisfeito porque a lista de zapping (tela cheia)
permanece a camada visível durante toda a troca — nunca por manter duas
sessões de vídeo abertas ao mesmo tempo, o que o motor da TV (AVPlay,
singleton) não suporta. Ver `logic/zapping.md` para o contrato completo.

## Technical Context

**Language/Version**: TypeScript 5 / React 19, Vite (target `chrome108`).

**Primary Dependencies**: `@tanstack/react-query` v5 (`useCategoryList`/
`useCategoryContent`/`useCategoryFocusPrefetch` já existentes,
inalterados), `@tanstack/react-virtual` (lista de canais já virtualizada,
feature 009, inalterada). Nenhuma dependência nova.

**Storage**: IndexedDB via Dexie — esta feature não grava nada novo (spec,
Fora de Escopo). Lê `CatalogItemOut`/`CatalogCategory` já existentes via
`catalogApi.ts`.

**Testing**: Vitest + Testing Library (`PlayerLayer.test.tsx`,
`LiveScreen.test.tsx`, `LiveScreen.favorites.test.tsx` — padrão de
`createAdapter` fake já estabelecido em `PlayerLayer.test.tsx`); Playwright
script novo (`tv-web/e2e/zapping-live-tv.mjs`), mesmo padrão dos scripts
existentes (`chromium.launch` direto, fixture HTTP local).

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 8.0/Chromium 108) via
AVPlay; adaptador `<video>` para dev/testes no navegador.

**Performance Goals**: SC-001 — nenhum instante perceptível de tela preta/
muda/congelada na troca, verificável só a olho com o controle remoto
(constitution, "Validação em hardware real" — sem métrica numérica
automatizável).

**Constraints**: `webapis.avplay` é singleton (confirmado em
`avplayAdapter.ts` — ver `logic/zapping.md`); `useRemoteNav({modal:true})`
sustenta só um registro de teclado por vez. As duas são a razão do desenho
inteiro — ver seção "Por que este desenho" em `logic/zapping.md`.

**Scale/Scope**: Só `LiveScreen.tsx` + `PlayerLayer.tsx` (e seus testes) +
`screens.css`/`index.css` (CSS novo). Nenhuma outra tela é tocada (FR-013).

## Decisões Invariantes

- **D-001**: `PlayerLayer` ganha uma prop opcional `topLayer` — quando
  não-nulo, desenha `topLayer.content` dentro do seu próprio
  `.player-overlay` (nunca como filho de `.screen` por fora, por causa da
  regra de `visibility:hidden` do plano de hardware) e redireciona
  `onDirection`/`onSelect`/`onBack` do seu único `useRemoteNav({modal:
  true})` para os handlers de `topLayer`, em vez do comportamento padrão de
  controles de reprodução. `PlayerLayer` continua sem saber o que é "canal"
  ou "categoria" — só que existe uma camada extra opcional. Motivo:
  `useRemoteNav({modal:true})` só sustenta um registro "dono" do teclado por
  vez (captura + `stopImmediatePropagation`); um componente-irmão com seu
  próprio modal para o zapping colidiria de forma dependente da ordem de
  montagem.
- **D-002**: Abrir a camada (SELECT sem ação de controle disponível) é
  decisão de quem chama `PlayerLayer`, nunca dele mesmo — prop opcional
  `onIdleSelect`, chamada quando SELECT chega sem `topLayer` aberto e sem
  nenhuma ação de controle disponível (`playerControlsActions(...).length
  === 0`, hoje sempre o caso de canal ao vivo). Filmes/Séries não passam
  isto — SELECT sem controles continua só revelando a barra vazia,
  comportamento inalterado (FR-013).
- **D-003**: A troca de sessão em si (fechar a antiga, abrir a nova)
  reaproveita **sem nenhuma mudança** o `useEffect` de `[itemId, attempt,
  createAdapter]` já existente em `PlayerLayer`. `webapis.avplay` é
  singleton (confirmado em `avplayAdapter.ts`) — não há como, nem por que,
  manter duas sessões simultâneas. "Zero gap perceptível" (FR-006/SC-001) é
  garantido porque `topLayer` (tela cheia, com scrim) é a camada VISÍVEL
  durante toda a troca — o instante sem vídeo entre fechar e abrir fica
  coberto por ela, nunca exposto. O descarte de seleções em sequência
  rápida (FR-009/SC-003) já vem de graça do mesmo mecanismo (a flag
  `cancelled` do efeito, que já existe).
- **D-004**: Dois callbacks novos e opcionais em `PlayerLayer`:
  `onEnteredPlaying` (dispara na primeira transição da sessão ATUAL para
  `state === 'playing'`) e `onSessionError` (dispara quando a sessão ATUAL
  cai em erro, além do desenho padrão da tela de erro nativa — que nunca
  fica de fato visível enquanto `topLayer` cobrir tudo). `LiveScreen` usa o
  primeiro para fechar o zapping quando o canal novo já está tocando de
  verdade, e o segundo para reverter a troca automaticamente (US2).
- **D-005**: Toda a lógica de "zapping" (quando abrir, o que desenhar, foco
  inicial, navegação, decidir troca vs. fechar, reverter em erro) vive
  inteiramente em `LiveScreen.tsx`, reaproveitando a MESMA árvore JSX e as
  MESMAS funções de navegação que a tela já usa fora do zapping (extraídas
  para funções nomeadas — `handleTrailDirection`/`handleTrailSelect`/
  `renderColumns`), nunca duplicadas. Única exceção: RETURN dentro do
  zapping sempre fecha a camada inteira (`setZapOpen(false)`), nunca navega
  coluna a coluna como faz fora dele (FR-008) — não reaproveita a função de
  RETURN da tela normal.
- **D-006**: Abrir o zapping computa a categoria do canal tocando por
  `original_group` (`CatalogItemOut` não carrega id de categoria, só o nome
  bruto do grupo — mesmo padrão que a trilha já usa via
  `groupLabel`/`TrailKey`), entra nela e foca o canal — sem isso, FR-003
  ("foco inicial no canal tocando, em qualquer categoria que ele esteja")
  não teria como se ancorar.
- **D-007**: Selecionar, dentro do zapping, o MESMO canal que já está
  tocando fecha a camada imediatamente, sem tocar `playing`/sem remontar a
  sessão (FR-007) — comparado por `id`, nunca por referência de objeto.
- **D-008**: `lastGoodChannelRef` guarda o canal tocando ANTES de cada
  tentativa real de troca (escrito só no instante em que `setPlaying` é
  chamado para um canal diferente, nunca ao só abrir/navegar o zapping) —
  é o que permite `onSessionError` reverter automaticamente sem depender de
  estado assíncrono que já poderia ter mudado.
- **D-009**: O "escurecido atrás" (FR-002) é uma camada CSS nova
  (`.player-zap-scrim`) dentro de `.player-overlay`, cor via token novo em
  `index.css` (`--player-zap-scrim`, derivado de `--bg` com alpha — nunca
  cor literal, ADR-007). Sem `blur` (ADR-007 §8: blur/transparência parcial
  custam caro no engine da TV — scrim de opacidade sólida é diferente e
  aceitável; blur continua fora de cogitação).
- **D-010**: Nenhum campo novo em Dexie/IndexedDB — zapping não persiste
  nada (spec, Fora de Escopo).
- **D-011**: O `useRemoteNav` (não-modal) próprio de `LiveScreen` mantém,
  inalterada, a guarda `if (playing) return` em todos os handlers — o
  zapping nunca precisa que ele reaja a teclado, porque `PlayerLayer`
  (modal) é sempre quem intercepta primeiro, com ou sem `topLayer` aberto.
- **D-012** (achada na Fase 5, T029): `PlayerLayerTopLayer` também repassa
  `onLongSelect`/`onFavoriteKey` opcionais — edge case da spec (segurar OK
  ou a tecla amarela dentro do zapping favorita o canal focado, sem
  conflito com o toque curto que troca) que não tinha sido coberto pelo
  desenho original de D-001. `LiveScreen` só os define quando há um canal
  focado na coluna de conteúdo (`canToggleFavoriteInZap`), reaproveitando
  a mesma `toggleFocusedFavorite` já usada fora do zapping.

Contrato de props/pseudocódigo completo: `logic/zapping.md`.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | Feature não toca autenticação/fonte |
| Segredos Fora dos Clientes e dos Logs | OK | OK | `onSessionError` recebe a mesma mensagem já sanitizada que a tela de erro nativa usaria (`toPlayerError`/`genericErrorMessage`) — nunca URL/erro bruto do motor |
| Categorias da Fonte São Preservadas | OK | OK | zapping reaproveita `original_group`/`groupLabel` tal qual (D-006) — nenhuma taxonomia nova |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | sem classificação nesta feature |
| Comandos Locais Independem de Rede/Backend/IA | OK | OK | abrir/fechar/navegar o zapping são 100% locais; a troca de canal já dependia de rede como hoje (fetchPlayback) |
| Trailers e Metadados Não Alteram Estado | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | OK | OK | abrir (SELECT), navegar (setas), trocar (SELECT), fechar (RETURN ou selecionar o próprio canal tocando) — nenhum caminho exclusivo de mouse |
| Uma Lista de Catálogo Nunca é Tratada Como Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | OK | OK | `openZapping()` sempre foca o canal tocando (FR-003); estados vazio/erro/carregando da coluna de conteúdo dentro do zapping reaproveitam os MESMOS ramos já focáveis da tela normal (D-005) |
| Voltar Restaura Foco e Posição | OK, com nota | OK, com nota | fechar o zapping sem trocar não desmonta `LiveScreen` (estado sobrevive sozinho); mas abrir o zapping MUDA `entered`/`focusedIdentity` para a categoria do canal tocando (D-006) — se a pessoa tinha navegado para OUTRA categoria antes de dar play, ela "perde" essa posição ao abrir e fechar o zapping sem trocar. É consequência direta do próprio FR-003 (foco sempre no canal tocando), não uma lacuna — registrado como R-001 abaixo |
| Identidade de Reprodução Não Depende da URL | OK | OK | troca sempre por `activeChannel.id` (D-007) |
| Progresso e Capacidades São Reais | OK | OK | canal ao vivo continua sem seek/pause; falha vira aviso explícito (FR-011), nunca silêncio |
| Documentação do Repositório É Canônica | OK | OK | CLAUDE.md/backlog atualizados ao convergir |

Nenhuma violação — `Complexity Tracking` fica vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/016-zapping-live-tv/
├── spec.md
├── plan.md                # este arquivo
├── logic/
│   └── zapping.md          # contrato de props/pseudocódigo (Fase 1)
├── tasks.md
└── history.md              # condicional, criado pelo sdd-execute se arquivar
```

Sem `research.md` (nenhuma incerteza técnica restante — as duas perguntas de
viabilidade real, singleton do AVPlay e limite do `useRemoteNav` modal, já
foram resolvidas por leitura direta do código nesta sessão de planejamento).
Sem `data-model.md` (nenhuma entidade nova, spec confirma). Sem
`contracts/` (nenhuma superfície de API nova). Sem `quickstart.md` próprio —
os cenários de aceite da spec já são o roteiro manual; T0XX de Polish cobre a
checagem cross-cutting da constitution.

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── components/
│   │   ├── PlayerLayer.tsx           # ganha topLayer/onIdleSelect/onEnteredPlaying/onSessionError
│   │   └── PlayerLayer.test.tsx      # testes novos para os 4 pontos acima
│   ├── features/
│   │   ├── live/
│   │   │   ├── LiveScreen.tsx        # toda a lógica de zapping (D-005 a D-008)
│   │   │   ├── LiveScreen.test.tsx   # testes novos: abrir/navegar/trocar/fechar/reverter
│   │   │   └── LiveScreen.favorites.test.tsx  # confere que favoritar dentro do zapping continua igual
│   │   └── screens.css               # .player-zap-scrim, .player-zap-columns
│   └── index.css                     # --player-zap-scrim (token novo)
└── e2e/
    └── zapping-live-tv.mjs           # novo — cenários E2E desta feature
```

**Structure Decision**: projeto único (`tv-web/`), sem mudança de estrutura
— a feature toca só os arquivos listados acima, todos já existentes exceto
o script E2E novo. Nenhum outro diretório do repositório (`api/`,
`CCPlayTv/`) é tocado.

## Complexity Tracking

*(vazio — nenhuma violação a justificar)*

## Estratégia de Testes

Prioridade: unitário → E2E → manual (constitution — "Testes E2E (Playwright)
antes de validação em TV física"; sem contrato/integração de API nesta
feature, é só frontend).

1. **Unitário/componente (Vitest)**:
   - `PlayerLayer.test.tsx`: `topLayer` presente redireciona teclado (não
     chama os handlers padrão de controle); `onIdleSelect` dispara quando
     SELECT chega sem controles e sem `topLayer`; `onEnteredPlaying` dispara
     uma vez na primeira transição para `playing` (não de novo em
     rebuffering); `onSessionError` dispara em erro, com a mensagem já
     sanitizada; tela de erro nativa nunca aparece sozinha por cima do
     scrim quando `topLayer` está presente (renderização por trás).
   - `LiveScreen.test.tsx`: `onIdleSelect` abre o zapping focando o canal
     tocando na categoria certa (D-006); selecionar outro canal chama
     `setPlaying` mas mantém `topLayer` até `onEnteredPlaying`; selecionar o
     mesmo canal fecha sem trocar (D-007); RETURN fecha só o zapping; erro
     de troca reverte via `lastGoodChannelRef` e mostra toast (US2).
   - `LiveScreen.favorites.test.tsx`: segurar OK/tecla amarela dentro do
     zapping continua favoritando o canal focado, sem conflito com o SELECT
     curto de troca (edge case da spec).

2. **E2E (Playwright, `tv-web/e2e/zapping-live-tv.mjs`)**: com um canal
   tocando, OK abre a lista; navegar e escolher outro canal troca e a lista
   fecha; escolher o mesmo canal só fecha; RETURN fecha sem interromper;
   fluxo de falha (mock de URL de reprodução inválida) reverte e mostra
   aviso.

3. **Manual** (constitution, "Validação em hardware real" — SC-001
   explicitamente "verificável só a olho, com o controle remoto"): os 7
   cenários de aceite da US1 e os 3 da US2, na TV física — nenhum teste
   automatizado consegue provar ausência de frame preto perceptível.

Comandos-base:

```bash
npm run test             # vitest run
npm run test:e2e         # com npm run dev já rodando
npm run lint
npm run build
```

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup | Fase 1 concluída |
| Foundation | Fase 2 concluída (PlayerLayer suporta topLayer e eventos) |
| US1 (zapping abrir/navegar/trocar/fechar) | Fase 3 concluída |
| US2 (recuperação automática de erro) | Fase 4 concluída |
| Polish (E2E, favoritos no zapping, CLAUDE.md) | Fase 5 concluída. Verificação manual: parcial na TV física real (2026-09-25) — SC-001 (sem gap perceptível na troca), o requisito central da feature, confirmado explicitamente pelo usuário; FR-001/FR-002/FR-005 observados. Cenários restantes (RETURN, mesmo canal, foco inicial, troca de categoria dentro do zap, sequência rápida, US2/falha) seguem só com cobertura automatizada |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Abrir o zapping sempre reancora `entered`/`focusedIdentity` na categoria do canal tocando (D-006/FR-003) — se a pessoa tinha navegado para outra categoria antes de dar play, essa posição não sobrevive a abrir+fechar o zapping sem trocar | Baixo — é consequência direta do próprio requisito (FR-003), não um defeito; comportamento coerente com "Voltar Restaura Foco" (a posição perdida é a de ANTES de entrar no player, não a de dentro do zapping) | Resolvido: aceito como comportamento pretendido; sdd-converge não achou evidência de que isso incomodou na verificação manual |
| R-002 | `webapis.avplay` sendo singleton é inferido pela forma do código (`getAvplay()` sempre resolve o mesmo global) e pela ausência de qualquer suporte a múltiplas instâncias na API — não há confirmação documental da Samsung citada no repositório | Médio, mas só se a inferência estiver errada (nesse caso o design ficaria mais conservador do que precisava, nunca menos correto) | Resolvido: verificação na TV física (2026-09-25) confirmou SC-001 (sem gap perceptível) com o design baseado nessa premissa — o mecanismo funciona como desenhado, independente de a inferência sobre o motor ser exatamente literal |
| R-003 | `onSessionError` reverte automaticamente só quando `lastGoodChannelRef.current` existe — uma falha na ENTRADA normal da Live TV (fora de qualquer zapping) continua caindo na tela de erro nativa do PlayerLayer, comportamento inalterado | Nenhum — é o comportamento correto e já documentado em D-004/`logic/zapping.md` | Resolvido: coberto por teste unitário explícito (T028), sdd-converge não achou evidência de violação |

## Execution Notes

<!-- Tabela append-only, mantida pelo sdd-execute. -->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-09-25 | Fase 1 (Setup) | Verificado build/test baseline antes de começar (3 flaky tests que falharam inicialmente e passaram depois de correr de forma isolada, indicando time out issue em execuções paralelas longas) | Nenhuma |
| 2026-09-25 | Fase 2 (Foundational) | Implementado topLayer no PlayerLayer com refatoração do JSX, adição de estilos CSS, e testes para garantir redirecionamento de useRemoteNav e triggers onEnteredPlaying/onSessionError (corrigido um vazamento de fakeTimers num dos testes). | Nenhuma |
| 2026-09-25 | Fase 3 (US1) | Zapping funcional: abrir/navegar/trocar/fechar, reaproveitando `handleTrailDirection`/`handleTrailSelect`/`renderColumns` extraídos de `LiveScreen.tsx`. | Nenhuma |
| 2026-09-25 | Fase 4 (US2) | Recuperação automática via `onSessionError`/`lastGoodChannelRef` — cobre tanto erro de sessão já aberta quanto falha do `fetchPlayback` da troca (rejeição de promise), mais completo que o pseudocódigo original. | Nenhuma |
| 2026-09-25 | Revisão (outra sessão) | Auditoria de Fases 1-4 contra spec/plan/logic: arquitetura fiel ao contrato. Achado e corrigido: `npm run build` quebrava (3 erros de tipo em `LiveScreen.test.tsx` — campo `method` inexistente em `CatalogItemPlayback`, e `renderLive` sem suporte a `onBack` customizado, fazendo o teste T023 não verificar o que alegava). Documentação de `tasks.md` (Registro da Fase de Fase 2/3, deslocados) corrigida. | Fase 5 (Polish) inteira ainda pendente — não tinha sido executada apesar de reportada como concluída |
| 2026-09-25 | Fase 5 (Polish) | Achado real durante T029: `PlayerLayerTopLayer` não repassava `onLongSelect`/`onFavoriteKey` — o edge case da spec ("segurar OK dentro do zapping favorita, sem trocar de canal") nunca tinha sido implementado. Estendido `PlayerLayer.tsx` (repassa os dois handlers do `topLayer` pro `useRemoteNav` interno) e `LiveScreen.tsx` (`canToggleFavoriteInZap`), com teste novo em `LiveScreen.favorites.test.tsx`. Criado `e2e/zapping-live-tv.mjs` (11 asserções, 4 cenários da spec) e sua fixture; adicionado a `test:e2e`. Validado ponta a ponta num Chromium real via cópia temporária (path do sandbox Linux não existe neste Windows — mesma limitação dos 4 scripts E2E já existentes, não uma regressão). `npm run test` (679/679), `lint` e `build` limpos. `CLAUDE.md` atualizado. | Só a verificação manual em navegador/TV física dos 10 cenários de aceite (fora do alcance desta sessão) |
| 2026-09-25 | Verificação manual (TV física) | Sessão de instalação na TV física (skill `tizen-tv`) interrompida por um bug pré-existente e fora de escopo achado no caminho (`sdd/bugs/prefetch-concorrente-categoria-sem-cancelamento-requisicao`, corrigido e verificado à parte). Retomada depois: usuário confirmou na TV real, com um canal tocando, que OK abre a trilha por cima do vídeo (que continua tocando) e trocar de canal funciona — e, especificamente perguntado, confirmou **sem ambiguidade que não há nenhum instante de tela preta/muda perceptível na troca (SC-001)**. | 6 dos 10 cenários de aceite (RETURN, mesmo canal, foco inicial, troca de categoria dentro do zap, sequência rápida, US2/falha) ainda sem observação manual — só cobertura automatizada |

**PRÓXIMO**: Sem mais tasks de código pendentes. O cenário central (SC-001, sem gap perceptível) já foi confirmado em hardware real. Os 6 cenários restantes têm cobertura automatizada forte (unitário + E2E) mas não observação manual — considerar `sdd-converge` já, registrando essa cobertura parcial como aceitável, ou fechar os cenários restantes numa próxima sessão de TV física.

## Arquivos Principais

- `tv-web/src/components/PlayerLayer.tsx`
- `tv-web/src/features/live/LiveScreen.tsx`
- `tv-web/src/features/live/LiveScreen.test.tsx`
- `tv-web/src/features/live/LiveScreen.favorites.test.tsx`
- `tv-web/src/features/screens.css`
- `tv-web/src/index.css`
- `tv-web/e2e/zapping-live-tv.mjs` (+ `fixtures/zapping-live-tv.m3u`)
- `tv-web/package.json`
- `CLAUDE.md`

## Cuidados para Retomada

- `PlayerLayer.tsx` hoje tem DOIS `return` JSX cedo (erro vs. normal) — o
  `topLayer` precisa aparecer em cima de QUALQUER um dos dois (ver
  `logic/zapping.md`, item 3), então a refatoração do JSX pra um único
  `return` com `if` interno é obrigatória, não cosmética: sem ela, uma
  troca que falhe mostraria a tela de erro nativa por baixo do zapping
  aberto, sem o scrim/lista por cima, durante o instante antes de
  `LiveScreen` reverter.
- `topLayer.content` **precisa** ser desenhado dentro do `.player-overlay`
  do próprio `PlayerLayer` (nunca como filho de `.screen` por fora) — a
  regra CSS `:root.video-plane-visible .screen > *:not(.player-overlay)`
  (`screens.css`) esconde qualquer outro filho direto de `.screen` enquanto
  o vídeo do hardware está visível.
- `CatalogItemOut` não tem id de categoria — só `original_group` (nome
  bruto). Achar a categoria do canal tocando é sempre por
  `groupLabel(name)` comparado, nunca por id.

## Resultado Final

Convergida em 2026-09-25, sem achados. O que foi de fato construído bate
com o plano original em toda a arquitetura: `PlayerLayer.tsx` ganhou o
mecanismo genérico (`topLayer`, `onIdleSelect`, `onEnteredPlaying`,
`onSessionError`, e — achado durante a Fase 5 — `onLongSelect`/
`onFavoriteKey` repassados também, D-012) sem nunca aprender o que é
"canal"; toda a lógica de zapping vive em `LiveScreen.tsx`, reaproveitando
a navegação já existente (`handleTrailDirection`/`handleTrailSelect`/
`renderColumns`, extraídos, não duplicados). A troca de sessão em si nunca
precisou mudar — o `useEffect` de `[itemId, attempt, createAdapter]` já
fazia exatamente o fechar-depois-abrir sequencial que a feature precisava,
e o descarte de seleções em sequência rápida (FR-009/SC-003) já vinha de
graça do `cancelled` desse mesmo efeito.

**Desvio mais significativo em relação ao plano original**: durante o
`sdd-plan`, a exploração de código encontrou um conflito real entre duas
decisões já tomadas com o usuário — a lista fechar assim que a troca fosse
confirmada (redação original da FR-005) contra a sessão antiga só encerrar
quando a nova estivesse pronta (FR-006) — porque o motor de reprodução da
TV (`webapis.avplay`) é singleton, sem suporte a duas sessões simultâneas.
Resolvido junto com o usuário antes de escrever o plano: a lista permanece
aberta cobrindo a troca até o canal novo confirmar, nunca duas sessões de
vídeo ao mesmo tempo — FR-005/FR-006 e o cenário 3 da US1 foram corrigidos
na spec para refletir isso (Clarifications, sessão 2026-09-25, nota
técnica).

**Segundo desvio, achado na Fase 5 (T029)**: o edge case da spec
("segurar OK dentro do zapping favorita, sem trocar de canal") não tinha
sido coberto pelo desenho original de `PlayerLayerTopLayer` — só
`onDirection`/`onSelect`/`onBack` eram repassados. Estendido com
`onLongSelect`/`onFavoriteKey` opcionais (D-012), reaproveitando a mesma
`toggleFocusedFavorite` que a tela já usa fora do zapping.

**Terceiro desvio**: a implementação das Fases 1-4 foi conduzida por um
agente diferente numa sessão anterior e revisada nesta — a arquitetura
estava fiel ao contrato, mas `npm run build` quebrava (3 erros de tipo em
testes que o agente anterior não tinha chegado a rodar via `tsc -b`,
só via `vitest`) e a documentação de `tasks.md` tinha blocos "Registro da
Fase" trocados entre si; ambos corrigidos nesta sessão antes de prosseguir.

**Verificação manual**: SC-001 — o único critério que a spec/constitution
tratam como estruturalmente dependente de hardware real (não provável em
navegador/emulador) — foi confirmado explicitamente na TV física
(Samsung QN50Q60DAGXZD), contra uma fonte real, sem nenhum instante
perceptível de tela preta/muda na troca. Os demais 6 cenários de aceite
(RETURN, selecionar o mesmo canal, foco inicial, troca de categoria dentro
do zap, sequência rápida, os 3 de US2) têm cobertura automatizada forte
(unitário + E2E, um teste dedicado por cenário) mas não foram observados
manualmente nesta sessão — consistente com a constitution ("Validação em
hardware real" não é gate obrigatório por padrão nesta fase do projeto) e
com a decisão explícita do usuário de não elevar isso a gate obrigatório
para esta feature.

**Achado colateral, fora do escopo desta feature**: a sessão de validação
em TV física encontrou um bug pré-existente e não relacionado
(`sdd/bugs/prefetch-concorrente-categoria-sem-cancelamento-requisicao`) —
`useCategoryFocusPrefetch` (feature 010) disparava buscas de rede sem
`AbortSignal`, que podiam se acumular ao navegar por uma trilha longa de
categorias reais, atrasando a categoria que a pessoa efetivamente queria
abrir. Corrigido e verificado à parte (`verified`, confirmado na mesma TV
física), sem relação de código com esta feature.
