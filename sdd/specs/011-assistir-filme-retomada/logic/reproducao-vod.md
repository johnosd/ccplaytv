# Lógica — Reprodução de VOD e Retomada

Regras que o executor **não deve** redesenhar em tempo de implementação.
Complementa `contracts/player-capabilities.md`, que define os tipos.

---

## 1. Limiares — um único lugar

```ts
// tv-web/src/lib/player/resumePolicy.ts

/**
 * Abaixo disto, não houve "assistir" — houve espiar. Gravar aqui produziria
 * um "Retomar a partir de 0:12" que só atrapalha (FR-014).
 */
export const RESUME_MIN_SECONDS = 30

/**
 * Acima desta fração da duração, o filme conta como terminado: a retomada é
 * apagada e a ação primária volta a ser "Assistir" (FR-014).
 *
 * Distinto do limiar de "assistido" de ~90% que o guia Samsung 06 sugere para
 * histórico — esse é o item 13 do backlog e não existe nesta feature.
 */
export const RESUME_MAX_RATIO = 0.95

/** Cadência de gravação durante a reprodução (R0-4). */
export const PROGRESS_WRITE_INTERVAL_SECONDS = 5
```

Três funções puras, testáveis sem DOM e sem banco:

```ts
/** A posição salva merece virar oferta de retomada? */
export function isResumable(progressSeconds: number | undefined): boolean {
  return progressSeconds !== undefined && progressSeconds >= RESUME_MIN_SECONDS
}

/**
 * A posição atual cruzou o fim?
 *
 * Sem duração conhecida devolve `false` — nada é estimado (FR-004). O fim,
 * nesse caso, só chega por conclusão real do motor.
 */
export function isPastEnd(positionMs: number, durationMs: number | undefined): boolean {
  if (durationMs === undefined || durationMs <= 0) return false
  return positionMs / durationMs >= RESUME_MAX_RATIO
}

/** Já passou intervalo suficiente desde a última gravação? */
export function shouldWriteProgress(positionMs: number, lastWrittenMs: number): boolean {
  return Math.abs(positionMs - lastWrittenMs) >= PROGRESS_WRITE_INTERVAL_SECONDS * 1000
}
```

`Math.abs` em `shouldWriteProgress` é deliberado: retroceder também é avanço a
registrar. Sem ele, quem retrocede 20 minutos não teria a posição gravada até
voltar ao ponto de onde saiu.

---

## 2. Quando o progresso é gravado, e quando é apagado

Uma só função concentra a decisão, chamada pela camada de reprodução a cada
atualização de posição e em cada saída:

```
aoAtualizarPosição(positionMs, durationMs):
    se NÃO capabilities.reportsPosition:        # canal ao vivo
        retorna                                 # nunca grava progresso
    se isPastEnd(positionMs, durationMs):
        apagaProgresso()                        # FR-014 / R0-5
        marcaComoApagado()                      # não regrava até nova sessão
        retorna
    se jáFoiApagadoNestaSessão:
        retorna
    se positionMs < RESUME_MIN_SECONDS * 1000:
        retorna                                 # FR-014, limiar inicial
    se shouldWriteProgress(positionMs, últimaGravação):
        gravaProgresso(positionMs)
        últimaGravação := positionMs
```

```
aoSair(motivo):                                 # pausa, RETURN, conclusão
    se motivo == conclusão:
        apagaProgresso()                        # FR-020
        retorna
    se NUNCA houve avanço (nenhum onProgress):
        retorna                                 # FR-017: falha antes de começar
    aoAtualizarPosição(últimaPosiçãoConhecida, duração)   # grava o resto
```

**`marcaComoApagado` importa.** Sem essa porta, a posição continuaria
chegando do motor depois do apagamento (o filme segue tocando os últimos 5 %)
e a regra do limiar inicial gravaria de novo — o filme voltaria a ser
"retomável" no ponto 96 %, que é exatamente o que FR-014 evita.

**FR-017 em uma linha**: se nenhum `onProgress` chegou, não houve avanço; uma
falha antes do primeiro quadro não grava nada.

---

## 3. Saltos — a porta single-flight

Consequência direta de R0-1 (a referência Samsung restringe outras chamadas
durante `jumpForward`/`jumpBackward`).

