# Contrato — Capacidades de Reprodução

Superfície alterada por esta feature em
`tv-web/src/lib/player/PlayerService.ts` e nos dois adaptadores. É o contrato
que FR-001, FR-002, FR-003 e FR-004 exigem.

**Regra que organiza tudo abaixo**: a interface lê **capacidade**, nunca a
identidade do motor. O precedente já existe no repositório —
`rendersOnHardwarePlane` é uma capacidade declarada exatamente para a UI saber
liberar a área do vídeo sem saber qual adaptador está ativo (D-007 do plano da
feature 003). Esta feature estende o mesmo padrão em vez de inventar outro.

---

## 1. Tipos

```ts
/**
 * O que é possível fazer com UMA sessão de reprodução.
 *
 * Não é propriedade do motor nem do item: é a interseção dos dois (R0-2).
 * O mesmo AVPlay serve canal ao vivo e filme, e só o filme pode ser buscado.
 */
export interface PlayerCapabilities {
  /** Pausar e retomar sem encerrar a sessão. */
  canPause: boolean
  /** Buscar posição — absoluta (`seekTo`) e relativa (`jumpBy`). */
  canSeek: boolean
  /** O motor informa a posição atual desta mídia. */
  reportsPosition: boolean
  /** O motor informa a duração total desta mídia. */
  reportsDuration: boolean
}

/** O que o MOTOR sabe fazer, independente da mídia. Declarado pelo adaptador. */
export type EngineCapabilities = PlayerCapabilities

/**
 * O que a MÍDIA permite, independente do motor.
 *
 * Transmissão contínua sem janela DVR não tem duração nem posição
 * significativas, e buscá-la é o que a constitution e o critério P02 do guia
 * Samsung 06 proíbem.
 */
export function mediaCapabilities(kind: CatalogItemKind): PlayerCapabilities

/** Posição e duração, em milissegundos. `durationMs` ausente = desconhecida. */
export interface PlayerProgress {
  positionMs: number
  durationMs?: number
}
```

### Tabela de `mediaCapabilities`

| `kind` | `canPause` | `canSeek` | `reportsPosition` | `reportsDuration` |
| --- | --- | --- | --- | --- |
| `channel` | `false` | `false` | `false` | `false` |
| `movie` | `true` | `true` | `true` | `true` |
| `episode` | `true` | `true` | `true` | `true` |
| `series` | — | — | — | — |
| `unclassified` | — | — | — | — |

`series` e `unclassified` não chegam aqui: `resolvePlaybackUrl` já lança
`not_playable_kind` antes (`playbackUrl.ts:58`). A função **deve** mesmo assim
devolver tudo `false` para esses casos, em vez de lançar — uma capacidade
negada é sempre um estado válido, e a camada de reprodução não é o lugar de
descobrir que um item não é reproduzível.

`episode` já aparece com as mesmas capacidades de `movie` de propósito: o
contrato não precisa mudar de novo quando a feature de séries chegar. Nenhuma
tela desta feature reproduz episódio.

### Resolução

```ts
export function resolveCapabilities(
  engine: EngineCapabilities,
  kind: CatalogItemKind,
): PlayerCapabilities
```

Interseção campo a campo (`engine.x && media.x`). Qualquer outra regra — por
exemplo "se o motor sabe buscar, ofereça busca" — viola FR-003.

---

## 2. `PlayerAdapter` — o que muda

```ts
export interface PlayerAdapter {
  readonly name: string
  readonly rendersOnHardwarePlane: boolean
  /** NOVO: o que este motor sabe fazer, sem considerar a mídia. */
  readonly capabilities: EngineCapabilities

  /**
   * NOVO (refinamento de execução — ver §4.1): `startAtMs` é a posição de
   * retomada, aplicada ANTES de a reprodução começar. Só a sessão que já
   * resolveu `canSeek` passa um valor; a decisão de honrar ou ignorar não
   * cabe ao adaptador.
   */
  open(url: string, region: PlayerRegion, startAtMs?: number): void
  close(): void

  /** NOVO. Só chamado quando a sessão resolveu `canPause`. */
  pause?(): void
  /** NOVO. Só chamado quando a sessão resolveu `canPause`. */
  resume?(): void
  /** NOVO. Destino absoluto em ms. Só chamado quando `canSeek`. */
  seekTo?(positionMs: number): void
  /** NOVO. Deslocamento relativo em ms (negativo retrocede). Só com `canSeek`. */
  jumpBy?(deltaMs: number): void
}
```

