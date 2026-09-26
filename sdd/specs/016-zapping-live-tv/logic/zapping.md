# Lógica: Zapping por Cima do Vídeo

Contrato estrito para o `sdd-execute` — decide o "como" desta feature para não
deixar a decisão arquitetural (onde vive o estado, como o teclado é roteado,
quando a sessão antiga fecha) a critério de quem implementa.

## Por que este desenho, e não outro

Dois fatos do código real, confirmados nesta sessão de planejamento, eliminam
as alternativas óbvias:

1. **`webapis.avplay` é singleton** (`tv-web/src/lib/player/avplayAdapter.ts`,
   `getAvplay()`): sempre o mesmo objeto global. Não existe "abrir a sessão
   nova antes de fechar a antiga" — só pode haver uma sessão de vídeo por vez.
   Logo, o requisito de "zero gap perceptível" (FR-006/SC-001) não pode vir de
   duas sessões simultâneas; tem que vir de **algo opaco cobrindo o instante
   de troca**. Esse algo é a própria lista de zapping, mantida aberta até o
   canal novo confirmar (ver Clarificações de 2026-09-25 em `spec.md`).
2. **`useRemoteNav({ modal: true })` só sustenta UM registro "dono" do
   teclado por vez** (`tv-web/src/lib/useRemoteNav.ts`: fase de captura +
   `stopImmediatePropagation`). `PlayerLayer` já é esse dono durante toda a
   reprodução. Um componente-irmão com seu próprio `useRemoteNav({modal:
   true})` para a lista de zapping colidiria de forma dependente da ordem de
   montagem — por isso o zapping NÃO é um componente modal próprio: é
   conteúdo que `PlayerLayer` desenha e para o qual `PlayerLayer` **redireciona**
   seus próprios handlers, sem abrir um segundo registro.

Consequência prática boa: a troca de sessão em si (fechar a antiga, abrir a
nova) **não muda nada** — continua sendo o mesmo `useEffect` em
`[itemId, attempt, createAdapter]` que já existe em `PlayerLayer.tsx`, cleanup
fechando e corpo abrindo. O descarte de seleções em sequência rápida
(FR-009/SC-003) já vem de graça do mesmo mecanismo (a flag `cancelled` do
efeito). Nada disso precisa ser tocado.

## Contrato novo de `PlayerLayer` (`tv-web/src/components/PlayerLayer.tsx`)

`PlayerLayer` continua agnóstico de Live TV — não passa a conhecer "canal" ou
"categoria". Ganha só um jeito genérico de ceder sua única camada visual e seu
único registro de teclado modal para quem o usa.

```ts
export interface PlayerLayerTopLayer {
  /** Árvore React a desenhar por cima do vídeo, dentro do próprio
   *  `.player-overlay` deste componente — nunca como filho de `.screen` por
   *  fora, ou a regra de `visibility:hidden` do plano de hardware (screens.css,
   *  seletor `:root.video-plane-visible .screen > *:not(.player-overlay)`)
   *  a esconde. */
  content: ReactNode
  onDirection: (direction: RemoteDirection) => void
  onSelect: () => void
  /** RETURN com esta camada aberta — fecha só ELA. Nunca dispara `onClose`
   *  do player inteiro. */
  onBack: () => void
  /**
   * Opcional — edge case da spec: "segurar OK sobre um canal na lista de
   * zapping continua favoritando/desfavoritando, sem conflito com o toque
   * curto que seleciona/troca". `undefined` quando não há item focável pra
   * favoritar (ex.: foco na trilha de categorias) — nesse caso o OK age
   * direto no keydown, sem gesto (mesmo padrão de `canToggleFavorite` já
   * usado fora do zapping, feature 013).
   */
  onLongSelect?: () => void
  /** Mesmo gesto, via tecla amarela (feature 013). */
  onFavoriteKey?: () => void
}

export interface PlayerLayerProps {
  // ...props existentes, inalteradas...

  /** `null`/ausente (padrão): comportamento de sempre. Não-nulo: PlayerLayer
   *  desenha `content` por cima do vídeo e redireciona onDirection/onSelect/
   *  onBack do seu modal para os handlers daqui, em vez do comportamento
   *  padrão de controles de reprodução. */
  topLayer?: PlayerLayerTopLayer | null

  /** SELECT chega aqui em vez de "revelar controles" quando `topLayer` é
   *  `null` E a mídia atual não tem nenhuma ação de controle (hoje: canal ao
   *  vivo, sempre `playerControlsActions(...).length === 0`). Ausente: SELECT
   *  nesse caso continua só revelando a barra vazia — Filmes/Séries não
   *  passam isto, comportamento inalterado (FR-013). */
  onIdleSelect?: () => void

  /** Dispara na primeira vez que a sessão ATUAL (a do `itemId`/`attempt`
   *  correntes) atinge `state === 'playing'`. Não dispara de novo por
   *  rebuffering do mesmo item. */
  onEnteredPlaying?: () => void

  /** Dispara quando a sessão ATUAL cai em erro — ADEMAIS do desenho padrão
   *  da tela de erro nativa do PlayerLayer (que só fica de fato visível
   *  quando `topLayer` for `null`; com `topLayer` aberto, o scrim+conteúdo
   *  do zapping cobre a tela de erro por trás dela). Mensagem já sanitizada
   *  (a mesma que a tela de erro nativa usaria). */
  onSessionError?: (message: string) => void
}
```

