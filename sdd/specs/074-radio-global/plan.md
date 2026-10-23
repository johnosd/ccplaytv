# Implementation Plan: Rádio global por país

**Slug**: `074-radio-global` | **Date**: 2026-10-15 | **Spec**: `sdd/specs/074-radio-global/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Destino **Rádio** na topbar (depois de Séries, com lista ativa), com uma tela no padrão da TV ao vivo: trilha com
`★ Favoritos`, "Mais ouvidas no mundo" e países do diretório Radio Browser, e lista das 100 estações mais ouvidas do
item escolhido. OK toca, e uma barra "Tocando agora" no topo deixa a pessoa continuar navegando. Favoritos de estação
ficam só no aparelho. Sem rede, abre do cache.

Abordagem:
- `lib/radio/` é um conector próprio e isolado (ADR-018), com banco Dexie separado e cache.
- `features/radio/` compõe hooks no padrão da 040 e toca por `createPlayerSession(kind 'channel')` direto, sem
  `PlayerLayer`.
- A integração com a navegação é aditiva: `'radio'` em `AppScreen`/`TopbarItem` e a prop `onOpenRadio` na `TopBar`.

## Technical Context

**Language/Version**: TypeScript 5 + React 19 (`tv-web/`), build Vite 8 com alvo `chrome108`.

**Primary Dependencies**:
- já existentes: Dexie (novo banco `ccplay-radio`), `@tanstack/react-virtual` (lista, se o executor medir
  necessidade com 100 linhas), `useRemoteNav` (ADR-009) e o `PlayerService` (AVPlay/`<video>`);
- `Intl.DisplayNames` (nomes de país);
- nenhuma dependência nova.

**Storage**: IndexedDB `ccplay-radio` (`favorites`, `directoryCache`); `localStorage` `ccplaytv:radio-last-country`;
memória de módulo para foco (`data-model.md`).

**Testing**:
- vitest em dois projetos: `dom` (`*.test.tsx`, jsdom + `fake-indexeddb`) e `node` (`*.test.ts`);
- E2E Playwright pelo `e2e/run.mjs`, com o diretório interceptado por `page.route`;
- passada na TV física pela skill `tizen-tv`.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9 / Chromium 120, origem `file://`); dev no navegador com o adaptador
`<video>`.

**Performance Goals**:
- OK → som com mediana ≤ 5 s na TV (SC-004, meta a medir);
- entrar num país com cache fresco sem rede, e sem cache em ≤ 10 s (tempo limite do conector);
- 100 linhas por lista.

**Constraints**:
- focar não consulta nem toca;
- nada além de país/uuid/parâmetros fixos sai para o diretório;
- `lib/radio` sem `lib/catalog`/`lib/portal`;
- arquivo de produção ≤ 300 linhas;
- tokens do DS V14 (fonte ≥ 20 px);
- i18n pt/en/es;
- todo arquivo emitido listado em `tizen_web_project.yaml`.

**Scale/Scope**: ~230 países; 100 estações por entrada; favoritos sem limite prático (dezenas).

## Decisões Invariantes

- **D-001** — Rádio é destino de topo **sem topbar própria**, como a Live desde a 068 (D-008 de lá). Entra-se pelas
  topbars de Início, Filmes/Séries, Busca e Configurações. RETURN na trilha volta (`goBack`) ao Início.
- **D-002** — `'radio'` entra em `AppScreen` e em `TopbarItem`, **nunca** em `TopDestination`. Os contratos 023/024
  fixam `TopDestination` e a zona `shortcuts` do Início, e os `switch` sobre `TopDestination` (atalhos, Favoritos)
  ficam intocados.
- **D-003** — A `TopBar` só desenha o item "Rádio" (e o põe na ordem de foco, logo depois de "Séries") quando recebe
  `onOpenRadio`. Telas e testes que não passam a prop ficam idênticos.
- **D-004** — `lib/radio/*` não importa `lib/catalog`, `lib/portal`, `features/` nem `components/`. Dados num banco
  Dexie próprio, `ccplay-radio`, fora do backup e independente de lista.