**Por que os métodos são opcionais e a capacidade é explícita, em vez de
inferida pela presença do método**: presença de método é declaração implícita,
e não distingue "o motor não sabe" de "esta mídia não permite" — que é
precisamente a distinção que FR-002 e FR-003 exigem. A capacidade declarada é
a verdade; o método opcional é só consequência prática de o adaptador de
canal ao vivo não precisar implementá-lo.

**Invariante**: a sessão **nunca** chama um método cuja capacidade resolvida
seja `false`. Um adaptador que implemente `seekTo` mas declare `canSeek:
false` jamais o vê chamado.

### Callbacks

```ts
export interface PlayerAdapterCallbacks {
  onStateChange(state: PlayerState): void
  onError(error: PlayerError): void
  /** NOVO: posição/duração empurradas pelo motor (R0-3). */
  onProgress?(progress: PlayerProgress): void
  /** NOVO: a mídia chegou ao fim por conta própria. */
  onCompleted?(): void
}
```

`onCompleted` é a correção central de FR-019/FR-021: hoje o adaptador AVPlay
traduz `onstreamcompleted` para um **erro** (`avplayAdapter.ts:98`), com a
mensagem "A transmissão foi interrompida". Isso é correto para canal ao vivo —
transmissão contínua não tem conclusão — e errado para filme.

**Quem decide qual dos dois é**: o adaptador **sempre** emite `onCompleted`; a
**sessão** o traduz conforme a capacidade resolvida da mídia:

| Mídia | `onstreamcompleted` vira |
| --- | --- |
| `reportsDuration: true` (filme, episódio) | estado `completed` |
| `reportsDuration: false` (canal ao vivo) | estado `error`, mensagem atual preservada |

Essa regra mantém a Live TV byte-a-byte como está (FR-022) sem duplicar a
tradução em dois adaptadores.

---

## 3. `PlayerState` — um estado novo

```ts
export type PlayerState =
  | 'idle'
  | 'preparing'
  | 'buffering'
  | 'playing'
  | 'paused'     // NOVO
  | 'completed'  // NOVO
  | 'error'
  | 'closed'
```

Transições permitidas (`ALLOWED_NEXT`), com as novas em **negrito**:

| De | Para |
| --- | --- |
| `idle` | `preparing`, `closed` |
| `preparing` | `buffering`, `playing`, `error`, `closed` |
| `buffering` | `playing`, **`paused`**, `error`, `closed` |
| `playing` | `buffering`, **`paused`**, **`completed`**, `error`, `closed` |
| **`paused`** | **`playing`**, **`buffering`**, **`error`**, **`closed`** |
| **`completed`** | **`closed`** |
| `error` | `closed` |
| `closed` | — |

`completed` é terminal exceto por `closed`, como `error` — é o que impede um
callback atrasado do motor de ressuscitar uma sessão encerrada, que é a razão
de `ALLOWED_NEXT` existir (`PlayerService.ts:96`).

`buffering → paused` existe porque pausar durante o buffer inicial é possível
no AVPlay (`pause()` vale em `READY`).

---

### 4.1 Por que `startAtMs` entra em `open()`, não numa chamada separada

`createPlayerSession` recebe `startAtMs` (§4), mas quem de fato precisa dele
é o **adaptador**, não a sessão: `prepareAsync` sinaliza sucesso ANTES de a
reprodução começar, e é exatamente ali — antes de chamar `play()` — que a
busca inicial precisa acontecer, para o filme nunca aparecer do início por um
instante antes de saltar. Esse instante é interno ao `open()` de cada
adaptador (a sessão não o observa separadamente), então `startAtMs` viaja
como terceiro parâmetro de `open()`, calculado uma vez pela sessão:

```ts
const effectiveStartAtMs = capabilities.canSeek && startAtMs && startAtMs > 0 ? startAtMs : undefined
adapter.open(url, region, effectiveStartAtMs)
```

O adaptador não verifica `canSeek` — se recebeu um valor, aplica; a decisão
de repassar ou não é sempre da sessão (D-002).

## 4. `PlayerSession` — o que a interface passa a enxergar