```
estado: emVoo: boolean = false
        pendente: { tipo: 'delta'|'absoluto', valor: number } | null = null

jumpBy(deltaMs):
    se NÃO capabilities.canSeek: retorna
    se emVoo:
        se pendente é 'delta':  pendente.valor += deltaMs      # ACUMULA
        senão se pendente é 'absoluto': pendente.valor += deltaMs
        senão: pendente := { tipo: 'delta', valor: deltaMs }
        retorna
    emVoo := true
    adapter.jumpBy(deltaMs)                                    # ok/err → aoTerminarSalto()

seekTo(posiçãoMs):
    se NÃO capabilities.canSeek: retorna
    se emVoo:
        pendente := { tipo: 'absoluto', valor: posiçãoMs }     # SUBSTITUI
        retorna
    emVoo := true
    adapter.seekTo(posiçãoMs)

aoTerminarSalto():                              # sucesso OU falha
    emVoo := false
    se pendente:
        p := pendente; pendente := null
        se p.tipo == 'delta': jumpBy(p.valor) senão seekTo(p.valor)
```

Acumular o delta é o que faz três toques rápidos em "avançar" andarem 30 s.
Descartar pareceria travamento; repassar direto violaria a restrição da API.

`aoTerminarSalto` roda **também na falha** — senão um `seekTo` recusado (por
exemplo, além da duração) travaria a porta e nenhum salto seguinte sairia.

---

## 4. Interação dos controles (guia Samsung 06 §1, normativo)

Duas variáveis de estado na camada: `controlsVisible: boolean` e
`focusedAction: índice`.

| Tecla | Controles **ocultos** | Controles **visíveis** |
| --- | --- | --- |
| ESQUERDA | `jumpBy(-10s)` **e** mostra os controles | move o foco para a ação anterior |
| DIREITA | `jumpBy(+10s)` **e** mostra os controles | move o foco para a próxima ação |
| CIMA / BAIXO | mostra os controles | mostra os controles (reinicia o temporizador) |
| SELECT | mostra os controles | **executa a ação focada** |
| RETURN | encerra a sessão | encerra a sessão |

```
TEMPO_OCULTAR_MS = 5000     # guia 06 §1

aoInteragir():
    controlsVisible := true
    reiniciaTemporizador(TEMPO_OCULTAR_MS → controlsVisible := false)
```

**Regras que não podem ser suavizadas**:

- Quando `!capabilities.canSeek` (canal ao vivo), esquerda/direita **não
  saltam e não revelam nada**: a camada se comporta exatamente como hoje
  (FR-003, FR-022, critério P02 do guia 06).
- O temporizador de ocultar **não roda** enquanto a mídia está pausada: o
  usuário parou de propósito e precisa ver os controles para retomar.
- Com os controles ocultos **não há elemento focável** — e isso é deliberado,
  não um descuido. É o mesmo desenho de D-010 da feature 003: RETURN é a saída
  garantida de qualquer estado. Está registrado no Constitution Check como
  desvio consciente do princípio "Foco Visível e Sem Becos Sem Saída".

### Ações da barra, em ordem de foco

`[ ⏪ 10s ] [ ▶/⏸ ] [ ⏩ 10s ]`

O foco inicial, ao revelar, é sempre o **play/pause** (a ação primária de
FR-008). Ações cuja capacidade seja `false` **não são renderizadas** — não
existem desabilitadas. Com `canSeek: false` e `canPause: false` (canal ao
vivo), a barra inteira não existe.

---

## 5. Retomada — o que a tela de detalhe decide

```
aoMontarDetalheDoFilme(movieId):
    identidade := buildStableId({ sourceId, kind: 'movie', providerStreamId, originalName })
    estado := getUserState(identidade)
    se isResumable(estado?.progressSeconds):
        ação primária := "Retomar" + formataTempo(estado.progressSeconds)
        ação secundária := "Reiniciar"
    senão:
        ação primária := "Assistir"
        sem ação secundária
```

O foco inicial da tela é **sempre a ação primária** (FR-015 + guia 06).

Ao acionar:

| Ação | `startAtMs` da sessão |
| --- | --- |
| Assistir | `undefined` |
| Retomar | `progressSeconds * 1000` |
| Reiniciar | `0` |

**`Reiniciar` passa `0`, não `undefined`.** São coisas diferentes: `undefined`
significa "o motor decide onde começa" e `0` significa "começa no zero". Para
um filme dão no mesmo, mas a distinção mantém a intenção explícita no código —
e "Reiniciar" com `undefined` seria uma coincidência, não uma garantia.

### Aplicar `startAtMs`