- **D-005** — A reprodução usa `createPlayerSession(url, FULLSCREEN_REGION, 'channel', { createAdapter })` dentro da
  tela. Não passa por `PlayerLayer`/`usePlayerSession`. Consequências:
  - nunca liga `video-plane-visible`;
  - não desliga a proteção de tela (FR-018);
  - não tem chrome de vídeo.
- **D-006** — A barra "Tocando agora" fica no slot `topBar` do `AppShell` e é uma `<section aria-label="Tocando agora">`
  (contrato 1). Só é focável com sessão ativa ou falha; chega-se a ela com ↑ no primeiro item da trilha ou da lista.
- **D-007** — Só OK (entrar) e a abertura da tela (entrada inicial) consultam o diretório. Foco nunca consulta, e não há
  prefetch (contrato 2).
- **D-008** — Geração + `AbortController` por entrada e token por reprodução. Uma resposta ou callback de geração antiga
  é descartada (contrato 3).
- **D-009** — Cache: países ficam frescos por 7 dias, estações por 6 horas. Fresco = sem rede. Vencido = mostra e
  atualiza. Falha = mostra o vencido com aviso e "Tentar de novo".
- **D-010** — Escopo parcial visível acima da lista: "100 mais ouvidas de N" (país) / "100 mais ouvidas do mundo".
  Constitution, "Progresso e Capacidades São Reais": cobertura parcial nunca parece catálogo completo.
- **D-011** — Nenhum `console.*` em `lib/radio/` e `features/radio/`; erros só por categoria fixa
  (`RadioDirectoryError.kind`, rótulos i18n).
- **D-012** — `AppShell` e `HintBar` saem de `features/shell/` para `components/` (T001), para a tela nova não criar
  exceção `feature-to-feature` na catraca. A baseline só encolhe.
- **D-013** — Sem `react-query` na Rádio: estado local + gerações; a tela monta sem `QueryClientProvider`.
- **D-014** — OK na estação que toca (ou conectando) para; OK na estação que falhou tenta de novo; OK em outra troca.
- **D-015** — 15 s sem `playing` = falha "indisponível". Nada toca sozinho depois de uma falha.
- **D-016** — Ao abrir a tela com a entrada inicial carregada, o foco fica na primeira estação. OK na trilha passa o
  foco à lista imediatamente, com o estado de carregamento focável ("Voltar"), como a Live.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | ✅ | ✅ | Diretório sem conta e sem chave. |
| Segredos Fora dos Clientes e dos Logs | ✅ | ✅ | Nada de lista chega a `lib/radio` (D-004). Só país/uuid saem (FR-026, contrato 5). Sem `console.*` e sem URL em erro (D-011). URL de estação não é segredo, mas nunca é exibida. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | N/A à lista. Os países são do próprio diretório e não substituem nada da lista. |
| IA e Classificação Nunca Inventam Dados | ✅ | ✅ | Sem dial nem frequência. Tags, país e formato vêm do diretório; ausência = não mostra. |
| Comandos Locais Independem de Rede | ✅ | ✅ | Mover foco, RETURN e Parar são locais. A consulta só acontece por OK. |
| Trailers e Metadados Não Alteram o Estado | ✅ | ✅ | N/A. Favoritar não toca, tocar não favorita. |
| Caminho Completo por Controle Remoto | ✅ | ✅ | Trilha/lista/barra com setas+OK+RETURN; Parar também por OK na estação e pela tecla Stop. Favoritar por segurar OK (além da amarela). |
| Lista ≠ Manifesto de Streaming | ✅ | ✅ | N/A ao importador. `hls` vem do diretório; a URL vai inteira ao motor. |
| Foco Visível e Sem Becos Sem Saída | ✅ | ✅ | Carregando/vazio/erro/sem países com ação focável (`logic/radio-tela.md` §3–§4). Focar não toca nem consulta (contrato 2). |
| Voltar Restaura Foco e Posição | ✅ | ✅ | Memória por entrada e estação **por id** (§6). Trocar de entrada começa no primeiro item. |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | `radio-browser:<uuid>`; favorito toca a versão atual por uuid (contrato 4). |
| Progresso e Capacidades São Reais | ⚠️ | ✅ | Pré: a spec não pedia indicar o recorte "100 de N". Pós: D-010 cobre. Ao vivo sem pausa/busca (`kind 'channel'`); "Conectando…" vira erro em 15 s, sem encobrir falha (D-015). |
| Documentação É Canônica | ✅ | ✅ | ADR-018 já registra a decisão. Nenhum doc canônico cita `features/shell/AppShell`/`HintBar` (verificado no plan), então mover não deixa caminho velho. Os comentários de código que citam `shell/AppShell` são atualizados em T001. |
| Restrição: Direct Play / backend | ✅ | ✅ | Sem proxy nem backend (ADR-018 §7). |
| Restrição: licenças de serviços externos | ⚠️ | ⚠️ | Termos do Radio Browser sem licença de dados nomeada. Risco **aceito pelo usuário** (assessment + ADR-018), R-001. Não bloqueia. |
| Restrição: design system / i18n | ✅ | ✅ | Tokens V14, `components/` reaproveitados, catálogo i18n, auditoria `legibilidade-tv`. |
| Restrição: validação em hardware | ✅ | ✅ | A spec eleva a TV física a gate de SC-001/SC-004 (exceção prevista na constitution), R-003. |
| Fluxo: testes + E2E antes da TV | ✅ | ✅ | vitest por task, E2E `radio-global` + `legibilidade-tv` antes do `tizen-tv`. |

