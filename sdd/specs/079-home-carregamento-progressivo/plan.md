# Implementation Plan: Home, Filmes e Séries já montadas ao entrar

**Slug**: `079-home-carregamento-progressivo` | **Date**: 2026-10-16 | **Spec**: `sdd/specs/079-home-carregamento-progressivo/spec.md`

> Re-planejado em 2026-10-16 depois da entrevista. Emenda de 2026-10-17: a decisão foi alinhada ao comportamento progressivo dos grandes players.

## Summary

Home, Filmes e Séries revelam as fileiras prontas após uma janela curta de 300 ms e inserem as demais quando resolvem, sempre
na ordem canônica. O teto de 2 s continua evitando espera infinita quando nenhum conteúdo está pronto. As capas chegam dentro
dos cards e a regra comum vive em `lib/assembly/`, compartilhada pelas três telas.

## Technical Context

**Language/Version**: TypeScript ~6.0 / React 19 / Vite 8 (build `chrome108`).

**Primary Dependencies**: React Query 5 (`@tanstack/react-query`) para as leituras locais; Dexie 4/IndexedDB atrás de
`features/catalog/catalogApi.ts`; `@tanstack/react-virtual` na pilha de fileiras de Filmes/Séries; Vitest 5 + Testing
Library; Playwright via `tv-web/e2e/run.mjs`.

**Storage**: IndexedDB local; nada novo persistido.

**Testing**: Vitest `node` (regra pura) e `dom` (hook, Home, Filmes/Séries); E2E da Home e de Filmes/Séries; avaliação
visual do usuário na Samsung QN50Q60DAGXZD.

**Target Platform**: Tizen 9.0 / Chromium 120 (origin `file://`); `HTMLImageElement.decode()` disponível.

**Performance Goals**: revelar em ≤ 2 s (teto fixo); "Carregando" nunca antes de 300 ms; voltar com cache = 1º quadro.

**Constraints**: client-first, sem carga eager; foco por `useRemoteNav` (ADR-009), um por componente; foco nunca dispara
consulta (ADR-011); `HomeContent.tsx` (637) e `VodShowcaseScreen.tsx` (749) estão no teto herdado da ratchet e não
podem crescer; contratos travados das features 026, 052, 056, 057, 060 e paridade-v14 não podem ser editados e
dependem do caminho do cache síncrono.

**Scale/Scope**: três telas, ~6 leituras na Home e ~8 em Filmes/Séries; nenhuma fileira nova.

## Decisões Invariantes