### Mudanças no corpo de `PlayerLayer`

1. **Roteamento do `useRemoteNav`** — no topo de cada handler, antes do
   comportamento atual:
   ```
   onDirection: (dir) => {
     if (topLayer) { topLayer.onDirection(dir); return }
     /* ...corpo atual, inalterado... */
   }
   onSelect: () => {
     if (topLayer) { topLayer.onSelect(); return }
     if (isErrorScreen) { /* ...atual... */ }
     const session = sessionRef.current
     if (!session) return
     if (!controlsVisible) {
       const actions = playerControlsActions(session.capabilities, session.progress)
       if (actions.length === 0) { onIdleSelect?.(); return }   // <- novo ramo
       revealControls()
       return
     }
     /* ...atual... */
   }
   onBack: () => {
     if (topLayer) { topLayer.onBack(); return }
     onClose()
   }
   ```

2. **`publish()` dentro do efeito de sessão** — duas emissões novas, sem
   mexer no que já existe:
   ```
   let enteredPlayingFired = false   // local ao `start()`: reseta por sessão nova
   const publish = () => {
     /* ...tudo que já existe, na mesma ordem... */
     if (session.state === 'playing' && !enteredPlayingFired) {
       enteredPlayingFired = true
       onEnteredPlaying?.()
     }
     if (session.state === 'error') {
       setPhase({ kind: 'error', message: /* ...atual... */, retryable: true })
       onSessionError?.(session.error?.message ?? genericErrorMessage)
       return
     }
     /* ... */
   }
   ```

3. **JSX — um único corpo, nunca dois `return` cedo.** Hoje o componente tem
   um `return` cedo para `isErrorScreen` e outro para o caminho normal — isso
   preciso virar um `if` INTERNO ao mesmo `<div className="player-overlay">`,
   porque `topLayer.content` precisa aparecer em cima de QUALQUER um dos dois
   (inclusive da tela de erro, no instante entre a sessão nova falhar e
   `LiveScreen` reverter — ver "Reversão automática" abaixo):
   ```jsx
   return (
     <div className="player-overlay" role="dialog" aria-label={isErrorScreen ? 'Erro de reprodução' : `Reproduzindo ${title}`}>
       <div id="player-surface" className="player-surface" />
       {isErrorScreen ? (
         <div className="player-message">{/* ...conteúdo atual da tela de erro... */}</div>
       ) : (
         <>
           {label !== '' && <div className="player-status">{/* ...atual... */}</div>}
           {controlsVisible && session && phase.kind === 'session' && <PlayerControls .../>}
         </>
       )}
       {topLayer && (
         <div className="player-zap-scrim">{topLayer.content}</div>
       )}
     </div>
   )
   ```
   `.player-zap-scrim` é uma classe nova em `screens.css`: `position: absolute;
   inset: 0; display: flex; background: var(--player-zap-scrim);` — o token
   `--player-zap-scrim` é novo em `index.css`, derivado de `--bg` com alpha
   (nunca uma cor literal — ADR-007). Sem `blur` (ADR-007 §8: blur/
   transparência custam caro no engine da TV — um scrim de opacidade sólida
   não é a mesma coisa e é aceitável; blur continua fora de cogitação).

## Contrato do lado `LiveScreen` (`tv-web/src/features/live/LiveScreen.tsx`)

Todo o "o que é zapping" vive aqui. `PlayerLayer` nunca sabe o nome de um
canal.

### Estado novo

```
const [zapOpen, setZapOpen] = useState(false)
const lastGoodChannelRef = useRef<CatalogItemOut | null>(null)
```

### Abrir (via `onIdleSelect`)

```
function openZapping() {
  if (!playing) return
  const targetName = groupLabel(playing.original_group)
  const targetCategory = categories.find((c) => groupLabel(c.name) === targetName)
  if (targetCategory && (entered?.kind !== 'category' || entered.id !== targetCategory.id)) {
    setEntered({ kind: 'category', id: targetCategory.id })
  }
  setFocusedIdentity({
    trailKey: targetCategory ? { kind: 'category', name: targetName } : (focusedIdentity.trailKey ?? { kind: 'favorites' }),
    channelId: playing.id,
  })
  setCol(1)
  setZapOpen(true)
}
```