## Project Structure

### Documentation (this feature)

```text
sdd/specs/074-radio-global/
├── spec.md
├── plan.md                # este arquivo
├── data-model.md          # banco ccplay-radio, cache, localStorage
├── quickstart.md          # verificação manual + passada na TV (gate)
├── logic/
│   ├── diretorio.md       # conector Radio Browser
│   └── radio-tela.md      # tela, foco, reprodução, favoritos, integração
├── contract-tests.lock    # 5 testes travados
├── handoff.md
└── tasks.md
```

### Source Code (repository root)

```text
tv-web/
├── src/
│   ├── App.tsx                         # case 'radio'; onOpenRadio nas topbars
│   ├── main.tsx                        # import './styles/radio.css'
│   ├── setupTests.ts                   # + resetRadioSessionMemory()
│   ├── navigation/appNav.ts            # AppScreen 'radio', TopbarItem 'radio'
│   ├── navigation/routeModules.ts      # RadioScreen lazy
│   ├── components/AppShell.tsx         # MOVIDO de features/shell (T001)
│   ├── components/HintBar.tsx          # MOVIDO de features/shell (T001)
│   ├── features/shell/TopBar.tsx       # prop onOpenRadio
│   ├── features/home/HomeScreen.tsx    # repassa onOpenRadio
│   ├── features/vod/…, search/…, settings/…   # onOpenRadio no shell da topbar
│   ├── features/radio/                 # NOVO
│   │   ├── RadioScreen.tsx             # (stub do plan)
│   │   ├── RadioScreen.radio-global.contract.test.tsx   # TRAVADO
│   │   ├── radioSessionMemory.ts       # (stub do plan)
│   │   ├── useRadioCatalog.ts · useRadioPlayback.ts · useRadioKeyboard.ts
│   │   ├── NowPlayingBar.tsx · radioColumns.tsx
│   ├── lib/radio/                      # NOVO
│   │   ├── radioTypes.ts               # (do plan, definitivo)
│   │   ├── radioDirectory.ts           # (stub do plan)
│   │   ├── radioDirectory.radio-global.contract.test.ts # TRAVADO
│   │   ├── radioFavorites.ts           # (stub do plan)
│   │   ├── radioDb.ts · radioCache.ts · countryNames.ts · tvCountry.ts
│   ├── lib/i18n/messages/radio.ts      # NOVO (pt/en/es) + registro em pt/en/es.ts
│   └── styles/radio.css                # NOVO
├── vite.config.ts                      # ['route-radio', '/src/features/radio/RadioScreen.']
├── scripts/architecture-baseline.json  # só encolhe (--prune depois de T001)
└── e2e/radio-global.mjs                # NOVO; run.mjs registra; legibilidade-tv.mjs ganha a Rádio
CCPlayTv/tizen_web_project.yaml         # + assets/route-radio.js
```

**Structure Decision**: frontend `tv-web/` apenas. O `api/` congelado não entra (ADR-008/ADR-018 §7). Tudo de rádio em
`lib/radio/` (dados/rede) e `features/radio/` (tela). A integração toca navegação, `TopBar` e as telas que montam a
topbar.

