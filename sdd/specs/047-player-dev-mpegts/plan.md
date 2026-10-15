# Implementation Plan: Reprodução de canais ao vivo MPEG-TS no navegador do dev

**Slug**: `047-player-dev-mpegts` | **Date**: 2026-10-02 | **Spec**: `sdd/specs/047-player-dev-mpegts/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

No `npm run dev` o `<video>` do Chromium recusa MPEG-TS (`error.code = 4`, hoje `PLAY-04`). A feature faz o `htmlVideoAdapter` tentar **primeiro o caminho de hoje** e, **só se** o elemento recusar uma URL `.ts` com `MEDIA_ERR_SRC_NOT_SUPPORTED`, assumir o mesmo `<video>` com um demux em JavaScript (`mpegts.js`, `devDependency`, carregada por `import()` dinâmico atrás de `import.meta.env.DEV` e de `MediaSource`). Falha do demux vira o mesmo `{ code: null }` → `PLAY-04`. Produção e TV nunca carregam a biblioteca; um script de verificação do build garante isso. A primeira entrega é um **spike** com a lista real que decide seguir ou parar (FR-001/FR-002).

## Technical Context

**Language/Version**: TypeScript ~6.0 (React 19, Vite 8), alvo de build `chrome108`

**Primary Dependencies**: `mpegts.js` ^1.8.2 (Apache-2.0; ESM/UMD + `d.ts`, ~2,1 MB desempacotado) — **apenas `devDependencies`**; nenhuma dependência de produção nova

**Storage**: N/A (nenhum dado persistido)

**Testing**: Vitest + jsdom (unitário/contrato), Playwright em Node (`e2e/*.mjs`, `npm run test:e2e` via `e2e/run.mjs`), `ffmpeg` local só para gerar a fixture `.ts` uma vez

**Target Platform**: navegador de desenvolvimento (Chromium). A TV (AVPlay) **não** é afetada

**Performance Goals**: canal `.ts` decodificável chega a `playing` em ≤ 15 s (SC-002); sem conexão residual após trocar de canal (SC-003)

**Constraints**: biblioteca fora do bundle de produção/Tizen e da lista de `tizen_web_project.yaml`; nenhum segredo em log/UI; Playwright baixa um Chromium que **pode não ter H.264/AAC** (R-002); contrato `PlayerAdapter` intacto

**Scale/Scope**: 1 módulo novo (`devDemux.ts`), 1 adaptador alterado, 1 script de verificação de build, 2 scripts E2E, 1 spike

## Decisões Invariantes

- **D-001 — Nativo primeiro, demux só como fallback.** O `<video>` sempre tenta a URL como hoje. O demux só entra se o evento `error` trouxer `video.error.code === 4` **e** a URL terminar em `.ts` (ignorando query) **e** houver demux disponível **e** ainda não se tentou nesta abertura. Tudo que toca hoje continua tocando pelo mesmo caminho; só caminhos que hoje falham mudam (e falham no mesmo `PLAY-04`).
- **D-002 — Uma tentativa por `open()`.** Falha do demux → exatamente um `onError({ code: null })`; nunca um segundo demux nem laço.
- **D-003 — Só dev, decidido por duas travas.** `defaultDemuxStarter()` devolve `null` quando `import.meta.env.DEV` é falso ou `MediaSource` não existe; o `import('mpegts.js')` fica **dentro** dessa guarda, para o bundler de produção eliminá-lo.
- **D-004 — `mpegts.js` é `devDependency`**, nunca `dependencies`.
- **D-005 — Contrato do player inalterado.** `PlayerAdapter`, `EngineCapabilities` e a UI não mudam; `startDemux` é uma opção só do `createHtmlVideoAdapter` (injeção para teste e para desligar).
- **D-006 — Segredo.** O demux nunca repassa o erro bruto da biblioteca nem a URL; o log da biblioteca é desligado ao carregá-la (R-003).
- **D-007 — O spike é porta de saída.** Nenhuma task das histórias 2–4 começa antes de `spike.md` registrar "seguir" (FR-002). Se registrar "parar", a feature termina com o motivo escrito.
- **D-008 — Sem verde falso no E2E.** Se o navegador do E2E não decodifica H.264/AAC, o cenário do `test:e2e` imprime `PULADO` com o motivo e sai com sucesso **explicitamente rotulado**; nunca finge ter provado a reprodução (R-002).
- **D-009 — `optimizeDeps.include: ['mpegts.js']`** no `vite.config.ts`, para o Vite não recarregar a página no meio da reprodução ao descobrir a dependência tardiamente.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.* A constituição deste projeto (v1.7.0) tem 13 princípios; os que a feature não toca estão marcados N/A com o motivo.

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | Nenhuma conta nova. |
| Segredos Fora dos Clientes e dos Logs | Atenção | OK | A URL com credencial passa à biblioteca só no dev e só para o próprio host do provedor (Direct Play). D-006: erro bruto nunca repassado, log da lib desligado, teste C3 prova que nada com host/credencial chega a `onError`. Script real imprime só estados e contagens. |
| Categorias da Fonte São Preservadas | N/A | N/A | Não toca catálogo. |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede, Backend ou IA | N/A | N/A | — |
| Trailers e Metadados Não Alteram o Estado Principal | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | N/A | N/A | Nenhuma ação nova de UI. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | OK | OK | A tela de erro (`PLAY-04` com "Tentar de novo"/"Info técnica"/"Voltar") não muda; falha de carga da biblioteca cai nela (spec, edge case). |
| Voltar Restaura Foco e Posição | N/A | N/A | — |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | A URL só é lida para decidir `.ts`; nenhuma chave nova a usa. |
| Progresso e Capacidades São Reais, Nunca Prometidos | OK | OK | Capacidades do adaptador inalteradas (D-005); o live continua sem seek porque `mediaCapabilities('live')` as intersecta. FR-011: nada declara a reprodução em dev como prova da TV. |
| Documentação do Repositório É Canônica | Atenção | OK | Polish atualiza o cabeçalho de `htmlVideoAdapter.ts`, `CLAUDE.md` e o backlog; nenhuma emenda de ADR (ADR-006: "bibliotecas de desenvolvimento não devem inflar o pacote Tizen" — D-003/FR-007 cumprem). |

Restrições do Projeto relevantes: Direct Play (nada de proxy/transcode — o dev lê o stream direto do provedor, CORS liberado, medido); "Validação em hardware real" (esta feature **não** pede passada na TV e **não** prova AVPlay); licença Apache-2.0 observada; E2E (Playwright) obrigatório antes de pedir TV física.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/047-player-dev-mpegts/
├── spec.md
├── plan.md
├── research.md
├── logic/fallback-demux.md
├── quickstart.md
├── tasks.md
├── contract-tests.lock
├── handoff.md
├── baseline.md      # criado pelo execute (T001): arquivos emitidos antes da feature
└── spike.md         # criado pelo execute (T005): resultado do spike + decisão seguir/parar
```

### Source Code (repository root)

```text
tv-web/
├── package.json                      # +devDependency mpegts.js; build/build:tizen chamam o verificador
├── vite.config.ts                    # +optimizeDeps.include ['mpegts.js'] (D-009)
├── scripts/
│   └── check-no-demux-in-build.mjs   # NOVO — falha se dist/ contém a lib de demux
├── src/lib/player/
│   ├── devDemux.ts                   # NOVO (stub do plan) — decisão + starter dinâmico
│   ├── htmlVideoAdapter.ts           # fallback de demux (opção `startDemux`, stub do plan já aceita)
│   ├── devDemux.player-dev-mpegts.contract.test.ts          # TRAVADO
│   └── htmlVideoAdapter.player-dev-mpegts.contract.test.ts  # TRAVADO
└── e2e/
    ├── spike-mpegts-real.mjs         # NOVO — spike (US1), fora do test:e2e
    ├── player-dev-mpegts.mjs         # NOVO — servidor local de .ts, dentro do test:e2e
    ├── player-dev-mpegts-real.mjs    # NOVO — lista real, fora do test:e2e
    ├── fixtures/canal-teste.mpegts       # NOVO — ~30 s H.264+AAC gerado com ffmpeg
    └── run.mjs                       # +player-dev-mpegts.mjs na SUITE
```

**Structure Decision**: tudo no `tv-web/` (frontend). Nada em `api/`, `CCPlayTv/` nem `tizen-app/`. O adaptador existente ganha o fallback; a lógica pura e o carregamento dinâmico ficam num módulo próprio (`devDemux.ts`) para o contrato testar sem biblioteca real.

## Complexity Tracking

> Sem violações da constituição a justificar.

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |
| — | — | — |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso).

Comandos-base (em `tv-web/`):

```powershell
npm run lint
npx tsc --noEmit
npm test
npm run build            # inclui o verificador de bundle (T013)
npm run dev              # em outro terminal, antes do E2E
npm run test:e2e
```

O `test:e2e` roda com o dev server novo (reinicie-o: um servidor aberto há horas já deixou a suíte instável).

### Testes de Contrato

4 testes (de 5), travados em `contract-tests.lock`:
`tv-web/src/lib/player/devDemux.player-dev-mpegts.contract.test.ts` (1) e `tv-web/src/lib/player/htmlVideoAdapter.player-dev-mpegts.contract.test.ts` (3).

Comando: `cd tv-web; npx vitest run src/lib/player/devDemux.player-dev-mpegts.contract.test.ts src/lib/player/htmlVideoAdapter.player-dev-mpegts.contract.test.ts`

Integridade: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 047-player-dev-mpegts`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| só autoriza o fallback para .ts com erro 4, disponível e sem tentativa anterior | FR-003, FR-006, FR-008, FR-009 | Fase 4 (US2) | `Error: not implemented` (`shouldFallbackToDemux`) |
| em .ts recusado pelo `<video>`, inicia o demux sobre o mesmo elemento e ainda não reporta erro | US2/AC1, FR-003, FR-004 | Fase 4 (US2) | `expected "vi.fn()" to be called 1 times, but got 0 times` |
| quando o demux falha, reporta uma única falha genérica (code null) sem URL nem credencial | US2/AC4, FR-006, FR-010, Constitution: Segredos | Fase 4 (US2) | `expected "vi.fn()" to be called 1 times, but got 2 times` (hoje o erro nativo é repassado e há dois) |
| close() destrói o demux, inclusive o que termina de anexar depois do close, sem callbacks tardios | US2/AC2-AC3, FR-005, SC-003 | Fase 4 (US2) | `expected "vi.fn()" to be called 1 times, but got 0 times` |

Fora do contrato, por orçamento ou por natureza: US3 (build sem a lib — vira o script `check-no-demux-in-build.mjs`, que roda no `npm run build`), US4 (E2E), e tudo que depende de codec/navegador real (spike, `quickstart.md`).

Stubs criados pelo plan (ponto de partida do execute, **não** travados): `tv-web/src/lib/player/devDemux.ts` (tipos prontos; `shouldFallbackToDemux` e `defaultDemuxStarter` lançam `not implemented`) e, em `tv-web/src/lib/player/htmlVideoAdapter.ts`, o parâmetro `_options?: HtmlVideoAdapterOptions` (aceito e ainda ignorado).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Todas as fases (1, 3, 4, 5, 6, Polish) | **Concluídas em 2026-10-02**; 35/35 tasks. A Fase 2 não tinha tasks. |
| US1 — spike | SEGUIR: 9/10 canais reais decodificam vídeo+áudio (`spike.md`); o Chromium do Playwright decodifica H.264/AAC. |
| US2 — canal no dev | `devDemux.ts` + fallback no `htmlVideoAdapter.ts` (nativo primeiro) + `optimizeDeps`. Provado em Chromium: E2E com stream local (10 trocas, 0 conexões residuais após fechar) e script real (4,7 s até tocar; 10/10 trocas tocaram). |
| US3 — produção intacta | `check-no-demux-in-build.mjs` no `build`/`build:tizen`: mesmos 16 arquivos da linha de base, +641 bytes só em `index.js`, nada novo para o yaml da TV (SC-004). |
| US4 — prova automatizada | `e2e/player-dev-mpegts.mjs` na `SUITE`; `npm run test:e2e` ×3 → 27/27 scripts em todas; `e2e/player-dev-mpegts-real.mjs` fora da suíte. |
| Contratos | 4/4 verdes; trava íntegra (e as 29 travas do repositório). |
| Gates | `npx tsc --noEmit` exit 0; `npx oxlint` exit 0; `npm test` 335 arquivos / 2406 testes verdes; `npm run build` exit 0 com o verificador. |
| Fase 8 (convergência) | **Concluída em 2026-10-02**; 38/38 tasks. T026: canal inválido → `PLAY-04` com ação focável, 0 conexões residuais. T027: queda do stream → reconexão da 042 e volta a tocar. T028: mutação real prova que o verificador derruba o build quando a lib vaza. |
| Gate E2E da Fase 8 | `npm run test:e2e` ×3 no código commitado (HEAD `2b980ae` + script atualizado): 27/27 nas 3 execuções. Na árvore de trabalho atual há falhas em `live-tv-ds-v14`, `epg-dados-agora` e `busca-por-categoria` (passam no HEAD): vêm da reforma da Live ainda não commitada, não da 047. |
| Bug fora do escopo | Item 67 do backlog (R-009): `lastGoodChannelRef` nunca zerado em `useLiveZapping.ts`; logado por decisão do usuário. |
| Fora do que foi provado | AVPlay, codec e desempenho da TV (FR-011); HEVC/AC3 reais (o canal inválido usa bytes inválidos como proxy; amostra de 10 canais não exclui HEVC/AC3); a queda repetida até o erro da 042; passada na TV física não foi feita e não é gate. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Codec dos canais reais (HEVC/AC3) pode não decodificar no Chromium. | Alto — invalida a feature. | Resolvido: spike de 2026-10-02 — 9 de 10 canais amostrados (de 2360) decodificam vídeo+áudio, mediana ≈ 3 s até tocar (`spike.md`); decisão SEGUIR. Resíduo: a amostra não exclui canais HEVC/AC3 em outras partes da lista (limite aceito pela spec). |
| R-002 | O Chromium baixado pelo Playwright pode não ter H.264/AAC, e a fixture do E2E precisa deles. | Médio — o cenário do `test:e2e` não provaria nada. | Resolvido: o Chromium do Playwright decodifica H.264+AAC (`isTypeSupported` verdadeiro, `spike.md`). D-008 (PULADO explícito) fica como rede de segurança para outra máquina. |
| R-003 | A biblioteca pode registrar a URL (com credencial) no console. | Alto — viola Segredos. | Resolvido: log desligado ao carregar (`LoggingControl.applyConfig`, D-006, API confirmada nos tipos 1.8.2; teste unitário). O E2E prova que o console da página recebe 0 linhas com o host ou o caminho do stream. |
| R-004 | O Vite pode recarregar a página ao descobrir `mpegts.js` por `import()` tardio. | Médio — reinicia a reprodução. | Resolvido: `optimizeDeps.include` (D-009); o E2E marca `window` antes de tocar e confirma que a marca sobrevive (sem reload). Não foi medido o cenário sem a opção. |
| R-005 | O verificador de bundle pode dar falso negativo (nome minificado). | Médio. | Resolvido: marcadores medidos na lib minificada (`FetchStreamLoader`, `MSEController`, `TSDemuxer`, `enableStashBuffer`, `liveBufferLatencyChasing`), 3 testes com pastas sintéticas e, na convergência (T028), uma mutação real: removida a guarda `import.meta.env.DEV` de `devDemux.ts`, o `npm run build` falhou (exit 1) listando `assets/mpegts.js` e os 5 marcadores; revertido (SHA-256 idêntico) e build verde de novo. |
| R-006 | A suíte E2E existente serve conteúdo falso em URLs `.ts` (várias fixtures); o fallback pode mudar tempos desses scripts. | Médio. | Resolvido: D-001 (nativo primeiro); `npm run test:e2e` ×3 → 27/27 scripts em todas as execuções, nenhuma asserção alheia editada. |
| R-007 | Fixture binária com extensão `.ts` (`canal-teste.ts`) era lida pelo `oxlint` como TypeScript e fazia `npm run lint` sair com erro (`stream did not contain valid UTF-8`). | Médio — gate de lint quebrado por esta feature. | Resolvido: renomeada para `e2e/fixtures/canal-teste.mpegts` (o servidor do E2E a entrega em `/live/u/p/<id>.ts`); `npx oxlint` voltou a exit 0. Achado ao rodar o lint completo no Polish. |
| R-009 | Achado fora do escopo durante a Fase 8: `lastGoodChannelRef` (`useLiveZapping.ts`, features 016/027) nunca é zerado ao fechar o player nem ao abrir canal novo; depois de zapear, um canal que falha reverte para o anterior em vez de mostrar o erro (com o aviso "Voltando para Canal 2"). Independente do motor (o erro nativo faz o mesmo). | Médio — comportamento errado visível ao usuário na Live TV, não causado pela 047. | Decisão do usuário (2026-10-02): **logar e seguir** — item 67 de `.planning/backlog.md`, para `sdd-bugfix`. Na 047, o cenário T026 roda antes das 10 trocas de canal do E2E; essa ordem é intencional até o bugfix. `useLiveZapping.ts` tinha mudanças não commitadas da 046 na data do achado. |
| R-008 | O tempo até tocar no E2E depende do ritmo do servidor falso: com rajada inicial de 150 KB levou ~14 s (a lib espera ~384 KB), com ~420 KB leva 7–10 s (10,4 s com a suíte unitária rodando junto). | Baixo — o limite do teste era 15 s. | Resolvido: rajada de ~420 KB no teste (nada mudou no app); com a lista real são 4,7 s. Numa rodada saturada (suíte em 618 s) o canal 5 passou de 15 s e o T027 falhou; o limite do script subiu para 30 s (`START_BUDGET_MS`); o SC-002 (15 s) é medido pelo script real, não por este. Se voltar a ser flake, subir a rajada, não mexer no app. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-02 | Fase 1 (Setup) | Linha de base do build (16 arquivos) e `mpegts.js@1.8.2` como devDependency. | Spike (T003–T005) decide seguir ou parar. |
| 2026-10-02 | Fase 3 (US1, spike) | Spike com a lista real: 9/10 canais decodificam vídeo+áudio; Chromium do Playwright decodifica H.264/AAC. Decisão SEGUIR. R-001/R-002 resolvidos. | — |
| 2026-10-02 | Fase 4 (US2) | `devDemux.ts` + fallback no adaptador (nativo primeiro); contratos 4/4 verdes; +7 testes unitários. | Prova em Chromium real (Fase 6). |
| 2026-10-02 | Fase 5 (US3) | `check-no-demux-in-build.mjs` no `build`/`build:tizen`; build limpo, mesmos 16 arquivos. | Prova do fallback em Chromium real (Fase 6). |
| 2026-10-02 | Fase 6 (US4) | Fixture `.ts`, `player-dev-mpegts.mjs` (na `SUITE`) e `player-dev-mpegts-real.mjs`; `test:e2e` ×3 = 27/27; script real: 4,7 s e 10/10 trocas. | — |
| 2026-10-02 | Polish | `npm test` 2406/2406, `tsc`/`oxlint`/`build` limpos; lint quebrado pela fixture `.ts` achado e corrigido (R-007); `CLAUDE.md` com uma cláusula permanente. | `sdd-converge`. |
| 2026-10-02 | Fase 8 (convergência) | T026/T027 (dois cenários no E2E), T028 (mutação do verificador). Achado e logado o bug do item 67 (R-009); T026 roda antes do zapping. Gate ×3 no HEAD 27/27. | Falhas da Live na árvore atual são de outra reforma não commitada. |

**PRÓXIMO**: rodar `/sdd-converge 047-player-dev-mpegts` (não há tasks abertas).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/player/devDemux.ts`, `htmlVideoAdapter.ts` (+ testes `devDemux.test.ts`, `htmlVideoAdapter.demux.test.ts`; contratos `*.player-dev-mpegts.contract.test.ts`, travados)
- `tv-web/vite.config.ts` (`optimizeDeps`), `tv-web/package.json` (+`mpegts.js`, `build`/`build:tizen`/`test:e2e:serial`)
- `tv-web/scripts/check-no-demux-in-build.mjs` (+ teste), `tv-web/scripts/spikeSummary.mjs` (+ teste)
- `tv-web/e2e/player-dev-mpegts.mjs`, `player-dev-mpegts-real.mjs`, `spike-mpegts-real.mjs`, `fixtures/canal-teste.mpegts`, `run.mjs` (+1 na `SUITE`)
- `sdd/specs/047-player-dev-mpegts/{baseline,spike}.md`; `CLAUDE.md` (uma cláusula)

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- **Ordem dos cenários de `e2e/player-dev-mpegts.mjs` é intencional:** o do canal inválido (T026) roda **antes** do zapping por causa do bug do item 67 (R-009); não mova para depois das trocas até o bugfix. O cenário do canal 5 (T027) fica depois do RETURN e depende do foco voltar ao Canal 1 (quatro `ArrowDown`).
- **Nunca dar extensão `.ts` a um arquivo binário** dentro do repositório: `oxlint` o lê como TypeScript e o lint sai com erro (R-007). A fixture é `canal-teste.mpegts`.
- **Não edite arquivos sob `tv-web/src` enquanto o `test:e2e` roda** contra `npm run dev`: o HMR recarrega a página no meio dos scripts.
- A rajada inicial do servidor falso do E2E (~420 KB) existe porque a lib só toca depois de ~384 KB de buffer; diminuí-la volta a medir o servidor, não o app (R-008).
- `npm install` pode remover pacotes "extraneous" fora do lockfile; conferir que `playwright` continua instalado (os `e2e/*.mjs` importam `playwright`, não `@playwright/test`).
- O `build:tizen` **não** foi rodado nesta feature (reescreve `CCPlayTv/`); o `build` e o verificador cobrem SC-004.
- Em dev, escrever docs com PowerShell: aspas duplas consomem backticks (`` `npx `` vira quebra de linha); prefira a ferramenta Edit ou here-string de aspas simples.

## Resultado Final

**Convergida em 2026-10-02** (`sdd-converge`, 2ª passada; a 1ª achou 3 lacunas, cobertas pela Fase 8). 38/38 tasks, contratos 4/4 verdes e trava íntegra.

**O que foi construído.** No `npm run dev`, um canal ao vivo `.ts` que o `<video>` do Chromium recusa (`error.code 4`) passa a ser demultiplexado em JavaScript pela `mpegts.js` sobre o mesmo elemento, para testar zapping/chrome/guia/reconexão com vídeo real. O caminho nativo vem sempre primeiro (D-001): só muda o que hoje já falhava com `PLAY-04`, e continua falhando no mesmo `PLAY-04` (erro bruto da lib e URL nunca repassados). Peças: `lib/player/devDemux.ts` (decisão pura + carregamento dinâmico atrás de `import.meta.env.DEV` e `MediaSource`), fallback em `lib/player/htmlVideoAdapter.ts` (opção `startDemux`; contrato `PlayerAdapter` e `avplayAdapter.ts` intactos), `optimizeDeps.include` no `vite.config.ts`, `mpegts.js@1.8.2` só em `devDependencies`, e `scripts/check-no-demux-in-build.mjs` encadeado em `build`/`build:tizen`.

**Provado.** Spike com a lista real: 9 de 10 canais decodificam vídeo+áudio; script real: 4,7 s até tocar e 10/10 trocas com no máximo 1 conexão aberta e 0 depois de fechar; E2E local (`player-dev-mpegts.mjs`, na `SUITE`): toca, 10 trocas, RETURN, canal inválido → `PLAY-04` com ação focável, queda do stream → reconexão da 042, sem reload e sem a URL no console; build com os mesmos 16 arquivos da linha de base e verificador provado por mutação real (sem a guarda, o build falha apontando `assets/mpegts.js`); `npm test` 2406/2406; gate `npm run test:e2e` ×3 no código commitado: 27/27 nas três.

**Não provado (limites aceitos).** AVPlay, codec e desempenho da TV (FR-011; a passada na TV não foi feita e não é gate); HEVC/AC3 reais (o canal inválido usa bytes inválidos como proxy; a amostra de 10 canais não os exclui); a queda repetida até o erro da 042 (~50 s, contrato da própria 042).

**Desvios em relação ao plano original.**
- Nativo primeiro em vez de demux direto (já era D-001; descoberto na exploração porque ~16 scripts E2E usam URLs `.ts` com conteúdo falso).
- T006 em `tv-web/scripts/` e T016 em `.test.mjs` (só o projeto `node` do Vitest enxerga `scripts/**/*.test.mjs`).
- A fixture binária virou `canal-teste.mpegts`: com extensão `.ts` o `oxlint` a lia como TypeScript e o lint saía com erro (R-007).
- A rajada inicial do servidor falso do E2E (~420 KB) e o limite do script em 30 s (R-008): o app não mudou; o SC-002 (15 s) é medido pelo script real.
- O cenário do canal inválido roda antes do zapping no E2E por causa de um bug pré-existente fora do escopo (R-009, item 67 do backlog, decisão do usuário: logar e seguir).
- Pós-convergência, na árvore de trabalho atual, `live-tv-ds-v14`, `epg-dados-agora` e `busca-por-categoria` falham (passam no HEAD, também isolados): vêm da reforma da Live da feature 048 ainda não commitada, não desta feature.

**Ainda aberto.** R-009 / item 67 do backlog (`lastGoodChannelRef` em `useLiveZapping.ts`): não é da 047 e segue para `sdd-bugfix`. Documentação sincronizada nesta convergência: `README.md` (seção Frontend: uma nota sobre a demux só em dev) e `.planning/backlog.md` (removida a entrada obsoleta "Adiada" da 047 em Ideias Futuras).