- D-001: Uma só regra (`lib/assembly/screenAssembly.ts`) e um só hook (`useScreenAssembly.ts`) para as três telas; regra em `logic/montagem-de-tela.md`.
- D-002: Teto `ASSEMBLY_CAP_MS = 2000` e atraso `LOADING_DELAY_MS = 300`, fixos, contados da montagem da tela.
- D-003: A revelação é decidida **no render**, nunca num efeito (caminho do cache no 1º quadro).
- D-004: Caminho do cache: leituras `primary` resolvidas no 1º render → revela na hora; até o teto, o que chega se encaixa.
- D-005: Toda fileira pronta entra na visita atual, na posição canônica, inclusive depois do teto; a reacomodação das fileiras abaixo é aceita para não esconder conteúdo.
- D-006: Ação da pessoa (fechar o player, alternar favorito no billboard) abre `follow()` e tudo entra na posição.
- D-007: Entram na espera: leituras das fileiras e do hero, formato largo do "Continue" e — **só até `LOADING_DELAY_MS` (300 ms)** — as capas da primeira tela (emenda R-008). Não entram: prévias de categoria, backdrop do billboard, selos, metadados do hero.
- D-008: Fileira vazia ou com falha não aparece, sem aviso.
- D-009: Antes da janela curta não se desenha fileira; após ela, as fileiras prontas aparecem. Se nenhuma leitura resolveu e a espera continua, o "Carregando" reaproveita `Spinner` + `EmptyState` com Voltar.
- D-010: O adiamento `HOME_DEFERRED_MS` deixa de valer para "adicionados" da Home (continua para o resumo de séries).
- D-011: Medição só numérica, em `lib/perf/assemblyTiming.ts`; aceite = avaliação visual do usuário na TV.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | Pass | Pass | Nada de conta ou identidade. |
| Segredos Fora dos Clientes e dos Logs | Pass | Pass | Pré-carga não usa `fetch` nem loga URL; medição só com números e chaves de slot. |
| Categorias da Fonte São Preservadas | Pass | Pass | Ordem e nomes de categoria intactos; carrosséis continuam os da fonte. |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | Sem IA/classificação. |
| Comandos Locais Independem de Rede, Backend ou IA | Pass | Pass | Teto de 2 s impede que TMDB/rede prenda a tela; Voltar/RETURN e topbar funcionam durante a espera. |
| Trailers e Metadados Não Alteram o Estado Principal da Obra | Pass | Pass | Metadados do hero ficam fora da espera e só completam a apresentação. |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | Pass | Pass | ↑ topbar, RETURN e Voltar em todos os estados de espera. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | Sem reprodução nova. |
| Foco Visível e Sem Becos Sem Saída | Pass | Pass | "Carregando" com Voltar focado após 300 ms; antes disso, só milissegundos, com ↑/RETURN tratados. |
| Voltar Restaura Foco e Posição | Pass | Pass | Restauração por id preservada; foco inicial aplicado na revelação; caminho do cache mantém o contrato 060. |
| Identidade de Reprodução Não Depende da URL | Pass | Pass | Nada muda em identidade. |
| Progresso e Capacidades São Reais, Nunca Prometidos | Pass | Pass | Remove o billboard de boas-vindas provisório; sem percentual nem skeleton na espera. |
| Documentação do Repositório É Canônica | Pass | Pass | Spec, plano, tasks, lógica, research e quickstart com caminhos reais. |