## Complexity Tracking

> **Preencher SOMENTE se o Constitution Check tiver violações que precisam ser justificadas**

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| (nenhuma violação de princípio) | — | — |

O ⚠️ de licenças é risco aceito (R-001), não violação. Mover `AppShell`/`HintBar` (D-012) é refatoração para não violar
a catraca. A alternativa, uma exceção nova na baseline, também é permitida pelo CLAUDE.md, mas faria a catraca crescer.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (de `tv-web/`):

```powershell
npx vitest run <arquivo>          # o mais estreito primeiro
npx tsc -b
npm run lint
npm run test
npm run build
npm run build:tizen
node e2e/run.mjs --only radio-global,legibilidade-tv   # com npm run dev no ar
npm run test:e2e
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
- `tv-web/src/features/radio/RadioScreen.radio-global.contract.test.tsx` (4)
- `tv-web/src/lib/radio/radioDirectory.radio-global.contract.test.ts` (1)

Comando (de `tv-web/`): `npx vitest run src/features/radio/RadioScreen.radio-global.contract.test.tsx src/lib/radio/radioDirectory.radio-global.contract.test.ts`

Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 074-radio-global`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| consulta só o espelho descoberto com os parâmetros fixos, descarta estação inválida e trata resposta não-JSON como falha | FR-025/026/027, SC-006, ADR-018 §2/§3 | Fase 2 | `Error: not implemented` |
| abre no país da TV com as estações dele e OK toca a estação focada, mostrando-a em "Tocando agora" | US1-AC2/AC4, FR-008/011/012/013 | Fase 3 | `Unable to find an element with the text: Rádio Alfa BR` |
| mover o foco pela trilha de países não consulta o diretório nem toca nada | FR-007/012, SC-003, Constitution: Foco | Fase 3 | idem |
| a resposta atrasada de um país escolhido antes nunca substitui o país escolhido por último | FR-014, D-008 | Fase 3 | idem |
| favorito é guardado pela identidade da estação e, depois de reabrir, toca a versão atual do diretório | US2-AC1/AC3, FR-020/022/023, Constitution: Identidade | Fase 4 | idem |

Stubs criados pelo plan (ponto de partida do execute, não travados):
- `tv-web/src/lib/radio/radioTypes.ts` (definitivo);
- `tv-web/src/lib/radio/radioDirectory.ts` (interface + `RadioDirectoryError` prontos; `createRadioDirectory` lança);
- `tv-web/src/lib/radio/radioFavorites.ts` (tipo pronto; `listRadioFavorites` lança);
- `tv-web/src/features/radio/RadioScreen.tsx` (props prontas; renderiza `div` vazia);
- `tv-web/src/features/radio/radioSessionMemory.ts` (só `resetRadioSessionMemory`).

