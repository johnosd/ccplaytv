# Bug Assessment: Detalhe do filme pode voltar do player sem "Continuar" (flake do E2E da 026)

- **Slug**: flake-e2e-home-busca-configuracoes-passo-continuar-progresso
- **Criado**: 2026-09-29
- **Origem**: backlog (item 62) e `sdd/specs/030-epg-dados-agora/plan.md` R-013
- **Veredito**: valid
- **Severidade**: medium

## Report

`tv-web/e2e/home-busca-configuracoes.mjs` falha em parte das execuções no passo
"com progresso salvo, a ação primária do detalhe vira "Continuar"" (linha ~223).
A feature 030 mediu ~19 % de falha já no código anterior a ela e deixou o caso
sem dono.

## Symptom

Depois de assistir parte de um filme e apertar RETURN, a tela de detalhe às
vezes reaparece com a ação primária "Assistir" em vez de "Continuar", embora
haja progresso salvo. Esperado: sempre "Continuar".

## Reproduction

1. Dev server recém-iniciado (`npm run dev`), depois `node e2e/home-busca-configuracoes.mjs` em loop.
2. **Reproduzido nesta avaliação: 2 falhas em 10 execuções**, as duas exatamente na asserção "com progresso salvo… vira Continuar"; as outras 8 passaram.

Nenhuma reprodução manual na TV; o sintoma foi visto só no Chromium do Playwright.

## Suspected Code Paths

- `tv-web/src/features/movies/MovieDetailScreen.tsx:378-386` — `onClose` faz `setPlaying(false)` e chama `invalidateUserState` na hora, iniciando a releitura do estado do usuário.
- `tv-web/src/components/PlayerLayer.tsx:573` — só no `teardown` (cleanup do efeito, que roda depois de a camada desmontar) chama `recorderRef.current?.onExit('close')`, **sem await**.
- `tv-web/src/lib/player/progressRecorder.ts:124-135` — `onExit` é assíncrono e a gravação (`updateProgress`) é uma transação no IndexedDB.
- `tv-web/src/lib/player/progressRecorder.ts:41-54` — o comentário do achado da feature 019 descreve exatamente esta corrida, tratada só no caminho de conclusão (`onExit('completed')` com `await` antes de `onClose`).
- `tv-web/e2e/home-busca-configuracoes.mjs:219-226` — o script lê `textContent()` no instante em que `.vod-detail` reaparece, sem esperar nada.

## Root Cause Hypothesis

Ordem observada no código: `onClose` invalida e dispara a releitura **antes** do
cleanup do `PlayerLayer` chamar `onExit('close')`. A releitura (1 leitura) e a
gravação final (`updateProgress`) correm em paralelo no IndexedDB; se a leitura
vence, o detalhe fica com o estado antigo até algo o invalidar de novo. É a
mesma classe de corrida da feature 019, que foi corrigida só para a conclusão
automática. O script piora o efeito por ler o texto sem esperar. Confiança:
**medium** — a falha e o ponto exato foram reproduzidos, mas a ordem dos
eventos no IndexedDB não foi instrumentada. Uma dúvida a fechar na fase Fix:
o `timeupdate` do script já dispara `onProgress`, que grava em fire-and-forget
logo na primeira chamada, então convém medir se a gravação que perde a corrida
é essa ou a de `onExit('close')`.

## Proposed Remediation

**Preferida**: fazer a invalidação do `user-state` acontecer **depois** do
commit da gravação final, no caminho de fechar por RETURN. O `teardown` é
síncrono (cleanup de efeito), então a espera não pode bloqueá-lo. Opções:
guardar a Promise de `onExit('close')` e expô-la a quem fecha, ou o gravador
notificar quando terminar de escrever para o detalhe invalidar então. Escolher a
menos invasiva depois de instrumentar a ordem (ver dúvida acima).

**Alternativas** (opcional):
- Só endurecer o script (`expect.poll`/`waitFor` no texto de `.vod-detail-action`). Corrige a instabilidade do teste, mas o detalhe continuaria podendo voltar sem "Continuar" para a pessoa. Não recomendada sozinha.

**Files likely to change**:
- `tv-web/src/components/PlayerLayer.tsx`
- `tv-web/src/lib/player/progressRecorder.ts`
- `tv-web/src/features/movies/MovieDetailScreen.tsx`
- `tv-web/e2e/home-busca-configuracoes.mjs` (espera explícita, como reforço)

**Tests to add or update**:
- Teste de unidade do gravador/`PlayerLayer` com a gravação atrasada: ao fechar por RETURN, a invalidação só ocorre depois de o progresso estar gravado.
- Teste de `MovieDetailScreen` (com `updateProgress` atrasado) exigindo "Continuar" após fechar o player.
- Loop de 30 execuções do E2E como critério da fase Test (antes do fix: 2/10).

## Risks & Considerations

- `SeriesDetailScreen` usa o mesmo `PlayerLayer` e `invalidateUserStates` (linhas 292/297); o fix deve valer para episódio também e ser conferido lá.
- Não pode atrasar o fechamento do player nem a liberação da sessão do AVPlay (singleton).
- O `progressRecorder` selado (`done`) impede regravar depois de concluído; a mudança não pode reabrir esse caso.
- Mudança em `PlayerLayer`: as travas de contrato de 011, 027 e 029 precisam continuar íntegras.

## Open Questions

- [NEEDS CLARIFICATION: qual gravação perde a corrida — a de `onProgress` ou a de `onExit('close')`? Medir com log temporário antes de escolher a opção.]
