# Assessment Decision: Orçamento de armazenamento custa ~1,8 s por chamada no app real

- **Slug**: orcamento-armazenamento-makeroomfor-custa-18-s
- **Decidido**: 2026-10-20
- **Problem**: ./problem.md
- **Veredito**: go (atualizado em 2026-10-20 depois da medição por etapa; o veredito anterior era needs-clarification)

## Scorecard

| Critério | Avaliação | Notas |
| --- | --- | --- |
| Validade do problema | strong | Medido duas vezes no app real (filmes ~1,8 s por chamada, séries 1,7 s) contra ~29 ms na sonda |
| Força da evidência | strong | Medido por etapa no app real, 3 amostras estáveis (`evidencias/etapas-orcamento-app-real-tv-2026-10-20.md`): ~1,5 s dos ~1,7 s são contagens do IndexedDB, uma delas repetida |
| Valor vs. custo de inação | adequate | Tira ~3,7 s da carga de filmes e ~1,7 s da de séries, e alivia todo gravador; sem urgência de correção |
| Viabilidade / apetite | adequate | A causa é local e pequena: tirar a contagem repetida e rodar as contagens por lista em paralelo. Não exige conta guardada |
| Fit estratégico | strong | Fecha a diferença entre sonda e app real, que a 085 deixou aberta (R-010) |

A medição por etapa (`probeBudget`, só no build de medição) tirou o `weak`/`unknown` do scorecard de antes.

## Abordagens Candidatas

### 1. Medir por etapa no app real, depois decidir (recomendada como primeiro passo)

- Instrumentar `makeRoomFor` com `performance.now()` por etapa (`catalogLedger` em suas partes, `readStorageEstimate`, `releaseCandidates`, `planStorageRelease`)
  e mandar os números ao canal de métricas do build de medição (nova fonte, só números). Uma passada na TV com a lista real dá o veredito.
- **Recomendada**: sim. É pequeno, reaproveita o canal da 085 e responde a pergunta que bloqueia o resto.

### 2. Corrigir a etapa dominante

- Depende do resultado de (1). Possíveis: ler `estimate()` uma vez por carga, trocar `toArray()` por contagens/chaves, cachear a parte que só muda ao gravar.
- **Recomendada**: só depois de (1).

### 3. Conta guardada entre chamadas (reabrir D-001 da 085)

- Mantém o ledger em memória com invalidação por gravação. Foi rejeitada pelo usuário na 085 por risco de concorrência.
- **Recomendada**: não, a menos que (1) mostre que o custo cresce com o catálogo e não há correção local.

## Veredito

**go.** A medição por etapa no app real mostrou a causa: ~0,8 s em contagens por lista no `catalogLedger` e ~0,7 s na contagem de guia repetida em `releaseCandidates`,
somando ~1,5 s dos ~1,7 s por chamada; a estimativa do navegador não pesa. A correção é local e não precisa da conta guardada que a 085 rejeitou.

### Abordagem recomendada (atualizada)

1. **Não repetir a contagem do guia**: o `catalogLedger` já conta as linhas antigas do guia por lista; passar esse número para `releaseCandidates` (um campo no ledger) em vez de refazer
   `guideStoredBytes`. Corta ~0,7 s.
2. **Contagens por lista em paralelo**: `Promise.all` entre as listas (hoje uma lista após a outra). Corta ~0,5 s com 3 listas.
3. Meta realista: de ~1,7 s para ≤ 0,5 s por chamada (a meta de 200 ms da `problem.md` depende de a latência por consulta cair; não é garantida). Se ficar acima, o próximo
   passo é pular a contagem de guia quando `epgStoredBytes` está definido (sem linhas antigas) — decidir com a nova medição.

### Se go — Handoff

- **Problema**: `makeRoomFor` custa ~1,7 s por chamada no app real por contagens do IndexedDB em sequência e uma delas repetida, com 3 listas.
- **Abordagem recomendada**: as duas correções acima, medidas de novo com o `probeBudget`.
- **Escopo sugerido**: entra `storageLedger.ts` (contagens em paralelo, expor as linhas antigas de guia por lista) e `storageRelease.ts` (usar esse número); fica de fora o teto, a reserva e a política de
  liberação da 082, e a conta guardada. Os contratos da 082 e da 085 não podem mudar.
- **Métricas de sucesso**: `totalMs` do `probeBudget` ≤ 500 ms em 3 amostras na TV; carga de filmes na lista real ≤ 10 s; sem regressão em séries e canais; contratos verdes.
- **Perguntas em aberto**: quantas listas o aparelho do usuário tem em uso normal (aqui, 3); se as linhas antigas do guia ainda podem existir (aqui, 0).