Nota: `CatalogItemOut.original_group` é o campo real disponível (não há id de
categoria no item — mesmo padrão que a trilha já usa via `groupLabel`/
`TrailKey`, comparação por nome normalizado, nunca por id). Se por algum
motivo a categoria não for encontrada (não deveria acontecer — Live TV só
lista canais classificados), o zapping ainda abre, só sem forçar a troca de
categoria — foco cai no canal tocando dentro da categoria em que a trilha já
estava.

### Navegação e seleção dentro do zapping

Extrai as funções que já existem dentro do `useRemoteNav` de hoje (o corpo de
`onDirection`/`onSelect`, exceto a guarda `if (playing) return` que some) para
funções nomeadas, reaproveitadas nos dois lugares (hook normal quando
`!playing`, e `topLayer` quando `playing && zapOpen`):

```
function handleTrailDirection(dir: RemoteDirection) { /* corpo idêntico ao onDirection atual, sem a guarda de playing */ }

function handleTrailSelect() {
  if (col === 0) { enterFocusedTrailItem(); return }
  /* ...ramos já existentes: Favoritos vazia, contentMissing, contentFailed... */
  if (!activeChannel || !activeChannel.playable) { /* ...igual hoje... */ return }

  if (zapOpen) {
    if (activeChannel.id === playing?.id) {
      setZapOpen(false)              // D-007: mesmo canal — só fecha, sem trocar
      return
    }
    lastGoodChannelRef.current = playing   // D-008: guarda ANTES da troca
    setPlaying(activeChannel)              // troca a sessão — topLayer continua aberto
    return
  }

  setPlaying(activeChannel)          // fluxo normal, fora do zapping — inalterado
}
```

RETURN dentro do zapping **não** reaproveita a função de RETURN da tela
normal (que navega col 1→0 antes de sair) — FR-008/cenário 5 da spec: RETURN
com a lista aberta fecha ELA por inteiro, de qualquer coluna:
```
topLayer.onBack = () => setZapOpen(false)
```

### Fechar automaticamente quando a troca terminar

```jsx
<PlayerLayer
  itemId={playing.id}
  title={playing.name}
  onClose={() => setPlaying(null)}
  onIdleSelect={openZapping}
  onEnteredPlaying={() => setZapOpen(false)}
  onSessionError={(message) => {
    const fallback = lastGoodChannelRef.current
    if (!fallback) return   // falha da entrada normal, sem troca de zapping em andamento — deixa o PlayerLayer mostrar sua tela de erro nativa, como hoje
    lastGoodChannelRef.current = null
    setPlaying(fallback)
    showToast(`Não foi possível trocar de canal. Voltando para ${fallback.name}.`)
    // zapOpen permanece true — a pessoa pode tentar outro canal imediatamente (US2, cenário 3)
  }}
  topLayer={zapOpen ? {
    content: renderColumns(),   // mesma JSX de trilha+coluna+preview, extraída (ver abaixo)
    onDirection: handleTrailDirection,
    onSelect: handleTrailSelect,
    onBack: () => setZapOpen(false),
  } : null}
  unavailableMessage="Este canal não tem uma fonte de reprodução disponível."
  genericErrorMessage="Não foi possível reproduzir este canal."
/>
```

### JSX compartilhada

Extrai a JSX das três colunas (`.live-column-groups`, `.live-column-channels`,
`.live-preview-panel` — sem o `<div className="screen screen-row">` que hoje
as envolve) para uma função interna `renderColumns()`, chamada:
- No retorno normal (`!playing`), envolta por `<div className="screen screen-row">{renderColumns()}</div>` — igual a hoje.
- Dentro de `topLayer.content`, envolta por `<div className="player-zap-columns">{renderColumns()}</div>` — classe nova em `screens.css`
  (`position: absolute; inset: 0; padding: 80px 96px; display: flex; flex-direction: row; gap: 40px;` — mesmas métricas de `.screen`+`.screen-row`, reaproveitadas por já serem o valor real usado, não um número novo inventado).

## Resumo dos FR/SC cobertos por este desenho

- FR-001/FR-002/FR-003/FR-004: `onIdleSelect` abre; vídeo nunca para (nenhuma
  sessão é fechada ao abrir, só ao trocar); `openZapping()` foca o canal
  tocando; `handleTrailDirection`/`handleTrailSelect` são literalmente a
  mesma navegação de sempre.
- FR-005/FR-006/SC-001: `topLayer` continua aberto até `onEnteredPlaying`
  disparar — cobre o instante sem vídeo entre fechar a sessão antiga e a
  nova atingir `playing`.
- FR-007: comparação por `id` em `handleTrailSelect`.
- FR-008: `topLayer.onBack` sempre fecha só o zapping.
- FR-009/SC-003: de graça, do `cancelled` já existente no efeito de sessão.
- FR-010/FR-011/FR-012/SC-004: `onSessionError` + `lastGoodChannelRef` +
  `showToast` já existente em `LiveScreen`.
- FR-013: `onIdleSelect`/`topLayer` são opcionais — `MovieDetailScreen`/
  `SeriesDetailScreen` não os passam, zero mudança de comportamento.