Só depois de o motor estar pronto — `prepareAsync` sinaliza sucesso **antes**
de a reprodução começar (`avplayAdapter.ts:9`), e é ali que `seekTo` é válido.

```
aoPrepararComSucesso():
    se startAtMs > 0 E capabilities.canSeek:
        adapter.seekTo(startAtMs)
    adapter.play()
```

Buscar **antes** do `play()` evita o filme aparecer no início por um instante
antes de saltar — que é o que aconteceria buscando depois.

Se `!canSeek`, `startAtMs` é **ignorado em silêncio**: não há como honrá-lo, e
inventar um aviso para uma situação que não ocorre com filme (todo filme
declara `canSeek`) seria ruído.

### 5.1 A posição exibida tem de ser a atual, não a de quando a tela montou

A camada de reprodução é **camada**: o `MovieDetailScreen` permanece montado
por baixo enquanto o filme toca (é o que devolve o foco em FR-009). A
consequência é que a leitura do estado do usuário feita na montagem fica
**parada** enquanto o filme avança — o gravador escreve no IndexedDB a cada
5 s, e a tela por baixo não fica sabendo.

Sem tratamento, o efeito é visível e absurdo: assistir 20 minutos, dar RETURN,
e o detalhe anunciar "Retomar a partir de 0:00" — ou, pior, "Assistir", como
se nada tivesse acontecido.

**Regra**: ao fechar a camada, o estado do usuário daquele item é
**invalidado**, forçando releitura antes de a ação primária ser recalculada.

```
aoFecharCamada():
    setPlaying(null)
    invalidaEstadoDoUsuário(stableId)      # refetch → ação primária correta
```

A invalidação mora no `MovieDetailScreen`, que é quem detém **as duas** coisas
— a consulta e o estado `playing`. A camada de reprodução não conhece chaves
de consulta do catálogo e não deve passar a conhecer.

O mecanismo é o mesmo que o repositório já usa: `queryClient.invalidateQueries`
por chave, como `App.tsx:66` faz ao terminar uma importação. A consulta nova
segue o padrão de `useCatalogItem` (`catalogApi.ts:289`):

```ts
// tv-web/src/features/catalog/catalogApi.ts
export function useUserState(stableId: string | null)   // queryKey: ['user-state', stableId]
export function invalidateUserState(queryClient: QueryClient, stableId: string): void
```

`invalidateUserState` é exportada em vez de inline para a tela de séries
(feature seguinte) reusar a mesma chave, em vez de inventar outra que ninguém
invalida.

**Por que invalidar em vez de escrever no cache**: o gravador é a única fonte
de verdade da posição e já escreveu no IndexedDB. Espelhar esse valor no cache
da consulta criaria dois caminhos de escrita que podem divergir — e o caminho
do meio (limiar final apagando o progresso) tornaria o espelho errado
exatamente no caso em que a resposta importa.

---

## 6. Identidade estável do filme

`buildStableId` já existe e é a única fonte (`userStateRepository.ts:44`).
A camada de reprodução **não** monta a chave por conta própria.

O registro do catálogo (`CatalogRecord`) traz `sourceId`, `kind`,
`providerStreamId` e `originalName`. A montagem:

```ts
buildStableId({
  sourceId: record.sourceId,
  kind: 'movie',
  providerStreamId: record.providerStreamId,   // ausente em fonte M3U
  originalName: record.originalName,            // último recurso, já previsto
})
```

`buildStableId` **lança** se não houver nem identificador nem nome
(`userStateRepository.ts:41`). Um filme sem os dois não é retomável: a
reprodução acontece normalmente e o progresso simplesmente não é gravado. A
exceção **não** pode escapar para a camada de reprodução e virar erro de
player — perder retomada é degradação aceitável, não falha de reprodução.

---

## 7. Sessões sobrepostas (FR-010)

A camada já tem a proteção certa por construção: a sessão vive num `useEffect`
com `cancelled` e `teardown` (`PlayerOverlay.tsx:64`). O que falta é impedir a
**abertura** dupla a partir da tela de detalhe:

```
aoSelecionarAçãoPrimária():
    se jáExisteSessão: retorna       # SELECT repetido / tecla mantida
    abreSessão(...)
```

Como a camada é montada por `{playing && <PlayerLayer/>}`, "já existe sessão"
é simplesmente `playing !== null` — o mesmo padrão de `LiveScreen.tsx:374`.
