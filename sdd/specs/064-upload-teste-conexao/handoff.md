# Handoff — 064-upload-teste-conexao

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. Frontend `tv-web/` (React 19 + TS + Vite 8 + Dexie v17, vitest 5, oxlint, Playwright).
- Próximo comando: `/sdd-execute 064-upload-teste-conexao`.
- Backlog: **Planejada** (0/34 tasks).
- **Nada foi commitado**: as features 063 e 064, o ajuste ad-hoc do card (`IntegrationsPanel.tsx`/`IntegrationsTab.tsx`/`SettingsScreen.speedTestUltimo.test.tsx`) e o `CLAUDE.md` estão só no working tree. O `git status` terá muita coisa; só `tv-web/src/lib/network/`, `tv-web/src/features/settings/`, `tv-web/src/lib/i18n/messages/`, `tv-web/e2e/teste-conexao-tv.mjs` e `sdd/specs/064-…` são desta feature.
- Arquivos que mudaram em disco fora desta feature e precisam ser relidos antes de editar: `IntegrationsPanel.tsx` e `tabs/IntegrationsTab.tsx` (ajuste ad-hoc de 2026-10-07: o card mostra download/latência/jitter, e a última linha rola até o fim).

## O que a feature entrega

- **Fase 2 (bloqueante)**: o último resultado guarda o upload, e o resultado antigo continua legível com o upload "não medido".
- **US1 (P1)**: "Iniciar teste" mede latência, download e **upload** em sequência (60 s / 150 MB no total, 30 s / 75 MB por etapa), mostra a etapa e os MB enviados, e salva o resultado com as quatro métricas.
- **US2 (P2)**: o card de Configurações mostra o upload do último resultado; resultado antigo → "Não medido neste teste"; upload tentado sem amostra → "Amostra insuficiente".
- **Decisões do usuário que contrariam o óbvio**: a **Home não muda** (o dock continua só com o download); "completo" exige as **quatro** métricas; a TV física é **recomendação, não gate**.

## Leitura obrigatória, em ordem

1. `spec.md`: escopo, FR-001..018, SC-001..007 e as decisões do usuário em Clarifications.
2. `plan.md`: decisões invariantes D-001..D-010, riscos R-001..R-007 e a tabela dos contratos.
3. `tasks.md`: fases 1–5 (a ordem dentro da Fase 3 mantém o `tsc` verde).
4. `data-model.md`: campos novos, `valid`, normalização na leitura e a tabela de exibição.
5. `logic/upload.md`: composição, tetos, a etapa de upload em pseudocódigo, montagem do resultado e progresso.
6. `research.md`: destino verificado, por que compor e não reescrever, medição, payload.
7. `quickstart.md`: verificação manual e a recomendação da TV.
8. `sdd/specs/062-teste-conexao-tv/logic/medicao.md`: o algoritmo do download que o upload espelha.
9. `.planning/memory/constitution.md`.

## Testes de contrato

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/network/speedTestRepository.upload-teste-conexao.contract.test.ts` | 1 (U5) | Fase 2 |
| `tv-web/src/lib/network/connectionTest.upload-teste-conexao.contract.test.ts` | 4 (U1–U4) | Fase 3 (US1) |

- Rodar (em `tv-web/`): `npx vitest run src/lib/network/connectionTest.upload-teste-conexao.contract.test.ts src/lib/network/speedTestRepository.upload-teste-conexao.contract.test.ts`
- Integridade (na raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 064-upload-teste-conexao`
- Vermelho confirmado em 07/10: U1–U4 por `Error: not implemented` e U5 por asserção (hoje `clean` descarta os campos de upload).
- **Provado satisfazível**: um protótipo descartável (fora do repositório) fez passar os 5 contratos, os 5 da 062 e 128 testes da área. A forma do protótipo está descrita em `logic/upload.md`; **não o procure no repositório**.
- **Travas de outras features que esta toca: `062-teste-conexao-tv`** (5 testes: `speedTest`, `speedTestRepository`, `SpeedTestDialog`). Têm de continuar verdes **sem edição**: elas fixam `runSpeedTest` (12 GETs, `complete` com 3 métricas, 100 MB). Rodar também a `063` (catraca).

## Stubs criados