Fora dos contratos, com teste próprio do executor:
- restauração de foco por id (FR-003);
- estados focáveis (FR-004);
- paginação ←/→ (FR-006);
- nomes de país (FR-010);
- tempo limite e falha da barra (FR-017, D-015);
- Stop (FR-016) e parar ao desmontar (FR-015);
- clique só depois de `playing` (FR-019);
- cache/offline (US3);
- `TopBar` com e sem `onOpenRadio` (D-003);
- redutor `appNav` com `radio`.

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Setup (Fase 1) | Concluída: moldura em `components/`, rota/yaml, i18n `radio`, `radio.css`, reset no `setupTests` |
| Conector / dados (Fase 2) | Concluída: `radioDirectory`/`radioParse`, `radioDb`/`radioCache`, `radioFavorites`, `countryNames`/`tvCountry` |
| Tela e navegação (US1) | Concluída: Rádio na topbar (Início/Filmes/Séries/Busca/Configurações), tela com trilha, lista, barra, reprodução, memória |
| US2 / US3 | Concluídas: favoritos completos; cache vencido com "Tentar de novo" focável, erro sem cache, "Sem conexão" |
| Polish | Concluído: E2E `radio-global` + suíte 51/51 (3 após o R-012), legibilidade 105/0, `build:tizen` ok, TV física 10/10 com som, cerca de 2 s |
| Contratos | 5/5 verdes, trava íntegra |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Termos do Radio Browser: "free and non free software", sem licença de dados nomeada | Uso comercial futuro pode exigir revisão | Risco aceito pelo usuário (assessment, ADR-018). Revisitar antes de lançamento comercial. |
| R-002 | Chromium pode descartar `User-Agent` no `fetch` (regra do serviço pede um) | Desvio da etiqueta do serviço | Tenta enviar; aceito na ADR-018. Não é erro. |
| R-003 | Áudio no AVPlay só provado para o top 10 BR (spike). Opus/Vorbis, outros países e tempo até o som não medidos | SC-001/SC-004 podem falhar fora do topo | Resolvido: passada na TV física (T035) com 10/10 do topo BR com som e cerca de 2 s até o som. Opus/Vorbis e países fora do topo continuam sem medição dedicada. |
| R-004 | Testes/E2E que andam pela topbar por índice ou contagem de setas (`legibilidade-tv.mjs` `viaTopbar`, `HomeContent.test.tsx`, `SettingsScreen.test.tsx`, `VodCategoryScreen.test.tsx`, `TopBar.test.tsx`…) quebram com um item novo | Regressão aparente em suítes não travadas | D-003 limita aos que passam `onOpenRadio`. T011/T034 ajustam esses testes. Nenhum contrato travado conta setas na topbar (verificado no plan). |
| R-005 | Mover `AppShell`/`HintBar` toca 7 telas | Regressão de import | Mudança mecânica, só caminho (T001); `tsc -b` + suíte completa + `architecture.mjs --prune`. |
| R-006 | AVPlay declara `rendersOnHardwarePlane: true`; se algo ligar `video-plane-visible`, a tela some | Áudio sem tela | D-005: a Rádio nunca usa `useVideoPlane`/`PlayerLayer`. |
| R-007 | Serviço comunitário sem SLA; espelhos somem | Tela sem dados | Descoberta de espelho + redescoberta (logic/diretorio §2), cache (D-009), erro focável. |
| R-008 | A spec não pedia indicar o recorte "100 de N" (constitution exige) | Achado do Analyze | D-010 entra no plano. Sugerido acrescentar à spec (Analyze A-001). |
| R-009 | Rota lazy nova emite `route-radio.js` (e talvez chunks compartilhados novos) | `sync-tizen` para no guard | `vite.config.ts` + `tizen_web_project.yaml` (T002); conferir com `npm run build:tizen`. |
| R-010 | `useRemoteNav` troca os handlers num `useEffect` passivo: uma tecla logo depois de a lista aparecer via os handlers velhos (contrato 1 falhava sob carga) | Teclado agindo na tela anterior | Resolvido: `useRadioKeyboard` passa handlers estáveis que leem o modelo gravado em `useLayoutEffect`; segurar OK/amarela sempre definidos. O `useRemoteNav` compartilhado não foi alterado. |
| R-011 | `App.tsx` (593), `SearchScreen.tsx` (345) e `VodShowcaseScreen.tsx` (753) estavam no teto da catraca | Uma linha a mais reprova o lint | Resolvido: `TopbarDestination` alargou os callbacks existentes (zero linha no `App`); `renderRadioRoute` em `routeModules.ts`; Busca usa `HintItem` reexportado pelo `AppShell`; Filmes/Séries usam o spread `vodTopbarCallbacks` (teto baixou para 749). |
| R-012 | Fora da feature (achado na T032): no Windows o `legibilidade-tv.mjs` nunca subia o Vite comercial do portal, porque a URL vinha com cores ANSI. O gate tinha 1 achado fixo desde a 071 | Gate de legibilidade sempre vermelho nesta máquina | Resolvido com autorização do usuário: `NO_COLOR=1` no `spawn` (T037). Legibilidade 105 telas, 0 achados. |
| R-013 | Rota nova fez o Vite separar 5 chunks compartilhados novos (`I18nProvider`, `networkState`, `reconcileFocus`, `requestDeadline`, `useSectionAllHidden`) | `sync-tizen` parava no guard | Resolvido: listados no `CCPlayTv/tizen_web_project.yaml`; `npm run build:tizen` sincroniza. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-15 | Fase 1 (Setup) | T001–T005: AppShell/HintBar em `components/` (baseline 146→129), `route-radio`, i18n `radio`, `radio.css`, reset de memória | — |
| 2026-10-15 | Fase 2 (Foundational) | T006–T012: conector + normalização, banco/cache, favoritos, nomes de país/país da TV; contrato do conector verde; 22 testes | — |
| 2026-10-15 | Fase 3 (US1) | T013–T023: navegação/topbar sem estourar tetos (R-011), tela completa, handlers estáveis (R-010); 5/5 contratos; suíte 3411/3412 | Flake da bancada XMLTV (fora da feature) |
| 2026-10-15 | Fases 4–5 (US2, US3) | T024–T030: favoritos conferidos + plural; aviso de cache vencido focável; 8 testes novos; pasta da Rádio 24/24 | — |
| 2026-10-15 | Polish | T031–T034, T036, T037: E2E novo, legibilidade, build:tizen (R-013), `NO_COLOR` em 4 roteiros (R-012); tsc/lint ok; unitários 3419/3420 | T035 TV física adiada; flake da bancada XMLTV aguarda decisão |
| 2026-10-15 | T035 (TV física, 1ª passada) | Usuário, na TV de referência: a Rádio "funcionou bem". A foto mostra Brasil com "100 mais ouvidas de 1.832" e a barra tocando "Rádio Mix 106.3 FM · AAC+ · 64 kbps". Achado visual: logos pequenos, e o da linha focada ficava cortado (escala 1.06 do foco). Corrigido em `radio.css`: foco sem escala, folga do anel, um anel só e logo de 96 px (`--space-7`). Reinstalado; legibilidade pt 35/0 e `radio-global` verde | Confirmar o ajuste visual na TV. SC-001 (contagem X/10 com som) e SC-004 (tempo até o som) ainda não foram anotados por estação |
| 2026-10-15 | T035 (TV física, 2ª passada) | Usuário confirmou na TV de referência: logos maiores e inteiros no foco; **10/10** estações mais ouvidas do Brasil com som (SC-001, meta ≥ 8); **cerca de 2 s** do OK até o som (SC-004, meta ≤ 5 s; estimativa do usuário, não cronometrada por estação) | — |
| 2026-10-23 | Fechamento | T038–T041 da fase de convergência concluídas; status Convergida | — |

