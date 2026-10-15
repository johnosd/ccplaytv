# Lógica: rajada de tecla (key repeat) e prefetch de categoria

Cobre FR-001–FR-006 (US1 / 14a). Stub: `tv-web/src/lib/focus/keyRepeat.ts`.

## 1. O rastreador (`lib/focus/keyRepeat.ts`)

Um único rastreador de módulo, não um hook por tela:

```ts
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
let burst = false
let quietTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function setBurst(next: boolean) { if (burst !== next) { burst = next; listeners.forEach((l) => l()) } }

function onKeyDown(e: KeyboardEvent) {
  if (!ARROWS.has(e.key)) { setBurst(false); return }       // outra tecla encerra a rajada (FR-005)
  if (!e.repeat) { setBurst(false); return }                 // toque isolado: nunca é rajada (FR-006)
  setBurst(true)
  clearTimeout(quietTimer)
  quietTimer = setTimeout(() => setBurst(false), KEY_REPEAT_QUIET_MS) // keyup perdido (FR-005)
}
function onKeyUp(e: KeyboardEvent) { if (ARROWS.has(e.key)) { clearTimeout(quietTimer); setBurst(false) } }
```

- Listeners em **`window`, fase de captura, passivos**, instalados no primeiro `subscribe` e removidos no último. `window` captura antes de `document`: um `Modal` (`useRemoteNav({modal:true})`, captura em `document` + `stopImmediatePropagation`) nunca esconde a tecla do rastreador.
- Também `blur` da janela e `visibilitychange` → `setBurst(false)`.
- `useKeyRepeatBurst()` = `useSyncExternalStore(subscribe, () => burst, () => false)`.
- O rastreador **não consome nem altera** a tecla (sem `preventDefault`/`stopPropagation`): `useRemoteNav` segue dono do teclado (ADR-009 intacta).
- `resetKeyRepeatTracker()` (testes): remove listeners, limpa o timer, `burst = false`.

## 2. O prefetch (`useCategoryFocusPrefetch`, `features/catalog/catalogApi.ts`)

Assinatura **inalterada** (vários testes de tela mockam este hook inteiro; não pode ganhar parâmetro obrigatório).

```ts
const fast = useKeyRepeatBurst()
useEffect(() => {
  if (!sourceId || !focusedCategory) return
  if (focusedCategory.id === enteredCategoryId) return
  if (fast) return                       // NOVO: rajada em curso — nada agendado, e o cleanup do render anterior já cancelou o timer
  const timer = setTimeout(/* igual a hoje */, CATEGORY_PREFETCH_DEBOUNCE_MS)
  return () => clearTimeout(timer)
}, [sourceId, focusedCategory, enteredCategoryId, queryClient, fast])
```

- `fast` na lista de dependências: ao virar `true`, o cleanup cancela o timer pendente; ao voltar a `false`, o efeito rearma o debounce de 300 ms para a categoria em que o foco parou.
- Tempo total após uma rajada: soltar (ou 300 ms de silêncio) + 300 ms de debounce. **Nenhum delay novo** além do silêncio que já define "estabilizou" (FR-003).
- **Não** aborta nada em andamento ao entrar em rajada (FR-004): o `AbortController` só é consultado dentro do timer, como hoje, e a busca da categoria entrada continua protegida pela exceção existente.
- `usePrefetchHint` (feature 038) não muda: só reordena a fila local da pré-carga, não gera consulta.

## 3. Pontos que o executor erraria

- Primeiro `keydown` de uma sequência sempre tem `repeat: false` — o intervalo até o primeiro repeat numa TV costuma ser ~500 ms, maior que o debounce: **um** prefetch da categoria do primeiro passo pode disparar legitimamente (foco parou 300 ms). É o comportamento atual de um toque isolado; não "consertar".
- Não colocar o estado de rajada dentro de `useRemoteNav` (muda 30+ telas e o `handlersRef`); o rastreador é paralelo e só leitura.
- Não ler `fast` em Live/Filmes/Séries: só o hook de prefetch o consome. As três telas ganham o comportamento de graça porque as três já chamam `useCategoryFocusPrefetch`.
- Em teste, `setupTests.ts` deve chamar `resetKeyRepeatTracker()` num `afterEach` global, para um `keydown` com `repeat` de um teste não vazar para o seguinte.
