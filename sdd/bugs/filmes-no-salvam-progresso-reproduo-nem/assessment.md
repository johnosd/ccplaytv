# Bug Assessment: Filmes não salvam o progresso nem marcam como assistido

- **Slug**: filmes-no-salvam-progresso-reproduo-nem
- **Criado**: 2026-10-10
- **Origem**: texto colado (relato do usuário, na TV)
- **Veredito**: likely valid, needs reproduction
- **Severidade**: high

## Report

> Filmes não estão salvando progresso. Estava assistindo um filme e saí; tinha assistido 28:00 minutos e, quando reabri, ele iniciou do começo (00:00). O esperado era ter salvo onde parei, para continuar dali. Filmes assistidos também não estão sendo marcados corretamente como assistidos.

## Symptom

Observado: depois de assistir ~28 min e sair, o filme recomeça do 00:00 (sem "Continuar") e, ao ser assistido, o filme não aparece como assistido. Esperado: a posição fica salva e o filme concluído (≥ 90%) é marcado como assistido.

## Reproduction

1. Abrir um filme na TV física, assistir ~28 min e sair (RETURN).
2. Reabrir o detalhe do filme: sem "Continuar", só "Assistir" do começo.
3. Assistir um filme até o fim: não aparece marcado como assistido.

Contraprova no ambiente de desenvolvimento (Chromium, motor `<video>`): **não reproduz** — o E2E `historico-continuar-assistindo` e a suíte inteira (527 arquivos / 3164 testes unitários; 45 roteiros E2E) passam, e os testes do gravador cobrem gravar, retomar, concluir.

[NEEDS CLARIFICATION: a lista é Xtream ou M3U? Como saiu — RETURN no controle, botão Home, ou deixou o filme parar sozinho?]
[NEEDS CLARIFICATION: o app instalado na TV é de antes ou depois da 067 (Dexie v21)? Em outros itens a TV segue gravando (favoritos, "Continuar assistindo" de série)?]
[NEEDS CLARIFICATION: o "Continuar assistindo" do Início mostra esse filme? E um filme curto assistido até o fim ficou marcado?]

## Suspected Code Paths

- `tv-web/src/lib/player/progressRecorder.ts:99-102,113-129` — `onProgress` chama `void apply(...)` e `onExit` aguarda `apply`, sem **nenhum** `catch`: se a gravação em `userStates` falhar (cota, transação abortada, banco bloqueado), a exceção some em silêncio (promessa rejeitada sem tratamento) e o usuário só percebe depois. Cobre **os dois sintomas** de uma vez: progresso (`updateProgress`) e conclusão (`markCompleted`) passam pelo mesmo `upsert`.
- `tv-web/src/lib/catalog/userStateRepository.ts:221-240` — `upsert` faz `get`+`put` numa transação em `userStates` e depois `invalidateSeriesWatchForStableId`; qualquer rejeição propaga ao gravador, que a descarta.
- `tv-web/src/components/player/usePlayerSession.ts:215` — o `teardown` chama `recorderRef.current?.onExit('close')` **sem aguardar**, e `MovieDetailScreen.tsx:649-657` invalida `['user-state', stableId]` no `onClose`, antes de a escrita terminar: o detalhe pode reler o estado antigo (mesma corrida já corrigida só para o caminho de conclusão na feature 019, T023).
- `tv-web/src/lib/player/PlayerService.ts:654-659` — `applyProgress`/`emit` alimentam `session.progress`; no motor AVPlay (TV) a cadência/valores de posição e duração não são observáveis daqui.

Descartados com evidência: a identidade (`stableIdOf` x `MovieDetailScreen.computeIdentity` usam os mesmos campos), a regra do gravador (limiar inicial, intervalo de 5 s, 90% de conclusão — testes unitários e E2E verdes) e as features 066/067 (nenhuma toca `userStates`).

## Root Cause Hypothesis