```ts
export interface PlayerSession {
  readonly state: PlayerState
  readonly error: PlayerError | null
  readonly rendersOnHardwarePlane: boolean
  /** NOVO: capacidades já resolvidas (motor ∩ mídia). */
  readonly capabilities: PlayerCapabilities
  /** NOVO: último progresso informado pelo motor. */
  readonly progress: PlayerProgress | null

  /** NOVO. Sem efeito se `!capabilities.canPause`. */
  togglePause(): void
  /** NOVO. Sem efeito se `!capabilities.canSeek`. */
  seekTo(positionMs: number): void
  /** NOVO. Sem efeito se `!capabilities.canSeek`. Ver a porta de salto, §5. */
  jumpBy(deltaMs: number): void

  close(): void
}
```

`createPlayerSession` ganha o tipo da mídia, sem o qual não há como resolver
capacidade:

```ts
export function createPlayerSession(
  url: string,
  region: PlayerRegion,
  kind: CatalogItemKind,                 // NOVO — obrigatório
  options?: PlayerServiceOptions & {
    /** NOVO: posição inicial em ms. Aplicada após o motor ficar pronto. */
    startAtMs?: number
  },
): PlayerServiceSession
```

**`kind` é obrigatório e sem valor padrão.** Um padrão `'channel'` faria um
filme perder a barra por esquecimento numa chamada nova, e o compilador não
avisaria — exatamente o tipo de falha silenciosa que o contrato existe para
impedir.

---

## 5. A porta de salto (consequência de R0-1)

A referência da Samsung diz que, durante `jumpForward`/`jumpBackward`,
**outras chamadas à API ficam restritas** até o callback voltar. Segurar uma
seta no controle emite saltos mais rápido do que o motor os conclui.

**Revisado na Fase 6 (verificação na TV física, R-019)** — o parágrafo abaixo
descreve a decisão **original**, testada em hardware real e **revertida**
por travar o app; ficou aqui só como registro de alternativa rejeitada:

> ~~Acumular em vez de descartar é o que faz três toques rápidos em
> "avançar" andarem 30 s, e não 10 s. Descartar seria perda de comando
> percebida como travamento~~ — na prática, acumular foi o que travou: um
> `jumpForward` real pode levar tempo perceptível pra responder (stream
> HTTP), e segurar a seta por poucos segundos já acumula dezenas de eventos
> de tecla repetida. Quando o salto em voo finalmente respondia, o pendente
> somado virava um ÚNICO salto de tamanho potencialmente enorme (minutos),
> e a própria restrição da API prendia a interface enquanto ele processava
> — exatamente o "travamento" que a decisão original queria evitar, só que
> por um caminho diferente.

**Contrato atual**: `jumpBy()` é *single-flight* por **descarte**, não por
acumulação. Enquanto um salto está em voo, novas chamadas a `jumpBy` são
**ignoradas** — nenhum pendente é guardado. Ao voltar o callback (sucesso OU
falha), a porta libera; se a tecla continuar pressionada, o próximo evento já
dispara normalmente. No pior caso, isso limita a cadência de saltos à
latência real do motor — previsível — em vez de arriscar um salto composto
de tamanho imprevisível.

`seekTo` (destino absoluto) é diferente: não é acionado por tecla mantida
pressionada (só pela retomada, uma vez por sessão), então continua
enfileirando o pendente mais recente (substituindo, nunca somando) enquanto
um salto está em voo — o risco de acúmulo que afetava `jumpBy` não se aplica
aqui, porque não há como chamar `seekTo` repetidamente num período curto no
fluxo real do produto.

---

## 6. Sanitização — invariante preservada

`PlayerError.code` e `PlayerError.message` continuam proibidos de conter URL,
endereço de provedor ou credencial (`PlayerService.ts:44`, constitution
"Segredos Fora dos Clientes e dos Logs"). Os callbacks novos herdam a regra:

- `onProgress` carrega **só números**.
- Falha de `seekTo`/`jumpBy` **não** repassa o objeto de erro do motor; vira,
  no máximo, um `code` curto, como `toPlayerError` já faz
  (`avplayAdapter.ts:62`).

---

## 7. O que NÃO muda

- `PlayerRegion`, `FULLSCREEN_REGION` e a semântica de plano de hardware.
- `resolveAdapterFactory()` e a escolha do motor em tempo de execução.
- A regra de que uma sessão nunca é reaproveitada: "tentar de novo" cria
  sessão nova, com URL nova buscada pelo id (ADR-002 §5).
- O caminho de canal ao vivo, ponta a ponta (FR-022).
