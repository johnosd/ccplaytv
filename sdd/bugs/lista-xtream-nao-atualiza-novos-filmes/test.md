# Bug Verification: Lista Xtream não traz filmes/séries/canais novos ao abrir o app

- **Slug**: lista-xtream-nao-atualiza-novos-filmes
- **Testado**: 2026-10-22
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Encerrado em 2026-10-22 após confirmação do usuário na TV física: todos os itens do [roteiro único](../ROTEIRO-TV-2026-10-22.md) foram validados com sucesso. O item 5 foi aprovado ao reabrir o app após mais de 10 minutos fechado e navegar por 1–2 minutos durante a renovação, com usabilidade aceita e sem ressalva de armazenamento relatada.

A evidência física é qualitativa e fornecida pelo usuário; não houve nova medição de CPU, memória ou disco, nem confirmação separada do gatilho de app residente/M3U. Esta atualização é documental; os testes automatizados abaixo não foram reexecutados.

### Registro anterior — 2026-10-09

O sintoma não reproduz mais. Com a lista Xtream real, no navegador, uma
categoria de filmes "nova" volta ao reabrir a lista sincronizada há 1 h e ao
voltar o app ao primeiro plano. Dentro de uma categoria existente, o filme novo
aparece e o removido some. Abaixo de 10 min, nada é refeito. Unitários, tipos, lint e E2E
completo passam. Fica `partial`, e não `verified`, por um único motivo: o
próprio assessment condicionou o fechamento à medição na TV física do custo de
atualizar a cada abertura, e essa medição não foi feita.

## Checks Performed

| Checagem | Comando / Ação | Resultado | Notas |
| --- | --- | --- | --- |
| Reprodução A (controle) | Roteiro Playwright descartável (scratchpad, fora do repo) contra a lista real do `.env`: importa, apaga a última categoria de filmes da geração ativa + o bloco dela, recua `lastSuccessfulSyncAt` em **2 min**, recarrega a página e escolhe a lista | pass | A categoria **não** volta em 20 s: o intervalo mínimo de 10 min segura a reimportação. É também o que acontecia antes do fix para qualquer idade abaixo de 24 h. |
| Reprodução B (o bug) | Mesmo roteiro com `lastSuccessfulSyncAt` recuado **1 h** (antes: dentro das 24 h → nada) | pass | A categoria volta pela atualização incremental (feature 038). |
| Reprodução C (app residente) | Sem recarregar: apaga outra categoria, recua 1 h e dispara `visibilitychange` oculto → visível | pass | A categoria volta, sem escolher a lista de novo. |
| Reprodução D (itens dentro de categoria existente) | 2º roteiro Playwright descartável, lista real: espera a pré-carga gravar um bloco de filmes (101 itens), tira 1 filme real (= "novo no provedor"), injeta 1 falso (= "removido pelo provedor"), invalida a `itemsSignature` gravada da categoria, recua a sincronização 1 h, recarrega e escolhe a lista | pass | D1: o filme real volta. D2: o falso some. A 1ª tentativa sem invalidar a assinatura "falhou", mas a simulação estava errada: `writeBlockWithin` (`categoryBlocks.ts:191-196`) não regrava quando o provedor manda o mesmo conteúdo da última gravação, que era exatamente o caso. O diagnóstico confirmou que a reimportação rodou e a renovação aconteceu (fila zerada). |
| Testes novos/atualizados | `npx vitest run src/lib/catalog/freshness.test.ts src/features/import/useRefreshOnForeground.test.tsx` | pass | 2 arquivos, 18 testes. |
| Regressão direcionada | `npx vitest run src/App src/features/import src/lib/catalog/{importPipeline.atualizacao,catalogRepository.atualizacao,structureDiff,prefetch,categoryLoader}` | pass | 31 arquivos, 156 testes. |
| Suíte unitária inteira | `npm run test` (na fase Fix, mesmo código) | pass | 507 arquivos, 3059 testes. Não foi refeita nesta fase: o código não mudou desde então. |
| E2E | `npm run test:e2e` (com `npm run dev` de pé) | pass | 43/43 scripts em 231 s. |
| Lint / type-check | `npx tsc -b`; `npm run lint` | pass | Sem erros; `architecture: ok` (`App.tsx` 624 ≤ teto 625). |
| TV física (custo por abertura) | `tizen-tv` | not-run | Não executado nesta sessão: exige a TV na rede. |

## Output Excerpts

```
PASSOU — A: sincronizada há 2 min, reabrir → categoria NÃO volta
PASSOU — B: sincronizada há 1 h, reabrir → categoria volta
PASSOU — C: app volta ao primeiro plano → categoria volta
PASSOU — D1: filme novo do provedor aparece na categoria existente
PASSOU — D2: filme removido pelo provedor some da categoria

43/43 scripts passaram em 231s (soma serial 679s, 3 em paralelo)
```

## Residual Risks

Registro de 2026-10-09: o aceite de usabilidade durante a renovação na TV foi confirmado em 2026-10-22. As limitações de medição quantitativa, simulação do provedor e cobertura de app residente/M3U abaixo continuam registradas; não são apresentadas como novas medições físicas.

- **Não medido na TV**: atualizar a cada abertura (> 10 min) repete as leituras
  de estrutura e, pela pré-carga, os downloads por seção (`get_live_streams`,
  `get_vod_streams`, `get_series`) e a regravação dos blocos. Antes isso
  acontecia no máximo uma vez por dia. Memória, disco (ver "disco cheio" da
  065) e fluidez da navegação durante a renovação precisam ser vistos na TV.
- As reproduções simulam a mudança do provedor alterando o aparelho (categoria
  apagada; item tirado/injetado com a assinatura invalidada), porque não dá para
  fazer o provedor real mudar sob demanda. A mudança real no provedor só será
  observada usando o app no dia a dia ou na passada na TV.
- A volta ao primeiro plano foi simulada redefinindo `visibilityState` no
  navegador. Que o Tizen emita `visibilitychange` ao retomar o app é o que o
  player já assume (`usePlayerSession`), mas não foi observado para este gatilho.
- Lista M3U por URL segue a mesma regra e re-baixa o arquivo inteiro a cada
  abertura (> 10 min). Não foi medido.

## Recommendation

Fechar como `verified`, conforme validação física do item 5 e autorização expressa do usuário em 2026-10-22: "Todos os itens foram validados com sucesso. Podem fechar todos esses bugs". O aceite da navegação na TV encerra a pendência física; não constitui um benchmark de recursos.

### Recomendação anterior — 2026-10-09

**Decisão do usuário (2026-10-09):** a passada na TV física fica para depois. O
bug segue **aberto** (`partial`) até ela. O que dava para cobrir com Playwright
está coberto (cenários A–D).

Segurar o fechamento até uma passada na TV física (`tizen-tv`): reabrir a lista
depois de mais de 10 min e voltar ao app residente, conferir que filmes/séries
novos aparecem e que a navegação continua fluida durante a renovação, sem erro
de armazenamento. Se a passada estiver limpa, o bug pode ser considerado
resolvido. Se o custo pesar, o ajuste é a constante `REFRESH_ON_OPEN_MIN_MS`
ou renovar só as categorias cuja contagem mudou (follow-up do `fix.md`), e não
voltar às 24 h.