**Confiança: low.** O defeito é específico da TV física (o navegador não reproduz) e a causa observável mais consistente com **ambos** os sintomas é uma falha de **escrita em `userStates`** descartada em silêncio — mesmo padrão do bug `teste-conexo-armazenamento-indisponvel-tv` (2026-10-07), em que a TV real também falhava ao gravar numa tabela do IndexedDB sem causa conhecida, a contraprova em Chromium não reproduziu, e a decisão foi instrumentar antes de corrigir. O commit `01cf34d` (série) também já trata a escrita da conclusão como podendo "falhar/demorar" na TV (`settleWithin`). Hipótese secundária, de menor peso: a corrida do `teardown` (escrita não aguardada antes da invalidação) deixa o detalhe com estado velho por uma tela; não explicaria perder 28 min, pois as gravações periódicas (5 s) já teriam persistido.

Não há evidência suficiente para alterar esquema, apagar dados ou trocar o armazenamento.

## Proposed Remediation

**Preferida (em duas partes, sem inventar causa):**
1. **Nunca mais engolir a falha**: no `progressRecorder`, capturar a rejeição de cada escrita (`onProgress`/`onExit`), classificar com o mesmo critério seguro do `storageFailure` (código curto de operação e categoria — nunca mensagem, URL ou conteúdo do banco) e tentar **uma** nova gravação na próxima oportunidade (próximo tique ou saída), sem travar a reprodução.
2. **Tornar a falha visível** com um aviso curto e único por sessão, usando o mecanismo já existente de aviso/toast do detalhe ("Não foi possível salvar onde você parou (código X)"), para a pessoa reportar o código e a causa real sair da TV. Em paralelo, **fechar a corrida do `teardown`**: aguardar a escrita de saída (com o mesmo prazo curto de `settleWithin`) antes de invalidar o estado do detalhe.

**Alternativas:**
- Só instrumentar (sem retry e sem corrida): menor risco, mas não melhora a experiência enquanto a causa for transitória.
- Gravar também em `localStorage` como redundância: esconde o problema e duplica a fonte da verdade (constitution — identidade e estado em um só lugar); rejeitada sem evidência de que o IndexedDB é o culpado.

**Files likely to change**:
- `tv-web/src/lib/player/progressRecorder.ts` (+ `progressRecorder.test.ts`)
- `tv-web/src/lib/network/storageFailure.ts` (generalizar a classificação para fora do teste de conexão, ou um módulo irmão) (+ teste)
- `tv-web/src/components/player/usePlayerSession.ts` (aguardar a saída com prazo; repassar o aviso)
- `tv-web/src/features/movies/MovieDetailScreen.tsx` (invalidar depois da escrita; mostrar o aviso)
- `tv-web/src/lib/i18n/messages/detail.ts` (texto novo pt/en/es)

**Tests to add or update**:
- Gravador: escrita que rejeita não vira rejeição não tratada, é classificada, e a gravação seguinte ainda acontece; conclusão que falha avisa; nada de dado privado no código.
- Sessão: a saída aguarda a escrita (com prazo) antes de fechar e invalidar.
- Detalhe: aviso aparece uma vez e não rouba o foco (constitution: todo estado com elemento focável).
- E2E: injetar falha de escrita em `userStates` e confirmar o aviso com código seguro e que a reprodução segue.

## Risks & Considerations

- Esta etapa **instrumenta e endurece**; não corrige uma causa de armazenamento ainda desconhecida. Como no bug anterior, a correção da causa pode exigir um segundo ciclo com o código observado na TV.
- Não apagar IndexedDB, não mudar versão de esquema, não desinstalar o app.
- Constitution: segredos fora de log/tela (o código nunca inclui mensagem/URL/conteúdo); estado de reprodução continua por identidade lógica, nunca pela URL; aviso não pode tirar o foco do player.
- Mexer na saída do player toca `usePlayerSession` (compartilhado por Live, Filmes e Séries): o prazo de espera precisa ser curto e nunca bloquear o RETURN (o bug `tecla-voltar-return-nao-funciona-na` já existiu nesta área).

## Open Questions

- [NEEDS CLARIFICATION: lista Xtream ou M3U? forma de saída (RETURN/Home/fim)?]
- [NEEDS CLARIFICATION: app da TV de antes ou depois da 067? Favoritos e "Continuar" de séries ainda gravam?]
- [NEEDS CLARIFICATION: "Continuar assistindo" no Início mostra o filme? Um filme curto concluído fica marcado?]
