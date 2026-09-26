# Lógica: gesto de OK curto × OK demorado (`useRemoteNav`)

Referenciado por: plan.md D-001/D-002, tasks.md T003–T004.

## Problema

Hoje `useRemoteNav` age no `keydown` do OK. Para distinguir "apertar" de
"segurar" é preciso esperar: o OK curto só pode ser decidido **ao soltar**
(`keyup`) ou ao passar do limiar. O controle da TV, ao segurar, entrega
**vários `keydown`** (auto-repetição) antes de um único `keyup`, e nem todo
motor marca `event.repeat` de forma confiável.

## Contrato

```ts
export interface RemoteNavHandlers {
  onDirection?: (direction: RemoteDirection) => void
  onSelect?: () => void
  /**
   * Opcional. Quando definido NO MOMENTO do primeiro keydown do OK, o
   * pressionamento vira um gesto: OK curto chama `onSelect` ao soltar;
   * segurar além do limiar chama `onLongSelect` uma única vez e o soltar
   * não faz mais nada. Quando indefinido, o OK age no keydown, como antes.
   */
  onLongSelect?: () => void
  onBack?: () => void
}

export interface RemoteNavOptions {
  modal?: boolean
  /** Limiar do gesto demorado. Padrão: LONG_SELECT_MS (800). */
  longSelectMs?: number
}

export const LONG_SELECT_MS = 800
/** Um keydown de OK mais afastado que isto do anterior é um pressionamento NOVO (keyup perdido). */
export const STALE_PRESS_MS = 1000
```

## Algoritmo (um estado por instância do hook, em `useRef`)

```
press = null  // { startedAt, lastEventAt, longFired, timer }

keydown(OK):
  if press != null and now - press.lastEventAt < STALE_PRESS_MS:
      press.lastEventAt = now; preventDefault; return      // auto-repetição
  if press != null: cancel(press)                           // keyup perdido: descarta sem agir
  if !handlers.onSelect: return                             // guarda existente (telas de foco DOM nativo)
  preventDefault; if modal: stopImmediatePropagation
  if !handlers.onLongSelect:
      handlers.onSelect(); return                           // modo legado, inalterado
  press = { startedAt: now, lastEventAt: now, longFired: false,
            timer: setTimeout(() => { press.longFired = true; handlers.onLongSelect?.() }, longSelectMs) }

keyup(OK):
  if press == null: return                                  // keyup de um keydown tratado por outra tela
  preventDefault
  clearTimeout(press.timer)
  fire = !press.longFired
  press = null
  if fire: handlers.onSelect?.()

window blur / document visibilitychange(hidden) / unmount:
  if press: clearTimeout; press = null                      // nunca age em cima de gesto interrompido
```

Regras que o algoritmo garante (FR-001..FR-004 da spec):

- Um pressionamento executa **exatamente uma** ação: `onSelect` (soltou
  antes do limiar) **ou** `onLongSelect` (passou do limiar) — nunca as duas,
  nunca `onLongSelect` duas vezes.
- O modo (legado × gesto) é decidido no primeiro `keydown` e não muda
  durante o pressionamento — a tela pode passar `onLongSelect` só quando o
  foco está num item favoritável; na trilha de categorias ele fica
  indefinido e o OK segue imediato (FR-004).
- `keyup` sem pressionamento ativo é ignorado: a tela de detalhe que trata
  o OK no `keydown` e fecha de volta para a grade não dispara um OK curto
  "fantasma" na grade.
- `handlersRef` é lido **no disparo** (timer/keyup), não capturado no
  keydown — igual ao resto do hook.
- Setas e RETURN continuam no `keydown`, sem mudança.

## Testes (vitest + fake timers, `useRemoteNav.test.tsx`)

1. Sem `onLongSelect`: OK no keydown chama `onSelect` imediatamente (regressão).
2. Com `onLongSelect`: keydown → keyup antes de 800 ms → só `onSelect`, no keyup.
3. keydown → avança 800 ms → `onLongSelect` 1×; keyup → nada.
4. keydown + 20 keydowns repetidos a cada 50 ms + keyup → exatamente uma ação.
5. keydown, sem keyup, novo keydown 1,5 s depois → primeiro gesto descartado, novo gesto começa.
6. `blur` durante o gesto → nenhuma ação.
7. keyup sem keydown prévio → nada.
8. `onLongSelect` presente no keydown e removido antes do keyup → keyup ainda decide pelo gesto (modo travado).
9. `modal: true` continua interceptando keydown **e** keyup na captura.