**PRÓXIMO**: `sdd-converge 074-radio-global`. Fora da feature, aguarda decisão: o flake da bancada XMLTV.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/e2e/radio-global.mjs`, `tv-web/e2e/lib/radioDirectoryMock.mjs`, `tv-web/e2e/legibilidade-tv.mjs`
- `CCPlayTv/tizen_web_project.yaml` (route-radio + 5 chunks)
- `tv-web/src/features/radio/`, `tv-web/src/lib/radio/` (código da feature)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `Intl.DisplayNames` traduz `ZZ` ("região desconhecida"); `countryNames.ts` trata à parte e usa `fallback: 'none'`.
- O `EntityTable` do Dexie não aceita união discriminada: `DirectoryCacheRecord` é um tipo só, com campos opcionais.
- Testes `.ts` com IndexedDB rodam no projeto `node` sem `TESTES_TS_COM_DOM`: `setupTests.node.ts` já carrega o `fake-indexeddb`.
- Teclado da Rádio: não voltar a passar closures direto ao `useRemoteNav` (R-010). Os handlers estáveis + `useLayoutEffect` são o que tira a corrida.
- `RadioScreen.test.tsx` limpa `radioDb.directoryCache`/`favorites` no `beforeEach`. O contrato travado não limpa e conta com o cache do BR entre os testes dele.

## Resultado Final

Fechada a pedido do usuário em 2026-10-23, que declarou ter testado tudo (inclusive na TV física); as tarefas que dependiam dessa validação foram marcadas como "validado pelo usuário" — relato, sem evidência anexada nesta sessão. Os riscos da tabela **não** foram reauditados um a um nesta passada; o que é bug daqui em diante entra como bug. Código novo: validação da entrada inicial em `useRadioCatalog.ts` (T038). Decisão aceita (T039): favicon lento não tem tempo limite. Contratos 5/5 e testes da Rádio (28) verdes.
