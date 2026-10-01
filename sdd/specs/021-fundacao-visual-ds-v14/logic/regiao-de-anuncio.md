# Lógica: região de anúncio única e toast sem duplicação (D-004)

## O problema que esta lógica resolve

Leitores de tela (Voice Guide no Tizen, NVDA/ChromeVox no navegador) só
anunciam com confiabilidade uma **mudança de conteúdo dentro de uma região
viva que já existia** no DOM. Hoje o `Toast` é montado junto com o texto,
já dentro de um `role="status"` novo, a cada exibição. Por isso o anúncio é
instável, e um texto repetido nem muda o DOM.

A solução óbvia (uma região `sr-only` separada que recebe uma cópia do
texto) **quebra FR-027**. O texto passaria a existir duas vezes no
documento, e então:

- `screen.getByText('Adicionado aos favoritos')` lança "multiple elements"
  em 6 suítes de tela (`LiveScreen.favorites`, `MoviesScreen.favorites`,
  `SeriesScreen.favorites`, `LiveScreen`, `MovieDetailScreen`,
  `PlayerLayer`);
- `page.getByText(...).isVisible()` viola o modo estrito do Playwright em
  `e2e/favoritos.mjs`.

## A regra

**O texto visível é o anúncio.** O toast é renderizado dentro da região
viva persistente, e nunca existe cópia.

```text
<div class="stage">
  <AnnouncerRegion>                      ← contexto = elemento da região
    <App/>                               ← telas usam <Toast/> normalmente
    <div class="announcer-region"        ← persistente, montado 1 vez
         role="status" aria-live="polite">
      [portal do Toast aqui]             ← <div class="toast" key={messageKey}>texto</div>, SEM role
      <span class="sr-only">…</span>     ← slot do useAnnounce() (mensagens sem texto visível)
    </div>
  </AnnouncerRegion>
</div>
```

### `AnnouncerRegion` (`src/components/AnnouncerRegion.tsx`)

- Renderiza `children` e, **como irmão depois deles**, o `div` da região.
- Guarda o elemento da região em estado via callback ref e o fornece em
  `AnnouncerContext`. No primeiro render o valor é `null`, e o toast não
  existe nesse instante, então não há problema.
- A região **não** é `sr-only`: ela hospeda o toast visível. Por isso é um
  contêiner sem tamanho e sem recorte:

  ```css
  position: fixed; top: 0; left: 0; width: 0; height: 0;
  overflow: visible; z-index: var(--z-overlay);
  ```

  O `.toast` continua com o próprio `position: fixed` de `screens.css`,
  então a aparência não muda.
- `aria-atomic` fica no padrão (`false`): só o nó novo é lido, nunca o slot
  `sr-only` junto.

### `Toast` (`src/components/Toast.tsx`)

```ts
const region = useContext(AnnouncerContext)
if (!message) return null
if (!region) return <div className="toast" role="status">{message}</div>   // igual a hoje
return createPortal(<div className="toast" key={messageKey}>{message}</div>, region)
```

- Sem região: **byte a byte o comportamento atual**. É o que mantém as
  suítes de tela, que renderizam a tela sem `main.tsx`, intactas.
- Com região: **sem `role`**. Uma região viva aninhada dentro de outra é
  lida de forma imprevisível, e o contrato C4 proíbe isso.
- `key={messageKey}` remonta o nó quando o mesmo texto é reexibido: o nó
  novo inserido na região é o que dispara o anúncio de novo (FR-024).

### `useToast` (`src/lib/useToast.ts`)

- `toastKey` incrementa a **cada** chamada de `showToast`, inclusive com o
  mesmo texto (`useState` com um contador).
- Todo o resto fica como está: duração de 1600 ms, timer reiniciado a cada
  chamada.

### `useAnnounce` (`src/lib/announcer.ts`)

Para mensagens que **não** aparecem como texto na tela. É uso futuro das
ondas seguintes (erro acionável, canal confirmado).

```ts
const region = useContext(AnnouncerContext)
return useCallback((message) => {
  const slot = region?.querySelector('.sr-only')
  if (!slot) return                  // sem região: no-op, nunca lança
  slot.textContent = ''              // limpa…
  setTimeout(() => { slot.textContent = message }, 20)   // …e grava: repetição volta a anunciar
}, [region])
```

- Nunca chama `focus()`. Nunca é usado para um texto que já está visível
  (seria duplicação: usar `Toast`).

## O que NÃO fazer

- Não criar a região de forma preguiçosa com `document.body.appendChild`
  dentro de `announce`. Nos testes de tela ela apareceria em
  `document.body` e duplicaria textos.
- Não colocar a região fora do `Stage`. O toast portado precisa escalar
  junto com o palco.
- Não dar `role="status"` ao toast portado nem `aria-live` a nenhum
  descendente da região.
- Não trocar `getByText` por outra consulta nos testes existentes para
  contornar duplicação. FR-027 proíbe editar asserções, e a regra acima
  torna isso desnecessário.