Fluxo de Desenvolvimento: Vitest + lint (ratchet) + build + `npm run test:e2e` antes da TV. Sem violação: Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/079-home-carregamento-progressivo/
├── spec.md
├── plan.md
├── research.md
├── logic/montagem-de-tela.md
├── quickstart.md
├── tasks.md
├── contract-tests.lock
└── handoff.md
```

### Source Code (repository root)

```text
tv-web/src/
├── lib/assembly/                         (novo)
│   ├── screenAssembly.ts                 stub — regra pura
│   ├── screenAssembly.home-carregamento-progressivo.contract.test.ts   (travado)
│   ├── useScreenAssembly.ts              stub — hook
│   └── useScreenAssembly.home-carregamento-progressivo.contract.test.tsx (travado)
├── lib/perf/assemblyTiming.ts            (novo) + .test.ts
├── features/home/
│   ├── HomeContent.tsx                   consome a montagem (teto 637)
│   ├── HomeContent.home-carregamento-progressivo.contract.test.tsx    (travado)
│   ├── useHomeAssembly.ts                (novo) slots, capas e follow da Home
│   ├── HomeScreen.tsx                    sinaliza o fechamento do player
│   ├── HomeBillboard.tsx                 modo neutro
│   └── homeRowFormats.ts / useDeferred.ts
├── features/vod/
│   ├── VodShowcaseScreen.tsx             troca rowsReady pela montagem (teto 749)
│   ├── VodShowcaseScreen.home-carregamento-progressivo.contract.test.tsx (travado)
│   └── useShowcaseAssembly.ts            (novo) slots e capas de Filmes/Séries
├── lib/i18n/messages/home.ts             título neutro do billboard
└── styles/home.css
tv-web/e2e/ (home-*.mjs, vitrine/filmes, legibilidade-tv.mjs)
```

**Structure Decision**: a regra comum vive em `lib/assembly/` (compartilhada sem import feature→feature); cada tela tem
um hook fino próprio (`useHomeAssembly.ts`, `useShowcaseAssembly.ts`) que traduz suas leituras em slots e capas — é o
que mantém `HomeContent.tsx` e `VodShowcaseScreen.tsx` dentro do teto da ratchet.

## Complexity Tracking

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (em `tv-web/`):

```powershell
npm run lint
npx tsc -b
npm run test
npm run build
npm run test:e2e
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock` (5/5):

- `tv-web/src/lib/assembly/screenAssembly.home-carregamento-progressivo.contract.test.ts` (2)
- `tv-web/src/lib/assembly/useScreenAssembly.home-carregamento-progressivo.contract.test.tsx` (1)
- `tv-web/src/features/home/HomeContent.home-carregamento-progressivo.contract.test.tsx` (1)
- `tv-web/src/features/vod/VodShowcaseScreen.home-carregamento-progressivo.contract.test.tsx` (1)

Comando (em `tv-web/`): `npx vitest run src/lib/assembly src/features/home/HomeContent.home-carregamento-progressivo.contract.test.tsx src/features/vod/VodShowcaseScreen.home-carregamento-progressivo.contract.test.tsx`

Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 079-home-carregamento-progressivo`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| espera todas as leituras e as capas, revela tudo de uma vez… | US1/AC1–AC3, US3/AC2–AC3, FR-001/002/007/010 | Fase 1 | `Error: not implemented` |
| com a leitura principal em cache aparece no 1º render… | US2/AC5, US3/AC1/AC5, FR-009/011/013 | Fase 1 | `Error: not implemented` |
| "Carregando" só a partir de 300 ms; capas pendentes seguram… | US2/AC1–AC2, US3/AC1/AC4, FR-002/003/004 | Fase 1 | `Error: not implemented` |
| nada da Home é desenhado enquanto as leituras chegam fora de ordem… | US1/AC1/AC2/AC4, US2/AC1/AC3, FR-001/004/005/011 | Fase 2 | `expected <section …> to be null` (billboard de boas-vindas desenhado na hora) |
| Filmes: sem "Carregando" antes de 300 ms; aos 2 s revela… | US2/AC2, US3/AC1/AC3, FR-003/004/007 | Fase 3 | `expected <button …> to be null` ("Carregando" desenhado na hora) |

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/assembly/screenAssembly.ts`
(tipos, constantes, `initialAssembly` real; `stepAssembly`/`slotStatusOf` lançam `not implemented`) e
`tv-web/src/lib/assembly/useScreenAssembly.ts` (tipos; `useScreenAssembly` lança `not implemented`).

Contratos de outras features que esta pode quebrar (rodar sem editar): `HomeScreen.home-busca-configuracoes-ds-v14`
(026), `HomeContent.home-vitrine-expandida` (060), `VodShowcaseScreen.vitrine-filmes-series` (052),
`VodShowcaseScreen.carrosseis-filmes-series`, `VodShowcaseScreen.bem-avaliados` (056),
`VodShowcaseScreen.top10-dica-tmdb` (057), `VodScreens.paridade-v14`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Regra comum (`lib/assembly/`) | Implementada; 3/3 contratos verdes |
| Medição (`lib/perf/assemblyTiming.ts`) | Implementada; ainda sem tela usando |
| Home | Fileiras progressivas após 300 ms; late rows entram na ordem atual; contrato 079 + 026/060 verdes; 628 linhas |
| Filmes/Séries | Regra comum progressiva, teto 2 s, fileiras tardias entram na ordem atual; contratos 079/052/053/056/057/050 verdes; 733 linhas |
| Medição no navegador | Depois da R-008 (lista real, 5 rodadas, p50): Home fria 491 ms, Filmes fria 766 ms, Séries fria 321 ms, quentes 0 ms; nenhuma revelação pelo teto |
| Gates | lint, tsc, build ok; áreas Home/VOD 264/264; contratos 5/5; suíte completa 3547/3547 com `--hookTimeout 30000`; E2E direcionado 7/7 |
| TV física | Não iniciada — T020/T021 dependem do aparelho e do usuário |

## Riscos e Decisões

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | `HomeContent.tsx` (637) e `VodShowcaseScreen.tsx` (749) estão no teto da ratchet. | `npm run lint` falha se crescerem. | Lógica nos hooks `useHomeAssembly.ts`/`useShowcaseAssembly.ts`; se ainda faltar espaço, extrair blocos existentes (ex.: `heroEntries`/`rowStyle` da Home, `renderSlotCard`/`withShell` da vitrine) para arquivos próprios. |
| R-002 | Contratos síncronos de outras features (026, 052, 056, 057, paridade) dependem de a tela aparecer no 1º render. | Contrato travado vermelho. | Caminho do cache (D-003/D-004); decidir no render; rodar todos os contratos da área em cada fase. |
| R-003 | Contrato 060 (Home, dados reais) espera a tela em ≤ 1 s (`waitFor` padrão) e agora a Home espera "adicionados" e a capa do "Continuar". | Contrato 060 vermelho por tempo. | Remover `HOME_DEFERRED_MS` dos adicionados (D-010); carregador sem `decode` termina na hora (jsdom). Se ainda estourar, medir qual leitura atrasa antes de mexer na regra. |
| R-004 | No caminho quente, uma leitura fora do cache (ex.: canais favoritos com `gcTime` 30 s) chega depois do 1º quadro. | Encaixe visível de uma fileira em milissegundos. | Aceito (FR-007 antes do teto); avaliar na TV; se incomodar, alinhar o `gcTime` das leituras da Home. |
| R-005 | Topbar durante a espera: na Home a topbar é do `HomeScreen`; na vitrine, da própria tela. | Foco preso ou ↑ sem efeito no "Carregando". | ↑ chama `onExitUp`/`goToTopbar` também na espera; coberto por teste de componente. |
| R-006 | Pré-carga duplica requisição de capa se o host não permitir cache. | Rede extra na abertura. | Mesma URL do `<img>`; registrar na medição quantas capas terminaram no teto. |
| R-007 | Medição no navegador (lista real): Filmes/Séries frios revelam sempre pelo teto (≈2 s) com **todas as leituras prontas** — as capas do provedor não terminam (9/25 no teto). A lista de capas da vitrine não desconta lista lateral nem topbar. | Abertura fria de Filmes/Séries ~1,5 s mais lenta que sem esperar capas, e ainda com capas faltando. | Resolvido: ver R-008. |
| R-008 | Decisão do usuário (2026-10-16): seguir o padrão dos apps de streaming — capas seguram a tela só até 300 ms (a janela do "Carregando"); depois chegam dentro dos cards no lugar. | Emenda do contrato travado `useScreenAssembly.home-carregamento-progressivo.contract.test.tsx` (capa lenta não segura mais até o teto); trava regravada com autorização. | `imagesSettled` no hook = capas prontas **ou** 300 ms; spec FR-002 e `logic/montagem-de-tela.md` §3 emendados. Reconfirmar na medição do navegador e na TV. |
| R-009 | Emenda do usuário (2026-10-17): fileiras prontas e tardias devem aparecer na visita atual, como nos grandes players, mesmo quando uma fileira acima reacomoda as demais. | Reordenação visual controlada; foco continua reconciliado por identidade. | Regra comum não mantém `deferred`; contratos 079 atualizados e a trava será regravada com autorização. |

## Execution Notes

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-16 | Fase 1 | Regra pura, hook e medição implementados; 3/3 contratos da fase verdes, 12/12 testes de `lib/assembly`+`lib/perf`, lint ok. | Fase 2 (Home). |
| 2026-10-16 | Fase 2 | Home monta antes de aparecer; billboard neutro; `follow` no favorito e no fechamento do player; contratos 079/026/060 verdes; `HomeContent.tsx` 628 linhas. | Instabilidade 1/4 em `HomeBillboard`/`HomeLiveCard` na pasta Home. |
| 2026-10-23 | Fechamento | T020/T021 (TV) validadas pelo usuário, T023/T030 cobertas pelo E2E completo; status Convergida | — |

| 2026-10-16 | Fase 3 | Vitrine de Filmes/Séries na regra comum (teto 2 s); 186/186 em `src/features/vod`; 2 testes antigos ajustados ao atraso de 300 ms. | Fase 4 depende da TV física. |

| 2026-10-16 | Fase 4 (parcial) | Medição no navegador com a lista real (R-007); campo `pending` na medição; roteiro da lista real atualizado ao billboard de 2026-10-09 (T031, a pedido do usuário) → "Tudo certo". | T020/T021 na TV. |
| 2026-10-16 | Fase 5 (parcial) | lint/tsc/3542 testes/build verdes; E2E 50/52 depois de ajustar `e2e.mjs` (espera `.home-hero`); teste da vitrine com relógio falso. | T030 (2 falhas não da 079), T023 sem reprodução na fixture, decisão R-007. |

| 2026-10-16 | Emenda R-008 | Capas só até 300 ms (decisão do usuário); contrato do hook emendado com autorização e trava regravada; 3542/3542, lint ok, E2E da área 10/10; Filmes frio 2,0 s → 0,77 s. | TV física. |
| 2026-10-17 | Emenda R-009 | Regra comum passa a revelar fileiras prontas após 300 ms e inserir fileiras tardias na posição canônica; contratos e testes de Home/VOD atualizados; lint, tsc, build, suíte completa 3547/3547 com `--hookTimeout 30000`, E2E direcionado 7/7; trava 5/5 íntegra. | TV física. |

**PRÓXIMO**: validar a montagem progressiva na TV física com `tizen-tv`, `VITE_CCPLAY_PERF=1`, roteiro de `quickstart.md` (T020) e avaliação visual do usuário (T021).

## Arquivos Principais

- `tv-web/src/lib/assembly/useScreenAssembly.ts`
- `tv-web/src/features/home/HomeContent.tsx`
- `tv-web/src/features/vod/VodShowcaseScreen.tsx`
- `sdd/specs/079-home-carregamento-progressivo/research.md` (linha de base)

## Cuidados para Retomada

- Arquivo novo em `features/<x>/` não pode importar `features/catalog` (nem tipo): a ratchet barra. Tipar pela forma (ver `homeContentModel.ts`, `useHomeAssembly.ts`).
- Depois de encolher um arquivo com teto, `node scripts/architecture.mjs --prune` baixa o teto (só encolhe).
- Teste que verifica o estado de espera com relógio real fica sujeito ao teto de 2 s sob carga: usar `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`.
- Roteiro E2E que lê o Início/vitrine logo após `.home-content`/`.vod-screen` precisa esperar `.home-hero`/`section.vod-row`: a tela só aparece depois da montagem.
- Medir no navegador com a lista real: `CCPLAY_USER_DATA=<perfil> node e2e/home-vitrine-expandida-real.mjs` importa e semeia; depois ligar `ccplaytv:perf` e ler `window.__ccplayAssemblyTimings`.

## Resultado Final

Fechada a pedido do usuário em 2026-10-23, que declarou ter testado tudo (inclusive na TV física); as tarefas que dependiam dessa validação foram marcadas como "validado pelo usuário" — relato, sem evidência anexada nesta sessão. Os riscos da tabela **não** foram reauditados um a um nesta passada; o que é bug daqui em diante entra como bug. Ressalva: a medição numérica da montagem na TV (`__ccplayAssemblyTimings`) não foi registrada; o aceite é a avaliação visual do usuário.