- `tv-web/src/lib/network/connectionTest.ts`: `UPLOAD_DESTINATION`, `CONNECTION_TEST_MAX_BYTES/MS` e `PHASE_MAX_BYTES/MS` são definitivos; `runConnectionTest` lança `not implemented`.
- `tv-web/src/lib/network/speedTest.ts`: os campos opcionais `uploadMbps/uploadSamples/uploadRequestedBytes/uploadSentBytes` e a opção `limits` existem **só como tipo**; a T021 faz `runSpeedTest` honrá-la. A etapa `'upload'` e `sentBytes` de `SpeedTestProgress` **ainda não existem**: entram na T025 junto com o diálogo, senão o `tsc` quebra no mapa `stageKey`.

## Armadilhas já mapeadas

- **Não edite `runSpeedTest` além de `limits`.** Os contratos C1–C3 da 062 o prendem; o upload é uma etapa de `runConnectionTest` (D-001/D-002).
- **`messages/settings.ts` está no teto exato da catraca (482 linhas).** Qualquer linha a mais reprova o `npm run lint`. Por isso as chaves novas vão para `messages/speed.ts` e o texto de `settings.speed.limits` muda **na mesma linha**. Registre a área em `pt.ts`, `en.ts`, `es.ts` **e** em `AREAS` de `areas.test.ts` (o teste de chaves únicas só vê o que está lá).
- **`SpeedTestDialog.tsx` indexa `stageKey` pela etapa do progresso**: adicionar `'upload'` ao tipo sem a entrada no mapa quebra o `tsc` (T025 faz as duas juntas).
- **Upload `undefined` ≠ `null`.** `undefined` = resultado antigo ("não medido"); `null` = tentado sem amostra. `clean` só grava os campos de upload quando `uploadMbps !== undefined`, para o resultado antigo continuar idêntico ao gravado (o contrato C4 da 062 compara com `toEqual`).
- **O POST não leva headers** (requisição simples, sem preflight), sem query e com `credentials: 'omit'`. O corpo é `Uint8Array`, nunca string.
- **Reservar antes, nunca devolver**: o corpo conta em `uploadRequestedBytes` assim que o POST é pedido, mesmo se falhar ou abortar.
- **Falha do upload nunca é `failed`.** `failed` só existe quando a **primeira** etapa não mediu nada, e então não se tenta upload (U3 confere que não há POST).
- **A flag de exclusão de `runConnectionTest` é separada do `running` de `runSpeedTest`**: entre as duas etapas o segundo fica livre por um instante.
- **E2E `teste-conexao-tv.mjs`**: o stub lê `Number(searchParams.get('bytes'))`, que vira `NaN` no `POST …/__up`; ele também afirma `method === 'GET'` em todas as chamadas. Atualizar na T027 e repetir 10×. Ele já teve flakes de `scrollTop` (1 px), já corrigidos em `IntegrationsTab.tsx`: se voltarem, **não** use `scroll-padding` (reintroduz o ajuste de 1 px por causa do `scale(1.06)` do foco).
- **No PowerShell, `npm run x -- --flag` perde o `--`**: use `node e2e/run.mjs --only teste-conexao-tv --jobs 1`.
- **Nunca suba o dev server por conta própria se a memória estiver baixa**: a máquina já matou o servidor por isso nesta sessão. Peça ao usuário.
- **Catraca**: arquivos novos ≤ 300 linhas; `SpeedTestMetrics.tsx` não importa de `features/` de outra feature.

## Pendências do Analyze

- **A1 (MEDIUM)**: a spec (FR-004) diz que o teto novo "substitui" os 30 s / 100 MB da 062. O plano o aplica ao **teste inteiro**, e `SPEED_TEST_MAX_*` ficam como padrão de `runSpeedTest` isolado, que o app não usa sozinho, porque editar isso exigiria emendar a trava da 062 (R-004). Recomendação: seguir assim; se alguém quiser a leitura literal, é uma emenda de contrato da 062 com aprovação do usuário.
- **A2 (LOW)**: a US2 (P2) não tem teste de contrato (o orçamento de 5 acabou nos casos de motor e persistência, que são os de risco). Cobertura: testes da fase, E2E e T032 visual. Recomendação: aceitar.
- **A3 (LOW)**: `reason` do resultado é o da **primeira** etapa que não terminou normalmente; a spec não define isso. Está em `data-model.md`. Recomendação: aceitar e conferir na tela que a mensagem faz sentido quando o download passa do limite e o upload termina bem.

## Gate de pronto

- 5/5 contratos verdes e travas íntegras (desta, da 062 e da 063).
- `npx tsc -b`, `npm run lint` (catraca), `npm run test`, `npm run build`.
- `npm run test:e2e` com `npm run dev` rodando (peça autorização antes de subir o servidor).
- `quickstart.md` §1–§3; revisão de segredos (T052); nota na 062 (T055).
- TV física: **recomendação, não gate** (R-001).
